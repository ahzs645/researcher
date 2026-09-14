/* oxlint-disable twenty/no-hardcoded-colors -- equations print in black independently of the application theme. */
import { G, Path, Rect, Svg, Text, View } from '@react-pdf/renderer';
import { createElement, type ReactNode } from 'react';

import { manuscriptMathSvg } from './manuscriptMathSvg';
import { PRINTABLE_WIDTH_POINTS } from './manuscriptPageMetrics';

export const renderManuscriptPdfEquation = (
  latex: string,
  fontSize: number,
  label?: string,
): ReactNode => {
  const math = manuscriptMathSvg(latex, fontSize);
  const element = new DOMParser().parseFromString(
    math.svg,
    'image/svg+xml',
  ).documentElement;
  const shapes = (parent: Element): ReactNode[] =>
    Array.from(parent.children).map((child, index) => {
      const properties: Record<string, string | number> = { key: index };
      for (const attribute of [
        'd',
        'transform',
        'x',
        'y',
        'width',
        'height',
        'fill',
      ]) {
        if (child.hasAttribute(attribute))
          properties[attribute] =
            child.getAttribute(attribute) === 'currentColor'
              ? '#000000'
              : (child.getAttribute(attribute) ?? '');
      }
      if (child.localName === 'path')
        return createElement(Path, {
          ...properties,
          d: child.getAttribute('d') ?? '',
        });
      if (child.localName === 'rect')
        return createElement(Rect, {
          ...properties,
          width: child.getAttribute('width') ?? '0',
          height: child.getAttribute('height') ?? '0',
        });
      if (child.localName === 'g')
        return createElement(G, properties, ...shapes(child));
      if (child.localName === 'title' || child.localName === 'desc')
        return null;
      // Never silently omit a glyph/unsupported SVG node from scientific math.
      throw new Error(`Unsupported equation SVG element: ${child.localName}`);
    });
  const scale = Math.min(
    1,
    (PRINTABLE_WIDTH_POINTS - (label ? 48 : 0)) / math.width,
  );
  return createElement(
    View,
    {
      wrap: false,
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 8,
      },
    },
    createElement(
      Svg,
      {
        viewBox: math.viewBox,
        width: math.width * scale,
        height: math.height * scale,
        fill: '#000000',
      },
      ...shapes(element),
    ),
    ...(label
      ? [createElement(Text, { style: { marginLeft: 12, fontSize } }, label)]
      : []),
  );
};
