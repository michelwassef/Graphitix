'use strict';

function loadWorker(){
  const ctx = {
    onmessage: null,
    postMessage: jest.fn(),
    importScripts: jest.fn()
  };
  const previousSelf = global.self;
  const previousShared = global.Shared;
  global.self = ctx;
  global.Shared = ctx.Shared = {};
  ctx.importScripts = jest.fn(script => {
    if(String(script).endsWith('/stats.js')){
      const activeShared = global.Shared;
      global.Shared = ctx.Shared;
      try{
        require('../../js/shared/stats.js');
      }finally{
        global.Shared = activeShared;
      }
    }
  });
  jest.resetModules();
  require('../../js/workers/hist.worker.js');
  global.self = previousSelf;
  global.Shared = previousShared;
  return ctx;
}

function send(ctx, id, action, payload){
  ctx.onmessage({ data: { id, action, payload } });
  const calls = ctx.postMessage.mock.calls;
  return calls[calls.length - 1]?.[0] || null;
}

describe('hist.worker — two-sample KS', () => {
  test('rejects unknown actions with a useful worker error', () => {
    const ctx = loadWorker();

    expect(send(ctx, 'unknown', 'no-op', {})).toMatchObject({
      id: 'unknown',
      ok: false,
      error: 'Unknown action'
    });
  });

  test('returns the shared exact permutation result for small tied samples', () => {
    const ctx = loadWorker();
    const actual = send(ctx, 'exact', 'hist-ks-two-sample', {
      meta: { tabId: 'hist-owner-a', operation: 'distribution-comparison' },
      sampleA: [1, 1, 3],
      sampleB: [2, 4, 5],
      options: { resamplingMode: 'permutation', iterations: 19999 }
    });
    const expected = ctx.Shared.stats.kolmogorovSmirnovTwoSample([1, 1, 3], [2, 4, 5], {
      resamplingMode: 'permutation',
      iterations: 19999
    });

    expect(actual).toMatchObject({ id: 'exact', ok: true });
    expect(actual.result).toMatchObject({
      available: true,
      method: 'exact permutation',
      hasTies: true,
      iterations: 20
    });
    expect(actual.result).toEqual(expected);
    expect(ctx.importScripts).toHaveBeenCalledWith('../shared/stats.js');
  });

  test('retains ties and seed determinism for Monte Carlo samples', () => {
    const ctx = loadWorker();
    const payload = {
      sampleA: Array.from({ length: 20 }, (_, index) => index % 5),
      sampleB: Array.from({ length: 20 }, (_, index) => (index + 2) % 5),
      options: { resamplingMode: 'permutation', iterations: 19999, seed: 2468 }
    };
    const first = send(ctx, 'mc-1', 'hist-ks-two-sample', payload);
    const second = send(ctx, 'mc-2', 'hist-ks-two-sample', payload);

    expect(first).toMatchObject({ id: 'mc-1', ok: true });
    expect(second).toMatchObject({ id: 'mc-2', ok: true });
    expect(first.result).toMatchObject({
      available: true,
      method: 'Monte Carlo permutation (19,999 shuffles)',
      methodCode: 'monte-carlo',
      hasTies: true,
      iterations: 19999,
      seed: 2468
    });
    expect(second.result).toEqual(first.result);
  });
});
