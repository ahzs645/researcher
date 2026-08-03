import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptCitationReferenceSelect } from '@/local-db/research/components/composer/ManuscriptCitationReferenceSelect';
import {
  type CitationLinkDecision,
  isCitationLinkSuggestionUnambiguous,
  type UnlinkedCitationOccurrence,
} from '@/local-db/research/manuscript/manuscriptCitationLink';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptCitationLinkPanelProps = {
  occurrences: UnlinkedCitationOccurrence[];
  onApply: (decisions: CitationLinkDecision[]) => Promise<void>;
  onClose: () => void;
  references: ReferenceLike[];
};

type LinkSelection = {
  citationKeys: string[];
  skip: boolean;
};

const occurrenceKey = (occurrence: UnlinkedCitationOccurrence): string =>
  `${occurrence.sectionId}:${occurrence.index}`;

const StyledPanel = styled.section`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTitle = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledRowHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledSectionName = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledContext = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: 1.5;

  & mark {
    background: ${themeCssVariables.color.yellow3};
    border-radius: ${themeCssVariables.border.radius.xs};
    color: ${themeCssVariables.font.color.primary};
    padding: 0 ${themeCssVariables.spacing[1]};
  }
`;

const StyledSkip = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledPart = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledPartLabel = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledConfidence = styled.span<{ ambiguous: boolean }>`
  color: ${({ ambiguous }) =>
    ambiguous
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const ContextWithMarker = ({
  occurrence,
}: {
  occurrence: UnlinkedCitationOccurrence;
}) => {
  const markerIndex = occurrence.context.indexOf(occurrence.marker);
  if (markerIndex === -1) return <>{occurrence.context}</>;
  return (
    <>
      {occurrence.context.slice(0, markerIndex)}
      <mark>{occurrence.marker}</mark>
      {occurrence.context.slice(markerIndex + occurrence.marker.length)}
    </>
  );
};

export const ManuscriptCitationLinkPanel = ({
  occurrences,
  onApply,
  onClose,
  references,
}: ManuscriptCitationLinkPanelProps) => {
  const initialSelections = useMemo(
    () =>
      Object.fromEntries(
        occurrences.map((occurrence) => [
          occurrenceKey(occurrence),
          {
            citationKeys: occurrence.parts.map((part) =>
              isCitationLinkSuggestionUnambiguous(part.suggestions)
                ? (part.suggestions[0]?.citationKey ?? '')
                : '',
            ),
            skip: false,
          },
        ]),
      ) as Record<string, LinkSelection>,
    [occurrences],
  );
  const [selections, setSelections] = useState(initialSelections);
  const [isApplying, setIsApplying] = useState(false);
  const linkable = occurrences.filter((occurrence) => {
    const selection = selections[occurrenceKey(occurrence)];
    return (
      selection !== undefined &&
      !selection.skip &&
      selection.citationKeys.length === occurrence.parts.length &&
      selection.citationKeys.every((citationKey) => citationKey.length > 0)
    );
  });

  const updateSelection = (
    occurrence: UnlinkedCitationOccurrence,
    update: (selection: LinkSelection) => LinkSelection,
  ) => {
    const key = occurrenceKey(occurrence);
    setSelections((current) => ({
      ...current,
      [key]: update(current[key] ?? { citationKeys: [], skip: false }),
    }));
  };

  const apply = async () => {
    if (isApplying || linkable.length === 0) return;
    setIsApplying(true);
    try {
      await onApply(
        linkable.map((occurrence) => ({
          sectionId: occurrence.sectionId,
          marker: occurrence.marker,
          index: occurrence.index,
          citationKeys: selections[occurrenceKey(occurrence)].citationKeys,
        })),
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <StyledPanel aria-label="Link in-text citations">
      <StyledHeader>
        <StyledTitle>Review unlinked citations</StyledTitle>
        <StyledActions>
          <Button
            title={isApplying ? 'Applying…' : `Apply ${linkable.length} linked`}
            variant="primary"
            accent="blue"
            size="small"
            disabled={isApplying || linkable.length === 0}
            onClick={() => void apply()}
          />
          <Button
            title="Close"
            variant="secondary"
            size="small"
            disabled={isApplying}
            onClick={onClose}
          />
        </StyledActions>
      </StyledHeader>
      {occurrences.map((occurrence) => {
        const key = occurrenceKey(occurrence);
        const selection = selections[key];
        return (
          <StyledRow key={key}>
            <StyledRowHeader>
              <StyledSectionName>{occurrence.sectionName}</StyledSectionName>
              <StyledSkip>
                <input
                  type="checkbox"
                  checked={selection.skip}
                  onChange={(event) =>
                    updateSelection(occurrence, (current) => ({
                      ...current,
                      skip: event.target.checked,
                    }))
                  }
                />
                Skip
              </StyledSkip>
            </StyledRowHeader>
            <StyledContext>
              <ContextWithMarker occurrence={occurrence} />
            </StyledContext>
            {!selection.skip
              ? occurrence.parts.map((part, partIndex) => (
                  <StyledPart key={`${key}:${partIndex}`}>
                    {occurrence.parts.length > 1 ? (
                      <StyledPartLabel>{part.marker}</StyledPartLabel>
                    ) : null}
                    {part.suggestions[0] === undefined ? (
                      <StyledConfidence ambiguous>
                        No automatic match — choose a reference to continue.
                      </StyledConfidence>
                    ) : (
                      <StyledConfidence
                        ambiguous={
                          !isCitationLinkSuggestionUnambiguous(part.suggestions)
                        }
                      >
                        Suggested @{part.suggestions[0].citationKey} ·{' '}
                        {Math.round(part.suggestions[0].score * 100)}%
                        confidence
                        {isCitationLinkSuggestionUnambiguous(part.suggestions)
                          ? ''
                          : ' — confirmation required'}
                      </StyledConfidence>
                    )}
                    <ManuscriptCitationReferenceSelect
                      label={part.marker}
                      references={references}
                      value={selection.citationKeys[partIndex] ?? ''}
                      onChange={(citationKey) =>
                        updateSelection(occurrence, (current) => ({
                          ...current,
                          citationKeys: current.citationKeys.map(
                            (currentKey, currentIndex) =>
                              currentIndex === partIndex
                                ? citationKey
                                : currentKey,
                          ),
                        }))
                      }
                    />
                  </StyledPart>
                ))
              : null}
          </StyledRow>
        );
      })}
    </StyledPanel>
  );
};
