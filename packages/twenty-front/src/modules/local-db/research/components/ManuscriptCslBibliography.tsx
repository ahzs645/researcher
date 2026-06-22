import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type FormattedBibliographyEntry } from '@/local-db/research/manuscript/manuscriptCitations';
import {
  renderCslBibliography,
  type CslBibliographyEntry,
} from '@/local-db/research/manuscript/manuscriptCsl';

// Live "formatted references" preview rendered with full CSL (citeproc-js) in
// the journal's actual style, fetched on demand. Falls back to the built-in
// deterministic bibliography when CSL can't be loaded (offline / unknown style),
// so it always shows something.

type ManuscriptCslBibliographyProps = {
  cslItems: Record<string, unknown>[];
  citedKeys: string[];
  styleId: string;
  fallback: FormattedBibliographyEntry[];
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
  cslItems,
  citedKeys,
  styleId,
  fallback,
}: ManuscriptCslBibliographyProps) => {
  const [entries, setEntries] = useState<CslBibliographyEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const citedKey = citedKeys.join('|');
  const refsKey = cslItems.map((item) => String(item.id)).join('|');

  useEffect(() => {
    if (citedKeys.length === 0) {
      setEntries(null);
      return;
    }
    let isActive = true;
    setIsLoading(true);
    void renderCslBibliography(cslItems, citedKeys, styleId).then((result) => {
      if (!isActive) return;
      setEntries(result);
      setIsLoading(false);
    });
    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId, citedKey, refsKey]);

  if (citedKeys.length === 0) return null;

  const usingCsl = entries !== null && entries.length > 0;
  const shown = usingCsl
    ? entries.map((entry) => ({ key: entry.id, text: entry.text }))
    : fallback.map((entry) => ({ key: entry.key, text: entry.text }));

  const source = isLoading
    ? `loading ${styleId || 'csl'} style…`
    : usingCsl
      ? `citeproc-js · ${styleId}.csl`
      : 'built-in formatter';

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
