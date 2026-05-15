import { liveQuery } from 'dexie';

import { localDexieDb } from '@/local-db/adapters/dexie/localDexieDb';
import { createDemoSnapshot } from '@/local-db/adapters/dexie/demoSeed';
import { createAppId } from '@/local-db/domain/ids';
import {
  type AppDataClient,
  type AppDataSnapshot,
  type AppId,
  type CreateLayerInput,
  type CreateNoteInput,
  type CreateProjectInput,
  type Layer,
  type Note,
  type Project,
  type UpdateLayerInput,
  type UpdateNoteInput,
  type UpdateProjectInput,
} from '@/local-db/domain/types';

const isAlive = <T extends { deletedAt?: number }>(record: T) =>
  record.deletedAt === undefined;

const byUpdatedAtDesc = <T extends { updatedAt: number }>(a: T, b: T) =>
  b.updatedAt - a.updatedAt;

const byPositionAsc = <T extends { position: number }>(a: T, b: T) =>
  a.position - b.position;

const getSnapshot = async (): Promise<AppDataSnapshot> => {
  const [projects, layers, notes] = await Promise.all([
    localDexieDb.projects.toArray(),
    localDexieDb.layers.toArray(),
    localDexieDb.notes.toArray(),
  ]);

  return {
    projects: projects.filter(isAlive).sort(byUpdatedAtDesc),
    layers: layers.filter(isAlive).sort(byPositionAsc),
    notes: notes.filter(isAlive).sort(byUpdatedAtDesc),
  };
};

const requireProject = async (id: AppId): Promise<Project> => {
  const project = await localDexieDb.projects.get(id);

  if (project === undefined || project.deletedAt !== undefined) {
    throw new Error(`Project not found: ${id}`);
  }

  return project;
};

const requireLayer = async (id: AppId): Promise<Layer> => {
  const layer = await localDexieDb.layers.get(id);

  if (layer === undefined || layer.deletedAt !== undefined) {
    throw new Error(`Layer not found: ${id}`);
  }

  return layer;
};

const requireNote = async (id: AppId): Promise<Note> => {
  const note = await localDexieDb.notes.get(id);

  if (note === undefined || note.deletedAt !== undefined) {
    throw new Error(`Note not found: ${id}`);
  }

  return note;
};

export const createDexieDataClient = (): AppDataClient => ({
  mode: 'local',
  projects: {
    async list() {
      return (await localDexieDb.projects.toArray())
        .filter(isAlive)
        .sort(byUpdatedAtDesc);
    },
    async get(id) {
      const project = await localDexieDb.projects.get(id);

      return project === undefined || project.deletedAt !== undefined
        ? null
        : project;
    },
    async create(input: CreateProjectInput) {
      const now = Date.now();
      const project: Project = {
        id: createAppId('project'),
        name: input.name.trim(),
        summary: input.summary?.trim() ?? '',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      await localDexieDb.projects.add(project);

      return project;
    },
    async update(id, patch: UpdateProjectInput) {
      const project = await requireProject(id);
      const updatedProject: Project = {
        ...project,
        ...patch,
        name: patch.name?.trim() ?? project.name,
        summary: patch.summary?.trim() ?? project.summary,
        updatedAt: Date.now(),
      };

      await localDexieDb.projects.put(updatedProject);

      return updatedProject;
    },
    async archive(id) {
      return this.update(id, { status: 'archived' });
    },
    async delete(id) {
      const now = Date.now();

      await localDexieDb.transaction(
        'rw',
        localDexieDb.projects,
        localDexieDb.layers,
        localDexieDb.notes,
        async () => {
          await localDexieDb.projects.update(id, {
            deletedAt: now,
            updatedAt: now,
          });
          await Promise.all(
            (
              await localDexieDb.layers.where('projectId').equals(id).toArray()
            ).map((layer) =>
              localDexieDb.layers.update(layer.id, {
                deletedAt: now,
                updatedAt: now,
              }),
            ),
          );
          await Promise.all(
            (
              await localDexieDb.notes.where('projectId').equals(id).toArray()
            ).map((note) =>
              localDexieDb.notes.update(note.id, {
                deletedAt: now,
                updatedAt: now,
              }),
            ),
          );
        },
      );
    },
  },
  layers: {
    async listByProject(projectId) {
      return (
        await localDexieDb.layers.where('projectId').equals(projectId).toArray()
      )
        .filter(isAlive)
        .sort(byPositionAsc);
    },
    async create(input: CreateLayerInput) {
      await requireProject(input.projectId);

      const now = Date.now();
      const existingLayers = await this.listByProject(input.projectId);
      const layer: Layer = {
        id: createAppId('layer'),
        projectId: input.projectId,
        name: input.name.trim(),
        kind: input.kind,
        color: input.color,
        position: existingLayers.length,
        createdAt: now,
        updatedAt: now,
      };

      await localDexieDb.layers.add(layer);

      return layer;
    },
    async update(id, patch: UpdateLayerInput) {
      const layer = await requireLayer(id);
      const updatedLayer: Layer = {
        ...layer,
        ...patch,
        name: patch.name?.trim() ?? layer.name,
        updatedAt: Date.now(),
      };

      await localDexieDb.layers.put(updatedLayer);

      return updatedLayer;
    },
    async delete(id) {
      const layer = await requireLayer(id);
      const now = Date.now();

      await localDexieDb.transaction(
        'rw',
        localDexieDb.layers,
        localDexieDb.notes,
        async () => {
          await localDexieDb.layers.update(id, {
            deletedAt: now,
            updatedAt: now,
          });
          await Promise.all(
            (
              await localDexieDb.notes
                .where('layerId')
                .equals(layer.id)
                .toArray()
            ).map((note) =>
              localDexieDb.notes.update(note.id, {
                deletedAt: now,
                updatedAt: now,
              }),
            ),
          );
        },
      );
    },
  },
  notes: {
    async listByProject(projectId) {
      return (
        await localDexieDb.notes.where('projectId').equals(projectId).toArray()
      )
        .filter(isAlive)
        .sort(byUpdatedAtDesc);
    },
    async create(input: CreateNoteInput) {
      await requireProject(input.projectId);
      await requireLayer(input.layerId);

      const now = Date.now();
      const note: Note = {
        id: createAppId('note'),
        projectId: input.projectId,
        layerId: input.layerId,
        title: input.title.trim(),
        body: input.body.trim(),
        createdAt: now,
        updatedAt: now,
      };

      await localDexieDb.notes.add(note);

      return note;
    },
    async update(id, patch: UpdateNoteInput) {
      const note = await requireNote(id);
      const updatedNote: Note = {
        ...note,
        ...patch,
        title: patch.title?.trim() ?? note.title,
        body: patch.body?.trim() ?? note.body,
        updatedAt: Date.now(),
      };

      await localDexieDb.notes.put(updatedNote);

      return updatedNote;
    },
    async delete(id) {
      await requireNote(id);

      await localDexieDb.notes.update(id, {
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      });
    },
  },
  exportAll: getSnapshot,
  async importAll(snapshot) {
    await localDexieDb.transaction(
      'rw',
      localDexieDb.projects,
      localDexieDb.layers,
      localDexieDb.notes,
      async () => {
        await localDexieDb.projects.bulkPut(snapshot.projects);
        await localDexieDb.layers.bulkPut(snapshot.layers);
        await localDexieDb.notes.bulkPut(snapshot.notes);
      },
    );
  },
  async resetDemo() {
    const snapshot = createDemoSnapshot();

    await localDexieDb.transaction(
      'rw',
      localDexieDb.projects,
      localDexieDb.layers,
      localDexieDb.notes,
      async () => {
        await Promise.all([
          localDexieDb.projects.clear(),
          localDexieDb.layers.clear(),
          localDexieDb.notes.clear(),
        ]);
        await localDexieDb.projects.bulkAdd(snapshot.projects);
        await localDexieDb.layers.bulkAdd(snapshot.layers);
        await localDexieDb.notes.bulkAdd(snapshot.notes);
      },
    );
  },
  watchSnapshot(onChange) {
    const subscription = liveQuery(getSnapshot).subscribe({
      next: onChange,
      error: (error) => {
        throw error;
      },
    });

    return () => subscription.unsubscribe();
  },
});
