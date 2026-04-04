(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.tabs = Main.tabs || {};
  console.debug('Debug: Main.tabs duplicate prompt helpers module initializing', { module: 'js/main/tabs/duplicatePrompt.js' });

  namespace.createDuplicatePromptHandlers = function createDuplicatePromptHandlers(options = {}) {
    const dom = options.dom;
    const workspaceState = options.workspaceState;
    const session = options.session;
    const domControls = options.domControls || null;
    const workspaces = options.workspaces || {};
    const renderTabs = typeof options.renderTabs === 'function' ? options.renderTabs : () => {};
    const showWorkspaceForTab = typeof options.showWorkspaceForTab === 'function' ? options.showWorkspaceForTab : () => {};
    const showGraphSelection = typeof options.showGraphSelection === 'function' ? options.showGraphSelection : () => {};
    const determineDuplicateSourceCandidate = typeof options.determineDuplicateSourceCandidate === 'function'
      ? options.determineDuplicateSourceCandidate
      : () => null;

    if (!dom || !workspaceState || !session) {
      const details = {
        hasDom: !!dom,
        hasWorkspaceState: !!workspaceState,
        hasSession: !!session
      };
      console.error('Main.tabs.createDuplicatePromptHandlers missing dependencies', details);
      throw new Error('createDuplicatePromptHandlers requires dom, workspaceState, and session.');
    }

    function hideDuplicatePrompt() {
      if (!dom.duplicatePrompt) return;
      dom.duplicatePrompt.setAttribute('hidden', 'hidden');
      if (dom.duplicateReuse) dom.duplicateReuse.onclick = null;
      if (dom.duplicateEmpty) dom.duplicateEmpty.onclick = null;
      if (dom.duplicateCancel) dom.duplicateCancel.onclick = null;
    }

    function getEmptyWorkspacePayload(type) {
      const config = workspaces?.[type];
      if (!config) {
        return null;
      }
      const cloneFn = session?.fastClonePayload || session?.clonePayload;
      if (domControls && typeof domControls.ensureDefaultPayload === 'function') {
        try {
          const defaults = domControls.ensureDefaultPayload(session, type, config);
          if (defaults) {
            const clonedDefaults = (typeof cloneFn === 'function')
              ? cloneFn.call(session, defaults)
              : JSON.parse(JSON.stringify(defaults));
            console.debug('Debug: duplicate prompt using workspace defaults', { type, hasPayload: !!clonedDefaults });
            return clonedDefaults;
          }
        } catch (err) {
          console.error('duplicate prompt workspace default resolution error', { type, err });
        }
      }
      console.debug('Debug: duplicate prompt empty payload deferred to workspace activation', { type });
      return null;
    }

    function showDuplicateDecision({ tab, type, sourceTab, canDuplicate }) {
      if (!canDuplicate) {
        console.debug('Debug: duplicate prompt bypassed', {
          tabId: tab?.id,
          type,
          hasSource: !!sourceTab
        });
        if (tab) {
          const emptyPayload = getEmptyWorkspacePayload(type);
          session.assignTabPayload(tab, emptyPayload, { reason: 'duplicate-bypass-clear' });
          tab.layoutState = null;
          tab.layoutSignature = null;
        }
        hideDuplicatePrompt();
        showWorkspaceForTab(tab);
        session.markSessionDirty('duplicate-bypass', { tabId: tab?.id || null, type });
        return;
      }
      if (!dom.duplicatePrompt || !dom.duplicateEmpty) {
        console.debug('Debug: duplicate prompt unavailable, applying fallback', { type, canDuplicate });
        const cloneFn = session.fastClonePayload || session.clonePayload;
        if (canDuplicate && sourceTab?.payload && typeof cloneFn === 'function') {
          const clonedPayload = cloneFn.call(session, sourceTab.payload);
          const clonedLayout = cloneFn.call(session, sourceTab.layoutState);
          session.assignTabPayload(tab, clonedPayload, { reason: 'duplicate-fallback-clone' });
          tab.layoutState = clonedLayout;
          tab.layoutSignature = session.serializePayloadSignature
            ? session.serializePayloadSignature(clonedLayout)
            : null;
        } else {
          const emptyPayload = getEmptyWorkspacePayload(type);
          session.assignTabPayload(tab, emptyPayload, { reason: 'duplicate-fallback-empty' });
          tab.layoutState = null;
          tab.layoutSignature = null;
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
      const cloneFn = session.fastClonePayload || session.clonePayload;
      dom.duplicateReuse.onclick = () => {
        const clonedPayload = (canDuplicate && sourceTab?.payload && typeof cloneFn === 'function')
          ? cloneFn.call(session, sourceTab.payload)
          : null;
        const clonedLayout = (canDuplicate && sourceTab?.layoutState && typeof cloneFn === 'function')
          ? cloneFn.call(session, sourceTab.layoutState)
          : null;
        if (clonedPayload) {
          session.assignTabPayload(tab, clonedPayload, { reason: 'duplicate-accept' });
        }
        tab.layoutState = clonedLayout;
        tab.layoutSignature = session.serializePayloadSignature
          ? session.serializePayloadSignature(clonedLayout)
          : null;
        hideDuplicatePrompt();
        showWorkspaceForTab(tab);
        session.markSessionDirty('duplicate-accepted', { tabId: tab.id, sourceId: sourceTab?.id || null, type });
      };
      dom.duplicateEmpty.onclick = () => {
        const emptyPayload = getEmptyWorkspacePayload(type);
        session.assignTabPayload(tab, emptyPayload, { reason: 'duplicate-empty' });
        tab.layoutState = null;
        tab.layoutSignature = null;
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

    return {
      hideDuplicatePrompt,
      showDuplicateDecision
    };
  };
})();
