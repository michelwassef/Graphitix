(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  const payloadBlobMap = new WeakMap();
  const latestGraphOpenOperationByOwner = new Map();
  let nextGraphOpenOperationId = 1;
  let nextGraphSaveOperationId = 1;

  const DEFAULT_FILE_TYPES = [
    {
      description: 'Graph Files',
      accept: {
        'application/zip': ['.graph'],
        'application/json': ['.json']
      }
    }
  ];

  function debug(label, details){
    const message = `Debug: fileIO.${label}`;
    if(typeof Shared.debug === 'function'){
      Shared.debug(message, details);
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug(message, details);
    }
  }

  function ensureName(name, fallback){
    return name || fallback || 'graph.graph';
  }

  function getDesktopBridge(){
    return global.desktop && global.desktop.isDesktop ? global.desktop : null;
  }

  function getBaseName(filePath, fallback){
    const source = String(filePath || '').trim();
    if(!source) return fallback || '';
    const parts = source.split(/[\\/]+/);
    return parts[parts.length - 1] || fallback || source;
  }

  function resolveTypes(types){
    if(Array.isArray(types) && types.length){
      return types;
    }
    return DEFAULT_FILE_TYPES;
  }

  function resolveDesktopFilters(types){
    const exts = [];
    resolveTypes(types).forEach(type => {
      Object.values(type?.accept || {}).forEach(list => {
        (Array.isArray(list) ? list : []).forEach(ext => {
          const clean = String(ext || '').replace(/^\./, '').trim();
          if(clean && !exts.includes(clean)) exts.push(clean);
        });
      });
    });
    return [{ name: 'Supported Files', extensions: exts.length ? exts : ['graph', 'json'] }];
  }

  function registerPayloadBlob(blob, payload){
    if(!blob) return;
    payloadBlobMap.set(blob, { value: payload, hasValue: true });
  }

  function consumePayloadBlob(blob){
    if(!blob) return null;
    const entry = payloadBlobMap.get(blob);
    if(entry){
      payloadBlobMap.delete(blob);
      return entry;
    }
    return null;
  }

  fileIO.registerPayloadBlob = registerPayloadBlob;

  function normalizeGraphFileOwner(owner, context, options = {}){
    const source = owner && typeof owner === 'object' ? owner : {};
    let tabId = String(source.tabId || source.workspaceTabId || source.tab?.id || '').trim();
    let component = String(source.component || source.componentKey || context || '').trim();
    let generation = Number(source.sessionGeneration ?? source.generation);

    if(options.inferActive === true && !tabId){
      try{
        const active = global.Main?.session?.getActiveTab?.() || null;
        const activeId = String(active?.id || '').trim();
        const activeType = String(active?.type || '').trim();
        if(activeId && (!component || !activeType || activeType === component)){
          tabId = activeId;
          if(!component){
            component = activeType;
          }
        }
      }catch(_err){}
    }

    if(tabId && (!Number.isFinite(generation) || generation <= 0)){
      try{
        const meta = Shared.workspaceTabs?.buildSessionMeta?.(component, {
          tabId,
          allowActiveTabFallback: false
        }) || null;
        generation = Number(meta?.sessionGeneration ?? meta?.generation);
      }catch(_err){}
    }

    return {
      component: component || null,
      tabId: tabId || null,
      sessionGeneration: Number.isFinite(generation) && generation > 0 ? generation : null
    };
  }

  fileIO.createGraphOpenOperation = function createGraphOpenOperation(options = {}){
    const existing = options?.operation;
    if(existing && typeof existing === 'object' && existing.type === 'graph-file-open'){
      return existing;
    }
    const context = String(options?.context || 'graph').trim() || 'graph';
    const owner = normalizeGraphFileOwner(options?.owner, context);
    const operation = {
      id: `graph-open-${nextGraphOpenOperationId++}`,
      type: 'graph-file-open',
      context,
      component: owner.component,
      tabId: owner.tabId,
      sessionGeneration: owner.sessionGeneration,
      stalePolicy: owner.tabId ? 'owner-tab-latest' : 'caller-managed'
    };
    if(operation.component && operation.tabId){
      latestGraphOpenOperationByOwner.set(`${operation.component}::${operation.tabId}`, operation.id);
    }
    try{
      return Object.freeze(operation);
    }catch(_err){
      return operation;
    }
  };

  fileIO.createGraphSaveOperation = function createGraphSaveOperation(options = {}){
    const existing = options?.operation;
    if(existing && typeof existing === 'object' && existing.type === 'graph-file-save'){
      return existing;
    }
    const context = String(options?.context || 'graph').trim() || 'graph';
    const owner = normalizeGraphFileOwner(options?.owner, context, { inferActive: true });
    const operation = {
      id: `graph-save-${nextGraphSaveOperationId++}`,
      type: 'graph-file-save',
      context,
      component: owner.component,
      tabId: owner.tabId,
      sessionGeneration: owner.sessionGeneration
    };
    try{
      return Object.freeze(operation);
    }catch(_err){
      return operation;
    }
  };

  function isLatestGraphOpenOperation(operation){
    const component = String(operation?.component || '').trim();
    const tabId = String(operation?.tabId || '').trim();
    if(!component || !tabId){
      return true;
    }
    const latestId = latestGraphOpenOperationByOwner.get(`${component}::${tabId}`);
    return !latestId || latestId === operation.id;
  }

  function resolveWorkspaceTabById(tabId){
    const id = String(tabId || '').trim();
    if(!id){
      return null;
    }
    try{
      const tabs = global.Main?.session?.workspaceState?.tabs;
      return Array.isArray(tabs)
        ? (tabs.find(tab => tab && String(tab.id || '') === id) || null)
        : null;
    }catch(_err){
      return null;
    }
  }

  function resolveWorkspaceActiveTabId(component = null){
    try{
      const active = global.Main?.session?.getActiveTab?.() || null;
      const mainTabId = String(active?.id || global.Main?.session?.workspaceState?.activeTabId || '').trim();
      if(mainTabId){
        return mainTabId;
      }
    }catch(_err){}
    try{
      const componentTabId = String(Shared.workspaceTabs?.getActiveSessionInfo?.(component || '')?.tabId || '').trim();
      return componentTabId || null;
    }catch(_err){
      return null;
    }
  }

  function inspectGraphFileOwner(operation, options = {}){
    const component = String(operation?.component || options.component || operation?.context || '').trim();
    const tabId = String(operation?.tabId || '').trim();
    if(operation?.type === 'graph-file-open' && options.requireLatest !== false && !isLatestGraphOpenOperation(operation)){
      return { ok: false, status: 'stale-operation', component, tabId, tab: null, activeTabId: resolveWorkspaceActiveTabId(component) };
    }
    if(!tabId){
      return { ok: true, status: 'unscoped', component, tabId: null, tab: null, activeTabId: resolveWorkspaceActiveTabId(component), isActiveOwner: true };
    }

    const workspaceTabs = global.Main?.session?.workspaceState?.tabs;
    const hasWorkspaceRegistry = Array.isArray(workspaceTabs);
    const tab = resolveWorkspaceTabById(tabId);
    if(hasWorkspaceRegistry && !tab){
      return { ok: false, status: 'stale-owner', component, tabId, tab: null, activeTabId: resolveWorkspaceActiveTabId(component) };
    }
    if(component && tab?.type && String(tab.type) !== component){
      return { ok: false, status: 'owner-type-mismatch', component, tabId, tab, activeTabId: resolveWorkspaceActiveTabId(component) };
    }
    const activeTabId = resolveWorkspaceActiveTabId(component);
    return {
      ok: true,
      status: 'current-owner',
      component,
      tabId,
      tab,
      activeTabId,
      isActiveOwner: activeTabId === tabId
    };
  }

  fileIO.inspectGraphOpenOperation = function inspectGraphOpenOperation(operation){
    return inspectGraphFileOwner(operation, { requireLatest: true });
  };

  function graphOpenCompletionStatus(operation, via, extra = {}){
    const inspection = inspectGraphFileOwner(operation, { requireLatest: true });
    if(inspection.ok){
      return null;
    }
    debug('graphOpenOperation.rejected', {
      operationId: operation?.id || null,
      component: inspection.component || null,
      tabId: inspection.tabId || null,
      status: inspection.status,
      via
    });
    return {
      status: inspection.status,
      via,
      operation,
      ...extra
    };
  }

  function applyGraphFileSetter(setter, value, operation = null){
    if(typeof setter !== 'function'){
      return false;
    }
    if(operation && (operation.type === 'graph-file-open' || operation.type === 'graph-file-save')){
      const inspection = inspectGraphFileOwner(operation, {
        requireLatest: operation.type === 'graph-file-open'
      });
      if(!inspection.ok){
        debug('graphFileSetter.skipped', {
          operationId: operation.id || null,
          type: operation.type,
          component: inspection.component || null,
          tabId: inspection.tabId || null,
          status: inspection.status
        });
        return false;
      }
    }
    try{
      setter(value, operation);
      return true;
    }catch(err){
      console.error('fileIO.applyGraphFileSetter error', err);
      return false;
    }
  }

  function mergeInactiveGraphOpenLayout(tab, payload, reason){
    const session = global.Main?.session || null;
    const graphSizing = Shared.graphSizing || null;
    if(!tab || !graphSizing || typeof graphSizing.mergePayloadSizingIntoLayout !== 'function'){
      return false;
    }
    let nextLayout = null;
    try{
      nextLayout = graphSizing.mergePayloadSizingIntoLayout(tab.layoutState || null, payload, {
        context: `${reason}:inactive-owner-layout`,
        preferPayload: true
      });
    }catch(err){
      console.error('fileIO.mergeInactiveGraphOpenLayout error', { tabId: tab.id || null, reason, err });
      return false;
    }
    if(!nextLayout){
      return false;
    }
    const serialize = typeof session?.serializePayloadSignature === 'function'
      ? session.serializePayloadSignature
      : value => {
          try{ return JSON.stringify(value); }catch(_err){ return ''; }
        };
    const previousSignature = tab.layoutSignature || serialize(tab.layoutState || null);
    const nextSignature = serialize(nextLayout);
    const changed = previousSignature !== nextSignature;
    tab.layoutState = nextLayout;
    tab.layoutSignature = nextSignature;
    tab.layoutDirty = false;
    tab.layoutDirtyReason = '';
    if(changed){
      tab.layoutVersion = Number(tab.layoutVersion || 0) + 1;
      session?.clearTabRenderCache?.(tab, { reason: `${reason}:layout-changed` });
      session?.clearTabArchiveRenderCache?.(tab, { reason: `${reason}:layout-changed` });
    }
    const loaded = session?.workspaceState?.loadedWorkspaces;
    if(loaded && typeof loaded === 'object'){
      delete loaded[tab.id];
    }
    debug('graphOpenPayload.ownerLayoutStaged', {
      tabId: tab.id || null,
      reason,
      changed,
      hasGraphSizing: !!payload?.meta?.graphSizing
    });
    return changed;
  }

  fileIO.routeGraphOpenPayload = function routeGraphOpenPayload(options = {}){
    const operation = fileIO.createGraphOpenOperation({
      context: options.context || options.operation?.context || 'graph',
      operation: options.operation,
      owner: options.owner
    });
    const payload = options.payload;
    const apply = typeof options.apply === 'function' ? options.apply : null;
    const component = String(operation?.component || options.component || '').trim();
    const tabId = String(operation?.tabId || '').trim();
    const reason = String(options.reason || `${component || operation.context || 'graph'}-graph-file-open`).trim();

    if(component && payload && typeof payload === 'object' && payload.type && String(payload.type) !== component){
      debug('graphOpenPayload.payloadTypeMismatch', {
        operationId: operation.id,
        component,
        tabId: tabId || null,
        payloadType: String(payload.type)
      });
      return { status: 'payload-type-mismatch', operation, value: false };
    }

    const inspection = inspectGraphFileOwner(operation, { requireLatest: true, component });
    if(!inspection.ok){
      debug(`graphOpenPayload.${inspection.status}`, {
        operationId: operation.id,
        component: component || null,
        tabId: tabId || null,
        activeTabId: inspection.activeTabId || null
      });
      return { status: inspection.status, operation, value: false };
    }

    if(!tabId){
      return {
        status: 'applied-unscoped',
        operation,
        value: apply ? apply(payload, operation) : false
      };
    }

    if(inspection.isActiveOwner){
      return {
        status: 'applied-active-owner',
        operation,
        value: apply ? apply(payload, operation) : false
      };
    }

    const session = global.Main?.session || null;
    const tab = inspection.tab;
    if(typeof session?.commitTabPayload !== 'function' || !tab){
      debug('graphOpenPayload.deferUnavailable', {
        operationId: operation.id,
        component: component || null,
        tabId,
        activeTabId: inspection.activeTabId || null
      });
      return { status: 'owner-inactive-unavailable', operation, value: false };
    }

    const changed = session.commitTabPayload(tab, payload, {
      reason,
      origin: 'user'
    });
    const payloadUnchanged = changed === false
      && typeof session.serializePayloadSignature === 'function'
      && session.serializePayloadSignature(payload) === (tab.payloadSignature || session.serializePayloadSignature(tab.payload || null));
    const accepted = changed === true || payloadUnchanged;
    if(accepted){
      // During graph-file loading the incoming payload is canonical. Preserve the
      // rest of the owner's tab layout, but make the saved graph dimensions win
      // over stale dimensions from the graph that this file replaces.
      mergeInactiveGraphOpenLayout(tab, payload, reason);
    }
    debug('graphOpenPayload.deferredToOwner', {
      operationId: operation.id,
      component: component || null,
      tabId,
      activeTabId: inspection.activeTabId || null,
      changed: changed === true,
      payloadUnchanged
    });
    return {
      status: payloadUnchanged ? 'deferred-owner-payload-unchanged' : 'deferred-owner-payload',
      operation,
      value: accepted
    };
  };

  function ensureSetter(setter, value, operation = null){
    return applyGraphFileSetter(setter, value, operation);
  }

  function isBlobLike(value){
    return !!value
      && typeof value === 'object'
      && typeof value.arrayBuffer === 'function'
      && typeof value.size === 'number';
  }

  function hasUserActivation(){
    const activation = global.navigator && global.navigator.userActivation;
    if(!activation || typeof activation.isActive !== 'boolean'){
      return true;
    }
    return activation.isActive;
  }

  function isUserActivationError(err){
    const name = String(err?.name || '');
    const message = String(err?.message || '');
    return name === 'SecurityError'
      && /user activation is required/i.test(message);
  }

  function isBinaryLike(value){
    if(isBlobLike(value)){
      return true;
    }
    if(typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer){
      return true;
    }
    if(typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)){
      return true;
    }
    return false;
  }

  async function payloadToBase64(payload){
    const normalized = normalizeWritablePayload(payload);
    let buffer = null;
    if(normalized.kind === 'blob'){
      buffer = await normalized.value.arrayBuffer();
    }else if(normalized.kind === 'binary'){
      buffer = normalized.value;
    }else{
      const text = String(normalized.value || '');
      if(typeof TextEncoder !== 'undefined'){
        buffer = new TextEncoder().encode(text).buffer;
      }else{
        const bytes = new Uint8Array(text.length);
        for(let i = 0; i < text.length; i += 1){
          bytes[i] = text.charCodeAt(i) & 0xff;
        }
        buffer = bytes.buffer;
      }
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for(let i = 0; i < bytes.length; i += chunkSize){
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return global.btoa(binary);
  }

  function base64ToBlob(dataBase64, mimeType){
    const binary = global.atob(String(dataBase64 || ''));
    const bytes = new Uint8Array(binary.length);
    for(let i = 0; i < binary.length; i += 1){
      bytes[i] = binary.charCodeAt(i);
    }
    return new (global.Blob || Blob)([bytes], { type: mimeType || 'application/octet-stream' });
  }

  function makeDesktopHandle(filePath){
    const path = String(filePath || '').trim();
    if(!path) return null;
    return {
      __desktopFilePath: path,
      name: getBaseName(path, 'workspace.graph')
    };
  }

  function normalizeWritablePayload(payload){
    if(isBlobLike(payload)){
      return {
        kind: 'blob',
        value: payload,
        length: payload.size || 0,
        mimeType: payload.type || 'application/octet-stream'
      };
    }
    if(typeof ArrayBuffer !== 'undefined' && payload instanceof ArrayBuffer){
      return {
        kind: 'binary',
        value: payload,
        length: payload.byteLength || 0,
        mimeType: 'application/octet-stream'
      };
    }
    if(typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(payload)){
      const view = payload;
      const byteOffset = view.byteOffset || 0;
      const byteLength = view.byteLength || 0;
      const buffer = view.buffer ? view.buffer.slice(byteOffset, byteOffset + byteLength) : view;
      return {
        kind: 'binary',
        value: buffer,
        length: byteLength,
        mimeType: 'application/octet-stream'
      };
    }
    try{
      const serializedRaw = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const serialized = typeof serializedRaw === 'string' ? serializedRaw : '';
      return {
        kind: 'text',
        value: serialized,
        length: serialized.length,
        mimeType: 'application/json'
      };
    }catch(err){
      console.error('fileIO.normalizeWritablePayload error', err);
      throw err;
    }
  }

  function resolvePayload(getPayload, provided){
    if(provided !== undefined){
      return Promise.resolve(provided);
    }
    if(typeof getPayload === 'function'){
      try{
        const value = getPayload();
        const isPromise = value && typeof value.then === 'function';
        debug('resolvePayload.invoke', { isPromise });
        return isPromise ? value : Promise.resolve(value);
      }catch(err){
        console.error('fileIO.resolvePayload error', err);
        return Promise.reject(err);
      }
    }
    return Promise.resolve(getPayload);
  }


  function createGraphFileOwnerError(inspection, operation){
    const err = new Error(`Graph file owner is unavailable (${inspection?.status || 'unknown-owner-state'})`);
    err.name = 'GraphFileOwnerError';
    err.code = 'GRAPH_FILE_OWNER_UNAVAILABLE';
    err.status = inspection?.status || 'stale-owner';
    err.component = inspection?.component || operation?.component || null;
    err.tabId = inspection?.tabId || operation?.tabId || null;
    return err;
  }

  function isGraphFileOwnerError(err){
    return err?.code === 'GRAPH_FILE_OWNER_UNAVAILABLE' || err?.name === 'GraphFileOwnerError';
  }

  function graphFileOwnerFailureResult(err, operation, via){
    const status = String(err?.status || 'stale-owner');
    debug('graphFileOwner.rejected', {
      operationId: operation?.id || null,
      type: operation?.type || null,
      component: operation?.component || err?.component || null,
      tabId: operation?.tabId || err?.tabId || null,
      status,
      via
    });
    return { status, via, operation, error: err };
  }

  async function resolveSavePayload(operation, getPayload, provided){
    if(provided !== undefined){
      return provided;
    }
    const inspection = inspectGraphFileOwner(operation, { requireLatest: false });
    if(!inspection.ok){
      throw createGraphFileOwnerError(inspection, operation);
    }
    if(operation?.tabId && !inspection.isActiveOwner){
      if(inspection.tab && inspection.tab.payload != null){
        debug('resolveSavePayload.inactiveOwnerCanonicalPayload', {
          operationId: operation.id || null,
          component: inspection.component || null,
          tabId: inspection.tabId || null
        });
        return inspection.tab.payload;
      }
      throw createGraphFileOwnerError({ ...inspection, status: 'owner-payload-unavailable' }, operation);
    }
    return resolvePayload(getPayload, provided);
  }

  async function resolvePayloadWithGraphSizing(context, getPayload, provided, options = {}){
    const operation = options.operation || null;
    const resolved = operation?.type === 'graph-file-save'
      ? await resolveSavePayload(operation, getPayload, provided)
      : await resolvePayload(getPayload, provided);
    const graphSizing = Shared.graphSizing || null;
    if(!graphSizing || typeof graphSizing.enrichPayloadForType !== 'function'){
      return resolved;
    }
    if(!resolved || typeof resolved !== 'object' || isBinaryLike(resolved)){
      return resolved;
    }
    try{
      const inspection = operation?.type === 'graph-file-save'
        ? inspectGraphFileOwner(operation, { requireLatest: false })
        : null;
      if(inspection && !inspection.ok){
        throw createGraphFileOwnerError(inspection, operation);
      }
      const inactiveLayout = inspection?.tab && !inspection.isActiveOwner
        ? inspection.tab.layoutState || null
        : null;
      const enriched = graphSizing.enrichPayloadForType(context, resolved, {
        context: `file-save-${context}`,
        tabId: operation?.tabId || null,
        layoutState: inactiveLayout
      });
      debug('resolvePayloadWithGraphSizing.enriched', {
        context,
        operationId: operation?.id || null,
        ownerTabId: operation?.tabId || null,
        ownerActive: inspection ? inspection.isActiveOwner : null,
        hasPayload: !!enriched,
        hasGraphSizing: !!enriched?.meta?.graphSizing
      });
      return enriched;
    }catch(err){
      if(isGraphFileOwnerError(err)){
        throw err;
      }
      console.error('fileIO.resolvePayloadWithGraphSizing error', { context, err });
      return resolved;
    }
  }

  async function parseJsonPayloadFromBlob(blob, context){
    if(!blob || typeof blob.text !== 'function'){
      return null;
    }
    try{
      const text = await blob.text();
      if(typeof text !== 'string' || !text.trim()){
        return null;
      }
      const parsed = JSON.parse(text);
      debug('parseJsonPayloadFromBlob.success', {
        context,
        length: text.length,
        hasGraphSizing: !!parsed?.meta?.graphSizing
      });
      return parsed;
    }catch(err){
      debug('parseJsonPayloadFromBlob.skip', {
        context,
        message: err?.message || String(err)
      });
      return null;
    }
  }

  function resolveGraphOpenSvgBox(context, operation){
    if(!operation?.tabId){
      return null;
    }
    const inspection = inspectGraphFileOwner(operation, { requireLatest: true, component: context });
    if(!inspection.ok || !inspection.isActiveOwner){
      return null;
    }
    try{
      const root = Shared.workspaceTabs?.getMountedRoot?.(inspection.tab || inspection.tabId, context) || null;
      return root?.querySelector?.('.svgbox') || null;
    }catch(_err){
      return null;
    }
  }

  function scheduleGraphSizingApply(context, payload, operation = null){
    if(!payload || !Shared.graphSizing || typeof Shared.graphSizing.applyPayloadSizingForType !== 'function'){
      return;
    }
    if(payload?.type && String(payload.type) !== String(context)){
      debug('scheduleGraphSizingApply.skipped', {
        context,
        operationId: operation?.id || null,
        reason: 'payload-type-mismatch',
        payloadType: String(payload.type)
      });
      return;
    }
    const scoped = !!operation?.tabId;
    const ownerTabId = scoped ? String(operation.tabId || '').trim() : null;
    const element = scoped ? resolveGraphOpenSvgBox(context, operation) : null;
    if(scoped && !element){
      debug('scheduleGraphSizingApply.skipped', {
        context,
        operationId: operation?.id || null,
        ownerTabId,
        reason: 'owner-not-active-or-mounted'
      });
      return;
    }
    let sessionGeneration = 0;
    if(ownerTabId){
      try{
        sessionGeneration = Number(Shared.workspaceTabs?.getSessionRecord?.(ownerTabId, context)?.generation) || 0;
      }catch(_err){
        sessionGeneration = 0;
      }
    }
    try{
      Shared.graphSizing.applyPayloadSizingForType(context, payload, {
        context: `file-open-${context}`,
        tabId: ownerTabId || undefined,
        sessionGeneration,
        element: element || undefined,
        isCurrent: ownerTabId
          ? () => inspectGraphFileOwner(operation, { requireLatest: true, component: context }).ok === true
          : undefined,
        retryDelaysMs: [10, 80, 180, 320, 520]
      });
    }catch(err){
      console.error('fileIO.scheduleGraphSizingApply error', { context, err });
    }
  }

  function downloadURL(url, name){
    const doc = global.document;
    if(!doc || !doc.body){
      console.warn('fileIO.downloadURL missing document body');
      return;
    }
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function writeToHandle(handle, payload, context){
    if(!handle || typeof handle.createWritable !== 'function'){
      console.warn('fileIO.writeToHandle invalid handle', { context });
      return;
    }
    const normalized = normalizeWritablePayload(payload);
    debug('writeToHandle.start', {
      context,
      hasPayload: !!payload,
      kind: normalized.kind,
      length: normalized.length
    });
    const writable = await handle.createWritable();
    await writable.write(normalized.value);
    await writable.close();
    debug('writeToHandle.complete', { context, handleName: handle.name });
  }

  fileIO.downloadJSON = function downloadJSON(payload, name){
    const fileName = ensureName(name, 'graph.json');
    debug('downloadJSON.start', { fileName });
    try{
      const normalized = normalizeWritablePayload(payload);
      const serialized = typeof normalized.value === 'string'
        ? normalized.value
        : JSON.stringify(payload);
      const BlobCtor = global.Blob || Blob;
      const URLCtor = global.URL || URL;
      const blob = new BlobCtor([serialized], { type: 'application/json' });
      const url = URLCtor.createObjectURL(blob);
      downloadURL(url, fileName);
      global.setTimeout?.(()=>{
        URLCtor.revokeObjectURL(url);
        debug('downloadJSON.revoke', { fileName });
      }, 5000);
    }catch(err){
      console.error('fileIO.downloadJSON error', err);
    }
  };

  fileIO.downloadBlob = function downloadBlob(payload, name, mimeType){
    const fileName = ensureName(name, 'graph.graph');
    debug('downloadBlob.start', { fileName });
    try{
      const normalized = normalizeWritablePayload(payload);
      const BlobCtor = global.Blob || Blob;
      const URLCtor = global.URL || URL;
      let blob = null;
      if(normalized.kind === 'blob'){
        blob = normalized.value;
      }else{
        blob = new BlobCtor([normalized.value], { type: mimeType || normalized.mimeType || 'application/octet-stream' });
      }
      const url = URLCtor.createObjectURL(blob);
      downloadURL(url, fileName);
      global.setTimeout?.(() => {
        URLCtor.revokeObjectURL(url);
        debug('downloadBlob.revoke', { fileName });
      }, 5000);
    }catch(err){
      console.error('fileIO.downloadBlob error', err);
    }
  };

  fileIO.verifyPermission = async function verifyPermission(handle, write){
    if(!handle || (typeof handle.queryPermission !== 'function' && typeof handle.requestPermission !== 'function')){
      debug('verifyPermission.skip', { write, hasHandle: !!handle });
      return false;
    }
    const opts = write ? { mode: 'readwrite' } : {};
    try{
      if(typeof handle.queryPermission === 'function'){
        const query = await handle.queryPermission(opts);
        debug('verifyPermission.query', { write, query });
        if(query === 'granted') return true;
      }
      if(typeof handle.requestPermission === 'function'){
        if(!hasUserActivation()){
          debug('verifyPermission.requestSkippedNoActivation', { write });
          return false;
        }
        const request = await handle.requestPermission(opts);
        debug('verifyPermission.request', { write, request });
        return request === 'granted';
      }
    }catch(err){
      if(isUserActivationError(err)){
        debug('verifyPermission.activationError', { write });
        return false;
      }
      console.error('fileIO.verifyPermission error', err);
    }
    return false;
  };

  fileIO.saveGraphFile = async function saveGraphFile(options){
    const {
      context = 'graph',
      fileHandle,
      getPayload,
      payload,
      setFileHandle,
      setFileName,
      fileName,
      downloadFileName,
      fileTypes,
      mimeType,
      allowFallback = true,
      owner,
      operation: suppliedOperation
    } = options || {};
    const operation = fileIO.createGraphSaveOperation({
      context,
      owner,
      operation: suppliedOperation
    });
    const targetName = ensureName(downloadFileName || fileName, `${context}.graph`);
    debug('saveGraphFile.start', {
      context,
      hasHandle: !!fileHandle,
      targetName,
      operationId: operation.id,
      ownerTabId: operation.tabId || null
    });

    try{
      const desktop = getDesktopBridge();
      const desktopPath = fileHandle?.__desktopFilePath || '';
      if(desktop && desktopPath && typeof desktop.writeFile === 'function'){
        const data = await resolvePayloadWithGraphSizing(context, getPayload, payload, { operation });
        const dataBase64 = await payloadToBase64(data);
        await desktop.writeFile({ filePath: desktopPath, dataBase64 });
        const handle = makeDesktopHandle(desktopPath);
        ensureSetter(setFileHandle, handle, operation);
        ensureSetter(setFileName, handle?.name || targetName, operation);
        debug('saveGraphFile.desktopPath', { context, filePath: desktopPath, operationId: operation.id });
        return { status: 'saved', via: 'desktopPath', fileHandle: handle, fileName: handle?.name || targetName, filePath: desktopPath, payload: data, operation };
      }

      if(fileHandle && typeof fileHandle.createWritable === 'function'){
        const permitted = await fileIO.verifyPermission(fileHandle, true);
        debug('saveGraphFile.permission', { context, permitted, operationId: operation.id });
        if(permitted){
          const data = await resolvePayloadWithGraphSizing(context, getPayload, payload, { operation });
          const normalized = normalizeWritablePayload(data);
          debug('saveGraphFile.payloadReady', {
            context,
            payloadKind: normalized.kind,
            payloadLength: normalized.length,
            via: 'existingHandle',
            operationId: operation.id
          });
          await writeToHandle(fileHandle, data, context);
          ensureSetter(setFileHandle, fileHandle, operation);
          if(fileHandle.name) ensureSetter(setFileName, fileHandle.name, operation);
          return { status: 'saved', via: 'existingHandle', fileHandle, fileName: fileHandle.name, payload: data, operation };
        }
      }

      if(allowFallback === false){
        debug('saveGraphFile.noFallback', { context, targetName, operationId: operation.id });
        return { status: 'skipped', reason: 'no-existing-write-target', fileName: targetName, operation };
      }

      if(global.showSaveFilePicker){
        debug('saveGraphFile.deferToSaveAs', { context, operationId: operation.id });
        return fileIO.saveGraphFileAs({
          context,
          getPayload,
          payload,
          setFileHandle,
          setFileName,
          fileName: targetName,
          downloadFileName: targetName,
          fileTypes,
          mimeType,
          owner,
          operation
        });
      }

      const data = await resolvePayloadWithGraphSizing(context, getPayload, payload, { operation });
      const normalized = normalizeWritablePayload(data);
      debug('saveGraphFile.payloadReady', {
        context,
        payloadKind: normalized.kind,
        payloadLength: normalized.length,
        via: 'download',
        operationId: operation.id
      });
      debug('saveGraphFile.downloadFallback', { context, operationId: operation.id });
      if(isBinaryLike(data)){
        fileIO.downloadBlob(data, targetName, mimeType || normalized.mimeType);
      }else{
        fileIO.downloadJSON(data, targetName);
      }
      return { status: 'downloaded', via: 'download', fileName: targetName, payload: data, operation };
    }catch(err){
      if(isGraphFileOwnerError(err)){
        return graphFileOwnerFailureResult(err, operation, 'save');
      }
      throw err;
    }
  };

  fileIO.saveGraphFileAs = async function saveGraphFileAs(options){
    const {
      context = 'graph',
      getPayload,
      payload,
      setFileHandle,
      setFileName,
      fileName,
      downloadFileName,
      fileTypes,
      mimeType,
      owner,
      operation: suppliedOperation
    } = options || {};
    const operation = fileIO.createGraphSaveOperation({
      context,
      owner,
      operation: suppliedOperation
    });
    const targetName = ensureName(downloadFileName || fileName, `${context}.graph`);
    debug('saveGraphFileAs.start', {
      context,
      targetName,
      hasPicker: !!global.showSaveFilePicker,
      operationId: operation.id,
      ownerTabId: operation.tabId || null
    });
    const desktop = getDesktopBridge();

    if(desktop && typeof desktop.showSaveDialog === 'function' && typeof desktop.writeFile === 'function'){
      try{
        const result = await desktop.showSaveDialog({
          title: 'Save Graphitix workspace',
          defaultPath: targetName,
          filters: [{ name: 'Graph Files', extensions: ['graph'] }]
        });
        if(result?.canceled || !result?.filePath){
          debug('saveGraphFileAs.desktopCancelled', { context, targetName, operationId: operation.id });
          return { status: 'cancelled', via: 'desktopDialog', fileName: targetName, operation };
        }
        const data = await resolvePayloadWithGraphSizing(context, getPayload, payload, { operation });
        const dataBase64 = await payloadToBase64(data);
        await desktop.writeFile({ filePath: result.filePath, dataBase64 });
        const handle = makeDesktopHandle(result.filePath);
        ensureSetter(setFileHandle, handle, operation);
        ensureSetter(setFileName, handle?.name || targetName, operation);
        debug('saveGraphFileAs.desktopSaved', { context, filePath: result.filePath, operationId: operation.id });
        return { status: 'saved', via: 'desktopDialog', fileHandle: handle, fileName: handle?.name || targetName, filePath: result.filePath, payload: data, operation };
      }catch(err){
        if(isGraphFileOwnerError(err)){
          return graphFileOwnerFailureResult(err, operation, 'desktopDialog');
        }
        console.error('fileIO.saveGraphFileAs desktop error', { context, err });
        return { status: 'error', via: 'desktopDialog', error: err, operation };
      }
    }

    if(global.showSaveFilePicker){
      if(!hasUserActivation()){
        debug('saveGraphFileAs.skipPickerNoActivation', { context, targetName, operationId: operation.id });
      }else{
        try{
          const handle = await global.showSaveFilePicker({
            types: resolveTypes(fileTypes),
            suggestedName: targetName
          });
          const data = await resolvePayloadWithGraphSizing(context, getPayload, payload, { operation });
          const normalized = normalizeWritablePayload(data);
          debug('saveGraphFileAs.payloadReady', {
            context,
            payloadKind: normalized.kind,
            payloadLength: normalized.length,
            via: 'picker',
            operationId: operation.id
          });
          await writeToHandle(handle, data, context);
          ensureSetter(setFileHandle, handle, operation);
          if(handle?.name) ensureSetter(setFileName, handle.name, operation);
          return { status: 'saved', via: 'picker', fileHandle: handle, fileName: handle.name, payload: data, operation };
        }catch(err){
          if(err && err.name === 'AbortError'){
            debug('saveGraphFileAs.cancelled', { context, targetName, operationId: operation.id });
            return { status: 'cancelled', via: 'picker', fileName: targetName, operation };
          }
          if(isGraphFileOwnerError(err)){
            return graphFileOwnerFailureResult(err, operation, 'picker');
          }
          if(isUserActivationError(err)){
            debug('saveGraphFileAs.activationFallback', { context, targetName, operationId: operation.id });
            try{
              const data = await resolvePayloadWithGraphSizing(context, getPayload, payload, { operation });
              const normalized = normalizeWritablePayload(data);
              debug('saveGraphFileAs.payloadReady', {
                context,
                payloadKind: normalized.kind,
                payloadLength: normalized.length,
                via: 'download-activation-fallback',
                operationId: operation.id
              });
              if(isBinaryLike(data)){
                fileIO.downloadBlob(data, targetName, mimeType || normalized.mimeType);
              }else{
                fileIO.downloadJSON(data, targetName);
              }
              return { status: 'downloaded', via: 'download-activation-fallback', fileName: targetName, payload: data, operation };
            }catch(ownerErr){
              if(isGraphFileOwnerError(ownerErr)){
                return graphFileOwnerFailureResult(ownerErr, operation, 'download-activation-fallback');
              }
              throw ownerErr;
            }
          }
          console.error('fileIO.saveGraphFileAs error', { context, err });
          return { status: 'error', via: 'picker', error: err, operation };
        }
      }
    }

    try{
      const data = await resolvePayloadWithGraphSizing(context, getPayload, payload, { operation });
      const normalized = normalizeWritablePayload(data);
      debug('saveGraphFileAs.payloadReady', {
        context,
        payloadKind: normalized.kind,
        payloadLength: normalized.length,
        via: 'download',
        operationId: operation.id
      });
      debug('saveGraphFileAs.downloadFallback', { context, operationId: operation.id });
      if(isBinaryLike(data)){
        fileIO.downloadBlob(data, targetName, mimeType || normalized.mimeType);
      }else{
        fileIO.downloadJSON(data, targetName);
      }
      return { status: 'downloaded', via: 'download', fileName: targetName, payload: data, operation };
    }catch(err){
      if(isGraphFileOwnerError(err)){
        return graphFileOwnerFailureResult(err, operation, 'download');
      }
      throw err;
    }
  };

  fileIO.openGraphFilePath = async function openGraphFilePath(options){
    const {
      context = 'graph',
      filePath,
      setFileHandle,
      setFileName,
      loadFromFile,
      owner,
      operation: suppliedOperation
    } = options || {};
    const operation = fileIO.createGraphOpenOperation({ context, owner, operation: suppliedOperation });
    const desktop = getDesktopBridge();
    if(!desktop || typeof desktop.readFile !== 'function'){
      return { status: 'error', via: 'desktopFilePath', reason: 'desktop-read-unavailable', operation };
    }
    const normalizedPath = String(filePath || '').trim();
    if(!normalizedPath){
      return { status: 'error', via: 'desktopFilePath', reason: 'missing-file-path', operation };
    }
    const preReadRejection = graphOpenCompletionStatus(operation, 'desktopFilePath', { filePath: normalizedPath });
    if(preReadRejection){
      return preReadRejection;
    }
    try{
      const read = await desktop.readFile(normalizedPath);
      const postReadRejection = graphOpenCompletionStatus(operation, 'desktopFilePath', { filePath: normalizedPath });
      if(postReadRejection){
        return postReadRejection;
      }
      const fileName = getBaseName(normalizedPath, 'workspace.graph');
      const blob = base64ToBlob(read?.dataBase64 || '', 'application/zip');
      blob.name = fileName;
      const handle = makeDesktopHandle(normalizedPath);
      ensureSetter(setFileHandle, handle, operation);
      ensureSetter(setFileName, fileName, operation);
      if(typeof loadFromFile === 'function'){
        await loadFromFile(blob, operation);
      }
      const completionRejection = graphOpenCompletionStatus(operation, 'desktopFilePath', { filePath: normalizedPath });
      if(completionRejection){
        return completionRejection;
      }
      debug('openGraphFilePath.loaded', { context, fileName, filePath: normalizedPath, operationId: operation.id });
      return {
        status: 'opened',
        via: 'desktopFilePath',
        fileHandle: handle,
        file: blob,
        fileName,
        filePath: normalizedPath,
        operation
      };
    }catch(err){
      console.error('fileIO.openGraphFilePath desktop error', { context, filePath: normalizedPath, err });
      return { status: 'error', via: 'desktopFilePath', filePath: normalizedPath, error: err, operation };
    }
  };

  fileIO.openGraphFile = async function openGraphFile(options){
    const {
      context = 'graph',
      setFileHandle,
      setFileName,
      loadFromFile,
      triggerInput,
      fileTypes,
      owner,
      operation: suppliedOperation
    } = options || {};
    const operation = fileIO.createGraphOpenOperation({ context, owner, operation: suppliedOperation });
    debug('openGraphFile.start', {
      context,
      hasPicker: !!global.showOpenFilePicker,
      operationId: operation.id,
      ownerTabId: operation.tabId || null,
      component: operation.component || null
    });

    const initialRejection = graphOpenCompletionStatus(operation, 'open');
    if(initialRejection){
      return initialRejection;
    }

    const desktop = getDesktopBridge();
    if(desktop && typeof desktop.showOpenDialog === 'function' && typeof desktop.readFile === 'function'){
      try{
        const result = await desktop.showOpenDialog({
          title: 'Open file',
          properties: ['openFile'],
          filters: resolveDesktopFilters(fileTypes)
        });
        const afterDialogRejection = graphOpenCompletionStatus(operation, 'desktopDialog');
        if(afterDialogRejection){
          return afterDialogRejection;
        }
        const filePath = result?.filePaths && result.filePaths[0];
        if(result?.canceled || !filePath){
          debug('openGraphFile.desktopCancelled', { context, operationId: operation.id });
          return { status: 'cancelled', via: 'desktopDialog', operation };
        }
        const opened = await fileIO.openGraphFilePath({
          context,
          filePath,
          setFileHandle,
          setFileName,
          loadFromFile,
          owner,
          operation
        });
        return {
          ...opened,
          via: opened?.status === 'opened' ? 'desktopDialog' : (opened?.via || 'desktopDialog')
        };
      }catch(err){
        console.error('fileIO.openGraphFile desktop error', { context, err });
        return { status: 'error', via: 'desktopDialog', error: err, operation };
      }
    }

    if(global.showOpenFilePicker){
      try{
        const handles = await global.showOpenFilePicker({
          types: resolveTypes(fileTypes),
          multiple: false
        });
        const afterPickerRejection = graphOpenCompletionStatus(operation, 'picker');
        if(afterPickerRejection){
          return afterPickerRejection;
        }
        const handle = handles && handles[0];
        if(!handle){
          debug('openGraphFile.cancelled', { context, operationId: operation.id });
          return { status: 'cancelled', via: 'picker', operation };
        }

        const file = await handle.getFile();
        const afterFileRejection = graphOpenCompletionStatus(operation, 'picker');
        if(afterFileRejection){
          return afterFileRejection;
        }
        const shouldProbePayload = /\.(graph|json)$/i.test(String(file?.name || ''));
        const parsedPayload = shouldProbePayload ? await parseJsonPayloadFromBlob(file, context) : null;
        const afterProbeRejection = graphOpenCompletionStatus(operation, 'picker');
        if(afterProbeRejection){
          return afterProbeRejection;
        }

        ensureSetter(setFileHandle, handle, operation);
        if(file?.name) ensureSetter(setFileName, file.name, operation);
        if(typeof loadFromFile === 'function'){
          await loadFromFile(file, operation);
        }
        const completionRejection = graphOpenCompletionStatus(operation, 'picker');
        if(completionRejection){
          return completionRejection;
        }
        scheduleGraphSizingApply(context, parsedPayload, operation);
        return { status: 'opened', via: 'picker', fileHandle: handle, file, payload: parsedPayload, operation };
      }catch(err){
        if(err?.name === 'AbortError'){
          debug('openGraphFile.cancelled', { context, operationId: operation.id });
          return { status: 'cancelled', via: 'picker', operation };
        }
        console.error('fileIO.openGraphFile error', { context, err });
        return { status: 'error', via: 'picker', error: err, operation };
      }
    }

    if(typeof triggerInput === 'function'){
      debug('openGraphFile.triggerInput', { context, operationId: operation.id });
      try{
        triggerInput(operation);
        return { status: 'pending', via: 'input', operation };
      }catch(err){
        console.error('fileIO.openGraphFile trigger error', { context, err });
        return { status: 'error', via: 'input', error: err, operation };
      }
    }
    console.warn('fileIO.openGraphFile no picker or trigger', { context });
    return { status: 'error', via: 'none', error: new Error('No file picker or trigger available'), operation };
  };

  (function installPayloadAwareReader(){
    const Reader = global.FileReader;
    if(!Reader || Reader.prototype?.__vennPayloadPatch){
      return;
    }
    const originalReadAsText = Reader.prototype.readAsText;
    if(typeof originalReadAsText !== 'function'){
      return;
    }
    Reader.prototype.readAsText = function patchedReadAsText(blob, encoding){
      const entry = consumePayloadBlob(blob);
      if(entry){
        let serialized = '';
        try{
          const normalized = normalizeWritablePayload(entry.value);
          if(normalized.kind === 'text'){
            serialized = normalized.value;
          }else{
            serialized = '';
          }
        }catch(err){
          console.error('fileIO.payloadReader serialization error', err);
        }
        this.result = serialized;
        debug('payloadReader.apply', { length: serialized.length });
        try{
          if(typeof this.onload === 'function'){
            this.onload({ target: this });
          }
        }catch(handlerErr){
          console.error('fileIO.payloadReader onload error', handlerErr);
        }
        return;
      }
      return originalReadAsText.call(this, blob, encoding);
    };
    Object.defineProperty(Reader.prototype, '__vennPayloadPatch', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    debug('payloadReader.installed', { patched: true });
  })();

})(window);
