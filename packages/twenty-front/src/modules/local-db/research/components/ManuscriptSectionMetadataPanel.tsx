import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type FigureLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { Select } from '@/ui/input/components/Select';

type ManuscriptSectionMetadataPanelProps = {
  section: SectionLike;
  sections: SectionLike[];
  figures: FigureLike[];
  onChanged: () => void;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
};

const SECTION_TYPE_OPTIONS: SelectOption<string>[] = [
  { value: 'TITLE_PAGE', label: 'Title page' },
  { value: 'ABSTRACT', label: 'Abstract' },
  { value: 'KEYWORDS', label: 'Keywords' },
  { value: 'INTRODUCTION', label: 'Introduction' },
  { value: 'BACKGROUND', label: 'Background / related work' },
  { value: 'METHODS', label: 'Methods' },
  { value: 'RESULTS', label: 'Results' },
  { value: 'DISCUSSION', label: 'Discussion' },
  { value: 'CONCLUSION', label: 'Conclusion' },
  { value: 'ACKNOWLEDGMENTS', label: 'Acknowledgments' },
  { value: 'FUNDING', label: 'Funding statement' },
  { value: 'AUTHOR_CONTRIBUTIONS', label: 'Author contributions' },
  { value: 'CONFLICTS', label: 'Conflicts of interest' },
  { value: 'DATA_AVAILABILITY', label: 'Data availability' },
  { value: 'ETHICS', label: 'Ethics statement' },
  { value: 'REFERENCES', label: 'References' },
  { value: 'SUPPLEMENT', label: 'Supplementary material' },
  { value: 'APPENDIX', label: 'Appendix' },
  { value: 'OTHER', label: 'Other' },
];

const PLACEMENT_OPTIONS: SelectOption<string>[] = [
  { value: 'FRONT_MATTER', label: 'Front matter' },
  { value: 'MAIN', label: 'Main text' },
  { value: 'BACK_MATTER', label: 'Back matter' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

const STATUS_OPTIONS: SelectOption<string>[] = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'DRAFTING', label: 'Drafting' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'FINAL', label: 'Final' },
];

const StyledPanel = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCheckbox = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

export const ManuscriptSectionMetadataPanel = ({
  section,
  sections,
  figures,
  onChanged,
  onDelete,
  onDuplicate,
}: ManuscriptSectionMetadataPanelProps) => {
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueErrorSnackBar } = useSnackBar();
  const { enqueueDialog } = useDialogManager();
  const peers = sections.filter(
    (candidate) => candidate.placement === section.placement,
  );
  const peerIndex = peers.findIndex((candidate) => candidate.id === section.id);

  const updateSection = (values: Record<string, unknown>) => {
    void updateOneRecord({
      objectNameSingular: 'manuscriptSection',
      idToUpdate: section.id,
      updateOneRecordInput: values,
    })
      .then(onChanged)
      .catch(() =>
        enqueueErrorSnackBar({ message: 'Could not save section metadata' }),
      );
  };

  const moveSection = (direction: -1 | 1) => {
    const adjacent = peers[peerIndex + direction];
    if (!isDefined(adjacent)) return;
    const currentOrder = section.orderIndex ?? peerIndex;
    const adjacentOrder = adjacent.orderIndex ?? peerIndex + direction;
    void Promise.all([
      updateOneRecord({
        objectNameSingular: 'manuscriptSection',
        idToUpdate: section.id,
        updateOneRecordInput: { orderIndex: adjacentOrder },
      }),
      updateOneRecord({
        objectNameSingular: 'manuscriptSection',
        idToUpdate: adjacent.id,
        updateOneRecordInput: { orderIndex: currentOrder },
      }),
    ])
      .then(onChanged)
      .catch(() =>
        enqueueErrorSnackBar({ message: 'Could not reorder section' }),
      );
  };

  // Renaming a key has to carry the sentences that used it, exactly as a
  // figure's does — otherwise every reference to the section turns into a
  // dangling token the moment the author tidies its name.
  const changeReferenceKey = (rawKey: string) => {
    const nextKey = rawKey.trim();
    const currentKey = section.refKey?.trim() ?? '';
    if (nextKey === currentKey) return;
    if (nextKey.length > 0 && !/^[A-Za-z0-9:._-]+$/.test(nextKey)) {
      enqueueErrorSnackBar({
        message: 'A reference key can only use letters, digits, : . _ and -',
      });
      return;
    }
    const taken = sections.some(
      (candidate) =>
        candidate.id !== section.id &&
        (candidate.refKey?.trim() ?? '') === nextKey,
    );
    if (nextKey.length > 0 && taken) {
      enqueueErrorSnackBar({ message: 'That reference key is already in use' });
      return;
    }
    const rewrite = (content: string): string =>
      currentKey.length === 0 || nextKey.length === 0
        ? content
        : content
            .replaceAll(`[#sec:${currentKey}]`, `[#sec:${nextKey}]`)
            .replaceAll(`[#${currentKey}]`, `[#${nextKey}]`);
    const touched =
      currentKey.length === 0 || nextKey.length === 0
        ? []
        : sections.filter(
            (candidate) =>
              rewrite(candidate.content ?? '') !== candidate.content,
          );
    void Promise.all([
      updateOneRecord({
        objectNameSingular: 'manuscriptSection',
        idToUpdate: section.id,
        updateOneRecordInput: { refKey: nextKey },
      }),
      ...touched.map((candidate) =>
        updateOneRecord({
          objectNameSingular: 'manuscriptSection',
          idToUpdate: candidate.id,
          updateOneRecordInput: { content: rewrite(candidate.content ?? '') },
        }),
      ),
    ])
      .then(onChanged)
      .catch(() =>
        enqueueErrorSnackBar({ message: 'Could not update reference key' }),
      );
  };

  const changePlacement = (placement: string) => {
    const placementPeers = sections.filter(
      (candidate) => candidate.placement === placement,
    );
    const nextOrder =
      Math.max(
        -1,
        ...placementPeers.map((candidate) => candidate.orderIndex ?? -1),
      ) + 1;
    const assetPlacement = placement === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'MAIN';
    const linkedFigures = figures.filter(
      (figure) => figure.sectionId === section.id,
    );
    void Promise.all([
      updateOneRecord({
        objectNameSingular: 'manuscriptSection',
        idToUpdate: section.id,
        updateOneRecordInput: { placement, orderIndex: nextOrder },
      }),
      ...linkedFigures.map((figure) =>
        updateOneRecord({
          objectNameSingular: 'figure',
          idToUpdate: figure.id,
          updateOneRecordInput: { placement: assetPlacement },
        }),
      ),
    ])
      .then(onChanged)
      .catch(() => enqueueErrorSnackBar({ message: 'Could not move section' }));
  };

  return (
    <StyledPanel>
      <StyledGrid>
        <StyledField>
          Section title
          <StyledInput
            aria-label="Section title"
            defaultValue={section.name ?? ''}
            onBlur={(event) =>
              updateSection({ name: event.target.value.trim() })
            }
          />
        </StyledField>
        <StyledField>
          Reference key
          <StyledInput
            aria-label="Section reference key"
            placeholder="methods"
            defaultValue={section.refKey ?? ''}
            onBlur={(event) => changeReferenceKey(event.target.value)}
          />
          <StyledHint>
            {isNonEmptyString(section.refKey?.trim())
              ? `Write [#${section.refKey.trim()}] to print this section's number.`
              : 'Name the section to point at it: [#sec:methods] prints "Section 3".'}
          </StyledHint>
        </StyledField>
        <StyledField>
          Word limit
          <StyledInput
            aria-label="Section word limit"
            type="number"
            min={0}
            defaultValue={section.wordLimit ?? ''}
            onBlur={(event) =>
              updateSection({
                wordLimit:
                  event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        </StyledField>
        <Select
          dropdownId={`section-type-${section.id}`}
          label="Section type"
          fullWidth
          options={SECTION_TYPE_OPTIONS}
          value={section.sectionType ?? 'OTHER'}
          onChange={(sectionType) => updateSection({ sectionType })}
        />
        <Select
          dropdownId={`section-placement-${section.id}`}
          label="Document placement"
          fullWidth
          options={PLACEMENT_OPTIONS}
          value={section.placement ?? 'MAIN'}
          onChange={changePlacement}
        />
        <Select
          dropdownId={`section-status-${section.id}`}
          label="Draft status"
          fullWidth
          options={STATUS_OPTIONS}
          value={section.status ?? 'NOT_STARTED'}
          onChange={(status) => updateSection({ status })}
        />
      </StyledGrid>
      <StyledActions>
        <Button
          title="Move section up"
          variant="secondary"
          size="small"
          disabled={peerIndex <= 0}
          onClick={() => moveSection(-1)}
        />
        <Button
          title="Move section down"
          variant="secondary"
          size="small"
          disabled={peerIndex < 0 || peerIndex === peers.length - 1}
          onClick={() => moveSection(1)}
        />
        <Button
          title="Promote heading"
          variant="secondary"
          size="small"
          disabled={(section.level ?? 1) <= 1}
          onClick={() =>
            updateSection({ level: Math.max(1, (section.level ?? 1) - 1) })
          }
        />
        <Button
          title="Demote heading"
          variant="secondary"
          size="small"
          disabled={(section.level ?? 1) >= 6}
          onClick={() =>
            updateSection({ level: Math.min(6, (section.level ?? 1) + 1) })
          }
        />
        <Button
          title="Duplicate section"
          variant="secondary"
          size="small"
          onClick={() =>
            void onDuplicate().catch(() =>
              enqueueErrorSnackBar({ message: 'Could not duplicate section' }),
            )
          }
        />
        <Button
          title="Delete section"
          variant="secondary"
          size="small"
          onClick={() =>
            enqueueDialog({
              title: 'Delete section?',
              message: `Delete ${section.name ?? 'this section'} permanently? ${figures.some((figure) => figure.sectionId === section.id) ? 'Assets assigned to it will remain in the manuscript.' : ''}`,
              buttons: [
                { title: 'Cancel' },
                {
                  title: 'Delete',
                  accent: 'danger',
                  role: 'confirm',
                  onClick: () =>
                    void onDelete().catch(() =>
                      enqueueErrorSnackBar({
                        message: 'Could not delete section',
                      }),
                    ),
                },
              ],
            })
          }
        />
        <StyledCheckbox>
          <input
            type="checkbox"
            aria-label="Include section in export"
            checked={section.includeInExport !== false}
            onChange={(event) =>
              updateSection({ includeInExport: event.target.checked })
            }
          />
          Include in export
        </StyledCheckbox>
      </StyledActions>
    </StyledPanel>
  );
};
