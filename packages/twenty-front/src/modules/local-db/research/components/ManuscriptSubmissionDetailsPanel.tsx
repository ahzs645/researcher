import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  formatManuscriptAuthorLine,
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
  serializeManuscriptAffiliations,
  serializeManuscriptAuthors,
  type ManuscriptAffiliation,
  type ManuscriptAuthor,
} from '@/local-db/research/manuscript/manuscriptContributors';
import { type SubmissionMaterials } from '@/local-db/research/manuscript/manuscriptSubmission';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

export type ManuscriptSubmissionDetails = SubmissionMaterials & {
  authorLine?: string | null;
  affiliations?: string | null;
  correspondingAuthor?: string | null;
  supplementTitle?: string | null;
  supplementAuthorLine?: string | null;
  supplementAffiliations?: string | null;
};

type ManuscriptSubmissionDetailsPanelProps = {
  initialValues: ManuscriptSubmissionDetails;
  journalName: string;
  requiredArtifacts: string[];
  onSave: (values: ManuscriptSubmissionDetails) => Promise<void>;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
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

const StyledWideField = styled(StyledField)`
  grid-column: 1 / -1;
`;

const StyledWideGroup = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  grid-column: 1 / -1;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 88px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledContributorEditor = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledEditorHeading = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  justify-content: space-between;
`;

const StyledContributorRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;
  padding: ${themeCssVariables.spacing[2]};

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const StyledAffiliationRow = styled.div`
  align-items: center;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 28px minmax(0, 1fr) auto;
`;

const StyledReferenceOptions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledCheckboxLabel = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: inline-flex;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledRowActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledSmallButton = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  min-height: 28px;
  padding: 2px ${themeCssVariables.spacing[2]};

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }
`;

const StyledPreview = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-family: 'Times New Roman', serif;
  font-size: ${themeCssVariables.font.size.sm};
  text-align: center;
`;

const ARTIFACT_LABELS: Record<string, string> = {
  COVER_LETTER: 'cover letter',
  HIGHLIGHTS: 'highlights',
  COMPETING_INTERESTS: 'competing-interests declaration',
  SUGGESTED_REVIEWERS: 'suggested reviewers',
  SEPARATE_FIGURES: 'separate figure files',
};

const nextEntityId = (
  prefix: 'author' | 'affiliation',
  entities: Array<{ id: string }>,
): string => {
  const maximum = entities.reduce((currentMaximum, entity) => {
    const value = Number(entity.id.replace(`${prefix}-`, ''));
    return Number.isFinite(value)
      ? Math.max(currentMaximum, value)
      : currentMaximum;
  }, 0);
  return `${prefix}-${maximum + 1}`;
};

export const ManuscriptSubmissionDetailsPanel = ({
  initialValues,
  journalName,
  requiredArtifacts,
  onSave,
}: ManuscriptSubmissionDetailsPanelProps) => {
  const [values, setValues] = useState(initialValues);
  const initialAffiliations = parseManuscriptAffiliations(
    initialValues.affiliations,
  );
  const [affiliations, setAffiliations] =
    useState<ManuscriptAffiliation[]>(initialAffiliations);
  const [authors, setAuthors] = useState<ManuscriptAuthor[]>(() =>
    parseManuscriptAuthors(initialValues.authorLine, initialAffiliations),
  );
  const [isSaving, setIsSaving] = useState(false);
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const updateValue = (
    field: keyof ManuscriptSubmissionDetails,
    value: string,
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const serializedValues = {
        ...values,
        authorLine: serializeManuscriptAuthors(authors, affiliations),
        affiliations: serializeManuscriptAffiliations(affiliations),
      };
      await onSave(serializedValues);
      setValues(serializedValues);
      enqueueSuccessSnackBar({ message: 'Submission details saved' });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not save submission details' });
    } finally {
      setIsSaving(false);
    }
  };

  const required = requiredArtifacts
    .map((artifact) => ARTIFACT_LABELS[artifact] ?? artifact.toLowerCase())
    .join(', ');

  const moveAffiliation = (index: number, direction: -1 | 1) => {
    setAffiliations((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateAuthor = (
    authorId: string,
    update: (author: ManuscriptAuthor) => ManuscriptAuthor,
  ) =>
    setAuthors((current) =>
      current.map((author) =>
        author.id === authorId ? update(author) : author,
      ),
    );

  const previewAuthorLine = formatManuscriptAuthorLine(
    serializeManuscriptAuthors(authors, affiliations),
    serializeManuscriptAffiliations(affiliations),
  );

  return (
    <StyledPanel>
      <StyledHint>
        These values connect the reusable manuscript to{' '}
        {journalName || 'the selected journal'}.
        {required.length > 0 ? ` Required package items: ${required}.` : ''}
      </StyledHint>
      <StyledGrid>
        <StyledWideField>
          Authors and affiliation links
          <StyledContributorEditor>
            <StyledEditorHeading>
              Ordered authors
              <StyledSmallButton
                type="button"
                onClick={() => {
                  setAuthors((current) => {
                    const id = nextEntityId('author', current);
                    return [
                      ...current,
                      {
                        id,
                        name: '',
                        affiliationIds: [],
                        isCorresponding: false,
                      },
                    ];
                  });
                }}
              >
                Add author
              </StyledSmallButton>
            </StyledEditorHeading>
            {authors.map((author, authorIndex) => (
              <StyledContributorRow key={author.id}>
                <StyledInput
                  aria-label={`Author ${authorIndex + 1} name`}
                  placeholder="Author name"
                  value={author.name}
                  onChange={(event) =>
                    updateAuthor(author.id, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
                <StyledReferenceOptions>
                  {affiliations.map((affiliation, affiliationIndex) => (
                    <StyledCheckboxLabel key={affiliation.id}>
                      <input
                        type="checkbox"
                        aria-label={`${author.name || `Author ${authorIndex + 1}`} affiliation ${affiliationIndex + 1}`}
                        checked={author.affiliationIds.includes(affiliation.id)}
                        onChange={(event) =>
                          updateAuthor(author.id, (current) => ({
                            ...current,
                            affiliationIds: event.target.checked
                              ? [...current.affiliationIds, affiliation.id]
                              : current.affiliationIds.filter(
                                  (id) => id !== affiliation.id,
                                ),
                          }))
                        }
                      />
                      {affiliationIndex + 1}
                    </StyledCheckboxLabel>
                  ))}
                  <StyledCheckboxLabel>
                    <input
                      type="checkbox"
                      aria-label={`${author.name || `Author ${authorIndex + 1}`} corresponding author`}
                      checked={author.isCorresponding}
                      onChange={(event) =>
                        updateAuthor(author.id, (current) => ({
                          ...current,
                          isCorresponding: event.target.checked,
                        }))
                      }
                    />
                    Corresponding (*)
                  </StyledCheckboxLabel>
                </StyledReferenceOptions>
                <StyledRowActions>
                  <StyledSmallButton
                    type="button"
                    aria-label={`Move author ${authorIndex + 1} up`}
                    disabled={authorIndex === 0}
                    onClick={() =>
                      setAuthors((current) => {
                        const next = [...current];
                        [next[authorIndex - 1], next[authorIndex]] = [
                          next[authorIndex],
                          next[authorIndex - 1],
                        ];
                        return next;
                      })
                    }
                  >
                    ↑
                  </StyledSmallButton>
                  <StyledSmallButton
                    type="button"
                    aria-label={`Move author ${authorIndex + 1} down`}
                    disabled={authorIndex === authors.length - 1}
                    onClick={() =>
                      setAuthors((current) => {
                        const next = [...current];
                        [next[authorIndex], next[authorIndex + 1]] = [
                          next[authorIndex + 1],
                          next[authorIndex],
                        ];
                        return next;
                      })
                    }
                  >
                    ↓
                  </StyledSmallButton>
                  <StyledSmallButton
                    type="button"
                    aria-label={`Remove author ${authorIndex + 1}`}
                    onClick={() =>
                      setAuthors((current) =>
                        current.filter((entry) => entry.id !== author.id),
                      )
                    }
                  >
                    Remove
                  </StyledSmallButton>
                </StyledRowActions>
              </StyledContributorRow>
            ))}
            <StyledEditorHeading>
              Ordered affiliations
              <StyledSmallButton
                type="button"
                onClick={() => {
                  setAffiliations((current) => [
                    ...current,
                    { id: nextEntityId('affiliation', current), name: '' },
                  ]);
                }}
              >
                Add affiliation
              </StyledSmallButton>
            </StyledEditorHeading>
            {affiliations.map((affiliation, affiliationIndex) => (
              <StyledAffiliationRow key={affiliation.id}>
                <span>{affiliationIndex + 1}</span>
                <StyledInput
                  aria-label={`Affiliation ${affiliationIndex + 1}`}
                  value={affiliation.name}
                  onChange={(event) =>
                    setAffiliations((current) =>
                      current.map((entry) =>
                        entry.id === affiliation.id
                          ? { ...entry, name: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <StyledRowActions>
                  <StyledSmallButton
                    type="button"
                    aria-label={`Move affiliation ${affiliationIndex + 1} up`}
                    disabled={affiliationIndex === 0}
                    onClick={() => moveAffiliation(affiliationIndex, -1)}
                  >
                    ↑
                  </StyledSmallButton>
                  <StyledSmallButton
                    type="button"
                    aria-label={`Move affiliation ${affiliationIndex + 1} down`}
                    disabled={affiliationIndex === affiliations.length - 1}
                    onClick={() => moveAffiliation(affiliationIndex, 1)}
                  >
                    ↓
                  </StyledSmallButton>
                  <StyledSmallButton
                    type="button"
                    aria-label={`Remove affiliation ${affiliationIndex + 1}`}
                    onClick={() => {
                      setAffiliations((current) =>
                        current.filter((entry) => entry.id !== affiliation.id),
                      );
                      setAuthors((current) =>
                        current.map((entry) => ({
                          ...entry,
                          affiliationIds: entry.affiliationIds.filter(
                            (id) => id !== affiliation.id,
                          ),
                        })),
                      );
                    }}
                  >
                    Remove
                  </StyledSmallButton>
                </StyledRowActions>
              </StyledAffiliationRow>
            ))}
            <StyledPreview>
              {previewAuthorLine || 'Title-page author preview'}
            </StyledPreview>
            <StyledHint>
              Reordering affiliations automatically renumbers every linked
              author in the preview and Word export.
            </StyledHint>
          </StyledContributorEditor>
        </StyledWideField>
        <StyledWideField>
          Corresponding author and email
          <StyledInput
            aria-label="Corresponding author and email"
            value={values.correspondingAuthor ?? ''}
            onChange={(event) =>
              updateValue('correspondingAuthor', event.target.value)
            }
          />
        </StyledWideField>
        <StyledWideGroup>
          <StyledEditorHeading>Supplement cover overrides</StyledEditorHeading>
          <StyledHint>
            Leave these blank to reuse the main manuscript title, linked
            authors, and ordered affiliations.
          </StyledHint>
          <StyledField>
            Supplement title
            <StyledInput
              aria-label="Supplement title"
              value={values.supplementTitle ?? ''}
              onChange={(event) =>
                updateValue('supplementTitle', event.target.value)
              }
            />
          </StyledField>
          <StyledField>
            Supplement author line
            <StyledTextarea
              aria-label="Supplement author line"
              value={values.supplementAuthorLine ?? ''}
              onChange={(event) =>
                updateValue('supplementAuthorLine', event.target.value)
              }
            />
          </StyledField>
          <StyledField>
            Supplement affiliations
            <StyledTextarea
              aria-label="Supplement affiliations"
              value={values.supplementAffiliations ?? ''}
              onChange={(event) =>
                updateValue('supplementAffiliations', event.target.value)
              }
            />
          </StyledField>
        </StyledWideGroup>
        <StyledField>
          Cover letter
          <StyledTextarea
            aria-label="Cover letter"
            value={values.coverLetter ?? ''}
            onChange={(event) => updateValue('coverLetter', event.target.value)}
          />
        </StyledField>
        <StyledField>
          Highlights (one per line)
          <StyledTextarea
            aria-label="Highlights"
            value={values.highlights ?? ''}
            onChange={(event) => updateValue('highlights', event.target.value)}
          />
        </StyledField>
        <StyledField>
          Competing-interests declaration
          <StyledTextarea
            aria-label="Competing-interests declaration"
            value={values.competingInterests ?? ''}
            onChange={(event) =>
              updateValue('competingInterests', event.target.value)
            }
          />
        </StyledField>
        <StyledField>
          Suggested reviewers (one per line)
          <StyledTextarea
            aria-label="Suggested reviewers"
            value={values.suggestedReviewers ?? ''}
            onChange={(event) =>
              updateValue('suggestedReviewers', event.target.value)
            }
          />
        </StyledField>
      </StyledGrid>
      <div>
        <Button
          title={isSaving ? 'Saving…' : 'Save submission details'}
          variant="primary"
          accent="blue"
          size="small"
          disabled={isSaving}
          onClick={save}
        />
      </div>
    </StyledPanel>
  );
};
