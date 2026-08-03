import {
  EMPTY_REFERENCE_FORM_VALUES,
  referenceFormValuesToRecordUpdate,
  type ReferenceFormValues,
} from '@/local-db/research/manuscript/manuscriptReferenceForm';
import { generateCitationKey } from '@/local-db/research/manuscript/manuscriptReferenceStore';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

import { ManuscriptReferenceEditor } from './ManuscriptReferenceEditor';

type ManuscriptManualReferenceFormProps = {
  manuscriptId: string;
  onCancel: () => void;
  onChanged: () => void;
  projectId?: string | null;
  references: ReferenceLike[];
};

export const ManuscriptManualReferenceForm = ({
  manuscriptId,
  onCancel,
  onChanged,
  projectId,
  references,
}: ManuscriptManualReferenceFormProps) => {
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'reference',
  });
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const createReference = async (values: ReferenceFormValues) => {
    const citationKey = generateCitationKey(
      {
        authors: values.authors,
        year: values.year.trim().length > 0 ? Number(values.year) : null,
      },
      new Set(
        references.flatMap((reference) => {
          const key = reference.citationKey?.trim();
          return key === undefined || key.length === 0 ? [] : [key];
        }),
      ),
    );
    try {
      await createOneRecord({
        ...referenceFormValuesToRecordUpdate(
          { ...values, citationKey },
          undefined,
        ),
        manuscriptId,
        ...(projectId ? { projectId } : {}),
      });
      onChanged();
      onCancel();
      enqueueSuccessSnackBar({
        message: `Added reference [@${citationKey}]`,
      });
    } catch {
      enqueueErrorSnackBar({ message: 'Could not add reference' });
      throw new Error('Could not add reference');
    }
  };

  return (
    <ManuscriptReferenceEditor
      initialValues={EMPTY_REFERENCE_FORM_VALUES}
      isCitationKeyGenerated
      onCancel={onCancel}
      onSave={createReference}
      saveTitle="Add reference"
    />
  );
};
