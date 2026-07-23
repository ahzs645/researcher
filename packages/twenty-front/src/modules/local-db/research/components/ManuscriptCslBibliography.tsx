import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  createCiteprocEngine,
  type CslBibliographyEntry,
  formatCslBibliography,
  formatCslCitations,
  isVendoredCslStyleId,
} from '@/local-db/research/manuscript/manuscriptCiteproc';
import { type FormattedBibliographyEntry } from '@/local-db/research/manuscript/manuscriptCitations';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptCslBibliographyProps = {
  citationKeys: string[];
  fallback: FormattedBibliographyEntry[];
  references: ReferenceLike[];
  styleId: string;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledHeaderRow = styled.div`
  align-items: baseline;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: ${themeCssVariables.spacing[2]} 0 0;
`;

const StyledSource = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEntry = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: 1.4;
  padding-left: ${themeCssVariables.spacing[3]};
  text-indent: -${themeCssVariables.spacing[3]};
`;

export const ManuscriptCslBibliography = ({
  citationKeys,
  fallback,
  references,
  styleId,
}: ManuscriptCslBibliographyProps) => {
  const [entries, setEntries] = useState<CslBibliographyEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const citationSignature = citationKeys.join('|');
  const referenceSignature = references
    .map((reference) => `${reference.id}:${reference.cslJson ?? ''}`)
    .join('|');

  useEffect(() => {
    if (!isVendoredCslStyleId(styleId) || references.length === 0) {
      setEntries(null);
      setIsLoading(false);
      return;
    }
    let isActive = true;
    setIsLoading(true);
    void createCiteprocEngine({ styleId, references })
      .then((engine) => {
        if (!isActive || engine === null) return;
        formatCslCitations(
          engine,
          citationKeys.map((citationKey) => [citationKey]),
        );
        setEntries(formatCslBibliography(engine));
      })
      .catch(() => {
        if (isActive) setEntries(null);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [
    citationKeys,
    citationSignature,
    referenceSignature,
    references,
    styleId,
  ]);

  if (references.length === 0) return null;

  const usingCsl = entries !== null && entries.length > 0;
  const shown = usingCsl ? entries : fallback;
  const source = isLoading
    ? `Loading ${styleId}…`
    : usingCsl
      ? `citeproc-js · ${styleId}`
      : 'Built-in formatter';

  return (
    <StyledPanel>
      <StyledHeaderRow>
        <StyledTitle>Formatted references</StyledTitle>
        <StyledSource>{source}</StyledSource>
      </StyledHeaderRow>
      {shown.map((entry) => (
        <StyledEntry key={entry.key}>{entry.text}</StyledEntry>
      ))}
    </StyledPanel>
  );
};
