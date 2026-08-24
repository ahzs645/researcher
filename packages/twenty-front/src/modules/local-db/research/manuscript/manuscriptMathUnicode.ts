// Flattened Unicode maths → LaTeX.
//
// Word has no display-equation object, so a Copernicus/Elsevier template sets
// an equation as ordinary characters in a layout table: "x̄j,time = Σi wij xi /
// Σi wij". Imported verbatim that string is *text* — the MathML and OMML
// renderers both expect LaTeX, so a summation printed as the letter Σ and a
// subscript printed as a small digit stayed literal instead of being typeset.
//
// This recovers only what the characters state outright: named symbols, the
// Unicode sub/superscript alphabets, and a combining accent. It never infers
// structure that the source did not write — "wij" keeps its letters rather than
// becoming w_{ij}, because only the author knows which of them is an index.
// Anything unrecognised passes through unchanged.

import { COMMAND_TEXT } from './manuscriptMathGlyphs';

const SUBSCRIPT_TO_PLAIN: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '-',
  '₌': '=',
  '₍': '(',
  '₎': ')',
  ₐ: 'a',
  ₑ: 'e',
  ₕ: 'h',
  ᵢ: 'i',
  ⱼ: 'j',
  ₖ: 'k',
  ₗ: 'l',
  ₘ: 'm',
  ₙ: 'n',
  ₒ: 'o',
  ₚ: 'p',
  ᵣ: 'r',
  ₛ: 's',
  ₜ: 't',
  ᵤ: 'u',
  ᵥ: 'v',
  ₓ: 'x',
};

const SUPERSCRIPT_TO_PLAIN: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
  ⁿ: 'n',
  ⁱ: 'i',
  ᵃ: 'a',
  ᵇ: 'b',
  ᶜ: 'c',
  ᵈ: 'd',
  ᵉ: 'e',
  ᶠ: 'f',
  ᵍ: 'g',
  ʰ: 'h',
  ʲ: 'j',
  ᵏ: 'k',
  ˡ: 'l',
  ᵐ: 'm',
  ᵒ: 'o',
  ᵖ: 'p',
  ʳ: 'r',
  ˢ: 's',
  ᵗ: 't',
  ᵘ: 'u',
  ᵛ: 'v',
  ʷ: 'w',
  ˣ: 'x',
  ʸ: 'y',
  ᶻ: 'z',
  ᴬ: 'A',
  ᴮ: 'B',
  ᴰ: 'D',
  ᴱ: 'E',
  ᴳ: 'G',
  ᴴ: 'H',
  ᴵ: 'I',
  ᴶ: 'J',
  ᴷ: 'K',
  ᴸ: 'L',
  ᴹ: 'M',
  ᴺ: 'N',
  ᴼ: 'O',
  ᴾ: 'P',
  ᴿ: 'R',
  ᵀ: 'T',
  ᵁ: 'U',
  ⱽ: 'V',
  ᵂ: 'W',
  ᵅ: '\\alpha',
  ᵝ: '\\beta',
  ᵞ: '\\gamma',
  ᵟ: '\\delta',
};

// Operators the exporter's own table already round-trips, inverted, plus the
// large operators that only ever appear in display maths.
const GLYPH_TO_COMMAND: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(COMMAND_TEXT).map(([command, glyph]) => [
      glyph,
      `\\${command}`,
    ]),
  ),
  '∑': '\\sum',
  '∏': '\\prod',
  '√': '\\sqrt',
  '∇': '\\nabla',
  '∈': '\\in',
  '∅': '\\emptyset',
  '⋅': '\\cdot',
  '−': '-',
  ' ': ' ',
};

// A capital sigma written hard against a lowercase index ("Σi") is a summation
// over that index — the one structural inference the characters do make
// unambiguously. Against anything else it is still a summation, just without a
// stated index; standing alone it stays the Greek letter.
const SIGMA_WITH_INDEX = /Σ(\p{Ll}{1,2})(?!\p{L})/gu;
const SIGMA_AS_SUM = /Σ(?=[\d(])/gu;

const COMBINING_ACCENTS: Record<string, string> = {
  '̄': 'bar',
  '̅': 'bar',
  '̂': 'hat',
  '̃': 'tilde',
  '̇': 'dot',
  '⃗': 'vec',
};

// A run of sub/superscript characters is one script: "b₁" → b_{1}, and
// "r⁻ᵅ" → r^{-\alpha}.
const applyScriptRuns = (
  value: string,
  table: Record<string, string>,
  marker: '_' | '^',
): string => {
  const characters = [...value];
  let out = '';
  let run = '';
  const flush = (): void => {
    if (run.length === 0) return;
    out += `${marker}{${run}}`;
    run = '';
  };
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const plain = table[character];
    if (plain !== undefined) {
      run += plain;
      continue;
    }
    // "AAE₁,₂" is one subscript, not two: a separator standing between two
    // script characters belongs to the run.
    if (
      run.length > 0 &&
      (character === ',' || character === '.') &&
      table[characters[index + 1] ?? ''] !== undefined
    ) {
      run += character;
      continue;
    }
    flush();
    out += character;
  }
  flush();
  return out;
};

const applyCombiningAccents = (value: string): string => {
  const characters = [...value];
  let out = '';
  for (let index = 0; index < characters.length; index += 1) {
    const next = characters[index + 1];
    const accent = next === undefined ? undefined : COMBINING_ACCENTS[next];
    if (accent !== undefined && /\p{L}/u.test(characters[index])) {
      out += `\\${accent}{${characters[index]}}`;
      index += 1;
      continue;
    }
    out += characters[index];
  }
  return out;
};

// True when the text is already LaTeX (the OMML importer's output) and must be
// left exactly as it is.
const looksLikeLatex = (value: string): boolean =>
  /\\[A-Za-z]+|[_^]\{/.test(value);

export const unicodeMathToLatex = (value: string): string => {
  const source = value.trim();
  if (source.length === 0 || looksLikeLatex(source)) return source;

  // Normalise to decomposed form so an accented letter exposes its combining
  // mark, then re-attach the accents as LaTeX.
  let latex = applyCombiningAccents(source.normalize('NFD'));
  latex = applyScriptRuns(latex, SUBSCRIPT_TO_PLAIN, '_');
  latex = applyScriptRuns(latex, SUPERSCRIPT_TO_PLAIN, '^');
  latex = latex
    .replace(SIGMA_WITH_INDEX, '\\sum_{$1}')
    .replace(SIGMA_AS_SUM, '\\sum ');
  const characters = [...latex];
  latex = characters
    .map((character, index) => {
      const command = GLYPH_TO_COMMAND[character];
      if (command === undefined) return character;
      // A command name runs on into a following letter, so it needs the space
      // that separates them — and only then.
      return /[A-Za-z]/.test(characters[index + 1] ?? '')
        ? `${command} `
        : command;
    })
    .join('');

  return latex
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;)\]}])/g, '$1')
    .trim();
};
