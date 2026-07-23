import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptExportProfileSummary } from '@/local-db/research/components/ManuscriptExportProfileSummary';
import { ManuscriptExportStyleControls } from '@/local-db/research/components/ManuscriptExportStyleControls';
import {
  StyledExportCard,
  StyledExportCardDescription,
  StyledExportCardHeader,
  StyledExportCardTitle,
} from '@/local-db/research/components/composer/export/ManuscriptExportCard';
import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { type ManuscriptExportStyleOverrides } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptExportStyleCardProps = {
  bundle: ManuscriptBundle;
  isSavingSettings: boolean;
  style: JournalStyle;
  styleOverrides: ManuscriptExportStyleOverrides;
  onChange: (updates: ManuscriptExportStyleOverrides) => void;
  onSave: () => void;
};

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSaveNote = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptExportStyleCard = ({
  bundle,
  isSavingSettings,
  style,
  styleOverrides,
  onChange,
  onSave,
}: ManuscriptExportStyleCardProps) => (
  <StyledExportCard>
    <StyledExportCardHeader>
      <StyledExportCardTitle>Style settings</StyledExportCardTitle>
      <StyledExportCardDescription>
        Expand only the group you need to customize.
      </StyledExportCardDescription>
    </StyledExportCardHeader>
    <ManuscriptExportProfileSummary bundle={bundle} />
    <ManuscriptExportStyleControls
      style={style}
      styleOverrides={styleOverrides}
      onChange={onChange}
    />
    <StyledActions>
      <Button
        title={isSavingSettings ? 'Saving settings…' : 'Save export settings'}
        variant="primary"
        accent="blue"
        size="small"
        disabled={isSavingSettings}
        onClick={onSave}
      />
      <StyledSaveNote>
        Saved settings apply only to this manuscript; the journal profile
        remains reusable.
      </StyledSaveNote>
    </StyledActions>
  </StyledExportCard>
);
