import { ConvexError, v } from 'convex/values';
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from 'convex/server';
import { layerKindValidator, layerValidator } from './validators';

const normalizeLayer = (layer: {
  appId: string;
  projectId: string;
  name: string;
  kind: 'research' | 'source' | 'synthesis';
  color: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}) => ({
  id: layer.appId,
  projectId: layer.projectId,
  name: layer.name,
  kind: layer.kind,
  color: layer.color,
  position: layer.position,
  createdAt: layer.createdAt,
  updatedAt: layer.updatedAt,
  deletedAt: layer.deletedAt,
});

export const listByProject = query({
  args: { projectId: v.string() },
  returns: v.array(layerValidator),
  handler: async (ctx, args) => {
    const layers = await ctx.db
      .query('layers')
      .withIndex('by_project_and_position', (q) =>
        q.eq('projectId', args.projectId),
      )
      .collect();

    return layers
      .map(normalizeLayer)
      .filter((layer) => layer.deletedAt === undefined);
  },
});

export const create = mutation({
  args: {
    appId: v.string(),
    projectId: v.string(),
    name: v.string(),
    kind: layerKindValidator,
    color: v.string(),
  },
  returns: layerValidator,
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_app_id', (q) => q.eq('appId', args.projectId))
      .unique();

    if (project === null || project.deletedAt !== undefined) {
      throw new ConvexError({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
      });
    }

    const existingLayers = await ctx.db
      .query('layers')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();
    const now = Date.now();
    const layer = {
      appId: args.appId,
      projectId: args.projectId,
      name: args.name.trim(),
      kind: args.kind,
      color: args.color,
      position: existingLayers.filter((item) => item.deletedAt === undefined)
        .length,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.db.insert('layers', layer);

    return normalizeLayer(layer);
  },
});

export const update = mutation({
  args: {
    appId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      kind: v.optional(layerKindValidator),
      color: v.optional(v.string()),
      position: v.optional(v.number()),
    }),
  },
  returns: layerValidator,
  handler: async (ctx, args) => {
    const layer = await ctx.db
      .query('layers')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (layer === null || layer.deletedAt !== undefined) {
      throw new ConvexError({
        code: 'LAYER_NOT_FOUND',
        message: 'Layer not found',
      });
    }

    const patch = {
      ...args.patch,
      name: args.patch.name?.trim(),
      updatedAt: Date.now(),
    };

    await ctx.db.patch(layer._id, patch);

    return normalizeLayer({ ...layer, ...patch });
  },
});

export const remove = mutation({
  args: { appId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const layer = await ctx.db
      .query('layers')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (layer === null) {
      return null;
    }

    const now = Date.now();

    await ctx.db.patch(layer._id, {
      deletedAt: now,
      updatedAt: now,
    });

    const notes = await ctx.db
      .query('notes')
      .withIndex('by_layer', (q) => q.eq('layerId', args.appId))
      .collect();

    await Promise.all(
      notes.map((note) =>
        ctx.db.patch(note._id, { deletedAt: now, updatedAt: now }),
      ),
    );

    return null;
  },
});
