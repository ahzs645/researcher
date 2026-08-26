import { isNonEmptyString } from '@sniptt/guards';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import {
  buildManuscriptBibtex,
  manuscriptBibtexCitationKey,
} from './manuscriptBibtexWrite';
import {
  citationAnchorKeys,
  citationItemKey,
  CITATION_ANCHOR_PATTERN,
} from './manuscriptCitations';
import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
} from './manuscriptContributors';
import { CROSS_REF_ANCHOR_PATTERN } from './manuscriptCrossReference';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { prepareManuscriptDiagramImages } from './manuscriptDiagram';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { sanitizeUrl } from './manuscriptHtmlMarkdown';
import { resolveFigureImage } from './manuscriptImages';
import { PAGE_MARGIN_POINTS } from './manuscriptPageMetrics';
import { manuscriptScriptSegments } from './manuscriptScripts';
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

// Labels are cross-reference keys, never typeset, so they only have to avoid
// the characters that would close the `\label{}` argument.
const latexLabel = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'label';

type LatexContext = {
  // Cross-reference targets by the refKey the anchor resolved to, so a
  // reference knows whether it points at an equation (`\eqref`) or not.
  figuresByKey: Map<string, NumberedFigure>;
  // Writes an image out as a sidecar file and returns the name to reference.
  addImage: (dataUrl: string, hint: string) => string | null;
  sectionNumbering: boolean;
};

const PLACEHOLDER = '\u0000';

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
  context: LatexContext,
): string => {
  const figure = context.figuresByKey.get(refKey);
  const isEquation = figure?.assetKind === 'EQUATION';
  const reference = `\\${isEquation ? 'eqref' : 'ref'}{${latexLabel(refKey)}}`;
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
  context: LatexContext,
): string => {
  const filename = /^data:image\//i.test(source)
    ? context.addImage(source, 'inline-image')
    : null;
  return filename === null
    ? `\\textit{[${escapeLatex(alt.length > 0 ? alt : source)}]}`
    : `\\includegraphics[width=\\linewidth]{${filename}}`;
};

// Inline Markdown → LaTeX. Anything already typeset (maths, a citation, a
// cross-reference) is parked in a placeholder before the escaping pass so the
// escaper never touches it; wrappers park only their command, leaving the
// content in the stream so nesting and escaping still reach it.
const inlineToLatex = (value: string, context: LatexContext): string => {
  const parked: string[] = [];
  const park = (latex: string): string =>
    `${PLACEHOLDER}${parked.push(latex) - 1}${PLACEHOLDER}`;

  const working = value
    .replace(CITATION_ANCHOR_PATTERN, (_match, keys: string, label: string) =>
      park(citationToLatex(citationAnchorKeys(keys), label)),
    )
    .replace(CROSS_REF_ANCHOR_PATTERN, (_match, key: string, label: string) =>
      park(crossReferenceToLatex(key, label, context)),
    )
    .replace(/\$\$([^$]+)\$\$/g, (_match, math: string) =>
      park(`\\[${math}\\]`),
    )
    .replace(/\$([^$\n]+)\$/g, (_match, math: string) => park(`$${math}$`))
    .replace(/`([^`]+)`/g, (_match, code: string) =>
      park(`\\texttt{${escapeLatex(code)}}`),
    )
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
      (_match, alt: string, source: string) =>
        park(inlineImageToLatex(source, alt, context)),
    )
    .replace(
      /<sup>([\s\S]*?)<\/sup>/gi,
      (_match, inner: string) =>
        `${park('\\textsuperscript{')}${inner}${park('}')}`,
    )
    .replace(
      /<sub>([\s\S]*?)<\/sub>/gi,
      (_match, inner: string) =>
        `${park('\\textsubscript{')}${inner}${park('}')}`,
    )
    .replace(/<br\s*\/?>/gi, () => park('\\\\'))
    // Whatever other markup an imported document left behind is not something
    // we typeset; its text content stays.
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
      (_match, label: string, href: string) =>
        `${park(`\\href{${escapeLatexUrl(href)}}{`)}${label}${park('}')}`,
    )
    .replace(
      /\*\*([^*]+)\*\*/g,
      (_match, inner: string) => `${park('\\textbf{')}${inner}${park('}')}`,
    )
    .replace(
      /(?<![*\w])\*([^*\n]+)\*(?!\w)/g,
      (_match, inner: string) => `${park('\\emph{')}${inner}${park('}')}`,
    )
    .replace(
      /(?<![_\w])_([^_\n]+)_(?!\w)/g,
      (_match, inner: string) => `${park('\\emph{')}${inner}${park('}')}`,
    )
    .replace(
      /~~([^~]+)~~/g,
      (_match, inner: string) => `${park('\\sout{')}${inner}${park('}')}`,
    );

  // The importer's script markers survive escaping untouched, so they can be
  // turned into real commands afterwards.
  const escaped = manuscriptScriptSegments(escapeLatex(working))
    .map((segment) =>
      segment.position === 'SUPERSCRIPT'
        ? `\\textsuperscript{${segment.text}}`
        : segment.position === 'SUBSCRIPT'
          ? `\\textsubscript{${segment.text}}`
          : segment.text,
    )
    .join('');

  return escaped.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
    (_match, index: string) => parked[Number(index)] ?? '',
  );
};

// The bundle's own front/back matter headings are never part of the numbered
// sequence, whatever the journal says about section numbering.
const UNNUMBERED_HEADING =
  /^(abstract|keywords|acknowledge?ments?|author contributions?|funding|competing interests?|conflicts? of interest|data availability|references|supplementary material|appendix(?:\s+[A-Z0-9]+)?(?:[.:]\s*.*)?)$/i;

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

const proseToLatex = (markdown: string, context: LatexContext): string[] => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text.length > 0) blocks.push(inlineToLatex(text, context));
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      flushParagraph();
      blocks.push(
        headingToLatex(heading[1].length, heading[2].trim(), context),
      );
      continue;
    }

    if (/^\s*```/.test(line)) {
      flushParagraph();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push(['\\begin{verbatim}', ...body, '\\end{verbatim}'].join('\n'));
      continue;
    }

    if (/^\s*\$\$/.test(line)) {
      flushParagraph();
      const body: string[] = [];
      const singleLine = /^\s*\$\$([\s\S]*)\$\$\s*$/.exec(line);
      if (singleLine !== null) {
        body.push(singleLine[1]);
      } else {
        body.push(line.replace(/^\s*\$\$/, ''));
        index += 1;
        while (index < lines.length && !/\$\$\s*$/.test(lines[index])) {
          body.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          body.push(lines[index].replace(/\$\$\s*$/, ''));
        }
      }
      // Display maths inside prose carries no label, so it takes no number.
      blocks.push(
        ['\\begin{equation*}', body.join('\n').trim(), '\\end{equation*}'].join(
          '\n',
        ),
      );
      continue;
    }

    if (line.trim().startsWith('|')) {
      flushParagraph();
      const block: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        block.push(lines[index]);
        index += 1;
      }
      index -= 1;
      blocks.push(
        [
          '\\begin{center}',
          tabularToLatex(parseManuscriptTableGrid(block.join('\n')), context),
          '\\end{center}',
        ].join('\n'),
      );
      continue;
    }

    if (/^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push('\\noindent\\rule{\\linewidth}{0.4pt}');
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (ordered || /^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const isItem = (candidate: string): boolean =>
        ordered
          ? /^\s*\d+[.)]\s+/.test(candidate)
          : /^\s*[-*+]\s+/.test(candidate);
      const items: string[] = [];
      while (index < lines.length && isItem(lines[index])) {
        items.push(lines[index].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''));
        index += 1;
      }
      index -= 1;
      const environment = ordered ? 'enumerate' : 'itemize';
      blocks.push(
        [
          `\\begin{${environment}}`,
          ...items.map((item) => `  \\item ${inlineToLatex(item, context)}`),
          `\\end{${environment}}`,
        ].join('\n'),
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const block: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        block.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      index -= 1;
      blocks.push(
        [
          '\\begin{quote}',
          inlineToLatex(block.join(' '), context),
          '\\end{quote}',
        ].join('\n'),
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
};

const captionToLatex = (
  figure: NumberedFigure,
  context: LatexContext,
): string =>
  inlineToLatex(
    [
      isNonEmptyString(figure.caption) ? figure.caption : (figure.name ?? ''),
      isNonEmptyString(figure.credit) ? `Credit: ${figure.credit}` : '',
    ]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(' '),
    context,
  );

// `\caption*` (from the caption package) prints the text without consuming a
// number, which is what an asset the author took out of the sequence needs.
const captionBlock = (
  figure: NumberedFigure,
  context: LatexContext,
): string[] => {
  const caption = captionToLatex(figure, context);
  return figure.numbered === false
    ? [`\\caption*{${caption}}`]
    : [
        `\\caption{${caption}}`,
        `\\label{${latexLabel(figure.refKey ?? figure.id)}}`,
      ];
};

const figureBodyToLatex = (
  figure: NumberedFigure,
  context: LatexContext,
): string => {
  const name =
    figure.label.length > 0 ? figure.label : (figure.name ?? 'Figure');
  const width = Math.min(100, Math.max(10, figure.widthPercent ?? 100)) / 100;
  const image = resolveFigureImage(figure);
  if (image.kind === 'dataurl') {
    const filename = context.addImage(image.src, figure.refKey ?? figure.id);
    if (filename !== null) {
      return `\\includegraphics[width=${width.toFixed(2)}\\textwidth]{${filename}}`;
    }
  }
  // A TeX run has no network, so a linked image cannot be pulled in. Naming it
  // beats letting the figure vanish from the source without a trace.
  return image.kind === 'url'
    ? `\\textit{[${escapeLatex(name)}: linked image ${escapeLatex(image.src)}]}`
    : `\\textit{[${escapeLatex(name)}: image to be added]}`;
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
        `\\label{${latexLabel(figure.refKey ?? figure.id)}}`,
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

const nodesToLatex = (
  bundle: ManuscriptBundle,
  context: LatexContext,
): string[] => {
  const body: string[] = [];
  let frontMatter: 'abstract' | 'keywords' | null = null;
  const closeFrontMatter = () => {
    if (frontMatter === 'abstract') body.push('\\end{abstract}');
    frontMatter = null;
  };

  bundle.nodes.forEach((node, index) => {
    switch (node.kind) {
      case 'heading': {
        // `\bibliography` prints its own "References" heading.
        if (bundle.nodes[index + 1]?.kind === 'bibliography') return;
        closeFrontMatter();
        const heading = node.text.trim();
        if (/^abstract$/i.test(heading)) {
          body.push('\\begin{abstract}');
          frontMatter = 'abstract';
          return;
        }
        if (/^keywords?$/i.test(heading)) {
          frontMatter = 'keywords';
          return;
        }
        if (node.level === 1) {
          // The supplement restarts every counter under the journal's prefix,
          // so LaTeX arrives at "Figure S1" the way the composer does.
          body.push(
            '\\clearpage',
            ...supplementCounterResets(bundle.style.supplementPrefix ?? 'S'),
          );
        }
        body.push(headingToLatex(node.level, heading, context));
        return;
      }
      case 'prose': {
        if (frontMatter === 'keywords') {
          frontMatter = null;
          const keywords = node.markdown
            .replace(/^\s*keywords?\s*:\s*/i, '')
            .trim();
          body.push(
            `\\noindent\\textbf{Keywords:} ${inlineToLatex(keywords, context)}`,
          );
          return;
        }
        body.push(...proseToLatex(node.markdown, context));
        return;
      }
      case 'figure':
        closeFrontMatter();
        body.push(figureToLatex(node.figure, bundle, context));
        return;
      case 'table':
        closeFrontMatter();
        body.push(tableToLatex(node.figure, bundle, context));
        return;
      case 'equation': {
        closeFrontMatter();
        const equation = equationToLatex(node.figure);
        if (equation.length > 0) body.push(equation);
        return;
      }
      case 'bibliography':
        closeFrontMatter();
        body.push(
          `\\bibliographystyle{${bibliographyStyle(bundle)}}`,
          '\\bibliography{references}',
        );
        return;
    }
  });

  closeFrontMatter();
  return body;
};

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

const captionName = (
  format: string | null | undefined,
  fallback: string,
): string => {
  const prefix = (format ?? '').split('{n}')[0].trim().replace(/[:.]$/, '');
  return prefix.length > 0 ? prefix : fallback;
};

const titleBlockToLatex = (
  bundle: ManuscriptBundle,
  context: LatexContext,
): string[] => {
  const affiliations = parseManuscriptAffiliations(
    bundle.metadata.affiliations,
  );
  const numberById = new Map(
    affiliations.map((affiliation, index) => [affiliation.id, index + 1]),
  );
  const authors = parseManuscriptAuthors(bundle.metadata.authors, affiliations);
  const authorLine = authors
    .map((author) => {
      const markers = author.affiliationIds
        .flatMap((id) => {
          const number = numberById.get(id);
          return number === undefined ? [] : [number];
        })
        .sort((left, right) => left - right)
        .join(',');
      return [
        escapeLatex(author.name),
        markers.length > 0 ? `\\textsuperscript{${markers}}` : '',
        author.isCorresponding ? '\\textsuperscript{*}' : '',
      ].join('');
    })
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
  const figureName = captionName(style.figureLabelFormat, 'Figure');
  const tableName = captionName(style.tableLabelFormat, 'Table');
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
  const files: ExportFile[] = [];
  const nameByDataUrl = new Map<string, string>();
  const usedNames = new Set<string>();

  const addImage = (dataUrl: string, hint: string): string | null => {
    const existing = nameByDataUrl.get(dataUrl);
    if (existing !== undefined) return existing;
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
    if (match === null) return null;
    const extension = match[1]
      .replace(/^image\//i, '')
      .toLowerCase()
      .replace('svg+xml', 'svg')
      .replace('jpeg', 'jpg');
    const base = slugifyTitle(hint);
    let filename = `figures/${base}.${extension}`;
    let suffix = 2;
    while (usedNames.has(filename)) {
      filename = `figures/${base}-${suffix}.${extension}`;
      suffix += 1;
    }
    usedNames.add(filename);
    nameByDataUrl.set(dataUrl, filename);
    files.push({
      filename,
      mimeType: match[1],
      content: new Blob(
        [
          Uint8Array.from(atob(match[2]), (character) =>
            character.charCodeAt(0),
          ),
        ],
        { type: match[1] },
      ),
    });
    return filename;
  };

  const context: LatexContext = {
    figuresByKey: new Map(
      bundle.numberedFigures.map((figure) => [
        figure.refKey ?? figure.id,
        figure,
      ]),
    ),
    addImage,
    sectionNumbering: bundle.style.sectionNumbering === true,
  };

  // A blank line between blocks is what LaTeX reads as a paragraph break, so
  // the body is joined that way and the preamble stays one dense chunk.
  const document = [
    preambleToLatex(bundle).join('\n'),
    titleBlockToLatex(bundle, context).join('\n'),
    '\\begin{document}',
    '\\maketitle',
    ...nodesToLatex(bundle, context),
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
    ...files,
  ];
};

export const manuscriptLatexExporter: ManuscriptExporter = {
  id: 'latex-source',
  label: 'LaTeX source',
  formats: ['TEX', 'BIBTEX'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> => {
    const prepared = await prepareManuscriptDiagramImages(
      await prepareManuscriptBundleWithCsl(bundle, {
        citationAnchors: true,
        crossReferenceAnchors: true,
      }),
    );
    return buildManuscriptLatexFiles(prepared);
  },
};
