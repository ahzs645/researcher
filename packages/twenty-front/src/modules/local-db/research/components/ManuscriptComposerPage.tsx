import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { H1Title } from 'twenty-ui/display';
import { type SelectOption, TabButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptExportTab } from '@/local-db/research/components/composer/ManuscriptExportTab';
import { ManuscriptFiguresTab } from '@/local-db/research/components/composer/ManuscriptFiguresTab';
import { ManuscriptReferencesTab } from '@/local-db/research/components/composer/ManuscriptReferencesTab';
import { ManuscriptSubmissionTab } from '@/local-db/research/components/composer/ManuscriptSubmissionTab';
import { ManuscriptTitlePageTab } from '@/local-db/research/components/composer/ManuscriptTitlePageTab';
import {
  type ManuscriptComposerTab,
  manuscriptComposerTabState,
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
  { id: 'titlePage', title: 'Title page' },
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
  const composer = useManuscriptComposer();
  const manuscriptOptions: SelectOption<string>[] = composer.manuscripts.map(
    (manuscript) => ({
      value: manuscript.id,
      label: manuscript.name ?? 'Untitled manuscript',
    }),
  );

  if (!isDefined(composer.manuscript)) {
    return (
      <StyledPage>
        <StyledContent>
          <H1Title title="Compose" />
          <StyledMeta>
            No manuscripts yet — create one under Work › Manuscripts.
          </StyledMeta>
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
  const selectFigureSection = (sectionId: string) => {
    composer.selectSection(sectionId);
    setManuscriptComposerTab('write');
  };

  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <H1Title title="Compose" />
          <Select
            dropdownId="compose-manuscript-select"
            options={manuscriptOptions}
            value={manuscript.id}
            onChange={composer.selectManuscript}
          />
        </StyledHeader>

        <StyledTabBar role="tablist" aria-label="Manuscript composer">
          {COMPOSER_TABS.map((tab) => (
            <TabButton
              key={tab.id}
              id={`composer-${tab.id}`}
              title={tab.title}
              active={manuscriptComposerTab === tab.id}
              onClick={() => setManuscriptComposerTab(tab.id)}
            />
          ))}
        </StyledTabBar>

        {manuscriptComposerTab === 'write' ? (
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
          />
        ) : null}

        {manuscriptComposerTab === 'figures' ? (
          <ManuscriptFiguresTab
            manuscriptId={manuscript.id}
            figures={composer.figures}
            sections={composer.sections}
            style={composer.effectiveStyle}
            onChanged={() => void composer.refetchFigures()}
            onSelectSection={selectFigureSection}
          />
        ) : null}

        {manuscriptComposerTab === 'titlePage' ? (
          <ManuscriptTitlePageTab
            key={`${manuscript.id}-${composer.sections.find((section) => section.sectionType === 'KEYWORDS')?.id ?? 'no-keywords'}`}
            manuscript={manuscript}
            sections={composer.sections}
            style={composer.effectiveStyle}
            onSave={composer.saveTitlePageDetails}
            onAddKeywordsSection={composer.addKeywordsSection}
            onDeleteSection={composer.deleteSection}
          />
        ) : null}

        {manuscriptComposerTab === 'references' ? (
          <ManuscriptReferencesTab
            manuscriptId={manuscript.id}
            references={composer.references}
            onChanged={() => void composer.refetchReferences()}
          />
        ) : null}

        {manuscriptComposerTab === 'submission' ? (
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

        {manuscriptComposerTab === 'export' &&
        isDefined(composer.bundle) &&
        isDefined(composer.portableSource) ? (
          <ManuscriptExportTab
            manuscript={manuscript}
            bundle={composer.bundle}
            portableSource={composer.portableSource}
            journals={composer.journals}
            selectedJournalId={composer.journalId}
            style={composer.style}
            styleOverrides={composer.styleOverrides}
            onSelectJournal={composer.selectJournal}
            onSaveStyleOverrides={composer.saveStyleOverrides}
          />
        ) : null}
      </StyledContent>
    </StyledPage>
  );
};
