jest.setTimeout(30000);

describe('PCA view controls', () => {
  const flush = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const flushAll = async (count = 10) => {
    for (let i = 0; i < count; i += 1) {
      await flush();
    }
  };

  const flushUntil = async (predicate, { limit = 50, step = 1 } = {}) => {
    for (let attempt = 0; attempt < limit; attempt += 1) {
      if (predicate()) {
        return true;
      }
      await flushAll(step);
    }
    throw new Error('flushUntil timed out');
  };

  beforeEach(async () => {
    jest.resetModules();
    global.__svdCallCount = 0;
    global.SVDJS = {
      SVD(matrix = []) {
        global.__svdCallCount = (global.__svdCallCount || 0) + 1;
        const rows = Array.isArray(matrix) ? matrix.length : 0;
        const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
        const componentCount = Math.max(1, Math.min(rows, cols, 3));
        const q = Array.from({ length: componentCount }, (_, idx) => componentCount - idx + 1);
        const u = Array.from({ length: rows }, (_, r) =>
          Array.from({ length: componentCount }, (_, k) => ((r + 1) / (componentCount + k + 1)))
        );
        const v = Array.from({ length: cols }, (_, c) =>
          Array.from({ length: componentCount }, (_, k) => ((c + 1) / (componentCount + k + 1)))
        );
        return { u, v, q };
      }
    };
    global.jStat = {
      mean(values = []) {
        const filtered = values.filter(v => typeof v === 'number');
        if (!filtered.length) return 0;
        const sum = filtered.reduce((acc, v) => acc + v, 0);
        return sum / filtered.length;
      },
      stdev(values = [], flag) {
        const filtered = values.filter(v => typeof v === 'number');
        if (filtered.length < 2) return 0;
        const mean = filtered.reduce((acc, v) => acc + v, 0) / filtered.length;
        const variance = filtered.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
          (flag ? filtered.length : filtered.length - 1);
        return Math.sqrt(variance);
      }
    };
    require('../js/vendor.js');
    require('../js/shared/debounce.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/formControls.js');
    require('../js/shared/dom.js');
    require('../js/components/pca.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main.js');
    window.Components?.pca?.ensure?.();
    await flushAll();
  });

  test('PCA loadings render and 3D view persists in payload', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll();

    const loadingsContainer = document.getElementById('pcaLoadingsContainer');
    expect(loadingsContainer).toBeTruthy();
    expect(loadingsContainer.hidden).toBe(false);
    const initialTable = loadingsContainer.querySelector('#pcaLoadingsTable table');
    expect(initialTable).toBeTruthy();
    const includeAllAxesToggle = document.getElementById('pcaIncludeNonRetainedAxes');
    expect(includeAllAxesToggle).toBeTruthy();
    includeAllAxesToggle.checked = true;
    includeAllAxesToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll();

    const viewSelect = document.getElementById('pcaViewMode');
    expect(viewSelect).toBeTruthy();
    viewSelect.value = '3d';
    viewSelect.dispatchEvent(new Event('change'));

    window.Components?.pca?.draw?.();
    await flushAll();

    const statsText = document.getElementById('pcaStatsResults')?.textContent || '';
    expect(statsText).not.toEqual('');
    const svg = document.querySelector('#pcaPlot svg');
    expect(svg).toBeTruthy();
    expect(svg.dataset.viewMode).toBe('3d');

    const table = document.querySelector('#pcaLoadingsTable table');
    expect(table).toBeTruthy();
    const headers = Array.from(table.querySelectorAll('th')).map(el => el.textContent.trim());
    expect(headers).toEqual(expect.arrayContaining(['Variable', 'PC1', 'PC2', 'PC3']));

    const payload = window.Components.pca.getPayload();
    expect(payload.config.viewMode).toBe('3d');
  });

  test('PCA scree data and eigen table export are generated for example dataset', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll();

    const screeContainer = document.getElementById('pcaScreeContainer');
    expect(screeContainer).toBeTruthy();
    expect(screeContainer.hidden).toBe(false);
    expect(screeContainer.querySelector('svg')).toBeTruthy();

    const eigenContainer = document.getElementById('pcaEigenTableContainer');
    expect(eigenContainer).toBeTruthy();
    expect(eigenContainer.hidden).toBe(false);
    const eigenTable = document.querySelector('#pcaEigenTableWrapper table');
    expect(eigenTable).toBeTruthy();

    const payload = window.Components.pca.getPayload();
    expect(payload.stats).toBeTruthy();
    expect(Array.isArray(payload.stats.eigenSummary)).toBe(true);
    expect(Array.isArray(payload.stats.scree)).toBe(true);
    expect(payload.stats.eigenSummary.length).toBeGreaterThan(0);
    expect(payload.stats.scree.length).toBe(payload.stats.eigenSummary.length);
    const firstEntry = payload.stats.eigenSummary[0];
    expect(firstEntry.component).toBe(1);
    expect(firstEntry.variancePercent).toBeGreaterThan(0);
    const cumulative = payload.stats.eigenSummary.map(item => item.cumulativeVariancePercent);
    const sorted = [...cumulative].sort((a, b) => a - b);
    expect(cumulative).toEqual(sorted);
    const screeFirst = payload.stats.scree[0];
    expect(screeFirst.variancePercent).toBeCloseTo(firstEntry.variancePercent, 5);
  }, 180000);

  test('PCA payload restore keeps statistics when saved stats live at payload root', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const payload = window.Components.pca.getPayload();
    expect(payload.stats).toBeTruthy();
    expect(payload.config?.stats?.summaryHtml).toContain('Samples analysed');
    expect(payload.config?.stats?.reportHtml || '').toContain('Reporting and reproducibility');

    const eigenContainer = document.getElementById('pcaEigenTableContainer');
    const loadingsContainer = document.getElementById('pcaLoadingsContainer');
    expect(eigenContainer).toBeTruthy();
    expect(loadingsContainer).toBeTruthy();

    window.Components.pca.loadFromPayload(payload, { source: 'test-payload-restore', skipDraw: true });
    await flushAll(5);

    expect(payload.stats.method).toBe('pca');
    expect(eigenContainer.hidden).toBe(false);
    expect(loadingsContainer.hidden).toBe(false);
    expect(document.querySelector('#pcaScreePlot svg')).toBeTruthy();
    expect(document.querySelector('#pcaEigenTableWrapper table')).toBeTruthy();
    expect(document.querySelector('#pcaLoadingsTable table')).toBeTruthy();
  }, 180000);

  test('PCA empty workspace is not treated as unsaved table data', async () => {
    const session = window.Main?.session;
    expect(typeof session?.tabHasTableData).toBe('function');
    const payload = window.Components?.pca?.getPayload?.();
    expect(payload).toBeTruthy();
    const hasData = session.tabHasTableData({
      id: 'pca-empty-tab',
      type: 'pca',
      payload
    });
    expect(hasData).toBe(false);
  }, 180000);

  test('PCA workspace with user-entered values is treated as unsaved table data', async () => {
    const session = window.Main?.session;
    const component = window.Components?.pca;
    expect(typeof session?.tabHasTableData).toBe('function');
    expect(component).toBeTruthy();
    const hot = component.getHotInstance?.();
    expect(hot).toBeTruthy();
    if (typeof hot.setDataAtCell === 'function') {
      hot.setDataAtCell([[2, 1, 42]], 'test:pca-has-data');
    } else if (typeof hot.getData === 'function' && typeof hot.loadData === 'function') {
      const data = hot.getData() || [];
      if (!Array.isArray(data[2])) {
        data[2] = [];
      }
      data[2][1] = 42;
      hot.loadData(data);
    }
    await flushAll(5);
    const payload = component.getPayload();
    const hasData = session.tabHasTableData({
      id: 'pca-filled-tab',
      type: 'pca',
      payload
    });
    expect(hasData).toBe(true);
  }, 180000);

  test('PCA payload restore keeps reporting and reproducibility panel', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const payload = window.Components.pca.getPayload();
    expect(payload.config?.stats?.summaryHtml).toContain('Samples analysed');
    expect(payload.config?.stats?.reportHtml || '').toContain('Reporting and reproducibility');
    expect(document.querySelector('#pcaStatsReportHost > .stats-report-panel')).toBeTruthy();
    expect(document.querySelector('#pcaStatsResults .stats-results-advanced-panel .stats-report-panel')).toBeFalsy();

    const summary = document.getElementById('pcaStatsSummary');
    expect(summary).toBeTruthy();
    summary.innerHTML = '';

    window.Components.pca.loadFromPayload(payload, { source: 'test-report-restore', skipDraw: true });
    await flushAll(10);

    const restoredPanel = document.querySelector('#pcaStatsReportHost > .stats-report-panel');
    expect(restoredPanel).toBeTruthy();
    expect(restoredPanel.textContent || '').toContain('Reporting and reproducibility');
    expect(document.querySelector('#pcaStatsResults .stats-results-advanced-panel .stats-report-panel')).toBeFalsy();
  }, 180000);

  test('PCA payload restore remains compatible with legacy summary-only stats HTML', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const payload = window.Components.pca.getPayload();
    const legacySummaryHtml = payload.config?.stats?.summaryHtml;
    expect(legacySummaryHtml).toContain('Samples analysed');

    payload.config.stats = {
      resultsHtml: legacySummaryHtml,
      summaryHtml: null
    };

    document.getElementById('pcaStatsSummary').innerHTML = '';
    const reportHost = document.getElementById('pcaStatsReportHost');
    if(reportHost){
      reportHost.innerHTML = '';
    }

    window.Components.pca.loadFromPayload(payload, { source: 'test-legacy-summary-restore', skipDraw: true });
    await flushAll(10);

    expect(document.getElementById('pcaStatsSummary')?.textContent || '').toContain('Samples analysed');
    expect(document.querySelector('#pcaStatsReportHost > .stats-report-panel')).toBeTruthy();
    expect(document.getElementById('pcaStatsResults')?.textContent || '').toContain('Reporting and reproducibility');
  }, 180000);

  test('PCA stats keep a single reporting panel anchored at the bottom', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const methodSelect = document.getElementById('pcaMethod');
    expect(methodSelect).toBeTruthy();
    methodSelect.value = 'mds';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(10);
    methodSelect.value = 'pca';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);

    const statsResults = document.getElementById('pcaStatsResults');
    const reportHost = document.getElementById('pcaStatsReportHost');
    expect(statsResults).toBeTruthy();
    expect(reportHost).toBeTruthy();
    expect(statsResults.lastElementChild).toBe(reportHost);
    expect(reportHost.querySelectorAll('.stats-report-panel').length).toBe(1);
    expect(statsResults.querySelectorAll('.stats-report-panel').length).toBe(1);
  }, 180000);

  test('PCA render cache restore restores scree visibility state', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const component = window.Components?.pca;
    expect(component).toBeTruthy();
    const screeContainer = document.getElementById('pcaScreeContainer');
    const screeExportControls = document.getElementById('pcaScreeExportControls');
    const screeVarianceRow = document.getElementById('pcaScreeVarianceRow');
    expect(screeContainer).toBeTruthy();
    expect(screeExportControls).toBeTruthy();
    expect(screeVarianceRow).toBeTruthy();

    const cache = component.captureRenderCache();
    expect(cache).toBeTruthy();

    screeContainer.hidden = true;
    screeContainer.style.maxWidth = '';
    screeExportControls.style.display = 'none';
    screeVarianceRow.style.display = 'none';

    const restored = component.restoreRenderCache(cache);
    expect(restored).toBe(true);
    expect(screeContainer.hidden).toBe(false);
    expect(screeContainer.querySelector('svg')).toBeTruthy();
    expect(screeExportControls.style.display).not.toBe('none');
    expect(screeVarianceRow.style.display).toBe('flex');
  }, 180000);

  test('large PCA dataset keeps automatic redraw active with no legacy manual controls', async () => {
    const fs = require('fs');
    const path = require('path');
    const csvPath = path.join(__dirname, 'test-PCA.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rows = csvText
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .map(line => line.split(','));

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();

    hot.loadData(rows);
    await flushAll(200);

    const liveToggle = document.getElementById('pcaLiveUpdate');
    const renderButton = document.getElementById('pcaRenderButton');
    const notice = document.getElementById('pcaAutoDrawNotice');
    const state = window.Components?.pca?.__state;

    expect(liveToggle).toBeNull();
    expect(renderButton).toBeNull();
    expect(notice).toBeNull();
    expect(state).toBeTruthy();
    expect(hot.getData().length).toBeGreaterThan(5000);
    expect(state.lastDataShape?.rows).toBeGreaterThan(5000);
    expect(state.lastDataShape?.cols).toBeGreaterThan(0);
    if(state.lastAutoDrawEvaluation){
      expect(state.lastAutoDrawEvaluation.totalRows).toBeGreaterThan(0);
      expect(state.lastAutoDrawEvaluation.totalRows).toBeGreaterThan(5000);
    }
    if(Object.prototype.hasOwnProperty.call(state, 'autoDrawLockedByThreshold')){
      expect(state.autoDrawLockedByThreshold).toBe(false);
    }
    if(Object.prototype.hasOwnProperty.call(state, 'autoDrawEnabled')){
      expect(state.autoDrawEnabled).toBe(true);
    }
    expect(state.performance).toBeTruthy();
    expect(state.performance.loadData).toBeTruthy();
    expect(state.performance.loadData.rows).toBeGreaterThan(5000);
    expect(state.performance.loadData.cols).toBeGreaterThan(0);
    expect(state.performance.loadData.totalMs).toBeGreaterThanOrEqual(0);
    expect(state.performance.evaluation).toBeTruthy();
    expect(state.performance.evaluation.rows).toBeGreaterThan(5000);
    expect(state.performance.evaluation.totalMs).toBeGreaterThanOrEqual(0);
    let guard = 0;
    while(!state.performance.draw && guard < 10){
      await flushAll(10);
      guard += 1;
    }
    const initialDrawPerf = state.performance.draw;
    const initialDrawTimestamp = initialDrawPerf?.timestamp || 0;
    const initialDrawTotal = initialDrawPerf?.totalMs || 0;
    if(initialDrawPerf){
      expect(initialDrawPerf.loadingsTruncated).toBe(true);
      expect(initialDrawPerf.loadingsRendered).toBeGreaterThan(0);
      expect(initialDrawPerf.loadingsRendered).toBeLessThan(initialDrawPerf.loadingsTotal);
    }

    const originalValue = rows[1]?.[1] || '0';
    const replacement = originalValue === '0' ? '1' : '0';
    hot.setDataAtCell(1, 1, replacement);
    await flushAll(60);

    const updatedDrawPerf = state.performance?.draw;
    expect(updatedDrawPerf).toBeTruthy();
    expect((updatedDrawPerf?.timestamp || 0)).toBeGreaterThan(initialDrawTimestamp);
    expect((updatedDrawPerf?.totalMs || 0)).toBeGreaterThanOrEqual(initialDrawTotal);
    if(Object.prototype.hasOwnProperty.call(state, 'drawPending')){
      expect(state.drawPending).toBe(false);
    }
    expect(updatedDrawPerf.samples).toBeGreaterThan(0);
    expect(updatedDrawPerf.features).toBeGreaterThan(5000);
    expect(updatedDrawPerf.totalMs).toBeGreaterThanOrEqual(0);
    expect(updatedDrawPerf.fastMode).toBe(false);
    expect(updatedDrawPerf.loadingsTruncated).toBe(true);
    expect(updatedDrawPerf.loadingsRendered).toBeLessThan(updatedDrawPerf.loadingsTotal);
    expect(updatedDrawPerf.renderMs).toBeLessThan(1500);
  }, 180000);

  test('automatic redraw stays enabled when switching from large to small PCA datasets in one tab', async () => {
    const fs = require('fs');
    const path = require('path');
    const csvPath = path.join(__dirname, 'test-PCA.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rows = csvText
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .map(line => line.split(','));

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();

    hot.loadData(rows);
    await flushAll(200);

    const liveToggle = document.getElementById('pcaLiveUpdate');
    const renderButton = document.getElementById('pcaRenderButton');
    const notice = document.getElementById('pcaAutoDrawNotice');
    const state = window.Components?.pca?.__state;

    expect(liveToggle).toBeNull();
    expect(renderButton).toBeNull();
    expect(notice).toBeNull();
    expect(state).toBeTruthy();

    await flushAll(20);
    const heavyRows = state.lastAutoDrawEvaluation?.totalRows || state.lastDataShape?.rows || rows.length;
    const heavyCols = state.lastAutoDrawEvaluation?.totalCols || state.lastDataShape?.cols || (rows[0]?.length || 0);
    const smallData = Array.from({ length: 10 }, (_, rowIdx) =>
      Array.from({ length: 5 }, (_, colIdx) => (rowIdx === 0 ? `V${colIdx + 1}` : `${rowIdx}.${colIdx}`))
    );
    expect(smallData.length).toBe(10);
    expect(smallData[0].length).toBe(5);
    const smallCols = smallData[0].length;
    hot.loadData(smallData);
    await flushAll(40);
    await flushAll(30);

    if(state.lastAutoDrawEvaluation){
      expect(state.lastAutoDrawEvaluation.thresholdExceeded).toBe(false);
    }
    expect(state.lastDataShape?.rows).toBeLessThanOrEqual(heavyRows);
    expect(state.lastDataShape?.cols).toBeLessThanOrEqual(Math.max(heavyCols, smallCols));
  }, 180000);

  test('stale threshold lock clears after switching back to small PCA data', async () => {
    const fs = require('fs');
    const path = require('path');
    const csvPath = path.join(__dirname, 'test-PCA.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rows = csvText
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .map(line => line.split(','));

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();

    hot.loadData(rows);
    await flushAll(200);

    const liveToggle = document.getElementById('pcaLiveUpdate');
    const renderButton = document.getElementById('pcaRenderButton');
    const notice = document.getElementById('pcaAutoDrawNotice');
    const state = window.Components?.pca?.__state;

    expect(liveToggle).toBeNull();
    expect(renderButton).toBeNull();
    expect(notice).toBeNull();
    expect(state).toBeTruthy();

    await flushAll(20);
    const heavyRows = state.lastAutoDrawEvaluation?.totalRows || state.lastDataShape?.rows || rows.length;
    const heavyCols = state.lastAutoDrawEvaluation?.totalCols || state.lastDataShape?.cols || (rows[0]?.length || 0);

    const smallData = Array.from({ length: 10 }, (_, rowIdx) =>
      Array.from({ length: 5 }, (_, colIdx) => (rowIdx === 0 ? `V${colIdx + 1}` : `${rowIdx}.${colIdx}`))
    );
    const smallCols = smallData[0].length;
    hot.loadData(smallData);
    await flushAll(40);

    state.autoDrawLockedByThreshold = true;
    state.autoDrawEnabled = false;
    state.autoDrawReason = { type: 'threshold', rows: heavyRows, cols: heavyCols };
    state.lastDataShape = { rows: heavyRows, cols: heavyCols };
    state.scheduleDraw({ reason: 'stale-threshold' });
    await flushAll(30);

    if(state.lastAutoDrawEvaluation){
      expect(state.lastAutoDrawEvaluation.thresholdExceeded).toBe(false);
    }
    expect(state.lastDataShape?.rows).toBeLessThanOrEqual(heavyRows);
    expect(state.lastDataShape?.cols).toBeLessThanOrEqual(Math.max(heavyCols, smallCols));
  }, 180000);

  test('view-only styling updates and 3D rotation reuse cached PCA geometry', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();
    const includeAllAxesToggle = document.getElementById('pcaIncludeNonRetainedAxes');
    expect(includeAllAxesToggle).toBeTruthy();
    includeAllAxesToggle.checked = true;
    includeAllAxesToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);
    await flushUntil(() => !!state.cachedRender, { limit: 80, step: 2 });
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > 0, { limit: 80, step: 2 });

    const initialCache = state.cachedRender;
    expect(initialCache).toBeTruthy();
    const initialSvd = global.__svdCallCount;
    expect(initialSvd).toBeGreaterThan(0);
    let lastDrawTimestamp = state.performance?.draw?.timestamp || 0;
    const waitForDraw = async () => {
      await flushUntil(() => {
        const ts = state.performance?.draw?.timestamp || 0;
        return ts > lastDrawTimestamp;
      }, { limit: 80, step: 2 });
      lastDrawTimestamp = state.performance?.draw?.timestamp || lastDrawTimestamp;
    };
    const expectViewOnlyRefresh = (expectedReason) => {
      expect(global.__svdCallCount).toBe(initialSvd);
      expect(state.dataDirty).toBe(false);
      expect(state.viewDirty).toBe(false);
      expect(state.cachedRender).toBe(initialCache);
      const drawPerf = state.performance?.draw;
      expect(drawPerf).toBeTruthy();
      expect(drawPerf.viewOnly).toBe(true);
      expect(drawPerf.cacheReused).toBe(true);
      if (expectedReason) {
        expect(drawPerf.reason).toBe(expectedReason);
      }
    };

    const legendToggle = document.getElementById('pcaShowLegend');
    expect(legendToggle).toBeTruthy();
    const initialLegendState = legendToggle.checked;
    legendToggle.checked = !initialLegendState;
    legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    expectViewOnlyRefresh('legend-toggle');

    legendToggle.checked = initialLegendState;
    legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    expectViewOnlyRefresh('legend-toggle');

    const svg = document.querySelector('#pcaPlot svg');
    expect(svg).toBeTruthy();
    const axisLine = svg.querySelector('line[data-axis-control="1"]');
    expect(axisLine).toBeTruthy();
    axisLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushUntil(() => {
      const panel = document.querySelector('.axis-controls-panel');
      return panel && panel.dataset.open === '1';
    }, { limit: 20, step: 1 });
    const panel = document.querySelector('.axis-controls-panel');
    expect(panel).toBeTruthy();
    const thicknessField = Array.from(panel.querySelectorAll('.axis-controls-panel__field'))
      .find((field) => /Thickness/i.test(field.textContent || ''));
    expect(thicknessField).toBeTruthy();
    const thicknessInput = thicknessField.querySelector('input');
    expect(thicknessInput).toBeTruthy();
    thicknessInput.value = '2';
    thicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    expectViewOnlyRefresh('axis-stroke-width');
    expect(state.axisSettings.strokeWidth).toBe(2);
    expect(thicknessInput.value).toBe('2');

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(2);

    const viewSelect = document.getElementById('pcaViewMode');
    expect(viewSelect).toBeTruthy();
    viewSelect.value = '3d';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForDraw();
    const svg3d = document.querySelector('#pcaPlot svg');
    expect(svg3d).toBeTruthy();
    expect(svg3d.dataset.viewMode).toBe('3d');
    expectViewOnlyRefresh('view-mode-change');

    const rotationBefore = { x: state.rotation.x, y: state.rotation.y, z: state.rotation.z };
    state.rotation.x = rotationBefore.x + 0.2;
    state.rotationPending = true;
    state.viewDirty = true;
    state.scheduleDraw({ viewOnly: true, reason: 'rotation-test' });
    await waitForDraw();
    expectViewOnlyRefresh('rotation-test');
    expect(state.rotation.x).not.toBe(rotationBefore.x);
    expect(state.rotationPending).toBe(false);
  });

  test('graph resize reuses cached PCA geometry', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushUntil(() => !!window.Components?.pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();
    const initialCache = state.cachedRender;
    const initialSvd = global.__svdCallCount;
    const initialTimestamp = state.performance?.draw?.timestamp || 0;

    state.viewDirty = true;
    state.scheduleDraw({ viewOnly: true, reason: 'resize' });
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > initialTimestamp, { limit: 80, step: 2 });

    const drawPerf = state.performance?.draw;
    expect(drawPerf).toBeTruthy();
    expect(drawPerf.viewOnly).toBe(true);
    expect(drawPerf.cacheReused).toBe(true);
    expect(drawPerf.reason).toBe('resize');
    expect(state.cachedRender).toBe(initialCache);
    expect(global.__svdCallCount).toBe(initialSvd);
  });

  test('switching PCA method redraws immediately', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushUntil(() => !!window.Components?.pca?.__state?.performance?.draw, { limit: 80, step: 2 });

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();

    const initialTimestamp = state.performance?.draw?.timestamp || 0;
    const methodSelect = document.getElementById('pcaMethod');
    expect(methodSelect).toBeTruthy();
    methodSelect.value = 'mds';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > initialTimestamp, { limit: 80, step: 2 });

    const drawPerf = state.performance?.draw;
    expect(drawPerf).toBeTruthy();
    expect(drawPerf.viewOnly).toBe(false);
    expect(drawPerf.reason).toBe('method-change');
    if(Object.prototype.hasOwnProperty.call(state, 'drawPending')){
      expect(state.drawPending).toBe(false);
    }
    expect(state.lastMethod).toBe('mds');
    expect(global.__svdCallCount).toBeGreaterThan(0);
  });
});

