// ── Shared cues ────────────────────────────────────────────────────────────
//
// The cues both ODDPub screeners read, plus the one classifier that reads them.
// Splitting the file showed every cue under this banner is used by the data and
// code screeners and by nothing else, so this module is theirs: a cue only one
// of them consults — a repository list, a subject word — lives in that
// screener's own module instead.

import {
  type ScreeningSection,
  type SentenceClassification,
} from './screeningTypes';

const WEB_LOCATION = /https?:\/\/\S|www\.[a-z0-9-]+\.[a-z]/i;

const DIGITAL_OBJECT_IDENTIFIER = /\b(?:doi\s*:\s*)?10\.\d{4,9}\/\S+/i;

const ACCESSION_NUMBER =
  /\b(?:GSE|GSM|SRR|SRP|SRX|PRJNA|PRJEB|PRJDB|ERP|DRP|PXD|EGAS|EGAD|E-MTAB|E-GEOD|phs)\d{3,}\b/;

const ACCESSION_WORD = /\baccession\s+(?:numbers?|codes?|ids?|no\.?)\b/i;

const DEPOSITED_IN = /\bdeposit(?:ed|s)?\s+(?:in|at|with|into|to)\b/i;

// A bare "archive" is usually the verb ("should archive an immutable
// release"), so only the noun phrases that can only be a place count.
const LOCATION_NOUN =
  /\b(repositor(?:y|ies)|data\s?bases?|data\s+(?:centre|center)|data\s+portal|data\s+archive|public\s+archive|digital\s+archive)\b/i;

// "Available at" points somewhere; "available from the corresponding author"
// points at a person, which is the case reviewers now read as no statement.
const AVAILABLE_AT =
  /\bavailable\s+(?:at|online\s+at|via|through|on\s+request\s+at)\b/i;

// "Published" is left out on purpose: "the published analysis" is every other
// sentence in a manuscript, and a genuinely published dataset still trips one
// of the repository, DOI or accession cues.
const AVAILABILITY_PHRASE =
  /\b(available|availability|accessible|archived|deposited|obtainable|released|shared|hosted|can\s+be\s+(?:found|downloaded|accessed|obtained|retrieved)|may\s+be\s+(?:found|downloaded|accessed|obtained)|(?:is|are)\s+(?:provided|included|contained|presented)|we\s+provide)\b/i;

const RESTRICTED_ACCESS =
  /\b(?:up)?on\s+(?:reasonable\s+)?request\b|\bfrom\s+the\s+corresponding\s+author\b|\bfrom\s+the\s+authors?\s+(?:up)?on\b|\bby\s+request\b|\bcontact\s+the\s+corresponding\s+author\b/i;

const SUPPLEMENT_LOCATION =
  /\b(supplement(?:ary|al)?(?:\s+(?:materials?|information|data|files?|tables?|appendix))?|supporting\s+information)\b/i;

// Shared because both screeners need it in opposite directions: the code screen
// looks for it, and the data screen uses it to tell the two halves of a
// combined "Code and data availability" section apart.
export const CODE_SUBJECT =
  /\b(code|codebase|source\s+code|scripts?|software|analysis\s+pipelines?|workflows?|notebooks?|packages?|programs?)\b/i;

// A sentence crediting other work ("Smith et al. (2019) released their
// pipeline at …") describes their repository. Inside the paper's own
// availability statement the same shape is the authors citing their deposit,
// so the guard applies only outside statement sections.
const OTHER_WORK_ATTRIBUTION = /\bet\s+al\.?\s*[,(]?\s*\(?\d{4}[a-z]?\)?/i;

export const isOtherWork = (
  sentence: string,
  section: ScreeningSection,
): boolean => !section.isStatement && OTHER_WORK_ATTRIBUTION.test(sentence);

const hasNamedLocation = (sentence: string): boolean =>
  WEB_LOCATION.test(sentence) ||
  DIGITAL_OBJECT_IDENTIFIER.test(sentence) ||
  ACCESSION_NUMBER.test(sentence) ||
  ACCESSION_WORD.test(sentence) ||
  DEPOSITED_IN.test(sentence) ||
  LOCATION_NOUN.test(sentence);

// The verdict ladder both ODDPub screeners climb; only the subject test and the
// repository list differ between data and code, so they are parameters.
export const classifyAvailability = ({
  sentence,
  hasSubject,
  repositoryName,
  subjectLabel,
}: {
  sentence: string;
  hasSubject: boolean;
  repositoryName: RegExp;
  subjectLabel: string;
}): SentenceClassification | undefined => {
  if (!hasSubject) return undefined;
  if (!AVAILABILITY_PHRASE.test(sentence) && !DEPOSITED_IN.test(sentence)) {
    return undefined;
  }

  if (hasNamedLocation(sentence) || repositoryName.test(sentence)) {
    return {
      verdict: 'PRESENT',
      detail: `Names where the ${subjectLabel} can be found.`,
    };
  }
  // Checked before the looser "available at" so that a request-only sentence
  // can never be read as a location.
  if (RESTRICTED_ACCESS.test(sentence)) {
    return {
      verdict: 'WEAK',
      detail: `Offers the ${subjectLabel} on request rather than naming a location. Reviewers read this as no availability statement.`,
    };
  }
  if (SUPPLEMENT_LOCATION.test(sentence)) {
    return {
      verdict: 'WEAK',
      detail: `Points at the supplement rather than a repository; screening counts supplementary files separately from open ${subjectLabel}.`,
    };
  }
  if (AVAILABLE_AT.test(sentence)) {
    return {
      verdict: 'PRESENT',
      detail: `States where the ${subjectLabel} are available.`,
    };
  }
  return undefined;
};
