import { styled } from '@linaria/react';
import { useEffect } from 'react';
import { AppPath } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { H1Title, IconListDetails } from 'twenty-ui/display';
import { Button, type SelectOption, TabButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { addTwentyDataBridgeModeToPath } from '@/local-db/twenty-local/addTwentyDataBridgeModeToPath';
import { ManuscriptExportTab } from '@/local-db/research/components/composer/ManuscriptExportTab';
import { ManuscriptListLanding } from '@/local-db/research/components/composer/ManuscriptListLanding';
import { ManuscriptImportWizardRoot } from '@/local-db/research/import-wizard/components/ManuscriptImportWizardRoot';
import { useImportAsNewManuscript } from '@/local-db/research/import-wizard/hooks/useImportAsNewManuscript';
import {
  MANUSCRIPT_OBJECT_NAME_PLURAL,
  MANUSCRIPT_OBJECT_NAME_SINGULAR,
} from '@/local-db/research/manuscriptComposerRoute';
import { resolveManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptTableStyleOptions';
import { ManuscriptFiguresTab } from '@/local-db/research/components/composer/ManuscriptFiguresTab';
import { ManuscriptReferencesTab } from '@/local-db/research/components/composer/ManuscriptReferencesTab';
import { ManuscriptSubmissionTab } from '@/local-db/research/components/composer/ManuscriptSubmissionTab';
import { ManuscriptTitlePageTab } from '@/local-db/research/components/composer/ManuscriptTitlePageTab';
import {
  type ManuscriptComposerTab,
  manuscriptComposerTabState,
  normalizeManuscriptComposerTab,
} from '@/local-db/research/components/composer/manuscriptComposerTabState';
import { ManuscriptWriteTab } from '@/local-db/research/components/composer/ManuscriptWriteTab';
import { useManuscriptComposer } from '@/local-db/research/components/composer/useManuscriptComposer';
import { Select } from '@/ui/input/components/Select';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

const COMPOSER_TABS: Array<{
  id: ManuscriptComposerTab;
  title: string;
}> = [
  { id: 'write', title: 'Write' },
  { id: 'titlePage', title: 'Front matter' },
  { id: 'figures', title: 'Figures & tables' },
  { id: 'references', title: 'References' },
  { id: 'submission', title: 'Submission' },
  { id: 'export', title: 'Export' },
];

// The Manuscripts object list is the door into the composer, so both the
// "All manuscripts" escape hatch and the per-paper "Record details" link go
// back to the CRM surface rather than to a second, composer-local list.
// Resolved per render, not at module scope: the bridge mode is only known once
// the app has booted.
const buildManuscriptsIndexPath = () =>
  addTwentyDataBridgeModeToPath(
    getAppPath(AppPath.RecordIndexPage, {
      objectNamePlural: MANUSCRIPT_OBJECT_NAME_PLURAL,
    }),
  );

const buildManuscriptRecordPath = (manuscriptId: string) =>
  addTwentyDataBridgeModeToPath(
    getAppPath(AppPath.RecordShowPage, {
      objectNameSingular: MANUSCRIPT_OBJECT_NAME_SINGULAR,
      objectRecordId: manuscriptId,
    }),
  );

const StyledPage = styled.div`
  box-sizing: border-box;
  display: flex;
  height: 100%;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
  /* Expanding an outline group changes the page's height. Without a reserved
     gutter the scrollbar appearing narrows this container, which reflows the
     whole write grid — outline column included. */
  scrollbar-gutter: stable;
  width: 100%;
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-width: 1180px;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
  justify-content: space-between;

  & h2 {
    margin-bottom: 0;
  }
`;

const StyledHeaderActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTabBar = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  min-height: 40px;
  overflow-x: auto;
  user-select: none;
`;

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

export const ManuscriptComposerPage = () => {
  const [manuscriptComposerTab, setManuscriptComposerTab] = useAtomState(
    manuscriptComposerTabState,
  );
  const activeManuscriptComposerTab = normalizeManuscriptComposerTab(
    manuscriptComposerTab,
  );
  const composer = useManuscriptComposer();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const { isImportingNewManuscript, startImportAsNewManuscript } =
    useImportAsNewManuscript({
      onImported: composer.selectManuscript,
      onManuscriptsChanged: () => void composer.refetchImportedRecords(),
    });
  const manuscriptOptions: SelectOption<string>[] = composer.manuscripts.map(
    (manuscript) => ({
      value: manuscript.id,
      label: manuscript.name ?? 'Untitled manuscript',
    }),
  );

  useEffect(() => {
    if (activeManuscriptComposerTab !== manuscriptComposerTab) {
      setManuscriptComposerTab('write');
    }
  }, [
    activeManuscriptComposerTab,
    manuscriptComposerTab,
    setManuscriptComposerTab,
  ]);

  // Nothing selected yet: list the papers instead of guessing which one to open.
  if (!isDefined(composer.manuscript)) {
    return (
      <StyledPage>
        <StyledContent>
          <StyledHeader>
            <H1Title title="Compose" />
            <Button
              title="Import as new manuscript…"
              variant="primary"
              accent="blue"
              size="small"
              disabled={isImportingNewManuscript}
              onClick={() => {
                void startImportAsNewManuscript();
              }}
            />
          </StyledHeader>
          {composer.manuscripts.length === 0 ? (
            <StyledMeta>
              No manuscripts yet — import a document or portable research ZIP,
              or create one under Work › Manuscripts.
            </StyledMeta>
          ) : (
            <>
              <StyledMeta>
                Select a manuscript to open in the composer.
              </StyledMeta>
              <ManuscriptListLanding
                manuscripts={composer.manuscripts}
                sections={composer.allSections}
                onOpen={composer.selectManuscript}
              />
            </>
          )}
          <ManuscriptImportWizardRoot />
        </StyledContent>
      </StyledPage>
    );
  }

  const manuscript = composer.manuscript;
  const linkedJournal = composer.journals.find(
    (journal) => journal.id === manuscript.targetJournal?.id,
  );
  // The Export tab falls back to the first journal when none is linked; the
  // submission checklist must resolve the SAME effective journal or the two
  // tabs contradict each other.
  const effectiveJournal =
    linkedJournal ??
    composer.journals.find((journal) => journal.id === composer.journalId);
  const exportTableStyle = resolveManuscriptTableStyle(
    composer.effectiveStyle.tableStyle,
  );
  const selectRelatedSection = (sectionId: string) => {
    composer.selectSection(sectionId);
    setManuscriptComposerTab(
      composer.sections.find((section) => section.id === sectionId)
        ?.placement === 'FRONT_MATTER'
        ? 'titlePage'
        : 'write',
    );
  };

  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <H1Title title="Compose" />
          <StyledHeaderActions>
            <Button
              title="All manuscripts"
              variant="secondary"
              size="small"
              to={buildManuscriptsIndexPath()}
            />
            <Button
              title="Record details"
              Icon={IconListDetails}
              variant="secondary"
              size="small"
              to={buildManuscriptRecordPath(manuscript.id)}
            />
            <Button
              title="Duplicate"
              variant="secondary"
              size="small"
              disabled={composer.isDuplicating}
              onClick={() =>
                void composer
                  .duplicateCurrentManuscript()
                  .then(() =>
                    enqueueSuccessSnackBar({
                      message: 'Created a complete manuscript copy',
                    }),
                  )
                  .catch(() =>
                    enqueueErrorSnackBar({
                      message: 'Could not duplicate manuscript',
                    }),
                  )
              }
            />
            <Select
              dropdownId="compose-manuscript-select"
              options={manuscriptOptions}
              value={manuscript.id}
              onChange={composer.selectManuscript}
            />
          </StyledHeaderActions>
        </StyledHeader>

        <StyledTabBar role="tablist" aria-label="Manuscript composer">
          {COMPOSER_TABS.map((tab) => (
            <TabButton
              key={tab.id}
              id={`composer-${tab.id}`}
              title={tab.title}
              active={activeManuscriptComposerTab === tab.id}
              onClick={() => setManuscriptComposerTab(tab.id)}
            />
          ))}
        </StyledTabBar>

        {activeManuscriptComposerTab === 'write' ? (
          <ManuscriptWriteTab
            manuscriptId={manuscript.id}
            manuscriptName={manuscript.name}
            sections={composer.sections}
            figures={composer.figures}
            references={composer.references}
            selectedSection={composer.selectedSection}
            style={composer.effectiveStyle}
            exportTableStyle={exportTableStyle}
            targetJournal={linkedJournal}
            submissionExtras={manuscript.submissionExtras}
            competingInterests={manuscript.competingInterests}
            onEditFrontMatter={() => setManuscriptComposerTab('titlePage')}
            onSelectSection={composer.selectSection}
            onChangeSectionPlacement={(sectionId, placement) =>
              void composer.changeSectionPlacement(sectionId, placement)
            }
            onPersistSection={composer.persistSection}
            onPersistSectionError={() =>
              enqueueErrorSnackBar({
                message: 'Could not save section changes',
              })
            }
            onAddSection={(draft) => void composer.addSection(draft)}
            onScaffoldSections={() => void composer.scaffoldSections()}
            missingScaffold={composer.missingScaffold}
            onSectionMetadataChanged={() =>
              void composer.refetchSectionsAndFigures()
            }
            onImported={() => void composer.refetchImportedRecords()}
            onDeleteDuplicateSections={composer.deleteSections}
          />
        ) : null}

        {activeManuscriptComposerTab === 'figures' ? (
          <ManuscriptFiguresTab
            manuscriptId={manuscript.id}
            figures={composer.figures}
            sections={composer.sections}
            style={composer.effectiveStyle}
            onChanged={() => void composer.refetchFigures()}
            onSelectSection={selectRelatedSection}
          />
        ) : null}

        {activeManuscriptComposerTab === 'titlePage' ? (
          <ManuscriptTitlePageTab
            key={`${manuscript.id}-${composer.sections.find((section) => section.sectionType === 'KEYWORDS')?.id ?? 'no-keywords'}`}
            manuscript={manuscript}
            sections={composer.sections}
            figures={composer.figures}
            references={composer.references}
            selectedSectionId={composer.selectedSection?.id}
            style={composer.effectiveStyle}
            onSave={composer.saveTitlePageDetails}
            onAddKeywordsSection={composer.addKeywordsSection}
            onChangeSectionIncludeInExport={
              composer.changeSectionIncludeInExport
            }
            onChangeSectionPlacement={composer.changeSectionPlacement}
            onDeleteSection={composer.deleteSection}
            onPersistSection={composer.persistSectionById}
          />
        ) : null}

        {activeManuscriptComposerTab === 'references' ? (
          <ManuscriptReferencesTab
            manuscriptId={manuscript.id}
            sections={composer.sections}
            figures={composer.figures}
            references={composer.references}
            onChanged={() => void composer.refetchReferences()}
            style={composer.effectiveStyle}
            onApplyCitationLinks={composer.persistCitationLinkedSections}
            onDeleteReferences={composer.deleteReferences}
            onMergeDuplicateReferences={composer.mergeDuplicateReferences}
            onUpdateReference={composer.updateReference}
            onSelectSection={selectRelatedSection}
            onGoToExport={() => setManuscriptComposerTab('export')}
          />
        ) : null}

        {activeManuscriptComposerTab === 'submission' ? (
          <ManuscriptSubmissionTab
            manuscript={manuscript}
            template={effectiveJournal}
            isExplicitTarget={isDefined(linkedJournal)}
            onConfirmTargetJournal={() =>
              isDefined(effectiveJournal)
                ? composer.selectJournal(effectiveJournal.id)
                : Promise.reject(new Error('No journal is available'))
            }
            sections={composer.sections}
            onSave={composer.saveSubmissionDetails}
            onPickTargetJournal={() => setManuscriptComposerTab('export')}
            onSaveRequirementValues={(values) =>
              composer.saveSubmissionRequirementValues(values, effectiveJournal)
            }
            onSaveRequirements={(requirements) =>
              composer.saveJournalSubmissionRequirements(
                requirements,
                effectiveJournal,
              )
            }
            onKeepJournalValue={(key, value) =>
              composer.keepJournalSubmissionValue(key, value, effectiveJournal)
            }
          />
        ) : null}

        {activeManuscriptComposerTab === 'export' &&
        isDefined(composer.bundle) &&
        isDefined(composer.portableSource) ? (
          <ManuscriptExportTab
            manuscript={manuscript}
            bundle={composer.bundle}
            portableSource={composer.portableSource}
            journals={composer.journals}
            selectedJournalId={composer.journalId}
            style={composer.effectiveStyle}
            styleOverrides={composer.styleOverrides}
            onSelectJournal={composer.selectJournal}
            onSaveStyleOverrides={composer.saveStyleOverrides}
          />
        ) : null}
      </StyledContent>
    </StyledPage>
  );
};
