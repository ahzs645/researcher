// What counts as a valid contributor identifier, and the closed vocabularies
// the structured layer is allowed to store. Kept apart from the record model
// because these are external standards — CRediT, ORCID, ROR, the Crossref
// Funder Registry — that change on their own schedule, not ours.

// The taxonomy is closed: exactly these 14 terms, spelled exactly this way.
// A publisher matching on the string will not recognise anything else.
export const CREDIT_ROLES = [
  'Conceptualization',
  'Data curation',
  'Formal analysis',
  'Funding acquisition',
  'Investigation',
  'Methodology',
  'Project administration',
  'Resources',
  'Software',
  'Supervision',
  'Validation',
  'Visualization',
  'Writing – original draft',
  'Writing – review & editing',
] as const;

export type CreditRole = (typeof CREDIT_ROLES)[number];

const CREDIT_ROLE_SLUGS: Record<CreditRole, string> = {
  Conceptualization: 'conceptualization',
  'Data curation': 'data-curation',
  'Formal analysis': 'formal-analysis',
  'Funding acquisition': 'funding-acquisition',
  Investigation: 'investigation',
  Methodology: 'methodology',
  'Project administration': 'project-administration',
  Resources: 'resources',
  Software: 'software',
  Supervision: 'supervision',
  Validation: 'validation',
  Visualization: 'visualization',
  'Writing – original draft': 'writing-original-draft',
  'Writing – review & editing': 'writing-review-editing',
};

export const CREDIT_VOCABULARY_IDENTIFIER = 'https://credit.niso.org/';

export const creditRoleUri = (role: CreditRole): string =>
  `${CREDIT_VOCABULARY_IDENTIFIER}contributor-roles/${CREDIT_ROLE_SLUGS[role]}/`;

const comparableTerm = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const CREDIT_ROLES_BY_TERM = new Map<string, CreditRole>(
  CREDIT_ROLES.flatMap((role) => [
    [comparableTerm(role), role] as const,
    [comparableTerm(CREDIT_ROLE_SLUGS[role]), role] as const,
  ]),
);

// A role can arrive as its label, its slug, or with a hyphen where the
// taxonomy uses an en dash — all three mean the same term, and a round trip
// through another tool should not silently drop someone's contribution.
export const parseCreditRole = (
  value: string | null | undefined,
): CreditRole | null =>
  CREDIT_ROLES_BY_TERM.get(comparableTerm(value ?? '')) ?? null;

// Canonical taxonomy order, deduplicated — a contributions statement reads the
// same on every paper regardless of the order the boxes were ticked.
export const orderCreditRoles = (
  roles: readonly CreditRole[] | undefined,
): CreditRole[] =>
  roles === undefined
    ? []
    : CREDIT_ROLES.filter((role) => roles.includes(role));

const ORCID_PATTERN = /^(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dXx])$/;

// ISO 7064 MOD 11-2 over the leading 15 digits. A mistyped ORCID is worse than
// no ORCID: it attaches the paper to a stranger, and nothing downstream will
// ever tell the author it happened.
const orcidCheckDigit = (digits: string): string => {
  const total = [...digits].reduce(
    (running, digit) => (running + Number(digit)) * 2,
    0,
  );
  const remainder = (12 - (total % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
};

export const normalizeOrcid = (
  value: string | null | undefined,
): string | null => {
  const bare = (value ?? '')
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?orcid\.org\//i, '')
    .replace(/\s+/g, '');
  const match = ORCID_PATTERN.exec(bare);
  if (match === null) return null;
  const digits = match.slice(1, 5).join('').toUpperCase();
  if (orcidCheckDigit(digits.slice(0, 15)) !== digits[15]) return null;
  return (digits.match(/.{4}/g) ?? []).join('-');
};

export const isValidOrcid = (value: string | null | undefined): boolean =>
  normalizeOrcid(value) !== null;

// JATS4R asks for the resolvable form, not the bare identifier.
export const orcidUri = (value: string | null | undefined): string | null => {
  const orcid = normalizeOrcid(value);
  return orcid === null ? null : `https://orcid.org/${orcid}`;
};

// A ROR id is "0" plus six Crockford-base32 characters plus two check digits.
// The MOD 97-10 checksum is not validated here — the shape already rejects the
// mistake authors actually make, which is pasting a URL or an ISNI.
const ROR_PATTERN = /^0[0-9a-hj-km-np-tv-z]{6}\d{2}$/;

export const normalizeRorId = (
  value: string | null | undefined,
): string | null => {
  const bare = (value ?? '')
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?ror\.org\//i, '')
    .toLowerCase();
  return ROR_PATTERN.test(bare) ? bare : null;
};

export const rorUri = (value: string | null | undefined): string | null => {
  const ror = normalizeRorId(value);
  return ror === null ? null : `https://ror.org/${ror}`;
};

const DOI_PATTERN = /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/\S+)$/i;

// Funders are identified by a ROR id or by a Crossref Funder Registry DOI, and
// JATS labels the two differently — so the value decides its own type.
export type FunderIdentifier = { type: 'ror' | 'doi'; value: string };

export const classifyFunderIdentifier = (
  value: string | null | undefined,
): FunderIdentifier | null => {
  const ror = rorUri(value);
  if (ror !== null) return { type: 'ror', value: ror };
  const doi = DOI_PATTERN.exec((value ?? '').trim())?.[1];
  return doi === undefined ? null : { type: 'doi', value: doi };
};
