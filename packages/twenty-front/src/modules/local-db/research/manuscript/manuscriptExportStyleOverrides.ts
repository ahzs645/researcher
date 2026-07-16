import { type JournalStyle } from './manuscriptTypes';

export const MANUSCRIPT_EXPORT_STYLE_OVERRIDE_KEYS = [
  'citationMode',
  'citationStyleId',
  'figureLabelFormat',
  'tableLabelFormat',
  'supplementPrefix',
  'numberingScope',
  'crossRefFormat',
  'figureCaptionPosition',
  'figureCaptionFontSize',
  'figureCaptionLineSpacing',
  'figureCaptionGap',
  'figureCaptionSpacingAfter',
  'tableCaptionPosition',
  'figurePageLayout',
  'supplementStartLayout',
  'supplementCoverPage',
  'lineNumbering',
  'pageNumbering',
  'sectionNumbering',
  'twoColumn',
  'frontMatterLayout',
  'fontFamily',
  'bodyFontSize',
  'titleFontSize',
  'headingFontSize',
  'subheadingFontSize',
  'headingColor',
  'lineSpacing',
  'abstractLineSpacing',
  'paragraphSpacingAfter',
  'bodyAlignment',
  'affiliationAlignment',
  'affiliationNumberStyle',
  'affiliationLineSpacing',
  'affiliationSpacingAfter',
  'tableStyle',
  'tableFontSize',
  'tableLineSpacing',
] as const satisfies ReadonlyArray<keyof JournalStyle>;

export type ManuscriptExportStyleOverrideKey =
  (typeof MANUSCRIPT_EXPORT_STYLE_OVERRIDE_KEYS)[number];

export type ManuscriptExportStyleOverrides = Partial<
  Pick<JournalStyle, ManuscriptExportStyleOverrideKey>
>;

const STRING_FIELDS = new Set<ManuscriptExportStyleOverrideKey>([
  'citationMode',
  'citationStyleId',
  'figureLabelFormat',
  'tableLabelFormat',
  'supplementPrefix',
  'numberingScope',
  'crossRefFormat',
  'figureCaptionPosition',
  'tableCaptionPosition',
  'figurePageLayout',
  'supplementStartLayout',
  'frontMatterLayout',
  'fontFamily',
  'headingColor',
  'bodyAlignment',
  'affiliationAlignment',
  'affiliationNumberStyle',
  'tableStyle',
]);

const NUMBER_FIELDS = new Set<ManuscriptExportStyleOverrideKey>([
  'figureCaptionFontSize',
  'figureCaptionLineSpacing',
  'figureCaptionGap',
  'figureCaptionSpacingAfter',
  'bodyFontSize',
  'titleFontSize',
  'headingFontSize',
  'subheadingFontSize',
  'lineSpacing',
  'abstractLineSpacing',
  'paragraphSpacingAfter',
  'affiliationLineSpacing',
  'affiliationSpacingAfter',
  'tableFontSize',
  'tableLineSpacing',
]);

const BOOLEAN_FIELDS = new Set<ManuscriptExportStyleOverrideKey>([
  'supplementCoverPage',
  'lineNumbering',
  'pageNumbering',
  'sectionNumbering',
  'twoColumn',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseManuscriptExportStyleOverrides = (
  serialized: string | null | undefined,
): ManuscriptExportStyleOverrides => {
  if (serialized === null || serialized === undefined || serialized === '') {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return {};

    const sanitized: Record<string, string | number | boolean> = {};
    for (const key of MANUSCRIPT_EXPORT_STYLE_OVERRIDE_KEYS) {
      const value = parsed[key];
      if (STRING_FIELDS.has(key) && typeof value === 'string') {
        sanitized[key] = value;
      } else if (
        NUMBER_FIELDS.has(key) &&
        typeof value === 'number' &&
        Number.isFinite(value)
      ) {
        sanitized[key] = value;
      } else if (BOOLEAN_FIELDS.has(key) && typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }
    return sanitized as ManuscriptExportStyleOverrides;
  } catch {
    return {};
  }
};

export const serializeManuscriptExportStyleOverrides = (
  overrides: ManuscriptExportStyleOverrides,
): string =>
  JSON.stringify(
    parseManuscriptExportStyleOverrides(JSON.stringify(overrides)),
  );
