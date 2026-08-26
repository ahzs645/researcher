// ── What a rigor check is about, and when it is about nothing ──────────────
//
// SciScore scores a methods section on how the experiment was run: were the
// subjects randomised, was anyone blinded, was sex reported as a biological
// variable, was the group size justified by a power analysis, were the cell
// lines authenticated and tested for mycoplasma, and do the key biological
// resources carry an RRID.
//
// Every one of those questions presupposes a study on living subjects or on
// cultured cells. Asked of an atmospheric-measurement paper they are not
// failures, they are category errors — and a panel that answers seven of them
// "not found" on an aerosol paper teaches the author that the panel is noise,
// which costs more than the seven checks are worth. So a rigor check first
// asks whether the manuscript describes the material it scores, and declines
// when it does not.
//
// Declining is evidence-backed, never a default. Absence of a cue in a
// manuscript that has prose is evidence that the study has no cell lines;
// absence of a cue in a manuscript with nothing in it is absence of
// information, and a check may not turn that into a claim about the study.
// `isJudgeable` is that gate: with nothing to read, the checks report the
// absence the way they always have and their detail line says what would have
// made them apply.
//
// The cues are read over the whole manuscript rather than over a section
// called "Methods", because a section named "Materials and methods",
// "Experimental" or nothing at all is still the methods, and an abstract that
// says "we randomised 240 patients" is evidence too.

import {
  type ScreeningFigure,
  type ScreeningScope,
  type ScreeningSection,
} from './screeningTypes';

// People. "Subjects" alone is not a cue — a review has subjects — so it counts
// only where the sentence does something to them.
const HUMAN_SUBJECT_CUES =
  /\b(?:patients?|participants?|volunteers?|human\s+subjects?|study\s+subjects?|subjects?\s+(?:were|was|received|underwent|gave|completed)|enroll?(?:ed|ment)|recruit(?:ed|ment)|informed\s+consent|(?:in|ex)clusion\s+criteria|healthy\s+controls?)\b/i;

const ANIMAL_SUBJECT_CUES =
  /\b(?:mice|mouse|murine|rats?|rodents?|rabbits?|guinea\s+pigs?|hamsters?|ferrets?|zebrafish|drosophila|xenopus|c\.\s?elegans|macaques?|marmosets?|non-?human\s+primates?|piglets?|IACUC|in\s+vivo|xenograft|animals?\s+(?:were|was|received|used)|animal\s+(?:model|experiments?|stud(?:y|ies)|welfare|facility))\b/i;

const CELL_CULTURE_CUES =
  /\b(?:cell\s+lines?|cultured\s+cells?|cell\s+cultures?|primary\s+(?:cells?|cultures?)|passage\s+number|passaged\b|ATCC|DSMZ|ECACC|JCRB|DMEM|RPMI|fetal\s+(?:bovine|calf)\s+serum|FBS|HeLa|HEK\s?-?293\w*|MCF-?7|A549|Jurkat|U2OS|SH-SY5Y|3T3|CHO\s+cells?|mycoplasma)\b/i;

// The reagents and constructs an RRID is minted for. Deliberately narrow: a
// catalogue number on its own is evidence in the RRID check but not evidence
// that this is a laboratory paper, since instruments have catalogue numbers
// too.
const BIOLOGICAL_RESOURCE_CUES =
  /\b(?:antibod(?:y|ies)|antiser(?:um|a)|immunostain\w*|plasmids?|Addgene|si\s?RNA|sh\s?RNA|sg\s?RNA|CRISPR|knock-?(?:out|in|down)s?|transgenic|transfect\w+|bacterial\s+strains?|mouse\s+strains?|Jackson\s+Laborator(?:y|ies)|RRID)\b/i;

const manuscriptText = (sections: ScreeningSection[]): string =>
  sections.map((section) => section.text).join('\n');

export const screeningScope = (
  sections: ScreeningSection[],
  figures: ScreeningFigure[],
): ScreeningScope => {
  const text = manuscriptText(sections);
  const hasCellCulture = CELL_CULTURE_CUES.test(text);
  const hasAnimalSubjects = ANIMAL_SUBJECT_CUES.test(text);

  return {
    // Something was read. One section with a sentence in it is enough: the
    // claim a declination makes is "this manuscript describes a study of
    // another kind", and that claim needs a manuscript.
    isJudgeable:
      sections.some((section) => section.sentences.length > 0) ||
      figures.length > 0,
    hasLivingSubjects: HUMAN_SUBJECT_CUES.test(text) || hasAnimalSubjects,
    hasCellCulture,
    // A model organism is a key biological resource in its own right, which is
    // why animal work counts here without any reagent being named.
    hasBiologicalResources:
      hasCellCulture ||
      hasAnimalSubjects ||
      BIOLOGICAL_RESOURCE_CUES.test(text),
    hasImageFigures: figures.some((figure) => figure.hasImage),
  };
};
