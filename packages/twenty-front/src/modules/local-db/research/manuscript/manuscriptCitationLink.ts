import { type ReferenceLike, type SectionLike } from './manuscriptTypes';

const YEAR_RE = /\b((?:19|20)\d{2})[a-z]?\b/i;
const NUMERIC_MARKER_RE =
  /\[(\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*)\]/g;
const AUTHOR_YEAR_MARKER_RE = /\(([^()\n]*\b(?:19|20)\d{2}[a-z]?[^()\n]*)\)/gi;
const CONTEXT_RADIUS = 40;

export type CitationLinkSuggestion = {
  citationKey: string;
  score: number;
};

export type UnlinkedCitationPart = {
  marker: string;
  suggestions: CitationLinkSuggestion[];
};

export type UnlinkedCitationOccurrence = {
  sectionId: string;
  sectionName: string;
  marker: string;
  context: string;
  kind: 'numeric' | 'authorYear';
  parts: UnlinkedCitationPart[];
  suggestions: CitationLinkSuggestion[];
  // The exact source offset disambiguates repeated markers in one section.
  index: number;
};

export type CitationLinkDecision = {
  sectionId: string;
  marker: string;
  index: number;
  citationKeys: string[];
};

type TextRange = { start: number; end: number };

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const codeRanges = (text: string): TextRange[] => {
  const ranges: TextRange[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== '`') {
      cursor += 1;
      continue;
    }
    let delimiterEnd = cursor;
    while (text[delimiterEnd] === '`') delimiterEnd += 1;
    const delimiter = text.slice(cursor, delimiterEnd);
    const closing = text.indexOf(delimiter, delimiterEnd);
    if (closing === -1) {
      cursor = delimiterEnd;
      continue;
    }
    ranges.push({ start: cursor, end: closing + delimiter.length });
    cursor = closing + delimiter.length;
  }
  return ranges;
};

const isInsideRanges = (index: number, ranges: TextRange[]): boolean =>
  ranges.some((range) => index >= range.start && index < range.end);

const contextFor = (content: string, start: number, end: number): string =>
  content
    .slice(
      Math.max(0, start - CONTEXT_RADIUS),
      Math.min(content.length, end + CONTEXT_RADIUS),
    )
    .replace(/\s+/g, ' ')
    .trim();

const expandNumericParts = (inner: string): string[] => {
  const parts: string[] = [];
  for (const rawPart of inner.split(',')) {
    const part = rawPart.trim();
    const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
    if (range === null) {
      if (/^\d+$/.test(part)) parts.push(part);
      continue;
    }
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (end - start > 100) continue;
    for (let number = start; number <= end; number += 1) {
      parts.push(String(number));
    }
  }
  return parts;
};

const portableReferenceIndex = (
  reference: ReferenceLike,
): number | undefined => {
  if (reference.cslJson === null || reference.cslJson === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(reference.cslJson);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return undefined;
    }
    const index = (parsed as Record<string, unknown>)[
      'researcher:referenceIndex'
    ];
    return typeof index === 'number' && Number.isFinite(index)
      ? index
      : undefined;
  } catch {
    return undefined;
  }
};

const orderedReferences = (
  references: ReferenceLike[],
): ReferenceLike[] | undefined => {
  if (
    references.length > 0 &&
    references.every((reference) => Number.isFinite(reference.orderIndex))
  ) {
    return [...references].sort(
      (first, second) =>
        (first.orderIndex as number) - (second.orderIndex as number),
    );
  }
  const portableIndexes = references.map(portableReferenceIndex);
  if (
    references.length > 0 &&
    portableIndexes.every((index) => index !== undefined)
  ) {
    return references
      .map((reference, position) => ({
        reference,
        index: portableIndexes[position] as number,
      }))
      .sort((first, second) => first.index - second.index)
      .map(({ reference }) => reference);
  }
  if (
    references.length > 0 &&
    references.every(
      (reference) =>
        reference.createdAt !== null &&
        reference.createdAt !== undefined &&
        Number.isFinite(Date.parse(reference.createdAt)),
    )
  ) {
    return references
      .map((reference, position) => ({ reference, position }))
      .sort(
        (first, second) =>
          Date.parse(first.reference.createdAt as string) -
            Date.parse(second.reference.createdAt as string) ||
          first.position - second.position,
      )
      .map(({ reference }) => reference);
  }
  return undefined;
};

const numericSuggestions = (
  part: string,
  references: ReferenceLike[] | undefined,
): CitationLinkSuggestion[] => {
  const reference = references?.[Number(part) - 1];
  const citationKey = reference?.citationKey?.trim();
  return citationKey === undefined || citationKey.length === 0
    ? []
    : [{ citationKey, score: 1 }];
};

const initialsRemoved = (value: string): string =>
  value
    .replace(/\b[A-ZÀ-ÖØ-Þ]\.(?:\s*[A-ZÀ-ÖØ-Þ]\.)*\s*/giu, '')
    .replace(/\bet\s+al\.?/giu, '')
    .trim();

const citedAuthorTerms = (part: string): string[] => {
  const withoutYear = part.replace(YEAR_RE, '').replace(/,\s*$/, '').trim();
  return withoutYear
    .split(/\s*(?:&|\band\b)\s*/i)
    .map((author) => initialsRemoved(author))
    .map((author) => {
      const normalized = normalizeText(author);
      const tokens = normalized.split(' ').filter((token) => token.length > 0);
      if (tokens.length === 0) return '';
      const isOrganization =
        author === author.toLocaleUpperCase() && tokens.length > 1;
      return isOrganization ? normalized : (tokens.at(-1) ?? normalized);
    })
    .filter((term) => term.length > 0);
};

const referenceAuthorTerms = (reference: ReferenceLike): string[] => {
  const authors = reference.authors?.trim() ?? '';
  if (authors.length === 0) return [];
  return authors
    .split(/\s*;\s*|\s+\band\b\s+/i)
    .map((author) => author.trim())
    .filter((author) => author.length > 0)
    .map((author) => {
      if (author.includes(',')) return normalizeText(author.split(',')[0]);
      const normalized = normalizeText(initialsRemoved(author));
      const tokens = normalized.split(' ').filter((token) => token.length > 0);
      const isOrganization =
        author === author.toLocaleUpperCase() && tokens.length > 1;
      return isOrganization ? normalized : (tokens.at(-1) ?? normalized);
    })
    .filter((term) => term.length > 0);
};

const editSimilarity = (first: string, second: string): number => {
  if (first.length === 0 || second.length === 0) return 0;
  const previous = Array.from(
    { length: second.length + 1 },
    (_value, index) => index,
  );
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      current[secondIndex] = Math.min(
        (current[secondIndex - 1] ?? 0) + 1,
        (previous[secondIndex] ?? 0) + 1,
        (previous[secondIndex - 1] ?? 0) +
          (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - (previous.at(-1) ?? 0) / Math.max(first.length, second.length);
};

const tokenSimilarity = (cited: string, candidate: string): number => {
  if (cited === candidate) return 1;
  if (cited.length >= 5 && candidate.length >= 5) {
    if (cited.includes(candidate) || candidate.includes(cited)) return 0.92;
  }
  const citedTokens = new Set(cited.split(' ').filter(Boolean));
  const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
  const overlap = [...citedTokens].filter((token) =>
    candidateTokens.has(token),
  ).length;
  const union = new Set([...citedTokens, ...candidateTokens]).size;
  const overlapScore = union === 0 ? 0 : overlap / union;
  return Math.max(overlapScore, editSimilarity(cited, candidate));
};

const authorYearSuggestions = (
  part: string,
  references: ReferenceLike[],
): CitationLinkSuggestion[] => {
  const citedYear = Number(YEAR_RE.exec(part)?.[1]);
  if (!Number.isFinite(citedYear)) return [];
  const citedTerms = citedAuthorTerms(part);
  if (citedTerms.length === 0) return [];

  return references
    .flatMap((reference): CitationLinkSuggestion[] => {
      const citationKey = reference.citationKey?.trim();
      if (
        reference.year !== citedYear ||
        citationKey === undefined ||
        citationKey.length === 0
      ) {
        return [];
      }
      const authorTerms = referenceAuthorTerms(reference);
      const searchable = normalizeText(
        `${reference.authors ?? ''} ${reference.name ?? ''}`,
      );
      const scores = citedTerms.map((citedTerm, index) => {
        const authorScore = Math.max(
          0,
          ...authorTerms.map((term) => tokenSimilarity(citedTerm, term)),
        );
        const searchableScore = tokenSimilarity(citedTerm, searchable);
        // The first cited author carries most of the identity; later authors
        // can raise confidence but cannot rescue a different first author.
        return (
          (index === 0 ? 0.8 : 0.2) * Math.max(authorScore, searchableScore)
        );
      });
      const firstAuthorScore =
        authorTerms.length === 0
          ? tokenSimilarity(citedTerms[0], searchable)
          : tokenSimilarity(citedTerms[0], authorTerms[0]);
      if (firstAuthorScore < 0.45 && scores[0] < 0.45) return [];
      const score = Math.min(
        1,
        0.55 +
          firstAuthorScore * 0.35 +
          scores.slice(1).reduce((sum, value) => sum + value, 0),
      );
      return [{ citationKey, score: Number(score.toFixed(3)) }];
    })
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.citationKey.localeCompare(second.citationKey),
    );
};

const combinedSuggestions = (
  parts: UnlinkedCitationPart[],
): CitationLinkSuggestion[] => {
  const byKey = new Map<string, number>();
  for (const part of parts) {
    for (const suggestion of part.suggestions) {
      byKey.set(
        suggestion.citationKey,
        Math.max(byKey.get(suggestion.citationKey) ?? 0, suggestion.score),
      );
    }
  }
  return [...byKey]
    .map(([citationKey, score]) => ({ citationKey, score }))
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.citationKey.localeCompare(second.citationKey),
    );
};

export const collectUnlinkedCitations = (
  sections: SectionLike[],
  references: ReferenceLike[],
): UnlinkedCitationOccurrence[] => {
  const occurrences: UnlinkedCitationOccurrence[] = [];
  const ordered = orderedReferences(references);

  for (const section of sections) {
    const content = section.content ?? '';
    const ranges = codeRanges(content);
    NUMERIC_MARKER_RE.lastIndex = 0;
    let numericMatch = NUMERIC_MARKER_RE.exec(content);
    while (numericMatch !== null) {
      const index = numericMatch.index;
      if (!isInsideRanges(index, ranges)) {
        const parts = expandNumericParts(numericMatch[1]).map((marker) => ({
          marker,
          suggestions: numericSuggestions(marker, ordered),
        }));
        occurrences.push({
          sectionId: section.id,
          sectionName: section.name?.trim() || 'Untitled section',
          marker: numericMatch[0],
          context: contextFor(content, index, index + numericMatch[0].length),
          kind: 'numeric',
          parts,
          suggestions: combinedSuggestions(parts),
          index,
        });
      }
      numericMatch = NUMERIC_MARKER_RE.exec(content);
    }

    AUTHOR_YEAR_MARKER_RE.lastIndex = 0;
    let authorYearMatch = AUTHOR_YEAR_MARKER_RE.exec(content);
    while (authorYearMatch !== null) {
      const index = authorYearMatch.index;
      const rawParts = authorYearMatch[1]
        .split(';')
        .map((part) => part.trim())
        .filter((part) => YEAR_RE.test(part) && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(part));
      if (
        rawParts.length > 0 &&
        !isInsideRanges(index, ranges) &&
        !authorYearMatch[0].includes('[@')
      ) {
        const parts = rawParts.map((marker) => ({
          marker,
          suggestions: authorYearSuggestions(marker, references),
        }));
        occurrences.push({
          sectionId: section.id,
          sectionName: section.name?.trim() || 'Untitled section',
          marker: authorYearMatch[0],
          context: contextFor(
            content,
            index,
            index + authorYearMatch[0].length,
          ),
          kind: 'authorYear',
          parts,
          suggestions: combinedSuggestions(parts),
          index,
        });
      }
      authorYearMatch = AUTHOR_YEAR_MARKER_RE.exec(content);
    }
  }

  return occurrences.sort(
    (first, second) =>
      sections.findIndex((section) => section.id === first.sectionId) -
        sections.findIndex((section) => section.id === second.sectionId) ||
      first.index - second.index,
  );
};

export const applyCitationLinks = (
  sections: SectionLike[],
  decisions: CitationLinkDecision[],
): SectionLike[] => {
  const decisionsBySection = new Map<string, CitationLinkDecision[]>();
  for (const decision of decisions) {
    if (decision.citationKeys.length === 0) continue;
    const sectionDecisions = decisionsBySection.get(decision.sectionId) ?? [];
    sectionDecisions.push(decision);
    decisionsBySection.set(decision.sectionId, sectionDecisions);
  }

  const changedSections: SectionLike[] = [];
  for (const section of sections) {
    const sectionDecisions = decisionsBySection.get(section.id);
    if (sectionDecisions === undefined || sectionDecisions.length === 0) {
      continue;
    }
    let content = section.content ?? '';
    const ranges = codeRanges(content);
    for (const decision of [...sectionDecisions].sort(
      (first, second) => second.index - first.index,
    )) {
      if (
        content.slice(
          decision.index,
          decision.index + decision.marker.length,
        ) !== decision.marker ||
        isInsideRanges(decision.index, ranges)
      ) {
        continue;
      }
      const token = `[${decision.citationKeys
        .map((citationKey) => `@${citationKey}`)
        .join('; ')}]`;
      content =
        content.slice(0, decision.index) +
        token +
        content.slice(decision.index + decision.marker.length);
    }
    if (content !== (section.content ?? '')) {
      changedSections.push({ ...section, content });
    }
  }
  return changedSections;
};
