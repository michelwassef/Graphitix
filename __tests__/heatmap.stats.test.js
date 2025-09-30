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

    const Shared = window.Shared || {};
    originalCreateStandardTable = Shared.hot?.createStandardTable;
    if(originalCreateStandardTable){
      Shared.hot.createStandardTable = function wrappedCreateStandardTable(){
        const instance = originalCreateStandardTable.apply(this, arguments);
        if(instance && arguments?.[0]?.id === 'heatmapHot'){
          global.__LAST_HEATMAP_HOT__ = instance;
          console.debug('Debug: heatmap stats test captured Handsontable instance', { hasInstance: !!instance }); // Debug: capture test hot instance
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
});
