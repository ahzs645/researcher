import { styled } from '@linaria/react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportWizardRoot } from '@/local-db/research/import-wizard/components/ManuscriptImportWizardRoot';
import { useOpenManuscriptImportWizard } from '@/local-db/research/import-wizard/hooks/useOpenManuscriptImportWizard';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { type ExistingImportReference } from '@/local-db/research/manuscript/manuscriptImportPrepare';

type ManuscriptImportPanelProps = {
  manuscriptId: string;
  manuscriptName?: string | null;
  existingSectionCount: number;
  existingReferences: ExistingImportReference[];
  existingFigureRefKeys: string[];
  onChanged: () => void;
  exportTableStyle?: ManuscriptTableStyle;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

export const ManuscriptImportPanel = ({
  manuscriptId,
  manuscriptName,
  existingSectionCount,
  existingReferences,
  existingFigureRefKeys,
  onChanged,
  exportTableStyle,
}: ManuscriptImportPanelProps) => {
  const { openManuscriptImportWizard } = useOpenManuscriptImportWizard();

  return (
    <StyledPanel>
      <StyledHint>
        Import a Word/PDF manuscript, Markdown or text, or a portable research
        ZIP. Nothing is saved until you review and confirm the result.
      </StyledHint>
      <Button
        title="Import document…"
        variant="primary"
        accent="blue"
        size="small"
        onClick={() =>
          openManuscriptImportWizard({
            manuscriptId,
            manuscriptName,
            existingSectionCount,
            existingReferences,
            existingFigureRefKeys,
            onChanged,
            exportTableStyle,
          })
        }
      />
      <ManuscriptImportWizardRoot />
    </StyledPanel>
  );
};
