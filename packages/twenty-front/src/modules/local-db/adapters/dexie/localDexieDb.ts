import Dexie, { type Table } from 'dexie';

import { type Layer, type Note, type Project } from '@/local-db/domain/types';

class ResearcherLocalDb extends Dexie {
  projects!: Table<Project, string>;
  layers!: Table<Layer, string>;
  notes!: Table<Note, string>;

  constructor() {
    super('researcher-localdb');

    this.version(1).stores({
      projects: 'id, status, updatedAt, deletedAt',
      layers: 'id, projectId, [projectId+position], updatedAt, deletedAt',
      notes: 'id, projectId, layerId, updatedAt, deletedAt',
    });
  }
}

export const localDexieDb = new ResearcherLocalDb();
