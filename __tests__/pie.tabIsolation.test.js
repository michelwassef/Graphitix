describe('Pie tab host isolation', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
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
    require('../js/shared/renderCacheSchema.js');
    require('../js/shared/renderCacheDiagnostics.js');
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

  test('opening a second pie tab does not duplicate the AG Grid host', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'pie');

    const pie = window.Components?.pie;
    expect(pie).toBeTruthy();

    const loadExample = document.getElementById('pieLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();
    await flush();

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'pie');

    const wrapper = document.getElementById('pieHotWrapper');
    expect(wrapper).toBeTruthy();
    expect(wrapper.querySelectorAll(':scope > [id=\"pieHot\"]').length).toBe(1);
    expect(document.querySelectorAll('#pieHotWrapper [id=\"pieHot\"]').length).toBe(1);
  });

  test('reinitializing pie does not stack import file-picker handlers', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'pie');

    const pie = window.Components?.pie;
    const activeTab = Main.session?.getActiveTab?.();
    const root = document.getElementById('piePage');
    const importButton = document.getElementById('pieImport');
    const fileInput = document.getElementById('pieFile');
    expect(pie).toBeTruthy();
    expect(root).toBeTruthy();
    expect(importButton).toBeTruthy();
    expect(fileInput).toBeTruthy();

    const fileClick = jest.spyOn(fileInput, 'click').mockImplementation(() => {});

    pie.ready = false;
    pie.init({ root, tabId: activeTab?.id || null, reason: 'test-rebind-1' });
    pie.ready = false;
    pie.init({ root, tabId: activeTab?.id || null, reason: 'test-rebind-2' });

    importButton.click();
    expect(fileClick).toHaveBeenCalledTimes(1);
  });

  test('Pie DataView changes dirty the owning payload without contaminating an active sibling', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'pie');

    const loadExample = document.getElementById('pieLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();
    await flush();

    const tabA = Main.session?.getActiveTab?.();
    const rootA = window.Shared?.workspaceTabs?.getMountedRoot?.(tabA, 'pie')
      || document.getElementById('piePage');
    const wrapperA = rootA?.querySelector?.('#pieHotWrapper');
    const managerA = wrapperA?.__dataViewsOwner || null;
    expect(tabA?.id).toBeTruthy();
    expect(managerA).toBeTruthy();

    const rawA = managerA.getView?.('raw');
    expect(Array.isArray(rawA?.data)).toBe(true);
    const derivedA = managerA.createDerivedView({
      title: 'Pie owner persistence derived',
      data: rawA.data.map(row => Array.isArray(row) ? row.slice() : row),
      transformSpec: { type: 'pie-owner-persistence-test' },
      activate: true,
      reason: 'pie-owner-persistence-test'
    });
    expect(derivedA?.id).toBeTruthy();

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'pie');
    const tabB = Main.session?.getActiveTab?.();
    expect(tabB?.id).toBeTruthy();
    expect(tabB.id).not.toBe(tabA.id);

    tabA.payloadDirty = false;
    tabA.payloadDirtyReason = '';
    tabA.userModified = false;
    tabB.payloadDirty = false;
    tabB.payloadDirtyReason = '';
    tabB.userModified = false;

    managerA.activateView('raw', { reason: 'tab-click' });
    await flush();

    expect(tabA.payloadDirty).toBe(true);
    expect(tabA.payloadDirtyReason).toBe('pie-data-view-activate');
    expect(tabA.userModified).toBe(true);
    expect(tabB.payloadDirty).toBe(false);
    expect(tabB.userModified).toBe(false);
  });

  test('user style control routes through the view-refresh suppression contract as userInitiated', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'pie');

    const pie = window.Components?.pie;
    expect(pie).toBeTruthy();
    const loadExample = document.getElementById('pieLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();
    await flush();

    // Stand in a recording componentLifecycle so we can observe the suppression check.
    // Pre-fix, style controls called the tab-scoped scheduler raw (no source/userInitiated),
    // so the post-render-cache-restore guard could drop the first style edit after reopen.
    const calls = [];
    const previousLifecycle = window.Shared.componentLifecycle;
    window.Shared.componentLifecycle = Object.assign({}, previousLifecycle, {
      shouldSuppressDraw: (componentKey, meta) => {
        calls.push({ componentKey, meta: meta || {} });
        return false;
      },
      emitLifecycleEvent: () => {}
    });
    try {
      const showFrame = document.getElementById('pieShowFrame');
      expect(showFrame).toBeTruthy();
      showFrame.checked = !showFrame.checked;
      showFrame.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();

      const refreshCall = calls.find(
        entry => entry.componentKey === 'pie' && entry.meta.source === 'pie-view-refresh'
      );
      expect(refreshCall).toBeTruthy();
      expect(refreshCall.meta.reason).toBe('frame-toggle');
      expect(refreshCall.meta.userInitiated).toBe(true);
    } finally {
      window.Shared.componentLifecycle = previousLifecycle;
    }
  });

  test('render-cache capture rollback preserves the live Pie statistics control DOM', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'pie');

    const pie = window.Components?.pie;
    expect(pie).toBeTruthy();
    expect(window.Shared?.componentLifecycle?.detachCacheableChildren).toEqual(expect.any(Function));
    const loadExample = document.getElementById('pieLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();
    await flush();

    const activeTab = Main.session?.getActiveTab?.() || null;
    const plot = document.getElementById('piePlot');
    expect(plot).toBeTruthy();
    plot.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'pieSvg';
    svg.setAttribute('viewBox', '0 0 100 100');
    const trace = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trace.setAttribute('data-pie-trace', '1');
    trace.setAttribute('d', 'M 50 50 L 90 50 A 40 40 0 0 1 50 90 Z');
    svg.appendChild(trace);
    plot.appendChild(svg);
    expect(plot.querySelector('#pieSvg [data-pie-trace="1"]')).toBe(trace);

    const controls = document.getElementById('pieStatsControls');
    const controlsSentinel = controls?.firstElementChild || null;
    const focusTarget = controls?.querySelector('input:not([disabled]), select:not([disabled]), button:not([disabled])') || null;
    expect(controlsSentinel).toBeTruthy();
    expect(focusTarget).toBeTruthy();
    focusTarget.focus();
    expect(document.activeElement).toBe(focusTarget);

    const renderCache = pie.captureRenderCache?.({
      tab: activeTab,
      tabId: activeTab?.id || null,
      payload: activeTab?.payload || null,
      reason: 'test-pie-capture-rollback'
    });
    expect(renderCache).toBeTruthy();
    expect(pie.restoreRenderCache?.(renderCache, {
      tab: activeTab,
      tabId: activeTab?.id || null,
      payload: activeTab?.payload || null,
      reason: 'test-pie-capture-rollback',
      restoreLiveAfterCapture: true,
      skipStateMutation: true
    })).toBe(true);

    expect(controls.firstElementChild).toBe(controlsSentinel);
    expect(document.activeElement).toBe(focusTarget);
  });

});
