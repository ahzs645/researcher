import {
  citationSettingsForMode,
  citationSettingsForStyle,
  parseManuscriptExportStyleOverrides,
  serializeManuscriptExportStyleOverrides,
  withCitationMode,
  withCitationModeSetting,
  withCitationStyle,
} from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';

describe('manuscript export style overrides', () => {
  it('round-trips supported string, number, and boolean fields', () => {
    const serialized = serializeManuscriptExportStyleOverrides({
      fontFamily: 'Arial',
      bodyFontSize: 11,
      pageNumbering: true,
      supplementCoverPage: false,
    });

    expect(parseManuscriptExportStyleOverrides(serialized)).toEqual({
      fontFamily: 'Arial',
      bodyFontSize: 11,
      pageNumbering: true,
      supplementCoverPage: false,
    });
  });

  it('ignores unknown, invalid, and non-finite values', () => {
    expect(
      parseManuscriptExportStyleOverrides(
        JSON.stringify({
          name: 'Do not override the profile name',
          bodyFontSize: '12',
          lineSpacing: null,
          headingColor: 'BLACK',
          twoColumn: true,
        }),
      ),
    ).toEqual({ headingColor: 'BLACK', twoColumn: true });
  });

  it('returns an empty override for invalid JSON', () => {
    expect(parseManuscriptExportStyleOverrides('{invalid')).toEqual({});
  });

  it('round-trips sanitized settings independently for every citation mode', () => {
    const serialized = serializeManuscriptExportStyleOverrides({
      citationMode: 'AUTHOR_DATE',
      citationStyleId: 'apa',
      citationModeSettings: {
        NUMERIC: {
          citationStyleId: 'nature',
          crossRefFormat: 'Fig. {n}',
        },
        NUMERIC_SUPERSCRIPT: {},
        AUTHOR_DATE: {
          citationStyleId: 'apa',
          crossRefFormat: 'Figure {n}',
        },
        AUTHOR_NUMBER: {},
        apa: {
          crossRefFormat: 'Figure {n}',
        },
      },
    });
    const parsed = parseManuscriptExportStyleOverrides(serialized);

    expect(citationSettingsForMode(parsed, 'NUMERIC')).toEqual({
      citationStyleId: 'nature',
      crossRefFormat: 'Fig. {n}',
    });
    expect(citationSettingsForMode(parsed, 'AUTHOR_DATE')).toEqual({
      citationStyleId: 'apa',
      crossRefFormat: 'Figure {n}',
    });
    expect(citationSettingsForMode({}, 'AUTHOR_NUMBER')).toEqual({});
    expect(citationSettingsForStyle(parsed, 'apa')).toEqual({
      crossRefFormat: 'Figure {n}',
    });
  });

  it('stores citation controls under the active mode while keeping flat overrides effective', () => {
    const next = withCitationModeSetting(
      { citationMode: 'AUTHOR_DATE', bodyFontSize: 11 },
      'AUTHOR_DATE',
      { citationStyleId: 'apa', crossRefFormat: 'Figure {n}' },
    );

    expect(next).toMatchObject({
      citationMode: 'AUTHOR_DATE',
      citationStyleId: 'apa',
      crossRefFormat: 'Figure {n}',
      bodyFontSize: 11,
    });
    expect(citationSettingsForMode(next, 'AUTHOR_DATE')).toEqual({
      citationStyleId: 'apa',
      crossRefFormat: 'Figure {n}',
    });
  });

  it('swaps saved lightweight-mode settings and clears the CSL selector', () => {
    const authorDate = withCitationMode(
      {
        citationMode: 'NUMERIC',
        crossRefFormat: 'Fig. {n}',
        citationModeSettings: {
          NUMERIC: {},
          NUMERIC_SUPERSCRIPT: {},
          AUTHOR_DATE: {
            crossRefFormat: 'Figure {n}',
          },
          AUTHOR_NUMBER: {},
        },
      },
      'NUMERIC',
      'AUTHOR_DATE',
    );

    expect(authorDate).toMatchObject({
      citationMode: 'AUTHOR_DATE',
      citationStyleId: '',
      crossRefFormat: 'Figure {n}',
    });
    expect(citationSettingsForMode(authorDate, 'NUMERIC')).toEqual({
      crossRefFormat: 'Fig. {n}',
    });

    const numeric = withCitationMode(authorDate, 'AUTHOR_DATE', 'NUMERIC');
    expect(numeric).toMatchObject({
      citationMode: 'NUMERIC',
      citationStyleId: '',
      crossRefFormat: 'Fig. {n}',
    });
  });

  it('persists controls independently under CSL style ids', () => {
    const springer = withCitationStyle(
      {
        citationMode: 'AUTHOR_DATE',
        citationStyleId: 'apa',
        crossRefFormat: 'Figure {n}',
        citationModeSettings: {
          NUMERIC: {},
          NUMERIC_SUPERSCRIPT: {},
          AUTHOR_DATE: {},
          AUTHOR_NUMBER: {},
          'springer-basic-author-date': {
            crossRefFormat: 'Fig. {n}',
          },
        },
      },
      'apa',
      'springer-basic-author-date',
    );

    expect(springer).toMatchObject({
      citationStyleId: 'springer-basic-author-date',
      crossRefFormat: 'Fig. {n}',
    });
    expect(springer.citationModeSettings?.apa).toMatchObject({
      citationStyleId: 'apa',
      crossRefFormat: 'Figure {n}',
    });

    const apa = withCitationStyle(
      springer,
      'springer-basic-author-date',
      'apa',
    );
    expect(apa).toMatchObject({
      citationStyleId: 'apa',
      crossRefFormat: 'Figure {n}',
    });
  });
});
