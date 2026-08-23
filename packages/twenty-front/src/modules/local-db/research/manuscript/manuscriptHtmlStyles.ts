// oxlint-disable twenty/no-hardcoded-colors -- This module emits the CSS of a
// standalone .html file the author downloads. It renders outside the app, so
// it cannot reference the theme's custom properties; the palette has to be
// literal for the file to look right on its own.
import { type ManuscriptTableStyle } from './manuscriptDocxTable';
import { type JournalStyle } from './manuscriptTypes';

// The stylesheet for the self-contained HTML export. Everything is inlined —
// no font CDN, no KaTeX stylesheet — because the file has to render the same
// on a plane as it does online.
//
// Two reader controls are pure CSS (hidden checkbox/radio inputs that sit
// before the article and drive sibling selectors), so the page needs no script
// at all: one reveals the heading level of every heading, the other switches
// the table design between the four export styles.

export const MANUSCRIPT_HTML_TABLE_STYLE_IDS: Record<
  ManuscriptTableStyle,
  string
> = {
  ACADEMIC: 'view-table-academic',
  GRID: 'view-table-grid',
  SHADED_HEADER: 'view-table-shaded',
  BORDERLESS: 'view-table-borderless',
};

export const MANUSCRIPT_HTML_TABLE_STYLE_LABELS: Record<
  ManuscriptTableStyle,
  string
> = {
  ACADEMIC: 'Academic rules',
  GRID: 'Full grid',
  SHADED_HEADER: 'Shaded header',
  BORDERLESS: 'Borderless',
};

const tableStyleRules = (): string =>
  [
    // Academic: top and bottom rules, a rule under the header deck, nothing else.
    `#view-table-academic:checked ~ .manuscript table {
    border-top: 1.5pt solid #222;
    border-bottom: 1.5pt solid #222;
  }
  #view-table-academic:checked ~ .manuscript thead tr:last-child th {
    border-bottom: 0.75pt solid #444;
  }
  #view-table-academic:checked ~ .manuscript thead th[colspan] {
    border-bottom: 0.75pt solid #888;
  }`,
    `#view-table-grid:checked ~ .manuscript table,
  #view-table-grid:checked ~ .manuscript th,
  #view-table-grid:checked ~ .manuscript td {
    border: 0.75pt solid #808080;
  }
  #view-table-grid:checked ~ .manuscript td { text-align: left; }`,
    `#view-table-shaded:checked ~ .manuscript table,
  #view-table-shaded:checked ~ .manuscript th,
  #view-table-shaded:checked ~ .manuscript td {
    border: 0.75pt solid #9aa5b1;
  }
  #view-table-shaded:checked ~ .manuscript th { background: #dce6f1; }`,
    `#view-table-borderless:checked ~ .manuscript table,
  #view-table-borderless:checked ~ .manuscript th,
  #view-table-borderless:checked ~ .manuscript td {
    border: none;
  }`,
  ].join('\n  ');

// Style values reach this module from the journal profile, from a manuscript's
// saved overrides, and from the `exportStyle` of an imported package — so they
// are not all self-authored. A font family is a name; anything that could close
// the string literal and reopen the stylesheet is stripped, because injected
// CSS could add the remote requests this export exists to avoid.
const cssFontFamily = (value: string | null | undefined): string =>
  (value ?? '')
    // An allowlist rather than a blocklist: a font name (or a stack of them)
    // is letters, digits, spaces and separators, and nothing that could close
    // the string literal or read as a url().
    .replace(/[^A-Za-z0-9 ,.\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Times New Roman';

// Likewise a size is a number, whatever the stored JSON happens to hold.
const cssNumber = (value: unknown, fallback: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export const buildManuscriptHtmlCss = (style: JournalStyle): string => {
  const fontFamily = cssFontFamily(style.fontFamily);
  const bodyFontSize = cssNumber(style.bodyFontSize, 12);
  const titleFontSize = cssNumber(style.titleFontSize, 16);
  const headingFontSize = cssNumber(style.headingFontSize, 12);
  const subheadingFontSize = cssNumber(style.subheadingFontSize, bodyFontSize);
  const lineSpacing = Math.max(1, cssNumber(style.lineSpacing, 1.5));
  const abstractLineSpacing = Math.max(
    1,
    cssNumber(style.abstractLineSpacing, 1.15),
  );
  const tableFontSize = Math.max(
    8,
    cssNumber(style.tableFontSize, bodyFontSize - 2),
  );
  const captionFontSize = Math.max(
    8,
    cssNumber(style.figureCaptionFontSize, bodyFontSize - 2),
  );
  const bodyAlignment =
    style.bodyAlignment === 'JUSTIFIED' ? 'justify' : 'left';
  const headingColor =
    style.headingColor === 'ADDIS_BLUE' ? '#0f4761' : '#111111';

  return `
  :root {
    --body-font: "${fontFamily}", "Times New Roman", Times, serif;
    --body-size: ${bodyFontSize}pt;
    --ink: #111111;
    --muted: #5b6470;
    --rule: #d7dbe0;
    --accent: #0b5fa5;
    --heading-ink: ${headingColor};
  }

  * { box-sizing: border-box; }

  body {
    background: #ffffff;
    color: var(--ink);
    font-family: var(--body-font);
    font-size: var(--body-size);
    line-height: ${lineSpacing};
    margin: 0;
    padding: 0 1.25rem 4rem;
  }

  .view-toggle { position: absolute; left: -9999px; }

  .toolbar {
    align-items: center;
    background: #f6f7f9;
    border-bottom: 1px solid var(--rule);
    display: flex;
    flex-wrap: wrap;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    gap: 0.5rem;
    margin: 0 -1.25rem 2rem;
    padding: 0.6rem 1.25rem;
    position: sticky;
    top: 0;
    z-index: 5;
  }
  .toolbar-group { align-items: center; display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .toolbar-label { color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
  .toolbar label[for] {
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: #ffffff;
    color: var(--muted);
    cursor: pointer;
    padding: 0.2rem 0.7rem;
    user-select: none;
  }
  .toolbar label[for]:hover { border-color: var(--accent); color: var(--accent); }

  #view-structure:checked ~ .toolbar label[for="view-structure"],
  ${Object.values(MANUSCRIPT_HTML_TABLE_STYLE_IDS)
    .map((id) => `#${id}:checked ~ .toolbar label[for="${id}"]`)
    .join(',\n  ')} {
    background: var(--accent);
    border-color: var(--accent);
    color: #ffffff;
  }

  .manuscript { margin: 0 auto; max-width: 46rem; }

  .title-block { margin-bottom: 2.5rem; text-align: center; }
  .title-block h1 {
    font-size: ${titleFontSize}pt;
    line-height: 1.25;
    margin: 0 0 0.75rem;
  }
  .authors { font-weight: 700; margin: 0 0 0.35rem; }
  .affiliations, .title-extra, .corresponding {
    color: var(--muted);
    font-size: ${Math.max(8, bodyFontSize - 1)}pt;
    font-style: italic;
    margin: 0 0 0.2rem;
  }
  .journal-line { color: var(--muted); font-size: ${Math.max(8, bodyFontSize - 1)}pt; margin-top: 0.75rem; }

  .abstract { line-height: ${abstractLineSpacing}; }
  .keywords { color: var(--muted); font-size: ${Math.max(8, bodyFontSize - 1)}pt; }

  p { margin: 0 0 0.75em; text-align: ${bodyAlignment}; }

  h1, h2, h3, h4, h5, h6 {
    color: var(--heading-ink);
    font-family: var(--body-font);
    line-height: 1.25;
    page-break-after: avoid;
  }

  /* The visual hierarchy the Word output has but a plain HTML dump loses:
     level 1 is a full-width banner rule, level 2 a hairline, level 3 an
     accent bar, level 4 small caps. */
  .manuscript > h1 {
    border-bottom: 2px solid var(--heading-ink);
    font-size: ${titleFontSize}pt;
    letter-spacing: 0.01em;
    margin: 3rem 0 1rem;
    padding-bottom: 0.3rem;
    text-transform: uppercase;
  }
  h2 {
    border-bottom: 1px solid var(--rule);
    font-size: ${headingFontSize + 2}pt;
    margin: 2.2rem 0 0.75rem;
    padding-bottom: 0.2rem;
  }
  h3 {
    border-left: 3px solid var(--heading-ink);
    font-size: ${subheadingFontSize + 1}pt;
    margin: 1.6rem 0 0.5rem;
    padding-left: 0.5rem;
  }
  h4 {
    font-size: ${subheadingFontSize}pt;
    font-variant: small-caps;
    letter-spacing: 0.03em;
    margin: 1.2rem 0 0.4rem;
  }
  h5, h6 {
    font-size: ${Math.max(8, subheadingFontSize - 1)}pt;
    font-style: italic;
    margin: 1rem 0 0.3rem;
  }

  .heading-level-tag {
    background: var(--rule);
    border-radius: 3px;
    color: var(--muted);
    display: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0;
    margin-right: 0.5em;
    padding: 0.1em 0.4em;
    text-transform: none;
    vertical-align: middle;
  }
  #view-structure:checked ~ .manuscript .heading-level-tag { display: inline-block; }
  #view-structure:checked ~ .manuscript h1,
  #view-structure:checked ~ .manuscript h2,
  #view-structure:checked ~ .manuscript h3,
  #view-structure:checked ~ .manuscript h4,
  #view-structure:checked ~ .manuscript h5,
  #view-structure:checked ~ .manuscript h6 {
    outline: 1px dashed var(--rule);
    outline-offset: 0.35rem;
  }

  .outline { border: 1px solid var(--rule); border-radius: 6px; margin-bottom: 2rem; padding: 0.6rem 1rem; }
  .outline > summary { color: var(--muted); cursor: pointer; font-size: ${Math.max(8, bodyFontSize - 2)}pt; }
  .outline ul { list-style: none; margin: 0.6rem 0 0; padding: 0; }
  .outline li { font-size: ${Math.max(8, bodyFontSize - 2)}pt; margin: 0.15rem 0; }
  .outline li a { color: var(--ink); text-decoration: none; }
  .outline li a:hover { color: var(--accent); text-decoration: underline; }
  .outline .outline-level { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; margin-right: 0.4em; }
  .outline .depth-2 { padding-left: 1rem; }
  .outline .depth-3 { padding-left: 2rem; }
  .outline .depth-4, .outline .depth-5, .outline .depth-6 { padding-left: 3rem; }

  figure { margin: 1.6rem 0; text-align: center; }
  figure img { border: 1px solid #eeeeee; height: auto; max-width: 100%; }
  figure.diagram svg { height: auto; max-width: 100%; }
  figcaption {
    font-size: ${captionFontSize}pt;
    font-style: italic;
    line-height: ${Math.max(1, cssNumber(style.figureCaptionLineSpacing, 1))};
    margin-top: 0.4rem;
    text-align: left;
  }
  figure.table figcaption { font-style: normal; margin: 0 0 0.4rem; }

  .table-scroll { margin: 0 auto; max-width: 100%; overflow-x: auto; }
  table {
    border-collapse: collapse;
    font-size: ${tableFontSize}pt;
    line-height: ${Math.max(1, cssNumber(style.tableLineSpacing, 1))};
    margin: 0 auto;
    width: 100%;
  }
  th, td { padding: 0.35em 0.6em; text-align: center; vertical-align: middle; }
  th { font-weight: 700; }
  ${tableStyleRules()}

  .equation { margin: 1.1rem 0; text-align: center; }
  .equation-row { align-items: center; display: flex; gap: 1rem; justify-content: center; margin: 1.1rem 0; }
  .equation-row .equation-body { flex: 1; text-align: center; }
  .equation-label { color: var(--ink); white-space: nowrap; }
  math { font-size: 1.05em; }
  .math-fallback { font-family: var(--body-font); }
  .math-fallback-display { display: block; margin: 0.6rem 0; }

  pre.code {
    background: #f6f7f9;
    border: 1px solid var(--rule);
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: ${Math.max(8, bodyFontSize - 2)}pt;
    overflow-x: auto;
    padding: 0.75rem;
  }

  blockquote { border-left: 3px solid var(--rule); color: var(--muted); margin: 1rem 0; padding-left: 1rem; }

  a { color: var(--accent); }
  a.citation {
    color: var(--accent);
    text-decoration: none;
  }
  a.citation:hover { text-decoration: underline; }
  a.crossref { text-decoration: none; }

  .references { list-style: none; margin: 0; padding: 0; }
  .references li {
    margin: 0 0 0.6em;
    padding-left: 2.2em;
    text-indent: -2.2em;
  }
  .references li:target { background: #fff6d6; }
  .reference-backlinks { font-size: 0.85em; margin-left: 0.4em; }
  .reference-backlinks a { text-decoration: none; }

  .warnings { border: 1px solid #f0c674; background: #fffaf0; border-radius: 6px; margin: 2rem 0 0; padding: 0.75rem 1rem; }
  .warnings summary { color: #8a6d1f; cursor: pointer; font-size: ${Math.max(8, bodyFontSize - 2)}pt; }
  .warnings ul { margin: 0.5rem 0 0; padding-left: 1.2rem; }
  .warnings li { font-size: ${Math.max(8, bodyFontSize - 2)}pt; }

  @media print {
    .toolbar, .outline { display: none; }
    body { padding: 0; }
    .manuscript { max-width: none; }
    ${style.twoColumn === true ? '.manuscript { column-count: 2; column-gap: 1.5rem; }' : ''}
  }

  @media (max-width: 640px) {
    .manuscript { max-width: none; }
    .toolbar { position: static; }
  }
`;
};
