import { strToU8, unzipSync, zipSync } from 'fflate';

import {
  allocatePortableFigureAssets,
  portableFigureRefKey,
} from '@/local-db/research/manuscript/manuscriptPortableAssetPaths';
import {
  buildPortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_FILENAME,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  addPortableResearchPaperFiles,
  readPortableResearchPaperZip,
} from '@/local-db/research/manuscript/manuscriptPortableZip';
import { type FigureLike } from '@/local-db/research/manuscript/manuscriptTypes';

const pngDataUrl = (payload: string): string =>
  `data:image/png;base64,${btoa(payload)}`;

// Two distinct payloads, so a swapped or overwritten asset is visible in the
// bytes rather than only in a path.
const ALPHA_IMAGE = pngDataUrl('PNG-ALPHA-PAYLOAD');
const BRAVO_IMAGE = pngDataUrl('PNG-BRAVO-PAYLOAD');

const sourceWithFigures = (
  figures: FigureLike[],
): PortableManuscriptSource => ({
  manuscript: { title: 'Collision paper' },
  sections: [
    {
      id: 'introduction-id',
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'See [#fig-A] and [#fig_a].',
      orderIndex: 0,
    },
  ],
  figures,
  references: [],
});

// "fig-A" and "fig_a" are both legal reference keys that slugify to "fig-a".
const COLLIDING_FIGURES: FigureLike[] = [
  {
    id: 'figure-alpha-id',
    name: 'Alpha',
    refKey: 'fig-A',
    caption: 'Alpha caption.',
    assetKind: 'FIGURE',
    placement: 'MAIN',
    imageSource: 'UPLOAD',
    imageUrl: ALPHA_IMAGE,
    orderIndex: 0,
  },
  {
    id: 'figure-bravo-id',
    name: 'Bravo',
    refKey: 'fig_a',
    caption: 'Bravo caption.',
    assetKind: 'FIGURE',
    placement: 'MAIN',
    imageSource: 'UPLOAD',
    imageUrl: BRAVO_IMAGE,
    orderIndex: 1,
  },
];

const packToZip = (source: PortableManuscriptSource): Uint8Array => {
  const files: Record<string, Uint8Array> = {};
  addPortableResearchPaperFiles(files, source, {}, {});
  return zipSync(files);
};

describe('portable asset path allocation', () => {
  it('keeps reference keys that slugify alike on separate paths and bytes', () => {
    const source = sourceWithFigures(COLLIDING_FIGURES);
    const files: Record<string, Uint8Array> = {};
    const manifest = addPortableResearchPaperFiles(files, source, {}, {});

    const [alpha, bravo] = manifest.figures;
    expect(alpha.imagePath).toBeDefined();
    expect(bravo.imagePath).toBeDefined();
    expect(alpha.imagePath).not.toBe(bravo.imagePath);

    // The manifest and the archive agree, and neither payload was overwritten.
    const assetPaths = Object.keys(files).filter(
      (path) => path !== PORTABLE_MANUSCRIPT_FILENAME,
    );
    expect(assetPaths.sort()).toEqual(
      [alpha.imagePath, bravo.imagePath].sort(),
    );
    const alphaBytes = Array.from(files[alpha.imagePath as string]);
    const bravoBytes = Array.from(files[bravo.imagePath as string]);
    expect(alphaBytes).toEqual(Array.from(strToU8('PNG-ALPHA-PAYLOAD')));
    expect(bravoBytes).toEqual(Array.from(strToU8('PNG-BRAVO-PAYLOAD')));
    expect(alphaBytes).not.toEqual(bravoBytes);
  });

  it('round-trips each colliding figure back to its own image', () => {
    const restored = readPortableResearchPaperZip(
      packToZip(sourceWithFigures(COLLIDING_FIGURES)),
    );

    expect(restored.figures.map((figure) => figure.refKey)).toEqual([
      'fig-A',
      'fig_a',
    ]);
    expect(restored.figures[0].imageUrl).toBe(ALPHA_IMAGE);
    expect(restored.figures[1].imageUrl).toBe(BRAVO_IMAGE);
  });

  it('allocates the same paths regardless of figure order', () => {
    const forward = allocatePortableFigureAssets(COLLIDING_FIGURES);
    const reversed = allocatePortableFigureAssets(
      [...COLLIDING_FIGURES].reverse(),
    );

    expect(reversed[1].path).toBe(forward[0].path);
    expect(reversed[0].path).toBe(forward[1].path);
    // Reproducible archives: the same records always export the same names.
    expect(allocatePortableFigureAssets(COLLIDING_FIGURES)).toEqual(forward);
  });

  it('leaves a non-colliding reference key on its plain slug', () => {
    const [asset] = allocatePortableFigureAssets([
      { id: 'only-id', refKey: 'absorption-plot', imageUrl: ALPHA_IMAGE },
    ]);

    expect(asset.path).toBe('portable-assets/absorption-plot.png');
  });

  it('refuses to overwrite an existing path with different bytes', () => {
    const source = sourceWithFigures([COLLIDING_FIGURES[0]]);
    const files: Record<string, Uint8Array> = {
      'portable-assets/fig-a.png': strToU8('SOMETHING-ELSE'),
    };

    expect(() => addPortableResearchPaperFiles(files, source, {}, {})).toThrow(
      /would overwrite portable-assets\/fig-a\.png/,
    );
  });

  it('gives figures without a reference key one agreed positional key', () => {
    const source = sourceWithFigures([
      { id: 'first-id', name: 'First', imageUrl: ALPHA_IMAGE, orderIndex: 0 },
      {
        id: 'second-id',
        name: 'Second',
        refKey: '   ',
        imageUrl: BRAVO_IMAGE,
        orderIndex: 1,
      },
    ]);
    const files: Record<string, Uint8Array> = {};
    const manifest = addPortableResearchPaperFiles(files, source, {}, {});

    expect(manifest.figures.map((figure) => figure.refKey)).toEqual([
      'figure-1',
      'figure-2',
    ]);
    expect(manifest.figures.map((figure) => figure.imagePath)).toEqual([
      'portable-assets/figure-1.png',
      'portable-assets/figure-2.png',
    ]);
    // Before the fix the writer keyed these off figure.id while the manifest
    // said figure-N, so the archive was missing the asset it pointed at.
    expect(Object.keys(files).sort()).toEqual([
      'portable-assets/figure-1.png',
      'portable-assets/figure-2.png',
      PORTABLE_MANUSCRIPT_FILENAME,
    ]);

    const restored = readPortableResearchPaperZip(zipSync(files));
    expect(restored.figures[0].imageUrl).toBe(ALPHA_IMAGE);
    expect(restored.figures[1].imageUrl).toBe(BRAVO_IMAGE);
  });

  it('synthesizes a positional reference key only when one is missing', () => {
    expect(portableFigureRefKey({ id: 'a', refKey: 'fig-A' }, 0)).toBe('fig-A');
    expect(portableFigureRefKey({ id: 'a', refKey: null }, 3)).toBe('figure-4');
    expect(portableFigureRefKey({ id: 'a' }, 0)).toBe('figure-1');
  });

  it('reads archives written before paths were allocated centrally', () => {
    // A ZIP in the pre-fix layout: plain slug filenames, recorded in the
    // manifest. Reading follows the manifest, so it still resolves.
    const manifest = buildPortableResearchPaperManifest(
      sourceWithFigures([COLLIDING_FIGURES[0]]),
      {},
      {},
    );
    const legacyManifest = {
      ...manifest,
      figures: manifest.figures.map((figure) => ({
        ...figure,
        imagePath: 'portable-assets/fig-a.png',
      })),
    };
    const legacyZip = zipSync({
      [PORTABLE_MANUSCRIPT_FILENAME]: strToU8(
        JSON.stringify(legacyManifest, null, 2),
      ),
      'portable-assets/fig-a.png': strToU8('PNG-ALPHA-PAYLOAD'),
    });

    const restored = readPortableResearchPaperZip(legacyZip);

    expect(restored.figures[0].imagePath).toBe('portable-assets/fig-a.png');
    expect(restored.figures[0].imageUrl).toBe(ALPHA_IMAGE);
    expect(Object.keys(unzipSync(legacyZip))).toContain(
      'portable-assets/fig-a.png',
    );
  });
});
