import { type BuildBundleInput } from '@/local-db/research/manuscript/manuscriptAssembly';

export const citationProvenanceInput = (
  citationStyleId?: string | null,
): BuildBundleInput => ({
  manuscript: {
    id: 'paper',
    name: 'Citation outcome fixture',
    authorLine: 'A. Author',
  },
  style: { name: 'Test profile', citationMode: 'NUMERIC', citationStyleId },
  sections: [
    {
      id: 'abstract',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      includeInExport: true,
      content: 'A fixture with a real citation token [@li2017, p. 42].',
    },
  ],
  figures: [],
  references: [
    {
      id: 'ref',
      citationKey: 'li2017',
      name: 'Test reference',
      authors: 'Li, A.',
      year: 2017,
    },
  ],
});
