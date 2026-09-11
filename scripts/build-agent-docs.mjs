#!/usr/bin/env node
// Generates the root assistant briefs from one canonical source.
//
// CLAUDE.md and AGENTS.md are the auto-injected context for Claude Code and
// Codex. They are meant to carry the same instructions and differ only in
// which assistant they name, but as separate hand-edited files they drift:
// the pointer to the manuscript transposition workflow lived in AGENTS.md
// alone, so Claude sessions could not find the manuscript format at all.
//
//   node scripts/build-agent-docs.mjs           # write CLAUDE.md and AGENTS.md
//   node scripts/build-agent-docs.mjs --check   # fail if they are out of date

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'docs/assistant-brief.md';

const TARGETS = [
  {
    filename: 'CLAUDE.md',
    assistant: 'Claude Code (claude.ai/code)',
    assistantWeb: 'Claude Code web',
  },
  {
    filename: 'AGENTS.md',
    assistant: 'Codex (Codex.ai/code)',
    assistantWeb: 'Codex web',
  },
];

const generatedNotice = (filename) =>
  `<!-- Generated from ${SOURCE} by scripts/build-agent-docs.mjs. Do not edit ${filename} directly; edit the source and re-run the script. -->\n\n`;

// Drop the source's own explanatory comment so it does not ship in the output.
const stripSourceComment = (text) => text.replace(/^<!--[\s\S]*?-->\n+/, '');

const render = (source, target) =>
  generatedNotice(target.filename) +
  stripSourceComment(source)
    .replaceAll('{{FILENAME}}', target.filename)
    .replaceAll('{{ASSISTANT_WEB}}', target.assistantWeb)
    .replaceAll('{{ASSISTANT}}', target.assistant);

const source = readFileSync(join(repoRoot, SOURCE), 'utf8');
const isCheck = process.argv.includes('--check');

const stale = [];

for (const target of TARGETS) {
  const path = join(repoRoot, target.filename);
  const expected = render(source, target);

  if (!isCheck) {
    writeFileSync(path, expected);
    console.log(`wrote ${target.filename}`);
    continue;
  }

  let actual = '';
  try {
    actual = readFileSync(path, 'utf8');
  } catch {
    stale.push(`${target.filename} (missing)`);
    continue;
  }
  if (actual !== expected) stale.push(target.filename);
}

if (!isCheck) process.exit(0);

if (stale.length === 0) {
  console.log(`✓ CLAUDE.md and AGENTS.md are up to date with ${SOURCE}.`);
  process.exit(0);
}

console.error(`✗ Out of date with ${SOURCE}: ${stale.join(', ')}\n`);
console.error(
  `Both assistants must receive the same instructions. Edit ${SOURCE} —\n` +
    'not the generated files — and re-run:\n\n' +
    '    node scripts/build-agent-docs.mjs\n',
);
process.exit(1);
