import { createReactBlockSpec } from '@blocknote/react';
import { styled } from '@linaria/react';
import { useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptDiagramEditor } from '@/local-db/research/components/ManuscriptDiagramEditor';
import { ManuscriptEditorPopover } from '@/local-db/research/components/editor/ManuscriptEditorPopover';
import { useManuscriptDiagramSvg } from '@/local-db/research/hooks/useManuscriptDiagramSvg';

// A ```mermaid fence, drawn. The source stays the block's only state, so this
// is a rendering of the code block rather than a different kind of content —
// `manuscriptNodesToTokens` turns it straight back into the fence, and the
// Markdown round-trip is byte-identical.

const StyledDiagram = styled.div`
  cursor: pointer;
  min-height: 48px;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[3]};
  position: relative;
  text-align: center;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  & svg {
    height: auto;
    max-width: 100%;
  }
`;

const StyledFallback = styled.pre`
  color: ${themeCssVariables.font.color.secondary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
  text-align: left;
  white-space: pre-wrap;
`;

const StyledActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

type ManuscriptMermaidDiagramNodeProps = {
  source: string;
  onSave: (source: string) => void;
};

const ManuscriptMermaidDiagramNode = ({
  source,
  onSave,
}: ManuscriptMermaidDiagramNodeProps) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(source);
  const { svg } = useManuscriptDiagramSvg(source, 0);

  return (
    <StyledDiagram
      ref={anchorRef}
      contentEditable={false}
      role="button"
      tabIndex={0}
      aria-label="Edit diagram"
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[role="dialog"]') !== null
        ) {
          return;
        }
        setDraft(source);
        setIsOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setIsOpen(true);
      }}
    >
      {svg === null ? (
        // Not drawable yet — show the source rather than an empty block.
        <StyledFallback>{source}</StyledFallback>
      ) : (
        // Mermaid renders in strict mode, which sanitizes its own labels.
        <span dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      {isOpen ? (
        <ManuscriptEditorPopover
          anchorRef={anchorRef}
          onClose={() => setIsOpen(false)}
        >
          <ManuscriptDiagramEditor source={draft} onChange={setDraft} />
          <StyledActions>
            <Button
              title="Save diagram"
              size="small"
              disabled={draft.trim().length === 0}
              onClick={(event) => {
                event.stopPropagation();
                onSave(draft.trim());
                setIsOpen(false);
              }}
            />
          </StyledActions>
        </ManuscriptEditorPopover>
      ) : null}
    </StyledDiagram>
  );
};

export const MermaidDiagram = createReactBlockSpec(
  {
    type: 'mermaidDiagram',
    propSchema: { source: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ block, editor }) => (
      <ManuscriptMermaidDiagramNode
        source={block.props.source}
        onSave={(source) => editor.updateBlock(block, { props: { source } })}
      />
    ),
  },
);
