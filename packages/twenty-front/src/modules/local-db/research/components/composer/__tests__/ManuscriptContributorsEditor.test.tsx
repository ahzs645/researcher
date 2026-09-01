import { fireEvent, render, screen } from '@testing-library/react';

import {
  ManuscriptContributorsEditor,
  type ManuscriptContributorValues,
} from '@/local-db/research/components/composer/ManuscriptContributorsEditor';
import {
  parseManuscriptContributorMetadata,
  serializeManuscriptContributorMetadata,
} from '@/local-db/research/manuscript/manuscriptContributorMetadata';

const initialValues: ManuscriptContributorValues = {
  authorLine: 'Ahmad Jalil [1*]; Hossein Kazemian [1,2]',
  affiliations: '1 Northern Analytical Lab\n2 Natural Resources',
  correspondingAuthor: 'Ahmad Jalil (ahmad@example.ca)',
};

const lastCall = (onChange: jest.Mock): ManuscriptContributorValues =>
  onChange.mock.calls[onChange.mock.calls.length - 1][0];

describe('ManuscriptContributorsEditor', () => {
  it('leaves the structured field alone while nothing structured is edited', () => {
    const onChange = jest.fn();
    render(
      <ManuscriptContributorsEditor
        initialValues={initialValues}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Author 1 name'), {
      target: { value: 'Ahmad K. Jalil' },
    });

    // A manuscript with no structured metadata must not start carrying an
    // empty one just because the editor now knows about the concept.
    expect(lastCall(onChange).authorLine).toBe(
      'Ahmad K. Jalil [1*]; Hossein Kazemian [1,2]',
    );
    expect(lastCall(onChange)).not.toHaveProperty('contributorMetadata');
  });

  it('keeps the structured fields behind a per-author disclosure', () => {
    render(
      <ManuscriptContributorsEditor
        initialValues={initialValues}
        onChange={jest.fn()}
      />,
    );

    expect(screen.queryByLabelText('Ahmad Jalil ORCID')).toBeNull();
    fireEvent.click(screen.getByLabelText('Details for author 1'));
    expect(screen.getByLabelText('Ahmad Jalil ORCID')).toBeVisible();
    // Only the author who was asked about opens.
    expect(screen.queryByLabelText('Hossein Kazemian ORCID')).toBeNull();
  });

  it('emits an ORCID and CRediT roles once they are filled in', () => {
    const onChange = jest.fn();
    render(
      <ManuscriptContributorsEditor
        initialValues={initialValues}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Details for author 1'));
    fireEvent.change(screen.getByLabelText('Ahmad Jalil ORCID'), {
      target: { value: '0000-0002-1825-0097' },
    });
    fireEvent.click(screen.getByLabelText('Ahmad Jalil Conceptualization'));

    const metadata = parseManuscriptContributorMetadata(
      lastCall(onChange).contributorMetadata,
    );
    expect(metadata.authors[0]).toMatchObject({
      authorId: 'author-1',
      name: 'Ahmad Jalil',
      orcid: '0000-0002-1825-0097',
      creditRoles: ['Conceptualization'],
    });
    // The byline still says exactly what it said before.
    expect(lastCall(onChange).authorLine).toBe(initialValues.authorLine);
  });

  it('warns about an ORCID whose check digit is wrong', () => {
    render(
      <ManuscriptContributorsEditor
        initialValues={initialValues}
        onChange={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Details for author 1'));
    fireEvent.change(screen.getByLabelText('Ahmad Jalil ORCID'), {
      target: { value: '0000-0002-1825-0098' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Check this ORCID');
  });

  it('renders the contributions statement as the roles are ticked', () => {
    render(
      <ManuscriptContributorsEditor
        initialValues={{
          ...initialValues,
          contributorMetadata: serializeManuscriptContributorMetadata({
            authors: [
              {
                authorId: 'author-1',
                name: 'Ahmad Jalil',
                creditRoles: ['Conceptualization', 'Methodology'],
              },
              {
                authorId: 'author-2',
                name: 'Hossein Kazemian',
                creditRoles: ['Supervision'],
              },
            ],
            affiliations: [],
            funding: [],
          }),
        }}
        onChange={jest.fn()}
      />,
    );

    expect(
      screen.getByText(/A\.J\.: Conceptualization, Methodology; H\.K\.:/),
    ).toBeVisible();
  });

  it('re-keys structured detail when an author moves up the byline', () => {
    const onChange = jest.fn();
    render(
      <ManuscriptContributorsEditor
        initialValues={{
          ...initialValues,
          contributorMetadata: serializeManuscriptContributorMetadata({
            authors: [
              {
                authorId: 'author-1',
                name: 'Ahmad Jalil',
                orcid: '0000-0002-1825-0097',
              },
            ],
            affiliations: [],
            funding: [],
          }),
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Move author 2 up'));

    const values = lastCall(onChange);
    expect(values.authorLine).toBe('Hossein Kazemian [1,2]; Ahmad Jalil [1*]');
    // Ahmad is now second, and his ORCID went with him rather than staying on
    // whoever holds first position.
    const metadata = parseManuscriptContributorMetadata(
      values.contributorMetadata,
    );
    expect(metadata.authors).toHaveLength(1);
    expect(metadata.authors[0]).toMatchObject({
      authorId: 'author-2',
      name: 'Ahmad Jalil',
      orcid: '0000-0002-1825-0097',
    });
  });

  it('records a funding award against the author who holds it', () => {
    const onChange = jest.fn();
    render(
      <ManuscriptContributorsEditor
        initialValues={initialValues}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add award' }));
    fireEvent.change(screen.getByLabelText('Award 1 funder'), {
      target: { value: 'NSERC' },
    });
    fireEvent.change(screen.getByLabelText('Award 1 identifier'), {
      target: { value: 'RGPIN-2019-1234' },
    });
    fireEvent.click(screen.getByLabelText('Award 1 recipient 1'));

    const metadata = parseManuscriptContributorMetadata(
      lastCall(onChange).contributorMetadata,
    );
    expect(metadata.funding[0]).toMatchObject({
      funder: 'NSERC',
      awardId: 'RGPIN-2019-1234',
      recipientAuthorIds: ['author-1'],
    });
    expect(
      screen.getByText(
        'This work was supported by NSERC (RGPIN-2019-1234 to A.J.).',
      ),
    ).toBeVisible();
  });

  it('clears the stored field when the author empties every structured value', () => {
    const onChange = jest.fn();
    render(
      <ManuscriptContributorsEditor
        initialValues={{
          ...initialValues,
          contributorMetadata: serializeManuscriptContributorMetadata({
            authors: [
              {
                authorId: 'author-1',
                name: 'Ahmad Jalil',
                orcid: '0000-0002-1825-0097',
              },
            ],
            affiliations: [],
            funding: [],
          }),
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Details for author 1'));
    fireEvent.change(screen.getByLabelText('Ahmad Jalil ORCID'), {
      target: { value: '' },
    });

    expect(lastCall(onChange).contributorMetadata).toBe('');
  });
});
