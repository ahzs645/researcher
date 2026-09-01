import { type ManuscriptFundingAward } from '@/local-db/research/manuscript/manuscriptContributorMetadata';
import { type ManuscriptAuthor } from '@/local-db/research/manuscript/manuscriptContributors';

import {
  StyledCheckboxLabel,
  StyledDetailGrid,
  StyledFundingRow,
  StyledReferenceOptions,
} from './ManuscriptContributorsEditorStyles';
import {
  StyledTitlePageField,
  StyledTitlePageHeading,
  StyledTitlePageHint,
  StyledTitlePageInput,
  StyledTitlePageSmallButton,
} from './manuscriptTitlePageStyles';

// Awards, and who on the byline holds each one. A paper usually has one or
// two, so the list starts empty rather than offering a blank row.

type ManuscriptFundingFieldsProps = {
  awards: ManuscriptFundingAward[];
  authors: ManuscriptAuthor[];
  onChange: (awards: ManuscriptFundingAward[]) => void;
};

const nextAwardId = (awards: ManuscriptFundingAward[]): string =>
  `award-${
    awards.reduce((highest, award) => {
      const value = Number(award.id.replace('award-', ''));
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0) + 1
  }`;

export const ManuscriptFundingFields = ({
  awards,
  authors,
  onChange,
}: ManuscriptFundingFieldsProps) => {
  const updateAward = (
    awardId: string,
    update: (award: ManuscriptFundingAward) => ManuscriptFundingAward,
  ) =>
    onChange(
      awards.map((award) => (award.id === awardId ? update(award) : award)),
    );

  return (
    <>
      <StyledTitlePageHeading>
        Funding
        <StyledTitlePageSmallButton
          type="button"
          onClick={() => onChange([...awards, { id: nextAwardId(awards) }])}
        >
          Add award
        </StyledTitlePageSmallButton>
      </StyledTitlePageHeading>
      {awards.map((award, awardIndex) => (
        <StyledFundingRow key={award.id}>
          <StyledDetailGrid>
            <StyledTitlePageField>
              Funder
              <StyledTitlePageInput
                aria-label={`Award ${awardIndex + 1} funder`}
                value={award.funder ?? ''}
                onChange={(event) =>
                  updateAward(award.id, (current) => ({
                    ...current,
                    funder: event.target.value,
                  }))
                }
              />
            </StyledTitlePageField>
            <StyledTitlePageField>
              Funder ROR or DOI
              <StyledTitlePageInput
                aria-label={`Award ${awardIndex + 1} funder identifier`}
                placeholder="10.13039/501100000038"
                value={award.funderIdentifier ?? ''}
                onChange={(event) =>
                  updateAward(award.id, (current) => ({
                    ...current,
                    funderIdentifier: event.target.value,
                  }))
                }
              />
            </StyledTitlePageField>
            <StyledTitlePageField>
              Award or grant ID
              <StyledTitlePageInput
                aria-label={`Award ${awardIndex + 1} identifier`}
                value={award.awardId ?? ''}
                onChange={(event) =>
                  updateAward(award.id, (current) => ({
                    ...current,
                    awardId: event.target.value,
                  }))
                }
              />
            </StyledTitlePageField>
          </StyledDetailGrid>
          <StyledReferenceOptions>
            <StyledTitlePageHint>Awarded to</StyledTitlePageHint>
            {authors.map((author, authorIndex) => (
              <StyledCheckboxLabel key={author.id}>
                <input
                  type="checkbox"
                  aria-label={`Award ${awardIndex + 1} recipient ${authorIndex + 1}`}
                  checked={(award.recipientAuthorIds ?? []).includes(author.id)}
                  onChange={(event) =>
                    updateAward(award.id, (current) => ({
                      ...current,
                      recipientAuthorIds: event.target.checked
                        ? [...(current.recipientAuthorIds ?? []), author.id]
                        : (current.recipientAuthorIds ?? []).filter(
                            (id) => id !== author.id,
                          ),
                    }))
                  }
                />
                {author.name.length > 0
                  ? author.name
                  : `Author ${authorIndex + 1}`}
              </StyledCheckboxLabel>
            ))}
            <StyledTitlePageSmallButton
              type="button"
              aria-label={`Remove award ${awardIndex + 1}`}
              onClick={() =>
                onChange(awards.filter(({ id }) => id !== award.id))
              }
            >
              Remove
            </StyledTitlePageSmallButton>
          </StyledReferenceOptions>
        </StyledFundingRow>
      ))}
    </>
  );
};
