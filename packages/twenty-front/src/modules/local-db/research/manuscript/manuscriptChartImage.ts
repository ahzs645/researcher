// Browser-only: rasterize a chart SVG (from `manuscriptChart.ts`) to a PNG
// data-URL. PNG embeds reliably in the DOCX/PDF exporters where an SVG data-URL
// may not, so a plotted figure survives export. Pure SVG generation and the
// data-shaping stay in `manuscriptChart.ts` (unit-tested); this file only does
// the canvas work the tests can't.

// UTF-8 safe base64 (btoa only handles latin1), without the deprecated unescape.
const utf8ToBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const svgToDataUrl = (svg: string): string =>
  `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;

export const rasterizeSvgToPngDataUrl = (
  svg: string,
  width: number,
  height: number,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale =
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      if (context === null) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('toDataURL failed'));
      }
    };
    image.onerror = () => reject(new Error('Could not render chart SVG'));
    image.src = svgToDataUrl(svg);
  });
