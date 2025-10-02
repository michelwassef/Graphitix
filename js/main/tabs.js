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

    function renderTabs() {
      if (!dom.tabsList) return;
      previews.hideTabPreviewTooltip('render');
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
        btn.addEventListener('mouseenter', event => previews.handleTabPreviewEnter(event, tab));
        btn.addEventListener('mouseleave', () => previews.handleTabPreviewLeave('leave'));
        btn.addEventListener('blur', () => previews.handleTabPreviewLeave('blur'));

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
        session.markSessionDirty('tab-renamed', { tabId, previousTitle, nextTitle: tab.title });
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

    let unsavedPromptBusy = false;

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

    function hideUnsavedPrompt() {
      if (!dom.unsavedPrompt) {
        return;
      }
      dom.unsavedPrompt.setAttribute('hidden', 'hidden');
      delete dom.unsavedPrompt.dataset.tabId;
      console.debug('Debug: unsaved prompt hidden');
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
            session.persistActiveTabState(currentActive, withSessionContext({ reason: 'unsaved-switch' }));
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
        session.persistActiveTabState(tab, withSessionContext({ reason: 'unsaved-save' }));
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
          session.assignTabPayload(tab, null, { reason: 'duplicate-bypass-clear' });
        }
        hideDuplicatePrompt();
        showWorkspaceForTab(tab);
        session.markSessionDirty('duplicate-bypass', { tabId: tab?.id || null, type });
        return;
      }
      if (!dom.duplicatePrompt || !dom.duplicateEmpty) {
        console.debug('Debug: duplicate prompt unavailable, applying fallback', { type, canDuplicate });
        if (canDuplicate && sourceTab?.payload) {
          const clonedPayload = session.clonePayload(sourceTab.payload);
          session.assignTabPayload(tab, clonedPayload, { reason: 'duplicate-fallback-clone' });
        } else {
          session.assignTabPayload(tab, null, { reason: 'duplicate-fallback-empty' });
        }
        showWorkspaceForTab(tab);
        session.markSessionDirty('duplicate-fallback', { tabId: tab?.id || null, type });
        return;
      }
      if (!dom.duplicateReuse || !dom.duplicateCancel) {
        console.warn('duplicate prompt controls missing');
        return;
      }
      dom.duplicatePrompt.dataset.tabId = tab.id;
      dom.duplicatePrompt.removeAttribute('hidden');
      dom.duplicateReuse.textContent = `Reuse ${sourceTab?.title || 'source'} data`;
      dom.duplicateReuse.onclick = () => {
        const clonedPayload = canDuplicate && sourceTab?.payload
          ? session.clonePayload(sourceTab.payload)
          : null;
        if (clonedPayload) {
          session.assignTabPayload(tab, clonedPayload, { reason: 'duplicate-accept' });
        }
        hideDuplicatePrompt();
        showWorkspaceForTab(tab);
        session.markSessionDirty('duplicate-accepted', { tabId: tab.id, sourceId: sourceTab?.id || null, type });
      };
      dom.duplicateEmpty.onclick = () => {
        session.assignTabPayload(tab, null, { reason: 'duplicate-empty' });
        hideDuplicatePrompt();
        showWorkspaceForTab(tab);
        session.markSessionDirty('duplicate-empty-selected', { tabId: tab.id, sourceId: sourceTab?.id || null, type });
      };
      dom.duplicateCancel.onclick = () => {
        hideDuplicatePrompt();
        if (workspaceState.pendingDuplicateSource !== tab.id) {
          const fallbackSource = determineDuplicateSourceCandidate();
          workspaceState.pendingDuplicateSource = fallbackSource;
          renderTabs();
          showGraphSelection({ reason: 'duplicate-cancelled' });
        }
      };
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
