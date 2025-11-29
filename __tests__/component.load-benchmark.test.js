describe('Component load benchmarks', () => {
  let boxHooks;
  let scatterHooks;
  let pcaHooks;
  let heatmapHooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    require('../js/components/scatter.js');
    require('../js/components/pca.js');
    require('../js/components/heatmap.js');
    boxHooks = window.Components?.box?.__testHooks;
    scatterHooks = window.Components?.scatter?.__testHooks;
    pcaHooks = window.Components?.pca?.__testHooks;
    heatmapHooks = window.Components?.heatmap?.__testHooks;
  });

  test('box benchmark returns finite duration', () => {
    expect(boxHooks).toBeDefined();
    const result = boxHooks.benchmarkSummaries({ rows: 1000, cols: 25 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.points).toBe(1000 * 25);
  });

  test('scatter benchmark returns finite duration', () => {
    expect(scatterHooks).toBeDefined();
    const result = scatterHooks.benchmarkLoad({ points: 5000, dimensions: 3 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.extent.x[0]).toBeLessThanOrEqual(result.extent.x[1]);
  });

  test('pca benchmark returns finite duration', () => {
    expect(pcaHooks).toBeDefined();
    const result = pcaHooks.benchmarkLoad({ rows: 400, cols: 20 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.varianceTrace).toBeGreaterThan(0);
  });

  test('heatmap benchmark returns finite duration', () => {
    expect(heatmapHooks).toBeDefined();
    const result = heatmapHooks.benchmarkLoad({ rows: 300, cols: 40 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.rowExtents.min).toBeLessThanOrEqual(result.rowExtents.max);
    expect(result.columnMeans.length).toBe(40);
  });
});
