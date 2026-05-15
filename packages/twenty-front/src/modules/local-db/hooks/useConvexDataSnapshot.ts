import { useMemo } from 'react';
import { useMutation, useQuery } from 'convex/react';

import { createConvexDataClient } from '@/local-db/adapters/convex/convexDataClient';
import { convexFunctionReferences } from '@/local-db/adapters/convex/convexFunctionReferences';
import { type AppDataSnapshot } from '@/local-db/domain/types';

const EMPTY_SNAPSHOT: AppDataSnapshot = {
  projects: [],
  layers: [],
  notes: [],
};

export const useConvexDataSnapshot = () => {
  const snapshot =
    useQuery(convexFunctionReferences.snapshot.get) ?? EMPTY_SNAPSHOT;

  const importAll = useMutation(convexFunctionReferences.snapshot.importAll);
  const replaceAll = useMutation(convexFunctionReferences.snapshot.replaceAll);
  const createProject = useMutation(convexFunctionReferences.projects.create);
  const updateProject = useMutation(convexFunctionReferences.projects.update);
  const removeProject = useMutation(convexFunctionReferences.projects.remove);
  const createLayer = useMutation(convexFunctionReferences.layers.create);
  const updateLayer = useMutation(convexFunctionReferences.layers.update);
  const removeLayer = useMutation(convexFunctionReferences.layers.remove);
  const createNote = useMutation(convexFunctionReferences.notes.create);
  const updateNote = useMutation(convexFunctionReferences.notes.update);
  const removeNote = useMutation(convexFunctionReferences.notes.remove);

  const client = useMemo(
    () =>
      createConvexDataClient({
        snapshot,
        mutations: {
          snapshot: {
            importAll,
            replaceAll,
          },
          projects: {
            create: createProject,
            update: updateProject,
            remove: removeProject,
          },
          layers: {
            create: createLayer,
            update: updateLayer,
            remove: removeLayer,
          },
          notes: {
            create: createNote,
            update: updateNote,
            remove: removeNote,
          },
        },
      }),
    [
      createLayer,
      createNote,
      createProject,
      importAll,
      removeLayer,
      removeNote,
      removeProject,
      replaceAll,
      snapshot,
      updateLayer,
      updateNote,
      updateProject,
    ],
  );

  return {
    client,
    isLoading: snapshot === EMPTY_SNAPSHOT,
    snapshot,
  };
};
