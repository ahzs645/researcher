// LaTeX → readable Unicode text, for renderers that cannot typeset math
// (the PDF exporter's react-pdf layer). The DOCX path converts to real OMML
// instead; this is the fallback that keeps `\frac{a}{b}` from printing
// verbatim. Handles the constructs the importer produces: fractions, roots,
// scripts (mapped to Unicode sub/superscripts where the alphabet exists),
// accents, delimiters, and the shared glyph table. Unknown structure degrades
// to readable text rather than disappearing.

import { COMMAND_TEXT } from './manuscriptMathGlyphs';
import { wrapManuscriptScript } from './manuscriptScripts';

const SUBSCRIPT_CHARS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
};

const SUPERSCRIPT_CHARS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
  A: 'ᴬ',
  B: 'ᴮ',
  D: 'ᴰ',
  E: 'ᴱ',
  G: 'ᴳ',
  H: 'ᴴ',
  I: 'ᴵ',
  J: 'ᴶ',
  K: 'ᴷ',
  L: 'ᴸ',
  M: 'ᴹ',
  N: 'ᴺ',
  O: 'ᴼ',
  P: 'ᴾ',
  R: 'ᴿ',
  T: 'ᵀ',
  U: 'ᵁ',
  V: 'ⱽ',
  W: 'ᵂ',
};

// Commands beyond the shared glyph table that show up in display math.
const EXTRA_COMMANDS: Record<string, string> = {
  sum: '∑',
  prod: '∏',
  nabla: '∇',
  forall: '∀',
  exists: '∃',
  subset: '⊂',
  superset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  notin: '∉',
  emptyset: '∅',
  land: '∧',
  lor: '∨',
  neg: '¬',
  circ: '∘',
  bullet: '∙',
  otimes: '⊗',
  oplus: '⊕',
  perp: '⊥',
  parallel: '∥',
  langle: '⟨',
  rangle: '⟩',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  deg: '°',
  micro: 'µ',
  Omega: 'Ω',
  omega: 'ω',
  Phi: 'Φ',
  phi: 'φ',
  varphi: 'φ',
  Psi: 'Ψ',
  psi: 'ψ',
  Chi: 'χ',
  chi: 'χ',
  Gamma: 'Γ',
  Lambda: 'Λ',
  Theta: 'Θ',
  Pi: 'Π',
  Xi: 'Ξ',
  xi: 'ξ',
  zeta: 'ζ',
  eta: 'η',
  iota: 'ι',
  kappa: 'κ',
  nu: 'ν',
  tau: 'τ',
  upsilon: 'υ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  mapsto: '↦',
  gg: '≫',
  ll: '≪',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  lt: '<',
  gt: '>',
};

const ACCENT_COMBINING: Record<string, string> = {
  bar: '̄',
  overline: '̅',
  hat: '̂',
  widehat: '̂',
  dot: '̇',
  ddot: '̈',
  tilde: '̃',
  vec: '⃗',
};

const TEXT_WRAPPERS = new Set([
  'text',
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathtt',
  'operatorname',
  'boldsymbol',
  'bm',
  'displaystyle',
]);

const toScript = (
  text: string,
  table: Record<string, string>,
): string | null => {
  let converted = '';
  for (const character of text) {
    const mapped = table[character];
    if (mapped === undefined) return null;
    converted += mapped;
  }
  return converted;
};

type ParseResult = { text: string; rest: string };

const parseGroup = (input: string): ParseResult => {
  // input starts at '{'; returns the converted contents and the rest after '}'.
  let depth = 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          text: convertLatex(input.slice(1, index)),
          rest: input.slice(index + 1),
        };
      }
    }
  }
  // Unbalanced — treat the brace as literal and move on.
  return { text: '{', rest: input.slice(1) };
};

const parseAtom = (input: string): ParseResult => {
  if (input.startsWith('{')) return parseGroup(input);
  if (input.startsWith('\\')) {
    const command = /^\\([A-Za-z]+|.)/.exec(input);
    if (command !== null) {
      const [text, rest] = convertCommand(command[1], input);
      return { text, rest };
    }
  }
  return { text: input[0] ?? '', rest: input.slice(1) };
};

const convertCommand = (name: string, input: string): [string, string] => {
  const rest = input.slice(name.length + 1);
  if (name === '\\') return [' ', rest];
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
    const numerator = parseAtom(rest.trimStart());
    const denominator = parseAtom(numerator.rest.trimStart());
    // Parenthesize only when the linearized text would be ambiguous.
    const simple = (value: string) => !/[+\-=×·/ ]/.test(value);
    const numText = simple(numerator.text)
      ? numerator.text
      : `(${numerator.text})`;
    const denText = simple(denominator.text)
      ? denominator.text
      : `(${denominator.text})`;
    return [`${numText}/${denText}`, denominator.rest];
  }
  if (name === 'sqrt') {
    let degree = '';
    let after = rest.trimStart();
    if (after.startsWith('[')) {
      const close = after.indexOf(']');
      if (close >= 0) {
        degree = toScript(after.slice(1, close), SUPERSCRIPT_CHARS) ?? '';
        after = after.slice(close + 1);
      }
    }
    const radicand = parseAtom(after.trimStart());
    return [`${degree}√(${radicand.text})`, radicand.rest];
  }
  if (TEXT_WRAPPERS.has(name)) {
    const inner = parseAtom(rest.trimStart());
    return [inner.text, inner.rest];
  }
  if (name in ACCENT_COMBINING) {
    const inner = parseAtom(rest.trimStart());
    const combining = ACCENT_COMBINING[name];
    return [
      inner.text
        .split('')
        .map((character) => `${character}${combining}`)
        .join(''),
      inner.rest,
    ];
  }
  if (name === 'left' || name === 'right') {
    // The delimiter itself follows as the next token.
    const delimiter = parseAtom(rest.trimStart());
    return [delimiter.text === '.' ? '' : delimiter.text, delimiter.rest];
  }
  if (name === 'underset' || name === 'overset') {
    const limit = parseAtom(rest.trimStart());
    const base = parseAtom(limit.rest.trimStart());
    const script =
      name === 'underset'
        ? (toScript(limit.text, SUBSCRIPT_CHARS) ?? `_${limit.text}`)
        : (toScript(limit.text, SUPERSCRIPT_CHARS) ?? `^${limit.text}`);
    return [`${base.text}${script}`, base.rest];
  }
  if (name === 'begin' || name === 'end') {
    const environment = parseAtom(rest.trimStart());
    return ['', environment.rest];
  }
  if (name === 'quad' || name === 'qquad') return ['  ', rest];
  if (name === ',' || name === ';' || name === ':' || name === ' ')
    return [' ', rest];
  if (name === 'nbsp') return [' ', rest];
  const glyph = COMMAND_TEXT[name] ?? EXTRA_COMMANDS[name];
  if (glyph !== undefined) return [glyph, rest];
  // Unknown command: keep the name readable rather than the raw backslash form.
  return [name, rest];
};

const convertLatex = (input: string): string => {
  let output = '';
  let rest = input;
  while (rest.length > 0) {
    const character = rest[0];
    if (character === '{') {
      const group = parseGroup(rest);
      output += group.text;
      rest = group.rest;
      continue;
    }
    if (character === '}') {
      rest = rest.slice(1);
      continue;
    }
    if (character === '_' || character === '^') {
      const script = parseAtom(rest.slice(1));
      const table = character === '_' ? SUBSCRIPT_CHARS : SUPERSCRIPT_CHARS;
      const mapped = toScript(script.text, table);
      output +=
        mapped ??
        `${character}${script.text.length > 1 ? `(${script.text})` : script.text}`;
      rest = script.rest;
      continue;
    }
    if (character === '\\') {
      const command = /^\\([A-Za-z]+|.)/.exec(rest);
      if (command === null) {
        rest = rest.slice(1);
        continue;
      }
      const [text, after] = convertCommand(command[1], rest);
      output += text;
      rest = after;
      continue;
    }
    if (character === '~') {
      output += ' ';
      rest = rest.slice(1);
      continue;
    }
    output += character;
    rest = rest.slice(1);
  }
  return output;
};

// Where Unicode has no subscript for a letter — there is no ₍d₎, ₍f₎ or ₍b₎ —
// the linearizer keeps the LaTeX marker, so `C_{d}` reads as "C_d". A renderer
// that can actually lower a run wants those marked instead, so it can set them
// the way the DOCX export already does.
const SCRIPT_FALLBACK = /([_^])(?:\(([^()]*)\)|(\S))/g;

export const latexToScriptedText = (latex: string): string =>
  latexToUnicodeText(latex).replace(
    SCRIPT_FALLBACK,
    (_match, marker: string, grouped?: string, single?: string) =>
      wrapManuscriptScript(
        grouped ?? single ?? '',
        marker === '_' ? 'SUBSCRIPT' : 'SUPERSCRIPT',
      ),
  );

export const latexToUnicodeText = (latex: string): string =>
  convertLatex(latex)
    .replace(/\s+/g, ' ')
    .replace(/ +([,;.!?\)\]])/g, '$1')
    .replace(/([\(\[]) +/g, '$1')
    .replace(/\\\\/g, ' ')
    .trim();
