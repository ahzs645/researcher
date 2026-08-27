import { isNonEmptyString } from '@sniptt/guards';

import { type ManuscriptBundle } from './manuscriptAssembly';
import { type NumberedFigure } from './manuscriptTypes';

// Mermaid diagrams as a first-class way of putting a picture in a paper.
//
// A diagram is a normal figure whose pixels come from Mermaid source rather
// than an upload, so numbering, cross-references and captions need no special
// case — it slots into the same "ways images are added" layer as uploads,
// URLs, and dataset charts. Prose can also carry a ```mermaid fence.
//
// Rendering happens once per export: Mermaid needs a DOM, so every entry point
// degrades to null off-browser (tests, workers) and callers fall back to
// showing the source. HTML gets the SVG inline — which is what keeps the
// exported file self-contained — while DOCX and PDF get a rasterized PNG,
// because neither embeds SVG reliably.

const MERMAID_FENCE = /```mermaid[^\S\n]*\n([\s\S]*?)```/g;

export const RASTERIZED_DIAGRAM_WIDTH = 1600;

export const manuscriptDiagramSourcesInMarkdown = (
  markdown: string,
): string[] =>
  [...markdown.matchAll(MERMAID_FENCE)]
    .map((match) => match[1].trim())
    .filter((source) => source.length > 0);

// Every distinct Mermaid source in the document — figure diagrams and prose
// fences alike — so each one renders exactly once.
export const collectManuscriptDiagramSources = (
  bundle: ManuscriptBundle,
): string[] => {
  const sources = new Set<string>();
  for (const figure of bundle.numberedFigures) {
    if (isNonEmptyString(figure.diagramSource)) {
      sources.add(figure.diagramSource.trim());
    }
  }
  for (const node of bundle.nodes) {
    if (node.kind === 'prose') {
      for (const source of manuscriptDiagramSourcesInMarkdown(node.markdown)) {
        sources.add(source);
      }
    }
    if (
      (node.kind === 'figure' || node.kind === 'table') &&
      isNonEmptyString(node.figure.diagramSource)
    ) {
      sources.add(node.figure.diagramSource.trim());
    }
  }
  return [...sources];
};

const isBrowserEnvironment = (): boolean =>
  typeof document !== 'undefined' && typeof window !== 'undefined';

let diagramCounter = 0;

// Render one Mermaid source to an SVG string. Returns null when Mermaid is
// unavailable or the source does not parse, so a broken diagram never takes
// the whole export down with it.
export const renderMermaidToSvg = async (
  source: string,
): Promise<string | null> => {
  if (!isBrowserEnvironment()) return null;
  const body = source.trim();
  if (body.length === 0) return null;

  try {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      // The SVG is inlined into a file the author may share, so no
      // author-supplied markup or scripting is allowed through.
      securityLevel: 'strict',
      theme: 'neutral',
      fontFamily: 'inherit',
      // Draw labels as SVG text, not HTML inside <foreignObject>. An SVG shown
      // in an <img> — which is how the DOCX and PDF rasterizer reads it — is
      // parsed as XML, and Mermaid's HTML labels carry `&nbsp;` and unclosed
      // `<br>`, either of which fails that parse outright. With SVG labels the
      // same picture reaches every format.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
    });
    diagramCounter += 1;
    const { svg } = await mermaid.render(
      `manuscript-diagram-${diagramCounter}`,
      body,
    );
    return svg;
  } catch {
    return null;
  }
};

export const renderManuscriptDiagrams = async (
  bundle: ManuscriptBundle,
): Promise<Map<string, string>> => {
  const rendered = new Map<string, string>();
  for (const source of collectManuscriptDiagramSources(bundle)) {
    const svg = await renderMermaidToSvg(source);
    if (svg !== null) rendered.set(source, svg);
  }
  return rendered;
};

// Named HTML entities an XML parser does not know. Mermaid emits `&nbsp;` in
// several diagram types regardless of the label setting.
const XML_UNSAFE_ENTITY = /&(nbsp|ensp|emsp|thinsp|shy|zwnj|zwj);/g;
const XML_ENTITY_CODE_POINTS: Record<string, number> = {
  emsp: 8195,
  ensp: 8194,
  nbsp: 160,
  shy: 173,
  thinsp: 8201,
  zwj: 8205,
  zwnj: 8204,
};

// Inline in a page, an SVG is HTML; in an <img> it is a standalone XML
// document that has to size itself. Mermaid's `width="100%"` has nothing to be
// a percentage of there, so pin the box from the viewBox and swap the entities
// XML will not accept.
export const standaloneSvgDocument = (svg: string): string => {
  const viewBox = /viewBox="([\d.\-+eE\s]+)"/
    .exec(svg)?.[1]
    ?.trim()
    .split(/\s+/);
  const width = Number(viewBox?.[2]);
  const height = Number(viewBox?.[3]);
  const sized =
    Number.isFinite(width) && Number.isFinite(height) && width > 0
      ? svg
          .replace(/^<svg\b/, `<svg width="${width}" height="${height}"`)
          .replace(/\swidth="100%"/, '')
      : svg;
  return sized.replace(
    XML_UNSAFE_ENTITY,
    (entity, name: string) => `&#${XML_ENTITY_CODE_POINTS[name] ?? 32};`,
  );
};

// SVG → PNG data URL, for the exporters that cannot embed vector art. Uses the
// browser's own rasterizer; null off-browser or when the SVG will not decode.
export const rasterizeSvgToPngDataUrl = async (
  svg: string,
  targetWidth = RASTERIZED_DIAGRAM_WIDTH,
): Promise<string | null> => {
  if (!isBrowserEnvironment()) return null;
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    standaloneSvgDocument(svg),
  )}`;

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('diagram did not decode'));
      element.src = encoded;
    });
    const intrinsicWidth = image.naturalWidth || targetWidth;
    const intrinsicHeight = image.naturalHeight || targetWidth * 0.6;
    const scale = targetWidth / intrinsicWidth;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(intrinsicWidth * scale);
    canvas.height = Math.round(intrinsicHeight * scale);
    const canvasContext = canvas.getContext('2d');
    if (canvasContext === null) return null;
    // The raster goes into a Word document on white paper, and a transparent
    // background would come out black in some viewers. Not an app colour.
    // oxlint-disable-next-line twenty/no-hardcoded-colors
    canvasContext.fillStyle = '#ffffff';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

// Give every diagram figure a raster image, so the block-based DOCX and PDF
// exporters embed it like any other figure. Figures that already carry an
// uploaded image are left alone, and a diagram that will not render keeps its
// caption-only placeholder.
export const prepareManuscriptDiagramImages = async (
  bundle: ManuscriptBundle,
): Promise<ManuscriptBundle> => {
  const diagrams = await renderManuscriptDiagrams(bundle);
  if (diagrams.size === 0) return bundle;

  const pngBySource = new Map<string, string>();
  for (const [source, svg] of diagrams) {
    const png = await rasterizeSvgToPngDataUrl(svg);
    if (png !== null) pngBySource.set(source, png);
  }
  if (pngBySource.size === 0) return bundle;

  const withDiagramImage = (figure: NumberedFigure): NumberedFigure => {
    // A figure's panels are drawn from the same nested copies every renderer
    // reads, so they are rasterized here too — updating only the flat list
    // would leave a panelled figure showing Mermaid source in the export.
    const withPanels =
      figure.panels === undefined
        ? figure
        : { ...figure, panels: figure.panels.map(withDiagramImage) };
    if (isNonEmptyString(withPanels.imageUrl)) return withPanels;
    if (!isNonEmptyString(withPanels.diagramSource)) return withPanels;
    const png = pngBySource.get(withPanels.diagramSource.trim());
    return png === undefined
      ? withPanels
      : { ...withPanels, imageUrl: png, imageSource: 'DIAGRAM' };
  };

  return {
    ...bundle,
    numberedFigures: bundle.numberedFigures.map(withDiagramImage),
    nodes: bundle.nodes.map((node) =>
      node.kind === 'figure' ||
      node.kind === 'table' ||
      node.kind === 'equation'
        ? { ...node, figure: withDiagramImage(node.figure) }
        : node,
    ),
  };
};
