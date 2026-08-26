import {
  buildManuscriptBundle,
  countWords,
  manuscriptSectionsForExport,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';

const input: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Topological insulator substrates',
    targetVenue: 'Nature Materials',
  },
  style: {
    name: 'Nature',
    citationMode: 'NUMERIC',
    citationStyleId: 'nature',
    figureLabelFormat: 'Figure {n}',
    supplementPrefix: 'S',
  },
  authors: 'Reyes, S.; Okafor, M.',
  sections: [
    {
      id: 's-abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'We grow films.',
    },
    {
      id: 's-res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 1,
      content: 'As shown in [#fig:arpes], the films are clean [@smith2020].',
    },
    {
      id: 's-sup',
      name: 'Supplementary methods',
      sectionType: 'SUPPLEMENT',
      placement: 'SUPPLEMENT',
      orderIndex: 0,
      content: 'Extra detail, see [#fig:sup].',
    },
  ],
  figures: [
    {
      id: 'f1',
      refKey: 'arpes',
      name: 'ARPES',
      caption: 'ARPES spectra.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 's-res',
      imageUrl: 'https://example.org/arpes.png',
      imageSource: 'URL',
    },
    {
      id: 'f2',
      refKey: 'sup',
      name: 'Sup spectra',
      caption: 'Supplementary spectra.',
      assetKind: 'FIGURE',
      placement: 'SUPPLEMENT',
      imageUrl: '',
      imageSource: 'NONE',
    },
  ],
  references: [
    {
      id: 'r1',
      citationKey: 'smith2020',
      name: 'On films',
      authors: 'Smith, J.',
      year: 2020,
      containerTitle: 'Nat. Mater.',
    },
  ],
};

describe('buildManuscriptBundle', () => {
  const bundle = buildManuscriptBundle(input);

  it('orders sections and separates the supplement', () => {
    // Abstract (front) before Results (main) in the main body.
    expect(bundle.mainMarkdown.indexOf('## Abstract')).toBeLessThan(
      bundle.mainMarkdown.indexOf('## Results'),
    );
    // The supplement is its own document, not in the main body.
    expect(bundle.mainMarkdown).not.toContain('Supplementary methods');
    expect(bundle.supplementMarkdown).toContain('# Supplementary Material');
    expect(bundle.supplementMarkdown).toContain('Supplementary methods');
  });

  it('places acknowledgements and generated references after the conclusion and before the supplement', () => {
    const ordered = buildManuscriptBundle({
      ...input,
      sections: [
        {
          id: 'conclusion',
          name: 'Conclusion',
          sectionType: 'CONCLUSION',
          placement: 'MAIN',
          orderIndex: 10,
          content: 'Main-paper conclusion [@smith2020].',
        },
        {
          id: 'acknowledgements',
          name: 'Acknowledgements',
          sectionType: 'ACKNOWLEDGMENTS',
          placement: 'BACK_MATTER',
          orderIndex: 11,
          content: 'Thanks to the field team.',
        },
        {
          id: 'imported-references',
          name: 'References',
          sectionType: 'REFERENCES',
          placement: 'BACK_MATTER',
          orderIndex: 12,
          content: 'SOURCE LIST THAT MUST NOT BE DUPLICATED',
        },
        {
          id: 'supplement-methods',
          name: 'S2.1: Details about PMF analysis',
          sectionType: 'SUPPLEMENT',
          placement: 'SUPPLEMENT',
          orderIndex: 2,
          content: 'Supplemental method details.',
        },
      ],
    });
    const headings = ordered.nodes.flatMap((node) =>
      node.kind === 'heading' ? [node.text] : [],
    );

    expect(headings).toEqual([
      'Conclusion',
      'Acknowledgements',
      'References',
      'Supplementary Material',
      'S2.1: Details about PMF analysis',
    ]);
    expect(ordered.mainMarkdown).not.toContain(
      'SOURCE LIST THAT MUST NOT BE DUPLICATED',
    );
  });

  it('resolves cross-references and renders numeric citations', () => {
    expect(bundle.mainMarkdown).toContain('As shown in Figure 1');
    expect(bundle.mainMarkdown).toContain('the films are clean [1]');
    // Supplement figure numbers separately as S1.
    expect(bundle.supplementMarkdown).toContain('Figure S1');
  });

  it('anchors a figure into its section and emits the caption', () => {
    expect(bundle.mainMarkdown).toContain('**Figure 1.** ARPES spectra.');
    expect(bundle.mainMarkdown).toContain(
      '![ARPES](https://example.org/arpes.png)',
    );
  });

  it('uses an explicit asset linker to place a figure inside section prose', () => {
    const preciselyPlaced = buildManuscriptBundle({
      ...input,
      sections: input.sections.map((section) =>
        section.id === 's-res'
          ? {
              ...section,
              content:
                'Paragraph before.\n\n[[asset:arpes]]\n\nParagraph after [#fig:arpes].',
            }
          : section,
      ),
    });
    const figureIndex = preciselyPlaced.nodes.findIndex(
      (node) => node.kind === 'figure' && node.figure.id === 'f1',
    );

    expect(preciselyPlaced.nodes[figureIndex - 1]).toMatchObject({
      kind: 'prose',
      markdown: 'Paragraph before.',
    });
    expect(preciselyPlaced.nodes[figureIndex + 1]).toMatchObject({
      kind: 'prose',
      markdown: 'Paragraph after Figure 1.',
    });
    expect(
      preciselyPlaced.nodes.filter(
        (node) => node.kind === 'figure' && node.figure.id === 'f1',
      ),
    ).toHaveLength(1);
  });

  it('anchors a supplementary figure inside its owning supplementary section', () => {
    const anchored = buildManuscriptBundle({
      ...input,
      figures: input.figures.map((figure) =>
        figure.id === 'f2' ? { ...figure, sectionId: 's-sup' } : figure,
      ),
    });
    const sectionIndex = anchored.nodes.findIndex(
      (node) =>
        node.kind === 'heading' && node.text === 'Supplementary methods',
    );
    expect(anchored.nodes[sectionIndex + 2]).toMatchObject({
      kind: 'figure',
      figure: { id: 'f2', number: 'S1' },
    });
  });

  it('builds a numbered bibliography and CSL JSON', () => {
    expect(bundle.mainMarkdown).toContain('## References');
    expect(bundle.bibliography[0].text).toMatch(/^1\. Smith/);
    expect(bundle.cslJson[0].id).toBe('smith2020');
    expect(bundle.cslJson[0].type).toBe('article-journal');
  });

  it('preserves manuscript references when the imported draft has no citation markers', () => {
    const imported = buildManuscriptBundle({
      ...input,
      sections: input.sections.map((section) => ({
        ...section,
        content: section.content?.replace('[@smith2020]', ''),
      })),
    });

    expect(imported.citedKeys).toEqual([]);
    expect(imported.bibliography).toHaveLength(1);
    expect(imported.mainMarkdown).toContain('## References');
    expect(imported.mainMarkdown).toContain('Smith');
  });

  it('collects warnings for the imageless supplementary figure', () => {
    expect(bundle.warnings.some((w) => /Figure S1 has no image/.test(w))).toBe(
      true,
    );
  });

  it('reports stats split by main vs supplement', () => {
    expect(bundle.stats.figureCount).toBe(1);
    expect(bundle.stats.supplementFigureCount).toBe(1);
    expect(bundle.stats.supplementSectionCount).toBe(1);
  });

  it('omits sections flagged out of export', () => {
    const filtered = buildManuscriptBundle({
      ...input,
      sections: input.sections.map((s) =>
        s.id === 's-res' ? { ...s, includeInExport: false } : s,
      ),
    });
    expect(filtered.mainMarkdown).not.toContain('## Results');
  });
});

describe('buildManuscriptBundle — nodes & tables', () => {
  const bundle = buildManuscriptBundle({
    manuscript: { id: 'm', name: 'T' },
    style: { citationMode: 'NUMERIC' },
    sections: [
      {
        id: 's',
        name: 'Methods',
        sectionType: 'METHODS',
        placement: 'MAIN',
        orderIndex: 0,
        content: 'See [#tab:grid] for parameters.',
      },
    ],
    figures: [
      {
        id: 't',
        refKey: 'grid',
        name: 'Grid',
        caption: 'Growth parameters.',
        assetKind: 'TABLE',
        placement: 'MAIN',
        sectionId: 's',
        tableData: '| A | B |\n| --- | --- |\n| 1 | 2 |',
      },
    ],
    references: [],
  });

  it('exposes a neutral document-node model incl. a table node', () => {
    expect(bundle.nodes.some((node) => node.kind === 'heading')).toBe(true);
    expect(bundle.nodes.some((node) => node.kind === 'prose')).toBe(true);
    expect(bundle.nodes.some((node) => node.kind === 'table')).toBe(true);
  });

  it('renders the table grid and resolves the table cross-ref', () => {
    expect(bundle.mainMarkdown).toContain('See Table 1 for parameters.');
    expect(bundle.mainMarkdown).toContain('**Table 1.** Growth parameters.');
    expect(bundle.mainMarkdown).toContain('| A | B |');
  });
});

describe('countWords', () => {
  it('ignores markdown, images, citations and cross-refs', () => {
    expect(countWords('Two words [@k] [#fig:x] ![a](b)')).toBe(2);
  });

  it('does not count math as words', () => {
    expect(countWords('The ratio $C_i/C_{ref}$ grows')).toBe(3);
    expect(countWords('Inline $$\\frac{a}{b}$$ done')).toBe(2);
  });
});

describe('cross-reference consistency with the editor tokenizer', () => {
  const dotted = buildManuscriptBundle({
    manuscript: { id: 'm', name: 'T' },
    style: { citationMode: 'NUMERIC' },
    sections: [
      {
        id: 's',
        name: 'Results',
        sectionType: 'RESULTS',
        placement: 'MAIN',
        orderIndex: 0,
        content:
          'Shown in [#fig:fig.2.6] and placed here.\n\n[[asset:Fig:Fig.2.6]]',
      },
    ],
    figures: [
      {
        id: 'f',
        refKey: 'fig.2.6',
        name: 'Factors',
        caption: 'Factor profiles.',
        assetKind: 'FIGURE',
        placement: 'MAIN',
        sectionId: 's',
        imageUrl: 'https://example.org/f.png',
        imageSource: 'URL',
      },
    ],
    references: [],
  });

  it('resolves refKeys containing dots in both text and placement markers', () => {
    expect(dotted.mainMarkdown).toContain('Shown in Figure 1');
    expect(dotted.warnings).toHaveLength(0);
  });

  it('resolves citation keys and refs inside captions and tables', () => {
    const captioned = buildManuscriptBundle({
      manuscript: { id: 'm', name: 'T' },
      style: { citationMode: 'NUMERIC' },
      sections: [
        {
          id: 's',
          name: 'Results',
          sectionType: 'RESULTS',
          placement: 'MAIN',
          orderIndex: 0,
          content: 'Body.',
        },
      ],
      figures: [
        {
          id: 't',
          refKey: 'grid',
          name: 'Grid',
          caption: 'Adapted from [@smith2020]; compare [#fig:other].',
          assetKind: 'TABLE',
          placement: 'MAIN',
          sectionId: 's',
          tableData: '| A |\n| --- |\n| 1 |',
        },
        {
          id: 'o',
          refKey: 'other',
          name: 'Other',
          caption: 'Other figure.',
          assetKind: 'FIGURE',
          placement: 'MAIN',
          sectionId: 's',
          imageUrl: 'https://example.org/o.png',
          imageSource: 'URL',
        },
      ],
      references: [
        {
          id: 'r1',
          citationKey: 'smith2020',
          name: 'A study',
          authors: 'Smith, J.',
          year: 2020,
        },
      ],
    });

    // The caption-only citation reaches the bibliography and gets a number…
    expect(captioned.warnings).toHaveLength(0);
    expect(captioned.bibliography.length).toBe(1);
    // …the caption's cross-ref resolves…
    expect(captioned.mainMarkdown).toContain('compare Figure 1.');
    // …and the caption's citation renders as a number, not a raw token.
    expect(captioned.mainMarkdown).toContain('Adapted from [1];');
  });
});

const MDPI_KEY = 'myst:tex/myst/mdpi:atmosphere';
const ARXIV_KEY = 'myst:tex/myst/arxiv:two-column';

// One paper, two journals. The abstract, the keyword list and the results
// paragraph each carry an MDPI version alongside the arXiv-length original.
const variantInput: BuildBundleInput = {
  manuscript: { id: 'm-var', name: 'Aerosol optical depth over the valley' },
  style: {
    name: 'Atmosphere (MDPI)',
    profileKey: MDPI_KEY,
    citationMode: 'NUMERIC',
    figureLabelFormat: 'Figure {n}',
    abstractWordLimit: 8,
  },
  sections: [
    {
      id: 's-abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'One two three four five six seven eight nine ten eleven twelve',
      wordLimit: 320,
    },
    {
      id: 's-key',
      name: 'Keywords',
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      orderIndex: 1,
      content: 'aerosol; optical depth; sun photometer',
    },
    {
      id: 's-res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'The retrieval appears in [#fig:aod]',
    },
    {
      id: 's-abs-mdpi',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'Four words only here',
      wordLimit: 200,
      variantOfId: 's-abs',
      variantProfileKey: MDPI_KEY,
    },
    {
      id: 's-key-mdpi',
      name: 'Keywords',
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      orderIndex: 1,
      content: 'aerosol; AOD',
      variantOfId: 's-key',
      variantProfileKey: MDPI_KEY,
    },
    {
      id: 's-res-mdpi',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'Condensed retrieval, in [#fig:aod]',
      variantOfId: 's-res',
      variantProfileKey: MDPI_KEY,
    },
  ],
  figures: [
    {
      id: 'f-aod',
      refKey: 'aod',
      name: 'AOD',
      caption: 'AOD series.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 's-res',
      imageUrl: 'https://example.org/aod.png',
      imageSource: 'URL',
    },
  ],
  references: [],
};

const arxivStyle = {
  name: 'arXiv',
  profileKey: ARXIV_KEY,
  citationMode: 'NUMERIC',
  figureLabelFormat: 'Figure {n}',
  abstractWordLimit: 320,
};

const baseSections = variantInput.sections.filter(
  (section) => section.variantOfId === undefined,
);

describe('per-journal section versions', () => {
  const mdpi = buildManuscriptBundle(variantInput);
  const arxiv = buildManuscriptBundle({ ...variantInput, style: arxivStyle });

  it('substitutes the version and never exports it as a section of its own', () => {
    const headings = mdpi.nodes.flatMap((node) =>
      node.kind === 'heading' ? [node.text] : [],
    );

    // Same three sections in the same order — only the words changed.
    expect(headings).toEqual(['Abstract', 'Keywords', 'Results']);
    expect(mdpi.mainMarkdown).toContain('Four words only here');
    expect(mdpi.mainMarkdown).not.toContain('One two three four five');
    expect(mdpi.stats.sectionCount).toBe(3);
    expect(arxiv.mainMarkdown).toContain('One two three four five');
    expect(arxiv.stats.sectionCount).toBe(3);
  });

  it("keeps the base's id, so a cross-reference and its figure still resolve", () => {
    // The figure is anchored to the base section id. Had the version's id
    // survived instead, the anchor would miss and the figure would vanish.
    expect(mdpi.mainMarkdown).toContain('Condensed retrieval, in Figure 1');
    expect(mdpi.mainMarkdown).toContain('![AOD](https://example.org/aod.png)');
    expect(mdpi.mainMarkdown).toContain('**Figure 1.** AOD series.');
    expect(mdpi.warnings).toEqual([]);
  });

  it('reports the abstract and keywords the journal will actually receive', () => {
    expect(mdpi.metadata.abstract).toBe('Four words only here');
    expect(mdpi.metadata.keywords).toEqual(['aerosol', 'AOD']);
    expect(arxiv.metadata.abstract).toBe(
      'One two three four five six seven eight nine ten eleven twelve',
    );
    expect(arxiv.metadata.keywords).toEqual([
      'aerosol',
      'optical depth',
      'sun photometer',
    ]);
  });

  it('counts the words of the resolved sections, not of every record', () => {
    // 4 + 2 + 3 against 12 + 5 + 4 — the versions replace their bases rather
    // than piling on top of them.
    expect(mdpi.stats.wordCount).toBe(9);
    expect(arxiv.stats.wordCount).toBe(21);
  });

  it("checks the journal's abstract cap against the version it will send", () => {
    const abstractWarning = /^Abstract is/;
    expect(mdpi.warnings.some((warning) => abstractWarning.test(warning))).toBe(
      false,
    );

    // The same journal, the same cap, with the version taken away: now the cap
    // judges the long original, which is what it should have said all along.
    const withoutVersion = buildManuscriptBundle({
      ...variantInput,
      sections: baseSections,
    });
    expect(withoutVersion.warnings).toContain('Abstract is 12 words (limit 8)');
  });

  it('lets a version be switched off, and takes versions down with an excluded base', () => {
    const versionSwitchedOff = manuscriptSectionsForExport({
      ...variantInput,
      sections: variantInput.sections.map((section) =>
        section.id === 's-abs-mdpi'
          ? { ...section, includeInExport: false }
          : section,
      ),
    });
    // The version's own flag is the only place an author can say "not this
    // one", since the resolved section keeps the base's flag.
    expect(
      versionSwitchedOff.find((section) => section.id === 's-abs')?.content,
    ).toBe('One two three four five six seven eight nine ten eleven twelve');

    const baseExcluded = manuscriptSectionsForExport({
      ...variantInput,
      sections: variantInput.sections.map((section) =>
        section.id === 's-abs'
          ? { ...section, includeInExport: false }
          : section,
      ),
    });
    // Neither the base nor its now-orphaned version escapes into the export.
    expect(baseExcluded.map((section) => section.id)).toEqual([
      's-key',
      's-res',
    ]);
    expect(baseExcluded.map((section) => section.content)).not.toContain(
      'Four words only here',
    );
  });

  it('drops a version whose base was deleted', () => {
    const orphaned = buildManuscriptBundle({
      ...variantInput,
      sections: variantInput.sections.filter(
        (section) => section.id !== 's-abs',
      ),
    });

    expect(orphaned.mainMarkdown).not.toContain('Four words only here');
    expect(orphaned.metadata.abstract).toBe('');
    expect(orphaned.stats.sectionCount).toBe(2);
  });

  it('matches on the journal name when the profile has no key yet', () => {
    const houseStyle = buildManuscriptBundle({
      ...variantInput,
      style: { name: 'Atmosphere (MDPI)' },
      sections: variantInput.sections.map((section) =>
        section.id === 's-abs-mdpi'
          ? { ...section, variantProfileKey: 'Atmosphere (MDPI)' }
          : section,
      ),
    });

    expect(houseStyle.metadata.abstract).toBe('Four words only here');
  });
});
