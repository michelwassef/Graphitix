(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.tabs = Main.tabs || {};
  console.debug('Debug: Main.tabs unsaved prompt helpers module initializing', { module: 'js/main/tabs/unsavedPrompt.js' });

  namespace.createUnsavedPromptHandlers = function createUnsavedPromptHandlers(options = {}) {
    const dom = options.dom;
    const workspaceState = options.workspaceState;
    const session = options.session;
    const withSessionContext = typeof options.withSessionContext === 'function' ? options.withSessionContext : () => ({ reason: 'unspecified' });
    const getActiveTab = typeof options.getActiveTab === 'function' ? options.getActiveTab : () => null;
    const getTabById = typeof options.getTabById === 'function' ? options.getTabById : () => null;
    const activateTab = typeof options.activateTab === 'function' ? options.activateTab : () => {};
    const closeTab = typeof options.closeTab === 'function' ? options.closeTab : () => {};

    if (!dom || !workspaceState || !session) {
      const details = {
        hasDom: !!dom,
        hasWorkspaceState: !!workspaceState,
        hasSession: !!session
      };
      console.error('Main.tabs.createUnsavedPromptHandlers missing dependencies', details);
      throw new Error('createUnsavedPromptHandlers requires dom, workspaceState, and session.');
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
      const modal = window.Shared?.modalLifecycle;
      if (modal?.isOpen?.(dom.unsavedPrompt)) {
        modal.close(dom.unsavedPrompt);
      } else {
        dom.unsavedPrompt.setAttribute('hidden', 'hidden');
      }
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
      const restoreTarget = pending.previousActiveId && pending.previousActiveId !== tab.id
        ? pending.previousActiveId
        : null;
      try {
        if (workspaceState.activeTabId !== tab.id) {
          const currentActive = getActiveTab();
          if (currentActive && currentActive.id !== tab.id) {
            session.persistActiveTabState(currentActive, withSessionContext({
              reason: 'unsaved-switch',
              origin: 'lifecycle',
              snapshotKind: 'lifecycle-checkpoint'
            }));
          }
          console.debug('Debug: unsaved prompt activating tab', { tabId: tab.id, previousActiveId: currentActive?.id || null });
          activateTab(tab.id, { reason: 'unsaved-save' });
        }
        const sessionActions = window.Main?.sessionActions;
        const tabsApi = window.Main?.tabs;
        if (sessionActions && typeof sessionActions.saveWorkspaceArchiveWithScope === 'function' && tabsApi && typeof tabsApi.getSessionActionsContext === 'function') {
          console.debug('Debug: unsaved prompt invoking archive save', { tabId: tab.id, type: tab.type });
          const saveContext = tabsApi.getSessionActionsContext();
          const targetTabId = String(workspaceState.sessionFileTabId || '').trim();
          const hasExistingFileTarget = workspaceState.sessionFileTargetKind === 'existing'
            || (workspaceState.sessionFileTargetKind !== 'new'
              && !!(workspaceState.sessionFileHandle || workspaceState.sessionFileName
                || workspaceState.sessionFilePath || workspaceState.sessionFileScope));
          const isExistingWorkspaceFile = hasExistingFileTarget
            && workspaceState.sessionFileScope === 'workspace';
          const isExistingTabFile = hasExistingFileTarget
            && workspaceState.sessionFileScope === 'tab'
            && (targetTabId === tab.id || (!targetTabId
              && workspaceState.tabs.filter(item => item && !item.isWelcome && item.type).length === 1));
          const saveOptions = isExistingWorkspaceFile
            ? { scope: 'workspace' }
            : (isExistingTabFile
              ? { scope: 'tab', targetTabId: tab.id }
              : { scope: 'tab', targetTabId: tab.id, forcePicker: true, rememberFile: false });
          const saveResult = await sessionActions.saveWorkspaceArchiveWithScope(saveContext, {
            ...saveOptions,
            reason: 'unsaved-tab-save'
          });
          if (workspaceState.pendingClosePrompt !== pending || getTabById(pending.tabId) !== tab) {
            console.debug('Debug: unsaved prompt save completion ignored after owner changed', { tabId: pending.tabId });
            return;
          }
          if (!saveResult || (saveResult.status !== 'saved' && saveResult.status !== 'downloaded')) {
            return;
          }
        } else {
          console.warn('Unsaved prompt save unavailable: missing sessionActions archive save', { tabId: tab.id, type: tab.type });
          return;
        }
        if (workspaceState.pendingClosePrompt !== pending || getTabById(pending.tabId) !== tab) {
          console.debug('Debug: unsaved prompt save completion ignored after owner changed', { tabId: pending.tabId });
          return;
        }
        session.persistActiveTabState(tab, withSessionContext({
          reason: 'unsaved-save',
          origin: 'lifecycle',
          snapshotKind: 'lifecycle-checkpoint'
        }));
        console.debug('Debug: unsaved prompt save complete', { tabId: tab.id });
        closeTab(tab.id, {
          force: true,
          skipPrompt: true,
          skipPersist: true,
          reason: 'unsaved-save',
          unsavedPromptSave: pending
        });
        if (workspaceState.sessionFileScope === 'tab'
          && workspaceState.sessionFileTabId === tab.id
          && !getTabById(tab.id)) {
          workspaceState.sessionFileHandle = null;
          workspaceState.sessionFileName = '';
          workspaceState.sessionFilePath = '';
          workspaceState.sessionFileScope = null;
          workspaceState.sessionFileTabId = null;
          workspaceState.sessionFileTargetKind = 'new';
        }
        if (restoreTarget && getTabById(restoreTarget)) {
          activateTab(restoreTarget, { reason: 'restore-after-unsaved-save', skipPersist: true });
        }
      } catch (err) {
        if (workspaceState.pendingClosePrompt === pending && getTabById(pending.tabId) === tab) {
          console.error('unsaved prompt save error', { tabId: tab.id, err });
        } else {
          console.debug('Debug: unsaved prompt save error ignored after owner changed', { tabId: pending.tabId });
        }
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
      if (unsavedPromptBusy) {
        console.debug('Debug: showUnsavedPrompt skipped', { reason: 'save-pending', tabId: tab.id });
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
      const modal = window.Shared?.modalLifecycle;
      if (modal?.open) {
        modal.open(dom.unsavedPrompt, {
          initialFocus: () => dom.unsavedSave,
          returnFocus: document.activeElement,
          onEscape: handleUnsavedCancel
        });
      } else {
        dom.unsavedPrompt.removeAttribute('hidden');
        dom.unsavedPrompt.focus?.();
      }
      console.debug('Debug: unsaved prompt displayed', promptState);
    }

    return {
      showUnsavedPrompt,
      hideUnsavedPrompt,
      bindUnsavedPromptHandlers,
      isBusy: () => unsavedPromptBusy,
      handleUnsavedSave,
      handleUnsavedDiscard,
      handleUnsavedCancel,
      setUnsavedPromptBusy
    };
  };
})();
