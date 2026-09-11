#!/usr/bin/env node
// Keeps the root assistant briefs identical in substance.
//
// CLAUDE.md and AGENTS.md are the auto-injected context for Claude Code and
// Codex respectively. They are meant to differ only in which assistant they
// name. When one is edited alone, the other assistant silently loses the
// instruction — which is how the manuscript workflow pointer lived in
// AGENTS.md for weeks while Claude sessions could not find the format.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Each pair is rewritten to a neutral placeholder before comparing, so the
// files may name their own assistant without counting as drift.
const ASSISTANT_ALIASES = [
  [/# CLAUDE\.md/g, /# AGENTS\.md/g, '# ASSISTANT.md'],
  [
    /Claude Code \(claude\.ai\/code\)/g,
    /Codex \(Codex\.ai\/code\)/g,
    'ASSISTANT',
  ],
  [/Claude Code web/g, /Codex web/g, 'ASSISTANT web'],
];

const normalize = (text, index) =>
  ASSISTANT_ALIASES.reduce(
    (acc, alias) => acc.replace(alias[index], alias[2]),
    text,
  );

const claude = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8');
const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');

const claudeLines = normalize(claude, 0).split('\n');
const agentsLines = normalize(agents, 1).split('\n');

const onlyIn = (a, b) =>
  a.filter((line) => line.trim() !== '' && !b.includes(line));

const missingFromAgents = onlyIn(claudeLines, agentsLines);
const missingFromClaude = onlyIn(agentsLines, claudeLines);

if (missingFromAgents.length === 0 && missingFromClaude.length === 0) {
  console.log('✓ CLAUDE.md and AGENTS.md are in sync.');
  process.exit(0);
}

console.error('✗ CLAUDE.md and AGENTS.md have drifted.\n');

const report = (label, lines) => {
  if (lines.length === 0) return;
  console.error(`Present in ${label[0]} but missing from ${label[1]}:`);
  for (const line of lines) console.error(`    ${line}`);
  console.error('');
};

report(['CLAUDE.md', 'AGENTS.md'], missingFromAgents);
report(['AGENTS.md', 'CLAUDE.md'], missingFromClaude);

console.error(
  'Both assistants must receive the same instructions. Copy the missing\n' +
    'lines across, or add an alias to ASSISTANT_ALIASES in this script if the\n' +
    'difference is only the assistant name.',
);

process.exit(1);
