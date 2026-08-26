import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { buildJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsExport';

it('prints', () => {
  const xml = buildJatsArticle(
    buildManuscriptBundle({
      manuscript: {
        id: 'm1',
        name: 'Trace metals',
        affiliations: '1 Northern Analytical Lab\n2 Natural Resources',
      },
      style: {},
      authors: 'Ahmad Jalil [1*]; Hossein Kazemian [1,2]',
      sections: [{ id: 's', name: 'Results', sectionType: 'RESULTS', placement: 'MAIN', content: 'Text.' }],
      figures: [],
      references: [],
    }),
    {
      authors: [
        { authorId: 'author-1', name: 'Ahmad Jalil', orcid: '0000-0002-1825-0097', email: 'a@b.ca', creditRoles: ['Conceptualization', 'Writing – review & editing'], isEqualContributor: true },
        { authorId: 'author-2', name: 'Hossein Kazemian', creditRoles: ['Supervision'] },
      ],
      affiliations: [
        { affiliationId: 'affiliation-1', ror: '03rmrcq20', department: 'Department of Chemistry', city: 'Prince George', country: 'Canada' },
      ],
      funding: [
        { id: 'award-1', funder: 'NSERC', funderIdentifier: '10.13039/501100000038', awardId: 'RGPIN-2019-1234', recipientAuthorIds: ['author-1'] },
      ],
    },
  );
  console.log(xml.slice(0, xml.indexOf('<body>')));
  expect(xml.length).toBeGreaterThan(0);
});
