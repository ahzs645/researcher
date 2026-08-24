import {
  buildAssetLookup,
  numberAssets,
  resolveAssetKey,
} from '@/local-db/research/manuscript/manuscriptNumbering';
import { type FigureLike } from '@/local-db/research/manuscript/manuscriptTypes';

const figures: FigureLike[] = [
  {
    id: 'f1',
    refKey: 'arpes',
    assetKind: 'FIGURE',
    placement: 'MAIN',
    orderIndex: 0,
  },
  {
    id: 't1',
    refKey: 'growth',
    assetKind: 'TABLE',
    placement: 'MAIN',
    orderIndex: 1,
  },
  {
    id: 'f2',
    refKey: 'transport',
    assetKind: 'FIGURE',
    placement: 'MAIN',
    orderIndex: 2,
  },
  {
    id: 's1',
    refKey: 'sup-spectra',
    assetKind: 'FIGURE',
    placement: 'SUPPLEMENT',
    orderIndex: 0,
  },
];

describe('numberAssets', () => {
  it('numbers each kind in its own sequence', () => {
    const numbered = numberAssets(figures);
    const byId = Object.fromEntries(numbered.map((f) => [f.id, f.label]));
    expect(byId.f1).toBe('Figure 1');
    expect(byId.f2).toBe('Figure 2');
    // Table keeps its own counter despite sitting between the figures.
    expect(byId.t1).toBe('Table 1');
  });

  it('numbers supplement assets with the S prefix in a separate sequence', () => {
    const numbered = numberAssets(figures);
    const supplement = numbered.find((f) => f.id === 's1');
    expect(supplement?.number).toBe('S1');
    expect(supplement?.label).toBe('Figure S1');
  });

  it('respects a journal label format override', () => {
    const numbered = numberAssets(figures, { figureLabelFormat: 'Fig. {n}' });
    expect(numbered.find((f) => f.id === 'f1')?.label).toBe('Fig. 1');
  });

  it('uses crossRefFormat for the in-text figure label', () => {
    const numbered = numberAssets(figures, {
      figureLabelFormat: 'Figure {n}',
      crossRefFormat: 'Fig. {n}',
    });
    const figure = numbered.find((f) => f.id === 'f1');
    expect(figure?.label).toBe('Figure 1');
    expect(figure?.crossRefLabel).toBe('Fig. 1');
  });

  it('does not apply the figure cross-ref format to tables', () => {
    // [#tab:x] must render as "TABLE 1", not "Fig. 1".
    const numbered = numberAssets(figures, {
      tableLabelFormat: 'TABLE {n}',
      crossRefFormat: 'Fig. {n}',
    });
    const table = numbered.find((f) => f.id === 't1');
    expect(table?.label).toBe('TABLE 1');
    expect(table?.crossRefLabel).toBe('TABLE 1');
  });

  it('is deterministic across calls', () => {
    expect(numberAssets(figures)).toEqual(numberAssets(figures));
  });

  it('numbers per top-level section when the journal scope is PER_SECTION', () => {
    const sections = [
      {
        id: 'intro',
        name: 'Introduction',
        placement: 'MAIN',
        orderIndex: 0,
        level: 1,
      },
      {
        id: 'methods',
        name: 'Methods',
        placement: 'MAIN',
        orderIndex: 1,
        level: 1,
      },
      {
        id: 'sub',
        name: 'Study site',
        placement: 'MAIN',
        orderIndex: 2,
        level: 2,
      },
      {
        id: 'results',
        name: 'Results',
        placement: 'MAIN',
        orderIndex: 3,
        level: 1,
      },
      {
        id: 'refs',
        name: 'References',
        placement: 'BACK_MATTER',
        orderIndex: 4,
        level: 1,
      },
    ];
    const chapterFigures: FigureLike[] = [
      {
        id: 'a',
        refKey: 'a',
        assetKind: 'FIGURE',
        placement: 'MAIN',
        orderIndex: 0,
        sectionId: 'intro',
      },
      {
        id: 'b',
        refKey: 'b',
        assetKind: 'FIGURE',
        placement: 'MAIN',
        orderIndex: 1,
        sectionId: 'sub',
      },
      {
        id: 'c',
        refKey: 'c',
        assetKind: 'TABLE',
        placement: 'MAIN',
        orderIndex: 2,
        sectionId: 'results',
      },
      {
        id: 'd',
        refKey: 'd',
        assetKind: 'FIGURE',
        placement: 'MAIN',
        orderIndex: 3,
        sectionId: 'results',
      },
      {
        id: 'e',
        refKey: 'e',
        assetKind: 'FIGURE',
        placement: 'SUPPLEMENT',
        orderIndex: 4,
      },
    ];
    const numbered = numberAssets(
      chapterFigures,
      { numberingScope: 'PER_SECTION', supplementPrefix: 'S' },
      sections,
    );
    const byId = Object.fromEntries(numbered.map((f) => [f.id, f.number]));

    expect(byId.a).toBe('1.1'); // Introduction
    expect(byId.b).toBe('2.1'); // level-2 subsection belongs to Methods
    expect(byId.c).toBe('3.1'); // tables keep their own per-chapter sequence
    expect(byId.d).toBe('3.1'); // figures restart in Results, so also 3.1
    expect(byId.e).toBe('S1'); // supplement stays continuous
  });

  it('assigns unanchored figures to the preceding chapter', () => {
    const sections = [
      {
        id: 'intro',
        name: 'Introduction',
        placement: 'MAIN',
        orderIndex: 0,
        level: 1,
      },
    ];
    const numbered = numberAssets(
      [
        {
          id: 'a',
          refKey: 'a',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          orderIndex: 0,
        },
        {
          id: 'b',
          refKey: 'b',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          orderIndex: 1,
          sectionId: 'intro',
        },
        {
          id: 'c',
          refKey: 'c',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          orderIndex: 2,
        },
      ],
      { numberingScope: 'PER_SECTION' },
      sections,
    );
    const byId = Object.fromEntries(numbered.map((f) => [f.id, f.number]));
    expect(byId.a).toBe('1.1');
    expect(byId.b).toBe('1.2');
    expect(byId.c).toBe('1.3');
  });
});

describe('asset lookup', () => {
  it('resolves a key with or without a kind prefix', () => {
    const lookup = buildAssetLookup(numberAssets(figures));
    expect(resolveAssetKey('arpes', lookup)?.label).toBe('Figure 1');
    expect(resolveAssetKey('fig:arpes', lookup)?.label).toBe('Figure 1');
    expect(resolveAssetKey('tab:growth', lookup)?.label).toBe('Table 1');
    expect(resolveAssetKey('missing', lookup)).toBeUndefined();
  });
});

describe('keepSourceNumbers', () => {
  it('keeps the labels the source document used', () => {
    const numbered = numberAssets(
      [
        {
          id: 'e1',
          refKey: 'eq-11a',
          assetKind: 'EQUATION',
          sourceLabel: '11a',
          orderIndex: 0,
        },
        {
          id: 'e2',
          refKey: 'eq-11b',
          assetKind: 'EQUATION',
          sourceLabel: '11b',
          orderIndex: 1,
        },
        {
          id: 't1',
          refKey: 'tab-b1',
          assetKind: 'TABLE',
          sourceLabel: 'B1',
          placement: 'SUPPLEMENT',
          orderIndex: 2,
        },
        { id: 'f1', refKey: 'fig-new', assetKind: 'FIGURE', orderIndex: 3 },
      ],
      { keepSourceNumbers: true, tableLabelFormat: 'Table {n}' },
    );

    expect(numbered.map((asset) => asset.label)).toEqual([
      '(11a)',
      '(11b)',
      // An asset the author added after the import has no source label, so it
      // still takes the next number in its own sequence.
      'Figure 1',
      'Table B1',
    ]);
  });

  it('renumbers continuously by default', () => {
    const numbered = numberAssets([
      {
        id: 'e1',
        refKey: 'eq-11a',
        assetKind: 'EQUATION',
        sourceLabel: '11a',
        orderIndex: 0,
      },
      {
        id: 'e2',
        refKey: 'eq-11b',
        assetKind: 'EQUATION',
        sourceLabel: '11b',
        orderIndex: 1,
      },
    ]);
    expect(numbered.map((asset) => asset.label)).toEqual(['(1)', '(2)']);
  });
});
