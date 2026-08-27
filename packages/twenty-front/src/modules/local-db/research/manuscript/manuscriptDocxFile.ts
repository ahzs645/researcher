// Browser-only glue for the document importer: read a dropped File and, for a
// .docx, unzip `word/document.xml` with the platform's native
// `DecompressionStream` — a flat lookup of entries whose names are fixed by the
// OOXML spec, which needs no zip library at all. A JATS package is the opposite
// problem: nothing about it is fixed, so it is read with `fflate`, which the
// portable-package reader next door already pulls in. The heavy lifting
// (WordML/Markdown → sections, JATS → manifest) lives in the pure, unit-tested
// modules; this file only does I/O the tests can't.

import { isNonEmptyString } from '@sniptt/guards';
import { unzipSync } from 'fflate';

import {
  parseMarkdownDocument,
  parseWordMlToMarkdownBlocks,
  parseWordStyleDefinitions,
  parseWordDocument,
  parseWordDocumentFromBlocks,
  type ImportedDocument,
  type TrackedChangeResolution,
  type WordImportOptions,
} from './manuscriptDocImport';
import {
  deriveImportBlocks,
  deriveImportBlocksFromMarkdown,
  type ImportBlock,
  type ImportedSourceInfo,
} from './manuscriptImportBlocks';
import { extractPdfText } from './manuscriptPdfFile';
import { isManuscriptDocxStylesXml } from './manuscriptDocxTemplate';
import {
  parseJatsArticle,
  type JatsArtworkAssets,
} from './manuscriptJatsImport';
import {
  buildPortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_FILENAME,
  type PortableManuscriptSource,
  type PortableResearchPaperManifest,
} from './manuscriptPortableManifest';
import { readPortableResearchPaperZip } from './manuscriptPortableZip';
import { tiffToPngDataUrl } from './manuscriptTiff';

export { type ImportedSourceInfo } from './manuscriptImportBlocks';

export type ImportedDocumentSource =
  | { kind: 'portable'; document: ImportedDocument }
  | {
      kind: 'blocks';
      blocks: ImportBlock[];
      sourceInfo: ImportedSourceInfo;
      sourceName: string;
    };

const td = new TextDecoder('utf-8');

const u32 = (view: DataView, offset: number): number =>
  view.getUint32(offset, true);
const u16 = (view: DataView, offset: number): number =>
  view.getUint16(offset, true);

// Inflate a raw DEFLATE stream (zip method 8) using the native API.
const inflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Response(
    new Blob([new Uint8Array(bytes).buffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw')),
  );
  return new Uint8Array(await stream.arrayBuffer());
};

// Minimal ZIP reader: find one named entry via the central directory, then read
// and (if needed) inflate its bytes from the local file header. Enough for the
// flat, single-file lookup a .docx needs — not a general-purpose unzip.
const readZipEntry = async (
  buffer: ArrayBuffer,
  entryName: string,
): Promise<Uint8Array | null> => {
  const view = new DataView(buffer);
  const length = view.byteLength;

  // Locate the End Of Central Directory record (signature 0x06054b50),
  // scanning back from the end past any trailing comment.
  let eocd = -1;
  for (let offset = length - 22; offset >= 0; offset -= 1) {
    if (u32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = u16(view, eocd + 10);
  let pointer = u32(view, eocd + 16); // central directory start

  for (let index = 0; index < entryCount; index += 1) {
    if (u32(view, pointer) !== 0x02014b50) break; // central file header sig
    const method = u16(view, pointer + 10);
    const compressedSize = u32(view, pointer + 20);
    const nameLength = u16(view, pointer + 28);
    const extraLength = u16(view, pointer + 30);
    const commentLength = u16(view, pointer + 32);
    const localOffset = u32(view, pointer + 42);
    const name = td.decode(new Uint8Array(buffer, pointer + 46, nameLength));

    if (name === entryName) {
      // Re-read the lengths from the *local* header — its name/extra fields can
      // differ in size from the central directory entry.
      const localNameLength = u16(view, localOffset + 26);
      const localExtraLength = u16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const raw = new Uint8Array(buffer, dataStart, compressedSize);
      return method === 0 ? raw : inflateRaw(raw);
    }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return null;
};

export const extractDocxDocumentXml = async (
  buffer: ArrayBuffer,
): Promise<string> => {
  const entry = await readZipEntry(buffer, 'word/document.xml');
  if (entry === null) {
    throw new Error('Not a valid .docx (no word/document.xml)');
  }
  return td.decode(entry);
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
};

const relationshipTargets = (
  relationshipsXml: string,
): Record<string, string> =>
  Object.fromEntries(
    [
      ...relationshipsXml.matchAll(
        /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g,
      ),
    ].map((match) => [match[1], match[2]]),
  );

const imageAltText = (documentXml: string, relationshipId: string): string => {
  const paragraph = new RegExp(
    `<w:p\\b[\\s\\S]*?<a:blip\\b[^>]*r:embed="${relationshipId}"[\\s\\S]*?<\\/w:p>`,
  ).exec(documentXml)?.[0];
  if (paragraph === undefined) return 'Imported figure';
  const description = /<wp:docPr\b[^>]*\bdescr="([^"]*)"/.exec(paragraph)?.[1];
  const name = /<wp:docPr\b[^>]*\bname="([^"]*)"/.exec(paragraph)?.[1];
  return description?.trim() || name?.trim() || 'Imported figure';
};

const loadDocxImages = async (
  buffer: ArrayBuffer,
  documentXml: string,
  relationshipsXml: string,
): Promise<Record<string, { dataUrl: string; altText: string }>> => {
  const images: Record<string, { dataUrl: string; altText: string }> = {};

  for (const [relationshipId, target] of Object.entries(
    relationshipTargets(relationshipsXml),
  )) {
    if (!target.startsWith('media/')) continue;
    const bytes = await readZipEntry(buffer, `word/${target}`);
    if (bytes === null) continue;
    const extension = target.slice(target.lastIndexOf('.') + 1).toLowerCase();
    const mimeType = IMAGE_MIME_BY_EXTENSION[extension];
    if (mimeType === undefined) continue;
    // Word writes TIFF whenever the author pasted one, and nothing in a browser
    // paints it. Re-encode to PNG here so the figure survives the import as a
    // picture rather than as a data URL with no renderer.
    const png =
      mimeType === 'image/tiff' ? await tiffToPngDataUrl(bytes) : null;
    images[relationshipId] = {
      dataUrl: png ?? `data:${mimeType};base64,${bytesToBase64(bytes)}`,
      altText: imageAltText(documentXml, relationshipId),
    };
  }

  return images;
};

const readOptionalXmlEntry = async (
  buffer: ArrayBuffer,
  entryName: string,
): Promise<string> => {
  const entry = await readZipEntry(buffer, entryName);
  return entry === null ? '' : td.decode(entry);
};

type ImportedWordSource = {
  documentXml: string;
  stylesXml: string;
  options: WordImportOptions;
  hasTiff: boolean;
};

const readImportedWordSource = async (
  buffer: ArrayBuffer,
  trackedChanges: TrackedChangeResolution = 'ACCEPT',
): Promise<ImportedWordSource> => {
  const documentXml = await extractDocxDocumentXml(buffer);
  const [stylesXml, relationshipsXml, commentsXml, footnotesXml, endnotesXml] =
    await Promise.all([
      readOptionalXmlEntry(buffer, 'word/styles.xml'),
      readOptionalXmlEntry(buffer, 'word/_rels/document.xml.rels'),
      // A reviewer's comments live in their own package entry: the body carries
      // only the anchors. Reading it here — rather than only in the wizard's own
      // reader — is what stops this path counting comments it cannot quote.
      readOptionalXmlEntry(buffer, 'word/comments.xml'),
      // Same story, and the one that was costing the most: a footnote's text is
      // only ever in these two parts. The body has the anchor and nothing else,
      // so a reader that never opened them dropped every note in the paper.
      readOptionalXmlEntry(buffer, 'word/footnotes.xml'),
      readOptionalXmlEntry(buffer, 'word/endnotes.xml'),
    ]);
  const imageByRelationshipId = await loadDocxImages(
    buffer,
    documentXml,
    relationshipsXml,
  );
  return {
    documentXml,
    stylesXml,
    options: {
      styles: parseWordStyleDefinitions(stylesXml),
      imageByRelationshipId,
      trackedChanges,
      ...(commentsXml.length > 0 ? { commentsXml } : {}),
      ...(footnotesXml.length > 0 ? { footnotesXml } : {}),
      ...(endnotesXml.length > 0 ? { endnotesXml } : {}),
    },
    hasTiff: Object.values(imageByRelationshipId).some((image) =>
      image.dataUrl.startsWith('data:image/tiff'),
    ),
  };
};

const TIFF_WARNING =
  'A TIFF figure could not be converted, so it was preserved as-is. Browsers cannot preview TIFF — replace it with PNG before final export.';

const addTiffWarning = (
  document: ImportedDocument,
  hasTiff: boolean,
): ImportedDocument =>
  hasTiff
    ? {
        ...document,
        warnings: [...(document.warnings ?? []), TIFF_WARNING],
      }
    : document;

// The source's own styles are worth carrying only when they are a real Word
// style table small enough to store with the manuscript.
const sourceStyleFields = (
  stylesXml: string,
  fileName: string,
): Pick<ImportedDocument, 'sourceStylesXml' | 'sourceDocumentName'> =>
  isManuscriptDocxStylesXml(stylesXml)
    ? { sourceStylesXml: stylesXml, sourceDocumentName: fileName }
    : {};

const sourceInfoFromDocument = (
  document: ImportedDocument,
): ImportedSourceInfo => ({
  ...(document.title !== undefined ? { title: document.title } : {}),
  ...(document.authorLine !== undefined
    ? { authorLine: document.authorLine }
    : {}),
  ...(document.affiliations !== undefined
    ? { affiliations: document.affiliations }
    : {}),
  ...(document.correspondingAuthor !== undefined
    ? { correspondingAuthor: document.correspondingAuthor }
    : {}),
  ...(document.titlePageExtraLines !== undefined
    ? { titlePageExtraLines: document.titlePageExtraLines }
    : {}),
  ...(document.warnings !== undefined ? { warnings: document.warnings } : {}),
  ...(document.stats !== undefined ? { stats: document.stats } : {}),
  ...(document.sourceStylesXml !== undefined
    ? { sourceStylesXml: document.sourceStylesXml }
    : {}),
  ...(document.sourceDocumentName !== undefined
    ? { sourceDocumentName: document.sourceDocumentName }
    : {}),
});

export const readImportedWordDocument = async (
  buffer: ArrayBuffer,
  fileName = 'the imported document',
  // ACCEPT is what every caller of this reader got before the choice existed,
  // and the only answer a document with no revisions can have.
  trackedChanges: TrackedChangeResolution = 'ACCEPT',
): Promise<ImportedDocument> => {
  const source = await readImportedWordSource(buffer, trackedChanges);
  return {
    ...addTiffWarning(
      parseWordDocument(source.documentXml, source.options),
      source.hasTiff,
    ),
    ...sourceStyleFields(source.stylesXml, fileName),
  };
};

const fileExtension = (name: string): string =>
  name.slice(name.lastIndexOf('.') + 1).toLowerCase();

// One manifest, whether it arrived as a package this app wrote or was read
// out of somebody's JATS. Everything downstream — sections, assets,
// references, contributors, cross-reference links — is the restore path that
// already exists, so JATS needed no importer of its own.
const importedDocumentFromManifest = (
  portablePackage: PortableResearchPaperManifest,
  sourceKind: 'PACKAGE' | 'JATS',
  warnings: string[] = [],
): ImportedDocument => ({
  title: portablePackage.metadata.title,
  authorLine: portablePackage.metadata.authorLine,
  affiliations: portablePackage.metadata.affiliations,
  correspondingAuthor: portablePackage.metadata.correspondingAuthor,
  sections: portablePackage.sections.map((section) => ({
    name: section.name,
    ...(section.refKey === undefined ? {} : { refKey: section.refKey }),
    sectionType: section.sectionType,
    placement: section.placement,
    content: section.content,
    orderIndex: section.orderIndex,
    level: section.level ?? 1,
    wordCount: section.wordCount,
    includeInExport: section.includeInExport,
    status: section.status,
    ...(section.wordLimit !== undefined
      ? { wordLimit: section.wordLimit }
      : {}),
    // A package's notes come back whole, so the co-author comments in them —
    // and whatever the author answered — are restored rather than re-derived.
    ...(section.notes === undefined ? {} : { notes: section.notes }),
  })),
  stats: {
    equationCount: portablePackage.sections.reduce(
      (count, section) =>
        count + (section.content.match(/\$\$[\s\S]*?\$\$/g) ?? []).length,
      0,
    ),
    embeddedImageCount: portablePackage.figures.filter(
      (figure) => figure.imageUrl !== undefined,
    ).length,
    tableCount: portablePackage.figures.filter(
      (figure) => figure.assetKind === 'TABLE',
    ).length,
  },
  portablePackage,
  portableSourceKind: sourceKind,
  ...(warnings.length > 0 ? { warnings } : {}),
});

// The manifest builder moves a data-URL figure out to an `imagePath`, because
// a package written to disk keeps its pixels in files beside the manifest.
// Nothing has been written here — this manifest goes straight to the review
// step — so that path would point at a file that never existed and the artwork
// would disappear between the package and the composer. Put the data URL back
// where the restore actually reads it.
const jatsManifestFrom = (
  source: PortableManuscriptSource,
): PortableResearchPaperManifest => {
  const manifest = buildPortableResearchPaperManifest(source, {}, {});
  return {
    ...manifest,
    // The manifest's figures are the source's figures in order, so the index
    // is the one way back that cannot be confused by a re-keyed refKey.
    figures: manifest.figures.map((figure, index) => {
      const imageUrl = source.figures[index]?.imageUrl;
      if (figure.imagePath === undefined || !isNonEmptyString(imageUrl))
        return figure;
      const { imagePath: _imagePath, ...withoutPath } = figure;
      return { ...withoutPath, imageUrl };
    }),
  };
};

// ── JATS packages ───────────────────────────────────────────────────────────
// A JATS article is not usually a file, it is a package: the article XML with
// its artwork in the same zip. Reading only the XML — which is all the .xml
// path can do — throws away every figure the author submitted. Here the pixels
// are right there, so they come in with the prose.

// Inlining artwork as base64 is what carries a figure into IndexedDB, and it
// is also what can fill it: this app keeps everything in the browser, and
// base64 costs a third again on top of the bytes. Journals ask for 300 dpi
// TIFFs, which run to tens of megabytes each, so a single print rendition can
// outweigh the entire manuscript. 10 MB is an order of magnitude above a
// normal figure and still an order below the point where the import would
// wedge the database; 40 MB for the package as a whole keeps a gallery of
// merely-large figures from adding up to the same failure. Anything over
// either line is skipped and said out loud — the figure still arrives with
// its caption, waiting for a picture the author can attach by hand.
const MAX_PACKAGE_IMAGE_BYTES = 10_000_000;
const MAX_PACKAGE_ARTWORK_BYTES = 40_000_000;

const imageMimeType = (path: string): string | undefined =>
  IMAGE_MIME_BY_EXTENSION[fileExtension(path)];

const oversizedArtworkWarning = (names: string[]): string =>
  `Artwork too large to store in the browser was left out of this import: ${names.join(', ')}. Those figures arrived with their captions — add the picture by hand, or shrink the files and import again.`;

// A JATS package names its article whatever it likes — `manuscript.xml`, the
// DOI with the dots still in it, `main.xml` under `content/` — while shipping
// other XML beside it (a manifest, MathML, a transform). Trusting a filename
// would fail on half of what publishers actually send, so read each XML entry
// and look at its root element instead: `<article` is the one thing every JATS
// document has and nothing else in the package does.
const JATS_ARTICLE_ROOT = /<article[\s>]/;

type JatsPackage = {
  articleXml: string;
  artwork: JatsArtworkAssets;
  warnings: string[];
};

const readJatsPackage = async (
  bytes: Uint8Array,
): Promise<JatsPackage | null> => {
  const skipped: string[] = [];
  const entries = unzipSync(bytes, {
    // Refusing an oversized image in the filter means fflate never inflates
    // it: the memory the cap exists to protect is never allocated at all.
    filter: (entry) => {
      const oversized =
        imageMimeType(entry.name) !== undefined &&
        entry.originalSize > MAX_PACKAGE_IMAGE_BYTES;
      if (oversized) skipped.push(entry.name);
      return !oversized;
    },
  });

  const articles = Object.entries(entries)
    .filter(([name]) => fileExtension(name) === 'xml')
    .map(([name, entryBytes]) => ({ name, xml: td.decode(entryBytes) }))
    .filter(({ xml }) => JATS_ARTICLE_ROOT.test(xml))
    // The shallowest wins: a package that carries a second article carries it
    // as a companion (a correction, a translation, a supplement's own XML),
    // and the one at the top is the one the package is about.
    .sort(
      (left, right) =>
        left.name.split('/').length - right.name.split('/').length ||
        left.name.localeCompare(right.name),
    );
  const article = articles[0];
  if (article === undefined) return null;

  const warnings =
    articles.length > 1
      ? [
          `This package holds ${articles.length} JATS articles; ${article.name} was imported and the rest were left alone.`,
        ]
      : [];

  const artwork: JatsArtworkAssets = {};
  let remaining = MAX_PACKAGE_ARTWORK_BYTES;
  for (const [name, entryBytes] of Object.entries(entries)) {
    const mimeType = imageMimeType(name);
    if (mimeType === undefined) continue;
    if (entryBytes.length > remaining) {
      skipped.push(name);
      continue;
    }
    remaining -= entryBytes.length;
    // Publishers ship print artwork as TIFF and no browser paints one, so it
    // is re-encoded here exactly as the .docx path does — the figure survives
    // as a picture rather than as a data URL with no renderer.
    const png =
      mimeType === 'image/tiff' ? await tiffToPngDataUrl(entryBytes) : null;
    artwork[name] =
      png ?? `data:${mimeType};base64,${bytesToBase64(entryBytes)}`;
  }

  return {
    articleXml: article.xml,
    artwork,
    warnings: [
      ...warnings,
      ...(skipped.length > 0 ? [oversizedArtworkWarning(skipped)] : []),
      ...(Object.values(artwork).some((dataUrl) =>
        dataUrl.startsWith('data:image/tiff'),
      )
        ? [TIFF_WARNING]
        : []),
    ],
  };
};

// One extension, two formats with nothing to do with each other: the package
// this app exports, and the package a publisher ships. The manifest is the
// tell — a zip carrying `research-paper.json` is ours — and reading only that
// entry to find out costs nothing, where unzipping the whole thing to ask
// would inflate a publisher's artwork twice.
const isPortableResearchPaperZip = (bytes: Uint8Array): boolean =>
  Object.keys(
    unzipSync(bytes, {
      filter: (entry) => entry.name === PORTABLE_MANUSCRIPT_FILENAME,
    }),
  ).length > 0;

const readImportedZip = async (
  bytes: Uint8Array,
): Promise<ImportedDocument> => {
  if (isPortableResearchPaperZip(bytes)) {
    return importedDocumentFromManifest(
      readPortableResearchPaperZip(bytes),
      'PACKAGE',
    );
  }
  const jatsPackage = await readJatsPackage(bytes);
  if (jatsPackage === null) {
    throw new Error(
      `This ZIP is neither a research package (no ${PORTABLE_MANUSCRIPT_FILENAME}) nor a JATS package (no XML file inside it has an <article> root)`,
    );
  }
  return importedDocumentFromManifest(
    jatsManifestFrom(
      parseJatsArticle(jatsPackage.articleXml, jatsPackage.artwork),
    ),
    'JATS',
    jatsPackage.warnings,
  );
};

const readJatsManifest = async (
  file: File,
): Promise<PortableResearchPaperManifest> =>
  jatsManifestFrom(parseJatsArticle(await file.text()));

// Read a user-picked file into an `ImportedDocument`. Supports .docx (real Word
// files), .md/.markdown and .txt (treated as Markdown/plain text), .pdf,
// .xml/.jats (a lone JATS article) and .zip — either this app's own research
// package or a publisher's JATS package, artwork and all.
export const readImportedDocumentFile = async (
  file: File,
  trackedChanges: TrackedChangeResolution = 'ACCEPT',
): Promise<ImportedDocument> => {
  const extension = fileExtension(file.name);
  if (extension === 'xml' || extension === 'jats') {
    return importedDocumentFromManifest(await readJatsManifest(file), 'JATS');
  }
  if (extension === 'zip') {
    return readImportedZip(new Uint8Array(await file.arrayBuffer()));
  }
  if (extension === 'docx') {
    return readImportedWordDocument(
      await file.arrayBuffer(),
      file.name,
      trackedChanges,
    );
  }
  if (extension === 'pdf') {
    // Best-effort: PDFs carry no headings, so this usually yields one section.
    return parseMarkdownDocument(
      await extractPdfText(await file.arrayBuffer()),
    );
  }
  return parseMarkdownDocument(await file.text());
};

export const readImportedDocumentSource = async (
  file: File,
): Promise<ImportedDocumentSource> => {
  const extension = fileExtension(file.name);
  // Structured sources — our own package, a publisher's JATS package, a lone
  // article — go through the one reader above, so the wizard sees the same
  // document, the same figures and the same warnings as the direct import.
  if (extension === 'zip' || extension === 'xml' || extension === 'jats') {
    return { kind: 'portable', document: await readImportedDocumentFile(file) };
  }
  if (extension === 'docx') {
    const source = await readImportedWordSource(await file.arrayBuffer());
    const wordBlocks = parseWordMlToMarkdownBlocks(
      source.documentXml,
      source.options,
    );
    const sourceInfo = sourceInfoFromDocument({
      // The same options the blocks were read with, so the counts this step
      // shows are the counts the other entry point reports for the same file.
      ...addTiffWarning(
        parseWordDocumentFromBlocks(
          source.documentXml,
          wordBlocks,
          source.options,
        ),
        source.hasTiff,
      ),
      ...sourceStyleFields(source.stylesXml, file.name),
    });
    return {
      kind: 'blocks',
      blocks: deriveImportBlocks(wordBlocks),
      sourceInfo,
      sourceName: file.name,
    };
  }

  const markdown =
    extension === 'pdf'
      ? await extractPdfText(await file.arrayBuffer())
      : await file.text();
  return {
    kind: 'blocks',
    blocks: deriveImportBlocksFromMarkdown(markdown),
    sourceInfo: sourceInfoFromDocument(parseMarkdownDocument(markdown)),
    sourceName: file.name,
  };
};

export const ACCEPTED_IMPORT_EXTENSIONS =
  '.docx,.pdf,.md,.markdown,.txt,.xml,.jats';
export const ACCEPTED_MANUSCRIPT_IMPORT_EXTENSIONS = `${ACCEPTED_IMPORT_EXTENSIONS},.zip`;
