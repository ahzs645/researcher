import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';

import { useManuscriptSaveStatus } from '@/local-db/research/components/composer/ManuscriptSaveStatusContext';
import { ManuscriptReviewPointList } from '@/local-db/research/components/composer/ManuscriptReviewPointList';
import {
  StyledReviewActions,
  StyledReviewField,
  StyledReviewGrid,
  StyledReviewHeaderRow,
  StyledReviewInput,
  StyledReviewNote,
  StyledReviewSelect,
  StyledReviewTextArea,
  StyledReviewTitle,
  StyledReviewWarning,
  StyledReviewWarningList,
  StyledReviewerGroup,
} from '@/local-db/research/components/composer/manuscriptReviewPanelStyles';
import {
  type ReviewRoundRecord,
  type ReviewRoundUpdate,
} from '@/local-db/research/components/composer/useManuscriptReviewRounds';
import { readImportedDocumentFile } from '@/local-db/research/manuscript/manuscriptDocxFile';
import { exportStandaloneMarkdownToDocxBlob } from '@/local-db/research/manuscript/manuscriptDocxExport';
import { downloadExportFile } from '@/local-db/research/manuscript/manuscriptExport';
import {
  decisionLetterTextFromSections,
  parseDecisionLetter,
} from '@/local-db/research/manuscript/manuscriptReviewLetter';
import {
  buildReviewResponseMarkdown,
  REVIEW_RESPONSE_DOCUMENT_TITLE,
  reviewResponseFilenameBase,
  reviewResponseMarkdownFile,
  type ReviewResponseDocumentInput,
} from '@/local-db/research/manuscript/manuscriptReviewResponse';
import {
  parseReviewPoints,
  REVIEW_DECISION_LABELS,
  REVIEW_DECISIONS,
  reviewPointsFromLetter,
  reviewRoundProgress,
  serializeReviewPoints,
  updateReviewPoint,
  type ReviewPoint,
} from '@/local-db/research/manuscript/manuscriptReviewRound';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type ManuscriptReviewRoundEditorProps = {
  round: ReviewRoundRecord;
  manuscriptTitle: string;
  sections: SectionLike[];
  onSaveRound: (roundId: string, values: ReviewRoundUpdate) => Promise<void>;
  onDeleteRound: (roundId: string) => Promise<void>;
};

const dateInputValue = (value: string | null | undefined): string =>
  isNonEmptyString(value) ? value.slice(0, 10) : '';

export const ManuscriptReviewRoundEditor = ({
  round,
  manuscriptTitle,
  sections,
  onSaveRound,
  onDeleteRound,
}: ManuscriptReviewRoundEditorProps) => {
  const [name, setName] = useState(round.name ?? '');
  const [journal, setJournal] = useState(round.journal ?? '');
  const [decision, setDecision] = useState(round.decision ?? '');
  const [decisionDate, setDecisionDate] = useState(
    dateInputValue(round.decisionDate),
  );
  const [letter, setLetter] = useState(round.letter ?? '');
  const [points, setPoints] = useState<ReviewPoint[]>(() =>
    parseReviewPoints(round.points),
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const { markUnsaved, trackSave } = useManuscriptSaveStatus();
  const { enqueueDialog } = useDialogManager();
  const { enqueueErrorSnackBar } = useSnackBar();
  const progress = reviewRoundProgress(points);

  const save = (values: ReviewRoundUpdate) =>
    trackSave(() => onSaveRound(round.id, values));

  // Every detail field saves the whole detail row, with the field that just
  // changed passed in: a select or a date picker saves on change, where React
  // state would still be a render behind.
  const saveDetails = (
    next: Partial<{
      name: string;
      journal: string;
      decision: string;
      decisionDate: string;
    }> = {},
  ) => {
    const values = { name, journal, decision, decisionDate, ...next };
    void save({
      name: values.name.trim().length > 0 ? values.name.trim() : 'Review round',
      journal: values.journal,
      decision: values.decision,
      decisionDate:
        values.decisionDate.length > 0
          ? new Date(values.decisionDate).toISOString()
          : null,
    });
  };

  const readPointsFromLetter = (nextLetter: string) => {
    const parsed = parseDecisionLetter(nextLetter);
    const nextPoints = reviewPointsFromLetter(parsed, points);
    setPoints(nextPoints);
    setWarnings(parsed.warnings);
    void save({
      letter: nextLetter,
      points: serializeReviewPoints(nextPoints),
    });
  };

  const importLetterFile = async (file: File) => {
    try {
      const document = await readImportedDocumentFile(file);
      const text = decisionLetterTextFromSections(document.sections);
      setLetter(text);
      readPointsFromLetter(text);
    } catch {
      enqueueErrorSnackBar({ message: 'Could not read that decision letter' });
    }
  };

  const editPoint = (pointId: string, patch: Partial<ReviewPoint>) => {
    markUnsaved();
    setPoints((current) => updateReviewPoint(current, pointId, patch));
  };

  const persistPoint = (pointId: string, patch: Partial<ReviewPoint>) => {
    const nextPoints = updateReviewPoint(points, pointId, patch);
    setPoints(nextPoints);
    void save({ points: serializeReviewPoints(nextPoints) });
  };

  const documentInput = (): ReviewResponseDocumentInput => ({
    manuscriptTitle,
    roundName: name,
    journal,
    decision,
    decisionDate,
    points,
    sections,
  });

  const downloadMarkdown = () => {
    downloadExportFile({
      filename: `${reviewResponseFilenameBase(manuscriptTitle, name)}.md`,
      mimeType: 'text/markdown',
      content: reviewResponseMarkdownFile(documentInput()),
    });
  };

  const downloadDocx = async () => {
    try {
      downloadExportFile({
        filename: `${reviewResponseFilenameBase(manuscriptTitle, name)}.docx`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content: await exportStandaloneMarkdownToDocxBlob(
          REVIEW_RESPONSE_DOCUMENT_TITLE,
          buildReviewResponseMarkdown(documentInput()),
        ),
      });
    } catch {
      enqueueErrorSnackBar({
        message: 'Could not build the response document',
      });
    }
  };

  const confirmDelete = () =>
    enqueueDialog({
      title: 'Delete this review round?',
      message: `"${name}" and the ${points.length} answered or unanswered points in it are deleted permanently.`,
      buttons: [
        { title: 'Cancel' },
        {
          title: 'Delete',
          accent: 'danger',
          role: 'confirm',
          onClick: () => void onDeleteRound(round.id),
        },
      ],
    });

  return (
    <StyledReviewerGroup>
      <StyledReviewGrid>
        <StyledReviewField>
          Round
          <StyledReviewInput
            value={name}
            placeholder="e.g. Round 1"
            onChange={(event) => {
              setName(event.target.value);
              markUnsaved();
            }}
            onBlur={(event) => saveDetails({ name: event.target.value })}
          />
        </StyledReviewField>
        <StyledReviewField>
          Journal
          <StyledReviewInput
            value={journal}
            placeholder="Journal that sent the decision"
            onChange={(event) => {
              setJournal(event.target.value);
              markUnsaved();
            }}
            onBlur={(event) => saveDetails({ journal: event.target.value })}
          />
        </StyledReviewField>
        <StyledReviewField>
          Decision
          <StyledReviewSelect
            value={decision}
            onChange={(event) => {
              setDecision(event.target.value);
              saveDetails({ decision: event.target.value });
            }}
          >
            <option value="">Not decided</option>
            {REVIEW_DECISIONS.map((option) => (
              <option key={option} value={option}>
                {REVIEW_DECISION_LABELS[option]}
              </option>
            ))}
          </StyledReviewSelect>
        </StyledReviewField>
        <StyledReviewField>
          Decision date
          <StyledReviewInput
            type="date"
            value={decisionDate}
            onChange={(event) => {
              setDecisionDate(event.target.value);
              saveDetails({ decisionDate: event.target.value });
            }}
          />
        </StyledReviewField>
      </StyledReviewGrid>

      <StyledReviewField>
        Decision letter
        <StyledReviewTextArea
          value={letter}
          placeholder="Paste the decision letter here, then read the points from it"
          onChange={(event) => {
            setLetter(event.target.value);
            markUnsaved();
          }}
          onBlur={(event) => void save({ letter: event.target.value })}
        />
      </StyledReviewField>
      <StyledReviewActions>
        <Button
          title="Read points from the letter"
          variant="primary"
          accent="blue"
          size="small"
          disabled={letter.trim().length === 0}
          onClick={() => readPointsFromLetter(letter)}
        />
        <StyledReviewField>
          Or import the letter
          <input
            type="file"
            accept=".docx,.pdf,.md,.markdown,.txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file === undefined) return;
              void importLetterFile(file);
            }}
          />
        </StyledReviewField>
      </StyledReviewActions>

      {warnings.length > 0 ? (
        <StyledReviewWarningList>
          {warnings.map((warning) => (
            <StyledReviewWarning key={warning}>{warning}</StyledReviewWarning>
          ))}
        </StyledReviewWarningList>
      ) : null}

      <StyledReviewHeaderRow>
        <StyledReviewTitle>
          Points ({progress.answered} of {progress.total} answered)
        </StyledReviewTitle>
        <StyledReviewActions>
          <Button
            title="Response document (.docx)"
            variant="secondary"
            size="small"
            disabled={points.length === 0}
            onClick={() => void downloadDocx()}
          />
          <Button
            title="Markdown"
            variant="secondary"
            size="small"
            disabled={points.length === 0}
            onClick={downloadMarkdown}
          />
          <Button
            title="Delete round"
            variant="secondary"
            accent="danger"
            size="small"
            onClick={confirmDelete}
          />
        </StyledReviewActions>
      </StyledReviewHeaderRow>

      {points.length === 0 ? (
        <StyledReviewNote>
          No points yet. Paste or import the decision letter, then read the
          points from it.
        </StyledReviewNote>
      ) : (
        <ManuscriptReviewPointList
          points={points}
          sections={sections}
          onEditPoint={editPoint}
          onPersistPoint={persistPoint}
        />
      )}
    </StyledReviewerGroup>
  );
};
