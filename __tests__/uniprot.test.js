// Tests for js/shared/uniprot.js
// All network calls are intercepted via a per-test fetch mock injected through options.fetch.

describe('Shared.uniprot', () => {
  let uniprot;

  function makeResponse(body, ok = true, status = 200) {
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  }

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/uniprot.js');
    uniprot = window.Shared.uniprot;
    // Reset the module-level cache between tests
    uniprot.clearCache();
  });

  test('exposes expected API surface', () => {
    expect(typeof uniprot.fetchFunctionAnnotation).toBe('function');
    expect(typeof uniprot.clearCache).toBe('function');
    expect(typeof uniprot.resolveEntryUrl).toBe('function');
  });

  describe('fetchFunctionAnnotation', () => {
    test('returns null for empty gene', async () => {
      const result = await uniprot.fetchFunctionAnnotation('', {});
      expect(result).toBeNull();
    });

    test('returns null when fetch is unavailable', async () => {
      const result = await uniprot.fetchFunctionAnnotation('TP53', {});
      // No fetch on global and none passed via options
      expect(result).toBeNull();
    });

    test('returns function text on success', async () => {
      const apiBody = {
        results: [{
          comments: [{ commentType: 'FUNCTION', texts: [{ value: 'Acts as a tumor suppressor.' }] }]
        }]
      };
      const mockFetch = jest.fn(async () => makeResponse(apiBody));
      const result = await uniprot.fetchFunctionAnnotation('TP53', { fetch: mockFetch });
      expect(result).toBe('Acts as a tumor suppressor.');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('URL contains gene name in uppercase', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ results: [] }));
      await uniprot.fetchFunctionAnnotation('tp53', { fetch: mockFetch });
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('TP53');
    });

    test('caches result — second call does not call fetch again', async () => {
      const apiBody = { results: [{ comments: [{ commentType: 'FUNCTION', texts: [{ value: 'Suppressor' }] }] }] };
      const mockFetch = jest.fn(async () => makeResponse(apiBody));
      await uniprot.fetchFunctionAnnotation('BRCA1', { fetch: mockFetch });
      await uniprot.fetchFunctionAnnotation('BRCA1', { fetch: mockFetch });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('cache is case-insensitive (gene normalised to uppercase)', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ results: [] }));
      await uniprot.fetchFunctionAnnotation('brca1', { fetch: mockFetch });
      await uniprot.fetchFunctionAnnotation('BRCA1', { fetch: mockFetch });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('returns null and caches null for HTTP error response', async () => {
      const mockFetch = jest.fn(async () => makeResponse({}, false, 404));
      const result = await uniprot.fetchFunctionAnnotation('UNKNOWNGENE', { fetch: mockFetch });
      expect(result).toBeNull();
      // Second call should still return null from cache
      const result2 = await uniprot.fetchFunctionAnnotation('UNKNOWNGENE', { fetch: mockFetch });
      expect(result2).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('returns null and caches null when network throws', async () => {
      const mockFetch = jest.fn(async () => { throw new Error('network error'); });
      const result = await uniprot.fetchFunctionAnnotation('GENE1', { fetch: mockFetch });
      expect(result).toBeNull();
    });

    test('returns null when result has no FUNCTION comment', async () => {
      const apiBody = {
        results: [{
          comments: [{ commentType: 'SUBCELLULAR_LOCATION', texts: [{ value: 'Nucleus' }] }]
        }]
      };
      const mockFetch = jest.fn(async () => makeResponse(apiBody));
      const result = await uniprot.fetchFunctionAnnotation('MYC', { fetch: mockFetch });
      expect(result).toBeNull();
    });

    test('returns null when results array is empty', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ results: [] }));
      const result = await uniprot.fetchFunctionAnnotation('ABCD1', { fetch: mockFetch });
      expect(result).toBeNull();
    });

    test('clearCache allows re-fetching', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ results: [] }));
      await uniprot.fetchFunctionAnnotation('TP53', { fetch: mockFetch });
      uniprot.clearCache();
      await uniprot.fetchFunctionAnnotation('TP53', { fetch: mockFetch });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveEntryUrl', () => {
    test('returns null accession and fallback URL for missing gene', async () => {
      const result = await uniprot.resolveEntryUrl({ gene: '' });
      expect(result.accession).toBeNull();
      expect(result.entryUrl).toBeNull();
      expect(result.fallbackUrl).toBeNull();
    });

    test('returns fallback URL when fetch is unavailable', async () => {
      const result = await uniprot.resolveEntryUrl({ gene: 'TP53' });
      expect(result.accession).toBeNull();
      expect(result.fallbackUrl).toContain('TP53');
      expect(result.entryUrl).toBe(result.fallbackUrl);
    });

    test('returns accession and entry URL on success', async () => {
      const apiBody = { results: [{ primaryAccession: 'P04637' }] };
      const mockFetch = jest.fn(async () => makeResponse(apiBody));
      const result = await uniprot.resolveEntryUrl({ gene: 'TP53', fetch: mockFetch });
      expect(result.accession).toBe('P04637');
      expect(result.entryUrl).toContain('P04637');
    });

    test('uses organism taxId in query URL when provided', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ results: [] }));
      await uniprot.resolveEntryUrl({ gene: 'TP53', organismTaxId: '9606', fetch: mockFetch });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('9606');
    });

    test('returns fallbackUrl when HTTP error occurs', async () => {
      const mockFetch = jest.fn(async () => makeResponse({}, false, 500));
      const result = await uniprot.resolveEntryUrl({ gene: 'BRCA1', fetch: mockFetch });
      expect(result.accession).toBeNull();
      expect(result.entryUrl).toBe(result.fallbackUrl);
    });

    test('returns fallbackUrl when network throws', async () => {
      const mockFetch = jest.fn(async () => { throw new Error('timeout'); });
      const result = await uniprot.resolveEntryUrl({ gene: 'MYC', fetch: mockFetch });
      expect(result.accession).toBeNull();
      expect(result.entryUrl).toBe(result.fallbackUrl);
    });

    test('returns fallbackUrl when results array is empty', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ results: [] }));
      const result = await uniprot.resolveEntryUrl({ gene: 'FAKE', fetch: mockFetch });
      expect(result.accession).toBeNull();
      expect(result.entryUrl).toBe(result.fallbackUrl);
    });

    test('fallbackUrl always points to uniprot search', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ results: [] }));
      const result = await uniprot.resolveEntryUrl({ gene: 'EGFR', fetch: mockFetch });
      expect(result.fallbackUrl).toContain('uniprot.org');
      expect(result.fallbackUrl).toContain('EGFR');
    });
  });
});
