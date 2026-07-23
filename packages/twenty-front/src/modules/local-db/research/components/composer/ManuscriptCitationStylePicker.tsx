import { styled } from '@linaria/react';
import { type SelectOption } from 'twenty-ui/input';

import { CITATION_MODES } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { VENDORED_CSL_STYLES } from '@/local-db/research/manuscript/manuscriptCiteproc';
import { type CitationMode } from '@/local-db/research/manuscript/manuscriptTypes';
import { Select } from '@/ui/input/components/Select';

type ManuscriptCitationStylePickerProps = {
  disabled?: boolean;
  onChange: (citationStyleKey: string) => void;
  value: string;
};

const CITATION_MODE_LABELS: Record<CitationMode, string> = {
  NUMERIC: 'Numeric [1]',
  NUMERIC_SUPERSCRIPT: 'Numeric superscript¹',
  AUTHOR_DATE: 'Author–date (Smith, 2024)',
  AUTHOR_NUMBER: 'Author + number',
};

const CITATION_STYLE_OPTIONS: SelectOption<string>[] = [
  {
    value: 'lightweight-styles',
    label: 'Lightweight modes',
    disabled: true,
  },
  ...CITATION_MODES.map((citationMode) => ({
    value: citationMode,
    label: CITATION_MODE_LABELS[citationMode],
  })),
  {
    value: 'journal-csl-styles',
    label: 'Journal styles (CSL)',
    disabled: true,
  },
  ...VENDORED_CSL_STYLES.map((style) => ({
    value: style.id,
    label: style.title,
  })),
];

export const citationStyleTitle = (citationStyleKey: string): string =>
  CITATION_STYLE_OPTIONS.find(({ value }) => value === citationStyleKey)
    ?.label ?? citationStyleKey;

const StyledPicker = styled.div`
  min-width: 210px;
`;

// Keep this picker controlled: mode changes also swap the active mode's saved
// settings in the parent before the manuscript override is persisted.
export const ManuscriptCitationStylePicker = ({
  disabled = false,
  onChange,
  value,
}: ManuscriptCitationStylePickerProps) => (
  <StyledPicker>
    <Select
      dropdownId="manuscript-citation-style-picker"
      label="Citation style"
      fullWidth
      disabled={disabled}
      options={CITATION_STYLE_OPTIONS}
      value={value}
      onChange={onChange}
    />
  </StyledPicker>
);
