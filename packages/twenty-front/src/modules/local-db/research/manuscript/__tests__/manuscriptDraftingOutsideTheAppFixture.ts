// A draft written exactly the way `docs/manuscript-format.md` §7 "Drafting
// outside the app" prescribes: Markdown headings in source order, live tokens
// instead of rendered citations, tables as Markdown grids, a numbered display
// equation as a `$$…$$` block with a stable key, and a companion CSL-JSON
// bibliography keyed by the same citation keys the tokens use.
//
// It exists so §7 is an executed contract rather than prose: the round-trip
// test drives this text through the real import pipeline and asserts that the
// structure §7 promises survives.
//
// String.raw keeps the LaTeX backslashes literal — `\sum` in a normal template
// literal collapses to `sum`.

// §7.6: the draft states its target venue rather than inventing one. The
// Markdown importer carries no venue, so this travels beside the draft as
// manuscript metadata.
export const DRAFT_TARGET_VENUE = 'Environmental Health Perspectives';

// §7.4: the stable key the draft gives its one numbered display equation, and
// uses in both `[#key]` and `[[asset:key]]`.
export const DRAFT_EQUATION_REF_KEY = 'eq-daily-dose';

export const DRAFT_MARKDOWN = String.raw`# Wildfire smoke exposure and respiratory hospital admissions in three northern communities

## Abstract

Repeated wildfire smoke episodes raise fine-particulate exposure for weeks at a time, and the respiratory consequences for small northern populations remain poorly quantified [@carter2019]. We linked a modelled daily exposure surface to hospital admission records for three communities across eight smoke seasons.

## Keywords

wildfire smoke; fine particulate matter; respiratory admissions; exposure modelling

## Introduction

Plumes from boreal fires now dominate the warm-season particulate budget of the study region [@carter2019; @ng2021]. The 1.8-fold admission increase first reported for a single season has never been reproduced at a multi-season scale [@carter2019, p. 42].

### Study setting

The three communities sit within 400 km of one another and share one regional health authority, so admission coding is consistent across sites [see @ng2021].

## Methods

Admission records were extracted for the eight warm seasons from 2015 to 2022.

### Exposure assignment

Hourly smoke concentrations were converted from satellite aerosol optical depth with the linear relation $c = k \tau$ before aggregation, so that relation stays inline rather than becoming a numbered display.

Daily dose per participant is the sum of hourly concentration weighted by time spent outdoors:

[[asset:eq-daily-dose]]

$$D_{i,t} = \sum_{h=1}^{24} c_{i,h,t} \, v_{i,h}$$

Sensitivity analyses reweighted the outdoor-time term of [#eq-daily-dose] without changing the ranking of sites.

The modelled exposure surface for the 2021 season is shown in Figure 1.

Figure 1. Modelled mean warm-season PM2.5 across the three study communities, 2021.

#### Censoring rules

Monitor downtime was handled with the thresholds in Table 1.

Table 1. Censoring thresholds applied to each monitor-season, by region.

| Region | Site | Percent of monitor-season censored | < |
| --- | --- | --- | --- |
| North | Fort Nelson | 12 | retained |
| ^ | Dease Lake | 31 | reweighted |
| Central | Vanderhoof | 64 | dropped |

## Results

Admissions rose with modelled dose in all three communities [@carter2019; @okafor2022].

## Discussion

The effect size is compatible with the single-season estimate [-@carter2019] once censoring is accounted for.

## Data availability

Modelled exposure surfaces and admission counts are archived with the regional health authority [@okafor2022].

## Acknowledgments

We thank the regional health authority data stewards.
`;

// §7.5: the companion bibliography, CSL-JSON, keyed by the same values the
// `[@key]` tokens use.
export const DRAFT_BIBLIOGRAPHY_CSL_JSON = JSON.stringify(
  [
    {
      id: 'carter2019',
      type: 'article-journal',
      title:
        'Wildfire smoke and respiratory hospital admissions in a single boreal season',
      author: [
        { family: 'Carter', given: 'Eleanor' },
        { family: 'Whitehorse', given: 'Devon' },
      ],
      'container-title': 'Environmental Research',
      volume: '176',
      issue: '3',
      page: '108-119',
      issued: { 'date-parts': [[2019]] },
      DOI: '10.1016/j.envres.2019.01.004',
      URL: 'https://doi.org/10.1016/j.envres.2019.01.004',
    },
    {
      id: 'ng2021',
      type: 'article-journal',
      title: 'Regional coding consistency in northern hospital admission data',
      author: [{ family: 'Ng', given: 'Priya' }],
      'container-title': 'BMC Health Services Research',
      volume: '21',
      page: '884',
      issued: { 'date-parts': [[2021]] },
      DOI: '10.1186/s12913-021-06884-5',
    },
    {
      id: 'okafor2022',
      type: 'dataset',
      title:
        'Modelled warm-season PM2.5 surfaces for northern British Columbia',
      author: [{ family: 'Okafor', given: 'Ngozi' }],
      issued: { 'date-parts': [[2022]] },
      DOI: '10.5281/zenodo.6640001',
      URL: 'https://doi.org/10.5281/zenodo.6640001',
    },
  ],
  null,
  2,
);
