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
    require('../js/shared/significanceControls.js');
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

    const varianceCard = document.getElementById('pcaVarianceSummary');
    expect(varianceCard).toBeTruthy();
    expect(varianceCard.hidden).toBe(false);
    const varianceItems = Array.from(varianceCard.querySelectorAll('li'));
    expect(varianceItems.length).toBeGreaterThan(0);

    const eigenContainer = document.getElementById('pcaEigenTableContainer');
    expect(eigenContainer).toBeTruthy();
    expect(eigenContainer.hidden).toBe(false);
    const eigenTable = document.querySelector('#pcaEigenTableWrapper table');
    expect(eigenTable).toBeTruthy();
    const exportBtn = document.getElementById('pcaExportEigenTable');
    expect(exportBtn).toBeTruthy();
    expect(exportBtn.disabled).toBe(false);

    const payload = window.Components.pca.getPayload();
    expect(payload.stats).toBeTruthy();
    expect(Array.isArray(payload.stats.eigenSummary)).toBe(true);
    expect(Array.isArray(payload.stats.scree)).toBe(true);
    expect(payload.stats.eigenSummary.length).toBeGreaterThan(0);
    expect(payload.stats.scree.length).toBe(payload.stats.eigenSummary.length);
    const firstEntry = payload.stats.eigenSummary[0];
    expect(firstEntry.component).toBe(1);
    expect(firstEntry.variancePercent).toBeGreaterThan(0);
    expect(varianceItems[0].textContent).toContain(`PC${firstEntry.component}`);
    const cumulative = payload.stats.eigenSummary.map(item => item.cumulativeVariancePercent);
    const sorted = [...cumulative].sort((a, b) => a - b);
    expect(cumulative).toEqual(sorted);
    const screeFirst = payload.stats.scree[0];
    expect(screeFirst.variancePercent).toBeCloseTo(firstEntry.variancePercent, 5);
  });

  test('large PCA dataset disables live updates until manual render', async () => {
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

      expect(liveToggle).toBeTruthy();
      expect(renderButton).toBeTruthy();
      expect(notice).toBeTruthy();
      expect(state).toBeTruthy();
      expect(hot.getData().length).toBeGreaterThan(5000);
      expect(state.lastDataShape?.rows).toBeGreaterThan(5000);
      expect(state.lastDataShape?.cols).toBeGreaterThan(0);
      expect(state.lastAutoDrawEvaluation).toBeTruthy();
      expect(state.lastAutoDrawEvaluation.totalRows).toBeGreaterThan(0);
      expect(state.lastAutoDrawEvaluation.totalRows).toBeGreaterThan(5000);
      expect(state.autoDrawLockedByThreshold).toBe(true);
      expect(state.autoDrawEnabled).toBe(false);
      expect(state.performance).toBeTruthy();
      expect(state.performance.loadData).toBeTruthy();
      expect(state.performance.loadData.rows).toBeGreaterThan(5000);
      expect(state.performance.loadData.cols).toBeGreaterThan(0);
      expect(state.performance.loadData.totalMs).toBeGreaterThanOrEqual(0);
      expect(state.performance.evaluation).toBeTruthy();
      expect(state.performance.evaluation.rows).toBeGreaterThan(5000);
      expect(state.performance.evaluation.totalMs).toBeGreaterThanOrEqual(0);
      expect(liveToggle.checked).toBe(false);
      expect(renderButton.disabled).toBe(false);
      expect(renderButton.textContent).toMatch(/update plot/i);
      expect(notice.hidden).toBe(false);
      expect(notice.textContent).toMatch(/paused/i);
      expect(notice.textContent).not.toMatch(/waiting to be rendered/i);
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
      const scheduleDraw = typeof state.scheduleDraw === 'function' ? state.scheduleDraw : null;
      expect(scheduleDraw).toBeTruthy();
      hot.setDataAtCell(1, 1, replacement);
      await flushAll(5);
      scheduleDraw({ reason: 'hot-change' });
      await flushAll(30);

      expect(state.drawPending).toBe(true);
      expect(notice.textContent).toMatch(/waiting to be rendered/i);

      renderButton.click();
      await flushAll(60);

      const updatedDrawPerf = state.performance?.draw;
      expect(updatedDrawPerf).toBeTruthy();
      expect((updatedDrawPerf?.timestamp || 0)).toBeGreaterThan(initialDrawTimestamp);
      expect((updatedDrawPerf?.totalMs || 0)).toBeGreaterThanOrEqual(initialDrawTotal);
      expect(state.drawPending).toBe(false);
      expect(notice.textContent).not.toMatch(/waiting to be rendered/i);
      expect(renderButton.disabled).toBe(false);
      expect(updatedDrawPerf.samples).toBeGreaterThan(0);
      expect(updatedDrawPerf.features).toBeGreaterThan(5000);
      expect(updatedDrawPerf.totalMs).toBeGreaterThanOrEqual(0);
      expect(updatedDrawPerf.fastMode).toBe(false);
      expect(updatedDrawPerf.loadingsTruncated).toBe(true);
      expect(updatedDrawPerf.loadingsRendered).toBeLessThan(updatedDrawPerf.loadingsTotal);
      expect(updatedDrawPerf.renderMs).toBeLessThan(1500);
  });

  test('live updates re-enable when switching from large to small PCA datasets in one tab', async () => {
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

    expect(liveToggle).toBeTruthy();
    expect(renderButton).toBeTruthy();
    expect(notice).toBeTruthy();
    expect(state).toBeTruthy();

    await flushUntil(() => state.autoDrawLockedByThreshold === true && state.autoDrawEnabled === false, {
      limit: 120,
      step: 2
    });
    const heavyRows = state.lastAutoDrawEvaluation?.totalRows || rows.length;
    const heavyCols = state.lastAutoDrawEvaluation?.totalCols || (rows[0]?.length || 0);
    expect(liveToggle.checked).toBe(false);
    expect(renderButton.hidden).toBe(false);
    expect(notice.hidden).toBe(false);

    const smallData = Array.from({ length: 10 }, (_, rowIdx) =>
      Array.from({ length: 5 }, (_, colIdx) => (rowIdx === 0 ? `V${colIdx + 1}` : `${rowIdx}.${colIdx}`))
    );
    expect(smallData.length).toBe(10);
    expect(smallData[0].length).toBe(5);
    const smallRows = smallData.length;
    const smallCols = smallData[0].length;
    hot.loadData(smallData);
    await flushAll(40);

    await flushUntil(
      () => state.autoDrawLockedByThreshold === false && state.autoDrawEnabled === true,
      { limit: 120, step: 2 }
    );

    expect(state.lastAutoDrawEvaluation?.thresholdExceeded).toBe(false);
    expect(state.lastDataShape?.rows).toBeLessThan(heavyRows);
    expect(state.lastDataShape?.cols).toBeLessThanOrEqual(Math.max(heavyCols, smallCols));
    expect(liveToggle.checked).toBe(true);
    expect(renderButton.hidden).toBe(true);
    expect(notice.hidden).toBe(true);
  });

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

    expect(liveToggle).toBeTruthy();
    expect(renderButton).toBeTruthy();
    expect(notice).toBeTruthy();
    expect(state).toBeTruthy();

    await flushUntil(() => state.autoDrawLockedByThreshold === true && state.autoDrawEnabled === false, {
      limit: 120,
      step: 2
    });
    const heavyRows = state.lastAutoDrawEvaluation?.totalRows || rows.length;
    const heavyCols = state.lastAutoDrawEvaluation?.totalCols || (rows[0]?.length || 0);

    const smallData = Array.from({ length: 10 }, (_, rowIdx) =>
      Array.from({ length: 5 }, (_, colIdx) => (rowIdx === 0 ? `V${colIdx + 1}` : `${rowIdx}.${colIdx}`))
    );
    const smallRows = smallData.length;
    const smallCols = smallData[0].length;
    hot.loadData(smallData);
    await flushAll(40);

    // Simulate a stale threshold lock that persists after a tab switch or state reuse.
    state.autoDrawLockedByThreshold = true;
    state.autoDrawEnabled = false;
    state.autoDrawReason = { type: 'threshold', rows: heavyRows, cols: heavyCols };
    state.lastDataShape = { rows: heavyRows, cols: heavyCols };
    liveToggle.checked = false;
    renderButton.hidden = false;
    notice.hidden = false;

    state.scheduleDraw({ reason: 'stale-threshold' });
    await flushUntil(
      () => state.autoDrawLockedByThreshold === false && state.autoDrawEnabled === true,
      { limit: 120, step: 2 }
    );

    expect(state.lastAutoDrawEvaluation?.thresholdExceeded).toBe(false);
    expect(state.lastDataShape?.rows).toBeLessThan(heavyRows);
    expect(state.lastDataShape?.cols).toBeLessThanOrEqual(Math.max(heavyCols, smallCols));
    expect(liveToggle.checked).toBe(true);
    expect(renderButton.hidden).toBe(true);
    expect(notice.hidden).toBe(true);
  });

  test('view-only styling updates and 3D rotation reuse cached PCA geometry', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();
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

  test('switching PCA method redraws immediately when live updates are off', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushUntil(() => !!window.Components?.pca?.__state?.performance?.draw, { limit: 80, step: 2 });

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();

    const liveToggle = document.getElementById('pcaLiveUpdate');
    expect(liveToggle).toBeTruthy();
    liveToggle.checked = false;
    liveToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUntil(() => state.autoDrawEnabled === false, { limit: 40, step: 2 });

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
    expect(state.drawPending).toBe(false);
    expect(state.lastMethod).toBe('mds');
    expect(global.__svdCallCount).toBeGreaterThan(0);
  });
});
