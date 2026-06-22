import {
  buildManuscriptBundle,
  countWords,
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

  it('builds a numbered bibliography and CSL JSON', () => {
    expect(bundle.mainMarkdown).toContain('## References');
    expect(bundle.bibliography[0].text).toMatch(/^1\. Smith/);
    expect(bundle.cslJson[0].id).toBe('smith2020');
    expect(bundle.cslJson[0].type).toBe('article-journal');
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

describe('countWords', () => {
  it('ignores markdown, images, citations and cross-refs', () => {
    expect(countWords('Two words [@k] [#fig:x] ![a](b)')).toBe(2);
  });
});
