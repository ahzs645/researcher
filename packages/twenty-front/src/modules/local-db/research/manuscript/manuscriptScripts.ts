// BlockNote currently flattens imported Word runs to plain text. These
// zero-width delimiters keep the run boundaries without painting the
// mathematical "invisible operator" glyphs that some browser fonts expose.
const SUPERSCRIPT_START = '\u200B';
const SUPERSCRIPT_END = '\u200C';
const SUBSCRIPT_START = '\u200D';
const SUBSCRIPT_END = '\u2060';

export type ManuscriptScriptPosition = 'BASELINE' | 'SUPERSCRIPT' | 'SUBSCRIPT';

export type ManuscriptScriptSegment = {
  text: string;
  position: ManuscriptScriptPosition;
};

export const wrapManuscriptScript = (
  value: string,
  position: Exclude<ManuscriptScriptPosition, 'BASELINE'>,
): string =>
  position === 'SUPERSCRIPT'
    ? `${SUPERSCRIPT_START}${value}${SUPERSCRIPT_END}`
    : `${SUBSCRIPT_START}${value}${SUBSCRIPT_END}`;

export const stripManuscriptScriptMarkers = (value: string): string =>
  value.replace(/[\u200B-\u200D\u2060]/g, '');

export const hasManuscriptScripts = (value: string): boolean =>
  /[\u200B-\u200D\u2060]/.test(value);

export const manuscriptScriptSegments = (
  value: string,
): ManuscriptScriptSegment[] => {
  const segments: ManuscriptScriptSegment[] = [];
  let position: ManuscriptScriptPosition = 'BASELINE';
  let buffer = '';
  const flush = () => {
    if (buffer.length === 0) return;
    segments.push({ text: buffer, position });
    buffer = '';
  };

  for (const character of value) {
    const nextPosition =
      character === SUPERSCRIPT_START
        ? 'SUPERSCRIPT'
        : character === SUBSCRIPT_START
          ? 'SUBSCRIPT'
          : character === SUPERSCRIPT_END || character === SUBSCRIPT_END
            ? 'BASELINE'
            : undefined;
    if (nextPosition !== undefined) {
      flush();
      position = nextPosition;
    } else {
      buffer += character;
    }
  }
  flush();
  return segments;
};
