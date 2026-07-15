// PORTABLE `context.db` REPOSITORY CONTRACT.
//
// The bounded subset of a database context that portable researcher functions
// are allowed to depend on. A handler written against this contract runs
// UNCHANGED on every backend:
//   1. hosted Convex   (the real `ctx.db`, adapted in convex/lib/portable.ts),
//   2. browser-local   (the Dexie data-source tables, adapted through
//      `PortableRowStore` + `LocalStoreDb` in this module),
//   3. tests           (`MemoryDb`, the reference engine / differential oracle).
//
// Nothing here imports Convex, Dexie, or any researcher domain code — this
// module is the seam of a reusable, multi-project SDK (ported from societyer's
// `shared/portable`). Keep it that way.
//
// Researcher adaptations vs the societyer original:
//   - Durable identity is the Twenty record UUID stored in the `id` FIELD (not
//     a runtime-native `_id`). Every engine keeps `id` as the stable key; the
//     Convex adapter resolves it through the `by_external_id` index and strips
//     Convex's own `_id` / `_creationTime` so handlers see identical rows.
//   - Because `id` is not globally unique across engines' native keyspaces,
//     record addressing always carries the table: `get(table, id)`,
//     `patch(table, id, patch)`, … This also lets the Convex adapter use the
//     per-table index instead of scanning.
//   - Ordering on the local engines is `createdAt` (ISO string) then `id`.
//     Convex's `.order()` sorts by its internal `_creationTime`; when a handler
//     depends on order, sort explicitly or assert it in a conformance test.
//   - No `withSearchIndex` yet — researcher's Convex schema defines no search
//     indexes. Add it back (from societyer) together with the first one.
//
// Fidelity boundary (read before adding handlers):
//   - `withIndex` index NAMES are advisory on the local engines (they scan and
//     apply the eq/range constraints in JS); on Convex they hit the real index.
//   - `filter` takes a JS predicate (engine-agnostic), NOT Convex's
//     FilterBuilder. The Convex adapter implements it as collect-then-filter,
//     so prefer `withIndex` narrowing on hot paths.
//   - Capabilities (email, storage, AI, http, …) are NOT part of `db`. They are
//     injected via `context.capabilities` so local runtimes can supply native
//     variants or fail loudly with a structured CAPABILITY_UNAVAILABLE error.

import { type PortableCapabilities } from './portableCapabilities';

export type PortableRuntimeKind =
  | 'convex-hosted'
  | 'browser-local'
  | 'electron-local'
  | 'test';

// Runtime-derived caller identity. Deliberately carries neither raw
// credentials nor authorization roles; roles resolve from application records.
export type PortablePrincipal =
  | {
      kind: 'anonymous';
      runtime: PortableRuntimeKind;
      assurance: 'none';
    }
  | {
      kind: 'user';
      runtime: PortableRuntimeKind;
      assurance: 'verified-jwt' | 'trusted-workspace';
      subject: string;
      issuer?: string;
      tokenIdentifier?: string;
      email?: string;
      emailVerified?: boolean;
      userId?: string;
      workspaceId?: string;
    }
  | {
      kind: 'service';
      runtime: PortableRuntimeKind;
      assurance: 'verified-jwt' | 'trusted-internal';
      subject: string;
      workspaceId?: string;
      scopes: readonly string[];
    };

// A stored record. Every row carries the durable Twenty UUID in `id`.
export type PortableRecord = Record<string, unknown> & { id: string };

// Range constraint builder passed to `withIndex`. Mirrors Convex's shape.
export type PortableIndexRangeBuilder = {
  eq: (field: string, value: unknown) => PortableIndexRangeBuilder;
  gt: (field: string, value: unknown) => PortableIndexRangeBuilder;
  gte: (field: string, value: unknown) => PortableIndexRangeBuilder;
  lt: (field: string, value: unknown) => PortableIndexRangeBuilder;
  lte: (field: string, value: unknown) => PortableIndexRangeBuilder;
};

export type PortablePaginationOptions = {
  numItems: number;
  cursor: string | null;
};

export type PortablePaginationResult<TRecord> = {
  page: TRecord[];
  isDone: boolean;
  continueCursor: string;
};

// The read query builder. A subset of Convex's QueryInitializer/Query.
export type PortableQuery<TRecord extends PortableRecord = PortableRecord> = {
  withIndex: (
    indexName: string,
    range?: (builder: PortableIndexRangeBuilder) => PortableIndexRangeBuilder,
  ) => PortableQuery<TRecord>;
  filter: (predicate: (record: TRecord) => boolean) => PortableQuery<TRecord>;
  order: (direction: 'asc' | 'desc') => PortableQuery<TRecord>;
  collect: () => Promise<TRecord[]>;
  take: (count: number) => Promise<TRecord[]>;
  first: () => Promise<TRecord | null>;
  unique: () => Promise<TRecord | null>;
  paginate: (
    options: PortablePaginationOptions,
  ) => Promise<PortablePaginationResult<TRecord>>;
};

// Read surface of the database.
export type PortableDatabaseReader = {
  get: <TRecord extends PortableRecord = PortableRecord>(
    table: string,
    recordId: string,
  ) => Promise<TRecord | null>;
  query: <TRecord extends PortableRecord = PortableRecord>(
    table: string,
  ) => PortableQuery<TRecord>;
};

// Read + write surface. Writes buffer inside `transaction` (atomic).
export type PortableDatabaseWriter = PortableDatabaseReader & {
  insert: (table: string, record: Record<string, unknown>) => Promise<string>;
  patch: (
    table: string,
    recordId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  replace: (
    table: string,
    recordId: string,
    record: Record<string, unknown>,
  ) => Promise<void>;
  delete: (table: string, recordId: string) => Promise<void>;
};

// A writer that can run a body atomically. Mutations always execute inside one
// of these so a thrown error rolls every write back. On Convex the whole
// handler is already one transaction, so its `transaction` just runs the body.
export type PortableTransactionalDatabase = PortableDatabaseWriter & {
  transaction: <TResult>(body: () => Promise<TResult>) => Promise<TResult>;
};

// Context handed to a portable QUERY handler. Read-only db.
export type PortableQueryContext = {
  db: PortableDatabaseReader;
  capabilities: PortableCapabilities;
  principal: PortablePrincipal;
  runQuery: <TResult = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<TResult>;
};

// Context handed to a portable MUTATION handler. Read + write db.
export type PortableMutationContext = {
  db: PortableDatabaseWriter;
  capabilities: PortableCapabilities;
  principal: PortablePrincipal;
  runQuery: <TResult = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<TResult>;
  runMutation: <TResult = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<TResult>;
};
