// JATS XML in.
//
// The app has exported JATS for a while — it is what a paper becomes once a
// publisher has it. Texture (eLife's editor) goes further and makes JATS the
// document model itself, which is the right call for a production system and
// the wrong one here: it would give up the Word round trip this app exists for.
// Reading JATS is the useful half. A paper that came back from a publisher, or
// out of PMC, or from anyone else's tool, can come in and be edited like any
// other manuscript.
//
// The output is a `PortableManuscriptSource` rather than a bespoke shape, so
// the existing portable-package restore does the rest: sections, numbered
// assets, references, contributors and cross-reference links all land through
// one path that is already tested.

import {
  type PortableManuscriptSource,
  type PortableManuscriptMetadata,
} from './manuscriptPortableManifest';
import {
  type FigureLike,
  type ReferenceLike,
  type SectionLike,
} from './manuscriptTypes';

// JATS `sec-type` values, and the section titles that stand in for them when a
// document does not type its sections — which most hand-authored JATS does not.
const SECTION_TYPE_BY_JATS: Record<string, string> = {
  intro: 'INTRODUCTION',
  introduction: 'INTRODUCTION',
  methods: 'METHODS',
  'materials|methods': 'METHODS',
  results: 'RESULTS',
  'results|discussion': 'RESULTS',
  discussion: 'DISCUSSION',
  conclusions: 'CONCLUSION',
  conclusion: 'CONCLUSION',
  'supplementary-material': 'SUPPLEMENT',
};

const SECTION_TYPE_BY_TITLE: Array<[RegExp, string]> = [
  [/^introduction|^background/i, 'INTRODUCTION'],
  [/^methods|^materials and methods|^experimental/i, 'METHODS'],
  [/^results/i, 'RESULTS'],
  [/^discussion/i, 'DISCUSSION'],
  [/^conclusion/i, 'CONCLUSION'],
  [/^limitations/i, 'OTHER'],
  [/^acknowledg/i, 'ACKNOWLEDGMENTS'],
  [/^author contributions/i, 'AUTHOR_CONTRIBUTIONS'],
  [/^(competing|conflict)/i, 'CONFLICTS'],
  [
    /^(data|code)\b.*availability|^availability of (data|code)/i,
    'DATA_AVAILABILITY',
  ],
  [/^funding/i, 'FUNDING'],
  [/^appendix/i, 'APPENDIX'],
];

const text = (node: Element | null | undefined): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const child = (parent: Element, selector: string): Element | null =>
  parent.querySelector(`:scope > ${selector}`);

const children = (parent: Element, selector: string): Element[] => [
  ...parent.querySelectorAll(`:scope > ${selector}`),
];

const slug = (value: string, fallback: string): string => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : fallback;
};

// ── Inline content ──────────────────────────────────────────────────────────
// JATS marks up the inside of a paragraph; the composer's prose is Markdown
// with this app's own tokens. Only the constructs that carry meaning survive —
// a cross-reference, a citation, inline maths, emphasis — because anything
// else would be decoration invented on the way in.
const inlineToMarkdown = (node: Node): string => {
  if (node.nodeType === 3) return node.textContent ?? '';
  if (node.nodeType !== 1) return '';
  const element = node as Element;
  const inner = [...element.childNodes].map(inlineToMarkdown).join('');
  switch (element.tagName.toLowerCase()) {
    case 'italic':
    case 'em':
      return `*${inner}*`;
    case 'bold':
    case 'strong':
      return `**${inner}**`;
    case 'sub':
      return `~${inner}~`;
    case 'sup':
      return `^${inner}^`;
    case 'inline-formula':
      return `$${text(element.querySelector('tex-math')) || inner}$`;
    case 'xref': {
      const target = element.getAttribute('rid') ?? '';
      // A bibliographic xref names a reference; every other kind names an
      // asset, and both are tokens the composer resolves for itself rather
      // than the frozen label the publisher printed.
      return element.getAttribute('ref-type') === 'bibr'
        ? `[@${target}]`
        : `[#${target}]`;
    }
    case 'ext-link':
      return `[${inner}](${element.getAttribute('xlink:href') ?? element.getAttribute('href') ?? ''})`;
    default:
      return inner;
  }
};

const paragraphMarkdown = (element: Element): string =>
  [...element.childNodes]
    .map(inlineToMarkdown)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

// ── Assets ──────────────────────────────────────────────────────────────────

const tableToMarkdown = (table: Element): string => {
  const rows = [...table.querySelectorAll('tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) =>
      paragraphMarkdown(cell).replace(/\|/g, '\\|'),
    ),
  );
  if (rows.length === 0) return '';
  const [header, ...body] = rows;
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]): string =>
    `| ${[...row, ...Array(width - row.length).fill('')].join(' | ')} |`;
  return [pad(header), `|${' --- |'.repeat(width)}`, ...body.map(pad)].join(
    '\n',
  );
};

const captionText = (element: Element): string => {
  const caption = child(element, 'caption');
  if (caption === null) return '';
  return children(caption, 'p').map(paragraphMarkdown).join(' ').trim();
};

type AssetHarvest = { figures: FigureLike[]; marker: string };

const resolvedArtwork = (
  href: string,
): Pick<FigureLike, 'imageSource' | 'imageUrl'> => {
  if (href.startsWith('data:'))
    return { imageSource: 'UPLOAD', imageUrl: href };
  if (/^https?:\/\//i.test(href)) return { imageSource: 'URL', imageUrl: href };
  return { imageSource: 'NONE' };
};

const harvestAsset = (
  element: Element,
  sectionId: string,
  index: number,
): AssetHarvest | null => {
  const tag = element.tagName.toLowerCase();
  const label = text(child(element, 'label'));
  const refKey = slug(
    element.getAttribute('id') ?? label,
    `${tag}-${index + 1}`,
  );
  const base = {
    id: refKey,
    refKey,
    placement: 'MAIN',
    orderIndex: index,
    sectionId,
    caption: captionText(element),
    // The publisher's own number is what the paper was published under, so it
    // is kept as the source label rather than thrown away for a fresh count.
    // A label reads "(7)", "Table 1" or "Figure S2"; only the number is the
    // number, and the brackets and the word are the journal's own formatting.
    sourceLabel: /([A-Za-z]?\d+[a-z]?)/.exec(label)?.[1] ?? '',
  };

  if (tag === 'disp-formula') {
    const latex = text(element.querySelector('tex-math'));
    if (latex.length === 0) return null;
    return {
      figures: [
        {
          ...base,
          name: label.length > 0 ? label : `Equation ${index + 1}`,
          assetKind: 'EQUATION',
          imageSource: 'NONE',
          equationLatex: latex,
        },
      ],
      marker: `[[asset:${refKey}]]`,
    };
  }

  if (tag === 'table-wrap') {
    const table = element.querySelector('table');
    return {
      figures: [
        {
          ...base,
          name: label.length > 0 ? label : `Table ${index + 1}`,
          assetKind: 'TABLE',
          imageSource: 'NONE',
          tableData: table === null ? '' : tableToMarkdown(table),
        },
      ],
      marker: `[[asset:${refKey}]]`,
    };
  }

  const graphic = element.querySelector('graphic');
  const href =
    graphic?.getAttribute('xlink:href') ?? graphic?.getAttribute('href') ?? '';
  return {
    figures: [
      {
        ...base,
        name: label.length > 0 ? label : `Figure ${index + 1}`,
        assetKind: 'FIGURE',
        // A JATS package references its artwork by path: the pixels live
        // beside the XML, not in it. An absolute URL is something the
        // composer can actually load; a package-relative filename means
        // nothing outside the package, so the figure arrives without an
        // image and the bundle's own "has no image yet" warning says so.
        ...resolvedArtwork(href),
      },
    ],
    marker: `[[asset:${refKey}]]`,
  };
};

// ── Sections ────────────────────────────────────────────────────────────────

const sectionTypeFor = (jatsType: string, title: string): string => {
  const typed = SECTION_TYPE_BY_JATS[jatsType.toLowerCase()];
  if (typed !== undefined) return typed;
  const matched = SECTION_TYPE_BY_TITLE.find(([pattern]) =>
    pattern.test(title),
  );
  return matched?.[1] ?? 'OTHER';
};

type SectionHarvest = { sections: SectionLike[]; figures: FigureLike[] };

const harvestSection = (
  element: Element,
  level: number,
  placement: 'MAIN' | 'SUPPLEMENT',
  counters: { section: number; asset: number },
): SectionHarvest => {
  const title = text(child(element, 'title'));
  const sectionId = slug(
    element.getAttribute('id') ?? title,
    `section-${counters.section + 1}`,
  );
  const body: string[] = [];
  const figures: FigureLike[] = [];
  const sections: SectionLike[] = [];

  for (const node of [...element.children]) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'title') continue;
    if (tag === 'sec') continue;
    if (tag === 'p') {
      const markdown = paragraphMarkdown(node);
      if (markdown.length > 0) body.push(markdown);
      continue;
    }
    if (tag === 'fig' || tag === 'table-wrap' || tag === 'disp-formula') {
      const harvest = harvestAsset(node, sectionId, counters.asset);
      if (harvest !== null) {
        counters.asset += 1;
        figures.push(...harvest.figures);
        body.push(harvest.marker);
      }
      continue;
    }
    if (tag === 'list') {
      for (const item of children(node, 'list-item')) {
        body.push(`- ${children(item, 'p').map(paragraphMarkdown).join(' ')}`);
      }
      continue;
    }
    const fallback = paragraphMarkdown(node);
    if (fallback.length > 0) body.push(fallback);
  }

  const content = body.join('\n\n');
  sections.push({
    id: sectionId,
    name: title.length > 0 ? title : 'Untitled section',
    sectionType: sectionTypeFor(element.getAttribute('sec-type') ?? '', title),
    placement,
    content,
    orderIndex: counters.section,
    level: Math.min(level, 3),
    wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
    includeInExport: true,
  });
  counters.section += 1;

  for (const nested of children(element, 'sec')) {
    const harvest = harvestSection(nested, level + 1, placement, counters);
    sections.push(...harvest.sections);
    figures.push(...harvest.figures);
  }

  return { sections, figures };
};

// ── References ──────────────────────────────────────────────────────────────

const referenceFrom = (element: Element, index: number): ReferenceLike => {
  const citation =
    element.querySelector('element-citation, mixed-citation, citation') ??
    element;
  const names = [...citation.querySelectorAll('name, string-name')].map(
    (name) => {
      const family = text(name.querySelector('surname'));
      const given = text(name.querySelector('given-names'));
      if (family.length === 0) return text(name);
      return given.length > 0 ? `${family}, ${given}` : family;
    },
  );
  const doi = text(citation.querySelector('pub-id[pub-id-type="doi"]'));
  const title =
    text(citation.querySelector('article-title')) ||
    text(citation.querySelector('source')) ||
    text(citation);
  const first = text(citation.querySelector('fpage'));
  const last = text(citation.querySelector('lpage'));
  const year = Number.parseInt(text(citation.querySelector('year')), 10);
  const citationKey = element.getAttribute('id') ?? `ref-${index + 1}`;

  return {
    id: citationKey,
    name: title,
    citationKey,
    cslType: 'ARTICLE_JOURNAL',
    ...(names.length > 0 ? { authors: names.join('; ') } : {}),
    ...(Number.isFinite(year) ? { year } : {}),
    ...(text(citation.querySelector('source')).length > 0
      ? { containerTitle: text(citation.querySelector('source')) }
      : {}),
    ...(text(citation.querySelector('volume')).length > 0
      ? { volume: text(citation.querySelector('volume')) }
      : {}),
    ...(text(citation.querySelector('issue')).length > 0
      ? { issue: text(citation.querySelector('issue')) }
      : {}),
    ...(first.length > 0
      ? { pages: last.length > 0 ? `${first}–${last}` : first }
      : {}),
    ...(doi.length > 0 ? { doi } : {}),
  };
};

// ── Front matter ────────────────────────────────────────────────────────────

const authorLineFrom = (front: Element): string =>
  [...front.querySelectorAll('contrib[contrib-type="author"]')]
    .map((contrib) => {
      const string = text(contrib.querySelector('string-name'));
      if (string.length > 0) return string;
      const family = text(contrib.querySelector('surname'));
      const given = text(contrib.querySelector('given-names'));
      return [given, family].filter((part) => part.length > 0).join(' ');
    })
    .filter((name) => name.length > 0)
    .join(', ');

const metadataFrom = (front: Element | null): PortableManuscriptMetadata => {
  if (front === null) return { title: 'Imported article' };
  const title =
    text(front.querySelector('article-title')) || 'Imported article';
  const subtitle = text(front.querySelector('subtitle'));
  const affiliations = [...front.querySelectorAll('aff')]
    .map((aff) => text(aff))
    .filter((line) => line.length > 0);
  const corresponding = text(
    front.querySelector('corresp') ??
      front.querySelector('contrib[corresp="yes"] email'),
  );
  const doi = text(front.querySelector('article-id[pub-id-type="doi"]'));
  const venue = text(front.querySelector('journal-title'));
  const authorLine = authorLineFrom(front);

  return {
    title: subtitle.length > 0 ? `${title}: ${subtitle}` : title,
    ...(authorLine.length > 0 ? { authorLine } : {}),
    ...(affiliations.length > 0
      ? { affiliations: affiliations.join('\n') }
      : {}),
    ...(corresponding.length > 0 ? { correspondingAuthor: corresponding } : {}),
    ...(doi.length > 0 ? { doi } : {}),
    ...(venue.length > 0 ? { targetVenue: venue } : {}),
  };
};

const abstractSection = (
  front: Element | null,
  orderIndex: number,
): SectionLike | null => {
  const abstract = front?.querySelector('abstract') ?? null;
  if (abstract === null) return null;
  const content = [...abstract.querySelectorAll('p')]
    .map(paragraphMarkdown)
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
  if (content.length === 0) return null;
  return {
    id: 'abstract',
    name: 'Abstract',
    sectionType: 'ABSTRACT',
    placement: 'MAIN',
    content,
    orderIndex,
    level: 1,
    wordCount: content.split(/\s+/).filter((word) => word.length > 0).length,
    includeInExport: true,
  };
};

const keywordSection = (
  front: Element | null,
  orderIndex: number,
): SectionLike | null => {
  const keywords = [...(front?.querySelectorAll('kwd') ?? [])]
    .map((keyword) => text(keyword))
    .filter((keyword) => keyword.length > 0);
  if (keywords.length === 0) return null;
  const content = keywords.join(', ');
  return {
    id: 'keywords',
    name: 'Keywords',
    sectionType: 'KEYWORDS',
    placement: 'MAIN',
    content,
    orderIndex,
    level: 1,
    wordCount: keywords.length,
    includeInExport: true,
  };
};

export const parseJatsArticle = (xml: string): PortableManuscriptSource => {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror') !== null) {
    throw new Error('This file is not readable XML');
  }
  const article = parsed.querySelector('article');
  if (article === null) {
    throw new Error('No <article> element in this file: it is not JATS');
  }

  const front = article.querySelector('front');
  const body = article.querySelector('body');
  const back = article.querySelector('back');

  const counters = { section: 0, asset: 0 };
  const sections: SectionLike[] = [];
  const figures: FigureLike[] = [];

  const abstract = abstractSection(front, counters.section);
  if (abstract !== null) {
    sections.push(abstract);
    counters.section += 1;
  }
  const keywords = keywordSection(front, counters.section);
  if (keywords !== null) {
    sections.push(keywords);
    counters.section += 1;
  }

  for (const element of body === null ? [] : children(body, 'sec')) {
    const harvest = harvestSection(element, 1, 'MAIN', counters);
    sections.push(...harvest.sections);
    figures.push(...harvest.figures);
  }
  // A JATS back matter carries the statements a journal requires — funding,
  // conflicts, availability — as sections in their own right, and losing them
  // would silently drop the declarations the readiness panel checks for.
  for (const element of back === null ? [] : children(back, 'sec, ack')) {
    const harvest = harvestSection(element, 1, 'MAIN', counters);
    sections.push(...harvest.sections);
    figures.push(...harvest.figures);
  }
  for (const element of back === null
    ? []
    : [
        ...back.querySelectorAll(
          'sec[sec-type="supplementary-material"] > sec',
        ),
      ]) {
    const harvest = harvestSection(element, 1, 'SUPPLEMENT', counters);
    sections.push(...harvest.sections);
    figures.push(...harvest.figures);
  }

  const references = [...(back?.querySelectorAll('ref-list > ref') ?? [])].map(
    referenceFrom,
  );

  return {
    manuscript: metadataFrom(front),
    sections,
    figures,
    references,
  };
};
