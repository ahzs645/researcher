import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportBlockRow } from '@/local-db/research/import-wizard/components/ManuscriptImportBlockRow';
import { ManuscriptImportMapSidebar } from '@/local-db/research/import-wizard/components/ManuscriptImportMapSidebar';
import { ManuscriptImportShortcutBar } from '@/local-db/research/import-wizard/components/ManuscriptImportShortcutBar';
import { useManuscriptImportMapHotkeys } from '@/local-db/research/import-wizard/hooks/useManuscriptImportMapHotkeys';
import { useManuscriptImportMapState } from '@/local-db/research/import-wizard/hooks/useManuscriptImportMapState';
import {
  type ImportBlock,
  type ImportBlockOverrides,
  type ImportBlockRole,
  type ImportedSourceInfo,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { type PreparedManuscriptImport } from '@/local-db/research/manuscript/manuscriptImportPrepare';

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
  registerCloseInterception: (handler: (() => boolean) | null) => void;
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
  registerCloseInterception,
}: ManuscriptImportMapStepProps) => {
  const mapState = useManuscriptImportMapState({
    blocks,
    sourceInfo,
    sourceName,
    reconcile,
    onContinue,
    registerEnterHandler,
    registerCloseInterception,
  });
  useManuscriptImportMapHotkeys({
    moveActiveBlock: mapState.moveActiveBlock,
    setHeadingLevel: mapState.setHeadingLevel,
    setRole: mapState.setRole,
    toggleExcluded: mapState.toggleExcluded,
    handleLink: mapState.handleLink,
    onContinue: mapState.handleContinue,
  });

  return (
    <StyledContainer>
      <StyledGrid>
        <StyledBlockList>
          {mapState.linkSourceBlockId !== null ? (
            <StyledLinkMode>
              Link mode: use ↑/↓ to choose an image or table, then press Enter
              or L to link it. Escape cancels.
            </StyledLinkMode>
          ) : null}
          {blocks.map((block) => {
            const role = effectiveRole(block, mapState.overrides);
            const linkedAssetBlockId =
              mapState.overrides[block.id]?.linkedAssetBlockId;
            const linkedAsset = blocks.find(
              (candidate) => candidate.id === linkedAssetBlockId,
            );
            return (
              <ManuscriptImportBlockRow
                key={block.id}
                block={block}
                override={mapState.overrides[block.id]}
                effectiveRole={role}
                isActive={mapState.activeBlockId === block.id}
                isSelected={mapState.selectedBlockIds.has(block.id)}
                isLinkSource={mapState.linkSourceBlockId === block.id}
                linkedTargetLabel={
                  linkedAsset === undefined
                    ? undefined
                    : `block ${linkedAsset.index + 1} (${effectiveRole(
                        linkedAsset,
                        mapState.overrides,
                      )})`
                }
                tableStyle={tableStyle}
                onSelect={(shiftKey) => mapState.handleSelect(block, shiftKey)}
                onRoleChange={(nextRole) =>
                  mapState.handleRoleChange(block, nextRole)
                }
                onBeginLink={() => mapState.beginLink(block.id)}
                onMarkdownChange={(markdown) =>
                  mapState.updateOverride(block.id, { markdown })
                }
              />
            );
          })}
        </StyledBlockList>
        <ManuscriptImportMapSidebar
          blocks={blocks}
          overrides={mapState.overrides}
          sourceName={sourceName}
          isPreparing={mapState.isPreparing}
          onContinue={mapState.handleContinue}
        />
      </StyledGrid>
      <ManuscriptImportShortcutBar />
    </StyledContainer>
  );
};
