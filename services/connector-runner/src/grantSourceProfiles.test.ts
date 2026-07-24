import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

type GrantSourceFile = {
  libraryKey: string;
  profile?: {
    profileKind: string;
    itemSelector?: string;
    fieldMappings: Record<string, string>;
  };
};

const sourceDirectory = fileURLToPath(
  new URL('../../../convex/grantSources/data/grantSources/', import.meta.url),
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(sourceDirectory, 'manifest.json'), 'utf8'),
) as string[];

const isSupportedMapping = (mapping: string): boolean =>
  [
    'linkText',
    'href',
    'itemText',
    'highlightText',
    'contextHeadingText',
    'linkTextPrefixBeforeColon',
    'nearestRowText',
    'contextText',
    'pageHeadingText',
    'pageDescription',
    'pageUrl',
  ].includes(mapping) ||
  mapping.startsWith('constant:') ||
  mapping.startsWith('followingText:') ||
  mapping.startsWith('tableCell:');

test('all built-in grant sources have executable extraction profiles', () => {
  assert.equal(manifest.length, 24);

  for (const filename of manifest) {
    const source = JSON.parse(
      fs.readFileSync(path.join(sourceDirectory, filename), 'utf8'),
    ) as GrantSourceFile;
    const profile = source.profile;

    assert.ok(profile, `${source.libraryKey} must define a profile`);
    assert.ok(
      ['html_selectors', 'single_page', 'json_feed'].includes(
        profile.profileKind,
      ),
      `${source.libraryKey} has unsupported profile kind ${profile.profileKind}`,
    );
    if (profile.profileKind !== 'json_feed') {
      assert.ok(
        profile.itemSelector?.trim(),
        `${source.libraryKey} must define an item selector`,
      );
    }
    assert.ok(
      profile.fieldMappings.title,
      `${source.libraryKey} must map a title`,
    );
    assert.ok(
      profile.fieldMappings.applicationUrl,
      `${source.libraryKey} must map an application URL`,
    );

    for (const mapping of Object.values(profile.fieldMappings)) {
      assert.ok(
        isSupportedMapping(mapping),
        `${source.libraryKey} uses unsupported mapping ${mapping}`,
      );
    }
  }
});
