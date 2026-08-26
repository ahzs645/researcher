import { styled } from '@linaria/react';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

// One row above the editor, and the only place a per-journal version is
// reached from. It is deliberately not a panel of options: the author picks
// which wording they are editing, or writes the one this journal still lacks.
type ManuscriptSectionVersionBarProps = {
  baseSection: SectionLike;
  versions: SectionLike[];
  selectedSectionId: string;
  activeVariantKey: string | null;
  activeJournalLabel: string | null;
  journalNameByVariantKey: Map<string, string>;
  isCreatingVersion: boolean;
  onCreateVersion: (baseSectionId: string) => void;
  onSelectSection: (sectionId: string) => void;
};

const StyledBar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledSwitch = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.pill};
  display: flex;
  gap: 2px;
  max-width: 100%;
  overflow-x: auto;
  padding: 2px;
`;

const StyledChoice = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active ? themeCssVariables.background.transparent.blue : 'transparent'};
  border: 0;
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ active }) =>
    active
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${({ active }) =>
    active
      ? themeCssVariables.font.weight.semiBold
      : themeCssVariables.font.weight.regular};
  max-width: 220px;
  overflow: hidden;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledCreate = styled.button`
  background: transparent;
  border: 0;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]};
  text-align: left;

  &:hover:enabled {
    color: ${themeCssVariables.font.color.secondary};
    text-decoration: underline;
  }

  &:disabled {
    cursor: default;
  }
`;

// Said in full, not implied by a highlighted chip: an author who trims the
// MDPI wording believing it is the paper's own abstract has been harmed by
// this feature, and a coloured background is not enough to prevent that.
const StyledEditingNote = styled.p`
  background: ${themeCssVariables.background.transparent.blue};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const versionLabel = (
  version: SectionLike,
  journalNameByVariantKey: Map<string, string>,
): string => {
  const key = version.variantProfileKey ?? '';
  // A version can outlive the profile it was written for — it arrived in a
  // portable package, or the profile was renamed. The raw key is then the only
  // true thing left to show, and it is better than calling it "Unknown".
  return journalNameByVariantKey.get(key) ?? (key.length > 0 ? key : 'Version');
};

export const ManuscriptSectionVersionBar = ({
  baseSection,
  versions,
  selectedSectionId,
  activeVariantKey,
  activeJournalLabel,
  journalNameByVariantKey,
  isCreatingVersion,
  onCreateVersion,
  onSelectSection,
}: ManuscriptSectionVersionBarProps) => {
  const activeVersion = isNonEmptyString(activeVariantKey)
    ? versions.find((version) => version.variantProfileKey === activeVariantKey)
    : undefined;
  const canCreateVersion =
    isNonEmptyString(activeVariantKey) && !isDefined(activeVersion);
  const openVersion = versions.find(
    (version) => version.id === selectedSectionId,
  );
  const sectionName = baseSection.name ?? 'this section';

  // Nothing to say: this section has no versions and no journal profile is
  // selected to write one for. Most papers never leave this state, and they
  // should not pay a row of chrome for a feature they do not use.
  if (versions.length === 0 && !canCreateVersion) return null;

  const createButton = canCreateVersion ? (
    <StyledCreate
      type="button"
      disabled={isCreatingVersion}
      title={`Store a separate wording of ${sectionName} that only ${activeJournalLabel ?? 'this journal'} exports`}
      onClick={() => onCreateVersion(baseSection.id)}
    >
      {isCreatingVersion
        ? 'Adding version…'
        : `New version for ${activeJournalLabel ?? 'this journal'}`}
    </StyledCreate>
  ) : null;

  // No versions yet: one control, and no switch to show between one thing.
  if (versions.length === 0) return <StyledBar>{createButton}</StyledBar>;

  return (
    <StyledArea>
      <StyledBar>
        <StyledLabel id={`section-versions-${baseSection.id}`}>
          Editing
        </StyledLabel>
        <StyledSwitch
          role="group"
          aria-labelledby={`section-versions-${baseSection.id}`}
        >
          <StyledChoice
            type="button"
            active={!isDefined(openVersion)}
            aria-current={!isDefined(openVersion)}
            onClick={() => onSelectSection(baseSection.id)}
          >
            Paper
          </StyledChoice>
          {versions.map((version) => (
            <StyledChoice
              key={version.id}
              type="button"
              active={version.id === selectedSectionId}
              aria-current={version.id === selectedSectionId}
              onClick={() => onSelectSection(version.id)}
            >
              {versionLabel(version, journalNameByVariantKey)}
            </StyledChoice>
          ))}
        </StyledSwitch>
        {createButton}
      </StyledBar>
      {isDefined(openVersion) ? (
        <StyledEditingNote>
          You are editing the{' '}
          {versionLabel(openVersion, journalNameByVariantKey)} version of{' '}
          {sectionName}. It replaces {sectionName} only when exporting to that
          journal — the paper&apos;s own text is untouched.
        </StyledEditingNote>
      ) : null}
    </StyledArea>
  );
};
