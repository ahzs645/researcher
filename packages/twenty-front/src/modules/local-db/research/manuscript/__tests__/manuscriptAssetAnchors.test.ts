import { buildManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';
import {
  assetBookmarkId,
  assetSequenceName,
  readAssetNumberAnchor,
  splitAssetNumber,
  stripAssetNumberAnchors,
  wrapAssetNumberAnchor,
} from '@/local-db/research/manuscript/manuscriptAssetAnchors';
import {
  resolveCrossReferences,
  splitCrossReferenceAnchors,
} from '@/local-db/research/manuscript/manuscriptCrossReference';
import { numberAssets } from '@/local-db/research/manuscript/manuscriptNumbering';

describe('asset number anchors', () => {
  it('names the asset a printed number belongs to, invisibly', () => {
    const anchored = `${wrapAssetNumberAnchor('eq-7')}(7)`;

    expect(readAssetNumberAnchor(anchored)).toEqual({
      refKey: 'eq-7',
      text: '(7)',
    });
    expect(stripAssetNumberAnchors(anchored)).toBe('(7)');
    // The marker takes no width, so a renderer that ignores it still lays the
    // line out correctly.
    expect(anchored).toContain('(7)');
  });

  it('reports no key for text that carries no anchor', () => {
    expect(readAssetNumberAnchor('Figure 2. A caption')).toEqual({
      text: 'Figure 2. A caption',
    });
  });
});

describe('assetBookmarkId', () => {
  it('produces a name Word will accept', () => {
    // Word takes letters, digits and underscores only, and no leading digit.
    expect(assetBookmarkId('eq-11a')).toBe('_Refeq_11a');
    expect(assetBookmarkId('fig:absorption plot')).toBe(
      '_Reffig_absorption_plot',
    );
    expect(assetBookmarkId('x'.repeat(80))).toHaveLength(40);
    expect(assetBookmarkId('7')).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });
});

describe('assetSequenceName', () => {
  it('gives each kind its own counter, and the supplement a second one', () => {
    expect(assetSequenceName('EQUATION', 'MAIN')).toBe('Equation');
    expect(assetSequenceName('TABLE', 'MAIN')).toBe('Table');
    // "Figure S1" must not disturb "Figure 1".
    expect(assetSequenceName('FIGURE', 'SUPPLEMENT')).toBe('FigureSupplement');
  });
});

describe('splitAssetNumber', () => {
  it('separates what Word can count from the letters around it', () => {
    expect(splitAssetNumber('7')).toEqual({
      prefix: '',
      counted: '7',
      suffix: '',
    });
    expect(splitAssetNumber('S1')).toEqual({
      prefix: 'S',
      counted: '1',
      suffix: '',
    });
    // A source's own "11a" and a per-section "1.2" carry more than a counter
    // can reproduce, so they stay literal — and stay linkable.
    expect(splitAssetNumber('11a').counted).toBeUndefined();
    expect(splitAssetNumber('1.2').counted).toBeUndefined();
  });
});

describe('splitCrossReferenceAnchors', () => {
  it('separates the places that name a number from the prose around them', () => {
    const numbered = numberAssets([
      { id: 'e1', refKey: 'eq-7', assetKind: 'EQUATION', orderIndex: 0 },
    ]);
    const { text } = resolveCrossReferences(
      'Eq. [#eq-7] is calculated over observed duration.',
      numbered,
      true,
    );

    expect(splitCrossReferenceAnchors(text)).toEqual([
      { kind: 'text', value: 'Eq. ' },
      { kind: 'reference', refKey: 'eq-7', label: '(1)' },
      { kind: 'text', value: ' is calculated over observed duration.' },
    ]);
  });
});

describe('a cross-reference to an asset whose numbering is off', () => {
  const bundle = (numbered: boolean) =>
    buildManuscriptBundle({
      manuscript: { id: 'paper', name: 'Numbering' },
      style: {},
      sections: [
        {
          id: 'method',
          name: 'Method',
          placement: 'MAIN',
          orderIndex: 0,
          content: 'The mean is defined in Eq. [#eq-1].',
        },
      ],
      figures: [
        {
          id: 'e1',
          refKey: 'eq-1',
          name: 'Mean',
          assetKind: 'EQUATION',
          placement: 'MAIN',
          orderIndex: 0,
          equationLatex: 'x = 1',
          numbered,
        },
      ],
      references: [],
    });

  it('is reported rather than printed as a gap', () => {
    const built = bundle(false);

    expect(built.warnings).toContainEqual(
      expect.stringContaining(
        'references [#eq-1], whose numbering is turned off',
      ),
    );
    // The token stays visible: silently deleting the reference from the
    // sentence would leave "defined in Eq. ." in the exported paper.
    expect(built.mainMarkdown).toContain('[#eq-1]');
  });

  it('says nothing when the equation is numbered', () => {
    const built = bundle(true);

    expect(built.warnings).toEqual([]);
    expect(built.mainMarkdown).toContain('Eq. (1)');
  });
});
