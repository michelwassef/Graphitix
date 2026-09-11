const { loadProductionBootstrap } = require('../test-support/productionLoader');

describe('Venn empty payload defaults', () => {
  beforeEach(() => {
    delete window.Main;
    delete window.Components;
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['venn']
    });
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
    expect(payload?.style?.colorA).toBe('#0000ff');
    expect(payload?.style?.opacity).toBe('0.75');
    expect(payload?.config).toEqual({
      caseSensitive: false,
      goUseAllBackground: false,
      goCategories: { biologicalProcess: true, molecularFunction: true, cellularComponent: true },
      stringNetworkType: 'full',
      stringEdgeMeaning: 'evidence',
      stringSources: { textmining: true, experiments: true, databases: true }
    });
  });

  test('analysis and parsing controls round-trip through the owning payload', async () => {
    await window.Main.tabs.handleGraphSelection('venn', { reason: 'test-control-roundtrip' });
    const venn = window.Components.venn;
    const payload = venn.createEmptyPayload();
    payload.config = {
      caseSensitive: true,
      goUseAllBackground: true,
      goCategories: { biologicalProcess: false, molecularFunction: true, cellularComponent: false },
      stringNetworkType: 'physical',
      stringEdgeMeaning: 'confidence',
      stringSources: { textmining: false, experiments: true, databases: false }
    };
    venn.loadFromPayload(payload, { tabId: window.Main.tabs.getActiveTab().id, skipDraw: true, reason: 'test-control-roundtrip' });

    expect(venn.getPayload().config).toEqual(payload.config);
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
    expect(payload?.style?.colorA).toBe('#0000ff');
    expect(payload?.style?.opacity).toBe('0.75');
  });
});
