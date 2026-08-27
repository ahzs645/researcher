import { preparePortableResearchPaperImport } from '@/local-db/research/manuscript/manuscriptPortableImport';
import {
  buildPortableResearchPaperManifest,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';

// A paper leaves as a package and comes back: the panels have to still be
// panels of the same figure, and the sentences that point at a section have to
// still resolve. Neither can travel by record id — those are local to one
// workspace — so both go by the keys the manifest mints.

const source = (): PortableManuscriptSource => ({
  manuscript: { title: 'Panelled paper' },
  sections: [
    {
      id: 'record-intro',
      refKey: 'sec:intro',
      name: 'Introduction',
      sectionType: 'INTRODUCTION',
      placement: 'MAIN',
      content: 'Set out in [#sec:methods]; see [#fig:plume-left].',
      orderIndex: 0,
      wordCount: 6,
    },
    {
      id: 'record-methods',
      refKey: 'sec:methods',
      name: 'Methods',
      sectionType: 'METHODS',
      placement: 'MAIN',
      content: 'Sampling.',
      orderIndex: 1,
      wordCount: 1,
    },
  ],
  figures: [
    {
      id: 'record-plume',
      refKey: 'fig:plume',
      name: 'Plume',
      caption: 'Transport of the plume.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 0,
      panelColumns: 2,
    },
    {
      id: 'record-plume-left',
      refKey: 'fig:plume-left',
      name: 'Left',
      caption: 'Northbound leg.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 1,
      parentFigureId: 'record-plume',
    },
    {
      id: 'record-plume-right',
      refKey: 'fig:plume-right',
      name: 'Right',
      caption: 'Southbound leg.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      orderIndex: 2,
      parentFigureId: 'record-plume',
    },
  ],
  references: [],
});

describe('panels and section keys in a portable package', () => {
  const manifest = buildPortableResearchPaperManifest(source(), {}, {});

  it('writes a panel as an ordinary figure naming its parent’s manifest key', () => {
    const [parent, left, right] = manifest.figures;
    expect(parent.parentFigureKey).toBeUndefined();
    expect(parent.panelColumns).toBe(2);
    expect(left.parentFigureKey).toBe(parent.key);
    expect(right.parentFigureKey).toBe(parent.key);
  });

  it('writes a section’s reference key, and nothing for a section without one', () => {
    expect(manifest.sections.map((section) => section.refKey)).toEqual([
      'sec:intro',
      'sec:methods',
    ]);
    const unkeyed = buildPortableResearchPaperManifest(
      {
        ...source(),
        sections: source().sections.map(
          ({ refKey: _refKey, ...section }) => section,
        ),
      },
      {},
      {},
    );
    expect(
      unkeyed.sections.every((section) => section.refKey === undefined),
    ).toBe(true);
  });

  it('restores the panel link by order index, which is the only handle it has', () => {
    const prepared = preparePortableResearchPaperImport(
      manifest,
      manifest.sections.map((section) => ({
        name: section.name,
        refKey: section.refKey,
        sectionType: section.sectionType,
        placement: section.placement,
        content: section.content,
        orderIndex: section.orderIndex,
        wordCount: section.wordCount,
        includeInExport: section.includeInExport,
      })),
    );
    const [parent, left, right] = prepared.figures;

    expect(parent.parentOrderIndex).toBeUndefined();
    expect(parent.panelColumns).toBe(2);
    expect(left.parentOrderIndex).toBe(parent.orderIndex);
    expect(right.parentOrderIndex).toBe(parent.orderIndex);
    expect(prepared.sections.map((section) => section.refKey)).toEqual([
      'sec:intro',
      'sec:methods',
    ]);
    // The prose still names both keys, so once the records exist the
    // references resolve exactly as they did before the trip.
    expect(prepared.sections[0].content).toContain('[#sec:methods]');
    expect(prepared.sections[0].content).toContain('[#fig:plume-left]');
  });
});
