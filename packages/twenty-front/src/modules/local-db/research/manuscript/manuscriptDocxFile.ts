// Browser-only glue for the document importer: read a dropped File and, for a
// .docx, unzip `word/document.xml` with the platform's native
// `DecompressionStream` — so no zip dependency ships to the static site. The
// heavy lifting (WordML/Markdown → sections) lives in the pure, unit-tested
// `manuscriptDocImport.ts`; this file only does I/O the tests can't.

import {
  parseMarkdownDocument,
  parseWordDocument,
  type ImportedDocument,
} from './manuscriptDocImport';
import { extractPdfText } from './manuscriptPdfFile';

const td = new TextDecoder('utf-8');

const u32 = (view: DataView, offset: number): number =>
  view.getUint32(offset, true);
const u16 = (view: DataView, offset: number): number =>
  view.getUint16(offset, true);

// Inflate a raw DEFLATE stream (zip method 8) using the native API.
const inflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
  );
  return new Uint8Array(await stream.arrayBuffer());
};

// Minimal ZIP reader: find one named entry via the central directory, then read
// and (if needed) inflate its bytes from the local file header. Enough for the
// flat, single-file lookup a .docx needs — not a general-purpose unzip.
const readZipEntry = async (
  buffer: ArrayBuffer,
  entryName: string,
): Promise<Uint8Array | null> => {
  const view = new DataView(buffer);
  const length = view.byteLength;

  // Locate the End Of Central Directory record (signature 0x06054b50),
  // scanning back from the end past any trailing comment.
  let eocd = -1;
  for (let offset = length - 22; offset >= 0; offset -= 1) {
    if (u32(view, offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = u16(view, eocd + 10);
  let pointer = u32(view, eocd + 16); // central directory start

  for (let index = 0; index < entryCount; index += 1) {
    if (u32(view, pointer) !== 0x02014b50) break; // central file header sig
    const method = u16(view, pointer + 10);
    const compressedSize = u32(view, pointer + 20);
    const nameLength = u16(view, pointer + 28);
    const extraLength = u16(view, pointer + 30);
    const commentLength = u16(view, pointer + 32);
    const localOffset = u32(view, pointer + 42);
    const name = td.decode(new Uint8Array(buffer, pointer + 46, nameLength));

    if (name === entryName) {
      // Re-read the lengths from the *local* header — its name/extra fields can
      // differ in size from the central directory entry.
      const localNameLength = u16(view, localOffset + 26);
      const localExtraLength = u16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const raw = new Uint8Array(buffer, dataStart, compressedSize);
      return method === 0 ? raw : inflateRaw(raw);
    }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return null;
};

export const extractDocxDocumentXml = async (
  buffer: ArrayBuffer,
): Promise<string> => {
  const entry = await readZipEntry(buffer, 'word/document.xml');
  if (entry === null) {
    throw new Error('Not a valid .docx (no word/document.xml)');
  }
  return td.decode(entry);
};

const fileExtension = (name: string): string =>
  name.slice(name.lastIndexOf('.') + 1).toLowerCase();

// Read a user-picked file into an `ImportedDocument`. Supports .docx (real Word
// files), .md/.markdown and .txt (treated as Markdown/plain text).
export const readImportedDocumentFile = async (
  file: File,
): Promise<ImportedDocument> => {
  const extension = fileExtension(file.name);
  if (extension === 'docx') {
    const xml = await extractDocxDocumentXml(await file.arrayBuffer());
    return parseWordDocument(xml);
  }
  if (extension === 'pdf') {
    // Best-effort: PDFs carry no headings, so this usually yields one section.
    return parseMarkdownDocument(await extractPdfText(await file.arrayBuffer()));
  }
  return parseMarkdownDocument(await file.text());
};

export const ACCEPTED_IMPORT_EXTENSIONS = '.docx,.pdf,.md,.markdown,.txt';
