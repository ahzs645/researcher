// PORTABLE FUNCTION DEFINITIONS + LOCAL RUNTIME.
//
// `definePortableQuery` / `definePortableMutation` capture a handler written
// against the portable context contract. The SAME definition is then:
//   - wrapped as a real Convex query/mutation (convex/lib/portable.ts), and
//   - registered in a `PortableRuntime` that the browser-local runtime uses to
//     execute it against the Dexie-backed `context.db`.
//
// One handler, every runtime — no hand-written mirror.

import { type PortableCapabilities } from './portableCapabilities';
import {
  type PortableMutationContext,
  type PortablePrincipal,
  type PortableQueryContext,
  type PortableTransactionalDatabase,
} from './portableContext';

export type PortableAccess =
  | { audience: 'public' }
  | { audience: 'authenticated' }
  | { audience: 'service'; scopes: readonly string[] };

const DEFAULT_PORTABLE_ACCESS: PortableAccess = { audience: 'authenticated' };

// `handler` is declared with method syntax on purpose: method signatures stay
// bivariant under strictFunctionTypes, so a definition with concrete Args is
// assignable to the heterogeneous PortableFunctionDefinition registry.
export type PortableQueryDefinition<Args = unknown, Result = unknown> = {
  kind: 'query';
  name: string;
  // Access intent. Recorded but not yet enforced — enforcement lands with the
  // hosted auth wiring (societyer's trusted-principal design, stage 2).
  access?: PortableAccess;
  handler(context: PortableQueryContext, args: Args): Promise<Result>;
};

export type PortableMutationDefinition<Args = unknown, Result = unknown> = {
  kind: 'mutation';
  name: string;
  access?: PortableAccess;
  handler(context: PortableMutationContext, args: Args): Promise<Result>;
};

export type PortableFunctionDefinition =
  | PortableQueryDefinition
  | PortableMutationDefinition;

export const definePortableQuery = <Args, Result>(
  definition: Omit<PortableQueryDefinition<Args, Result>, 'kind'>,
): PortableQueryDefinition<Args, Result> => ({
  kind: 'query',
  access: DEFAULT_PORTABLE_ACCESS,
  ...definition,
});

export const definePortableMutation = <Args, Result>(
  definition: Omit<PortableMutationDefinition<Args, Result>, 'kind'>,
): PortableMutationDefinition<Args, Result> => ({
  kind: 'mutation',
  access: DEFAULT_PORTABLE_ACCESS,
  ...definition,
});

export type PortableRuntimeOptions = {
  db: PortableTransactionalDatabase;
  capabilities: PortableCapabilities;
  principalProvider?: () => PortablePrincipal | Promise<PortablePrincipal>;
};

const DEFAULT_ANONYMOUS_PRINCIPAL: PortablePrincipal = {
  kind: 'anonymous',
  runtime: 'test',
  assurance: 'none',
};

// Executes portable functions locally against one `context.db` and capability
// bag. `runQuery`/`runMutation` resolve nested calls through the same
// registry, so a handler that calls `context.runQuery('other:fn', …)` works
// offline too.
//
// Top-level mutations run inside `db.transaction(…)`, giving every mutation
// atomic, all-or-nothing semantics on the local store. Nested mutations
// (context.runMutation inside a handler) run directly inside the CURRENT
// transaction — nesting is a property of the call chain, never guessed from
// shared mutable state.
export class PortableRuntime {
  private readonly registry = new Map<string, PortableFunctionDefinition>();
  private readonly db: PortableTransactionalDatabase;
  private readonly capabilities: PortableCapabilities;
  private readonly principalProvider: () =>
    | PortablePrincipal
    | Promise<PortablePrincipal>;

  constructor(options: PortableRuntimeOptions) {
    this.db = options.db;
    this.capabilities = options.capabilities;
    this.principalProvider =
      options.principalProvider ?? (() => DEFAULT_ANONYMOUS_PRINCIPAL);
  }

  register(definition: PortableFunctionDefinition): this {
    this.registry.set(definition.name, {
      ...definition,
      access: definition.access ?? DEFAULT_PORTABLE_ACCESS,
    });
    return this;
  }

  registerAll(definitions: PortableFunctionDefinition[]): this {
    for (const definition of definitions) {
      this.register(definition);
    }
    return this;
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  // The kind of a registered function, or undefined if not registered.
  kind(name: string): 'query' | 'mutation' | undefined {
    return this.registry.get(name)?.kind;
  }

  private queryContext(principal: PortablePrincipal): PortableQueryContext {
    return {
      db: this.db,
      capabilities: this.capabilities,
      principal,
      runQuery: (name, args) =>
        this.runQueryNested(name, args ?? {}, principal),
    };
  }

  private mutationContext(
    principal: PortablePrincipal,
  ): PortableMutationContext {
    return {
      db: this.db,
      capabilities: this.capabilities,
      principal,
      runQuery: (name, args) =>
        this.runQueryNested(name, args ?? {}, principal),
      runMutation: (name, args) =>
        this.runMutationNested(name, args ?? {}, principal),
    };
  }

  private async runQueryNested<TResult>(
    name: string,
    args: Record<string, unknown>,
    principal: PortablePrincipal,
  ): Promise<TResult> {
    const definition = this.registry.get(name);
    if (!definition) {
      throw new Error(`Portable function not registered locally: ${name}`);
    }
    if (definition.kind !== 'query') {
      throw new Error(`${name} is a ${definition.kind}, not a query`);
    }
    return definition.handler(
      this.queryContext(principal),
      args,
    ) as Promise<TResult>;
  }

  private async runMutationNested<TResult>(
    name: string,
    args: Record<string, unknown>,
    principal: PortablePrincipal,
  ): Promise<TResult> {
    const definition = this.registry.get(name);
    if (!definition) {
      throw new Error(`Portable function not registered locally: ${name}`);
    }
    if (definition.kind !== 'mutation') {
      throw new Error(`${name} is a ${definition.kind}, not a mutation`);
    }
    return definition.handler(
      this.mutationContext(principal),
      args,
    ) as Promise<TResult>;
  }

  async runQuery<TResult>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<TResult> {
    const principal = await this.principalProvider();
    return this.runQueryNested(name, args, principal);
  }

  async runMutation<TResult>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<TResult> {
    const definition = this.registry.get(name);
    if (!definition) {
      throw new Error(`Portable function not registered locally: ${name}`);
    }
    if (definition.kind !== 'mutation') {
      throw new Error(`${name} is a ${definition.kind}, not a mutation`);
    }
    const principal = await this.principalProvider();
    return this.db.transaction(() =>
      definition.handler(this.mutationContext(principal), args),
    ) as Promise<TResult>;
  }
}
