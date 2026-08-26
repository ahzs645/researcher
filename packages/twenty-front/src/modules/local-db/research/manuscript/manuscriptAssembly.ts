import { countWords } from './manuscriptWordCount';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import {
  buildCitationContext,
  bibliographyHtmlToMarkdown,
  formatBibliography,
  renderCitationsInText,
  renderCitationsInTextWithLabels,
  type FormattedBibliographyEntry,
} from './manuscriptCitations';
import { referenceToCslItem } from './manuscriptCiteproc';
import {
  extractCitationKeys,
  resolveCrossReferences,
} from './manuscriptCrossReference';
import { splitAssetPlacementMarkers } from './manuscriptAssetPlacement';
import { figureHasImage, figureToMarkdown } from './manuscriptImages';
import {
  buildAssetLookup,
  numberAssets,
  resolveAssetKey,
} from './manuscriptNumbering';
import { resolveSectionVariants } from './manuscriptSectionVariants';
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

export const slugifyTitle = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'manuscript';

// Re-exported because callers have always imported it from here.
export { countWords };

const keyOf = (reference: ReferenceLike): string =>
  isNonEmptyString(reference.citationKey?.trim())
    ? (reference.citationKey as string).trim()
    : reference.id;

const compareSections = (a: SectionLike, b: SectionLike): number => {
  const placementDelta =
    (PLACEMENT_ORDER[a.placement ?? 'MAIN'] ?? 1) -
    (PLACEMENT_ORDER[b.placement ?? 'MAIN'] ?? 1);
  if (placementDelta !== 0) return placementDelta;
  const orderDelta = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  if (orderDelta !== 0) return orderDelta;
  return (a.name ?? '').localeCompare(b.name ?? '');
};

// The one choke point every exporter goes through, so which version of a
// section a journal receives is decided here and nowhere else.
//
// Resolution runs last, on the sections that are actually going out. Filtering
// first is what gives a version's own `includeInExport` its only possible
// meaning — switch the alternative off and its base speaks for itself again —
// because the resolved section keeps the base's flag, never the version's. It
// also settles an excluded base cleanly: the base goes, and its versions are
// left naming a section that is no longer here, so they drop rather than
// escape as loose sections. The type filters are order-independent, since a
// resolved section still carries the base's `sectionType`; and sorting before
// resolution keeps the order the base's, since a version substitutes the
// `name` that the sort breaks its ties on.
export const manuscriptSectionsForExport = (
  input: Pick<BuildBundleInput, 'references' | 'sections' | 'style'>,
): SectionLike[] =>
  resolveSectionVariants(
    [...input.sections]
      .filter(
        (section) =>
          section.includeInExport !== false &&
          section.sectionType !== 'TITLE_PAGE' &&
          !(
            section.sectionType === 'REFERENCES' && input.references.length > 0
          ),
      )
      .sort(compareSections),
    // The whole style, not just its key: a version pinned to this journal is
    // only one of the ways a version can be the right one, and the other needs
    // the number the journal caps an abstract at.
    input.style,
  );

const sectionHeadingLevel = (
  section: SectionLike,
  heading: string,
): 2 | 3 | 4 => {
  if (
    section.sectionType === 'ABSTRACT' ||
    section.sectionType === 'KEYWORDS'
  ) {
    return 3;
  }
  // The depth the author gave the section in the composer outline is the
  // authority — the manuscript title is the h1, so a top-level section is h2.
  // Without it every section exported flat, which is why a subsection was
  // indistinguishable from the section above it.
  const outlineLevel = section.level;
  if (isDefined(outlineLevel) && outlineLevel >= 2) {
    return Math.round(outlineLevel) >= 3 ? 4 : 3;
  }
  const numericPrefix = /^(\d+(?:\.\d+)+)\b/.exec(heading)?.[1];
  return numericPrefix !== undefined && numericPrefix.split('.').length >= 3
    ? 3
    : 2;
};

export type ManuscriptMeta = {
  id: string;
  name?: string | null;
  targetVenue?: string | null;
  doi?: string | null;
  authorLine?: string | null;
  affiliations?: string | null;
  titlePageExtraLines?: string[] | null;
  correspondingAuthor?: string | null;
  // The structured contributor block (ORCID, CRediT roles, ROR, funding) as
  // stored JSON. The JATS writer reads it off here; every other exporter
  // works from the byline, which stays the source of truth for names.
  contributorMetadata?: string | null;
  supplementTitle?: string | null;
  supplementAuthorLine?: string | null;
  supplementAffiliations?: string | null;
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
    keywords: string[];
    affiliations: string;
    titlePageExtraLines: string[];
    correspondingAuthor: string;
    supplementTitle: string;
    supplementAuthors: string;
    supplementAffiliations: string;
    journal: string;
    citationStyleId: string;
    citationMode: string;
  };
  style: JournalStyle;
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
  sourceInput: BuildBundleInput;
};

export type ManuscriptCitationFormatting = {
  bibliography: FormattedBibliographyEntry[];
  labelsByCluster: ReadonlyMap<string, string>;
};

export type ManuscriptBundleOptions = {
  // Keep each rendered citation paired with the keys it came from, so an
  // exporter can link "[3]" to the reference it names. Off by default: the
  // markers are invisible control characters that only the HTML exporter reads.
  citationAnchors?: boolean;
  // Keep each resolved [#key] paired with the asset it resolved to, so an
  // exporter can turn "Eq. (7)" into a link to that equation's own number.
  // The DOCX export asks for these without asking for citation anchors.
  crossReferenceAnchors?: boolean;
};

// One unit of the neutral document model.
export type ManuscriptDocNode =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'prose'; markdown: string }
  | { kind: 'figure'; figure: NumberedFigure }
  | { kind: 'table'; figure: NumberedFigure }
  | { kind: 'equation'; figure: NumberedFigure }
  | { kind: 'bibliography'; entries: FormattedBibliographyEntry[] };

const figureNode = (figure: NumberedFigure): ManuscriptDocNode => {
  if (figure.assetKind === 'TABLE') return { kind: 'table', figure };
  if (figure.assetKind === 'EQUATION') return { kind: 'equation', figure };
  return { kind: 'figure', figure };
};

const renderSectionBody = (
  section: SectionLike,
  numbered: NumberedFigure[],
  warnings: string[],
  withCrossRefAnchors: boolean,
): { heading: string; resolved: string; citationKeys: string[] } => {
  const content = section.content ?? '';
  const { text, unresolvedKeys, unnumberedKeys } = resolveCrossReferences(
    content,
    numbered,
    withCrossRefAnchors,
  );
  const sectionName = section.name ?? section.sectionType;
  for (const key of unresolvedKeys) {
    warnings.push(
      `Section "${sectionName}" references unknown asset [#${key}]`,
    );
  }
  for (const key of unnumberedKeys) {
    warnings.push(
      `Section "${sectionName}" references [#${key}], whose numbering is turned off — there is no number to print`,
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
  citationFormatting?: ManuscriptCitationFormatting,
  options: ManuscriptBundleOptions = {},
): ManuscriptBundle => {
  const { manuscript, style } = input;
  const warnings: string[] = [];
  const withAnchors = options.citationAnchors === true;
  const withCrossRefAnchors =
    withAnchors || options.crossReferenceAnchors === true;

  // The metadata already renders title-page fields, and a generated
  // bibliography replaces an imported source References section.
  const sections = manuscriptSectionsForExport(input);

  const numbered = numberAssets(input.figures, style, sections);
  const assetLookup = buildAssetLookup(numbered);
  // Cross-refs inside captions and table grids resolve like in-text ones, and
  // their citation keys count toward the bibliography — otherwise a citation
  // that lives only in a caption never reaches the reference list.
  const numberedResolvedText = numbered.map((figure) => {
    const resolvedFigure = { ...figure };
    for (const field of ['caption', 'tableData'] as const) {
      const value = figure[field];
      if (!isNonEmptyString(value)) continue;
      const { text, unresolvedKeys, unnumberedKeys } = resolveCrossReferences(
        value,
        numbered,
        withCrossRefAnchors,
      );
      const where = field === 'caption' ? 'caption' : 'table';
      const source =
        figure.label.length > 0 ? figure.label : (figure.name ?? 'Asset');
      for (const key of unresolvedKeys) {
        warnings.push(`${source} ${where} references unknown asset [#${key}]`);
      }
      for (const key of unnumberedKeys) {
        warnings.push(
          `${source} ${where} references [#${key}], whose numbering is turned off — there is no number to print`,
        );
      }
      if (text !== value) resolvedFigure[field] = text;
    }
    return resolvedFigure;
  });
  const figuresBySection = new Map<string, NumberedFigure[]>();
  const unanchoredMain: NumberedFigure[] = [];
  const supplementFigures: NumberedFigure[] = [];
  for (const figure of numberedResolvedText) {
    if (isNonEmptyString(figure.sectionId)) {
      const list = figuresBySection.get(figure.sectionId) ?? [];
      list.push(figure);
      figuresBySection.set(figure.sectionId, list);
    } else if (figure.placement === 'SUPPLEMENT') {
      supplementFigures.push(figure);
    } else {
      unanchoredMain.push(figure);
    }
    if (figure.assetKind === 'EQUATION') {
      if (!isNonEmptyString(figure.equationLatex)) {
        warnings.push(`${figure.label} has no equation body yet`);
      }
    } else if (!figureHasImage(figure) && figure.assetKind !== 'TABLE') {
      warnings.push(`${figure.label} has no image yet`);
    }
  }

  const referencesByKey = new Map<string, ReferenceLike>();
  for (const reference of input.references) {
    referencesByKey.set(keyOf(reference), reference);
  }

  // First pass: resolve cross-refs and collect citation keys in document order.
  const rendered = sections.map((section) =>
    renderSectionBody(section, numbered, warnings, withCrossRefAnchors),
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
  // Citations that live only inside a caption or a table grid still count —
  // otherwise they would be dropped from the bibliography entirely.
  for (const figure of numberedResolvedText) {
    for (const key of [
      ...extractCitationKeys(figure.caption ?? ''),
      ...extractCitationKeys(figure.tableData ?? ''),
    ]) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        citedKeys.push(key);
      }
    }
  }

  // References belong to this manuscript, not a global library. Preserve
  // imported bibliography entries even when the source draft does not contain
  // machine-readable citation markers; cited items remain first in document
  // order and uncited items follow in their stored order.
  const bibliographyKeys = [...citedKeys];
  for (const reference of input.references) {
    const key = keyOf(reference);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      bibliographyKeys.push(key);
    }
  }

  const { context, orderedKeys, missingKeys } = buildCitationContext(
    bibliographyKeys,
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
  const placedFigureIds = new Set<string>();
  let mainWords = 0;

  const renderCitationText =
    citationFormatting === undefined
      ? (text: string) => renderCitationsInText(text, context, withAnchors)
      : (text: string) =>
          renderCitationsInTextWithLabels(
            text,
            citationFormatting.labelsByCluster,
            context,
            withAnchors,
          );
  const renderFigureText = (figure: NumberedFigure): NumberedFigure => ({
    ...figure,
    ...(isNonEmptyString(figure.caption)
      ? { caption: renderCitationText(figure.caption) }
      : {}),
    ...(isNonEmptyString(figure.tableData)
      ? { tableData: renderCitationText(figure.tableData) }
      : {}),
  });

  sections.forEach((section, index) => {
    const part = rendered[index];
    const withCitations = renderCitationText(part.resolved);
    const anchored = figuresBySection.get(section.id) ?? [];

    const isSupplement = section.placement === 'SUPPLEMENT';
    const target = isSupplement ? supplementBlocks : mainBlocks;
    const nodeTarget = isSupplement ? supplementNodes : mainNodes;
    target.push(`## ${part.heading}`);
    nodeTarget.push({
      kind: 'heading',
      level: sectionHeadingLevel(section, part.heading),
      text: part.heading,
    });

    for (const segment of splitAssetPlacementMarkers(withCitations)) {
      if (segment.kind === 'prose') {
        target.push(segment.markdown);
        nodeTarget.push({ kind: 'prose', markdown: segment.markdown });
        continue;
      }
      const figure = resolveAssetKey(segment.refKey, assetLookup);
      if (figure === undefined) {
        warnings.push(
          `Section "${part.heading}" has an unknown asset placement [[asset:${segment.refKey}]]`,
        );
        continue;
      }
      if (placedFigureIds.has(figure.id)) {
        warnings.push(
          `${figure.label} has more than one placement marker; only the first is used`,
        );
        continue;
      }
      placedFigureIds.add(figure.id);
      target.push(figureToMarkdown(renderFigureText(figure)));
      nodeTarget.push(figureNode(renderFigureText(figure)));
    }

    // A section assignment remains a convenient coarse anchor. An explicit
    // placement marker takes precedence; otherwise the asset follows the
    // section prose as before.
    for (const figure of anchored) {
      if (placedFigureIds.has(figure.id)) continue;
      placedFigureIds.add(figure.id);
      target.push(figureToMarkdown(renderFigureText(figure)));
      nodeTarget.push(figureNode(renderFigureText(figure)));
    }

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
    if (placedFigureIds.has(figure.id)) continue;
    mainBlocks.push(figureToMarkdown(renderFigureText(figure)));
    mainNodes.push(figureNode(renderFigureText(figure)));
  }
  for (const figure of supplementFigures) {
    if (placedFigureIds.has(figure.id)) continue;
    supplementBlocks.push(figureToMarkdown(renderFigureText(figure)));
    supplementNodes.push(figureNode(renderFigureText(figure)));
  }

  // Bibliography.
  const bibliography =
    citationFormatting?.bibliography ??
    formatBibliography(context, orderedKeys);
  if (bibliography.length > 0) {
    const bibBlock = [
      '## References',
      '',
      // Citeproc entries carry CSL markup (italics); fallback entries are
      // already plain markdown.
      ...bibliography.map((entry) =>
        entry.html !== undefined
          ? bibliographyHtmlToMarkdown(entry.html)
          : entry.text,
      ),
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

  // Off the resolved list, never the raw records: when this journal has its own
  // version of the abstract, that is the text its word cap has to judge — and
  // the text the submission readiness check reads back off the bundle.
  const abstractSection = sections.find(
    (section) => section.sectionType === 'ABSTRACT',
  );
  const abstract = (abstractSection?.content ?? '').trim();
  const keywordsSection = sections.find(
    (section) => section.sectionType === 'KEYWORDS',
  );
  const keywords = (keywordsSection?.content ?? '')
    .replace(/^keywords?\s*:\s*/i, '')
    .split(/[;,\n]/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
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
      authors: input.authors ?? manuscript.authorLine ?? '',
      abstract,
      keywords,
      affiliations: manuscript.affiliations ?? '',
      titlePageExtraLines: manuscript.titlePageExtraLines ?? [],
      correspondingAuthor: manuscript.correspondingAuthor ?? '',
      supplementTitle: manuscript.supplementTitle?.trim() || '',
      supplementAuthors: manuscript.supplementAuthorLine?.trim() || '',
      supplementAffiliations: manuscript.supplementAffiliations?.trim() || '',
      journal: style.name ?? manuscript.targetVenue ?? '',
      citationStyleId: style.citationStyleId ?? '',
      citationMode: style.citationMode ?? 'NUMERIC',
    },
    style: { ...style },
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
    sourceInput: input,
  };
};
