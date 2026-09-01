// ── Protocol registration (rtransparent) ───────────────────────────────────
//
// Was the protocol or analysis plan registered in advance? Separate from the
// trial's own registration, which is why this screener is told about it.

import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

const PROTOCOL_REGISTRATION =
  /\bpre-?regist\w+\b|\b(?:study|trial|analysis|review|research)\s+protocol\s+(?:was|is|has\s+been)\s+registered\b|\bprotocol\s+(?:was|is|has\s+been)\s+(?:pre-?)?registered\b|\banalysis\s+plan\s+(?:was|is|has\s+been)\s+(?:pre-?)?registered\b|\bregistered\s+(?:the\s+)?(?:study\s+)?protocol\b|\bPROSPERO\b|\bCRD\d{8,}\b|\bosf\.io\/\w+/i;

export const screenProtocolRegistration = (
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
