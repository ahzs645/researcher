import { isNonEmptyString } from '@sniptt/guards';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import { parseMarkdownTable } from './manuscriptTables';
import { type NumberedFigure } from './manuscriptTypes';

// ANSI/NISO Z39.96 JATS — the exchange format publishers, preprint servers and
// PubMed Central actually ingest, and the article payload of a MECA transfer
// package. Built from the same bundle as every other exporter; structured
// (CSL) reference data rides along so <element-citation> stays machine-readable.

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Inline Markdown → JATS inline elements. Citations/cross-refs are already
// rendered to their final labels by the bundle, so they stay plain text.
const inlineToJats = (markdown: string): string => {
  let out = escapeXml(markdown);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<bold>$1</bold>');
  out = out.replace(/\*([^*]+)\*/g, '<italic>$1</italic>');
  out = out.replace(/`([^`]+)`/g, '<monospace>$1</monospace>');
  out = out.replace(
    /\$\$([^$]+)\$\$/g,
    '<disp-formula><tex-math>$1</tex-math></disp-formula>',
  );
  out = out.replace(
    /\$([^$\n]+)\$/g,
    '<inline-formula><tex-math>$1</tex-math></inline-formula>',
  );
  return out;
};

const proseToJats = (markdown: string): string =>
  markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `    <p>${inlineToJats(paragraph)}</p>`)
    .join('\n');

const figureHref = (figure: NumberedFigure): string | null => {
  const imageUrl = figure.imageUrl ?? '';
  if (/^data:image\//.test(imageUrl)) {
    const extension = /^data:image\/([a-z+]+)/i.exec(imageUrl)?.[1] ?? 'png';
    return `figures/${figure.refKey ?? figure.id}.${extension.replace('svg+xml', 'svg')}`;
  }
  return isNonEmptyString(imageUrl) ? imageUrl : null;
};

const tableGridToJats = (tableData: string): string => {
  const rows = parseMarkdownTable(tableData);
  if (rows.length === 0) return '';
  const [header, ...body] = rows;
  const cell = (tag: string) => (value: string) =>
    `      <${tag}>${inlineToJats(value)}</${tag}>`;
  return [
    '    <table>',
    '     <thead>',
    `      <tr>${header.map(cell('th')).join('')}</tr>`,
    '     </thead>',
    '     <tbody>',
    ...body.map((row) => `      <tr>${row.map(cell('td')).join('')}</tr>`),
    '     </tbody>',
    '    </table>',
  ].join('\n');
};

const figureToJats = (figure: NumberedFigure): string => {
  const caption = isNonEmptyString(figure.caption)
    ? `<caption><p>${inlineToJats(figure.caption)}</p></caption>`
    : '';
  if (figure.assetKind === 'EQUATION') {
    return [
      `   <disp-formula id="${escapeXml(figure.refKey ?? figure.id)}">`,
      `    <label>${escapeXml(figure.label)}</label>`,
      `    <tex-math>${escapeXml((figure.equationLatex ?? '').trim())}</tex-math>`,
      '   </disp-formula>',
    ].join('\n');
  }
  if (figure.assetKind === 'TABLE') {
    return [
      `   <table-wrap id="${escapeXml(figure.refKey ?? figure.id)}">`,
      `    <label>${escapeXml(figure.label)}</label>`,
      caption,
      tableGridToJats(figure.tableData ?? ''),
      '   </table-wrap>',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }
  const href = figureHref(figure);
  return [
    `   <fig id="${escapeXml(figure.refKey ?? figure.id)}">`,
    `    <label>${escapeXml(figure.label)}</label>`,
    caption,
    ...(href !== null
      ? [`    <graphic xlink:href="${escapeXml(href)}"/>`]
      : []),
    '   </fig>',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
};

const CSL_PUBLICATION_TYPE: Record<string, string> = {
  'article-journal': 'journal',
  'paper-conference': 'confproc',
  book: 'book',
  chapter: 'bookchapter',
  thesis: 'thesis',
  report: 'report',
  webpage: 'webpage',
  dataset: 'data',
  preprint: 'preprint',
  software: 'software',
};

const cslItemToRefJats = (item: Record<string, unknown>): string => {
  const id = escapeXml(String(item.id ?? ''));
  const type = CSL_PUBLICATION_TYPE[String(item.type)] ?? 'other';
  const lines: string[] = [
    `   <ref id="${id}">`,
    `    <element-citation publication-type="${type}">`,
  ];
  const authors = Array.isArray(item.author) ? item.author : [];
  if (authors.length > 0) {
    lines.push('     <person-group person-group-type="author">');
    for (const author of authors) {
      const record = author as {
        family?: string;
        given?: string;
        literal?: string;
      };
      const name = isNonEmptyString(record.literal)
        ? record.literal
        : [record.family, record.given].filter(isNonEmptyString).join(', ');
      if (name.length > 0) {
        lines.push(`      <string-name>${escapeXml(name)}</string-name>`);
      }
    }
    lines.push('     </person-group>');
  }
  const issued = (item.issued as { 'date-parts'?: unknown } | undefined)?.[
    'date-parts'
  ];
  const year =
    Array.isArray(issued) && Array.isArray(issued[0])
      ? issued[0][0]
      : undefined;
  if (typeof year === 'number' || typeof year === 'string') {
    lines.push(`     <year>${escapeXml(String(year))}</year>`);
  }
  if (isNonEmptyString(item.title)) {
    lines.push(`     <article-title>${escapeXml(item.title)}</article-title>`);
  }
  if (isNonEmptyString(item['container-title'])) {
    lines.push(`     <source>${escapeXml(item['container-title'])}</source>`);
  }
  if (isNonEmptyString(item.volume)) {
    lines.push(`     <volume>${escapeXml(item.volume)}</volume>`);
  }
  if (isNonEmptyString(item.issue)) {
    lines.push(`     <issue>${escapeXml(item.issue)}</issue>`);
  }
  if (isNonEmptyString(item.page)) {
    const [first, last] = item.page.split('-');
    lines.push(`     <fpage>${escapeXml(first ?? '')}</fpage>`);
    if (isNonEmptyString(last)) {
      lines.push(`     <lpage>${escapeXml(last)}</lpage>`);
    }
  }
  if (isNonEmptyString(item.DOI)) {
    lines.push(
      `     <pub-id pub-id-type="doi">${escapeXml(item.DOI)}</pub-id>`,
    );
  }
  if (isNonEmptyString(item.URL)) {
    lines.push(`     <uri>${escapeXml(item.URL)}</uri>`);
  }
  lines.push('    </element-citation>', '   </ref>');
  return lines.join('\n');
};

const SUPPLEMENT_HEADING = 'Supplementary Material';

type JatsPart = { body: string[]; back: string[]; supplement: string[] };

const nodesToJats = (bundle: ManuscriptBundle): JatsPart => {
  const part: JatsPart = { body: [], back: [], supplement: [] };
  let openLevels: number[] = [];
  let inSupplement = false;
  let inBack = false;
  const target = () => (inSupplement ? part.supplement : part.body);

  const closeTo = (level: number): void => {
    while (openLevels.length > 0 && openLevels.at(-1)! >= level) {
      openLevels.pop();
      target().push('   </sec>');
    }
  };

  bundle.nodes.forEach((node, index) => {
    // The bundle's "Supplementary Material" marker can arrive after the
    // bibliography node — the supplement goes to its own JATS part either way.
    if (
      node.kind === 'heading' &&
      node.level === 1 &&
      node.text === SUPPLEMENT_HEADING
    ) {
      if (!inBack) closeTo(0);
      inSupplement = true;
      return;
    }
    if (node.kind === 'bibliography') {
      closeTo(0);
      inBack = true;
      part.back.push(
        '  <back>',
        '   <ref-list>',
        '    <title>References</title>',
      );
      part.back.push(...bundle.cslJson.map(cslItemToRefJats));
      part.back.push('   </ref-list>', '  </back>');
      return;
    }
    if (inBack && !inSupplement) return;
    if (node.kind === 'heading') {
      // The bundle's generated "References" heading precedes the bibliography
      // node; <ref-list> carries its own title, so skip it.
      const next = bundle.nodes[index + 1];
      if (next?.kind === 'bibliography') return;
      if (node.level === 1 && node.text === SUPPLEMENT_HEADING) {
        closeTo(0);
        inSupplement = true;
        return;
      }
      closeTo(node.level);
      openLevels.push(node.level);
      target().push('   <sec>', `    <title>${escapeXml(node.text)}</title>`);
      return;
    }
    if (node.kind === 'prose') {
      const paragraphs = proseToJats(node.markdown);
      if (paragraphs.length > 0) target().push(paragraphs);
      return;
    }
    target().push(figureToJats(node.figure));
  });
  closeTo(0);
  return part;
};

export const buildJatsArticle = (bundle: ManuscriptBundle): string => {
  const { metadata } = bundle;
  const part = nodesToJats(bundle);
  const authors = metadata.authors
    .split(';')
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
  const affiliations = metadata.affiliations
    .split('\n')
    .map((affiliation) => affiliation.trim())
    .filter((affiliation) => affiliation.length > 0);
  const doi = bundle.sourceInput.manuscript.doi;

  const front = [
    '  <front>',
    ...(isNonEmptyString(metadata.journal)
      ? [
          '   <journal-meta>',
          `    <journal-title>${escapeXml(metadata.journal)}</journal-title>`,
          '   </journal-meta>',
        ]
      : []),
    '   <article-meta>',
    ...(isNonEmptyString(doi)
      ? [`    <article-id pub-id-type="doi">${escapeXml(doi)}</article-id>`]
      : []),
    '    <title-group>',
    `     <article-title>${escapeXml(metadata.title)}</article-title>`,
    '    </title-group>',
    ...(authors.length > 0
      ? [
          '    <contrib-group>',
          ...authors.map(
            (author) =>
              `     <contrib contrib-type="author"><string-name>${escapeXml(author)}</string-name></contrib>`,
          ),
          '    </contrib-group>',
        ]
      : []),
    ...affiliations.map(
      (affiliation) => `    <aff>${escapeXml(affiliation)}</aff>`,
    ),
    ...(isNonEmptyString(metadata.correspondingAuthor)
      ? [
          '    <author-notes>',
          `     <corresp>${escapeXml(metadata.correspondingAuthor)}</corresp>`,
          '    </author-notes>',
        ]
      : []),
    ...(isNonEmptyString(metadata.abstract)
      ? [
          '    <abstract>',
          `     <p>${inlineToJats(metadata.abstract)}</p>`,
          '    </abstract>',
        ]
      : []),
    ...(metadata.keywords.length > 0
      ? [
          '    <kwd-group>',
          ...metadata.keywords.map(
            (keyword) => `     <kwd>${escapeXml(keyword)}</kwd>`,
          ),
          '    </kwd-group>',
        ]
      : []),
    '   </article-meta>',
    '  </front>',
  ];

  const supplement =
    part.supplement.length > 0
      ? [
          '  <supplementary-material>',
          `   <title>${SUPPLEMENT_HEADING}</title>`,
          ...part.supplement,
          '  </supplementary-material>',
        ]
      : [];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.3 20210610//EN" "JATS-archivearticle1-3.dtd">',
    '<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">',
    ...front,
    '  <body>',
    ...part.body,
    '  </body>',
    ...part.back,
    ...supplement,
    '</article>',
    '',
  ].join('\n');
};

export const jatsXmlExporter: ManuscriptExporter = {
  id: 'jats-xml',
  label: 'JATS XML',
  formats: ['JATS', 'XML'],
  offline: true,
  export: async (bundle): Promise<ExportFile[]> => {
    const formattedBundle = await prepareManuscriptBundleWithCsl(bundle);
    return [
      {
        filename: `${slugifyTitle(formattedBundle.metadata.title)}.jats.xml`,
        mimeType: 'application/xml',
        content: buildJatsArticle(formattedBundle),
      },
    ];
  },
};
