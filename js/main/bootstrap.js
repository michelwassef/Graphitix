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

  const GRAPH_TYPES = [
    { type: 'box', label: 'Distribution Charts', hint: 'Group comparisons', description: 'Compare groups with box plots, violin plots, bar charts, or individual value strips, plus statistical tests.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><line x1="8" y1="56" x2="56" y2="56" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="8" y2="8" stroke="#cbd5f5" stroke-width="1.5"/><rect x="16" y="28" width="8" height="28" fill="#3b82f6"/><rect x="28" y="20" width="8" height="36" fill="#3b82f6"/><rect x="40" y="36" width="8" height="20" fill="#3b82f6"/><rect x="52" y="24" width="8" height="32" fill="#3b82f6"/></svg>' },
    { type: 'scatter', label: 'XY Plots', hint: 'Correlation & expression', description: 'Create scatter, volcano, or MA plots with regression, 2D/3D views, and density coloring.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><line x1="8" y1="56" x2="56" y2="56" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="8" y2="8" stroke="#cbd5f5" stroke-width="1.5"/><circle cx="20" cy="40" r="2.5" fill="#3b82f6"/><circle cx="28" cy="32" r="2.5" fill="#3b82f6"/><circle cx="36" cy="28" r="2.5" fill="#3b82f6"/><circle cx="44" cy="18" r="2.5" fill="#3b82f6"/><circle cx="50" cy="12" r="2.5" fill="#3b82f6"/></svg>' },
    { type: 'line', label: 'Line & Area Charts', hint: 'Trends & forecasting', description: 'Plot time series as lines or areas with regression, ARIMA/Holt-Winters forecasting, and correlation metrics.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><line x1="8" y1="56" x2="56" y2="56" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="8" y2="8" stroke="#cbd5f5" stroke-width="1.5"/><polyline points="8,44 16,36 24,32 32,24 40,16 52,10" stroke="#3b82f6" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>' },
    { type: 'hist', label: 'Histogram / Density Plot', hint: 'Frequency distribution', description: 'Summarize univariate distributions with adjustable binning, density plots, PDF/CDF overlays, and distribution fits.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><line x1="8" y1="56" x2="56" y2="56" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="8" y2="8" stroke="#cbd5f5" stroke-width="1.5"/><rect x="12" y="34" width="6" height="22" fill="#3b82f6"/><rect x="20" y="24" width="6" height="32" fill="#3b82f6"/><rect x="28" y="18" width="6" height="38" fill="#3b82f6"/><rect x="36" y="20" width="6" height="36" fill="#3b82f6"/><rect x="44" y="26" width="6" height="30" fill="#3b82f6"/><rect x="52" y="38" width="6" height="18" fill="#3b82f6"/></svg>' },
    { type: 'heatmap', label: 'Heatmap & Clustering', hint: 'Matrix view', description: 'Visualize data values or correlation matrices with hierarchical clustering and dendrograms.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="12" width="6" height="6" fill="#fca5a5"/><rect x="20" y="12" width="6" height="6" fill="#fca5a5"/><rect x="28" y="12" width="6" height="6" fill="#fbbf24"/><rect x="36" y="12" width="6" height="6" fill="#86efac"/><rect x="12" y="20" width="6" height="6" fill="#fca5a5"/><rect x="20" y="20" width="6" height="6" fill="#fbbf24"/><rect x="28" y="20" width="6" height="6" fill="#86efac"/><rect x="36" y="20" width="6" height="6" fill="#3b82f6"/><rect x="12" y="28" width="6" height="6" fill="#fbbf24"/><rect x="20" y="28" width="6" height="6" fill="#86efac"/><rect x="28" y="28" width="6" height="6" fill="#3b82f6"/><rect x="36" y="28" width="6" height="6" fill="#1e40af"/><rect x="12" y="36" width="6" height="6" fill="#86efac"/><rect x="20" y="36" width="6" height="6" fill="#3b82f6"/><rect x="28" y="36" width="6" height="6" fill="#1e40af"/><rect x="36" y="36" width="6" height="6" fill="#0c2340"/></svg>' },
    { type: 'pca', label: 'Dimensionality Reduction', hint: 'PCA / MDS / t-SNE / UMAP', description: 'Run PCA, MDS, t-SNE, or UMAP on wide tables with 2D/3D views and variance summaries.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" fill="none" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="56" y2="56" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="8" y2="8" stroke="#cbd5f5" stroke-width="1.5"/><circle cx="20" cy="38" r="2" fill="#3b82f6"/><circle cx="28" cy="28" r="2" fill="#3b82f6"/><circle cx="36" cy="22" r="2" fill="#3b82f6"/><circle cx="44" cy="32" r="2" fill="#3b82f6"/><circle cx="48" cy="18" r="2" fill="#3b82f6"/></svg>' },
    { type: 'pie', label: 'Pie, Donut & Stacked Bar', hint: 'Category proportions', description: 'Visualize category proportions as pie charts, donuts, or stacked bars with Chi-square tests.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M 32 12 A 20 20 0 0 1 52 32 L 32 32 Z" fill="#3b82f6"/><path d="M 52 32 A 20 20 0 0 1 32 52 L 32 32 Z" fill="#60a5fa"/><path d="M 32 52 A 20 20 0 0 1 12 32 L 32 32 Z" fill="#93c5fd"/><path d="M 12 32 A 20 20 0 0 1 32 12 L 32 32 Z" fill="#dbeafe"/></svg>' },
    { type: 'roc', label: 'Classification Curves', hint: 'ROC & precision-recall', description: 'Evaluate classifiers with ROC or precision-recall curves, AUC metrics, and DeLong comparisons.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" fill="none" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="56" y2="56" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="8" y2="8" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="56" y2="8" stroke="#cbd5f5" stroke-width="1" stroke-dasharray="2,2"/><path d="M 8 56 C 10 52 14 44 20 36 C 26 28 32 18 40 12 C 48 10 52 12 56 8" stroke="#3b82f6" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>' },
    { type: 'survival', label: 'Survival Analysis', hint: 'Time-to-event analysis', description: 'Build Kaplan-Meier curves with confidence intervals, log-rank tests, and Cox regression.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="48" height="48" fill="none" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="56" y2="56" stroke="#cbd5f5" stroke-width="1.5"/><line x1="8" y1="56" x2="8" y2="8" stroke="#cbd5f5" stroke-width="1.5"/><polyline points="10,18 18,18 18,26 28,26 28,36 40,36 40,48 52,48" stroke="#3b82f6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline points="10,12 18,12 18,22 28,22 28,32 40,32 40,44 52,44" stroke="#8b5cf6" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { type: 'venn', label: 'Venn Diagram / UpSet Plot', hint: 'Set comparisons', description: 'Visualize set overlaps as Venn diagrams or UpSet plots with region statistics, GO enrichment, and STRING network analysis.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="32" r="14" fill="none" stroke="#3b82f6" stroke-width="2"/><circle cx="40" cy="32" r="14" fill="none" stroke="#8b5cf6" stroke-width="2"/></svg>' },
    { type: 'surface', label: '3D Surface Plot', hint: '3D visualization', description: 'Render 3D surfaces from X/Y/Z data with rotation, grid interpolation, and color ramps.', icon: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M 10 50 Q 20 32 32 24 Q 44 18 56 30" stroke="#3b82f6" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 12 46 Q 22 28 34 20 Q 46 14 56 26" stroke="#60a5fa" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 14 42 Q 24 24 36 16 Q 48 10 56 22" stroke="#93c5fd" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 16 38 Q 26 20 38 12 Q 50 8 56 18" stroke="#dbeafe" stroke-width="1.5" fill="none" stroke-linecap="round"/><line x1="10" y1="50" x2="16" y2="38" stroke="#dbeafe" stroke-width="1"/><line x1="32" y1="24" x2="38" y2="12" stroke="#dbeafe" stroke-width="1"/><line x1="56" y1="30" x2="56" y2="18" stroke="#dbeafe" stroke-width="1"/></svg>' },
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
      debug('Debug: runComponentBootstrap initial workspace skipped', {
        reason: activeTab?.isWelcome ? 'welcome-tab-active' : 'no-visible-workspace'
      });
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
