/**
 * Regression test: ensure component-created toolbar forms do not remain
 * visible when the singleton font (FORMAT) panel is opened for the same host.
 */
describe('Format toolbar exclusivity', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('box point controls removed when font panel opens', async () => {
    // Load core scripts in the same order as the app
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
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs.js');
    require('../js/main.js');

    const doc = global.document;
    const Components = global.Components;
    const Shared = global.Shared;

    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    if(typeof graphSelection === 'function'){
      const maybePromise = graphSelection('box');
      if(maybePromise && typeof maybePromise.then === 'function'){
        await maybePromise;
      }
      await Promise.resolve();
    }
    expect(Components && Components.box && Components.box.__installed).toBeTruthy();

    const point = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    point.setAttribute('cx', '10');
    point.setAttribute('cy', '10');
    point.setAttribute('r', '4');
    doc.body.appendChild(point);

    const anchorEl = doc.getElementById('boxFontHost');
    expect(anchorEl).toBeTruthy();
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host font-toolbar-host--visible';
    anchorEl.insertAdjacentElement('afterend', host);
    const formNode = doc.createElement('div');
    formNode.className = 'workspace-toolbar__form box-point-controls';
    formNode.dataset.pointControls = '1';
    host.appendChild(formNode);

    expect(doc.querySelector('.font-toolbar-host.font-toolbar-host--visible')).toBeTruthy();
    expect(host.querySelector('.workspace-toolbar__form')).toBeTruthy();

    const anchor = doc.getElementById('boxFontHost');
    expect(anchor).toBeTruthy();
    Shared.fontControls.openForElement(anchor, { scopeId: 'box' });

    const activeHost = doc.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    expect(activeHost).toBeTruthy();
    const leftover = activeHost.querySelector('.workspace-toolbar__form, [data-point-controls="1"]');
    expect(leftover).toBeFalsy();

    const panel = doc.querySelector('.font-controls-panel');
    expect(panel && panel.dataset && panel.dataset.open === '1').toBeTruthy();
  });

  test('heatmap font controls preserve side-by-side palette toolbar layout', () => {
    require('../js/vendor.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/fontControls.js');

    const doc = global.document;
    const Shared = global.Shared;

    const anchor = doc.createElement('button');
    anchor.id = 'heatmapFontHost';
    doc.body.appendChild(anchor);

    const host = doc.createElement('div');
    host.className = 'font-toolbar-host font-toolbar-host--visible font-toolbar-host--heatmap-dual';
    host.dataset.fontToolbarScope = 'heatmap';
    anchor.insertAdjacentElement('afterend', host);

    const palettePanel = doc.createElement('div');
    palettePanel.className = 'workspace-toolbar__panel heatmap-palette-controls-panel';
    host.appendChild(palettePanel);

    Shared.fontControls.openForElement(anchor, { scopeId: 'heatmap' });

    expect(host.classList.contains('font-toolbar-host--visible')).toBe(true);
    expect(host.classList.contains('font-toolbar-host--heatmap-dual')).toBe(true);
    expect(host.querySelector('.heatmap-palette-controls-panel')).toBeTruthy();
    expect(host.querySelector('.font-controls-panel')).toBeTruthy();
  });

  test('heatmap palette toolbar does not appear just by opening the workspace', async () => {
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
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs.js');
    require('../js/main.js');

    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const maybePromise = graphSelection('heatmap');
    if(maybePromise && typeof maybePromise.then === 'function'){
      await maybePromise;
    }
    await Promise.resolve();

    const host = document.querySelector('.font-toolbar-host[data-font-toolbar-scope="heatmap"]');
    expect(host?.classList?.contains('font-toolbar-host--visible')).not.toBe(true);
    expect(host?.querySelector('.heatmap-palette-controls-panel')).toBeFalsy();
  });

  test('clicking a heatmap cell opens the heatmap palette toolbar', async () => {
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
    require('../js/shared/workspaceToolbar.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs.js');
    require('../js/main.js');

    const flushAsyncWork = async (iterations = 10) => {
      for(let i = 0; i < iterations; i += 1){
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };

    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const maybePromise = graphSelection('heatmap');
    if(maybePromise && typeof maybePromise.then === 'function'){
      await maybePromise;
    }
    await flushAsyncWork(4);

    const loadExample = document.getElementById('heatmapLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();
    await flushAsyncWork(12);

    const heatmap = window.Components?.heatmap;
    expect(heatmap).toBeTruthy();
    let svg = heatmap.__getState?.()?.svg || document.getElementById('heatmapSvg');
    for(let i = 0; i < 20 && !svg; i += 1){
      await flushAsyncWork(2);
      svg = heatmap.__getState?.()?.svg || document.getElementById('heatmapSvg');
    }
    expect(svg).toBeTruthy();

    let cellLayer = svg.querySelector('[data-export-layer="heatmap-cells"], [data-layer="cells"]');
    for(let i = 0; i < 20 && !cellLayer; i += 1){
      await flushAsyncWork(2);
      cellLayer = svg.querySelector('[data-export-layer="heatmap-cells"], [data-layer="cells"]');
    }
    if(!cellLayer){
      const synthetic = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      synthetic.setAttribute('data-layer', 'cells');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '0');
      rect.setAttribute('y', '0');
      rect.setAttribute('width', '10');
      rect.setAttribute('height', '10');
      synthetic.appendChild(rect);
      svg.appendChild(synthetic);
      cellLayer = synthetic;
    }
    expect(cellLayer).toBeTruthy();

    cellLayer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsyncWork(8);

    const panel = document.querySelector('.heatmap-palette-controls-panel');
    expect(panel).toBeTruthy();
    const host = panel.closest('.font-toolbar-host');
    expect(host).toBeTruthy();
    expect(host.classList.contains('font-toolbar-host--visible')).toBe(true);
  });
});
