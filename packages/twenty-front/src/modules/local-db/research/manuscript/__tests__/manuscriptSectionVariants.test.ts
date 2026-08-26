import {
  resolveSectionVariants,
  sectionVariantKey,
  sectionVariantsByBaseId,
} from '@/local-db/research/manuscript/manuscriptSectionVariants';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

const MDPI_KEY = 'myst:tex/myst/mdpi:atmosphere';
const ARXIV_KEY = 'myst:tex/myst/arxiv:two-column';

const baseAbstract: SectionLike = {
  id: 's-abstract',
  name: 'Abstract',
  sectionType: 'ABSTRACT',
  placement: 'FRONT_MATTER',
  orderIndex: 0,
  level: 1,
  content: 'The abstract as first written, at arXiv length.',
  wordCount: 8,
  wordLimit: 320,
  includeInExport: true,
};

const baseMethods: SectionLike = {
  id: 's-methods',
  name: 'Methods',
  sectionType: 'METHODS',
  placement: 'MAIN',
  orderIndex: 1,
  level: 1,
  content: 'We flew the sampler for three seasons.',
};

// Deliberately disagrees with its base on every field rule 3 protects, so a
// substitution that leaked one of them would show up immediately.
const mdpiAbstract: SectionLike = {
  id: 's-abstract-mdpi',
  name: 'Abstract (MDPI)',
  sectionType: 'OTHER',
  placement: 'BACK_MATTER',
  orderIndex: 97,
  level: 3,
  content: 'The abstract, cut to 200 words.',
  wordCount: 6,
  wordLimit: 200,
  includeInExport: false,
  variantOfId: 's-abstract',
  variantProfileKey: MDPI_KEY,
};

describe('sectionVariantKey', () => {
  it('prefers the profile key, which is what survives a portable package', () => {
    expect(
      sectionVariantKey({ name: 'Atmosphere (MDPI)', profileKey: MDPI_KEY }),
    ).toBe(MDPI_KEY);
  });

  it('falls back to the name for a journal typed in by hand', () => {
    expect(sectionVariantKey({ name: 'Lab house style' })).toBe(
      'Lab house style',
    );
    expect(
      sectionVariantKey({ name: 'Lab house style', profileKey: '  ' }),
    ).toBe('Lab house style');
  });

  it('has no key for a journal with neither, or for no journal at all', () => {
    expect(sectionVariantKey({})).toBeNull();
    expect(sectionVariantKey({ name: '', profileKey: null })).toBeNull();
    expect(sectionVariantKey(null)).toBeNull();
    expect(sectionVariantKey(undefined)).toBeNull();
  });
});

describe('sectionVariantsByBaseId', () => {
  it('groups versions under the id they name and leaves base sections out', () => {
    const grouped = sectionVariantsByBaseId([
      baseAbstract,
      baseMethods,
      mdpiAbstract,
    ]);

    expect([...grouped.keys()]).toEqual(['s-abstract']);
    expect(grouped.get('s-abstract')).toEqual([mdpiAbstract]);
  });

  it('keys an orphan version by the base it names, present or not', () => {
    const orphan: SectionLike = {
      id: 'v-orphan',
      content: 'A version of a section that was deleted.',
      variantOfId: 's-deleted',
      variantProfileKey: MDPI_KEY,
    };

    expect(
      sectionVariantsByBaseId([baseAbstract, orphan]).get('s-deleted'),
    ).toEqual([orphan]);
  });

  it('orders each group by orderIndex, then by id', () => {
    const later: SectionLike = {
      id: 'v-a',
      orderIndex: 5,
      variantOfId: 's-abstract',
      variantProfileKey: MDPI_KEY,
    };
    const tiedSecond: SectionLike = {
      id: 'v-c',
      orderIndex: 1,
      variantOfId: 's-abstract',
      variantProfileKey: MDPI_KEY,
    };
    const tiedFirst: SectionLike = {
      id: 'v-b',
      orderIndex: 1,
      variantOfId: 's-abstract',
      variantProfileKey: MDPI_KEY,
    };

    expect(
      sectionVariantsByBaseId([later, tiedSecond, tiedFirst, baseAbstract])
        .get('s-abstract')
        ?.map((section) => section.id),
    ).toEqual(['v-b', 'v-c', 'v-a']);
  });
});

describe('resolveSectionVariants', () => {
  const sections = [baseAbstract, baseMethods, mdpiAbstract];

  it('never exports a version as a section of its own (rule 1)', () => {
    for (const key of [MDPI_KEY, ARXIV_KEY, null]) {
      expect(
        resolveSectionVariants(sections, key).map((section) => section.id),
      ).toEqual(['s-abstract', 's-methods']);
    }
  });

  it("substitutes the version's words and word numbers (rule 2)", () => {
    const [abstract] = resolveSectionVariants(sections, MDPI_KEY);

    expect(abstract.content).toBe('The abstract, cut to 200 words.');
    expect(abstract.name).toBe('Abstract (MDPI)');
    expect(abstract.wordCount).toBe(6);
    expect(abstract.wordLimit).toBe(200);
  });

  it("keeps the base's id and everything that shapes the paper (rule 3)", () => {
    const [abstract] = resolveSectionVariants(sections, MDPI_KEY);

    // The id above all: cross-references and asset anchors name the base.
    expect(abstract.id).toBe('s-abstract');
    expect(abstract.orderIndex).toBe(0);
    expect(abstract.placement).toBe('FRONT_MATTER');
    expect(abstract.sectionType).toBe('ABSTRACT');
    expect(abstract.level).toBe(1);
    expect(abstract.includeInExport).toBe(true);
  });

  it('leaves a section alone when no version matches this journal', () => {
    expect(resolveSectionVariants(sections, ARXIV_KEY)).toEqual([
      baseAbstract,
      baseMethods,
    ]);
  });

  it('drops a version whose base no longer exists (rule 4)', () => {
    const orphan: SectionLike = {
      id: 'v-orphan',
      name: 'Abstract (MDPI)',
      content: 'A version of a section that was deleted.',
      variantOfId: 's-deleted',
      variantProfileKey: MDPI_KEY,
    };

    expect(
      resolveSectionVariants([baseMethods, orphan], MDPI_KEY).map(
        (section) => section.id,
      ),
    ).toEqual(['s-methods']);
  });

  it('resolves duplicate versions deterministically (rule 5)', () => {
    const byOrderIndex = [
      baseAbstract,
      {
        id: 'v-late',
        orderIndex: 4,
        content: 'Second draft of the MDPI abstract.',
        variantOfId: 's-abstract',
        variantProfileKey: MDPI_KEY,
      },
      {
        id: 'v-early',
        orderIndex: 2,
        content: 'First draft of the MDPI abstract.',
        variantOfId: 's-abstract',
        variantProfileKey: MDPI_KEY,
      },
    ];
    expect(resolveSectionVariants(byOrderIndex, MDPI_KEY)[0].content).toBe(
      'First draft of the MDPI abstract.',
    );

    const byId = [
      baseAbstract,
      {
        id: 'v-second',
        orderIndex: 2,
        content: 'The one with the later id.',
        variantOfId: 's-abstract',
        variantProfileKey: MDPI_KEY,
      },
      {
        id: 'v-first',
        orderIndex: 2,
        content: 'The one with the earlier id.',
        variantOfId: 's-abstract',
        variantProfileKey: MDPI_KEY,
      },
    ];
    expect(resolveSectionVariants(byId, MDPI_KEY)[0].content).toBe(
      'The one with the earlier id.',
    );
  });

  it('resolves to the base sections when there is no active key (rule 6)', () => {
    expect(resolveSectionVariants(sections, null)).toEqual([
      baseAbstract,
      baseMethods,
    ]);
    expect(resolveSectionVariants(sections, '   ')).toEqual([
      baseAbstract,
      baseMethods,
    ]);
  });

  it('matches on the key a hand-typed journal falls back to', () => {
    const houseStyle = [
      baseAbstract,
      {
        id: 'v-house',
        content: 'The version our department asks for.',
        variantOfId: 's-abstract',
        variantProfileKey: 'Lab house style',
      },
    ];

    expect(
      resolveSectionVariants(
        houseStyle,
        sectionVariantKey({ name: 'Lab house style' }),
      )[0].content,
    ).toBe('The version our department asks for.');
  });

  it('leaves the input array untouched', () => {
    const input = [...sections];
    resolveSectionVariants(input, MDPI_KEY);

    expect(input).toEqual(sections);
  });
});
