import { styled } from '@linaria/react';
import { type ChangeEvent } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type FigureLike } from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptFigureMetadataFieldsProps = {
  figure: FigureLike;
  onPersist: (values: Record<string, unknown>) => void;
  onReplaceImage: (file: File) => void;
};

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledToggle = styled.label`
  align-items: center;
  align-self: flex-end;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
  min-height: 32px;
`;

const StyledToggleHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 1 / -1;
`;

const StyledFileLabel = styled.label`
  align-items: center;
  align-self: flex-end;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  justify-content: center;
  min-height: 32px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

export const ManuscriptFigureMetadataFields = ({
  figure,
  onPersist,
  onReplaceImage,
}: ManuscriptFigureMetadataFieldsProps) => {
  const replaceImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) onReplaceImage(file);
    event.target.value = '';
  };

  return (
    <StyledGrid>
      <StyledField>
        Image width (%)
        <StyledInput
          aria-label={`${figure.name ?? 'Figure'} width percent`}
          type="number"
          min={10}
          max={100}
          defaultValue={figure.widthPercent ?? 100}
          onBlur={(event) =>
            onPersist({
              widthPercent: Math.min(
                100,
                Math.max(10, Number(event.target.value) || 100),
              ),
            })
          }
        />
      </StyledField>
      <StyledField>
        Image URL
        <StyledInput
          aria-label={`${figure.name ?? 'Figure'} image URL`}
          defaultValue={
            figure.imageSource === 'URL' ? (figure.imageUrl ?? '') : ''
          }
          placeholder="https://…"
          onBlur={(event) => {
            const imageUrl = event.target.value.trim();
            onPersist({
              imageUrl,
              imageSource: imageUrl.length > 0 ? 'URL' : 'NONE',
            });
          }}
        />
      </StyledField>
      <StyledField>
        Alternative text
        <StyledInput
          aria-label={`${figure.name ?? 'Figure'} alternative text`}
          defaultValue={figure.altText ?? ''}
          onBlur={(event) => onPersist({ altText: event.target.value.trim() })}
        />
      </StyledField>
      <StyledField>
        Credit / license
        <StyledInput
          aria-label={`${figure.name ?? 'Figure'} credit`}
          defaultValue={figure.credit ?? ''}
          onBlur={(event) => onPersist({ credit: event.target.value.trim() })}
        />
      </StyledField>
      <StyledToggle>
        <input
          type="checkbox"
          aria-label={`${figure.name ?? 'Figure'} is numbered`}
          checked={figure.numbered !== false}
          onChange={(event) => onPersist({ numbered: event.target.checked })}
        />
        Numbered
      </StyledToggle>
      <StyledFileLabel>
        Replace uploaded image…
        <input type="file" accept="image/*" hidden onChange={replaceImage} />
      </StyledFileLabel>
      {figure.numbered === false ? (
        <StyledToggleHint>
          Set without a number, and it takes none from the sequence — the asset
          after it moves up. Nothing can cross-reference it while this is off.
        </StyledToggleHint>
      ) : null}
    </StyledGrid>
  );
};
