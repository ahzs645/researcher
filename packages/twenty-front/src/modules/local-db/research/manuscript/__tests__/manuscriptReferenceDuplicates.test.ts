import {
  findDuplicateReferenceGroups,
  referenceFilledFieldCount,
  suggestDuplicateReferenceKeep,
} from '@/local-db/research/manuscript/manuscriptReferenceDuplicates';
import { type ReferenceUsageByCitationKey } from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

const reference = (
  id: string,
  fields: Partial<ReferenceLike>,
): ReferenceLike => ({ id, citationKey: id, ...fields });

describe('findDuplicateReferenceGroups', () => {
  it('matches DOI first and normalizes DOI URLs and case', () => {
    const groups = findDuplicateReferenceGroups([
      reference('first', { doi: 'https://doi.org/10.1000/ABC' }),
      reference('second', { doi: '10.1000/abc' }),
      reference('third', { doi: '10.1000/different' }),
    ]);

    expect(groups.map((group) => group.references.map(({ id }) => id))).toEqual(
      [['first', 'second']],
    );
  });

  it('falls back to normalized title when a DOI is unavailable', () => {
    const groups = findDuplicateReferenceGroups([
      reference('first', { name: 'Air-quality: effects!' }),
      reference('second', { name: 'Air Quality Effects', doi: '10.1/x' }),
    ]);

    expect(groups[0].references).toHaveLength(2);
  });

  it('falls back to year and first-author surname when titles are absent', () => {
    const groups = findDuplicateReferenceGroups([
      reference('first', { authors: 'García, Ana', year: 2024 }),
      reference('second', { authors: 'Ana Garcia; Doe, J.', year: 2024 }),
      reference('other-year', { authors: 'Garcia, A.', year: 2023 }),
    ]);

    expect(groups.map((group) => group.references.map(({ id }) => id))).toEqual(
      [['first', 'second']],
    );
  });

  it('falls through a DOI mismatch to the normalized title rule', () => {
    expect(
      findDuplicateReferenceGroups([
        reference('first', { doi: '10.1/a', name: 'Same title' }),
        reference('second', { doi: '10.1/b', name: 'Same title' }),
      ]),
    ).toHaveLength(1);
  });

  it('falls through different titles to year and first-author surname', () => {
    expect(
      findDuplicateReferenceGroups([
        reference('first', {
          name: 'Early version',
          authors: 'Smith, Jane',
          year: 2025,
        }),
        reference('second', {
          name: 'Published version',
          authors: 'Jane Smith',
          year: 2025,
        }),
      ]),
    ).toHaveLength(1);
  });
});

describe('suggestDuplicateReferenceKeep', () => {
  it('prefers filled fields, then citation count', () => {
    const sparse = reference('sparse', { name: 'Title' });
    const complete = reference('complete', {
      name: 'Title',
      authors: 'Smith, J.',
    });
    const usage: ReferenceUsageByCitationKey = new Map([
      ['sparse', { count: 20, sectionIds: ['section'] }],
      ['complete', { count: 1, sectionIds: ['section'] }],
    ]);
    expect(
      suggestDuplicateReferenceKeep({ references: [sparse, complete] }, usage)
        .id,
    ).toBe('complete');

    const equallyComplete = reference('equally-complete', {
      name: 'Title',
      authors: 'Smith, J.',
    });
    usage.set('equally-complete', { count: 3, sectionIds: ['section'] });
    expect(
      suggestDuplicateReferenceKeep(
        { references: [complete, equallyComplete] },
        usage,
      ).id,
    ).toBe('equally-complete');
    expect(referenceFilledFieldCount(complete)).toBe(3);
  });
});
