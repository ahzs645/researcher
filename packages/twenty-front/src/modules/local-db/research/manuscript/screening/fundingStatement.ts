// ── Funding (rtransparent) ─────────────────────────────────────────────────
//
// Is the funding of the work declared? Declaring none counts; saying nothing
// does not.

import { declarationOutcome } from './declarationSections';
import { absent, passageOutcome, strongestSentence } from './screeningOutcomes';
import { type ScreeningOutcome, type ScreeningSection } from './screeningTypes';

const FUNDING_SECTION =
  /^funding\b|funding\s+statement|financial\s+support|grant\s+support/i;

const FUNDING_VERB =
  /\b(?:funded|supported|financed|sponsored)\s+by\b|\bfunding\b|\bgrants?\s+(?:no\.?|number|#|agreement|from)\b|\bfinancial\s+support\b|\breceived\s+no\b/i;

// "Supported by" alone also fits "supported by the observations", so a funding
// word has to be in the sentence too.
const FUNDING_SUBJECT =
  /\b(fund\w*|grants?|financial|fellowship|scholarship|award|foundation|council|agency|ministry|sponsor\w*|institutes?\s+of\s+health|NSF|NIH|NSERC|SSHRC|CIHR|ERC|DFG|Wellcome|Horizon\s+20\d\d)\b/i;

export const screenFunding = (
  sections: ScreeningSection[],
): ScreeningOutcome => {
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
