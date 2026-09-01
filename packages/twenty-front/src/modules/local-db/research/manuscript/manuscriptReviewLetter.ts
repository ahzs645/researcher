// Splitting a journal decision letter into the reviewer points an author has
// to answer one by one. Pure and synchronous: the panel hands it pasted text
// (or the text of an imported .docx) and gets back an ordered point list.
//
// Decision letters are near-universally structured as "Reviewer 1", then
// numbered or bulleted points, sometimes under "Major comments" / "Minor
// comments". Nothing here guesses beyond that: a letter whose shape is not
// recognised comes back as one block with a warning saying so, because an
// author can split one block by hand but cannot see that a point was silently
// swallowed.

import { isNonEmptyString } from '@sniptt/guards';

export type ParsedReviewPoint = {
  // "Reviewer 1", "Referee 2", "Editor" — empty when the letter named nobody.
  reviewer: string;
  // The point's printed label: "1", "2.3", or "General" for the remarks a
  // reviewer makes before their first numbered point.
  label: string;
  // "Major comments" / "Minor comments" when the letter used such a subheading.
  heading: string;
  comment: string;
};

export type ParsedDecisionLetter = {
  // Everything before the first reviewer heading or point — usually the
  // editor's own paragraph. Kept out of the points so it is not answered.
  preamble: string;
  reviewers: string[];
  points: ParsedReviewPoint[];
  // False when neither a reviewer heading nor a point marker was recognised
  // and the whole letter came back as a single point.
  structured: boolean;
  warnings: string[];
};

// A heading on a line of its own: "Reviewer 2", "**Referee #1**",
// "Reviewer 1 (Remarks to the Author):", "Editor's comments".
const REVIEWER_HEADING =
  /^\s*(?:#{1,6}\s*)?\*{0,2}_{0,2}\s*(?<role>reviewers?|referees?|associate editor|handling editor|academic editor|editor)\s*(?:#|no\.?|number)?\s*(?<number>\d{1,2}|[ivx]{1,4}|[a-c])?\s*(?:\([^)]*\))?\s*(?:['’]s)?\s*(?:comments?|remarks?|report|review|evaluation)?\s*(?:to the authors?)?\s*[:.\-–—]?\s*_{0,2}\*{0,2}\s*$/i;

// The same heading with the reviewer's first sentence on the same line, which
// is how Elsevier and Springer letters usually arrive.
const REVIEWER_HEADING_INLINE =
  /^\s*\*{0,2}(?<role>reviewers?|referees?|editor)\s*(?:#|no\.?|number)?\s*(?<number>\d{1,2})\s*(?:\([^)]*\))?\s*\*{0,2}\s*[:.\-–—]\s*(?<rest>\S.*)$/i;

const SUBHEADING =
  /^\s*(?:#{1,6}\s*)?\*{0,2}_{0,2}\s*(?<text>(?:major|minor|general|specific|detailed|additional|other|technical|editorial)\s+(?:comments?|points?|issues?|concerns?|revisions?|suggestions?|corrections?))\s*[:.]?\s*_{0,2}\*{0,2}\s*$/i;

// "1.2 Something" needs no punctuation after the number pair, where a bare
// "1" does — otherwise every line opening with a figure would start a point.
const NUMBERED_SUB =
  /^\s{0,6}[([]?(?<major>\d{1,3})\.(?<minor>\d{1,3})\s*[.)\]:]?\s+(?<rest>\S.*)$/;

const NUMBERED = /^\s{0,6}[([]?(?<major>\d{1,3})\s*[.)\]:]\s*(?<rest>.*)$/;

const BULLET = /^\s{0,6}[-*•·‣▪]\s+(?<rest>\S.*)$/;

// A quoted excerpt of the manuscript never starts a point, however it is
// numbered inside the quote.
const QUOTED_LINE = /^\s*>/;

const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .map(
      (word) =>
        `${word.charAt(0).toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`,
    )
    .join(' ');

// "reviewer" + "1" → "Reviewer 1"; the source's own word is kept, so a letter
// that says "Referee" does not come back saying "Reviewer".
const reviewerName = (role: string, number: string | undefined): string => {
  const singularRole = role.replace(/s$/i, '');
  const label = titleCase(singularRole);
  if (!isNonEmptyString(number)) return label;
  return /^\d+$/.test(number)
    ? `${label} ${number}`
    : `${label} ${number.toLocaleUpperCase()}`;
};

// Whether a line-leading number is the next point rather than a year, a page
// number, or a quoted heading. A fresh group may start anywhere in a small
// range (letters that carry on numbering across reviewers are common); after
// that a point number must move forward by at most three, which is what rules
// out "2011." opening a line inside a quoted excerpt.
const isPlausiblePointNumber = (
  previous: number | null,
  major: number,
  hasMinor: boolean,
): boolean => {
  if (previous === null) return major <= 20;
  if (hasMinor) return major >= previous && major <= previous + 3;
  return major > previous && major <= previous + 3;
};

type PointDraft = {
  reviewer: string;
  label: string;
  heading: string;
  lines: string[];
};

const collapseBlankRuns = (value: string): string =>
  value
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const slug = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const reviewPointId = (reviewer: string, label: string): string =>
  [slug(reviewer) || 'letter', slug(label) || 'point']
    .filter((part) => part.length > 0)
    .join('-');

export const parseDecisionLetter = (letter: string): ParsedDecisionLetter => {
  const lines = letter.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  const points: ParsedReviewPoint[] = [];
  const preambleLines: string[] = [];
  const reviewers: string[] = [];
  const warnings: string[] = [];
  const pointCountByReviewer = new Map<string, number>();

  let currentReviewer = '';
  let currentHeading = '';
  let lastNumber: number | null = null;
  let groupPointCount = 0;
  let draft: PointDraft | null = null;
  let sawMarker = false;

  const flush = () => {
    if (draft === null) return;
    const comment = collapseBlankRuns(draft.lines.join('\n'));
    if (comment.length > 0) {
      points.push({
        reviewer: draft.reviewer,
        label: draft.label,
        heading: draft.heading,
        comment,
      });
      pointCountByReviewer.set(
        draft.reviewer,
        (pointCountByReviewer.get(draft.reviewer) ?? 0) + 1,
      );
    }
    draft = null;
  };

  const startPoint = (label: string, firstLine: string) => {
    flush();
    groupPointCount += 1;
    draft = {
      reviewer: currentReviewer,
      label,
      heading: currentHeading,
      lines: firstLine.length > 0 ? [firstLine] : [],
    };
  };

  const startReviewer = (name: string) => {
    flush();
    currentReviewer = name;
    currentHeading = '';
    lastNumber = null;
    groupPointCount = 0;
    if (!reviewers.includes(name)) reviewers.push(name);
    if (!pointCountByReviewer.has(name)) pointCountByReviewer.set(name, 0);
  };

  // Continuation lines lose their leading indentation: a letter aligns wrapped
  // text under its number, and four of those spaces would turn the quoted
  // comment into a code block once the response document renders it.
  const appendLine = (rawLine: string) => {
    const line = rawLine.replace(/^\s+/, '');
    if (draft !== null) {
      draft.lines.push(line);
      return;
    }
    // Prose under a reviewer heading that arrives before their first numbered
    // point is still something the author has to answer, so it becomes that
    // reviewer's "General" point rather than disappearing.
    if (isNonEmptyString(currentReviewer)) {
      if (line.trim().length === 0) return;
      // Opened directly rather than through startPoint: "General" is not a
      // numbered point, so it must not take an ordinal from the bullets that
      // may follow it.
      draft = {
        reviewer: currentReviewer,
        label: 'General',
        heading: currentHeading,
        lines: [line],
      };
      return;
    }
    preambleLines.push(line);
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    if (QUOTED_LINE.test(line)) {
      appendLine(line);
      continue;
    }

    const heading = REVIEWER_HEADING.exec(line);
    if (heading?.groups !== undefined) {
      sawMarker = true;
      startReviewer(reviewerName(heading.groups.role, heading.groups.number));
      continue;
    }

    const inlineHeading = REVIEWER_HEADING_INLINE.exec(line);
    if (inlineHeading?.groups !== undefined) {
      sawMarker = true;
      startReviewer(
        reviewerName(inlineHeading.groups.role, inlineHeading.groups.number),
      );
      appendLine(inlineHeading.groups.rest);
      continue;
    }

    const subheading = SUBHEADING.exec(line);
    if (subheading?.groups !== undefined) {
      flush();
      // The source's own wording, only its first letter forced up, so
      // "MINOR COMMENTS" and "minor comments" do not read as two headings.
      const headingText = subheading.groups.text.trim();
      currentHeading = `${headingText.charAt(0).toLocaleUpperCase()}${headingText.slice(1).toLocaleLowerCase()}`;
      lastNumber = null;
      groupPointCount = 0;
      continue;
    }

    const numbered = NUMBERED_SUB.exec(line) ?? NUMBERED.exec(line);
    if (numbered?.groups !== undefined) {
      const major = Number(numbered.groups.major);
      const hasMinor = numbered.groups.minor !== undefined;
      if (isPlausiblePointNumber(lastNumber, major, hasMinor)) {
        sawMarker = true;
        lastNumber = major;
        const label = hasMinor
          ? `${major}.${Number(numbered.groups.minor)}`
          : String(major);
        startPoint(label, numbered.groups.rest.trim());
        continue;
      }
    }

    const bullet = BULLET.exec(line);
    if (bullet?.groups !== undefined) {
      sawMarker = true;
      startPoint(String(groupPointCount + 1), bullet.groups.rest.trim());
      continue;
    }

    appendLine(line);
  }
  flush();

  const preamble = collapseBlankRuns(preambleLines.join('\n'));

  // Nothing recognisable at all: hand the letter back whole and say so.
  if (!sawMarker || points.length === 0) {
    const whole = collapseBlankRuns(letter.replace(/\r\n?/g, '\n'));
    return {
      preamble: '',
      reviewers: [],
      points:
        whole.length === 0
          ? []
          : [{ reviewer: '', label: '1', heading: '', comment: whole }],
      structured: false,
      warnings:
        whole.length === 0
          ? ['The letter is empty.']
          : [
              'No reviewer headings or numbered points were recognised. The letter is kept as one block — split it by hand if the reviewers raised separate points.',
            ],
    };
  }

  if (reviewers.length === 0) {
    warnings.push(
      'No reviewer headings were found, so every point is attributed to the letter as a whole.',
    );
  }
  for (const reviewer of reviewers) {
    const count = pointCountByReviewer.get(reviewer) ?? 0;
    if (count === 0) {
      warnings.push(`${reviewer} has no comments under their heading.`);
      continue;
    }
    const onlyGeneral = points.every(
      (point) => point.reviewer !== reviewer || point.label === 'General',
    );
    if (onlyGeneral) {
      warnings.push(
        `${reviewer}'s comments carry no numbers or bullets, so they are kept as one block.`,
      );
    }
  }

  return { preamble, reviewers, points, structured: true, warnings };
};

// Names the manuscript importer invents for unheaded opening text. They are
// not lines of the letter, so they are not written into it.
const IMPORT_SCAFFOLD_SECTION_NAMES = new Set([
  'title page',
  'untitled section',
]);

// The text of a decision letter that arrived as a document rather than a
// paste. `readImportedDocumentFile` already turns .docx/.pdf/.md into ordered
// sections; flattening them back to a letter keeps this module the only place
// that knows what a letter looks like.
export const decisionLetterTextFromSections = (
  sections: Array<{ name?: string | null; content?: string | null }>,
): string =>
  collapseBlankRuns(
    sections
      .map((section) => {
        const name = (section.name ?? '').trim();
        const heading = IMPORT_SCAFFOLD_SECTION_NAMES.has(name.toLowerCase())
          ? ''
          : name;
        return [heading, section.content ?? '']
          .filter((part) => part.trim().length > 0)
          .join('\n\n');
      })
      .filter((block) => block.trim().length > 0)
      .join('\n\n'),
  );
