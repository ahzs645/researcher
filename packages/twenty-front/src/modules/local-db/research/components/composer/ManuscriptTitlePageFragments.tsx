import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type SectionRecord } from '@/local-db/research/components/composer/manuscriptComposerData';
import { manuscriptTitlePageFragmentText } from '@/local-db/research/manuscript/manuscriptTitlePage';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';

import {
  StyledTitlePageCard,
  StyledTitlePageHeading,
  StyledTitlePageHint,
  StyledTitlePageRowActions,
  StyledTitlePageSmallButton,
} from './manuscriptTitlePageStyles';

type ManuscriptTitlePageFragmentsProps = {
  sections: SectionRecord[];
  onAbsorb: (section: SectionRecord, text: string) => Promise<void>;
  onDelete: (sectionId: string) => Promise<void>;
};

const StyledFragmentRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledFragmentText = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ManuscriptTitlePageFragments = ({
  sections,
  onAbsorb,
  onDelete,
}: ManuscriptTitlePageFragmentsProps) => {
  const { enqueueDialog } = useDialogManager();

  return (
    <StyledTitlePageCard>
      <StyledTitlePageHeading>
        Imported title-page fragments
      </StyledTitlePageHeading>
      <StyledTitlePageHint>
        Absorb useful scraps into the structured title page or remove them.
        Abstract and keywords sections stay in the manuscript.
      </StyledTitlePageHint>
      {sections.length === 0 ? (
        <StyledTitlePageHint>
          No unabsorbed front-matter scraps.
        </StyledTitlePageHint>
      ) : null}
      {sections.map((section) => {
        const text = manuscriptTitlePageFragmentText(section.content ?? '');
        const firstContentLine = (section.content ?? '')
          .split(/\r?\n/)
          .find((line) => line.trim().length > 0);
        const firstLine =
          manuscriptTitlePageFragmentText(firstContentLine ?? '') ||
          section.name ||
          'Empty fragment';
        return (
          <StyledFragmentRow key={section.id}>
            <StyledFragmentText title={firstLine}>
              {firstLine}
            </StyledFragmentText>
            <StyledTitlePageRowActions>
              <StyledTitlePageSmallButton
                type="button"
                disabled={text.length === 0}
                onClick={() =>
                  enqueueDialog({
                    title: 'Absorb title-page fragment',
                    message:
                      'Append this text as an extra title-page line and delete the original section?',
                    buttons: [
                      { title: 'Cancel' },
                      {
                        title: 'Absorb',
                        role: 'confirm',
                        onClick: () => void onAbsorb(section, text),
                      },
                    ],
                  })
                }
              >
                Absorb as extra line
              </StyledTitlePageSmallButton>
              <StyledTitlePageSmallButton
                type="button"
                onClick={() =>
                  enqueueDialog({
                    title: 'Delete title-page fragment',
                    message: 'Delete this imported front-matter section?',
                    buttons: [
                      { title: 'Cancel' },
                      {
                        title: 'Delete',
                        accent: 'danger',
                        role: 'confirm',
                        onClick: () => void onDelete(section.id),
                      },
                    ],
                  })
                }
              >
                Delete
              </StyledTitlePageSmallButton>
            </StyledTitlePageRowActions>
          </StyledFragmentRow>
        );
      })}
    </StyledTitlePageCard>
  );
};
