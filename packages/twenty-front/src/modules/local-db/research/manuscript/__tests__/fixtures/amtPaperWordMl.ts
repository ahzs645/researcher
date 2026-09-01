// A real Copernicus/AMT manuscript, expressed as the WordprocessingML the
// importer actually receives.
//
// The source is the working draft of "Quantifying temporal aggregation and
// representativeness bias when integrating aethalometer and filter-based
// carbonaceous aerosol measurements" (Jalil & Kazemian), reframed for
// Atmospheric Measurement Techniques. It is kept here because it exercises the
// conventions a hand-built fixture never thinks of:
//
//   - a three-line centred title block, then authors, affiliation and a
//     "Correspondence:" line, none of them styled as headings;
//   - a shaded one-cell table used as a status callout;
//   - "Keywords:" as a plain paragraph rather than a heading;
//   - numbered headings ("1 Introduction", "2.1 Quantities and terminology");
//   - display equations set as one-row two-column tables with the equation
//     number in the right cell — how Word writes a numbered equation;
//   - figure captions *under* the artwork and table captions *over* the grid;
//   - author-date citations in every form: parenthetical, grouped, narrative
//     ("Bond et al. (2013) synthesized…") and year-suffixed ("2018a, b");
//   - an appendix whose table is lettered "Table B1".
//
// Body prose is trimmed to the sentences that carry citations, cross-references
// and captions; every heading, equation, caption, table shape and reference is
// the source document's own.

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const runs = (text: string): string =>
  text
    .split('\n')
    .map(
      (line, index) =>
        `${index > 0 ? '<w:br/>' : ''}<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
    )
    .join('');

const paragraph = (text: string, styleId?: string): string =>
  `<w:p>${styleId === undefined ? '' : `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>`}${runs(text)}</w:p>`;

// A centred, bold title-block line. Word styles none of these as headings.
const titleBlockLine = (text: string): string =>
  `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${text
    .split('\n')
    .map(
      (line, index) =>
        `${index > 0 ? '<w:br/>' : ''}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
    )
    .join('')}</w:p>`;

const heading = (text: string, level: 1 | 2): string =>
  paragraph(text, `Heading${level}`);

const caption = (text: string): string => paragraph(text, 'Caption');

const cell = (text: string): string =>
  `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="1800"/></w:tcPr>${paragraph(text)}</w:tc>`;

const table = (rows: string[][]): string =>
  `<w:tbl>${rows
    .map((cells) => `<w:tr>${cells.map(cell).join('')}</w:tr>`)
    .join('')}</w:tbl>`;

// How Word writes a numbered display equation: a borderless one-row table with
// the maths on the left and "(3)" right-aligned beside it.
const numberedEquation = (body: string, label: string): string =>
  table([[body, `(${label})`]]);

// A shaded one-cell table — the "boxed note" every journal template offers.
const calloutTable = (text: string): string => table([[text]]);

const figureImage = (relationshipId: string, description: string): string =>
  `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture" descr="${escapeXml(
    description,
  )}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${relationshipId}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

export const AMT_PAPER_STYLES_XML = `<w:styles>
  <w:style w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:styleId="Caption"><w:name w:val="Caption"/></w:style>
</w:styles>`;

export const AMT_PAPER_IMAGES: Record<
  string,
  { dataUrl: string; altText: string }
> = {
  rId11: {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    altText: 'Reframed contribution of AETH Modular',
  },
  rId12: {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    altText: 'Exact alignment compared with a calendar-day average',
  },
  rId13: {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    altText: 'Sensitivity analysis over the full pipeline',
  },
};

export const AMT_PAPER_ABSTRACT =
  'High-frequency filter-based absorption photometers and offline filter analyses are commonly combined to interpret carbonaceous aerosols, yet their outputs differ in both measurand and temporal support. Aethalometers report attenuation-derived absorption or equivalent black carbon (eBC) at sub-hourly resolution, whereas Fourier-transform infrared (FTIR) spectroscopy, thermal-optical elemental carbon (EC), hybrid integrating plate/sphere (HIPS) absorption, and gravimetric PM₂.₅ integrate aerosol collected over predefined sampling windows. Date-only joins, calendar-day averages, and arithmetic means of irregularly sampled records can therefore alter the estimated relationship between methods. We present AETH Modular as an uncertainty-aware measurement-integration framework rather than primarily as a software utility. Each filter sample is represented as a half-open interval; exact overlaps with quality-controlled aethalometer observations are calculated; duration-weighted and, when filter-sampler flow is available, sampled-volume-weighted estimates are reported; and completeness is kept as a separate diagnostic rather than used to shrink concentrations toward zero. The framework also formalizes loading, multiple-scattering, mass absorption cross-section (MAC), humidity, wavelength, smoothing, and source-parameter sensitivity, while distinguishing corrected absorption coefficient, eBC, FTIR-predicted TOR-equivalent EC, thermal-optical EC, HIPS absorption, and PM₂.₅. The case study is designed around a UC Davis/SPARTAN-linked, four-site analysis containing approximately 4.16 million minute-level records and 1,416 filter records from Beijing, Delhi, Pasadena, and Addis Ababa. A repository audit identified scientifically consequential implementation choices that must be harmonized before final analysis, including fixed one-minute expectations, inconsistent 09:00 interval labels, nearest-date matching within ±1 day, inclusive end points, omission of zero-gap periods in one routine, and a completeness-scaled mean that biases low. Existing analyses support a 10 min rolling median as a reproducible preprocessing option (R² = 0.993 against available instrument-smoothed output), while implausibly low AAE values calculated from wavelength-specific eBC reinforce the need to derive AAE from corrected absorption. The final case-study evaluation will quantify aligned-minus-naïve differences, changes in variance and cross-method agreement, and robustness over smoothing, completeness, MAC, and source-parameter assumptions. The framework provides a reproducible basis for determining when temporal alignment improves scientific interpretation rather than merely increasing software convenience.';

export const AMT_PAPER_REFERENCE_ENTRIES = [
  'Bond, T. C., Doherty, S. J., Fahey, D. W., et al. (2013). Bounding the role of black carbon in the climate system: A scientific assessment. Journal of Geophysical Research: Atmospheres, 118, 5380–5552. https://doi.org/10.1002/jgrd.50171',
  'Drinovec, L., Močnik, G., Zotter, P., et al. (2015). The “dual-spot” Aethalometer: An improved measurement of aerosol black carbon with real-time loading compensation. Atmospheric Measurement Techniques, 8, 1965–1979. https://doi.org/10.5194/amt-8-1965-2015',
  'Düsing, S., Wehner, B., Müller, T., Stöcker, A., and Wiedensohler, A. (2019). The effect of rapid relative humidity changes on fast filter-based aerosol-particle light-absorption measurements: Uncertainties and correction schemes. Atmospheric Measurement Techniques, 12, 5879–5895. https://doi.org/10.5194/amt-12-5879-2019',
  'Isolabella, F., et al. (2024). A new software toolkit for optical apportionment of carbonaceous aerosol. Atmospheric Measurement Techniques, 17, 1363–1383. https://doi.org/10.5194/amt-17-1363-2024',
  'Petzold, A., Ogren, J. A., Fiebig, M., et al. (2013). Recommendations for reporting “black carbon” measurements. Atmospheric Chemistry and Physics, 13, 8365–8379. https://doi.org/10.5194/acp-13-8365-2013',
  'Reggente, M., et al. (2019). An open platform for Aerosol InfraRed Spectroscopy analysis – AIRSpec. Atmospheric Measurement Techniques, 12, 2313–2332. https://doi.org/10.5194/amt-12-2313-2019',
  'Sandradewi, J., Prévôt, A. S. H., Szidat, S., Perron, N., Alfarra, M. R., Lanz, V. A., Weingartner, E., and Baltensperger, U. (2008). Using aerosol light absorption measurements for the quantitative determination of wood burning and traffic emission contributions to particulate matter. Environmental Science & Technology, 42, 3316–3323. https://doi.org/10.1021/es702253m',
  'Takahama, S., Dillner, A. M., Weakley, A. T., et al. (2019). Atmospheric particulate matter characterization by Fourier transform infrared spectroscopy: A review of statistical calibration strategies for carbonaceous aerosol quantification in US measurement networks. Atmospheric Measurement Techniques, 12, 525–567. https://doi.org/10.5194/amt-12-525-2019',
  'Weakley, A. T., Takahama, S., Wexler, A. S., and Dillner, A. M. (2018a). Ambient aerosol composition by infrared spectroscopy and partial least squares in the Chemical Speciation Network: Multilevel modeling for elemental carbon. Aerosol Science and Technology, 52, 642–654. https://doi.org/10.1080/02786826.2018.1439571',
  'Weakley, A. T., Takahama, S., and Dillner, A. M. (2018b). Thermal/optical reflectance equivalent organic and elemental carbon determined from federal reference and equivalent method fine particulate matter samples using Fourier transform infrared spectrometry. Aerosol Science and Technology, 52, 1048–1058. https://doi.org/10.1080/02786826.2018.1504161',
  'Weingartner, E., Saathoff, H., Schnaiter, M., Streit, N., Bitnar, B., and Baltensperger, U. (2003). Absorption of light by soot particles: Determination of the absorption coefficient by means of aethalometers. Journal of Aerosol Science, 34, 1445–1463. https://doi.org/10.1016/S0021-8502(03)00359-8',
  'Zotter, P., Herich, H., Gysel, M., et al. (2017). Evaluation of the absorption Ångström exponents for traffic and wood burning in the Aethalometer-based source apportionment using radiocarbon measurements of ambient aerosol. Atmospheric Chemistry and Physics, 17, 4229–4249. https://doi.org/10.5194/acp-17-4229-2017',
];

export const buildAmtPaperWordMl = (): string =>
  `<w:document><w:body>${[
    // ── Title block ────────────────────────────────────────────────────────
    titleBlockLine(
      'Quantifying temporal aggregation and representativeness bias\nwhen integrating aethalometer and filter-based carbonaceous aerosol measurements',
    ),
    titleBlockLine('The AETH Modular measurement-integration framework'),
    titleBlockLine('Ahmad Jalil and Hossein Kazemian'),
    paragraph(
      'Environmental Science Program, Geography, Earth and Environmental Sciences, Faculty of Environment,\nUniversity of Northern British Columbia, Prince George, British Columbia, Canada',
    ),
    paragraph('Correspondence: Ahmad Jalil (ajalil@unbc.ca)'),
    calloutTable(
      'Working-draft status: This version is reframed for Atmospheric Measurement Techniques. It deliberately does not invent the exact-window effect estimates that are not yet available.',
    ),
    paragraph(
      'Keywords: aethalometer; equivalent black carbon; elemental carbon; FTIR; HIPS; temporal aggregation bias; representativeness; filter-window alignment; uncertainty; absorption Ångström exponent',
    ),

    // ── Abstract ───────────────────────────────────────────────────────────
    heading('Abstract', 1),
    paragraph(AMT_PAPER_ABSTRACT),

    // ── 1 Introduction ─────────────────────────────────────────────────────
    heading('1 Introduction', 1),
    paragraph(
      'Following the terminology recommended by Petzold et al. (2013), optically inferred mass should be reported as equivalent black carbon (eBC) unless a method-specific conversion to a reference mass quantity has been demonstrated.',
    ),
    paragraph(
      'Filter loading and multiple scattering can cause attenuation to depart from aerosol absorption, and the correction is instrument and filter dependent (Weingartner et al., 2003; Drinovec et al., 2015). Converting absorption to eBC requires an assumed MAC whose value depends on wavelength, particle mixing state, and aerosol composition (Bond et al., 2013). Rapid relative-humidity changes can modify filter attenuation and produce transient artifacts in fast filter-based photometers (Düsing et al., 2019). FTIR-EC inherits calibration-domain and prediction uncertainty from the reference thermal-optical measurements (Weakley et al., 2018a, b; Takahama et al., 2019).',
    ),
    paragraph(
      'Existing software addresses important parts of the analysis. MWAA_MT formalizes multi-wavelength optical apportionment (Isolabella et al., 2024), AIRSpec supports FTIR workflows (Reggente et al., 2019), and vendor packages support instrument diagnostics.',
    ),
    figureImage('rId11', 'Reframed contribution of AETH Modular'),
    caption(
      'Figure 1. Reframed contribution of AETH Modular. The primary scientific object is a traceable, uncertainty-aware estimate over each physical filter-sampling interval.',
    ),

    // ── 2 Measurement framework ────────────────────────────────────────────
    heading('2 Measurement framework', 1),
    heading('2.1 Quantities and terminology', 2),
    paragraph(
      'Table 1 separates the measured or inferred quantities. Agreement cannot be expected solely because all variables are expressed in mass-concentration units.',
    ),
    table([
      [
        'Quantity',
        'Operational basis',
        'Typical units',
        'Dominant assumptions',
        'Recommended use',
      ],
      [
        'Attenuation, ATNλ',
        'Change in transmitted intensity through the instrument filter',
        'dimensionless',
        'Reference intensity, filter state, optical stability',
        'Intermediate instrument quantity; not directly compared with EC',
      ],
      [
        'Absorption coefficient, babs,λ',
        'Best estimate of aerosol light absorption at wavelength λ',
        'Mm⁻¹',
        'Correction model, RH stability, wavelength response',
        'Preferred optical quantity for AAE and apparent-MAC analysis',
      ],
    ]),
    caption(
      'Table 1. Measurement quantities that should remain distinct in the manuscript and software outputs.',
    ),

    heading('2.2 Optical equations and correction terms', 2),
    paragraph(
      'The optical formulation begins with attenuation at wavelength λ:',
    ),
    numberedEquation('ATNλ(t) = 100 ln[I0,λ(t) / Iλ(t)]', '1'),
    paragraph(
      'I0,λ and Iλ are reference and sample intensities. For observation interval i with spot area A, volumetric flow Qi, and duration Δti, the attenuation coefficient can be written as',
    ),
    numberedEquation('bATN,λ,i = U · A / (Qi Δti) · ΔATNλ,i / 100', '2'),
    paragraph('A generic corrected absorption coefficient is'),
    numberedEquation('babs,λ,i = bATN,λ,i / [Cλ Rλ(ATNλ,i)]', '3'),
    paragraph('When a mass-equivalent output is required,'),
    numberedEquation('eBCλ,i = babs,λ,i / MACλ,assumed', '4'),
    paragraph(
      'Bond et al. (2013) synthesized a substantial range of MAC values and emphasized changes caused by mixing state and wavelength. The spectral dependence is expressed by babs(λ) = K λ⁻ᴬᴬᴱ. For a wavelength pair,',
    ),
    numberedEquation('AAE₁,₂ = −ln[babs(λ₁)/babs(λ₂)] / ln(λ₁/λ₂)', '5'),

    heading('2.3 Sources of measurement bias', 2),
    paragraph(
      'Filter loading. Increasing deposit can reduce the incremental attenuation response and bias uncorrected aethalometer estimates low (Weingartner et al., 2003). The dual-spot approach reduces this problem in real time but remains dependent on optical stability (Drinovec et al., 2015).',
    ),
    paragraph(
      'Relative humidity and temperature. Düsing et al. (2019) observed instrument-specific transients in fast filter photometers, so sample-stream RH and temperature should be retained.',
    ),

    // ── 3 Formal temporal-alignment method ─────────────────────────────────
    heading('3 Formal temporal-alignment method', 1),
    heading('3.1 Interval representation and time standards', 2),
    paragraph(
      'Each filter sample j is represented by a unique sample identifier and a half-open local-time interval Wj = [sj, ej). A date alone is insufficient when sampling starts at 09:00, varies by site, spans multiple days, or is interrupted.',
    ),
    figureImage(
      'rId12',
      'Exact alignment compared with a calendar-day average',
    ),
    caption(
      'Figure 2. Exact 09:00–09:00 alignment compared with a calendar-day average assigned to the filter collection date. Even without missing data, the two estimates use different 15 h portions of the time series.',
    ),

    heading('3.2 Exact overlap and aggregation operators', 2),
    paragraph(
      'Let dij denote the overlap duration between instrument interval Ii and filter window Wj, and let zi be a quality indicator equal to 1 for valid data and 0 otherwise:',
    ),
    numberedEquation('dij = duration(Ii ∩ Wj),      wij = zi dij', '6'),
    paragraph(
      'The primary filter-equivalent estimate is the duration-weighted mean',
    ),
    numberedEquation('x̄j,time = Σi wij xi / Σi wij', '7'),
    paragraph(
      'If the collocated filter sampler has a time-varying, quality-controlled flow qf(t), the sampled-volume-weighted target is',
    ),
    numberedEquation('x̄j,vol = Σi zi dij qf,i xi / Σi zi dij qf,i', '8'),
    paragraph(
      'When the filter sampler is operated at effectively constant flow, Eqs. (7) and (8) coincide. The weighted variance within a window is',
    ),
    numberedEquation(
      's²j,w = Σi wij (xi − x̄j,time)² / [Σi wij − Σi wij² / Σi wij]',
      '9',
    ),

    heading('3.3 Completeness, gaps, and partial coverage', 2),
    paragraph('Completeness is a diagnostic, not a concentration correction:'),
    numberedEquation('Cj = Σi zi dij / (ej − sj)', '10'),
    paragraph(
      'For eligible incomplete windows, Eq. (7) is calculated over observed valid duration and accompanied by Cj. The mean must not be multiplied by completeness.',
    ),

    heading('3.4 Naïve comparators and effect metrics', 2),
    paragraph(
      'The case study compares the exact-window estimator with two pre-specified naïve workflows.',
    ),
    numberedEquation('Δj = x̄j,aligned − x̄j,naïve', '11a'),
    numberedEquation('δj (%) = 100 Δj / x̄j,aligned', '11b'),

    heading('3.5 AAE-based source interpretation', 2),
    paragraph(
      'A two-component Aethalometer model represents absorption as the sum of fossil-fuel/traffic-like and biomass-burning-like components.',
    ),
    numberedEquation('b₁ = bff,₂ r⁻ᵅff + bwb,₂ r⁻ᵅwb', '12'),
    numberedEquation('b₂ = bff,₂ + bwb,₂', '13'),
    paragraph(
      'Here b₁ = babs(λ₁), b₂ = babs(λ₂), and r = λ₁/λ₂. The biomass-burning absorption fraction at λ₂ is',
    ),
    numberedEquation('fwb,₂ = [b₁/b₂ − r⁻ᵅff] / [r⁻ᵅwb − r⁻ᵅff]', '14'),
    paragraph(
      'Sandradewi et al. (2008) reported values near 1.1 for traffic and 1.8–1.9 for wood burning in a specific Alpine setting. Radiocarbon evaluation by Zotter et al. (2017) supported different best-fit values and demonstrated parameter interdependence and limited transferability.',
    ),
    figureImage('rId13', 'Sensitivity analysis over the full pipeline'),
    caption(
      'Figure 3. Sensitivity analysis is performed by recomputing every filter sample through the full pipeline.',
    ),

    // ── 4 Multi-site case study ────────────────────────────────────────────
    heading('4 Multi-site case study', 1),
    heading('4.1 Dataset and study design', 2),
    paragraph(
      'The case study uses the existing UC Davis/SPARTAN-linked analysis assets for Beijing (CHTS), Delhi (INDH), Pasadena/JPL (USPA), and Addis Ababa (ETAD), as summarized in Table 2.',
    ),
    table([
      ['Site', 'Code', 'Timezone', 'Device', 'Staged daily rows'],
      ['Beijing', 'CHTS', 'Asia/Shanghai', 'WF0010', '590'],
      ['Delhi', 'INDH', 'Asia/Kolkata', 'MA350-0216', '289'],
    ]),
    caption(
      'Table 2. Repository-staged multi-site data. Counts describe current daily files, not the final number of exact-window, quality-eligible filter samples.',
    ),

    heading('4.2 Repository audit and required harmonization', 2),
    paragraph(
      'Table 3 converts the audit findings into explicit scientific requirements for the analysis release.',
    ),
    table([
      ['Topic', 'Current behavior', 'Scientific risk', 'Required revision'],
      [
        '09:00 interval label',
        'Some routines label the start of a 09:00–09:00 interval; others map a filter date to the interval end.',
        'Off-by-one-day matches and inconsistent joins.',
        'Store both start and end; join by sample ID and exact interval.',
      ],
    ]),
    caption(
      'Table 3. Repository audit translated into measurement-science requirements. These are analysis blockers, not cosmetic software refinements.',
    ),

    heading('4.3 Pre-specified result reporting', 2),
    table([
      ['Result family', 'Minimum publication output'],
      [
        'Alignment effect',
        'Distribution of Δj and δj by site, season, concentration quartile, and filter duration.',
      ],
    ]),
    caption(
      'Table 4. Pre-specified outputs that convert the method into a publishable case study without selecting only favorable comparisons.',
    ),

    // ── 5–11 Discussion and back matter ────────────────────────────────────
    heading('5 Discussion', 1),
    heading('5.1 What exact alignment can resolve', 2),
    paragraph(
      'Exact alignment removes ambiguity about which high-frequency observations represent a filter sample, and it prevents a nearest-date join from silently pairing a filter with the wrong day.',
    ),
    heading('6 Limitations', 1),
    paragraph(
      'The case study is limited by the availability and reliability of filter start/end metadata.',
    ),
    heading('7 Conclusions', 1),
    paragraph(
      'AETH Modular should be presented as a measurement-integration framework for carbonaceous aerosol observations.',
    ),
    heading('8 Code and data availability', 1),
    paragraph(
      'The AETH Modular source code is available at https://github.com/ahzs645/aethmodular. The published analysis should archive an immutable release, commit hash, and environment lock file.',
    ),
    heading('9 Author contributions', 1),
    paragraph(
      'A.J. developed the software and analysis workflow. H.K. supervised the research and contributed to interpretation.',
    ),
    heading('10 Competing interests', 1),
    paragraph('The authors declare that they have no conflict of interest.'),
    heading('11 Acknowledgements', 1),
    paragraph(
      'The authors acknowledge the field, laboratory, and data-management teams responsible for the aethalometer and filter observations.',
    ),

    // ── References ─────────────────────────────────────────────────────────
    heading('References', 1),
    ...AMT_PAPER_REFERENCE_ENTRIES.map((entry) => paragraph(entry)),

    // ── Appendices ─────────────────────────────────────────────────────────
    heading('Appendix A: Algorithm pseudocode', 1),
    paragraph(
      '1.  Read filter metadata; require sample ID, start timestamp, end timestamp, timezone, and sampled volume or flow metadata.',
    ),
    paragraph(
      '2.  Construct record intervals and QC flags; split at clock resets, tape changes, maintenance, and long gaps.',
    ),
    heading('Appendix B: Primary sensitivity grid', 1),
    table([
      ['Parameter', 'Variants', 'Proposed primary', 'Reporting rule'],
      [
        'Smoothing',
        'none; 5, 10, 15, 30 min',
        'rolling median primary; rolling mean secondary',
        'Do not cross gaps, tape changes, or sample boundaries.',
      ],
    ]),
    caption(
      'Table B1. Minimum sensitivity grid. Ranges should be refined using instrument metadata and laboratory uncertainty information before analysis is frozen.',
    ),
  ].join('')}</w:body></w:document>`;
