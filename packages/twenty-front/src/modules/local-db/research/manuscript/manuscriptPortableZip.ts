import { isNonEmptyString } from '@sniptt/guards';
import { strFromU8, strToU8, unzipSync } from 'fflate';

import {
  buildPortableResearchPaperManifest,
  parsePortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_FILENAME,
  type PortableManuscriptSource,
  type PortableResearchPaperManifest,
} from './manuscriptPortableManifest';
import { type SubmissionMaterials } from './manuscriptSubmission';
import { type JournalStyle } from './manuscriptTypes';

export type PortableZipFiles = Record<string, Uint8Array>;

const dataUrlToBytes = (value: string): Uint8Array | null => {
  const match = /^data:[^;,]+;base64,(.*)$/s.exec(value);
  if (match === null) return null;
  const binary = atob(match[1]);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const mimeTypeFromPath = (path: string): string => {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {
    bmp: 'image/bmp',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    webp: 'image/webp',
  };
  return types[extension] ?? 'application/octet-stream';
};

const bytesToDataUrl = (bytes: Uint8Array, path: string): string => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return `data:${mimeTypeFromPath(path)};base64,${btoa(binary)}`;
};

const bytesAreEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

// Two payloads landing on one path used to be a silent last-write-wins, which
// shipped an archive whose manifest looked right and whose pixels were another
// figure's. Refuse the write instead: a loud export beats quiet data loss.
const addPortableFile = (
  files: PortableZipFiles,
  path: string,
  bytes: Uint8Array,
): void => {
  const existing = files[path];
  if (
    existing !== undefined &&
    (!(existing instanceof Uint8Array) || !bytesAreEqual(existing, bytes))
  ) {
    throw new Error(
      `Portable ZIP would overwrite ${path} with a different asset. Give the figures distinct reference keys and export again.`,
    );
  }
  files[path] = bytes;
};

export const addPortableResearchPaperFiles = (
  files: PortableZipFiles,
  source: PortableManuscriptSource,
  style: JournalStyle,
  materials: SubmissionMaterials,
): PortableResearchPaperManifest => {
  const manifest = buildPortableResearchPaperManifest(source, style, materials);
  // The manifest is the single path allocation: its figures are built by
  // mapping over source.figures, so entry i is source.figures[i], and reading
  // imagePath from it makes an archive that contradicts its own manifest
  // impossible to write.
  manifest.figures.forEach((entry, index) => {
    const imageUrl = source.figures[index]?.imageUrl;
    if (entry.imagePath === undefined || !isNonEmptyString(imageUrl)) return;
    const bytes = dataUrlToBytes(imageUrl);
    if (bytes !== null) addPortableFile(files, entry.imagePath, bytes);
  });
  files[PORTABLE_MANUSCRIPT_FILENAME] = strToU8(
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
};

export const readPortableResearchPaperZip = (
  bytes: Uint8Array,
): PortableResearchPaperManifest => {
  const files = unzipSync(bytes, {
    filter: (file) => file.originalSize <= 50_000_000,
  });
  const manifestBytes = files[PORTABLE_MANUSCRIPT_FILENAME];
  if (manifestBytes === undefined) {
    throw new Error(`ZIP does not contain ${PORTABLE_MANUSCRIPT_FILENAME}`);
  }
  const manifest = parsePortableResearchPaperManifest(strFromU8(manifestBytes));
  return {
    ...manifest,
    figures: manifest.figures.map((figure) => {
      if (figure.imagePath === undefined) return figure;
      const imageBytes = files[figure.imagePath];
      if (imageBytes === undefined) {
        throw new Error(`ZIP is missing linked asset ${figure.imagePath}`);
      }
      return {
        ...figure,
        imageUrl: bytesToDataUrl(imageBytes, figure.imagePath),
      };
    }),
  };
};
