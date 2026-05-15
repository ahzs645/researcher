// Portable base64 helpers that work in browser, Node, and Convex's runtime.
// Cursors encode the absolute offset of a record in the sorted result set so
// adapters can resume pagination without keeping any server-side state.

const encodeBase64 = (input: string): string => {
  if (typeof btoa === 'function') return btoa(input);
  const globalBuffer = (
    globalThis as {
      Buffer?: {
        from: (s: string) => { toString: (encoding: string) => string };
      };
    }
  ).Buffer;
  if (globalBuffer) return globalBuffer.from(input).toString('base64');
  throw new Error('No base64 encoder available in this runtime');
};

const decodeBase64 = (input: string): string => {
  if (typeof atob === 'function') return atob(input);
  const globalBuffer = (
    globalThis as {
      Buffer?: {
        from: (s: string, encoding: string) => { toString: () => string };
      };
    }
  ).Buffer;
  if (globalBuffer) return globalBuffer.from(input, 'base64').toString();
  throw new Error('No base64 decoder available in this runtime');
};

export const encodeCursor = (index: number): string =>
  encodeBase64(`offset:${index}`);

export const decodeCursor = (
  cursor: string | null | undefined,
): number | null => {
  if (!cursor) return null;
  try {
    const decoded = decodeBase64(cursor);
    const [, value] = decoded.split(':');
    const offset = Number.parseInt(value, 10);
    return Number.isNaN(offset) ? null : offset;
  } catch {
    return null;
  }
};
