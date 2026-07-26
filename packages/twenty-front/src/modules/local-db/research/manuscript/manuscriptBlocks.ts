import {
  BlockNoteEditor,
  BlockNoteSchema,
  createPageBreakBlockSpec,
  defaultBlockSpecs,
} from '@blocknote/core';
import { isNonEmptyString } from '@sniptt/guards';

import { type ManuscriptBundle } from './manuscriptAssembly';
import { formatManuscriptAuthorLine } from './manuscriptContributors';
import { resolveFigureImage } from './manuscriptImages';
import { wrapManuscriptScript } from './manuscriptScripts';
import { parseMarkdownTable } from './manuscriptTables';
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

const figureCaptionBlock = (figure: NumberedFigure): ExportPartialBlock => ({
  type: 'paragraph',
  props: { textColor: 'figure-caption' },
  content: captionText(figure),
});

const figureToBlocks = (
  figure: NumberedFigure,
  captionPosition: string | null | undefined,
): ExportPartialBlock[] => {
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
        caption: captionPosition === 'ABOVE' ? '' : captionText(figure),
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
  content: captionText(figure),
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
      content: `${latex}${EQUATION_LABEL_SEPARATOR}${figure.label}`,
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
  const rows = parseMarkdownTable(figure.tableData);
  if (rows.length > 0) {
    // BlockNote's DOCX mapper treats these values as CSS pixels and converts
    // them to twips. 624 px maps to the 9,360 DXA usable width of a Letter page
    // with one-inch margins, preventing narrow content-sized tables.
    const columnCount = Math.max(...rows.map((cells) => cells.length));
    const columnWidth = Math.floor(624 / columnCount);
    blocks.push({
      type: 'table',
      content: {
        type: 'tableContent',
        columnWidths: Array.from({ length: columnCount }, () => columnWidth),
        headerRows: 1,
        rows: rows.map((cells) => ({ cells })),
      },
    });
  }
  if (captionPosition === 'BELOW') blocks.push(tableCaptionBlock(figure));
  return blocks;
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
      blocks.push(
        ...editor.tryParseMarkdownToBlocks(preceding).map((block) =>
          block.type === 'paragraph'
            ? {
                ...block,
                props: { ...block.props, ...paragraphProps },
              }
            : block,
        ),
      );
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
    blocks.push(
      ...editor.tryParseMarkdownToBlocks(remaining).map((block) =>
        block.type === 'paragraph'
          ? {
              ...block,
              props: { ...block.props, ...paragraphProps },
            }
          : block,
      ),
    );
  }
  return blocks;
};

const pageBreakBlock = (): ExportPartialBlock => ({ type: 'pageBreak' });

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

const bundleToBlocks = (
  editor: ExportEditor,
  bundle: ManuscriptBundle,
): ExportPartialBlock[] => {
  const blocks: ExportPartialBlock[] = [
    {
      type: 'heading',
      props: { level: 1, textAlignment: 'center' },
      content: bundle.metadata.title,
    },
  ];
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
  const affiliationAlignment =
    bundle.style.affiliationAlignment === 'CENTER'
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
            bundle.style.affiliationNumberStyle !== 'BASELINE',
          ),
        ),
    );
  }
  blocks.push(
    ...bundle.metadata.titlePageExtraLines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map(
        (line): ExportPartialBlock => ({
          type: 'paragraph',
          props: { textAlignment: affiliationAlignment },
          content: line,
        }),
      ),
  );
  if (isNonEmptyString(bundle.metadata.correspondingAuthor)) {
    blocks.push({
      type: 'paragraph',
      props: { textAlignment: 'center' },
      content: bundle.metadata.correspondingAuthor,
    });
  }

  const frontMatterLayout = bundle.style.frontMatterLayout ?? 'INLINE';
  if (frontMatterLayout === 'SEPARATE_TITLE_PAGE') {
    blocks.push(pageBreakBlock());
  }

  let sectionNumber = 0;
  let currentNumberedSection: number | null = null;
  let currentNestedNumber = 0;
  let abstractSeen = false;
  let currentSectionIsAbstract = false;
  let bodyPageStarted = frontMatterLayout !== 'TITLE_WITH_ABSTRACT';
  const bodyAlignment =
    bundle.style.bodyAlignment === 'JUSTIFIED' ? 'justify' : 'left';
  const unnumberedHeading =
    /^(abstract|keywords|acknowledge?ments?|author contributions?|funding|competing interests?|conflicts? of interest|data availability|references|supplementary material|appendix(?:\s+[A-Z0-9]+)?(?:[.:]\s*.*)?)$/i;

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
          frontMatterLayout === 'TITLE_WITH_ABSTRACT' &&
          abstractSeen &&
          !/^(abstract|keywords)$/i.test(node.text.trim()) &&
          !bodyPageStarted
        ) {
          blocks.push(pageBreakBlock());
          bodyPageStarted = true;
        }
        currentSectionIsAbstract = /^abstract$/i.test(node.text.trim());
        if (currentSectionIsAbstract) abstractSeen = true;
        if (
          bundle.style.sectionNumbering === true &&
          node.level === 2 &&
          !unnumberedHeading.test(node.text.trim())
        ) {
          sectionNumber += 1;
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
            bundle.style.sectionNumbering === true &&
            node.level === 2 &&
            !unnumberedHeading.test(node.text.trim())
              ? `${sectionNumber}. ${node.text}`
              : node.text,
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
          blocks.push({ type: 'paragraph', content: entry.text });
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
