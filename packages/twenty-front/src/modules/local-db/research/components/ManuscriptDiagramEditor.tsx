import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { useManuscriptDiagramSvg } from '@/local-db/research/hooks/useManuscriptDiagramSvg';

type ManuscriptDiagramEditorProps = {
  source: string;
  onChange: (source: string) => void;
};

const StyledEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledSource = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 140px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledPreview = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  justify-content: center;
  min-height: 120px;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[3]};

  & svg {
    height: auto;
    max-width: 100%;
  }
`;

const StyledStatus = styled.p<{ isError: boolean }>`
  color: ${({ isError }) =>
    isError
      ? themeCssVariables.color.orange
      : themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const PLACEHOLDER = [
  'flowchart TD',
  '  A[Collect filters] --> B[Digest]',
  '  B --> C{Above LOD?}',
  '  C -->|Yes| D[Report value]',
  '  C -->|No| E[Impute]',
].join('\n');

export const ManuscriptDiagramEditor = ({
  source,
  onChange,
}: ManuscriptDiagramEditorProps) => {
  const { svg, status } = useManuscriptDiagramSvg(source);

  return (
    <StyledEditor>
      <StyledSource
        aria-label="Mermaid diagram source"
        placeholder={PLACEHOLDER}
        value={source}
        onChange={(event) => onChange(event.target.value)}
      />
      {svg !== null ? (
        // Mermaid renders in strict mode, which sanitizes the labels it draws.
        <StyledPreview dangerouslySetInnerHTML={{ __html: svg }} />
      ) : null}
      <StyledStatus isError={status === 'error'}>
        {status === 'error'
          ? 'This diagram does not parse yet — the export will fall back to the source text.'
          : status === 'drawing'
            ? 'Drawing…'
            : 'Mermaid source. Exports as vector art in HTML and as an image in Word and PDF.'}
      </StyledStatus>
    </StyledEditor>
  );
};
