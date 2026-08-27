import {
  manuscriptSectionComments,
  manuscriptImportedSectionNotes,
} from '@/local-db/research/manuscript/manuscriptComments';
import {
  buildPortableResearchPaperManifest,
  parsePortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_VERSION,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import { preparePortableResearchPaperImport } from '@/local-db/research/manuscript/manuscriptPortableImport';

// A paper handed to a co-worker as a portable package has to arrive with the
// review on it. The manifest carries the section's notes field whole — comment
// lines, the answers written to them, and whatever the author jotted beside
// both — because that field is where a comment lives between the two trips.

const REVIEWER_COMMENT =
  'Imported comment — Rae Ivy (RI) on 2026-03-04 [on "The window is strictly aligned."]: Justify this window.';

const NOTES = [
  'Chase the ethics approval.',
  REVIEWER_COMMENT,
  'Reply — The window is set by the instrument duty cycle.',
].join('\n');

const source = (notes?: string): PortableManuscriptSource => ({
  manuscript: { title: 'Aligned windows' },
  sections: [
    {
      id: 'results-id',
      name: 'Results',
      sectionType: 'RESULTS',
      placement: 'MAIN',
      content: 'Sampling ran for six weeks. The window is strictly aligned.',
      orderIndex: 0,
      wordCount: 9,
      ...(notes === undefined ? {} : { notes }),
    },
  ],
  figures: [],
  references: [],
});

const roundTrip = (
  notes?: string,
): ReturnType<typeof parsePortableResearchPaperManifest> =>
  parsePortableResearchPaperManifest(
    JSON.stringify(buildPortableResearchPaperManifest(source(notes), {}, {})),
  );

describe('a portable package with comments in it', () => {
  it('carries the section notes across whole', () => {
    const manifest = roundTrip(NOTES);

    expect(manifest.sections[0].notes).toBe(NOTES);
    expect(manuscriptSectionComments(manifest.sections[0].notes)).toEqual([
      {
        author: 'Rae Ivy',
        initials: 'RI',
        date: '2026-03-04',
        anchoredText: 'The window is strictly aligned.',
        text: 'Justify this window.',
        reply: 'The window is set by the instrument duty cycle.',
      },
    ]);
  });

  it('writes no notes field for a section that has none, and needs no new version', () => {
    const manifest = roundTrip();

    expect(manifest.sections[0].notes).toBeUndefined();
    expect('notes' in manifest.sections[0]).toBe(false);
    expect(manifest.schemaVersion).toBe(PORTABLE_MANUSCRIPT_VERSION);
  });

  it('restores the notes onto the section draft the commit step creates', () => {
    const manifest = roundTrip(NOTES);
    const prepared = preparePortableResearchPaperImport(manifest, [
      {
        name: 'Results',
        sectionType: 'RESULTS',
        placement: 'MAIN',
        content: manifest.sections[0].content,
        orderIndex: 0,
        wordCount: 9,
        includeInExport: true,
        notes: manifest.sections[0].notes,
      },
    ]);

    expect(manuscriptImportedSectionNotes(prepared.sections[0])).toBe(NOTES);
  });
});
