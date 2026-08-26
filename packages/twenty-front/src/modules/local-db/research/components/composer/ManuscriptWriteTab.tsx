import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { H2Title } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportPanel } from '@/local-db/research/components/ManuscriptImportPanel';
import { ManuscriptDuplicateSectionReview } from '@/local-db/research/components/composer/ManuscriptDuplicateSectionReview';
import { ManuscriptSectionOutline } from '@/local-db/research/components/composer/ManuscriptSectionOutline';
import { ManuscriptSectionVersionBar } from '@/local-db/research/components/composer/ManuscriptSectionVersionBar';
import { ManuscriptWriteEditor } from '@/local-db/research/components/composer/ManuscriptWriteEditor';
import { type ExistingJournalTemplate } from '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { extractCitationKeys } from '@/local-db/research/manuscript/manuscriptCrossReference';
import { type ScaffoldSectionDraft } from '@/local-db/research/manuscript/manuscriptScaffold';
import { findDuplicateSectionGroups } from '@/local-db/research/manuscript/manuscriptSectionDedupe';
import {
  sectionVariantKey,
  sectionVariantsByBaseId,
} from '@/local-db/research/manuscript/manuscriptSectionVariants';
import { type SubmissionRequirementTemplate } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
  type SectionPlacement,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type ManuscriptWriteTabProps = {
  manuscriptId: string;
  manuscriptName?: string | null;
  sections: SectionLike[];
  figures: FigureLike[];
  references: ReferenceLike[];
  selectedSection?: SectionLike;
  style: JournalStyle;
  exportTableStyle: ManuscriptTableStyle;
  exportStyleOverrides?: string | null;
  existingJournals?: ExistingJournalTemplate[];
  targetJournal?: SubmissionRequirementTemplate & { name?: string | null };
  submissionExtras?: string | null;
  competingInterests?: string | null;
  onEditFrontMatter: () => void;
  onDeleteSection: (sectionId: string) => Promise<void>;
  onDuplicateSection: (sectionId: string) => Promise<void>;
  onSelectSection: (sectionId: string) => void;
  onChangeSectionPlacement: (
    sectionId: string,
    placement: SectionPlacement,
  ) => void;
  onPersistSection: (markdown: string) => void;
  onPersistSectionError: () => void;
  onAddSection: (draft?: ScaffoldSectionDraft) => void;
  onCreateSectionVariant: (baseSectionId: string) => Promise<void>;
  onScaffoldSections: () => void;
  onReorderSection: (sourceId: string, targetId: string) => void;
  missingScaffold: ScaffoldSectionDraft[];
  onSectionMetadataChanged: () => void;
  onImported: () => void;
  onDeleteDuplicateSections: (sectionIds: string[]) => Promise<void>;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;

  & h2 {
    margin-bottom: 0;
  }
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledWorkspace = styled.div`
  align-items: start;
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledOutlineColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledEditorArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
`;

const StyledAddSectionSelect = styled.select`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

export const ManuscriptWriteTab = ({
  manuscriptId,
  manuscriptName,
  sections,
  figures,
  references,
  selectedSection,
  style,
  exportTableStyle,
  exportStyleOverrides,
  existingJournals,
  targetJournal,
  submissionExtras,
  competingInterests,
  onEditFrontMatter,
  onDeleteSection,
  onDuplicateSection,
  onSelectSection,
  onChangeSectionPlacement,
  onPersistSection,
  onPersistSectionError,
  onAddSection,
  onCreateSectionVariant,
  onScaffoldSections,
  onReorderSection,
  missingScaffold,
  onSectionMetadataChanged,
  onImported,
  onDeleteDuplicateSections,
}: ManuscriptWriteTabProps) => {
  const editorShellRef = useRef<HTMLDivElement>(null);
  const { enqueueErrorSnackBar } = useSnackBar();
  const [minimumEditorHeight, setMinimumEditorHeight] = useState<
    number | undefined
  >();
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  // The paper's own sections. A per-journal version carries its base's name and
  // type, so leaving versions in here would make the duplicate-section review
  // offer to delete the version the author just wrote.
  const paperSections = useMemo(
    () => sections.filter((section) => !isNonEmptyString(section.variantOfId)),
    [sections],
  );
  const variantsByBaseId = useMemo(
    () => sectionVariantsByBaseId(sections),
    [sections],
  );
  const activeVariantKey = sectionVariantKey(style);
  const activeJournalLabel = style.name ?? activeVariantKey;
  // Versions are keyed by profile, not by journal record, so a version can name
  // a profile this workspace does not have. Only the journals it does have can
  // be given their proper name; the rest fall back to the key itself.
  const journalNameByVariantKey = useMemo(
    () =>
      new Map(
        (existingJournals ?? []).flatMap((journal) => {
          const key = sectionVariantKey(journal);
          return isNonEmptyString(key) && isNonEmptyString(journal.name)
            ? [[key, journal.name] as const]
            : [];
        }),
      ),
    [existingJournals],
  );
  const duplicateSectionGroups = findDuplicateSectionGroups(paperSections);
  const firstWritingSectionId = paperSections.find(
    (section) => section.placement !== 'FRONT_MATTER',
  )?.id;
  const selectedWritingSection =
    selectedSection?.placement === 'FRONT_MATTER' ? undefined : selectedSection;
  // Editing a version keeps the outline on the base row: the version has no
  // place of its own in the paper, and losing the highlight would leave the
  // author with no idea where in the paper they are.
  const selectedVariantOfId = selectedWritingSection?.variantOfId;
  const selectedBaseSection = isNonEmptyString(selectedVariantOfId)
    ? paperSections.find((section) => section.id === selectedVariantOfId)
    : selectedWritingSection;
  const citationKeys = sections.reduce<string[]>((keys, section) => {
    for (const key of extractCitationKeys(section.content ?? '')) {
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  }, []);

  useEffect(() => {
    if (
      selectedSection?.placement === 'FRONT_MATTER' &&
      firstWritingSectionId !== undefined
    ) {
      onSelectSection(firstWritingSectionId);
    }
  }, [firstWritingSectionId, onSelectSection, selectedSection?.placement]);

  const selectSection = (sectionId: string) => {
    if (sectionId === selectedWritingSection?.id) return;
    const currentHeight =
      editorShellRef.current?.getBoundingClientRect().height;
    if (currentHeight !== undefined) setMinimumEditorHeight(currentHeight);
    onSelectSection(sectionId);
  };

  // The refusal to write a second version for the same journal comes back as a
  // rejected promise and is shown as it was written, rather than being turned
  // into a generic failure the author cannot act on.
  const createSectionVersion = (baseSectionId: string) => {
    setIsCreatingVersion(true);
    void onCreateSectionVariant(baseSectionId)
      .catch((error: unknown) =>
        enqueueErrorSnackBar({
          message:
            error instanceof Error
              ? error.message
              : 'Could not add a journal version',
        }),
      )
      .finally(() => setIsCreatingVersion(false));
  };

  return (
    <StyledTab>
      <StyledHeader>
        <H2Title title="Write" />
        <StyledActions>
          <ManuscriptImportPanel
            compact
            manuscriptId={manuscriptId}
            manuscriptName={manuscriptName}
            existingSectionCount={paperSections.length}
            existingSections={paperSections}
            existingReferences={references}
            existingFigureRefKeys={figures
              .map(({ refKey }) => refKey)
              .filter(
                (refKey): refKey is string =>
                  typeof refKey === 'string' && refKey.length > 0,
              )}
            exportTableStyle={exportTableStyle}
            exportStyleOverrides={exportStyleOverrides}
            existingJournals={existingJournals}
            targetJournal={targetJournal}
            submissionExtras={submissionExtras}
            competingInterests={competingInterests}
            onChanged={onImported}
          />
          <StyledAddSectionSelect
            aria-label="Add section"
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') return;
              onAddSection(
                value === 'blank' ? undefined : missingScaffold[Number(value)],
              );
            }}
          >
            <option value="" disabled>
              Add section…
            </option>
            {missingScaffold.map((draft, index) => (
              <option key={`${draft.sectionType}-${draft.name}`} value={index}>
                {draft.name}
              </option>
            ))}
            <option value="blank">Blank section</option>
          </StyledAddSectionSelect>
          <Button
            title={
              paperSections.length === 0
                ? 'Scaffold sections'
                : `Add missing sections (${missingScaffold.length})`
            }
            variant="secondary"
            size="small"
            disabled={missingScaffold.length === 0}
            onClick={onScaffoldSections}
          />
        </StyledActions>
      </StyledHeader>

      <StyledWorkspace>
        <StyledOutlineColumn>
          <ManuscriptDuplicateSectionReview
            groups={duplicateSectionGroups}
            onDeleteSections={onDeleteDuplicateSections}
          />
          <ManuscriptSectionOutline
            sections={sections}
            selectedSectionId={selectedBaseSection?.id}
            activeVariantKey={activeVariantKey}
            activeJournalLabel={activeJournalLabel}
            onChangePlacement={onChangeSectionPlacement}
            onEditFrontMatter={onEditFrontMatter}
            onSelectSection={selectSection}
            onReorderSection={onReorderSection}
          />
        </StyledOutlineColumn>

        <StyledEditorArea>
          {isDefined(selectedBaseSection) &&
          isDefined(selectedWritingSection) ? (
            <ManuscriptSectionVersionBar
              baseSection={selectedBaseSection}
              versions={variantsByBaseId.get(selectedBaseSection.id) ?? []}
              selectedSectionId={selectedWritingSection.id}
              activeVariantKey={activeVariantKey}
              activeJournalLabel={activeJournalLabel}
              journalNameByVariantKey={journalNameByVariantKey}
              isCreatingVersion={isCreatingVersion}
              onCreateVersion={createSectionVersion}
              onSelectSection={selectSection}
            />
          ) : null}
          <ManuscriptWriteEditor
            citationKeys={citationKeys}
            editorShellRef={editorShellRef}
            figures={figures}
            minimumEditorHeight={minimumEditorHeight}
            onEditorReady={() => setMinimumEditorHeight(undefined)}
            onDeleteSection={onDeleteSection}
            onDuplicateSection={onDuplicateSection}
            onPersistSection={onPersistSection}
            onPersistSectionError={onPersistSectionError}
            onSectionMetadataChanged={onSectionMetadataChanged}
            references={references}
            section={selectedWritingSection}
            sections={sections}
            style={style}
          />
        </StyledEditorArea>
      </StyledWorkspace>
    </StyledTab>
  );
};
