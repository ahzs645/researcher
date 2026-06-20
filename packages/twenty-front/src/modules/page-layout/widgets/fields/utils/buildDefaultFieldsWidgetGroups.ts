import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type FieldsWidgetGroup } from '@/page-layout/widgets/fields/types/FieldsWidgetGroup';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import { isFieldMetadataEligibleForFieldsWidget } from 'twenty-shared/utils';
import { v4 as uuidv4 } from 'uuid';

export const buildDefaultFieldsWidgetGroups = ({
  fields,
  labelIdentifierFieldMetadataItemId,
}: {
  fields: FieldMetadataItem[];
  labelIdentifierFieldMetadataItemId: string | undefined;
}): FieldsWidgetGroup[] => {
  const eligibleFields = fields.filter(
    (field) =>
      field.isActive &&
      isFieldMetadataEligibleForFieldsWidget({
        fieldName: field.name,
        fieldType: field.type,
        isLabelIdentifierField: field.id === labelIdentifierFieldMetadataItemId,
      }),
  );

  const standardFields = eligibleFields.filter((field) => !field.isCustom);
  const customFields = eligibleFields.filter((field) => field.isCustom);

  // Surface many-to-one RELATION fields inline (lead/team/project chips).
  // One-to-many relations get their own tabs on the record page
  // (buildRecordPageRelationTabs), so keep them out of the Fields widget.
  // Morph relations stay hidden (no inline display).
  const isFieldVisible = (field: FieldMetadataItem) => {
    if (field.type === FieldMetadataType.MORPH_RELATION) return false;
    if (
      field.type === FieldMetadataType.RELATION &&
      field.settings?.relationType === RelationType.ONE_TO_MANY
    ) {
      return false;
    }
    return true;
  };

  const groups: FieldsWidgetGroup[] = [];
  let globalIndex = 0;

  if (standardFields.length > 0) {
    groups.push({
      id: uuidv4(),
      name: 'General',
      position: 0,
      isVisible: true,
      fields: standardFields.map((field, index) => ({
        fieldMetadataItem: field,
        position: index,
        isVisible: isFieldVisible(field),
        globalIndex: globalIndex++,
      })),
    });
  }

  if (customFields.length > 0) {
    groups.push({
      id: uuidv4(),
      name: 'Other',
      position: 1,
      isVisible: true,
      fields: customFields.map((field, index) => ({
        fieldMetadataItem: field,
        position: index,
        isVisible: isFieldVisible(field),
        globalIndex: globalIndex++,
      })),
    });
  }

  return groups;
};
