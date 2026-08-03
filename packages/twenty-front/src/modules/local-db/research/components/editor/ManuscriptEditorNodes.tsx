import {
  type BlockNoteEditor,
  type BlockSchema,
  type InlineContentSchema,
  type StyleSchema,
} from '@blocknote/core';
import { createReactInlineContentSpec } from '@blocknote/react';
import { styled } from '@linaria/react';
import katex from 'katex';
import { useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useManuscriptEditorContext } from '@/local-db/research/components/editor/ManuscriptEditorContext';
import { ManuscriptCitationClusterEditor } from '@/local-db/research/components/editor/ManuscriptCitationClusterEditor';
import { ManuscriptEditorPopover } from '@/local-db/research/components/editor/ManuscriptEditorPopover';
import { ManuscriptCrossRefPicker } from '@/local-db/research/components/editor/ManuscriptEditorPickers';
import {
  equationValidationError,
  ManuscriptEquationEditor,
} from '@/local-db/research/import-wizard/components/ManuscriptEquationEditor';
import { formatInTextCitation } from '@/local-db/research/manuscript/manuscriptCitations';
import {
  citationKeysFromProp,
  citationTokenFromProp,
} from '@/local-db/research/manuscript/manuscriptEditorContent';
import { resolveAssetKey } from '@/local-db/research/manuscript/manuscriptNumbering';

const StyledInlineAnchor = styled.span`
  display: inline-block;
  position: relative;
`;

const StyledChip = styled.button<{ warning?: boolean }>`
  background: ${({ warning }) =>
    warning
      ? themeCssVariables.color.yellow3
      : themeCssVariables.background.transparent.blue};
  border: 1px solid
    ${({ warning }) =>
      warning
        ? themeCssVariables.color.yellow7
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font: inherit;
  line-height: 1.35;
  padding: 0 ${themeCssVariables.spacing[1]};
`;

const StyledEquationButton = styled.button`
  background: transparent;
  border: 0;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font: inherit;
  padding: 0 ${themeCssVariables.spacing[0.5]};

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

const renderInlineKatex = (latex: string): string | undefined => {
  try {
    return katex.renderToString(latex, {
      displayMode: false,
      throwOnError: false,
    });
  } catch {
    return undefined;
  }
};

const replaceInlineNodeWithText = <
  TBlockSchema extends BlockSchema,
  TInlineContentSchema extends InlineContentSchema,
  TStyleSchema extends StyleSchema,
>(
  editor: BlockNoteEditor<TBlockSchema, TInlineContentSchema, TStyleSchema>,
  element: HTMLElement | null,
  text: string,
) => {
  if (element === null) return;
  const { state, view } = editor._tiptapEditor;
  const initialPosition = view.posAtDOM(element, 0);
  const position = state.doc.nodeAt(initialPosition)
    ? initialPosition
    : Math.max(0, initialPosition - 1);
  const node = state.doc.nodeAt(position);
  if (node === null) return;
  editor.transact((transaction) =>
    transaction.insertText(text, position, position + node.nodeSize),
  );
};

type InlineEquationNodeProps = {
  latex: string;
  onSave: (latex: string) => void;
};

const InlineEquationNode = ({ latex, onSave }: InlineEquationNodeProps) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(latex);
  const rendered = renderInlineKatex(latex);
  return (
    <StyledInlineAnchor ref={anchorRef} contentEditable={false}>
      <StyledEquationButton
        type="button"
        aria-label={`Edit inline equation ${latex}`}
        onClick={() => {
          setDraft(latex);
          setIsOpen(true);
        }}
      >
        {rendered === undefined ? (
          <StyledFallback>{latex}</StyledFallback>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: rendered }} />
        )}
      </StyledEquationButton>
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
              onClick={() => {
                onSave(draft);
                setIsOpen(false);
              }}
            />
          </StyledActions>
        </ManuscriptEditorPopover>
      ) : null}
    </StyledInlineAnchor>
  );
};

type ManuscriptCitationChipProps = {
  // One key, or a whole cluster's keys joined by "; " (see manuscriptEditorContent).
  citationKey: string;
  onRemove: (element: HTMLElement | null) => void;
  onSave: (citationKey: string) => void;
};

export const ManuscriptCitationChip = ({
  citationKey,
  onRemove,
  onSave,
}: ManuscriptCitationChipProps) => {
  const { citationContext, citationLabelsByKey, isCitationStyleLoading } =
    useManuscriptEditorContext();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const keys = citationKeysFromProp(citationKey);
  const rawToken = citationTokenFromProp(citationKey);
  const resolved =
    keys.length > 0 &&
    keys.every((key) => citationContext.referencesByKey.has(key));
  // The provider precomputes CSL labels per single key, and a cluster's CSL
  // label cannot be derived by concatenating them — so a cluster falls back to
  // the deterministic formatter, which renders all its sources in one label.
  const label = !resolved
    ? rawToken
    : keys.length === 1
      ? (citationLabelsByKey.get(keys[0]) ??
        (isCitationStyleLoading
          ? '…'
          : formatInTextCitation(keys, citationContext)))
      : formatInTextCitation(keys, citationContext);
  return (
    <StyledInlineAnchor ref={anchorRef} contentEditable={false}>
      <StyledChip
        type="button"
        warning={!resolved}
        aria-label={`Edit citation ${citationKey}`}
        onClick={() => setIsOpen(true)}
      >
        {label}
      </StyledChip>
      {isOpen ? (
        <ManuscriptEditorPopover
          anchorRef={anchorRef}
          onClose={() => setIsOpen(false)}
        >
          <ManuscriptCitationClusterEditor
            citationKey={citationKey}
            onSave={(nextCitationKey) => {
              onSave(nextCitationKey);
              setIsOpen(false);
            }}
            onRemove={() => onRemove(anchorRef.current)}
          />
        </ManuscriptEditorPopover>
      ) : null}
    </StyledInlineAnchor>
  );
};

type CrossRefNodeProps = {
  onSave: (refKey: string) => void;
  refKey: string;
};

const CrossRefNode = ({ onSave, refKey }: CrossRefNodeProps) => {
  const { assetLookup } = useManuscriptEditorContext();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const asset = resolveAssetKey(refKey, assetLookup);
  return (
    <StyledInlineAnchor ref={anchorRef} contentEditable={false}>
      <StyledChip
        type="button"
        warning={asset === undefined}
        aria-label={`Edit cross-reference ${refKey}`}
        onClick={() => setIsOpen(true)}
      >
        {asset?.crossRefLabel ?? `[#${refKey}]`}
      </StyledChip>
      {isOpen ? (
        <ManuscriptEditorPopover
          anchorRef={anchorRef}
          onClose={() => setIsOpen(false)}
        >
          <ManuscriptCrossRefPicker
            onSelect={(key) => {
              onSave(key);
              setIsOpen(false);
            }}
          />
        </ManuscriptEditorPopover>
      ) : null}
    </StyledInlineAnchor>
  );
};

export const InlineEquation = createReactInlineContentSpec(
  {
    type: 'inlineEquation',
    propSchema: { latex: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ inlineContent, updateInlineContent }) => (
      <InlineEquationNode
        latex={inlineContent.props.latex}
        onSave={(latex) =>
          updateInlineContent({ type: 'inlineEquation', props: { latex } })
        }
      />
    ),
  },
);

export const Citation = createReactInlineContentSpec(
  {
    type: 'citation',
    propSchema: { citationKey: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ editor, inlineContent, updateInlineContent }) => (
      <ManuscriptCitationChip
        citationKey={inlineContent.props.citationKey}
        onSave={(citationKey) =>
          updateInlineContent({ type: 'citation', props: { citationKey } })
        }
        onRemove={(element) =>
          replaceInlineNodeWithText(
            editor,
            element,
            `[${citationKeysFromProp(inlineContent.props.citationKey)
              .map((key) => `@${key}`)
              .join('; ')}]`,
          )
        }
      />
    ),
  },
);

export const CrossRef = createReactInlineContentSpec(
  {
    type: 'crossRef',
    propSchema: { refKey: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ inlineContent, updateInlineContent }) => (
      <CrossRefNode
        refKey={inlineContent.props.refKey}
        onSave={(refKey) =>
          updateInlineContent({ type: 'crossRef', props: { refKey } })
        }
      />
    ),
  },
);
