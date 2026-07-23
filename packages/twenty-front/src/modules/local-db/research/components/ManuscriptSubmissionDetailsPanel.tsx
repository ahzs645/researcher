import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  StyledTitlePageCard,
  StyledTitlePageField,
  StyledTitlePageHeading,
  StyledTitlePageHint,
  StyledTitlePageInput,
  StyledTitlePageTextarea,
} from '@/local-db/research/components/composer/manuscriptTitlePageStyles';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

export type ManuscriptSubmissionDetails = {
  supplementTitle?: string | null;
  supplementAuthorLine?: string | null;
  supplementAffiliations?: string | null;
};

type ManuscriptSubmissionDetailsPanelProps = {
  initialValues: ManuscriptSubmissionDetails;
  onSave: (values: ManuscriptSubmissionDetails) => Promise<void>;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledWideField = styled(StyledTitlePageField)`
  grid-column: 1 / -1;
`;

export const ManuscriptSubmissionDetailsPanel = ({
  initialValues,
  onSave,
}: ManuscriptSubmissionDetailsPanelProps) => {
  const [values, setValues] = useState(initialValues);
  const [isSaving, setIsSaving] = useState(false);
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const updateValue = (
    field: keyof ManuscriptSubmissionDetails,
    value: string,
  ) => setValues((current) => ({ ...current, [field]: value }));

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(values);
      enqueueSuccessSnackBar({ message: 'Supplement details saved' });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not save supplement details' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledPanel>
      <StyledTitlePageCard>
        <StyledTitlePageHeading>
          Supplement cover overrides
        </StyledTitlePageHeading>
        <StyledTitlePageHint>
          Leave these blank to reuse the main manuscript title, linked authors,
          and ordered affiliations.
        </StyledTitlePageHint>
        <StyledGrid>
          <StyledTitlePageField>
            Supplement title
            <StyledTitlePageInput
              aria-label="Supplement title"
              value={values.supplementTitle ?? ''}
              onChange={(event) =>
                updateValue('supplementTitle', event.target.value)
              }
            />
          </StyledTitlePageField>
          <StyledWideField>
            Supplement author line
            <StyledTitlePageTextarea
              aria-label="Supplement author line"
              value={values.supplementAuthorLine ?? ''}
              onChange={(event) =>
                updateValue('supplementAuthorLine', event.target.value)
              }
            />
          </StyledWideField>
          <StyledWideField>
            Supplement affiliations
            <StyledTitlePageTextarea
              aria-label="Supplement affiliations"
              value={values.supplementAffiliations ?? ''}
              onChange={(event) =>
                updateValue('supplementAffiliations', event.target.value)
              }
            />
          </StyledWideField>
        </StyledGrid>
      </StyledTitlePageCard>
      <div>
        <Button
          title={isSaving ? 'Saving…' : 'Save supplement details'}
          variant="primary"
          accent="blue"
          size="small"
          disabled={isSaving}
          onClick={save}
        />
      </div>
    </StyledPanel>
  );
};
