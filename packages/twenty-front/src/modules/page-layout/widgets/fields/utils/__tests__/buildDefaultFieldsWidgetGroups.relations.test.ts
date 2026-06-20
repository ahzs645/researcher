import { buildDefaultFieldsWidgetGroups } from '@/page-layout/widgets/fields/utils/buildDefaultFieldsWidgetGroups';

// The Fields widget hides RELATION fields by default. In bridge mode there is no
// parent-scoped relation tab widget, so relations must surface here instead —
// guard that RELATION is visible while MORPH_RELATION stays hidden.

const field = (
  id: string,
  name: string,
  type: string,
  isCustom: boolean,
) => ({
  id,
  name,
  label: name,
  type,
  isActive: true,
  isCustom,
  isSystem: false,
  isNullable: true,
});

describe('buildDefaultFieldsWidgetGroups relation visibility', () => {
  const groups = buildDefaultFieldsWidgetGroups({
    fields: [
      field('f1', 'name', 'TEXT', false),
      field('f2', 'project', 'RELATION', true),
      field('f3', 'someMorph', 'MORPH_RELATION', true),
    ] as never,
    labelIdentifierFieldMetadataItemId: 'f1',
  });

  const allFields = groups.flatMap((group) => group.fields);

  it('shows RELATION fields', () => {
    const relationField = allFields.find(
      (entry) => entry.fieldMetadataItem.id === 'f2',
    );
    expect(relationField).toBeDefined();
    expect(relationField?.isVisible).toBe(true);
  });

  it('keeps MORPH_RELATION fields hidden', () => {
    const morphField = allFields.find(
      (entry) => entry.fieldMetadataItem.id === 'f3',
    );
    if (morphField) {
      expect(morphField.isVisible).toBe(false);
    }
  });
});
