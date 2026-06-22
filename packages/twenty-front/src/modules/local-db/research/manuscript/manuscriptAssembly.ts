import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import {
  buildCitationContext,
  formatBibliography,
  renderCitationsInText,
  type FormattedBibliographyEntry,
} from './manuscriptCitations';
import {
  extractCitationKeys,
  resolveCrossReferences,
} from './manuscriptCrossReference';
import { figureHasImage, figureToMarkdown } from './manuscriptImages';
import { numberAssets } from './manuscriptNumbering';
import {
  type FigureLike,
  type JournalStyle,
  type NumberedFigure,
  type ReferenceLike,
  type SectionLike,
} from './manuscriptTypes';

// The keystone: assemble a manuscript's records into a single Pandoc-ready
// bundle — numbered figures, resolved cross-references, formatted citations, a
// main body and a separate supplement, plus a CSL-JSON bibliography and a set of
// warnings. Every exporter (Markdown now; BlockNote-DOCX, Pandoc, Typst later)
// consumes this one shape, so the export engine is a swap, not a rewrite.

const PLACEMENT_ORDER: Record<string, number> = {
  FRONT_MATTER: 0,
  MAIN: 1,
  BACK_MATTER: 2,
  SUPPLEMENT: 3,
};

const CSL_TYPE_REVERSE: Record<string, string> = {
  ARTICLE_JOURNAL: 'article-journal',
  PAPER_CONFERENCE: 'paper-conference',
  BOOK: 'book',
  CHAPTER: 'chapter',
  THESIS: 'thesis',
  REPORT: 'report',
  DATASET: 'dataset',
  WEBPAGE: 'webpage',
  PREPRINT: 'article',
  SOFTWARE: 'software',
  OTHER: 'article-journal',
};

export const countWords = (markdown: string): number => {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[[#@][^\]]*\]/g, ' ') // cross-refs / citations
    .replace(/[#*_>`~-]/g, ' ')
    .trim();
  return text.length === 0 ? 0 : text.split(/\s+/).length;
};

const keyOf = (reference: ReferenceLike): string =>
  isNonEmptyString(reference.citationKey)
    ? reference.citationKey
    : reference.id;

const parseAuthorsToCsl = (
  authors: string | null | undefined,
): { family: string; given?: string }[] => {
  if (!isNonEmptyString(authors)) return [];
  return authors
    .split(';')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => {
      if (name.includes(',')) {
        const [family, given] = name.split(',');
        return { family: family.trim(), given: given.trim() };
      }
      const parts = name.split(/\s+/);
      return {
        family: parts[parts.length - 1],
        given: parts.slice(0, -1).join(' '),
      };
    });
};

const referenceToCslItem = (
  reference: ReferenceLike,
): Record<string, unknown> => {
  if (isNonEmptyString(reference.cslJson)) {
    try {
      const parsed = JSON.parse(reference.cslJson) as Record<string, unknown>;
      return { ...parsed, id: keyOf(reference) };
    } catch {
      // fall through to synthesis
    }
  }
  return {
    id: keyOf(reference),
    type: CSL_TYPE_REVERSE[reference.cslType ?? 'OTHER'] ?? 'article-journal',
    title: reference.name ?? '',
    author: parseAuthorsToCsl(reference.authors),
    ...(isDefined(reference.year)
      ? { issued: { 'date-parts': [[reference.year]] } }
      : {}),
    ...(isNonEmptyString(reference.containerTitle)
      ? { 'container-title': reference.containerTitle }
      : {}),
    ...(isNonEmptyString(reference.volume) ? { volume: reference.volume } : {}),
    ...(isNonEmptyString(reference.issue) ? { issue: reference.issue } : {}),
    ...(isNonEmptyString(reference.pages) ? { page: reference.pages } : {}),
    ...(isNonEmptyString(reference.doi) ? { DOI: reference.doi } : {}),
    ...(isNonEmptyString(reference.url) ? { URL: reference.url } : {}),
  };
};

const compareSections = (a: SectionLike, b: SectionLike): number => {
  const placementDelta =
    (PLACEMENT_ORDER[a.placement ?? 'MAIN'] ?? 1) -
    (PLACEMENT_ORDER[b.placement ?? 'MAIN'] ?? 1);
  if (placementDelta !== 0) return placementDelta;
  const orderDelta = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  if (orderDelta !== 0) return orderDelta;
  return (a.name ?? '').localeCompare(b.name ?? '');
};

export type ManuscriptMeta = {
  id: string;
  name?: string | null;
  targetVenue?: string | null;
  doi?: string | null;
};

export type BuildBundleInput = {
  manuscript: ManuscriptMeta;
  sections: SectionLike[];
  figures: FigureLike[];
  references: ReferenceLike[];
  style: JournalStyle;
  authors?: string;
};

export type ManuscriptBundle = {
  metadata: {
    title: string;
    authors: string;
    abstract: string;
    journal: string;
    citationStyleId: string;
    citationMode: string;
  };
  mainMarkdown: string;
  supplementMarkdown: string;
  fullMarkdown: string;
  cslJson: Record<string, unknown>[];
  bibliography: FormattedBibliographyEntry[];
  citedKeys: string[];
  numberedFigures: NumberedFigure[];
  // A neutral, render-target-agnostic document model. The Markdown exporter and
  // the BlockNote/DOCX exporter both consume this, so figures become real
  // images and tables become real tables in DOCX (not just Markdown text).
  nodes: ManuscriptDocNode[];
  warnings: string[];
  stats: {
    wordCount: number;
    sectionCount: number;
    figureCount: number;
    referenceCount: number;
    supplementSectionCount: number;
    supplementFigureCount: number;
  };
};

// One unit of the neutral document model.
export type ManuscriptDocNode =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'prose'; markdown: string }
  | { kind: 'figure'; figure: NumberedFigure }
  | { kind: 'table'; figure: NumberedFigure }
  | { kind: 'bibliography'; entries: FormattedBibliographyEntry[] };

const figureNode = (figure: NumberedFigure): ManuscriptDocNode =>
  figure.assetKind === 'TABLE'
    ? { kind: 'table', figure }
    : { kind: 'figure', figure };

const renderSectionBody = (
  section: SectionLike,
  numbered: NumberedFigure[],
  warnings: string[],
): { heading: string; resolved: string; citationKeys: string[] } => {
  const content = section.content ?? '';
  const { text, unresolvedKeys } = resolveCrossReferences(content, numbered);
  for (const key of unresolvedKeys) {
    warnings.push(
      `Section "${section.name ?? section.sectionType}" references unknown asset [#${key}]`,
    );
  }
  const citationKeys = extractCitationKeys(content);
  const heading = isNonEmptyString(section.name)
    ? section.name
    : (section.sectionType ?? 'Section');
  return { heading, resolved: text, citationKeys };
};

export const buildManuscriptBundle = (
  input: BuildBundleInput,
): ManuscriptBundle => {
  const { manuscript, style } = input;
  const warnings: string[] = [];

  const numbered = numberAssets(input.figures, style);
  const figuresBySection = new Map<string, NumberedFigure[]>();
  const unanchoredMain: NumberedFigure[] = [];
  const supplementFigures: NumberedFigure[] = [];
  for (const figure of numbered) {
    if (figure.placement === 'SUPPLEMENT') {
      supplementFigures.push(figure);
    } else if (isNonEmptyString(figure.sectionId)) {
      const list = figuresBySection.get(figure.sectionId) ?? [];
      list.push(figure);
      figuresBySection.set(figure.sectionId, list);
    } else {
      unanchoredMain.push(figure);
    }
    if (!figureHasImage(figure) && figure.assetKind !== 'TABLE') {
      warnings.push(`${figure.label} has no image yet`);
    }
  }

  const referencesByKey = new Map<string, ReferenceLike>();
  for (const reference of input.references) {
    referencesByKey.set(keyOf(reference), reference);
  }

  const sections = [...input.sections]
    .filter((section) => section.includeInExport !== false)
    .sort(compareSections);

  // First pass: resolve cross-refs and collect citation keys in document order.
  const rendered = sections.map((section) =>
    renderSectionBody(section, numbered, warnings),
  );
  const citedKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const part of rendered) {
    for (const key of part.citationKeys) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        citedKeys.push(key);
      }
    }
  }

  const { context, orderedKeys, missingKeys } = buildCitationContext(
    citedKeys,
    referencesByKey,
    style.citationMode,
  );
  for (const key of missingKeys) {
    warnings.push(`Citation [@${key}] has no matching reference`);
  }

  // Second pass: render citations and assemble per-placement blocks + nodes.
  const mainBlocks: string[] = [];
  const supplementBlocks: string[] = [];
  const mainNodes: ManuscriptDocNode[] = [];
  const supplementNodes: ManuscriptDocNode[] = [];
  let mainWords = 0;

  sections.forEach((section, index) => {
    const part = rendered[index];
    const withCitations = renderCitationsInText(part.resolved, context);
    const block = `## ${part.heading}\n\n${withCitations}`.trim();

    const anchored = figuresBySection.get(section.id) ?? [];
    const figureBlocks = anchored.map((figure) => figureToMarkdown(figure));

    const isSupplement = section.placement === 'SUPPLEMENT';
    const target = isSupplement ? supplementBlocks : mainBlocks;
    const nodeTarget = isSupplement ? supplementNodes : mainNodes;
    target.push(block);
    for (const figureBlock of figureBlocks) target.push(figureBlock);
    nodeTarget.push({ kind: 'heading', level: 2, text: part.heading });
    nodeTarget.push({ kind: 'prose', markdown: withCitations });
    for (const figure of anchored) nodeTarget.push(figureNode(figure));

    // Word-limit checks.
    const words = countWords(section.content ?? '');
    if (!isSupplement) mainWords += words;
    if (
      isDefined(section.wordLimit) &&
      section.wordLimit > 0 &&
      words > section.wordLimit
    ) {
      warnings.push(
        `Section "${part.heading}" is ${words} words (limit ${section.wordLimit})`,
      );
    }
  });

  for (const figure of unanchoredMain) {
    mainBlocks.push(figureToMarkdown(figure));
    mainNodes.push(figureNode(figure));
  }
  for (const figure of supplementFigures) {
    supplementBlocks.push(figureToMarkdown(figure));
    supplementNodes.push(figureNode(figure));
  }

  // Bibliography.
  const bibliography = formatBibliography(context, orderedKeys);
  if (bibliography.length > 0) {
    const bibBlock = [
      '## References',
      '',
      ...bibliography.map((entry) => entry.text),
    ].join('\n');
    mainBlocks.push(bibBlock);
    mainNodes.push({ kind: 'heading', level: 2, text: 'References' });
    mainNodes.push({ kind: 'bibliography', entries: bibliography });
  }

  const nodes: ManuscriptDocNode[] = [...mainNodes];
  if (supplementNodes.length > 0) {
    nodes.push({ kind: 'heading', level: 1, text: 'Supplementary Material' });
    nodes.push(...supplementNodes);
  }

  const abstractSection = sections.find(
    (section) => section.sectionType === 'ABSTRACT',
  );
  const abstract = (abstractSection?.content ?? '').trim();
  if (
    isDefined(style.abstractWordLimit) &&
    style.abstractWordLimit > 0 &&
    countWords(abstract) > style.abstractWordLimit
  ) {
    warnings.push(
      `Abstract is ${countWords(abstract)} words (limit ${style.abstractWordLimit})`,
    );
  }

  const mainMarkdown = mainBlocks.join('\n\n');
  const supplementMarkdown =
    supplementBlocks.length > 0
      ? ['# Supplementary Material', '', supplementBlocks.join('\n\n')].join(
          '\n',
        )
      : '';
  const fullMarkdown = [mainMarkdown, supplementMarkdown]
    .filter((part) => part.length > 0)
    .join('\n\n');

  return {
    metadata: {
      title: manuscript.name ?? 'Untitled manuscript',
      authors: input.authors ?? '',
      abstract,
      journal: style.name ?? manuscript.targetVenue ?? '',
      citationStyleId: style.citationStyleId ?? '',
      citationMode: style.citationMode ?? 'NUMERIC',
    },
    mainMarkdown,
    supplementMarkdown,
    fullMarkdown,
    cslJson: input.references.map(referenceToCslItem),
    bibliography,
    citedKeys,
    numberedFigures: numbered,
    nodes,
    warnings,
    stats: {
      wordCount: mainWords,
      sectionCount: sections.filter((s) => s.placement !== 'SUPPLEMENT').length,
      figureCount: numbered.filter((f) => f.placement !== 'SUPPLEMENT').length,
      referenceCount: input.references.length,
      supplementSectionCount: sections.filter(
        (s) => s.placement === 'SUPPLEMENT',
      ).length,
      supplementFigureCount: supplementFigures.length,
    },
  };
};
