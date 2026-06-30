import {
  RESEARCH_NAV_FOLDER_IDS,
  buildResearchNavigationMenuItems,
  buildResearchObjectEdges,
  buildResearchViews,
} from './researchMetadataBuilder';
import { type WorkspaceMode } from './researchObjectModel';
import {
  getResearchSeedRecords,
  getResearchStarterRecords,
} from './researchSeedRecords';

// Single integration point that grafts the research object model onto the
// bridge's static metadata. The standard 33-object bundle, generated views,
// and generated navigation items stay untouched and regenerable — research
// objects are appended, and the kept vanilla objects are re-skinned/re-homed,
// at the three places the bridge reads them:
//   - object metadata   → buildBridgeDataSource + bridgeMetadataMockLink
//   - views             → bridgeSystemSeed
//   - navigation items  → bridgeSystemSeed

// Vanilla Twenty object ids (from the static metadata bundle) that the research
// re-skin hides or re-homes. Keeping the ids here — rather than editing the
// generated bundle — keeps that bundle pristine and regenerable.
const VANILLA_OBJECT_IDS = {
  company: '29a80d39-c931-4ed2-8ae7-8eac638f7f95',
  person: '2e0d7477-8143-4d8f-bc36-2b4f92cbd101',
  opportunity: 'd493b617-19c8-4cbb-a50f-c084e4b9f276',
  task: '34ac72b8-0aaa-4c01-b8a8-8390415fdf8a',
  note: '254e79a9-80e6-4841-b22c-2d67b04d97d6',
  dashboard: 'e2e2a576-9631-4bba-8a15-88a3dc4d84a1',
  rocket: '6934bd29-d89d-479e-8b32-f4f3a9af19b6',
  pet: '4646d650-bc55-42f2-9544-4c804c6616a0',
  surveyResult: '9b374f59-ccba-4cfe-8f1f-0725332c4a13',
  employmentHistory: '057951b6-46e0-4ae9-956a-b3b72f2cf800',
  petCareAgreement: '4397cb61-4bcc-49f8-b024-739b74ed9928',
} as const;

const WORKFLOWS_FOLDER_ID = 'c91d2186-fd13-4a4c-b95a-d90b61628c2c';

// Pure-demo objects: dropped from the nav entirely. The records stay queryable
// (the object metadata is untouched), they just don't clutter a research nav.
const HIDDEN_NAV_OBJECT_IDS = new Set<string>([
  VANILLA_OBJECT_IDS.rocket,
  VANILLA_OBJECT_IDS.pet,
  VANILLA_OBJECT_IDS.surveyResult,
  VANILLA_OBJECT_IDS.employmentHistory,
  VANILLA_OBJECT_IDS.petCareAgreement,
]);

// Repurposed CRM: People → Collaborators and Companies → Institutions live in
// the Lab folder; the generic Tasks/Notes move under Work. Positions land after
// the research objects already seeded into those folders.
const RELOCATED_NAV_ITEMS: Record<
  string,
  { folderId: string; position: number }
> = {
  [VANILLA_OBJECT_IDS.person]: {
    folderId: RESEARCH_NAV_FOLDER_IDS.LAB,
    position: 2,
  },
  [VANILLA_OBJECT_IDS.company]: {
    folderId: RESEARCH_NAV_FOLDER_IDS.LAB,
    position: 3,
  },
  [VANILLA_OBJECT_IDS.task]: {
    folderId: RESEARCH_NAV_FOLDER_IDS.WORK,
    position: 4,
  },
  [VANILLA_OBJECT_IDS.note]: {
    folderId: RESEARCH_NAV_FOLDER_IDS.WORK,
    position: 5,
  },
};

// Leftover top-level items pushed below the four research folders (positions
// 0–3) so the drawer reads research-first. Keyed by object id, except the
// Workflows folder which has no object and is keyed by its own id.
const REPOSITIONED_TOP_LEVEL: Record<string, number> = {
  [VANILLA_OBJECT_IDS.opportunity]: 10,
  [VANILLA_OBJECT_IDS.dashboard]: 11,
  [WORKFLOWS_FOLDER_ID]: 12,
};

// Object label re-skins so People read as Collaborators and Companies as
// Institutions everywhere (record pages, breadcrumbs, search), matching the
// research framing — not just the nav label.
const OBJECT_LABEL_OVERRIDES: Record<string, Record<string, unknown>> = {
  [VANILLA_OBJECT_IDS.person]: {
    labelSingular: 'Collaborator',
    labelPlural: 'Collaborators',
    description: 'A collaborator, contact, or external partner',
    icon: 'IconUsers',
  },
  [VANILLA_OBJECT_IDS.company]: {
    labelSingular: 'Institution',
    labelPlural: 'Institutions',
    description: 'A university, funder, or partner organization',
    icon: 'IconBuildingBank',
  },
};

type ObjectMetadataQueryResult = {
  objects: {
    edges: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

// Re-skin a single object edge's label/icon if it's one of the repurposed
// vanilla objects; otherwise pass it through untouched.
const applyObjectLabelOverride = (edge: unknown): unknown => {
  const candidate = edge as {
    node?: ({ id?: string } & Record<string, unknown>) | null;
  };
  const node = candidate?.node;
  if (!node?.id) return edge;
  const override = OBJECT_LABEL_OVERRIDES[node.id];
  if (override === undefined) return edge;
  return { ...candidate, node: { ...node, ...override } };
};

export const augmentObjectMetadataWithResearch = <
  TQuery extends ObjectMetadataQueryResult,
>(
  base: TQuery,
): TQuery => ({
  ...base,
  objects: {
    ...base.objects,
    edges: [
      ...base.objects.edges.map(applyObjectLabelOverride),
      ...buildResearchObjectEdges(),
    ],
  },
});

export const augmentViewsWithResearch = <TView>(
  baseViews: TView[],
): TView[] => [...baseViews, ...(buildResearchViews() as unknown as TView[])];

// The nav drawer filters items by `type` (OBJECT/VIEW/FOLDER/LINK/RECORD) and
// drops any without one. The static nav bundle is generated without `type`, so
// the whole Workspace section renders empty. Derive a `type` from the item's
// shape for every item that lacks one — this surfaces the research folder *and*
// the standard objects.
const deriveNavigationMenuItemType = <TItem>(item: TItem): TItem => {
  const candidate = item as Record<string, unknown>;
  if (typeof candidate.type === 'string' && candidate.type.length > 0) {
    return item;
  }
  let type: string | undefined;
  if (candidate.link) type = 'LINK';
  else if (candidate.targetRecordId) type = 'RECORD';
  else if (candidate.viewId) type = 'VIEW';
  else if (candidate.targetObjectMetadataId) type = 'OBJECT';
  else if (candidate.name) type = 'FOLDER';
  return { ...candidate, type } as TItem;
};

const navItemObjectId = <TItem>(item: TItem): string => {
  const candidate = item as Record<string, unknown>;
  return typeof candidate.targetObjectMetadataId === 'string'
    ? candidate.targetObjectMetadataId
    : '';
};

// Re-home or re-position a kept vanilla nav item per the research layout.
const applyNavReparenting = <TItem>(item: TItem): TItem => {
  const candidate = item as Record<string, unknown>;
  const objectId = navItemObjectId(item);
  const relocation = RELOCATED_NAV_ITEMS[objectId];
  if (relocation !== undefined) {
    return {
      ...candidate,
      folderId: relocation.folderId,
      position: relocation.position,
    } as TItem;
  }
  const itemId = typeof candidate.id === 'string' ? candidate.id : '';
  const reposition =
    REPOSITIONED_TOP_LEVEL[objectId] ?? REPOSITIONED_TOP_LEVEL[itemId];
  if (typeof reposition === 'number') {
    return { ...candidate, position: reposition } as TItem;
  }
  return item;
};

export const augmentNavigationMenuItemsWithResearch = <TItem>(
  baseItems: TItem[],
  options?: { workspaceMode?: WorkspaceMode },
): TItem[] =>
  [
    ...baseItems
      .filter((item) => !HIDDEN_NAV_OBJECT_IDS.has(navItemObjectId(item)))
      .map(applyNavReparenting),
    ...(buildResearchNavigationMenuItems(
      options?.workspaceMode,
    ) as unknown as TItem[]),
  ].map(deriveNavigationMenuItemType);

export { getResearchSeedRecords, getResearchStarterRecords };
