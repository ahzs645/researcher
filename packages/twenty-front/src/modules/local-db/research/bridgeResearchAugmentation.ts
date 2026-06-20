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

export const augmentNavigationMenuItemsWithResearch = <TItem>(
  baseItems: TItem[],
): TItem[] => [
  ...baseItems,
  ...(buildResearchNavigationMenuItems() as unknown as TItem[]),
];

export { getResearchSeedRecords };
