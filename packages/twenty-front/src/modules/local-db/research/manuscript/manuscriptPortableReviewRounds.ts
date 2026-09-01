// Review rounds as a portable package carries them: the journal's decision,
// the letter as it was received, and every reviewer point with the answer the
// author wrote to it. Without this a restored paper comes back with its prose
// intact and a fortnight of responses gone, which is the one thing a package
// claiming to restore everything must not do.
//
// The mapping lives here rather than in the manifest builder because it runs
// in both directions and neither end is a straight copy: a point names the
// section it changed, and a section id means nothing on the machine the
// package is opened on.

import { isNonEmptyString } from '@sniptt/guards';
import { isNonEmptyArray } from 'twenty-shared/utils';

import {
  parseReviewPoints,
  REVIEW_DECISIONS,
  reviewPointTitle,
  serializeReviewPoints,
  type ReviewDecision,
  type ReviewPoint,
  type ReviewRoundLike,
} from './manuscriptReviewRound';

// One reviewer point in the package. `id` and `comment` are the point itself,
// so they are always written; the rest is left off when the round has nothing
// to say there, the same way an unnamed section carries no `refKey`.
export type PortableReviewPoint = {
  id: string;
  reviewer?: string;
  label?: string;
  heading?: string;
  comment: string;
  response?: string;
  // The manifest key of the section this point's change landed in — a key, not
  // the record id the point holds locally, for the reason a section version
  // travels as `variantOfKey` and a per-journal version is pinned by
  // `profileKey`: ids belong to the one workspace that minted them. A point
  // whose section is not in this package keeps its raw id here, which resolves
  // to nothing on the way back in; that is what lets the importer say the
  // pointer was lost rather than silently aim the answer at whichever section
  // happens to arrive in that place.
  sectionKey?: string;
};

export type PortableReviewRound = {
  key: string;
  name: string;
  journal?: string;
  decision?: string;
  decisionDate?: string;
  letter?: string;
  // Absent on a round whose letter has not been split into points yet. The
  // letter itself still travels, so the author re-parses it and loses nothing.
  points?: PortableReviewPoint[];
};

const trimmedText = (value: string | null | undefined): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length === 0 ? undefined : text;
};

const portableReviewPoint = (
  point: ReviewPoint,
  sectionKeyById: ReadonlyMap<string, string>,
): PortableReviewPoint => {
  const reviewer = trimmedText(point.reviewer);
  const label = trimmedText(point.label);
  const heading = trimmedText(point.heading);
  const response = trimmedText(point.response);
  return {
    id: point.id,
    ...(reviewer === undefined ? {} : { reviewer }),
    ...(label === undefined ? {} : { label }),
    ...(heading === undefined ? {} : { heading }),
    comment: point.comment,
    ...(response === undefined ? {} : { response }),
    ...(isNonEmptyString(point.sectionId)
      ? { sectionKey: sectionKeyById.get(point.sectionId) ?? point.sectionId }
      : {}),
  };
};

// The rounds as the manifest writes them. `sectionKeyById` is the same map the
// manifest builds for figures and section versions, so a point and a figure
// naming the same section name it the same way.
export const portableReviewRoundEntries = (
  rounds: readonly ReviewRoundLike[],
  sectionKeyById: ReadonlyMap<string, string>,
): PortableReviewRound[] =>
  rounds.map((round, index) => {
    const points = parseReviewPoints(round.points).map((point) =>
      portableReviewPoint(point, sectionKeyById),
    );
    const journal = trimmedText(round.journal);
    const decision = trimmedText(round.decision);
    const decisionDate = trimmedText(round.decisionDate);
    const letter = trimmedText(round.letter);
    return {
      key: `review-round-${index + 1}`,
      name: trimmedText(round.name) ?? `Round ${index + 1}`,
      ...(journal === undefined ? {} : { journal }),
      ...(decision === undefined ? {} : { decision }),
      ...(decisionDate === undefined ? {} : { decisionDate }),
      ...(letter === undefined ? {} : { letter }),
      ...(points.length > 0 ? { points } : {}),
    };
  });

// A point on the way back in, with its section given as `orderIndex` — the one
// handle a restore has while the records do not exist yet, and the handle a
// figure finds its section by too.
export type PortableReviewPointDraft = {
  id: string;
  reviewer: string;
  label: string;
  heading: string;
  comment: string;
  response: string;
  sectionOrderIndex?: number;
};

export type PortableReviewRoundDraft = {
  name: string;
  journal?: string;
  decision?: ReviewDecision;
  decisionDate?: string;
  letter?: string;
  points: PortableReviewPointDraft[];
};

export type PortableReviewRoundResolution = {
  rounds: PortableReviewRoundDraft[];
  // What the restore could not carry, in the words the review step shows the
  // author. A lost section pointer is small next to a lost answer, but it is
  // still something they set by hand.
  warnings: string[];
};

// A decision outside the four the record accepts would be refused by the
// record layer and take the whole import down with it, so an unknown one is
// left off and the round arrives without it. The same coercion
// `portableAssetKind` does for a figure's kind.
const portableReviewDecision = (
  value: string | undefined,
): ReviewDecision | undefined =>
  REVIEW_DECISIONS.find((candidate) => candidate === value);

export const resolvePortableReviewRounds = (
  entries: readonly PortableReviewRound[] | undefined,
  sectionOrderByKey: ReadonlyMap<string, number>,
): PortableReviewRoundResolution => {
  // A package written before rounds travelled carries none, and one whose
  // field was hand-edited into something else is not worth losing the paper
  // over — either way there is nothing here to restore.
  if (!isNonEmptyArray(entries)) return { rounds: [], warnings: [] };
  const warnings: string[] = [];
  const rounds = entries.map((entry, index) => {
    const name = trimmedText(entry.name) ?? `Round ${index + 1}`;
    const points = (entry.points ?? []).map((point, pointIndex) => {
      const sectionOrderIndex =
        point.sectionKey === undefined
          ? undefined
          : sectionOrderByKey.get(point.sectionKey);
      // The point is kept either way. Dropping it because the package no
      // longer holds the section it changed would throw away the answer the
      // author wrote, which is the part the work went into; the pointer is
      // only how the response document names where the change landed.
      if (point.sectionKey !== undefined && sectionOrderIndex === undefined) {
        warnings.push(
          `${reviewPointTitle(trimmedText(point.label) ?? String(pointIndex + 1))} of "${name}" was answered in a section this package does not contain, so the answer was kept without it.`,
        );
      }
      return {
        id: point.id,
        reviewer: point.reviewer ?? '',
        label: point.label ?? '',
        heading: point.heading ?? '',
        comment: point.comment,
        response: point.response ?? '',
        ...(sectionOrderIndex === undefined ? {} : { sectionOrderIndex }),
      };
    });
    const journal = trimmedText(entry.journal);
    const decision = portableReviewDecision(trimmedText(entry.decision));
    const decisionDate = trimmedText(entry.decisionDate);
    const letter = trimmedText(entry.letter);
    return {
      name,
      ...(journal === undefined ? {} : { journal }),
      ...(decision === undefined ? {} : { decision }),
      ...(decisionDate === undefined ? {} : { decisionDate }),
      ...(letter === undefined ? {} : { letter }),
      points,
    };
  });
  return { rounds, warnings };
};

// The round as a record to create. `points` is the JSON that field holds,
// rebuilt only once the sections exist, because the ids inside it are theirs.
export type PortableReviewRoundRecord = {
  name: string;
  journal?: string;
  decision?: ReviewDecision;
  decisionDate?: string;
  letter?: string;
  points?: string;
};

export const portableReviewRoundRecords = (
  drafts: readonly PortableReviewRoundDraft[],
  sectionIdsByOrderIndex: ReadonlyMap<number, string>,
): PortableReviewRoundRecord[] =>
  drafts.map(({ points, ...round }) => ({
    ...round,
    ...(points.length === 0
      ? {}
      : {
          points: serializeReviewPoints(
            points.map(({ sectionOrderIndex, ...point }) => ({
              ...point,
              // A section the commit step never created — one dropped as an
              // orphaned version, or an import that stopped early — leaves the
              // pointer empty rather than aimed at some other section's id.
              sectionId:
                sectionOrderIndex === undefined
                  ? ''
                  : (sectionIdsByOrderIndex.get(sectionOrderIndex) ?? ''),
            })),
          ),
        }),
  }));
