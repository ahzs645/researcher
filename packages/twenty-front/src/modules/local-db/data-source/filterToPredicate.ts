// Re-export from twenty-shared so the same translator runs in browser
// (Apollo SchemaLink + Dexie / in-memory adapters) and in Convex HTTP
// actions. Keep this file as a thin shim until call sites are migrated.
export { filterToPredicate } from 'twenty-shared/data-source';
