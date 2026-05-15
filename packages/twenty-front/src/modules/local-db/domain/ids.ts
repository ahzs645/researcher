import { type AppId } from '@/local-db/domain/types';

export const createAppId = (prefix: string): AppId => {
  const randomId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${randomId}`;
};
