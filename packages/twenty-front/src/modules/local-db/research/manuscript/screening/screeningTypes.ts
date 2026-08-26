// The vocabulary every screener shares: what a check is, what one finding looks
// like to the panel that renders it, and the shape a screener reads. It sits in
// its own module so a screener can depend on the vocabulary without depending
// on the orchestrator that calls it.

import {
  type FigureLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

// Three answers to one question: does the paper say this? A check that is not
// about this manuscript at all answers a different question and does not get a
// verdict — see `ScreeningDeclined`.
export type ScreeningVerdict = 'PRESENT' | 'WEAK' | 'ABSENT';

export type ScreeningTool =
  | 'ODDPub'
  | 'limitation-recognizer'
  | 'TrialIdentifier'
  | 'rtransparent'
  | 'SciScore'
  // Not one of the BIH Charité tools. The figure check is ours, and the label
  // says so rather than borrowing a name that would misdescribe it.
  | 'composer';

export type ScreeningCheckKey =
  | 'OPEN_DATA'
  | 'OPEN_CODE'
  | 'LIMITATIONS'
  | 'TRIAL_REGISTRATION'
  | 'COMPETING_INTERESTS'
  | 'FUNDING'
  | 'PROTOCOL_REGISTRATION'
  | 'ETHICS_APPROVAL'
  | 'INFORMED_CONSENT'
  | 'RANDOMISATION'
  | 'BLINDING'
  | 'SEX_AS_BIOLOGICAL_VARIABLE'
  | 'POWER_ANALYSIS'
  | 'CELL_LINE_AUTHENTICATION'
  | 'MYCOPLASMA_TESTING'
  | 'RESOURCE_IDENTIFIERS'
  | 'FIGURE_DOCUMENTATION';

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
  // A finding names where it came from. Screening was section-shaped
  // everywhere, and an image check has no section to point at, so a check that
  // reads figures names the figure instead. Two optional pairs rather than one
  // tagged union: every existing reader gets `sectionName` off the finding
  // directly, and a union would have rewritten all of them to carry no new
  // information.
  figureId?: string;
  figureLabel?: string;
  // Registration numbers, ethics protocol numbers, RRIDs — recognised from the
  // text. Verifying one against its registry is a network call and lives in
  // `screening/trialVerification`, never here.
  identifiers?: string[];
  detail: string;
};

export type ScreeningManuscript = {
  competingInterests?: string | null;
  sections?: SectionLike[] | null;
  // The figure axis. Absent means the caller did not offer figures, which is
  // not the same as a manuscript that has none — `screenManuscript` keeps
  // working for the callers that pass sections alone.
  figures?: FigureLike[] | null;
};

export type ScreeningSection = {
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

// A figure as a screener sees it: what it is called, what it says about
// itself, and the image an image check would decode. JetFighter reads the
// pixels for rainbow colour maps and Barzooka reads them for bar graphs of
// continuous data; this axis only has to carry them there.
export type ScreeningFigure = {
  id: string;
  // What a finding calls this figure: its own name, else its cross-reference
  // key, else its position in the paper.
  label: string;
  assetKind: string;
  caption: string;
  altText: string;
  // The data URL (or remote URL) the image lives at, null when the asset
  // carries no picture of its own.
  imageUrl: string | null;
  // A Mermaid diagram has no image until export draws it, and is still a
  // picture the reader will see.
  hasImage: boolean;
};

export type ScreeningPassage = {
  section: ScreeningSection;
  sentence: string;
};

export type ScreeningOutcome = {
  verdict: ScreeningVerdict;
  detail: string;
  evidence: string;
  sectionId?: string;
  sectionName?: string;
  figureId?: string;
  figureLabel?: string;
  identifiers?: string[];
};

// A check refusing to give a verdict because the manuscript is not about the
// thing it scores. Deliberately not a fourth `ScreeningVerdict`: PRESENT, WEAK
// and ABSENT answer "does the paper say this", and this answers "should it
// have". Putting them in one union would make every reader treat the second as
// an answer to the first — the summary would count it, the readiness line
// would list it as a gap, and the panel would show seven grey rows on an
// aerosol paper, which is exactly the noise that teaches an author to stop
// reading the panel.
export type ScreeningDeclined = {
  applies: false;
  reason: string;
};

export type ScreeningResult = ScreeningOutcome | ScreeningDeclined;

// A declination is still reported, just not as a finding: dropping it silently
// would hide that the check ran at all, and an author whose paper is a trial
// deserves to know whether blinding was screened for.
export type ScreeningDeclination = {
  key: ScreeningCheckKey;
  label: string;
  tool: ScreeningTool;
  reason: string;
};

export type ScreeningRun = {
  findings: ScreeningFinding[];
  declinations: ScreeningDeclination[];
};

// What the manuscript is made of, worked out once per run so seventeen checks
// do not each re-read every sentence. `isJudgeable` is the gate on every
// declination — see `rigorScope`.
export type ScreeningScope = {
  isJudgeable: boolean;
  hasLivingSubjects: boolean;
  hasCellCulture: boolean;
  hasBiologicalResources: boolean;
  hasImageFigures: boolean;
};

export type SentenceClassification = {
  verdict: ScreeningVerdict;
  detail: string;
};
