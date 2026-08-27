import {
  decisionLetterTextFromSections,
  parseDecisionLetter,
} from '@/local-db/research/manuscript/manuscriptReviewLetter';

const ELSEVIER_LETTER = `Dear Dr Researcher,

Thank you for submitting your manuscript to Atmospheric Environment. Based on
the reports below we invite you to submit a revised version.

Reviewer #1: The manuscript reports a useful comparison, but the framing needs
work before it can be published.

1. The introduction is far too long and repeats the motivation three times.
   Please shorten it to two paragraphs.

2. Figure 3 is unreadable at print size. Increase the font of the axis labels.

Reviewer #2:

Major comments

1. The sampling method is not described in enough detail for replication.
2. Uncertainty on the hourly means is never reported.

Minor comments

- Line 45: "measurment" is misspelt.
- Table 2 is missing units in the caption.
`;

describe('parseDecisionLetter', () => {
  it('splits an Elsevier-style letter into reviewers, points and subheadings', () => {
    const parsed = parseDecisionLetter(ELSEVIER_LETTER);

    expect(parsed.structured).toBe(true);
    expect(parsed.reviewers).toEqual(['Reviewer 1', 'Reviewer 2']);
    expect(parsed.preamble).toContain('Thank you for submitting');
    expect(
      parsed.points.map((point) => [
        point.reviewer,
        point.heading,
        point.label,
      ]),
    ).toEqual([
      ['Reviewer 1', '', 'General'],
      ['Reviewer 1', '', '1'],
      ['Reviewer 1', '', '2'],
      ['Reviewer 2', 'Major comments', '1'],
      ['Reviewer 2', 'Major comments', '2'],
      ['Reviewer 2', 'Minor comments', '1'],
      ['Reviewer 2', 'Minor comments', '2'],
    ]);
    expect(parsed.points[1].comment).toBe(
      'The introduction is far too long and repeats the motivation three times.\nPlease shorten it to two paragraphs.',
    );
    expect(parsed.points[6].comment).toBe(
      'Table 2 is missing units in the caption.',
    );
    expect(parsed.warnings).toEqual([]);
  });

  it('reads a Nature-style heading with a parenthetical on its own line', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer #1 (Remarks to the Author):',
        '',
        '1. The claim in the abstract is stronger than the data supports.',
        '',
        'Reviewer #2 (Remarks to the Author):',
        '',
        '1. I have no further comments.',
      ].join('\n'),
    );

    expect(parsed.reviewers).toEqual(['Reviewer 1', 'Reviewer 2']);
    expect(parsed.points).toHaveLength(2);
    expect(parsed.points[1].comment).toBe('I have no further comments.');
  });

  it('keeps a referee heading in the letter’s own words', () => {
    const parsed = parseDecisionLetter(
      ['Referee 2', '', '1. Please define the study area.'].join('\n'),
    );

    expect(parsed.reviewers).toEqual(['Referee 2']);
  });

  it('numbers bulleted points so every one can be answered', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        '• The abstract needs a quantitative result.',
        '• The conclusion overstates the transferability.',
      ].join('\n'),
    );

    expect(parsed.points.map((point) => point.label)).toEqual(['1', '2']);
    expect(parsed.points[1].comment).toBe(
      'The conclusion overstates the transferability.',
    );
  });

  it('reads sub-numbered points as points of their own', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        '1.1 The site description is incomplete.',
        '1.2 The instrument model is never given.',
        '2.1 Section 4 repeats Section 3.',
      ].join('\n'),
    );

    expect(parsed.points.map((point) => point.label)).toEqual([
      '1.1',
      '1.2',
      '2.1',
    ]);
  });

  it('keeps a quoted excerpt inside the point that quotes it', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        '1. The authors write:',
        '',
        '> 3. Results',
        '> We collected 24 h filter samples at three sites.',
        '',
        '2011. Emissions declined after this date, which the text ignores.',
        '',
        'Please clarify which sites are meant.',
        '',
        '2. The discussion should engage with that literature.',
      ].join('\n'),
    );

    expect(parsed.points).toHaveLength(2);
    expect(parsed.points[0].comment).toContain('> 3. Results');
    expect(parsed.points[0].comment).toContain('2011. Emissions declined');
    expect(parsed.points[0].comment).toContain('Please clarify which sites');
    expect(parsed.points[1].comment).toBe(
      'The discussion should engage with that literature.',
    );
  });

  it('degrades a letter with no discernible structure to one block', () => {
    const letter =
      'Dear author, after consideration we find the manuscript unsuitable for ' +
      'publication in its present form. The reviewers felt the contribution was ' +
      'incremental and the evidence thin.';
    const parsed = parseDecisionLetter(letter);

    expect(parsed.structured).toBe(false);
    expect(parsed.points).toEqual([
      { reviewer: '', label: '1', heading: '', comment: letter },
    ]);
    expect(parsed.warnings).toEqual([
      'No reviewer headings or numbered points were recognised. The letter is kept as one block — split it by hand if the reviewers raised separate points.',
    ]);
  });

  it('says so when a reviewer’s comments carry no numbers or bullets', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        'The manuscript is careful and the analysis is sound. I would only ask',
        'the authors to reconsider the framing of the second hypothesis.',
        '',
        'Reviewer 2',
        '',
        '1. Please add a limitations paragraph.',
      ].join('\n'),
    );

    expect(parsed.points[0]).toMatchObject({
      reviewer: 'Reviewer 1',
      label: 'General',
    });
    expect(parsed.points[0].comment).toContain('second hypothesis');
    expect(parsed.warnings).toEqual([
      "Reviewer 1's comments carry no numbers or bullets, so they are kept as one block.",
    ]);
  });

  it('attributes points to the letter when no reviewer is named', () => {
    const parsed = parseDecisionLetter(
      [
        'The following points must be addressed:',
        '',
        '1. Add the ethics approval number.',
        '2. Deposit the data before resubmission.',
      ].join('\n'),
    );

    expect(parsed.reviewers).toEqual([]);
    expect(parsed.points.map((point) => point.reviewer)).toEqual(['', '']);
    expect(parsed.preamble).toBe('The following points must be addressed:');
    expect(parsed.warnings).toEqual([
      'No reviewer headings were found, so every point is attributed to the letter as a whole.',
    ]);
  });

  it('does not mistake a year or a mid-sentence number for a new point', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        '1. The authors cite work published in',
        '2019. That reference is superseded.',
        '',
        '2. Nothing further.',
      ].join('\n'),
    );

    expect(parsed.points).toHaveLength(2);
    expect(parsed.points[0].comment).toContain('2019. That reference');
  });

  it('reports an empty letter rather than inventing a point', () => {
    const parsed = parseDecisionLetter('   \n\n  ');

    expect(parsed.points).toEqual([]);
    expect(parsed.structured).toBe(false);
    expect(parsed.warnings).toEqual(['The letter is empty.']);
  });

  // What it cannot do, recorded so the limit is visible rather than surprising.
  it('cannot tell a bulleted quotation from a bulleted point', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        '1. The authors list:',
        '   - site A',
        '   - site B',
        'but only describe one of them.',
      ].join('\n'),
    );

    expect(parsed.points.map((point) => point.label)).toEqual(['1', '2', '3']);
  });

  it('cannot tell a decimal opening a line from a sub-numbered point', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        '1. The mass loading is implausible:',
        '1.5 mg on a 47 mm filter would clog it.',
      ].join('\n'),
    );

    expect(parsed.points.map((point) => point.label)).toEqual(['1', '1.5']);
  });

  it('cannot follow numbering that restarts far from where it left off', () => {
    const parsed = parseDecisionLetter(
      [
        'Reviewer 1',
        '',
        '1. First point.',
        '',
        '90. Ninetieth point, numbered by page rather than in sequence.',
      ].join('\n'),
    );

    expect(parsed.points).toHaveLength(1);
    expect(parsed.points[0].comment).toContain('90. Ninetieth point');
  });
});

describe('decisionLetterTextFromSections', () => {
  it('flattens an imported document back into a letter', () => {
    expect(
      decisionLetterTextFromSections([
        { name: 'Reviewer 1', content: '1. Shorten the introduction.' },
        { name: '', content: '2. Redraw Figure 3.' },
        { name: 'Reviewer 2', content: '' },
      ]),
    ).toBe(
      [
        'Reviewer 1',
        '',
        '1. Shorten the introduction.',
        '',
        '2. Redraw Figure 3.',
        '',
        'Reviewer 2',
      ].join('\n'),
    );
  });
});
