import { v } from 'convex/values';

export const projectStatusValidator = v.union(
  v.literal('active'),
  v.literal('archived'),
);

export const layerKindValidator = v.union(
  v.literal('research'),
  v.literal('source'),
  v.literal('synthesis'),
);

export const projectValidator = v.object({
  id: v.string(),
  name: v.string(),
  summary: v.string(),
  status: projectStatusValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

export const layerValidator = v.object({
  id: v.string(),
  projectId: v.string(),
  name: v.string(),
  kind: layerKindValidator,
  color: v.string(),
  position: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

export const noteValidator = v.object({
  id: v.string(),
  projectId: v.string(),
  layerId: v.string(),
  title: v.string(),
  body: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
});

export const snapshotValidator = v.object({
  projects: v.array(projectValidator),
  layers: v.array(layerValidator),
  notes: v.array(noteValidator),
});
