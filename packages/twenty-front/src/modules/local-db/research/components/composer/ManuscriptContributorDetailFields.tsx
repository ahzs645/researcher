import {
  CREDIT_ROLES,
  isValidOrcid,
  orderCreditRoles,
  type CreditRole,
} from '@/local-db/research/manuscript/manuscriptContributorIdentifiers';
import {
  type ManuscriptAffiliationDetail,
  type ManuscriptContributorDetail,
} from '@/local-db/research/manuscript/manuscriptContributorMetadata';

import {
  StyledCheckboxLabel,
  StyledDetailGrid,
  StyledDetailPanel,
  StyledFieldWarning,
  StyledReferenceOptions,
  StyledRoleOptions,
} from './ManuscriptContributorsEditorStyles';
import {
  StyledTitlePageField,
  StyledTitlePageHint,
  StyledTitlePageInput,
} from './manuscriptTitlePageStyles';

// The structured fields for one author and one affiliation. They live apart
// from the editor itself so the contributor list stays the short, scannable
// thing an author opens it for.

type ManuscriptAuthorDetailFieldsProps = {
  label: string;
  detail: ManuscriptContributorDetail;
  onChange: (detail: ManuscriptContributorDetail) => void;
};

const toggleRole = (
  roles: CreditRole[] | undefined,
  role: CreditRole,
  isChecked: boolean,
): CreditRole[] =>
  orderCreditRoles(
    isChecked
      ? [...(roles ?? []), role]
      : (roles ?? []).filter((current) => current !== role),
  );

export const ManuscriptAuthorDetailFields = ({
  label,
  detail,
  onChange,
}: ManuscriptAuthorDetailFieldsProps) => {
  const hasBadOrcid =
    (detail.orcid ?? '').length > 0 && !isValidOrcid(detail.orcid);

  return (
    <StyledDetailPanel>
      <StyledDetailGrid>
        <StyledTitlePageField>
          ORCID
          <StyledTitlePageInput
            aria-label={`${label} ORCID`}
            placeholder="0000-0002-1825-0097"
            value={detail.orcid ?? ''}
            onChange={(event) =>
              onChange({ ...detail, orcid: event.target.value })
            }
          />
          {hasBadOrcid && (
            <StyledFieldWarning role="alert">
              Check this ORCID — its final digit does not match the rest.
            </StyledFieldWarning>
          )}
        </StyledTitlePageField>
        <StyledTitlePageField>
          Email
          <StyledTitlePageInput
            aria-label={`${label} email`}
            type="email"
            value={detail.email ?? ''}
            onChange={(event) =>
              onChange({ ...detail, email: event.target.value })
            }
          />
        </StyledTitlePageField>
        <StyledTitlePageField>
          Note
          <StyledTitlePageInput
            aria-label={`${label} note`}
            placeholder="Present address, etc."
            value={detail.note ?? ''}
            onChange={(event) =>
              onChange({ ...detail, note: event.target.value })
            }
          />
        </StyledTitlePageField>
      </StyledDetailGrid>
      <StyledTitlePageHint>CRediT roles</StyledTitlePageHint>
      <StyledRoleOptions>
        {CREDIT_ROLES.map((role) => (
          <StyledCheckboxLabel key={role}>
            <input
              type="checkbox"
              aria-label={`${label} ${role}`}
              checked={(detail.creditRoles ?? []).includes(role)}
              onChange={(event) =>
                onChange({
                  ...detail,
                  creditRoles: toggleRole(
                    detail.creditRoles,
                    role,
                    event.target.checked,
                  ),
                })
              }
            />
            {role}
          </StyledCheckboxLabel>
        ))}
      </StyledRoleOptions>
      <StyledReferenceOptions>
        <StyledCheckboxLabel>
          <input
            type="checkbox"
            aria-label={`${label} equal contributor`}
            checked={detail.isEqualContributor === true}
            onChange={(event) =>
              onChange({
                ...detail,
                isEqualContributor: event.target.checked ? true : undefined,
              })
            }
          />
          Contributed equally
        </StyledCheckboxLabel>
        <StyledCheckboxLabel>
          <input
            type="checkbox"
            aria-label={`${label} deceased`}
            checked={detail.isDeceased === true}
            onChange={(event) =>
              onChange({
                ...detail,
                isDeceased: event.target.checked ? true : undefined,
              })
            }
          />
          Deceased
        </StyledCheckboxLabel>
      </StyledReferenceOptions>
    </StyledDetailPanel>
  );
};

type ManuscriptAffiliationDetailFieldsProps = {
  label: string;
  detail: ManuscriptAffiliationDetail;
  onChange: (detail: ManuscriptAffiliationDetail) => void;
};

const AFFILIATION_DETAIL_FIELDS = [
  { key: 'ror', label: 'ROR id', placeholder: '03rmrcq20' },
  { key: 'department', label: 'Department', placeholder: '' },
  { key: 'city', label: 'City', placeholder: '' },
  { key: 'state', label: 'State or province', placeholder: '' },
  { key: 'country', label: 'Country', placeholder: '' },
] as const satisfies ReadonlyArray<{
  key: keyof ManuscriptAffiliationDetail;
  label: string;
  placeholder: string;
}>;

export const ManuscriptAffiliationDetailFields = ({
  label,
  detail,
  onChange,
}: ManuscriptAffiliationDetailFieldsProps) => (
  <StyledDetailPanel>
    <StyledDetailGrid>
      {AFFILIATION_DETAIL_FIELDS.map((field) => (
        <StyledTitlePageField key={field.key}>
          {field.label}
          <StyledTitlePageInput
            aria-label={`${label} ${field.label}`}
            placeholder={field.placeholder}
            value={detail[field.key] ?? ''}
            onChange={(event) =>
              onChange({ ...detail, [field.key]: event.target.value })
            }
          />
        </StyledTitlePageField>
      ))}
    </StyledDetailGrid>
  </StyledDetailPanel>
);
