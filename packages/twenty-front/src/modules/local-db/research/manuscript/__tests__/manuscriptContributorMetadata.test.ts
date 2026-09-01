import {
  CREDIT_ROLES,
  classifyFunderIdentifier,
  creditRoleUri,
  isValidOrcid,
  normalizeOrcid,
  normalizeRorId,
  parseCreditRole,
} from '@/local-db/research/manuscript/manuscriptContributorIdentifiers';
import {
  isEmptyManuscriptContributorMetadata,
  joinManuscriptContributorDetails,
  manuscriptAuthorInitials,
  parseManuscriptContributorMetadata,
  realignManuscriptContributorMetadata,
  renderManuscriptContributionsStatement,
  renderManuscriptEqualContributionStatement,
  renderManuscriptFundingStatement,
  serializeManuscriptContributorMetadata,
  type ManuscriptContributorMetadata,
} from '@/local-db/research/manuscript/manuscriptContributorMetadata';
import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
} from '@/local-db/research/manuscript/manuscriptContributors';

const affiliations = parseManuscriptAffiliations(
  '1 Northern Analytical Lab\n2 Natural Resources',
);
const authors = parseManuscriptAuthors(
  'Ahmad Jalil [1*]; Hossein Kazemian [1,2]',
  affiliations,
);

const metadata: ManuscriptContributorMetadata = {
  authors: [
    {
      authorId: 'author-1',
      name: 'Ahmad Jalil',
      orcid: '0000-0002-1825-0097',
      email: 'ahmad@example.ca',
      creditRoles: ['Methodology', 'Conceptualization'],
      isEqualContributor: true,
    },
    {
      authorId: 'author-2',
      name: 'Hossein Kazemian',
      creditRoles: ['Supervision'],
      isEqualContributor: true,
    },
  ],
  affiliations: [
    {
      affiliationId: 'affiliation-1',
      name: 'Northern Analytical Lab',
      ror: '03rmrcq20',
      department: 'Department of Chemistry',
      city: 'Prince George',
      country: 'Canada',
    },
  ],
  funding: [
    {
      id: 'award-1',
      funder: 'Natural Sciences and Engineering Research Council of Canada',
      funderIdentifier: '10.13039/501100000038',
      awardId: 'RGPIN-2019-1234',
      recipientAuthorIds: ['author-1'],
    },
  ],
};

describe('ORCID validation', () => {
  it('accepts a well-formed identifier and returns the hyphenated form', () => {
    expect(normalizeOrcid('0000-0002-1825-0097')).toBe('0000-0002-1825-0097');
    expect(normalizeOrcid('0000000218250097')).toBe('0000-0002-1825-0097');
    expect(normalizeOrcid('https://orcid.org/0000-0002-1825-0097')).toBe(
      '0000-0002-1825-0097',
    );
  });

  it('accepts X as the check digit', () => {
    expect(normalizeOrcid('0000-0002-1694-233X')).toBe('0000-0002-1694-233X');
    expect(normalizeOrcid('0000-0002-1694-233x')).toBe('0000-0002-1694-233X');
    expect(isValidOrcid('0000-0002-1694-233X')).toBe(true);
  });

  it('rejects an identifier whose checksum digit is wrong', () => {
    // One digit off the valid 0000-0002-1825-0097 — the shape is right and
    // only the MOD 11-2 check digit catches it.
    expect(normalizeOrcid('0000-0002-1825-0098')).toBeNull();
    expect(isValidOrcid('0000-0002-1825-0098')).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    for (const value of ['', 'not-an-orcid', '0000-0002-1825', undefined]) {
      expect(isValidOrcid(value)).toBe(false);
    }
  });
});

describe('the CRediT taxonomy', () => {
  it('has exactly the 14 published roles', () => {
    expect(CREDIT_ROLES).toHaveLength(14);
    expect(CREDIT_ROLES).toContain('Writing – original draft');
    expect(CREDIT_ROLES).toContain('Writing – review & editing');
  });

  it('resolves every role to its NISO vocabulary URI', () => {
    expect(creditRoleUri('Conceptualization')).toBe(
      'https://credit.niso.org/contributor-roles/conceptualization/',
    );
    expect(creditRoleUri('Writing – review & editing')).toBe(
      'https://credit.niso.org/contributor-roles/writing-review-editing/',
    );
  });

  it('reads a role back from its label, its slug or a plain hyphen', () => {
    expect(parseCreditRole('Data curation')).toBe('Data curation');
    expect(parseCreditRole('data-curation')).toBe('Data curation');
    expect(parseCreditRole('Writing - original draft')).toBe(
      'Writing – original draft',
    );
    expect(parseCreditRole('Chief vibes officer')).toBeNull();
  });
});

describe('contributor metadata storage', () => {
  it('round-trips through JSON in canonical role order', () => {
    const restored = parseManuscriptContributorMetadata(
      serializeManuscriptContributorMetadata(metadata),
    );

    expect(restored.authors[0].orcid).toBe('0000-0002-1825-0097');
    // Stored ticked-box order was Methodology first; the taxonomy's own order
    // comes back.
    expect(restored.authors[0].creditRoles).toEqual([
      'Conceptualization',
      'Methodology',
    ]);
    expect(restored.affiliations[0].ror).toBe('03rmrcq20');
    expect(restored.funding[0].awardId).toBe('RGPIN-2019-1234');
    expect(restored.funding[0].recipientAuthorIds).toEqual(['author-1']);
  });

  it('serializes a manuscript with nothing filled in to an empty string', () => {
    const blank: ManuscriptContributorMetadata = {
      authors: [{ authorId: 'author-1', name: 'Ahmad Jalil' }],
      affiliations: [{ affiliationId: 'affiliation-1', name: 'A lab' }],
      funding: [],
    };

    expect(isEmptyManuscriptContributorMetadata(blank)).toBe(true);
    expect(serializeManuscriptContributorMetadata(blank)).toBe('');
  });

  it('survives a corrupt or hand-edited field', () => {
    for (const value of ['{oops', 'null', '[]', '', undefined]) {
      expect(
        isEmptyManuscriptContributorMetadata(
          parseManuscriptContributorMetadata(value),
        ),
      ).toBe(true);
    }
  });
});

describe('keying structured detail to the byline', () => {
  it('follows an author who moved up the byline, by name', () => {
    const reordered = parseManuscriptAuthors(
      'Hossein Kazemian [1,2]; Ahmad Jalil [1*]',
      affiliations,
    );
    const joined = joinManuscriptContributorDetails(reordered, metadata);

    // Ahmad is now author-2 positionally; his ORCID went with him.
    expect(joined[0].name).toBe('Hossein Kazemian');
    expect(joined[0].detail.orcid).toBeUndefined();
    expect(joined[1].detail.orcid).toBe('0000-0002-1825-0097');
  });

  it('re-keys stored detail to the ids the byline will parse back to', () => {
    const reordered = parseManuscriptAuthors(
      'Hossein Kazemian [1,2]; Ahmad Jalil [1*]',
      affiliations,
    );
    const realigned = realignManuscriptContributorMetadata(
      metadata,
      reordered,
      affiliations,
    );

    expect(realigned.authors.map((detail) => detail.authorId)).toEqual([
      'author-1',
      'author-2',
    ]);
    expect(realigned.authors[1].orcid).toBe('0000-0002-1825-0097');
    // The funding recipient points at Ahmad, who is now the second author.
    expect(realigned.funding[0].recipientAuthorIds).toEqual(['author-2']);
  });

  it('drops detail for an author who is no longer in the byline', () => {
    const realigned = realignManuscriptContributorMetadata(
      metadata,
      parseManuscriptAuthors('Ahmad Jalil [1*]', affiliations),
      affiliations,
    );

    expect(realigned.authors).toHaveLength(1);
    expect(realigned.authors[0].orcid).toBe('0000-0002-1825-0097');
  });
});

describe('rendered statements', () => {
  it('renders the conventional author contributions statement', () => {
    expect(renderManuscriptContributionsStatement(authors, metadata)).toBe(
      'A.J.: Conceptualization, Methodology; H.K.: Supervision',
    );
  });

  it('omits authors who were given no roles', () => {
    expect(
      renderManuscriptContributionsStatement(authors, {
        ...metadata,
        authors: [metadata.authors[0]],
      }),
    ).toBe('A.J.: Conceptualization, Methodology');
  });

  it('renders equal contribution only when at least two authors share it', () => {
    expect(renderManuscriptEqualContributionStatement(authors, metadata)).toBe(
      'A.J. and H.K. contributed equally to this work.',
    );
    expect(
      renderManuscriptEqualContributionStatement(authors, {
        ...metadata,
        authors: [metadata.authors[0]],
      }),
    ).toBe('');
  });

  it('renders the conventional funding statement with award and recipient', () => {
    expect(renderManuscriptFundingStatement(authors, metadata)).toBe(
      'This work was supported by Natural Sciences and Engineering Research ' +
        'Council of Canada (RGPIN-2019-1234 to A.J.).',
    );
  });

  it('joins several funders and falls back to a free-text recipient', () => {
    expect(
      renderManuscriptFundingStatement(authors, {
        ...metadata,
        funding: [
          ...metadata.funding,
          { id: 'award-2', funder: 'Canada Foundation for Innovation' },
          {
            id: 'award-3',
            funder: 'Mitacs',
            awardId: 'IT12345',
            recipient: 'the Northern Analytical Lab',
          },
        ],
      }),
    ).toBe(
      'This work was supported by Natural Sciences and Engineering Research ' +
        'Council of Canada (RGPIN-2019-1234 to A.J.), Canada Foundation for ' +
        'Innovation and Mitacs (IT12345 to the Northern Analytical Lab).',
    );
  });

  it('takes initials from either name order', () => {
    expect(manuscriptAuthorInitials('Ahmad Jalil')).toBe('A.J.');
    expect(manuscriptAuthorInitials('Smith, J.')).toBe('J.S.');
    expect(manuscriptAuthorInitials('Jean-Luc Picard')).toBe('J.-L.P.');
  });
});

describe('organisation identifiers', () => {
  it('normalizes a ROR id from either the bare form or its URL', () => {
    expect(normalizeRorId('https://ror.org/03rmrcq20')).toBe('03rmrcq20');
    expect(normalizeRorId('03rmrcq20')).toBe('03rmrcq20');
    // ROR excludes the ambiguous letters i, l, o and u.
    expect(normalizeRorId('03rmrciq0')).toBeNull();
    expect(normalizeRorId('not a ror')).toBeNull();
  });

  it('tells a funder ROR apart from a Crossref Funder Registry DOI', () => {
    expect(classifyFunderIdentifier('03rmrcq20')).toEqual({
      type: 'ror',
      value: 'https://ror.org/03rmrcq20',
    });
    expect(
      classifyFunderIdentifier('https://doi.org/10.13039/501100000038'),
    ).toEqual({ type: 'doi', value: '10.13039/501100000038' });
    expect(classifyFunderIdentifier('NSERC')).toBeNull();
  });
});
