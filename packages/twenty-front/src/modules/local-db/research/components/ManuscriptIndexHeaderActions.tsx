import { useNavigate } from 'react-router-dom';
import { Button } from 'twenty-ui/input';

import { ManuscriptImportWizardRoot } from '@/local-db/research/import-wizard/components/ManuscriptImportWizardRoot';
import { useImportAsNewManuscript } from '@/local-db/research/import-wizard/hooks/useImportAsNewManuscript';
import {
  buildManuscriptComposerPath,
  MANUSCRIPT_OBJECT_NAME_PLURAL,
} from '@/local-db/research/manuscriptComposerRoute';

type ManuscriptIndexHeaderActionsProps = {
  objectNamePlural: string;
};

const ManuscriptIndexHeaderActionsContent = () => {
  const navigate = useNavigate();
  const { isImportingNewManuscript, startImportAsNewManuscript } =
    useImportAsNewManuscript({
      // A freshly imported paper is only useful in the editor, so land there
      // rather than dropping the user back on the table they started from.
      onImported: (manuscriptId) =>
        navigate(buildManuscriptComposerPath(manuscriptId)),
    });

  return (
    <>
      <Button
        title="Import as new manuscript…"
        variant="primary"
        accent="blue"
        size="small"
        disabled={isImportingNewManuscript}
        onClick={() => void startImportAsNewManuscript()}
      />
      <ManuscriptImportWizardRoot />
    </>
  );
};

// The Manuscripts table is the single door to the composer, so bringing an
// existing paper in has to start here — not only from inside the editor.
export const ManuscriptIndexHeaderActions = ({
  objectNamePlural,
}: ManuscriptIndexHeaderActionsProps) => {
  if (objectNamePlural !== MANUSCRIPT_OBJECT_NAME_PLURAL) return null;

  return <ManuscriptIndexHeaderActionsContent />;
};
