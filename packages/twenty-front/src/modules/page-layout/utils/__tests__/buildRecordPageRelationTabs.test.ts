import { DEFAULT_RECORD_PAGE_LAYOUT } from '@/page-layout/constants/DefaultRecordPageLayout';
import { DEFAULT_RECORD_PAGE_LAYOUT_ID } from '@/page-layout/constants/DefaultRecordPageLayoutId';
import { augmentRecordPageLayoutWithRelationTabs } from '@/page-layout/utils/buildRecordPageRelationTabs';

const objectMetadataItem = {
  id: 'object-1',
  nameSingular: 'project',
  fields: [
    {
      id: 'f-name',
      name: 'name',
      label: 'Title',
      type: 'TEXT',
      isActive: true,
    },
    {
      id: 'f-lead',
      name: 'lead',
      label: 'Lead',
      type: 'RELATION',
      isActive: true,
      settings: { relationType: 'MANY_TO_ONE' },
    },
    {
      id: 'f-grants',
      name: 'grants',
      label: 'Grants',
      type: 'RELATION',
      isActive: true,
      icon: 'IconReportMoney',
      settings: { relationType: 'ONE_TO_MANY' },
    },
    {
      id: 'f-milestones',
      name: 'milestones',
      label: 'Milestones',
      type: 'RELATION',
      isActive: true,
      settings: { relationType: 'ONE_TO_MANY' },
    },
  ],
} as never;

describe('augmentRecordPageLayoutWithRelationTabs', () => {
  it('adds a tab per one-to-many relation with a FIELD widget', () => {
    const augmented = augmentRecordPageLayoutWithRelationTabs(
      DEFAULT_RECORD_PAGE_LAYOUT,
      objectMetadataItem,
    );

    const relationTabs = augmented.tabs.filter((tab) =>
      tab.id.startsWith('relation-tab-'),
    );
    expect(relationTabs).toHaveLength(2);
    expect(relationTabs.map((tab) => tab.title).sort()).toEqual([
      'Grants',
      'Milestones',
    ]);

    const grantsTab = relationTabs.find((tab) => tab.title === 'Grants');
    const widget = grantsTab?.widgets[0];
    expect(widget?.type).toBe('FIELD');
    expect(
      (widget?.configuration as { fieldMetadataId?: string }).fieldMetadataId,
    ).toBe('f-grants');

    // The original system tabs are preserved.
    expect(augmented.tabs.some((tab) => tab.title === 'Home')).toBe(true);
  });

  it('does not augment a non-default layout', () => {
    const otherLayout = {
      ...DEFAULT_RECORD_PAGE_LAYOUT,
      id: 'some-other-layout',
    };
    const result = augmentRecordPageLayoutWithRelationTabs(
      otherLayout,
      objectMetadataItem,
    );
    expect(result.tabs).toHaveLength(DEFAULT_RECORD_PAGE_LAYOUT.tabs.length);
  });

  it('is a no-op without an object', () => {
    const result = augmentRecordPageLayoutWithRelationTabs(
      DEFAULT_RECORD_PAGE_LAYOUT,
      undefined,
    );
    expect(result.tabs).toHaveLength(DEFAULT_RECORD_PAGE_LAYOUT.tabs.length);
    expect(result.id).toBe(DEFAULT_RECORD_PAGE_LAYOUT_ID);
  });
});
