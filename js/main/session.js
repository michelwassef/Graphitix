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
  const MAX_WARM_RENDER_CACHES_TOTAL = 6;
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

  function isLiveCaptureSkippableReason(reason) {
    const normalized = normalizeReason(reason);
    if (!normalized) {
      return false;
    }
    return LIVE_CAPTURE_SKIP_REASONS.has(normalized)
      || normalized.includes('warmup')
      || normalized.endsWith('-private-snapshot');
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

  function consumeArchiveRenderCache(tab, meta = {}) {
    if (!tab || tab.renderCache) {
      return tab?.renderCache || null;
    }
    if (!tab.archiveRenderCache) {
      return null;
    }
    const cache = deserializeRenderCacheValue(tab.archiveRenderCache);
    const payloadSignature = tab.archiveRenderCacheSignature || tab.payloadSignature || null;
    const layoutSignature = tab.archiveRenderCacheLayoutSignature || tab.layoutSignature || null;
    if (cache && cache.__graphitixRenderCache && typeof cache.__graphitixRenderCache === 'object') {
      const originalTabId = cache.__graphitixRenderCache.tabId;
      cache.__graphitixRenderCache.tabId = tab.id;
      if (originalTabId && originalTabId !== tab.id) {
        console.debug('Debug: archive render cache metadata tabId rewritten', {
          originalTabId,
          tabId: tab.id,
          reason: meta.reason || 'archive-render-cache-consumed'
        });
      }
    }
    clearTabArchiveRenderCache(tab, { reason: meta.reason || 'archive-render-cache-consumed' });
    if (!cache) {
      console.debug('Debug: archive render cache consume skipped', {
        tabId: tab?.id || null,
        reason: 'empty-cache',
        meta
      });
      return null;
    }
    const capturedAt = Date.now();
    tab.renderCache = {
      cache,
      tabId: tab.id,
      type: tab.type || null,
      payloadSignature,
      layoutSignature,
      capturedAt,
      captureSequence: ++renderCacheCaptureSequence
    };
    tab.renderCacheSignature = payloadSignature;
    tab.renderCacheLayoutSignature = layoutSignature;
    tab.renderCacheTabId = tab.id;
    console.debug('Debug: archive render cache consumed', {
      tabId: tab.id,
      type: tab.type || null,
      reason: meta.reason || 'archive-render-cache-consumed'
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
    // Skip the live-state read for any persist call where the tab is clean (no
    // user modifications since last flush) AND the call is either autosave-like
    // (recovery-interval, archive-save, etc.) OR a lifecycle event (tab activation
    // switch, deactivation, warmup, etc.). For these calls tab.payload is already
    // authoritative — running config.getPayload() risks projecting half-bound
    // component state over a perfectly good loaded-from-disk payload.
    const isLifecycleOrigin = options.origin === 'lifecycle';
    const skipCaptureBlockedByReason = reason === 'duplicate-before-create'
      || reason === 'add-tab-before-new';
    const shouldSkipLivePayloadCapture = !!(tab.payload
      && !tab.payloadDirty
      && !skipCaptureBlockedByReason
      && (isLiveCaptureSkippableReason(reason) || isLifecycleOrigin));
    const captureRenderCacheOnly = () => {
      if (options.captureRenderCache && typeof config.captureRenderCache === 'function') {
        try {
          const captured = config.captureRenderCache({
            tabId: tab.id,
            type: tab.type,
            reason
          });
          if (captured) {
            const capturedAt = Date.now();
            tab.renderCache = {
              cache: captured,
              tabId: tab.id,
              type: tab.type || null,
              payloadSignature: tab.payloadSignature || null,
              layoutSignature: tab.layoutSignature || null,
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
          pruneWarmRenderCaches({
            preserveTabIds: [tab.id, ...(options.preserveRenderCacheTabIds || [])],
            reason
          });
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
      const skippedLayoutState = Shared.componentLayout?.captureStateFor
        ? Shared.componentLayout.captureStateFor(tab.type, { tabId: tab.id })
        : null;
      const skippedLayoutClone = clonePayload(
        Shared.componentLayout?.withTabLayoutOverrides
          ? Shared.componentLayout.withTabLayoutOverrides(skippedLayoutState, tab)
          : skippedLayoutState
      );
      const skippedAspectLocked = skippedLayoutClone?.svgBox?.dataset?.resizerAspectLocked;
      if (skippedAspectLocked === 'true' || skippedAspectLocked === 'false') {
        tab.sharedState = tab.sharedState || {};
        tab.sharedState.layout = tab.sharedState.layout || {};
        tab.sharedState.layout.resizer = tab.sharedState.layout.resizer || {};
        tab.sharedState.layout.resizer.aspectLocked = skippedAspectLocked === 'true';
        if (skippedLayoutClone?.svgBox?.dataset?.resizerAspectRatio) {
          tab.sharedState.layout.resizer.aspectRatio = String(skippedLayoutClone.svgBox.dataset.resizerAspectRatio);
        }
      }
      tab.layoutState = skippedLayoutClone;
      tab.layoutSignature = serializePayloadSignature(skippedLayoutClone);
      const skippedLayoutChanged = previousLayoutSignature !== tab.layoutSignature;
      if (skippedLayoutChanged) {
        clearTabArchiveRenderCache(tab, { reason: options.reason || 'layout-changed-skip' });
        markTabAuthoritativeRenderRestore(tab, false, { reason: options.reason || 'layout-changed-skip' });
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
      // Opt-in deep drift probe. Enabled via `window.Shared.__driftDetectOnSkip = true`
      // (off in production). When on, runs config.getPayload() purely to compute its
      // signature; if it differs from tab.payloadSignature on a "clean" tab, an unwired
      // user control has mutated state without calling markTabUserModified. This is the
      // self-locating drift detector for the skip path; the live-read path has its own
      // detector below.
      if (typeof window !== 'undefined'
        && window.Shared
        && window.Shared.__driftDetectOnSkip === true
        && typeof config.getPayload === 'function') {
        try {
          const probe = config.getPayload();
          if (probe) {
            const probeSig = serializePayloadSignature(probe);
            if (probeSig && tab.payloadSignature && probeSig !== tab.payloadSignature) {
              console.warn('persistActiveTabState DRIFT on skipped path (clean tab projects different payload)', {
                tabId: tab.id,
                type: tab.type,
                reason,
                origin: options.origin || null,
                cachedSignatureLength: tab.payloadSignature.length,
                liveSignatureLength: probeSig.length
              });
            }
          }
        } catch (err) {
          // Probe is best-effort; never fail the persist due to a probe error.
        }
      }
      console.debug('Debug: persistActiveTabState skipped live payload capture', {
        tabId: tab.id,
        type: tab.type,
        reason,
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
    const isAutosaveLikeReason = isLiveCaptureSkippableReason(reason);
    if (isAutosaveLikeReason && tab.payload && !workspaceState.loadedWorkspaces?.[tab.id]) {
      console.debug('Debug: persistActiveTabState skipped (tab not bound)', {
        tabId: tab.id,
        type: tab.type,
        reason
      });
      return false;
    }
    try {
      const payload = config.getPayload();
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
      const layoutState = Shared.componentLayout?.captureStateFor
        ? Shared.componentLayout.captureStateFor(tab.type, { tabId: tab.id })
        : null;
      let layoutClone = clonePayload(
        Shared.componentLayout?.withTabLayoutOverrides
          ? Shared.componentLayout.withTabLayoutOverrides(layoutState, tab)
          : layoutState
      );
      const capturedAspectLocked = layoutClone?.svgBox?.dataset?.resizerAspectLocked;
      if (capturedAspectLocked === 'true' || capturedAspectLocked === 'false') {
        tab.sharedState = tab.sharedState || {};
        tab.sharedState.layout = tab.sharedState.layout || {};
        tab.sharedState.layout.resizer = tab.sharedState.layout.resizer || {};
        tab.sharedState.layout.resizer.aspectLocked = capturedAspectLocked === 'true';
        if (layoutClone?.svgBox?.dataset?.resizerAspectRatio) {
          tab.sharedState.layout.resizer.aspectRatio = String(layoutClone.svgBox.dataset.resizerAspectRatio);
        }
      }
      if (tab.type !== 'box' && Shared.graphSizing?.enrichPayloadWithLayout) {
        try {
          payloadClone = Shared.graphSizing.enrichPayloadWithLayout(tab.type, payloadClone, layoutClone, {
            context: `persist-${tab.type}`
          });
        } catch (err) {
          console.error('persistActiveTabState graph sizing enrich error', { tabId: tab.id, type: tab.type, err });
        }
      } else if (tab.type === 'box') {
        console.debug('Debug: session graph sizing enrich skipped', {
          tabId: tab.id,
          type: tab.type,
          reason: 'box-layout-state-authoritative'
        });
      }
      if (tab.type !== 'box' && Shared.graphSizing?.mergePayloadSizingIntoLayout) {
        try {
          layoutClone = Shared.graphSizing.mergePayloadSizingIntoLayout(layoutClone, payloadClone, {
            context: `persist-layout-${tab.type}`
          });
        } catch (err) {
          console.error('persistActiveTabState graph sizing layout merge error', { tabId: tab.id, type: tab.type, err });
        }
      } else if (tab.type === 'box') {
        console.debug('Debug: session graph sizing layout merge skipped', {
          tabId: tab.id,
          type: tab.type,
          reason: 'box-layout-state-authoritative'
        });
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
          console.warn('persistActiveTabState payload drift detected (clean tab projected a different signature)', {
            tabId: tab.id,
            type: tab.type || null,
            reason,
            origin: options.origin || null,
            previousSignatureLength: previousPayloadSignature.length,
            liveSignatureLength: livePayloadSignature.length
          });
        }
      }
      const changed = assignTabPayload(tab, payloadClone, { reason });
      markTabPayloadFlushed(tab, reason);
      tab.layoutState = layoutClone;
      tab.layoutSignature = serializePayloadSignature(layoutClone);
      const layoutChanged = previousLayoutSignature !== tab.layoutSignature;
      if (layoutChanged) {
        clearTabArchiveRenderCache(tab, { reason: options.reason || 'layout-changed' });
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
      if (options.captureRenderCache && typeof config.captureRenderCache === 'function') {
        try {
          const captured = config.captureRenderCache({
            tabId: tab.id,
            type: tab.type,
            reason: options.reason || 'persist-active'
          });
          if (captured) {
            const capturedAt = Date.now();
            tab.renderCache = {
              cache: captured,
              tabId: tab.id,
              type: tab.type || null,
              payloadSignature: tab.payloadSignature || null,
              layoutSignature: tab.layoutSignature || null,
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
          pruneWarmRenderCaches({
            preserveTabIds: [tab.id, ...(options.preserveRenderCacheTabIds || [])],
            reason: options.reason || 'persist-active'
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
    const skipBoxEnrich = type === 'box';
    if (!skipBoxEnrich && Shared.graphSizing?.enrichPayloadWithLayout) {
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
    } else if (skipBoxEnrich) {
      console.debug('Debug: enrichTabSnapshotForArchive skipped enrich', {
        tabId: tab.id,
        type,
        reason: 'box-layout-state-authoritative',
        context: contextLabel
      });
    }
    if (!skipBoxEnrich && Shared.graphSizing?.mergePayloadSizingIntoLayout) {
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
    } else if (skipBoxEnrich) {
      console.debug('Debug: enrichTabSnapshotForArchive skipped layout merge', {
        tabId: tab.id,
        type,
        reason: 'box-layout-state-authoritative',
        context: contextLabel
      });
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
      const clonedPayload = clonePayload(tabData.payload) || null;
      const clonedLayout = clonePayload(tabData.layout) || null;
      const newTab = createTab({
        title: tabData.title || `Workspace ${index + 1}`,
        type: tabData.type,
        payload: clonedPayload,
        layoutState: clonedLayout,
        previewMarkup: typeof tabData.previewMarkup === 'string' ? tabData.previewMarkup : null,
        previewSignature: tabData.previewSignature || null,
        previewMeta: tabData.previewMeta && typeof tabData.previewMeta === 'object'
          ? clonePayload(tabData.previewMeta)
          : null,
        archiveRenderCache: tabData.archiveRenderCache && typeof tabData.archiveRenderCache === 'object'
          ? clonePayload(tabData.archiveRenderCache)
          : null,
        archiveRenderCacheSignature: tabData.archiveRenderCacheSignature || null,
        archiveRenderCacheLayoutSignature: tabData.archiveRenderCacheLayoutSignature || null,
        loadedFromArchive: true,
        userModified: false,
        payloadDirty: false,
        uiState: tabData.uiState && typeof tabData.uiState === 'object'
          ? clonePayload(tabData.uiState)
          : null
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
  namespace.assignTabPayload = assignTabPayload;
  namespace.updateTabPayload = updateTabPayload;
  namespace.persistUserModifiedTabState = persistUserModifiedTabState;
  namespace.clearTabRenderCache = clearTabRenderCache;
  namespace.clearTabArchiveRenderCache = clearTabArchiveRenderCache;
  namespace.consumeArchiveRenderCache = consumeArchiveRenderCache;
  namespace.serializeRenderCacheForArchive = serializeRenderCacheForArchive;
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
  // event inside a workspace component into a markActiveTabUserModified call. This
  // saves us from wiring ~30 individual control handlers across 11 components: as
  // long as the event is user-initiated (event.isTrusted === true) and the target
  // sits inside a per-tab DOM root, we mark the active tab dirty.
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
    const isInsideWorkspace = target => {
      if (!target || typeof target.closest !== 'function') return false;
      // Workspace per-tab DOM roots all sit under #workspacePages and carry
      // data-workspace-component or data-workspace-instance-root attributes.
      return !!target.closest('[data-workspace-component], [data-workspace-instance-root="true"]');
    };
    // Late-bind through window.Main.session so the listener always invokes the current
    // session module — important for tests that load session.js multiple times.
    const callMark = (reason, source) => {
      try {
        const sess = (typeof window !== 'undefined' && window.Main && window.Main.session) || namespace;
        if (sess && typeof sess.markActiveTabUserModified === 'function') {
          sess.markActiveTabUserModified(reason, { origin: 'user', source: source || 'unknown' });
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
      // Skip events on the per-tab tab list itself (clicking tabs is lifecycle, not
      // a content change).
      if (target.closest && target.closest('[data-workspace-tablist], .workspace-tab')) return;
      callMark(reason, target?.id || target?.tagName);
    };
    document.addEventListener('change', handler('control-change'), true);
    document.addEventListener('input', handler('control-input'), true);
    // Click handler is gated to interactive controls (button-like). Plain reads of
    // text/cells must not trigger dirty.
    document.addEventListener('click', event => {
      if (!isTrustedUserEvent(event)) return;
      const target = event.target;
      if (!target || !isInsideWorkspace(target)) return;
      const interactive = target.closest && target.closest('button, [role="button"], [data-action]');
      if (!interactive) return;
      // Skip the workspace tab strip and its close buttons (lifecycle, not content).
      if (target.closest && target.closest('.workspace-tab, [data-workspace-tablist]')) return;
      callMark('control-click', interactive?.id || 'button');
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
