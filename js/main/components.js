(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const namespace = Main.components = Main.components || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};

  const isNodeLike = typeof process !== 'undefined' && !!process?.versions?.node;
  const COMPONENT_BUNDLES = {
    venn: { browserPath: '../components/venn.js', requirePath: '../components/venn.js' },
    box: { browserPath: '../components/box.js', requirePath: '../components/box.js' },
    scatter: { browserPath: '../components/scatter.js', requirePath: '../components/scatter.js' },
    pca: { browserPath: '../components/pca.js', requirePath: '../components/pca.js' },
    line: { browserPath: '../components/line.js', requirePath: '../components/line.js' },
    heatmap: { browserPath: '../components/heatmap.js', requirePath: '../components/heatmap.js' },
    surface: { browserPath: '../components/surface.js', requirePath: '../components/surface.js' },
    roc: { browserPath: '../components/roc.js', requirePath: '../components/roc.js' },
    survival: { browserPath: '../components/survival.js', requirePath: '../components/survival.js' },
    hist: { browserPath: '../components/hist.js', requirePath: '../components/hist.js' },
    pie: { browserPath: '../components/pie.js', requirePath: '../components/pie.js' }
  };
  const bundlePromises = new Map();
  const cachedBundles = new Set();

  function loadComponentBundle(type, options = {}) {
    const descriptor = COMPONENT_BUNDLES[type];
    if (!descriptor) {
      console.debug('Debug: loadComponentBundle missing descriptor', { type });
      return Promise.resolve(window.Components?.[type] || null);
    }
    const cached = bundlePromises.get(type);
    if (cached && !options.forceReload) {
      return cached;
    }
    const useRequire = options.forceRequire || (isNodeLike && typeof require === 'function');
    if (useRequire) {
      let component = null;
      try {
        require(descriptor.requirePath);
        component = window.Components?.[type] || null;
        console.debug('Debug: component bundle required via Node', { type, path: descriptor.requirePath, hasComponent: !!component }); // Debug: Node require path
      } catch (err) {
        console.error('components require bundle error', { type, err });
        throw err;
      }
      if (!cachedBundles.has(type)) {
        cachedBundles.add(type);
        console.debug('Debug: component bundle cached', { type, hasComponent: !!component }); // Debug: cache entry established
      } else {
        console.debug('Debug: component bundle reuse', { type, hasComponent: !!component }); // Debug: cache reuse
      }
      const promise = Promise.resolve(component);
      bundlePromises.set(type, promise);
      return promise;
    }

    const promise = import(/* webpackIgnore: true */ descriptor.browserPath)
      .then(module => {
        const moduleKeys = module ? Object.keys(module) : [];
        console.debug('Debug: component bundle imported', { type, path: descriptor.browserPath, moduleKeys }); // Debug: import keys
        return window.Components?.[type] || null;
      })
      .then(component => {
        if (!cachedBundles.has(type)) {
          cachedBundles.add(type);
          console.debug('Debug: component bundle cached', { type, hasComponent: !!component }); // Debug: cache entry established
        } else {
          console.debug('Debug: component bundle reuse', { type, hasComponent: !!component }); // Debug: cache reuse
        }
        return component;
      })
      .catch(err => {
        bundlePromises.delete(type);
        throw err;
      });
    bundlePromises.set(type, promise);
    return promise;
  }

  function resolveComponentFromGlobal(name) {
    return window.Components?.[name] || null;
  }

  function invokeComponentLifecycle(name, methodName, args = []) {
    const component = resolveComponentFromGlobal(name);
    const handler = component && typeof component[methodName] === 'function'
      ? component[methodName]
      : null;
    if (!handler) {
      return undefined;
    }
    return handler.apply(component, args);
  }

  function getTabPayloadSignature(tabId) {
    const id = String(tabId || '').trim();
    if (!id) {
      return null;
    }
    const tabs = Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
      : [];
    const tab = tabs.find(item => item && String(item.id || '') === id) || null;
    return tab?.payloadSignature ?? null;
  }

  function installGenericRenderCacheValidator(workspace, type) {
    if (!workspace || typeof workspace.restoreRenderCache !== 'function' || typeof workspace.canRestoreRenderCache === 'function') {
      return;
    }
    workspace.canRestoreRenderCache = (cache, meta = {}) => {
      const wrapper = meta?.renderCache || null;
      const tabId = String(meta?.tabId || meta?.tab?.id || '').trim() || null;
      const expectedPayloadSignature = meta?.payloadSignature ?? meta?.tab?.payloadSignature ?? null;
      const expectedLayoutSignature = meta?.layoutSignature ?? meta?.tab?.layoutSignature ?? null;
      const ownerTabId = wrapper?.tabId ?? null;
      const ownerType = wrapper?.type ?? type;
      const payloadSignature = wrapper?.payloadSignature ?? null;
      const layoutSignature = wrapper?.layoutSignature ?? null;
      const fragments = cache && typeof cache === 'object'
        ? Object.keys(cache).filter(key => {
            const item = cache[key];
            return !!(item && typeof item === 'object' && (
              'fragment' in item
              || 'count' in item
              || item.__graphitixKind === 'fragment-payload'
              || Array.isArray(item.nodes)
            ));
          })
        : [];
      const preferredGraphicKey = typeof cache?.__graphitixRenderCache?.graphicKey === 'string'
        ? cache.__graphitixRenderCache.graphicKey
        : null;
      const hasRenderableContent = fragments.some(key => {
        const item = cache[key];
        return item?.fragment || Number(item?.count) > 0 || item?.__graphitixKind === 'fragment-payload' || Array.isArray(item?.nodes);
      }) || !!(
        (preferredGraphicKey && cache?.[preferredGraphicKey])
        || cache?.preview
        || cache?.graph
        || cache?.plot
        || cache?.svg
        || cache?.stage
        || cache?.renderState
        || cache?.analysisState
        || cache?.svgRootState
        || cache?.plotStyle
        || cache?.uiState
      );
      let ok = true;
      let reason = null;
      if (!cache || typeof cache !== 'object') {
        ok = false;
        reason = 'missing-cache-object';
      } else if (ownerTabId && tabId && String(ownerTabId) !== tabId) {
        ok = false;
        reason = 'owner-tab-mismatch';
      } else if (ownerType && type && String(ownerType) !== String(type)) {
        ok = false;
        reason = 'owner-type-mismatch';
      } else if (payloadSignature !== null && expectedPayloadSignature !== null && payloadSignature !== expectedPayloadSignature) {
        ok = false;
        reason = 'payload-signature-mismatch';
      } else if (layoutSignature !== null && expectedLayoutSignature !== null && layoutSignature !== expectedLayoutSignature && meta?.renderCache?.archiveBacked !== true) {
        ok = false;
        reason = 'layout-signature-mismatch';
      } else if (!hasRenderableContent) {
        ok = false;
        reason = 'empty-cache';
      }
      if (!ok) {
        console.debug('Debug: generic render cache validation rejected', {
          type,
          tabId,
          reason,
          fragments,
          ownerTabId,
          ownerType
        });
        return false;
      }
      console.debug('Debug: generic render cache validation accepted', {
        type,
        tabId,
        fragments,
        reason: meta?.reason || null
      });
      return true;
    };
  }



  function cloneForLifecycleTest(value) {
    if (value == null) {
      return value;
    }
    try {
      if (typeof structuredClone === 'function') {
        return structuredClone(value);
      }
    } catch (_err) {
      // Fall back to JSON below.
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_err) {
      return value;
    }
  }

  function stableStringifyForLifecycle(value) {
    const seen = new WeakSet();
    const normalize = input => {
      if (input === null || typeof input !== 'object') {
        return input;
      }
      if (seen.has(input)) {
        return '[Circular]';
      }
      seen.add(input);
      if (Array.isArray(input)) {
        return input.map(item => normalize(item));
      }
      const output = {};
      Object.keys(input).sort().forEach(key => {
        const value = input[key];
        if (typeof value === 'function') {
          return;
        }
        output[key] = normalize(value);
      });
      return output;
    };
    try {
      return JSON.stringify(normalize(value));
    } catch (_err) {
      try { return JSON.stringify(value); } catch (_err2) { return ''; }
    }
  }

  function payloadSignatureForLifecycle(value) {
    try {
      const session = window.Main?.session;
      if (session && typeof session.serializePayloadSignature === 'function') {
        return session.serializePayloadSignature(value);
      }
    } catch (_err) {
      // Fall through to stable stringify.
    }
    return stableStringifyForLifecycle(value);
  }

  function describePayloadRoundTripDrift(before, after) {
    const left = before && typeof before === 'object' ? before : {};
    const right = after && typeof after === 'object' ? after : {};
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    return keys.filter(key => payloadSignatureForLifecycle(left[key]) !== payloadSignatureForLifecycle(right[key]));
  }

  function shouldRunPayloadRoundTripSelfTest(meta = {}) {
    if (meta.roundTripSelfTest === false) {
      return false;
    }
    if (meta.roundTripSelfTest === true || meta.forceRoundTripSelfTest === true) {
      return true;
    }
    if (Shared.__payloadRoundTripSelfTest === true || window.GraphitixPayloadRoundTripSelfTest === true) {
      return true;
    }
    try {
      if (window.localStorage?.getItem?.('graphitix.payloadRoundTripSelfTest') === '1') {
        return true;
      }
    } catch (_err) {
      // localStorage may be blocked in some shells.
    }
    const reason = String(meta.reason || '').toLowerCase();
    return Shared.__payloadRoundTripSelfTest !== false && (
      reason.includes('archive-save')
      || reason.includes('pre-save')
      || reason.includes('manual-save')
      || reason.includes('payload-round-trip')
    );
  }

  function runWorkspacePayloadRoundTripSelfTest(workspace, type, payload, meta = {}) {
    if (!workspace || typeof workspace.getPayload !== 'function' || typeof workspace.loadFromPayload !== 'function') {
      return { skipped: true, reason: 'missing-payload-hooks' };
    }
    if (!shouldRunPayloadRoundTripSelfTest(meta)) {
      return { skipped: true, reason: 'disabled' };
    }
    const tabId = meta.tabId || meta.tab?.id || null;
    const reason = meta.reason || 'payload-round-trip-self-test';
    let runtimeSnapshot = null;
    let beforePayload = null;
    let testPayload = null;
    try {
      try {
        beforePayload = cloneForLifecycleTest(workspace.getPayload());
      } catch (err) {
        console.warn('Debug: payload round-trip self-test could not capture pre-test payload', {
          type,
          tabId,
          reason,
          err: err?.message || String(err)
        });
      }
      try {
        if (typeof workspace.captureRuntimeState === 'function') {
          runtimeSnapshot = cloneForLifecycleTest(workspace.captureRuntimeState({
            ...meta,
            tabId,
            type,
            reason: `${reason}:capture-runtime-before`
          }));
        }
      } catch (err) {
        console.warn('Debug: payload round-trip self-test runtime capture failed', {
          type,
          tabId,
          reason,
          err: err?.message || String(err)
        });
      }
      testPayload = cloneForLifecycleTest(payload || beforePayload || null);
      if (!testPayload || typeof testPayload !== 'object') {
        return { skipped: true, reason: 'missing-payload' };
      }
      const expectedSignature = payloadSignatureForLifecycle(testPayload);
      workspace.loadFromPayload(cloneForLifecycleTest(testPayload), {
        ...meta,
        reason: `${reason}:apply-test-payload`,
        skipDraw: true,
        skipInitialDraw: true,
        skipPayloadSizing: true,
        roundTripSelfTest: true
      });
      const roundTripped = cloneForLifecycleTest(workspace.getPayload());
      const actualSignature = payloadSignatureForLifecycle(roundTripped);
      const ok = !!expectedSignature && expectedSignature === actualSignature;
      const changedTopLevelKeys = ok ? [] : describePayloadRoundTripDrift(testPayload, roundTripped);
      if (!ok) {
        console.warn('Debug: payload round-trip self-test mismatch', {
          type,
          tabId,
          reason,
          changedTopLevelKeys,
          expectedSignatureLength: expectedSignature ? expectedSignature.length : 0,
          actualSignatureLength: actualSignature ? actualSignature.length : 0
        });
      } else {
        console.debug('Debug: payload round-trip self-test passed', {
          type,
          tabId,
          reason,
          signatureLength: expectedSignature.length
        });
      }
      return { ok, skipped: false, expectedSignature, actualSignature, changedTopLevelKeys };
    } catch (err) {
      console.error('payload round-trip self-test error', {
        type,
        tabId,
        reason,
        err
      });
      return { ok: false, error: err?.message || String(err) };
    } finally {
      try {
        if (beforePayload && typeof workspace.loadFromPayload === 'function') {
          workspace.loadFromPayload(cloneForLifecycleTest(beforePayload), {
            ...meta,
            reason: `${reason}:restore-pre-test-payload`,
            skipDraw: true,
            skipInitialDraw: true,
            skipPayloadSizing: true,
            roundTripSelfTestRestore: true
          });
        }
      } catch (err) {
        console.error('payload round-trip self-test restore payload error', { type, tabId, err });
      }
      try {
        if (runtimeSnapshot && typeof workspace.applyRuntimeState === 'function') {
          workspace.applyRuntimeState(runtimeSnapshot, {
            ...meta,
            tabId,
            type,
            reason: `${reason}:restore-runtime-after`
          });
        }
      } catch (err) {
        console.error('payload round-trip self-test restore runtime error', { type, tabId, err });
      }
    }
  }

  function installStandardWorkspaceLifecycle(workspace) {
    if (!workspace || !workspace.type) {
      return workspace;
    }
    const type = workspace.type;
    if (Shared.componentLifecycle?.attachWorkspace && !workspace.__lifecycleDescriptor) {
      Shared.componentLifecycle.attachWorkspace(workspace, buildWorkspaceLifecycleDescriptor(type, workspace));
    }
    if (typeof workspace.activateTab !== 'function') {
      workspace.activateTab = (tab, meta) => {
        const component = resolveComponentFromGlobal(type);
        if (component && typeof component.activateTab === 'function') {
          return component.activateTab(tab, meta);
        }
        console.debug('Debug: workspace activateTab noop', { type, tabId: tab?.id || null, reason: meta?.reason || null });
        return undefined;
      };
    }
    if (typeof workspace.deactivateTab !== 'function') {
      workspace.deactivateTab = (tab, meta) => {
        const result = invokeComponentLifecycle(type, 'deactivateTab', [tab, meta]);
        if (typeof result === 'undefined') {
          console.debug('Debug: workspace deactivateTab noop', { type, tabId: tab?.id || null, reason: meta?.reason || null });
        }
        return result;
      };
    }
    if (typeof workspace.disposeTab !== 'function') {
      workspace.disposeTab = (tab, meta) => {
        const result = invokeComponentLifecycle(type, 'disposeTab', [tab, meta]);
        try {
          window.Shared?.hot?.disposeTableForTab?.(type, tab?.id || meta?.tabId || null, {
            reason: meta?.reason || 'workspace-dispose-tab',
            type
          });
        } catch (err) {
          console.error('workspace disposeTab table cleanup error', { type, tabId: tab?.id || null, err });
        }
        return result;
      };
    }
    if (typeof workspace.captureRuntimeState !== 'function') {
      workspace.captureRuntimeState = meta => {
        const captured = invokeComponentLifecycle(type, 'captureRuntimeState', [meta]);
        return captured && typeof captured === 'object' ? captured : null;
      };
    }
    if (typeof workspace.applyRuntimeState !== 'function') {
      workspace.applyRuntimeState = (snapshot, meta) => invokeComponentLifecycle(type, 'applyRuntimeState', [snapshot, meta]);
    }
    if (typeof workspace.captureUiState !== 'function') {
      workspace.captureUiState = meta => {
        const component = resolveComponentFromGlobal(type);
        return typeof component?.captureUiState === 'function'
          ? (component.captureUiState(meta || {}) || null)
          : null;
      };
    }
    if (typeof workspace.applyUiState !== 'function') {
      workspace.applyUiState = (state, meta) => {
        const component = resolveComponentFromGlobal(type);
        return typeof component?.applyUiState === 'function'
          ? component.applyUiState(state, meta || {})
          : false;
      };
    }
    if (typeof workspace.awaitReadyForSnapshot !== 'function') {
      workspace.awaitReadyForSnapshot = meta => {
        const component = resolveComponentFromGlobal(type);
        if (component && typeof component.awaitReadyForSnapshot === 'function') {
          return component.awaitReadyForSnapshot({ ...(meta || {}), componentKey: type, type });
        }
        return Shared.componentLifecycle?.awaitReadyForSnapshot?.(component || workspace, { ...(meta || {}), componentKey: type, type })
          || Promise.resolve({ ok: true, type, skipped: true, reason: 'missing-componentLifecycle' });
      };
    }
    if (typeof workspace.roundTripPayload !== 'function' || workspace.roundTripPayload.__legacyRoundTripPayload === true) {
      workspace.roundTripPayload = (payload, meta) => Shared.componentLifecycle?.roundTripPayload?.(workspace, payload, { ...(meta || {}), componentKey: type, type })
        || runWorkspacePayloadRoundTripSelfTest(workspace, type, payload, meta || {});
    }
    installGenericRenderCacheValidator(workspace, type);
    workspace.__lifecycleContract = {
      activateTab: typeof workspace.activateTab === 'function',
      deactivateTab: typeof workspace.deactivateTab === 'function',
      disposeTab: typeof workspace.disposeTab === 'function',
      captureRuntimeState: typeof workspace.captureRuntimeState === 'function',
      applyRuntimeState: typeof workspace.applyRuntimeState === 'function',
      captureUiState: typeof workspace.captureUiState === 'function',
      applyUiState: typeof workspace.applyUiState === 'function',
      awaitReadyForSnapshot: typeof workspace.awaitReadyForSnapshot === 'function',
      roundTripPayload: typeof workspace.roundTripPayload === 'function',
      captureRenderCache: typeof workspace.captureRenderCache === 'function',
      canRestoreRenderCache: typeof workspace.canRestoreRenderCache === 'function',
      restoreRenderCache: typeof workspace.restoreRenderCache === 'function'
    };
    console.debug('Debug: workspace lifecycle contract installed', { type, contract: workspace.__lifecycleContract });
    return workspace;
  }

  function installComponentLifecycleDefaults(type, component) {
    if (!component || typeof component !== 'object') {
      return component;
    }
    const lifecycleDescriptor = Shared.componentLifecycle?.getDescriptor?.(type) || null;
    if (lifecycleDescriptor) {
      Shared.componentLifecycle?.attachComponent?.(type, component, lifecycleDescriptor);
      lifecycleDescriptor.component = component;
      component.__lifecycleDescriptor = lifecycleDescriptor;
      component.__stateModel = component.__stateModel || lifecycleDescriptor.stateModel || Shared.componentLifecycle?.createStateModel?.(type, {
        payload: () => ({}),
        runtime: () => ({}),
        ui: () => ({}),
        layout: () => ({}),
        cache: () => ({}),
        async: () => ({})
      }) || null;
      component.__asyncScope = component.__asyncScope || lifecycleDescriptor.asyncScope || Shared.componentLifecycle?.createAsyncScope?.(type) || null;
      component.__componentKey = component.__componentKey || type;
    }
    if (typeof component.deactivateTab !== 'function') {
      component.deactivateTab = (tab, meta) => {
        console.debug('Debug: component deactivateTab noop', { type, tabId: tab?.id || null, reason: meta?.reason || null });
        return false;
      };
    }
    if (typeof component.disposeTab !== 'function') {
      component.disposeTab = (tab, meta) => {
        try {
          window.Shared?.hot?.disposeTableForTab?.(type, tab?.id || meta?.tabId || null, {
            reason: meta?.reason || 'component-dispose-tab',
            type
          });
        } catch (err) {
          console.error('component disposeTab table cleanup error', { type, tabId: tab?.id || null, err });
        }
        console.debug('Debug: component disposeTab default complete', { type, tabId: tab?.id || null, reason: meta?.reason || null });
        return true;
      };
    }
    if (typeof component.captureRuntimeState !== 'function') {
      component.captureRuntimeState = () => null;
    }
    if (typeof component.applyRuntimeState !== 'function') {
      component.applyRuntimeState = () => false;
    }
    if (typeof component.captureUiState !== 'function') {
      component.captureUiState = () => null;
    }
    if (typeof component.applyUiState !== 'function') {
      component.applyUiState = () => false;
    }
    if (typeof component.awaitReadyForSnapshot !== 'function') {
      component.awaitReadyForSnapshot = meta => Shared.componentLifecycle?.awaitReadyForSnapshot?.(component, { ...(meta || {}), componentKey: type, type })
        || Promise.resolve({ ok: true, type, skipped: true, reason: 'missing-componentLifecycle' });
    }
    component.__lifecycleDefaultsInstalled = true;
    return component;
  }

  function ensureComponent(name, options = {}) {
    const component = installComponentLifecycleDefaults(name, resolveComponentFromGlobal(name));
    if (component && !options.forceReload) {
      try {
        let ensureResult = null;
        if (typeof component.ensure === 'function') {
          ensureResult = component.ensure(options.ensureOptions);
        } else if (typeof component.init === 'function') {
          ensureResult = component.init(options.ensureOptions);
        }
        if (ensureResult && typeof ensureResult.then === 'function') {
          return ensureResult.then(() => {
            console.debug('Debug: ensureComponent resolved async (cached)', { name, ready: !!component.ready });
            return component;
          });
        }
        console.debug('Debug: ensureComponent resolved synchronously (cached)', { name, ready: !!component.ready });
        return component;
      } catch (err) {
        console.error('ensureComponent error during cached component ensure', {
          name,
          message: err?.message || String(err)
        });
        return component;
      }
    }

    return loadComponentBundle(name, options).then(() => {
      const loadedComponent = installComponentLifecycleDefaults(name, resolveComponentFromGlobal(name));
      if (!loadedComponent) {
        console.debug('Debug: ensureComponent missing global export', { name });
        return null;
      }
      let ensureResult = null;
      if (typeof loadedComponent.ensure === 'function') {
        ensureResult = loadedComponent.ensure(options.ensureOptions);
      } else if (typeof loadedComponent.init === 'function') {
        ensureResult = loadedComponent.init(options.ensureOptions);
      }
      return Promise.resolve(ensureResult).then(() => {
        console.debug('Debug: ensureComponent resolved', { name, ready: !!loadedComponent.ready }); // Debug: ensure completion
        return loadedComponent;
      });
    }).catch(err => {
      console.error('ensureComponent error', {
        name,
        message: err?.message || String(err)
      });
      return resolveComponentFromGlobal(name) || null;
    });
  }

  function ensureWorkspaceComponent(type, options) {
    return ensureComponent(type, {
      ensureOptions: options || {}
    });
  }

  namespace.getLifecycleDescriptor = type => Shared.componentLifecycle?.getDescriptor?.(type) || null;
  namespace.getLifecycleSpecs = () => ({ ...WORKSPACE_LIFECYCLE_SPECS });

  namespace.loadComponentBundle = function loadComponentBundleForExternal(type, options) {
    return loadComponentBundle(type, options || {});
  };

  namespace.preloadAllBundlesSync = function preloadAllBundlesSync() {
    Object.keys(COMPONENT_BUNDLES).forEach(type => {
      try {
        const promise = loadComponentBundle(type, { forceRequire: true });
        bundlePromises.set(type, promise);
      } catch (err) {
        console.error('components preload error', { type, err });
      }
    });
  };

  function createRegistryDrawScheduler(componentKey, componentName = componentKey) {
    const registryAsyncOwner = { __componentKey: componentKey };
    const runRegistryDraw = (options = {}) => {
      const meta = options?.__workspaceSessionMeta || null;
      const tabId = options?.tabId || meta?.tabId || null;
      const reason = options?.reason || options?.source || null;
      if (Shared.workspaceTabs?.isSessionMetaCurrent && !Shared.workspaceTabs.isSessionMetaCurrent(componentKey, meta)) {
        console.debug('Debug: registry draw skipped stale tab session', {
          componentKey,
          tabId: meta?.tabId || null,
          sessionGeneration: meta?.sessionGeneration || 0,
          reason
        });
        Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey, tabId, action: 'draw-skipped-stale-session', reason });
        return;
      }
      if (Shared.componentLifecycle?.shouldSuppressDraw?.(componentKey, { ...(options || {}), tabId, reason })) {
        console.debug('Debug: registry draw suppressed by lifecycle transaction', { componentKey, tabId, reason });
        Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey, tabId, action: 'draw-suppressed', reason, details: { source: options?.source || null } });
        return;
      }
      const draw = window.Components?.[componentName]?.draw;
      if (typeof draw === 'function') {
        Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey, tabId, action: 'draw-executed', reason, details: { scheduler: 'registry' } });
        draw(options || {});
      }
    };
    const raw = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(registryAsyncOwner, componentKey, runRegistryDraw, { reason: 'registry-draw-frame' })
      : runRegistryDraw;
    return Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey,
          debugLabel: `registry-${componentKey}`,
          getTabId: options => options?.tabId || options?.workspaceTabId || options?.tab?.id || null,
          scheduleRaw: raw
        })
      : raw;
  };

  function resolveWorkspacePreviewSvg(type, tab) {
    const tabId = tab?.id || null;
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tabId, type) || null;
    const hostRoot = mountedRoot || document.getElementById(`${type}Page`) || null;
    if (!hostRoot || typeof hostRoot.querySelector !== 'function') {
      return null;
    }
    const isUiIconSvg = node => {
      if (!node || String(node.nodeName || '').toLowerCase() !== 'svg') {
        return false;
      }
      const className = String(node.getAttribute?.('class') || '').toLowerCase();
      if (className.includes('resizer-options-icon')) {
        return true;
      }
      const ariaHidden = String(node.getAttribute?.('aria-hidden') || '').toLowerCase() === 'true';
      const focusable = String(node.getAttribute?.('focusable') || '').toLowerCase() === 'false';
      const hasPlotMarkers = !!node.querySelector?.('[data-export-layer], [data-layer], [data-venn-trace-id], [data-upset-trace-id]');
      if (ariaHidden && focusable && !hasPlotMarkers) {
        return true;
      }
      if (node.closest?.('.workspace-toolbar, .resizer-control-tray, .resizer-options, .resizer-options-menu, button')) {
        return true;
      }
      return false;
    };
    const hasPlotMarkers = node => !!node?.querySelector?.('[data-export-layer], [data-layer], [data-venn-trace-id], [data-upset-trace-id]');
    const isLikelyPlotSvg = node => {
      if (!node || String(node.nodeName || '').toLowerCase() !== 'svg') {
        return false;
      }
      if (isUiIconSvg(node)) {
        return false;
      }
      if (node.getAttribute?.('data-preview-source') === 'true') {
        return true;
      }
      if (hasPlotMarkers(node)) {
        return true;
      }
      const viewBox = String(node.getAttribute?.('viewBox') || '').trim();
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(item => Number.parseFloat(item));
        if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
          if (parts[2] < 80 || parts[3] < 80) {
            return false;
          }
        }
      }
      const width = Number.parseFloat(node.getAttribute?.('width'));
      const height = Number.parseFloat(node.getAttribute?.('height'));
      if (Number.isFinite(width) && Number.isFinite(height) && (width < 80 || height < 80)) {
        return false;
      }
      return true;
    };
    const tagged = hostRoot.querySelector('.svgbox svg[data-preview-source="true"], svg[data-preview-source="true"]');
    if (isLikelyPlotSvg(tagged)) {
      return tagged;
    }
    const candidates = Array.from(hostRoot.querySelectorAll('.svgbox svg, svg[data-preview-source="true"]'));
    const likely = candidates.filter(isLikelyPlotSvg);
    if (!likely.length) {
      return null;
    }
    return likely.find(node => hasPlotMarkers(node))
      || likely.find(node => !node.closest('.workspace-toolbar, .resizer-control-tray, .resizer-options, .resizer-options-menu, button'))
      || likely[0]
      || null;
  }

  const scheduleDrawBoxplot = createRegistryDrawScheduler('box', 'box');
  const scheduleDrawScatter = createRegistryDrawScheduler('scatter', 'scatter');
  const scheduleDrawPca = createRegistryDrawScheduler('pca', 'pca');
  const scheduleDrawLine = createRegistryDrawScheduler('line', 'line');
  const scheduleDrawHeatmap = createRegistryDrawScheduler('heatmap', 'heatmap');
  const scheduleDrawSurface = createRegistryDrawScheduler('surface', 'surface');
  const scheduleDrawHist = createRegistryDrawScheduler('hist', 'hist');
  const scheduleDrawPie = createRegistryDrawScheduler('pie', 'pie');
  const scheduleDrawSurvival = createRegistryDrawScheduler('survival', 'survival');
  const scheduleDraw = {
    boxplot: scheduleDrawBoxplot,
    scatter: scheduleDrawScatter,
    pca: scheduleDrawPca,
    line: scheduleDrawLine,
    heatmap: scheduleDrawHeatmap,
    hist: scheduleDrawHist,
    pie: scheduleDrawPie,
    survival: scheduleDrawSurvival
  };
  console.debug('Debug: main tab-scoped lifecycle schedulers ready', { schedulers: ['boxplot', 'scatter', 'pca', 'line', 'heatmap', 'hist', 'pie', 'survival'] });

  const WORKSPACES = {
    venn: {
      type: 'venn',
      tabLabel: 'Venn',
      perTabDomInstances: true,
      element: document.getElementById('vennPage'),
      ensure: options => ensureWorkspaceComponent('venn', options),
      draw: meta => window.Components?.venn?.draw?.(meta || {}),
      getPreviewSvg: tab => window.Components?.venn?.getThumbnailSvg?.(tab) || window.Components?.venn?.getPreviewSvg?.(tab),
      getPayload: () => window.Components?.venn?.getPayload?.(),
      loadFromFile: blob => window.Components?.venn?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.venn?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.venn?.createEmptyPayload?.(),
      captureRenderCache: meta => window.Components?.venn?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.venn?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.venn?.restoreRenderCache?.(cache, meta),
      getLayoutState: options => componentLayout.captureStateFor?.('venn', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('venn', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('venn', state, options || {})
    },
    box: {
      type: 'box',
      tabLabel: 'Box Plot',
      perTabDomInstances: true,
      element: document.getElementById('boxPage'),
      ensure: options => ensureWorkspaceComponent('box', options),
      draw: meta => window.Components?.box?.draw?.(meta || {}),
      getPreviewSvg: tab => window.Components?.box?.getThumbnailSvg?.(tab) || window.Components?.box?.getPreviewSvg?.(tab),
      getPayload: () => window.Components?.box?.getPayload?.(),
      loadFromFile: blob => window.Components?.box?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.box?.loadFromPayload?.(payload, options),
      applyColorSchemePayload: (payload, options) => window.Components?.box?.applyColorSchemePayload?.(payload, options),
      createEmptyPayload: () => window.Components?.box?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.box?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.box?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.box?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.box?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.box?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.box?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('box', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('box', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('box', state, options || {})
    },
    scatter: {
      type: 'scatter',
      tabLabel: 'Scatter',
      perTabDomInstances: true,
      element: document.getElementById('scatterPage'),
      ensure: options => ensureWorkspaceComponent('scatter', options),
      draw: meta => window.Components?.scatter?.draw?.(meta || {}),
      getPreviewSvg: tab => window.Components?.scatter?.getPreviewSvg?.(tab) || window.Components?.scatter?.getThumbnailSvg?.(tab),
      getPayload: () => window.Components?.scatter?.getPayload?.(),
      loadFromFile: blob => window.Components?.scatter?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.scatter?.loadFromPayload?.(payload, options),
      applyColorSchemePayload: (payload, options) => window.Components?.scatter?.applyColorSchemePayload?.(payload, options),
      createEmptyPayload: () => window.Components?.scatter?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.scatter?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.scatter?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.scatter?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.scatter?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.scatter?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.scatter?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('scatter', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('scatter', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('scatter', state, options || {})
    },
    pca: {
      type: 'pca',
      tabLabel: 'PCA / MDS',
      perTabDomInstances: true,
      element: document.getElementById('pcaPage'),
      ensure: options => ensureWorkspaceComponent('pca', options),
      draw: meta => scheduleDrawPca(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('pca', tab),
      getPayload: () => window.Components?.pca?.getPayload?.(),
      loadFromFile: blob => window.Components?.pca?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pca?.loadFromPayload?.(payload, options),
      applyColorSchemePayload: (payload, options) => window.Components?.pca?.applyColorSchemePayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pca?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.pca?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.pca?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.pca?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.pca?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.pca?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.pca?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('pca', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('pca', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('pca', state, options || {})
    },
    line: {
      type: 'line',
      tabLabel: 'Line Graph',
      perTabDomInstances: true,
      element: document.getElementById('linePage'),
      ensure: options => ensureWorkspaceComponent('line', options),
      draw: meta => scheduleDrawLine(meta || {}),
      getPreviewSvg: tab => window.Components?.line?.getPreviewSvg?.(tab) || window.Components?.line?.getThumbnailSvg?.(tab) || resolveWorkspacePreviewSvg('line', tab),
      getPayload: () => window.Components?.line?.getPayload?.(),
      loadFromFile: blob => window.Components?.line?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.line?.loadFromPayload?.(payload, options),
      applyColorSchemePayload: (payload, options) => window.Components?.line?.applyColorSchemePayload?.(payload, options),
      createEmptyPayload: () => window.Components?.line?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.line?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.line?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.line?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.line?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.line?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.line?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('line', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('line', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('line', state, options || {})
    },
    heatmap: {
      type: 'heatmap',
      tabLabel: 'Heatmap',
      perTabDomInstances: true,
      element: document.getElementById('heatmapPage'),
      ensure: options => ensureWorkspaceComponent('heatmap', options),
      draw: meta => scheduleDrawHeatmap(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('heatmap', tab),
      getPayload: () => window.Components?.heatmap?.getPayload?.(),
      loadFromFile: blob => window.Components?.heatmap?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.heatmap?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.heatmap?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.heatmap?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.heatmap?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.heatmap?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.heatmap?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.heatmap?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.heatmap?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('heatmap', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('heatmap', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('heatmap', state, options || {})
    },
    surface: {
      type: 'surface',
      tabLabel: 'Surface Plot',
      perTabDomInstances: true,
      element: document.getElementById('surfacePage'),
      ensure: options => ensureWorkspaceComponent('surface', options),
      draw: meta => scheduleDrawSurface(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('surface', tab),
      getPayload: () => window.Components?.surface?.getPayload?.(),
      loadFromFile: blob => window.Components?.surface?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.surface?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.surface?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.surface?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.surface?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.surface?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.surface?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.surface?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.surface?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('surface', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('surface', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('surface', state, options || {})
    },
    roc: {
      type: 'roc',
      tabLabel: 'ROC / PR',
      perTabDomInstances: true,
      element: document.getElementById('rocPage'),
      ensure: options => ensureWorkspaceComponent('roc', options),
      draw: meta => window.Components?.roc?.draw?.(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('roc', tab),
      getPayload: () => window.Components?.roc?.getPayload?.(),
      loadFromFile: blob => window.Components?.roc?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.roc?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.roc?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.roc?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.roc?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.roc?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.roc?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.roc?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.roc?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('roc', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('roc', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('roc', state, options || {})
    },
    survival: {
      type: 'survival',
      tabLabel: 'Survival',
      perTabDomInstances: true,
      element: document.getElementById('survivalPage'),
      ensure: options => ensureWorkspaceComponent('survival', options),
      draw: meta => scheduleDrawSurvival(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('survival', tab),
      getPayload: () => window.Components?.survival?.getPayload?.(),
      loadFromFile: blob => window.Components?.survival?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.survival?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.survival?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.survival?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.survival?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.survival?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.survival?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.survival?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.survival?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('survival', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('survival', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('survival', state, options || {})
    },
    hist: {
      type: 'hist',
      tabLabel: 'Histogram',
      perTabDomInstances: true,
      element: document.getElementById('histPage'),
      ensure: options => ensureWorkspaceComponent('hist', options),
      draw: meta => scheduleDrawHist(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('hist', tab),
      getPayload: () => window.Components?.hist?.getPayload?.(),
      loadFromFile: blob => window.Components?.hist?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.hist?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.hist?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.hist?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.hist?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.hist?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.hist?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.hist?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.hist?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('hist', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('hist', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('hist', state, options || {})
    },
    pie: {
      type: 'pie',
      tabLabel: 'Proportion',
      perTabDomInstances: true,
      element: document.getElementById('piePage'),
      ensure: options => ensureWorkspaceComponent('pie', options),
      draw: meta => scheduleDrawPie(meta || {}),
      getPreviewSvg: tab => window.Components?.pie?.getThumbnailSvg?.(tab) || window.Components?.pie?.getPreviewSvg?.(tab) || resolveWorkspacePreviewSvg('pie', tab),
      getPayload: () => window.Components?.pie?.getPayload?.(),
      loadFromFile: blob => window.Components?.pie?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pie?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pie?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.pie?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.pie?.captureRenderCache?.(meta),
      canRestoreRenderCache: (cache, meta) => window.Components?.pie?.canRestoreRenderCache?.(cache, meta),
      restoreRenderCache: (cache, meta) => window.Components?.pie?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.pie?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.pie?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('pie', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('pie', options || {}),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('pie', state, options || {})
    }
  };

  const WORKSPACE_LIFECYCLE_SPECS = {
    venn: {
      root: { pageId: 'vennPage', sentinelSelector: '#vennHot' },
      table: { wrapperSelector: '#vennHotWrapper', containerSelector: '#vennHot' },
      renderCache: { selectors: ['#vennGraphPanel svg', '#vennPlot svg', 'svg', 'canvas'], graphSelectors: ['#vennGraphPanel svg', 'svg'], markupPattern: /(<svg\b|data-venn-trace-id|data-upset-trace-id)/i }
    },
    box: {
      root: { pageId: 'boxPage', sentinelSelector: '#boxPlot' },
      table: { wrapperSelector: '#boxTablePanel', containerSelector: '#boxTablePanel' },
      renderCache: { selectors: ['#boxPlot svg', '#boxPlot canvas', 'svg', 'canvas'], graphSelectors: ['#boxPlot svg', '#boxPlot canvas', 'svg', 'canvas'], markupPattern: /(<svg\b|<canvas\b|data-significance|data-export-layer)/i }
    },
    scatter: {
      root: { pageId: 'scatterPage', sentinelSelector: '#scatterHot' },
      table: { wrapperSelector: '#scatterHotWrapper', containerSelector: '#scatterHot' },
      renderCache: { selectors: ['#scatterPlot svg', '#scatterPlot canvas', 'svg', 'canvas'], graphSelectors: ['#scatterPlot svg', '#scatterPlot canvas', 'svg', 'canvas'], markupPattern: /(<svg\b|<canvas\b|data-export-layer|data-layer)/i }
    },
    pca: {
      root: { pageId: 'pcaPage', sentinelSelector: '#pcaHot' },
      table: { wrapperSelector: '#pcaHotWrapper', containerSelector: '#pcaHot' },
      renderCache: { selectors: ['#pcaPlot svg', '#pcaScreePlot svg', 'svg', 'canvas'], graphSelectors: ['#pcaPlot svg', '#pcaScreePlot svg', 'svg'], markupPattern: /(<svg\b|id=["']pcaSvg["']|id=["']pcaScreePlot["'])/i }
    },
    line: {
      root: { pageId: 'linePage', sentinelSelector: '#lineHot' },
      table: { wrapperSelector: '#lineHotWrapper', containerSelector: '#lineHot' },
      renderCache: { selectors: ['#linePlot svg', '#linePlot canvas', 'svg', 'canvas'], graphSelectors: ['#linePlot svg', '#linePlot canvas', 'svg', 'canvas'], markupPattern: /(<svg\b|<canvas\b|data-export-layer|data-layer)/i }
    },
    heatmap: {
      root: { pageId: 'heatmapPage', sentinelSelector: '#heatmapHot' },
      table: { wrapperSelector: '#heatmapHotWrapper', containerSelector: '#heatmapHot' },
      renderCache: { selectors: ['#heatmapSvg', '#heatmapGraphPanel svg', 'svg', 'canvas'], graphSelectors: ['#heatmapSvg', '#heatmapGraphPanel svg', 'svg'], markupPattern: /(<svg\b|id=["']heatmapSvg["'])/i }
    },
    surface: {
      root: { pageId: 'surfacePage', sentinelSelector: '#surfaceHot' },
      table: { wrapperSelector: '#surfaceHotWrapper', containerSelector: '#surfaceHot' },
      renderCache: { selectors: ['#surfaceSvg', '#surfaceGraphPanel svg', 'svg', 'canvas'], graphSelectors: ['#surfaceSvg', '#surfaceGraphPanel svg', 'svg'], markupPattern: /(<svg\b|id=["']surfaceSvg["'])/i }
    },
    roc: {
      root: { pageId: 'rocPage', sentinelSelector: '#rocHot' },
      table: { wrapperSelector: '#rocHotWrapper', containerSelector: '#rocHot' },
      renderCache: { selectors: ['#rocPlot svg', 'svg', 'canvas'], graphSelectors: ['#rocPlot svg', 'svg'], markupPattern: /(<svg\b|id=["']rocSvg["'])/i }
    },
    survival: {
      root: { pageId: 'survivalPage', sentinelSelector: '#survivalHot' },
      table: { wrapperSelector: '#survivalHotWrapper', containerSelector: '#survivalHot' },
      renderCache: { selectors: ['#survivalPlot svg', 'svg', 'canvas'], graphSelectors: ['#survivalPlot svg', 'svg'], markupPattern: /(<svg\b|id=["']survivalSvg["'])/i }
    },
    hist: {
      root: { pageId: 'histPage', sentinelSelector: '#histHot' },
      table: { wrapperSelector: '#histHotWrapper', containerSelector: '#histHot' },
      renderCache: { selectors: ['#histPlot svg', 'svg', 'canvas'], graphSelectors: ['#histPlot svg', 'svg'], markupPattern: /(<svg\b|id=["']histSvg["'])/i }
    },
    pie: {
      root: { pageId: 'piePage', sentinelSelector: '#pieHot' },
      table: { wrapperSelector: '#pieHotWrapper', containerSelector: '#pieHot' },
      renderCache: { selectors: ['#piePlot svg', 'svg', 'canvas'], graphSelectors: ['#piePlot svg', 'svg'], markupPattern: /(<svg\b|id=["']pieSvg["'])/i }
    }
  };

  function buildWorkspaceLifecycleDescriptor(type, workspace) {
    const spec = WORKSPACE_LIFECYCLE_SPECS[type] || {};
    return {
      componentKey: type,
      type,
      workspace,
      root: spec.root || {},
      table: {
        ...(spec.table || {}),
        getInstance: () => window.Components?.[type]?.hot || window.Components?.[type]?.grid || null
      },
      payload: {
        get: () => workspace.getPayload?.(),
        load: (payload, options) => workspace.loadFromPayload?.(payload, options),
        createEmpty: () => workspace.createEmptyPayload?.()
      },
      runtime: {
        capture: meta => workspace.captureRuntimeState?.(meta),
        apply: (snapshot, meta) => workspace.applyRuntimeState?.(snapshot, meta)
      },
      layout: {
        capture: meta => workspace.getLayoutState?.(meta),
        apply: (state, meta) => workspace.applyLayoutState?.(state, meta)
      },
      renderCache: spec.renderCache || {},
      snapshot: {
        isIdle: meta => window.Components?.[type]?.isIdleForSnapshot?.(meta),
        cancelPendingWork: (tab, meta) => window.Components?.[type]?.deactivateTab?.(tab, { ...(meta || {}), reason: meta?.reason || 'descriptor-cancel-pending-work' })
      },
      draw: {
        run: meta => workspace.draw?.(meta),
        acceptsMeta: true
      }
    };
  }

  Object.keys(WORKSPACES).forEach(type => {
    const descriptor = buildWorkspaceLifecycleDescriptor(type, WORKSPACES[type]);
    Shared.componentLifecycle?.register?.(descriptor);
    installStandardWorkspaceLifecycle(WORKSPACES[type]);
  });

  namespace.scheduleDraw = scheduleDraw;
  namespace.scheduleDrawBoxplot = scheduleDrawBoxplot;
  namespace.scheduleDrawScatter = scheduleDrawScatter;
  namespace.scheduleDrawPca = scheduleDrawPca;
  namespace.scheduleDrawLine = scheduleDrawLine;
  namespace.scheduleDrawHeatmap = scheduleDrawHeatmap;
  namespace.scheduleDrawSurface = scheduleDrawSurface;
  namespace.scheduleDrawHist = scheduleDrawHist;
  namespace.scheduleDrawPie = scheduleDrawPie;
  namespace.scheduleDrawSurvival = scheduleDrawSurvival;
  namespace.ensureComponent = ensureComponent;
  namespace.registry = WORKSPACES;
  namespace.get = type => WORKSPACES[type] || null;
  console.debug('Debug: Main components module initialized', { workspaceCount: Object.keys(WORKSPACES).length });
})();
