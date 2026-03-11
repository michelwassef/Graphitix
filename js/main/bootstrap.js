(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const namespace = Main.bootstrap = Main.bootstrap || {};
  const debug = (message, payload) => {
    if(typeof Shared.debug === 'function'){
      Shared.debug(message, payload);
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  };
  debug('Debug: Main.bootstrap namespace initialized', { module: 'js/main/bootstrap.js' });

  if(typeof require === 'function'){
    try {
      require('../shared/workspaceToolbar.js');
      debug('Debug: Main.bootstrap workspaceToolbar required');
    } catch(err){
      debug('Debug: Main.bootstrap workspaceToolbar require failed', { err });
    }
  }

  const GRAPH_TYPES = [
    { type: 'box', label: 'Distribution Charts', hint: 'Group comparisons', description: 'Compare groups with box plots, violin plots, bar charts, or individual value strips, plus statistical tests.' },
    { type: 'scatter', label: 'XY Plots', hint: 'Correlation & expression', description: 'Create scatter, volcano, or MA plots with regression, 2D/3D views, and density coloring.' },
    { type: 'line', label: 'Line & Area Charts', hint: 'Trends & forecasting', description: 'Plot time series as lines or areas with regression, ARIMA/Holt-Winters forecasting, and correlation metrics.' },
    { type: 'hist', label: 'Histogram / Density Plot', hint: 'Frequency distribution', description: 'Summarize univariate distributions with adjustable binning, density plots, PDF/CDF overlays, and distribution fits.' },
    { type: 'heatmap', label: 'Heatmap & Clustering', hint: 'Matrix view', description: 'Visualize data values or correlation matrices with hierarchical clustering and dendrograms.' },
    { type: 'pca', label: 'Dimensionality Reduction', hint: 'PCA / MDS / t-SNE / UMAP', description: 'Run PCA, MDS, t-SNE, or UMAP on wide tables with 2D/3D views and variance summaries.' },
    { type: 'pie', label: 'Pie, Donut & Stacked Bar', hint: 'Category proportions', description: 'Visualize category proportions as pie charts, donuts, or stacked bars with Chi-square tests.' },
    { type: 'roc', label: 'Classification Curves', hint: 'ROC & precision-recall', description: 'Evaluate classifiers with ROC or precision-recall curves, AUC metrics, and DeLong comparisons.' },
    { type: 'survival', label: 'Survival Analysis', hint: 'Time-to-event analysis', description: 'Build Kaplan-Meier curves with confidence intervals, log-rank tests, and Cox regression.' },
    { type: 'venn', label: 'Venn Diagram / UpSet Plot', hint: 'Set comparisons', description: 'Visualize set overlaps as Venn diagrams or UpSet plots with region statistics, GO enrichment, and STRING network analysis.' },
    { type: 'surface', label: '3D Surface Plot', hint: '3D visualization', description: 'Render 3D surfaces from X/Y/Z data with rotation, grid interpolation, and color ramps.' },
  ];

  const SESSION_FILE_TYPES = [
    {
      description: 'Workspace Graph Archive',
      accept: {
        'application/zip': ['.graph'],
        'application/json': ['.graph', '.json', '.session']
      }
    }
  ];

  function validateMain(main) {
    if (!main) {
      throw new Error('Main.bootstrap.init requires the Main namespace.');
    }
    return main;
  }

  function runComponentBootstrap({ workspaces, domControls, session }) {
    const ensureDefaultPayload = (type, config) => domControls.ensureDefaultPayload(session, type, config);
    const hideWorkspaceElement = config => domControls.hideWorkspaceElement(config);
    const registry = Object.values(workspaces || {}).filter(Boolean);
    if (!registry.length) {
      debug('Debug: runComponentBootstrap skipped', { reason: 'no-workspaces' });
      return;
    }

    const activeTab = typeof session?.getActiveTab === 'function' ? session.getActiveTab() : null;
    const activeType = (activeTab && activeTab.type && !activeTab.isWelcome) ? activeTab.type : null;
    let initialConfig = activeType && workspaces ? workspaces[activeType] : null;

    if (!initialConfig) {
      initialConfig = registry.find(entry => {
        if (!entry?.element) return false;
        const hiddenAttr = entry.element.hasAttribute('hidden');
        const styleDisplay = entry.element.style?.display || '';
        return !hiddenAttr && styleDisplay !== 'none';
      }) || null;
    }

    if (!initialConfig) {
      initialConfig = registry[0] || null;
      if (initialConfig) {
        debug('Debug: runComponentBootstrap default workspace selected', { type: initialConfig.type });
      }
    }

    const initializedTypes = [];
    registry.forEach(config => {
      if (!config) return;
      const shouldEnsure = initialConfig && config.type === initialConfig.type;
      if (shouldEnsure) {
        const finalizeEnsure = () => {
          initializedTypes.push(config.type);
          if (typeof domControls.markWorkspaceInitialized === 'function') {
            domControls.markWorkspaceInitialized(config.type, { reason: 'bootstrap-active' });
          }
          ensureDefaultPayload(config.type, config);
          debug('Debug: bootstrap ensured initial workspace', { type: config.type });
        };
        if (typeof config.ensure === 'function') {
          try {
            const ensureResult = config.ensure();
            if (ensureResult && typeof ensureResult.then === 'function') {
              ensureResult.then(() => finalizeEnsure()).catch(err => {
                console.error('bootstrap async ensure error', { type: config.type, err });
              });
            } else {
              finalizeEnsure();
            }
          } catch (err) {
            console.error('bootstrap ensure error', { type: config.type, err });
          }
        } else {
          debug('Debug: bootstrap initial workspace missing ensure', { type: config.type });
          if (typeof domControls.markWorkspaceInitialized === 'function') {
            domControls.markWorkspaceInitialized(config.type, { reason: 'bootstrap-no-ensure' });
          }
          ensureDefaultPayload(config.type, config);
        }
      } else {
        debug('Debug: bootstrap ensure skipped', {
          type: config.type,
          reason: 'not-initial-workspace'
        });
      }
      hideWorkspaceElement(config);
    });

    debug('Debug: Main.bootstrap component bootstrap executed', {
      count: registry.length,
      initialType: initialConfig ? initialConfig.type : null,
      initializedTypes
    });
  }

  namespace.init = function init(main) {
    const target = validateMain(main || Main);
    debug('Debug: Main.bootstrap.init invoked', { hasMain: !!target });

    const session = target.session;
    const previews = target.previews;
    const domControls = target.domControls;
    const sessionActions = target.sessionActions;
    const tabDrag = target.tabDrag;
    if (!session || !previews || !domControls || !sessionActions || !tabDrag) {
      const details = {
        hasSession: !!session,
        hasPreviews: !!previews,
        hasDomControls: !!domControls,
        hasSessionActions: !!sessionActions,
        hasTabDrag: !!tabDrag
      };
      console.error('Main.bootstrap.init missing dependencies', details);
      throw new Error('Main.bootstrap.init requires session, previews, domControls, sessionActions, and tabDrag.');
    }

    const components = target.components || {};
    const workspaces = components.registry || {};
    const variantApi = target.graphVariants || {};

    const dom = domControls.createDomHandles();
    const workspaceState = session.workspaceState;
    if (!workspaceState) {
      console.error('Main.bootstrap.init missing workspaceState');
      throw new Error('Main.bootstrap.init requires session.workspaceState.');
    }

    const graphVariants = typeof variantApi.list === 'function' ? variantApi.list() : [];

    function withSessionContext(extra = {}) {
      const context = {
        workspaces,
        previews
      };
      return Object.assign(context, extra);
    }

    runComponentBootstrap({ workspaces, domControls, session });

    debug('Debug: Main.bootstrap.init completed', {
      tabs: workspaceState.tabs?.length || 0,
      workspaces: Object.keys(workspaces).length,
      graphVariants: graphVariants.length
    });

    return {
      session,
      previews,
      domControls,
      sessionActions,
      tabDrag,
      workspaces,
      graphTypes: GRAPH_TYPES,
      graphVariants,
      sessionFileTypes: SESSION_FILE_TYPES,
      dom,
      workspaceState,
      withSessionContext
    };
  };
})();
