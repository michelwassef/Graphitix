(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.documentState = Main.documentState || {};
  const AUTOSAVE_PREF_KEY = 'graphitix.autosave.enabled';
  const WEB_DB_NAME = 'graphitix-document-state';
  const WEB_DB_STORE = 'snapshots';
  const WEB_JOURNAL_STORE = 'canonical-journal';
  const WEB_DB_VERSION = 2;
  const JOURNAL_META_KEY = 'meta';
  const RECOVERY_KEY = 'active-recovery';
  const CANONICAL_JOURNAL_LOCAL_KEY = 'graphitix.canonical-journal.v1';
  // Recovery uses a trailing debounce so heavy mutations, redraws, and statistics work can
  // settle before checkpoint capture touches the main thread. Archive serialization and
  // compression are already delegated to graphArchive.worker.js; live session capture must
  // remain with the owner-aware main-thread state model.
  const RECOVERY_DELAY_MS = 2500;
  // Continuous edits may keep restarting the trailing timer, so cap deferral. The
  // periodic checkpoint uses the same pending window instead of bypassing the delay.
  const RECOVERY_MAX_DEFER_MS = 10000;
  const RECOVERY_INTERVAL_MS = 10000;
  const AUTOSAVE_INTERVAL_MS = 30000;

  let state = null;
  let recoveryTimer = null;
  let recoveryInterval = null;
  let autosaveInterval = null;
  let webDbPromise = null;
  let recoveryWriteSequence = 0;
  let documentStateChangeHandler = null;
  let rotationGestureHandler = null;
  let recoveryTimerRevision = 0;
  let recoveryPendingSince = 0;
  let recoveryInFlightRevision = 0;
  let lastRecoverySavedRevision = 0;
  let canonicalJournalWrite = Promise.resolve();
  let canonicalJournalSequence = 0;
  let canonicalJournalPendingRequest = null;
  let canonicalJournalWriteActive = false;
  let canonicalJournalTabOrder = null;
  let lastRecoveryPerformance = null;
  let autosaveInFlightRevision = 0;
  let lastAutosaveNoTargetRevision = 0;
  let savedMessageTimer = null;
  let savedTitleMessage = '';

  function getSessionRevision() {
    return Number(state?.workspaceState?.sessionRevision) || 0;
  }


  function isRecoverySnapshotCurrent() {
    const revision = getSessionRevision();
    return revision > 0 && lastRecoverySavedRevision >= revision;
  }

  function hasDirtyRecoveryRevision() {
    return !state?.restoringRecovery
      && !!state?.workspaceState?.sessionUserDirty
      && !isRecoverySnapshotCurrent();
  }

  function hasRecoverySnapshotDue() {
    if (!hasDirtyRecoveryRevision()) {
      return false;
    }
    const revision = getSessionRevision();
    const inFlight = revision > 0
      ? recoveryInFlightRevision === revision
      : recoveryInFlightRevision < 0;
    return !inFlight;
  }

  function hasActiveRotationGesture() {
    try {
      return window.Shared?.plot3d?.hasActiveRotationGesture?.() === true;
    } catch (err) {
      debug('recovery.rotationProbeFailed', { message: err?.message || String(err) });
      return false;
    }
  }

  function deferRecoveryForActiveRotation(reason = 'active-rotation-gesture') {
    // Preserve the pending checkpoint even when a recovery build is currently
    // unwinding. An interaction may end before the in-flight guard is released;
    // retaining this marker lets the finally path resume immediately instead of
    // losing the checkpoint until the periodic interval.
    if (!hasDirtyRecoveryRevision()) {
      return false;
    }
    if (!recoveryPendingSince) {
      recoveryPendingSince = Date.now();
    }
    clearRecoveryTimer();
    debug('recovery.deferredForRotation', {
      reason,
      revision: getSessionRevision(),
      pendingSince: recoveryPendingSince
    });
    return true;
  }

  function debug(message, payload) {
    const Shared = window.Shared || {};
    if (!(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled())) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('Debug: documentState.' + message, payload || {});
    }
  }

  function isDesktop() {
    return !!(window.desktop && window.desktop.isDesktop);
  }

  function readAutosavePreference() {
    try {
      return window.localStorage.getItem(AUTOSAVE_PREF_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function writeAutosavePreference(enabled) {
    try {
      window.localStorage.setItem(AUTOSAVE_PREF_KEY, enabled ? '1' : '0');
    } catch (err) {
      debug('autosavePreference.writeSkipped', { message: err?.message || String(err) });
    }
  }

  function openWebDb() {
    if (webDbPromise) {
      return webDbPromise;
    }
    webDbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB unavailable.'));
        return;
      }
      const request = window.indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WEB_DB_STORE)) {
          db.createObjectStore(WEB_DB_STORE);
        }
        if (!db.objectStoreNames.contains(WEB_JOURNAL_STORE)) {
          db.createObjectStore(WEB_JOURNAL_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    return webDbPromise;
  }

  async function putWebSnapshot(record) {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_DB_STORE, 'readwrite');
      tx.objectStore(WEB_DB_STORE).put(record, RECOVERY_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot write failed.'));
    });
  }

  async function getWebSnapshot() {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_DB_STORE, 'readonly');
      const request = tx.objectStore(WEB_DB_STORE).get(RECOVERY_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('IndexedDB snapshot read failed.'));
    });
  }

  async function clearWebSnapshot() {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_DB_STORE, 'readwrite');
      tx.objectStore(WEB_DB_STORE).delete(RECOVERY_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot clear failed.'));
    });
  }

  async function putCanonicalJournal(meta, tabs) {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_JOURNAL_STORE, 'readwrite');
      const store = tx.objectStore(WEB_JOURNAL_STORE);
      store.put(meta, JOURNAL_META_KEY);
      (Array.isArray(tabs) ? tabs : []).forEach(tab => {
        if (tab?.id) {
          store.put(tab, `tab:${tab.id}`);
        }
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB journal write failed.'));
    });
  }

  async function getCanonicalJournal() {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_JOURNAL_STORE, 'readonly');
      const request = tx.objectStore(WEB_JOURNAL_STORE).getAll();
      request.onsuccess = () => {
        const records = Array.isArray(request.result) ? request.result : [];
        const meta = records.find(record => record?.kind === 'canonical-journal') || null;
        const tabs = records.filter(record => record?.kind === 'canonical-tab');
        resolve(meta ? { meta, tabs } : null);
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB journal read failed.'));
    });
  }

  async function clearCanonicalJournal() {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_JOURNAL_STORE, 'readwrite');
      tx.objectStore(WEB_JOURNAL_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB journal clear failed.'));
    });
  }

  function base64ToBlob(dataBase64) {
    const binary = window.atob(String(dataBase64 || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'application/zip' });
  }

  function getDisplayName() {
    const workspaceState = state?.workspaceState || {};
    return String(workspaceState.sessionFileName || '').trim() || 'Untitled.graph';
  }

  function cloneCanonicalValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    try {
      if (typeof state?.session?.fastClonePayload === 'function') {
        return state.session.fastClonePayload(value);
      }
      if (typeof state?.session?.clonePayload === 'function') {
        return state.session.clonePayload(value);
      }
      if (typeof window.structuredClone === 'function') {
        return window.structuredClone(value);
      }
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      debug('journal.cloneFailed', { message: err?.message || String(err) });
      return null;
    }
  }

  function readLocalCanonicalJournal() {
    try {
      const raw = window.localStorage.getItem(CANONICAL_JOURNAL_LOCAL_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed?.meta && Array.isArray(parsed?.tabs) ? parsed : null;
    } catch (err) {
      debug('journal.localReadFailed', { message: err?.message || String(err) });
      return null;
    }
  }

  function writeLocalCanonicalJournal(journal) {
    if (!journal?.meta || !Array.isArray(journal.tabs)) {
      return false;
    }
    try {
      window.localStorage.setItem(CANONICAL_JOURNAL_LOCAL_KEY, JSON.stringify(journal));
      return true;
    } catch (err) {
      // IndexedDB remains the large-state path. A quota/security failure here
      // must not block normal persistence or rendering.
      debug('journal.localWriteSkipped', { message: err?.message || String(err) });
      return false;
    }
  }

  function clearLocalCanonicalJournal() {
    try {
      window.localStorage.removeItem(CANONICAL_JOURNAL_LOCAL_KEY);
    } catch (err) {
      debug('journal.localClearFailed', { message: err?.message || String(err) });
    }
  }

  function resolveJournalTabId(detail = {}) {
    return String(
      detail.tabId
      || detail.details?.tabId
      || detail.ownerTabId
      || ''
    ).trim();
  }

  function buildCanonicalJournalState(detail = {}, forceAll = false) {
    const workspaceState = state?.workspaceState || {};
    const allTabs = Array.isArray(workspaceState.tabs) ? workspaceState.tabs : [];
    const graphTabs = allTabs.filter(tab => tab && !tab.isWelcome && tab.type);
    if (!graphTabs.length) {
      return null;
    }
    const changedTabId = forceAll ? '' : resolveJournalTabId(detail);
    const tabsToWrite = changedTabId
      ? graphTabs.filter(tab => String(tab.id) === changedTabId)
      : graphTabs;
    const graphTabIds = graphTabs.map(tab => String(tab.id || '')).filter(Boolean);
    const activeIndex = graphTabIds.indexOf(String(workspaceState.activeTabId || ''));
    const revision = getSessionRevision();
    return {
      meta: {
        kind: 'canonical-journal',
        version: 1,
        dirty: true,
        hasData: true,
        revision,
        updatedAt: Date.now(),
        savedAt: new Date().toISOString(),
        fileName: workspaceState.sessionFileName || '',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || 'workspace',
        activeTabId: workspaceState.activeTabId || null,
        activeIndex: activeIndex >= 0 ? activeIndex : 0,
        tabCount: graphTabs.length,
        tabOrder: graphTabIds,
        tabMeta: graphTabs.map(tab => ({
          id: tab.id,
          title: tab.title || 'Workspace',
          type: tab.type || tab?.payload?.type || null
        }))
      },
      tabs: tabsToWrite.map(tab => ({
        kind: 'canonical-tab',
        id: tab.id,
        title: tab.title || 'Workspace',
        type: tab.type || tab?.payload?.type || null,
        runtimeTabId: tab.id,
        payload: cloneCanonicalValue(tab.payload || null),
        layout: cloneCanonicalValue(tab.layoutState || null),
        uiState: cloneCanonicalValue(tab.uiState || null)
      }))
    };
  }

  function scheduleCanonicalJournal(detail = {}, options = {}) {
    if (!state?.workspaceState?.sessionUserDirty || state.restoringRecovery) {
      return;
    }
    const sequence = ++canonicalJournalSequence;
    canonicalJournalPendingRequest = { detail, sequence };
    if (canonicalJournalWriteActive) {
      return;
    }
    canonicalJournalWriteActive = true;
    canonicalJournalWrite = canonicalJournalWrite
      .catch(() => {})
      .then(async () => {
        do {
          const request = canonicalJournalPendingRequest;
          canonicalJournalPendingRequest = null;
          if (!request) {
            break;
          }
          // User handlers may mark a tab dirty before their final canonical payload
          // write. Capture after the current mutation stack has completed.
          await Promise.resolve();
          if (!options.skipSessionFlush && typeof state?.session?.flushCanonicalUserMutationState === 'function') {
            await state.session.flushCanonicalUserMutationState();
          }
          const currentTabOrder = (state?.workspaceState?.tabs || [])
            .filter(tab => tab && !tab.isWelcome && tab.type)
            .map(tab => String(tab.id || ''))
            .filter(Boolean);
          const forceAll = !canonicalJournalTabOrder
            || JSON.stringify(canonicalJournalTabOrder) !== JSON.stringify(currentTabOrder);
          const journal = buildCanonicalJournalState(request.detail, forceAll);
          if (!journal || !state?.workspaceState?.sessionUserDirty || state.restoringRecovery) {
            break;
          }
          debug('journal.beforeWrite', {
            sequence: request.sequence,
            currentSequence: canonicalJournalSequence,
            revision: journal.meta.revision,
            changedTabId: resolveJournalTabId(request.detail) || null,
            tabs: journal.tabs.map(tab => ({
              id: tab.id,
              type: tab.type,
              graphType: tab.payload?.config?.graphType || tab.payload?.config?.plotMode || null,
              whiskerRule: tab.payload?.config?.whisker?.rule || null
            }))
          });
          try {
            await putCanonicalJournal(journal.meta, journal.tabs);
            canonicalJournalTabOrder = journal.meta.tabOrder.slice();
            debug('journal.written', {
              revision: journal.meta.revision,
              tabCount: journal.meta.tabCount,
              changedTabId: resolveJournalTabId(request.detail) || null
            });
          } catch (err) {
            debug('journal.writeFailed', { message: err?.message || String(err) });
          }
        } while (canonicalJournalPendingRequest);
      })
      .finally(() => {
        canonicalJournalWriteActive = false;
        if (canonicalJournalPendingRequest && state?.workspaceState?.sessionUserDirty && !state.restoringRecovery) {
          window.queueMicrotask?.(() => {
            if (canonicalJournalPendingRequest && !canonicalJournalWriteActive) {
              const pending = canonicalJournalPendingRequest;
              canonicalJournalPendingRequest = null;
              scheduleCanonicalJournal(pending.detail);
            }
          });
        }
      });
  }

  function persistCanonicalJournalNow(detail = {}) {
    if (!state?.workspaceState?.sessionUserDirty || state.restoringRecovery) {
      return false;
    }
    const journal = buildCanonicalJournalState(detail, true);
    if (!journal) {
      return false;
    }
    const written = writeLocalCanonicalJournal(journal);
    if (written) {
      debug('journal.localWritten', {
        revision: journal.meta.revision,
        tabCount: journal.meta.tabCount,
        changedTabId: resolveJournalTabId(detail) || null
      });
    }
    return written;
  }

  async function buildRecoveryRecordFromJournal(journal) {
    const graphArchive = window.Shared?.graphArchive || null;
    if (!journal?.meta || !Array.isArray(journal.meta.tabOrder)
      || !Array.isArray(journal.tabs) || !graphArchive
      || typeof graphArchive.buildArchiveBlob !== 'function') {
      return null;
    }
    const tabsById = new Map(journal.tabs.map(tab => [String(tab?.id || ''), tab]));
    const tabs = journal.meta.tabOrder.map(id => tabsById.get(String(id))).filter(Boolean).map(tab => ({
      title: tab.title || 'Workspace',
      type: tab.type || tab.payload?.type || null,
      runtimeTabId: tab.runtimeTabId || tab.id || null,
      payload: tab.payload || null,
      layout: tab.layout || null,
      previewMarkup: null,
      previewSignature: null,
      previewMeta: null,
      archiveRenderCache: null,
      archiveRenderCacheSignature: null,
      archiveRenderCacheLayoutSignature: null,
      uiState: tab.uiState || null
    })).filter(tab => tab.type && tab.payload);
    if (!tabs.length) {
      return null;
    }
    const activeIndex = Math.min(
      Math.max(0, Number(journal.meta.activeIndex) || 0),
      tabs.length - 1
    );
    const blob = await graphArchive.buildArchiveBlob({
      tabs,
      activeIndex,
      fileName: journal.meta.fileName || 'recovered.graph',
      scope: 'workspace',
      compression: 'STORE',
      payloadMode: 'full',
      useWorker: false
    });
    if (!blob) {
      return null;
    }
    return {
      blob,
      meta: {
        ...journal.meta,
        kind: 'recovery',
        source: 'canonical-journal'
      }
    };
  }

  function currentWorkspaceHasRecoverableData() {
    if (!state?.session || typeof state.session.graphTabsHaveData !== 'function') {
      const tabs = Array.isArray(state?.workspaceState?.tabs) ? state.workspaceState.tabs : [];
      return tabs.some(tab => tab && !tab.isWelcome && tab.type);
    }
    return !!state.session.graphTabsHaveData();
  }

  function parsedSessionHasRecoverableData(parsed) {
    const tabs = Array.isArray(parsed?.session?.tabs) ? parsed.session.tabs : [];
    if (!tabs.length) {
      return false;
    }
    if (typeof state?.session?.tabHasTableData !== 'function') {
      return true;
    }
    return tabs.some(tabData => state.session.tabHasTableData({
      id: 'recovery-preview',
      type: tabData?.type || tabData?.payload?.type || null,
      payload: tabData?.payload || null,
      isWelcome: false
    }));
  }

  async function recoveryRecordHasRecoverableData(record) {
    if (!record?.blob) {
      return false;
    }
    if (Number.isFinite(Number(record?.meta?.tabCount)) && Number(record.meta.tabCount) <= 0) {
      return false;
    }
    if (record.meta && Object.prototype.hasOwnProperty.call(record.meta, 'hasData')) {
      return !!record.meta.hasData;
    }
    try {
      const graphArchive = window.Shared?.graphArchive || null;
      if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
        return true;
      }
      const parsed = await graphArchive.parseFile(record.blob, {
        fileName: record?.meta?.fileName || record.blob?.name || 'recovered.graph'
      });
      return parsedSessionHasRecoverableData(parsed);
    } catch (err) {
      debug('recovery.inspectFailed', { message: err?.message || String(err) });
      return true;
    }
  }

  function syncTitle(meta = {}) {
    if (!state) {
      return;
    }
    const workspaceState = state.workspaceState || {};
    const fileName = getDisplayName();
    const dirty = !!workspaceState.sessionUserDirty;
    const display = `${fileName}${dirty ? ' *' : ''}`;
    const titleDisplay = savedTitleMessage || display;
    const titleEls = Array.from(document.querySelectorAll('[data-document-title="1"]'));
    const statusEls = Array.from(document.querySelectorAll('[data-document-status="1"]'));
    const autosaveEls = Array.from(document.querySelectorAll('input[data-document-autosave="1"]'));
    titleEls.forEach(titleEl => {
      titleEl.textContent = titleDisplay;
      titleEl.title = workspaceState.sessionFilePath || fileName;
    });
    statusEls.forEach(statusEl => {
      const autosave = state.autosaveEnabled ? 'Autosave On' : 'Autosave Off';
      const savedState = dirty ? 'Unsaved changes' : 'Saved';
      statusEl.textContent = `${autosave} · ${savedState}`;
    });
    autosaveEls.forEach(autosaveEl => {
      autosaveEl.checked = !!state.autosaveEnabled;
    });
    document.title = `Graphitix - ${display}`;
    debug('syncTitle', { fileName, dirty, reason: meta.reason || 'sync' });
  }

  function showSavedTitleMessage(detail = {}) {
    const fileName = String(detail.fileName || getDisplayName()).trim() || 'Untitled.graph';
    savedTitleMessage = `Saved: ${fileName}`;
    if (savedMessageTimer) {
      window.clearTimeout(savedMessageTimer);
    }
    syncTitle({ reason: detail.reason || 'saved-message' });
    savedMessageTimer = window.setTimeout(() => {
      savedTitleMessage = '';
      savedMessageTimer = null;
      syncTitle({ reason: 'saved-message-clear' });
    }, 2200);
  }

  async function buildRecoveryRecord(reason, phaseMetrics = {}) {
    if (!state?.sessionActions || typeof state.sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      return null;
    }
    const context = state.getSessionActionsContext();
    const blob = await state.sessionActions.buildWorkspaceArchiveBlob(context, {
      reason,
      scope: 'workspace',
      useWorker: true,
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      onPhase: metric => {
        if(metric?.phase && Number.isFinite(Number(metric.ms))){
          phaseMetrics[metric.phase] = Number(metric.ms);
        }
      }
    });
    if (!blob || !currentWorkspaceHasRecoverableData()) {
      return null;
    }
    const workspaceState = state.workspaceState || {};
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    return {
      blob,
      meta: {
        app: 'Graphitix',
        kind: 'recovery',
        version: 1,
        savedAt: new Date().toISOString(),
        updatedAt: Date.now(),
        reason,
        dirty: !!workspaceState.sessionUserDirty,
        hasData: true,
        tabCount: graphTabs.length,
        revision: getSessionRevision(),
        fileName: workspaceState.sessionFileName || '',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || null
      }
    };
  }

  async function writeRecoverySnapshot(reason = 'recovery') {
    if (state?.restoringRecovery) {
      return { status: 'skipped', reason: 'restore-in-progress' };
    }
    if (!state?.workspaceState?.sessionUserDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const revision = getSessionRevision();
    if (hasActiveRotationGesture()) {
      deferRecoveryForActiveRotation(reason);
      return { status: 'deferred', reason: 'active-rotation-gesture', revision };
    }
    if (revision > 0 && lastRecoverySavedRevision >= revision) {
      debug('recovery.write.skippedCurrent', { reason, revision });
      return { status: 'skipped', reason: 'current', revision };
    }
    const inFlightToken = revision > 0 ? revision : -1;
    if (recoveryInFlightRevision === inFlightToken) {
      debug('recovery.write.skippedInFlight', { reason, revision });
      return { status: 'skipped', reason: 'in-flight', revision };
    }
    const sequence = ++recoveryWriteSequence;
    recoveryInFlightRevision = inFlightToken;
    let interactionDeferred = false;
    let snapshotReadinessDeferred = false;
    const recoveryJob = window.Shared?.jobs?.start?.({
      kind: 'recovery',
      component: 'document',
      label: 'Saving recovery snapshot...',
      message: 'Saving recovery snapshot...',
      reason,
      cancellable: false
    }) || null;
    const now = () => window.performance?.now?.() ?? Date.now();
    const totalStartedAt = now();
    const phaseMetrics = {};
    try {
      const record = await buildRecoveryRecord(reason, phaseMetrics);
      if (!record) {
        await clearRecoverySnapshot('no-recoverable-data');
        lastRecoverySavedRevision = revision;
        return { status: 'skipped', reason: 'no-recoverable-data' };
      }
      const currentRevision = getSessionRevision();
      if(revision > 0 && currentRevision !== revision){
        debug('recovery.write.staleRevision', { reason, revision, currentRevision });
        return { status: 'skipped', reason: 'stale-revision', revision, currentRevision };
      }
      if (sequence !== recoveryWriteSequence) {
        debug('recovery.write.superseded', { reason, sequence, latest: recoveryWriteSequence });
        return { status: 'skipped', reason: 'superseded' };
      }
      if (isDesktop() && typeof window.desktop.writeRecoverySnapshot === 'function') {
        const storageStartedAt = now();
        await window.desktop.writeRecoverySnapshot({
          meta: record.meta,
          dataBuffer: await record.blob.arrayBuffer()
        });
        phaseMetrics.storage = now() - storageStartedAt;
        lastRecoverySavedRevision = revision;
        lastRecoveryPerformance = {
          ...phaseMetrics,
          total: now() - totalStartedAt,
          bytes: record.blob.size,
          revision,
          via: 'desktop'
        };
        debug('recovery.write.desktop', { bytes: record.blob.size, reason });
        return { status: 'saved', via: 'desktop', bytes: record.blob.size };
      }
      const storageStartedAt = now();
      await putWebSnapshot({
        meta: record.meta,
        blob: record.blob
      });
      phaseMetrics.storage = now() - storageStartedAt;
      lastRecoverySavedRevision = revision;
      lastRecoveryPerformance = {
        ...phaseMetrics,
        total: now() - totalStartedAt,
        bytes: record.blob.size,
        revision,
        via: 'web'
      };
      debug('recovery.write.web', { bytes: record.blob.size, reason });
      return { status: 'saved', via: 'web', bytes: record.blob.size };
    } catch (err) {
      if (err?.code === 'GRAPHITIX_RECOVERY_INTERACTION_ACTIVE') {
        interactionDeferred = true;
        deferRecoveryForActiveRotation(`${reason}:${err.stage || 'checkpoint'}`);
        debug('recovery.write.deferredDuringCheckpoint', {
          reason,
          stage: err.stage || null,
          revision
        });
        return { status: 'deferred', reason: 'active-rotation-gesture', revision };
      }
      if (err?.code === 'GRAPHITIX_SNAPSHOT_NOT_READY') {
        snapshotReadinessDeferred = true;
        debug('recovery.write.deferredForSnapshotReadiness', {
          reason,
          snapshotReason: err.reason || null,
          tabId: err.tabId || null,
          component: err.component || null,
          revision
        });
        return { status: 'deferred', reason: 'snapshot-not-ready', revision };
      }
      window.Shared?.jobs?.fail?.(recoveryJob?.id, err);
      console.error('documentState recovery snapshot error', err);
      return { status: 'error', error: err };
    } finally {
      if (recoveryJob && !window.Shared?.jobs?.isCancelled?.(recoveryJob.id)) {
        window.Shared?.jobs?.complete?.(recoveryJob.id, { reason });
      }
      if (recoveryInFlightRevision === inFlightToken) {
        recoveryInFlightRevision = 0;
      }
      if (interactionDeferred && !hasActiveRotationGesture() && hasRecoverySnapshotDue()) {
        scheduleRecoverySnapshot(`${reason}-interaction-settled`);
      } else if (snapshotReadinessDeferred && hasRecoverySnapshotDue()) {
        scheduleRecoverySnapshot(`${reason}-snapshot-ready-retry`);
      }
    }
  }

  function clearRecoveryTimer() {
    if (recoveryTimer) {
      window.clearTimeout(recoveryTimer);
    }
    recoveryTimer = null;
    recoveryTimerRevision = 0;
  }

  function scheduleRecoverySnapshot(reason = 'document-change') {
    if (!hasRecoverySnapshotDue()) {
      debug('recovery.schedule.skipped', {
        reason,
        revision: getSessionRevision(),
        lastRecoverySavedRevision,
        recoveryInFlightRevision
      });
      return;
    }
    if (hasActiveRotationGesture()) {
      deferRecoveryForActiveRotation(reason);
      return;
    }
    const now = Date.now();
    if (!recoveryPendingSince) {
      recoveryPendingSince = now;
    }
    const scheduledRevision = getSessionRevision();
    const remainingMaxDefer = Math.max(0, RECOVERY_MAX_DEFER_MS - (now - recoveryPendingSince));
    const delay = Math.min(RECOVERY_DELAY_MS, remainingMaxDefer);
    clearRecoveryTimer();
    recoveryTimerRevision = scheduledRevision;
    recoveryTimer = window.setTimeout(() => {
      const timerRevision = recoveryTimerRevision;
      clearRecoveryTimer();
      if (timerRevision > 0 && lastRecoverySavedRevision >= timerRevision) {
        recoveryPendingSince = 0;
        debug('recovery.timer.skippedCurrent', { reason, scheduledRevision: timerRevision, lastRecoverySavedRevision });
        return;
      }
      if (hasActiveRotationGesture()) {
        deferRecoveryForActiveRotation(reason);
        return;
      }
      recoveryPendingSince = 0;
      void writeRecoverySnapshot(reason);
    }, delay);
    debug('recovery.schedule', { reason, revision: recoveryTimerRevision, delay });
  }

  async function clearRecoverySnapshot(reason = 'clear') {
    canonicalJournalPendingRequest = null;
    canonicalJournalTabOrder = null;
    clearLocalCanonicalJournal();
    try {
      if (isDesktop() && typeof window.desktop.clearRecoverySnapshot === 'function') {
        await window.desktop.clearRecoverySnapshot();
      } else {
        await clearWebSnapshot();
      }
      debug('recovery.clear', { reason });
    } catch (err) {
      debug('recovery.clearFailed', { reason, message: err?.message || String(err) });
    }
    try {
      await clearCanonicalJournal();
    } catch (err) {
      debug('journal.clearFailed', { reason, message: err?.message || String(err) });
    }
  }

  async function readStoredRecoverySnapshot() {
    try {
      if (isDesktop() && typeof window.desktop.readRecoverySnapshot === 'function') {
        const result = await window.desktop.readRecoverySnapshot();
        if (!result?.exists || !result?.dataBase64) {
          return null;
        }
        return {
          meta: result.meta || {},
          blob: base64ToBlob(result.dataBase64)
        };
      }
      const record = await getWebSnapshot();
      if (!record?.blob) {
        return null;
      }
      return record;
    } catch (err) {
      debug('recovery.readFailed', { message: err?.message || String(err) });
      return null;
    }
  }

  async function readRecoverySnapshot() {
    const stored = await readStoredRecoverySnapshot();
    if (!window.indexedDB) {
      const localJournal = readLocalCanonicalJournal();
      if (!localJournal) {
        return stored;
      }
      const localRecord = await buildRecoveryRecordFromJournal(localJournal);
      const storedRevision = Number(stored?.meta?.revision) || 0;
      const localRevision = Number(localRecord?.meta?.revision) || 0;
      return localRevision > storedRevision ? localRecord : (stored || localRecord);
    }
    let journalRecord = null;
    try {
      journalRecord = await buildRecoveryRecordFromJournal(await getCanonicalJournal());
    } catch (err) {
      debug('journal.readFailed', { message: err?.message || String(err) });
    }
    if (!journalRecord) {
      journalRecord = null;
    }
    const storedRevision = Number(stored?.meta?.revision) || 0;
    const localRecord = await buildRecoveryRecordFromJournal(readLocalCanonicalJournal());
    const journalCandidates = [journalRecord, localRecord]
      .filter(Boolean)
      .sort((left, right) => (Number(right?.meta?.revision) || 0) - (Number(left?.meta?.revision) || 0));
    const newestJournal = journalCandidates[0] || null;
    const journalRevision = Number(newestJournal?.meta?.revision) || 0;
    return journalRevision > storedRevision ? newestJournal : (stored || newestJournal);
  }

  async function maybeRestoreRecovery() {
    const record = await readRecoverySnapshot();
    if (!record?.blob || !record?.meta?.dirty) {
      return false;
    }
    if (!(await recoveryRecordHasRecoverableData(record))) {
      await clearRecoverySnapshot('no-recoverable-data');
      return false;
    }
    const fileName = record.meta.fileName || 'recovered.graph';
    const savedAt = record.meta.savedAt ? new Date(record.meta.savedAt).toLocaleString() : 'a previous session';
    const shouldRestore = typeof window.confirm === 'function'
      ? window.confirm(`Graphitix found recovered changes for ${fileName} from ${savedAt}. Restore them now?`)
      : true;
    if (!shouldRestore) {
      await clearRecoverySnapshot('user-discarded-recovery');
      return false;
    }
    record.blob.name = fileName;
    state.restoringRecovery = true;
    try {
      await state.sessionActions.applyArchiveBlob(state.getSessionActionsContext(), record.blob, {
        reason: 'recovery-restore',
        fileName: record.meta.fileName || ''
      });
      state.workspaceState.sessionFileHandle = null;
      state.workspaceState.sessionFilePath = record.meta.filePath || '';
      state.workspaceState.sessionFileName = record.meta.fileName || fileName;
      state.workspaceState.sessionFileScope = record.meta.fileScope || 'workspace';
      state.session.markSessionDirty('recovery-restored', {
        fileName: state.workspaceState.sessionFileName,
        recoveredAt: record.meta.savedAt || null,
        origin: 'user'
      });
      // The recovered archive already is the exact checkpoint for this newly dirty
      // revision. Rebuilding it immediately would re-read the just-projected DOM,
      // mutate canonical state, and invalidate the cache that was successfully
      // restored. The next genuine user revision schedules the next checkpoint.
      clearRecoveryTimer();
      recoveryPendingSince = 0;
      recoveryTimerRevision = 0;
      lastRecoverySavedRevision = getSessionRevision();
    } finally {
      state.restoringRecovery = false;
    }
    syncTitle({ reason: 'recovery-restored' });
    return true;
  }

  async function runAutosave(reason = 'autosave') {
    if (!state?.autosaveEnabled) {
      return { status: 'skipped', reason: 'disabled' };
    }
    if (!state.workspaceState?.sessionUserDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const revision = getSessionRevision();
    if (revision > 0 && autosaveInFlightRevision === revision) {
      return { status: 'skipped', reason: 'in-flight', revision };
    }
    if (revision > 0 && lastAutosaveNoTargetRevision === revision && !state.workspaceState?.sessionFileHandle) {
      if (hasRecoverySnapshotDue()) {
        await writeRecoverySnapshot(`${reason}-private-snapshot`);
      }
      return { status: 'skipped', reason: 'no-file-target', revision };
    }
    autosaveInFlightRevision = revision;
    const autosaveJob = window.Shared?.jobs?.start?.({
      kind: 'save',
      component: 'document',
      label: 'Autosaving workspace...',
      message: 'Autosaving workspace...',
      reason,
      cancellable: false
    }) || null;
    let result = null;
    try {
      result = await state.sessionActions.autosaveWorkspace(state.getSessionActionsContext(), { reason });
      if (result?.status === 'saved' || result?.status === 'downloaded') {
        lastRecoverySavedRevision = revision;
        await clearRecoverySnapshot('autosave-success');
      } else {
        if (result?.reason === 'no-file-target') {
          lastAutosaveNoTargetRevision = revision;
        }
        if (hasRecoverySnapshotDue()) {
          await writeRecoverySnapshot(`${reason}-private-snapshot`);
        }
      }
    } finally {
      if (autosaveJob && !window.Shared?.jobs?.isCancelled?.(autosaveJob.id)) {
        window.Shared?.jobs?.complete?.(autosaveJob.id, { reason });
      }
      if (autosaveInFlightRevision === revision) {
        autosaveInFlightRevision = 0;
      }
    }
    syncTitle({ reason });
    return result;
  }

  function setAutosaveEnabled(enabled, meta = {}) {
    state.autosaveEnabled = !!enabled;
    writeAutosavePreference(state.autosaveEnabled);
    if (state.autosaveEnabled) {
      void runAutosave(meta.reason || 'autosave-enabled');
    }
    syncTitle({ reason: meta.reason || 'autosave-toggle' });
  }

  function bindUi() {
    document.addEventListener('change', event => {
      const autosaveToggle = event.target?.closest?.('input[data-document-autosave="1"]');
      if (autosaveToggle) {
        setAutosaveEnabled(autosaveToggle.checked, { reason: 'autosave-toggle-ui' });
      }
    }, true);

  }

  namespace.init = function init(options = {}) {
    if (state) {
      syncTitle({ reason: 'init-repeat' });
      return namespace;
    }
    state = {
      session: options.session,
      sessionActions: options.sessionActions,
      workspaceState: options.workspaceState,
      getSessionActionsContext: options.getSessionActionsContext,
      dom: options.dom || {},
      autosaveEnabled: readAutosavePreference(),
      restoringRecovery: false
    };
    bindUi();
    documentStateChangeHandler = event => {
      if (!state) {
        return;
      }
      const type = event?.detail?.type || 'change';
      if (type === 'saved' || type === 'saved-copy') {
        showSavedTitleMessage(event.detail || {});
      }
      syncTitle({ reason: type });
      if (state.workspaceState?.sessionUserDirty) {
        scheduleCanonicalJournal(event?.detail || {});
        scheduleRecoverySnapshot(type);
      } else if ((type === 'saved' || type === 'clean') && !state.restoringRecovery) {
        clearRecoveryTimer();
        recoveryPendingSince = 0;
        lastRecoverySavedRevision = getSessionRevision();
        lastAutosaveNoTargetRevision = 0;
        void clearRecoverySnapshot(type);
      }
    };
    window.addEventListener('graphitix:document-state-change', documentStateChangeHandler);
    rotationGestureHandler = event => {
      const detail = event?.detail || {};
      if (detail.phase !== 'end' || Number(detail.activeCount) > 0 || !hasRecoverySnapshotDue()) {
        return;
      }
      scheduleRecoverySnapshot(`${detail.componentKey || 'plot3d'}-rotation-settled`);
    };
    window.addEventListener('graphitix:plot3d-rotation-gesture', rotationGestureHandler);
    recoveryInterval = window.setInterval(() => {
      if (!hasRecoverySnapshotDue()) {
        return;
      }
      if (recoveryTimer) {
        return;
      }
      if (hasActiveRotationGesture()) {
        deferRecoveryForActiveRotation('recovery-interval');
        return;
      }
      if (recoveryPendingSince) {
        scheduleRecoverySnapshot('recovery-interval-resume');
        return;
      }
      void writeRecoverySnapshot('recovery-interval');
    }, RECOVERY_INTERVAL_MS);
    autosaveInterval = window.setInterval(() => {
      void runAutosave('autosave-interval');
    }, AUTOSAVE_INTERVAL_MS);
    syncTitle({ reason: 'init' });
    debug('init', {
      autosaveEnabled: state.autosaveEnabled,
      isDesktop: isDesktop()
    });
    return namespace;
  };

  namespace.setAutosaveEnabled = setAutosaveEnabled;
  namespace.writeRecoverySnapshot = writeRecoverySnapshot;
  namespace.getRecoveryPerformance = () => lastRecoveryPerformance ? { ...lastRecoveryPerformance } : null;
  namespace.clearRecoverySnapshot = clearRecoverySnapshot;
  namespace.persistCanonicalJournalNow = persistCanonicalJournalNow;
  namespace.scheduleCanonicalJournal = scheduleCanonicalJournal;
  namespace.maybeRestoreRecovery = maybeRestoreRecovery;
  namespace.runAutosave = runAutosave;
  namespace.syncTitle = syncTitle;
  namespace.dispose = function dispose() {
    clearRecoveryTimer();
    if (savedMessageTimer) window.clearTimeout(savedMessageTimer);
    if (recoveryInterval) window.clearInterval(recoveryInterval);
    if (autosaveInterval) window.clearInterval(autosaveInterval);
    if (documentStateChangeHandler) window.removeEventListener('graphitix:document-state-change', documentStateChangeHandler);
    if (rotationGestureHandler) window.removeEventListener('graphitix:plot3d-rotation-gesture', rotationGestureHandler);
    recoveryPendingSince = 0;
    canonicalJournalSequence += 1;
    canonicalJournalPendingRequest = null;
    canonicalJournalTabOrder = null;
    canonicalJournalWriteActive = false;
    canonicalJournalWrite = Promise.resolve();
    recoveryInterval = null;
    autosaveInterval = null;
    documentStateChangeHandler = null;
    rotationGestureHandler = null;
    state = null;
  };
})();
