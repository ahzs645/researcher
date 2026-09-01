// ── Ethics approval (SciScore, the non-image half) ─────────────────────────
//
// Is an approving body or protocol number named? "Ethics approval was obtained"
// on its own is the weak case: nothing in it can be looked up.

import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

const ETHICS_APPROVAL =
  /\bapproved\s+by\b|\bethic(?:s|al)\s+(?:committee|board|approval|review|clearance)\b|\binstitutional\s+review\s+board\b|\bIRB\b|\bREB\b|\bIACUC\b|\bDeclaration\s+of\s+Helsinki\b|\bethics\s+application\b/i;

const APPROVING_BODY =
  /\b(committee|board|IRB|REB|IACUC|university|hospital|institute|institution|ministry|authority|college|faculty|centre|center|agency|council)\b/i;

const ETHICS_PROTOCOL_NUMBER =
  /\b(?:protocol|approval|reference|ethics|study|IRB|REB|permit)\s*(?:no\.?|number|code|id)?\s*[:#]?\s*([A-Za-z]*\d[\w./-]{2,})\b/i;

export const screenEthicsApproval = (
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
