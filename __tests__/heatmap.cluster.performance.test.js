const { performance } = require('perf_hooks');

if(!global.performance){
  global.performance = performance;
}

const maybeIt = process.env.CI ? test.skip : test;

describe('heatmap hierarchical clustering performance', () => {
  beforeEach(() => {
    jest.resetModules();
    if(typeof global.__restoreTestDebugLogs === 'function'){
      global.__restoreTestDebugLogs();
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
  });

  afterEach(() => {
    if(typeof global.__suppressTestDebugLogs === 'function'){
      global.__suppressTestDebugLogs();
    }
  });

  // Guard against noisy timing on CI runners where shared hardware can be unpredictable.
  maybeIt('clusters a 150x150 matrix within the interactive budget', () => {
    require('../js/components/heatmap.js');
    const clusterFn = window.Components?.heatmap?.__internals?.hierarchicalCluster;
    expect(typeof clusterFn).toBe('function');

    const size = 150;
    const vectors = Array.from({ length: size }, (_, rowIdx) => (
      Array.from({ length: size }, (_, colIdx) => Math.sin((rowIdx + 1) * (colIdx + 1) * 0.017))
    ));
    const items = vectors.map((vector, index) => ({ index, vector }));

    const start = performance.now();
    const result = clusterFn(items, 'euclidean', 'average');
    const elapsed = performance.now() - start;

    expect(result.order).toHaveLength(size);
    expect(result.tree).not.toBeNull();
    const budgetMs = 1600;
    expect(elapsed).toBeLessThan(budgetMs);
  });
});
