import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  projects: defineTable({
    appId: v.string(),
    name: v.string(),
    summary: v.string(),
    status: v.union(v.literal('active'), v.literal('archived')),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_app_id', ['appId'])
    .index('by_status', ['status'])
    .index('by_updated_at', ['updatedAt']),
  layers: defineTable({
    appId: v.string(),
    projectId: v.string(),
    name: v.string(),
    kind: v.union(
      v.literal('research'),
      v.literal('source'),
      v.literal('synthesis'),
    ),
    color: v.string(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_app_id', ['appId'])
    .index('by_project', ['projectId'])
    .index('by_project_and_position', ['projectId', 'position']),
  notes: defineTable({
    appId: v.string(),
    projectId: v.string(),
    layerId: v.string(),
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_app_id', ['appId'])
    .index('by_project', ['projectId'])
    .index('by_layer', ['layerId'])
    .index('by_updated_at', ['updatedAt']),
});
