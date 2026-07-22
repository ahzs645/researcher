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
import { type PortableManuscriptSource } from './manuscriptPortableManifest';
import { addPortableResearchPaperFiles } from './manuscriptPortableZip';
import {
  buildSubmissionManifest,
  type SubmissionMaterials,
  type SubmissionReadiness,
  validateSubmission,
} from './manuscriptSubmission';
import {
  CANONICAL_REQUIREMENT_FIELDS,
  parseManuscriptSubmissionExtras,
  submissionJournalKey,
} from './manuscriptSubmissionRequirements';

type Zippable = Record<string, Uint8Array>;

export type SubmissionPackage = {
  filename: string;
  blob: Blob;
  readiness: SubmissionReadiness;
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

const addFigures = (files: Zippable, bundle: ManuscriptBundle) => {
  const linkedFigures: string[] = [];
  for (const figure of bundle.numberedFigures) {
    if (figure.assetKind === 'TABLE') continue;
    if (isImageDataUrl(figure.imageUrl)) {
      const decoded = dataUrlToBytes(figure.imageUrl as string);
      if (decoded !== null) {
        files[
          `figures/${figure.label.replace(/[^a-z0-9]+/gi, '-')}.${decoded.extension}`
        ] = decoded.bytes;
      }
    } else if (isHttpUrl(figure.imageUrl)) {
      linkedFigures.push(`${figure.label}: ${figure.imageUrl}`);
    } else {
      const image = resolveFigureImage(figure);
      if (image.kind === 'url') {
        linkedFigures.push(`${figure.label}: ${image.src}`);
      }
    }
  }
  addText(files, 'figures/linked-figures.txt', linkedFigures.join('\n'));
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
): Promise<SubmissionPackage> => {
  const files: Zippable = {};
  const readiness = validateSubmission(bundle, materials);
  const base = slugifyTitle(bundle.metadata.title);

  files[`${base}-manuscript.docx`] = await blobToBytes(
    await exportManuscriptToDocxBlob(bundle),
  );
  addText(files, 'references.json', JSON.stringify(bundle.cslJson, null, 2));
  const submissionExtraFiles = addSubmissionExtras(files, bundle, materials);
  addText(
    files,
    'submission-readiness.txt',
    buildSubmissionManifest(bundle, readiness, submissionExtraFiles),
  );
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
  addFigures(files, bundle);
  if (portableSource !== undefined) {
    addPortableResearchPaperFiles(
      files,
      portableSource,
      bundle.style,
      materials,
    );
  }

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
