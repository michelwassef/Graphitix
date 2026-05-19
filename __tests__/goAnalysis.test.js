function loadModule() {
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/goAnalysis.js');
  return window.Shared.goAnalysis;
}

function makeFetch(options = {}) {
  const { status = 200, ok = true, result = [] } = options;
  return jest.fn(() =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve({ result })
    })
  );
}

describe('goAnalysis — profile()', () => {
  let go;
  beforeEach(() => { go = loadModule(); });

  test('empty genes array → returns { raw: null, result: [] } without calling fetch', async () => {
    const fetch = makeFetch();
    const out = await go.profile({ genes: [], organism: 'hsapiens', fetch });
    expect(out).toEqual({ raw: null, result: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('missing organism → throws', async () => {
    await expect(go.profile({ genes: ['TP53'], fetch: makeFetch() })).rejects.toThrow(/organism/i);
  });

  test('no fetch implementation → throws', async () => {
    delete global.fetch;
    await expect(go.profile({ genes: ['TP53'], organism: 'hsapiens' })).rejects.toThrow(/fetch/i);
  });

  test('successful response → returns { raw, result }', async () => {
    const items = [{ source: 'GO:BP', term_id: 'GO:0001', p_value: 0.01 }];
    const fetch = makeFetch({ result: items });
    const out = await go.profile({ genes: ['TP53', 'BRCA1'], organism: 'hsapiens', fetch });
    expect(out.raw).not.toBeNull();
    expect(out.result).toEqual(items);
  });

  test('uses POST method with JSON body containing the genes', async () => {
    const fetch = makeFetch({ result: [] });
    await go.profile({ genes: ['EGFR', 'MYC'], organism: 'hsapiens', fetch });
    const [, init] = fetch.mock.calls[0];
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.query).toEqual(['EGFR', 'MYC']);
    expect(body.organism).toBe('hsapiens');
  });

  test('sources filter is applied to the response', async () => {
    const items = [
      { source: 'GO:BP', term_id: 'GO:0001', p_value: 0.01 },
      { source: 'KEGG',  term_id: 'hsa00010', p_value: 0.05 }
    ];
    const fetch = makeFetch({ result: items });
    const out = await go.profile({ genes: ['TP53'], organism: 'hsapiens', sources: ['GO:BP'], fetch });
    expect(out.result).toHaveLength(1);
    expect(out.result[0].source).toBe('GO:BP');
  });

  test('no sources filter → all items returned', async () => {
    const items = [
      { source: 'GO:BP', term_id: 'GO:0001', p_value: 0.01 },
      { source: 'KEGG',  term_id: 'hsa00010', p_value: 0.05 }
    ];
    const fetch = makeFetch({ result: items });
    const out = await go.profile({ genes: ['TP53'], organism: 'hsapiens', fetch });
    expect(out.result).toHaveLength(2);
  });

  test('background and domainScope are included in the request body', async () => {
    const fetch = makeFetch({ result: [] });
    const bg = ['ACTB', 'GAPDH'];
    await go.profile({ genes: ['TP53'], organism: 'hsapiens', background: bg, domainScope: 'custom', fetch });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.background).toEqual(bg);
    expect(body.domain_scope).toBe('custom');
  });

  test('background absent → domain_scope not added to body', async () => {
    const fetch = makeFetch({ result: [] });
    await go.profile({ genes: ['TP53'], organism: 'hsapiens', fetch });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('domain_scope');
    expect(body).not.toHaveProperty('background');
  });

  test('HTTP error response → throws with status in message', async () => {
    const fetch = makeFetch({ ok: false, status: 503, result: [] });
    await expect(go.profile({ genes: ['TP53'], organism: 'hsapiens', fetch })).rejects.toThrow('503');
  });

  test('network error → re-throws', async () => {
    const fetch = jest.fn(() => Promise.reject(new Error('Network down')));
    await expect(go.profile({ genes: ['TP53'], organism: 'hsapiens', fetch })).rejects.toThrow('Network down');
  });

  test('non-array result in response → result is []', async () => {
    const badFetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ result: null }) })
    );
    const out = await go.profile({ genes: ['TP53'], organism: 'hsapiens', fetch: badFetch });
    expect(out.result).toEqual([]);
  });

  test('POST Content-Type header is application/json', async () => {
    const fetch = makeFetch({ result: [] });
    await go.profile({ genes: ['TP53'], organism: 'hsapiens', fetch });
    const headers = fetch.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/json');
  });
});
