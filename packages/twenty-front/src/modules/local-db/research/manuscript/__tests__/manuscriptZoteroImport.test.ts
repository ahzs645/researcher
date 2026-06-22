import {
  isZoteroConfigComplete,
  parseZoteroCslResponse,
  zoteroItemsUrl,
  type ZoteroConfig,
} from '@/local-db/research/manuscript/manuscriptZoteroImport';

const config: ZoteroConfig = {
  apiKey: 'abc 123',
  libraryType: 'users',
  libraryId: '12345',
};

describe('zoteroItemsUrl', () => {
  it('builds a browser-reachable CSL-JSON URL with encoded auth', () => {
    const url = zoteroItemsUrl(config);
    expect(url).toContain('https://www.zotero.org/api/users/12345/items');
    expect(url).toContain('format=csljson');
    expect(url).toContain('key=abc%20123');
  });

  it('supports group libraries and pagination', () => {
    const url = zoteroItemsUrl(
      { ...config, libraryType: 'groups', libraryId: '999' },
      100,
      50,
    );
    expect(url).toContain('/groups/999/items');
    expect(url).toContain('start=100');
    expect(url).toContain('limit=50');
  });
});

describe('parseZoteroCslResponse', () => {
  const items = [
    {
      id: 'smith2020',
      type: 'article-journal',
      title: 'A paper',
      author: [{ family: 'Smith', given: 'J.' }],
      issued: { 'date-parts': [[2020]] },
    },
    { id: 'note1', type: 'note', note: 'a note' },
  ];

  it('parses the { items: [...] } envelope and skips notes/attachments', () => {
    const drafts = parseZoteroCslResponse({ items });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].citationKey).toBe('smith2020');
    expect(drafts[0].cslType).toBe('ARTICLE_JOURNAL');
  });

  it('also accepts a bare array', () => {
    expect(parseZoteroCslResponse(items)).toHaveLength(1);
  });

  it('returns [] for an unexpected shape', () => {
    expect(parseZoteroCslResponse(null)).toEqual([]);
    expect(parseZoteroCslResponse({ error: 'x' })).toEqual([]);
  });
});

describe('isZoteroConfigComplete', () => {
  it('requires both an API key and a library id', () => {
    expect(isZoteroConfigComplete(config)).toBe(true);
    expect(isZoteroConfigComplete({ ...config, apiKey: '  ' })).toBe(false);
    expect(isZoteroConfigComplete({ ...config, libraryId: '' })).toBe(false);
  });
});
