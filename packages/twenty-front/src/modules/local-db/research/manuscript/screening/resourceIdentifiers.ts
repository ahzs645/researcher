// ── Resource identifiers, RRIDs (SciScore) ─────────────────────────────────
//
// Do the key biological resources — antibodies, cell lines, organisms,
// plasmids — carry an RRID? SciScore scores the proportion that do. Screening
// cannot count the resources reliably from prose, so it reports what it can
// stand behind: how many RRIDs the paper carries, and whether resources are
// identified by catalogue number alone, which is what an RRID exists to
// replace.

import {
  absent,
  notApplicable,
  passageOutcome,
  strongestSentence,
} from './screeningOutcomes';
import {
  type ScreeningPassage,
  type ScreeningResult,
  type ScreeningScope,
  type ScreeningSection,
} from './screeningTypes';

// RRID:AB_2298772, RRID:CVCL_0030, RRID:SCR_002798, RRID:IMSR_JAX:000664 —
// the authority prefix, an underscore, then the authority's own identifier,
// which may itself carry a colon.
const RRID_PATTERN = /\bRRID\s*:\s*([A-Za-z]+_[A-Za-z0-9][\w.:-]*)/g;

const CATALOGUE_ONLY =
  /\bcatalog(?:ue)?\s*(?:no\.?|number|#)\s*[:#]?\s*[A-Za-z0-9][\w.-]*|\bcat\.?\s*(?:no\.?|#)\s*[:#]?\s*[A-Za-z0-9][\w.-]*|\bclone\s+[A-Za-z0-9][\w.-]*\b/i;

const trimIdentifier = (value: string): string => value.replace(/[.,;)]+$/, '');

export const screenResourceIdentifiers = (
  sections: ScreeningSection[],
  scope: ScreeningScope,
): ScreeningResult => {
  if (scope.isJudgeable && !scope.hasBiologicalResources) {
    return notApplicable(
      'No antibodies, cell lines, model organisms or plasmids are described, so there are no key biological resources to identify.',
    );
  }

  const identifiers: string[] = [];
  let passage: ScreeningPassage | undefined;
  for (const section of sections) {
    for (const sentence of section.sentences) {
      for (const found of sentence.matchAll(RRID_PATTERN)) {
        const identifier = `RRID:${trimIdentifier(found[1])}`;
        if (identifiers.includes(identifier)) continue;
        identifiers.push(identifier);
        if (passage === undefined) passage = { section, sentence };
      }
    }
  }

  if (passage !== undefined) {
    return passageOutcome(
      passage,
      'PRESENT',
      `${identifiers.length} RRID${identifiers.length === 1 ? '' : 's'} found. Screening cannot tell how many resources went unidentified, so this is a floor rather than a proportion.`,
      identifiers,
    );
  }

  const catalogued = strongestSentence(sections, (sentence) =>
    CATALOGUE_ONLY.test(sentence)
      ? {
          verdict: 'WEAK',
          detail:
            'Resources are identified by catalogue or clone number only. An RRID survives a vendor renaming the product; a catalogue number does not.',
        }
      : undefined,
  );

  return catalogued === undefined
    ? absent(
        'No RRIDs found. Expected for antibodies, cell lines, model organisms and plasmids.',
      )
    : passageOutcome(catalogued, catalogued.verdict, catalogued.detail);
};
