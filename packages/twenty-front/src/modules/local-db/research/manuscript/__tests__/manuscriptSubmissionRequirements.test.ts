import {
  CANONICAL_REQUIREMENT_FIELDS,
  collectSubmissionConflicts,
  parseJournalSubmissionRequirements,
  parseManuscriptSubmissionExtras,
  resolveSubmissionRequirementItems,
  serializeJournalSubmissionRequirements,
  serializeManuscriptSubmissionExtras,
  submissionJournalKey,
} from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

describe('manuscript submission requirements', () => {
  it('parses and serializes journal requirements while tolerating bad input', () => {
    expect(parseJournalSubmissionRequirements(undefined)).toEqual([]);
    expect(parseJournalSubmissionRequirements('{invalid')).toEqual([]);
    expect(parseJournalSubmissionRequirements('{}')).toEqual([]);

    const requirements = parseJournalSubmissionRequirements(
      JSON.stringify([
        { key: ' KEYWORDS ', required: true, label: ' Portal keywords ' },
        { key: '', required: false },
        { key: 'ABSTRACT', required: 'yes' },
      ]),
    );

    expect(requirements).toEqual([
      { key: 'KEYWORDS', required: true, label: 'Portal keywords' },
    ]);
    expect(
      parseJournalSubmissionRequirements(
        serializeJournalSubmissionRequirements(requirements),
      ),
    ).toEqual(requirements);
  });

  it('parses and serializes per-journal extras while dropping invalid values', () => {
    expect(parseManuscriptSubmissionExtras(null)).toEqual({});
    expect(parseManuscriptSubmissionExtras('[1, 2]')).toEqual({});
    expect(parseManuscriptSubmissionExtras('{invalid')).toEqual({});

    const extras = parseManuscriptSubmissionExtras(
      JSON.stringify({
        aect: { KEYWORDS: 'Roadways; PM2.5', ARTICLE_TYPE: 3 },
        invalid: 'not an object',
      }),
    );

    expect(extras).toEqual({
      aect: { KEYWORDS: 'Roadways; PM2.5' },
    });
    expect(
      parseManuscriptSubmissionExtras(
        serializeManuscriptSubmissionExtras(extras),
      ),
    ).toEqual(extras);
  });

  it('uses a non-empty profile key and otherwise falls back to the record id', () => {
    expect(
      submissionJournalKey({ id: 'template-id', profileKey: ' aect ' }),
    ).toBe('aect');
    expect(submissionJournalKey({ id: 'template-id', profileKey: '   ' })).toBe(
      'template-id',
    );
    expect(submissionJournalKey({ id: 'template-id' })).toBe('template-id');
  });

  it('resolves requirements in template order with canonical and journal values', () => {
    const template = {
      id: 'template-id',
      profileKey: 'aect',
      submissionRequirements: serializeJournalSubmissionRequirements([
        { key: 'KEYWORDS', required: true },
        { key: 'COVER_LETTER', required: true },
        {
          key: 'CUSTOM_PORTAL_FIELD',
          required: false,
          label: 'Custom portal field',
        },
        { key: 'ARTICLE_TYPE', required: true },
      ]),
    };

    const items = resolveSubmissionRequirementItems(template, {
      coverLetter: 'Dear Editor',
      submissionExtras: serializeManuscriptSubmissionExtras({
        aect: {
          KEYWORDS: 'Roadways; PM2.5',
          CUSTOM_PORTAL_FIELD: '   ',
        },
        other: { ARTICLE_TYPE: 'Research article' },
      }),
    });

    expect(
      items.map(({ definition, required, value, filled, source }) => ({
        key: definition.key,
        label: definition.label,
        required,
        value,
        filled,
        source,
      })),
    ).toEqual([
      {
        key: 'KEYWORDS',
        label: 'Keywords',
        required: true,
        value: 'Roadways; PM2.5',
        filled: true,
        source: 'extras',
      },
      {
        key: 'COVER_LETTER',
        label: 'Cover letter',
        required: true,
        value: 'Dear Editor',
        filled: true,
        source: 'canonical',
      },
      {
        key: 'CUSTOM_PORTAL_FIELD',
        label: 'Custom portal field',
        required: false,
        value: '   ',
        filled: false,
        source: 'extras',
      },
      {
        key: 'ARTICLE_TYPE',
        label: 'Article type',
        required: true,
        value: '',
        filled: false,
        source: 'extras',
      },
    ]);
  });

  it('maps only the four existing manuscript fields as canonical values', () => {
    expect(CANONICAL_REQUIREMENT_FIELDS).toEqual({
      COVER_LETTER: 'coverLetter',
      HIGHLIGHTS: 'highlights',
      COMPETING_INTERESTS: 'competingInterests',
      SUGGESTED_REVIEWERS: 'suggestedReviewers',
    });
  });

  it('detects the real AECT portal author-order conflict', () => {
    expect(
      collectSubmissionConflicts({
        manuscript: {
          authorLine:
            'Ahmad Jalil, Ann Duong, Mya Schouwenburg, Hossein Kazemian',
        },
        values: {
          AUTHOR_ORDER:
            'Ahmad Jalil; Hossein Kazemian; Mya Schouwenburg; Ann Duong',
        },
      }),
    ).toContainEqual({
      key: 'AUTHOR_ORDER',
      message:
        'Author order for this journal differs from the manuscript author line',
      journalValue:
        'Ahmad Jalil; Hossein Kazemian; Mya Schouwenburg; Ann Duong',
      manuscriptValue:
        'Ahmad Jalil, Ann Duong, Mya Schouwenburg, Hossein Kazemian',
    });
  });

  it('does not report author order when punctuation differs but sequence matches', () => {
    expect(
      collectSubmissionConflicts({
        manuscript: {
          authorLine:
            'Ahmad Jalil, Ann Duong, Mya Schouwenburg, Hossein Kazemian',
        },
        values: {
          AUTHOR_ORDER:
            'Ahmad Jalil; Ann Duong; Mya Schouwenburg; Hossein Kazemian',
        },
      }),
    ).toEqual([]);
  });

  it('detects the AIRQ and ATMENV corresponding-author marker conflict', () => {
    expect(
      collectSubmissionConflicts({
        manuscript: {
          authorLine:
            'Ahmad Jalil; Ann Duong; Mya Schouwenburg; Hossein Kazemian*',
          correspondingAuthor: 'Ahmad Jalil, ajalil@unbc.ca',
        },
        values: {},
      }),
    ).toContainEqual({
      key: 'CORRESPONDING_AUTHOR',
      message:
        'Corresponding-author marker differs from the manuscript corresponding author',
      journalValue: 'Hossein Kazemian*',
      manuscriptValue: 'Ahmad Jalil, ajalil@unbc.ca',
    });
  });

  it('detects a journal keyword variant using a case-insensitive set comparison', () => {
    expect(
      collectSubmissionConflicts({
        manuscript: {
          sections: [
            {
              id: 'keywords',
              sectionType: 'KEYWORDS',
              content:
                'Roadways; PM2.5; Coarse Particulate; PM10; Heavy Metals; Index; Enrichment Factor',
            },
          ],
        },
        values: {
          KEYWORDS:
            'Roadways; PM2.5; Coarse Particulate; PM10; heavy metals; Index',
        },
      }),
    ).toContainEqual({
      key: 'KEYWORDS',
      message:
        'Keywords for this journal differ from the manuscript keywords section',
      journalValue:
        'Roadways; PM2.5; Coarse Particulate; PM10; heavy metals; Index',
      manuscriptValue:
        'Roadways; PM2.5; Coarse Particulate; PM10; Heavy Metals; Index; Enrichment Factor',
    });
  });

  it('accepts keyword casing and ordering differences when the sets match', () => {
    expect(
      collectSubmissionConflicts({
        manuscript: {
          sections: [
            {
              id: 'keywords',
              sectionType: 'KEYWORDS',
              content: 'Roadways; PM2.5; Heavy Metals',
            },
          ],
        },
        values: { KEYWORDS: 'heavy metals, roadways, pm2.5' },
      }),
    ).toEqual([]);
  });
});
