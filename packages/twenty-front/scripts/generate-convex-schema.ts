// Regenerate convex/schema.ts from the standard 33-object metadata bundle.
// Run with: npx tsx packages/twenty-front/scripts/generate-convex-schema.ts
//
// The output replaces convex/schema.ts. Keep the generated file checked in so
// Convex deployments don't depend on running this script; rerun whenever the
// metadata source changes.

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  buildDataSourceBundle,
  generateConvexSchema,
} from 'twenty-shared/data-source';

import { mockedStandardObjectMetadataQueryResult } from '../src/testing/mock-data/generated/metadata/objects/mock-objects-metadata';
import { augmentObjectMetadataWithResearch } from '../src/modules/local-db/research/bridgeResearchAugmentation';

const main = async () => {
  const bundle = buildDataSourceBundle(
    augmentObjectMetadataWithResearch(
      mockedStandardObjectMetadataQueryResult as never,
    ) as never,
  );
  // Auto-generated record tables live in `convex/recordSchema.ts`; the
  // combined `schema.ts` is hand-written and spreads them alongside the
  // system tables so we keep one defineSchema() call.
  const source = generateConvexSchema(bundle);
  const outputPath = resolve(__dirname, '../../../convex/recordSchema.ts');
  await writeFile(outputPath, source, 'utf8');
  // oxlint-disable-next-line no-console
  console.log(`Wrote ${outputPath}`);
};

main().catch((error) => {
  // oxlint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
