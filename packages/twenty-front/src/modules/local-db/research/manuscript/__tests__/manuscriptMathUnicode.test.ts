import { latexToUnicodeText } from '@/local-db/research/manuscript/manuscriptMathText';
import { unicodeMathToLatex } from '@/local-db/research/manuscript/manuscriptMathUnicode';

describe('unicodeMathToLatex', () => {
  it('names the symbols a Word layout table flattened to characters', () => {
    expect(unicodeMathToLatex('ATNλ(t) = 100 ln[I0,λ(t) / Iλ(t)]')).toBe(
      'ATN\\lambda(t) = 100 ln[I0,\\lambda(t) / I\\lambda(t)]',
    );
    expect(unicodeMathToLatex('dij = duration(Ii ∩ Wj), wij ≤ zi')).toBe(
      'dij = duration(Ii \\cap Wj), wij \\leq zi',
    );
    // A minus sign is a minus sign, not a hyphen glyph command.
    expect(unicodeMathToLatex('a − b')).toBe('a - b');
  });

  it('reads sub/superscript runs, including a separated pair', () => {
    expect(unicodeMathToLatex('b₁ = bff,₂ r⁻ᵅ')).toBe(
      'b_{1} = bff,_{2} r^{-\\alpha}',
    );
    // "AAE₁,₂" is one subscript over both indices.
    expect(unicodeMathToLatex('AAE₁,₂ = 3')).toBe('AAE_{1,2} = 3');
    expect(unicodeMathToLatex('s²j,w')).toBe('s^{2}j,w');
  });

  it('reads a combining accent and a summation written against its index', () => {
    expect(unicodeMathToLatex('x̄j,time = Σi wij xi / Σi wij')).toBe(
      '\\bar{x}j,time = \\sum_{i} wij xi / \\sum_{i} wij',
    );
  });

  it('never invents structure the characters do not state', () => {
    // "wij" could be one variable or three; only the author knows, so it is
    // left exactly as written.
    expect(unicodeMathToLatex('wij = zi dij')).toBe('wij = zi dij');
    expect(unicodeMathToLatex('Plain prose, no maths')).toBe(
      'Plain prose, no maths',
    );
  });

  it('leaves LaTeX from the OMML importer untouched', () => {
    const latex = '\\frac{a}{b} = \\sum_{i} x_{i}';
    expect(unicodeMathToLatex(latex)).toBe(latex);
  });

  it('round-trips back to the glyphs the source showed', () => {
    // The PDF path linearizes LaTeX to Unicode, so a converted equation still
    // reads as the author wrote it wherever maths cannot be typeset.
    expect(latexToUnicodeText(unicodeMathToLatex('Cj = Σi zi dij'))).toBe(
      'Cj = ∑ᵢ zi dij',
    );
  });
});
