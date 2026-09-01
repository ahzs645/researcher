import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  EMPTY_MANUSCRIPT_CONTRIBUTOR_METADATA,
  serializeManuscriptContributorMetadata,
  type ManuscriptContributorMetadata,
} from '@/local-db/research/manuscript/manuscriptContributorMetadata';
import { buildJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsExport';

const baseInput: BuildBundleInput = {
  manuscript: {
    id: 'm1',
    name: 'Trace metals in northern rivers',
    targetVenue: 'Journal of Tests',
    doi: '10.1000/test',
    affiliations: '1 Northern Analytical Lab\n2 Natural Resources',
    correspondingAuthor: 'Ahmad Jalil (ahmad@example.ca)',
  },
  style: { citationMode: 'NUMERIC' },
  authors: 'Ahmad Jalil [1*]; Hossein Kazemian [1,2]',
  sections: [
    {
      id: 'abs',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      orderIndex: 0,
      content: 'We test things.',
    },
    {
      id: 'kw',
      name: 'Keywords',
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      orderIndex: 1,
      content: 'testing; xml',
    },
    {
      id: 'res',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      orderIndex: 2,
      content: 'It works.',
    },
  ],
  figures: [],
  references: [],
};

// The whole promise of the structured contributor layer is that it is
// optional: a manuscript that carries none of it must export exactly the
// bytes it exported before the layer existed. This snapshot was captured from
// the exporter as it stood beforehand — if it moves, the promise broke.
describe('JATS without structured contributor metadata', () => {
  it('emits byte-identical output to the pre-metadata exporter', () => {
    expect(
      buildJatsArticle(buildManuscriptBundle(baseInput)),
    ).toMatchSnapshot();
  });

  it('treats an empty metadata record the same as none at all', () => {
    const bundle = buildManuscriptBundle(baseInput);

    expect(
      buildJatsArticle(bundle, EMPTY_MANUSCRIPT_CONTRIBUTOR_METADATA),
    ).toBe(buildJatsArticle(bundle));
  });

  it('emits none of the structured elements', () => {
    const jats = buildJatsArticle(buildManuscriptBundle(baseInput));

    for (const element of [
      '<contrib-id',
      '<role vocab',
      '<institution-id',
      '<funding-group>',
      '<xref ref-type="aff"',
    ]) {
      expect(jats).not.toContain(element);
    }
  });
});

const contributorMetadata: ManuscriptContributorMetadata = {
  authors: [
    {
      authorId: 'author-1',
      name: 'Ahmad Jalil',
      orcid: '0000-0002-1825-0097',
      email: 'ahmad@example.ca',
      creditRoles: ['Conceptualization', 'Writing – review & editing'],
      isEqualContributor: true,
    },
    {
      authorId: 'author-2',
      name: 'Hossein Kazemian',
      orcid: '0000-0002-1825-0098',
      creditRoles: ['Supervision'],
      isDeceased: true,
    },
  ],
  affiliations: [
    {
      affiliationId: 'affiliation-1',
      name: 'Northern Analytical Lab',
      ror: '03rmrcq20',
      department: 'Department of Chemistry',
      city: 'Prince George',
      state: 'British Columbia',
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

describe('JATS with structured contributor metadata', () => {
  const jats = buildJatsArticle(
    buildManuscriptBundle(baseInput),
    contributorMetadata,
  );

  it('stays well-formed XML', () => {
    expect(
      new DOMParser()
        .parseFromString(jats, 'text/xml')
        .querySelector('parsererror'),
    ).toBeNull();
  });

  it('emits the ORCID as a resolvable contrib-id', () => {
    expect(jats).toContain(
      '<contrib-id contrib-id-type="orcid">https://orcid.org/0000-0002-1825-0097</contrib-id>',
    );
  });

  it('omits an ORCID that fails its checksum rather than publishing it', () => {
    expect(jats).not.toContain('0000-0002-1825-0098');
    expect(jats).toContain('<string-name>Hossein Kazemian</string-name>');
  });

  it('emits CRediT roles against the NISO vocabulary', () => {
    expect(jats).toContain(
      '<role vocab="credit" vocab-identifier="https://credit.niso.org/"' +
        ' vocab-term="Conceptualization"' +
        ' vocab-term-identifier="https://credit.niso.org/contributor-roles/conceptualization/">' +
        'Conceptualization</role>',
    );
    // The ampersand in "review & editing" has to survive as an XML entity in
    // both the attribute and the element content.
    expect(jats).toContain(
      'vocab-term="Writing – review &amp; editing"' +
        ' vocab-term-identifier="https://credit.niso.org/contributor-roles/writing-review-editing/">' +
        'Writing – review &amp; editing</role>',
    );
  });

  it('marks corresponding, equal-contributor and deceased authors', () => {
    expect(jats).toContain(
      '<contrib contrib-type="author" corresp="yes" equal-contrib="yes">',
    );
    expect(jats).toContain('<contrib contrib-type="author" deceased="yes">');
  });

  it('links each author to its affiliation instead of printing the marker', () => {
    expect(jats).toContain('<string-name>Ahmad Jalil</string-name>');
    expect(jats).not.toContain('Ahmad Jalil [1*]');
    expect(jats).toContain('<xref ref-type="aff" rid="aff1"/>');
    expect(jats).toContain('<aff id="aff1">');
  });

  it('emits the ROR inside the institution wrapper', () => {
    expect(jats).toContain(
      '<institution content-type="dept">Department of Chemistry</institution>',
    );
    expect(jats).toContain(
      '<institution>Northern Analytical Lab</institution>',
    );
    expect(jats).toContain(
      '<institution-id institution-id-type="ror">https://ror.org/03rmrcq20</institution-id>',
    );
    expect(jats).toContain('<city>Prince George</city>');
    expect(jats).toContain('<country>Canada</country>');
  });

  it('emits a funding-group with award-id, funder DOI and recipient', () => {
    expect(jats).toContain('<funding-group>');
    expect(jats).toContain('<award-group id="award-1">');
    expect(jats).toContain('<award-id>RGPIN-2019-1234</award-id>');
    expect(jats).toContain(
      '<institution-id institution-id-type="doi">10.13039/501100000038</institution-id>',
    );
    expect(jats).toContain('<principal-award-recipient>');
    expect(jats).toContain(
      '<funding-statement>This work was supported by Natural Sciences and ' +
        'Engineering Research Council of Canada (RGPIN-2019-1234 to A.J.).' +
        '</funding-statement>',
    );
  });

  it('keeps funding-group inside article-meta, after the keywords', () => {
    expect(jats.indexOf('<funding-group>')).toBeGreaterThan(
      jats.indexOf('</kwd-group>'),
    );
    expect(jats.indexOf('<funding-group>')).toBeLessThan(
      jats.indexOf('</article-meta>'),
    );
  });

  it('reads the metadata off the manuscript record when none is passed', () => {
    // The field rides on the manuscript record the bundle carries through, so
    // the exporter finds it without being handed it separately.
    const manuscript = {
      ...baseInput.manuscript,
      contributorMetadata:
        serializeManuscriptContributorMetadata(contributorMetadata),
    };
    const bundle = buildManuscriptBundle({ ...baseInput, manuscript });

    expect(buildJatsArticle(bundle)).toContain(
      '<contrib-id contrib-id-type="orcid">https://orcid.org/0000-0002-1825-0097</contrib-id>',
    );
  });
});
