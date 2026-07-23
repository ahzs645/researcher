import { type Dispatch, type SetStateAction } from 'react';
import { Button } from 'twenty-ui/input';

import {
  type ManuscriptContributorValues,
  ManuscriptContributorsEditor,
} from '@/local-db/research/components/composer/ManuscriptContributorsEditor';
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
} from '@/local-db/research/components/composer/manuscriptTitlePageStyles';
import { moveManuscriptTitlePageLine } from '@/local-db/research/manuscript/manuscriptTitlePage';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type ManuscriptTitlePageFieldsProps = {
  contributors: ManuscriptContributorValues;
  extraLines: string[];
  hasKeywordsSection: boolean;
  isSaving: boolean;
  keywords: string;
  name: string;
  onAddKeywordsSection: () => Promise<void>;
  onChangeContributors: (values: ManuscriptContributorValues) => void;
  onChangeExtraLines: Dispatch<SetStateAction<string[]>>;
  onChangeKeywords: (value: string) => void;
  onChangeName: (value: string) => void;
  onSave: () => void;
};

export const ManuscriptTitlePageFields = ({
  contributors,
  extraLines,
  hasKeywordsSection,
  isSaving,
  keywords,
  name,
  onAddKeywordsSection,
  onChangeContributors,
  onChangeExtraLines,
  onChangeKeywords,
  onChangeName,
  onSave,
}: ManuscriptTitlePageFieldsProps) => {
  const { enqueueErrorSnackBar } = useSnackBar();

  return (
    <StyledTitlePageFields>
      <StyledTitlePageCard>
        <StyledTitlePageField>
          Manuscript title
          <StyledTitlePageInput
            aria-label="Manuscript title"
            value={name}
            onChange={(event) => onChangeName(event.target.value)}
          />
          <StyledTitlePageHint>
            This is the manuscript record&apos;s name — it appears in the
            manuscript list, exports, and the submission checklist.
          </StyledTitlePageHint>
        </StyledTitlePageField>
      </StyledTitlePageCard>
      <StyledTitlePageCard>
        <ManuscriptContributorsEditor
          initialValues={contributors}
          onChange={onChangeContributors}
        />
      </StyledTitlePageCard>
      <StyledTitlePageCard>
        <StyledTitlePageHeading>
          Keywords
          {!hasKeywordsSection ? (
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
        {!hasKeywordsSection ? (
          <StyledTitlePageHint>
            Add a real keywords section to edit and export keywords here.
          </StyledTitlePageHint>
        ) : (
          <>
            <StyledTitlePageTextarea
              aria-label="Keywords"
              value={keywords}
              onChange={(event) => onChangeKeywords(event.target.value)}
            />
            <StyledTitlePageHint>
              Edits the manuscript&apos;s real Keywords section.
            </StyledTitlePageHint>
          </>
        )}
      </StyledTitlePageCard>
      <StyledTitlePageCard>
        <StyledTitlePageHeading>
          Extra title-page lines
          <StyledTitlePageSmallButton
            type="button"
            onClick={() => onChangeExtraLines((current) => [...current, ''])}
          >
            Add line
          </StyledTitlePageSmallButton>
        </StyledTitlePageHeading>
        <StyledTitlePageHint>
          Thesis, degree, institution, and date lines appear after affiliations.
        </StyledTitlePageHint>
        {extraLines.map((line, index) => (
          <StyledTitlePageExtraLineRow key={index}>
            <StyledTitlePageInput
              aria-label={`Extra title-page line ${index + 1}`}
              value={line}
              onChange={(event) =>
                onChangeExtraLines((current) =>
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
                  onChangeExtraLines((current) =>
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
                  onChangeExtraLines((current) =>
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
                  onChangeExtraLines((current) =>
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
        title={isSaving ? 'Saving…' : 'Save front matter'}
        variant="primary"
        accent="blue"
        size="small"
        disabled={isSaving}
        onClick={onSave}
      />
    </StyledTitlePageFields>
  );
};
