describe('Venn shared runtime isolation', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function activateTabById(Main, tabId, reason) {
    const maybe = Main.tabs.activateTab(tabId, { reason: reason || 'test-activate' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    await flush();
  }

  async function handleGraphSelection(Main, type) {
    const maybe = Main.tabs.handleGraphSelection(type, { reason: 'test-selection' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    const prompt = document.getElementById('duplicatePrompt');
    if (prompt && !prompt.hasAttribute('hidden')) {
      const emptyBtn = document.getElementById('duplicateEmpty');
      if (emptyBtn && typeof emptyBtn.click === 'function') {
        emptyBtn.click();
      }
    }
    await flush();
  }

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
    require('../js/shared/componentLifecycle.js');
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

  test('venn restores shared runtime state per tab and cancels active detection on tab changes', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();

    const tabA = Main.tabs.getActiveTab();
    expect(tabA?.type).toBe('venn');

    const stateA = venn.__getState();
    stateA.persistence.fileName = 'venn-a.graph';
    stateA.analysis.lastParsedLists = {
      signature: 'sig-a',
      maps: { A: new Map([['BRCA1', 'BRCA1']]) },
      uniques: { A: new Set(['BRCA1']) }
    };
    stateA.analysis.significanceCache = { lastUniverse: 12, logFactorial: { maxComputed: 12 } };
    stateA.analysis.speciesDetection.cache = new Map([
      ['sig-a', { guess: 'hsapiens', geneCount: 4 }]
    ]);
    stateA.analysis.speciesDetection.delayMs = 333;
    const abortA = jest.fn();
    stateA.analysis.speciesDetection.active = {
      controller: { abort: abortA },
      cacheKey: 'sig-a',
      reason: 'test-a'
    };
    if (stateA.ui.speciesSelect) {
      stateA.ui.speciesSelect.value = 'hsapiens';
      stateA.ui.speciesSelect.style.backgroundColor = 'rgb(181, 217, 156)';
      stateA.ui.speciesSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    expect(abortA).toHaveBeenCalled();

    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.type).toBe('venn');
    expect(tabB?.id).not.toBe(tabA?.id);

    const stateB = venn.__getState();
    stateB.persistence.fileName = 'venn-b.graph';
    stateB.analysis.significanceCache = { lastUniverse: 24, logFactorial: { maxComputed: 24 } };
    stateB.analysis.speciesDetection.cache = new Map([
      ['sig-b', { guess: 'mmusculus', geneCount: 7 }]
    ]);
    stateB.analysis.speciesDetection.delayMs = 777;
    const abortB = jest.fn();
    stateB.analysis.speciesDetection.active = {
      controller: { abort: abortB },
      cacheKey: 'sig-b',
      reason: 'test-b'
    };
    if (stateB.ui.speciesSelect) {
      stateB.ui.speciesSelect.value = 'mmusculus';
      stateB.ui.speciesSelect.style.backgroundColor = 'rgb(242, 139, 130)';
      stateB.ui.speciesSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    await activateTabById(Main, tabA.id, 'test-venn-return-a');
    expect(abortB).toHaveBeenCalled();

    const restoredA = venn.__getState();
    expect(restoredA.persistence.fileName).toBe('venn-a.graph');
    expect(restoredA.analysis.lastParsedLists?.signature || '').not.toBe('sig-a');
    expect(restoredA.analysis.lastParsedLists?.uniques?.A?.has?.('BRCA1') || false).toBe(false);
    expect(restoredA.analysis.significanceCache).toEqual({ lastUniverse: 12, logFactorial: { maxComputed: 12 } });
    expect(restoredA.analysis.speciesDetection.delayMs).toBe(333);
    expect(restoredA.analysis.speciesDetection.active).toBeNull();
    expect(restoredA.analysis.speciesDetection.pendingTimeoutId).toBeNull();
    expect(restoredA.analysis.speciesDetection.cache instanceof Map).toBe(true);
    expect(restoredA.analysis.speciesDetection.cache.get('sig-a')).toEqual({ guess: 'hsapiens', geneCount: 4 });
    expect(restoredA.ui.speciesSelect?.value || '').toBe('hsapiens');
    expect(restoredA.ui.speciesSelect?.style?.backgroundColor || '').toBe('rgb(181, 217, 156)');

    await activateTabById(Main, tabB.id, 'test-venn-return-b');
    const restoredB = venn.__getState();
    expect(restoredB.persistence.fileName).toBe('venn-b.graph');
    expect(restoredB.analysis.significanceCache).toEqual({ lastUniverse: 24, logFactorial: { maxComputed: 24 } });
    expect(restoredB.analysis.speciesDetection.delayMs).toBe(777);
    expect(restoredB.analysis.speciesDetection.active).toBeNull();
    expect(restoredB.analysis.speciesDetection.pendingTimeoutId).toBeNull();
    expect(restoredB.analysis.speciesDetection.cache instanceof Map).toBe(true);
    expect(restoredB.analysis.speciesDetection.cache.get('sig-b')).toEqual({ guess: 'mmusculus', geneCount: 7 });
    expect(restoredB.ui.speciesSelect?.value || '').toBe('mmusculus');
    expect(restoredB.ui.speciesSelect?.style?.backgroundColor || '').toBe('rgb(242, 139, 130)');
  });

  test('inactive venn draw scheduling stores only serializable owner metadata', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    expect(tabA?.type).toBe('venn');

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.id).not.toBe(tabA.id);

    const sessionA = venn.__testHooks.getSession(tabA.id);
    expect(sessionA).toBeTruthy();
    const domTarget = venn.__getState().ui.stage;
    const scheduled = venn.__testHooks.scheduleDrawForSession(sessionA, {
      reason: 'test-inactive-schedule',
      mode: 'lists',
      target: domTarget,
      event: { currentTarget: domTarget },
      nested: { ok: true, node: domTarget }
    });

    expect(scheduled).toBe(false);
    expect(sessionA.timers.pendingDrawOptions).toEqual({
      reason: 'test-inactive-schedule',
      mode: 'lists',
      nested: { ok: true },
      tabId: tabA.id
    });
  });

  test('title, set, and region label positions restore independently per Venn tab', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const positionsA = {
      title: { x: 320, y: 42, relX: 0.5, relY: 0.08 },
      'set-A': { x: 170, y: 115, relX: 0.27, relY: 0.22 },
      'region-AB': { x: 310, y: 265, relX: 0.48, relY: 0.51 }
    };
    const payloadA = Main.session.clonePayload(venn.getPayload());
    payloadA.style = { ...(payloadA.style || {}), labelPositions: positionsA };
    await venn.loadFromPayload(payloadA, { tabId: tabA.id, reason: 'test-label-positions-a' });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    const positionsB = {
      title: { x: 290, y: 38, relX: 0.45, relY: 0.07 },
      'set-B': { x: 455, y: 390, relX: 0.71, relY: 0.75 }
    };
    const payloadB = Main.session.clonePayload(venn.getPayload());
    payloadB.style = { ...(payloadB.style || {}), labelPositions: positionsB };
    await venn.loadFromPayload(payloadB, { tabId: tabB.id, reason: 'test-label-positions-b' });

    await activateTabById(Main, tabA.id, 'test-label-positions-return-a');
    expect(venn.__getState().labelPositions).toEqual(positionsA);
    expect(venn.__testHooks.getSession(tabA.id).state.labelPositions).toEqual(positionsA);

    await activateTabById(Main, tabB.id, 'test-label-positions-return-b');
    expect(venn.__getState().labelPositions).toEqual(positionsB);
    expect(venn.__testHooks.getSession(tabB.id).state.labelPositions).toEqual(positionsB);
    expect(venn.__testHooks.getSession(tabA.id).state.labelPositions).toEqual(positionsA);
  });
});
