// One definition of "how long is this", shared by everything that counts.
//
// It lived in `manuscriptAssembly` until the variant resolver needed it too,
// and importing the assembler from the resolver the assembler calls made a
// cycle. A second counter in its own module would have been the easy way out
// and the wrong one: a word count that disagrees with itself is how an author
// ends up trusting "182 / 200" in the editor and being rejected by the journal.

import { stripAssetPlacementMarkers } from './manuscriptAssetPlacement';

// Markdown that renders as something other than words does not count as words:
// an image, a citation or cross-reference marker, and display or inline maths
// all come out before the split, and the remaining punctuation with them.
export const countWords = (markdown: string): number => {
  const text = stripAssetPlacementMarkers(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[-?[#@][^\]]*\]/g, ' ') // cross-refs / citations
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, ' ') // math
    .replace(/[#*_>`~-]/g, ' ')
    .trim();
  return text.length === 0 ? 0 : text.split(/\s+/).length;
};
