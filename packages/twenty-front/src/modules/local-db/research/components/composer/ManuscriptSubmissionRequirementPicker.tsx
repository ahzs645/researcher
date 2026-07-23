import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  SUBMISSION_REQUIREMENT_CATALOG,
  type JournalSubmissionRequirement,
} from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

type ManuscriptSubmissionRequirementPickerProps = {
  journalName: string;
  usedKeys: Set<string>;
  onAdd: (requirement: JournalSubmissionRequirement) => void;
};

const StyledAdd = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledPicker = styled.details`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};

  & > summary {
    cursor: pointer;
    width: fit-content;
  }
`;

const StyledControl = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-height: 30px;
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-height: 32px;
`;

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const CUSTOM = '__CUSTOM__';

const slugRequirementKey = (label: string): string =>
  label
    .trim()
    .toLocaleUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const ManuscriptSubmissionRequirementPicker = ({
  journalName,
  usedKeys,
  onAdd,
}: ManuscriptSubmissionRequirementPickerProps) => {
  const [selectedKey, setSelectedKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [required, setRequired] = useState(true);
  const unusedCatalog = SUBMISSION_REQUIREMENT_CATALOG.filter(
    (definition) => !usedKeys.has(definition.key),
  );
  const key =
    selectedKey === CUSTOM ? slugRequirementKey(customLabel) : selectedKey;
  const add = () => {
    if (key.length === 0 || usedKeys.has(key)) return;
    onAdd({
      key,
      required,
      ...(selectedKey === CUSTOM ? { label: customLabel.trim() } : {}),
    });
    setSelectedKey('');
    setCustomLabel('');
  };

  return (
    <StyledPicker>
      <summary>Add requirement</summary>
      <StyledAdd>
        <StyledSelect
          aria-label="Requirement to add"
          value={selectedKey}
          onChange={(event) => setSelectedKey(event.target.value)}
        >
          <option value="">Choose requirement…</option>
          {unusedCatalog.map((definition) => (
            <option key={definition.key} value={definition.key}>
              {definition.label}
            </option>
          ))}
          <option value={CUSTOM}>Custom requirement…</option>
        </StyledSelect>
        {selectedKey === CUSTOM ? (
          <StyledControl
            aria-label="Custom requirement label"
            placeholder="Requirement label"
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
          />
        ) : null}
        <label>
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />{' '}
          Required
        </label>
        <Button
          title="Add"
          variant="secondary"
          size="small"
          disabled={key.length === 0 || usedKeys.has(key)}
          onClick={add}
        />
        <StyledMeta>Edits the {journalName} checklist.</StyledMeta>
      </StyledAdd>
    </StyledPicker>
  );
};
