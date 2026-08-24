import {
  parseImportedAssetCaption,
  parseMarkdownDocument,
  type ImportedDocument,
  type WordMarkdownBlock,
} from './manuscriptDocImport';
import { parseMarkdownTable } from './manuscriptTables';

export type ImportedSourceInfo = Pick<
  ImportedDocument,
  | 'title'
  | 'authorLine'
  | 'affiliations'
  | 'correspondingAuthor'
  | 'titlePageExtraLines'
  | 'warnings'
  | 'stats'
  | 'sourceStylesXml'
  | 'sourceDocumentName'
>;

export type ImportBlockRole =
  | 'heading'
  | 'body'
  | 'caption'
  | 'image'
  | 'table'
  | 'equation';

export type ImportBlock = {
  id: string;
  index: number;
  role: ImportBlockRole;
  headingLevel?: number;
  markdown: string;
  text: string;
  sourceStyleName?: string;
  imageDataUrl?: string;
  captionGuess?: {
    kind: 'FIGURE' | 'TABLE';
    sourceLabel?: string;
  };
  roleConfidence: 'certain' | 'inferred';
};

export type ImportBlockOverride = {
  role?: ImportBlockRole;
  headingLevel?: number;
  excluded?: boolean;
  linkedAssetBlockId?: string;
  assetKind?: 'FIGURE' | 'TABLE';
  markdown?: string;
};

export type ImportBlockOverrides = Record<string, ImportBlockOverride>;

const HEADING_LINE = /^(#{1,6})\s+(.*\S)\s*$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\((data:image\/[^)]+)\)$/i;
const EQUATION_BLOCK = /^\$\$([\s\S]*?)\$\$$/;
const EQUATION_SEGMENT = /\$\$[\s\S]*?\$\$/g;
const TABLE_SEPARATOR = /^\|?[\s:|-]+\|?$/;
const BOILERPLATE_CAPTION =
  /^Figure 1\. Type your caption here\. Obtain permission and include the acknowledgement required by the copyright holder if a figure is being reproduced from another source\.?$/i;

type CaptionGuess = NonNullable<ImportBlock['captionGuess']>;

type WarningSource = {
  message: string;
  blockIds: string[];
};

const isTableLine = (line: string): boolean => line.trim().includes('|');

const isGfmTableBlock = (markdown: string): boolean => {
  const lines = markdown.trim().split('\n');
  return (
    lines.length >= 2 &&
    lines.every(isTableLine) &&
    lines.some((line) => TABLE_SEPARATOR.test(line.trim()))
  );
};

const explicitCaptionGuess = (text: string): CaptionGuess | null => {
  for (const kind of ['FIGURE', 'TABLE'] as const) {
    const caption = parseImportedAssetCaption(text, kind);
    if (caption?.explicitLabel === true) {
      return {
        kind,
        ...(caption.sourceLabel !== undefined
          ? { sourceLabel: caption.sourceLabel }
          : {}),
      };
    }
  }
  return null;
};

const styledCaptionGuess = (text: string): CaptionGuess => {
  const kind = /^\s*(?:table|tbl)\b/i.test(text) ? 'TABLE' : 'FIGURE';
  const caption = parseImportedAssetCaption(text, kind);
  return {
    kind,
    ...(caption?.sourceLabel !== undefined
      ? { sourceLabel: caption.sourceLabel }
      : {}),
  };
};

const blockText = (markdown: string, role: ImportBlockRole): string => {
  if (role === 'heading') {
    return markdown.replace(/^#{1,6}\s+/, '').trim();
  }
  if (role === 'image') {
    return IMAGE_LINE.exec(markdown.trim())?.[1]?.trim() ?? '';
  }
  if (role === 'equation') {
    return EQUATION_BLOCK.exec(markdown.trim())?.[1]?.trim() ?? markdown.trim();
  }
  return markdown.trim();
};

const classifyBlock = (
  markdown: string,
  wordBlock?: WordMarkdownBlock,
): Omit<ImportBlock, 'id' | 'index' | 'markdown' | 'text'> => {
  const normalized = markdown.trim();
  const heading = HEADING_LINE.exec(normalized);
  if (heading !== null) {
    return {
      role: 'heading',
      headingLevel: heading[1].length,
      roleConfidence:
        wordBlock?.headingSource === 'style' ? 'certain' : 'inferred',
      ...(wordBlock?.styleName !== undefined
        ? { sourceStyleName: wordBlock.styleName }
        : {}),
    };
  }

  const image = IMAGE_LINE.exec(normalized);
  if (image !== null) {
    return {
      role: 'image',
      imageDataUrl: image[2],
      roleConfidence: 'certain',
      ...(wordBlock?.styleName !== undefined
        ? { sourceStyleName: wordBlock.styleName }
        : {}),
    };
  }

  if (wordBlock?.kind === 'table' || isGfmTableBlock(normalized)) {
    return {
      role: 'table',
      roleConfidence: 'certain',
      ...(wordBlock?.styleName !== undefined
        ? { sourceStyleName: wordBlock.styleName }
        : {}),
    };
  }

  if (EQUATION_BLOCK.test(normalized)) {
    return {
      role: 'equation',
      roleConfidence: 'certain',
      ...(wordBlock?.styleName !== undefined
        ? { sourceStyleName: wordBlock.styleName }
        : {}),
    };
  }

  const isStyledCaption = /^caption$/i.test(wordBlock?.styleName ?? '');
  const captionGuess = isStyledCaption
    ? styledCaptionGuess(normalized)
    : explicitCaptionGuess(normalized);
  if (captionGuess !== null) {
    return {
      role: 'caption',
      captionGuess,
      roleConfidence: isStyledCaption ? 'certain' : 'inferred',
      ...(wordBlock?.styleName !== undefined
        ? { sourceStyleName: wordBlock.styleName }
        : {}),
    };
  }

  return {
    role: 'body',
    roleConfidence: 'certain',
    ...(wordBlock?.styleName !== undefined
      ? { sourceStyleName: wordBlock.styleName }
      : {}),
  };
};

const isLegacyDiscardedBlock = (markdown: string): boolean => {
  const normalized = markdown.trim();
  return (
    normalized.length === 0 ||
    /^#{1,6}\s*$/.test(normalized) ||
    BOILERPLATE_CAPTION.test(normalized)
  );
};

const appendBlock = (
  blocks: ImportBlock[],
  markdown: string,
  wordBlock?: WordMarkdownBlock,
): void => {
  if (isLegacyDiscardedBlock(markdown)) return;
  const normalized = markdown.trim();
  const classification = classifyBlock(normalized, wordBlock);
  const index = blocks.length;
  blocks.push({
    id: `import-block-${index}`,
    index,
    markdown: normalized,
    text: blockText(normalized, classification.role),
    ...classification,
  });
};

const splitNonEquationGroup = (group: string): string[] => {
  const normalized = group.trim();
  if (normalized.length === 0) return [];

  const lines = normalized.split('\n');
  if (
    lines.every(isTableLine) &&
    lines.some((line) => TABLE_SEPARATOR.test(line.trim()))
  ) {
    return [normalized];
  }

  const segments: string[] = [];
  let proseLines: string[] = [];
  const flushProse = () => {
    const prose = proseLines.join('\n').trim();
    if (prose.length > 0) segments.push(prose);
    proseLines = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (isTableLine(line)) {
      let tableEnd = lineIndex;
      while (tableEnd < lines.length && isTableLine(lines[tableEnd])) {
        tableEnd += 1;
      }
      const tableLines = lines.slice(lineIndex, tableEnd);
      if (
        tableLines.some((tableLine) => TABLE_SEPARATOR.test(tableLine.trim()))
      ) {
        flushProse();
        segments.push(tableLines.join('\n').trim());
        lineIndex = tableEnd - 1;
        continue;
      }
    }

    const isStructuralLine =
      HEADING_LINE.test(line) ||
      IMAGE_LINE.test(line) ||
      EQUATION_BLOCK.test(line) ||
      explicitCaptionGuess(line) !== null;
    if (isStructuralLine) {
      flushProse();
      segments.push(line);
    } else {
      proseLines.push(lines[lineIndex]);
    }
  }
  flushProse();
  return segments;
};

const splitMarkdownGroup = (group: string): string[] => {
  const normalized = group.trim();
  if (normalized.length === 0) return [];

  const segments: string[] = [];
  let cursor = 0;
  for (const match of normalized.matchAll(EQUATION_SEGMENT)) {
    const matchIndex = match.index ?? 0;
    segments.push(
      ...splitNonEquationGroup(normalized.slice(cursor, matchIndex)),
    );
    segments.push(match[0].trim());
    cursor = matchIndex + match[0].length;
  }
  segments.push(...splitNonEquationGroup(normalized.slice(cursor)));
  return segments;
};

export const deriveImportBlocks = (
  wordBlocks: WordMarkdownBlock[],
): ImportBlock[] => {
  const blocks: ImportBlock[] = [];
  for (const wordBlock of wordBlocks) {
    if (wordBlock.kind === 'table') {
      appendBlock(blocks, wordBlock.markdown, wordBlock);
      continue;
    }
    for (const group of wordBlock.markdown.split(/\n\s*\n/)) {
      for (const segment of splitMarkdownGroup(group)) {
        appendBlock(blocks, segment, wordBlock);
      }
    }
  }
  return blocks;
};

export const deriveImportBlocksFromMarkdown = (text: string): ImportBlock[] => {
  const blocks: ImportBlock[] = [];
  const normalized = text.replace(/\r\n?/g, '\n');
  for (const group of normalized.split(/\n\s*\n/)) {
    for (const segment of splitMarkdownGroup(group)) {
      appendBlock(blocks, segment);
    }
  }
  return blocks;
};

const effectiveRole = (
  block: ImportBlock,
  overrides: ImportBlockOverrides,
): ImportBlockRole => overrides[block.id]?.role ?? block.role;

const stripMarkdownDelimiters = (markdown: string): string =>
  markdown
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\$+/, '')
    .replace(/\$+$/, '')
    .trim();

const captionKind = (
  block: ImportBlock,
  override: ImportBlockOverride,
  blocksById: Map<string, ImportBlock>,
  overrides: ImportBlockOverrides,
): 'FIGURE' | 'TABLE' => {
  if (override.assetKind !== undefined) return override.assetKind;
  if (block.captionGuess !== undefined) return block.captionGuess.kind;
  const linkedAsset =
    override.linkedAssetBlockId === undefined
      ? undefined
      : blocksById.get(override.linkedAssetBlockId);
  return linkedAsset !== undefined &&
    effectiveRole(linkedAsset, overrides) === 'table'
    ? 'TABLE'
    : 'FIGURE';
};

const captionNumber = (
  block: ImportBlock,
  override: ImportBlockOverride,
  kind: 'FIGURE' | 'TABLE',
  blocks: ImportBlock[],
  overrides: ImportBlockOverrides,
): number => {
  if (override.linkedAssetBlockId !== undefined) {
    const assets = blocks.filter((candidate) => {
      if (overrides[candidate.id]?.excluded === true) return false;
      const role = effectiveRole(candidate, overrides);
      return kind === 'TABLE' ? role === 'table' : role === 'image';
    });
    const assetIndex = assets.findIndex(
      (asset) => asset.id === override.linkedAssetBlockId,
    );
    if (assetIndex >= 0) return assetIndex + 1;
  }

  return (
    blocks.filter(
      (candidate) =>
        candidate.index <= block.index &&
        overrides[candidate.id]?.excluded !== true &&
        effectiveRole(candidate, overrides) === 'caption' &&
        captionKind(
          candidate,
          overrides[candidate.id] ?? {},
          new Map(blocks.map((item) => [item.id, item])),
          overrides,
        ) === kind,
    ).length || 1
  );
};

const serializeCaption = (
  block: ImportBlock,
  override: ImportBlockOverride,
  blocks: ImportBlock[],
  blocksById: Map<string, ImportBlock>,
  overrides: ImportBlockOverrides,
): string => {
  const markdown = (override.markdown ?? block.markdown).trim();
  const kind = captionKind(block, override, blocksById, overrides);
  const existingPrefix = /^(\s*)(?:fig(?:ure)?|table|tbl)(\b[\s\S]*)$/i.exec(
    markdown,
  );
  if (existingPrefix !== null) {
    return `${existingPrefix[1]}${kind === 'TABLE' ? 'Table' : 'Figure'}${existingPrefix[2]}`;
  }
  const number = captionNumber(block, override, kind, blocks, overrides);
  return `${kind === 'TABLE' ? 'Table' : 'Figure'} ${number}. ${stripMarkdownDelimiters(markdown)}`;
};

const serializeBlock = (
  block: ImportBlock,
  override: ImportBlockOverride,
  blocks: ImportBlock[],
  blocksById: Map<string, ImportBlock>,
  overrides: ImportBlockOverrides,
): string => {
  const role = override.role ?? block.role;
  const markdown = override.markdown ?? block.markdown;
  if (role === 'heading') {
    const headingLevel = override.headingLevel ?? block.headingLevel ?? 2;
    return `${'#'.repeat(headingLevel)} ${stripMarkdownDelimiters(markdown)}`;
  }
  if (role === 'equation') {
    return `$$${stripMarkdownDelimiters(markdown)}$$`;
  }
  if (role === 'caption') {
    return serializeCaption(block, override, blocks, blocksById, overrides);
  }
  if (role === 'body' && block.role === 'table') {
    return parseMarkdownTable(markdown)
      .map((row) => row.join(' '))
      .join('\n')
      .trim();
  }
  if (role === 'body' && block.role !== 'body') {
    return override.markdown ?? block.text;
  }
  return markdown.trim();
};

export const assembleImportedDocument = (
  blocks: ImportBlock[],
  overrides: ImportBlockOverrides,
  sourceInfo: ImportedSourceInfo = {},
): ImportedDocument => {
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const linkedCaptionsByAssetId = new Map<string, ImportBlock[]>();
  const isActiveAsset = (blockId: string): boolean => {
    const block = blocksById.get(blockId);
    if (block === undefined || overrides[blockId]?.excluded === true) {
      return false;
    }
    const role = effectiveRole(block, overrides);
    return role === 'image' || role === 'table';
  };

  for (const block of blocks) {
    const override = overrides[block.id] ?? {};
    if (
      override.excluded === true ||
      effectiveRole(block, overrides) !== 'caption' ||
      override.linkedAssetBlockId === undefined ||
      !isActiveAsset(override.linkedAssetBlockId)
    ) {
      continue;
    }
    const captions =
      linkedCaptionsByAssetId.get(override.linkedAssetBlockId) ?? [];
    captions.push(block);
    linkedCaptionsByAssetId.set(override.linkedAssetBlockId, captions);
  }

  const serializedBlocks: string[] = [];
  const suppressedAssetLineSignatures = new Set<string>();
  for (const block of blocks) {
    const override = overrides[block.id] ?? {};
    if (override.excluded === true) continue;
    if (
      effectiveRole(block, overrides) === 'caption' &&
      override.linkedAssetBlockId !== undefined &&
      isActiveAsset(override.linkedAssetBlockId)
    ) {
      continue;
    }
    const serializedBlock = serializeBlock(
      block,
      override,
      blocks,
      blocksById,
      overrides,
    );
    serializedBlocks.push(serializedBlock);
    // Demoted captions stay verbatim body text. Preparation uses these exact
    // signatures to avoid interpreting them as asset captions again.
    if (
      block.role === 'caption' &&
      effectiveRole(block, overrides) === 'body'
    ) {
      for (const line of serializedBlock.split('\n')) {
        const signature = line.trim();
        if (signature.length > 0) suppressedAssetLineSignatures.add(signature);
      }
    }
    for (const caption of linkedCaptionsByAssetId.get(block.id) ?? []) {
      serializedBlocks.push(
        serializeBlock(
          caption,
          overrides[caption.id] ?? {},
          blocks,
          blocksById,
          overrides,
        ),
      );
    }
  }

  const document = parseMarkdownDocument(serializedBlocks.join('\n\n'));
  return {
    ...document,
    ...(sourceInfo.title !== undefined ? { title: sourceInfo.title } : {}),
    ...(sourceInfo.authorLine !== undefined
      ? { authorLine: sourceInfo.authorLine }
      : {}),
    ...(sourceInfo.affiliations !== undefined
      ? { affiliations: sourceInfo.affiliations }
      : {}),
    ...(sourceInfo.correspondingAuthor !== undefined
      ? { correspondingAuthor: sourceInfo.correspondingAuthor }
      : {}),
    ...(sourceInfo.titlePageExtraLines !== undefined
      ? { titlePageExtraLines: sourceInfo.titlePageExtraLines }
      : {}),
    ...(sourceInfo.warnings !== undefined
      ? { warnings: sourceInfo.warnings }
      : {}),
    ...(sourceInfo.stats !== undefined ? { stats: sourceInfo.stats } : {}),
    ...(sourceInfo.sourceStylesXml !== undefined
      ? { sourceStylesXml: sourceInfo.sourceStylesXml }
      : {}),
    ...(sourceInfo.sourceDocumentName !== undefined
      ? { sourceDocumentName: sourceInfo.sourceDocumentName }
      : {}),
    ...(suppressedAssetLineSignatures.size > 0
      ? {
          suppressedAssetLineSignatures: [...suppressedAssetLineSignatures],
        }
      : {}),
  };
};

export const linkImportCaptionOverride = (
  overrides: ImportBlockOverrides,
  captionBlockId: string,
  linkedAssetBlockId: string,
  assetKind: 'FIGURE' | 'TABLE',
): ImportBlockOverrides => {
  const next = { ...overrides };
  for (const [blockId, override] of Object.entries(next)) {
    if (
      blockId === captionBlockId ||
      override.linkedAssetBlockId !== linkedAssetBlockId
    ) {
      continue;
    }
    const {
      linkedAssetBlockId: _linkedAssetBlockId,
      assetKind: _assetKind,
      ...remainingOverride
    } = override;
    if (Object.keys(remainingOverride).length === 0) {
      delete next[blockId];
    } else {
      next[blockId] = remainingOverride;
    }
  }
  next[captionBlockId] = {
    ...next[captionBlockId],
    linkedAssetBlockId,
    assetKind,
  };
  return next;
};

const importBlockWarningSources = (
  blocks: ImportBlock[],
  overrides: ImportBlockOverrides,
): WarningSource[] => {
  const activeBlocks = blocks.filter(
    (block) => overrides[block.id]?.excluded !== true,
  );
  const blocksById = new Map(activeBlocks.map((block) => [block.id, block]));
  const captions = activeBlocks.filter(
    (block) => effectiveRole(block, overrides) === 'caption',
  );
  const assets = activeBlocks.filter((block) => {
    const role = effectiveRole(block, overrides);
    return role === 'image' || role === 'table';
  });
  const linkedAssetIds = new Set<string>();
  const captionsByLinkedAssetId = new Map<string, ImportBlock[]>();
  const warningSources: WarningSource[] = [];

  for (const caption of captions) {
    const linkedAssetId = overrides[caption.id]?.linkedAssetBlockId;
    const adjacentAsset = assets.find(
      (asset) => Math.abs(asset.index - caption.index) === 1,
    );
    const assetId =
      linkedAssetId !== undefined && blocksById.has(linkedAssetId)
        ? linkedAssetId
        : adjacentAsset?.id;
    if (assetId === undefined) {
      warningSources.push({
        message: `Caption block ${caption.index + 1} is not linked to an image or table.`,
        blockIds: [caption.id],
      });
    } else {
      linkedAssetIds.add(assetId);
      if (linkedAssetId !== undefined) {
        captionsByLinkedAssetId.set(linkedAssetId, [
          ...(captionsByLinkedAssetId.get(linkedAssetId) ?? []),
          caption,
        ]);
      }
    }
  }

  for (const [assetId, matchingCaptions] of captionsByLinkedAssetId) {
    if (matchingCaptions.length < 2) continue;
    const asset = blocksById.get(assetId);
    const assetRole =
      asset === undefined ? 'image' : effectiveRole(asset, overrides);
    warningSources.push({
      message: `${matchingCaptions.length} captions are linked to ${assetRole === 'table' ? 'table' : 'image'} block ${(asset?.index ?? 0) + 1}. Only one caption can be used.`,
      blockIds: [
        ...matchingCaptions.map((caption) => caption.id),
        ...(asset === undefined ? [] : [asset.id]),
      ],
    });
  }

  for (const asset of assets) {
    if (!linkedAssetIds.has(asset.id)) {
      warningSources.push({
        message: `${effectiveRole(asset, overrides) === 'table' ? 'Table' : 'Image'} block ${asset.index + 1} has no caption.`,
        blockIds: [asset.id],
      });
    }
    if (asset.imageDataUrl?.startsWith('data:image/tiff') === true) {
      warningSources.push({
        message: `TIFF image block ${asset.index + 1} cannot be previewed reliably.`,
        blockIds: [asset.id],
      });
    }
  }

  const captionsByLabel = new Map<string, ImportBlock[]>();
  for (const caption of captions) {
    const guess = caption.captionGuess;
    if (guess?.sourceLabel === undefined) continue;
    const label = `${guess.kind === 'TABLE' ? 'Table' : 'Figure'} ${guess.sourceLabel}`;
    captionsByLabel.set(label, [
      ...(captionsByLabel.get(label) ?? []),
      caption,
    ]);
  }
  for (const [label, matchingCaptions] of captionsByLabel) {
    if (matchingCaptions.length < 2) continue;
    warningSources.push({
      message: `${matchingCaptions.length} captions are labeled "${label}". Cross-references link to the first.`,
      blockIds: matchingCaptions.map((caption) => caption.id),
    });
  }

  const headings = activeBlocks.filter(
    (block) => effectiveRole(block, overrides) === 'heading',
  );
  if (headings.length < 2) {
    warningSources.push({
      message: `Only ${headings.length} heading${headings.length === 1 ? '' : 's'} were detected.`,
      blockIds: activeBlocks[0] === undefined ? [] : [activeBlocks[0].id],
    });
  }

  return warningSources;
};

export const collectImportBlockWarnings = (
  blocks: ImportBlock[],
  overrides: ImportBlockOverrides,
): string[] =>
  importBlockWarningSources(blocks, overrides).map(
    (warningSource) => warningSource.message,
  );

export const countImportBlocksNeedingReview = (
  blocks: ImportBlock[],
  overrides: ImportBlockOverrides,
): number => getImportBlockIdsNeedingReview(blocks, overrides).length;

export const getImportBlockIdsNeedingReview = (
  blocks: ImportBlock[],
  overrides: ImportBlockOverrides,
): string[] => {
  const blockIds = new Set(
    blocks
      .filter(
        (block) =>
          overrides[block.id]?.excluded !== true &&
          block.roleConfidence === 'inferred' &&
          overrides[block.id] === undefined,
      )
      .map((block) => block.id),
  );
  for (const warningSource of importBlockWarningSources(blocks, overrides)) {
    for (const blockId of warningSource.blockIds) blockIds.add(blockId);
  }
  return blocks
    .filter((block) => blockIds.has(block.id))
    .map((block) => block.id);
};
