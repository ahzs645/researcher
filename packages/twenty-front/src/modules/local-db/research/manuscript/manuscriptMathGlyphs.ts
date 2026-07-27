// The LaTeX command → Unicode glyph table, shared by the .docx exporter (which
// writes the glyph Word expects) and the .docx importer (which inverts it to
// recover the command). It lives in its own module so the importer — a pure,
// dependency-free string-in / string-out layer — does not have to import the
// exporter and drag the heavy `docx` package into every bundle that parses a
// document.

export const COMMAND_TEXT: Record<string, string> = {
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
