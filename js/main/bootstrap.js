(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.bootstrap = Main.bootstrap || {};
  console.debug('Debug: Main.bootstrap namespace initialized', { module: 'js/main/bootstrap.js' });

  const GRAPH_TYPES = [
    { type: 'venn', label: 'Venn Diagram', hint: 'Lists & overlap', description: 'Visualize overlaps between up to three sets with region statistics.' },
    { type: 'box', label: 'Box Plot', hint: 'Group comparisons', description: 'Compare distributions across groups with rich styling and statistical tests.' },
    { type: 'scatter', label: 'Scatter Plot', hint: 'Correlation', description: 'Explore relationships between variables and configure regression overlays.' },
    { type: 'pca', label: 'Dimensionality Reduction', hint: 'PCA / MDS', description: 'Run PCA or MDS on wide tables and inspect eigenvalue summaries.' },
    { type: 'line', label: 'Line Graph', hint: 'Trends', description: 'Plot series data with per-line styling, axes controls, and correlation metrics.' },
    { type: 'heatmap', label: 'Correlation Heatmap', hint: 'Matrix view', description: 'Cluster correlation matrices and tune color ramps, labels, and dendrograms.' },
    { type: 'roc', label: 'Classification Curves', hint: 'ROC / PR', description: 'Compare ROC or precision-recall curves with statistical comparisons.' },
    { type: 'survival', label: 'Survival Curves', hint: 'Kaplan–Meier', description: 'Build Kaplan–Meier curves with confidence intervals and censor controls.' },
    { type: 'hist', label: 'Histogram', hint: 'Distribution', description: 'Summarize univariate distributions with customizable binning and stats.' },
    { type: 'pie', label: 'Proportion Graph', hint: 'Categories', description: 'Visualize category proportions and run Chi² goodness-of-fit tests.' }
  ];

  const SESSION_FILE_TYPES = [
    { description: 'Workspace Session', accept: { 'application/json': ['.session', '.json'] } }
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
      console.debug('Debug: runComponentBootstrap skipped', { reason: 'no-workspaces' });
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
        console.debug('Debug: runComponentBootstrap default workspace selected', { type: initialConfig.type });
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
          console.debug('Debug: bootstrap ensured initial workspace', { type: config.type });
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
          console.debug('Debug: bootstrap initial workspace missing ensure', { type: config.type });
          if (typeof domControls.markWorkspaceInitialized === 'function') {
            domControls.markWorkspaceInitialized(config.type, { reason: 'bootstrap-no-ensure' });
          }
          ensureDefaultPayload(config.type, config);
        }
      } else {
        console.debug('Debug: bootstrap ensure skipped', {
          type: config.type,
          reason: 'not-initial-workspace'
        });
      }
      hideWorkspaceElement(config);
    });

    console.debug('Debug: Main.bootstrap component bootstrap executed', {
      count: registry.length,
      initialType: initialConfig ? initialConfig.type : null,
      initializedTypes
    });
  }

  namespace.init = function init(main) {
    const target = validateMain(main || Main);
    console.debug('Debug: Main.bootstrap.init invoked', { hasMain: !!target });

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

    const dom = domControls.createDomHandles();
    const workspaceState = session.workspaceState;
    if (!workspaceState) {
      console.error('Main.bootstrap.init missing workspaceState');
      throw new Error('Main.bootstrap.init requires session.workspaceState.');
    }

    function withSessionContext(extra = {}) {
      const context = {
        workspaces,
        previews
      };
      return Object.assign(context, extra);
    }

    runComponentBootstrap({ workspaces, domControls, session });

    console.debug('Debug: Main.bootstrap.init completed', {
      tabs: workspaceState.tabs?.length || 0,
      workspaces: Object.keys(workspaces).length
    });

    return {
      session,
      previews,
      domControls,
      sessionActions,
      tabDrag,
      workspaces,
      graphTypes: GRAPH_TYPES,
      sessionFileTypes: SESSION_FILE_TYPES,
      dom,
      workspaceState,
      withSessionContext
    };
  };
})();
