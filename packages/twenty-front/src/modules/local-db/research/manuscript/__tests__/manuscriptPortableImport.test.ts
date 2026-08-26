import { type ImportedSectionDraft } from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  portableSectionVariantUpdates,
  preparePortableResearchPaperImport,
} from '@/local-db/research/manuscript/manuscriptPortableImport';
import {
  buildPortableResearchPaperManifest,
  parsePortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_FORMAT,
  PORTABLE_MANUSCRIPT_VERSION,
  type PortableManuscriptSource,
  type PortableResearchPaperManifest,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';

const MDPI_PROFILE = 'myst:tex/myst/mdpi:atmosphere';
const ARXIV_PROFILE = 'myst:tex/myst/arxiv';

const sourceWithVersions = (): PortableManuscriptSource => ({
  manuscript: { title: 'Brown carbon over the boreal forest' },
  sections: [
    {
      id: 'abstract-id',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      content: 'The unabridged abstract.',
      orderIndex: 0,
      wordCount: 3,
    },
    {
      id: 'introduction-id',
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'Brown carbon absorbs.',
      orderIndex: 1,
      wordCount: 3,
    },
    {
      id: 'abstract-mdpi-id',
      name: 'Abstract (MDPI)',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      content: 'The 200-word abstract.',
      orderIndex: 2,
      wordCount: 3,
      variantOfId: 'abstract-id',
      variantProfileKey: MDPI_PROFILE,
    },
    {
      id: 'abstract-arxiv-id',
      name: 'Abstract (arXiv)',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      content: 'The 320-word abstract.',
      orderIndex: 3,
      wordCount: 3,
      variantOfId: 'abstract-id',
      variantProfileKey: ARXIV_PROFILE,
    },
  ],
  figures: [],
  references: [],
});

// The package as it reaches the importer: written to JSON, read back, and its
// sections turned into drafts the way the file reader does.
const readBack = (
  source: PortableManuscriptSource,
): PortableResearchPaperManifest =>
  parsePortableResearchPaperManifest(
    JSON.stringify(buildPortableResearchPaperManifest(source, {}, {})),
  );

const sectionDrafts = (
  manifest: PortableResearchPaperManifest,
): ImportedSectionDraft[] =>
  manifest.sections.map((section) => ({
    name: section.name,
    sectionType: section.sectionType,
    placement: section.placement,
    content: section.content,
    orderIndex: section.orderIndex,
    level: section.level ?? 1,
    wordCount: section.wordCount,
    includeInExport: section.includeInExport,
    status: section.status,
  }));

// What the commit step does with those drafts: create a record per section and
// remember the new id by `orderIndex`, which is the handle the variant links
// and the figure links both come back as.
const createSections = (
  drafts: ImportedSectionDraft[],
): {
  records: Array<{ id: string } & ImportedSectionDraft>;
  idsByOrderIndex: Map<number, string>;
} => {
  const idsByOrderIndex = new Map<number, string>();
  const records = drafts.map((draft, index) => {
    const id = `created-${index + 1}`;
    idsByOrderIndex.set(draft.orderIndex, id);
    return { id, ...draft };
  });
  return { records, idsByOrderIndex };
};

describe('portable import of section versions', () => {
  it('lands each version on the section it is a version of', () => {
    const manifest = readBack(sourceWithVersions());
    const prepared = preparePortableResearchPaperImport(
      manifest,
      sectionDrafts(manifest),
    );
    const { records, idsByOrderIndex } = createSections(prepared.sections);
    const updates = portableSectionVariantUpdates(
      prepared.sectionVariants ?? [],
      idsByOrderIndex,
    );

    // Nothing is lost on the way over: the two versions still exist as their
    // own sections, and each points at the abstract's new id.
    expect(prepared.sections).toHaveLength(4);
    expect(prepared.warnings).toEqual([]);
    const abstractId = records[0].id;
    expect(updates).toEqual([
      {
        sectionId: records[2].id,
        variantOfId: abstractId,
        variantProfileKey: MDPI_PROFILE,
      },
      {
        sectionId: records[3].id,
        variantOfId: abstractId,
        variantProfileKey: ARXIV_PROFILE,
      },
    ]);
    expect(records[2].content).toBe('The 200-word abstract.');
    expect(records[3].content).toBe('The 320-word abstract.');
    // A version points at the base, never at another version.
    expect(updates.map((update) => update.variantOfId)).not.toContain(
      records[2].id,
    );
  });

  it('keeps both journals’ versions of the same abstract apart', () => {
    const manifest = readBack(sourceWithVersions());
    const prepared = preparePortableResearchPaperImport(
      manifest,
      sectionDrafts(manifest),
    );
    const { idsByOrderIndex } = createSections(prepared.sections);
    const profiles = portableSectionVariantUpdates(
      prepared.sectionVariants ?? [],
      idsByOrderIndex,
    ).map((update) => update.variantProfileKey);

    expect(profiles).toEqual([MDPI_PROFILE, ARXIV_PROFILE]);
    expect(new Set(profiles).size).toBe(2);
  });

  it('drops a version whose base is missing, and warns instead of going quiet', () => {
    const source = sourceWithVersions();
    // The abstract the two versions belong to never made it into the package.
    source.sections = source.sections.filter(
      (section) => section.id !== 'abstract-id',
    );
    const manifest = readBack(source);
    const prepared = preparePortableResearchPaperImport(
      manifest,
      sectionDrafts(manifest),
    );

    // A version restored on its own would export as a second abstract, so it
    // is left out — but the author is told, because it was work they wrote.
    expect(prepared.sections.map((section) => section.name)).toEqual([
      'Introduction',
    ]);
    expect(prepared.sectionVariants).toEqual([]);
    const warnings = prepared.warnings ?? [];
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Abstract (MDPI)');
    expect(warnings[0]).toContain(MDPI_PROFILE);
    expect(warnings[0]).toContain('not imported');
    expect(warnings[1]).toContain('Abstract (arXiv)');
  });

  it('leaves a version unlinked when its base was never created', () => {
    const manifest = readBack(sourceWithVersions());
    const prepared = preparePortableResearchPaperImport(
      manifest,
      sectionDrafts(manifest),
    );
    const { idsByOrderIndex } = createSections(prepared.sections);
    idsByOrderIndex.delete(0);

    // Half a link would attach the version to whatever id came back next; no
    // link at least leaves a readable section behind.
    expect(
      portableSectionVariantUpdates(
        prepared.sectionVariants ?? [],
        idsByOrderIndex,
      ),
    ).toEqual([]);
  });
});

describe('portable import of a package written before versions existed', () => {
  // Hand-built rather than exported, so it is the file the previous release
  // actually wrote: schema v2, and not a variant field anywhere in it.
  const legacyManifest: PortableResearchPaperManifest = {
    format: PORTABLE_MANUSCRIPT_FORMAT,
    schemaVersion: PORTABLE_MANUSCRIPT_VERSION,
    exportedAt: '2026-01-04T09:30:00.000Z',
    metadata: { title: 'A paper from before versions' },
    contributors: { affiliations: [], authors: [] },
    sections: [
      {
        key: 'section-1',
        name: 'Abstract',
        sectionType: 'ABSTRACT',
        placement: 'FRONT_MATTER',
        content: 'The only abstract there was.',
        status: 'DRAFTING',
        orderIndex: 0,
        level: 1,
        wordCount: 5,
        includeInExport: true,
      },
      {
        key: 'section-2',
        name: 'Methods',
        sectionType: 'METHODS',
        placement: 'MAIN',
        content: 'Filters were digested [@smith2024].',
        status: 'DRAFTING',
        orderIndex: 1,
        level: 1,
        wordCount: 4,
        includeInExport: true,
      },
    ],
    figures: [],
    references: [
      {
        key: 'reference-1',
        name: 'A referenced study',
        citationKey: 'smith2024',
        cslType: 'ARTICLE_JOURNAL',
      },
    ],
    exportStyle: {},
    submissionMaterials: {},
  };

  it('imports exactly as it did before, carrying no versions', () => {
    const restored = parsePortableResearchPaperManifest(
      JSON.stringify(legacyManifest),
    );
    const drafts = sectionDrafts(restored);
    const prepared = preparePortableResearchPaperImport(restored, drafts);

    expect(prepared.sections).toEqual(drafts);
    expect(prepared.sectionVariants).toEqual([]);
    expect(prepared.warnings).toEqual([]);
    expect(prepared.linkedCount).toBe(1);
    expect(
      portableSectionVariantUpdates(
        prepared.sectionVariants ?? [],
        createSections(prepared.sections).idsByOrderIndex,
      ),
    ).toEqual([]);
  });
});
