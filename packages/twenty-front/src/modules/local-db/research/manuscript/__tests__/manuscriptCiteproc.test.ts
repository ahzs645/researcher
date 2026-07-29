import {
  createCiteprocEngine,
  formatCslBibliography,
  formatCslCitations,
  referenceToCslItem,
  resolveCslStyleXml,
  VENDORED_CSL_STYLES,
} from '@/local-db/research/manuscript/manuscriptCiteproc';
import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { prepareManuscriptBundleWithCsl } from '@/local-db/research/manuscript/manuscriptCslIntegration';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { getResearchSeedRecords } from '@/local-db/research/researchSeedRecords';

const reference = (
  id: string,
  family: string,
  year: number,
  title: string,
): ReferenceLike => ({
  id,
  citationKey: id,
  name: title,
  authors: `${family}, Jane`,
  year,
  cslType: 'ARTICLE_JOURNAL',
  cslJson: JSON.stringify({
    id: `source-${id}`,
    type: 'article-journal',
    title,
    author: [{ family, given: 'Jane' }],
    issued: { 'date-parts': [[year]] },
    'container-title': 'Journal of Testing',
    volume: '4',
    issue: '2',
    page: '10-20',
  }),
});

describe('manuscript citeproc', () => {
  it('registers vendored styles with titles parsed from their XML', () => {
    expect(VENDORED_CSL_STYLES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'apa', title: 'APA Style 7th edition' }),
        expect.objectContaining({
          id: 'american-medical-association',
          title: 'AMA Manual of Style 11th edition',
        }),
      ]),
    );
  });

  it('formats APA citations with year-suffix disambiguation', async () => {
    const references = [
      reference('smith-a', 'Smith', 2005, 'Alpha findings'),
      reference('smith-b', 'Smith', 2005, 'Beta findings'),
    ];
    const engine = await createCiteprocEngine({
      styleId: 'apa',
      references,
    });

    expect(engine).not.toBeNull();
    const labels = formatCslCitations(engine!, [['smith-a'], ['smith-b']]);

    expect(labels[0]).toMatch(/Smith.*2005a/);
    expect(labels[1]).toMatch(/Smith.*2005b/);
  });

  it('formats American Medical Association citations numerically', async () => {
    const engine = await createCiteprocEngine({
      styleId: 'american-medical-association',
      references: [
        reference('doe', 'Doe', 2020, 'First'),
        reference('roe', 'Roe', 2021, 'Second'),
      ],
    });

    expect(engine).not.toBeNull();
    expect(formatCslCitations(engine!, [['doe'], ['roe']])).toEqual(['1', '2']);
  });

  it('resolves a dependent journal style through its independent parent', () => {
    expect(resolveCslStyleXml('atmospheric-environment')).toBe(
      resolveCslStyleXml('elsevier-harvard'),
    );
    expect(resolveCslStyleXml('air-quality-atmosphere-and-health')).toBe(
      resolveCslStyleXml('springer-basic-author-date'),
    );
    expect(resolveCslStyleXml('vancouver')).toBe(
      resolveCslStyleXml('american-medical-association'),
    );
  });

  it('covers every citation style the seeded journal templates point at', () => {
    const seededStyleIds = getResearchSeedRecords()
      .journalTemplate.map((template) => template.citationStyleId)
      .filter(
        (styleId): styleId is string =>
          typeof styleId === 'string' && styleId.trim().length > 0,
      );

    expect(new Set(seededStyleIds).size).toBeGreaterThan(0);
    for (const styleId of new Set(seededStyleIds)) {
      expect(resolveCslStyleXml(styleId)).not.toBeNull();
    }
  });

  it('builds an engine for every vendored style', async () => {
    for (const style of VENDORED_CSL_STYLES) {
      const engine = await createCiteprocEngine({
        styleId: style.id,
        references: [reference('doe', 'Doe', 2020, 'First')],
      });
      expect(engine).not.toBeNull();
    }
  }, 30000);

  it('formats numeric citations for the newly vendored house styles', async () => {
    const engine = await createCiteprocEngine({
      styleId: 'nature',
      references: [
        reference('doe', 'Doe', 2020, 'First'),
        reference('roe', 'Roe', 2021, 'Second'),
      ],
    });

    expect(engine).not.toBeNull();
    expect(formatCslCitations(engine!, [['doe'], ['roe']])).toEqual(['1', '2']);
  });

  it('constructs a fallback CSL item from structured fields', () => {
    expect(
      referenceToCslItem({
        id: 'fallback',
        citationKey: 'fallback-key',
        name: 'Structured title',
        authors: 'Nguyen, Linh; Smith, Alex',
        year: 2024,
        containerTitle: 'Air Journal',
        volume: '12',
        issue: '3',
        pages: '44-51',
        doi: '10.1000/example',
      }),
    ).toMatchObject({
      id: 'fallback-key',
      type: 'article-journal',
      title: 'Structured title',
      author: [
        { family: 'Nguyen', given: 'Linh' },
        { family: 'Smith', given: 'Alex' },
      ],
      issued: { 'date-parts': [[2024]] },
      'container-title': 'Air Journal',
      volume: '12',
      issue: '3',
      page: '44-51',
      DOI: '10.1000/example',
    });
  });

  it('warns once and falls back when stored CSL-JSON is unparseable', () => {
    const consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const invalidReference: ReferenceLike = {
      id: 'invalid-csl-json',
      citationKey: 'invalid',
      name: 'Fallback title',
      authors: 'Smith, Alex',
      year: 2022,
      cslJson: '{invalid',
    };

    expect(referenceToCslItem(invalidReference)).toMatchObject({
      id: 'invalid',
      title: 'Fallback title',
    });
    referenceToCslItem(invalidReference);

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    consoleWarn.mockRestore();
  });

  it('orders an APA bibliography alphabetically', async () => {
    const engine = await createCiteprocEngine({
      styleId: 'apa',
      references: [
        reference('zimmer', 'Zimmer', 2020, 'Later alphabetically'),
        reference('adams', 'Adams', 2021, 'Earlier alphabetically'),
      ],
    });

    expect(engine).not.toBeNull();
    formatCslCitations(engine!, [['zimmer'], ['adams']]);
    const bibliography = formatCslBibliography(engine!);

    expect(bibliography.map((entry) => entry.key)).toEqual(['adams', 'zimmer']);
    expect(bibliography[0].text).toContain('Adams');
  });

  it('returns null for an unknown style without importing citeproc', async () => {
    await expect(
      createCiteprocEngine({
        styleId: 'not-vendored',
        references: [],
      }),
    ).resolves.toBeNull();
  });

  it('rebuilds manuscript citation text and bibliography with CSL', async () => {
    const references = [
      reference('smith-a', 'Smith', 2005, 'Alpha findings'),
      reference('smith-b', 'Smith', 2005, 'Beta findings'),
    ];
    const bundle = buildManuscriptBundle({
      manuscript: { id: 'manuscript', name: 'CSL export' },
      sections: [
        {
          id: 'results',
          name: 'Results',
          content: 'Compare [@smith-a] with [@smith-b].',
          placement: 'MAIN',
        },
      ],
      figures: [],
      references,
      style: { citationMode: 'NUMERIC', citationStyleId: 'apa' },
    });

    const formatted = await prepareManuscriptBundleWithCsl(bundle);

    expect(formatted.mainMarkdown).toMatch(/Smith.*2005a/);
    expect(formatted.mainMarkdown).toMatch(/Smith.*2005b/);
    expect(formatted.bibliography[0].text).toContain('Alpha findings');
    expect(formatted.bibliography[0].text).not.toMatch(/^1\./);
  });
});
