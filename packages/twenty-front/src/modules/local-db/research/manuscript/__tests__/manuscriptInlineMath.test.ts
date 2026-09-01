import {
  hasInlineMath,
  linearizeInlineMath,
  protectInlineMath,
  restoreInlineMath,
  splitInlineMath,
} from '@/local-db/research/manuscript/manuscriptInlineMath';
import { stripManuscriptScriptMarkers } from '@/local-db/research/manuscript/manuscriptScripts';

describe('splitInlineMath', () => {
  it('pulls the maths out of a sentence and leaves the prose exact', () => {
    expect(
      splitInlineMath('the completeness $C_j$ of window $j$ is reported'),
    ).toEqual([
      { kind: 'text', value: 'the completeness ' },
      { kind: 'math', latex: 'C_j' },
      { kind: 'text', value: ' of window ' },
      { kind: 'math', latex: 'j' },
      { kind: 'text', value: ' is reported' },
    ]);
  });

  it('leaves prose with no dollars alone', () => {
    expect(splitInlineMath('no maths here')).toEqual([
      { kind: 'text', value: 'no maths here' },
    ]);
    expect(hasInlineMath('no maths here')).toBe(false);
  });

  it('reads prices as prices', () => {
    // "$5 and $10" would otherwise be the equation "5 and 1".
    expect(splitInlineMath('a $5 and $10 fee')).toEqual([
      { kind: 'text', value: 'a $5 and $10 fee' },
    ]);
    expect(hasInlineMath('the grant was $1.2M in total')).toBe(false);
  });

  it('keeps a dollar inside a code span out of it', () => {
    expect(splitInlineMath('run `echo $HOME` then `cat $PATH` twice')).toEqual([
      { kind: 'text', value: 'run `echo $HOME` then `cat $PATH` twice' },
    ]);
  });

  it('ignores an unmatched or empty delimiter', () => {
    expect(splitInlineMath('costs $ 40 per filter')).toEqual([
      { kind: 'text', value: 'costs $ 40 per filter' },
    ]);
    expect(splitInlineMath('a lone $ sign')).toEqual([
      { kind: 'text', value: 'a lone $ sign' },
    ]);
  });

  it('keeps a command with its braces', () => {
    expect(splitInlineMath('write $\\bar{x}_{j}$ for the mean')).toEqual([
      { kind: 'text', value: 'write ' },
      { kind: 'math', latex: '\\bar{x}_{j}' },
      { kind: 'text', value: ' for the mean' },
    ]);
  });
});

describe('linearizeInlineMath', () => {
  it('flattens the maths for a renderer that cannot typeset it', () => {
    // Unicode has a subscript j, so the symbol reads as itself.
    expect(linearizeInlineMath('completeness $C_j$ over $\\lambda$')).toBe(
      'completeness C\u2C7C over λ',
    );
    // It has no subscript d: that index is marked for the PDF exporter to
    // lower, rather than left as a literal underscore.
    const marked = linearizeInlineMath('the $C_{d}$ term');
    expect(marked).not.toContain('$');
    expect(marked).not.toContain('_');
    expect(stripManuscriptScriptMarkers(marked)).toBe('the Cd term');
  });

  it('leaves prose and prices untouched', () => {
    expect(linearizeInlineMath('a $5 fee, no maths')).toBe(
      'a $5 fee, no maths',
    );
  });
});

describe('protectInlineMath', () => {
  const prose =
    'the mean $\\bar{x}_j$ and the coefficient $b_{abs,\\lambda}$ agree';

  it('hides the maths from the Markdown parser and puts it back', () => {
    const { text, math } = protectInlineMath(prose);

    // Left alone, a Markdown parser reads from the first underscore to the
    // second as an italic run and eats both — which is what turned
    // "$\\bar{x}_j$ … $b_{abs" into one mangled span.
    expect(text).not.toContain('_');
    expect(text).not.toContain('$');
    expect(math).toEqual(['\\bar{x}_j', 'b_{abs,\\lambda}']);
    expect(restoreInlineMath(text, math)).toBe(prose);
  });

  it('survives the emphasis and spacing a parser applies around it', () => {
    const { text, math } = protectInlineMath(prose);
    // Whatever the parser does to the prose, the placeholders come back.
    const parsed = text.replace('the mean', '*the mean*');

    expect(restoreInlineMath(parsed, math)).toContain('$\\bar{x}_j$');
    expect(restoreInlineMath(parsed, math)).toContain('$b_{abs,\\lambda}$');
  });

  it('leaves prose with no maths exactly as it was', () => {
    const plain = 'a $40 fee and _real_ emphasis';
    const { text, math } = protectInlineMath(plain);

    expect(math).toEqual([]);
    expect(text).toBe(plain);
    expect(restoreInlineMath(text, math)).toBe(plain);
  });
});
