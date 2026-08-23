(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.documentState = Main.documentState || {};
  const AUTOSAVE_PREF_KEY = 'graphitix.autosave.enabled';
  const WEB_DB_NAME = 'graphitix-document-state';
  const WEB_DB_STORE = 'snapshots';
  const RECOVERY_KEY = 'active-recovery';
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
  // The rich recovery snapshot is debounced (2.5s, capped at 10s) so checkpoint capture
  // and worker serialization never run on the mutation path. A hard process loss inside
  // that window would otherwise recover the previous revision. The recovery journal
  // closes the gap: it persists the canonical per-tab payload/layout/uiState of the live
  // workspace with a short trailing coalesce and is folded into the next rich snapshot.
  // It deliberately excludes previews and render caches, which stay on the rich path.
  const RECOVERY_JOURNAL_KEY = 'active-recovery-journal';
  const RECOVERY_JOURNAL_DELAY_MS = 400;

  let state = null;
  let recoveryTimer = null;
  let recoveryInterval = null;
  let autosaveInterval = null;
  let webDbPromise = null;
  let recoveryWriteSequence = 0;
  let journalTimer = null;
  let journalPending = false;
  let documentStateChangeHandler = null;
  let rotationGestureHandler = null;
  let journalFlushHandler = null;
  let recoveryTimerRevision = 0;
  let recoveryPendingSince = 0;
  let recoveryInFlightRevision = 0;
  let lastRecoverySavedRevision = 0;
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
      const request = window.indexedDB.open(WEB_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WEB_DB_STORE)) {
          db.createObjectStore(WEB_DB_STORE);
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

  async function putWebJournal(record) {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_DB_STORE, 'readwrite');
      tx.objectStore(WEB_DB_STORE).put(record, RECOVERY_JOURNAL_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB journal write failed.'));
    });
  }

  async function getWebJournal() {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_DB_STORE, 'readonly');
      const request = tx.objectStore(WEB_DB_STORE).get(RECOVERY_JOURNAL_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('IndexedDB journal read failed.'));
    });
  }

  async function clearWebJournal() {
    const db = await openWebDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WEB_DB_STORE, 'readwrite');
      tx.objectStore(WEB_DB_STORE).delete(RECOVERY_JOURNAL_KEY);
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
        fileName: workspaceState.sessionFileName || '',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || null,
        // The session revision this snapshot reflects. Restore compares it against the
        // recovery journal so a crash inside the debounce window can fold the newest
        // canonical payloads over an older rich snapshot instead of recovering the
        // previous revision.
        revision: getSessionRevision()
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
        void trimRecoveryJournalToRevision(revision);
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
      void trimRecoveryJournalToRevision(revision);
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
    // The snapshot is the recovery tier; clearing it supersedes any journal entries
    // that only existed to close the debounce gap.
    await clearRecoveryJournal(reason);
  }

  async function readRecoverySnapshot() {
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

  function buildJournalRecord(reason) {
    const tabs = Array.isArray(state?.workspaceState?.tabs) ? state.workspaceState.tabs : [];
    const entries = [];
    tabs.forEach(tab => {
      if (!tab || tab.isWelcome || !tab.type) {
        return;
      }
      if (!tab.payload) {
        return;
      }
      entries.push({
        tabId: tab.id,
        title: tab.title || '',
        type: tab.type,
        payload: tab.payload,
        layout: tab.layout || null,
        uiState: tab.uiState || null
      });
    });
    if (!entries.length) {
      return null;
    }
    const workspaceState = state.workspaceState || {};
    return {
      app: 'Graphitix',
      kind: 'recovery-journal',
      version: 1,
      revision: getSessionRevision(),
      at: Date.now(),
      updatedAt: Date.now(),
      activeTabId: workspaceState.activeTabId || null,
      fileName: workspaceState.sessionFileName || '',
      filePath: workspaceState.sessionFilePath || '',
      fileScope: workspaceState.sessionFileScope || null,
      reason: reason || 'journal',
      tabs: entries
    };
  }

  async function writeRecoveryJournal(reason = 'journal') {
    if (!state || state.restoringRecovery) {
      return { status: 'skipped', reason: 'restore-in-progress' };
    }
    if (!state.workspaceState?.sessionUserDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const record = buildJournalRecord(reason);
    if (!record) {
      return { status: 'skipped', reason: 'no-payloads' };
    }
    try {
      if (isDesktop() && typeof window.desktop.writeRecoveryJournal === 'function') {
        await window.desktop.writeRecoveryJournal(record);
      } else {
        await putWebJournal(record);
      }
      debug('recovery.journal.write', {
        reason,
        revision: record.revision,
        tabCount: record.tabs.length
      });
      return { status: 'saved', revision: record.revision, tabCount: record.tabs.length };
    } catch (err) {
      debug('recovery.journal.writeFailed', { reason, message: err?.message || String(err) });
      return { status: 'error', error: err };
    }
  }

  async function readRecoveryJournal() {
    try {
      if (isDesktop() && typeof window.desktop.readRecoveryJournal === 'function') {
        const result = await window.desktop.readRecoveryJournal();
        if (!result?.exists || !result?.record) {
          return null;
        }
        return result.record;
      }
      const record = await getWebJournal();
      if (!record || !Array.isArray(record.tabs)) {
        return null;
      }
      return record;
    } catch (err) {
      debug('recovery.journal.readFailed', { message: err?.message || String(err) });
      return null;
    }
  }

  async function clearRecoveryJournal(reason = 'clear') {
    try {
      if (isDesktop() && typeof window.desktop.clearRecoveryJournal === 'function') {
        await window.desktop.clearRecoveryJournal(reason);
      } else {
        await clearWebJournal();
      }
      debug('recovery.journal.clear', { reason });
    } catch (err) {
      debug('recovery.journal.clearFailed', { reason, message: err?.message || String(err) });
    }
  }

  // The rich snapshot becomes the checkpoint for `revision`. Any journal entry at or
  // below it is redundant and can be dropped; a newer journal entry (a mutation that
  // raced the rich write) must survive so restore can still fold it in.
  async function trimRecoveryJournalToRevision(revision) {
    try {
      const journal = await readRecoveryJournal();
      if (journal && Number(journal.revision || 0) <= Number(revision || 0)) {
        await clearRecoveryJournal(`rich-snapshot-${revision}`);
      }
    } catch (err) {
      debug('recovery.journal.trimFailed', { revision, message: err?.message || String(err) });
    }
  }

  function getPersistentTabId(tabLike) {
    return String(tabLike?.archiveRuntimeTabId || tabLike?.runtimeTabId || tabLike?.id || '').trim();
  }

  function mergeJournalIntoParsedSession(parsed, journal) {
    if (!parsed?.session || !Array.isArray(parsed.session.tabs) || !Array.isArray(journal?.tabs)) {
      return null;
    }
    const entries = journal.tabs.filter(entry => entry && entry.tabId && entry.payload);
    if (!entries.length) {
      return null;
    }
    const entryById = new Map(entries.map(entry => [String(entry.tabId), entry]));
    const tabs = parsed.session.tabs.map(tab => {
      const entry = entryById.get(getPersistentTabId(tab));
      if (!entry) {
        return tab;
      }
      return {
        ...tab,
        payload: entry.payload,
        layout: entry.layout || null,
        uiState: entry.uiState || null,
        // Render caches and previews were captured for the snapshot payload; they are
        // stale for the newer journal payload and must not be replayed over it.
        archiveRenderCache: null,
        archiveRenderCacheSignature: null,
        archiveRenderCacheLayoutSignature: null,
        previewMarkup: null,
        previewSignature: null,
        previewMeta: null
      };
    });
    const presentIds = new Set(tabs.map(tab => getPersistentTabId(tab)));
    entries.forEach(entry => {
      const entryId = String(entry.tabId);
      if (presentIds.has(entryId)) {
        return;
      }
      tabs.push({
        title: entry.title || 'Workspace',
        type: entry.type || entry.payload?.type || null,
        archiveRuntimeTabId: entryId,
        payload: entry.payload,
        layout: entry.layout || null,
        uiState: entry.uiState || null,
        archiveRenderCache: null,
        archiveRenderCacheSignature: null,
        archiveRenderCacheLayoutSignature: null,
        previewMarkup: null,
        previewSignature: null,
        previewMeta: null
      });
      presentIds.add(entryId);
    });
    let activeIndex = parsed.session.activeIndex;
    const journalActiveId = journal.activeTabId ? String(journal.activeTabId) : null;
    if (journalActiveId) {
      const idx = tabs.findIndex(tab => getPersistentTabId(tab) === journalActiveId);
      if (idx >= 0) {
        activeIndex = idx;
      }
    }
    if (!Number.isFinite(activeIndex) || activeIndex < 0 || activeIndex >= tabs.length) {
      activeIndex = 0;
    }
    return {
      ...parsed,
      session: {
        ...parsed.session,
        tabs,
        activeIndex
      }
    };
  }

  function buildJournalOnlyParsedSession(journal) {
    const entries = Array.isArray(journal?.tabs) ? journal.tabs.filter(entry => entry && entry.tabId && entry.payload) : [];
    if (!entries.length) {
      return null;
    }
    const tabs = entries.map(entry => ({
      title: entry.title || 'Workspace',
      type: entry.type || entry.payload?.type || null,
      archiveRuntimeTabId: String(entry.tabId),
      payload: entry.payload,
      layout: entry.layout || null,
      uiState: entry.uiState || null
    }));
    let activeIndex = 0;
    const activeId = journal.activeTabId ? String(journal.activeTabId) : null;
    if (activeId) {
      const idx = tabs.findIndex(tab => getPersistentTabId(tab) === activeId);
      if (idx >= 0) {
        activeIndex = idx;
      }
    }
    return {
      source: 'recovery-journal',
      session: {
        tabs,
        activeIndex,
        scope: journal.fileScope || 'workspace'
      }
    };
  }

  function journalHasRecoverableData(journal) {
    const entries = Array.isArray(journal?.tabs) ? journal.tabs : [];
    if (!entries.length) {
      return false;
    }
    if (typeof state?.session?.tabHasTableData !== 'function') {
      return true;
    }
    return entries.some(entry => state.session.tabHasTableData({
      id: 'recovery-journal-preview',
      type: entry?.type || entry?.payload?.type || null,
      payload: entry?.payload || null,
      isWelcome: false
    }));
  }

  function finalizeRecoveryRestore(fileName, filePath, fileScope, recoveredAt) {
    state.workspaceState.sessionFileHandle = null;
    state.workspaceState.sessionFilePath = filePath || '';
    state.workspaceState.sessionFileName = fileName || 'recovered.graph';
    state.workspaceState.sessionFileScope = fileScope || 'workspace';
    state.session.markSessionDirty('recovery-restored', {
      fileName: state.workspaceState.sessionFileName,
      recoveredAt: recoveredAt || null,
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
  }

  async function applyRecoveryParsedSession(parsed, meta = {}) {
    const result = await state.sessionActions.applyArchiveBlob(state.getSessionActionsContext(), meta.blob || null, {
      reason: 'recovery-restore',
      fileName: meta.fileName || '',
      ...(parsed ? { parsedSession: parsed } : {})
    });
    finalizeRecoveryRestore(meta.fileName, meta.filePath, meta.fileScope, meta.recoveredAt);
    await clearRecoveryJournal('recovery-restored');
    return result;
  }

  async function maybeRestoreRecovery() {
    const record = await readRecoverySnapshot();
    if (!record?.blob || !record?.meta?.dirty) {
      // No rich snapshot. The recovery journal may still hold the newest canonical
      // workspace state when the process died inside the first debounce window;
      // restoring the journal alone is strictly better than silently losing the edits.
      const journal = await readRecoveryJournal();
      if (!journal || !journalHasRecoverableData(journal)) {
        return false;
      }
      const parsed = buildJournalOnlyParsedSession(journal);
      if (!parsed) {
        return false;
      }
      const fileName = journal.fileName || 'recovered.graph';
      const savedAt = journal.at ? new Date(journal.at).toLocaleString() : 'a previous session';
      const shouldRestore = typeof window.confirm === 'function'
        ? window.confirm(`Graphitix found recovered changes for ${fileName} from ${savedAt}. Restore them now?`)
        : true;
      if (!shouldRestore) {
        await clearRecoveryJournal('user-discarded-recovery');
        return false;
      }
      state.restoringRecovery = true;
      try {
        await applyRecoveryParsedSession(parsed, {
          fileName,
          filePath: journal.filePath || '',
          fileScope: journal.fileScope || 'workspace',
          recoveredAt: journal.at || null
        });
      } finally {
        state.restoringRecovery = false;
      }
      syncTitle({ reason: 'recovery-restored' });
      return true;
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
      let parsedSession = null;
      const journal = await readRecoveryJournal();
      if (journal && Number(journal.revision || 0) > Number(record.meta.revision || 0)) {
        parsedSession = await buildJournalMergedParsedSession(record, journal);
        if (parsedSession) {
          debug('recovery.restore.journalOverlay', {
            snapshotRevision: Number(record.meta.revision || 0),
            journalRevision: Number(journal.revision || 0),
            tabCount: parsedSession.session.tabs.length
          });
        }
      }
      await applyRecoveryParsedSession(parsedSession, {
        blob: record.blob,
        fileName: record.meta.fileName || '',
        filePath: record.meta.filePath || '',
        fileScope: record.meta.fileScope || 'workspace',
        recoveredAt: record.meta.savedAt || null
      });
    } finally {
      state.restoringRecovery = false;
    }
    syncTitle({ reason: 'recovery-restored' });
    return true;
  }

  async function buildJournalMergedParsedSession(record, journal) {
    const graphArchive = window.Shared?.graphArchive || null;
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      return null;
    }
    try {
      const parsed = await graphArchive.parseFile(record.blob, {
        fileName: record?.meta?.fileName || record.blob?.name || 'recovered.graph'
      });
      return mergeJournalIntoParsedSession(parsed, journal);
    } catch (err) {
      debug('recovery.journal.mergeFailed', { message: err?.message || String(err) });
      return null;
    }
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
    journalFlushHandler = () => {
      if (!journalPending) {
        return;
      }
      if (journalTimer) {
        window.clearTimeout(journalTimer);
      }
      journalTimer = null;
      journalPending = false;
      // Best-effort: the IndexedDB/IPC write may or may not complete before the page
      // tears down, but flushing on unload narrows the loss window further.
      void writeRecoveryJournal('pagehide');
    };
    window.addEventListener('pagehide', journalFlushHandler);
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

  // Called by the owning session on the mutation path once a tab's canonical payload
  // (or its user-modified layout) is committed. The write itself is cheap and coalesced;
  // previews and render caches never travel through this path.
  namespace.notifyTabPayloadJournaled = function notifyTabPayloadJournaled(tabId, meta = {}) {
    if (!state || state.restoringRecovery) {
      return;
    }
    if (!state.workspaceState?.sessionUserDirty) {
      return;
    }
    if (!tabId) {
      return;
    }
    journalPending = true;
    if (journalTimer) {
      window.clearTimeout(journalTimer);
    }
    journalTimer = window.setTimeout(() => {
      journalTimer = null;
      journalPending = false;
      void writeRecoveryJournal(meta.reason || 'journal-coalesce');
    }, RECOVERY_JOURNAL_DELAY_MS);
    debug('recovery.journal.scheduled', {
      tabId,
      revision: getSessionRevision(),
      delay: RECOVERY_JOURNAL_DELAY_MS
    });
  };

  namespace.writeRecoveryJournal = writeRecoveryJournal;
  namespace.readRecoveryJournal = readRecoveryJournal;
  namespace.clearRecoveryJournal = clearRecoveryJournal;
  namespace.setAutosaveEnabled = setAutosaveEnabled;
  namespace.writeRecoverySnapshot = writeRecoverySnapshot;
  namespace.getRecoveryPerformance = () => lastRecoveryPerformance ? { ...lastRecoveryPerformance } : null;
  namespace.clearRecoverySnapshot = clearRecoverySnapshot;
  namespace.maybeRestoreRecovery = maybeRestoreRecovery;
  namespace.runAutosave = runAutosave;
  namespace.syncTitle = syncTitle;
  namespace.dispose = function dispose() {
    clearRecoveryTimer();
    if (savedMessageTimer) window.clearTimeout(savedMessageTimer);
    if (recoveryInterval) window.clearInterval(recoveryInterval);
    if (autosaveInterval) window.clearInterval(autosaveInterval);
    if (journalTimer) window.clearTimeout(journalTimer);
    if (documentStateChangeHandler) window.removeEventListener('graphitix:document-state-change', documentStateChangeHandler);
    if (rotationGestureHandler) window.removeEventListener('graphitix:plot3d-rotation-gesture', rotationGestureHandler);
    if (journalFlushHandler) window.removeEventListener('pagehide', journalFlushHandler);
    recoveryPendingSince = 0;
    journalTimer = null;
    journalPending = false;
    journalFlushHandler = null;
    recoveryInterval = null;
    autosaveInterval = null;
    documentStateChangeHandler = null;
    rotationGestureHandler = null;
    state = null;
  };
})();
