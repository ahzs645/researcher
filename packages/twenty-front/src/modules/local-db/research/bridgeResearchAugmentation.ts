import {
  buildResearchNavigationMenuItems,
  buildResearchObjectEdges,
  buildResearchViews,
} from './researchMetadataBuilder';
import { getResearchSeedRecords } from './researchSeedRecords';

// Single integration point that grafts the research object model onto the
// bridge's static metadata. The standard 33-object bundle, generated views,
// and generated navigation items stay untouched and regenerable — research
// objects are appended at the three places the bridge reads them:
//   - object metadata   → buildBridgeDataSource + bridgeMetadataMockLink
//   - views             → bridgeSystemSeed
//   - navigation items  → bridgeSystemSeed

type ObjectMetadataQueryResult = {
  objects: {
    edges: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export const augmentObjectMetadataWithResearch = <
  TQuery extends ObjectMetadataQueryResult,
>(
  base: TQuery,
): TQuery => ({
  ...base,
  objects: {
    ...base.objects,
    edges: [...base.objects.edges, ...buildResearchObjectEdges()],
  },
});

export const augmentViewsWithResearch = <TView>(baseViews: TView[]): TView[] => [
  ...baseViews,
  ...(buildResearchViews() as unknown as TView[]),
];

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

export const augmentNavigationMenuItemsWithResearch = <TItem>(
  baseItems: TItem[],
): TItem[] =>
  [
    ...baseItems,
    ...(buildResearchNavigationMenuItems() as unknown as TItem[]),
  ].map(deriveNavigationMenuItemType);

export { getResearchSeedRecords };
