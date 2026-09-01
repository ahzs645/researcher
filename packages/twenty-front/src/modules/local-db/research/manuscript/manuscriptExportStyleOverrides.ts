import { isManuscriptDocxStylesXml } from './manuscriptDocxTemplate';
import { type CitationMode, type JournalStyle } from './manuscriptTypes';
import { isVendoredCslStyleId } from './manuscriptCiteproc';

export const MANUSCRIPT_EXPORT_STYLE_OVERRIDE_KEYS = [
  'citationMode',
  'citationStyleId',
  'figureLabelFormat',
  'tableLabelFormat',
  'supplementPrefix',
  'numberingScope',
  'keepSourceNumbers',
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
  'titlePageTemplate',
  'referenceDocUrl',
  'referenceDocStyles',
  'fontFamily',
  'bodyFontSize',
  'titleFontSize',
  'headingFontSize',
  'subheadingFontSize',
  'headingColor',
  'lineSpacing',
  'abstractLineSpacing',
  'paragraphSpacingAfter',
  'paragraphFirstLineIndent',
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

export const CITATION_MODES: CitationMode[] = [
  'NUMERIC',
  'NUMERIC_SUPERSCRIPT',
  'AUTHOR_DATE',
  'AUTHOR_NUMBER',
];

export const CITATION_MODE_SETTING_KEYS = [
  'citationStyleId',
  'crossRefFormat',
] as const satisfies ReadonlyArray<keyof JournalStyle>;

export type CitationModeSettingKey =
  (typeof CITATION_MODE_SETTING_KEYS)[number];
export type CitationModeStyleSettings = Partial<
  Pick<JournalStyle, CitationModeSettingKey>
>;
export type CitationModeSettings = Record<string, CitationModeStyleSettings>;

export type ManuscriptExportStyleOverrides = Partial<
  Pick<JournalStyle, ManuscriptExportStyleOverrideKey>
> & {
  citationModeSettings?: CitationModeSettings;
};

// Exported so the journal-profile reader validates against the same field
// types the override serializer already knows, rather than a second list that
// would drift.
export const STRING_FIELDS = new Set<ManuscriptExportStyleOverrideKey>([
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
  'titlePageTemplate',
  'referenceDocUrl',
  'referenceDocStyles',
  'fontFamily',
  'headingColor',
  'bodyAlignment',
  'affiliationAlignment',
  'affiliationNumberStyle',
  'tableStyle',
]);

export const NUMBER_FIELDS = new Set<ManuscriptExportStyleOverrideKey>([
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

export const BOOLEAN_FIELDS = new Set<ManuscriptExportStyleOverrideKey>([
  'keepSourceNumbers',
  'supplementCoverPage',
  'lineNumbering',
  'pageNumbering',
  'sectionNumbering',
  'twoColumn',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isCitationMode = (value: unknown): value is CitationMode =>
  typeof value === 'string' &&
  CITATION_MODES.some((citationMode) => citationMode === value);

export const citationModeFromStyle = (
  value: string | null | undefined,
): CitationMode => (isCitationMode(value) ? value : 'NUMERIC');

const emptyCitationModeSettings = (): CitationModeSettings => ({
  NUMERIC: {},
  NUMERIC_SUPERSCRIPT: {},
  AUTHOR_DATE: {},
  AUTHOR_NUMBER: {},
});

export const citationStyleKeyFromStyle = (style: JournalStyle): string =>
  isVendoredCslStyleId(style.citationStyleId)
    ? style.citationStyleId
    : citationModeFromStyle(style.citationMode);

const sanitizeCitationStyleSettings = (
  value: unknown,
): CitationModeStyleSettings => {
  if (!isRecord(value)) return {};
  const settings: CitationModeStyleSettings = {};
  for (const key of CITATION_MODE_SETTING_KEYS) {
    if (typeof value[key] === 'string') {
      settings[key] = value[key];
    }
  }
  return settings;
};

export const parseManuscriptExportStyleOverrides = (
  serialized: string | null | undefined,
): ManuscriptExportStyleOverrides => {
  if (serialized === null || serialized === undefined || serialized === '') {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) return {};

    const sanitized: Record<
      string,
      string | number | boolean | CitationModeSettings
    > = {};
    for (const key of MANUSCRIPT_EXPORT_STYLE_OVERRIDE_KEYS) {
      const value = parsed[key];
      if (key === 'citationMode' && isCitationMode(value)) {
        sanitized[key] = value;
      } else if (
        key !== 'citationMode' &&
        STRING_FIELDS.has(key) &&
        typeof value === 'string'
      ) {
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
    if (isRecord(parsed.citationModeSettings)) {
      const citationModeSettings = emptyCitationModeSettings();
      for (const [citationStyleKey, settings] of Object.entries(
        parsed.citationModeSettings,
      )) {
        if (
          !isCitationMode(citationStyleKey) &&
          !isVendoredCslStyleId(citationStyleKey)
        ) {
          continue;
        }
        citationModeSettings[citationStyleKey] =
          sanitizeCitationStyleSettings(settings);
      }
      sanitized.citationModeSettings = citationModeSettings;
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

// An imported .docx brings its own Word styles. Adopting them as the export
// style base is what makes the exported file a drop-in replacement for the
// document the author already has — but only when they have not chosen a
// template themselves, because an explicit choice outranks an inferred one.
export const withImportedSourceStyles = (
  serialized: string | null | undefined,
  sourceStylesXml: string | null | undefined,
  sourceDocumentName: string | null | undefined,
): string | undefined => {
  if (!isManuscriptDocxStylesXml(sourceStylesXml)) return undefined;
  const overrides = parseManuscriptExportStyleOverrides(serialized);
  if (isManuscriptDocxStylesXml(overrides.referenceDocStyles)) return undefined;

  const name = sourceDocumentName?.trim();
  return serializeManuscriptExportStyleOverrides({
    ...overrides,
    referenceDocStyles: sourceStylesXml,
    ...(name !== undefined && name.length > 0 ? { referenceDocUrl: name } : {}),
  });
};

export const citationSettingsForMode = (
  overrides: ManuscriptExportStyleOverrides,
  citationMode: CitationMode,
): CitationModeStyleSettings =>
  citationSettingsForStyle(overrides, citationMode);

export const citationSettingsForStyle = (
  overrides: ManuscriptExportStyleOverrides,
  citationStyleKey: string,
): CitationModeStyleSettings => ({
  ...(overrides.citationModeSettings?.[citationStyleKey] ?? {}),
});

export const withCitationModeSetting = (
  overrides: ManuscriptExportStyleOverrides,
  citationStyleKey: string,
  setting: CitationModeStyleSettings,
): ManuscriptExportStyleOverrides => {
  const sanitizedSetting = sanitizeCitationStyleSettings(setting);
  const citationModeSettings: CitationModeSettings = {
    ...emptyCitationModeSettings(),
    ...overrides.citationModeSettings,
    [citationStyleKey]: {
      ...citationSettingsForStyle(overrides, citationStyleKey),
      ...sanitizedSetting,
    },
  };
  return {
    ...overrides,
    ...sanitizedSetting,
    citationModeSettings,
  };
};

export const withCitationStyle = (
  overrides: ManuscriptExportStyleOverrides,
  activeStyleKey: string,
  nextStyleKey: string,
): ManuscriptExportStyleOverrides => {
  const activeFlatSettings = sanitizeCitationStyleSettings(overrides);
  const citationModeSettings: CitationModeSettings = {
    ...emptyCitationModeSettings(),
    ...overrides.citationModeSettings,
    [activeStyleKey]: {
      ...citationSettingsForStyle(overrides, activeStyleKey),
      ...activeFlatSettings,
    },
  };
  const nextSettings = citationModeSettings[nextStyleKey] ?? {};
  const withoutFlatSettings = { ...overrides };
  for (const key of CITATION_MODE_SETTING_KEYS) {
    delete withoutFlatSettings[key];
  }

  if (isCitationMode(nextStyleKey)) {
    return {
      ...withoutFlatSettings,
      ...nextSettings,
      citationMode: nextStyleKey,
      citationStyleId: '',
      citationModeSettings,
    };
  }

  return {
    ...withoutFlatSettings,
    ...nextSettings,
    citationStyleId: nextStyleKey,
    citationModeSettings,
  };
};

export const withCitationMode = (
  overrides: ManuscriptExportStyleOverrides,
  activeMode: CitationMode,
  nextMode: CitationMode,
): ManuscriptExportStyleOverrides =>
  withCitationStyle(overrides, activeMode, nextMode);
