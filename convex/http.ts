import { httpAction } from './_generated/server';
import { httpRouter } from 'convex/server';
import { preflightResponse } from './bridgeAuth';
import { pullSourceHttpAction } from './grantDiscovery';

import {
  aggregateAction,
  createOneAction,
  deleteOneAction,
  destroyOneAction,
  findDuplicatesAction,
  findManyAction,
  findOneAction,
  restoreManyAction,
  searchAction,
  updateOneAction,
} from './dataSource';
import {
  assignRoleToApiKeyAction,
  createApiKeyAction,
  getApiKeyAction,
  getApiKeysAction,
  getCalendarChannelsAction,
  getCommandMenuItemsAction,
  getConnectedAccountsAction,
  getCurrentUserAction,
  getCurrentWorkspaceMemberAction,
  getFrontComponentsAction,
  getLogicFunctionsAction,
  getMessageChannelsAction,
  getNavigationMenuItemsAction,
  getPageLayoutsAction,
  getPublicWorkspaceDataByDomainAction,
  getRolesAction,
  getViewsAction,
  getWebhookAction,
  getWebhooksAction,
  revokeApiKeyAction,
  seedAction,
  updateApiKeyAction,
} from './systemSource';

// Routes that pair with `createConvexDataSource` (twenty-front side). The
// client POSTs a JSON body matching the DataSource method signature; the
// action runs against Convex's db directly. `/system-source/*` routes mirror
// the records pattern for the bridge's metadata-store (user/workspace/view/
// apiKey/etc.) — see `convex/systemSource.ts`.

const http = httpRouter();

http.route({
  path: '/data-source/findMany',
  method: 'POST',
  handler: findManyAction,
});
http.route({
  path: '/data-source/findOne',
  method: 'POST',
  handler: findOneAction,
});
http.route({
  path: '/data-source/findDuplicates',
  method: 'POST',
  handler: findDuplicatesAction,
});
http.route({
  path: '/data-source/createOne',
  method: 'POST',
  handler: createOneAction,
});
http.route({
  path: '/data-source/updateOne',
  method: 'POST',
  handler: updateOneAction,
});
http.route({
  path: '/data-source/deleteOne',
  method: 'POST',
  handler: deleteOneAction,
});
http.route({
  path: '/data-source/destroyOne',
  method: 'POST',
  handler: destroyOneAction,
});
http.route({
  path: '/data-source/restoreMany',
  method: 'POST',
  handler: restoreManyAction,
});
http.route({
  path: '/data-source/aggregate',
  method: 'POST',
  handler: aggregateAction,
});
http.route({
  path: '/data-source/search',
  method: 'POST',
  handler: searchAction,
});

http.route({
  path: '/grant-discovery/pull-source',
  method: 'POST',
  handler: pullSourceHttpAction,
});

// --- System source routes (Apollo metadata client) ---

const systemRoutes: Array<[string, typeof seedAction]> = [
  ['/system-source/seed', seedAction],
  ['/system-source/getCurrentUser', getCurrentUserAction],
  [
    '/system-source/getPublicWorkspaceDataByDomain',
    getPublicWorkspaceDataByDomainAction,
  ],
  [
    '/system-source/getCurrentWorkspaceMember',
    getCurrentWorkspaceMemberAction,
  ],
  ['/system-source/getViews', getViewsAction],
  ['/system-source/getPageLayouts', getPageLayoutsAction],
  ['/system-source/getNavigationMenuItems', getNavigationMenuItemsAction],
  ['/system-source/getCommandMenuItems', getCommandMenuItemsAction],
  ['/system-source/getRoles', getRolesAction],
  ['/system-source/getApiKeys', getApiKeysAction],
  ['/system-source/getApiKey', getApiKeyAction],
  ['/system-source/getWebhooks', getWebhooksAction],
  ['/system-source/getWebhook', getWebhookAction],
  ['/system-source/getConnectedAccounts', getConnectedAccountsAction],
  ['/system-source/getMessageChannels', getMessageChannelsAction],
  ['/system-source/getCalendarChannels', getCalendarChannelsAction],
  ['/system-source/getFrontComponents', getFrontComponentsAction],
  ['/system-source/getLogicFunctions', getLogicFunctionsAction],
  ['/system-source/createApiKey', createApiKeyAction],
  ['/system-source/updateApiKey', updateApiKeyAction],
  ['/system-source/revokeApiKey', revokeApiKeyAction],
  ['/system-source/assignRoleToApiKey', assignRoleToApiKeyAction],
];

for (const [path, handler] of systemRoutes) {
  http.route({ path, method: 'POST', handler });
}

// CORS preflight — Convex's httpRouter wants exact-path routes, so register an
// OPTIONS handler on every POST path so browsers can complete the preflight
// before sending the JSON POST. The response echoes the origin only if it's
// in the bridge's allowlist (`bridgeAuth.preflightResponse`).
const preflightHandler = httpAction(async (_ctx, request) =>
  preflightResponse(request),
);

const corsPaths = [
  '/data-source/findMany',
  '/data-source/findOne',
  '/data-source/findDuplicates',
  '/data-source/createOne',
  '/data-source/updateOne',
  '/data-source/deleteOne',
  '/data-source/destroyOne',
  '/data-source/restoreMany',
  '/data-source/aggregate',
  '/data-source/search',
  '/grant-discovery/pull-source',
  ...systemRoutes.map(([path]) => path),
];

for (const path of corsPaths) {
  http.route({ path, method: 'OPTIONS', handler: preflightHandler });
}

export default http;
