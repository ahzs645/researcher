import { createAppId } from '@/local-db/domain/ids';
import {
  type AppDataSnapshot,
  type Layer,
  type Note,
  type Project,
} from '@/local-db/domain/types';

export const createDemoSnapshot = (): AppDataSnapshot => {
  const now = Date.now();
  const projectId = createAppId('project');
  const researchLayerId = createAppId('layer');
  const sourceLayerId = createAppId('layer');
  const synthesisLayerId = createAppId('layer');

  const project: Project = {
    id: projectId,
    name: 'Convex-shaped local research',
    summary:
      'A browser-only workspace using Dexie records behind an app data client.',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const layers: Layer[] = [
    {
      id: researchLayerId,
      projectId,
      name: 'Questions',
      kind: 'research',
      color: '#2563eb',
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: sourceLayerId,
      projectId,
      name: 'Sources',
      kind: 'source',
      color: '#059669',
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: synthesisLayerId,
      projectId,
      name: 'Synthesis',
      kind: 'synthesis',
      color: '#c2410c',
      position: 2,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const notes: Note[] = [
    {
      id: createAppId('note'),
      projectId,
      layerId: researchLayerId,
      title: 'Migration rule',
      body: 'Keep React on commands and queries. Do not call Dexie from feature components.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createAppId('note'),
      projectId,
      layerId: sourceLayerId,
      title: 'Future Convex mapping',
      body: 'Local id becomes Convex appId. Convex _id remains an adapter detail.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createAppId('note'),
      projectId,
      layerId: synthesisLayerId,
      title: 'Adapter swap',
      body: 'DexieDataClient and ConvexDataClient should satisfy the same AppDataClient contract.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    projects: [project],
    layers,
    notes,
  };
};
