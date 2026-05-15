import { useMemo, type ReactNode } from 'react';

import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';
import { InMemoryCache } from '@apollo/client';

import {
  getBridgeDataSource,
  getBridgeDataSourceBundle,
} from '@/local-db/data-source/buildBridgeDataSource';
import { createSchemaLink } from '@/local-db/data-source/createSchemaLink';
import { ApolloCoreClientContext } from '@/object-metadata/contexts/ApolloCoreClientContext';

// Mounts Apollo's core client (the /graphql data client) on a SchemaLink
// terminating transport backed by the bridge Dexie DataSource. Use in place
// of `ApolloCoreProvider` whenever the bridge is active — record queries +
// mutations then flow through the executable schema instead of MSW.
export const BridgeApolloCoreProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const terminatingLink = useMemo(() => {
    const bundle = getBridgeDataSourceBundle();
    const dataSource = getBridgeDataSource();
    return createSchemaLink({ bundle, dataSource });
  }, []);

  const apolloCoreClient = useApolloFactory({
    cache: new InMemoryCache({
      typePolicies: {
        RemoteTable: {
          keyFields: ['name'],
        },
      },
    }),
    terminatingLink,
  });

  return (
    <ApolloCoreClientContext.Provider value={apolloCoreClient}>
      {children}
    </ApolloCoreClientContext.Provider>
  );
};
