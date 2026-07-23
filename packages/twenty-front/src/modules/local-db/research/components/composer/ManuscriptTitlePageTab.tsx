import { styled } from '@linaria/react';
import { useState } from 'react';
import { H2Title } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type ManuscriptRecord,
  type SectionRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import {
  moveManuscriptTitlePageLine,
  parseManuscriptTitlePageExtraLines,
} from '@/local-db/research/manuscript/manuscriptTitlePage';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

import {
  ManuscriptContributorsEditor,
  type ManuscriptContributorValues,
} from './ManuscriptContributorsEditor';
import { ManuscriptTitlePageFragments } from './ManuscriptTitlePageFragments';
import { ManuscriptTitlePagePreview } from './ManuscriptTitlePagePreview';
import {
  StyledTitlePageCard,
  StyledTitlePageExtraLineRow,
  StyledTitlePageField,
  StyledTitlePageFields,
  StyledTitlePageHeading,
  StyledTitlePageHint,
  StyledTitlePageInput,
  StyledTitlePageRowActions,
  StyledTitlePageSmallButton,
  StyledTitlePageTextarea,
} from './manuscriptTitlePageStyles';

export type ManuscriptTitlePageDetails = ManuscriptContributorValues & {
  name: string;
  titlePageExtraLines: string[];
  keywords: string;
  keywordsSectionId?: string;
};

type ManuscriptTitlePageTabProps = {
  manuscript: ManuscriptRecord;
  sections: SectionRecord[];
  style: JournalStyle;
  onSave: (values: ManuscriptTitlePageDetails) => Promise<void>;
  onAddKeywordsSection: () => Promise<void>;
  onDeleteSection: (sectionId: string) => Promise<void>;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  & h2 {
    margin-bottom: 0;
  }
`;

const StyledColumns = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export const ManuscriptTitlePageTab = ({
  manuscript,
  sections,
  style,
  onSave,
  onAddKeywordsSection,
  onDeleteSection,
}: ManuscriptTitlePageTabProps) => {
  const keywordsSection = sections.find(
    (section) => section.sectionType?.toUpperCase() === 'KEYWORDS',
  );
  const fragments = sections.filter(
    (section) =>
      section.placement === 'FRONT_MATTER' &&
      ['OTHER', 'TITLE_PAGE'].includes(
        section.sectionType?.toUpperCase() ?? 'OTHER',
      ),
  );
  const [name, setName] = useState(manuscript.name ?? '');
  const [contributors, setContributors] = useState<ManuscriptContributorValues>(
    {
      authorLine: manuscript.authorLine ?? '',
      affiliations: manuscript.affiliations ?? '',
      correspondingAuthor: manuscript.correspondingAuthor ?? '',
    },
  );
  const [extraLines, setExtraLines] = useState(() =>
    parseManuscriptTitlePageExtraLines(manuscript.titlePageExtraLines),
  );
  const [keywords, setKeywords] = useState(keywordsSection?.content ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const currentValues = (
    nextExtraLines = extraLines,
  ): ManuscriptTitlePageDetails => ({
    name,
    ...contributors,
    titlePageExtraLines: nextExtraLines,
    keywords,
    ...(keywordsSection !== undefined
      ? { keywordsSectionId: keywordsSection.id }
      : {}),
  });

  const save = async (values = currentValues()): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    try {
      await onSave(values);
      enqueueSuccessSnackBar({ message: 'Title page saved' });
      return true;
    } catch {
      enqueueErrorSnackBar({ message: 'Could not save title page' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledTab>
      <H2Title title="Title page" />
      <StyledColumns>
        <StyledTitlePageFields>
          <StyledTitlePageCard>
            <StyledTitlePageField>
              Manuscript title
              <StyledTitlePageInput
                aria-label="Manuscript title"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </StyledTitlePageField>
          </StyledTitlePageCard>
          <StyledTitlePageCard>
            <ManuscriptContributorsEditor
              initialValues={contributors}
              onChange={setContributors}
            />
          </StyledTitlePageCard>
          <StyledTitlePageCard>
            <StyledTitlePageHeading>
              Keywords
              {keywordsSection === undefined ? (
                <StyledTitlePageSmallButton
                  type="button"
                  onClick={() =>
                    void onAddKeywordsSection().catch(() =>
                      enqueueErrorSnackBar({
                        message: 'Could not add keywords section',
                      }),
                    )
                  }
                >
                  Add keywords section
                </StyledTitlePageSmallButton>
              ) : null}
            </StyledTitlePageHeading>
            {keywordsSection === undefined ? (
              <StyledTitlePageHint>
                Add a real keywords section to edit and export keywords here.
              </StyledTitlePageHint>
            ) : (
              <StyledTitlePageTextarea
                aria-label="Keywords"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
              />
            )}
          </StyledTitlePageCard>
          <StyledTitlePageCard>
            <StyledTitlePageHeading>
              Extra title-page lines
              <StyledTitlePageSmallButton
                type="button"
                onClick={() => setExtraLines((current) => [...current, ''])}
              >
                Add line
              </StyledTitlePageSmallButton>
            </StyledTitlePageHeading>
            <StyledTitlePageHint>
              Thesis, degree, institution, and date lines appear after
              affiliations.
            </StyledTitlePageHint>
            {extraLines.map((line, index) => (
              <StyledTitlePageExtraLineRow key={index}>
                <StyledTitlePageInput
                  aria-label={`Extra title-page line ${index + 1}`}
                  value={line}
                  onChange={(event) =>
                    setExtraLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? event.target.value : entry,
                      ),
                    )
                  }
                />
                <StyledTitlePageRowActions>
                  <StyledTitlePageSmallButton
                    type="button"
                    aria-label={`Move extra line ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() =>
                      setExtraLines((current) =>
                        moveManuscriptTitlePageLine(current, index, -1),
                      )
                    }
                  >
                    ↑
                  </StyledTitlePageSmallButton>
                  <StyledTitlePageSmallButton
                    type="button"
                    aria-label={`Move extra line ${index + 1} down`}
                    disabled={index === extraLines.length - 1}
                    onClick={() =>
                      setExtraLines((current) =>
                        moveManuscriptTitlePageLine(current, index, 1),
                      )
                    }
                  >
                    ↓
                  </StyledTitlePageSmallButton>
                  <StyledTitlePageSmallButton
                    type="button"
                    aria-label={`Remove extra line ${index + 1}`}
                    onClick={() =>
                      setExtraLines((current) =>
                        current.filter(
                          (_entry, entryIndex) => entryIndex !== index,
                        ),
                      )
                    }
                  >
                    Remove
                  </StyledTitlePageSmallButton>
                </StyledTitlePageRowActions>
              </StyledTitlePageExtraLineRow>
            ))}
          </StyledTitlePageCard>
          <Button
            title={isSaving ? 'Saving…' : 'Save title page'}
            variant="primary"
            accent="blue"
            size="small"
            disabled={isSaving}
            onClick={() => void save()}
          />
        </StyledTitlePageFields>
        <ManuscriptTitlePagePreview
          title={name}
          authorLine={contributors.authorLine}
          affiliations={contributors.affiliations}
          correspondingAuthor={contributors.correspondingAuthor}
          extraLines={extraLines}
          keywords={keywords}
          style={style}
        />
      </StyledColumns>
      <ManuscriptTitlePageFragments
        sections={fragments}
        onAbsorb={async (section, text) => {
          const nextLines = [...extraLines, text];
          const didSave = await save(currentValues(nextLines));
          if (!didSave) return;
          setExtraLines(nextLines);
          await onDeleteSection(section.id).catch(() =>
            enqueueErrorSnackBar({
              message:
                'The line was saved, but the fragment could not be deleted',
            }),
          );
        }}
        onDelete={(sectionId) =>
          onDeleteSection(sectionId).catch(() => {
            enqueueErrorSnackBar({
              message: 'Could not delete title-page fragment',
            });
          })
        }
      />
    </StyledTab>
  );
};
