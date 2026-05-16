import { defineSchema } from 'convex/server';

import { recordTables } from './recordSchema';
import { systemTables } from './systemSchema';

// Combined Convex schema. Records live in `recordSchema.ts` (auto-generated
// from Twenty's 33-object metadata bundle) and system entities live in
// `systemSchema.ts` (hand-written, mirrors `bridgeSystemDexie`). One
// `defineSchema()` call so Convex sees a single namespace.

export default defineSchema({
  ...recordTables,
  ...systemTables,
});
