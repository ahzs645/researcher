import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ManuscriptSubmissionRequirementsPanel } from '@/local-db/research/components/composer/ManuscriptSubmissionRequirementsPanel';
import { type FigureLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { type SubmissionRequirementManuscript } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

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

describe('ManuscriptSubmissionRequirementsPanel screening axes', () => {
  // Rendered through one helper because the panel takes eight props and only
  // two of them vary across these cases.
  const renderPanel = (
    manuscript: SubmissionRequirementManuscript,
    figures?: FigureLike[],
  ) =>
    render(
      <ManuscriptSubmissionRequirementsPanel
        manuscript={manuscript}
        figures={figures}
        isExplicitTarget={false}
        onConfirmTargetJournal={async () => undefined}
        onPickTargetJournal={jest.fn()}
        onSaveValues={async () => undefined}
        onSaveRequirements={async () => undefined}
        onKeepJournalValue={async () => undefined}
      />,
    );

  const AEROSOL_METHODS = {
    sections: [
      {
        id: 'methods',
        name: 'Methods',
        sectionType: 'METHODS',
        content:
          'Filter samples were collected on quartz fibre filters and analysed by thermal-optical transmittance.',
      },
    ],
  };

  // Seven grey "not found" rows on an aerosol paper would teach the author to
  // stop reading the panel; saying nothing at all would hide that the checks
  // ran. One quiet line is the answer.
  it('names the checks that do not apply instead of scoring them', () => {
    renderPanel(AEROSOL_METHODS);

    const screening = screen.getByLabelText('Automated screening');

    expect(screening).toHaveTextContent('Not applicable to this manuscript');
    expect(screening).toHaveTextContent('Cell line authentication');
    expect(screening).not.toHaveTextContent('Not found Cell line');
  });

  it('names the figure a figure finding is about', () => {
    renderPanel(AEROSOL_METHODS, [
      {
        id: 'figure-1',
        name: 'Figure 1',
        assetKind: 'FIGURE',
        caption: '',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);

    expect(screen.getByText('Figure 1 has no caption.')).toBeInTheDocument();
  });

  describe('verifying a trial registration', () => {
    const REGISTERED_MANUSCRIPT = {
      sections: [
        {
          id: 'registration',
          name: 'Trial registration',
          sectionType: 'OTHER',
          content:
            'This trial was registered at ClinicalTrials.gov under NCT04280705.',
        },
      ],
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('offers a button and never fetches on render', () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;

      renderPanel(REGISTERED_MANUSCRIPT);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        screen.getByText('Verify with ClinicalTrials.gov'),
      ).toBeInTheDocument();
    });

    it('shows the registry’s own answer once the button is pressed', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          protocolSection: {
            identificationModule: {
              nctId: 'NCT04280705',
              briefTitle: 'Adaptive COVID-19 Treatment Trial (ACTT)',
            },
            statusModule: { overallStatus: 'COMPLETED' },
          },
        }),
      }) as unknown as typeof fetch;

      renderPanel(REGISTERED_MANUSCRIPT);
      fireEvent.click(screen.getByText('Verify with ClinicalTrials.gov'));

      await waitFor(() =>
        expect(
          screen.getByText(/Adaptive COVID-19 Treatment Trial/),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByText('1 identifier resolved to a registered study'),
      ).toBeInTheDocument();
    });

    it('offers no button when the manuscript carries no registration number', () => {
      renderPanel(AEROSOL_METHODS);

      expect(
        screen.queryByText('Verify with ClinicalTrials.gov'),
      ).not.toBeInTheDocument();
    });
  });
});
