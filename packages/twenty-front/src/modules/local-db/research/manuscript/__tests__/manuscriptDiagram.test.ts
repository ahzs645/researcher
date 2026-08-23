import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  collectManuscriptDiagramSources,
  manuscriptDiagramSourcesInMarkdown,
  standaloneSvgDocument,
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

describe('standaloneSvgDocument', () => {
  const mermaidSvg = (body: string) =>
    `<svg id="d1" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 266px;" viewBox="0 0 266.2 478.8">${body}</svg>`;

  it('pins the box from the viewBox so an <img> can size it', () => {
    // Inline in a page an SVG is HTML and 100% means the container; in an
    // <img> — how the DOCX and PDF rasterizer reads it — there is no container.
    const document_ = standaloneSvgDocument(mermaidSvg('<g/>'));

    expect(document_).toContain('width="266.2"');
    expect(document_).toContain('height="478.8"');
    expect(document_).not.toContain('width="100%"');
    expect(document_).toContain('viewBox="0 0 266.2 478.8"');
  });

  it('replaces entities XML does not define', () => {
    const document_ = standaloneSvgDocument(
      mermaidSvg('<text>High&nbsp;dust&thinsp;days</text>'),
    );

    // Written with the code points interpolated: `&#160;` reads as a hex
    // colour to the lint rule, and it is a character reference.
    expect(document_).toContain(`High&#${160};dust&#${8201};days`);
    expect(document_).not.toContain('&nbsp;');
  });

  it('leaves an SVG it cannot measure alone', () => {
    const noViewBox = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';

    expect(standaloneSvgDocument(noViewBox)).toBe(noViewBox);
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
