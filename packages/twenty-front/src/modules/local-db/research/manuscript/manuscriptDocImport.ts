// Pure document → manuscript-structure importer. Turns a Markdown / plain-text
// document (or the WordprocessingML extracted from a .docx) into
// `manuscriptSection` drafts so an existing paper can be *brought in* instead of
// retyped — the #1 gap that kept real `.docx` / `.pdf` papers out of the
// composer. No backend, no dependencies: the binary `.docx` unzip lives in a
// thin browser module (`manuscriptDocxFile.ts`); everything here is
// string-in / structure-out and unit-tested.

import { countWords } from './manuscriptAssembly';
import { assetPlacementMarker } from './manuscriptAssetPlacement';
import { gridToMarkdownTable } from './manuscriptTables';
import { wrapManuscriptScript } from './manuscriptScripts';

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
  authorLine?: string;
  affiliations?: string;
  correspondingAuthor?: string;
  sections: ImportedSectionDraft[];
  warnings?: string[];
  stats?: {
    equationCount: number;
    embeddedImageCount: number;
    tableCount: number;
  };
};

export type ImportedFigureDraft = {
  name: string;
  assetKind: 'FIGURE' | 'TABLE';
  placement: 'MAIN' | 'SUPPLEMENT';
  refKey: string;
  caption: string;
  sourceLabel?: string;
  sectionOrderIndex?: number;
  tableData?: string;
  imageSource: 'NONE' | 'UPLOAD';
  imageUrl?: string;
  altText?: string;
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
    pattern: /ethic(s|al)|institutional review|irb\b|consent to participate/,
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
      /(methodolog|^methods?\b|materials and methods|experimental|study design|data and methods|study area|participants and|procedure)/,
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

const appendSubheadingToSection = (
  section: ImportedSectionDraft,
  block: Block,
): ImportedSectionDraft => {
  const heading = block.heading ?? 'Details';
  const content = [section.content, `### ${heading}`, block.body]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');

  return {
    ...section,
    content,
    wordCount: countWords(content),
  };
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
      first.heading = 'Title page';
      first.level = 2;
      first.body = remainder;
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
        first.level = 2;
      } else {
        startIndex = 1;
      }
    }
  }

  const sections: ImportedSectionDraft[] = [];
  for (let index = startIndex; index < blocks.length; index += 1) {
    const block = blocks[index];
    const heading = block.heading ?? 'Body';
    if (block.body.length === 0 && block.heading === null) continue;

    // Word documents commonly use Heading 3+ for method/result subsections.
    // Keep those headings inside their owning semantic section instead of
    // creating a misleading top-level manuscript section for each one.
    if (block.level >= 3 && sections.length > 0) {
      sections[sections.length - 1] = appendSubheadingToSection(
        sections[sections.length - 1],
        block,
      );
      continue;
    }

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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (entity) => XML_ENTITIES[entity] ?? entity,
    );

// Concatenate the text runs of a paragraph/cell, honouring tabs and line breaks.
const wordRunsText = (xml: string): string => {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>\s*<w:p\b[^>]*>/g, '\n');
  const withScripts = withBreaks.replace(/<w:r\b[\s\S]*?<\/w:r>/g, (runXml) => {
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
  const runs = [
    ...withScripts.matchAll(/<(?:w|m):t\b[^>]*>([\s\S]*?)<\/(?:w|m):t>/g),
  ];
  return runs.map((match) => decodeXml(match[1])).join('');
};

export type WordStyleDefinition = {
  name: string;
  headingLevel: number;
};

export type WordImportOptions = {
  styles?: Record<string, WordStyleDefinition>;
  imageByRelationshipId?: Record<string, { dataUrl: string; altText: string }>;
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

const stripXmlTags = (xml: string): string =>
  decodeXml(xml.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

const ommlToLatex = (mathXml: string): string => {
  let converted = mathXml;

  converted = converted.replace(
    /<m:nary\b[\s\S]*?<\/m:naryPr>\s*<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>\s*<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>\s*<m:e\b[^>]*>([\s\S]*)<\/m:e>\s*<\/m:nary>/g,
    (_match, subscript: string, superscript: string, expression: string) =>
      `\\sum_{${ommlToLatex(subscript)}}^{${ommlToLatex(
        superscript,
      )}} ${ommlToLatex(expression)}`,
  );
  converted = converted.replace(
    /<m:f\b[\s\S]*?<m:num\b[^>]*>([\s\S]*?)<\/m:num>[\s\S]*?<m:den\b[^>]*>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/g,
    (_match, numerator: string, denominator: string) =>
      `\\frac{${ommlToLatex(numerator)}}{${ommlToLatex(denominator)}}`,
  );
  converted = converted.replace(
    /<m:sSub\b[\s\S]*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub\b[^>]*>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/g,
    (_match, base: string, subscript: string) =>
      `${ommlToLatex(base)}_{${ommlToLatex(subscript)}}`,
  );
  converted = converted.replace(
    /<m:sSup\b[\s\S]*?<m:e\b[^>]*>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup\b[^>]*>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/g,
    (_match, base: string, superscript: string) =>
      `${ommlToLatex(base)}^{${ommlToLatex(superscript)}}`,
  );

  return stripXmlTags(converted);
};

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

const wordParagraphToMarkdown = (
  paragraphXml: string,
  options: WordImportOptions,
): string => {
  const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(paragraphXml);
  const styleId = styleMatch?.[1] ?? '';
  const level = headingLevelFromStyle(styleId, options.styles ?? {});
  // OMML carries its own <m:t> text runs. Remove it from the prose pass so an
  // equation is emitted once as math, not once as flattened text and again as
  // math.
  const text = wordRunsText(
    paragraphXml.replace(/<m:oMath\b[\s\S]*?<\/m:oMath>/g, ''),
  ).trim();
  const images = paragraphImages(paragraphXml, options.imageByRelationshipId);
  const math = paragraphMath(paragraphXml).map((value) => `$$${value}$$`);

  if (text.length === 0 && images.length === 0 && math.length === 0) return '';

  if (/^keywords?\s*:/i.test(text)) {
    return `\n## Keywords\n\n${text.replace(/^keywords?\s*:\s*/i, '')}\n`;
  }
  if (/^all authors contributed\b/i.test(text)) {
    return `\n## Author contributions\n\n${text}\n`;
  }

  const detectedLevel = semanticHeadingLevel(text);
  const finalLevel =
    math.length > 0 || isProseLike(text)
      ? 0
      : detectedLevel > 0
        ? detectedLevel
        : level > 0
          ? Math.min(level, 3)
          : isDirectlyBold(paragraphXml) && text.length <= 100
            ? 3
            : 0;
  const renderedText =
    finalLevel > 0 ? `\n${'#'.repeat(finalLevel)} ${text}\n` : text;

  return [renderedText, ...math, ...images]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
};

const wordTableToMarkdown = (tableXml: string): string => {
  const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(
    (rowMatch) =>
      [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cellMatch) =>
        wordRunsText(cellMatch[0]).replace(/\s+/g, ' ').trim(),
      ),
  );
  const grid = rows.filter((cells) => cells.length > 0);
  return grid.length === 0 ? '' : `\n${gridToMarkdownTable(grid)}\n`;
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

const injectAbstractHeading = (blocks: string[]): string[] => {
  const keywordsIndex = blocks.findIndex((block) =>
    /^\s*## Keywords\b/.test(block),
  );
  if (keywordsIndex < 0) return blocks;

  for (let index = keywordsIndex - 1; index >= 0; index -= 1) {
    const candidate = blocks[index].trim();
    if (candidate.startsWith('#')) continue;
    if (countWords(candidate) < 50) continue;
    return [
      ...blocks.slice(0, index),
      '## Abstract',
      blocks[index],
      ...blocks.slice(index + 1),
    ];
  }
  return blocks;
};

const removeDuplicateTitleBlocks = (blocks: string[]): string[] => {
  const normalizedBlockText = (block: string): string =>
    block
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

export const parseWordMlToMarkdown = (
  documentXml: string,
  options: WordImportOptions = {},
): string => {
  const body =
    /<w:body\b[\s\S]*?<\/w:body>/.exec(documentXml)?.[0] ?? documentXml;
  const tokens = tokenizeWordBody(body);
  const out: string[] = [];
  for (const token of tokens) {
    out.push(
      token.startsWith('<w:tbl')
        ? wordTableToMarkdown(token)
        : wordParagraphToMarkdown(token, options),
    );
  }
  return injectAbstractHeading(removeDuplicateTitleBlocks(out))
    .join('\n')
    .replace(/^#{1,6}\s*$/gm, '')
    .replace(
      /^Figure 1\. Type your caption here\. Obtain permission and include the acknowledgement required by the copyright holder if a figure is being reproduced from another source\.?$/gim,
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const parseWordDocument = (
  documentXml: string,
  options: WordImportOptions = {},
): ImportedDocument => {
  const markdown = parseWordMlToMarkdown(documentXml, options);
  const document = parseMarkdownDocument(markdown);
  const equationCount = (documentXml.match(/<m:oMath\b/g) ?? []).length;
  const embeddedImageCount = (
    markdown.match(/!\[[^\]]*\]\(data:image\//g) ?? []
  ).length;
  const tableCount = (documentXml.match(/<w:tbl\b/g) ?? []).length;
  const warnings: string[] = [];

  if (document.sections.length <= 1) {
    warnings.push(
      'Few semantic sections were detected. Review the section names and types before importing.',
    );
  }
  if (embeddedImageCount === 0 && /<w:drawing\b/.test(documentXml)) {
    warnings.push(
      'The document contains images that could not be resolved from the DOCX package.',
    );
  }

  const titlePage = document.sections.find(
    (section) => section.sectionType === 'TITLE_PAGE',
  );
  const titlePageLines = (titlePage?.content ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const correspondingIndex = titlePageLines.findIndex((line) =>
    /^\*?corresponding author\s*:/i.test(line),
  );
  const authorLine = titlePageLines[0]?.replace(/^#{1,6}\s+/, '').trim();
  const affiliationLines = titlePageLines.slice(
    1,
    correspondingIndex >= 0 ? correspondingIndex : undefined,
  );
  const correspondingAuthor =
    correspondingIndex >= 0
      ? titlePageLines[correspondingIndex].replace(/^\*|\*$/g, '').trim()
      : undefined;

  return {
    ...document,
    ...(authorLine !== undefined ? { authorLine } : {}),
    ...(affiliationLines.length > 0
      ? { affiliations: affiliationLines.join('\n') }
      : {}),
    ...(correspondingAuthor !== undefined ? { correspondingAuthor } : {}),
    warnings,
    stats: { equationCount, embeddedImageCount, tableCount },
  };
};

// ── Lift standalone tables into numbered figure records ─────────────────────
// An imported GFM table sitting in a section body is data, not prose. This pulls
// each one out into a `figure` (TABLE) draft and leaves an exact-position
// `[[asset:refKey]]` marker in its place, so it renders once at the source
// location instead of being appended to the end of the section.

const TABLE_SEPARATOR = /^\|?[\s:|-]+\|?$/;
const isTableLine = (line: string): boolean => line.trim().includes('|');

type ImportedAssetCaption = {
  caption: string;
  sourceLabel?: string;
};

const parseImportedAssetCaption = (
  line: string,
  kind: 'FIGURE' | 'TABLE',
): ImportedAssetCaption | null => {
  const prefix = kind === 'FIGURE' ? '(?:fig(?:ure)?)' : '(?:table|tbl)';
  const match = new RegExp(
    `^\\s*${prefix}\\s*\\.?\\s*(?:([sS]?\\d+(?:\\.\\d+)*(?:[a-z])?)\\s*[.:)]?\\s*)?(.*)$`,
    'i',
  ).exec(line);
  if (match === null) return null;
  let sourceLabel = match[1]?.replace(/^s/i, 'S');
  let caption = match[2].trim();
  const embeddedSourceLabel =
    /^(?:fig(?:ure)?|table|tbl)?\s*\.?\s*(S?\d+(?:\.\d+)+)(?:[.:)]\s*|\s+)(.*)$/i.exec(
      caption,
    );
  if (embeddedSourceLabel !== null) {
    sourceLabel = embeddedSourceLabel[1].replace(/^s/i, 'S');
    caption = embeddedSourceLabel[2].trim();
  }
  return {
    caption,
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

export const extractTablesToFigures = (
  sections: ImportedSectionDraft[],
  startOrderIndex = 0,
): { sections: ImportedSectionDraft[]; figures: ImportedFigureDraft[] } => {
  const figures: ImportedFigureDraft[] = [];
  const usedRefKeys = new Set<string>();
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
          const captionMatch = parseImportedAssetCaption(previous, 'TABLE');
          if (captionMatch !== null) {
            captionInfo = captionMatch;
            caption = captionMatch.caption;
            out.splice(previousIndex);
          } else {
            let captionIndex = end;
            while (
              captionIndex < lines.length &&
              lines[captionIndex].trim().length === 0
            ) {
              captionIndex += 1;
            }
            const following = lines[captionIndex]?.trim() ?? '';
            const followingMatch = parseImportedAssetCaption(
              following,
              'TABLE',
            );
            if (followingMatch !== null) {
              captionInfo = followingMatch;
              caption = followingMatch.caption;
              end = captionIndex + 1;
            }
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
): { sections: ImportedSectionDraft[]; figures: ImportedFigureDraft[] } => {
  const figures: ImportedFigureDraft[] = [];
  const usedRefKeys = new Set<string>();
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
      const previousCaption = parseImportedAssetCaption(previousLine, 'FIGURE');
      let nextCaptionIndex = index + 1;
      while (
        nextCaptionIndex < lines.length &&
        (lines[nextCaptionIndex]?.trim() ?? '').length === 0
      ) {
        nextCaptionIndex += 1;
      }
      const nextLine = lines[nextCaptionIndex]?.trim() ?? '';
      const nextCaption = parseImportedAssetCaption(nextLine, 'FIGURE');
      if (previousCaption !== null) {
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

const IMPORTED_FIGURE_REFERENCE =
  /\b(?:fig(?:ure)?s?)\.?\s+(S?\d+(?:\.\d+)*)([a-z])?/gi;
const IMPORTED_TABLE_REFERENCE =
  /\b(?:tables?|tbls?)\.?\s+(S?\d+(?:\.\d+)*)([a-z])?/gi;

// Convert source-visible labels ("Fig. 2.6b", "Fig. S2.18") into stable
// asset references. The optional panel suffix remains outside the token, so a
// reordered composite figure renders as the new number plus the same panel.
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

  let linkedCount = 0;
  const replace = (
    content: string,
    kind: 'FIGURE' | 'TABLE',
    pattern: RegExp,
  ): string =>
    content.replace(
      pattern,
      (original: string, rawLabel: string, panel: string | undefined) => {
        const fullLabel = `${rawLabel}${panel ?? ''}`.toLowerCase();
        const exact = byKind.get(`${kind}:${fullLabel}`);
        const base = byKind.get(`${kind}:${rawLabel.toLowerCase()}`);
        const target = exact ?? base;
        if (target === undefined) return original;
        linkedCount += 1;
        return `[#${target.refKey}]${exact === undefined ? (panel ?? '') : ''}`;
      },
    );

  const linkedSections = sections.map((section) => {
    const withFigures = replace(
      section.content,
      'FIGURE',
      IMPORTED_FIGURE_REFERENCE,
    );
    const content = replace(withFigures, 'TABLE', IMPORTED_TABLE_REFERENCE);
    return { ...section, content, wordCount: countWords(content) };
  });

  return { sections: linkedSections, figures, linkedCount };
};
