// Tests for js/shared/stringAnalysis.js
// All network calls are intercepted via options.fetch.

describe('Shared.stringAnalysis', () => {
  let stringAnalysis;

  function makeResponse(body, ok = true, status = 200, isJson = true) {
    return {
      ok,
      status,
      json: async () => body,
      text: async () => (isJson ? JSON.stringify(body) : body)
    };
  }

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/stringAnalysis.js');
    stringAnalysis = window.Shared.stringAnalysis;
  });

  test('exposes expected API surface', () => {
    expect(typeof stringAnalysis.resolveSpeciesCode).toBe('function');
    expect(typeof stringAnalysis.buildParams).toBe('function');
    expect(typeof stringAnalysis.fetchNetwork).toBe('function');
    expect(typeof stringAnalysis.fetchEnrichment).toBe('function');
  });

  describe('resolveSpeciesCode', () => {
    test('returns 9606 for hsapiens', () => {
      expect(stringAnalysis.resolveSpeciesCode('hsapiens')).toBe('9606');
    });
    test('returns 10090 for mmusculus', () => {
      expect(stringAnalysis.resolveSpeciesCode('mmusculus')).toBe('10090');
    });
    test('returns 7227 for dmelanogaster', () => {
      expect(stringAnalysis.resolveSpeciesCode('dmelanogaster')).toBe('7227');
    });
    test('returns 6239 for celegans', () => {
      expect(stringAnalysis.resolveSpeciesCode('celegans')).toBe('6239');
    });
    test('uses fallback for unknown organism', () => {
      expect(stringAnalysis.resolveSpeciesCode('unknown', '12345')).toBe('12345');
    });
    test('defaults to 9606 when unknown and no fallback', () => {
      expect(stringAnalysis.resolveSpeciesCode('nonexistent')).toBe('9606');
    });
    test('returns species code for known organism even when fallback is provided', () => {
      expect(stringAnalysis.resolveSpeciesCode('mmusculus', '99999')).toBe('10090');
    });
  });

  describe('buildParams', () => {
    test('sets identifiers from genes array (newline-separated)', () => {
      const params = stringAnalysis.buildParams({ genes: ['TP53', 'BRCA1', 'MYC'] });
      expect(params.get('identifiers')).toBe('TP53\nBRCA1\nMYC');
    });

    test('sets species when provided', () => {
      const params = stringAnalysis.buildParams({ genes: ['TP53'], species: '9606' });
      expect(params.get('species')).toBe('9606');
    });

    test('sets network_type when networkType provided', () => {
      const params = stringAnalysis.buildParams({ genes: ['A'], networkType: 'functional' });
      expect(params.get('network_type')).toBe('functional');
    });

    test('sets network_flavor when edgeMeaning provided', () => {
      const params = stringAnalysis.buildParams({ genes: ['A'], edgeMeaning: 'confidence' });
      expect(params.get('network_flavor')).toBe('confidence');
    });

    test('omits optional keys when not provided', () => {
      const params = stringAnalysis.buildParams({ genes: ['X'] });
      expect(params.get('species')).toBeNull();
      expect(params.get('network_type')).toBeNull();
    });

    test('handles empty genes array', () => {
      const params = stringAnalysis.buildParams({ genes: [] });
      expect(params.get('identifiers')).toBeNull();
    });

    test('handles missing genes key', () => {
      const params = stringAnalysis.buildParams({});
      expect(params.get('identifiers')).toBeNull();
    });
  });

  describe('fetchNetwork', () => {
    test('throws when no fetch implementation provided', async () => {
      await expect(stringAnalysis.fetchNetwork({ genes: ['TP53'] })).rejects.toThrow();
    });

    test('returns svg text on HTTP 200', async () => {
      const svgContent = '<svg><g/></svg>';
      const mockFetch = jest.fn(async () => makeResponse(svgContent, true, 200, false));
      const result = await stringAnalysis.fetchNetwork({ genes: ['TP53'], fetch: mockFetch });
      expect(result.svg).toBe(svgContent);
      expect(result.url).toContain('string-db.org');
    });

    test('URL contains gene identifiers', async () => {
      const mockFetch = jest.fn(async () => makeResponse('<svg/>', true, 200, false));
      await stringAnalysis.fetchNetwork({ genes: ['TP53', 'BRCA1'], fetch: mockFetch });
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('TP53');
      expect(calledUrl).toContain('BRCA1');
    });

    test('throws on HTTP error response', async () => {
      const mockFetch = jest.fn(async () => makeResponse('', false, 500, false));
      await expect(stringAnalysis.fetchNetwork({ genes: ['X'], fetch: mockFetch })).rejects.toThrow('STRING network HTTP 500');
    });

    test('propagates network error', async () => {
      const mockFetch = jest.fn(async () => { throw new Error('network down'); });
      await expect(stringAnalysis.fetchNetwork({ genes: ['X'], fetch: mockFetch })).rejects.toThrow('network down');
    });

    test('includes params in result', async () => {
      const mockFetch = jest.fn(async () => makeResponse('<svg/>', true, 200, false));
      const result = await stringAnalysis.fetchNetwork({ genes: ['TP53'], species: '9606', fetch: mockFetch });
      expect(result.params).toBeDefined();
    });
  });

  describe('fetchEnrichment', () => {
    test('throws when no fetch implementation provided', async () => {
      await expect(stringAnalysis.fetchEnrichment({ genes: ['TP53'] })).rejects.toThrow();
    });

    test('returns items array on success', async () => {
      const apiBody = [
        { category: 'Process', term: 'apoptosis', p_value: 0.001 },
        { category: 'Function', term: 'kinase', p_value: 0.01 }
      ];
      const mockFetch = jest.fn(async () => makeResponse(apiBody));
      const result = await stringAnalysis.fetchEnrichment({ genes: ['TP53', 'CASP3'], fetch: mockFetch });
      expect(result.items).toHaveLength(2);
      expect(result.items[0].term).toBe('apoptosis');
    });

    test('URL uses json/enrichment endpoint', async () => {
      const mockFetch = jest.fn(async () => makeResponse([]));
      await stringAnalysis.fetchEnrichment({ genes: ['X'], fetch: mockFetch });
      expect(mockFetch.mock.calls[0][0]).toContain('json/enrichment');
    });

    test('returns empty items array when API returns non-array', async () => {
      const mockFetch = jest.fn(async () => makeResponse({ error: 'bad' }));
      const result = await stringAnalysis.fetchEnrichment({ genes: ['X'], fetch: mockFetch });
      expect(result.items).toEqual([]);
    });

    test('throws on HTTP error', async () => {
      const mockFetch = jest.fn(async () => makeResponse({}, false, 404));
      await expect(stringAnalysis.fetchEnrichment({ genes: ['X'], fetch: mockFetch })).rejects.toThrow('STRING API HTTP 404');
    });

    test('propagates network error', async () => {
      const mockFetch = jest.fn(async () => { throw new Error('timeout'); });
      await expect(stringAnalysis.fetchEnrichment({ genes: ['X'], fetch: mockFetch })).rejects.toThrow('timeout');
    });

    test('includes raw response and url in result', async () => {
      const mockFetch = jest.fn(async () => makeResponse([{ term: 'foo' }]));
      const result = await stringAnalysis.fetchEnrichment({ genes: ['TP53'], fetch: mockFetch });
      expect(result.raw).toBeDefined();
      expect(typeof result.url).toBe('string');
    });

    test('includes species in URL when provided', async () => {
      const mockFetch = jest.fn(async () => makeResponse([]));
      await stringAnalysis.fetchEnrichment({ genes: ['TP53'], species: '9606', fetch: mockFetch });
      expect(mockFetch.mock.calls[0][0]).toContain('9606');
    });
  });
});
