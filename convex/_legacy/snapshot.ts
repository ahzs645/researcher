import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from 'convex/server';
import { v } from 'convex/values';

import {
  layerValidator,
  noteValidator,
  projectValidator,
  snapshotValidator,
} from './validators';

const isAlive = <T extends { deletedAt?: number }>(record: T) =>
  record.deletedAt === undefined;

const byUpdatedAtDesc = <T extends { updatedAt: number }>(a: T, b: T) =>
  b.updatedAt - a.updatedAt;

const byPositionAsc = <T extends { position: number }>(a: T, b: T) =>
  a.position - b.position;

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

export const get = query({
  args: {},
  returns: snapshotValidator,
  handler: async (ctx) => {
    const [projects, layers, notes] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_updated_at')
        .order('desc')
        .collect(),
      ctx.db.query('layers').collect(),
      ctx.db.query('notes').withIndex('by_updated_at').order('desc').collect(),
    ]);

    return {
      projects: projects
        .map(normalizeProject)
        .filter(isAlive)
        .sort(byUpdatedAtDesc),
      layers: layers.map(normalizeLayer).filter(isAlive).sort(byPositionAsc),
      notes: notes.map(normalizeNote).filter(isAlive).sort(byUpdatedAtDesc),
    };
  },
});

export const importAll = mutation({
  args: { snapshot: snapshotValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Promise.all(
      args.snapshot.projects.map(async (project) => {
        const existingProject = await ctx.db
          .query('projects')
          .withIndex('by_app_id', (q) => q.eq('appId', project.id))
          .unique();

        const value = {
          appId: project.id,
          name: project.name,
          summary: project.summary,
          status: project.status,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          deletedAt: project.deletedAt,
        };

        if (existingProject === null) {
          await ctx.db.insert('projects', value);
        } else {
          await ctx.db.patch(existingProject._id, value);
        }
      }),
    );

    await Promise.all(
      args.snapshot.layers.map(async (layer) => {
        const existingLayer = await ctx.db
          .query('layers')
          .withIndex('by_app_id', (q) => q.eq('appId', layer.id))
          .unique();

        const value = {
          appId: layer.id,
          projectId: layer.projectId,
          name: layer.name,
          kind: layer.kind,
          color: layer.color,
          position: layer.position,
          createdAt: layer.createdAt,
          updatedAt: layer.updatedAt,
          deletedAt: layer.deletedAt,
        };

        if (existingLayer === null) {
          await ctx.db.insert('layers', value);
        } else {
          await ctx.db.patch(existingLayer._id, value);
        }
      }),
    );

    await Promise.all(
      args.snapshot.notes.map(async (note) => {
        const existingNote = await ctx.db
          .query('notes')
          .withIndex('by_app_id', (q) => q.eq('appId', note.id))
          .unique();

        const value = {
          appId: note.id,
          projectId: note.projectId,
          layerId: note.layerId,
          title: note.title,
          body: note.body,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          deletedAt: note.deletedAt,
        };

        if (existingNote === null) {
          await ctx.db.insert('notes', value);
        } else {
          await ctx.db.patch(existingNote._id, value);
        }
      }),
    );

    return null;
  },
});

export const replaceAll = mutation({
  args: { snapshot: snapshotValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [projects, layers, notes] = await Promise.all([
      ctx.db.query('projects').collect(),
      ctx.db.query('layers').collect(),
      ctx.db.query('notes').collect(),
    ]);

    await Promise.all([
      ...projects.map((project) => ctx.db.delete(project._id)),
      ...layers.map((layer) => ctx.db.delete(layer._id)),
      ...notes.map((note) => ctx.db.delete(note._id)),
    ]);

    await Promise.all([
      ...args.snapshot.projects.map((project) =>
        ctx.db.insert('projects', {
          appId: project.id,
          name: project.name,
          summary: project.summary,
          status: project.status,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          deletedAt: project.deletedAt,
        }),
      ),
      ...args.snapshot.layers.map((layer) =>
        ctx.db.insert('layers', {
          appId: layer.id,
          projectId: layer.projectId,
          name: layer.name,
          kind: layer.kind,
          color: layer.color,
          position: layer.position,
          createdAt: layer.createdAt,
          updatedAt: layer.updatedAt,
          deletedAt: layer.deletedAt,
        }),
      ),
      ...args.snapshot.notes.map((note) =>
        ctx.db.insert('notes', {
          appId: note.id,
          projectId: note.projectId,
          layerId: note.layerId,
          title: note.title,
          body: note.body,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          deletedAt: note.deletedAt,
        }),
      ),
    ]);

    return null;
  },
});
