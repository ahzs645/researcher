import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { figureToMarkdown } from '@/local-db/research/manuscript/manuscriptImages';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';
import { type FigureLike } from '@/local-db/research/manuscript/manuscriptTypes';

const equation = (overrides: Partial<FigureLike> = {}): FigureLike => ({
  id: 'eq-a',
  refKey: 'eq-abs',
  name: 'Corrected absorption',
  assetKind: 'EQUATION',
  placement: 'MAIN',
  equationLatex: 'b_{\\mathrm{abs}} = \\frac{b_{\\mathrm{ATN}}}{C R}',
  orderIndex: 0,
  ...overrides,
});

describe('equation assets', () => {
  it('numbers equations in their own sequence as (n)', () => {
    const numbered = numberAssets(
      [
        { id: 'f1', refKey: 'fig-a', assetKind: 'FIGURE', orderIndex: 0 },
        equation({ id: 'e1', refKey: 'eq-one', orderIndex: 1 }),
        equation({ id: 'e2', refKey: 'eq-two', orderIndex: 2 }),
      ],
      {},
    );

    expect(numbered.map((asset) => asset.label)).toEqual([
      'Figure 1',
      '(1)',
      '(2)',
    ]);
  });

  it('renders LaTeX and the number in Markdown, with no image placeholder', () => {
    const [numbered] = numberAssets([equation()], {});
    const markdown = figureToMarkdown(numbered);

    expect(markdown).toContain('$$b_{\\mathrm{abs}}');
    expect(markdown).toContain('(1)');
    expect(markdown).not.toContain('image to be added');
  });

  it('emits an equation node and no missing-image warning', () => {
    const bundle = buildManuscriptBundle({
      manuscript: { id: 'm1', name: 'Paper' },
      sections: [
        {
          id: 's1',
          name: 'Methods',
          sectionType: 'METHODS',
          placement: 'MAIN',
          content: 'As shown in [#eq-abs], absorption is corrected.',
          orderIndex: 0,
        },
      ],
      figures: [equation({ sectionId: 's1' })],
      references: [],
      style: {},
    });

    expect(bundle.nodes.some((node) => node.kind === 'equation')).toBe(true);
    expect(bundle.warnings).toEqual([]);
  });

  it('resolves cross-references to the equation number', () => {
    const bundle = buildManuscriptBundle({
      manuscript: { id: 'm1', name: 'Paper' },
      sections: [
        {
          id: 's1',
          name: 'Methods',
          sectionType: 'METHODS',
          placement: 'MAIN',
          content: 'Combining [#eq-abs] with the flow term.',
          orderIndex: 0,
        },
      ],
      figures: [equation({ sectionId: 's1' })],
      references: [],
      style: {},
    });

    const prose = bundle.nodes.find((node) => node.kind === 'prose');
    expect(prose?.kind === 'prose' && prose.markdown).toContain('(1)');
  });

  it('warns when an equation has no body', () => {
    const bundle = buildManuscriptBundle({
      manuscript: { id: 'm1', name: 'Paper' },
      sections: [
        {
          id: 's1',
          name: 'Methods',
          sectionType: 'METHODS',
          placement: 'MAIN',
          content: 'Text.',
          orderIndex: 0,
        },
      ],
      figures: [equation({ equationLatex: '', sectionId: 's1' })],
      references: [],
      style: {},
    });

    expect(bundle.warnings).toEqual(['(1) has no equation body yet']);
  });
});
