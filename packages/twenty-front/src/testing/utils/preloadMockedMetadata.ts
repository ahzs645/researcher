import { splitObjectMetadataGqlResponse } from '@/metadata-store/utils/splitObjectMetadataGqlResponse';
import { splitViewWithRelated } from '@/metadata-store/utils/splitViewWithRelated';
import {
  augmentNavigationMenuItemsWithResearch,
  augmentObjectMetadataWithResearch,
  augmentViewsWithResearch,
} from '@/local-db/research/bridgeResearchAugmentation';
import { type WorkspaceMode } from '@/local-db/research/researchObjectModel';

import { type FlatFieldMetadataItem } from '@/metadata-store/types/FlatFieldMetadataItem';
import { type FlatIndexMetadataItem } from '@/metadata-store/types/FlatIndexMetadataItem';
import { type FlatObjectMetadataItem } from '@/metadata-store/types/FlatObjectMetadataItem';
import { type FlatView } from '@/metadata-store/types/FlatView';
import { type FlatViewField } from '@/metadata-store/types/FlatViewField';
import { type FlatViewFieldGroup } from '@/metadata-store/types/FlatViewFieldGroup';
import { type FlatViewFilter } from '@/metadata-store/types/FlatViewFilter';
import { type FlatViewFilterGroup } from '@/metadata-store/types/FlatViewFilterGroup';
import { type FlatViewGroup } from '@/metadata-store/types/FlatViewGroup';
import { type FlatViewSort } from '@/metadata-store/types/FlatViewSort';
import { type NavigationMenuItem } from '~/generated-metadata/graphql';

export type PreloadedMockedMetadata = {
  flatObjects: FlatObjectMetadataItem[];
  flatFields: FlatFieldMetadataItem[];
  flatIndexes: FlatIndexMetadataItem[];
  flatViews: FlatView[];
  flatViewFields: FlatViewField[];
  flatViewFilters: FlatViewFilter[];
  flatViewSorts: FlatViewSort[];
  flatViewGroups: FlatViewGroup[];
  flatViewFilterGroups: FlatViewFilterGroup[];
  flatViewFieldGroups: FlatViewFieldGroup[];
  navigationMenuItems: NavigationMenuItem[];
};

export const preloadMockedMetadata = async (
  options: { workspaceMode?: WorkspaceMode } = {},
): Promise<PreloadedMockedMetadata> => {
  const [
    { mockedStandardObjectMetadataQueryResult },
    { mockedViews },
    { mockedNavigationMenuItems },
  ] = await Promise.all([
    import(
      '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata'
    ),
    import('~/testing/mock-data/generated/metadata/views/mock-views-data'),
    import(
      '~/testing/mock-data/generated/metadata/navigation-menu-items/mock-navigation-menu-items-data'
    ),
  ]);

  // Graft the research objects onto the same metadata the Jotai store loads,
  // so the router, navigation, and record pages know about them (the bridge
  // metadata store is fed from here, not from the Apollo mock link).
  const { flatObjects, flatFields, flatIndexes } =
    splitObjectMetadataGqlResponse(
      augmentObjectMetadataWithResearch(
        mockedStandardObjectMetadataQueryResult,
      ),
    );

  const {
    flatViews,
    flatViewFields,
    flatViewFilters,
    flatViewSorts,
    flatViewGroups,
    flatViewFilterGroups,
    flatViewFieldGroups,
  } = splitViewWithRelated(augmentViewsWithResearch(mockedViews));

  return {
    flatObjects,
    flatFields,
    flatIndexes,
    flatViews,
    flatViewFields,
    flatViewFilters,
    flatViewSorts,
    flatViewGroups,
    flatViewFilterGroups,
    flatViewFieldGroups,
    navigationMenuItems: augmentNavigationMenuItemsWithResearch(
      mockedNavigationMenuItems,
      { workspaceMode: options.workspaceMode },
    ),
  };
};
