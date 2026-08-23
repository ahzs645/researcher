import {
  manuscriptTitlePageFragmentText,
  moveManuscriptTitlePageLine,
  parseManuscriptTitlePageExtraLines,
  serializeManuscriptTitlePageExtraLines,
  titlePageSpacerLine,
  titlePageSpacerLineCount,
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

describe('title-page spacers', () => {
  it('reads a bare rule as one blank line and a counted one as that many', () => {
    expect(titlePageSpacerLineCount('---')).toBe(1);
    expect(titlePageSpacerLineCount('-----')).toBe(1);
    expect(titlePageSpacerLineCount('--- 6')).toBe(6);
    expect(titlePageSpacerLineCount('---x4')).toBe(4);
    expect(titlePageSpacerLineCount('--- 999')).toBe(40);
  });

  it('is not fooled by an em dash or a line that merely starts with one', () => {
    expect(titlePageSpacerLineCount('— a note')).toBeNull();
    expect(titlePageSpacerLineCount('--- and then some')).toBeNull();
    expect(titlePageSpacerLineCount('MARCH 2023')).toBeNull();
  });

  it('round-trips a count through the line it writes', () => {
    expect(titlePageSpacerLine(1)).toBe('---');
    expect(titlePageSpacerLineCount(titlePageSpacerLine(7))).toBe(7);
    // A serialized cover page keeps its spacers: they are content, not blanks.
    expect(
      parseManuscriptTitlePageExtraLines(
        serializeManuscriptTitlePageExtraLines(['by', '--- 6', 'MARCH 2023']),
      ),
    ).toEqual(['by', '--- 6', 'MARCH 2023']);
  });
});
