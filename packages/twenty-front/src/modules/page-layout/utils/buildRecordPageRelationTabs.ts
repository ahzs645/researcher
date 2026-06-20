import { DEFAULT_RECORD_PAGE_LAYOUT_ID } from '@/page-layout/constants/DefaultRecordPageLayoutId';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type PageLayout } from '@/page-layout/types/PageLayout';
import { type PageLayoutTab } from '@/page-layout/types/PageLayoutTab';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';
import {
  FieldDisplayMode,
  PageLayoutTabLayoutMode,
  WidgetConfigurationType,
  WidgetType,
} from '~/generated-metadata/graphql';

// The bridge has no backend-generated record page layouts, so the default
// layout only has the system tabs (Home/Timeline/…). A record's one-to-many
// relations (a project's grants, milestones, …) therefore never get their own
// tabs. This derives a tab per one-to-many relation from the object metadata,
// each holding a FIELD widget in CARD mode — which the existing FieldWidget
// renders as the related-records list, scoped to the parent record via
// `useTargetRecord`.

const TIMESTAMP = '2026-04-10T08:55:57.800Z';

const isOneToManyRelationField = (
  field: EnrichedObjectMetadataItem['fields'][number],
): boolean =>
  field.isActive === true &&
  field.type === FieldMetadataType.RELATION &&
  (field.settings?.relationType === RelationType.ONE_TO_MANY ||
    field.relation?.type === RelationType.ONE_TO_MANY);

const buildRelationTab = (
  field: EnrichedObjectMetadataItem['fields'][number],
  pageLayoutId: string,
  position: number,
): PageLayoutTab => {
  const tabId = `relation-tab-${field.id}`;
  return {
    __typename: 'PageLayoutTab',
    applicationId: '',
    id: tabId,
    isActive: true,
    title: field.label,
    icon: field.icon ?? 'IconRelationOneToMany',
    position,
    layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
    pageLayoutId,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
    widgets: [
      {
        __typename: 'PageLayoutWidget',
        applicationId: '',
        id: `relation-widget-${field.id}`,
        isActive: true,
        pageLayoutTabId: tabId,
        title: field.label,
        type: WidgetType.FIELD,
        objectMetadataId: null,
        gridPosition: {
          __typename: 'GridPosition',
          row: 0,
          column: 0,
          rowSpan: 12,
          columnSpan: 12,
        },
        position: {
          __typename: 'PageLayoutWidgetVerticalListPosition',
          layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
          index: 0,
        },
        configuration: {
          __typename: 'FieldConfiguration',
          configurationType: WidgetConfigurationType.FIELD,
          fieldMetadataId: field.id,
          fieldDisplayMode: FieldDisplayMode.CARD,
        },
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        deletedAt: null,
      },
    ],
  };
};

// Append a relation tab per one-to-many relation to the generic default record
// layout. Only the generic default is augmented — objects with a bespoke
// default layout (Company/Person/…) are left untouched.
export const augmentRecordPageLayoutWithRelationTabs = (
  layout: PageLayout,
  objectMetadataItem: EnrichedObjectMetadataItem | undefined,
): PageLayout => {
  if (layout.id !== DEFAULT_RECORD_PAGE_LAYOUT_ID) return layout;
  if (objectMetadataItem === undefined) return layout;

  const relationFields = objectMetadataItem.fields.filter(
    isOneToManyRelationField,
  );
  if (relationFields.length === 0) return layout;

  const relationTabs = relationFields.map((field, index) =>
    buildRelationTab(field, layout.id, 600 + index),
  );

  return { ...layout, tabs: [...layout.tabs, ...relationTabs] };
};
