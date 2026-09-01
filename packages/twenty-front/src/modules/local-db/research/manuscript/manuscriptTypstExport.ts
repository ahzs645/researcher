import { isNonEmptyString } from '@sniptt/guards';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import { manuscriptBibtexCitationKey } from './manuscriptBibtexWrite';
import { citationItemKey } from './manuscriptCitations';
import { resolveCslStyleXml } from './manuscriptCiteproc';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { sanitizeUrl } from './manuscriptHtmlMarkdown';
import { COMMAND_TEXT } from './manuscriptMathGlyphs';
import { hasAuthoredSectionKey } from './manuscriptNumbering';
import { PAGE_MARGIN_POINTS } from './manuscriptPageMetrics';
import {
  collectManuscriptSourceImages,
  manuscriptSourceBibtexFile,
  manuscriptSourceByline,
  manuscriptSourceCaption,
  manuscriptSourceFigureImage,
  manuscriptSourceFiguresByKey,
  manuscriptSourceLabel,
  manuscriptSourceLabelPrefix,
  manuscriptSourceSectionsByKey,
  prepareManuscriptSourceBundle,
  renderManuscriptSourceBlocks,
  renderManuscriptSourceInline,
  renderManuscriptSourceNodes,
  UNNUMBERED_HEADING,
  type ManuscriptSourceBlockWriter,
  type ManuscriptSourceHeadingSection,
  type ManuscriptSourceInlineWriter,
  type ManuscriptSourceNodeWriter,
} from './manuscriptSourceExport';
import { parseManuscriptTableGrid } from './manuscriptTableGrid';
import { type NumberedFigure, type NumberedSection } from './manuscriptTypes';

// The same manuscript as Typst source — a `.typ`, its images, a BibTeX file and
// the vendored CSL style. Source, not a compiled PDF: like the LaTeX target
// this is what MyST hands to a toolchain, and a Typst compiler is wasm we would
// have to fetch.
//
// Typst does its own numbering and referencing, so it gets `<label>` + `@label`
// rather than the "Figure 3" the bundle already resolved — the author edits the
// source afterwards and the numbers have to follow.
//
// The traversals this shares with the LaTeX exporter — the Markdown scanner,
// the node walk, the sidecar images — live in `manuscriptSourceExport`; what
// is left here is only how Typst spells things.

const TYPST_ESCAPES = /[\\#$[\]*_`<>@~]/g;

const escapeTypst = (value: string): string =>
  value.replace(TYPST_ESCAPES, (character) => `\\${character}`);

// `=`, `-`, `+`, `/` and `1.` only start a block at the beginning of a line, so
// they are escaped there and left alone everywhere else.
const escapeTypstLineStart = (value: string): string =>
  value
    .replace(
      /^(\s*)([=+/-])/,
      (_match, space: string, token: string) => `${space}\\${token}`,
    )
    .replace(/^(\s*\d+)\./, '$1\\.');

// A string that reaches Typst inside quotes: a path, a font name, a URL. None
// of them may close the literal.
const typstString = (value: string): string =>
  `"${value.replace(/["\\]/g, '')}"`;

// ── LaTeX maths → Typst maths ──────────────────────────────────────────────
// Typst is not TeX: `\frac{a}{b}` is `frac(a, b)` and a group is parentheses.
// It does name most symbols and operators the way LaTeX does, though, so the
// translation is a handful of structural rules plus the glyph table the DOCX
// exporter already shares — an unknown command stays as its bare name, which
// Typst resolves far more often than not.

const TYPST_TEXT_COMMANDS = new Set(['text', 'textrm', 'textnormal', 'mbox']);

const TYPST_WRAPPING_COMMANDS: Record<string, string> = {
  mathrm: 'upright',
  mathbf: 'bold',
  boldsymbol: 'bold',
  bm: 'bold',
  mathit: 'italic',
  mathcal: 'cal',
  mathbb: 'bb',
  hat: 'hat',
  bar: 'macron',
  vec: 'arrow',
  tilde: 'tilde',
  ddot: 'dot.double',
  overline: 'overline',
  underline: 'underline',
};

const TYPST_MATH_SPACING: Record<string, string> = {
  ',': ' ',
  ';': ' ',
  ':': ' ',
  '!': '',
  ' ': ' ',
};

const readBracedGroup = (
  value: string,
  start: number,
): { body: string; end: number } | null => {
  if (value[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === '{') depth += 1;
    else if (value[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return { body: value.slice(start + 1, index), end: index + 1 };
      }
    }
  }
  return null;
};

export const latexToTypstMath = (latex: string): string => {
  let out = '';
  let index = 0;
  while (index < latex.length) {
    const character = latex[index];
    if (character !== '\\') {
      if (character === '{') {
        const group = readBracedGroup(latex, index);
        if (group !== null) {
          // Parentheses straight after a script are Typst's grouping and print
          // nothing; anywhere else they would print, so the braces just go.
          const body = latexToTypstMath(group.body);
          out += /[_^]$/.test(out) ? `(${body})` : body;
          index = group.end;
          continue;
        }
      }
      out += character;
      index += 1;
      continue;
    }

    const command = /^[A-Za-z]+/.exec(latex.slice(index + 1))?.[0];
    if (command === undefined) {
      const next = latex[index + 1] ?? '';
      out += TYPST_MATH_SPACING[next] ?? next;
      index += 2;
      continue;
    }
    index += 1 + command.length;
    if (command === 'left' || command === 'right') continue;

    const group = readBracedGroup(latex, index);
    if (command === 'begin' || command === 'end') {
      if (group !== null) index = group.end;
      continue;
    }
    if (group !== null) {
      const second =
        command === 'frac' || command === 'dfrac' || command === 'tfrac'
          ? readBracedGroup(latex, group.end)
          : null;
      if (second !== null) {
        out += `frac(${latexToTypstMath(group.body)}, ${latexToTypstMath(second.body)})`;
        index = second.end;
        continue;
      }
      if (TYPST_TEXT_COMMANDS.has(command)) {
        out += typstString(group.body);
        index = group.end;
        continue;
      }
      const wrapper =
        command === 'sqrt' ? 'sqrt' : TYPST_WRAPPING_COMMANDS[command];
      if (wrapper !== undefined) {
        out += `${wrapper}(${latexToTypstMath(group.body)})`;
        index = group.end;
        continue;
      }
    }
    out += `${COMMAND_TEXT[command] ?? command} `;
  }
  return (
    out
      .replace(/[ \t]{2,}/g, ' ')
      // A bare command is emitted with a trailing space so it cannot glue onto
      // what follows; a script would then look detached from what it attaches to.
      .replace(/[ \t]+([_^])/g, '$1')
      .trim()
  );
};

type TypstContext = {
  addImage: (dataUrl: string, hint: string) => string | null;
  sectionNumbering: boolean;
  inline: ManuscriptSourceInlineWriter;
};

const citationToTypst = (keys: string[], label: string): string => {
  const cited = [
    ...new Set(
      keys.map((key) => manuscriptBibtexCitationKey(citationItemKey(key))),
    ),
  ].filter((key) => key.length > 0);
  return cited.length === 0
    ? escapeTypst(label)
    : cited.map((key) => `#cite(<${manuscriptSourceLabel(key)}>)`).join('');
};

const crossReferenceToTypst = (
  refKey: string,
  printed: string,
  figuresByKey: Map<string, NumberedFigure>,
  sectionsByKey: Map<string, NumberedSection>,
): string => {
  const label = manuscriptSourceLabel(refKey);
  const figure = figuresByKey.get(refKey);
  if (figure === undefined) {
    const section = sectionsByKey.get(refKey);
    if (section === undefined) return `@${label}`;
    // Typst refuses to reference a heading it did not number, and a compile
    // error is a worse answer than a sentence that says "Methods".
    return section.number.length === 0 || !hasAuthoredSectionKey(section)
      ? escapeTypst(printed)
      : `@${manuscriptSourceLabel(section.referenceKey)}`;
  }
  // A panel has no label of its own here: Typst has no subfigure, so the
  // reference is its parent's live number with the letter set after it as
  // text — the same split the Word export makes, for the same reason.
  if (
    isNonEmptyString(figure.parentRefKey) &&
    isNonEmptyString(figure.parentNumber)
  ) {
    const split = figure.number.indexOf(figure.parentNumber);
    if (split >= 0) {
      const parent = manuscriptSourceLabel(figure.parentRefKey);
      const head = figure.number.slice(0, split);
      const tail = figure.number.slice(split + figure.parentNumber.length);
      return [
        head.length > 0 ? `#text[${escapeTypst(head)}]` : '',
        `#ref(<${parent}>)`,
        tail.length > 0 ? `#text[${escapeTypst(tail)}]` : '',
      ].join('');
    }
    return escapeTypst(printed);
  }
  // Typst's own supplement would make an equation reference read "Equation
  // (3)"; the journals this composer targets print just "(3)".
  return figure.assetKind === 'EQUATION'
    ? `#ref(<${label}>, supplement: none)`
    : `@${label}`;
};

const inlineImageToTypst = (
  source: string,
  alt: string,
  addImage: (dataUrl: string, hint: string) => string | null,
): string => {
  const filename = /^data:image\//i.test(source)
    ? addImage(source, 'inline-image')
    : null;
  return filename === null
    ? `#emph[${escapeTypst(alt.length > 0 ? alt : source)}]`
    : `#image(${typstString(filename)})`;
};

// How Typst spells every inline construct. Maths goes through the translator:
// the bundle stores it as LaTeX and Typst is not TeX.
// The writer names itself so a footnote's own Markdown goes through the same
// rules as the sentence it hangs off — a note may cite, may carry maths, may
// be emphasised, and escaping it as flat text would lose all three.
const typstInlineWriter = (
  figuresByKey: Map<string, NumberedFigure>,
  sectionsByKey: Map<string, NumberedSection>,
  addImage: (dataUrl: string, hint: string) => string | null,
): ManuscriptSourceInlineWriter => {
  const writer: ManuscriptSourceInlineWriter = {
    escape: escapeTypst,
    citation: citationToTypst,
    crossReference: (refKey, label) =>
      crossReferenceToTypst(refKey, label, figuresByKey, sectionsByKey),
    // Typst counts its own footnotes, so the number the export walk worked out
    // is left out on purpose: the author edits the source and the numbers have
    // to follow, the same reason `@label` is written instead of "Figure 3".
    footnote: (text) =>
      `#footnote[${renderManuscriptSourceInline(text, writer)}]`,
    displayMath: (math) => `$ ${latexToTypstMath(math)} $`,
    inlineMath: (math) => `$${latexToTypstMath(math)}$`,
    code: (code) => `\`${code.replace(/`/g, '')}\``,
    image: (source, alt) => inlineImageToTypst(source, alt, addImage),
    link: (href) => ({
      open: `#link(${typstString(sanitizeUrl(href))})[`,
      close: ']',
    }),
    lineBreak: '#linebreak()',
    superscript: { open: '#super[', close: ']' },
    subscript: { open: '#sub[', close: ']' },
    bold: { open: '*', close: '*' },
    emphasis: { open: '_', close: '_' },
    strikethrough: { open: '#strike[', close: ']' },
  };
  return writer;
};

const inlineToTypst = (value: string, context: TypstContext): string =>
  renderManuscriptSourceInline(value, context.inline);

// The manuscript title is the document title, so the bundle's top-level
// section is Typst's first heading level.
const typstHeadingLevel = (level: number): number =>
  level <= 2 ? 1 : Math.min(level - 1, 5);

const headingToTypst = (
  level: number,
  text: string,
  context: TypstContext,
  section?: ManuscriptSourceHeadingSection,
): string => {
  const depth = typstHeadingLevel(level);
  const body = inlineToTypst(text, context);
  const numbered =
    context.sectionNumbering && level > 1 && !UNNUMBERED_HEADING.test(text);
  if (!numbered) return `#heading(level: ${depth}, numbering: none)[${body}]`;
  // Labelled only when Typst will number it, since that is the only case a
  // reference to it can be written as `@label`.
  const label =
    section === undefined ||
    section.number.length === 0 ||
    !hasAuthoredSectionKey(section)
      ? ''
      : ` <${manuscriptSourceLabel(section.referenceKey)}>`;
  return `${'='.repeat(depth)} ${body}${label}`;
};

const tableToTypst = (tableData: string, context: TypstContext): string => {
  const grid = parseManuscriptTableGrid(tableData);
  if (grid.rows.length === 0 || grid.columnCount === 0) return '';
  // Typst places cells itself and skips the slots a span already covers, which
  // is exactly the anchor-only shape the grid hands over.
  const cell = (
    text: string,
    colSpan: number,
    rowSpan: number,
    header: boolean,
  ): string => {
    const body = header
      ? `*${inlineToTypst(text, context)}*`
      : inlineToTypst(text, context);
    const spans = [
      colSpan > 1 ? `colspan: ${colSpan}` : '',
      rowSpan > 1 ? `rowspan: ${rowSpan}` : '',
    ].filter((span) => span.length > 0);
    return spans.length === 0
      ? `[${body}]`
      : `table.cell(${spans.join(', ')})[${body}]`;
  };
  const row = (index: number, indent: string): string =>
    `${indent}${grid.rows[index]
      .map((value) =>
        cell(value.text, value.colSpan, value.rowSpan, index < grid.headerRows),
      )
      .join(', ')},`;
  const header = grid.rows
    .slice(0, grid.headerRows)
    .map((_value, index) => row(index, '      '));
  return [
    '  table(',
    `    columns: ${grid.columnCount},`,
    '    align: left,',
    ...(header.length > 0 ? ['    table.header(', ...header, '    ),'] : []),
    ...grid.rows
      .slice(grid.headerRows)
      .map((_value, index) => row(index + grid.headerRows, '    ')),
    '  )',
  ].join('\n');
};

// How Typst spells every block the Markdown scanner hands back.
const typstBlockWriter = (
  context: TypstContext,
): ManuscriptSourceBlockWriter => ({
  paragraph: (text) => escapeTypstLineStart(inlineToTypst(text, context)),
  heading: (level, text) => headingToTypst(level, text, context),
  code: (lines) => ['```', ...lines, '```'].join('\n'),
  displayMath: (lines) =>
    [
      '#[',
      '  #set math.equation(numbering: none)',
      `  $ ${latexToTypstMath(lines.join(' '))} $`,
      ']',
    ].join('\n'),
  table: (markdown) => `#figure(\n${tableToTypst(markdown, context)}\n)`,
  thematicBreak: '#line(length: 100%)',
  list: (items, ordered) =>
    items
      .map((item) => `${ordered ? '+' : '-'} ${inlineToTypst(item, context)}`)
      .join('\n'),
  quote: (text) => `#quote(block: true)[${inlineToTypst(text, context)}]`,
});

const proseToTypst = (markdown: string, context: TypstContext): string[] =>
  renderManuscriptSourceBlocks(markdown, typstBlockWriter(context));

const figureArguments = (
  figure: NumberedFigure,
  bundle: ManuscriptBundle,
  context: TypstContext,
): string[] => [
  `  caption: [${inlineToTypst(manuscriptSourceCaption(figure), context)}],`,
  `  supplement: [${escapeTypst(
    manuscriptSourceLabelPrefix(
      figure.assetKind === 'TABLE'
        ? bundle.style.tableLabelFormat
        : bundle.style.figureLabelFormat,
      figure.assetKind === 'TABLE' ? 'Table' : 'Figure',
    ),
  )}],`,
  ...(figure.numbered === false ? ['  numbering: none,'] : []),
];

const figureBodyToTypst = (
  figure: NumberedFigure,
  context: TypstContext,
): string => {
  const placement = manuscriptSourceFigureImage(figure, context.addImage);
  if (placement.kind === 'file') {
    return `  image(${typstString(placement.filename)}, width: ${placement.widthPercent}%),`;
  }
  return placement.kind === 'linked'
    ? `  emph[${escapeTypst(`[${placement.name}: linked image ${placement.source}]`)}],`
    : `  emph[${escapeTypst(`[${placement.name}: image to be added]`)}],`;
};

// Typst has no subfigure, so a panelled figure is one `#figure` whose body is
// a grid of cells. Each cell is the panel's picture over its own letter and
// words; the letters are literal, because there is no counter here for them to
// come from — the figure's number, which Typst does count, is the parent's.
const panelGridToTypst = (
  figure: NumberedFigure,
  context: TypstContext,
): string[] => {
  const panels = figure.panels ?? [];
  const columns = Math.max(
    1,
    Math.min(panels.length, figure.panelColumns ?? panels.length),
  );
  const cells = panels.map((panel) => {
    const placement = manuscriptSourceFigureImage(panel, context.addImage);
    const body =
      placement.kind === 'file'
        ? `#image(${typstString(placement.filename)}, width: 100%)`
        : `#emph[${escapeTypst(`[${placement.name}: image to be added]`)}]`;
    const caption = inlineToTypst(manuscriptSourceCaption(panel), context);
    return `    [${body}\n\n    *${escapeTypst(panel.label)}* ${caption}],`;
  });
  return [
    '  grid(',
    `    columns: ${columns},`,
    '    gutter: 8pt,',
    ...cells,
    '  ),',
  ];
};

const figureToTypst = (
  figure: NumberedFigure,
  bundle: ManuscriptBundle,
  context: TypstContext,
): string =>
  [
    '#figure(',
    ...((figure.panels ?? []).length > 0
      ? panelGridToTypst(figure, context)
      : [figureBodyToTypst(figure, context)]),
    ...figureArguments(figure, bundle, context),
    `) <${manuscriptSourceLabel(figure.refKey ?? figure.id)}>`,
  ].join('\n');

const tableFigureToTypst = (
  figure: NumberedFigure,
  bundle: ManuscriptBundle,
  context: TypstContext,
): string =>
  [
    '#figure(',
    `${tableToTypst(figure.tableData ?? '', context)},`,
    ...figureArguments(figure, bundle, context),
    `) <${manuscriptSourceLabel(figure.refKey ?? figure.id)}>`,
  ].join('\n');

const equationToTypst = (figure: NumberedFigure): string => {
  const latex = (figure.equationLatex ?? '').trim();
  if (latex.length === 0) return '';
  const math = `$ ${latexToTypstMath(latex)} $`;
  return figure.numbered === false
    ? ['#[', '  #set math.equation(numbering: none)', `  ${math}`, ']'].join(
        '\n',
      )
    : `${math} <${manuscriptSourceLabel(figure.refKey ?? figure.id)}>`;
};

const supplementCounterResets = (prefix: string): string[] => {
  const marker = prefix.replace(/["\\]/g, '');
  return [
    '#counter(figure.where(kind: image)).update(0)',
    '#counter(figure.where(kind: table)).update(0)',
    '#counter(math.equation).update(0)',
    `#set figure(numbering: n => "${marker}" + str(n))`,
    `#set math.equation(numbering: n => "(${marker}" + str(n) + ")")`,
  ];
};

// How Typst spells every node of the bundle's document model. Typst has no
// abstract environment: the heading is written as a heading like any other.
const typstNodeWriter = (
  bundle: ManuscriptBundle,
  context: TypstContext,
  bibliographyStyle: string | null,
): ManuscriptSourceNodeWriter => ({
  heading: (level, text, section) =>
    headingToTypst(level, text, context, section),
  supplementBreak: (prefix) => [
    '#pagebreak()',
    ...supplementCounterResets(prefix),
  ],
  keywords: (keywords) => `*Keywords:* ${inlineToTypst(keywords, context)}`,
  prose: (markdown) => proseToTypst(markdown, context),
  figure: (figure) => figureToTypst(figure, bundle, context),
  table: (figure) => tableFigureToTypst(figure, bundle, context),
  equation: (figure) => equationToTypst(figure),
  bibliography: () => [
    `#bibliography("references.bib"${
      bibliographyStyle === null
        ? ''
        : `, style: ${typstString(bibliographyStyle)}`
    })`,
  ],
  abstractEnvironment: null,
});

// A font family reaches this module from stored JSON. Typst falls back on its
// own when a name is not installed, so the only job here is to make sure the
// name cannot close the string literal or bring anything else with it.
const typstFont = (family: string | null | undefined): string =>
  (family ?? '')
    .replace(/[^A-Za-z0-9 .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'New Computer Modern';

const preambleToTypst = (bundle: ManuscriptBundle): string[] => {
  const { style } = bundle;
  const bodyFontSize = Number(style.bodyFontSize) || 12;
  const lineSpacing = Math.max(1, Number(style.lineSpacing) || 1.5);
  const authors = manuscriptSourceByline(bundle.metadata).authors.map(
    (author) => typstString(author.name),
  );
  return [
    `#set document(title: ${typstString(bundle.metadata.title)}${
      authors.length === 0 ? '' : `, author: (${authors.join(', ')})`
    })`,
    `#set page(paper: "a4", margin: ${PAGE_MARGIN_POINTS}pt, numbering: ${
      style.pageNumbering === false ? 'none' : '"1"'
    }${style.twoColumn === true ? ', columns: 2' : ''})`,
    `#set text(font: ${typstString(typstFont(style.fontFamily))}, size: ${bodyFontSize}pt)`,
    // Typst measures the gap between lines, not a multiple of the line box, so
    // the journal's spacing multiplier is scaled off its default 0.65em.
    `#set par(justify: ${style.bodyAlignment === 'JUSTIFIED'}, leading: ${(lineSpacing * 0.65).toFixed(2)}em)`,
    ...(style.lineNumbering === true ? ['#set par.line(numbering: "1")'] : []),
    ...(style.sectionNumbering === true
      ? ['#set heading(numbering: "1.1.1")']
      : []),
    '#set figure(numbering: "1")',
    '#set math.equation(numbering: "(1)")',
  ];
};

const titleBlockToTypst = (
  bundle: ManuscriptBundle,
  context: TypstContext,
): string[] => {
  const { affiliations, authors } = manuscriptSourceByline(bundle.metadata);
  const authorLine = authors
    .map((author) =>
      [
        escapeTypst(author.name),
        author.markers.length > 0 ? `#super[${author.markers}]` : '',
        author.isCorresponding ? '#super[\\*]' : '',
      ].join(''),
    )
    .join(', ');

  const titleFontSize = Number(bundle.style.titleFontSize) || 16;
  return [
    '#align(center)[',
    `  #block(text(size: ${titleFontSize}pt, weight: "bold")[${inlineToTypst(bundle.metadata.title, context)}])`,
    ...(authorLine.length > 0 ? [`  #block[${authorLine}]`] : []),
    ...affiliations.map(
      (affiliation, index) =>
        `  #block(text(size: ${Math.max(8, Number(bundle.style.bodyFontSize) || 12) - 2}pt)[#super[${index + 1}]${escapeTypst(affiliation.name)}])`,
    ),
    ...(isNonEmptyString(bundle.metadata.correspondingAuthor)
      ? [
          `  #block[#super[\\*]${inlineToTypst(bundle.metadata.correspondingAuthor, context)}]`,
        ]
      : []),
    ']',
  ];
};

// Synchronous and pure: the bundle must already be prepared (CSL formatting,
// drawn diagrams, both kinds of anchor) before it reaches here.
export const buildManuscriptTypstFiles = (
  bundle: ManuscriptBundle,
): ExportFile[] => {
  const images = collectManuscriptSourceImages();
  const figuresByKey = manuscriptSourceFiguresByKey(bundle);
  const context: TypstContext = {
    addImage: images.addImage,
    sectionNumbering: bundle.style.sectionNumbering === true,
    inline: typstInlineWriter(
      figuresByKey,
      manuscriptSourceSectionsByKey(bundle),
      images.addImage,
    ),
  };

  // Typst reads a CSL file directly, so the vendored style travels with the
  // source instead of being approximated by one of its built-in names.
  const styleId = bundle.metadata.citationStyleId;
  const styleXml = resolveCslStyleXml(styleId);
  const document = [
    preambleToTypst(bundle).join('\n'),
    titleBlockToTypst(bundle, context).join('\n'),
    ...renderManuscriptSourceNodes(
      bundle,
      typstNodeWriter(
        bundle,
        context,
        styleXml === null ? null : `${styleId}.csl`,
      ),
    ),
    '',
  ].join('\n\n');

  return [
    {
      filename: `${slugifyTitle(bundle.metadata.title)}.typ`,
      mimeType: 'text/plain',
      content: document,
    },
    manuscriptSourceBibtexFile(bundle),
    ...(styleXml === null
      ? []
      : [
          {
            filename: `${styleId}.csl`,
            mimeType: 'application/xml',
            content: styleXml,
          },
        ]),
    ...images.imageFiles(),
  ];
};

export const manuscriptTypstExporter: ManuscriptExporter = {
  id: 'typst-source',
  label: 'Typst source',
  formats: ['TYPST', 'BIBTEX'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> =>
    buildManuscriptTypstFiles(await prepareManuscriptSourceBundle(bundle)),
};
