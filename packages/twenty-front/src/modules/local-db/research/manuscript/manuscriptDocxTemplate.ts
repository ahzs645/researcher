import { strFromU8, unzipSync } from 'fflate';

// "Use my own Word template." A .docx is a ZIP whose `word/styles.xml` holds
// every named style plus the document defaults — the whole of what makes a
// thesis template look like that thesis template. Lifting just that part means
// the app stores ~50 KB of style definitions instead of a multi-megabyte file,
// and the DOCX exporter can hand it straight to `docx` as its style base.

const STYLES_PART = 'word/styles.xml';

// A styles part large enough to be a real template but small enough to keep in
// a settings field.
const MAX_STYLES_BYTES = 2_000_000;

export const isManuscriptDocxStylesXml = (
  value: string | null | undefined,
): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  /<w:styles[\s>]/.test(value) &&
  value.length <= MAX_STYLES_BYTES;

// Pull the styles part out of a .docx. Returns null when the file is not a
// Word document, has no styles part, or the part is implausibly large.
export const extractManuscriptDocxStyles = (
  docxBytes: Uint8Array,
): string | null => {
  try {
    const files = unzipSync(docxBytes, {
      filter: (file) =>
        file.name === STYLES_PART && file.originalSize <= MAX_STYLES_BYTES,
    });
    const stylesBytes = files[STYLES_PART];
    if (stylesBytes === undefined) return null;
    const xml = strFromU8(stylesBytes);
    return isManuscriptDocxStylesXml(xml) ? xml : null;
  } catch {
    return null;
  }
};

// A short human description of a stored template, for the settings UI.
export const describeManuscriptDocxTemplate = (
  stylesXml: string | null | undefined,
  fileName: string | null | undefined,
): string => {
  if (!isManuscriptDocxStylesXml(stylesXml))
    return 'No template — using the journal profile above';
  const styleCount = (stylesXml.match(/<w:style\b/g) ?? []).length;
  const named = fileName?.trim();
  return `${named !== undefined && named.length > 0 ? named : 'Word template'} · ${styleCount} styles`;
};
