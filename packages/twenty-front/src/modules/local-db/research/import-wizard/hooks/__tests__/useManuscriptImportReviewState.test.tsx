import { act, renderHook, waitFor } from '@testing-library/react';

import { useManuscriptImportReviewState } from '@/local-db/research/import-wizard/hooks/useManuscriptImportReviewState';
import { type ManuscriptImportWizardOptions } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  buildPortableResearchPaperManifest,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';

const mockCommitImport = jest.fn();

jest.mock(
  '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit',
  () => ({
    useManuscriptImportCommit: () => ({
      commitImport: mockCommitImport,
      rollbackImport: jest.fn(),
      isCommitting: false,
      failed: false,
      createdCounts: { references: 0, sections: 0, figures: 0 },
    }),
  }),
);

const portableSource: PortableManuscriptSource = {
  manuscript: { title: 'Portable aerosol paper' },
  sections: [
    {
      id: 'introduction-id',
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'Restored prose.',
      orderIndex: 0,
    },
  ],
  figures: [],
  references: [],
};

const portableDocument = (): ImportedDocument => ({
  title: 'Portable aerosol paper',
  sections: [
    {
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'Restored prose.',
      orderIndex: 0,
      wordCount: 2,
      includeInExport: true,
    },
  ],
  portablePackage: buildPortableResearchPaperManifest(portableSource, {}, {}),
});

const wordDocument = (): ImportedDocument => ({
  title: 'A Word draft',
  sections: [
    {
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'Prose read out of a .docx.',
      orderIndex: 0,
      wordCount: 5,
      includeInExport: true,
    },
  ],
});

const renderReviewState = (
  initialDocument: ImportedDocument,
  onClose: () => void,
  onChanged: () => void = jest.fn(),
) => {
  const options: ManuscriptImportWizardOptions = {
    manuscriptId: 'manuscript-1',
    existingSectionCount: 0,
    existingSections: [],
    existingReferences: [],
    existingFigureRefKeys: [],
    onChanged,
  };
  return renderHook(() =>
    useManuscriptImportReviewState({
      initialDocument,
      reconcile: false,
      options,
      onClose,
      registerCommitState: jest.fn(),
    }),
  );
};

describe('useManuscriptImportReviewState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCommitImport.mockResolvedValue(true);
  });

  it('should restore a first-party package without waiting to be confirmed', async () => {
    const onClose = jest.fn();
    const onChanged = jest.fn();
    renderReviewState(portableDocument(), onClose, onChanged);

    await waitFor(() => expect(mockCommitImport).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The restored summary stays on screen; the wizard closes on "Done".
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should restore a package once, however often the hook re-renders', async () => {
    const { rerender } = renderReviewState(portableDocument(), jest.fn());

    await waitFor(() => expect(mockCommitImport).toHaveBeenCalledTimes(1));
    rerender();
    rerender();

    expect(mockCommitImport).toHaveBeenCalledTimes(1);
  });

  it('should leave a Word document waiting for the reviewer', async () => {
    const onClose = jest.fn();
    const { result } = renderReviewState(wordDocument(), onClose);

    // Nothing is written until the reviewer says so.
    await waitFor(() => expect(result.current.summary).toBeDefined());
    expect(mockCommitImport).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmImport();
    });

    expect(mockCommitImport).toHaveBeenCalledTimes(1);
    // A hand-confirmed import has already shown its result, so it closes.
    expect(onClose).toHaveBeenCalled();
  });
});
