import { graphql, http, HttpResponse } from 'msw';

import {
  createDataClient,
  type AppDataMode,
} from '@/local-db/createDataClient';
import {
  getTwentyDataBridgeConfig,
  isTwentyDataBridgeConfigured,
} from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import {
  twentyLocalObjectConfigs,
  type TwentyLocalObjectNamePlural,
  type TwentyLocalObjectConfig,
} from '@/local-db/twenty-local/twentyLocalObjectConfigs';
import {
  createLayerFromTwentyTaskInput,
  createNoteFromTwentyNoteInput,
  createProjectFromTwentyCompanyInput,
  findLayerByTwentyRecordId,
  findNoteByTwentyRecordId,
  findProjectByTwentyRecordId,
  mapAppDataSnapshotToCompanies,
  mapAppDataSnapshotToNotes,
  mapAppDataSnapshotToTasks,
  patchLayerFromTwentyTaskInput,
  patchNoteFromTwentyNoteInput,
  patchProjectFromTwentyCompanyInput,
  toTwentyRecordId,
} from '@/local-db/twenty-local/mapAppDataToTwentyRecords';
import { getEmptyPageInfo } from '@/object-record/cache/utils/getEmptyPageInfo';
import { mockedPersonRecords } from '~/testing/mock-data/generated/data/people/mock-people-data';
import { graphqlMocks } from '~/testing/graphqlMocks';
import { getConnectionTypename, getEdgeTypename } from 'twenty-shared/utils';
import { REACT_APP_SERVER_BASE_URL } from '~/config';

const mapSnapshotToRecordsByObjectNamePlural = {
  companies: mapAppDataSnapshotToCompanies,
  notes: mapAppDataSnapshotToNotes,
  tasks: mapAppDataSnapshotToTasks,
} as const satisfies Record<TwentyLocalObjectNamePlural, unknown>;

const dataClientsByConfigKey = new Map<
  string,
  ReturnType<typeof createDataClient>
>();
const seedPromisesByConfigKey = new Map<string, Promise<void>>();

const getDataClientConfig = () => {
  const bridgeConfig = getTwentyDataBridgeConfig();

  if (!isTwentyDataBridgeConfigured(bridgeConfig)) {
    return {
      mode: 'local' as const satisfies AppDataMode,
      convexUrl: undefined,
    };
  }

  return bridgeConfig;
};

const getDataClientConfigKey = ({
  mode,
  convexUrl,
}: ReturnType<typeof getDataClientConfig>) =>
  mode === 'convex' ? `${mode}:${convexUrl}` : mode;

const getDataClient = () => {
  const config = getDataClientConfig();
  const configKey = getDataClientConfigKey(config);
  const existingClient = dataClientsByConfigKey.get(configKey);

  if (existingClient !== undefined) {
    return existingClient;
  }

  const dataClient = createDataClient(config.mode, {
    convexUrl: config.convexUrl,
  });

  dataClientsByConfigKey.set(configKey, dataClient);

  return dataClient;
};

const ensureSeededDemo = async () => {
  const dataClient = getDataClient();
  const dataClientConfigKey = getDataClientConfigKey({
    mode: dataClient.mode,
    convexUrl: import.meta.env.REACT_APP_CONVEX_URL,
  });
  const seedPromise = seedPromisesByConfigKey.get(dataClientConfigKey);

  if (seedPromise !== undefined) {
    return seedPromise;
  }

  const nextSeedPromise = dataClient.exportAll().then(async (snapshot) => {
    if (dataClient.mode === 'local' && snapshot.projects.length === 0) {
      await dataClient.resetDemo();
    }
  });

  seedPromisesByConfigKey.set(dataClientConfigKey, nextSeedPromise);

  return nextSeedPromise;
};

const wrapRecordsAsConnection = (
  objectNameSingular: string,
  records: Record<string, unknown>[],
) => ({
  __typename: getConnectionTypename(objectNameSingular),
  edges: records.map((node) => ({
    __typename: getEdgeTypename(objectNameSingular),
    node,
    cursor: '',
  })),
  pageInfo: getEmptyPageInfo(),
  totalCount: records.length,
});

const getLocalRecords = async () => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();

  return {
    companies: mapAppDataSnapshotToCompanies(snapshot),
    notes: mapAppDataSnapshotToNotes(snapshot),
    tasks: mapAppDataSnapshotToTasks(snapshot),
  };
};

const getLocalRecordsForObject = async (
  objectNamePlural: TwentyLocalObjectNamePlural,
) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const mapSnapshotToRecords =
    mapSnapshotToRecordsByObjectNamePlural[objectNamePlural];

  return mapSnapshotToRecords(snapshot);
};

const getLocalRecordForObject = async ({
  objectConfig,
  objectRecordId,
}: {
  objectConfig: TwentyLocalObjectConfig;
  objectRecordId: string;
}) => {
  const records = await getLocalRecordsForObject(objectConfig.objectNamePlural);

  return (
    records.find(
      (record) => typeof record.id === 'string' && record.id === objectRecordId,
    ) ?? null
  );
};

const getCompanyRecordByProjectId = async (projectId: string) => {
  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const companies = mapAppDataSnapshotToCompanies(snapshot);

  return (
    companies.find((company) => company.id === toTwentyRecordId(projectId)) ??
    null
  );
};

const getNoteRecordByNoteId = async (noteId: string) => {
  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const notes = mapAppDataSnapshotToNotes(snapshot);

  return notes.find((note) => note.id === toTwentyRecordId(noteId)) ?? null;
};

const getTaskRecordByLayerId = async (layerId: string) => {
  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const tasks = mapAppDataSnapshotToTasks(snapshot);

  return tasks.find((task) => task.id === toTwentyRecordId(layerId)) ?? null;
};

const createCompany = async (input: Record<string, unknown>) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const project = createProjectFromTwentyCompanyInput(input);

  await dataClient.importAll({
    ...snapshot,
    projects: [project, ...snapshot.projects],
  });

  return await getCompanyRecordByProjectId(project.id);
};

const updateCompany = async (
  idToUpdate: string,
  input: Record<string, unknown>,
) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const existingProject = findProjectByTwentyRecordId(snapshot, idToUpdate);

  if (existingProject === undefined) {
    throw new Error(`Company not found: ${idToUpdate}`);
  }

  const updatedProject = patchProjectFromTwentyCompanyInput(
    existingProject,
    input,
  );

  await dataClient.importAll({
    ...snapshot,
    projects: snapshot.projects.map((project) =>
      project.id === existingProject.id ? updatedProject : project,
    ),
  });

  return await getCompanyRecordByProjectId(updatedProject.id);
};

const deleteCompany = async (idToDelete: string) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const existingProject = findProjectByTwentyRecordId(snapshot, idToDelete);

  if (existingProject === undefined) {
    throw new Error(`Company not found: ${idToDelete}`);
  }

  const company = mapAppDataSnapshotToCompanies(snapshot).find(
    (company) => company.id === idToDelete,
  );

  await dataClient.projects.delete(existingProject.id);

  return {
    ...company,
    id: idToDelete,
    deletedAt: new Date().toISOString(),
  };
};

const createNote = async (input: Record<string, unknown>) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const fallbackProject = snapshot.projects[0];
  const fallbackLayer = snapshot.layers[0];

  if (fallbackProject === undefined || fallbackLayer === undefined) {
    throw new Error('A project and layer are required to create a local note.');
  }

  const note = createNoteFromTwentyNoteInput({
    input,
    fallbackLayerId: fallbackLayer.id,
    fallbackProjectId: fallbackProject.id,
  });

  await dataClient.importAll({
    ...snapshot,
    notes: [note, ...snapshot.notes],
  });

  return await getNoteRecordByNoteId(note.id);
};

const updateNote = async (
  idToUpdate: string,
  input: Record<string, unknown>,
) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const existingNote = findNoteByTwentyRecordId(snapshot, idToUpdate);

  if (existingNote === undefined) {
    throw new Error(`Note not found: ${idToUpdate}`);
  }

  const updatedNote = patchNoteFromTwentyNoteInput(existingNote, input);

  await dataClient.importAll({
    ...snapshot,
    notes: snapshot.notes.map((note) =>
      note.id === existingNote.id ? updatedNote : note,
    ),
  });

  return await getNoteRecordByNoteId(updatedNote.id);
};

const deleteNote = async (idToDelete: string) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const existingNote = findNoteByTwentyRecordId(snapshot, idToDelete);

  if (existingNote === undefined) {
    throw new Error(`Note not found: ${idToDelete}`);
  }

  const note = mapAppDataSnapshotToNotes(snapshot).find(
    (note) => note.id === idToDelete,
  );

  await dataClient.notes.delete(existingNote.id);

  return {
    ...note,
    id: idToDelete,
    deletedAt: new Date().toISOString(),
  };
};

const createTask = async (input: Record<string, unknown>) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const fallbackProject = snapshot.projects[0];

  if (fallbackProject === undefined) {
    throw new Error('A project is required to create a local task.');
  }

  const layer = createLayerFromTwentyTaskInput({
    input,
    fallbackProjectId: fallbackProject.id,
    position: snapshot.layers.length,
  });

  await dataClient.importAll({
    ...snapshot,
    layers: [layer, ...snapshot.layers],
  });

  return await getTaskRecordByLayerId(layer.id);
};

const updateTask = async (
  idToUpdate: string,
  input: Record<string, unknown>,
) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const existingLayer = findLayerByTwentyRecordId(snapshot, idToUpdate);

  if (existingLayer === undefined) {
    throw new Error(`Task not found: ${idToUpdate}`);
  }

  const updatedLayer = patchLayerFromTwentyTaskInput(existingLayer, input);

  await dataClient.importAll({
    ...snapshot,
    layers: snapshot.layers.map((layer) =>
      layer.id === existingLayer.id ? updatedLayer : layer,
    ),
  });

  return await getTaskRecordByLayerId(updatedLayer.id);
};

const deleteTask = async (idToDelete: string) => {
  await ensureSeededDemo();

  const dataClient = getDataClient();
  const snapshot = await dataClient.exportAll();
  const existingLayer = findLayerByTwentyRecordId(snapshot, idToDelete);

  if (existingLayer === undefined) {
    throw new Error(`Task not found: ${idToDelete}`);
  }

  const task = mapAppDataSnapshotToTasks(snapshot).find(
    (task) => task.id === idToDelete,
  );

  await dataClient.layers.delete(existingLayer.id);

  return {
    ...task,
    id: idToDelete,
    deletedAt: new Date().toISOString(),
  };
};

export const localTwentyGraphqlMocks = {
  handlers: [
    http.get(`${REACT_APP_SERVER_BASE_URL}/files/*`, () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('https://twenty-icons.com/*', () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${REACT_APP_SERVER_BASE_URL}/metadata`, () => {
      return HttpResponse.json({});
    }),
    graphql.mutation('CreateOneCompany', async ({ variables }) => {
      const company = await createCompany(
        (variables.input ?? {}) as Record<string, unknown>,
      );

      return HttpResponse.json({
        data: {
          createCompany: company,
        },
      });
    }),
    graphql.mutation('UpdateOneCompany', async ({ variables }) => {
      const company = await updateCompany(
        variables.idToUpdate as string,
        (variables.input ?? {}) as Record<string, unknown>,
      );

      return HttpResponse.json({
        data: {
          updateCompany: company,
        },
      });
    }),
    graphql.mutation('DeleteOneCompany', async ({ variables }) => {
      const company = await deleteCompany(variables.idToDelete as string);

      return HttpResponse.json({
        data: {
          deleteCompany: company,
        },
      });
    }),
    graphql.mutation('CreateOneNote', async ({ variables }) => {
      const note = await createNote(
        (variables.input ?? {}) as Record<string, unknown>,
      );

      return HttpResponse.json({
        data: {
          createNote: note,
        },
      });
    }),
    graphql.mutation('UpdateOneNote', async ({ variables }) => {
      const note = await updateNote(
        variables.idToUpdate as string,
        (variables.input ?? {}) as Record<string, unknown>,
      );

      return HttpResponse.json({
        data: {
          updateNote: note,
        },
      });
    }),
    graphql.mutation('DeleteOneNote', async ({ variables }) => {
      const note = await deleteNote(variables.idToDelete as string);

      return HttpResponse.json({
        data: {
          deleteNote: note,
        },
      });
    }),
    graphql.mutation('CreateOneTask', async ({ variables }) => {
      const task = await createTask(
        (variables.input ?? {}) as Record<string, unknown>,
      );

      return HttpResponse.json({
        data: {
          createTask: task,
        },
      });
    }),
    graphql.mutation('UpdateOneTask', async ({ variables }) => {
      const task = await updateTask(
        variables.idToUpdate as string,
        (variables.input ?? {}) as Record<string, unknown>,
      );

      return HttpResponse.json({
        data: {
          updateTask: task,
        },
      });
    }),
    graphql.mutation('DeleteOneTask', async ({ variables }) => {
      const task = await deleteTask(variables.idToDelete as string);

      return HttpResponse.json({
        data: {
          deleteTask: task,
        },
      });
    }),
    graphql.operation(async ({ query, variables }) => {
      if (typeof query !== 'string') {
        return;
      }

      const findOneObjectConfig = twentyLocalObjectConfigs.find((config) =>
        query.includes(`${config.objectNameSingular}(filter:`),
      );

      if (
        findOneObjectConfig !== undefined &&
        typeof variables.objectRecordId === 'string'
      ) {
        const record = await getLocalRecordForObject({
          objectConfig: findOneObjectConfig,
          objectRecordId: variables.objectRecordId,
        });

        return HttpResponse.json({
          data: {
            [findOneObjectConfig.objectNameSingular]: record,
          },
        });
      }

      if (query.includes('timelineActivities')) {
        return HttpResponse.json({
          data: {
            timelineActivities: wrapRecordsAsConnection('timelineActivity', []),
          },
        });
      }

      if (query.includes('attachments')) {
        return HttpResponse.json({
          data: {
            attachments: wrapRecordsAsConnection('attachment', []),
          },
        });
      }

      const objectConfig = twentyLocalObjectConfigs.find((config) =>
        query.includes(config.objectNamePlural),
      );

      if (objectConfig !== undefined) {
        const records = await getLocalRecordsForObject(
          objectConfig.objectNamePlural,
        );
        return HttpResponse.json({
          data: {
            [objectConfig.objectNamePlural]: wrapRecordsAsConnection(
              objectConfig.objectNameSingular,
              records,
            ),
          },
        });
      }

      return;
    }),
    graphql.query('FindManyCompanies', async ({ variables }) => {
      const { companies } = await getLocalRecords();
      const limit =
        typeof variables.limit === 'number'
          ? variables.limit
          : companies.length;

      return HttpResponse.json({
        data: {
          companies: wrapRecordsAsConnection(
            'company',
            companies.slice(0, limit),
          ),
        },
      });
    }),
    graphql.query('SearchCompanies', async () => {
      const { companies } = await getLocalRecords();

      return HttpResponse.json({
        data: {
          searchCompanies: {
            edges: companies.slice(0, 3).map((company) => ({
              node: company,
              cursor: null,
            })),
            pageInfo: getEmptyPageInfo(),
          },
        },
      });
    }),
    graphql.query('FindManyNotes', async () => {
      const { notes } = await getLocalRecords();

      return HttpResponse.json({
        data: {
          notes: wrapRecordsAsConnection('note', notes),
        },
      });
    }),
    graphql.query('FindManyTasks', async () => {
      const { tasks } = await getLocalRecords();

      return HttpResponse.json({
        data: {
          tasks: wrapRecordsAsConnection('task', tasks),
        },
      });
    }),
    graphql.query('Search', async () => {
      const { companies, tasks } = await getLocalRecords();

      const personSearchEdges = mockedPersonRecords
        .slice(0, 2)
        .map((person: Record<string, unknown>, index: number) => ({
          node: {
            __typename: 'SearchRecordDTO',
            recordId: person.id,
            objectNameSingular: 'person',
            objectLabelSingular: 'Person',
            label:
              `${(person.name as Record<string, string>)?.firstName ?? ''} ${
                (person.name as Record<string, string>)?.lastName ?? ''
              }`.trim(),
            imageUrl: '',
            tsRankCD: 0.2,
            tsRank: 0.12158542,
          },
          cursor: `cursor-${index + 1}`,
        }));

      const companySearchEdges = companies
        .slice(0, 2)
        .map((company: Record<string, unknown>, index: number) => ({
          node: {
            __typename: 'SearchRecordDTO',
            recordId: company.id,
            objectNameSingular: 'company',
            objectLabelSingular: 'Company',
            label: company.name,
            imageUrl: '',
            tsRankCD: 0.2,
            tsRank: 0.12158542,
          },
          cursor: `cursor-${personSearchEdges.length + index + 1}`,
        }));

      const taskSearchEdges = tasks
        .slice(0, 2)
        .map((task: Record<string, unknown>, index: number) => ({
          node: {
            __typename: 'SearchRecordDTO',
            recordId: task.id,
            objectNameSingular: 'task',
            objectLabelSingular: 'Task',
            label: task.title,
            imageUrl: '',
            tsRankCD: 0.2,
            tsRank: 0.12158542,
          },
          cursor: `cursor-${
            personSearchEdges.length + companySearchEdges.length + index + 1
          }`,
        }));
      const allEdges = [
        ...personSearchEdges,
        ...companySearchEdges,
        ...taskSearchEdges,
      ];

      return HttpResponse.json({
        data: {
          search: {
            edges: allEdges,
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: allEdges[0]?.cursor ?? null,
              endCursor: allEdges[allEdges.length - 1]?.cursor ?? null,
            },
          },
        },
      });
    }),
    ...graphqlMocks.handlers,
  ],
};
