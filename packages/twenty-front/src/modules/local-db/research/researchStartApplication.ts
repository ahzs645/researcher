import { isNonEmptyString } from '@sniptt/guards';

// "Start application from opportunity" — the convert action that turns a
// discovered opportunity into a real, editable application: a `grantApplication`
// pre-linked to the opportunity (and its grant/project), a requirement checklist
// derived from the funding kind, and a starter set of narrative sections. This
// is what makes the discover → apply → save funnel hang together.
//
// Pure: it returns the record drafts to create. The caller (a page with the
// create hooks) writes the application first, then stamps its id onto the
// children. No backend required.

export type StartApplicationOpportunity = {
  id: string;
  name?: string | null;
  funder?: string | null;
  program?: string | null;
  opportunityKind?: string | null;
  amountText?: string | null;
  applicationDueDate?: string | null;
  eligibility?: string | null;
  eligibilityNotes?: string | null;
};

export type StartApplicationContext = {
  projectId?: string | null;
  grantId?: string | null;
  applicantId?: string | null;
  organization?: string | null;
  email?: string | null;
};

export type RequirementDraft = {
  name: string;
  category: string;
  status: string;
  dueDate: string | null;
  formNumber: string;
  notes: string;
};

export type SectionDraft = {
  name: string;
  sectionType: string;
  status: 'NOT_STARTED';
  prompt: string;
  content: string;
  wordLimit: number;
  wordCount: number;
  notes: string;
};

export type ApplicationDraft = {
  name: string;
  opportunityId: string;
  grantId: string | null;
  projectId: string | null;
  applicantId: string | null;
  organization: string;
  email: string;
  amountRequested: number | null;
  projectSummary: string;
  status: 'DRAFTING';
  source: 'PORTAL';
  submittedAt: null;
  notes: string;
};

export type ApplicationPlan = {
  application: ApplicationDraft;
  requirements: RequirementDraft[];
  sections: SectionDraft[];
};

// Pull a dollar figure out of an "Amount" string like "Up to $300,000" or
// "$15,000 per unit". Returns null when there's no parseable number.
export const parseAmountText = (
  amountText: string | null | undefined,
): number | null => {
  if (!amountText) return null;
  const match = amountText.replace(/,/g, '').match(/\$?\s*(\d{3,})/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

type ChecklistTemplate = {
  name: string;
  category: string;
  formNumber?: string;
}[];

const REQUIREMENTS_BY_KIND: Record<string, ChecklistTemplate> = {
  GRANT: [
    { name: 'Project narrative', category: 'NARRATIVE' },
    { name: 'Budget & justification', category: 'BUDGET' },
    { name: 'Common CV (all team members)', category: 'CV', formNumber: 'CCV' },
    { name: 'Letters of support', category: 'LETTER_OF_SUPPORT' },
  ],
  SCHOLARSHIP: [
    { name: 'Personal statement', category: 'NARRATIVE' },
    { name: 'Official transcripts', category: 'FORM' },
    { name: 'Reference letters', category: 'LETTER_OF_SUPPORT' },
    { name: 'Common CV', category: 'CV', formNumber: 'CCV' },
  ],
  STUDENTSHIP: [
    { name: 'Personal statement', category: 'NARRATIVE' },
    { name: 'Official transcripts', category: 'FORM' },
    { name: 'Supervisor confirmation', category: 'LETTER_OF_SUPPORT' },
  ],
  FELLOWSHIP: [
    { name: 'Research proposal', category: 'NARRATIVE' },
    { name: 'Reference letters', category: 'LETTER_OF_SUPPORT' },
    { name: 'Host institution endorsement', category: 'LETTER_OF_SUPPORT' },
    { name: 'Common CV', category: 'CV', formNumber: 'CCV' },
  ],
  PRIZE: [
    { name: 'Nomination package', category: 'NARRATIVE' },
    { name: 'Supporting letters', category: 'LETTER_OF_SUPPORT' },
  ],
};

const SECTIONS_BY_KIND: Record<
  string,
  { type: string; title: string; wordLimit: number }[]
> = {
  GRANT: [
    { type: 'ABSTRACT', title: 'Abstract', wordLimit: 250 },
    { type: 'BACKGROUND', title: 'Background & rationale', wordLimit: 1000 },
    { type: 'OBJECTIVES', title: 'Objectives', wordLimit: 500 },
    { type: 'METHODOLOGY', title: 'Methodology', wordLimit: 1500 },
    { type: 'IMPACT', title: 'Impact & significance', wordLimit: 750 },
    {
      type: 'BUDGET_JUSTIFICATION',
      title: 'Budget justification',
      wordLimit: 1000,
    },
    { type: 'TIMELINE', title: 'Timeline / workplan', wordLimit: 500 },
  ],
  SCHOLARSHIP: [
    { type: 'LAY_SUMMARY', title: 'Lay summary', wordLimit: 250 },
    { type: 'BACKGROUND', title: 'Research background', wordLimit: 750 },
    { type: 'OBJECTIVES', title: 'Research objectives', wordLimit: 500 },
    { type: 'BIO', title: 'Personal statement', wordLimit: 750 },
    { type: 'IMPACT', title: 'Anticipated contribution', wordLimit: 500 },
  ],
  STUDENTSHIP: [
    { type: 'LAY_SUMMARY', title: 'Lay summary', wordLimit: 250 },
    { type: 'OBJECTIVES', title: 'Research objectives', wordLimit: 500 },
    { type: 'BIO', title: 'Personal statement', wordLimit: 500 },
  ],
  FELLOWSHIP: [
    { type: 'ABSTRACT', title: 'Abstract', wordLimit: 300 },
    { type: 'OBJECTIVES', title: 'Objectives', wordLimit: 500 },
    { type: 'METHODOLOGY', title: 'Research plan', wordLimit: 1500 },
    { type: 'IMPACT', title: 'Significance & training', wordLimit: 750 },
    { type: 'BIO', title: 'Candidate statement', wordLimit: 750 },
  ],
  PRIZE: [
    { type: 'LAY_SUMMARY', title: 'Summary of achievement', wordLimit: 500 },
    { type: 'IMPACT', title: 'Impact', wordLimit: 750 },
    { type: 'BIO', title: 'Biography', wordLimit: 500 },
  ],
};

const dueNotes = (eligibility: string | null | undefined): string =>
  isNonEmptyString(eligibility) ? `Eligibility: ${eligibility.trim()}` : '';

// Build the full plan. `requirements`/`sections` carry no applicationId — the
// caller stamps it after creating the application.
export const buildApplicationPlan = (
  opportunity: StartApplicationOpportunity,
  context: StartApplicationContext = {},
): ApplicationPlan => {
  const kind = opportunity.opportunityKind ?? 'GRANT';
  const dueDate = opportunity.applicationDueDate ?? null;
  const title = (opportunity.name ?? 'Untitled opportunity').trim();

  const application: ApplicationDraft = {
    name: title,
    opportunityId: opportunity.id,
    grantId: context.grantId ?? null,
    projectId: context.projectId ?? null,
    applicantId: context.applicantId ?? null,
    organization: context.organization ?? '',
    email: context.email ?? '',
    amountRequested: parseAmountText(opportunity.amountText),
    projectSummary: '',
    status: 'DRAFTING',
    source: 'PORTAL',
    submittedAt: null,
    notes: [opportunity.funder, opportunity.program]
      .filter((part): part is string => isNonEmptyString(part))
      .join(' · '),
  };

  const requirements: RequirementDraft[] = (
    REQUIREMENTS_BY_KIND[kind] ?? REQUIREMENTS_BY_KIND.GRANT
  ).map((item) => ({
    name: item.name,
    category: item.category,
    status: 'NEEDED',
    dueDate,
    formNumber: item.formNumber ?? '',
    notes: dueNotes(opportunity.eligibility),
  }));

  const sections: SectionDraft[] = (
    SECTIONS_BY_KIND[kind] ?? SECTIONS_BY_KIND.GRANT
  ).map((item) => ({
    name: item.title,
    sectionType: item.type,
    status: 'NOT_STARTED',
    prompt: '',
    content: '',
    wordLimit: item.wordLimit,
    wordCount: 0,
    notes: '',
  }));

  return { application, requirements, sections };
};
