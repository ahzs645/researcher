// Pure document → manuscript-structure importer. Turns a Markdown / plain-text
// document (or the WordprocessingML extracted from a .docx) into
// `manuscriptSection` drafts so an existing paper can be *brought in* instead of
// retyped — the #1 gap that kept real `.docx` / `.pdf` papers out of the
// composer. No backend, no dependencies: the binary `.docx` unzip lives in a
// thin browser module (`manuscriptDocxFile.ts`); everything here is
// string-in / structure-out and unit-tested.

import { countWords } from './manuscriptAssembly';
import { gridToMarkdownTable } from './manuscriptTables';

export type ImportedSectionDraft = {
  name: string;
  sectionType: string;
  placement: string;
  content: string;
  orderIndex: number;
  wordCount: number;
  includeInExport: boolean;
};

export type ImportedDocument = {
  title?: string;
  sections: ImportedSectionDraft[];
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
  { sectionType: 'ABSTRACT', placement: 'FRONT_MATTER', pattern: /^(abstract|summary|synopsis)\b/ },
  { sectionType: 'KEYWORDS', placement: 'FRONT_MATTER', pattern: /^(keywords|key words|index terms)\b/ },
  { sectionType: 'DATA_AVAILABILITY', placement: 'BACK_MATTER', pattern: /(data|code)\s+(and\s+code\s+)?availability|availability of data/ },
  { sectionType: 'AUTHOR_CONTRIBUTIONS', placement: 'BACK_MATTER', pattern: /author\s+contributions?|credit author/ },
  { sectionType: 'CONFLICTS', placement: 'BACK_MATTER', pattern: /conflicts?\s+of\s+interest|competing\s+interests?|declaration of (competing|interest)/ },
  { sectionType: 'ETHICS', placement: 'BACK_MATTER', pattern: /ethic(s|al)|institutional review|irb\b|consent to participate/ },
  { sectionType: 'FUNDING', placement: 'BACK_MATTER', pattern: /^funding\b|financial support|funding statement/ },
  { sectionType: 'ACKNOWLEDGMENTS', placement: 'BACK_MATTER', pattern: /acknowledge?ments?|acknowledgements?/ },
  { sectionType: 'REFERENCES', placement: 'BACK_MATTER', pattern: /^(references|bibliography|works cited|literature cited|reference list)\b/ },
  { sectionType: 'SUPPLEMENT', placement: 'SUPPLEMENT', pattern: /supplement(ary|al)?|supporting information/ },
  { sectionType: 'APPENDIX', placement: 'SUPPLEMENT', pattern: /^(appendix|appendices|annex)\b/ },
  { sectionType: 'INTRODUCTION', placement: 'MAIN', pattern: /^(introduction|intro)\b/ },
  { sectionType: 'BACKGROUND', placement: 'MAIN', pattern: /(related work|literature review|background|prior work|theoretical framework)/ },
  { sectionType: 'METHODS', placement: 'MAIN', pattern: /(methodolog|^methods?\b|materials and methods|experimental|study design|data and methods|study area|participants and|procedure)/ },
  { sectionType: 'RESULTS', placement: 'MAIN', pattern: /^(results|findings)\b|results and/ },
  { sectionType: 'DISCUSSION', placement: 'MAIN', pattern: /^discussion\b|discussion and/ },
  { sectionType: 'CONCLUSION', placement: 'MAIN', pattern: /^(conclusion|conclusions|concluding remarks|summary and conclusion)/ },
];

// Strip leading section numbering ("1.", "1.2", "IV.", "A)") and trailing
// punctuation so "2. Materials and Methods" classifies like "Methods".
const normalizeHeading = (heading: string): string =>
  heading
    .replace(/^\s*(\d+(\.\d+)*|[ivxlcdm]+|[a-z])[.):]\s+/i, '')
    .trim()
    .toLowerCase();

export const classifyHeading = (
  heading: string,
): { sectionType: string; placement: string } => {
  const normalized = normalizeHeading(heading);
  const rule = SECTION_RULES.find((candidate) => candidate.pattern.test(normalized));
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
    if (current.heading !== null || current.body.length > 0) blocks.push(current);
  };

  for (const line of lines) {
    const hashMatch = HEADING_RE.exec(line);
    const boldMatch = hashMatch === null ? BOLD_HEADING_RE.exec(line.trim()) : null;
    if (hashMatch !== null) {
      pushCurrent();
      current = { heading: hashMatch[2].trim(), level: hashMatch[1].length, body: '' };
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
): ImportedSectionDraft => {
  const { sectionType, placement } = classifyHeading(heading);
  return {
    name: heading,
    sectionType,
    placement,
    content: body,
    orderIndex,
    wordCount: countWords(body),
    includeInExport: true,
  };
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

  const first = blocks[0];
  if (first.heading === null) {
    // Opening prose with no heading: first line is the title; the remainder
    // (if any) becomes a leading untyped section.
    const [firstLine, ...rest] = first.body.split('\n');
    title = firstLine.trim() || undefined;
    const remainder = rest.join('\n').trim();
    if (remainder.length > 0) {
      first.heading = 'Body';
      first.body = remainder;
    } else {
      startIndex = 1;
    }
  } else {
    const minLevel = Math.min(...blocks.map((block) => block.level || 99));
    if (first.level === minLevel && first.body.length === 0) {
      title = first.heading;
      startIndex = 1;
    }
  }

  const sections: ImportedSectionDraft[] = [];
  for (let index = startIndex; index < blocks.length; index += 1) {
    const block = blocks[index];
    const heading = block.heading ?? 'Body';
    if (block.body.length === 0 && block.heading === null) continue;
    sections.push(draftFromBlock(heading, block.body, sections.length));
  }

  return { title, sections };
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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);

// Concatenate the text runs of a paragraph/cell, honouring tabs and line breaks.
const wordRunsText = (xml: string): string => {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>\s*<w:p\b[^>]*>/g, '\n');
  const runs = [...withBreaks.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)];
  return runs.map((match) => decodeXml(match[1])).join('');
};

const headingLevelFromStyle = (styleVal: string): number => {
  const heading = /^heading\s*([1-6])/i.exec(styleVal);
  if (heading !== null) return Number(heading[1]);
  if (/^title$/i.test(styleVal)) return 1;
  if (/^subtitle$/i.test(styleVal)) return 2;
  return 0;
};

const wordParagraphToMarkdown = (paragraphXml: string): string => {
  const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(paragraphXml);
  const level = headingLevelFromStyle(styleMatch?.[1] ?? '');
  const text = wordRunsText(paragraphXml).trim();
  if (text.length === 0) return '';
  return level > 0 ? `\n${'#'.repeat(level)} ${text}\n` : text;
};

const wordTableToMarkdown = (tableXml: string): string => {
  const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rowMatch) =>
    [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cellMatch) =>
      wordRunsText(cellMatch[0]).replace(/\s+/g, ' ').trim(),
    ),
  );
  const grid = rows.filter((cells) => cells.length > 0);
  return grid.length === 0 ? '' : `\n${gridToMarkdownTable(grid)}\n`;
};

export const parseWordMlToMarkdown = (documentXml: string): string => {
  const body = /<w:body\b[\s\S]*?<\/w:body>/.exec(documentXml)?.[0] ?? documentXml;
  // One tokenizer over the body keeps tables and paragraphs in document order.
  // Tables are matched first so a table's inner paragraphs are consumed with it
  // (Word tables do not nest in practice).
  const tokens = body.match(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  const out: string[] = [];
  for (const token of tokens) {
    out.push(
      token.startsWith('<w:tbl')
        ? wordTableToMarkdown(token)
        : wordParagraphToMarkdown(token),
    );
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

export const parseWordDocument = (documentXml: string): ImportedDocument =>
  parseMarkdownDocument(parseWordMlToMarkdown(documentXml));
