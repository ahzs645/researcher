// Browser-only glue for the document importer: read a dropped File and, for a
// .docx, unzip `word/document.xml` with the platform's native
// `DecompressionStream` — so no zip dependency ships to the static site. The
// heavy lifting (WordML/Markdown → sections) lives in the pure, unit-tested
// `manuscriptDocImport.ts`; this file only does I/O the tests can't.

import {
  parseMarkdownDocument,
  parseWordMlToMarkdownBlocks,
  parseWordStyleDefinitions,
  parseWordDocument,
  parseWordDocumentFromBlocks,
  type ImportedDocument,
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
): Promise<ImportedWordSource> => {
  const documentXml = await extractDocxDocumentXml(buffer);
  const [stylesXml, relationshipsXml] = await Promise.all([
    readOptionalXmlEntry(buffer, 'word/styles.xml'),
    readOptionalXmlEntry(buffer, 'word/_rels/document.xml.rels'),
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
): Promise<ImportedDocument> => {
  const source = await readImportedWordSource(buffer);
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

// Read a user-picked file into an `ImportedDocument`. Supports .docx (real Word
// files), .md/.markdown and .txt (treated as Markdown/plain text).
export const readImportedDocumentFile = async (
  file: File,
): Promise<ImportedDocument> => {
  const extension = fileExtension(file.name);
  if (extension === 'zip') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const portablePackage = readPortableResearchPaperZip(bytes);
    return {
      title: portablePackage.metadata.title,
      authorLine: portablePackage.metadata.authorLine,
      affiliations: portablePackage.metadata.affiliations,
      correspondingAuthor: portablePackage.metadata.correspondingAuthor,
      sections: portablePackage.sections.map((section) => ({
        name: section.name,
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
    };
  }
  if (extension === 'docx') {
    return readImportedWordDocument(await file.arrayBuffer(), file.name);
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
  if (extension === 'zip') {
    return { kind: 'portable', document: await readImportedDocumentFile(file) };
  }
  if (extension === 'docx') {
    const source = await readImportedWordSource(await file.arrayBuffer());
    const wordBlocks = parseWordMlToMarkdownBlocks(
      source.documentXml,
      source.options,
    );
    const sourceInfo = sourceInfoFromDocument({
      ...addTiffWarning(
        parseWordDocumentFromBlocks(source.documentXml, wordBlocks),
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

export const ACCEPTED_IMPORT_EXTENSIONS = '.docx,.pdf,.md,.markdown,.txt';
export const ACCEPTED_MANUSCRIPT_IMPORT_EXTENSIONS = `${ACCEPTED_IMPORT_EXTENSIONS},.zip`;
