import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const SHORTCUTS = [
  ['↓ / j', 'Next'],
  ['↑ / k', 'Previous'],
  ['⇧ + ↑/↓', 'Select range'],
  ['1 / 2 / 3', 'Heading'],
  ['b', 'Body'],
  ['c', 'Caption'],
  ['x', 'Exclude'],
  ['l', 'Link asset'],
  ['Enter', 'Next review'],
  ['⌘/Ctrl + Enter', 'Continue'],
] as const;

const StyledBar = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 42px;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledShortcut = styled.span`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
  white-space: nowrap;
`;

const StyledKey = styled.kbd`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-family: inherit;
  padding: 1px ${themeCssVariables.spacing[1]};
`;

export const ManuscriptImportShortcutBar = () => (
  <StyledBar aria-label="Map document keyboard shortcuts">
    {SHORTCUTS.map(([keys, action]) => (
      <StyledShortcut key={keys}>
        <StyledKey>{keys}</StyledKey>
        {action}
      </StyledShortcut>
    ))}
  </StyledBar>
);
