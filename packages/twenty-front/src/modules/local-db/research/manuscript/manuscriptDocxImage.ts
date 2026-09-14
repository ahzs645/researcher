import { ImageRun } from 'docx';

export const manuscriptDocxImageType = (
  bytes: Uint8Array,
): 'png' | 'jpg' | 'gif' | 'bmp' | undefined => {
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    )
  )
    return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (String.fromCharCode(...bytes.slice(0, 6)).match(/^GIF8[79]a$/))
    return 'gif';
  if (bytes[0] === 66 && bytes[1] === 77) return 'bmp';
  return undefined;
};

export const manuscriptDocxImageRun = async (
  blob: Blob,
  width: number | undefined,
  caption: string,
): Promise<ImageRun> => {
  const bitmap = await createImageBitmap(blob);
  try {
    let bytes = new Uint8Array(await blob.arrayBuffer());
    let type = manuscriptDocxImageType(bytes);
    if (type === undefined) {
      // Word cannot embed every browser image format. Convert unsupported
      // formats to PNG, never disguise their original bytes as GIF.
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (context === null)
        throw new Error('Cannot convert manuscript image to PNG');
      context.drawImage(bitmap, 0, 0);
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result === null
              ? reject(new Error('Cannot encode manuscript image'))
              : resolve(result),
          'image/png',
        ),
      );
      bytes = new Uint8Array(await png.arrayBuffer());
      type = 'png';
    }
    const renderedWidth = width || bitmap.width;
    return new ImageRun({
      type,
      data: bytes,
      transformation: {
        width: renderedWidth,
        height: (renderedWidth / bitmap.width) * bitmap.height,
      },
      ...(caption
        ? { altText: { description: caption, name: caption, title: caption } }
        : {}),
    });
  } finally {
    bitmap.close();
  }
};
