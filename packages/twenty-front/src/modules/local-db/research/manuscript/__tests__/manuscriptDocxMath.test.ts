import { Math as DocxMath, Paragraph } from 'docx';

import { latexToMathComponents } from '@/local-db/research/manuscript/manuscriptDocxMath';

// Walks the OMML tree and concatenates its text runs, which is enough to assert
// that nothing is silently dropped on the way to Word.
const flattenText = (node: unknown): string => {
  if (node === null || node === undefined) return '';
  const element = node as { rootKey?: string; root?: unknown[] };
  if (element.rootKey === 'm:t') return String(element.root?.[0] ?? '');
  return Array.isArray(element.root)
    ? element.root.map(flattenText).join('')
    : '';
};

const render = (latex: string): string =>
  latexToMathComponents(latex).map(flattenText).join('');

describe('DOCX math conversion', () => {
  it('creates native math components for fractions and subscripts', () => {
    const components = latexToMathComponents(
      'C_{f}=\\frac{C_{metal}}{C_{background}}',
    );
    const math = new DocxMath({ children: components });
    const paragraph = new Paragraph({ children: [math] });

    expect(components).toHaveLength(3);
    expect(paragraph).toBeInstanceOf(Paragraph);
  });

  it('supports summation limits, superscripts, and common symbols', () => {
    const components = latexToMathComponents('\\sum_{i=1}^{n} C_{f} \\geq 1');

    expect(components.length).toBeGreaterThan(3);
  });

  it('keeps every character of a multi-character upright group', () => {
    expect(render('\\mathrm{abs}')).toBe('abs');
    expect(render('\\text{naive}')).toBe('naive');
    expect(render('\\operatorname{duration}')).toBe('duration');
    expect(render('{abs}')).toBe('abs');
  });

  it('keeps upright groups used as subscripts', () => {
    expect(render('b_{\\mathrm{abs}}')).toBe('babs');
    expect(render('b_{\\mathrm{abs},\\lambda,i}')).toBe('babs,λ,i');
  });

  it('still applies scripts to a group base', () => {
    expect(render('\\mathrm{abs}_1')).toBe('abs1');
    expect(render('x^{2}')).toBe('x2');
  });

  it('renders fraction variants', () => {
    expect(render('\\dfrac{a}{b}')).toBe('ab');
    expect(render('\\tfrac{a}{b}')).toBe('ab');
  });

  it('renders accents as combining marks rather than literal command names', () => {
    expect(render('\\bar{x}')).toBe('x\u0304');
    expect(render('\\hat{y}')).toBe('y\u0302');
    expect(render('\\overline{x}')).toBe('x\u0304');
  });

  it('treats spacing macros as whitespace, not punctuation', () => {
    expect(render('a\\,b')).toBe('a b');
    expect(render('a\\!b')).toBe('ab');
  });

  it('maps set and relation symbols', () => {
    expect(render('I \\cap W')).toBe('I ∩ W');
    expect(render('a \\approx b')).toBe('a ≈ b');
    expect(render('a \\neq b')).toBe('a ≠ b');
  });

  it('passes unicode symbols through untouched', () => {
    expect(render('I_i ∩ W_j')).toBe('Ii ∩ Wj');
  });

  it('renders a full manuscript equation without dropping terms', () => {
    expect(
      render(
        'b_{\\mathrm{abs},\\lambda,i} = \\frac{b_{\\mathrm{ATN},\\lambda,i}}{C_{\\lambda} R_{\\lambda}(\\mathrm{ATN}_{\\lambda,i})}',
      ),
    ).toBe('babs,λ,i = bATN,λ,iCλ Rλ(ATNλ,i)');
  });
});
