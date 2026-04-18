(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.documentState = Main.documentState || {};
  const AUTOSAVE_PREF_KEY = 'graphitix.autosave.enabled';
  const WEB_DB_NAME = 'graphitix-document-state';
  const WEB_DB_STORE = 'snapshots';
  const RECOVERY_KEY = 'active-recovery';
  const RECOVERY_DELAY_MS = 1200;
  const RECOVERY_INTERVAL_MS = 10000;
  const AUTOSAVE_INTERVAL_MS = 30000;

  let state = null;
  let recoveryTimer = null;
  let recoveryInterval = null;
  let autosaveInterval = null;
  let webDbPromise = null;
  let recoveryWriteSequence = 0;

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

  function syncTitle(meta = {}) {
    if (!state) {
      return;
    }
    const workspaceState = state.workspaceState || {};
    const fileName = getDisplayName();
    const dirty = !!workspaceState.sessionDirty;
    const display = `${fileName}${dirty ? ' *' : ''}`;
    const titleEls = Array.from(document.querySelectorAll('[data-document-title="1"]'));
    const statusEls = Array.from(document.querySelectorAll('[data-document-status="1"]'));
    const autosaveEls = Array.from(document.querySelectorAll('input[data-document-autosave="1"]'));
    titleEls.forEach(titleEl => {
      titleEl.textContent = display;
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

  async function buildRecoveryRecord(reason) {
    if (!state?.sessionActions || typeof state.sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      return null;
    }
    const context = state.getSessionActionsContext();
    const blob = await state.sessionActions.buildWorkspaceArchiveBlob(context, {
      reason,
      scope: 'workspace',
      useWorker: true
    });
    if (!blob) {
      return null;
    }
    const workspaceState = state.workspaceState || {};
    return {
      blob,
      meta: {
        app: 'Graphitix',
        kind: 'recovery',
        version: 1,
        savedAt: new Date().toISOString(),
        updatedAt: Date.now(),
        reason,
        dirty: !!workspaceState.sessionDirty,
        fileName: workspaceState.sessionFileName || '',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || null
      }
    };
  }

  async function writeRecoverySnapshot(reason = 'recovery') {
    if (!state?.workspaceState?.sessionDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const sequence = ++recoveryWriteSequence;
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
        debug('recovery.write.desktop', { bytes: record.blob.size, reason });
        return { status: 'saved', via: 'desktop', bytes: record.blob.size };
      }
      await putWebSnapshot({
        meta: record.meta,
        blob: record.blob
      });
      debug('recovery.write.web', { bytes: record.blob.size, reason });
      return { status: 'saved', via: 'web', bytes: record.blob.size };
    } catch (err) {
      console.error('documentState recovery snapshot error', err);
      return { status: 'error', error: err };
    }
  }

  function scheduleRecoverySnapshot(reason = 'document-change') {
    if (recoveryTimer) {
      window.clearTimeout(recoveryTimer);
    }
    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = null;
      void writeRecoverySnapshot(reason);
    }, RECOVERY_DELAY_MS);
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
        recoveredAt: record.meta.savedAt || null
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
    if (!state.workspaceState?.sessionDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const result = await state.sessionActions.autosaveWorkspace(state.getSessionActionsContext(), { reason });
    if (result?.status === 'saved' || result?.status === 'downloaded') {
      await clearRecoverySnapshot('autosave-success');
    } else {
      await writeRecoverySnapshot(`${reason}-private-snapshot`);
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
      const toggle = event.target?.closest?.('input[data-document-autosave="1"]');
      if (!toggle) {
        return;
      }
      setAutosaveEnabled(toggle.checked, { reason: 'autosave-toggle-ui' });
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
    window.addEventListener('graphitix:document-state-change', event => {
      const type = event?.detail?.type || 'change';
      syncTitle({ reason: type });
      if (state.workspaceState?.sessionDirty) {
        scheduleRecoverySnapshot(type);
      } else if ((type === 'saved' || type === 'clean') && !state.restoringRecovery) {
        void clearRecoverySnapshot(type);
      }
    });
    recoveryInterval = window.setInterval(() => {
      if (state.workspaceState?.sessionDirty) {
        void writeRecoverySnapshot('recovery-interval');
      }
    }, RECOVERY_INTERVAL_MS);
    autosaveInterval = window.setInterval(() => {
      void runAutosave('autosave-interval');
    }, AUTOSAVE_INTERVAL_MS);
    syncTitle({ reason: 'init' });
    debug('init', { autosaveEnabled: state.autosaveEnabled, isDesktop: isDesktop() });
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
    if (recoveryInterval) window.clearInterval(recoveryInterval);
    if (autosaveInterval) window.clearInterval(autosaveInterval);
    recoveryTimer = null;
    recoveryInterval = null;
    autosaveInterval = null;
    state = null;
  };
})();
