import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ImportedSectionDraft } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type ExistingSectionMatch } from '@/local-db/research/manuscript/manuscriptSectionDedupe';

type ManuscriptImportReviewSectionRowProps = {
  section: ImportedSectionDraft;
  sectionIndex: number;
  existingMatch?: ExistingSectionMatch;
  importAnyway: boolean;
  onChange: (update: Partial<ImportedSectionDraft>) => void;
  onChangeImportAnyway: (importAnyway: boolean) => void;
};

const SECTION_TYPES = [
  'TITLE_PAGE',
  'ABSTRACT',
  'KEYWORDS',
  'INTRODUCTION',
  'BACKGROUND',
  'METHODS',
  'RESULTS',
  'DISCUSSION',
  'CONCLUSION',
  'ACKNOWLEDGMENTS',
  'AUTHOR_CONTRIBUTIONS',
  'FUNDING',
  'CONFLICTS',
  'DATA_AVAILABILITY',
  'ETHICS',
  'REFERENCES',
  'APPENDIX',
  'SUPPLEMENT',
  'OTHER',
] as const;

const SECTION_PLACEMENTS = [
  'FRONT_MATTER',
  'MAIN',
  'BACK_MATTER',
  'SUPPLEMENT',
] as const;

const optionLabel = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

const StyledSectionRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns:
    minmax(180px, 1fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr)
    auto;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  min-width: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledCheckbox = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledPreview = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 1 / -1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledDuplicateNote = styled.span`
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 1 / -1;
`;

const StyledImportAnyway = styled(StyledCheckbox)`
  grid-column: 1 / -1;
`;

const duplicateNote = (
  match: ExistingSectionMatch | undefined,
): string | undefined => {
  if (match?.similarity === 'identical') {
    return 'Duplicate of existing section — will import excluded';
  }
  if (match?.similarity === 'similar') {
    return 'Similar to existing section — review before importing';
  }
  if (match?.similarity === 'different') {
    return 'Existing singleton section has different content — review before importing';
  }
  return undefined;
};

export const ManuscriptImportReviewSectionRow = ({
  section,
  sectionIndex,
  existingMatch,
  importAnyway,
  onChange,
  onChangeImportAnyway,
}: ManuscriptImportReviewSectionRowProps) => {
  const note = duplicateNote(existingMatch);
  const isIdenticalDuplicate = existingMatch?.similarity === 'identical';

  return (
    <StyledSectionRow>
      <StyledInput
        aria-label={`Section ${sectionIndex + 1} name`}
        value={section.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <StyledSelect
        aria-label={`Section ${sectionIndex + 1} type`}
        value={section.sectionType}
        onChange={(event) => onChange({ sectionType: event.target.value })}
      >
        {SECTION_TYPES.map((sectionType) => (
          <option key={sectionType} value={sectionType}>
            {optionLabel(sectionType)}
          </option>
        ))}
      </StyledSelect>
      <StyledSelect
        aria-label={`Section ${sectionIndex + 1} placement`}
        value={section.placement}
        onChange={(event) => onChange({ placement: event.target.value })}
      >
        {SECTION_PLACEMENTS.map((placement) => (
          <option key={placement} value={placement}>
            {optionLabel(placement)}
          </option>
        ))}
      </StyledSelect>
      <StyledCheckbox>
        <input
          type="checkbox"
          checked={isIdenticalDuplicate ? false : section.includeInExport}
          disabled={isIdenticalDuplicate}
          onChange={(event) =>
            onChange({ includeInExport: event.target.checked })
          }
        />
        Export
      </StyledCheckbox>
      <StyledPreview>
        {section.wordCount} words ·{' '}
        {section.content.replace(/\s+/g, ' ').slice(0, 180) || 'Empty section'}
      </StyledPreview>
      {note !== undefined ? (
        <StyledDuplicateNote>
          {note}
          {existingMatch?.existingSection.name === undefined
            ? ''
            : `: ${existingMatch.existingSection.name}`}
        </StyledDuplicateNote>
      ) : null}
      {isIdenticalDuplicate ? (
        <StyledImportAnyway>
          <input
            type="checkbox"
            checked={importAnyway}
            onChange={(event) => onChangeImportAnyway(event.target.checked)}
          />
          Import anyway
        </StyledImportAnyway>
      ) : null}
    </StyledSectionRow>
  );
};
