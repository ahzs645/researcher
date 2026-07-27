import { styled } from '@linaria/react';
import { IconPencil } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportPanel } from '@/local-db/research/components/ManuscriptImportPanel';
import { useManuscriptImportTarget } from '@/local-db/research/hooks/useManuscriptImportTarget';
import {
  buildManuscriptComposerPath,
  MANUSCRIPT_OBJECT_NAME_SINGULAR,
} from '@/local-db/research/manuscriptComposerRoute';

type ManuscriptRecordHeaderActionsProps = {
  objectNameSingular: string;
  recordId: string;
};

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const ManuscriptRecordHeaderActionsContent = ({
  recordId,
}: {
  recordId: string;
}) => {
  const importTarget = useManuscriptImportTarget(recordId);

  return (
    <StyledActions>
      <ManuscriptImportPanel
        compact
        variant="secondary"
        manuscriptId={recordId}
        manuscriptName={importTarget.manuscriptName}
        existingSectionCount={importTarget.existingSectionCount}
        existingSections={importTarget.existingSections}
        existingReferences={importTarget.existingReferences}
        existingFigureRefKeys={importTarget.existingFigureRefKeys}
        exportTableStyle={importTarget.exportTableStyle}
        targetJournal={importTarget.targetJournal}
        submissionExtras={importTarget.submissionExtras}
        competingInterests={importTarget.competingInterests}
        onChanged={() => void importTarget.refetchImportedRecords()}
      />
      <Button
        title="Open in composer"
        Icon={IconPencil}
        variant="primary"
        accent="blue"
        size="small"
        to={buildManuscriptComposerPath(recordId)}
      />
    </StyledActions>
  );
};

// The CRM record page keeps its own value (relations, notes, tasks, timeline),
// so instead of redirecting it we give it the two doors it was missing: into
// the editor, and into the importer for the paper you are already looking at.
export const ManuscriptRecordHeaderActions = ({
  objectNameSingular,
  recordId,
}: ManuscriptRecordHeaderActionsProps) => {
  if (objectNameSingular !== MANUSCRIPT_OBJECT_NAME_SINGULAR) return null;

  return <ManuscriptRecordHeaderActionsContent recordId={recordId} />;
};
