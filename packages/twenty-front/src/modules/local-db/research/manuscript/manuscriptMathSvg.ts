import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';

// The complete TeX SVG font is bundled. No CDN, dynamic font requests, global
// MathJax page state, or flattened Unicode approximation enters the PDF.
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', {
  InputJax: new TeX({
    packages: ['base', 'ams', 'newcommand'],
    formatError: (_jax: unknown, error: Error) => {
      throw error;
    },
  }),
  OutputJax: new SVG({ fontCache: 'none', font: new MathJaxTexFont() }),
});

export const manuscriptMathSvg = (latex: string, fontSize: number) => {
  const container = document.convert(latex, {
    display: true,
    em: 16,
    ex: 8,
    containerWidth: 1200,
  });
  const svg = adaptor.tags(container, 'svg')[0];
  if (svg === undefined)
    throw new Error('Unable to typeset manuscript equation');
  const viewBox = adaptor.getAttribute(svg, 'viewBox');
  const dimensions = viewBox.split(/\s+/).map(Number);
  const width = (dimensions[2] / 1000) * fontSize;
  const height = (dimensions[3] / 1000) * fontSize;
  if (!(width > 0 && height > 0))
    throw new Error('Invalid manuscript equation dimensions');
  return { svg: adaptor.outerHTML(svg), viewBox, width, height };
};
