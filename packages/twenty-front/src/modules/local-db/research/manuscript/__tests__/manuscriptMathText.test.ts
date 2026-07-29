import { latexToUnicodeText } from '@/local-db/research/manuscript/manuscriptMathText';

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
