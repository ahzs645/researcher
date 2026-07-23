import {
  rewriteCitationKey,
  rewriteCitationKeys,
} from '@/local-db/research/manuscript/manuscriptCitationKeyRewrite';

describe('rewriteCitationKey', () => {
  it('rewrites exact citation tokens in single and clustered citations', () => {
    expect(
      rewriteCitationKey('One [@old]. Cluster [@other; @old].', 'old', 'kept'),
    ).toBe('One [@kept]. Cluster [@other; @kept].');
  });

  it('does not rewrite partial keys or prose outside citation clusters', () => {
    expect(
      rewriteCitationKey(
        '@old [@old-extra] [@old] email old@example.com',
        'old',
        'kept',
      ),
    ).toBe('@old [@old-extra] [@kept] email old@example.com');
  });

  it('handles punctuation in keys without regular-expression interpolation', () => {
    expect(rewriteCitationKey('See [@old.key+1].', 'old.key+1', 'kept')).toBe(
      'See [@kept].',
    );
  });

  it('applies replacement maps simultaneously without cascading', () => {
    expect(
      rewriteCitationKeys(
        'Swap [@alpha; @beta].',
        new Map([
          ['alpha', 'beta'],
          ['beta', 'alpha'],
        ]),
      ),
    ).toBe('Swap [@beta; @alpha].');
  });
});
