import { isNonEmptyString } from '@sniptt/guards';

import {
  parseManuscriptAffiliations,
  parseManuscriptAuthors,
} from './manuscriptContributors';
import { type SubmissionMaterials } from './manuscriptSubmission';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionLike,
} from './manuscriptTypes';

export const PORTABLE_MANUSCRIPT_FORMAT = 'researcher-manuscript' as const;
// v2 adds the journal template the manuscript was written against, so a
// restore brings its format back with it instead of falling back to whatever
// profile the workspace happens to default to. v1 packages still import.
//
// Footnotes arrived after v2 and did not move it either, and needed no field
// of their own: a note lives inside the sentence it is anchored to, as the
// inline `^[…]` token `manuscriptFootnotes` defines, so `section.content`
// already carries it word for word. That is the point of putting the note in
// the prose rather than in a table beside it — a paper exported and reimported
// gets its notes back through the field that was already there, and a build
// that has never heard of footnotes shows the token as text instead of
// refusing the package the way a version bump would make it.
//
// Panels and section reference keys arrived later still and did not move it
// either, for the same reason: `parentFigureKey`, `panelColumns` and a
// section's `refKey` are optional fields a reader that has never heard of them
// simply ignores — the figures still restore, as figures of their own, rather
// than the whole package being refused.
//
// Comments arrived later still and did not move it either. A section's
// `notes` is one more optional field on a section entry — a package written
// before comments existed simply has none, and a reader written before they
// existed carries the field across untouched or ignores it, either of which
// beats refusing the whole paper.
//
// Section versions arrived after v2 — and their rules after that — and
// deliberately did not move it. `variantOfKey`/`variantProfileKey`/
// `variantRules` are optional fields on a section entry: a package written
// before they existed imports exactly as it did, and a reader written before
// they existed ignores fields it does not know. A bump
// to 3 would buy nothing and cost the case that matters — an older copy of
// this app checks `PORTABLE_MANUSCRIPT_READABLE_VERSIONS` and would refuse the
// package outright, so an author carrying a paper to a machine that has not
// updated yet would lose the whole paper rather than a few versions of one
// section.
export const PORTABLE_MANUSCRIPT_VERSION = 2 as const;
export const PORTABLE_MANUSCRIPT_READABLE_VERSIONS = [1, 2];
export const PORTABLE_MANUSCRIPT_FILENAME = 'research-paper.json';

export type PortableManuscriptMetadata = {
  title: string;
  manuscriptType?: string;
  status?: string;
  targetVenue?: string;
  doi?: string;
  authorLine?: string;
  affiliations?: string;
  titlePageExtraLines?: string[];
  correspondingAuthor?: string;
  supplementTitle?: string;
  supplementAuthorLine?: string;
  supplementAffiliations?: string;
};

// The journal template the manuscript targets, carried whole so a restore can
// re-link it when the workspace already has it and re-create it when it does
// not. `profileKey` is the stable identity of a seeded template; `name` is the
// fallback for one the author wrote themselves.
export type PortableJournalTemplate = JournalStyle & {
  name: string;
};

export type PortableManuscriptSource = {
  manuscript: PortableManuscriptMetadata;
  sections: SectionLike[];
  figures: FigureLike[];
  references: ReferenceLike[];
  journal?: PortableJournalTemplate;
};

export type PortableResearchPaperManifest = {
  format: typeof PORTABLE_MANUSCRIPT_FORMAT;
  schemaVersion: typeof PORTABLE_MANUSCRIPT_VERSION;
  exportedAt: string;
  metadata: PortableManuscriptMetadata;
  contributors: {
    affiliations: Array<{ key: string; name: string; order: number }>;
    authors: Array<{
      key: string;
      name: string;
      affiliationKeys: string[];
      corresponding: boolean;
      order: number;
    }>;
  };
  sections: Array<{
    key: string;
    name: string;
    // The key an in-text `[#sec:…]` points at. Absent on a section the author
    // never named, which is most of them.
    refKey?: string;
    sectionType: string;
    placement: string;
    content: string;
    status: string;
    orderIndex: number;
    level?: number;
    wordLimit?: number;
    wordCount: number;
    includeInExport: boolean;
    // Set only on a section that is an alternative version of another one: the
    // key of the section it rewords, the journal profile it is pinned to, and
    // the rule it declares it satisfies. All three are absent on an ordinary
    // section — writing empty strings here would make every section look like a
    // version of nothing.
    variantOfKey?: string;
    variantProfileKey?: string;
    variantRules?: string;
    // The section's notes, which is where a co-author's comments and the
    // answers written to them live. Absent on a section that has none, so a
    // paper nobody has commented on travels exactly as it did before.
    notes?: string;
  }>;
  figures: Array<{
    key: string;
    name: string;
    refKey: string;
    sourceLabel?: string;
    caption: string;
    assetKind: string;
    placement: string;
    imageSource: string;
    numbered?: boolean;
    imageUrl?: string;
    imagePath?: string;
    altText?: string;
    credit?: string;
    widthPercent?: number;
    orderIndex: number;
    sectionKey?: string;
    tableData?: string;
    equationLatex?: string;
    diagramSource?: string;
    // A panel: the manifest key of the figure it is one cell of. Panels travel
    // as ordinary figure entries pointing at their parent, so a reader that
    // does not know about them restores a flat set of figures rather than
    // nothing at all.
    parentFigureKey?: string;
    // On a parent: how many panels sit side by side before the layout wraps.
    panelColumns?: number;
  }>;
  references: Array<{
    key: string;
    name: string;
    citationKey: string;
    cslType: string;
    authors?: string;
    year?: number;
    containerTitle?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    doi?: string;
    url?: string;
    cslJson?: string;
    notes?: string;
  }>;
  exportStyle: JournalStyle;
  // The manuscript's target journal record (v2+). `exportStyle` is the
  // resolved style used for this export; this is the template itself.
  journal?: PortableJournalTemplate;
  submissionMaterials: SubmissionMaterials;
};

const dataImageExtension = (
  value: string | null | undefined,
): string | null => {
  const mime = /^data:([^;,]+);base64,/s.exec(value ?? '')?.[1];
  const extensions: Record<string, string> = {
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/tiff': 'tif',
    'image/webp': 'webp',
  };
  return mime === undefined ? null : (extensions[mime] ?? null);
};

export const portableFigureImagePath = (
  refKey: string,
  imageUrl: string | null | undefined,
): string | null => {
  const extension = dataImageExtension(imageUrl);
  if (extension === null) return null;
  const safeKey = refKey.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'figure';
  return `portable-assets/${safeKey}.${extension}`;
};

// A version travels by the key this manifest gave its base, never by the base's
// record id: ids are local to one workspace, so a paper that changed machines
// would arrive with every version pointing at nothing. A `variantOfId` naming a
// section that is not in this package keeps its raw id here — that key resolves
// to nothing on the way back in, which is what makes the importer drop the
// orphan rather than restore it as a section of its own.
const portableSectionVariantFields = (
  section: SectionLike,
  sectionKeyById: ReadonlyMap<string, string>,
): {
  variantOfKey?: string;
  variantProfileKey?: string;
  variantRules?: string;
} => {
  const variantOfId = section.variantOfId?.trim();
  if (variantOfId === undefined || variantOfId.length === 0) return {};
  const variantProfileKey = section.variantProfileKey?.trim();
  // The rule travels beside the pin because it is the half that outlives this
  // workspace: a version described as "≤200 words" is usable by whatever
  // journals the receiving machine has, while a pin only means something there
  // if the same profile exists. Dropping it would land the paper with a version
  // that no journal ever picks.
  const variantRules = section.variantRules?.trim();
  return {
    variantOfKey: sectionKeyById.get(variantOfId) ?? variantOfId,
    ...(variantProfileKey !== undefined && variantProfileKey.length > 0
      ? { variantProfileKey }
      : {}),
    ...(variantRules !== undefined && variantRules.length > 0
      ? { variantRules }
      : {}),
  };
};

export const buildPortableResearchPaperManifest = (
  source: PortableManuscriptSource,
  exportStyle: JournalStyle,
  submissionMaterials: SubmissionMaterials,
): PortableResearchPaperManifest => {
  const affiliations = parseManuscriptAffiliations(
    source.manuscript.affiliations,
  );
  const authors = parseManuscriptAuthors(
    source.manuscript.authorLine,
    affiliations,
  );
  const sectionKeyById = new Map(
    source.sections.map((section, index) => [
      section.id,
      `section-${index + 1}`,
    ]),
  );
  const figureKeyById = new Map(
    source.figures.map((figure, index) => [figure.id, `figure-${index + 1}`]),
  );

  return {
    format: PORTABLE_MANUSCRIPT_FORMAT,
    schemaVersion: PORTABLE_MANUSCRIPT_VERSION,
    exportedAt: new Date().toISOString(),
    metadata: source.manuscript,
    contributors: {
      affiliations: affiliations.map((affiliation, index) => ({
        key: affiliation.id,
        name: affiliation.name,
        order: index,
      })),
      authors: authors.map((author, index) => ({
        key: author.id,
        name: author.name,
        affiliationKeys: author.affiliationIds,
        corresponding: author.isCorresponding,
        order: index,
      })),
    },
    sections: source.sections.map((section, index) => ({
      key: sectionKeyById.get(section.id) ?? `section-${index + 1}`,
      name: section.name ?? section.sectionType ?? 'Section',
      ...(isNonEmptyString(section.refKey?.trim())
        ? { refKey: (section.refKey as string).trim() }
        : {}),
      sectionType: section.sectionType ?? 'OTHER',
      placement: section.placement ?? 'MAIN',
      content: section.content ?? '',
      status: section.status ?? 'DRAFTING',
      orderIndex: section.orderIndex ?? index,
      level: section.level ?? 1,
      ...(section.wordLimit !== null && section.wordLimit !== undefined
        ? { wordLimit: section.wordLimit }
        : {}),
      wordCount: section.wordCount ?? 0,
      includeInExport: section.includeInExport !== false,
      ...(isNonEmptyString(section.notes) ? { notes: section.notes } : {}),
      ...portableSectionVariantFields(section, sectionKeyById),
    })),
    figures: source.figures.map((figure, index) => {
      const refKey = figure.refKey ?? `figure-${index + 1}`;
      const imagePath = portableFigureImagePath(refKey, figure.imageUrl);
      return {
        key: `figure-${index + 1}`,
        name: figure.name ?? `Figure ${index + 1}`,
        refKey,
        ...(figure.sourceLabel !== null && figure.sourceLabel !== undefined
          ? { sourceLabel: figure.sourceLabel }
          : {}),
        caption: figure.caption ?? '',
        assetKind: figure.assetKind ?? 'FIGURE',
        placement: figure.placement ?? 'MAIN',
        imageSource: figure.imageSource ?? 'NONE',
        // Only the off state travels: unset has always meant numbered.
        ...(figure.numbered === false ? { numbered: false } : {}),
        ...(imagePath !== null
          ? { imagePath }
          : figure.imageUrl !== null && figure.imageUrl !== undefined
            ? { imageUrl: figure.imageUrl }
            : {}),
        ...(figure.altText !== null && figure.altText !== undefined
          ? { altText: figure.altText }
          : {}),
        ...(figure.credit !== null && figure.credit !== undefined
          ? { credit: figure.credit }
          : {}),
        ...(figure.widthPercent !== null && figure.widthPercent !== undefined
          ? { widthPercent: figure.widthPercent }
          : {}),
        orderIndex: figure.orderIndex ?? index,
        ...(figure.sectionId !== null && figure.sectionId !== undefined
          ? { sectionKey: sectionKeyById.get(figure.sectionId) }
          : {}),
        ...(figure.tableData !== null && figure.tableData !== undefined
          ? { tableData: figure.tableData }
          : {}),
        ...(figure.equationLatex !== null && figure.equationLatex !== undefined
          ? { equationLatex: figure.equationLatex }
          : {}),
        ...(figure.diagramSource !== null && figure.diagramSource !== undefined
          ? { diagramSource: figure.diagramSource }
          : {}),
        ...(isNonEmptyString(figure.parentFigureId?.trim()) &&
        figureKeyById.has(figure.parentFigureId as string)
          ? {
              parentFigureKey: figureKeyById.get(
                figure.parentFigureId as string,
              ),
            }
          : {}),
        ...(figure.panelColumns !== null && figure.panelColumns !== undefined
          ? { panelColumns: figure.panelColumns }
          : {}),
      };
    }),
    references: source.references.map((reference, index) => ({
      key: `reference-${index + 1}`,
      name: reference.name ?? 'Untitled reference',
      citationKey: reference.citationKey ?? reference.id,
      cslType: reference.cslType ?? 'OTHER',
      ...(reference.authors !== null && reference.authors !== undefined
        ? { authors: reference.authors }
        : {}),
      ...(reference.year !== null && reference.year !== undefined
        ? { year: reference.year }
        : {}),
      ...(reference.containerTitle !== null &&
      reference.containerTitle !== undefined
        ? { containerTitle: reference.containerTitle }
        : {}),
      ...(reference.volume !== null && reference.volume !== undefined
        ? { volume: reference.volume }
        : {}),
      ...(reference.issue !== null && reference.issue !== undefined
        ? { issue: reference.issue }
        : {}),
      ...(reference.pages !== null && reference.pages !== undefined
        ? { pages: reference.pages }
        : {}),
      ...(reference.doi !== null && reference.doi !== undefined
        ? { doi: reference.doi }
        : {}),
      ...(reference.url !== null && reference.url !== undefined
        ? { url: reference.url }
        : {}),
      ...(reference.cslJson !== null && reference.cslJson !== undefined
        ? { cslJson: reference.cslJson }
        : {}),
      ...(reference.notes !== null && reference.notes !== undefined
        ? { notes: reference.notes }
        : {}),
    })),
    exportStyle,
    ...(source.journal !== undefined ? { journal: source.journal } : {}),
    submissionMaterials,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parsePortableResearchPaperManifest = (
  value: string,
): PortableResearchPaperManifest => {
  const parsed: unknown = JSON.parse(value);
  if (
    !isRecord(parsed) ||
    parsed.format !== PORTABLE_MANUSCRIPT_FORMAT ||
    !PORTABLE_MANUSCRIPT_READABLE_VERSIONS.includes(
      parsed.schemaVersion as number,
    ) ||
    !isRecord(parsed.metadata) ||
    typeof parsed.metadata.title !== 'string' ||
    !isRecord(parsed.contributors) ||
    !Array.isArray(parsed.sections) ||
    !Array.isArray(parsed.figures) ||
    !Array.isArray(parsed.references) ||
    !isRecord(parsed.exportStyle) ||
    !isRecord(parsed.submissionMaterials)
  ) {
    throw new Error('Unsupported or invalid research-paper manifest');
  }
  const manifest = parsed as PortableResearchPaperManifest;
  return {
    ...manifest,
    sections: manifest.sections.map((section) => ({
      ...section,
      level: section.level ?? 1,
    })),
  };
};
