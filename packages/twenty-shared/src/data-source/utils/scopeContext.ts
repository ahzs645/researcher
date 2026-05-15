import { type RecordGqlOperationFilter } from '../../types/RecordGqlOperationFilter';
import { type DataSourceContext } from '../types/DataSourceTypes';

// Compose an `AND` filter that pins records to the caller's workspaceId.
// Returns the original filter when context has no workspaceId — bridge mode
// runs single-tenant so the scope is a no-op there.
export const scopeFilterByContext = (
  filter: RecordGqlOperationFilter | null | undefined,
  context: DataSourceContext,
): RecordGqlOperationFilter | null | undefined => {
  if (!context.workspaceId) return filter;
  const scope = {
    workspaceId: { eq: context.workspaceId },
  } as RecordGqlOperationFilter;
  if (!filter) return scope;
  return { and: [scope, filter] } as RecordGqlOperationFilter;
};

// Default ACTOR field value for created/updated by. Adapters call this when
// the caller's `workspaceMemberId` is known. Matches Twenty's wire shape: a
// composite with `source`, `workspaceMemberId`, `name`, and `context`.
export const buildActorFromContext = (
  context: DataSourceContext,
): {
  source: 'MANUAL';
  workspaceMemberId: string | null;
  name: string;
  context: Record<string, unknown>;
} | null => {
  if (!context.workspaceMemberId) return null;
  return {
    source: 'MANUAL',
    workspaceMemberId: context.workspaceMemberId,
    name: '',
    context: {},
  };
};
