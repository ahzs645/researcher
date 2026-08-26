import { useState } from 'react';

import {
  joinManuscriptAffiliationDetails,
  joinManuscriptContributorDetails,
  parseManuscriptContributorMetadata,
  realignManuscriptContributorMetadata,
  serializeManuscriptContributorMetadata,
  type ManuscriptAffiliationDetail,
  type ManuscriptContributorDetail,
  type ManuscriptContributorMetadata,
  type ManuscriptFundingAward,
} from '@/local-db/research/manuscript/manuscriptContributorMetadata';
import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
  serializeManuscriptAffiliations,
  serializeManuscriptAuthors,
  type ManuscriptAffiliation,
  type ManuscriptAuthor,
} from '@/local-db/research/manuscript/manuscriptContributors';

import {
  ManuscriptAffiliationRow,
  ManuscriptAuthorRow,
} from './ManuscriptContributorRows';
import { ManuscriptContributorStatements } from './ManuscriptContributorStatements';
import { ManuscriptFundingFields } from './ManuscriptFundingFields';
import {
  StyledTitlePageField,
  StyledTitlePageHeading,
  StyledTitlePageHint,
  StyledTitlePageInput,
  StyledTitlePageSmallButton,
} from './manuscriptTitlePageStyles';

export type ManuscriptContributorValues = {
  authorLine: string;
  affiliations: string;
  correspondingAuthor: string;
  // Omitted unless the structured layer actually changed, so a composer that
  // never loaded one cannot blank it on an unrelated edit.
  contributorMetadata?: string;
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
  const [metadata, setMetadata] = useState<ManuscriptContributorMetadata>(() =>
    parseManuscriptContributorMetadata(initialValues.contributorMetadata),
  );
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [lastEmittedMetadata, setLastEmittedMetadata] = useState(
    initialValues.contributorMetadata ?? '',
  );

  const authorDetails = joinManuscriptContributorDetails(authors, metadata);
  const affiliationDetails = joinManuscriptAffiliationDetails(
    affiliations,
    metadata,
  );

  const emit = (
    nextAuthors: ManuscriptAuthor[],
    nextAffiliations: ManuscriptAffiliation[],
    nextMetadata: ManuscriptContributorMetadata = metadata,
    nextCorrespondingAuthor = correspondingAuthor,
  ) => {
    // Re-key to the ids the serialized byline will parse back to: the byline
    // is the source of truth for order, so the structured layer follows it.
    const serialized = serializeManuscriptContributorMetadata(
      realignManuscriptContributorMetadata(
        nextMetadata,
        nextAuthors,
        nextAffiliations,
      ),
    );
    // Only name the field when it actually moved, so a composer that never
    // loaded a structured block cannot blank one it never saw.
    const didMetadataChange = serialized !== lastEmittedMetadata;
    setLastEmittedMetadata(serialized);
    onChange({
      authorLine: serializeManuscriptAuthors(nextAuthors, nextAffiliations),
      affiliations: serializeManuscriptAffiliations(nextAffiliations),
      correspondingAuthor: nextCorrespondingAuthor,
      ...(didMetadataChange ? { contributorMetadata: serialized } : {}),
    });
  };

  const commitAuthors = (next: ManuscriptAuthor[]) => {
    setAuthors(next);
    emit(next, affiliations);
  };
  const commitAffiliations = (next: ManuscriptAffiliation[]) => {
    setAffiliations(next);
    emit(authors, next);
  };
  const commitMetadata = (next: ManuscriptContributorMetadata) => {
    setMetadata(next);
    emit(authors, affiliations, next);
  };

  // Detail is stored against the editor's own author ids, so a detail edit and
  // a funding recipient always name the same person.
  const updateAuthorDetail = (
    detailIndex: number,
    detail: ManuscriptContributorDetail,
  ) =>
    commitMetadata({
      ...metadata,
      authors: authorDetails.map((entry, index) => ({
        ...(index === detailIndex ? detail : entry.detail),
        authorId: authors[index].id,
      })),
    });

  const updateAffiliationDetail = (
    detailIndex: number,
    detail: ManuscriptAffiliationDetail,
  ) =>
    commitMetadata({
      ...metadata,
      affiliations: affiliationDetails.map((entry, index) => ({
        ...(index === detailIndex ? detail : entry.detail),
        affiliationId: affiliations[index].id,
      })),
    });

  const updateFunding = (funding: ManuscriptFundingAward[]) =>
    commitMetadata({ ...metadata, funding });

  const toggleDetail = (detailId: string) =>
    setOpenDetailId((current) => (current === detailId ? null : detailId));

  const removeAffiliation = (affiliationId: string) => {
    const nextAffiliations = affiliations.filter(
      ({ id }) => id !== affiliationId,
    );
    const nextAuthors = authors.map((author) => ({
      ...author,
      affiliationIds: author.affiliationIds.filter(
        (id) => id !== affiliationId,
      ),
    }));
    setAuthors(nextAuthors);
    setAffiliations(nextAffiliations);
    emit(nextAuthors, nextAffiliations);
  };

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
        <ManuscriptAuthorRow
          key={author.id}
          affiliations={affiliations}
          author={author}
          detail={authorDetails[authorIndex].detail}
          index={authorIndex}
          isDetailOpen={openDetailId === author.id}
          isFirst={authorIndex === 0}
          isLast={authorIndex === authors.length - 1}
          onChange={(next) =>
            commitAuthors(
              authors.map((entry) => (entry.id === author.id ? next : entry)),
            )
          }
          onChangeDetail={(detail) => updateAuthorDetail(authorIndex, detail)}
          onMove={(offset) =>
            commitAuthors(moveItem(authors, authorIndex, offset))
          }
          onRemove={() =>
            commitAuthors(authors.filter(({ id }) => id !== author.id))
          }
          onToggleDetail={() => toggleDetail(author.id)}
        />
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
        <ManuscriptAffiliationRow
          key={affiliation.id}
          affiliation={affiliation}
          detail={affiliationDetails[affiliationIndex].detail}
          index={affiliationIndex}
          isDetailOpen={openDetailId === affiliation.id}
          isFirst={affiliationIndex === 0}
          isLast={affiliationIndex === affiliations.length - 1}
          onChange={(next) =>
            commitAffiliations(
              affiliations.map((entry) =>
                entry.id === affiliation.id ? next : entry,
              ),
            )
          }
          onChangeDetail={(detail) =>
            updateAffiliationDetail(affiliationIndex, detail)
          }
          onMove={(offset) =>
            commitAffiliations(moveItem(affiliations, affiliationIndex, offset))
          }
          onRemove={() => removeAffiliation(affiliation.id)}
          onToggleDetail={() => toggleDetail(affiliation.id)}
        />
      ))}
      <StyledTitlePageHint>
        Reordering affiliations automatically renumbers every linked author.
      </StyledTitlePageHint>
      <ManuscriptFundingFields
        authors={authors}
        awards={metadata.funding}
        onChange={updateFunding}
      />
      <ManuscriptContributorStatements authors={authors} metadata={metadata} />
      <StyledTitlePageField>
        Corresponding author and email
        <StyledTitlePageInput
          aria-label="Corresponding author and email"
          value={correspondingAuthor}
          onChange={(event) => {
            setCorrespondingAuthor(event.target.value);
            emit(authors, affiliations, metadata, event.target.value);
          }}
        />
      </StyledTitlePageField>
    </>
  );
};
