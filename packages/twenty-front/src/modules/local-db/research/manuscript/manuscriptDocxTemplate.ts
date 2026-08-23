import { strFromU8, unzipSync } from 'fflate';

// "Use my own Word template." A .docx is a ZIP whose `word/styles.xml` holds
// every named style plus the document defaults — the whole of what makes a
// thesis template look like that thesis template. Lifting just that part means
// the app stores tens of kilobytes of style definitions instead of a
// multi-megabyte file, and the DOCX exporter can hand it straight to `docx` as
// its style base.
//
// The result is kept with the manuscript's export settings rather than on the
// journal profile, because the stored value is large enough that it has no
// business becoming a database index key on a shared record.

const STYLES_PART = 'word/styles.xml';

// Comfortably above a real template (a 42-style thesis template is ~42 KB) and
// far below anything that would bloat the manuscript record.
export const MAX_TEMPLATE_STYLES_BYTES = 512_000;

export type ManuscriptDocxTemplateResult =
  | { ok: true; stylesXml: string; styleCount: number }
  | { ok: false; reason: 'NOT_A_WORD_FILE' | 'NO_STYLES' | 'TOO_LARGE' };

export const isManuscriptDocxStylesXml = (
  value: string | null | undefined,
): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  /<w:styles[\s>]/.test(value) &&
  value.length <= MAX_TEMPLATE_STYLES_BYTES;

export const manuscriptDocxStyleCount = (stylesXml: string): number =>
  (stylesXml.match(/<w:style\b/g) ?? []).length;

// Pull the styles part out of a .docx, saying why when it cannot.
export const readManuscriptDocxTemplate = (
  docxBytes: Uint8Array,
): ManuscriptDocxTemplateResult => {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(docxBytes, {
      filter: (file) => file.name === STYLES_PART,
    });
  } catch {
    return { ok: false, reason: 'NOT_A_WORD_FILE' };
  }

  const stylesBytes = files[STYLES_PART];
  if (stylesBytes === undefined) return { ok: false, reason: 'NO_STYLES' };
  if (stylesBytes.length > MAX_TEMPLATE_STYLES_BYTES) {
    return { ok: false, reason: 'TOO_LARGE' };
  }

  const stylesXml = strFromU8(stylesBytes);
  return isManuscriptDocxStylesXml(stylesXml)
    ? { ok: true, stylesXml, styleCount: manuscriptDocxStyleCount(stylesXml) }
    : { ok: false, reason: 'NO_STYLES' };
};

const REJECTION_MESSAGE: Record<
  Extract<ManuscriptDocxTemplateResult, { ok: false }>['reason'],
  string
> = {
  NOT_A_WORD_FILE: 'That file is not a Word document.',
  NO_STYLES: 'That Word document has no style definitions to borrow.',
  TOO_LARGE: 'That template’s style definitions are too large to store.',
};

export const manuscriptDocxTemplateRejection = (
  result: Extract<ManuscriptDocxTemplateResult, { ok: false }>,
): string => REJECTION_MESSAGE[result.reason];

// A short human description of a stored template, for the settings UI.
export const describeManuscriptDocxTemplate = (
  stylesXml: string | null | undefined,
  fileName: string | null | undefined,
): string => {
  if (!isManuscriptDocxStylesXml(stylesXml)) {
    return 'No template — using the journal profile above';
  }
  const named = fileName?.trim();
  return `${named !== undefined && named.length > 0 ? named : 'Word template'} · ${manuscriptDocxStyleCount(stylesXml)} styles`;
};
