(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const namespace = Main.session = Main.session || {};

  /**
   * @typedef {Object} WorkspaceTab
   * @property {string} id Unique identifier for the tab.
   * @property {string} title Display title shown in the tab list.
   * @property {string|null} [type] Workspace type slug used to resolve component behavior.
   * @property {*} [payload] Serialized component payload used when restoring the workspace.
   * @property {string|null} [payloadSignature] Cached signature of the payload for fast comparisons.
   * @property {string|null} [duplicateSource] Optional source tab identifier when duplicating.
   * @property {boolean} [isWelcome] Flag indicating the tab is the static welcome screen.
   * @property {boolean} [allowClose] Whether the tab can be closed by the user.
   * @property {boolean} [isRenaming] True when the inline rename UI is active.
   * @property {string|null} [previewMarkup] Cached HTML preview string for quick hover previews.
   * @property {string|null} [previewSignature] Signature used to detect preview changes.
   * @property {Object|null} [previewMeta] Metadata captured when generating previews.
   * @property {Object|null} [layoutState] Serialized panel/layout sizing information.
   * @property {string|null} [layoutSignature] Cached signature of the layout state.
   */

  /**
   * @typedef {Object} WorkspaceState
   * @property {WorkspaceTab[]} tabs Ordered list of workspace tabs.
   * @property {string|null} activeTabId Identifier of the currently active tab.
   * @property {number} nextId Incrementing counter used when generating tab IDs.
   * @property {string|null} pendingDuplicateSource Tab ID staged for duplication confirmation.
   * @property {string|null} lastActiveGraphId Last non-welcome tab viewed by the user.
   * @property {string|null} renameFocusId Tab ID requesting focus after rename toggles.
   * @property {Object|null} pendingClosePrompt Tracks the state for unsaved-close prompts.
   * @property {FileSystemFileHandle|Object|null} sessionFileHandle Handle returned by the File System Access API.
   * @property {string} sessionFileName Friendly name of the current session file.
   * @property {'tab'|'workspace'|null} sessionFileScope Scope of the last saved/opened `.graph` archive.
   * @property {boolean} sessionDirty True when the in-memory session differs from disk.
   * @property {string|null} draggingTabId Tab currently being dragged in the UI.
   * @property {number|null} dragStartIndex Starting index for the active drag operation.
   * @property {string|null} dragOverTabId Tab currently hovered while dragging.
   * @property {boolean} dragInsertBefore Whether the drop marker appears before the hovered tab.
   */

  const workspaceState = namespace.workspaceState || {
    tabs: [],
    activeTabId: null,
    nextId: 1,
    pendingDuplicateSource: null,
    lastActiveGraphId: null,
    loadedWorkspaces: {},
    renderedWorkspaceByType: {},
    renameFocusId: null,
    pendingClosePrompt: null,
    sessionFileHandle: null,
    sessionFileName: '',
    sessionFileScope: null,
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

  const nativeStructuredClone = typeof window.structuredClone === 'function'
    ? window.structuredClone.bind(window)
    : (typeof structuredClone === 'function' ? structuredClone : null);

  function fastClonePayload(value, meta = {}) {
    if (value === null || typeof value !== 'object') {
      if (meta) {
        meta.method = 'identity';
      }
      return value;
    }
    const targetType = Array.isArray(value)
      ? 'array'
      : (value?.constructor && value.constructor.name) || typeof value;
    if (nativeStructuredClone) {
      try {
        const structuredResult = nativeStructuredClone(value);
        if (meta) {
          meta.method = 'structuredClone';
          meta.type = targetType;
        }
        console.debug('Debug: fastClonePayload using structuredClone', { type: targetType });
        return structuredResult;
      } catch (err) {
        console.debug('Debug: fastClonePayload structuredClone fallback', { type: targetType, err });
      }
    }
    const state = { circular: false };
    const clone = cloneValue(value, new WeakMap(), state);
    if (meta) {
      meta.method = 'fallback';
      meta.type = targetType;
      meta.circular = state.circular;
    }
    console.debug('Debug: fastClonePayload using fallback clone', {
      type: targetType,
      circularDetected: state.circular
    });
    return clone;
  }

  function cloneValue(value, seen, state) {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      state.circular = true;
      console.debug('Debug: fastClonePayload circular reference detected');
      return null;
    }
    if (value instanceof Date) {
      return new Date(value.getTime());
    }
    if (value instanceof RegExp) {
      return new RegExp(value.source, value.flags);
    }
    if (value instanceof ArrayBuffer) {
      return value.slice(0);
    }
    if (ArrayBuffer.isView(value)) {
      if (typeof DataView !== 'undefined' && value instanceof DataView) {
        const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        return new DataView(buffer);
      }
      const Ctor = value.constructor;
      try {
        return new Ctor(value);
      } catch (err) {
        console.debug('Debug: fastClonePayload typed array clone fallback', {
          type: value.constructor?.name || 'typed-array',
          err
        });
        const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        return new Ctor(buffer);
      }
    }
    if (Array.isArray(value)) {
      const result = new Array(value.length);
      seen.set(value, result);
      for (let i = 0; i < value.length; i++) {
        result[i] = cloneValue(value[i], seen, state);
      }
      seen.delete(value);
      return result;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      console.debug('Debug: fastClonePayload unsupported prototype clone passthrough', {
        type: value.constructor?.name || 'object'
      });
      return value;
    }
    const clone = {};
    seen.set(value, clone);
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      clone[key] = cloneValue(value[key], seen, state);
    }
    seen.delete(value);
    return clone;
  }

  function clonePayload(payload) {
    if (!payload) return null;
    try {
      const meta = {};
      const cloned = fastClonePayload(payload, meta);
      console.debug('Debug: clonePayload completed', meta);
      return cloned;
    } catch (err) {
      console.error('clonePayload error', err);
      return null;
    }
  }

  function mixHash(hash, value) {
    return Math.imul(hash ^ value, 16777619) >>> 0;
  }

  function hashString(hash, str = '') {
    let next = hash;
    for (let i = 0; i < str.length; i++) {
      next = mixHash(next, str.charCodeAt(i));
    }
    return mixHash(next, 0x9e);
  }

  const hashNumberFloat = new Float64Array(1);
  const hashNumberBytes = new Uint8Array(hashNumberFloat.buffer);

  function hashNumber(hash, value) {
    if (!Number.isFinite(value)) {
      if (Number.isNaN(value)) {
        return mixHash(hash, 0x4f);
      }
      return mixHash(hash, value > 0 ? 0x4a : 0x4b);
    }
    if (Number.isInteger(value) && value <= 0x7fffffff && value >= -0x80000000) {
      return mixHash(hash, value | 0);
    }
    hashNumberFloat[0] = value;
    let next = hash;
    for (let i = 0; i < hashNumberBytes.length; i++) {
      next = mixHash(next, hashNumberBytes[i]);
    }
    return next;
  }

  function hashTypedArray(hash, view) {
    const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let next = mixHash(hash, 0x27);
    for (let i = 0; i < buffer.length; i++) {
      next = mixHash(next, buffer[i]);
    }
    next = mixHash(next, buffer.length & 0xff);
    return mixHash(next, (view.BYTES_PER_ELEMENT || 1) & 0xff);
  }

  function hashPayloadValue(value, hash, seen) {
    if (value === null) {
      return mixHash(hash, 0x11);
    }
    const type = typeof value;
    if (type === 'undefined') {
      return mixHash(hash, 0x12);
    }
    if (type === 'boolean') {
      return mixHash(hash, value ? 0x13 : 0x14);
    }
    if (type === 'number') {
      return hashNumber(mixHash(hash, 0x15), value);
    }
    if (type === 'string') {
      return hashString(mixHash(hash, 0x16), value);
    }
    if (type === 'bigint') {
      return hashString(mixHash(hash, 0x17), value.toString());
    }
    if (type === 'symbol') {
      return hashString(mixHash(hash, 0x18), value.description || value.toString());
    }
    if (type === 'function') {
      return hashString(mixHash(hash, 0x19), value.name || 'anonymous');
    }
    if (seen.has(value)) {
      return mixHash(hash, 0x1a);
    }
    seen.set(value, true);
    let next = hash;
    if (Array.isArray(value)) {
      next = mixHash(next, 0x21);
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (item === null) {
          next = mixHash(next, 0x35);
          continue;
        }
        const itemType = typeof item;
        if (itemType === 'number') {
          next = hashNumber(mixHash(next, 0x31), item);
        } else if (itemType === 'string') {
          next = hashString(mixHash(next, 0x32), item);
        } else if (itemType === 'boolean') {
          next = mixHash(next, item ? 0x33 : 0x34);
        } else if (itemType === 'undefined') {
          next = mixHash(next, 0x36);
        } else {
          next = hashPayloadValue(item, next, seen);
        }
      }
      next = mixHash(next, value.length & 0xff);
    } else if (value instanceof Date) {
      next = hashNumber(mixHash(next, 0x22), value.getTime());
    } else if (value instanceof RegExp) {
      next = hashString(mixHash(next, 0x23), `${value.source}/${value.flags}`);
    } else if (value instanceof ArrayBuffer) {
      next = hashTypedArray(mixHash(next, 0x24), new Uint8Array(value));
    } else if (ArrayBuffer.isView(value)) {
      next = hashTypedArray(mixHash(next, 0x25), value);
    } else {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        next = hashString(mixHash(next, 0x26), proto.constructor?.name || 'custom');
      } else {
        next = mixHash(next, 0x28);
      }
      const keys = Object.keys(value).sort();
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        next = hashString(next, key);
        next = hashPayloadValue(value[key], next, seen);
      }
      next = mixHash(next, keys.length & 0xff);
    }
    seen.delete(value);
    return next;
  }

  function serializePayloadSignature(value) {
    if (value === undefined || value === null) {
      return null;
    }
    const isBinary = value instanceof ArrayBuffer || ArrayBuffer.isView(value);
    if (!isBinary) {
      try {
        const serialized = JSON.stringify(value);
        console.debug('Debug: serializePayloadSignature computed', {
          method: 'json',
          length: serialized?.length || 0
        });
        return serialized;
      } catch (err) {
        console.debug('Debug: serializePayloadSignature json fallback engaged', { err });
      }
    }
    try {
      const hash = hashPayloadValue(value, 2166136261, new WeakMap()) >>> 0;
      const signature = `h1:${hash.toString(16).padStart(8, '0')}`;
      console.debug('Debug: serializePayloadSignature computed', {
        method: isBinary ? 'hash-binary' : 'hash-fallback',
        signature
      });
      return signature;
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
      tab.renderCache = null;
      tab.renderCacheSignature = null;
      tab.renderCacheLayoutSignature = null;
      notifyPreviewIndicator(tab);
      console.debug('Debug: preview cleared via assignTabPayload', { tabId: tab.id, reason: meta.reason || 'payload-null' });
    }
    const changed = previousSignature !== nextSignature;
    try{
      const statsTest = payload && payload.config && payload.config.stats ? payload.config.stats.test : null;
      console.debug('Debug: assignTabPayload applied', {
        tabId: tab.id,
        reason: meta.reason || 'unspecified',
        changed,
        hasPayload: !!payload,
        statsTest
      });
    }catch(e){
      console.debug('Debug: assignTabPayload applied (no stats)', { tabId: tab.id, reason: meta.reason || 'unspecified', changed, hasPayload: !!payload });
    }
    return changed;
  }

  function getActiveTab() {
    const activeId = workspaceState.activeTabId || null;
    const tab = workspaceState.tabs.find(item => item.id === activeId) || null;
    if (!tab) {
      console.debug('Debug: session getActiveTab fallback', { activeId });
    }
    return tab;
  }

  function escapeRegExp(value) {
    return (value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function generateUniqueTabTitle(baseTitle, options = {}) {
    const excludeId = options.excludeTabId || null;
    const trimmedBase = (baseTitle || '').trim();
    const normalizedBase = trimmedBase || 'Workspace';
    const suffixMatch = normalizedBase.match(/^(.*\S)\s#(\d+)$/);
    const collisionBase = suffixMatch && suffixMatch[1]
      ? suffixMatch[1].trim()
      : normalizedBase;
    const pattern = new RegExp(`^${escapeRegExp(collisionBase)}(?:\\s#(\\d+))?$`);
    let highestIndex = 0;
    const collisions = [];
    workspaceState.tabs.forEach(tab => {
      if (!tab || (excludeId && tab.id === excludeId)) {
        return;
      }
      const title = (tab.title || '').trim();
      if (!title) {
        return;
      }
      const match = title.match(pattern);
      if (!match) {
        return;
      }
      const number = match[1] ? parseInt(match[1], 10) : 1;
      if (Number.isFinite(number) && number > highestIndex) {
        highestIndex = number;
      }
      collisions.push({ tabId: tab.id, title });
    });
    if (highestIndex === 0) {
      console.debug('Debug: session unique title computed', {
        baseTitle: normalizedBase,
        collisionBase,
        uniqueTitle: normalizedBase,
        excludeId,
        highestIndex,
        collisionCount: collisions.length
      });
      return normalizedBase;
    }
    const uniqueTitle = `${collisionBase} #${highestIndex + 1}`;
    console.debug('Debug: session unique title computed', {
      baseTitle: normalizedBase,
      collisionBase,
      uniqueTitle,
      excludeId,
      highestIndex,
      collisionCount: collisions.length
    });
    return uniqueTitle;
  }

  function createTab(options = {}) {
    const index = workspaceState.tabs.length + 1;
    const id = `workspace-${workspaceState.nextId++}`;
    const tab = {
      id,
      title: generateUniqueTabTitle(options.title || `Workspace ${index}`, { excludeTabId: id }),
      type: options.type || null,
      payload: options.payload || null,
      payloadSignature: options.payloadSignature !== undefined
        ? options.payloadSignature
        : serializePayloadSignature(options.payload || null),
      duplicateSource: options.duplicateSource || null,
      isWelcome: !!options.isWelcome,
      allowClose: options.allowClose !== false,
      isRenaming: false,
      previewMarkup: options.previewMarkup || null,
      previewSignature: options.previewSignature || null,
      previewMeta: options.previewMeta || null,
      renderCache: null,
      renderCacheSignature: null,
      renderCacheLayoutSignature: null,
      layoutState: options.layoutState || null,
      layoutSignature: options.layoutSignature !== undefined
        ? options.layoutSignature
        : serializePayloadSignature(options.layoutState || null)
    };
    if (tab.isWelcome) {
      tab.allowClose = false;
    }
    console.debug('Debug: session createTab generated', {
      id,
      index,
      duplicateSource: tab.duplicateSource,
      isWelcome: tab.isWelcome
    });
    return tab;
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

  function isPcaDefaultLabelFlagValue(value) {
    if (value === null || value === undefined) {
      return true;
    }
    if (typeof value === 'boolean') {
      return value === false;
    }
    if (typeof value === 'number') {
      return value === 0;
    }
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      return text === '' || text === 'false' || text === '0';
    }
    return false;
  }

  function pcaTabHasMeaningfulData(matrix, tableFormat, tabId) {
    if (!Array.isArray(matrix)) {
      return false;
    }
    const grouped = tableFormat === 'grouped';
    const labelRowIndex = 0;
    const groupRowIndex = 1;
    const sampleRowIndex = grouped ? 2 : 1;
    const dataStartRow = grouped ? 3 : 2;

    for (let r = dataStartRow; r < matrix.length; r += 1) {
      const row = matrix[r];
      if (!Array.isArray(row)) {
        continue;
      }
      for (let c = 0; c < row.length; c += 1) {
        if (hasMeaningfulCellValue(row[c])) {
          console.debug('Debug: pca tab data detected in matrix body', { tabId, rowIndex: r, colIndex: c });
          return true;
        }
      }
    }

    const sampleRow = Array.isArray(matrix[sampleRowIndex]) ? matrix[sampleRowIndex] : [];
    for (let c = 1; c < sampleRow.length; c += 1) {
      if (hasMeaningfulCellValue(sampleRow[c])) {
        console.debug('Debug: pca tab data detected in sample header row', { tabId, rowIndex: sampleRowIndex, colIndex: c });
        return true;
      }
    }

    if (grouped) {
      const groupRow = Array.isArray(matrix[groupRowIndex]) ? matrix[groupRowIndex] : [];
      for (let c = 1; c < groupRow.length; c += 1) {
        if (hasMeaningfulCellValue(groupRow[c])) {
          console.debug('Debug: pca tab data detected in group header row', { tabId, rowIndex: groupRowIndex, colIndex: c });
          return true;
        }
      }
    }

    const labelRow = Array.isArray(matrix[labelRowIndex]) ? matrix[labelRowIndex] : [];
    for (let c = 1; c < labelRow.length; c += 1) {
      if (!isPcaDefaultLabelFlagValue(labelRow[c])) {
        console.debug('Debug: pca tab data detected in label-point row', { tabId, rowIndex: labelRowIndex, colIndex: c });
        return true;
      }
    }

    console.debug('Debug: pca tab considered empty after structural row check', {
      tabId,
      tableFormat: grouped ? 'grouped' : 'standard'
    });
    return false;
  }

  function tabHasTableData(tab) {
    const tabId = tab?.id || null;
    if (!tab || !tab.payload) {
      console.debug('Debug: tab data inspection skipped', { tabId, reason: 'no-tab-or-payload' });
      return false;
    }
    // Special-case: treat empty Venn workspaces (no input lists and zero counts)
    // as having no data so they can be closed without prompting to save.
    if (tab.type === 'venn') {
      try {
        const d = tab.payload.data || {};
        const hasLabel = (d.labelA || '').toString().trim().length > 0
          || (d.labelB || '').toString().trim().length > 0
          || (d.labelC || '').toString().trim().length > 0;
        const hasList = (d.listA || '').toString().trim().length > 0
          || (d.listB || '').toString().trim().length > 0
          || (d.listC || '').toString().trim().length > 0;
        const counts = [d.nA, d.nB, d.nC, d.nAB, d.nAC, d.nBC, d.nABC];
        const hasCounts = counts.some(n => Number(n) > 0);
        if (!hasLabel && !hasList && !hasCounts) {
          console.debug('Debug: venn tab considered empty (no input lists, labels, or counts)', { tabId });
          return false;
        }
        // otherwise fall through to generic inspection
      } catch (err) {
        console.debug('Debug: venn empty-check error', { tabId, err });
      }
    }
    if (tab.type === 'pca') {
      try {
        const matrix = tab.payload.data;
        if (Array.isArray(matrix)) {
          return pcaTabHasMeaningfulData(matrix, tab.payload?.config?.tableFormat, tabId);
        }
      } catch (err) {
        console.debug('Debug: pca empty-check error', { tabId, err });
      }
    }
    // General header-detection heuristic for table-like payloads across
    // components: if the first row appears to be textual headers (and
    // contains no numeric values) treat it as a header and ignore it when
    // deciding whether the workspace contains user-entered data. For the
    // `line` component we also ignore a header row if it contains textual
    // labels (legacy behavior).
    const matrix = tab.payload.data;
    if (Array.isArray(matrix) && matrix.length > 0 && Array.isArray(matrix[0])) {
      try {
        const header = matrix[0];
        const headerHasText = header.some(cell => typeof cell === 'string' && cell.trim().length > 0);
        const headerHasNumeric = header.some(cell => {
          if (typeof cell === 'number' && Number.isFinite(cell)) return true;
          if (typeof cell === 'string' && cell.trim().length > 0) {
            const n = Number(cell);
            return !Number.isNaN(n) && Number.isFinite(n);
          }
          return false;
        });
        let startRow = 0;
        if (tab.type === 'line' && headerHasText) {
          startRow = 1;
        } else if (headerHasText && !headerHasNumeric) {
          startRow = 1;
        }
        if (startRow > 0) {
          for (let r = startRow; r < matrix.length; r++) {
            const row = matrix[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
              if (hasMeaningfulCellValue(row[c])) {
                console.debug('Debug: tab data detected after header skip', { tabId, rowIndex: r, colIndex: c, type: tab.type });
                return true;
              }
            }
          }
          console.debug('Debug: tab considered empty after header skip', { tabId, type: tab.type });
          return false;
        }
      } catch (err) {
        console.debug('Debug: header-detection error', { tabId, err, type: tab.type });
      }
    }
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

  function persistActiveTabState(tab = getActiveTab(), options = {}) {
    if (!tab || !tab.type) {
      return false;
    }
    const workspaces = options.workspaces || (window.Main?.components?.registry) || {};
    const previews = options.previews || window.Main?.previews || null;
    const config = workspaces?.[tab.type];
    if (!config || typeof config.getPayload !== 'function') {
      console.debug('Debug: persistActiveTabState skipped', {
        tabId: tab?.id,
        type: tab?.type,
        reason: 'missing-config'
      });
      return false;
    }
    try {
      const payload = config.getPayload();
      let payloadClone = clonePayload(payload);
      const layoutState = Shared.componentLayout?.captureStateFor
        ? Shared.componentLayout.captureStateFor(tab.type)
        : null;
      let layoutClone = clonePayload(layoutState);
      if (Shared.graphSizing?.enrichPayloadWithLayout) {
        try {
          payloadClone = Shared.graphSizing.enrichPayloadWithLayout(tab.type, payloadClone, layoutClone, {
            context: `persist-${tab.type}`
          });
        } catch (err) {
          console.error('persistActiveTabState graph sizing enrich error', { tabId: tab.id, type: tab.type, err });
        }
      }
      if (Shared.graphSizing?.mergePayloadSizingIntoLayout) {
        try {
          layoutClone = Shared.graphSizing.mergePayloadSizingIntoLayout(layoutClone, payloadClone, {
            context: `persist-layout-${tab.type}`
          });
        } catch (err) {
          console.error('persistActiveTabState graph sizing layout merge error', { tabId: tab.id, type: tab.type, err });
        }
      }
      const previousLayoutSignature = tab.layoutSignature || null;
      const changed = assignTabPayload(tab, payloadClone, { reason: options.reason || 'persist-active' });
      tab.layoutState = layoutClone;
      tab.layoutSignature = serializePayloadSignature(layoutClone);
      const layoutChanged = previousLayoutSignature !== tab.layoutSignature;
      const previewNeedsCapture = options.forcePreviewCapture === true || changed || (tab.previewSignature !== tab.payloadSignature);
      let previewChanged = false;
      if (previews && typeof previews.updateTabPreviewFromWorkspace === 'function') {
        previewChanged = previews.updateTabPreviewFromWorkspace(tab, config, {
          reason: options.reason || 'persist-active',
          forceCapture: previewNeedsCapture
        });
      } else {
        console.debug('Debug: persistActiveTabState preview skipped', {
          tabId: tab.id,
          hasPreviews: !!previews
        });
      }
      if (options.captureRenderCache && typeof config.captureRenderCache === 'function') {
        try {
          const captured = config.captureRenderCache({
            tabId: tab.id,
            type: tab.type,
            reason: options.reason || 'persist-active'
          });
          if (captured) {
            tab.renderCache = {
              cache: captured,
              payloadSignature: tab.payloadSignature || null,
              layoutSignature: tab.layoutSignature || null
            };
            tab.renderCacheSignature = tab.payloadSignature || null;
            tab.renderCacheLayoutSignature = tab.layoutSignature || null;
          } else {
            tab.renderCache = null;
            tab.renderCacheSignature = null;
            tab.renderCacheLayoutSignature = null;
          }
          console.debug('Debug: workspace render cache captured', {
            tabId: tab.id,
            type: tab.type,
            hasCache: !!captured
          });
        } catch (err) {
          console.error('persistActiveTabState render cache error', { tabId: tab.id, type: tab.type, err });
        }
      }
      if (!workspaceState.loadedWorkspaces) {
        workspaceState.loadedWorkspaces = {};
      }
      if (workspaceState.activeTabId === tab.id) {
        workspaceState.loadedWorkspaces[tab.id] = {
          tabId: tab.id,
          type: tab.type || null,
          payloadSignature: tab.payloadSignature,
          layoutSignature: tab.layoutSignature
        };
      }
      if (changed || layoutChanged) {
        markSessionDirty(options.reason || 'tab-state-updated', {
          tabId: tab.id,
          type: tab.type,
          layoutChanged
        });
      }
      console.debug('Debug: workspace state persisted', {
        tabId: tab.id,
        type: tab.type,
        hasPayload: !!tab.payload,
        changed,
        previewChanged,
        hasLayout: !!tab.layoutState,
        layoutChanged
      });
      return changed;
    } catch (err) {
      console.error('persistActiveTabState error', { tabId: tab.id, type: tab.type, err });
      return false;
    }
  }

  function buildSessionPayload(options = {}) {
    const active = options.activeTab || getActiveTab();
    if (active && !active.isWelcome) {
      persistActiveTabState(active, options);
    } else {
      console.debug('Debug: buildSessionPayload active tab skipped', {
        hasActive: !!active,
        isWelcome: !!active?.isWelcome
      });
    }
    const graphTabs = workspaceState.tabs.filter(tab => !tab.isWelcome && tab.type);
    const activeGraphIndex = active && !active.isWelcome
      ? graphTabs.findIndex(tab => tab.id === active.id)
      : -1;
    const tabsPayload = graphTabs.map((tab, index) => {
      let payloadClone = clonePayload(tab.payload);
      let layoutClone = clonePayload(tab.layoutState);
      if (Shared.graphSizing?.enrichPayloadWithLayout) {
        try {
          payloadClone = Shared.graphSizing.enrichPayloadWithLayout(tab.type, payloadClone, layoutClone, {
            context: `build-session-${tab.type}`
          });
        } catch (err) {
          console.error('buildSessionPayload graph sizing enrich error', { tabId: tab.id, type: tab.type, err });
        }
      }
      if (Shared.graphSizing?.mergePayloadSizingIntoLayout) {
        try {
          layoutClone = Shared.graphSizing.mergePayloadSizingIntoLayout(layoutClone, payloadClone, {
            context: `build-session-layout-${tab.type}`
          });
        } catch (err) {
          console.error('buildSessionPayload graph sizing layout merge error', { tabId: tab.id, type: tab.type, err });
        }
      }
      console.debug('Debug: session tab snapshot', {
        tabId: tab.id,
        type: tab.type,
        index,
        hasPayload: !!payloadClone,
        hasLayout: !!layoutClone
      });
      return {
        title: tab.title,
        type: tab.type,
        payload: payloadClone,
        layout: layoutClone
      };
    });
    const sessionPayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      activeIndex: activeGraphIndex,
      tabs: tabsPayload
    };
    console.debug('Debug: session payload built', {
      tabCount: tabsPayload.length,
      activeIndex: activeGraphIndex
    });
    return sessionPayload;
  }

  async function loadWorkspaceSessionBlob(blob, options = {}) {
    if (!blob) {
      console.warn('loadWorkspaceSessionBlob skipped', { reason: 'no-blob', options });
      return;
    }
    try {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      const tabCount = Array.isArray(parsed?.tabs) ? parsed.tabs.length : 0;
      console.debug('Debug: session blob parsed', {
        bytes: text.length,
        hasTabs: Array.isArray(parsed?.tabs),
        tabCount,
        reason: options.reason || 'unknown'
      });
      applySessionData(parsed, options);
    } catch (err) {
      console.error('loadWorkspaceSessionBlob error', { err, options });
    }
  }

  function applySessionData(session, options = {}) {
    const tabs = Array.isArray(session?.tabs) ? session.tabs : [];
    if (typeof options.hideDuplicatePrompt === 'function') {
      options.hideDuplicatePrompt();
      console.debug('Debug: session apply requested duplicate prompt hide', { reason: options.reason || 'session-load' });
    }
    workspaceState.tabs = [];
    workspaceState.activeTabId = null;
    workspaceState.pendingDuplicateSource = null;
    workspaceState.lastActiveGraphId = null;
    workspaceState.loadedWorkspaces = {};
    workspaceState.renderedWorkspaceByType = {};
    workspaceState.renameFocusId = null;
    workspaceState.pendingClosePrompt = null;
    workspaceState.nextId = 1;
    if (Object.prototype.hasOwnProperty.call(options, 'fileHandle')) {
      workspaceState.sessionFileHandle = options.fileHandle;
      console.debug('Debug: session file handle applied', { hasHandle: !!options.fileHandle });
    }
    if (options.fileName) {
      workspaceState.sessionFileName = options.fileName;
      console.debug('Debug: session file name applied', { name: workspaceState.sessionFileName });
    }
    if (Object.prototype.hasOwnProperty.call(options, 'fileScope')) {
      workspaceState.sessionFileScope = options.fileScope || null;
      console.debug('Debug: session file scope applied', { scope: workspaceState.sessionFileScope });
    } else {
      workspaceState.sessionFileScope = tabs.length > 1 ? 'workspace' : (tabs.length === 1 ? 'tab' : null);
    }
    const welcomeTab = createTab({ title: 'Welcome', isWelcome: true, allowClose: false });
    workspaceState.tabs.push(welcomeTab);
    const graphTabs = [];
    tabs.forEach((tabData, index) => {
      if (!tabData || typeof tabData.type !== 'string') {
        console.warn('applySessionData skipping invalid tab', { index, tabData });
        return;
      }
      const clonedPayload = clonePayload(tabData.payload) || null;
      const clonedLayout = clonePayload(tabData.layout) || null;
      const newTab = createTab({
        title: tabData.title || `Workspace ${index + 1}`,
        type: tabData.type,
        payload: clonedPayload,
        layoutState: clonedLayout
      });
      graphTabs.push(newTab);
      workspaceState.tabs.push(newTab);
      console.debug('Debug: session tab restored', {
        index,
        tabId: newTab.id,
        type: newTab.type,
        hasPayload: !!clonedPayload,
        hasLayout: !!clonedLayout
      });
    });
    workspaceState.activeTabId = welcomeTab.id;
    if (typeof options.renderTabs === 'function') {
      options.renderTabs();
    }
    const requestedIndex = typeof session?.activeIndex === 'number' ? session.activeIndex : -1;
    const targetTab = (requestedIndex >= 0 && requestedIndex < graphTabs.length)
      ? graphTabs[requestedIndex]
      : (graphTabs[0] || null);
    if (targetTab && typeof options.activateTab === 'function') {
      options.activateTab(targetTab.id, { skipPersist: true, reason: options.reason || 'session-load' });
    } else if (!targetTab && typeof options.showGraphSelection === 'function') {
      options.showGraphSelection({ reason: 'session-empty' });
    }
    clearSessionDirty(options.reason || 'session-load');
    console.debug('Debug: session applied', {
      requestedIndex,
      resolvedIndex: targetTab ? graphTabs.indexOf(targetTab) : -1,
      tabCount: graphTabs.length,
      reason: options.reason || 'session-load'
    });
    return {
      welcomeTabId: welcomeTab.id,
      targetTabId: targetTab ? targetTab.id : null,
      graphTabCount: graphTabs.length
    };
  }

  namespace.workspaceState = workspaceState;
  namespace.markSessionDirty = markSessionDirty;
  namespace.clearSessionDirty = clearSessionDirty;
  namespace.fastClonePayload = fastClonePayload;
  namespace.clonePayload = clonePayload;
  namespace.serializePayloadSignature = serializePayloadSignature;
  namespace.assignTabPayload = assignTabPayload;
  namespace.getActiveTab = getActiveTab;
  namespace.generateUniqueTabTitle = generateUniqueTabTitle;
  namespace.createTab = createTab;
  namespace.hasMeaningfulCellValue = hasMeaningfulCellValue;
  namespace.tabHasTableData = tabHasTableData;
  namespace.graphTabsHaveData = graphTabsHaveData;
  namespace.persistActiveTabState = persistActiveTabState;
  namespace.buildSessionPayload = buildSessionPayload;
  namespace.loadWorkspaceSessionBlob = loadWorkspaceSessionBlob;
  namespace.applySessionData = applySessionData;
  console.debug('Debug: Main session module initialized', { exportedHelpers: Object.keys(namespace) });
})();
