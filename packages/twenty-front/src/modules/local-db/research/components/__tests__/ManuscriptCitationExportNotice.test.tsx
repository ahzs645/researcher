import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ManuscriptExportPanel } from '@/local-db/research/components/ManuscriptExportPanel';
import { useManuscriptCitationPreparation } from '@/local-db/research/components/composer/export/useManuscriptCitationPreparation';
import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  downloadExportFile,
  getManuscriptExporters,
} from '@/local-db/research/manuscript/manuscriptExport';
import { withCitationFormattingReport } from '@/local-db/research/manuscript/manuscriptExportProvenance';
import { citationProvenanceInput } from '@/local-db/research/manuscript/__tests__/fixtures/citationProvenanceInput';

const enqueueWarningSnackBar = jest.fn();
const enqueueSuccessSnackBar = jest.fn();
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueWarningSnackBar,
    enqueueSuccessSnackBar,
    enqueueErrorSnackBar: jest.fn(),
  }),
}));
jest.mock(
  '@/local-db/research/components/composer/export/useManuscriptCitationPreparation',
  () => ({ useManuscriptCitationPreparation: jest.fn() }),
);
jest.mock(
  '@/local-db/research/components/composer/export/ManuscriptExportStyleCard',
  () => ({ ManuscriptExportStyleCard: () => null }),
);
jest.mock(
  '@/local-db/research/components/composer/export/ManuscriptJournalFormatCard',
  () => ({ ManuscriptJournalFormatCard: () => null }),
);
jest.mock('@/local-db/research/manuscript/manuscriptExport', () => ({
  getManuscriptExporters: jest.fn(),
  downloadExportFile: jest.fn(),
}));
jest.mock('@/local-db/research/manuscript/manuscriptSubmissionPackage', () => ({
  createSubmissionPackage: jest.fn(),
  createPortableResearchPackage: jest.fn(),
}));

describe('draft download notification', () => {
  it('does not show a clean success toast after a requested style fell back', async () => {
    jest.clearAllMocks();
    const input = citationProvenanceInput('not-vendored');
    const bundle = buildManuscriptBundle(input);
    jest
      .mocked(useManuscriptCitationPreparation)
      .mockImplementation((source) => ({
        bundle: {
          ...source,
          citationProvenance: {
            requestedStyleId: 'not-vendored',
            appliedStyleId: 'built-in',
            engineOutcome: 'style-not-vendored',
          },
        },
        isPreparing: false,
        preparationError: null,
        retry: jest.fn(),
      }));
    jest.mocked(getManuscriptExporters).mockReturnValue([
      {
        id: 'blocknote-docx',
        label: 'Word',
        formats: ['DOCX'],
        offline: true,
        export: async (prepared) =>
          withCitationFormattingReport(prepared, [
            {
              filename: 'draft.docx',
              mimeType: 'application/docx',
              content: 'test document',
            },
          ]),
      },
    ]);
    render(
      <ManuscriptExportPanel
        bundle={bundle}
        journals={[]}
        selectedJournalId={null}
        onSelectJournal={jest.fn()}
        initialStyleOverrides={{}}
        onSaveStyleOverrides={async () => undefined}
        materials={{}}
        portableSource={{
          manuscript: { title: 'Fixture' },
          sections: input.sections,
          figures: [],
          references: input.references,
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Word \(\.docx\)/ }));
    await waitFor(() =>
      expect(enqueueWarningSnackBar).toHaveBeenCalledWith({
        message: expect.stringContaining('Not applied'),
      }),
    );
    expect(enqueueSuccessSnackBar).not.toHaveBeenCalled();
    expect(downloadExportFile).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toHaveTextContent('not-vendored');
    expect(
      screen.getByRole('button', { name: /^Submission package/ }),
    ).toBeDisabled();
  });
});
