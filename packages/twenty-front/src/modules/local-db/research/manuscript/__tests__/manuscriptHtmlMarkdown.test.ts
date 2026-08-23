import {
  manuscriptInlineToHtml,
  manuscriptMarkdownToHtml,
  sanitizeUrl,
  type ManuscriptHtmlRenderContext,
} from '@/local-db/research/manuscript/manuscriptHtmlMarkdown';
import { wrapCitationAnchor } from '@/local-db/research/manuscript/manuscriptCitations';
import { wrapManuscriptScript } from '@/local-db/research/manuscript/manuscriptScripts';

// The cross-reference sentinel, as `resolveCrossReferences` emits it.
const crossRefAnchor = (key: string, label: string): string =>
  `\u0005${key}\u0011${label}\u0003`;

const context = (
  overrides: Partial<ManuscriptHtmlRenderContext> = {},
): ManuscriptHtmlRenderContext => ({
  renderCitation: (keys, label) =>
    `<cite data-keys="${keys.join(',')}">${label}</cite>`,
  renderCrossReference: (key, label) => `<ref data-key="${key}">${label}</ref>`,
  renderDisplayMath: (latex) => `<math-display>${latex.trim()}</math-display>`,
  renderInlineMath: (latex) => `<math-inline>${latex.trim()}</math-inline>`,
  tableClass: 'table-academic',
  registerHeading: (_level, text) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  ...overrides,
});

describe('manuscriptInlineToHtml', () => {
  it('escapes text that looks like markup but keeps pipeline anchors', () => {
    expect(manuscriptInlineToHtml('Levels <50% <b>bold</b>', context())).toBe(
      'Levels &lt;50% <b>bold</b>',
    );
    expect(manuscriptInlineToHtml('<a id="fig-1"></a>caption', context())).toBe(
      '<a id="fig-1"></a>caption',
    );
  });

  it('renders emphasis, links, and code', () => {
    const html = manuscriptInlineToHtml(
      '**bold** and *italic* and `code` and [text](https://example.org/a)',
      context(),
    );

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<a href="https://example.org/a">text</a>');
  });

  it('turns the importer script markers into sup and sub', () => {
    const html = manuscriptInlineToHtml(
      `mg/m${wrapManuscriptScript('3', 'SUPERSCRIPT')} and RfC${wrapManuscriptScript('i', 'SUBSCRIPT')}`,
      context(),
    );

    expect(html).toBe('mg/m<sup>3</sup> and RfC<sub>i</sub>');
  });

  it('hands inline math and citations to the render context', () => {
    const html = manuscriptInlineToHtml(
      `A $x^2$ value ${wrapCitationAnchor(['smith2020'], '[1]')} ${crossRefAnchor('fig:a', 'Figure 1')}`,
      context(),
    );

    expect(html).toContain('<math-inline>x^2</math-inline>');
    expect(html).toContain('<cite data-keys="smith2020">[1]</cite>');
    expect(html).toContain('<ref data-key="fig:a">Figure 1</ref>');
  });
});

describe('sanitizeUrl', () => {
  it('keeps document links and embedded images, drops anything executable', () => {
    expect(sanitizeUrl('https://example.org')).toBe('https://example.org');
    expect(sanitizeUrl('#reference-a')).toBe('#reference-a');
    expect(sanitizeUrl('data:image/png;base64,AAAA')).toBe(
      'data:image/png;base64,AAAA',
    );
    // oxlint-disable-next-line no-script-url -- the point of the assertion
    expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
    expect(sanitizeUrl('data:text/html,<script>')).toBe('#');
  });
});

describe('manuscriptMarkdownToHtml', () => {
  it('tags each heading with its level and registers it', () => {
    const registered: number[] = [];
    const html = manuscriptMarkdownToHtml(
      '## Results\n\n### Dust Period Classification\n\nProse.',
      context({
        registerHeading: (level, text) => {
          registered.push(level);
          return text.toLowerCase().replace(/\s+/g, '-');
        },
      }),
    );

    expect(registered).toEqual([2, 3]);
    expect(html).toContain('<h2 id="results" data-outline-level="2">');
    expect(html).toContain('<h3 id="dust-period-classification"');
    expect(html).toContain('>H3</span>');
  });

  it('renders a mermaid fence as the drawn diagram', () => {
    const html = manuscriptMarkdownToHtml(
      '```mermaid\nflowchart TD\n  A --> B\n```',
      context({ renderMermaid: () => '<svg id="drawn"></svg>' }),
    );

    expect(html).toBe(
      '<figure class="diagram"><svg id="drawn"></svg></figure>',
    );
  });

  it('falls back to the source when the diagram could not be drawn', () => {
    const html = manuscriptMarkdownToHtml(
      '```mermaid\nflowchart TD\n  A --> B\n```',
      context({ renderMermaid: () => null }),
    );

    expect(html).toContain('<pre class="code language-mermaid">');
    expect(html).toContain('A --&gt; B');
  });

  it('renders lists, quotes, rules, and display math', () => {
    const html = manuscriptMarkdownToHtml(
      ['- one', '- two', '', '> quoted', '', '$$a=b$$'].join('\n'),
      context(),
    );

    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<blockquote>quoted</blockquote>');
    expect(html).toContain(
      '<div class="equation"><math-display>a=b</math-display></div>',
    );
  });

  it('renders a GFM table with its merged cells and header deck', () => {
    const html = manuscriptMarkdownToHtml(
      [
        '|  | Percent Censored | < |',
        '| Size | <50% | >80% |',
        '| --- | --- | --- |',
        '| n<50 | ROS | High |',
      ].join('\n'),
      context(),
    );

    expect(html).toContain('<table class="table-academic">');
    expect(html).toContain('<th colspan="2">Percent Censored</th>');
    expect(html).toContain('<td>n&lt;50</td>');
  });
});
