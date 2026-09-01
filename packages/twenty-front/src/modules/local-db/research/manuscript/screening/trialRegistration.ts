// ── Trial registration (TrialIdentifier) ───────────────────────────────────
//
// Is a trial registration identifier given? The registry patterns are the
// check: a claim of registration without a recognisable number is only a claim.

import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import {
  type ScreeningOutcome,
  type ScreeningPassage,
  type ScreeningSection,
} from './screeningTypes';

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

export const screenTrialRegistration = (
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
