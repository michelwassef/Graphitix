'use strict';

async function clearRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('graphitix-document-state');
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) {
          request.result.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    try {
      const stores = ['snapshots'];
      if (db.objectStoreNames.contains('canonical-journal')) {
        stores.push('canonical-journal');
      }
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(stores, 'readwrite');
        if (db.objectStoreNames.contains('snapshots')) {
          transaction.objectStore('snapshots').delete('active-recovery');
        }
        if (db.objectStoreNames.contains('canonical-journal')) {
          transaction.objectStore('canonical-journal').clear();
        }
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Recovery state clear failed.'));
      });
    } finally {
      db.close();
      window.localStorage?.removeItem?.('graphitix.canonical-journal.v1');
    }
  });
}

async function seedRecoveryArchive(page, base64, options = {}) {
  const meta = {
    app: 'Graphitix',
    kind: 'recovery',
    version: 1,
    savedAt: new Date().toISOString(),
    updatedAt: Date.now(),
    reason: options.reason || 'e2e-recovery-driver',
    dirty: options.dirty !== false,
    hasData: options.hasData !== false,
    tabCount: Number(options.tabCount) || 1,
    ...(Number.isFinite(Number(options.revision)) ? { revision: Number(options.revision) } : {}),
    fileName: options.fileName || 'workspace.graph',
    filePath: options.filePath || '',
    fileScope: options.fileScope || 'workspace'
  };
  await page.evaluate(async ({ encoded, snapshotMeta }) => {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const request = window.indexedDB.open('graphitix-document-state');
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) {
          request.result.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('snapshots', 'readwrite');
        transaction.objectStore('snapshots').put({
          meta: snapshotMeta,
          blob: new Blob([bytes], { type: 'application/zip' })
        }, 'active-recovery');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Recovery snapshot write failed.'));
      });
    } finally {
      db.close();
    }
  }, { encoded: base64, snapshotMeta: meta });
  return meta;
}

async function reloadAndAcceptRecovery(page, options = {}) {
  let accepted = false;
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 20_000;
  const handler = async dialog => {
    if (dialog.type() === 'beforeunload') {
      await dialog.accept();
      return;
    }
    if (/recover/i.test(dialog.message())) {
      accepted = true;
      await dialog.accept();
      return;
    }
    await dialog.dismiss();
  };
  page.on('dialog', handler);
  try {
    const recoveryDialog = page.waitForEvent('dialog', {
      predicate: dialog => /recover|restore/i.test(dialog.message()),
      timeout
    }).catch(() => null);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await recoveryDialog;
    if (typeof options.afterReload === 'function') {
      await options.afterReload();
    }
  } finally {
    page.off('dialog', handler);
  }
  return accepted;
}

async function requestRecoveryCheckpoint(page, reason = 'e2e-recovery-checkpoint') {
  return page.evaluate(async checkpointReason => {
    const writer = window.Main?.documentState?.writeRecoverySnapshot;
    if (typeof writer !== 'function') {
      throw new Error('Recovery checkpoint writer unavailable');
    }
    return writer(checkpointReason);
  }, reason);
}

module.exports = {
  clearRecoverySnapshot,
  reloadAndAcceptRecovery,
  seedRecoveryArchive,
  requestRecoveryCheckpoint
};
