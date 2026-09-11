import { isNonEmptyString } from '@sniptt/guards';

import { type FigureLike } from './manuscriptTypes';

// One place decides where a figure's pixels live inside the portable ZIP.
// Both the manifest and the ZIP writer read the answer from here, because two
// independent derivations of the same path is how a figure ends up pointing at
// another figure's image.

export const PORTABLE_ASSET_DIRECTORY = 'portable-assets';

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/tiff': 'tif',
  'image/webp': 'webp',
};

export const portableImageExtension = (
  value: string | null | undefined,
): string | null => {
  const mimeType = /^data:([^;,]+);base64,/s.exec(value ?? '')?.[1];
  return mimeType === undefined
    ? null
    : (IMAGE_EXTENSION_BY_MIME_TYPE[mimeType] ?? null);
};

// The manuscript model requires every asset to carry a refKey, but the record
// types allow it to be missing, so synthesize a positional one instead of
// letting each caller invent its own fallback.
export const portableFigureRefKey = (
  figure: FigureLike,
  index: number,
): string => {
  const refKey = figure.refKey?.trim();
  return isNonEmptyString(refKey) ? refKey : `figure-${index + 1}`;
};

// Filenames are lowercased and stripped to [a-z0-9-], so distinct refKeys such
// as "fig-A" and "fig_a" normalize to the same slug. That is fine as a starting
// point; allocatePortableFigureAssets disambiguates the ones that clash.
const portableAssetSlug = (refKey: string): string =>
  refKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'figure';

const fnv1a32 = (value: string, seed: number): number => {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

// A suffix derived from the asset's own identity rather than from iteration
// order, so the same manuscript always exports to byte-identical paths and a
// re-imported paper re-exports to the same names.
const stableAssetSuffix = (value: string): string =>
  `${fnv1a32(value, 0x811c9dc5).toString(16).padStart(8, '0')}${fnv1a32(
    value,
    0x9e3779b9,
  )
    .toString(16)
    .padStart(8, '0')}`;

// "_" cannot survive slugification, so a disambiguated name can never collide
// with a plain one — the only names that contain "_" are the ones we made.
const withSuffix = (path: string, suffix: string): string => {
  const dotIndex = path.lastIndexOf('.');
  return `${path.slice(0, dotIndex)}_${suffix}${path.slice(dotIndex)}`;
};

export type PortableFigureAsset = {
  // The refKey the manifest records for this figure, synthesized when absent.
  refKey: string;
  // Where the figure's image is published, or null when it has no embedded
  // image to write as a file (linked URL, diagram, table, equation).
  path: string | null;
};

// Index-aligned with `figures`: entry i belongs to figures[i].
export const allocatePortableFigureAssets = (
  figures: readonly FigureLike[],
): PortableFigureAsset[] => {
  const refKeys = figures.map((figure, index) =>
    portableFigureRefKey(figure, index),
  );
  const candidates = figures.map((figure, index) => {
    const extension = portableImageExtension(figure.imageUrl);
    return extension === null
      ? null
      : `${PORTABLE_ASSET_DIRECTORY}/${portableAssetSlug(refKeys[index])}.${extension}`;
  });

  const indexesByCandidate = new Map<string, number[]>();
  candidates.forEach((candidate, index) => {
    if (candidate === null) return;
    const indexes = indexesByCandidate.get(candidate);
    if (indexes === undefined) {
      indexesByCandidate.set(candidate, [index]);
      return;
    }
    indexes.push(index);
  });

  const paths: Array<string | null> = candidates.map(() => null);
  for (const [candidate, indexes] of indexesByCandidate) {
    if (indexes.length === 1) {
      paths[indexes[0]] = candidate;
      continue;
    }
    const seenByRefKey = new Map<string, number>();
    for (const index of indexes) {
      const refKey = refKeys[index];
      const seen = seenByRefKey.get(refKey) ?? 0;
      seenByRefKey.set(refKey, seen + 1);
      // Two figures sharing one refKey are not a legal manuscript, so only that
      // case falls back to position in the figure list for its suffix.
      const suffix =
        seen === 0
          ? stableAssetSuffix(refKey)
          : `${stableAssetSuffix(refKey)}_${seen + 1}`;
      paths[index] = withSuffix(candidate, suffix);
    }
  }

  // Belt and braces: a hash collision must surface as a loud failure, never as
  // one figure quietly overwriting another's pixels.
  const allocated = new Set<string>();
  for (const path of paths) {
    if (path === null) continue;
    if (allocated.has(path)) {
      throw new Error(
        `Portable asset path allocated twice: ${path}. Give the figures distinct reference keys and export again.`,
      );
    }
    allocated.add(path);
  }

  return refKeys.map((refKey, index) => ({ refKey, path: paths[index] }));
};
