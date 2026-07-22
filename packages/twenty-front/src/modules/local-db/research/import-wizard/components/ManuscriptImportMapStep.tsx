import { styled } from '@linaria/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportBlockRow } from '@/local-db/research/import-wizard/components/ManuscriptImportBlockRow';
import { ManuscriptImportMapSidebar } from '@/local-db/research/import-wizard/components/ManuscriptImportMapSidebar';
import { ManuscriptImportShortcutBar } from '@/local-db/research/import-wizard/components/ManuscriptImportShortcutBar';
import {
  assembleImportedDocument,
  type ImportBlock,
  type ImportBlockOverrides,
  type ImportBlockRole,
  type ImportedSourceInfo,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import {
  prepareManuscriptImport,
  type PreparedManuscriptImport,
} from '@/local-db/research/manuscript/manuscriptImportPrepare';

type ManuscriptImportMapStepProps = {
  blocks: ImportBlock[];
  sourceInfo: ImportedSourceInfo;
  sourceName: string;
  reconcile: boolean;
  tableStyle: ManuscriptTableStyle;
  onContinue: (
    document: ImportedDocument,
    preparedImport: PreparedManuscriptImport,
    sourceName: string,
  ) => void;
  registerEnterHandler: (handler: (() => void) | null) => void;
};

const StyledContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

const StyledGrid = styled.div`
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 320px;
  min-height: 0;
`;

const StyledBlockList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledLinkMode = styled.div`
  background: ${themeCssVariables.color.blue3};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.color.blue};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[2]};
`;

const effectiveRole = (
  block: ImportBlock,
  overrides: ImportBlockOverrides,
): ImportBlockRole => overrides[block.id]?.role ?? block.role;

export const ManuscriptImportMapStep = ({
  blocks,
  sourceInfo,
  sourceName,
  reconcile,
  tableStyle,
  onContinue,
  registerEnterHandler,
}: ManuscriptImportMapStepProps) => {
  const firstBlockId = blocks[0]?.id ?? null;
  const [overrides, setOverrides] = useState<ImportBlockOverrides>({});
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

  const updateOverride = (
    blockId: string,
    update: ImportBlockOverrides[string],
  ) => {
    setOverrides((currentOverrides) => ({
      ...currentOverrides,
      [blockId]: { ...currentOverrides[blockId], ...update },
    }));
  };

  const handleSelect = (block: ImportBlock, shiftKey: boolean) => {
    if (linkSourceBlockId !== null) {
      const role = effectiveRole(block, overrides);
      if (role === 'image' || role === 'table') {
        updateOverride(linkSourceBlockId, {
          linkedAssetBlockId: block.id,
          assetKind: role === 'table' ? 'TABLE' : 'FIGURE',
        });
        setLinkSourceBlockId(null);
      }
    }
    setActiveBlockId(block.id);
    if (!shiftKey) setAnchorBlockId(block.id);
  };

  const handleRoleChange = (block: ImportBlock, role: ImportBlockRole) => {
    updateOverride(block.id, {
      role,
      ...(role === 'heading'
        ? {
            headingLevel:
              overrides[block.id]?.headingLevel ?? block.headingLevel ?? 2,
          }
        : {}),
    });
  };

  const handleContinue = useCallback(() => {
    if (isPreparing) return;
    setIsPreparing(true);
    try {
      const document = assembleImportedDocument(blocks, overrides, sourceInfo);
      const preparedImport = prepareManuscriptImport(document, reconcile);
      onContinue(document, preparedImport, sourceName);
    } finally {
      setIsPreparing(false);
    }
  }, [
    blocks,
    isPreparing,
    onContinue,
    overrides,
    reconcile,
    sourceInfo,
    sourceName,
  ]);

  useEffect(() => {
    registerEnterHandler(handleContinue);
    return () => registerEnterHandler(null);
  }, [handleContinue, registerEnterHandler]);

  return (
    <StyledContainer>
      <StyledGrid>
        <StyledBlockList>
          {linkSourceBlockId !== null ? (
            <StyledLinkMode>
              Link mode: click an image or table to connect it to the selected
              caption.
            </StyledLinkMode>
          ) : null}
          {blocks.map((block) => {
            const role = effectiveRole(block, overrides);
            const linkedAssetBlockId = overrides[block.id]?.linkedAssetBlockId;
            const linkedAsset = blocks.find(
              (candidate) => candidate.id === linkedAssetBlockId,
            );
            return (
              <ManuscriptImportBlockRow
                key={block.id}
                block={block}
                override={overrides[block.id]}
                effectiveRole={role}
                isActive={activeBlockId === block.id}
                isSelected={selectedBlockIds.has(block.id)}
                isLinkSource={linkSourceBlockId === block.id}
                linkedTargetLabel={
                  linkedAsset === undefined
                    ? undefined
                    : `block ${linkedAsset.index + 1} (${effectiveRole(
                        linkedAsset,
                        overrides,
                      )})`
                }
                tableStyle={tableStyle}
                onSelect={(shiftKey) => handleSelect(block, shiftKey)}
                onRoleChange={(nextRole) => handleRoleChange(block, nextRole)}
                onBeginLink={() =>
                  setLinkSourceBlockId((currentBlockId) =>
                    currentBlockId === block.id ? null : block.id,
                  )
                }
              />
            );
          })}
        </StyledBlockList>
        <ManuscriptImportMapSidebar
          blocks={blocks}
          overrides={overrides}
          sourceName={sourceName}
          isPreparing={isPreparing}
          onContinue={handleContinue}
        />
      </StyledGrid>
      <ManuscriptImportShortcutBar />
    </StyledContainer>
  );
};
