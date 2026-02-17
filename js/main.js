(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const debug = (message, payload) => {
    if(typeof Shared.debug === 'function'){
      Shared.debug(message, payload);
      return;
    }
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
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

  debug("Debug: main.js loaded");
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  if (typeof chartStyle.renderFontSizeLabel !== 'function') {
    chartStyle.renderFontSizeLabel = function fallbackFontLabel(options) {
      const opts = options || {};
      const info = opts.fontInfo || {};
      const displayPt = Number.isFinite(info.displayPt) ? info.displayPt
        : Number.isFinite(info.scaledPt) ? info.scaledPt
        : Number.isFinite(info.pt) ? info.pt
        : Number(opts.pt);
      const pxValue = Number.isFinite(info.scaledPx) ? info.scaledPx
        : (Number.isFinite(displayPt) ? displayPt * (96 / 72) : Number(opts.scaledPx));
      const roundedPt = Number.isFinite(displayPt) ? Math.round(displayPt * 10) / 10 : displayPt;
      const roundedPx = Number.isFinite(pxValue) ? Math.round(pxValue) : pxValue;
      if (opts.element) {
        const label = (Number.isFinite(roundedPt) && Number.isFinite(roundedPx))
          ? `${roundedPt} pt (${roundedPx}px)`
          : (Number.isFinite(roundedPt) ? `${roundedPt} pt` : (Number.isFinite(roundedPx) ? `${roundedPx}px` : ''));
        opts.element.textContent = label;
      }
      if (opts.input && Number.isFinite(displayPt)) {
        try {
          opts.input.value = String(displayPt);
        } catch (assignErr) {
          console.error('chartStyle.renderFontSizeLabel fallback input sync error', assignErr);
        }
      }
      debug('Debug: chartStyle.renderFontSizeLabel fallback used', {
        hasElement: !!opts.element,
        hasInput: !!opts.input,
        displayPt: displayPt,
        scaledPx: pxValue
      });
    };
  }

  if ((!Main.bootstrap || typeof Main.bootstrap.init !== 'function') && typeof require === 'function') {
    try {
      require('./main/bootstrap.js');
      debug('Debug: main.js bootstrap fallback required via Node');
    } catch (err) {
      debug('Debug: main.js bootstrap fallback require failed', { err });
    }
  }
  if ((!Main.tabs || typeof Main.tabs.createManager !== 'function') && typeof require === 'function') {
    try {
      require('./main/tabs/render.js');
      require('./main/tabs/unsavedPrompt.js');
      require('./main/tabs/duplicatePrompt.js');
      require('./main/tabs.js');
      debug('Debug: main.js tabs fallback required via Node (helpers + manager)');
    } catch (err) {
      debug('Debug: main.js tabs fallback require failed', { err });
    }
  }
  if (!Main.bootstrap || typeof Main.bootstrap.init !== 'function') {
    const message = 'main.js requires Main.bootstrap.init to be available.';
    console.error(message);
    throw new Error(message);
  }
  if (!Main.tabs || typeof Main.tabs.createManager !== 'function') {
    const message = 'main.js requires Main.tabs.createManager to be available.';
    console.error(message);
    throw new Error(message);
  }

  const bootstrap = Main.bootstrap.init(Main);
  debug('Debug: main.js bootstrap context resolved', {
    hasSession: !!bootstrap?.session,
    hasPreviews: !!bootstrap?.previews,
    domReady: !!bootstrap?.dom
  });

  const MainComponents = Main.components || {};
  const MainSession = bootstrap.session;
  const MainPreviews = bootstrap.previews;
  const MainDomControls = bootstrap.domControls;
  const MainSessionActions = bootstrap.sessionActions;
  const MainTabDrag = bootstrap.tabDrag;
  const WORKSPACES = bootstrap.workspaces;
  const GRAPH_TYPES = bootstrap.graphTypes || [];
  const GRAPH_VARIANTS = bootstrap.graphVariants || [];
  const dom = bootstrap.dom;
  const workspaceState = bootstrap.workspaceState;
  const withSessionContext = bootstrap.withSessionContext;
  const WORKSPACE_FILE_TYPES = bootstrap.sessionFileTypes || [];

  const requiredSessionHelpers = [
    'getActiveTab',
    'persistActiveTabState',
    'buildSessionPayload',
    'loadWorkspaceSessionBlob',
    'applySessionData',
    'createTab'
  ];
  const missingSessionHelpers = requiredSessionHelpers.filter(name => typeof MainSession[name] !== 'function');
  if (missingSessionHelpers.length) {
    const message = `main.js requires session helpers: ${missingSessionHelpers.join(', ')}`;
    console.error(message);
    throw new Error(message);
  }
  debug('Debug: main.js session helpers verified', { helpers: requiredSessionHelpers });

  const scheduleDrawBoxplot = typeof MainComponents.scheduleDrawBoxplot === 'function'
    ? MainComponents.scheduleDrawBoxplot
    : () => debug('Debug: main scheduler fallback used', { type: 'boxplot' });
  const scheduleDrawScatter = typeof MainComponents.scheduleDrawScatter === 'function'
    ? MainComponents.scheduleDrawScatter
    : () => debug('Debug: main scheduler fallback used', { type: 'scatter' });
  const scheduleDrawPca = typeof MainComponents.scheduleDrawPca === 'function'
    ? MainComponents.scheduleDrawPca
    : () => debug('Debug: main scheduler fallback used', { type: 'pca' });
  const scheduleDrawLine = typeof MainComponents.scheduleDrawLine === 'function'
    ? MainComponents.scheduleDrawLine
    : () => debug('Debug: main scheduler fallback used', { type: 'line' });
  const scheduleDrawHeatmap = typeof MainComponents.scheduleDrawHeatmap === 'function'
    ? MainComponents.scheduleDrawHeatmap
    : () => debug('Debug: main scheduler fallback used', { type: 'heatmap' });
  const scheduleDrawHist = typeof MainComponents.scheduleDrawHist === 'function'
    ? MainComponents.scheduleDrawHist
    : () => debug('Debug: main scheduler fallback used', { type: 'hist' });
  const scheduleDrawPie = typeof MainComponents.scheduleDrawPie === 'function'
    ? MainComponents.scheduleDrawPie
    : () => debug('Debug: main scheduler fallback used', { type: 'pie' });
  const scheduleDrawSurvival = typeof MainComponents.scheduleDrawSurvival === 'function'
    ? MainComponents.scheduleDrawSurvival
    : () => debug('Debug: main scheduler fallback used', { type: 'survival' });

  // Shared color palette
  const palette = Shared.palette = Shared.palette || {};
  const DEFAULT_SCATTER_COLORS = typeof palette.ensureDefaultScatterColors === 'function'
    ? palette.ensureDefaultScatterColors()
    : (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
      ? palette.DEFAULT_SCATTER_COLORS
      : (Array.isArray(window.DEFAULT_SCATTER_COLORS) ? window.DEFAULT_SCATTER_COLORS : []));
  window.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;

  // Color picker fallback
  function attachColorPickerNear(el) {
    if (window.Shared?.attachColorPickerNear) window.Shared.attachColorPickerNear(el);
  }
  window.attachColorPickerNear = attachColorPickerNear;

  // Initialize color overlay
  (function initColorOverlay() {
    if (window.Shared?.initColorPickerOverlay) {
      const overlay = window.Shared.initColorPickerOverlay();
      document.querySelectorAll('input[type="color"]').forEach(el => {
        if (el !== overlay) attachColorPickerNear(el);
      });
      debug('Debug: color overlay initialized', { overlay: !!overlay });
    }
  })();

  // Fallback for jQuery-like selector
  const fallbackDollar = (selector) => {
    const el = document.querySelector(selector);
    debug('Debug: fallback $ helper used', { selector, found: !!el });
    return el;
  };
  const hasCustomDollar = typeof window.$ === 'function' && !(window.$.fn?.jquery);
  const $ = hasCustomDollar ? window.$ : fallbackDollar;
  if (!hasCustomDollar) {
    window.$ = fallbackDollar;
    debug('Debug: window.$ fallback installed');
  }

  if (typeof Shared.makeEditable === 'function') {
    window.makeEditable = Shared.makeEditable;
    debug('Debug: main linked Shared.makeEditable', { hasShared: true }); // Debug: shared makeEditable bridge
  }
  if (typeof Shared.autoResizeSvg === 'function') {
    window.autoResizeSvg = Shared.autoResizeSvg;
    debug('Debug: main linked Shared.autoResizeSvg', { hasShared: true }); // Debug: shared autoResize bridge
  }
  if (typeof Shared.serializeCleanSVG === 'function') {
    window.serializeCleanSVG = Shared.serializeCleanSVG;
    debug('Debug: main linked Shared.serializeCleanSVG', { hasShared: true }); // Debug: shared serialize bridge
  }

  // Workspace layout state and configuration
  if (typeof chartStyle.onTextSizeLockChange === 'function') {
    chartStyle.onTextSizeLockChange((locked, origin, details) => {
      const scopeId = details?.scopeId || null;
      const normalizedScope = scopeId && scopeId.endsWith('-scope') ? scopeId.replace(/-scope$/, '') : scopeId;
      debug('Debug: main text size lock broadcast', {
        locked,
        origin,
        scope: normalizedScope || 'global'
      });
      const scopeHandlers = {
        vennGraphPanel: () => { try { window.Components?.venn?.draw?.(); } catch (err) { console.error('main text lock venn redraw error', err); } },
        boxGraphPanel: () => { try { scheduleDrawBoxplot(); } catch (err) { console.error('main text lock box redraw error', err); } },
        scatterGraphPanel: () => { try { scheduleDrawScatter(); } catch (err) { console.error('main text lock scatter redraw error', err); } },
        pcaGraphPanel: () => { try { scheduleDrawPca(); } catch (err) { console.error('main text lock pca redraw error', err); } },
        lineGraphPanel: () => { try { scheduleDrawLine(); } catch (err) { console.error('main text lock line redraw error', err); } },
        heatmapGraphPanel: () => { try { scheduleDrawHeatmap(); } catch (err) { console.error('main text lock heatmap redraw error', err); } },
        histGraphPanel: () => { try { scheduleDrawHist(); } catch (err) { console.error('main text lock hist redraw error', err); } },
        pieGraphPanel: () => { try { scheduleDrawPie(); } catch (err) { console.error('main text lock pie redraw error', err); } },
        survivalGraphPanel: () => { try { scheduleDrawSurvival(); } catch (err) { console.error('main text lock survival redraw error', err); } },
        rocGraphPanel: () => {
          try {
            if (window.Components?.roc?.draw) {
              window.Components.roc.draw();
            }
          } catch (err) { console.error('main text lock roc redraw error', err); }
        }
      };
      if (normalizedScope && scopeHandlers[normalizedScope]) {
        scopeHandlers[normalizedScope]();
      } else {
        Object.keys(scopeHandlers).forEach(key => {
          try {
            scopeHandlers[key]();
          } catch (err) {
            console.error('main text lock handler error', err);
          }
        });
      }
    }, { origin: 'main-text-lock-listener' });
  } else {
    debug('Debug: main text size lock setup skipped', {
      hasOnChange: typeof chartStyle.onTextSizeLockChange === 'function',
      hasSetter: typeof chartStyle.setTextSizeLock === 'function'
    });
  }

  const tabsManager = Main.tabs.createManager({
    session: MainSession,
    previews: MainPreviews,
    domControls: MainDomControls,
    tabDrag: MainTabDrag,
    workspaces: WORKSPACES,
    graphTypes: bootstrap.graphTypes,
    graphVariants: GRAPH_VARIANTS,
    sessionFileTypes: bootstrap.sessionFileTypes,
    dom,
    workspaceState,
    withSessionContext
  });
  debug('Debug: main.js tabs manager ready', { hasManager: !!tabsManager });

  const { initializeWorkspace } = tabsManager;

  const styleSyncApi = Main.styleSync && typeof Main.styleSync.init === 'function'
    ? Main.styleSync.init({
      session: MainSession,
      workspaceState,
      workspaces: WORKSPACES,
      domControls: MainDomControls,
      previews: MainPreviews,
      dom,
      renderTabs: typeof tabsManager.renderTabs === 'function' ? () => tabsManager.renderTabs() : null
    })
    : null;
  if (!styleSyncApi) {
    debug('Debug: styleSync init skipped or unavailable');
  }

  const getSessionActionsContext = () => tabsManager.getSessionActionsContext();

  async function handleSessionSaveClick(options) {
    await MainSessionActions.handleSessionSaveClick(getSessionActionsContext(), options || {});
  }

  async function handleSessionLoadClick(options) {
    await MainSessionActions.handleSessionLoadClick(getSessionActionsContext(), options);
  }

  function handleSessionInputChange(event) {
    MainSessionActions.handleSessionInputChange(getSessionActionsContext(), event);
  }

  async function importGraphFileFromWelcome(file, meta = {}) {
    if (!file) {
      debug('Debug: welcome graph import skipped', { reason: 'no-file' });
      return false;
    }
    try {
      await MainSessionActions.loadWorkspaceFile(getSessionActionsContext(), file, {
        reason: 'welcome-graph-load',
        fileHandle: meta.fileHandle || null,
        fileName: meta.fileName || file.name || ''
      });
      debug('Debug: welcome graph imported', {
        fileName: meta.fileName || file.name || null
      });
      return true;
    } catch (err) {
      console.error('welcome graph import error', err);
      return false;
    }
  }

  function debugInteraction(message, payload) {
    debug(message, payload || {});
  }

  function findClosestInteractive(target, selector) {
    if (!target || !selector) {
      return null;
    }
    let node = target;
    while (node) {
      if (node.nodeType === 1 && typeof node.matches === 'function' && node.matches(selector)) {
        return node;
      }
      const parentElement = node.parentElement || (typeof node.getRootNode === 'function' ? node.getRootNode().host : null);
      if (!parentElement && node.assignedSlot) {
        node = node.assignedSlot;
      } else {
        node = parentElement;
      }
    }
    return null;
  }

  async function handleWelcomeGraphOpen() {
    const context = getSessionActionsContext();
    const shared = context.Shared;
    const shouldConfirm = MainSessionActions.shouldWarnBeforeUnload(context);
    if (shouldConfirm && typeof window.confirm === 'function') {
      const proceed = window.confirm('This will replace your current workspace tabs. Continue without saving first?');
      if (!proceed) {
        return;
      }
    }
    if (!shared?.fileIO || typeof shared.fileIO.openGraphFile !== 'function') {
      console.warn('Welcome graph picker unavailable: missing Shared.fileIO.openGraphFile');
      if (dom?.welcomeGraphInput) {
        dom.welcomeGraphInput.value = '';
        dom.welcomeGraphInput.click();
      }
      return;
    }
    let pendingHandle = null;
    let pendingName = '';
    try {
      const result = await shared.fileIO.openGraphFile({
        context: 'welcome-graph',
        fileTypes: WORKSPACE_FILE_TYPES,
        setFileHandle: handle => { pendingHandle = handle || null; },
        setFileName: name => { pendingName = name || ''; },
        loadFromFile: async selectedFile => {
          await importGraphFileFromWelcome(selectedFile, {
            fileHandle: pendingHandle,
            fileName: selectedFile?.name || pendingName
          });
        },
        triggerInput: () => {
          pendingHandle = null;
          pendingName = '';
          if (dom?.welcomeGraphInput) {
            dom.welcomeGraphInput.value = '';
            dom.welcomeGraphInput.click();
          }
        }
      });
      debug('Debug: welcome graph picker result', { status: result?.status, via: result?.via });
    } catch (err) {
      console.error('handleWelcomeGraphOpen error', err);
    }
  }

  function handleWelcomeGraphInputChange(event) {
    const input = event?.target;
    const file = input?.files && input.files[0];
    if (!file) {
      debug('Debug: welcome graph input change without file');
      return;
    }
    const context = getSessionActionsContext();
    const shouldConfirm = MainSessionActions.shouldWarnBeforeUnload(context);
    if (shouldConfirm && typeof window.confirm === 'function') {
      const proceed = window.confirm('This will replace your current workspace tabs. Continue without saving first?');
      if (!proceed) {
        if (event?.target) {
          event.target.value = '';
        }
        return;
      }
    }
    void importGraphFileFromWelcome(file, { fileName: file.name }).catch(err => {
      console.error('welcome graph input import error', err);
    }).finally(() => {
      if (input) {
        input.value = '';
      }
    });
  }

  function resolveUnifiedFileActionTarget(target) {
    const explicit = findClosestInteractive(target, '[data-file-action]');
    if (explicit) {
      const action = explicit.dataset.fileAction || '';
      if (action === 'open' || action === 'save' || action === 'saveAs') {
        return { action, element: explicit };
      }
    }
    const idOwner = findClosestInteractive(target, '[id]');
    if (!idOwner || !idOwner.id) {
      return null;
    }
    const id = idOwner.id;
    if (id === 'welcomeOpenGraph') {
      return { action: 'open-welcome', element: idOwner };
    }
    if (/^open[A-Z].*Graph$/.test(id)) {
      return { action: 'open', element: idOwner };
    }
    if (/^save[A-Z].*Graph$/.test(id)) {
      return { action: 'save', element: idOwner };
    }
    if (/^saveAs[A-Z].*/.test(id)) {
      return { action: 'saveAs', element: idOwner };
    }
    return null;
  }

  function closeToolbarMenuFromActionTarget(target) {
    const menuWrapper = target?.closest?.('.workspace-toolbar__menu');
    if (!menuWrapper) {
      return;
    }
    menuWrapper.classList.remove('workspace-toolbar__menu--open');
    const trigger = menuWrapper.querySelector('.workspace-toolbar__button[data-menu-id]');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  function shouldWarnBeforeUnload() {
    return MainSessionActions.shouldWarnBeforeUnload(getSessionActionsContext());
  }

  initializeWorkspace({
    onSessionSaveClick: handleSessionSaveClick,
    onSessionLoadClick: handleSessionLoadClick,
    onSessionInputChange: handleSessionInputChange,
    onMatchStylesClick: styleSyncApi?.handleMatchStylesClick,
    onWelcomeGraphInputChange: handleWelcomeGraphInputChange
  });

  document.addEventListener('click', event => {
    const actionTarget = resolveUnifiedFileActionTarget(event.target);
    if (!actionTarget) {
      return;
    }
    closeToolbarMenuFromActionTarget(actionTarget.element);
    event.preventDefault();
    event.stopImmediatePropagation();
    const action = actionTarget.action;
    if (action === 'open-welcome') {
      void handleWelcomeGraphOpen();
      return;
    }
    if (action === 'open') {
      void handleSessionLoadClick({ reason: 'toolbar-open' });
      return;
    }
    if (action === 'save') {
      void handleSessionSaveClick({ reason: 'toolbar-save' });
      return;
    }
    if (action === 'saveAs') {
      void handleSessionSaveClick({ reason: 'toolbar-save-as', forcePicker: true });
    }
  }, true);

  document.addEventListener('click', event => {
    const target = event.target;
    const sessionButton = findClosestInteractive(target, '[data-session-action]');
    if (sessionButton) {
      event.preventDefault();
      const action = sessionButton.dataset.sessionAction;
      if (action === 'save') {
        void handleSessionSaveClick();
      } else if (action === 'open') {
        const policy = sessionButton.dataset.sessionActionNewWindow;
        void handleSessionLoadClick({ openInNewWindowIfDirty: policy === 'dirty' });
      }
      return;
    }
    const welcomeGraphItem = findClosestInteractive(target, '#welcomeOpenGraph');
    if (welcomeGraphItem) {
      event.preventDefault();
      void handleWelcomeGraphOpen();
      return;
    }
    const styleSyncTrigger = findClosestInteractive(target, '[data-style-sync-trigger]');
    if (styleSyncTrigger) {
      event.preventDefault();
      debugInteraction('Debug: match styles trigger detected', {
        id: styleSyncTrigger.id || null,
        tag: styleSyncTrigger.tagName
      });
      if (styleSyncApi?.handleMatchStylesClick) {
        styleSyncApi.handleMatchStylesClick();
      }
    }
  });

  window.addEventListener('beforeunload', event => {
    if (shouldWarnBeforeUnload()) {
      const message = 'You have unsaved workspace changes. Save your .graph file before leaving?';
      event.preventDefault();
      event.returnValue = message;
      debug('Debug: beforeunload prompt engaged', { message }); // Debug: beforeunload trigger trace
      return message;
    }
    debug('Debug: beforeunload bypassed', { dirty: workspaceState.sessionDirty }); // Debug: beforeunload bypass trace
    return undefined;
  });

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      drawFromLists();
    }
  });

  window.addEventListener('scroll', () => MainPreviews.hideTabPreviewTooltip('scroll'), true);
  window.addEventListener('resize', () => MainPreviews.hideTabPreviewTooltip('resize'));

})();

