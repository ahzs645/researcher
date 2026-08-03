import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useManuscriptSaveStatus } from '@/local-db/research/components/composer/ManuscriptSaveStatusContext';

export type ManuscriptSubmissionTracking = {
  journalConfirmed: boolean;
  status: string;
  submittedAt: string;
  version: string;
};

type ManuscriptSubmissionTrackingPanelProps = {
  initialValues: ManuscriptSubmissionTracking;
  onSave: (values: ManuscriptSubmissionTracking) => Promise<void>;
};

const StyledPanel = styled.section`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  margin: 0;
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: grid;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledControl = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const today = () => new Date().toISOString().slice(0, 10);

export const ManuscriptSubmissionTrackingPanel = ({
  initialValues,
  onSave,
}: ManuscriptSubmissionTrackingPanelProps) => {
  const [values, setValues] = useState(initialValues);
  const { markUnsaved, trackSave } = useManuscriptSaveStatus();
  const update = (next: Partial<ManuscriptSubmissionTracking>) => {
    setValues((current) => ({ ...current, ...next }));
    markUnsaved();
  };
  const save = (nextValues = values) => trackSave(() => onSave(nextValues));

  return (
    <StyledPanel aria-labelledby="submission-tracking-title">
      <StyledTitle id="submission-tracking-title">
        Submission tracking
      </StyledTitle>
      <StyledGrid>
        <StyledField>
          Status
          <StyledSelect
            value={values.status}
            onChange={(event) => update({ status: event.target.value })}
          >
            <option value="OUTLINE">Outline</option>
            <option value="DRAFTING">Drafting</option>
            <option value="INTERNAL_REVIEW">Internal review</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="REVISION">In revision</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="PUBLISHED">Published</option>
          </StyledSelect>
        </StyledField>
        <StyledField>
          Submission date
          <StyledControl
            type="date"
            value={values.submittedAt}
            onChange={(event) => update({ submittedAt: event.target.value })}
          />
        </StyledField>
        <StyledField>
          Version / round
          <StyledControl
            value={values.version}
            placeholder="e.g. Initial, R1, v2"
            onChange={(event) => update({ version: event.target.value })}
          />
        </StyledField>
      </StyledGrid>
      <label>
        <input
          type="checkbox"
          checked={values.journalConfirmed}
          onChange={(event) =>
            update({ journalConfirmed: event.target.checked })
          }
        />{' '}
        Journal and article type confirmed
      </label>
      <StyledActions>
        <Button
          title="Save tracking"
          variant="secondary"
          size="small"
          onClick={() => void save()}
        />
        <Button
          title="Mark as submitted"
          variant="primary"
          accent="blue"
          size="small"
          onClick={() => {
            const next = {
              ...values,
              status: 'SUBMITTED',
              submittedAt: values.submittedAt || today(),
            };
            setValues(next);
            void save(next);
          }}
        />
      </StyledActions>
    </StyledPanel>
  );
};
