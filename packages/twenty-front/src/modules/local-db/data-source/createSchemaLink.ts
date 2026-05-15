import { SchemaLink } from '@apollo/client/link/schema';

import {
  type DataSource,
  type DataSourceBundle,
  type DataSourceContext,
} from 'twenty-shared/data-source';

import { buildExecutableSchema } from './buildExecutableSchema';

// Mount the executable schema as an Apollo terminating link. The link runs
// the schema in-process, with `context.dataSource` supplied to every
// resolver. Use this in place of an HTTP link to point Apollo at a local
// Dexie / Convex DataSource without going through MSW.
export const createSchemaLink = ({
  bundle,
  dataSource,
  dataSourceContext,
}: {
  bundle: DataSourceBundle;
  dataSource: DataSource;
  dataSourceContext?: DataSourceContext;
}) => {
  const schema = buildExecutableSchema(bundle);
  return new SchemaLink({
    schema,
    context: () => ({
      dataSource,
      dataSourceContext: dataSourceContext ?? {},
    }),
  });
};
