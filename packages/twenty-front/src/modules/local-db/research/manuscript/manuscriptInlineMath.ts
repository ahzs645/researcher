// Inline maths in prose: `the completeness $C_j$ of window $j$`.
//
// The HTML export has always rendered these as MathML. Word and PDF did not —
// they took the paragraph as one string, so `$C_j$` printed with its dollar
// signs and its subscript flat on the baseline. That is the difference the
// author is looking at when they compare our Word file with theirs: a display
// equation is a real Word equation object, but the same symbol named in the
// sentence beside it was just letters.
//
// The grammar is the one the Markdown renderer already implements — `$…$`, no
// newline and no `$` inside — so a document reads the same in every export.
// What is new here is refusing the matches that are not maths at all: prices
// (`$5 and $10`) and code fences.

import { latexToScriptedText } from './manuscriptMathText';

export type InlineMathSegment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; latex: string };

// Same shape as the Markdown renderer's rule. Applied only after the guards
// below have ruled out the non-mathematical readings of a `$`.
const INLINE_MATH = /\$([^$\n]+)\$/g;
const CODE_SPAN = /`[^`\n]*`/g;

// "$5 and $10" is two prices, not the maths "5 and 1". A currency amount is a
// digit or a separator run straight after the opening `$`, and real inline
// maths that starts with a number is vanishingly rare next to how common
// money is in a paper's cost and funding statements.
const CURRENCY = /^[\d.,]/;

// Nothing between the delimiters but spaces is a stray pair, not an equation.
const isMathBody = (latex: string): boolean =>
  latex.trim().length > 0 && !CURRENCY.test(latex);

export const hasInlineMath = (value: string): boolean =>
  splitInlineMath(value).some((segment) => segment.kind === 'math');

// Split a run of prose into alternating text and maths. Text segments keep
// their exact characters — including the dollars of any `$` that was not
// maths — so a caller can render them unchanged.
export const splitInlineMath = (value: string): InlineMathSegment[] => {
  if (!value.includes('$')) return [{ kind: 'text', value }];

  // A `$` inside a code span is code. Blank the spans out for matching only;
  // offsets are preserved so the slices below still index the real string.
  const searchable = value.replace(CODE_SPAN, (span) =>
    ' '.repeat(span.length),
  );

  const segments: InlineMathSegment[] = [];
  let cursor = 0;
  const pushText = (text: string): void => {
    if (text.length === 0) return;
    const previous = segments[segments.length - 1];
    if (previous?.kind === 'text') previous.value += text;
    else segments.push({ kind: 'text', value: text });
  };

  INLINE_MATH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_MATH.exec(searchable)) !== null) {
    const latex = match[1];
    if (!isMathBody(latex)) {
      // Step back over the closing delimiter: it may open the next pair.
      INLINE_MATH.lastIndex = match.index + 1;
      continue;
    }
    pushText(value.slice(cursor, match.index));
    segments.push({ kind: 'math', latex: latex.trim() });
    cursor = match.index + match[0].length;
  }
  pushText(value.slice(cursor));

  return segments.length > 0 ? segments : [{ kind: 'text', value }];
};

// For renderers that cannot typeset maths — the PDF export draws text, not
// OMML — flatten each `$…$` to the linearized form the display equations
// already use, so a symbol reads the same in both places and no dollar sign
// reaches the page.
export const linearizeInlineMath = (value: string): string =>
  splitInlineMath(value)
    .map((segment) =>
      segment.kind === 'math'
        ? latexToScriptedText(segment.latex)
        : segment.value,
    )
    .join('');

// Markdown claims the characters maths is written with: `$\bar{x}_j$ … $b_{abs}$`
// reads to a Markdown parser as an italic run opened at the first underscore
// and closed at the second, and the underscores are eaten on the way through.
// So each maths span is swapped for a placeholder before the prose is parsed
// and put back afterwards. The delimiter is an invisible operator character:
// it takes no width, carries no Markdown meaning, and cannot occur in prose.
const MATH_PLACEHOLDER = '\u2062';

export type ProtectedInlineMath = { text: string; math: string[] };

export const protectInlineMath = (markdown: string): ProtectedInlineMath => {
  const math: string[] = [];
  const text = splitInlineMath(markdown)
    .map((segment) =>
      segment.kind === 'math'
        ? `${MATH_PLACEHOLDER}${math.push(segment.latex) - 1}${MATH_PLACEHOLDER}`
        : segment.value,
    )
    .join('');
  return { text, math };
};

export const restoreInlineMath = (
  value: string,
  math: readonly string[],
): string =>
  math.length === 0
    ? value
    : value.replace(
        new RegExp(`${MATH_PLACEHOLDER}(\\d+)${MATH_PLACEHOLDER}`, 'g'),
        (token, index: string) => {
          const latex = math[Number(index)];
          return latex === undefined ? token : `$${latex}$`;
        },
      );
