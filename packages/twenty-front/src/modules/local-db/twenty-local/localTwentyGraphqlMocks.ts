import { http, HttpResponse } from 'msw';

import { bridgeClientConfig } from '@/local-db/data-source/bridgeMetadataMockLink';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

// Bridge MSW handlers narrowed to plain HTTP fetches that the GraphQL Apollo
// Link can't handle: file proxies, icons, and the `/client-config` REST
// endpoint that fires before Apollo is even constructed.
//
// All GraphQL operations are now short-circuited in-process by
// `bridgeMetadataMockLink` (metadata client) and the SchemaLink-backed
// executable schema (records client). No GraphQL handler should live here.
export const localTwentyGraphqlMocks = {
  handlers: [
    http.get(`${REACT_APP_SERVER_BASE_URL}/files/*`, () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('http://localhost:3000/files/*', () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('https://twenty-icons.com/*', () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${REACT_APP_SERVER_BASE_URL}/client-config`, () => {
      return HttpResponse.json(bridgeClientConfig);
    }),
    http.get('https://chat-assets.frontapp.com/v1/chat.bundle.js', () => {
      return HttpResponse.text(
        `window.FrontChat = () => {};`,
        { status: 200 },
      );
    }),
  ],
};
