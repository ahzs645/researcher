import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { useEffect, useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { H3Title, IconChevronDown, IconChevronRight } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';
import { ManuscriptSectionVersionBar } from '@/local-db/research/components/composer/ManuscriptSectionVersionBar';
import { type ExistingJournalTemplate } from '@/local-db/research/import-wizard/hooks/useManuscriptImportCommit';
import { extractCitationKeys } from '@/local-db/research/manuscript/manuscriptCrossReference';
import {
  sectionVariantKey,
  sectionVariantsByBaseId,
} from '@/local-db/research/manuscript/manuscriptSectionVariants';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
  type SectionPlacement,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

const PLACEMENTS: Array<{ value: SectionPlacement; label: string }> = [
  { value: 'FRONT_MATTER', label: 'Front matter' },
  { value: 'MAIN', label: 'Main text' },
  { value: 'BACK_MATTER', label: 'Back matter' },
  { value: 'SUPPLEMENT', label: 'Supplement' },
];

const isSectionPlacement = (value: string): value is SectionPlacement =>
  PLACEMENTS.some((placement) => placement.value === value);

const sectionTypeLabel = (sectionType?: string | null) =>
  (sectionType ?? 'OTHER').toLowerCase().replaceAll('_', ' ');

type ManuscriptFrontMatterSectionsProps = {
  existingJournals?: ExistingJournalTemplate[];
  figures: FigureLike[];
  onChangeIncludeInExport: (
    sectionId: string,
    includeInExport: boolean,
  ) => Promise<void>;
  onChangePlacement: (
    sectionId: string,
    placement: SectionPlacement,
  ) => Promise<void>;
  onCreateSectionVariant: (baseSectionId: string) => Promise<void>;
  onPersistSection: (sectionId: string, markdown: string) => void;
  references: ReferenceLike[];
  sections: SectionLike[];
  selectedSectionId?: string;
  style: JournalStyle;
};

const StyledArea = styled.section`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[4]};

  & h3 {
    margin: 0;
  }
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledSection = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  overflow: hidden;
`;

const StyledRowButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  text-align: left;
  width: 100%;
`;

const StyledHeading = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const StyledName = styled.span`
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// Only a row that actually has a version renders this line, so a paper that
// never uses versions — most of them — keeps the row it always had.
const StyledVersionNote = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledBadge = styled.span`
  background: ${themeCssVariables.background.transparent.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: 1px ${themeCssVariables.spacing[1]};
`;

const StyledWordCount = styled.span<{ over: boolean }>`
  color: ${({ over }) =>
    over
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${({ over }) =>
    over ? themeCssVariables.font.weight.medium : 'inherit'};
  white-space: nowrap;
`;

const StyledExpanded = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledPlacement = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};

  & select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    font: inherit;
    padding: ${themeCssVariables.spacing[1]};
  }
`;

const StyledCheckbox = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

export const ManuscriptFrontMatterSections = ({
  existingJournals,
  figures,
  onChangeIncludeInExport,
  onChangePlacement,
  onCreateSectionVariant,
  onPersistSection,
  references,
  sections,
  selectedSectionId,
  style,
}: ManuscriptFrontMatterSectionsProps) => {
  const { enqueueErrorSnackBar } = useSnackBar();
  const frontMatterSections = useMemo(
    () =>
      sections.filter(
        (section) =>
          section.placement === 'FRONT_MATTER' &&
          // A version mirrors its base's placement, name and type, so without
          // this it would sit beside the base as a second, identical-looking
          // row — the same duplicate the outline already refuses to draw.
          !isNonEmptyString(section.variantOfId) &&
          section.sectionType?.toUpperCase() !== 'KEYWORDS',
      ),
    [sections],
  );
  const versionsByBaseId = useMemo(
    () => sectionVariantsByBaseId(sections),
    [sections],
  );
  const citationKeys = useMemo(
    () =>
      sections.reduce<string[]>((keys, section) => {
        for (const key of extractCitationKeys(section.content ?? '')) {
          if (!keys.includes(key)) keys.push(key);
        }
        return keys;
      }, []),
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
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Which wording each row is editing, keyed by the id of the base section that
  // owns the row. Rows expand independently here, unlike the Write tab's single
  // editor, so one shared selection — the composer's or a lone local id — would
  // make opening a second row change what the first one is editing.
  const [selectedSectionIdByBaseId, setSelectedSectionIdByBaseId] = useState<
    Record<string, string>
  >({});
  // Which row is mid-create rather than a single boolean: the Write tab has one
  // bar and can use a flag, but every row here draws its own, and one boolean
  // would put "Adding version…" on all of them at once.
  const [creatingVersionForSectionId, setCreatingVersionForSectionId] =
    useState<string | null>(null);

  // A version has no row of its own, so a composer-wide selection that lands on
  // one belongs to the row of the base it rewords.
  const composerSelectedVariantOfId = sections.find(
    (section) => section.id === selectedSectionId,
  )?.variantOfId;
  const composerSelectedBaseId = isNonEmptyString(composerSelectedVariantOfId)
    ? composerSelectedVariantOfId
    : selectedSectionId;

  useEffect(() => {
    if (
      composerSelectedBaseId === undefined ||
      !frontMatterSections.some(
        (section) => section.id === composerSelectedBaseId,
      )
    ) {
      return;
    }
    setExpandedSectionIds((current) =>
      new Set(current).add(composerSelectedBaseId),
    );
  }, [frontMatterSections, composerSelectedBaseId]);

  const reportUpdateFailure = () =>
    enqueueErrorSnackBar({ message: 'Could not update front-matter section' });

  // Until the author picks inside a row, it follows the composer's selection
  // when that points into this section — which is what makes "New version for
  // MDPI" open the version it just created, as the Write tab does. Rejected: an
  // effect copying the composer's id into local state, which would snap the row
  // back to the version every time a save refetched the sections.
  const selectedIdForRow = (baseSection: SectionLike): string => {
    const chosen = selectedSectionIdByBaseId[baseSection.id];
    if (isNonEmptyString(chosen)) return chosen;
    return composerSelectedBaseId === baseSection.id &&
      isNonEmptyString(selectedSectionId)
      ? selectedSectionId
      : baseSection.id;
  };

  // The refusal to write a second version for the same journal comes back as a
  // rejected promise and is shown as it was written, rather than being turned
  // into a generic failure the author cannot act on.
  const createSectionVersion = (baseSectionId: string) => {
    setCreatingVersionForSectionId(baseSectionId);
    void onCreateSectionVariant(baseSectionId)
      .catch((error: unknown) =>
        enqueueErrorSnackBar({
          message:
            error instanceof Error
              ? error.message
              : 'Could not add a journal version',
        }),
      )
      .finally(() => setCreatingVersionForSectionId(null));
  };

  return (
    <StyledArea aria-label="Front-matter sections">
      <H3Title title="Front-matter sections" />
      {frontMatterSections.length === 0 ? (
        <StyledHint>No additional front-matter sections.</StyledHint>
      ) : (
        frontMatterSections.map((section) => {
          const isExpanded = expandedSectionIds.has(section.id);
          const versions = versionsByBaseId.get(section.id) ?? [];
          const selectedId = selectedIdForRow(section);
          // A stale id — the version was deleted elsewhere — falls back to the
          // paper's own text rather than leaving the row with no editor.
          const editedSection =
            versions.find((version) => version.id === selectedId) ?? section;
          const activeVersion = isNonEmptyString(activeVariantKey)
            ? versions.find(
                (version) => version.variantProfileKey === activeVariantKey,
              )
            : undefined;
          // The header reports what this section will be when exported to the
          // journal now selected, counted against that journal's cap — the same
          // reading the outline row gives, so the two agree.
          const shownSection = activeVersion ?? section;
          const wordCount = shownSection.wordCount ?? 0;
          const wordLimit =
            isDefined(activeVersion) &&
            isDefined(activeVersion.wordLimit) &&
            activeVersion.wordLimit > 0
              ? activeVersion.wordLimit
              : null;
          const versionNote = isDefined(activeVersion)
            ? `Exports as ${activeJournalLabel ?? 'journal'} version`
            : `Has ${versions.length} journal ${versions.length === 1 ? 'version' : 'versions'}, none for ${activeJournalLabel ?? 'this journal'}`;
          return (
            <StyledSection key={section.id}>
              <StyledRowButton
                type="button"
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedSectionIds((current) => {
                    const next = new Set(current);
                    if (isExpanded) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  })
                }
              >
                {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
                <StyledHeading>
                  <StyledName>{section.name ?? 'Untitled section'}</StyledName>
                  {versions.length > 0 ? (
                    <StyledVersionNote title={versionNote}>
                      {versionNote}
                    </StyledVersionNote>
                  ) : null}
                </StyledHeading>
                <StyledBadge>
                  {sectionTypeLabel(section.sectionType)}
                </StyledBadge>
                <StyledWordCount
                  over={wordLimit !== null && wordCount > wordLimit}
                >
                  {wordLimit === null
                    ? `${wordCount} words`
                    : `${wordCount} / ${wordLimit} words`}
                </StyledWordCount>
              </StyledRowButton>
              {isExpanded ? (
                <StyledExpanded>
                  <StyledActions>
                    <StyledPlacement>
                      Placement
                      <select
                        aria-label={`Move ${section.name ?? 'section'} to another group`}
                        value={section.placement ?? 'FRONT_MATTER'}
                        onChange={(event) => {
                          if (isSectionPlacement(event.target.value)) {
                            void onChangePlacement(
                              section.id,
                              event.target.value,
                            ).catch(reportUpdateFailure);
                          }
                        }}
                      >
                        {PLACEMENTS.map((placement) => (
                          <option key={placement.value} value={placement.value}>
                            {placement.label}
                          </option>
                        ))}
                      </select>
                    </StyledPlacement>
                    <StyledCheckbox>
                      <input
                        type="checkbox"
                        aria-label="Include section in export"
                        checked={section.includeInExport !== false}
                        onChange={(event) =>
                          void onChangeIncludeInExport(
                            section.id,
                            event.target.checked,
                          ).catch(reportUpdateFailure)
                        }
                      />
                      Include in export
                    </StyledCheckbox>
                  </StyledActions>
                  {/* Placement and export inclusion above stay on the base
                      section even while a version is open: they are the shape
                      of the paper, which a version never changes — only the
                      words below it do. */}
                  <ManuscriptSectionVersionBar
                    baseSection={section}
                    versions={versions}
                    selectedSectionId={editedSection.id}
                    activeVariantKey={activeVariantKey}
                    activeJournalLabel={activeJournalLabel}
                    journalNameByVariantKey={journalNameByVariantKey}
                    isCreatingVersion={
                      creatingVersionForSectionId === section.id
                    }
                    onCreateVersion={createSectionVersion}
                    onSelectSection={(sectionId) =>
                      setSelectedSectionIdByBaseId((current) => ({
                        ...current,
                        [section.id]: sectionId,
                      }))
                    }
                  />
                  <ManuscriptSectionEditor
                    // Remounted per section so the editor loads the wording now
                    // selected instead of keeping the previous one's buffer.
                    key={editedSection.id}
                    citationKeys={citationKeys}
                    figures={figures}
                    initialMarkdown={editedSection.content ?? ''}
                    onPersist={(markdown) =>
                      onPersistSection(editedSection.id, markdown)
                    }
                    references={references}
                    style={style}
                  />
                </StyledExpanded>
              ) : null}
            </StyledSection>
          );
        })
      )}
    </StyledArea>
  );
};
