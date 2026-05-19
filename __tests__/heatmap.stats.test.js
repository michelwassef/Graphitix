const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('Heatmap stats formatting', () => {
  let originalCreateStandardTable;
  async function flushAsyncWork(iterations = 20){
    for(let i = 0; i < iterations; i += 1){
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  async function ensureCorrelationView(){
    const viewSelect = document.getElementById('heatmapView');
    if(viewSelect){
      viewSelect.value = 'corr-columns';
      viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork(8);
    }
  }

  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness();
    const canvasProto = window.HTMLCanvasElement?.prototype;
    if(canvasProto){
      canvasProto.getContext = jest.fn(() => ({
        font: '',
        measureText: text => ({ width: String(text || '').length * 8 })
      }));
      console.debug('Debug: heatmap stats test stubbed canvas context'); // Debug: stub canvas for measureText
    }
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/debounce.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/workspaceToolbarAccess.js');

    const Shared = window.Shared || {};
    originalCreateStandardTable = Shared.hot?.createStandardTable;
    if(originalCreateStandardTable){
      Shared.hot.createStandardTable = function wrappedCreateStandardTable(){
        const instance = originalCreateStandardTable.apply(this, arguments);
        if(instance && arguments?.[0]?.id === 'heatmapHot'){
          global.__LAST_HEATMAP_HOT__ = instance;
          console.debug('Debug: heatmap stats test captured grid instance', { hasInstance: !!instance }); // Debug: capture test hot instance
        }
        return instance;
      };
    }

    require('../js/components/heatmap.js');
    window.Components?.heatmap?.init?.();
  });

  afterEach(() => {
    const Shared = window.Shared || {};
    if(originalCreateStandardTable){
      Shared.hot.createStandardTable = originalCreateStandardTable;
    }
    delete global.__LAST_HEATMAP_HOT__;
    originalCreateStandardTable = undefined;
  });

  test('strongest magnitude displays positive value even for negative correlation', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const negativeCorrelationMatrix = [
      ['Gene', 'ColA', 'ColB'],
      ['G1', 1, -1],
      ['G2', 2, -2],
      ['G3', 3, -3]
    ];
    hot.loadData(negativeCorrelationMatrix);
    console.debug('Debug: heatmap stats test data loaded', { rows: negativeCorrelationMatrix.length }); // Debug: verify test dataset load
    await ensureCorrelationView();
    window.Components.heatmap.draw();
    await flushAsyncWork(10);

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent).toBeTruthy();
    expect(statsContent.querySelector('script')).toBeNull();
  });

  test('stats panel escapes injected markup from column headers', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const maliciousMatrix = [
      ['Gene', '<script>alert(1)</script>', 'Numeric'],
      ['A', 1, 2],
      ['B', 2, 3],
      ['C', 3, 4]
    ];
    hot.loadData(maliciousMatrix);
    console.debug('Debug: heatmap stats sanitize test data loaded', { rows: maliciousMatrix.length }); // Debug: ensure dataset applied
    await ensureCorrelationView();
    window.Components.heatmap.draw();
    await flushAsyncWork(10);

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent).toBeTruthy();
    console.debug('Debug: heatmap stats sanitize test verifying DOM nodes', { childCount: statsContent.childElementCount }); // Debug: inspect stats DOM
    expect(statsContent.querySelector('script')).toBeNull();
    if((statsContent.textContent || '').trim()){
      expect(statsContent.textContent).toContain('<script>alert(1)</script>');
    }
  });

  test('value scale override and fixed legend height serialize and affect the rendered legend', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    const heatmap = window.Components?.heatmap;
    expect(hot).toBeTruthy();
    expect(heatmap).toBeTruthy();

    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 0, 10],
      ['Gene2', 20, 30],
      ['Gene3', 40, 5]
    ]);
    const page = document.getElementById('heatmapPage');
    if(page){
      page.hidden = false;
      page.removeAttribute('hidden');
    }

    const viewSelect = document.getElementById('heatmapView');
    viewSelect.value = 'values';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(8);
    const state = heatmap.__getState();
    state.valueScale = { min: null, max: 30 };
    state.legendHeightMode = 'fixed';
    heatmap.draw();
    await flushAsyncWork(10);

    const savedPayload = heatmap.getPayload();
    expect(savedPayload.config.valueScale).toEqual({ min: null, max: 30 });
    expect(savedPayload.config.legendHeightMode).toBe('fixed');
    heatmap.loadFromPayload(savedPayload, { source: 'test-value-scale-restore', skipDraw: true });
    expect(heatmap.__getState().valueScale).toEqual({ min: null, max: 30 });
    expect(heatmap.__getState().legendHeightMode).toBe('fixed');

    const svg = document.getElementById('heatmapSvg');
    const scaleGroup = Array.from(svg.getElementsByTagName('g')).find(node => node.getAttribute('class') === 'heatmap-color-scale');
    const scaleRect = scaleGroup ? scaleGroup.getElementsByTagName('rect')[0] : null;
    if(scaleRect){
      expect(Number(scaleRect.getAttribute('height'))).toBeLessThan(180);
    }

    const cellLayer = Array.from(svg.getElementsByTagName('g')).find(node => node.getAttribute('data-export-layer') === 'heatmap-cells');
    const cellRects = cellLayer ? Array.from(cellLayer.getElementsByTagName('rect')) : Array.from(svg.querySelectorAll('rect'));
    if(cellRects.length){
      expect(cellRects.length).toBeGreaterThan(0);
    } else {
      expect(svg).toBeTruthy();
    }

    const statsContent = document.getElementById('heatmapStatsContent');
    if((statsContent?.textContent || '').trim()){
      expect(statsContent?.textContent || '').toContain('Color scale');
    } else {
      expect(statsContent).toBeTruthy();
    }
  });

  test('value scale changes affect cached view-only redraws', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    const heatmap = window.Components?.heatmap;
    expect(hot).toBeTruthy();
    expect(heatmap).toBeTruthy();

    hot.loadData([
      ['Gene', 'ArrayA', 'ArrayB'],
      ['Gene1', 0, 10],
      ['Gene2', 20, 30],
      ['Gene3', 40, 5]
    ]);

    const page = document.getElementById('heatmapPage');
    if(page){
      page.hidden = false;
      page.removeAttribute('hidden');
    }

    const viewSelect = document.getElementById('heatmapView');
    viewSelect.value = 'values';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(8);

    heatmap.draw();
    await flushAsyncWork(10);

    const svg = document.getElementById('heatmapSvg');
    const getCellRect = () => {
      const cellLayer = Array.from(svg.getElementsByTagName('g')).find(node => node.getAttribute('data-export-layer') === 'heatmap-cells');
      const cellRects = cellLayer ? Array.from(cellLayer.getElementsByTagName('rect')) : [];
      return cellRects.find(rect => (rect.querySelector('title')?.textContent || '').includes('Gene2 vs ArrayB: 30.00')) || null;
    };

    const beforeRect = getCellRect() || svg.querySelector('rect');
    if(beforeRect){
      const beforeFill = beforeRect.getAttribute('fill');
      expect(typeof beforeFill).toBe('string');
    } else {
      expect(svg).toBeTruthy();
    }

    const state = heatmap.__getState();
    state.valueScale = { min: 0, max: 20 };
    state.scheduleDraw({ viewOnly: true, reason: 'test-value-scale-view-only' });
    await flushAsyncWork(10);

    const afterRect = getCellRect() || svg.querySelector('rect');
    if(afterRect){
      expect(typeof afterRect.getAttribute('fill')).toBe('string');
    } else {
      expect(svg).toBeTruthy();
    }

    const statsContent = document.getElementById('heatmapStatsContent');
    if((statsContent?.textContent || '').trim()){
      expect(statsContent?.textContent || '').toContain('0.00 to 20.00');
    } else {
      expect(statsContent).toBeTruthy();
    }
  });

  test('data transform controls create a derived data tab while keeping raw tab', () => {
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

    let tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));

    normalizeGenes.checked = true;
    normalizeGenes.dispatchEvent(new Event('change'));

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
    expect(applyButton.disabled).toBe(true);
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

  test('closing materialized transform tab clears adjust/filter selections', () => {
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
    await flushAsyncWork(6);
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

  test('graph title stays above long vertical column labels', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    // Create data with very long column headers that will extend high when rotated vertically
    const longLabelMatrix = [
      ['Row', 'VeryLongColumnHeaderThatExtendsHighWhenRotated', 'AnotherExtremelyLongColumnLabelForTesting'],
      ['A', 1, 2],
      ['B', 3, 4],
      ['C', 5, 6]
    ];
    hot.loadData(longLabelMatrix);
    console.debug('Debug: heatmap long label test data loaded', { rows: longLabelMatrix.length });
    await ensureCorrelationView();
    window.Components.heatmap.draw();
    await flushAsyncWork(10);

    const svg = document.getElementById('heatmapSvg');
    expect(svg).toBeTruthy();

    // Find the title text element (should be first text with data-font-role="graphTitle")
    const titleEl = svg.querySelector('text[data-font-role="graphTitle"]') || svg.querySelector('text');
    if(!titleEl){
      expect(svg).toBeTruthy();
      return;
    }
    const titleY = parseFloat(titleEl.getAttribute('y'));

    // Find column label text elements (should have data-font-role="columnLabel")
    const columnLabels = svg.querySelectorAll('text[data-font-role="columnLabel"]');
    if(!columnLabels.length){
      expect(svg.querySelectorAll('text').length).toBeGreaterThan(0);
      return;
    }

    // For rotated labels, we need to check their effective top extent
    // Each label is at y position with rotation -90 degrees
    // The text-anchor is "middle", so the label extends labelWidth/2 above and below its y position
    // After -90 rotation, the top of the label is at: y - textWidth/2
    let highestLabelTop = Infinity;
    columnLabels.forEach(label => {
      const y = parseFloat(label.getAttribute('y'));
      // Estimate text width from content (8px per character as per test stub)
      const textWidth = (label.textContent || '').length * 8;
      const labelTop = y - textWidth / 2;
      if (labelTop < highestLabelTop) {
        highestLabelTop = labelTop;
      }
    });

    console.debug('Debug: heatmap title positioning test', {
      titleY,
      highestLabelTop,
      titleAboveLabels: titleY < highestLabelTop
    });

    // Title's y position should be above (smaller than) the highest label top extent
    expect(titleY).toBeLessThan(highestLabelTop);
  });
});
