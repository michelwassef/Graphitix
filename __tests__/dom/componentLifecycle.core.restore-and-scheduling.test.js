'use strict';
const { loadFreshLifecycle } = require('../../test-support/componentLifecycleTestSetup');
let lc;
const loadFresh = () => { lc = loadFreshLifecycle(); };

describe('session teardown contract', () => {
  let session;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    delete window.Components;
    delete window.Main;
    window.Components = { box: {} };
    window.Main = {
      components: {
        registry: {
          box: { disposeTab: jest.fn() }
        }
      }
    };
    require('../../js/shared/componentLifecycle.js');
    require('../../js/shared/workspaceTabs.js');
    require('../../js/main/session.js');
    session = window.Main.session;
    lc = window.Shared.componentLifecycle;
  });

  test('applySessionData disposes existing tab runtime before replacing the tab list', async () => {
    const tab = session.createTab({
      title: 'Box',
      type: 'box',
      payload: { type: 'box', data: [] }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;
    const owner = lc.createRuntimeOwner('box');
    owner.capture({ stats: { ready: true } }, { tabId: tab.id, reason: 'unit-capture' });
    window.Shared.workspaceTabs.setOwnedRuntimeRecord(tab, 'box', { hydrated: true });

    expect(tab.sharedState?.runtime?.lifecycle || tab.sharedState?.sessions?.box?.runtime?.lifecycle).toBeTruthy();

    await session.applySessionData({ tabs: [], activeIndex: -1 }, {
      reason: 'unit-session-reload'
    });

    expect(window.Main.components.registry.box.disposeTab).toHaveBeenCalled();
    expect(tab.sharedState).toBeUndefined();
    expect(session.workspaceState.tabs).toHaveLength(1);
    expect(session.workspaceState.tabs[0].isWelcome).toBe(true);
  });


  test('applySessionData rebases valid archive cache signatures after runtime tab-id rehoming', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = {
      component: 'box',
      tabId: 'workspace-99',
      graphFrame: { tabId: 'workspace-99', width: 640, height: 480 }
    };
    const sourcePayloadSignature = session.serializePayloadSignature(sourcePayload);
    const sourceLayoutSignature = session.serializePayloadSignature(sourceLayout);
    const sourceCache = {
      __graphitixRenderCache: {
        complete: true,
        type: 'box',
        tabId: 'workspace-99',
        cartesianLayout: {
          complete: true,
          owner: { tabId: 'workspace-99', component: 'box', generation: 12 },
          publicationGeneration: 12,
          payloadSignature: sourcePayloadSignature,
          layoutSignature: sourceLayoutSignature
        }
      },
      plot: { markup: '<svg data-workspace-tab-id="workspace-99"></svg>' }
    };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-99',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: sourceCache,
        archiveRenderCacheSignature: sourcePayloadSignature,
        archiveRenderCacheLayoutSignature: sourceLayoutSignature
      }]
    }, {
      reason: 'unit-cache-signature-rehome',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored).toBeTruthy();
    expect(restored.id).not.toBe('workspace-99');
    expect(restored.layoutState.tabId).toBe(restored.id);
    expect(restored.archiveRenderCache.__graphitixRenderCache.tabId).toBe(restored.id);
    expect(restored.archiveRenderCacheSignature).toBe(restored.payloadSignature);
    expect(restored.archiveRenderCacheLayoutSignature).toBe(restored.layoutSignature);
    expect(restored.archiveRenderCacheLayoutSignature).not.toBe(sourceLayoutSignature);
    expect(restored.archiveRenderCache.__graphitixRenderCache.cartesianLayout).toEqual(expect.objectContaining({
      complete: true,
      owner: expect.objectContaining({ tabId: restored.id, component: 'box', generation: 12 }),
      publicationGeneration: 12,
      payloadSignature: restored.payloadSignature,
      layoutSignature: restored.layoutSignature
    }));
  });

  test('applySessionData rejects stale nested Cartesian archive provenance even when outer signatures match', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = { component: 'box', tabId: 'workspace-76', width: 640, height: 480 };
    const payloadSignature = session.serializePayloadSignature(sourcePayload);
    const layoutSignature = session.serializePayloadSignature(sourceLayout);

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-76',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: {
          __graphitixRenderCache: {
            tabId: 'workspace-76',
            type: 'box',
            complete: true,
            cartesianLayout: {
              complete: true,
              owner: { tabId: 'workspace-76', component: 'box', generation: 9 },
              publicationGeneration: 9,
              payloadSignature: 'stale-cartesian-payload',
              layoutSignature
            }
          },
          plot: { markup: '<svg></svg>' }
        },
        archiveRenderCacheSignature: payloadSignature,
        archiveRenderCacheLayoutSignature: layoutSignature
      }]
    }, {
      reason: 'unit-cartesian-cache-provenance-reject',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored.archiveRenderCache).toBeNull();
    expect(restored.archiveRenderCacheSignature).toBeNull();
    expect(restored.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('applySessionData rejects stale archive cache signature provenance', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = { component: 'box', tabId: 'workspace-77', width: 640, height: 480 };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-77',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: {
          __graphitixRenderCache: { tabId: 'workspace-77', type: 'box', complete: true },
          plot: { markup: '<svg></svg>' }
        },
        archiveRenderCacheSignature: 'stale-payload-signature',
        archiveRenderCacheLayoutSignature: 'stale-layout-signature'
      }]
    }, {
      reason: 'unit-cache-signature-reject',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored.archiveRenderCache).toBeNull();
    expect(restored.archiveRenderCacheSignature).toBeNull();
    expect(restored.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('applySessionData rejects an archive cache whose embedded owner differs from the manifest owner', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = { component: 'box', tabId: 'workspace-88', width: 640, height: 480 };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-88',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: {
          __graphitixRenderCache: { tabId: 'workspace-89', type: 'box', complete: true },
          plot: { markup: '<svg></svg>' }
        },
        archiveRenderCacheSignature: session.serializePayloadSignature(sourcePayload),
        archiveRenderCacheLayoutSignature: session.serializePayloadSignature(sourceLayout)
      }]
    }, {
      reason: 'unit-cache-owner-reject',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored.archiveRenderCache).toBeNull();
    expect(restored.archiveRenderCacheSignature).toBeNull();
    expect(restored.archiveRenderCacheLayoutSignature).toBeNull();
    expect(session.peekArchiveRenderCache(restored, { reason: 'unit-cache-owner-reject-peek' })).toBeNull();
  });

  test('applySessionData rejects an archive cache whose embedded component differs from the tab type', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = { component: 'box', tabId: 'workspace-90', width: 640, height: 480 };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-90',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: {
          __graphitixRenderCache: { tabId: 'workspace-90', type: 'scatter', complete: true },
          plot: { markup: '<svg></svg>' }
        },
        archiveRenderCacheSignature: session.serializePayloadSignature(sourcePayload),
        archiveRenderCacheLayoutSignature: session.serializePayloadSignature(sourceLayout)
      }]
    }, {
      reason: 'unit-cache-component-reject',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored.archiveRenderCache).toBeNull();
    expect(restored.archiveRenderCacheSignature).toBeNull();
    expect(restored.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('applySessionData does not resolve until active workspace activation completes', async () => {
    let resolveActivation;
    const activation = new Promise(resolve => {
      resolveActivation = resolve;
    });
    const activateTab = jest.fn(() => activation);
    let settled = false;

    const restorePromise = session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        payload: { type: 'box', data: [['A'], [1]] },
        layout: null
      }]
    }, {
      reason: 'unit-awaited-restore',
      activateTab
    });
    restorePromise.finally(() => { settled = true; });

    await Promise.resolve();
    expect(activateTab).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      skipPersist: true,
      awaitReadyForRestore: true,
      reason: 'unit-awaited-restore'
    }));
    expect(settled).toBe(false);

    resolveActivation(true);
    const result = await restorePromise;
    expect(result.targetTabId).toBeTruthy();
    expect(settled).toBe(true);
  });

  test('applySessionData hydrates only the saved active tab', async () => {
    const activateTab = jest.fn(() => true);

    const result = await session.applySessionData({
      activeIndex: 1,
      tabs: [
        { title: 'Inactive Box', type: 'box', payload: { type: 'box', data: [['A'], [1]] } },
        { title: 'Active Box', type: 'box', payload: { type: 'box', data: [['B'], [2]] } },
        { title: 'Other Box', type: 'box', payload: { type: 'box', data: [['C'], [3]] } }
      ]
    }, {
      reason: 'unit-lazy-restore',
      activateTab
    });

    expect(activateTab).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(result.targetTabId, expect.objectContaining({
      awaitReadyForRestore: true,
      allowDuringDocumentOperation: true
    }));
    const graphTabs = session.workspaceState.tabs.filter(tab => !tab.isWelcome);
    expect(result.targetTabId).toBe(graphTabs[1].id);
    expect(graphTabs[0].loadedFromArchive).toBe(true);
    expect(graphTabs[2].loadedFromArchive).toBe(true);
  });

  test('applySessionData preserves two distinct archived tabs per component while hydrating only the saved active tab', async () => {
    const componentTypes = ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'];
    const archivedTabs = componentTypes.flatMap((type, componentIndex) => [0, 1].map(variant => ({
      title: `${type}-${variant + 1}`,
      type,
      payload: {
        type,
        data: [[`${type}-label`, `${type}-value`], [`row-${variant + 1}`, componentIndex * 10 + variant]],
        stats: {
          enabled: true,
          test: variant === 0 ? 'parametric' : 'nonparametric',
          alpha: variant === 0 ? 0.05 : 0.01
        },
        config: { variant: `${type}-${variant + 1}` }
      },
      layout: { graph: { width: 420 + variant, height: 360 + componentIndex } }
    })));
    const activeIndex = archivedTabs.findIndex(tab => tab.type === 'box' && tab.payload.stats.test === 'nonparametric');
    const activateTab = jest.fn(() => true);

    const result = await session.applySessionData({ activeIndex, tabs: archivedTabs }, {
      reason: 'unit-dual-tab-per-component-recovery',
      activateTab
    });

    expect(activateTab).toHaveBeenCalledTimes(1);
    const graphTabs = session.workspaceState.tabs.filter(tab => !tab.isWelcome);
    expect(graphTabs).toHaveLength(archivedTabs.length);
    expect(result.targetTabId).toBe(graphTabs[activeIndex].id);
    graphTabs.forEach((tab, index) => {
      expect(tab.type).toBe(archivedTabs[index].type);
      expect(tab.payload).toEqual(archivedTabs[index].payload);
      expect(tab.layoutState).toEqual(archivedTabs[index].layout);
      expect(tab.loadedFromArchive).toBe(true);
      expect(tab.payloadDirty).toBe(false);
    });
    componentTypes.forEach(type => {
      const variants = graphTabs.filter(tab => tab.type === type);
      expect(variants).toHaveLength(2);
      expect(variants.map(tab => tab.payload.stats.test)).toEqual(['parametric', 'nonparametric']);
      expect(variants[0].payload.data).not.toEqual(variants[1].payload.data);
    });
  });

  test('applySessionData rolls back tabs and file metadata when restored activation fails', async () => {
    const previousTab = session.createTab({
      title: 'Current Box',
      type: 'box',
      payload: { type: 'box', data: [['Current'], [7]] }
    });
    session.workspaceState.tabs.push(previousTab);
    session.workspaceState.activeTabId = previousTab.id;
    session.workspaceState.sessionFileHandle = { name: 'current-handle' };
    session.workspaceState.sessionFileName = 'current.graph';
    session.workspaceState.sessionFilePath = 'C:/current.graph';
    session.workspaceState.sessionFileScope = 'workspace';
    window.Shared.workspaceTabs.setOwnedRuntimeRecord(previousTab, 'box', { hydrated: true });

    const activateTab = jest.fn((tabId, meta) => {
      if (meta.reason === 'unit-atomic-rollback') {
        return Promise.reject(new Error('restore activation failed'));
      }
      return true;
    });

    await expect(session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Incoming Box',
        type: 'box',
        payload: { type: 'box', data: [['Incoming'], [9]] }
      }]
    }, {
      reason: 'unit-atomic-rollback',
      fileHandle: { name: 'incoming-handle' },
      fileName: 'incoming.graph',
      filePath: 'C:/incoming.graph',
      fileScope: 'workspace',
      activateTab,
      renderTabs: jest.fn()
    })).rejects.toThrow('restore activation failed');

    expect(session.workspaceState.tabs).toEqual([previousTab]);
    expect(session.workspaceState.activeTabId).toBe(previousTab.id);
    expect(session.workspaceState.sessionFileHandle).toEqual({ name: 'current-handle' });
    expect(session.workspaceState.sessionFileName).toBe('current.graph');
    expect(session.workspaceState.sessionFilePath).toBe('C:/current.graph');
    expect(previousTab.sharedState).toBeTruthy();
    expect(activateTab).toHaveBeenLastCalledWith(previousTab.id, expect.objectContaining({
      allowDuringDocumentOperation: true,
      reason: 'unit-atomic-rollback-rollback'
    }));
  });

});

describe('componentLifecycle — waitForAnimationFrames', () => {
  beforeEach(loadFresh);

  test('count=0 resolves immediately with true', async () => {
    expect(await lc.waitForAnimationFrames(0)).toBe(true);
  });

  test('count=1 resolves with true', async () => {
    expect(await lc.waitForAnimationFrames(1)).toBe(true);
  });

  test('count=3 resolves with true', async () => {
    expect(await lc.waitForAnimationFrames(3)).toBe(true);
  });

  test('non-numeric count defaults to 0 frames (resolves true)', async () => {
    expect(await lc.waitForAnimationFrames('abc')).toBe(true);
  });
});

describe('componentLifecycle — draw scheduling helpers', () => {
  beforeEach(loadFresh);

  test('createStructuralDrawOptions requests a full user redraw without mutating input', () => {
    const source = { tabId: 'tab-a', silentOverlay: true };
    const result = lc.createStructuralDrawOptions('graph-type-change', source);

    expect(result).toEqual(expect.objectContaining({
      tabId: 'tab-a',
      reason: 'graph-type-change',
      structural: true,
      forceOverlay: true,
      viewOnly: false,
      silentOverlay: false,
      userInitiated: true
    }));
    expect(source).toEqual({ tabId: 'tab-a', silentOverlay: true });
    expect(lc.createStructuralDrawOptions('view-mode-change', { viewOnly: true }).viewOnly).toBe(true);
  });

  test('mergeDrawOptions preserves resize finalize canvas recompute', () => {
    const merged = lc.mergeDrawOptions(
      { viewOnly: true, reason: 'resize', resizePhase: 'move' },
      { viewOnly: true, reason: 'resize', resizePhase: 'end', forceCanvasRecompute: true }
    );

    expect(merged.viewOnly).toBe(true);
    expect(merged.reason).toBe('resize');
    expect(merged.resizePhase).toBe('end');
    expect(merged.forceCanvasRecompute).toBe(true);
  });

  test('mergeDrawOptions keeps the strongest semantic render impact', () => {
    expect(lc.mergeRenderImpact('paint', 'layout')).toBe('layout');
    expect(lc.mergeRenderImpact('layout', 'analysis')).toBe('analysis');
    expect(lc.mergeRenderImpact('structural', 'paint')).toBe('structural');
    expect(lc.mergeRenderImpact(null, 'layout')).toBe('layout');
    expect(lc.mergeDrawOptions({}, { renderImpact: 'layout' })).toMatchObject({ renderImpact: 'layout' });
    expect(lc.mergeDrawOptions({ renderImpact: 'layout' }, { reason: 'data-change' })).toMatchObject({ renderImpact: 'analysis' });
    expect(lc.mergeDrawOptions(
      { renderImpact: 'layout', reason: 'legend-toggle' },
      { renderImpact: 'analysis', reason: 'data-change' }
    )).toMatchObject({ renderImpact: 'analysis' });
    expect(lc.isPresentationOnlyDraw({ renderImpact: 'layout' })).toBe(true);
    expect(lc.isPresentationOnlyDraw({ renderImpact: 'analysis' })).toBe(false);
  });

  test('resolveDrawCooldownMs does not throttle live resize frames', () => {
    expect(lc.resolveDrawCooldownMs(
      { viewOnly: true, reason: 'resize', resizePhase: 'start' },
      { pointCount: 100000, pointThreshold: 1200, largeViewMs: 50, defaultMs: 80, resizeLiveMs: 0 }
    )).toBe(0);
    expect(lc.resolveDrawCooldownMs(
      { viewOnly: true, reason: 'resize', resizePhase: 'move' },
      { pointCount: 100000, pointThreshold: 1200, largeViewMs: 50, defaultMs: 80, resizeLiveMs: 0 }
    )).toBe(0);
    expect(lc.resolveDrawCooldownMs(
      { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      { pointCount: 100000, pointThreshold: 1200, largeViewMs: 50, defaultMs: 80 }
    )).toBe(50);
  });

  test('scheduleDrawWithCooldown coalesces pending options through session runtime callbacks', () => {
    let runtime = { lastDrawAt: lc.nowMs(), pendingOptions: null, cooldownTimer: null };
    let scheduledCallback = null;
    const run = jest.fn();
    const updateRuntime = mutator => {
      mutator(runtime);
    };
    const scheduled = lc.scheduleDrawWithCooldown({
      options: { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      runtime,
      cooldownMs: 50,
      updateRuntime,
      getRuntime: () => runtime,
      scheduleTimeout: (_label, callback) => {
        scheduledCallback = callback;
        return 'timer-1';
      },
      run
    });

    expect(scheduled).toBe(true);
    expect(runtime.cooldownTimer).toBe('timer-1');
    expect(runtime.pendingOptions.reason).toBe('resize');
    scheduledCallback();
    expect(runtime.cooldownTimer).toBeNull();
    expect(runtime.pendingOptions).toBeNull();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ resizePhase: 'end' }));
  });

  test('scheduleDrawWithCooldown runs immediately when timeout scheduling fails', () => {
    let runtime = { lastDrawAt: lc.nowMs(), pendingOptions: null, cooldownTimer: null };
    const run = jest.fn();
    const updateRuntime = mutator => {
      mutator(runtime);
    };
    const scheduled = lc.scheduleDrawWithCooldown({
      options: { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      runtime,
      cooldownMs: 50,
      updateRuntime,
      getRuntime: () => runtime,
      scheduleTimeout: () => null,
      run
    });

    expect(scheduled).toBe(true);
    expect(runtime.cooldownTimer).toBeNull();
    expect(runtime.pendingOptions).toBeNull();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ resizePhase: 'end' }));
  });

  test('scheduleDrawWithCooldown treats numeric zero as an existing timer handle', () => {
    let runtime = { lastDrawAt: lc.nowMs(), pendingOptions: null, cooldownTimer: 0 };
    const run = jest.fn();
    const scheduleTimeout = jest.fn();
    const updateRuntime = mutator => {
      mutator(runtime);
    };
    const scheduled = lc.scheduleDrawWithCooldown({
      options: { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      runtime,
      cooldownMs: 50,
      updateRuntime,
      getRuntime: () => runtime,
      scheduleTimeout,
      run
    });

    expect(scheduled).toBe(true);
    expect(runtime.cooldownTimer).toBe(0);
    expect(scheduleTimeout).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  test('runDrawWithOverlayPaintGate treats numeric zero as a valid frame handle', () => {
    const run = jest.fn();
    const handled = lc.runDrawWithOverlayPaintGate({
      componentKey: 'test',
      reason: 'manual-render',
      overlayController: { isActive: () => true },
      delayForOverlay: true,
      scheduleFrame: () => 0,
      run
    });

    expect(handled).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  test('runDrawWithOverlayPaintGate uses owner-scoped frame when overlay is active', () => {
    const run = jest.fn();
    const frame = jest.fn(callback => {
      callback();
      return 'raf-1';
    });
    const handled = lc.runDrawWithOverlayPaintGate({
      componentKey: 'test',
      reason: 'manual-render',
      overlayController: { isActive: () => true },
      delayForOverlay: true,
      scheduleFrame: frame,
      run
    });

    expect(handled).toBe(true);
    expect(frame).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  test('runDrawWithOverlayPaintGate exposes stale owner-frame recovery', () => {
    const run = jest.fn();
    const onFrameStale = jest.fn();
    const scheduleSpy = jest.spyOn(lc, 'scheduleComponentFrame').mockImplementation(
      (_component, _componentKey, _meta, _callback, stale) => {
        stale();
        return 'raf-stale';
      }
    );
    const handled = lc.runDrawWithOverlayPaintGate({
      component: {},
      componentKey: 'heatmap',
      tabId: 'workspace-3',
      reason: 'paste',
      overlayController: { isActive: () => true },
      delayForOverlay: true,
      onFrameStale,
      run
    });

    expect(handled).toBe(true);
    expect(onFrameStale).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    scheduleSpy.mockRestore();
  });

});
