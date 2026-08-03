# Manuscript token grammar

Manuscript sections use Markdown with live tokens. The editor preserves these
Pandoc-friendly forms while exports resolve them against manuscript records.

## Live tokens

| Purpose          | Syntax                      | Example                            |
| ---------------- | --------------------------- | ---------------------------------- |
| Citation         | `[@citekey]`                | `Evidence [@li2017].`              |
| Citation cluster | `[@first; @second]`         | `See [@li2017; @manisalidis2020].` |
| Citation locator | `[@citekey, p. 3]`          | `See [@li2017, p. 3].`             |
| Citation prefix  | `[see @citekey]`            | `[see @li2017]`                    |
| Suppress author  | `[-@citekey]`               | `Li's model [-@li2017]`            |
| Cross-reference  | `[#asset-key]`              | `Shown in [#fig:exposure].`        |
| Asset placement  | `[[asset:asset-key]]`       | `[[asset:fig:exposure]]`           |
| Inline math      | `$latex$`                   | `$E = mc^2$`                       |
| Display math     | `$$latex$$` on its own line | `$$\\int_0^1 x^2 dx$$`             |

## Rules

- Citation and cross-reference keys cannot contain whitespace or `]`. Every
  citation in a cluster starts with `@`.
- Citation clusters can retain per-source prefixes, locators, suffixes,
  suppressed authors, and source order through the structured citation editor.
- Prefix a token with a backslash to keep it literal: `\\[@not-a-citation]`,
  `\\[#not-a-reference]`, or `\\$5`.
- Tokens inside styled text, links, and fenced code blocks remain literal.
- Removing a citation chip restores its source token, including all keys in a
  cluster. Deleting a referenced record leaves its prose token visible as an
  unresolved warning.
