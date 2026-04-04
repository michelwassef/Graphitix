describe('Venn empty payload defaults', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/workspaceTabs.js');
    require('../js/shared/tabContext.js');
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
    require('../js/shared/additionalLineControls.js');
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
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');
    require('../js/main.js');
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('createEmptyPayload ignores live control values from the current venn tab', async () => {
    const maybe = window.Main.tabs.handleGraphSelection('venn', { reason: 'test-selection' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();

    const state = venn.__getState();
    state.ui.inputs.borderWidth.value = '7.7';
    state.ui.inputs.fontsize.value = '22';
    state.ui.inputs.colorA.value = '#123456';
    state.ui.inputs.opacity.value = '0.4';

    const payload = venn.createEmptyPayload();
    expect(payload?.style?.borderWidth).toBe('1.2');
    expect(payload?.style?.fontsize).toBe('12');
    expect(payload?.style?.colorA).toBe('#e74c3c');
    expect(payload?.style?.opacity).toBe('0.75');
  });

  test('createEmptyPayload resets style defaults even after capturing an empty-payload template from a modified venn graph', async () => {
    const maybe = window.Main.tabs.handleGraphSelection('venn', { reason: 'test-selection-template' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();

    const state = venn.__getState();
    state.ui.inputs.borderWidth.value = '4.7';
    state.ui.inputs.fontsize.value = '18';
    state.ui.inputs.colorA.value = '#654321';
    state.ui.inputs.opacity.value = '0.2';

    const template = venn.captureEmptyPayloadTemplate();
    expect(template).toBeTruthy();

    const payload = venn.createEmptyPayload();
    expect(payload?.style?.borderWidth).toBe('1.2');
    expect(payload?.style?.fontsize).toBe('12');
    expect(payload?.style?.colorA).toBe('#e74c3c');
    expect(payload?.style?.opacity).toBe('0.75');
  });
});
