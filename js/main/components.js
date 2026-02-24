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

  const scheduleDrawBoxplot = Shared.debounceFrame(() => {
    if (window.Components?.box?.draw) window.Components.box.draw();
  });
  const scheduleDrawScatter = Shared.debounceFrame(() => {
    if (window.Components?.scatter?.draw) window.Components.scatter.draw();
  });
  const scheduleDrawPca = Shared.debounceFrame(() => {
    if (window.Components?.pca?.draw) window.Components.pca.draw();
  });
  const scheduleDrawLine = Shared.debounceFrame(() => {
    if (window.Components?.line?.draw) window.Components.line.draw();
  });
  const scheduleDrawHeatmap = Shared.debounceFrame(() => {
    if (window.Components?.heatmap?.draw) window.Components.heatmap.draw();
  });
  const scheduleDrawSurface = Shared.debounceFrame(() => {
    if (window.Components?.surface?.draw) window.Components.surface.draw();
  });
  const scheduleDrawHist = Shared.debounceFrame(() => {
    if (window.Components?.hist?.draw) window.Components.hist.draw();
  });
  const scheduleDrawPie = Shared.debounceFrame(() => {
    if (window.Components?.pie?.draw) window.Components.pie.draw();
  });
  const scheduleDrawSurvival = Shared.debounceFrame(() => {
    if (window.Components?.survival?.draw) window.Components.survival.draw();
  });
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
      element: document.getElementById('vennPage'),
      ensure: () => ensureComponent('venn'),
      draw: () => window.Components?.venn?.draw?.(),
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
      element: document.getElementById('boxPage'),
      ensure: () => ensureComponent('box'),
      draw: () => scheduleDrawBoxplot(),
      getPayload: () => window.Components?.box?.getPayload?.(),
      loadFromFile: blob => window.Components?.box?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.box?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.box?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.box?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.box?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.box?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('box'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('box'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('box', state, options || {})
    },
    scatter: {
      type: 'scatter',
      tabLabel: 'Scatter',
      element: document.getElementById('scatterPage'),
      ensure: () => ensureComponent('scatter'),
      draw: () => scheduleDrawScatter(),
      getPayload: () => window.Components?.scatter?.getPayload?.(),
      loadFromFile: blob => window.Components?.scatter?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.scatter?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.scatter?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.scatter?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.scatter?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.scatter?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('scatter'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('scatter'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('scatter', state, options || {})
    },
    pca: {
      type: 'pca',
      tabLabel: 'PCA / MDS',
      element: document.getElementById('pcaPage'),
      ensure: () => ensureComponent('pca'),
      draw: () => scheduleDrawPca(),
      getPayload: () => window.Components?.pca?.getPayload?.(),
      loadFromFile: blob => window.Components?.pca?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pca?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pca?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.pca?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.pca?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.pca?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('pca'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('pca'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('pca', state, options || {})
    },
    line: {
      type: 'line',
      tabLabel: 'Line Graph',
      element: document.getElementById('linePage'),
      ensure: () => ensureComponent('line'),
      draw: () => scheduleDrawLine(),
      getPayload: () => window.Components?.line?.getPayload?.(),
      loadFromFile: blob => window.Components?.line?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.line?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.line?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.line?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.line?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.line?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('line'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('line'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('line', state, options || {})
    },
    heatmap: {
      type: 'heatmap',
      tabLabel: 'Heatmap',
      element: document.getElementById('heatmapPage'),
      ensure: () => ensureComponent('heatmap'),
      draw: () => scheduleDrawHeatmap(),
      getPayload: () => window.Components?.heatmap?.getPayload?.(),
      loadFromFile: blob => window.Components?.heatmap?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.heatmap?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.heatmap?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.heatmap?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.heatmap?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.heatmap?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('heatmap'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('heatmap'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('heatmap', state, options || {})
    },
    surface: {
      type: 'surface',
      tabLabel: 'Surface Plot',
      element: document.getElementById('surfacePage'),
      ensure: () => ensureComponent('surface'),
      draw: () => scheduleDrawSurface(),
      getPayload: () => window.Components?.surface?.getPayload?.(),
      loadFromFile: blob => window.Components?.surface?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.surface?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.surface?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.surface?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.surface?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.surface?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('surface'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('surface'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('surface', state, options || {})
    },
    roc: {
      type: 'roc',
      tabLabel: 'ROC / PR',
      element: document.getElementById('rocPage'),
      ensure: () => ensureComponent('roc'),
      draw: () => window.Components?.roc?.draw?.(),
      getPayload: () => window.Components?.roc?.getPayload?.(),
      loadFromFile: blob => window.Components?.roc?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.roc?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.roc?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.roc?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.roc?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.roc?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('roc'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('roc'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('roc', state, options || {})
    },
    survival: {
      type: 'survival',
      tabLabel: 'Survival',
      element: document.getElementById('survivalPage'),
      ensure: () => ensureComponent('survival'),
      draw: () => scheduleDrawSurvival(),
      getPayload: () => window.Components?.survival?.getPayload?.(),
      loadFromFile: blob => window.Components?.survival?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.survival?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.survival?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.survival?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.survival?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.survival?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('survival'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('survival'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('survival', state, options || {})
    },
    hist: {
      type: 'hist',
      tabLabel: 'Histogram',
      element: document.getElementById('histPage'),
      ensure: () => ensureComponent('hist'),
      draw: () => scheduleDrawHist(),
      getPayload: () => window.Components?.hist?.getPayload?.(),
      loadFromFile: blob => window.Components?.hist?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.hist?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.hist?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.hist?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.hist?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.hist?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('hist'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('hist'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('hist', state, options || {})
    },
    pie: {
      type: 'pie',
      tabLabel: 'Proportion',
      element: document.getElementById('piePage'),
      ensure: () => ensureComponent('pie'),
      draw: () => scheduleDrawPie(),
      getPayload: () => window.Components?.pie?.getPayload?.(),
      loadFromFile: blob => window.Components?.pie?.loadFromFile?.(blob),
      loadFromPayload: (payload, options) => window.Components?.pie?.loadFromPayload?.(payload, options),
      createEmptyPayload: () => window.Components?.pie?.createEmptyPayload?.(),
      prepareForTab: tab => window.Components?.pie?.prepareForTab?.(tab),
      captureRenderCache: meta => window.Components?.pie?.captureRenderCache?.(meta),
      restoreRenderCache: (cache, meta) => window.Components?.pie?.restoreRenderCache?.(cache, meta),
      getLayoutState: () => componentLayout.captureStateFor?.('pie'),
      getDefaultLayoutState: () => componentLayout.getDefaultStateFor?.('pie'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('pie', state, options || {})
    }
  };

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
