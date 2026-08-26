import { render } from '@testing-library/react';
import { getDefaultStore } from 'jotai';

import { ManuscriptExportPanel } from '@/local-db/research/components/ManuscriptExportPanel';
import {
  manuscriptRetractionScanState,
  type ManuscriptRetractionScan,
} from '@/local-db/research/components/composer/references/manuscriptRetractionScanState';
import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { summarizeRetractionScan } from '@/local-db/research/manuscript/manuscriptRetraction';
import { type PortableManuscriptSource } from '@/local-db/research/manuscript/manuscriptPortableManifest';

// Everything the readiness list does not need: the exporters drag in BlockNote
// and react-pdf, which ship ESM Jest will not parse, and the two settings cards
// want the record layer. What is under test is which checks the panel computes
// and shows.
jest.mock('@/local-db/research/manuscript/manuscriptDocxExport', () => ({
  exportManuscriptToDocxBlob: jest.fn(async () => new Blob(['manuscript'])),
  exportStandaloneMarkdownToDocxBlob: jest.fn(
    async () => new Blob(['companion']),
  ),
}));
jest.mock('@/local-db/research/manuscript/manuscriptExport', () => ({
  getManuscriptExporters: () => [],
  downloadExportFile: jest.fn(),
}));
jest.mock(
  '@/local-db/research/components/composer/export/ManuscriptJournalFormatCard',
  () => ({ ManuscriptJournalFormatCard: () => null }),
);
jest.mock(
  '@/local-db/research/components/composer/export/ManuscriptExportStyleCard',
  () => ({ ManuscriptExportStyleCard: () => null }),
);
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueSuccessSnackBar: jest.fn(),
    enqueueErrorSnackBar: jest.fn(),
  }),
}));

const SECTIONS = [
  {
    id: 'abstract',
    name: 'Abstract',
    sectionType: 'ABSTRACT',
    placement: 'FRONT_MATTER',
    content: 'A concise abstract for the export panel.',
    includeInExport: true,
  },
  {
    id: 'results',
    name: 'Results',
    sectionType: 'RESULTS',
    placement: 'MAIN',
    content: 'The measurements agreed with the model.',
    includeInExport: true,
  },
];

const REFERENCES = [
  {
    id: 'ref-1',
    name: 'A retracted paper',
    citationKey: 'smith2019',
    doi: '10.1000/abc',
  },
];

const BUNDLE_INPUT: BuildBundleInput = {
  manuscript: {
    id: 'paper-1',
    name: 'An exportable manuscript',
    authorLine: 'A. Researcher',
  },
  sections: SECTIONS,
  figures: [],
  references: REFERENCES,
  style: { name: 'Test journal' },
};

const PORTABLE_SOURCE: PortableManuscriptSource = {
  manuscript: { title: 'An exportable manuscript' },
  sections: SECTIONS,
  figures: [],
  references: REFERENCES,
};

const renderPanel = () =>
  render(
    <ManuscriptExportPanel
      manuscriptId="paper-1"
      bundle={buildManuscriptBundle(BUNDLE_INPUT)}
      journals={[]}
      selectedJournalId={null}
      onSelectJournal={jest.fn()}
      initialStyleOverrides={{}}
      onSaveStyleOverrides={async () => undefined}
      materials={{}}
      portableSource={PORTABLE_SOURCE}
    />,
  );

const setScan = (scan: ManuscriptRetractionScan | null) => {
  getDefaultStore().set(manuscriptRetractionScanState.atom, scan);
};

describe('ManuscriptExportPanel readiness', () => {
  beforeEach(() => {
    setScan(null);
  });

  it('screens the manuscript and reports the findings without blocking', () => {
    const { container } = renderPanel();

    expect(container.textContent).toContain('Automated screening');
    // A manuscript with no statements section has plenty absent, and the line
    // has to name them rather than leave the author counting.
    expect(container.textContent).toContain('Open data statement');
    expect(container.textContent).not.toContain('! Automated screening');
  });

  it('asks for a retraction check when none has been run for this manuscript', () => {
    const { container } = renderPanel();

    expect(container.textContent).toContain(
      'have not been checked against Crossref',
    );
  });

  it('reports what a finished scan found instead of asking for one', () => {
    setScan({
      manuscriptId: 'paper-1',
      checkedReferenceIds: ['ref-1'],
      summary: summarizeRetractionScan({
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
      }),
    });

    const { container } = renderPanel();

    expect(container.textContent).toContain('Retracted reference');
    expect(container.textContent).toContain('smith2019');
    expect(container.textContent).not.toContain(
      'have not been checked against Crossref',
    );
    // A retracted citation is a required item, so the package cannot be built
    // until it is dealt with.
    expect(container.textContent).toContain('1 required item');
  });

  it('ignores a scan run against another manuscript', () => {
    setScan({
      manuscriptId: 'another-paper',
      checkedReferenceIds: ['ref-1'],
      summary: summarizeRetractionScan({
        state: 'DONE',
        withoutDoiCount: 0,
        uncheckedCount: 0,
        results: [],
      }),
    });

    const { container } = renderPanel();

    expect(container.textContent).toContain(
      'have not been checked against Crossref',
    );
  });
});
