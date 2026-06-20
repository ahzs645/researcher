import {
  RESEARCH_OBJECT_SPECS,
  type ResearchFieldSpec,
  type ResearchNavSection,
  type ResearchObjectSpec,
  type ResearchOptionColor,
} from './researchObjectModel';
import { RESEARCH_RELATIONS } from './researchRelations';

const SPEC_BY_NAME = new Map(
  RESEARCH_OBJECT_SPECS.map((spec) => [spec.nameSingular, spec]),
);

const namePluralOf = (nameSingular: string): string =>
  SPEC_BY_NAME.get(nameSingular)?.namePlural ?? `${nameSingular}s`;

// Expands the compact research object specs into the verbose shapes the bridge
// consumes: full `ObjectMetadataItemsQuery` nodes, default TABLE views, and
// navigation menu items. All ids are deterministic so a rebuild keeps stable
// references (views point at field ids, nav items point at object ids).

const CORE_APPLICATION_ID = 'dd6a5463-023d-4a10-855f-a4abaf32c1ec';
const SEED_TIMESTAMP = '2026-04-10T08:55:57.800Z';

// Deterministic, dependency-free UUID-v4-shaped id derived from a seed string.
// Four FNV-1a passes fill 128 bits; version/variant nibbles are pinned so the
// output matches Twenty's UUID regex everywhere ids are validated.
const fnv1a = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const toHex8 = (value: number): string => value.toString(16).padStart(8, '0');

export const researchDeterministicUuid = (seed: string): string => {
  const raw =
    toHex8(fnv1a(`0:${seed}`)) +
    toHex8(fnv1a(`1:${seed}`)) +
    toHex8(fnv1a(`2:${seed}`)) +
    toHex8(fnv1a(`3:${seed}`));
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    `4${raw.slice(13, 16)}`,
    `8${raw.slice(17, 20)}`,
    raw.slice(20, 32),
  ].join('-');
};

const objectId = (spec: ResearchObjectSpec) =>
  researchDeterministicUuid(`research:object:${spec.nameSingular}`);

const fieldId = (objectNameSingular: string, fieldName: string) =>
  researchDeterministicUuid(
    `research:field:${objectNameSingular}:${fieldName}`,
  );

const universalId = (kind: string, name: string) =>
  researchDeterministicUuid(`research:universal:${kind}:${name}`);

type MetadataFieldNode = Record<string, unknown>;

const buildBaseFields = (spec: ResearchObjectSpec): MetadataFieldNode[] => {
  const make = (
    name: string,
    overrides: Partial<MetadataFieldNode> & { type: string; label: string },
  ): MetadataFieldNode => ({
    __typename: 'Field',
    id: fieldId(spec.nameSingular, name),
    universalIdentifier: universalId(`${spec.nameSingular}:field`, name),
    name,
    description: overrides.label,
    icon: 'IconAbc',
    isCustom: false,
    isActive: true,
    isSystem: true,
    isUIReadOnly: true,
    isNullable: false,
    isUnique: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    defaultValue: null,
    options: null,
    settings: null,
    isLabelSyncedWithName: false,
    morphId: null,
    applicationId: CORE_APPLICATION_ID,
    relation: null,
    morphRelations: null,
    ...overrides,
  });

  return [
    // Label identifier — the only non-system base field, named `name` so the
    // standard searchVector expression on "name" stays valid.
    make('name', {
      type: 'TEXT',
      label: spec.nameFieldLabel,
      description: spec.nameFieldLabel,
      icon: spec.nameFieldIcon,
      isSystem: false,
      isUIReadOnly: false,
      isNullable: true,
    }),
    make('id', {
      type: 'UUID',
      label: 'Id',
      description: 'Id',
      icon: 'Icon123',
      isUnique: true,
      defaultValue: 'uuid',
    }),
    make('createdAt', {
      type: 'DATE_TIME',
      label: 'Creation date',
      description: 'Creation date',
      icon: 'IconCalendar',
      defaultValue: 'now',
    }),
    make('createdBy', {
      type: 'ACTOR',
      label: 'Created by',
      description: 'The creator of the record',
      icon: 'IconCreativeCommonsSa',
      defaultValue: { name: "''", source: "'MANUAL'" },
    }),
    make('deletedAt', {
      type: 'DATE_TIME',
      label: 'Deleted at',
      description: 'Deletion date',
      icon: 'IconCalendarClock',
      isNullable: true,
    }),
    make('position', {
      type: 'POSITION',
      label: 'Position',
      description: 'Position',
      icon: 'IconHierarchy2',
      defaultValue: 0,
    }),
    make('searchVector', {
      type: 'TS_VECTOR',
      label: 'Search vector',
      description: 'Search vector',
      icon: 'IconSearch',
      isNullable: true,
      settings: {
        asExpression:
          "to_tsvector('simple', COALESCE(public.unaccent_immutable(\"name\"), ''))",
        generatedType: 'STORED',
      },
    }),
    make('updatedAt', {
      type: 'DATE_TIME',
      label: 'Last update',
      description: 'Last time the record was changed',
      icon: 'IconCalendarClock',
      defaultValue: 'now',
    }),
    make('updatedBy', {
      type: 'ACTOR',
      label: 'Updated by',
      description: 'The workspace member who last updated the record',
      icon: 'IconUserCircle',
      defaultValue: { name: "''", source: "'MANUAL'" },
    }),
  ];
};

const buildBusinessField = (
  spec: ResearchObjectSpec,
  field: ResearchFieldSpec,
): MetadataFieldNode => {
  const options =
    field.options?.map((option, position) => ({
      id: researchDeterministicUuid(
        `research:option:${spec.nameSingular}:${field.name}:${option.value}`,
      ),
      color: option.color,
      label: option.label,
      value: option.value,
      position,
    })) ?? null;

  return {
    __typename: 'Field',
    id: fieldId(spec.nameSingular, field.name),
    universalIdentifier: universalId(`${spec.nameSingular}:field`, field.name),
    type: field.type,
    name: field.name,
    label: field.label,
    description: field.description ?? field.label,
    icon: field.icon ?? 'IconAbc',
    isCustom: true,
    isActive: true,
    isSystem: false,
    isUIReadOnly: field.readOnly ?? false,
    isNullable: true,
    isUnique: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    defaultValue: null,
    options,
    settings: null,
    isLabelSyncedWithName: false,
    morphId: null,
    applicationId: CORE_APPLICATION_ID,
    relation: null,
    morphRelations: null,
  };
};

type RelationFieldArgs = {
  thisObject: string;
  fieldName: string;
  label: string;
  icon: string;
  relationType: 'MANY_TO_ONE' | 'ONE_TO_MANY';
  targetObject: string;
  inverseFieldName: string;
};

const buildRelationFieldNode = ({
  thisObject,
  fieldName,
  label,
  icon,
  relationType,
  targetObject,
  inverseFieldName,
}: RelationFieldArgs): MetadataFieldNode => ({
  __typename: 'Field',
  id: fieldId(thisObject, fieldName),
  universalIdentifier: universalId(`${thisObject}:field`, fieldName),
  type: 'RELATION',
  name: fieldName,
  label,
  description: label,
  icon,
  isCustom: true,
  isActive: true,
  isSystem: false,
  isUIReadOnly: false,
  isNullable: true,
  isUnique: false,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
  defaultValue: null,
  options: null,
  settings: { relationType },
  isLabelSyncedWithName: false,
  morphId: null,
  applicationId: CORE_APPLICATION_ID,
  relation: {
    __typename: 'Relation',
    type: relationType,
    sourceObjectMetadata: {
      __typename: 'Object',
      id: getResearchObjectId(thisObject),
      nameSingular: thisObject,
      namePlural: namePluralOf(thisObject),
    },
    targetObjectMetadata: {
      __typename: 'Object',
      id: getResearchObjectId(targetObject),
      nameSingular: targetObject,
      namePlural: namePluralOf(targetObject),
    },
    sourceFieldMetadata: {
      __typename: 'Field',
      id: fieldId(thisObject, fieldName),
      name: fieldName,
    },
    targetFieldMetadata: {
      __typename: 'Field',
      id: fieldId(targetObject, inverseFieldName),
      name: inverseFieldName,
    },
  },
  morphRelations: null,
});

// Paired relation fields for one object: a MANY_TO_ONE where it is the child,
// and a ONE_TO_MANY where it is the parent.
const buildRelationFields = (nameSingular: string): MetadataFieldNode[] => {
  const fields: MetadataFieldNode[] = [];
  for (const relation of RESEARCH_RELATIONS) {
    if (relation.many === nameSingular) {
      fields.push(
        buildRelationFieldNode({
          thisObject: relation.many,
          fieldName: relation.manyField,
          label: relation.manyFieldLabel,
          icon: relation.manyFieldIcon,
          relationType: 'MANY_TO_ONE',
          targetObject: relation.one,
          inverseFieldName: relation.oneField,
        }),
      );
    }
    if (relation.one === nameSingular) {
      fields.push(
        buildRelationFieldNode({
          thisObject: relation.one,
          fieldName: relation.oneField,
          label: relation.oneFieldLabel,
          icon: relation.oneFieldIcon,
          relationType: 'ONE_TO_MANY',
          targetObject: relation.many,
          inverseFieldName: relation.manyField,
        }),
      );
    }
  }
  return fields;
};

const buildObjectNode = (spec: ResearchObjectSpec) => {
  const fieldsList = [
    ...buildBaseFields(spec),
    ...spec.fields.map((field) => buildBusinessField(spec, field)),
    ...buildRelationFields(spec.nameSingular),
  ];

  return {
    __typename: 'Object',
    id: objectId(spec),
    universalIdentifier: universalId('object', spec.nameSingular),
    nameSingular: spec.nameSingular,
    namePlural: spec.namePlural,
    isCustom: true,
    isRemote: false,
    isActive: true,
    isSystem: false,
    isUIReadOnly: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    labelIdentifierFieldMetadataId: fieldId(spec.nameSingular, 'name'),
    imageIdentifierFieldMetadataId: null,
    applicationId: CORE_APPLICATION_ID,
    shortcut: null,
    isLabelSyncedWithName: false,
    isSearchable: true,
    duplicateCriteria: null,
    labelSingular: spec.labelSingular,
    labelPlural: spec.labelPlural,
    description: spec.description,
    icon: spec.icon,
    indexMetadataList: [],
    fieldsList,
  };
};

export const buildResearchObjectEdges = () =>
  RESEARCH_OBJECT_SPECS.map((spec) => ({
    __typename: 'ObjectEdge',
    node: buildObjectNode(spec),
  }));

const viewId = (spec: ResearchObjectSpec) =>
  researchDeterministicUuid(`research:view:${spec.nameSingular}`);

const buildView = (spec: ResearchObjectSpec, position: number) => {
  const columnNames = ['name', ...spec.defaultColumns];
  const viewFields = columnNames.map((columnName, index) => ({
    id: researchDeterministicUuid(
      `research:viewField:${spec.nameSingular}:${columnName}`,
    ),
    fieldMetadataId: fieldId(spec.nameSingular, columnName),
    viewId: viewId(spec),
    isVisible: true,
    isActive: true,
    position: index,
    size: index === 0 ? 220 : 150,
    aggregateOperation: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    deletedAt: null,
  }));

  return {
    id: viewId(spec),
    objectMetadataId: objectId(spec),
    type: 'TABLE',
    key: 'INDEX',
    icon: spec.icon,
    position,
    isCompact: false,
    openRecordIn: 'SIDE_PANEL',
    kanbanAggregateOperation: null,
    kanbanAggregateOperationFieldMetadataId: null,
    mainGroupByFieldMetadataId: null,
    shouldHideEmptyGroups: false,
    anyFieldFilterValue: null,
    calendarFieldMetadataId: null,
    calendarLayout: null,
    visibility: 'WORKSPACE',
    createdByUserWorkspaceId: null,
    name: `All ${spec.labelPlural}`,
    viewFields,
    viewFilters: [],
    viewSorts: [],
    viewGroups: [],
    viewFilterGroups: [],
    viewFieldGroups: [],
  };
};

export const buildResearchViews = () =>
  RESEARCH_OBJECT_SPECS.map((spec, index) => buildView(spec, 1000 + index));

// Research objects are grouped into four collapsible nav folders that frame the
// workspace around how a lab actually works: who's in the lab (Lab), the
// research and its outputs (Work), the money (Funding), and where new funding is
// found (Discovery). Folders sort to the top of the drawer (positions 0–3).
type ResearchNavFolderConfig = {
  key: ResearchNavSection;
  name: string;
  icon: string;
  color: ResearchOptionColor;
  position: number;
};

const RESEARCH_NAV_FOLDERS: ResearchNavFolderConfig[] = [
  {
    key: 'LAB',
    name: 'Lab',
    icon: 'IconUsersGroup',
    color: 'blue',
    position: 0,
  },
  {
    key: 'WORK',
    name: 'Work',
    icon: 'IconFolder',
    color: 'green',
    position: 1,
  },
  {
    key: 'FUNDING',
    name: 'Funding',
    icon: 'IconReportMoney',
    color: 'purple',
    position: 2,
  },
  {
    key: 'DISCOVERY',
    name: 'Discovery',
    icon: 'IconRadar',
    color: 'pink',
    position: 3,
  },
];

const researchNavFolderId = (key: ResearchNavSection): string =>
  researchDeterministicUuid(`research:nav:folder:${key}`);

// Stable folder ids so the augmentation layer can re-parent the kept vanilla
// objects (collaborators / institutions / tasks / notes) into these same
// folders without re-deriving the seed hash.
export const RESEARCH_NAV_FOLDER_IDS: Record<ResearchNavSection, string> = {
  LAB: researchNavFolderId('LAB'),
  WORK: researchNavFolderId('WORK'),
  FUNDING: researchNavFolderId('FUNDING'),
  DISCOVERY: researchNavFolderId('DISCOVERY'),
};

const buildResearchNavFolder = (folder: ResearchNavFolderConfig) => ({
  id: researchNavFolderId(folder.key),
  userWorkspaceId: null,
  targetRecordId: null,
  targetObjectMetadataId: null,
  viewId: null,
  folderId: null,
  // The nav components key off `type`; FOLDER groups its children.
  type: 'FOLDER',
  name: folder.name,
  link: null,
  icon: folder.icon,
  color: folder.color,
  position: folder.position,
  applicationId: CORE_APPLICATION_ID,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
  targetRecordIdentifier: null,
});

const buildNavigationMenuItem = (
  spec: ResearchObjectSpec,
  position: number,
) => ({
  id: researchDeterministicUuid(`research:nav:${spec.nameSingular}`),
  userWorkspaceId: null,
  targetRecordId: null,
  targetObjectMetadataId: objectId(spec),
  viewId: null,
  folderId: RESEARCH_NAV_FOLDER_IDS[spec.navSection],
  type: 'OBJECT',
  name: null,
  link: null,
  icon: null,
  color: spec.navColor,
  position,
  applicationId: CORE_APPLICATION_ID,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP,
  targetRecordIdentifier: null,
});

export const buildResearchNavigationMenuItems = () => {
  // Position each object by its order among same-folder specs so the in-folder
  // ordering is stable and leaves room for re-parented vanilla items after it.
  const positionInFolder = new Map<ResearchNavSection, number>();
  const objectItems = RESEARCH_OBJECT_SPECS.map((spec) => {
    const next = positionInFolder.get(spec.navSection) ?? 0;
    positionInFolder.set(spec.navSection, next + 1);
    return buildNavigationMenuItem(spec, next);
  });
  return [...RESEARCH_NAV_FOLDERS.map(buildResearchNavFolder), ...objectItems];
};

// Lookup helpers used by the seed-record builders so seeds reference the same
// deterministic object/field ids as the metadata.
export const getResearchObjectId = (nameSingular: string) =>
  researchDeterministicUuid(`research:object:${nameSingular}`);

export const getResearchFieldId = (nameSingular: string, fieldName: string) =>
  fieldId(nameSingular, fieldName);
