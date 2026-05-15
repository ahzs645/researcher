import { useEffect, useState } from 'react';

import { appDataClient } from '@/local-db/createDataClient';
import { type AppDataSnapshot } from '@/local-db/domain/types';

const EMPTY_SNAPSHOT: AppDataSnapshot = {
  projects: [],
  layers: [],
  notes: [],
};

export const useLocalDbSnapshot = () => {
  const [snapshot, setSnapshot] = useState<AppDataSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = appDataClient.watchSnapshot((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  return {
    client: appDataClient,
    isLoading,
    snapshot,
  };
};
