import {
  buildJournalProfile,
  journalProfileFilename,
  journalProfileRecordInput,
  parseJournalProfile,
  serializeJournalProfile,
} from '@/local-db/research/manuscript/manuscriptJournalProfile';

const journal = {
  id: 'amt-id',
  name: 'Atmospheric Measurement Techniques (Copernicus)',
  profileKey: 'copernicus-atmospheric-measurement-techniques',
  citationMode: 'AUTHOR_DATE',
  citationStyleId: 'copernicus-publications',
  figureLabelFormat: 'Figure {n}',
  crossRefFormat: 'Fig. {n}',
  abstractWordLimit: 350,
  sectionNumbering: true,
  requiredArtifacts: ['COVER_LETTER', 'SUGGESTED_REVIEWERS'],
  // Unset on this journal: must not travel as an assertion of a default.
  supplementPrefix: '',
  twoColumn: null,
  headingColor: undefined,
};

describe('buildJournalProfile', () => {
  it('carries what the journal sets and nothing it does not', () => {
    const profile = buildJournalProfile(journal);

    expect(profile).toMatchObject({
      name: 'Atmospheric Measurement Techniques (Copernicus)',
      profileKey: 'copernicus-atmospheric-measurement-techniques',
      citationStyleId: 'copernicus-publications',
      abstractWordLimit: 350,
      sectionNumbering: true,
      requiredArtifacts: ['COVER_LETTER', 'SUGGESTED_REVIEWERS'],
    });
    // An empty string and a null are "this journal does not set it"; exporting
    // them would make the profile claim a choice the author never made.
    expect(profile).not.toHaveProperty('supplementPrefix');
    expect(profile).not.toHaveProperty('twoColumn');
    expect(profile).not.toHaveProperty('headingColor');
    // The record's own id is workspace-local and means nothing elsewhere.
    expect(profile).not.toHaveProperty('id');
  });

  it('leaves one document\u2019s Word styles out of a shared profile', () => {
    // referenceDocStyles is the styles.xml an imported .docx carried: it makes
    // that manuscript export as itself, and it is 370 kB of the author's own
    // document rather than anything about the journal.
    const profile = buildJournalProfile({
      ...journal,
      referenceDocStyles: '<w:styles>…370 kB…</w:styles>',
      referenceDocUrl: 'https://example.org/template.docx',
    });

    expect(profile).not.toHaveProperty('referenceDocStyles');
    expect(profile).not.toHaveProperty('referenceDocUrl');
  });

  it('names an unnamed journal rather than exporting a blank', () => {
    expect(buildJournalProfile({ name: '   ' }).name).toBe('Journal profile');
  });
});

describe('journal profile round trip', () => {
  it('comes back as the profile that left', () => {
    const profile = buildJournalProfile(journal);
    const json = serializeJournalProfile(profile, '2026-08-25T00:00:00.000Z');

    expect(parseJournalProfile(json)).toEqual(profile);
    expect(JSON.parse(json)).toMatchObject({
      format: 'researcher-journal-profile',
      schemaVersion: 1,
      exportedAt: '2026-08-25T00:00:00.000Z',
    });
  });

  it('keeps the profile key, so a workspace links its own copy', () => {
    const restored = parseJournalProfile(
      serializeJournalProfile(
        buildJournalProfile(journal),
        '2026-08-25T00:00:00.000Z',
      ),
    );

    expect(journalProfileRecordInput(restored).profileKey).toBe(
      'copernicus-atmospheric-measurement-techniques',
    );
  });
});

describe('parseJournalProfile', () => {
  const wrap = (profile: unknown, overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: 'researcher-journal-profile',
      schemaVersion: 1,
      exportedAt: '2026-08-25T00:00:00.000Z',
      profile,
      ...overrides,
    });

  it('refuses a file that is not a profile', () => {
    expect(() => parseJournalProfile('not json at all')).toThrow(
      /not valid JSON/i,
    );
    expect(() => parseJournalProfile('{"format":"something-else"}')).toThrow(
      /unexpected format/i,
    );
    expect(() =>
      parseJournalProfile(wrap({ name: 'X' }, { schemaVersion: 99 })),
    ).toThrow(/v99/);
    expect(() => parseJournalProfile(wrap({}))).toThrow(/no name/i);
  });

  it('drops what it does not recognise instead of writing it to the record', () => {
    const restored = parseJournalProfile(
      wrap({
        name: 'House style',
        bodyFontSize: 11,
        // Not a profile field: a file from elsewhere must not be able to set
        // arbitrary columns on the record.
        manuscriptId: 'someone-elses-paper',
        __proto__: { polluted: true },
      }),
    );

    expect(restored).toEqual({ name: 'House style', bodyFontSize: 11 });
    expect(journalProfileRecordInput(restored)).not.toHaveProperty(
      'manuscriptId',
    );
  });

  it('drops a value of the wrong type rather than coercing it', () => {
    // Half-applying a profile is worse than refusing the field: the author
    // would be formatting against settings they never chose.
    const restored = parseJournalProfile(
      wrap({
        name: 'Odd',
        bodyFontSize: 'twelve',
        sectionNumbering: 'yes',
        requiredArtifacts: 'COVER_LETTER',
        keywordMaximum: 8,
      }),
    );

    expect(restored).toEqual({ name: 'Odd', keywordMaximum: 8 });
  });
});

describe('journalProfileFilename', () => {
  it('slugifies the journal name', () => {
    expect(
      journalProfileFilename('Atmospheric Measurement Techniques (Copernicus)'),
    ).toBe('atmospheric-measurement-techniques-copernicus-profile.json');
    expect(journalProfileFilename('   ')).toBe('journal-profile.json');
  });
});
