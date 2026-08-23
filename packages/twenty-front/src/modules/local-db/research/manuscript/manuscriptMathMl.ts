import katex from 'katex';

import { latexToUnicodeText } from './manuscriptMathText';

// LaTeX → MathML, so an exported HTML file typesets its own equations with
// nothing to fetch. KaTeX's `mathml` output needs no stylesheet and no web
// fonts (unlike its HTML output, which is why a CDN link used to be the only
// way to make exported equations render), and every current browser lays out
// MathML natively.
//
// The `<span class="katex">` wrapper KaTeX adds is dropped: it only exists to
// hook KaTeX's CSS, which a self-contained file deliberately does not ship.

const MATH_ELEMENT = /<math[\s\S]*<\/math>/;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type ManuscriptMathMlResult = {
  html: string;
  // False when the LaTeX could not be parsed, so callers can warn instead of
  // silently shipping a linearized approximation.
  typeset: boolean;
};

// Render one LaTeX body. Unparseable input degrades to the same readable
// Unicode linearization the PDF exporter uses, never to raw `\frac{a}{b}`.
export const latexToMathMl = (
  latex: string,
  displayMode: boolean,
): ManuscriptMathMlResult => {
  const source = latex.trim();
  if (source.length === 0) return { html: '', typeset: true };

  try {
    const rendered = katex.renderToString(source, {
      output: 'mathml',
      displayMode,
      throwOnError: true,
      strict: false,
    });
    const math = MATH_ELEMENT.exec(rendered)?.[0];
    if (math !== undefined) return { html: math, typeset: true };
  } catch {
    // Fall through to the linearized text.
  }

  const fallback = escapeHtml(latexToUnicodeText(source));
  return {
    html: displayMode
      ? `<span class="math-fallback math-fallback-display">${fallback}</span>`
      : `<span class="math-fallback">${fallback}</span>`,
    typeset: false,
  };
};
