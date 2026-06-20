import { styled } from '@linaria/react';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { ModalBackdrop } from 'twenty-ui/layout';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { setBridgeWorkspaceSetup } from '@/local-db/data-source/bridgeSystemStore';
import { type WorkspaceMode } from '@/local-db/research/researchObjectModel';
import { getTwentyDataBridgeConfig } from '@/local-db/twenty-local/getTwentyDataBridgeConfig';
import { RootStackingContextZIndices } from '@/ui/layout/constants/RootStackingContextZIndices';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledOverlay = styled.div`
  align-items: center;
  display: flex;
  inset: 0;
  justify-content: center;
  padding: ${themeCssVariables.spacing[4]};
  position: fixed;
  z-index: ${RootStackingContextZIndices.RootModal};
`;

const StyledCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-width: 520px;
  padding: ${themeCssVariables.spacing[8]};
  position: relative;
  width: 100%;
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledSubtitle = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: 1.5;
  margin: 0;
`;

const StyledChoices = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[4]};

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    flex-direction: column;
  }
`;

const StyledChoice = styled.button<{ disabled: boolean }>`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  cursor: ${({ disabled }) => (disabled ? 'default' : 'pointer')};
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
  padding: ${themeCssVariables.spacing[4]};
  text-align: left;

  &:hover {
    border-color: ${({ disabled }) =>
      disabled
        ? themeCssVariables.border.color.medium
        : themeCssVariables.color.blue};
  }
`;

const StyledChoiceTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledChoiceDescription = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
`;

type WorkspaceWithSetup = {
  setupCompleted?: boolean;
} | null;

// First-run persona picker for the local bridge: asks whether this is a solo
// researcher or a lab, persists the choice, adapts the nav, then reloads so the
// rebuilt nav + persona take effect. Renders nothing once setup is done (or in
// convex mode, where the workspace lives on the backend).
export const ResearchWorkspaceSetupModal = () => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLocalBridge = getTwentyDataBridgeConfig()?.mode === 'local';
  const setupCompleted = (currentWorkspace as WorkspaceWithSetup)
    ?.setupCompleted;
  const shouldShow =
    isLocalBridge && isDefined(currentWorkspace) && setupCompleted !== true;

  if (!shouldShow) {
    return null;
  }

  const handleChoose = async (workspaceMode: WorkspaceMode) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await setBridgeWorkspaceSetup(workspaceMode);
    // Reload so the rebuilt nav (and the chosen persona) hydrate everywhere.
    window.location.reload();
  };

  return (
    <>
      <ModalBackdrop
        overlay="dark"
        backdropZIndex={RootStackingContextZIndices.RootModalBackDrop}
      />
      <StyledOverlay>
        <StyledCard>
          <StyledTitle>Welcome to your research workspace</StyledTitle>
          <StyledSubtitle>
            How will you use it? You can change this later — it just tailors the
            navigation and defaults.
          </StyledSubtitle>
          <StyledChoices>
            <StyledChoice
              type="button"
              disabled={isSubmitting}
              onClick={() => handleChoose('SOLO')}
            >
              <StyledChoiceTitle>Solo researcher</StyledChoiceTitle>
              <StyledChoiceDescription>
                Track your own projects, funding, and outputs. The team roster
                is hidden.
              </StyledChoiceDescription>
            </StyledChoice>
            <StyledChoice
              type="button"
              disabled={isSubmitting}
              onClick={() => handleChoose('LAB')}
            >
              <StyledChoiceTitle>Research lab</StyledChoiceTitle>
              <StyledChoiceDescription>
                Manage several researchers, projects, and a shared funding
                pipeline.
              </StyledChoiceDescription>
            </StyledChoice>
          </StyledChoices>
          <Button
            title="Set up as a lab"
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => handleChoose('LAB')}
          />
        </StyledCard>
      </StyledOverlay>
    </>
  );
};
