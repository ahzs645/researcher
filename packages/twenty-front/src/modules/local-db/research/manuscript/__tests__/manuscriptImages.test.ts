import {
  describeImageSource,
  figureHasImage,
  figureToMarkdown,
  resolveFigureImage,
} from '@/local-db/research/manuscript/manuscriptImages';
import {
  type FigureLike,
  type NumberedFigure,
} from '@/local-db/research/manuscript/manuscriptTypes';

describe('resolveFigureImage', () => {
  it('classifies data-URL, http URL, and empty sources', () => {
    expect(
      resolveFigureImage({ id: 'a', imageUrl: 'data:image/png;base64,AAA' })
        .kind,
    ).toBe('dataurl');
    expect(
      resolveFigureImage({ id: 'b', imageUrl: 'https://x/y.png' }).kind,
    ).toBe('url');
    expect(resolveFigureImage({ id: 'c', imageUrl: '' }).kind).toBe('none');
  });

  it('reports whether a figure has a usable image', () => {
    expect(figureHasImage({ id: 'a', imageUrl: 'https://x/y.png' })).toBe(true);
    expect(figureHasImage({ id: 'b', imageUrl: '' })).toBe(false);
  });
});

describe('describeImageSource', () => {
  it('describes pending dataset/generated sources', () => {
    const dataset: FigureLike = {
      id: 'a',
      imageUrl: '',
      imageSource: 'DATASET',
    };
    expect(describeImageSource(dataset)).toMatch(/dataset/i);
  });
});

describe('figureToMarkdown', () => {
  const base: NumberedFigure = {
    id: 'f1',
    refKey: 'arpes',
    name: 'ARPES',
    caption: 'ARPES spectra.',
    assetKind: 'FIGURE',
    placement: 'MAIN',
    number: '1',
    label: 'Figure 1',
    crossRefLabel: 'Figure 1',
    imageUrl: 'https://x/y.png',
  };

  it('emits the image, an anchor, and the captioned label', () => {
    const md = figureToMarkdown(base);
    expect(md).toContain('<a id="arpes">');
    expect(md).toContain('![ARPES](https://x/y.png)');
    expect(md).toContain('**Figure 1.** ARPES spectra.');
  });

  it('emits a placeholder for an imageless figure (but not for tables)', () => {
    expect(figureToMarkdown({ ...base, imageUrl: '' })).toContain(
      'image to be added',
    );
    expect(
      figureToMarkdown({
        ...base,
        imageUrl: '',
        assetKind: 'TABLE',
        label: 'Table 1',
      }),
    ).not.toContain('image to be added');
  });

  it('includes credit when present', () => {
    expect(figureToMarkdown({ ...base, credit: 'CC BY 4.0' })).toContain(
      'Credit: CC BY 4.0',
    );
  });
});
