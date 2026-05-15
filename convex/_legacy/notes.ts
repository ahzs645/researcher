import { ConvexError, v } from 'convex/values';
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from 'convex/server';
import { noteValidator } from './validators';

const normalizeNote = (note: {
  appId: string;
  projectId: string;
  layerId: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}) => ({
  id: note.appId,
  projectId: note.projectId,
  layerId: note.layerId,
  title: note.title,
  body: note.body,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  deletedAt: note.deletedAt,
});

export const listByProject = query({
  args: { projectId: v.string() },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .collect();

    return notes
      .map(normalizeNote)
      .filter((note) => note.deletedAt === undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const create = mutation({
  args: {
    appId: v.string(),
    projectId: v.string(),
    layerId: v.string(),
    title: v.string(),
    body: v.string(),
  },
  returns: noteValidator,
  handler: async (ctx, args) => {
    const [project, layer] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_app_id', (q) => q.eq('appId', args.projectId))
        .unique(),
      ctx.db
        .query('layers')
        .withIndex('by_app_id', (q) => q.eq('appId', args.layerId))
        .unique(),
    ]);

    if (project === null || project.deletedAt !== undefined) {
      throw new ConvexError({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
      });
    }

    if (layer === null || layer.deletedAt !== undefined) {
      throw new ConvexError({
        code: 'LAYER_NOT_FOUND',
        message: 'Layer not found',
      });
    }

    const now = Date.now();
    const note = {
      appId: args.appId,
      projectId: args.projectId,
      layerId: args.layerId,
      title: args.title.trim(),
      body: args.body.trim(),
      createdAt: now,
      updatedAt: now,
    };

    await ctx.db.insert('notes', note);

    return normalizeNote(note);
  },
});

export const update = mutation({
  args: {
    appId: v.string(),
    patch: v.object({
      title: v.optional(v.string()),
      body: v.optional(v.string()),
      layerId: v.optional(v.string()),
    }),
  },
  returns: noteValidator,
  handler: async (ctx, args) => {
    const note = await ctx.db
      .query('notes')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (note === null || note.deletedAt !== undefined) {
      throw new ConvexError({
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found',
      });
    }

    const patch = {
      ...args.patch,
      title: args.patch.title?.trim(),
      body: args.patch.body?.trim(),
      updatedAt: Date.now(),
    };

    await ctx.db.patch(note._id, patch);

    return normalizeNote({ ...note, ...patch });
  },
});

export const remove = mutation({
  args: { appId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db
      .query('notes')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (note === null) {
      return null;
    }

    await ctx.db.patch(note._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});
