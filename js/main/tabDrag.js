(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const namespace = Main.tabDrag = Main.tabDrag || {};

  namespace.applyTabDragClasses = function applyTabDragClasses(context) {
    const { dom, workspaceState } = context || {};
    if (!dom?.tabsList || !workspaceState) {
      return;
    }
    const draggingId = workspaceState.draggingTabId;
    const overId = workspaceState.dragOverTabId;
    const insertBefore = workspaceState.dragInsertBefore;
    dom.tabsList.querySelectorAll('.workspace-tab').forEach(btn => {
      const tabId = btn.dataset.tabId;
      btn.classList.toggle('is-dragging', tabId === draggingId);
      btn.classList.toggle('is-drag-over-before', tabId === overId && insertBefore);
      btn.classList.toggle('is-drag-over-after', tabId === overId && !insertBefore);
    });
    dom.tabsList.classList.toggle('is-drag-active', !!draggingId);
    dom.tabsList.classList.toggle('is-drag-over-end', !!draggingId && !overId);
  };

  namespace.updateTabDragHover = function updateTabDragHover(context, targetTabId, insertBefore, meta = {}) {
    const { workspaceState } = context || {};
    if (!workspaceState) return;
    if (workspaceState.dragOverTabId === targetTabId && workspaceState.dragInsertBefore === insertBefore) {
      return;
    }
    workspaceState.dragOverTabId = targetTabId;
    workspaceState.dragInsertBefore = insertBefore;
    namespace.applyTabDragClasses(context);
    console.debug('Debug: workspace tab drag hover updated', {
      targetTabId: targetTabId || null,
      insertBefore,
      reason: meta.reason || 'unspecified'
    });
  };

  namespace.resetTabDragState = function resetTabDragState(context, reason) {
    const { workspaceState } = context || {};
    if (!workspaceState) return;
    const hadDrag = !!(workspaceState.draggingTabId || workspaceState.dragOverTabId);
    const snapshot = hadDrag ? {
      draggingTabId: workspaceState.draggingTabId,
      dragOverTabId: workspaceState.dragOverTabId,
      dragInsertBefore: workspaceState.dragInsertBefore,
      dragStartIndex: workspaceState.dragStartIndex
    } : null;
    workspaceState.draggingTabId = null;
    workspaceState.dragStartIndex = null;
    workspaceState.dragOverTabId = null;
    workspaceState.dragInsertBefore = true;
    namespace.applyTabDragClasses(context);
    if (hadDrag) {
      console.debug('Debug: workspace tab drag state reset', {
        ...(snapshot || {}),
        reason: reason || 'unspecified'
      });
    }
  };

  namespace.moveWorkspaceTab = function moveWorkspaceTab(context, tabId, targetIndex) {
    const { workspaceState } = context || {};
    const tabs = workspaceState?.tabs;
    if (!Array.isArray(tabs)) {
      return { moved: false, fromIndex: -1, toIndex: -1 };
    }
    const fromIndex = tabs.findIndex(item => item.id === tabId);
    if (fromIndex === -1) {
      console.debug('Debug: moveWorkspaceTab skipped', { tabId, targetIndex, reason: 'missing-source' });
      return { moved: false, fromIndex: -1, toIndex: -1 };
    }
    let desiredIndex = Number.isFinite(targetIndex) ? targetIndex : tabs.length;
    desiredIndex = Math.max(0, Math.min(desiredIndex, tabs.length));
    const [movedTab] = tabs.splice(fromIndex, 1);
    let finalIndex = desiredIndex;
    if (finalIndex > fromIndex) {
      finalIndex -= 1;
    }
    tabs.splice(finalIndex, 0, movedTab);
    const moved = fromIndex !== finalIndex;
    console.debug('Debug: moveWorkspaceTab executed', {
      tabId,
      fromIndex,
      requestedIndex: targetIndex,
      finalIndex,
      moved
    });
    return { moved, fromIndex, toIndex: finalIndex };
  };

  namespace.handleTabDragStart = function handleTabDragStart(context, event, tab) {
    const { workspaceState } = context || {};
    if (!workspaceState || !tab || tab.isRenaming) {
      if (!tab) {
        console.debug('Debug: tab drag start skipped', { reason: 'missing-tab' });
      }
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      return;
    }
    const startIndex = workspaceState.tabs.indexOf(tab);
    workspaceState.draggingTabId = tab.id;
    workspaceState.dragStartIndex = startIndex;
    workspaceState.dragOverTabId = null;
    workspaceState.dragInsertBefore = true;
    if (event?.dataTransfer) {
      try {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.id);
      } catch (transferErr) {
        console.debug('Debug: tab drag dataTransfer setData failed', { error: transferErr?.message || transferErr });
      }
    }
    namespace.applyTabDragClasses(context);
    console.debug('Debug: workspace tab drag started', {
      tabId: tab.id,
      startIndex
    });
  };

  namespace.handleTabDragEnd = function handleTabDragEnd(context, event, tab) {
    if (event?.dataTransfer) {
      try {
        event.dataTransfer.dropEffect = 'none';
      } catch (transferErr) {
        console.debug('Debug: tab drag end dropEffect clear failed', { error: transferErr?.message || transferErr });
      }
    }
    namespace.resetTabDragState(context, 'dragend');
    if (tab) {
      console.debug('Debug: workspace tab drag ended', { tabId: tab.id });
    }
  };

  namespace.handleTabDragOver = function handleTabDragOver(context, event, tab) {
    const { workspaceState } = context || {};
    if (!workspaceState?.draggingTabId) {
      return;
    }
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (!tab) {
      return;
    }
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    let insertBefore = true;
    if (rect && typeof rect.width === 'number') {
      const midpoint = rect.left + (rect.width / 2);
      const clientX = typeof event?.clientX === 'number' ? event.clientX : midpoint;
      insertBefore = clientX <= midpoint;
    }
    namespace.updateTabDragHover(context, tab.id, insertBefore, { reason: 'dragover' });
  };

  namespace.handleTabDragLeave = function handleTabDragLeave(context, event, tab) {
    const { workspaceState } = context || {};
    if (!workspaceState?.draggingTabId || !tab) {
      return;
    }
    const related = event?.relatedTarget || null;
    const currentTarget = event?.currentTarget || null;
    if (currentTarget && related && currentTarget.contains(related)) {
      return;
    }
    if (workspaceState.dragOverTabId === tab.id) {
      namespace.updateTabDragHover(context, null, false, { reason: 'dragleave' });
    }
  };

  namespace.handleTabDrop = function handleTabDrop(context, event, tab) {
    const { workspaceState, renderTabs, markSessionDirty } = context || {};
    if (!workspaceState?.draggingTabId || !tab) {
      return;
    }
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    let insertBefore = true;
    if (rect && typeof rect.width === 'number') {
      const midpoint = rect.left + (rect.width / 2);
      const clientX = typeof event?.clientX === 'number' ? event.clientX : midpoint;
      insertBefore = clientX <= midpoint;
    }
    const targetIndex = workspaceState.tabs.findIndex(item => item.id === tab.id);
    const desiredIndex = insertBefore ? targetIndex : targetIndex + 1;
    const moveResult = namespace.moveWorkspaceTab(context, workspaceState.draggingTabId, desiredIndex);
    const dropReason = insertBefore ? 'drop-before' : 'drop-after';
    namespace.resetTabDragState(context, dropReason);
    renderTabs?.();
    if (moveResult.moved) {
      const order = workspaceState.tabs.map(item => item.id);
      markSessionDirty?.('tabs-reordered', {
        reason: dropReason,
        fromIndex: moveResult.fromIndex,
        toIndex: moveResult.toIndex,
        order
      });
      console.debug('Debug: workspace tabs reordered', {
        reason: dropReason,
        fromIndex: moveResult.fromIndex,
        toIndex: moveResult.toIndex,
        order
      });
    } else {
      console.debug('Debug: workspace tab drop without movement', {
        reason: dropReason,
        fromIndex: moveResult.fromIndex,
        targetIndex
      });
    }
  };

  namespace.handleTabListDragOver = function handleTabListDragOver(context, event) {
    const { workspaceState, dom } = context || {};
    if (!workspaceState?.draggingTabId || !dom?.tabsList) {
      return;
    }
    if (event?.currentTarget !== dom.tabsList || event.target !== dom.tabsList) {
      return;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    namespace.updateTabDragHover(context, null, false, { reason: 'list-dragover' });
  };

  namespace.handleTabListDrop = function handleTabListDrop(context, event) {
    const { workspaceState, dom, renderTabs, markSessionDirty } = context || {};
    if (!workspaceState?.draggingTabId || !dom?.tabsList) {
      return;
    }
    if (event?.currentTarget !== dom.tabsList || event.target !== dom.tabsList) {
      return;
    }
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    const moveResult = namespace.moveWorkspaceTab(context, workspaceState.draggingTabId, workspaceState.tabs.length);
    namespace.resetTabDragState(context, 'drop-end');
    renderTabs?.();
    if (moveResult.moved) {
      const order = workspaceState.tabs.map(item => item.id);
      markSessionDirty?.('tabs-reordered', {
        reason: 'drop-end',
        fromIndex: moveResult.fromIndex,
        toIndex: moveResult.toIndex,
        order
      });
      console.debug('Debug: workspace tabs reordered to end', {
        reason: 'drop-end',
        fromIndex: moveResult.fromIndex,
        toIndex: moveResult.toIndex,
        order
      });
    } else {
      console.debug('Debug: workspace tab drop end without movement', {
        reason: 'drop-end',
        fromIndex: moveResult.fromIndex
      });
    }
  };

  namespace.handleTabListDragLeave = function handleTabListDragLeave(context, event) {
    const { workspaceState, dom } = context || {};
    if (!workspaceState?.draggingTabId || !dom?.tabsList) {
      return;
    }
    if (event?.currentTarget !== dom.tabsList) {
      return;
    }
    const related = event?.relatedTarget || null;
    if (related && dom.tabsList.contains(related)) {
      return;
    }
    namespace.updateTabDragHover(context, null, false, { reason: 'list-dragleave' });
  };

  console.debug('Debug: tabDrag.js wiring complete', { exports: Object.keys(namespace) });
})();
