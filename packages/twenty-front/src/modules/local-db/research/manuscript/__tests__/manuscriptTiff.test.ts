import { decodeTiff } from '@/local-db/research/manuscript/manuscriptTiff';

// Two kinds of fixture. The hand-assembled ones below pin down structure —
// endianness, tags, predictors — one property at a time. The base64 blobs are
// real files written by an imaging library, so the codecs are checked against
// an encoder we did not write; their expected pixels are that library's own
// readback. (Deflate is exercised the same way outside these tests: jsdom has
// no `DecompressionStream`, which that path needs.)

type Field = { tag: number; type: number; values: number[] };

const buildTiff = (
  fields: Field[],
  imageData: number[],
  littleEndian = true,
): Uint8Array => {
  const sizes: Record<number, number> = { 1: 1, 3: 2, 4: 4 };
  const sorted = [...fields].sort((a, b) => a.tag - b.tag);
  const headerSize = 8;
  const ifdSize = 2 + sorted.length * 12 + 4;
  // Anything wider than the entry's four value bytes goes after the IFD.
  const overflow = new Map<Field, number>();
  let cursor = headerSize + ifdSize;
  for (const field of sorted) {
    const byteLength = sizes[field.type] * field.values.length;
    if (byteLength > 4) {
      overflow.set(field, cursor);
      cursor += byteLength;
    }
  }
  const stripOffset = cursor;

  const bytes = new Uint8Array(stripOffset + imageData.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d, false);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, headerSize, littleEndian);
  view.setUint16(headerSize, sorted.length, littleEndian);

  const writeValues = (offset: number, field: Field) => {
    field.values.forEach((value, index) => {
      const at = offset + index * sizes[field.type];
      if (field.type === 1) view.setUint8(at, value);
      else if (field.type === 3) view.setUint16(at, value, littleEndian);
      else view.setUint32(at, value, littleEndian);
    });
  };

  sorted.forEach((field, index) => {
    const base = headerSize + 2 + index * 12;
    view.setUint16(base, field.tag, littleEndian);
    view.setUint16(base + 2, field.type, littleEndian);
    view.setUint32(base + 4, field.values.length, littleEndian);
    // StripOffsets is only known once the pixels have a home.
    const resolved =
      field.tag === 273 ? { ...field, values: [stripOffset] } : field;
    const target = overflow.get(field);
    if (target === undefined) {
      writeValues(base + 8, resolved);
    } else {
      view.setUint32(base + 8, target, littleEndian);
      writeValues(target, resolved);
    }
  });
  bytes.set(Uint8Array.from(imageData), stripOffset);
  return bytes;
};

const rgbTags = (
  width: number,
  height: number,
  compression: number,
  samplesPerPixel = 3,
): Field[] => [
  { tag: 256, type: 3, values: [width] },
  { tag: 257, type: 3, values: [height] },
  { tag: 258, type: 3, values: Array(samplesPerPixel).fill(8) },
  { tag: 259, type: 3, values: [compression] },
  { tag: 262, type: 3, values: [2] },
  { tag: 273, type: 4, values: [0] },
  { tag: 277, type: 3, values: [samplesPerPixel] },
  { tag: 278, type: 4, values: [height] },
  { tag: 279, type: 4, values: [width * height * samplesPerPixel] },
];

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(Buffer.from(value, 'base64'));

// 32×4 RGB, LZW. Wide enough that the stream crosses the 9→10 bit step, which
// is where TIFF's LZW differs from every other LZW.
const RGB_LZW =
  'SUkqAMYBAACAACBAcAgEHAICBUBgkOAQICMChkVAYSDEDjEcAggD8ElEjAoyE0FnkqAxIFsGqkxA5iGkHuE4BAAHcIiE/BIiIUJmlGBRIJMKrlNBZyKELhFUBggK8MnFbBpSL0NtliBwIMsOklpB5CNkPsEBgsCgoGAYIg0EhgHA4Pg8KiYIB4WhEUjQJDYdhMikIKFYkhU0lALH4rhdKl4MK4yhlkmwNOY5hsCnoOCZA1lEB43I8PpVLCBfJ0QulSCILKsRkVZCQ7LkSqlgCZvMcThVnCgnNUUoluCpjAYLAoGhcFhS1BsMhMRBoNCkNiMYBwXDcOjsfB4lEUPlsmCA3FMQoMtCJNGERrM0CRnG8Sus7CYFH0TitCbhFik5pIVJpMithlAFh3FOFoNlcFwlFqF49l4GBXGGGJxmUGQNGiGYpmwGhHG+GplgSEIHggEQIAuEYJg8EgMBKEoPhYEwUBmE4Zh0FAgCCFIniQFQwCeFY5isFhEC6FpPjIFxcDWF5pjkGB4DyGIHkAGQYEPCxHBoPBKhqT5OBsZBRhueZVBwEBYhyJ5cB0QBfh2WZjB4dBmh6D5qB8LBth+SZxCAaCAgAAoAAAEDAAEAAAAgAAAAAQEDAAEAAAAEAAAAAgEDAAMAAABEAgAAAwEDAAEAAAAFAAAABgEDAAEAAAACAAAAEQEEAAEAAAAIAAAAFQEDAAEAAAADAAAAFgEDAAEAAAAEAAAAFwEEAAEAAAC9AQAAHAEDAAEAAAABAAAAAAAAAAgACAAIAA==';
// The same picture, LZW plus horizontal differencing.
const RGB_LZW_PREDICTOR =
  'SUkqAOgAAACAACBAcAgGCAOCAWCAeCAmCAuCA2CA+CBGCBOCBWCBeCBmCBuCB2CB+CCGCCOCCWCCeCCmCCuCC2CC+CDGCDOCDWCDeCDmCDuCD0BguFQWDwmFw2HxGJxWLxmNx2PyGRyWTymVy2XzGZzWbzmdz2f0EDBYFQSDAGEAGiwwAw4AxAAxIAxQAxYAxgAxoAxwAx4AyAAyIAyQAyYAygAyoAywAy4AzAAzIAzQAzYAzgAzoAzwAz4A0AAj0EiG7Wm122lXGmXWnXmoX2pYGqYWrYmsY2tZGuZWvZmwZ2xaGgwEAAsAAAEDAAEAAAAgAAAAAQEDAAEAAAAEAAAAAgEDAAMAAAByAQAAAwEDAAEAAAAFAAAABgEDAAEAAAACAAAAEQEEAAEAAAAIAAAAFQEDAAEAAAADAAAAFgEDAAEAAAAEAAAAFwEEAAEAAADfAAAAHAEDAAEAAAABAAAAPQEDAAEAAAACAAAAAAAAAAgACAAIAA==';
// 16×4 grayscale, PackBits.
const GRAY_PACKBITS =
  'SUkqAEwAAAAPAAMGCQ0QFBgdISYrMTY8Qg8ICw4RFBgcICUpLjM4PkRKDxATFhkcICQoLTE2O0BGTFIPGBseISQoLDA1OT5DSE5UWgkAAAEDAAEAAAAQAAAAAQEDAAEAAAAEAAAAAgEDAAEAAAAIAAAAAwEDAAEAAAAFgAAABgEDAAEAAAABAAAAEQEEAAEAAAAIAAAAFgEDAAEAAAAEAAAAFwEEAAEAAABEAAAAHAEDAAEAAAABAAAAAAAAAA==';
// 8×8 RGB written as four two-row strips.
const RGB_STRIPED =
  'SUkqAAgAAAAKAAABBAABAAAACAAAAAEBBAABAAAACAAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAAEAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAAAgAAABcBBAAEAAAAnAAAABwBAwABAAAAAQAAAAAAAAAIAAgACACsAAAA3AAAAAwBAAA8AQAAMAAAADAAAAAwAAAAMAAAAAAAAAcBAQ4CBBUDCRwEECMFGSoGJDEHMQMLBQoMBhENCRgODh8PFSYQHi0RKTQSNgYWCg0XCxQYDhsZEyIaGikbIzAcLjcdOwkhDxAiEBcjEx4kGCUlHywmKDMnMzooQAwsFBMtFRouGCEvHSgwJC8xLTYyOD0zRQ83GRY4Gh05HSQ6Iis7KTI8Mjk9PUA+ShJCHhlDHyBEIidFJy5GLjVHNzxIQkNJTxVNIxxOJCNPJypQLDFRMzhSPD9TR0ZUVA==';

const pixelAt = (
  decoded: { width: number; pixels: Uint8ClampedArray },
  x: number,
  y: number,
): number[] => {
  const at = (y * decoded.width + x) * 4;
  return [...decoded.pixels.slice(at, at + 4)];
};

describe('decodeTiff', () => {
  it('decodes an uncompressed RGB image', async () => {
    const decoded = await decodeTiff(
      buildTiff(
        rgbTags(2, 2, 1),
        [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255],
      ),
    );

    expect(decoded).not.toBeNull();
    expect([decoded!.width, decoded!.height]).toEqual([2, 2]);
    expect(pixelAt(decoded!, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(decoded!, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(decoded!, 0, 1)).toEqual([0, 0, 255, 255]);
  });

  it('reads big-endian files and keeps the alpha channel', async () => {
    const tags = rgbTags(1, 2, 1, 4);
    tags.push({ tag: 338, type: 3, values: [2] });
    const decoded = await decodeTiff(
      buildTiff(tags, [10, 20, 30, 128, 40, 50, 60, 255], false),
    );

    expect(pixelAt(decoded!, 0, 0)).toEqual([10, 20, 30, 128]);
    expect(pixelAt(decoded!, 0, 1)).toEqual([40, 50, 60, 255]);
  });

  it('undoes horizontal differencing', async () => {
    const tags = rgbTags(3, 1, 1);
    tags.push({ tag: 317, type: 3, values: [2] });
    // Deltas for red 10 → 20 → 30, with green and blue flat.
    const decoded = await decodeTiff(
      buildTiff(tags, [10, 0, 0, 10, 0, 0, 10, 0, 0]),
    );

    expect(pixelAt(decoded!, 0, 0)[0]).toBe(10);
    expect(pixelAt(decoded!, 1, 0)[0]).toBe(20);
    expect(pixelAt(decoded!, 2, 0)[0]).toBe(30);
  });

  it('resolves a colour map', async () => {
    const tags = rgbTags(2, 1, 1, 1);
    tags.find((field) => field.tag === 262)!.values = [3];
    // Two entries — red then blue — as 16-bit ramps: reds, then greens, then
    // blues, which is the order the tag stores them in.
    tags.push({ tag: 320, type: 3, values: [0xffff, 0, 0, 0, 0, 0xffff] });
    const decoded = await decodeTiff(buildTiff(tags, [0, 1]));

    expect(pixelAt(decoded!, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(decoded!, 1, 0)).toEqual([0, 0, 255, 255]);
  });

  it('expands a bilevel scan where zero means white', async () => {
    const tags = rgbTags(8, 1, 1, 1);
    tags.find((field) => field.tag === 258)!.values = [1];
    tags.find((field) => field.tag === 262)!.values = [0];
    tags.find((field) => field.tag === 279)!.values = [1];
    const decoded = await decodeTiff(buildTiff(tags, [0b10000000]));

    expect(pixelAt(decoded!, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(decoded!, 1, 0)).toEqual([255, 255, 255, 255]);
  });

  it('decodes a real LZW file across the code-width step', async () => {
    const decoded = await decodeTiff(fromBase64(RGB_LZW));

    expect(decoded).not.toBeNull();
    expect([decoded!.width, decoded!.height]).toEqual([32, 4]);
    expect(pixelAt(decoded!, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(decoded!, 3, 2)).toEqual([27, 25, 19, 255]);
    expect(pixelAt(decoded!, 31, 3)).toEqual([226, 64, 208, 255]);
  });

  it('decodes a real LZW file that also uses a predictor', async () => {
    const decoded = await decodeTiff(fromBase64(RGB_LZW_PREDICTOR));

    expect(pixelAt(decoded!, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(decoded!, 3, 2)).toEqual([27, 25, 19, 255]);
    expect(pixelAt(decoded!, 31, 3)).toEqual([226, 64, 208, 255]);
  });

  it('decodes a real PackBits file', async () => {
    const decoded = await decodeTiff(fromBase64(GRAY_PACKBITS));

    expect([decoded!.width, decoded!.height]).toEqual([16, 4]);
    expect(pixelAt(decoded!, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(decoded!, 3, 2)).toEqual([25, 25, 25, 255]);
    expect(pixelAt(decoded!, 15, 3)).toEqual([90, 90, 90, 255]);
  });

  it('walks every strip of a striped file', async () => {
    const decoded = await decodeTiff(fromBase64(RGB_STRIPED));

    expect([decoded!.width, decoded!.height]).toEqual([8, 8]);
    expect(pixelAt(decoded!, 0, 0)).toEqual([0, 0, 0, 255]);
    // Rows 5 and 7 land in the third and fourth strips.
    expect(pixelAt(decoded!, 3, 5)).toEqual([36, 58, 34, 255]);
    expect(pixelAt(decoded!, 7, 7)).toEqual([70, 84, 84, 255]);
  });

  it('returns null rather than guessing at what it cannot read', async () => {
    const sixteenBit = rgbTags(1, 1, 1);
    sixteenBit.find((field) => field.tag === 258)!.values = [16, 16, 16];
    expect(
      await decodeTiff(buildTiff(sixteenBit, [0, 0, 0, 0, 0, 0])),
    ).toBeNull();

    const jpegInTiff = rgbTags(1, 1, 7);
    expect(await decodeTiff(buildTiff(jpegInTiff, [0, 0, 0]))).toBeNull();

    expect(
      await decodeTiff(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])),
    ).toBeNull();
    expect(await decodeTiff(new Uint8Array(0))).toBeNull();
  });
});
