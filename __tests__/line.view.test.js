jest.setTimeout(30000);

describe('Line view labels', () => {
  const flush = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const flushAll = async (count = 10) => {
    for(let i = 0; i < count; i += 1){
      await flush();
    }
  };

  beforeEach(async () => {
    jest.resetModules();
    global.jStat = {
      mean(values = []){
        const filtered = values.filter(v => typeof v === 'number');
        if(!filtered.length) return 0;
        const sum = filtered.reduce((acc, value) => acc + value, 0);
        return sum / filtered.length;
      },
      stdev(values = [], flag){
        const filtered = values.filter(v => typeof v === 'number');
        if(filtered.length < 2) return 0;
        const mean = filtered.reduce((acc, value) => acc + value, 0) / filtered.length;
        const variance = filtered.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) /
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
    require('../js/components/line.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main.js');

    if(typeof window.Main?.components?.ensureComponent === 'function'){
      await Promise.resolve(window.Main.components.ensureComponent('line'));
    }else{
      window.Components?.line?.ensure?.();
    }
    await flushAll(20);
  });

  test('legend labels follow editable header row titles', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const lineComponent = window.Components?.line;
    const hot = lineComponent?.getHot?.();
    expect(hot).toBeTruthy();

    hot.setDataAtCell([
      [0, 1, 'North renamed'],
      [0, 2, 'South renamed']
    ], 'test-line-header-edit');
    await flushAll(20);

    const headerRow = Array.isArray(hot?.getData?.()) ? hot.getData()[0] : null;
    expect(headerRow?.slice(0, 6)).toEqual(['Month', 'North renamed', 'South renamed', 'East', 'West', 'Central']);

    const lineState = lineComponent?.__getState?.();
    expect(lineState?.legendItems?.map(item => item.label)).toEqual([
      'North renamed',
      'South renamed',
      'East',
      'West',
      'Central'
    ]);
  });

  test('legend label clicks do not hide rendered line series', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const legendLabel = document.querySelector('#lineSvg text[data-legend-key="North"]');
    const seriesPath = document.querySelector('#lineSvg path[data-series="North"][data-render-mode="line"]');

    expect(legendLabel).toBeTruthy();
    expect(seriesPath).toBeTruthy();
    expect(seriesPath.style.display).not.toBe('none');

    legendLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    expect(seriesPath.style.display).not.toBe('none');
  });
});
