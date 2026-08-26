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
//
// One screener per check lives in ./screening, each owning the cues it reads.
// This file is the catalogue, the reading of the manuscript into screenable
// sections and figures, and the run that puts the two together.
//
// Not every check is about every manuscript. The SciScore rigor criteria are
// about experiments on living subjects and cultured cells, and asked of an
// atmospheric-measurement paper they are category errors rather than failures.
// A check that is not about this manuscript declines: it produces no finding
// and says why, in a `ScreeningDeclination` this file collects alongside the
// findings. `rigorScope` carries the reasoning; `screeningTypes` carries the
// argument for why that is not a fourth verdict.

import { isNonEmptyString } from '@sniptt/guards';

import { screenBlinding } from './screening/blinding';
import { screenCellLineAuthentication } from './screening/cellLineAuthentication';
import { screenCompetingInterests } from './screening/competingInterestsStatement';
import { screenEthicsApproval } from './screening/ethicsApproval';
import { screenFigureDocumentation } from './screening/figureDocumentation';
import { screenFunding } from './screening/fundingStatement';
import { screenInformedConsent } from './screening/informedConsent';
import { screenLimitations } from './screening/limitationsStatement';
import { screenMycoplasmaTesting } from './screening/mycoplasmaTesting';
import { screenOpenCode } from './screening/openCodeStatement';
import { screenOpenData } from './screening/openDataStatement';
import { screenPowerAnalysis } from './screening/powerAnalysis';
import { screenProtocolRegistration } from './screening/protocolRegistration';
import { screenRandomisation } from './screening/randomisation';
import { screenResourceIdentifiers } from './screening/resourceIdentifiers';
import { screenSexAsBiologicalVariable } from './screening/sexAsBiologicalVariable';
import { screenTrialRegistration } from './screening/trialRegistration';
import { isDeclined } from './screening/screeningOutcomes';
import { screeningScope } from './screening/rigorScope';
import {
  type ScreeningCheckDefinition,
  type ScreeningCheckKey,
  type ScreeningDeclination,
  type ScreeningFigure,
  type ScreeningFinding,
  type ScreeningManuscript,
  type ScreeningResult,
  type ScreeningRun,
  type ScreeningSection,
} from './screening/screeningTypes';

export {
  type ScreeningCheckDefinition,
  type ScreeningCheckKey,
  type ScreeningDeclination,
  type ScreeningFigure,
  type ScreeningFinding,
  type ScreeningManuscript,
  type ScreeningRun,
  type ScreeningScope,
  type ScreeningTool,
  type ScreeningVerdict,
} from './screening/screeningTypes';

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
  {
    key: 'RANDOMISATION',
    label: 'Randomisation of subjects',
    tool: 'SciScore',
    question: 'Were subjects assigned to their groups at random?',
  },
  {
    key: 'BLINDING',
    label: 'Blinding',
    tool: 'SciScore',
    question: 'Does the paper say who was blinded to the group allocation?',
  },
  {
    key: 'SEX_AS_BIOLOGICAL_VARIABLE',
    label: 'Sex as a biological variable',
    tool: 'SciScore',
    question: 'Is the sex of the subjects reported?',
  },
  {
    key: 'POWER_ANALYSIS',
    label: 'Power analysis',
    tool: 'SciScore',
    question: 'Is the group size justified by a power calculation?',
  },
  {
    key: 'CELL_LINE_AUTHENTICATION',
    label: 'Cell line authentication',
    tool: 'SciScore',
    question: 'Are the cell lines reported as authenticated?',
  },
  {
    key: 'MYCOPLASMA_TESTING',
    label: 'Mycoplasma contamination check',
    tool: 'SciScore',
    question: 'Are the cultured cells reported as tested for mycoplasma?',
  },
  {
    key: 'RESOURCE_IDENTIFIERS',
    label: 'Resource identifiers (RRID)',
    tool: 'SciScore',
    question: 'Do the key biological resources carry an RRID?',
  },
  {
    key: 'FIGURE_DOCUMENTATION',
    label: 'Figure captions and alt text',
    tool: 'composer',
    question: 'Does every figure image carry a caption and alternative text?',
  },
];

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
    // Nor is an alternative version of one. Screening runs over the records
    // rather than the assembled bundle, so it is the one reader that has to
    // drop version rows itself — otherwise a paper with a short abstract for
    // one journal would be screened as though it had two abstracts, and every
    // statement written twice would count twice.
    if (isNonEmptyString(section.variantOfId)) return [];

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

// Figures are read the same way sections are: into a shape a check can match
// over without knowing where the record came from. An image check gets the
// data URL; this check gets the caption and the alt text.
export const collectScreeningFigures = (
  manuscript: ScreeningManuscript,
): ScreeningFigure[] =>
  [...(manuscript.figures ?? [])]
    .sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0))
    .map((figure, index) => {
      const name = (figure.name ?? '').trim();
      const refKey = (figure.refKey ?? '').trim();
      const assetKind = (figure.assetKind ?? 'FIGURE').toLocaleUpperCase();
      const imageUrl = isNonEmptyString(figure.imageUrl)
        ? figure.imageUrl.trim()
        : null;

      return {
        id: figure.id,
        label: isNonEmptyString(name)
          ? name
          : isNonEmptyString(refKey)
            ? refKey
            : `${assetKind === 'TABLE' ? 'Table' : 'Figure'} ${index + 1}`,
        assetKind,
        caption: markdownToProse(figure.caption ?? ''),
        altText: (figure.altText ?? '').trim(),
        imageUrl,
        // A Mermaid diagram has no image until export draws it, and is still a
        // picture the reader will see.
        hasImage: imageUrl !== null || isNonEmptyString(figure.diagramSource),
      };
    });

// The full run: what every check said, and which checks declined to say
// anything. `screenManuscript` is the findings half of this, kept as it was
// for the callers that only want rows.
export const runManuscriptScreening = (
  manuscript: ScreeningManuscript,
): ScreeningRun => {
  const sections = collectScreeningSections(manuscript);
  const figures = collectScreeningFigures(manuscript);
  const scope = screeningScope(sections, figures);
  const trialRegistration = screenTrialRegistration(sections);
  const results: Record<ScreeningCheckKey, ScreeningResult> = {
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
    RANDOMISATION: screenRandomisation(sections, scope),
    BLINDING: screenBlinding(sections, scope),
    SEX_AS_BIOLOGICAL_VARIABLE: screenSexAsBiologicalVariable(sections, scope),
    POWER_ANALYSIS: screenPowerAnalysis(sections, scope),
    CELL_LINE_AUTHENTICATION: screenCellLineAuthentication(sections, scope),
    MYCOPLASMA_TESTING: screenMycoplasmaTesting(sections, scope),
    RESOURCE_IDENTIFIERS: screenResourceIdentifiers(sections, scope),
    FIGURE_DOCUMENTATION: screenFigureDocumentation(figures, scope),
  };

  const findings: ScreeningFinding[] = [];
  const declinations: ScreeningDeclination[] = [];
  for (const { key, label, tool } of MANUSCRIPT_SCREENING_CHECKS) {
    const result = results[key];
    if (isDeclined(result)) {
      declinations.push({ key, label, tool, reason: result.reason });
      continue;
    }
    findings.push({ key, label, tool, ...result });
  }

  return { findings, declinations };
};

export const screenManuscript = (
  manuscript: ScreeningManuscript,
): ScreeningFinding[] => runManuscriptScreening(manuscript).findings;

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
