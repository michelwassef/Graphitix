(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const undoNamespace = Shared.undoManager = Shared.undoManager || {};
  if(undoNamespace.__installed){
    undoDebug('Debug: Shared.undoManager already installed');
    return;
  }
  undoNamespace.__installed = true;

  function undoDebug(message, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore toggle errors and log by default
    }
    if(arguments.length === 1){
      console.debug(message);
    }else{
      console.debug(message, payload);
    }
  }

  const STACK_LIMIT = 120;
  const GLOBAL_KEY = '__global__';
  const histories = new Map();
  let applying = false;
  const listeners = new Set();
  const handledKeyEvents = new WeakSet();
  const pendingTransactionSources = new Set();
  const transactionStack = [];
  const lastStates = new WeakMap();
  let lastFocusedElement = null;
  let transactionSequence = 0;

  const TEXT_INPUT_TYPES = new Set(['text','search','email','url','tel','password']);

  function normalizeTabId(value){
    const text = typeof value === 'string'
      ? value.trim()
      : String(value || '').trim();
    return text || '';
  }

  function resolveSession(){
    return global.Main?.session || null;
  }

  function resolveWorkspaceTabs(){
    return Shared.workspaceTabs || null;
  }

  function resolveActiveTab(){
    try{
      return resolveSession()?.getActiveTab?.() || null;
    }catch(err){
      console.error('Shared.undoManager resolveActiveTab error', err);
      return null;
    }
  }

  function resolveActiveTabId(){
    return normalizeTabId(resolveActiveTab()?.id || '');
  }

  function resolveTabFromValue(value){
    if(!value){
      return resolveActiveTab();
    }
    if(typeof value === 'object' && value.id != null){
      return value;
    }
    const tabId = normalizeTabId(value);
    if(!tabId){
      return resolveActiveTab();
    }
    try{
      const resolver = resolveWorkspaceTabs()?.resolveTab;
      if(typeof resolver === 'function'){
        return resolver(tabId) || null;
      }
      const tabs = resolveSession()?.workspaceState?.tabs;
      if(Array.isArray(tabs)){
        return tabs.find(tab => normalizeTabId(tab?.id) === tabId) || null;
      }
    }catch(err){
      console.error('Shared.undoManager resolveTabFromValue error', err);
    }
    return null;
  }

  function resolveElementTabId(el){
    let node = el && el.nodeType === 3 ? (el.parentElement || el.parentNode || null) : el;
    while(node && node !== global.document){
      const dataset = node.dataset || null;
      const tabId = normalizeTabId(
        dataset?.workspaceTabId
        || dataset?.tabId
        || node.getAttribute?.('data-workspace-tab-id')
        || node.getAttribute?.('data-tab-id')
        || ''
      );
      if(tabId){
        return tabId;
      }
      node = node.parentElement || node.parentNode || null;
    }
    return '';
  }

  function inferScope(el){
    if(!el) return null;
    if(typeof el.getAttribute === 'function'){
      const explicit = el.getAttribute('data-undo-scope');
      if(explicit) return explicit;
    }
    const panel = el.closest ? el.closest('.panel') : null;
    if(panel && panel.id) return panel.id;
    const svgBox = el.closest ? el.closest('.svgbox') : null;
    if(svgBox && svgBox.id) return svgBox.id;
    return null;
  }

  function resolveRequestedTabId(input, options = {}){
    if(typeof input === 'object' && input && !Array.isArray(input) && !('nodeType' in input) && !('id' in input)){
      const explicitTabId = normalizeTabId(input.tabId || input.workspaceTabId || input.historyTabId || '');
      if(explicitTabId){
        return explicitTabId;
      }
      if(input.target){
        const fromTarget = resolveElementTabId(input.target);
        if(fromTarget){
          return fromTarget;
        }
      }
      if(input.element){
        const fromElement = resolveElementTabId(input.element);
        if(fromElement){
          return fromElement;
        }
      }
      if(input.allowGlobal === true){
        return '';
      }
    }
    if(input && input.nodeType === 1){
      const fromElement = resolveElementTabId(input);
      if(fromElement){
        return fromElement;
      }
    }
    if(input && typeof input === 'object' && input.id != null){
      return normalizeTabId(input.id);
    }
    const directTabId = normalizeTabId(input || '');
    if(directTabId){
      return directTabId;
    }
    if(options.allowGlobal === true){
      return '';
    }
    const activeTabId = resolveActiveTabId();
    if(activeTabId){
      return activeTabId;
    }
    return '';
  }

  function getHistoryKey(tabId){
    return normalizeTabId(tabId) || GLOBAL_KEY;
  }

  function getHistoryBucket(tabId, createIfMissing){
    const key = getHistoryKey(tabId);
    let bucket = histories.get(key);
    if(!bucket && createIfMissing){
      bucket = {
        key,
        tabId: key === GLOBAL_KEY ? '' : key,
        stack: [],
        pointer: -1,
        updatedAt: Date.now()
      };
      histories.set(key, bucket);
    }
    return bucket || null;
  }

  function getPointerSnapshot(tabId){
    const bucket = getHistoryBucket(tabId, false);
    if(!bucket){
      return { stackLength: 0, pointer: -1 };
    }
    return {
      stackLength: bucket.stack.length,
      pointer: bucket.pointer
    };
  }

  function canUndoForTab(tabId){
    const bucket = getHistoryBucket(tabId, false);
    return !!(bucket && bucket.pointer >= 0);
  }

  function canRedoForTab(tabId){
    const bucket = getHistoryBucket(tabId, false);
    return !!(bucket && bucket.pointer + 1 < bucket.stack.length);
  }

  function readState(el){
    if(!el) return null;
    if(el.type === 'checkbox' || el.type === 'radio'){
      return { kind: 'checked', value: !!el.checked };
    }
    if(el.tagName === 'SELECT'){
      if(el.multiple){
        const selected = Array.from(el.options).filter(opt => opt.selected).map(opt => opt.value);
        return { kind: 'options', value: selected };
      }
      return { kind: 'value', value: el.value };
    }
    return { kind: 'value', value: el.value };
  }

  function statesEqual(a,b){
    if(a === b) return true;
    if(!a || !b) return false;
    if(a.kind !== b.kind) return false;
    if(a.kind === 'checked'){
      return !!a.value === !!b.value;
    }
    if(a.kind === 'options'){
      if(!Array.isArray(a.value) || !Array.isArray(b.value)) return false;
      if(a.value.length !== b.value.length) return false;
      for(let i=0;i<a.value.length;i+=1){
        if(a.value[i] !== b.value[i]) return false;
      }
      return true;
    }
    return String(a.value) === String(b.value);
  }

  function describeElement(el){
    if(!el) return 'unknown-element';
    const explicit = el.getAttribute && el.getAttribute('data-undo-label');
    if(explicit) return explicit;
    if(el.id) return `#${el.id}`;
    if(el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    if(el.classList && el.classList.length){
      return `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`;
    }
    return el.tagName ? el.tagName.toLowerCase() : el.nodeName || 'node';
  }

  function dispatchSyntheticEvent(el){
    if(!el) return;
    const type = (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') ? 'change' : 'input';
    const evt = new Event(type, { bubbles: true });
    evt.__undoGenerated = true;
    el.dispatchEvent(evt);
  }

  function applyState(el, state, reason){
    if(!el || !state) return;
    applying = true;
    try{
      if(state.kind === 'checked'){
        el.checked = !!state.value;
      }else if(state.kind === 'options' && el.tagName === 'SELECT' && el.options){
        const values = Array.isArray(state.value) ? state.value : [];
        Array.from(el.options).forEach(opt => {
          opt.selected = values.includes(opt.value);
        });
      }else{
        el.value = state.value != null ? state.value : '';
      }
      undoDebug('Debug: undo applyState', { label: describeElement(el), reason, state });
      dispatchSyntheticEvent(el);
    }catch(err){
      console.error('Shared.undoManager applyState error', err);
    }finally{
      lastStates.set(el, readState(el));
      applying = false;
    }
  }

  function cloneValue(value){
    if(value == null){
      return value;
    }
    const session = resolveSession();
    try{
      if(session && typeof session.fastClonePayload === 'function'){
        return session.fastClonePayload(value);
      }
    }catch(err){
      console.error('Shared.undoManager fastClonePayload error', err);
    }
    try{
      if(session && typeof session.clonePayload === 'function'){
        return session.clonePayload(value);
      }
    }catch(err){
      console.error('Shared.undoManager clonePayload error', err);
    }
    if(typeof global.structuredClone === 'function'){
      try{
        return global.structuredClone(value);
      }catch(err){
        // fall through to JSON clone
      }
    }
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      return value;
    }
  }

  function serializeComparable(value){
    if(value === undefined){
      return '__undefined__';
    }
    const session = resolveSession();
    if(session && typeof session.serializePayloadSignature === 'function'){
      try{
        return session.serializePayloadSignature(value);
      }catch(err){
        console.error('Shared.undoManager serializePayloadSignature error', err);
      }
    }
    try{
      return JSON.stringify(value);
    }catch(err){
      return String(value);
    }
  }

  function buildTabSnapshotSignature(snapshot){
    if(!snapshot){
      return '__null__';
    }
    return [
      normalizeTabId(snapshot.tabId || ''),
      serializeComparable(snapshot.payload),
      serializeComparable(snapshot.layoutState),
      serializeComparable(snapshot.sharedState),
      serializeComparable({
        previewMarkup: snapshot.previewMarkup,
        previewMeta: snapshot.previewMeta,
        previewSignature: snapshot.previewSignature,
        payloadSignature: snapshot.payloadSignature,
        layoutSignature: snapshot.layoutSignature
      })
    ].join('::');
  }

  function captureTabState(tabLike, options = {}){
    const tab = resolveTabFromValue(tabLike);
    if(!tab){
      return null;
    }
    const session = resolveSession();
    const tabId = normalizeTabId(tab.id);
    const activeTabId = resolveActiveTabId();
    if(options.persistActive !== false && session && typeof session.persistActiveTabState === 'function' && activeTabId && tabId === activeTabId){
      try{
        session.persistActiveTabState(tab, {
          reason: options.reason || 'undo-capture',
          forcePreviewCapture: options.forcePreviewCapture === true
        });
      }catch(err){
        console.error('Shared.undoManager captureTabState persist error', err);
      }
    }
    const snapshot = {
      tabId,
      type: String(tab.type || '').trim() || null,
      title: tab.title || '',
      payload: cloneValue(tab.payload || null),
      payloadSignature: tab.payloadSignature || null,
      layoutState: cloneValue(tab.layoutState || null),
      layoutSignature: tab.layoutSignature || null,
      sharedState: cloneValue(tab.sharedState || { runtime: {}, resources: {}, styles: {}, metadata: {} }),
      previewMarkup: tab.previewMarkup || null,
      previewSignature: tab.previewSignature || null,
      previewMeta: cloneValue(tab.previewMeta || null)
    };
    snapshot.signature = buildTabSnapshotSignature(snapshot);
    undoDebug('Debug: undo captured tab state', {
      tabId,
      type: snapshot.type,
      reason: options.reason || 'undo-capture',
      hasPayload: !!snapshot.payload,
      hasLayout: !!snapshot.layoutState
    });
    return snapshot;
  }

  function ensureTabSharedState(tab, sharedState){
    const nextSharedState = sharedState && typeof sharedState === 'object'
      ? cloneValue(sharedState)
      : { runtime: {}, resources: {}, styles: {}, metadata: {} };
    tab.sharedState = nextSharedState;
    try{
      Shared.workspaceTabs?.ensureTabState?.(tab);
    }catch(err){
      console.error('Shared.undoManager ensureTabSharedState error', err);
    }
    return tab.sharedState;
  }

  function applyTabState(snapshot, options = {}){
    if(!snapshot || !snapshot.tabId){
      return false;
    }
    const tab = resolveTabFromValue(snapshot.tabId);
    const session = resolveSession();
    if(!tab || !session){
      return false;
    }
    const payloadClone = cloneValue(snapshot.payload || null);
    const layoutClone = cloneValue(snapshot.layoutState || null);
    const sharedStateClone = cloneValue(snapshot.sharedState || { runtime: {}, resources: {}, styles: {}, metadata: {} });
    const reason = options.reason || 'undo-apply-tab-state';
    try{
      if(typeof session.assignTabPayload === 'function'){
        session.assignTabPayload(tab, payloadClone, { reason });
      }else{
        tab.payload = payloadClone;
      }
      tab.payloadSignature = snapshot.payloadSignature || serializeComparable(payloadClone);
      tab.layoutState = layoutClone;
      tab.layoutSignature = snapshot.layoutSignature || serializeComparable(layoutClone);
      ensureTabSharedState(tab, sharedStateClone);
      tab.previewMarkup = snapshot.previewMarkup || null;
      tab.previewSignature = snapshot.previewSignature || null;
      tab.previewMeta = cloneValue(snapshot.previewMeta || null);
    }catch(err){
      console.error('Shared.undoManager applyTabState assign error', err);
      return false;
    }

    const activeTabId = resolveActiveTabId();
    if(activeTabId && activeTabId === snapshot.tabId){
      const type = String(tab.type || snapshot.type || '').trim();
      const workspaces = global.Main?.components?.registry || null;
      const config = workspaces?.[type] || null;
      try{
        if(config && global.Main?.domControls?.applyWorkspacePayload){
          global.Main.domControls.applyWorkspacePayload(config, cloneValue(payloadClone), {
            reason,
            skipPayloadSizing: false,
            payloadSizingOptions: {
              context: reason,
              forceExact: true,
              preserveAspectLock: true,
              updateAspectRatio: true,
              updateDefaults: true
            }
          });
        }
      }catch(err){
        console.error('Shared.undoManager applyTabState workspace payload error', err);
      }
      try{
        if(config && typeof config.applyLayoutState === 'function'){
          config.applyLayoutState(cloneValue(layoutClone), {
            reason,
            tabId: tab?.id || null,
            resetStyles: true,
            resetDataset: true
          });
        }else if(Shared.componentLayout?.applyStateFor && type){
          Shared.componentLayout.applyStateFor(type, cloneValue(layoutClone), {
            reason,
            tabId: tab?.id || null,
            resetStyles: true,
            resetDataset: true
          });
        }
      }catch(err){
        console.error('Shared.undoManager applyTabState layout error', err);
      }
      try{
        if(Shared.workspaceTabs?.applySharedPayloadState){
          Shared.workspaceTabs.applySharedPayloadState(tab, type, payloadClone, config, { reason });
        }
      }catch(err){
        console.error('Shared.undoManager applyTabState shared payload error', err);
      }
      try{
        if(Shared.workspaceTabs?.applyRuntimeState){
          Shared.workspaceTabs.applyRuntimeState(tab, type, config, { reason });
        }
      }catch(err){
        console.error('Shared.undoManager applyTabState runtime error', err);
      }
      try{
        if(config && typeof config.draw === 'function'){
          config.draw();
        }
      }catch(err){
        console.error('Shared.undoManager applyTabState draw error', err);
      }
    }
    try{
      if(global.Main?.previews?.syncTabPreviewIndicator){
        global.Main.previews.syncTabPreviewIndicator(tab);
      }
    }catch(err){
      console.error('Shared.undoManager applyTabState preview error', err);
    }
    try{
      if(global.Main?.tabs?.renderTabs){
        global.Main.tabs.renderTabs();
      }
    }catch(err){
      console.error('Shared.undoManager applyTabState renderTabs error', err);
    }
    undoDebug('Debug: undo applied tab state', {
      tabId: snapshot.tabId,
      type: snapshot.type || tab.type || null,
      reason
    });
    return true;
  }

  function getStateSnapshot(meta = {}){
    const requestedTabId = normalizeTabId(meta.tabId || meta.viewTabId || resolveActiveTabId() || '');
    const fallbackGlobal = requestedTabId ? false : true;
    const bucket = getHistoryBucket(requestedTabId, false);
    const stackLength = bucket ? bucket.stack.length : 0;
    const pointer = bucket ? bucket.pointer : -1;
    const activeTabId = resolveActiveTabId();
    const canUndo = requestedTabId
      ? canUndoForTab(requestedTabId)
      : (fallbackGlobal ? canUndoForTab('') : false);
    const canRedo = requestedTabId
      ? canRedoForTab(requestedTabId)
      : (fallbackGlobal ? canRedoForTab('') : false);
    return {
      canUndo,
      canRedo,
      reason: meta.reason || 'state',
      tabId: requestedTabId || null,
      activeTabId: activeTabId || null,
      affectedTabId: normalizeTabId(meta.affectedTabId || '') || null,
      stackLength,
      pointer
    };
  }

  function notifyChange(reason, meta = {}){
    if(!listeners.size){
      return;
    }
    const snapshot = getStateSnapshot({
      reason: reason || 'state',
      tabId: meta.viewTabId || resolveActiveTabId() || meta.tabId || '',
      affectedTabId: meta.tabId || meta.affectedTabId || ''
    });
    listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch(err){
        console.error('Shared.undoManager listener error', err);
      }
    });
  }

  function resolveEntryTabId(entry){
    if(!entry || typeof entry !== 'object'){
      return '';
    }
    const explicit = normalizeTabId(entry.tabId || entry.workspaceTabId || entry.historyTabId || '');
    if(explicit){
      return explicit;
    }
    if(entry.element){
      const fromElement = resolveElementTabId(entry.element);
      if(fromElement){
        return fromElement;
      }
    }
    if(entry.target){
      const fromTarget = resolveElementTabId(entry.target);
      if(fromTarget){
        return fromTarget;
      }
    }
    if(entry.scope){
      const scopeTabId = normalizeTabId(entry.scope);
      const tab = resolveTabFromValue(scopeTabId);
      if(tab){
        return normalizeTabId(tab.id);
      }
    }
    return '';
  }

  function pushEntryToBucket(entry){
    const tabId = normalizeTabId(entry.tabId || '');
    const bucket = getHistoryBucket(tabId, true);
    bucket.stack = bucket.stack.slice(0, bucket.pointer + 1);
    bucket.stack.push(entry);
    bucket.pointer = bucket.stack.length - 1;
    bucket.updatedAt = Date.now();
    if(STACK_LIMIT > 0 && bucket.stack.length > STACK_LIMIT){
      const removeCount = bucket.stack.length - STACK_LIMIT;
      bucket.stack.splice(0, removeCount);
      bucket.pointer = Math.max(-1, bucket.pointer - removeCount);
    }
    undoDebug('Debug: undo stack record', {
      label: entry.label,
      scope: entry.scope || null,
      tabId: tabId || null,
      length: bucket.stack.length,
      pointer: bucket.pointer
    });
    notifyChange('record', { tabId });
    return true;
  }

  function normalizeUndoEntry(input, mode){
    if(!input){
      return null;
    }
    if(mode === 'state-change'){
      const apply = typeof input.apply === 'function' ? input.apply : null;
      if(!apply){
        return null;
      }
      const equals = typeof input.equals === 'function' ? input.equals : ((a, b) => a === b);
      const before = input.from;
      const after = input.to;
      if(equals(before, after)){
        return null;
      }
      const element = input.element || input.target || null;
      const tabId = normalizeTabId(input.tabId || resolveElementTabId(element) || resolveActiveTabId());
      return {
        label: input.label || (element ? `state:${describeElement(element)}` : 'state-change'),
        scope: input.scope || (element ? inferScope(element) : null),
        tabId,
        undo: () => apply(before, 'undo'),
        redo: () => apply(after, 'redo')
      };
    }
    if(typeof input.undo !== 'function'){
      return null;
    }
    const tabId = normalizeTabId(resolveEntryTabId(input));
    return {
      label: input.label || 'action',
      scope: input.scope || null,
      tabId,
      undo: input.undo,
      redo: typeof input.redo === 'function' ? input.redo : undefined
    };
  }

  function getMatchingTransaction(entry){
    if(!transactionStack.length){
      return null;
    }
    for(let i = transactionStack.length - 1; i >= 0; i -= 1){
      const tx = transactionStack[i];
      if(tx.closed){
        continue;
      }
      if(normalizeTabId(tx.tabId) === normalizeTabId(entry.tabId)){
        return tx;
      }
    }
    return null;
  }

  function recordAction(entry){
    if(!entry || typeof entry.undo !== 'function'){
      return false;
    }
    const tx = getMatchingTransaction(entry);
    if(tx){
      tx.entries.push(entry);
      undoDebug('Debug: undo transaction buffered entry', {
        transactionId: tx.id,
        tabId: tx.tabId || null,
        label: entry.label,
        bufferedEntries: tx.entries.length
      });
      return true;
    }
    return pushEntryToBucket(entry);
  }

  function flushPendingTransactions(reason, meta = {}){
    let flushed = false;
    let pass = 0;
    let passFlushed = false;
    do{
      pass += 1;
      passFlushed = false;
      const sources = Array.from(pendingTransactionSources);
      for(let i = 0; i < sources.length; i += 1){
        const source = sources[i];
        const flush = typeof source === 'function'
          ? source
          : (typeof source?.flushPendingTransactions === 'function' ? source.flushPendingTransactions.bind(source) : null);
        if(typeof flush !== 'function'){
          pendingTransactionSources.delete(source);
          continue;
        }
        try{
          const sourceFlushed = flush(reason || 'flush', meta || {}) === true;
          flushed = sourceFlushed || flushed;
          passFlushed = sourceFlushed || passFlushed;
        }catch(err){
          console.error('Shared.undoManager pending transaction flush error', err);
        }
      }
    }while(passFlushed && pass < 4);
    if(flushed){
      undoDebug('Debug: undo pending transactions flushed', {
        reason: reason || 'flush',
        tabId: normalizeTabId(meta?.tabId || '') || null,
        sourceCount: pendingTransactionSources.size,
        passes: pass
      });
    }
    return flushed;
  }

  function buildTransactionEntry(tx){
    if(!tx || !Array.isArray(tx.entries) || !tx.entries.length){
      return null;
    }
    if(tx.entries.length === 1){
      const single = tx.entries[0];
      return {
        label: tx.label || single.label || 'transaction',
        scope: tx.scope || single.scope || null,
        tabId: tx.tabId || single.tabId || '',
        undo: single.undo,
        redo: typeof single.redo === 'function' ? single.redo : undefined
      };
    }
    const entries = tx.entries.slice();
    return {
      label: tx.label || 'transaction',
      scope: tx.scope || null,
      tabId: tx.tabId || '',
      undo: () => {
        for(let i = entries.length - 1; i >= 0; i -= 1){
          const entry = entries[i];
          const result = entry.undo();
          if(result === false){
            return false;
          }
        }
        return true;
      },
      redo: () => {
        for(let i = 0; i < entries.length; i += 1){
          const entry = entries[i];
          if(typeof entry.redo === 'function'){
            const result = entry.redo();
            if(result === false){
              return false;
            }
          }else if(typeof entry.undo === 'function'){
            const fallback = entry.undo();
            if(fallback === false){
              return false;
            }
          }
        }
        return true;
      }
    };
  }

  undoNamespace.record = function record(entry){
    return recordAction(normalizeUndoEntry(entry, 'action'));
  };

  undoNamespace.recordStateChange = function recordStateChange(opts){
    return recordAction(normalizeUndoEntry(opts, 'state-change'));
  };

  undoNamespace.beginTransaction = function beginTransaction(options = {}){
    const tx = {
      id: `undo-tx-${++transactionSequence}`,
      label: options.label || 'transaction',
      scope: options.scope || null,
      tabId: normalizeTabId(resolveRequestedTabId(options, { allowGlobal: true })),
      entries: [],
      closed: false,
      createdAt: Date.now()
    };
    transactionStack.push(tx);
    undoDebug('Debug: undo transaction opened', {
      transactionId: tx.id,
      tabId: tx.tabId || null,
      label: tx.label
    });
    return tx.id;
  };

  undoNamespace.commitTransaction = function commitTransaction(transactionId, options = {}){
    if(!transactionStack.length){
      return false;
    }
    let index = -1;
    if(transactionId){
      index = transactionStack.findIndex(tx => tx.id === transactionId);
    }else{
      index = transactionStack.length - 1;
    }
    if(index < 0){
      return false;
    }
    const [tx] = transactionStack.splice(index, 1);
    tx.closed = true;
    if(options.label){
      tx.label = options.label;
    }
    const entry = buildTransactionEntry(tx);
    if(!entry){
      undoDebug('Debug: undo transaction commit skipped (empty)', {
        transactionId: tx.id,
        tabId: tx.tabId || null
      });
      return false;
    }
    undoDebug('Debug: undo transaction committed', {
      transactionId: tx.id,
      tabId: tx.tabId || null,
      entryCount: tx.entries.length,
      label: entry.label
    });
    return pushEntryToBucket(entry);
  };

  undoNamespace.rollbackTransaction = function rollbackTransaction(transactionId){
    if(!transactionStack.length){
      return false;
    }
    let index = -1;
    if(transactionId){
      index = transactionStack.findIndex(tx => tx.id === transactionId);
    }else{
      index = transactionStack.length - 1;
    }
    if(index < 0){
      return false;
    }
    const [tx] = transactionStack.splice(index, 1);
    tx.closed = true;
    undoDebug('Debug: undo transaction rolled back', {
      transactionId: tx.id,
      tabId: tx.tabId || null,
      discardedEntries: tx.entries.length
    });
    return true;
  };

  undoNamespace.registerPendingTransactionSource = function registerPendingTransactionSource(source){
    if(!source){
      return function noop(){};
    }
    const flush = typeof source === 'function'
      ? source
      : (typeof source.flushPendingTransactions === 'function' ? source.flushPendingTransactions : null);
    if(typeof flush !== 'function'){
      return function noop(){};
    }
    pendingTransactionSources.add(source);
    return function unregisterPendingTransactionSource(){
      pendingTransactionSources.delete(source);
    };
  };

  undoNamespace.flushPendingTransactions = function(reason, meta){
    return flushPendingTransactions(reason, meta || {});
  };

  function performUndoCommand(command, options = {}){
    const normalized = String(command || '').trim().toLowerCase();
    if(normalized === 'undo'){
      return undoNamespace.undo(options);
    }
    if(normalized === 'redo'){
      return undoNamespace.redo(options);
    }
    return false;
  }

  function performHistoryCommand(command, options = {}){
    const normalized = String(command || '').trim().toLowerCase();
    if(normalized !== 'undo' && normalized !== 'redo'){
      return false;
    }
    const target = options?.target || null;
    const tabId = normalizeTabId(options?.tabId || resolveElementTabId(target) || resolveActiveTabId() || '');
    if(options.preferBridge !== false){
      const undoBridge = findUndoKeydownBridge(target);
      if(undoBridge){
        try{
          const bridgeEvent = {
            key: normalized === 'redo' ? 'y' : 'z',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: normalized === 'redo' && options?.redoUsesShiftZ === true,
            target,
            defaultPrevented: false,
            preventDefault(){ this.defaultPrevented = true; },
            stopPropagation(){},
            stopImmediatePropagation(){}
          };
          const bridged = undoBridge(bridgeEvent) === true;
          if(bridged){
            undoDebug('Debug: undo command handled by bridge', {
              command: normalized,
              tabId: tabId || null,
              targetTag: target?.tagName || null
            });
            return true;
          }
        }catch(err){
          console.error('Shared.undoManager performHistoryCommand bridge error', err);
        }
      }
    }
    return performUndoCommand(normalized, {
      ...options,
      tabId,
      target
    });
  }

  undoNamespace.performCommand = function performCommand(command, options = {}){
    return performHistoryCommand(command, options || {});
  };

  undoNamespace.captureTabState = function(tabLike, options = {}){
    return captureTabState(tabLike, options || {});
  };

  undoNamespace.applyTabState = function(snapshot, options = {}){
    return applyTabState(snapshot, options || {});
  };

  undoNamespace.recordTabStateChange = function recordTabStateChange(options = {}){
    const from = options.from || null;
    const to = options.to || null;
    if(!from || !to){
      return false;
    }
    const fromSignature = from.signature || buildTabSnapshotSignature(from);
    const toSignature = to.signature || buildTabSnapshotSignature(to);
    if(fromSignature === toSignature){
      return false;
    }
    const tabId = normalizeTabId(options.tabId || to.tabId || from.tabId || '');
    return recordAction(normalizeUndoEntry({
      label: options.label || `tab-state:${tabId || 'global'}`,
      scope: options.scope || null,
      tabId,
      undo: () => applyTabState(from, { reason: options.undoReason || 'undo-tab-state' }),
      redo: () => applyTabState(to, { reason: options.redoReason || 'redo-tab-state' })
    }, 'action'));
  };

  undoNamespace.undo = function undo(options = {}){
    const tabId = normalizeTabId(resolveRequestedTabId(options, { allowGlobal: true }));
    try{
      flushPendingTransactions('undo', { tabId });
    }catch(err){
      console.error('Shared.undoManager pending-undo-state flush error', err);
    }
    const bucket = getHistoryBucket(tabId, false);
    if(!bucket || bucket.pointer < 0){
      undoDebug('Debug: undo stack empty on undo', { tabId: tabId || null });
      return false;
    }
    while(bucket.pointer >= 0){
      const currentIndex = bucket.pointer;
      const entry = bucket.stack[currentIndex];
      bucket.pointer -= 1;
      let result = true;
      try{
        undoDebug('Debug: undo executing', { label: entry.label, tabId: tabId || null, pointer: bucket.pointer });
        result = entry.undo();
      }catch(err){
        console.error('Shared.undoManager undo error', err);
        result = false;
      }
      if(result === false){
        undoDebug('Debug: undo entry reported failure and was skipped', { label: entry.label, tabId: tabId || null, pointer: bucket.pointer });
        continue;
      }
      bucket.updatedAt = Date.now();
      notifyChange('undo', { tabId, viewTabId: tabId });
      return true;
    }
    undoDebug('Debug: undo stack exhausted after skipping failed entries', { tabId: tabId || null });
    return false;
  };

  undoNamespace.redo = function redo(options = {}){
    const tabId = normalizeTabId(resolveRequestedTabId(options, { allowGlobal: true }));
    try{
      flushPendingTransactions('redo', { tabId });
    }catch(err){
      console.error('Shared.undoManager pending-redo-state flush error', err);
    }
    const bucket = getHistoryBucket(tabId, false);
    if(!bucket || bucket.pointer + 1 >= bucket.stack.length){
      undoDebug('Debug: undo stack empty on redo', { tabId: tabId || null });
      return false;
    }
    while(bucket.pointer + 1 < bucket.stack.length){
      bucket.pointer += 1;
      const entry = bucket.stack[bucket.pointer];
      let result = true;
      try{
        if(typeof entry.redo === 'function'){
          undoDebug('Debug: undo executing redo', { label: entry.label, tabId: tabId || null, pointer: bucket.pointer });
          result = entry.redo();
        }else if(typeof entry.undo === 'function'){
          undoDebug('Debug: undo fallback redo using undo()', { label: entry.label, tabId: tabId || null, pointer: bucket.pointer });
          result = entry.undo();
        }
      }catch(err){
        console.error('Shared.undoManager redo error', err);
        result = false;
      }
      if(result === false){
        undoDebug('Debug: redo entry reported failure and was skipped', { label: entry.label, tabId: tabId || null, pointer: bucket.pointer });
        continue;
      }
      bucket.updatedAt = Date.now();
      notifyChange('redo', { tabId, viewTabId: tabId });
      return true;
    }
    undoDebug('Debug: redo stack exhausted after skipping failed entries', { tabId: tabId || null });
    return false;
  };

  function clearAllHistories(reason){
    histories.clear();
    transactionStack.length = 0;
    undoDebug('Debug: undo stack cleared (all tabs)', { reason: reason || 'clear-all' });
    notifyChange('clear-all', { tabId: '', viewTabId: resolveActiveTabId() || '' });
    return true;
  }

  undoNamespace.clearAll = function clearAll(options = {}){
    return clearAllHistories(options.reason || 'clear-all');
  };

  undoNamespace.clear = function clear(options = {}){
    const isObjectArg = typeof options === 'object' && options && !Array.isArray(options) && !('nodeType' in options) && !('id' in options);
    const explicitTabId = isObjectArg
      ? normalizeTabId(options.tabId || options.workspaceTabId || options.historyTabId || '')
      : normalizeTabId(typeof options === 'string' ? options : '');
    if(explicitTabId){
      return undoNamespace.clearTab(explicitTabId, options || {});
    }
    if(!isObjectArg && options){
      return undoNamespace.clearTab(options, {});
    }
    if(isObjectArg && options.all === false){
      const currentTabId = resolveActiveTabId();
      if(currentTabId){
        return undoNamespace.clearTab(currentTabId, options || {});
      }
    }
    return clearAllHistories(options.reason || 'clear');
  };

  undoNamespace.clearTab = function clearTab(tabLike, options = {}){
    const tabId = normalizeTabId(resolveRequestedTabId(tabLike || options, { allowGlobal: true }));
    const key = getHistoryKey(tabId);
    const existed = histories.delete(key);
    for(let i = transactionStack.length - 1; i >= 0; i -= 1){
      if(normalizeTabId(transactionStack[i]?.tabId || '') === tabId){
        transactionStack.splice(i, 1);
      }
    }
    if(existed){
      undoDebug('Debug: undo stack cleared for tab', { tabId: tabId || null, reason: options.reason || 'clear-tab' });
      notifyChange('clear-tab', { tabId, viewTabId: resolveActiveTabId() || tabId || '' });
    }
    return existed;
  };

  undoNamespace.pruneMissingTabs = function pruneMissingTabs(){
    const tabs = resolveSession()?.workspaceState?.tabs;
    if(!Array.isArray(tabs)){
      return 0;
    }
    const validIds = new Set(tabs.map(tab => normalizeTabId(tab?.id)).filter(Boolean));
    let removed = 0;
    Array.from(histories.keys()).forEach(key => {
      if(key === GLOBAL_KEY){
        return;
      }
      if(!validIds.has(key)){
        histories.delete(key);
        removed += 1;
      }
    });
    if(removed > 0){
      undoDebug('Debug: undo histories pruned', { removed, validCount: validIds.size });
      notifyChange('prune-missing-tabs', { viewTabId: resolveActiveTabId() || '' });
    }
    return removed;
  };

  function shouldTrackElement(el){
    if(!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if(tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
    if(el.type === 'file') return false;
    if(el.closest && el.closest('.handsontable')) return false;
    if(el.hasAttribute && el.hasAttribute('data-undo-ignore')) return false;
    return true;
  }

  function storeInitialState(el){
    if(!shouldTrackElement(el)) return;
    const state = readState(el);
    lastStates.set(el, state);
    undoDebug('Debug: undo stored initial state', { label: describeElement(el), state });
  }

  function onFocusIn(event){
    lastFocusedElement = event?.target || null;
    storeInitialState(event.target);
  }

  function recordElementStateChange(el, source){
    if(applying) return false;
    if(!shouldTrackElement(el)) return false;
    const prevState = lastStates.has(el) ? lastStates.get(el) : readState(el);
    const nextState = readState(el);
    if(statesEqual(prevState, nextState)){
      lastStates.set(el, nextState);
      return false;
    }
    const label = describeElement(el);
    const scope = inferScope(el);
    const tabId = resolveElementTabId(el) || resolveActiveTabId();
    const undoState = prevState;
    const redoState = nextState;
    const result = recordAction({
      label: `${source || 'input'}:${label}`,
      scope,
      tabId,
      undo: () => applyState(el, undoState, 'undo'),
      redo: () => applyState(el, redoState, 'redo')
    });
    lastStates.set(el, nextState);
    undoDebug('Debug: undo tracked element mutation', {
      label,
      source: source || 'input',
      scope: scope || null,
      tabId: tabId || null,
      recorded: result === true
    });
    return result === true;
  }

  function shouldTrackImmediateInput(el){
    if(!shouldTrackElement(el)) return false;
    if(el.tagName === 'TEXTAREA') return false;
    if(el.tagName === 'INPUT'){
      const type = String(el.type || '').toLowerCase();
      if(TEXT_INPUT_TYPES.has(type)) return false;
      if(type === 'checkbox' || type === 'radio' || type === 'file') return false;
    }
    return true;
  }

  function handleInput(event){
    if(applying) return;
    const el = event?.target;
    if(!shouldTrackImmediateInput(el)) return;
    if(event.__undoGenerated) return;
    recordElementStateChange(el, 'input');
  }

  function handleChange(event){
    if(applying) return;
    const el = event?.target;
    if(!shouldTrackElement(el)) return;
    if(event.__undoGenerated) return;
    recordElementStateChange(el, 'change');
  }

  function allowNativeUndo(target){
    if(!target) return true;
    if(target.isContentEditable) return true;
    if(target.tagName === 'TEXTAREA') return true;
    if(target.tagName === 'INPUT'){
      if(TEXT_INPUT_TYPES.has(target.type || '')) return true;
    }
    return false;
  }

  function resolveUndoBridgeTarget(target){
    if(!target){
      return null;
    }
    if(target.nodeType === 1){
      return target;
    }
    if(target.nodeType === 3){
      return target.parentElement || target.parentNode || null;
    }
    return null;
  }

  function findUndoKeydownBridge(target){
    let node = resolveUndoBridgeTarget(target);
    while(node && node !== global.document){
      if(typeof node.__undoManagerHandleKeydown === 'function'){
        return node.__undoManagerHandleKeydown;
      }
      node = node.parentElement || node.parentNode || null;
    }
    return null;
  }

  function handleKeydown(event){
    if(!event){
      return;
    }
    if(handledKeyEvents.has(event)){
      return;
    }
    handledKeyEvents.add(event);
    const isModifier = event.ctrlKey || event.metaKey;
    if(!isModifier || event.altKey) return;
    const key = event.key ? event.key.toLowerCase() : '';
    undoDebug('Debug: undo keydown received', {
      key,
      ctrlKey: !!event.ctrlKey,
      metaKey: !!event.metaKey,
      shiftKey: !!event.shiftKey,
      defaultPrevented: !!event.defaultPrevented,
      targetTag: event?.target?.tagName || null,
      targetClass: event?.target?.className || null
    });
    if(key !== 'z' && key !== 'y'){
      if(event.defaultPrevented){
        undoDebug('Debug: undo keydown ignored (non-undo key, defaultPrevented)', { key });
        return;
      }
      return;
    }
    const commandOptions = {
      tabId: resolveElementTabId(event.target) || resolveActiveTabId() || '',
      target: event.target || null,
      preferBridge: true,
      redoUsesShiftZ: !!event.shiftKey
    };
    let handled = false;
    if(key === 'z'){
      handled = performHistoryCommand(event.shiftKey ? 'redo' : 'undo', commandOptions);
    }else if(key === 'y'){
      handled = performHistoryCommand('redo', commandOptions);
    }
    if(handled){
      const pointerSnapshot = getPointerSnapshot(commandOptions.tabId);
      undoDebug('Debug: undo keydown handled', {
        key,
        tabId: commandOptions.tabId || null,
        pointer: pointerSnapshot.pointer,
        stackLength: pointerSnapshot.stackLength
      });
      event.preventDefault();
    }else if(key === 'z' && allowNativeUndo(event.target)){
      undoDebug('Debug: native undo allowed to proceed');
    }else{
      const pointerSnapshot = getPointerSnapshot(commandOptions.tabId);
      undoDebug('Debug: undo keydown not handled by undo manager', {
        key,
        tabId: commandOptions.tabId || null,
        pointer: pointerSnapshot.pointer,
        stackLength: pointerSnapshot.stackLength
      });
    }
  }

  if(global.document){
    const doc = global.document;
    if(typeof global.addEventListener === 'function'){
      global.addEventListener('keydown', handleKeydown, true);
    }
    doc.addEventListener('focusin', onFocusIn, true);
    doc.addEventListener('input', handleInput, true);
    doc.addEventListener('change', handleChange, true);
    doc.addEventListener('keydown', handleKeydown, true);
    undoNamespace.__globalKeydownAttached = true;
    undoDebug('Debug: Shared.undoManager listeners attached');
  }

  undoNamespace.canUndo = function canUndo(options = {}){
    const tabId = normalizeTabId(resolveRequestedTabId(options, { allowGlobal: true }));
    if(tabId){
      return canUndoForTab(tabId);
    }
    return canUndoForTab('');
  };

  undoNamespace.canRedo = function canRedo(options = {}){
    const tabId = normalizeTabId(resolveRequestedTabId(options, { allowGlobal: true }));
    if(tabId){
      return canRedoForTab(tabId);
    }
    return canRedoForTab('');
  };

  undoNamespace.getActiveTabId = function getActiveHistoryTabId(){
    return resolveActiveTabId() || null;
  };

  undoNamespace.getSnapshot = function getSnapshot(options = {}){
    return getStateSnapshot(options || {});
  };

  undoNamespace.getTabHistoryInfo = function getTabHistoryInfo(tabLike){
    const tabId = normalizeTabId(resolveRequestedTabId(tabLike || {}, { allowGlobal: true }));
    const bucket = getHistoryBucket(tabId, false);
    return {
      tabId: tabId || null,
      stackLength: bucket ? bucket.stack.length : 0,
      pointer: bucket ? bucket.pointer : -1,
      canUndo: canUndoForTab(tabId),
      canRedo: canRedoForTab(tabId),
      labels: bucket ? bucket.stack.map(entry => entry?.label || 'action') : []
    };
  };

  undoNamespace.getAllHistoryInfo = function getAllHistoryInfo(){
    return Array.from(histories.values())
      .map(bucket => ({
        tabId: bucket.tabId || null,
        stackLength: bucket.stack.length,
        pointer: bucket.pointer,
        canUndo: bucket.pointer >= 0,
        canRedo: bucket.pointer + 1 < bucket.stack.length,
        labels: bucket.stack.map(entry => entry?.label || 'action')
      }))
      .sort((a, b) => String(a.tabId || '').localeCompare(String(b.tabId || '')));
  };

  undoNamespace.refreshState = function refreshState(tabLike, reason){
    const tabId = normalizeTabId(resolveRequestedTabId(tabLike || {}, { allowGlobal: true }));
    notifyChange(reason || 'refresh', { viewTabId: tabId || resolveActiveTabId() || '', tabId });
    return true;
  };

  undoNamespace.getLastFocusedElement = function getLastFocusedElement(){
    return lastFocusedElement || null;
  };

  undoNamespace.onChange = function onChange(listener){
    if(typeof listener !== 'function'){
      return function noop(){ };
    }
    listeners.add(listener);
    try {
      listener(getStateSnapshot({ reason: 'subscribe' }));
    } catch(err){
      console.error('Shared.undoManager listener error', err);
    }
    return function unsubscribe(){
      listeners.delete(listener);
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
