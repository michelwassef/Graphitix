'use strict';

const { activateWorkspace, flushAsyncWork, setVennListValue } = require('../../test-support/uiEventsTestSetup');

describe('UI events: Venn', () => {

  test('Color picker overlay opens on color input click', async () => {
    await activateWorkspace('venn');
    const colorA = document.getElementById('colorA');
    expect(colorA).toBeTruthy();
    // Find overlay (the shared picker appended directly under body)
    const overlay = document.querySelector('body > .shared-color-picker');
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe('none');

    // Dispatch click
    const evt = new window.Event('click', { bubbles: true, cancelable: true });
    colorA.dispatchEvent(evt);

    // Overlay should be shown
    expect(overlay.style.display).toBe('block');
    expect(overlay.dataset.visible).toBe('1');
  });

  test('Venn GO analysis results persist when repopulating the same region', async () => {
    await activateWorkspace('venn');
    const hooks = window.Components?.venn?.__testHooks;
    expect(hooks).toBeTruthy();
    const { state, populateRegion } = hooks;
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
    state.analysis.lastRegions = {
      Aonly: new Set(['BRCA1', 'ATM']),
      Bonly: new Set(),
      Conly: new Set(),
      AB: new Set(),
      AC: new Set(),
      BC: new Set(),
      ABC: new Set()
    };
    state.ui.regionList = document.createElement('div');
    state.ui.copyRegionBtn = document.createElement('button');
    state.ui.goResults = document.createElement('div');
    state.ui.stringResults = document.createElement('div');
    state.ui.stringNetwork = document.createElement('div');
    state.ui.goChartExport = document.createElement('div');
    state.ui.stringNetworkExport = document.createElement('div');

    populateRegion('A');
    state.ui.goResults.innerHTML = 'DNA repair';
    populateRegion('A');

    expect(state.ui.goResults.innerHTML).toBe('DNA repair');
  });

  test('Venn STRING analysis results persist when repopulating the same region', async () => {
    await activateWorkspace('venn');
    const hooks = window.Components?.venn?.__testHooks;
    expect(hooks).toBeTruthy();
    const { state, populateRegion } = hooks;
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
    state.analysis.lastRegions = {
      Aonly: new Set(['BRCA1', 'ATM']),
      Bonly: new Set(['CBX2']),
      Conly: new Set(),
      AB: new Set(['BAP1']),
      AC: new Set(),
      BC: new Set(),
      ABC: new Set(['RING1B'])
    };
    state.ui.regionList = document.createElement('div');
    state.ui.copyRegionBtn = document.createElement('button');
    state.ui.goResults = state.ui.goResults || document.createElement('div');
    state.ui.stringResults = document.createElement('div');
    state.ui.stringNetwork = document.createElement('div');
    state.ui.goChartExport = state.ui.goChartExport || document.createElement('div');
    state.ui.stringNetworkExport = document.createElement('div');

    populateRegion('A');
    state.ui.stringResults.innerHTML = '<strong>STRING enrichment</strong><div>Protein binding</div>';
    state.ui.stringNetwork.innerHTML = '<svg></svg>';
    populateRegion('A');

    expect(state.ui.stringResults.innerHTML).toContain('Protein binding');
    expect(state.ui.stringNetwork.innerHTML).toContain('<svg');
  });

  test('Venn detect species button triggers manual detection and indicator', async () => {
    await activateWorkspace('venn');
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    const detectBtn = document.getElementById('detectSpeciesBtn');
    expect(listA && listB && listC && detectBtn).toBeTruthy();

    setVennListValue(listA, 'BRCA1\nTP53');
    setVennListValue(listB, 'ATM');
    setVennListValue(listC, '');

    const originalFetch = global.fetch;
    const fetchMock = jest.fn((url) => {
      const gene = new URL(url).searchParams.get('q');
      return Promise.resolve({
        ok: true,
        json: async () => ({ hits: [{ symbol: gene, taxid: '9606' }] })
      });
    });
    global.fetch = fetchMock;

    try {
      detectBtn.click();
      await flushAsyncWork();
      await flushAsyncWork();

      expect(fetchMock).toHaveBeenCalled();
      const select = document.getElementById('speciesSelect');
      expect(select.value).toBe('hsapiens');
      expect(select.style.backgroundColor).toMatch(/b5d99c|rgb\(181, 217, 156\)/i);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Venn species detection reuses cache without refetching', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    setVennListValue(listA, 'BRCA1');
    setVennListValue(listB, '');
    setVennListValue(listC, '');

    const originalFetch = global.fetch;
    const fetchMock = jest.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ hits: [{ symbol: 'BRCA1', taxid: '9606' }] })
    }));
    global.fetch = fetchMock;

    try {
      await venn.recognizeSpeciesFromInput({ reason: 'cache-test' });
      await flushAsyncWork();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await venn.recognizeSpeciesFromInput({ reason: 'cache-test-repeat' });
      await flushAsyncWork();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Venn species detection cancels in-flight requests when superseded', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    setVennListValue(listA, 'BRCA1');
    setVennListValue(listB, '');
    setVennListValue(listC, '');

    const originalFetch = global.fetch;
    const pendingResolvers = [];
    const fetchMock = jest.fn((url, options = {}) => new Promise((resolve, reject) => {
      const gene = new URL(url).searchParams.get('q');
      if (options.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }
      pendingResolvers.push(() => resolve({
        ok: true,
        json: async () => ({ hits: [{ symbol: gene, taxid: '9606' }] })
      }));
    }));
    global.fetch = fetchMock;

    try {
      const detectionState = window.Components?.venn?.__testHooks?.state.analysis.speciesDetection;
      const fakeController = new AbortController();
      detectionState.active = { controller: fakeController, cacheKey: 'fake-cache', reason: 'pending' };

      const secondPromise = venn.recognizeSpeciesFromInput({ reason: 'second-detect' });
      await flushAsyncWork();

      expect(fakeController.signal.aborted).toBe(true);

      const select = document.getElementById('speciesSelect');
      expect(select.style.backgroundColor).toBe('');

      pendingResolvers.forEach(resolver => resolver());

      await secondPromise;

      expect(select.value).toBe('hsapiens');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

});
