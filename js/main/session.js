(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const namespace = Main.session = Main.session || {};

  const workspaceState = namespace.workspaceState || {
    tabs: [],
    activeTabId: null,
    nextId: 1,
    pendingDuplicateSource: null,
    lastActiveGraphId: null,
    renameFocusId: null,
    pendingClosePrompt: null,
    sessionFileHandle: null,
    sessionFileName: '',
    sessionDirty: false,
    draggingTabId: null,
    dragStartIndex: null,
    dragOverTabId: null,
    dragInsertBefore: true
  };
  namespace.workspaceState = workspaceState;
  console.debug('Debug: session workspaceState initialized', { tabCount: workspaceState.tabs.length });

  function markSessionDirty(reason, details) {
    const wasDirty = workspaceState.sessionDirty;
    workspaceState.sessionDirty = true;
    console.debug('Debug: session dirty flag updated', {
      reason: reason || 'unspecified',
      wasDirty,
      details: details || null
    });
  }

  function clearSessionDirty(reason) {
    const wasDirty = workspaceState.sessionDirty;
    workspaceState.sessionDirty = false;
    console.debug('Debug: session dirty flag cleared', {
      reason: reason || 'unspecified',
      wasDirty
    });
  }

  function clonePayload(payload) {
    if (!payload) return null;
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch (err) {
      console.error('clonePayload error', err);
      return null;
    }
  }

  function serializePayloadSignature(value) {
    if (value === undefined || value === null) {
      return null;
    }
    try {
      return JSON.stringify(value);
    } catch (err) {
      console.error('serializePayloadSignature error', err);
      return `error:${Date.now()}`;
    }
  }

  function notifyPreviewIndicator(tab) {
    const previews = Main.previews;
    if (previews && typeof previews.syncTabPreviewIndicator === 'function') {
      previews.syncTabPreviewIndicator(tab);
    }
  }

  function assignTabPayload(tab, payload, meta = {}) {
    if (!tab) {
      console.debug('Debug: assignTabPayload skipped', { reason: 'no-tab', meta });
      return false;
    }
    const previousSignature = tab.payloadSignature || null;
    const nextSignature = serializePayloadSignature(payload);
    tab.payload = payload || null;
    tab.payloadSignature = nextSignature;
    if (!payload) {
      tab.previewMarkup = null;
      tab.previewSignature = null;
      tab.previewMeta = null;
      notifyPreviewIndicator(tab);
      console.debug('Debug: preview cleared via assignTabPayload', { tabId: tab.id, reason: meta.reason || 'payload-null' });
    }
    const changed = previousSignature !== nextSignature;
    console.debug('Debug: assignTabPayload applied', {
      tabId: tab.id,
      reason: meta.reason || 'unspecified',
      changed,
      hasPayload: !!payload
    });
    return changed;
  }

  function hasMeaningfulCellValue(value, seen = new Set()) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'number') {
      return !Number.isNaN(value);
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    if (typeof value === 'boolean') {
      return true;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) {
        console.debug('Debug: hasMeaningfulCellValue detected circular array reference');
        return false;
      }
      seen.add(value);
      return value.some(item => hasMeaningfulCellValue(item, seen));
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        console.debug('Debug: hasMeaningfulCellValue detected circular object reference');
        return false;
      }
      seen.add(value);
      const keys = Object.keys(value);
      if (!keys.length) {
        return false;
      }
      return keys.some(key => hasMeaningfulCellValue(value[key], seen));
    }
    return true;
  }

  function tabHasTableData(tab) {
    const tabId = tab?.id || null;
    if (!tab || !tab.payload) {
      console.debug('Debug: tab data inspection skipped', { tabId, reason: 'no-tab-or-payload' });
      return false;
    }
    const matrix = tab.payload.data;
    if (Array.isArray(matrix)) {
      let rowCount = 0;
      let colCount = 0;
      for (let r = 0; r < matrix.length; r++) {
        const row = matrix[r];
        if (!Array.isArray(row)) {
          continue;
        }
        rowCount += 1;
        colCount = Math.max(colCount, row.length);
        for (let c = 0; c < row.length; c++) {
          if (hasMeaningfulCellValue(row[c])) {
            console.debug('Debug: tab data detected', { tabId, rowIndex: r, colIndex: c });
            return true;
          }
        }
      }
      console.debug('Debug: tab data inspection complete', { tabId, rowsChecked: rowCount, colsChecked: colCount, found: false });
      return false;
    }
    if (matrix && typeof matrix === 'object') {
      const keys = Object.keys(matrix);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (hasMeaningfulCellValue(matrix[key])) {
          console.debug('Debug: tab object data detected', { tabId, key });
          return true;
        }
      }
      console.debug('Debug: tab object data inspection complete', { tabId, keysChecked: keys.length });
      return false;
    }
    console.debug('Debug: tab data inspection skipped', { tabId, reason: 'unrecognized-data-structure', type: typeof matrix });
    return false;
  }

  function graphTabsHaveData() {
    return workspaceState.tabs.some(tab => !tab.isWelcome && tab.type && tabHasTableData(tab));
  }

  namespace.workspaceState = workspaceState;
  namespace.markSessionDirty = markSessionDirty;
  namespace.clearSessionDirty = clearSessionDirty;
  namespace.clonePayload = clonePayload;
  namespace.serializePayloadSignature = serializePayloadSignature;
  namespace.assignTabPayload = assignTabPayload;
  namespace.hasMeaningfulCellValue = hasMeaningfulCellValue;
  namespace.tabHasTableData = tabHasTableData;
  namespace.graphTabsHaveData = graphTabsHaveData;
  console.debug('Debug: Main session module initialized', { exportedHelpers: Object.keys(namespace) });
})();
