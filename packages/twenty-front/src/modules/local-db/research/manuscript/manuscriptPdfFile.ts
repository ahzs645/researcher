// Browser-only, dependency-free PDF text extraction for the importer. Same
// philosophy as the .docx unzip: parse the container ourselves and inflate with
// the native `DecompressionStream`, no library. Best-effort and honest about it:
// it recovers the text of **text-based** PDFs (those exported from Word/LaTeX/…),
// not scanned/image PDFs, and PDFs carry no heading structure — so the importer
// usually yields one "Body" section that you then split. CID/Type0 fonts with
// custom encodings may come out garbled; for those, save the source as .docx.

const latin1 = new TextDecoder('latin1');

// Inflate a zlib (RFC-1950) stream — PDF's FlateDecode — via the native API.
const inflateZlib = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Response(
    new Blob([new Uint8Array(bytes).buffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate')),
  );
  return new Uint8Array(await stream.arrayBuffer());
};

// Streams that never carry page text: images, embedded font programs, and the
// image-only compression filters.
const NON_TEXT_STREAM =
  /\/Subtype\s*\/(?:Image|Type1C|CIDFontType0C|OpenType)\b|\/FontFile\d?\b|\/(?:DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode|RunLengthDecode)\b/;

// Pull and (if needed) inflate every content stream, concatenated in file order.
const collectContentStreams = async (buffer: ArrayBuffer): Promise<string> => {
  const bytes = new Uint8Array(buffer);
  const text = latin1.decode(bytes);
  const parts: string[] = [];
  const streamKeyword = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streamKeyword.exec(text)) !== null) {
    const dataStart = match.index + match[0].length;
    const endIndex = text.indexOf('endstream', dataStart);
    if (endIndex < 0) break;
    // Trim a single trailing EOL before `endstream`.
    let dataEnd = endIndex;
    if (text[dataEnd - 1] === '\n') dataEnd -= 1;
    if (text[dataEnd - 1] === '\r') dataEnd -= 1;

    // The preceding object dictionary tells us whether it is Flate-compressed.
    const dictStart = text.lastIndexOf('<<', match.index);
    const dict = dictStart >= 0 ? text.slice(dictStart, match.index) : '';
    const isFlate = /\/FlateDecode\b/.test(dict);

    // An image or an embedded font inflates to megabytes of binary that has no
    // text operators in it. Scanning that for `(…) Tj` cost minutes on a real
    // 30-page paper — the dictionary says what the stream is, so skip it.
    if (NON_TEXT_STREAM.test(dict)) {
      streamKeyword.lastIndex = endIndex + 'endstream'.length;
      continue;
    }

    const raw = bytes.subarray(dataStart, dataEnd);
    try {
      const decoded = isFlate ? await inflateZlib(raw) : raw;
      parts.push(latin1.decode(decoded));
    } catch {
      // Not an inflatable/text stream (image, font, …) — skip it.
    }
    streamKeyword.lastIndex = endIndex + 'endstream'.length;
  }
  return parts.join('\n');
};

// Decode a PDF literal string: handle \( \) \\ escapes, octal \ddd, and the
// line-continuation backslash.
const decodePdfString = (raw: string): string =>
  raw
    .replace(/\\(\d{1,3})/g, (_m, oct: string) =>
      String.fromCharCode(parseInt(oct, 8)),
    )
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\\n/g, '');

// Extract readable text from concatenated content streams by walking the text
// operators: `(...) Tj`, `[...] TJ`, and the line-moving operators.
const textFromContent = (content: string): string => {
  const out: string[] = [];
  // Tokenize the operators we care about, in order.
  const re =
    /\(((?:\\.|[^\\()])*)\)\s*(Tj|')|\[((?:\\.|[^\]])*)\]\s*TJ|\b(T\*|Td|TD|ET)\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1] !== undefined) {
      // (string) Tj  — or '  (move to next line then show)
      if (match[2] === "'") out.push('\n');
      out.push(decodePdfString(match[1]));
    } else if (match[3] !== undefined) {
      // [ (a) -250 (b) ] TJ — keep the strings, drop the kerning numbers.
      const inner = match[3];
      const strings = [...inner.matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map((m) =>
        decodePdfString(m[1]),
      );
      out.push(strings.join(''));
    } else if (match[4] !== undefined) {
      // Td / TD / T* / ET — a new line / paragraph break.
      out.push('\n');
    }
  }
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const isLikelyPdf = (bytes: Uint8Array): boolean =>
  bytes.length >= 5 &&
  bytes[0] === 0x25 && // %
  bytes[1] === 0x50 && // P
  bytes[2] === 0x44 && // D
  bytes[3] === 0x46 && // F
  bytes[4] === 0x2d; // -

export const extractPdfText = async (buffer: ArrayBuffer): Promise<string> => {
  if (!isLikelyPdf(new Uint8Array(buffer))) {
    throw new Error('Not a PDF file');
  }
  const content = await collectContentStreams(buffer);
  const text = textFromContent(content);
  if (text.length === 0) {
    throw new Error(
      'No extractable text — this PDF may be scanned/image-only. Save it as .docx instead.',
    );
  }
  return text;
};
