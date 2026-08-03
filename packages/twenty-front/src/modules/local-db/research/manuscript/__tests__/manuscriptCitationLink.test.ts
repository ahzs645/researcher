import {
  applyCitationLinks,
  collectUnlinkedCitations,
  isCitationLinkSuggestionUnambiguous,
} from '@/local-db/research/manuscript/manuscriptCitationLink';
import {
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

const reference = (
  citationKey: string,
  authors: string,
  year: number,
  orderIndex: number,
  name = `${citationKey} title`,
): ReferenceLike => ({
  id: citationKey,
  citationKey,
  authors,
  year,
  orderIndex,
  name,
});

const references: ReferenceLike[] = [
  reference('li2017', 'Li, Q.; Zhang, H.', 2017, 0),
  reference('brunekreef2005', 'Brunekreef, B.; Forsberg, B.', 2005, 1),
  reference('donaldson2001', 'Donaldson, K.; MacNee, W.', 2001, 2),
  reference('pope2006', 'Pope, C. A.; Dockery, D. W.', 2006, 3),
  reference('wyzga2015', 'Wyzga, R. E.; Rohr, A. C.', 2015, 4),
  reference('moulton2012', 'Moulton, P. V.; Yang, W.', 2012, 5),
  reference(
    'british2016',
    'BRITISH COLUMBIA MINISTRY OF ENVIRONMENT',
    2016,
    6,
    'British Columbia air quality objectives',
  ),
  reference('moulton2022', 'Moulton, J.', 2022, 7),
  reference('pehoiu2008', 'Pehoiu, G.', 2008, 8),
  reference('manisalidis2020', 'Manisalidis, I.; et al.', 2020, 9),
];

describe('isCitationLinkSuggestionUnambiguous', () => {
  it('requires both high confidence and separation from the next candidate', () => {
    expect(
      isCitationLinkSuggestionUnambiguous([
        { citationKey: 'smith2024', score: 0.96 },
        { citationKey: 'smith2023', score: 0.92 },
      ]),
    ).toBe(false);
    expect(
      isCitationLinkSuggestionUnambiguous([
        { citationKey: 'smith2024', score: 0.96 },
        { citationKey: 'jones2024', score: 0.7 },
      ]),
    ).toBe(true);
  });
});

const section = (content: string): SectionLike => ({
  id: 'introduction',
  name: 'Introduction',
  content,
});

describe('collectUnlinkedCitations', () => {
  it('collects the mixed real-world markers and ranks member suggestions', () => {
    const occurrences = collectUnlinkedCitations(
      [
        section(
          [
            'Already linked [@li2017; @manisalidis2020; @pehoiu2008].',
            'Numeric [1], [2], [6], [7], [8].',
            'Air pollution (Brunekreef & Forsberg, 2005).',
            'Cluster (Donaldson & MacNee, 2001; Pope & Dockery, 2006; Wyzga & Rohr, 2015).',
            'Initials (P. V. Moulton & Yang, 2012).',
            'Organizations (BRITISH COLUMBIA MINISTRY OF ENVIRONMENT, 2016; J. Moulton, 2022).',
            'Also (Manisalidis et al., 2020).',
          ].join('\n'),
        ),
      ],
      references,
    );

    expect(occurrences.map(({ marker }) => marker)).toEqual([
      '[1]',
      '[2]',
      '[6]',
      '[7]',
      '[8]',
      '(Brunekreef & Forsberg, 2005)',
      '(Donaldson & MacNee, 2001; Pope & Dockery, 2006; Wyzga & Rohr, 2015)',
      '(P. V. Moulton & Yang, 2012)',
      '(BRITISH COLUMBIA MINISTRY OF ENVIRONMENT, 2016; J. Moulton, 2022)',
      '(Manisalidis et al., 2020)',
    ]);
    expect(occurrences[0].parts[0].suggestions[0]).toMatchObject({
      citationKey: 'li2017',
      score: 1,
    });
    expect(occurrences[5].parts[0].suggestions[0].citationKey).toBe(
      'brunekreef2005',
    );
    expect(
      occurrences[6].parts.map((part) => part.suggestions[0]?.citationKey),
    ).toEqual(['donaldson2001', 'pope2006', 'wyzga2015']);
    expect(occurrences[7].parts[0].suggestions[0].citationKey).toBe(
      'moulton2012',
    );
    expect(
      occurrences[8].parts.map((part) => part.suggestions[0]?.citationKey),
    ).toEqual(['british2016', 'moulton2022']);
    expect(occurrences[9].parts[0].suggestions[0].citationKey).toBe(
      'manisalidis2020',
    );
  });

  it('is diacritics-insensitive and keeps multiple candidates best-first', () => {
    const candidates = [
      reference('garcia2020a', 'García, M.', 2020, 0),
      reference('garcia2020b', 'Garcia-Santos, M.', 2020, 1),
    ];
    const [occurrence] = collectUnlinkedCitations(
      [section('Result (Garcia et al., 2020).')],
      candidates,
    );

    expect(
      occurrence.parts[0].suggestions.map(({ citationKey }) => citationKey),
    ).toEqual(['garcia2020a', 'garcia2020b']);
  });

  it('skips code spans and linked tokens', () => {
    const occurrences = collectUnlinkedCitations(
      [
        section(
          '`[1]` and `(Moulton, 2012)`\n```\n[2]\n```\n[@li2017] then [1].',
        ),
      ],
      references,
    );

    expect(occurrences.map(({ marker }) => marker)).toEqual(['[1]']);
  });

  it('lists numeric occurrences without suggestions when no order exists', () => {
    const unordered = references.map(
      ({ orderIndex: _orderIndex, ...item }) => item,
    );
    const [occurrence] = collectUnlinkedCitations(
      [section('Prior work [1, 2].')],
      unordered,
    );

    expect(occurrence.parts.map(({ marker }) => marker)).toEqual(['1', '2']);
    expect(occurrence.suggestions).toEqual([]);
  });

  it('uses portable numbered-list order before creation-time fallback', () => {
    const portable = [
      {
        ...reference('second', 'Second, A.', 2020, 0),
        orderIndex: undefined,
        cslJson: JSON.stringify({ 'researcher:referenceIndex': 2 }),
      },
      {
        ...reference('first', 'First, A.', 2020, 1),
        orderIndex: undefined,
        cslJson: JSON.stringify({ 'researcher:referenceIndex': 1 }),
      },
    ];
    const [occurrence] = collectUnlinkedCitations(
      [section('Prior work [1].')],
      portable,
    );

    expect(occurrence.parts[0].suggestions[0].citationKey).toBe('first');
  });
});

describe('applyCitationLinks', () => {
  it('replaces confirmed single and clustered occurrences only', () => {
    const sections = [
      section(
        'One [1]. Cluster (Donaldson & MacNee, 2001; Pope & Dockery, 2006). Skip [2]. `Code [1]`.',
      ),
    ];
    const occurrences = collectUnlinkedCitations(sections, references);
    const numeric = occurrences.find(({ marker }) => marker === '[1]');
    const cluster = occurrences.find(({ kind }) => kind === 'authorYear');
    if (numeric === undefined || cluster === undefined) {
      throw new Error('Expected citation fixtures');
    }

    const changed = applyCitationLinks(sections, [
      {
        sectionId: numeric.sectionId,
        marker: numeric.marker,
        index: numeric.index,
        citationKeys: ['li2017'],
      },
      {
        sectionId: cluster.sectionId,
        marker: cluster.marker,
        index: cluster.index,
        citationKeys: ['donaldson2001', 'pope2006'],
      },
    ]);

    expect(changed).toHaveLength(1);
    expect(changed[0].content).toBe(
      'One [@li2017]. Cluster [@donaldson2001; @pope2006]. Skip [2]. `Code [1]`.',
    );
    expect(applyCitationLinks(sections, [])).toEqual([]);
  });
});
