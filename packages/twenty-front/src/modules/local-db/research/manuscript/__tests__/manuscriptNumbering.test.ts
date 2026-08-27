import {
  buildAssetLookup,
  buildSectionLookup,
  hasAuthoredSectionKey,
  numberAssets,
  numberManuscriptSections,
  resolveAssetKey,
  resolveSectionKey,
} from '@/local-db/research/manuscript/manuscriptNumbering';
import {
  type FigureLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

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

describe('assets taken out of the numbering', () => {
  const equations = [
    { id: 'e1', refKey: 'eq-1', assetKind: 'EQUATION', orderIndex: 0 },
    { id: 'e2', refKey: 'eq-2', assetKind: 'EQUATION', orderIndex: 1 },
    { id: 'e3', refKey: 'eq-3', assetKind: 'EQUATION', orderIndex: 2 },
  ];

  it('takes no number from the sequence, so the ones after it move up', () => {
    const numbered = numberAssets(
      equations.map((equation) =>
        equation.id === 'e2' ? { ...equation, numbered: false } : equation,
      ),
    );

    expect(numbered.map((equation) => equation.label)).toEqual([
      '(1)',
      '',
      '(2)',
    ]);
    // What was equation 3 is now equation 2 — which is the whole point of the
    // switch, and why a reference to it cannot be a number typed in by hand.
    expect(numbered[2]).toMatchObject({ refKey: 'eq-3', number: '2' });
  });

  it('leaves an unset flag numbering exactly as before', () => {
    expect(numberAssets(equations).map((equation) => equation.number)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(
      numberAssets(
        equations.map((equation) => ({ ...equation, numbered: true })),
      ).map((equation) => equation.number),
    ).toEqual(['1', '2', '3']);
  });
});

describe('figure panels', () => {
  const panelled: FigureLike[] = [
    {
      id: 'plume',
      refKey: 'fig:plume',
      name: 'Plume',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 0,
      imageUrl: 'https://example.org/plume.png',
    },
    {
      id: 'plume-left',
      refKey: 'fig:plume-left',
      name: 'Northbound',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 0,
      parentFigureId: 'plume',
      imageUrl: 'https://example.org/left.png',
    },
    {
      id: 'plume-right',
      refKey: 'fig:plume-right',
      name: 'Southbound',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 1,
      parentFigureId: 'plume',
      imageUrl: 'https://example.org/right.png',
    },
    {
      id: 'after',
      refKey: 'fig:after',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 1,
    },
  ];

  it('letters the panels off their parent and takes no number for them', () => {
    const numbered = numberAssets(panelled);
    const byId = Object.fromEntries(numbered.map((f) => [f.id, f]));

    expect(byId.plume.number).toBe('1');
    expect(byId['plume-left'].number).toBe('1a');
    expect(byId['plume-right'].number).toBe('1b');
    // The figure after a two-panel figure is Figure 2, not Figure 4.
    expect(byId.after.number).toBe('2');
  });

  it('prints the letter alone beside the panel and the figure label in a reference', () => {
    const byId = Object.fromEntries(
      numberAssets(panelled).map((f) => [f.id, f]),
    );
    expect(byId['plume-left'].label).toBe('(a)');
    expect(byId['plume-left'].crossRefLabel).toBe('Figure 1a');
    expect(byId.plume.label).toBe('Figure 1');
  });

  it('hangs the panels onto the parent in layout order', () => {
    const parent = numberAssets(panelled).find(
      (figure) => figure.id === 'plume',
    );
    expect(parent?.panels?.map((panel) => panel.number)).toEqual(['1a', '1b']);
    // And the panels are in the flat list too, so a lookup finds them.
    expect(numberAssets(panelled).map((figure) => figure.id)).toEqual([
      'plume',
      'plume-left',
      'plume-right',
      'after',
    ]);
  });

  it('leaves a figure with no panels exactly as it was', () => {
    const plain = panelled.filter(
      (figure) => figure.parentFigureId === undefined,
    );
    const numbered = numberAssets(plain);
    expect(numbered.map((figure) => figure.number)).toEqual(['1', '2']);
    expect(numbered.every((figure) => figure.panels === undefined)).toBe(true);
    expect(numbered[0].label).toBe('Figure 1');
  });

  it('spells the panel number the way the journal asks', () => {
    const upper = numberAssets(panelled, { panelLabelFormat: '{n}({P})' });
    const panel = upper.find((figure) => figure.id === 'plume-left');
    expect(panel?.number).toBe('1(A)');
    expect(panel?.label).toBe('(A)');
    expect(panel?.crossRefLabel).toBe('Figure 1(A)');
  });

  it('carries the supplement prefix into the panel number', () => {
    const supplement = numberAssets(
      panelled.map((figure) =>
        figure.id === 'after' ? figure : { ...figure, placement: 'SUPPLEMENT' },
      ),
    );
    expect(
      supplement.find((figure) => figure.id === 'plume-left')?.number,
    ).toBe('S1a');
  });

  it('skips a panel the author took out of the numbering', () => {
    const numbered = numberAssets(
      panelled.map((figure) =>
        figure.id === 'plume-left' ? { ...figure, numbered: false } : figure,
      ),
    );
    const byId = Object.fromEntries(numbered.map((f) => [f.id, f]));
    expect(byId['plume-left'].number).toBe('');
    // What would have been (b) becomes (a).
    expect(byId['plume-right'].number).toBe('1a');
  });

  it('numbers a panel whose parent is missing as a figure of its own', () => {
    const orphan = numberAssets(
      panelled.filter((figure) => figure.id !== 'plume'),
    );
    expect(orphan.map((figure) => figure.number)).toEqual(['1', '2', '3']);
  });

  it('resolves a panel by its own key and by MyST’s implicit one', () => {
    const lookup = buildAssetLookup(numberAssets(panelled));
    expect(resolveAssetKey('fig:plume-left', lookup)?.number).toBe('1a');
    // The parent's key plus the letter, which is what MyST gives a panel.
    expect(resolveAssetKey('fig:plume-b', lookup)?.number).toBe('1b');
    expect(resolveAssetKey('plumeb', lookup)?.number).toBe('1b');
  });
});

describe('numberManuscriptSections', () => {
  const sections: SectionLike[] = [
    {
      id: 'id-abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
    },
    {
      id: 'id-intro',
      refKey: 'intro',
      name: 'Introduction',
      placement: 'MAIN',
      orderIndex: 1,
    },
    {
      id: 'id-methods',
      refKey: 'methods',
      name: 'Methods',
      placement: 'MAIN',
      orderIndex: 2,
    },
    {
      id: 'id-sampling',
      refKey: 'sampling',
      name: 'Sampling',
      placement: 'MAIN',
      level: 2,
      orderIndex: 3,
    },
    {
      id: 'id-results',
      refKey: 'results',
      name: 'Results',
      placement: 'MAIN',
      orderIndex: 4,
    },
    {
      id: 'id-refs',
      name: 'References',
      sectionType: 'REFERENCES',
      placement: 'BACK_MATTER',
      orderIndex: 5,
    },
  ];

  it('numbers only the top-level body sections, in document order', () => {
    const numbered = numberManuscriptSections(sections, {
      sectionNumbering: true,
    });
    expect(
      Object.fromEntries(
        numbered.map((section) => [section.id, section.number]),
      ),
    ).toEqual({
      'id-abs': '',
      'id-intro': '1',
      'id-methods': '2',
      // A subsection is not part of the top-level sequence the block builder
      // prints, so it has no number of its own to be referenced by.
      'id-sampling': '',
      'id-results': '3',
      'id-refs': '',
    });
  });

  it('prints "Section 3" for a numbered section and the title for one without', () => {
    const numbered = numberManuscriptSections(sections, {
      sectionNumbering: true,
    });
    const byId = Object.fromEntries(numbered.map((s) => [s.id, s]));
    expect(byId['id-results'].crossRefLabel).toBe('Section 3');
    expect(byId['id-abs'].crossRefLabel).toBe('Abstract');
  });

  it('names the section when the journal numbers nothing', () => {
    const numbered = numberManuscriptSections(sections, {});
    expect(numbered.every((section) => section.number === '')).toBe(true);
    expect(
      numbered.find((section) => section.id === 'id-methods')?.crossRefLabel,
    ).toBe('Methods');
  });

  it('takes the reference format from the journal', () => {
    const numbered = numberManuscriptSections(sections, {
      sectionNumbering: true,
      sectionRefFormat: 'Sect. {n}',
    });
    expect(
      numbered.find((section) => section.id === 'id-methods')?.crossRefLabel,
    ).toBe('Sect. 2');
  });

  it('resolves a section key with or without the sec: prefix', () => {
    const lookup = buildSectionLookup(
      numberManuscriptSections(sections, { sectionNumbering: true }),
    );
    expect(resolveSectionKey('sec:methods', lookup)?.number).toBe('2');
    expect(resolveSectionKey('methods', lookup)?.number).toBe('2');
    expect(resolveSectionKey('SEC:Methods', lookup)?.number).toBe('2');
    expect(resolveSectionKey('nowhere', lookup)).toBeUndefined();
  });

  it('tells an authored key from the record id it falls back on', () => {
    const numbered = numberManuscriptSections(sections, {});
    const byId = Object.fromEntries(numbered.map((s) => [s.id, s]));
    expect(hasAuthoredSectionKey(byId['id-methods'])).toBe(true);
    expect(hasAuthoredSectionKey(byId['id-abs'])).toBe(false);
  });
});
