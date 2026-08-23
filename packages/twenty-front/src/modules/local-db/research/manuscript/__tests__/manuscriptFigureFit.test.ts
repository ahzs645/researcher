import { fittedFigureWidthPercent } from '@/local-db/research/manuscript/manuscriptFigureFit';

describe('fittedFigureWidthPercent', () => {
  it('leaves a figure that already fits alone', () => {
    // A wide chart at full column width is 600 × 300 px — well inside the page.
    expect(fittedFigureWidthPercent(2, 100)).toBeNull();
    // Square is the tallest shape that still fits at full width.
    expect(fittedFigureWidthPercent(1, 100)).toBeNull();
  });

  it('narrows a tall figure until its height fits the page', () => {
    // A portrait flowchart, 1600 × 3383. At full width it resolves to a height
    // no page has, and the layout squashes it back rather than scaling it.
    const percent = fittedFigureWidthPercent(1600 / 3383, 100);

    expect(percent).not.toBeNull();
    expect(percent).toBeLessThan(100);
    // 840 px of usable height at that aspect ratio is ~397 px of width.
    expect(percent).toBe(66);
  });

  it('never widens a figure the author deliberately made small', () => {
    expect(fittedFigureWidthPercent(2, 40)).toBeNull();
    expect(fittedFigureWidthPercent(0.2, 40)).toBe(28);
  });

  it('keeps an extreme aspect ratio at the minimum rather than at zero', () => {
    expect(fittedFigureWidthPercent(0.01, 100)).toBe(10);
  });
});
