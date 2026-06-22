import {
  createDocumentLabeler,
  labelObligationDocument,
  type AiDocumentLabeler,
  type DocumentLabels,
} from '../researchObligationLabeling';

describe('researchObligationLabeling', () => {
  describe('labelObligationDocument', () => {
    it('puts structured tags (type, period, funder, project) up front', () => {
      const { keywords } = labelObligationDocument({
        obligationType: 'PROGRESS_REPORT',
        reportingPeriod: '2026',
        funder: 'NSERC',
        projectName: 'Topological insulators',
        fileName: 'nserc-progress-2026.pdf',
      });

      expect(keywords.slice(0, 4)).toEqual([
        'progress report',
        '2026',
        'NSERC',
        'Topological insulators',
      ]);
    });

    it('mines free text for frequent keywords and drops stop-words', () => {
      const { keywords } = labelObligationDocument({
        title: 'Spintronic memory progress',
        textContent:
          'The spintronic memory experiments and the spintronic fabrication are on track.',
      });

      // "spintronic" is the most frequent meaningful token; stop-words like
      // "the"/"and"/"are" never appear.
      expect(keywords).toContain('spintronic');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('and');
    });

    it('dedupes case-insensitively and caps the list', () => {
      const { keywords } = labelObligationDocument({
        title: 'Budget Budget BUDGET budget budget',
        textContent: Array.from(
          { length: 40 },
          (_, index) => `term${index}`,
        ).join(' '),
      });

      const budgets = keywords.filter((k) => k.toLowerCase() === 'budget');
      expect(budgets).toHaveLength(1);
      expect(keywords.length).toBeLessThanOrEqual(12);
    });

    it('infers kind from content hints, most-specific first', () => {
      // "receipt" beats the generic "report" wording.
      expect(
        labelObligationDocument({
          fileName: 'travel-receipt-report.pdf',
        }).suggestedKind,
      ).toBe('RECEIPT');

      expect(
        labelObligationDocument({ fileName: 'ethics-approval.pdf' })
          .suggestedKind,
      ).toBe('APPROVAL');

      expect(
        labelObligationDocument({ title: 'Annual progress report' })
          .suggestedKind,
      ).toBe('REPORT');
    });

    it('falls back to the obligation type default kind when no hint matches', () => {
      expect(
        labelObligationDocument({
          obligationType: 'FINANCIAL_REPORT',
          fileName: 'attachment-q1.bin',
        }).suggestedKind,
      ).toBe('FINANCIAL');

      expect(
        labelObligationDocument({
          obligationType: 'ETHICS_RENEWAL',
          fileName: 'attachment.bin',
        }).suggestedKind,
      ).toBe('APPROVAL');
    });

    it('builds a human-readable summary with period and context', () => {
      const { summary } = labelObligationDocument({
        obligationType: 'PROGRESS_REPORT',
        reportingPeriod: '2026',
        funder: 'NSERC Discovery',
        projectName: 'Topological insulators',
      });

      expect(summary).toBe(
        'Progress report for 2026 — NSERC Discovery · Topological insulators',
      );
    });

    it('handles an empty input without throwing', () => {
      const labels = labelObligationDocument({});
      expect(labels.keywords).toEqual([]);
      expect(labels.suggestedKind).toBe('SUPPORTING');
      expect(typeof labels.summary).toBe('string');
    });
  });

  describe('createDocumentLabeler', () => {
    it('wraps the deterministic labeler when no AI seam is injected', async () => {
      const labeler = createDocumentLabeler();
      const result = await labeler({ fileName: 'final-report.pdf' });
      expect(result.suggestedKind).toBe('REPORT');
    });

    it('delegates to the injected AI labeler when provided', async () => {
      const aiResult: DocumentLabels = {
        keywords: ['ai', 'generated'],
        suggestedKind: 'OTHER',
        summary: 'From the model',
      };
      const aiLabeler: AiDocumentLabeler = jest.fn().mockResolvedValue(aiResult);

      const labeler = createDocumentLabeler(aiLabeler);
      const result = await labeler({ fileName: 'anything.pdf' });

      expect(result).toEqual(aiResult);
      expect(aiLabeler).toHaveBeenCalledTimes(1);
    });
  });
});
