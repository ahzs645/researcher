import { strToU8, zipSync } from 'fflate';

import { parseJatsArticle } from '@/local-db/research/manuscript/manuscriptJatsImport';
import {
  buildPortableResearchPaperManifest,
  PORTABLE_MANUSCRIPT_FILENAME,
  type PortableManuscriptSource,
} from '@/local-db/research/manuscript/manuscriptPortableManifest';
import type { ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
// Type-only: the reader is loaded after the browser globals it reads at import
// time exist.
import type * as ManuscriptDocxFile from '@/local-db/research/manuscript/manuscriptDocxFile';

type DocumentFileReader = typeof ManuscriptDocxFile;

// The reader is browser-only glue, so the module is loaded after Node's
// implementations of what jsdom leaves out — `TextDecoder` and a `Blob`/`File`
// pair whose bytes can be read back.
const loadDocumentFileReader = async (): Promise<DocumentFileReader> => {
  const { TextDecoder: NodeTextDecoder } = await import('node:util');
  const { Blob: NodeBlob, File: NodeFile } = await import('node:buffer');
  Object.assign(globalThis as unknown as Record<string, unknown>, {
    TextDecoder: NodeTextDecoder,
    Blob: NodeBlob,
    File: NodeFile,
  });
  return import('@/local-db/research/manuscript/manuscriptDocxFile');
};

// The five ways a real package points at its artwork: the file as named, the
// extensionless href a typesetter writes so one article can be set from
// several renditions, a path into a subfolder, a bare name whose file has
// since been moved into `images/`, and one that names nothing at all.
const PACKAGE_ARTICLE = `<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">
 <front><article-meta>
  <title-group><article-title>Filter-based absorption over the season</article-title></title-group>
  <contrib-group><contrib contrib-type="author"><name><surname>Jalil</surname><given-names>Ahmad</given-names></name></contrib></contrib-group>
 </article-meta></front>
 <body>
  <sec id="s1">
   <title>Results</title>
   <p>The season is summarised in <xref ref-type="fig" rid="fig1">Figure 1</xref>.</p>
   <fig id="fig1"><label>Figure 1</label><caption><p>Named exactly as the file.</p></caption><graphic xlink:href="fig1.png"/></fig>
   <fig id="fig2"><label>Figure 2</label><caption><p>Href with no extension.</p></caption><graphic xlink:href="fig2"/></fig>
   <fig id="fig3"><label>Figure 3</label><caption><p>Href with a directory in it.</p></caption><graphic xlink:href="./images/fig3.png"/></fig>
   <fig id="fig4"><label>Figure 4</label><caption><p>File moved after the XML was written.</p></caption><graphic xlink:href="fig4.png"/></fig>
   <fig id="fig5"><label>Figure 5</label><caption><p>Nothing in the package answers to this.</p></caption><graphic xlink:href="missing.png"/></fig>
  </sec>
 </body>
</article>`;

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const JPEG_BYTES = new Uint8Array([255, 216, 255, 224, 9, 9, 9]);

// A decoy: XML, in the package, and not the article. Only the root element
// tells the two apart.
const PACKAGE_MANIFEST_XML =
  '<?xml version="1.0"?><manifest><item href="fig1.png"/></manifest>';

const jatsPackageBytes = (): Uint8Array =>
  zipSync({
    'manifest.xml': strToU8(PACKAGE_MANIFEST_XML),
    // Named after the DOI, two folders down: nothing about the name says
    // "article", which is the point.
    'content/10.5194-amt-2026-1.xml': strToU8(PACKAGE_ARTICLE),
    'fig1.png': PNG_BYTES,
    'fig2.jpg': JPEG_BYTES,
    'images/fig3.png': PNG_BYTES,
    'images/fig4.png': PNG_BYTES,
    'readme.txt': strToU8('Submission package for AMT-2026-1.'),
  });

const zipFile = async (bytes: Uint8Array, name: string): Promise<File> => {
  const { File: NodeFile } = await import('node:buffer');
  return new NodeFile([bytes], name, {
    type: 'application/zip',
  }) as unknown as File;
};

const figuresByRefKey = (document: ImportedDocument) =>
  new Map(
    (document.portablePackage?.figures ?? []).map((figure) => [
      figure.refKey,
      figure,
    ]),
  );

describe('a JATS package arriving as a zip', () => {
  it('imports the article and the artwork beside it', async () => {
    const reader = await loadDocumentFileReader();

    const document = await reader.readImportedDocumentFile(
      await zipFile(jatsPackageBytes(), 'amt-2026-1.zip'),
    );
    const figures = figuresByRefKey(document);

    expect(document.portableSourceKind).toBe('JATS');
    expect(document.title).toBe('Filter-based absorption over the season');
    // Four of the five figures found their pixels; the manifest and the
    // readme were never mistaken for either.
    expect(document.stats?.embeddedImageCount).toBe(4);
    expect(figures.get('fig1')?.imageSource).toBe('UPLOAD');
    expect(figures.get('fig1')?.imageUrl).toBe(
      `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`,
    );
  });

  it('matches an extensionless href, which is how JATS usually writes one', async () => {
    const reader = await loadDocumentFileReader();

    const figures = figuresByRefKey(
      await reader.readImportedDocumentFile(
        await zipFile(jatsPackageBytes(), 'amt-2026-1.zip'),
      ),
    );

    expect(figures.get('fig2')?.imageSource).toBe('UPLOAD');
    expect(
      figures.get('fig2')?.imageUrl?.startsWith('data:image/jpeg;base64,'),
    ).toBe(true);
  });

  it('matches an href with a directory in it, and one whose file has moved', async () => {
    const reader = await loadDocumentFileReader();

    const figures = figuresByRefKey(
      await reader.readImportedDocumentFile(
        await zipFile(jatsPackageBytes(), 'amt-2026-1.zip'),
      ),
    );

    // `./images/fig3.png` is the path as stored, once normalised.
    expect(figures.get('fig3')?.imageSource).toBe('UPLOAD');
    // `fig4.png` sits at the root of the href and in `images/` in the zip:
    // the file name is what connects them.
    expect(figures.get('fig4')?.imageSource).toBe('UPLOAD');
  });

  it('leaves a figure the package cannot answer for without an image', async () => {
    const reader = await loadDocumentFileReader();

    const figures = figuresByRefKey(
      await reader.readImportedDocumentFile(
        await zipFile(jatsPackageBytes(), 'amt-2026-1.zip'),
      ),
    );

    expect(figures.get('fig5')?.imageSource).toBe('NONE');
    expect(figures.get('fig5')?.imageUrl).toBeUndefined();
    expect(figures.get('fig5')?.caption).toBe(
      'Nothing in the package answers to this.',
    );
  });

  it('says which article it read when a package holds more than one', async () => {
    const reader = await loadDocumentFileReader();
    const bytes = zipSync({
      'article.xml': strToU8(PACKAGE_ARTICLE),
      'content/correction.xml': strToU8(
        PACKAGE_ARTICLE.replace(
          'Filter-based absorption over the season',
          'Correction to: Filter-based absorption',
        ),
      ),
    });

    const document = await reader.readImportedDocumentFile(
      await zipFile(bytes, 'two-articles.zip'),
    );

    // The shallowest is the one the package is about.
    expect(document.title).toBe('Filter-based absorption over the season');
    expect(document.warnings?.join(' ')).toContain('article.xml was imported');
  });

  it('skips artwork too large to keep in the browser and says so', async () => {
    const reader = await loadDocumentFileReader();
    const bytes = zipSync({
      'article.xml': strToU8(PACKAGE_ARTICLE),
      'fig1.png': PNG_BYTES,
      // Over the per-image cap: a 300 dpi print rendition, the thing that
      // actually fills an offline database.
      'fig2.jpg': new Uint8Array(10_000_001),
    });

    const document = await reader.readImportedDocumentFile(
      await zipFile(bytes, 'oversized.zip'),
    );
    const figures = figuresByRefKey(document);

    // The import lives, the small figure keeps its picture, and the author is
    // told which file was left behind rather than finding a blank figure.
    expect(figures.get('fig1')?.imageSource).toBe('UPLOAD');
    expect(figures.get('fig2')?.imageSource).toBe('NONE');
    expect(document.warnings?.join(' ')).toContain('fig2.jpg');
    expect(document.warnings?.join(' ')).toMatch(/too large/i);
  });

  it('still reads a portable research package the old way', async () => {
    const reader = await loadDocumentFileReader();
    const source: PortableManuscriptSource = {
      manuscript: { title: 'Portable aerosol paper' },
      sections: [
        {
          id: 'intro',
          name: 'Introduction',
          sectionType: 'INTRODUCTION',
          placement: 'MAIN',
          content: 'One paragraph.',
          orderIndex: 0,
          wordCount: 2,
          includeInExport: true,
        },
      ],
      figures: [],
      references: [],
    };
    const bytes = zipSync({
      [PORTABLE_MANUSCRIPT_FILENAME]: strToU8(
        JSON.stringify(buildPortableResearchPaperManifest(source, {}, {})),
      ),
    });

    const document = await reader.readImportedDocumentFile(
      await zipFile(bytes, 'package.zip'),
    );

    expect(document.portableSourceKind).toBe('PACKAGE');
    expect(document.title).toBe('Portable aerosol paper');
  });

  it('refuses a zip that is neither kind of package, and says which two it wanted', async () => {
    const reader = await loadDocumentFileReader();
    const bytes = zipSync({
      'notes.txt': strToU8('Scratch notes.'),
      'settings.xml': strToU8('<settings><theme>dark</theme></settings>'),
    });

    await expect(
      reader.readImportedDocumentFile(await zipFile(bytes, 'random.zip')),
    ).rejects.toThrow(/research-paper\.json.*JATS package/s);
  });
});

describe('parseJatsArticle with a package asset table', () => {
  const article = (href: string): string =>
    `<article xmlns:xlink="http://www.w3.org/1999/xlink"><body><sec id="s1"><title>Results</title>
      <fig id="fig1"><label>Figure 1</label><graphic xlink:href="${href}"/></fig>
    </sec></body></article>`;
  const assets = { 'Images/Fig1.TIF': 'data:image/png;base64,AAAA' };
  const artworkOf = (href: string): string | null | undefined =>
    parseJatsArticle(article(href), assets).figures[0].imageUrl;

  it('matches on the path, the file name and the file name without extension', () => {
    // Case and a leading `./` are formatting, not identity.
    expect(artworkOf('./images/fig1.tif')).toBe('data:image/png;base64,AAAA');
    expect(artworkOf('fig1.tif')).toBe('data:image/png;base64,AAAA');
    expect(artworkOf('fig1')).toBe('data:image/png;base64,AAAA');
  });

  it('keeps an absolute URL and a data URL over anything in the package', () => {
    expect(artworkOf('https://example.org/fig1.png')).toBe(
      'https://example.org/fig1.png',
    );
    expect(artworkOf('data:image/gif;base64,BBBB')).toBe(
      'data:image/gif;base64,BBBB',
    );
  });

  it('still gives up on a path the package does not have', () => {
    const figure = parseJatsArticle(article('fig9.png'), assets).figures[0];

    expect(figure.imageSource).toBe('NONE');
    expect(figure.imageUrl).toBeUndefined();
  });
});
