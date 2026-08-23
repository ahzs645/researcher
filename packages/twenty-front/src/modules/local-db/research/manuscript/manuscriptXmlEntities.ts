// One decoder for the XML that citeproc hands back. It lives on its own
// because both the citation formatter and the CSL engine wrapper read that
// output, and two copies of this drifted apart once already: a journal named
// "Air & Waste Management" arrives as `&#38;`, and a decoder that only knows
// the five named entities leaves it literal for the next stage to escape again
// into a visible `&amp;#38;`.

const NAMED_XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
};

const XML_ENTITY = /&(?:amp|apos|gt|lt|quot|#(\d{1,7})|#x([0-9a-fA-F]{1,6}));/g;

// One pass, so a decoded `&` can never be read as the start of another entity.
export const decodeXmlEntities = (value: string): string =>
  value.replace(XML_ENTITY, (entity, decimal?: string, hex?: string) => {
    const codePoint =
      decimal !== undefined
        ? Number(decimal)
        : hex !== undefined
          ? Number.parseInt(hex, 16)
          : Number.NaN;
    if (Number.isNaN(codePoint)) return NAMED_XML_ENTITIES[entity] ?? entity;
    return codePoint > 0x10ffff ? entity : String.fromCodePoint(codePoint);
  });
