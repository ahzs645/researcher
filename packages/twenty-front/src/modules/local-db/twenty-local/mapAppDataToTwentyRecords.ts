import {
  type AppDataSnapshot,
  type AppId,
  type Layer,
  type LayerKind,
  type Note,
  type Project,
} from '@/local-db/domain/types';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { mockedCompanyRecords } from '~/testing/mock-data/generated/data/companies/mock-companies-data';
import { mockedNoteRecords } from '~/testing/mock-data/generated/data/notes/mock-notes-data';
import { mockedTaskRecords } from '~/testing/mock-data/generated/data/tasks/mock-tasks-data';

const companyTemplate = mockedCompanyRecords[0] as ObjectRecord;
const noteTemplate = mockedNoteRecords[0] as ObjectRecord;
const taskTemplate = mockedTaskRecords[0] as ObjectRecord;

const toIsoString = (timestamp: number) => new Date(timestamp).toISOString();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const toTwentyRecordId = (appId: string) =>
  appId.split('_').at(-1) ?? appId;

export const toProjectAppId = (twentyRecordId: string): AppId =>
  twentyRecordId.startsWith('project_')
    ? twentyRecordId
    : `project_${twentyRecordId}`;

export const toNoteAppId = (twentyRecordId: string): AppId =>
  twentyRecordId.startsWith('note_')
    ? twentyRecordId
    : `note_${twentyRecordId}`;

export const toLayerAppId = (twentyRecordId: string): AppId =>
  twentyRecordId.startsWith('layer_')
    ? twentyRecordId
    : `layer_${twentyRecordId}`;

export const findProjectByTwentyRecordId = (
  snapshot: AppDataSnapshot,
  twentyRecordId: string,
) =>
  snapshot.projects.find(
    (project) => toTwentyRecordId(project.id) === twentyRecordId,
  );

export const findNoteByTwentyRecordId = (
  snapshot: AppDataSnapshot,
  twentyRecordId: string,
) =>
  snapshot.notes.find((note) => toTwentyRecordId(note.id) === twentyRecordId);

export const findLayerByTwentyRecordId = (
  snapshot: AppDataSnapshot,
  twentyRecordId: string,
) =>
  snapshot.layers.find(
    (layer) => toTwentyRecordId(layer.id) === twentyRecordId,
  );

const getMarkdownFromBodyV2 = (bodyV2: unknown) => {
  if (
    typeof bodyV2 === 'object' &&
    bodyV2 !== null &&
    'markdown' in bodyV2 &&
    typeof bodyV2.markdown === 'string'
  ) {
    return bodyV2.markdown;
  }

  return '';
};

const kindByTaskStatus: Record<string, LayerKind> = {
  TODO: 'research',
  IN_PROGRESS: 'source',
  DONE: 'synthesis',
};

const taskStatusByKind: Record<LayerKind, string> = {
  research: 'TODO',
  source: 'IN_PROGRESS',
  synthesis: 'DONE',
};

const defaultColorByKind: Record<LayerKind, string> = {
  research: '#2563eb',
  source: '#059669',
  synthesis: '#c2410c',
};

const getLayerKindFromTaskInput = (
  input: Record<string, unknown>,
  fallbackKind: LayerKind = 'research',
): LayerKind => {
  if (typeof input.status !== 'string') {
    return fallbackKind;
  }

  return kindByTaskStatus[input.status] ?? fallbackKind;
};

export const createProjectFromTwentyCompanyInput = (
  input: Record<string, unknown>,
): Project => {
  const now = Date.now();
  const inputId =
    typeof input.id === 'string' && input.id.length > 0
      ? input.id
      : crypto.randomUUID();

  return {
    id: toProjectAppId(inputId),
    name: typeof input.name === 'string' ? input.name : 'Untitled company',
    summary: typeof input.tagline === 'string' ? input.tagline : '',
    status:
      typeof input.idealCustomerProfile === 'boolean' &&
      input.idealCustomerProfile === false
        ? 'archived'
        : 'active',
    createdAt: now,
    updatedAt: now,
  };
};

export const patchProjectFromTwentyCompanyInput = (
  project: Project,
  input: Record<string, unknown>,
): Project => ({
  ...project,
  name: typeof input.name === 'string' ? input.name : project.name,
  summary: typeof input.tagline === 'string' ? input.tagline : project.summary,
  status:
    typeof input.idealCustomerProfile === 'boolean'
      ? input.idealCustomerProfile
        ? 'active'
        : 'archived'
      : project.status,
  updatedAt: Date.now(),
});

export const createNoteFromTwentyNoteInput = ({
  input,
  fallbackLayerId,
  fallbackProjectId,
}: {
  input: Record<string, unknown>;
  fallbackLayerId: AppId;
  fallbackProjectId: AppId;
}): Note => {
  const now = Date.now();
  const inputId =
    typeof input.id === 'string' && input.id.length > 0
      ? input.id
      : crypto.randomUUID();

  return {
    id: toNoteAppId(inputId),
    projectId: fallbackProjectId,
    layerId: fallbackLayerId,
    title: typeof input.title === 'string' ? input.title : 'Untitled note',
    body: getMarkdownFromBodyV2(input.bodyV2),
    createdAt: now,
    updatedAt: now,
  };
};

export const patchNoteFromTwentyNoteInput = (
  note: Note,
  input: Record<string, unknown>,
): Note => ({
  ...note,
  title: typeof input.title === 'string' ? input.title : note.title,
  body: 'bodyV2' in input ? getMarkdownFromBodyV2(input.bodyV2) : note.body,
  updatedAt: Date.now(),
});

export const createLayerFromTwentyTaskInput = ({
  input,
  fallbackProjectId,
  position,
}: {
  input: Record<string, unknown>;
  fallbackProjectId: AppId;
  position: number;
}): Layer => {
  const now = Date.now();
  const inputId =
    typeof input.id === 'string' && input.id.length > 0
      ? input.id
      : crypto.randomUUID();
  const kind = getLayerKindFromTaskInput(input);

  return {
    id: toLayerAppId(inputId),
    projectId: fallbackProjectId,
    name: typeof input.title === 'string' ? input.title : 'Untitled task',
    kind,
    color: defaultColorByKind[kind],
    position,
    createdAt: now,
    updatedAt: now,
  };
};

export const patchLayerFromTwentyTaskInput = (
  layer: Layer,
  input: Record<string, unknown>,
): Layer => {
  const kind = getLayerKindFromTaskInput(input, layer.kind);

  return {
    ...layer,
    name: typeof input.title === 'string' ? input.title : layer.name,
    kind,
    color: input.status === undefined ? layer.color : defaultColorByKind[kind],
    updatedAt: Date.now(),
  };
};

export const mapAppDataSnapshotToCompanies = (
  snapshot: AppDataSnapshot,
): ObjectRecord[] =>
  snapshot.projects.map((project, index) => {
    const projectNotes = snapshot.notes.filter(
      (note) => note.projectId === project.id,
    );

    return {
      ...companyTemplate,
      id: toTwentyRecordId(project.id),
      name: project.name,
      tagline: project.summary,
      createdAt: toIsoString(project.createdAt),
      updatedAt: toIsoString(project.updatedAt),
      deletedAt: project.deletedAt ? toIsoString(project.deletedAt) : null,
      domainName: {
        __typename: 'Links',
        primaryLinkUrl: `${slugify(project.name) || 'project'}.local`,
        primaryLinkLabel: '',
        secondaryLinks: [],
      },
      employees: snapshot.layers.filter(
        (layer) => layer.projectId === project.id,
      ).length,
      idealCustomerProfile: project.status === 'active',
      noteTargets: {
        __typename: 'NoteTargetConnection',
        edges: projectNotes.map((note) => ({
          __typename: 'NoteTargetEdge',
          node: {
            __typename: 'NoteTarget',
            id: toTwentyRecordId(note.id),
            note: {
              __typename: 'Note',
              id: toTwentyRecordId(note.id),
              title: note.title,
            },
          },
        })),
      },
      position: index + 1,
    };
  });

export const mapAppDataSnapshotToNotes = (
  snapshot: AppDataSnapshot,
): ObjectRecord[] =>
  snapshot.notes.map((note, index) => ({
    ...noteTemplate,
    id: toTwentyRecordId(note.id),
    title: note.title,
    bodyV2: {
      __typename: 'RichText',
      blocknote: JSON.stringify([
        {
          id: `block-${note.id}`,
          type: 'paragraph',
          props: {
            textColor: 'default',
            backgroundColor: 'default',
            textAlignment: 'left',
          },
          content: [{ type: 'text', text: note.body, styles: {} }],
          children: [],
        },
      ]),
      markdown: note.body,
    },
    createdAt: toIsoString(note.createdAt),
    updatedAt: toIsoString(note.updatedAt),
    deletedAt: note.deletedAt ? toIsoString(note.deletedAt) : null,
    noteTargets: {
      __typename: 'NoteTargetConnection',
      edges: [],
    },
    position: index + 1,
  }));

export const mapAppDataSnapshotToTasks = (
  snapshot: AppDataSnapshot,
): ObjectRecord[] =>
  snapshot.layers.map((layer, index) => {
    const project = snapshot.projects.find(
      (project) => project.id === layer.projectId,
    );
    const layerNotes = snapshot.notes.filter(
      (note) => note.layerId === layer.id,
    );
    const body = [
      `Layer kind: ${layer.kind}`,
      project === undefined ? null : `Project: ${project.name}`,
      `Notes in layer: ${layerNotes.length}`,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    return {
      ...taskTemplate,
      id: toTwentyRecordId(layer.id),
      title: layer.name,
      bodyV2: {
        __typename: 'RichText',
        blocknote: JSON.stringify([
          {
            id: `block-${layer.id}`,
            type: 'paragraph',
            props: {
              textColor: 'default',
              backgroundColor: 'default',
              textAlignment: 'left',
            },
            content: [{ type: 'text', text: body, styles: {} }],
            children: [],
          },
        ]),
        markdown: body,
      },
      createdAt: toIsoString(layer.createdAt),
      updatedAt: toIsoString(layer.updatedAt),
      deletedAt: layer.deletedAt ? toIsoString(layer.deletedAt) : null,
      dueAt: null,
      status: taskStatusByKind[layer.kind],
      taskTargets: {
        __typename: 'TaskTargetConnection',
        edges: [],
      },
      position: index + 1,
    };
  });
