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
    require('../js/shared/axisControls.js');
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

    // Ensure the box component is constructed by selecting the box workspace
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    if (typeof graphSelection === 'function') {
      const maybePromise = graphSelection('box');
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
      }
      await Promise.resolve();
    }
    expect(Components && Components.box && Components.box.__installed).toBeTruthy();

    // Create a dummy point element and attach to the document so box logic can use it
    const point = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    point.setAttribute('cx', '10');
    point.setAttribute('cy', '10');
    point.setAttribute('r', '4');
    doc.body.appendChild(point);

    // Simulate a component-created host (many components create this host)
    const anchorEl = doc.getElementById('boxFontHost');
    expect(anchorEl).toBeTruthy();
    // create host and insert after anchor
    const host = doc.createElement('div');
    host.className = 'font-toolbar-host font-toolbar-host--visible';
    anchorEl.insertAdjacentElement('afterend', host);
    const formNode = doc.createElement('div');
    formNode.className = 'workspace-toolbar__form box-point-controls';
    formNode.dataset.pointControls = '1';
    host.appendChild(formNode);

    // Ensure the simulated host and form exist
    expect(doc.querySelector('.font-toolbar-host.font-toolbar-host--visible')).toBeTruthy();
    expect(host.querySelector('.workspace-toolbar__form')).toBeTruthy();

    // Now open the singleton font panel targeting the box anchor
    const anchor = doc.getElementById('boxFontHost');
    expect(anchor).toBeTruthy();
    // Use the shared fontControls API to open the panel for the anchor
    Shared.fontControls.openForElement(anchor, { scopeId: 'box' });

    // After opening, the host that now contains the panel should NOT contain the old form
    const activeHost = doc.querySelector('.font-toolbar-host.font-toolbar-host--visible');
    expect(activeHost).toBeTruthy();
    const leftover = activeHost.querySelector('.workspace-toolbar__form, [data-point-controls="1"]');
    expect(leftover).toBeFalsy();

    // And the singleton panel should be marked as open
    const panel = doc.querySelector('.font-controls-panel');
    expect(panel && panel.dataset && panel.dataset.open === '1').toBeTruthy();
  });
});
