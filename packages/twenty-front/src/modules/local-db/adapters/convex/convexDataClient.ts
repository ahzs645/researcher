import { type ReactMutation } from 'convex/react';

import { createDemoSnapshot } from '@/local-db/adapters/dexie/demoSeed';
import { convexFunctionReferences } from '@/local-db/adapters/convex/convexFunctionReferences';
import { createAppId } from '@/local-db/domain/ids';
import {
  type AppDataClient,
  type AppDataSnapshot,
  type CreateLayerInput,
  type CreateNoteInput,
  type CreateProjectInput,
  type UpdateLayerInput,
  type UpdateNoteInput,
  type UpdateProjectInput,
} from '@/local-db/domain/types';

type ConvexMutations = {
  snapshot: {
    importAll: ReactMutation<
      typeof convexFunctionReferences.snapshot.importAll
    >;
    replaceAll: ReactMutation<
      typeof convexFunctionReferences.snapshot.replaceAll
    >;
  };
  projects: {
    create: ReactMutation<typeof convexFunctionReferences.projects.create>;
    update: ReactMutation<typeof convexFunctionReferences.projects.update>;
    remove: ReactMutation<typeof convexFunctionReferences.projects.remove>;
  };
  layers: {
    create: ReactMutation<typeof convexFunctionReferences.layers.create>;
    update: ReactMutation<typeof convexFunctionReferences.layers.update>;
    remove: ReactMutation<typeof convexFunctionReferences.layers.remove>;
  };
  notes: {
    create: ReactMutation<typeof convexFunctionReferences.notes.create>;
    update: ReactMutation<typeof convexFunctionReferences.notes.update>;
    remove: ReactMutation<typeof convexFunctionReferences.notes.remove>;
  };
};

type CreateConvexDataClientOptions = {
  mutations: ConvexMutations;
  snapshot: AppDataSnapshot;
};

export const createConvexDataClient = ({
  mutations,
  snapshot,
}: CreateConvexDataClientOptions): AppDataClient => {
  return {
    mode: 'convex',
    projects: {
      async list() {
        return snapshot.projects;
      },
      async get(id) {
        return snapshot.projects.find((project) => project.id === id) ?? null;
      },
      async create(input: CreateProjectInput) {
        return await mutations.projects.create({
          appId: createAppId('project'),
          name: input.name,
          summary: input.summary,
        });
      },
      async update(id, patch: UpdateProjectInput) {
        return await mutations.projects.update({ appId: id, patch });
      },
      async archive(id) {
        return await mutations.projects.update({
          appId: id,
          patch: { status: 'archived' },
        });
      },
      async delete(id) {
        await mutations.projects.remove({ appId: id });
      },
    },
    layers: {
      async listByProject(projectId) {
        return snapshot.layers.filter((layer) => layer.projectId === projectId);
      },
      async create(input: CreateLayerInput) {
        return await mutations.layers.create({
          appId: createAppId('layer'),
          ...input,
        });
      },
      async update(id, patch: UpdateLayerInput) {
        return await mutations.layers.update({ appId: id, patch });
      },
      async delete(id) {
        await mutations.layers.remove({ appId: id });
      },
    },
    notes: {
      async listByProject(projectId) {
        return snapshot.notes.filter((note) => note.projectId === projectId);
      },
      async create(input: CreateNoteInput) {
        return await mutations.notes.create({
          appId: createAppId('note'),
          ...input,
        });
      },
      async update(id, patch: UpdateNoteInput) {
        return await mutations.notes.update({ appId: id, patch });
      },
      async delete(id) {
        await mutations.notes.remove({ appId: id });
      },
    },
    async exportAll() {
      return snapshot;
    },
    async importAll(nextSnapshot) {
      await mutations.snapshot.importAll({ snapshot: nextSnapshot });
    },
    async resetDemo() {
      await mutations.snapshot.replaceAll({ snapshot: createDemoSnapshot() });
    },
    watchSnapshot(onChange) {
      onChange(snapshot);

      return () => {};
    },
  };
};
