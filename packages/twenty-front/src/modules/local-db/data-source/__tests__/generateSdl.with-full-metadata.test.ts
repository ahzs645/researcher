import { parse } from 'graphql';
import { buildDataSourceBundle, generateSdl } from 'twenty-shared/data-source';

import { mockedStandardObjectMetadataQueryResult } from '~/testing/mock-data/generated/metadata/objects/mock-objects-metadata';

// The unit test in twenty-shared validates the generator over a hand-rolled
// fixture. This smoke test runs it against the real 33-object mocked workspace
// metadata to make sure every field type / relation combination it produces
// emits parseable SDL — i.e. that a freshly-extracted workspace schema can
// drive both the executable schema and the DataSource adapters.
describe('generateSdl over full mocked metadata', () => {
  it('parses the SDL produced from all 33 standard objects', () => {
    const bundle = buildDataSourceBundle(
      mockedStandardObjectMetadataQueryResult as never,
    );

    expect(bundle.objects.length).toBeGreaterThanOrEqual(30);

    const sdl = generateSdl(bundle);

    expect(() => parse(sdl)).not.toThrow();
    expect(sdl).toContain('type Company');
    expect(sdl).toContain('type Person');
    expect(sdl).toContain('type Note');
    expect(sdl).toContain('type Task');
    expect(sdl).toContain('input CompanyFilterInput');
    expect(sdl).toContain('createCompany(data: CompanyCreateInput!): Company!');
  });
});
