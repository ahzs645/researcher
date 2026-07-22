import { styled } from '@linaria/react';
import { H2Title } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptCslBibliography } from '@/local-db/research/components/ManuscriptCslBibliography';
import { ManuscriptExportPanel } from '@/local-db/research/components/ManuscriptExportPanel';
import {
  type JournalRecord,
  type ManuscriptRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ManuscriptExportStyleOverrides } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type PortableManuscriptSource } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';

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
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  & h2 {
    margin-bottom: 0;
  }
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
}: ManuscriptExportTabProps) => (
  <StyledTab>
    <H2Title title="Export" />
    <ManuscriptExportPanel
      key={`manuscript-export-${manuscript.id}`}
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
      }}
      portableSource={portableSource}
    />
    <ManuscriptCslBibliography
      cslItems={bundle.cslJson}
      citedKeys={bundle.citedKeys}
      styleId={style.citationStyleId ?? ''}
      fallback={bundle.bibliography}
    />
  </StyledTab>
);
