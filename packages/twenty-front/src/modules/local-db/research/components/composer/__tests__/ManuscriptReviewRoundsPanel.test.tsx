import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ManuscriptReviewRoundsPanel } from '@/local-db/research/components/composer/ManuscriptReviewRoundsPanel';
import { type ReviewRoundRecord } from '@/local-db/research/components/composer/useManuscriptReviewRounds';
import { downloadExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import { parseDecisionLetter } from '@/local-db/research/manuscript/manuscriptReviewLetter';
import {
  reviewPointsFromLetter,
  serializeReviewPoints,
  updateReviewPoint,
} from '@/local-db/research/manuscript/manuscriptReviewRound';

jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager', () => ({
  useDialogManager: () => ({ enqueueDialog: jest.fn() }),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({ enqueueErrorSnackBar: jest.fn() }),
}));
// The real ones pull in a document engine; the panel only has to prove which
// file it asked for.
jest.mock('@/local-db/research/manuscript/manuscriptExport', () => ({
  downloadExportFile: jest.fn(),
}));
jest.mock('@/local-db/research/manuscript/manuscriptDocxExport', () => ({
  exportStandaloneMarkdownToDocxBlob: jest.fn(
    async () => new Blob(['docx'], { type: 'application/docx' }),
  ),
}));
jest.mock('@/local-db/research/manuscript/manuscriptDocxFile', () => ({
  readImportedDocumentFile: jest.fn(),
}));

const LETTER = [
  'Reviewer 1',
  '',
  '1. The introduction is too long.',
  '2. Figure 3 is unreadable at print size.',
  '',
  'Reviewer 2',
  '',
  '1. Report the uncertainty on the hourly means.',
].join('\n');

const SECTIONS = [
  { id: 'introduction', name: 'Introduction' },
  { id: 'results', name: 'Results' },
  { id: 'results-mdpi', name: 'Results for MDPI', variantOfId: 'results' },
];

const parsedRound = (): ReviewRoundRecord => ({
  id: 'round-1',
  name: 'Round 1',
  journal: 'Atmospheric Environment',
  decision: 'MAJOR_REVISION',
  decisionDate: '2026-03-04T00:00:00.000Z',
  letter: LETTER,
  points: serializeReviewPoints(
    updateReviewPoint(
      reviewPointsFromLetter(parseDecisionLetter(LETTER)),
      'reviewer-1-1',
      { response: 'Shortened by 300 words.', sectionId: 'introduction' },
    ),
  ),
});

const renderPanel = (
  rounds: ReviewRoundRecord[],
  handlers: {
    onCreateRound?: jest.Mock;
    onSaveRound?: jest.Mock;
    onDeleteRound?: jest.Mock;
  } = {},
) => {
  const onCreateRound =
    handlers.onCreateRound ?? jest.fn(async () => undefined);
  const onSaveRound = handlers.onSaveRound ?? jest.fn(async () => undefined);
  const onDeleteRound =
    handlers.onDeleteRound ?? jest.fn(async () => undefined);
  render(
    <ManuscriptReviewRoundsPanel
      manuscriptTitle="Reusable air-quality paper"
      defaultJournal="Atmospheric Environment"
      sections={SECTIONS}
      rounds={rounds}
      onCreateRound={onCreateRound}
      onSaveRound={onSaveRound}
      onDeleteRound={onDeleteRound}
    />,
  );
  return { onCreateRound, onSaveRound, onDeleteRound };
};

describe('ManuscriptReviewRoundsPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers to start a round on the manuscript’s journal when there are none', async () => {
    const { onCreateRound } = renderPanel([]);

    expect(screen.getByText(/No review rounds yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add review round'));

    await waitFor(() =>
      expect(onCreateRound).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Round 1',
          journal: 'Atmospheric Environment',
        }),
      ),
    );
  });

  it('reads the pasted letter into points and saves them', async () => {
    const { onSaveRound } = renderPanel([
      { id: 'round-1', name: 'Round 1', letter: LETTER },
    ]);

    fireEvent.click(screen.getByText('Read points from the letter'));

    expect(screen.getByText('Reviewer 1')).toBeInTheDocument();
    expect(screen.getByText('Reviewer 2')).toBeInTheDocument();
    expect(
      screen.getByText('Figure 3 is unreadable at print size.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Points (0 of 3 answered)')).toBeInTheDocument();
    await waitFor(() =>
      expect(onSaveRound).toHaveBeenCalledWith(
        'round-1',
        expect.objectContaining({ letter: LETTER }),
      ),
    );
    expect(
      JSON.parse(onSaveRound.mock.calls[0][1].points as string),
    ).toHaveLength(3);
  });

  it('shows what the parser could not do rather than hiding it', () => {
    renderPanel([
      {
        id: 'round-1',
        name: 'Round 1',
        letter: 'We regret that we cannot accept this manuscript.',
      },
    ]);

    fireEvent.click(screen.getByText('Read points from the letter'));

    expect(
      screen.getByText(
        /No reviewer headings or numbered points were recognised/,
      ),
    ).toBeInTheDocument();
  });

  it('saves a response when the author leaves the field', async () => {
    const { onSaveRound } = renderPanel([parsedRound()]);

    const field = screen.getByLabelText(
      'Response to comment 1 from Reviewer 2',
    );
    fireEvent.change(field, {
      target: { value: 'Uncertainty is now reported in Table 2.' },
    });
    fireEvent.blur(field);

    await waitFor(() => expect(onSaveRound).toHaveBeenCalled());
    const saved = JSON.parse(onSaveRound.mock.calls[0][1].points as string);
    expect(saved[2].response).toBe('Uncertainty is now reported in Table 2.');
    expect(saved[0].response).toBe('Shortened by 300 words.');
  });

  it('names the changed section by reference, and leaves versions out', async () => {
    const { onSaveRound } = renderPanel([parsedRound()]);

    const select = screen.getByLabelText(
      'Section changed for comment 2 from Reviewer 1',
    );
    expect(
      screen.queryAllByRole('option', { name: 'Results for MDPI' }),
    ).toHaveLength(0);
    fireEvent.change(select, { target: { value: 'results' } });

    await waitFor(() => expect(onSaveRound).toHaveBeenCalled());
    expect(
      JSON.parse(onSaveRound.mock.calls[0][1].points as string)[1].sectionId,
    ).toBe('results');
  });

  it('builds the response document from the points on screen', () => {
    renderPanel([parsedRound()]);

    fireEvent.click(screen.getByText('Markdown'));

    expect(downloadExportFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'reusable-air-quality-paper-round-1-response.md',
        mimeType: 'text/markdown',
      }),
    );
    const { content } = (downloadExportFile as jest.Mock).mock.calls[0][0];
    expect(content).toContain('# Response to reviewers');
    expect(content).toContain('> The introduction is too long.');
    expect(content).toContain('Shortened by 300 words.');
    expect(content).toContain('*Changed in: Introduction*');
  });

  it('lets the author move between rounds', () => {
    renderPanel([
      parsedRound(),
      { id: 'round-0', name: 'Round 0', letter: '', points: '' },
    ]);

    expect(screen.getByText('Points (1 of 3 answered)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Review round'), {
      target: { value: 'round-0' },
    });
    expect(screen.getByText('Points (0 of 0 answered)')).toBeInTheDocument();
    expect(
      screen.getByText(/No points yet. Paste or import the decision letter/),
    ).toBeInTheDocument();
  });
});
