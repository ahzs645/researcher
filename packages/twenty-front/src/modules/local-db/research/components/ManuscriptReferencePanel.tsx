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
  const [isBusy, setIsBusy] = useState(false);

  const createFromDrafts = async (drafts: ReferenceDraft[]) => {
    for (const draft of drafts) {
      await createOneRecord({
        ...draft,
        manuscriptId,
        ...(projectId ? { projectId } : {}),
      });
    }
    onChanged();
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
      await createFromDrafts(drafts);
      enqueueSuccessSnackBar({
        message: `Imported ${drafts.length} reference(s)`,
      });
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
      await createFromDrafts([cslItemToReferenceDraft(item)]);
      enqueueSuccessSnackBar({ message: 'Added reference from DOI' });
      setDoi('');
    } catch {
      enqueueErrorSnackBar({ message: 'Could not reach doi.org' });
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
    </StyledPanel>
  );
};
