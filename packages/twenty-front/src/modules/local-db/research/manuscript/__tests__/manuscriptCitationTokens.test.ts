import {
  buildCitationContext,
  citationClusterKey,
  extractCitationClusterItems,
  extractCitationClusters,
  formatInTextCitation,
  renderCitationsInText,
  renderCitationsInTextWithLabels,
  wrapCitationAnchor,
} from '@/local-db/research/manuscript/manuscriptCitations';
import {
  createCiteprocEngine,
  formatCslCitations,
} from '@/local-db/research/manuscript/manuscriptCiteproc';
import {
  parseCitationClusterToken,
  scanCitationTokens,
} from '@/local-db/research/manuscript/manuscriptCitationTokens';
import { collectReferenceUsage } from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import {
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

// Every form in docs/manuscript-format.md §3, asserted at the rendered-output
// level: the export path used to require the bracket to start with `@` and
// treated everything up to the next `;` as a bare key, which swallowed
// locators and missed the prefix and suppressed-author forms entirely.

const references: ReferenceLike[] = [
  {
    id: 'r1',
    citationKey: 'li2017',
    name: 'Ambient exposure surfaces',
    authors: 'Li, Q.',
    year: 2017,
    containerTitle: 'Atmospheric Environment',
    cslJson: JSON.stringify({
      id: 'li2017',
      type: 'article-journal',
      title: 'Ambient exposure surfaces',
      author: [{ family: 'Li', given: 'Qian' }],
      issued: { 'date-parts': [[2017]] },
      'container-title': 'Atmospheric Environment',
    }),
  },
  {
    id: 'r2',
    citationKey: 'smith2020',
    name: 'On topological films',
    authors: 'Smith, J.',
    year: 2020,
    containerTitle: 'Nature Materials',
    cslJson: JSON.stringify({
      id: 'smith2020',
      type: 'article-journal',
      title: 'On topological films',
      author: [{ family: 'Smith', given: 'Jane' }],
      issued: { 'date-parts': [[2020]] },
      'container-title': 'Nature Materials',
    }),
  },
];

const byKey = new Map(
  references.map((reference) => [reference.citationKey as string, reference]),
);

const numeric = buildCitationContext(
  ['li2017', 'smith2020'],
  byKey,
  'NUMERIC',
).context;

const authorDate = buildCitationContext(
  ['li2017', 'smith2020'],
  byKey,
  'AUTHOR_DATE',
).context;

describe('citation token parsing', () => {
  it('splits a locator off the reference key instead of swallowing it', () => {
    expect(parseCitationClusterToken('[@li2017, p. 42]')).toEqual([
      {
        citationKey: 'li2017',
        locator: 'p. 42',
        prefix: '',
        suffix: '',
        suppressAuthor: false,
      },
    ]);
    expect(extractCitationClusterItems('Locator [@li2017, p. 42].')).toEqual([
      [
        {
          citationKey: 'li2017',
          locator: 'p. 42',
          prefix: '',
          suffix: '',
          suppressAuthor: false,
        },
      ],
    ]);
    // The key-only view stays clean, which is what usage counting reads.
    expect(extractCitationClusters('Locator [@li2017, p. 42].')).toEqual([
      ['li2017'],
    ]);
  });

  it('recognises the prefix and suppressed-author forms', () => {
    expect(extractCitationClusters('Prefix [see @li2017].')).toEqual([
      ['li2017'],
    ]);
    expect(parseCitationClusterToken('[see @li2017]')[0].prefix).toBe('see');
    expect(parseCitationClusterToken('[-@li2017]')[0].suppressAuthor).toBe(
      true,
    );
  });

  it('leaves a bracket that is not a citation alone', () => {
    expect(scanCitationTokens('A [bracketed] aside.')).toEqual([]);
    expect(extractCitationClusters('See [Table 1] and [#fig:a].')).toEqual([]);
  });
});

describe('rendering the six documented in-text forms', () => {
  it('renders a plain citation and a cluster as before', () => {
    expect(renderCitationsInText('Ordinary [@li2017].', numeric)).toBe(
      'Ordinary [1].',
    );
    expect(
      renderCitationsInText('Cluster [@li2017; @smith2020].', numeric),
    ).toBe('Cluster [1, 2].');
  });

  it('keeps the locator in the rendered citation', () => {
    expect(renderCitationsInText('Locator [@li2017, p. 42].', numeric)).toBe(
      'Locator [1, p. 42].',
    );
    expect(renderCitationsInText('Locator [@li2017, p. 42].', authorDate)).toBe(
      'Locator (Li, 2017, p. 42).',
    );
  });

  it('renders a prefix ahead of the resolved reference', () => {
    expect(renderCitationsInText('Prefix [see @li2017].', numeric)).toBe(
      'Prefix [see 1].',
    );
    expect(renderCitationsInText('Prefix [see @li2017].', authorDate)).toBe(
      'Prefix (see Li, 2017).',
    );
  });

  it('suppresses the author when the token asks for it', () => {
    expect(renderCitationsInText("Li's model [-@li2017].", authorDate)).toBe(
      "Li's model (2017).",
    );
    // Numeric styles print no author, so suppression leaves the number.
    expect(renderCitationsInText("Li's model [-@li2017].", numeric)).toBe(
      "Li's model [1].",
    );
  });

  it('never renders a resolvable citation as the unresolved marker', () => {
    for (const markdown of [
      'Ordinary [@li2017].',
      'Cluster [@li2017; @smith2020].',
      'Locator [@li2017, p. 42].',
      'Prefix [see @li2017].',
      'Suppress [-@li2017].',
    ]) {
      expect(renderCitationsInText(markdown, numeric)).not.toContain('[?]');
    }
  });

  it('separates an affixed cluster unambiguously', () => {
    expect(
      renderCitationsInText('Both [@li2017, p. 42; @smith2020].', numeric),
    ).toBe('Both [1, p. 42; 2].');
  });
});

describe('literal contexts stay literal', () => {
  it('leaves a backslash-escaped token untouched', () => {
    const markdown = 'Escaped \\[@li2017].';
    expect(renderCitationsInText(markdown, numeric)).toBe(markdown);
    expect(extractCitationClusters(markdown)).toEqual([]);
  });

  it('leaves a token inside an inline code span untouched', () => {
    const markdown = 'Code `[@li2017]` stays literal.';
    expect(renderCitationsInText(markdown, numeric)).toBe(markdown);
    expect(extractCitationClusters(markdown)).toEqual([]);
  });

  it('leaves a token inside a fenced code block untouched', () => {
    const markdown = [
      'Before [@li2017].',
      '',
      '```md',
      'Sample token: [@li2017, p. 42]',
      '```',
      '',
      'After [@smith2020].',
    ].join('\n');

    expect(renderCitationsInText(markdown, numeric)).toBe(
      markdown
        .replace('Before [@li2017].', 'Before [1].')
        .replace('After [@smith2020].', 'After [2].'),
    );
    expect(extractCitationClusters(markdown)).toEqual([
      ['li2017'],
      ['smith2020'],
    ]);
  });

  it('does not count a citation that only appears in a code block as usage', () => {
    const sections: SectionLike[] = [
      {
        id: 's1',
        name: 'Methods',
        content: '```\n[@smith2020]\n```\n\nReal use [@li2017].',
      },
    ];
    const usage = collectReferenceUsage(sections, [], references);
    expect(usage.get('li2017')?.count).toBe(1);
    expect(usage.get('smith2020')?.count).toBe(0);
  });
});

describe('structured clusters downstream', () => {
  it('keeps the anchor payload on the reference keys only', () => {
    expect(
      renderCitationsInText('Locator [@li2017, p. 42].', numeric, true),
    ).toBe(`Locator ${wrapCitationAnchor(['li2017'], '[1, p. 42]')}.`);
  });

  it('gives two clusters with different locators different label keys', () => {
    const [first, second] = extractCitationClusterItems(
      'One [@li2017, p. 42] two [@li2017, p. 7].',
    );
    expect(citationClusterKey(first)).not.toBe(citationClusterKey(second));

    expect(
      renderCitationsInTextWithLabels(
        'One [@li2017, p. 42] two [@li2017, p. 7].',
        new Map([
          [citationClusterKey(first), '(Li, 2017, p. 42)'],
          [citationClusterKey(second), '(Li, 2017, p. 7)'],
        ]),
        authorDate,
      ),
    ).toBe('One (Li, 2017, p. 42) two (Li, 2017, p. 7).');
  });

  it('still matches a metadata-free cluster by its bare keys', () => {
    expect(citationClusterKey(['li2017', 'smith2020'])).toBe(
      citationClusterKey(
        extractCitationClusterItems('[@li2017; @smith2020]')[0],
      ),
    );
  });

  it('formats bare keys exactly as before', () => {
    expect(formatInTextCitation(['smith2020', 'li2017'], numeric)).toBe(
      '[2, 1]',
    );
  });
});

describe('CSL rendering carries the token structure', () => {
  it('passes locator, prefix and suppression through to citeproc', async () => {
    const engine = await createCiteprocEngine({ styleId: 'apa', references });
    expect(engine).not.toBeNull();

    const [locator, prefix, suppressed] = formatCslCitations(engine!, [
      extractCitationClusterItems('[@li2017, p. 42]')[0],
      extractCitationClusterItems('[see @li2017]')[0],
      extractCitationClusterItems('[-@li2017]')[0],
    ]);

    expect(locator).toMatch(/Li/);
    expect(locator).toMatch(/p\.\s*42/);
    expect(prefix).toMatch(/see/);
    expect(suppressed).toMatch(/2017/);
    expect(suppressed).not.toMatch(/Li/);
  });
});
