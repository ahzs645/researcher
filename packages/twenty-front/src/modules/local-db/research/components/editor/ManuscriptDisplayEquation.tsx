import { createReactBlockSpec } from '@blocknote/react';
import { styled } from '@linaria/react';
import katex from 'katex';
import { useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptEditorPopover } from '@/local-db/research/components/editor/ManuscriptEditorPopover';
import {
  equationValidationError,
  ManuscriptEquationEditor,
} from '@/local-db/research/import-wizard/components/ManuscriptEquationEditor';

const StyledDisplayEquation = styled.div`
  cursor: pointer;
  min-height: 48px;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[3]};
  position: relative;
  text-align: center;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledFallback = styled.code`
  font-family: monospace;
`;

const StyledActions = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const renderDisplayKatex = (latex: string): string | undefined => {
  try {
    return katex.renderToString(latex, {
      displayMode: true,
      throwOnError: false,
    });
  } catch {
    return undefined;
  }
};

type ManuscriptDisplayEquationNodeProps = {
  latex: string;
  onSave: (latex: string) => void;
};

const ManuscriptDisplayEquationNode = ({
  latex,
  onSave,
}: ManuscriptDisplayEquationNodeProps) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(latex);
  const rendered = renderDisplayKatex(latex);
  return (
    <StyledDisplayEquation
      ref={anchorRef}
      contentEditable={false}
      role="button"
      tabIndex={0}
      aria-label={`Edit display equation ${latex}`}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('[role="dialog"]') !== null
        ) {
          return;
        }
        setDraft(latex);
        setIsOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setIsOpen(true);
      }}
    >
      {rendered === undefined ? (
        <StyledFallback>{latex}</StyledFallback>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: rendered }} />
      )}
      {isOpen ? (
        <ManuscriptEditorPopover
          anchorRef={anchorRef}
          onClose={() => setIsOpen(false)}
        >
          <ManuscriptEquationEditor
            markdown={`$$${draft}$$`}
            onChange={(markdown) => setDraft(markdown.slice(2, -2))}
          />
          <StyledActions>
            <Button
              title="Save equation"
              size="small"
              disabled={equationValidationError(draft) !== null}
              onClick={(event) => {
                event.stopPropagation();
                onSave(draft);
                setIsOpen(false);
              }}
            />
          </StyledActions>
        </ManuscriptEditorPopover>
      ) : null}
    </StyledDisplayEquation>
  );
};

export const DisplayEquation = createReactBlockSpec(
  {
    type: 'displayEquation',
    propSchema: { latex: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ block, editor }) => (
      <ManuscriptDisplayEquationNode
        latex={block.props.latex}
        onSave={(latex) => editor.updateBlock(block, { props: { latex } })}
      />
    ),
  },
);
