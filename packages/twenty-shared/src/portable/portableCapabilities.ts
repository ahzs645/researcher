// INJECTED CAPABILITY CONTRACT.
//
// Server-only powers (outbound email, blob storage, AI inference, raw HTTP to
// third parties) are NOT part of the portable `db` contract. They are injected
// as an object on `context.capabilities`: a runtime supplies the capabilities
// it actually has, and everything else is a throwing stub that surfaces a
// structured CAPABILITY_UNAVAILABLE error instead of a silent no-op.
//
// Domain-agnostic: the capability KEYS are generic ('email', 'storage', …);
// concrete providers (Resend, Convex storage, connector-runner) live per-app
// behind these surfaces.

export type PortableCapabilityKey = 'email' | 'storage' | 'llm' | 'http';

export type PortableCapabilityErrorShape = {
  code: 'CAPABILITY_UNAVAILABLE';
  capability: PortableCapabilityKey;
  reason: string;
};

export class CapabilityUnavailableError extends Error {
  readonly code = 'CAPABILITY_UNAVAILABLE' as const;
  readonly capability: PortableCapabilityKey;
  readonly reason: string;

  constructor(capability: PortableCapabilityKey, reason: string) {
    super(`CAPABILITY_UNAVAILABLE: ${capability} — ${reason}`);
    this.name = 'CapabilityUnavailableError';
    this.capability = capability;
    this.reason = reason;
  }

  toJSON(): PortableCapabilityErrorShape {
    return {
      code: this.code,
      capability: this.capability,
      reason: this.reason,
    };
  }
}

export const isCapabilityUnavailable = (
  value: unknown,
): value is PortableCapabilityErrorShape =>
  typeof value === 'object' &&
  value !== null &&
  (value as { code?: unknown }).code === 'CAPABILITY_UNAVAILABLE';

// Narrow, plain-data capability surfaces. Implementations return data or throw.
export type EmailCapability = {
  sendEmail: (input: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    tag?: string;
  }) => Promise<{ id: string; accepted: boolean }>;
};

export type StorageCapability = {
  createUploadUrl: (input: {
    contentType?: string;
  }) => Promise<{ uploadUrl: string; storageKey: string }>;
  // `url` is null when the reference can't be resolved on this runtime, so
  // read paths fall back gracefully instead of throwing.
  getDownloadUrl: (input: {
    storageKey: string;
  }) => Promise<{ url: string | null }>;
  delete: (input: { storageKey: string }) => Promise<void>;
};

export type LlmCapability = {
  complete: (input: {
    prompt: string;
    system?: string;
    maxTokens?: number;
  }) => Promise<{ text: string }>;
};

// Outbound HTTP to third parties (grant feeds, the connector-runner). Kept as
// a capability so hosted Convex actions, the browser, and Electron can each
// supply their own fetch policy — or decline with a structured error.
export type HttpCapability = {
  fetchJson: (input: {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{ status: number; json: unknown }>;
};

// The full capability bag. Runtimes build it via `makePortableCapabilities`,
// which fills absent members with stubs that throw CapabilityUnavailableError.
// Callers therefore always get a callable surface and a loud, structured
// failure — never a silently missing method.
export type PortableCapabilities = {
  has: (capability: PortableCapabilityKey) => boolean;
  email: EmailCapability;
  storage: StorageCapability;
  llm: LlmCapability;
  http: HttpCapability;
};

type PortableCapabilityImplementations = Partial<{
  email: EmailCapability;
  storage: StorageCapability;
  llm: LlmCapability;
  http: HttpCapability;
}>;

const unavailable = (
  capability: PortableCapabilityKey,
  reason: string,
): never => {
  throw new CapabilityUnavailableError(capability, reason);
};

// Build a capability bag from whatever a runtime can provide. `reasonFor` lets
// a runtime explain WHY a capability is missing (e.g. "offline workspace").
export const makePortableCapabilities = (
  provided: PortableCapabilityImplementations,
  reasonFor: (capability: PortableCapabilityKey) => string = () =>
    'This capability is not available in the current runtime.',
): PortableCapabilities => {
  const present = new Set<PortableCapabilityKey>();
  for (const key of Object.keys(provided) as PortableCapabilityKey[]) {
    if (provided[key]) {
      present.add(key);
    }
  }

  return {
    has: (capability) => present.has(capability),
    email: provided.email ?? {
      sendEmail: () => unavailable('email', reasonFor('email')),
    },
    storage: provided.storage ?? {
      createUploadUrl: () => unavailable('storage', reasonFor('storage')),
      getDownloadUrl: () => unavailable('storage', reasonFor('storage')),
      delete: () => unavailable('storage', reasonFor('storage')),
    },
    llm: provided.llm ?? {
      complete: () => unavailable('llm', reasonFor('llm')),
    },
    http: provided.http ?? {
      fetchJson: () => unavailable('http', reasonFor('http')),
    },
  };
};
