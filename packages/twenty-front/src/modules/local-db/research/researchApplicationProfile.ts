// Profile builder: turn the workspace's own records (canonical applicant
// profile + researcher + team + the application + its project) into the flat
// `ApplicantProfile` the connector-runner autofill consumes. This is the
// adapter the connector-runner README lists as remaining work — it closes the
// loop from stored data to a pre-filled external portal.
//
// The shape mirrors `services/connector-runner` (ApplicantField / DEFAULT_FIELD_
// ALIASES) intentionally; it is re-declared here rather than imported so the
// front-end has no dependency on the standalone service.

export type ApplicantField = {
  key: string;
  label?: string;
  value: string;
  aliases?: string[];
  sensitive?: boolean;
};

export type ApplicantProfile = { fields: ApplicantField[] };

// Records, read loosely — every field is optional because seeds and live data
// both flow through here and not every workspace fills everything in.
export type ApplicantProfileRecord = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  orcid?: string | null;
  citizenship?: string | null;
  institution?: string | null;
  department?: string | null;
  discipline?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  website?: string | null;
};

export type ResearcherRecord = {
  name?: string | null;
  email?: string | null;
  orcid?: string | null;
  institution?: string | null;
};

export type TeamRecord = {
  name?: string | null;
  institution?: string | null;
};

export type ApplicationRecord = {
  name?: string | null;
  organization?: string | null;
  email?: string | null;
  amountRequested?: number | null;
  projectSummary?: string | null;
};

export type ProjectRecord = {
  name?: string | null;
  summary?: string | null;
};

export type BuildApplicantProfileInput = {
  profile?: ApplicantProfileRecord | null;
  researcher?: ResearcherRecord | null;
  team?: TeamRecord | null;
  application?: ApplicationRecord | null;
  project?: ProjectRecord | null;
};

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

// First non-empty value wins (later args are fallbacks).
const firstOf = (...values: unknown[]): string => {
  for (const value of values) {
    const text = clean(value);
    if (text.length > 0) return text;
  }
  return '';
};

const splitName = (fullName: string): { first: string; last: string } => {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
};

// Build the flat applicant profile. Canonical keys line up with the autofill
// matcher's DEFAULT_FIELD_ALIASES so portals that phrase fields differently
// still match. Empty values are dropped so they never overwrite a real field.
export const buildApplicantProfile = (
  input: BuildApplicantProfileInput,
): ApplicantProfile => {
  const profile = input.profile ?? {};
  const researcher = input.researcher ?? {};
  const team = input.team ?? {};
  const application = input.application ?? {};
  const project = input.project ?? {};

  const fullName = firstOf(profile.fullName, researcher.name);
  const { first, last } = splitName(fullName);
  const amount = application.amountRequested;

  const candidates: ApplicantField[] = [
    { key: 'fullName', value: fullName },
    { key: 'firstName', value: first },
    { key: 'lastName', value: last },
    {
      key: 'email',
      value: firstOf(profile.email, researcher.email, application.email),
    },
    { key: 'phone', value: clean(profile.phone) },
    { key: 'orcid', value: firstOf(profile.orcid, researcher.orcid) },
    {
      key: 'organizationName',
      value: firstOf(
        application.organization,
        profile.institution,
        researcher.institution,
        team.institution,
        team.name,
      ),
    },
    { key: 'department', value: clean(profile.department) },
    { key: 'addressLine1', value: clean(profile.addressLine1) },
    { key: 'city', value: clean(profile.city) },
    { key: 'province', value: clean(profile.province) },
    { key: 'postalCode', value: clean(profile.postalCode) },
    { key: 'country', value: clean(profile.country) },
    { key: 'citizenship', value: clean(profile.citizenship) },
    { key: 'fieldOfStudy', value: clean(profile.discipline) },
    { key: 'website', value: clean(profile.website) },
    {
      key: 'projectTitle',
      value: firstOf(project.name, application.name),
    },
    {
      key: 'projectSummary',
      value: firstOf(application.projectSummary, project.summary),
    },
    {
      key: 'amountRequested',
      value: typeof amount === 'number' && amount > 0 ? String(amount) : '',
    },
  ];

  return { fields: candidates.filter((field) => field.value.length > 0) };
};
