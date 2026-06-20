import { buildDefaultFieldsWidgetGroups } from '@/page-layout/widgets/fields/utils/buildDefaultFieldsWidgetGroups';

// Many-to-one relations surface inline (chips); one-to-many relations are shown
// as dedicated tabs (buildRecordPageRelationTabs) so they stay out of the
// Fields widget; morph relations stay hidden.

const field = (
  id: string,
  name: string,
  type: string,
  isCustom: boolean,
  relationType?: string,
) => ({
  id,
  name,
  label: name,
  type,
  isActive: true,
  isCustom,
  isSystem: false,
  isNullable: true,
  settings: relationType ? { relationType } : undefined,
});

describe('buildDefaultFieldsWidgetGroups relation visibility', () => {
  const groups = buildDefaultFieldsWidgetGroups({
    fields: [
      field('f1', 'name', 'TEXT', false),
      field('f2', 'team', 'RELATION', true, 'MANY_TO_ONE'),
      field('f3', 'grants', 'RELATION', true, 'ONE_TO_MANY'),
      field('f4', 'someMorph', 'MORPH_RELATION', true),
    ] as never,
    labelIdentifierFieldMetadataItemId: 'f1',
  });

  const allFields = groups.flatMap((group) => group.fields);
  const visibilityOf = (id: string) =>
    allFields.find((entry) => entry.fieldMetadataItem.id === id)?.isVisible;

  it('shows many-to-one relations inline', () => {
    expect(visibilityOf('f2')).toBe(true);
  });

  it('hides one-to-many relations (they are tabs)', () => {
    expect(visibilityOf('f3')).toBe(false);
  });

  it('keeps morph relations hidden', () => {
    expect(visibilityOf('f4')).toBe(false);
  });
});
