import {
  parseManuscriptExportStyleOverrides,
  serializeManuscriptExportStyleOverrides,
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
});
