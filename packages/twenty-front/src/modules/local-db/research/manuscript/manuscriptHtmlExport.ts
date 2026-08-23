import { isNonEmptyString } from '@sniptt/guards';

import {
  slugifyTitle,
  type ManuscriptBundle,
  type ManuscriptDocNode,
} from './manuscriptAssembly';
import {
  bibliographyHtmlToInlineRuns,
  type FormattedBibliographyEntry,
} from './manuscriptCitations';
import { formatManuscriptAuthorLine } from './manuscriptContributors';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { renderManuscriptDiagrams } from './manuscriptDiagram';
import { type ManuscriptTableStyle } from './manuscriptDocxTable';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import {
  escapeHtml,
  escapeHtmlAttribute,
  manuscriptInlineToHtml,
  manuscriptMarkdownToHtml,
  sanitizeUrl,
  type ManuscriptHtmlRenderContext,
} from './manuscriptHtmlMarkdown';
import {
  buildManuscriptHtmlCss,
  MANUSCRIPT_HTML_TABLE_STYLE_IDS,
  MANUSCRIPT_HTML_TABLE_STYLE_LABELS,
} from './manuscriptHtmlStyles';
import { resolveFigureImage } from './manuscriptImages';
import { latexToMathMl } from './manuscriptMathMl';
import { resolveManuscriptTableStyle } from './manuscriptTableStyleOptions';
import { titlePageSpacerLineCount } from './manuscriptTitlePage';
import { type NumberedFigure } from './manuscriptTypes';

// A single .html file that opens anywhere, offline, with nothing to fetch:
// equations are MathML (no KaTeX stylesheet, no web fonts), figures are
// already data-URLs, Mermaid diagrams are pre-rendered to inline SVG, and the
// only interactivity — heading levels, table design — is CSS.

const slugFor = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';

const referenceAnchorId = (key: string): string => `reference-${slugFor(key)}`;
const assetAnchorId = (figure: NumberedFigure): string =>
  `asset-${slugFor(figure.refKey ?? figure.id)}`;

type OutlineEntry = { id: string; level: number; text: string };

const captionText = (figure: NumberedFigure): string =>
  [
    `${figure.label}.`,
    isNonEmptyString(figure.caption)
      ? figure.caption
      : isNonEmptyString(figure.name)
        ? figure.name
        : '',
    isNonEmptyString(figure.credit) ? `Credit: ${figure.credit}` : '',
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

// Link each key in a cluster on its own where the rendered label makes that
// unambiguous ("[1, 3]", "(Smith, 2020; Doe, 2021)"), and otherwise link the
// whole label to its first reference rather than guessing at its structure.
const linkCitationCluster = (
  keys: string[],
  label: string,
  numberByKey: Map<string, number>,
  link: (key: string, text: string) => string,
): string => {
  if (keys.length === 0) return escapeHtml(label);
  if (keys.length === 1) return link(keys[0], label);

  const keyByNumber = new Map<string, string>();
  for (const key of keys) {
    const number = numberByKey.get(key);
    if (number !== undefined) keyByNumber.set(String(number), key);
  }
  if (
    keyByNumber.size === keys.length &&
    [...keyByNumber.keys()].every((number) =>
      new RegExp(`(?<!\\d)${number}(?!\\d)`).test(label),
    )
  ) {
    // One pass: `replace` never rescans what a replacement inserted, so the
    // digits inside a link it just wrote cannot be mistaken for the next
    // citation number.
    return escapeHtml(label).replace(/\d+/g, (number) => {
      const key = keyByNumber.get(number);
      return key === undefined ? number : link(key, number);
    });
  }

  const segments = label.split(';');
  if (segments.length === keys.length) {
    return segments
      .map((segment, index) => link(keys[index], segment))
      .join(';');
  }
  return link(keys[0], label);
};

type FrontMatterKind = 'abstract' | 'keywords' | null;

type HtmlRenderState = {
  // Which front-matter section the prose being rendered belongs to. The node
  // model carries no section identity, but the heading immediately before the
  // prose does — and the journal styles the abstract differently from the body.
  frontMatter: FrontMatterKind;
  outline: OutlineEntry[];
  headingIds: Set<string>;
  // reference key → the ids of the in-text citations that point at it.
  backlinksByKey: Map<string, string[]>;
  citationCount: number;
};

const createRenderContext = (
  bundle: ManuscriptBundle,
  state: HtmlRenderState,
  tableStyle: ManuscriptTableStyle,
  diagrams: ReadonlyMap<string, string>,
): ManuscriptHtmlRenderContext => {
  const numberByKey = new Map(
    bundle.bibliography.map((entry, index) => [
      entry.key,
      entry.number ?? index + 1,
    ]),
  );

  return {
    tableClass: `table-${tableStyle.toLowerCase()}`,
    registerHeading: (level, text) => {
      const base = `section-${slugFor(text)}`;
      let id = base;
      let suffix = 2;
      while (state.headingIds.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
      state.headingIds.add(id);
      state.outline.push({ id, level, text });
      return id;
    },
    renderCitation: (keys, label) =>
      linkCitationCluster(keys, label, numberByKey, (key, text) => {
        state.citationCount += 1;
        const citationId = `cite-${state.citationCount}`;
        const backlinks = state.backlinksByKey.get(key) ?? [];
        backlinks.push(citationId);
        state.backlinksByKey.set(key, backlinks);
        return (
          `<a class="citation" id="${citationId}" ` +
          `href="#${referenceAnchorId(key)}">${escapeHtml(text)}</a>`
        );
      }),
    renderCrossReference: (assetKey, label) =>
      `<a class="crossref" href="#asset-${slugFor(assetKey)}">${escapeHtml(label)}</a>`,
    renderDisplayMath: (latex) => latexToMathMl(latex, true).html,
    renderInlineMath: (latex) => latexToMathMl(latex, false).html,
    renderMermaid: (source) => diagrams.get(source.trim()) ?? null,
  };
};

const figureToHtml = (
  figure: NumberedFigure,
  context: ManuscriptHtmlRenderContext,
  captionPosition: string,
  diagrams: ReadonlyMap<string, string>,
): string => {
  const caption = `<figcaption>${manuscriptInlineToHtml(captionText(figure), context)}</figcaption>`;
  const diagram = isNonEmptyString(figure.diagramSource)
    ? (diagrams.get(figure.diagramSource.trim()) ?? null)
    : null;
  const image = resolveFigureImage(figure);
  const widthPercent = Math.min(100, Math.max(10, figure.widthPercent ?? 100));
  const body =
    diagram !== null
      ? diagram
      : image.kind === 'none'
        ? `<p class="missing-image">[${escapeHtml(figure.label)}: image to be added]</p>`
        : `<img src="${escapeHtmlAttribute(sanitizeUrl(image.src))}" alt="${escapeHtmlAttribute(figure.altText ?? figure.name ?? figure.label)}" style="width:${widthPercent}%">`;
  return [
    `<figure id="${assetAnchorId(figure)}"${diagram !== null ? ' class="diagram"' : ''}>`,
    captionPosition === 'ABOVE' ? caption : '',
    body,
    captionPosition === 'ABOVE' ? '' : caption,
    '</figure>',
  ]
    .filter((part) => part.length > 0)
    .join('');
};

const tableToHtml = (
  figure: NumberedFigure,
  context: ManuscriptHtmlRenderContext,
  captionPosition: string,
): string => {
  const caption = `<figcaption>${manuscriptInlineToHtml(captionText(figure), context)}</figcaption>`;
  const grid = manuscriptMarkdownToHtml(figure.tableData ?? '', context);
  return [
    `<figure class="table" id="${assetAnchorId(figure)}">`,
    captionPosition === 'BELOW' ? '' : caption,
    grid,
    captionPosition === 'BELOW' ? caption : '',
    '</figure>',
  ]
    .filter((part) => part.length > 0)
    .join('');
};

const equationToHtml = (
  figure: NumberedFigure,
  context: ManuscriptHtmlRenderContext,
): string => {
  const latex = (figure.equationLatex ?? '').trim();
  if (latex.length === 0) return '';
  const math = latexToMathMl(latex, true).html;
  const caption = isNonEmptyString(figure.caption)
    ? `<figcaption>${manuscriptInlineToHtml(figure.caption, context)}</figcaption>`
    : '';
  return [
    `<figure class="equation-figure" id="${assetAnchorId(figure)}">`,
    '<div class="equation-row">',
    `<div class="equation-body">${math}</div>`,
    `<span class="equation-label">${escapeHtml(figure.label)}</span>`,
    '</div>',
    caption,
    '</figure>',
  ].join('');
};

const bibliographyEntryHtml = (
  entry: FormattedBibliographyEntry,
  backlinks: string[],
): string => {
  // The entry already carries whatever marker its style prescribes — the "1."
  // of a numeric style, nothing at all for author–date. Rendering it inside an
  // <ol> is what produced "1. 1. McMichael…", so the list is unnumbered and
  // hanging-indented instead, and the entry's own marker is the only one.
  const body =
    entry.html !== undefined
      ? bibliographyHtmlToInlineRuns(entry.html)
          .map((run) =>
            run.styles.italic === true
              ? `<em>${escapeHtml(run.text)}</em>`
              : run.styles.bold === true
                ? `<strong>${escapeHtml(run.text)}</strong>`
                : escapeHtml(run.text),
          )
          .join('')
      : escapeHtml(entry.text);
  const returns =
    backlinks.length === 0
      ? ''
      : ` <span class="reference-backlinks">${backlinks
          .map(
            (id, index) =>
              `<a href="#${id}" title="Back to citation">↩${backlinks.length > 1 ? `<sup>${index + 1}</sup>` : ''}</a>`,
          )
          .join(' ')}</span>`;
  return `<li id="${referenceAnchorId(entry.key)}">${body}${returns}</li>`;
};

const nodeToHtml = (
  node: ManuscriptDocNode,
  bundle: ManuscriptBundle,
  context: ManuscriptHtmlRenderContext,
  state: HtmlRenderState,
  diagrams: ReadonlyMap<string, string>,
): string => {
  switch (node.kind) {
    case 'heading': {
      const heading = node.text.trim();
      state.frontMatter = /^abstract$/i.test(heading)
        ? 'abstract'
        : /^keywords?$/i.test(heading)
          ? 'keywords'
          : null;
      const id = context.registerHeading(node.level, node.text);
      return (
        `<h${node.level} id="${escapeHtmlAttribute(id)}" data-outline-level="${node.level}">` +
        `<span class="heading-level-tag" aria-hidden="true">H${node.level}</span>` +
        `${manuscriptInlineToHtml(node.text, context)}</h${node.level}>`
      );
    }
    case 'prose': {
      const html = manuscriptMarkdownToHtml(node.markdown, context);
      return state.frontMatter === null
        ? html
        : `<div class="${state.frontMatter}">${html}</div>`;
    }
    case 'figure':
      return figureToHtml(
        node.figure,
        context,
        bundle.style.figureCaptionPosition ?? 'BELOW',
        diagrams,
      );
    case 'table':
      return tableToHtml(
        node.figure,
        context,
        bundle.style.tableCaptionPosition ?? 'ABOVE',
      );
    case 'equation':
      return equationToHtml(node.figure, context);
    case 'bibliography':
      return [
        '<ul class="references">',
        ...node.entries.map((entry) =>
          bibliographyEntryHtml(
            entry,
            state.backlinksByKey.get(entry.key) ?? [],
          ),
        ),
        '</ul>',
      ].join('');
  }
};

const titleBlockHtml = (
  bundle: ManuscriptBundle,
  context: ManuscriptHtmlRenderContext,
): string => {
  const lines: string[] = ['<header class="title-block">'];
  lines.push(`<h1>${escapeHtml(bundle.metadata.title)}</h1>`);
  if (isNonEmptyString(bundle.metadata.authors)) {
    lines.push(
      `<p class="authors">${manuscriptInlineToHtml(
        formatManuscriptAuthorLine(
          bundle.metadata.authors,
          bundle.metadata.affiliations,
        ),
        context,
      )}</p>`,
    );
  }
  for (const affiliation of bundle.metadata.affiliations
    .split(/\r?\n|[;,]\s*(?=\d+\s)/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)) {
    lines.push(
      `<p class="affiliations">${manuscriptInlineToHtml(affiliation, context)}</p>`,
    );
  }
  for (const extra of bundle.metadata.titlePageExtraLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)) {
    // `---` (or `--- 6`) is vertical space on a cover page, not a rule.
    const spacerLines = titlePageSpacerLineCount(extra);
    if (spacerLines !== null) {
      lines.push('<p class="title-space"></p>'.repeat(spacerLines));
      continue;
    }
    lines.push(
      `<p class="title-extra">${manuscriptInlineToHtml(extra, context)}</p>`,
    );
  }
  if (isNonEmptyString(bundle.metadata.correspondingAuthor)) {
    lines.push(
      `<p class="corresponding">${manuscriptInlineToHtml(bundle.metadata.correspondingAuthor, context)}</p>`,
    );
  }
  if (isNonEmptyString(bundle.metadata.journal)) {
    lines.push(
      `<p class="journal-line">${escapeHtml(bundle.metadata.journal)}</p>`,
    );
  }
  lines.push('</header>');
  return lines.join('');
};

const toolbarHtml = (tableStyle: ManuscriptTableStyle): string => {
  const tableChoices = (
    Object.keys(MANUSCRIPT_HTML_TABLE_STYLE_IDS) as ManuscriptTableStyle[]
  )
    .map((candidate) => {
      const id = MANUSCRIPT_HTML_TABLE_STYLE_IDS[candidate];
      return (
        `<input class="view-toggle" type="radio" name="table-design" id="${id}"` +
        `${candidate === tableStyle ? ' checked' : ''}>`
      );
    })
    .join('');
  const tableLabels = (
    Object.keys(MANUSCRIPT_HTML_TABLE_STYLE_IDS) as ManuscriptTableStyle[]
  )
    .map(
      (candidate) =>
        `<label for="${MANUSCRIPT_HTML_TABLE_STYLE_IDS[candidate]}">${MANUSCRIPT_HTML_TABLE_STYLE_LABELS[candidate]}</label>`,
    )
    .join('');
  return [
    '<input class="view-toggle" type="checkbox" id="view-structure">',
    tableChoices,
    '<nav class="toolbar">',
    '<span class="toolbar-group"><span class="toolbar-label">View</span>',
    '<label for="view-structure">Heading levels</label></span>',
    '<span class="toolbar-group"><span class="toolbar-label">Table design</span>',
    tableLabels,
    '</span>',
    '</nav>',
  ].join('');
};

const outlineHtml = (outline: OutlineEntry[]): string => {
  if (outline.length === 0) return '';
  return [
    '<details class="outline" open>',
    `<summary>Outline — ${outline.length} heading${outline.length === 1 ? '' : 's'}</summary>`,
    '<ul>',
    ...outline.map(
      (entry) =>
        `<li class="depth-${entry.level}"><a href="#${escapeHtmlAttribute(entry.id)}">` +
        `<span class="outline-level">H${entry.level}</span>${escapeHtml(entry.text)}</a></li>`,
    ),
    '</ul>',
    '</details>',
  ].join('');
};

const warningsHtml = (warnings: string[]): string =>
  warnings.length === 0
    ? ''
    : [
        '<details class="warnings">',
        `<summary>${warnings.length} formatting issue${warnings.length === 1 ? '' : 's'} to review</summary>`,
        '<ul>',
        ...warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`),
        '</ul>',
        '</details>',
      ].join('');

export const exportManuscriptToHtml = async (
  bundle: ManuscriptBundle,
): Promise<string> => {
  const prepared = await prepareManuscriptBundleWithCsl(bundle, {
    citationAnchors: true,
  });
  const tableStyle = resolveManuscriptTableStyle(prepared.style.tableStyle);
  const diagrams = await renderManuscriptDiagrams(prepared);
  const state: HtmlRenderState = {
    frontMatter: null,
    outline: [],
    headingIds: new Set(),
    backlinksByKey: new Map(),
    citationCount: 0,
  };
  const context = createRenderContext(prepared, state, tableStyle, diagrams);

  // Two passes: the body first so every citation registers its backlink, then
  // the bibliography, which needs those backlinks to point home.
  const bodyNodes = prepared.nodes.filter(
    (node) => node.kind !== 'bibliography',
  );
  const bodyHtml = bodyNodes
    .map((node) => nodeToHtml(node, prepared, context, state, diagrams))
    .join('\n');
  const bibliographyHtml = prepared.nodes
    .filter((node) => node.kind === 'bibliography')
    .map((node) => nodeToHtml(node, prepared, context, state, diagrams))
    .join('\n');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(prepared.metadata.title)}</title>`,
    isNonEmptyString(prepared.metadata.authors)
      ? `<meta name="author" content="${escapeHtmlAttribute(prepared.metadata.authors)}">`
      : '',
    isNonEmptyString(prepared.metadata.abstract)
      ? `<meta name="description" content="${escapeHtmlAttribute(prepared.metadata.abstract.slice(0, 300))}">`
      : '',
    `<style>${buildManuscriptHtmlCss(prepared.style)}</style>`,
    '</head>',
    '<body>',
    toolbarHtml(tableStyle),
    '<main class="manuscript">',
    titleBlockHtml(prepared, context),
    outlineHtml(state.outline),
    bodyHtml,
    bibliographyHtml,
    warningsHtml(prepared.warnings),
    '</main>',
    '</body>',
    '</html>',
  ]
    .filter((part) => part.length > 0)
    .join('\n');
};

export const manuscriptHtmlExporter: ManuscriptExporter = {
  id: 'self-contained-html',
  label: 'HTML (self-contained)',
  formats: ['HTML'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> => [
    {
      filename: `${slugifyTitle(bundle.metadata.title)}.html`,
      mimeType: 'text/html',
      content: await exportManuscriptToHtml(bundle),
    },
  ],
};
