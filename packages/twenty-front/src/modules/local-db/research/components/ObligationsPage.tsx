import { styled } from '@linaria/react';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { createDocumentLabeler } from '@/local-db/research/researchObligationLabeling';
import {
  buildNextObligation,
  isRecurring,
} from '@/local-db/research/researchObligationRecurrence';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Records as this page reads them — flat scalars plus the MANY_TO_ONE join
// columns (`assigneeId`, `projectId`, `grantId`, `obligationId`), which the
// bridge SDL exposes alongside the relation objects. Linking by id client-side
// avoids depending on nested relation resolution.
type ObligationRecord = {
  id: string;
  name?: string | null;
  obligationType?: string | null;
  status?: string | null;
  priority?: string | null;
  reportingPeriod?: string | null;
  recurrence?: string | null;
  dueDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  completedAt?: string | null;
  keywords?: string[] | null;
  assigneeId?: string | null;
  projectId?: string | null;
  grantId?: string | null;
};
type DocumentRecord = {
  id: string;
  name?: string | null;
  documentKind?: string | null;
  fileType?: string | null;
  fileSizeKb?: number | null;
  keywords?: string[] | null;
  obligationId?: string | null;
};
type NamedRecord = { id: string; name?: string | null };
type GrantRecord = { id: string; name?: string | null; funder?: string | null };
type TeamRecord = { id: string; individualMode?: boolean | null };

const OBLIGATION_TYPE_LABELS: Record<string, string> = {
  PROGRESS_REPORT: 'Progress report',
  ANNUAL_REPORT: 'Annual report',
  INTERIM_REPORT: 'Interim report',
  FINAL_REPORT: 'Final report',
  FINANCIAL_REPORT: 'Financial report',
  MILESTONE: 'Milestone',
  ETHICS_RENEWAL: 'Ethics renewal',
  DATA_MANAGEMENT: 'Data management',
  PUBLICATION: 'Publication',
  TRAINING: 'Training',
  OTHER: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  COMPLETE: 'Complete',
  OVERDUE: 'Overdue',
  WAIVED: 'Waived',
};

const OBLIGATION_GQL_FIELDS = {
  id: true,
  name: true,
  obligationType: true,
  status: true,
  priority: true,
  reportingPeriod: true,
  recurrence: true,
  dueDate: true,
  periodStart: true,
  periodEnd: true,
  completedAt: true,
  keywords: true,
  assigneeId: true,
  projectId: true,
  grantId: true,
};

const DOCUMENT_GQL_FIELDS = {
  id: true,
  name: true,
  documentKind: true,
  fileType: true,
  fileSizeKb: true,
  keywords: true,
  obligationId: true,
};

const StyledPage = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  height: 100%;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[8]};
  width: 100%;
`;

const StyledHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTitleRow = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: space-between;
`;

const StyledTitle = styled.h1`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledSubtitle = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledSectionTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: ${themeCssVariables.spacing[4]} 0 ${themeCssVariables.spacing[2]};
`;

const StyledList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledRowTop = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  justify-content: space-between;
`;

const StyledRowMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledRowTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledRowMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledRowActions = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledBadge = styled.span<{
  tone: 'done' | 'progress' | 'overdue' | 'neutral';
}>`
  background: ${({ tone }) =>
    tone === 'done'
      ? themeCssVariables.tag.background.green
      : tone === 'progress'
        ? themeCssVariables.tag.background.blue
        : tone === 'overdue'
          ? themeCssVariables.tag.background.red
          : themeCssVariables.tag.background.gray};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ tone }) =>
    tone === 'done'
      ? themeCssVariables.tag.text.green
      : tone === 'progress'
        ? themeCssVariables.tag.text.blue
        : tone === 'overdue'
          ? themeCssVariables.tag.text.red
          : themeCssVariables.tag.text.gray};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: 2px 6px;
  white-space: nowrap;
`;

const StyledDocs = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledDocRow = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledForm = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

// Keep extracted text bounded — enough for keyword mining without bloating.
const MAX_EXTRACTED_CHARS = 20000;

// Read the document body for text-based files so the labeler tags from real
// content, not just the filename. Binary formats (PDF/DOCX) need a parser, left
// to the backend AI seam; here they fall back to filename-only labeling.
const readFileText = (file: File): Promise<string | null> => {
  const isTextLike =
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    /\.(txt|md|csv|json|tsv|log)$/i.test(file.name);
  if (!isTextLike) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result).slice(0, MAX_EXTRACTED_CHARS));
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
};

// The active document labeler. Routed through the seam so a live Convex/Claude
// labeler can be dropped in without touching the upload handler; offline it is
// the deterministic fallback.
const documentLabeler = createDocumentLabeler();

const formatDate = (value: string | null | undefined): string => {
  if (!isDefined(value) || value.length === 0) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const isOverdue = (obligation: ObligationRecord): boolean => {
  if (
    obligation.status === 'COMPLETE' ||
    obligation.status === 'WAIVED' ||
    !isDefined(obligation.dueDate)
  ) {
    return false;
  }
  const due = new Date(obligation.dueDate);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
};

const statusTone = (
  obligation: ObligationRecord,
): 'done' | 'progress' | 'overdue' | 'neutral' => {
  if (obligation.status === 'COMPLETE') return 'done';
  if (isOverdue(obligation)) return 'overdue';
  if (obligation.status === 'IN_PROGRESS' || obligation.status === 'SUBMITTED')
    return 'progress';
  return 'neutral';
};

export const ObligationsPage = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [isUploading, setIsUploading] = useState(false);

  // New-obligation form state.
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('PROGRESS_REPORT');
  const [newAssignee, setNewAssignee] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newPeriod, setNewPeriod] = useState('');
  const [newDue, setNewDue] = useState('');

  const { records: obligationRecords, refetch: refetchObligations } =
    useFindManyRecords({
      objectNameSingular: 'obligation',
      recordGqlFields: OBLIGATION_GQL_FIELDS,
    });
  const { records: documentRecords, refetch: refetchDocuments } =
    useFindManyRecords({
      objectNameSingular: 'obligationDocument',
      recordGqlFields: DOCUMENT_GQL_FIELDS,
    });
  const { records: researcherRecords } = useFindManyRecords({
    objectNameSingular: 'researcher',
    recordGqlFields: { id: true, name: true },
  });
  const { records: projectRecords } = useFindManyRecords({
    objectNameSingular: 'project',
    recordGqlFields: { id: true, name: true },
  });
  const { records: grantRecords } = useFindManyRecords({
    objectNameSingular: 'grant',
    recordGqlFields: { id: true, name: true, funder: true },
  });
  const { records: teamRecords } = useFindManyRecords({
    objectNameSingular: 'researchTeam',
    recordGqlFields: { id: true, individualMode: true },
  });

  const { createOneRecord: createObligation } = useCreateOneRecord({
    objectNameSingular: 'obligation',
  });
  const { createOneRecord: createDocument } = useCreateOneRecord({
    objectNameSingular: 'obligationDocument',
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueSuccessSnackBar } = useSnackBar();

  const obligations = obligationRecords as unknown as ObligationRecord[];
  const documents = documentRecords as unknown as DocumentRecord[];
  const researchers = researcherRecords as unknown as NamedRecord[];
  const projects = projectRecords as unknown as NamedRecord[];
  const grants = grantRecords as unknown as GrantRecord[];
  const teams = teamRecords as unknown as TeamRecord[];

  const isSoloMode = teams[0]?.individualMode === true;

  const nameById = (records: NamedRecord[]) =>
    new Map(records.map((record) => [record.id, record.name ?? '']));
  const researcherName = useMemo(() => nameById(researchers), [researchers]);
  const projectName = useMemo(() => nameById(projects), [projects]);
  const grantById = useMemo(
    () => new Map(grants.map((grant) => [grant.id, grant])),
    [grants],
  );

  const documentsByObligation = useMemo(() => {
    const map = new Map<string, DocumentRecord[]>();
    for (const document of documents) {
      const key = document.obligationId ?? '';
      if (key.length === 0) continue;
      map.set(key, [...(map.get(key) ?? []), document]);
    }
    return map;
  }, [documents]);

  const visibleObligations = useMemo(() => {
    const filtered =
      assigneeFilter === 'ALL'
        ? obligations
        : obligations.filter(
            (obligation) => obligation.assigneeId === assigneeFilter,
          );
    // Outstanding first (overdue, then by due date), completed last.
    return [...filtered].sort((a, b) => {
      const aDone = a.status === 'COMPLETE' || a.status === 'WAIVED';
      const bDone = b.status === 'COMPLETE' || b.status === 'WAIVED';
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
    });
  }, [obligations, assigneeFilter]);

  // In lab mode, group by assignee so a manager sees each person's load; in solo
  // mode there is a single bucket ("Your obligations").
  const groups = useMemo(() => {
    if (isSoloMode) {
      return [
        { key: 'me', label: 'Your obligations', items: visibleObligations },
      ];
    }
    const byAssignee = new Map<string, ObligationRecord[]>();
    for (const obligation of visibleObligations) {
      const key = obligation.assigneeId ?? 'UNASSIGNED';
      byAssignee.set(key, [...(byAssignee.get(key) ?? []), obligation]);
    }
    return [...byAssignee.entries()].map(([key, items]) => ({
      key,
      label:
        key === 'UNASSIGNED'
          ? 'Unassigned'
          : (researcherName.get(key) ?? 'Unknown researcher'),
      items,
    }));
  }, [isSoloMode, visibleObligations, researcherName]);

  const addObligation = async () => {
    if (newTitle.trim().length === 0) return;
    await createObligation({
      name: newTitle.trim(),
      obligationType: newType,
      status: 'UPCOMING',
      reportingPeriod: newPeriod.trim().length > 0 ? newPeriod.trim() : null,
      assigneeId: newAssignee.length > 0 ? newAssignee : null,
      projectId: newProject.length > 0 ? newProject : null,
      dueDate: newDue.length > 0 ? new Date(newDue).toISOString() : null,
    });
    setNewTitle('');
    setNewPeriod('');
    setNewDue('');
    await refetchObligations();
    enqueueSuccessSnackBar({
      message: `Added obligation "${newTitle.trim()}"`,
    });
  };

  const setObligationStatus = async (
    obligation: ObligationRecord,
    status: string,
  ) => {
    await updateOneRecord({
      objectNameSingular: 'obligation',
      idToUpdate: obligation.id,
      updateOneRecordInput: {
        status,
        completedAt: status === 'COMPLETE' ? new Date().toISOString() : null,
      },
    });

    // Completing a recurring obligation tees up the next instance (advanced
    // period + dates), so the cadence keeps rolling without a manual re-entry.
    const justCompleted =
      status === 'COMPLETE' && obligation.status !== 'COMPLETE';
    if (justCompleted && isRecurring(obligation.recurrence)) {
      const next = buildNextObligation(obligation);
      if (isDefined(next)) {
        await createObligation({
          name: next.name,
          obligationType: obligation.obligationType,
          status: 'UPCOMING',
          priority: obligation.priority,
          recurrence: obligation.recurrence,
          reportingPeriod: next.reportingPeriod,
          dueDate: next.dueDate,
          periodStart: next.periodStart,
          periodEnd: next.periodEnd,
          assigneeId: obligation.assigneeId,
          projectId: obligation.projectId,
          grantId: obligation.grantId,
          keywords: obligation.keywords ?? [],
        });
        enqueueSuccessSnackBar({
          message: `Next instance created: "${next.name}"${
            isDefined(next.dueDate) ? ` (due ${formatDate(next.dueDate)})` : ''
          }`,
        });
      }
    }

    await refetchObligations();
  };

  const openUpload = (obligationId: string) => {
    setUploadTargetId(obligationId);
    fileInputRef.current?.click();
  };

  // Read the file as a data URL, auto-tag it with the deterministic labeler
  // (the offline AI fallback), and store it against the obligation.
  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const obligationId = uploadTargetId;
    event.target.value = '';
    if (!isDefined(file) || !isDefined(obligationId)) return;

    setIsUploading(true);
    try {
      const obligation = obligations.find((item) => item.id === obligationId);
      const grant = isDefined(obligation?.grantId)
        ? grantById.get(obligation.grantId)
        : undefined;
      const textContent = await readFileText(file);
      const labels = await documentLabeler({
        fileName: file.name,
        fileType: file.type,
        obligationTitle: obligation?.name,
        obligationType: obligation?.obligationType,
        reportingPeriod: obligation?.reportingPeriod,
        funder: grant?.funder,
        projectName: isDefined(obligation?.projectId)
          ? projectName.get(obligation.projectId)
          : undefined,
        textContent,
      });
      const dataUrl = await fileToDataUrl(file);
      await createDocument({
        name: file.name,
        obligationId,
        fileUrl: dataUrl,
        fileType: file.type.length > 0 ? file.type : null,
        fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
        documentKind: labels.suggestedKind,
        keywords: labels.keywords,
        summary: labels.summary,
        uploadedAt: new Date().toISOString(),
      });
      await refetchDocuments();
      enqueueSuccessSnackBar({
        message: `Uploaded "${file.name}" — tagged ${labels.suggestedKind.toLowerCase()}: ${labels.keywords
          .slice(0, 4)
          .join(', ')}`,
      });
    } finally {
      setIsUploading(false);
      setUploadTargetId(null);
    }
  };

  return (
    <StyledPage>
      <StyledHeader>
        <StyledTitleRow>
          <StyledTitle>Obligations</StyledTitle>
        </StyledTitleRow>
        <StyledSubtitle>
          {isSoloMode
            ? 'Everything you owe across your projects — progress reports, renewals, deliverables. Upload the documents for each, auto-tagged with keywords.'
            : 'What each person on the team owes across their projects. Upload the documents for each obligation; they are auto-tagged with keywords for storage and search.'}
        </StyledSubtitle>
      </StyledHeader>

      <StyledForm>
        <StyledInput
          placeholder="New obligation title"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <StyledSelect
          value={newType}
          onChange={(event) => setNewType(event.target.value)}
        >
          {Object.entries(OBLIGATION_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </StyledSelect>
        <StyledSelect
          value={newAssignee}
          onChange={(event) => setNewAssignee(event.target.value)}
        >
          <option value="">Assign to…</option>
          {researchers.map((researcher) => (
            <option key={researcher.id} value={researcher.id}>
              {researcher.name}
            </option>
          ))}
        </StyledSelect>
        <StyledSelect
          value={newProject}
          onChange={(event) => setNewProject(event.target.value)}
        >
          <option value="">Project…</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </StyledSelect>
        <StyledInput
          placeholder="Period (e.g. 2026)"
          value={newPeriod}
          onChange={(event) => setNewPeriod(event.target.value)}
        />
        <StyledInput
          type="date"
          value={newDue}
          onChange={(event) => setNewDue(event.target.value)}
        />
        <Button
          title="Add obligation"
          variant="primary"
          accent="blue"
          size="small"
          disabled={newTitle.trim().length === 0}
          onClick={addObligation}
        />
      </StyledForm>

      {!isSoloMode ? (
        <StyledForm>
          <StyledRowMeta>Filter by person</StyledRowMeta>
          <StyledSelect
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value="ALL">Everyone</option>
            {researchers.map((researcher) => (
              <option key={researcher.id} value={researcher.id}>
                {researcher.name}
              </option>
            ))}
          </StyledSelect>
        </StyledForm>
      ) : null}

      {visibleObligations.length === 0 ? (
        <StyledEmpty>
          No obligations yet — add one above to start tracking what is owed.
        </StyledEmpty>
      ) : (
        groups.map((group) => (
          <div key={group.key}>
            {!isSoloMode ? (
              <StyledSectionTitle>
                {group.label} ({group.items.length})
              </StyledSectionTitle>
            ) : null}
            <StyledList>
              {group.items.map((obligation) => {
                const obligationDocuments =
                  documentsByObligation.get(obligation.id) ?? [];
                const overdue = isOverdue(obligation);
                return (
                  <StyledRow key={obligation.id}>
                    <StyledRowTop>
                      <StyledRowMain>
                        <StyledRowTitle>{obligation.name}</StyledRowTitle>
                        <StyledRowMeta>
                          {[
                            OBLIGATION_TYPE_LABELS[
                              obligation.obligationType ?? 'OTHER'
                            ],
                            obligation.reportingPeriod,
                            isDefined(obligation.projectId)
                              ? projectName.get(obligation.projectId)
                              : null,
                            isDefined(obligation.dueDate)
                              ? `due ${formatDate(obligation.dueDate)}`
                              : null,
                          ]
                            .filter(
                              (part) => isDefined(part) && part.length > 0,
                            )
                            .join(' · ')}
                        </StyledRowMeta>
                      </StyledRowMain>
                      <StyledRowActions>
                        <StyledBadge tone={statusTone(obligation)}>
                          {overdue
                            ? 'Overdue'
                            : (STATUS_LABELS[obligation.status ?? 'UPCOMING'] ??
                              'Upcoming')}
                        </StyledBadge>
                        <StyledSelect
                          value={obligation.status ?? 'UPCOMING'}
                          onChange={(event) =>
                            setObligationStatus(obligation, event.target.value)
                          }
                        >
                          {Object.entries(STATUS_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </StyledSelect>
                        <Button
                          title="Upload"
                          variant="secondary"
                          size="small"
                          disabled={isUploading}
                          onClick={() => openUpload(obligation.id)}
                        />
                      </StyledRowActions>
                    </StyledRowTop>
                    {obligationDocuments.length > 0 ? (
                      <StyledDocs>
                        {obligationDocuments.map((document) => (
                          <StyledDocRow key={document.id}>
                            📎 {document.name}
                            {isDefined(document.documentKind)
                              ? ` · ${document.documentKind.toLowerCase()}`
                              : ''}
                            {(document.keywords ?? []).length > 0
                              ? ` · ${(document.keywords ?? []).slice(0, 5).join(', ')}`
                              : ''}
                          </StyledDocRow>
                        ))}
                      </StyledDocs>
                    ) : null}
                  </StyledRow>
                );
              })}
            </StyledList>
          </div>
        ))
      )}

      <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />
    </StyledPage>
  );
};
