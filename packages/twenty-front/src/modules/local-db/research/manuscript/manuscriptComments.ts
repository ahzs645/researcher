import { isNonEmptyString } from '@sniptt/guards';

import {
  type ManuscriptBundle,
  type ManuscriptDocNode,
} from './manuscriptAssembly';
import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
} from './manuscriptContributors';

// A co-author's comment: the one thing in a returned manuscript that is
// neither the author's prose nor the journal's furniture. It used to arrive
// here and stop — read out of `word/comments.xml`, flattened into a section
// note, and never written back — so the file the author handed on had fifteen
// of their co-author's questions missing from it.
//
// ── Where a comment lives between the two trips ────────────────────────────
// In the section's `notes` field, as the attributed line it was already being
// rendered as, with the author's answer on the line under it:
//
//   Imported comment — Rae Ivy (RI) on 2026-03-04 [on "the window is …"]: Why?
//   Reply — Six weeks is the shortest interval that resolves the diurnal cycle.
//
// The rendering *is* the store. That is the whole decision, and it is worth
// saying why, because a JSON blob beside the prose was the obvious alternative:
//
//   * There is no second copy to drift. `importedCommentsNote` produced this
//     text already and the wizard and the grant-application import both read
//     it; parsing the same line back means a comment the author edits by hand
//     in the notes field is still a comment, and a comment this module writes
//     is still readable by a person.
//   * It needs no new column. A comment is not a record with a lifecycle — it
//     is a line of somebody else's writing attached to a section — and the
//     field for that already exists.
//   * Anything the parser does not recognise is kept verbatim as a plain note
//     line, in place, so the author's own notes survive a reply being written.
//
// ── The anchor ─────────────────────────────────────────────────────────────
// The span a comment points at is remembered as *the words themselves*,
// quoted in the line, and found again by searching the section for them at
// export time. Not as a marker embedded in the prose.
//
// `manuscriptFootnotes` faced the same choice and went the other way, for a
// reason that does not apply here: a footnote's text has nowhere else to live,
// so it has to sit in the sentence, and a visible `^[…]` token is the only
// form that degrades legibly when the editor damages it. A comment is not the
// author's writing at all. Putting a marker for it in the prose would mean:
//
//   * BlockNote gets a say. Every character between `content` and the editor
//     is at the mercy of a Markdown round trip, and an invisible delimiter is
//     the one kind of damage an author cannot see they have done. Half a
//     deleted delimiter leaves a range that swallows the rest of the section.
//   * The author's own document carries somebody else's furniture in it —
//     exported to LaTeX, to JATS, to Markdown, everywhere, forever.
//
// Searching for the words instead has exactly one failure mode, and it is the
// honest one: the author edited or deleted the words the comment was about.
// Then the search misses, and the comment is anchored to the section's heading
// with the original quote carried into the comment body — so a co-author
// opening the file still reads their own question and what it was about,
// against the section it was about. Nothing is ever dropped. Editing the
// *surrounding* paragraph, re-flowing it, or moving the section changes
// nothing, because none of that touches the quoted words.
//
// The export form is the mirror of `numberManuscriptFootnotes`: markers in the
// control-character idiom the citation, cross-reference and footnote anchors
// already use, written into a copy of the bundle at export time and read only
// by the DOCX writer. Stored text never sees them.

export type ManuscriptComment = {
  // As the source document said. An anonymised review still has an author slot
  // to fill, so this is never empty.
  author: string;
  initials?: string;
  // The day Word recorded. A day, not an instant: it is what the note line has
  // shown since comments were first imported, and a reviewer's comment is not
  // an event anyone needs to the second.
  date?: string;
  text: string;
  // The words the comment was written about.
  anchoredText?: string;
  // The author's answer. There is one or there is not — no thread, no second
  // reply, no identity beyond the manuscript's own byline.
  reply?: string;
};

// One line of a section's notes: a comment, or anything else the author wrote
// there. Keeping the plain lines as entries rather than collecting them at the
// end is what lets a reply be written without shuffling the author's notes.
export type ManuscriptNotesEntry =
  | { kind: 'comment'; comment: ManuscriptComment }
  | { kind: 'note'; text: string };

const COMMENT_LINE_PREFIX = 'Imported comment — ';
const REPLY_LINE_PREFIX = 'Reply — ';

// `Imported comment — {who}[ [on "{anchor}"]]: {text}`. The lazy first group
// stops at the earlier of the anchor bracket and the first `: `, which is what
// makes both spellings one pattern.
const COMMENT_LINE = /^Imported comment — (.*?)(?: \[on "(.*)"\])?: ([\s\S]*)$/;

// `{author}[ ({initials})][ on {day}]`, anchored at both ends so the optional
// tails are settled before the name is.
const COMMENT_ATTRIBUTION = /^(.*?)(?: \((.*)\))?(?: on (\d{4}-\d{2}-\d{2}))?$/;

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const isoCommentDay = (date: string | undefined): string | undefined =>
  date === undefined ? undefined : /^\d{4}-\d{2}-\d{2}/.exec(date)?.[0];

const commentAttribution = (comment: ManuscriptComment): string => {
  const day = isoCommentDay(comment.date);
  return [
    comment.author,
    comment.initials === undefined ? '' : `(${comment.initials})`,
    day === undefined ? '' : `on ${day}`,
  ]
    .filter((part) => part.length > 0)
    .join(' ');
};

const commentLine = (comment: ManuscriptComment): string => {
  const anchor =
    comment.anchoredText === undefined ? '' : ` [on "${comment.anchoredText}"]`;
  return `${COMMENT_LINE_PREFIX}${commentAttribution(comment)}${anchor}: ${comment.text}`;
};

const readCommentLine = (line: string): ManuscriptComment | undefined => {
  const match = COMMENT_LINE.exec(line);
  if (match === null) return undefined;
  const attribution = COMMENT_ATTRIBUTION.exec(match[1]);
  const author = (attribution?.[1] ?? match[1]).trim();
  const initials = attribution?.[2]?.trim();
  const date = attribution?.[3];
  return {
    author: author.length > 0 ? author : 'Unknown author',
    ...(isNonEmptyString(initials) ? { initials } : {}),
    ...(date === undefined ? {} : { date }),
    ...(match[2] === undefined ? {} : { anchoredText: match[2] }),
    text: match[3],
  };
};

export const parseManuscriptSectionNotes = (
  notes: string | null | undefined,
): ManuscriptNotesEntry[] => {
  if (!isNonEmptyString(notes)) return [];
  const entries: ManuscriptNotesEntry[] = [];
  for (const line of notes.split('\n')) {
    const previous = entries[entries.length - 1];
    // A reply belongs to the comment above it, and only to the first one: a
    // second `Reply —` line under the same comment is somebody writing prose,
    // not a thread, and is kept as the note line it is.
    if (
      line.length > REPLY_LINE_PREFIX.length &&
      line.startsWith(REPLY_LINE_PREFIX) &&
      previous?.kind === 'comment' &&
      previous.comment.reply === undefined
    ) {
      entries[entries.length - 1] = {
        kind: 'comment',
        comment: {
          ...previous.comment,
          reply: line.slice(REPLY_LINE_PREFIX.length),
        },
      };
      continue;
    }
    const comment = readCommentLine(line);
    entries.push(
      comment === undefined
        ? { kind: 'note', text: line }
        : { kind: 'comment', comment },
    );
  }
  return entries;
};

export const serializeManuscriptSectionNotes = (
  entries: readonly ManuscriptNotesEntry[],
): string =>
  entries
    .flatMap((entry) =>
      entry.kind === 'note'
        ? [entry.text]
        : [
            commentLine(entry.comment),
            ...(isNonEmptyString(entry.comment.reply)
              ? [`${REPLY_LINE_PREFIX}${entry.comment.reply}`]
              : []),
          ],
    )
    .join('\n');

export const manuscriptCommentsNote = (
  comments: readonly ManuscriptComment[],
): string =>
  serializeManuscriptSectionNotes(
    comments.map((comment) => ({ kind: 'comment', comment })),
  );

export const manuscriptSectionComments = (
  notes: string | null | undefined,
): ManuscriptComment[] =>
  parseManuscriptSectionNotes(notes).flatMap((entry) =>
    entry.kind === 'comment' ? [entry.comment] : [],
  );

// Answer the nth comment in a section's notes, keeping everything else in the
// field exactly where it was. An empty answer clears the reply rather than
// storing a blank line, so the surface has no separate "undo" to build.
export const withManuscriptCommentReply = (
  notes: string | null | undefined,
  commentIndex: number,
  reply: string,
): string => {
  let seen = -1;
  return serializeManuscriptSectionNotes(
    parseManuscriptSectionNotes(notes).map((entry) => {
      if (entry.kind !== 'comment') return entry;
      seen += 1;
      if (seen !== commentIndex) return entry;
      const { reply: _previous, ...rest } = entry.comment;
      const answer = collapse(reply);
      return {
        kind: 'comment',
        comment: answer.length === 0 ? rest : { ...rest, reply: answer },
      };
    }),
  );
};

// What an imported section's notes field should hold. A package restore
// carries the field whole — it already holds the comment lines and any answer
// written against them — while a Word import has comments and nothing else.
export const manuscriptImportedSectionNotes = (section: {
  notes?: string;
  comments?: readonly ManuscriptComment[];
}): string | undefined => {
  if (isNonEmptyString(section.notes)) return section.notes;
  const comments = section.comments ?? [];
  return comments.length === 0 ? undefined : manuscriptCommentsNote(comments);
};

// ── The export form ────────────────────────────────────────────────────────
// A pair of markers around the words a comment was written about, carrying the
// id the comment will have in `word/comments.xml`. Written into a copy of the
// bundle by `anchorManuscriptComments` and read by the DOCX writer alone —
// the same division of labour the footnote anchors keep between the token the
// author typed and the numbered form the exporters see.

const COMMENT_RANGE_OPEN = '\u0006';
const COMMENT_RANGE_CLOSE = '\u0007';
const COMMENT_ANCHOR_END = '\u0003';

const COMMENT_ANCHOR_PATTERN = /[\u0006\u0007](\d+)\u0003/g;

export type ManuscriptCommentAnchorSegment =
  | { kind: 'commentStart'; commentId: number }
  | { kind: 'commentEnd'; commentId: number };

export type ManuscriptCommentSegment =
  | { kind: 'text'; value: string }
  | ManuscriptCommentAnchorSegment;

export const hasManuscriptCommentAnchors = (value: string): boolean => {
  COMMENT_ANCHOR_PATTERN.lastIndex = 0;
  return COMMENT_ANCHOR_PATTERN.test(value);
};

export const stripManuscriptCommentAnchors = (value: string): string =>
  value.replace(COMMENT_ANCHOR_PATTERN, '');

export const splitManuscriptCommentAnchors = (
  value: string,
): ManuscriptCommentSegment[] => {
  const segments: ManuscriptCommentSegment[] = [];
  let plainStart = 0;
  COMMENT_ANCHOR_PATTERN.lastIndex = 0;
  let match = COMMENT_ANCHOR_PATTERN.exec(value);
  while (match !== null) {
    if (match.index > plainStart) {
      segments.push({
        kind: 'text',
        value: value.slice(plainStart, match.index),
      });
    }
    segments.push(
      match[0].startsWith(COMMENT_RANGE_OPEN)
        ? { kind: 'commentStart', commentId: Number(match[1]) }
        : { kind: 'commentEnd', commentId: Number(match[1]) },
    );
    plainStart = match.index + match[0].length;
    match = COMMENT_ANCHOR_PATTERN.exec(value);
  }
  if (plainStart < value.length) {
    segments.push({ kind: 'text', value: value.slice(plainStart) });
  }
  return segments;
};

// ── Finding the words again ────────────────────────────────────────────────
// The quote came out of Word with its whitespace collapsed and its scripts
// stripped; the section it has to be found in is Markdown that has since been
// through citation rendering and cross-reference resolution. So the search
// runs against a normalised view of the prose, built alongside a map back to
// the offsets in the real string — and the markers are always inserted on a
// boundary of that map, never inside an anchor's payload.

const SCRIPT_MARKERS = '\u200B\u200C\u200D\u2060';
const ASSET_NUMBER_MARKERS = '\u2061\u2064';
const CITATION_ANCHOR_OPEN = '\u0002';
const FOOTNOTE_ANCHOR_OPEN = '\u0004';
const CROSS_REFERENCE_ANCHOR_OPEN = '\u0005';
const ANCHOR_SPLIT = '\u0011';

const ANCHOR_OPENERS =
  CITATION_ANCHOR_OPEN +
  FOOTNOTE_ANCHOR_OPEN +
  CROSS_REFERENCE_ANCHOR_OPEN +
  COMMENT_RANGE_OPEN +
  COMMENT_RANGE_CLOSE;

// What an anchored span puts on the page. A citation and a cross-reference
// both print the label after the split — "[3]", "Figure 2" — and a reviewer
// quoting a sentence quoted those characters too. A footnote prints only its
// mark, and a comment range prints nothing at all.
const anchorPrintedText = (opener: string, payload: string): string => {
  if (
    opener !== CITATION_ANCHOR_OPEN &&
    opener !== CROSS_REFERENCE_ANCHOR_OPEN
  ) {
    return '';
  }
  const split = payload.indexOf(ANCHOR_SPLIT);
  return split === -1 ? payload : payload.slice(split + 1);
};

// One indivisible piece of the source: a character, a run of whitespace, a
// marker that prints nothing, or a whole anchored span. `offset`/`length` say
// where it lands in the normalised string, `start`/`end` where it came from.
type NormalizedAtom = {
  start: number;
  end: number;
  offset: number;
  length: number;
};

type NormalizedText = { text: string; atoms: NormalizedAtom[] };

const normalizeForCommentSearch = (value: string): NormalizedText => {
  const atoms: NormalizedAtom[] = [];
  let text = '';
  let index = 0;
  const push = (start: number, end: number, printed: string): void => {
    atoms.push({ start, end, offset: text.length, length: printed.length });
    text += printed;
    index = end;
  };
  while (index < value.length) {
    const character = value[index];
    const anchorEnd = ANCHOR_OPENERS.includes(character)
      ? value.indexOf(COMMENT_ANCHOR_END, index + 1)
      : -1;
    if (anchorEnd !== -1) {
      push(
        index,
        anchorEnd + 1,
        anchorPrintedText(character, value.slice(index + 1, anchorEnd)),
      );
      continue;
    }
    if (
      SCRIPT_MARKERS.includes(character) ||
      ASSET_NUMBER_MARKERS.includes(character)
    ) {
      push(index, index + 1, '');
      continue;
    }
    if (/\s/.test(character)) {
      let end = index + 1;
      while (end < value.length && /\s/.test(value[end])) end += 1;
      push(index, end, ' ');
      continue;
    }
    push(index, index + 1, character);
  }
  return { text, atoms };
};

type CommentAnchorSpan = { start: number; end: number };

// A long quote arrives from the importer cut to length with an ellipsis, so
// the search runs on the part that is really the reviewer's words.
const ELLIPSIS = '…';

const locateAnchoredText = (
  markdown: string,
  anchoredText: string,
): CommentAnchorSpan | null => {
  const needle = collapse(anchoredText).replace(new RegExp(`${ELLIPSIS}$`), '');
  if (needle.length === 0) return null;
  const normalized = normalizeForCommentSearch(markdown);
  const at = normalized.text.indexOf(needle);
  if (at === -1) return null;
  const until = at + needle.length;
  let start = markdown.length;
  let end = 0;
  for (const atom of normalized.atoms) {
    if (atom.offset + atom.length <= at || atom.offset >= until) continue;
    start = Math.min(start, atom.start);
    end = Math.max(end, atom.end);
  }
  return end > start ? { start, end } : null;
};

// ── Anchoring a bundle ─────────────────────────────────────────────────────

export type ManuscriptExportComment = {
  // The id the body's ranges point at, and the id in `word/comments.xml`.
  commentId: number;
  author: string;
  initials?: string;
  date?: string;
  text: string;
  // Set on the author's answer, so the writer can say so rather than leaving
  // a co-author guessing which of two comments on the same words is the reply.
  isReply: boolean;
  // Set when the words this was written about are no longer in the section:
  // the range goes on the section's heading and the quote travels inside the
  // comment, so what it pointed at is still readable.
  orphanedAnchorText?: string;
};

export type AnchoredManuscriptComments = {
  bundle: ManuscriptBundle;
  comments: ManuscriptExportComment[];
};

const nameInitials = (name: string): string | undefined => {
  const letters = name
    .split(/[\s,]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase())
    .join('')
    .slice(0, 3);
  return letters.length > 0 ? letters : undefined;
};

// Who the answer is from. There is no identity in this app beyond the paper's
// own byline, so the reply is signed by the corresponding author, or by the
// first author when nobody is marked corresponding.
const manuscriptReplyAuthor = (
  bundle: ManuscriptBundle,
): { author: string; initials?: string } => {
  const authors = parseManuscriptAuthors(
    bundle.metadata.authors,
    parseManuscriptAffiliations(bundle.metadata.affiliations),
  );
  // A byline written without affiliation markers keeps the corresponding
  // author's asterisk in the name, because there is no bracket for the parser
  // to have taken it out of. It is a marker, not part of anyone's name.
  const name = (
    authors.find((author) => author.isCorresponding) ?? authors[0]
  )?.name
    .replace(/\*+$/, '')
    .trim();
  if (!isNonEmptyString(name)) return { author: 'Author' };
  const initials = nameInitials(name);
  return { author: name, ...(initials === undefined ? {} : { initials }) };
};

// The nodes one section owns: its heading, and everything printed under it
// until the next section starts.
type SectionNodeRegion = {
  sectionId: string;
  headingIndex: number;
  proseIndexes: number[];
};

const sectionNodeRegions = (
  nodes: readonly ManuscriptDocNode[],
): SectionNodeRegion[] => {
  const regions: SectionNodeRegion[] = [];
  nodes.forEach((node, index) => {
    if (node.kind === 'heading' && node.section !== undefined) {
      regions.push({
        sectionId: node.section.id,
        headingIndex: index,
        proseIndexes: [],
      });
      return;
    }
    if (node.kind !== 'prose') return;
    regions[regions.length - 1]?.proseIndexes.push(index);
  });
  return regions;
};

// The opening sentence of a section, for a comment whose own words are gone.
const FIRST_SENTENCE = /^[\s\S]*?[.?!](?=\s|$)/;

const orphanTarget = (
  region: SectionNodeRegion,
  proseOf: (index: number) => string,
  nodes: readonly ManuscriptDocNode[],
): { nodeIndex: number; start: number; end: number } => {
  const nodeIndex = region.proseIndexes.find(
    (index) => proseOf(index).trim().length > 0,
  );
  if (nodeIndex === undefined) {
    const heading = nodes[region.headingIndex];
    return {
      nodeIndex: region.headingIndex,
      start: 0,
      end: heading.kind === 'heading' ? heading.text.length : 0,
    };
  }
  const markdown = proseOf(nodeIndex);
  return {
    nodeIndex,
    start: 0,
    end: FIRST_SENTENCE.exec(markdown)?.[0].length ?? markdown.length,
  };
};

type MarkerInsertion = {
  nodeIndex: number;
  offset: number;
  sequence: number;
  marker: string;
};

export const anchorManuscriptComments = (
  bundle: ManuscriptBundle,
): AnchoredManuscriptComments => {
  const commentsBySectionId = new Map<string, ManuscriptComment[]>();
  for (const section of bundle.numberedSections) {
    const comments = manuscriptSectionComments(section.notes);
    if (comments.length > 0) commentsBySectionId.set(section.id, comments);
  }
  if (commentsBySectionId.size === 0) return { bundle, comments: [] };

  const replyAuthor = manuscriptReplyAuthor(bundle);
  const exported: ManuscriptExportComment[] = [];
  const insertions: MarkerInsertion[] = [];
  const proseOf = (index: number): string => {
    const node = bundle.nodes[index];
    return node.kind === 'prose' ? node.markdown : '';
  };

  for (const region of sectionNodeRegions(bundle.nodes)) {
    for (const comment of commentsBySectionId.get(region.sectionId) ?? []) {
      const located = isNonEmptyString(comment.anchoredText)
        ? region.proseIndexes.flatMap((nodeIndex) => {
            const span = locateAnchoredText(
              proseOf(nodeIndex),
              comment.anchoredText as string,
            );
            return span === null ? [] : [{ nodeIndex, ...span }];
          })[0]
        : undefined;
      // Nothing to point at means pointing at the section itself, which is
      // still where the comment belongs — and is the last thing Word can be
      // given that keeps the comment visible at all. Its opening sentence
      // rather than its heading: a heading's text is read for structure
      // further down the export (whether a section is the abstract, whether it
      // opens the supplement), and a marker inside it would answer those
      // questions wrongly. Only a section with nothing under it falls back to
      // the heading, where there is no such question to get wrong.
      const target = located ?? orphanTarget(region, proseOf, bundle.nodes);
      const orphaned =
        located === undefined && isNonEmptyString(comment.anchoredText)
          ? { orphanedAnchorText: comment.anchoredText }
          : {};

      // The comment, then the answer to it: two Word comments over the same
      // words, because Word's reply threads are a Microsoft extension this
      // writer does not speak and a reply nested nowhere is a reply lost.
      const pair: ManuscriptExportComment[] = [
        {
          commentId: exported.length,
          author: comment.author,
          ...(comment.initials === undefined
            ? {}
            : { initials: comment.initials }),
          ...(comment.date === undefined ? {} : { date: comment.date }),
          text: comment.text,
          isReply: false,
          ...orphaned,
        },
        ...(isNonEmptyString(comment.reply)
          ? [
              {
                commentId: exported.length + 1,
                ...replyAuthor,
                text: comment.reply,
                isReply: true,
              },
            ]
          : []),
      ];
      for (const entry of pair) {
        insertions.push({
          nodeIndex: target.nodeIndex,
          offset: target.start,
          sequence: insertions.length,
          marker: `${COMMENT_RANGE_OPEN}${entry.commentId}${COMMENT_ANCHOR_END}`,
        });
      }
      for (const entry of pair) {
        insertions.push({
          nodeIndex: target.nodeIndex,
          offset: target.end,
          sequence: insertions.length,
          marker: `${COMMENT_RANGE_CLOSE}${entry.commentId}${COMMENT_ANCHOR_END}`,
        });
      }
      exported.push(...pair);
    }
  }

  if (exported.length === 0) return { bundle, comments: [] };

  // Every offset was measured on the untouched node, so the markers go in from
  // the back. Two at the same offset go in newest-first, which leaves them in
  // the order they were registered — the comment's range outside its reply's.
  const nodes = [...bundle.nodes];
  for (const insertion of [...insertions].sort(
    (left, right) =>
      right.offset - left.offset || right.sequence - left.sequence,
  )) {
    const node = nodes[insertion.nodeIndex];
    if (node.kind === 'prose') {
      nodes[insertion.nodeIndex] = {
        kind: 'prose',
        markdown:
          node.markdown.slice(0, insertion.offset) +
          insertion.marker +
          node.markdown.slice(insertion.offset),
      };
      continue;
    }
    if (node.kind !== 'heading') continue;
    nodes[insertion.nodeIndex] = {
      ...node,
      text:
        node.text.slice(0, insertion.offset) +
        insertion.marker +
        node.text.slice(insertion.offset),
    };
  }

  return { bundle: { ...bundle, nodes }, comments: exported };
};
