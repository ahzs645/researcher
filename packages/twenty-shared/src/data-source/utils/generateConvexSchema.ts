import { FieldMetadataType } from '../../types/FieldMetadataType';
import { RelationType } from '../../types/RelationType';
import { type DataSourceBundle } from '../types/DataSourceBundle';
import { type DataSourceField } from '../types/DataSourceField';
import { type DataSourceObject } from '../types/DataSourceObject';

// Emit a Convex `defineSchema({...})` source string from a DataSourceBundle.
// One Convex table per `nameSingular`. Field validators mirror the field
// metadata type; the canonical primary key is the application-level `id`
// (stored as a `v.string()` indexed via `by_id`).
//
// This generator only emits the *schema* file. Convex functions per object
// (findMany / createOne / …) are still hand-written for now, sharing the
// resolver logic from the executable schema.

const TYPE_TO_VALIDATOR: Record<string, string> = {
  [FieldMetadataType.TEXT]: 'v.optional(v.string())',
  [FieldMetadataType.UUID]: 'v.optional(v.string())',
  [FieldMetadataType.NUMBER]: 'v.optional(v.number())',
  [FieldMetadataType.NUMERIC]: 'v.optional(v.number())',
  [FieldMetadataType.BOOLEAN]: 'v.optional(v.boolean())',
  [FieldMetadataType.DATE]: 'v.optional(v.string())',
  [FieldMetadataType.DATE_TIME]: 'v.optional(v.string())',
  [FieldMetadataType.RATING]: 'v.optional(v.string())',
  [FieldMetadataType.POSITION]: 'v.optional(v.number())',
  [FieldMetadataType.RAW_JSON]: 'v.optional(v.any())',
  [FieldMetadataType.RICH_TEXT]: 'v.optional(v.any())',
  [FieldMetadataType.ARRAY]: 'v.optional(v.array(v.string()))',
  [FieldMetadataType.FILES]: 'v.optional(v.any())',
  [FieldMetadataType.TS_VECTOR]: 'v.optional(v.string())',
  [FieldMetadataType.ADDRESS]: 'v.optional(v.any())',
  [FieldMetadataType.FULL_NAME]: 'v.optional(v.any())',
  [FieldMetadataType.LINKS]: 'v.optional(v.any())',
  [FieldMetadataType.ACTOR]: 'v.optional(v.any())',
  [FieldMetadataType.EMAILS]: 'v.optional(v.any())',
  [FieldMetadataType.PHONES]: 'v.optional(v.any())',
  [FieldMetadataType.CURRENCY]: 'v.optional(v.any())',
  [FieldMetadataType.SELECT]: 'v.optional(v.string())',
  [FieldMetadataType.MULTI_SELECT]: 'v.optional(v.array(v.string()))',
};

const renderField = (field: DataSourceField): string | null => {
  if (!field.isActive) return null;
  if (field.type === FieldMetadataType.RELATION) {
    if (!field.relation) return null;
    if (field.relation.type === RelationType.MANY_TO_ONE) {
      return `    ${field.name}Id: v.optional(v.string())`;
    }
    return null;
  }
  if (field.type === FieldMetadataType.MORPH_RELATION) {
    return null;
  }
  const validator = TYPE_TO_VALIDATOR[field.type];
  if (!validator) return null;
  return `    ${field.name}: ${validator}`;
};

const renderIndexes = (object: DataSourceObject): string[] => {
  const indexes: string[] = [`.index('by_id', ['id'])`];
  const fieldNames = new Set<string>(['updatedAt', 'createdAt', 'deletedAt']);
  for (const field of object.fields) {
    if (!field.isActive) continue;
    if (field.type === FieldMetadataType.RELATION && field.relation) {
      if (field.relation.type === RelationType.MANY_TO_ONE) {
        const indexedColumn = `${field.name}Id`;
        indexes.push(`.index('by_${field.name}_id', ['${indexedColumn}'])`);
      }
    }
  }
  for (const fieldName of fieldNames) {
    indexes.push(`.index('by_${fieldName}', ['${fieldName}'])`);
  }
  return indexes;
};

const renderTable = (object: DataSourceObject): string => {
  const fieldLines = [
    `    id: v.string()`,
    ...object.fields
      .map(renderField)
      .filter((line): line is string => line !== null),
  ];
  // De-duplicate id field if it appears in metadata as well.
  const uniqueLines: string[] = [];
  const seen = new Set<string>();
  for (const line of fieldLines) {
    const fieldName = line.split(':')[0].trim();
    if (seen.has(fieldName)) continue;
    seen.add(fieldName);
    uniqueLines.push(line);
  }
  const indexes = renderIndexes(object).join('\n');
  return `  ${object.nameSingular}: defineTable({\n${uniqueLines.join(',\n')},\n  })\n    ${indexes}`;
};

export const generateConvexSchema = (bundle: DataSourceBundle): string => {
  const objects = bundle.objects.filter((object) => object.isActive);
  const tableBlocks = objects.map(renderTable).join(',\n');
  return `\
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Auto-generated from DataSourceBundle. Regenerate via the data-source
// schema script — see twenty-shared/data-source/utils/generateConvexSchema.

export default defineSchema({
${tableBlocks},
});
`;
};
