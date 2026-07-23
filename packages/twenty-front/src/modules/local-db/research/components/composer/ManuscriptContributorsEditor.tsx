import { useState } from 'react';

import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
  serializeManuscriptAffiliations,
  serializeManuscriptAuthors,
  type ManuscriptAffiliation,
  type ManuscriptAuthor,
} from '@/local-db/research/manuscript/manuscriptContributors';

import {
  StyledAffiliationRow,
  StyledCheckboxLabel,
  StyledContributorRow,
  StyledReferenceOptions,
} from './ManuscriptContributorsEditorStyles';
import {
  StyledTitlePageField,
  StyledTitlePageHeading,
  StyledTitlePageHint,
  StyledTitlePageInput,
  StyledTitlePageRowActions,
  StyledTitlePageSmallButton,
} from './manuscriptTitlePageStyles';

export type ManuscriptContributorValues = {
  authorLine: string;
  affiliations: string;
  correspondingAuthor: string;
};

type ManuscriptContributorsEditorProps = {
  initialValues: ManuscriptContributorValues;
  onChange: (values: ManuscriptContributorValues) => void;
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

const moveItem = <TItem,>(items: TItem[], index: number, offset: -1 | 1) => {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const ManuscriptContributorsEditor = ({
  initialValues,
  onChange,
}: ManuscriptContributorsEditorProps) => {
  const initialAffiliations = parseManuscriptAffiliations(
    initialValues.affiliations,
  );
  const [affiliations, setAffiliations] =
    useState<ManuscriptAffiliation[]>(initialAffiliations);
  const [authors, setAuthors] = useState<ManuscriptAuthor[]>(() =>
    parseManuscriptAuthors(initialValues.authorLine, initialAffiliations),
  );
  const [correspondingAuthor, setCorrespondingAuthor] = useState(
    initialValues.correspondingAuthor,
  );

  const emit = (
    nextAuthors: ManuscriptAuthor[],
    nextAffiliations: ManuscriptAffiliation[],
    nextCorrespondingAuthor = correspondingAuthor,
  ) =>
    onChange({
      authorLine: serializeManuscriptAuthors(nextAuthors, nextAffiliations),
      affiliations: serializeManuscriptAffiliations(nextAffiliations),
      correspondingAuthor: nextCorrespondingAuthor,
    });

  const commitAuthors = (next: ManuscriptAuthor[]) => {
    setAuthors(next);
    emit(next, affiliations);
  };
  const commitAffiliations = (next: ManuscriptAffiliation[]) => {
    setAffiliations(next);
    emit(authors, next);
  };
  const updateAuthor = (
    authorId: string,
    update: (author: ManuscriptAuthor) => ManuscriptAuthor,
  ) =>
    commitAuthors(
      authors.map((author) =>
        author.id === authorId ? update(author) : author,
      ),
    );

  return (
    <>
      <StyledTitlePageHeading>
        Ordered authors
        <StyledTitlePageSmallButton
          type="button"
          onClick={() =>
            commitAuthors([
              ...authors,
              {
                id: nextEntityId('author', authors),
                name: '',
                affiliationIds: [],
                isCorresponding: false,
              },
            ])
          }
        >
          Add author
        </StyledTitlePageSmallButton>
      </StyledTitlePageHeading>
      {authors.map((author, authorIndex) => (
        <StyledContributorRow key={author.id}>
          <StyledTitlePageInput
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
          <StyledTitlePageRowActions>
            <StyledTitlePageSmallButton
              type="button"
              aria-label={`Move author ${authorIndex + 1} up`}
              disabled={authorIndex === 0}
              onClick={() => commitAuthors(moveItem(authors, authorIndex, -1))}
            >
              ↑
            </StyledTitlePageSmallButton>
            <StyledTitlePageSmallButton
              type="button"
              aria-label={`Move author ${authorIndex + 1} down`}
              disabled={authorIndex === authors.length - 1}
              onClick={() => commitAuthors(moveItem(authors, authorIndex, 1))}
            >
              ↓
            </StyledTitlePageSmallButton>
            <StyledTitlePageSmallButton
              type="button"
              aria-label={`Remove author ${authorIndex + 1}`}
              onClick={() =>
                commitAuthors(authors.filter(({ id }) => id !== author.id))
              }
            >
              Remove
            </StyledTitlePageSmallButton>
          </StyledTitlePageRowActions>
        </StyledContributorRow>
      ))}
      <StyledTitlePageHeading>
        Ordered affiliations
        <StyledTitlePageSmallButton
          type="button"
          onClick={() =>
            commitAffiliations([
              ...affiliations,
              { id: nextEntityId('affiliation', affiliations), name: '' },
            ])
          }
        >
          Add affiliation
        </StyledTitlePageSmallButton>
      </StyledTitlePageHeading>
      {affiliations.map((affiliation, affiliationIndex) => (
        <StyledAffiliationRow key={affiliation.id}>
          <span>{affiliationIndex + 1}</span>
          <StyledTitlePageInput
            aria-label={`Affiliation ${affiliationIndex + 1}`}
            value={affiliation.name}
            onChange={(event) =>
              commitAffiliations(
                affiliations.map((entry) =>
                  entry.id === affiliation.id
                    ? { ...entry, name: event.target.value }
                    : entry,
                ),
              )
            }
          />
          <StyledTitlePageRowActions>
            <StyledTitlePageSmallButton
              type="button"
              aria-label={`Move affiliation ${affiliationIndex + 1} up`}
              disabled={affiliationIndex === 0}
              onClick={() =>
                commitAffiliations(moveItem(affiliations, affiliationIndex, -1))
              }
            >
              ↑
            </StyledTitlePageSmallButton>
            <StyledTitlePageSmallButton
              type="button"
              aria-label={`Move affiliation ${affiliationIndex + 1} down`}
              disabled={affiliationIndex === affiliations.length - 1}
              onClick={() =>
                commitAffiliations(moveItem(affiliations, affiliationIndex, 1))
              }
            >
              ↓
            </StyledTitlePageSmallButton>
            <StyledTitlePageSmallButton
              type="button"
              aria-label={`Remove affiliation ${affiliationIndex + 1}`}
              onClick={() => {
                const nextAffiliations = affiliations.filter(
                  ({ id }) => id !== affiliation.id,
                );
                const nextAuthors = authors.map((entry) => ({
                  ...entry,
                  affiliationIds: entry.affiliationIds.filter(
                    (id) => id !== affiliation.id,
                  ),
                }));
                setAuthors(nextAuthors);
                setAffiliations(nextAffiliations);
                emit(nextAuthors, nextAffiliations);
              }}
            >
              Remove
            </StyledTitlePageSmallButton>
          </StyledTitlePageRowActions>
        </StyledAffiliationRow>
      ))}
      <StyledTitlePageHint>
        Reordering affiliations automatically renumbers every linked author.
      </StyledTitlePageHint>
      <StyledTitlePageField>
        Corresponding author and email
        <StyledTitlePageInput
          aria-label="Corresponding author and email"
          value={correspondingAuthor}
          onChange={(event) => {
            setCorrespondingAuthor(event.target.value);
            emit(authors, affiliations, event.target.value);
          }}
        />
      </StyledTitlePageField>
    </>
  );
};
