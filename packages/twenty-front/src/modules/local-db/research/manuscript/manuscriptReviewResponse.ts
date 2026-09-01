// The response-to-reviewers document: every reviewer point quoted, the
// author's answer beneath it, and the section the manuscript changed in. This
// is the document journals ask for on resubmission and the one authors
// otherwise rebuild by hand, copying each point across from the letter.
//
// Pure Markdown out. The DOCX is the same Markdown run through the composer's
// existing standalone-document exporter, so this file stays testable without a
// document engine.

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { slugifyTitle } from './manuscriptAssembly';
import {
  parseReviewPoints,
  reviewDecisionLabel,
  reviewPointsByReviewer,
  reviewPointTitle,
  reviewRoundProgress,
  sortReviewRounds,
  type ReviewPoint,
  type ReviewRoundLike,
} from './manuscriptReviewRound';

export type ReviewResponseSection = {
  id: string;
  name?: string | null;
};

export type ReviewResponseDocumentInput = {
  manuscriptTitle: string;
  roundName: string;
  journal?: string | null;
  decision?: string | null;
  decisionDate?: string | null;
  points: ReviewPoint[];
  sections: ReviewResponseSection[];
};

const UNATTRIBUTED_REVIEWER = 'Reviewer comments';

// Leading indentation is dropped rather than quoted: four spaces inside a
// blockquote is a code block, and a reviewer's wrapped sentence would render
// as source code in both the Markdown and the DOCX.
const asBlockQuote = (text: string): string =>
  text
    .split('\n')
    .map((line) =>
      line.trim().length === 0 ? '>' : `> ${line.replace(/^\s+/, '')}`,
    )
    .join('\n');

const asIsoDate = (value: string | null | undefined): string =>
  isNonEmptyString(value) ? value.slice(0, 10) : '';

const decisionLine = (input: ReviewResponseDocumentInput): string | null => {
  const decision = reviewDecisionLabel(input.decision);
  const date = asIsoDate(input.decisionDate);
  if (!isNonEmptyString(decision) && !isNonEmptyString(date)) return null;
  if (!isNonEmptyString(date)) return `**Decision:** ${decision}`;
  if (!isNonEmptyString(decision)) return `**Decision date:** ${date}`;
  return `**Decision:** ${decision} (${date})`;
};

export const buildReviewResponseMarkdown = (
  input: ReviewResponseDocumentInput,
): string => {
  const sectionNameById = new Map(
    input.sections.map((section) => [
      section.id,
      section.name ?? 'Untitled section',
    ]),
  );
  const lines: string[] = [];

  lines.push(`**Manuscript:** ${input.manuscriptTitle}`);
  if (isNonEmptyString(input.journal)) {
    lines.push(`**Journal:** ${input.journal}`);
  }
  if (isNonEmptyString(input.roundName)) {
    lines.push(`**Round:** ${input.roundName}`);
  }
  const decision = decisionLine(input);
  if (decision !== null) lines.push(decision);
  lines.push('');

  if (input.points.length === 0) {
    lines.push('No reviewer points have been recorded for this round yet.');
    return `${lines.join('\n')}\n`;
  }

  for (const group of reviewPointsByReviewer(input.points)) {
    lines.push(
      `## ${isNonEmptyString(group.reviewer) ? group.reviewer : UNATTRIBUTED_REVIEWER}`,
    );
    lines.push('');
    let renderedHeading = '';
    for (const point of group.points) {
      if (point.heading !== renderedHeading) {
        renderedHeading = point.heading;
        if (isNonEmptyString(renderedHeading)) {
          lines.push(`### ${renderedHeading}`);
          lines.push('');
        }
      }
      lines.push(`**${reviewPointTitle(point.label)}**`);
      lines.push('');
      lines.push(asBlockQuote(point.comment));
      lines.push('');
      lines.push('**Response**');
      lines.push('');
      lines.push(
        isNonEmptyString(point.response.trim())
          ? point.response.trim()
          : '_No response written yet._',
      );
      lines.push('');
      const sectionName = isNonEmptyString(point.sectionId)
        ? sectionNameById.get(point.sectionId)
        : undefined;
      if (isDefined(sectionName)) {
        lines.push(`*Changed in: ${sectionName}*`);
        lines.push('');
      }
    }
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
};

export const REVIEW_RESPONSE_DOCUMENT_TITLE = 'Response to reviewers';

// The Markdown file as downloaded. The DOCX exporter adds the document's title
// itself, so the body builder leaves the heading off and only this adds it.
export const reviewResponseMarkdownFile = (
  input: ReviewResponseDocumentInput,
): string =>
  `# ${REVIEW_RESPONSE_DOCUMENT_TITLE}\n\n${buildReviewResponseMarkdown(input)}`;

export const reviewResponseFilenameBase = (
  manuscriptTitle: string,
  roundName: string,
): string =>
  [slugifyTitle(manuscriptTitle), slugifyTitle(roundName), 'response']
    .filter((part) => part.length > 0)
    .join('-');

// What the submission package should carry, if anything: the newest round the
// author has actually started answering. A round with no responses would ship
// a document of empty answers, which is worse than shipping none.
export const submissionReviewResponseMarkdown = (
  rounds: ReviewRoundLike[],
  sections: ReviewResponseSection[],
  manuscriptTitle: string,
): string | null => {
  for (const round of sortReviewRounds(rounds)) {
    const points = parseReviewPoints(round.points);
    if (reviewRoundProgress(points).answered === 0) continue;
    return buildReviewResponseMarkdown({
      manuscriptTitle,
      roundName: round.name ?? '',
      journal: round.journal,
      decision: round.decision,
      decisionDate: round.decisionDate,
      points,
      sections,
    });
  }
  return null;
};
