import { styled } from '@linaria/react';
import { useMemo, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptReferenceEditor } from '@/local-db/research/components/composer/references/ManuscriptReferenceEditor';
import {
  ManuscriptReferenceRow,
  missingReferenceFields,
} from '@/local-db/research/components/composer/references/ManuscriptReferenceRow';
import {
  referenceFormValuesToRecordUpdate,
  referenceToFormValues,
  type ReferenceFormValues,
  type ReferenceRecordUpdate,
} from '@/local-db/research/manuscript/manuscriptReferenceForm';
import { type ReferenceUsageByCitationKey } from '@/local-db/research/manuscript/manuscriptReferenceUsage';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type ManuscriptReferencePanelProps = {
  figures: FigureLike[];
  onDeleteReference: (reference: ReferenceLike) => Promise<void>;
  onSelectSection: (sectionId: string) => void;
  onUpdateReference: (
    reference: ReferenceLike,
    update: ReferenceRecordUpdate,
  ) => Promise<void>;
  references: ReferenceLike[];
  sections: SectionLike[];
  usage: ReferenceUsageByCitationKey;
};

type ReferenceFilter = 'all' | 'cited' | 'unused' | 'incomplete';

const REFERENCE_FILTERS: Array<{
  id: ReferenceFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'cited', label: 'Cited' },
  { id: 'unused', label: 'Unused' },
  { id: 'incomplete', label: 'Incomplete' },
];

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledControls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSearch = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 240px;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledFilter = styled.button`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};

  &[aria-pressed='true'] {
    background: ${themeCssVariables.background.tertiary};
    border-color: ${themeCssVariables.border.color.strong};
    color: ${themeCssVariables.font.color.primary};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledEmpty = styled.div`
  border: 1px dashed ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[4]};
  text-align: center;
`;

export const referenceSearchText = (reference: ReferenceLike): string =>
  [reference.citationKey, reference.authors, reference.name, reference.year]
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase();

export const ManuscriptReferencePanel = ({
  figures,
  onDeleteReference,
  onSelectSection,
  onUpdateReference,
  references,
  sections,
  usage,
}: ManuscriptReferencePanelProps) => {
  const { enqueueDialog } = useDialogManager();
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReferenceFilter>('all');
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(
    null,
  );
  const filteredReferences = useMemo(() => {
    const query = search.trim().toLowerCase();
    return references.filter((reference) => {
      const key = reference.citationKey?.trim() ?? '';
      const count = usage.get(key)?.count ?? 0;
      const matchesFilter =
        filter === 'all' ||
        (filter === 'cited' && count > 0) ||
        (filter === 'unused' && count === 0) ||
        (filter === 'incomplete' &&
          missingReferenceFields(reference).length > 0);
      return (
        matchesFilter &&
        (query.length === 0 || referenceSearchText(reference).includes(query))
      );
    });
  }, [filter, references, search, usage]);

  const persistEdit = async (
    reference: ReferenceLike,
    update: ReferenceRecordUpdate,
  ) => {
    try {
      await onUpdateReference(reference, update);
      setEditingReferenceId(null);
      enqueueSuccessSnackBar({ message: 'Reference updated' });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not update reference' });
      throw new Error('Could not update reference');
    }
  };

  const saveEdit = async (
    reference: ReferenceLike,
    values: ReferenceFormValues,
  ) => {
    const update = referenceFormValuesToRecordUpdate(values, reference);
    const oldKey = reference.citationKey?.trim() || reference.id;
    const newKey = update.citationKey?.trim() ?? '';
    if (newKey.length === 0) {
      enqueueErrorSnackBar({ message: 'Citation key cannot be empty' });
      return;
    }
    if (
      references.some(
        (candidate) =>
          candidate.id !== reference.id &&
          candidate.citationKey?.trim() === newKey,
      )
    ) {
      enqueueErrorSnackBar({
        message: `Citation key [@${newKey}] is already in use`,
      });
      return;
    }
    const citationCount = usage.get(oldKey)?.count ?? 0;
    if (oldKey !== newKey && citationCount > 0) {
      enqueueDialog({
        title: 'Rewrite cited reference key?',
        message: `Change [@${oldKey}] to [@${newKey}] and rewrite ${citationCount} citation token${citationCount === 1 ? '' : 's'} in this manuscript?`,
        buttons: [
          { title: 'Cancel' },
          {
            title: 'Rewrite and save',
            variant: 'primary',
            role: 'confirm',
            onClick: () => void persistEdit(reference, update),
          },
        ],
      });
      return;
    }
    await persistEdit(reference, update);
  };

  const deleteReference = (reference: ReferenceLike) => {
    const key = reference.citationKey?.trim() || reference.id;
    const citationCount = usage.get(key)?.count ?? 0;
    enqueueDialog({
      title: `Delete [@${key}]?`,
      message:
        citationCount > 0
          ? `Delete [@${key}]? Its ${citationCount} existing citation token${citationCount === 1 ? '' : 's'} will remain as unresolved warning${citationCount === 1 ? '' : 's'}.`
          : `Delete the unused reference [@${key}]?`,
      buttons: [
        { title: 'Cancel' },
        {
          title: 'Delete',
          accent: 'danger',
          role: 'confirm',
          onClick: () =>
            void onDeleteReference(reference)
              .then(() =>
                enqueueSuccessSnackBar({ message: `Deleted [@${key}]` }),
              )
              .catch(() =>
                enqueueErrorSnackBar({ message: 'Could not delete reference' }),
              ),
        },
      ],
    });
  };

  return (
    <StyledPanel>
      <StyledControls>
        <StyledSearch
          aria-label="Search references"
          placeholder="Search citation key, authors, title, or year…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <StyledFilters aria-label="Filter references">
          {REFERENCE_FILTERS.map((option) => (
            <StyledFilter
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </StyledFilter>
          ))}
        </StyledFilters>
      </StyledControls>
      <StyledCount>
        {filteredReferences.length} of {references.length} references
      </StyledCount>
      {filteredReferences.map((reference) => {
        const isEditing = editingReferenceId === reference.id;
        return (
          <ManuscriptReferenceRow
            key={reference.id}
            reference={reference}
            usage={
              usage.get(reference.citationKey?.trim() ?? '') ?? {
                count: 0,
                sectionIds: [],
              }
            }
            sections={sections}
            figures={figures}
            isEditing={isEditing}
            onDelete={() => deleteReference(reference)}
            onEdit={() =>
              setEditingReferenceId((currentId) =>
                currentId === reference.id ? null : reference.id,
              )
            }
            onSelectSection={onSelectSection}
            editor={
              <ManuscriptReferenceEditor
                initialValues={referenceToFormValues(reference)}
                onCancel={() => setEditingReferenceId(null)}
                onSave={(values) => saveEdit(reference, values)}
              />
            }
          />
        );
      })}
      {filteredReferences.length === 0 ? (
        <StyledEmpty>No references match this search and filter.</StyledEmpty>
      ) : null}
    </StyledPanel>
  );
};
