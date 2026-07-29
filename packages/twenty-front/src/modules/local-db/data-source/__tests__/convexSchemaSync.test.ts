import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildDataSourceBundle,
  generateConvexSchema,
} from 'twenty-shared/data-source';

import { augmentObjectMetadataWithResearch } from '@/local-db/research/bridgeResearchAugmentation';
import { mockedStandardObjectMetadataQueryResult } from '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata';

// The checked-in `convex/recordSchema.ts` must always equal what the
// generator emits from the current metadata + research augmentation — this is
// what keeps the Convex backend from silently lagging the frontend model.
// Regenerate with:
//   npx tsx packages/twenty-front/scripts/generate-convex-schema.ts
describe('convex recordSchema sync', () => {
  it('matches the generator output for the current object model', () => {
    const bundle = buildDataSourceBundle(
      augmentObjectMetadataWithResearch(
        mockedStandardObjectMetadataQueryResult as never,
      ) as never,
    );
    const generated = generateConvexSchema(bundle);
    const checkedIn = readFileSync(
      resolve(__dirname, '../../../../../../../convex/recordSchema.ts'),
      'utf8',
    );

    expect(checkedIn).toBe(generated);
  });
});
