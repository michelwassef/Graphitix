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

  function installStandardWorkspaceLifecycle(workspace) {
    if (!workspace || !workspace.type) {
      return workspace;
    }
    const type = workspace.type;
    if (typeof workspace.activateTab !== 'function') {
      workspace.activateTab = (tab, meta) => {
        const component = resolveComponentFromGlobal(type);
        if (component && typeof component.activateTab === 'function') {
          return component.activateTab(tab, meta);
        }
        return undefined;
      };
    }
    if (typeof workspace.deactivateTab !== 'function') {
      workspace.deactivateTab = (tab, meta) => invokeComponentLifecycle(type, 'deactivateTab', [tab, meta]);
    }
    if (typeof workspace.disposeTab !== 'function') {
      workspace.disposeTab = (tab, meta) => invokeComponentLifecycle(type, 'disposeTab', [tab, meta]);
    }
    if (typeof workspace.captureRuntimeState !== 'function') {
      workspace.captureRuntimeState = meta => invokeComponentLifecycle(type, 'captureRuntimeState', [meta]);
    }
    if (typeof workspace.applyRuntimeState !== 'function') {
      workspace.applyRuntimeState = (snapshot, meta) => invokeComponentLifecycle(type, 'applyRuntimeState', [snapshot, meta]);
    }
    return workspace;
  }

  function ensureComponent(name, options = {}) {
    return loadComponentBundle(name, options).then(() => {
      const component = resolveComponentFromGlobal(name);
      if (!component) {
        console.debug('Debug: ensureComponent missing global export', { name });
        return null;
      }
      let ensureResult = null;
      if (typeof component.ensure === 'function') {
        ensureResult = component.ensure(options.ensureOptions);
      } else if (typeof component.init === 'function') {
        ensureResult = component.init(options.ensureOptions);
      }
      return Promise.resolve(ensureResult).then(() => {
        console.debug('Debug: ensureComponent resolved', { name, ready: !!component.ready }); // Debug: ensure completion
        return component;
      });
    }).catch(err => {
      console.error('ensureComponent error', {
        name,
        message: err?.message || String(err)
      });
      return resolveComponentFromGlobal(name) || null;
    });
  }

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
    const raw = Shared.debounceFrame((options = {}) => {
      const meta = options?.__workspaceSessionMeta || null;
      if (Shared.workspaceTabs?.isSessionMetaCurrent && !Shared.workspaceTabs.isSessionMetaCurrent(componentKey, meta)) {
        console.debug('Debug: registry draw skipped stale tab session', {
          componentKey,
          tabId: meta?.tabId || null,
          sessionGeneration: meta?.sessionGeneration || 0,
          reason: options?.reason || null
        });
        return;
      }
      const draw = window.Components?.[componentName]?.draw;
      if (typeof draw === 'function') {
        draw(options || {});
      }
    });
    return Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey,
          debugLabel: `registry-${componentKey}`,
          scheduleRaw: raw
        })
      : raw;
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
  console.debug('Debug: main Shared.debounceFrame schedulers ready', { schedulers: ['boxplot', 'scatter', 'pca', 'line', 'heatmap', 'hist', 'pie', 'survival'] });

  const WORKSPACES = {
    venn: {
      type: 'venn',
      tabLabel: 'Venn',
      perTabDomInstances: true,
      element: document.getElementById('vennPage'),
      ensure: () => ensureComponent('venn'),
      draw: () => window.Components?.venn?.draw?.(),
      getPreviewSvg: tab => window.Components?.venn?.getThumbnailSvg?.(tab) || window.Components?.venn?.getPreviewSvg?.(tab),
      getPayload: () => window.Components?.venn?.getPayload?.(),
      loadFromFile: blob => window.Components?.venn?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.venn?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.venn?.createEmptyPayload?.(),
      captureRenderCache: meta => window.Components?.venn?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.venn?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('venn'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('venn'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('venn', state, options || {})
    },
    box: {
      type: 'box',
      tabLabel: 'Box Plot',
      perTabDomInstances: true,
      element: document.getElementById('boxPage'),
      ensure: () => ensureComponent('box'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('box'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('box'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('box', state, options || {})
    },
    scatter: {
      type: 'scatter',
      tabLabel: 'Scatter',
      perTabDomInstances: true,
      element: document.getElementById('scatterPage'),
      ensure: () => ensureComponent('scatter'),
      draw: meta => window.Components?.scatter?.draw?.(meta || {}),
      getPreviewSvg: tab => window.Components?.scatter?.getThumbnailSvg?.(tab),
      getPayload: () => window.Components?.scatter?.getPayload?.(),
      loadFromFile: blob => window.Components?.scatter?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.scatter?.loadFromPayload?.(payload, options),
      applyColorSchemePayload: (payload, options) => window.Components?.scatter?.applyColorSchemePayload?.(payload, options),
      createEmptyPayload: () => window.Components?.scatter?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.scatter?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.scatter?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.scatter?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('scatter'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('scatter'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('scatter', state, options || {})
    },
    pca: {
      type: 'pca',
      tabLabel: 'PCA / MDS',
      perTabDomInstances: true,
      element: document.getElementById('pcaPage'),
      ensure: () => ensureComponent('pca'),
      draw: meta => scheduleDrawPca(meta || {}),
      getPayload: () => window.Components?.pca?.getPayload?.(),
      loadFromFile: blob => window.Components?.pca?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pca?.loadFromPayload?.(payload, options),
      applyColorSchemePayload: (payload, options) => window.Components?.pca?.applyColorSchemePayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pca?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.pca?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.pca?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.pca?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('pca'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('pca'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('pca', state, options || {})
    },
    line: {
      type: 'line',
      tabLabel: 'Line Graph',
      perTabDomInstances: true,
      element: document.getElementById('linePage'),
      ensure: () => ensureComponent('line'),
      draw: meta => scheduleDrawLine(meta || {}),
      getPayload: () => window.Components?.line?.getPayload?.(),
      loadFromFile: blob => window.Components?.line?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.line?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.line?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.line?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.line?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.line?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('line'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('line'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('line', state, options || {})
    },
    heatmap: {
      type: 'heatmap',
      tabLabel: 'Heatmap',
      perTabDomInstances: true,
      element: document.getElementById('heatmapPage'),
      ensure: () => ensureComponent('heatmap'),
      draw: meta => scheduleDrawHeatmap(meta || {}),
      getPayload: () => window.Components?.heatmap?.getPayload?.(),
      loadFromFile: blob => window.Components?.heatmap?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.heatmap?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.heatmap?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.heatmap?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.heatmap?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.heatmap?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('heatmap'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('heatmap'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('heatmap', state, options || {})
    },
    surface: {
      type: 'surface',
      tabLabel: 'Surface Plot',
      perTabDomInstances: true,
      element: document.getElementById('surfacePage'),
      ensure: () => ensureComponent('surface'),
      draw: meta => scheduleDrawSurface(meta || {}),
      getPayload: () => window.Components?.surface?.getPayload?.(),
      loadFromFile: blob => window.Components?.surface?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.surface?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.surface?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.surface?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.surface?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.surface?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('surface'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('surface'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('surface', state, options || {})
    },
    roc: {
      type: 'roc',
      tabLabel: 'ROC / PR',
      perTabDomInstances: true,
      element: document.getElementById('rocPage'),
      ensure: () => ensureComponent('roc'),
      draw: () => window.Components?.roc?.draw?.(),
      getPayload: () => window.Components?.roc?.getPayload?.(),
      loadFromFile: blob => window.Components?.roc?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.roc?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.roc?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.roc?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.roc?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.roc?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('roc'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('roc'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('roc', state, options || {})
    },
    survival: {
      type: 'survival',
      tabLabel: 'Survival',
      perTabDomInstances: true,
      element: document.getElementById('survivalPage'),
      ensure: () => ensureComponent('survival'),
      draw: meta => scheduleDrawSurvival(meta || {}),
      getPayload: () => window.Components?.survival?.getPayload?.(),
      loadFromFile: blob => window.Components?.survival?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.survival?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.survival?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.survival?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.survival?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.survival?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('survival'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('survival'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('survival', state, options || {})
    },
    hist: {
      type: 'hist',
      tabLabel: 'Histogram',
      perTabDomInstances: true,
      element: document.getElementById('histPage'),
      ensure: () => ensureComponent('hist'),
      draw: meta => scheduleDrawHist(meta || {}),
      getPayload: () => window.Components?.hist?.getPayload?.(),
      loadFromFile: blob => window.Components?.hist?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.hist?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.hist?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.hist?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.hist?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.hist?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('hist'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('hist'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('hist', state, options || {})
    },
    pie: {
      type: 'pie',
      tabLabel: 'Proportion',
      perTabDomInstances: true,
      element: document.getElementById('piePage'),
      ensure: () => ensureComponent('pie'),
      draw: meta => scheduleDrawPie(meta || {}),
      getPayload: () => window.Components?.pie?.getPayload?.(),
      loadFromFile: blob => window.Components?.pie?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pie?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pie?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.pie?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.pie?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.pie?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('pie'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('pie'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('pie', state, options || {})
    }
  };

  Object.keys(WORKSPACES).forEach(type => {
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
