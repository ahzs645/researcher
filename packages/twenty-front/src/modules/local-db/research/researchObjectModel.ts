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
  defaultValue?: string | number | boolean;
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

// ── Manuscript authoring ──────────────────────────────────────────────────
// Sections of a paper. Front/back matter, the IMRaD body, and a dedicated
// SUPPLEMENT bucket whose figures/tables number separately (S1, S2…).
const MANUSCRIPT_SECTION_TYPE_OPTIONS: ResearchSelectOption[] = [
  { value: 'TITLE_PAGE', label: 'Title page', color: 'gray' },
  { value: 'ABSTRACT', label: 'Abstract', color: 'blue' },
  { value: 'KEYWORDS', label: 'Keywords', color: 'sky' },
  { value: 'INTRODUCTION', label: 'Introduction', color: 'turquoise' },
  {
    value: 'BACKGROUND',
    label: 'Background / related work',
    color: 'turquoise',
  },
  { value: 'METHODS', label: 'Methods', color: 'purple' },
  { value: 'RESULTS', label: 'Results', color: 'green' },
  { value: 'DISCUSSION', label: 'Discussion', color: 'pink' },
  { value: 'CONCLUSION', label: 'Conclusion', color: 'blue' },
  { value: 'ACKNOWLEDGMENTS', label: 'Acknowledgments', color: 'gray' },
  { value: 'FUNDING', label: 'Funding statement', color: 'orange' },
  {
    value: 'AUTHOR_CONTRIBUTIONS',
    label: 'Author contributions',
    color: 'sky',
  },
  { value: 'CONFLICTS', label: 'Conflicts of interest', color: 'red' },
  {
    value: 'DATA_AVAILABILITY',
    label: 'Data availability',
    color: 'turquoise',
  },
  { value: 'ETHICS', label: 'Ethics statement', color: 'orange' },
  { value: 'REFERENCES', label: 'References', color: 'gray' },
  { value: 'SUPPLEMENT', label: 'Supplementary material', color: 'purple' },
  { value: 'APPENDIX', label: 'Appendix', color: 'gray' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

// Where a section/asset sits in the document. Drives ordering and — for
// SUPPLEMENT — a separate, prefixed numbering sequence.
const PLACEMENT_OPTIONS: ResearchSelectOption[] = [
  { value: 'FRONT_MATTER', label: 'Front matter', color: 'sky' },
  { value: 'MAIN', label: 'Main text', color: 'green' },
  { value: 'BACK_MATTER', label: 'Back matter', color: 'gray' },
  { value: 'SUPPLEMENT', label: 'Supplement', color: 'purple' },
];

const ASSET_PLACEMENT_OPTIONS: ResearchSelectOption[] = [
  { value: 'MAIN', label: 'Main text', color: 'green' },
  { value: 'SUPPLEMENT', label: 'Supplement', color: 'purple' },
];

// What kind of numbered, captioned asset this is. Each kind keeps its own
// counter (Figure 1, Table 1, Scheme 1…), per journal convention.
const ASSET_KIND_OPTIONS: ResearchSelectOption[] = [
  { value: 'FIGURE', label: 'Figure', color: 'blue' },
  { value: 'TABLE', label: 'Table', color: 'green' },
  { value: 'SCHEME', label: 'Scheme', color: 'purple' },
  { value: 'BOX', label: 'Box', color: 'orange' },
  { value: 'EQUATION', label: 'Equation', color: 'pink' },
];

// Arrangement of the title page. A journal masthead runs authors and
// affiliations under the title; a thesis cover centres everything and spaces
// its groups apart.
const TITLE_PAGE_TEMPLATE_OPTIONS: ResearchSelectOption[] = [
  { value: 'JOURNAL', label: 'Journal masthead', color: 'blue' },
  { value: 'THESIS', label: 'Thesis cover page', color: 'purple' },
];

// How the image got here — the modular "ways images are added".
const IMAGE_SOURCE_OPTIONS: ResearchSelectOption[] = [
  { value: 'UPLOAD', label: 'Uploaded file', color: 'blue' },
  { value: 'URL', label: 'External URL', color: 'sky' },
  { value: 'DATASET', label: 'From a dataset', color: 'turquoise' },
  { value: 'GENERATED', label: 'Generated / plotted', color: 'purple' },
  { value: 'DIAGRAM', label: 'Mermaid diagram', color: 'yellow' },
  { value: 'NONE', label: 'No image yet', color: 'gray' },
];

// Draft lifecycle shared by sections.
const DRAFT_STATUS_OPTIONS: ResearchSelectOption[] = [
  { value: 'NOT_STARTED', label: 'Not started', color: 'gray' },
  { value: 'DRAFTING', label: 'Drafting', color: 'yellow' },
  { value: 'IN_REVIEW', label: 'In review', color: 'orange' },
  { value: 'FINAL', label: 'Final', color: 'green' },
];

// CSL item types (stored verbatim in cslJson; this SELECT is the friendly
// picker). Values are UPPER_SNAKE GraphQL-safe; the real CSL type with hyphens
// lives in the cslJson blob.
const CSL_TYPE_OPTIONS: ResearchSelectOption[] = [
  { value: 'ARTICLE_JOURNAL', label: 'Journal article', color: 'blue' },
  { value: 'PAPER_CONFERENCE', label: 'Conference paper', color: 'sky' },
  { value: 'BOOK', label: 'Book', color: 'turquoise' },
  { value: 'CHAPTER', label: 'Book chapter', color: 'green' },
  { value: 'THESIS', label: 'Thesis', color: 'purple' },
  { value: 'REPORT', label: 'Report', color: 'orange' },
  { value: 'DATASET', label: 'Dataset', color: 'pink' },
  { value: 'WEBPAGE', label: 'Web page', color: 'gray' },
  { value: 'PREPRINT', label: 'Preprint', color: 'sky' },
  { value: 'SOFTWARE', label: 'Software', color: 'turquoise' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

// How asset numbers run: one sequence for the whole paper, or restart per
// top-level section (e.g. 1.1, 1.2 — Methods figures vs Results figures).
const NUMBERING_SCOPE_OPTIONS: ResearchSelectOption[] = [
  { value: 'CONTINUOUS', label: 'Continuous (1, 2, 3…)', color: 'blue' },
  { value: 'PER_SECTION', label: 'Per section (1.1, 1.2…)', color: 'purple' },
];

const CAPTION_POSITION_OPTIONS: ResearchSelectOption[] = [
  { value: 'ABOVE', label: 'Above', color: 'sky' },
  { value: 'BELOW', label: 'Below', color: 'green' },
];

const FIGURE_PAGE_LAYOUT_OPTIONS: ResearchSelectOption[] = [
  { value: 'INLINE', label: 'Flow with section text', color: 'gray' },
  {
    value: 'SUPPLEMENT_ONE_PER_PAGE',
    label: 'Main inline; supplement one per page',
    color: 'green',
  },
  {
    value: 'ONE_PER_PAGE',
    label: 'Every figure on a separate page',
    color: 'blue',
  },
];

const SUPPLEMENT_START_LAYOUT_OPTIONS: ResearchSelectOption[] = [
  {
    value: 'NEW_COVER_PAGE',
    label: 'New supplemental-information page (legacy)',
    color: 'green',
  },
  { value: 'NEW_PAGE', label: 'Start on a new page', color: 'blue' },
  { value: 'CONTINUOUS', label: 'Continue after main paper', color: 'gray' },
];

const FRONT_MATTER_LAYOUT_OPTIONS: ResearchSelectOption[] = [
  {
    value: 'SEPARATE_TITLE_PAGE',
    label: 'Separate title page',
    color: 'blue',
  },
  {
    value: 'TITLE_WITH_ABSTRACT',
    label: 'Title + abstract on page 1',
    color: 'turquoise',
  },
  { value: 'INLINE', label: 'Continuous / inline', color: 'gray' },
];

const BODY_ALIGNMENT_OPTIONS: ResearchSelectOption[] = [
  { value: 'LEFT', label: 'Left aligned', color: 'gray' },
  { value: 'JUSTIFIED', label: 'Justified', color: 'blue' },
];

const AFFILIATION_ALIGNMENT_OPTIONS: ResearchSelectOption[] = [
  { value: 'LEFT', label: 'Left aligned', color: 'blue' },
  { value: 'CENTER', label: 'Centered', color: 'gray' },
  { value: 'RIGHT', label: 'Right aligned', color: 'turquoise' },
];

const AFFILIATION_NUMBER_STYLE_OPTIONS: ResearchSelectOption[] = [
  { value: 'SUPERSCRIPT', label: 'Superscript', color: 'blue' },
  { value: 'BASELINE', label: 'Baseline', color: 'gray' },
];

const HEADING_COLOR_OPTIONS: ResearchSelectOption[] = [
  { value: 'BLACK', label: 'Black', color: 'gray' },
  { value: 'ADDIS_BLUE', label: 'Addis blue', color: 'blue' },
];

const TABLE_STYLE_OPTIONS: ResearchSelectOption[] = [
  {
    value: 'ACADEMIC',
    label: 'Academic rules (Addis)',
    color: 'blue',
  },
  { value: 'GRID', label: 'Full grid', color: 'gray' },
  { value: 'SHADED_HEADER', label: 'Shaded header', color: 'turquoise' },
  { value: 'BORDERLESS', label: 'Borderless', color: 'green' },
];

// In-text citation rendering mode — the journal's house style.
const CITATION_MODE_OPTIONS: ResearchSelectOption[] = [
  { value: 'NUMERIC', label: 'Numeric [1]', color: 'blue' },
  { value: 'NUMERIC_SUPERSCRIPT', label: 'Superscript ¹', color: 'sky' },
  { value: 'AUTHOR_DATE', label: 'Author–date (Smith, 2020)', color: 'green' },
  { value: 'AUTHOR_NUMBER', label: 'Author–number', color: 'turquoise' },
];

const OUTPUT_FORMAT_OPTIONS: ResearchSelectOption[] = [
  { value: 'DOCX', label: 'Word (DOCX)', color: 'blue' },
  { value: 'PDF', label: 'PDF', color: 'red' },
  { value: 'LATEX', label: 'LaTeX', color: 'green' },
  { value: 'JATS', label: 'JATS XML', color: 'purple' },
  { value: 'MARKDOWN', label: 'Markdown', color: 'gray' },
  { value: 'HTML', label: 'HTML', color: 'orange' },
  { value: 'ZIP', label: 'Submission package (ZIP)', color: 'turquoise' },
];

const SUBMISSION_ARTIFACT_OPTIONS: ResearchSelectOption[] = [
  { value: 'COVER_LETTER', label: 'Cover letter', color: 'blue' },
  { value: 'HIGHLIGHTS', label: 'Highlights', color: 'yellow' },
  {
    value: 'COMPETING_INTERESTS',
    label: 'Competing-interests declaration',
    color: 'red',
  },
  {
    value: 'SUGGESTED_REVIEWERS',
    label: 'Suggested reviewers',
    color: 'purple',
  },
  {
    value: 'SEPARATE_FIGURES',
    label: 'Separate figure files',
    color: 'turquoise',
  },
];

// ── Obligations & assignment ───────────────────────────────────────────────
// The recurring "things a researcher must do" — progress reports, renewals,
// deliverables — that the obligations tracker manages, plus the roles/role-mix
// that let several people share a project and one person carry several projects.

// What a researcher is on the hook for. Funder reporting dominates, but ethics
// renewals and data-management plans are obligations too, so they are first
// class rather than free text.
const OBLIGATION_TYPE_OPTIONS: ResearchSelectOption[] = [
  { value: 'PROGRESS_REPORT', label: 'Progress report', color: 'blue' },
  { value: 'ANNUAL_REPORT', label: 'Annual report', color: 'sky' },
  { value: 'INTERIM_REPORT', label: 'Interim report', color: 'turquoise' },
  { value: 'FINAL_REPORT', label: 'Final report', color: 'green' },
  { value: 'FINANCIAL_REPORT', label: 'Financial report', color: 'orange' },
  { value: 'MILESTONE', label: 'Milestone / deliverable', color: 'purple' },
  { value: 'PRESENTATION', label: 'Presentation / slides', color: 'sky' },
  { value: 'ETHICS_RENEWAL', label: 'Ethics renewal', color: 'red' },
  { value: 'DATA_MANAGEMENT', label: 'Data management plan', color: 'yellow' },
  { value: 'PUBLICATION', label: 'Publication requirement', color: 'pink' },
  { value: 'TRAINING', label: 'Training / certification', color: 'gray' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

// Where an obligation sits in its lifecycle, surfaced as a real column so a
// researcher can see at a glance what is outstanding vs done.
const OBLIGATION_STATUS_OPTIONS: ResearchSelectOption[] = [
  { value: 'UPCOMING', label: 'Upcoming', color: 'gray' },
  { value: 'IN_PROGRESS', label: 'In progress', color: 'blue' },
  { value: 'SUBMITTED', label: 'Submitted', color: 'purple' },
  { value: 'COMPLETE', label: 'Complete', color: 'green' },
  { value: 'OVERDUE', label: 'Overdue', color: 'red' },
  { value: 'WAIVED', label: 'Waived', color: 'gray' },
];

// Many obligations repeat on a fixed cadence — from a weekly lab slide deck to
// annual progress reports and quarterly financials; recording it lets the next
// instance be generated automatically when one is completed.
const RECURRENCE_OPTIONS: ResearchSelectOption[] = [
  { value: 'ONCE', label: 'One-time', color: 'gray' },
  { value: 'WEEKLY', label: 'Weekly', color: 'pink' },
  { value: 'BIWEEKLY', label: 'Every two weeks', color: 'purple' },
  { value: 'MONTHLY', label: 'Monthly', color: 'sky' },
  { value: 'QUARTERLY', label: 'Quarterly', color: 'blue' },
  { value: 'SEMI_ANNUAL', label: 'Semi-annual', color: 'turquoise' },
  { value: 'ANNUAL', label: 'Annual', color: 'green' },
];

// Shared priority scale (mirrors the grant priority list) so urgent obligations
// sort to the top of "what do I owe".
const PRIORITY_OPTIONS: ResearchSelectOption[] = [
  { value: 'LOW', label: 'Low', color: 'gray' },
  { value: 'MEDIUM', label: 'Medium', color: 'yellow' },
  { value: 'HIGH', label: 'High', color: 'orange' },
  { value: 'CRITICAL', label: 'Critical', color: 'red' },
];

// What kind of file is attached to an obligation. The AI labeler suggests this
// from the filename/content; it is editable.
const DOCUMENT_KIND_OPTIONS: ResearchSelectOption[] = [
  { value: 'REPORT', label: 'Report', color: 'blue' },
  { value: 'FINANCIAL', label: 'Financial / budget', color: 'green' },
  { value: 'APPROVAL', label: 'Approval / certificate', color: 'turquoise' },
  { value: 'RECEIPT', label: 'Receipt / invoice', color: 'orange' },
  { value: 'CORRESPONDENCE', label: 'Correspondence', color: 'sky' },
  { value: 'DATASET', label: 'Data file', color: 'purple' },
  { value: 'SUPPORTING', label: 'Supporting document', color: 'gray' },
  { value: 'OTHER', label: 'Other', color: 'gray' },
];

// A researcher's role on a project. The roster lets several people share one
// project (each with a role) and one person carry several projects.
const MEMBERSHIP_ROLE_OPTIONS: ResearchSelectOption[] = [
  { value: 'LEAD', label: 'Lead', color: 'blue' },
  { value: 'CO_INVESTIGATOR', label: 'Co-investigator', color: 'sky' },
  { value: 'MEMBER', label: 'Member', color: 'turquoise' },
  { value: 'STUDENT', label: 'Student', color: 'purple' },
  { value: 'RESEARCH_ASSISTANT', label: 'Research assistant', color: 'green' },
  { value: 'COLLABORATOR', label: 'Collaborator', color: 'gray' },
  { value: 'ADVISOR', label: 'Advisor', color: 'orange' },
];

const MEMBERSHIP_STATUS_OPTIONS: ResearchSelectOption[] = [
  { value: 'ACTIVE', label: 'Active', color: 'green' },
  { value: 'INACTIVE', label: 'Inactive', color: 'gray' },
  { value: 'COMPLETED', label: 'Completed', color: 'blue' },
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
        name: 'dataGrid',
        label: 'Tabular data',
        type: 'TEXT',
        icon: 'IconTable',
        description:
          'Small result tables as a Markdown grid (| col | … |) — chart figures can plot this',
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
        name: 'authorLine',
        label: 'Author line',
        type: 'TEXT',
        icon: 'IconUsers',
        description: 'Ordered authors as they should appear in the manuscript',
      },
      {
        name: 'affiliations',
        label: 'Affiliations',
        type: 'TEXT',
        icon: 'IconBuilding',
      },
      {
        name: 'titlePageExtraLines',
        label: 'Title-page extra lines',
        type: 'TEXT',
        icon: 'IconList',
        description: 'Ordered JSON lines shown below title-page affiliations',
      },
      {
        name: 'correspondingAuthor',
        label: 'Corresponding author',
        type: 'TEXT',
        icon: 'IconMail',
        description: 'Name and active email address',
      },
      {
        name: 'contributorMetadata',
        label: 'Contributor metadata',
        type: 'TEXT',
        icon: 'IconIdBadge2',
        description:
          'Optional JSON layered on the author line: ORCIDs, CRediT roles, ROR affiliations, funding',
      },
      {
        name: 'supplementTitle',
        label: 'Supplement cover title',
        type: 'TEXT',
        icon: 'IconFileDescription',
        description: 'Blank uses the manuscript title',
      },
      {
        name: 'supplementAuthorLine',
        label: 'Supplement cover authors',
        type: 'TEXT',
        icon: 'IconUsers',
        description: 'Blank uses the manuscript author line',
      },
      {
        name: 'supplementAffiliations',
        label: 'Supplement cover affiliations',
        type: 'TEXT',
        icon: 'IconBuilding',
        description: 'Blank uses the manuscript affiliations',
      },
      {
        name: 'exportStyleOverrides',
        label: 'Saved export settings',
        type: 'TEXT',
        icon: 'IconAdjustments',
        description:
          'Per-manuscript JSON overrides layered on the journal profile',
      },
      {
        name: 'submissionExtras',
        label: 'Submission extras',
        type: 'TEXT',
        icon: 'IconBraces',
        description: 'Per-journal JSON snapshots of requirement values',
      },
      {
        name: 'coverLetter',
        label: 'Cover letter',
        type: 'TEXT',
        icon: 'IconFileText',
      },
      {
        name: 'highlights',
        label: 'Highlights',
        type: 'TEXT',
        icon: 'IconList',
        description: 'One highlight per line',
      },
      {
        name: 'competingInterests',
        label: 'Competing interests',
        type: 'TEXT',
        icon: 'IconScale',
      },
      {
        name: 'suggestedReviewers',
        label: 'Suggested reviewers',
        type: 'TEXT',
        icon: 'IconUserSearch',
        description: 'One reviewer per line with institution and email',
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
  {
    nameSingular: 'manuscriptSection',
    namePlural: 'manuscriptSections',
    labelSingular: 'Manuscript section',
    labelPlural: 'Manuscript sections',
    navSection: 'WORK',
    icon: 'IconFileText',
    description: 'A section of a paper, authored in the composer',
    navColor: 'blue',
    nameFieldLabel: 'Section title',
    nameFieldIcon: 'IconFileText',
    fields: [
      {
        name: 'sectionType',
        label: 'Section type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: MANUSCRIPT_SECTION_TYPE_OPTIONS,
      },
      {
        name: 'placement',
        label: 'Placement',
        type: 'SELECT',
        icon: 'IconLayoutDistributeHorizontal',
        description: 'Front matter, main text, back matter, or supplement',
        options: PLACEMENT_OPTIONS,
      },
      {
        name: 'content',
        label: 'Content (Markdown)',
        type: 'TEXT',
        icon: 'IconMarkdown',
        description:
          'Markdown body. Math as $…$, citations as [@key], cross-refs as [#fig:label].',
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: DRAFT_STATUS_OPTIONS,
      },
      {
        name: 'orderIndex',
        label: 'Order',
        type: 'NUMBER',
        icon: 'IconSortAscendingNumbers',
      },
      {
        name: 'level',
        label: 'Heading level',
        type: 'NUMBER',
        icon: 'IconHierarchy2',
        description: '1 = top-level section, 2-3 = subsection depth',
        defaultValue: 1,
      },
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
        name: 'includeInExport',
        label: 'Include in export',
        type: 'BOOLEAN',
        icon: 'IconFileExport',
      },
      {
        name: 'variantOfId',
        label: 'Alternative version of',
        type: 'TEXT',
        icon: 'IconVersions',
        description:
          'Id of the section this rewords. A version never exports on its own — it stands in for its base when exporting to its journal.',
      },
      {
        name: 'variantProfileKey',
        label: 'Version for journal',
        type: 'TEXT',
        icon: 'IconBuildingBank',
        description:
          'Journal profile key this version is written for, e.g. myst:tex/myst/mdpi:atmosphere',
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'manuscript',
      'sectionType',
      'placement',
      'status',
      'orderIndex',
      'level',
      'wordCount',
    ],
  },
  {
    nameSingular: 'figure',
    namePlural: 'figures',
    labelSingular: 'Figure',
    labelPlural: 'Figures',
    navSection: 'WORK',
    icon: 'IconPhoto',
    description: 'A numbered, captioned figure, table, or scheme in a paper',
    navColor: 'turquoise',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconPhoto',
    fields: [
      {
        name: 'assetKind',
        label: 'Kind',
        type: 'SELECT',
        icon: 'IconShape',
        description: 'Figure, table, scheme… each numbered in its own sequence',
        options: ASSET_KIND_OPTIONS,
      },
      {
        name: 'placement',
        label: 'Placement',
        type: 'SELECT',
        icon: 'IconLayoutDistributeHorizontal',
        description: 'Main text (Figure 1) or supplement (Figure S1)',
        options: ASSET_PLACEMENT_OPTIONS,
      },
      {
        name: 'refKey',
        label: 'Reference key',
        type: 'TEXT',
        icon: 'IconHash',
        description: 'Slug used in cross-refs, e.g. arpes → [#fig:arpes]',
      },
      {
        name: 'sourceLabel',
        label: 'Source label',
        type: 'TEXT',
        icon: 'IconTag',
        description:
          'The label the imported source used (e.g. "2.6") before renumbering',
      },
      {
        name: 'caption',
        label: 'Caption',
        type: 'TEXT',
        icon: 'IconFileDescription',
      },
      {
        name: 'tableData',
        label: 'Table content',
        type: 'TEXT',
        icon: 'IconTable',
        description: 'For tables: the grid as a Markdown table (| a | b |…)',
      },
      {
        name: 'equationLatex',
        label: 'Equation',
        type: 'TEXT',
        icon: 'IconMath',
        description: 'For equations: the body as LaTeX, e.g. \\frac{a}{b}',
      },
      {
        name: 'diagramSource',
        label: 'Diagram',
        type: 'TEXT',
        icon: 'IconSitemap',
        description:
          'For diagrams: the Mermaid source, e.g. flowchart TD; A-->B',
      },
      {
        name: 'imageSource',
        label: 'Image source',
        type: 'SELECT',
        icon: 'IconPhotoUp',
        options: IMAGE_SOURCE_OPTIONS,
      },
      {
        name: 'imageUrl',
        label: 'Image',
        type: 'TEXT',
        icon: 'IconLink',
        description: 'External URL or data-URL of the uploaded image',
      },
      {
        name: 'altText',
        label: 'Alt text',
        type: 'TEXT',
        icon: 'IconAccessible',
      },
      {
        name: 'credit',
        label: 'Credit / license',
        type: 'TEXT',
        icon: 'IconLicense',
      },
      {
        name: 'widthPercent',
        label: 'Width (%)',
        type: 'NUMBER',
        icon: 'IconRulerMeasure',
      },
      {
        name: 'numbered',
        label: 'Numbered',
        type: 'BOOLEAN',
        icon: 'IconListNumbers',
        description:
          'Off for a display equation set without a number; it takes none from the sequence and cannot be cross-referenced',
      },
      {
        name: 'orderIndex',
        label: 'Order',
        type: 'NUMBER',
        icon: 'IconSortAscendingNumbers',
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'manuscript',
      'assetKind',
      'placement',
      'refKey',
      'caption',
      'imageSource',
    ],
  },
  {
    nameSingular: 'reference',
    namePlural: 'references',
    labelSingular: 'Reference',
    labelPlural: 'References',
    navSection: 'WORK',
    icon: 'IconQuote',
    description: 'A bibliography entry (stored as CSL JSON) cited in a paper',
    navColor: 'gray',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconQuote',
    fields: [
      {
        name: 'citationKey',
        label: 'Citation key',
        type: 'TEXT',
        icon: 'IconHash',
        description: 'Stable key used in text as [@key]',
      },
      {
        name: 'cslType',
        label: 'Type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: CSL_TYPE_OPTIONS,
      },
      { name: 'authors', label: 'Authors', type: 'TEXT', icon: 'IconUsers' },
      { name: 'year', label: 'Year', type: 'NUMBER', icon: CALENDAR_ICON },
      {
        name: 'containerTitle',
        label: 'Journal / book',
        type: 'TEXT',
        icon: 'IconBook',
      },
      {
        name: 'volume',
        label: 'Volume',
        type: 'TEXT',
        icon: 'IconNumbers',
      },
      { name: 'issue', label: 'Issue', type: 'TEXT', icon: 'IconNumbers' },
      { name: 'pages', label: 'Pages', type: 'TEXT', icon: 'IconFileText' },
      { name: 'doi', label: 'DOI', type: 'TEXT', icon: 'IconId' },
      { name: 'url', label: 'URL', type: 'TEXT', icon: 'IconLink' },
      {
        name: 'cslJson',
        label: 'CSL JSON',
        type: 'TEXT',
        icon: 'IconBraces',
        description: 'Full CSL-JSON item — the source of truth for formatting',
      },
      {
        name: 'zoteroKey',
        label: 'Zotero key',
        type: 'TEXT',
        icon: 'IconExternalLink',
        description: 'Provenance if imported from Zotero',
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'citationKey',
      'cslType',
      'authors',
      'year',
      'containerTitle',
      'doi',
    ],
  },
  {
    nameSingular: 'journalTemplate',
    namePlural: 'journalTemplates',
    labelSingular: 'Journal template',
    labelPlural: 'Journal templates',
    navSection: 'WORK',
    icon: 'IconLayoutBoardSplit',
    description: 'A target journal format: citation style + numbering + layout',
    navColor: 'orange',
    nameFieldLabel: 'Journal / format name',
    nameFieldIcon: 'IconLayoutBoardSplit',
    fields: [
      {
        name: 'citationMode',
        label: 'Citation style',
        type: 'SELECT',
        icon: 'IconQuote',
        options: CITATION_MODE_OPTIONS,
      },
      {
        name: 'profileKey',
        label: 'Profile key',
        type: 'TEXT',
        icon: 'IconKey',
        description: 'Stable identifier used by submission validation',
      },
      {
        name: 'citationStyleId',
        label: 'CSL style id',
        type: 'TEXT',
        icon: 'IconFileTypeXml',
        description: 'Key into the CSL styles repo, e.g. "nature"',
      },
      {
        name: 'figureLabelFormat',
        label: 'Figure label',
        type: 'TEXT',
        icon: 'IconPhoto',
        description: 'Template, e.g. "Figure {n}" or "Fig. {n}"',
      },
      {
        name: 'tableLabelFormat',
        label: 'Table label',
        type: 'TEXT',
        icon: 'IconTable',
        description: 'Template, e.g. "Table {n}"',
      },
      {
        name: 'supplementPrefix',
        label: 'Supplement prefix',
        type: 'TEXT',
        icon: 'IconLetterS',
        description: 'Prefix for supplementary items, e.g. "S" → Figure S1',
      },
      {
        name: 'numberingScope',
        label: 'Numbering',
        type: 'SELECT',
        icon: 'IconSortAscendingNumbers',
        options: NUMBERING_SCOPE_OPTIONS,
      },
      {
        name: 'crossRefFormat',
        label: 'Cross-ref format',
        type: 'TEXT',
        icon: 'IconArrowsExchange',
        description: 'How [#fig:x] renders in text, e.g. "Figure {n}"',
      },
      {
        name: 'figureCaptionPosition',
        label: 'Figure caption',
        type: 'SELECT',
        icon: 'IconAlignBoxLeftBottom',
        options: CAPTION_POSITION_OPTIONS,
      },
      {
        name: 'figureCaptionFontSize',
        label: 'Figure caption font size (pt)',
        type: 'NUMBER',
        icon: 'IconTextSize',
      },
      {
        name: 'figureCaptionLineSpacing',
        label: 'Figure caption line spacing',
        type: 'NUMBER',
        icon: 'IconLineHeight',
      },
      {
        name: 'figureCaptionGap',
        label: 'Image-to-caption gap (pt)',
        type: 'NUMBER',
        icon: 'IconSpacingVertical',
      },
      {
        name: 'figureCaptionSpacingAfter',
        label: 'Spacing after figure caption (pt)',
        type: 'NUMBER',
        icon: 'IconSpacingVertical',
      },
      {
        name: 'tableCaptionPosition',
        label: 'Table caption',
        type: 'SELECT',
        icon: 'IconAlignBoxLeftTop',
        options: CAPTION_POSITION_OPTIONS,
      },
      {
        name: 'figurePageLayout',
        label: 'Figure pagination',
        type: 'SELECT',
        icon: 'IconFileDescription',
        options: FIGURE_PAGE_LAYOUT_OPTIONS,
      },
      {
        name: 'supplementStartLayout',
        label: 'Supplement start',
        type: 'SELECT',
        icon: 'IconFileDescription',
        options: SUPPLEMENT_START_LAYOUT_OPTIONS,
      },
      {
        name: 'supplementCoverPage',
        label: 'Supplement cover page',
        type: 'BOOLEAN',
        icon: 'IconFileDescription',
      },
      {
        name: 'abstractWordLimit',
        label: 'Abstract word limit',
        type: 'NUMBER',
        icon: 'IconRuler2',
      },
      {
        name: 'sectionSkeleton',
        label: 'Section skeleton',
        type: 'TEXT',
        icon: 'IconList',
        description:
          'JSON list of { name, sectionType, placement, wordLimit? } — overrides the default IMRaD/thesis skeleton',
      },
      {
        name: 'abstractWordMinimum',
        label: 'Abstract minimum',
        type: 'NUMBER',
        icon: 'IconRuler2',
      },
      {
        name: 'keywordMinimum',
        label: 'Minimum keywords',
        type: 'NUMBER',
        icon: 'IconTags',
      },
      {
        name: 'keywordMaximum',
        label: 'Maximum keywords',
        type: 'NUMBER',
        icon: 'IconTags',
      },
      {
        name: 'requiredArtifacts',
        label: 'Required submission files',
        type: 'MULTI_SELECT',
        icon: 'IconFiles',
        options: SUBMISSION_ARTIFACT_OPTIONS,
      },
      {
        name: 'submissionRequirements',
        label: 'Submission requirements',
        type: 'TEXT',
        icon: 'IconBraces',
        description: 'JSON list of { key, required, label?, notes? }',
      },
      {
        name: 'lineNumbering',
        label: 'Line numbering',
        type: 'BOOLEAN',
        icon: 'IconListNumbers',
      },
      {
        name: 'pageNumbering',
        label: 'Page numbering',
        type: 'BOOLEAN',
        icon: 'IconFileDigit',
      },
      {
        name: 'sectionNumbering',
        label: 'Numbered sections',
        type: 'BOOLEAN',
        icon: 'IconListNumbers',
      },
      {
        name: 'twoColumn',
        label: 'Two-column layout',
        type: 'BOOLEAN',
        icon: 'IconColumns2',
      },
      {
        name: 'frontMatterLayout',
        label: 'Front-matter layout',
        type: 'SELECT',
        icon: 'IconLayoutNavbar',
        options: FRONT_MATTER_LAYOUT_OPTIONS,
      },
      {
        name: 'fontFamily',
        label: 'Manuscript font',
        type: 'TEXT',
        icon: 'IconTypography',
      },
      {
        name: 'bodyFontSize',
        label: 'Body font size (pt)',
        type: 'NUMBER',
        icon: 'IconTextSize',
      },
      {
        name: 'titleFontSize',
        label: 'Title font size (pt)',
        type: 'NUMBER',
        icon: 'IconTextSize',
      },
      {
        name: 'headingFontSize',
        label: 'Heading font size (pt)',
        type: 'NUMBER',
        icon: 'IconTextSize',
      },
      {
        name: 'subheadingFontSize',
        label: 'Subheading font size (pt)',
        type: 'NUMBER',
        icon: 'IconTextSize',
      },
      {
        name: 'headingColor',
        label: 'Heading color',
        type: 'SELECT',
        icon: 'IconPalette',
        options: HEADING_COLOR_OPTIONS,
      },
      {
        name: 'lineSpacing',
        label: 'Line spacing',
        type: 'NUMBER',
        icon: 'IconLineHeight',
      },
      {
        name: 'abstractLineSpacing',
        label: 'Abstract line spacing',
        type: 'NUMBER',
        icon: 'IconLineHeight',
      },
      {
        name: 'paragraphSpacingAfter',
        label: 'Paragraph spacing after (pt)',
        type: 'NUMBER',
        icon: 'IconLineHeight',
      },
      {
        name: 'paragraphFirstLineIndent',
        label: 'First-line indent (pt)',
        type: 'NUMBER',
        icon: 'IconIndentIncrease',
      },
      {
        name: 'bodyAlignment',
        label: 'Body alignment',
        type: 'SELECT',
        icon: 'IconAlignJustified',
        options: BODY_ALIGNMENT_OPTIONS,
      },
      {
        name: 'affiliationAlignment',
        label: 'Affiliation alignment',
        type: 'SELECT',
        icon: 'IconAlignLeft',
        options: AFFILIATION_ALIGNMENT_OPTIONS,
      },
      {
        name: 'affiliationLineSpacing',
        label: 'Affiliation line spacing',
        type: 'NUMBER',
        icon: 'IconLineHeight',
      },
      {
        name: 'affiliationNumberStyle',
        label: 'Affiliation numbering',
        type: 'SELECT',
        icon: 'IconSuperscript',
        options: AFFILIATION_NUMBER_STYLE_OPTIONS,
      },
      {
        name: 'affiliationSpacingAfter',
        label: 'Affiliation spacing after (pt)',
        type: 'NUMBER',
        icon: 'IconLineHeight',
      },
      {
        name: 'tableStyle',
        label: 'Table style',
        type: 'SELECT',
        icon: 'IconTable',
        options: TABLE_STYLE_OPTIONS,
      },
      {
        name: 'tableFontSize',
        label: 'Table font size (pt)',
        type: 'NUMBER',
        icon: 'IconTextSize',
      },
      {
        name: 'tableLineSpacing',
        label: 'Table line spacing',
        type: 'NUMBER',
        icon: 'IconLineHeight',
      },
      {
        name: 'titlePageTemplate',
        label: 'Title page template',
        type: 'SELECT',
        icon: 'IconLayoutBoardSplit',
        description: 'Journal masthead, or a centred thesis cover page',
        options: TITLE_PAGE_TEMPLATE_OPTIONS,
      },
      {
        name: 'referenceDocUrl',
        label: 'Reference DOCX',
        type: 'TEXT',
        icon: 'IconFileTypeDocx',
        description: 'Word template whose named styles the export maps onto',
      },
      {
        name: 'outputFormats',
        label: 'Output formats',
        type: 'MULTI_SELECT',
        icon: 'IconFileExport',
        options: OUTPUT_FORMAT_OPTIONS,
        readOnly: true,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'citationMode',
      'numberingScope',
      'figureLabelFormat',
      'citationStyleId',
      'frontMatterLayout',
      'twoColumn',
    ],
  },
  {
    nameSingular: 'projectMembership',
    namePlural: 'projectMemberships',
    labelSingular: 'Project assignment',
    labelPlural: 'Project assignments',
    navSection: 'WORK',
    icon: 'IconUsersPlus',
    description:
      'Assigns a researcher to a project (with a role) so several people can share a project and one person can carry several',
    navColor: 'turquoise',
    nameFieldLabel: 'Assignment',
    nameFieldIcon: 'IconUsersPlus',
    fields: [
      {
        name: 'role',
        label: 'Role',
        type: 'SELECT',
        icon: 'IconBriefcase',
        options: MEMBERSHIP_ROLE_OPTIONS,
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: MEMBERSHIP_STATUS_OPTIONS,
      },
      {
        name: 'allocationPercent',
        label: 'Time allocation %',
        type: 'NUMBER',
        icon: 'IconPercentage',
        description: 'Share of this person’s effort on the project',
      },
      {
        name: 'responsibilities',
        label: 'Responsibilities',
        type: 'TEXT',
        icon: 'IconChecklist',
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
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'researcher',
      'project',
      'role',
      'status',
      'allocationPercent',
    ],
  },
  {
    nameSingular: 'obligation',
    namePlural: 'obligations',
    labelSingular: 'Obligation',
    labelPlural: 'Obligations',
    navSection: 'WORK',
    icon: 'IconClipboardCheck',
    description:
      'A reporting or compliance obligation a researcher must complete — progress reports, renewals, deliverables — with its documents',
    navColor: 'red',
    nameFieldLabel: 'Title',
    nameFieldIcon: 'IconClipboardCheck',
    fields: [
      {
        name: 'obligationType',
        label: 'Type',
        type: 'SELECT',
        icon: 'IconCategory',
        options: OBLIGATION_TYPE_OPTIONS,
      },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        icon: STATUS_ICON,
        options: OBLIGATION_STATUS_OPTIONS,
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'SELECT',
        icon: 'IconFlag',
        options: PRIORITY_OPTIONS,
      },
      {
        name: 'reportingPeriod',
        label: 'Reporting period',
        type: 'TEXT',
        icon: 'IconCalendarStats',
        description: 'The period this covers, e.g. "2026", "Year 2", "Q1 2026"',
      },
      {
        name: 'recurrence',
        label: 'Recurrence',
        type: 'SELECT',
        icon: 'IconRefresh',
        options: RECURRENCE_OPTIONS,
      },
      {
        name: 'dueDate',
        label: 'Due date',
        type: 'DATE_TIME',
        icon: 'IconCalendarDue',
      },
      {
        name: 'periodStart',
        label: 'Period start',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'periodEnd',
        label: 'Period end',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'submittedAt',
        label: 'Submitted',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      {
        name: 'completedAt',
        label: 'Completed',
        type: 'DATE_TIME',
        icon: 'IconCalendarCheck',
      },
      {
        name: 'keywords',
        label: 'Keywords',
        type: 'ARRAY',
        icon: TAG_ICON,
        description: 'AI-suggested labels/keywords for finding this later',
        readOnly: true,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: [
      'obligationType',
      'assignee',
      'project',
      'status',
      'reportingPeriod',
      'dueDate',
    ],
  },
  {
    nameSingular: 'obligationDocument',
    namePlural: 'obligationDocuments',
    labelSingular: 'Obligation document',
    labelPlural: 'Obligation documents',
    navSection: 'WORK',
    icon: 'IconPaperclip',
    description:
      'A file uploaded for an obligation (the report, receipts, approvals…), with AI-suggested keywords',
    navColor: 'gray',
    nameFieldLabel: 'Document name',
    nameFieldIcon: 'IconPaperclip',
    fields: [
      {
        name: 'documentKind',
        label: 'Kind',
        type: 'SELECT',
        icon: 'IconCategory',
        options: DOCUMENT_KIND_OPTIONS,
      },
      {
        name: 'fileUrl',
        label: 'File',
        type: 'TEXT',
        icon: 'IconLink',
        description: 'Uploaded file (data URL) or external link',
      },
      {
        name: 'fileType',
        label: 'File type',
        type: 'TEXT',
        icon: 'IconFile',
        description: 'MIME type or extension, e.g. application/pdf',
      },
      {
        name: 'fileSizeKb',
        label: 'Size (KB)',
        type: 'NUMBER',
        icon: 'IconDatabase',
      },
      {
        name: 'keywords',
        label: 'Keywords',
        type: 'ARRAY',
        icon: TAG_ICON,
        description: 'AI-suggested labels/keywords',
        readOnly: true,
      },
      {
        name: 'summary',
        label: 'Summary',
        type: 'TEXT',
        icon: TEXT_ICON,
        description: 'AI-suggested one-line summary',
      },
      {
        name: 'uploadedAt',
        label: 'Uploaded',
        type: 'DATE_TIME',
        icon: CALENDAR_ICON,
      },
      { name: 'notes', label: 'Notes', type: 'TEXT', icon: 'IconNotes' },
    ],
    defaultColumns: ['obligation', 'documentKind', 'fileType', 'uploadedAt'],
  },
];
