import { FieldMetadataType } from '../../types/FieldMetadataType';
import { RelationType } from '../../types/RelationType';
import { type DataSourceBundle } from '../types/DataSourceBundle';
import {
  type DataSourceField,
  type DataSourceFieldOption,
} from '../types/DataSourceField';
import { type DataSourceObject } from '../types/DataSourceObject';

const capitalize = (str: string) =>
  str.length === 0 ? str : str[0].toUpperCase() + str.slice(1);

const indent = (lines: string[], depth = 1) =>
  lines.map((line) => `${'  '.repeat(depth)}${line}`).join('\n');

// Shared scalars and global types — emitted once at the top of every schema.
const PRELUDE = `\
scalar UUID
scalar DateTime
scalar Date
scalar JSON
scalar BigInt

enum FilterIs {
  NULL
  NOT_NULL
}

enum OrderBy {
  AscNullsFirst
  AscNullsLast
  DescNullsFirst
  DescNullsLast
}

type PageInfo {
  hasNextPage: Boolean
  hasPreviousPage: Boolean
  startCursor: String
  endCursor: String
}

type IdResult {
  id: UUID!
}

input UUIDFilter {
  eq: UUID
  in: [UUID!]
  neq: UUID
  is: FilterIs
}

input StringFilter {
  eq: String
  in: [String!]
  neq: String
  startsWith: String
  like: String
  ilike: String
  regex: String
  iregex: String
  is: FilterIs
}

input FloatFilter {
  eq: Float
  gt: Float
  gte: Float
  in: [Float!]
  lt: Float
  lte: Float
  neq: Float
  is: FilterIs
}

input DateFilter {
  eq: Date
  gt: Date
  gte: Date
  in: [Date!]
  lt: Date
  lte: Date
  neq: Date
  is: FilterIs
}

input DateTimeFilter {
  eq: DateTime
  gt: DateTime
  gte: DateTime
  in: [DateTime!]
  lt: DateTime
  lte: DateTime
  neq: DateTime
  is: FilterIs
}

input BooleanFilter {
  eq: Boolean
  is: FilterIs
}

input SelectFilter {
  is: FilterIs
  in: [String!]
  eq: String
  neq: String
}

input MultiSelectFilter {
  is: FilterIs
  isEmptyArray: Boolean
  containsAny: [String!]
}

input ArrayFilter {
  is: FilterIs
  isEmptyArray: Boolean
  containsIlike: String
}

input RawJsonFilter {
  like: String
  is: FilterIs
}

input FilesFilter {
  like: String
  is: FilterIs
}

input RichTextLeafFilter {
  ilike: String
}

input RichTextFilter {
  blocknote: RichTextLeafFilter
  markdown: RichTextLeafFilter
}

input TSVectorFilter {
  search: String!
}

input RelationFilter {
  is: FilterIs
  in: [UUID!]
}

# Composite leaf filters
input AddressFilter {
  addressStreet1: StringFilter
  addressStreet2: StringFilter
  addressCity: StringFilter
  addressState: StringFilter
  addressCountry: StringFilter
  addressPostcode: StringFilter
}

input FullNameFilter {
  firstName: StringFilter
  lastName: StringFilter
}

input LinksFilter {
  primaryLinkUrl: StringFilter
  primaryLinkLabel: StringFilter
  secondaryLinks: RawJsonFilter
}

input ActorFilter {
  name: StringFilter
  source: SelectFilter
  workspaceMemberId: UUIDFilter
}

input EmailsFilter {
  primaryEmail: StringFilter
  additionalEmails: RawJsonFilter
}

input PhonesFilter {
  primaryPhoneNumber: StringFilter
  primaryPhoneCallingCode: StringFilter
  additionalPhones: RawJsonFilter
}

input CurrencyFilter {
  amountMicros: FloatFilter
  currencyCode: SelectFilter
}

# Composite output types — typenames match Twenty's wire format.
type Links {
  primaryLinkUrl: String
  primaryLinkLabel: String
  secondaryLinks: JSON
}

type FullName {
  firstName: String
  lastName: String
}

type Address {
  addressStreet1: String
  addressStreet2: String
  addressCity: String
  addressState: String
  addressCountry: String
  addressPostcode: String
  addressLat: Float
  addressLng: Float
}

type Actor {
  source: String
  workspaceMemberId: UUID
  name: String
  context: JSON
}

type Emails {
  primaryEmail: String
  additionalEmails: JSON
}

type Phones {
  primaryPhoneNumber: String
  primaryPhoneCallingCode: String
  additionalPhones: JSON
}

type Currency {
  amountMicros: Float
  currencyCode: String
}

type RichText {
  blocknote: String
  markdown: String
}

# Composite input types (used by Create/Update)
input AddressInput {
  addressStreet1: String
  addressStreet2: String
  addressCity: String
  addressState: String
  addressCountry: String
  addressPostcode: String
  addressLat: Float
  addressLng: Float
}

input FullNameInput {
  firstName: String
  lastName: String
}

input LinksInput {
  primaryLinkUrl: String
  primaryLinkLabel: String
  secondaryLinks: JSON
}

input ActorInput {
  source: String
  workspaceMemberId: UUID
  name: String
  context: JSON
}

input EmailsInput {
  primaryEmail: String
  additionalEmails: JSON
}

input PhonesInput {
  primaryPhoneNumber: String
  primaryPhoneCallingCode: String
  additionalPhones: JSON
}

input CurrencyInput {
  amountMicros: Float
  currencyCode: String
}

input RichTextInput {
  blocknote: String
  markdown: String
}

# Composite OrderBy
input AddressOrderBy {
  addressStreet1: OrderBy
  addressStreet2: OrderBy
  addressCity: OrderBy
  addressState: OrderBy
  addressCountry: OrderBy
  addressPostcode: OrderBy
  addressLat: OrderBy
  addressLng: OrderBy
}

input FullNameOrderBy {
  firstName: OrderBy
  lastName: OrderBy
}

input LinksOrderBy {
  primaryLinkUrl: OrderBy
  primaryLinkLabel: OrderBy
}

input ActorOrderBy {
  name: OrderBy
  source: OrderBy
  workspaceMemberId: OrderBy
}

input EmailsOrderBy {
  primaryEmail: OrderBy
}

input PhonesOrderBy {
  primaryPhoneNumber: OrderBy
  primaryPhoneCallingCode: OrderBy
}

input CurrencyOrderBy {
  amountMicros: OrderBy
  currencyCode: OrderBy
}

# Cross-object search
type SearchRecordDTO {
  recordId: UUID!
  objectNameSingular: String!
  objectLabelSingular: String!
  label: String!
  imageUrl: String
  tsRankCD: Float
  tsRank: Float
}

type SearchRecordEdge {
  node: SearchRecordDTO!
  cursor: String
}

type SearchRecordConnection {
  edges: [SearchRecordEdge!]!
  pageInfo: PageInfo!
}

input ObjectRecordFilterInput {
  and: [ObjectRecordFilterInput!]
  or: [ObjectRecordFilterInput!]
  not: ObjectRecordFilterInput
  id: UUIDFilter
  createdAt: DateTimeFilter
  updatedAt: DateTimeFilter
  deletedAt: DateTimeFilter
}
`;

const FIELD_TO_OUTPUT_TYPE: Partial<Record<FieldMetadataType, string>> = {
  [FieldMetadataType.TEXT]: 'String',
  [FieldMetadataType.UUID]: 'UUID',
  [FieldMetadataType.NUMBER]: 'Float',
  [FieldMetadataType.NUMERIC]: 'Float',
  [FieldMetadataType.BOOLEAN]: 'Boolean',
  [FieldMetadataType.DATE]: 'Date',
  [FieldMetadataType.DATE_TIME]: 'DateTime',
  [FieldMetadataType.RATING]: 'String',
  [FieldMetadataType.POSITION]: 'Float',
  [FieldMetadataType.RAW_JSON]: 'JSON',
  [FieldMetadataType.RICH_TEXT]: 'RichText',
  [FieldMetadataType.ARRAY]: '[String!]',
  [FieldMetadataType.FILES]: 'JSON',
  [FieldMetadataType.TS_VECTOR]: 'String',
  [FieldMetadataType.ADDRESS]: 'Address',
  [FieldMetadataType.FULL_NAME]: 'FullName',
  [FieldMetadataType.LINKS]: 'Links',
  [FieldMetadataType.ACTOR]: 'Actor',
  [FieldMetadataType.EMAILS]: 'Emails',
  [FieldMetadataType.PHONES]: 'Phones',
  [FieldMetadataType.CURRENCY]: 'Currency',
};

const FIELD_TO_INPUT_TYPE: Partial<Record<FieldMetadataType, string>> = {
  ...FIELD_TO_OUTPUT_TYPE,
  [FieldMetadataType.RICH_TEXT]: 'RichTextInput',
  [FieldMetadataType.ADDRESS]: 'AddressInput',
  [FieldMetadataType.FULL_NAME]: 'FullNameInput',
  [FieldMetadataType.LINKS]: 'LinksInput',
  [FieldMetadataType.ACTOR]: 'ActorInput',
  [FieldMetadataType.EMAILS]: 'EmailsInput',
  [FieldMetadataType.PHONES]: 'PhonesInput',
  [FieldMetadataType.CURRENCY]: 'CurrencyInput',
};

const FIELD_TO_FILTER_TYPE: Partial<Record<FieldMetadataType, string>> = {
  [FieldMetadataType.TEXT]: 'StringFilter',
  [FieldMetadataType.UUID]: 'UUIDFilter',
  [FieldMetadataType.NUMBER]: 'FloatFilter',
  [FieldMetadataType.NUMERIC]: 'FloatFilter',
  [FieldMetadataType.BOOLEAN]: 'BooleanFilter',
  [FieldMetadataType.DATE]: 'DateFilter',
  [FieldMetadataType.DATE_TIME]: 'DateTimeFilter',
  [FieldMetadataType.RATING]: 'StringFilter',
  [FieldMetadataType.POSITION]: 'FloatFilter',
  [FieldMetadataType.RAW_JSON]: 'RawJsonFilter',
  [FieldMetadataType.RICH_TEXT]: 'RichTextFilter',
  [FieldMetadataType.ARRAY]: 'ArrayFilter',
  [FieldMetadataType.FILES]: 'FilesFilter',
  [FieldMetadataType.TS_VECTOR]: 'TSVectorFilter',
  [FieldMetadataType.ADDRESS]: 'AddressFilter',
  [FieldMetadataType.FULL_NAME]: 'FullNameFilter',
  [FieldMetadataType.LINKS]: 'LinksFilter',
  [FieldMetadataType.ACTOR]: 'ActorFilter',
  [FieldMetadataType.EMAILS]: 'EmailsFilter',
  [FieldMetadataType.PHONES]: 'PhonesFilter',
  [FieldMetadataType.CURRENCY]: 'CurrencyFilter',
};

const FIELD_TO_COMPOSITE_ORDER_BY: Partial<Record<FieldMetadataType, string>> =
  {
    [FieldMetadataType.ADDRESS]: 'AddressOrderBy',
    [FieldMetadataType.FULL_NAME]: 'FullNameOrderBy',
    [FieldMetadataType.LINKS]: 'LinksOrderBy',
    [FieldMetadataType.ACTOR]: 'ActorOrderBy',
    [FieldMetadataType.EMAILS]: 'EmailsOrderBy',
    [FieldMetadataType.PHONES]: 'PhonesOrderBy',
    [FieldMetadataType.CURRENCY]: 'CurrencyOrderBy',
  };

const joinColumnName = (field: DataSourceField) => `${field.name}Id`;

// Morph relations expose one join column per target (e.g. `targetCompanyId`,
// `targetPersonId`) named `<fieldName><CapitalizedTargetObjectName>Id`. This
// mirrors how Twenty's real backend explodes morph relations in GraphQL.
const morphJoinColumnNames = (field: DataSourceField): string[] => {
  if (field.type !== FieldMetadataType.MORPH_RELATION) return [];
  return (field.morphRelations ?? []).map(
    (relation) =>
      `${field.name}${capitalize(relation.targetObjectNameSingular)}Id`,
  );
};

const enumName = (object: DataSourceObject, field: DataSourceField) =>
  `${capitalize(object.nameSingular)}${capitalize(field.name)}Enum`;

const isSelectField = (field: DataSourceField) =>
  field.type === FieldMetadataType.SELECT ||
  field.type === FieldMetadataType.MULTI_SELECT;

const isCompositeField = (field: DataSourceField) =>
  field.type in FIELD_TO_COMPOSITE_ORDER_BY;

const isHiddenSystemField = (field: DataSourceField): boolean => {
  if (field.isSystem !== true) return false;
  // Match Twenty's `isHiddenSystemField` — `id`/`createdAt`/`updatedAt`/
  // `deletedAt`/`position` are system but still queryable for aggregates.
  const queryableSystemFields = new Set([
    'id',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'position',
  ]);
  return !queryableSystemFields.has(field.name);
};

// Mirrors `getAvailableAggregationsFromObjectFields` on the frontend: per-field
// aggregate names emitted onto each Connection type so Apollo's normalized
// cache can read them. Twenty's real backend exposes the same set, so the
// SchemaLink schema needs to match 1:1.
//
// Returns a Map keyed by aggregate field name (e.g. `maxEmployees`) with the
// GraphQL type (e.g. `Float`) as value, so both SDL emission and resolver
// registration can iterate over the same shape.
export const getAggregateFieldsForObject = (
  object: DataSourceObject,
): Map<string, string> => {
  const aggregateFields = new Map<string, string>();
  aggregateFields.set('totalCount', 'Int!');

  for (const field of object.fields) {
    if (!field.isActive) continue;
    if (isHiddenSystemField(field)) continue;
    if (field.type === FieldMetadataType.MORPH_RELATION) continue;
    if (field.type === FieldMetadataType.RELATION) continue;

    const capitalizedName = capitalize(field.name);
    aggregateFields.set(`countUniqueValues${capitalizedName}`, 'Float');
    aggregateFields.set(`countEmpty${capitalizedName}`, 'Float');
    aggregateFields.set(`countNotEmpty${capitalizedName}`, 'Float');
    aggregateFields.set(`percentageEmpty${capitalizedName}`, 'Float');
    aggregateFields.set(`percentageNotEmpty${capitalizedName}`, 'Float');

    if (field.type === FieldMetadataType.NUMBER) {
      aggregateFields.set(`min${capitalizedName}`, 'Float');
      aggregateFields.set(`max${capitalizedName}`, 'Float');
      aggregateFields.set(`avg${capitalizedName}`, 'Float');
      aggregateFields.set(`sum${capitalizedName}`, 'Float');
    }

    if (field.type === FieldMetadataType.CURRENCY) {
      aggregateFields.set(`min${capitalizedName}AmountMicros`, 'Float');
      aggregateFields.set(`max${capitalizedName}AmountMicros`, 'Float');
      aggregateFields.set(`avg${capitalizedName}AmountMicros`, 'Float');
      aggregateFields.set(`sum${capitalizedName}AmountMicros`, 'Float');
    }

    if (field.type === FieldMetadataType.BOOLEAN) {
      aggregateFields.set(`countTrue${capitalizedName}`, 'Float');
      aggregateFields.set(`countFalse${capitalizedName}`, 'Float');
    }

    if (
      field.type === FieldMetadataType.DATE ||
      field.type === FieldMetadataType.DATE_TIME
    ) {
      aggregateFields.set(`min${capitalizedName}`, 'DateTime');
      aggregateFields.set(`max${capitalizedName}`, 'DateTime');
    }
  }

  return aggregateFields;
};

const renderAggregateFields = (object: DataSourceObject): string[] =>
  [...getAggregateFieldsForObject(object).entries()].map(
    ([name, type]) => `${name}: ${type}`,
  );

const renderEnumValues = (options: DataSourceFieldOption[]) =>
  options
    .map((option) => option.value)
    .filter((value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    .join('\n  ');

const renderObjectOutput = (object: DataSourceObject): string => {
  const typeName = capitalize(object.nameSingular);
  const fields: string[] = [];

  const sortedFields = [...object.fields]
    .filter((field) => field.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const field of sortedFields) {
    if (field.type === FieldMetadataType.RELATION) {
      if (!field.relation) continue;
      const target = capitalize(field.relation.targetObjectNameSingular);
      if (field.relation.type === RelationType.MANY_TO_ONE) {
        fields.push(`${field.name}: ${target}`);
        fields.push(`${joinColumnName(field)}: UUID`);
      } else {
        fields.push(`${field.name}: ${target}Connection!`);
      }
      continue;
    }
    if (field.type === FieldMetadataType.MORPH_RELATION) {
      // Per-target join columns (e.g. `targetCompanyId: UUID`). The
      // `targetCompany` object itself is also fetched per target, with the
      // target type matching each morphRelation's targetObjectMetadata.
      for (const relation of field.morphRelations ?? []) {
        const target = capitalize(relation.targetObjectNameSingular);
        fields.push(
          `${field.name}${target}: ${target}`,
          `${field.name}${target}Id: UUID`,
        );
      }
      continue;
    }

    let scalarType: string;
    if (isSelectField(field)) {
      const eName = enumName(object, field);
      scalarType =
        field.type === FieldMetadataType.MULTI_SELECT ? `[${eName}!]` : eName;
    } else {
      const renderer = FIELD_TO_OUTPUT_TYPE[field.type];
      if (!renderer) continue;
      scalarType = renderer;
    }
    const nullable = field.isNullable === false ? '!' : '';
    fields.push(`${field.name}: ${scalarType}${nullable}`);
  }

  const aggregateFields = renderAggregateFields(object);
  const connectionFields = [
    `edges: [${typeName}Edge!]!`,
    `pageInfo: PageInfo!`,
    ...aggregateFields,
  ];

  return `type ${typeName} {\n${indent(fields)}\n}\n\ntype ${typeName}Edge {\n  node: ${typeName}!\n  cursor: String\n}\n\ntype ${typeName}Connection {\n${indent(connectionFields)}\n}`;
};

const renderFilterInput = (object: DataSourceObject): string => {
  const typeName = capitalize(object.nameSingular);
  const fields: string[] = [
    `and: [${typeName}FilterInput!]`,
    `or: [${typeName}FilterInput!]`,
    `not: ${typeName}FilterInput`,
  ];

  for (const field of object.fields) {
    if (!field.isActive) continue;
    if (field.type === FieldMetadataType.RELATION) {
      if (!field.relation) continue;
      if (field.relation.type === RelationType.MANY_TO_ONE) {
        // Join columns accept full UUID filters (`eq`, `in`, `neq`, `is`) on
        // Twenty's real backend. RelationFilter is intentionally narrower for
        // first-class relation fields, but the join column is a plain UUID.
        fields.push(`${joinColumnName(field)}: UUIDFilter`);
      }
      continue;
    }
    if (field.type === FieldMetadataType.MORPH_RELATION) {
      for (const joinColumn of morphJoinColumnNames(field)) {
        fields.push(`${joinColumn}: UUIDFilter`);
      }
      continue;
    }
    if (isSelectField(field)) {
      fields.push(
        `${field.name}: ${
          field.type === FieldMetadataType.MULTI_SELECT
            ? 'MultiSelectFilter'
            : 'SelectFilter'
        }`,
      );
      continue;
    }
    const filterType = FIELD_TO_FILTER_TYPE[field.type];
    if (!filterType) continue;
    fields.push(`${field.name}: ${filterType}`);
  }

  return `input ${typeName}FilterInput {\n${indent(fields)}\n}`;
};

const renderOrderByInput = (object: DataSourceObject): string => {
  const typeName = capitalize(object.nameSingular);
  const fields: string[] = [];

  for (const field of object.fields) {
    if (!field.isActive) continue;
    if (field.type === FieldMetadataType.RELATION) {
      if (!field.relation) continue;
      if (field.relation.type === RelationType.MANY_TO_ONE) {
        fields.push(`${joinColumnName(field)}: OrderBy`);
      }
      continue;
    }
    if (field.type === FieldMetadataType.MORPH_RELATION) {
      for (const joinColumn of morphJoinColumnNames(field)) {
        fields.push(`${joinColumn}: OrderBy`);
      }
      continue;
    }
    if (isCompositeField(field)) {
      const composite = FIELD_TO_COMPOSITE_ORDER_BY[field.type];
      if (!composite) continue;
      fields.push(`${field.name}: ${composite}`);
      continue;
    }
    fields.push(`${field.name}: OrderBy`);
  }

  return `input ${typeName}OrderByInput {\n${indent(fields)}\n}`;
};

const renderInput = (
  object: DataSourceObject,
  variant: 'create' | 'update',
): string => {
  const typeName = capitalize(object.nameSingular);
  const fields: string[] = [];

  for (const field of object.fields) {
    if (!field.isActive) continue;
    if (field.isSystem && field.name !== 'id') continue;
    if (field.type === FieldMetadataType.RELATION) {
      if (!field.relation) continue;
      if (field.relation.type === RelationType.MANY_TO_ONE) {
        fields.push(`${joinColumnName(field)}: UUID`);
      }
      continue;
    }
    if (field.type === FieldMetadataType.MORPH_RELATION) {
      for (const joinColumn of morphJoinColumnNames(field)) {
        fields.push(`${joinColumn}: UUID`);
      }
      continue;
    }
    if (isSelectField(field)) {
      const eName = enumName(object, field);
      fields.push(
        `${field.name}: ${
          field.type === FieldMetadataType.MULTI_SELECT ? `[${eName}!]` : eName
        }`,
      );
      continue;
    }
    const scalarType = FIELD_TO_INPUT_TYPE[field.type];
    if (!scalarType) continue;
    // Both create and update inputs leave every field optional. Twenty's
    // frontend only sends the fields the user actually edits, and adapters
    // fill defaults for the rest at storage time.
    fields.push(`${field.name}: ${scalarType}`);
  }

  const suffix = variant === 'create' ? 'CreateInput' : 'UpdateInput';
  return `input ${typeName}${suffix} {\n${indent(fields)}\n}`;
};

const renderEnumsForObject = (object: DataSourceObject): string => {
  const parts: string[] = [];
  for (const field of object.fields) {
    if (!isSelectField(field) || !field.options || field.options.length === 0)
      continue;
    const eName = enumName(object, field);
    const values = renderEnumValues(field.options);
    if (values.length === 0) continue;
    parts.push(`enum ${eName} {\n  ${values}\n}`);
  }
  return parts.join('\n\n');
};

const renderQueriesAndMutations = (objects: DataSourceObject[]): string => {
  const queries: string[] = [];
  const mutations: string[] = [];

  for (const object of objects) {
    const singular = capitalize(object.nameSingular);
    const single = object.nameSingular;
    const plural = object.namePlural;
    queries.push(
      `${single}(filter: ${singular}FilterInput): ${singular}`,
      `${plural}(filter: ${singular}FilterInput, orderBy: [${singular}OrderByInput!], first: Int, after: String, last: Int, before: String, offset: Int): ${singular}Connection!`,
      `${single}Duplicates(ids: [UUID!]!): ${singular}Connection!`,
    );
    mutations.push(
      `create${singular}(data: ${singular}CreateInput!): ${singular}!`,
      `update${singular}(id: UUID!, data: ${singular}UpdateInput!): ${singular}!`,
      `delete${singular}(id: UUID!): ${singular}!`,
      `destroy${singular}(id: UUID!): IdResult!`,
      `restore${capitalize(plural)}(filter: ${singular}FilterInput!): [IdResult!]!`,
    );
  }
  queries.push(
    `search(searchInput: String!, limit: Int!, after: String, excludedObjectNameSingulars: [String!], includedObjectNameSingulars: [String!], filter: ObjectRecordFilterInput): SearchRecordConnection!`,
  );

  return [
    `type Query {\n${indent(queries)}\n}`,
    `type Mutation {\n${indent(mutations)}\n}`,
  ].join('\n\n');
};

export const generateSdl = (bundle: DataSourceBundle): string => {
  const objects = bundle.objects.filter((object) => object.isActive);
  const enumBlocks = objects.map(renderEnumsForObject).filter(Boolean);
  const objectBlocks = objects.map((object) =>
    [
      renderObjectOutput(object),
      renderFilterInput(object),
      renderOrderByInput(object),
      renderInput(object, 'create'),
      renderInput(object, 'update'),
    ].join('\n\n'),
  );

  return [
    PRELUDE,
    enumBlocks.join('\n\n'),
    objectBlocks.join('\n\n'),
    renderQueriesAndMutations(objects),
  ]
    .filter(Boolean)
    .join('\n\n');
};
