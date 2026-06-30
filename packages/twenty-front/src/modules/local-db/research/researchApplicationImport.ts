// Grant/proposal document import. Reuses the manuscript importer's engine
// (`parseMarkdownDocument` / `parseWordDocument`) so an existing proposal .docx
// can be brought into the Funding pipeline as `applicationSection` records —
// closing the "no DOCX import for proposals" gap with the same code path the
// manuscript composer uses. Pure and unit-tested; the I/O (file read / unzip)
// is the shared `manuscriptDocxFile` glue.

import {
  parseMarkdownDocument,
  parseWordDocument,
  type ImportedDocument,
} from './manuscript/manuscriptDocImport';

export type ApplicationSectionDraft = {
  name: string;
  sectionType: string;
  content: string;
  wordCount: number;
  status: string;
  orderIndex: number;
};

// Heading → canonical grant-application content type (CANONICAL_CONTENT_OPTIONS).
const APPLICATION_RULES: { sectionType: string; pattern: RegExp }[] = [
  { sectionType: 'LAY_SUMMARY', pattern: /lay summary|plain[- ]language|public summary/ },
  { sectionType: 'ABSTRACT', pattern: /^(abstract|summary|project summary)\b/ },
  { sectionType: 'OBJECTIVES', pattern: /objectives?|aims?|goals?|research questions?|hypothes[ei]s/ },
  { sectionType: 'METHODOLOGY', pattern: /methodolog|^methods?\b|approach|research plan|study design|work\s*plan/ },
  { sectionType: 'IMPACT', pattern: /impact|significance|benefits?|knowledge (translation|mobilization)|outcomes?|importance/ },
  { sectionType: 'BUDGET_JUSTIFICATION', pattern: /budget|justification of (funds|costs)|costs?\b/ },
  { sectionType: 'TIMELINE', pattern: /timeline|work\s*plan|milestones?|schedule|gantt/ },
  { sectionType: 'TEAM', pattern: /team|personnel|expertise|qualifications|investigators?|collaborators?/ },
  { sectionType: 'BIO', pattern: /biograph|biosketch|\bcv\b|curriculum vitae|track record/ },
  { sectionType: 'EDI', pattern: /\bedi\b|equity|diversity|inclusion|sex and gender/ },
  { sectionType: 'BACKGROUND', pattern: /background|rationale|literature|state of the art|context|introduction/ },
  { sectionType: 'BIBLIOGRAPHY', pattern: /references|bibliography|works cited|literature cited/ },
];

export const classifyApplicationHeading = (heading: string): string => {
  const normalized = heading
    .replace(/^\s*(\d+(\.\d+)*|[ivxlcdm]+|[a-z])[.):]\s+/i, '')
    .trim()
    .toLowerCase();
  return (
    APPLICATION_RULES.find((rule) => rule.pattern.test(normalized))
      ?.sectionType ?? 'OTHER'
  );
};

// Map a parsed document to application-section drafts (heading → canonical type,
// body → content). The parsing/classification is shared with the manuscript
// importer; only the target field shape differs.
export const applicationSectionDraftsFromDocument = (
  document: ImportedDocument,
): ApplicationSectionDraft[] =>
  document.sections.map((section) => ({
    name: section.name,
    sectionType: classifyApplicationHeading(section.name),
    content: section.content,
    wordCount: section.wordCount,
    status: 'DRAFTING',
    orderIndex: section.orderIndex,
  }));

export const applicationSectionsFromMarkdown = (
  text: string,
): ApplicationSectionDraft[] =>
  applicationSectionDraftsFromDocument(parseMarkdownDocument(text));

export const applicationSectionsFromWordXml = (
  documentXml: string,
): ApplicationSectionDraft[] =>
  applicationSectionDraftsFromDocument(parseWordDocument(documentXml));
