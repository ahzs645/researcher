// ── Informed consent (SciScore, the non-image half) ────────────────────────
//
// Is informed consent reported as obtained or waived?

import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

const CONSENT_MENTION =
  /\b(?:informed|written|verbal|oral)\s+consent\b|\bconsent\s+(?:to\s+participate|for\s+publication)\b|\bconsent\s+(?:was|were)\b/i;

const CONSENT_SETTLED =
  /\bconsent\b[^.]{0,60}\b(?:obtained|provided|given|granted|secured|waived|signed)\b|\b(?:participants|subjects|patients|parents|guardians)\b[^.]{0,60}\b(?:provided|gave|signed)\b[^.]{0,40}\bconsent\b/i;

export const screenInformedConsent = (
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
