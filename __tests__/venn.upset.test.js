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
    require('../js/main/graphVariants.js');
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

  test('Quick launcher variant can switch Venn workspace to UpSet', async () => {
    await activateWorkspace('venn');
    const applyVariant = window.Main?.graphVariants?.applyVariant;
    const getVariant = window.Main?.graphVariants?.getById;
    const plotType = document.getElementById('vennPlotType');
    expect(typeof applyVariant).toBe('function');
    expect(typeof getVariant).toBe('function');
    expect(plotType).toBeTruthy();
    const variant = getVariant('venn:upset');
    expect(variant).toBeTruthy();
    expect(variant.type).toBe('venn');
    expect(applyVariant('venn:upset')).toBe(true);
    expect(plotType.value).toBe('upset');
  });

  test('Graph-scope font style applies to all UpSet text elements', async () => {
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

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();
    const texts = Array.from(stage.querySelectorAll('text'));
    expect(texts.length).toBeGreaterThan(5);
    const axisLabel = texts.find(node => (node.textContent || '').trim() === 'Intersection Size');
    expect(axisLabel).toBeTruthy();
    expect(axisLabel.dataset.fontEditable).toBe('1');
    expect(axisLabel.dataset.fontScope).toBe('venn');
    expect(axisLabel.dataset.fontKey).toBeTruthy();

    const fontControls = window.Shared?.fontControls;
    expect(fontControls && typeof fontControls.importScopeStyles === 'function').toBe(true);
    fontControls.importScopeStyles('venn', {
      __graph__: { fill: '#112233' }
    }, { prune: false });

    const recolored = Array.from(stage.querySelectorAll('text'));
    expect(recolored.length).toBeGreaterThan(0);
    recolored.forEach(node => {
      expect((node.getAttribute('fill') || '').toLowerCase()).toBe('#112233');
    });
  });

  test('UpSet dots scale when plot size changes', async () => {
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

    const svgBox = hooks.state.ui.svgBox || document.querySelector('#vennGraphPanel .svgbox');
    expect(svgBox).toBeTruthy();
    const originalGetRect = svgBox.getBoundingClientRect.bind(svgBox);
    let mockWidth = 420;
    let mockHeight = 300;
    svgBox.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: mockWidth,
      bottom: mockHeight,
      width: mockWidth,
      height: mockHeight,
      toJSON: () => ({ width: mockWidth, height: mockHeight })
    });

    venn.refreshDiagram();
    const stage = document.getElementById('stage');
    const firstCircle = stage?.querySelector('circle');
    expect(firstCircle).toBeTruthy();
    const firstRadius = Number(firstCircle.getAttribute('r'));
    expect(Number.isFinite(firstRadius)).toBe(true);

    mockWidth = 840;
    mockHeight = 600;
    venn.refreshDiagram();
    const secondCircle = stage?.querySelector('circle');
    expect(secondCircle).toBeTruthy();
    const secondRadius = Number(secondCircle.getAttribute('r'));
    expect(Number.isFinite(secondRadius)).toBe(true);
    expect(secondRadius).toBeGreaterThan(firstRadius);

    svgBox.getBoundingClientRect = originalGetRect;
  });

  test('UpSet exposes clickable x/y axes through axis controls toolbar', async () => {
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
      ['SetA', 'SetB', 'SetC'],
      ['GeneShared', '', 'GeneShared'],
      ['GeneA', '', ''],
      ['', 'GeneB', '']
    ]);
    hooks.state.ui.syncInputsFromTable?.({ scheduleDraw: false, scheduleSpecies: false });
    venn.refreshDiagram();

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();
    const axisLines = Array.from(stage.querySelectorAll('line[data-axis-control="1"]'));
    expect(axisLines.length).toBeGreaterThanOrEqual(2);

    axisLines[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const axisPanel = document.querySelector('.axis-controls-panel');
    expect(axisPanel).toBeTruthy();
    expect(axisPanel.dataset.open).toBe('1');
    const colorInput = axisPanel.querySelector('input[type="color"]');
    const thicknessInputs = axisPanel.querySelectorAll('input[type="number"]');
    expect(colorInput).toBeTruthy();
    expect(thicknessInputs.length).toBeGreaterThan(0);
  });

  test('UpSet axis selection highlight artifacts are removed from SVG export', async () => {
    await activateWorkspace('venn');
    const plotType = document.getElementById('vennPlotType');
    const venn = window.Components?.venn;
    const hooks = venn?.__testHooks;
    const exporter = window.Shared?.exporter;
    expect(plotType).toBeTruthy();
    expect(venn).toBeTruthy();
    expect(hooks?.state?.ui?.hot).toBeTruthy();
    expect(exporter && typeof exporter.svgElementToXml === 'function').toBe(true);

    plotType.value = 'upset';
    dispatchChange(plotType);
    const hot = hooks.state.ui.hot;
    hot.loadData([
      ['SetA', 'SetB', 'SetC'],
      ['GeneShared', '', 'GeneShared'],
      ['GeneA', '', ''],
      ['', 'GeneB', '']
    ]);
    hooks.state.ui.syncInputsFromTable?.({ scheduleDraw: false, scheduleSpecies: false });
    venn.refreshDiagram();

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();
    const axisLine = stage.querySelector('line[data-axis-control="1"]');
    expect(axisLine).toBeTruthy();
    axisLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const xml = exporter.svgElementToXml(stage, 'venn-upset-export-test');
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);
    expect(xml).not.toContain('graph-edit-highlight--axis-overlay');
    expect(xml).not.toContain('graph-edit-highlight--axis');
    expect(xml).not.toContain('drop-shadow(');
  });
});
