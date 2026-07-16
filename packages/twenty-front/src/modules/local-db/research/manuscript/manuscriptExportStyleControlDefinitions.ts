import { type SelectOption } from 'twenty-ui/input';

import { type ManuscriptExportStyleOverrideKey } from './manuscriptExportStyleOverrides';

type SelectValueType = 'STRING' | 'NUMBER' | 'BOOLEAN';

export type ManuscriptStyleSelectControl = {
  id: string;
  label: string;
  field: ManuscriptExportStyleOverrideKey;
  options: SelectOption<string>[];
  defaultValue: string;
  valueType: SelectValueType;
};

export type ManuscriptStyleTextControl = {
  id: string;
  label: string;
  field: ManuscriptExportStyleOverrideKey;
  defaultValue: string;
  placeholder: string;
};

export type ManuscriptStyleControlGroup = {
  id: string;
  title: string;
  description: string;
  selects: ManuscriptStyleSelectControl[];
  texts: ManuscriptStyleTextControl[];
};

const enabledOptions: SelectOption<string>[] = [
  { value: 'false', label: 'Off' },
  { value: 'true', label: 'On' },
];

const lineSpacingOptions: SelectOption<string>[] = [
  { value: '1', label: 'Single (1.0×)' },
  { value: '1.15', label: 'Compact (1.15×)' },
  { value: '1.5', label: 'One-and-a-half (1.5×)' },
  { value: '2', label: 'Double (2.0×)' },
];

const fontSizeOptions = (minimum: number, maximum: number) =>
  Array.from({ length: maximum - minimum + 1 }, (_, index) => {
    const value = String(minimum + index);
    return { value, label: `${value} pt` };
  });

const spacingOptions: SelectOption<string>[] = [
  { value: '0', label: 'None (0 pt)' },
  { value: '3', label: 'Tight (3 pt)' },
  { value: '6', label: 'Comfortable (6 pt)' },
  { value: '12', label: 'Open (12 pt)' },
];

export const MANUSCRIPT_STYLE_CONTROL_GROUPS: ManuscriptStyleControlGroup[] = [
  {
    id: 'page-typography',
    title: 'Page & typography',
    description: 'Title-page structure, fonts, alignment, and body spacing.',
    texts: [
      {
        id: 'manuscript-export-font-family-input',
        label: 'Font family',
        field: 'fontFamily',
        defaultValue: 'Times New Roman',
        placeholder: 'Times New Roman',
      },
    ],
    selects: [
      {
        id: 'manuscript-export-front-matter-layout-select',
        label: 'Title/front-matter layout',
        field: 'frontMatterLayout',
        defaultValue: 'INLINE',
        valueType: 'STRING',
        options: [
          { value: 'SEPARATE_TITLE_PAGE', label: 'Separate title page' },
          { value: 'TITLE_WITH_ABSTRACT', label: 'Title + abstract on page 1' },
          { value: 'INLINE', label: 'Continuous front matter' },
        ],
      },
      {
        id: 'manuscript-export-body-font-size-select',
        label: 'Body text size',
        field: 'bodyFontSize',
        defaultValue: '12',
        valueType: 'NUMBER',
        options: fontSizeOptions(9, 14),
      },
      {
        id: 'manuscript-export-title-font-size-select',
        label: 'Title text size',
        field: 'titleFontSize',
        defaultValue: '16',
        valueType: 'NUMBER',
        options: fontSizeOptions(14, 24),
      },
      {
        id: 'manuscript-export-heading-font-size-select',
        label: 'Section heading size',
        field: 'headingFontSize',
        defaultValue: '12',
        valueType: 'NUMBER',
        options: fontSizeOptions(10, 18),
      },
      {
        id: 'manuscript-export-subheading-font-size-select',
        label: 'Subheading size',
        field: 'subheadingFontSize',
        defaultValue: '12',
        valueType: 'NUMBER',
        options: fontSizeOptions(9, 16),
      },
      {
        id: 'manuscript-export-heading-color-select',
        label: 'Heading color',
        field: 'headingColor',
        defaultValue: 'BLACK',
        valueType: 'STRING',
        options: [
          { value: 'BLACK', label: 'Black' },
          { value: 'ADDIS_BLUE', label: 'Addis blue' },
        ],
      },
      {
        id: 'manuscript-export-body-alignment-select',
        label: 'Body alignment',
        field: 'bodyAlignment',
        defaultValue: 'LEFT',
        valueType: 'STRING',
        options: [
          { value: 'LEFT', label: 'Left aligned' },
          { value: 'JUSTIFIED', label: 'Justified' },
        ],
      },
      {
        id: 'manuscript-export-line-spacing-select',
        label: 'Body line spacing',
        field: 'lineSpacing',
        defaultValue: '1.5',
        valueType: 'NUMBER',
        options: lineSpacingOptions,
      },
      {
        id: 'manuscript-export-abstract-spacing-select',
        label: 'Abstract line spacing',
        field: 'abstractLineSpacing',
        defaultValue: '1.15',
        valueType: 'NUMBER',
        options: lineSpacingOptions,
      },
      {
        id: 'manuscript-export-paragraph-spacing-select',
        label: 'Paragraph spacing',
        field: 'paragraphSpacingAfter',
        defaultValue: '0',
        valueType: 'NUMBER',
        options: spacingOptions,
      },
      {
        id: 'manuscript-export-two-column-select',
        label: 'Two-column layout',
        field: 'twoColumn',
        defaultValue: 'false',
        valueType: 'BOOLEAN',
        options: enabledOptions,
      },
    ],
  },
  {
    id: 'contributors',
    title: 'Authors & affiliations',
    description: 'Layout of the linked author and affiliation metadata.',
    texts: [],
    selects: [
      {
        id: 'manuscript-export-affiliation-alignment-select',
        label: 'Affiliation alignment',
        field: 'affiliationAlignment',
        defaultValue: 'LEFT',
        valueType: 'STRING',
        options: [
          { value: 'LEFT', label: 'Left aligned (Addis)' },
          { value: 'CENTER', label: 'Centered' },
          { value: 'RIGHT', label: 'Right aligned' },
        ],
      },
      {
        id: 'manuscript-export-affiliation-number-style-select',
        label: 'Affiliation numbering',
        field: 'affiliationNumberStyle',
        defaultValue: 'SUPERSCRIPT',
        valueType: 'STRING',
        options: [
          { value: 'SUPERSCRIPT', label: 'Superscript' },
          { value: 'BASELINE', label: 'Baseline' },
        ],
      },
      {
        id: 'manuscript-export-affiliation-spacing-select',
        label: 'Affiliation line spacing',
        field: 'affiliationLineSpacing',
        defaultValue: '1',
        valueType: 'NUMBER',
        options: lineSpacingOptions,
      },
      {
        id: 'manuscript-export-affiliation-gap-select',
        label: 'Affiliation gap',
        field: 'affiliationSpacingAfter',
        defaultValue: '0',
        valueType: 'NUMBER',
        options: spacingOptions,
      },
    ],
  },
  {
    id: 'figures-tables',
    title: 'Figures & tables',
    description: 'Caption typography, pagination, and table appearance.',
    texts: [],
    selects: [
      {
        id: 'manuscript-export-table-style-select',
        label: 'Table style',
        field: 'tableStyle',
        defaultValue: 'ACADEMIC',
        valueType: 'STRING',
        options: [
          { value: 'ACADEMIC', label: 'Academic rules (Addis)' },
          { value: 'GRID', label: 'Full grid' },
          { value: 'SHADED_HEADER', label: 'Shaded header' },
          { value: 'BORDERLESS', label: 'Borderless' },
        ],
      },
      {
        id: 'manuscript-export-table-font-size-select',
        label: 'Table text size',
        field: 'tableFontSize',
        defaultValue: '10',
        valueType: 'NUMBER',
        options: fontSizeOptions(8, 14),
      },
      {
        id: 'manuscript-export-table-spacing-select',
        label: 'Table line spacing',
        field: 'tableLineSpacing',
        defaultValue: '1',
        valueType: 'NUMBER',
        options: lineSpacingOptions,
      },
      {
        id: 'manuscript-export-table-caption-position-select',
        label: 'Table caption position',
        field: 'tableCaptionPosition',
        defaultValue: 'ABOVE',
        valueType: 'STRING',
        options: [
          { value: 'ABOVE', label: 'Above table' },
          { value: 'BELOW', label: 'Below table' },
        ],
      },
      {
        id: 'manuscript-export-figure-caption-position-select',
        label: 'Figure caption position',
        field: 'figureCaptionPosition',
        defaultValue: 'BELOW',
        valueType: 'STRING',
        options: [
          { value: 'BELOW', label: 'Below figure' },
          { value: 'ABOVE', label: 'Above figure' },
        ],
      },
      {
        id: 'manuscript-export-figure-caption-font-size-select',
        label: 'Figure caption text size',
        field: 'figureCaptionFontSize',
        defaultValue: '10',
        valueType: 'NUMBER',
        options: fontSizeOptions(8, 14),
      },
      {
        id: 'manuscript-export-figure-caption-spacing-select',
        label: 'Figure caption line spacing',
        field: 'figureCaptionLineSpacing',
        defaultValue: '1',
        valueType: 'NUMBER',
        options: lineSpacingOptions,
      },
      {
        id: 'manuscript-export-figure-caption-gap-select',
        label: 'Image-to-caption gap',
        field: 'figureCaptionGap',
        defaultValue: '3',
        valueType: 'NUMBER',
        options: spacingOptions,
      },
      {
        id: 'manuscript-export-figure-caption-after-select',
        label: 'Spacing after figure caption',
        field: 'figureCaptionSpacingAfter',
        defaultValue: '6',
        valueType: 'NUMBER',
        options: spacingOptions,
      },
      {
        id: 'manuscript-export-figure-page-layout-select',
        label: 'Figure pagination',
        field: 'figurePageLayout',
        defaultValue: 'INLINE',
        valueType: 'STRING',
        options: [
          {
            value: 'SUPPLEMENT_ONE_PER_PAGE',
            label: 'Main inline; supplement one per page',
          },
          { value: 'ONE_PER_PAGE', label: 'Every figure on a new page' },
          { value: 'INLINE', label: 'All figures flow with section text' },
        ],
      },
      {
        id: 'manuscript-export-supplement-start-select',
        label: 'Supplement start',
        field: 'supplementStartLayout',
        defaultValue: 'CONTINUOUS',
        valueType: 'STRING',
        options: [
          { value: 'NEW_PAGE', label: 'Start on a new page' },
          { value: 'CONTINUOUS', label: 'Continue after main paper' },
        ],
      },
      {
        id: 'manuscript-export-supplement-cover-select',
        label: 'Supplement cover page',
        field: 'supplementCoverPage',
        defaultValue: 'false',
        valueType: 'BOOLEAN',
        options: [
          { value: 'true', label: 'Include title, authors & affiliations' },
          { value: 'false', label: 'Do not include a cover page' },
        ],
      },
    ],
  },
  {
    id: 'numbering-references',
    title: 'Numbering & references',
    description:
      'Citation style, live labels, cross-references, and numbering.',
    texts: [
      {
        id: 'manuscript-export-citation-style-input',
        label: 'CSL citation style id',
        field: 'citationStyleId',
        defaultValue: '',
        placeholder: 'american-chemical-society',
      },
      {
        id: 'manuscript-export-figure-label-input',
        label: 'Figure label format',
        field: 'figureLabelFormat',
        defaultValue: 'Figure {n}',
        placeholder: 'Fig. {n}',
      },
      {
        id: 'manuscript-export-table-label-input',
        label: 'Table label format',
        field: 'tableLabelFormat',
        defaultValue: 'Table {n}',
        placeholder: 'Table {n}',
      },
      {
        id: 'manuscript-export-supplement-prefix-input',
        label: 'Supplement prefix',
        field: 'supplementPrefix',
        defaultValue: 'S',
        placeholder: 'S',
      },
      {
        id: 'manuscript-export-cross-reference-input',
        label: 'Cross-reference format',
        field: 'crossRefFormat',
        defaultValue: 'Figure {n}',
        placeholder: 'Fig. {n}',
      },
    ],
    selects: [
      {
        id: 'manuscript-export-citation-mode-select',
        label: 'Citation mode',
        field: 'citationMode',
        defaultValue: 'NUMERIC',
        valueType: 'STRING',
        options: [
          { value: 'NUMERIC', label: 'Numeric [1]' },
          { value: 'NUMERIC_SUPERSCRIPT', label: 'Numeric superscript¹' },
          { value: 'AUTHOR_DATE', label: 'Author–date (Smith, 2024)' },
          { value: 'AUTHOR_NUMBER', label: 'Author + number' },
        ],
      },
      {
        id: 'manuscript-export-numbering-scope-select',
        label: 'Asset numbering scope',
        field: 'numberingScope',
        defaultValue: 'GLOBAL',
        valueType: 'STRING',
        options: [
          { value: 'GLOBAL', label: 'Global sequence' },
          { value: 'BY_SECTION', label: 'Restart by section' },
        ],
      },
      {
        id: 'manuscript-export-line-numbering-select',
        label: 'Line numbering',
        field: 'lineNumbering',
        defaultValue: 'false',
        valueType: 'BOOLEAN',
        options: enabledOptions,
      },
      {
        id: 'manuscript-export-page-numbering-select',
        label: 'Page numbering',
        field: 'pageNumbering',
        defaultValue: 'false',
        valueType: 'BOOLEAN',
        options: enabledOptions,
      },
      {
        id: 'manuscript-export-section-numbering-select',
        label: 'Section numbering',
        field: 'sectionNumbering',
        defaultValue: 'false',
        valueType: 'BOOLEAN',
        options: enabledOptions,
      },
    ],
  },
];
