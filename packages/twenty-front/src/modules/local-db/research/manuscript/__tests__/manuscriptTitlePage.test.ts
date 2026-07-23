import {
  manuscriptTitlePageFragmentText,
  moveManuscriptTitlePageLine,
  parseManuscriptTitlePageExtraLines,
  serializeManuscriptTitlePageExtraLines,
} from '@/local-db/research/manuscript/manuscriptTitlePage';

describe('manuscript title-page helpers', () => {
  it('round-trips ordered non-empty extra lines', () => {
    const serialized = serializeManuscriptTitlePageExtraLines([
      ' Degree of Philosophy ',
      '',
      'July 2026',
    ]);

    expect(parseManuscriptTitlePageExtraLines(serialized)).toEqual([
      'Degree of Philosophy',
      'July 2026',
    ]);
    expect(parseManuscriptTitlePageExtraLines('not json')).toEqual([]);
  });

  it('moves lines without mutating the stored order', () => {
    const lines = ['First', 'Second'];

    expect(moveManuscriptTitlePageLine(lines, 1, -1)).toEqual([
      'Second',
      'First',
    ]);
    expect(lines).toEqual(['First', 'Second']);
  });

  it('turns imported markdown fragments into one plain-text line', () => {
    expect(
      manuscriptTitlePageFragmentText(
        '## Degree\n\n**Doctor of Philosophy** at [UNBC](https://unbc.ca)',
      ),
    ).toBe('Degree Doctor of Philosophy at UNBC');
  });
});
