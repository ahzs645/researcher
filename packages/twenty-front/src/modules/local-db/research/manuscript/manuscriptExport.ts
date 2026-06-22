import { type ManuscriptBundle } from './manuscriptAssembly';

// Pluggable export. Every exporter consumes the one `ManuscriptBundle` and
// returns downloadable files, so the engine is a registry entry, not a rewrite.
// The Markdown bundle exporter ships now (pure, zero-dep, always works); the
// DOCX/PDF/Pandoc backends register against the same interface later:
//   - blocknoteDocxExporter / blocknotePdfExporter  → @blocknote/xl-*-exporter
//   - pandocExporter (--reference-doc + --citeproc)  → in-browser pandoc-wasm
//   - typstExporter                                  → typst.ts (in-browser PDF)

export type ExportFile = {
  filename: string;
  mimeType: string;
  content: string;
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

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'manuscript';

// Build the YAML front-matter Pandoc/Quarto reads (title, author, abstract,
// bibliography + csl pointers). This is what makes the .md bundle a turnkey
// Pandoc input — `pandoc paper.md --citeproc` just works.
const buildFrontMatter = (bundle: ManuscriptBundle): string => {
  const lines = ['---'];
  lines.push(`title: ${JSON.stringify(bundle.metadata.title)}`);
  if (bundle.metadata.authors.length > 0) {
    lines.push(`author: ${JSON.stringify(bundle.metadata.authors)}`);
  }
  if (bundle.metadata.abstract.length > 0) {
    lines.push(`abstract: ${JSON.stringify(bundle.metadata.abstract)}`);
  }
  if (bundle.metadata.citationStyleId.length > 0) {
    lines.push(`csl: ${bundle.metadata.citationStyleId}.csl`);
  }
  lines.push('bibliography: references.json');
  lines.push('---');
  return lines.join('\n');
};

// The always-available exporter: a Pandoc-ready Markdown file + the CSL-JSON
// bibliography, returned as text files for download. No dependencies, fully
// offline — the guaranteed baseline that also feeds every other engine.
export const markdownBundleExporter: ManuscriptExporter = {
  id: 'markdown-bundle',
  label: 'Markdown + bibliography',
  formats: ['MARKDOWN', 'JSON'],
  offline: true,
  export: async (bundle) => {
    const base = slugify(bundle.metadata.title);
    const document = [buildFrontMatter(bundle), '', bundle.fullMarkdown].join(
      '\n',
    );
    const files: ExportFile[] = [
      {
        filename: `${base}.md`,
        mimeType: 'text/markdown',
        content: document,
      },
      {
        filename: 'references.json',
        mimeType: 'application/json',
        content: JSON.stringify(bundle.cslJson, null, 2),
      },
    ];
    return files;
  },
};

// The registry. Backends append here as they land; the composer renders one
// button per exporter and shows its formats + offline badge.
export const getManuscriptExporters = (): ManuscriptExporter[] => [
  markdownBundleExporter,
];

// Trigger a browser download for an export file. Kept out of the pure exporters
// so they stay testable; the composer calls this with each returned file.
export const downloadExportFile = (file: ExportFile): void => {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
