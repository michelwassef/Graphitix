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

  function welcomeGraphIcon(markup) {
    return `<svg class="welcome-graph-icon" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">${markup}</svg>`;
  }

  const WELCOME_GRAPH_ICONS = Object.freeze({
    box: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <g class="welcome-icon__primary" style="stroke-width:0.85; stroke-linecap:butt; stroke-linejoin:miter; shape-rendering:crispEdges;">
        <path d="M16 16V34 M13.5 16H18.5 M13.5 34H18.5" />
        <rect class="welcome-icon__box" x="13.5" y="22" width="5" height="8" fill="#6d28d9" style="stroke-width:0.85; stroke-linejoin:miter; shape-rendering:crispEdges;" />
        <path d="M13.5 26H18.5" stroke="#ffffff" />

        <path d="M25 13V34 M22.5 13H27.5 M22.5 34H27.5" />
        <rect class="welcome-icon__box" x="22.5" y="19" width="5" height="10" fill="#6d28d9" style="stroke-width:0.85; stroke-linejoin:miter; shape-rendering:crispEdges;" />
        <path d="M22.5 24H27.5" stroke="#ffffff" />

        <path d="M34 19V34 M31.5 19H36.5 M31.5 34H36.5" />
        <rect class="welcome-icon__box" x="31.5" y="24" width="5" height="7" fill="#6d28d9" style="stroke-width:0.85; stroke-linejoin:miter; shape-rendering:crispEdges;" />
        <path d="M31.5 27.5H36.5" stroke="#ffffff" />
      </g>
    `),
    scatter: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <path class="welcome-icon__guide" d="M14.5 32L37.5 15" />
      <g class="welcome-icon__points">
        <circle cx="16.8" cy="30.9" r="1.55" />
        <circle cx="20.2" cy="28.0" r="1.55" />
        <circle cx="23.8" cy="24.0" r="1.55" />
        <circle cx="27.8" cy="20.4" r="1.55" />
        <circle cx="32.4" cy="16.6" r="1.55" />
        <circle cx="19.0" cy="31.8" r="1.55" />
        <circle cx="24.8" cy="27.8" r="1.55" />
        <circle cx="29.8" cy="24.6" r="1.55" />
        <circle cx="34.8" cy="22.1" r="1.55" />
      </g>
    `),
    line: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <path class="welcome-icon__area" d="M11 35L17 30L23 27L29 20L35 17L40 12V38H11Z" />
      <path class="welcome-icon__primary" d="M11 35L17 30L23 27L29 20L35 17L40 12" />
    `),
    hist: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <g class="welcome-icon__bars">
        <rect x="14" y="28.5" width="4" height="9.5" />
        <rect x="19" y="22.5" width="4" height="15.5" />
        <rect x="24" y="17" width="4" height="21" />
        <rect x="29" y="20" width="4" height="18" />
        <rect x="34" y="26.5" width="4" height="11.5" />
      </g>
      <path class="welcome-icon__density" d="M13.5 31.5C17.2 24.5 21.2 18 26 18C30.8 18 34.2 24 38.5 31.5" />
    `),
    heatmap: welcomeGraphIcon(`
      <path class="welcome-icon__dendrogram" d="M10 23.5H13 M13 17V30 M13 17H18 M13 30H18 M18 14V20 M18 27V33 M18 14H23 M18 20H23 M18 27H23 M18 33H23" />
      <g class="welcome-icon__heatmap-grid">
        <rect class="welcome-icon__heat-1" x="25" y="11.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-2" x="31" y="11.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-3" x="37" y="11.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-2" x="25" y="17.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-3" x="31" y="17.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-4" x="37" y="17.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-3" x="25" y="23.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-4" x="31" y="23.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-5" x="37" y="23.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-4" x="25" y="29.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-5" x="31" y="29.5" width="4.5" height="4.5" />
        <rect class="welcome-icon__heat-6" x="37" y="29.5" width="4.5" height="4.5" />
      </g>
    `),
    pca: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <ellipse class="welcome-icon__cluster-a" cx="20.5" cy="29" rx="7.2" ry="4.7" transform="rotate(-22 20.5 29)" />
      <ellipse class="welcome-icon__cluster-b" cx="33.2" cy="19" rx="6.3" ry="4.3" transform="rotate(18 33.2 19)" />
      <g class="welcome-icon__points">
        <circle cx="16.8" cy="31.2" r="1.4" />
        <circle cx="20.6" cy="27.6" r="1.4" />
        <circle cx="24.1" cy="30.1" r="1.4" />
        <circle cx="30.3" cy="18.8" r="1.4" />
        <circle cx="34.4" cy="17.2" r="1.4" />
        <circle cx="35.8" cy="22.2" r="1.4" />
      </g>
    `),
    pie: welcomeGraphIcon(`
      <circle class="welcome-icon__donut-track" cx="24" cy="24" r="13" />
      <circle class="welcome-icon__donut-a" cx="24" cy="24" r="13" pathLength="100" />
      <circle class="welcome-icon__donut-b" cx="24" cy="24" r="13" pathLength="100" />
      <circle class="welcome-icon__donut-c" cx="24" cy="24" r="13" pathLength="100" />
      <circle class="welcome-icon__donut-hole" cx="24" cy="24" r="6" />
    `),
    roc: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <path class="welcome-icon__diagonal" d="M10 38.5L40 10" />
      <path class="welcome-icon__primary" d="M10 38.5C12 31 16 23 23 18C29 13.5 35 12 40 11" />
    `),
    survival: welcomeGraphIcon(`
      <path class="welcome-icon__axis" d="M10 38.5H40 M10 38.5V10" />
      <path class="welcome-icon__survival-a" d="M12 13H22V17H29V22H35V31H39" />
      <path class="welcome-icon__survival-b" d="M12 15H16V20H19V24H23V29H26V34H30V38H33" />
    `),
    venn: welcomeGraphIcon(`
      <circle class="welcome-icon__venn-a" cx="21" cy="24" r="10" />
      <circle class="welcome-icon__venn-b" cx="29" cy="24" r="10" />
    `),
    surface: welcomeGraphIcon(`
      <path class="welcome-icon__surface-back" d="M10.5 29.5L20 21L35 24.5L40.5 17" />
      <path class="welcome-icon__surface-grid" d="M10.5 29.5L18 37L33 33.5L40.5 25.5 M20 21L18 37 M27.5 22.8L25.5 35.2 M35 24.5L33 33.5 M40.5 17L40.5 25.5" />
      <path class="welcome-icon__surface-grid" d="M14.2 26.3L22.2 32.4L37 29 M17.2 23.7L25.4 29.1L40 24.8" />
      <path class="welcome-icon__surface-ridge" d="M10.5 29.5C15.4 24.1 20 21.6 25.8 23.6C31.2 25.5 35.8 22.9 40.5 17" />
    `)
  });

  const GRAPH_TYPES = [
    { type: 'box', label: 'Distribution Charts', hint: 'Group comparisons', description: 'Compare groups with box plots, violin plots, bar charts, or individual value strips, plus statistical tests.', icon: WELCOME_GRAPH_ICONS.box },
    { type: 'scatter', label: 'XY Plots', hint: 'Correlation & expression', description: 'Create scatter, volcano, or MA plots with regression, 2D/3D views, and density coloring.', icon: WELCOME_GRAPH_ICONS.scatter },
    { type: 'line', label: 'Line & Area Charts', hint: 'Trends & forecasting', description: 'Plot time series as lines or areas with regression, ARIMA/Holt-Winters forecasting, and correlation metrics.', icon: WELCOME_GRAPH_ICONS.line },
    { type: 'hist', label: 'Histogram / Density Plot', hint: 'Frequency distribution', description: 'Summarize univariate distributions with adjustable binning, density plots, PDF/CDF overlays, and distribution fits.', icon: WELCOME_GRAPH_ICONS.hist },
    { type: 'heatmap', label: 'Heatmap & Clustering', hint: 'Matrix view', description: 'Visualize data values or correlation matrices with hierarchical clustering and dendrograms.', icon: WELCOME_GRAPH_ICONS.heatmap },
    { type: 'pca', label: 'Dimensionality Reduction', hint: 'PCA / MDS / t-SNE / UMAP', description: 'Run PCA, MDS, t-SNE, or UMAP on wide tables with 2D/3D views and variance summaries.', icon: WELCOME_GRAPH_ICONS.pca },
    { type: 'pie', label: 'Pie, Donut & Stacked Bar', hint: 'Category proportions', description: 'Visualize category proportions as pie charts, donuts, or stacked bars with Chi-square tests.', icon: WELCOME_GRAPH_ICONS.pie },
    { type: 'roc', label: 'Classification Curves', hint: 'ROC & precision-recall', description: 'Evaluate classifiers with ROC or precision-recall curves, AUC metrics, and DeLong comparisons.', icon: WELCOME_GRAPH_ICONS.roc },
    { type: 'survival', label: 'Survival Analysis', hint: 'Time-to-event analysis', description: 'Build Kaplan-Meier curves with confidence intervals, log-rank tests, and Cox regression.', icon: WELCOME_GRAPH_ICONS.survival },
    { type: 'venn', label: 'Venn Diagram / UpSet Plot', hint: 'Set comparisons', description: 'Visualize set overlaps as Venn diagrams or UpSet plots with region statistics, GO enrichment, and STRING network analysis.', icon: WELCOME_GRAPH_ICONS.venn },
    { type: 'surface', label: '3D Surface Plot', hint: '3D visualization', description: 'Render 3D surfaces from X/Y/Z data with rotation, grid interpolation, and color ramps.', icon: WELCOME_GRAPH_ICONS.surface },
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
