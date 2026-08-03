import { createReactBlockSpec } from '@blocknote/react';
import { styled } from '@linaria/react';
import katex from 'katex';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useManuscriptEditorContext } from '@/local-db/research/components/editor/ManuscriptEditorContext';
import { resolveFigureImage } from '@/local-db/research/manuscript/manuscriptImages';
import { resolveAssetKey } from '@/local-db/research/manuscript/manuscriptNumbering';

const StyledAsset = styled.div<{ warning?: boolean }>`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid
    ${({ warning }) =>
      warning
        ? themeCssVariables.font.color.danger
        : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 72px;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledPreview = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex: 0 0 88px;
  height: 56px;
  justify-content: center;
  overflow: hidden;
`;

const StyledImage = styled.img`
  height: 100%;
  object-fit: contain;
  width: 100%;
`;

const StyledCopy = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledLabel = styled.strong`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledCaption = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ManuscriptAssetPlacementNode = ({ refKey }: { refKey: string }) => {
  const { assetLookup } = useManuscriptEditorContext();
  const figure = resolveAssetKey(refKey, assetLookup);

  if (figure === undefined) {
    return (
      <StyledAsset warning contentEditable={false}>
        <StyledCopy>
          <StyledLabel>Missing asset</StyledLabel>
          <StyledCaption>
            No figure, table, or equation matches “{refKey}”.
          </StyledCaption>
        </StyledCopy>
      </StyledAsset>
    );
  }

  const image = resolveFigureImage(figure);
  const equationHtml =
    figure.assetKind === 'EQUATION' && figure.equationLatex?.trim()
      ? katex.renderToString(figure.equationLatex, {
          displayMode: false,
          throwOnError: false,
        })
      : null;

  return (
    <StyledAsset contentEditable={false}>
      <StyledPreview>
        {image.kind === 'none' ? (
          equationHtml === null ? (
            (figure.assetKind?.toLowerCase() ?? 'asset')
          ) : (
            <span dangerouslySetInnerHTML={{ __html: equationHtml }} />
          )
        ) : (
          <StyledImage
            src={image.src}
            alt={figure.altText ?? figure.name ?? figure.label}
          />
        )}
      </StyledPreview>
      <StyledCopy>
        <StyledLabel>{figure.label}</StyledLabel>
        <StyledCaption>
          {figure.caption ?? figure.name ?? `Reference key: ${refKey}`}
        </StyledCaption>
      </StyledCopy>
    </StyledAsset>
  );
};

export const AssetPlacement = createReactBlockSpec(
  {
    type: 'assetPlacement',
    propSchema: { refKey: { default: '' } },
    content: 'none',
  } as const,
  {
    render: ({ block }) => (
      <ManuscriptAssetPlacementNode refKey={block.props.refKey} />
    ),
    meta: { selectable: true, isolating: true },
  },
);
