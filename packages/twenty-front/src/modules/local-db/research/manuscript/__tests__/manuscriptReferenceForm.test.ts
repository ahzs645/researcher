import {
  referenceFormValuesWithEditedCsl,
  referenceFormValuesToRecordUpdate,
  validateReferenceCslJson,
} from '@/local-db/research/manuscript/manuscriptReferenceForm';

describe('validateReferenceCslJson', () => {
  it('accepts an empty value or a single CSL object', () => {
    expect(validateReferenceCslJson('')).toBeNull();
    expect(
      validateReferenceCslJson('{"id":"smith2024","type":"article-journal"}'),
    ).toBeNull();
  });

  it('returns an inline-safe error for invalid JSON and non-object JSON', () => {
    expect(validateReferenceCslJson('{invalid')).toBe(
      'CSL-JSON is not valid JSON.',
    );
    expect(validateReferenceCslJson('[{"id":"one"}]')).toBe(
      'CSL-JSON must be a single JSON object.',
    );
  });
});

describe('referenceFormValuesToRecordUpdate', () => {
  it('synchronizes edited structured fields into the preserved CSL object', () => {
    const update = referenceFormValuesToRecordUpdate(
      {
        authors: 'Smith, Jane',
        citationKey: 'smith2025',
        containerTitle: 'Updated Journal',
        cslJson: JSON.stringify({
          id: 'smith2024',
          type: 'article-journal',
          title: 'Old title',
          publisher: 'Preserved Publisher',
          'researcher:rawReference': 'Stale bibliography text',
        }),
        doi: '10.1000/updated',
        issue: '2',
        name: 'Updated title',
        pages: '10–20',
        url: '',
        volume: '5',
        year: '2025',
      },
      {
        id: 'reference-id',
        citationKey: 'smith2024',
        cslType: 'ARTICLE_JOURNAL',
      },
    );

    const csl = JSON.parse(update.cslJson as string);
    expect(csl).toMatchObject({
      id: 'smith2025',
      title: 'Updated title',
      publisher: 'Preserved Publisher',
      DOI: '10.1000/updated',
    });
    expect(csl['researcher:rawReference']).toBeUndefined();
  });
});

describe('referenceFormValuesWithEditedCsl', () => {
  it('applies known fields from an edited advanced CSL object', () => {
    const values = referenceFormValuesWithEditedCsl(
      {
        authors: 'Old, Author',
        citationKey: 'old2020',
        containerTitle: '',
        cslJson: JSON.stringify({
          id: 'new2026',
          type: 'article-journal',
          title: 'Advanced title',
          author: [{ family: 'New', given: 'Author' }],
          issued: { 'date-parts': [[2026]] },
        }),
        doi: '',
        issue: '',
        name: 'Old title',
        pages: '',
        url: '',
        volume: '',
        year: '2020',
      },
      '{"id":"old2020"}',
    );

    expect(values).toMatchObject({
      authors: 'New, Author',
      citationKey: 'new2026',
      name: 'Advanced title',
      year: '2026',
    });
  });
});
