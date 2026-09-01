import {
  BlockNoteEditor,
  BlockNoteSchema,
  createPageBreakBlockSpec,
  defaultBlockSpecs,
} from '@blocknote/core';
import { isNonEmptyString } from '@sniptt/guards';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { type ManuscriptBundle } from './manuscriptAssembly';
import { bibliographyHtmlToInlineRuns } from './manuscriptCitations';
import { formatManuscriptAuthorLine } from './manuscriptContributors';
import { resolveFigureImage } from './manuscriptImages';
import { wrapManuscriptScript } from './manuscriptScripts';
import { parseManuscriptTableGrid } from './manuscriptTableGrid';
import { titlePageSpacerLineCount } from './manuscriptTitlePage';
import { PRINTABLE_WIDTH_PX } from './manuscriptPageMetrics';
import { wrapAssetNumberAnchor } from './manuscriptAssetAnchors';
import {
  hasAuthoredSectionKey,
  UNNUMBERED_HEADING,
} from './manuscriptNumbering';
import { stripCrossReferenceAnchors } from './manuscriptCrossReference';
import { protectInlineMath, restoreInlineMath } from './manuscriptInlineMath';
import { type NumberedFigure } from './manuscriptTypes';

// Build a BlockNote document from the neutral document-node model. Shared by the
// DOCX and PDF exporters (and any future block-based engine) so figures become
// embedded images and tables become real tables in *both* outputs — one block
// builder, one source of truth.

const exportBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    pageBreak: createPageBreakBlockSpec(),
  },
});

const createExportEditor = () =>
  BlockNoteEditor.create({ schema: exportBlockNoteSchema });

type ExportEditor = ReturnType<typeof createExportEditor>;
type ExportPartialBlock = Parameters<ExportEditor['replaceBlocks']>[1][number];

const captionText = (figure: NumberedFigure): string =>
  [
    `${figure.label}.`,
    isNonEmptyString(figure.caption)
      ? figure.caption
      : isNonEmptyString(figure.name)
        ? figure.name
        : '',
    isNonEmptyString(figure.credit) ? `Credit: ${figure.credit}` : '',
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

// A printed label carries its asset's key behind an invisible marker, so the
// DOCX export can set that number as a Word field the rest of the document
// points at. Every other exporter strips the marker before it reaches a page.
const anchoredLabel = (figure: NumberedFigure): string => {
  const refKey = (figure.refKey ?? '').trim();
  return refKey.length === 0 || (figure.number ?? '').length === 0
    ? figure.label
    : `${wrapAssetNumberAnchor(refKey)}${figure.label}`;
};

const anchoredCaptionText = (figure: NumberedFigure): string =>
  captionText(figure).replace(figure.label, anchoredLabel(figure));

const figureCaptionBlock = (figure: NumberedFigure): ExportPartialBlock => ({
  type: 'paragraph',
  props: { textColor: 'figure-caption' },
  content: anchoredCaptionText(figure),
});

// What is printed beside one panel: its letter and its own words. The figure's
// number is not repeated here — the parent's caption carries "Figure 3" once,
// which is how a multi-panel figure is set.
const panelCaptionText = (panel: NumberedFigure): string =>
  [
    panel.label,
    isNonEmptyString(panel.caption)
      ? panel.caption
      : isNonEmptyString(panel.name)
        ? panel.name
        : '',
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

// A figure made of panels, for the two block-based targets. They share one
// BlockNote document and its blocks flow down the page — there is no container
// in that model that can hold two images side by side — so the row is drawn
// before this point, by `composeManuscriptFigurePanels`, which hands back a
// single figure. What is left here is what happens when that could not run
// (no browser, an image that would taint the canvas): the panels are still one
// figure under one number, set one above the other with their letters.
const panelsToBlocks = (
  figure: NumberedFigure,
  captionPosition: string | null | undefined,
): ExportPartialBlock[] => {
  const panelBlocks = (figure.panels ?? []).flatMap(
    (panel): ExportPartialBlock[] => {
      const image = resolveFigureImage(panel);
      if (image.kind === 'none') {
        return [
          {
            type: 'paragraph',
            props: { textColor: 'figure-caption' },
            content: panelCaptionText(panel),
          },
        ];
      }
      const widthPercent = Math.min(
        100,
        Math.max(10, panel.widthPercent ?? 100),
      );
      return [
        {
          type: 'image',
          props: {
            url: image.src,
            name: panel.altText ?? panel.name ?? '',
            caption: panelCaptionText(panel),
            previewWidth: Math.round(600 * (widthPercent / 100)),
          },
        },
      ];
    },
  );
  const caption = figureCaptionBlock(figure);
  return captionPosition === 'ABOVE'
    ? [caption, ...panelBlocks]
    : [...panelBlocks, caption];
};

const figureToBlocks = (
  figure: NumberedFigure,
  captionPosition: string | null | undefined,
): ExportPartialBlock[] => {
  if (isNonEmptyArray(figure.panels)) {
    return panelsToBlocks(figure, captionPosition);
  }
  const image = resolveFigureImage(figure);
  if (image.kind !== 'none') {
    const widthPercent = Math.min(
      100,
      Math.max(10, figure.widthPercent ?? 100),
    );
    const imageBlock: ExportPartialBlock = {
      type: 'image',
      props: {
        url: image.src,
        name: figure.altText ?? figure.name ?? '',
        caption: captionPosition === 'ABOVE' ? '' : anchoredCaptionText(figure),
        // BlockNote otherwise exports at the image's raw pixel width. Keep
        // figures within the 624 px printable column of a Letter page.
        previewWidth: Math.round(600 * (widthPercent / 100)),
      },
    };
    return captionPosition === 'ABOVE'
      ? [figureCaptionBlock(figure), imageBlock]
      : [imageBlock];
  }
  return [figureCaptionBlock(figure)];
};

const tableCaptionBlock = (figure: NumberedFigure): ExportPartialBlock => ({
  type: 'paragraph',
  props: { textColor: 'table-caption' },
  content: anchoredCaptionText(figure),
});

// A numbered equation travels to the DOCX mapper as a single 'equation'
// paragraph, so the LaTeX body and its label share one line. BlockNote props
// are a closed set, so the label rides in the content behind an invisible
// separator that cannot occur in LaTeX.
export const EQUATION_LABEL_SEPARATOR = '⁣';

const equationToBlocks = (figure: NumberedFigure): ExportPartialBlock[] => {
  const latex = (figure.equationLatex ?? '').trim();
  if (latex.length === 0) return [];
  const blocks: ExportPartialBlock[] = [
    {
      type: 'paragraph',
      props: { textColor: 'equation' },
      content: `${latex}${EQUATION_LABEL_SEPARATOR}${anchoredLabel(figure)}`,
    },
  ];
  if (isNonEmptyString(figure.caption)) {
    blocks.push({
      type: 'paragraph',
      props: { textColor: 'table-caption' },
      content: figure.caption,
    });
  }
  return blocks;
};

const tableToBlocks = (
  figure: NumberedFigure,
  captionPosition: string | null | undefined,
): ExportPartialBlock[] => {
  const blocks: ExportPartialBlock[] = [];
  if (captionPosition !== 'BELOW') blocks.push(tableCaptionBlock(figure));
  const grid = parseManuscriptTableGrid(figure.tableData);
  if (grid.rows.length > 0 && grid.columnCount > 0) {
    // BlockNote's DOCX mapper treats these values as CSS pixels and converts
    // them to twips, so this is the usable width of the page with one-inch
    // margins — it stops tables shrinking to fit their content. A4 is the
    // narrower of the two page sizes the exporters produce, so it sets the
    // number: 600 px is 450 pt, and A4 less its margins is 451.
    const columnWidth = Math.floor(PRINTABLE_WIDTH_PX / grid.columnCount);
    blocks.push({
      type: 'table',
      content: {
        type: 'tableContent',
        columnWidths: Array.from(
          { length: grid.columnCount },
          () => columnWidth,
        ),
        headerRows: grid.headerRows,
        // Covered cells are already folded into their anchor, so a merged
        // header reaches Word as one cell with a real gridSpan.
        rows: grid.rows.map((cells) => ({
          cells: cells.map((cell) => ({
            type: 'tableCell' as const,
            props: { colspan: cell.colSpan, rowspan: cell.rowSpan },
            content: [
              {
                type: 'text' as const,
                // A cell prints the resolved label; Word's field machinery
                // does not run inside the grid.
                text: stripCrossReferenceAnchors(cell.text),
                styles: {},
              },
            ],
          })),
        })),
      },
    });
  }
  if (captionPosition === 'BELOW') blocks.push(tableCaptionBlock(figure));
  return blocks;
};

// Put the maths back into whatever the Markdown parser produced, wherever it
// ended up — inside emphasis, a list item, a link label.
const restoreBlockMath = (
  block: ExportPartialBlock,
  math: readonly string[],
): ExportPartialBlock => {
  if (math.length === 0) return block;
  const restore = (value: unknown): unknown => {
    if (typeof value === 'string') return restoreInlineMath(value, math);
    if (Array.isArray(value)) return value.map(restore);
    if (typeof value !== 'object' || value === null) return value;
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = { ...record };
    if ('text' in record) next.text = restore(record.text);
    if ('content' in record) next.content = restore(record.content);
    if ('children' in record) next.children = restore(record.children);
    return next;
  };
  return restore(block) as ExportPartialBlock;
};

const parseProse = (
  editor: ExportEditor,
  markdown: string,
  paragraphProps: Record<string, unknown>,
): ExportPartialBlock[] => {
  const { text, math } = protectInlineMath(markdown);
  return editor.tryParseMarkdownToBlocks(text).map((block) => {
    const restored = restoreBlockMath(block, math);
    return restored.type === 'paragraph'
      ? { ...restored, props: { ...restored.props, ...paragraphProps } }
      : restored;
  });
};

const proseToBlocks = (
  editor: ExportEditor,
  markdown: string,
  bodyAlignment: 'left' | 'justify',
  isAbstract: boolean,
): ExportPartialBlock[] => {
  const blocks: ExportPartialBlock[] = [];
  const paragraphProps = {
    textAlignment: bodyAlignment,
    ...(isAbstract ? { textColor: 'abstract-body' } : {}),
  } as const;
  const displayMath = /\$\$([\s\S]*?)\$\$/g;
  let cursor = 0;

  for (const match of markdown.matchAll(displayMath)) {
    const index = match.index ?? 0;
    const preceding = markdown.slice(cursor, index).trim();
    if (preceding.length > 0) {
      blocks.push(...parseProse(editor, preceding, paragraphProps));
    }
    const equation = match[1].trim();
    if (equation.length > 0) {
      blocks.push({
        type: 'paragraph',
        props: { ...paragraphProps, textColor: 'equation' },
        content: equation,
      });
    }
    cursor = index + match[0].length;
  }

  const remaining = markdown.slice(cursor).trim();
  if (remaining.length > 0) {
    blocks.push(...parseProse(editor, remaining, paragraphProps));
  }
  return blocks;
};

const pageBreakBlock = (): ExportPartialBlock => ({ type: 'pageBreak' });

// A blank centred paragraph — the vertical space a cover page is built from.
// A no-break space, not an empty string: react-pdf gives a text node with no
// characters no line box at all, so an empty paragraph was worth nothing and a
// twelve-line gap collapsed to almost nothing.
const titlePageSpacerBlock = (): ExportPartialBlock => ({
  type: 'paragraph',
  props: { textAlignment: 'center', textColor: 'title-line' },
  content: '\u00a0',
});

const numberNestedHeadings = (
  markdown: string,
  sectionNumber: number | null,
  initialNestedNumber: number,
): { markdown: string; nestedNumber: number } => {
  if (sectionNumber === null) {
    return { markdown, nestedNumber: initialNestedNumber };
  }
  let nestedNumber = initialNestedNumber;
  return {
    markdown: markdown.replace(
      /^(#{3,6})\s+(?!\d+(?:\.\d+)+\.?\s)(.+)$/gm,
      (_heading, hashes: string, title: string) => {
        nestedNumber += 1;
        return `${hashes} ${sectionNumber}.${nestedNumber} ${title}`;
      },
    ),
    nestedNumber,
  };
};

const affiliationParagraph = (
  content: string,
  textAlignment: 'left' | 'center' | 'right',
  useSuperscriptNumber: boolean,
): ExportPartialBlock => ({
  type: 'paragraph',
  props: { textAlignment, textColor: 'affiliation-line' },
  content: [
    {
      type: 'text',
      text: useSuperscriptNumber
        ? content.replace(/^(\d+)(?=\s)/, (number) =>
            wrapManuscriptScript(number, 'SUPERSCRIPT'),
          )
        : content,
      styles: { italic: true },
    },
  ],
});

// The printed section number, carrying the section's key behind an invisible
// marker so the DOCX export can set it as a Word field the sentences that
// refer to it point at — the same treatment a figure's number gets.
const numberedHeadingPrefix = (
  node: { section?: { id: string; referenceKey: string } },
  printedNumber: string,
): string => {
  const section = node.section;
  return section === undefined || !hasAuthoredSectionKey(section)
    ? `${printedNumber}. `
    : `${wrapAssetNumberAnchor(section.referenceKey)}${printedNumber}. `;
};

const bundleToBlocks = (
  editor: ExportEditor,
  bundle: ManuscriptBundle,
): ExportPartialBlock[] => {
  // A thesis cover page centres everything and separates its groups with
  // deliberate vertical space; a journal masthead runs the affiliations under
  // the author line in the journal's own alignment.
  const isThesisTitlePage = bundle.style.titlePageTemplate === 'THESIS';
  const blocks: ExportPartialBlock[] = [
    {
      type: 'heading',
      props: { level: 1, textAlignment: 'center' },
      content: bundle.metadata.title,
    },
  ];
  if (isThesisTitlePage) blocks.push(titlePageSpacerBlock());
  if (isNonEmptyString(bundle.metadata.authors)) {
    blocks.push({
      type: 'paragraph',
      props: { textAlignment: 'center', textColor: 'author-line' },
      content: [
        {
          type: 'text',
          text: formatManuscriptAuthorLine(
            bundle.metadata.authors,
            bundle.metadata.affiliations,
          ),
          styles: { bold: true },
        },
      ],
    });
  }
  const affiliationAlignment = isThesisTitlePage
    ? 'center'
    : bundle.style.affiliationAlignment === 'CENTER'
      ? 'center'
      : bundle.style.affiliationAlignment === 'RIGHT'
        ? 'right'
        : 'left';
  if (isNonEmptyString(bundle.metadata.affiliations)) {
    blocks.push(
      ...bundle.metadata.affiliations
        .split(/\r?\n|[;,]\s*(?=\d+\s)/)
        .map((affiliation) => affiliation.trim())
        .filter((affiliation) => affiliation.length > 0)
        .map((affiliation) =>
          affiliationParagraph(
            affiliation,
            affiliationAlignment,
            !isThesisTitlePage &&
              bundle.style.affiliationNumberStyle !== 'BASELINE',
          ),
        ),
    );
  }
  blocks.push(
    ...bundle.metadata.titlePageExtraLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .flatMap((line): ExportPartialBlock[] => {
        // A `---` line is vertical space, which is how a cover page pushes its
        // degree and institution blocks apart; `--- 6` is six of them.
        const spacerLines = titlePageSpacerLineCount(line);
        return spacerLines === null
          ? [
              {
                type: 'paragraph',
                props: {
                  textAlignment: affiliationAlignment,
                  textColor: 'title-line',
                },
                content: line,
              },
            ]
          : Array.from({ length: spacerLines }, titlePageSpacerBlock);
      }),
  );
  if (isNonEmptyString(bundle.metadata.correspondingAuthor)) {
    blocks.push({
      type: 'paragraph',
      props: { textAlignment: 'center' },
      content: bundle.metadata.correspondingAuthor,
    });
  }

  const frontMatterLayout = bundle.style.frontMatterLayout ?? 'INLINE';
  // Two independent decisions: does the body start after the title block, and
  // does it start after the abstract. "Separate title and abstract" is both.
  const breaksAfterTitlePage =
    frontMatterLayout === 'SEPARATE_TITLE_PAGE' ||
    frontMatterLayout === 'SEPARATE_TITLE_AND_ABSTRACT';
  const breaksAfterAbstract =
    frontMatterLayout === 'TITLE_WITH_ABSTRACT' ||
    frontMatterLayout === 'SEPARATE_TITLE_AND_ABSTRACT';
  if (breaksAfterTitlePage) {
    blocks.push(pageBreakBlock());
  }

  let sectionNumber = 0;
  let currentNumberedSection: number | null = null;
  let currentNestedNumber = 0;
  let abstractSeen = false;
  let currentSectionIsAbstract = false;
  let bodyPageStarted = !breaksAfterAbstract;
  const bodyAlignment =
    bundle.style.bodyAlignment === 'JUSTIFIED' ? 'justify' : 'left';
  const figurePageLayout = bundle.style.figurePageLayout ?? 'INLINE';
  const supplementStartsOnNewPage = ['NEW_COVER_PAGE', 'NEW_PAGE'].includes(
    bundle.style.supplementStartLayout ?? '',
  );
  const includeSupplementCover =
    bundle.style.supplementCoverPage ??
    bundle.style.supplementStartLayout === 'NEW_COVER_PAGE';
  let preparedSupplementCoverNeedsTrailingPageBreak = false;
  const pushPageBreakUnlessPresent = () => {
    if (blocks[blocks.length - 1]?.type !== 'pageBreak') {
      blocks.push(pageBreakBlock());
    }
  };

  for (let nodeIndex = 0; nodeIndex < bundle.nodes.length; nodeIndex += 1) {
    const node = bundle.nodes[nodeIndex];
    switch (node.kind) {
      case 'heading':
        if (
          /^(supplementary material|supplementary information)$/i.test(
            node.text.trim(),
          )
        ) {
          if (supplementStartsOnNewPage) pushPageBreakUnlessPresent();
          const nextNode = bundle.nodes[nodeIndex + 1];
          const hasPreparedSupplementCover =
            (nextNode?.kind === 'prose' &&
              /^\s*Supplemental Information for\b/i.test(nextNode.markdown)) ||
            (nextNode?.kind === 'heading' &&
              /^\s*Supplemental Information for\b/i.test(nextNode.text));

          if (includeSupplementCover && !hasPreparedSupplementCover) {
            const supplementTitle =
              bundle.metadata.supplementTitle || bundle.metadata.title;
            const supplementAuthors =
              bundle.metadata.supplementAuthors || bundle.metadata.authors;
            const supplementAffiliations =
              bundle.metadata.supplementAffiliations ||
              bundle.metadata.affiliations;
            blocks.push({
              type: 'paragraph',
              props: { textAlignment: 'center' },
              content: 'Supplemental Information for',
            });
            blocks.push({
              type: 'heading',
              props: { level: 1, textAlignment: 'center' },
              content: supplementTitle,
            });
            if (isNonEmptyString(supplementAuthors)) {
              blocks.push({
                type: 'paragraph',
                props: { textAlignment: 'center', textColor: 'author-line' },
                content: [
                  {
                    type: 'text',
                    text: formatManuscriptAuthorLine(
                      supplementAuthors,
                      supplementAffiliations,
                    ),
                    styles: { bold: true },
                  },
                ],
              });
            }
            if (isNonEmptyString(supplementAffiliations)) {
              const affiliationAlignment =
                bundle.style.affiliationAlignment === 'CENTER'
                  ? 'center'
                  : bundle.style.affiliationAlignment === 'RIGHT'
                    ? 'right'
                    : 'left';
              blocks.push(
                ...supplementAffiliations
                  .split(/\r?\n|[;,]\s*(?=\d+\s)/)
                  .map((affiliation) => affiliation.trim())
                  .filter((affiliation) => affiliation.length > 0)
                  .map((affiliation) =>
                    affiliationParagraph(
                      affiliation,
                      affiliationAlignment,
                      bundle.style.affiliationNumberStyle !== 'BASELINE',
                    ),
                  ),
              );
            }
            pushPageBreakUnlessPresent();
          }
          preparedSupplementCoverNeedsTrailingPageBreak =
            includeSupplementCover && hasPreparedSupplementCover;
          if (includeSupplementCover || hasPreparedSupplementCover) break;
        }
        if (
          breaksAfterAbstract &&
          abstractSeen &&
          !/^(abstract|keywords)$/i.test(node.text.trim()) &&
          !bodyPageStarted
        ) {
          blocks.push(pageBreakBlock());
          bodyPageStarted = true;
        }
        currentSectionIsAbstract = /^abstract$/i.test(node.text.trim());
        if (currentSectionIsAbstract) abstractSeen = true;
        // The number is not worked out here. A heading the bundle built from
        // a section arrives carrying the one the section counter assigned, so
        // that a `[#sec:…]` resolved against that counter and the number
        // printed on the page cannot be two different opinions. Only a heading
        // with no section behind it — the generated References title, the
        // "Notes" list the PDF export appends — is still counted here, exactly
        // as every heading used to be.
        const assignedNumber = node.section?.number;
        const countedNumber =
          bundle.style.sectionNumbering === true &&
          node.level === 2 &&
          !UNNUMBERED_HEADING.test(node.text.trim())
            ? String(sectionNumber + 1)
            : '';
        const printedNumber = assignedNumber ?? countedNumber;
        if (printedNumber.length > 0) {
          sectionNumber = Number(printedNumber);
          currentNumberedSection = sectionNumber;
          currentNestedNumber = 0;
        } else if (node.level <= 2) {
          currentNumberedSection = null;
          currentNestedNumber = 0;
        }
        blocks.push({
          type: 'heading',
          props: { level: node.level },
          content:
            printedNumber.length === 0
              ? node.text
              : `${numberedHeadingPrefix(node, printedNumber)}${node.text}`,
        });
        break;
      case 'prose':
        const numberedProse = numberNestedHeadings(
          node.markdown,
          currentNumberedSection,
          currentNestedNumber,
        );
        currentNestedNumber = numberedProse.nestedNumber;
        blocks.push(
          ...proseToBlocks(
            editor,
            numberedProse.markdown,
            bodyAlignment,
            currentSectionIsAbstract,
          ),
        );
        if (preparedSupplementCoverNeedsTrailingPageBreak) {
          pushPageBreakUnlessPresent();
          preparedSupplementCoverNeedsTrailingPageBreak = false;
        }
        break;
      case 'figure':
        const isolateFigureOnPage =
          figurePageLayout === 'ONE_PER_PAGE' ||
          (figurePageLayout === 'SUPPLEMENT_ONE_PER_PAGE' &&
            node.figure.placement === 'SUPPLEMENT');
        if (isolateFigureOnPage) pushPageBreakUnlessPresent();
        blocks.push(
          ...figureToBlocks(
            node.figure,
            bundle.style.figureCaptionPosition ?? 'BELOW',
          ),
        );
        if (isolateFigureOnPage && nodeIndex < bundle.nodes.length - 1) {
          pushPageBreakUnlessPresent();
        }
        break;
      case 'table':
        blocks.push(
          ...tableToBlocks(
            node.figure,
            bundle.style.tableCaptionPosition ?? 'ABOVE',
          ),
        );
        break;
      case 'equation':
        blocks.push(...equationToBlocks(node.figure));
        break;
      case 'bibliography':
        for (const entry of node.entries) {
          blocks.push({
            type: 'paragraph',
            content:
              entry.html !== undefined
                ? bibliographyHtmlToInlineRuns(entry.html)
                : entry.text,
          });
        }
        break;
    }
  }
  return blocks;
};

// Create a headless editor and normalize the partial blocks into full blocks.
// Returns both so an exporter can read `editor.schema` for its mappings.
export const buildBlockNoteDocument = (bundle: ManuscriptBundle) => {
  const editor = createExportEditor();
  editor.replaceBlocks(editor.document, bundleToBlocks(editor, bundle));
  return { editor, blocks: editor.document };
};
