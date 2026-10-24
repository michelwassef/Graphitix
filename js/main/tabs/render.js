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
    const isInteractionLocked = typeof options.isInteractionLocked === 'function'
      ? options.isInteractionLocked
      : () => false;
    const activateTab = typeof options.activateTab === 'function' ? options.activateTab : () => {};
    const applyTabDragClasses = typeof options.applyTabDragClasses === 'function'
      ? options.applyTabDragClasses
      : () => {};
    const dragHandlers = options.dragHandlers || {};
    let overflowObserver = null;

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

    function updateTabScrollControls() {
      if (!dom.tabsList) {
        return false;
      }
      const scrollLeft = dom.tabsList.scrollLeft;
      const maxScrollLeft = Math.max(0, dom.tabsList.scrollWidth - dom.tabsList.clientWidth);
      const hasOverflow = maxScrollLeft > 1;
      const controls = [dom.tabsScrollLeft, dom.tabsScrollRight].filter(Boolean);
      controls.forEach(button => {
        button.hidden = !hasOverflow;
      });
      if (dom.tabsScrollLeft) {
        dom.tabsScrollLeft.disabled = !hasOverflow || scrollLeft <= 1;
        dom.tabsScrollLeft.setAttribute('aria-disabled', dom.tabsScrollLeft.disabled ? 'true' : 'false');
      }
      if (dom.tabsScrollRight) {
        dom.tabsScrollRight.disabled = !hasOverflow || scrollLeft >= maxScrollLeft - 1;
        dom.tabsScrollRight.setAttribute('aria-disabled', dom.tabsScrollRight.disabled ? 'true' : 'false');
      }
      return hasOverflow;
    }

    function syncTabOverflowState() {
      if (!dom.tabsList) {
        return false;
      }
      const controls = [dom.tabsScrollLeft, dom.tabsScrollRight].filter(Boolean);
      dom.tabsList.classList.remove('is-overflowing');
      controls.forEach(button => { button.hidden = true; });
      const initiallyOverflowing = dom.tabsList.scrollWidth > dom.tabsList.clientWidth;
      if (!initiallyOverflowing) {
        updateTabScrollControls();
        return false;
      }
      dom.tabsList.classList.add('is-overflowing');
      controls.forEach(button => { button.hidden = false; });
      const hasOverflow = updateTabScrollControls();
      if (!hasOverflow) {
        dom.tabsList.classList.remove('is-overflowing');
        controls.forEach(button => { button.hidden = true; });
      }
      return hasOverflow;
    }

    function scrollTabsBy(direction) {
      if (!dom.tabsList) {
        return;
      }
      const firstTab = dom.tabsList.querySelector('.workspace-tab');
      const step = firstTab
        ? Math.max(firstTab.getBoundingClientRect().width * 2, 120)
        : Math.max(dom.tabsList.clientWidth * 0.8, 120);
      const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
      dom.tabsList.scrollBy({ left: direction * step, behavior });
    }

    function ensureTabVisible(tabButton) {
      if (!dom.tabsList || !tabButton) {
        return;
      }
      const listRect = dom.tabsList.getBoundingClientRect();
      const tabRect = tabButton.getBoundingClientRect();
      const inset = 4;
      if (tabRect.left < listRect.left + inset) {
        dom.tabsList.scrollBy({ left: tabRect.left - listRect.left - inset, behavior: 'auto' });
      } else if (tabRect.right > listRect.right - inset) {
        dom.tabsList.scrollBy({ left: tabRect.right - listRect.right + inset, behavior: 'auto' });
      }
    }

    function ensureActiveTabVisible() {
      ensureTabVisible(dom.tabsList?.querySelector('.workspace-tab.is-active'));
    }

    function handleTabListWheel(event) {
      if (!dom.tabsList || dom.tabsList.scrollWidth <= dom.tabsList.clientWidth) {
        return;
      }
      const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) {
        return;
      }
      event.preventDefault();
      dom.tabsList.scrollBy({ left: delta, behavior: 'auto' });
    }

    function handleTabListKeydown(event) {
      const tabButton = event.target?.closest?.('.workspace-tab[role="tab"]');
      if (!tabButton || tabButton.disabled) {
        return;
      }
      const buttons = Array.from(dom.tabsList.querySelectorAll('.workspace-tab[role="tab"]'));
      const currentIndex = buttons.indexOf(tabButton);
      let nextIndex = -1;
      if ((event.ctrlKey || event.metaKey)
        && event.shiftKey
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const tab = getTabById(tabButton.dataset.tabId);
        if (dragHandlers.handleTabKeyboardReorder?.(event, tab)) {
          return;
        }
      }
      if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      } else if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % buttons.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = buttons.length - 1;
      }
      if (nextIndex >= 0) {
        event.preventDefault();
        buttons.forEach((button, index) => { button.tabIndex = index === nextIndex ? 0 : -1; });
        buttons[nextIndex]?.focus({ preventScroll: true });
        ensureTabVisible(buttons[nextIndex]);
      } else if (event.key === 'F2' && !tabButton.classList.contains('is-welcome')) {
        event.preventDefault();
        beginRenameTab(tabButton.dataset.tabId);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const tabId = tabButton.dataset.tabId;
        if (tabId && tabId !== workspaceState.activeTabId) {
          activateTab(tabId);
        }
      }
    }

    function ensureTabScrollHandlers() {
      if (!dom.tabsList || dom.tabsList.dataset.scrollHandlersBound === 'true') {
        return;
      }
      dom.tabsList.dataset.scrollHandlersBound = 'true';
      dom.tabsList.addEventListener('wheel', handleTabListWheel, { passive: false });
      dom.tabsList.addEventListener('keydown', handleTabListKeydown);
      dom.tabsList.addEventListener('scroll', () => {
        updateTabScrollControls();
        updateRenameInputPosition();
      }, { passive: true });
      dom.tabsScrollLeft?.addEventListener('click', () => scrollTabsBy(-1));
      dom.tabsScrollRight?.addEventListener('click', () => scrollTabsBy(1));
      window.addEventListener('resize', updateRenameInputPosition);
    }

    function ensureTabOverflowObserver() {
      if (overflowObserver || !dom.tabsList || typeof ResizeObserver !== 'function') {
        return;
      }
      overflowObserver = new ResizeObserver(syncTabOverflowState);
      overflowObserver.observe(dom.tabsList);
    }

    function getTabElementId(tabId) {
      const codepoints = Array.from(String(tabId), character => character.codePointAt(0).toString(16));
      return `workspaceTab-${codepoints.join('-')}`;
    }

    function getPanelForTab(tab) {
      if (!tab || tab.isWelcome || !tab.type) {
        return dom.welcomeScreen;
      }
      return document.getElementById(`${tab.type}Page`)
        || Array.from(dom.workspacePages?.querySelectorAll('.workspace-page[data-plot]') || [])
          .find(panel => panel.dataset.plot === tab.type)
        || null;
    }

    function updateTabPanelRelationships(activeTab) {
      const panels = [dom.welcomeScreen, ...Array.from(dom.workspacePages?.querySelectorAll('.workspace-page') || [])]
        .filter(Boolean);
      panels.forEach(panel => panel.removeAttribute('aria-labelledby'));
      const activePanel = getPanelForTab(activeTab);
      const activeButton = activeTab
        ? Array.from(dom.tabsList.querySelectorAll('.workspace-tab[role="tab"]'))
          .find(button => button.dataset.tabId === activeTab.id)
        : null;
      if (activePanel && activeButton) {
        activePanel.setAttribute('aria-labelledby', activeButton.id);
      }
    }

    function updateRenameInputPosition() {
      const dock = dom.tabsList?.parentElement;
      const input = dock?.querySelector('.workspace-tab__rename');
      const tabButton = input
        ? Array.from(dom.tabsList.querySelectorAll('.workspace-tab[role="tab"]'))
          .find(button => button.dataset.tabId === input.dataset.renameTabId)
        : null;
      if (!input || !tabButton) {
        return;
      }
      const dockRect = dock.getBoundingClientRect();
      const tabRect = tabButton.getBoundingClientRect();
      input.style.left = `${tabRect.left - dockRect.left}px`;
      input.style.top = `${tabRect.top - dockRect.top}px`;
      input.style.width = `${tabRect.width}px`;
      input.style.height = `${tabRect.height}px`;
    }

    function renderTabs() {
      if (!dom.tabsList) return;
      const dock = dom.tabsList.parentElement;
      const displayedTabId = Main.workspacePresentation?.getDisplayedTabId(workspaceState) ?? workspaceState.activeTabId;
      const focusedElement = document.activeElement;
      const focusedTabId = focusedElement?.classList?.contains('workspace-tab__rename')
        ? focusedElement.dataset.renameTabId
        : focusedElement?.closest?.('#workspaceTabsList .workspace-tab[role="tab"]')?.dataset.tabId || null;
      const isRenaming = workspaceState.tabs.some(tab => tab.isRenaming);
      const rovingTabId = isRenaming
        ? null
        : (workspaceState.tabs.some(tab => tab.id === focusedTabId) ? focusedTabId : workspaceState.activeTabId);
      const interactionLocked = isInteractionLocked();
      if (typeof previews.hideTabPreviewTooltip === 'function') {
        previews.hideTabPreviewTooltip('render');
      }
      dom.tabsList.innerHTML = '';
      ensureTabScrollHandlers();
      workspaceState.tabs.forEach((tab, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'workspace-tab'
          + (tab.id === displayedTabId ? ' is-active' : '')
          + (tab.isWelcome ? ' is-welcome' : '')
          + (tab.isRenaming ? ' is-renaming' : '')
          + (tab.activationError ? ' has-activation-error' : '');
        btn.dataset.tabId = tab.id;
        btn.dataset.tabIndex = String(index);
        btn.id = getTabElementId(tab.id);
        if (tab.previewMarkup) {
          btn.dataset.hasPreview = 'true';
        } else {
          delete btn.dataset.hasPreview;
        }
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', tab.id === displayedTabId ? 'true' : 'false');
        btn.setAttribute('aria-controls', getPanelForTab(tab)?.id || 'welcomeScreen');
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-describedby', 'workspaceTabsKeyboardHint');
        const shortcuts = [
          'Control+Shift+ArrowLeft',
          'Control+Shift+ArrowRight',
          'Meta+Shift+ArrowLeft',
          'Meta+Shift+ArrowRight'
        ];
        if (!tab.isWelcome) shortcuts.unshift('F2');
        btn.setAttribute('aria-keyshortcuts', shortcuts.join(' '));
        btn.tabIndex = tab.id === rovingTabId ? 0 : -1;
        btn.disabled = interactionLocked;
        btn.setAttribute('aria-disabled', interactionLocked ? 'true' : 'false');
        btn.draggable = !interactionLocked && !tab.isRenaming;
        const displayTitle = tab.title || `Workspace ${index + 1}`;
        btn.addEventListener('click', event => {
          if (isInteractionLocked()) {
            event.preventDefault();
            return;
          }
          if (handleClickForRename(tab, event)) {
            return;
          }
          if (tab.id === workspaceState.activeTabId) {
            console.debug('Debug: active workspace tab click ignored', { tabId: tab.id });
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
            : 'Double-click or press F2 to rename this tab';
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
          let renameInput = Array.from(dock?.querySelectorAll('.workspace-tab__rename') || [])
            .find(input => input.dataset.renameTabId === tab.id);
          if (!renameInput) {
            renameInput = document.createElement('input');
            renameInput.type = 'text';
            renameInput.className = 'workspace-tab__rename';
            renameInput.value = displayTitle;
            renameInput.dataset.renameTabId = tab.id;
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
              } else if (key === ' ' || key === 'Spacebar' || key === 'Space') {
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
            dock?.appendChild(renameInput);
          }
        }

        dom.tabsList.appendChild(btn);

        if (tab.isRenaming && workspaceState.renameFocusId === tab.id) {
          requestAnimationFrame(() => {
            const input = Array.from(dock?.querySelectorAll('.workspace-tab__rename') || [])
              .find(node => node.dataset.renameTabId === tab.id);
            if (input) {
              input.focus();
              input.select();
            }
            workspaceState.renameFocusId = null;
          });
        }
      });
      Array.from(dock?.querySelectorAll('.workspace-tab__rename') || []).forEach(input => {
        if (!workspaceState.tabs.some(tab => tab.id === input.dataset.renameTabId && tab.isRenaming)) {
          input.remove();
        }
      });
      updateRenameInputPosition();
      updateTabPanelRelationships(workspaceState.tabs.find(tab => tab.id === workspaceState.activeTabId) || null);
      dom.tabsList.classList.toggle('is-document-operation-locked', interactionLocked);
      applyTabDragClasses();
      syncTabOverflowState();
      ensureTabOverflowObserver();
      const refreshActiveTabVisibility = () => {
        ensureActiveTabVisible();
        updateTabScrollControls();
        updateRenameInputPosition();
        if (focusedTabId && !workspaceState.tabs.some(tab => tab.id === focusedTabId && tab.isRenaming)) {
          const focusedTab = Array.from(dom.tabsList.querySelectorAll('.workspace-tab[role="tab"]'))
            .find(button => button.dataset.tabId === focusedTabId);
          focusedTab?.focus({ preventScroll: true });
        }
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(refreshActiveTabVisibility);
      } else {
        refreshActiveTabVisibility();
      }
    }

    return {
      renderTabs,
      beginRenameTab,
      commitTabRename,
      cancelTabRename
    };
  };
})();
