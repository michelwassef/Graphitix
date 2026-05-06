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

  test('Venn keeps style controls visible and opens trace toolbar from circle click', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    const hooks = venn?.__testHooks;
    const plotType = document.getElementById('vennPlotType');
    const colorA = document.getElementById('colorA');
    const opacity = document.getElementById('opacity');
    expect(venn).toBeTruthy();
    expect(hooks?.state?.ui?.inputs).toBeTruthy();
    expect(plotType).toBeTruthy();
    expect(colorA).toBeTruthy();
    expect(opacity).toBeTruthy();
    plotType.value = 'venn';
    dispatchChange(plotType);
    expect(typeof colorA.closest('fieldset')?.hidden).toBe('boolean');
    expect(typeof opacity.closest('fieldset')?.hidden).toBe('boolean');

    hooks.state.ui.inputs.A.value = 'GeneA\nGeneShared';
    hooks.state.ui.inputs.B.value = 'GeneB\nGeneShared';
    hooks.state.ui.inputs.C.value = 'GeneC';
    hooks.state.ui.syncTableFromInputs?.({ refresh: true });
    venn.refreshDiagram();

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();
    const circle = stage.querySelector('circle[data-venn-trace-id]');
    expect(circle).toBeTruthy();
    const traceId = circle.getAttribute('data-venn-trace-id');
    expect(traceId).toBeTruthy();

    circle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const panel = document.querySelector('.venn-upset-trace-controls');
    expect(panel).toBeTruthy();
    const scopeSelect = panel.querySelector('select.workspace-toolbar__select');
    const fillInput = panel.querySelector('.shared-shape-color-input');
    expect(scopeSelect).toBeTruthy();
    expect(fillInput).toBeTruthy();
    expect(scopeSelect.value).toBe('trace');

    fillInput.value = '#aa5500';
    dispatchInput(fillInput);
    dispatchChange(fillInput);
    venn.refreshDiagram();

    const updated = stage.querySelector(`circle[data-venn-trace-id="${traceId}"]`);
    expect(updated).toBeTruthy();
    expect((updated.getAttribute('fill') || '').toLowerCase()).toBe('#aa5500');
  });

  test('Venn retains aspect ratio when auto-resizing the chart viewport', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    const hooks = venn?.__testHooks;
    expect(hooks?.state?.ui?.inputs).toBeTruthy();

    hooks.state.ui.inputs.A.value = 'GeneA\nGeneShared';
    hooks.state.ui.inputs.B.value = 'GeneB\nGeneShared';
    hooks.state.ui.inputs.C.value = 'GeneC';
    hooks.state.ui.syncTableFromInputs?.({ refresh: true });
    venn.refreshDiagram();

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();
    expect(stage.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
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

  test('UpSet horizontal grid lines align to y-axis and skip x-axis baseline', async () => {
    await activateWorkspace('venn');
    const plotType = document.getElementById('vennPlotType');
    const gridColorInput = document.getElementById('upsetGridColor');
    const venn = window.Components?.venn;
    const hooks = venn?.__testHooks;
    expect(plotType).toBeTruthy();
    expect(gridColorInput).toBeTruthy();
    expect(venn).toBeTruthy();
    expect(hooks?.state?.ui?.hot).toBeTruthy();

    plotType.value = 'upset';
    dispatchChange(plotType);
    const hot = hooks.state.ui.hot;
    hot.loadData([
      ['SetA', 'SetB', 'SetC', 'SetD'],
      ['GeneShared', '', '', 'GeneShared'],
      ['GeneA', '', '', ''],
      ['', 'GeneB', '', ''],
      ['', '', 'GeneC', ''],
      ['', '', '', 'GeneD']
    ]);
    hooks.state.ui.syncInputsFromTable?.({ scheduleDraw: false, scheduleSpecies: false });
    venn.refreshDiagram();

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();

    const axisLines = Array.from(stage.querySelectorAll('line[data-axis-control="1"]'));
    expect(axisLines.length).toBeGreaterThanOrEqual(2);
    const yAxis = axisLines.find(line => {
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      return Number.isFinite(x1) && Number.isFinite(x2) && Math.abs(x1 - x2) < 1e-6;
    });
    const xAxis = axisLines.find(line => {
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      return Number.isFinite(y1) && Number.isFinite(y2) && Math.abs(y1 - y2) < 1e-6;
    });
    expect(yAxis).toBeTruthy();
    expect(xAxis).toBeTruthy();
    const axisX = Number(yAxis.getAttribute('x1'));
    const axisY = Number(xAxis.getAttribute('y1'));
    const expectedGridColor = (gridColorInput.value || '').toLowerCase();

    const gridLines = Array.from(stage.querySelectorAll('line')).filter(line => {
      if ((line.getAttribute('stroke') || '').toLowerCase() !== expectedGridColor) {
        return false;
      }
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      return Number.isFinite(y1) && Number.isFinite(y2) && Math.abs(y1 - y2) < 1e-6;
    });
    expect(gridLines.length).toBeGreaterThan(0);
    const groupedByY = new Map();
    gridLines.forEach(line => {
      const x1 = Number(line.getAttribute('x1'));
      const y = Number(line.getAttribute('y1'));
      expect(Math.abs(y - axisY)).toBeGreaterThan(0.51);
      expect(x1).toBeGreaterThanOrEqual(axisX - 0.51);
      const key = y.toFixed(3);
      if (!groupedByY.has(key)) {
        groupedByY.set(key, []);
      }
      groupedByY.get(key).push(line);
    });
    expect(groupedByY.size).toBeGreaterThan(0);
    groupedByY.forEach(linesAtY => {
      const hasAxisAnchoredSegment = linesAtY.some(line => {
        const x1 = Number(line.getAttribute('x1'));
        return Number.isFinite(x1) && Math.abs(x1 - axisX) < 0.51;
      });
      expect(hasAxisAnchoredSegment).toBe(true);
    });

    const bars = Array.from(stage.querySelectorAll('rect[data-upset-trace-kind="intersectionBars"]')).filter(bar => {
      const width = Number(bar.getAttribute('width'));
      const height = Number(bar.getAttribute('height'));
      return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
    });
    expect(bars.length).toBeGreaterThan(0);
    gridLines.forEach(line => {
      const y = Number(line.getAttribute('y1'));
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      const segStart = Math.min(x1, x2);
      const segEnd = Math.max(x1, x2);
      bars.forEach(bar => {
        const barX = Number(bar.getAttribute('x'));
        const barY = Number(bar.getAttribute('y'));
        const barW = Number(bar.getAttribute('width'));
        const barH = Number(bar.getAttribute('height'));
        const barBottomY = barY + barH;
        const inBarInteriorY = y > (barY + 0.5) && y < (barBottomY - 0.5);
        if (!inBarInteriorY) {
          return;
        }
        const overlapStart = Math.max(segStart, barX);
        const overlapEnd = Math.min(segEnd, barX + barW);
        expect(overlapEnd - overlapStart).toBeLessThanOrEqual(0.5);
      });
    });
  });

  test('UpSet x/y axes render in foreground above intersection bars', async () => {
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
      ['', 'GeneB', ''],
      ['', '', 'GeneC']
    ]);
    hooks.state.ui.syncInputsFromTable?.({ scheduleDraw: false, scheduleSpecies: false });
    venn.refreshDiagram();

    const stage = document.getElementById('stage');
    expect(stage).toBeTruthy();

    const firstBar = stage.querySelector('rect[data-upset-trace-kind="intersectionBars"]');
    expect(firstBar).toBeTruthy();

    const axisLines = Array.from(stage.querySelectorAll('line[data-axis-control="1"]'));
    expect(axisLines.length).toBeGreaterThanOrEqual(2);
    const yAxis = axisLines.find(line => {
      const x1 = Number(line.getAttribute('x1'));
      const x2 = Number(line.getAttribute('x2'));
      return Number.isFinite(x1) && Number.isFinite(x2) && Math.abs(x1 - x2) < 1e-6;
    });
    const xAxis = axisLines.find(line => {
      const y1 = Number(line.getAttribute('y1'));
      const y2 = Number(line.getAttribute('y2'));
      return Number.isFinite(y1) && Number.isFinite(y2) && Math.abs(y1 - y2) < 1e-6;
    });
    expect(yAxis).toBeTruthy();
    expect(xAxis).toBeTruthy();

    const compareYAxis = firstBar.compareDocumentPosition(yAxis);
    const compareXAxis = firstBar.compareDocumentPosition(xAxis);
    expect((compareYAxis & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((compareXAxis & window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  test('UpSet global trace color applies after a prior trace-level color edit', async () => {
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

    const firstBar = stage.querySelector('rect[data-upset-trace-kind="intersectionBars"]');
    expect(firstBar).toBeTruthy();
    const traceId = firstBar.getAttribute('data-upset-trace-id');
    expect(traceId).toBeTruthy();

    firstBar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    let panel = document.querySelector('.venn-upset-trace-controls');
    expect(panel).toBeTruthy();

    let scopeSelect = panel.querySelector('select.workspace-toolbar__select');
    let fillInput = panel.querySelector('.shared-shape-color-input');
    expect(scopeSelect).toBeTruthy();
    expect(fillInput).toBeTruthy();
    expect(scopeSelect.value).toBe('trace');

    fillInput.value = '#ff0000';
    dispatchInput(fillInput);
    dispatchChange(fillInput);
    venn.refreshDiagram();

    let selectedBar = stage.querySelector(`rect[data-upset-trace-kind="intersectionBars"][data-upset-trace-id="${traceId}"]`);
    expect(selectedBar).toBeTruthy();
    expect((selectedBar.getAttribute('fill') || '').toLowerCase()).toBe('#ff0000');

    selectedBar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    panel = document.querySelector('.venn-upset-trace-controls');
    expect(panel).toBeTruthy();
    scopeSelect = panel.querySelector('select.workspace-toolbar__select');
    fillInput = panel.querySelector('.shared-shape-color-input');
    expect(scopeSelect).toBeTruthy();
    expect(fillInput).toBeTruthy();

    scopeSelect.value = 'global';
    dispatchChange(scopeSelect);
    fillInput.value = '#00aa00';
    dispatchInput(fillInput);
    dispatchChange(fillInput);
    venn.refreshDiagram();

    const allBars = Array.from(stage.querySelectorAll('rect[data-upset-trace-kind="intersectionBars"]'));
    expect(allBars.length).toBeGreaterThan(0);
    allBars.forEach(bar => {
      expect((bar.getAttribute('fill') || '').toLowerCase()).toBe('#00aa00');
    });

    const traceStyles = hooks.state.analysis?.upsetTraceStyles?.intersectionBars?.traces || {};
    const traceStyle = traceStyles[traceId] || {};
    expect(Object.prototype.hasOwnProperty.call(traceStyle, 'fill')).toBe(false);
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
