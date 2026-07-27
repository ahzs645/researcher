import { act, renderHook, waitFor } from '@testing-library/react';

import { useImportAsNewManuscript } from '@/local-db/research/import-wizard/hooks/useImportAsNewManuscript';
import { type ManuscriptImportWizardOptions } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';

const mockCreateOneRecord = jest.fn();
const mockDeleteOneRecord = jest.fn();
const mockOpenManuscriptImportWizard = jest.fn();

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({ createOneRecord: mockCreateOneRecord }),
}));

jest.mock('@/object-record/hooks/useDeleteOneRecord', () => ({
  useDeleteOneRecord: () => ({ deleteOneRecord: mockDeleteOneRecord }),
}));

jest.mock(
  '@/local-db/research/import-wizard/hooks/useOpenManuscriptImportWizard',
  () => ({
    useOpenManuscriptImportWizard: () => ({
      openManuscriptImportWizard: mockOpenManuscriptImportWizard,
    }),
  }),
);

const getWizardOptions = (): ManuscriptImportWizardOptions =>
  mockOpenManuscriptImportWizard.mock.calls[0][0];

describe('useImportAsNewManuscript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateOneRecord.mockResolvedValue({ id: 'new-manuscript' });
    mockDeleteOneRecord.mockResolvedValue(undefined);
  });

  it('should open the wizard against a fresh empty shell when started', async () => {
    const onImported = jest.fn();
    const { result } = renderHook(() =>
      useImportAsNewManuscript({ onImported }),
    );

    await act(async () => {
      await result.current.startImportAsNewManuscript();
    });

    expect(mockCreateOneRecord).toHaveBeenCalledWith({
      name: 'Untitled manuscript',
      status: 'DRAFTING',
    });
    expect(getWizardOptions()).toMatchObject({
      manuscriptId: 'new-manuscript',
      existingSectionCount: 0,
      existingSections: [],
      existingReferences: [],
      existingFigureRefKeys: [],
    });
    expect(result.current.isImportingNewManuscript).toBe(true);
  });

  it('should keep the manuscript and report it when content was imported', async () => {
    const onImported = jest.fn();
    const onManuscriptsChanged = jest.fn();
    const { result } = renderHook(() =>
      useImportAsNewManuscript({ onImported, onManuscriptsChanged }),
    );

    await act(async () => {
      await result.current.startImportAsNewManuscript();
    });

    act(() => {
      getWizardOptions().onChanged();
      getWizardOptions().onClosed?.();
    });

    expect(onImported).toHaveBeenCalledWith('new-manuscript');
    expect(mockDeleteOneRecord).not.toHaveBeenCalled();
    expect(result.current.isImportingNewManuscript).toBe(false);
  });

  it('should discard the shell when the wizard closes without importing', async () => {
    const onImported = jest.fn();
    const onManuscriptsChanged = jest.fn();
    const { result } = renderHook(() =>
      useImportAsNewManuscript({ onImported, onManuscriptsChanged }),
    );

    await act(async () => {
      await result.current.startImportAsNewManuscript();
    });
    onManuscriptsChanged.mockClear();

    act(() => {
      getWizardOptions().onClosed?.();
    });

    expect(onImported).not.toHaveBeenCalled();
    expect(mockDeleteOneRecord).toHaveBeenCalledWith('new-manuscript');
    await waitFor(() => expect(onManuscriptsChanged).toHaveBeenCalled());
  });

  it('should not open the wizard when the shell could not be created', async () => {
    mockCreateOneRecord.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useImportAsNewManuscript({ onImported: jest.fn() }),
    );

    await act(async () => {
      await result.current.startImportAsNewManuscript();
    });

    expect(mockOpenManuscriptImportWizard).not.toHaveBeenCalled();
    expect(result.current.isImportingNewManuscript).toBe(false);
  });

  it('should ignore a second start while one import is already running', async () => {
    const { result } = renderHook(() =>
      useImportAsNewManuscript({ onImported: jest.fn() }),
    );

    await act(async () => {
      await result.current.startImportAsNewManuscript();
    });
    await act(async () => {
      await result.current.startImportAsNewManuscript();
    });

    expect(mockCreateOneRecord).toHaveBeenCalledTimes(1);
  });
});
