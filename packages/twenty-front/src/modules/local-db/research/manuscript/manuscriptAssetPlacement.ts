// A placement marker is intentionally different from a live cross-reference.
// `[#figure-key]` renders as "Fig. 2" in prose; `[[asset:figure-key]]`
// inserts the actual image/table at that exact point in the owning section.

const ASSET_PLACEMENT_PATTERN = /\[\[asset:([^\]\s]+)\]\]/g;

export type AssetPlacementSegment =
  | { kind: 'prose'; markdown: string }
  | { kind: 'asset'; refKey: string };

export const assetPlacementMarker = (refKey: string): string =>
  `[[asset:${refKey}]]`;

export const splitAssetPlacementMarkers = (
  markdown: string,
): AssetPlacementSegment[] => {
  const segments: AssetPlacementSegment[] = [];
  let cursor = 0;

  for (const match of markdown.matchAll(ASSET_PLACEMENT_PATTERN)) {
    const index = match.index ?? 0;
    const prose = markdown.slice(cursor, index);
    if (prose.trim().length > 0) {
      segments.push({ kind: 'prose', markdown: prose.trim() });
    }
    segments.push({ kind: 'asset', refKey: match[1] });
    cursor = index + match[0].length;
  }

  const remaining = markdown.slice(cursor);
  if (remaining.trim().length > 0) {
    segments.push({ kind: 'prose', markdown: remaining.trim() });
  }
  return segments;
};

export const stripAssetPlacementMarkers = (markdown: string): string =>
  markdown.replace(ASSET_PLACEMENT_PATTERN, ' ');
