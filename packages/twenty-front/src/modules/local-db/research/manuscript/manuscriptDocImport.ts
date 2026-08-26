// Pure document → manuscript-structure importer. Turns a Markdown / plain-text
// document (or the WordprocessingML extracted from a .docx) into
// `manuscriptSection` drafts so an existing paper can be *brought in* instead of
// retyped — the #1 gap that kept real `.docx` / `.pdf` papers out of the
// composer. No backend, no dependencies: the binary `.docx` unzip lives in a
// thin browser module (`manuscriptDocxFile.ts`); everything here is
// string-in / structure-out and unit-tested.

import { countWords } from './manuscriptAssembly';
import { assetPlacementMarker } from './manuscriptAssetPlacement';
import { COMMAND_TEXT } from './manuscriptMathGlyphs';
import { unicodeMathToLatex } from './manuscriptMathUnicode';
import {
  escapeManuscriptTableCellSpanMarker,
  TABLE_SPAN_LEFT_MARKER,
  TABLE_SPAN_UP_MARKER,
} from './manuscriptTableGrid';
import { gridToMarkdownTable, parseMarkdownTable } from './manuscriptTables';
import {
  stripManuscriptScriptMarkers,
  wrapManuscriptScript,
} from './manuscriptScripts';
import { type PortableResearchPaperManifest } from './manuscriptPortableManifest';
import { type AssetKind } from './manuscriptTypes';

export type ImportedSectionDraft = {
  name: string;
  sectionType: string;
  placement: string;
  content: string;
  orderIndex: number;
  level?: number;
  wordCount: number;
  includeInExport: boolean;
  status?: string;
  wordLimit?: number;
  // Reviewer comments the source document anchored inside this section. The
  // composer has no in-line comment layer, so they ride along as a draft field
  // and land in the section's notes at commit time instead of being dropped.
  comments?: ImportedComment[];
};

export type ImportedDocument = {
  title?: string;
  authorLine?: string;
  affiliations?: string;
  correspondingAuthor?: string;
  // Title-page furniture the composer renders verbatim under the author block
  // (degree statements, submission dates, student numbers).
  titlePageExtraLines?: string[];
  sections: ImportedSectionDraft[];
  warnings?: string[];
  stats?: {
    equationCount: number;
    embeddedImageCount: number;
    tableCount: number;
  };
  // Present only when the source carried revisions or comments, so a clean
  // document imports exactly as it did before this existed.
  revisionSummary?: WordRevisionSummary;
  // Exact body lines that the import map deliberately demoted from captions.
  // Asset extraction must preserve them as prose instead of reclassifying them.
  suppressedAssetLineSignatures?: string[];
  // `word/styles.xml` from the source .docx, and the file it came from. A paper
  // arrives looking like itself — its own fonts, headings and spacing — and the
  // DOCX exporter can use those styles as its base so the export it produces is
  // a drop-in replacement for the document the author already has.
  sourceStylesXml?: string;
  sourceDocumentName?: string;
  portablePackage?: PortableResearchPaperManifest;
  // Where that structure came from: a package this app exported, or a JATS
  // article someone else's tool wrote.
  portableSourceKind?: 'PACKAGE' | 'JATS';
};

export type ImportedFigureDraft = {
  name: string;
  assetKind: AssetKind;
  placement: 'MAIN' | 'SUPPLEMENT';
  refKey: string;
  caption: string;
  sourceLabel?: string;
  sectionOrderIndex?: number;
  tableData?: string;
  equationLatex?: string;
  diagramSource?: string;
  imageSource: 'NONE' | 'UPLOAD' | 'DIAGRAM';
  imageUrl?: string;
  altText?: string;
  credit?: string;
  widthPercent?: number;
  // Off for an asset the source set without a number.
  numbered?: boolean;
  orderIndex: number;
};

// Heading text → section type + placement. Order matters: the first rule whose
// pattern matches the (numbering-stripped, lower-cased) heading wins, so more
// specific phrases sit above generic ones.
type SectionRule = {
  sectionType: string;
  placement: string;
  pattern: RegExp;
};

const SECTION_RULES: SectionRule[] = [
  {
    sectionType: 'SUPPLEMENT',
    placement: 'SUPPLEMENT',
    pattern: /^s\d+(?:\.\d+)*(?:[.):]|\s)/,
  },
  {
    sectionType: 'TITLE_PAGE',
    placement: 'FRONT_MATTER',
    pattern: /^title page\b/,
  },
  {
    sectionType: 'ABSTRACT',
    placement: 'FRONT_MATTER',
    pattern: /^(abstract|summary|synopsis)\b/,
  },
  {
    sectionType: 'KEYWORDS',
    placement: 'FRONT_MATTER',
    pattern: /^(keywords|key words|index terms)\b/,
  },
  {
    sectionType: 'DATA_AVAILABILITY',
    placement: 'BACK_MATTER',
    pattern: /(data|code)\s+(and\s+code\s+)?availability|availability of data/,
  },
  {
    sectionType: 'AUTHOR_CONTRIBUTIONS',
    placement: 'BACK_MATTER',
    pattern: /author\s+contributions?|credit author/,
  },
  {
    sectionType: 'CONFLICTS',
    placement: 'BACK_MATTER',
    pattern:
      /conflicts?\s+of\s+interest|competing\s+interests?|declaration of (competing|interest)/,
  },
  {
    sectionType: 'ETHICS',
    placement: 'BACK_MATTER',
    // "Consent for publication" is a separate ICMJE statement from "consent to
    // participate"; both belong to ETHICS, not to the main text.
    pattern:
      /ethic(s|al)|institutional review|irb\b|consent (?:to participate|for publication)|informed consent/,
  },
  {
    sectionType: 'FUNDING',
    placement: 'BACK_MATTER',
    pattern: /^funding\b|financial support|funding statement/,
  },
  {
    sectionType: 'ACKNOWLEDGMENTS',
    placement: 'BACK_MATTER',
    pattern: /acknowledge?ments?|acknowledgements?/,
  },
  {
    sectionType: 'REFERENCES',
    placement: 'BACK_MATTER',
    pattern:
      /^(references|bibliography|works cited|literature cited|reference list)\b/,
  },
  {
    sectionType: 'SUPPLEMENT',
    placement: 'SUPPLEMENT',
    pattern: /supplement(ary|al)?|supporting information/,
  },
  {
    sectionType: 'APPENDIX',
    placement: 'SUPPLEMENT',
    pattern: /^(appendix|appendices|annex)\b/,
  },
  {
    sectionType: 'INTRODUCTION',
    placement: 'MAIN',
    pattern: /^(introduction|intro)\b/,
  },
  {
    sectionType: 'BACKGROUND',
    placement: 'MAIN',
    pattern:
      /^(related work|literature review|background|prior work|theoretical framework)\b/,
  },
  {
    sectionType: 'METHODS',
    placement: 'MAIN',
    pattern:
      /(methodolog|^methods?\b|materials and methods|experimental|study design|data and methods|study (?:area|site|location)|participants and|procedure)/,
  },
  {
    sectionType: 'RESULTS',
    placement: 'MAIN',
    pattern: /^(results|findings)\b|results and/,
  },
  {
    sectionType: 'DISCUSSION',
    placement: 'MAIN',
    pattern: /^discussion\b|discussion and/,
  },
  {
    sectionType: 'CONCLUSION',
    placement: 'MAIN',
    pattern:
      /^(conclusion|conclusions|concluding remarks|summary and conclusion)/,
  },
];

// Numeric headings in manuscripts commonly omit punctuation ("1 Introduction",
// "2.1 Sampling"). Keep stored names independent from source numbering so the
// export profile can renumber sections after reordering. Roman/letter markers
// still require punctuation so a real heading such as "A modular workflow" is
// never mistaken for an outline label.
const stripHeadingNumbering = (heading: string): string =>
  heading
    .replace(
      /^\s*(?:(?:\d+(?:\.\d+)*)(?:[.):]\s*|\s+)|(?:[ivxlcdm]+|[a-z])[.):]\s*)/i,
      '',
    )
    .trim();

const normalizeHeading = (heading: string): string =>
  stripHeadingNumbering(heading).toLowerCase();

export const classifyHeading = (
  heading: string,
): { sectionType: string; placement: string } => {
  const normalized = normalizeHeading(heading);
  const rule = SECTION_RULES.find((candidate) =>
    candidate.pattern.test(normalized),
  );
  return rule
    ? { sectionType: rule.sectionType, placement: rule.placement }
    : { sectionType: 'OTHER', placement: 'MAIN' };
};

type Block = { heading: string | null; level: number; body: string };

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;
// A bold-only line ("**Methods**") is a common heading style in pasted Word text.
const BOLD_HEADING_RE = /^\*\*(.+?)\*\*$/;

// Split raw Markdown/plain text into heading-delimited blocks, preserving the
// body under each heading verbatim (tables, lists, math and citations included).
const splitIntoBlocks = (text: string): Block[] => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let current: Block = { heading: null, level: 0, body: '' };
  const pushCurrent = () => {
    current.body = current.body.replace(/\n{3,}/g, '\n\n').trim();
    if (current.heading !== null || current.body.length > 0)
      blocks.push(current);
  };

  for (const line of lines) {
    const hashMatch = HEADING_RE.exec(line);
    const boldMatch =
      hashMatch === null ? BOLD_HEADING_RE.exec(line.trim()) : null;
    if (hashMatch !== null) {
      pushCurrent();
      current = {
        heading: hashMatch[2].trim(),
        level: hashMatch[1].length,
        body: '',
      };
    } else if (boldMatch !== null) {
      pushCurrent();
      current = { heading: boldMatch[1].trim(), level: 2, body: '' };
    } else {
      current.body += `${line}\n`;
    }
  }
  pushCurrent();
  return blocks;
};

const draftFromBlock = (
  heading: string,
  body: string,
  orderIndex: number,
  level: number,
): ImportedSectionDraft => {
  const { sectionType, placement } = classifyHeading(heading);
  return {
    name: stripHeadingNumbering(heading),
    sectionType,
    placement,
    content: body,
    orderIndex,
    level: Math.min(3, Math.max(1, level || 1)),
    wordCount: countWords(body),
    includeInExport: true,
  };
};

const STRUCTURAL_SECTION_TYPES = new Set([
  'ABSTRACT',
  'KEYWORDS',
  'INTRODUCTION',
  'TITLE_PAGE',
]);

export const applyLeadingFrontMatterPlacement = (
  sections: ImportedSectionDraft[],
): ImportedSectionDraft[] => {
  const firstStructuralIndex = sections.findIndex((section) =>
    STRUCTURAL_SECTION_TYPES.has(section.sectionType),
  );
  if (firstStructuralIndex < 0) return sections;

  return sections.map((section, index) =>
    index < firstStructuralIndex &&
    section.sectionType === 'OTHER' &&
    section.wordCount < 40
      ? { ...section, placement: 'FRONT_MATTER' }
      : section,
  );
};

// Parse a Markdown / plain-text document into a title + ordered section drafts.
// Rules (documented because they are the import contract):
//  - The document **title** is the first top-level (shallowest) heading when it
//    carries no body of its own, or — if the text opens with un-headed prose —
//    that opening line.
//  - Every other heading starts a section, classified by its text.
//  - A document with no headings at all becomes one "Body" section (OTHER).
export const parseMarkdownDocument = (text: string): ImportedDocument => {
  const blocks = splitIntoBlocks(text);
  if (blocks.length === 0) return { sections: [] };

  let title: string | undefined;
  let startIndex = 0;
  let titlePageBlock: Block | null = null;

  const first = blocks[0];
  if (first.heading === null) {
    // Opening prose with no heading: first line is the title; the remainder
    // (if any) becomes a leading untyped section.
    const [firstLine, ...rest] = first.body.split('\n');
    title = firstLine.trim() || undefined;
    const remainder = rest.join('\n').trim();
    if (remainder.length > 0) {
      // The title page is a top-level part of the document, not a subsection of
      // whatever heading happens to follow it.
      first.heading = 'Title page';
      first.level = 1;
      first.body = remainder;
      titlePageBlock = first;
    } else {
      startIndex = 1;
    }
  } else {
    const minLevel = Math.min(...blocks.map((block) => block.level || 99));
    const firstClassification = classifyHeading(first.heading);
    const isLeadingDocumentTitle =
      firstClassification.sectionType === 'OTHER' &&
      (first.body.length === 0 || first.heading.length >= 40);
    if (
      (first.level === minLevel && first.body.length === 0) ||
      isLeadingDocumentTitle
    ) {
      title = first.heading;
      if (first.body.length > 0) {
        first.heading = 'Title page';
        first.level = 1;
        titlePageBlock = first;
      } else {
        startIndex = 1;
      }
    }
  }

  // A document whose own top-level headings are Word's "Heading 2" is still a
  // document with top-level headings. Anchor the shallowest one at 1 so the
  // outline depth an author sees matches the one they wrote, instead of every
  // section exporting one level deeper than the title it sits under.
  const body = blocks.slice(startIndex);
  // The synthetic "Title page" block is ours, not the author's: anchoring the
  // outline on its level 1 left a document whose own top-level sections are
  // Word "Heading 2" exporting one level too deep.
  const outlineBody = body.filter((block) => block !== titlePageBlock);
  const shallowest = Math.min(
    ...(outlineBody.length > 0 ? outlineBody : body).map(
      (block) => block.level || 1,
    ),
  );
  if (Number.isFinite(shallowest) && shallowest > 1) {
    for (const block of body) {
      block.level = Math.max(1, (block.level || 1) - (shallowest - 1));
    }
  }

  const sections: ImportedSectionDraft[] = [];
  // "2.1 Sampling sites" under "2 Method" is still Method: an unrecognised
  // subsection inherits its nearest classified body ancestor instead of falling
  // to OTHER/MAIN. Front and back matter never adopt children — a subsection of
  // the title page or the references is not more title page.
  let parent: { level: number; sectionType: string; placement: string } | null =
    null;
  for (let index = startIndex; index < blocks.length; index += 1) {
    const block = blocks[index];
    const heading = block.heading ?? 'Body';
    if (block.body.length === 0 && block.heading === null) continue;

    const draft = draftFromBlock(
      heading,
      block.body,
      sections.length,
      block.level,
    );
    const blockLevel = block.level || 1;
    if (draft.sectionType !== 'OTHER') {
      parent =
        draft.placement === 'MAIN' || draft.placement === 'SUPPLEMENT'
          ? {
              level: blockLevel,
              sectionType: draft.sectionType,
              placement: draft.placement,
            }
          : null;
      sections.push(draft);
      continue;
    }
    sections.push(
      parent !== null && blockLevel > parent.level
        ? {
            ...draft,
            sectionType: parent.sectionType,
            placement: parent.placement,
          }
        : draft,
    );
  }

  return { title, sections: applyLeadingFrontMatterPlacement(sections) };
};

// ── WordprocessingML (.docx body) → Markdown ────────────────────────────────
// The .docx zip is opened by the browser glue; this turns its `word/document.xml`
// into Markdown that `parseMarkdownDocument` then structures. Pure string work so
// it is unit-testable without a real Office file.

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

const decodeXml = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (entity) => XML_ENTITIES[entity] ?? entity,
    );

// Text-bearing tokens of a paragraph, in document order. Breaks and tabs must be
// read *in the same pass* as `<w:t>`: substituting them into the surrounding XML
// (the previous approach) threw them away, because only `<w:t>` contents were
// collected afterwards — so a heading following a `<w:br/>` fused onto the end of
// the previous paragraph and disappeared from the imported outline.
const WORD_TEXT_TOKEN =
  /<w:tab\b[^>]*\/?>|<w:(?:br|cr)\b[^>]*\/?>|<\/w:p>\s*<w:p\b[^>]*>|<(?:w|m):t\b[^>]*>([\s\S]*?)<\/(?:w|m):t>/g;

// Concatenate the text runs of a paragraph/cell, honouring tabs and line breaks.
const wordRunsText = (xml: string): string => {
  const withScripts = xml.replace(/<w:r\b[\s\S]*?<\/w:r>/g, (runXml) => {
    const superscript = /<w:vertAlign\b[^>]*w:val="superscript"/.test(runXml);
    const subscript = /<w:vertAlign\b[^>]*w:val="subscript"/.test(runXml);
    if (!superscript && !subscript) return runXml;
    return runXml.replace(
      /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g,
      (_match, openingTag: string, text: string, closingTag: string) => {
        const decoded = decodeXml(text);
        const shouldPreserve = superscript
          ? /^\s*(?:\d+(?:,\d+)*\*?|s?t|th,?|\d+)\s*$/.test(decoded)
          : decoded.trim().length > 0 && decoded.length <= 12;
        return shouldPreserve
          ? `${openingTag}${wrapManuscriptScript(
              text,
              superscript ? 'SUPERSCRIPT' : 'SUBSCRIPT',
            )}${closingTag}`
          : `${openingTag}${text}${closingTag}`;
      },
    );
  });
  // `<w:pPr>` holds tab *stops* (`<w:tabs><w:tab w:pos="720"/>`), which are
  // layout, not content — reading them would inject phantom tabs into the prose.
  const content = withScripts.replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/g, '');
  let text = '';
  for (const match of content.matchAll(WORD_TEXT_TOKEN)) {
    if (match[1] !== undefined) {
      text += decodeXml(match[1]);
    } else {
      text += match[0].startsWith('<w:tab') ? '\t' : '\n';
    }
  }
  return text;
};

// ── Tracked changes and comments ───────────────────────────────────────────
// A manuscript coming back from a co-author is the commonest input this app
// has, and it arrives full of `w:ins`/`w:del` runs. Reading only `<w:t>` kept
// every insertion and swallowed every deletion — deleted text lives in
// `<w:delText>` — which is "accept all changes" chosen by accident and stated
// nowhere. The resolution is an explicit option now, and the counts below are
// what the wizard shows the author before anything is committed.

export type TrackedChangeResolution = 'ACCEPT' | 'REJECT';

export type WordRevisionSummary = {
  insertionCount: number;
  deletionCount: number;
  commentCount: number;
};

export type ImportedComment = {
  commentId: string;
  author: string;
  initials?: string;
  date?: string;
  text: string;
  // The document text the comment was anchored to. Without it a reviewer's
  // "why this one?" reads as a note about nothing in particular.
  anchoredText?: string;
};

// A comment carries the heading it sat under so it can be re-attached after the
// blocks have been through Markdown and back, which is what the import wizard
// does between mapping and commit.
export type ImportedCommentAnchor = ImportedComment & {
  headingText?: string;
};

// `w:ins`/`w:del` also mark inserted or deleted *paragraph marks and table
// rows*, which carry no text of their own and live inside the properties
// elements. Drop those first: an author told "3 insertions" means three pieces
// of inserted text. Innermost properties first, so the outer non-greedy match
// still ends on its own closing tag.
const REVISION_PROPERTY_ELEMENTS = [
  /<w:rPr\b[\s\S]*?<\/w:rPr>/g,
  /<w:pPr\b[\s\S]*?<\/w:pPr>/g,
  /<w:trPr\b[\s\S]*?<\/w:trPr>/g,
  /<w:tcPr\b[\s\S]*?<\/w:tcPr>/g,
];

// `(?![A-Za-z])` is load-bearing: `<w:delText>` is the deleted *text*, and
// `<w:insideH>` is a table border. Neither is a revision.
const INSERTION_ELEMENT = /<w:(?:ins|moveTo)(?![A-Za-z])/g;
const DELETION_ELEMENT = /<w:(?:del|moveFrom)(?![A-Za-z])/g;
const ANY_REVISION_ELEMENT = /<w:(?:ins|del|moveTo|moveFrom)(?![A-Za-z])/;
const REVISION_OPENING_TAG =
  /<w:(ins|del|moveTo|moveFrom)(?![A-Za-z])((?:[^>"]|"[^"]*")*?)(\/?)>/g;
const COMMENT_ANCHOR_TAG =
  /<w:comment(Reference|RangeStart|RangeEnd)\b((?:[^>"]|"[^"]*")*?)\/?>/g;
const COMMENT_ELEMENT =
  /<w:comment\b((?:[^>"]|"[^"]*")*?)>([\s\S]*?)<\/w:comment>/g;

const attributeValue = (attributes: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];

const collapseWhitespace = (value: string): string =>
  stripManuscriptScriptMarkers(value).replace(/\s+/g, ' ').trim();

// Move revisions are a deletion and an insertion Word happens to know are the
// same words; pandoc drops the pair on the floor. Treating `w:moveTo` as an
// insertion and `w:moveFrom` as a deletion keeps a moved paragraph in exactly
// one place under either resolution.
const isInsertionElement = (name: string): boolean =>
  name === 'ins' || name === 'moveTo';

const revisionElementEnd = (
  xml: string,
  name: string,
  from: number,
): { innerEnd: number; after: number } | null => {
  const scanner = new RegExp(
    `<(/?)w:${name}(?![A-Za-z])((?:[^>"]|"[^"]*")*?)(/?)>`,
    'g',
  );
  scanner.lastIndex = from;
  let depth = 1;
  let match = scanner.exec(xml);
  while (match !== null) {
    if (match[3] !== '/') {
      depth += match[1] === '/' ? -1 : 1;
      if (depth === 0) {
        return { innerEnd: match.index, after: scanner.lastIndex };
      }
    }
    match = scanner.exec(xml);
  }
  return null;
};

// Deleted runs keep their text in `<w:delText>`, which no reader in this file
// looks at. Rejecting a deletion means putting that text back where a normal
// run would have it.
const restoreDeletedRunText = (xml: string): string =>
  xml
    .replace(/<w:delText\b/g, '<w:t')
    .replace(/<\/w:delText>/g, '</w:t>')
    .replace(/<w:delInstrText\b/g, '<w:instrText')
    .replace(/<\/w:delInstrText>/g, '</w:instrText>');

// Rewrite a body so the remaining runs are the text the chosen resolution
// keeps. Nesting is real — an author deletes what a co-author inserted — so the
// walk recurses: inserted-then-deleted text survives neither resolution, which
// is the right answer in both directions.
export const resolveWordTrackedChanges = (
  xml: string,
  resolution: TrackedChangeResolution,
): string => {
  if (!ANY_REVISION_ELEMENT.test(xml)) return xml;

  let resolved = '';
  let cursor = 0;
  REVISION_OPENING_TAG.lastIndex = 0;
  let match = REVISION_OPENING_TAG.exec(xml);
  while (match !== null) {
    resolved += xml.slice(cursor, match.index);
    const openingTagEnd = match.index + match[0].length;
    // A self-closing marker sits on a paragraph mark or a table row: it has no
    // text to keep or drop, and the paragraph itself stays either way.
    const end =
      match[3] === '/'
        ? null
        : revisionElementEnd(xml, match[1], REVISION_OPENING_TAG.lastIndex);
    if (end === null) {
      cursor = openingTagEnd;
    } else {
      if (isInsertionElement(match[1]) === (resolution === 'ACCEPT')) {
        const inner = resolveWordTrackedChanges(
          xml.slice(openingTagEnd, end.innerEnd),
          resolution,
        );
        resolved += isInsertionElement(match[1])
          ? inner
          : restoreDeletedRunText(inner);
      }
      cursor = end.after;
    }
    REVISION_OPENING_TAG.lastIndex = cursor;
    match = REVISION_OPENING_TAG.exec(xml);
  }
  return resolved + xml.slice(cursor);
};

const bodyCommentIds = (documentXml: string): Set<string> => {
  const ids = new Set<string>();
  for (const match of documentXml.matchAll(COMMENT_ANCHOR_TAG)) {
    const commentId = attributeValue(match[2], 'w:id');
    if (commentId !== undefined) ids.add(commentId);
  }
  return ids;
};

export const parseWordComments = (commentsXml: string): ImportedComment[] => {
  const comments: ImportedComment[] = [];
  for (const match of commentsXml.matchAll(COMMENT_ELEMENT)) {
    const commentId = attributeValue(match[1], 'w:id');
    if (commentId === undefined) continue;
    const author = decodeXml(attributeValue(match[1], 'w:author') ?? '').trim();
    const initials = decodeXml(
      attributeValue(match[1], 'w:initials') ?? '',
    ).trim();
    const date = attributeValue(match[1], 'w:date') ?? '';
    comments.push({
      commentId,
      // An anonymised review still has an author slot to fill.
      author: author.length > 0 ? author : 'Unknown author',
      ...(initials.length > 0 ? { initials } : {}),
      ...(date.length > 0 ? { date } : {}),
      text: collapseWhitespace(wordRunsText(match[2])),
    });
  }
  return comments;
};

export const summarizeWordRevisions = (
  documentXml: string,
  commentsXml = '',
): WordRevisionSummary => {
  const body = REVISION_PROPERTY_ELEMENTS.reduce(
    (xml, pattern) => xml.replace(pattern, ''),
    documentXml,
  );
  return {
    insertionCount: (body.match(INSERTION_ELEMENT) ?? []).length,
    deletionCount: (body.match(DELETION_ELEMENT) ?? []).length,
    // A comment can be anchored without a body (a stripped package) or carry a
    // body nothing anchors; the author should hear about either.
    commentCount: Math.max(
      bodyCommentIds(documentXml).size,
      parseWordComments(commentsXml).length,
    ),
  };
};

export const hasWordRevisions = (summary: WordRevisionSummary): boolean =>
  summary.insertionCount + summary.deletionCount + summary.commentCount > 0;

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

const TRACKED_CHANGE_WARNING = 'This document has tracked changes:';
const COMMENT_WARNING = /^This document has \d+ comments?\./;

// A caller that knows more than the body XML did — the import wizard reads
// `word/comments.xml`, which the parser was not given — replaces these rather
// than stacking a second, differently-counted copy on top.
export const isWordRevisionWarning = (warning: string): boolean =>
  warning.startsWith(TRACKED_CHANGE_WARNING) || COMMENT_WARNING.test(warning);

export const wordRevisionWarnings = (
  summary: WordRevisionSummary,
  resolution: TrackedChangeResolution,
): string[] => {
  const warnings: string[] = [];
  if (summary.insertionCount + summary.deletionCount > 0) {
    warnings.push(
      `${TRACKED_CHANGE_WARNING} ${countPhrase(
        summary.insertionCount,
        'insertion',
      )} and ${countPhrase(summary.deletionCount, 'deletion')}. ${
        resolution === 'ACCEPT'
          ? 'They are being accepted: inserted text is imported and deleted text is dropped.'
          : 'They are being rejected: inserted text is dropped and deleted text is restored.'
      } The revision history itself is not imported.`,
    );
  }
  if (summary.commentCount > 0) {
    warnings.push(
      `This document has ${countPhrase(
        summary.commentCount,
        'comment',
      )}. Each one is imported into the notes of the section it sits in, with its author and the text it was anchored to.`,
    );
  }
  return warnings;
};

const isoDay = (date: string | undefined): string | undefined =>
  date === undefined ? undefined : /^\d{4}-\d{2}-\d{2}/.exec(date)?.[0];

// The composer stores no comment records, so a section's imported comments are
// rendered into its existing notes field — one line each, attributed.
export const importedCommentsNote = (comments: ImportedComment[]): string =>
  comments
    .map((comment) => {
      const day = isoDay(comment.date);
      const who = [
        comment.author,
        comment.initials === undefined ? '' : `(${comment.initials})`,
        day === undefined ? '' : `on ${day}`,
      ]
        .filter((part) => part.length > 0)
        .join(' ');
      const anchor =
        comment.anchoredText === undefined
          ? ''
          : ` [on "${comment.anchoredText}"]`;
      return `Imported comment — ${who}${anchor}: ${comment.text}`;
    })
    .join('\n');

export type WordStyleDefinition = {
  name: string;
  headingLevel: number;
};

export type WordImportOptions = {
  styles?: Record<string, WordStyleDefinition>;
  imageByRelationshipId?: Record<string, { dataUrl: string; altText: string }>;
  // Defaults to ACCEPT, which is what every import did before the choice
  // existed — and the only behaviour a document with no revisions can have.
  trackedChanges?: TrackedChangeResolution;
  // `word/comments.xml` from the same .docx package, when the caller read it.
  commentsXml?: string;
};

export type WordMarkdownBlock = {
  kind: 'paragraph' | 'table' | 'synthetic';
  markdown: string;
  styleId?: string;
  styleName?: string;
  sourceHeadingLevel?: number;
  headingSource?: 'style' | 'semantic' | 'bold';
  // Ids of the comments anchored in this block, so a comment can be traced to
  // the heading it sits under once the text is Markdown.
  commentIds?: string[];
};

const COMMENT_ANCHOR_MAX_LENGTH = 120;
const HEADING_MARKDOWN_LINE = /^\s*#{1,6}\s+(.*\S)\s*$/m;

// What the comment was written about, read from the range the source marked
// around it. A bare `w:commentReference` with no range leaves the anchor
// unknown rather than guessed at from the surrounding paragraph.
const commentAnchorTexts = (documentXml: string): Record<string, string> => {
  const rangeByCommentId = new Map<string, { start?: number; end?: number }>();
  for (const match of documentXml.matchAll(COMMENT_ANCHOR_TAG)) {
    const commentId = attributeValue(match[2], 'w:id');
    if (commentId === undefined || match[1] === 'Reference') continue;
    const range = rangeByCommentId.get(commentId) ?? {};
    rangeByCommentId.set(
      commentId,
      match[1] === 'RangeStart'
        ? { ...range, start: match.index + match[0].length }
        : { ...range, end: match.index },
    );
  }

  const texts: Record<string, string> = {};
  for (const [commentId, range] of rangeByCommentId) {
    if (
      range.start === undefined ||
      range.end === undefined ||
      range.end <= range.start
    ) {
      continue;
    }
    const text = collapseWhitespace(
      wordRunsText(documentXml.slice(range.start, range.end)),
    );
    if (text.length === 0) continue;
    texts[commentId] =
      text.length > COMMENT_ANCHOR_MAX_LENGTH
        ? `${text.slice(0, COMMENT_ANCHOR_MAX_LENGTH - 1).trimEnd()}…`
        : text;
  }
  return texts;
};

const anchoredCommentIds = (xml: string): string[] => {
  const commentIds: string[] = [];
  for (const match of xml.matchAll(COMMENT_ANCHOR_TAG)) {
    const commentId = attributeValue(match[2], 'w:id');
    if (commentId !== undefined && !commentIds.includes(commentId)) {
      commentIds.push(commentId);
    }
  }
  return commentIds;
};

export const parseWordCommentAnchors = (
  documentXml: string,
  commentsXml: string,
  blocks: WordMarkdownBlock[],
): ImportedCommentAnchor[] => {
  const comments = parseWordComments(commentsXml);
  if (comments.length === 0) return [];

  const anchorTexts = commentAnchorTexts(documentXml);
  const headingByCommentId = new Map<string, string>();
  let currentHeading: string | undefined;
  for (const block of blocks) {
    // A comment on the heading paragraph itself belongs to the section that
    // heading opens, so the heading is read before the block's comments.
    const heading = HEADING_MARKDOWN_LINE.exec(block.markdown)?.[1];
    if (heading !== undefined) currentHeading = heading;
    for (const commentId of block.commentIds ?? []) {
      if (currentHeading !== undefined && !headingByCommentId.has(commentId)) {
        headingByCommentId.set(commentId, currentHeading);
      }
    }
  }

  return comments.map((comment) => {
    const anchoredText = anchorTexts[comment.commentId];
    const headingText = headingByCommentId.get(comment.commentId);
    return {
      ...comment,
      ...(anchoredText !== undefined ? { anchoredText } : {}),
      ...(headingText !== undefined ? { headingText } : {}),
    };
  });
};

const commentSectionIndex = (
  sections: ImportedSectionDraft[],
  anchor: ImportedCommentAnchor,
): number => {
  const headingText = anchor.headingText;
  if (headingText !== undefined) {
    const byHeading = sections.findIndex(
      (section) =>
        normalizeHeading(section.name) === normalizeHeading(headingText),
    );
    if (byHeading >= 0) return byHeading;
  }
  // The heading a comment sat under can be folded away (title-page furniture)
  // or renamed, so fall back to the section that still holds the anchored text.
  const anchoredText = anchor.anchoredText;
  if (anchoredText !== undefined) {
    const probe = anchoredText.slice(0, 40);
    const byContent = sections.findIndex((section) =>
      collapseWhitespace(section.content).includes(probe),
    );
    if (byContent >= 0) return byContent;
  }
  return 0;
};

export const attachImportedComments = (
  sections: ImportedSectionDraft[],
  anchors: ImportedCommentAnchor[],
): ImportedSectionDraft[] => {
  if (anchors.length === 0 || sections.length === 0) return sections;

  const commentsBySectionIndex = new Map<number, ImportedComment[]>();
  for (const anchor of anchors) {
    const { headingText: _headingText, ...comment } = anchor;
    const sectionIndex = commentSectionIndex(sections, anchor);
    commentsBySectionIndex.set(sectionIndex, [
      ...(commentsBySectionIndex.get(sectionIndex) ?? []),
      comment,
    ]);
  }

  return sections.map((section, index) => {
    const comments = commentsBySectionIndex.get(index);
    return comments === undefined ? section : { ...section, comments };
  });
};

export const parseWordStyleDefinitions = (
  stylesXml: string,
): Record<string, WordStyleDefinition> => {
  const definitions: Record<string, WordStyleDefinition> = {};
  const styles = stylesXml.match(/<w:style\b[\s\S]*?<\/w:style>/g) ?? [];

  for (const styleXml of styles) {
    const styleId = /w:styleId="([^"]+)"/.exec(styleXml)?.[1];
    if (styleId === undefined) continue;
    const name = /<w:name\b[^>]*w:val="([^"]+)"/.exec(styleXml)?.[1] ?? styleId;
    const outlineLevel = Number(
      /<w:outlineLvl\b[^>]*w:val="([0-8])"/.exec(styleXml)?.[1] ?? '-1',
    );
    const headingMatch = /heading\s*([1-6])/i.exec(`${styleId} ${name}`);
    const headingLevel =
      headingMatch !== null
        ? Number(headingMatch[1])
        : outlineLevel >= 0
          ? outlineLevel + 1
          : /^(title|article title)$/i.test(name)
            ? 1
            : 0;

    definitions[styleId] = { name, headingLevel };
  }

  return definitions;
};

const headingLevelFromStyle = (
  styleVal: string,
  styles: Record<string, WordStyleDefinition>,
): number => {
  const definedLevel = styles[styleVal]?.headingLevel ?? 0;
  if (definedLevel > 0) return definedLevel;
  const heading = /^heading\s*([1-6])/i.exec(styleVal);
  if (heading !== null) return Number(heading[1]);
  if (/^title$/i.test(styleVal)) return 1;
  if (/^subtitle$/i.test(styleVal)) return 2;
  return 0;
};

// ── OMML (Word math) → LaTeX ───────────────────────────────────────────────
// OMML is a tree: an `m:sSub` can sit inside another `m:sSub`'s `m:e`. Lazy
// regexes terminate on the *inner* closing tag, which silently dropped the outer
// script (`{C_{i}}_{crustal}` became `C_{i}crustal`). The walker below balances
// open/close tags the way `findMatchingTableEnd` does for nested `w:tbl`.

// Literal `m:t` text is prose, not markup: an unescaped `%` comments out the
// rest of the line and a stray `$` closes the math block early.
const LATEX_ESCAPES: Record<string, string> = {
  '\\': '\\backslash ',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\hat{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\sim ',
};

// Word stores operators as literal glyphs. Inverting the export map keeps the
// round-trip stable: `×` imports as `\times` and exports back to `×`.
const LATEX_COMMAND_BY_GLYPH: Record<string, string> = Object.entries(
  COMMAND_TEXT,
).reduce<Record<string, string>>(
  (map, [command, glyph]) =>
    map[glyph] === undefined ? { ...map, [glyph]: command } : map,
  {},
);

// n-ary operators live only in the `m:chr` *attribute*, so a missed match used
// to delete the `∑` entirely. Word omits `m:chr` when the operator is a sum.
const NARY_OPERATORS: Record<string, string> = {
  '∑': '\\sum',
  '∏': '\\prod',
  '∐': '\\coprod',
  '∫': '\\int',
  '∬': '\\iint',
  '∭': '\\iiint',
  '∮': '\\oint',
  '⋃': '\\bigcup',
  '⋂': '\\bigcap',
  '⋀': '\\bigwedge',
  '⋁': '\\bigvee',
};

const ACCENT_COMMANDS: Record<string, string> = {
  '̂': '\\hat',
  '̃': '\\tilde',
  '̄': '\\bar',
  '̇': '\\dot',
  '̈': '\\ddot',
  '̀': '\\grave',
  '́': '\\acute',
  '⃗': '\\vec',
};

const DELIMITER_COMMANDS: Record<string, string> = {
  '{': '\\{',
  '}': '\\}',
  '⟨': '\\langle',
  '⟩': '\\rangle',
  '‖': '\\|',
};

const LATEX_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'log',
  'ln',
  'lg',
  'exp',
  'lim',
  'max',
  'min',
  'det',
  'deg',
  'gcd',
]);

const escapeLatexText = (text: string): string =>
  [...text]
    .map((character) => {
      const command = LATEX_COMMAND_BY_GLYPH[character];
      if (command !== undefined) return `\\${command} `;
      return LATEX_ESCAPES[character] ?? character;
    })
    .join('');

type OmmlElement = { name: string; attributes: string; inner: string };

const XML_TAG = /<(\/?)([A-Za-z][\w.:-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g;

// Balanced scan for the close of `name`, mirroring `findMatchingTableEnd`.
const findOmmlElementEnd = (
  xml: string,
  name: string,
  from: number,
): { inner: string; end: number } => {
  const tag = new RegExp(
    `<${name}\\b(?:[^>"]|"[^"]*")*?(/?)>|</${name}\\s*>`,
    'g',
  );
  tag.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(xml)) !== null) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return { inner: xml.slice(from, match.index), end: tag.lastIndex };
      }
    } else if (match[1] !== '/') {
      depth += 1;
    }
  }
  return { inner: xml.slice(from), end: xml.length };
};

const ommlChildren = (xml: string): OmmlElement[] => {
  const children: OmmlElement[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    XML_TAG.lastIndex = cursor;
    const match = XML_TAG.exec(xml);
    if (match === null) break;
    const [, closing, name, attributes, selfClosing] = match;
    if (closing === '/') {
      cursor = XML_TAG.lastIndex;
      continue;
    }
    if (selfClosing === '/') {
      children.push({ name, attributes, inner: '' });
      cursor = XML_TAG.lastIndex;
      continue;
    }
    const closed = findOmmlElementEnd(xml, name, XML_TAG.lastIndex);
    children.push({ name, attributes, inner: closed.inner });
    cursor = closed.end;
  }
  return children;
};

const ommlChildInner = (
  children: OmmlElement[],
  name: string,
): string | undefined => children.find((child) => child.name === name)?.inner;

// Word property children (`m:naryPr`, `m:dPr`, …) carry their payload in
// attributes: `<m:chr m:val="∑"/>`.
const ommlPropertyValue = (
  children: OmmlElement[],
  propertyName: string,
  valueName: string,
): string | undefined => {
  const properties = ommlChildInner(children, propertyName);
  if (properties === undefined) return undefined;
  const value = ommlChildren(properties).find(
    (child) => child.name === valueName,
  );
  return value === undefined
    ? undefined
    : decodeXml(/m:val="([^"]*)"/.exec(value.attributes)?.[1] ?? '');
};

// A script base only needs braces when it is more than one atom, so `C_{i}` stays
// readable while a nested script becomes `{C_{i}}_{crustal}`.
const scriptBase = (value: string): string =>
  /^(?:\\[A-Za-z]+|[^\\{}])$/.test(value) ? value : `{${value}}`;

const convertOmmlChildren = (xml: string): string =>
  ommlChildren(xml).map(convertOmmlElement).join('');

const convertOmmlElement = (element: OmmlElement): string => {
  const { name, inner } = element;
  const children = ommlChildren(inner);
  // Trimmed: every child is composed into a `{…}` group, where padding from a
  // glyph command (`\sim `) or from pretty-printed XML would be noise.
  const part = (childName: string): string =>
    convertOmmlChildren(ommlChildInner(children, childName) ?? '').trim();

  switch (name) {
    case 'm:t':
    case 'w:t':
      return escapeLatexText(decodeXml(inner));
    case 'm:f':
      return `\\frac{${part('m:num')}}{${part('m:den')}}`;
    case 'm:sSub':
      return `${scriptBase(part('m:e'))}_{${part('m:sub')}}`;
    case 'm:sSup':
      return `${scriptBase(part('m:e'))}^{${part('m:sup')}}`;
    case 'm:sSubSup':
      return `${scriptBase(part('m:e'))}_{${part('m:sub')}}^{${part('m:sup')}}`;
    case 'm:nary': {
      const operatorGlyph = ommlPropertyValue(children, 'm:naryPr', 'm:chr');
      const operator =
        operatorGlyph === undefined
          ? '\\sum'
          : (NARY_OPERATORS[operatorGlyph] ?? escapeLatexText(operatorGlyph));
      // Word omits `m:sup` entirely when only a lower limit is set.
      const lower = ommlChildInner(children, 'm:sub');
      const upper = ommlChildInner(children, 'm:sup');
      const limits = [
        lower === undefined ? '' : `_{${convertOmmlChildren(lower).trim()}}`,
        upper === undefined ? '' : `^{${convertOmmlChildren(upper).trim()}}`,
      ].join('');
      return `${operator}${limits} ${part('m:e')}`;
    }
    case 'm:d': {
      const begin = ommlPropertyValue(children, 'm:dPr', 'm:begChr') ?? '(';
      const end = ommlPropertyValue(children, 'm:dPr', 'm:endChr') ?? ')';
      const separator = ommlPropertyValue(children, 'm:dPr', 'm:sepChr') ?? '|';
      const delimiter = (character: string): string =>
        character.length === 0
          ? '.'
          : (DELIMITER_COMMANDS[character] ?? character);
      const parts = children
        .filter((child) => child.name === 'm:e')
        .map((child) => convertOmmlChildren(child.inner).trim());
      return `\\left${delimiter(begin)}${parts.join(separator)}\\right${delimiter(end)}`;
    }
    case 'm:rad': {
      const degree = ommlChildInner(children, 'm:deg');
      const converted =
        degree === undefined ? '' : convertOmmlChildren(degree).trim();
      return `\\sqrt${converted.length > 0 ? `[${converted}]` : ''}{${part('m:e')}}`;
    }
    case 'm:func': {
      const functionName = part('m:fName').trim();
      const command = LATEX_FUNCTIONS.has(functionName)
        ? `\\${functionName}`
        : functionName;
      return `${command} ${part('m:e')}`;
    }
    case 'm:bar':
      return ommlPropertyValue(children, 'm:barPr', 'm:pos') === 'bot'
        ? `\\underline{${part('m:e')}}`
        : `\\bar{${part('m:e')}}`;
    case 'm:acc': {
      const accent = ommlPropertyValue(children, 'm:accPr', 'm:chr');
      const command =
        accent === undefined ? '\\hat' : (ACCENT_COMMANDS[accent] ?? '\\hat');
      return `${command}{${part('m:e')}}`;
    }
    case 'm:limLow':
      return `\\underset{${part('m:lim')}}{${part('m:e')}}`;
    case 'm:limUpp':
      return `\\overset{${part('m:lim')}}{${part('m:e')}}`;
    case 'm:m':
      return `\\begin{matrix}${children
        .filter((child) => child.name === 'm:mr')
        .map((row) =>
          ommlChildren(row.inner)
            .filter((cell) => cell.name === 'm:e')
            .map((cell) => convertOmmlChildren(cell.inner).trim())
            .join(' & '),
        )
        .join(' \\\\ ')}\\end{matrix}`;
    default:
      // Property elements are formatting only; everything else (m:oMath, m:r,
      // m:e, w:ins, …) is a transparent wrapper around more math.
      return name.endsWith('Pr') ? '' : convertOmmlChildren(inner);
  }
};

const ommlToLatex = (mathXml: string): string =>
  convertOmmlChildren(mathXml)
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();

const paragraphMath = (paragraphXml: string): string[] =>
  (paragraphXml.match(/<m:oMath\b[\s\S]*?<\/m:oMath>/g) ?? [])
    .map(ommlToLatex)
    .filter((value) => value.length > 0);

const paragraphImages = (
  paragraphXml: string,
  imageByRelationshipId: WordImportOptions['imageByRelationshipId'],
): string[] => {
  if (imageByRelationshipId === undefined) return [];
  const relationshipIds = [
    ...paragraphXml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g),
  ].map((match) => match[1]);

  return relationshipIds.flatMap((relationshipId) => {
    const image = imageByRelationshipId[relationshipId];
    return image === undefined
      ? []
      : [`![${image.altText.replace(/[\[\]]/g, '')}](${image.dataUrl})`];
  });
};

const isDirectlyBold = (paragraphXml: string): boolean =>
  /<w:b(?:\s[^>]*)?\/?>(?:<\/w:b>)?/.test(paragraphXml);

const isProseLike = (text: string): boolean =>
  text.length > 120 || /[.!?]\s+\S/.test(text) || /[.!?]$/.test(text);

const semanticHeadingLevel = (text: string): number => {
  if (text.length > 100 || /[.!?]\s+\S/.test(text)) return 0;
  const classification = classifyHeading(text);
  return classification.sectionType === 'OTHER' ? 0 : 2;
};

const BOLD_RUN_PROPERTY = /<w:b\b(?![^>]*w:val="(?:0|false)")[^>]*\/?>/;

const isBoldRun = (runXml: string): boolean =>
  BOLD_RUN_PROPERTY.test(/<w:rPr\b[\s\S]*?<\/w:rPr>/.exec(runXml)?.[0] ?? '');

// Word thesis templates end a body paragraph with `<w:br/>` followed by a fully
// bold run so the next heading keeps its page break. Such headings
// ("Acknowledgment", "Data Availability") only survive import if that trailing
// run is split back out, so keep the gate narrow: every run after the last break
// must be bold, short, and must not read like a sentence.
const trailingBoldHeadingText = (paragraphXml: string): string | null => {
  const breakIndex = paragraphXml.lastIndexOf('<w:br');
  if (breakIndex < 0) return null;
  const runs = [
    ...paragraphXml.slice(breakIndex).matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g),
  ].map((match) => match[0]);
  if (runs.length === 0 || !runs.every(isBoldRun)) return null;
  const text = runs.map(wordRunsText).join('').trim();
  if (text.length === 0 || text.length > 100 || text.includes('\n'))
    return null;
  return isProseLike(text) ? null : text;
};

const headingBlock = (
  text: string,
  provenance: Pick<WordMarkdownBlock, 'styleId' | 'styleName'>,
): WordMarkdownBlock => {
  const level = semanticHeadingLevel(text) || 3;
  return {
    kind: 'paragraph',
    markdown: `\n${'#'.repeat(level)} ${text}\n`,
    ...provenance,
    sourceHeadingLevel: level,
    headingSource: level === 3 ? 'bold' : 'semantic',
  };
};

// A styled paragraph longer than this is a mis-styled body paragraph, not a
// heading — the longest real title in the seeded template library is ~180
// characters.
const STYLED_HEADING_MAX_LENGTH = 250;

// "Ahmad Jalil and Hossein Kazemian", "A. Jalil^1*, H. Kazemian^1" — the author
// line of a journal title block. Word centres and bolds it exactly like a
// heading, so without this it became a section whose body swallowed the
// affiliation, the correspondence line and everything up to the abstract.
const looksLikeAuthorList = (text: string): boolean => {
  const stripped = stripManuscriptScriptMarkers(text).trim();
  if (stripped.length === 0 || stripped.includes('@')) return false;
  if (!/^[\p{Lu}]/u.test(stripped)) return false;
  const words = stripped.split(/\s+/);
  if (words.length > 15) return false;
  if (!/(?:,|;|\band\b|&)/.test(stripped)) return false;
  const nameLike = words.filter((word) =>
    /^[\p{Lu}][\p{L}'’.-]*[,;]?$/u.test(word),
  ).length;
  return nameLike >= 2 && nameLike >= words.length - 3;
};

const wordParagraphToMarkdown = (
  paragraphXml: string,
  options: WordImportOptions,
): WordMarkdownBlock[] => {
  const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(paragraphXml);
  const styleId = styleMatch?.[1] ?? '';
  const styleName = options.styles?.[styleId]?.name;
  const level = headingLevelFromStyle(styleId, options.styles ?? {});
  // OMML carries its own <m:t> text runs. Remove it from the prose pass so an
  // equation is emitted once as math, not once as flattened text and again as
  // math.
  const paragraphText = wordRunsText(
    paragraphXml.replace(/<m:oMath\b[\s\S]*?<\/m:oMath>/g, ''),
  ).trim();
  const images = paragraphImages(paragraphXml, options.imageByRelationshipId);
  const math = paragraphMath(paragraphXml).map((value) => `$$${value}$$`);

  const provenance = {
    ...(styleId.length > 0 ? { styleId } : {}),
    ...(styleName !== undefined ? { styleName } : {}),
  };
  // Only the paragraph's own block claims its comments: a trailing heading
  // split off the end opens the *next* section, and would drag the comment
  // there with it.
  const commentIds = anchoredCommentIds(paragraphXml);
  const anchoredComments =
    commentIds.length > 0 ? { commentIds } : ({} as { commentIds?: string[] });

  if (paragraphText.length === 0 && images.length === 0 && math.length === 0) {
    return [
      { kind: 'paragraph', markdown: '', ...provenance, ...anchoredComments },
    ];
  }

  // A trailing bold run after a line break is the next heading, not the tail of
  // this paragraph — emit it as its own block.
  const trailingHeading = trailingBoldHeadingText(paragraphXml);
  const breakIndex = paragraphText.lastIndexOf('\n');
  const splitHeading =
    trailingHeading !== null &&
    breakIndex > 0 &&
    paragraphText.slice(breakIndex + 1).trim() === trailingHeading
      ? trailingHeading
      : null;
  const text =
    splitHeading === null
      ? paragraphText
      : paragraphText.slice(0, breakIndex).trim();
  const trailingBlocks =
    splitHeading === null ? [] : [headingBlock(splitHeading, provenance)];

  if (/^keywords?\s*:/i.test(text)) {
    return [
      {
        kind: 'paragraph',
        markdown: `\n## Keywords\n\n${text.replace(/^keywords?\s*:\s*/i, '')}\n`,
        ...provenance,
        ...anchoredComments,
        sourceHeadingLevel: 2,
        headingSource: 'semantic',
      },
      ...trailingBlocks,
    ];
  }

  const detectedLevel = semanticHeadingLevel(text);
  let headingSource: WordMarkdownBlock['headingSource'];
  let finalLevel = 0;
  // A multi-line paragraph is prose with breaks in it, never a single heading.
  if (math.length === 0 && !text.includes('\n')) {
    if (level > 0 && text.length <= STYLED_HEADING_MAX_LENGTH) {
      // Word's own heading style is a declaration, not a guess — trust it even
      // when the text reads like prose. "2. Introduction" ends its number with
      // a full stop and a real paper title runs well past a sentence, and both
      // used to be demoted to body text, taking every section under them with
      // it.
      finalLevel = Math.min(level, 3);
      headingSource = 'style';
    } else if (!isProseLike(text)) {
      if (detectedLevel > 0) {
        finalLevel = detectedLevel;
        headingSource = 'semantic';
      } else if (
        isDirectlyBold(paragraphXml) &&
        text.length <= 100 &&
        !looksLikeAuthorList(text)
      ) {
        finalLevel = 3;
        headingSource = 'bold';
      }
    }
  }
  const renderedText =
    finalLevel > 0 ? `\n${'#'.repeat(finalLevel)} ${text}\n` : text;

  return [
    {
      kind: 'paragraph',
      markdown: [renderedText, ...math, ...images]
        .filter((part) => part.trim().length > 0)
        .join('\n\n'),
      ...provenance,
      ...anchoredComments,
      ...(finalLevel > 0 && headingSource !== undefined
        ? { sourceHeadingLevel: finalLevel, headingSource }
        : {}),
    },
    ...trailingBlocks,
  ];
};

// Word expresses merges as `w:gridSpan` (horizontal) and `w:vMerge`
// (vertical). Dropping them is what made a header like "Percent of Data
// Censored" land over a single column instead of the three it covers, so each
// covered slot becomes the continuation marker the grid model reads back.
const wordCellProperties = (
  cellXml: string,
): { gridSpan: number; verticalMergeContinues: boolean } => {
  const properties = /<w:tcPr\b[\s\S]*?<\/w:tcPr>/.exec(cellXml)?.[0] ?? '';
  const gridSpan = Number(
    /<w:gridSpan\b[^>]*w:val="(\d+)"/.exec(properties)?.[1] ?? '1',
  );
  const verticalMerge = /<w:vMerge\b[^>]*\/?>/.exec(properties)?.[0];
  return {
    gridSpan: Number.isFinite(gridSpan) && gridSpan > 0 ? gridSpan : 1,
    // `<w:vMerge/>` with no value, or `w:val="continue"`, continues the cell
    // above; only `w:val="restart"` opens a new one.
    verticalMergeContinues:
      verticalMerge !== undefined && !/w:val="restart"/.test(verticalMerge),
  };
};

const wordTableToMarkdown = (tableXml: string): string => {
  const rowMatches = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
  const rows = rowMatches.map((rowMatch) =>
    [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].flatMap(
      (cellMatch) => {
        const { gridSpan, verticalMergeContinues } = wordCellProperties(
          cellMatch[0],
        );
        const text = wordRunsText(cellMatch[0]).replace(/\s+/g, ' ').trim();
        const anchor = verticalMergeContinues
          ? TABLE_SPAN_UP_MARKER
          : escapeManuscriptTableCellSpanMarker(text);
        return [
          anchor,
          ...Array.from({ length: gridSpan - 1 }, () => TABLE_SPAN_LEFT_MARKER),
        ];
      },
    ),
  );
  const grid = rows.filter((cells) => cells.length > 0);
  if (grid.length === 0) return '';
  // A one-cell table is a boxed note ("Working-draft status: …"), not data.
  // Left as a table it became a captionless one-cell `Table 1` that renumbered
  // every real table after it.
  if (grid.length === 1 && grid[0].length === 1) {
    const text = grid[0][0].trim();
    if (text.length > 0) return `\n${text}\n`;
  }
  // Word marks repeated header rows with `w:tblHeader`; a leading run of them
  // is the table's header deck.
  const headerFlags = rowMatches
    .filter((rowMatch) => rowMatch[0].includes('<w:tc'))
    .map((rowMatch) =>
      /<w:trPr\b[\s\S]*?<\/w:trPr>/.test(rowMatch[0])
        ? /<w:tblHeader\b/.test(rowMatch[0])
        : false,
    );
  const declaredHeaderRows = headerFlags.findIndex((isHeader) => !isHeader);
  const declared =
    declaredHeaderRows > 0
      ? declaredHeaderRows
      : declaredHeaderRows === -1 && headerFlags.length > 0
        ? headerFlags.length
        : 1;
  // Most authors never switch on Word's "repeat header row", so a two-deck
  // header usually declares nothing. A horizontally merged cell in the top row
  // is the giveaway — it exists to caption the columns underneath it — so that
  // row and the one below it are the deck. Adjustable in the table editor.
  const topRowSpans =
    grid.length > 1 && grid[0].includes(TABLE_SPAN_LEFT_MARKER);
  const headerRows = Math.min(
    Math.max(declared, topRowSpans ? 2 : 1),
    Math.max(1, grid.length - 1),
  );
  return `\n${gridToMarkdownTable(grid, headerRows)}\n`;
};

const findMatchingTableEnd = (body: string, start: number): number => {
  const tableTag = /<\/?w:tbl\b[^>]*>/g;
  tableTag.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tableTag.exec(body)) !== null) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return tableTag.lastIndex;
    } else {
      depth += 1;
    }
  }
  return body.length;
};

// Regex-only `<w:tbl>…</w:tbl>` matching stops at the first nested table end.
// Word uses nested tables for some layout-heavy scientific tables, so scan the
// body in document order and balance table tags before emitting a token.
const tokenizeWordBody = (body: string): string[] => {
  const tokens: string[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const tableStartMatch = /<w:tbl\b/g;
    tableStartMatch.lastIndex = cursor;
    const paragraphStartMatch = /<w:p\b/g;
    paragraphStartMatch.lastIndex = cursor;
    const tableStart = tableStartMatch.exec(body)?.index ?? -1;
    const paragraphStart = paragraphStartMatch.exec(body)?.index ?? -1;
    if (tableStart < 0 && paragraphStart < 0) break;

    if (
      tableStart >= 0 &&
      (paragraphStart < 0 || tableStart < paragraphStart)
    ) {
      const end = findMatchingTableEnd(body, tableStart);
      tokens.push(body.slice(tableStart, end));
      cursor = end;
      continue;
    }

    const openingTagEnd = body.indexOf('>', paragraphStart);
    if (
      openingTagEnd >= 0 &&
      body.slice(paragraphStart, openingTagEnd + 1).endsWith('/>')
    ) {
      tokens.push(body.slice(paragraphStart, openingTagEnd + 1));
      cursor = openingTagEnd + 1;
      continue;
    }

    const paragraphEnd = body.indexOf('</w:p>', paragraphStart);
    if (paragraphEnd < 0) break;
    const end = paragraphEnd + '</w:p>'.length;
    tokens.push(body.slice(paragraphStart, end));
    cursor = end;
  }

  return tokens;
};

const injectAbstractHeading = (
  blocks: WordMarkdownBlock[],
): WordMarkdownBlock[] => {
  if (blocks.some((block) => /^\s*#{1,6}\s+Abstract\b/i.test(block.markdown))) {
    return blocks;
  }
  const keywordsIndex = blocks.findIndex((block) =>
    /^\s*## Keywords\b/.test(block.markdown),
  );
  if (keywordsIndex < 0) return blocks;

  for (let index = keywordsIndex - 1; index >= 0; index -= 1) {
    const candidate = blocks[index].markdown.trim();
    if (candidate.startsWith('#')) continue;
    if (countWords(candidate) < 50) continue;
    return [
      ...blocks.slice(0, index),
      {
        kind: 'synthetic',
        markdown: '## Abstract',
        sourceHeadingLevel: 2,
        headingSource: 'semantic',
      },
      blocks[index],
      ...blocks.slice(index + 1),
    ];
  }
  return blocks;
};

const blockHeadingTexts = (block: WordMarkdownBlock): string[] =>
  block.markdown
    .split('\n')
    .map((line) => HEADING_RE.exec(line.trim())?.[2])
    .filter((heading): heading is string => heading !== undefined);

const AUTHOR_CONTRIBUTIONS_PROSE = /^all authors contributed\b/i;

// The "All authors contributed…" statement usually arrives unlabelled, but many
// journals' templates *do* carry a real heading. Synthesising one regardless
// produced a duplicate, empty "Author contributions" section.
const injectAuthorContributionsHeading = (
  blocks: WordMarkdownBlock[],
): WordMarkdownBlock[] => {
  const proseIndex = blocks.findIndex((block) =>
    AUTHOR_CONTRIBUTIONS_PROSE.test(block.markdown.trim()),
  );
  if (proseIndex < 0) return blocks;
  const hasRealHeading = blocks.some((block) =>
    blockHeadingTexts(block).some(
      (heading) =>
        classifyHeading(heading).sectionType === 'AUTHOR_CONTRIBUTIONS',
    ),
  );
  if (hasRealHeading) return blocks;

  return [
    ...blocks.slice(0, proseIndex),
    {
      kind: 'synthetic',
      markdown: '## Author contributions',
      sourceHeadingLevel: 2,
      headingSource: 'semantic',
    },
    ...blocks.slice(proseIndex),
  ];
};

const removeDuplicateTitleBlocks = (
  blocks: WordMarkdownBlock[],
): WordMarkdownBlock[] => {
  const normalizedBlockText = (block: WordMarkdownBlock): string =>
    block.markdown
      .trim()
      .replace(/^#{1,6}\s+/, '')
      .trim();
  const firstTitle = blocks
    .map(normalizedBlockText)
    .find((candidate) => candidate.length > 0);
  if (firstTitle === undefined) return blocks;

  let keptFirst = false;
  return blocks.filter((block) => {
    if (normalizedBlockText(block) !== firstTitle) return true;
    if (!keptFirst) {
      keptFirst = true;
      return true;
    }
    return false;
  });
};

// The title block of a journal manuscript is a stack of centred, bold lines —
// the title continuation, a subtitle, the author list — that Word never styles
// as headings. Our own bold/semantic guesses turn each of them into a section
// whose body then swallows the affiliation and the correspondence line. Once a
// document proves it uses real heading styles, treat every *guessed* heading
// before its first recognisable section (Abstract, Keywords, Introduction…) as
// title-page furniture instead.
const demoteLeadingTitleBlockHeadings = (
  blocks: WordMarkdownBlock[],
): WordMarkdownBlock[] => {
  if (!blocks.some((block) => block.headingSource === 'style')) return blocks;
  const boundary = blocks.findIndex(
    (block) =>
      block.sourceHeadingLevel !== undefined &&
      classifyHeading(
        block.markdown.replace(/^\s*#{1,6}\s*/, '').split('\n')[0],
      ).sectionType !== 'OTHER',
  );
  if (boundary < 0) return blocks;

  return blocks.map((block, index) => {
    if (
      index >= boundary ||
      block.headingSource === undefined ||
      block.headingSource === 'style'
    ) {
      return block;
    }
    const {
      sourceHeadingLevel: _level,
      headingSource: _source,
      ...rest
    } = block;
    return {
      ...rest,
      markdown: block.markdown.replace(/^\s*#{1,6}\s+/, '').trimEnd(),
    };
  });
};

const TITLE_STYLE = /\b(?:title|subtitle)\b/i;

// "Keywords:" and a bare abstract paragraph get headings we invent, at a level
// we picked. Anchor them to the document's own top heading level so the
// imported outline matches the paper instead of nesting the front matter one
// step deeper than everything else.
const alignSyntheticFrontMatterHeadings = (
  blocks: WordMarkdownBlock[],
): WordMarkdownBlock[] => {
  const styledLevels = blocks
    .filter(
      (block) =>
        block.headingSource === 'style' &&
        // The "Title" style names the document, not its first section, so it
        // is not the level the sections sit at.
        !TITLE_STYLE.test(`${block.styleId ?? ''} ${block.styleName ?? ''}`),
    )
    .map((block) => block.sourceHeadingLevel ?? 1);
  if (styledLevels.length === 0) return blocks;
  const topLevel = Math.min(...styledLevels);

  return blocks.map((block) => {
    if (
      block.headingSource !== 'semantic' ||
      block.sourceHeadingLevel === undefined ||
      block.sourceHeadingLevel === topLevel ||
      !/^\s*#{1,6}\s+(keywords|abstract)\s*$/i.test(
        block.markdown.split('\n\n')[0] ?? '',
      )
    ) {
      return block;
    }
    return {
      ...block,
      sourceHeadingLevel: topLevel,
      markdown: block.markdown.replace(
        /^(\s*)#{1,6}(\s+)/,
        `$1${'#'.repeat(topLevel)}$2`,
      ),
    };
  });
};

export const parseWordMlToMarkdownBlocks = (
  documentXml: string,
  options: WordImportOptions = {},
): WordMarkdownBlock[] => {
  // Resolve revisions before anything reads a run: every downstream pass —
  // headings, tables, math, images — then sees one settled document rather than
  // a mix of both versions.
  const body = resolveWordTrackedChanges(
    /<w:body\b[\s\S]*?<\/w:body>/.exec(documentXml)?.[0] ?? documentXml,
    options.trackedChanges ?? 'ACCEPT',
  );
  const tokens = tokenizeWordBody(body);
  const out: WordMarkdownBlock[] = [];
  for (const token of tokens) {
    if (!token.startsWith('<w:tbl')) {
      out.push(...wordParagraphToMarkdown(token, options));
      continue;
    }
    const commentIds = anchoredCommentIds(token);
    out.push({
      kind: 'table',
      markdown: wordTableToMarkdown(token),
      ...(commentIds.length > 0 ? { commentIds } : {}),
    });
  }
  return alignSyntheticFrontMatterHeadings(
    demoteLeadingTitleBlockHeadings(
      injectAuthorContributionsHeading(
        injectAbstractHeading(removeDuplicateTitleBlocks(out)),
      ),
    ),
  );
};

export const serializeWordMarkdownBlocks = (
  blocks: WordMarkdownBlock[],
): string =>
  blocks
    .map((block) => block.markdown)
    .join('\n')
    .replace(/^#{1,6}\s*$/gm, '')
    .replace(
      /^Figure 1\. Type your caption here\. Obtain permission and include the acknowledgement required by the copyright holder if a figure is being reproduced from another source\.?$/gim,
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const parseWordMlToMarkdown = (
  documentXml: string,
  options: WordImportOptions = {},
): string =>
  serializeWordMarkdownBlocks(
    parseWordMlToMarkdownBlocks(documentXml, options),
  );

export type WordRevisions = {
  summary: WordRevisionSummary;
  resolution: TrackedChangeResolution;
  comments: ImportedCommentAnchor[];
};

// What a .docx has to answer for: the counts as its source wrote them, and its
// comments quoted against the text the chosen resolution keeps. Null when the
// document answers for nothing — never edited with track changes on and never
// commented — which is every clean manuscript. Every reader of a .docx package
// goes through here, so the two import entry points cannot drift apart.
export const readWordRevisions = (
  documentXml: string,
  commentsXml: string,
  resolution: TrackedChangeResolution,
  // The blocks the caller already parsed, when it has them. A caller that has
  // none — reading the two revision entries out of a package without inflating
  // its media — has them parsed here, but only once the summary says there is
  // something to anchor.
  parsedBlocks?: WordMarkdownBlock[],
): WordRevisions | null => {
  const summary = summarizeWordRevisions(documentXml, commentsXml);
  if (!hasWordRevisions(summary)) return null;

  return {
    summary,
    resolution,
    comments: parseWordCommentAnchors(
      resolveWordTrackedChanges(documentXml, resolution),
      commentsXml,
      parsedBlocks ??
        parseWordMlToMarkdownBlocks(documentXml, {
          trackedChanges: resolution,
        }),
    ),
  };
};

// ── Title-page metadata ────────────────────────────────────────────────────
// A thesis title page is a stack of one-line fragments ("by", the student
// number, the degree statement, the date). Word styles each of them like a
// heading, so every line used to become its own empty junk section. They are
// manuscript metadata: the author line, the affiliations and — for everything
// else — the ordered `titlePageExtraLines` the composer renders verbatim.

const TITLE_PAGE_CONNECTOR =
  /^(?:by|submitted by|presented by|prepared by|authors?)\s*[:.]?$/i;
const AFFILIATION_LINE =
  /universit|institut|department|faculty|college|school of|laborator|centre|center|hospital|academy|\bdivision of\b/i;
const DEGREE_STATEMENT =
  /thesis|dissertation|in partial fulfil|requirements for the degree|degree of\b/i;
const CORRESPONDING_LINE = /^\*?(?:corresponding author|correspondence)\s*:/i;
const EMAIL_ADDRESS = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const isAuthorCandidate = (line: string, hasConnector: boolean): boolean =>
  line.length <= 200 &&
  !TITLE_PAGE_CONNECTOR.test(line) &&
  !DEGREE_STATEMENT.test(line) &&
  !AFFILIATION_LINE.test(line) &&
  !CORRESPONDING_LINE.test(line) &&
  !/^\d/.test(line) &&
  // A thesis cover names its author on the line after "by", so anything there
  // is the author. A journal title block has no connector, and the line under
  // the title is just as often the rest of the title — take it only when it
  // reads like a list of people.
  (hasConnector || looksLikeAuthorList(line));

type TitlePageMetadata = {
  sections: ImportedSectionDraft[];
  authorLine?: string;
  affiliations?: string;
  correspondingAuthor?: string;
  titlePageExtraLines?: string[];
  // The rest of the title, split by how the source wrote it: lines the title's
  // own paragraph wrapped onto, and the subtitle paragraphs that follow it.
  wrappedTitleLines?: string[];
  subtitleLines?: string[];
};

const extractTitlePageMetadata = (
  allSections: ImportedSectionDraft[],
  // How many of the title-page lines are the *title's own* wrapped lines. A
  // journal title block sets the title over two lines of one paragraph and its
  // subtitle in the next paragraph: the wrapped lines rejoin with a space, the
  // subtitle with the colon that separates a title from its subtitle.
  wrappedTitleLineCount = 0,
): TitlePageMetadata => {
  const titlePageIndex = allSections.findIndex(
    (section) => section.sectionType === 'TITLE_PAGE',
  );
  // Word styles each title-page fragment like a heading, so the leading run of
  // short untyped sections is title-page furniture, not content. Fold it away —
  // but only a *contiguous* run that still has real structure after it, so a
  // short leading section of a document that never reaches an abstract survives.
  const foldedIndexes = new Set<number>();
  let foldEnd = titlePageIndex + 1;
  for (let index = foldEnd; index < allSections.length; index += 1) {
    const section = allSections[index];
    if (section.sectionType !== 'OTHER' || section.wordCount > 12) break;
    foldedIndexes.add(index);
    foldEnd = index + 1;
  }
  if (
    !allSections
      .slice(foldEnd)
      .some((section) => STRUCTURAL_SECTION_TYPES.has(section.sectionType))
  ) {
    foldedIndexes.clear();
  }

  const contentLines = (section: ImportedSectionDraft | undefined): string[] =>
    (section?.content ?? '')
      .split('\n')
      .map((line) => line.replace(/^#{1,6}\s+/, '').trim())
      .filter((line) => line.length > 0);

  const lines = [
    ...contentLines(allSections[titlePageIndex]),
    ...[...foldedIndexes].flatMap((index) => [
      allSections[index].name,
      ...contentLines(allSections[index]),
    ]),
  ];

  const sections = allSections
    .filter((_section, index) => !foldedIndexes.has(index))
    .map((section, orderIndex) => ({ ...section, orderIndex }));
  if (lines.length === 0) return { sections };

  const connectorIndex = lines.findIndex((line) =>
    TITLE_PAGE_CONNECTOR.test(line),
  );
  const authorIndex = lines.findIndex(
    (line, index) =>
      index > connectorIndex && isAuthorCandidate(line, connectorIndex >= 0),
  );
  const authorLine = authorIndex >= 0 ? lines[authorIndex] : undefined;
  // Journals print "Correspondence: …"; plenty of drafts just put the author's
  // name and address on their own line under the affiliation.
  const explicitCorrespondingIndex = lines.findIndex((line) =>
    CORRESPONDING_LINE.test(line),
  );
  const correspondingIndex =
    explicitCorrespondingIndex >= 0
      ? explicitCorrespondingIndex
      : lines.findIndex(
          (line, index) =>
            index > authorIndex &&
            EMAIL_ADDRESS.test(line) &&
            !AFFILIATION_LINE.test(line),
        );
  const correspondingAuthor =
    correspondingIndex >= 0
      ? lines[correspondingIndex].replace(/^\*|\*$/g, '').trim()
      : undefined;
  const affiliationIndexes = new Set(
    lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line, index }) =>
          index > authorIndex &&
          index !== correspondingIndex &&
          AFFILIATION_LINE.test(line) &&
          !DEGREE_STATEMENT.test(line),
      )
      .map(({ index }) => index),
  );
  const affiliationLines = lines.filter((_line, index) =>
    affiliationIndexes.has(index),
  );
  // Everything above the author line (or above a thesis "by" connector) is
  // still the title; everything below it is furniture.
  const titleEnd = connectorIndex >= 0 ? connectorIndex : authorIndex;
  const isTitleContinuation = (index: number): boolean =>
    titleEnd > 0 &&
    index < titleEnd &&
    index !== correspondingIndex &&
    !affiliationIndexes.has(index) &&
    !DEGREE_STATEMENT.test(lines[index]);
  const titleContinuationLines = lines.filter((_line, index) =>
    isTitleContinuation(index),
  );
  const wrappedTitleLines = titleContinuationLines.slice(
    0,
    wrappedTitleLineCount,
  );
  const subtitleLines = titleContinuationLines.slice(wrappedTitleLineCount);
  const extraLines = lines.filter(
    (_line, index) =>
      index !== authorIndex &&
      index !== correspondingIndex &&
      !affiliationIndexes.has(index) &&
      !isTitleContinuation(index),
  );

  return {
    sections,
    ...(authorLine !== undefined ? { authorLine } : {}),
    ...(affiliationLines.length > 0
      ? { affiliations: affiliationLines.join('\n') }
      : {}),
    ...(correspondingAuthor !== undefined ? { correspondingAuthor } : {}),
    ...(extraLines.length > 0 ? { titlePageExtraLines: extraLines } : {}),
    ...(wrappedTitleLines.length > 0 ? { wrappedTitleLines } : {}),
    ...(subtitleLines.length > 0 ? { subtitleLines } : {}),
  };
};

// The title's own paragraph may wrap onto further lines; every line after it
// belongs to a later paragraph, which is what makes it a subtitle rather than
// more of the title. Count the breaks in the source paragraph itself: by the
// time the text is blocks, a line break and a paragraph break look alike.
const wrappedTitleLineCount = (documentXml: string): number => {
  const body =
    /<w:body\b[\s\S]*?<\/w:body>/.exec(documentXml)?.[0] ?? documentXml;
  for (const token of tokenizeWordBody(body)) {
    if (token.startsWith('<w:tbl')) return 0;
    if (!/<w:t\b[^>]*>[^<]*\S/.test(token)) continue;
    return (token.match(/<w:br\b[^>]*\/?>/g) ?? []).length;
  }
  return 0;
};

export const parseWordDocumentFromBlocks = (
  documentXml: string,
  blocks: WordMarkdownBlock[],
  options: WordImportOptions = {},
): ImportedDocument => {
  const resolution = options.trackedChanges ?? 'ACCEPT';
  // Counted on the source as it arrived; every count below it is counted on the
  // document the author actually gets, so a deleted table stops being "Table 3"
  // the moment its deletion is accepted.
  const revisions = readWordRevisions(
    documentXml,
    options.commentsXml ?? '',
    resolution,
    blocks,
  );
  const resolvedXml = resolveWordTrackedChanges(documentXml, resolution);
  const markdown = serializeWordMarkdownBlocks(blocks);
  const document = parseMarkdownDocument(markdown);
  const equationCount = (resolvedXml.match(/<m:oMath\b/g) ?? []).length;
  const embeddedImageCount = (
    markdown.match(/!\[[^\]]*\]\(data:image\//g) ?? []
  ).length;
  const tableCount = (resolvedXml.match(/<w:tbl\b/g) ?? []).length;
  const warnings: string[] =
    revisions === null
      ? []
      : wordRevisionWarnings(revisions.summary, resolution);

  if (document.sections.length <= 1) {
    warnings.push(
      'Few semantic sections were detected. Review the section names and types before importing.',
    );
  }
  if (embeddedImageCount === 0 && /<w:drawing\b/.test(resolvedXml)) {
    warnings.push(
      'The document contains images that could not be resolved from the DOCX package.',
    );
  }

  const { sections, wrappedTitleLines, subtitleLines, ...titlePageMetadata } =
    extractTitlePageMetadata(
      document.sections,
      wrappedTitleLineCount(resolvedXml),
    );
  const title =
    document.title === undefined
      ? undefined
      : [
          [document.title, ...(wrappedTitleLines ?? [])].join(' '),
          ...(subtitleLines ?? []),
        ].join(': ');

  return {
    ...document,
    ...(title !== undefined ? { title } : {}),
    // Comments are attached last: the title-page pass folds sections away, and
    // a comment must land in a section that still exists.
    sections: attachImportedComments(sections, revisions?.comments ?? []),
    ...titlePageMetadata,
    warnings,
    stats: { equationCount, embeddedImageCount, tableCount },
    ...(revisions === null ? {} : { revisionSummary: revisions.summary }),
  };
};

export const parseWordDocument = (
  documentXml: string,
  options: WordImportOptions = {},
): ImportedDocument =>
  parseWordDocumentFromBlocks(
    documentXml,
    parseWordMlToMarkdownBlocks(documentXml, options),
    options,
  );

// ── Lift standalone tables into numbered figure records ─────────────────────
// An imported GFM table sitting in a section body is data, not prose. This pulls
// each one out into a `figure` (TABLE) draft and leaves an exact-position
// `[[asset:refKey]]` marker in its place, so it renders once at the source
// location instead of being appended to the end of the section.

const TABLE_SEPARATOR = /^\|?[\s:|-]+\|?$/;
const isTableLine = (line: string): boolean => line.trim().includes('|');

export type ImportedAssetCaption = {
  caption: string;
  sourceLabel?: string;
  explicitLabel: boolean;
};

export const parseImportedAssetCaption = (
  line: string,
  kind: 'FIGURE' | 'TABLE',
): ImportedAssetCaption | null => {
  const prefix = kind === 'FIGURE' ? '(?:fig(?:ure)?)' : '(?:table|tbl)';
  // The label may carry an appendix letter ("Table B1", "Fig. A2") or the
  // supplement's "S" — both are part of the number, not of the caption text.
  const match = new RegExp(
    `^\\s*${prefix}\\s*\\.?\\s*(?:((?:[A-Za-z])?\\d+(?:\\.\\d+)*(?:[a-z])?)\\s*([.:)])?\\s*)?(.*)$`,
    'i',
  ).exec(line);
  if (match === null) return null;
  let sourceLabel = match[1]?.replace(/^[a-z]/, (letter) =>
    letter.toUpperCase(),
  );
  let explicitLabel = match[2] !== undefined;
  let caption = match[3].trim();
  const embeddedSourceLabel =
    /^(?:fig(?:ure)?|table|tbl)?\s*\.?\s*(S?\d+(?:\.\d+)+)(?:([.:)])\s*|\s+)(.*)$/i.exec(
      caption,
    );
  if (embeddedSourceLabel !== null) {
    sourceLabel = embeddedSourceLabel[1].replace(/^s/i, 'S');
    explicitLabel = embeddedSourceLabel[2] !== undefined;
    caption = embeddedSourceLabel[3].trim();
  }
  return {
    caption,
    explicitLabel,
    ...(sourceLabel !== undefined ? { sourceLabel } : {}),
  };
};

const importedAssetRefKey = (
  kind: 'FIGURE' | 'TABLE',
  sourceLabel: string | undefined,
  order: number,
): string =>
  sourceLabel === undefined
    ? `imported-${kind.toLowerCase()}-${order}`
    : `imported-${kind.toLowerCase()}-${sourceLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}`;

// ── Layout tables: numbered equations and single-cell callouts ─────────────
// Word has no display-equation object, so Copernicus/AMT (and every template
// derived from theirs) sets an equation in a one-row, two-column borderless
// table: the equation on the left, "(3)" on the right. Elsevier and Springer
// drafts do the same. Imported as data, each one became a junk `Table` that
// renumbered the paper's real tables and printed a bordered grid around the
// maths. They are equations — the composer already numbers, cross-references
// and typesets `EQUATION` assets — and a one-cell table is a callout, which is
// prose.

const EQUATION_NUMBER_CELL = /^\(\s*([A-Za-z]?\d+(?:\.\d+)?[a-z]?)\s*\)$/;
// An equation body needs a relation or an operator; a stray two-column table of
// prose must not be swallowed.
const EQUATION_BODY = /[=<>≤≥≈∝∑∫±]|\\frac|\\sum|\\int/;

const equationRefKey = (label: string): string =>
  `eq-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export type LayoutTableRewrite =
  // `source` is the equation exactly as the document showed it, for a review
  // list that should read like the author's own page; `latex` is what gets
  // stored and typeset.
  | { kind: 'equation'; latex: string; source: string; label: string }
  | { kind: 'callout'; text: string };

// Decide what a table block really is, from its parsed grid. Exported so the
// import map shows the same answer the import will act on: a numbered equation
// reads as an equation in the review list, not as a table.
export const classifyLayoutTable = (
  block: string[],
): LayoutTableRewrite | null => {
  const rows = parseMarkdownTable(block.join('\n'));
  if (rows.length !== 1) return null;
  const cells = rows[0].map((cell) => cell.trim());

  if (cells.length === 1) {
    const text = cells[0];
    return text.length === 0 || text.includes('|')
      ? null
      : { kind: 'callout', text };
  }

  if (cells.length !== 2) return null;
  const [body, number] = cells;
  const label = EQUATION_NUMBER_CELL.exec(number)?.[1];
  if (label === undefined || body.length === 0 || !EQUATION_BODY.test(body)) {
    return null;
  }
  // Word flattened the maths to characters; recover the LaTeX the renderers
  // expect so the equation typesets instead of printing as text.
  return {
    kind: 'equation',
    latex: unicodeMathToLatex(body),
    source: body,
    label,
  };
};

// The quantity an equation defines — what a scientist would call it. "x̄j,time
// = Σi wij xi / Σi wij" is *the duration-weighted mean*, so the asset list can
// say that instead of numbering it and nothing more.
const definedQuantity = (source: string): string | undefined => {
  const relation = /^([^=<>≤≥≈]{1,40})=(?!=)/.exec(source);
  const quantity = relation?.[1]?.trim().replace(/[,;:]$/, '');
  return quantity !== undefined && quantity.length > 0 ? quantity : undefined;
};

// Rewrite layout tables in place: equations become `EQUATION` assets anchored
// where they stood, callouts fall back to the prose they always were.
export const extractLayoutTables = (
  sections: ImportedSectionDraft[],
  startOrderIndex = 0,
  usedRefKeys: Set<string> = new Set<string>(),
): { sections: ImportedSectionDraft[]; figures: ImportedFigureDraft[] } => {
  const figures: ImportedFigureDraft[] = [];
  let order = startOrderIndex;

  const nextSections = sections.map((section) => {
    const lines = section.content.split('\n');
    const out: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!isTableLine(lines[index])) {
        out.push(lines[index]);
        continue;
      }
      let end = index;
      while (end < lines.length && isTableLine(lines[end])) end += 1;
      const block = lines.slice(index, end);
      const rewrite = classifyLayoutTable(block);
      if (rewrite === null) {
        out.push(...block);
        index = end - 1;
        continue;
      }
      if (rewrite.kind === 'callout') {
        out.push(rewrite.text);
        index = end - 1;
        continue;
      }

      const refKeyBase = equationRefKey(rewrite.label);
      let refKey = refKeyBase;
      let duplicateIndex = 2;
      while (usedRefKeys.has(refKey)) {
        refKey = `${refKeyBase}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedRefKeys.add(refKey);
      const quantity = definedQuantity(rewrite.source);
      figures.push({
        name:
          quantity === undefined
            ? `Equation (${rewrite.label})`
            : `${quantity} — equation (${rewrite.label})`,
        assetKind: 'EQUATION',
        placement: section.placement === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'MAIN',
        refKey,
        caption: '',
        sourceLabel: rewrite.label,
        sectionOrderIndex: section.orderIndex,
        equationLatex: rewrite.latex,
        imageSource: 'NONE',
        orderIndex: order,
      });
      order += 1;
      out.push(assetPlacementMarker(refKey));
      index = end - 1;
    }
    const content = out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { ...section, content, wordCount: countWords(content) };
  });

  return { sections: nextSections, figures };
};

export const extractTablesToFigures = (
  sections: ImportedSectionDraft[],
  startOrderIndex = 0,
  usedRefKeys: Set<string> = new Set<string>(),
  suppressedAssetLineSignatures: ReadonlySet<string> = new Set<string>(),
): { sections: ImportedSectionDraft[]; figures: ImportedFigureDraft[] } => {
  const figures: ImportedFigureDraft[] = [];
  let order = startOrderIndex;

  const nextSections = sections.map((section) => {
    const lines = section.content.split('\n');
    const out: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      // Find a maximal run of consecutive table lines.
      if (isTableLine(lines[index])) {
        let end = index;
        while (end < lines.length && isTableLine(lines[end])) end += 1;
        const block = lines.slice(index, end);
        const hasSeparator = block.some((line) =>
          TABLE_SEPARATOR.test(line.trim()),
        );
        if (hasSeparator && block.length >= 2) {
          // Adopt a caption from either side of the table; Word templates use
          // both conventions depending on the target journal.
          let caption = '';
          let captionInfo: ImportedAssetCaption | null = null;
          let previousIndex = out.length - 1;
          while (
            previousIndex >= 0 &&
            (out[previousIndex]?.trim() ?? '').length === 0
          ) {
            previousIndex -= 1;
          }
          const previous = out[previousIndex]?.trim() ?? '';
          const captionMatch = suppressedAssetLineSignatures.has(previous)
            ? null
            : parseImportedAssetCaption(previous, 'TABLE');
          let captionIndex = end;
          while (
            captionIndex < lines.length &&
            lines[captionIndex].trim().length === 0
          ) {
            captionIndex += 1;
          }
          const following = lines[captionIndex]?.trim() ?? '';
          const followingMatch = suppressedAssetLineSignatures.has(following)
            ? null
            : parseImportedAssetCaption(following, 'TABLE');
          const preferFollowing =
            followingMatch !== null &&
            followingMatch.explicitLabel &&
            captionMatch?.explicitLabel !== true;
          if (captionMatch !== null && !preferFollowing) {
            captionInfo = captionMatch;
            caption = captionMatch.caption;
            out.splice(previousIndex);
          } else if (followingMatch !== null) {
            captionInfo = followingMatch;
            caption = followingMatch.caption;
            end = captionIndex + 1;
          }
          order += 1;
          const sourceLabel = captionInfo?.sourceLabel;
          const refKeyBase = importedAssetRefKey('TABLE', sourceLabel, order);
          let refKey = refKeyBase;
          let duplicateIndex = 2;
          while (usedRefKeys.has(refKey)) {
            refKey = `${refKeyBase}-${duplicateIndex}`;
            duplicateIndex += 1;
          }
          usedRefKeys.add(refKey);
          const supplement =
            section.placement === 'SUPPLEMENT' || /^S/i.test(sourceLabel ?? '');
          figures.push({
            name: caption || `Imported table ${order}`,
            assetKind: 'TABLE',
            placement: supplement ? 'SUPPLEMENT' : 'MAIN',
            refKey,
            caption,
            ...(sourceLabel !== undefined ? { sourceLabel } : {}),
            sectionOrderIndex: section.orderIndex,
            tableData: block.join('\n').trim(),
            imageSource: 'NONE',
            orderIndex: order - 1,
          });
          out.push(assetPlacementMarker(refKey));
          index = end - 1;
          continue;
        }
      }
      out.push(lines[index]);
    }
    return {
      ...section,
      content: out
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    };
  });

  return { sections: nextSections, figures };
};

// ── Lift embedded DOCX images into numbered figure records ─────────────────

const IMAGE_LINE = /^!\[([^\]]*)\]\((data:image\/[^)]+)\)$/i;
export const extractImagesToFigures = (
  sections: ImportedSectionDraft[],
  startOrderIndex = 0,
  usedRefKeys: Set<string> = new Set<string>(),
  suppressedAssetLineSignatures: ReadonlySet<string> = new Set<string>(),
): { sections: ImportedSectionDraft[]; figures: ImportedFigureDraft[] } => {
  const figures: ImportedFigureDraft[] = [];
  let order = startOrderIndex;

  const nextSections = sections.map((section) => {
    const lines = section.content.split('\n');
    const out: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const imageMatch = IMAGE_LINE.exec(lines[index].trim());
      if (imageMatch === null) {
        out.push(lines[index]);
        continue;
      }

      let caption = '';
      let captionInfo: ImportedAssetCaption | null = null;
      let previousCaptionIndex = out.length - 1;
      while (
        previousCaptionIndex >= 0 &&
        (out[previousCaptionIndex]?.trim() ?? '').length === 0
      ) {
        previousCaptionIndex -= 1;
      }
      const previousLine = out[previousCaptionIndex]?.trim() ?? '';
      const previousCaption = suppressedAssetLineSignatures.has(previousLine)
        ? null
        : parseImportedAssetCaption(previousLine, 'FIGURE');
      let nextCaptionIndex = index + 1;
      while (
        nextCaptionIndex < lines.length &&
        (lines[nextCaptionIndex]?.trim() ?? '').length === 0
      ) {
        nextCaptionIndex += 1;
      }
      const nextLine = lines[nextCaptionIndex]?.trim() ?? '';
      const nextCaption = suppressedAssetLineSignatures.has(nextLine)
        ? null
        : parseImportedAssetCaption(nextLine, 'FIGURE');
      const preferNext =
        nextCaption !== null &&
        nextCaption.explicitLabel &&
        previousCaption?.explicitLabel !== true;
      if (previousCaption !== null && !preferNext) {
        captionInfo = previousCaption;
        caption = previousCaption.caption;
        out.splice(previousCaptionIndex);
      } else if (nextCaption !== null) {
        captionInfo = nextCaption;
        caption = nextCaption.caption;
        index = nextCaptionIndex;
      }

      order += 1;
      const sourceLabel = captionInfo?.sourceLabel;
      const refKeyBase = importedAssetRefKey('FIGURE', sourceLabel, order);
      let refKey = refKeyBase;
      let duplicateIndex = 2;
      while (usedRefKeys.has(refKey)) {
        refKey = `${refKeyBase}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedRefKeys.add(refKey);
      const altText = imageMatch[1].trim();
      const supplement =
        section.placement === 'SUPPLEMENT' || /^S/i.test(sourceLabel ?? '');
      figures.push({
        name: caption || altText || `Imported figure ${order}`,
        assetKind: 'FIGURE',
        placement: supplement ? 'SUPPLEMENT' : 'MAIN',
        refKey,
        caption,
        ...(sourceLabel !== undefined ? { sourceLabel } : {}),
        sectionOrderIndex: section.orderIndex,
        imageSource: 'UPLOAD',
        imageUrl: imageMatch[2],
        altText,
        orderIndex: order - 1,
      });
      out.push(assetPlacementMarker(refKey));
    }

    const content = out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { ...section, content, wordCount: countWords(content) };
  });

  return { sections: nextSections, figures };
};

// A scientific draft can intentionally carry caption placeholders before the
// artwork exists. Promote explicit labels ("Figure 3. …") to real linked asset
// records so later image replacement and renumbering work without re-importing.
export const extractCaptionOnlyFigures = (
  sections: ImportedSectionDraft[],
  startOrderIndex = 0,
  usedRefKeys: Set<string> = new Set<string>(),
  suppressedAssetLineSignatures: ReadonlySet<string> = new Set<string>(),
): { sections: ImportedSectionDraft[]; figures: ImportedFigureDraft[] } => {
  const figures: ImportedFigureDraft[] = [];
  let order = startOrderIndex;

  const nextSections = sections.map((section) => {
    const out = section.content.split('\n').map((line) => {
      if (suppressedAssetLineSignatures.has(line.trim())) return line;
      const captionInfo = parseImportedAssetCaption(line.trim(), 'FIGURE');
      if (
        captionInfo === null ||
        !captionInfo.explicitLabel ||
        captionInfo.caption.length === 0
      ) {
        return line;
      }
      order += 1;
      const refKeyBase = importedAssetRefKey(
        'FIGURE',
        captionInfo.sourceLabel,
        order,
      );
      let refKey = refKeyBase;
      let duplicateIndex = 2;
      while (usedRefKeys.has(refKey)) {
        refKey = `${refKeyBase}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedRefKeys.add(refKey);
      const supplement =
        section.placement === 'SUPPLEMENT' ||
        /^S/i.test(captionInfo.sourceLabel ?? '');
      figures.push({
        name: captionInfo.caption,
        assetKind: 'FIGURE',
        placement: supplement ? 'SUPPLEMENT' : 'MAIN',
        refKey,
        caption: captionInfo.caption,
        ...(captionInfo.sourceLabel !== undefined
          ? { sourceLabel: captionInfo.sourceLabel }
          : {}),
        sectionOrderIndex: section.orderIndex,
        imageSource: 'NONE',
        orderIndex: order - 1,
      });
      return assetPlacementMarker(refKey);
    });
    const content = out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { ...section, content, wordCount: countWords(content) };
  });

  return { sections: nextSections, figures };
};

// A reference is a keyword plus a label list: "Fig. 2.6b", "Figures 8 & 9",
// "Tables 1, 3 and 5", "Figures 8–10". The list tail stays inside the match so
// every number links individually — a half-linked list ("[#…] & 9") leaves the
// unlinked number rendering the *source* number, which renumbering then makes
// wrong.
const ASSET_REFERENCE_LIST =
  /S?\d+(?:\.\d+)*[a-z]?(?:(?:\s*(?:,|&|and|–|—))+\s*S?\d+(?:\.\d+)*[a-z]?)*/i;
const IMPORTED_FIGURE_REFERENCE = new RegExp(
  `\\b(?:fig(?:ure)?s?)\\.?\\s+(${ASSET_REFERENCE_LIST.source})`,
  'gi',
);
const IMPORTED_TABLE_REFERENCE = new RegExp(
  `\\b(?:tables?|tbls?)\\.?\\s+(${ASSET_REFERENCE_LIST.source})`,
  'gi',
);
const LIST_TOKEN = /S?\d+(?:\.\d+)*[a-z]?/gi;
const LIST_TOKEN_PARTS = /^(S?\d+(?:\.\d+)*)([a-z])?$/i;
const RANGE_GAP = /^\s*[–—]\s*$/;

// Ranges only expand when every intermediate integer exists as a label — a
// gappy range ("Figures 8–12" with no 9 in the source) stays literal rather
// than inventing links.
const MAX_RANGE_EXPANSION = 20;

type AssetReferenceToken = {
  text: string;
  index: number;
  label: string;
  panel?: string;
};

const assetReferenceTokens = (listText: string): AssetReferenceToken[] => {
  LIST_TOKEN.lastIndex = 0;
  const tokens: AssetReferenceToken[] = [];
  for (
    let match = LIST_TOKEN.exec(listText);
    match !== null;
    match = LIST_TOKEN.exec(listText)
  ) {
    const parts = LIST_TOKEN_PARTS.exec(match[0]);
    if (parts === null) continue;
    tokens.push({
      text: match[0],
      index: match.index,
      label: parts[1],
      ...(parts[2] !== undefined ? { panel: parts[2] } : {}),
    });
  }
  return tokens;
};

const plainRangeValue = (token: AssetReferenceToken): number | null =>
  token.panel === undefined && /^\d+$/.test(token.label)
    ? Number.parseInt(token.label, 10)
    : null;

// Convert source-visible labels ("Fig. 2.6b", "Fig. S2.18") into stable
// asset references. The optional panel suffix remains outside the token, so a
// reordered composite figure renders as the new number plus the same panel.
// "Eq. (7)", "Eqs. (7) and (8)", "Eq. (11a)" — an equation reference wears its
// number in parentheses, so it needs its own pass rather than the shared
// `Fig./Table N` list matcher.
const IMPORTED_EQUATION_REFERENCE =
  /\b(Eqs?|Equations?)\.?\s+(\(\s*[A-Za-z]?\d+(?:\.\d+)?[a-z]?\s*\)(?:\s*(?:,|and|&|–|—|to)\s*\(\s*[A-Za-z]?\d+(?:\.\d+)?[a-z]?\s*\))*)/gi;
const EQUATION_NUMBER_TOKEN = /\(\s*([A-Za-z]?\d+(?:\.\d+)?[a-z]?)\s*\)/g;

const linkImportedEquationReferences = (
  sections: ImportedSectionDraft[],
  figures: ImportedFigureDraft[],
): { sections: ImportedSectionDraft[]; linkedCount: number } => {
  const byLabel = new Map<string, ImportedFigureDraft>();
  for (const figure of figures) {
    if (figure.assetKind !== 'EQUATION' || figure.sourceLabel === undefined) {
      continue;
    }
    const label = figure.sourceLabel.toLowerCase();
    if (!byLabel.has(label)) byLabel.set(label, figure);
  }
  if (byLabel.size === 0) return { sections, linkedCount: 0 };

  let linkedCount = 0;
  const linkedSections = sections.map((section) => {
    const content = section.content.replace(
      IMPORTED_EQUATION_REFERENCE,
      (original: string, keyword: string, list: string) => {
        EQUATION_NUMBER_TOKEN.lastIndex = 0;
        const labels = [...list.matchAll(EQUATION_NUMBER_TOKEN)].map(
          (match) => match[1],
        );
        const targets = labels.map((label) => byLabel.get(label.toLowerCase()));
        // All or nothing: a half-linked list renders one live number beside a
        // stale source number, which renumbering then makes wrong.
        if (targets.some((target) => target === undefined)) return original;
        linkedCount += targets.length;
        let cursor = 0;
        let targetIndex = 0;
        EQUATION_NUMBER_TOKEN.lastIndex = 0;
        let result = '';
        for (const match of list.matchAll(EQUATION_NUMBER_TOKEN)) {
          const index = match.index ?? 0;
          result += list.slice(cursor, index);
          result += `[#${targets[targetIndex]?.refKey ?? ''}]`;
          cursor = index + match[0].length;
          targetIndex += 1;
        }
        result += list.slice(cursor);
        // The keyword is part of the rendered label ("(7)" carries no "Eq."),
        // so it stays in the prose exactly as the author wrote it.
        return `${keyword}${original.slice(
          keyword.length,
          original.length - list.length,
        )}${result}`;
      },
    );
    return content === section.content
      ? section
      : { ...section, content, wordCount: countWords(content) };
  });

  return { sections: linkedSections, linkedCount };
};

export const linkImportedAssetReferences = (
  sections: ImportedSectionDraft[],
  figures: ImportedFigureDraft[],
): {
  sections: ImportedSectionDraft[];
  figures: ImportedFigureDraft[];
  linkedCount: number;
} => {
  const byKind = new Map<string, ImportedFigureDraft>();
  const aliasLabels = new Map<string, Set<string>>();
  for (const figure of figures) {
    if (figure.sourceLabel === undefined) continue;
    const normalizedLabel = figure.sourceLabel.toLowerCase();
    const key = `${figure.assetKind}:${normalizedLabel}`;
    if (!byKind.has(key)) byKind.set(key, figure);
    const suffix = /^s\d+\.(\d+)$/i.exec(figure.sourceLabel)?.[1];
    const mainSuffix = /^\d+\.(\d+)$/i.exec(figure.sourceLabel)?.[1];
    const alias = suffix !== undefined ? `s${suffix}` : mainSuffix;
    if (alias !== undefined) {
      const aliasKey = `${figure.assetKind}:${alias.toLowerCase()}`;
      const labels = aliasLabels.get(aliasKey) ?? new Set<string>();
      labels.add(normalizedLabel);
      aliasLabels.set(aliasKey, labels);
    }
  }
  for (const [aliasKey, labels] of aliasLabels) {
    if (labels.size !== 1 || byKind.has(aliasKey)) continue;
    const [label] = labels;
    const kind = aliasKey.slice(0, aliasKey.indexOf(':'));
    const target = byKind.get(`${kind}:${label}`);
    if (target !== undefined) byKind.set(aliasKey, target);
  }

  const linkToken = (
    kind: 'FIGURE' | 'TABLE',
    label: string,
    panel: string | undefined,
  ): string | null => {
    const fullLabel = `${label}${panel ?? ''}`.toLowerCase();
    const exact = byKind.get(`${kind}:${fullLabel}`);
    const base = byKind.get(`${kind}:${label.toLowerCase()}`);
    const target = exact ?? base;
    if (target === undefined) return null;
    return `[#${target.refKey}]${exact === undefined ? (panel ?? '') : ''}`;
  };

  let linkedCount = 0;
  const replace = (
    content: string,
    kind: 'FIGURE' | 'TABLE',
    pattern: RegExp,
  ): string =>
    content.replace(pattern, (original: string, rawList: string) => {
      const keyword = original.slice(0, original.length - rawList.length);
      const tokens = assetReferenceTokens(rawList);
      if (tokens.length === 0) return original;

      const linkedByIndex = new Map<number, string>();
      tokens.forEach((token, tokenIndex) => {
        const linked = linkToken(kind, token.label, token.panel);
        if (linked !== null) linkedByIndex.set(tokenIndex, linked);
      });

      let result = '';
      let cursor = 0;
      tokens.forEach((token, tokenIndex) => {
        const gapText = rawList.slice(cursor, token.index);
        result += gapText;
        // Expand en/em-dash ranges, but only when both endpoints linked and
        // every integer in the span resolves — otherwise the gap stays as the
        // source wrote it.
        if (tokenIndex > 0 && RANGE_GAP.test(gapText)) {
          const previous = tokens[tokenIndex - 1];
          const start = plainRangeValue(previous);
          const end = plainRangeValue(token);
          if (
            start !== null &&
            end !== null &&
            end > start &&
            end - start <= MAX_RANGE_EXPANSION &&
            linkedByIndex.has(tokenIndex - 1) &&
            linkedByIndex.has(tokenIndex)
          ) {
            const middles: string[] = [];
            let allResolve = true;
            for (let value = start + 1; value < end; value += 1) {
              const linked = linkToken(kind, String(value), undefined);
              if (linked === null) {
                allResolve = false;
                break;
              }
              middles.push(linked);
            }
            if (allResolve && middles.length > 0) {
              const dash = gapText.trim();
              result += middles.map((linked) => `${linked}${dash}`).join('');
              linkedCount += middles.length;
            }
          }
        }
        const linked = linkedByIndex.get(tokenIndex);
        if (linked !== undefined) linkedCount += 1;
        result += linked ?? token.text;
        cursor = token.index + token.text.length;
      });
      result += rawList.slice(cursor);
      // The keyword ("Fig.") is replaced by the linked token, which renders
      // the full label ("Figure 1") — keep it only when the head number
      // itself didn't resolve.
      return linkedByIndex.has(0) ? result : keyword + result;
    });

  const linkedSections = sections.map((section) => {
    const withFigures = replace(
      section.content,
      'FIGURE',
      IMPORTED_FIGURE_REFERENCE,
    );
    const content = replace(withFigures, 'TABLE', IMPORTED_TABLE_REFERENCE);
    return { ...section, content, wordCount: countWords(content) };
  });
  const withEquations = linkImportedEquationReferences(linkedSections, figures);

  return {
    sections: withEquations.sections,
    figures,
    linkedCount: linkedCount + withEquations.linkedCount,
  };
};
