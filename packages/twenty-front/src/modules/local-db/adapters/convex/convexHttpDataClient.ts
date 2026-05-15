import { ConvexHttpClient } from 'convex/browser';

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

type CreateConvexHttpDataClientOptions = {
  convexUrl: string;
  pollIntervalMs?: number;
};

const EMPTY_SNAPSHOT: AppDataSnapshot = {
  projects: [],
  layers: [],
  notes: [],
};

export const createConvexHttpDataClient = ({
  convexUrl,
  pollIntervalMs = 2000,
}: CreateConvexHttpDataClientOptions): AppDataClient => {
  const convex = new ConvexHttpClient(convexUrl);

  const getSnapshot = async () =>
    await convex.query(convexFunctionReferences.snapshot.get, {});

  return {
    mode: 'convex',
    projects: {
      async list() {
        return (await getSnapshot()).projects;
      },
      async get(id) {
        return (
          (await getSnapshot()).projects.find((project) => project.id === id) ??
          null
        );
      },
      async create(input: CreateProjectInput) {
        return await convex.mutation(convexFunctionReferences.projects.create, {
          appId: createAppId('project'),
          name: input.name,
          summary: input.summary ?? '',
        });
      },
      async update(id, patch: UpdateProjectInput) {
        return await convex.mutation(convexFunctionReferences.projects.update, {
          appId: id,
          patch,
        });
      },
      async archive(id) {
        return await this.update(id, { status: 'archived' });
      },
      async delete(id) {
        await convex.mutation(convexFunctionReferences.projects.remove, {
          appId: id,
        });
      },
    },
    layers: {
      async listByProject(projectId) {
        return (await getSnapshot()).layers.filter(
          (layer) => layer.projectId === projectId,
        );
      },
      async create(input: CreateLayerInput) {
        return await convex.mutation(convexFunctionReferences.layers.create, {
          appId: createAppId('layer'),
          ...input,
        });
      },
      async update(id, patch: UpdateLayerInput) {
        return await convex.mutation(convexFunctionReferences.layers.update, {
          appId: id,
          patch,
        });
      },
      async delete(id) {
        await convex.mutation(convexFunctionReferences.layers.remove, {
          appId: id,
        });
      },
    },
    notes: {
      async listByProject(projectId) {
        return (await getSnapshot()).notes.filter(
          (note) => note.projectId === projectId,
        );
      },
      async create(input: CreateNoteInput) {
        return await convex.mutation(convexFunctionReferences.notes.create, {
          appId: createAppId('note'),
          ...input,
        });
      },
      async update(id, patch: UpdateNoteInput) {
        return await convex.mutation(convexFunctionReferences.notes.update, {
          appId: id,
          patch,
        });
      },
      async delete(id) {
        await convex.mutation(convexFunctionReferences.notes.remove, {
          appId: id,
        });
      },
    },
    exportAll: getSnapshot,
    async importAll(snapshot) {
      await convex.mutation(convexFunctionReferences.snapshot.importAll, {
        snapshot,
      });
    },
    async resetDemo() {
      await convex.mutation(convexFunctionReferences.snapshot.replaceAll, {
        snapshot: createDemoSnapshot(),
      });
    },
    watchSnapshot(onChange) {
      let isActive = true;

      const emitSnapshot = async () => {
        try {
          const snapshot = await getSnapshot();

          if (isActive) {
            onChange(snapshot);
          }
        } catch {
          if (isActive) {
            onChange(EMPTY_SNAPSHOT);
          }
        }
      };

      void emitSnapshot();
      const intervalId = window.setInterval(() => {
        void emitSnapshot();
      }, pollIntervalMs);

      return () => {
        isActive = false;
        window.clearInterval(intervalId);
      };
    },
  };
};
