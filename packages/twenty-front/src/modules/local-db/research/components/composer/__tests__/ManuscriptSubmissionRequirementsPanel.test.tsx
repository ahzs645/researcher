import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ManuscriptSubmissionRequirementsPanel } from '@/local-db/research/components/composer/ManuscriptSubmissionRequirementsPanel';

const enqueueErrorSnackBar = jest.fn();

jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager', () => ({
  useDialogManager: () => ({ enqueueDialog: jest.fn() }),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar }),
}));

describe('ManuscriptSubmissionRequirementsPanel', () => {
  it('flushes changed checklist values when the panel unmounts', async () => {
    const onSaveValues = jest.fn(async () => undefined);
    const { unmount } = render(
      <ManuscriptSubmissionRequirementsPanel
        manuscript={{}}
        template={{
          id: 'journal-id',
          name: 'Test Journal',
          submissionRequirements: JSON.stringify([
            { key: 'ARTICLE_TYPE', required: true },
            { key: 'FUNDING_DECLARATION', required: true },
          ]),
        }}
        isExplicitTarget
        onConfirmTargetJournal={async () => undefined}
        onPickTargetJournal={jest.fn()}
        onSaveValues={onSaveValues}
        onSaveRequirements={async () => undefined}
        onKeepJournalValue={async () => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('Article type'), {
      target: { value: 'Research article' },
    });
    fireEvent.change(screen.getByLabelText('Funding declaration'), {
      target: { value: 'Example Council' },
    });
    unmount();

    await waitFor(() =>
      expect(onSaveValues).toHaveBeenCalledWith({
        ARTICLE_TYPE: 'Research article',
        FUNDING_DECLARATION: 'Example Council',
      }),
    );
  });
});
