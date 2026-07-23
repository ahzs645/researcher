import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptCslBibliography } from '@/local-db/research/components/ManuscriptCslBibliography';
import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import { type FormattedBibliographyEntry } from '@/local-db/research/manuscript/manuscriptCitations';

type ManuscriptBibliographyPreviewProps = {
  citationKeys: string[];
  styleId: string;
  fallback: FormattedBibliographyEntry[];
  references: ManuscriptBundle['sourceInput']['references'];
};

const StyledBibliography = styled.details`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};

  & > summary {
    color: ${themeCssVariables.font.color.primary};
    cursor: pointer;
    font-size: ${themeCssVariables.font.size.sm};
    font-weight: ${themeCssVariables.font.weight.semiBold};
    padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  }
`;

const StyledBibliographyContent = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]}
    ${themeCssVariables.spacing[4]};
`;

export const ManuscriptBibliographyPreview = ({
  citationKeys,
  styleId,
  fallback,
  references,
}: ManuscriptBibliographyPreviewProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <StyledBibliography
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        Bibliography preview ({references.length}{' '}
        {references.length === 1 ? 'entry' : 'entries'})
      </summary>
      {isOpen ? (
        <StyledBibliographyContent>
          <ManuscriptCslBibliography
            citationKeys={citationKeys}
            styleId={styleId}
            fallback={fallback}
            references={references}
          />
        </StyledBibliographyContent>
      ) : null}
    </StyledBibliography>
  );
};
