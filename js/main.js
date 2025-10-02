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

  const MainComponents = Main.components || {};

  if (!Main.session) {
    const message = 'main.js requires Main.session to be initialized before loading.';
    console.error(message);
    throw new Error(message);
  }
  if (!Main.previews) {
    const message = 'main.js requires Main.previews to be initialized before loading.';
    console.error(message);
    throw new Error(message);
  }

  const MainSession = Main.session;
  const MainPreviews = Main.previews;
  console.debug('Debug: main.js dependencies detected', {
    hasSession: !!MainSession,
    hasPreviews: !!MainPreviews
  }); // Debug: dependency confirmation log

  if (!Main.domControls || !Main.sessionActions || !Main.tabDrag) {
    const message = 'main.js requires domControls, sessionActions, and tabDrag to be initialized before loading.';
    console.error(message);
    throw new Error(message);
  }

  const MainDomControls = Main.domControls;
  const MainSessionActions = Main.sessionActions;
  const MainTabDrag = Main.tabDrag;
  console.debug('Debug: main.js helper modules detected', {
    hasDomControls: !!MainDomControls,
    hasSessionActions: !!MainSessionActions,
    hasTabDrag: !!MainTabDrag
  });

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

  const WORKSPACES = MainComponents.registry || {};
  function withSessionContext(extra = {}) {
    const context = {
      workspaces: WORKSPACES,
      previews: MainPreviews
    };
    return Object.assign(context, extra);
  }
  const dom = MainDomControls.createDomHandles();
  const workspaceState = MainSession.workspaceState;
  if (!workspaceState) {
    const message = 'main.js requires Main.session.workspaceState to be available.';
    console.error(message);
    throw new Error(message);
  }

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

  function setAppHeaderVisibility(shouldShow, meta = {}) {
    MainDomControls.setAppHeaderVisibility(dom, shouldShow, meta);
  }

  let unsavedPromptBusy = false;

  function hideWorkspaceElement(config) {
    MainDomControls.hideWorkspaceElement(config);
  }

  function hideAllWorkspaces() {
    MainDomControls.hideAllWorkspaces(WORKSPACES);
  }

  function ensureDefaultPayload(type, config) {
    return MainDomControls.ensureDefaultPayload(MainSession, type, config);
  }

  function applyWorkspacePayload(config, payload) {
    MainDomControls.applyWorkspacePayload(config, payload);
  }

  function getActiveTab() {
    return MainSession.getActiveTab();
  }

  function showWorkspaceForTab(tab, options = {}) {
    MainDomControls.showWorkspaceForTab({
      tab,
      options,
      dom,
      workspaces: WORKSPACES,
      session: MainSession,
      workspaceState
    });
  }

  function showGraphSelection(options = {}) {
    MainDomControls.showGraphSelection({
      dom,
      workspaces: WORKSPACES,
      reason: options.reason
    });
  }

  function getSessionActionsContext() {
    return {
      Shared,
      session: MainSession,
      workspaceState,
      sessionFileTypes: SESSION_FILE_TYPES,
      withSessionContext,
      dom,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection
    };
  }

  async function handleSessionSaveClick() {
    await MainSessionActions.handleSessionSaveClick(getSessionActionsContext());
  }

  async function handleSessionLoadClick() {
    await MainSessionActions.handleSessionLoadClick(getSessionActionsContext());
  }

  function handleSessionInputChange(event) {
    MainSessionActions.handleSessionInputChange(getSessionActionsContext(), event);
  }

  function shouldWarnBeforeUnload() {
    return MainSessionActions.shouldWarnBeforeUnload(getSessionActionsContext());
  }

  function getTabById(tabId) {
    return workspaceState.tabs.find(tab => tab.id === tabId) || null;
  }

  function determineDuplicateSourceCandidate(preferredId) {
    if (preferredId) {
      const preferred = getTabById(preferredId);
      if (preferred && preferred.type && !preferred.isWelcome) {
        return preferred.id;
      }
    }
    if (workspaceState.lastActiveGraphId) {
      const lastActive = getTabById(workspaceState.lastActiveGraphId);
      if (lastActive && lastActive.type && !lastActive.isWelcome) {
        return lastActive.id;
      }
    }
    return null;
  }

  function getTabDragContext() {
    return {
      dom,
      workspaceState,
      renderTabs,
      markSessionDirty: MainSession.markSessionDirty
    };
  }

  function applyTabDragClasses() {
    MainTabDrag.applyTabDragClasses(getTabDragContext());
  }

  function updateTabDragHover(targetTabId, insertBefore, meta = {}) {
    MainTabDrag.updateTabDragHover(getTabDragContext(), targetTabId, insertBefore, meta);
  }

  function resetTabDragState(reason) {
    MainTabDrag.resetTabDragState(getTabDragContext(), reason);
  }

  function moveWorkspaceTab(tabId, targetIndex) {
    return MainTabDrag.moveWorkspaceTab(getTabDragContext(), tabId, targetIndex);
  }

  function handleTabDragStart(event, tab) {
    MainTabDrag.handleTabDragStart(getTabDragContext(), event, tab);
  }

  function handleTabDragEnd(event, tab) {
    MainTabDrag.handleTabDragEnd(getTabDragContext(), event, tab);
  }

  function handleTabDragOver(event, tab) {
    MainTabDrag.handleTabDragOver(getTabDragContext(), event, tab);
  }

  function handleTabDragLeave(event, tab) {
    MainTabDrag.handleTabDragLeave(getTabDragContext(), event, tab);
  }

  function handleTabDrop(event, tab) {
    MainTabDrag.handleTabDrop(getTabDragContext(), event, tab);
  }

  function handleTabListDragOver(event) {
    MainTabDrag.handleTabListDragOver(getTabDragContext(), event);
  }

  function handleTabListDrop(event) {
    MainTabDrag.handleTabListDrop(getTabDragContext(), event);
  }

  function handleTabListDragLeave(event) {
    MainTabDrag.handleTabListDragLeave(getTabDragContext(), event);
  }

  function renderTabs() {
    if (!dom.tabsList) return;
    MainPreviews.hideTabPreviewTooltip('render');
    dom.tabsList.innerHTML = '';
    workspaceState.tabs.forEach((tab, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workspace-tab'
        + (tab.id === workspaceState.activeTabId ? ' is-active' : '')
        + (tab.isWelcome ? ' is-welcome' : '')
        + (tab.isRenaming ? ' is-renaming' : '');
      btn.dataset.tabId = tab.id;
      btn.dataset.tabIndex = String(index);
      if (tab.previewMarkup) {
        btn.dataset.hasPreview = 'true';
      } else {
        delete btn.dataset.hasPreview;
      }
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', tab.id === workspaceState.activeTabId ? 'true' : 'false');
      btn.draggable = !tab.isRenaming;
      const displayTitle = tab.title || `Workspace ${index + 1}`;
      btn.addEventListener('click', () => {
        console.debug('Debug: workspace tab selected', { tabId: tab.id });
        activateTab(tab.id);
      });
      btn.addEventListener('dragstart', event => handleTabDragStart(event, tab));
      btn.addEventListener('dragend', event => handleTabDragEnd(event, tab));
      btn.addEventListener('dragover', event => handleTabDragOver(event, tab));
      btn.addEventListener('dragleave', event => handleTabDragLeave(event, tab));
      btn.addEventListener('drop', event => handleTabDrop(event, tab));
      btn.addEventListener('mouseenter', event => MainPreviews.handleTabPreviewEnter(event, tab));
      btn.addEventListener('mouseleave', () => MainPreviews.handleTabPreviewLeave('leave'));
      btn.addEventListener('blur', () => MainPreviews.handleTabPreviewLeave('blur'));

      const label = document.createElement('span');
      label.className = 'workspace-tab__label';
      label.textContent = displayTitle;
      if (!tab.isWelcome) {
        label.title = 'Double-click to rename this tab';
        label.addEventListener('dblclick', event => {
          event.stopPropagation();
          beginRenameTab(tab.id);
        });
      }
      btn.appendChild(label);

      if (tab.isRenaming) {
        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.className = 'workspace-tab__rename';
        renameInput.value = displayTitle;
        renameInput.setAttribute('aria-label', 'Rename workspace tab');
        let renameHandled = false;
        const commitRename = (value, reason) => {
          if (renameHandled) return;
          renameHandled = true;
          console.debug('Debug: tab rename commit requested', { tabId: tab.id, reason, nextTitle: value });
          commitTabRename(tab.id, value, { reason });
        };
        const cancelRename = reason => {
          if (renameHandled) return;
          renameHandled = true;
          console.debug('Debug: tab rename cancel requested', { tabId: tab.id, reason });
          cancelTabRename(tab.id, reason);
        };
        renameInput.addEventListener('keydown', event => {
          const key = event.key;
          if (key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commitRename(renameInput.value, 'enter');
          } else if (key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelRename('escape');
          } else {
            if (key === ' ' || key === 'Spacebar' || key === 'Space') {
              event.preventDefault();
              event.stopPropagation();
              const selectionStart = typeof renameInput.selectionStart === 'number'
                ? renameInput.selectionStart
                : renameInput.value.length;
              const selectionEnd = typeof renameInput.selectionEnd === 'number'
                ? renameInput.selectionEnd
                : selectionStart;
              const before = renameInput.value.slice(0, selectionStart);
              const after = renameInput.value.slice(selectionEnd);
              renameInput.value = `${before} ${after}`;
              const nextCaret = selectionStart + 1;
              if (typeof renameInput.setSelectionRange === 'function') {
                renameInput.setSelectionRange(nextCaret, nextCaret);
              }
              console.debug('Debug: tab rename space inserted', { tabId: tab.id, caret: nextCaret });
            } else {
              event.stopPropagation();
            }
          }
        });
        renameInput.addEventListener('keyup', event => {
          if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
            event.stopPropagation();
          }
        });
        renameInput.addEventListener('keypress', event => {
          if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
            event.stopPropagation();
          }
        });
        renameInput.addEventListener('blur', () => {
          cancelRename('blur');
        });
        renameInput.addEventListener('click', event => event.stopPropagation());
        btn.appendChild(renameInput);
      }

      if (!tab.isWelcome && tab.allowClose !== false) {
        const closeEl = document.createElement('span');
        closeEl.className = 'workspace-tab__close';
        closeEl.setAttribute('role', 'button');
        closeEl.setAttribute('aria-label', `Close ${displayTitle} tab`);
        closeEl.tabIndex = 0;
        closeEl.textContent = '×';
        closeEl.addEventListener('click', event => {
          event.stopPropagation();
          closeTab(tab.id);
        });
        closeEl.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
            event.preventDefault();
            closeTab(tab.id);
          }
        });
        btn.appendChild(closeEl);
      }

      dom.tabsList.appendChild(btn);

      if (tab.isRenaming && workspaceState.renameFocusId === tab.id) {
        requestAnimationFrame(() => {
          const input = btn.querySelector('.workspace-tab__rename');
          if (input) {
            input.focus();
            input.select();
          }
          workspaceState.renameFocusId = null;
        });
      }
    });
    applyTabDragClasses();
  }

  function beginRenameTab(tabId) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: beginRenameTab skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    if (tab.isWelcome) {
      console.debug('Debug: beginRenameTab blocked for welcome tab', { tabId });
      return;
    }
    tab.isRenaming = true;
    workspaceState.renameFocusId = tabId;
    renderTabs();
    console.debug('Debug: tab rename initiated', { tabId });
  }

  function commitTabRename(tabId, newTitle, meta = {}) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: commitTabRename skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    const previousTitle = tab.title;
    const trimmed = (newTitle || '').trim();
    if (trimmed) {
      tab.title = trimmed;
    } else if (!tab.title) {
      const tabIndex = workspaceState.tabs.indexOf(tab);
      tab.title = `Workspace ${tabIndex >= 0 ? tabIndex + 1 : ''}`.trim();
      console.debug('Debug: tab rename fallback applied', { tabId, fallbackTitle: tab.title });
    }
    tab.isRenaming = false;
    workspaceState.renameFocusId = null;
    renderTabs();
    if (tab.title !== previousTitle) {
      MainSession.markSessionDirty('tab-renamed', { tabId, previousTitle, nextTitle: tab.title });
    }
    console.debug('Debug: tab rename committed', { tabId, title: tab.title, trigger: meta.reason || 'unknown' });
  }

  function cancelTabRename(tabId, reason) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: cancelTabRename skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    tab.isRenaming = false;
    workspaceState.renameFocusId = null;
    renderTabs();
    console.debug('Debug: tab rename cancelled', { tabId, reason });
  }

  function setUnsavedPromptBusy(isBusy) {
    unsavedPromptBusy = !!isBusy;
    const targets = [dom.unsavedSave, dom.unsavedDiscard, dom.unsavedCancel];
    targets.forEach(btn => {
      if (btn) {
        btn.disabled = !!isBusy;
      }
    });
    if (dom.unsavedPrompt) {
      dom.unsavedPrompt.classList.toggle('is-busy', !!isBusy);
    }
    console.debug('Debug: unsaved prompt busy state', { busy: unsavedPromptBusy });
  }

  function showUnsavedPrompt(tab, meta = {}) {
    if (!tab) {
      console.debug('Debug: showUnsavedPrompt skipped', { reason: 'missing-tab' });
      return;
    }
    const tabId = tab.id;
    const previousActiveId = meta.previousActiveId !== undefined
      ? meta.previousActiveId
      : (!meta.wasActive && workspaceState.activeTabId && workspaceState.activeTabId !== tabId
        ? workspaceState.activeTabId
        : null);
    const promptState = {
      tabId,
      wasActive: !!meta.wasActive,
      previousActiveId,
      reason: meta.reason || 'close-request',
      timestamp: Date.now()
    };
    workspaceState.pendingClosePrompt = promptState;
    const tabName = tab.title || 'this workspace';
    if (!dom.unsavedPrompt || !dom.unsavedSave || !dom.unsavedDiscard || !dom.unsavedCancel) {
      const confirmMessage = `Close ${tabName} without saving data?`;
      const proceed = window.confirm ? window.confirm(confirmMessage) : true;
      console.debug('Debug: unsaved prompt fallback confirm', { tabId, proceed });
      if (proceed) {
        closeTab(tabId, { force: true, skipPrompt: true, skipPersist: true, reason: 'fallback-confirm' });
      } else {
        workspaceState.pendingClosePrompt = null;
      }
      return;
    }
    if (dom.unsavedTitle) {
      dom.unsavedTitle.textContent = `Save changes to ${tabName}?`;
    }
    if (dom.unsavedMessage) {
      dom.unsavedMessage.textContent = 'This tab has unsaved data. Save to keep your work, close without saving to discard it, or cancel to return to the workspace.';
    }
    dom.unsavedPrompt.dataset.tabId = tabId;
    dom.unsavedPrompt.removeAttribute('hidden');
    dom.unsavedPrompt.focus?.();
    console.debug('Debug: unsaved prompt displayed', promptState);
  }

  function hideUnsavedPrompt() {
    if (!dom.unsavedPrompt) {
      return;
    }
    dom.unsavedPrompt.setAttribute('hidden', 'hidden');
    delete dom.unsavedPrompt.dataset.tabId;
    console.debug('Debug: unsaved prompt hidden');
  }

  async function handleUnsavedSave() {
    if (unsavedPromptBusy) {
      console.debug('Debug: handleUnsavedSave skipped', { reason: 'busy' });
      return;
    }
    const pending = workspaceState.pendingClosePrompt;
    if (!pending) {
      console.debug('Debug: handleUnsavedSave skipped', { reason: 'no-pending' });
      hideUnsavedPrompt();
      return;
    }
    const tab = getTabById(pending.tabId);
    if (!tab) {
      console.debug('Debug: handleUnsavedSave missing tab', { tabId: pending.tabId });
      workspaceState.pendingClosePrompt = null;
      hideUnsavedPrompt();
      return;
    }
    setUnsavedPromptBusy(true);
    hideUnsavedPrompt();
    const restoreTarget = pending.previousActiveId && pending.previousActiveId !== tab.id
      ? pending.previousActiveId
      : null;
    try {
      if (workspaceState.activeTabId !== tab.id) {
        const currentActive = getActiveTab();
        if (currentActive && currentActive.id !== tab.id) {
          MainSession.persistActiveTabState(currentActive, withSessionContext({ reason: 'unsaved-switch' }));
        }
        console.debug('Debug: unsaved prompt activating tab', { tabId: tab.id, previousActiveId: currentActive?.id || null });
        activateTab(tab.id, { reason: 'unsaved-save' });
      }
      const component = window.Components?.[tab.type];
      if (component && typeof component.save === 'function') {
        console.debug('Debug: unsaved prompt invoking save', { tabId: tab.id, type: tab.type });
        await component.save();
      } else if (component && typeof component.saveAs === 'function') {
        console.debug('Debug: unsaved prompt invoking saveAs fallback', { tabId: tab.id, type: tab.type });
        await component.saveAs();
      } else {
        console.warn('Unsaved prompt save unavailable', { tabId: tab.id, type: tab.type });
        workspaceState.pendingClosePrompt = pending;
        showUnsavedPrompt(tab, { wasActive: true, reason: 'no-save-handler', previousActiveId: pending.previousActiveId });
        return;
      }
      MainSession.persistActiveTabState(tab, withSessionContext({ reason: 'unsaved-save' }));
      workspaceState.pendingClosePrompt = null;
      console.debug('Debug: unsaved prompt save complete', { tabId: tab.id });
      closeTab(tab.id, { force: true, skipPrompt: true, skipPersist: true, reason: 'unsaved-save' });
      if (restoreTarget && getTabById(restoreTarget)) {
        activateTab(restoreTarget, { reason: 'restore-after-unsaved-save', skipPersist: true });
      }
    } catch (err) {
      console.error('unsaved prompt save error', { tabId: tab.id, err });
      workspaceState.pendingClosePrompt = pending;
      showUnsavedPrompt(tab, { wasActive: true, reason: 'save-error', previousActiveId: pending.previousActiveId });
    } finally {
      setUnsavedPromptBusy(false);
    }
  }

  function handleUnsavedDiscard() {
    if (unsavedPromptBusy) {
      console.debug('Debug: handleUnsavedDiscard skipped', { reason: 'busy' });
      return;
    }
    const pending = workspaceState.pendingClosePrompt;
    if (!pending) {
      hideUnsavedPrompt();
      return;
    }
    workspaceState.pendingClosePrompt = null;
    hideUnsavedPrompt();
    console.debug('Debug: unsaved prompt discard confirmed', { tabId: pending.tabId });
    closeTab(pending.tabId, { force: true, skipPrompt: true, skipPersist: true, reason: 'unsaved-discard' });
  }

  function handleUnsavedCancel() {
    if (unsavedPromptBusy) {
      console.debug('Debug: handleUnsavedCancel skipped', { reason: 'busy' });
      return;
    }
    const pending = workspaceState.pendingClosePrompt;
    workspaceState.pendingClosePrompt = null;
    hideUnsavedPrompt();
    if (pending) {
      console.debug('Debug: unsaved prompt cancelled', { tabId: pending.tabId });
      if (pending.previousActiveId && pending.previousActiveId !== workspaceState.activeTabId && getTabById(pending.previousActiveId)) {
        activateTab(pending.previousActiveId, { reason: 'unsaved-cancel-restore', skipPersist: true });
      }
    }
  }

  function bindUnsavedPromptHandlers() {
    if (dom.unsavedSave) {
      dom.unsavedSave.addEventListener('click', () => { void handleUnsavedSave(); });
    }
    if (dom.unsavedDiscard) {
      dom.unsavedDiscard.addEventListener('click', handleUnsavedDiscard);
    }
    if (dom.unsavedCancel) {
      dom.unsavedCancel.addEventListener('click', handleUnsavedCancel);
    }
    console.debug('Debug: unsaved prompt handlers bound', {
      hasSave: !!dom.unsavedSave,
      hasDiscard: !!dom.unsavedDiscard,
      hasCancel: !!dom.unsavedCancel
    });
  }

  function performTabRemoval(tab, meta = {}) {
    if (!tab) {
      return;
    }
    const tabId = tab.id;
    const wasActive = !!meta.wasActive;
    const reason = meta.reason || 'close-tab';
    const index = workspaceState.tabs.indexOf(tab);
    if (index < 0) {
      console.warn('performTabRemoval missing index', { tabId, reason });
      return;
    }
    workspaceState.tabs.splice(index, 1);
    if (workspaceState.pendingDuplicateSource === tabId) {
      workspaceState.pendingDuplicateSource = null;
    }
    if (workspaceState.lastActiveGraphId === tabId) {
      const fallbackGraph = [...workspaceState.tabs].reverse().find(item => item.type && !item.isWelcome) || null;
      workspaceState.lastActiveGraphId = fallbackGraph ? fallbackGraph.id : null;
    }
    if (wasActive) {
      const fallback = workspaceState.tabs[index - 1]
        || workspaceState.tabs[index]
        || workspaceState.tabs[workspaceState.tabs.length - 1]
        || null;
      if (fallback) {
        activateTab(fallback.id, { skipPersist: true, reason });
      } else {
        workspaceState.activeTabId = null;
        renderTabs();
        showGraphSelection({ reason: 'tab-closed-none' });
      }
    } else {
      renderTabs();
      console.debug('Debug: workspace tab closed (inactive)', { tabId, remaining: workspaceState.tabs.length, reason });
    }
    console.debug('Debug: workspace tab closed', { tabId, wasActive, remainingTabs: workspaceState.tabs.length, reason });
    if (!meta.skipDirty) {
      MainSession.markSessionDirty('tab-removed', { tabId, reason });
    }
  }

  function closeTab(tabId, options = {}) {
    const tab = getTabById(tabId);
    if (!tab) {
      console.debug('Debug: closeTab skipped', { tabId, reason: 'missing-tab' });
      return;
    }
    if (tab.isWelcome) {
      console.debug('Debug: closeTab skipped for welcome tab', { tabId });
      return;
    }
    hideDuplicatePrompt();
    const wasActive = workspaceState.activeTabId === tabId;
    const force = options.force === true;
    const skipPrompt = options.skipPrompt === true;
    const skipPersist = options.skipPersist === true;
    const reason = options.reason || 'close-tab';
    let persistedActive = false;
    if (wasActive && !skipPersist) {
      MainSession.persistActiveTabState(tab, withSessionContext({ reason }));
      persistedActive = true;
    }
    if (!force && !skipPrompt) {
      const hasData = MainSession.tabHasTableData(tab);
      console.debug('Debug: closeTab unsaved data check', { tabId, hasData, wasActive, reason });
      if (hasData) {
        showUnsavedPrompt(tab, { wasActive, reason });
        return;
      }
    }
    if (force && wasActive && !skipPersist && !persistedActive) {
      MainSession.persistActiveTabState(tab, withSessionContext({ reason: `${reason}-force` }));
    }
    workspaceState.pendingClosePrompt = null;
    hideUnsavedPrompt();
    performTabRemoval(tab, { wasActive, reason });
  }

  function activateTab(tabId, options = {}) {
    const current = getActiveTab();
    if (current && current.id !== tabId && !options.skipPersist) {
      MainSession.persistActiveTabState(current, withSessionContext({ reason: options.reason || 'activate-switch' }));
    }
    workspaceState.activeTabId = tabId;
    renderTabs();
    const target = getActiveTab();
    if (!target) {
      console.warn('activateTab missing target', { tabId });
      return;
    }
    if (!target.type) {
      const candidateSource = target.isWelcome
        ? determineDuplicateSourceCandidate(workspaceState.lastActiveGraphId)
        : (target.duplicateSource || determineDuplicateSourceCandidate(current?.id));
      workspaceState.pendingDuplicateSource = candidateSource;
      console.debug('Debug: activateTab showing selection', {
        tabId,
        isWelcome: !!target.isWelcome,
        candidateSource,
        reason: options.reason || 'unconfigured'
      });
      showGraphSelection({ reason: target.isWelcome ? 'welcome-tab' : options.reason || 'unconfigured' });
      return;
    }
    workspaceState.pendingDuplicateSource = null;
    workspaceState.lastActiveGraphId = target.id;
    showWorkspaceForTab(target, { skipApply: !!options.skipApplyPayload });
  }

  function hideDuplicatePrompt() {
    if (!dom.duplicatePrompt) return;
    dom.duplicatePrompt.setAttribute('hidden', 'hidden');
    if (dom.duplicateReuse) dom.duplicateReuse.onclick = null;
    if (dom.duplicateEmpty) dom.duplicateEmpty.onclick = null;
    if (dom.duplicateCancel) dom.duplicateCancel.onclick = null;
  }

  function showDuplicateDecision({ tab, type, sourceTab, canDuplicate }) {
    if (!canDuplicate) {
      console.debug('Debug: duplicate prompt bypassed', {
        tabId: tab?.id,
        type,
        hasSource: !!sourceTab
      });
      if (tab) {
        MainSession.assignTabPayload(tab, null, { reason: 'duplicate-bypass-clear' });
      }
      hideDuplicatePrompt();
      showWorkspaceForTab(tab);
      MainSession.markSessionDirty('duplicate-bypass', { tabId: tab?.id || null, type });
      return;
    }
    if (!dom.duplicatePrompt || !dom.duplicateEmpty) {
      console.debug('Debug: duplicate prompt unavailable, applying fallback', { type, canDuplicate });
      if (canDuplicate && sourceTab?.payload) {
        const clonedPayload = MainSession.clonePayload(sourceTab.payload);
        MainSession.assignTabPayload(tab, clonedPayload, { reason: 'duplicate-fallback-clone' });
      } else {
        MainSession.assignTabPayload(tab, null, { reason: 'duplicate-fallback-empty' });
      }
      showWorkspaceForTab(tab);
      MainSession.markSessionDirty('duplicate-fallback', { tabId: tab?.id || null, type, reused: !!(canDuplicate && sourceTab?.payload) });
      return;
    }
    const info = GRAPH_TYPES.find(item => item.type === type);
    const previousName = sourceTab?.title || 'the previous tab';
    if (dom.duplicateTitle) {
      dom.duplicateTitle.textContent = `Reuse data for ${info?.label || 'this workspace'}?`;
    }
    dom.duplicateMessage.textContent = canDuplicate
      ? `Would you like to duplicate the data and settings from ${previousName} into this ${info?.label || 'workspace'}?`
      : 'Data reuse is only available when the graph type matches the current tab. This workspace will start empty.';
    if (dom.duplicateReuse) {
      dom.duplicateReuse.style.display = canDuplicate ? '' : 'none';
      dom.duplicateReuse.disabled = !canDuplicate;
      dom.duplicateReuse.onclick = () => {
        hideDuplicatePrompt();
        if (canDuplicate && sourceTab?.payload) {
          const clonedPayload = MainSession.clonePayload(sourceTab.payload);
          MainSession.assignTabPayload(tab, clonedPayload, { reason: 'duplicate-reuse' });
        }
        showWorkspaceForTab(tab);
        MainSession.markSessionDirty('duplicate-reuse', { tabId: tab?.id || null, sourceId: sourceTab?.id || null });
      };
    }
    dom.duplicateEmpty.onclick = () => {
      hideDuplicatePrompt();
      MainSession.assignTabPayload(tab, null, { reason: 'duplicate-empty' });
      showWorkspaceForTab(tab);
      MainSession.markSessionDirty('duplicate-empty', { tabId: tab?.id || null });
    };
    if (dom.duplicateCancel) {
      dom.duplicateCancel.onclick = () => {
        hideDuplicatePrompt();
        tab.type = null;
        tab.title = `Workspace ${workspaceState.tabs.indexOf(tab) + 1}`;
        const fallbackSource = sourceTab?.id || null;
        tab.duplicateSource = fallbackSource;
        workspaceState.pendingDuplicateSource = fallbackSource;
        renderTabs();
        showGraphSelection({ reason: 'duplicate-cancelled' });
      };
    }
    dom.duplicatePrompt.removeAttribute('hidden');
  }

  function handleGraphSelection(type) {
    let tab = getActiveTab();
    if (!tab) {
      console.warn('handleGraphSelection with no active tab', { type });
      return;
    }
    let previousType = tab.type || null;
    let previousTitle = tab.title || '';
    if (tab.isWelcome) {
      const candidateSource = workspaceState.pendingDuplicateSource
        || determineDuplicateSourceCandidate(workspaceState.lastActiveGraphId);
      const newTab = MainSession.createTab({ duplicateSource: candidateSource });
      workspaceState.tabs.push(newTab);
      workspaceState.activeTabId = newTab.id;
      workspaceState.pendingDuplicateSource = candidateSource;
      tab = newTab;
      renderTabs();
      console.debug('Debug: welcome selection spawning tab', {
        newTabId: newTab.id,
        type,
        candidateSource
      });
      MainSession.markSessionDirty('tab-created', { tabId: newTab.id, reason: 'welcome-selection' });
      previousType = null;
      previousTitle = tab.title || '';
    }
    const priorType = previousType;
    const priorTitle = previousTitle;
    tab.type = type;
    const info = GRAPH_TYPES.find(item => item.type === type);
    const config = WORKSPACES[type];
    const resolvedTitle = info?.label || config?.tabLabel || tab.title;
    tab.title = resolvedTitle;
    tab.isRenaming = false;
    renderTabs();
    console.debug('Debug: graph assigned to tab', { tabId: tab.id, type });
    if (priorType !== type) {
      MainSession.markSessionDirty('graph-type-changed', { tabId: tab.id, previousType: priorType, nextType: type });
    }
    if (tab.title !== priorTitle) {
      MainSession.markSessionDirty('tab-title-updated', { tabId: tab.id, previousTitle: priorTitle, nextTitle: tab.title });
    }
    const sourceId = tab.duplicateSource || workspaceState.pendingDuplicateSource;
    workspaceState.pendingDuplicateSource = null;
    tab.duplicateSource = null;
    const sourceTab = sourceId ? getTabById(sourceId) : null;
    const canDuplicate = Boolean(sourceTab && sourceTab.type === type && sourceTab.payload);
    if (canDuplicate) {
      showDuplicateDecision({ tab, type, sourceTab, canDuplicate });
      return;
    }
    if (sourceTab) {
      console.debug('Debug: data reuse skipped', {
        tabId: tab.id,
        type,
        sourceType: sourceTab.type,
        hasPayload: !!sourceTab.payload
      });
    }
    const payloadCleared = MainSession.assignTabPayload(tab, null, { reason: 'graph-selection-reset' });
    if (payloadCleared) {
      MainSession.markSessionDirty('graph-payload-reset', { tabId: tab.id, previousType: priorType, nextType: type });
    }
    showWorkspaceForTab(tab);
  }

  function handleAddTabClick() {
    const current = getActiveTab();
    if (current && !current.isWelcome) {
      MainSession.persistActiveTabState(current, withSessionContext({ reason: 'add-tab-before-new' }));
    }
    const candidateSource = determineDuplicateSourceCandidate(current?.id);
    const newTab = MainSession.createTab({ duplicateSource: candidateSource });
    workspaceState.tabs.push(newTab);
    workspaceState.activeTabId = newTab.id;
    workspaceState.pendingDuplicateSource = candidateSource;
    renderTabs();
    MainSession.markSessionDirty('tab-created', { tabId: newTab.id, reason: 'add-tab-click' });
    showGraphSelection({ reason: 'new-tab' });
    console.debug('Debug: add tab invoked', { newTabId: newTab.id, duplicateSource: candidateSource });
  }

  function createSelectionCards() {
    if (!dom.selectionGrid) return;
    const existingCards = dom.selectionGrid.querySelectorAll('[data-graph-type]');
    if (existingCards.length) {
      const infoByType = new Map(GRAPH_TYPES.map(info => [info.type, info]));
      existingCards.forEach(card => {
        const { graphType } = card.dataset;
        const info = infoByType.get(graphType);
        if (!info) {
          console.debug('Debug: removing orphaned welcome card', { graphType });
          card.remove();
          return;
        }
        const hint = card.querySelector('.graph-card__hint');
        const title = card.querySelector('.graph-card__title');
        const description = card.querySelector('.graph-card__description');
        if (hint) hint.textContent = info.hint || 'Workspace';
        if (title) title.textContent = info.label;
        if (description) description.textContent = info.description;
        if (!card.dataset.boundClick) {
          card.addEventListener('click', () => {
            console.debug('Debug: graph card selected', { type: info.type });
            handleGraphSelection(info.type);
          });
          card.dataset.boundClick = 'true';
        }
      });
      console.debug('Debug: selection cards hydrated', { count: existingCards.length });
      return;
    }
    const fragment = document.createDocumentFragment();
    GRAPH_TYPES.forEach(info => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'graph-card';
      card.setAttribute('role', 'listitem');
      card.dataset.graphType = info.type;
      card.innerHTML = `
        <span class="graph-card__hint">${info.hint || 'Workspace'}</span>
        <h3 class="graph-card__title">${info.label}</h3>
        <p class="graph-card__description">${info.description}</p>
      `;
      card.dataset.boundClick = 'true';
      card.addEventListener('click', () => {
        console.debug('Debug: graph card selected', { type: info.type });
        handleGraphSelection(info.type);
      });
      fragment.appendChild(card);
    });
    dom.selectionGrid.innerHTML = '';
    dom.selectionGrid.appendChild(fragment);
    console.debug('Debug: selection cards generated', { count: GRAPH_TYPES.length });
  }

  function bootstrapComponents() {
    try {
      Object.values(WORKSPACES).forEach(config => {
        try {
          if (typeof config.ensure === 'function') {
            config.ensure();
          }
        } catch (err) {
          console.error('bootstrap ensure error', { type: config.type, err });
        }
        ensureDefaultPayload(config.type, config);
        hideWorkspaceElement(config);
      });
      console.debug('Debug: components bootstrapped', { count: Object.keys(WORKSPACES).length });
    } catch (err) {
      console.error('bootstrapComponents error', err);
    }
  }

  function initializeWorkspace() {
    createSelectionCards();
    const welcomeTab = MainSession.createTab({ title: 'Welcome', isWelcome: true, allowClose: false });
    workspaceState.tabs.push(welcomeTab);
    workspaceState.activeTabId = welcomeTab.id;
    renderTabs();
    showGraphSelection({ reason: 'initial' });
    if (dom.tabsList) {
      dom.tabsList.addEventListener('dragover', handleTabListDragOver);
      dom.tabsList.addEventListener('drop', handleTabListDrop);
      dom.tabsList.addEventListener('dragleave', handleTabListDragLeave);
    }
    if (dom.addTabBtn) {
      dom.addTabBtn.addEventListener('click', handleAddTabClick);
    }
    if (dom.sessionSaveBtn) {
      dom.sessionSaveBtn.addEventListener('click', handleSessionSaveClick);
    }
    if (dom.sessionLoadBtn) {
      dom.sessionLoadBtn.addEventListener('click', handleSessionLoadClick);
    }
    if (dom.sessionFileInput) {
      dom.sessionFileInput.addEventListener('change', handleSessionInputChange);
    }
    bindUnsavedPromptHandlers();
    console.debug('Debug: workspace UI initialized', { welcomeTabId: welcomeTab.id });
  }

  bootstrapComponents();
  initializeWorkspace();

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

