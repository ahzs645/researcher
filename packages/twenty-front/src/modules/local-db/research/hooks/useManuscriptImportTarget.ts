import { useMemo } from 'react';
import { isDefined } from 'twenty-shared/utils';

import {
  belongsTo,
  FIGURE_GQL,
  type FigureRecord,
  JOURNAL_GQL,
  type JournalRecord,
  MANUSCRIPT_GQL,
  type ManuscriptRecord,
  REFERENCE_GQL,
  type ReferenceRecord,
  SECTION_GQL,
  type SectionRecord,
  sortSections,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import { parseManuscriptExportStyleOverrides } from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { resolveManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptTableStyleOptions';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';

// Everything `prepareManuscriptImport` needs to append into an existing paper
// without duplicating its sections, references or figure keys. The composer
// gets this from `useManuscriptComposer`; record-level surfaces (record page,
// side panel) need the same context without the whole editor state machine.
export const useManuscriptImportTarget = (manuscriptId: string) => {
  const { records: manuscriptRecords, refetch: refetchManuscripts } =
    useFindManyRecords({
      objectNameSingular: 'manuscript',
      recordGqlFields: MANUSCRIPT_GQL,
    });
  const { records: journalRecords } = useFindManyRecords({
    objectNameSingular: 'journalTemplate',
    recordGqlFields: JOURNAL_GQL,
  });
  const { records: sectionRecords, refetch: refetchSections } =
    useFindManyRecords({
      objectNameSingular: 'manuscriptSection',
      recordGqlFields: SECTION_GQL,
    });
  const { records: figureRecords, refetch: refetchFigures } =
    useFindManyRecords({
      objectNameSingular: 'figure',
      recordGqlFields: FIGURE_GQL,
    });
  const { records: referenceRecords, refetch: refetchReferences } =
    useFindManyRecords({
      objectNameSingular: 'reference',
      recordGqlFields: REFERENCE_GQL,
    });

  const manuscript = (manuscriptRecords as unknown as ManuscriptRecord[]).find(
    (record) => record.id === manuscriptId,
  );

  const sections = useMemo(
    () =>
      sortSections(
        (sectionRecords as unknown as SectionRecord[]).filter((section) =>
          belongsTo(section, manuscriptId),
        ),
      ),
    [sectionRecords, manuscriptId],
  );

  const references = useMemo(
    () =>
      (referenceRecords as unknown as ReferenceRecord[]).filter((reference) =>
        belongsTo(reference, manuscriptId),
      ),
    [referenceRecords, manuscriptId],
  );

  const figureRefKeys = useMemo(
    () =>
      (figureRecords as unknown as FigureRecord[])
        .filter((figure) => belongsTo(figure, manuscriptId))
        .map(({ refKey }) => refKey)
        .filter(
          (refKey): refKey is string =>
            typeof refKey === 'string' && refKey.length > 0,
        ),
    [figureRecords, manuscriptId],
  );

  const targetJournal = (journalRecords as unknown as JournalRecord[]).find(
    (journal) => journal.id === manuscript?.targetJournal?.id,
  );

  // Mirror the composer: journal style first, then the manuscript's own
  // export overrides, so an imported table renders the way it will export.
  const exportTableStyle = resolveManuscriptTableStyle(
    parseManuscriptExportStyleOverrides(manuscript?.exportStyleOverrides)
      .tableStyle ?? targetJournal?.tableStyle,
  );

  const refetchImportedRecords = () =>
    Promise.all([
      refetchManuscripts(),
      refetchSections(),
      refetchFigures(),
      refetchReferences(),
    ]);

  return {
    isReady: isDefined(manuscript),
    manuscriptName: manuscript?.name ?? null,
    existingSectionCount: sections.length,
    existingSections: sections,
    existingReferences: references,
    existingFigureRefKeys: figureRefKeys,
    exportTableStyle,
    targetJournal,
    exportStyleOverrides: manuscript?.exportStyleOverrides ?? null,
    submissionExtras: manuscript?.submissionExtras ?? null,
    competingInterests: manuscript?.competingInterests ?? null,
    refetchImportedRecords,
  };
};
