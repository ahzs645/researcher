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

// Default ACTOR field value for created/updated by. Matches Twenty's wire
// shape: a composite with `source`, `workspaceMemberId`, `name`, and
// `context`. The composite itself is non-nullable in the generated schema
// (only its sub-fields are nullable), so this always returns a value — when
// the caller's `workspaceMemberId` is unknown it falls back to `null` rather
// than omitting `createdBy`/`updatedBy`, which would surface as
// "Cannot return null for non-nullable field <Object>.createdBy".
export const buildActorFromContext = (
  context: DataSourceContext,
): {
  source: 'MANUAL';
  workspaceMemberId: string | null;
  name: string;
  context: Record<string, unknown>;
} => {
  return {
    source: 'MANUAL',
    workspaceMemberId: context.workspaceMemberId ?? null,
    name: '',
    context: {},
  };
};
