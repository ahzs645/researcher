import { styled } from '@linaria/react';
import katex from 'katex';
import { useMemo } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type ManuscriptEquationEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
};

export const equationValidationError = (source: string): string | null => {
  if (source.trim().length === 0) return 'Enter a LaTeX equation.';
  try {
    katex.renderToString(source, { displayMode: true, throwOnError: true });
    return null;
  } catch (caughtError) {
    return caughtError instanceof Error ? caughtError.message : 'Invalid LaTeX';
  }
};

const StyledEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.sm};
  min-height: 96px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledPreview = styled.div`
  min-height: 48px;
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledError = styled.div`
  color: ${themeCssVariables.color.red};
  font-size: ${themeCssVariables.font.size.xs};
`;

const equationSource = (markdown: string): string =>
  markdown.trim().replace(/^\$\$/, '').replace(/\$\$$/, '').trim();

export const ManuscriptEquationEditor = ({
  markdown,
  onChange,
}: ManuscriptEquationEditorProps) => {
  const source = equationSource(markdown);
  const { rendered, error } = useMemo(() => {
    return {
      rendered: katex.renderToString(source, {
        displayMode: true,
        throwOnError: false,
      }),
      error: equationValidationError(source),
    };
  }, [source]);

  return (
    <StyledEditor>
      <StyledTextarea
        aria-label="LaTeX equation source"
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : 'equation-error'}
        value={source}
        onChange={(event) => onChange(`$$${event.target.value}$$`)}
      />
      <StyledPreview
        // KaTeX returns escaped, presentation-only markup.
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
      {error === null ? null : (
        <StyledError id="equation-error" role="alert">
          {error}
        </StyledError>
      )}
    </StyledEditor>
  );
};
