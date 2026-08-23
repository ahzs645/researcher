import { slugifyTitle, type ManuscriptBundle } from './manuscriptAssembly';
import { prepareManuscriptBundleWithCsl } from './manuscriptCslIntegration';
import { resolveCslStyleXml } from './manuscriptCiteproc';
import { blocknoteDocxExporter } from './manuscriptDocxExport';
import { manuscriptHtmlExporter } from './manuscriptHtmlExport';
import { jatsXmlExporter } from './manuscriptJatsExport';
import { blocknotePdfExporter } from './manuscriptPdfExport';

// Pluggable export. Every exporter consumes the one `ManuscriptBundle` and
// returns downloadable files, so the engine is a registry entry, not a rewrite.
// The Markdown bundle exporter ships now (pure, zero-dep, always works); the
// DOCX/PDF/JATS backends register against the same interface:
//   - blocknoteDocxExporter / blocknotePdfExporter  → @blocknote/xl-*-exporter
//   - jatsXmlExporter                               → ANSI/NISO Z39.96 JATS
//   - pandocExporter (--reference-doc + --citeproc)  → in-browser pandoc-wasm
//   - typstExporter                                  → typst.ts (in-browser PDF)

export type ExportFile = {
  filename: string;
  mimeType: string;
  // Text for Markdown/JSON/XML; a Blob for binary formats (DOCX/PDF).
  content: string | Blob;
};

export type ManuscriptExporter = {
  id: string;
  label: string;
  // Output formats this backend can emit (UI badges).
  formats: string[];
  // Whether it runs without a network/connector (local-first).
  offline: boolean;
  export: (bundle: ManuscriptBundle) => Promise<ExportFile[]>;
};

// Build the YAML front-matter Pandoc/Quarto reads (title, author, abstract,
// keywords, bibliography + csl pointers). In-text citations are already
// rendered by the bundle, so the document is pre-formatted; references.json
// and the vendored .csl ride along for anyone re-processing with Pandoc.
const buildFrontMatter = (bundle: ManuscriptBundle): string => {
  const lines = ['---'];
  lines.push(`title: ${JSON.stringify(bundle.metadata.title)}`);
  if (bundle.metadata.authors.length > 0) {
    lines.push(`author: ${JSON.stringify(bundle.metadata.authors)}`);
  }
  if (bundle.metadata.abstract.length > 0) {
    lines.push(`abstract: ${JSON.stringify(bundle.metadata.abstract)}`);
  }
  if (bundle.metadata.keywords.length > 0) {
    lines.push(`keywords: ${JSON.stringify(bundle.metadata.keywords)}`);
  }
  if (
    bundle.metadata.citationStyleId.length > 0 &&
    resolveCslStyleXml(bundle.metadata.citationStyleId) !== null
  ) {
    lines.push(`csl: ${bundle.metadata.citationStyleId}.csl`);
  }
  lines.push('bibliography: references.json');
  lines.push('---');
  return lines.join('\n');
};

// The always-available exporter: a Markdown file + the CSL-JSON bibliography,
// returned as text files for download. No dependencies, fully offline — the
// guaranteed baseline that also feeds every other engine.
export const markdownBundleExporter: ManuscriptExporter = {
  id: 'markdown-bundle',
  label: 'Markdown + bibliography',
  formats: ['MARKDOWN', 'JSON'],
  offline: true,
  export: async (bundle) => {
    const formattedBundle = await prepareManuscriptBundleWithCsl(bundle);
    const base = slugifyTitle(formattedBundle.metadata.title);
    const document = [
      buildFrontMatter(formattedBundle),
      '',
      formattedBundle.fullMarkdown,
    ].join('\n');
    const files: ExportFile[] = [
      {
        filename: `${base}.md`,
        mimeType: 'text/markdown',
        content: document,
      },
      {
        filename: 'references.json',
        mimeType: 'application/json',
        content: JSON.stringify(formattedBundle.cslJson, null, 2),
      },
    ];
    // Ship the vendored CSL style the front matter points at, so the bundle
    // is self-contained.
    const styleXml = resolveCslStyleXml(
      formattedBundle.metadata.citationStyleId,
    );
    if (styleXml !== null) {
      files.push({
        filename: `${formattedBundle.metadata.citationStyleId}.csl`,
        mimeType: 'application/xml',
        content: styleXml,
      });
    }
    return files;
  },
};

// The registry. Backends append here as they land; the composer renders one
// button per exporter and shows its formats + offline badge.
export const getManuscriptExporters = (): ManuscriptExporter[] => [
  blocknoteDocxExporter,
  blocknotePdfExporter,
  manuscriptHtmlExporter,
  jatsXmlExporter,
  markdownBundleExporter,
];

// Trigger a browser download for an export file. Kept out of the pure exporters
// so they stay testable; the composer calls this with each returned file.
export const downloadExportFile = (file: ExportFile): void => {
  const blob =
    file.content instanceof Blob
      ? file.content
      : new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
