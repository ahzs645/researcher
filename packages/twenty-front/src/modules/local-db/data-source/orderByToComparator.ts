// Re-export from twenty-shared so the same comparator runs in browser
// adapters and in Convex HTTP actions. Keep this file as a thin shim until
// call sites are migrated.
export { orderByToComparator } from 'twenty-shared/data-source';
