// CONVEX adapter for the portable `context.db` contract.
//
// Wraps a real Convex `ctx` so a portable handler (twenty-shared/portable)
// runs on hosted Convex with no changes. The contract is deliberately the
// subset of Convex's ctx we allow, so this wrapper is thin:
//   - index reads pass straight through to the real index; only the
//     engine-agnostic `filter(predicate)` is collect-then-filter (Convex's
//     native `.filter` uses a FilterBuilder, not a JS predicate);
//   - record identity is the durable Twenty UUID in the `id` FIELD, resolved
//     through each table's `by_external_id` index — never the Convex `_id`;
//   - Convex's own `_id` / `_creationTime` are stripped from rows on the way
//     out so handlers see the exact shape the local engines produce.
//
// Convex mutations are already one atomic transaction, so `transaction(body)`
// just runs the body.

import { makeFunctionReference, type UserIdentity } from 'convex/server';
import {
  makePortableCapabilities,
  type PortableCapabilities,
  type PortableDatabaseWriter,
  type PortableIndexRangeBuilder,
  type PortableMutationContext,
  type PortablePaginationOptions,
  type PortablePaginationResult,
  type PortablePrincipal,
  type PortableQuery,
  type PortableQueryContext,
  type PortableRecord,
} from 'twenty-shared/portable';

// Structural view of the Convex query builder — enough for the contract.
type ConvexQueryChain = {
  withIndex: (
    indexName: string,
    range?: (builder: PortableIndexRangeBuilder) => PortableIndexRangeBuilder,
  ) => ConvexQueryChain;
  order: (direction: 'asc' | 'desc') => ConvexQueryChain;
  collect: () => Promise<Record<string, unknown>[]>;
  take: (count: number) => Promise<Record<string, unknown>[]>;
  first: () => Promise<Record<string, unknown> | null>;
  unique: () => Promise<Record<string, unknown> | null>;
  paginate: (options: PortablePaginationOptions) => Promise<{
    page: Record<string, unknown>[];
    isDone: boolean;
    continueCursor: string;
  }>;
};

// Structural view of the Convex database writer.
type ConvexDatabase = {
  query: (table: string) => ConvexQueryChain;
  insert: (table: string, doc: Record<string, unknown>) => Promise<string>;
  patch: (docId: string, patch: Record<string, unknown>) => Promise<void>;
  replace: (docId: string, doc: Record<string, unknown>) => Promise<void>;
  delete: (docId: string) => Promise<void>;
};

// Drop Convex system fields so rows match what the local engines return.
const stripSystemFields = (row: Record<string, unknown>): PortableRecord => {
  const { _id, _creationTime, ...rest } = row;
  void _id;
  void _creationTime;
  return rest as PortableRecord;
};

class ConvexPortableQuery<TRecord extends PortableRecord>
  implements PortableQuery<TRecord>
{
  private inner: ConvexQueryChain;
  private predicates: ((record: TRecord) => boolean)[] = [];

  constructor(inner: ConvexQueryChain) {
    this.inner = inner;
  }

  withIndex(
    indexName: string,
    range?: (builder: PortableIndexRangeBuilder) => PortableIndexRangeBuilder,
  ): PortableQuery<TRecord> {
    this.inner = this.inner.withIndex(indexName, range);
    return this;
  }

  filter(predicate: (record: TRecord) => boolean): PortableQuery<TRecord> {
    this.predicates.push(predicate);
    return this;
  }

  order(direction: 'asc' | 'desc'): PortableQuery<TRecord> {
    this.inner = this.inner.order(direction);
    return this;
  }

  private apply(rows: Record<string, unknown>[]): TRecord[] {
    let out = rows.map(stripSystemFields) as TRecord[];
    for (const predicate of this.predicates) {
      out = out.filter(predicate);
    }
    return out;
  }

  async collect(): Promise<TRecord[]> {
    return this.apply(await this.inner.collect());
  }

  async take(count: number): Promise<TRecord[]> {
    if (this.predicates.length === 0) {
      return (await this.inner.take(count)).map(stripSystemFields) as TRecord[];
    }
    return this.apply(await this.inner.collect()).slice(0, count);
  }

  async first(): Promise<TRecord | null> {
    if (this.predicates.length === 0) {
      const row = await this.inner.first();
      return row ? (stripSystemFields(row) as TRecord) : null;
    }
    return this.apply(await this.inner.collect())[0] ?? null;
  }

  async unique(): Promise<TRecord | null> {
    if (this.predicates.length === 0) {
      const row = await this.inner.unique();
      return row ? (stripSystemFields(row) as TRecord) : null;
    }
    const rows = this.apply(await this.inner.collect());
    if (rows.length > 1) {
      throw new Error('unique() found more than one matching record');
    }
    return rows[0] ?? null;
  }

  async paginate(
    options: PortablePaginationOptions,
  ): Promise<PortablePaginationResult<TRecord>> {
    if (this.predicates.length === 0) {
      const result = await this.inner.paginate(options);
      return {
        page: result.page.map(stripSystemFields) as TRecord[],
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      };
    }
    const rows = this.apply(await this.inner.collect());
    const start = options.cursor ? Number(options.cursor) : 0;
    const page = rows.slice(start, start + options.numItems);
    const nextStart = start + options.numItems;
    const isDone = nextStart >= rows.length;
    return { page, isDone, continueCursor: isDone ? '' : String(nextStart) };
  }
}

class ConvexPortableDb implements PortableDatabaseWriter {
  private readonly db: ConvexDatabase;

  constructor(db: ConvexDatabase) {
    this.db = db;
  }

  // Resolve a durable record id to the raw Convex row (with `_id`) through the
  // table's `by_external_id` index.
  private async rawByRecordId(
    table: string,
    recordId: string,
  ): Promise<(Record<string, unknown> & { _id: string }) | null> {
    const row = await this.db
      .query(table)
      .withIndex('by_external_id', (builder) => builder.eq('id', recordId))
      .unique();
    return (row as (Record<string, unknown> & { _id: string }) | null) ?? null;
  }

  async get<TRecord extends PortableRecord = PortableRecord>(
    table: string,
    recordId: string,
  ): Promise<TRecord | null> {
    const row = await this.rawByRecordId(table, recordId);
    return row ? (stripSystemFields(row) as TRecord) : null;
  }

  query<TRecord extends PortableRecord = PortableRecord>(
    table: string,
  ): PortableQuery<TRecord> {
    return new ConvexPortableQuery<TRecord>(this.db.query(table));
  }

  async insert(
    table: string,
    record: Record<string, unknown>,
  ): Promise<string> {
    const id =
      typeof record.id === 'string' && record.id
        ? record.id
        : crypto.randomUUID();
    await this.db.insert(table, { ...record, id });
    return id;
  }

  async patch(
    table: string,
    recordId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const row = await this.rawByRecordId(table, recordId);
    if (!row) {
      throw new Error(`patch: record ${table}/${recordId} not found`);
    }
    await this.db.patch(row._id, { ...patch, id: recordId });
  }

  async replace(
    table: string,
    recordId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const row = await this.rawByRecordId(table, recordId);
    if (!row) {
      throw new Error(`replace: record ${table}/${recordId} not found`);
    }
    await this.db.replace(row._id, { ...record, id: recordId });
  }

  async delete(table: string, recordId: string): Promise<void> {
    const row = await this.rawByRecordId(table, recordId);
    if (!row) {
      return;
    }
    await this.db.delete(row._id);
  }

  // A Convex mutation is already a single atomic transaction.
  async transaction<TResult>(body: () => Promise<TResult>): Promise<TResult> {
    return body();
  }
}

const NO_CAPABILITIES = makePortableCapabilities({});

const hostedPrincipal = (identity: UserIdentity | null): PortablePrincipal => {
  if (!identity) {
    return { kind: 'anonymous', runtime: 'convex-hosted', assurance: 'none' };
  }
  return {
    kind: 'user',
    runtime: 'convex-hosted',
    assurance: 'verified-jwt',
    subject: identity.subject,
    issuer: identity.issuer,
    tokenIdentifier: identity.tokenIdentifier,
    email: identity.email,
    emailVerified: identity.emailVerified,
  };
};

// The loose view of a Convex handler ctx this adapter needs. Cast the real
// ctx at the call site — the generated GenericQueryCtx types are keyed by the
// schema's table-name union, which the generic contract deliberately isn't.
type ConvexHandlerCtx = {
  db: ConvexDatabase;
  auth: { getUserIdentity: () => Promise<UserIdentity | null> };
  runQuery?: (
    reference: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  runMutation?: (
    reference: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
};

// Wrap a real Convex query ctx as a portable query context. Accepts `unknown`
// so call sites can pass the generated ctx without structural gymnastics.
export const toPortableQueryContext = async (
  rawCtx: unknown,
  capabilities: PortableCapabilities = NO_CAPABILITIES,
): Promise<PortableQueryContext> => {
  const ctx = rawCtx as ConvexHandlerCtx;
  const principal = hostedPrincipal(await ctx.auth.getUserIdentity());
  return {
    db: new ConvexPortableDb(ctx.db),
    capabilities,
    principal,
    runQuery: async <TResult>(name: string, args?: Record<string, unknown>) => {
      if (!ctx.runQuery) {
        throw new Error('runQuery is not available in this Convex context');
      }
      return (await ctx.runQuery(
        makeFunctionReference<'query'>(name),
        args ?? {},
      )) as TResult;
    },
  };
};

// Wrap a real Convex mutation ctx as a portable mutation context.
export const toPortableMutationContext = async (
  rawCtx: unknown,
  capabilities: PortableCapabilities = NO_CAPABILITIES,
): Promise<PortableMutationContext> => {
  const ctx = rawCtx as ConvexHandlerCtx;
  const queryContext = await toPortableQueryContext(ctx, capabilities);
  return {
    ...queryContext,
    db: queryContext.db as PortableDatabaseWriter,
    runMutation: async <TResult>(
      name: string,
      args?: Record<string, unknown>,
    ) => {
      if (!ctx.runMutation) {
        throw new Error('runMutation is not available in this Convex context');
      }
      return (await ctx.runMutation(
        makeFunctionReference<'mutation'>(name),
        args ?? {},
      )) as TResult;
    },
  };
};
