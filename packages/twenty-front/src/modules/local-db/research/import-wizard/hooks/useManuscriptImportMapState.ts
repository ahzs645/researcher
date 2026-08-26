import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  assembleImportedDocument,
  getImportBlockIdsNeedingReview,
  linkImportCaptionOverride,
  type ImportBlock,
  type ImportBlockOverride,
  type ImportBlockOverrides,
  type ImportBlockRole,
  type ImportedSourceInfo,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import {
  type ImportedCommentAnchor,
  type ImportedDocument,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  prepareManuscriptImport,
  type PrepareManuscriptImportOptions,
  type PreparedManuscriptImport,
} from '@/local-db/research/manuscript/manuscriptImportPrepare';

type UseManuscriptImportMapStateProps = {
  blocks: ImportBlock[];
  sourceInfo: ImportedSourceInfo;
  sourceName: string;
  commentAnchors: ImportedCommentAnchor[];
  reconcile: boolean;
  existingReferences: PrepareManuscriptImportOptions['existingReferences'];
  existingFigureRefKeys: string[];
  initialOverrides?: ImportBlockOverrides;
  onOverridesChange?: (overrides: ImportBlockOverrides) => void;
  onContinue: (
    document: ImportedDocument,
    preparedImport: PreparedManuscriptImport,
    sourceName: string,
  ) => void;
  registerEnterHandler: (handler: (() => void) | null) => void;
  registerCloseInterception: (handler: (() => boolean) | null) => void;
};

const effectiveRole = (
  block: ImportBlock,
  overrides: ImportBlockOverrides,
): ImportBlockRole => overrides[block.id]?.role ?? block.role;

export const useManuscriptImportMapState = ({
  blocks,
  sourceInfo,
  sourceName,
  commentAnchors,
  reconcile,
  existingReferences,
  existingFigureRefKeys,
  initialOverrides = {},
  onOverridesChange,
  onContinue,
  registerEnterHandler,
  registerCloseInterception,
}: UseManuscriptImportMapStateProps) => {
  const firstBlockId = blocks[0]?.id ?? null;
  const [overrides, setOverrides] =
    useState<ImportBlockOverrides>(initialOverrides);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(
    firstBlockId,
  );
  const [anchorBlockId, setAnchorBlockId] = useState<string | null>(
    firstBlockId,
  );
  const [linkSourceBlockId, setLinkSourceBlockId] = useState<string | null>(
    null,
  );
  const [isPreparing, setIsPreparing] = useState(false);

  const selectedBlockIds = useMemo(() => {
    if (activeBlockId === null || anchorBlockId === null)
      return new Set<string>();
    const activeIndex = blocks.findIndex((block) => block.id === activeBlockId);
    const anchorIndex = blocks.findIndex((block) => block.id === anchorBlockId);
    if (activeIndex < 0 || anchorIndex < 0) return new Set<string>();
    const start = Math.min(activeIndex, anchorIndex);
    const end = Math.max(activeIndex, anchorIndex);
    return new Set(blocks.slice(start, end + 1).map((block) => block.id));
  }, [activeBlockId, anchorBlockId, blocks]);

  const linkCandidates = useMemo(() => {
    const source = blocks.find((block) => block.id === linkSourceBlockId);
    if (source === undefined) return [];
    return blocks
      .filter((block) => {
        const role = effectiveRole(block, overrides);
        return (
          overrides[block.id]?.excluded !== true &&
          (role === 'image' || role === 'table')
        );
      })
      .sort(
        (first, second) =>
          Math.abs(first.index - source.index) -
            Math.abs(second.index - source.index) || first.index - second.index,
      );
  }, [blocks, linkSourceBlockId, overrides]);

  const updateOverride = useCallback(
    (blockId: string, update: ImportBlockOverride) => {
      setOverrides((current) => ({
        ...current,
        [blockId]: { ...current[blockId], ...update },
      }));
    },
    [],
  );

  const updateSelected = useCallback(
    (
      updateForBlock: (
        block: ImportBlock,
        current: ImportBlockOverrides,
      ) => ImportBlockOverride,
    ) => {
      setOverrides((current) => {
        const next = { ...current };
        for (const block of blocks) {
          if (!selectedBlockIds.has(block.id)) continue;
          next[block.id] = {
            ...next[block.id],
            ...updateForBlock(block, next),
          };
        }
        return next;
      });
    },
    [blocks, selectedBlockIds],
  );

  const setCaptionLink = useCallback(
    (
      captionBlockId: string,
      linkedAssetBlockId: string,
      assetKind: 'FIGURE' | 'TABLE',
    ) => {
      setOverrides((current) =>
        linkImportCaptionOverride(
          current,
          captionBlockId,
          linkedAssetBlockId,
          assetKind,
        ),
      );
    },
    [],
  );

  const confirmLink = useCallback(() => {
    if (linkSourceBlockId === null || activeBlockId === null) return false;
    const target = blocks.find((block) => block.id === activeBlockId);
    if (target === undefined) return false;
    const role = effectiveRole(target, overrides);
    if (role !== 'image' && role !== 'table') return false;
    setCaptionLink(
      linkSourceBlockId,
      target.id,
      role === 'table' ? 'TABLE' : 'FIGURE',
    );
    setLinkSourceBlockId(null);
    return true;
  }, [activeBlockId, blocks, linkSourceBlockId, overrides, setCaptionLink]);

  const beginLink = useCallback(
    (captionBlockId: string) => {
      if (linkSourceBlockId === captionBlockId) {
        setLinkSourceBlockId(null);
        setActiveBlockId(captionBlockId);
        setAnchorBlockId(captionBlockId);
        return;
      }
      setLinkSourceBlockId(captionBlockId);
      const source = blocks.find((block) => block.id === captionBlockId);
      const nearest = blocks
        .filter((block) => {
          const role = effectiveRole(block, overrides);
          return (
            overrides[block.id]?.excluded !== true &&
            (role === 'image' || role === 'table')
          );
        })
        .sort(
          (first, second) =>
            Math.abs(first.index - (source?.index ?? 0)) -
              Math.abs(second.index - (source?.index ?? 0)) ||
            first.index - second.index,
        )[0];
      if (nearest !== undefined) {
        setActiveBlockId(nearest.id);
        setAnchorBlockId(nearest.id);
      }
    },
    [blocks, linkSourceBlockId, overrides],
  );

  const handleSelect = useCallback(
    (block: ImportBlock, shiftKey: boolean) => {
      setActiveBlockId(block.id);
      if (!shiftKey) setAnchorBlockId(block.id);
      if (linkSourceBlockId === null) return;
      const role = effectiveRole(block, overrides);
      if (role !== 'image' && role !== 'table') return;
      setCaptionLink(
        linkSourceBlockId,
        block.id,
        role === 'table' ? 'TABLE' : 'FIGURE',
      );
      setLinkSourceBlockId(null);
    },
    [linkSourceBlockId, overrides, setCaptionLink],
  );

  const moveActiveBlock = useCallback(
    (direction: -1 | 1, extendSelection: boolean) => {
      const navigable = linkSourceBlockId === null ? blocks : linkCandidates;
      if (navigable.length === 0) return;
      const currentIndex = navigable.findIndex(
        (block) => block.id === activeBlockId,
      );
      const nextIndex = Math.min(
        navigable.length - 1,
        Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + direction),
      );
      const nextBlockId = navigable[nextIndex].id;
      setActiveBlockId(nextBlockId);
      if (!extendSelection || linkSourceBlockId !== null) {
        setAnchorBlockId(nextBlockId);
      }
    },
    [activeBlockId, blocks, linkCandidates, linkSourceBlockId],
  );

  const setRole = useCallback(
    (role: ImportBlockRole) => {
      updateSelected((block, current) => {
        const roleUpdate: ImportBlockOverride = { role };
        if (role === 'heading') {
          roleUpdate.headingLevel =
            current[block.id]?.headingLevel ?? block.headingLevel ?? 2;
        }
        if (role !== 'caption') return roleUpdate;
        const linkedAssetIds = new Set(
          Object.values(current)
            .map((override) => override.linkedAssetBlockId)
            .filter((blockId): blockId is string => blockId !== undefined),
        );
        const adjacentAssets = blocks.filter((candidate) => {
          const candidateRole = effectiveRole(candidate, current);
          return (
            Math.abs(candidate.index - block.index) === 1 &&
            current[candidate.id]?.excluded !== true &&
            !linkedAssetIds.has(candidate.id) &&
            (candidateRole === 'image' || candidateRole === 'table')
          );
        });
        if (adjacentAssets.length !== 1) return roleUpdate;
        const asset = adjacentAssets[0];
        return {
          ...roleUpdate,
          linkedAssetBlockId: asset.id,
          assetKind:
            effectiveRole(asset, current) === 'table' ? 'TABLE' : 'FIGURE',
        };
      });
    },
    [blocks, updateSelected],
  );

  const setHeadingLevel = useCallback(
    (headingLevel: 1 | 2 | 3) =>
      updateSelected(() => ({ role: 'heading', headingLevel })),
    [updateSelected],
  );

  const toggleExcluded = useCallback(() => {
    const shouldExclude =
      activeBlockId === null || overrides[activeBlockId]?.excluded !== true;
    updateSelected(() => ({ excluded: shouldExclude }));
  }, [activeBlockId, overrides, updateSelected]);

  const handleLink = useCallback(() => {
    if (linkSourceBlockId !== null) {
      confirmLink();
      return;
    }
    const active = blocks.find((block) => block.id === activeBlockId);
    if (
      active !== undefined &&
      effectiveRole(active, overrides) === 'caption'
    ) {
      beginLink(active.id);
    }
  }, [
    activeBlockId,
    beginLink,
    blocks,
    confirmLink,
    linkSourceBlockId,
    overrides,
  ]);

  const handleContinue = useCallback(() => {
    if (isPreparing) return;
    setIsPreparing(true);
    try {
      const document = assembleImportedDocument(
        blocks,
        overrides,
        sourceInfo,
        commentAnchors,
      );
      onContinue(
        document,
        prepareManuscriptImport(document, reconcile, {
          existingReferences,
          existingFigureRefKeys,
        }),
        sourceName,
      );
    } finally {
      setIsPreparing(false);
    }
  }, [
    blocks,
    commentAnchors,
    existingFigureRefKeys,
    existingReferences,
    isPreparing,
    onContinue,
    overrides,
    reconcile,
    sourceInfo,
    sourceName,
  ]);

  const handleEnter = useCallback(() => {
    if (confirmLink()) return;
    const reviewIds = getImportBlockIdsNeedingReview(blocks, overrides);
    if (reviewIds.length === 0) {
      document.getElementById('manuscript-import-continue-button')?.focus();
      return;
    }
    const activeIndex = blocks.findIndex((block) => block.id === activeBlockId);
    const nextReviewId =
      reviewIds.find(
        (blockId) =>
          blocks.findIndex((block) => block.id === blockId) > activeIndex,
      ) ?? reviewIds[0];
    setActiveBlockId(nextReviewId);
    setAnchorBlockId(nextReviewId);
  }, [activeBlockId, blocks, confirmLink, overrides]);

  useEffect(() => {
    onOverridesChange?.(overrides);
  }, [onOverridesChange, overrides]);

  useEffect(() => {
    registerEnterHandler(handleEnter);
    return () => registerEnterHandler(null);
  }, [handleEnter, registerEnterHandler]);

  useEffect(() => {
    registerCloseInterception(() => {
      if (linkSourceBlockId === null) return false;
      setLinkSourceBlockId(null);
      return true;
    });
    return () => registerCloseInterception(null);
  }, [linkSourceBlockId, registerCloseInterception]);

  const handleRoleChange = useCallback(
    (block: ImportBlock, role: ImportBlockRole) => {
      if ((role === 'image' || role === 'table') && block.role !== role) return;
      updateOverride(block.id, {
        role,
        ...(role === 'heading'
          ? {
              headingLevel:
                overrides[block.id]?.headingLevel ?? block.headingLevel ?? 2,
            }
          : {}),
      });
    },
    [overrides, updateOverride],
  );

  return {
    overrides,
    activeBlockId,
    selectedBlockIds,
    linkSourceBlockId,
    isPreparing,
    handleSelect,
    handleRoleChange,
    beginLink,
    updateOverride,
    handleContinue,
    moveActiveBlock,
    setHeadingLevel,
    setRole,
    toggleExcluded,
    handleLink,
  };
};
