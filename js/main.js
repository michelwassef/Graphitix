(function() {
  "use strict";
  console.debug("Debug: main.js loaded");

  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
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
      console.debug('Debug: chartStyle.renderFontSizeLabel fallback used', {
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
      console.debug('Debug: main.js bootstrap fallback required via Node');
    } catch (err) {
      console.debug('Debug: main.js bootstrap fallback require failed', { err });
    }
  }
  if ((!Main.tabs || typeof Main.tabs.createManager !== 'function') && typeof require === 'function') {
    try {
      require('./main/tabs/render.js');
      require('./main/tabs/unsavedPrompt.js');
      require('./main/tabs/duplicatePrompt.js');
      require('./main/tabs.js');
      console.debug('Debug: main.js tabs fallback required via Node (helpers + manager)');
    } catch (err) {
      console.debug('Debug: main.js tabs fallback require failed', { err });
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
  console.debug('Debug: main.js bootstrap context resolved', {
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
  const GRAPH_FILE_TYPES = [
    { description: 'Workspace Graph', accept: { 'application/json': ['.graph', '.json'] } }
  ];

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
  console.debug('Debug: main.js session helpers verified', { helpers: requiredSessionHelpers });

  const scheduleDrawBoxplot = typeof MainComponents.scheduleDrawBoxplot === 'function'
    ? MainComponents.scheduleDrawBoxplot
    : () => console.debug('Debug: main scheduler fallback used', { type: 'boxplot' });
  const scheduleDrawScatter = typeof MainComponents.scheduleDrawScatter === 'function'
    ? MainComponents.scheduleDrawScatter
    : () => console.debug('Debug: main scheduler fallback used', { type: 'scatter' });
  const scheduleDrawPca = typeof MainComponents.scheduleDrawPca === 'function'
    ? MainComponents.scheduleDrawPca
    : () => console.debug('Debug: main scheduler fallback used', { type: 'pca' });
  const scheduleDrawLine = typeof MainComponents.scheduleDrawLine === 'function'
    ? MainComponents.scheduleDrawLine
    : () => console.debug('Debug: main scheduler fallback used', { type: 'line' });
  const scheduleDrawHeatmap = typeof MainComponents.scheduleDrawHeatmap === 'function'
    ? MainComponents.scheduleDrawHeatmap
    : () => console.debug('Debug: main scheduler fallback used', { type: 'heatmap' });
  const scheduleDrawHist = typeof MainComponents.scheduleDrawHist === 'function'
    ? MainComponents.scheduleDrawHist
    : () => console.debug('Debug: main scheduler fallback used', { type: 'hist' });
  const scheduleDrawPie = typeof MainComponents.scheduleDrawPie === 'function'
    ? MainComponents.scheduleDrawPie
    : () => console.debug('Debug: main scheduler fallback used', { type: 'pie' });
  const scheduleDrawSurvival = typeof MainComponents.scheduleDrawSurvival === 'function'
    ? MainComponents.scheduleDrawSurvival
    : () => console.debug('Debug: main scheduler fallback used', { type: 'survival' });

  // Shared color palette
  const DEFAULT_SCATTER_COLORS = window.DEFAULT_SCATTER_COLORS || [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999'
  ];
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
      console.debug('Debug: color overlay initialized', { overlay: !!overlay });
    }
  })();

  // Fallback for jQuery-like selector
  const fallbackDollar = (selector) => {
    const el = document.querySelector(selector);
    console.debug('Debug: fallback $ helper used', { selector, found: !!el });
    return el;
  };
  const hasCustomDollar = typeof window.$ === 'function' && !(window.$.fn?.jquery);
  const $ = hasCustomDollar ? window.$ : fallbackDollar;
  if (!hasCustomDollar) {
    window.$ = fallbackDollar;
    console.debug('Debug: window.$ fallback installed');
  }

  if (typeof Shared.makeEditable === 'function') {
    window.makeEditable = Shared.makeEditable;
    console.debug('Debug: main linked Shared.makeEditable', { hasShared: true }); // Debug: shared makeEditable bridge
  }
  if (typeof Shared.autoResizeSvg === 'function') {
    window.autoResizeSvg = Shared.autoResizeSvg;
    console.debug('Debug: main linked Shared.autoResizeSvg', { hasShared: true }); // Debug: shared autoResize bridge
  }
  if (typeof Shared.serializeCleanSVG === 'function') {
    window.serializeCleanSVG = Shared.serializeCleanSVG;
    console.debug('Debug: main linked Shared.serializeCleanSVG', { hasShared: true }); // Debug: shared serialize bridge
  }

  // Workspace layout state and configuration
  if (typeof chartStyle.onTextSizeLockChange === 'function') {
    chartStyle.onTextSizeLockChange((locked, origin, details) => {
      const scopeId = details?.scopeId || null;
      const normalizedScope = scopeId && scopeId.endsWith('-scope') ? scopeId.replace(/-scope$/, '') : scopeId;
      console.debug('Debug: main text size lock broadcast', {
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
    console.debug('Debug: main text size lock setup skipped', {
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
  console.debug('Debug: main.js tabs manager ready', { hasManager: !!tabsManager });

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
    console.debug('Debug: styleSync init skipped or unavailable');
  }

  const getSessionActionsContext = () => tabsManager.getSessionActionsContext();

  async function handleSessionSaveClick() {
    await MainSessionActions.handleSessionSaveClick(getSessionActionsContext());
  }

  async function handleSessionLoadClick(options) {
    await MainSessionActions.handleSessionLoadClick(getSessionActionsContext(), options);
  }

  function handleSessionInputChange(event) {
    MainSessionActions.handleSessionInputChange(getSessionActionsContext(), event);
  }

  function deriveGraphTitle(fileName, type) {
    const trimmed = (fileName || '').replace(/\.[^/.]+$/, '').trim();
    if (trimmed) {
      return trimmed;
    }
    const info = GRAPH_TYPES.find(entry => entry.type === type);
    return info ? info.label : '';
  }

  function extractGraphLayout(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (payload.layoutState && typeof payload.layoutState === 'object') {
      return payload.layoutState;
    }
    if (payload.layout && typeof payload.layout === 'object') {
      return payload.layout;
    }
    return null;
  }

  async function importGraphFileFromWelcome(file, meta = {}) {
    if (!file) {
      console.debug('Debug: welcome graph import skipped', { reason: 'no-file' });
      return false;
    }
    let text;
    try {
      text = await file.text();
    } catch (err) {
      console.error('welcome graph read error', err);
      return false;
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      console.error('welcome graph parse error', err);
      return false;
    } finally {
      text = null;
    }
    const rawType = typeof payload?.type === 'string' ? payload.type.trim() : '';
    const type = rawType.toLowerCase();
    if (!type) {
      console.warn('welcome graph missing type', { fileName: meta.fileName || file.name || null });
      return false;
    }
    if (!WORKSPACES || !WORKSPACES[type]) {
      console.warn('welcome graph unknown type', { type });
      return false;
    }
    tabsManager.handleGraphSelection(type);
    const activeTab = tabsManager.getActiveTab();
    if (!activeTab || activeTab.type !== type) {
      console.error('welcome graph active tab mismatch', { requested: type, active: activeTab ? activeTab.type : null });
      return false;
    }
    const baseTitle = deriveGraphTitle(meta.fileName || file.name || '', type);
    if (baseTitle) {
      const uniqueTitle = MainSession.generateUniqueTabTitle(baseTitle, { excludeTabId: activeTab.id });
      if (uniqueTitle !== activeTab.title) {
        const previousTitle = activeTab.title;
        activeTab.title = uniqueTitle;
        MainSession.markSessionDirty('tab-title-updated', { tabId: activeTab.id, previousTitle, nextTitle: uniqueTitle });
      }
    }
    const layoutState = extractGraphLayout(payload);
    if (layoutState) {
      activeTab.layoutState = layoutState;
      activeTab.layoutSignature = MainSession.serializePayloadSignature(layoutState);
    } else {
      activeTab.layoutState = null;
      activeTab.layoutSignature = MainSession.serializePayloadSignature(null);
    }
    MainSession.assignTabPayload(activeTab, payload, { reason: 'welcome-graph-load' });
    MainSession.markSessionDirty('welcome-graph-load', { tabId: activeTab.id, type });
    tabsManager.renderTabs();
    const workspaceConfig = WORKSPACES[type];
    try {
      if (typeof workspaceConfig.loadFromPayload === 'function') {
        workspaceConfig.loadFromPayload(payload);
      } else if (typeof workspaceConfig.loadFromFile === 'function') {
        workspaceConfig.loadFromFile(file);
      }
      if (typeof workspaceConfig.draw === 'function') {
        workspaceConfig.draw();
      }
    } catch (err) {
      console.error('welcome graph apply error', { type, err });
    }
    console.debug('Debug: welcome graph imported', { type, tabId: activeTab.id });
    return true;
  }

  function debugInteraction(message, payload) {
    try {
      if (typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()) {
        return;
      }
    } catch (err) {
      // ignore debug toggle errors; fall through to log
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug(message, payload || {});
    }
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
        fileTypes: GRAPH_FILE_TYPES,
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
      console.debug('Debug: welcome graph picker result', { status: result?.status, via: result?.via });
    } catch (err) {
      console.error('handleWelcomeGraphOpen error', err);
    }
  }

  function handleWelcomeGraphInputChange(event) {
    const input = event?.target;
    const file = input?.files && input.files[0];
    if (!file) {
      console.debug('Debug: welcome graph input change without file');
      return;
    }
    void importGraphFileFromWelcome(file, { fileName: file.name }).catch(err => {
      console.error('welcome graph input import error', err);
    }).finally(() => {
      if (input) {
        input.value = '';
      }
    });
  }

  function shouldWarnBeforeUnload() {
    return MainSessionActions.shouldWarnBeforeUnload(getSessionActionsContext());
  }

  async function consumeTransferredSessionIfAvailable() {
    const win = window;
    if (!win || !win.localStorage) {
      return;
    }
    let url;
    try {
      url = new URL(win.location.href);
    } catch (err) {
      console.error('session transfer URL parse error', err);
      return;
    }
    const transferKey = url.searchParams.get('sessionTransferKey');
    if (!transferKey) {
      return;
    }
    url.searchParams.delete('sessionTransferKey');
    try {
      win.history.replaceState({}, document.title, url.toString());
    } catch (err) {
      console.error('session transfer history update error', err);
    }
    let stored = null;
    try {
      stored = win.localStorage.getItem(transferKey);
    } catch (err) {
      console.error('session transfer storage read error', err);
    }
    if (!stored) {
      return;
    }
    const context = getSessionActionsContext();
    try {
      const parsed = JSON.parse(stored);
      const data = typeof parsed === 'string' ? parsed : parsed?.data;
      const fileName = parsed?.fileName || 'workspace.session';
      win.localStorage.removeItem(transferKey);
      if (!data) {
        return;
      }
      const BlobCtor = win.Blob || Blob;
      const blob = new BlobCtor([data], { type: 'application/json' });
      await MainSession.loadWorkspaceSessionBlob(blob, withSessionContext({
        reason: 'session-transfer',
        fileHandle: null,
        fileName,
        hideDuplicatePrompt: context.hideDuplicatePrompt,
        renderTabs: context.renderTabs,
        activateTab: context.activateTab,
        showGraphSelection: context.showGraphSelection
      }));
    } catch (err) {
      console.error('session transfer consume error', err);
      try {
        win.localStorage.removeItem(transferKey);
      } catch (cleanupErr) {
        console.error('session transfer cleanup error', cleanupErr);
      }
    }
  }

  initializeWorkspace({
    onSessionSaveClick: handleSessionSaveClick,
    onSessionLoadClick: handleSessionLoadClick,
    onSessionInputChange: handleSessionInputChange,
    onMatchStylesClick: styleSyncApi?.handleMatchStylesClick,
    onWelcomeGraphInputChange: handleWelcomeGraphInputChange
  });

  void consumeTransferredSessionIfAvailable();

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
      const message = 'You have unsaved workspace changes. Save your session before leaving?';
      event.preventDefault();
      event.returnValue = message;
      console.debug('Debug: beforeunload prompt engaged', { message }); // Debug: beforeunload trigger trace
      return message;
    }
    console.debug('Debug: beforeunload bypassed', { dirty: workspaceState.sessionDirty }); // Debug: beforeunload bypass trace
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

