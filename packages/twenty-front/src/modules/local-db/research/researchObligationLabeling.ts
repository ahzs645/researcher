// AI-assisted labeling for obligation documents — "an AI can go through and help
// with labeling and coming up with the keywords needed to better store them".
//
// Like the rest of the bridge this is deterministic and self-contained so it
// works with no backend: a fresh upload is auto-tagged from its filename, the
// owning obligation, and any extracted text. The async `AiDocumentLabeler` seam
// lets a Convex/Claude action replace the reasoning later (reading the document
// body, richer keywords, a real summary) without changing any caller —
// `labelObligationDocument` stays the offline fallback.

export type DocumentKind =
  | 'REPORT'
  | 'FINANCIAL'
  | 'APPROVAL'
  | 'RECEIPT'
  | 'CORRESPONDENCE'
  | 'DATASET'
  | 'SUPPORTING'
  | 'OTHER';

// Everything the labeler can read about a document. All optional so a caller can
// pass only what it has (an upload may have just a filename + obligation type).
export type DocumentLabelInput = {
  title?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  obligationTitle?: string | null;
  // An OBLIGATION_TYPE_OPTIONS value, e.g. 'PROGRESS_REPORT'.
  obligationType?: string | null;
  reportingPeriod?: string | null;
  funder?: string | null;
  projectName?: string | null;
  notes?: string | null;
  // Optional extracted document text — the AI seam would use this heavily; the
  // deterministic fallback mines it for keywords too.
  textContent?: string | null;
};

export type DocumentLabels = {
  keywords: string[];
  suggestedKind: DocumentKind;
  summary: string;
};

// The async seam an AI labeler implements (e.g. a Convex action calling Claude
// to read the document). Callers depend on this type, not the model.
export type AiDocumentLabeler = (
  input: DocumentLabelInput,
) => Promise<DocumentLabels>;

const MAX_KEYWORDS = 12;

// Small stop-word list — enough to keep extracted keywords meaningful without a
// full NLP dependency.
const STOP_WORDS = new Set<string>([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'are',
  'was',
  'were',
  'has',
  'have',
  'had',
  'will',
  'shall',
  'into',
  'onto',
  'our',
  'their',
  'its',
  'his',
  'her',
  'they',
  'them',
  'you',
  'your',
  'not',
  'but',
  'all',
  'any',
  'can',
  'may',
  'per',
  'via',
  'out',
  'off',
  'final',
  'draft',
  'version',
  'copy',
  'document',
  'file',
  'pdf',
  'docx',
  'doc',
]);

const lower = (value: string | null | undefined): string =>
  (value ?? '').toLowerCase();

// Friendly label for an OBLIGATION_TYPE_OPTIONS enum value, used as a keyword.
const OBLIGATION_TYPE_KEYWORD: Record<string, string> = {
  PROGRESS_REPORT: 'progress report',
  ANNUAL_REPORT: 'annual report',
  INTERIM_REPORT: 'interim report',
  FINAL_REPORT: 'final report',
  FINANCIAL_REPORT: 'financial report',
  MILESTONE: 'milestone',
  ETHICS_RENEWAL: 'ethics renewal',
  DATA_MANAGEMENT: 'data management',
  PUBLICATION: 'publication',
  TRAINING: 'training',
  OTHER: '',
};

// Default document kind implied by the obligation type, before content hints.
const OBLIGATION_TYPE_DEFAULT_KIND: Record<string, DocumentKind> = {
  PROGRESS_REPORT: 'REPORT',
  ANNUAL_REPORT: 'REPORT',
  INTERIM_REPORT: 'REPORT',
  FINAL_REPORT: 'REPORT',
  FINANCIAL_REPORT: 'FINANCIAL',
  MILESTONE: 'REPORT',
  ETHICS_RENEWAL: 'APPROVAL',
  DATA_MANAGEMENT: 'DATASET',
  PUBLICATION: 'SUPPORTING',
  TRAINING: 'APPROVAL',
};

// Content hints → kind, ordered most-specific first so e.g. "receipt" wins over
// the generic "report".
const KIND_HINTS: Array<{ kind: DocumentKind; needles: string[] }> = [
  { kind: 'RECEIPT', needles: ['receipt', 'invoice', 'reimburse'] },
  {
    kind: 'FINANCIAL',
    needles: [
      'budget',
      'financial',
      'finance',
      'expense',
      'expenditure',
      'cost',
    ],
  },
  {
    kind: 'APPROVAL',
    needles: [
      'ethics',
      'approval',
      'approved',
      'certificate',
      'reb',
      'consent',
      'renewal',
    ],
  },
  {
    kind: 'CORRESPONDENCE',
    needles: ['letter', 'email', 'correspondence', 'memo', 'message'],
  },
  {
    kind: 'DATASET',
    needles: ['dataset', 'data', '.csv', '.xlsx', '.json'],
  },
  {
    kind: 'REPORT',
    needles: ['report', 'progress', 'annual', 'interim', 'summary', 'update'],
  },
];

const fileExtension = (fileName: string | null | undefined): string => {
  const match = /\.([a-z0-9]{1,5})$/i.exec(fileName ?? '');
  return match ? match[1].toLowerCase() : '';
};

// Mine free text for frequent, meaningful single-word keywords.
const extractContentKeywords = (corpus: string): string[] => {
  const counts = new Map<string, number>();
  const tokens = corpus.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);
};

// Dedupe case-insensitively while preserving first-seen order and dropping
// empties, then cap the list.
const dedupeKeywords = (keywords: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim();
    if (keyword.length === 0) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= MAX_KEYWORDS) break;
  }
  return result;
};

const inferKind = (
  corpus: string,
  obligationType: string | null | undefined,
): DocumentKind => {
  for (const { kind, needles } of KIND_HINTS) {
    if (needles.some((needle) => corpus.includes(needle))) {
      return kind;
    }
  }
  const fromType = OBLIGATION_TYPE_DEFAULT_KIND[obligationType ?? ''];
  return fromType ?? 'SUPPORTING';
};

const buildSummary = (input: DocumentLabelInput): string => {
  const typeLabel =
    OBLIGATION_TYPE_KEYWORD[input.obligationType ?? ''] ||
    input.obligationTitle ||
    input.title ||
    'Document';
  const head = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  const parts: string[] = [];
  if (input.reportingPeriod) parts.push(`for ${input.reportingPeriod}`);
  const context = [input.funder, input.projectName]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .join(' · ');
  if (context.length > 0) parts.push(`— ${context}`);
  return [head, ...parts].join(' ').trim();
};

// Deterministic labeler — the no-backend default and the AI fallback.
export const labelObligationDocument = (
  input: DocumentLabelInput,
): DocumentLabels => {
  // Structured tags first (these are the highest-signal keywords), then the
  // frequency-derived ones from any free text.
  const structured = [
    OBLIGATION_TYPE_KEYWORD[input.obligationType ?? ''] ?? '',
    input.reportingPeriod ?? '',
    input.funder ?? '',
    input.projectName ?? '',
    fileExtension(input.fileName),
  ];

  const corpus = [
    input.title,
    input.fileName,
    input.obligationTitle,
    input.notes,
    input.textContent,
  ]
    .map((value) => value ?? '')
    .join(' ');

  const keywords = dedupeKeywords([
    ...structured,
    ...extractContentKeywords(corpus),
  ]);

  const kindCorpus = `${lower(input.fileName)} ${lower(input.title)} ${lower(
    input.fileType,
  )} ${corpus.toLowerCase()}`;

  return {
    keywords,
    suggestedKind: inferKind(kindCorpus, input.obligationType),
    summary: buildSummary(input),
  };
};

// Pick the runner: an injected AI labeler if provided, else the deterministic
// one wrapped in a promise. Lets a caller await one signature regardless of mode.
export const createDocumentLabeler = (
  aiLabeler?: AiDocumentLabeler,
): AiDocumentLabeler =>
  aiLabeler ?? ((input) => Promise.resolve(labelObligationDocument(input)));
