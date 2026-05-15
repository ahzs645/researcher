import { ApolloProvider as ApolloProviderBase } from '@apollo/client/react';

import { useApolloFactory } from '@/apollo/hooks/useApolloFactory';
import { bridgeMetadataMockLink } from '@/local-db/data-source/bridgeMetadataMockLink';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Drop-in replacement for the production `ApolloProvider` used when the bridge
// is active. Instead of mounting an HTTP terminating link aimed at
// `/metadata` (and relying on MSW to intercept), this provider wires a plain
// `ApolloLink` that synthesises responses for known metadata + auth queries
// in-process. The `uri` is kept so any HTTP-shaped fallbacks (e.g. token
// refresh) point at the same address MSW would have intercepted.
export const BridgeApolloMetadataProvider = ({
  children,
}: React.PropsWithChildren) => {
  const apolloClient = useApolloFactory({
    uri: `${REACT_APP_SERVER_BASE_URL}/metadata`,
    terminatingLink: bridgeMetadataMockLink,
  });

  if (process.env.NODE_ENV === 'development') {
    window.__APOLLO_CLIENT__ = apolloClient;
  }

  return (
    <ApolloProviderBase client={apolloClient}>{children}</ApolloProviderBase>
  );
};
