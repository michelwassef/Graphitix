(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.tabs = Main.tabs || {};
  console.debug('Debug: Main.tabs render helpers module initializing', { module: 'js/main/tabs/render.js' });

  namespace.createRenderHelpers = function createRenderHelpers(options = {}) {
    const dom = options.dom;
    const previews = options.previews || {};
    const workspaceState = options.workspaceState;
    const session = options.session;
    const getTabById = options.getTabById;
    const activateTab = typeof options.activateTab === 'function' ? options.activateTab : () => {};
    const applyTabDragClasses = typeof options.applyTabDragClasses === 'function'
      ? options.applyTabDragClasses
      : () => {};
    const dragHandlers = options.dragHandlers || {};

    if (!dom || !workspaceState || !session || typeof getTabById !== 'function') {
      const details = {
        hasDom: !!dom,
        hasWorkspaceState: !!workspaceState,
        hasSession: !!session,
        hasGetTabById: typeof getTabById === 'function'
      };
      console.error('Main.tabs.createRenderHelpers missing dependencies', details);
      throw new Error('createRenderHelpers requires dom, workspaceState, session, and getTabById.');
    }

    console.debug('Debug: Main.tabs.createRenderHelpers invoked', {
      hasTabsList: !!dom.tabsList,
      tabCount: workspaceState.tabs?.length || 0
    });

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
      let proposedTitle = trimmed;
      if (!trimmed) {
        if (tab.title) {
          proposedTitle = tab.title;
        } else {
          const tabIndex = workspaceState.tabs.indexOf(tab);
          proposedTitle = `Workspace ${tabIndex >= 0 ? tabIndex + 1 : ''}`.trim() || 'Workspace';
          console.debug('Debug: tab rename fallback applied', { tabId, fallbackTitle: proposedTitle });
        }
      }
      if (typeof session.generateUniqueTabTitle === 'function') {
        proposedTitle = session.generateUniqueTabTitle(proposedTitle, { excludeTabId: tab.id });
      }
      tab.title = proposedTitle;
      console.debug('Debug: tab rename unique title resolved', {
        tabId,
        previousTitle,
        nextTitle: tab.title,
        providedTitle: trimmed
      });
      tab.isRenaming = false;
      workspaceState.renameFocusId = null;
      renderTabs();
      if (tab.title !== previousTitle) {
        session.markSessionDirty('tab-renamed', { tabId, previousTitle, nextTitle: tab.title, origin: 'user' });
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

    const renameDoubleClickState = {
      lastTabId: null,
      lastTimestamp: 0
    };
    const RENAME_DOUBLE_CLICK_THRESHOLD_MS = 380;

    function getNowMs() {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    }

    function shouldSuppressRenameTarget(target) {
      if (!target || typeof target.closest !== 'function') return false;
      if (target.closest('.workspace-tab__close')) return true;
      if (target.closest('.workspace-tab__rename')) return true;
      return false;
    }

    function resetRenameDoubleClickState() {
      renameDoubleClickState.lastTabId = null;
      renameDoubleClickState.lastTimestamp = 0;
    }

    function triggerTabRename(tab, event, meta = {}) {
      if (!tab || tab.isWelcome || tab.isRenaming) {
        return false;
      }
      if (event) {
        if (shouldSuppressRenameTarget(event.target)) {
          return false;
        }
        event.preventDefault();
        event.stopPropagation();
      }
      resetRenameDoubleClickState();
      if (window.Shared?.isDebugEnabled?.()) {
        console.debug('Debug: workspace tab rename trigger', {
          tabId: tab.id,
          reason: meta.reason || 'unknown',
          targetClass: event?.target && event.target.className || '',
          source: meta.source || 'direct'
        });
      }
      beginRenameTab(tab.id);
      return true;
    }

    function handleClickForRename(tab, event) {
      if (!tab || tab.isWelcome || tab.isRenaming) {
        return false;
      }
      const now = getNowMs();
      const lastId = renameDoubleClickState.lastTabId;
      const lastTimestamp = renameDoubleClickState.lastTimestamp;
      renameDoubleClickState.lastTabId = tab.id;
      renameDoubleClickState.lastTimestamp = now;
      if (lastId !== tab.id) {
        return false;
      }
      if ((now - lastTimestamp) > RENAME_DOUBLE_CLICK_THRESHOLD_MS) {
        return false;
      }
      if (event?.metaKey || event?.ctrlKey || event?.altKey || event?.shiftKey) {
        return false;
      }
      if (shouldSuppressRenameTarget(event?.target || null)) {
        return false;
      }
      return triggerTabRename(tab, event, { reason: 'synthetic-double-click', source: 'click-handler' });
    }

    function renderTabs() {
      if (!dom.tabsList) return;
      if (typeof previews.hideTabPreviewTooltip === 'function') {
        previews.hideTabPreviewTooltip('render');
      }
      dom.tabsList.innerHTML = '';
      workspaceState.tabs.forEach((tab, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'workspace-tab'
          + (tab.id === workspaceState.activeTabId ? ' is-active' : '')
          + (tab.isWelcome ? ' is-welcome' : '')
          + (tab.isRenaming ? ' is-renaming' : '')
          + (tab.activationError ? ' has-activation-error' : '');
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
        btn.addEventListener('click', event => {
          if (handleClickForRename(tab, event)) {
            return;
          }
          console.debug('Debug: workspace tab selected', { tabId: tab.id });
          activateTab(tab.id);
        });
        if (typeof dragHandlers.handleTabDragStart === 'function') {
          btn.addEventListener('dragstart', event => dragHandlers.handleTabDragStart(event, tab));
        }
        if (typeof dragHandlers.handleTabDragEnd === 'function') {
          btn.addEventListener('dragend', event => dragHandlers.handleTabDragEnd(event, tab));
        }
        if (typeof dragHandlers.handleTabDragOver === 'function') {
          btn.addEventListener('dragover', event => dragHandlers.handleTabDragOver(event, tab));
        }
        if (typeof dragHandlers.handleTabDragLeave === 'function') {
          btn.addEventListener('dragleave', event => dragHandlers.handleTabDragLeave(event, tab));
        }
        if (typeof dragHandlers.handleTabDrop === 'function') {
          btn.addEventListener('drop', event => dragHandlers.handleTabDrop(event, tab));
        }
        if (typeof previews.handleTabPreviewEnter === 'function') {
          btn.addEventListener('mouseenter', event => previews.handleTabPreviewEnter(event, tab));
        }
        if (typeof previews.handleTabPreviewLeave === 'function') {
          btn.addEventListener('mouseleave', () => previews.handleTabPreviewLeave('leave'));
          btn.addEventListener('blur', () => previews.handleTabPreviewLeave('blur'));
        }

        const label = document.createElement('span');
        label.className = 'workspace-tab__label';
        label.textContent = displayTitle;
        const handleRenameDoubleClick = event => {
          triggerTabRename(tab, event, { reason: 'native-dblclick', source: 'dblclick-handler' });
        };
        if (!tab.isWelcome) {
          label.title = tab.activationError
            ? `Activation issue: ${tab.activationError.message || tab.activationError.reason || 'Unable to fully restore this tab'}`
            : 'Double-click to rename this tab';
          label.addEventListener('dblclick', handleRenameDoubleClick);
          btn.addEventListener('dblclick', handleRenameDoubleClick);
        }
        btn.appendChild(label);

        if (tab.activationError && !tab.isWelcome) {
          const errorBadge = document.createElement('span');
          errorBadge.className = 'workspace-tab__activation-error';
          errorBadge.textContent = '!';
          errorBadge.title = tab.activationError.message || tab.activationError.reason || 'Workspace activation issue';
          errorBadge.setAttribute('aria-label', errorBadge.title);
          btn.appendChild(errorBadge);
        }

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
            if (typeof dragHandlers.closeTab === 'function') {
              dragHandlers.closeTab(tab.id);
            }
          });
          closeEl.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
              event.preventDefault();
              if (typeof dragHandlers.closeTab === 'function') {
                dragHandlers.closeTab(tab.id);
              }
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

    return {
      renderTabs,
      beginRenameTab,
      commitTabRename,
      cancelTabRename
    };
  };
})();
