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
  const activateWorkspace = async (type) => {
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const result = graphSelection(type);
    if(result && typeof result.then === 'function'){
      await result;
    }
    await Promise.resolve();
  };

  beforeEach(async () => {
    jest.resetModules();
    if(typeof window !== 'undefined'){
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }
    if(typeof global !== 'undefined'){
      delete global.Main;
      delete global.Components;
      delete global.Shared;
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    if (window.Components) {
      delete window.Components.pca;
    }
    if (global.Components) {
      delete global.Components.pca;
    }
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
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/dataViewPersistence.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/exampleDatasets.js');
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
    await activateWorkspace('pca');
    const activePcaTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    window.Components?.pca?.ensure?.({
      tabId: activePcaTabId,
      root: document.getElementById('pcaPage'),
      reason: 'pca-view-test-ensure'
    });
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
    expect(['2d', '3d']).toContain(svg.dataset.viewMode);

    const table = document.querySelector('#pcaLoadingsTable table');
    expect(table).toBeTruthy();
    const headers = Array.from(table.querySelectorAll('th')).map(el => el.textContent.trim());
    expect(headers).toEqual(expect.arrayContaining(['Variable', 'PC1', 'PC2']));

    const payload = window.Components.pca.getPayload();
    expect(payload.config.viewMode).toBe('3d');
  });

  test('loading the standard example does not dirty an unchanged table format', async () => {
    const tab = window.Main?.session?.getActiveTab?.();
    expect(tab).toBeTruthy();

    document.getElementById('pcaLoadExample').click();
    await flushAll();

    expect(tab.userModified).toBe(true);
    expect(tab.payloadDirty).toBe(false);
  });

  test('PCA DataView changes dirty the owning payload before deactivation', async () => {
    const tab = window.Main?.session?.getActiveTab?.();
    expect(tab).toBeTruthy();

    document.getElementById('pcaLoadExample').click();
    await flushAll();

    expect(tab.payloadDirty).toBe(false);
    const hot = window.Components?.pca?.getHotInstance?.();
    const manager = hot?.__pcaDataViewsManager || null;
    const rawView = manager?.getView?.('raw') || null;
    expect(manager).toBeTruthy();
    expect(rawView).toBeTruthy();

    const derived = manager.createDerivedView({
      title: 'Persistence probe',
      data: rawView.data.map(row => Array.isArray(row) ? row.slice() : row),
      sourceViewId: 'raw',
      transformSpec: { type: 'pca-persistence-probe' },
      activate: true,
      reason: 'pca-persistence-probe'
    });

    expect(derived).toBeTruthy();
    expect(manager.getActiveView()?.id).toBe(derived.id);
    expect(tab.payloadDirty).toBe(true);
    expect(tab.payloadDirtyReason).toMatch(/^pca-data-view-/);

    const payload = window.Components.pca.getPayload();
    expect(payload.activeDataViewId).toBe(derived.id);
    expect(payload.dataViews?.activeViewId).toBe(derived.id);
    expect(payload.data).toEqual(rawView.data);
  });

  test('PCA axis selection writes through to the owning session before persistence', async () => {
    const component = window.Components?.pca;
    const hooks = component?.__testHooks;
    document.getElementById('pcaLoadExample').click();
    await flushAll(12);

    const xAxis = document.getElementById('pcaXAxis');
    const yAxis = document.getElementById('pcaYAxis');
    expect(Array.from(xAxis.options).some(option => option.value === '2')).toBe(true);
    expect(Array.from(yAxis.options).some(option => option.value === '3')).toBe(true);

    xAxis.value = '2';
    xAxis.dispatchEvent(new Event('change', { bubbles: true }));
    yAxis.value = '3';
    yAxis.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(12);

    const ownerSession = hooks.getSession();
    const ownerTab = window.Main?.session?.getActiveTab?.();
    expect(ownerSession?.state?.state?.axisSelection).toEqual({ x: 2, y: 3, z: 1 });
    expect(ownerTab?.payload?.config?.axisSelection).toEqual({ x: 2, y: 3, z: 1 });

    // The module-level PCA state is only a visible projection mirror. Durable
    // serialization must continue to read the owning session even if that mirror
    // is temporarily stale during a same-component activation boundary.
    component.__state.axisSelection = { x: 1, y: 2, z: 3 };
    expect(hooks.snapshotConfig(ownerSession).axisSelection).toEqual({ x: 2, y: 3, z: 1 });
    expect(component.getPayload().config.axisSelection).toEqual({ x: 2, y: 3, z: 1 });
    expect(ownerTab?.payload?.config?.axisSelection).toEqual({ x: 2, y: 3, z: 1 });
  });

  test('PCA metric controls write through exact booleans to the owning canonical payload', async () => {
    document.getElementById('pcaLoadExample').click();
    await flushAll(12);

    const tab = window.Main?.session?.getActiveTab?.();
    const standardize = document.getElementById('pcaStandardizeVariables');
    const equalAxisLengths = document.querySelector('#pcaPage .resizer-axeslength-checkbox--equal-scale');
    expect(tab?.payload?.config?.standardizeVariables).toBe(false);
    expect(tab?.payload?.config?.equalAxisLengths).toBe(true);

    standardize.checked = true;
    standardize.dispatchEvent(new Event('change', { bubbles: true }));
    expect(tab?.payload?.config?.standardizeVariables).toBe(true);

    equalAxisLengths.checked = false;
    equalAxisLengths.dispatchEvent(new Event('change', { bubbles: true }));
    expect(tab?.payload?.config?.equalAxisLengths).toBe(false);

    equalAxisLengths.checked = true;
    equalAxisLengths.dispatchEvent(new Event('change', { bubbles: true }));
    expect(tab?.payload?.config?.equalAxisLengths).toBe(true);
  });

  test('PCA payload hydration projects view mode without firing a user redraw', () => {
    const component = window.Components?.pca;
    const viewSelect = document.getElementById('pcaViewMode');
    expect(component).toBeTruthy();
    expect(viewSelect).toBeTruthy();
    const payload = component.getPayload();
    payload.config.viewMode = '3d';
    const structuralDrawSpy = jest.spyOn(window.Shared.componentLifecycle, 'createStructuralDrawOptions');

    component.loadFromPayload(payload, {
      source: 'test-silent-view-mode-hydration',
      skipDraw: true
    });

    expect(viewSelect.value).toBe('3d');
    expect(component.getPayload().config.viewMode).toBe('3d');
    expect(structuralDrawSpy).not.toHaveBeenCalled();
    structuralDrawSpy.mockRestore();
  });

  test('PCA payloads use canonical standardization and equal-axis-length controls while accepting legacy keys', () => {
    const component = window.Components?.pca;
    expect(component).toBeTruthy();
    expect(document.getElementById('pcaStandardizeVariables')).toBeTruthy();
    expect(document.getElementById('pcaScale')).toBeNull();

    const payload = component.getPayload();
    expect(payload.config.standardizeVariables).toBe(false);
    expect(payload.config.equalAxisLengths).toBe(true);
    delete payload.config.standardizeVariables;
    delete payload.config.equalAxisLengths;
    payload.config.scale = true;
    payload.config.equalScaleAxes = false;

    component.loadFromPayload(payload, {
      source: 'test-legacy-pca-control-migration',
      skipDraw: true
    });

    const equalAxisLengths = document.querySelector('#pcaPage .resizer-axeslength-checkbox--equal-scale');
    expect(document.getElementById('pcaStandardizeVariables').checked).toBe(true);
    expect(equalAxisLengths).toBeTruthy();
    expect(equalAxisLengths.checked).toBe(false);

    const migrated = component.getPayload();
    expect(migrated.config.standardizeVariables).toBe(true);
    expect(migrated.config.equalAxisLengths).toBe(false);
    expect(migrated.config).not.toHaveProperty('scale');
    expect(migrated.config).not.toHaveProperty('equalScaleAxes');

    const defaultedPayload = component.getPayload();
    delete defaultedPayload.config.equalAxisLengths;
    component.loadFromPayload(defaultedPayload, {
      source: 'test-missing-pca-equal-axis-length-default',
      skipDraw: true
    });
    expect(component.getPayload().config.equalAxisLengths).toBe(true);
  });

  test('grouped body edits do not rebuild AG Grid headers', async () => {
    const formatSelect = document.getElementById('pcaTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(12);

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Labels', true, false, true, false],
      ['Group', 'Control', '', 'Treated', ''],
      ['Sample', 'A', 'B', 'C', 'D'],
      ['Var1', 1, 2, 3, 4],
      ['Var2', 2, 3, 4, 5]
    ]);
    await flushAll(12);

    const updateSettingsSpy = jest.spyOn(hot, 'updateSettings');
    updateSettingsSpy.mockClear();
    hot.setDataAtCell?.(3, 2, 8);
    await flushAll(8);
    expect(updateSettingsSpy).not.toHaveBeenCalled();
    updateSettingsSpy.mockRestore();
  });

  test('grouped PCA styles resolve point over group and survive payload hydration', async () => {
    const component = window.Components?.pca;
    const hooks = component?.__testHooks;
    const formatSelect = document.getElementById('pcaTableFormat');
    const hot = component?.getHotInstance?.();
    expect(component).toBeTruthy();
    expect(hooks).toBeTruthy();
    expect(formatSelect).toBeTruthy();
    expect(hot).toBeTruthy();

    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    hot.loadData([
      ['Labels', true, false, false, false],
      ['Group', 'Control', '', 'Treated', ''],
      ['Sample', 'A', 'B', 'C', 'D'],
      ['Var1', 1, 2, 6, 7],
      ['Var2', 2, 4, 7, 9],
      ['Var3', 4, 3, 8, 6]
    ]);
    await flushAll(12);

    const groupMeta = hooks.resolveGroupMeta(4, ['A', 'B', 'C', 'D'], {
      columnIndices: [1, 2, 3, 4],
      groupHeaderRow: ['', 'Control', '', 'Treated', '']
    });
    hooks.applyPointStylePatch('group', '0', { fill: '#aa0000', shape: 'square', size: 6 }, {
      groupMeta,
      reason: 'test-group-style'
    });
    hooks.applyPointStylePatch('point', 'column:2', { fill: '#00aaff', size: 9 }, {
      groupMeta,
      reason: 'test-point-style'
    });

    expect(hooks.resolvePointStyle({ label: 'A', columnIndex: 1 }, 0, 0)).toEqual(expect.objectContaining({
      fill: '#aa0000', shape: 'square', size: 6
    }));
    expect(hooks.resolvePointStyle({ label: 'B', columnIndex: 2 }, 0, 1)).toEqual(expect.objectContaining({
      fill: '#00aaff', shape: 'square', size: 9
    }));

    const payload = component.getPayload();
    expect(payload.config.pointStyleScopes.groups['0']).toEqual(expect.objectContaining({
      fill: '#aa0000', shape: 'square', size: 6
    }));
    expect(payload.config.pointStyleScopes.points['column:2']).toEqual(expect.objectContaining({
      fill: '#00aaff', size: 9
    }));

    component.loadFromPayload(payload, {
      source: 'test-grouped-point-style-reopen',
      skipDraw: true
    });
    expect(hooks.resolvePointStyle({ label: 'A', columnIndex: 1 }, 0, 0)).toEqual(expect.objectContaining({
      fill: '#aa0000', shape: 'square', size: 6
    }));
    expect(hooks.resolvePointStyle({ label: 'B', columnIndex: 2 }, 0, 1)).toEqual(expect.objectContaining({
      fill: '#00aaff', shape: 'square', size: 9
    }));
  }, 180000);

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
    expect(JSON.stringify(payload.config?.stats?.summaryModel || {})).toContain('Samples analysed');
    expect(payload.config?.stats?.reportModel).toEqual(expect.objectContaining({
      kind: 'stats-report',
      title: 'Reporting and reproducibility'
    }));

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
    expect(JSON.stringify(payload.config?.stats?.summaryModel || {})).toContain('Samples analysed');
    expect(payload.config?.stats?.reportModel).toEqual(expect.objectContaining({
      kind: 'stats-report',
      title: 'Reporting and reproducibility'
    }));
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

  test('PCA payload restore keeps model-only summary stats', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const payload = window.Components.pca.getPayload();
    const summaryModel = payload.config?.stats?.summaryModel;
    expect(JSON.stringify(summaryModel || {})).toContain('Samples analysed');

    payload.config.stats = {
      summaryModel,
      reportModel: payload.config?.stats?.reportModel || null
    };

    document.getElementById('pcaStatsSummary').innerHTML = '';
    const reportHost = document.getElementById('pcaStatsReportHost');
    if(reportHost){
      reportHost.innerHTML = '';
    }

    window.Components.pca.loadFromPayload(payload, { source: 'test-model-summary-restore', skipDraw: true });
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
    const state = component.__state;
    expect(state).toBeTruthy();
    await flushUntil(() => !!state.cachedRender, { limit: 80, step: 2 });
    const cachedBefore = state.cachedRender;
    expect(cachedBefore).toBeTruthy();
    const screeContainer = document.getElementById('pcaScreeContainer');
    const screeExportControls = document.getElementById('pcaScreeExportControls');
    const screeVarianceRow = document.getElementById('pcaScreeVarianceRow');
    expect(screeContainer).toBeTruthy();
    expect(screeExportControls).toBeTruthy();
    expect(screeVarianceRow).toBeTruthy();

    const cache = component.captureRenderCache();
    expect(cache).toBeTruthy();
    expect(cache.runtimeCache).toBeTruthy();

    screeContainer.hidden = true;
    screeContainer.style.maxWidth = '';
    screeExportControls.style.display = 'none';
    screeVarianceRow.style.display = 'none';
    state.cachedRender = null;
    state.dataDirty = true;
    state.viewDirty = true;
    state.resizeWarmupPending = true;

    const restored = component.restoreRenderCache(cache);
    expect(restored).toBe(true);
    expect(screeContainer.hidden).toBe(false);
    expect(screeContainer.querySelector('svg')).toBeTruthy();
    expect(screeExportControls.style.display).not.toBe('none');
    expect(screeVarianceRow.style.display).toBe('flex');
    expect(state.cachedRender).toBeTruthy();
    expect(state.cachedRender).not.toBe(cachedBefore);
    expect(Array.isArray(state.cachedRender.points)).toBe(true);
    expect(state.cachedRender.points.length).toBe(cachedBefore.points.length);
    expect(state.dataDirty).toBe(false);
    expect(state.viewDirty).toBe(false);
    expect(state.resizeWarmupPending).toBe(false);
  }, 180000);

  test('PCA render cache restore rehydrates component selectors from owner analysis metadata', async () => {
    document.getElementById('pcaLoadExample').click();
    await flushUntil(() => !!window.Components?.pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const component = window.Components?.pca;
    const xAxis = document.getElementById('pcaXAxis');
    const yAxis = document.getElementById('pcaYAxis');
    expect(component).toBeTruthy();
    expect(xAxis).toBeTruthy();
    expect(yAxis).toBeTruthy();

    xAxis.value = '2';
    xAxis.dispatchEvent(new Event('change', { bubbles: true }));
    yAxis.value = '3';
    yAxis.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(12);

    const ownerSession = component.__testHooks.getSession();
    expect(ownerSession?.state?.state?.axisSelection).toEqual({ x: 2, y: 3, z: 1 });
    const cache = component.captureRenderCache();
    expect(cache?.runtimeCache?.dimensionMeta?.length).toBeGreaterThanOrEqual(3);

    xAxis.innerHTML = '<option value="1">PC1</option>';
    yAxis.innerHTML = '<option value="2">PC2</option>';
    xAxis.disabled = true;
    yAxis.disabled = true;
    xAxis.value = '1';
    yAxis.value = '2';

    expect(component.restoreRenderCache(cache)).toBe(true);
    expect(xAxis.disabled).toBe(false);
    expect(yAxis.disabled).toBe(false);
    expect(xAxis.options.length).toBeGreaterThanOrEqual(3);
    expect(yAxis.options.length).toBeGreaterThanOrEqual(3);
    expect(xAxis.value).toBe('2');
    expect(yAxis.value).toBe('3');
    expect(ownerSession?.state?.state?.axisSelection).toEqual({ x: 2, y: 3, z: 1 });
  }, 180000);

  test('user control refresh routes through the view-refresh suppression contract as userInitiated', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();
    await flushUntil(() => !!state.cachedRender, { limit: 80, step: 2 });

    // Reproduce the reopen window: stand in a real componentLifecycle so requestPcaViewRefresh
    // performs its suppression check. Pre-fix, the resize/style refresh path did not consult
    // shouldSuppressDraw at all (source 'pca-view-refresh' never appeared), so the post-restore
    // guard in the tab-scoped scheduler dropped the first user resize after reopen.
    const calls = [];
    const previousLifecycle = window.Shared.componentLifecycle;
    window.Shared.componentLifecycle = Object.assign({}, previousLifecycle, {
      shouldSuppressDraw: (componentKey, meta) => {
        calls.push({ componentKey, meta: meta || {} });
        return false;
      },
      emitLifecycleEvent: () => {}
    });
    try {
      const legendToggle = document.getElementById('pcaShowLegend');
      expect(legendToggle).toBeTruthy();
      legendToggle.checked = !legendToggle.checked;
      legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAll(5);

      const refreshCall = calls.find(
        entry => entry.componentKey === 'pca' && entry.meta.source === 'pca-view-refresh'
      );
      expect(refreshCall).toBeTruthy();
      expect(refreshCall.meta.reason).toBe('legend-toggle');
      expect(refreshCall.meta.userInitiated).toBe(true);
    } finally {
      window.Shared.componentLifecycle = previousLifecycle;
    }
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

    const initialSvd = global.__svdCallCount;
    const labelTimestamp = state.performance?.draw?.timestamp || 0;
    const currentLabel = hot.getDataAtCell(0, 1);
    const nextLabel = !([true, 1, '1', 'true', 'yes', 'on'].includes(
      typeof currentLabel === 'string' ? currentLabel.trim().toLowerCase() : currentLabel
    ));
    hot.setDataAtCell([[0, 1, nextLabel]], 'pca-point-label-toggle');
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > labelTimestamp, { limit: 80, step: 2 });

    expect(global.__svdCallCount).toBe(initialSvd);
    expect(state.performance?.draw?.viewOnly).toBe(true);
    expect(state.performance?.draw?.cacheReused).toBe(true);
    expect(state.performance?.draw?.computeMs).toBeLessThan(15);

    const originalValue = rows[1]?.[1] || '0';
    const replacement = originalValue === '0' ? '1' : '0';
    hot.setDataAtCell(1, 1, replacement);
    await flushAll(60);

    const updatedDrawPerf = state.performance?.draw;
    expect(updatedDrawPerf).toBeTruthy();
    expect((updatedDrawPerf?.timestamp || 0)).toBeGreaterThanOrEqual(initialDrawTimestamp);
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
    state.rotation = window.Shared.plot3d.createRotationState({
      x: rotationBefore.x + 0.2,
      y: rotationBefore.y,
      z: rotationBefore.z
    });
    state.rotationPending = true;
    state.viewDirty = true;
    state.scheduleDraw({ viewOnly: true, reason: 'rotation-test' });
    await waitForDraw();
    expectViewOnlyRefresh('rotation-test');
    expect(state.rotation.x).not.toBe(rotationBefore.x);
    expect(state.rotationPending).toBe(false);
  });

  test('3D render cache restore rebuilds the owner renderer before controls', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushUntil(() => !!window.Components?.pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const component = window.Components?.pca;
    const viewSelect = document.getElementById('pcaViewMode');
    expect(component).toBeTruthy();
    expect(viewSelect).toBeTruthy();

    viewSelect.value = '3d';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUntil(() => {
      const svg = document.querySelector('#pcaPlot #pcaSvg');
      const tabId = window.Main?.session?.getActiveTab?.()?.id || null;
      const session = component.__testHooks?.getSession?.(tabId) || null;
      return svg?.dataset?.viewMode === '3d'
        && svg.dataset?.rotationControlsAttached === 'true'
        && session?.refs?.svg === svg
        && typeof session?.refs?.rotationRenderer === 'function';
    }, { limit: 100, step: 2 });

    const tabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const session = component.__testHooks?.getSession?.(tabId) || null;
    const originalSvg = document.querySelector('#pcaPlot #pcaSvg');
    const originalRenderer = session?.refs?.rotationRenderer;
    expect(session).toBeTruthy();
    expect(originalSvg).toBeTruthy();
    expect(typeof originalRenderer).toBe('function');

    const cache = component.captureRenderCache();
    expect(cache).toBeTruthy();
    expect(cache.rotationModel).toEqual(expect.objectContaining({
      version: 1,
      points: expect.any(Array)
    }));
    expect(cache.rotationModel.points.length).toBeGreaterThan(0);
    expect(() => JSON.stringify(cache.rotationModel)).not.toThrow();

    session.refs.rotationRenderer = null;
    delete session.cache.pca3dRotationModel;

    expect(component.restoreRenderCache(cache)).toBe(true);
    const restoredSvg = document.querySelector('#pcaPlot #pcaSvg');
    expect(restoredSvg).toBe(originalSvg);
    expect(session.refs.svg).toBe(restoredSvg);
    expect(typeof session.refs.rotationRenderer).toBe('function');
    expect(session.refs.rotationRenderer).not.toBe(originalRenderer);
    expect(restoredSvg.dataset.rotationControlsAttached).toBe('true');

    const beforeMarkup = restoredSvg.querySelector('[data-layer="pca-3d-rotation-dynamic"]')?.innerHTML || '';
    const nextRotation = window.Shared.plot3d.createRotationState({
      x: Number(session.state?.viewState?.rotation?.x || 0) + 0.15,
      y: Number(session.state?.viewState?.rotation?.y || 0) + 0.1,
      z: Number(session.state?.viewState?.rotation?.z || 0)
    });
    expect(session.refs.rotationRenderer(nextRotation)).toBe(true);
    const afterMarkup = restoredSvg.querySelector('[data-layer="pca-3d-rotation-dynamic"]')?.innerHTML || '';
    expect(afterMarkup).not.toBe(beforeMarkup);
  }, 180000);

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

  test('point-label metadata updates reuse the tab-owned PCA geometry', async () => {
    document.getElementById('pcaLoadExample').click();
    const state = window.Components?.pca?.__state;
    await flushUntil(() => !!state?.cachedRender, { limit: 80, step: 2 });

    const hot = window.Components?.pca?.getHotInstance?.();
    const initialSvd = global.__svdCallCount;
    const initialTimestamp = state.performance?.draw?.timestamp || 0;
    const current = hot.getDataAtCell(0, 1);
    const next = !([true, 1, '1', 'true', 'yes', 'on'].includes(
      typeof current === 'string' ? current.trim().toLowerCase() : current
    ));
    hot.setDataAtCell([[0, 1, next]], 'pca-point-label-toggle');
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > initialTimestamp, { limit: 80, step: 2 });

    expect(global.__svdCallCount).toBe(initialSvd);
    expect(state.dataDirty).toBe(false);
    expect(state.performance?.draw?.viewOnly).toBe(true);
    expect(state.performance?.draw?.cacheReused).toBe(true);
    expect(state.cachedRender?.points?.find(point => point.columnIndex === 1)?.isManualLabel).toBe(next);
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
  test('matches DESeq2 median-ratio size factors for proportional count profiles', () => {
    const hooks = window.Components?.pca?.__testHooks;
    expect(hooks).toBeTruthy();
    const result = hooks.calculateMedianRatioSizeFactors([
      [10, 20, 40],
      [20, 40, 80],
      [5, 10, 20]
    ]);
    expect(result.eligibleFeatureCount).toBe(3);
    expect(result.sizeFactors[0]).toBeCloseTo(1, 12);
    expect(result.sizeFactors[1]).toBeCloseTo(2, 12);
    expect(result.sizeFactors[2]).toBeCloseTo(0.5, 12);
  });

  test('matches DESeq2 ratio normalization by excluding genes containing any zero', () => {
    const hooks = window.Components?.pca?.__testHooks;
    const result = hooks.calculateMedianRatioSizeFactors([
      [10, 0, 40],
      [20, 5, 80],
      [5, 10, 20]
    ]);
    expect(result.eligibleFeatureCount).toBe(2);
    expect(result.sizeFactors[0]).toBeCloseTo(1, 12);
    expect(result.sizeFactors[1]).toBeCloseTo(2, 12);
    expect(result.sizeFactors[2]).toBeCloseTo(0.5, 12);
  });

  test('normalizes, log-transforms, and deterministically retains the most variable genes', () => {
    const hooks = window.Components?.pca?.__testHooks;
    const result = hooks.preprocessRnaSeqCounts([
      [10, 10, 10, 10],
      [10, 20, 10, 40],
      [10, 40, 10, 160]
    ], ['stable-a', 'variable-b', 'stable-c', 'variable-d'], { topFeatureLimit: 2 });
    expect(result.metadata.selectedFeatureCount).toBe(2);
    expect(result.featureLabels).toEqual(['variable-d', 'variable-b']);
    expect(result.matrix).toHaveLength(3);
    expect(result.matrix.every(row => row.length === 2)).toBe(true);
  });

  test('RNA-seq preprocessing creates an active filtered-gene AG Grid tab and preserves it in payload', async () => {
    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();
    const raw = [
      ['Label point', true, false, false],
      ['Variable', 'S1', 'S2', 'S3']
    ];
    for (let gene = 0; gene < 501; gene += 1) {
      raw.push([
        `gene-${gene + 1}`,
        gene + 10,
        (gene + 10) * ((gene % 3) + 1),
        (gene + 10) * ((gene % 5) + 1)
      ]);
    }
    hot.loadData(raw);
    hot.applyExclusions({ rows: [], cols: [3], cells: [] }, { silent: true });
    await flushAll(8);

    const preprocessing = document.getElementById('pcaPreprocessing');
    expect(preprocessing).toBeTruthy();
    preprocessing.value = 'rna-seq-normalized-log';
    preprocessing.dispatchEvent(new Event('change', { bubbles: true }));

    await flushUntil(() => {
      const manager = hot.__pcaDataViewsManager;
      return manager?.getActiveView?.()?.transformSpec?.type === 'rnaSeqNormalizedLog';
    }, { limit: 100, step: 2 });

    const manager = hot.__pcaDataViewsManager;
    const activeView = manager.getActiveView();
    expect(manager.getViewCount()).toBe(2);
    expect(activeView.title).toBe('RNA-seq log (filtered genes)');
    expect(activeView.data).toHaveLength(502);
    expect(activeView.data.slice(2).every(row => row.slice(1, 4).every(Number.isFinite))).toBe(true);
    expect(activeView.exclusions).toEqual({ rows: [], cols: [3], cells: [] });
    expect(document.querySelectorAll('#pcaHotWrapper .data-view-tabs__tab')).toHaveLength(2);

    manager.activateView('raw', { reason: 'tab-click' });
    expect(document.getElementById('pcaPreprocessing').value).toBe('none');
    manager.activateView(activeView.id, { reason: 'tab-click' });
    expect(document.getElementById('pcaPreprocessing').value).toBe('rna-seq-normalized-log');

    const payload = window.Components.pca.getPayload();
    expect(payload.data).toHaveLength(503);
    expect(payload.dataViews.views).toHaveLength(2);
    expect(payload.activeDataViewId).toBe(activeView.id);

    window.Components.pca.loadFromPayload(payload, { skipDraw: true });
    const restoredManager = window.Components.pca.getHotInstance().__pcaDataViewsManager;
    expect(restoredManager.getActiveView().transformSpec.type).toBe('rnaSeqNormalizedLog');
    expect(restoredManager.getActiveView().data).toHaveLength(502);
    expect(document.getElementById('pcaPreprocessing').value).toBe('rna-seq-normalized-log');
  });

  test('migrates legacy RNA-seq preprocessing payloads to a materialized DataView', () => {
    window.Components.pca.loadFromPayload({
      type: 'pca',
      data: [
        ['Label point', true, false, false],
        ['Variable', 'S1', 'S2', 'S3'],
        ['g1', 10, 20, 40],
        ['g2', 20, 20, 20],
        ['g3', 10, 40, 160]
      ],
      config: {
        method: 'pca',
        tableFormat: 'standard',
        preprocessing: 'rna-seq-normalized-log'
      }
    }, { skipDraw: true });

    const manager = window.Components.pca.getHotInstance().__pcaDataViewsManager;
    expect(manager.getViewCount()).toBe(2);
    expect(manager.getActiveView().transformSpec.type).toBe('rnaSeqNormalizedLog');
    expect(manager.getActiveView().data).toHaveLength(5);
  });

  test('rejects non-integer and negative raw counts', () => {
    const hooks = window.Components?.pca?.__testHooks;
    expect(() => hooks.preprocessRnaSeqCounts([[1, 2], [1.5, 3]], ['a', 'b']))
      .toThrow(/non-negative integer raw counts/i);
    expect(() => hooks.preprocessRnaSeqCounts([[1, 2], [-1, 3]], ['a', 'b']))
      .toThrow(/non-negative integer raw counts/i);
  });

  test('PCA axis-length presentation pads ranges without rescaling the coordinate metric', () => {
    const hooks = window.Components?.pca?.__testHooks;
    expect(hooks).toBeTruthy();

    const equal2d = hooks.resolve2dMetricScales(
      { min: -4, max: 2, ticks: [-4, -2, 0, 2], step: 2 },
      { min: -4, max: 4, ticks: [-4, -2, 0, 2, 4], step: 2 },
      true
    );
    expect(equal2d.x.max - equal2d.x.min).toBeCloseTo(8, 12);
    expect(equal2d.y.max - equal2d.y.min).toBeCloseTo(8, 12);
    expect(equal2d.x.ticks).toEqual([-4, -2, 0, 2]);
    expect(equal2d.y.ticks).toEqual([-4, -2, 0, 2, 4]);

    const natural2d = hooks.resolve2dMetricScales(
      { min: -4, max: 2, ticks: [-4, -2, 0, 2], step: 2 },
      { min: -4, max: 4, ticks: [-4, -2, 0, 2, 4], step: 2 },
      false
    );
    expect(natural2d.x).toMatchObject({ min: -4, max: 2 });
    expect(natural2d.y).toMatchObject({ min: -4, max: 4 });

    const source3d = {
      x: { min: -3, max: 5 },
      y: { min: -2, max: 2 },
      z: { min: -1, max: 2 }
    };
    const equal3d = hooks.resolve3dMetricRanges(source3d, true);
    const equalSpans = ['x', 'y', 'z'].map(axis => equal3d[axis].max - equal3d[axis].min);
    expect(Math.max(...equalSpans) - Math.min(...equalSpans)).toBeLessThan(1e-12);

    const natural3d = hooks.resolve3dMetricRanges(source3d, false);
    expect(natural3d).toEqual(source3d);
  });

  test('PCA metric layout exposes the final plotted dimensions used for tick-density decisions', () => {
    const hooks = window.Components?.pca?.__testHooks;
    expect(hooks).toBeTruthy();

    const margin = { top: 40, right: 40, bottom: 60, left: 80 };
    const layout = hooks.resolve2dMetricLayout(427, 300, margin,
      { min: -1, max: 1, ticks: [-1, 0, 1], step: 1 },
      { min: -0.5, max: 0.5, ticks: [-0.5, 0, 0.5], step: 0.5 },
      false
    );

    expect(layout.spanX).toBeCloseTo(2, 12);
    expect(layout.spanY).toBeCloseTo(1, 12);
    expect(layout.plotH).toBeCloseTo(200, 12);
    expect(layout.plotW).toBeCloseTo(400, 12);
    expect(layout.plotW / layout.plotH).toBeCloseTo(2, 12);
    expect(layout.plotW).toBeGreaterThan(427 - margin.left - margin.right);
    expect(layout.rightExtension).toBeGreaterThan(0);
  });

  test('PCA axis-length transaction solves the final metric frame in one pass', () => {
    const hooks = window.Components?.pca?.__testHooks;
    expect(hooks).toBeTruthy();

    // Geometry from the resize path that previously needed a visible second
    // correction: 318 px outer frame, 229 px PCA canvas, 278.33 x 139.17 px
    // metric axes (2:1). A 230 px X request therefore requires 115 px on Y.
    const plan = hooks.compute2dAxisLengthResizePlan({
      axis: 'x',
      requestedLength: 230,
      currentX: 278.3343684043447,
      currentY: 139.16718420217234,
      boxHeight: 318,
      svgHeight: 229,
      baseHeight: 229,
      plotHeight: 139.16718420217234,
      marginTop: 40,
      marginBottom: 49.83281579782766,
      frameAspect: 1
    });

    expect(plan).toBeTruthy();
    expect(plan.metricAspect).toBeCloseTo(2, 12);
    expect(plan.targetPhysicalY).toBeCloseTo(115, 12);
    expect(plan.targetInternalPlotHeight).toBeCloseTo(115, 12);
    expect(plan.targetBaseHeight).toBeCloseTo(204.83281579782766, 12);
    expect(plan.width).toBeCloseTo(plan.height, 12);
    expect(plan.height).toBeCloseTo(293.83281579782766, 12);

    const lockedPlotHeight = plan.targetBaseHeight - 40 - 49.83281579782766;
    expect(lockedPlotHeight).toBeCloseTo(115, 12);
    expect(lockedPlotHeight * plan.metricAspect).toBeCloseTo(230, 12);
  });

  test('PCA biplot uses the selected component pair and preserves metric geometry', () => {
    const hooks = window.Components?.pca?.__testHooks;
    expect(hooks).toBeTruthy();
    const snapshot = hooks.buildBiplotSnapshot(
      [{ x: 1, y: 2, label: 'S1' }],
      [
        ...Array.from({ length: 9 }, (_, index) => ({
          label: `PC1-PC2-${index + 1}`,
          values: [10 - index * 0.2, 9 - index * 0.2, 0.01, -0.01]
        })),
        { label: 'PC3-PC4-target', values: [0.01, 0.02, 0.9, -0.8] }
      ],
      { x: 'PC3', y: 'PC4' },
      { x: 2, y: 3 }
    );
    expect(snapshot.selectedAxes).toEqual({ x: 2, y: 3 });
    expect(snapshot.vectors).toHaveLength(8);
    const selectedAxisTarget = snapshot.vectors.find(vector => vector.label === 'PC3-PC4-target');
    expect(selectedAxisTarget).toBeTruthy();
    expect(Math.sign(selectedAxisTarget.x)).toBe(1);
    expect(Math.sign(selectedAxisTarget.y)).toBe(-1);
    expect(snapshot.vectorScaleNote).toMatch(/uniformly rescaled/i);

    const svg = hooks.createMiniScatterSvg({
      points: snapshot.points,
      scalePoints: snapshot.points,
      vectors: snapshot.vectors,
      xLabel: snapshot.xLabel,
      yLabel: snapshot.yLabel
    });
    const lines = Array.from(svg.querySelectorAll('line'));
    const xAxis = lines[0];
    const yAxis = lines[1];
    const xLength = Math.abs(Number(xAxis.getAttribute('x2')) - Number(xAxis.getAttribute('x1')));
    const yLength = Math.abs(Number(yAxis.getAttribute('y2')) - Number(yAxis.getAttribute('y1')));
    expect(xLength).toBeCloseTo(yLength, 8);
  });

});
