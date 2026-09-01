import { isNonEmptyString } from '@sniptt/guards';

import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import {
  CREDIT_VOCABULARY_IDENTIFIER,
  classifyFunderIdentifier,
  creditRoleUri,
  orcidUri,
  orderCreditRoles,
  rorUri,
} from './manuscriptContributorIdentifiers';
import {
  isEmptyManuscriptContributorMetadata,
  joinManuscriptAffiliationDetails,
  joinManuscriptContributorDetails,
  readManuscriptContributorMetadata,
  renderManuscriptFundingStatement,
  type ManuscriptAffiliationWithDetail,
  type ManuscriptAuthorWithDetail,
  type ManuscriptContributorMetadata,
} from './manuscriptContributorMetadata';
import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
} from './manuscriptContributors';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { prepareManuscriptDiagramImages } from './manuscriptDiagram';
import { hasAuthoredSectionKey } from './manuscriptNumbering';
import { type ExportFile, type ManuscriptExporter } from './manuscriptExport';
import {
  numberManuscriptFootnotes,
  splitManuscriptFootnotes,
  type ManuscriptFootnote,
} from './manuscriptFootnotes';
import {
  parseManuscriptTableGrid,
  type ManuscriptTableCell,
} from './manuscriptTableGrid';
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
const inlineMarkupToJats = (markdown: string): string => {
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

// A footnote is the one inline construct that is not spelled out where it
// stands: the anchor is an <xref> and the note itself goes to a <fn-group> in
// the back matter, which is what a publisher's ingest expects to find. A note
// that never went through the numbering step has no id to point at, so it is
// written inline as a bare <fn> — legal inside a <p>, and the alternative
// would be to drop it.
const footnoteToJats = (number: number | undefined, text: string): string =>
  number === undefined
    ? `<fn><p>${inlineMarkupToJats(text)}</p></fn>`
    : `<xref ref-type="fn" rid="fn${number}">${number}</xref>`;

const inlineToJats = (markdown: string): string =>
  splitManuscriptFootnotes(markdown)
    .map((segment) =>
      segment.kind === 'text'
        ? inlineMarkupToJats(segment.value)
        : footnoteToJats(segment.number, segment.text),
    )
    .join('');

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
  const grid = parseManuscriptTableGrid(tableData);
  if (grid.rows.length === 0) return '';
  const cell =
    (tag: string) =>
    (value: ManuscriptTableCell): string => {
      const span = [
        value.colSpan > 1 ? ` colspan="${value.colSpan}"` : '',
        value.rowSpan > 1 ? ` rowspan="${value.rowSpan}"` : '',
      ].join('');
      return `      <${tag}${span}>${inlineToJats(value.text)}</${tag}>`;
    };
  const header = grid.rows.slice(0, grid.headerRows);
  const body = grid.rows.slice(grid.headerRows);
  return [
    '    <table>',
    ...(header.length > 0
      ? [
          '     <thead>',
          ...header.map(
            (row) => `      <tr>${row.map(cell('th')).join('')}</tr>`,
          ),
          '     </thead>',
        ]
      : []),
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
  // A figure made of panels is a <fig-group>: JATS models exactly this — one
  // labelled, captioned group whose children are the panels, each with its own
  // id and its own "(a)" label. That id is what a publisher's tooling points a
  // panel-level <xref> at.
  const panels = figure.panels ?? [];
  if (panels.length > 0) {
    return [
      `   <fig-group id="${escapeXml(figure.refKey ?? figure.id)}">`,
      `    <label>${escapeXml(figure.label)}</label>`,
      caption,
      ...panels.flatMap((panel) => {
        const panelHref = figureHref(panel);
        const panelCaption = isNonEmptyString(panel.caption)
          ? `<caption><p>${inlineToJats(panel.caption)}</p></caption>`
          : '';
        return [
          `    <fig id="${escapeXml(panel.refKey ?? panel.id)}">`,
          `     <label>${escapeXml(panel.label)}</label>`,
          panelCaption,
          ...(panelHref !== null
            ? [`     <graphic xlink:href="${escapeXml(panelHref)}"/>`]
            : []),
          '    </fig>',
        ].filter((line) => line.length > 0);
      }),
      '   </fig-group>',
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

// The back matter's notes, one <fn> per anchor, carrying the printed number as
// its <label> so a reader that does not renumber still shows what the body's
// <xref> says.
const footnoteGroupToJats = (
  footnotes: readonly ManuscriptFootnote[],
): string[] =>
  footnotes.length === 0
    ? []
    : [
        '   <fn-group>',
        ...footnotes.flatMap((footnote) => [
          `    <fn id="fn${footnote.number}">`,
          `     <label>${footnote.number}</label>`,
          `     <p>${inlineToJats(footnote.text)}</p>`,
          '    </fn>',
        ]),
        '   </fn-group>',
      ];

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
      // The <back> wrapper is added by the caller: the reference list is no
      // longer the only thing that lives in it, and a paper with footnotes but
      // no references still needs one.
      part.back.push('   <ref-list>', '    <title>References</title>');
      part.back.push(...bundle.cslJson.map(cslItemToRefJats));
      part.back.push('   </ref-list>');
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
      // The section's own key becomes the <sec> id, so the thing a
      // `[#sec:methods]` names in the composer is the thing an ingest can
      // point at here.
      const sectionId =
        node.section !== undefined && hasAuthoredSectionKey(node.section)
          ? node.section.referenceKey
          : '';
      target().push(
        sectionId.length === 0
          ? '   <sec>'
          : `   <sec id="${escapeXml(sectionId)}">`,
        `    <title>${escapeXml(node.text)}</title>`,
      );
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

// JATS4R asks for the resolvable ORCID URI, the CRediT term paired with both
// vocabulary URIs, and a ROR carried inside <institution-wrap> beside the
// institution it identifies.
const contribToJats = (
  author: ManuscriptAuthorWithDetail,
  affiliationXmlIdById: ReadonlyMap<string, string>,
): string[] => {
  const { detail } = author;
  const orcid = orcidUri(detail.orcid);
  const attributes = [
    ' contrib-type="author"',
    author.isCorresponding ? ' corresp="yes"' : '',
    detail.isEqualContributor === true ? ' equal-contrib="yes"' : '',
    detail.isDeceased === true ? ' deceased="yes"' : '',
  ].join('');
  return [
    `     <contrib${attributes}>`,
    // A mistyped ORCID is emitted as no ORCID at all: publishing one that
    // fails its checksum attaches the paper to a stranger.
    ...(orcid !== null
      ? [
          `      <contrib-id contrib-id-type="orcid">${escapeXml(orcid)}</contrib-id>`,
        ]
      : []),
    `      <string-name>${escapeXml(author.name)}</string-name>`,
    ...(isNonEmptyString(detail.email)
      ? [`      <email>${escapeXml(detail.email)}</email>`]
      : []),
    ...orderCreditRoles(detail.creditRoles).map(
      (role) =>
        `      <role vocab="credit" vocab-identifier="${CREDIT_VOCABULARY_IDENTIFIER}" vocab-term="${escapeXml(role)}" vocab-term-identifier="${creditRoleUri(role)}">${escapeXml(role)}</role>`,
    ),
    ...author.affiliationIds.flatMap((affiliationId) => {
      const xmlId = affiliationXmlIdById.get(affiliationId);
      return xmlId === undefined
        ? []
        : [`      <xref ref-type="aff" rid="${xmlId}"/>`];
    }),
    ...(isNonEmptyString(detail.note)
      ? [
          `      <author-comment><p>${escapeXml(detail.note)}</p></author-comment>`,
        ]
      : []),
    '     </contrib>',
  ];
};

const affiliationToJats = (
  affiliation: ManuscriptAffiliationWithDetail,
  xmlId: string,
): string[] => {
  const { detail } = affiliation;
  const ror = rorUri(detail.ror);
  const addressLine = (tag: string, value: string | undefined): string[] =>
    isNonEmptyString(value)
      ? [`     <${tag}>${escapeXml(value)}</${tag}>`]
      : [];
  return [
    `    <aff id="${xmlId}">`,
    '     <institution-wrap>',
    ...(isNonEmptyString(detail.department)
      ? [
          `      <institution content-type="dept">${escapeXml(detail.department)}</institution>`,
        ]
      : []),
    `      <institution>${escapeXml(affiliation.name)}</institution>`,
    ...(ror !== null
      ? [
          `      <institution-id institution-id-type="ror">${escapeXml(ror)}</institution-id>`,
        ]
      : []),
    '     </institution-wrap>',
    ...addressLine('city', detail.city),
    ...addressLine('state', detail.state),
    ...addressLine('country', detail.country),
    '    </aff>',
  ];
};

const fundingGroupToJats = (
  contributorMetadata: ManuscriptContributorMetadata,
  authors: ManuscriptAuthorWithDetail[],
): string[] => {
  const awards = contributorMetadata.funding.filter(
    (award) =>
      isNonEmptyString(award.funder) || isNonEmptyString(award.awardId),
  );
  if (awards.length === 0) return [];
  const statement = renderManuscriptFundingStatement(
    authors,
    contributorMetadata,
  );
  return [
    '    <funding-group>',
    ...awards.flatMap((award) => {
      const funderIdentifier = classifyFunderIdentifier(award.funderIdentifier);
      const recipients = [
        ...(award.recipientAuthorIds ?? []).flatMap((id) => {
          const author = authors.find((candidate) => candidate.id === id);
          return author === undefined ? [] : [author.name];
        }),
        ...(isNonEmptyString(award.recipient) ? [award.recipient] : []),
      ];
      return [
        `     <award-group id="${escapeXml(award.id)}">`,
        ...(isNonEmptyString(award.funder)
          ? [
              '      <funding-source>',
              '       <institution-wrap>',
              `        <institution>${escapeXml(award.funder)}</institution>`,
              ...(funderIdentifier !== null
                ? [
                    `        <institution-id institution-id-type="${funderIdentifier.type}">${escapeXml(funderIdentifier.value)}</institution-id>`,
                  ]
                : []),
              '       </institution-wrap>',
              '      </funding-source>',
            ]
          : []),
        ...(isNonEmptyString(award.awardId)
          ? [`      <award-id>${escapeXml(award.awardId)}</award-id>`]
          : []),
        ...recipients.map((recipient) =>
          [
            '      <principal-award-recipient>',
            `       <string-name>${escapeXml(recipient)}</string-name>`,
            '      </principal-award-recipient>',
          ].join('\n'),
        ),
        '     </award-group>',
      ];
    }),
    ...(statement.length > 0
      ? [`     <funding-statement>${escapeXml(statement)}</funding-statement>`]
      : []),
    '    </funding-group>',
  ];
};

type ContributorFrontMatter = {
  contribGroup: string[];
  affiliations: string[];
  funding: string[];
};

// Without structured metadata this reproduces exactly what the exporter always
// wrote — one flat <contrib> per byline chunk and one <aff> per affiliation
// line. Nothing about an existing manuscript's output may move just because
// the structured layer now exists.
const contributorFrontMatter = (
  bundle: ManuscriptBundle,
  contributorMetadata: ManuscriptContributorMetadata,
): ContributorFrontMatter => {
  const { metadata } = bundle;
  if (isEmptyManuscriptContributorMetadata(contributorMetadata)) {
    const authors = metadata.authors
      .split(';')
      .map((author) => author.trim())
      .filter((author) => author.length > 0);
    const affiliations = metadata.affiliations
      .split('\n')
      .map((affiliation) => affiliation.trim())
      .filter((affiliation) => affiliation.length > 0);
    return {
      contribGroup:
        authors.length > 0
          ? [
              '    <contrib-group>',
              ...authors.map(
                (author) =>
                  `     <contrib contrib-type="author"><string-name>${escapeXml(author)}</string-name></contrib>`,
              ),
              '    </contrib-group>',
            ]
          : [],
      affiliations: affiliations.map(
        (affiliation) => `    <aff>${escapeXml(affiliation)}</aff>`,
      ),
      funding: [],
    };
  }

  // With metadata in hand the byline is parsed rather than split, so the
  // affiliation markers become real <xref>s instead of riding along inside
  // the printed name.
  const parsedAffiliations = parseManuscriptAffiliations(metadata.affiliations);
  const affiliations = joinManuscriptAffiliationDetails(
    parsedAffiliations,
    contributorMetadata,
  );
  const authors = joinManuscriptContributorDetails(
    parseManuscriptAuthors(metadata.authors, parsedAffiliations),
    contributorMetadata,
  );
  const affiliationXmlIdById = new Map(
    affiliations.map((affiliation, index) => [
      affiliation.id,
      `aff${index + 1}`,
    ]),
  );
  return {
    contribGroup:
      authors.length > 0
        ? [
            '    <contrib-group>',
            ...authors.flatMap((author) =>
              contribToJats(author, affiliationXmlIdById),
            ),
            '    </contrib-group>',
          ]
        : [],
    affiliations: affiliations.flatMap((affiliation, index) =>
      affiliationToJats(affiliation, `aff${index + 1}`),
    ),
    funding: fundingGroupToJats(contributorMetadata, authors),
  };
};

export const buildJatsArticle = (
  bundle: ManuscriptBundle,
  // Defaults to whatever the manuscript record carries, so every existing
  // caller picks the structured block up without changing its call.
  contributorMetadata: ManuscriptContributorMetadata = readManuscriptContributorMetadata(
    bundle.sourceInput.manuscript,
  ),
): string => {
  // Numbered first, so every <xref ref-type="fn"> below points at an <fn> that
  // is actually written, and the numbers run in the order the article reads.
  const { bundle: numbered, footnotes } = numberManuscriptFootnotes(bundle);
  const { metadata } = numbered;
  const part = nodesToJats(numbered);
  const contributors = contributorFrontMatter(numbered, contributorMetadata);
  const doi = numbered.sourceInput.manuscript.doi;

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
    ...contributors.contribGroup,
    ...contributors.affiliations,
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
    // <funding-group> sits after the keywords, where the JATS article-meta
    // content model puts it.
    ...contributors.funding,
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

  const backContent = [...part.back, ...footnoteGroupToJats(footnotes)];
  const back =
    backContent.length > 0 ? ['  <back>', ...backContent, '  </back>'] : [];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.3 20210610//EN" "JATS-archivearticle1-3.dtd">',
    '<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">',
    ...front,
    '  <body>',
    ...part.body,
    '  </body>',
    ...back,
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
    // A diagram's picture only exists once Mermaid has drawn it; without this
    // the <fig> would carry no <graphic> at all.
    const formattedBundle = await prepareManuscriptDiagramImages(
      await prepareManuscriptBundleWithCsl(bundle),
    );
    return [
      {
        filename: `${slugifyTitle(formattedBundle.metadata.title)}.jats.xml`,
        mimeType: 'application/xml',
        content: buildJatsArticle(formattedBundle),
      },
    ];
  },
};
