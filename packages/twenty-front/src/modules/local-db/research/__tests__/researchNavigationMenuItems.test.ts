import { filterAndSortNavigationMenuItems } from '@/navigation-menu-item/common/utils/filterAndSortNavigationMenuItems';
import { isNavigationMenuItemFolder } from '@/navigation-menu-item/common/utils/isNavigationMenuItemFolder';

import {
  augmentNavigationMenuItemsWithResearch,
  augmentObjectMetadataWithResearch,
} from '@/local-db/research/bridgeResearchAugmentation';
import {
  RESEARCH_NAV_FOLDER_IDS,
  getResearchObjectId,
} from '@/local-db/research/researchMetadataBuilder';
import { RESEARCH_OBJECT_SPECS } from '@/local-db/research/researchObjectModel';

// The nav drawer drops any item without a `type`; the generated bundle has none,
// which emptied the Workspace section. These guard the research re-skin: research
// items get a type and group under four folders, pure-demo objects are hidden,
// and the repurposed CRM objects (People/Companies/Tasks/Notes) are re-homed.

// A few vanilla object ids the re-skin acts on (kept in sync with the
// augmentation module — duplicated here so the test fails loudly if they drift).
const VANILLA = {
  company: '29a80d39-c931-4ed2-8ae7-8eac638f7f95',
  person: '2e0d7477-8143-4d8f-bc36-2b4f92cbd101',
  task: '34ac72b8-0aaa-4c01-b8a8-8390415fdf8a',
  rocket: '6934bd29-d89d-479e-8b32-f4f3a9af19b6',
  pet: '4646d650-bc55-42f2-9544-4c804c6616a0',
};

const researchObjectMetadataItems = RESEARCH_OBJECT_SPECS.map((spec) => ({
  id: getResearchObjectId(spec.nameSingular),
  isActive: true,
}));

describe('research navigation menu items', () => {
  const augmented = augmentNavigationMenuItemsWithResearch<
    Record<string, unknown>
  >([]);

  it('groups research objects under the Lab/Work/Funding/Discovery folders', () => {
    const folders = augmented.filter((item) => item.type === 'FOLDER');
    expect(folders.map((folder) => folder.name)).toEqual(
      expect.arrayContaining(['Lab', 'Work', 'Funding', 'Discovery']),
    );
    expect(folders).toHaveLength(Object.keys(RESEARCH_NAV_FOLDER_IDS).length);
    folders.forEach((folder) =>
      expect(isNavigationMenuItemFolder(folder as never)).toBe(true),
    );

    const objectItems = augmented.filter((item) =>
      Boolean(item.targetObjectMetadataId),
    );
    expect(objectItems).toHaveLength(RESEARCH_OBJECT_SPECS.length);
    expect(objectItems.every((item) => item.type === 'OBJECT')).toBe(true);

    const folderIds = new Set(Object.values(RESEARCH_NAV_FOLDER_IDS));
    expect(
      objectItems.every((item) => folderIds.has(item.folderId as string)),
    ).toBe(true);
  });

  it('derives a type for base items that lack one', () => {
    const withBase = augmentNavigationMenuItemsWithResearch<
      Record<string, unknown>
    >([{ id: 'x', targetObjectMetadataId: 'abc' }]);
    const derived = withBase.find((item) => item.id === 'x');
    expect(derived?.type).toBe('OBJECT');
  });

  it('hides pure-demo objects and re-homes the repurposed CRM objects', () => {
    const base = [
      { id: 'n-company', targetObjectMetadataId: VANILLA.company },
      { id: 'n-person', targetObjectMetadataId: VANILLA.person },
      { id: 'n-task', targetObjectMetadataId: VANILLA.task },
      { id: 'n-rocket', targetObjectMetadataId: VANILLA.rocket },
      { id: 'n-pet', targetObjectMetadataId: VANILLA.pet },
    ];
    const augmentedWithBase =
      augmentNavigationMenuItemsWithResearch<Record<string, unknown>>(base);

    // Pure-demo objects dropped.
    expect(augmentedWithBase.some((item) => item.id === 'n-rocket')).toBe(
      false,
    );
    expect(augmentedWithBase.some((item) => item.id === 'n-pet')).toBe(false);

    // People → Lab, Companies → Lab, Tasks → Work.
    expect(
      augmentedWithBase.find((item) => item.id === 'n-person')?.folderId,
    ).toBe(RESEARCH_NAV_FOLDER_IDS.LAB);
    expect(
      augmentedWithBase.find((item) => item.id === 'n-company')?.folderId,
    ).toBe(RESEARCH_NAV_FOLDER_IDS.LAB);
    expect(
      augmentedWithBase.find((item) => item.id === 'n-task')?.folderId,
    ).toBe(RESEARCH_NAV_FOLDER_IDS.WORK);
  });

  it('adds the internal "Find grants" Discovery link', () => {
    const link = augmented.find((item) => item.name === 'Find grants');
    expect(link).toBeDefined();
    expect(link?.type).toBe('LINK');
    expect(link?.link).toBe('/discovery');
    expect(link?.folderId).toBe(RESEARCH_NAV_FOLDER_IDS.DISCOVERY);
  });

  it('tailors lab administration out of solo mode', () => {
    const soloItems = augmentNavigationMenuItemsWithResearch<
      Record<string, unknown>
    >([], { workspaceMode: 'SOLO' });
    const hiddenObjectIds = [
      'researchTeam',
      'researcher',
      'applicantProfile',
      'projectMembership',
    ].map(getResearchObjectId);
    const soloObjectItems = soloItems.filter((item) =>
      Boolean(item.targetObjectMetadataId),
    );
    expect(soloObjectItems).toHaveLength(
      RESEARCH_OBJECT_SPECS.length - hiddenObjectIds.length,
    );
    for (const objectId of hiddenObjectIds) {
      expect(
        soloItems.some((item) => item.targetObjectMetadataId === objectId),
      ).toBe(false);
      expect(
        augmented.some((item) => item.targetObjectMetadataId === objectId),
      ).toBe(true);
    }
    expect(
      soloItems.some((item) => item.type === 'FOLDER' && item.name === 'Lab'),
    ).toBe(false);
    expect(
      soloItems.some(
        (item) => item.type === 'FOLDER' && item.name === 'My research',
      ),
    ).toBe(true);
  });

  it('keeps the research folders + objects + link through the drawer filter', () => {
    const kept = filterAndSortNavigationMenuItems(
      augmented as never,
      [],
      researchObjectMetadataItems as never,
    );
    const folderCount = Object.keys(RESEARCH_NAV_FOLDER_IDS).length;
    // all research objects + the four folders + the Discovery, Compose &
    // Obligations links.
    expect(kept).toHaveLength(RESEARCH_OBJECT_SPECS.length + folderCount + 3);
    expect(
      kept.some((item) => (item as { name?: string }).name === 'Funding'),
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

describe('research object metadata re-skin', () => {
  it('relabels People as Collaborators and Companies as Institutions', () => {
    const base = {
      objects: {
        edges: [
          {
            node: {
              id: VANILLA.person,
              labelSingular: 'Person',
              labelPlural: 'People',
            },
          },
          {
            node: {
              id: VANILLA.company,
              labelSingular: 'Company',
              labelPlural: 'Companies',
            },
          },
          { node: { id: 'untouched', labelPlural: 'Untouched' } },
        ],
      },
    };

    const augmented = augmentObjectMetadataWithResearch(base as never) as {
      objects: { edges: { node: { id: string; labelPlural: string } }[] };
    };
    const edges = augmented.objects.edges;

    expect(
      edges.find((edge) => edge.node.id === VANILLA.person)?.node.labelPlural,
    ).toBe('Collaborators');
    expect(
      edges.find((edge) => edge.node.id === VANILLA.company)?.node.labelPlural,
    ).toBe('Institutions');
    // Non-repurposed objects pass through untouched.
    expect(
      edges.find((edge) => edge.node.id === 'untouched')?.node.labelPlural,
    ).toBe('Untouched');
    // Research object edges are still appended.
    expect(edges.length).toBeGreaterThan(base.objects.edges.length);
  });
});
