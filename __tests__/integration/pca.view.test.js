const { createPcaViewTestContext } = require('../../test-support/pcaViewTestSuite');

jest.setTimeout(30000);

describe('PCA view controls — ownership and table state', () => {
  const {
    flushAll,
  } = createPcaViewTestContext();

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

});
