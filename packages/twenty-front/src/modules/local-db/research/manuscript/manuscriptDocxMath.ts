import {
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSum,
  MathSuperScript,
  type MathComponent,
} from 'docx';

const COMMAND_TEXT: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  theta: 'θ',
  Delta: 'Δ',
  Sigma: 'Σ',
  times: '×',
  cdot: '·',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  pm: '±',
  infty: '∞',
  cap: '∩',
  cup: '∪',
  in: '∈',
  approx: '≈',
  neq: '≠',
  equiv: '≡',
  propto: '∝',
  partial: '∂',
  int: '∫',
  to: '→',
  ldots: '…',
  cdots: '⋯',
  prime: '′',
};

// Spacing macros carry no glyph — LaTeX writes them as `\,` or `\quad`, and the
// old fallback emitted the literal punctuation (`\,` became a comma).
const SPACING_COMMANDS: Record<string, string> = {
  ',': ' ',
  ':': ' ',
  ';': ' ',
  '!': '',
  ' ': ' ',
  quad: '  ',
  qquad: '    ',
  thinspace: ' ',
};

// Accents render as base + combining mark, which Word composes into one glyph.
const ACCENT_COMBINING: Record<string, string> = {
  bar: '̄',
  overline: '̄',
  hat: '̂',
  tilde: '̃',
  vec: '⃗',
  dot: '̇',
  ddot: '̈',
};

type ParseResult = {
  components: MathComponent[];
  index: number;
};

// Returns the whole base when no scripts apply. Returning only `base[0]` here
// silently truncated every multi-component group, so `\mathrm{abs}` rendered as
// "a" unless a subscript happened to follow it.
const scriptResult = (
  base: MathComponent[],
  subScript?: MathComponent[],
  superScript?: MathComponent[],
): MathComponent[] => {
  if (subScript !== undefined && superScript !== undefined) {
    return [new MathSubSuperScript({ children: base, subScript, superScript })];
  }
  if (subScript !== undefined) {
    return [new MathSubScript({ children: base, subScript })];
  }
  if (superScript !== undefined) {
    return [new MathSuperScript({ children: base, superScript })];
  }
  return base;
};

const parseLatex = (
  source: string,
  startIndex = 0,
  stopCharacter?: string,
): ParseResult => {
  const components: MathComponent[] = [];
  let index = startIndex;

  const parseGroup = (): MathComponent[] => {
    while (source[index] === ' ') index += 1;
    if (source[index] === '{') {
      const result = parseLatex(source, index + 1, '}');
      index = result.index;
      return result.components;
    }
    const result = parseAtom();
    return result;
  };

  const parseScripts = (
    base: MathComponent[],
  ): {
    components: MathComponent[];
    sub?: MathComponent[];
    sup?: MathComponent[];
  } => {
    let subScript: MathComponent[] | undefined;
    let superScript: MathComponent[] | undefined;
    while (source[index] === '_' || source[index] === '^') {
      const marker = source[index];
      index += 1;
      const script = parseGroup();
      if (marker === '_') subScript = script;
      else superScript = script;
    }
    return {
      components: scriptResult(base, subScript, superScript),
      sub: subScript,
      sup: superScript,
    };
  };

  const parseCommand = (): MathComponent[] => {
    index += 1;
    const match = /^[A-Za-z]+/.exec(source.slice(index));
    const command = match?.[0] ?? source[index] ?? '';
    index += command.length;

    if (command === 'frac' || command === 'dfrac' || command === 'tfrac') {
      const numerator = parseGroup();
      const denominator = parseGroup();
      return [new MathFraction({ numerator, denominator })];
    }
    if (command === 'sqrt') {
      return [new MathRadical({ children: parseGroup() })];
    }
    const accent = ACCENT_COMBINING[command];
    if (accent !== undefined) {
      return [...parseGroup(), new MathRun(accent)];
    }
    const spacing = SPACING_COMMANDS[command];
    if (spacing !== undefined) {
      return spacing.length > 0 ? [new MathRun(spacing)] : [];
    }
    if (command === 'sum') {
      const scripts = parseScripts([new MathRun('')]);
      while (source[index] === ' ') index += 1;
      const children = index < source.length ? parseAtom() : [new MathRun('')];
      return [
        new MathSum({
          children,
          subScript: scripts.sub,
          superScript: scripts.sup,
        }),
      ];
    }
    if (command === 'left' || command === 'right') return [];
    if (
      command === 'text' ||
      command === 'mathrm' ||
      command === 'operatorname'
    ) {
      return parseGroup();
    }
    return [new MathRun(COMMAND_TEXT[command] ?? command)];
  };

  const parseAtom = (): MathComponent[] => {
    let base: MathComponent[];
    const character = source[index];
    if (character === '\\') {
      base = parseCommand();
    } else if (character === '{') {
      index += 1;
      const result = parseLatex(source, index, '}');
      index = result.index;
      base = result.components;
    } else {
      index += 1;
      base = [new MathRun(character ?? '')];
    }
    if (base.length === 0) return [];
    return parseScripts(base).components;
  };

  while (index < source.length) {
    if (stopCharacter !== undefined && source[index] === stopCharacter) {
      return { components, index: index + 1 };
    }
    if (/\s/.test(source[index])) {
      index += 1;
      if (components.length > 0) components.push(new MathRun(' '));
      continue;
    }
    components.push(...parseAtom());
  }
  return { components, index };
};

export const latexToMathComponents = (latex: string): MathComponent[] =>
  parseLatex(latex.trim()).components;
