import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import { H1Title, H2Title, IconPlus } from 'twenty-ui/display';
import { Button, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  buildManuscriptBundle,
  countWords,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';
import {
  buildSectionSkeleton,
  wordLimitStatus,
} from '@/local-db/research/manuscript/manuscriptScaffold';
import { ManuscriptCslBibliography } from '@/local-db/research/components/ManuscriptCslBibliography';
import { ManuscriptExportPanel } from '@/local-db/research/components/ManuscriptExportPanel';
import { ManuscriptFigurePanel } from '@/local-db/research/components/ManuscriptFigurePanel';
import { ManuscriptImportPanel } from '@/local-db/research/components/ManuscriptImportPanel';
import { ManuscriptReferencePanel } from '@/local-db/research/components/ManuscriptReferencePanel';
import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';
import {
  ManuscriptSubmissionDetailsPanel,
  type ManuscriptSubmissionDetails,
} from '@/local-db/research/components/ManuscriptSubmissionDetailsPanel';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { Select } from '@/ui/input/components/Select';

type WithManuscript = { manuscript?: { id?: string | null } | null };
type SectionRecord = SectionLike & WithManuscript;
type FigureRecord = Omit<FigureLike, 'sectionId'> &
  WithManuscript & { section?: { id?: string | null } | null };
type ReferenceRecord = ReferenceLike &
  WithManuscript & { project?: { id?: string | null } | null };
type ManuscriptRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  manuscriptType?: string | null;
  targetVenue?: string | null;
  authorLine?: string | null;
  affiliations?: string | null;
  correspondingAuthor?: string | null;
  coverLetter?: string | null;
  highlights?: string | null;
  competingInterests?: string | null;
  suggestedReviewers?: string | null;
  targetJournal?: { id?: string | null } | null;
};
type JournalRecord = JournalStyle & { id: string };

// Mobile-first single-column composer. The whole page is the scroll container
// and the content is capped to a readable measure, so it reflows cleanly from
// phone to desktop instead of relying on a fixed multi-column grid. Section and
// manuscript pickers use the shared `Select`; headings use `H1Title`/`H2Title`
// so the surface matches the rest of the product rather than bespoke controls.

const StyledPage = styled.div`
  box-sizing: border-box;
  display: flex;
  height: 100%;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[6]};
  width: 100%;
`;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  max-width: 880px;
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
  justify-content: space-between;

  & h2 {
    margin-bottom: 0;
  }
`;

const StyledToolbar = styled.div`
  align-items: flex-end;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledLimit = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledLimitOver = styled.span`
  color: ${themeCssVariables.font.color.danger};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const PLACEMENT_RANK: Record<string, number> = {
  FRONT_MATTER: 0,
  MAIN: 1,
  BACK_MATTER: 2,
  SUPPLEMENT: 3,
};

const sortSections = (sections: SectionLike[]): SectionLike[] =>
  [...sections].sort((a, b) => {
    const rank =
      (PLACEMENT_RANK[a.placement ?? 'MAIN'] ?? 1) -
      (PLACEMENT_RANK[b.placement ?? 'MAIN'] ?? 1);
    return rank !== 0 ? rank : (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  });

const SECTION_GQL = {
  id: true,
  name: true,
  sectionType: true,
  placement: true,
  content: true,
  orderIndex: true,
  wordLimit: true,
  wordCount: true,
  includeInExport: true,
  status: true,
  manuscript: { id: true },
};
const FIGURE_GQL = {
  id: true,
  name: true,
  refKey: true,
  caption: true,
  assetKind: true,
  placement: true,
  imageSource: true,
  imageUrl: true,
  altText: true,
  credit: true,
  widthPercent: true,
  orderIndex: true,
  tableData: true,
  manuscript: { id: true },
  section: { id: true },
};
const REFERENCE_GQL = {
  id: true,
  name: true,
  citationKey: true,
  cslType: true,
  authors: true,
  year: true,
  containerTitle: true,
  volume: true,
  issue: true,
  pages: true,
  doi: true,
  url: true,
  cslJson: true,
  manuscript: { id: true },
  project: { id: true },
};
const JOURNAL_GQL = {
  id: true,
  name: true,
  citationMode: true,
  citationStyleId: true,
  figureLabelFormat: true,
  tableLabelFormat: true,
  supplementPrefix: true,
  numberingScope: true,
  crossRefFormat: true,
  figureCaptionPosition: true,
  figureCaptionFontSize: true,
  figureCaptionLineSpacing: true,
  tableCaptionPosition: true,
  figurePageLayout: true,
  supplementStartLayout: true,
  abstractWordLimit: true,
  abstractWordMinimum: true,
  keywordMinimum: true,
  keywordMaximum: true,
  requiredArtifacts: true,
  profileKey: true,
  lineNumbering: true,
  pageNumbering: true,
  sectionNumbering: true,
  twoColumn: true,
  frontMatterLayout: true,
  fontFamily: true,
  bodyFontSize: true,
  titleFontSize: true,
  headingFontSize: true,
  subheadingFontSize: true,
  headingColor: true,
  lineSpacing: true,
  abstractLineSpacing: true,
  paragraphSpacingAfter: true,
  bodyAlignment: true,
  affiliationAlignment: true,
  affiliationNumberStyle: true,
  affiliationLineSpacing: true,
  affiliationSpacingAfter: true,
  tableStyle: true,
  tableFontSize: true,
  tableLineSpacing: true,
  referenceDocUrl: true,
};

const belongsTo = (record: WithManuscript, manuscriptId: string): boolean =>
  record.manuscript?.id === manuscriptId;

export const ManuscriptComposerPage = () => {
  const { records: manuscriptRecords, refetch: refetchManuscripts } =
    useFindManyRecords({
      objectNameSingular: 'manuscript',
      recordGqlFields: {
        id: true,
        name: true,
        status: true,
        manuscriptType: true,
        targetVenue: true,
        authorLine: true,
        affiliations: true,
        correspondingAuthor: true,
        coverLetter: true,
        highlights: true,
        competingInterests: true,
        suggestedReviewers: true,
        targetJournal: { id: true },
      },
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

  // Resolve the initial selection. A `?section=<id>` deep link selects that
  // section's owning manuscript; otherwise fall back to the first manuscript.
  useEffect(() => {
    if (isDefined(manuscriptId) || manuscripts.length === 0) return;
    const owningManuscriptId = isDefined(sectionId)
      ? (sectionRecords as unknown as SectionRecord[]).find(
          (section) => section.id === sectionId,
        )?.manuscript?.id
      : undefined;
    setManuscriptId(owningManuscriptId ?? manuscripts[0].id);
  }, [manuscripts, manuscriptId, sectionId, sectionRecords]);

  // Keep the URL in sync so the composer is shareable and back-button friendly.
  const updateSelectionParams = (
    nextManuscriptId: string,
    nextSectionId: string | null,
  ) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('manuscript', nextManuscriptId);
        if (isDefined(nextSectionId)) {
          next.set('section', nextSectionId);
        } else {
          next.delete('section');
        }
        return next;
      },
      { replace: true },
    );
  };

  const handleSelectManuscript = (nextManuscriptId: string) => {
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

  const handleSelectSection = (nextSectionId: string) => {
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
    if (sections.length > 0 && !sections.some((s) => s.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);

  const style: JournalStyle = useMemo(
    () => journals.find((journal) => journal.id === journalId) ?? {},
    [journals, journalId],
  );

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
      },
      sections,
      figures,
      references,
      style,
    });
  }, [manuscript, sections, figures, references, style]);

  const selectedSection = sections.find((section) => section.id === sectionId);

  const manuscriptOptions: SelectOption<string>[] = manuscripts.map((item) => ({
    value: item.id,
    label: item.name ?? 'Untitled manuscript',
  }));

  const sectionOptions: SelectOption<string>[] = sections.map((section) => ({
    value: section.id,
    label: `${section.name ?? section.sectionType ?? 'Section'} · ${
      section.wordCount ?? 0
    } w`,
  }));

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
    if (isDefined(createdId)) setSectionId(createdId);
  };

  const saveSubmissionDetails = async (values: ManuscriptSubmissionDetails) => {
    await updateOneRecord({
      objectNameSingular: 'manuscript',
      idToUpdate: manuscript.id,
      updateOneRecordInput: values,
    });
    await refetchManuscripts();
  };

  const selectJournal = (nextJournalId: string) => {
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

  // Generate the journal-appropriate section skeleton (IMRaD / thesis / chapter)
  // with the abstract's word limit pre-filled from the selected journal format,
  // so authors start from the expected structure instead of a blank page.
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
    if (isDefined(firstId)) setSectionId(firstId);
  };

  if (!isDefined(manuscript)) {
    return (
      <StyledPage>
        <StyledContent>
          <H1Title title="Compose" />
          <StyledMeta>
            No manuscripts yet — create one under Work › Manuscripts.
          </StyledMeta>
        </StyledContent>
      </StyledPage>
    );
  }

  return (
    <StyledPage>
      <StyledContent>
        <StyledHeader>
          <H1Title title="Compose" />
          <Select
            dropdownId="compose-manuscript-select"
            options={manuscriptOptions}
            value={manuscript.id}
            onChange={handleSelectManuscript}
          />
        </StyledHeader>

        <StyledPanel>
          <H2Title title="Sections" />
          {sections.length > 0 ? (
            <StyledToolbar>
              <Select
                dropdownId="compose-section-select"
                options={sectionOptions}
                value={selectedSection?.id ?? sections[0].id}
                onChange={handleSelectSection}
              />
              <Button
                title="Add section"
                Icon={IconPlus}
                variant="secondary"
                size="small"
                onClick={addSection}
              />
            </StyledToolbar>
          ) : (
            <StyledToolbar>
              <StyledMeta>No sections yet.</StyledMeta>
              <Button
                title="Add section"
                Icon={IconPlus}
                variant="secondary"
                size="small"
                onClick={addSection}
              />
              <Button
                title="Scaffold sections"
                variant="secondary"
                size="small"
                onClick={scaffoldSections}
              />
            </StyledToolbar>
          )}
        </StyledPanel>

        <StyledPanel>
          <H2Title title="Import" />
          <ManuscriptImportPanel
            manuscriptId={manuscript.id}
            manuscriptName={manuscript.name}
            existingSectionCount={sections.length}
            onChanged={() => {
              void Promise.all([
                refetchManuscripts(),
                refetchSections(),
                refetchFigures(),
                refetchReferences(),
              ]);
            }}
          />
        </StyledPanel>

        <StyledPanel>
          {isDefined(selectedSection) ? (
            <>
              <ManuscriptSectionEditor
                key={selectedSection.id}
                initialMarkdown={selectedSection.content ?? ''}
                onPersist={persistSection}
              />
              {(() => {
                const status = wordLimitStatus(
                  selectedSection.wordCount,
                  selectedSection.wordLimit,
                );
                if (status.wordLimit === null) {
                  return <StyledLimit>{status.wordCount} words</StyledLimit>;
                }
                return status.over ? (
                  <StyledLimitOver>
                    {status.wordCount} / {status.wordLimit} words ·{' '}
                    {Math.abs(status.remaining ?? 0)} over limit
                  </StyledLimitOver>
                ) : (
                  <StyledLimit>
                    {status.wordCount} / {status.wordLimit} words ·{' '}
                    {status.remaining} left
                  </StyledLimit>
                );
              })()}
            </>
          ) : (
            <StyledMeta>Add a section to start writing.</StyledMeta>
          )}
        </StyledPanel>

        <StyledPanel>
          <H2Title title="Figures & tables" />
          <ManuscriptFigurePanel
            manuscriptId={manuscript.id}
            figures={figures}
            sections={sections}
            style={style}
            onChanged={() => void refetchFigures()}
          />
        </StyledPanel>

        <StyledPanel>
          <H2Title title="Submission details" />
          <ManuscriptSubmissionDetailsPanel
            key={manuscript.id}
            initialValues={{
              authorLine: manuscript.authorLine,
              affiliations: manuscript.affiliations,
              correspondingAuthor: manuscript.correspondingAuthor,
              coverLetter: manuscript.coverLetter,
              highlights: manuscript.highlights,
              competingInterests: manuscript.competingInterests,
              suggestedReviewers: manuscript.suggestedReviewers,
            }}
            journalName={style.name ?? manuscript.targetVenue ?? ''}
            requiredArtifacts={style.requiredArtifacts ?? []}
            onSave={saveSubmissionDetails}
          />
        </StyledPanel>

        <StyledPanel>
          <H2Title title="Export" />
          {isDefined(bundle) ? (
            <>
              <ManuscriptExportPanel
                bundle={bundle}
                journals={journals.map((journal) => ({
                  id: journal.id,
                  name: journal.name ?? 'Journal',
                }))}
                selectedJournalId={journalId}
                onSelectJournal={selectJournal}
                materials={{
                  coverLetter: manuscript.coverLetter,
                  highlights: manuscript.highlights,
                  competingInterests: manuscript.competingInterests,
                  suggestedReviewers: manuscript.suggestedReviewers,
                }}
              />
              <ManuscriptCslBibliography
                cslItems={bundle.cslJson}
                citedKeys={bundle.citedKeys}
                styleId={style.citationStyleId ?? ''}
                fallback={bundle.bibliography}
              />
            </>
          ) : null}
        </StyledPanel>

        <StyledPanel>
          <H2Title title="References" />
          <ManuscriptReferencePanel
            manuscriptId={manuscript.id}
            references={references}
            onChanged={() => void refetchReferences()}
          />
        </StyledPanel>
      </StyledContent>
    </StyledPage>
  );
};
