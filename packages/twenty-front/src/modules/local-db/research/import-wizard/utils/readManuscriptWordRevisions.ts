import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import {
  hasWordRevisions,
  isWordRevisionWarning,
  parseWordCommentAnchors,
  parseWordMlToMarkdownBlocks,
  resolveWordTrackedChanges,
  summarizeWordRevisions,
  wordRevisionWarnings,
  type ImportedCommentAnchor,
  type TrackedChangeResolution,
  type WordRevisionSummary,
} from '@/local-db/research/manuscript/manuscriptDocImport';
import { type ImportedDocumentSource } from '@/local-db/research/manuscript/manuscriptDocxFile';
import {
  type ImportBlock,
  type ImportedSourceInfo,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';

type BlocksDocumentSource = Extract<ImportedDocumentSource, { kind: 'blocks' }>;

export type ManuscriptRevisions = {
  summary: WordRevisionSummary;
  resolution: TrackedChangeResolution;
  comments: ImportedCommentAnchor[];
};

// What step 2 maps. A .docx that came back from a co-author keeps its file
// alongside the blocks: the author can still change how its tracked changes are
// resolved, and that answer can only come from re-reading the document.
export type ManuscriptMappingSource = {
  blocks: ImportBlock[];
  sourceInfo: ImportedSourceInfo;
  sourceName: string;
  wordFile?: File;
  revisions?: ManuscriptRevisions;
};

const DOCUMENT_ENTRY = 'word/document.xml';
const COMMENTS_ENTRY = 'word/comments.xml';

// What a .docx says about its own revisions, or null when it has none to
// answer for — which is every document that was never edited with track
// changes on, and every file that is not a .docx at all.
export const wordRevisionsFromBytes = (
  bytes: Uint8Array,
  resolution: TrackedChangeResolution,
): ManuscriptRevisions | null => {
  let documentXml = '';
  let commentsXml = '';
  try {
    // Only the two entries that carry revisions are inflated — the media in a
    // figure-heavy manuscript is megabytes we would throw away.
    const entries = unzipSync(bytes, {
      filter: (entry) =>
        entry.name === DOCUMENT_ENTRY || entry.name === COMMENTS_ENTRY,
    });
    const documentEntry = entries[DOCUMENT_ENTRY];
    if (documentEntry === undefined) return null;
    documentXml = strFromU8(documentEntry);
    const commentsEntry = entries[COMMENTS_ENTRY];
    commentsXml = commentsEntry === undefined ? '' : strFromU8(commentsEntry);
  } catch {
    return null;
  }

  const summary = summarizeWordRevisions(documentXml, commentsXml);
  if (!hasWordRevisions(summary)) return null;

  return {
    summary,
    resolution,
    comments: parseWordCommentAnchors(
      // Quote the anchors from the resolved text, so a comment reads against
      // the words the author is actually importing.
      resolveWordTrackedChanges(documentXml, resolution),
      commentsXml,
      parseWordMlToMarkdownBlocks(documentXml, { trackedChanges: resolution }),
    ),
  };
};

export const mappingSourceWithRevisions = (
  source: BlocksDocumentSource,
  wordFile: File,
  revisions: ManuscriptRevisions | null,
): ManuscriptMappingSource => {
  const mappingSource: ManuscriptMappingSource = {
    blocks: source.blocks,
    sourceInfo: source.sourceInfo,
    sourceName: source.sourceName,
  };
  if (revisions === null) return mappingSource;

  return {
    ...mappingSource,
    sourceInfo: {
      ...source.sourceInfo,
      revisionSummary: revisions.summary,
      // The blocks were read from a body whose revisions are already settled,
      // so the warning about them can only come from the original file — and it
      // supersedes whatever the parser said, because only this side has read
      // `word/comments.xml`.
      warnings: [
        ...wordRevisionWarnings(revisions.summary, revisions.resolution),
        ...(source.sourceInfo.warnings ?? []).filter(
          (warning) => !isWordRevisionWarning(warning),
        ),
      ],
    },
    wordFile,
    revisions,
  };
};

// The document body, rewritten so the runs that survive are the ones the chosen
// resolution keeps. Rewriting the package — rather than re-implementing the
// reader — is what keeps images, styles and TIFF conversion identical across
// the two answers.
export const resolvedWordBytes = (
  bytes: Uint8Array,
  resolution: TrackedChangeResolution,
): Uint8Array => {
  const entries = unzipSync(bytes);
  const documentEntry = entries[DOCUMENT_ENTRY];
  if (documentEntry === undefined) return bytes;
  entries[DOCUMENT_ENTRY] = strToU8(
    resolveWordTrackedChanges(strFromU8(documentEntry), resolution),
  );
  // Stored, not deflated: this package is read straight back and never leaves
  // the browser.
  return zipSync(entries, { level: 0 });
};

// ── File-level glue ────────────────────────────────────────────────────────
// The two wrappers below are the only part of this module that touches a File,
// which is the part a jsdom test cannot run.

export const withWordRevisions = async (
  file: File,
  source: BlocksDocumentSource,
  resolution: TrackedChangeResolution,
): Promise<ManuscriptMappingSource> => {
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return mappingSourceWithRevisions(source, file, null);
  }
  return mappingSourceWithRevisions(
    source,
    file,
    wordRevisionsFromBytes(
      new Uint8Array(await file.arrayBuffer()),
      resolution,
    ),
  );
};

// The file-level DOCX reader takes no parse options, so the only way to re-read
// a document under a different resolution is to hand it back a .docx whose body
// has already been resolved.
export const wordFileWithResolvedTrackedChanges = async (
  file: File,
  resolution: TrackedChangeResolution,
): Promise<File> => {
  const bytes = resolvedWordBytes(
    new Uint8Array(await file.arrayBuffer()),
    resolution,
  );
  return new File([new Uint8Array(bytes).buffer], file.name, {
    type: file.type,
  });
};
