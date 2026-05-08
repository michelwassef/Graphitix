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
    const component = resolveComponentFromGlobal(name);
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
      const loadedComponent = resolveComponentFromGlobal(name);
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
      getLayoutState: options => componentLayout.captureStateFor?.('venn', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('venn', options || {}),
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
      ensure: () => ensureComponent('scatter'),
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
      ensure: () => ensureComponent('pca'),
      draw: meta => scheduleDrawPca(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('pca', tab),
      getPayload: () => window.Components?.pca?.getPayload?.(),
      loadFromFile: blob => window.Components?.pca?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pca?.loadFromPayload?.(payload, options),
      applyColorSchemePayload: (payload, options) => window.Components?.pca?.applyColorSchemePayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pca?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.pca?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.pca?.captureRenderCache?.(meta),
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
      ensure: () => ensureComponent('line'),
      draw: meta => scheduleDrawLine(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('line', tab),
      getPayload: () => window.Components?.line?.getPayload?.(),
      loadFromFile: blob => window.Components?.line?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.line?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.line?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.line?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.line?.captureRenderCache?.(meta),
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
      ensure: () => ensureComponent('heatmap'),
      draw: meta => scheduleDrawHeatmap(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('heatmap', tab),
      getPayload: () => window.Components?.heatmap?.getPayload?.(),
      loadFromFile: blob => window.Components?.heatmap?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.heatmap?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.heatmap?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.heatmap?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.heatmap?.captureRenderCache?.(meta),
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
      ensure: () => ensureComponent('surface'),
      draw: meta => scheduleDrawSurface(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('surface', tab),
      getPayload: () => window.Components?.surface?.getPayload?.(),
      loadFromFile: blob => window.Components?.surface?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.surface?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.surface?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.surface?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.surface?.captureRenderCache?.(meta),
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
      ensure: () => ensureComponent('roc'),
      draw: () => window.Components?.roc?.draw?.(),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('roc', tab),
      getPayload: () => window.Components?.roc?.getPayload?.(),
      loadFromFile: blob => window.Components?.roc?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.roc?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.roc?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.roc?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.roc?.captureRenderCache?.(meta),
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
      ensure: () => ensureComponent('survival'),
      draw: meta => scheduleDrawSurvival(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('survival', tab),
      getPayload: () => window.Components?.survival?.getPayload?.(),
      loadFromFile: blob => window.Components?.survival?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.survival?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.survival?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.survival?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.survival?.captureRenderCache?.(meta),
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
      ensure: () => ensureComponent('hist'),
      draw: meta => scheduleDrawHist(meta || {}),
      getPreviewSvg: tab => resolveWorkspacePreviewSvg('hist', tab),
      getPayload: () => window.Components?.hist?.getPayload?.(),
      loadFromFile: blob => window.Components?.hist?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.hist?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.hist?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.hist?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.hist?.captureRenderCache?.(meta),
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
      ensure: () => ensureComponent('pie'),
      draw: meta => scheduleDrawPie(meta || {}),
      getPreviewSvg: tab => window.Components?.pie?.getThumbnailSvg?.(tab) || window.Components?.pie?.getPreviewSvg?.(tab) || resolveWorkspacePreviewSvg('pie', tab),
      getPayload: () => window.Components?.pie?.getPayload?.(),
      loadFromFile: blob => window.Components?.pie?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pie?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pie?.createEmptyPayload?.(),
      activateTab: (tab, meta) => window.Components?.pie?.activateTab?.(tab, meta),
      captureRenderCache: meta => window.Components?.pie?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.pie?.restoreRenderCache?.(cache, meta),
      captureUiState: () => window.Components?.pie?.captureUiState?.() || null,
      applyUiState: (state, meta) => window.Components?.pie?.applyUiState?.(state, meta || {}),
      getLayoutState: options => componentLayout.captureStateFor?.('pie', options || {}),
      getDefaultLayoutState: options => componentLayout.getDefaultStateFor?.('pie', options || {}),
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
