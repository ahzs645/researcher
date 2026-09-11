import { fireEvent, render, screen } from '@testing-library/react';
import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ManuscriptCitationProvenance } from '@/local-db/research/manuscript/manuscriptCitationProvenance';
import { validateSubmission } from '@/local-db/research/manuscript/manuscriptSubmission';
import { citationProvenanceInput } from '@/local-db/research/manuscript/__tests__/fixtures/citationProvenanceInput';
import { ManuscriptExportActionsCard } from '@/local-db/research/components/composer/export/ManuscriptExportActionsCard';

const renderCard = (
  provenance: ManuscriptCitationProvenance,
  isPreparing = false,
) => {
  const bundle = buildManuscriptBundle(
    citationProvenanceInput(provenance.requestedStyleId),
  );
  bundle.citationProvenance = provenance;
  const onExport = jest.fn();
  const onRetry = jest.fn();
  render(
    <ManuscriptExportActionsCard
      activeExportId={null}
      isPreparing={isPreparing}
      onRetryCitationFormatting={onRetry}
      exporters={[
        {
          id: 'blocknote-docx',
          label: 'Word',
          formats: ['DOCX'],
          offline: true,
          export: async () => [],
        },
      ]}
      readiness={validateSubmission(bundle, {})}
      warnings={[]}
      onExport={onExport}
      onPortableResearchExport={jest.fn()}
      onSubmissionPackageExport={jest.fn()}
    />,
  );
  return { onExport, onRetry };
};

describe('visible citation formatting status at export', () => {
  it('shows a persistent warning, allows a draft and blocks the submission button after a failed request', () => {
    const { onExport, onRetry } = renderCard({
      requestedStyleId: 'apa',
      appliedStyleId: 'built-in',
      engineOutcome: 'engine-error',
      errorMessage: 'XML load failed',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('XML load failed');
    expect(screen.getByRole('alert')).toHaveTextContent('built-in fallback');
    expect(
      screen.getByRole('button', { name: /^Submission package/ }),
    ).toBeDisabled();
    const draft = screen.getByRole('button', { name: /^Word \(\.docx\)/ });
    expect(draft).not.toBeDisabled();
    fireEvent.click(draft);
    expect(onExport).toHaveBeenCalledWith('blocknote-docx');
    fireEvent.click(
      screen.getByRole('button', { name: /^Recheck citation formatting/ }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('blocks actions while the selected request is still being checked', () => {
    renderCard(
      {
        requestedStyleId: 'apa',
        appliedStyleId: 'built-in',
        engineOutcome: 'not-prepared',
      },
      true,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking requested citation style',
    );
    expect(
      screen.getByRole('button', { name: /^Word \(\.docx\)/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /^Submission package/ }),
    ).toBeDisabled();
  });

  it('shows deliberate generic formatting as information rather than an alert', () => {
    renderCard({
      requestedStyleId: null,
      appliedStyleId: 'built-in',
      engineOutcome: 'not-requested',
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'generic formatting by configuration',
    );
    expect(
      screen.getByRole('button', { name: /^Submission package/ }),
    ).not.toBeDisabled();
  });

  it('shows the actually applied named style without blocking an otherwise ready package', () => {
    renderCard({
      requestedStyleId: 'apa',
      appliedStyleId: 'apa',
      engineOutcome: 'applied',
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Applied: "apa" via citeproc',
    );
    expect(
      screen.getByRole('button', { name: /^Submission package/ }),
    ).not.toBeDisabled();
  });
});
