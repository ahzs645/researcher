const VOWEL_SOUND_REGEXP = /^[aeiou]/i;

// Picks "a" or "an" for a noun based on its leading sound. Object labels are
// plain nouns ("Institution", "Opportunity"), so a vowel-letter check is
// enough — no need for the exception list a general-purpose article picker
// would carry (e.g. "a university", "an hour").
export const indefiniteArticle = (noun: string): 'a' | 'an' =>
  VOWEL_SOUND_REGEXP.test(noun) ? 'an' : 'a';

export const withIndefiniteArticle = (noun: string): string =>
  `${indefiniteArticle(noun)} ${noun}`;
