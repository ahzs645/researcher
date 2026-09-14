import { manuscriptMathSvg } from '@/local-db/research/manuscript/manuscriptMathSvg';

describe('PDF vector equations', () => {
  it('retains hats, nested indices and membership glyphs without external fonts', () => {
    const result = manuscriptMathSvg(
      '\\hat{H}_{i,q}^{prop}=\\frac{\\sum_{j\\in T_q} E_j H_j}{\\sum_{j\\in T_q} E_j^2}',
      12,
    );
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(20);
    expect(result.svg).toContain('data-c="2208"');
    expect(result.svg).toContain('data-mml-node="mover"');
    expect(result.svg).toContain('data-mml-node="mfrac"');
    expect(result.svg).not.toContain('<text');
    expect(result.svg).not.toContain('<use');
    expect(result.svg).not.toContain('merror');
  });

  it('reports invalid math instead of silently producing altered notation', () => {
    expect(() => manuscriptMathSvg('\\frac{', 12)).toThrow();
  });
});
