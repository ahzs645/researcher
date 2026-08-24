import {
  buildCitationContext,
  citationClusterKey,
  extractCitationClusters,
  firstAuthorSurname,
  formatBibliography,
  formatInTextCitation,
  renderCitationsInText,
  renderCitationsInTextWithLabels,
} from '@/local-db/research/manuscript/manuscriptCitations';
import {
  extractCitationKeys,
  resolveCrossReferences,
} from '@/local-db/research/manuscript/manuscriptCrossReference';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

const references: ReferenceLike[] = [
  {
    id: 'r1',
    citationKey: 'smith2020',
    name: 'On topological films',
    authors: 'Smith, J.',
    year: 2020,
    containerTitle: 'Nature Materials',
  },
  {
    id: 'r2',
    citationKey: 'doe2019',
    name: 'Spintronic devices',
    authors: 'Doe, A.; Lee, B.',
    year: 2019,
    containerTitle: 'PRL',
  },
];
const byKey = new Map(references.map((r) => [r.citationKey as string, r]));

describe('cross references', () => {
  it('resolves [#fig:key] to the figure label and reports unknowns', () => {
    const numbered = numberAssets([
      { id: 'f1', refKey: 'arpes', assetKind: 'FIGURE', placement: 'MAIN' },
    ]);
    const { text, unresolvedKeys } = resolveCrossReferences(
      'As shown in [#fig:arpes], and [#fig:missing].',
      numbered,
    );
    expect(text).toContain('As shown in Figure 1,');
    expect(unresolvedKeys).toEqual(['fig:missing']);
  });
});

describe('citation extraction', () => {
  it('extracts keys in first-use order, deduped', () => {
    expect(
      extractCitationKeys('text [@doe2019] more [@smith2020; @doe2019]'),
    ).toEqual(['doe2019', 'smith2020']);
  });
});

describe('numeric citations', () => {
  const { context, orderedKeys } = buildCitationContext(
    ['doe2019', 'smith2020'],
    byKey,
    'NUMERIC',
  );

  it('numbers references by order of first citation', () => {
    expect(orderedKeys).toEqual(['doe2019', 'smith2020']);
    expect(formatInTextCitation(['smith2020', 'doe2019'], context)).toBe(
      '[2, 1]',
    );
  });

  it('renders a numbered bibliography', () => {
    const bib = formatBibliography(context, orderedKeys);
    expect(bib[0].number).toBe(1);
    expect(bib[0].text).toMatch(/^1\. Doe, A\.; Lee, B\. \(2019\)\./);
  });

  it('rewrites in-text clusters', () => {
    expect(renderCitationsInText('see [@smith2020]', context)).toBe('see [2]');
  });

  // The export path must collapse a whole cluster into one in-text citation —
  // the editor chip relies on the same cluster semantics.
  it('rewrites a multi-key cluster as one citation, with or without CSL labels', () => {
    expect(
      renderCitationsInText('see [@smith2020; @doe2019] here', context),
    ).toBe('see [2, 1] here');
    expect(
      renderCitationsInTextWithLabels(
        'see [@smith2020; @doe2019] here',
        new Map([[citationClusterKey(['smith2020', 'doe2019']), '(2, 1)']]),
        context,
      ),
    ).toBe('see (2, 1) here');
    expect(
      extractCitationClusters('a [@smith2020; @doe2019] b [@doe2019]'),
    ).toEqual([['smith2020', 'doe2019'], ['doe2019']]);
  });
});

describe('author-date citations', () => {
  it('orders alphabetically and renders (Surname, year)', () => {
    const { context, orderedKeys } = buildCitationContext(
      ['smith2020', 'doe2019'],
      byKey,
      'AUTHOR_DATE',
    );
    expect(orderedKeys).toEqual(['doe2019', 'smith2020']);
    expect(formatInTextCitation(['smith2020'], context)).toBe('(Smith, 2020)');
  });

  it('renders a suppressed author as the year alone', () => {
    const { context } = buildCitationContext(
      ['smith2020', 'doe2019'],
      byKey,
      'AUTHOR_DATE',
    );
    // "Smith (2020) showed …" — the prose carries the name already.
    expect(renderCitationsInText('Smith [-@smith2020] showed', context)).toBe(
      'Smith (2020) showed',
    );
    expect(
      extractCitationClusters('Smith [-@smith2020] and [@doe2019]'),
    ).toEqual([['-smith2020'], ['doe2019']]);
    // The key still counts toward the bibliography.
    expect(extractCitationKeys('Smith [-@smith2020]')).toEqual(['smith2020']);
  });

  it('ignores author suppression in numeric modes', () => {
    const { context } = buildCitationContext(
      ['smith2020', 'doe2019'],
      byKey,
      'NUMERIC',
    );
    expect(renderCitationsInText('Smith [-@smith2020]', context)).toBe(
      'Smith [1]',
    );
  });
});

describe('firstAuthorSurname', () => {
  it('pulls the surname from common author formats', () => {
    expect(firstAuthorSurname('Smith, J.; Doe, A.')).toBe('Smith');
    expect(firstAuthorSurname('Jane Smith and Bob Doe')).toBe('Smith');
    expect(firstAuthorSurname('')).toBe('');
  });
});
