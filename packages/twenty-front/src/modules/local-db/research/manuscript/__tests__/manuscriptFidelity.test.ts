import { TextEncoder } from 'util';
import {
  createMathProtection,
  protectMarkdownMath,
} from '@/local-db/research/manuscript/manuscriptMathProtection';
import { manuscriptDocxImageType } from '@/local-db/research/manuscript/manuscriptDocxImage';
import { paginateManuscriptTable } from '@/local-db/research/manuscript/manuscriptPdfTablePagination';
import { manuscriptTablePlacement } from '@/local-db/research/manuscript/manuscriptTableLayout';

describe('manuscript fidelity', () => {
  it('protects multi-line math and leaves escaped dollars and code literal', () => {
    const source =
      'Prose $x_{i}+y_{i}$ and `$literal$`.\n\n$$\n\\hat{H}_{i,q}^{prop}=\\sum_{j\\in T_q} E_j\n$$\n\n```tex\n$x_{i}$\n```\n\\$5';
    const math = createMathProtection(source);
    const protectedSource = protectMarkdownMath(source, math.stash);
    expect(protectedSource).not.toContain('\\hat');
    expect(protectedSource).toContain('`$literal$`');
    expect(protectedSource).toContain('```tex\n$x_{i}$\n```');
    expect(math.restore(protectedSource)).toBe(source);
  });

  it('declares actual image byte formats instead of hardcoding GIF', () => {
    expect(
      manuscriptDocxImageType(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      ),
    ).toBe('png');
    expect(manuscriptDocxImageType(new Uint8Array([255, 216, 255, 224]))).toBe(
      'jpg',
    );
    expect(manuscriptDocxImageType(new TextEncoder().encode('GIF89a'))).toBe(
      'gif',
    );
    expect(
      manuscriptDocxImageType(new TextEncoder().encode('<svg>')),
    ).toBeUndefined();
  });

  it('keeps a short table intact and repeats headers in each long-table group', () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({
      cells: [{ content: `Site ${index}` }, { content: `Value ${index}` }],
    }));
    const placed = manuscriptTablePlacement(rows).rows;
    const short = paginateManuscriptTable(
      placed.slice(0, 9),
      [200, 200],
      1,
      10,
      1,
    );
    expect(short).toEqual([
      { rows: [0, 1, 2, 3, 4, 5, 6, 7, 8], keepTogether: true },
    ]);
    const long = paginateManuscriptTable(placed, [200, 200], 1, 10, 1);
    expect(long.length).toBeGreaterThan(1);
    expect(
      long.every((group) => group.rows[0] === 0 && group.keepTogether),
    ).toBe(true);
    expect(long.flatMap((group) => group.rows.slice(1))).toEqual(
      Array.from({ length: 69 }, (_, index) => index + 1),
    );
  });
});
