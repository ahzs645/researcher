import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptManualReferenceForm } from '@/local-db/research/components/composer/references/ManuscriptManualReferenceForm';
import { ManuscriptRetractedReferenceWarnings } from '@/local-db/research/components/composer/references/ManuscriptRetractedReferenceWarnings';
import { resolveReferenceIdentifiers } from '@/local-db/research/components/composer/references/manuscriptIdentifierFetch';
import {
  classifyReferenceIdentifiers,
  REFERENCE_IDENTIFIER_LABELS,
} from '@/local-db/research/manuscript/manuscriptReferenceIdentifiers';
import {
  cslItemToReferenceDraft,
  parseReferences,
  type ReferenceDraft,
} from '@/local-db/research/manuscript/manuscriptReferenceImport';
import { dedupeReferenceDrafts } from '@/local-db/research/manuscript/manuscriptReferenceStore';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';
import {
  isZoteroConfigComplete,
  parseZoteroCslResponse,
  zoteroItemsUrl,
  type ZoteroConfig,
} from '@/local-db/research/manuscript/manuscriptZoteroImport';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type ManuscriptReferenceImportToolsProps = {
  manuscriptId: string;
  projectId?: string | null;
  references: ReferenceLike[];
  onChanged: () => void;
};

const StyledCard = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;
const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;
const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  min-width: 140px;
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledTextarea = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  min-height: 72px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;

const StyledActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

export const ManuscriptReferenceImportTools = ({
  manuscriptId,
  projectId,
  references,
  onChanged,
}: ManuscriptReferenceImportToolsProps) => {
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'reference',
  });
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();
  const [pasteText, setPasteText] = useState('');
  const [identifierText, setIdentifierText] = useState('');
  const [zotero, setZotero] = useState<ZoteroConfig>({
    apiKey: '',
    libraryType: 'users',
    libraryId: '',
  });
  const [isBusy, setIsBusy] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);

  const createFromDrafts = async (drafts: ReferenceDraft[]) => {
    const { added, duplicateCount } = dedupeReferenceDrafts(references, drafts);
    for (const draft of added) {
      await createOneRecord({
        ...draft,
        manuscriptId,
        ...(projectId ? { projectId } : {}),
      });
    }
    onChanged();
    return { addedCount: added.length, duplicateCount };
  };

  const summarize = (
    addedCount: number,
    duplicateCount: number,
    source: string,
  ) => {
    if (addedCount === 0) {
      enqueueSuccessSnackBar({
        message:
          duplicateCount > 0
            ? `Already in your library — skipped ${duplicateCount} duplicate(s)`
            : 'Nothing to import',
      });
      return;
    }
    const skipped =
      duplicateCount > 0 ? `, skipped ${duplicateCount} duplicate(s)` : '';
    enqueueSuccessSnackBar({
      message: `Imported ${addedCount} reference(s)${source}${skipped}`,
    });
  };

  const importPaste = async () => {
    if (isBusy) return;
    const drafts = parseReferences(pasteText);
    if (drafts.length === 0) {
      enqueueErrorSnackBar({ message: 'Could not parse any references' });
      return;
    }
    setIsBusy(true);
    try {
      const result = await createFromDrafts(drafts);
      summarize(result.addedCount, result.duplicateCount, '');
      setPasteText('');
    } finally {
      setIsBusy(false);
    }
  };

  // Cite by identifier, Manubot-style: whatever the author pasted is sniffed
  // into a DOI / PMID / PMCID / arXiv ID / ISBN / URL and resolved to CSL JSON,
  // so there is no bibliographic entry left for them to get wrong.
  const importIdentifiers = async () => {
    if (isBusy || identifierText.trim().length === 0) return;
    const identifiers = classifyReferenceIdentifiers(identifierText);
    if (identifiers.length === 0) return;
    setIsBusy(true);
    try {
      const resolutions = await resolveReferenceIdentifiers(identifiers);
      const drafts = resolutions.flatMap((resolution) =>
        resolution.item === null
          ? []
          : [cslItemToReferenceDraft(resolution.item)],
      );
      const errors = resolutions.flatMap((resolution) =>
        resolution.error === null ? [] : [resolution.error],
      );
      // Report what failed even when the rest imported: a line silently
      // dropped from a pasted batch is a citation the author will not notice
      // is missing.
      if (errors.length > 0) {
        enqueueErrorSnackBar({
          message:
            errors.slice(0, 3).join(' · ') +
            (errors.length > 3 ? ` · and ${errors.length - 3} more` : ''),
        });
      }
      if (drafts.length === 0) return;
      const kinds = [
        ...new Set(
          resolutions
            .filter((resolution) => resolution.item !== null)
            .map(
              (resolution) =>
                REFERENCE_IDENTIFIER_LABELS[resolution.identifier.kind],
            ),
        ),
      ];
      const result = await createFromDrafts(drafts);
      summarize(
        result.addedCount,
        result.duplicateCount,
        ` by ${kinds.join('/')}`,
      );
      // Only clear the box on a clean run, so the failed lines stay editable.
      if (errors.length === 0) setIdentifierText('');
    } finally {
      setIsBusy(false);
    }
  };

  const importZotero = async () => {
    if (isBusy || !isZoteroConfigComplete(zotero)) return;
    setIsBusy(true);
    try {
      const response = await fetch(zoteroItemsUrl(zotero));
      if (!response.ok) {
        enqueueErrorSnackBar({
          message: `Zotero import failed (${response.status})`,
        });
        return;
      }
      const drafts = parseZoteroCslResponse(await response.json());
      if (drafts.length === 0) {
        enqueueErrorSnackBar({
          message: 'No references in that Zotero library',
        });
        return;
      }
      const result = await createFromDrafts(drafts);
      summarize(result.addedCount, result.duplicateCount, ' from Zotero');
    } catch {
      enqueueErrorSnackBar({
        message: 'Could not reach Zotero — check the key/library id',
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <StyledCard>
      <StyledTitle>Add references</StyledTitle>
      <Button
        title={
          isManualOpen ? 'Cancel manual reference' : 'Add reference manually'
        }
        variant="secondary"
        size="small"
        onClick={() => setIsManualOpen((isOpen) => !isOpen)}
      />
      {isManualOpen ? (
        <ManuscriptManualReferenceForm
          manuscriptId={manuscriptId}
          projectId={projectId}
          references={references}
          onChanged={onChanged}
          onCancel={() => setIsManualOpen(false)}
        />
      ) : null}
      <StyledTitle>Import references</StyledTitle>
      <StyledTextarea
        aria-label="Add by identifier"
        placeholder={
          'Add by identifier, one per line — DOI, PMID, PMCID, arXiv ID, ISBN or URL\n10.1038/s41586-020-2649-2\nPMID: 32109013\narXiv:2401.00001'
        }
        value={identifierText}
        onChange={(event) => setIdentifierText(event.target.value)}
      />
      <Button
        title={isBusy ? 'Looking up…' : 'Add by identifier'}
        variant="secondary"
        size="small"
        disabled={isBusy || identifierText.trim().length === 0}
        onClick={importIdentifiers}
      />
      <StyledTextarea
        placeholder="Paste BibTeX or CSL-JSON…"
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
      />
      <Button
        title={isBusy ? 'Importing…' : 'Import pasted references'}
        variant="secondary"
        size="small"
        disabled={isBusy || pasteText.trim().length === 0}
        onClick={importPaste}
      />
      <StyledActions>
        <StyledSelect
          aria-label="Zotero library type"
          value={zotero.libraryType}
          onChange={(event) =>
            setZotero((previous) => ({
              ...previous,
              libraryType: event.target.value as ZoteroConfig['libraryType'],
            }))
          }
        >
          <option value="users">Zotero user</option>
          <option value="groups">Zotero group</option>
        </StyledSelect>
        <StyledInput
          placeholder="Library ID"
          value={zotero.libraryId}
          onChange={(event) =>
            setZotero((previous) => ({
              ...previous,
              libraryId: event.target.value,
            }))
          }
        />
        <StyledInput
          type="password"
          placeholder="Zotero API key"
          value={zotero.apiKey}
          onChange={(event) =>
            setZotero((previous) => ({
              ...previous,
              apiKey: event.target.value,
            }))
          }
        />
        <Button
          title="Import from Zotero"
          variant="secondary"
          size="small"
          disabled={isBusy || !isZoteroConfigComplete(zotero)}
          onClick={importZotero}
        />
      </StyledActions>
      <StyledTitle>Check references</StyledTitle>
      <ManuscriptRetractedReferenceWarnings references={references} />
    </StyledCard>
  );
};
