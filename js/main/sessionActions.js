(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.sessionActions = Main.sessionActions || {};

  if(typeof window.Shared?.renderCacheSchema?.validate !== 'function' && typeof require === 'function'){
    try {
      require('../shared/renderCacheSchema.js');
    } catch (err) {
      console.debug('Debug: sessionActions renderCacheSchema helper require failed', { message: err?.message || String(err) });
    }
  }

  function debug(context, message, payload) {
    const Shared = context?.Shared || window.Shared;
    if (!(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled())) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('Debug: sessionActions.' + message, payload || {});
    }
  }

  function ensureGraphArchiveApi(Shared) {
    if (Shared?.graphArchive && typeof Shared.graphArchive.parseFile === 'function') {
      return Shared.graphArchive;
    }
    if (typeof require === 'function') {
      try {
        require('../shared/graphArchive.js');
      } catch (err) {
        // no-op; browser builds and some tests do not expose require paths
      }
    }
    if (Shared?.graphArchive && typeof Shared.graphArchive.parseFile === 'function') {
      return Shared.graphArchive;
    }
    return null;
  }

  function ensureGraphFileName(context, name, fallback) {
    const Shared = context?.Shared || window.Shared;
    const helper = Shared?.graphArchive?.ensureGraphFileName;
    if (typeof helper === 'function') {
      return helper(name, fallback || 'workspace.graph');
    }
    const base = String(name || fallback || 'workspace.graph').trim() || 'workspace.graph';
    return /\.graph$/i.test(base) ? base : `${base}.graph`;
  }

  function canLoadFile(context) {
    const { session, withSessionContext } = context || {};
    return !!session
      && typeof session.applySessionData === 'function'
      && typeof withSessionContext === 'function';
  }

  const DOCUMENT_OPEN_OVERLAY_ID = 'documentOpenOverlay';
  let documentOperationSequence = 0;
  let lastDocumentOpenError = null;

  function formatDocumentOperationTitle(kind, fileName) {
    const safeName = String(fileName || '').trim();
    const verb = kind === 'recovery' ? 'Recovering' : (kind === 'append' ? 'Adding' : 'Opening');
    return safeName ? `${verb} “${safeName}”…` : `${verb} file…`;
  }

  function ensureDocumentOpenOverlay() {
    if (typeof document === 'undefined' || !document.body || !document.createElement) {
      return null;
    }
    const existing = document.getElementById(DOCUMENT_OPEN_OVERLAY_ID);
    if (existing) {
      return existing;
    }
    const overlay = document.createElement('div');
    overlay.id = DOCUMENT_OPEN_OVERLAY_ID;
    overlay.className = 'document-open-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'documentOpenTitle');
    overlay.setAttribute('aria-describedby', 'documentOpenDetail');
    overlay.tabIndex = -1;
    overlay.innerHTML = [
      '<div class="document-open-overlay__panel">',
      '  <div class="document-open-overlay__spinner" aria-hidden="true"></div>',
      '  <h2 id="documentOpenTitle" class="document-open-overlay__title"></h2>',
      '  <p id="documentOpenDetail" class="document-open-overlay__detail" aria-live="polite"></p>',
      '  <div class="document-open-overlay__progress" aria-hidden="true"><span></span></div>',
      '  <div class="document-open-overlay__actions" hidden>',
      '    <button type="button" class="btn" data-document-open-action="retry">Choose another file</button>',
      '    <button type="button" class="btn btn-secondary" data-document-open-action="close">Close</button>',
      '  </div>',
      '</div>'
    ].join('');
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay.dataset.state === 'error') {
        event.preventDefault();
        overlay.querySelector('[data-document-open-action="close"]')?.click();
      }
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function lockDocumentInteraction(operation) {
    if (!operation || typeof document === 'undefined' || !document.body) {
      return;
    }
    operation.lockedElements = [];
    const lockTargets = new Set([
      ...Array.from(document.body.children),
      document.querySelector('main'),
      document.getElementById('workspaceTabsDock')
    ].filter(Boolean));
    lockTargets.forEach(element => {
      if ((typeof HTMLElement !== 'undefined' && !(element instanceof HTMLElement))
        || element.id === DOCUMENT_OPEN_OVERLAY_ID
        || ['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) {
        return;
      }
      operation.lockedElements.push({
        element,
        inert: !!element.inert
      });
      element.inert = true;
    });
    operation.previousBodyBusy = document.body.getAttribute('aria-busy');
    document.body.setAttribute('aria-busy', 'true');
  }

  function unlockDocumentInteraction(operation) {
    if (!operation || typeof document === 'undefined' || !document.body) {
      return;
    }
    (operation.lockedElements || []).forEach(entry => {
      if (!entry?.element) return;
      entry.element.inert = !!entry.inert;
    });
    if (operation.previousBodyBusy === null || operation.previousBodyBusy === undefined) {
      document.body.removeAttribute('aria-busy');
    } else {
      document.body.setAttribute('aria-busy', operation.previousBodyBusy);
    }
    operation.lockedElements = [];
  }

  function renderDocumentOperation(operation) {
    const overlay = operation?.overlay;
    if (!overlay) {
      return;
    }
    const title = overlay.querySelector('.document-open-overlay__title');
    const detail = overlay.querySelector('.document-open-overlay__detail');
    const actions = overlay.querySelector('.document-open-overlay__actions');
    const progress = overlay.querySelector('.document-open-overlay__progress span');
    overlay.dataset.state = operation.status || 'loading';
    overlay.hidden = false;
    if (title) title.textContent = operation.title || formatDocumentOperationTitle(operation.kind, operation.fileName);
    if (detail) detail.textContent = operation.detail || 'Reading file…';
    if (actions) actions.hidden = operation.status !== 'error';
    if (progress) {
      const total = Math.max(0, Number(operation.total) || 0);
      const current = Math.max(0, Math.min(total, Number(operation.current) || 0));
      progress.style.width = total > 0 ? `${Math.round((current / total) * 100)}%` : '';
      progress.parentElement?.classList?.toggle('is-indeterminate', total <= 0);
    }
  }

  function beginDocumentOpenTransaction(context, meta = {}) {
    const workspaceState = context?.workspaceState;
    if (!workspaceState) {
      return null;
    }
    if (workspaceState.documentOperation?.active) {
      throw new Error('Another document operation is already in progress.');
    }
    const reason = String(meta.reason || 'graph-load');
    const kind = reason.includes('recovery')
      ? 'recovery'
      : (meta.loadMode === 'append' ? 'append' : 'open');
    const operation = {
      active: true,
      token: `document-open-${Date.now()}-${++documentOperationSequence}`,
      kind,
      status: 'loading',
      fileName: String(meta.fileName || '').trim(),
      title: formatDocumentOperationTitle(kind, meta.fileName),
      detail: 'Reading file…',
      current: 0,
      total: 0,
      overlay: ensureDocumentOpenOverlay(),
      context,
      previousFocus: typeof document !== 'undefined' ? document.activeElement : null,
      lockedElements: []
    };
    lastDocumentOpenError = null;
    workspaceState.documentOperation = {
      active: true,
      token: operation.token,
      kind: operation.kind,
      status: operation.status,
      fileName: operation.fileName
    };
    context.hideDuplicatePrompt?.();
    lockDocumentInteraction(operation);
    renderDocumentOperation(operation);
    context.renderTabs?.();
    if (operation.overlay) {
      operation.overlay.onclick = event => {
        const action = event.target?.closest?.('[data-document-open-action]')?.dataset?.documentOpenAction;
        if (!action || operation.status !== 'error') return;
        const retryInput = context?.dom?.sessionFileInput || null;
        finishDocumentOpenTransaction(context, operation, { restoreFocus: action !== 'retry' });
        if (action === 'retry' && retryInput && typeof retryInput.click === 'function') {
          window.setTimeout(() => {
            retryInput.value = '';
            retryInput.click();
          }, 0);
        }
      };
      operation.overlay.focus({ preventScroll: true });
    }
    return operation;
  }

  function updateDocumentOpenTransaction(operation, update = {}) {
    if (!operation?.active) {
      return;
    }
    Object.assign(operation, update);
    const workspaceState = operation.context?.workspaceState;
    if (workspaceState?.documentOperation?.token === operation.token) {
      workspaceState.documentOperation = {
        active: true,
        token: operation.token,
        kind: operation.kind,
        status: operation.status,
        fileName: operation.fileName
      };
    }
    renderDocumentOperation(operation);
  }

  function finishDocumentOpenTransaction(context, operation, options = {}) {
    if (!operation?.active) {
      return;
    }
    operation.active = false;
    unlockDocumentInteraction(operation);
    if (operation.overlay) {
      operation.overlay.hidden = true;
      operation.overlay.removeAttribute('data-state');
      operation.overlay.onclick = null;
    }
    if (context?.workspaceState?.documentOperation?.token === operation.token) {
      context.workspaceState.documentOperation = null;
    }
    context?.renderTabs?.();
    if (options.restoreFocus !== false) {
      const activeTabId = context?.workspaceState?.activeTabId || null;
      const activeTabButton = activeTabId && typeof document !== 'undefined'
        ? document.querySelector(`.workspace-tab[data-tab-id="${activeTabId}"]`)
        : null;
      const focusTarget = activeTabButton || operation.previousFocus;
      focusTarget?.focus?.({ preventScroll: true });
    }
  }

  function failDocumentOpenTransaction(context, operation, error) {
    if (!operation?.active) {
      return;
    }
    const canPresentError = !!operation.overlay;
    lastDocumentOpenError = {
      at: Date.now(),
      fileName: operation.fileName,
      message: error?.message || String(error || ''),
      stack: error?.stack || ''
    };
    updateDocumentOpenTransaction(operation, {
      status: 'error',
      title: operation.fileName
        ? `Couldn’t open “${operation.fileName}”`
        : 'Couldn’t open this file',
      detail: 'The file may be damaged or from an unsupported Graphitix version. Your current workspace is unchanged.',
      current: 0,
      total: 0,
      errorMessage: error?.message || String(error || '')
    });
    if (operation.overlay) {
      operation.overlay.focus({ preventScroll: true });
    }
    if (!canPresentError) {
      finishDocumentOpenTransaction(context, operation);
    }
  }

  namespace.beginDocumentOpenTransaction = beginDocumentOpenTransaction;
  namespace.updateDocumentOpenTransaction = updateDocumentOpenTransaction;
  namespace.finishDocumentOpenTransaction = finishDocumentOpenTransaction;
  namespace.getDocumentOpenDiagnostics = () => lastDocumentOpenError ? { ...lastDocumentOpenError } : null;

  function getGraphTabsFromWorkspaceState(workspaceState) {
    if (!Array.isArray(workspaceState?.tabs)) {
      return [];
    }
    return workspaceState.tabs.filter(tab => tab && !tab.isWelcome && typeof tab.type === 'string' && tab.type.length > 0);
  }

  function hasActiveDocumentOperation(context) {
    return context?.workspaceState?.documentOperation?.active === true;
  }

  function findTabById(workspaceState, tabId) {
    if (!tabId || !Array.isArray(workspaceState?.tabs)) {
      return null;
    }
    return workspaceState.tabs.find(tab => tab && tab.id === tabId) || null;
  }

  function cloneWithSession(session, value) {
    const cloneFn = session?.fastClonePayload || session?.clonePayload;
    if (typeof cloneFn === 'function') {
      return cloneFn.call(session, value);
    }
    return value;
  }

  function cloneSnapshotIntent(intent) {
    if (!intent || typeof intent !== 'object') {
      return {};
    }
    return { ...intent };
  }

  function getSnapshotPolicyApi() {
    const policy = Main?.snapshotPolicy;
    if (policy && typeof policy === 'object') {
      return policy;
    }
    return null;
  }

  function resolvePersistSnapshotIntent(options = {}) {
    const snapshotPolicy = getSnapshotPolicyApi();
    if (snapshotPolicy && typeof snapshotPolicy.resolvePersistSnapshotIntent === 'function') {
      return snapshotPolicy.resolvePersistSnapshotIntent(options);
    }
    const explicit = cloneSnapshotIntent(options.snapshotIntent);
    if (Object.keys(explicit).length) {
      return explicit;
    }
    return {
      saveLike: false,
      allowSkipLivePayloadCapture: true,
      lifecycleSnapshot: true,
      runSkippedPayloadDriftProbe: false,
      promoteSkippedPayloadDrift: false,
      reasonSkippable: true
    };
  }
  namespace.resolvePersistSnapshotIntent = resolvePersistSnapshotIntent;

  function resolveArchiveBuildPolicy(options = {}) {
    const snapshotPolicy = getSnapshotPolicyApi();
    if (snapshotPolicy && typeof snapshotPolicy.resolveArchiveBuildPolicy === 'function') {
      return snapshotPolicy.resolveArchiveBuildPolicy(options);
    }
    const snapshotKind = String(options.snapshotKind || '').trim().toLowerCase() || 'lifecycle-checkpoint';
    const mode = String(options.mode || '').trim().toLowerCase();
    const reason = String(options.reason || '').trim().toLowerCase();
    const autosaveLike = mode === 'autosave' || snapshotKind === 'autosave' || reason.includes('autosave');
    const captureRenderCache = typeof options.captureRenderCacheBeforeSnapshot === 'boolean'
      ? options.captureRenderCacheBeforeSnapshot
      : !autosaveLike;
    const includeRenderCache = typeof options.includeRenderCacheInSnapshot === 'boolean'
      ? options.includeRenderCacheInSnapshot
      : !autosaveLike;
    return {
      snapshotKind,
      snapshotIntent: resolvePersistSnapshotIntent(options),
      captureRenderCache,
      includeRenderCache,
      preserveRenderCacheTabScope: includeRenderCache ? 'all' : 'active-only',
      policyId: 'fallback'
    };
  }

  function rehomeArchiveValue(session, value, tabId) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof session?.rehomeTabScopedState === 'function') {
      return session.rehomeTabScopedState(value, tabId);
    }
    return cloneWithSession(session, value);
  }

  function rehomeArchiveString(session, value, tabId) {
    if (typeof value !== 'string') {
      return value;
    }
    if (typeof session?.remapRuntimeWorkspaceString === 'function') {
      return session.remapRuntimeWorkspaceString(value, tabId);
    }
    return value.replace(/workspace-\d+/g, String(tabId || ''));
  }

  function persistActiveTabIfNeeded(context, options = {}) {
    const { session, withSessionContext } = context || {};
    if (!session || typeof session.getActiveTab !== 'function' || typeof session.persistActiveTabState !== 'function') {
      return;
    }
    const active = session.getActiveTab();
    if (!active || active.isWelcome || !active.type) {
      return;
    }
    const reason = options.reason || 'archive-save';
    const snapshotIntent = resolvePersistSnapshotIntent(options);
    const shouldCaptureRenderCache = options.captureRenderCache === true;
    const preserveRenderCacheTabIds = Array.isArray(options.preserveRenderCacheTabIds)
      ? options.preserveRenderCacheTabIds.filter(Boolean)
      : [active.id];
    session.persistActiveTabState(active, withSessionContext({
      reason,
      forcePreviewCapture: true,
      captureRenderCache: shouldCaptureRenderCache,
      captureRenderCacheIfNeeded: options.captureRenderCacheIfNeeded === true,
      preserveRenderCacheTabIds,
      disableRenderCachePrune: true,
      origin: 'lifecycle',
      snapshotIntent
    }));
  }
  namespace.persistActiveTabIfNeeded = persistActiveTabIfNeeded;

  function cacheEnvelopeMatchesSnapshot(tab, envelope, payloadSignature, layoutSignature) {
    if (!envelope || typeof envelope !== 'object' || !envelope.cache) {
      return false;
    }
    const tabId = String(tab?.id || '');
    const ownerTabId = String(envelope.tabId || tab?.renderCacheTabId || '');
    const expectedComponentType = String(tab?.type || '');
    const cachedPayloadSignature = envelope.payloadSignature ?? tab?.renderCacheSignature ?? null;
    const cachedLayoutSignature = envelope.layoutSignature ?? tab?.renderCacheLayoutSignature ?? null;
    const provenanceValid = window.Shared?.renderCacheSchema?.matches?.(envelope.cache, {
      tabId,
      component: expectedComponentType
    }, {
      // Newly captured caches are already required to use the current schema by
      // session.persistActiveTabState(). Archive construction also accepts an
      // exact legacy checkpoint loaded from an older .graph file so reopening
      // and saving that document does not discard an otherwise valid cache.
      requireVersion: false,
      requireComplete: true
    }) === true;
    return !!tabId
      && !!expectedComponentType
      && ownerTabId === tabId
      && provenanceValid
      && cachedPayloadSignature === payloadSignature
      && cachedLayoutSignature === layoutSignature;
  }

  async function buildArchiveTabSnapshot(context, tab, options = {}) {
    const { session, workspaces } = context || {};
    if (!tab || tab.isWelcome || !tab.type) {
      return null;
    }

    const deferArchiveNormalization = options.deferArchiveNormalization === true
      && options.includeRenderCache !== true;
    // The tab session is the sole canonical authority after hydration. Active-tab
    // persistence has already captured and normalized live payload/layout state.
    // Re-enriching layout here creates a second, archive-only geometry commit after
    // the render cache was captured and invalidates otherwise exact provenance.
    const payload = deferArchiveNormalization
      ? (tab.payload || null)
      : cloneWithSession(session, tab.payload || null);
    const layout = deferArchiveNormalization
      ? (tab.layoutState || null)
      : cloneWithSession(session, tab.layoutState || null);

    const config = workspaces?.[tab.type] || null;
    const includeRenderCache = options.includeRenderCache === true;

    const archivePayloadForSignature = deferArchiveNormalization ? payload : rehomeArchiveValue(session, payload, tab.id);
    const archiveLayoutForSignature = deferArchiveNormalization ? layout : rehomeArchiveValue(session, layout, tab.id);
    const archivePayloadSignature = deferArchiveNormalization
      ? (tab.payloadSignature || null)
      : (typeof session?.serializePayloadSignature === 'function'
      ? session.serializePayloadSignature(archivePayloadForSignature || null)
      : (tab.payloadSignature || null));
    const archiveLayoutSignature = deferArchiveNormalization
      ? (tab.layoutSignature || null)
      : (typeof session?.serializePayloadSignature === 'function'
      ? session.serializePayloadSignature(archiveLayoutForSignature || null)
      : (tab.layoutSignature || null));
    let cacheSnapshot = null;
    if (includeRenderCache && cacheEnvelopeMatchesSnapshot(tab, tab.renderCache, archivePayloadSignature, archiveLayoutSignature)) {
      const serialized = typeof session?.serializeRenderCacheForArchive === 'function'
        ? session.serializeRenderCacheForArchive(tab.renderCache.cache)
        : null;
      if (serialized) {
        cacheSnapshot = {
          cache: serialized,
          payloadSignature: tab.renderCache.payloadSignature ?? tab.renderCacheSignature ?? archivePayloadSignature,
          layoutSignature: tab.renderCache.layoutSignature ?? tab.renderCacheLayoutSignature ?? archiveLayoutSignature
        };
      }
    }

    if (!cacheSnapshot && includeRenderCache && tab.archiveRenderCache && typeof tab.archiveRenderCache === 'object') {
      const archiveCacheEnvelope = {
        cache: tab.archiveRenderCache,
        tabId: tab.id,
        payloadSignature: tab.archiveRenderCacheSignature ?? null,
        layoutSignature: tab.archiveRenderCacheLayoutSignature ?? null
      };
      if (cacheEnvelopeMatchesSnapshot(tab, archiveCacheEnvelope, archivePayloadSignature, archiveLayoutSignature)) {
        cacheSnapshot = {
          cache: cloneWithSession(session, tab.archiveRenderCache),
          payloadSignature: archiveCacheEnvelope.payloadSignature,
          layoutSignature: archiveCacheEnvelope.layoutSignature
        };
      }
    }

    const archiveRenderCache = cacheSnapshot?.cache || null;
    const hasUsablePreview = typeof context?.previews?.hasUsableStoredPreview === 'function'
      ? context.previews.hasUsableStoredPreview(tab)
      : !!(tab.previewMarkup && String(tab.previewMarkup).trim());
    if (!hasUsablePreview && archiveRenderCache && config && context?.previews?.updateTabPreviewFromWorkspace) {
      const previousRenderCache = tab.renderCache || null;
      const previousRenderCacheSignature = tab.renderCacheSignature || null;
      const previousRenderCacheLayoutSignature = tab.renderCacheLayoutSignature || null;
      const previousRenderCacheTabId = tab.renderCacheTabId || null;
      try {
        tab.renderCache = {
          cache: archiveRenderCache,
          tabId: tab.id,
          type: tab.type || null,
          payloadSignature: cacheSnapshot.payloadSignature,
          layoutSignature: cacheSnapshot.layoutSignature,
          capturedAt: Date.now(),
          captureSequence: Number(previousRenderCache?.captureSequence || 0)
        };
        tab.renderCacheSignature = cacheSnapshot.payloadSignature;
        tab.renderCacheLayoutSignature = cacheSnapshot.layoutSignature;
        tab.renderCacheTabId = tab.id;
        context.previews.updateTabPreviewFromWorkspace(tab, config, {
          reason: 'archive-save-preview-from-render-cache',
          forceCapture: true,
          allowPreviewClear: false
        });
        if (typeof context.previews.awaitPendingCaptures === 'function') {
          await context.previews.awaitPendingCaptures([tab.id]);
        }
      } catch (err) {
        console.debug('Debug: archive preview fallback from render cache failed', {
          tabId: tab.id,
          type: tab.type,
          message: err?.message || String(err)
        });
      } finally {
        tab.renderCache = previousRenderCache;
        tab.renderCacheSignature = previousRenderCacheSignature;
        tab.renderCacheLayoutSignature = previousRenderCacheLayoutSignature;
        tab.renderCacheTabId = previousRenderCacheTabId;
      }
    }

    return {
      title: tab.title || 'Workspace',
      type: tab.type || tab?.payload?.type || null,
      runtimeTabId: tab.id || null,
      payload: archivePayloadForSignature,
      layout: archiveLayoutForSignature,
      previewMarkup: typeof tab.previewMarkup === 'string'
        ? (deferArchiveNormalization ? tab.previewMarkup : rehomeArchiveString(session, tab.previewMarkup, tab.id))
        : null,
      previewSignature: tab.previewSignature || null,
      previewMeta: deferArchiveNormalization
        ? (tab.previewMeta || null)
        : rehomeArchiveValue(session, tab.previewMeta || null, tab.id),
      archiveRenderCache: archiveRenderCache && typeof archiveRenderCache === 'object'
        ? rehomeArchiveValue(session, archiveRenderCache, tab.id)
        : null,
      archiveRenderCacheSignature: archiveRenderCache ? cacheSnapshot.payloadSignature : null,
      archiveRenderCacheLayoutSignature: archiveRenderCache ? cacheSnapshot.layoutSignature : null,
      uiState: tab.uiState && typeof tab.uiState === 'object'
        ? (deferArchiveNormalization ? tab.uiState : rehomeArchiveValue(session, tab.uiState, tab.id))
        : null
    };
  }

  async function buildScopeSnapshot(context, scope, options = {}) {
    const { session, workspaceState, withSessionContext } = context || {};
    if (!session || !workspaceState || typeof withSessionContext !== 'function') {
      return null;
    }
    const activeProjectionTab = session.getActiveTab?.() || null;
    const activeTab = findTabById(workspaceState, activeProjectionTab?.id) || activeProjectionTab;
    const canonicalActiveState = !!(activeTab?.payload && activeTab.payloadDirty !== true);
    if (!(options.skipActiveProjectionCapture === true && canonicalActiveState)) {
      persistActiveTabIfNeeded(context, {
        reason: options.reason || 'archive-save',
        snapshotKind: options.snapshotKind || 'archive-save',
        snapshotIntent: options.snapshotIntent || null,
        captureRenderCache: options.captureRenderCache === true,
        captureRenderCacheIfNeeded: options.captureRenderCache === true,
        preserveRenderCacheTabIds: options.preserveRenderCacheTabIds
      });
    }
    if (typeof context?.previews?.awaitPendingCaptures === 'function') {
      const pendingTabIds = scope === 'workspace'
        ? getGraphTabsFromWorkspaceState(workspaceState).map(tab => tab.id)
        : [options.targetTabId || activeTab?.id].filter(Boolean);
      await context.previews.awaitPendingCaptures(pendingTabIds);
    }

    if (scope === 'workspace') {
      const graphTabs = getGraphTabsFromWorkspaceState(workspaceState);
      const activeId = session.getActiveTab?.()?.id || null;
      const activeIndex = graphTabs.findIndex(tab => tab.id === activeId);
      return {
        activeIndex: activeIndex >= 0 ? activeIndex : (graphTabs.length ? 0 : -1),
        tabs: (await Promise.all(graphTabs.map(tab => buildArchiveTabSnapshot(context, tab, options)))).filter(Boolean)
      };
    }

    const targetTabId = options.targetTabId || session.getActiveTab?.()?.id || null;
    const tab = findTabById(workspaceState, targetTabId);
    const snapshot = await buildArchiveTabSnapshot(context, tab, options);
    if (!snapshot) {
      return null;
    }
    return {
      activeIndex: 0,
      tabs: [snapshot]
    };
  }

  function resolveArchiveNameForScope(context, scope, options = {}) {
    const { session, workspaceState } = context || {};
    const existingName = workspaceState?.sessionFileName || '';
    if (scope === 'workspace') {
      return ensureGraphFileName(context, options.fileName || existingName, 'workspace.graph');
    }
    const active = options.targetTabId
      ? findTabById(workspaceState, options.targetTabId)
      : (typeof session?.getActiveTab === 'function' ? session.getActiveTab() : null);
    const tabTitle = String(active?.title || '').trim();
    const safeTitle = tabTitle.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'workspace';
    return ensureGraphFileName(context, options.fileName || existingName, `${safeTitle}.graph`);
  }

  function shouldConfirmWorkspaceReplacement(context) {
    const { session, workspaceState } = context || {};
    if (!session || !workspaceState) {
      return false;
    }
    const isDirty = !!workspaceState.sessionUserDirty;
    const hasData = typeof session.graphTabsHaveData === 'function'
      ? !!session.graphTabsHaveData()
      : getGraphTabsFromWorkspaceState(workspaceState).length > 0;
    return isDirty && hasData;
  }

  function confirmWorkspaceReplacement(context) {
    if (!shouldConfirmWorkspaceReplacement(context)) {
      return true;
    }
    const message = 'This will replace your current workspace tabs. Continue without saving first?';
    if (typeof window.confirm === 'function') {
      const confirmed = window.confirm(message);
      debug(context, 'confirmWorkspaceReplacement', { confirmed });
      return confirmed;
    }
    return true;
  }

  async function awaitWithTimeout(promise, timeoutMs, label, details = {}) {
    const ms = Math.max(250, Number(timeoutMs) || 0);
    let timer = null;
    let timedOut = false;
    const timerApi = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
      ? { set: window.setTimeout.bind(window), clear: window.clearTimeout.bind(window) }
      : { set: setTimeout, clear: clearTimeout };
    const timeout = new Promise(resolve => {
      timer = timerApi.set(() => {
        timedOut = true;
        console.warn('Debug: sessionActions async step timed out', {
          label,
          timeoutMs: ms,
          ...details
        });
        resolve({ timedOut: true, label });
      }, ms);
    });
    try {
      const value = await Promise.race([Promise.resolve(promise), timeout]);
      return timedOut ? { timedOut: true, label } : { timedOut: false, value };
    } finally {
      if (timer !== null) {
        try { timerApi.clear(timer); } catch (_err) {}
      }
    }
  }

  async function awaitWorkspaceReadyForSnapshot(context, tab, options = {}) {
    const { workspaces } = context || {};
    if (!tab || !tab.type || !workspaces) {
      return { skipped: true, reason: 'missing-tab-or-workspaces' };
    }
    const config = workspaces[tab.type] || null;
    if (!config || typeof config.awaitReadyForSnapshot !== 'function') {
      return { skipped: true, reason: 'missing-hook' };
    }
    try {
      const timeoutMs = Number.isFinite(Number(options.timeoutMs))
        ? Math.max(250, Number(options.timeoutMs))
        : 4500;
      const outcome = await awaitWithTimeout(config.awaitReadyForSnapshot({
        tab,
        tabId: tab.id,
        type: tab.type,
        componentKey: tab.type,
        reason: options.reason || 'snapshot-ready',
        timeoutMs: Math.min(timeoutMs, 3500)
      }), timeoutMs, 'awaitWorkspaceReadyForSnapshot', {
        tabId: tab.id,
        type: tab.type,
        reason: options.reason || 'snapshot-ready'
      });
      if (outcome?.timedOut) {
        return { ok: false, timedOut: true, reason: 'snapshot-ready-timeout' };
      }
      const result = outcome?.value || { ok: true };
      debug(context, 'awaitWorkspaceReadyForSnapshot.complete', {
        tabId: tab.id,
        type: tab.type,
        reason: options.reason || 'snapshot-ready',
        ok: result?.ok !== false,
        skipped: !!result?.skipped
      });
      return result || { ok: true };
    } catch (err) {
      console.error('awaitWorkspaceReadyForSnapshot error', { tabId: tab.id, type: tab.type, err });
      return { ok: false, error: err?.message || String(err) };
    }
  }

  namespace.awaitWorkspaceReadyForSnapshot = awaitWorkspaceReadyForSnapshot;

  async function createDocumentCheckpoint(context, options = {}) {
    const { session, workspaceState } = context || {};
    if (!session || !workspaceState) {
      throw new Error('Document checkpoint unavailable: missing session context.');
    }
    const scope = options.scope === 'tab' ? 'tab' : 'workspace';
    const requestedSnapshotKind = options.snapshotKind || 'document-snapshot';
    const policy = resolveArchiveBuildPolicy({
      mode: options.policyMode || options.mode || 'manual-save',
      snapshotKind: requestedSnapshotKind,
      snapshotIntent: options.snapshotIntent,
      reason: options.reason || 'document-snapshot',
      scope,
      captureRenderCacheBeforeSnapshot: options.captureRenderCacheBeforeSnapshot,
      includeRenderCacheInSnapshot: options.includeRenderCacheInSnapshot
    });
    const captureRenderCache = policy.captureRenderCache === true;
    const includeRenderCache = policy.includeRenderCache === true;
    // Worker-backed normalization is a post-capture optimization only. It must
    // never change which live owner state is captured or whether readiness is
    // awaited.
    const deferArchiveNormalization = options.useWorker !== false
      && policy.snapshotKind === 'recovery'
      && !includeRenderCache;

    const activeTab = typeof session.getActiveTab === 'function' ? session.getActiveTab() : null;
    if (activeTab && !activeTab.isWelcome && activeTab.type) {
      await awaitWorkspaceReadyForSnapshot(context, activeTab, {
        reason: options.readyReason || `${options.reason || 'document-checkpoint'}-active-ready`,
        timeoutMs: options.readyTimeoutMs
      });
    }

    const graphTabs = getGraphTabsFromWorkspaceState(workspaceState);
    const preserveRenderCacheTabIds = policy.preserveRenderCacheTabScope === 'all'
      ? graphTabs.map(tab => tab?.id).filter(Boolean)
      : [activeTab?.id || null].filter(Boolean);
    const snapshot = await buildScopeSnapshot(context, scope, {
      ...options,
      reason: options.reason || 'document-snapshot',
      snapshotKind: policy.snapshotKind || requestedSnapshotKind,
      snapshotIntent: policy.snapshotIntent,
      captureRenderCache,
      includeRenderCache,
      deferArchiveNormalization,
      // Recovery and manual save share the same active-owner payload, layout,
      // preview, and completed render-cache checkpoint contract.
      skipActiveProjectionCapture: false,
      preserveRenderCacheTabIds
    });
    if (!snapshot || !Array.isArray(snapshot.tabs) || !snapshot.tabs.length) {
      return null;
    }
    return {
      scope,
      snapshot,
      policy,
      fileName: resolveArchiveNameForScope(context, scope, options),
      sessionRevision: Number(workspaceState.sessionRevision) || 0,
      createdAt: Date.now()
    };
  }

  namespace.createDocumentCheckpoint = createDocumentCheckpoint;

  async function serializeDocumentCheckpoint(context, checkpoint, options = {}) {
    if (!checkpoint?.snapshot || !Array.isArray(checkpoint.snapshot.tabs)) {
      throw new Error('Document checkpoint serialization requires a valid checkpoint.');
    }
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.buildArchiveBlob !== 'function') {
      throw new Error('Shared.graphArchive.buildArchiveBlob is unavailable.');
    }
    return graphArchive.buildArchiveBlob({
      tabs: checkpoint.snapshot.tabs,
      activeIndex: checkpoint.snapshot.activeIndex,
      fileName: checkpoint.fileName,
      scope: checkpoint.scope,
      compression: options.compression || 'STORE',
      payloadMode: options.payloadMode || 'full',
      useWorker: options.useWorker !== false,
      onPhase: options.onPhase
    });
  }

  namespace.serializeDocumentCheckpoint = serializeDocumentCheckpoint;

  async function applyParsedSession(context, parsed, meta = {}) {
    if (!canLoadFile(context)) {
      throw new Error('Session load unavailable: missing applySessionData context.');
    }
    const { session, withSessionContext, hideDuplicatePrompt, renderTabs, activateTab, showGraphSelection, workspaceState } = context;
    const sessionPayload = parsed?.session;
    if (!sessionPayload || !Array.isArray(sessionPayload.tabs)) {
      throw new Error('Invalid parsed archive payload: missing tabs.');
    }
    const loadMode = meta.loadMode === 'append' ? 'append' : 'replace';
    const requestedScope = sessionPayload.scope === 'workspace' || sessionPayload.scope === 'tab'
      ? sessionPayload.scope
      : null;
    const parsedScope = requestedScope || (sessionPayload.tabs.length > 1 ? 'workspace' : (sessionPayload.tabs.length === 1 ? 'tab' : null));

    let payloadToApply = sessionPayload;
    let fileScope = parsedScope;
    let fileHandle = meta.fileHandle || null;
    let fileName = meta.fileName || '';
    let existingTabCount = 0;
    let addedTabCount = sessionPayload.tabs.length;

    if (loadMode === 'append') {
      const existingCheckpoint = await createDocumentCheckpoint(context, {
        scope: 'workspace',
        reason: meta.reason || 'graph-load-append-existing',
        snapshotKind: 'append-existing',
        policyMode: 'manual-save',
        captureRenderCacheBeforeSnapshot: true
      });
      const existingSnapshot = existingCheckpoint?.snapshot || null;
      const existingTabs = Array.isArray(existingSnapshot?.tabs) ? existingSnapshot.tabs : [];
      existingTabCount = existingTabs.length;
      const incomingTabs = Array.isArray(sessionPayload.tabs) ? sessionPayload.tabs : [];
      const incomingActiveIndex = Number.isFinite(sessionPayload?.activeIndex)
        && sessionPayload.activeIndex >= 0
        && sessionPayload.activeIndex < incomingTabs.length
        ? sessionPayload.activeIndex
        : 0;
      addedTabCount = incomingTabs.length;
      const mergedTabs = [];
      existingTabs.forEach(tab => {
        mergedTabs.push({
          title: tab?.title || 'Workspace',
          type: tab?.type || tab?.payload?.type || null,
          archiveRuntimeTabId: tab?.archiveRuntimeTabId || tab?.runtimeTabId || null,
          payload: cloneWithSession(session, tab?.payload || null),
          layout: cloneWithSession(session, tab?.layout || null),
          previewMarkup: typeof tab?.previewMarkup === 'string' ? tab.previewMarkup : null,
          previewSignature: tab?.previewSignature || null,
          previewMeta: cloneWithSession(session, tab?.previewMeta || null),
          archiveRenderCache: cloneWithSession(session, tab?.archiveRenderCache || null),
          archiveRenderCacheSignature: tab?.archiveRenderCacheSignature || null,
          archiveRenderCacheLayoutSignature: tab?.archiveRenderCacheLayoutSignature || null,
          uiState: cloneWithSession(session, tab?.uiState || null)
        });
      });
      incomingTabs.forEach(tab => {
        mergedTabs.push({
          title: tab?.title || 'Workspace',
          type: tab?.type || tab?.payload?.type || null,
          archiveRuntimeTabId: tab?.archiveRuntimeTabId || tab?.runtimeTabId || null,
          payload: cloneWithSession(session, tab?.payload || null),
          layout: cloneWithSession(session, tab?.layout || null),
          previewMarkup: typeof tab?.previewMarkup === 'string' ? tab.previewMarkup : null,
          previewSignature: tab?.previewSignature || null,
          previewMeta: cloneWithSession(session, tab?.previewMeta || null),
          archiveRenderCache: cloneWithSession(session, tab?.archiveRenderCache || null),
          archiveRenderCacheSignature: tab?.archiveRenderCacheSignature || null,
          archiveRenderCacheLayoutSignature: tab?.archiveRenderCacheLayoutSignature || null,
          uiState: cloneWithSession(session, tab?.uiState || null)
        });
      });
      payloadToApply = {
        ...sessionPayload,
        activeIndex: existingTabs.length + incomingActiveIndex,
        tabs: mergedTabs,
        scope: 'workspace'
      };
      fileScope = 'workspace';
      fileHandle = null;
      fileName = '';
    }

    const loadOptions = withSessionContext({
      reason: meta.reason || 'graph-load',
      fileHandle,
      fileName,
      fileScope,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection
    });
    updateDocumentOpenTransaction(meta.documentOperation, {
      detail: payloadToApply.tabs.length === 1
        ? 'Restoring workspace…'
        : `Restoring ${payloadToApply.tabs.length} workspaces…`,
      current: 0,
      total: Math.max(1, payloadToApply.tabs.length)
    });
    const restoreResult = await session.applySessionData(payloadToApply, loadOptions);
    updateDocumentOpenTransaction(meta.documentOperation, {
      detail: 'Finishing…',
      current: Math.max(1, payloadToApply.tabs.length),
      total: Math.max(1, payloadToApply.tabs.length)
    });
    if (loadMode === 'append') {
      if (workspaceState) {
        workspaceState.sessionFileHandle = null;
        workspaceState.sessionFileName = ensureGraphFileName(context, '', 'workspace.graph');
        workspaceState.sessionFileScope = 'workspace';
      }
      if (existingTabCount > 0 && typeof session.markSessionDirty === 'function') {
        session.markSessionDirty('graph-load-append', { existingTabCount, addedTabCount, origin: 'user' });
      }
    }
    debug(context, 'applyParsedSession.complete', {
      loadMode,
      scope: fileScope,
      existingTabCount,
      addedTabCount,
      tabCount: payloadToApply.tabs.length
    });
    return {
      status: 'loaded',
      scope: fileScope,
      tabCount: payloadToApply.tabs.length,
      source: parsed?.source || 'unknown',
      loadMode,
      addedTabCount,
      restoreResult: restoreResult || null
    };
  }

  async function restoreDocumentArchive(context, source, meta = {}) {
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile is unavailable.');
    }
    const transactionMeta = {
      ...meta,
      fileName: meta.fileName || source?.name || 'workspace.graph'
    };
    const documentOperation = beginDocumentOpenTransaction(context, transactionMeta);
    try {
      const parsed = await graphArchive.parseFile(source, {
        fileName: transactionMeta.fileName
      });
      debug(context, 'restoreDocumentArchive.parsed', {
        source: parsed?.source || 'unknown',
        tabCount: parsed?.session?.tabs?.length || 0,
        reason: meta.reason || 'graph-load'
      });
      const result = await applyParsedSession(context, parsed, {
        ...meta,
        fileName: transactionMeta.fileName,
        documentOperation
      });
      finishDocumentOpenTransaction(context, documentOperation);
      return result;
    } catch (err) {
      failDocumentOpenTransaction(context, documentOperation, err);
      throw err;
    }
  }

  namespace.restoreDocumentArchive = restoreDocumentArchive;

  namespace.loadWorkspaceFile = async function loadWorkspaceFile(context, file, meta = {}) {
    return restoreDocumentArchive(context, file, {
      ...meta,
      reason: meta.reason || 'graph-load'
    });
  };

  namespace.saveWorkspaceArchiveWithScope = async function saveWorkspaceArchiveWithScope(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { session, workspaceState, sessionFileTypes } = context || {};
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!Shared?.fileIO || !graphArchive) {
      throw new Error('Save unavailable: missing Shared.fileIO or Shared.graphArchive.');
    }
    if (!session || !workspaceState) {
      throw new Error('Save unavailable: missing session context.');
    }
    if (hasActiveDocumentOperation(context)) {
      return { status: 'cancelled', reason: 'document-operation' };
    }

    const scope = options.scope === 'workspace' ? 'workspace' : 'tab';
    const rememberFile = options.rememberFile !== false;
    const requestedSnapshotKind = options.snapshotKind
      || (options.reason === 'autosave' ? 'autosave' : 'archive-save');
    const checkpoint = await createDocumentCheckpoint(context, {
      ...options,
      scope,
      reason: options.reason || 'archive-save',
      snapshotKind: requestedSnapshotKind,
      policyMode: options.reason === 'autosave' ? 'autosave' : 'manual-save',
      readyReason: 'pre-save-active-ready'
    });
    if (!checkpoint) {
      debug(context, 'saveWorkspaceArchiveWithScope.skip', { scope, reason: 'no-tabs' });
      return { status: 'cancelled', reason: 'no-tabs' };
    }
    const { snapshot, policy: snapshotPolicy, fileName } = checkpoint;
    const snapshotKind = snapshotPolicy.snapshotKind || requestedSnapshotKind;
    const captureRenderCache = snapshotPolicy.captureRenderCache === true;

    let archiveBlobPromise = null;
    const getArchiveBlob = async () => {
      if (!archiveBlobPromise) {
        archiveBlobPromise = serializeDocumentCheckpoint(context, checkpoint, {
          compression: options.compression,
          payloadMode: options.payloadMode,
          useWorker: options.useWorker
        }).then(blob => {
          debug(context, 'saveWorkspaceArchiveWithScope.archiveBuilt', {
            scope,
            tabCount: snapshot.tabs.length,
            bytes: blob?.size || 0,
            fileName
          });
          return blob;
        });
      }
      return archiveBlobPromise;
    };

    const canReuseHandle = !options.forcePicker
      && !!workspaceState.sessionFileHandle
      && workspaceState.sessionFileScope === scope;
    const saveFn = canReuseHandle
      ? Shared.fileIO.saveGraphFile
      : Shared.fileIO.saveGraphFileAs;
    const result = await saveFn({
      context: 'workspace',
      fileHandle: canReuseHandle ? workspaceState.sessionFileHandle : null,
      getPayload: getArchiveBlob,
      fileName,
      downloadFileName: fileName,
      fileTypes: sessionFileTypes,
      mimeType: 'application/zip',
      allowFallback: options.allowFallback !== false,
      setFileHandle: handle => {
        if (rememberFile) {
          workspaceState.sessionFileHandle = handle || null;
          workspaceState.sessionFilePath = handle?.__desktopFilePath || '';
          workspaceState.sessionFileScope = scope;
        }
        debug(context, 'save.handleStored', { hasHandle: !!handle, scope });
      },
      setFileName: name => {
        if (rememberFile) {
          workspaceState.sessionFileName = ensureGraphFileName(context, name || fileName, fileName);
          workspaceState.sessionFileScope = scope;
        }
        debug(context, 'save.fileNameStored', { name: rememberFile ? workspaceState.sessionFileName : name, scope, rememberFile });
      }
    });

    if (result && (result.status === 'saved' || result.status === 'downloaded')) {
      if (rememberFile && typeof session.clearSessionDirty === 'function') {
        session.clearSessionDirty('graph-save-success');
      }
      if (rememberFile) {
        workspaceState.sessionFileName = ensureGraphFileName(context, result.fileName || workspaceState.sessionFileName || fileName, fileName);
        workspaceState.sessionFilePath = result.filePath || workspaceState.sessionFileHandle?.__desktopFilePath || workspaceState.sessionFilePath || '';
        workspaceState.sessionFileScope = scope;
      }
      window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
        detail: {
          type: rememberFile ? 'saved' : 'saved-copy',
          dirty: rememberFile ? false : !!workspaceState.sessionUserDirty,
          userDirty: rememberFile ? false : !!workspaceState.sessionUserDirty,
          fileName: rememberFile ? workspaceState.sessionFileName : (result.fileName || fileName),
          filePath: rememberFile ? workspaceState.sessionFilePath : (result.filePath || ''),
          fileScope: scope,
          reason: options.reason || 'graph-save-success'
        }
      }));
    }

    debug(context, 'saveWorkspaceArchiveWithScope.result', {
      scope,
      status: result?.status || null,
      via: result?.via || null,
      snapshotKind,
      captureRenderCache,
      snapshotPolicyId: snapshotPolicy.policyId || 'unknown'
    });
    return Object.assign({ scope }, result || {});
  };

  namespace.handleSessionSaveClick = async function handleSessionSaveClick(context, options = {}) {
    const scope = options.scope === 'tab' ? 'tab' : 'workspace';
    debug(context, 'handleSessionSaveClick.scope', { scope, explicit: options.scope || null });

    return namespace.saveWorkspaceArchiveWithScope(context, {
      ...options,
      scope
    });
  };

  namespace.handleSessionLoadClick = async function handleSessionLoadClick(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { sessionFileTypes, dom } = context || {};
    if (!Shared?.fileIO || typeof Shared.fileIO.openGraphFile !== 'function') {
      console.warn('Load unavailable: missing Shared.fileIO.openGraphFile');
      dom?.sessionFileInput?.click?.();
      return { status: 'error', reason: 'no-open-handler' };
    }
    if (hasActiveDocumentOperation(context)) {
      return { status: 'cancelled', reason: 'document-operation' };
    }
    if (!confirmWorkspaceReplacement(context)) {
      return { status: 'cancelled', reason: 'replace-denied' };
    }

    let lastHandle = null;
    let lastName = '';
    try {
      const result = await Shared.fileIO.openGraphFile({
        context: 'workspace',
        setFileHandle: handle => {
          lastHandle = handle || null;
          debug(context, 'load.handleCaptured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = String(name || '').trim();
          debug(context, 'load.fileNameCaptured', { name: lastName });
        },
        fileTypes: sessionFileTypes,
        loadFromFile: async file => {
          await namespace.loadWorkspaceFile(context, file, {
            reason: options.reason || 'graph-load-picker',
            fileHandle: lastHandle,
            fileName: file?.name || lastName
          });
        },
        triggerInput: () => {
          if (dom?.sessionFileInput) {
            dom.sessionFileInput.value = '';
            dom.sessionFileInput.click();
          }
        }
      });
      debug(context, 'handleSessionLoadClick.result', {
        status: result?.status || null,
        via: result?.via || null
      });
      return result;
    } catch (err) {
      debug(context, 'handleSessionLoadClick.error', { message: err?.message || String(err) });
      return { status: 'error', error: err };
    }
  };

  namespace.handleDesktopOpenFilePath = async function handleDesktopOpenFilePath(context, filePath, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const normalizedPath = String(filePath || '').trim();
    if (!normalizedPath) {
      return { status: 'error', reason: 'missing-file-path' };
    }
    if (hasActiveDocumentOperation(context)) {
      return { status: 'cancelled', reason: 'document-operation' };
    }
    if (!Shared?.fileIO || typeof Shared.fileIO.openGraphFilePath !== 'function') {
      console.warn('Desktop file open unavailable: missing Shared.fileIO.openGraphFilePath');
      return { status: 'error', reason: 'no-desktop-path-open-handler' };
    }
    if (!confirmWorkspaceReplacement(context)) {
      return { status: 'cancelled', reason: 'replace-denied' };
    }

    let lastHandle = null;
    let lastName = '';
    try {
      const result = await Shared.fileIO.openGraphFilePath({
        context: 'desktop-file-association',
        filePath: normalizedPath,
        setFileHandle: handle => {
          lastHandle = handle || null;
          debug(context, 'desktopOpen.handleCaptured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = String(name || '').trim();
          debug(context, 'desktopOpen.fileNameCaptured', { name: lastName });
        },
        loadFromFile: async file => {
          await namespace.loadWorkspaceFile(context, file, {
            reason: options.reason || 'desktop-file-association',
            fileHandle: lastHandle,
            fileName: file?.name || lastName,
            filePath: normalizedPath
          });
        }
      });
      debug(context, 'handleDesktopOpenFilePath.result', {
        status: result?.status || null,
        via: result?.via || null,
        filePath: normalizedPath
      });
      return result;
    } catch (err) {
      debug(context, 'handleDesktopOpenFilePath.error', {
        filePath: normalizedPath,
        message: err?.message || String(err)
      });
      return { status: 'error', filePath: normalizedPath, error: err };
    }
  };

  namespace.handleSessionInputChange = function handleSessionInputChange(context, event) {
    const input = event?.target;
    const file = input?.files && input.files[0];
    if (!file) {
      debug(context, 'handleSessionInputChange.noFile');
      return;
    }
    if (hasActiveDocumentOperation(context)) {
      if (input) input.value = '';
      return;
    }
    if (!confirmWorkspaceReplacement(context)) {
      if (input) {
        input.value = '';
      }
      return;
    }
    const fileName = String(file.name || '').trim();
    namespace.loadWorkspaceFile(context, file, {
      reason: 'graph-load-input',
      fileHandle: null,
      fileName
    }).catch(err => {
      debug(context, 'handleSessionInputChange.error', { message: err?.message || String(err) });
    }).finally(() => {
      if (input) {
        input.value = '';
      }
    });
  };

  namespace.shouldWarnBeforeUnload = function shouldWarnBeforeUnload(context) {
    const { session, workspaceState, withSessionContext } = context || {};
    if (!session || !workspaceState || typeof withSessionContext !== 'function') {
      return false;
    }
    let persistedActive = false;
    try {
      const active = session.getActiveTab?.();
      if (active && !active.isWelcome) {
        // Force a live payload capture (not the lifecycle "skip if clean" default): a clean
        // tab.payload is not proof it matches the live component. Bulk hot.loadData() (CSV/
        // import) is a programmatic non-user load that populates the hot WITHOUT syncing
        // tab.payload, so the stored payload can be the empty-default template while the
        // component holds real data. Skipping the capture here would make graphTabsHaveData()
        // report no data and suppress the unsaved-changes warning (and the same stale payload
        // would feed an empty recovery snapshot). Reading live state mirrors what a save does.
        persistedActive = !!session.persistActiveTabState(active, withSessionContext({
          reason: 'beforeunload',
          origin: 'lifecycle',
          snapshotIntent: {
            saveLike: false,
            lifecycleSnapshot: true,
            captureLivePayload: true,
            allowSkipLivePayloadCapture: false,
            reasonSkippable: false,
            snapshotCapture: true
          },
          captureRenderCache: false
        }));
      }
    } catch (err) {
      console.error('beforeunload persist error', err);
    }
    const hasData = typeof session.graphTabsHaveData === 'function'
      ? !!session.graphTabsHaveData()
      : getGraphTabsFromWorkspaceState(workspaceState).length > 0;
    const shouldWarn = !!workspaceState.sessionUserDirty && hasData;
    debug(context, 'shouldWarnBeforeUnload', {
      shouldWarn,
      dirty: !!workspaceState.sessionDirty,
      userDirty: !!workspaceState.sessionUserDirty,
      hasData,
      persistedActive
    });
    return shouldWarn;
  };

  namespace.buildWorkspaceArchiveBlob = async function buildWorkspaceArchiveBlob(context, options = {}) {
    if (hasActiveDocumentOperation(context)) {
      return null;
    }
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.buildArchiveBlob !== 'function') {
      throw new Error('Shared.graphArchive.buildArchiveBlob is unavailable.');
    }
    const now = () => window.performance?.now?.() ?? Date.now();
    const checkpointStartedAt = now();
    const checkpoint = await createDocumentCheckpoint(context, {
      ...options,
      scope: options.scope === 'tab' ? 'tab' : 'workspace',
      reason: options.reason || 'document-snapshot',
      snapshotKind: options.snapshotKind || 'document-snapshot',
      policyMode: options.policyMode || options.mode || 'manual-save'
    });
    options.onPhase?.({ phase: 'checkpoint', ms: now() - checkpointStartedAt });
    if (!checkpoint) {
      return null;
    }
    const serializationStartedAt = now();
    const blob = await serializeDocumentCheckpoint(context, checkpoint, options);
    options.onPhase?.({ phase: 'serialization-total', ms: now() - serializationStartedAt });
    return blob;
  };

  namespace.applyArchiveBlob = async function applyArchiveBlob(context, blob, meta = {}) {
    return restoreDocumentArchive(context, blob, {
      ...meta,
      reason: meta.reason || 'recovery-restore',
      fileHandle: meta.fileHandle || null,
      fileName: meta.fileName || blob?.name || '',
      loadMode: meta.loadMode || 'replace'
    });
  };

  namespace.autosaveWorkspace = async function autosaveWorkspace(context, options = {}) {
    const { workspaceState, session } = context || {};
    if (!workspaceState || !session) {
      return { status: 'error', reason: 'missing-context' };
    }
    if (hasActiveDocumentOperation(context)) {
      return { status: 'skipped', reason: 'document-operation' };
    }
    if (!workspaceState.sessionUserDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const handle = workspaceState.sessionFileHandle;
    if (handle?.__desktopFilePath) {
      return namespace.saveWorkspaceArchiveWithScope(context, {
        ...options,
        reason: options.reason || 'autosave',
        snapshotKind: 'autosave',
        scope: workspaceState.sessionFileScope === 'tab' ? 'tab' : 'workspace',
        forcePicker: false,
        allowFallback: false
      });
    }
    if (handle && typeof handle.queryPermission === 'function') {
      try {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          return namespace.saveWorkspaceArchiveWithScope(context, {
            ...options,
            reason: options.reason || 'autosave',
            snapshotKind: 'autosave',
            scope: workspaceState.sessionFileScope === 'tab' ? 'tab' : 'workspace',
            forcePicker: false,
            allowFallback: false
          });
        }
      } catch (err) {
        debug(context, 'autosaveWorkspace.permissionCheckFailed', { message: err?.message || String(err) });
      }
    }
    return { status: 'skipped', reason: 'no-file-target' };
  };

  console.debug('Debug: sessionActions.js wiring complete', { exports: Object.keys(namespace) });
})();
