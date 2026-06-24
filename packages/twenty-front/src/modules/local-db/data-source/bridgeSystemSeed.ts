import { isDefined } from 'twenty-shared/utils';

import { splitViewWithRelated } from '@/metadata-store/utils/splitViewWithRelated';
import {
  BRIDGE_SYSTEM_KEYS,
  getBridgeSystemDexie,
} from '@/local-db/data-source/bridgeSystemDexie';
import {
  augmentNavigationMenuItemsWithResearch,
  augmentViewsWithResearch,
} from '@/local-db/research/bridgeResearchAugmentation';
import { type WorkspaceMode } from '@/local-db/research/researchObjectModel';
import { mockedApiKeys } from '~/testing/mock-data/generated/metadata/api-keys/mock-api-keys-data';
import { mockedBackendCommandMenuItems } from '~/testing/mock-data/command-menu-items';
import { mockedNavigationMenuItems } from '~/testing/mock-data/generated/metadata/navigation-menu-items/mock-navigation-menu-items-data';
import { mockedPublicWorkspaceDataBySubdomain } from '~/testing/mock-data/publicWorkspaceDataBySubdomain';
import { mockedRoles } from '~/testing/mock-data/generated/metadata/roles/mock-roles-data';
import { mockedUserData } from '~/testing/mock-data/users';
import { mockedViews } from '~/testing/mock-data/generated/metadata/views/mock-views-data';

// One-shot seed for the bridge's system Dexie database. Mirrors the records
// seeding: probe a representative table; if empty, populate everything from
// Twenty's mock-data fixtures. Subsequent boots leave the persisted state
// alone so mutations (CreateApiKey, RevokeApiKey, …) survive reload.

// Bump when the nav layout changes (folders, hidden demo objects, repurposed
// CRM, the Discovery link) so already-seeded visitors rebuild their nav. See
// `migrateNavLayout`.
//   3 → 4  applicantProfile (Lab) + applicationSection / reusableAnswer (Funding)
//   4 → 5  manuscript authoring objects (Work) + the Compose link
//   5 → 6  obligations tracker objects (Work) + the "My obligations" link
//   6 → 7  solo researcher nav hides lab-admin objects and renames Lab
const BRIDGE_NAV_LAYOUT_VERSION = 7;

// Default workspace persona until the first-run setup chooses one.
const DEFAULT_WORKSPACE_MODE: WorkspaceMode = 'LAB';

let seedPromise: Promise<void> | undefined;

const seed = async (): Promise<void> => {
  const db = getBridgeSystemDexie();

  const userCount = await db.user.count();
  if (userCount > 0) return;

  // Singleton user / workspace / workspaceMember — store under stable sentinel
  // ids so the singleton resolvers can fetch without ID parameters.
  const userRecord = {
    ...mockedUserData,
    id: BRIDGE_SYSTEM_KEYS.USER,
  } as { id: string } & Record<string, unknown>;

  const workspaceRecord = isDefined(mockedUserData.currentWorkspace)
    ? {
        ...(mockedUserData.currentWorkspace as Record<string, unknown>),
        id:
          (mockedUserData.currentWorkspace as { id?: string }).id ??
          BRIDGE_SYSTEM_KEYS.WORKSPACE,
        // Re-skin the default CRM workspace as a research workspace.
        displayName: 'Research Workspace',
        navLayoutVersion: BRIDGE_NAV_LAYOUT_VERSION,
        workspaceMode: DEFAULT_WORKSPACE_MODE,
        setupCompleted: false,
      }
    : {
        id: BRIDGE_SYSTEM_KEYS.WORKSPACE,
        navLayoutVersion: BRIDGE_NAV_LAYOUT_VERSION,
        workspaceMode: DEFAULT_WORKSPACE_MODE,
        setupCompleted: false,
      };

  const workspaceMemberRecord = mockedUserData.workspaceMember
    ? {
        ...(mockedUserData.workspaceMember as Record<string, unknown>),
        id:
          (mockedUserData.workspaceMember as { id?: string }).id ??
          'bridge-workspace-member',
      }
    : null;

  await db.user.put(userRecord);
  await db.workspace.put(workspaceRecord);
  if (workspaceMemberRecord) {
    await db.workspaceMember.put(workspaceMemberRecord);
  }

  // PublicWorkspaceData keyed by `subdomain` so multiple workspaces could
  // coexist; the bridge has one, but the schema is flexible.
  await db.publicWorkspaceData.put({
    ...(mockedPublicWorkspaceDataBySubdomain as Record<string, unknown>),
    subdomain: BRIDGE_SYSTEM_KEYS.PUBLIC_WORKSPACE_DOMAIN,
  });

  // Flatten views into their related entities using the same helper the Jotai
  // metadata store uses. This keeps representation consistent across both
  // paths (Apollo metadata-client + Jotai metadata-store).
  const {
    flatViews,
    flatViewFields,
    flatViewFilters,
    flatViewSorts,
    flatViewGroups,
    flatViewFilterGroups,
    flatViewFieldGroups,
  } = splitViewWithRelated(augmentViewsWithResearch(mockedViews));

  await db.view.bulkPut(flatViews as { id: string }[]);
  await db.viewField.bulkPut(
    flatViewFields as ({ id: string; viewId: string } & Record<
      string,
      unknown
    >)[],
  );
  await db.viewFilter.bulkPut(
    flatViewFilters as ({ id: string; viewId: string } & Record<
      string,
      unknown
    >)[],
  );
  await db.viewSort.bulkPut(
    flatViewSorts as ({ id: string; viewId: string } & Record<
      string,
      unknown
    >)[],
  );
  await db.viewGroup.bulkPut(
    flatViewGroups as ({ id: string; viewId: string } & Record<
      string,
      unknown
    >)[],
  );
  await db.viewFilterGroup.bulkPut(
    flatViewFilterGroups as ({ id: string } & Record<string, unknown>)[],
  );
  await db.viewFieldGroup.bulkPut(
    flatViewFieldGroups as ({ id: string } & Record<string, unknown>)[],
  );

  await db.navigationMenuItem.bulkPut(
    augmentNavigationMenuItemsWithResearch(mockedNavigationMenuItems).map(
      (item) => item as { id: string },
    ),
  );
  await db.commandMenuItem.bulkPut(
    mockedBackendCommandMenuItems as { id: string }[],
  );

  await db.role.bulkPut(mockedRoles as { id: string }[]);
  await db.apiKey.bulkPut(mockedApiKeys as { id: string }[]);

  // PageLayouts / Webhooks / ConnectedAccounts / MessageChannels /
  // CalendarChannels / FrontComponents / LogicFunctions all start empty.
  // The bridge's settings pages mutate these directly; first read returns [].
};

// Re-skin the nav for returning visitors. The one-shot `seed` above only runs on
// a fresh database, so when the nav layout changes we bump
// BRIDGE_NAV_LAYOUT_VERSION and rebuild just the navigationMenuItem table from
// the current augmentation. This resets nav customizations — acceptable while
// the layout is still evolving — and is a no-op once versions match.
const writeNavForMode = async (workspaceMode: WorkspaceMode): Promise<void> => {
  const db = getBridgeSystemDexie();
  const navItems = augmentNavigationMenuItemsWithResearch(
    mockedNavigationMenuItems,
    { workspaceMode },
  ).map((item) => item as { id: string });
  await db.navigationMenuItem.clear();
  await db.navigationMenuItem.bulkPut(navItems);
};

const migrateNavLayout = async (): Promise<void> => {
  const db = getBridgeSystemDexie();
  const workspaces = await db.workspace.toArray();
  const workspace = workspaces[0] as
    | ({
        id: string;
        navLayoutVersion?: number;
        workspaceMode?: WorkspaceMode;
      } & Record<string, unknown>)
    | undefined;
  if (!workspace) return;
  if (workspace.navLayoutVersion === BRIDGE_NAV_LAYOUT_VERSION) return;

  await writeNavForMode(workspace.workspaceMode ?? DEFAULT_WORKSPACE_MODE);
  await db.workspace.update(workspace.id, {
    navLayoutVersion: BRIDGE_NAV_LAYOUT_VERSION,
  });
};

// Rebuild the nav for a chosen persona (called when first-run setup picks a
// mode). Returning visitors keep their mode because `migrateNavLayout` reads it
// back from the persisted workspace record.
export const rebuildBridgeNavForMode = async (
  workspaceMode: WorkspaceMode,
): Promise<void> => {
  await ensureBridgeSystemSeeded();
  await writeNavForMode(workspaceMode);
};

const seedAndMigrate = async (): Promise<void> => {
  await seed();
  await migrateNavLayout();
};

export const ensureBridgeSystemSeeded = (): Promise<void> => {
  if (seedPromise === undefined) {
    seedPromise = seedAndMigrate();
  }
  return seedPromise;
};

// Test-only: reset the cached seed promise so a subsequent `ensureBridge…`
// call re-runs the seed. Pairs with manual `db.<table>.clear()` between tests
// so the suite can re-validate first-boot behaviour.
export const __resetBridgeSystemSeedForTests = (): void => {
  seedPromise = undefined;
};
