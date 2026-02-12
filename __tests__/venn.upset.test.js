async function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const result = graphSelection(type);
  if (result && typeof result.then === 'function') {
    await result;
  }
  await Promise.resolve();
}

function dispatchChange(target){
  if (!target) return;
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

function dispatchInput(target){
  if (!target) return;
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Venn UpSet integration', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    global.requestAnimationFrame = (cb) => {
      try { cb(Date.now()); } catch (err) { /* noop */ }
      return 1;
    };
    global.cancelAnimationFrame = () => {};

    if (typeof window !== 'undefined') {
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/undo.js');
    require('../js/shared/resizer.js');
    require('../js/shared/dom.js');
    require('../js/shared/exporter.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/graphSizing.js');
    require('../js/shared/regression.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/main/components.js');
    if (window.Main?.components?.preloadAllBundlesSync) {
      window.Main.components.preloadAllBundlesSync();
    }
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main.js');
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('Connector control is removed from UpSet settings UI', async () => {
    await activateWorkspace('venn');
    const plotType = document.getElementById('vennPlotType');
    expect(plotType).toBeTruthy();
    plotType.value = 'upset';
    dispatchChange(plotType);
    expect(document.getElementById('upsetConnectorColor')).toBeNull();
  });

  test('UpSet uses non-empty columns beyond first three and supports intersection selection', async () => {
    await activateWorkspace('venn');
    const plotType = document.getElementById('vennPlotType');
    const venn = window.Components?.venn;
    const hooks = venn?.__testHooks;
    expect(plotType).toBeTruthy();
    expect(venn).toBeTruthy();
    expect(hooks?.state?.ui?.hot).toBeTruthy();

    plotType.value = 'upset';
    dispatchChange(plotType);

    const hot = hooks.state.ui.hot;
    hot.loadData([
      ['SetA', 'SetB', 'SetC', 'SetD'],
      ['GeneShared', '', '', 'GeneShared'],
      ['GeneA', '', '', ''],
      ['', '', '', 'GeneD']
    ]);
    hooks.state.ui.syncInputsFromTable?.({ scheduleDraw: false, scheduleSpecies: false });
    venn.refreshDiagram();

    const regionSelect = document.getElementById('regionSelect');
    const regionList = document.getElementById('regionList');
    expect(regionSelect).toBeTruthy();
    expect(regionList).toBeTruthy();

    const optionValues = Array.from(regionSelect.options || []).map(option => option.value);
    expect(optionValues).toContain('D');
    expect(optionValues).toContain('A&D');

    regionSelect.value = 'A&D';
    dispatchChange(regionSelect);
    const text = regionList.textContent || '';
    expect(text).toContain('GeneShared');
    expect(text).not.toContain('GeneA');

    regionSelect.value = 'D';
    dispatchChange(regionSelect);
    const textD = regionList.textContent || '';
    expect(textD).toContain('GeneD');
    expect(textD).not.toContain('GeneShared');
  });

  test('Shared border controls apply to UpSet bars', async () => {
    await activateWorkspace('venn');
    const plotType = document.getElementById('vennPlotType');
    const borderColor = document.getElementById('borderColor');
    const borderWidth = document.getElementById('borderWidth');
    const venn = window.Components?.venn;
    const hooks = venn?.__testHooks;
    expect(plotType).toBeTruthy();
    expect(borderColor).toBeTruthy();
    expect(borderWidth).toBeTruthy();
    expect(venn).toBeTruthy();
    expect(hooks?.state?.ui?.hot).toBeTruthy();

    plotType.value = 'upset';
    dispatchChange(plotType);

    const hot = hooks.state.ui.hot;
    hot.loadData([
      ['SetA', 'SetB', 'SetC', 'SetD'],
      ['GeneShared', '', '', 'GeneShared'],
      ['GeneA', '', '', ''],
      ['', '', '', 'GeneD']
    ]);
    hooks.state.ui.syncInputsFromTable?.({ scheduleDraw: false, scheduleSpecies: false });

    borderColor.value = '#123456';
    borderWidth.value = '0';
    dispatchInput(borderColor);
    dispatchInput(borderWidth);
    venn.refreshDiagram();

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();
    const firstPassBars = Array.from(stage.querySelectorAll('rect')).filter(rect => {
      const fillOpacity = Number(rect.getAttribute('fill-opacity'));
      return Number.isFinite(fillOpacity) && Math.abs(fillOpacity - Number(hooks.state.ui.inputs.opacity.value)) < 1e-6;
    });
    expect(firstPassBars.length).toBeGreaterThan(0);
    firstPassBars.forEach(rect => {
      expect(Number(rect.getAttribute('stroke-width'))).toBe(0);
      expect(rect.getAttribute('stroke')).toBe('none');
    });

    borderWidth.value = '2';
    dispatchInput(borderWidth);
    venn.refreshDiagram();

    const secondPassBars = Array.from(stage.querySelectorAll('rect')).filter(rect => {
      const fillOpacity = Number(rect.getAttribute('fill-opacity'));
      return Number.isFinite(fillOpacity) && Math.abs(fillOpacity - Number(hooks.state.ui.inputs.opacity.value)) < 1e-6;
    });
    expect(secondPassBars.length).toBeGreaterThan(0);
    secondPassBars.forEach(rect => {
      expect(rect.getAttribute('stroke')).toBe('#123456');
      expect(Number(rect.getAttribute('stroke-width'))).toBeGreaterThan(0);
    });
  });
});
