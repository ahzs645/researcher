import {
  latexToScriptedText,
  latexToUnicodeText,
} from '@/local-db/research/manuscript/manuscriptMathText';
import { manuscriptScriptSegments } from '@/local-db/research/manuscript/manuscriptScripts';

describe('latexToUnicodeText', () => {
  it('converts Greek letters and operators from the glyph tables', () => {
    expect(latexToUnicodeText('\\alpha \\times \\beta \\leq \\gamma')).toBe(
      'α × β ≤ γ',
    );
    expect(latexToUnicodeText('\\sum_{i=1}^{n} x_i')).toBe('∑ᵢ₌₁ⁿ xᵢ');
  });

  it('linearizes fractions with parentheses only when needed', () => {
    expect(latexToUnicodeText('\\frac{a}{b}')).toBe('a/b');
    expect(latexToUnicodeText('\\frac{a+b}{c}')).toBe('(a+b)/c');
    expect(latexToUnicodeText('\\frac{C_{i}}{C_{ref}}')).toBe('Cᵢ/C_(ref)');
  });

  it('maps scripts to Unicode and falls back for unmappable letters', () => {
    expect(latexToUnicodeText('x^{2}')).toBe('x²');
    expect(latexToUnicodeText('C_{i}')).toBe('Cᵢ');
    expect(latexToUnicodeText('x_{10}')).toBe('x₁₀');
    // Unbraced scripts bind a single token, exactly like LaTeX.
    expect(latexToUnicodeText('x_10')).toBe('x₁0');
    expect(latexToUnicodeText('v_{crustal}')).toBe('v_(crustal)');
  });

  it('handles the enrichment-factor equation from the thesis', () => {
    expect(
      latexToUnicodeText(
        'EF=\\frac{{(C_{i}/C_{ref})}_{aerosal}}{{(C_{i}/C_{ref})}_{crustal}}',
      ),
    ).toBe('EF=((Cᵢ/C_(ref))ₐₑᵣₒₛₐₗ)/((Cᵢ/C_(ref))_(crustal))');
  });

  it('handles roots, delimiters, accents and text wrappers', () => {
    expect(latexToUnicodeText('\\sqrt{x^{2}+1}')).toBe('√(x²+1)');
    expect(latexToUnicodeText('\\sqrt[3]{x}')).toBe('³√(x)');
    expect(latexToUnicodeText('\\left(\\frac{a}{b}\\right)')).toBe('(a/b)');
    expect(latexToUnicodeText('\\bar{x}')).toBe('x̄');
    expect(latexToUnicodeText('\\text{rate}_{max}')).toBe('rateₘₐₓ');
  });

  it('handles n-ary operators with limits', () => {
    expect(latexToUnicodeText('\\int_{0}^{\\infty} f(x)')).toBe('∫₀^∞ f(x)');
    expect(latexToUnicodeText('\\prod_{i} p_i')).toBe('∏ᵢ pᵢ');
  });

  it('degrades unknown commands and unbalanced groups to readable text', () => {
    expect(latexToUnicodeText('\\foo{x}')).toBe('foox');
    expect(latexToUnicodeText('a_{b')).toBe('a_{b');
  });
});

describe('latexToScriptedText', () => {
  it('marks the scripts Unicode has no character for', () => {
    // There is no subscript "d" or "f" in Unicode, so the linearizer keeps the
    // LaTeX marker and `C_{d}` reads as "C_d". A renderer that can lower a run
    // wants them marked instead.
    const segments = manuscriptScriptSegments(
      latexToScriptedText('C_{d}=\\sum_{i=1}^{n} C_{f}'),
    );

    expect(segments).toEqual([
      { text: 'C', position: 'BASELINE' },
      { text: 'd', position: 'SUBSCRIPT' },
      { text: '=∑ᵢ₌₁ⁿ C', position: 'BASELINE' },
      { text: 'f', position: 'SUBSCRIPT' },
    ]);
  });

  it('marks a multi-character script Unicode cannot raise or lower', () => {
    // "ref" has superscript characters and stays Unicode; "background" has no
    // subscript "b" or "g", and a capital has neither.
    expect(
      manuscriptScriptSegments(latexToScriptedText('C_{background}^{ref}')),
    ).toEqual([
      { text: 'C', position: 'BASELINE' },
      { text: 'background', position: 'SUBSCRIPT' },
      { text: 'ʳᵉᶠ', position: 'BASELINE' },
    ]);
    expect(manuscriptScriptSegments(latexToScriptedText('x^{Cd}'))).toEqual([
      { text: 'x', position: 'BASELINE' },
      { text: 'Cd', position: 'SUPERSCRIPT' },
    ]);
  });

  it('leaves a script Unicode can render alone', () => {
    expect(latexToScriptedText('x_i^2')).toBe('xᵢ²');
  });
});
