(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.documentState = Main.documentState || {};
  const AUTOSAVE_PREF_KEY = 'graphitix.autosave.enabled';
  const WEB_DB_NAME = 'graphitix-document-state';
  const WEB_DB_STORE = 'snapshots';
  const RECOVERY_KEY = 'active-recovery';
  const RECOVERY_DELAY_MS = 700;
  // Hard cap on how long a recovery snapshot can be deferred once the session has unsaved
  // changes. The per-change debounce (RECOVERY_DELAY_MS / getRecoveryDelayMs) restarts on
  // every change, so a burst of internal "dirty" events right after a data import (redraws,
  // stats settling, resize) would otherwise keep sliding the timer for several seconds — long
  // enough that closing the window in the first couple of seconds loses recovery entirely.
  // This bounds the wait from the FIRST pending change so a snapshot is always written within
  // ~1s of data appearing, regardless of churn.
  const RECOVERY_MAX_WAIT_MS = 1000;
  const RECOVERY_INTERVAL_MS = 10000;
  const AUTOSAVE_INTERVAL_MS = 30000;

  let state = null;
  let recoveryTimer = null;
  let recoveryInterval = null;
  let autosaveInterval = null;
  let webDbPromise = null;
  let recoveryWriteSequence = 0;
  let documentStateChangeHandler = null;
  let recoveryTimerRevision = 0;
  let recoveryPendingSince = 0;
  let recoveryInFlightRevision = 0;
  let lastRecoverySavedRevision = 0;
  let autosaveInFlightRevision = 0;
  let lastAutosaveNoTargetRevision = 0;
  let savedMessageTimer = null;
  let savedTitleMessage = '';
  let userActivityListenersBound = false;
  let userActivityHandler = null;

  function getSessionRevision() {
    return Number(state?.workspaceState?.sessionRevision) || 0;
  }

  function estimateSnapshotSignatureSize() {
    const tabs = Array.isArray(state?.workspaceState?.tabs) ? state.workspaceState.tabs : [];
    let total = 0;
    tabs.forEach(tab => {
      if (!tab || tab.isWelcome) {
        return;
      }
      total += String(tab.payloadSignature || '').length;
      total += String(tab.layoutSignature || '').length;
    });
    return total;
  }

  function getRecoveryDelayMs() {
    const signatureSize = estimateSnapshotSignatureSize();
    if (signatureSize > 1000000) {
      return Math.max(RECOVERY_DELAY_MS, 8000);
    }
    if (signatureSize > 250000) {
      return Math.max(RECOVERY_DELAY_MS, 5000);
    }
    return RECOVERY_DELAY_MS;
  }

  function isRecoverySnapshotCurrent() {
    const revision = getSessionRevision();
    return revision > 0 && lastRecoverySavedRevision >= revision;
  }

  function hasRecoverySnapshotDue() {
    const revision = getSessionRevision();
    const inFlight = revision > 0
      ? recoveryInFlightRevision === revision
      : recoveryInFlightRevision < 0;
    return !!state?.workspaceState?.sessionUserDirty
      && !isRecoverySnapshotCurrent()
      && !inFlight;
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

  function markUserActivity(source = 'unknown') {
    if (!state) {
      return;
    }
    state.lastUserActivityAt = Date.now();
    debug('activity.marked', {
      source,
      at: state.lastUserActivityAt
    });
  }

  function getIdleDurationMs() {
    const lastActivityAt = Number(state?.lastUserActivityAt || 0);
    if (!lastActivityAt) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Math.max(0, Date.now() - lastActivityAt);
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

  async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
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

  async function buildRecoveryRecord(reason) {
    if (!state?.sessionActions || typeof state.sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      return null;
    }
    if (!currentWorkspaceHasRecoverableData()) {
      return null;
    }
    const context = state.getSessionActionsContext();
    const idleForMs = getIdleDurationMs();
    const blob = await state.sessionActions.buildWorkspaceArchiveBlob(context, {
      reason,
      scope: 'workspace',
      useWorker: true,
      snapshotKind: 'lifecycle-checkpoint',
      policyMode: 'recovery',
      idleForMs
    });
    if (!blob) {
      return null;
    }
    const workspaceState = state.workspaceState || {};
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    const hasData = currentWorkspaceHasRecoverableData();
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
        hasData,
        tabCount: graphTabs.length,
        idleForMs,
        fileName: workspaceState.sessionFileName || '',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || null
      }
    };
  }

  // Flush the active tab's live edits into its persisted payload before the recovery
  // path inspects recoverable data. The active tab's payload is otherwise only flushed
  // on tab deactivation (switch) or save, so a single never-deactivated tab would report
  // no recoverable data and the snapshot would be skipped/cleared.
  //
  // We FORCE a live payload capture (captureLivePayload) rather than the default
  // lifecycle-checkpoint "skip if clean" behavior. A clean tab.payload is NOT proof the
  // stored payload matches the live component: bulk hot.loadData() (CSV/import) is treated
  // as a programmatic non-user load (see Shared.hot afterLoadData), so it populates the hot
  // WITHOUT syncing tab.payload or marking the tab dirty. The stored payload then stays as
  // the empty-default template while the component holds real data. A recovery snapshot must
  // capture authoritative live state (getPayload), exactly like a save does, so it reflects
  // what the user actually sees regardless of how the data was entered.
  function flushActiveTabForRecovery(reason) {
    const sessionActions = state?.sessionActions;
    if (!sessionActions || typeof sessionActions.persistActiveTabIfNeeded !== 'function') {
      return;
    }
    if (typeof state.getSessionActionsContext !== 'function') {
      return;
    }
    try {
      sessionActions.persistActiveTabIfNeeded(state.getSessionActionsContext(), {
        reason: reason || 'recovery-flush',
        captureRenderCache: false,
        snapshotIntent: {
          saveLike: false,
          lifecycleSnapshot: true,
          captureLivePayload: true,
          allowSkipLivePayloadCapture: false,
          reasonSkippable: false,
          snapshotCapture: true
        }
      });
    } catch (err) {
      debug('recovery.flushActiveTabFailed', { reason, message: err?.message || String(err) });
    }
  }

  async function writeRecoverySnapshot(reason = 'recovery') {
    if (!state?.workspaceState?.sessionUserDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const revision = getSessionRevision();
    if (revision > 0 && lastRecoverySavedRevision >= revision) {
      debug('recovery.write.skippedCurrent', { reason, revision });
      return { status: 'skipped', reason: 'current', revision };
    }
    const inFlightToken = revision > 0 ? revision : -1;
    if (recoveryInFlightRevision === inFlightToken) {
      debug('recovery.write.skippedInFlight', { reason, revision });
      return { status: 'skipped', reason: 'in-flight', revision };
    }
    flushActiveTabForRecovery(reason);
    if (!currentWorkspaceHasRecoverableData()) {
      await clearRecoverySnapshot('no-recoverable-data');
      lastRecoverySavedRevision = revision;
      return { status: 'skipped', reason: 'no-recoverable-data' };
    }
    const sequence = ++recoveryWriteSequence;
    recoveryInFlightRevision = inFlightToken;
    const recoveryJob = window.Shared?.jobs?.start?.({
      kind: 'recovery',
      component: 'document',
      label: 'Saving recovery snapshot...',
      message: 'Saving recovery snapshot...',
      reason,
      cancellable: false
    }) || null;
    try {
      const record = await buildRecoveryRecord(reason);
      if (!record) {
        return { status: 'skipped', reason: 'empty' };
      }
      if (sequence !== recoveryWriteSequence) {
        debug('recovery.write.superseded', { reason, sequence, latest: recoveryWriteSequence });
        return { status: 'skipped', reason: 'superseded' };
      }
      if (isDesktop() && typeof window.desktop.writeRecoverySnapshot === 'function') {
        await window.desktop.writeRecoverySnapshot({
          meta: record.meta,
          dataBase64: await blobToBase64(record.blob)
        });
        lastRecoverySavedRevision = revision;
        debug('recovery.write.desktop', { bytes: record.blob.size, reason });
        return { status: 'saved', via: 'desktop', bytes: record.blob.size };
      }
      await putWebSnapshot({
        meta: record.meta,
        blob: record.blob
      });
      lastRecoverySavedRevision = revision;
      debug('recovery.write.web', { bytes: record.blob.size, reason });
      return { status: 'saved', via: 'web', bytes: record.blob.size };
    } catch (err) {
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
    }
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
    recoveryTimerRevision = getSessionRevision();
    if (recoveryTimer) {
      window.clearTimeout(recoveryTimer);
    }
    const now = Date.now();
    if (!recoveryPendingSince) {
      recoveryPendingSince = now;
    }
    // Bound the debounce: never defer past RECOVERY_MAX_WAIT_MS from the first pending change.
    const remainingMaxWait = Math.max(0, RECOVERY_MAX_WAIT_MS - (now - recoveryPendingSince));
    const delay = Math.min(getRecoveryDelayMs(), remainingMaxWait);
    recoveryTimer = window.setTimeout(() => {
      const scheduledRevision = recoveryTimerRevision;
      recoveryTimer = null;
      recoveryTimerRevision = 0;
      recoveryPendingSince = 0;
      if (scheduledRevision > 0 && lastRecoverySavedRevision >= scheduledRevision) {
        debug('recovery.timer.skippedCurrent', { reason, scheduledRevision, lastRecoverySavedRevision });
        return;
      }
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
    } finally {
      state.restoringRecovery = false;
    }
    syncTitle({ reason: 'recovery-restored' });
    scheduleRecoverySnapshot('recovery-restored');
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

    if (!userActivityListenersBound) {
      userActivityHandler = event => {
        if (!event || event.isTrusted === false) {
          return;
        }
        markUserActivity(event.type || 'activity');
      };
      ['pointerdown', 'keydown', 'input', 'wheel', 'mousedown', 'touchstart'].forEach(eventName => {
        document.addEventListener(eventName, userActivityHandler, true);
      });
      userActivityListenersBound = true;
    }
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
      restoringRecovery: false,
      lastUserActivityAt: Date.now()
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
        lastRecoverySavedRevision = getSessionRevision();
        lastAutosaveNoTargetRevision = 0;
        recoveryPendingSince = 0;
        void clearRecoverySnapshot(type);
      }
    };
    window.addEventListener('graphitix:document-state-change', documentStateChangeHandler);
    recoveryInterval = window.setInterval(() => {
      if (hasRecoverySnapshotDue()) {
        void writeRecoverySnapshot('recovery-interval');
      }
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
  namespace.clearRecoverySnapshot = clearRecoverySnapshot;
  namespace.maybeRestoreRecovery = maybeRestoreRecovery;
  namespace.runAutosave = runAutosave;
  namespace.syncTitle = syncTitle;
  namespace.dispose = function dispose() {
    if (recoveryTimer) window.clearTimeout(recoveryTimer);
    if (savedMessageTimer) window.clearTimeout(savedMessageTimer);
    if (recoveryInterval) window.clearInterval(recoveryInterval);
    if (autosaveInterval) window.clearInterval(autosaveInterval);
    if (documentStateChangeHandler) window.removeEventListener('graphitix:document-state-change', documentStateChangeHandler);
    if (userActivityListenersBound && userActivityHandler) {
      ['pointerdown', 'keydown', 'input', 'wheel', 'mousedown', 'touchstart'].forEach(eventName => {
        document.removeEventListener(eventName, userActivityHandler, true);
      });
    }
    recoveryTimer = null;
    recoveryTimerRevision = 0;
    recoveryPendingSince = 0;
    recoveryInterval = null;
    autosaveInterval = null;
    documentStateChangeHandler = null;
    userActivityHandler = null;
    userActivityListenersBound = false;
    state = null;
  };
})();
