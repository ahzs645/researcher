import { Math as DocxMath, Paragraph } from 'docx';

import { latexToMathComponents } from '@/local-db/research/manuscript/manuscriptDocxMath';

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
});
