import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type Ref } from 'react';

import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';
import { ManuscriptSectionMetadataPanel } from '@/local-db/research/components/ManuscriptSectionMetadataPanel';
import { wordLimitStatus } from '@/local-db/research/manuscript/manuscriptScaffold';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptWriteEditorProps = {
  citationKeys: string[];
  editorShellRef: Ref<HTMLDivElement>;
  figures: FigureLike[];
  minimumEditorHeight?: number;
  onEditorReady: () => void;
  onPersistSection: (markdown: string) => void;
  onSectionMetadataChanged: () => void;
  references: ReferenceLike[];
  section?: SectionLike;
  sections: SectionLike[];
  style: JournalStyle;
};

const StyledEditorColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
`;

const StyledDetails = styled.details`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};

  & > summary {
    color: ${themeCssVariables.font.color.secondary};
    cursor: pointer;
    font-size: ${themeCssVariables.font.size.sm};
    font-weight: ${themeCssVariables.font.weight.medium};
    padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  }
`;

const StyledLimit = styled.span<{ over: boolean }>`
  color: ${({ over }) =>
    over
      ? themeCssVariables.font.color.danger
      : themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${({ over }) =>
    over ? themeCssVariables.font.weight.medium : 'normal'};
`;

const StyledEmpty = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

export const ManuscriptWriteEditor = ({
  citationKeys,
  editorShellRef,
  figures,
  minimumEditorHeight,
  onEditorReady,
  onPersistSection,
  onSectionMetadataChanged,
  references,
  section,
  sections,
  style,
}: ManuscriptWriteEditorProps) => {
  const wordStatus = isDefined(section)
    ? wordLimitStatus(section.wordCount, section.wordLimit)
    : undefined;

  return (
    <StyledEditorColumn>
      {isDefined(section) ? (
        <>
          <StyledDetails>
            <summary>Details · {section.name ?? 'Untitled section'}</summary>
            <ManuscriptSectionMetadataPanel
              key={`section-metadata-${section.id}`}
              section={section}
              sections={sections}
              figures={figures}
              onChanged={onSectionMetadataChanged}
            />
          </StyledDetails>
          <ManuscriptSectionEditor
            key={section.id}
            citationKeys={citationKeys}
            containerRef={editorShellRef}
            figures={figures}
            initialMarkdown={section.content ?? ''}
            minimumHeight={minimumEditorHeight}
            onPersist={onPersistSection}
            onReady={onEditorReady}
            references={references}
            style={style}
          />
          {isDefined(wordStatus) ? (
            <StyledLimit over={wordStatus.over}>
              {wordStatus.wordLimit === null
                ? `${wordStatus.wordCount} words`
                : wordStatus.over
                  ? `${wordStatus.wordCount} / ${wordStatus.wordLimit} words · ${Math.abs(wordStatus.remaining ?? 0)} over limit`
                  : `${wordStatus.wordCount} / ${wordStatus.wordLimit} words · ${wordStatus.remaining} left`}
            </StyledLimit>
          ) : null}
        </>
      ) : (
        <StyledEmpty>
          Select a Main text, Back matter, or Supplement section to start
          writing.
        </StyledEmpty>
      )}
    </StyledEditorColumn>
  );
};
