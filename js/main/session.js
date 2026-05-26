(function() {
  "use strict";
  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  if(typeof Shared.workspaceTabs?.ensureTabState !== 'function' && typeof require === 'function'){
    try {
      require('../shared/workspaceTabs.js');
    } catch (err) {
      console.debug('Debug: session workspaceTabs helper require failed', { message: err?.message || String(err) });
    }
  }
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
   * @property {number} sessionRevision Monotonic counter incremented on dirty-state changes.
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
    sessionFilePath: '',
    sessionFileScope: null,
    sessionDirty: false,
    sessionUserDirty: false,
    sessionRevision: 0,
    draggingTabId: null,
    dragStartIndex: null,
    dragOverTabId: null,
    dragInsertBefore: true
  };
  namespace.workspaceState = workspaceState;
  if (typeof workspaceState.sessionUserDirty !== 'boolean') {
    workspaceState.sessionUserDirty = !!workspaceState.sessionDirty;
  }
  const MAX_WARM_RENDER_CACHES_TOTAL = 64;
  const MAX_WARM_RENDER_CACHES_PER_TYPE = 2;
  let renderCacheCaptureSequence = 0;
  let renderCachePruneSuspendDepth = 0;

  function setRenderCachePruneSuspended(suspended) {
    if (suspended) {
      renderCachePruneSuspendDepth += 1;
    } else if (renderCachePruneSuspendDepth > 0) {
      renderCachePruneSuspendDepth -= 1;
    }
    return renderCachePruneSuspendDepth > 0;
  }

  function isRenderCachePruneSuspended() {
    return renderCachePruneSuspendDepth > 0;
  }
  console.debug('Debug: session workspaceState initialized', { tabCount: workspaceState.tabs.length });

  const LIVE_CAPTURE_SKIP_REASONS = new Set([
    'archive-save',
    'document-snapshot',
    'recovery-interval',
    'beforeunload',
    'autosave',
    'autosave-interval',
    'autosave-enabled'
  ]);

  function normalizeReason(value) {
    return String(value || '').trim();
  }

  function resolveSnapshotIntent(options = {}) {
    const raw = options?.snapshotIntent;
    if (!raw || typeof raw !== 'object') {
      const snapshotKind = String(options?.snapshotKind || '').trim();
      if (snapshotKind) {
        const resolver = Main?.sessionActions?.resolvePersistSnapshotIntent;
        if (typeof resolver === 'function') {
          try {
            const resolved = resolver({ snapshotKind });
            if (resolved && typeof resolved === 'object') {
              return resolved;
            }
          } catch (err) {
            console.debug('Debug: session snapshot intent resolver failed', {
              snapshotKind,
              message: err?.message || String(err)
            });
          }
        }
      }
      return {};
    }
    return raw;
  }

  function isLiveCaptureSkippableReason(reason) {
    const normalized = normalizeReason(reason);
    if (!normalized) {
      return false;
    }
    return LIVE_CAPTURE_SKIP_REASONS.has(normalized)
      || normalized.includes('warmup')
      || normalized.endsWith('-private-snapshot');
  }

  function isSaveLikeLiveCaptureReason(reason, options = {}) {
    const snapshotIntent = resolveSnapshotIntent(options);
    if (snapshotIntent.captureLivePayload === true || snapshotIntent.saveLike === true) {
      return true;
    }
    if (snapshotIntent.captureLivePayload === false || snapshotIntent.saveLike === false) {
      return false;
    }
    const normalized = normalizeReason(reason).toLowerCase();
    if (options.manualSave === true || options.forceLivePayloadCapture === true) {
      return true;
    }
    if (!normalized || normalized.includes('autosave')) {
      return false;
    }
    return normalized === 'archive-save'
      || normalized === 'document-snapshot'
      || normalized === 'unsaved-save'
      || normalized.includes('save')
      || normalized.includes('snapshot');
  }

  function assertNoStaleRuntimeWorkspaceIds(label, targetTabId, value) {
    const expected = String(targetTabId || '').trim();
    if (!expected || !value || typeof collectRuntimeWorkspaceIds !== 'function') {
      return [];
    }
    const staleIds = Array.from(collectRuntimeWorkspaceIds(value)).filter(id => id && id !== expected);
    if (staleIds.length) {
      console.warn('Debug: session stale runtime workspace ids after rehome', {
        label,
        targetTabId: expected,
        staleIds
      });
    } else {
      console.debug('Debug: session runtime workspace ids rehome verified', {
        label,
        targetTabId: expected
      });
    }
    return staleIds;
  }

  function isLifecycleDirtyReason(reason, details = {}) {
    if (details?.origin === 'user') {
      return false;
    }
    if (details?.origin === 'lifecycle') {
      return true;
    }
    return false;
  }

  function hasUserModifiedTabs() {
    return Array.isArray(workspaceState.tabs)
      && workspaceState.tabs.some(tab => tab && !tab.isWelcome && tab.userModified === true);
  }

  function resolveTab(tabLike) {
    if (!tabLike) {
      return null;
    }
    if (typeof tabLike === 'object' && tabLike.id) {
      return tabLike;
    }
    const tabId = String(tabLike || '').trim();
    if (!tabId || !Array.isArray(workspaceState.tabs)) {
      return null;
    }
    return workspaceState.tabs.find(tab => tab && tab.id === tabId) || null;
  }

  function cleanupDisposedTabBookkeeping(tab, meta = {}) {
    const tabId = tab?.id || null;
    if (!tabId) {
      return false;
    }
    if (workspaceState.loadedWorkspaces && typeof workspaceState.loadedWorkspaces === 'object') {
      if (workspaceState.loadedWorkspaces[tabId]) {
        delete workspaceState.loadedWorkspaces[tabId];
      }
      Object.keys(workspaceState.loadedWorkspaces).forEach(key => {
        const entry = workspaceState.loadedWorkspaces[key];
        if (entry && entry.tabId === tabId) {
          delete workspaceState.loadedWorkspaces[key];
        }
      });
    }
    if (workspaceState.pendingDuplicateSource === tabId) {
      workspaceState.pendingDuplicateSource = null;
    }
    if (window.Shared?.undoManager?.clearTab) {
      try {
        window.Shared.undoManager.clearTab(tabId, {
          reason: meta.reason || 'dispose-tab'
        });
      } catch (err) {
        console.error('disposeWorkspaceTabResources undo cleanup error', { tabId, err });
      }
    }
    return true;
  }

  function disposeWorkspaceTabResources(tabLike, meta = {}) {
    const tab = resolveTab(tabLike) || (tabLike && typeof tabLike === 'object' ? tabLike : null);
    if (!tab || !tab.id) {
      console.debug('Debug: disposeWorkspaceTabResources skipped', {
        reason: meta.reason || 'dispose-tab',
        hasTab: !!tab
      });
      return false;
    }
    const reason = meta.reason || 'dispose-tab';
    const type = String(meta.type || tab.type || '').trim();
    let disposed = false;
    try {
      if (window.Shared?.workspaceTabs?.disposeTab) {
        disposed = !!window.Shared.workspaceTabs.disposeTab(tab, {
          ...meta,
          type,
          reason
        }) || disposed;
      }
    } catch (err) {
      console.error('disposeWorkspaceTabResources workspace dispose error', {
        tabId: tab.id,
        type,
        reason,
        err
      });
    }
    cleanupDisposedTabBookkeeping(tab, { ...meta, reason });
    console.debug('Debug: workspace tab resources disposed', {
      tabId: tab.id,
      type: type || null,
      reason,
      disposed
    });
    return disposed;
  }

  function disposeWorkspaceTabs(tabList, meta = {}) {
    const tabs = Array.isArray(tabList) ? tabList.slice() : [];
    let count = 0;
    tabs.forEach(tab => {
      if (!tab || typeof tab !== 'object') {
        return;
      }
      if (disposeWorkspaceTabResources(tab, {
        ...meta,
        type: meta.type || tab.type || null,
        reason: meta.reason || 'dispose-tabs'
      })) {
        count += 1;
      }
    });
    console.debug('Debug: workspace tabs resources disposed', {
      count,
      total: tabs.length,
      reason: meta.reason || 'dispose-tabs'
    });
    return count;
  }

  function markTabUserModified(tabLike, reason, meta = {}) {
    const tab = resolveTab(tabLike);
    if (!tab || tab.isWelcome) {
      return false;
    }
    const affectsPayload = meta.affectsPayload !== false;
    tab.userModified = true;
    tab.lastUserModifiedReason = normalizeReason(reason) || 'user-modified';
    tab.lastUserModifiedAt = Date.now();
    if (affectsPayload) {
      tab.payloadDirty = true;
      tab.payloadDirtyReason = tab.lastUserModifiedReason;
    }
    // Root-cause fix: any user mutation makes previously captured render caches stale.
    // Invalidate both runtime and archive caches immediately so tab switching can never
    // replay pre-change visuals over post-change controls/data/layout.
    clearTabRenderCache(tab, { reason: meta.reason || tab.lastUserModifiedReason || 'user-modified' });
    clearTabArchiveRenderCache(tab, { reason: meta.reason || tab.lastUserModifiedReason || 'user-modified' });
    markTabAuthoritativeRenderRestore(tab, false, { reason: meta.reason || tab.lastUserModifiedReason || 'user-modified' });
    if (meta.markSessionDirty !== false) {
      markSessionDirty(tab.lastUserModifiedReason, {
        tabId: tab.id,
        type: tab.type || null,
        origin: meta.origin || 'user',
        affectsPayload
      });
    }
    console.debug('Debug: tab user modification marked', {
      tabId: tab.id,
      type: tab.type || null,
      reason: tab.lastUserModifiedReason,
      affectsPayload,
      payloadDirty: !!tab.payloadDirty
    });
    return true;
  }

  // Convenience wrapper: components don't need to look up the active tab themselves.
  // Call from any onChange / click handler that mutates component state without
  // routing through updateTabPayload. The drift detector catches anything still
  // missing this call, but wiring it directly lets the persist machinery flush
  // promptly instead of relying on a later persist-active to notice the drift.
  function markActiveTabUserModified(reason, meta = {}) {
    const active = getActiveTab();
    if (!active || active.isWelcome) {
      return false;
    }
    return markTabUserModified(active, reason, Object.assign({ origin: 'user' }, meta || {}));
  }

  function markTabPayloadFlushed(tab, reason) {
    if (!tab) {
      return false;
    }
    const wasDirty = !!tab.payloadDirty;
    tab.payloadDirty = false;
    tab.payloadDirtyReason = '';
    tab.lastPayloadFlushedReason = normalizeReason(reason) || 'payload-flushed';
    tab.lastPayloadFlushedAt = Date.now();
    if (wasDirty) {
      console.debug('Debug: tab payload dirty flag cleared', {
        tabId: tab.id,
        type: tab.type || null,
        reason: tab.lastPayloadFlushedReason
      });
    }
    return wasDirty;
  }

  function markTabRenderCommitted(tabLike, meta = {}) {
    const tab = resolveTab(tabLike);
    if (!tab || tab.isWelcome) {
      return false;
    }
    const floor = Math.max(
      Number(tab.payloadVersion || 0),
      Number(tab.layoutVersion || 0)
    );
    tab.renderCommitVersion = Math.max(Number(tab.renderCommitVersion || 0), floor);
    tab.lastRenderCommitReason = normalizeReason(meta.reason) || 'render-commit';
    tab.lastRenderCommitAt = Date.now();
    return true;
  }

  function markAllTabsClean(reason) {
    if (!Array.isArray(workspaceState.tabs)) {
      return;
    }
    workspaceState.tabs.forEach(tab => {
      if (!tab || tab.isWelcome) {
        return;
      }
      tab.userModified = false;
      tab.payloadDirty = false;
      tab.payloadDirtyReason = '';
      tab.lastCleanReason = normalizeReason(reason) || 'clean';
      tab.lastCleanAt = Date.now();
    });
  }

  function markSessionDirty(reason, details) {
    const wasDirty = workspaceState.sessionDirty;
    const userDirty = !isLifecycleDirtyReason(reason, details || {});
    workspaceState.sessionDirty = true;
    workspaceState.sessionUserDirty = !!workspaceState.sessionUserDirty || userDirty || hasUserModifiedTabs();
    workspaceState.sessionRevision = (Number(workspaceState.sessionRevision) || 0) + 1;
    notifySessionDocumentState('dirty', {
      dirty: workspaceState.sessionDirty,
      userDirty: workspaceState.sessionUserDirty,
      wasDirty,
      revision: workspaceState.sessionRevision,
      reason: reason || 'unspecified',
      details: details || null
    });
    console.debug('Debug: session dirty flag updated', {
      reason: reason || 'unspecified',
      wasDirty,
      userDirty: workspaceState.sessionUserDirty,
      details: details || null
    });
  }

  function clearSessionDirty(reason) {
    const wasDirty = workspaceState.sessionDirty;
    workspaceState.sessionDirty = false;
    workspaceState.sessionUserDirty = false;
    markAllTabsClean(reason || 'session-clean');
    notifySessionDocumentState('clean', {
      dirty: workspaceState.sessionDirty,
      userDirty: workspaceState.sessionUserDirty,
      wasDirty,
      revision: workspaceState.sessionRevision,
      reason: reason || 'unspecified'
    });
    console.debug('Debug: session dirty flag cleared', {
      reason: reason || 'unspecified',
      wasDirty
    });
  }

  function notifySessionDocumentState(type, detail = {}) {
    try {
      const eventDetail = {
        type,
        fileName: workspaceState.sessionFileName || '',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || null,
        revision: Number(workspaceState.sessionRevision) || 0,
        ...detail
      };
      window.dispatchEvent(new CustomEvent('graphitix:document-state-change', { detail: eventDetail }));
    } catch (err) {
      console.debug('Debug: session document state event skipped', { type, message: err?.message || String(err) });
    }
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
    const matrixSignatureCache = new WeakMap();
    const compactMatrixSignatures = (input, seen = new WeakMap()) => {
      if (input === null || typeof input !== 'object') {
        return input;
      }
      if (Array.isArray(input) && typeof input.__graphitixMatrixSignature === 'string') {
        if (matrixSignatureCache.has(input)) {
          return matrixSignatureCache.get(input);
        }
        const compact = {
          __graphitixMatrixSignature: input.__graphitixMatrixSignature,
          rows: input.length
        };
        matrixSignatureCache.set(input, compact);
        return compact;
      }
      // Auto-compact large data matrices (e.g. hot.getData() results) whose
      // __graphitixMatrixSignature was stripped by structuredClone before reaching here.
      if (Array.isArray(input) && input.length > 500 && Array.isArray(input[0])) {
        if (matrixSignatureCache.has(input)) {
          return matrixSignatureCache.get(input);
        }
        const rows = input.length;
        const cols = input[0].length;
        let h = (Math.imul(rows, 0x9e3779b9) ^ Math.imul(cols, 0x6b43a9c5)) >>> 0;
        const stride = Math.max(1, Math.floor(rows / 20));
        for (let r = 0; r < rows; r += stride) {
          const row = input[r];
          if (!Array.isArray(row)) { continue; }
          for (let c = 0; c < Math.min(row.length, 5); c++) {
            const v = row[c];
            let nv = 0;
            if (typeof v === 'number' && isFinite(v)) {
              nv = Math.abs(Math.round(v * 1e4)) & 0x7FFFFFFF;
            } else if (v != null && v !== '') {
              const s = String(v);
              for (let si = 0; si < Math.min(s.length, 8); si++) {
                nv = (Math.imul(nv, 31) + s.charCodeAt(si)) & 0x7FFFFFFF;
              }
            }
            h = (Math.imul(h, 0x27d4eb2d) ^ nv) >>> 0;
          }
        }
        const sig = `${rows}x${cols}:${h.toString(16)}`;
        const compact = { __graphitixMatrixSignature: sig, rows };
        matrixSignatureCache.set(input, compact);
        return compact;
      }
      if (seen.has(input)) {
        return seen.get(input);
      }
      if (Array.isArray(input)) {
        const cloned = new Array(input.length);
        seen.set(input, cloned);
        for (let i = 0; i < input.length; i += 1) {
          cloned[i] = compactMatrixSignatures(input[i], seen);
        }
        return cloned;
      }
      const proto = Object.getPrototypeOf(input);
      if (proto !== Object.prototype && proto !== null) {
        return input;
      }
      const cloned = {};
      seen.set(input, cloned);
      Object.keys(input).forEach(key => {
        cloned[key] = compactMatrixSignatures(input[key], seen);
      });
      return cloned;
    };
    const isBinary = value instanceof ArrayBuffer || ArrayBuffer.isView(value);
    if (!isBinary) {
      try {
        const compacted = compactMatrixSignatures(value);
        const serialized = JSON.stringify(compacted);
        console.debug('Debug: serializePayloadSignature computed', {
          method: compacted === value ? 'json' : 'json-matrix-signature',
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

  const RENDER_CACHE_ARCHIVE_VERSION = 1;
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  function isPlainSerializableObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isDocumentFragmentLike(value) {
    return !!value && typeof value === 'object' && Number(value.nodeType) === 11;
  }

  function isFragmentPayloadLike(value) {
    return !!value
      && typeof value === 'object'
      && Object.prototype.hasOwnProperty.call(value, 'fragment')
      && isDocumentFragmentLike(value.fragment);
  }

  function syncFormStateIntoClone(sourceNode, cloneNode) {
    if (!sourceNode || !cloneNode || Number(sourceNode.nodeType) !== 1 || Number(cloneNode.nodeType) !== 1) {
      return;
    }
    const sourceElements = [sourceNode];
    const cloneElements = [cloneNode];
    if (typeof sourceNode.querySelectorAll === 'function') {
      sourceElements.push(...sourceNode.querySelectorAll('*'));
    }
    if (typeof cloneNode.querySelectorAll === 'function') {
      cloneElements.push(...cloneNode.querySelectorAll('*'));
    }
    const count = Math.min(sourceElements.length, cloneElements.length);
    for (let i = 0; i < count; i += 1) {
      const sourceEl = sourceElements[i];
      const cloneEl = cloneElements[i];
      const tagName = String(sourceEl.tagName || '').toLowerCase();
      if (tagName === 'input') {
        try {
          cloneEl.value = sourceEl.value;
          cloneEl.setAttribute('value', sourceEl.value);
        } catch (err) {
          console.debug('Debug: archive render cache input sync skipped', { message: err?.message || String(err) });
        }
        const inputType = String(sourceEl.getAttribute?.('type') || sourceEl.type || '').toLowerCase();
        if (inputType === 'checkbox' || inputType === 'radio') {
          cloneEl.checked = !!sourceEl.checked;
          if (sourceEl.checked) {
            cloneEl.setAttribute('checked', '');
          } else {
            cloneEl.removeAttribute('checked');
          }
        }
      } else if (tagName === 'textarea') {
        cloneEl.value = sourceEl.value;
        cloneEl.textContent = sourceEl.value;
      } else if (tagName === 'select') {
        const sourceOptions = sourceEl.options || [];
        const cloneOptions = cloneEl.options || [];
        const optionCount = Math.min(sourceOptions.length, cloneOptions.length);
        for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
          cloneOptions[optionIndex].selected = !!sourceOptions[optionIndex].selected;
          if (sourceOptions[optionIndex].selected) {
            cloneOptions[optionIndex].setAttribute('selected', '');
          } else {
            cloneOptions[optionIndex].removeAttribute('selected');
          }
        }
        cloneEl.selectedIndex = sourceEl.selectedIndex;
      }
    }
  }

  function collectCanvasNodes(root) {
    if (!root || Number(root.nodeType) !== 1) {
      return [];
    }
    const nodes = [];
    if (String(root.tagName || '').toLowerCase() === 'canvas') {
      nodes.push(root);
    }
    if (typeof root.querySelectorAll === 'function') {
      nodes.push(...Array.from(root.querySelectorAll('canvas')));
    }
    return nodes;
  }

  function canvasToRenderCacheDataUrl(canvas) {
    if (!canvas || typeof canvas.toDataURL !== 'function') {
      return '';
    }
    try {
      return canvas.toDataURL('image/png') || '';
    } catch (err) {
      console.debug('Debug: archive render cache canvas bitmap skipped', {
        message: err?.message || String(err)
      });
      return '';
    }
  }

  function copyCanvasBitmapStateIntoClone(sourceNode, cloneNode) {
    const sourceCanvases = collectCanvasNodes(sourceNode);
    if (!sourceCanvases.length) {
      return 0;
    }
    const cloneCanvases = collectCanvasNodes(cloneNode);
    const count = Math.min(sourceCanvases.length, cloneCanvases.length);
    let copied = 0;
    for (let i = 0; i < count; i += 1) {
      const sourceCanvas = sourceCanvases[i];
      const cloneCanvas = cloneCanvases[i];
      const dataUrl = canvasToRenderCacheDataUrl(sourceCanvas);
      if (!dataUrl || !cloneCanvas?.parentNode) {
        continue;
      }
      const doc = cloneCanvas.ownerDocument || global.document || null;
      if (!doc) {
        continue;
      }
      const image = typeof doc.createElementNS === 'function'
        ? doc.createElementNS('http://www.w3.org/1999/xhtml', 'img')
        : doc.createElement('img');
      image.setAttribute('src', dataUrl);
      image.setAttribute('data-graphitix-render-cache-canvas-bitmap', 'true');
      const width = Math.max(1, Number(sourceCanvas.width) || Number(cloneCanvas.getAttribute?.('width')) || 1);
      const height = Math.max(1, Number(sourceCanvas.height) || Number(cloneCanvas.getAttribute?.('height')) || 1);
      image.setAttribute('width', cloneCanvas.getAttribute?.('width') || String(width));
      image.setAttribute('height', cloneCanvas.getAttribute?.('height') || String(height));
      const className = cloneCanvas.getAttribute?.('class');
      if (className) {
        image.setAttribute('class', className);
      }
      const styleText = cloneCanvas.getAttribute?.('style') || '';
      if (styleText) {
        image.setAttribute('style', styleText);
      }
      image.style.display = cloneCanvas.style?.display || 'block';
      image.style.width = cloneCanvas.style?.width || `${width}px`;
      image.style.height = cloneCanvas.style?.height || `${height}px`;
      image.style.background = cloneCanvas.style?.background || 'transparent';
      image.style.pointerEvents = 'none';
      cloneCanvas.parentNode.replaceChild(image, cloneCanvas);
      copied += 1;
    }
    return copied;
  }

  function serializeDomNode(node) {
    if (!node) {
      return null;
    }
    const nodeType = Number(node.nodeType) || 0;
    if (nodeType === 3) {
      return { kind: 'text', text: node.textContent || '' };
    }
    if (nodeType === 8) {
      return { kind: 'comment', text: node.textContent || '' };
    }
    if (nodeType !== 1) {
      return { kind: 'text', text: node.textContent || '' };
    }
    const clone = typeof node.cloneNode === 'function' ? node.cloneNode(true) : null;
    if (!clone) {
      return { kind: 'text', text: node.textContent || '' };
    }
    syncFormStateIntoClone(node, clone);
    const canvasBitmapCount = copyCanvasBitmapStateIntoClone(node, clone);
    if (canvasBitmapCount && typeof clone.setAttribute === 'function') {
      clone.setAttribute('data-graphitix-render-cache-canvas-bitmaps', String(canvasBitmapCount));
    }
    const namespaceUri = String(node.namespaceURI || '').trim() || null;
    let markup = '';
    try {
      if (namespaceUri === SVG_NAMESPACE && typeof XMLSerializer !== 'undefined') {
        markup = new XMLSerializer().serializeToString(clone);
      } else {
        markup = typeof clone.outerHTML === 'string'
          ? clone.outerHTML
          : (typeof XMLSerializer !== 'undefined' ? new XMLSerializer().serializeToString(clone) : '');
      }
    } catch (err) {
      console.error('serializeDomNode markup error', err);
      markup = typeof clone.outerHTML === 'string' ? clone.outerHTML : '';
    }
    return {
      kind: 'element',
      namespaceUri,
      tagName: String(node.tagName || clone.tagName || '').toLowerCase(),
      markup
    };
  }

  function serializeFragmentPayload(value) {
    const fragment = value?.fragment;
    if (!isDocumentFragmentLike(fragment)) {
      return null;
    }
    const childNodes = Array.from(fragment.childNodes || []);
    return {
      __graphitixKind: 'fragment-payload',
      version: RENDER_CACHE_ARCHIVE_VERSION,
      count: Number(value?.count) || childNodes.length,
      nodes: childNodes.map(serializeDomNode).filter(Boolean)
    };
  }

  function serializeRenderCacheValue(value, seen = new WeakMap()) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'bigint') {
      return { __graphitixKind: 'bigint', value: value.toString() };
    }
    if (value instanceof Date) {
      return { __graphitixKind: 'date', value: value.toISOString() };
    }
    if (value instanceof RegExp) {
      return { __graphitixKind: 'regexp', source: value.source, flags: value.flags };
    }
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return { __graphitixKind: 'array-buffer', values: Array.from(new Uint8Array(value)) };
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
      return {
        __graphitixKind: 'typed-array',
        ctor: value.constructor?.name || 'Uint8Array',
        values: Array.from(value)
      };
    }
    if (isFragmentPayloadLike(value)) {
      return serializeFragmentPayload(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => serializeRenderCacheValue(item, seen));
    }
    if (value instanceof Set) {
      return {
        __graphitixKind: 'set',
        values: Array.from(value).map(item => serializeRenderCacheValue(item, seen))
      };
    }
    if (value instanceof Map) {
      return {
        __graphitixKind: 'map',
        entries: Array.from(value.entries()).map(([key, entryValue]) => ([
          serializeRenderCacheValue(key, seen),
          serializeRenderCacheValue(entryValue, seen)
        ]))
      };
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      return { __graphitixKind: 'circular-ref' };
    }
    seen.set(value, true);
    if (!isPlainSerializableObject(value)) {
      const cloned = clonePayload(value);
      if (cloned === value) {
        return null;
      }
      return serializeRenderCacheValue(cloned, seen);
    }
    const result = {};
    Object.keys(value).forEach(key => {
      result[key] = serializeRenderCacheValue(value[key], seen);
    });
    seen.delete(value);
    return result;
  }

  function deserializeNodeSpec(spec, doc) {
    if (!spec || typeof spec !== 'object') {
      return null;
    }
    if (spec.kind === 'text') {
      return doc.createTextNode(String(spec.text || ''));
    }
    if (spec.kind === 'comment') {
      return doc.createComment(String(spec.text || ''));
    }
    if (spec.kind !== 'element') {
      return null;
    }
    const markup = String(spec.markup || '').trim();
    if (!markup) {
      return null;
    }
    try {
      if (spec.namespaceUri === SVG_NAMESPACE && typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const isSvgRoot = /^<svg[\s>]/i.test(markup);
        const source = isSvgRoot
          ? markup
          : `<svg xmlns="${SVG_NAMESPACE}">${markup}</svg>`;
        const parsed = parser.parseFromString(source, 'image/svg+xml');
        const root = parsed?.documentElement || null;
        if (!root) {
          return null;
        }
        if (isSvgRoot) {
          return doc.importNode(root, true);
        }
        const fragment = doc.createDocumentFragment();
        Array.from(root.childNodes || []).forEach(child => {
          fragment.appendChild(doc.importNode(child, true));
        });
        return fragment;
      }
      const template = doc.createElement('template');
      template.innerHTML = markup;
      if (template.content.childNodes.length === 1) {
        return template.content.firstChild;
      }
      return template.content;
    } catch (err) {
      console.error('deserializeNodeSpec error', err);
      return null;
    }
  }

  function deserializeFragmentPayload(value, doc = document) {
    if (!value || value.__graphitixKind !== 'fragment-payload' || !doc) {
      return null;
    }
    const fragment = doc.createDocumentFragment();
    const nodes = Array.isArray(value.nodes) ? value.nodes : [];
    nodes.forEach(spec => {
      const node = deserializeNodeSpec(spec, doc);
      if (!node) {
        return;
      }
      if (node.nodeType === 11) {
        fragment.appendChild(node);
      } else {
        fragment.appendChild(node);
      }
    });
    return {
      fragment,
      count: Number(value.count) || fragment.childNodes.length
    };
  }

  function reviveTypedArray(value) {
    const ctorName = String(value?.ctor || 'Uint8Array');
    const values = Array.isArray(value?.values) ? value.values : [];
    const ctor = typeof window !== 'undefined' && window[ctorName]
      ? window[ctorName]
      : globalThis?.[ctorName];
    if (typeof ctor !== 'function') {
      return Uint8Array.from(values);
    }
    try {
      return new ctor(values);
    } catch (err) {
      console.debug('Debug: reviveTypedArray fallback', { ctorName, message: err?.message || String(err) });
      return Uint8Array.from(values);
    }
  }

  function deserializeRenderCacheValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(deserializeRenderCacheValue);
    }
    const kind = value.__graphitixKind;
    if (kind === 'fragment-payload') {
      return deserializeFragmentPayload(value, document);
    }
    if (kind === 'typed-array') {
      return reviveTypedArray(value);
    }
    if (kind === 'array-buffer') {
      return new Uint8Array(Array.isArray(value.values) ? value.values : []).buffer;
    }
    if (kind === 'date') {
      return new Date(value.value);
    }
    if (kind === 'regexp') {
      return new RegExp(String(value.source || ''), String(value.flags || ''));
    }
    if (kind === 'bigint') {
      try {
        return BigInt(String(value.value || '0'));
      } catch (err) {
        return 0n;
      }
    }
    if (kind === 'set') {
      const values = Array.isArray(value.values) ? value.values : [];
      return new Set(values.map(deserializeRenderCacheValue));
    }
    if (kind === 'map') {
      const entries = Array.isArray(value.entries) ? value.entries : [];
      return new Map(entries.map(entry => {
        if (!Array.isArray(entry) || entry.length < 2) {
          return [null, null];
        }
        return [
          deserializeRenderCacheValue(entry[0]),
          deserializeRenderCacheValue(entry[1])
        ];
      }));
    }
    if (kind === 'circular-ref') {
      return null;
    }
    const result = {};
    Object.keys(value).forEach(key => {
      result[key] = deserializeRenderCacheValue(value[key]);
    });
    return result;
  }

  function clearTabArchiveRenderCache(tab, meta = {}) {
    if (!tab) {
      return false;
    }
    const hadCache = !!(tab.archiveRenderCache || tab.archiveRenderCacheSignature || tab.archiveRenderCacheLayoutSignature);
    tab.archiveRenderCache = null;
    tab.archiveRenderCacheSignature = null;
    tab.archiveRenderCacheLayoutSignature = null;
    if (hadCache) {
      console.debug('Debug: archive render cache cleared', {
        tabId: tab.id,
        type: tab.type || null,
        reason: meta.reason || 'clear-archive-render-cache'
      });
    }
    return hadCache;
  }

  function detectRenderCacheGraphicKey(cache){
    if(!cache || typeof cache !== 'object'){
      return null;
    }
    const metaKey = typeof cache.__graphitixRenderCache?.graphicKey === 'string'
      ? cache.__graphitixRenderCache.graphicKey
      : null;
    if(metaKey && cache[metaKey]){
      return metaKey;
    }
    const candidates = ['preview', 'plot', 'svg', 'stage', 'graph'];
    for(const key of candidates){
      const value = cache[key];
      if(value && typeof value === 'object'){
        if(value.fragment || Number(value.count) > 0 || value.__graphitixKind === 'fragment-payload' || Array.isArray(value.nodes)){
          return key;
        }
      }
    }
    return null;
  }


  function cloneRenderCacheForStorage(cache) {
    if (!cache || typeof cache !== 'object') {
      return cache || null;
    }
    try {
      return deserializeRenderCacheValue(serializeRenderCacheValue(cache));
    } catch (err) {
      console.warn('cloneRenderCacheForStorage failed; storing live cache object as fallback', { err });
      return cache;
    }
  }

  function restoreLiveDomAfterRenderCacheCapture(config, captured, tab, reason) {
    if (!config || typeof config.restoreRenderCache !== 'function' || !captured) {
      return false;
    }
    try {
      const restored = !!config.restoreRenderCache(captured, {
        tab,
        tabId: tab?.id || null,
        type: tab?.type || null,
        reason: `${reason || 'persist-active'}:restore-live-after-cache-capture`,
        restoreLiveAfterCapture: true,
        skipStateMutation: true
      });
      console.debug('Debug: live DOM restored after render cache capture', {
        tabId: tab?.id || null,
        type: tab?.type || null,
        reason: reason || 'persist-active',
        restored
      });
      return restored;
    } catch (err) {
      console.error('restoreLiveDomAfterRenderCacheCapture error', {
        tabId: tab?.id || null,
        type: tab?.type || null,
        reason: reason || 'persist-active',
        err
      });
      return false;
    }
  }

  function normalizeRenderCacheShapeForTab(cache, tab, meta = {}){
    if(!cache || typeof cache !== 'object'){
      return cache || null;
    }
    const componentType = String(tab?.type || meta?.type || cache.__graphitixRenderCache?.component || '').trim() || null;
    const graphicKey = detectRenderCacheGraphicKey(cache);
    const previousMeta = cache.__graphitixRenderCache && typeof cache.__graphitixRenderCache === 'object'
      ? cache.__graphitixRenderCache
      : null;
    cache.__graphitixRenderCache = {
      ...(previousMeta || {}),
      version: 2,
      component: componentType,
      tabId: tab?.id || meta?.tabId || previousMeta?.tabId || null,
      graphicKey,
      previewKey: graphicKey,
      normalizedAt: Date.now(),
      reason: meta?.reason || previousMeta?.reason || 'render-cache-normalize'
    };
    if(graphicKey && !cache.graphicKey){
      cache.graphicKey = graphicKey;
    }
    return cache;
  }

  function peekArchiveRenderCache(tab, meta = {}) {
    if (!tab) {
      return null;
    }
    if (tab.renderCache && tab.renderCache.cache) {
      return tab.renderCache;
    }
    if (!tab.archiveRenderCache) {
      return null;
    }
    const cache = normalizeRenderCacheShapeForTab(deserializeRenderCacheValue(tab.archiveRenderCache), tab, {
      reason: meta.reason || 'archive-render-cache-peeked'
    });
    if (!cache) {
      console.debug('Debug: archive render cache peek skipped', {
        tabId: tab?.id || null,
        reason: 'empty-cache',
        meta
      });
      return null;
    }
    if (cache && cache.__graphitixRenderCache && typeof cache.__graphitixRenderCache === 'object') {
      const originalTabId = cache.__graphitixRenderCache.tabId;
      cache.__graphitixRenderCache.tabId = tab.id;
      if (originalTabId && originalTabId !== tab.id) {
        console.debug('Debug: archive render cache metadata tabId rewritten on peek', {
          originalTabId,
          tabId: tab.id,
          reason: meta.reason || 'archive-render-cache-peeked'
        });
      }
    }
    const payloadSignature = tab.archiveRenderCacheSignature || tab.payloadSignature || null;
    const layoutSignature = tab.archiveRenderCacheLayoutSignature || tab.layoutSignature || null;
    const payloadVersion = Number(tab.payloadVersion || 0);
    const layoutVersion = Number(tab.layoutVersion || 0);
    const renderCommitVersion = Number(tab.renderCommitVersion || 0);
    if (renderCommitVersion < payloadVersion || renderCommitVersion < layoutVersion) {
      console.debug('Debug: archive render cache rejected by render-commit barrier', {
        tabId: tab.id,
        payloadVersion,
        layoutVersion,
        renderCommitVersion,
        reason: meta.reason || 'archive-render-cache-peeked'
      });
      return null;
    }
    return {
      cache,
      tabId: tab.id,
      type: tab.type || null,
      payloadSignature,
      layoutSignature,
      payloadVersion,
      layoutVersion,
      renderCommitVersion,
      archiveBacked: true,
      capturedAt: Date.now(),
      captureSequence: Number(tab.renderCache?.captureSequence || 0)
    };
  }

  function consumeArchiveRenderCache(tab, meta = {}) {
    if (!tab || tab.renderCache) {
      return tab?.renderCache || null;
    }
    const peeked = peekArchiveRenderCache(tab, {
      ...meta,
      reason: meta.reason || 'archive-render-cache-consumed'
    });
    if (!peeked) {
      return null;
    }
    clearTabArchiveRenderCache(tab, { reason: meta.reason || 'archive-render-cache-consumed' });
    const capturedAt = Date.now();
    tab.renderCache = {
      cache: peeked.cache,
      tabId: tab.id,
      type: tab.type || null,
      payloadSignature: peeked.payloadSignature || null,
      layoutSignature: peeked.layoutSignature || null,
      payloadVersion: Number(peeked.payloadVersion || tab.payloadVersion || 0),
      layoutVersion: Number(peeked.layoutVersion || tab.layoutVersion || 0),
      renderCommitVersion: Number(peeked.renderCommitVersion || tab.renderCommitVersion || 0),
      capturedAt,
      captureSequence: ++renderCacheCaptureSequence,
      promotedFromArchive: true
    };
    tab.renderCacheSignature = tab.renderCache.payloadSignature;
    tab.renderCacheLayoutSignature = tab.renderCache.layoutSignature;
    tab.renderCacheTabId = tab.id;
    console.debug('Debug: archive render cache consumed', {
      tabId: tab.id,
      type: tab.type || null,
      reason: meta.reason || 'archive-render-cache-consumed'
    });
    return tab.renderCache;
  }


  function promoteArchiveRenderCacheToRuntime(tab, renderCacheWrapper, meta = {}) {
    if (!tab) {
      return null;
    }
    let wrapper = renderCacheWrapper && renderCacheWrapper.cache ? renderCacheWrapper : null;
    if (!wrapper) {
      wrapper = peekArchiveRenderCache(tab, {
        ...meta,
        reason: meta.reason || 'archive-render-cache-promote'
      });
    }
    if (!wrapper || !wrapper.cache) {
      return null;
    }
    const capturedAt = Date.now();
    tab.renderCache = {
      cache: wrapper.cache,
      tabId: tab.id,
      type: tab.type || null,
      payloadSignature: wrapper.payloadSignature || tab.archiveRenderCacheSignature || tab.payloadSignature || null,
      layoutSignature: wrapper.layoutSignature || tab.archiveRenderCacheLayoutSignature || tab.layoutSignature || null,
      payloadVersion: Number(wrapper.payloadVersion || tab.payloadVersion || 0),
      layoutVersion: Number(wrapper.layoutVersion || tab.layoutVersion || 0),
      renderCommitVersion: Number(wrapper.renderCommitVersion || tab.renderCommitVersion || 0),
      capturedAt,
      captureSequence: ++renderCacheCaptureSequence,
      promotedFromArchive: true
    };
    tab.renderCacheSignature = tab.renderCache.payloadSignature;
    tab.renderCacheLayoutSignature = tab.renderCache.layoutSignature;
    tab.renderCacheTabId = tab.id;
    const consumeArchive = meta.consumeArchive === true || meta.preserveArchive === false;
    if (consumeArchive) {
      clearTabArchiveRenderCache(tab, { reason: meta.reason || 'archive-render-cache-promoted' });
    }
    console.debug('Debug: archive render cache promoted to runtime', {
      tabId: tab.id,
      type: tab.type || null,
      reason: meta.reason || 'archive-render-cache-promoted',
      archivePreserved: !consumeArchive,
      payloadSignatureLength: tab.renderCacheSignature ? String(tab.renderCacheSignature).length : 0,
      layoutSignatureLength: tab.renderCacheLayoutSignature ? String(tab.renderCacheLayoutSignature).length : 0
    });
    return tab.renderCache;
  }

  function serializeRenderCacheForArchive(cache) {
    return serializeRenderCacheValue(cache);
  }


  function markTabAuthoritativeRenderRestore(tab, isActive, meta = {}) {
    if (!tab) {
      return false;
    }
    const next = !!isActive;
    const previous = !!tab.authoritativeRenderRestore;
    tab.authoritativeRenderRestore = next;
    if (previous !== next) {
      console.debug('Debug: authoritative render restore flag updated', {
        tabId: tab.id,
        type: tab.type || null,
        active: next,
        reason: meta.reason || 'authoritative-render-restore'
      });
    }
    return next;
  }

  function clearTabRenderCache(tab, meta = {}) {
    if (!tab) {
      return false;
    }
    const hadCache = !!(tab.renderCache || tab.renderCacheSignature || tab.renderCacheLayoutSignature || tab.renderCacheTabId);
    tab.renderCache = null;
    tab.renderCacheSignature = null;
    tab.renderCacheLayoutSignature = null;
    tab.renderCacheTabId = null;
    if (hadCache) {
      console.debug('Debug: workspace render cache cleared', {
        tabId: tab.id,
        type: tab.type || null,
        reason: meta.reason || 'clear-render-cache'
      });
    }
    return hadCache;
  }

  function normalizePreservedRenderCacheTabIds(value) {
    if (!Array.isArray(value)) {
      return new Set();
    }
    return new Set(
      value
        .map(item => String(item || '').trim())
        .filter(Boolean)
    );
  }

  function getRenderCacheCapturedAt(tab) {
    return Number(tab?.renderCache?.capturedAt) || 0;
  }

  function getRenderCacheCaptureSequence(tab) {
    return Number(tab?.renderCache?.captureSequence) || 0;
  }

  function sortTabsByOldestRenderCache(a, b) {
    const capturedDelta = getRenderCacheCapturedAt(a) - getRenderCacheCapturedAt(b);
    if (capturedDelta !== 0) {
      return capturedDelta;
    }
    const sequenceDelta = getRenderCacheCaptureSequence(a) - getRenderCacheCaptureSequence(b);
    if (sequenceDelta !== 0) {
      return sequenceDelta;
    }
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  }

  function pruneWarmRenderCaches(options = {}) {
    if (renderCachePruneSuspendDepth > 0 && !options.force) {
      console.debug('Debug: warm render cache prune suspended', {
        depth: renderCachePruneSuspendDepth,
        reason: options.reason || 'unspecified'
      });
      return 0;
    }
    const maxTotal = Math.max(0, Number(options.maxTotal ?? MAX_WARM_RENDER_CACHES_TOTAL) || 0);
    const maxPerType = Math.max(0, Number(options.maxPerType ?? MAX_WARM_RENDER_CACHES_PER_TYPE) || 0);
    const preserveIds = normalizePreservedRenderCacheTabIds(options.preserveTabIds);
    const candidates = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && tab.renderCache && !preserveIds.has(tab.id))
      : [];
    if (!candidates.length) {
      return 0;
    }
    let cleared = 0;
    const clearCache = (tab, reason) => {
      if (clearTabRenderCache(tab, { reason })) {
        cleared += 1;
      }
    };
    const byType = new Map();
    candidates.forEach(tab => {
      const typeKey = String(tab.type || '');
      const bucket = byType.get(typeKey) || [];
      bucket.push(tab);
      byType.set(typeKey, bucket);
    });
    byType.forEach((tabsForType, typeKey) => {
      const sorted = tabsForType.slice().sort(sortTabsByOldestRenderCache);
      if (maxPerType <= 0) {
        sorted.forEach(tab => clearCache(tab, `warm-cache-prune:type:${typeKey || 'unknown'}`));
        return;
      }
      const overflow = sorted.length - maxPerType;
      if (overflow > 0) {
        sorted.slice(0, overflow).forEach(tab => clearCache(tab, `warm-cache-prune:type:${typeKey || 'unknown'}`));
      }
    });
    if (maxTotal >= 0) {
      const remaining = candidates
        .filter(tab => tab.renderCache && !preserveIds.has(tab.id))
        .sort(sortTabsByOldestRenderCache);
      const overflow = remaining.length - maxTotal;
      if (overflow > 0) {
        remaining.slice(0, overflow).forEach(tab => clearCache(tab, 'warm-cache-prune:total'));
      }
    }
    if (cleared > 0) {
      console.debug('Debug: warm render cache pruned', {
        cleared,
        maxTotal,
        maxPerType,
        preserveIds: Array.from(preserveIds)
      });
    }
    return cleared;
  }

  function assignTabPayload(tab, payload, meta = {}) {
    if (!tab) {
      console.debug('Debug: assignTabPayload skipped', { reason: 'no-tab', meta });
      return false;
    }
    // Defensive guard: never overwrite an existing populated payload with null. This
    // happens when the recovery-interval autosave fires while a tab's component is
    // still binding — the component's getPayload() returns null (no live state yet)
    // and we'd otherwise wipe the loaded-from-disk payload, leaving an empty AG-Grid
    // and a render cache that can't be re-validated. The correct behaviour is to
    // treat such calls as no-ops; once the component is fully bound, getPayload()
    // returns real data and a subsequent recovery-interval call will persist it.
    if (!payload && tab.payload) {
      const reason = meta.reason || 'unspecified';
      // Whitelist of reasons that are explicitly clearing the payload. Everything else
      // (recovery-interval, archive-save, persist-active, etc.) is treated as an
      // unintended null read from a tab whose component is still binding.
      const allowExplicitClear = meta.allowClear === true
        || reason === 'graph-selection-reset'
        || reason === 'graph-payload-reset'
        || reason === 'payload-clear';
      if (!allowExplicitClear) {
        console.debug('Debug: assignTabPayload null-overwrite refused', {
          tabId: tab.id,
          reason,
          hadPriorPayload: true
        });
        return false;
      }
    }
    const previousSignature = tab.payloadSignature || null;
    const nextSignature = serializePayloadSignature(payload);
    tab.payload = payload || null;
    tab.payloadSignature = nextSignature;
    if (!payload) {
      tab.previewMarkup = null;
      tab.previewSignature = null;
      tab.previewMeta = null;
      clearTabRenderCache(tab, { reason: meta.reason || 'payload-null' });
      clearTabArchiveRenderCache(tab, { reason: meta.reason || 'payload-null' });
      markTabAuthoritativeRenderRestore(tab, false, { reason: meta.reason || 'payload-null' });
      notifyPreviewIndicator(tab);
      console.debug('Debug: preview cleared via assignTabPayload', { tabId: tab.id, reason: meta.reason || 'payload-null' });
    }
    const changed = previousSignature !== nextSignature;
    if (changed) {
      tab.payloadVersion = Number(tab.payloadVersion || 0) + 1;
      // Payload signature changes ordinarily invalidate the runtime render cache.
      // Exception: when this call is not explicitly capturing a new render cache
      // (captureRenderCache not set), preserve the existing cache and resync its
      // payloadSignature to the new value. This prevents async stat-completion
      // callbacks from clearing a warmup-captured cache without replacing it.
      // The updated signature ensures archive-save and in-session restore paths
      // correctly associate the cache with the new payload.
      const preserveRuntimeCache = meta.preserveRuntimeCacheOnPayloadChange === true;
      if (!preserveRuntimeCache) {
        clearTabRenderCache(tab, { reason: meta.reason || 'payload-changed' });
      } else {
        if (tab.renderCache) {
          tab.renderCache.payloadSignature = nextSignature;
          tab.renderCacheSignature = nextSignature;
        }
        console.debug('Debug: workspace render cache preserved across payload drift', {
          tabId: tab.id,
          type: tab.type || null,
          reason: meta.reason || 'payload-changed'
        });
      }
      clearTabArchiveRenderCache(tab, { reason: meta.reason || 'payload-changed' });
      markTabAuthoritativeRenderRestore(tab, false, { reason: meta.reason || 'payload-changed' });
    }
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

  function updateTabPayload(tabLike, updater, meta = {}) {
    const tab = resolveTab(tabLike);
    if (!tab || tab.isWelcome || !tab.type) {
      console.debug('Debug: updateTabPayload skipped', {
        tabId: typeof tabLike === 'string' ? tabLike : tabLike?.id || null,
        reason: 'missing-tab'
      });
      return false;
    }
    if (typeof updater !== 'function') {
      console.warn('updateTabPayload requires an updater function', { tabId: tab.id, type: tab.type || null });
      return false;
    }
    const previousPayload = clonePayload(tab.payload || null);
    let nextPayload;
    try {
      const draft = clonePayload(tab.payload || null);
      const result = updater(draft, tab);
      nextPayload = typeof result === 'undefined' ? draft : result;
    } catch (err) {
      console.error('updateTabPayload updater error', { tabId: tab.id, type: tab.type || null, err });
      return false;
    }
    const changed = assignTabPayload(tab, nextPayload, {
      reason: meta.reason || 'update-tab-payload',
      allowClear: meta.allowClear === true
    });
    if (!changed) {
      return false;
    }
    markTabPayloadFlushed(tab, meta.reason || 'update-tab-payload');
    tab.userModified = true;
    tab.lastUserModifiedReason = meta.reason || 'update-tab-payload';
    tab.lastUserModifiedAt = Date.now();
    markSessionDirty(meta.reason || 'update-tab-payload', {
      tabId: tab.id,
      type: tab.type || null,
      origin: meta.origin || 'user',
      directPayloadMutation: true,
      previousSignature: serializePayloadSignature(previousPayload),
      nextSignature: tab.payloadSignature || null
    });
    console.debug('Debug: updateTabPayload applied', {
      tabId: tab.id,
      type: tab.type || null,
      reason: meta.reason || 'update-tab-payload'
    });
    return true;
  }

  function persistUserModifiedTabState(tabLike, options = {}) {
    const tab = resolveTab(tabLike) || getActiveTab();
    if (!tab || tab.isWelcome || !tab.type) {
      return false;
    }
    const reason = normalizeReason(options.reason) || 'user-state-change';
    markTabUserModified(tab, reason, {
      origin: 'user',
      affectsPayload: options.affectsPayload !== false
    });
    return persistActiveTabState(tab, {
      ...options,
      reason
    });
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
      renderCacheTabId: null,
      archiveRenderCache: options.archiveRenderCache || null,
      archiveRenderCacheSignature: options.archiveRenderCacheSignature || null,
      archiveRenderCacheLayoutSignature: options.archiveRenderCacheLayoutSignature || null,
      layoutState: options.layoutState || null,
      layoutSignature: options.layoutSignature !== undefined
        ? options.layoutSignature
        : serializePayloadSignature(options.layoutState || null),
      payloadVersion: Number.isFinite(Number(options.payloadVersion))
        ? Math.max(0, Number(options.payloadVersion))
        : 1,
      layoutVersion: Number.isFinite(Number(options.layoutVersion))
        ? Math.max(0, Number(options.layoutVersion))
        : 1,
      renderCommitVersion: Number.isFinite(Number(options.renderCommitVersion))
        ? Math.max(0, Number(options.renderCommitVersion))
        : 1,
      userModified: options.userModified === true,
      lastUserModifiedReason: '',
      lastUserModifiedAt: 0,
      payloadDirty: options.payloadDirty === true,
      payloadDirtyReason: options.payloadDirtyReason || '',
      lastPayloadFlushedReason: '',
      lastPayloadFlushedAt: 0,
      loadedFromArchive: options.loadedFromArchive === true,
      sharedState: options.sharedState && typeof options.sharedState === 'object'
        ? options.sharedState
        : { runtime: {}, resources: {}, styles: {}, metadata: {} },
      // uiState carries non-component UI state that the user expects to round-trip across
      // save/reopen — currently the workspace toolbar's active sub-page selection. Each
      // field is captured during persistActiveTabState (active tab only) and re-applied
      // after the tab is re-activated. Missing or null is treated as "use defaults" so
      // older .graph files load cleanly.
      uiState: options.uiState && typeof options.uiState === 'object'
        ? clonePayload(options.uiState)
        : null
    };
    if (tab.isWelcome) {
      tab.allowClose = false;
    }
    Shared.workspaceTabs?.ensureTabState?.(tab);
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
    // Special-case: treat Venn workspaces as having data only when list/count
    // inputs contain user values. Default labels (A/B/C) should not trigger
    // unsaved-close prompts on an otherwise empty tab.
    if (tab.type === 'venn') {
      try {
        const d = tab.payload.data || {};
        const hasList = (d.listA || '').toString().trim().length > 0
          || (d.listB || '').toString().trim().length > 0
          || (d.listC || '').toString().trim().length > 0;
        const counts = [d.nA, d.nB, d.nC, d.nAB, d.nAC, d.nBC, d.nABC];
        const hasCounts = counts.some(n => Number(n) > 0);
        if (!hasList && !hasCounts) {
          console.debug('Debug: venn tab considered empty (no input lists or counts)', { tabId });
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

  function describeTopLevelPayloadDrift(previousPayload, livePayload, limit = 24) {
    const previousObj = previousPayload && typeof previousPayload === 'object' ? previousPayload : null;
    const liveObj = livePayload && typeof livePayload === 'object' ? livePayload : null;
    if (!previousObj || !liveObj) {
      return [];
    }
    const keys = new Set([...Object.keys(previousObj), ...Object.keys(liveObj)]);
    const changed = [];
    keys.forEach(key => {
      if (changed.length >= limit) {
        return;
      }
      try {
        const previousSignature = serializePayloadSignature(previousObj[key]);
        const liveSignature = serializePayloadSignature(liveObj[key]);
        if (previousSignature !== liveSignature) {
          changed.push(key);
        }
      } catch (err) {
        changed.push(key);
      }
    });
    return changed;
  }


  const RUNTIME_WORKSPACE_ID_PATTERN = /workspace-\d+/g;

  function normalizeRuntimeTabId(value) {
    const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
    return text || '';
  }

  function remapRuntimeWorkspaceString(value, targetTabId) {
    const target = normalizeRuntimeTabId(targetTabId);
    if (!target || typeof value !== 'string' || !RUNTIME_WORKSPACE_ID_PATTERN.test(value)) {
      RUNTIME_WORKSPACE_ID_PATTERN.lastIndex = 0;
      return value;
    }
    RUNTIME_WORKSPACE_ID_PATTERN.lastIndex = 0;
    return value.replace(RUNTIME_WORKSPACE_ID_PATTERN, target);
  }

  function rehomeTabScopedStateInPlace(value, targetTabId, options = {}, seen = new WeakSet(), path = '') {
    const target = normalizeRuntimeTabId(targetTabId);
    if (!target || value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return remapRuntimeWorkspaceString(value, target);
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        value[i] = rehomeTabScopedStateInPlace(value[i], target, options, seen, `${path}[${i}]`);
      }
      return value;
    }
    Object.keys(value).forEach(key => {
      const nextKey = options.remapKeys === false ? key : remapRuntimeWorkspaceString(key, target);
      const childPath = path ? `${path}.${key}` : key;
      const remapped = rehomeTabScopedStateInPlace(value[key], target, options, seen, childPath);
      if (nextKey !== key) {
        delete value[key];
      }
      value[nextKey] = remapped;
    });
    return value;
  }

  function rehomeTabScopedState(value, targetTabId, options = {}) {
    if (value === null || value === undefined) {
      return value;
    }
    const clone = clonePayload(value);
    return rehomeTabScopedStateInPlace(clone, targetTabId, options);
  }

  function collectRuntimeWorkspaceIds(value, out = new Set(), seen = new WeakSet()) {
    if (value === null || value === undefined) {
      return out;
    }
    if (typeof value === 'string') {
      const matches = value.match(/workspace-\d+/g);
      if (matches) {
        matches.forEach(id => out.add(id));
      }
      return out;
    }
    if (typeof value !== 'object' || seen.has(value)) {
      return out;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => collectRuntimeWorkspaceIds(item, out, seen));
      return out;
    }
    Object.entries(value).forEach(([key, child]) => {
      collectRuntimeWorkspaceIds(key, out, seen);
      collectRuntimeWorkspaceIds(child, out, seen);
    });
    return out;
  }

  function shouldRunSkippedPayloadDriftProbe(reason, options = {}) {
    const snapshotIntent = resolveSnapshotIntent(options);
    if (typeof snapshotIntent.runSkippedPayloadDriftProbe === 'boolean') {
      return snapshotIntent.runSkippedPayloadDriftProbe;
    }
    if (options.disableDriftProbe === true) {
      return false;
    }
    if (options.forceDriftProbe === true) {
      return true;
    }
    if (typeof window !== 'undefined' && window.Shared && window.Shared.__driftDetectOnSkip === false) {
      return false;
    }
    if (typeof window !== 'undefined' && window.Shared && window.Shared.__driftDetectOnSkip === true) {
      return true;
    }
    const normalized = normalizeReason(reason);
    if (normalized === 'archive-save' || normalized === 'document-snapshot' || normalized === 'unsaved-save') {
      return true;
    }
    if (normalized.includes('save') && !normalized.includes('autosave')) {
      return true;
    }
    if (options.manualSave === true || options.origin === 'user') {
      return true;
    }
    if (typeof window !== 'undefined') {
      let debugFlag = window.__GRAPHITIX_DEBUG__ === true || window.__GRAPHITIX_DEV__ === true;
      try {
        debugFlag = debugFlag || window.localStorage?.getItem?.('graphitix.debug') === 'true';
      } catch (err) {
        // Accessing localStorage can throw under some browser privacy/sandbox modes.
      }
      if (debugFlag) {
        return true;
      }
    }
    return false;
  }

  function shouldPromoteSkippedPayloadDrift(reason, options = {}) {
    const snapshotIntent = resolveSnapshotIntent(options);
    if (typeof snapshotIntent.promoteSkippedPayloadDrift === 'boolean') {
      return snapshotIntent.promoteSkippedPayloadDrift;
    }
    if (options.promoteDriftProbePayload === false) {
      return false;
    }
    if (options.promoteDriftProbePayload === true) {
      return true;
    }
    const normalized = normalizeReason(reason).toLowerCase();
    if (options.manualSave === true || options.origin === 'user' || options.origin === 'regression') {
      return true;
    }
    return isSaveLikeLiveCaptureReason(normalized, options);
  }

  function shouldWarnOnPayloadDrift() {
    if (typeof window === 'undefined' || !window.Shared) {
      return false;
    }
    return window.Shared.__strictPayloadDriftWarnings === true;
  }

  function shouldInvalidateArchiveOnLayoutSignatureChange(tab, options = {}) {
    if (!tab) {
      return false;
    }
    if (options.preserveArchiveRenderCache === true) {
      return false;
    }
    if (options.invalidateArchiveRenderCache === true) {
      return true;
    }
    const origin = String(options.origin || '').trim().toLowerCase();
    if (origin === 'user') {
      return true;
    }
    if (tab.payloadDirty || tab.userModified) {
      return true;
    }
    return false;
  }

  function captureExactTabLayoutClone(tab, reason) {
    if (!tab || !tab.type || !Shared.componentLayout?.captureStateFor) {
      return { captured: false, clone: null, raw: null };
    }
    let raw = null;
    try {
      raw = Shared.componentLayout.captureStateFor(tab.type, {
        tabId: tab.id,
        exact: true,
        reason
      });
    } catch (err) {
      console.error('captureExactTabLayoutClone error', {
        tabId: tab.id,
        type: tab.type,
        reason,
        err
      });
      return { captured: false, clone: null, raw: null };
    }
    if (!raw) {
      // A valid live-DOM fast path may intentionally avoid a full component rebind.
      // For save/recovery/deactivation snapshots, keep the last authoritative tab
      // layout instead of emitting a hard warning that fails the regression harness.
      // User-visible size changes still go through the active layout registry, so a
      // missing exact registry here means "reuse stored layout", not "invent a new
      // layout".
      if (tab.layoutState && typeof tab.layoutState === 'object') {
        const fallback = Shared.componentLayout?.withTabLayoutOverrides
          ? Shared.componentLayout.withTabLayoutOverrides(tab.layoutState, tab)
          : tab.layoutState;
        console.debug('Debug: captureExactTabLayoutClone using stored layout fallback', {
          tabId: tab.id,
          type: tab.type,
          reason,
          previousLayoutSignature: tab.layoutSignature || null
        });
        return { captured: true, clone: clonePayload(fallback), raw: null, fallback: true };
      }
      console.debug('Debug: captureExactTabLayoutClone unavailable without stored fallback', {
        tabId: tab.id,
        type: tab.type,
        reason,
        previousLayoutSignature: tab.layoutSignature || null
      });
      return { captured: false, clone: null, raw: null };
    }
    const withOverrides = Shared.componentLayout?.withTabLayoutOverrides
      ? Shared.componentLayout.withTabLayoutOverrides(raw, tab)
      : raw;
    return {
      captured: true,
      clone: clonePayload(withOverrides),
      raw
    };
  }

  function syncTabLayoutAspectStateFromClone(tab, layoutClone) {
    const aspectLocked = layoutClone?.svgBox?.dataset?.resizerAspectLocked;
    if (aspectLocked !== 'true' && aspectLocked !== 'false') {
      return false;
    }
    tab.sharedState = tab.sharedState || {};
    tab.sharedState.layout = tab.sharedState.layout || {};
    tab.sharedState.layout.resizer = tab.sharedState.layout.resizer || {};
    tab.sharedState.layout.resizer.aspectLocked = aspectLocked === 'true';
    if (layoutClone?.svgBox?.dataset?.resizerAspectRatio) {
      tab.sharedState.layout.resizer.aspectRatio = String(layoutClone.svgBox.dataset.resizerAspectRatio);
    }
    return true;
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
    const reason = options.reason || 'persist-active';
    const snapshotIntent = resolveSnapshotIntent(options);
    // Skip the live-state read for any persist call where the tab is clean (no
    // user modifications since last flush) AND the call is either autosave-like
    // (recovery-interval, archive-save, etc.) OR a lifecycle event (tab activation
    // switch, deactivation, warmup, etc.). For these calls tab.payload is already
    // authoritative — running config.getPayload() risks projecting half-bound
    // component state over a perfectly good loaded-from-disk payload.
    const isLifecycleOrigin = options.origin === 'lifecycle';
    const skipCaptureBlockedByReason = reason === 'duplicate-before-create'
      || reason === 'add-tab-before-new';
    const shouldCaptureLivePayloadForSave = snapshotIntent.captureLivePayload === true
      || isSaveLikeLiveCaptureReason(reason, options);
    const allowSkipLivePayloadCapture = snapshotIntent.allowSkipLivePayloadCapture !== false;
    const lifecycleSkipEligible = snapshotIntent.lifecycleSnapshot === true
      || (snapshotIntent.lifecycleSnapshot !== false && isLifecycleOrigin);
    const reasonSkipEligible = snapshotIntent.reasonSkippable === true
      || (snapshotIntent.reasonSkippable !== false && isLiveCaptureSkippableReason(reason));
    const explicitSkipLivePayloadCapture = snapshotIntent.skipLivePayloadCapture === true
      || snapshotIntent.captureLivePayload === false;
    const shouldSkipLivePayloadCapture = !!(tab.payload
      && !tab.payloadDirty
      && !tab.userModified
      && !skipCaptureBlockedByReason
      && !shouldCaptureLivePayloadForSave
      && allowSkipLivePayloadCapture
      && (explicitSkipLivePayloadCapture || reasonSkipEligible || lifecycleSkipEligible));
    const captureRenderCacheOnly = () => {
      if (options.captureRenderCache && typeof config.captureRenderCache === 'function') {
        try {
          const captured = normalizeRenderCacheShapeForTab(config.captureRenderCache({
            tabId: tab.id,
            type: tab.type,
            reason
          }), tab, { reason });
          const cacheForStorage = captured
            ? normalizeRenderCacheShapeForTab(cloneRenderCacheForStorage(captured), tab, { reason: `${reason}:storage-clone` })
            : null;
          if (captured) {
            restoreLiveDomAfterRenderCacheCapture(config, captured, tab, reason);
          }
          if (cacheForStorage) {
            const capturedAt = Date.now();
            tab.renderCommitVersion = Math.max(
              Number(tab.renderCommitVersion || 0),
              Number(tab.payloadVersion || 0),
              Number(tab.layoutVersion || 0)
            );
            tab.renderCache = {
              cache: cacheForStorage,
              tabId: tab.id,
              type: tab.type || null,
              payloadSignature: tab.payloadSignature || null,
              layoutSignature: tab.layoutSignature || null,
              payloadVersion: Number(tab.payloadVersion || 0),
              layoutVersion: Number(tab.layoutVersion || 0),
              renderCommitVersion: Number(tab.renderCommitVersion || 0),
              capturedAt,
              captureSequence: ++renderCacheCaptureSequence
            };
            tab.renderCacheSignature = tab.payloadSignature || null;
            tab.renderCacheLayoutSignature = tab.layoutSignature || null;
            tab.renderCacheTabId = tab.id;
            if (tab.previewMeta && tab.previewSignature === (tab.payloadSignature || null)) {
              tab.previewMeta.renderCacheSequence = tab.renderCache.captureSequence;
              tab.previewMeta.renderCacheCapturedAt = capturedAt;
            }
          } else {
            clearTabRenderCache(tab, { reason: `${reason}:capture-empty` });
          }
          if (options.disableRenderCachePrune !== true) {
            pruneWarmRenderCaches({
              preserveTabIds: [tab.id, ...(options.preserveRenderCacheTabIds || [])],
              reason
            });
          }
        } catch (err) {
          console.error('persistActiveTabState render cache error', { tabId: tab.id, type: tab.type, err });
        }
      }
    };
    if (shouldSkipLivePayloadCapture) {
      const previousLayoutSignature = tab.layoutSignature || null;
      if (Shared.workspaceTabs?.captureRuntimeState) {
        Shared.workspaceTabs.captureRuntimeState(tab, tab.type, config, {
          reason
        });
      }
      const skippedLayoutCapture = captureExactTabLayoutClone(tab, reason);
      let skippedLayoutChanged = false;
      if (skippedLayoutCapture.captured) {
        const skippedLayoutClone = skippedLayoutCapture.clone;
        syncTabLayoutAspectStateFromClone(tab, skippedLayoutClone);
        tab.layoutState = skippedLayoutClone;
        tab.layoutSignature = serializePayloadSignature(skippedLayoutClone);
        skippedLayoutChanged = previousLayoutSignature !== tab.layoutSignature;
        if (skippedLayoutChanged) {
          tab.layoutVersion = Number(tab.layoutVersion || 0) + 1;
        }
        if (skippedLayoutChanged) {
          if (shouldInvalidateArchiveOnLayoutSignatureChange(tab, options)) {
            clearTabArchiveRenderCache(tab, { reason: options.reason || 'layout-changed-skip' });
          } else {
            console.debug('Debug: archive render cache preserved across layout signature drift (skip path)', {
              tabId: tab.id,
              type: tab.type || null,
              reason: options.reason || 'layout-changed-skip',
              origin: options.origin || null
            });
          }
          markTabAuthoritativeRenderRestore(tab, false, { reason: options.reason || 'layout-changed-skip' });
        }
      } else {
        console.warn('persistActiveTabState kept previous layout because exact tab layout capture failed', {
          tabId: tab.id,
          type: tab.type,
          reason,
          previousLayoutSignature
        });
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
        const capturedUiState = captureWorkspaceUiState(tab);
        if (capturedUiState) {
          tab.uiState = capturedUiState;
        }
      }
      captureRenderCacheOnly();
      if (previews && typeof previews.updateTabPreviewFromWorkspace === 'function') {
        previews.updateTabPreviewFromWorkspace(tab, config, {
          reason: options.reason || 'persist-active-skip',
          forceCapture: skippedLayoutChanged
        });
      }
      // Best-effort drift probe for clean tabs whose live payload capture is skipped.
      // For explicit save/user/regression snapshots we now promote detected drift into
      // the authoritative tab payload to prevent stale reopen payloads.
      let driftHealed = false;
      if (shouldRunSkippedPayloadDriftProbe(reason, options) && typeof config.getPayload === 'function') {
        try {
          const probe = config.getPayload({
            tabId: tab.id,
            type: tab.type,
            reason: `${reason}:skipped-drift-probe`,
            origin: options.origin || null
          });
          if (probe) {
            const probeSig = serializePayloadSignature(probe);
            if (probeSig && tab.payloadSignature && probeSig !== tab.payloadSignature) {
              const changedTopLevelKeys = describeTopLevelPayloadDrift(tab.payload, probe);
              const shouldPromote = shouldPromoteSkippedPayloadDrift(reason, options);
              const driftLog = {
                tabId: tab.id,
                type: tab.type,
                reason,
                origin: options.origin || null,
                changedTopLevelKeys,
                changedTopLevelKeysText: changedTopLevelKeys.join(','),
                cachedSignatureLength: tab.payloadSignature.length,
                liveSignatureLength: probeSig.length
              };
              if (shouldPromote) {
                const changed = assignTabPayload(tab, clonePayload(probe), {
                  reason: `${reason}:skipped-drift-promote`
                });
                markTabPayloadFlushed(tab, `${reason}:skipped-drift-promote`);
                if (changed) {
                  clearTabRenderCache(tab, { reason: `${reason}:skipped-drift-promote` });
                  clearTabArchiveRenderCache(tab, { reason: `${reason}:skipped-drift-promote` });
                  markTabAuthoritativeRenderRestore(tab, false, { reason: `${reason}:skipped-drift-promote` });
                  driftHealed = true;
                  console.debug('Debug: persistActiveTabState skipped-path drift observed and promoted', driftLog);
                }
              } else if (shouldWarnOnPayloadDrift()) {
                console.warn('persistActiveTabState DRIFT on skipped path (clean tab projects different payload)', driftLog);
              } else {
                console.debug('Debug: persistActiveTabState skipped-path drift observed', driftLog);
              }
            }
          }
        } catch (err) {
          console.debug('Debug: persistActiveTabState skipped-path drift probe failed', {
            tabId: tab.id,
            type: tab.type,
            reason,
            message: err?.message || String(err)
          });
        }
      }
      if (driftHealed && previews && typeof previews.updateTabPreviewFromWorkspace === 'function') {
        previews.updateTabPreviewFromWorkspace(tab, config, {
          reason: `${options.reason || 'persist-active-skip'}:drift-heal-preview`,
          forceCapture: true
        });
      }
      console.debug('Debug: persistActiveTabState skipped live payload capture', {
        tabId: tab.id,
        type: tab.type,
        reason,
        driftHealed,
        payloadDirty: !!tab.payloadDirty,
        userModified: !!tab.userModified
      });
      return false;
    }
    // If the tab has been loaded from disk but its component has never bound to it
    // (no entry in loadedWorkspaces), getPayload() will read live state that doesn't
    // match the loaded-from-disk payload — typically returning null/empty because
    // the component's data structures haven't been hydrated yet. Persisting that
    // partial state would overwrite the authoritative archive payload. Skip.
    const isAutosaveLikeReason = snapshotIntent.reasonSkippable === true
      || (snapshotIntent.reasonSkippable !== false && isLiveCaptureSkippableReason(reason));
    if (isAutosaveLikeReason && tab.payload && !workspaceState.loadedWorkspaces?.[tab.id]) {
      console.debug('Debug: persistActiveTabState skipped (tab not bound)', {
        tabId: tab.id,
        type: tab.type,
        reason
      });
      return false;
    }
    try {
      const payload = config.getPayload({
        tabId: tab.id,
        type: tab.type,
        reason: `${reason}:authoritative-capture`,
        origin: options.origin || null
      });
      let payloadClone = clonePayload(payload);
      if (Shared.workspaceTabs?.captureSharedPayloadState) {
        Shared.workspaceTabs.captureSharedPayloadState(tab, tab.type, payloadClone, config, {
          reason
        });
      }
      if (Shared.workspaceTabs?.captureRuntimeState) {
        Shared.workspaceTabs.captureRuntimeState(tab, tab.type, config, {
          reason
        });
      }
      if (typeof config.roundTripPayload === 'function') {
        try {
          const roundTripResult = config.roundTripPayload(payloadClone, {
            tab,
            tabId: tab.id,
            type: tab.type,
            reason,
            origin: options.origin || null
          });
          if (roundTripResult && roundTripResult.ok === false) {
            console.warn('Debug: persistActiveTabState payload round-trip self-test failed', {
              tabId: tab.id,
              type: tab.type,
              reason,
              changedTopLevelKeys: roundTripResult.changedTopLevelKeys || null,
              error: roundTripResult.error || null
            });
          }
        } catch (err) {
          console.error('persistActiveTabState payload round-trip self-test error', { tabId: tab.id, type: tab.type, reason, err });
        }
      }
      const layoutCapture = captureExactTabLayoutClone(tab, reason);
      const previousLayoutClone = clonePayload(tab.layoutState || null);
      let layoutClone = layoutCapture.captured ? layoutCapture.clone : previousLayoutClone;
      if (layoutCapture.captured) {
        syncTabLayoutAspectStateFromClone(tab, layoutClone);
      } else {
        console.warn('persistActiveTabState will reuse previous layout because exact tab layout capture failed', {
          tabId: tab.id,
          type: tab.type,
          reason,
          previousLayoutSignature: tab.layoutSignature || null
        });
      }
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
      // Drift detector: when the live read produces a different signature than the
      // clean cached payload, *something* in the component mutated state without
      // routing through markTabUserModified / updateTabPayload. Surface the offender
      // by name so we can find and migrate it. Skipped in production-disabled debug,
      // and skipped when payloadDirty is true (in which case drift is expected).
      if (!tab.payloadDirty && tab.payload && payloadClone) {
        const livePayloadSignature = serializePayloadSignature(payloadClone);
        const previousPayloadSignature = tab.payloadSignature || null;
        if (previousPayloadSignature && livePayloadSignature !== previousPayloadSignature) {
          const driftLog = {
            tabId: tab.id,
            type: tab.type || null,
            reason,
            origin: options.origin || null,
            changedTopLevelKeys: describeTopLevelPayloadDrift(tab.payload, payloadClone),
            changedTopLevelKeysText: describeTopLevelPayloadDrift(tab.payload, payloadClone).join(','),
            previousSignatureLength: previousPayloadSignature.length,
            liveSignatureLength: livePayloadSignature.length
          };
          if (shouldWarnOnPayloadDrift()) {
            console.warn('persistActiveTabState payload drift detected (clean tab projected a different signature)', driftLog);
          } else {
            console.debug('Debug: persistActiveTabState payload drift observed (auto-healed by live capture)', driftLog);
          }
        }
      }
      // Preserve the render cache through payload drift whenever this call is not
      // explicitly requesting a replacement capture. This handles async callbacks
      // (e.g. scatter-stats-computed) that update the stored payload after warmup
      // has already captured a good render cache, but don't supply a new one.
      const preserveRuntimeCacheOnPayloadChange = !options.captureRenderCache && !!tab.renderCache;
      // Only force a fresh capture post-drift for recovery paths that explicitly want it.
      const forceCaptureRenderCacheAfterPayloadChange = isLifecycleOrigin
        && reason.includes('recovery-interval')
        && !options.captureRenderCache
        && !!tab.renderCache;
      const changed = assignTabPayload(tab, payloadClone, {
        reason,
        preserveRuntimeCacheOnPayloadChange
      });
      markTabPayloadFlushed(tab, reason);
      tab.layoutState = layoutClone;
      tab.layoutSignature = serializePayloadSignature(layoutClone);
      const layoutChanged = previousLayoutSignature !== tab.layoutSignature;
      if (layoutChanged) {
        tab.layoutVersion = Number(tab.layoutVersion || 0) + 1;
      }
      if (layoutChanged) {
        if (shouldInvalidateArchiveOnLayoutSignatureChange(tab, options)) {
          clearTabArchiveRenderCache(tab, { reason: options.reason || 'layout-changed' });
        } else {
          console.debug('Debug: archive render cache preserved across layout signature drift', {
            tabId: tab.id,
            type: tab.type || null,
            reason: options.reason || 'layout-changed',
            origin: options.origin || null
          });
        }
        markTabAuthoritativeRenderRestore(tab, false, { reason: options.reason || 'layout-changed' });
      }
      const previewNeedsCapture = options.forcePreviewCapture === true
        || changed
        || layoutChanged
        || (tab.previewSignature !== tab.payloadSignature)
        || (tab.layoutSignature && tab.previewMeta?.layoutSignature !== tab.layoutSignature);
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
      if ((options.captureRenderCache || (forceCaptureRenderCacheAfterPayloadChange && changed))
        && typeof config.captureRenderCache === 'function') {
        try {
          const captured = normalizeRenderCacheShapeForTab(config.captureRenderCache({
            tabId: tab.id,
            type: tab.type,
            reason: options.reason || 'persist-active'
          }), tab, { reason: options.reason || 'persist-active' });
          const cacheForStorage = captured
            ? normalizeRenderCacheShapeForTab(cloneRenderCacheForStorage(captured), tab, { reason: `${options.reason || 'persist-active'}:storage-clone` })
            : null;
          if (captured) {
            restoreLiveDomAfterRenderCacheCapture(config, captured, tab, options.reason || 'persist-active');
          }
          if (cacheForStorage) {
            const capturedAt = Date.now();
            tab.renderCommitVersion = Math.max(
              Number(tab.renderCommitVersion || 0),
              Number(tab.payloadVersion || 0),
              Number(tab.layoutVersion || 0)
            );
            tab.renderCache = {
              cache: cacheForStorage,
              tabId: tab.id,
              type: tab.type || null,
              payloadSignature: tab.payloadSignature || null,
              layoutSignature: tab.layoutSignature || null,
              payloadVersion: Number(tab.payloadVersion || 0),
              layoutVersion: Number(tab.layoutVersion || 0),
              renderCommitVersion: Number(tab.renderCommitVersion || 0),
              capturedAt,
              captureSequence: ++renderCacheCaptureSequence
            };
            tab.renderCacheSignature = tab.payloadSignature || null;
            tab.renderCacheLayoutSignature = tab.layoutSignature || null;
            tab.renderCacheTabId = tab.id;
            if (tab.previewMeta && tab.previewSignature === (tab.payloadSignature || null)) {
              tab.previewMeta.renderCacheSequence = tab.renderCache.captureSequence;
              tab.previewMeta.renderCacheCapturedAt = capturedAt;
            }
          } else {
            clearTabRenderCache(tab, { reason: `${options.reason || 'persist-active'}:capture-empty` });
          }
          console.debug('Debug: workspace render cache captured', {
            tabId: tab.id,
            type: tab.type,
            hasCache: !!captured
          });
          if (options.disableRenderCachePrune !== true) {
            pruneWarmRenderCaches({
              preserveTabIds: [tab.id, ...(options.preserveRenderCacheTabIds || [])],
              reason: options.reason || 'persist-active'
            });
          }
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
      // Capture workspace UI state for the active tab (toolbar sub-page + per-component
      // state like table scroll/selection). Inactive tabs aren't mounted, so their state
      // isn't accessible — they keep whatever uiState they previously had.
      if (workspaceState.activeTabId === tab.id) {
        const captured = captureWorkspaceUiState(tab);
        if (captured) {
          tab.uiState = captured;
        }
      }
      if (changed || layoutChanged) {
        const lifecyclePersist = isLifecycleDirtyReason(reason, options || {});
        if (!lifecyclePersist) {
          tab.userModified = true;
          tab.lastUserModifiedReason = reason;
          tab.lastUserModifiedAt = Date.now();
        }
        markSessionDirty(options.reason || 'tab-state-updated', {
          tabId: tab.id,
          type: tab.type,
          layoutChanged,
          origin: lifecyclePersist ? 'lifecycle' : (options.origin || null)
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

  // Top-level workspace UI-state capture for the active tab. Combines the workspace
  // toolbar's active sub-page (DOM dataset) with per-component UI state (table scroll,
  // selection) into a single uiState blob suitable for round-tripping through the
  // archive. Inactive tabs are not visited — they keep whatever uiState they had.
  function captureWorkspaceUiState(tab) {
    if (!tab || tab.isWelcome || !tab.type) {
      return null;
    }
    const toolbar = captureWorkspaceToolbarUiState(tab);
    const componentUi = captureWorkspaceComponentUiState(tab);
    if (!toolbar && !componentUi) {
      return null;
    }
    const merged = Object.assign({}, tab.uiState || {});
    if (toolbar) {
      Object.assign(merged, toolbar);
    }
    if (componentUi) {
      merged.component = Object.assign({}, merged.component || {}, componentUi);
    }
    return merged;
  }

  // Top-level workspace UI-state apply for the active tab. Restores the toolbar sub-page
  // and dispatches the per-component state. Each leg is best-effort and isolated by its
  // own try/catch so a flaky component cannot prevent the rest of the activation path.
  function applyWorkspaceUiState(tab, options = {}) {
    if (!tab || !tab.uiState || tab.isWelcome) {
      return false;
    }
    let appliedAny = false;
    try {
      if (applyWorkspaceToolbarUiState(tab, options)) {
        appliedAny = true;
      }
    } catch (err) {
      console.error('applyWorkspaceUiState toolbar error', { tabId: tab.id, type: tab.type, err });
    }
    if (tab.uiState.component) {
      try {
        if (applyWorkspaceComponentUiState(tab, options)) {
          appliedAny = true;
        }
      } catch (err) {
        console.error('applyWorkspaceUiState component error', { tabId: tab.id, type: tab.type, err });
      }
    }
    return appliedAny;
  }

  // Capture per-component UI state via the registry hook (component opts in by exposing
  // captureUiState on its public API and the registry forwarder). Returns null if the
  // active tab type doesn't expose the hook or returns nothing meaningful.
  function captureWorkspaceComponentUiState(tab) {
    if (!tab || tab.isWelcome || !tab.type) {
      return null;
    }
    const config = window.Main?.components?.registry?.[tab.type] || null;
    if (!config || typeof config.captureUiState !== 'function') {
      return null;
    }
    try {
      const captured = config.captureUiState({ tabId: tab.id, type: tab.type });
      if (captured && typeof captured === 'object' && Object.keys(captured).length > 0) {
        return captured;
      }
    } catch (err) {
      console.error('captureWorkspaceComponentUiState error', { tabId: tab.id, type: tab.type, err });
    }
    return null;
  }

  function applyWorkspaceComponentUiState(tab, options = {}) {
    if (!tab || tab.isWelcome || !tab.type || !tab.uiState || !tab.uiState.component) {
      return false;
    }
    const config = window.Main?.components?.registry?.[tab.type] || null;
    if (!config || typeof config.applyUiState !== 'function') {
      return false;
    }
    try {
      return !!config.applyUiState(tab.uiState.component, {
        tabId: tab.id,
        type: tab.type,
        reason: options.reason || 'apply-component-uiState'
      });
    } catch (err) {
      console.error('applyWorkspaceComponentUiState error', { tabId: tab.id, type: tab.type, err });
      return false;
    }
  }

  function captureWorkspaceToolbarUiState(tab) {
    if (!tab || tab.isWelcome || !tab.type) {
      return null;
    }
    let mountedRoot = null;
    try {
      mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tab, tab.type) || null;
    } catch (err) {
      console.error('captureWorkspaceToolbarUiState getMountedRoot error', { tabId: tab.id, type: tab.type, err });
      mountedRoot = null;
    }
    const toolbar = mountedRoot?.querySelector?.('.workspace-toolbar');
    if (!toolbar || !toolbar.dataset) {
      return null;
    }
    const captured = {};
    const activeSection = String(toolbar.dataset.toolbarActiveSection || '').trim();
    const manualSection = String(toolbar.dataset.toolbarManualSection || '').trim();
    if (activeSection) {
      captured.toolbarActiveSection = activeSection;
    }
    if (manualSection && manualSection !== activeSection) {
      captured.toolbarManualSection = manualSection;
    }
    return Object.keys(captured).length ? captured : null;
  }

  function applyWorkspaceToolbarUiState(tab, options = {}) {
    if (!tab || tab.isWelcome || !tab.type || !tab.uiState) {
      return false;
    }
    const desiredSection = String(tab.uiState.toolbarActiveSection || '').trim();
    if (!desiredSection) {
      return false;
    }
    let mountedRoot = null;
    try {
      mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tab, tab.type) || null;
    } catch (err) {
      console.error('applyWorkspaceToolbarUiState getMountedRoot error', { tabId: tab.id, type: tab.type, err });
      mountedRoot = null;
    }
    const toolbar = mountedRoot?.querySelector?.('.workspace-toolbar');
    if (!toolbar || typeof Shared.workspaceToolbar?.activateSection !== 'function') {
      // Fall back to direct dataset manipulation if no helper is exported. The toolbar
      // module's setToolbarActiveSection is internal, but the dataset is the source of
      // truth read by syncToolbarContextSection on the next interaction.
      if (toolbar && toolbar.dataset) {
        toolbar.dataset.toolbarActiveSection = desiredSection;
        if (tab.uiState.toolbarManualSection) {
          toolbar.dataset.toolbarManualSection = String(tab.uiState.toolbarManualSection);
        }
        // Toggle the visible section/tab classes manually since we have no helper.
        const sections = toolbar.querySelectorAll('.workspace-toolbar__section[data-toolbar-section-id]');
        let matched = false;
        sections.forEach(section => {
          const isActive = section.dataset.toolbarSectionId === desiredSection;
          section.classList.toggle('workspace-toolbar__section--active', isActive);
          section.toggleAttribute('hidden', !isActive);
          if (isActive) matched = true;
        });
        if (matched) {
          const tabs = toolbar.querySelectorAll('.workspace-toolbar__tab[data-toolbar-section-target]');
          tabs.forEach(tabEl => {
            const isActive = tabEl.dataset.toolbarSectionTarget === desiredSection;
            tabEl.classList.toggle('workspace-toolbar__tab--active', isActive);
            tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tabEl.tabIndex = isActive ? 0 : -1;
          });
          console.debug('Debug: workspace toolbar uiState applied via fallback', {
            tabId: tab.id,
            type: tab.type,
            section: desiredSection,
            reason: options.reason || 'apply-uiState'
          });
          return true;
        }
      }
      return false;
    }
    try {
      Shared.workspaceToolbar.activateSection(toolbar, desiredSection, { manual: true });
      console.debug('Debug: workspace toolbar uiState applied', {
        tabId: tab.id,
        type: tab.type,
        section: desiredSection,
        reason: options.reason || 'apply-uiState'
      });
      return true;
    } catch (err) {
      console.error('applyWorkspaceToolbarUiState error', { tabId: tab.id, type: tab.type, err });
      return false;
    }
  }

  // Single source of truth for the payload+layout cloning + graphSizing enrichment that
  // every archive-bound tab snapshot must apply. Shared between buildSessionPayload (the
  // legacy session-level builder) and buildArchiveTabSnapshot (the live save path in
  // sessionActions.js) so both produce the same payload/layout shape.
  function enrichTabSnapshotForArchive(tab, options = {}) {
    if (!tab) {
      return { payload: null, layout: null };
    }
    const contextLabel = String(options.contextLabel || 'archive-snapshot');
    let payloadClone = clonePayload(tab.payload || null);
    let layoutClone = clonePayload(tab.layoutState || null);
    const type = tab.type || (payloadClone && payloadClone.type) || null;
    if (Shared.graphSizing?.enrichPayloadWithLayout) {
      try {
        payloadClone = Shared.graphSizing.enrichPayloadWithLayout(type, payloadClone, layoutClone, {
          context: `${contextLabel}-${type || 'unknown'}`
        });
      } catch (err) {
        console.error('enrichTabSnapshotForArchive enrich error', {
          tabId: tab.id,
          type,
          context: contextLabel,
          err
        });
      }
    }
    if (Shared.graphSizing?.mergePayloadSizingIntoLayout) {
      try {
        layoutClone = Shared.graphSizing.mergePayloadSizingIntoLayout(layoutClone, payloadClone, {
          context: `${contextLabel}-layout-${type || 'unknown'}`
        });
      } catch (err) {
        console.error('enrichTabSnapshotForArchive layout merge error', {
          tabId: tab.id,
          type,
          context: contextLabel,
          err
        });
      }
    }
    return { payload: payloadClone, layout: layoutClone };
  }

  function applySessionData(session, options = {}) {
    const tabs = Array.isArray(session?.tabs) ? session.tabs : [];
    if (window.Shared?.undoManager?.clear) {
      window.Shared.undoManager.clear({ reason: options.reason || 'session-load' });
    }
    if (typeof options.hideDuplicatePrompt === 'function') {
      options.hideDuplicatePrompt();
      console.debug('Debug: session apply requested duplicate prompt hide', { reason: options.reason || 'session-load' });
    }
    disposeWorkspaceTabs(workspaceState.tabs, {
      reason: options.reason || 'session-load-replace'
    });
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
      workspaceState.sessionFilePath = options.fileHandle?.__desktopFilePath || options.filePath || '';
      console.debug('Debug: session file handle applied', { hasHandle: !!options.fileHandle });
    }
    if (options.fileName) {
      workspaceState.sessionFileName = options.fileName;
      console.debug('Debug: session file name applied', { name: workspaceState.sessionFileName });
    }
    if (Object.prototype.hasOwnProperty.call(options, 'filePath')) {
      workspaceState.sessionFilePath = options.filePath || workspaceState.sessionFilePath || '';
      console.debug('Debug: session file path applied', { hasPath: !!workspaceState.sessionFilePath });
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
      const predictedRuntimeTabId = `workspace-${workspaceState.nextId}`;
      const clonedPayload = clonePayload(tabData.payload) || null;
      const clonedLayout = rehomeTabScopedState(tabData.layout || null, predictedRuntimeTabId);
      const clonedPreviewMeta = tabData.previewMeta && typeof tabData.previewMeta === 'object'
        ? rehomeTabScopedState(tabData.previewMeta, predictedRuntimeTabId)
        : null;
      const clonedPreviewMarkup = typeof tabData.previewMarkup === 'string'
        ? remapRuntimeWorkspaceString(tabData.previewMarkup, predictedRuntimeTabId)
        : null;
      const clonedArchiveRenderCache = tabData.archiveRenderCache && typeof tabData.archiveRenderCache === 'object'
        ? rehomeTabScopedState(tabData.archiveRenderCache, predictedRuntimeTabId)
        : null;
      const clonedUiState = tabData.uiState && typeof tabData.uiState === 'object'
        ? rehomeTabScopedState(tabData.uiState, predictedRuntimeTabId)
        : null;
      const oldRuntimeIds = Array.from(collectRuntimeWorkspaceIds({
        layout: tabData.layout || null,
        previewMarkup: tabData.previewMarkup || null,
        previewMeta: tabData.previewMeta || null,
        archiveRenderCache: tabData.archiveRenderCache || null,
        uiState: tabData.uiState || null
      })).filter(id => id !== predictedRuntimeTabId);
      if (oldRuntimeIds.length) {
        console.debug('Debug: session remapped archive runtime tab ids', {
          title: tabData.title || `Workspace ${index + 1}`,
          type: tabData.type,
          targetTabId: predictedRuntimeTabId,
          oldRuntimeIds
        });
      }
      const staleRuntimeIds = [
        ...assertNoStaleRuntimeWorkspaceIds('layout', predictedRuntimeTabId, clonedLayout),
        ...assertNoStaleRuntimeWorkspaceIds('previewMeta', predictedRuntimeTabId, clonedPreviewMeta),
        ...assertNoStaleRuntimeWorkspaceIds('previewMarkup', predictedRuntimeTabId, clonedPreviewMarkup),
        ...assertNoStaleRuntimeWorkspaceIds('archiveRenderCache', predictedRuntimeTabId, clonedArchiveRenderCache),
        ...assertNoStaleRuntimeWorkspaceIds('uiState', predictedRuntimeTabId, clonedUiState)
      ];
      if (staleRuntimeIds.length) {
        console.warn('Debug: session archive tab contains stale runtime ids after rehome', {
          title: tabData.title || `Workspace ${index + 1}`,
          type: tabData.type,
          targetTabId: predictedRuntimeTabId,
          staleRuntimeIds: Array.from(new Set(staleRuntimeIds))
        });
      }
      const newTab = createTab({
        title: tabData.title || `Workspace ${index + 1}`,
        type: tabData.type,
        payload: clonedPayload,
        layoutState: clonedLayout,
        previewMarkup: clonedPreviewMarkup,
        previewSignature: tabData.previewSignature || null,
        previewMeta: clonedPreviewMeta,
        archiveRenderCache: clonedArchiveRenderCache,
        archiveRenderCacheSignature: tabData.archiveRenderCacheSignature || null,
        archiveRenderCacheLayoutSignature: oldRuntimeIds.length ? null : (tabData.archiveRenderCacheLayoutSignature || null),
        loadedFromArchive: true,
        userModified: false,
        payloadDirty: false,
        uiState: clonedUiState
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
      if (window.Shared?.undoManager?.refreshState) {
        window.Shared.undoManager.refreshState(welcomeTab.id, options.reason || 'session-empty');
      }
      options.showGraphSelection({ reason: 'session-empty' });
    }
    clearSessionDirty(options.reason || 'session-load');
    notifySessionDocumentState('loaded', {
      dirty: workspaceState.sessionDirty,
      userDirty: workspaceState.sessionUserDirty,
      reason: options.reason || 'session-load'
    });
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
  namespace.markTabUserModified = markTabUserModified;
  namespace.markActiveTabUserModified = markActiveTabUserModified;
  namespace.disposeWorkspaceTabResources = disposeWorkspaceTabResources;
  namespace.disposeWorkspaceTabs = disposeWorkspaceTabs;
  namespace.markTabRenderCommitted = markTabRenderCommitted;
  namespace.assignTabPayload = assignTabPayload;
  namespace.updateTabPayload = updateTabPayload;
  namespace.persistUserModifiedTabState = persistUserModifiedTabState;
  namespace.clearTabRenderCache = clearTabRenderCache;
  namespace.clearTabArchiveRenderCache = clearTabArchiveRenderCache;
  namespace.peekArchiveRenderCache = peekArchiveRenderCache;
  namespace.cloneRenderCacheForRestore = cloneRenderCacheForStorage;
  namespace.consumeArchiveRenderCache = consumeArchiveRenderCache;
  namespace.promoteArchiveRenderCacheToRuntime = promoteArchiveRenderCacheToRuntime;
  namespace.serializeRenderCacheForArchive = serializeRenderCacheForArchive;
  namespace.rehomeTabScopedState = rehomeTabScopedState;
  namespace.remapRuntimeWorkspaceString = remapRuntimeWorkspaceString;
  namespace.markTabAuthoritativeRenderRestore = markTabAuthoritativeRenderRestore;
  namespace.pruneWarmRenderCaches = pruneWarmRenderCaches;
  namespace.setRenderCachePruneSuspended = setRenderCachePruneSuspended;
  namespace.isRenderCachePruneSuspended = isRenderCachePruneSuspended;
  namespace.getActiveTab = getActiveTab;
  namespace.generateUniqueTabTitle = generateUniqueTabTitle;
  namespace.createTab = createTab;
  namespace.hasMeaningfulCellValue = hasMeaningfulCellValue;
  namespace.tabHasTableData = tabHasTableData;
  namespace.graphTabsHaveData = graphTabsHaveData;
  namespace.persistActiveTabState = persistActiveTabState;
  namespace.enrichTabSnapshotForArchive = enrichTabSnapshotForArchive;
  namespace.captureWorkspaceUiState = captureWorkspaceUiState;
  namespace.applyWorkspaceUiState = applyWorkspaceUiState;
  namespace.applySessionData = applySessionData;

  // Single document-level listener that promotes ANY user-trusted input/change/click
  // event inside a workspace component into a tab-dirty mark. It resolves the owning
  // per-tab DOM root first, then falls back to the active tab. This saves us from
  // wiring ~30 individual control handlers across 11 components while avoiding
  // accidental active-tab writes from late or delegated UI events.
  //
  // Programmatic events from component setup/restore code use dispatchEvent() which
  // produces isTrusted=false, so they correctly do NOT mark anything dirty.
  //
  // Components that already call markTabUserModified / persistUserModifiedTabState
  // explicitly remain correct — markTabUserModified is idempotent.
  function installGlobalUserInputListener() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return;
    }
    if (namespace.__globalUserInputListenerInstalled) {
      return;
    }
    namespace.__globalUserInputListenerInstalled = true;
    const resolveWorkspaceOwnerTabId = target => {
      if (!target || typeof target.closest !== 'function') return '';
      const owner = target.closest('[data-workspace-tab-id], [data-tab-id], [data-workspace-instance-root="true"]');
      const dataset = owner?.dataset || null;
      return String(dataset?.workspaceTabId || dataset?.tabId || owner?.getAttribute?.('data-workspace-tab-id') || owner?.getAttribute?.('data-tab-id') || '').trim();
    };
    const isInsideWorkspace = target => {
      if (!target || typeof target.closest !== 'function') return false;
      // Workspace per-tab DOM roots all sit under #workspacePages and carry
      // data-workspace-component or data-workspace-instance-root attributes.
      return !!target.closest('[data-workspace-component], [data-workspace-instance-root="true"]');
    };
    const isDocumentStateControl = target => {
      if (!target || typeof target.closest !== 'function') return false;
      return !!target.closest('input[data-document-autosave="1"], input[data-document-recovery-fidelity="1"], [data-document-title="1"], [data-document-status="1"]');
    };
    const shouldIgnoreDirtyTracking = target => {
      if (!target || typeof target.closest !== 'function') return false;
      return !!target.closest('[data-session-ignore-dirty="1"], [data-session-affects-payload="0"]');
    };
    const resolveAffectsPayload = target => {
      if (!target || typeof target.closest !== 'function') return true;
      const node = target.closest('[data-session-affects-payload]');
      if (!node) return true;
      const raw = String(node.getAttribute('data-session-affects-payload') || '').trim().toLowerCase();
      if (raw === '0' || raw === 'false' || raw === 'no') {
        return false;
      }
      return true;
    };
    // Late-bind through window.Main.session so the listener always invokes the current
    // session module — important for tests that load session.js multiple times.
    const callMark = (reason, source, ownerTabId, affectsPayload = true) => {
      try {
        const sess = (typeof window !== 'undefined' && window.Main && window.Main.session) || namespace;
        if (!sess) return;
        if (ownerTabId && typeof sess.markTabUserModified === 'function') {
          const marked = sess.markTabUserModified(ownerTabId, reason, {
            origin: 'user',
            source: source || 'unknown',
            ownerResolvedFrom: 'workspace-dom',
            affectsPayload
          });
          if (marked) {
            return;
          }
          console.warn('Global user-input listener could not mark owner tab, falling back to active tab', {
            ownerTabId,
            reason,
            source: source || 'unknown'
          });
        }
        if (typeof sess.markActiveTabUserModified === 'function') {
          sess.markActiveTabUserModified(reason, {
            origin: 'user',
            source: source || 'unknown',
            affectsPayload
          });
        }
      } catch (err) { /* listener must never throw */ }
    };
    // Production browsers set event.isTrusted=true for real user input. JSDOM hard-codes
    // isTrusted=false on every dispatched event, so unit tests need a deterministic way
    // to simulate the user-trusted condition. The Symbol below is the test backdoor —
    // setting event[USER_TRUSTED_FLAG] = true on a JSDOM-dispatched event makes the
    // listener treat it as user input. Real browsers never set this property.
    const USER_TRUSTED_FLAG = namespace.__USER_TRUSTED_FLAG__ = '__graphitixUserTrusted';
    const isTrustedUserEvent = event => !!(event && (event.isTrusted === true || event[USER_TRUSTED_FLAG] === true));
    const handler = reason => event => {
      if (!isTrustedUserEvent(event)) return;
      const target = event.target;
      if (!target || !isInsideWorkspace(target)) return;
      if (isDocumentStateControl(target)) return;
      if (shouldIgnoreDirtyTracking(target)) return;
      // Skip events on the per-tab tab list itself (clicking tabs is lifecycle, not
      // a content change).
      if (target.closest && target.closest('[data-workspace-tablist], .workspace-tab')) return;
      callMark(
        reason,
        target?.id || target?.tagName,
        resolveWorkspaceOwnerTabId(target),
        resolveAffectsPayload(target)
      );
    };
    document.addEventListener('change', handler('control-change'), true);
    document.addEventListener('input', handler('control-input'), true);
    // Click handler is gated to interactive controls (button-like). Plain reads of
    // text/cells must not trigger dirty.
    document.addEventListener('click', event => {
      if (!isTrustedUserEvent(event)) return;
      const target = event.target;
      if (!target || !isInsideWorkspace(target)) return;
      if (isDocumentStateControl(target)) return;
      if (shouldIgnoreDirtyTracking(target)) return;
      const interactive = target.closest && target.closest('button, [role="button"], [data-action]');
      if (!interactive) return;
      // Skip the workspace tab strip and its close buttons (lifecycle, not content).
      if (target.closest && target.closest('.workspace-tab, [data-workspace-tablist]')) return;
      callMark(
        'control-click',
        interactive?.id || 'button',
        resolveWorkspaceOwnerTabId(target),
        resolveAffectsPayload(target)
      );
    }, true);
    console.debug('Debug: Main session global user-input listener installed');
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installGlobalUserInputListener);
  } else {
    installGlobalUserInputListener();
  }
  namespace.installGlobalUserInputListener = installGlobalUserInputListener;

  console.debug('Debug: Main session module initialized', { exportedHelpers: Object.keys(namespace) });
})();
