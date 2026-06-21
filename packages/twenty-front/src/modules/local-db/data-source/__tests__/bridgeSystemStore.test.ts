// Sets up an in-memory IndexedDB before importing Dexie consumers so the
// system Dexie database has a real backing store to talk to in jsdom.
import 'fake-indexeddb/auto';

import { getBridgeSystemDexie } from '@/local-db/data-source/bridgeSystemDexie';
import { __resetBridgeSystemSeedForTests } from '@/local-db/data-source/bridgeSystemSeed';
import {
  createApiKey,
  getApiKey,
  getApiKeys,
  getBridgeWorkspaceSetup,
  getCurrentUser,
  getNavigationMenuItems,
  getPageLayouts,
  getPublicWorkspaceDataByDomain,
  getViews,
  revokeApiKey,
  setBridgeWorkspaceSetup,
} from '@/local-db/data-source/bridgeSystemStore';

const resetDexie = async () => {
  // `fake-indexeddb/auto` registers a single in-memory backend across the
  // suite, so we need to wipe each Dexie table between tests to keep
  // singleton-row assumptions stable.
  const db = getBridgeSystemDexie();
  await Promise.all([
    db.user.clear(),
    db.workspace.clear(),
    db.workspaceMember.clear(),
    db.view.clear(),
    db.viewField.clear(),
    db.viewFilter.clear(),
    db.viewSort.clear(),
    db.viewGroup.clear(),
    db.viewFilterGroup.clear(),
    db.viewFieldGroup.clear(),
    db.publicWorkspaceData.clear(),
    db.navigationMenuItem.clear(),
    db.commandMenuItem.clear(),
    db.role.clear(),
    db.apiKey.clear(),
    db.webhook.clear(),
    db.pageLayout.clear(),
  ]);
};

describe('bridgeSystemStore', () => {
  beforeEach(async () => {
    await resetDexie();
    __resetBridgeSystemSeedForTests();
  });

  it('seeds and returns the current user via getCurrentUser', async () => {
    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect((user as Record<string, unknown>).email).toBe('charles@test.com');
    expect((user as Record<string, unknown>).currentWorkspace).toBeTruthy();
  });

  it('returns the seeded public workspace data', async () => {
    const data = await getPublicWorkspaceDataByDomain();
    expect((data as Record<string, unknown>).displayName).toBe('Twenty Eng');
  });

  it('returns seeded views rehydrated with viewFields', async () => {
    const views = await getViews();
    expect(views.length).toBeGreaterThan(0);
    const viewWithFields = views.find(
      (view) =>
        Array.isArray(view.viewFields) &&
        (view.viewFields as unknown[]).length > 0,
    );
    expect(viewWithFields).toBeTruthy();
  });

  it('filters views by type', async () => {
    const fieldsWidgetViews = await getViews({ type: 'FIELDS_WIDGET' });
    expect(
      fieldsWidgetViews.every((view) => view.type === 'FIELDS_WIDGET'),
    ).toBe(true);
  });

  it('returns navigation menu items', async () => {
    const items = await getNavigationMenuItems();
    expect(items.length).toBeGreaterThan(0);
  });

  it('returns an empty list of page layouts on first boot', async () => {
    const layouts = await getPageLayouts({ type: 'RECORD_PAGE' });
    expect(layouts).toEqual([]);
  });

  it('persists newly-created API keys', async () => {
    const initial = await getApiKeys();
    const created = await createApiKey({
      name: 'Bridge integration key',
      expiresAt: null,
      roleId: null,
    });
    const after = await getApiKeys();
    expect(after.length).toBe(initial.length + 1);
    expect((created as { id: string }).id).toBeTruthy();
    const fetched = await getApiKey((created as { id: string }).id);
    expect(fetched).toEqual(created);
  });

  it('reports an incomplete first-run setup on a fresh workspace', async () => {
    const setup = await getBridgeWorkspaceSetup();
    expect(setup).toEqual({ setupCompleted: false, workspaceMode: 'LAB' });
  });

  it('persists the chosen persona so setup no longer shows', async () => {
    await setBridgeWorkspaceSetup('SOLO');
    const setup = await getBridgeWorkspaceSetup();
    expect(setup).toEqual({ setupCompleted: true, workspaceMode: 'SOLO' });
  });

  it('marks an API key as revoked', async () => {
    const created = await createApiKey({
      name: 'Soon-revoked',
      expiresAt: null,
      roleId: null,
    });
    const revoked = await revokeApiKey((created as { id: string }).id);
    expect((revoked as Record<string, unknown>).revokedAt).toBeTruthy();
  });
});
