import { filterAndSortNavigationMenuItems } from '@/navigation-menu-item/common/utils/filterAndSortNavigationMenuItems';
import { isNavigationMenuItemFolder } from '@/navigation-menu-item/common/utils/isNavigationMenuItemFolder';

import { augmentNavigationMenuItemsWithResearch } from '../bridgeResearchAugmentation';
import { getResearchObjectId } from '../researchMetadataBuilder';
import { RESEARCH_OBJECT_SPECS } from '../researchObjectModel';

// The nav drawer drops any item without a `type`; the generated bundle has none,
// which emptied the Workspace section. These guard the fix: research items get a
// type, and they survive filterAndSortNavigationMenuItems.

const researchObjectMetadataItems = RESEARCH_OBJECT_SPECS.map((spec) => ({
  id: getResearchObjectId(spec.nameSingular),
  isActive: true,
}));

describe('research navigation menu items', () => {
  const augmented = augmentNavigationMenuItemsWithResearch<
    Record<string, unknown>
  >([]);

  it('tags the Research folder as FOLDER and objects as OBJECT', () => {
    const folder = augmented.find((item) => item.name === 'Research');
    expect(folder).toBeDefined();
    expect(folder?.type).toBe('FOLDER');
    expect(isNavigationMenuItemFolder(folder as never)).toBe(true);

    const objectItems = augmented.filter((item) =>
      Boolean(item.targetObjectMetadataId),
    );
    expect(objectItems).toHaveLength(RESEARCH_OBJECT_SPECS.length);
    expect(objectItems.every((item) => item.type === 'OBJECT')).toBe(true);
  });

  it('derives a type for base items that lack one', () => {
    const withBase = augmentNavigationMenuItemsWithResearch<
      Record<string, unknown>
    >([{ id: 'x', targetObjectMetadataId: 'abc' }]);
    const derived = withBase.find((item) => item.id === 'x');
    expect(derived?.type).toBe('OBJECT');
  });

  it('keeps the research folder + objects through the drawer filter', () => {
    const kept = filterAndSortNavigationMenuItems(
      augmented as never,
      [],
      researchObjectMetadataItems as never,
    );
    // 12 objects + 1 folder all survive (folder by type, objects by active meta).
    expect(kept).toHaveLength(RESEARCH_OBJECT_SPECS.length + 1);
    expect(
      kept.some((item) => (item as { name?: string }).name === 'Research'),
    ).toBe(true);
    const grantObjectId = getResearchObjectId('grant');
    expect(
      kept.some(
        (item) =>
          (item as { targetObjectMetadataId?: string })
            .targetObjectMetadataId === grantObjectId,
      ),
    ).toBe(true);
  });
});
