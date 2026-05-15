import { graphql, http, HttpResponse } from 'msw';

import {
  graphqlRecordMocks,
  graphqlSystemMocks,
  metadataGraphql,
} from '~/testing/graphqlMocks';
import { mockedClientConfig } from '~/testing/mock-data/config';
import { mockedPublicWorkspaceDataBySubdomain } from '~/testing/mock-data/publicWorkspaceDataBySubdomain';
import { mockedUserData } from '~/testing/mock-data/users';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Bridge MSW handlers, narrowed to the metadata + auxiliary endpoints that
// don't flow through the executable schema / SchemaLink. Record-level data
// (FindMany<Object>, CreateOne<Object>, etc.) is now served by the Apollo
// core client wired to a Dexie DataSource via `BridgeApolloCoreProvider`.
//
// Anything in here is fair game to remove once the metadata Apollo client
// also routes through the executable schema.

export const localTwentyGraphqlMocks = {
  handlers: [
    // Static file proxies — Twenty's UI hits these for avatars / attachments.
    http.get(`${REACT_APP_SERVER_BASE_URL}/files/*`, () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('http://localhost:3000/files/*', () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('https://twenty-icons.com/*', () => {
      return new HttpResponse(null, { status: 204 });
    }),
    // Client config — frontend depends on this before anything else mounts.
    http.get(`${REACT_APP_SERVER_BASE_URL}/client-config`, () => {
      return HttpResponse.json({
        ...mockedClientConfig,
        sentry: {
          dsn: null,
          release: null,
          environment: null,
        },
      });
    }),
    // Bridge-mode workspace metadata: serve the public workspace data and the
    // current user / connected accounts directly without going through any
    // real backend.
    metadataGraphql.query('GetPublicWorkspaceDataByDomain', () => {
      return HttpResponse.json({
        data: {
          getPublicWorkspaceDataByDomain: {
            ...mockedPublicWorkspaceDataBySubdomain,
            logo: null,
          },
        },
      });
    }),
    graphql.query('GetCurrentUser', () => {
      return HttpResponse.json({
        data: {
          currentUser: {
            ...mockedUserData,
            currentWorkspace: {
              ...mockedUserData.currentWorkspace,
              logo: null,
            },
          },
        },
      });
    }),
    graphql.query('FindOneWorkspaceMember', () => {
      return HttpResponse.json({
        data: {
          workspaceMember: null,
        },
      });
    }),
    metadataGraphql.query('MyConnectedAccounts', () => {
      return HttpResponse.json({
        data: {
          myConnectedAccounts: [],
        },
      });
    }),
    metadataGraphql.query('MyMessageChannels', () => {
      return HttpResponse.json({
        data: {
          myMessageChannels: [],
        },
      });
    }),
    metadataGraphql.query('MyCalendarChannels', () => {
      return HttpResponse.json({
        data: {
          myCalendarChannels: [],
        },
      });
    }),
    metadataGraphql.query('FindManyFrontComponents', () => {
      return HttpResponse.json({
        data: {
          frontComponents: [],
        },
      });
    }),
    // System + record mocks reused from twenty-front's storybook setup. Most
    // of these will be replaced once the metadata Apollo client also routes
    // through the executable schema.
    ...graphqlSystemMocks.handlers,
    ...graphqlRecordMocks.handlers,
  ],
};
