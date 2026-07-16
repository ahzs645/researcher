import { type FieldMetadataType } from '../../types/FieldMetadataType';
import { type RelationType } from '../../types/RelationType';
import {
  type DataSourceField,
  type DataSourceFieldOption,
  type DataSourceFieldRelation,
} from '../types/DataSourceField';
import { type DataSourceBundle } from '../types/DataSourceBundle';
import { type DataSourceObject } from '../types/DataSourceObject';

// Raw input shape matching `ObjectMetadataItemsQuery` from `~/generated-metadata/graphql`.
// Defined here as a structural type so this builder doesn't drag in
// twenty-front's codegen.
type RawFieldRelation = {
  type: RelationType | string;
  targetObjectMetadata: {
    id: string;
    nameSingular: string;
    namePlural: string;
  };
  targetFieldMetadata: { name: string };
};

type RawField = {
  id: string;
  type: FieldMetadataType | string;
  name: string;
  label: string;
  description?: string | null;
  isCustom?: boolean | null;
  isActive?: boolean | null;
  isSystem?: boolean | null;
  isUIReadOnly?: boolean | null;
  isNullable?: boolean | null;
  isUnique?: boolean | null;
  defaultValue?: unknown;
  options?: unknown;
  settings?: unknown;
  relation?: RawFieldRelation | null;
  morphRelations?: RawFieldRelation[] | null;
};

type RawObject = {
  id: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description?: string | null;
  icon?: string | null;
  isCustom: boolean;
  isActive: boolean;
  isSystem: boolean;
  isSearchable: boolean;
  labelIdentifierFieldMetadataId?: string | null;
  imageIdentifierFieldMetadataId?: string | null;
  duplicateCriteria?: string[][] | null;
  fieldsList: RawField[];
};

type RawObjectMetadataItemsQuery = {
  objects: {
    edges: Array<{ node: RawObject }>;
  };
};

const normalizeOptions = (
  rawOptions: unknown,
): DataSourceFieldOption[] | null => {
  if (!Array.isArray(rawOptions)) {
    return null;
  }

  return rawOptions.flatMap((option) => {
    if (typeof option !== 'object' || option === null) {
      return [];
    }
    const candidate = option as Record<string, unknown>;
    const value = typeof candidate.value === 'string' ? candidate.value : null;
    const label = typeof candidate.label === 'string' ? candidate.label : null;
    if (value === null || label === null) {
      return [];
    }
    return [
      {
        value,
        label,
        position:
          typeof candidate.position === 'number'
            ? candidate.position
            : undefined,
        color:
          typeof candidate.color === 'string' ? candidate.color : undefined,
      },
    ];
  });
};

const toRelation = (raw: RawFieldRelation): DataSourceFieldRelation => ({
  type: raw.type as RelationType,
  targetObjectId: raw.targetObjectMetadata.id,
  targetObjectNameSingular: raw.targetObjectMetadata.nameSingular,
  targetObjectNamePlural: raw.targetObjectMetadata.namePlural,
  targetFieldName: raw.targetFieldMetadata.name,
});

const toField = (raw: RawField): DataSourceField => ({
  id: raw.id,
  name: raw.name,
  label: raw.label,
  description: raw.description ?? null,
  type: raw.type as FieldMetadataType,
  isActive: raw.isActive ?? false,
  isSystem: raw.isSystem ?? false,
  isNullable: raw.isNullable ?? true,
  isUnique: raw.isUnique ?? false,
  isUIReadOnly: raw.isUIReadOnly ?? false,
  isCustom: raw.isCustom ?? false,
  defaultValue: raw.defaultValue ?? undefined,
  options: normalizeOptions(raw.options),
  settings:
    raw.settings && typeof raw.settings === 'object'
      ? (raw.settings as Record<string, unknown>)
      : null,
  relation: raw.relation ? toRelation(raw.relation) : null,
  morphRelations: raw.morphRelations
    ? raw.morphRelations.map(toRelation)
    : null,
});

const findFieldNameById = (
  raw: RawObject,
  fieldId: string | null | undefined,
): string | null => {
  if (!fieldId) return null;
  const field = raw.fieldsList.find((f) => f.id === fieldId);
  return field?.name ?? null;
};

const toObject = (raw: RawObject): DataSourceObject => ({
  id: raw.id,
  nameSingular: raw.nameSingular,
  namePlural: raw.namePlural,
  labelSingular: raw.labelSingular,
  labelPlural: raw.labelPlural,
  description: raw.description ?? null,
  icon: raw.icon ?? null,
  isCustom: raw.isCustom,
  isActive: raw.isActive,
  isSystem: raw.isSystem,
  isSearchable: raw.isSearchable,
  labelIdentifierFieldName: findFieldNameById(
    raw,
    raw.labelIdentifierFieldMetadataId,
  ),
  imageIdentifierFieldName: findFieldNameById(
    raw,
    raw.imageIdentifierFieldMetadataId,
  ),
  duplicateCriteria: raw.duplicateCriteria ?? null,
  fields: raw.fieldsList.map(toField),
});

export const buildDataSourceBundle = (
  raw: RawObjectMetadataItemsQuery,
): DataSourceBundle => {
  const objects = raw.objects.edges.map(({ node }) => toObject(node));
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const objectsByNameSingular = new Map(
    objects.map((object) => [object.nameSingular, object]),
  );
  const objectsByNamePlural = new Map(
    objects.map((object) => [object.namePlural, object]),
  );

  return {
    objects,
    objectsById,
    objectsByNameSingular,
    objectsByNamePlural,
  };
};
