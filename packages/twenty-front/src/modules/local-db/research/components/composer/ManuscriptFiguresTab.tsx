import { styled } from '@linaria/react';
import { H2Title } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptFigurePanel } from '@/local-db/research/components/ManuscriptFigurePanel';
import {
  type FigureLike,
  type JournalStyle,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptFiguresTabProps = {
  manuscriptId: string;
  figures: FigureLike[];
  sections: SectionLike[];
  style: JournalStyle;
  onChanged: () => void;
  onSelectSection: (sectionId: string) => void;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  & h2 {
    margin-bottom: 0;
  }
`;

export const ManuscriptFiguresTab = ({
  manuscriptId,
  figures,
  sections,
  style,
  onChanged,
  onSelectSection,
}: ManuscriptFiguresTabProps) => (
  <StyledTab>
    <H2Title title="Figures & tables" />
    <ManuscriptFigurePanel
      manuscriptId={manuscriptId}
      figures={figures}
      sections={sections}
      style={style}
      onChanged={onChanged}
      onSelectSection={onSelectSection}
    />
  </StyledTab>
);
