(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const namespace = Main.components = Main.components || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};

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

  function ensureComponent(name) {
    const component = window.Components?.[name];
    if (!component) {
      console.debug('Debug: ensureComponent skipped', { name, reason: 'missing-component' });
      return;
    }
    if (typeof component.ensure === 'function') {
      component.ensure();
      return;
    }
    if (typeof component.init === 'function') {
      component.init();
      return;
    }
    console.debug('Debug: ensureComponent no-op', { name });
  }

  const WORKSPACES = {
    venn: {
      type: 'venn',
      tabLabel: 'Venn',
      element: document.getElementById('vennPage'),
      ensure: () => ensureComponent('venn'),
      draw: () => window.Components?.venn?.draw?.(),
      getPayload: () => window.Components?.venn?.getPayload?.(),
      loadFromFile: blob => window.Components?.venn?.loadFromFile?.(blob),
      getLayoutState: () => componentLayout.captureStateFor?.('venn'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('box'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('scatter'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('pca'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('line'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('heatmap'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('heatmap', state, options || {})
    },
    roc: {
      type: 'roc',
      tabLabel: 'ROC / PR',
      element: document.getElementById('rocPage'),
      ensure: () => ensureComponent('roc'),
      draw: () => window.Components?.roc?.draw?.(),
      getPayload: () => window.Components?.roc?.getPayload?.(),
      loadFromFile: blob => window.Components?.roc?.loadFromFile?.(blob),
      getLayoutState: () => componentLayout.captureStateFor?.('roc'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('survival'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('hist'),
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
      getLayoutState: () => componentLayout.captureStateFor?.('pie'),
      applyLayoutState: (state, options) => componentLayout.applyStateFor?.('pie', state, options || {})
    }
  };

  namespace.scheduleDraw = scheduleDraw;
  namespace.scheduleDrawBoxplot = scheduleDrawBoxplot;
  namespace.scheduleDrawScatter = scheduleDrawScatter;
  namespace.scheduleDrawPca = scheduleDrawPca;
  namespace.scheduleDrawLine = scheduleDrawLine;
  namespace.scheduleDrawHeatmap = scheduleDrawHeatmap;
  namespace.scheduleDrawHist = scheduleDrawHist;
  namespace.scheduleDrawPie = scheduleDrawPie;
  namespace.scheduleDrawSurvival = scheduleDrawSurvival;
  namespace.ensureComponent = ensureComponent;
  namespace.registry = WORKSPACES;
  namespace.get = type => WORKSPACES[type] || null;
  console.debug('Debug: Main components module initialized', { workspaceCount: Object.keys(WORKSPACES).length });
})();
