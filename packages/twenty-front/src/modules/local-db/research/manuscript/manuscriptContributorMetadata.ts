import { isNonEmptyString } from '@sniptt/guards';

import {
  orderCreditRoles,
  parseCreditRole,
  type CreditRole,
} from './manuscriptContributorIdentifiers';
import {
  type ManuscriptAffiliation,
  type ManuscriptAuthor,
} from './manuscriptContributors';

// The structured half of a manuscript's contributor block: everything a
// journal submission form now demands that a free-text byline cannot carry —
// ORCID, email, CRediT roles, ROR-identified affiliations, funding awards.
// The byline stays the source of truth for who the authors are and what order
// they appear in; this layers on top of it, keyed to the authors parsing
// already found. Every field is optional, and a manuscript carrying none of
// this must behave — and export — exactly as it did before the layer existed.

export type ManuscriptContributorDetail = {
  // The id `parseManuscriptAuthors` gives this author (`author-1`, `author-2`).
  authorId: string;
  // The byline name this detail was written against. Position is not a stable
  // key — an author moved up the byline, or a re-import, renumbers everyone —
  // so resolution matches on the name first and falls back to position.
  name?: string;
  orcid?: string;
  email?: string;
  creditRoles?: CreditRole[];
  isEqualContributor?: boolean;
  isDeceased?: boolean;
  note?: string;
};

export type ManuscriptAffiliationDetail = {
  affiliationId: string;
  name?: string;
  ror?: string;
  department?: string;
  city?: string;
  state?: string;
  country?: string;
};

export type ManuscriptFundingAward = {
  id: string;
  funder?: string;
  // A ROR id or a Crossref Funder Registry DOI, whichever the author has.
  funderIdentifier?: string;
  awardId?: string;
  recipientAuthorIds?: string[];
  // For a recipient who is not one of this paper's authors.
  recipient?: string;
};

export type ManuscriptContributorMetadata = {
  authors: ManuscriptContributorDetail[];
  affiliations: ManuscriptAffiliationDetail[];
  funding: ManuscriptFundingAward[];
};

export const EMPTY_MANUSCRIPT_CONTRIBUTOR_METADATA: ManuscriptContributorMetadata =
  { authors: [], affiliations: [], funding: [] };

const optionalText = (value: unknown): string | undefined =>
  isNonEmptyString(value) && value.trim().length > 0 ? value.trim() : undefined;

const optionalFlag = (value: unknown): true | undefined =>
  value === true ? true : undefined;

const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null,
      )
    : [];

const parseContributorDetail = (
  entry: Record<string, unknown>,
  index: number,
): ManuscriptContributorDetail => ({
  authorId: optionalText(entry.authorId) ?? `author-${index + 1}`,
  name: optionalText(entry.name),
  orcid: optionalText(entry.orcid),
  email: optionalText(entry.email),
  creditRoles: orderCreditRoles(
    (Array.isArray(entry.creditRoles) ? entry.creditRoles : [])
      .map((role) => parseCreditRole(typeof role === 'string' ? role : ''))
      .filter((role): role is CreditRole => role !== null),
  ),
  isEqualContributor: optionalFlag(entry.isEqualContributor),
  isDeceased: optionalFlag(entry.isDeceased),
  note: optionalText(entry.note),
});

const parseAffiliationDetail = (
  entry: Record<string, unknown>,
  index: number,
): ManuscriptAffiliationDetail => ({
  affiliationId:
    optionalText(entry.affiliationId) ?? `affiliation-${index + 1}`,
  name: optionalText(entry.name),
  ror: optionalText(entry.ror),
  department: optionalText(entry.department),
  city: optionalText(entry.city),
  state: optionalText(entry.state),
  country: optionalText(entry.country),
});

const parseFundingAward = (
  entry: Record<string, unknown>,
  index: number,
): ManuscriptFundingAward => ({
  id: optionalText(entry.id) ?? `award-${index + 1}`,
  funder: optionalText(entry.funder),
  funderIdentifier: optionalText(entry.funderIdentifier),
  awardId: optionalText(entry.awardId),
  recipientAuthorIds: (Array.isArray(entry.recipientAuthorIds)
    ? entry.recipientAuthorIds
    : []
  ).flatMap((id) => {
    const text = optionalText(id);
    return text === undefined ? [] : [text];
  }),
  recipient: optionalText(entry.recipient),
});

export const parseManuscriptContributorMetadata = (
  value: string | null | undefined,
): ManuscriptContributorMetadata => {
  if (!isNonEmptyString(value?.trim())) {
    return EMPTY_MANUSCRIPT_CONTRIBUTOR_METADATA;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) {
      return EMPTY_MANUSCRIPT_CONTRIBUTOR_METADATA;
    }
    const record = parsed as Record<string, unknown>;
    return {
      authors: asRecords(record.authors).map(parseContributorDetail),
      affiliations: asRecords(record.affiliations).map(parseAffiliationDetail),
      funding: asRecords(record.funding).map(parseFundingAward),
    };
  } catch {
    // A hand-edited or truncated field must not take the composer down with
    // it; the author's byline still renders without any of this.
    return EMPTY_MANUSCRIPT_CONTRIBUTOR_METADATA;
  }
};

// The editor writes raw input values, so a field the author typed into and
// then cleared arrives as an empty string, not as undefined.
const hasContributorContent = (detail: ManuscriptContributorDetail): boolean =>
  [detail.orcid, detail.email, detail.note].some(
    (field) => optionalText(field) !== undefined,
  ) ||
  (detail.creditRoles ?? []).length > 0 ||
  detail.isEqualContributor === true ||
  detail.isDeceased === true;

const hasAffiliationContent = (detail: ManuscriptAffiliationDetail): boolean =>
  [
    detail.ror,
    detail.department,
    detail.city,
    detail.state,
    detail.country,
  ].some((field) => optionalText(field) !== undefined);

const hasFundingContent = (award: ManuscriptFundingAward): boolean =>
  [award.funder, award.funderIdentifier, award.awardId, award.recipient].some(
    (field) => optionalText(field) !== undefined,
  ) || (award.recipientAuthorIds ?? []).length > 0;

export const isEmptyManuscriptContributorMetadata = (
  metadata: ManuscriptContributorMetadata,
): boolean =>
  !metadata.authors.some(hasContributorContent) &&
  !metadata.affiliations.some(hasAffiliationContent) &&
  !metadata.funding.some(hasFundingContent);

// Keys are written in a fixed order and empty entries are dropped, so an
// unchanged contributor block serializes to the same bytes every save — and to
// nothing at all when the author filled none of it in.
const compact = <TRecord extends Record<string, unknown>>(
  record: TRecord,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) =>
        value !== undefined && !(Array.isArray(value) && value.length === 0),
    ),
  );

export const serializeManuscriptContributorMetadata = (
  metadata: ManuscriptContributorMetadata,
): string => {
  if (isEmptyManuscriptContributorMetadata(metadata)) return '';
  const authors = metadata.authors.filter(hasContributorContent).map((detail) =>
    compact({
      authorId: detail.authorId,
      name: optionalText(detail.name),
      orcid: optionalText(detail.orcid),
      email: optionalText(detail.email),
      creditRoles: orderCreditRoles(detail.creditRoles),
      isEqualContributor: detail.isEqualContributor,
      isDeceased: detail.isDeceased,
      note: optionalText(detail.note),
    }),
  );
  const affiliations = metadata.affiliations
    .filter(hasAffiliationContent)
    .map((detail) =>
      compact({
        affiliationId: detail.affiliationId,
        name: optionalText(detail.name),
        ror: optionalText(detail.ror),
        department: optionalText(detail.department),
        city: optionalText(detail.city),
        state: optionalText(detail.state),
        country: optionalText(detail.country),
      }),
    );
  const funding = metadata.funding.filter(hasFundingContent).map((award) =>
    compact({
      id: award.id,
      funder: optionalText(award.funder),
      funderIdentifier: optionalText(award.funderIdentifier),
      awardId: optionalText(award.awardId),
      recipientAuthorIds: award.recipientAuthorIds,
      recipient: optionalText(award.recipient),
    }),
  );
  return JSON.stringify(compact({ authors, affiliations, funding }));
};

const comparableName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Match a stored detail to a byline entry: by name first, because that survives
// reordering and re-import; by id second, because a renamed author is still the
// same row in the editor. Each detail is claimed at most once.
const matchDetails = <TDetail, TEntity extends { id: string; name: string }>(
  entities: TEntity[],
  details: TDetail[],
  keyOf: (detail: TDetail) => { id: string; name: string | undefined },
): Map<string, TDetail> => {
  const claimed = new Set<TDetail>();
  const matched = new Map<string, TDetail>();
  const findBy = (predicate: (detail: TDetail) => boolean) =>
    details.find((detail) => !claimed.has(detail) && predicate(detail));
  for (const pass of ['name', 'id'] as const) {
    for (const entity of entities) {
      if (matched.has(entity.id)) continue;
      const entityName = comparableName(entity.name);
      const found = findBy((detail) => {
        const key = keyOf(detail);
        return pass === 'name'
          ? entityName.length > 0 &&
              key.name !== undefined &&
              comparableName(key.name) === entityName
          : key.id === entity.id;
      });
      if (found === undefined) continue;
      claimed.add(found);
      matched.set(entity.id, found);
    }
  }
  return matched;
};

export type ManuscriptAuthorWithDetail = ManuscriptAuthor & {
  detail: ManuscriptContributorDetail;
};

export type ManuscriptAffiliationWithDetail = ManuscriptAffiliation & {
  detail: ManuscriptAffiliationDetail;
};

export const joinManuscriptContributorDetails = (
  authors: ManuscriptAuthor[],
  metadata: ManuscriptContributorMetadata,
): ManuscriptAuthorWithDetail[] => {
  const matched = matchDetails(authors, metadata.authors, (detail) => ({
    id: detail.authorId,
    name: detail.name,
  }));
  return authors.map((author) => ({
    ...author,
    detail: {
      authorId: author.id,
      ...(matched.get(author.id) ?? {}),
      // The byline owns the name; the stored copy is only a matching key.
      name: author.name,
    },
  }));
};

export const joinManuscriptAffiliationDetails = (
  affiliations: ManuscriptAffiliation[],
  metadata: ManuscriptContributorMetadata,
): ManuscriptAffiliationWithDetail[] => {
  const matched = matchDetails(
    affiliations,
    metadata.affiliations,
    (detail) => ({
      id: detail.affiliationId,
      name: detail.name,
    }),
  );
  return affiliations.map((affiliation) => ({
    ...affiliation,
    detail: {
      affiliationId: affiliation.id,
      ...(matched.get(affiliation.id) ?? {}),
      name: affiliation.name,
    },
  }));
};

// Re-key the stored metadata to the ids the serialized byline will parse back
// to. Without this, moving an author up the byline hands their ORCID to
// whoever they displaced.
export const realignManuscriptContributorMetadata = (
  metadata: ManuscriptContributorMetadata,
  authors: ManuscriptAuthor[],
  affiliations: ManuscriptAffiliation[],
): ManuscriptContributorMetadata => {
  const namedAuthors = authors.filter(
    (author) => author.name.trim().length > 0,
  );
  const namedAffiliations = affiliations.filter(
    (affiliation) => affiliation.name.trim().length > 0,
  );
  const joined = joinManuscriptContributorDetails(namedAuthors, metadata);
  // A funding recipient names an author by the key the metadata was stored
  // under, so it has to be translated through the same match, not renumbered
  // against the new byline positions.
  const renumbered = new Map(
    joined.flatMap(({ detail }, index) =>
      detail.authorId === undefined
        ? []
        : [[detail.authorId, `author-${index + 1}`] as const],
    ),
  );
  return {
    authors: joined.map(({ detail }, index) => ({
      ...detail,
      authorId: `author-${index + 1}`,
    })),
    affiliations: joinManuscriptAffiliationDetails(
      namedAffiliations,
      metadata,
    ).map(({ detail }, index) => ({
      ...detail,
      affiliationId: `affiliation-${index + 1}`,
    })),
    funding: metadata.funding.map((award) => ({
      ...award,
      recipientAuthorIds: (award.recipientAuthorIds ?? []).flatMap((id) => {
        const next = renumbered.get(id);
        return next === undefined ? [] : [next];
      }),
    })),
  };
};

const initialsOfToken = (token: string): string =>
  token
    .split(/[-–—]/)
    .flatMap((part) => {
      const letter = [...part].find((character) => /\p{L}/u.test(character));
      return letter === undefined ? [] : [`${letter.toUpperCase()}.`];
    })
    .join('-');

export const manuscriptAuthorInitials = (name: string): string => {
  const trimmed = name.trim();
  // "Smith, J." is one person written family-first; the initials a
  // contributions statement prints still read given-then-family.
  const [family, given] = trimmed.split(',').map((part) => part.trim());
  const ordered =
    given === undefined || given.length === 0 ? trimmed : `${given} ${family}`;
  return ordered.split(/\s+/).map(initialsOfToken).join('');
};

// "A.J.: Conceptualization, Methodology; H.K.: Supervision" — the form every
// journal that takes CRediT prints it in.
export const renderManuscriptContributionsStatement = (
  authors: ManuscriptAuthor[],
  metadata: ManuscriptContributorMetadata,
): string =>
  joinManuscriptContributorDetails(authors, metadata)
    .flatMap(({ name, detail }) => {
      const roles = orderCreditRoles(detail.creditRoles);
      return roles.length === 0 || name.trim().length === 0
        ? []
        : [`${manuscriptAuthorInitials(name)}: ${roles.join(', ')}`];
    })
    .join('; ');

const joinWithAnd = (parts: string[]): string =>
  parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

export const renderManuscriptEqualContributionStatement = (
  authors: ManuscriptAuthor[],
  metadata: ManuscriptContributorMetadata,
): string => {
  const equal = joinManuscriptContributorDetails(authors, metadata)
    .filter(({ detail }) => detail.isEqualContributor === true)
    .map(({ name }) => manuscriptAuthorInitials(name));
  // One author cannot contribute equally with nobody.
  return equal.length < 2
    ? ''
    : `${joinWithAnd(equal)} contributed equally to this work.`;
};

export const manuscriptFundingRecipients = (
  award: ManuscriptFundingAward,
  authors: ManuscriptAuthor[],
): string[] => [
  ...(award.recipientAuthorIds ?? []).flatMap((id) => {
    const author = authors.find((candidate) => candidate.id === id);
    return author === undefined ? [] : [manuscriptAuthorInitials(author.name)];
  }),
  ...(award.recipient === undefined ? [] : [award.recipient]),
];

export const renderManuscriptFundingStatement = (
  authors: ManuscriptAuthor[],
  metadata: ManuscriptContributorMetadata,
): string => {
  const parts = metadata.funding.flatMap((award) => {
    if (award.funder === undefined) return [];
    const recipients = manuscriptFundingRecipients(award, authors);
    const detail = [
      award.awardId,
      recipients.length > 0 ? `to ${joinWithAnd(recipients)}` : undefined,
    ].filter(isNonEmptyString);
    return [
      detail.length > 0
        ? `${award.funder} (${detail.join(' ')})`
        : award.funder,
    ];
  });
  return parts.length === 0
    ? ''
    : `This work was supported by ${joinWithAnd(parts)}.`;
};

// The metadata rides on the manuscript record as JSON. The export bundle
// carries that record through without knowing about the field, so read it off
// whatever shape arrives rather than widening the assembly's metadata type.
type ManuscriptContributorMetadataSource = {
  id?: string;
  contributorMetadata?: string | null;
};

export const readManuscriptContributorMetadata = (
  source: ManuscriptContributorMetadataSource | null | undefined,
): ManuscriptContributorMetadata =>
  parseManuscriptContributorMetadata(source?.contributorMetadata);
