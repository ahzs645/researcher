import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

export type ManuscriptSaveState = 'saved' | 'saving' | 'unsaved' | 'failed';

type SaveOperation = () => Promise<unknown>;

type ManuscriptSaveStatusContextValue = {
  state: ManuscriptSaveState;
  markUnsaved: () => void;
  discardUnsavedState: () => void;
  retry: () => void;
  trackSave: <T>(operation: () => Promise<T>) => Promise<T>;
};

const defaultValue: ManuscriptSaveStatusContextValue = {
  state: 'saved',
  markUnsaved: () => undefined,
  discardUnsavedState: () => undefined,
  retry: () => undefined,
  trackSave: (operation) => operation(),
};

const ManuscriptSaveStatusContext =
  createContext<ManuscriptSaveStatusContextValue>(defaultValue);

export const ManuscriptSaveStatusProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [state, setState] = useState<ManuscriptSaveState>('saved');
  // Async saves need a synchronous generation counter so older completions
  // cannot overwrite a newer dirty or failed state.
  // oxlint-disable-next-line twenty/no-state-useref
  const latestOperationId = useRef(0);
  // Retry must retain the exact rejected operation without causing a render.
  // oxlint-disable-next-line twenty/no-state-useref
  const retryOperation = useRef<SaveOperation | null>(null);

  const trackSave = useCallback(
    async <T,>(operation: () => Promise<T>): Promise<T> => {
      const operationId = latestOperationId.current + 1;
      latestOperationId.current = operationId;
      retryOperation.current = operation;
      setState('saving');
      try {
        const result = await operation();
        if (latestOperationId.current === operationId) setState('saved');
        return result;
      } catch (error) {
        if (latestOperationId.current === operationId) setState('failed');
        throw error;
      }
    },
    [],
  );

  const markUnsaved = useCallback(() => {
    latestOperationId.current += 1;
    setState('unsaved');
  }, []);

  const discardUnsavedState = useCallback(() => {
    latestOperationId.current += 1;
    retryOperation.current = null;
    setState('saved');
  }, []);

  const retry = useCallback(() => {
    const operation = retryOperation.current;
    if (operation !== null) void trackSave(operation).catch(() => undefined);
  }, [trackSave]);

  return (
    <ManuscriptSaveStatusContext.Provider
      value={{ state, markUnsaved, discardUnsavedState, retry, trackSave }}
    >
      {children}
    </ManuscriptSaveStatusContext.Provider>
  );
};

export const useManuscriptSaveStatus = () =>
  useContext(ManuscriptSaveStatusContext);
