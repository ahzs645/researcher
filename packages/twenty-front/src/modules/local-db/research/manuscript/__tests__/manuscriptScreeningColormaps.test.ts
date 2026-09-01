import {
  labChroma,
  labDistance,
  srgbToLab,
} from '@/local-db/research/manuscript/manuscriptColorSpace';
import {
  COLORMAP_ENTRY_COUNT,
  colormapColorAt,
  rainbowColormapsInLab,
} from '@/local-db/research/manuscript/manuscriptColormaps';
import {
  bestRainbowCoverage,
  readFigureColorSample,
  scoreFigureColormaps,
  type FigureColorSample,
} from '@/local-db/research/manuscript/manuscriptFigureColor';
import {
  PARTIAL_RAMP_COVERAGE,
  RAINBOW_PIXEL_COVERAGE,
  RAINBOW_RAMP_COVERAGE,
} from '@/local-db/research/manuscript/screening/figureColormaps';
import {
  runManuscriptScreening,
  screenManuscript,
  type ScreeningFinding,
} from '@/local-db/research/manuscript/manuscriptScreening';
import { buildScreeningReport } from '@/local-db/research/manuscript/manuscriptScreeningChecks';
import { type FigureLike } from '@/local-db/research/manuscript/manuscriptTypes';

// A one-pixel PNG. The check never decodes it — every test here supplies
// pixels directly — but a figure has to carry an image URL to be a raster the
// check will look at.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

type Rgb = readonly [number, number, number];

const rgbaFromColors = (colors: Rgb[]): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([red, green, blue], index) => {
    pixels[index * 4] = red;
    pixels[index * 4 + 1] = green;
    pixels[index * 4 + 2] = blue;
    pixels[index * 4 + 3] = 255;
  });
  return pixels;
};

const sampleOf = (colors: Rgb[]): FigureColorSample =>
  readFigureColorSample(rgbaFromColors(colors));

const rampOf = (colormap: string, steps: number): Rgb[] =>
  Array.from({ length: steps }, (_unused, index) =>
    colormapColorAt(colormap, index / (steps - 1)),
  );

// viridis, the map JetFighter's authors point people at, sampled at five
// anchors and interpolated. The anchors are `viridisLite::viridis(5)` —
// #440154, #3B528B, #21908C, #5DC863, #FDE725 — an independent implementation
// of matplotlib's table, whose first and last entries match `_viridis_data`
// exactly. Interpolating between five of them in sRGB is not literally
// viridis, which makes this a slightly harder test than the real thing: the
// drift is away from viridis and therefore towards the rest of the gamut.
const VIRIDIS_ANCHORS: Rgb[] = [
  [0x44, 0x01, 0x54],
  [0x3b, 0x52, 0x8b],
  [0x21, 0x90, 0x8c],
  [0x5d, 0xc8, 0x63],
  [0xfd, 0xe7, 0x25],
];

const viridisRamp = (steps: number): Rgb[] =>
  Array.from({ length: steps }, (_unused, index) => {
    const position = (index / (steps - 1)) * (VIRIDIS_ANCHORS.length - 1);
    const lower = Math.min(Math.floor(position), VIRIDIS_ANCHORS.length - 2);
    const fraction = position - lower;
    const channel = (offset: number): number =>
      Math.round(
        VIRIDIS_ANCHORS[lower][offset] +
          fraction *
            (VIRIDIS_ANCHORS[lower + 1][offset] -
              VIRIDIS_ANCHORS[lower][offset]),
      );
    return [channel(0), channel(1), channel(2)] as const;
  });

const greyRamp = (steps: number): Rgb[] =>
  Array.from({ length: steps }, (_unused, index) => {
    const value = 1 + Math.round((index / (steps - 1)) * 253);
    return [value, value, value] as const;
  });

// A figure that is mostly white page with a thin colour bar down one edge —
// the case the check is really for.
const colorbarFigure = (colormap: string): Rgb[] => {
  const colors: Rgb[] = [];
  for (let row = 0; row < 300; row += 1) {
    for (let column = 0; column < 400; column += 1) {
      const isColorbar =
        column >= 380 && column < 388 && row >= 50 && row < 250;
      if (isColorbar) {
        colors.push(colormapColorAt(colormap, 1 - (row - 50) / 199));
      } else if (column === 40 || row === 260) {
        colors.push([60, 60, 60]);
      } else {
        colors.push([255, 255, 255]);
      }
    }
  }
  return colors;
};

// Smooth, full-gamut variation with a little noise: what a photograph looks
// like to a colour histogram, and the false positive the pixel-coverage floor
// is there to stop.
const photographicFigure = (): Rgb[] => {
  const colors: Rgb[] = [];
  let seed = 7;
  const noise = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return ((seed / 2147483648) * 30 - 15) | 0;
  };
  const clamp = (value: number): number =>
    Math.max(0, Math.min(255, Math.round(value)));
  for (let row = 0; row < 300; row += 1) {
    for (let column = 0; column < 400; column += 1) {
      colors.push([
        clamp(128 + 120 * Math.sin(column / 40) + noise()),
        clamp(128 + 120 * Math.sin(row / 37 + 1) + noise()),
        clamp(128 + 120 * Math.sin((column + row) / 53 + 2) + noise()),
      ]);
    }
  }
  return colors;
};

const SECTIONS = [
  {
    id: 'methods',
    name: 'Methods',
    sectionType: 'METHODS',
    content:
      'Filter samples were collected on quartz fibre filters and analysed by thermal-optical transmittance.',
  },
];

const figure = (overrides: Partial<FigureLike> = {}): FigureLike => ({
  id: 'figure-1',
  name: 'Figure 1',
  assetKind: 'FIGURE',
  caption: 'Modelled surface temperature anomaly.',
  altText: 'A map of temperature anomaly.',
  imageUrl: PIXEL,
  orderIndex: 0,
  ...overrides,
});

const colormapResult = (
  figures: FigureLike[],
  figurePixels?: Record<string, FigureColorSample>,
): ScreeningFinding | { reason: string } => {
  const run = runManuscriptScreening({
    sections: SECTIONS,
    figures,
    figurePixels,
  });
  const finding = run.findings.find(({ key }) => key === 'FIGURE_COLORMAPS');
  if (finding !== undefined) return finding;
  const declination = run.declinations.find(
    ({ key }) => key === 'FIGURE_COLORMAPS',
  );
  if (declination === undefined) {
    throw new Error('the colour map check neither reported nor declined');
  }
  return { reason: declination.reason };
};

const colormapFinding = (
  figures: FigureLike[],
  figurePixels: Record<string, FigureColorSample>,
): ScreeningFinding => {
  const result = colormapResult(figures, figurePixels);
  if (!('verdict' in result)) {
    throw new Error(`the colour map check declined: ${result.reason}`);
  }
  return result;
};

describe('sRGB to CIELAB', () => {
  // The whole check is distances in this space, so the space itself is checked
  // against the values everyone quotes for the sRGB primaries. They agree to
  // three decimal places; the fourth differs because the white point here is
  // D65 derived from its chromaticity, the way the W3C conversion code derives
  // it, rather than the rounded 0.95047/1/1.08883 tristimulus values that the
  // usual tables use. A hundredth of a ΔE, against a match radius of 2.
  it.each([
    ['red', [255, 0, 0], [53.2371, 80.0901, 67.2033]],
    ['green', [0, 255, 0], [87.7355, -86.1816, 83.1866]],
    ['blue', [0, 0, 255], [32.3009, 79.1953, -107.8555]],
    ['white', [255, 255, 255], [100, 0, 0]],
    ['mid grey', [128, 128, 128], [53.585, 0, 0]],
    ['black', [0, 0, 0], [0, 0, 0]],
  ])('converts %s', (_name, [red, green, blue], [lightness, a, b]) => {
    const lab = srgbToLab(red, green, blue);

    expect(lab.lightness).toBeCloseTo(lightness, 3);
    expect(lab.greenRed).toBeCloseTo(a, 3);
    expect(lab.blueYellow).toBeCloseTo(b, 3);
  });

  it('gives every neutral no chroma at all, whatever its lightness', () => {
    for (const value of [0, 32, 128, 200, 255]) {
      expect(labChroma(srgbToLab(value, value, value))).toBeCloseTo(0, 6);
    }
  });

  it('measures no distance between a colour and itself', () => {
    const orange = srgbToLab(255, 127, 14);

    expect(labDistance(orange, orange)).toBe(0);
    expect(labDistance(orange, srgbToLab(255, 128, 14))).toBeLessThan(1);
  });
});

describe('the colour maps a figure should not be drawn in', () => {
  // matplotlib's `_jet_data`: blue at half intensity at the bottom, red at half
  // intensity at the top, and full cyan, green and yellow in between. If these
  // are wrong every verdict after them is wrong, so they are asserted rather
  // than assumed.
  it('matches matplotlib jet at its control points', () => {
    expect(colormapColorAt('jet', 0)).toEqual([0, 0, 128]);
    expect(colormapColorAt('jet', 0.11)).toEqual([0, 0, 255]);
    expect(colormapColorAt('jet', 1)).toEqual([128, 0, 0]);
    expect(colormapColorAt('jet', 0.89)).toEqual([255, 19, 0]);
  });

  it('samples every ramp at matplotlib default resolution', () => {
    const ramps = rainbowColormapsInLab();

    expect(ramps.map(({ name }) => name)).toEqual([
      'jet',
      'hsv',
      'rainbow',
      'gist_rainbow',
      'nipy_spectral',
    ]);
    for (const ramp of ramps) {
      expect(ramp.entries).toHaveLength(COLORMAP_ENTRY_COUNT);
    }
  });
});

describe('reading a figure into the colours it is drawn in', () => {
  it('drops the page and the ink, which no colour map contains', () => {
    const sample = sampleOf([
      [255, 255, 255],
      [0, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
    ]);

    expect(sample.sampledPixelCount).toBe(4);
    expect(sample.chromaticPixelCount).toBe(2);
    expect(sample.colors).toHaveLength(1);
    expect(sample.counts[0]).toBe(2);
  });

  it('drops transparent pixels, which are not the figure', () => {
    const pixels = rgbaFromColors([
      [255, 0, 0],
      [0, 0, 255],
    ]);
    pixels[7] = 0;

    expect(readFigureColorSample(pixels).sampledPixelCount).toBe(1);
  });

  it('drops greys, so a greyscale figure carries no colour at all', () => {
    expect(sampleOf(greyRamp(256)).colors).toHaveLength(0);
  });
});

describe('scoring a figure against the rainbow ramps', () => {
  // The claim the whole check rests on.
  it('separates a jet ramp from a viridis one', () => {
    const jet = bestRainbowCoverage(
      scoreFigureColormaps(sampleOf(rampOf('jet', 256))),
    );
    const viridis = bestRainbowCoverage(
      scoreFigureColormaps(sampleOf(viridisRamp(256))),
    );

    expect(jet?.colormap).toBe('jet');
    expect(jet?.rampCoverage).toBe(1);
    expect(viridis?.rampCoverage).toBeLessThan(0.05);
  });

  it('recognises the other rainbow maps as themselves', () => {
    for (const colormap of [
      'hsv',
      'rainbow',
      'gist_rainbow',
      'nipy_spectral',
    ]) {
      const best = bestRainbowCoverage(
        scoreFigureColormaps(sampleOf(rampOf(colormap, 256))),
      );

      expect(best?.colormap).toBe(colormap);
      expect(best?.rampCoverage).toBeGreaterThan(0.95);
    }
  });

  // Coverage of the map, not area of the figure: a handful of colours cannot
  // be a colour map however much of the page they cover.
  it('scores a six-colour line plot near zero', () => {
    const best = bestRainbowCoverage(
      scoreFigureColormaps(
        sampleOf([
          [214, 39, 40],
          [31, 119, 180],
          [44, 160, 44],
          [255, 127, 14],
          [148, 103, 189],
          [140, 86, 75],
        ]),
      ),
    );

    expect(best?.rampCoverage).toBeLessThan(0.02);
  });
});

describe('the rainbow colour map check', () => {
  // The published numbers, asserted so a later edit to them is a deliberate
  // one: half the ramp is JetFighter's own `cm_thresh`, and the tenth of the
  // figure's colour is this app's addition against photographs.
  it('keeps the thresholds it says it uses', () => {
    expect(RAINBOW_RAMP_COVERAGE).toBe(0.5);
    expect(PARTIAL_RAMP_COVERAGE).toBe(0.25);
    expect(RAINBOW_PIXEL_COVERAGE).toBe(0.1);
  });

  const jetSample = (): Record<string, FigureColorSample> => ({
    'figure-1': sampleOf(rampOf('jet', 256)),
  });

  it('reports a jet figure as absent and names it', () => {
    const finding = colormapFinding([figure({ name: 'Figure 2' })], {
      'figure-1': sampleOf(rampOf('jet', 256)),
    });

    expect(finding).toMatchObject({
      key: 'FIGURE_COLORMAPS',
      tool: 'JetFighter',
      verdict: 'ABSENT',
      figureId: 'figure-1',
      figureLabel: 'Figure 2',
    });
    expect(finding.detail).toContain('jet');
    expect(finding.detail).toContain('colourblind');
    expect(finding.sectionId).toBeUndefined();
  });

  it('passes a viridis figure', () => {
    expect(
      colormapFinding([figure()], {
        'figure-1': sampleOf(viridisRamp(256)),
      }),
    ).toMatchObject({
      verdict: 'PRESENT',
      detail: 'Figure 1 uses no rainbow colour map.',
    });
  });

  it('passes a greyscale figure, and says that is why', () => {
    expect(
      colormapFinding([figure()], {
        'figure-1': sampleOf(greyRamp(256)),
      }).detail,
    ).toBe('Figure 1 is greyscale, so no colour map can make it unreadable.');
  });

  it('passes a line plot without needing to know it is a line plot', () => {
    expect(
      colormapFinding([figure()], {
        'figure-1': sampleOf([
          [214, 39, 40],
          [31, 119, 180],
          [44, 160, 44],
        ]),
      }).detail,
    ).toContain('a palette, not a colour map');
  });

  // The common real case, and the reason the statistic is coverage of the
  // ramp rather than area of the figure: this figure is 98.7% white page and
  // grey axes, and it is still a jet figure.
  it('reports a figure whose only rainbow is a thin colour bar', () => {
    const sample = sampleOf(colorbarFigure('jet'));

    expect(sample.chromaticPixelCount / sample.sampledPixelCount).toBeLessThan(
      0.02,
    );
    expect(colormapFinding([figure()], { 'figure-1': sample })).toMatchObject({
      verdict: 'ABSENT',
    });
  });

  // A photograph has some colour near almost every ramp entry, so it covers
  // the ramp — and almost none of it is actually drawn in ramp colours. Weak,
  // never absent: this is the one case the colours alone cannot settle.
  it('does not accuse a photograph, but does not clear it either', () => {
    const finding = colormapFinding([figure()], {
      'figure-1': sampleOf(photographicFigure()),
    });

    expect(finding.verdict).toBe('WEAK');
    expect(finding.detail).toContain('usually a photograph');
  });

  it('quotes the caption so the author can disagree with the verdict', () => {
    expect(colormapFinding([figure()], jetSample()).evidence).toContain(
      'Modelled surface temperature anomaly',
    );
  });

  it('names the worst figure when several are drawn in a rainbow', () => {
    expect(
      colormapFinding(
        [
          figure({ id: 'a', name: 'Figure 1', orderIndex: 1 }),
          figure({ id: 'b', name: 'Figure 2', orderIndex: 2 }),
        ],
        {
          a: sampleOf(rampOf('jet', 256)),
          b: sampleOf(rampOf('hsv', 256)),
        },
      ).detail,
    ).toContain('2 figures are drawn in a rainbow colour map.');
  });

  it('says how many figures it could not read rather than rounding up', () => {
    expect(
      colormapFinding(
        [
          figure({ id: 'a', name: 'Figure 1', orderIndex: 1 }),
          figure({ id: 'b', name: 'Figure 2', orderIndex: 2 }),
        ],
        { a: sampleOf(viridisRamp(256)) },
      ).detail,
    ).toContain('1 further figure image could not be read');
  });
});

describe('what the check refuses to answer', () => {
  // The failure that matters most: a caller who does not decode figures must
  // not be told the figures are fine.
  it('declines when the caller supplies no pixels, rather than passing', () => {
    const result = colormapResult([figure()]);

    expect('verdict' in result).toBe(false);
    expect((result as { reason: string }).reason).toBe(
      'The figure image was not decoded, so its colours were not read.',
    );
  });

  it('declines when every image failed to decode', () => {
    const result = colormapResult(
      [figure({ id: 'a', orderIndex: 1 }), figure({ id: 'b', orderIndex: 2 })],
      {},
    );

    expect((result as { reason: string }).reason).toContain('were not decoded');
  });

  // A table has no image, an equation is typeset, and a Mermaid diagram has no
  // pixels until export draws it. None of them can carry a colour map.
  it('declines on a manuscript whose figures carry no raster', () => {
    const result = colormapResult([
      figure({ id: 't', assetKind: 'TABLE', imageUrl: null }),
      figure({ id: 'e', assetKind: 'EQUATION', imageUrl: null }),
      figure({
        id: 'd',
        assetKind: 'FIGURE',
        imageUrl: null,
        diagramSource: 'graph TD; A-->B;',
      }),
    ]);

    expect((result as { reason: string }).reason).toContain('no figure images');
  });

  it('declines on a manuscript with no figures at all', () => {
    const run = runManuscriptScreening({ sections: SECTIONS });

    expect(run.findings.map(({ key }) => key)).not.toContain(
      'FIGURE_COLORMAPS',
    );
    expect(
      run.declinations.find(({ key }) => key === 'FIGURE_COLORMAPS')?.reason,
    ).toContain('no figure images');
  });

  // Screening stayed synchronous. Every caller that passed sections alone
  // still gets exactly what it got before.
  it('leaves the existing signature alone', () => {
    expect(
      screenManuscript({
        sections: SECTIONS,
        competingInterests: 'The authors declare no competing interests.',
      }).map(({ key }) => key),
    ).toContain('COMPETING_INTERESTS');
  });
});

describe('carrying the colour finding onwards', () => {
  it('names the figure and the tool in the report', () => {
    const report = buildScreeningReport(
      screenManuscript({
        sections: SECTIONS,
        figures: [figure({ name: 'Figure 4' })],
        figurePixels: { 'figure-1': sampleOf(rampOf('jet', 256)) },
      }),
      'A paper with a jet figure',
    );

    expect(report).toContain('[ABSENT] Figure colour maps · JetFighter');
    expect(report).toContain('Figure: Figure 4');
    expect(report).toContain('colourblind reader');
  });
});
