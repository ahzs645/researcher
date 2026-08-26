import {
  buildPortableResearchPaperManifest,
  parsePortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_READABLE_VERSIONS,
  PORTABLE_MANUSCRIPT_VERSION,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';

const MDPI_PROFILE = 'myst:tex/myst/mdpi:atmosphere';
const ARXIV_PROFILE = 'myst:tex/myst/arxiv';

// One abstract with two per-journal versions of itself, which is the shape the
// whole feature exists for: MDPI caps the abstract at 200 words, arXiv at 320.
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

describe('portable manifest section versions', () => {
  it('writes a version as its base section key plus the journal profile', () => {
    const manifest = buildPortableResearchPaperManifest(
      sourceWithVersions(),
      {},
      {},
    );
    const [abstract, , mdpi, arxiv] = manifest.sections;

    // The base's key is what the version points at — the record id it carries
    // means nothing on the machine this package is opened on.
    expect(mdpi).toMatchObject({
      variantOfKey: abstract.key,
      variantProfileKey: MDPI_PROFILE,
    });
    expect(arxiv).toMatchObject({
      variantOfKey: abstract.key,
      variantProfileKey: ARXIV_PROFILE,
    });
    expect(JSON.stringify(manifest)).not.toContain('abstract-id');
  });

  it('leaves both fields off an ordinary section rather than emptying them', () => {
    const manifest = buildPortableResearchPaperManifest(
      sourceWithVersions(),
      {},
      {},
    );
    const [abstract, introduction] = manifest.sections;

    // An empty string would read as "a version of nothing", which is exactly
    // what the importer drops.
    expect(abstract).not.toHaveProperty('variantOfKey');
    expect(abstract).not.toHaveProperty('variantProfileKey');
    expect(introduction).not.toHaveProperty('variantOfKey');
    expect(introduction).not.toHaveProperty('variantProfileKey');
  });

  it('keeps a version whose journal profile is blank pointing at its base', () => {
    const source = sourceWithVersions();
    source.sections[2].variantProfileKey = '   ';
    const manifest = buildPortableResearchPaperManifest(source, {}, {});

    expect(manifest.sections[2].variantOfKey).toBe(manifest.sections[0].key);
    expect(manifest.sections[2]).not.toHaveProperty('variantProfileKey');
  });

  it('carries a version whose base is not in the package as an unresolvable key', () => {
    const source = sourceWithVersions();
    source.sections[2].variantOfId = 'a-section-deleted-long-ago';
    const manifest = buildPortableResearchPaperManifest(source, {}, {});
    const keys = new Set(manifest.sections.map((section) => section.key));

    // Still marked a version, still pointing at nothing this package holds —
    // which is what makes the importer drop it instead of restoring a second
    // abstract that would export alongside the real one.
    expect(manifest.sections[2].variantOfKey).toBe(
      'a-section-deleted-long-ago',
    );
    expect(keys.has(manifest.sections[2].variantOfKey ?? '')).toBe(false);
  });

  it('survives the JSON the package is actually written as', () => {
    const manifest = buildPortableResearchPaperManifest(
      sourceWithVersions(),
      {},
      {},
    );
    const restored = parsePortableResearchPaperManifest(
      JSON.stringify(manifest),
    );

    expect(restored.sections[2]).toMatchObject({
      variantOfKey: 'section-1',
      variantProfileKey: MDPI_PROFILE,
    });
  });

  it('stays on schema v2, because optional fields read both ways', () => {
    const manifest = buildPortableResearchPaperManifest(
      sourceWithVersions(),
      {},
      {},
    );

    // A reader that shipped before versions existed accepts schemaVersion 2
    // and ignores the two fields it does not know; bumping to 3 would have it
    // refuse the package outright and the author would lose the whole paper.
    expect(manifest.schemaVersion).toBe(2);
    expect(PORTABLE_MANUSCRIPT_VERSION).toBe(2);
    expect(PORTABLE_MANUSCRIPT_READABLE_VERSIONS).toEqual([1, 2]);
    expect(
      PORTABLE_MANUSCRIPT_READABLE_VERSIONS.includes(manifest.schemaVersion),
    ).toBe(true);
  });
});
