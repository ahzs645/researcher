import {
  CITATION_ANCHOR_PATTERN,
  citationAnchorKeys,
} from './manuscriptCitations';
import { CROSS_REF_ANCHOR_PATTERN } from './manuscriptCrossReference';
import { manuscriptScriptSegments } from './manuscriptScripts';
import { parseManuscriptTableGrid } from './manuscriptTableGrid';

// Markdown → HTML for the self-contained HTML export. Deliberately narrow: the
// only Markdown it has to understand is what this pipeline itself produces
// (headings, prose, emphasis, links, images, lists, quotes, GFM tables, math,
// citation anchors, and the importer's superscript markers), so it stays pure,
// testable without a DOM, and never reaches for a parser that would drag in
// its own escaping rules.

export type ManuscriptHtmlRenderContext = {
  // Renders one in-text citation to linked HTML.
  renderCitation: (keys: string[], label: string) => string;
  // Renders one resolved cross-reference ("Figure 3") as a link to its asset.
  renderCrossReference: (assetKey: string, label: string) => string;
  renderDisplayMath: (latex: string) => string;
  renderInlineMath: (latex: string) => string;
  // Returns inline SVG for a ```mermaid block, or null when it could not be
  // drawn (the caller then falls back to showing the diagram source).
  renderMermaid?: (source: string) => string | null;
  tableClass: string;
  // Called for every heading found in prose so the exporter can build an
  // outline. Returns the id to anchor the heading with.
  registerHeading: (level: number, text: string) => string;
};

const PLACEHOLDER = '\u0000';

// Tags the manuscript pipeline itself emits (cross-reference anchors, script
// runs). Anything else — `<50%`, a stray `<` in prose — is escaped as text.
const PASSTHROUGH_TAG =
  /<\/?(?:a|sup|sub|br|em|strong|i|b|span)(?:\s[^<>]*?)?\/?>/gi;

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const escapeHtmlAttribute = (value: string): string =>
  escapeHtml(value).replace(/'/g, '&#39;');

// Keep an exported file from carrying an executable link. Data URLs are allowed
// only for images, which is how every embedded figure travels.
export const sanitizeUrl = (url: string): string => {
  const trimmed = url.trim();
  return /^(?:https?:\/\/|mailto:|tel:|#|\/|\.{1,2}\/|data:image\/)/i.test(
    trimmed,
  )
    ? trimmed
    : '#';
};

const scriptMarkersToHtml = (value: string): string =>
  manuscriptScriptSegments(value)
    .map((segment) =>
      segment.position === 'SUPERSCRIPT'
        ? `<sup>${segment.text}</sup>`
        : segment.position === 'SUBSCRIPT'
          ? `<sub>${segment.text}</sub>`
          : segment.text,
    )
    .join('');

export const manuscriptInlineToHtml = (
  text: string,
  context: ManuscriptHtmlRenderContext,
): string => {
  const protectedHtml: string[] = [];
  const protect = (html: string): string =>
    `${PLACEHOLDER}${protectedHtml.push(html) - 1}${PLACEHOLDER}`;

  let working = text
    // Citations first: their label may itself contain brackets and parentheses
    // that the link and emphasis rules would otherwise claim.
    .replace(CITATION_ANCHOR_PATTERN, (_match, keys: string, label: string) =>
      protect(context.renderCitation(citationAnchorKeys(keys), label)),
    )
    .replace(CROSS_REF_ANCHOR_PATTERN, (_match, key: string, label: string) =>
      protect(context.renderCrossReference(key, label)),
    )
    .replace(/\$([^$\n]+)\$/g, (_match, latex: string) =>
      protect(context.renderInlineMath(latex)),
    )
    .replace(/`([^`]+)`/g, (_match, code: string) =>
      protect(`<code>${escapeHtml(code)}</code>`),
    )
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_match, alt: string, src) =>
      protect(
        `<img src="${escapeHtmlAttribute(sanitizeUrl(String(src)))}" alt="${escapeHtmlAttribute(alt)}">`,
      ),
    )
    .replace(PASSTHROUGH_TAG, (tag) => protect(tag));

  working = escapeHtml(working);

  working = working
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
      (_match, label: string, href: string) =>
        `<a href="${escapeHtmlAttribute(sanitizeUrl(href))}">${label}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>')
    .replace(/(?<![_\w])_([^_\n]+)_(?!\w)/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  working = scriptMarkersToHtml(working);

  return working.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
    (_match, index: string) => protectedHtml[Number(index)] ?? '',
  );
};

const tableToHtml = (
  lines: string[],
  context: ManuscriptHtmlRenderContext,
): string => {
  const grid = parseManuscriptTableGrid(lines.join('\n'));
  if (grid.rows.length === 0) return '';
  const cell = (tag: 'th' | 'td', row: (typeof grid.rows)[number]): string =>
    row
      .map((value) => {
        const span = [
          value.colSpan > 1 ? ` colspan="${value.colSpan}"` : '',
          value.rowSpan > 1 ? ` rowspan="${value.rowSpan}"` : '',
        ].join('');
        return `<${tag}${span}>${manuscriptInlineToHtml(value.text, context)}</${tag}>`;
      })
      .join('');
  const header = grid.rows.slice(0, grid.headerRows);
  const body = grid.rows.slice(grid.headerRows);
  return [
    `<div class="table-scroll"><table class="${context.tableClass}">`,
    ...(header.length > 0
      ? [
          '<thead>',
          ...header.map((row) => `<tr>${cell('th', row)}</tr>`),
          '</thead>',
        ]
      : []),
    '<tbody>',
    ...body.map((row) => `<tr>${cell('td', row)}</tr>`),
    '</tbody>',
    '</table></div>',
  ].join('');
};

const listToHtml = (
  lines: string[],
  ordered: boolean,
  context: ManuscriptHtmlRenderContext,
): string => {
  const items = lines.map((line) =>
    line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''),
  );
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items
    .map((item) => `<li>${manuscriptInlineToHtml(item, context)}</li>`)
    .join('')}</${tag}>`;
};

const isTableLine = (line: string): boolean => line.trim().startsWith('|');
const isUnorderedItem = (line: string): boolean => /^\s*[-*+]\s+/.test(line);
const isOrderedItem = (line: string): boolean => /^\s*\d+[.)]\s+/.test(line);

// A `---` line is a rule, but only when it is not a table separator.
const isRule = (line: string): boolean =>
  /^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line);

export const manuscriptMarkdownToHtml = (
  markdown: string,
  context: ManuscriptHtmlRenderContext,
): string => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text.length > 0) {
      html.push(`<p>${manuscriptInlineToHtml(text, context)}</p>`);
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
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = context.registerHeading(level, text);
      html.push(
        `<h${level} id="${escapeHtmlAttribute(id)}" data-outline-level="${level}">` +
          `<span class="heading-level-tag" aria-hidden="true">H${level}</span>` +
          `${manuscriptInlineToHtml(text, context)}</h${level}>`,
      );
      continue;
    }

    const fence = /^\s*```\s*([A-Za-z0-9_-]*)\s*$/.exec(line);
    if (fence !== null) {
      flushParagraph();
      const language = fence[1].toLowerCase();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      const source = body.join('\n');
      const diagram =
        language === 'mermaid'
          ? (context.renderMermaid?.(source) ?? null)
          : null;
      html.push(
        diagram !== null
          ? `<figure class="diagram">${diagram}</figure>`
          : `<pre class="code${language.length > 0 ? ` language-${language}` : ''}"><code>${escapeHtml(source)}</code></pre>`,
      );
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
      html.push(
        `<div class="equation">${context.renderDisplayMath(body.join('\n'))}</div>`,
      );
      continue;
    }

    if (isTableLine(line)) {
      flushParagraph();
      const block: string[] = [];
      while (index < lines.length && isTableLine(lines[index])) {
        block.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(tableToHtml(block, context));
      continue;
    }

    if (isRule(line)) {
      flushParagraph();
      html.push('<hr>');
      continue;
    }

    if (isUnorderedItem(line) || isOrderedItem(line)) {
      flushParagraph();
      const ordered = isOrderedItem(line);
      const block: string[] = [];
      while (
        index < lines.length &&
        (ordered ? isOrderedItem(lines[index]) : isUnorderedItem(lines[index]))
      ) {
        block.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(listToHtml(block, ordered, context));
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
      html.push(
        `<blockquote>${manuscriptInlineToHtml(block.join(' '), context)}</blockquote>`,
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return html.join('\n');
};
