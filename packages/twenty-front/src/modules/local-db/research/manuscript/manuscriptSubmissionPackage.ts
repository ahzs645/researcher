import { isNonEmptyString } from '@sniptt/guards';
import { strToU8, zip } from 'fflate';

import { type ManuscriptBundle, slugifyTitle } from './manuscriptAssembly';
import {
  exportManuscriptToDocxBlob,
  exportStandaloneMarkdownToDocxBlob,
} from './manuscriptDocxExport';
import {
  isHttpUrl,
  isImageDataUrl,
  resolveFigureImage,
} from './manuscriptImages';
import { prepareManuscriptDiagramImages } from './manuscriptDiagram';
import { buildJatsArticle } from './manuscriptJatsExport';
import { isFigurePanel } from './manuscriptNumbering';
import { type PortableManuscriptSource } from './manuscriptPortableManifest';
import { addPortableResearchPaperFiles } from './manuscriptPortableZip';
import {
  runManuscriptScreening,
  type ScreeningFinding,
  type ScreeningRun,
} from './manuscriptScreening';
import {
  buildScreeningReport,
  screeningSubmissionChecks,
} from './manuscriptScreeningChecks';
import {
  buildSubmissionManifest,
  type SubmissionCheck,
  type SubmissionMaterials,
  type SubmissionReadiness,
  validateSubmission,
} from './manuscriptSubmission';
import {
  CANONICAL_REQUIREMENT_FIELDS,
  parseManuscriptSubmissionExtras,
  submissionJournalKey,
} from './manuscriptSubmissionRequirements';
import { type NumberedFigure } from './manuscriptTypes';

type Zippable = Record<string, Uint8Array>;

export type SubmissionPackage = {
  filename: string;
  blob: Blob;
  readiness: SubmissionReadiness;
  includedFiles: string[];
};

export type PortableResearchPackage = {
  filename: string;
  blob: Blob;
  includedFiles: string[];
};

const blobToBytes = async (blob: Blob): Promise<Uint8Array> => {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
};

const dataUrlToBytes = (
  dataUrl: string,
): { bytes: Uint8Array; extension: string } | null => {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (match === null) return null;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const extensionByMime: Record<string, string> = {
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/tiff': 'tif',
    'image/webp': 'webp',
  };
  return { bytes, extension: extensionByMime[match[1]] ?? 'bin' };
};

const addText = (files: Zippable, filename: string, content: string) => {
  if (content.trim().length > 0) files[filename] = strToU8(content);
};

const addDocx = async (
  files: Zippable,
  filename: string,
  title: string,
  markdown: string | null | undefined,
) => {
  if (
    markdown === null ||
    markdown === undefined ||
    markdown.trim().length === 0
  ) {
    return;
  }
  files[filename] = await blobToBytes(
    await exportStandaloneMarkdownToDocxBlob(title, markdown),
  );
};

const zipFiles = async (files: Zippable): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });

// A MECA-aligned manifest (NISO RP-30-2023 structure): one typed <item> per
// package file so publisher/preprint systems can walk the package
// programmatically instead of guessing from filenames. The JATS article is
// the machine-readable manuscript instance next to the human-editable DOCX.
const MECA_TYPE_BY_FILENAME = (filename: string, base: string): string => {
  if (filename === `${base}-manuscript.docx`) return 'manuscript';
  if (filename === `${base}.jats.xml`) return 'manuscript';
  if (filename.startsWith('figures/')) return 'figure';
  if (filename.startsWith('portable-assets/')) return 'figure';
  if (filename === 'cover-letter.docx') return 'cover-letter';
  if (filename === 'response-to-reviewers.docx') return 'response-to-reviewer';
  if (filename === 'metadata.json') return 'metadata';
  if (filename === 'references.json') return 'metadata';
  if (filename === 'research-paper.json') return 'metadata';
  if (filename === 'submission-readiness.txt') return 'metadata';
  if (filename === 'screening-report.txt') return 'metadata';
  return 'supporting-information';
};

const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xml: 'application/xml',
  json: 'application/json',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const escapeManifestXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildMecaManifest = (
  filenames: string[],
  base: string,
  bundle: ManuscriptBundle,
): string => {
  const items = filenames.map((filename, index) => {
    const extension = filename
      .slice(filename.lastIndexOf('.') + 1)
      .toLowerCase();
    const mediaType =
      MEDIA_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
    const type = MECA_TYPE_BY_FILENAME(filename, base);
    return [
      `  <item id="item-${index + 1}" type="${type}">`,
      `   <instance href="${escapeManifestXml(filename)}" media-type="${mediaType}"/>`,
      '  </item>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- MECA-aligned package manifest (NISO RP-30-2023 structure) -->',
    `<manifest xmlns:xlink="http://www.w3.org/1999/xlink" version="MECA 1.0">`,
    ` <title>${escapeManifestXml(bundle.metadata.title)}</title>`,
    ...items,
    '</manifest>',
    '',
  ].join('\n');
};

export const createPortableResearchPackage = async (
  bundle: ManuscriptBundle,
  materials: SubmissionMaterials,
  portableSource: PortableManuscriptSource,
): Promise<PortableResearchPackage> => {
  const files: Zippable = {};
  addPortableResearchPaperFiles(files, portableSource, bundle.style, materials);
  const zipped = await zipFiles(files);
  return {
    filename: `${slugifyTitle(bundle.metadata.title)}-portable-research.zip`,
    blob: new Blob([new Uint8Array(zipped).buffer], {
      type: 'application/zip',
    }),
    includedFiles: Object.keys(files).sort(),
  };
};

export type ManuscriptSubmissionFigures = {
  // Figures with pixels, as files to put in the ZIP.
  files: Record<string, Uint8Array>;
  // Figures that ship as a reference rather than a file, one line each.
  linked: string[];
};

// Split the manuscript's figures into files and references. Pure, so what
// happens to each kind of figure is testable without building a ZIP.
export const manuscriptSubmissionFigures = (
  bundle: ManuscriptBundle,
): ManuscriptSubmissionFigures => {
  const result: ManuscriptSubmissionFigures = { files: {}, linked: [] };
  // What the artwork file is called. A panel's printed label is the letter
  // alone — "(a)" — which two different figures would both slug to the same
  // filename, so a panel is named by the reference that identifies it
  // ("Fig. 1a") instead.
  const artworkName = (figure: NumberedFigure): string =>
    isFigurePanel(figure) && figure.crossRefLabel.length > 0
      ? figure.crossRefLabel
      : figure.label;
  for (const figure of bundle.numberedFigures) {
    if (figure.assetKind === 'TABLE') continue;
    if (isImageDataUrl(figure.imageUrl)) {
      const decoded = dataUrlToBytes(figure.imageUrl as string);
      if (decoded !== null) {
        result.files[
          `figures/${artworkName(figure).replace(/[^a-z0-9]+/gi, '-')}.${decoded.extension}`
        ] = decoded.bytes;
      }
      continue;
    }
    if (isHttpUrl(figure.imageUrl)) {
      result.linked.push(`${artworkName(figure)}: ${figure.imageUrl}`);
      continue;
    }
    const image = resolveFigureImage(figure);
    if (image.kind === 'url') {
      result.linked.push(`${figure.label}: ${image.src}`);
    } else if (isNonEmptyString(figure.diagramSource)) {
      // The diagram did not render to an image, so say so here instead of
      // letting the figure disappear from the package without a trace.
      result.linked.push(
        `${figure.label}: Mermaid diagram, not rendered — source in the portable package`,
      );
    }
  }
  return result;
};

const addFigures = (files: Zippable, bundle: ManuscriptBundle) => {
  const { files: figureFiles, linked } = manuscriptSubmissionFigures(bundle);
  for (const [path, bytes] of Object.entries(figureFiles)) {
    files[path] = bytes;
  }
  addText(files, 'figures/linked-figures.txt', linked.join('\n'));
};

const addSubmissionExtras = (
  files: Zippable,
  bundle: ManuscriptBundle,
  materials: SubmissionMaterials,
): string[] => {
  const template = {
    id:
      bundle.style.id?.trim() ||
      bundle.style.profileKey?.trim() ||
      bundle.metadata.journal ||
      'journal',
    profileKey: bundle.style.profileKey,
  };
  const values =
    parseManuscriptSubmissionExtras(materials.submissionExtras)[
      submissionJournalKey(template)
    ] ?? {};
  const filenames: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (
      CANONICAL_REQUIREMENT_FIELDS[key] !== undefined ||
      value.trim().length === 0
    ) {
      continue;
    }
    const safeKey = key.replace(/[^A-Za-z0-9_-]+/g, '-');
    const filename = `submission-extras/${safeKey}.txt`;
    addText(files, filename, value);
    filenames.push(filename);
  }

  return filenames.sort();
};

export const createSubmissionPackage = async (
  bundle: ManuscriptBundle,
  materials: SubmissionMaterials,
  portableSource?: PortableManuscriptSource,
  // What the panel added to the readiness list on screen — the retraction scan
  // it alone can see. Passed through so the manifest in the ZIP says the same
  // thing the author was shown before they pressed the button.
  extraChecks: SubmissionCheck[] = [],
): Promise<SubmissionPackage> => {
  const files: Zippable = {};
  // Screening needs the manuscript's sections, which only the portable source
  // carries; without it the package simply ships no screening, rather than a
  // report built from nothing that would read as an all-clear.
  // The whole run, not just its findings: a report that printed nine checks
  // while the panel showed seventeen would read as though the other eight did
  // not exist, rather than as eight the paper was judged not to need. Figures
  // travel too, so the figure-shaped checks run here as well — the colour-map
  // one has no decoded pixels outside the browser and declines, which is the
  // honest answer rather than a silent pass.
  const screening: ScreeningRun =
    portableSource === undefined
      ? { findings: [], declinations: [] }
      : runManuscriptScreening({
          sections: portableSource.sections,
          figures: portableSource.figures,
          competingInterests: materials.competingInterests,
        });
  const screeningFindings: ScreeningFinding[] = screening.findings;
  const readiness = validateSubmission(bundle, materials, [
    ...extraChecks,
    ...screeningSubmissionChecks(screeningFindings),
  ]);
  const base = slugifyTitle(bundle.metadata.title);
  // Draw every Mermaid diagram once, so the manuscript, the JATS article, and
  // the figure files all carry the same picture instead of dropping it.
  bundle = await prepareManuscriptDiagramImages(bundle);

  files[`${base}-manuscript.docx`] = await blobToBytes(
    await exportManuscriptToDocxBlob(bundle),
  );
  // The machine-readable article instance: publisher systems ingest JATS,
  // humans edit the DOCX. Both are the same manuscript.
  files[`${base}.jats.xml`] = strToU8(buildJatsArticle(bundle));
  addText(files, 'references.json', JSON.stringify(bundle.cslJson, null, 2));
  const submissionExtraFiles = addSubmissionExtras(files, bundle, materials);
  addText(
    files,
    'submission-readiness.txt',
    buildSubmissionManifest(bundle, readiness, submissionExtraFiles),
  );
  // The screening in a form a coauthor or an editor can be handed: until now it
  // existed only as rows on a tab that nobody outside the app ever sees.
  if (screeningFindings.length > 0) {
    addText(
      files,
      'screening-report.txt',
      buildScreeningReport(screeningFindings, bundle.metadata.title, {
        declinations: screening.declinations,
      }),
    );
  }
  addText(
    files,
    'metadata.json',
    JSON.stringify(
      {
        title: bundle.metadata.title,
        authors: bundle.metadata.authors,
        affiliations: bundle.metadata.affiliations,
        correspondingAuthor: bundle.metadata.correspondingAuthor,
        journal: bundle.metadata.journal,
        profileKey: bundle.style.profileKey,
        keywords: bundle.metadata.keywords,
        citationStyleId: bundle.metadata.citationStyleId,
      },
      null,
      2,
    ),
  );

  // BlockNote's DOCX exporter temporarily installs browser-compatible globals.
  // Keep companion exports sequential so concurrent documents cannot restore
  // those globals while another export is still using them.
  await addDocx(
    files,
    'cover-letter.docx',
    'Cover letter',
    materials.coverLetter,
  );
  await addDocx(files, 'highlights.docx', 'Highlights', materials.highlights);
  await addDocx(
    files,
    'competing-interests.docx',
    'Declaration of competing interests',
    materials.competingInterests,
  );
  await addDocx(
    files,
    'suggested-reviewers.docx',
    'Suggested reviewers',
    materials.suggestedReviewers,
  );
  // A resubmission is expected to carry the point-by-point response, so it
  // ships in the package next to the cover letter rather than as a file the
  // author has to remember to attach in the portal.
  await addDocx(
    files,
    'response-to-reviewers.docx',
    'Response to reviewers',
    materials.responseToReviewers,
  );
  addFigures(files, bundle);
  if (portableSource !== undefined) {
    addPortableResearchPaperFiles(
      files,
      portableSource,
      bundle.style,
      materials,
    );
  }
  files['manifest.xml'] = strToU8(
    buildMecaManifest(Object.keys(files).sort(), base, bundle),
  );

  const zipped = await zipFiles(files);
  return {
    filename: `${base}-${slugifyTitle(bundle.metadata.journal || 'submission')}.zip`,
    blob: new Blob([new Uint8Array(zipped).buffer], {
      type: 'application/zip',
    }),
    readiness,
    includedFiles: Object.keys(files).sort(),
  };
};
