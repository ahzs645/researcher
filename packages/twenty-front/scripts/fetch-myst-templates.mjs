// Refresh the vendored MyST template registry.
//
// The app ships the descriptors so it works offline; this is how they are
// updated. Only the fields the mapper reads are kept — the jtex packages and
// file lists are three times the size and are the renderer's business.
//
//   node packages/twenty-front/scripts/fetch-myst-templates.mjs

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KINDS = ['tex', 'typst', 'docx'];
const KEPT = ['id', 'title', 'description', 'tags', 'parts', 'doc', 'options'];

const json = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
};

const templates = [];
for (const kind of KINDS) {
  const index = await json(`https://api.mystmd.org/templates/${kind}`);
  for (const item of index.items ?? []) {
    const full = await json(`https://api.mystmd.org/templates/${item.id}`);
    const slim = Object.fromEntries(
      KEPT.filter((key) => key in full).map((key) => [key, full[key]]),
    );
    if (full.links?.source) slim.links = { source: full.links.source };
    templates.push(slim);
  }
}
templates.sort((a, b) => a.id.localeCompare(b.id));

const destination = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/modules/local-db/research/manuscript/myst-templates/registry.json',
);
writeFileSync(destination, `${JSON.stringify(templates, null, 2)}\n`);

const journals = templates.reduce((count, template) => {
  const choices = (template.options ?? [])
    .filter(
      (option) =>
        option.type === 'choice' &&
        /^(journal(_name|_id)?|[a-z]+_journal_type)$/.test(option.id),
    )
    .flatMap((option) => option.choices ?? []);
  return count + Math.max(choices.length, 1);
}, 0);
// eslint-disable-next-line no-console
console.log(`${templates.length} templates, ${journals} journals → ${destination}`);
