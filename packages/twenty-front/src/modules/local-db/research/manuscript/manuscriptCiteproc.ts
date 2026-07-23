import { isNonEmptyString } from '@sniptt/guards';
import { type Engine } from 'citeproc';

import airQualityAtmosphereAndHealthXml from './csl-styles/air-quality-atmosphere-and-health.csl?raw';
import americanMedicalAssociationXml from './csl-styles/american-medical-association.csl?raw';
import apaXml from './csl-styles/apa.csl?raw';
import archivesOfEnvironmentalContaminationAndToxicologyXml from './csl-styles/archives-of-environmental-contamination-and-toxicology.csl?raw';
import atmosphericEnvironmentXml from './csl-styles/atmospheric-environment.csl?raw';
import elsevierHarvardXml from './csl-styles/elsevier-harvard.csl?raw';
import environmentalScienceAndPollutionResearchXml from './csl-styles/environmental-science-and-pollution-research.csl?raw';
import localeEnUsXml from './csl-styles/locales-en-US.xml?raw';
import springerBasicAuthorDateXml from './csl-styles/springer-basic-author-date.csl?raw';
import { type ReferenceLike } from './manuscriptTypes';

export type VendoredCslStyle = {
  id: string;
  title: string;
  xml: string;
};

const decodeXmlText = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const titleFromStyleXml = (xml: string): string => {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(xml)?.[1]?.trim();
  return title === undefined ? 'Untitled CSL style' : decodeXmlText(title);
};

const vendoredStyle = (id: string, xml: string): VendoredCslStyle => ({
  id,
  title: titleFromStyleXml(xml),
  xml,
});

export const VENDORED_CSL_STYLES: VendoredCslStyle[] = [
  vendoredStyle('apa', apaXml),
  vendoredStyle('american-medical-association', americanMedicalAssociationXml),
  vendoredStyle('elsevier-harvard', elsevierHarvardXml),
  vendoredStyle('springer-basic-author-date', springerBasicAuthorDateXml),
  vendoredStyle(
    'environmental-science-and-pollution-research',
    environmentalScienceAndPollutionResearchXml,
  ),
  vendoredStyle('atmospheric-environment', atmosphericEnvironmentXml),
  vendoredStyle(
    'air-quality-atmosphere-and-health',
    airQualityAtmosphereAndHealthXml,
  ),
  vendoredStyle(
    'archives-of-environmental-contamination-and-toxicology',
    archivesOfEnvironmentalContaminationAndToxicologyXml,
  ),
];

const stylesById = new Map(
  VENDORED_CSL_STYLES.map((style) => [style.id, style]),
);

export const isVendoredCslStyleId = (
  styleId: string | null | undefined,
): styleId is string =>
  isNonEmptyString(styleId) && stylesById.has(styleId.trim());

const independentParentId = (xml: string): string | null => {
  const link = /<link\b(?=[^>]*\brel=["']independent-parent["'])[^>]*>/i.exec(
    xml,
  )?.[0];
  const href =
    link === undefined ? undefined : /\bhref=["']([^"']+)["']/i.exec(link)?.[1];
  if (href === undefined) return null;
  const id = href.split('/').filter(Boolean).at(-1);
  return isNonEmptyString(id) ? id.replace(/\.csl$/i, '') : null;
};

export const resolveCslStyleXml = (
  styleId: string | null | undefined,
): string | null => {
  if (!isNonEmptyString(styleId)) return null;
  const style = stylesById.get(styleId.trim());
  if (style === undefined) return null;
  const parentId = independentParentId(style.xml);
  return parentId === null
    ? style.xml
    : (stylesById.get(parentId)?.xml ?? null);
};

const CSL_TYPE_BY_REFERENCE_TYPE: Record<string, string> = {
  ARTICLE_JOURNAL: 'article-journal',
  PAPER_CONFERENCE: 'paper-conference',
  BOOK: 'book',
  CHAPTER: 'chapter',
  THESIS: 'thesis',
  REPORT: 'report',
  DATASET: 'dataset',
  WEBPAGE: 'webpage',
  PREPRINT: 'article',
  SOFTWARE: 'software',
  OTHER: 'article-journal',
};

const referenceKey = (reference: ReferenceLike): string =>
  reference.citationKey?.trim() || reference.id;

const authorsToCsl = (
  authors: string | null | undefined,
): { family: string; given?: string }[] => {
  if (!isNonEmptyString(authors)) return [];
  return authors
    .split(';')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => {
      if (name.includes(',')) {
        const [family, ...givenParts] = name.split(',');
        const given = givenParts.join(',').trim();
        return { family: family.trim(), ...(given ? { given } : {}) };
      }
      const parts = name.split(/\s+/);
      const family = parts.at(-1) ?? name;
      const given = parts.slice(0, -1).join(' ');
      return { family, ...(given ? { given } : {}) };
    });
};

const warnedReferenceIds = new Set<string>();

const warnInvalidCslJsonOnce = (reference: ReferenceLike) => {
  if (warnedReferenceIds.has(reference.id)) return;
  warnedReferenceIds.add(reference.id);
  // oxlint-disable-next-line no-console
  console.warn(
    `Reference "${referenceKey(reference)}" has invalid CSL-JSON; using its structured fields instead.`,
  );
};

export const referenceToCslItem = (
  reference: ReferenceLike,
): Record<string, unknown> => {
  const id = referenceKey(reference);
  if (isNonEmptyString(reference.cslJson)) {
    try {
      const parsed: unknown = JSON.parse(reference.cslJson);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        'type' in parsed &&
        isNonEmptyString(parsed.type)
      ) {
        return { ...parsed, id };
      }
      warnInvalidCslJsonOnce(reference);
    } catch {
      warnInvalidCslJsonOnce(reference);
    }
  }

  return {
    id,
    type:
      CSL_TYPE_BY_REFERENCE_TYPE[reference.cslType ?? 'OTHER'] ??
      'article-journal',
    title: reference.name ?? '',
    author: authorsToCsl(reference.authors),
    ...(reference.year === null || reference.year === undefined
      ? {}
      : { issued: { 'date-parts': [[reference.year]] } }),
    ...(isNonEmptyString(reference.containerTitle)
      ? { 'container-title': reference.containerTitle }
      : {}),
    ...(isNonEmptyString(reference.volume) ? { volume: reference.volume } : {}),
    ...(isNonEmptyString(reference.issue) ? { issue: reference.issue } : {}),
    ...(isNonEmptyString(reference.pages) ? { page: reference.pages } : {}),
    ...(isNonEmptyString(reference.doi) ? { DOI: reference.doi } : {}),
    ...(isNonEmptyString(reference.url) ? { URL: reference.url } : {}),
  };
};

export type ManuscriptCiteprocEngine = {
  itemKeys: string[];
  knownItemKeys: Set<string>;
  processor: Engine;
};

export const createCiteprocEngine = async ({
  styleId,
  references,
}: {
  styleId: string;
  references: ReferenceLike[];
}): Promise<ManuscriptCiteprocEngine | null> => {
  const styleXml = resolveCslStyleXml(styleId);
  if (styleXml === null) return null;

  const items = references.map(referenceToCslItem);
  const itemsById = new Map(
    items.map((item) => [String(item.id), item] as const),
  );
  const itemKeys = [...itemsById.keys()];

  // citeproc-js is AGPL-3.0 licensed. Load it only for an active CSL style.
  const { default: Citeproc } = await import('citeproc');
  const processor = new Citeproc.Engine(
    {
      retrieveLocale: () => localeEnUsXml,
      retrieveItem: (id) =>
        itemsById.get(id) ?? { id, type: 'article-journal' },
    },
    styleXml,
    'en-US',
  );

  return {
    itemKeys,
    knownItemKeys: new Set(itemKeys),
    processor,
  };
};

const plainTextFromHtml = (html: string): string =>
  decodeXmlText(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

export const cslClusterKey = (citationKeys: string[]): string =>
  citationKeys.join('\u001f');

export const formatCslCitations = (
  engine: ManuscriptCiteprocEngine,
  clusters: string[][],
): string[] => {
  const labels = clusters.map(() => '[?]');
  const orderedKeys = [
    ...new Set([
      ...clusters.flat().filter((key) => engine.knownItemKeys.has(key)),
      ...engine.itemKeys,
    ]),
  ];
  engine.processor.updateItems(orderedKeys);

  const precedingCitations: [string, number][] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const citationItems = cluster
      .filter((key) => engine.knownItemKeys.has(key))
      .map((id) => ({ id }));
    if (citationItems.length === 0) return;

    const citationID = `manuscript-citation-${clusterIndex}`;
    const [, updates] = engine.processor.processCitationCluster(
      {
        citationID,
        citationItems,
        properties: { noteIndex: clusterIndex + 1 },
      },
      precedingCitations,
      [],
    );
    for (const [updatedIndex, html] of updates) {
      labels[updatedIndex] = plainTextFromHtml(html);
    }
    precedingCitations.push([citationID, clusterIndex + 1]);
  });

  return labels;
};

export type CslBibliographyEntry = {
  key: string;
  text: string;
  html?: string;
};

export const formatCslBibliography = (
  engine: ManuscriptCiteprocEngine,
): CslBibliographyEntry[] => {
  const result = engine.processor.makeBibliography();
  if (result === false) return [];
  const [metadata, htmlEntries] = result;
  const orderedKeys = metadata.entry_ids.map(([key]) => key);
  return htmlEntries.map((html, index) => ({
    key: orderedKeys[index] ?? `entry-${index}`,
    text: plainTextFromHtml(html),
    html,
  }));
};
