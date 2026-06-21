// Real relations between research objects. Each entry generates a paired set of
// RELATION fields: a MANY_TO_ONE on the child (the `many` side, with a
// `<manyField>Id` join column) and a ONE_TO_MANY on the parent (the `one`
// side). The bridge resolver resolves both directions, so a grant shows its
// project/lead as chips and a project shows its grants as a related list.

export type ResearchRelation = {
  // Parent ("one") side.
  one: string;
  oneField: string;
  oneFieldLabel: string;
  oneFieldIcon: string;
  // Child ("many") side — gets the join column `<manyField>Id`.
  many: string;
  manyField: string;
  manyFieldLabel: string;
  manyFieldIcon: string;
};

export const RESEARCH_RELATIONS: ResearchRelation[] = [
  // Team ↔ members / projects
  {
    one: 'researchTeam',
    oneField: 'members',
    oneFieldLabel: 'Members',
    oneFieldIcon: 'IconUser',
    many: 'researcher',
    manyField: 'team',
    manyFieldLabel: 'Team',
    manyFieldIcon: 'IconUsersGroup',
  },
  {
    one: 'researchTeam',
    oneField: 'projects',
    oneFieldLabel: 'Projects',
    oneFieldIcon: 'IconFolder',
    many: 'project',
    manyField: 'team',
    manyFieldLabel: 'Team',
    manyFieldIcon: 'IconUsersGroup',
  },
  // Researcher ↔ led projects / owned grants / applications / manuscripts / milestones
  {
    one: 'researcher',
    oneField: 'ledProjects',
    oneFieldLabel: 'Led projects',
    oneFieldIcon: 'IconFolder',
    many: 'project',
    manyField: 'lead',
    manyFieldLabel: 'Lead',
    manyFieldIcon: 'IconUser',
  },
  {
    one: 'researcher',
    oneField: 'ownedGrants',
    oneFieldLabel: 'Grants',
    oneFieldIcon: 'IconReportMoney',
    many: 'grant',
    manyField: 'lead',
    manyFieldLabel: 'Lead',
    manyFieldIcon: 'IconUser',
  },
  {
    one: 'researcher',
    oneField: 'applications',
    oneFieldLabel: 'Applications',
    oneFieldIcon: 'IconFileText',
    many: 'grantApplication',
    manyField: 'applicant',
    manyFieldLabel: 'Applicant',
    manyFieldIcon: 'IconUser',
  },
  {
    one: 'researcher',
    oneField: 'manuscripts',
    oneFieldLabel: 'Manuscripts',
    oneFieldIcon: 'IconBook',
    many: 'manuscript',
    manyField: 'leadAuthor',
    manyFieldLabel: 'Lead author',
    manyFieldIcon: 'IconUser',
  },
  {
    one: 'researcher',
    oneField: 'milestones',
    oneFieldLabel: 'Milestones',
    oneFieldIcon: 'IconFlag',
    many: 'milestone',
    manyField: 'owner',
    manyFieldLabel: 'Owner',
    manyFieldIcon: 'IconUser',
  },
  // Project ↔ grants / milestones / datasets / manuscripts
  {
    one: 'project',
    oneField: 'grants',
    oneFieldLabel: 'Grants',
    oneFieldIcon: 'IconReportMoney',
    many: 'grant',
    manyField: 'project',
    manyFieldLabel: 'Project',
    manyFieldIcon: 'IconFolder',
  },
  {
    one: 'project',
    oneField: 'milestones',
    oneFieldLabel: 'Milestones',
    oneFieldIcon: 'IconFlag',
    many: 'milestone',
    manyField: 'project',
    manyFieldLabel: 'Project',
    manyFieldIcon: 'IconFolder',
  },
  {
    one: 'project',
    oneField: 'datasets',
    oneFieldLabel: 'Datasets',
    oneFieldIcon: 'IconDatabaseExport',
    many: 'dataset',
    manyField: 'project',
    manyFieldLabel: 'Project',
    manyFieldIcon: 'IconFolder',
  },
  {
    one: 'project',
    oneField: 'manuscripts',
    oneFieldLabel: 'Manuscripts',
    oneFieldIcon: 'IconBook',
    many: 'manuscript',
    manyField: 'project',
    manyFieldLabel: 'Project',
    manyFieldIcon: 'IconFolder',
  },
  // Grant ↔ applications
  {
    one: 'grant',
    oneField: 'applications',
    oneFieldLabel: 'Applications',
    oneFieldIcon: 'IconFileText',
    many: 'grantApplication',
    manyField: 'grant',
    manyFieldLabel: 'Grant',
    manyFieldIcon: 'IconReportMoney',
  },
  // Application cycle ↔ applications
  {
    one: 'applicationCycle',
    oneField: 'applications',
    oneFieldLabel: 'Applications',
    oneFieldIcon: 'IconFileText',
    many: 'grantApplication',
    manyField: 'cycle',
    manyFieldLabel: 'Application cycle',
    manyFieldIcon: 'IconCalendarStats',
  },
  // Grant source ↔ discovered opportunities
  {
    one: 'grantSource',
    oneField: 'opportunities',
    oneFieldLabel: 'Opportunities',
    oneFieldIcon: 'IconTargetArrow',
    many: 'grantOpportunity',
    manyField: 'source',
    manyFieldLabel: 'Source',
    manyFieldIcon: 'IconDatabase',
  },
  // Application ↔ requirement checklist
  {
    one: 'grantApplication',
    oneField: 'requirements',
    oneFieldLabel: 'Requirements',
    oneFieldIcon: 'IconChecklist',
    many: 'applicationRequirement',
    manyField: 'application',
    manyFieldLabel: 'Application',
    manyFieldIcon: 'IconFileText',
  },
  // Project ↔ applications — the missing link so an application carries its
  // research context (and reuse can be scoped by project).
  {
    one: 'project',
    oneField: 'applications',
    oneFieldLabel: 'Applications',
    oneFieldIcon: 'IconFileText',
    many: 'grantApplication',
    manyField: 'project',
    manyFieldLabel: 'Project',
    manyFieldIcon: 'IconFolder',
  },
  // Opportunity → the grant it became (provenance once converted).
  {
    one: 'grantOpportunity',
    oneField: 'grants',
    oneFieldLabel: 'Grants',
    oneFieldIcon: 'IconReportMoney',
    many: 'grant',
    manyField: 'opportunity',
    manyFieldLabel: 'Opportunity',
    manyFieldIcon: 'IconTargetArrow',
  },
  // Opportunity → the application started from it (the "start application" flow).
  {
    one: 'grantOpportunity',
    oneField: 'applications',
    oneFieldLabel: 'Applications',
    oneFieldIcon: 'IconFileText',
    many: 'grantApplication',
    manyField: 'opportunity',
    manyFieldLabel: 'Opportunity',
    manyFieldIcon: 'IconTargetArrow',
  },
  // Application ↔ narrative sections (the authored content of the application).
  {
    one: 'grantApplication',
    oneField: 'sections',
    oneFieldLabel: 'Sections',
    oneFieldIcon: 'IconFileDescription',
    many: 'applicationSection',
    manyField: 'application',
    manyFieldLabel: 'Application',
    manyFieldIcon: 'IconFileText',
  },
  // Researcher ↔ canonical applicant profile.
  {
    one: 'researcher',
    oneField: 'profiles',
    oneFieldLabel: 'Applicant profiles',
    oneFieldIcon: 'IconIdBadge2',
    many: 'applicantProfile',
    manyField: 'researcher',
    manyFieldLabel: 'Researcher',
    manyFieldIcon: 'IconUser',
  },
  // Project ↔ reusable answers (reuse scoped to the project / context).
  {
    one: 'project',
    oneField: 'reusableAnswers',
    oneFieldLabel: 'Reusable answers',
    oneFieldIcon: 'IconBookmarks',
    many: 'reusableAnswer',
    manyField: 'project',
    manyFieldLabel: 'Project',
    manyFieldIcon: 'IconFolder',
  },
  // Researcher ↔ reusable answers they authored.
  {
    one: 'researcher',
    oneField: 'reusableAnswers',
    oneFieldLabel: 'Reusable answers',
    oneFieldIcon: 'IconBookmarks',
    many: 'reusableAnswer',
    manyField: 'author',
    manyFieldLabel: 'Author',
    manyFieldIcon: 'IconUser',
  },
];
