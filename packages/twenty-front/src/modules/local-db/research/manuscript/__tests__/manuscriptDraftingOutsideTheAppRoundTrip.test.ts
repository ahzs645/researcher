import {
  DRAFT_BIBLIOGRAPHY_CSL_JSON,
  DRAFT_EQUATION_REF_KEY,
  DRAFT_MARKDOWN,
} from '@/local-db/research/manuscript/__tests__/manuscriptDraftingOutsideTheAppFixture';
import { splitAssetPlacementMarkers } from '@/local-db/research/manuscript/manuscriptAssetPlacement';
import { extractCitationKeys } from '@/local-db/research/manuscript/manuscriptCrossReference';
import {
  citationClusterFromProp,
  manuscriptNodesToTokens,
  manuscriptTokensToNodes,
} from '@/local-db/research/manuscript/manuscriptEditorContent';
import {
  assembleImportedDocument,
  deriveImportBlocksFromMarkdown,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import {
  prepareManuscriptImport,
  type PreparedStandardManuscriptImport,
} from '@/local-db/research/manuscript/manuscriptImportPrepare';
import { parseCslJson } from '@/local-db/research/manuscript/manuscriptReferenceImport';
import { parseManuscriptTableGrid } from '@/local-db/research/manuscript/manuscriptTableGrid';

// `docs/manuscript-format.md` §7 "Drafting outside the app" tells an author how
// to write a draft outside the composer so the importer can rebuild its
// structure. This drives the fixture draft through the real pipeline —
// deriveImportBlocksFromMarkdown → assembleImportedDocument →
// prepareManuscriptImport — and asserts each promise §7 makes. A failure here
// means §7 documents something the pipeline does not do.

const CROSS_REFERENCE_TOKEN = /\[#([^\]\s]+)\]/g;

type ExpectedSection = {
  name: string;
  sectionType: string;
  placement: string;
  level: number;
};

// §7.1: one heading per section, in source order, at the right depth.
const EXPECTED_SECTIONS: ExpectedSection[] = [
  {
    name: 'Abstract',
    sectionType: 'ABSTRACT',
    placement: 'FRONT_MATTER',
    level: 1,
  },
  {
    name: 'Keywords',
    sectionType: 'KEYWORDS',
    placement: 'FRONT_MATTER',
    level: 1,
  },
  {
    name: 'Introduction',
    sectionType: 'INTRODUCTION',
    placement: 'MAIN',
    level: 1,
  },
  {
    name: 'Study setting',
    sectionType: 'INTRODUCTION',
    placement: 'MAIN',
    level: 2,
  },
  { name: 'Methods', sectionType: 'METHODS', placement: 'MAIN', level: 1 },
  {
    name: 'Exposure assignment',
    sectionType: 'METHODS',
    placement: 'MAIN',
    level: 2,
  },
  {
    name: 'Censoring rules',
    sectionType: 'METHODS',
    placement: 'MAIN',
    level: 3,
  },
  { name: 'Results', sectionType: 'RESULTS', placement: 'MAIN', level: 1 },
  {
    name: 'Discussion',
    sectionType: 'DISCUSSION',
    placement: 'MAIN',
    level: 1,
  },
  {
    name: 'Data availability',
    sectionType: 'DATA_AVAILABILITY',
    placement: 'BACK_MATTER',
    level: 1,
  },
  {
    name: 'Acknowledgments',
    sectionType: 'ACKNOWLEDGMENTS',
    placement: 'BACK_MATTER',
    level: 1,
  },
];

type InlineNode = {
  type: string;
  props?: Record<string, unknown>;
};

type EditorBlock = {
  type: string;
  props: Record<string, unknown>;
  content?: InlineNode[];
};

// The draft, imported the way the wizard imports a pasted/uploaded Markdown
// file. `reconcile` is on because a §7 draft already carries `[@key]` tokens
// and no prose reference list, so reconciliation must leave them alone.
const importDraft = (): PreparedStandardManuscriptImport => {
  const blocks = deriveImportBlocksFromMarkdown(DRAFT_MARKDOWN);
  const document = assembleImportedDocument(blocks, {});
  const prepared = prepareManuscriptImport(document, true);
  if (prepared.portable !== false) {
    throw new Error('A Markdown draft must not import as a portable package.');
  }
  return prepared;
};

const allContent = (prepared: PreparedStandardManuscriptImport): string =>
  prepared.sections.map((section) => section.content).join('\n\n');

const sectionNamed = (
  prepared: PreparedStandardManuscriptImport,
  name: string,
): string => {
  const section = prepared.sections.find(
    (candidate) => candidate.name === name,
  );
  if (section === undefined) throw new Error(`No section named "${name}".`);
  return section.content;
};

// Live tokens are parsed per paragraph, which is how the editor sees a
// section: one block per line, each block a single unstyled text run.
const toEditorBlocks = (content: string): EditorBlock[] =>
  content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      type: 'paragraph',
      props: { backgroundColor: 'default', textColor: 'default' },
      content: [{ type: 'text', text: line, styles: {} } as InlineNode],
    }));

const inlineNodesOfType = (blocks: EditorBlock[], type: string): InlineNode[] =>
  blocks.flatMap((block) =>
    (block.content ?? []).filter((node) => node.type === type),
  );

const stringProp = (node: InlineNode, key: string): string => {
  const value = node.props?.[key];
  if (typeof value !== 'string') {
    throw new Error(`Inline node ${node.type} has no string "${key}" prop.`);
  }
  return value;
};

describe('drafting outside the app (docs/manuscript-format.md §7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should keep section count, order, depth and placement when a §7 draft is imported', () => {
    const prepared = importDraft();

    expect(
      prepared.sections.map((section) => ({
        name: section.name,
        sectionType: section.sectionType,
        placement: section.placement,
        level: section.level,
      })),
    ).toEqual(EXPECTED_SECTIONS);
    expect(prepared.sections.map((section) => section.orderIndex)).toEqual(
      EXPECTED_SECTIONS.map((_, index) => index),
    );
    // Front matter, main text and back matter stay separated rather than
    // collapsing into one run of MAIN sections.
    expect(
      new Set(prepared.sections.map((section) => section.placement)),
    ).toEqual(new Set(['FRONT_MATTER', 'MAIN', 'BACK_MATTER']));
  });

  it('should lift the top-level heading to the document title when a §7 draft is imported', () => {
    const document = assembleImportedDocument(
      deriveImportBlocksFromMarkdown(DRAFT_MARKDOWN),
      {},
    );

    expect(document.title).toBe(
      'Wildfire smoke exposure and respiratory hospital admissions in three northern communities',
    );
    expect(
      document.sections.some((section) => section.name === document.title),
    ).toBe(false);
  });

  it('should resolve every citation token against the companion CSL-JSON bibliography', () => {
    const prepared = importDraft();
    const bibliographyKeys = new Set(
      parseCslJson(DRAFT_BIBLIOGRAPHY_CSL_JSON).map(
        (reference) => reference.citationKey,
      ),
    );

    const citedKeys = extractCitationKeys(allContent(prepared));

    expect(citedKeys.length).toBeGreaterThan(0);
    expect(citedKeys.filter((key) => !bibliographyKeys.has(key))).toEqual([]);
  });

  it('should leave author-year prose out of the content when citations are written as tokens', () => {
    const prepared = importDraft();

    // §7.2: the draft writes `[@carter2019]`, never "(Carter et al., 2019)";
    // the style is applied at export from the journal template.
    expect(allContent(prepared)).not.toMatch(
      /\(\s*[A-Z][a-z]+ et al\.,\s*\d{4}/,
    );
    expect(allContent(prepared)).toContain('[@carter2019]');
  });

  it('should keep both keys and their order when a citation cluster is imported', () => {
    const prepared = importDraft();
    const blocks = manuscriptTokensToNodes(
      toEditorBlocks(sectionNamed(prepared, 'Introduction')),
    );

    const clusters = inlineNodesOfType(blocks, 'citation').map((node) =>
      citationClusterFromProp(stringProp(node, 'citationKey')),
    );

    expect(clusters[0].map((item) => item.citationKey)).toEqual([
      'carter2019',
      'ng2021',
    ]);
  });

  it('should keep the locator when a citation carries one', () => {
    const prepared = importDraft();
    const blocks = manuscriptTokensToNodes(
      toEditorBlocks(sectionNamed(prepared, 'Introduction')),
    );

    const withLocator = inlineNodesOfType(blocks, 'citation')
      .flatMap((node) =>
        citationClusterFromProp(stringProp(node, 'citationKey')),
      )
      .filter((item) => item.locator.length > 0);

    expect(withLocator).toEqual([
      {
        citationKey: 'carter2019',
        locator: 'p. 42',
        prefix: '',
        suffix: '',
        suppressAuthor: false,
      },
    ]);
  });

  it('should round-trip citation tokens unchanged when nodes are serialized back to Markdown', () => {
    const prepared = importDraft();
    const content = sectionNamed(prepared, 'Introduction');

    const blocks = toEditorBlocks(content);
    const restored = manuscriptNodesToTokens(manuscriptTokensToNodes(blocks));

    expect(restored).toEqual(blocks);
  });

  it('should keep inline math inline when a draft mixes inline and display math', () => {
    const prepared = importDraft();
    const blocks = manuscriptTokensToNodes(
      toEditorBlocks(sectionNamed(prepared, 'Exposure assignment')),
    );

    const inlineEquations = inlineNodesOfType(blocks, 'inlineEquation').map(
      (node) => stringProp(node, 'latex'),
    );

    expect(inlineEquations).toEqual(['c = k \\tau']);
    // The inline relation must not have been promoted to a display block.
    expect(
      blocks.some(
        (block) =>
          block.type === 'displayEquation' &&
          String(block.props.latex).includes('\\tau'),
      ),
    ).toBe(false);
  });

  it('should keep the Markdown table an editable grid, with its merge markers, when a §7 draft is imported', () => {
    const prepared = importDraft();

    const tables = prepared.figures.filter(
      (figure) => figure.assetKind === 'TABLE',
    );
    expect(tables).toHaveLength(1);
    expect(prepared.tableCount).toBe(1);

    const grid = parseManuscriptTableGrid(tables[0].tableData);
    expect(grid.columnCount).toBe(4);
    expect(grid.headerRows).toBe(1);
    // `<` widened the header cell; `^` deepened the region cell.
    expect(
      grid.rows[0].find(
        (cell) => cell.text.trim() === 'Percent of monitor-season censored',
      )?.colSpan,
    ).toBe(2);
    expect(
      grid.rows[1].find((cell) => cell.text.trim() === 'North')?.rowSpan,
    ).toBe(2);
    // The grid left the prose: the section now carries a placement marker, not
    // a flattened paragraph of pipe characters.
    const censoringContent = sectionNamed(prepared, 'Censoring rules');
    expect(censoringContent).not.toContain('|');
    expect(censoringContent).toContain(`[[asset:${tables[0].refKey}]]`);
  });

  it('should turn the figure caption into a figure asset and link the prose reference to it', () => {
    const prepared = importDraft();

    const figures = prepared.figures.filter(
      (figure) => figure.assetKind === 'FIGURE',
    );
    expect(figures).toHaveLength(1);
    expect(figures[0]).toMatchObject({
      sourceLabel: '1',
      caption:
        'Modelled mean warm-season PM2.5 across the three study communities, 2021.',
    });
    expect(sectionNamed(prepared, 'Exposure assignment')).toContain(
      `[#${figures[0].refKey}]`,
    );
  });

  // ── Known §7 gap ────────────────────────────────────────────────────────
  // The two tests below assert what §7.4 promises, and they do not hold. They
  // are `it.failing` so the gap is recorded rather than hidden: if the
  // pipeline is fixed, Jest fails them and they must be flipped back to `it`.
  //
  // §7.4 tells an author to write "Numbered display equations as `$$…$$`
  // blocks with a stable key you also use in `[#key]` and `[[asset:key]]`",
  // and AGENTS.md requires an Equation asset to hold "LaTeX body in
  // `equationLatex`, without `$$` delimiters". The importer gets halfway:
  // `classifyBlock` (manuscriptImportBlocks.ts) does recognise the block as
  // `role: 'equation'` and strips the delimiters into `ImportBlock.text`. But
  // `serializeBlock` puts the `$$…$$` straight back into the section body
  // (manuscriptImportBlocks.ts, `if (role === 'equation') return
  // `$$${stripMarkdownDelimiters(markdown)}$$``), and
  // `prepareManuscriptImport` runs only `extractImagesToFigures`,
  // `extractTablesToFigures` and `extractCaptionOnlyFigures` — there is no
  // equation-extraction pass, and nothing outside `manuscriptPortableImport`
  // ever sets `assetKind: 'EQUATION'`. So the author's `[[asset:eq-daily-dose]]`
  // and `[#eq-daily-dose]` dangle, which §6 classes as two hard preflight
  // errors ("unknown cross-references", "unknown asset placements").
  it.failing(
    'should create an equation asset with delimiter-free LaTeX when a draft numbers a display equation',
    () => {
      const prepared = importDraft();

      const equations = prepared.figures.filter(
        (figure) => figure.assetKind === 'EQUATION',
      );

      expect(equations).toHaveLength(1);
      expect(equations[0].refKey).toBe(DRAFT_EQUATION_REF_KEY);
      expect(equations[0].equationLatex).toContain('\\sum');
      expect(equations[0].equationLatex).not.toContain('$');
    },
  );

  it.failing(
    'should resolve every cross-reference and placement token to exactly one asset',
    () => {
      const prepared = importDraft();
      const assetKeys = prepared.figures.map((figure) => figure.refKey);

      const placementKeys = prepared.sections.flatMap((section) =>
        splitAssetPlacementMarkers(section.content)
          .filter((segment) => segment.kind === 'asset')
          .map((segment) => (segment.kind === 'asset' ? segment.refKey : '')),
      );
      const crossReferenceKeys = [
        ...allContent(prepared).matchAll(CROSS_REFERENCE_TOKEN),
      ].map((match) => match[1]);

      expect(placementKeys.length).toBeGreaterThan(0);
      expect(crossReferenceKeys.length).toBeGreaterThan(0);
      // Every token names exactly one asset …
      expect(
        [...placementKeys, ...crossReferenceKeys].filter(
          (key) => assetKeys.filter((refKey) => refKey === key).length !== 1,
        ),
      ).toEqual([]);
      // … and each asset is placed exactly once (a duplicate placement is a
      // warning §3 says must be reviewed).
      for (const key of new Set(placementKeys)) {
        expect(placementKeys.filter((placed) => placed === key)).toHaveLength(
          1,
        );
      }
      expect(new Set(assetKeys).size).toBe(assetKeys.length);
    },
  );

  // The subset of the §7 asset contract that the pipeline does keep today, so
  // figure and table linking stays protected while the equation gap is open.
  it('should resolve every figure and table token to exactly one asset', () => {
    const prepared = importDraft();
    const assetKeys = prepared.figures.map((figure) => figure.refKey);
    const importedKeys = (keys: string[]): string[] =>
      keys.filter((key) => key.startsWith('imported-'));

    const placementKeys = importedKeys(
      prepared.sections.flatMap((section) =>
        splitAssetPlacementMarkers(section.content)
          .filter((segment) => segment.kind === 'asset')
          .map((segment) => (segment.kind === 'asset' ? segment.refKey : '')),
      ),
    );
    const crossReferenceKeys = importedKeys(
      [...allContent(prepared).matchAll(CROSS_REFERENCE_TOKEN)].map(
        (match) => match[1],
      ),
    );

    expect(placementKeys).toEqual(['imported-figure-1', 'imported-table-1']);
    expect(crossReferenceKeys).toEqual([
      'imported-figure-1',
      'imported-table-1',
    ]);
    expect(
      [...placementKeys, ...crossReferenceKeys].filter(
        (key) => assetKeys.filter((refKey) => refKey === key).length !== 1,
      ),
    ).toEqual([]);
    expect(new Set(assetKeys).size).toBe(assetKeys.length);
  });
});
