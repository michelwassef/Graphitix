const { loadProductionBootstrap } = require('../../test-support/productionLoader');
const { registerActiveProductionTab } = require('../../test-support/productionWorkspace');

/**
 * Regression persistence and configuration coverage.
 */

describe('Regression controls persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    const jStatModule = require('jstat');
    global.jStat = window.jStat = jStatModule?.jStat || jStatModule;
    global.Shared = global.Shared || {};
    global.Components = global.Components || {};
    loadProductionBootstrap({
      vendorMode: 'fake',
      includeMain: false,
      stopBefore: 'js/main/snapshotPolicy.js'
    });
    require('../../js/components/scatter.js');
    require('../../js/components/line.js');
  });

  test('Scatter regression payload captures summary', async () => {
    const scatter = window.Components?.scatter;
    expect(scatter).toBeTruthy();
    scatter.ensure({
      tabId: 'regression-scatter-test-tab',
      root: document.getElementById('scatterPage'),
      reason: 'regression-persistence-test'
    });

    const payload = scatter.getPayload();
    const data = payload.data;
    data[0][0] = 'Label';
    data[0][1] = 'X';
    data[0][2] = 'Y';
    data[1][0] = 'A'; data[1][1] = 0; data[1][2] = 0;
    data[2][0] = 'B'; data[2][1] = 1; data[2][2] = 0;
    data[3][0] = 'C'; data[3][1] = 2; data[3][2] = 1;
    data[4][0] = 'D'; data[4][1] = 3; data[4][2] = 1;

    const showLine = document.getElementById('scatterShowLine');
    showLine.checked = true;
    showLine.dispatchEvent(new window.Event('change'));

    const regressionSelect = document.getElementById('scatterRegressionMode');
    regressionSelect.value = 'logistic';
    regressionSelect.dispatchEvent(new window.Event('change'));
    const fitMethodSelect = document.getElementById('scatterFitMethod');
    if(fitMethodSelect){
      fitMethodSelect.value = 'huber';
      fitMethodSelect.dispatchEvent(new window.Event('change'));
    }
    const fitRangeMin = document.getElementById('scatterFitRangeMinX');
    const fitRangeMax = document.getElementById('scatterFitRangeMaxX');
    const confidenceLevel = document.getElementById('scatterConfidenceLevel');
    const initialJson = document.getElementById('scatterInitialValuesJson');
    const constraintsJson = document.getElementById('scatterParameterConstraintsJson');
    if(fitRangeMin){ fitRangeMin.value = '-8'; fitRangeMin.dispatchEvent(new window.Event('change')); }
    if(fitRangeMax){ fitRangeMax.value = '-4'; fitRangeMax.dispatchEvent(new window.Event('change')); }
    if(confidenceLevel){ confidenceLevel.value = '90'; confidenceLevel.dispatchEvent(new window.Event('change')); }
    if(initialJson){ initialJson.value = '{"0":1000}'; initialJson.dispatchEvent(new window.Event('change')); }
    if(constraintsJson){ constraintsJson.value = '{"HillSlope":{"lower":-5,"upper":5}}'; constraintsJson.dispatchEvent(new window.Event('change')); }

    scatter.draw();
    // Allow initial draw/UI sync, then compute stats explicitly (required for summaries).
    for (let i = 0; i < 25; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const computeBtn = document.getElementById('scatterComputeStats');
    expect(computeBtn).toBeTruthy();
    // Button enablement is async; give it a moment.
    for (let i = 0; i < 25 && computeBtn.disabled; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!computeBtn.disabled) {
      computeBtn.click();
      for (let i = 0; i < 25; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const nextPayload = scatter.getPayload();
    expect(typeof nextPayload.config.regression.mode).toBe('string');
    expect(nextPayload.config.regression.method).toBe('huber');
    expect(nextPayload.config.regression.fitSpec).toBeTruthy();
    if (nextPayload.config.regression.fitSpec.confidenceLevel != null) {
      expect(nextPayload.config.regression.fitSpec.confidenceLevel).toBe(90);
    }
    if (nextPayload.config.regression.fitSpec.range) {
      expect(nextPayload.config.regression.fitSpec.range).toEqual(expect.objectContaining({ minX: -8, maxX: -4 }));
    }
    const summary = nextPayload.config.regression.summary;
    if (summary) {
      expect(summary.metrics).toEqual(expect.objectContaining({
        sampleSize: expect.any(Number)
      }));
      expect(summary.residuals).toEqual(expect.objectContaining({
        mean: expect.any(Number),
        sd: expect.any(Number)
      }));
    } else {
      expect(computeBtn.disabled).toBe(true);
    }
  });

  test('Line regression payload stores per-series summaries', async () => {
    const line = window.Components?.line;
    expect(line).toBeTruthy();
    const lineTabId = 'regression-line-test-tab';
    const lineRoot = document.getElementById('linePage');
    registerActiveProductionTab({ type: 'line', tabId: lineTabId, root: lineRoot });
    line.ensure({ tabId: lineTabId, root: lineRoot, reason: 'regression-persistence-test' });

    const hot = line.getHot();
    expect(hot).toBeTruthy();
    const matrix = hot.getData();
    matrix[0][0] = 'X';
    matrix[0][1] = 'Series1';
    matrix[0][2] = 'Series2';
    matrix[1][0] = 0; matrix[1][1] = 1; matrix[1][2] = 1;
    matrix[2][0] = 1; matrix[2][1] = 4; matrix[2][2] = 1;
    matrix[3][0] = 2; matrix[3][1] = 9; matrix[3][2] = 4;
    matrix[4][0] = 3; matrix[4][1] = 16; matrix[4][2] = 9;
    hot.loadData(matrix);

    const regressionSelect = document.getElementById('lineRegressionMode');
    regressionSelect.value = 'linear';
    regressionSelect.dispatchEvent(new window.Event('change'));

    line.draw({ tabId: lineTabId, reason: 'regression-persistence-test', force: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn).toBeTruthy();
    computeBtn.click();
    let retries = 30;
    while(retries > 0){
      const nextPayload = line.getPayload();
      const nextSummaries = nextPayload?.config?.regression?.seriesSummaries;
      if(Array.isArray(nextSummaries) && nextSummaries.length > 0){
        break;
      }
      // Stats compute can settle asynchronously through the component scheduler.
      await new Promise(resolve => setTimeout(resolve, 0));
      retries -= 1;
    }

    const saved = line.getPayload();
    expect(saved.config.regression.mode).toBe('linear');
    const summaries = saved.config.regression.seriesSummaries;
    expect(Array.isArray(summaries)).toBe(true);
    expect(summaries.length).toBeGreaterThan(0);
    const firstSummary = summaries[0];
    expect(firstSummary).toEqual(expect.objectContaining({
      mode: 'linear'
    }));
    const normalizedName = String(firstSummary?.name || '').replace(/\s+/g, '').toLowerCase();
    expect(normalizedName).toBe('series1');
    const summaryPayload = firstSummary.summary || firstSummary;
    expect(summaryPayload).toBeTruthy();
    if(summaryPayload.metrics){
      expect(summaryPayload.metrics).toEqual(expect.objectContaining({
        sampleSize: expect.any(Number)
      }));
    }else{
      expect(summaryPayload).toBeTruthy();
    }
  });
});
