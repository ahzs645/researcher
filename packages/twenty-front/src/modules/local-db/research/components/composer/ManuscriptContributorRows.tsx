import {
  type ManuscriptAffiliationDetail,
  type ManuscriptContributorDetail,
} from '@/local-db/research/manuscript/manuscriptContributorMetadata';
import {
  type ManuscriptAffiliation,
  type ManuscriptAuthor,
} from '@/local-db/research/manuscript/manuscriptContributors';

import {
  ManuscriptAffiliationDetailFields,
  ManuscriptAuthorDetailFields,
} from './ManuscriptContributorDetailFields';
import {
  StyledAffiliationRow,
  StyledCheckboxLabel,
  StyledContributorRow,
  StyledReferenceOptions,
} from './ManuscriptContributorsEditorStyles';
import {
  StyledTitlePageInput,
  StyledTitlePageRowActions,
  StyledTitlePageSmallButton,
} from './manuscriptTitlePageStyles';

// One author and one affiliation, each with its structured detail folded away
// behind a button. The editor above owns the state; these only render a row.

type ManuscriptRowActionsProps = {
  label: string;
  detailLabel: string;
  isDetailOpen: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onToggleDetail: () => void;
};

const ManuscriptRowActions = ({
  label,
  detailLabel,
  isDetailOpen,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onToggleDetail,
}: ManuscriptRowActionsProps) => (
  <StyledTitlePageRowActions>
    <StyledTitlePageSmallButton
      type="button"
      aria-label={`Details for ${label}`}
      aria-expanded={isDetailOpen}
      onClick={onToggleDetail}
    >
      {detailLabel}
    </StyledTitlePageSmallButton>
    <StyledTitlePageSmallButton
      type="button"
      aria-label={`Move ${label} up`}
      disabled={isFirst}
      onClick={() => onMove(-1)}
    >
      ↑
    </StyledTitlePageSmallButton>
    <StyledTitlePageSmallButton
      type="button"
      aria-label={`Move ${label} down`}
      disabled={isLast}
      onClick={() => onMove(1)}
    >
      ↓
    </StyledTitlePageSmallButton>
    <StyledTitlePageSmallButton
      type="button"
      aria-label={`Remove ${label}`}
      onClick={onRemove}
    >
      Remove
    </StyledTitlePageSmallButton>
  </StyledTitlePageRowActions>
);

type ManuscriptAuthorRowProps = {
  author: ManuscriptAuthor;
  index: number;
  affiliations: ManuscriptAffiliation[];
  detail: ManuscriptContributorDetail;
  isDetailOpen: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (author: ManuscriptAuthor) => void;
  onChangeDetail: (detail: ManuscriptContributorDetail) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onToggleDetail: () => void;
};

export const ManuscriptAuthorRow = ({
  author,
  index,
  affiliations,
  detail,
  isDetailOpen,
  isFirst,
  isLast,
  onChange,
  onChangeDetail,
  onMove,
  onRemove,
  onToggleDetail,
}: ManuscriptAuthorRowProps) => {
  const authorLabel = author.name || `Author ${index + 1}`;

  return (
    <StyledContributorRow>
      <StyledTitlePageInput
        aria-label={`Author ${index + 1} name`}
        placeholder="Author name"
        value={author.name}
        onChange={(event) => onChange({ ...author, name: event.target.value })}
      />
      <StyledReferenceOptions>
        {affiliations.map((affiliation, affiliationIndex) => (
          <StyledCheckboxLabel key={affiliation.id}>
            <input
              type="checkbox"
              aria-label={`${authorLabel} affiliation ${affiliationIndex + 1}`}
              checked={author.affiliationIds.includes(affiliation.id)}
              onChange={(event) =>
                onChange({
                  ...author,
                  affiliationIds: event.target.checked
                    ? [...author.affiliationIds, affiliation.id]
                    : author.affiliationIds.filter(
                        (id) => id !== affiliation.id,
                      ),
                })
              }
            />
            {affiliationIndex + 1}
          </StyledCheckboxLabel>
        ))}
        <StyledCheckboxLabel>
          <input
            type="checkbox"
            aria-label={`${authorLabel} corresponding author`}
            checked={author.isCorresponding}
            onChange={(event) =>
              onChange({ ...author, isCorresponding: event.target.checked })
            }
          />
          Corresponding (*)
        </StyledCheckboxLabel>
      </StyledReferenceOptions>
      <ManuscriptRowActions
        label={`author ${index + 1}`}
        detailLabel="ORCID, roles"
        isDetailOpen={isDetailOpen}
        isFirst={isFirst}
        isLast={isLast}
        onMove={onMove}
        onRemove={onRemove}
        onToggleDetail={onToggleDetail}
      />
      {isDetailOpen && (
        <ManuscriptAuthorDetailFields
          label={authorLabel}
          detail={detail}
          onChange={onChangeDetail}
        />
      )}
    </StyledContributorRow>
  );
};

type ManuscriptAffiliationRowProps = {
  affiliation: ManuscriptAffiliation;
  index: number;
  detail: ManuscriptAffiliationDetail;
  isDetailOpen: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (affiliation: ManuscriptAffiliation) => void;
  onChangeDetail: (detail: ManuscriptAffiliationDetail) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onToggleDetail: () => void;
};

export const ManuscriptAffiliationRow = ({
  affiliation,
  index,
  detail,
  isDetailOpen,
  isFirst,
  isLast,
  onChange,
  onChangeDetail,
  onMove,
  onRemove,
  onToggleDetail,
}: ManuscriptAffiliationRowProps) => (
  <StyledAffiliationRow>
    <span>{index + 1}</span>
    <StyledTitlePageInput
      aria-label={`Affiliation ${index + 1}`}
      value={affiliation.name}
      onChange={(event) =>
        onChange({ ...affiliation, name: event.target.value })
      }
    />
    <ManuscriptRowActions
      label={`affiliation ${index + 1}`}
      detailLabel="ROR, address"
      isDetailOpen={isDetailOpen}
      isFirst={isFirst}
      isLast={isLast}
      onMove={onMove}
      onRemove={onRemove}
      onToggleDetail={onToggleDetail}
    />
    {isDetailOpen && (
      <ManuscriptAffiliationDetailFields
        label={`Affiliation ${index + 1}`}
        detail={detail}
        onChange={onChangeDetail}
      />
    )}
  </StyledAffiliationRow>
);
