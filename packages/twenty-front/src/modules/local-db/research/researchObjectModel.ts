// Research platform object model.
//
// Compact, hand-authored description of the native Twenty objects that turn
// this CRM into a research-team workspace (grants, applications, projects,
// datasets, manuscripts, …). A builder expands each spec into the full
// `ObjectMetadataItemsQuery` node shape, a default TABLE view, and a
// navigation menu item, then merges them into the bridge's static metadata
// bundle.
//
// Scalar fields live here; cross-object links (grant ↔ project ↔ researcher ↔
// application, …) are declared as real relations in `researchRelations.ts` and
// generated as paired RELATION fields by the metadata builder.

export type ResearchFieldType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE_TIME'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'ARRAY';

// `value` must be a valid GraphQL enum identifier (the SDL generator drops any
// option whose value does not match /^[A-Za-z_][A-Za-z0-9_]*$/), so values are
// UPPER_SNAKE while labels stay human-readable.
export type ResearchSelectOption = {
  value: string;
  label: string;
  color: ResearchOptionColor;
};

// Mirrors Twenty's ThemeColor union used by select option chips.
export type ResearchOptionColor =
  | 'green'
  | 'turquoise'
  | 'sky'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'gray';

export type ResearchFieldSpec = {
  name: string;
  label: string;
  type: ResearchFieldType;
  icon?: string;
  description?: string;
  options?: ResearchSelectOption[];
  // ARRAY/MULTI_SELECT have no inline editor in the bridge record table yet —
  // mark them read-only rather than render a broken input.
  readOnly?: boolean;
};

// Which collapsible nav folder the object is grouped under in the research
// workspace: who's in the lab, the research + its outputs, the money, and where
// new funding is discovered.
export type ResearchNavSection = 'LAB' | 'WORK' | 'FUNDING' | 'DISCOVERY';

// Whether the workspace is a single researcher or a lab managing several
// researchers. Chosen at first-run setup; drives nav adaptation + individualMode.
export type WorkspaceMode = 'SOLO' | 'LAB';

export type ResearchObjectSpec = {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  icon: string;
  description: string;
  navColor: ResearchOptionColor;
  navSection: ResearchNavSection;
  // The label-identifier field is always a TEXT field literally named `name`
  // (so the standard searchVector expression on "name" stays valid). These
  // control how that identifier column is presented.
  nameFieldLabel: string;
  nameFieldIcon: string;
  fields: ResearchFieldSpec[];
  // Ordered field names shown as columns in the default table view. May include
  // relation field names (generated separately) — `name` is always prepended.
  defaultColumns: string[];
};

const STATUS_ICON = 'IconProgressCheck';
const CALENDAR_ICON = 'IconCalendar';
const MONEY_ICON = 'IconCoin';
const TAG_ICON = 'IconTag';
const TEXT_ICON = 'IconFileText';

// Career stages an applicant can be at — shared by the canonical applicant
// profile and the eligibility target on an opportunity. Funding eligibility is
// most often gated on this, so it is a first-class field rather than free text.
const CAREER_STAGE_OPTIONS: ResearchSelectOption[] = [
  { value: 'UNDERGRADUATE', label: 'Undergraduate', color: 'sky' },
  { value: 'MASTERS', label: "Master's student", color: 'turquoise' },
  { value: 'DOCTORAL', label: 'Doctoral student', color: 'purple' },
  { value: 'POSTDOCTORAL', label: 'Postdoctoral', color: 'pink' },
  { value: 'EARLY_CAREER', label: 'Early-career faculty', color: 'blue' },
  { value: 'ESTABLISHED', label: 'Established faculty', color: 'green' },
];

// Same list plus an explicit "any" used when an opportunity is open to all.
const ELIGIBLE_CAREER_STAGE_OPTIONS: ResearchSelectOption[] = [
  { value: 'ANY', label: 'Any career stage', color: 'gray' },
  ...CAREER_STAGE_OPTIONS,
];

// What kind of funding an opportunity / source represents. Lets the same
// discovery + assessment pipeline cover individual scholarships and fellowships,
// not just team grants.
const OPPORTUNITY_KIND_OPTIONS: ResearchSelectOption[] = [
  { value: 'GRANT', label: 'Grant', color: 'purple' },
  { value: 'SCHOLARSHIP', label: 'Scholarship', color: 'sky' },
  { value: 'FELLOWSHIP', label: 'Fellowship', color: 'turquoise' },
  { value: 'STUDENTSHIP', label: 'Studentship', color: 'green' },
  { value: 'PRIZE', label: 'Prize / award', color: 'yellow' },
];

// AI/assessment eligibility verdict surfaced on an opportunity so "what's
// relevant to me" is a real column, not just a hidden score.
const RELEVANCE_VERDICT_OPTIONS: ResearchSelectOption[] = [
  { value: 'ELIGIBLE', label: 'Eligible', color: 'green' },
  { value: 'LIKELY', label: 'Likely eligible', color: 'turquoise' },
  { value: 'INELIGIBLE', label: 'Ineligible', color: 'red' },
  { value: 'UNKNOWN', label: 'Needs review', color: 'gray' },
];

// Canonical content "buckets" shared by an application's narrative sections and
// the reusable answer library, so a saved answer of one type can be matched to a
// section of the same type across applications.
const CANONICAL_CONTENT_OPTIONS: ResearchSelectOption[] = [
  { value: 'ABSTRACT', label: 'Abstract', color: 'blue' },
  { value: 'LAY_SUMMARY', label: 'Lay summary', color: 'sky' },
  { value: 'BACKGROUND', label: 'Background', color: 'turquoise' },
  { value: 'OBJECTIVES', label: 'Objectives', color: 'green' },
  { value: 'METHODOLOGY', label: 'Methodology', color: 'purple' },
  { value: 'IMPACT', label: 'Impact / significance', color: 'pink' },
  {
    value: 'BUDGET_JUSTIFICATION',
    label: 'Budget justification',
    color: 'orange',
  },
  { value: 'TIMELINE', label: 'Timeline / workplan', color: 'yellow' },
  { value: 'TEAM', label: 'Team / expertise', color: 'sky' },
  { value: 'BIO', label: 'Biography', color: 'turquoise' },
  { value: 'EDI', label: 'EDI statement', color: 'red' },
  { value: 'BIBLIOGRAPHY', label: 'Bibliography', color: 'gray' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

export const RESEARCH_OBJECT_SPECS: ResearchObjectSpec[] = [
  {
    nameSingular: 'researchTeam',
    namePlural: 'researchTeams',
    labelSingular: 'Research team',
    labelPlural: 'Research teams',
    navSection: 'LAB',
    icon: 'IconUsersGroup',
    description: 'A lab, group, or individual research workspace',
    navColor: 'blue',
    nameFieldLabel: 'Team name',
    nameFieldIcon: 'IconUsersGroup',
    fields: [
      {
        name: 'principalInvestigator',
        label: 'Principal investigator',
        type: 'TEXT',
        icon: 'IconUser',
      },
      {
        name: 'institution',
        label: 'Institution',
        type: 'TEXT',
        icon: 'IconBuildingBank',
      },
      {
        name: 'department',
        label: 'Department',
        type: 'TEXT',
        icon: 'IconBuilding',
      },
      {
        name: 'focusAreas',
        label: 'Focus areas',
        type: 'ARRAY',
        icon: TAG_ICON,
        readOnly: true,
      },
      {
        name: 'individualMode',
        label: 'Individual mode',
        type: 'BOOLEAN',
        icon: 'IconUserCircle',
        description: 'A single-researcher workspace rather than a team',
      },
      { name: 'website', label: 'Website', type: 'TEXT', icon: 'IconLink' },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'principalInvestigator',
      'institution',
      'individualMode',
      'focusAreas',
    ],
  },
  {
    nameSingular: 'researcher',
    namePlural: 'researchers',
    labelSingular: 'Researcher',
    labelPlural: 'Researchers',
    navSection: 'LAB',
    icon: 'IconUser',
    description: 'A member of a research team',
    navColor: 'turquoise',
    nameFieldLabel: 'Full name',
    nameFieldIcon: 'IconUser',
    fields: [
      { name: 'email', label: 'Email', type: 'TEXT', icon: 'IconMail' },
      {
        name: 'role',
        label: 'Role',
        type: 'SELECT',
        icon: 'IconBriefcase',
        options: [
          { value: 'PI', label: 'Principal investigator', color: 'blue' },
          { value: 'CO_INVESTIGATOR', label: 'Co-investigator', color: 'sky' },
          { value: 'POSTDOC', label: 'Postdoc', color: 'turquoise' },
          { value: 'PHD', label: 'PhD student', color: 'purple' },
          { value: 'MSC', label: 'MSc student', color: 'pink' },
          {
            value: 'RESEARCH_ASSISTANT',
            label: 'Research assistant',
            color: 'green',
          },
          { value: 'COLLABORATOR', label: 'Collaborator', color: 'gray' },
        ],
      },
      { name: 'orcid', label: 'ORCID', type: 'TEXT', icon: 'IconId' },
      {
        name: 'institution',
        label: 'Institution',
        type: 'TEXT',
        icon: 'IconBuildingBank',
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'ACTIVE', label: 'Active', color: 'green' },
          { value: 'INACTIVE', label: 'Inactive', color: 'gray' },
          { value: 'ALUMNI', label: 'Alumni', color: 'orange' },
        ],
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: ['role', 'team', 'email', 'institution', 'status'],
  },
  {
    nameSingular: 'project',
    namePlural: 'projects',
    labelSingular: 'Project',
    labelPlural: 'Projects',
    navSection: 'WORK',
    icon: 'IconFolder',
    description: 'A research project or study',
    navColor: 'green',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconFolder',
    fields: [
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'PLANNING', label: 'Planning', color: 'gray' },
          { value: 'ACTIVE', label: 'Active', color: 'green' },
          { value: 'ON_HOLD', label: 'On hold', color: 'yellow' },
          { value: 'COMPLETED', label: 'Completed', color: 'blue' },
          { value: 'ARCHIVED', label: 'Archived', color: 'gray' },
        ],
      },
      {
        name: 'fundingStatus',
        label: 'Funding status',
        type: 'SELECT',
        icon: MONEY_ICON,
        options: [
          { value: 'UNFUNDED', label: 'Unfunded', color: 'red' },
          { value: 'SEEKING', label: 'Seeking funding', color: 'orange' },
          {
            value: 'PARTIALLY_FUNDED',
            label: 'Partially funded',
            color: 'yellow',
          },
          { value: 'FUNDED', label: 'Funded', color: 'green' },
        ],
      },
      { name: 'summary', label: 'Summary', type: 'TEXT', icon: TEXT_ICON },
      {
        name: 'startDate',
        label: 'Start date',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'endDate',
        label: 'End date',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'lead',
      'team',
      'status',
      'fundingStatus',
      'startDate',
      'endDate',
    ],
  },
  {
    nameSingular: 'grant',
    namePlural: 'grants',
    labelSingular: 'Grant',
    labelPlural: 'Grants',
    navSection: 'FUNDING',
    icon: 'IconReportMoney',
    description: 'A grant the team is pursuing, holding, or reporting on',
    navColor: 'purple',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconReportMoney',
    fields: [
      {
        name: 'funder',
        label: 'Funder',
        type: 'TEXT',
        icon: 'IconBuildingBank',
      },
      {
        name: 'program',
        label: 'Program',
        type: 'TEXT',
        icon: 'IconFileDescription',
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'PROSPECTING', label: 'Prospecting', color: 'gray' },
          { value: 'DRAFTING', label: 'Drafting', color: 'sky' },
          { value: 'SUBMITTED', label: 'Submitted', color: 'blue' },
          { value: 'AWARDED', label: 'Awarded', color: 'green' },
          { value: 'DECLINED', label: 'Declined', color: 'red' },
          { value: 'ACTIVE', label: 'Active', color: 'turquoise' },
          { value: 'CLOSED', label: 'Closed', color: 'gray' },
        ],
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'SELECT',
        icon: 'IconFlag',
        options: [
          { value: 'LOW', label: 'Low', color: 'gray' },
          { value: 'MEDIUM', label: 'Medium', color: 'yellow' },
          { value: 'HIGH', label: 'High', color: 'orange' },
          { value: 'CRITICAL', label: 'Critical', color: 'red' },
        ],
      },
      {
        name: 'amountRequested',
        label: 'Amount requested',
        type: 'NUMBER',
        icon: MONEY_ICON,
      },
      {
        name: 'amountAwarded',
        label: 'Amount awarded',
        type: 'NUMBER',
        icon: MONEY_ICON,
      },
      {
        name: 'fitScore',
        label: 'Fit score (1-5)',
        type: 'NUMBER',
        icon: 'IconStar',
      },
      {
        name: 'applicationDueDate',
        label: 'Application due',
        type: 'DATE_TIME',
        icon: 'IconCalendarDue',
      },
      {
        name: 'submittedAt',
        label: 'Submitted',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'decisionAt',
        label: 'Decision',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'startDate',
        label: 'Start date',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'endDate',
        label: 'End date',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'nextReportDue',
        label: 'Next report due',
        type: 'DATE_TIME',
        icon: 'IconCalendarStats',
      },
      {
        name: 'opportunityUrl',
        label: 'Opportunity URL',
        type: 'TEXT',
        icon: 'IconLink',
      },
      {
        name: 'nextAction',
        label: 'Next action',
        type: 'TEXT',
        icon: 'IconChecklist',
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'funder',
      'program',
      'status',
      'priority',
      'amountRequested',
      'project',
      'lead',
      'applicationDueDate',
    ],
  },
  {
    nameSingular: 'grantSource',
    namePlural: 'grantSources',
    labelSingular: 'Grant source',
    labelPlural: 'Grant sources',
    navSection: 'DISCOVERY',
    icon: 'IconDatabase',
    description:
      'An external database or funder site scanned for opportunities',
    navColor: 'orange',
    nameFieldLabel: 'Source name',
    nameFieldIcon: 'IconDatabase',
    fields: [
      { name: 'url', label: 'URL', type: 'TEXT', icon: 'IconLink' },
      {
        name: 'sourceType',
        label: 'Source type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: [
          { value: 'FUNDER_SITE', label: 'Funder site', color: 'blue' },
          {
            value: 'GOVERNMENT_PORTAL',
            label: 'Government portal',
            color: 'sky',
          },
          { value: 'AGGREGATOR', label: 'Aggregator', color: 'purple' },
          { value: 'RSS', label: 'RSS feed', color: 'orange' },
          { value: 'SPREADSHEET', label: 'Spreadsheet', color: 'green' },
          { value: 'CUSTOM', label: 'Custom', color: 'gray' },
        ],
      },
      {
        name: 'jurisdiction',
        label: 'Jurisdiction',
        type: 'TEXT',
        icon: 'IconMapPin',
      },
      {
        name: 'funderType',
        label: 'Funder type',
        type: 'SELECT',
        icon: 'IconBuildingBank',
        options: [
          { value: 'GOVERNMENT', label: 'Government', color: 'blue' },
          { value: 'FOUNDATION', label: 'Foundation', color: 'purple' },
          { value: 'CORPORATE', label: 'Corporate', color: 'orange' },
          { value: 'UNIVERSITY', label: 'University', color: 'turquoise' },
          { value: 'OTHER', label: 'Other', color: 'gray' },
        ],
      },
      {
        name: 'opportunityKind',
        label: 'Opportunity kind',
        type: 'SELECT',
        icon: 'IconAward',
        description:
          'What a scan of this source produces — grants, scholarships, fellowships…',
        options: OPPORTUNITY_KIND_OPTIONS,
      },
      {
        name: 'topicTags',
        label: 'Topic tags',
        type: 'ARRAY',
        icon: TAG_ICON,
        readOnly: true,
      },
      {
        name: 'eligibilityTags',
        label: 'Eligibility tags',
        type: 'ARRAY',
        icon: TAG_ICON,
        readOnly: true,
      },
      {
        name: 'scrapeCadence',
        label: 'Scan cadence',
        type: 'SELECT',
        icon: 'IconRefresh',
        options: [
          { value: 'MANUAL', label: 'Manual', color: 'gray' },
          { value: 'DAILY', label: 'Daily', color: 'green' },
          { value: 'WEEKLY', label: 'Weekly', color: 'blue' },
          { value: 'MONTHLY', label: 'Monthly', color: 'purple' },
        ],
      },
      {
        name: 'trustLevel',
        label: 'Trust level',
        type: 'SELECT',
        icon: 'IconShieldCheck',
        options: [
          { value: 'OFFICIAL', label: 'Official', color: 'green' },
          { value: 'PARTNER', label: 'Partner', color: 'blue' },
          { value: 'AGGREGATOR', label: 'Aggregator', color: 'yellow' },
          { value: 'UNKNOWN', label: 'Unknown', color: 'gray' },
        ],
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'ACTIVE', label: 'Active', color: 'green' },
          { value: 'PAUSED', label: 'Paused', color: 'yellow' },
          { value: 'BROKEN', label: 'Broken', color: 'red' },
          { value: 'ARCHIVED', label: 'Archived', color: 'gray' },
        ],
      },
      {
        name: 'lastScrapedAt',
        label: 'Last scanned',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'sourceType',
      'funderType',
      'opportunityKind',
      'jurisdiction',
      'topicTags',
      'scrapeCadence',
      'trustLevel',
      'status',
    ],
  },
  {
    nameSingular: 'grantOpportunity',
    namePlural: 'grantOpportunities',
    labelSingular: 'Grant opportunity',
    labelPlural: 'Grant opportunities',
    navSection: 'DISCOVERY',
    icon: 'IconTargetArrow',
    description: 'A funding opportunity discovered from a grant source',
    navColor: 'pink',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconTargetArrow',
    fields: [
      {
        name: 'funder',
        label: 'Funder',
        type: 'TEXT',
        icon: 'IconBuildingBank',
      },
      {
        name: 'program',
        label: 'Program',
        type: 'TEXT',
        icon: 'IconFileDescription',
      },
      {
        name: 'opportunityUrl',
        label: 'Opportunity URL',
        type: 'TEXT',
        icon: 'IconLink',
      },
      {
        name: 'applicationDueDate',
        label: 'Application due',
        type: 'DATE_TIME',
        icon: 'IconCalendarDue',
      },
      {
        name: 'registrationDueDate',
        label: 'Registration due',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'opportunityKind',
        label: 'Kind',
        type: 'SELECT',
        icon: 'IconAward',
        options: OPPORTUNITY_KIND_OPTIONS,
      },
      { name: 'amountText', label: 'Amount', type: 'TEXT', icon: MONEY_ICON },
      {
        name: 'fitScore',
        label: 'Fit score (1-5)',
        type: 'NUMBER',
        icon: 'IconStar',
      },
      {
        name: 'confidence',
        label: 'Confidence',
        type: 'SELECT',
        icon: 'IconGauge',
        options: [
          { value: 'LOW', label: 'Low', color: 'gray' },
          { value: 'MEDIUM', label: 'Medium', color: 'yellow' },
          { value: 'HIGH', label: 'High', color: 'green' },
        ],
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'NEW', label: 'New', color: 'sky' },
          { value: 'REVIEWING', label: 'Reviewing', color: 'yellow' },
          { value: 'ACCEPTED', label: 'Accepted', color: 'green' },
          { value: 'REJECTED', label: 'Rejected', color: 'red' },
          { value: 'DUPLICATE', label: 'Duplicate', color: 'gray' },
        ],
      },
      {
        name: 'eligibility',
        label: 'Eligibility',
        type: 'TEXT',
        icon: 'IconCheckbox',
      },
      {
        name: 'careerStage',
        label: 'Eligible career stage',
        type: 'SELECT',
        icon: 'IconStairsUp',
        description:
          'Who the opportunity is open to (drives eligibility checks)',
        options: ELIGIBLE_CAREER_STAGE_OPTIONS,
      },
      {
        name: 'eligibilityNotes',
        label: 'Eligibility detail',
        type: 'TEXT',
        icon: 'IconListCheck',
        description:
          'Full eligibility prose the assessment reads (citizenship, enrolment, residency…)',
      },
      {
        name: 'relevanceVerdict',
        label: 'Relevance',
        type: 'SELECT',
        icon: 'IconScale',
        description: 'Assessment verdict: is this worth applying to?',
        options: RELEVANCE_VERDICT_OPTIONS,
      },
      {
        name: 'relevanceReason',
        label: 'Why relevant',
        type: 'TEXT',
        icon: 'IconBulb',
        description: 'Plain-language reasoning + what you would need to apply',
      },
      {
        name: 'topicTags',
        label: 'Topic tags',
        type: 'ARRAY',
        icon: TAG_ICON,
        readOnly: true,
      },
      {
        name: 'description',
        label: 'Description',
        type: 'TEXT',
        icon: TEXT_ICON,
      },
    ],
    defaultColumns: [
      'opportunityKind',
      'funder',
      'source',
      'applicationDueDate',
      'amountText',
      'fitScore',
      'relevanceVerdict',
      'status',
    ],
  },
  {
    nameSingular: 'grantApplication',
    namePlural: 'grantApplications',
    labelSingular: 'Grant application',
    labelPlural: 'Grant applications',
    navSection: 'FUNDING',
    icon: 'IconFileText',
    description: 'An application submitted in an application cycle',
    navColor: 'sky',
    nameFieldLabel: 'Project title',
    nameFieldIcon: 'IconFileText',
    fields: [
      {
        name: 'organization',
        label: 'Organization',
        type: 'TEXT',
        icon: 'IconBuilding',
      },
      { name: 'email', label: 'Email', type: 'TEXT', icon: 'IconMail' },
      {
        name: 'amountRequested',
        label: 'Amount requested',
        type: 'NUMBER',
        icon: MONEY_ICON,
      },
      {
        name: 'projectSummary',
        label: 'Project summary',
        type: 'TEXT',
        icon: TEXT_ICON,
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'DRAFTING', label: 'Drafting', color: 'gray' },
          { value: 'SUBMITTED', label: 'Submitted', color: 'blue' },
          { value: 'REVIEWING', label: 'Reviewing', color: 'yellow' },
          { value: 'SHORTLISTED', label: 'Shortlisted', color: 'purple' },
          { value: 'APPROVED', label: 'Approved', color: 'green' },
          { value: 'DECLINED', label: 'Declined', color: 'red' },
          {
            value: 'CONVERTED',
            label: 'Converted to grant',
            color: 'turquoise',
          },
        ],
      },
      {
        name: 'source',
        label: 'Source',
        type: 'SELECT',
        icon: 'IconCategory',
        options: [
          { value: 'PUBLIC', label: 'Public portal', color: 'sky' },
          { value: 'PORTAL', label: 'Member portal', color: 'blue' },
          { value: 'ADMIN', label: 'Admin', color: 'gray' },
        ],
      },
      {
        name: 'submittedAt',
        label: 'Submitted',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'applicant',
      'grant',
      'project',
      'cycle',
      'amountRequested',
      'status',
      'submittedAt',
    ],
  },
  {
    nameSingular: 'applicationCycle',
    namePlural: 'applicationCycles',
    labelSingular: 'Application cycle',
    labelPlural: 'Application cycles',
    navSection: 'FUNDING',
    icon: 'IconCalendarStats',
    description: 'An intake window grouping applications by the team’s needs',
    navColor: 'yellow',
    nameFieldLabel: 'Cycle name',
    nameFieldIcon: 'IconCalendarStats',
    fields: [
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'PLANNED', label: 'Planned', color: 'gray' },
          { value: 'OPEN', label: 'Open', color: 'green' },
          { value: 'REVIEWING', label: 'Reviewing', color: 'yellow' },
          { value: 'DECIDED', label: 'Decided', color: 'blue' },
          { value: 'CLOSED', label: 'Closed', color: 'gray' },
        ],
      },
      {
        name: 'openDate',
        label: 'Opens',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'closeDate',
        label: 'Closes',
        type: 'DATE_TIME',
        icon: 'IconCalendarDue',
      },
      {
        name: 'focus',
        label: 'Focus / needs',
        type: 'TEXT',
        icon: 'IconTargetArrow',
      },
      { name: 'owner', label: 'Owner', type: 'TEXT', icon: 'IconUser' },
      {
        name: 'description',
        label: 'Description',
        type: 'TEXT',
        icon: TEXT_ICON,
      },
    ],
    defaultColumns: ['status', 'openDate', 'closeDate', 'focus', 'owner'],
  },
  {
    nameSingular: 'milestone',
    namePlural: 'milestones',
    labelSingular: 'Milestone',
    labelPlural: 'Milestones',
    navSection: 'WORK',
    icon: 'IconFlag',
    description: 'A milestone or deliverable on a project',
    navColor: 'red',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconFlag',
    fields: [
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'NOT_STARTED', label: 'Not started', color: 'gray' },
          { value: 'IN_PROGRESS', label: 'In progress', color: 'blue' },
          { value: 'BLOCKED', label: 'Blocked', color: 'red' },
          { value: 'DONE', label: 'Done', color: 'green' },
        ],
      },
      {
        name: 'dueDate',
        label: 'Due date',
        type: 'DATE_TIME',
        icon: 'IconCalendarDue',
      },
      {
        name: 'progress',
        label: 'Progress %',
        type: 'NUMBER',
        icon: 'IconPercentage',
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: ['project', 'owner', 'status', 'dueDate', 'progress'],
  },
  {
    nameSingular: 'dataset',
    namePlural: 'datasets',
    labelSingular: 'Dataset',
    labelPlural: 'Datasets',
    navSection: 'WORK',
    icon: 'IconDatabaseExport',
    description: 'Research data collected or produced by a project',
    navColor: 'turquoise',
    nameFieldLabel: 'Name',
    nameFieldIcon: 'IconDatabaseExport',
    fields: [
      {
        name: 'dataType',
        label: 'Data type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: [
          { value: 'TABULAR', label: 'Tabular', color: 'blue' },
          { value: 'IMAGING', label: 'Imaging', color: 'purple' },
          { value: 'GENOMIC', label: 'Genomic', color: 'green' },
          { value: 'SURVEY', label: 'Survey', color: 'orange' },
          { value: 'TEXT', label: 'Text / corpus', color: 'sky' },
          { value: 'OTHER', label: 'Other', color: 'gray' },
        ],
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'PLANNED', label: 'Planned', color: 'gray' },
          { value: 'COLLECTING', label: 'Collecting', color: 'yellow' },
          { value: 'CLEANING', label: 'Cleaning', color: 'orange' },
          { value: 'ANALYSIS', label: 'In analysis', color: 'blue' },
          { value: 'ARCHIVED', label: 'Archived', color: 'green' },
        ],
      },
      {
        name: 'storageLocation',
        label: 'Storage location',
        type: 'TEXT',
        icon: 'IconFolder',
      },
      {
        name: 'sizeGb',
        label: 'Size (GB)',
        type: 'NUMBER',
        icon: 'IconDatabase',
      },
      {
        name: 'hasEthicsApproval',
        label: 'Ethics approved',
        type: 'BOOLEAN',
        icon: 'IconShieldCheck',
      },
      {
        name: 'collectedAt',
        label: 'Collected',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'project',
      'dataType',
      'status',
      'storageLocation',
      'sizeGb',
    ],
  },
  {
    nameSingular: 'manuscript',
    namePlural: 'manuscripts',
    labelSingular: 'Manuscript',
    labelPlural: 'Manuscripts',
    navSection: 'WORK',
    icon: 'IconBook',
    description: 'A paper, preprint, thesis, or chapter in progress',
    navColor: 'blue',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconBook',
    fields: [
      {
        name: 'manuscriptType',
        label: 'Type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: [
          { value: 'JOURNAL_PAPER', label: 'Journal paper', color: 'blue' },
          {
            value: 'CONFERENCE_PAPER',
            label: 'Conference paper',
            color: 'sky',
          },
          { value: 'PREPRINT', label: 'Preprint', color: 'purple' },
          { value: 'THESIS', label: 'Thesis', color: 'orange' },
          { value: 'CHAPTER', label: 'Book chapter', color: 'green' },
        ],
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'OUTLINE', label: 'Outline', color: 'gray' },
          { value: 'DRAFTING', label: 'Drafting', color: 'yellow' },
          {
            value: 'INTERNAL_REVIEW',
            label: 'Internal review',
            color: 'orange',
          },
          { value: 'SUBMITTED', label: 'Submitted', color: 'blue' },
          { value: 'REVISION', label: 'In revision', color: 'purple' },
          { value: 'ACCEPTED', label: 'Accepted', color: 'turquoise' },
          { value: 'PUBLISHED', label: 'Published', color: 'green' },
        ],
      },
      {
        name: 'targetVenue',
        label: 'Target venue',
        type: 'TEXT',
        icon: 'IconBuildingBank',
      },
      {
        name: 'progress',
        label: 'Progress %',
        type: 'NUMBER',
        icon: 'IconPercentage',
      },
      {
        name: 'targetDate',
        label: 'Target date',
        type: 'DATE_TIME',
        icon: 'IconCalendarDue',
      },
      { name: 'doi', label: 'DOI', type: 'TEXT', icon: 'IconId' },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'project',
      'leadAuthor',
      'manuscriptType',
      'status',
      'targetVenue',
      'progress',
    ],
  },
  {
    nameSingular: 'applicationRequirement',
    namePlural: 'applicationRequirements',
    labelSingular: 'Application requirement',
    labelPlural: 'Application requirements',
    navSection: 'FUNDING',
    icon: 'IconChecklist',
    description: 'A checklist item needed to complete a grant application',
    navColor: 'gray',
    nameFieldLabel: 'Requirement',
    nameFieldIcon: 'IconChecklist',
    fields: [
      {
        name: 'category',
        label: 'Category',
        type: 'SELECT',
        icon: 'IconCategory',
        options: [
          { value: 'NARRATIVE', label: 'Narrative', color: 'blue' },
          { value: 'BUDGET', label: 'Budget', color: 'green' },
          { value: 'CV', label: 'CV / biosketch', color: 'turquoise' },
          {
            value: 'LETTER_OF_SUPPORT',
            label: 'Letter of support',
            color: 'purple',
          },
          { value: 'ETHICS', label: 'Ethics', color: 'orange' },
          { value: 'FORM', label: 'Form', color: 'sky' },
          { value: 'OTHER', label: 'Other', color: 'gray' },
        ],
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'NEEDED', label: 'Needed', color: 'red' },
          { value: 'REQUESTED', label: 'Requested', color: 'orange' },
          { value: 'READY', label: 'Ready', color: 'yellow' },
          { value: 'ATTACHED', label: 'Attached', color: 'green' },
          { value: 'WAIVED', label: 'Waived', color: 'gray' },
        ],
      },
      {
        name: 'dueDate',
        label: 'Due date',
        type: 'DATE_TIME',
        icon: 'IconCalendarDue',
      },
      {
        name: 'formNumber',
        label: 'Form number',
        type: 'TEXT',
        icon: 'IconHash',
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'application',
      'category',
      'status',
      'dueDate',
      'formNumber',
    ],
  },
  {
    nameSingular: 'applicantProfile',
    namePlural: 'applicantProfiles',
    labelSingular: 'Applicant profile',
    labelPlural: 'Applicant profiles',
    navSection: 'LAB',
    icon: 'IconIdBadge2',
    description:
      'Reusable applicant details that pre-fill portals and seed application drafts',
    navColor: 'sky',
    nameFieldLabel: 'Profile name',
    nameFieldIcon: 'IconIdBadge2',
    fields: [
      { name: 'fullName', label: 'Full name', type: 'TEXT', icon: 'IconUser' },
      { name: 'email', label: 'Email', type: 'TEXT', icon: 'IconMail' },
      { name: 'phone', label: 'Phone', type: 'TEXT', icon: 'IconPhone' },
      { name: 'orcid', label: 'ORCID', type: 'TEXT', icon: 'IconId' },
      {
        name: 'careerStage',
        label: 'Career stage',
        type: 'SELECT',
        icon: 'IconStairsUp',
        options: CAREER_STAGE_OPTIONS,
      },
      {
        name: 'citizenship',
        label: 'Citizenship',
        type: 'TEXT',
        icon: 'IconFlag',
      },
      {
        name: 'residency',
        label: 'Residency',
        type: 'TEXT',
        icon: 'IconHome',
      },
      {
        name: 'institution',
        label: 'Institution',
        type: 'TEXT',
        icon: 'IconBuildingBank',
      },
      {
        name: 'department',
        label: 'Department',
        type: 'TEXT',
        icon: 'IconBuilding',
      },
      {
        name: 'discipline',
        label: 'Discipline',
        type: 'TEXT',
        icon: 'IconAtom',
      },
      {
        name: 'keywords',
        label: 'Keywords',
        type: 'ARRAY',
        icon: TAG_ICON,
        readOnly: true,
      },
      {
        name: 'addressLine1',
        label: 'Address',
        type: 'TEXT',
        icon: 'IconMapPin',
      },
      {
        name: 'city',
        label: 'City',
        type: 'TEXT',
        icon: 'IconBuildingCommunity',
      },
      {
        name: 'province',
        label: 'Province / state',
        type: 'TEXT',
        icon: 'IconMap',
      },
      {
        name: 'postalCode',
        label: 'Postal code',
        type: 'TEXT',
        icon: 'IconMailbox',
      },
      { name: 'country', label: 'Country', type: 'TEXT', icon: 'IconWorld' },
      { name: 'bioShort', label: 'Short bio', type: 'TEXT', icon: TEXT_ICON },
      { name: 'bioLong', label: 'Full bio', type: 'TEXT', icon: TEXT_ICON },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'researcher',
      'careerStage',
      'institution',
      'discipline',
      'email',
      'orcid',
    ],
  },
  {
    nameSingular: 'applicationSection',
    namePlural: 'applicationSections',
    labelSingular: 'Application section',
    labelPlural: 'Application sections',
    navSection: 'FUNDING',
    icon: 'IconFileDescription',
    description:
      'A narrative section or answer drafted for a grant application',
    navColor: 'sky',
    nameFieldLabel: 'Section title',
    nameFieldIcon: 'IconFileDescription',
    fields: [
      {
        name: 'sectionType',
        label: 'Section type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: CANONICAL_CONTENT_OPTIONS,
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: [
          { value: 'NOT_STARTED', label: 'Not started', color: 'gray' },
          { value: 'DRAFTING', label: 'Drafting', color: 'yellow' },
          { value: 'IN_REVIEW', label: 'In review', color: 'orange' },
          { value: 'FINAL', label: 'Final', color: 'green' },
        ],
      },
      {
        name: 'prompt',
        label: 'Funder prompt',
        type: 'TEXT',
        icon: 'IconHelpCircle',
        description: 'The exact question/instruction from the funder',
      },
      { name: 'content', label: 'Content', type: 'TEXT', icon: TEXT_ICON },
      {
        name: 'wordLimit',
        label: 'Word limit',
        type: 'NUMBER',
        icon: 'IconRuler2',
      },
      {
        name: 'wordCount',
        label: 'Word count',
        type: 'NUMBER',
        icon: 'IconLetterCase',
      },
      {
        name: 'reusedFromId',
        label: 'Reused from',
        type: 'TEXT',
        icon: 'IconBookmarks',
        description: 'Id of the reusable answer this draft started from',
        readOnly: true,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'application',
      'sectionType',
      'status',
      'wordCount',
      'wordLimit',
    ],
  },
  {
    nameSingular: 'reusableAnswer',
    namePlural: 'reusableAnswers',
    labelSingular: 'Reusable answer',
    labelPlural: 'Reusable answers',
    navSection: 'FUNDING',
    icon: 'IconBookmarks',
    description:
      'A saved answer you can retrieve and adapt across applications',
    navColor: 'green',
    nameFieldLabel: 'Answer title',
    nameFieldIcon: 'IconBookmarks',
    fields: [
      {
        name: 'questionType',
        label: 'Question type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: CANONICAL_CONTENT_OPTIONS,
      },
      { name: 'content', label: 'Content', type: 'TEXT', icon: TEXT_ICON },
      {
        name: 'funder',
        label: 'Funder',
        type: 'TEXT',
        icon: 'IconBuildingBank',
        description: 'Funder this answer was written for, if any',
      },
      {
        name: 'tags',
        label: 'Tags',
        type: 'ARRAY',
        icon: TAG_ICON,
        readOnly: true,
      },
      {
        name: 'wordCount',
        label: 'Word count',
        type: 'NUMBER',
        icon: 'IconLetterCase',
      },
      {
        name: 'timesUsed',
        label: 'Times used',
        type: 'NUMBER',
        icon: 'IconRepeat',
      },
      {
        name: 'lastUsedAt',
        label: 'Last used',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'questionType',
      'project',
      'author',
      'funder',
      'timesUsed',
      'wordCount',
    ],
  },
];
