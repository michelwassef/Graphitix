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
    const WELCOME_EXAMPLE_MAX_ATTEMPTS = 10;
    const WELCOME_EXAMPLE_RETRY_DELAY_MS = 60;

    let lastWelcomeVariantLaunch = null;
    const welcomePreloadPromises = new Map();
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
    let welcomeExamplesDialogBound = false;
    let welcomeExamplesDialogReturnFocus = null;
    let welcomePopularCarouselBound = false;
    let welcomePopularCarouselResizeObserver = null;
    let welcomePopularCarouselWheelFrame = 0;
    let welcomePopularCarouselWheelTarget = 0;
    let welcomePopularCarouselWheelIdleTimer = 0;
    let welcomeExamplesDialogPreviousOverflow = null;

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
    if (typeof session.disposeWorkspaceTabResources !== 'function') {
      console.error('Main.tabs.createManager missing teardown contract', {
        hasSession: !!session,
        hasDisposeWorkspaceTabResources: typeof session.disposeWorkspaceTabResources === 'function'
      });
      throw new Error('Main.tabs.createManager requires session.disposeWorkspaceTabResources.');
    }

    console.debug('Debug: Main.tabs.createManager invoked', {
      tabCount: workspaceState.tabs?.length || 0,
      graphTypes: graphTypes.length
    });

    const sessionFileTypes = config.sessionFileTypes || [];

    const getActiveTab = () => workspaceState.tabs.find(tab => tab.id === workspaceState.activeTabId) || null;
    const isDocumentInteractionLocked = () => workspaceState.documentOperation?.active === true;

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
    let hideDuplicatePrompt;
    let showDuplicateDecision;
    let applyDuplicateChoice;

    const applyTabDragClasses = () => tabDrag.applyTabDragClasses({ dom, workspaceState, renderTabs, markSessionDirty: session.markSessionDirty });



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

    function persistCompletedOwnerBeforeDeactivation(tab, options = {}) {
      if (!tab || tab.isWelcome || !tab.type) {
        return;
      }
      session.persistActiveTabState(tab, withSessionContext({
        reason: options.reason || 'workspace-deactivate',
        origin: 'lifecycle',
        snapshotKind: 'lifecycle-checkpoint',
        captureRenderCache: true,
        captureRenderCacheIfNeeded: true,
        preserveRenderCacheTabIds: Array.isArray(options.preserveTabIds)
          ? options.preserveTabIds
          : []
      }));
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
      isInteractionLocked: isDocumentInteractionLocked,
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
    applyDuplicateChoice = duplicateHelpers.applyDuplicateChoice;

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
            persistCompletedOwnerBeforeDeactivation(currentActive, {
              reason: 'duplicate-before-create'
            });
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
        if (typeof applyDuplicateChoice === 'function') {
          applyDuplicateChoice(
            newTab,
            sourceTab,
            newTab.type,
            preferEmpty ? 'empty' : 'reuse',
            'duplicate-context'
          );
          return;
        }
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
      session.disposeWorkspaceTabResources(tab, {
        reason,
        type: tab.type || null
      });
      workspaceState.tabs.splice(index, 1);
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
      if (isDocumentInteractionLocked() && options.allowDuringDocumentOperation !== true) {
        console.debug('Debug: closeTab blocked during document operation', { tabId });
        return false;
      }
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
        session.persistActiveTabState(tab, withSessionContext({
          reason,
          origin: 'lifecycle',
          snapshotKind: 'lifecycle-checkpoint'
        }));
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
        session.persistActiveTabState(tab, withSessionContext({
          reason: `${reason}-force`,
          origin: 'lifecycle',
          snapshotKind: 'lifecycle-checkpoint'
        }));
      }
      workspaceState.pendingClosePrompt = null;
      hideUnsavedPrompt();
      performTabRemoval(tab, { wasActive, reason });
    }

    function activateTab(tabId, options = {}) {
      if (isDocumentInteractionLocked() && options.allowDuringDocumentOperation !== true) {
        console.debug('Debug: activateTab blocked during document operation', { tabId });
        return false;
      }
      const current = getActiveTab();
      if (current && current.id !== tabId && !options.skipPersist) {
        persistCompletedOwnerBeforeDeactivation(current, {
          reason: options.reason || 'activate-switch',
          preserveTabIds: [tabId]
        });
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
        previews,
        workspaces,
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
      if (isDocumentInteractionLocked() && options.allowDuringDocumentOperation !== true) {
        console.debug('Debug: graph selection blocked during document operation', { type });
        return false;
      }
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
      if (priorType && priorType !== type) {
        session.disposeWorkspaceTabResources(tab, {
          reason: 'graph-selection-reset',
          type: priorType
        });
      }
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

    function delay(ms) {
      return new Promise(resolve => {
        window.setTimeout(resolve, ms);
      });
    }

    function waitForNextPaint() {
      return new Promise(resolve => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      });
    }

    async function invokeWelcomeLoadExample(type, meta = {}) {
      const commands = Main.desktopCommands;
      if (!commands || typeof commands.execute !== 'function') {
        console.warn('welcome load example skipped: command dispatcher unavailable', { type, reason: meta.reason || null });
        return false;
      }
      for (let attempt = 1; attempt <= WELCOME_EXAMPLE_MAX_ATTEMPTS; attempt += 1) {
        await waitForNextPaint();
        const result = await commands.execute('loadExampleData', {
          origin: 'welcome',
          type,
          reason: meta.reason || 'welcome-load-example',
          attempt
        });
        if (result?.status === 'sent' || result?.status === 'handled') {
          console.debug('Debug: welcome load example invoked', { type, attempt });
          return true;
        }
        const retryable = result?.reason === 'button-unavailable' || result?.reason === 'no-active-graph-tab';
        if (!retryable || attempt === WELCOME_EXAMPLE_MAX_ATTEMPTS) {
          console.warn('welcome load example skipped', { type, attempt, result });
          return false;
        }
        await delay(WELCOME_EXAMPLE_RETRY_DELAY_MS);
      }
      return false;
    }

    async function launchWelcomeGraph(type, options = {}) {
      if (!type || !workspaces[type]) {
        console.warn('welcome graph launch skipped: unsupported type', { type, options });
        return;
      }
      preloadWelcomeGraphType(type, { reason: options.reason || 'welcome-launch' });
      const result = handleGraphSelection(type, {
        variantId: options.variantId || null,
        reason: options.reason || (options.loadExample ? 'welcome-load-example' : 'welcome-new'),
        forceBlankWorkspace: true,
        skipDuplicatePrompt: true,
        disableDuplicatePrompt: true
      });
      if (result && typeof result.then === 'function') {
        await result;
      }
      if (options.loadExample) {
        await invokeWelcomeLoadExample(type, { reason: options.reason || 'welcome-load-example' });
      }
    }

    function preloadWelcomeGraphType(type, meta = {}) {
      const componentType = String(type || '').trim();
      if (!componentType || !workspaces[componentType]) return null;
      if (welcomePreloadPromises.has(componentType)) {
        return welcomePreloadPromises.get(componentType);
      }
      const loader = Main.components && typeof Main.components.loadComponentBundle === 'function'
        ? Main.components.loadComponentBundle
        : null;
      if (!loader) return null;
      const promise = Promise.resolve()
        .then(() => loader(componentType, { reason: meta.reason || 'welcome-preload' }))
        .then(component => {
          console.debug('Debug: welcome component bundle preloaded', {
            type: componentType,
            hasComponent: !!component,
            reason: meta.reason || 'welcome-preload'
          });
          return component;
        })
        .catch(err => {
          welcomePreloadPromises.delete(componentType);
          console.debug('Debug: welcome component bundle preload failed', {
            type: componentType,
            reason: meta.reason || 'welcome-preload',
            message: err?.message || String(err)
          });
          return null;
        });
      welcomePreloadPromises.set(componentType, promise);
      return promise;
    }

    function bindWelcomeGraphPreload(element, type, reasonPrefix) {
      if (!element || !type) return;
      const requestPreload = event => {
        preloadWelcomeGraphType(type, { reason: `${reasonPrefix}-${event.type}` });
      };
      element.addEventListener('pointerenter', requestPreload, { passive: true });
      element.addEventListener('pointerdown', requestPreload, { passive: true });
      element.addEventListener('focusin', requestPreload);
    }

    function handleAddTabClick() {
      if (isDocumentInteractionLocked()) {
        console.debug('Debug: add tab blocked during document operation');
        return false;
      }
      const current = getActiveTab();
      if (current && !current.isWelcome) {
        persistCompletedOwnerBeforeDeactivation(current, {
          reason: 'add-tab-before-new'
        });
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

    function bindGraphCardActions(card, info) {
      if (!card || !info?.type || card.dataset.welcomeCardHydrated === 'true') {
        return false;
      }
      card.setAttribute('role', 'listitem');
      card.dataset.graphType = info.type;
      bindWelcomeGraphPreload(card, info.type, 'welcome-card');

      const newButton = card.querySelector('[data-welcome-action="new"], .graph-card__action--new');
      if (newButton) {
        newButton.type = 'button';
        newButton.dataset.welcomeAction = 'new';
        newButton.setAttribute('aria-label', `New ${info.label}`);
        newButton.addEventListener('click', event => {
          event.preventDefault();
          console.debug('Debug: welcome new graph requested', { type: info.type });
          void launchWelcomeGraph(info.type, { reason: 'welcome-card-new' });
        });
      }

      const exampleButton = card.querySelector('[data-welcome-action="example"], .graph-card__action--example');
      if (exampleButton) {
        exampleButton.type = 'button';
        exampleButton.dataset.welcomeAction = 'example';
        exampleButton.setAttribute('aria-label', `Load example ${info.label}`);
        exampleButton.addEventListener('click', event => {
          event.preventDefault();
          console.debug('Debug: welcome example graph requested', { type: info.type });
          void launchWelcomeGraph(info.type, { loadExample: true, reason: 'welcome-card-load-example' });
        });
      }

      card.dataset.welcomeCardHydrated = 'true';
      return true;
    }

    function createGraphCard(info) {
      const card = Main.bootstrap.createWelcomeGraphCard(info);
      bindGraphCardActions(card, info);
      return card;
    }


    function createWelcomeExampleCard(info, options = {}) {
      if (!info?.type) {
        return null;
      }
      const compact = options.compact === true;
      const card = Main.bootstrap.createWelcomeExampleCard(info, options);
      bindWelcomeGraphPreload(card, info.type, compact ? 'welcome-popular-example' : 'welcome-example-gallery');
      card.addEventListener('click', event => {
        event.preventDefault();
        closeWelcomeExamplesDialog({ restoreFocus: false, reason: 'launch-example' });
        void launchWelcomeGraph(info.type, {
          loadExample: true,
          reason: compact ? 'welcome-popular-example' : 'welcome-all-examples'
        });
      });
      return card;
    }

    function renderWelcomeExampleCollection(container, items, options = {}) {
      if (!container) {
        return 0;
      }
      container.textContent = '';
      const fragment = document.createDocumentFragment();
      let count = 0;
      items.forEach(info => {
        const card = createWelcomeExampleCard(info, options);
        if (!card) {
          return;
        }
        const item = document.createElement('div');
        item.className = 'welcome-example-item';
        item.setAttribute('role', 'listitem');
        item.appendChild(card);
        fragment.appendChild(item);
        count += 1;
      });
      if (count > 0) {
        container.appendChild(fragment);
      }
      return count;
    }

    function getWelcomeExamplesDialogFocusableElements() {
      const dialog = dom.welcomeExamplesDialog;
      if (!dialog || dialog.hidden) {
        return [];
      }
      return Array.from(dialog.querySelectorAll([
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(','))).filter(element => {
        if (!element || element.closest('[hidden]')) {
          return false;
        }
        const style = window.getComputedStyle?.(element);
        return style?.display !== 'none' && style?.visibility !== 'hidden';
      });
    }

    function openWelcomeExamplesDialog() {
      const dialog = dom.welcomeExamplesDialog;
      if (!dialog || !dialog.hidden) {
        return false;
      }
      welcomeExamplesDialogReturnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : dom.welcomeViewAllExamples || null;
      welcomeExamplesDialogPreviousOverflow = document.body.style.overflow;
      dialog.hidden = false;
      dialog.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      window.requestAnimationFrame(() => {
        const panel = dialog.querySelector('.welcome-dialog__panel');
        panel?.focus?.();
      });
      return true;
    }

    function closeWelcomeExamplesDialog(options = {}) {
      const dialog = dom.welcomeExamplesDialog;
      if (!dialog || dialog.hidden) {
        return false;
      }
      dialog.hidden = true;
      dialog.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = welcomeExamplesDialogPreviousOverflow || '';
      welcomeExamplesDialogPreviousOverflow = null;
      const returnFocus = welcomeExamplesDialogReturnFocus;
      welcomeExamplesDialogReturnFocus = null;
      if (options.restoreFocus !== false) {
        returnFocus?.focus?.();
      }
      return true;
    }

    function handleWelcomeExamplesDialogKeydown(event) {
      const dialog = dom.welcomeExamplesDialog;
      if (!dialog || dialog.hidden) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWelcomeExamplesDialog({ reason: 'escape' });
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = getWelcomeExamplesDialogFocusableElements();
      if (!focusable.length) {
        event.preventDefault();
        dialog.querySelector('.welcome-dialog__panel')?.focus?.();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeIndex = focusable.indexOf(active);
      if (activeIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function getWelcomeCarouselStep() {
      const list = dom.welcomePopularExamplesList;
      const firstItem = list?.querySelector?.('.welcome-example-item');
      if (!list || !firstItem) {
        return 0;
      }
      const style = getComputedStyle(list);
      const gap = Number.parseFloat(style.columnGap || style.gap) || 0;
      return firstItem.getBoundingClientRect().width + gap;
    }

    function updateWelcomeCarouselControls() {
      const list = dom.welcomePopularExamplesList;
      const previous = dom.welcomePopularExamplesPrev;
      const next = dom.welcomePopularExamplesNext;
      if (!list || !previous || !next) {
        return;
      }
      const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
      const tolerance = 1;
      previous.disabled = list.scrollLeft <= tolerance;
      next.disabled = list.scrollLeft >= maxScrollLeft - tolerance;
    }

    function cancelWelcomeCarouselWheelMotion() {
      if (welcomePopularCarouselWheelFrame) {
        cancelAnimationFrame(welcomePopularCarouselWheelFrame);
        welcomePopularCarouselWheelFrame = 0;
      }
      if (welcomePopularCarouselWheelIdleTimer) {
        clearTimeout(welcomePopularCarouselWheelIdleTimer);
        welcomePopularCarouselWheelIdleTimer = 0;
      }
      dom.welcomePopularExamplesList?.classList.remove('is-wheel-scrolling');
    }

    function scrollWelcomeCarousel(direction) {
      const list = dom.welcomePopularExamplesList;
      const step = getWelcomeCarouselStep();
      if (!list || !step || !Number.isFinite(direction)) {
        return;
      }
      cancelWelcomeCarouselWheelMotion();
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
      list.scrollBy({ left: direction * step, behavior });
    }

    function normalizeWelcomeCarouselWheelDelta(event, list) {
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        return dominantDelta * 16;
      }
      if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        return dominantDelta * list.clientWidth;
      }
      return dominantDelta;
    }

    function animateWelcomeCarouselWheel(list) {
      const distance = welcomePopularCarouselWheelTarget - list.scrollLeft;
      if (Math.abs(distance) < 0.5) {
        list.scrollLeft = welcomePopularCarouselWheelTarget;
        welcomePopularCarouselWheelFrame = 0;
        list.classList.remove('is-wheel-scrolling');
        return;
      }
      list.scrollLeft += distance * 0.24;
      welcomePopularCarouselWheelFrame = requestAnimationFrame(() => animateWelcomeCarouselWheel(list));
    }

    function settleWelcomeCarouselToCard(list) {
      welcomePopularCarouselWheelIdleTimer = 0;
      const step = getWelcomeCarouselStep();
      const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
      const snappedTarget = step
        ? Math.min(maxScrollLeft, Math.max(0, Math.round(list.scrollLeft / step) * step))
        : list.scrollLeft;
      welcomePopularCarouselWheelTarget = snappedTarget;
      if (welcomePopularCarouselWheelFrame) {
        cancelAnimationFrame(welcomePopularCarouselWheelFrame);
        welcomePopularCarouselWheelFrame = 0;
      }
      list.classList.remove('is-wheel-scrolling');
      list.scrollTo({ left: snappedTarget, behavior: 'smooth' });
    }

    function ensureWelcomePopularCarouselHandlers() {
      if (welcomePopularCarouselBound) {
        updateWelcomeCarouselControls();
        return;
      }
      const list = dom.welcomePopularExamplesList;
      const previous = dom.welcomePopularExamplesPrev;
      const next = dom.welcomePopularExamplesNext;
      if (!list || !previous || !next) {
        return;
      }

      previous.addEventListener('click', event => {
        event.preventDefault();
        scrollWelcomeCarousel(-1);
      });
      next.addEventListener('click', event => {
        event.preventDefault();
        scrollWelcomeCarousel(1);
      });
      list.addEventListener('scroll', updateWelcomeCarouselControls, { passive: true });
      list.addEventListener('wheel', event => {
        const delta = normalizeWelcomeCarouselWheelDelta(event, list);
        if (!Number.isFinite(delta) || delta === 0) {
          return;
        }
        const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
        const currentTarget = welcomePopularCarouselWheelFrame
          ? welcomePopularCarouselWheelTarget
          : list.scrollLeft;
        const nextTarget = Math.min(maxScrollLeft, Math.max(0, currentTarget + delta));
        if (Math.abs(nextTarget - currentTarget) < 0.5) {
          return;
        }

        event.preventDefault();
        list.classList.add('is-wheel-scrolling');
        // Cancel an in-progress CSS smooth scroll from the arrow controls before
        // starting the owner-managed wheel animation. Two concurrent scroll
        // engines can otherwise keep the settling class alive indefinitely.
        list.scrollTo({ left: list.scrollLeft, behavior: 'auto' });
        welcomePopularCarouselWheelTarget = nextTarget;
        if (!welcomePopularCarouselWheelFrame) {
          welcomePopularCarouselWheelFrame = requestAnimationFrame(() => animateWelcomeCarouselWheel(list));
        }
        if (welcomePopularCarouselWheelIdleTimer) {
          clearTimeout(welcomePopularCarouselWheelIdleTimer);
        }
        welcomePopularCarouselWheelIdleTimer = window.setTimeout(
          () => settleWelcomeCarouselToCard(list),
          110
        );
      }, { passive: false });
      list.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
          return;
        }
        event.preventDefault();
        scrollWelcomeCarousel(event.key === 'ArrowLeft' ? -1 : 1);
      });

      if (typeof ResizeObserver === 'function') {
        welcomePopularCarouselResizeObserver = new ResizeObserver(updateWelcomeCarouselControls);
        welcomePopularCarouselResizeObserver.observe(list);
      } else {
        window.addEventListener('resize', updateWelcomeCarouselControls, { passive: true });
      }
      welcomePopularCarouselBound = true;
      requestAnimationFrame(updateWelcomeCarouselControls);
    }

    function ensureWelcomeExamplesDialogHandlers() {
      if (welcomeExamplesDialogBound) {
        return;
      }
      dom.welcomeViewAllExamples?.addEventListener('click', event => {
        event.preventDefault();
        openWelcomeExamplesDialog();
      });
      dom.welcomeExamplesDialogClose?.addEventListener('click', event => {
        event.preventDefault();
        closeWelcomeExamplesDialog({ reason: 'close-button' });
      });
      dom.welcomeExamplesDialog?.addEventListener('click', event => {
        if (event.target?.hasAttribute?.('data-welcome-dialog-close')) {
          event.preventDefault();
          closeWelcomeExamplesDialog({ reason: 'backdrop' });
        }
      });
      document.addEventListener('keydown', handleWelcomeExamplesDialogKeydown);
      welcomeExamplesDialogBound = true;
    }

    function initializeWelcomeExampleGallery() {
      const allItems = graphTypes.slice();
      const popularItems = allItems;
      if (dom.welcomeViewAllExamples) {
        dom.welcomeViewAllExamples.textContent = `View all ${allItems.length}`;
        dom.welcomeViewAllExamples.setAttribute('aria-label', `View all ${allItems.length} Graphitix examples`);
      }
      renderWelcomeExampleCollection(dom.welcomePopularExamplesList, popularItems, { compact: true });
      renderWelcomeExampleCollection(dom.welcomeAllExamplesList, allItems, { compact: false });
      ensureWelcomePopularCarouselHandlers();
      ensureWelcomeExamplesDialogHandlers();
      console.debug('Debug: welcome example gallery rendered', {
        popular: popularItems.length,
        all: allItems.length
      });
    }

    function createSelectionCards() {
      if (!dom.selectionGrid) return false;
      const existingCards = Array.from(dom.selectionGrid.querySelectorAll('.graph-card[data-graph-type]'));
      const existingByType = new Map(existingCards.map(card => [card.dataset.graphType, card]));
      const fragment = document.createDocumentFragment();
      let created = 0;
      let hydrated = 0;

      graphTypes.forEach(info => {
        const existing = existingByType.get(info.type);
        if (existing) {
          hydrated += bindGraphCardActions(existing, info) ? 1 : 0;
          existingByType.delete(info.type);
          return;
        }
        fragment.appendChild(createGraphCard(info));
        created += 1;
      });

      existingByType.forEach(card => card.remove());
      if (fragment.childNodes.length) {
        dom.selectionGrid.appendChild(fragment);
      }
      console.debug('Debug: selection cards hydrated from canonical graph definitions', {
        total: graphTypes.length,
        preRendered: graphTypes.length - created,
        hydrated,
        created,
        removedStale: existingByType.size
      });
      return true;
    }

    function markWelcomeReady(meta = {}) {
      if (!dom?.welcomeScreen) return;
      dom.welcomeScreen.dataset.welcomeReady = 'true';
      console.debug('Debug: welcome screen ready', { reason: meta.reason || 'unspecified' });
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
          if (isWithinSearch || isWithinResults) {
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
          button.dataset.graphType = variant.type;
          button.setAttribute('role', 'option');
          button.setAttribute('aria-selected', selectedVariantId === variant.id ? 'true' : 'false');
          bindWelcomeGraphPreload(button, variant.type, 'welcome-picker');

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

      function handleVariantResultClick(event) {
        const target = event?.target?.closest('[data-variant-id]');
        if (!target) {
          return;
        }
        const variantId = target.dataset.variantId;
        if (!variantId) {
          return;
        }
        event.preventDefault();
        setSelectedVariant(variantId, { reason: 'click-selection' });
        launchVariant(variantId, { reason: 'welcome-picker-click' });
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
        const now = Date.now();
        if (lastWelcomeVariantLaunch
          && lastWelcomeVariantLaunch.variantId === variantId
          && now - lastWelcomeVariantLaunch.time < 500) {
          console.debug('Debug: duplicate welcome variant launch ignored', { variantId, reason: meta.reason });
          return;
        }
        lastWelcomeVariantLaunch = { variantId, time: now };
        const variant = graphVariantLookup.get(variantId);
        closeVariantDropdown({ reason: meta.reason || 'welcome-picker' });
        void launchWelcomeGraph(variant.type, {
          variantId,
          reason: meta.reason || 'welcome-picker'
        });
      }

      function initializeVariantPicker() {
        if (!dom?.welcomeGraphSearchResults) {
          return;
        }
        if (!normalizedGraphVariants.length) {
          if (dom.welcomeGraphSearch) dom.welcomeGraphSearch.disabled = true;
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
        if (dom.welcomeGraphSearchResults) {
          dom.welcomeGraphSearchResults.addEventListener('click', handleVariantResultClick);
        }
        closeVariantDropdown({ reason: 'init' });
      }

    function initializeWorkspace(callbacks = {}) {
      createSelectionCards();
      initializeWelcomeExampleGallery();
      initializeVariantPicker();
      markWelcomeReady({ reason: 'initial-welcome-render' });
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
      launchWelcomeGraph,
      hideDuplicatePrompt,
      showGraphSelection,
      showWorkspaceForTab,
      initializeWorkspace,
      getSessionActionsContext
    });
    console.debug('Debug: Main.tabs helpers attached', {
      exposed: ['renderTabs', 'beginRenameTab', 'commitTabRename', 'cancelTabRename', 'activateTab', 'closeTab', 'getActiveTab', 'determineDuplicateSourceCandidate', 'handleAddTabClick', 'handleGraphSelection', 'launchWelcomeGraph', 'hideDuplicatePrompt', 'showGraphSelection', 'showWorkspaceForTab', 'initializeWorkspace']
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
      launchWelcomeGraph,
      hideDuplicatePrompt,
      showGraphSelection,
      showWorkspaceForTab,
      createSelectionCards,
      initializeWorkspace,
      getSessionActionsContext
    };
  };
})();
