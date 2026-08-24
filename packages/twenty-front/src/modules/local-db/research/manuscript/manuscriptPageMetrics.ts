// The page every exporter is laying content onto.
//
// The block model measures widths in CSS pixels (BlockNote's DOCX mapper turns
// them into twips, its PDF mapper wants points), so the printable column is
// stated once here in pixels and converted where it is used. A4 is the
// narrower of the two page sizes the exporters produce, so it sets the number
// — a table sized for Letter overflowed the A4 page the PDF exporter fixes.

export const A4_WIDTH_POINTS = 595.28;
export const A4_HEIGHT_POINTS = 841.89;
// One-inch margins, both sides.
export const PAGE_MARGIN_POINTS = 72;
export const PX_TO_POINTS = 0.75;

export const PRINTABLE_WIDTH_POINTS = A4_WIDTH_POINTS - PAGE_MARGIN_POINTS * 2;
// 600 px is 450 pt; A4 less its margins is 451.
export const PRINTABLE_WIDTH_PX =
  Math.floor(PRINTABLE_WIDTH_POINTS / PX_TO_POINTS / 10) * 10;
// A tall figure is scaled to fit this rather than being squashed into it.
export const PRINTABLE_FIGURE_HEIGHT_PX = 840;
