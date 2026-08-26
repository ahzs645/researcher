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
import { resolveCslStyleXml } from './manuscriptCiteproc';
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
import { COMMAND_TEXT } from './manuscriptMathGlyphs';
import { PAGE_MARGIN_POINTS } from './manuscriptPageMetrics';
import { manuscriptScriptSegments } from './manuscriptScripts';
import { parseManuscriptTableGrid } from './manuscriptTableGrid';
import { type NumberedFigure } from './manuscriptTypes';

// The same manuscript as Typst source — a `.typ`, its images, a BibTeX file and
// the vendored CSL style. Source, not a compiled PDF: like the LaTeX target
// this is what MyST hands to a toolchain, and a Typst compiler is wasm we would
// have to fetch.
//
// Typst does its own numbering and referencing, so it gets `<label>` + `@label`
// rather than the "Figure 3" the bundle already resolved — the author edits the
// source afterwards and the numbers have to follow.

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

const typstLabel = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'label';

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
  figuresByKey: Map<string, NumberedFigure>;
  addImage: (dataUrl: string, hint: string) => string | null;
  sectionNumbering: boolean;
};

const PLACEHOLDER = '\u0000';

const citationToTypst = (keys: string[], label: string): string => {
  const cited = [
    ...new Set(
      keys.map((key) => manuscriptBibtexCitationKey(citationItemKey(key))),
    ),
  ].filter((key) => key.length > 0);
  return cited.length === 0
    ? escapeTypst(label)
    : cited.map((key) => `#cite(<${typstLabel(key)}>)`).join('');
};

const crossReferenceToTypst = (
  refKey: string,
  context: TypstContext,
): string => {
  const label = typstLabel(refKey);
  // Typst's own supplement would make an equation reference read "Equation
  // (3)"; the journals this composer targets print just "(3)".
  return context.figuresByKey.get(refKey)?.assetKind === 'EQUATION'
    ? `#ref(<${label}>, supplement: none)`
    : `@${label}`;
};

const inlineImageToTypst = (
  source: string,
  alt: string,
  context: TypstContext,
): string => {
  const filename = /^data:image\//i.test(source)
    ? context.addImage(source, 'inline-image')
    : null;
  return filename === null
    ? `#emph[${escapeTypst(alt.length > 0 ? alt : source)}]`
    : `#image(${typstString(filename)})`;
};

// Inline Markdown → Typst markup. Anything already in Typst syntax is parked
// before the escaping pass; wrappers park only their delimiters so the content
// still gets escaped and can nest.
const inlineToTypst = (value: string, context: TypstContext): string => {
  const parked: string[] = [];
  const park = (typst: string): string =>
    `${PLACEHOLDER}${parked.push(typst) - 1}${PLACEHOLDER}`;

  const working = value
    .replace(CITATION_ANCHOR_PATTERN, (_match, keys: string, label: string) =>
      park(citationToTypst(citationAnchorKeys(keys), label)),
    )
    .replace(CROSS_REF_ANCHOR_PATTERN, (_match, key: string) =>
      park(crossReferenceToTypst(key, context)),
    )
    .replace(/\$\$([^$]+)\$\$/g, (_match, math: string) =>
      park(`$ ${latexToTypstMath(math)} $`),
    )
    .replace(/\$([^$\n]+)\$/g, (_match, math: string) =>
      park(`$${latexToTypstMath(math)}$`),
    )
    .replace(/`([^`]+)`/g, (_match, code: string) =>
      park(`\`${code.replace(/`/g, '')}\``),
    )
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
      (_match, alt: string, source: string) =>
        park(inlineImageToTypst(source, alt, context)),
    )
    .replace(
      /<sup>([\s\S]*?)<\/sup>/gi,
      (_match, inner: string) => `${park('#super[')}${inner}${park(']')}`,
    )
    .replace(
      /<sub>([\s\S]*?)<\/sub>/gi,
      (_match, inner: string) => `${park('#sub[')}${inner}${park(']')}`,
    )
    .replace(/<br\s*\/?>/gi, () => park('#linebreak()'))
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
      (_match, label: string, href: string) =>
        `${park(`#link(${typstString(sanitizeUrl(href))})[`)}${label}${park(']')}`,
    )
    .replace(
      /\*\*([^*]+)\*\*/g,
      (_match, inner: string) => `${park('*')}${inner}${park('*')}`,
    )
    .replace(
      /(?<![*\w])\*([^*\n]+)\*(?!\w)/g,
      (_match, inner: string) => `${park('_')}${inner}${park('_')}`,
    )
    .replace(
      /(?<![_\w])_([^_\n]+)_(?!\w)/g,
      (_match, inner: string) => `${park('_')}${inner}${park('_')}`,
    )
    .replace(
      /~~([^~]+)~~/g,
      (_match, inner: string) => `${park('#strike[')}${inner}${park(']')}`,
    );

  const escaped = manuscriptScriptSegments(escapeTypst(working))
    .map((segment) =>
      segment.position === 'SUPERSCRIPT'
        ? `#super[${segment.text}]`
        : segment.position === 'SUBSCRIPT'
          ? `#sub[${segment.text}]`
          : segment.text,
    )
    .join('');

  return escaped.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
    (_match, index: string) => parked[Number(index)] ?? '',
  );
};

const UNNUMBERED_HEADING =
  /^(abstract|keywords|acknowledge?ments?|author contributions?|funding|competing interests?|conflicts? of interest|data availability|references|supplementary material|appendix(?:\s+[A-Z0-9]+)?(?:[.:]\s*.*)?)$/i;

// The manuscript title is the document title, so the bundle's top-level
// section is Typst's first heading level.
const typstHeadingLevel = (level: number): number =>
  level <= 2 ? 1 : Math.min(level - 1, 5);

const headingToTypst = (
  level: number,
  text: string,
  context: TypstContext,
): string => {
  const depth = typstHeadingLevel(level);
  const body = inlineToTypst(text, context);
  return context.sectionNumbering && level > 1 && !UNNUMBERED_HEADING.test(text)
    ? `${'='.repeat(depth)} ${body}`
    : `#heading(level: ${depth}, numbering: none)[${body}]`;
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

const proseToTypst = (markdown: string, context: TypstContext): string[] => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text.length > 0) {
      blocks.push(escapeTypstLineStart(inlineToTypst(text, context)));
    }
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
        headingToTypst(heading[1].length, heading[2].trim(), context),
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
      blocks.push(['```', ...body, '```'].join('\n'));
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
        [
          '#[',
          '  #set math.equation(numbering: none)',
          `  $ ${latexToTypstMath(body.join(' '))} $`,
          ']',
        ].join('\n'),
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
      blocks.push(`#figure(\n${tableToTypst(block.join('\n'), context)}\n)`);
      continue;
    }

    if (/^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push('#line(length: 100%)');
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
      blocks.push(
        items
          .map(
            (item) => `${ordered ? '+' : '-'} ${inlineToTypst(item, context)}`,
          )
          .join('\n'),
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
        `#quote(block: true)[${inlineToTypst(block.join(' '), context)}]`,
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
};

const captionToTypst = (
  figure: NumberedFigure,
  context: TypstContext,
): string =>
  inlineToTypst(
    [
      isNonEmptyString(figure.caption) ? figure.caption : (figure.name ?? ''),
      isNonEmptyString(figure.credit) ? `Credit: ${figure.credit}` : '',
    ]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join(' '),
    context,
  );

const supplementName = (
  format: string | null | undefined,
  fallback: string,
): string => {
  const prefix = (format ?? '').split('{n}')[0].trim().replace(/[:.]$/, '');
  return prefix.length > 0 ? prefix : fallback;
};

const figureArguments = (
  figure: NumberedFigure,
  bundle: ManuscriptBundle,
  context: TypstContext,
): string[] => [
  `  caption: [${captionToTypst(figure, context)}],`,
  `  supplement: [${escapeTypst(
    supplementName(
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
  const name =
    figure.label.length > 0 ? figure.label : (figure.name ?? 'Figure');
  const width = Math.min(100, Math.max(10, figure.widthPercent ?? 100));
  const image = resolveFigureImage(figure);
  if (image.kind === 'dataurl') {
    const filename = context.addImage(image.src, figure.refKey ?? figure.id);
    if (filename !== null) {
      return `  image(${typstString(filename)}, width: ${width}%),`;
    }
  }
  // A Typst compile has no network, so a linked image cannot be pulled in.
  return image.kind === 'url'
    ? `  emph[${escapeTypst(`[${name}: linked image ${image.src}]`)}],`
    : `  emph[${escapeTypst(`[${name}: image to be added]`)}],`;
};

const figureToTypst = (
  figure: NumberedFigure,
  bundle: ManuscriptBundle,
  context: TypstContext,
): string =>
  [
    '#figure(',
    figureBodyToTypst(figure, context),
    ...figureArguments(figure, bundle, context),
    `) <${typstLabel(figure.refKey ?? figure.id)}>`,
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
    `) <${typstLabel(figure.refKey ?? figure.id)}>`,
  ].join('\n');

const equationToTypst = (figure: NumberedFigure): string => {
  const latex = (figure.equationLatex ?? '').trim();
  if (latex.length === 0) return '';
  const math = `$ ${latexToTypstMath(latex)} $`;
  return figure.numbered === false
    ? ['#[', '  #set math.equation(numbering: none)', `  ${math}`, ']'].join(
        '\n',
      )
    : `${math} <${typstLabel(figure.refKey ?? figure.id)}>`;
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

const nodesToTypst = (
  bundle: ManuscriptBundle,
  context: TypstContext,
  bibliographyStyle: string | null,
): string[] => {
  const body: string[] = [];
  let inKeywords = false;

  bundle.nodes.forEach((node, index) => {
    switch (node.kind) {
      case 'heading': {
        // `#bibliography` prints its own "References" heading.
        if (bundle.nodes[index + 1]?.kind === 'bibliography') return;
        const heading = node.text.trim();
        inKeywords = /^keywords?$/i.test(heading);
        if (inKeywords) return;
        if (node.level === 1) {
          body.push(
            '#pagebreak()',
            ...supplementCounterResets(bundle.style.supplementPrefix ?? 'S'),
          );
        }
        body.push(headingToTypst(node.level, heading, context));
        return;
      }
      case 'prose': {
        if (inKeywords) {
          inKeywords = false;
          const keywords = node.markdown
            .replace(/^\s*keywords?\s*:\s*/i, '')
            .trim();
          body.push(`*Keywords:* ${inlineToTypst(keywords, context)}`);
          return;
        }
        body.push(...proseToTypst(node.markdown, context));
        return;
      }
      case 'figure':
        body.push(figureToTypst(node.figure, bundle, context));
        return;
      case 'table':
        body.push(tableFigureToTypst(node.figure, bundle, context));
        return;
      case 'equation': {
        const equation = equationToTypst(node.figure);
        if (equation.length > 0) body.push(equation);
        return;
      }
      case 'bibliography':
        body.push(
          `#bibliography("references.bib"${
            bibliographyStyle === null
              ? ''
              : `, style: ${typstString(bibliographyStyle)}`
          })`,
        );
        return;
    }
  });

  return body;
};

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
  const authors = parseManuscriptAuthors(
    bundle.metadata.authors,
    parseManuscriptAffiliations(bundle.metadata.affiliations),
  ).map((author) => typstString(author.name));
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
  const affiliations = parseManuscriptAffiliations(
    bundle.metadata.affiliations,
  );
  const numberById = new Map(
    affiliations.map((affiliation, index) => [affiliation.id, index + 1]),
  );
  const authorLine = parseManuscriptAuthors(
    bundle.metadata.authors,
    affiliations,
  )
    .map((author) => {
      const markers = author.affiliationIds
        .flatMap((id) => {
          const number = numberById.get(id);
          return number === undefined ? [] : [number];
        })
        .sort((left, right) => left - right)
        .join(',');
      return [
        escapeTypst(author.name),
        markers.length > 0 ? `#super[${markers}]` : '',
        author.isCorresponding ? '#super[\\*]' : '',
      ].join('');
    })
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

  const context: TypstContext = {
    figuresByKey: new Map(
      bundle.numberedFigures.map((figure) => [
        figure.refKey ?? figure.id,
        figure,
      ]),
    ),
    addImage,
    sectionNumbering: bundle.style.sectionNumbering === true,
  };

  // Typst reads a CSL file directly, so the vendored style travels with the
  // source instead of being approximated by one of its built-in names.
  const styleId = bundle.metadata.citationStyleId;
  const styleXml = resolveCslStyleXml(styleId);
  const document = [
    preambleToTypst(bundle).join('\n'),
    titleBlockToTypst(bundle, context).join('\n'),
    ...nodesToTypst(
      bundle,
      context,
      styleXml === null ? null : `${styleId}.csl`,
    ),
    '',
  ].join('\n\n');

  return [
    {
      filename: `${slugifyTitle(bundle.metadata.title)}.typ`,
      mimeType: 'text/plain',
      content: document,
    },
    {
      filename: 'references.bib',
      mimeType: 'application/x-bibtex',
      content: buildManuscriptBibtex(bundle.cslJson),
    },
    ...(styleXml === null
      ? []
      : [
          {
            filename: `${styleId}.csl`,
            mimeType: 'application/xml',
            content: styleXml,
          },
        ]),
    ...files,
  ];
};

export const manuscriptTypstExporter: ManuscriptExporter = {
  id: 'typst-source',
  label: 'Typst source',
  formats: ['TYPST', 'BIBTEX'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> => {
    const prepared = await prepareManuscriptDiagramImages(
      await prepareManuscriptBundleWithCsl(bundle, {
        citationAnchors: true,
        crossReferenceAnchors: true,
      }),
    );
    return buildManuscriptTypstFiles(prepared);
  },
};
