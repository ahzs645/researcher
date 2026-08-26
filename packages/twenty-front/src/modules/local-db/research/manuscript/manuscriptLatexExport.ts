import { isNonEmptyString } from '@sniptt/guards';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import {
  buildManuscriptBibtex,
  manuscriptBibtexCitationKey,
} from './manuscriptBibtexWrite';
import { citationItemKey } from './manuscriptCitations';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { sanitizeUrl } from './manuscriptHtmlMarkdown';
import { PAGE_MARGIN_POINTS } from './manuscriptPageMetrics';
import {
  collectManuscriptSourceImages,
  manuscriptSourceByline,
  manuscriptSourceCaption,
  manuscriptSourceFigureImage,
  manuscriptSourceLabel,
  manuscriptSourceLabelPrefix,
  prepareManuscriptSourceBundle,
  renderManuscriptSourceBlocks,
  renderManuscriptSourceInline,
  renderManuscriptSourceNodes,
  UNNUMBERED_HEADING,
  type ManuscriptSourceBlockWriter,
  type ManuscriptSourceInlineWriter,
  type ManuscriptSourceNodeWriter,
} from './manuscriptSourceExport';
import {
  parseManuscriptTableGrid,
  type ManuscriptTableCell,
  type ManuscriptTableGrid,
} from './manuscriptTableGrid';
import { type NumberedFigure } from './manuscriptTypes';

// A compilable LaTeX source tree — one `.tex`, a `references.bib` and the
// figure images — not a compiled PDF. That is the same thing MyST produces
// before it shells out to a toolchain, and the only honest offline answer: a
// TeX engine is tens of megabytes of wasm we would have to fetch.
//
// Everything LaTeX can work out for itself is left to LaTeX: `\ref`/`\eqref`
// over the resolved "Figure 3", `\caption` over our own label text, `\cite`
// over a rendered citation. Same reasoning as the SEQ/REF fields the Word
// export writes — after the author edits the source, renumbering is the
// target's job, not a number we froze into the file.
//
// The traversals this shares with the Typst exporter — the Markdown scanner,
// the node walk, the sidecar images — live in `manuscriptSourceExport`; what
// is left here is only how LaTeX spells things.

const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
};

// One pass over a character class. Escaping the backslash in its own pass
// would re-escape the braces its replacement introduces.
export const escapeLatex = (value: string): string =>
  value.replace(
    /[\\{}$&#^_%~]/g,
    (character) => LATEX_ESCAPES[character] ?? character,
  );

// hyperref reads a URL almost verbatim; only the characters that would end the
// argument or start a comment have to go, and escaping the rest (`~`, `_`)
// would put accent commands into the link.
const escapeLatexUrl = (value: string): string =>
  sanitizeUrl(value).replace(/[\\{}$#%]/g, (character) =>
    character === '\\' ? '\\textbackslash{}' : `\\${character}`,
  );

type LatexContext = {
  // Cross-reference targets by the refKey the anchor resolved to, so a
  // reference knows whether it points at an equation (`\eqref`) or not.
  figuresByKey: Map<string, NumberedFigure>;
  // Writes an image out as a sidecar file and returns the name to reference.
  addImage: (dataUrl: string, hint: string) => string | null;
  sectionNumbering: boolean;
  inline: ManuscriptSourceInlineWriter;
};

const citationToLatex = (keys: string[], label: string): string => {
  const cited = keys
    .map((key) => manuscriptBibtexCitationKey(citationItemKey(key)))
    .filter((key) => key.length > 0);
  // A cluster whose keys never resolved has no entry to cite; its rendered
  // label ("[?]") is the only trace left, so keep it visible.
  return cited.length === 0
    ? escapeLatex(label)
    : `\\cite{${[...new Set(cited)].join(',')}}`;
};

const crossReferenceToLatex = (
  refKey: string,
  label: string,
  figuresByKey: Map<string, NumberedFigure>,
): string => {
  const figure = figuresByKey.get(refKey);
  const isEquation = figure?.assetKind === 'EQUATION';
  const reference = `\\${isEquation ? 'eqref' : 'ref'}{${manuscriptSourceLabel(refKey)}}`;
  const number = figure?.number ?? '';
  const at = number.length === 0 ? -1 : label.indexOf(number);
  if (at < 0) return reference;
  let prefix = label.slice(0, at);
  let suffix = label.slice(at + number.length);
  // `\eqref` prints the parentheses the journal's own label already carries.
  if (isEquation && prefix.endsWith('(') && suffix.startsWith(')')) {
    prefix = prefix.slice(0, -1);
    suffix = suffix.slice(1);
  }
  // A tie keeps "Figure" and its number on the same line.
  return `${escapeLatex(prefix).replace(/\s+$/, '~')}${reference}${escapeLatex(suffix)}`;
};

const inlineImageToLatex = (
  source: string,
  alt: string,
  addImage: (dataUrl: string, hint: string) => string | null,
): string => {
  const filename = /^data:image\//i.test(source)
    ? addImage(source, 'inline-image')
    : null;
  return filename === null
    ? `\\textit{[${escapeLatex(alt.length > 0 ? alt : source)}]}`
    : `\\includegraphics[width=\\linewidth]{${filename}}`;
};

// How LaTeX spells every inline construct. Maths is handed over verbatim —
// the source is already TeX.
const latexInlineWriter = (
  figuresByKey: Map<string, NumberedFigure>,
  addImage: (dataUrl: string, hint: string) => string | null,
): ManuscriptSourceInlineWriter => ({
  escape: escapeLatex,
  citation: citationToLatex,
  crossReference: (refKey, label) =>
    crossReferenceToLatex(refKey, label, figuresByKey),
  displayMath: (math) => `\\[${math}\\]`,
  inlineMath: (math) => `$${math}$`,
  code: (code) => `\\texttt{${escapeLatex(code)}}`,
  image: (source, alt) => inlineImageToLatex(source, alt, addImage),
  link: (href) => ({ open: `\\href{${escapeLatexUrl(href)}}{`, close: '}' }),
  lineBreak: '\\\\',
  superscript: { open: '\\textsuperscript{', close: '}' },
  subscript: { open: '\\textsubscript{', close: '}' },
  bold: { open: '\\textbf{', close: '}' },
  emphasis: { open: '\\emph{', close: '}' },
  strikethrough: { open: '\\sout{', close: '}' },
});

const inlineToLatex = (value: string, context: LatexContext): string =>
  renderManuscriptSourceInline(value, context.inline);

const SECTION_COMMANDS = [
  'section',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
];

const headingToLatex = (
  level: number,
  text: string,
  context: LatexContext,
): string => {
  const command =
    SECTION_COMMANDS[Math.min(Math.max(level, 1), 6) - 1] ?? 'section';
  const starred =
    level === 1 || !context.sectionNumbering || UNNUMBERED_HEADING.test(text);
  return `\\${command}${starred ? '*' : ''}{${inlineToLatex(text, context)}}`;
};

// Anchor cells only carry their own corner, so the covered slots are filled
// back in here: a row that drops a column silently shifts every `&` after it.
const tabularToLatex = (
  grid: ManuscriptTableGrid,
  context: LatexContext,
): string => {
  if (grid.rows.length === 0 || grid.columnCount === 0) return '';
  const owner: (ManuscriptTableCell | undefined)[][] = grid.rows.map(() =>
    new Array<ManuscriptTableCell | undefined>(grid.columnCount).fill(
      undefined,
    ),
  );
  for (const row of grid.rows) {
    for (const cell of row) {
      for (
        let rowIndex = cell.row;
        rowIndex < cell.row + cell.rowSpan && rowIndex < owner.length;
        rowIndex += 1
      ) {
        for (
          let column = cell.column;
          column < cell.column + cell.colSpan && column < grid.columnCount;
          column += 1
        ) {
          owner[rowIndex][column] = cell;
        }
      }
    }
  }

  const rendered = owner.map((slots, rowIndex) => {
    const cells: string[] = [];
    let column = 0;
    while (column < grid.columnCount) {
      const cell = slots[column];
      if (cell === undefined) {
        cells.push('');
        column += 1;
        continue;
      }
      if (cell.row !== rowIndex || cell.column !== column) {
        const width = cell.column === column ? cell.colSpan : 1;
        cells.push(width > 1 ? `\\multicolumn{${width}}{l}{}` : '');
        column += width;
        continue;
      }
      let body = inlineToLatex(cell.text, context);
      if (rowIndex < grid.headerRows) body = `\\textbf{${body}}`;
      if (cell.rowSpan > 1) body = `\\multirow{${cell.rowSpan}}{*}{${body}}`;
      if (cell.colSpan > 1) body = `\\multicolumn{${cell.colSpan}}{c}{${body}}`;
      cells.push(body);
      column += cell.colSpan;
    }
    return `${cells.join(' & ')} \\\\`;
  });

  return [
    `\\begin{tabular}{${'l'.repeat(grid.columnCount)}}`,
    '\\toprule',
    ...rendered.slice(0, grid.headerRows),
    ...(grid.headerRows > 0 ? ['\\midrule'] : []),
    ...rendered.slice(grid.headerRows),
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n');
};

// How LaTeX spells every block the Markdown scanner hands back.
const latexBlockWriter = (
  context: LatexContext,
): ManuscriptSourceBlockWriter => ({
  paragraph: (text) => inlineToLatex(text, context),
  heading: (level, text) => headingToLatex(level, text, context),
  code: (lines) => ['\\begin{verbatim}', ...lines, '\\end{verbatim}'].join('\n'),
  displayMath: (lines) =>
    ['\\begin{equation*}', lines.join('\n').trim(), '\\end{equation*}'].join(
      '\n',
    ),
  table: (markdown) =>
    [
      '\\begin{center}',
      tabularToLatex(parseManuscriptTableGrid(markdown), context),
      '\\end{center}',
    ].join('\n'),
  thematicBreak: '\\noindent\\rule{\\linewidth}{0.4pt}',
  list: (items, ordered) => {
    const environment = ordered ? 'enumerate' : 'itemize';
    return [
      `\\begin{${environment}}`,
      ...items.map((item) => `  \\item ${inlineToLatex(item, context)}`),
      `\\end{${environment}}`,
    ].join('\n');
  },
  quote: (text) =>
    ['\\begin{quote}', inlineToLatex(text, context), '\\end{quote}'].join('\n'),
});

const proseToLatex = (markdown: string, context: LatexContext): string[] =>
  renderManuscriptSourceBlocks(markdown, latexBlockWriter(context));

// `\caption*` (from the caption package) prints the text without consuming a
// number, which is what an asset the author took out of the sequence needs.
const captionBlock = (
  figure: NumberedFigure,
  context: LatexContext,
): string[] => {
  const caption = inlineToLatex(manuscriptSourceCaption(figure), context);
  return figure.numbered === false
    ? [`\\caption*{${caption}}`]
    : [
        `\\caption{${caption}}`,
        `\\label{${manuscriptSourceLabel(figure.refKey ?? figure.id)}}`,
      ];
};

const figureBodyToLatex = (
  figure: NumberedFigure,
  context: LatexContext,
): string => {
  const placement = manuscriptSourceFigureImage(figure, context.addImage);
  if (placement.kind === 'file') {
    const width = (placement.widthPercent / 100).toFixed(2);
    return `\\includegraphics[width=${width}\\textwidth]{${placement.filename}}`;
  }
  return placement.kind === 'linked'
    ? `\\textit{[${escapeLatex(placement.name)}: linked image ${escapeLatex(placement.source)}]}`
    : `\\textit{[${escapeLatex(placement.name)}: image to be added]}`;
};

const figureToLatex = (
  figure: NumberedFigure,
  bundle: ManuscriptBundle,
  context: LatexContext,
): string => {
  const caption = captionBlock(figure, context);
  const above = bundle.style.figureCaptionPosition === 'ABOVE';
  return [
    '\\begin{figure}[htbp]',
    '\\centering',
    ...(above ? caption : []),
    figureBodyToLatex(figure, context),
    ...(above ? [] : caption),
    '\\end{figure}',
  ].join('\n');
};

const tableToLatex = (
  figure: NumberedFigure,
  bundle: ManuscriptBundle,
  context: LatexContext,
): string => {
  const caption = captionBlock(figure, context);
  const below = bundle.style.tableCaptionPosition === 'BELOW';
  return [
    '\\begin{table}[htbp]',
    '\\centering',
    ...(below ? [] : caption),
    tabularToLatex(parseManuscriptTableGrid(figure.tableData ?? ''), context),
    ...(below ? caption : []),
    '\\end{table}',
  ].join('\n');
};

const equationToLatex = (figure: NumberedFigure): string => {
  const latex = (figure.equationLatex ?? '').trim();
  if (latex.length === 0) return '';
  return figure.numbered === false
    ? ['\\begin{equation*}', latex, '\\end{equation*}'].join('\n')
    : [
        '\\begin{equation}',
        `\\label{${manuscriptSourceLabel(figure.refKey ?? figure.id)}}`,
        latex,
        '\\end{equation}',
      ].join('\n');
};

// Only .bst files that ship with every TeX distribution, so the source
// compiles on a machine that has nothing else installed.
const BIBLIOGRAPHY_STYLE_BY_CSL_ID: Record<string, string> = {
  ieee: 'ieeetr',
  apa: 'apalike',
  'chicago-author-date': 'apalike',
  'elsevier-harvard': 'apalike',
  'springer-basic-author-date': 'apalike',
  'copernicus-publications': 'apalike',
  'atmospheric-environment': 'apalike',
  'air-quality-atmosphere-and-health': 'apalike',
  'environmental-science-and-pollution-research': 'apalike',
  'archives-of-environmental-contamination-and-toxicology': 'apalike',
  nature: 'unsrt',
  science: 'unsrt',
  vancouver: 'unsrt',
  'american-medical-association': 'unsrt',
  'american-chemical-society': 'unsrt',
  'multidisciplinary-digital-publishing-institute': 'unsrt',
};

const bibliographyStyle = (bundle: ManuscriptBundle): string =>
  BIBLIOGRAPHY_STYLE_BY_CSL_ID[bundle.metadata.citationStyleId] ??
  (bundle.metadata.citationMode === 'AUTHOR_DATE' ? 'apalike' : 'unsrt');

const supplementCounterResets = (prefix: string): string[] =>
  ['figure', 'table', 'equation'].map(
    (counter) =>
      `\\setcounter{${counter}}{0}\\renewcommand{\\the${counter}}{${escapeLatex(prefix)}\\arabic{${counter}}}`,
  );

// How LaTeX spells every node of the bundle's document model.
const latexNodeWriter = (
  bundle: ManuscriptBundle,
  context: LatexContext,
): ManuscriptSourceNodeWriter => ({
  heading: (level, text) => headingToLatex(level, text, context),
  supplementBreak: (prefix) => [
    '\\clearpage',
    ...supplementCounterResets(prefix),
  ],
  keywords: (keywords) =>
    `\\noindent\\textbf{Keywords:} ${inlineToLatex(keywords, context)}`,
  prose: (markdown) => proseToLatex(markdown, context),
  figure: (figure) => figureToLatex(figure, bundle, context),
  table: (figure) => tableToLatex(figure, bundle, context),
  equation: (figure) => equationToLatex(figure),
  bibliography: () => [
    `\\bibliographystyle{${bibliographyStyle(bundle)}}`,
    '\\bibliography{references}',
  ],
  abstractEnvironment: {
    open: '\\begin{abstract}',
    close: '\\end{abstract}',
  },
});

// A font family reaches this module from stored JSON, so it picks a package
// rather than being written into the source.
const fontPackage = (family: string | null | undefined): string => {
  const value = (family ?? '').toLowerCase();
  if (/arial|helvetica|calibri|verdana|sans/.test(value)) {
    return '\\usepackage{helvet}\n\\renewcommand{\\familydefault}{\\sfdefault}';
  }
  if (/times|georgia|cambria|garamond|serif/.test(value)) {
    return '\\usepackage{mathptmx}';
  }
  return '\\usepackage{lmodern}';
};

// article accepts three body sizes; anything else rounds to the nearest.
const classFontSize = (size: number | null | undefined): string => {
  const value = Number(size);
  if (!Number.isFinite(value) || value >= 12) return '12pt';
  return value <= 10 ? '10pt' : '11pt';
};

const titleBlockToLatex = (
  bundle: ManuscriptBundle,
  context: LatexContext,
): string[] => {
  const { affiliations, authors } = manuscriptSourceByline(bundle.metadata);
  const authorLine = authors
    .map((author) =>
      [
        escapeLatex(author.name),
        author.markers.length > 0
          ? `\\textsuperscript{${author.markers}}`
          : '',
        author.isCorresponding ? '\\textsuperscript{*}' : '',
      ].join(''),
    )
    .join(', ');

  const lines = [
    ...(authorLine.length > 0 ? [authorLine] : []),
    ...affiliations.map(
      (affiliation, index) =>
        `\\textsuperscript{${index + 1}}${escapeLatex(affiliation.name)}`,
    ),
    ...(isNonEmptyString(bundle.metadata.correspondingAuthor)
      ? [
          `\\textsuperscript{*}${inlineToLatex(bundle.metadata.correspondingAuthor, context)}`,
        ]
      : []),
  ];

  return [
    `\\title{${inlineToLatex(bundle.metadata.title, context)}}`,
    `\\author{${lines.join('\\\\\n')}}`,
    '\\date{}',
  ];
};

const preambleToLatex = (bundle: ManuscriptBundle): string[] => {
  const { style } = bundle;
  const options = [
    classFontSize(style.bodyFontSize),
    'a4paper',
    ...(style.twoColumn === true ? ['twocolumn'] : []),
  ];
  const lineSpacing = Math.max(1, Number(style.lineSpacing) || 1.5);
  const figureName = manuscriptSourceLabelPrefix(
    style.figureLabelFormat,
    'Figure',
  );
  const tableName = manuscriptSourceLabelPrefix(style.tableLabelFormat, 'Table');
  return [
    `\\documentclass[${options.join(',')}]{article}`,
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    fontPackage(style.fontFamily),
    `\\usepackage[a4paper,margin=${PAGE_MARGIN_POINTS}pt]{geometry}`,
    '\\usepackage{graphicx}',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '\\usepackage{booktabs}',
    '\\usepackage{multirow}',
    '\\usepackage{caption}',
    '\\usepackage{setspace}',
    '\\usepackage[normalem]{ulem}',
    '\\usepackage{hyperref}',
    ...(style.lineNumbering === true
      ? ['\\usepackage{lineno}', '\\linenumbers']
      : []),
    ...(style.pageNumbering === false ? ['\\pagestyle{empty}'] : []),
    `\\setstretch{${lineSpacing}}`,
    ...(figureName === 'Figure'
      ? []
      : [`\\renewcommand{\\figurename}{${escapeLatex(figureName)}}`]),
    ...(tableName === 'Table'
      ? []
      : [`\\renewcommand{\\tablename}{${escapeLatex(tableName)}}`]),
  ];
};

// Synchronous and pure: the bundle must already be prepared (CSL formatting,
// drawn diagrams, both kinds of anchor) before it reaches here.
export const buildManuscriptLatexFiles = (
  bundle: ManuscriptBundle,
): ExportFile[] => {
  const images = collectManuscriptSourceImages();
  const figuresByKey = new Map(
    bundle.numberedFigures.map((figure) => [figure.refKey ?? figure.id, figure]),
  );
  const context: LatexContext = {
    figuresByKey,
    addImage: images.addImage,
    sectionNumbering: bundle.style.sectionNumbering === true,
    inline: latexInlineWriter(figuresByKey, images.addImage),
  };

  // A blank line between blocks is what LaTeX reads as a paragraph break, so
  // the body is joined that way and the preamble stays one dense chunk.
  const document = [
    preambleToLatex(bundle).join('\n'),
    titleBlockToLatex(bundle, context).join('\n'),
    '\\begin{document}',
    '\\maketitle',
    ...renderManuscriptSourceNodes(bundle, latexNodeWriter(bundle, context)),
    '\\end{document}',
    '',
  ].join('\n\n');

  return [
    {
      filename: `${slugifyTitle(bundle.metadata.title)}.tex`,
      mimeType: 'application/x-tex',
      content: document,
    },
    {
      filename: 'references.bib',
      mimeType: 'application/x-bibtex',
      content: buildManuscriptBibtex(bundle.cslJson),
    },
    ...images.imageFiles(),
  ];
};

export const manuscriptLatexExporter: ManuscriptExporter = {
  id: 'latex-source',
  label: 'LaTeX source',
  formats: ['TEX', 'BIBTEX'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> =>
    buildManuscriptLatexFiles(await prepareManuscriptSourceBundle(bundle)),
};
