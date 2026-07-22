import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { type ManuscriptSubmissionDetails } from '@/local-db/research/components/ManuscriptSubmissionDetailsPanel';
import {
  buildManuscriptBundle,
  countWords,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  parseManuscriptExportStyleOverrides,
  serializeManuscriptExportStyleOverrides,
  type ManuscriptExportStyleOverrides,
} from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type PortableManuscriptSource } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import { buildSectionSkeleton } from '@/local-db/research/manuscript/manuscriptScaffold';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';
import {
  CANONICAL_REQUIREMENT_FIELDS,
  parseManuscriptSubmissionExtras,
  serializeJournalSubmissionRequirements,
  serializeManuscriptSubmissionExtras,
  submissionJournalKey,
  type JournalSubmissionRequirement,
  type SubmissionRequirementValues,
} from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';

export const useManuscriptComposer = () => {
  const { records: manuscriptRecords, refetch: refetchManuscripts } =
    useFindManyRecords({
      objectNameSingular: 'manuscript',
      recordGqlFields: MANUSCRIPT_GQL,
    });
  const { records: journalRecords, refetch: refetchJournals } =
    useFindManyRecords({
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
  const { createOneRecord: createSection } = useCreateOneRecord({
    objectNameSingular: 'manuscriptSection',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const manuscripts = manuscriptRecords as unknown as ManuscriptRecord[];
  const journals = journalRecords as unknown as JournalRecord[];
  const [searchParams, setSearchParams] = useSearchParams();
  const [manuscriptId, setManuscriptId] = useState<string | null>(() =>
    searchParams.get('manuscript'),
  );
  const [sectionId, setSectionId] = useState<string | null>(() =>
    searchParams.get('section'),
  );
  const [journalId, setJournalId] = useState<string | null>(null);
  const manuscript =
    manuscripts.find((item) => item.id === manuscriptId) ?? manuscripts[0];

  useEffect(() => {
    if (isDefined(manuscriptId) || manuscripts.length === 0) return;
    const owningManuscriptId = isDefined(sectionId)
      ? (sectionRecords as unknown as SectionRecord[]).find(
          (section) => section.id === sectionId,
        )?.manuscript?.id
      : undefined;
    setManuscriptId(owningManuscriptId ?? manuscripts[0].id);
  }, [manuscripts, manuscriptId, sectionId, sectionRecords]);

  const updateSelectionParams = (
    nextManuscriptId: string,
    nextSectionId: string | null,
  ) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('manuscript', nextManuscriptId);
        if (isDefined(nextSectionId)) next.set('section', nextSectionId);
        else next.delete('section');
        return next;
      },
      { replace: true },
    );
  };

  const selectManuscript = (nextManuscriptId: string) => {
    setManuscriptId(nextManuscriptId);
    setSectionId(null);
    setJournalId(
      manuscripts.find((item) => item.id === nextManuscriptId)?.targetJournal
        ?.id ??
        journals[0]?.id ??
        null,
    );
    updateSelectionParams(nextManuscriptId, null);
  };

  const selectSection = (nextSectionId: string) => {
    setSectionId(nextSectionId);
    if (isDefined(manuscript)) {
      updateSelectionParams(manuscript.id, nextSectionId);
    }
  };

  const sections = useMemo(
    () =>
      sortSections(
        (sectionRecords as unknown as SectionRecord[]).filter((section) =>
          isDefined(manuscript) ? belongsTo(section, manuscript.id) : false,
        ),
      ),
    [sectionRecords, manuscript],
  );
  const figures = useMemo(
    () =>
      (figureRecords as unknown as FigureRecord[])
        .filter((figure) =>
          isDefined(manuscript) ? belongsTo(figure, manuscript.id) : false,
        )
        .map((figure) => ({
          ...figure,
          sectionId: figure.section?.id ?? null,
        })),
    [figureRecords, manuscript],
  );
  const references = useMemo(
    () =>
      (referenceRecords as unknown as ReferenceRecord[]).filter((reference) =>
        isDefined(manuscript) ? belongsTo(reference, manuscript.id) : false,
      ),
    [referenceRecords, manuscript],
  );

  useEffect(() => {
    if (!isDefined(journalId)) {
      setJournalId(manuscript?.targetJournal?.id ?? journals[0]?.id ?? null);
    }
  }, [manuscript, journals, journalId]);

  useEffect(() => {
    if (sections.length > 0 && !sections.some(({ id }) => id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);

  const style: JournalStyle = useMemo(
    () => journals.find((journal) => journal.id === journalId) ?? {},
    [journals, journalId],
  );
  const styleOverrides = useMemo(
    () => parseManuscriptExportStyleOverrides(manuscript?.exportStyleOverrides),
    [manuscript?.exportStyleOverrides],
  );
  const effectiveStyle = useMemo<JournalStyle>(
    () => ({ ...style, ...styleOverrides }),
    [style, styleOverrides],
  );
  const selectedSection = sections.find(({ id }) => id === sectionId);

  const bundle = useMemo(() => {
    if (!isDefined(manuscript)) return undefined;
    return buildManuscriptBundle({
      manuscript: {
        id: manuscript.id,
        name: manuscript.name,
        targetVenue: manuscript.targetVenue,
        authorLine: manuscript.authorLine,
        affiliations: manuscript.affiliations,
        correspondingAuthor: manuscript.correspondingAuthor,
        supplementTitle: manuscript.supplementTitle,
        supplementAuthorLine: manuscript.supplementAuthorLine,
        supplementAffiliations: manuscript.supplementAffiliations,
      },
      sections,
      figures,
      references,
      style: effectiveStyle,
    });
  }, [manuscript, sections, figures, references, effectiveStyle]);

  const portableSource = useMemo<PortableManuscriptSource | undefined>(() => {
    if (!isDefined(manuscript)) return undefined;
    return {
      manuscript: {
        title: manuscript.name ?? 'Untitled manuscript',
        ...(isDefined(manuscript.manuscriptType)
          ? { manuscriptType: manuscript.manuscriptType }
          : {}),
        ...(isDefined(manuscript.status) ? { status: manuscript.status } : {}),
        ...(isDefined(manuscript.targetVenue)
          ? { targetVenue: manuscript.targetVenue }
          : {}),
        ...(isDefined(manuscript.doi) ? { doi: manuscript.doi } : {}),
        ...(isDefined(manuscript.authorLine)
          ? { authorLine: manuscript.authorLine }
          : {}),
        ...(isDefined(manuscript.affiliations)
          ? { affiliations: manuscript.affiliations }
          : {}),
        ...(isDefined(manuscript.correspondingAuthor)
          ? { correspondingAuthor: manuscript.correspondingAuthor }
          : {}),
        ...(isDefined(manuscript.supplementTitle)
          ? { supplementTitle: manuscript.supplementTitle }
          : {}),
        ...(isDefined(manuscript.supplementAuthorLine)
          ? { supplementAuthorLine: manuscript.supplementAuthorLine }
          : {}),
        ...(isDefined(manuscript.supplementAffiliations)
          ? { supplementAffiliations: manuscript.supplementAffiliations }
          : {}),
      },
      sections,
      figures,
      references,
    };
  }, [manuscript, sections, figures, references]);

  const persistSection = (markdown: string) => {
    if (!isDefined(selectedSection)) return;
    void updateOneRecord({
      objectNameSingular: 'manuscriptSection',
      idToUpdate: selectedSection.id,
      updateOneRecordInput: {
        content: markdown,
        wordCount: countWords(markdown),
      },
    });
  };

  const addSection = async () => {
    if (!isDefined(manuscript)) return;
    const created = await createSection({
      name: 'New section',
      manuscriptId: manuscript.id,
      sectionType: 'OTHER',
      placement: 'MAIN',
      orderIndex: sections.length,
      status: 'NOT_STARTED',
      includeInExport: true,
      content: '',
    });
    await refetchSections();
    const createdId = (created as { id?: string } | undefined)?.id;
    if (isDefined(createdId)) selectSection(createdId);
  };

  const scaffoldSections = async () => {
    if (!isDefined(manuscript)) return;
    const skeleton = buildSectionSkeleton(manuscript.manuscriptType, style);
    let firstId: string | undefined;
    for (const draft of skeleton) {
      const created = await createSection({
        name: draft.name,
        manuscriptId: manuscript.id,
        sectionType: draft.sectionType,
        placement: draft.placement,
        orderIndex: sections.length + draft.orderIndex,
        status: 'NOT_STARTED',
        includeInExport: draft.includeInExport,
        content: '',
        ...(isDefined(draft.wordLimit) ? { wordLimit: draft.wordLimit } : {}),
      });
      const createdId = (created as { id?: string } | undefined)?.id;
      if (!isDefined(firstId) && isDefined(createdId)) firstId = createdId;
    }
    await refetchSections();
    if (isDefined(firstId)) selectSection(firstId);
  };

  const saveSubmissionDetails = async (values: ManuscriptSubmissionDetails) => {
    if (!isDefined(manuscript)) return;
    await updateOneRecord({
      objectNameSingular: 'manuscript',
      idToUpdate: manuscript.id,
      updateOneRecordInput: values,
    });
    await refetchManuscripts();
  };

  const linkedJournal = journals.find(
    (journal) => journal.id === manuscript?.targetJournal?.id,
  );

  const saveSubmissionRequirementValues = async (
    values: SubmissionRequirementValues,
  ) => {
    if (!isDefined(manuscript) || !isDefined(linkedJournal)) return;
    const update: Record<string, string> = {};
    const extras = parseManuscriptSubmissionExtras(manuscript.submissionExtras);
    const journalKey = submissionJournalKey(linkedJournal);
    const journalValues = { ...(extras[journalKey] ?? {}) };
    for (const [key, value] of Object.entries(values)) {
      const canonicalField = CANONICAL_REQUIREMENT_FIELDS[key];
      if (canonicalField === undefined) journalValues[key] = value;
      else update[canonicalField] = value;
    }
    extras[journalKey] = journalValues;
    update.submissionExtras = serializeManuscriptSubmissionExtras(extras);
    await updateOneRecord({
      objectNameSingular: 'manuscript',
      idToUpdate: manuscript.id,
      updateOneRecordInput: update,
    });
    await refetchManuscripts();
  };

  const saveJournalSubmissionRequirements = async (
    requirements: JournalSubmissionRequirement[],
  ) => {
    if (!isDefined(linkedJournal)) return;
    await updateOneRecord({
      objectNameSingular: 'journalTemplate',
      idToUpdate: linkedJournal.id,
      updateOneRecordInput: {
        submissionRequirements:
          serializeJournalSubmissionRequirements(requirements),
      },
    });
    await refetchJournals();
  };

  const keepJournalSubmissionValue = async (key: string, value: string) => {
    if (!isDefined(manuscript)) return;
    if (key === 'KEYWORDS') {
      const keywordsSection = sections.find(
        (section) => section.sectionType?.toLocaleUpperCase() === 'KEYWORDS',
      );
      if (!isDefined(keywordsSection)) return;
      await updateOneRecord({
        objectNameSingular: 'manuscriptSection',
        idToUpdate: keywordsSection.id,
        updateOneRecordInput: { content: value, wordCount: countWords(value) },
      });
      await refetchSections();
      return;
    }
    const field =
      key === 'AUTHOR_ORDER'
        ? 'authorLine'
        : key === 'CORRESPONDING_AUTHOR'
          ? 'correspondingAuthor'
          : undefined;
    if (field === undefined) return;
    await updateOneRecord({
      objectNameSingular: 'manuscript',
      idToUpdate: manuscript.id,
      updateOneRecordInput: { [field]: value },
    });
    await refetchManuscripts();
  };

  const selectJournal = (nextJournalId: string) => {
    if (!isDefined(manuscript)) return;
    setJournalId(nextJournalId);
    const selectedJournal = journals.find(
      (journal) => journal.id === nextJournalId,
    );
    void updateOneRecord({
      objectNameSingular: 'manuscript',
      idToUpdate: manuscript.id,
      updateOneRecordInput: {
        targetJournalId: nextJournalId,
        ...(isDefined(selectedJournal?.name)
          ? { targetVenue: selectedJournal.name }
          : {}),
      },
    }).then(() => refetchManuscripts());
  };

  const saveStyleOverrides = async (
    overrides: ManuscriptExportStyleOverrides,
  ) => {
    if (!isDefined(manuscript)) return;
    await updateOneRecord({
      objectNameSingular: 'manuscript',
      idToUpdate: manuscript.id,
      updateOneRecordInput: {
        exportStyleOverrides:
          serializeManuscriptExportStyleOverrides(overrides),
      },
    });
    await refetchManuscripts();
  };

  const refetchImportedRecords = () =>
    Promise.all([
      refetchManuscripts(),
      refetchSections(),
      refetchFigures(),
      refetchReferences(),
    ]);

  return {
    manuscripts,
    journals,
    manuscript,
    sections,
    figures,
    references,
    selectedSection,
    journalId,
    style,
    styleOverrides,
    effectiveStyle,
    bundle,
    portableSource,
    selectManuscript,
    selectSection,
    persistSection,
    addSection,
    scaffoldSections,
    saveSubmissionDetails,
    saveSubmissionRequirementValues,
    saveJournalSubmissionRequirements,
    keepJournalSubmissionValue,
    selectJournal,
    saveStyleOverrides,
    refetchImportedRecords,
    refetchSectionsAndFigures: () =>
      Promise.all([refetchSections(), refetchFigures()]),
    refetchFigures,
    refetchReferences,
  };
};
