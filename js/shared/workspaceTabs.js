(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.workspaceTabs = Shared.workspaceTabs || {};

  function debugLog(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore debug toggle failures
    }
    if(typeof console?.debug === 'function'){
      console.debug(label, payload || {});
    }
  }

  function normalizeTabId(value){
    const text = typeof value === 'string'
      ? value.trim()
      : String(value || '').trim();
    return text || '';
  }

  function resolveSession(){
    return global.Main?.session || null;
  }

  function resolveWorkspaceState(){
    return resolveSession()?.workspaceState || null;
  }

  function resolveWorkspaceConfig(type, config){
    if(config && typeof config === 'object'){
      return config;
    }
    const registry = global.Main?.components?.registry;
    if(!registry || typeof registry !== 'object'){
      return null;
    }
    const key = String(type || '').trim();
    return key ? (registry[key] || null) : null;
  }

  function resolveTab(tabLike){
    if(tabLike && typeof tabLike === 'object' && tabLike.id != null){
      return tabLike;
    }
    const tabId = normalizeTabId(tabLike);
    if(!tabId){
      return resolveSession()?.getActiveTab?.() || null;
    }
    const tabs = resolveWorkspaceState()?.tabs;
    if(!Array.isArray(tabs)){
      return null;
    }
    return tabs.find(tab => normalizeTabId(tab?.id) === tabId) || null;
  }

  function ensureRecordShape(tab){
    if(!tab || typeof tab !== 'object'){
      return null;
    }
    if(!tab.sharedState || typeof tab.sharedState !== 'object'){
      tab.sharedState = {};
    }
    const sharedState = tab.sharedState;
    if(!sharedState.runtime || typeof sharedState.runtime !== 'object'){
      sharedState.runtime = {};
    }
    if(!sharedState.resources || typeof sharedState.resources !== 'object'){
      sharedState.resources = {};
    }
    if(!sharedState.styles || typeof sharedState.styles !== 'object'){
      sharedState.styles = {};
    }
    if(!sharedState.metadata || typeof sharedState.metadata !== 'object'){
      sharedState.metadata = {};
    }
    if(!sharedState.sessions || typeof sharedState.sessions !== 'object'){
      sharedState.sessions = {};
    }
    return sharedState;
  }

  function ensureSessionRecord(tabLike, componentKey){
    const tab = resolveTab(tabLike);
    const sharedState = ensureRecordShape(tab);
    const key = String(componentKey || '').trim() || '__default__';
    if(!sharedState){
      return null;
    }
    if(!sharedState.sessions[key] || typeof sharedState.sessions[key] !== 'object'){
      sharedState.sessions[key] = {
        componentKey: key,
        tabId: tab?.id || null,
        generation: 0,
        mounted: false,
        runtime: {},
        async: {},
        metadata: {},
        activatedAt: null,
        deactivatedAt: null
      };
    }
    const record = sharedState.sessions[key];
    if(!record.runtime || typeof record.runtime !== 'object'){
      record.runtime = {};
    }
    if(!record.async || typeof record.async !== 'object'){
      record.async = {};
    }
    if(!record.metadata || typeof record.metadata !== 'object'){
      record.metadata = {};
    }
    record.componentKey = key;
    record.tabId = tab?.id || record.tabId || null;
    if(!Number.isFinite(Number(record.generation))){
      record.generation = 0;
    }
    return record;
  }

  function readPath(source, path){
    if(!source || !path){
      return undefined;
    }
    const segments = Array.isArray(path)
      ? path
      : String(path).split('.').filter(Boolean);
    let current = source;
    for(let i = 0; i < segments.length; i += 1){
      if(!current || typeof current !== 'object'){
        return undefined;
      }
      current = current[segments[i]];
    }
    return current;
  }

  function writePath(target, path, value){
    if(!target || typeof target !== 'object' || !path){
      return false;
    }
    const segments = Array.isArray(path)
      ? path
      : String(path).split('.').filter(Boolean);
    if(!segments.length){
      return false;
    }
    let current = target;
    for(let i = 0; i < segments.length - 1; i += 1){
      const key = segments[i];
      if(!current[key] || typeof current[key] !== 'object'){
        current[key] = {};
      }
      current = current[key];
    }
    current[segments[segments.length - 1]] = value;
    return true;
  }

  function resolveFontScope(type, config){
    return String(config?.fontScope || type || '').trim() || null;
  }

  function resolveFontStylesPath(type, config){
    if(config?.fontStylesPath){
      return config.fontStylesPath;
    }
    return type === 'venn' ? 'style.fontStyles' : 'config.fontStyles';
  }

  function resolveRuntimeSnapshotKey(type, config){
    const explicit = String(config?.runtimeStateKey || '').trim();
    if(explicit){
      return explicit;
    }
    return `__workspaceTabs__:${String(type || '__default__').trim() || '__default__'}`;
  }

  function exportFontStylesForTab(type, tabId, config){
    const scope = resolveFontScope(type, config);
    if(!scope || typeof Shared.fontControls?.exportScopeStyles !== 'function'){
      return null;
    }
    const styles = Shared.fontControls.exportScopeStyles(scope, { tabId });
    return styles && typeof styles === 'object' ? styles : null;
  }

  function importFontStylesForTab(type, tabId, styles, config, options = {}){
    const scope = resolveFontScope(type, config);
    if(!scope || typeof Shared.fontControls?.importScopeStyles !== 'function'){
      return false;
    }
    Shared.fontControls.importScopeStyles(scope, styles, {
      tabId,
      prune: options.prune !== false,
      broadcast: options.broadcast !== false
    });
    return true;
  }

  function stampWorkspaceScope(element, tabId){
    if(!element?.dataset){
      return;
    }
    const target = normalizeTabId(tabId);
    if(target){
      element.dataset.workspaceTabId = target;
      element.dataset.tabId = target;
      if(Object.prototype.hasOwnProperty.call(element.dataset, 'tabToken')){
        element.dataset.tabToken = target;
      }
      if(typeof element.dataset.resizerTextLockScope === 'string'){
        element.dataset.resizerTextLockScope = element.dataset.resizerTextLockScope.replace(/workspace-\d+/g, target);
      }
    }else{
      delete element.dataset.workspaceTabId;
      delete element.dataset.tabId;
    }
  }

  function stampWorkspaceScopeDeep(element, tabId){
    stampWorkspaceScope(element, tabId);
    if(!element || typeof element.querySelectorAll !== 'function'){
      return;
    }
    const scopedNodes = element.querySelectorAll('[data-font-scope], [data-workspace-tab-id], [data-tab-id], [data-tab-token], [data-resizer-text-lock-scope], .svgbox, svg');
    for(let i = 0; i < scopedNodes.length; i += 1){
      stampWorkspaceScope(scopedNodes[i], tabId);
    }
  }

  function ensureRootTemplate(type, config){
    if(!config?.element){
      return null;
    }
    const key = String(type || config.type || '').trim();
    if(!key){
      return null;
    }
    namespace.__rootTemplates = namespace.__rootTemplates || {};
    let template = namespace.__rootTemplates[key] || null;
    const element = config.element;
    const templateHostStale = !!(
      template
      && (
        !template.host
        || template.host.isConnected === false
        || template.host.ownerDocument !== element.ownerDocument
        || (template.original && template.original !== element && template.original.isConnected === false)
      )
    );
    if(templateHostStale){
      delete namespace.__rootTemplates[key];
      template = null;
    }
    if(template?.template && template?.host){
      return template;
    }
    const host = config.instanceHost || element.parentNode || null;
    if(!host){
      return null;
    }
    const marker = element.ownerDocument?.createComment
      ? element.ownerDocument.createComment(`graphitix-${key}-workspace-root`)
      : null;
    if(marker && element.parentNode === host){
      host.insertBefore(marker, element);
    }
    template = {
      type: key,
      template: element.cloneNode(true),
      original: element,
      host,
      marker,
      activeTabId: null
    };
    namespace.__rootTemplates[key] = template;
    return template;
  }

  function detachRoot(root){
    if(root?.parentNode){
      root.parentNode.removeChild(root);
    }
  }

  function mountRootAtTemplate(root, template){
    if(!root || !template?.host){
      return false;
    }
    if(root.parentNode && root.parentNode !== template.host){
      root.parentNode.removeChild(root);
    }
    if(root.parentNode === template.host){
      return true;
    }
    if(template.marker && template.marker.parentNode === template.host){
      template.host.insertBefore(root, template.marker.nextSibling);
    }else{
      template.host.appendChild(root);
    }
    return true;
  }

  function createRootClone(tab, type, config, template){
    const source = template?.template || config?.element || null;
    if(!source || typeof source.cloneNode !== 'function'){
      return null;
    }
    const root = source.cloneNode(true);
    if(root.dataset){
      root.dataset.workspaceComponent = type;
      root.dataset.workspaceTabId = tab?.id || '';
      root.dataset.tabId = tab?.id || '';
      root.dataset.workspaceInstanceRoot = 'true';
    }
    return root;
  }

  function invokeWorkspaceHook(config, hookName, args = [], meta = {}){
    const handler = config && typeof config[hookName] === 'function'
      ? config[hookName]
      : null;
    if(!handler){
      return undefined;
    }
    try{
      return handler.apply(config, args);
    }catch(err){
      console.error('workspaceTabs hook error', {
        hookName,
        type: config?.type || null,
        reason: meta.reason || null,
        err
      });
      return undefined;
    }
  }


  namespace.ensureSessionRecord = ensureSessionRecord;
  namespace.stampWorkspaceScopeDeep = stampWorkspaceScopeDeep;

  namespace.ensureComponentInstance = function ensureComponentInstance(tabLike, componentKey, factory, meta = {}){
    const tab = resolveTab(tabLike);
    const record = ensureSessionRecord(tab, componentKey);
    if(!record || !tab){
      return null;
    }
    if(!record.instance || typeof record.instance !== 'object'){
      record.instance = {};
    }
    if(!record.instance.value && typeof factory === 'function'){
      try{
        record.instance.value = factory({
          tab,
          tabId: tab.id,
          componentKey: String(componentKey || '').trim() || '__default__',
          root: record.dom?.root || null,
          reason: meta.reason || 'ensure-component-instance'
        }) || null;
      }catch(err){
        console.error('workspaceTabs component instance factory error', {
          tabId: tab.id,
          componentKey,
          err
        });
        record.instance.value = null;
      }
    }
    debugLog('Debug: workspaceTabs component instance ensured', {
      tabId: tab.id,
      componentKey: String(componentKey || '').trim() || '__default__',
      hasInstance: !!record.instance.value,
      reason: meta.reason || 'ensure-component-instance'
    });
    return record.instance.value || null;
  };

  namespace.getComponentInstance = function getComponentInstance(tabLike, componentKey){
    return namespace.getSessionRecord(tabLike, componentKey)?.instance?.value || null;
  };

  namespace.ensureMountedRoot = function ensureMountedRoot(tabLike, config, meta = {}){
    const tab = resolveTab(tabLike);
    const type = String(tab?.type || config?.type || '').trim();
    if(!tab || !type || !config?.element){
      return config?.element || null;
    }
    if(config.perTabDomInstances !== true){
      stampWorkspaceScopeDeep(config.element, tab.id);
      return config.element;
    }
    const template = ensureRootTemplate(type, config);
    if(!template){
      stampWorkspaceScopeDeep(config.element, tab.id);
      return config.element;
    }
    const record = ensureSessionRecord(tab, type);
    if(!record.dom || typeof record.dom !== 'object'){
      record.dom = {};
    }
    if(!record.dom.root){
      record.dom.root = createRootClone(tab, type, config, template);
      record.dom.createdAt = Date.now();
    }
    const activeRoot = template.activeTabId
      ? namespace.getSessionRecord(template.activeTabId, type)?.dom?.root
      : null;
    if(activeRoot && activeRoot !== record.dom.root){
      detachRoot(activeRoot);
    }
    if(template.original && template.original !== record.dom.root){
      detachRoot(template.original);
    }
    // Keep exactly one connected workspace root per component type to avoid duplicate IDs
    // leaking through document-level queries during tab switches.
    if(template.host && typeof template.host.querySelectorAll === 'function'){
      const duplicateRoots = template.host.querySelectorAll(`[data-workspace-component="${type}"][data-workspace-instance-root="true"]`);
      for(let i = 0; i < duplicateRoots.length; i += 1){
        const node = duplicateRoots[i];
        if(node !== record.dom.root){
          detachRoot(node);
        }
      }
      const rootId = String(config.element?.id || '').trim();
      if(rootId){
        const duplicateById = template.host.querySelectorAll(`#${rootId}`);
        for(let i = 0; i < duplicateById.length; i += 1){
          const node = duplicateById[i];
          if(node !== record.dom.root){
            detachRoot(node);
          }
        }
      }
    }
    mountRootAtTemplate(record.dom.root, template);
    template.activeTabId = tab.id;
    stampWorkspaceScopeDeep(record.dom.root, tab.id);
    debugLog('Debug: workspaceTabs mounted per-tab root', {
      tabId: tab.id,
      type,
      reason: meta.reason || 'mount-root'
    });
    return record.dom.root || config.element;
  };

  namespace.getMountedRoot = function getMountedRoot(tabLike, componentKey){
    const tab = resolveTab(tabLike);
    const key = String(componentKey || tab?.type || '').trim();
    return namespace.getSessionRecord(tab, key)?.dom?.root || null;
  };

  namespace.resolveComponentRoot = function resolveComponentRoot(config = {}){
    const componentKey = String(config.componentKey || config.type || '').trim();
    const mounted = namespace.getMountedRoot(config.tabLike || config.tabId || null, componentKey);
    if(mounted){
      return mounted;
    }
    const currentRoot = config.currentRoot || null;
    if(currentRoot && currentRoot.isConnected){
      return currentRoot;
    }
    if(config.staticRootId && global.document?.getElementById){
      return global.document.getElementById(config.staticRootId) || null;
    }
    return null;
  };

  namespace.queryRoot = function queryRoot(tabLike, componentKey, selector){
    const root = namespace.getMountedRoot(tabLike, componentKey);
    if(root && selector && typeof root.querySelector === 'function'){
      return root.querySelector(selector);
    }
    return null;
  };

  namespace.ensureActiveDomBindings = function ensureActiveDomBindings(config = {}){
    const componentKey = String(config.componentKey || config.type || '').trim() || '__default__';
    const tab = resolveTab(config.tabLike || config.tabId || null) || resolveSession()?.getActiveTab?.() || null;
    const mountedRoot = namespace.getMountedRoot(tab, componentKey) || null;
    const currentRoot = typeof config.getCurrentRoot === 'function'
      ? (config.getCurrentRoot() || null)
      : (config.currentRoot || null);
    const sentinelSelector = typeof config.sentinelSelector === 'string' ? config.sentinelSelector.trim() : '';
    const currentSentinel = typeof config.getCurrentSentinel === 'function'
      ? (config.getCurrentSentinel() || null)
      : (config.currentSentinel || null);
    const mountedSentinel = sentinelSelector && mountedRoot && typeof mountedRoot.querySelector === 'function'
      ? (mountedRoot.querySelector(sentinelSelector) || null)
      : null;
    const rootMismatch = !!mountedRoot && !!currentRoot && mountedRoot !== currentRoot;
    const sentinelMismatch = !!mountedSentinel && !!currentSentinel && mountedSentinel !== currentSentinel;
    const missingCurrentRoot = !!mountedRoot && !currentRoot;
    const missingCurrentSentinel = !!sentinelSelector && !!mountedSentinel && !currentSentinel;
    const requiresRebind = rootMismatch || sentinelMismatch || missingCurrentRoot || missingCurrentSentinel;
    let rebound = false;
    if(requiresRebind && typeof config.rebind === 'function'){
      try{
        config.rebind({
          tab,
          tabId: tab?.id || null,
          componentKey,
          root: mountedRoot,
          currentRoot,
          sentinelSelector: sentinelSelector || null,
          currentSentinel,
          mountedSentinel
        });
        rebound = true;
      }catch(err){
        console.error('workspaceTabs ensureActiveDomBindings rebind error', {
          componentKey,
          tabId: tab?.id || null,
          err
        });
      }
    }
    if(requiresRebind){
      debugLog('Debug: workspaceTabs dom binding check', {
        componentKey,
        tabId: tab?.id || null,
        rootMismatch,
        sentinelMismatch,
        missingCurrentRoot,
        missingCurrentSentinel,
        rebound
      });
    }
    return {
      tab,
      root: mountedRoot,
      currentRoot,
      currentSentinel,
      mountedSentinel,
      rootMismatch,
      sentinelMismatch,
      missingCurrentRoot,
      missingCurrentSentinel,
      requiresRebind,
      rebound
    };
  };

  namespace.getSessionRecord = function getSessionRecord(tabLike, componentKey){
    const tab = resolveTab(tabLike);
    const sharedState = ensureRecordShape(tab);
    const key = String(componentKey || '').trim() || '__default__';
    return sharedState?.sessions?.[key] || null;
  };

  namespace.activateSession = function activateSession(tabLike, componentKey, meta = {}){
    const tab = resolveTab(tabLike);
    const record = ensureSessionRecord(tab, componentKey);
    if(!record || !tab){
      return null;
    }
    record.generation = (Number(record.generation) || 0) + 1;
    record.mounted = true;
    record.activatedAt = Date.now();
    record.metadata.lastReason = meta.reason || 'activate-session';
    const componentKeyText = String(componentKey || '').trim() || '__default__';
    namespace.__activeSessions = namespace.__activeSessions || {};
    namespace.__activeSessions[componentKeyText] = {
      tabId: tab.id,
      generation: record.generation,
      activatedAt: record.activatedAt,
      reason: record.metadata.lastReason
    };
    debugLog('Debug: workspaceTabs session activated', {
      tabId: tab.id,
      componentKey: componentKeyText,
      generation: record.generation,
      reason: record.metadata.lastReason
    });
    return record;
  };

  namespace.ensureActiveSession = function ensureActiveSession(tabLike, componentKey, meta = {}){
    const tab = resolveTab(tabLike);
    const componentKeyText = String(componentKey || '').trim() || '__default__';
    if(!tab){
      return null;
    }
    const active = namespace.__activeSessions?.[componentKeyText] || null;
    if(active && String(active.tabId || '') === String(tab.id || '')){
      const record = ensureSessionRecord(tab, componentKeyText);
      if(record){
        record.mounted = true;
        record.metadata.lastReason = meta.reason || record.metadata.lastReason || 'ensure-active-session';
        debugLog('Debug: workspaceTabs active session reused', {
          tabId: tab.id,
          componentKey: componentKeyText,
          generation: record.generation,
          reason: record.metadata.lastReason
        });
      }
      return record;
    }
    return namespace.activateSession(tab, componentKeyText, meta);
  };

  namespace.deactivateSession = function deactivateSession(tabLike, componentKey, meta = {}){
    const tab = resolveTab(tabLike);
    const record = ensureSessionRecord(tab, componentKey);
    const componentKeyText = String(componentKey || '').trim() || '__default__';
    if(!record || !tab){
      return null;
    }
    record.mounted = false;
    record.deactivatedAt = Date.now();
    record.metadata.lastReason = meta.reason || 'deactivate-session';
    if(namespace.__activeSessions && namespace.__activeSessions[componentKeyText]?.tabId === tab.id){
      delete namespace.__activeSessions[componentKeyText];
    }
    debugLog('Debug: workspaceTabs session deactivated', {
      tabId: tab.id,
      componentKey: componentKeyText,
      generation: record.generation,
      reason: record.metadata.lastReason
    });
    return record;
  };

  namespace.isSessionCurrent = function isSessionCurrent(componentKey, tabId, generation){
    const componentKeyText = String(componentKey || '').trim() || '__default__';
    const active = namespace.__activeSessions?.[componentKeyText] || null;
    if(!active){
      return false;
    }
    if(tabId && String(active.tabId || '') !== String(tabId || '')){
      return false;
    }
    if(Number.isFinite(Number(generation)) && Number(active.generation) !== Number(generation)){
      return false;
    }
    return true;
  };

  function findWorkspaceTabById(tabId){
    const id = normalizeTabId(tabId || '');
    if(!id){
      return null;
    }
    try{
      const session = resolveSession();
      const tabs = Array.isArray(session?.workspaceState?.tabs) ? session.workspaceState.tabs : [];
      return tabs.find(tab => tab && String(tab.id || '') === id) || null;
    }catch(err){
      return null;
    }
  }

  namespace.buildSessionMeta = function buildSessionMeta(componentKey, options = {}){
    const componentKeyText = String(componentKey || options?.type || options?.componentType || '').trim() || '__default__';
    const active = namespace.getActiveSessionInfo(componentKeyText) || null;
    const explicitTabId = normalizeTabId(options?.tabId || options?.workspaceTabId || options?.activeTabId || '');
    const fallbackTab = resolveSession()?.getActiveTab?.() || null;
    const tabId = explicitTabId || active?.tabId || fallbackTab?.id || null;
    const tab = findWorkspaceTabById(tabId) || fallbackTab || null;
    const explicitGeneration = Number(options?.sessionGeneration ?? options?.generation);
    return {
      tabId,
      sessionGeneration: Number.isFinite(explicitGeneration) && explicitGeneration > 0
        ? explicitGeneration
        : (Number(active?.generation) || 0),
      componentKey: componentKeyText,
      payloadSignature: options?.payloadSignature ?? tab?.payloadSignature ?? null,
      layoutSignature: options?.layoutSignature ?? tab?.layoutSignature ?? null,
      requirePayloadSignature: options?.requirePayloadSignature === true,
      requireLayoutSignature: options?.requireLayoutSignature === true
    };
  };

  namespace.isSessionMetaCurrent = function isSessionMetaCurrent(componentKey, meta){
    if(!meta || typeof meta !== 'object'){
      return true;
    }
    const componentKeyText = String(componentKey || meta.componentKey || '').trim() || '__default__';
    const generation = Number(meta.sessionGeneration ?? meta.generation);
    if(!Number.isFinite(generation) || generation <= 0){
      return true;
    }
    const sessionCurrent = !!namespace.isSessionCurrent(componentKeyText, meta.tabId || null, generation);
    if(!sessionCurrent){
      return false;
    }
    const tab = findWorkspaceTabById(meta.tabId || null);
    if(meta.requirePayloadSignature === true && meta.payloadSignature != null && tab && tab.payloadSignature !== meta.payloadSignature){
      debugLog('Debug: workspaceTabs session meta rejected by payload signature', {
        componentKey: componentKeyText,
        tabId: meta.tabId || null,
        expected: meta.payloadSignature,
        current: tab.payloadSignature || null
      });
      return false;
    }
    if(meta.requireLayoutSignature === true && meta.layoutSignature != null && tab && tab.layoutSignature !== meta.layoutSignature){
      debugLog('Debug: workspaceTabs session meta rejected by layout signature', {
        componentKey: componentKeyText,
        tabId: meta.tabId || null,
        expected: meta.layoutSignature,
        current: tab.layoutSignature || null
      });
      return false;
    }
    return true;
  };

  namespace.createTabScopedScheduler = function createTabScopedScheduler(config = {}){
    const componentKey = String(config.componentKey || config.type || '').trim() || '__default__';
    const debugLabel = String(config.debugLabel || componentKey || 'workspace').trim();
    let scheduleRaw = typeof config.scheduleRaw === 'function' ? config.scheduleRaw : () => {};
    const onStale = typeof config.onStale === 'function' ? config.onStale : null;

    const schedule = function scheduleTabScoped(options = {}){
      const nextOptions = options && typeof options === 'object' ? options : {};
      const meta = nextOptions.__workspaceSessionMeta || namespace.buildSessionMeta(componentKey, nextOptions);
      if(!namespace.isSessionMetaCurrent(componentKey, meta)){
        debugLog(`Debug: ${debugLabel} tab-scoped schedule skipped`, {
          tabId: meta?.tabId || null,
          sessionGeneration: meta?.sessionGeneration || 0,
          reason: nextOptions.reason || null
        });
        try{
          onStale?.(nextOptions, meta);
        }catch(err){
          console.error('workspaceTabs tab-scoped stale handler error', {
            componentKey,
            err
          });
        }
        return false;
      }
      const guardedOptions = {
        ...nextOptions,
        tabId: nextOptions.tabId || meta.tabId || null,
        sessionGeneration: nextOptions.sessionGeneration || meta.sessionGeneration || 0,
        __workspaceSessionMeta: meta
      };
      const suppressMeta = {
        ...guardedOptions,
        componentKey,
        type: componentKey,
        reason: guardedOptions.reason || guardedOptions.source || `${componentKey}-tab-scoped-schedule`,
        source: guardedOptions.source || 'workspaceTabs-scheduler'
      };
      if(global.Shared?.componentLifecycle?.shouldSuppressDraw?.(componentKey, suppressMeta)){
        debugLog(`Debug: ${debugLabel} tab-scoped schedule suppressed by lifecycle`, {
          tabId: guardedOptions.tabId || null,
          reason: suppressMeta.reason || null
        });
        global.Shared.componentLifecycle.emitLifecycleEvent?.({
          componentKey,
          tabId: guardedOptions.tabId || null,
          action: 'draw-suppressed',
          reason: suppressMeta.reason,
          details: { source: 'workspaceTabs-scheduler' }
        });
        return false;
      }
      scheduleRaw.call(this, guardedOptions);
      return true;
    };

    schedule.setScheduleRaw = function setScheduleRaw(fn){
      scheduleRaw = typeof fn === 'function' ? fn : () => {};
    };
    schedule.buildMeta = options => namespace.buildSessionMeta(componentKey, options || {});
    schedule.isCurrent = meta => namespace.isSessionMetaCurrent(componentKey, meta);
    schedule.getScheduleRaw = () => scheduleRaw;
    return schedule;
  };

  namespace.getActiveSessionInfo = function getActiveSessionInfo(componentKey){
    const componentKeyText = String(componentKey || '').trim() || '__default__';
    return namespace.__activeSessions?.[componentKeyText] || null;
  };

  namespace.getSessionRuntime = function getSessionRuntime(tabLike, componentKey){
    return ensureSessionRecord(tabLike, componentKey)?.runtime || null;
  };

  namespace.replaceSessionRuntime = function replaceSessionRuntime(tabLike, componentKey, runtime, meta = {}){
    const record = ensureSessionRecord(tabLike, componentKey);
    if(!record){
      return null;
    }
    record.runtime = runtime && typeof runtime === 'object' ? runtime : {};
    debugLog('Debug: workspaceTabs session runtime replaced', {
      tabId: record.tabId || null,
      componentKey: String(componentKey || '').trim() || '__default__',
      reason: meta.reason || 'replace-session-runtime'
    });
    return record.runtime;
  };

  namespace.resolveTab = resolveTab;

  namespace.ensureTabState = function ensureTabState(tabLike){
    const tab = resolveTab(tabLike);
    if(!tab){
      return null;
    }
    return ensureRecordShape(tab);
  };

  namespace.ensureRuntimeBucket = function ensureRuntimeBucket(tabLike, componentKey){
    const sharedState = namespace.ensureTabState(tabLike);
    const key = String(componentKey || '').trim() || '__default__';
    if(!sharedState){
      return null;
    }
    if(!sharedState.runtime[key] || typeof sharedState.runtime[key] !== 'object'){
      sharedState.runtime[key] = {};
    }
    return sharedState.runtime[key];
  };

  namespace.getRuntimeSnapshot = function getRuntimeSnapshot(tabLike, componentKey){
    const sharedState = namespace.ensureTabState(tabLike);
    const key = String(componentKey || '').trim() || '__default__';
    return sharedState?.runtime?.[key] || null;
  };

  namespace.setRuntimeSnapshot = function setRuntimeSnapshot(tabLike, componentKey, snapshot, meta = {}){
    const sharedState = namespace.ensureTabState(tabLike);
    const key = String(componentKey || '').trim() || '__default__';
    if(!sharedState){
      return null;
    }
    sharedState.runtime[key] = snapshot && typeof snapshot === 'object' ? snapshot : {};
    debugLog('Debug: workspaceTabs runtime snapshot stored', {
      tabId: resolveTab(tabLike)?.id || null,
      componentKey: key,
      reason: meta.reason || 'set-runtime-snapshot'
    });
    return sharedState.runtime[key];
  };

  namespace.clearRuntimeSnapshot = function clearRuntimeSnapshot(tabLike, componentKey, meta = {}){
    const sharedState = namespace.ensureTabState(tabLike);
    const key = String(componentKey || '').trim() || '__default__';
    if(!sharedState?.runtime || !Object.prototype.hasOwnProperty.call(sharedState.runtime, key)){
      return false;
    }
    delete sharedState.runtime[key];
    debugLog('Debug: workspaceTabs runtime snapshot cleared', {
      tabId: resolveTab(tabLike)?.id || null,
      componentKey: key,
      reason: meta.reason || 'clear-runtime-snapshot'
    });
    return true;
  };

  namespace.captureRuntimeState = function captureRuntimeState(tabLike, type, config, meta = {}){
    const tab = resolveTab(tabLike);
    const resolvedType = String(type || tab?.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, config);
    if(!tab || !resolvedType || !resolvedConfig){
      return null;
    }
    const snapshotKey = resolveRuntimeSnapshotKey(resolvedType, resolvedConfig);
    const snapshot = invokeWorkspaceHook(resolvedConfig, 'captureRuntimeState', [{
      tabId: tab.id,
      type: resolvedType,
      reason: meta.reason || 'capture-runtime-state'
    }], meta);
    if(snapshot === undefined){
      return namespace.getRuntimeSnapshot(tab, snapshotKey);
    }
    if(snapshot === null){
      namespace.clearRuntimeSnapshot(tab, snapshotKey, {
        reason: meta.reason || 'capture-runtime-state'
      });
      return null;
    }
    namespace.setRuntimeSnapshot(tab, snapshotKey, snapshot, {
      reason: meta.reason || 'capture-runtime-state'
    });
    return snapshot;
  };

  namespace.applyRuntimeState = function applyRuntimeState(tabLike, type, config, meta = {}){
    const tab = resolveTab(tabLike);
    const resolvedType = String(type || tab?.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, config);
    if(!tab || !resolvedType || !resolvedConfig){
      return false;
    }
    const snapshotKey = resolveRuntimeSnapshotKey(resolvedType, resolvedConfig);
    const snapshot = namespace.getRuntimeSnapshot(tab, snapshotKey) || null;
    invokeWorkspaceHook(resolvedConfig, 'applyRuntimeState', [snapshot, {
      tabId: tab.id,
      type: resolvedType,
      reason: meta.reason || 'apply-runtime-state'
    }], meta);
    debugLog('Debug: workspaceTabs runtime snapshot applied', {
      tabId: tab.id,
      type: resolvedType,
      hasSnapshot: !!snapshot,
      reason: meta.reason || 'apply-runtime-state'
    });
    return true;
  };

  namespace.captureSharedPayloadState = function captureSharedPayloadState(tabLike, type, payload, config, meta = {}){
    const tab = resolveTab(tabLike);
    if(!tab || !payload || typeof payload !== 'object'){
      return payload;
    }
    const sharedState = ensureRecordShape(tab);
    const fontStyles = exportFontStylesForTab(type, tab.id, config);
    if(fontStyles){
      sharedState.styles[type] = sharedState.styles[type] || {};
      sharedState.styles[type].fontStyles = fontStyles;
      writePath(payload, resolveFontStylesPath(type, config), fontStyles);
    }
    debugLog('Debug: workspaceTabs shared payload state captured', {
      tabId: tab.id,
      type: type || null,
      hasFontStyles: !!fontStyles,
      reason: meta.reason || 'capture-shared-payload'
    });
    return payload;
  };

  namespace.applySharedPayloadState = function applySharedPayloadState(tabLike, type, payload, config, meta = {}){
    const tab = resolveTab(tabLike);
    if(!tab){
      return false;
    }
    const sharedState = ensureRecordShape(tab);
    const stylesFromPayload = readPath(payload, resolveFontStylesPath(type, config));
    const fontStyles = (stylesFromPayload && typeof stylesFromPayload === 'object')
      ? stylesFromPayload
      : (sharedState.styles?.[type]?.fontStyles || null);
    if(fontStyles){
      sharedState.styles[type] = sharedState.styles[type] || {};
      sharedState.styles[type].fontStyles = fontStyles;
      importFontStylesForTab(type, tab.id, fontStyles, config, { prune: true, broadcast: true });
    }
    debugLog('Debug: workspaceTabs shared payload state applied', {
      tabId: tab.id,
      type: type || null,
      hasFontStyles: !!fontStyles,
      reason: meta.reason || 'apply-shared-payload'
    });
    return true;
  };

  namespace.activateWorkspace = function activateWorkspace(tabLike, config, meta = {}){
    const tab = resolveTab(tabLike);
    const resolvedType = String(tab?.type || config?.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, config);
    if(!tab){
      return null;
    }
    const sharedState = ensureRecordShape(tab);
    const sessionRecord = namespace.ensureActiveSession(tab, resolvedType, {
      reason: meta.reason || 'activate-workspace'
    });
    sharedState.metadata.active = true;
    sharedState.metadata.lastActivatedAt = Date.now();
    sharedState.metadata.activeSessionGeneration = sessionRecord?.generation || 0;
    const activeRoot = namespace.ensureMountedRoot(tab, resolvedConfig || config, {
      reason: meta.reason || 'activate-workspace'
    });
    if(activeRoot && resolvedConfig && resolvedConfig.perTabDomInstances === true){
      resolvedConfig.activeElement = activeRoot;
    }
    stampWorkspaceScopeDeep(activeRoot || config?.element || null, tab.id);
    namespace.applyRuntimeState(tab, resolvedType, resolvedConfig, {
      reason: meta.reason || 'activate-workspace'
    });
    invokeWorkspaceHook(resolvedConfig, 'activateTab', [tab, {
      reason: meta.reason || 'activate-workspace',
      sessionGeneration: sessionRecord?.generation || 0,
      sessionRecord: sessionRecord || null
    }], meta);
    debugLog('Debug: workspaceTabs activated workspace', {
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'activate-workspace'
    });
    return sharedState;
  };

  namespace.deactivateWorkspace = function deactivateWorkspace(tabLike, config, meta = {}){
    const tab = resolveTab(tabLike);
    const resolvedType = String(tab?.type || config?.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, config);
    if(!tab){
      return false;
    }
    const sharedState = ensureRecordShape(tab);
    sharedState.metadata.active = false;
    sharedState.metadata.lastDeactivatedAt = Date.now();
    try{
      const capturedUiState = global.Main?.session?.captureWorkspaceUiState?.(tab) || null;
      if(capturedUiState && typeof capturedUiState === 'object'){
        tab.uiState = capturedUiState;
        debugLog('Debug: workspaceTabs deactivation uiState captured', {
          tabId: tab.id,
          type: resolvedType || null,
          reason: meta.reason || 'deactivate-workspace'
        });
      }
    }catch(err){
      console.error('workspaceTabs deactivate uiState capture error', {
        tabId: tab.id,
        type: resolvedType || null,
        err
      });
    }
    const sessionRecord = namespace.deactivateSession(tab, resolvedType, {
      reason: meta.reason || 'deactivate-workspace'
    });
    invokeWorkspaceHook(resolvedConfig, 'deactivateTab', [tab, {
      reason: meta.reason || 'deactivate-workspace',
      sessionGeneration: sessionRecord?.generation || 0,
      sessionRecord: sessionRecord || null
    }], meta);
    namespace.captureRuntimeState(tab, resolvedType, resolvedConfig, {
      reason: meta.reason || 'deactivate-workspace'
    });
    if(resolvedConfig?.perTabDomInstances === true){
      const root = namespace.getMountedRoot(tab, resolvedType);
      detachRoot(root);
    }
    debugLog('Debug: workspaceTabs deactivated workspace', {
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'deactivate-workspace'
    });
    return true;
  };

  namespace.disposeTab = function disposeTab(tabLike, meta = {}){
    const tab = resolveTab(tabLike);
    const resolvedType = String(tab?.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, null);
    if(!tab){
      return false;
    }
    invokeWorkspaceHook(resolvedConfig, 'disposeTab', [tab, {
      reason: meta.reason || 'dispose-tab'
    }], meta);
    try{
      global.Shared?.hot?.disposeTab?.(tab, {
        type: resolvedType || null,
        reason: meta.reason || 'dispose-tab'
      });
    }catch(err){
      console.error('workspaceTabs hot dispose error', {
        tabId: tab.id,
        type: resolvedType || null,
        err
      });
    }
    const record = namespace.getSessionRecord(tab, resolvedType);
    detachRoot(record?.dom?.root || null);
    delete tab.sharedState;
    debugLog('Debug: workspaceTabs disposed tab shared state', {
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'dispose-tab'
    });
    return true;
  };
})(window);
