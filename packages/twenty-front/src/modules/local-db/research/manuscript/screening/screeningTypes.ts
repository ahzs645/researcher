// The vocabulary every screener shares: what a check is, what one finding looks
// like to the panel that renders it, and the shape a screener reads. It sits in
// its own module so a screener can depend on the vocabulary without depending
// on the orchestrator that calls it.

import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

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
  identifiers?: string[];
};

export type SentenceClassification = {
  verdict: ScreeningVerdict;
  detail: string;
};
