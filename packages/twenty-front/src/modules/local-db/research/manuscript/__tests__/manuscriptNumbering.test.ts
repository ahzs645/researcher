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
