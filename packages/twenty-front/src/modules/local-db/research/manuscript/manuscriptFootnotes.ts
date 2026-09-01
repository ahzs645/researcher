import {
  type ManuscriptBundle,
  type ManuscriptDocNode,
} from './manuscriptAssembly';
import { wrapManuscriptScript } from './manuscriptScripts';
import { type NumberedFigure } from './manuscriptTypes';

// Footnotes: a span of prose that belongs to a point in a sentence but is set
// away from it.
//
// ── How a footnote lives in a section's Markdown ────────────────────────────
// As a Pandoc *inline* note — `frozen^[Stored at -80 °C.] overnight` — the
// whole note inside the token, at the point it is anchored.
//
// The obvious candidate was the other Pandoc spelling, a `[^1]` reference with
// a `[^1]: …` definition further down, which is what every other tool in this
// space writes. It cannot be used here, and the reason is the editor rather
// than taste. BlockNote parses Markdown with remark-gfm, and GFM *has*
// footnotes: `[^1]` plus its definition is parsed, then handed to
// remark-rehype, which turns the reference into
// `<sup><a href="#user-content-fn-1">1</a></sup>` and the definition into a
// trailing `<section data-footnotes><ol><li>` — neither of which BlockNote has
// a block for. One trip through the editor and the author's footnote is a
// broken link plus a stray numbered list with a `↩` in it. Probed against the
// installed remark-gfm, not assumed.
//
// The inline form survives that trip untouched: with no definition to pair it
// with, remark leaves `^[…]` as literal text, and BlockNote's Markdown
// serializer emits text verbatim (it overrides remark-stringify's `text`
// handler), which is the same reason `[@key]` and `[#refKey]` survive today.
// Three further properties settled it:
//
//   * The note has no label, so two sections cannot collide on `[^1]`, there is
//     no definition to be deleted while the reference stays, and no number is
//     frozen into the prose to go stale when a section moves.
//   * It is visible. An invisible-character anchor of the kind
//     `manuscriptAssetAnchors` uses would leave the note's text sitting in the
//     middle of the paragraph with nothing to say it is a note, and deleting
//     one delimiter would silently swallow the rest of the sentence. Here a
//     damaged token degrades to visible `^[` characters — which is the failure
//     mode this whole feature exists to avoid.
//   * It is what Pandoc reads. A section body pasted into any other tool is
//     still a document with footnotes in it.
//
// The one thing the token cannot express is an unbalanced `]` inside the note.
// Brackets are matched by depth, so `^[see [1] and [2]]` is one note; a lone
// `]` ends the note early and the rest of the text stays visible as prose.
// Escaping it would not survive anyway — remark strips `\]` back to `]` on the
// way through the editor.
//
// ── The numbered form ──────────────────────────────────────────────────────
// Numbering belongs to the export, not to the stored text: the number depends
// on which sections are included and in what order, both of which are settled
// in `manuscriptSectionsForExport` long after the author typed the note. So
// `numberManuscriptFootnotes` walks the assembled bundle in document order and
// rewrites each authored token as an anchor carrying its number, in the same
// control-character style as the citation and cross-reference anchors — the
// exporters read those, never the authored form.

const FOOTNOTE_ANCHOR_OPEN = '\u0004';
const FOOTNOTE_ANCHOR_SPLIT = '\u0011';
const FOOTNOTE_ANCHOR_CLOSE = '\u0003';

const FOOTNOTE_ANCHOR_PATTERN = /\u0004(\d+)\u0011([^\u0003]*)\u0003/g;

export type ManuscriptFootnote = {
  number: number;
  // The note's own Markdown, exactly as it was written between the brackets.
  text: string;
};

export type ManuscriptFootnoteSegment =
  | { kind: 'text'; value: string }
  | { kind: 'footnote'; text: string; number?: number };

// Where the authored token ends, matching brackets by depth so a note may
// quote one. A blank line ends the search: a token that ran past a paragraph
// break would be a `^[` the author typed for some other reason.
const readAuthoredFootnote = (
  value: string,
  start: number,
): { text: string; end: number } | null => {
  if (value[start] !== '^' || value[start + 1] !== '[') return null;
  let depth = 0;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\n' && value[index + 1] === '\n') return null;
    if (character === '[') {
      depth += 1;
      continue;
    }
    if (character !== ']') continue;
    depth -= 1;
    if (depth > 0) continue;
    // `^[1]^` is a Pandoc superscript that happens to contain brackets — which
    // is exactly what the JATS importer writes for `<sup>[1]</sup>` — not a
    // note whose text is "1".
    if (value[index + 1] === '^') return null;
    return { text: value.slice(start + 2, index), end: index + 1 };
  }
  return null;
};

export const wrapManuscriptFootnote = (text: string): string =>
  `^[${text.replace(/\s+/g, ' ').trim()}]`;

const wrapNumberedFootnote = (footnote: ManuscriptFootnote): string =>
  `${FOOTNOTE_ANCHOR_OPEN}${footnote.number}${FOOTNOTE_ANCHOR_SPLIT}` +
  `${footnote.text}${FOOTNOTE_ANCHOR_CLOSE}`;

// Split prose into the text around its footnotes and the notes themselves.
// Both spellings are recognised in one pass: an exporter reading a prepared
// bundle sees only numbered anchors, but the same renderer is reached from a
// caption or a section body that never went through the numbering step, and a
// note without a number is still a note.
export const splitManuscriptFootnotes = (
  value: string,
): ManuscriptFootnoteSegment[] => {
  const segments: ManuscriptFootnoteSegment[] = [];
  let plainStart = 0;
  let cursor = 0;

  const pushText = (end: number): void => {
    if (end > plainStart) {
      segments.push({ kind: 'text', value: value.slice(plainStart, end) });
    }
  };

  while (cursor < value.length) {
    if (value[cursor] === FOOTNOTE_ANCHOR_OPEN) {
      FOOTNOTE_ANCHOR_PATTERN.lastIndex = cursor;
      const match = FOOTNOTE_ANCHOR_PATTERN.exec(value);
      if (match !== null && match.index === cursor) {
        pushText(cursor);
        segments.push({
          kind: 'footnote',
          text: match[2],
          number: Number(match[1]),
        });
        cursor += match[0].length;
        plainStart = cursor;
        continue;
      }
    }
    const authored =
      value[cursor] === '^' ? readAuthoredFootnote(value, cursor) : null;
    if (authored !== null) {
      pushText(cursor);
      segments.push({ kind: 'footnote', text: authored.text });
      cursor = authored.end;
      plainStart = cursor;
      continue;
    }
    cursor += 1;
  }
  pushText(value.length);

  return segments;
};

export const hasManuscriptFootnotes = (value: string): boolean =>
  splitManuscriptFootnotes(value).some(
    (segment) => segment.kind === 'footnote',
  );

// The prose with its notes taken out — for the places that print text and have
// nowhere to put a note: an image's alt text, a Word caption's description
// property, a plain-text summary.
export const stripManuscriptFootnotes = (value: string): string =>
  splitManuscriptFootnotes(value)
    .map((segment) => (segment.kind === 'text' ? segment.value : ''))
    .join('');

// For a target that draws text and has no footnote machinery of its own: the
// anchor becomes a superscript number, using the same script sentinels the
// importer marks a raised run with, so the marker is set the way a printed one
// is rather than typed as a digit on the baseline. A note that was never
// numbered has no entry anywhere to point at, so it is printed where it stands
// instead of being dropped.
export const manuscriptFootnoteMarkersToScripts = (value: string): string =>
  splitManuscriptFootnotes(value)
    .map((segment) =>
      segment.kind === 'text'
        ? segment.value
        : segment.number === undefined
          ? ` (${segment.text})`
          : wrapManuscriptScript(String(segment.number), 'SUPERSCRIPT'),
    )
    .join('');

export const manuscriptFootnoteTexts = (value: string): string[] =>
  splitManuscriptFootnotes(value).flatMap((segment) =>
    segment.kind === 'footnote' ? [segment.text] : [],
  );

// ── Numbering ──────────────────────────────────────────────────────────────
// One counter, advanced by a single walk of the assembled document in the
// order it will be printed. `bundle.nodes` is built from the sections that are
// actually going out, already sorted, so excluding a section or moving it
// renumbers everything after it without this module knowing anything about
// sections at all.
//
// The asset counters in `manuscriptNumbering` work the same way — one pass in
// render order, no number ever derived from a record's own id — but they carry
// per-kind counters, a supplement sequence and journal label templates that a
// footnote has no use for. What the two would have shared is the discipline,
// not the code; if a third numbered thing ever appears, the walk over
// `bundle.nodes` is the piece worth lifting out.

export type NumberedManuscriptFootnotes = {
  bundle: ManuscriptBundle;
  footnotes: ManuscriptFootnote[];
};

const numberFootnotesInText = (
  value: string,
  collect: (text: string) => ManuscriptFootnote,
): string =>
  splitManuscriptFootnotes(value)
    .map((segment) =>
      segment.kind === 'text'
        ? segment.value
        : wrapNumberedFootnote(
            segment.number === undefined
              ? collect(segment.text)
              : { number: segment.number, text: segment.text },
          ),
    )
    .join('');

// A caption is prose and every target renders it through the same inline
// writer the body uses, so a note anchored in one is numbered with the rest.
// A table *cell* is not: the DOCX and PDF table mappers lay out plain text and
// would print the anchor's control characters into the page. A note in a cell
// therefore keeps the form the author wrote, which the targets that do parse
// their cells still render properly and the two that do not print as visible
// `^[…]` text rather than as rubbish.
const numberFootnotesInFigure = (
  figure: NumberedFigure,
  collect: (text: string) => ManuscriptFootnote,
): NumberedFigure => {
  // A figure's panels are captioned prose too, and they are printed inside the
  // figure, so their notes belong in the same sequence as everything else —
  // and in the same walk, since the panels are only reachable from here.
  const withPanels =
    figure.panels === undefined
      ? figure
      : {
          ...figure,
          panels: figure.panels.map((panel) =>
            numberFootnotesInFigure(panel, collect),
          ),
        };
  const caption = withPanels.caption ?? '';
  return hasManuscriptFootnotes(caption)
    ? { ...withPanels, caption: numberFootnotesInText(caption, collect) }
    : withPanels;
};

export const numberManuscriptFootnotes = (
  bundle: ManuscriptBundle,
): NumberedManuscriptFootnotes => {
  const footnotes: ManuscriptFootnote[] = [];
  const collect = (text: string): ManuscriptFootnote => {
    const footnote = { number: footnotes.length + 1, text };
    footnotes.push(footnote);
    return footnote;
  };

  const nodes = bundle.nodes.map((node): ManuscriptDocNode => {
    if (node.kind === 'prose') {
      return hasManuscriptFootnotes(node.markdown)
        ? {
            kind: 'prose',
            markdown: numberFootnotesInText(node.markdown, collect),
          }
        : node;
    }
    if (
      node.kind === 'figure' ||
      node.kind === 'table' ||
      node.kind === 'equation'
    ) {
      return {
        kind: node.kind,
        figure: numberFootnotesInFigure(node.figure, collect),
      };
    }
    return node;
  });

  return footnotes.length === 0
    ? { bundle, footnotes }
    : { bundle: { ...bundle, nodes }, footnotes };
};

// The end-of-document notes list, as bundle nodes, for the two targets that
// cannot set a note at the foot of the page it belongs to — the PDF export
// draws react-pdf text with no footnote machinery of its own. An ordered list
// renumbers from 1, and these are 1..n in the same order, so the printed
// numbers are the numbers the markers carry.
export const manuscriptFootnoteNotesNodes = (
  footnotes: readonly ManuscriptFootnote[],
): ManuscriptDocNode[] =>
  footnotes.length === 0
    ? []
    : [
        { kind: 'heading', level: 2, text: 'Notes' },
        {
          kind: 'prose',
          markdown: footnotes
            .map(
              (footnote) =>
                `${footnote.number}. ${footnote.text.replace(/\s+/g, ' ').trim()}`,
            )
            .join('\n'),
        },
      ];
