// The checks the Automated Screening Working Group (BIH Charité) runs over a
// finished paper, moved earlier in the process: they read the manuscript we
// already hold as typed sections instead of re-extracting text from a PDF, so
// a missing statement surfaces while there is still time to write it, and the
// finding can name the section it came from.
//
// Plain text matching is the method, not a shortcut: ODDPub — regexes — beat
// the machine-learning detector at finding open-code statements in the working
// group's own comparison.
//
// Everything here reports; nothing gates. A finding must never block an export,
// and a journal that does not ask for a data statement is not a reason to ship
// without one — which is why these live beside the journal checklist rather
// than inside it.

import { type SectionLike } from './manuscriptTypes';

export type ScreeningVerdict = 'PRESENT' | 'WEAK' | 'ABSENT';

export type ScreeningTool =
  | 'ODDPub'
  | 'limitation-recognizer'
  | 'TrialIdentifier'
  | 'rtransparent'
  | 'SciScore';

export type ScreeningCheckKey =
  | 'OPEN_DATA'
  | 'OPEN_CODE'
  | 'LIMITATIONS'
  | 'TRIAL_REGISTRATION'
  | 'COMPETING_INTERESTS'
  | 'FUNDING'
  | 'PROTOCOL_REGISTRATION'
  | 'ETHICS_APPROVAL'
  | 'INFORMED_CONSENT';

export type ScreeningCheckDefinition = {
  key: ScreeningCheckKey;
  label: string;
  tool: ScreeningTool;
  question: string;
};

export type ScreeningFinding = {
  key: ScreeningCheckKey;
  label: string;
  tool: ScreeningTool;
  verdict: ScreeningVerdict;
  // The sentence the check matched, quoted back so the author judges it rather
  // than trusting the verdict. Empty when nothing matched.
  evidence: string;
  sectionId?: string;
  sectionName?: string;
  // Registration numbers, ethics protocol numbers — recognised, never verified.
  identifiers?: string[];
  detail: string;
};

export type ScreeningManuscript = {
  competingInterests?: string | null;
  sections?: SectionLike[] | null;
};

export const MANUSCRIPT_SCREENING_CHECKS: ScreeningCheckDefinition[] = [
  {
    key: 'OPEN_DATA',
    label: 'Open data statement',
    tool: 'ODDPub',
    question: 'Does the paper say where the data are?',
  },
  {
    key: 'OPEN_CODE',
    label: 'Open code statement',
    tool: 'ODDPub',
    question: 'Does the paper say where the analysis code is?',
  },
  {
    key: 'LIMITATIONS',
    label: 'Limitations acknowledged',
    tool: 'limitation-recognizer',
    question: "Does any section state the study's own limitations?",
  },
  {
    key: 'TRIAL_REGISTRATION',
    label: 'Trial registration',
    tool: 'TrialIdentifier',
    question: 'Is a trial registration identifier given?',
  },
  {
    key: 'COMPETING_INTERESTS',
    label: 'Competing interests statement',
    tool: 'rtransparent',
    question: 'Is there a competing-interests declaration that says something?',
  },
  {
    key: 'FUNDING',
    label: 'Funding statement',
    tool: 'rtransparent',
    question: 'Is the funding of the work declared?',
  },
  {
    key: 'PROTOCOL_REGISTRATION',
    label: 'Protocol registration',
    tool: 'rtransparent',
    question: 'Was the protocol or analysis plan registered in advance?',
  },
  {
    key: 'ETHICS_APPROVAL',
    label: 'Ethics approval',
    tool: 'SciScore',
    question: 'Is an approving body or protocol number named?',
  },
  {
    key: 'INFORMED_CONSENT',
    label: 'Informed consent',
    tool: 'SciScore',
    question: 'Is informed consent reported as obtained or waived?',
  },
];

type ScreeningSection = {
  id: string;
  name: string;
  sectionType: string;
  text: string;
  sentences: string[];
  // A dedicated statement section ("Data availability", "Competing interests")
  // is about this paper by construction, so a citation-shaped sentence inside
  // it is the authors citing their own deposit, not crediting someone else.
  isStatement: boolean;
};

type ScreeningPassage = {
  section: ScreeningSection;
  sentence: string;
};

type ScreeningOutcome = {
  verdict: ScreeningVerdict;
  detail: string;
  evidence: string;
  sectionId?: string;
  sectionName?: string;
  identifiers?: string[];
};

const REFERENCE_SECTION_NAME =
  /^(references|bibliography|works cited|literature cited|reference list)\b/;

const STATEMENT_SECTION_NAME =
  /(availability|availability of|competing interest|conflicts? of interest|declaration|disclosure|funding|financial support|ethic|consent|registration|acknowledge?ment)/;

const STATEMENT_SECTION_TYPES = new Set([
  'DATA_AVAILABILITY',
  'CONFLICTS',
  'ETHICS',
  'FUNDING',
  'ACKNOWLEDGMENTS',
  'AUTHOR_CONTRIBUTIONS',
]);

// Sentence-final punctuation also ends these, so the splitter cannot use the
// full stop alone. Anything whose last word is one of them keeps running.
const SENTENCE_SAFE_ABBREVIATIONS = new Set([
  'al',
  'approx',
  'ca',
  'cf',
  'dept',
  'dr',
  'ed',
  'eds',
  'eq',
  'eqs',
  'etc',
  'fig',
  'figs',
  'inc',
  'jr',
  'ltd',
  'mr',
  'mrs',
  'ms',
  'no',
  'nos',
  'pp',
  'prof',
  'ref',
  'refs',
  'sr',
  'st',
  'univ',
  'vol',
  'vs',
]);

// Editor content is Markdown carrying the composer's own citation and
// cross-reference tokens. Strip the markup but keep both halves of a link: the
// label often names the repository and the target carries the URL.
const markdownToProse = (content: string): string =>
  content
    .replace(/\[[@#][^\]]*\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\(([^)]+)\)/g, '$1 $2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[`*]+/g, '')
    .replace(/\|/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .trim();

const endsSentence = (prefix: string): boolean => {
  const lastWord = /([A-Za-z]+)$/.exec(prefix);
  if (lastWord === null) return true;
  const word = lastWord[1].toLowerCase();
  // A lone letter before the stop is an initial ("A. J. Smith") or the tail of
  // "e.g." — never the end of a sentence in practice.
  return word.length > 1 && !SENTENCE_SAFE_ABBREVIATIONS.has(word);
};

const splitSentences = (text: string): string[] => {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const isBreak = character === '\n';
    if (
      !isBreak &&
      character !== '.' &&
      character !== '!' &&
      character !== '?'
    ) {
      continue;
    }

    let end = index + 1;
    while (end < text.length && /["'’”)\]]/.test(text[end])) end += 1;
    if (!isBreak && end < text.length && !/\s/.test(text[end])) continue;
    if (character === '.' && !endsSentence(text.slice(start, index))) continue;

    const sentence = text.slice(start, end).trim();
    if (sentence.length > 0) sentences.push(sentence);
    start = end;
  }

  const tail = text.slice(start).trim();
  if (tail.length > 0) sentences.push(tail);
  return sentences;
};

export const collectScreeningSections = (
  manuscript: ScreeningManuscript,
): ScreeningSection[] =>
  (manuscript.sections ?? []).flatMap((section) => {
    const name = (section.name ?? '').trim();
    const sectionType = (section.sectionType ?? '').toLocaleUpperCase();
    // A reference list is full of repository URLs, registration numbers and
    // other people's availability statements. None of them are this paper's.
    if (
      sectionType === 'REFERENCES' ||
      REFERENCE_SECTION_NAME.test(name.toLocaleLowerCase())
    ) {
      return [];
    }
    // A section the author has taken out of the export is not in the paper.
    if (section.includeInExport === false) return [];

    const text = markdownToProse(section.content ?? '');
    return [
      {
        id: section.id,
        name,
        sectionType,
        text,
        sentences: splitSentences(text),
        isStatement:
          STATEMENT_SECTION_TYPES.has(sectionType) ||
          STATEMENT_SECTION_NAME.test(name.toLocaleLowerCase()),
      },
    ];
  });

const EVIDENCE_LIMIT = 240;

const truncateEvidence = (sentence: string): string => {
  const trimmed = sentence.replace(/\s+/g, ' ').trim();
  return trimmed.length <= EVIDENCE_LIMIT
    ? trimmed
    : `${trimmed.slice(0, EVIDENCE_LIMIT).trimEnd()}…`;
};

const passageOutcome = (
  passage: ScreeningPassage,
  verdict: ScreeningVerdict,
  detail: string,
  identifiers?: string[],
): ScreeningOutcome => ({
  verdict,
  detail,
  evidence: truncateEvidence(passage.sentence),
  sectionId: passage.section.id,
  sectionName: passage.section.name,
  ...(identifiers === undefined ? {} : { identifiers }),
});

const absent = (detail: string): ScreeningOutcome => ({
  verdict: 'ABSENT',
  detail,
  evidence: '',
});

type SentenceClassification = { verdict: ScreeningVerdict; detail: string };

// A present statement anywhere outranks a weak one anywhere: an author who
// deposited the data and also offered them on request has a data statement.
const strongestSentence = (
  sections: ScreeningSection[],
  classify: (
    sentence: string,
    section: ScreeningSection,
  ) => SentenceClassification | undefined,
): (ScreeningPassage & SentenceClassification) | undefined => {
  let weakest: (ScreeningPassage & SentenceClassification) | undefined;

  for (const section of sections) {
    for (const sentence of section.sentences) {
      const classification = classify(sentence, section);
      if (classification === undefined) continue;
      if (classification.verdict === 'PRESENT') {
        return { section, sentence, ...classification };
      }
      if (weakest === undefined)
        weakest = { section, sentence, ...classification };
    }
  }

  return weakest;
};

// ── Shared cues ────────────────────────────────────────────────────────────

const WEB_LOCATION = /https?:\/\/\S|www\.[a-z0-9-]+\.[a-z]/i;

const DIGITAL_OBJECT_IDENTIFIER = /\b(?:doi\s*:\s*)?10\.\d{4,9}\/\S+/i;

const DATA_REPOSITORY_NAME =
  /\b(zenodo|figshare|dryad|open science framework|osf\.io|dataverse|mendeley data|pangaea|icpsr|gene expression omnibus|arrayexpress|sequence read archive|dbgap|bioproject|european nucleotide archive|proteomexchange|metabolights|physionet|openneuro|uk data service|geo|sra|ena|pride|genbank)\b/i;

const CODE_REPOSITORY_NAME =
  /\b(github|gitlab|bitbucket|zenodo|code ?ocean|software ?heritage|open science framework|osf\.io|cran|bioconductor|pypi|sourceforge|codeberg)\b/i;

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

const DATA_SUBJECT =
  /\b(data|datasets?|data\s?sets?|datafiles?|raw\s+data|source\s+data|underlying\s+data)\b/i;

const CODE_SUBJECT =
  /\b(code|codebase|source\s+code|scripts?|software|analysis\s+pipelines?|workflows?|notebooks?|packages?|programs?)\b/i;

const PROGRAMMING_LANGUAGE =
  /\b(R|Python|MATLAB|Julia|Stata|SAS|SPSS|Fortran|C\+\+|Perl|Jupyter)\b/;

// A sentence crediting other work ("Smith et al. (2019) released their
// pipeline at …") describes their repository. Inside the paper's own
// availability statement the same shape is the authors citing their deposit,
// so the guard applies only outside statement sections.
const OTHER_WORK_ATTRIBUTION = /\bet\s+al\.?\s*[,(]?\s*\(?\d{4}[a-z]?\)?/i;

const isOtherWork = (sentence: string, section: ScreeningSection): boolean =>
  !section.isStatement && OTHER_WORK_ATTRIBUTION.test(sentence);

const hasNamedLocation = (sentence: string): boolean =>
  WEB_LOCATION.test(sentence) ||
  DIGITAL_OBJECT_IDENTIFIER.test(sentence) ||
  ACCESSION_NUMBER.test(sentence) ||
  ACCESSION_WORD.test(sentence) ||
  DEPOSITED_IN.test(sentence) ||
  LOCATION_NOUN.test(sentence);

// ── Open data and open code (ODDPub) ───────────────────────────────────────

const classifyAvailability = ({
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

const declaresDataAvailability = (section: ScreeningSection): boolean =>
  section.sectionType === 'DATA_AVAILABILITY' || /\bdata\b/i.test(section.name);

const screenOpenData = (sections: ScreeningSection[]): ScreeningOutcome => {
  const match = strongestSentence(sections, (sentence, section) => {
    if (isOtherWork(sentence, section)) return undefined;
    // Inside a section whose heading already says "data", a sentence that
    // names only code is the code statement, not the data one — which is
    // exactly how a "Code and data availability" section hides a missing half.
    const subjectFromHeading =
      section.isStatement &&
      declaresDataAvailability(section) &&
      !CODE_SUBJECT.test(sentence);
    return classifyAvailability({
      sentence,
      hasSubject: DATA_SUBJECT.test(sentence) || subjectFromHeading,
      repositoryName: DATA_REPOSITORY_NAME,
      subjectLabel: 'data',
    });
  });

  if (match !== undefined) {
    return passageOutcome(match, match.verdict, match.detail);
  }

  const headingOnly = sections.find(
    (section) => section.isStatement && declaresDataAvailability(section),
  );
  if (headingOnly !== undefined) {
    return absent(
      `“${headingOnly.name}” is present but no sentence in it names a repository, accession number, or DOI for the data.`,
    );
  }
  return absent(
    'No sentence says where the data are. A repository, accession number, or DOI is what screening looks for.',
  );
};

const screenOpenCode = (sections: ScreeningSection[]): ScreeningOutcome => {
  const match = strongestSentence(sections, (sentence, section) => {
    if (isOtherWork(sentence, section)) return undefined;
    return classifyAvailability({
      sentence,
      // A language or package name plus a location is the other shape an open
      // code statement takes ("all Python analyses are archived at …").
      hasSubject:
        CODE_SUBJECT.test(sentence) || PROGRAMMING_LANGUAGE.test(sentence),
      repositoryName: CODE_REPOSITORY_NAME,
      subjectLabel: 'code',
    });
  });

  if (match !== undefined) {
    return passageOutcome(match, match.verdict, match.detail);
  }
  return absent(
    'No sentence says where the analysis code is. A GitHub, GitLab, Zenodo, OSF, or Software Heritage location is what screening looks for.',
  );
};

// ── Limitations (limitation-recognizer) ────────────────────────────────────

const LIMITATIONS_HEADING = /\blimitations?\b/i;

// Ownership is the whole test: "this study has several limitations" is a
// limitations statement, "a known limitation of thermal-optical protocols" is
// a remark about a method the field already knows about.
const OWNED_LIMITATION =
  /\b(?:this|our|the\s+(?:present|current))\s+(?:study|work|analysis|paper|approach|framework|method|case\s+study|investigation)\s+(?:has|had|have|is\s+not\s+without|suffers)\b[^.]{0,80}\blimitation/i;

const LIMITATION_STATEMENT =
  /\b(?:several|some|a\s+number\s+of|important|key|potential|main|principal|two|three|four)\s+limitations?\b|\blimitations?\s+of\s+(?:this|our|the\s+(?:present|current))\s+(?:study|work|analysis|paper)\b|\b(?:this|our|the\s+(?:present|current))\s+(?:study|work|analysis|case\s+study|approach)\s+(?:is|was|are|were)\s+limited\s+by\b|\bwe\s+acknowledge\s+(?:that|several|some)?[^.]{0,40}\blimitation/i;

const screenLimitations = (sections: ScreeningSection[]): ScreeningOutcome => {
  const headingSection = sections.find((section) =>
    LIMITATIONS_HEADING.test(section.name),
  );
  if (headingSection !== undefined) {
    const firstSentence = headingSection.sentences[0];
    if (firstSentence === undefined) {
      return {
        verdict: 'WEAK',
        detail: `“${headingSection.name}” has a heading but no text under it.`,
        evidence: '',
        sectionId: headingSection.id,
        sectionName: headingSection.name,
      };
    }
    return passageOutcome(
      { section: headingSection, sentence: firstSentence },
      'PRESENT',
      'A dedicated limitations section states them.',
    );
  }

  const match = strongestSentence(sections, (sentence) =>
    OWNED_LIMITATION.test(sentence) || LIMITATION_STATEMENT.test(sentence)
      ? {
          verdict: 'PRESENT',
          detail:
            'An explicit limitations sentence, outside a dedicated section.',
        }
      : undefined,
  );

  return match === undefined
    ? absent(
        'No limitations section and no sentence claiming the study’s own limitations. A passing mention of a method’s limitation does not count.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};

// ── Trial registration (TrialIdentifier) ───────────────────────────────────

const TRIAL_REGISTRIES: { registry: string; pattern: RegExp }[] = [
  { registry: 'ClinicalTrials.gov', pattern: /\bNCT\d{8}\b/g },
  { registry: 'ISRCTN', pattern: /\bISRCTN\d{8}\b/g },
  {
    registry: 'Chinese Clinical Trial Registry',
    pattern: /\bChiCTR(?:-[A-Za-z]{2,4})?-?\d{6,12}\b/g,
  },
  {
    registry: 'EU Clinical Trials Register',
    pattern: /\bEudraCT[^.\n]{0,24}?(\d{4}-\d{6}-\d{2})\b/gi,
  },
  {
    registry: 'Pan African Clinical Trial Registry',
    pattern: /\bPACTR\d{15,16}\b/g,
  },
  { registry: 'ANZCTR', pattern: /\bACTRN\d{14}\b/g },
  { registry: 'UMIN-CTR', pattern: /\bUMIN(?:CTR)?\d{9}\b/gi },
  { registry: 'German Clinical Trials Register', pattern: /\bDRKS\d{8}\b/gi },
];

const REGISTRATION_CLAIM =
  /\b(?:trial\s+registration|registered\s+(?:at|with|on|in|prospectively)|registration\s+(?:number|no\.?|id))\b/i;

const screenTrialRegistration = (
  sections: ScreeningSection[],
): ScreeningOutcome => {
  const identifiers: string[] = [];
  const registries: string[] = [];
  let passage: ScreeningPassage | undefined;

  for (const section of sections) {
    for (const sentence of section.sentences) {
      for (const { registry, pattern } of TRIAL_REGISTRIES) {
        for (const found of sentence.matchAll(pattern)) {
          const identifier = found[1] ?? found[0];
          if (identifiers.includes(identifier)) continue;
          identifiers.push(identifier);
          if (!registries.includes(registry)) registries.push(registry);
          if (passage === undefined) passage = { section, sentence };
        }
      }
    }
  }

  if (passage !== undefined) {
    return passageOutcome(
      passage,
      'PRESENT',
      // The identifier is recognised only. Checking it resolves to a real
      // record means calling a registry, and nothing here touches the network.
      `${identifiers.join(', ')} (${registries.join(', ')}). Recognised from the text only — confirming the record exists would need a registry lookup.`,
      identifiers,
    );
  }

  const claim = strongestSentence(sections, (sentence) =>
    REGISTRATION_CLAIM.test(sentence)
      ? {
          verdict: 'WEAK',
          detail:
            'Says the study was registered but gives no identifier screening can recognise.',
        }
      : undefined,
  );

  return claim === undefined
    ? absent(
        'No registration identifier found. Expected only if this reports a clinical trial; nothing is missing otherwise.',
      )
    : passageOutcome(claim, claim.verdict, claim.detail);
};

// ── Declarations: competing interests, funding, protocol (rtransparent) ─────

// "TBD" in a heading is the same absence as an empty section, and worse:
// it survives to submission looking filled in.
const PLACEHOLDER_STATEMENT =
  /^(?:tbd|tba|todo|n\/?a|xx+|\.{2,}|to\s+be\s+(?:added|written|completed|determined|confirmed)|\[[^\]]*\]|<[^>]*>)\.?$/i;

const declarationOutcome = ({
  section,
  detail,
  emptyDetail,
}: {
  section: ScreeningSection;
  detail: string;
  emptyDetail: string;
}): ScreeningOutcome => {
  const firstSentence = section.sentences[0];
  if (firstSentence === undefined || PLACEHOLDER_STATEMENT.test(section.text)) {
    return {
      verdict: 'WEAK',
      detail: emptyDetail,
      evidence: truncateEvidence(section.text),
      sectionId: section.id,
      sectionName: section.name,
    };
  }
  return passageOutcome(
    { section, sentence: firstSentence },
    'PRESENT',
    detail,
  );
};

const COMPETING_INTERESTS_SECTION =
  /competing\s+interests?|conflicts?\s+of\s+interest|declaration\s+of\s+(?:competing|interest)|disclosures?/i;

const screenCompetingInterests = (
  sections: ScreeningSection[],
  manuscript: ScreeningManuscript,
): ScreeningOutcome => {
  const section = sections.find(
    (candidate) =>
      candidate.sectionType === 'CONFLICTS' ||
      COMPETING_INTERESTS_SECTION.test(candidate.name),
  );
  if (section !== undefined) {
    return declarationOutcome({
      section,
      detail: 'A competing-interests declaration is present.',
      emptyDetail:
        'The competing-interests section carries no declaration. “The authors declare no competing interests.” is a statement; an empty heading is not.',
    });
  }

  // The declaration often lives only in the submission checklist, never having
  // been written into a section. It still counts as declared.
  const submissionValue = (manuscript.competingInterests ?? '').trim();
  if (
    submissionValue.length > 0 &&
    !PLACEHOLDER_STATEMENT.test(submissionValue)
  ) {
    return {
      verdict: 'PRESENT',
      detail:
        'Declared on the submission form. It is not in the manuscript text, so a reader of the paper will not see it.',
      evidence: truncateEvidence(submissionValue),
      sectionName: 'Submission checklist',
    };
  }

  return absent(
    'No competing-interests declaration. Journals treat silence as undeclared, not as none.',
  );
};

const FUNDING_SECTION =
  /^funding\b|funding\s+statement|financial\s+support|grant\s+support/i;

const FUNDING_VERB =
  /\b(?:funded|supported|financed|sponsored)\s+by\b|\bfunding\b|\bgrants?\s+(?:no\.?|number|#|agreement|from)\b|\bfinancial\s+support\b|\breceived\s+no\b/i;

// "Supported by" alone also fits "supported by the observations", so a funding
// word has to be in the sentence too.
const FUNDING_SUBJECT =
  /\b(fund\w*|grants?|financial|fellowship|scholarship|award|foundation|council|agency|ministry|sponsor\w*|institutes?\s+of\s+health|NSF|NIH|NSERC|SSHRC|CIHR|ERC|DFG|Wellcome|Horizon\s+20\d\d)\b/i;

const screenFunding = (sections: ScreeningSection[]): ScreeningOutcome => {
  const section = sections.find(
    (candidate) =>
      candidate.sectionType === 'FUNDING' ||
      FUNDING_SECTION.test(candidate.name),
  );
  if (section !== undefined) {
    return declarationOutcome({
      section,
      detail: 'A funding statement is present.',
      emptyDetail:
        'The funding section carries no statement. An explicit “this research received no specific grant” counts; an empty heading does not.',
    });
  }

  // Most papers without a funding heading declare it inside acknowledgements.
  const match = strongestSentence(sections, (sentence) =>
    FUNDING_VERB.test(sentence) && FUNDING_SUBJECT.test(sentence)
      ? {
          verdict: 'PRESENT',
          detail: 'Funding is declared, outside a dedicated funding section.',
        }
      : undefined,
  );

  return match === undefined
    ? absent(
        'No funding statement. Screening expects one either way — including an explicit declaration that the work received none.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};

const PROTOCOL_REGISTRATION =
  /\bpre-?regist\w+\b|\b(?:study|trial|analysis|review|research)\s+protocol\s+(?:was|is|has\s+been)\s+registered\b|\bprotocol\s+(?:was|is|has\s+been)\s+(?:pre-?)?registered\b|\banalysis\s+plan\s+(?:was|is|has\s+been)\s+(?:pre-?)?registered\b|\bregistered\s+(?:the\s+)?(?:study\s+)?protocol\b|\bPROSPERO\b|\bCRD\d{8,}\b|\bosf\.io\/\w+/i;

const screenProtocolRegistration = (
  sections: ScreeningSection[],
  trialRegistration: ScreeningOutcome,
): ScreeningOutcome => {
  const match = strongestSentence(sections, (sentence) =>
    PROTOCOL_REGISTRATION.test(sentence)
      ? {
          verdict: 'PRESENT',
          detail: 'The protocol or analysis plan is reported as registered.',
        }
      : undefined,
  );
  if (match !== undefined) {
    return passageOutcome(match, match.verdict, match.detail);
  }

  // Registering a trial is not the same statement as registering a protocol,
  // but an author who did one has usually done the other — say so rather than
  // reporting a flat absence next to a found NCT number.
  const trialIdentifiers = trialRegistration.identifiers ?? [];
  return absent(
    trialIdentifiers.length > 0
      ? `No protocol or analysis-plan registration statement. ${trialIdentifiers.join(', ')} covers the trial's own registration.`
      : 'No protocol or analysis-plan registration statement. Expected for pre-registered studies and systematic reviews.',
  );
};

// ── Ethics and consent (SciScore, the non-image half) ──────────────────────

const ETHICS_APPROVAL =
  /\bapproved\s+by\b|\bethic(?:s|al)\s+(?:committee|board|approval|review|clearance)\b|\binstitutional\s+review\s+board\b|\bIRB\b|\bREB\b|\bIACUC\b|\bDeclaration\s+of\s+Helsinki\b|\bethics\s+application\b/i;

const APPROVING_BODY =
  /\b(committee|board|IRB|REB|IACUC|university|hospital|institute|institution|ministry|authority|college|faculty|centre|center|agency|council)\b/i;

const ETHICS_PROTOCOL_NUMBER =
  /\b(?:protocol|approval|reference|ethics|study|IRB|REB|permit)\s*(?:no\.?|number|code|id)?\s*[:#]?\s*([A-Za-z]*\d[\w./-]{2,})\b/i;

const screenEthicsApproval = (
  sections: ScreeningSection[],
): ScreeningOutcome => {
  const match = strongestSentence(sections, (sentence) => {
    if (!ETHICS_APPROVAL.test(sentence)) return undefined;
    const number = ETHICS_PROTOCOL_NUMBER.exec(sentence);
    if (number !== null) {
      return {
        verdict: 'PRESENT',
        detail: `Approval recorded with protocol number ${number[1]}.`,
      };
    }
    return APPROVING_BODY.test(sentence)
      ? {
          verdict: 'PRESENT',
          detail: 'Approval is attributed to a named body.',
        }
      : {
          verdict: 'WEAK',
          detail:
            'Says approval was obtained without naming the approving body or a protocol number.',
        };
  });

  if (match === undefined) {
    return absent(
      'No ethics approval statement. Expected only for work involving humans or animals; nothing is missing otherwise.',
    );
  }

  const number = ETHICS_PROTOCOL_NUMBER.exec(match.sentence);
  return passageOutcome(
    match,
    match.verdict,
    match.detail,
    number === null ? undefined : [number[1]],
  );
};

const CONSENT_MENTION =
  /\b(?:informed|written|verbal|oral)\s+consent\b|\bconsent\s+(?:to\s+participate|for\s+publication)\b|\bconsent\s+(?:was|were)\b/i;

const CONSENT_SETTLED =
  /\bconsent\b[^.]{0,60}\b(?:obtained|provided|given|granted|secured|waived|signed)\b|\b(?:participants|subjects|patients|parents|guardians)\b[^.]{0,60}\b(?:provided|gave|signed)\b[^.]{0,40}\bconsent\b/i;

const screenInformedConsent = (
  sections: ScreeningSection[],
): ScreeningOutcome => {
  const match = strongestSentence(sections, (sentence) => {
    if (!CONSENT_MENTION.test(sentence)) return undefined;
    // A documented waiver is a consent statement — the ethics committee made
    // the call and the paper says so.
    return CONSENT_SETTLED.test(sentence)
      ? {
          verdict: 'PRESENT',
          detail: 'Consent is reported as obtained or formally waived.',
        }
      : {
          verdict: 'WEAK',
          detail:
            'Mentions consent without saying it was obtained from participants or waived.',
        };
  });

  return match === undefined
    ? absent(
        'No informed-consent statement. Expected only for work involving human participants; nothing is missing otherwise.',
      )
    : passageOutcome(match, match.verdict, match.detail);
};

export const screenManuscript = (
  manuscript: ScreeningManuscript,
): ScreeningFinding[] => {
  const sections = collectScreeningSections(manuscript);
  const trialRegistration = screenTrialRegistration(sections);
  const outcomes: Record<ScreeningCheckKey, ScreeningOutcome> = {
    OPEN_DATA: screenOpenData(sections),
    OPEN_CODE: screenOpenCode(sections),
    LIMITATIONS: screenLimitations(sections),
    TRIAL_REGISTRATION: trialRegistration,
    COMPETING_INTERESTS: screenCompetingInterests(sections, manuscript),
    FUNDING: screenFunding(sections),
    PROTOCOL_REGISTRATION: screenProtocolRegistration(
      sections,
      trialRegistration,
    ),
    ETHICS_APPROVAL: screenEthicsApproval(sections),
    INFORMED_CONSENT: screenInformedConsent(sections),
  };

  return MANUSCRIPT_SCREENING_CHECKS.map(({ key, label, tool }) => ({
    key,
    label,
    tool,
    ...outcomes[key],
  }));
};

export type ScreeningSummary = {
  present: number;
  weak: number;
  absent: number;
};

export const summarizeScreeningFindings = (
  findings: ScreeningFinding[],
): ScreeningSummary => ({
  present: findings.filter(({ verdict }) => verdict === 'PRESENT').length,
  weak: findings.filter(({ verdict }) => verdict === 'WEAK').length,
  absent: findings.filter(({ verdict }) => verdict === 'ABSENT').length,
});
