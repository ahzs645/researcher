import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type ManuscriptBundle } from './manuscriptAssembly';
import {
  classifyFunderIdentifier,
  orcidUri,
  rorUri,
} from './manuscriptContributorIdentifiers';
import {
  joinManuscriptAffiliationDetails,
  joinManuscriptContributorDetails,
  readManuscriptContributorMetadata,
  type ManuscriptContributorMetadata,
} from './manuscriptContributorMetadata';
import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
} from './manuscriptContributors';
import { escapeHtmlAttribute } from './manuscriptHtmlMarkdown';
import { classifyReferenceIdentifier } from './manuscriptReferenceIdentifiers';

// The head that makes a self-contained export describe itself, the way Pandoc
// Scholar does: the same structured contributor data the JATS writer already
// emits — ORCID, ROR, funding — restated in the three vocabularies a machine
// reader actually looks for. Highwire `citation_*` is what Google Scholar and
// Zotero read, Dublin Core is what repository software reads, and JSON-LD
// types the document as a schema.org ScholarlyArticle. The app's own reference
// importer (`htmlMetaToCslItem`) already reads the first two off other
// people's pages, so this is the vocabulary it never spoke.
//
// Nothing is emitted on a guess. An empty `citation_doi` tells a harvester the
// paper has no DOI, which is a stronger — and usually wrong — claim than
// silence; a mistyped ORCID attaches the paper to a stranger. So every value
// goes through the validator the record layer already owns, and a value that
// does not survive it is left out along with its tag.
//
// No `.jsonld` sidecar: the export panel downloads each returned file
// separately, so a second file would mean a second browser download (blocked
// outright by some browsers) and would contradict the one thing this exporter
// promises — a single file that opens anywhere. The same graph is embedded in
// the page instead, which is where a harvester reading the HTML looks anyway.

export type ManuscriptMetaTag = { name: string; content: string };

type DiscoveryOrganization = {
  name: string;
  rorUri: string | null;
  city?: string;
  state?: string;
  country?: string;
};

type DiscoveryAuthor = {
  name: string;
  orcidUri: string | null;
  email?: string;
  organizations: DiscoveryOrganization[];
};

type DiscoveryFunder = {
  name: string;
  identifierUri: string | null;
  awardId?: string;
};

export type ManuscriptDiscoveryFacts = {
  title: string;
  authors: DiscoveryAuthor[];
  abstract: string;
  keywords: string[];
  journal: string;
  // The bare DOI ("10.1234/abc") and the resolvable form, or null when the
  // record carries nothing that is actually a DOI.
  doi: string | null;
  doiUri: string | null;
  funders: DiscoveryFunder[];
};

const doiUriFor = (doi: string): string => `https://doi.org/${doi}`;

// A meta attribute is one line by definition; an abstract typed across several
// paragraphs would otherwise put raw newlines inside the quotes.
const singleLine = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const organizationFacts = (
  name: string,
  detail: { ror?: string; city?: string; state?: string; country?: string },
): DiscoveryOrganization => ({
  name,
  rorUri: rorUri(detail.ror),
  city: detail.city,
  state: detail.state,
  country: detail.country,
});

export const buildManuscriptDiscoveryFacts = (
  bundle: ManuscriptBundle,
  // Defaults to whatever the manuscript record carries, exactly as the JATS
  // writer does, so both exports describe the same paper.
  contributorMetadata: ManuscriptContributorMetadata = readManuscriptContributorMetadata(
    bundle.sourceInput.manuscript,
  ),
): ManuscriptDiscoveryFacts => {
  const { metadata } = bundle;
  const parsedAffiliations = parseManuscriptAffiliations(metadata.affiliations);
  const affiliations = joinManuscriptAffiliationDetails(
    parsedAffiliations,
    contributorMetadata,
  );
  const organizationById = new Map(
    affiliations.map((affiliation) => [
      affiliation.id,
      organizationFacts(affiliation.name, affiliation.detail),
    ]),
  );
  // The byline, not the raw string: parsing strips the affiliation markers and
  // the superscripts, so "Jalil, A.¹*" is published as the name it stands for.
  const authors = joinManuscriptContributorDetails(
    parseManuscriptAuthors(metadata.authors, parsedAffiliations),
    contributorMetadata,
  ).map(
    (author): DiscoveryAuthor => ({
      name: author.name,
      orcidUri: orcidUri(author.detail.orcid),
      email: author.detail.email,
      organizations: author.affiliationIds.flatMap((affiliationId) => {
        const organization = organizationById.get(affiliationId);
        return isDefined(organization) ? [organization] : [];
      }),
    }),
  );

  const identifier = classifyReferenceIdentifier(
    bundle.sourceInput.manuscript.doi ?? '',
  );
  const doi = identifier.kind === 'DOI' ? identifier.value : null;

  return {
    title: metadata.title,
    authors: authors.filter((author) => author.name.trim().length > 0),
    abstract: metadata.abstract,
    keywords: metadata.keywords,
    journal: metadata.journal,
    doi,
    doiUri: doi === null ? null : doiUriFor(doi),
    // An award with no funder named has no organization to attribute it to,
    // and `funder` is the property every consumer reads.
    funders: contributorMetadata.funding.flatMap((award) => {
      if (!isNonEmptyString(award.funder)) return [];
      const funderIdentifier = classifyFunderIdentifier(award.funderIdentifier);
      return [
        {
          name: award.funder,
          identifierUri:
            funderIdentifier === null
              ? null
              : funderIdentifier.type === 'doi'
                ? doiUriFor(funderIdentifier.value)
                : funderIdentifier.value,
          awardId: award.awardId,
        },
      ];
    }),
  };
};

const tag = (
  name: string,
  value: string | null | undefined,
): ManuscriptMetaTag[] => {
  const content = singleLine(value);
  return content.length === 0 ? [] : [{ name, content }];
};

// Highwire is positional: an institution and an ORCID belong to the
// `citation_author` they follow, so the per-author tags are emitted as a group
// rather than gathered by kind.
export const manuscriptDiscoveryMetaTags = (
  facts: ManuscriptDiscoveryFacts,
): ManuscriptMetaTag[] => [
  // One generic `author` per person, not the raw byline: a single tag reading
  // "Jalil, A. [1*]; Kazemian, H. [2]" is one made-up name to everything that
  // reads it, this app's own reference importer included.
  ...facts.authors.flatMap((author) => tag('author', author.name)),
  ...tag('citation_title', facts.title),
  ...facts.authors.flatMap((author) => [
    ...tag('citation_author', author.name),
    ...author.organizations.flatMap((organization) =>
      tag('citation_author_institution', organization.name),
    ),
    ...tag('citation_author_orcid', author.orcidUri),
  ]),
  ...tag('citation_journal_title', facts.journal),
  ...tag('citation_doi', facts.doi),
  // The article has no address of its own — it is a file, not a page — so the
  // only honest abstract URL is the one the DOI resolves to.
  ...tag('citation_abstract_html_url', facts.doiUri),
  ...tag('citation_keywords', facts.keywords.join('; ')),
  ...tag('DC.title', facts.title),
  ...facts.authors.flatMap((author) => tag('DC.creator', author.name)),
  ...tag('DC.source', facts.journal),
  ...tag('DC.description', facts.abstract),
  ...facts.keywords.flatMap((keyword) => tag('DC.subject', keyword)),
  ...tag('DC.identifier', facts.doiUri),
];

const compact = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) =>
        isDefined(value) &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );

const organizationJsonLd = (
  organization: DiscoveryOrganization,
): Record<string, unknown> => {
  const address = compact({
    '@type': 'PostalAddress',
    addressLocality: organization.city,
    addressRegion: organization.state,
    addressCountry: organization.country,
  });
  return compact({
    '@type': 'Organization',
    name: organization.name,
    identifier: organization.rorUri,
    // '@type' is always there, so the address only counts as written when it
    // carries something more than its own type.
    address: Object.keys(address).length > 1 ? address : undefined,
  });
};

const personJsonLd = (author: DiscoveryAuthor): Record<string, unknown> =>
  compact({
    '@type': 'Person',
    name: author.name,
    identifier: author.orcidUri,
    email: author.email,
    affiliation: author.organizations.map(organizationJsonLd),
  });

const funderJsonLd = (funder: DiscoveryFunder): Record<string, unknown> =>
  compact({
    '@type': 'Organization',
    name: funder.name,
    identifier: funder.identifierUri,
  });

export const manuscriptJsonLdDocument = (
  facts: ManuscriptDiscoveryFacts,
): Record<string, unknown> =>
  compact({
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: singleLine(facts.title),
    name: singleLine(facts.title),
    abstract: singleLine(facts.abstract),
    keywords: facts.keywords,
    identifier: facts.doiUri,
    url: facts.doiUri,
    isPartOf: isNonEmptyString(facts.journal)
      ? { '@type': 'Periodical', name: facts.journal }
      : undefined,
    author: facts.authors.map(personJsonLd),
    // Two grants from the same body are one funder: the awards below tell them
    // apart, and a repeated organization only reads as a mistake.
    funder: [
      ...new Map(
        facts.funders.map((funder) => [
          `${funder.name} ${funder.identifierUri ?? ''}`,
          funderJsonLd(funder),
        ]),
      ).values(),
    ],
    // A grant is only a distinct thing to name when it has an award number;
    // otherwise `funder` above already says everything that is known.
    funding: facts.funders.flatMap((funder) =>
      isNonEmptyString(funder.awardId)
        ? [
            {
              '@type': 'Grant',
              identifier: funder.awardId,
              funder: funderJsonLd(funder),
            },
          ]
        : [],
    ),
  });

export const renderManuscriptMetaTag = ({
  name,
  content,
}: ManuscriptMetaTag): string =>
  `<meta name="${escapeHtmlAttribute(name)}" content="${escapeHtmlAttribute(content)}">`;

// Inside a <script> block the HTML parser is looking for `</script`, not for
// JSON — an abstract that quotes one would end the block early and spill the
// rest of the graph into the page. Escaping every `<`, `>` and `&` as a JSON
// \u sequence keeps the payload parseable (JSON.parse decodes them) while
// leaving no character sequence the HTML tokenizer can act on. U+2028/U+2029
// go too: they are legal in a JSON string but terminate a line for older
// script parsers.
const JSON_LD_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export const renderManuscriptJsonLdScript = (
  document: Record<string, unknown>,
): string =>
  `<script type="application/ld+json">${JSON.stringify(document).replace(
    /[<>&\u2028\u2029]/g,
    (character) => JSON_LD_ESCAPES[character] ?? character,
  )}</script>`;

export const renderManuscriptDiscoveryHead = (
  bundle: ManuscriptBundle,
  contributorMetadata?: ManuscriptContributorMetadata,
): string[] => {
  const facts = buildManuscriptDiscoveryFacts(bundle, contributorMetadata);
  return [
    ...manuscriptDiscoveryMetaTags(facts).map(renderManuscriptMetaTag),
    renderManuscriptJsonLdScript(manuscriptJsonLdDocument(facts)),
  ];
};
