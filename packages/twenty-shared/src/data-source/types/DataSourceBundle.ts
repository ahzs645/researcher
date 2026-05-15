import { type DataSourceObject } from './DataSourceObject';

// The full set of objects (typically the 33 standard ones plus any custom
// objects) that the executable GraphQL schema and DataSource adapters need.
// `objectsById` and `objectsByNameSingular` are derived for fast resolver
// lookup — both adapters and resolvers should treat them as read-only.
export type DataSourceBundle = {
  objects: DataSourceObject[];
  objectsById: ReadonlyMap<string, DataSourceObject>;
  objectsByNameSingular: ReadonlyMap<string, DataSourceObject>;
  objectsByNamePlural: ReadonlyMap<string, DataSourceObject>;
};
