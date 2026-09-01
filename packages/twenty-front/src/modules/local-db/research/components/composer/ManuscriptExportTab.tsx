import { styled } from '@linaria/react';
import { useMemo } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptExportPanel } from '@/local-db/research/components/ManuscriptExportPanel';
import { ManuscriptBibliographyPreview } from '@/local-db/research/components/composer/export/ManuscriptBibliographyPreview';
import {
  type JournalRecord,
  type ManuscriptRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import { useManuscriptReviewRounds } from '@/local-db/research/components/composer/useManuscriptReviewRounds';
import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ManuscriptExportStyleOverrides } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type PortableManuscriptSource } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import { submissionReviewResponseMarkdown } from '@/local-db/research/manuscript/manuscriptReviewResponse';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';
import { type SubmissionCheckTarget } from '@/local-db/research/manuscript/manuscriptSubmission';

type ManuscriptExportTabProps = {
  manuscript: ManuscriptRecord;
  bundle: ManuscriptBundle;
  portableSource: PortableManuscriptSource;
  journals: JournalRecord[];
  selectedJournalId: string | null;
  style: JournalStyle;
  styleOverrides: ManuscriptExportStyleOverrides;
  onSelectJournal: (journalId: string) => void;
  onSaveStyleOverrides: (
    overrides: ManuscriptExportStyleOverrides,
  ) => Promise<void>;
  onNavigateToFix: (target: SubmissionCheckTarget) => void;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

export const ManuscriptExportTab = ({
  manuscript,
  bundle,
  portableSource,
  journals,
  selectedJournalId,
  style,
  styleOverrides,
  onSelectJournal,
  onSaveStyleOverrides,
  onNavigateToFix,
}: ManuscriptExportTabProps) => {
  const { rounds } = useManuscriptReviewRounds(manuscript.id);
  // The rounds ride along in the portable package, so a paper restored on
  // another machine comes back with the answers written to its reviewers
  // rather than an empty Prepare-submission tab.
  const portableSourceWithRounds = useMemo(
    () => ({ ...portableSource, reviewRounds: rounds }),
    [portableSource, rounds],
  );

  return (
    <StyledTab>
      <ManuscriptExportPanel
        key={`manuscript-export-${manuscript.id}`}
        manuscriptId={manuscript.id}
        bundle={bundle}
        journals={journals.map((journal) => ({
          id: journal.id,
          name: journal.name ?? 'Journal',
        }))}
        selectedJournalId={selectedJournalId}
        onSelectJournal={onSelectJournal}
        initialStyleOverrides={styleOverrides}
        onSaveStyleOverrides={onSaveStyleOverrides}
        materials={{
          coverLetter: manuscript.coverLetter,
          highlights: manuscript.highlights,
          competingInterests: manuscript.competingInterests,
          suggestedReviewers: manuscript.suggestedReviewers,
          submissionExtras: manuscript.submissionExtras,
          // A resubmission's point-by-point response, so the package a journal
          // receives carries the answers the author already wrote here.
          responseToReviewers: submissionReviewResponseMarkdown(
            rounds,
            bundle.sourceInput.sections,
            bundle.metadata.title,
          ),
        }}
        portableSource={portableSourceWithRounds}
        onNavigateToFix={onNavigateToFix}
      />
      <ManuscriptBibliographyPreview
        citationKeys={bundle.citedKeys}
        styleId={style.citationStyleId ?? ''}
        fallback={bundle.bibliography}
        references={bundle.sourceInput.references}
      />
    </StyledTab>
  );
};
