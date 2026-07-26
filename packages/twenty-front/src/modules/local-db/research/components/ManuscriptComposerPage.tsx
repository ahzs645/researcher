import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { H1Title } from 'twenty-ui/display';
import { Button, type SelectOption, TabButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptExportTab } from '@/local-db/research/components/composer/ManuscriptExportTab';
import { ManuscriptListLanding } from '@/local-db/research/components/composer/ManuscriptListLanding';
import { ManuscriptImportWizardRoot } from '@/local-db/research/import-wizard/components/ManuscriptImportWizardRoot';
import { useOpenManuscriptImportWizard } from '@/local-db/research/import-wizard/hooks/useOpenManuscriptImportWizard';
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
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { Select } from '@/ui/input/components/Select';
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

const MANUSCRIPT_TABLE_STYLES: ManuscriptTableStyle[] = [
  'ACADEMIC',
  'GRID',
  'SHADED_HEADER',
  'BORDERLESS',
];

const StyledPage = styled.div`
  box-sizing: border-box;
  display: flex;
  height: 100%;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
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
  const { openManuscriptImportWizard } = useOpenManuscriptImportWizard();
  const [isImportingNewManuscript, setIsImportingNewManuscript] =
    useState(false);
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

  // The importer only appends into an existing manuscript, so importing a new
  // paper means creating the shell first and discarding it if nothing lands.
  const startImportAsNewManuscript = async () => {
    if (isImportingNewManuscript) return;
    setIsImportingNewManuscript(true);
    const newManuscriptId = await composer.createManuscript();
    if (!isDefined(newManuscriptId)) {
      setIsImportingNewManuscript(false);
      return;
    }
    let didImport = false;
    openManuscriptImportWizard({
      manuscriptId: newManuscriptId,
      manuscriptName: 'Untitled manuscript',
      existingSectionCount: 0,
      existingSections: [],
      existingReferences: [],
      existingFigureRefKeys: [],
      onChanged: () => {
        didImport = true;
        void composer.refetchImportedRecords();
      },
      onClosed: () => {
        setIsImportingNewManuscript(false);
        if (didImport) composer.selectManuscript(newManuscriptId);
        else void composer.deleteManuscript(newManuscriptId);
      },
    });
  };

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
  const exportTableStyle =
    MANUSCRIPT_TABLE_STYLES.find(
      (tableStyle) => tableStyle === composer.effectiveStyle.tableStyle,
    ) ?? 'ACADEMIC';
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
              onClick={composer.clearManuscriptSelection}
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
            onAddSection={() => void composer.addSection()}
            onScaffoldSections={() => void composer.scaffoldSections()}
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
