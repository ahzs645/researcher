import { isNonEmptyString } from '@sniptt/guards';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import {
  citationAnchorKeys,
  CITATION_ANCHOR_PATTERN,
} from './manuscriptCitations';
import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
  type ManuscriptAffiliation,
} from './manuscriptContributors';
import { CROSS_REF_ANCHOR_PATTERN } from './manuscriptCrossReference';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { prepareManuscriptDiagramImages } from './manuscriptDiagram';
import { type ExportFile } from './manuscriptExport';
import { resolveFigureImage } from './manuscriptImages';
import { manuscriptScriptSegments } from './manuscriptScripts';
import { type NumberedFigure } from './manuscriptTypes';

// What the LaTeX and Typst exporters do the same way. Both take the bundle's
// Markdown apart with the same scanner, walk the same node stream and write
// the same images out beside the document; only the strings they emit differ.
// So the traversals live here once and each target hands in a writer — a
// record of how *it* spells a heading, a figure, a citation. Nothing in this
// module knows which target it is serving: a `format === 'latex'` branch here
// would only be the duplication wearing a different hat.

export type ManuscriptSourceWrap = { open: string; close: string };

// The bundle's own front/back matter headings are never part of the numbered
// sequence, whatever the journal says about section numbering.
export const UNNUMBERED_HEADING =
  /^(abstract|keywords|acknowledge?ments?|author contributions?|funding|competing interests?|conflicts? of interest|data availability|references|supplementary material|appendix(?:\s+[A-Z0-9]+)?(?:[.:]\s*.*)?)$/i;

// A cross-reference key, never typeset, so it only has to survive as an
// identifier in either target's label syntax.
export const manuscriptSourceLabel = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'label';

// "Fig. {n}." is the journal's own label format; the target only wants the
// word in front of the number, since it prints the number itself.
export const manuscriptSourceLabelPrefix = (
  format: string | null | undefined,
  fallback: string,
): string => {
  const prefix = (format ?? '').split('{n}')[0].trim().replace(/[:.]$/, '');
  return prefix.length > 0 ? prefix : fallback;
};

// The caption text as Markdown, before either target escapes it: no number,
// because the target numbers the figure itself.
export const manuscriptSourceCaption = (figure: NumberedFigure): string =>
  [
    isNonEmptyString(figure.caption) ? figure.caption : (figure.name ?? ''),
    isNonEmptyString(figure.credit) ? `Credit: ${figure.credit}` : '',
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

export type ManuscriptSourceAuthor = {
  name: string;
  // The affiliation markers as one superscript ("1,3"); empty when the author
  // claims none.
  markers: string;
  isCorresponding: boolean;
};

export type ManuscriptSourceByline = {
  affiliations: ManuscriptAffiliation[];
  authors: ManuscriptSourceAuthor[];
};

// Affiliations numbered in the order they were written, and every author
// carrying the markers that point at them.
export const manuscriptSourceByline = (
  metadata: ManuscriptBundle['metadata'],
): ManuscriptSourceByline => {
  const affiliations = parseManuscriptAffiliations(metadata.affiliations);
  const numberById = new Map(
    affiliations.map((affiliation, index) => [affiliation.id, index + 1]),
  );
  return {
    affiliations,
    authors: parseManuscriptAuthors(metadata.authors, affiliations).map(
      (author) => ({
        name: author.name,
        markers: author.affiliationIds
          .flatMap((id) => {
            const number = numberById.get(id);
            return number === undefined ? [] : [number];
          })
          .sort((left, right) => left - right)
          .join(','),
        isCorresponding: author.isCorresponding,
      }),
    ),
  };
};

export type ManuscriptSourceImages = {
  // The filename to reference, or null when the source is not a base64 data
  // URL that can be written out beside the document.
  addImage: (dataUrl: string, hint: string) => string | null;
  imageFiles: () => ExportFile[];
};

// Images travel as sidecar files: neither TeX nor Typst reads a data URL, and
// a figure named twice must resolve to the one file both times.
export const collectManuscriptSourceImages = (): ManuscriptSourceImages => {
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

  return { addImage, imageFiles: () => files };
};

export type ManuscriptSourceFigureImage =
  | { kind: 'file'; filename: string; widthPercent: number }
  | { kind: 'linked'; name: string; source: string }
  | { kind: 'missing'; name: string };

// Where a figure's image ends up. Neither a TeX nor a Typst run has a network,
// so a linked image cannot be pulled in — naming it beats letting the figure
// vanish from the source without a trace.
export const manuscriptSourceFigureImage = (
  figure: NumberedFigure,
  addImage: (dataUrl: string, hint: string) => string | null,
): ManuscriptSourceFigureImage => {
  const name =
    figure.label.length > 0 ? figure.label : (figure.name ?? 'Figure');
  const image = resolveFigureImage(figure);
  if (image.kind === 'dataurl') {
    const filename = addImage(image.src, figure.refKey ?? figure.id);
    if (filename !== null) {
      return {
        kind: 'file',
        filename,
        widthPercent: Math.min(100, Math.max(10, figure.widthPercent ?? 100)),
      };
    }
  }
  return image.kind === 'url'
    ? { kind: 'linked', name, source: image.src }
    : { kind: 'missing', name };
};

export type ManuscriptSourceInlineWriter = {
  escape: (value: string) => string;
  citation: (keys: string[], label: string) => string;
  crossReference: (refKey: string, label: string) => string;
  displayMath: (latex: string) => string;
  inlineMath: (latex: string) => string;
  code: (code: string) => string;
  image: (source: string, alt: string) => string;
  link: (href: string) => ManuscriptSourceWrap;
  lineBreak: string;
  superscript: ManuscriptSourceWrap;
  subscript: ManuscriptSourceWrap;
  bold: ManuscriptSourceWrap;
  emphasis: ManuscriptSourceWrap;
  strikethrough: ManuscriptSourceWrap;
};

const PLACEHOLDER = '\u0000';

// Inline Markdown → either target's markup. Anything already in the target's
// syntax (maths, a citation, a cross-reference) is parked in a placeholder
// before the escaping pass so the escaper never touches it; a wrapper parks
// only its delimiters, leaving the content in the stream so nesting and
// escaping still reach it.
export const renderManuscriptSourceInline = (
  value: string,
  writer: ManuscriptSourceInlineWriter,
): string => {
  const parked: string[] = [];
  const park = (markup: string): string =>
    `${PLACEHOLDER}${parked.push(markup) - 1}${PLACEHOLDER}`;
  const wrap = (
    { open, close }: ManuscriptSourceWrap,
    inner: string,
  ): string => `${park(open)}${inner}${park(close)}`;

  const working = value
    .replace(CITATION_ANCHOR_PATTERN, (_match, keys: string, label: string) =>
      park(writer.citation(citationAnchorKeys(keys), label)),
    )
    .replace(CROSS_REF_ANCHOR_PATTERN, (_match, key: string, label: string) =>
      park(writer.crossReference(key, label)),
    )
    .replace(/\$\$([^$]+)\$\$/g, (_match, math: string) =>
      park(writer.displayMath(math)),
    )
    .replace(/\$([^$\n]+)\$/g, (_match, math: string) =>
      park(writer.inlineMath(math)),
    )
    .replace(/`([^`]+)`/g, (_match, code: string) => park(writer.code(code)))
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
      (_match, alt: string, source: string) =>
        park(writer.image(source, alt)),
    )
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, (_match, inner: string) =>
      wrap(writer.superscript, inner),
    )
    .replace(/<sub>([\s\S]*?)<\/sub>/gi, (_match, inner: string) =>
      wrap(writer.subscript, inner),
    )
    .replace(/<br\s*\/?>/gi, () => park(writer.lineBreak))
    // Whatever other markup an imported document left behind is not something
    // we typeset; its text content stays.
    .replace(/<\/?[A-Za-z][^<>]*>/g, '')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
      (_match, label: string, href: string) => wrap(writer.link(href), label),
    )
    .replace(/\*\*([^*]+)\*\*/g, (_match, inner: string) =>
      wrap(writer.bold, inner),
    )
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, (_match, inner: string) =>
      wrap(writer.emphasis, inner),
    )
    .replace(/(?<![_\w])_([^_\n]+)_(?!\w)/g, (_match, inner: string) =>
      wrap(writer.emphasis, inner),
    )
    .replace(/~~([^~]+)~~/g, (_match, inner: string) =>
      wrap(writer.strikethrough, inner),
    );

  // The importer's script markers survive escaping untouched, so they can be
  // turned into real markup afterwards.
  const escaped = manuscriptScriptSegments(writer.escape(working))
    .map((segment) =>
      segment.position === 'SUPERSCRIPT'
        ? `${writer.superscript.open}${segment.text}${writer.superscript.close}`
        : segment.position === 'SUBSCRIPT'
          ? `${writer.subscript.open}${segment.text}${writer.subscript.close}`
          : segment.text,
    )
    .join('');

  return escaped.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
    (_match, index: string) => parked[Number(index)] ?? '',
  );
};

export type ManuscriptSourceBlockWriter = {
  paragraph: (text: string) => string;
  heading: (level: number, text: string) => string;
  // The fenced block's lines, verbatim — neither target escapes them.
  code: (lines: string[]) => string;
  displayMath: (lines: string[]) => string;
  // The table's own Markdown, since the two targets take the grid apart in
  // opposite ways.
  table: (markdown: string) => string;
  thematicBreak: string;
  list: (items: string[], ordered: boolean) => string;
  quote: (text: string) => string;
};

// The Markdown block scanner. Line-oriented on purpose: the composer writes
// this Markdown itself, so the flavour is known and a full parser would buy
// nothing but a dependency.
export const renderManuscriptSourceBlocks = (
  markdown: string,
  writer: ManuscriptSourceBlockWriter,
): string[] => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text.length > 0) blocks.push(writer.paragraph(text));
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
      blocks.push(writer.heading(heading[1].length, heading[2].trim()));
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
      blocks.push(writer.code(body));
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
      blocks.push(writer.displayMath(body));
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
      blocks.push(writer.table(block.join('\n')));
      continue;
    }

    if (/^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push(writer.thematicBreak);
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
      blocks.push(writer.list(items, ordered));
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
      blocks.push(writer.quote(block.join(' ')));
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
};

export type ManuscriptSourceNodeWriter = {
  heading: (level: number, text: string) => string;
  // What a level-1 heading — the supplement — emits ahead of itself: a page
  // break, then the counter resets that restart numbering under the journal's
  // supplement prefix, so the target arrives at "Figure S1" the way the
  // composer does.
  supplementBreak: (prefix: string) => string[];
  keywords: (keywords: string) => string;
  prose: (markdown: string) => string[];
  figure: (figure: NumberedFigure) => string;
  table: (figure: NumberedFigure) => string;
  equation: (figure: NumberedFigure) => string;
  bibliography: () => string[];
  // Set only by a target that wraps the abstract in an environment. A target
  // that has none leaves the abstract heading to be written as a heading.
  abstractEnvironment: ManuscriptSourceWrap | null;
};

// The walk over the bundle's neutral node stream, which is where the front
// matter is recognised: an abstract and a keyword list arrive as an ordinary
// heading followed by ordinary prose, and only their heading text says what
// they are.
export const renderManuscriptSourceNodes = (
  bundle: ManuscriptBundle,
  writer: ManuscriptSourceNodeWriter,
): string[] => {
  const body: string[] = [];
  const { abstractEnvironment } = writer;
  let frontMatter: 'abstract' | 'keywords' | null = null;

  // An asset cannot sit inside an abstract environment, so it ends the front
  // matter section it interrupts. A target without such an environment has
  // nothing open and nothing to end.
  const closeFrontMatter = () => {
    if (abstractEnvironment === null) return;
    if (frontMatter === 'abstract') body.push(abstractEnvironment.close);
    frontMatter = null;
  };

  bundle.nodes.forEach((node, index) => {
    switch (node.kind) {
      case 'heading': {
        // The bibliography prints its own "References" heading.
        if (bundle.nodes[index + 1]?.kind === 'bibliography') return;
        closeFrontMatter();
        const heading = node.text.trim();
        if (abstractEnvironment !== null && /^abstract$/i.test(heading)) {
          body.push(abstractEnvironment.open);
          frontMatter = 'abstract';
          return;
        }
        frontMatter = /^keywords?$/i.test(heading) ? 'keywords' : null;
        if (frontMatter === 'keywords') return;
        if (node.level === 1) {
          body.push(
            ...writer.supplementBreak(bundle.style.supplementPrefix ?? 'S'),
          );
        }
        body.push(writer.heading(node.level, heading));
        return;
      }
      case 'prose': {
        if (frontMatter === 'keywords') {
          frontMatter = null;
          body.push(
            writer.keywords(
              node.markdown.replace(/^\s*keywords?\s*:\s*/i, '').trim(),
            ),
          );
          return;
        }
        body.push(...writer.prose(node.markdown));
        return;
      }
      case 'figure':
        closeFrontMatter();
        body.push(writer.figure(node.figure));
        return;
      case 'table':
        closeFrontMatter();
        body.push(writer.table(node.figure));
        return;
      case 'equation': {
        closeFrontMatter();
        const equation = writer.equation(node.figure);
        if (equation.length > 0) body.push(equation);
        return;
      }
      case 'bibliography':
        closeFrontMatter();
        body.push(...writer.bibliography());
        return;
    }
  });

  closeFrontMatter();
  return body;
};

// Both source exporters need the same bundle: CSL-formatted citations, drawn
// diagrams and both kinds of anchor, since each writes its own references and
// its own cross-references from them.
export const prepareManuscriptSourceBundle = async (
  bundle: ManuscriptBundle,
): Promise<ManuscriptBundle> =>
  prepareManuscriptDiagramImages(
    await prepareManuscriptBundleWithCsl(bundle, {
      citationAnchors: true,
      crossReferenceAnchors: true,
    }),
  );
