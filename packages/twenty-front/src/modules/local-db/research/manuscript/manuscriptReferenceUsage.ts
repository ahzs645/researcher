import { extractCitationClusters } from './manuscriptCitations';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from './manuscriptTypes';

export type ReferenceUsage = {
  count: number;
  sectionIds: string[];
};

export type ReferenceUsageSummary = {
  total: number;
  cited: number;
  unused: number;
};

export type ReferenceUsageByCitationKey = Map<string, ReferenceUsage>;

const citationKey = (reference: ReferenceLike): string | undefined => {
  const key = reference.citationKey?.trim();
  return key === undefined || key.length === 0 ? undefined : key;
};

export const countCitationKeyOccurrences = (
  text: string | null | undefined,
  key: string,
): number =>
  extractCitationClusters(text ?? '').reduce(
    (count, cluster) =>
      count + cluster.filter((clusterKey) => clusterKey === key).length,
    0,
  );

const addTextUsage = ({
  keySet,
  sectionId,
  text,
  usage,
}: {
  keySet: ReadonlySet<string>;
  sectionId?: string | null;
  text: string | null | undefined;
  usage: ReferenceUsageByCitationKey;
}) => {
  for (const cluster of extractCitationClusters(text ?? '')) {
    for (const key of cluster) {
      if (!keySet.has(key)) continue;
      const current = usage.get(key);
      if (current === undefined) continue;
      current.count += 1;
      if (
        sectionId !== null &&
        sectionId !== undefined &&
        !current.sectionIds.includes(sectionId)
      ) {
        current.sectionIds.push(sectionId);
      }
    }
  }
};

export const collectReferenceUsage = (
  sections: SectionLike[],
  figures: FigureLike[],
  references: ReferenceLike[],
): ReferenceUsageByCitationKey => {
  const usage: ReferenceUsageByCitationKey = new Map();
  for (const reference of references) {
    const key = citationKey(reference);
    if (key !== undefined && !usage.has(key)) {
      usage.set(key, { count: 0, sectionIds: [] });
    }
  }
  const keySet = new Set(usage.keys());

  for (const section of sections) {
    addTextUsage({
      keySet,
      sectionId: section.id,
      text: section.content,
      usage,
    });
  }
  for (const figure of figures) {
    addTextUsage({
      keySet,
      sectionId: figure.sectionId,
      text: figure.caption,
      usage,
    });
    addTextUsage({
      keySet,
      sectionId: figure.sectionId,
      text: figure.tableData,
      usage,
    });
  }

  return usage;
};

export const summarizeReferenceUsage = (
  references: ReferenceLike[],
  usage: ReferenceUsageByCitationKey,
): ReferenceUsageSummary => {
  const cited = references.filter((reference) => {
    const key = citationKey(reference);
    return key !== undefined && (usage.get(key)?.count ?? 0) > 0;
  }).length;
  return {
    total: references.length,
    cited,
    unused: references.length - cited,
  };
};
