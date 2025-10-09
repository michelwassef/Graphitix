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
    const dom = config.dom;
    const workspaceState = config.workspaceState;
    const withSessionContext = config.withSessionContext;

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
      domControls.showWorkspaceForTab({
        tab,
        options,
        dom,
        workspaces,
        session,
        workspaceState
      });
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
        session.markSessionDirty('tab-removed', { tabId, reason });
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
        session.persistActiveTabState(tab, withSessionContext({ reason }));
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
        session.persistActiveTabState(tab, withSessionContext({ reason: `${reason}-force` }));
      }
      workspaceState.pendingClosePrompt = null;
      hideUnsavedPrompt();
      performTabRemoval(tab, { wasActive, reason });
    }

    function activateTab(tabId, options = {}) {
      const current = getActiveTab();
      if (current && current.id !== tabId && !options.skipPersist) {
        session.persistActiveTabState(current, withSessionContext({ reason: options.reason || 'activate-switch' }));
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
        session.markSessionDirty('tab-created', { tabId: newTab.id, reason: 'welcome-selection' });
        previousType = null;
        previousTitle = tab.title || '';
      }
      const priorType = previousType;
      const priorTitle = previousTitle;
      tab.type = type;
      const info = graphTypes.find(item => item.type === type);
      const config = workspaces[type];
      const resolvedTitle = info?.label || config?.tabLabel || tab.title;
      tab.title = resolvedTitle;
      tab.isRenaming = false;
      renderTabs();
      console.debug('Debug: graph assigned to tab', { tabId: tab.id, type });
      if (priorType !== type) {
        session.markSessionDirty('graph-type-changed', { tabId: tab.id, previousType: priorType, nextType: type });
      }
      if (tab.title !== priorTitle) {
        session.markSessionDirty('tab-title-updated', { tabId: tab.id, previousTitle: priorTitle, nextTitle: tab.title });
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
      const payloadCleared = session.assignTabPayload(tab, null, { reason: 'graph-selection-reset' });
      tab.layoutState = null;
      tab.layoutSignature = null;
      if (payloadCleared) {
        session.markSessionDirty('graph-payload-reset', { tabId: tab.id, previousType: priorType, nextType: type });
      }
      showWorkspaceForTab(tab);
    }

    function handleAddTabClick() {
      const current = getActiveTab();
      if (current && !current.isWelcome) {
        session.persistActiveTabState(current, withSessionContext({ reason: 'add-tab-before-new' }));
      }
      const candidateSource = determineDuplicateSourceCandidate(current?.id);
      const newTab = session.createTab({ duplicateSource: candidateSource });
      workspaceState.tabs.push(newTab);
      workspaceState.activeTabId = newTab.id;
      workspaceState.pendingDuplicateSource = candidateSource;
      renderTabs();
      session.markSessionDirty('tab-created', { tabId: newTab.id, reason: 'add-tab-click' });
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
      console.debug('Debug: selection cards generated', { count: graphTypes.length });
    }

    function initializeWorkspace(callbacks = {}) {
      createSelectionCards();
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
