describe('Heatmap stats formatting', () => {
  let originalCreateStandardTable;

  beforeEach(() => {
    jest.resetModules();
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

  test('strongest magnitude displays positive value even for negative correlation', () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const negativeCorrelationMatrix = [
      ['ColA', 'ColB'],
      [1, -1],
      [2, -2],
      [3, -3]
    ];
    hot.loadData(negativeCorrelationMatrix);
    console.debug('Debug: heatmap stats test data loaded', { rows: negativeCorrelationMatrix.length }); // Debug: verify test dataset load
    window.Components.heatmap.draw();

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent).toBeTruthy();
    const rows = Array.from(statsContent.querySelectorAll('div'));
    const strongestRow = rows.find(row => row.textContent.startsWith('Strongest |r|'));
    expect(strongestRow).toBeTruthy();
    expect(strongestRow.querySelector('strong')?.textContent).toBe('ColA vs ColB');
    expect(strongestRow.textContent).toContain('= 1.00');
    expect(strongestRow.textContent).toContain('raw r = -1.00');
  });

  test('stats panel escapes injected markup from column headers', () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    expect(hot).toBeTruthy();
    const maliciousMatrix = [
      ['<script>alert(1)</script>', 'Numeric'],
      [1, 2],
      [2, 3],
      [3, 4]
    ];
    hot.loadData(maliciousMatrix);
    console.debug('Debug: heatmap stats sanitize test data loaded', { rows: maliciousMatrix.length }); // Debug: ensure dataset applied
    window.Components.heatmap.draw();

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent).toBeTruthy();
    console.debug('Debug: heatmap stats sanitize test verifying DOM nodes', { childCount: statsContent.childElementCount }); // Debug: inspect stats DOM
    expect(statsContent.querySelector('script')).toBeNull();
    expect(statsContent.textContent).toContain('<script>alert(1)</script>');
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
    centerGenes.checked = true;
    centerGenes.dispatchEvent(new Event('change'));

    let tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));
    expect(tabs.length).toBe(2);
    expect(tabs[0]?.textContent?.trim()?.toLowerCase()).toContain('raw');
    expect(tabs[1]?.textContent || '').toMatch(/center rows/i);

    normalizeGenes.checked = true;
    normalizeGenes.dispatchEvent(new Event('change'));

    tabs = Array.from(document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab'));
    expect(tabs.length).toBe(2);

    const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
    expect(activeTab).toBeTruthy();
    expect(activeTab.textContent).toMatch(/normalize rows/i);

    const transformed = hot.getData();
    expect(Number(transformed?.[1]?.[1])).toBeCloseTo(-0.707106, 5);
    expect(Number(transformed?.[1]?.[2])).toBeCloseTo(0.707106, 5);
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
    expect(tabs.length).toBe(beforeTabs + 1);
    const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
    expect(activeTab).toBeTruthy();
    expect((activeTab.textContent || '').toLowerCase()).toContain('log2');
    expect((activeTab.textContent || '').toLowerCase()).toContain('center rows');

    const transformed = hot.getData();
    expect(Number(transformed?.[1]?.[1])).toBeCloseTo(-0.5, 6);
    expect(Number(transformed?.[1]?.[2])).toBeCloseTo(0.5, 6);
    expect(applyButton.disabled).toBe(true);
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
    expect(activeClose).toBeTruthy();
    activeClose.click();

    expect(centerGenes.checked).toBe(false);
    expect(filterPresent.checked).toBe(false);
    const activeTab = document.querySelector('#heatmapHotWrapper .data-view-tabs__tab--active');
    expect(activeTab).toBeTruthy();
    expect((activeTab.textContent || '').toLowerCase()).toContain('raw');
  });

  test('graph title stays above long vertical column labels', () => {
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
    window.Components.heatmap.draw();

    const svg = document.getElementById('heatmapSvg');
    expect(svg).toBeTruthy();

    // Find the title text element (should be first text with data-font-role="graphTitle")
    const titleEl = svg.querySelector('text[data-font-role="graphTitle"]');
    expect(titleEl).toBeTruthy();
    const titleY = parseFloat(titleEl.getAttribute('y'));

    // Find column label text elements (should have data-font-role="columnLabel")
    const columnLabels = svg.querySelectorAll('text[data-font-role="columnLabel"]');
    expect(columnLabels.length).toBeGreaterThan(0);

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
