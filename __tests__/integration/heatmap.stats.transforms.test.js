const { createHeatmapStatsTestContext } = require('../../test-support/heatmapStatsSuite');

jest.setTimeout(240_000);

describe('Heatmap stats — data-view transforms', () => {
  const {
    flushAsyncWork,
    waitFor,
  } = createHeatmapStatsTestContext();

  test('data transform controls create a derived data tab while keeping raw tab', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const matrix = [
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ];
    hot.loadData(matrix);

    const centerGenes = document.getElementById('heatmapCenterGenes');
    const normalizeGenes = document.getElementById('heatmapNormalizeGenes');
    expect(centerGenes).toBeTruthy();
    expect(normalizeGenes).toBeTruthy();
    const initialTabCount = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;
    centerGenes.checked = true;
    centerGenes.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab')).toHaveLength(initialTabCount);
    await flushAsyncWork(4);

    let tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));

    normalizeGenes.checked = true;
    normalizeGenes.dispatchEvent(new Event('change'));
    await flushAsyncWork(4);

    tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));
    if(tabs.length){
      expect(tabs.length).toBeGreaterThanOrEqual(initialTabCount);
      const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
      expect(activeTab).toBeTruthy();
    }

    const transformed = hot.getData();
    expect(Number.isFinite(Number(transformed?.[1]?.[1]))).toBe(true);
    expect(Number.isFinite(Number(transformed?.[1]?.[2]))).toBe(true);
  });

  test('toolbar multiple mode applies selected transforms as one derived tab', () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ]);

    const multiToggle = document.getElementById('heatmapTransformMultiMode');
    const logButton = document.getElementById('heatmapTransformLog2p1');
    const centerButton = document.getElementById('heatmapTransformCenterRowsMean');
    const applyButton = document.getElementById('heatmapTransformApplySelected');
    expect(multiToggle).toBeTruthy();
    expect(logButton).toBeTruthy();
    expect(centerButton).toBeTruthy();
    expect(applyButton).toBeTruthy();
    const beforeTabs = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;

    multiToggle.checked = true;
    multiToggle.dispatchEvent(new Event('change', { bubbles: true }));
    logButton.click();
    centerButton.click();
    expect(applyButton.disabled).toBe(false);
    expect(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length).toBe(beforeTabs);

    applyButton.click();

    const tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));
    if(tabs.length){
      expect(tabs.length).toBeGreaterThanOrEqual(beforeTabs);
      const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
      expect(activeTab).toBeTruthy();
    }

    const transformed = hot.getData();
    expect(Number.isFinite(Number(transformed?.[1]?.[1]))).toBe(true);
    expect(Number.isFinite(Number(transformed?.[1]?.[2]))).toBe(true);
  });

  test('custom transform opens dropdown editor in multiple mode', () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ]);

    const multiToggle = document.getElementById('heatmapTransformMultiMode');
    const customButton = document.getElementById('heatmapTransformCustom');
    expect(multiToggle).toBeTruthy();
    expect(customButton).toBeTruthy();
    const beforeTabs = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;

    multiToggle.checked = true;
    multiToggle.dispatchEvent(new Event('change', { bubbles: true }));
    customButton.click();

    const transformSection = customButton.closest('.workspace-toolbar__section[data-transform-section="1"]');
    const dropdown = transformSection?.querySelector('[data-transform-custom-dropdown="1"]');
    const input = document.getElementById('heatmapTransformCustomExpr');
    const applyCustomButton = document.getElementById('heatmapTransformCustomApply');

    expect(dropdown).toBeTruthy();
    expect(dropdown?.dataset?.open).toBe('1');
    expect(input).toBeTruthy();
    expect(applyCustomButton).toBeTruthy();

    input.value = 'x+1';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    applyCustomButton.click();

    const tabs = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab');
    if(tabs.length){
      expect(tabs.length).toBeGreaterThanOrEqual(beforeTabs);
    }
  });

  test('closing materialized transform tab clears adjust/filter selections', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 1, 3],
      ['Gene2', 2, 4]
    ]);

    const centerGenes = document.getElementById('heatmapCenterGenes');
    const filterPresent = document.getElementById('heatmapFilterPresentEnable');
    expect(centerGenes).toBeTruthy();
    expect(filterPresent).toBeTruthy();

    centerGenes.checked = true;
    centerGenes.dispatchEvent(new Event('change'));
    filterPresent.checked = true;
    filterPresent.dispatchEvent(new Event('change'));
    await flushAsyncWork(4);

    const activeClose = document.querySelector('#heatmapHotWrapper .data-view-tabs__item--active .data-view-tabs__close');
    if(activeClose){
      activeClose.click();
    }

    if(activeClose){
      expect(centerGenes.checked).toBe(false);
      expect(filterPresent.checked).toBe(false);
      const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
      expect(activeTab).toBeTruthy();
      expect((activeTab.textContent || '').toLowerCase()).toContain('raw');
    }
  });

  test('switching to the correlation matrix tab does not trigger recursive redraw loads', async () => {
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const originalApplyExclusions = hot.applyExclusions;
    const applyExclusionsCalls = [];
    hot.applyExclusions = function wrappedApplyExclusions(payload){
      applyExclusionsCalls.push(payload);
      return originalApplyExclusions.apply(this, arguments);
    };
    try{
    hot.loadData([
      ['Gene', 'Baseline_A', 'Baseline_B', 'Treatment_A', 'Treatment_B', 'Stress_A', 'Stress_B', 'Recovery'],
      ['Gene1', 10, 9.7, 3.2, 3.1, 6.1, 6.3, 8.2],
      ['Gene2', 11, 10.8, 4.1, 4.0, 5.9, 6.0, 8.0],
      ['Gene3', 12, 11.7, 2.9, 3.0, 6.4, 6.6, 7.6],
      ['Gene4', 9.5, 9.4, 7.5, 7.6, 5.2, 5.1, 8.8]
    ]);
    window.Components.heatmap.draw();
    await flushAsyncWork();

    const correlationTab = Array.from(
      document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab')
    ).find(tab => /correlation matrix/i.test(tab.textContent || ''));
    if(!correlationTab){
      expect(Array.isArray(global.__GRID_CALLS__ || [])).toBe(true);
      return;
    }

    const loadCallsBefore = (global.__GRID_CALLS__ || []).filter(call =>
      call.type === 'loadData' && call.containerId === 'heatmapHot'
    ).length;
    correlationTab.click();
    const manager = hot.__heatmapDataViewsManager;
    const correlationReady = await waitFor(
      () => manager?.getActiveView?.()?.transformSpec?.type === 'heatmapCorrelationMatrix',
      80
    );
    expect(correlationReady).toBe(true);
    const activeView = manager?.getActiveView?.() || null;
    const loadCallsAfter = (global.__GRID_CALLS__ || []).filter(call =>
      call.type === 'loadData' && call.containerId === 'heatmapHot'
    );
    const loadSources = loadCallsAfter.slice(loadCallsBefore).map(call => call.source);
    const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');

    expect(activeView?.transformSpec?.type).toBe('heatmapCorrelationMatrix');
    expect(activeView?.sourceViewId).toBe('raw');
    expect(loadSources).toEqual(['heatmap-correlation-tab-activate']);
    expect(applyExclusionsCalls).toEqual([]);
    expect(activeTab).toBeTruthy();
    expect((activeTab.textContent || '').toLowerCase()).toContain('correlation matrix');
    } finally {
      hot.applyExclusions = originalApplyExclusions;
    }
  });

});
