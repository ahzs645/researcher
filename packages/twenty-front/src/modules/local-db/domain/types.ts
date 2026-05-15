export type AppId = string;

export type ProjectStatus = 'active' | 'archived';

export type LayerKind = 'research' | 'source' | 'synthesis';

export type Project = {
  id: AppId;
  name: string;
  summary: string;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type Layer = {
  id: AppId;
  projectId: AppId;
  name: string;
  kind: LayerKind;
  color: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type Note = {
  id: AppId;
  projectId: AppId;
  layerId: AppId;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type CreateProjectInput = {
  name: string;
  summary?: string;
};

export type UpdateProjectInput = Partial<
  Pick<Project, 'name' | 'summary' | 'status'>
>;

export type CreateLayerInput = {
  projectId: AppId;
  name: string;
  kind: LayerKind;
  color: string;
};

export type UpdateLayerInput = Partial<
  Pick<Layer, 'name' | 'kind' | 'color' | 'position'>
>;

export type CreateNoteInput = {
  projectId: AppId;
  layerId: AppId;
  title: string;
  body: string;
};

export type UpdateNoteInput = Partial<Pick<Note, 'title' | 'body' | 'layerId'>>;

export type AppDataSnapshot = {
  projects: Project[];
  layers: Layer[];
  notes: Note[];
};

export type AppDataClient = {
  mode: 'local' | 'convex';
  projects: {
    list(): Promise<Project[]>;
    get(id: AppId): Promise<Project | null>;
    create(input: CreateProjectInput): Promise<Project>;
    update(id: AppId, patch: UpdateProjectInput): Promise<Project>;
    archive(id: AppId): Promise<Project>;
    delete(id: AppId): Promise<void>;
  };
  layers: {
    listByProject(projectId: AppId): Promise<Layer[]>;
    create(input: CreateLayerInput): Promise<Layer>;
    update(id: AppId, patch: UpdateLayerInput): Promise<Layer>;
    delete(id: AppId): Promise<void>;
  };
  notes: {
    listByProject(projectId: AppId): Promise<Note[]>;
    create(input: CreateNoteInput): Promise<Note>;
    update(id: AppId, patch: UpdateNoteInput): Promise<Note>;
    delete(id: AppId): Promise<void>;
  };
  exportAll(): Promise<AppDataSnapshot>;
  importAll(snapshot: AppDataSnapshot): Promise<void>;
  resetDemo(): Promise<void>;
  watchSnapshot(onChange: (snapshot: AppDataSnapshot) => void): () => void;
};
