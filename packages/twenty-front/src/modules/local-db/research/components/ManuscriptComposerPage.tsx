import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
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
import { ManuscriptCslBibliography } from '@/local-db/research/components/ManuscriptCslBibliography';
import { ManuscriptExportPanel } from '@/local-db/research/components/ManuscriptExportPanel';
import { ManuscriptFigurePanel } from '@/local-db/research/components/ManuscriptFigurePanel';
import { ManuscriptReferencePanel } from '@/local-db/research/components/ManuscriptReferencePanel';
import { ManuscriptSectionEditor } from '@/local-db/research/components/ManuscriptSectionEditor';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';

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
  targetVenue?: string | null;
  targetJournal?: { id?: string | null } | null;
};
type JournalRecord = JournalStyle & { id: string };

const StyledPage = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  height: 100%;
  overflow: hidden;
  padding: ${themeCssVariables.spacing[6]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: space-between;
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledColumns = styled.div`
  display: grid;
  flex: 1;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: 220px 1fr 300px;
  min-height: 0;
`;

const StyledColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-height: 0;
  overflow-y: auto;
`;

const StyledSectionItem = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active
      ? themeCssVariables.background.transparent.light
      : themeCssVariables.background.secondary};
  border: 1px solid
    ${({ active }) =>
      active
        ? themeCssVariables.color.blue
        : themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
`;

const StyledSectionMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledPanelTitle = styled.h2`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: ${themeCssVariables.spacing[2]} 0 0;
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
  tableCaptionPosition: true,
  abstractWordLimit: true,
  twoColumn: true,
  referenceDocUrl: true,
};

const belongsTo = (record: WithManuscript, manuscriptId: string): boolean =>
  record.manuscript?.id === manuscriptId;

export const ManuscriptComposerPage = () => {
  const { records: manuscriptRecords } = useFindManyRecords({
    objectNameSingular: 'manuscript',
    recordGqlFields: {
      id: true,
      name: true,
      status: true,
      targetVenue: true,
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

  const [manuscriptId, setManuscriptId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [journalId, setJournalId] = useState<string | null>(null);

  const manuscript =
    manuscripts.find((item) => item.id === manuscriptId) ?? manuscripts[0];

  // Default the selections once data arrives.
  useEffect(() => {
    if (!isDefined(manuscriptId) && manuscripts.length > 0) {
      setManuscriptId(manuscripts[0].id);
    }
  }, [manuscripts, manuscriptId]);

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
      },
      sections,
      figures,
      references,
      style,
    });
  }, [manuscript, sections, figures, references, style]);

  const selectedSection = sections.find((section) => section.id === sectionId);

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

  if (!isDefined(manuscript)) {
    return (
      <StyledPage>
        <StyledTitle>Compose</StyledTitle>
        <StyledSectionMeta>
          No manuscripts yet — create one under Work › Manuscripts.
        </StyledSectionMeta>
      </StyledPage>
    );
  }

  return (
    <StyledPage>
      <StyledHeader>
        <StyledTitle>Compose</StyledTitle>
        <StyledSelect
          value={manuscript.id}
          onChange={(event) => {
            setManuscriptId(event.target.value);
            setSectionId(null);
          }}
        >
          {manuscripts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name ?? 'Untitled manuscript'}
            </option>
          ))}
        </StyledSelect>
      </StyledHeader>

      <StyledColumns>
        <StyledColumn>
          {sections.map((section) => (
            <StyledSectionItem
              key={section.id}
              active={section.id === sectionId}
              onClick={() => setSectionId(section.id)}
            >
              {section.name ?? section.sectionType}
              <br />
              <StyledSectionMeta>
                {section.placement} · {section.wordCount ?? 0} w
              </StyledSectionMeta>
            </StyledSectionItem>
          ))}
          <Button
            title="Add section"
            variant="secondary"
            size="small"
            onClick={addSection}
          />
        </StyledColumn>

        <StyledColumn>
          {isDefined(selectedSection) ? (
            <ManuscriptSectionEditor
              key={selectedSection.id}
              initialMarkdown={selectedSection.content ?? ''}
              onPersist={persistSection}
            />
          ) : (
            <StyledSectionMeta>Select a section to edit.</StyledSectionMeta>
          )}
          <StyledPanelTitle>Figures &amp; tables</StyledPanelTitle>
          <ManuscriptFigurePanel
            manuscriptId={manuscript.id}
            figures={figures}
            style={style}
            onChanged={() => void refetchFigures()}
          />
        </StyledColumn>

        <StyledColumn>
          {isDefined(bundle) ? (
            <>
              <ManuscriptExportPanel
                bundle={bundle}
                journals={journals.map((journal) => ({
                  id: journal.id,
                  name: journal.name ?? 'Journal',
                }))}
                selectedJournalId={journalId}
                onSelectJournal={setJournalId}
              />
              <ManuscriptCslBibliography
                cslItems={bundle.cslJson}
                citedKeys={bundle.citedKeys}
                styleId={style.citationStyleId ?? ''}
                fallback={bundle.bibliography}
              />
            </>
          ) : null}
          <StyledPanelTitle>References</StyledPanelTitle>
          <ManuscriptReferencePanel
            manuscriptId={manuscript.id}
            references={references}
            onChanged={() => void refetchReferences()}
          />
        </StyledColumn>
      </StyledColumns>
    </StyledPage>
  );
};
