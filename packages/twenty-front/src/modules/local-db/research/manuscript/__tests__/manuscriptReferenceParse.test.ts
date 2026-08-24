import {
  extractReferenceDoi,
  parseReferenceAuthorHead,
  parseReferenceEntryFields,
} from '@/local-db/research/manuscript/manuscriptReferenceParse';

describe('parseReferenceAuthorHead', () => {
  it('splits families from initials across the comma conventions', () => {
    expect(
      parseReferenceAuthorHead('Bond, T. C., Doherty, S. J., and Fahey, D. W.'),
    ).toEqual({
      authors: [
        { family: 'Bond', given: 'T. C.' },
        { family: 'Doherty', given: 'S. J.' },
        { family: 'Fahey', given: 'D. W.' },
      ],
      truncatedAuthors: false,
    });
    // Hyphenated initials, an ampersand, and a semicolon-separated list.
    expect(
      parseReferenceAuthorHead('Jeong, C.-H.; Lee, D.-W. & Kim, E.').authors,
    ).toEqual([
      { family: 'Jeong', given: 'C.-H.' },
      { family: 'Lee', given: 'D.-W.' },
      { family: 'Kim', given: 'E.' },
    ]);
    // Vancouver runs the initials on without punctuation.
    expect(parseReferenceAuthorHead('Mendell MJ, Eliseeva EA, et al.')).toEqual(
      {
        authors: [
          { family: 'Mendell', given: 'MJ' },
          { family: 'Eliseeva', given: 'EA' },
        ],
        truncatedAuthors: true,
      },
    );
  });
});

describe('extractReferenceDoi', () => {
  it('keeps balanced parentheses and drops an unbalanced closer', () => {
    expect(
      extractReferenceDoi('… https://doi.org/10.1016/S0021-8502(03)00359-8'),
    ).toBe('10.1016/S0021-8502(03)00359-8');
    expect(extractReferenceDoi('A paper (doi:10.1000/abc-123).')).toBe(
      '10.1000/abc-123',
    );
  });
});

describe('parseReferenceEntryFields', () => {
  it('reads the author-date form', () => {
    expect(
      parseReferenceEntryFields(
        'Düsing, S., Wehner, B., and Müller, T. (2019). The effect of rapid relative humidity changes on fast filter-based measurements. Atmospheric Measurement Techniques, 12, 5879–5895. https://doi.org/10.5194/amt-12-5879-2019',
      ),
    ).toEqual({
      authors: [
        { family: 'Düsing', given: 'S.' },
        { family: 'Wehner', given: 'B.' },
        { family: 'Müller', given: 'T.' },
      ],
      truncatedAuthors: false,
      year: 2019,
      title:
        'The effect of rapid relative humidity changes on fast filter-based measurements',
      containerTitle: 'Atmospheric Measurement Techniques',
      volume: '12',
      pages: '5879–5895',
      doi: '10.5194/amt-12-5879-2019',
    });
  });

  it('reads the Copernicus form, whose year sits at the end', () => {
    expect(
      parseReferenceEntryFields(
        'Bond, T. C., Doherty, S. J., and Fahey, D. W.: Bounding the role of black carbon in the climate system: A scientific assessment, J. Geophys. Res.-Atmos., 118, 5380–5552, https://doi.org/10.1002/jgrd.50171, 2013.',
      ),
    ).toMatchObject({
      year: 2013,
      // A title with its own colon survives; the journal's abbreviating period
      // is part of its name.
      title:
        'Bounding the role of black carbon in the climate system: A scientific assessment',
      containerTitle: 'J. Geophys. Res.-Atmos.',
      volume: '118',
      pages: '5380–5552',
    });
  });

  it('reads the ACS form, whose year sits beside the journal', () => {
    expect(
      parseReferenceEntryFields(
        'Mendell, M. J.; et al. Classroom ventilation. Indoor Air 2013, 23, 515-528. doi:10.1111/ina.12042',
      ),
    ).toMatchObject({
      authors: [{ family: 'Mendell', given: 'M. J.' }],
      truncatedAuthors: true,
      year: 2013,
      title: 'Classroom ventilation',
      containerTitle: 'Indoor Air',
      volume: '23',
      pages: '515-528',
      doi: '10.1111/ina.12042',
    });
  });

  it('reads the Vancouver form, including the issue', () => {
    expect(
      parseReferenceEntryFields(
        'Mendell MJ, Eliseeva EA, Davies MM, et al. Association of classroom ventilation with reduced illness absence. Indoor Air. 2013;23(6):515-528.',
      ),
    ).toMatchObject({
      year: 2013,
      title:
        'Association of classroom ventilation with reduced illness absence',
      containerTitle: 'Indoor Air',
      volume: '23',
      issue: '6',
      pages: '515-528',
    });
  });

  it('keeps a year suffix, and never reads one out of a DOI', () => {
    const fields = parseReferenceEntryFields(
      'Weakley, A. T., and Dillner, A. M. (2018b). Thermal/optical reflectance equivalent carbon. Aerosol Science and Technology, 52, 1048–1058. https://doi.org/10.1080/02786826.2018.1504161',
    );
    expect(fields.year).toBe(2018);
    expect(fields.yearSuffix).toBe('b');
    expect(fields.title).toBe('Thermal/optical reflectance equivalent carbon');
  });

  it('leaves an entry with no author list whole', () => {
    // No comma-punctuated author head: inventing a journal here would be a
    // guess, and the raw entry is what the bibliography should print.
    expect(
      parseReferenceEntryFields(
        'U.S. Environmental Protection Agency. Positive Matrix Factorization model. https://www.epa.gov/air-research',
      ),
    ).toEqual({
      authors: [],
      truncatedAuthors: false,
      title:
        'U.S. Environmental Protection Agency. Positive Matrix Factorization model',
      url: 'https://www.epa.gov/air-research',
    });
  });
});
