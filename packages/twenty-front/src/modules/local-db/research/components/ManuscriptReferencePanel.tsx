import { styled } from '@linaria/react';
import { useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  cslItemToReferenceDraft,
  doiCslJsonUrl,
  parseReferences,
  type ReferenceDraft,
} from '@/local-db/research/manuscript/manuscriptReferenceImport';
import { dedupeReferenceDrafts } from '@/local-db/research/manuscript/manuscriptReferenceStore';
import {
  isZoteroConfigComplete,
  parseZoteroCslResponse,
  zoteroItemsUrl,
  type ZoteroConfig,
} from '@/local-db/research/manuscript/manuscriptZoteroImport';
import { type ReferenceLike } from '@/local-db/research/manuscript/manuscriptTypes';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

// Reference manager + staged import: paste BibTeX or CSL-JSON, or add by DOI
// (content-negotiation returns CSL JSON). All paths normalize to a `reference`
// record carrying the CSL-JSON blob, so the exporter stays source-agnostic. The
// Zotero Web API import reuses `cslItemToReferenceDraft` and slots in here next.

type ManuscriptReferencePanelProps = {
  manuscriptId: string;
  projectId?: string | null;
  references: ReferenceLike[];
  onChanged: () => void;
};

const StyledPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledRow = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledKey = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
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

const StyledInput = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;

const StyledActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSubhead = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin-top: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptReferencePanel = ({
  manuscriptId,
  projectId,
  references,
  onChanged,
}: ManuscriptReferencePanelProps) => {
  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: 'reference',
  });
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  const [pasteText, setPasteText] = useState('');
  const [doi, setDoi] = useState('');
  const [zotero, setZotero] = useState<ZoteroConfig>({
    apiKey: '',
    libraryType: 'users',
    libraryId: '',
  });
  const [isBusy, setIsBusy] = useState(false);

  // Persist drafts after de-duplicating against the existing library and
  // assigning unique citation keys — so re-importing a DOI or a whole Zotero
  // library never creates duplicates. Returns counts for the caller's message.
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
  ): void => {
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
      const { addedCount, duplicateCount } = await createFromDrafts(drafts);
      summarize(addedCount, duplicateCount, '');
      setPasteText('');
    } finally {
      setIsBusy(false);
    }
  };

  const importDoi = async () => {
    if (isBusy || doi.trim().length === 0) return;
    setIsBusy(true);
    try {
      const response = await fetch(doiCslJsonUrl(doi), {
        headers: { Accept: 'application/vnd.citationstyles.csl+json' },
      });
      if (!response.ok) {
        enqueueErrorSnackBar({
          message: `DOI lookup failed (${response.status})`,
        });
        return;
      }
      const item = (await response.json()) as Record<string, unknown>;
      const { addedCount, duplicateCount } = await createFromDrafts([
        cslItemToReferenceDraft(item),
      ]);
      summarize(addedCount, duplicateCount, ' from DOI');
      setDoi('');
    } catch {
      enqueueErrorSnackBar({ message: 'Could not reach doi.org' });
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
      const { addedCount, duplicateCount } = await createFromDrafts(drafts);
      summarize(addedCount, duplicateCount, ' from Zotero');
    } catch {
      enqueueErrorSnackBar({
        message: 'Could not reach Zotero — check the key/library id',
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <StyledPanel>
      {references.map((reference) => (
        <StyledRow key={reference.id}>
          <StyledKey>[@{reference.citationKey ?? reference.id}]</StyledKey>{' '}
          {reference.authors} ({reference.year ?? 'n.d.'}). {reference.name}
        </StyledRow>
      ))}

      <StyledActions>
        <StyledInput
          placeholder="Add by DOI (e.g. 10.1038/…)"
          value={doi}
          onChange={(event) => setDoi(event.target.value)}
        />
        <Button
          title="Add"
          variant="secondary"
          size="small"
          disabled={isBusy || doi.trim().length === 0}
          onClick={importDoi}
        />
      </StyledActions>

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

      <StyledSubhead>Zotero library</StyledSubhead>
      <StyledActions>
        <select
          value={zotero.libraryType}
          onChange={(event) =>
            setZotero((previous) => ({
              ...previous,
              libraryType: event.target.value as ZoteroConfig['libraryType'],
            }))
          }
        >
          <option value="users">User</option>
          <option value="groups">Group</option>
        </select>
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
      </StyledActions>
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
    </StyledPanel>
  );
};
