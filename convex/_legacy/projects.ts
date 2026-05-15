import { ConvexError, v } from 'convex/values';
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from 'convex/server';
import { projectStatusValidator, projectValidator } from './validators';

const normalizeProject = (project: {
  appId: string;
  name: string;
  summary: string;
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}) => ({
  id: project.appId,
  name: project.name,
  summary: project.summary,
  status: project.status,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  deletedAt: project.deletedAt,
});

export const list = query({
  args: {},
  returns: v.array(projectValidator),
  handler: async (ctx) => {
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_updated_at')
      .order('desc')
      .collect();

    return projects
      .map(normalizeProject)
      .filter((project) => project.deletedAt === undefined);
  },
});

export const get = query({
  args: { appId: v.string() },
  returns: v.union(projectValidator, v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (project === null || project.deletedAt !== undefined) {
      return null;
    }

    return normalizeProject(project);
  },
});

export const create = mutation({
  args: {
    appId: v.string(),
    name: v.string(),
    summary: v.optional(v.string()),
  },
  returns: projectValidator,
  handler: async (ctx, args) => {
    const existingProject = await ctx.db
      .query('projects')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (existingProject !== null) {
      throw new ConvexError({
        code: 'PROJECT_EXISTS',
        message: 'Project appId already exists',
      });
    }

    const now = Date.now();
    const project = {
      appId: args.appId,
      name: args.name.trim(),
      summary: args.summary?.trim() ?? '',
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    };

    await ctx.db.insert('projects', project);

    return normalizeProject(project);
  },
});

export const update = mutation({
  args: {
    appId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      summary: v.optional(v.string()),
      status: v.optional(projectStatusValidator),
    }),
  },
  returns: projectValidator,
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (project === null || project.deletedAt !== undefined) {
      throw new ConvexError({
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
      });
    }

    const patch = {
      ...args.patch,
      name: args.patch.name?.trim(),
      summary: args.patch.summary?.trim(),
      updatedAt: Date.now(),
    };

    await ctx.db.patch(project._id, patch);

    return normalizeProject({
      ...project,
      ...patch,
    });
  },
});

export const remove = mutation({
  args: { appId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_app_id', (q) => q.eq('appId', args.appId))
      .unique();

    if (project === null) {
      return null;
    }

    const now = Date.now();

    await ctx.db.patch(project._id, {
      deletedAt: now,
      updatedAt: now,
    });

    const [layers, notes] = await Promise.all([
      ctx.db
        .query('layers')
        .withIndex('by_project', (q) => q.eq('projectId', args.appId))
        .collect(),
      ctx.db
        .query('notes')
        .withIndex('by_project', (q) => q.eq('projectId', args.appId))
        .collect(),
    ]);

    await Promise.all([
      ...layers.map((layer) =>
        ctx.db.patch(layer._id, { deletedAt: now, updatedAt: now }),
      ),
      ...notes.map((note) =>
        ctx.db.patch(note._id, { deletedAt: now, updatedAt: now }),
      ),
    ]);

    return null;
  },
});
