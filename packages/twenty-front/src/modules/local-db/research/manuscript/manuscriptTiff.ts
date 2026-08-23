// Baseline TIFF → RGBA, so a .docx that embeds a TIFF figure still shows a
// picture. No browser decodes TIFF, and Word writes them routinely (a chart
// pasted from ArcGIS or SPSS arrives as one), so the figure imported as a
// data URL nothing could paint. Same philosophy as the .docx unzip next door:
// read the container ourselves rather than take a dependency.
//
// Covers the baseline a writing tool actually emits — strips, the four common
// compressions, grayscale/RGB/palette at 8 bits, plus 1-bit bilevel — and
// returns null for anything else (tiled, 16-bit, CMYK, YCbCr, JPEG-in-TIFF)
// so the caller can fall back instead of painting garbage.

const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_PLANAR_CONFIG = 284;
const TAG_PREDICTOR = 317;
const TAG_COLOR_MAP = 320;
const TAG_EXTRA_SAMPLES = 338;

const COMPRESSION_NONE = 1;
const COMPRESSION_LZW = 5;
const COMPRESSION_DEFLATE = 8;
const COMPRESSION_DEFLATE_OLD = 32946;
const COMPRESSION_PACKBITS = 32773;

const PHOTOMETRIC_WHITE_IS_ZERO = 0;
const PHOTOMETRIC_BLACK_IS_ZERO = 1;
const PHOTOMETRIC_RGB = 2;
const PHOTOMETRIC_PALETTE = 3;

// Bytes per value, indexed by TIFF field type.
const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

export type DecodedTiff = {
  width: number;
  height: number;
  // RGBA, one byte per channel, row-major.
  pixels: Uint8ClampedArray;
};

type Entry = { type: number; count: number; values: number[] };

const readValue = (
  view: DataView,
  offset: number,
  type: number,
  littleEndian: boolean,
): number => {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return view.getUint8(offset);
    case 3:
      return view.getUint16(offset, littleEndian);
    case 6:
      return view.getInt8(offset);
    case 8:
      return view.getInt16(offset, littleEndian);
    case 9:
      return view.getInt32(offset, littleEndian);
    case 5:
    case 10:
      return (
        view.getUint32(offset, littleEndian) /
        (view.getUint32(offset + 4, littleEndian) || 1)
      );
    default:
      return view.getUint32(offset, littleEndian);
  }
};

const readIfd = (
  view: DataView,
  ifdOffset: number,
  littleEndian: boolean,
): Map<number, Entry> | null => {
  if (ifdOffset + 2 > view.byteLength) return null;
  const entryCount = view.getUint16(ifdOffset, littleEndian);
  const entries = new Map<number, Entry>();

  for (let index = 0; index < entryCount; index += 1) {
    const base = ifdOffset + 2 + index * 12;
    if (base + 12 > view.byteLength) return null;
    const tag = view.getUint16(base, littleEndian);
    const type = view.getUint16(base + 2, littleEndian);
    const count = view.getUint32(base + 4, littleEndian);
    const size = TYPE_SIZES[type];
    if (size === undefined || count > 0xffffff) continue;
    const inline = size * count <= 4;
    const valueOffset = inline
      ? base + 8
      : view.getUint32(base + 8, littleEndian);
    if (valueOffset + size * count > view.byteLength) continue;
    const values: number[] = [];
    for (let item = 0; item < count; item += 1) {
      values.push(
        readValue(view, valueOffset + item * size, type, littleEndian),
      );
    }
    entries.set(tag, { type, count, values });
  }
  return entries;
};

const first = (entries: Map<number, Entry>, tag: number, fallback: number) =>
  entries.get(tag)?.values[0] ?? fallback;

// TIFF's LZW: MSB-first codes of 9–12 bits, and the width steps up one code
// earlier than the GIF variant everyone remembers.
const decodeLzw = (input: Uint8Array): Uint8Array => {
  const output: number[] = [];
  let dictionary: number[][] = [];
  const resetDictionary = () => {
    dictionary = [];
    for (let index = 0; index < 256; index += 1) dictionary.push([index]);
    dictionary.push([], []); // 256 = clear, 257 = end of information
  };
  resetDictionary();

  let codeWidth = 9;
  let previous: number[] | null = null;
  let bitBuffer = 0;
  let bitCount = 0;

  for (let index = 0; index < input.length; index += 1) {
    bitBuffer = (bitBuffer << 8) | input[index];
    bitCount += 8;
    while (bitCount >= codeWidth) {
      const code =
        (bitBuffer >> (bitCount - codeWidth)) & ((1 << codeWidth) - 1);
      bitCount -= codeWidth;

      if (code === 256) {
        resetDictionary();
        codeWidth = 9;
        previous = null;
        continue;
      }
      if (code === 257) return Uint8Array.from(output);

      let entry: number[];
      if (code < dictionary.length && dictionary[code].length > 0) {
        entry = dictionary[code];
      } else if (previous !== null) {
        entry = [...previous, previous[0]];
      } else {
        return Uint8Array.from(output);
      }
      output.push(...entry);
      if (previous !== null) dictionary.push([...previous, entry[0]]);
      previous = entry;

      if (dictionary.length + 1 >= 1 << codeWidth && codeWidth < 12) {
        codeWidth += 1;
      }
    }
  }
  return Uint8Array.from(output);
};

const decodePackBits = (input: Uint8Array): Uint8Array => {
  const output: number[] = [];
  let index = 0;
  while (index < input.length) {
    const header = input[index];
    index += 1;
    if (header === 128) continue;
    if (header < 128) {
      const runLength = header + 1;
      for (let item = 0; item < runLength; item += 1) {
        output.push(input[index + item] ?? 0);
      }
      index += runLength;
    } else {
      const runLength = 257 - header;
      const value = input[index] ?? 0;
      index += 1;
      for (let item = 0; item < runLength; item += 1) output.push(value);
    }
  }
  return Uint8Array.from(output);
};

const inflateZlib = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Response(
    new Blob([new Uint8Array(bytes).buffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate')),
  );
  return new Uint8Array(await stream.arrayBuffer());
};

const decompressStrip = async (
  bytes: Uint8Array,
  compression: number,
): Promise<Uint8Array | null> => {
  switch (compression) {
    case COMPRESSION_NONE:
      return bytes;
    case COMPRESSION_LZW:
      return decodeLzw(bytes);
    case COMPRESSION_PACKBITS:
      return decodePackBits(bytes);
    case COMPRESSION_DEFLATE:
    case COMPRESSION_DEFLATE_OLD:
      try {
        return await inflateZlib(bytes);
      } catch {
        return null;
      }
    default:
      return null;
  }
};

// Horizontal differencing: each sample stores its delta from the one before it
// on the same row, which is what makes LZW/Deflate worth applying at all.
const undoHorizontalPredictor = (
  row: Uint8Array,
  width: number,
  samplesPerPixel: number,
): void => {
  for (let x = samplesPerPixel; x < width * samplesPerPixel; x += 1) {
    row[x] = (row[x] + row[x - samplesPerPixel]) & 0xff;
  }
};

const expandBilevelRow = (row: Uint8Array, width: number): Uint8Array => {
  const expanded = new Uint8Array(width);
  for (let x = 0; x < width; x += 1) {
    const bit = (row[x >> 3] >> (7 - (x & 7))) & 1;
    expanded[x] = bit === 1 ? 255 : 0;
  }
  return expanded;
};

export const decodeTiff = async (
  bytes: Uint8Array,
): Promise<DecodedTiff | null> => {
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteOrder = view.getUint16(0, false);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const littleEndian = byteOrder === 0x4949;
  if (view.getUint16(2, littleEndian) !== 42) return null;

  const entries = readIfd(view, view.getUint32(4, littleEndian), littleEndian);
  if (entries === null) return null;

  const width = first(entries, TAG_IMAGE_WIDTH, 0);
  const height = first(entries, TAG_IMAGE_LENGTH, 0);
  if (width <= 0 || height <= 0 || width * height > 64_000_000) return null;

  const compression = first(entries, TAG_COMPRESSION, COMPRESSION_NONE);
  const photometric = first(
    entries,
    TAG_PHOTOMETRIC,
    PHOTOMETRIC_BLACK_IS_ZERO,
  );
  const samplesPerPixel = first(entries, TAG_SAMPLES_PER_PIXEL, 1);
  const bitsPerSample = entries.get(TAG_BITS_PER_SAMPLE)?.values ?? [1];
  const planarConfig = first(entries, TAG_PLANAR_CONFIG, 1);
  const predictor = first(entries, TAG_PREDICTOR, 1);
  const rowsPerStrip = first(entries, TAG_ROWS_PER_STRIP, height);
  const stripOffsets = entries.get(TAG_STRIP_OFFSETS)?.values ?? [];
  const stripByteCounts = entries.get(TAG_STRIP_BYTE_COUNTS)?.values ?? [];
  const colorMap = entries.get(TAG_COLOR_MAP)?.values;
  const hasAlpha = (entries.get(TAG_EXTRA_SAMPLES)?.values[0] ?? 0) !== 0;

  const bilevel =
    bitsPerSample.every((bits) => bits === 1) && samplesPerPixel === 1;
  const eightBit = bitsPerSample.every((bits) => bits === 8);
  if (!bilevel && !eightBit) return null;
  if (planarConfig !== 1) return null;
  if (predictor !== 1 && predictor !== 2) return null;
  if (stripOffsets.length === 0 || rowsPerStrip <= 0) return null;
  if (photometric === PHOTOMETRIC_PALETTE && colorMap === undefined)
    return null;

  const bytesPerRow = bilevel ? Math.ceil(width / 8) : width * samplesPerPixel;
  const pixels = new Uint8ClampedArray(width * height * 4);
  // A palette is stored as three 16-bit ramps, all reds then greens then blues.
  const paletteEntries = colorMap === undefined ? 0 : colorMap.length / 3;

  for (let strip = 0; strip < stripOffsets.length; strip += 1) {
    const offset = stripOffsets[strip];
    const byteCount =
      stripByteCounts[strip] ??
      Math.min(bytes.length - offset, bytesPerRow * rowsPerStrip);
    if (offset < 0 || offset + byteCount > bytes.length) return null;
    const decoded = await decompressStrip(
      bytes.subarray(offset, offset + byteCount),
      compression,
    );
    if (decoded === null) return null;

    const stripStartRow = strip * rowsPerStrip;
    const stripRows = Math.min(rowsPerStrip, height - stripStartRow);
    for (let rowInStrip = 0; rowInStrip < stripRows; rowInStrip += 1) {
      const rowStart = rowInStrip * bytesPerRow;
      if (rowStart + bytesPerRow > decoded.length) break;
      let row = decoded.subarray(rowStart, rowStart + bytesPerRow);
      if (predictor === 2 && !bilevel) {
        row = row.slice();
        undoHorizontalPredictor(row, width, samplesPerPixel);
      }
      if (bilevel) row = expandBilevelRow(row, width);

      const y = stripStartRow + rowInStrip;
      for (let x = 0; x < width; x += 1) {
        const target = (y * width + x) * 4;
        if (photometric === PHOTOMETRIC_RGB) {
          const source = x * samplesPerPixel;
          pixels[target] = row[source];
          pixels[target + 1] = row[source + 1];
          pixels[target + 2] = row[source + 2];
          pixels[target + 3] =
            hasAlpha && samplesPerPixel >= 4 ? row[source + 3] : 255;
          continue;
        }
        if (photometric === PHOTOMETRIC_PALETTE && colorMap !== undefined) {
          const index = Math.min(row[x * samplesPerPixel], paletteEntries - 1);
          pixels[target] = colorMap[index] >> 8;
          pixels[target + 1] = colorMap[paletteEntries + index] >> 8;
          pixels[target + 2] = colorMap[paletteEntries * 2 + index] >> 8;
          pixels[target + 3] = 255;
          continue;
        }
        const sample = bilevel ? row[x] : row[x * samplesPerPixel];
        const grey =
          photometric === PHOTOMETRIC_WHITE_IS_ZERO ? 255 - sample : sample;
        pixels[target] = grey;
        pixels[target + 1] = grey;
        pixels[target + 2] = grey;
        pixels[target + 3] =
          hasAlpha && samplesPerPixel >= 2 ? row[x * samplesPerPixel + 1] : 255;
      }
    }
  }

  return { width, height, pixels };
};

const isBrowserEnvironment = (): boolean =>
  typeof document !== 'undefined' && typeof window !== 'undefined';

// Re-encode a TIFF as a PNG data URL. Null when it cannot be decoded here, so
// the caller keeps the original bytes and warns instead of losing the figure.
export const tiffToPngDataUrl = async (
  bytes: Uint8Array,
): Promise<string | null> => {
  if (!isBrowserEnvironment()) return null;
  let decoded: DecodedTiff | null = null;
  try {
    decoded = await decodeTiff(bytes);
  } catch {
    return null;
  }
  if (decoded === null) return null;

  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const canvasContext = canvas.getContext('2d');
  if (canvasContext === null) return null;
  const image = canvasContext.createImageData(decoded.width, decoded.height);
  image.data.set(decoded.pixels);
  canvasContext.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
};
