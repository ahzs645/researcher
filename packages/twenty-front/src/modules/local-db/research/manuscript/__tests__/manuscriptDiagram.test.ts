import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  collectManuscriptDiagramSources,
  manuscriptDiagramSourcesInMarkdown,
  prepareManuscriptDiagramImages,
  renderMermaidToSvg,
} from '@/local-db/research/manuscript/manuscriptDiagram';
import { figureToMarkdown } from '@/local-db/research/manuscript/manuscriptImages';

const FLOWCHART = 'flowchart TD\n  A[Sample] --> B[Digest]';
const SEQUENCE = 'sequenceDiagram\n  A->>B: send';

const input: BuildBundleInput = {
  manuscript: { id: 'm', name: 'Diagrams' },
  style: { figureLabelFormat: 'Figure {n}' },
  sections: [
    {
      id: 's1',
      name: 'Methods',
      sectionType: 'METHODS',
      placement: 'MAIN',
      orderIndex: 0,
      content: ['Workflow:', '', '```mermaid', SEQUENCE, '```'].join('\n'),
    },
  ],
  figures: [
    {
      id: 'f1',
      refKey: 'flow',
      name: 'Sampling workflow',
      caption: 'How a filter becomes a number.',
      assetKind: 'FIGURE',
      placement: 'MAIN',
      sectionId: 's1',
      imageSource: 'DIAGRAM',
      diagramSource: FLOWCHART,
    },
  ],
  references: [],
};

describe('manuscriptDiagramSourcesInMarkdown', () => {
  it('finds fenced mermaid blocks and ignores other fences', () => {
    expect(
      manuscriptDiagramSourcesInMarkdown(
        ['```mermaid', FLOWCHART, '```', '```python', 'print(1)', '```'].join(
          '\n',
        ),
      ),
    ).toEqual([FLOWCHART]);
  });

  it('returns nothing for prose without a diagram', () => {
    expect(manuscriptDiagramSourcesInMarkdown('Just prose.')).toEqual([]);
  });
});

describe('collectManuscriptDiagramSources', () => {
  it('collects diagram figures and prose fences, once each', () => {
    const sources = collectManuscriptDiagramSources(
      buildManuscriptBundle(input),
    );

    expect(sources).toContain(FLOWCHART);
    expect(sources).toContain(SEQUENCE);
    expect(new Set(sources).size).toBe(sources.length);
  });
});

describe('a diagram figure', () => {
  const bundle = buildManuscriptBundle(input);
  const figure = bundle.numberedFigures[0];

  it('numbers and labels like any other figure', () => {
    expect(figure.label).toBe('Figure 1');
  });

  it('does not warn about a missing image', () => {
    expect(bundle.warnings).toEqual([]);
  });

  it('carries its source into the Markdown bundle as a fence', () => {
    expect(figureToMarkdown(figure)).toContain('```mermaid');
    expect(figureToMarkdown(figure)).toContain('A[Sample] --> B[Digest]');
  });
});

describe('rendering off-browser', () => {
  it('returns null rather than throwing', async () => {
    await expect(renderMermaidToSvg(FLOWCHART)).resolves.toBeNull();
  });

  it('leaves the bundle untouched when nothing could be drawn', async () => {
    const bundle = buildManuscriptBundle(input);

    await expect(prepareManuscriptDiagramImages(bundle)).resolves.toBe(bundle);
  });
});
