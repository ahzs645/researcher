import { makeFunctionReference } from 'convex/server';

import {
  type AppDataSnapshot,
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

export const convexFunctionReferences = {
  snapshot: {
    get: makeFunctionReference<'query', Record<string, never>, AppDataSnapshot>(
      'snapshot:get',
    ),
    importAll: makeFunctionReference<
      'mutation',
      { snapshot: AppDataSnapshot },
      null
    >('snapshot:importAll'),
    replaceAll: makeFunctionReference<
      'mutation',
      { snapshot: AppDataSnapshot },
      null
    >('snapshot:replaceAll'),
  },
  projects: {
    create: makeFunctionReference<
      'mutation',
      CreateProjectInput & { appId: string },
      Project
    >('projects:create'),
    update: makeFunctionReference<
      'mutation',
      { appId: string; patch: UpdateProjectInput },
      Project
    >('projects:update'),
    remove: makeFunctionReference<'mutation', { appId: string }, null>(
      'projects:remove',
    ),
  },
  layers: {
    create: makeFunctionReference<
      'mutation',
      CreateLayerInput & { appId: string },
      Layer
    >('layers:create'),
    update: makeFunctionReference<
      'mutation',
      { appId: string; patch: UpdateLayerInput },
      Layer
    >('layers:update'),
    remove: makeFunctionReference<'mutation', { appId: string }, null>(
      'layers:remove',
    ),
  },
  notes: {
    create: makeFunctionReference<
      'mutation',
      CreateNoteInput & { appId: string },
      Note
    >('notes:create'),
    update: makeFunctionReference<
      'mutation',
      { appId: string; patch: UpdateNoteInput },
      Note
    >('notes:update'),
    remove: makeFunctionReference<'mutation', { appId: string }, null>(
      'notes:remove',
    ),
  },
};
