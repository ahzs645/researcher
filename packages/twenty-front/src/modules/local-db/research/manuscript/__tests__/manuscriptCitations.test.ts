import {
  buildCitationContext,
  firstAuthorSurname,
  formatBibliography,
  formatInTextCitation,
  renderCitationsInText,
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
});

describe('firstAuthorSurname', () => {
  it('pulls the surname from common author formats', () => {
    expect(firstAuthorSurname('Smith, J.; Doe, A.')).toBe('Smith');
    expect(firstAuthorSurname('Jane Smith and Bob Doe')).toBe('Smith');
    expect(firstAuthorSurname('')).toBe('');
  });
});
