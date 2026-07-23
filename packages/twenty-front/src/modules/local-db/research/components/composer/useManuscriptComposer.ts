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
import { type ManuscriptTitlePageDetails } from '@/local-db/research/components/composer/ManuscriptTitlePageTab';
import {
  buildManuscriptBundle,
  countWords,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { rewriteCitationKeys } from '@/local-db/research/manuscript/manuscriptCitationKeyRewrite';
import {
  parseManuscriptExportStyleOverrides,
  serializeManuscriptExportStyleOverrides,
  type ManuscriptExportStyleOverrides,
} from '@/local-db/research/manuscript/manuscriptExportStyleOverrides';
import { type ReferenceRecordUpdate } from '@/local-db/research/manuscript/manuscriptReferenceForm';
import { type PortableManuscriptSource } from '@/local-db/research/manuscript/manuscriptPortableManifest';
import {
  parseManuscriptTitlePageExtraLines,
  serializeManuscriptTitlePageExtraLines,
} from '@/local-db/research/manuscript/manuscriptTitlePage';
import { buildSectionSkeleton } from '@/local-db/research/manuscript/manuscriptScaffold';
import {
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
  type SectionPlacement,
} from '@/local-db/research/manuscript/manuscriptTypes';
import {
  buildSubmissionRequirementValuesUpdate,
  CANONICAL_REQUIREMENT_FIELDS,
  preserveCorrespondingAuthorContact,
  serializeJournalSubmissionRequirements,
  type JournalSubmissionRequirement,
  type SubmissionRequirementValues,
} from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';
import { getRecordsFromRecordConnection } from '@/object-record/cache/utils/getRecordsFromRecordConnection';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
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
  const { deleteOneRecord: deleteSectionRecord } = useDeleteOneRecord({
    objectNameSingular: 'manuscriptSection',
  });
  const { deleteOneRecord: deleteReferenceRecord } = useDeleteOneRecord({
    objectNameSingular: 'reference',
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
  const [enqueueSubmissionSave] = useState(() => {
    let pendingSave = Promise.resolve();
    return (operation: () => Promise<void>) => {
      const queuedSave = pendingSave.then(operation, operation);
      pendingSave = queuedSave.catch(() => undefined);
      return queuedSave;
    };
  });
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
        titlePageExtraLines: parseManuscriptTitlePageExtraLines(
          manuscript.titlePageExtraLines,
        ),
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
        ...(parseManuscriptTitlePageExtraLines(manuscript.titlePageExtraLines)
          .length > 0
          ? {
              titlePageExtraLines: parseManuscriptTitlePageExtraLines(
                manuscript.titlePageExtraLines,
              ),
            }
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

  const persistSectionById = (sectionIdToPersist: string, markdown: string) => {
    if (!sections.some((section) => section.id === sectionIdToPersist)) return;
    void updateOneRecord({
      objectNameSingular: 'manuscriptSection',
      idToUpdate: sectionIdToPersist,
      updateOneRecordInput: {
        content: markdown,
        wordCount: countWords(markdown),
      },
    });
  };

  const persistSection = (markdown: string) => {
    if (!isDefined(selectedSection)) return;
    persistSectionById(selectedSection.id, markdown);
  };

  const persistCitationLinkedSections = async (
    changedSections: SectionLike[],
  ) => {
    await Promise.all(
      changedSections.map((section) =>
        updateOneRecord({
          objectNameSingular: 'manuscriptSection',
          idToUpdate: section.id,
          updateOneRecordInput: {
            content: section.content ?? '',
            wordCount: countWords(section.content ?? ''),
          },
        }),
      ),
    );
    await refetchSections();
  };

  const addSection = async () => {
    if (!isDefined(manuscript)) return;
    const created = await createSection({
      name: 'New section',
      manuscriptId: manuscript.id,
      sectionType: 'OTHER',
      placement: 'MAIN',
      orderIndex: sections.length,
      level: 1,
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
        level: 1,
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

  const saveTitlePageDetails = async (values: ManuscriptTitlePageDetails) => {
    if (!isDefined(manuscript)) return;
    const {
      keywords,
      keywordsSectionId,
      titlePageExtraLines,
      ...manuscriptValues
    } = values;
    await Promise.all([
      updateOneRecord({
        objectNameSingular: 'manuscript',
        idToUpdate: manuscript.id,
        updateOneRecordInput: {
          ...manuscriptValues,
          titlePageExtraLines:
            serializeManuscriptTitlePageExtraLines(titlePageExtraLines),
        },
      }),
      ...(isDefined(keywordsSectionId)
        ? [
            updateOneRecord({
              objectNameSingular: 'manuscriptSection',
              idToUpdate: keywordsSectionId,
              updateOneRecordInput: {
                content: keywords,
                wordCount: countWords(keywords),
              },
            }),
          ]
        : []),
    ]);
    await Promise.all([refetchManuscripts(), refetchSections()]);
  };

  const addKeywordsSection = async () => {
    if (!isDefined(manuscript)) return;
    const frontMatterOrder = Math.max(
      -1,
      ...sections
        .filter((section) => section.placement === 'FRONT_MATTER')
        .map((section) => section.orderIndex ?? -1),
    );
    await createSection({
      name: 'Keywords',
      manuscriptId: manuscript.id,
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      orderIndex: frontMatterOrder + 1,
      level: 1,
      status: 'NOT_STARTED',
      includeInExport: true,
      content: '',
      wordCount: 0,
    });
    await refetchSections();
  };

  const deleteSection = async (sectionIdToDelete: string) => {
    await deleteSectionRecord(sectionIdToDelete);
    await refetchSections();
  };

  const deleteSections = async (sectionIdsToDelete: string[]) => {
    await Promise.all(sectionIdsToDelete.map(deleteSectionRecord));
    await refetchSections();
  };

  const refetchReferencesAndVerifyDeleted = async (
    referenceIdsToDelete: string[],
  ) => {
    const result = await refetchReferences();
    if (!isDefined(result.data?.references)) {
      throw new Error('Could not verify deleted references');
    }
    const deletedReferenceIds = new Set(referenceIdsToDelete);
    const survivingReferenceIds = getRecordsFromRecordConnection({
      recordConnection: result.data.references,
    })
      .map(({ id }) => id)
      .filter((id) => deletedReferenceIds.has(id));
    if (survivingReferenceIds.length > 0) {
      throw new Error(
        `Reference deletion did not persist for: ${survivingReferenceIds.join(', ')}`,
      );
    }
  };

  const deleteReferences = async (referenceIdsToDelete: string[]) => {
    await Promise.all(
      referenceIdsToDelete.map((referenceId) =>
        deleteReferenceRecord(referenceId),
      ),
    );
    await refetchReferencesAndVerifyDeleted(referenceIdsToDelete);
  };

  const mergeDuplicateReferences = async (
    keptReference: ReferenceLike,
    removedReferences: ReferenceLike[],
  ) => {
    const keptKey = keptReference.citationKey?.trim() || keptReference.id;
    const replacements = new Map(
      removedReferences.map((reference) => [
        reference.citationKey?.trim() || reference.id,
        keptKey,
      ]),
    );
    const changedSections = sections.flatMap((section) => {
      const content = rewriteCitationKeys(section.content ?? '', replacements);
      return content === (section.content ?? '') ? [] : [{ section, content }];
    });
    const changedFigures = figures.flatMap((figure) => {
      const caption = rewriteCitationKeys(figure.caption ?? '', replacements);
      const tableData = rewriteCitationKeys(
        figure.tableData ?? '',
        replacements,
      );
      if (
        caption === (figure.caption ?? '') &&
        tableData === (figure.tableData ?? '')
      ) {
        return [];
      }
      return [{ figure, caption, tableData }];
    });

    await Promise.all([
      ...changedSections.map(({ section, content }) =>
        updateOneRecord({
          objectNameSingular: 'manuscriptSection',
          idToUpdate: section.id,
          updateOneRecordInput: {
            content,
            wordCount: countWords(content),
          },
        }),
      ),
      ...changedFigures.map(({ figure, caption, tableData }) =>
        updateOneRecord({
          objectNameSingular: 'figure',
          idToUpdate: figure.id,
          updateOneRecordInput: { caption, tableData },
        }),
      ),
    ]);
    await deleteReferences(removedReferences.map(({ id }) => id));
    await Promise.all([refetchSections(), refetchFigures()]);
  };

  const updateReference = async (
    reference: ReferenceLike,
    referenceUpdate: ReferenceRecordUpdate,
  ) => {
    const previousKey = reference.citationKey?.trim() || reference.id;
    const nextKey = referenceUpdate.citationKey?.trim() || previousKey;
    const replacements = new Map([[previousKey, nextKey]]);
    const changedSections =
      previousKey === nextKey
        ? []
        : sections.flatMap((section) => {
            const content = rewriteCitationKeys(
              section.content ?? '',
              replacements,
            );
            return content === (section.content ?? '')
              ? []
              : [{ section, content }];
          });
    const changedFigures =
      previousKey === nextKey
        ? []
        : figures.flatMap((figure) => {
            const caption = rewriteCitationKeys(
              figure.caption ?? '',
              replacements,
            );
            const tableData = rewriteCitationKeys(
              figure.tableData ?? '',
              replacements,
            );
            return caption === (figure.caption ?? '') &&
              tableData === (figure.tableData ?? '')
              ? []
              : [{ figure, caption, tableData }];
          });

    await Promise.all([
      updateOneRecord({
        objectNameSingular: 'reference',
        idToUpdate: reference.id,
        updateOneRecordInput: referenceUpdate,
      }),
      ...changedSections.map(({ section, content }) =>
        updateOneRecord({
          objectNameSingular: 'manuscriptSection',
          idToUpdate: section.id,
          updateOneRecordInput: { content, wordCount: countWords(content) },
        }),
      ),
      ...changedFigures.map(({ figure, caption, tableData }) =>
        updateOneRecord({
          objectNameSingular: 'figure',
          idToUpdate: figure.id,
          updateOneRecordInput: { caption, tableData },
        }),
      ),
    ]);
    await Promise.all([
      refetchReferences(),
      ...(changedSections.length > 0 ? [refetchSections()] : []),
      ...(changedFigures.length > 0 ? [refetchFigures()] : []),
    ]);
  };

  const linkedJournal = journals.find(
    (journal) => journal.id === manuscript?.targetJournal?.id,
  );

  const requireSubmissionTarget = (
    targetJournal: JournalRecord | undefined,
  ): JournalRecord => {
    const resolvedTarget = targetJournal ?? linkedJournal;
    if (!isDefined(resolvedTarget)) {
      throw new Error('A target journal is required before saving');
    }
    return resolvedTarget;
  };

  const setTargetJournal = async (targetJournal: JournalRecord) => {
    if (!isDefined(manuscript)) {
      throw new Error('A manuscript is required before selecting a journal');
    }
    setJournalId(targetJournal.id);
    if (manuscript.targetJournal?.id === targetJournal.id) return;

    await updateOneRecord({
      objectNameSingular: 'manuscript',
      idToUpdate: manuscript.id,
      updateOneRecordInput: {
        targetJournalId: targetJournal.id,
        ...(isDefined(targetJournal.name)
          ? { targetVenue: targetJournal.name }
          : {}),
      },
    });
  };

  const refetchCurrentManuscript = async (): Promise<ManuscriptRecord> => {
    if (!isDefined(manuscript)) {
      throw new Error('A manuscript is required before saving');
    }
    const result = await refetchManuscripts();
    if (!isDefined(result.data)) {
      throw new Error('Could not refresh the manuscript before saving');
    }
    const refreshedManuscripts = getRecordsFromRecordConnection({
      recordConnection: result.data.manuscripts,
    }) as unknown as ManuscriptRecord[];
    const refreshedManuscript = refreshedManuscripts.find(
      ({ id }) => id === manuscript.id,
    );
    if (!isDefined(refreshedManuscript)) {
      throw new Error('Could not refresh the manuscript before saving');
    }
    return refreshedManuscript;
  };

  const saveSubmissionRequirementValues = (
    values: SubmissionRequirementValues,
    targetJournal?: JournalRecord,
  ) =>
    enqueueSubmissionSave(async () => {
      if (!isDefined(manuscript)) {
        throw new Error('A manuscript is required before saving');
      }
      const resolvedTarget = requireSubmissionTarget(targetJournal);
      await setTargetJournal(resolvedTarget);
      const hasExtras = Object.keys(values).some(
        (key) => CANONICAL_REQUIREMENT_FIELDS[key] === undefined,
      );
      const latestManuscript = hasExtras
        ? await refetchCurrentManuscript()
        : manuscript;
      const update = buildSubmissionRequirementValuesUpdate({
        changedValues: values,
        template: resolvedTarget,
        latestSubmissionExtras: latestManuscript.submissionExtras,
      });
      if (Object.keys(update).length === 0) return;
      await updateOneRecord({
        objectNameSingular: 'manuscript',
        idToUpdate: manuscript.id,
        updateOneRecordInput: update,
      });
      await refetchManuscripts();
    });

  const saveJournalSubmissionRequirements = (
    requirements: JournalSubmissionRequirement[],
    targetJournal?: JournalRecord,
  ) =>
    enqueueSubmissionSave(async () => {
      const resolvedTarget = requireSubmissionTarget(targetJournal);
      await setTargetJournal(resolvedTarget);
      await updateOneRecord({
        objectNameSingular: 'journalTemplate',
        idToUpdate: resolvedTarget.id,
        updateOneRecordInput: {
          submissionRequirements:
            serializeJournalSubmissionRequirements(requirements),
        },
      });
      await Promise.all([refetchJournals(), refetchManuscripts()]);
    });

  const keepJournalSubmissionValue = (
    key: string,
    value: string,
    targetJournal?: JournalRecord,
  ) =>
    enqueueSubmissionSave(async () => {
      if (!isDefined(manuscript)) {
        throw new Error('A manuscript is required before saving');
      }
      const resolvedTarget = requireSubmissionTarget(targetJournal);
      await setTargetJournal(resolvedTarget);
      if (key === 'KEYWORDS') {
        const keywordsSection = sections.find(
          (section) => section.sectionType?.toLocaleUpperCase() === 'KEYWORDS',
        );
        if (!isDefined(keywordsSection)) {
          throw new Error('The manuscript has no keywords section');
        }
        await updateOneRecord({
          objectNameSingular: 'manuscriptSection',
          idToUpdate: keywordsSection.id,
          updateOneRecordInput: {
            content: value,
            wordCount: countWords(value),
          },
        });
        await Promise.all([refetchSections(), refetchManuscripts()]);
        return;
      }
      const field =
        key === 'AUTHOR_ORDER'
          ? 'authorLine'
          : key === 'CORRESPONDING_AUTHOR'
            ? 'correspondingAuthor'
            : undefined;
      if (field === undefined) {
        throw new Error(`Cannot apply journal value for ${key}`);
      }
      const latestManuscript =
        field === 'correspondingAuthor'
          ? await refetchCurrentManuscript()
          : manuscript;
      const nextValue =
        field === 'correspondingAuthor'
          ? preserveCorrespondingAuthorContact(
              latestManuscript.correspondingAuthor ?? '',
              value,
            )
          : value;
      await updateOneRecord({
        objectNameSingular: 'manuscript',
        idToUpdate: manuscript.id,
        updateOneRecordInput: { [field]: nextValue },
      });
      await refetchManuscripts();
    });

  const selectJournal = async (nextJournalId: string) => {
    const selectedJournal = journals.find(
      (journal) => journal.id === nextJournalId,
    );
    if (!isDefined(selectedJournal)) {
      throw new Error('Could not find the selected journal');
    }
    await setTargetJournal(selectedJournal);
    await refetchManuscripts();
  };

  const changeSectionPlacement = async (
    sectionIdToMove: string,
    placement: SectionPlacement,
  ) => {
    const section = sections.find(({ id }) => id === sectionIdToMove);
    if (!isDefined(section) || section.placement === placement) return;
    const nextOrder =
      Math.max(
        -1,
        ...sections
          .filter((candidate) => candidate.placement === placement)
          .map((candidate) => candidate.orderIndex ?? -1),
      ) + 1;
    const assetPlacement = placement === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'MAIN';

    await Promise.all([
      updateOneRecord({
        objectNameSingular: 'manuscriptSection',
        idToUpdate: section.id,
        updateOneRecordInput: { placement, orderIndex: nextOrder },
      }),
      ...figures
        .filter((figure) => figure.sectionId === section.id)
        .map((figure) =>
          updateOneRecord({
            objectNameSingular: 'figure',
            idToUpdate: figure.id,
            updateOneRecordInput: { placement: assetPlacement },
          }),
        ),
    ]);
    await Promise.all([refetchSections(), refetchFigures()]);
  };

  const changeSectionIncludeInExport = async (
    sectionIdToUpdate: string,
    includeInExport: boolean,
  ) => {
    if (!sections.some((section) => section.id === sectionIdToUpdate)) return;
    await updateOneRecord({
      objectNameSingular: 'manuscriptSection',
      idToUpdate: sectionIdToUpdate,
      updateOneRecordInput: { includeInExport },
    });
    await refetchSections();
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
    persistSectionById,
    persistCitationLinkedSections,
    addSection,
    scaffoldSections,
    saveSubmissionDetails,
    saveTitlePageDetails,
    addKeywordsSection,
    deleteSection,
    deleteSections,
    deleteReferences,
    mergeDuplicateReferences,
    updateReference,
    saveSubmissionRequirementValues,
    saveJournalSubmissionRequirements,
    keepJournalSubmissionValue,
    selectJournal,
    changeSectionPlacement,
    changeSectionIncludeInExport,
    saveStyleOverrides,
    refetchImportedRecords,
    refetchSectionsAndFigures: () =>
      Promise.all([refetchSections(), refetchFigures()]),
    refetchFigures,
    refetchReferences,
  };
};
