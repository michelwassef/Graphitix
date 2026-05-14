(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.tabs = Main.tabs || {};
  console.debug('Debug: Main.tabs namespace initialized', { module: 'js/main/tabs.js' });

  namespace.createManager = function createManager(options) {
    const config = options || {};
    const session = config.session;
    const previews = config.previews;
    const domControls = config.domControls;
    const tabDrag = config.tabDrag;
    const workspaces = config.workspaces || {};
    const graphTypes = config.graphTypes || [];
    const graphVariants = Array.isArray(config.graphVariants) ? config.graphVariants : [];
    const dom = config.dom;
    const workspaceState = config.workspaceState;
    const withSessionContext = config.withSessionContext;
    const graphVariantApi = Main.graphVariants || {};
    const graphTypeLabelByType = new Map(graphTypes.map(info => [info.type, info.label || info.type]));
    const graphVariantLookup = new Map();
    const normalizedGraphVariants = graphVariants.map(raw => {
      const normalized = {
        id: raw.id,
        type: raw.type,
        label: raw.label,
        description: raw.description || '',
        groupLabel: raw.groupLabel || graphTypeLabelByType.get(raw.type) || 'Workspace',
        keywords: Array.isArray(raw.keywords) ? raw.keywords.slice() : []
      };
      normalized.searchText = [
        normalized.label,
        normalized.description,
        normalized.groupLabel,
        normalized.type,
        ...normalized.keywords
      ].join(' ').toLowerCase();
      graphVariantLookup.set(normalized.id, normalized);
      return normalized;
    });
    normalizedGraphVariants.sort((a, b) => {
      const groupCompare = a.groupLabel.localeCompare(b.groupLabel);
      return groupCompare !== 0 ? groupCompare : a.label.localeCompare(b.label);
    });
    let renderedVariantList = normalizedGraphVariants.slice();
    function applyPendingVariant(tab, meta = {}) {
      if (!tab || !tab.pendingVariantId) {
        return;
      }
      const variantId = tab.pendingVariantId;
      tab.pendingVariantId = null;
      if (typeof graphVariantApi.applyVariant !== 'function') {
        console.debug('Debug: pending variant skipped (no api)', { tabId: tab?.id, variantId });
        return;
      }
      const success = graphVariantApi.applyVariant(variantId, {
        tabId: tab.id,
        type: tab.type,
        reason: meta.reason || 'pending-variant'
      }) === true;
      console.debug('Debug: pending variant processed', {
        tabId: tab.id,
        type: tab.type,
        variantId,
        success,
        reason: meta.reason || 'pending-variant'
      });
    }

    let selectedVariantId = null;
    let pickerDropdownOpen = false;
    let pickerDismissListenerBound = false;
    let resizeListenerBound = false;

    if (!session || !previews || !domControls || !tabDrag || !dom || !workspaceState || typeof withSessionContext !== 'function') {
      const details = {
        hasSession: !!session,
        hasPreviews: !!previews,
        hasDomControls: !!domControls,
        hasTabDrag: !!tabDrag,
        hasDom: !!dom,
        hasWorkspaceState: !!workspaceState,
        hasWithSessionContext: typeof withSessionContext === 'function'
      };
      console.error('Main.tabs.createManager missing dependencies', details);
      throw new Error('Main.tabs.createManager requires session, previews, domControls, tabDrag, dom, workspaceState, and withSessionContext.');
    }

    console.debug('Debug: Main.tabs.createManager invoked', {
      tabCount: workspaceState.tabs?.length || 0,
      graphTypes: graphTypes.length
    });

    const sessionFileTypes = config.sessionFileTypes || [];

    const getActiveTab = () => workspaceState.tabs.find(tab => tab.id === workspaceState.activeTabId) || null;

    const showWorkspaceForTab = (tab, options = {}) => {
      const result = domControls.showWorkspaceForTab({
        tab,
        options,
        dom,
        workspaces,
        session,
        workspaceState
      });
      const finalizeVariant = () => applyPendingVariant(tab, options || {});
      if (result && typeof result.then === 'function') {
        return result.then(payload => {
          finalizeVariant();
          return payload;
        }).catch(err => {
          finalizeVariant();
          throw err;
        });
      }
      finalizeVariant();
      return result;
    };

    const showGraphSelection = (options = {}) => {
      domControls.showGraphSelection({
        dom,
        workspaces,
        reason: options.reason
      });
    };

    let renderTabs;
    let beginRenameTab;
    let commitTabRename;
    let cancelTabRename;
    let showUnsavedPrompt;
    let hideUnsavedPrompt;
    let bindUnsavedPromptHandlers;
    let handleUnsavedSave;
    let handleUnsavedDiscard;
    let handleUnsavedCancel;
    let setUnsavedPromptBusy;
    let hideDuplicatePrompt;
    let showDuplicateDecision;

    const applyTabDragClasses = () => tabDrag.applyTabDragClasses({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty });
    const updateTabDragHover = (targetTabId, insertBefore, meta = {}) => tabDrag.updateTabDragHover({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, targetTabId, insertBefore, meta);
    const resetTabDragState = reason => tabDrag.resetTabDragState({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, reason);
    const moveWorkspaceTab = (tabId, targetIndex) => tabDrag.moveWorkspaceTab({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, tabId, targetIndex);
    const handleTabDragStart = (event, tab) => tabDrag.handleTabDragStart({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event, tab);
    const handleTabDragEnd = (event, tab) => tabDrag.handleTabDragEnd({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event, tab);
    const handleTabDragOver = (event, tab) => tabDrag.handleTabDragOver({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event, tab);
    const handleTabDragLeave = (event, tab) => tabDrag.handleTabDragLeave({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event, tab);
    const handleTabDrop = (event, tab) => tabDrag.handleTabDrop({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event, tab);
    const handleTabListDragOver = event => tabDrag.handleTabListDragOver({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event);
    const handleTabListDrop = event => tabDrag.handleTabListDrop({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event);
    const handleTabListDragLeave = event => tabDrag.handleTabListDragLeave({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty }, event);

    function getTabById(tabId) {
      return workspaceState.tabs.find(tab => tab.id === tabId) || null;
    }

    function deactivateWorkspaceForTab(tab, reason) {
      if (!tab || !tab.type || !window.Shared?.workspaceTabs?.deactivateWorkspace) {
        return false;
      }
      return !!window.Shared.workspaceTabs.deactivateWorkspace(tab, workspaces?.[tab.type] || null, {
        reason: reason || 'workspace-deactivate'
      });
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

    if (typeof namespace.createRenderHelpers !== 'function') {
      console.error('Main.tabs.createRenderHelpers is required before createManager runs.');
      throw new Error('Main.tabs.createRenderHelpers missing');
    }
    if (typeof namespace.createUnsavedPromptHandlers !== 'function') {
      console.error('Main.tabs.createUnsavedPromptHandlers is required before createManager runs.');
      throw new Error('Main.tabs.createUnsavedPromptHandlers missing');
    }
    if (typeof namespace.createDuplicatePromptHandlers !== 'function') {
      console.error('Main.tabs.createDuplicatePromptHandlers is required before createManager runs.');
      throw new Error('Main.tabs.createDuplicatePromptHandlers missing');
    }

    const renderHelpers = namespace.createRenderHelpers({
      dom,
      previews,
      workspaceState,
      session,
      getTabById,
      activateTab: (tabId, options) => activateTab(tabId, options || {}),
      applyTabDragClasses,
      dragHandlers: {
        handleTabDragStart: (event, tab) => handleTabDragStart(event, tab),
        handleTabDragEnd: (event, tab) => handleTabDragEnd(event, tab),
        handleTabDragOver: (event, tab) => handleTabDragOver(event, tab),
        handleTabDragLeave: (event, tab) => handleTabDragLeave(event, tab),
        handleTabDrop: (event, tab) => handleTabDrop(event, tab),
        closeTab: tabId => closeTab(tabId)
      }
    });
    renderTabs = renderHelpers.renderTabs;
    beginRenameTab = renderHelpers.beginRenameTab;
    commitTabRename = renderHelpers.commitTabRename;
    cancelTabRename = renderHelpers.cancelTabRename;

    const unsavedHelpers = namespace.createUnsavedPromptHandlers({
      dom,
      workspaceState,
      session,
      withSessionContext,
      getActiveTab,
      getTabById,
      activateTab: (tabId, options) => activateTab(tabId, options || {}),
      closeTab: (tabId, options) => closeTab(tabId, options || {})
    });
    showUnsavedPrompt = unsavedHelpers.showUnsavedPrompt;
    hideUnsavedPrompt = unsavedHelpers.hideUnsavedPrompt;
    bindUnsavedPromptHandlers = unsavedHelpers.bindUnsavedPromptHandlers;
    handleUnsavedSave = unsavedHelpers.handleUnsavedSave;
    handleUnsavedDiscard = unsavedHelpers.handleUnsavedDiscard;
    handleUnsavedCancel = unsavedHelpers.handleUnsavedCancel;
    setUnsavedPromptBusy = unsavedHelpers.setUnsavedPromptBusy;

    const duplicateHelpers = namespace.createDuplicatePromptHandlers({
      dom,
      workspaceState,
      session,
      domControls,
      workspaces,
      renderTabs: () => renderTabs(),
      showWorkspaceForTab: (tab, options) => showWorkspaceForTab(tab, options),
      showGraphSelection: opts => showGraphSelection(opts || {}),
      determineDuplicateSourceCandidate: preferredId => determineDuplicateSourceCandidate(preferredId)
    });
    hideDuplicatePrompt = duplicateHelpers.hideDuplicatePrompt;
    showDuplicateDecision = duplicateHelpers.showDuplicateDecision;

    console.debug('Debug: Main.tabs helper modules wired', {
      hasRenderHelpers: !!renderTabs,
      hasUnsavedHelpers: !!showUnsavedPrompt,
      hasDuplicateHelpers: !!hideDuplicatePrompt
    });
    // Tab context menu: right-click on a tab to duplicate it (reuse data or start empty)
    (function setupTabContextMenu() {
      if (!dom || !dom.tabsList) return;
      const menu = dom.tabContextMenu || null;
      const menuReuse = dom.tabContextDuplicateReuse || null;
      const menuEmpty = dom.tabContextDuplicateEmpty || null;
      const menuSaveCurrent = dom.tabContextSaveCurrent || null;
      let currentContextTabId = null;

      function hideTabContextMenu() {
        try { if (menu) menu.setAttribute('hidden', 'hidden'); } catch(e){}
        currentContextTabId = null;
      }

      function showTabContextMenuForButton(targetBtn, tabId) {
        if (!menu || !targetBtn) return;
        currentContextTabId = tabId || null;
        const tab = getTabById(currentContextTabId);
        if (menuSaveCurrent) {
          const canSaveTab = !!(tab && !tab.isWelcome && tab.type);
          menuSaveCurrent.disabled = !canSaveTab;
          menuSaveCurrent.setAttribute('aria-disabled', canSaveTab ? 'false' : 'true');
        }
        // measure menu size by revealing it invisibly, then position so its bottom abuts the tab's bottom
        try {
          const rect = targetBtn.getBoundingClientRect();
          // make menu available for measurement but keep it invisible
          menu.style.visibility = 'hidden';
          menu.removeAttribute('hidden');
          requestAnimationFrame(() => {
            const mRect = menu.getBoundingClientRect();
            let left = rect.left;
            // clamp horizontally to viewport with small padding
            const pad = 8;
            if (left + mRect.width > window.innerWidth - pad) {
              left = Math.max(pad, window.innerWidth - mRect.width - pad);
            }
            if (left < pad) left = pad;
            // position top so menu appears above the tab and does not cover it
            let top = rect.top - mRect.height;
            // if menu would overflow above viewport, fallback to placing below the tab
            if (top < pad) {
              top = rect.bottom + pad;
            }
            menu.style.left = `${Math.round(left)}px`;
            menu.style.top = `${Math.round(top)}px`;
            menu.style.visibility = '';
            // focus first actionable item for keyboard users
            try { if (menuReuse) menuReuse.focus(); } catch (e) {}
          });
        } catch (err) {
          // fallback to cursor position if measurement fails
          menu.style.left = `${Math.min(window.innerWidth - 16, 0)}px`;
          menu.style.top = `${Math.min(window.innerHeight - 16, 0)}px`;
          menu.removeAttribute('hidden');
        }
      }

      function performDuplicateFromSource(sourceId, preferEmpty) {
        hideTabContextMenu();
        if (!sourceId) return;
        const sourceTab = getTabById(sourceId);
        if (!sourceTab) return;
        hideDuplicatePrompt();
        // persist current active tab state so its live payload is captured before UI switches
        try {
          const currentActive = getActiveTab();
          if (currentActive && !currentActive.isWelcome) {
            session.persistActiveTabState(currentActive, withSessionContext({ reason: 'duplicate-before-create', origin: 'lifecycle' }));
            deactivateWorkspaceForTab(currentActive, 'duplicate-before-create');
          }
        } catch (e) {
          console.debug('Debug: duplicate persistActiveTabState failed', { err: e });
        }
        // create new tab and copy type/title
        const newTab = session.createTab({ duplicateSource: sourceTab.id });
        newTab.type = sourceTab.type || null;
        newTab.title = typeof session.generateUniqueTabTitle === 'function'
          ? session.generateUniqueTabTitle(sourceTab.title || (newTab.title || 'Workspace'), { excludeTabId: newTab.id })
          : (sourceTab.title || newTab.title);
        workspaceState.tabs.push(newTab);
        workspaceState.activeTabId = newTab.id;
        renderTabs();
        if (preferEmpty) {
          const emptyPayload = (typeof domControls.ensureDefaultPayload === 'function')
            ? domControls.ensureDefaultPayload(session, newTab.type, workspaces?.[newTab.type])
            : null;
          session.assignTabPayload(newTab, emptyPayload, { reason: 'duplicate-context-empty' });
          newTab.layoutState = null;
          newTab.layoutSignature = null;
          showWorkspaceForTab(newTab, { reason: 'duplicate-context-empty', skipBaselineReset: true });
          session.markSessionDirty('duplicate-created-empty', { tabId: newTab.id, sourceId, origin: 'user' });
          return;
        }
        const cloneFn = session.fastClonePayload || session.clonePayload;
        const clonedPayload = (typeof cloneFn === 'function' && sourceTab?.payload)
          ? cloneFn.call(session, sourceTab.payload)
          : null;
        const clonedLayout = (typeof cloneFn === 'function' && sourceTab?.layoutState)
          ? cloneFn.call(session, sourceTab.layoutState)
          : null;
        if (clonedPayload) {
          session.assignTabPayload(newTab, clonedPayload, { reason: 'duplicate-context-reuse' });
        }
        newTab.layoutState = clonedLayout;
        newTab.layoutSignature = session.serializePayloadSignature
          ? session.serializePayloadSignature(clonedLayout)
          : null;
        showWorkspaceForTab(newTab, { reason: 'duplicate-context-reuse', skipBaselineReset: true });
        session.markSessionDirty('duplicate-created-reuse', { tabId: newTab.id, sourceId, origin: 'user' });
      }

      function saveCurrentTabOnly(sourceId) {
        hideTabContextMenu();
        const sourceTab = getTabById(sourceId);
        if (!sourceTab || sourceTab.isWelcome || !sourceTab.type) {
          return;
        }
        const sessionActions = Main.sessionActions || {};
        if (typeof sessionActions.saveWorkspaceArchiveWithScope !== 'function') {
          console.warn('Tab save unavailable: missing sessionActions.saveWorkspaceArchiveWithScope');
          return;
        }
        sessionActions.saveWorkspaceArchiveWithScope(getSessionActionsContext(), {
          scope: 'tab',
          targetTabId: sourceTab.id,
          forcePicker: true,
          rememberFile: false,
          reason: 'tab-context-save-current'
        }).catch(err => {
          console.error('tab context save current tab error', { tabId: sourceTab.id, err });
        });
      }

      // Disable native browser context menu on tabs list to avoid conflicts
      dom.tabsList.addEventListener('contextmenu', event => {
        const targetBtn = event.target && event.target.closest && event.target.closest('[data-tab-id]');
        if (!targetBtn) {
          // allow native menu elsewhere
          return;
        }
        event.preventDefault();
        const tabId = targetBtn.dataset.tabId;
        showTabContextMenuForButton(targetBtn, tabId);
      }, true);

      // menu actions
      if (menuReuse) menuReuse.addEventListener('click', () => { performDuplicateFromSource(currentContextTabId, false); });
      if (menuEmpty) menuEmpty.addEventListener('click', () => { performDuplicateFromSource(currentContextTabId, true); });
      if (menuSaveCurrent) menuSaveCurrent.addEventListener('click', () => { saveCurrentTabOnly(currentContextTabId); });

      // hide on outside click or escape
      document.addEventListener('mousedown', event => {
        if (!menu || menu.hasAttribute('hidden')) return;
        if (event.target && menu.contains(event.target)) return;
        hideTabContextMenu();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') hideTabContextMenu();
      });
    })();
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
      if (wasActive) {
        deactivateWorkspaceForTab(tab, reason);
      }
      workspaceState.tabs.splice(index, 1);
      if (workspaceState.loadedWorkspaces) {
        if (workspaceState.loadedWorkspaces[tabId]) {
          delete workspaceState.loadedWorkspaces[tabId];
        } else {
          Object.keys(workspaceState.loadedWorkspaces).forEach(key => {
            const entry = workspaceState.loadedWorkspaces[key];
            if (entry && entry.tabId === tabId) {
              delete workspaceState.loadedWorkspaces[key];
            }
          });
        }
      }
      if (workspaceState.pendingDuplicateSource === tabId) {
        workspaceState.pendingDuplicateSource = null;
      }
      if (window.Shared?.undoManager?.clearTab) {
        window.Shared.undoManager.clearTab(tabId, { reason });
      }
      if (window.Shared?.workspaceTabs?.disposeTab) {
        window.Shared.workspaceTabs.disposeTab(tab, { reason });
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
          if (window.Shared?.undoManager?.refreshState) {
            window.Shared.undoManager.refreshState(null, 'tab-closed-none');
          }
          showGraphSelection({ reason: 'tab-closed-none' });
        }
      } else {
        renderTabs();
        if (window.Shared?.undoManager?.refreshState) {
          window.Shared.undoManager.refreshState(workspaceState.activeTabId || null, 'tab-closed-inactive');
        }
        console.debug('Debug: workspace tab closed (inactive)', { tabId, remaining: workspaceState.tabs.length, reason });
      }
      console.debug('Debug: workspace tab closed', { tabId, wasActive, remainingTabs: workspaceState.tabs.length, reason });
      if (!meta.skipDirty) {
        session.markSessionDirty('tab-removed', { tabId, reason, origin: 'user' });
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
        session.persistActiveTabState(tab, withSessionContext({ reason, origin: 'lifecycle' }));
        persistedActive = true;
      }
      if (!force && !skipPrompt) {
        const hasData = session.tabHasTableData(tab);
        console.debug('Debug: closeTab unsaved data check', { tabId, hasData, wasActive, reason });
        if (hasData) {
          showUnsavedPrompt(tab, { wasActive, reason });
          return;
        }
      }
      if (force && wasActive && !skipPersist && !persistedActive) {
        session.persistActiveTabState(tab, withSessionContext({ reason: `${reason}-force`, origin: 'lifecycle' }));
      }
      workspaceState.pendingClosePrompt = null;
      hideUnsavedPrompt();
      performTabRemoval(tab, { wasActive, reason });
    }

    function activateTab(tabId, options = {}) {
      const current = getActiveTab();
      if (current && current.id !== tabId && !options.skipPersist) {
        session.persistActiveTabState(current, withSessionContext({
          reason: options.reason || 'activate-switch',
          origin: 'lifecycle',
          // Do not capture render cache during ordinary tab switches. Component-level
          // captureRenderCache() implementations detach live graph nodes into fragments;
          // doing that on every switch can leave a tab blank if a later restore path is
          // skipped or accepted without a real redraw. The hidden per-tab DOM already
          // preserves the live graph for fast in-session switching. Archive/save paths
          // still capture a non-destructive cache for reopen speed.
          preserveRenderCacheTabIds: [current.id, tabId]
        }));
      }
      if (current && current.id !== tabId) {
        deactivateWorkspaceForTab(current, options.reason || 'activate-switch');
      }
      workspaceState.activeTabId = tabId;
      renderTabs();
      const target = getActiveTab();
      if (!target) {
        console.warn('activateTab missing target', { tabId });
        return;
      }
      if (!target.type) {
        const suppressDuplicateCandidate = !!(
          options.skipDuplicatePrompt
          || options.disableDuplicatePrompt
          || options.forceBlankWorkspace
          || options.skipDuplicateSource
        );
        const candidateSource = suppressDuplicateCandidate
          ? null
          : (target.isWelcome
            ? determineDuplicateSourceCandidate(workspaceState.lastActiveGraphId)
            : (target.duplicateSource || determineDuplicateSourceCandidate(current?.id)));
        workspaceState.pendingDuplicateSource = candidateSource;
        if (suppressDuplicateCandidate) {
          target.duplicateSource = null;
          target.pendingDuplicatePayload = null;
          target.pendingDuplicateLayout = null;
        }
        console.debug('Debug: activateTab showing selection', {
          tabId,
          isWelcome: !!target.isWelcome,
          candidateSource,
          duplicateCandidateSuppressed: suppressDuplicateCandidate,
          reason: options.reason || 'unconfigured'
        });
        if (window.Shared?.undoManager?.refreshState) {
          window.Shared.undoManager.refreshState(target.id, options.reason || 'tab-activated-unconfigured');
        }
        showGraphSelection({ reason: target.isWelcome ? 'welcome-tab' : options.reason || 'unconfigured' });
        return;
      }
      workspaceState.pendingDuplicateSource = null;
      workspaceState.lastActiveGraphId = target.id;
      const result = showWorkspaceForTab(target, {
        ...options,
        skipApply: !!options.skipApplyPayload
      });
      if (window.Shared?.undoManager?.refreshState) {
        window.Shared.undoManager.refreshState(target.id, options.reason || 'tab-activated');
      }
      return result;
    }

    function getSessionActionsContext(getExtra = {}) {
      return {
        Shared: window.Shared,
        session,
        workspaceState,
        sessionFileTypes,
        withSessionContext,
        dom,
        hideDuplicatePrompt,
        renderTabs,
        activateTab,
        showGraphSelection,
        ...getExtra
      };
    }


    function handleGraphSelection(type, options = {}) {
      let tab = getActiveTab();
      if (!tab) {
        console.warn('handleGraphSelection with no active tab', { type, options });
        return;
      }
      let previousType = tab.type || null;
      let previousTitle = tab.title || '';
      if (tab.isWelcome) {
        const candidateSource = workspaceState.pendingDuplicateSource
          || determineDuplicateSourceCandidate(workspaceState.lastActiveGraphId);
        const newTab = session.createTab({ duplicateSource: candidateSource });
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
        session.markSessionDirty('tab-created', { tabId: newTab.id, reason: 'welcome-selection', origin: 'user' });
        previousType = null;
        previousTitle = tab.title || '';
      }
      const priorType = previousType;
      const priorTitle = previousTitle;
      const pendingVariantId = options.variantId && graphVariantLookup.has(options.variantId)
        ? options.variantId
        : null;
      tab.type = type;
      tab.pendingVariantId = pendingVariantId;
      const info = graphTypes.find(item => item.type === type);
      const config = workspaces[type];
      const resolvedTitleBase = info?.label || config?.tabLabel || tab.title;
      const resolvedTitle = typeof session.generateUniqueTabTitle === 'function'
        ? session.generateUniqueTabTitle(resolvedTitleBase, { excludeTabId: tab.id })
        : resolvedTitleBase;
      tab.title = resolvedTitle;
      console.debug('Debug: graph tab title resolved', {
        tabId: tab.id,
        baseTitle: resolvedTitleBase,
        uniqueTitle: resolvedTitle
      });
      tab.isRenaming = false;
      renderTabs();
      console.debug('Debug: graph assigned to tab', { tabId: tab.id, type, variantId: pendingVariantId, reason: options.reason || 'graph-selection' });
      if (priorType !== type) {
        session.markSessionDirty('graph-type-changed', { tabId: tab.id, previousType: priorType, nextType: type, origin: 'user' });
      }
      if (tab.title !== priorTitle) {
        session.markSessionDirty('tab-title-updated', { tabId: tab.id, previousTitle: priorTitle, nextTitle: tab.title, origin: 'user' });
      }
      const sourceId = tab.duplicateSource || workspaceState.pendingDuplicateSource;
      workspaceState.pendingDuplicateSource = null;
      tab.duplicateSource = null;
      const sourceTab = sourceId ? getTabById(sourceId) : null;
      const skipDuplicatePrompt = !!(options.skipDuplicatePrompt || options.forceBlankWorkspace || options.disableDuplicatePrompt);
      const canDuplicate = !skipDuplicatePrompt && Boolean(sourceTab && sourceTab.type === type && sourceTab.payload);
      if (skipDuplicatePrompt && sourceTab) {
        console.debug('Debug: duplicate prompt skipped for graph selection', {
          tabId: tab.id,
          type,
          sourceId,
          reason: options.reason || 'graph-selection',
          skipDuplicatePrompt
        });
      }
      const pendingDuplicatePayload = tab.pendingDuplicatePayload || null;
      const pendingDuplicateLayout = tab.pendingDuplicateLayout || null;
      tab.pendingDuplicatePayload = null;
      tab.pendingDuplicateLayout = null;
      if (canDuplicate) {
        const sourceForPrompt = (pendingDuplicatePayload && sourceTab?.type === type)
          ? {
              ...sourceTab,
              payload: pendingDuplicatePayload,
              layoutState: pendingDuplicateLayout || sourceTab.layoutState || null
            }
          : sourceTab;
        showDuplicateDecision({ tab, type, sourceTab: sourceForPrompt, canDuplicate });
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
      const payloadCleared = session.assignTabPayload(tab, null, { reason: 'graph-selection-reset' });
      tab.layoutState = null;
      tab.layoutSignature = null;
      if (payloadCleared) {
        session.markSessionDirty('graph-payload-reset', { tabId: tab.id, previousType: priorType, nextType: type, origin: 'user' });
      }
      return showWorkspaceForTab(tab);
    }

    function handleAddTabClick() {
      const current = getActiveTab();
      if (current && !current.isWelcome) {
        session.persistActiveTabState(current, withSessionContext({ reason: 'add-tab-before-new', origin: 'lifecycle' }));
        deactivateWorkspaceForTab(current, 'add-tab-before-new');
      }
      const candidateSource = determineDuplicateSourceCandidate(current?.id);
      const newTab = session.createTab({ duplicateSource: candidateSource });
      if (current && candidateSource && current.id === candidateSource) {
        const cloneFn = session.fastClonePayload || session.clonePayload;
        if (typeof cloneFn === 'function') {
          try {
            newTab.pendingDuplicatePayload = current.payload ? cloneFn.call(session, current.payload) : null;
            newTab.pendingDuplicateLayout = current.layoutState ? cloneFn.call(session, current.layoutState) : null;
          } catch (err) {
            console.debug('Debug: add tab pending duplicate snapshot failed', { tabId: current.id, err });
            newTab.pendingDuplicatePayload = null;
            newTab.pendingDuplicateLayout = null;
          }
        }
      }
      workspaceState.tabs.push(newTab);
      workspaceState.activeTabId = newTab.id;
      workspaceState.pendingDuplicateSource = candidateSource;
      renderTabs();
      session.markSessionDirty('tab-created', { tabId: newTab.id, reason: 'add-tab-click', origin: 'user' });
      showGraphSelection({ reason: 'new-tab' });
      console.debug('Debug: add tab invoked', { newTabId: newTab.id, duplicateSource: candidateSource });
    }

    function createSelectionCards() {
      if (!dom.selectionGrid) return;
      const existingCards = dom.selectionGrid.querySelectorAll('[data-graph-type]');
      if (existingCards.length) {
        const infoByType = new Map(graphTypes.map(info => [info.type, info]));
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
      graphTypes.forEach(info => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'graph-card';
        card.setAttribute('role', 'listitem');
        card.dataset.graphType = info.type;
        card.innerHTML = `
        <div class="graph-card__icon">${info.icon || '📊'}</div>
        <div class="graph-card__content">
          <span class="graph-card__hint">${info.hint || 'Workspace'}</span>
          <h3 class="graph-card__title">${info.label}</h3>
          <p class="graph-card__description">${info.description}</p>
        </div>
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
      console.debug('Debug: selection cards generated', { count: graphTypes.length });
    }

      function syncPickerAria() {
        if (dom.welcomeGraphSearch) {
          dom.welcomeGraphSearch.setAttribute('aria-expanded', pickerDropdownOpen ? 'true' : 'false');
        }
      }

      function alignVariantDropdown() {
        const container = dom.welcomeGraphSearchResults;
        const input = dom.welcomeGraphSearch;
        if (!container || !input) {
          return;
        }
        const offsetParent = container.offsetParent || container.parentElement;
        if (!offsetParent || typeof offsetParent.getBoundingClientRect !== 'function') {
          return;
        }
        const parentRect = offsetParent.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const scrollLeft = offsetParent.scrollLeft || 0;
        const scrollTop = offsetParent.scrollTop || 0;
        container.style.left = `${inputRect.left - parentRect.left + scrollLeft}px`;
        container.style.top = `${inputRect.bottom - parentRect.top + scrollTop}px`;
        container.style.width = `${inputRect.width}px`;
      }

      function setVariantDropdownState(shouldOpen, meta = {}) {
        const picker = dom.welcomePicker;
        if (!picker || pickerDropdownOpen === shouldOpen) {
          return;
        }
        pickerDropdownOpen = !!shouldOpen;
        picker.classList.toggle('welcome-picker--open', pickerDropdownOpen);
        syncPickerAria();
      }

      function openVariantDropdown(meta = {}) {
        if (!normalizedGraphVariants.length) {
          return;
        }
        alignVariantDropdown();
        setVariantDropdownState(true, meta);
      }

      function closeVariantDropdown(meta = {}) {
        setVariantDropdownState(false, meta);
      }

      function ensurePickerDismissListener() {
        if (pickerDismissListenerBound) {
          return;
        }
        const handleDismiss = event => {
          if (!pickerDropdownOpen) {
            return;
          }
          const isWithinSearch = dom.welcomeGraphSearch?.contains(event.target);
          const isWithinResults = dom.welcomeGraphSearchResults?.contains(event.target);
          const isWithinClear = dom.welcomeGraphSearchClear?.contains(event.target);
          if (isWithinSearch || isWithinResults || isWithinClear) {
            return;
          }
          closeVariantDropdown({ reason: 'outside-click' });
        };
        document.addEventListener('mousedown', handleDismiss, true);
        document.addEventListener('touchstart', handleDismiss, { passive: true, capture: true });
        pickerDismissListenerBound = true;
      }

      function ensurePickerResizeListener() {
        if (resizeListenerBound) {
          return;
        }
        const resizeHandler = () => alignVariantDropdown();
        window.addEventListener('resize', resizeHandler);
        resizeListenerBound = true;
      }

      function updateVariantHighlight(container) {
        const root = container || dom.welcomeGraphSearchResults;
        if (!root) {
          return;
        }
        const buttons = root.querySelectorAll('[data-variant-id]');
        buttons.forEach(button => {
          const variantId = button.dataset.variantId;
          const isSelected = !!selectedVariantId && selectedVariantId === variantId;
          button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          button.classList.toggle('welcome-picker__option--selected', isSelected);
        });
      }

      function setSelectedVariant(variantId, options = {}) {
          const nextId = variantId || null;
          const shouldCloseDropdown = !!nextId && !options.keepDropdown;
          selectedVariantId = nextId;
          const selectedVariant = selectedVariantId ? graphVariantLookup.get(selectedVariantId) : null;
          if (selectedVariant && !options.skipInputUpdate && dom.welcomeGraphSearch) {
            dom.welcomeGraphSearch.value = selectedVariant.label;
          }
        if (!options.skipSummary && dom.welcomeGraphSelectionLabel) {
            if (selectedVariant) {
              dom.welcomeGraphSelectionLabel.textContent = `${selectedVariant.label} (${selectedVariant.groupLabel}) selected.`;
          } else if (!renderedVariantList.length) {
            dom.welcomeGraphSelectionLabel.textContent = 'No plot types match that search.';
          } else {
            dom.welcomeGraphSelectionLabel.textContent = 'Select a plot type above to enable quick launch.';
          }
        }
        if (!options.skipButton && dom.welcomeGraphLaunch) {
          dom.welcomeGraphLaunch.disabled = !selectedVariantId;
        }
        if (!options.skipHighlight) {
          updateVariantHighlight();
        }
        if (shouldCloseDropdown) {
          closeVariantDropdown({ reason: options.reason || 'selection' });
        }
      }

      function renderVariantResults(list) {
        const container = dom.welcomeGraphSearchResults;
        if (!container) {
          return;
        }
        renderedVariantList = list.slice();
        container.innerHTML = '';
        if (!list.length) {
          const empty = document.createElement('p');
          empty.className = 'welcome-picker__empty';
          empty.textContent = 'No matches found. Try another search term.';
          container.appendChild(empty);
          setSelectedVariant(null, { skipHighlight: true });
          openVariantDropdown({ reason: 'render-empty' });
          return;
        }
        if (selectedVariantId && !list.some(entry => entry.id === selectedVariantId)) {
          setSelectedVariant(null, { skipHighlight: true });
        }
        const fragment = document.createDocumentFragment();
        list.forEach(variant => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'welcome-picker__option';
          button.dataset.variantId = variant.id;
          button.setAttribute('role', 'option');
          button.setAttribute('aria-selected', selectedVariantId === variant.id ? 'true' : 'false');

          const line = document.createElement('span');
          line.className = 'welcome-picker__option-line';

          const label = document.createElement('span');
          label.className = 'welcome-picker__option-label';
          label.textContent = variant.label;
          line.appendChild(label);

          if (variant.description) {
            const separator = document.createElement('span');
            separator.className = 'welcome-picker__option-separator';
            separator.textContent = ': ';
            line.appendChild(separator);

            const description = document.createElement('span');
            description.className = 'welcome-picker__option-description';
            description.textContent = variant.description;
            line.appendChild(description);
          }

          button.appendChild(line);
          fragment.appendChild(button);
        });
        container.appendChild(fragment);
        updateVariantHighlight(container);
        if (!selectedVariantId) {
          setSelectedVariant(null, { skipHighlight: true });
        }
        alignVariantDropdown();
        openVariantDropdown({ reason: 'render-list' });
      }

      function filterAndRenderVariants(term) {
        const normalized = (term || '').toLowerCase().trim();
        const tokens = normalized ? normalized.split(/\s+/).filter(Boolean) : [];
        const nextList = tokens.length
          ? normalizedGraphVariants.filter(entry => tokens.every(token => entry.searchText.includes(token)))
          : normalizedGraphVariants;
        renderVariantResults(nextList);
      }

      function clearVariantSearch() {
        if (dom.welcomeGraphSearch) {
          dom.welcomeGraphSearch.value = '';
          dom.welcomeGraphSearch.focus();
        }
        setSelectedVariant(null, { skipHighlight: true });
        filterAndRenderVariants('');
        openVariantDropdown({ reason: 'clear-search' });
      }

      function handleVariantResultClick(event) {
        const target = event?.target?.closest('[data-variant-id]');
        if (!target) {
          return;
        }
        const variantId = target.dataset.variantId;
        if (!variantId) {
          return;
        }
        setSelectedVariant(variantId, { reason: 'click-selection' });
      }

      function handleVariantResultDoubleClick(event) {
        const target = event?.target?.closest('[data-variant-id]');
        if (!target) {
          return;
        }
        const variantId = target.dataset.variantId;
        if (!variantId) {
          return;
        }
        setSelectedVariant(variantId, { reason: 'double-click-selection' });
        launchVariant(variantId, { reason: 'welcome-picker-dblclick' });
      }

      function handleVariantSearchKeydown(event) {
        if (event.key === 'Escape') {
          closeVariantDropdown({ reason: 'escape' });
          event.stopPropagation();
          return;
        }
        if (event.key !== 'Enter') {
          return;
        }
        if (!renderedVariantList.length) {
          return;
        }
        event.preventDefault();
        if (!selectedVariantId) {
          setSelectedVariant(renderedVariantList[0].id, { reason: 'enter-selection' });
        }
        if (selectedVariantId) {
          launchVariant(selectedVariantId, { reason: 'welcome-picker-enter' });
        }
      }

      function launchVariant(variantId, meta = {}) {
        if (!variantId || !graphVariantLookup.has(variantId)) {
          console.debug('Debug: launchVariant skipped', { variantId, reason: meta.reason });
          return;
        }
        const variant = graphVariantLookup.get(variantId);
        handleGraphSelection(variant.type, {
          variantId,
          reason: meta.reason || 'welcome-picker'
        });
        closeVariantDropdown({ reason: meta.reason || 'welcome-picker' });
      }

      function initializeVariantPicker() {
        if (!dom?.welcomeGraphSearchResults) {
          return;
        }
        if (!normalizedGraphVariants.length) {
          if (dom.welcomeGraphSearch) dom.welcomeGraphSearch.disabled = true;
          if (dom.welcomeGraphSearchClear) dom.welcomeGraphSearchClear.disabled = true;
          if (dom.welcomeGraphLaunch) dom.welcomeGraphLaunch.disabled = true;
          if (dom.welcomeGraphSelectionLabel) {
            dom.welcomeGraphSelectionLabel.textContent = 'Quick launch will be available once graph types are registered.';
          }
          return;
        }
        ensurePickerDismissListener();
        ensurePickerResizeListener();
        setSelectedVariant(null, { skipHighlight: true });
        renderVariantResults(normalizedGraphVariants);
        if (dom.welcomeGraphSearch) {
          dom.welcomeGraphSearch.addEventListener('input', event => {
            filterAndRenderVariants(event.target.value || '');
          });
          dom.welcomeGraphSearch.addEventListener('keydown', handleVariantSearchKeydown);
          dom.welcomeGraphSearch.addEventListener('focus', () => openVariantDropdown({ reason: 'focus' }));
          dom.welcomeGraphSearch.addEventListener('click', () => openVariantDropdown({ reason: 'click' }));
        }
        if (dom.welcomeGraphSearchClear) {
          dom.welcomeGraphSearchClear.addEventListener('click', () => {
            clearVariantSearch();
            dom.welcomeGraphSearch?.focus();
          });
        }
        if (dom.welcomeGraphSearchResults) {
          dom.welcomeGraphSearchResults.addEventListener('click', handleVariantResultClick);
          dom.welcomeGraphSearchResults.addEventListener('dblclick', handleVariantResultDoubleClick);
        }
        if (dom.welcomeGraphLaunch) {
          dom.welcomeGraphLaunch.addEventListener('click', () => {
            if (selectedVariantId) {
              launchVariant(selectedVariantId, { reason: 'welcome-picker' });
            }
          });
        }
        closeVariantDropdown({ reason: 'init' });
      }

    function initializeWorkspace(callbacks = {}) {
      createSelectionCards();
      initializeVariantPicker();
      const welcomeTab = session.createTab({ title: 'Welcome', isWelcome: true, allowClose: false });
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
      if (dom.sessionSaveBtn && typeof callbacks.onSessionSaveClick === 'function') {
        dom.sessionSaveBtn.addEventListener('click', callbacks.onSessionSaveClick);
      }
      if (dom.matchStylesBtn && typeof callbacks.onMatchStylesClick === 'function') {
        dom.matchStylesBtn.addEventListener('click', callbacks.onMatchStylesClick);
      }
      if (dom.sessionLoadBtn && typeof callbacks.onSessionLoadClick === 'function') {
        dom.sessionLoadBtn.addEventListener('click', callbacks.onSessionLoadClick);
      }
      if (dom.sessionFileInput && typeof callbacks.onSessionInputChange === 'function') {
        dom.sessionFileInput.addEventListener('change', callbacks.onSessionInputChange);
      }
      if (dom.welcomeGraphInput && typeof callbacks.onWelcomeGraphInputChange === 'function') {
        dom.welcomeGraphInput.addEventListener('change', callbacks.onWelcomeGraphInputChange);
      }
      bindUnsavedPromptHandlers();
      console.debug('Debug: workspace UI initialized via Main.tabs', { welcomeTabId: welcomeTab.id });
      return welcomeTab;
    }

    Object.assign(namespace, {
      renderTabs,
      beginRenameTab,
      commitTabRename,
      cancelTabRename,
      activateTab,
      closeTab,
      getActiveTab,
      determineDuplicateSourceCandidate,
      handleAddTabClick,
      handleGraphSelection,
      hideDuplicatePrompt,
      showGraphSelection,
      showWorkspaceForTab,
      initializeWorkspace,
      getSessionActionsContext
    });
    console.debug('Debug: Main.tabs helpers attached', {
      exposed: ['renderTabs', 'beginRenameTab', 'commitTabRename', 'cancelTabRename', 'activateTab', 'closeTab', 'getActiveTab', 'determineDuplicateSourceCandidate', 'handleAddTabClick', 'handleGraphSelection', 'hideDuplicatePrompt', 'showGraphSelection', 'showWorkspaceForTab', 'initializeWorkspace']
    });

    return {
      renderTabs,
      beginRenameTab,
      commitTabRename,
      cancelTabRename,
      activateTab,
      closeTab,
      getActiveTab,
      determineDuplicateSourceCandidate,
      handleAddTabClick,
      handleGraphSelection,
      hideDuplicatePrompt,
      showGraphSelection,
      showWorkspaceForTab,
      createSelectionCards,
      initializeWorkspace,
      getSessionActionsContext
    };
  };
})();
