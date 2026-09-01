import {
  chooseSectionVariant,
  parseSectionVariantRules,
  resolveSectionVariantChoices,
  resolveSectionVariants,
  sectionVariantKey,
  sectionVariantMaxWords,
  sectionVariantWordCount,
  sectionVariantWordLimit,
  sectionVariantsByBaseId,
  serializeSectionVariantRules,
  type SectionVariantStyle,
} from '@/local-db/research/manuscript/manuscriptSectionVariants';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

const MDPI_KEY = 'myst:tex/myst/mdpi:atmosphere';
const ARXIV_KEY = 'myst:tex/myst/arxiv:two-column';

// Content of a known length, so every expectation below is decided by the words
// the counter actually finds and never by a `wordCount` typed into a fixture.
const words = (count: number): string =>
  Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');

const rules = (maxWords: number): string => JSON.stringify({ maxWords });

const journal = (
  name: string,
  abstractWordLimit?: number,
  profileKey?: string,
): SectionVariantStyle => ({
  name,
  ...(profileKey === undefined ? {} : { profileKey }),
  ...(abstractWordLimit === undefined ? {} : { abstractWordLimit }),
});

const baseAbstract: SectionLike = {
  id: 's-abstract',
  name: 'Abstract',
  sectionType: 'ABSTRACT',
  placement: 'FRONT_MATTER',
  orderIndex: 0,
  level: 1,
  content: words(320),
  wordCount: 320,
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

// Deliberately disagrees with its base on every field a substitution must not
// leak, so one that did would show up immediately.
const mdpiAbstract: SectionLike = {
  id: 's-abstract-mdpi',
  name: 'Abstract (MDPI)',
  sectionType: 'OTHER',
  placement: 'BACK_MATTER',
  orderIndex: 97,
  level: 3,
  content: words(180),
  wordCount: 180,
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

describe('parseSectionVariantRules', () => {
  it('reads the one rule that ships', () => {
    expect(parseSectionVariantRules('{"maxWords":200}')).toEqual({
      maxWords: 200,
    });
  });

  it('drops a key it does not know rather than carrying it', () => {
    expect(
      parseSectionVariantRules('{"maxWords":200,"structuredAbstract":true}'),
    ).toEqual({ maxWords: 200 });
  });

  it('drops a value of the wrong type rather than coercing it', () => {
    // "200" coerced to 200 would let a version pass a cap its author never
    // declared, which is exactly the silent half-application to avoid.
    expect(parseSectionVariantRules('{"maxWords":"200"}')).toEqual({});
    expect(parseSectionVariantRules('{"maxWords":true}')).toEqual({});
    expect(parseSectionVariantRules('{"maxWords":null}')).toEqual({});
    expect(parseSectionVariantRules('{"maxWords":0}')).toEqual({});
    expect(parseSectionVariantRules('{"maxWords":-5}')).toEqual({});
  });

  it('degrades to no rule instead of throwing, whatever the field holds', () => {
    for (const value of [
      'not json at all',
      '{"maxWords":',
      '[]',
      '"200"',
      'null',
      '   ',
      '',
      null,
      undefined,
    ]) {
      expect(() => parseSectionVariantRules(value)).not.toThrow();
      expect(parseSectionVariantRules(value)).toEqual({});
    }
  });
});

describe('serializeSectionVariantRules', () => {
  it('round-trips the rule it wrote', () => {
    const written = serializeSectionVariantRules({ maxWords: 200 });

    expect(written).toBe('{"maxWords":200}');
    expect(parseSectionVariantRules(written)).toEqual({ maxWords: 200 });
  });

  it('writes nothing at all when nothing is declared', () => {
    // Not "{}": a cleared version has to read as undeclared, not as a rule
    // that happens to be empty.
    expect(serializeSectionVariantRules({})).toBeNull();
    expect(serializeSectionVariantRules({ maxWords: 0 })).toBeNull();
  });
});

describe('sectionVariantMaxWords', () => {
  it('reads the target a version declares, and null when it declares none', () => {
    expect(sectionVariantMaxWords({ id: 'v', variantRules: rules(200) })).toBe(
      200,
    );
    expect(sectionVariantMaxWords({ id: 'v' })).toBeNull();
    expect(
      sectionVariantMaxWords({ id: 'v', variantRules: 'not json' }),
    ).toBeNull();
  });
});

describe('sectionVariantWordCount', () => {
  it('counts the content rather than trusting a stored count', () => {
    // The stored number is a cache the editor refreshes on save; a paste that
    // never round-tripped leaves it behind, and the words are what a journal
    // receives.
    expect(
      sectionVariantWordCount({
        id: 'v',
        content: words(210),
        wordCount: 200,
      }),
    ).toBe(210);
    expect(sectionVariantWordCount({ id: 'v' })).toBe(0);
  });
});

describe('sectionVariantWordLimit', () => {
  it("caps an abstract by the journal's abstract limit, not the section's", () => {
    expect(sectionVariantWordLimit(baseAbstract, journal('MDPI', 200))).toBe(
      200,
    );
    // The base carries a stale 320 of its own; the journal's number wins.
    expect(baseAbstract.wordLimit).toBe(320);
  });

  it('caps every other section by the limit written on it', () => {
    expect(
      sectionVariantWordLimit(
        { ...baseMethods, wordLimit: 1500 },
        journal('MDPI', 200),
      ),
    ).toBe(1500);
  });

  it('reports no cap when nobody set one', () => {
    expect(sectionVariantWordLimit(baseAbstract, journal('arXiv'))).toBeNull();
    expect(sectionVariantWordLimit(baseAbstract, null)).toBeNull();
    expect(
      sectionVariantWordLimit(baseMethods, journal('MDPI', 200)),
    ).toBeNull();
    expect(
      sectionVariantWordLimit({ ...baseMethods, wordLimit: 0 }, null),
    ).toBeNull();
  });
});

describe('resolveSectionVariants', () => {
  const sections = [baseAbstract, baseMethods, mdpiAbstract];
  const mdpi = journal('Atmosphere (MDPI)', 200, MDPI_KEY);

  it('never exports a version as a section of its own', () => {
    for (const style of [mdpi, journal('arXiv', 320, ARXIV_KEY), null]) {
      expect(
        resolveSectionVariants(sections, style).map((section) => section.id),
      ).toEqual(['s-abstract', 's-methods']);
    }
  });

  it('drops a version whose base no longer exists', () => {
    const orphan: SectionLike = {
      id: 'v-orphan',
      name: 'Abstract (MDPI)',
      content: words(120),
      variantOfId: 's-deleted',
      variantProfileKey: MDPI_KEY,
      variantRules: rules(200),
    };

    expect(
      resolveSectionVariants([baseMethods, orphan], mdpi).map(
        (section) => section.id,
      ),
    ).toEqual(['s-methods']);
  });

  it("substitutes the version's words and keeps the base's shape", () => {
    const [abstract] = resolveSectionVariants(sections, mdpi);

    expect(abstract.content).toBe(words(180));
    expect(abstract.name).toBe('Abstract (MDPI)');
    expect(abstract.wordCount).toBe(180);
    expect(abstract.wordLimit).toBe(200);
    // The id above all: cross-references and asset anchors name the base.
    expect(abstract.id).toBe('s-abstract');
    expect(abstract.orderIndex).toBe(0);
    expect(abstract.placement).toBe('FRONT_MATTER');
    expect(abstract.sectionType).toBe('ABSTRACT');
    expect(abstract.level).toBe(1);
    expect(abstract.includeInExport).toBe(true);
  });

  it('leaves the input array untouched', () => {
    const input = [...sections];
    resolveSectionVariants(input, mdpi);

    expect(input).toEqual(sections);
  });
});

// Rule 1. Explicit beats inferred: a journal that wants particular wording has
// to be able to say so whatever the lengths work out to.
describe('a version pinned to this journal', () => {
  const pinned: SectionLike = {
    id: 'v-pinned',
    name: 'Abstract (MDPI wording)',
    content: words(120),
    variantOfId: 's-abstract',
    variantProfileKey: MDPI_KEY,
  };
  const byRule: SectionLike = {
    id: 'v-rule',
    name: 'Abstract (200 words)',
    content: words(199),
    variantOfId: 's-abstract',
    variantRules: rules(200),
  };
  const mdpi = journal('Atmosphere (MDPI)', 200, MDPI_KEY);

  it('wins over a rule-based version that fits the cap better', () => {
    // 199 words is the longer fit under a 200-word cap, and the pin still
    // wins: this journal asked for these words.
    const choice = chooseSectionVariant(baseAbstract, [byRule, pinned], mdpi);

    expect(choice.version?.id).toBe('v-pinned');
    expect(choice.reason).toBe('PINNED');
    expect(choice.section.content).toBe(words(120));
  });

  it('wins even when it overruns the cap, and reports the cap it overran', () => {
    const tooLong = { ...pinned, content: words(240) };
    const choice = chooseSectionVariant(baseAbstract, [tooLong, byRule], mdpi);

    expect(choice.reason).toBe('PINNED');
    expect(choice.wordCount).toBe(240);
    expect(choice.wordLimit).toBe(200);
  });

  it('is only ever used by the journal it names', () => {
    // A pin says nothing about any other journal, so arXiv gets the base back
    // rather than an abstract written for someone else.
    const choice = chooseSectionVariant(
      baseAbstract,
      [pinned],
      journal('arXiv', 320, ARXIV_KEY),
    );

    expect(choice.version).toBeNull();
    expect(choice.reason).toBe('BASE_FITS');
  });

  it('matches on the name a journal typed in by hand falls back to', () => {
    const houseStyle = {
      ...pinned,
      variantProfileKey: 'Lab house style',
    };
    const choice = chooseSectionVariant(
      baseAbstract,
      [houseStyle],
      journal('Lab house style'),
    );

    expect(choice.reason).toBe('PINNED');
    expect(choice.section.content).toBe(words(120));
  });

  it('resolves two versions pinned to the same journal the same way every time', () => {
    // A data error we cannot resolve, so the least we can do is not let record
    // fetch order decide which abstract gets submitted.
    const first = { ...pinned, id: 'v-first', orderIndex: 2 };
    const second = { ...pinned, id: 'v-second', orderIndex: 4 };
    const tied = { ...pinned, id: 'v-a', orderIndex: 2 };

    expect(
      chooseSectionVariant(baseAbstract, [second, first], mdpi).version?.id,
    ).toBe('v-first');
    expect(
      chooseSectionVariant(baseAbstract, [first, tied], mdpi).version?.id,
    ).toBe('v-a');
  });
});

// Rule 2. No cap, no substitution: the base is the fullest text there is.
describe('a journal that caps nothing here', () => {
  const version: SectionLike = {
    id: 'v-short',
    content: words(100),
    variantOfId: 's-abstract',
    variantRules: rules(200),
  };

  it('receives the base even though a shorter version exists', () => {
    const choice = chooseSectionVariant(
      baseAbstract,
      [version],
      journal('Copernicus'),
    );

    expect(choice.reason).toBe('NO_WORD_LIMIT');
    expect(choice.version).toBeNull();
    expect(choice.wordLimit).toBeNull();
    expect(choice.section.content).toBe(words(320));
  });

  it('receives the base when there is no journal at all', () => {
    expect(chooseSectionVariant(baseAbstract, [version], null).reason).toBe(
      'NO_WORD_LIMIT',
    );
  });
});

// Rules 3 to 5, on the section every journal states a number for.
describe('choosing an abstract for a journal that caps one', () => {
  const shortest: SectionLike = {
    id: 'v-200',
    name: 'Abstract (200 words)',
    content: words(200),
    variantOfId: 's-abstract',
    variantRules: rules(200),
  };
  const longer: SectionLike = {
    id: 'v-250',
    name: 'Abstract (250 words)',
    content: words(250),
    variantOfId: 's-abstract',
    variantRules: rules(250),
  };

  it('ships the base whenever the base fits (rule 3)', () => {
    // A shorter version exists to be used when the full text will not fit, not
    // to replace the full text whenever it happens to exist.
    const choice = chooseSectionVariant(
      baseAbstract,
      [shortest, longer],
      journal('Copernicus (AMT)', 400, 'myst:tex/myst/copernicus:amt'),
    );

    expect(choice.reason).toBe('BASE_FITS');
    expect(choice.version).toBeNull();
    expect(choice.wordCount).toBe(320);
    expect(choice.wordLimit).toBe(400);
  });

  it('ships the longest version that fits, never the shortest (rule 4)', () => {
    // 250 fits a 250-word cap and 200 would waste 50 words the journal allows.
    const choice = chooseSectionVariant(
      baseAbstract,
      [shortest, longer],
      journal('Aerosol Science', 250),
    );

    expect(choice.reason).toBe('RULE_FITS');
    expect(choice.version?.id).toBe('v-250');
    expect(choice.wordCount).toBe(250);
  });

  it('serves five journals that cap at 200 from one 200-word version', () => {
    // The reason the rule exists at all: submitting the same paper to five
    // MDPI journals must not mean five copies of the same paragraph.
    const mdpiJournals = [
      journal('Atmosphere', 200, 'myst:tex/myst/mdpi:atmosphere'),
      journal('Remote Sensing', 200, 'myst:tex/myst/mdpi:remotesensing'),
      journal('Toxics', 200, 'myst:tex/myst/mdpi:toxics'),
      journal('Sustainability', 220, 'myst:tex/myst/mdpi:sustainability'),
      journal('Environments', 240, 'myst:tex/myst/mdpi:environments'),
    ];

    for (const mdpiJournal of mdpiJournals) {
      const choice = chooseSectionVariant(
        baseAbstract,
        [shortest],
        mdpiJournal,
      );

      expect(choice.reason).toBe('RULE_FITS');
      expect(choice.section.content).toBe(words(200));
    }
  });

  it('keeps serving them after the journal record is renamed', () => {
    // A version keyed to a journal orphans itself the moment that record is
    // renamed; a version keyed to the requirement does not care.
    const renamed = journal('Atmosphere — new title', 200);

    expect(chooseSectionVariant(baseAbstract, [shortest], renamed).reason).toBe(
      'RULE_FITS',
    );
  });

  it('ships the base and lets the readiness check speak when nothing fits (rule 5)', () => {
    // Silently sending a version that also busts the cap would swap a problem
    // the author is told about for one nobody sees.
    const choice = chooseSectionVariant(
      baseAbstract,
      [longer],
      journal('Nano Letters', 150),
    );

    expect(choice.reason).toBe('NOTHING_FITS');
    expect(choice.version).toBeNull();
    expect(choice.section.content).toBe(words(320));
    expect(choice.wordCount).toBe(320);
    expect(choice.wordLimit).toBe(150);
  });

  it('ranks two versions of the same length deterministically', () => {
    const first = { ...shortest, id: 'v-a', orderIndex: 3 };
    const second = { ...shortest, id: 'v-b', orderIndex: 3 };

    expect(
      chooseSectionVariant(baseAbstract, [second, first], journal('MDPI', 200))
        .version?.id,
    ).toBe('v-a');
  });
});

describe('a version measured against what it says about itself', () => {
  // Declares 200 and has since grown to 210. The declaration is the author's
  // target; the text is the truth.
  const overrunning: SectionLike = {
    id: 'v-overrun',
    name: 'Abstract (200 words)',
    content: words(210),
    wordCount: 200,
    variantOfId: 's-abstract',
    variantRules: rules(200),
  };

  it('is refused by a journal whose cap it actually busts', () => {
    const choice = chooseSectionVariant(
      baseAbstract,
      [overrunning],
      journal('Atmosphere (MDPI)', 200, MDPI_KEY),
    );

    expect(choice.reason).toBe('NOTHING_FITS');
    expect(choice.version).toBeNull();
    expect(sectionVariantMaxWords(overrunning)).toBe(200);
  });

  it('is used by a journal whose cap it does fit, whatever it declares', () => {
    const choice = chooseSectionVariant(
      baseAbstract,
      [overrunning],
      journal('Aerosol Science', 250),
    );

    expect(choice.reason).toBe('RULE_FITS');
    expect(choice.version?.id).toBe('v-overrun');
    expect(choice.wordCount).toBe(210);
  });
});

describe('a version that has not said where it may be used', () => {
  const style = journal('Atmosphere (MDPI)', 200, MDPI_KEY);

  it('is never stood in for a base it fits but was not offered to', () => {
    // No pin and no rule is the author saying nothing, and a silent
    // substitution is not a reasonable thing to infer from silence.
    const undeclared: SectionLike = {
      id: 'v-undeclared',
      content: words(100),
      variantOfId: 's-abstract',
    };

    expect(chooseSectionVariant(baseAbstract, [undeclared], style).reason).toBe(
      'NOTHING_FITS',
    );
  });

  it('is passed over when its rules are malformed, without failing the export', () => {
    const malformed: SectionLike = {
      id: 'v-malformed',
      content: words(100),
      variantOfId: 's-abstract',
      variantRules: '{"maxWords": 200',
    };
    const fine: SectionLike = {
      id: 'v-fine',
      content: words(150),
      variantOfId: 's-abstract',
      variantRules: rules(200),
    };

    expect(() =>
      chooseSectionVariant(baseAbstract, [malformed], style),
    ).not.toThrow();
    expect(chooseSectionVariant(baseAbstract, [malformed], style).reason).toBe(
      'NOTHING_FITS',
    );
    // And the malformed one does not take the readable one down with it.
    expect(
      chooseSectionVariant(baseAbstract, [malformed, fine], style).version?.id,
    ).toBe('v-fine');
  });

  it('is still available to the journal it names, rules or no rules', () => {
    const pinnedOnly: SectionLike = {
      id: 'v-pinned',
      content: words(100),
      variantOfId: 's-abstract',
      variantProfileKey: MDPI_KEY,
    };

    expect(chooseSectionVariant(baseAbstract, [pinnedOnly], style).reason).toBe(
      'PINNED',
    );
  });
});

describe('sections other than the abstract', () => {
  const overlongMethods: SectionLike = {
    ...baseMethods,
    content: words(1500),
    wordLimit: 1000,
  };
  const shorterMethods: SectionLike = {
    id: 'v-methods-1000',
    content: words(990),
    variantOfId: 's-methods',
    variantRules: rules(1000),
  };

  it('answer to the limit written on the base, whatever the journal caps abstracts at', () => {
    const choice = chooseSectionVariant(
      overlongMethods,
      [shorterMethods],
      journal('Atmosphere (MDPI)', 200, MDPI_KEY),
    );

    expect(choice.reason).toBe('RULE_FITS');
    expect(choice.wordLimit).toBe(1000);
    expect(choice.section.content).toBe(words(990));
  });

  it('ship as authored when the base is inside its own limit', () => {
    expect(
      chooseSectionVariant(
        { ...overlongMethods, wordLimit: 2000 },
        [shorterMethods],
        journal('Atmosphere (MDPI)', 200, MDPI_KEY),
      ).reason,
    ).toBe('BASE_FITS');
  });
});

describe('resolveSectionVariantChoices', () => {
  it('explains every base in one pass, in the order the bases arrived', () => {
    const version: SectionLike = {
      id: 'v-200',
      content: words(200),
      variantOfId: 's-abstract',
      variantRules: rules(200),
    };
    const choices = resolveSectionVariantChoices(
      [baseAbstract, baseMethods, version],
      journal('Atmosphere (MDPI)', 200, MDPI_KEY),
    );

    expect(choices.map((choice) => [choice.section.id, choice.reason])).toEqual(
      [
        ['s-abstract', 'RULE_FITS'],
        ['s-methods', 'NO_WORD_LIMIT'],
      ],
    );
    expect(choices[0].version?.id).toBe('v-200');
    expect(
      resolveSectionVariants(
        [baseAbstract, baseMethods, version],
        journal('Atmosphere (MDPI)', 200, MDPI_KEY),
      ),
    ).toEqual(choices.map((choice) => choice.section));
  });
});
