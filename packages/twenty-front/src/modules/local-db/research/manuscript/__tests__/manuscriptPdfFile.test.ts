// jsdom's TextDecoder rejects the "latin1" label that every browser accepts,
// so the module is loaded after swapping in Node's implementation.
const loadExtractor = async (): Promise<
  (buffer: ArrayBuffer) => Promise<string>
> => {
  const { TextDecoder: NodeTextDecoder } = await import('node:util');
  (globalThis as unknown as { TextDecoder: unknown }).TextDecoder =
    NodeTextDecoder;
  const module = await import(
    '@/local-db/research/manuscript/manuscriptPdfFile'
  );
  return module.extractPdfText;
};

// Uncompressed PDFs only: the Flate path needs `DecompressionStream`, which is
// the browser's, and these cases are about which streams are read at all.
const pdfBuffer = (body: string): ArrayBuffer => {
  const source = `%PDF-1.4\n${body}\ntrailer<</Root 1 0 R>>`;
  // Latin-1 bytes, written without TextEncoder — jsdom does not provide one.
  const bytes = Uint8Array.from(
    [...source].map((character) => character.charCodeAt(0) & 0xff),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

const contentStream = (text: string): string =>
  `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream\nendobj`;

describe('extractPdfText', () => {
  it('reads the text operators of a page', async () => {
    const extractPdfText = await loadExtractor();
    await expect(
      extractPdfText(pdfBuffer(contentStream('Hello manuscript'))),
    ).resolves.toBe('Hello manuscript');
  });

  it('skips image and font streams instead of scanning their bytes', async () => {
    // An image inflates to megabytes of binary with no text operators in it.
    // Scanning that for "(…) Tj" cost minutes on a real 30-page paper, so the
    // stream dictionary decides what is worth reading.
    const image = `5 0 obj<</Type/XObject/Subtype/Image/Width 2/Height 2/Length 24>>stream\nÿØÿà(((((((((\nendstream\nendobj`;
    const font = `6 0 obj<</Length 12/FontFile2 7 0 R>>stream\n((((((((((((\nendstream\nendobj`;

    const extractPdfText = await loadExtractor();
    const started = Date.now();
    await expect(
      extractPdfText(
        pdfBuffer(`${contentStream('Real page text')}\n${image}\n${font}`),
      ),
    ).resolves.toBe('Real page text');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('says so when a PDF carries no readable text', async () => {
    const extractPdfText = await loadExtractor();
    await expect(
      extractPdfText(
        pdfBuffer(
          '5 0 obj<</Type/XObject/Subtype/Image/Length 4>>stream\n\nendstream\nendobj',
        ),
      ),
    ).rejects.toThrow(/no extractable text/i);
  });
});
