// PORTABLE FUNCTION REGISTRY.
//
// Every function listed here runs identically on hosted Convex (via the
// convex/lib/portable.ts adapter) and on the browser-local runtime (via
// `PortableRuntime` over the Dexie row store). Add a domain by exporting its
// `definePortableQuery` / `definePortableMutation` definitions and appending
// them here — the differential conformance tests pick the registry up
// automatically.

import { type PortableFunctionDefinition } from '../portable/portableRuntime';

import {
  grantDiscoveryTeamProfileQuery,
  grantDiscoveryUpsertOpportunitiesMutation,
} from './grantDiscovery';

export const PORTABLE_FUNCTIONS: PortableFunctionDefinition[] = [
  grantDiscoveryTeamProfileQuery,
  grantDiscoveryUpsertOpportunitiesMutation,
];
