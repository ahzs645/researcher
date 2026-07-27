import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';

export const MANUSCRIPT_TABLE_STYLES: ManuscriptTableStyle[] = [
  'ACADEMIC',
  'GRID',
  'SHADED_HEADER',
  'BORDERLESS',
];

// Journal style fields are free-form strings on the record, so anything the
// exporter/importer receives has to be narrowed back to a known table style.
export const resolveManuscriptTableStyle = (
  candidate: string | null | undefined,
): ManuscriptTableStyle =>
  MANUSCRIPT_TABLE_STYLES.find((tableStyle) => tableStyle === candidate) ??
  'ACADEMIC';
