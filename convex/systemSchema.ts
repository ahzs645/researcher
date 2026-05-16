import { defineTable } from 'convex/server';
import { v } from 'convex/values';

// System entities — the user/workspace/view/role/apiKey/… surface that
// Apollo's metadata client asks about. Stored loosely (`v.any()` for nested
// blobs) so we don't have to model every Twenty type field-by-field. Each
// table has `id` as its application key + a `by_external_id` index that
// matches the records-side convention.

const loose = () => ({
  id: v.string(),
  body: v.any(),
});

const looseTable = () =>
  defineTable(loose()).index('by_external_id', ['id']);

// Some tables need a few indexed columns for direct lookups (viewField by
// viewId, etc.). The shape stays `body: any` for actual content.
const indexedLooseTable = (indexedColumn: string) =>
  defineTable({
    id: v.string(),
    body: v.any(),
    [indexedColumn]: v.optional(v.string()),
  })
    .index('by_external_id', ['id'])
    .index(`by_${indexedColumn}`, [indexedColumn]);

const publicWorkspaceDataTable = defineTable({
  subdomain: v.string(),
  body: v.any(),
}).index('by_subdomain', ['subdomain']);

export const systemTables = {
  bridgeUser: looseTable(),
  bridgeWorkspace: looseTable(),
  bridgeWorkspaceMember: looseTable(),
  bridgeView: defineTable({
    id: v.string(),
    body: v.any(),
    objectMetadataId: v.optional(v.string()),
    type: v.optional(v.string()),
    key: v.optional(v.string()),
  })
    .index('by_external_id', ['id'])
    .index('by_type', ['type'])
    .index('by_objectMetadataId', ['objectMetadataId']),
  bridgeViewField: indexedLooseTable('viewId'),
  bridgeViewFilter: indexedLooseTable('viewId'),
  bridgeViewSort: indexedLooseTable('viewId'),
  bridgeViewGroup: indexedLooseTable('viewId'),
  bridgeViewFilterGroup: indexedLooseTable('viewId'),
  bridgeViewFieldGroup: indexedLooseTable('viewId'),
  bridgePageLayout: defineTable({
    id: v.string(),
    body: v.any(),
    type: v.optional(v.string()),
  })
    .index('by_external_id', ['id'])
    .index('by_type', ['type']),
  bridgePageLayoutTab: indexedLooseTable('pageLayoutId'),
  bridgePageLayoutWidget: indexedLooseTable('pageLayoutTabId'),
  bridgeNavigationMenuItem: indexedLooseTable('applicationId'),
  bridgeCommandMenuItem: looseTable(),
  bridgeRole: looseTable(),
  bridgeApiKey: looseTable(),
  bridgeWebhook: looseTable(),
  bridgePublicWorkspaceData: publicWorkspaceDataTable,
  bridgeConnectedAccount: looseTable(),
  bridgeMessageChannel: looseTable(),
  bridgeCalendarChannel: looseTable(),
  bridgeFrontComponent: looseTable(),
  bridgeLogicFunction: looseTable(),
};
