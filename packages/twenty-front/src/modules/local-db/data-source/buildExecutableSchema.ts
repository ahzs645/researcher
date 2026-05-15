import { makeExecutableSchema } from '@graphql-tools/schema';
import { type GraphQLSchema } from 'graphql';

import { type DataSourceBundle, generateSdl } from 'twenty-shared/data-source';

import { buildResolvers } from './buildResolvers';

// Pin the executable schema for a given bundle. Tests and the SchemaLink
// bridge call this once at startup; subsequent operations run through the
// schema's resolvers, which delegate to `context.dataSource`.
export const buildExecutableSchema = (
  bundle: DataSourceBundle,
): GraphQLSchema => {
  const sdl = generateSdl(bundle);
  const resolvers = buildResolvers(bundle);

  return makeExecutableSchema({
    typeDefs: sdl,
    resolvers: resolvers as never,
  });
};
