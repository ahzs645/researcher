import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDefaultStore } from 'jotai';

import { ManuscriptRetractedReferenceWarnings } from '@/local-db/research/components/composer/references/ManuscriptRetractedReferenceWarnings';
import { manuscriptRetractionScanState } from '@/local-db/research/components/composer/references/manuscriptRetractionScanState';
import { summarizeRetractionScan } from '@/local-db/research/manuscript/manuscriptRetraction';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

const runRetractionScan = jest.fn();

jest.mock(
  '@/local-db/research/components/composer/references/manuscriptRetractionFetch',
  () => ({
    runRetractionScan: (references: unknown) => runRetractionScan(references),
  }),
);

const REFERENCES: ReferenceLike[] = [
  {
    id: 'ref-1',
    name: 'A retracted paper',
    citationKey: 'smith2019',
    doi: '10.1000/abc',
  },
  {
    id: 'ref-2',
    name: 'A sound paper',
    citationKey: 'jones2020',
    doi: '10.1000/def',
  },
];

const DONE_SUMMARY = summarizeRetractionScan({
  state: 'DONE',
  withoutDoiCount: 0,
  uncheckedCount: 0,
  results: [
    {
      referenceId: 'ref-1',
      citationKey: 'smith2019',
      title: 'A retracted paper',
      doi: '10.1000/abc',
      verdict: {
        status: 'RETRACTED',
        notices: [],
        summary: 'Retraction (2021-04-01)',
      },
    },
  ],
});

const storedScan = () =>
  getDefaultStore().get(manuscriptRetractionScanState.atom);

describe('ManuscriptRetractedReferenceWarnings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDefaultStore().set(manuscriptRetractionScanState.atom, null);
    runRetractionScan.mockResolvedValue(DONE_SUMMARY);
  });

  it('publishes a completed scan so the export panel can report it', async () => {
    render(
      <ManuscriptRetractedReferenceWarnings
        manuscriptId="paper-1"
        references={REFERENCES}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Check references for retractions/,
      }),
    );

    await waitFor(() => expect(storedScan()).not.toBeNull());
    expect(storedScan()).toEqual({
      manuscriptId: 'paper-1',
      summary: DONE_SUMMARY,
      checkedReferenceIds: ['ref-1', 'ref-2'],
    });
    expect(await screen.findByText('A retracted paper')).toBeInTheDocument();
  });

  // A scan is only ever true of the reference list it ran over, so a reference
  // added afterwards has to retire it — including for the export panel, which
  // has no way of telling that the bibliography moved underneath it.
  it('retires the scan when the reference list changes', async () => {
    const { rerender } = render(
      <ManuscriptRetractedReferenceWarnings
        manuscriptId="paper-1"
        references={REFERENCES}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Check references for retractions/,
      }),
    );
    await waitFor(() => expect(storedScan()).not.toBeNull());

    rerender(
      <ManuscriptRetractedReferenceWarnings
        manuscriptId="paper-1"
        references={[
          ...REFERENCES,
          { id: 'ref-3', name: 'A new paper', doi: '10.1000/ghi' },
        ]}
      />,
    );

    expect(
      await screen.findByText(/reference list changed since the last check/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('A retracted paper')).not.toBeInTheDocument();
    await waitFor(() => expect(storedScan()?.summary.state).toBe('IDLE'));
    expect(storedScan()?.checkedReferenceIds).toEqual([
      'ref-1',
      'ref-2',
      'ref-3',
    ]);
  });

  // Reordering a bibliography changes nothing about what Crossref said.
  it('keeps a scan when the same references are merely reordered', async () => {
    const { rerender } = render(
      <ManuscriptRetractedReferenceWarnings
        manuscriptId="paper-1"
        references={REFERENCES}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Check references for retractions/,
      }),
    );
    await waitFor(() => expect(storedScan()).not.toBeNull());

    rerender(
      <ManuscriptRetractedReferenceWarnings
        manuscriptId="paper-1"
        references={[...REFERENCES].reverse()}
      />,
    );

    expect(storedScan()?.summary.state).toBe('DONE');
    expect(screen.getByText('A retracted paper')).toBeInTheDocument();
  });
});
