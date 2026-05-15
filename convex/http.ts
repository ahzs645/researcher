import { httpRouter } from 'convex/server';

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
} from './data-source';

// Routes that pair with `createConvexDataSource` (twenty-front side). The
// client POSTs a JSON body matching the DataSource method signature; the
// action runs against Convex's db directly.

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

export default http;
