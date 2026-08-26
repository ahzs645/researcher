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

  const SCREENED_MANUSCRIPT = {
    sections: [
      {
        id: 'availability',
        name: 'Data availability',
        sectionType: 'DATA_AVAILABILITY',
        content:
          'The data that support the findings of this study are available from the corresponding author upon reasonable request.',
      },
      {
        id: 'limitations',
        name: 'Limitations',
        sectionType: 'OTHER',
        content:
          'The case study is limited by the availability and reliability of filter start/end metadata.',
      },
    ],
  };

  const verdictFor = (label: string): string | undefined =>
    screen.getByText(label).parentElement?.firstElementChild?.textContent ??
    undefined;

  it('reports screening verdicts and the sentence each one matched', () => {
    render(
      <ManuscriptSubmissionRequirementsPanel
        manuscript={SCREENED_MANUSCRIPT}
        template={{
          id: 'journal-id',
          name: 'Test Journal',
          submissionRequirements: JSON.stringify([
            { key: 'ARTICLE_TYPE', required: true },
          ]),
        }}
        isExplicitTarget
        onConfirmTargetJournal={async () => undefined}
        onPickTargetJournal={jest.fn()}
        onSaveValues={async () => undefined}
        onSaveRequirements={async () => undefined}
        onKeepJournalValue={async () => undefined}
      />,
    );

    expect(verdictFor('Open data statement')).toBe('Weak');
    expect(verdictFor('Limitations acknowledged')).toBe('Found');
    expect(verdictFor('Trial registration')).toBe('Not found');
    expect(
      screen.getByText(
        /available from the corresponding author upon reasonable request/,
      ),
    ).toBeInTheDocument();
  });

  it('keeps screening findings separate from the journal checklist', () => {
    render(
      <ManuscriptSubmissionRequirementsPanel
        manuscript={SCREENED_MANUSCRIPT}
        template={{
          id: 'journal-id',
          name: 'Test Journal',
          submissionRequirements: JSON.stringify([
            { key: 'ARTICLE_TYPE', required: true },
          ]),
        }}
        isExplicitTarget
        onConfirmTargetJournal={async () => undefined}
        onPickTargetJournal={jest.fn()}
        onSaveValues={async () => undefined}
        onSaveRequirements={async () => undefined}
        onKeepJournalValue={async () => undefined}
      />,
    );

    const screening = screen.getByLabelText('Automated screening');

    expect(screening).toHaveTextContent(
      'These are screening findings, not journal requirements',
    );
    expect(screening).not.toHaveTextContent('Article type');
    expect(
      screen.getByText('Test Journal submission checklist'),
    ).toBeInTheDocument();
  });

  it('screens the manuscript even with no target journal picked', () => {
    render(
      <ManuscriptSubmissionRequirementsPanel
        manuscript={SCREENED_MANUSCRIPT}
        isExplicitTarget={false}
        onConfirmTargetJournal={async () => undefined}
        onPickTargetJournal={jest.fn()}
        onSaveValues={async () => undefined}
        onSaveRequirements={async () => undefined}
        onKeepJournalValue={async () => undefined}
      />,
    );

    expect(screen.getByText('Pick target journal')).toBeInTheDocument();
    expect(verdictFor('Limitations acknowledged')).toBe('Found');
  });
});
