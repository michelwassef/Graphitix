describe('documentState canonical journal tab coalescing', () => {
  let stores;
  let pendingTransactions;
  let originalIndexedDb;

  function createControlledIndexedDb() {
    stores = new Map();
    pendingTransactions = [];
    const database = {
      objectStoreNames: {
        contains: name => stores.has(name)
      },
      createObjectStore(name) {
        stores.set(name, new Map());
        return {};
      },
      transaction(storeName) {
        const operations = [];
        let completeHandler = null;
        let errorHandler = null;
        const transaction = {
          error: null,
          objectStore() {
            return {
              put(value, key) {
                operations.push({ value, key });
              },
              delete(key) {
                operations.push({ deleteKey:key });
              },
              clear() {
                operations.push({ clear:true });
              }
            };
          },
          set oncomplete(handler) {
            completeHandler = handler;
            pendingTransactions.push({
              storeName,
              operationKinds:operations.map(operation => operation.clear ? 'clear'
                : Object.prototype.hasOwnProperty.call(operation, 'deleteKey') ? 'delete'
                : 'put'),
              complete() {
                const store = stores.get(storeName);
                operations.forEach(operation => {
                  if(operation.clear){
                    store.clear();
                  }else if(Object.prototype.hasOwnProperty.call(operation, 'deleteKey')){
                    store.delete(operation.deleteKey);
                  }else{
                    store.set(operation.key, operation.value);
                  }
                });
                completeHandler?.();
              },
              fail(error = new Error('Injected IndexedDB transaction failure.')) {
                transaction.error = error;
                errorHandler?.();
              }
            });
          },
          set onerror(handler) {
            errorHandler = handler;
          }
        };
        return transaction;
      }
    };
    return {
      open: jest.fn(() => {
        const request = { result: database };
        queueMicrotask(() => {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      })
    };
  }

  async function flushMicrotasks() {
    for (let pass = 0; pass < 12; pass += 1) {
      await Promise.resolve();
    }
  }

  async function waitForTransactionCount(count) {
    for (let pass = 0; pass < 30 && pendingTransactions.length < count; pass += 1) {
      await flushMicrotasks();
    }
    expect(pendingTransactions.length).toBeGreaterThanOrEqual(count);
  }

  beforeEach(() => {
    jest.resetModules();
    originalIndexedDb = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    Object.defineProperty(window, 'indexedDB', {
      value: createControlledIndexedDb(),
      configurable: true
    });
    window.localStorage.clear();
    window.Main = {};
    window.Shared = { isDebugEnabled: () => false };
    require('../../js/main/snapshotPolicy.js');
    require('../../js/main/documentState.js');
  });

  afterEach(() => {
    window.Main?.documentState?.dispose?.();
    delete window.Main;
    delete window.Shared;
    if (originalIndexedDb) {
      Object.defineProperty(window, 'indexedDB', originalIndexedDb);
    } else {
      delete window.indexedDB;
    }
  });

  test('keeps every changed tab when journal requests queue behind an active write', async () => {
    const tabIds = ['tab-a', 'tab-b', 'tab-c'];
    const workspaceState = {
      tabs: tabIds.map(id => ({
        id,
        type: 'box',
        isWelcome: false,
        title: id,
        payload: { type: 'box', marker: `old-${id}` },
        layoutState: {},
        uiState: {}
      })),
      activeTabId: 'tab-a',
      sessionUserDirty: true,
      sessionDirty: true,
      sessionRevision: 1,
      sessionFileName: 'journal-test.graph',
      sessionFileScope: 'tab',
      sessionFileTabId: 'tab-a'
    };
    const session = { flushCanonicalUserMutationState: jest.fn().mockResolvedValue(true) };
    window.Main.documentState.init({
      session,
      sessionActions: {},
      workspaceState,
      getSessionActionsContext: () => ({ session, workspaceState }),
      dom: {}
    });

    const schedule = tabId => window.Main.documentState.scheduleCanonicalJournal(
      { tabId },
      { skipSessionFlush: true }
    );

    // Establish a complete baseline journal so later writes are partial by tab.
    schedule('tab-a');
    await waitForTransactionCount(1);
    pendingTransactions.shift().complete();
    await flushMicrotasks();

    workspaceState.tabs.forEach(tab => {
      tab.payload.marker = `new-${tab.id}`;
    });

    // Hold the first partial write open while two other owners queue changes.
    schedule('tab-a');
    await waitForTransactionCount(1);
    schedule('tab-b');
    schedule('tab-c');
    pendingTransactions.shift().complete();
    await waitForTransactionCount(1);
    pendingTransactions.shift().complete();
    await flushMicrotasks();

    const journal = stores.get('canonical-journal');
    expect(journal.get('meta')).toEqual(expect.objectContaining({
      fileScope: 'tab',
      fileTargetTabId: 'tab-a'
    }));
    const recoveredMarkers = Object.fromEntries(tabIds.map(id => [
      id,
      journal.get(`tab:${id}`)?.payload?.marker || null
    ]));
    expect(recoveredMarkers).toEqual({
      'tab-a': 'new-tab-a',
      'tab-b': 'new-tab-b',
      'tab-c': 'new-tab-c'
    });
  });

  test('an older recovery clear cannot erase a newer canonical journal revision', async () => {
    const workspaceState = {
      tabs:[{
        id:'tab-a',
        type:'box',
        isWelcome:false,
        title:'A',
        payload:{ type:'box', marker:'revision-1' },
        layoutState:{},
        uiState:{}
      }],
      activeTabId:'tab-a',
      sessionUserDirty:false,
      sessionDirty:false,
      sessionRevision:1,
      sessionFileName:'journal-clear-race.graph',
      sessionFileScope:'workspace'
    };
    const session = { flushCanonicalUserMutationState:jest.fn().mockResolvedValue(true) };
    window.Main.documentState.init({
      session,
      sessionActions:{},
      workspaceState,
      getSessionActionsContext:() => ({ session, workspaceState }),
      dom:{}
    });

    const clearPromise = window.Main.documentState.clearRecoverySnapshot('old-clean-revision', 1);
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('snapshots');

    workspaceState.sessionRevision = 2;
    workspaceState.sessionUserDirty = true;
    workspaceState.sessionDirty = true;
    workspaceState.tabs[0].payload.marker = 'revision-2';
    window.Main.documentState.scheduleCanonicalJournal({ tabId:'tab-a' }, { skipSessionFlush:true });
    await flushMicrotasks();
    expect(pendingTransactions.map(transaction => transaction.storeName)).toEqual(['snapshots']);

    const recoveryClear = pendingTransactions.find(transaction => transaction.storeName === 'snapshots');
    expect(recoveryClear).toBeTruthy();
    pendingTransactions.splice(pendingTransactions.indexOf(recoveryClear), 1)[0].complete();
    await waitForTransactionCount(1);
    const journalWrite = pendingTransactions.find(transaction => transaction.storeName === 'canonical-journal');
    expect(journalWrite?.operationKinds).toEqual(['put', 'put']);
    pendingTransactions.splice(pendingTransactions.indexOf(journalWrite), 1)[0].complete();
    await clearPromise;
    await flushMicrotasks();

    expect(stores.get('canonical-journal').get('meta')?.revision).toBe(2);
    expect(stores.get('canonical-journal').get('tab:tab-a')?.payload?.marker).toBe('revision-2');
  });

  test('a failed desktop snapshot clear still clears the independent IndexedDB journal and reports failure', async () => {
    const workspaceState = {
      tabs:[{
        id:'tab-a', type:'box', isWelcome:false, title:'A',
        payload:{ type:'box', marker:'revision-1' }, layoutState:{}, uiState:{}
      }],
      activeTabId:'tab-a', sessionUserDirty:true, sessionDirty:true, sessionRevision:1,
      sessionFileName:'journal-clear-desktop.graph', sessionFileScope:'workspace'
    };
    const session = { flushCanonicalUserMutationState:jest.fn().mockResolvedValue(true) };
    window.Main.documentState.init({
      session,
      sessionActions:{},
      workspaceState,
      getSessionActionsContext:() => ({ session, workspaceState }),
      dom:{}
    });
    window.Main.documentState.scheduleCanonicalJournal({ tabId:'tab-a' }, { skipSessionFlush:true });
    await waitForTransactionCount(1);
    pendingTransactions.shift().complete();
    await flushMicrotasks();
    expect(stores.get('canonical-journal').size).toBeGreaterThan(0);

    window.desktop = {
      isDesktop:true,
      clearRecoverySnapshot:jest.fn().mockRejectedValue(new Error('injected desktop delete failure'))
    };
    const clearPromise = window.Main.documentState.clearRecoverySnapshot('desktop-clear-failure', 1, { allowDirty:true });
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('canonical-journal');
    pendingTransactions.shift().complete();

    await expect(clearPromise).resolves.toBe(false);
    expect(window.desktop.clearRecoverySnapshot).toHaveBeenCalledTimes(1);
    expect(stores.get('canonical-journal').size).toBe(0);
    delete window.desktop;
  });

  test('a failed web snapshot transaction still clears its journal and can be retried at the same revision', async () => {
    const workspaceState = {
      tabs:[{
        id:'tab-a', type:'box', isWelcome:false, title:'A',
        payload:{ type:'box', marker:'revision-1' }, layoutState:{}, uiState:{}
      }],
      activeTabId:'tab-a', sessionUserDirty:true, sessionDirty:true, sessionRevision:1,
      sessionFileName:'journal-clear-web.graph', sessionFileScope:'workspace'
    };
    const session = { flushCanonicalUserMutationState:jest.fn().mockResolvedValue(true) };
    window.Main.documentState.init({
      session,
      sessionActions:{},
      workspaceState,
      getSessionActionsContext:() => ({ session, workspaceState }),
      dom:{}
    });
    window.Main.documentState.scheduleCanonicalJournal({ tabId:'tab-a' }, { skipSessionFlush:true });
    await waitForTransactionCount(1);
    pendingTransactions.shift().complete();
    await flushMicrotasks();
    stores.get('snapshots').set('active-recovery', { meta:{ revision:1 }, blob:{ size:1 } });

    const clearPromise = window.Main.documentState.clearRecoverySnapshot('web-clear-failure', 1, { allowDirty:true });
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('snapshots');
    pendingTransactions.shift().fail(new Error('injected web snapshot transaction failure'));
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('canonical-journal');
    pendingTransactions.shift().complete();

    await expect(clearPromise).resolves.toBe(false);
    expect(stores.get('snapshots').has('active-recovery')).toBe(true);
    expect(stores.get('canonical-journal').size).toBe(0);

    const retryPromise = window.Main.documentState.clearRecoverySnapshot('web-clear-retry', 1, { allowDirty:true });
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('snapshots');
    pendingTransactions.shift().complete();
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('canonical-journal');
    pendingTransactions.shift().complete();

    await expect(retryPromise).resolves.toBe(true);
    expect(stores.get('snapshots').has('active-recovery')).toBe(false);
    expect(stores.get('canonical-journal').size).toBe(0);
  });

  test('a failed IndexedDB journal clear reports failure after deleting the web snapshot', async () => {
    const workspaceState = {
      tabs:[{
        id:'tab-a', type:'box', isWelcome:false, title:'A',
        payload:{ type:'box', marker:'revision-1' }, layoutState:{}, uiState:{}
      }],
      activeTabId:'tab-a', sessionUserDirty:true, sessionDirty:true, sessionRevision:1,
      sessionFileName:'journal-clear-order.graph', sessionFileScope:'workspace'
    };
    const session = { flushCanonicalUserMutationState:jest.fn().mockResolvedValue(true) };
    window.Main.documentState.init({
      session,
      sessionActions:{},
      workspaceState,
      getSessionActionsContext:() => ({ session, workspaceState }),
      dom:{}
    });
    window.Main.documentState.scheduleCanonicalJournal({ tabId:'tab-a' }, { skipSessionFlush:true });
    await waitForTransactionCount(1);
    pendingTransactions.shift().complete();
    await flushMicrotasks();
    stores.get('snapshots').set('active-recovery', { meta:{ revision:1 }, blob:{ size:1 } });
    expect(stores.get('canonical-journal').size).toBeGreaterThan(0);

    const clearPromise = window.Main.documentState.clearRecoverySnapshot('journal-clear-failure', 1, { allowDirty:true });
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('snapshots');
    pendingTransactions.shift().complete();
    await waitForTransactionCount(1);
    expect(pendingTransactions[0].storeName).toBe('canonical-journal');
    pendingTransactions.shift().fail(new Error('injected journal transaction failure'));

    await expect(clearPromise).resolves.toBe(false);
    expect(stores.get('snapshots').has('active-recovery')).toBe(false);
    expect(stores.get('canonical-journal').size).toBeGreaterThan(0);
  });
});
