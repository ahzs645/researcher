import { getTwentyConvexHttpUrl } from '@/local-db/twenty-local/getTwentyConvexHttpUrl';

describe('getTwentyConvexHttpUrl', () => {
  it('maps the local Convex client port to the HTTP actions port', () => {
    expect(getTwentyConvexHttpUrl('http://127.0.0.1:3210/')).toBe(
      'http://127.0.0.1:3211',
    );
  });

  it('maps a cloud client hostname to the HTTP actions hostname', () => {
    expect(getTwentyConvexHttpUrl('https://example.convex.cloud')).toBe(
      'https://example.convex.site',
    );
  });
});
