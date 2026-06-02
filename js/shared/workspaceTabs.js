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

  function hasExplicitTabLike(tabLike){
    if(tabLike && typeof tabLike === 'object'){
      return !!normalizeTabId(tabLike.id);
    }
    return !!normalizeTabId(tabLike);
  }

  function isOwnedRuntimeStrict(meta = {}){
    if(meta?.strictRuntimeOwner === true || namespace.__strictOwnedRuntime === true){
      return true;
    }
    try{
      if(global.Shared?.componentLifecycle?.__strictRuntimeOwnership === true){
        return true;
      }
    }catch(_err){}
    try{
      if(typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test'){
        return meta?.allowMissingTabId !== true;
      }
    }catch(_err){}
    return false;
  }

  function reportOwnedRuntimeViolation(message, payload = {}, meta = {}){
    if(isOwnedRuntimeStrict(meta)){
      throw new Error(`${message}: ${JSON.stringify(payload)}`);
    }
    debugLog(message, payload);
    return null;
  }

  function isStrictTabOwnership(meta = {}){
    if(meta?.strictTabOwnership === true || meta?.strictLifecycleOwnership === true || meta?.strictRuntimeOwner === true){
      return true;
    }
    try{
      if(global.Shared?.componentLifecycle?.__strictRuntimeOwnership === true){
        return true;
      }
    }catch(_err){}
    try{
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        return meta?.allowMissingTabId !== true;
      }
    }catch(_err){}
    try{
      if(typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test'){
        return meta?.allowMissingTabId !== true;
      }
    }catch(_err){}
    return false;
  }

  function reportTabOwnershipViolation(message, payload = {}, meta = {}){
    if(isStrictTabOwnership(meta)){
      throw new Error(`${message}: ${JSON.stringify(payload)}`);
    }
    debugLog(message, payload);
    return null;
  }

  function resolveExplicitTab(tabLike, meta = {}, action = 'workspace-tab'){
    const candidate = hasExplicitTabLike(tabLike)
      ? tabLike
      : (hasExplicitTabLike(meta?.tab) ? meta.tab : (hasExplicitTabLike(meta?.tabId) ? meta.tabId : meta?.workspaceTabId));
    if(!hasExplicitTabLike(candidate)){
      reportTabOwnershipViolation('Debug: workspaceTabs lifecycle path requires explicit tab', {
        componentKey: String(meta?.componentKey || meta?.type || '').trim() || null,
        action,
        reason: meta?.reason || action
      }, meta);
      return { tab: null, tabId: '' };
    }
    const tab = resolveTab(candidate);
    const tabId = normalizeTabId(tab?.id || (candidate && typeof candidate === 'object' ? candidate.id : candidate));
    return { tab, tabId };
  }

  function resolveExplicitOwnedRuntimeTab(tabLike, meta = {}){
    const candidate = hasExplicitTabLike(tabLike)
      ? tabLike
      : (hasExplicitTabLike(meta?.tab) ? meta.tab : (hasExplicitTabLike(meta?.tabId) ? meta.tabId : meta?.workspaceTabId));
    if(!hasExplicitTabLike(candidate)){
      return { tab: null, tabId: '' };
    }
    const tab = resolveTab(candidate);
    const tabId = normalizeTabId(tab?.id || (candidate && typeof candidate === 'object' ? candidate.id : candidate));
    return { tab, tabId };
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

  // Permissive resolver for UI/DOM boundary helpers only. Lifecycle, runtime,
  // cache, and async paths must use resolveExplicitTab() so a missing tab id
  // cannot silently bind state to whatever tab happens to be active.
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

  function ensureSessionRecord(tabLike, componentKey, meta = {}){
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey }, meta.reason || 'ensure-session-record');
    const tab = resolved.tab;
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
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey }, meta.reason || 'ensure-component-instance');
    const tab = resolved.tab;
    const record = ensureSessionRecord(tab || resolved.tabId, componentKey, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'ensure-component-instance' });
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

  namespace.getComponentInstance = function getComponentInstance(tabLike, componentKey, meta = {}){
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey }, meta.reason || 'get-component-instance');
    if(!resolved.tabId){
      return null;
    }
    return namespace.getSessionRecord(resolved.tab || resolved.tabId, componentKey)?.instance?.value || null;
  };

  namespace.ensureMountedRoot = function ensureMountedRoot(tabLike, config, meta = {}){
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: config?.type || meta.type || null }, meta.reason || 'ensure-mounted-root');
    const tab = resolved.tab;
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
    const record = ensureSessionRecord(tab, type, { ...(meta || {}), tabId: tab.id, reason: meta.reason || 'ensure-mounted-root' });
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
    const candidate = hasExplicitTabLike(tabLike)
      ? tabLike
      : (tab || resolveSession()?.getActiveTab?.() || null);
    if(!candidate){
      return null;
    }
    return namespace.getSessionRecord(candidate, key, {
      allowMissingTabId: true,
      strictTabOwnership: false,
      uiBoundary: true,
      reason: 'get-mounted-root'
    })?.dom?.root || null;
  };

  namespace.resolveTabScopedRoot = function resolveTabScopedRoot(componentKey, tabLike, options = {}){
    const key = String(componentKey || '').trim();
    if(!key){
      return null;
    }
    const tab = resolveTab(tabLike || null)
      || ((!tabLike || tabLike === null || tabLike === undefined) ? resolveSession()?.getActiveTab?.() || null : null);
    const mounted = namespace.getMountedRoot(tab || tabLike || null, key);
    if(mounted){
      return mounted;
    }
    const sessionRoot = namespace.getSessionRecord(tab || tabLike || null, key, {
      allowMissingTabId: true,
      strictTabOwnership: false,
      uiBoundary: true,
      reason: 'resolve-tab-scoped-root'
    })?.dom?.root || null;
    if(sessionRoot){
      return sessionRoot;
    }
    if(options.allowPageFallback === true && options.pageId && global.document?.getElementById){
      return global.document.getElementById(options.pageId) || null;
    }
    return null;
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

  namespace.getSessionRecord = function getSessionRecord(tabLike, componentKey, meta = {}){
    const key = String(componentKey || meta?.componentKey || meta?.type || '').trim() || '__default__';
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: key }, meta.reason || 'get-session-record');
    const sharedState = ensureRecordShape(resolved.tab);
    return sharedState?.sessions?.[key] || null;
  };

  namespace.activateSession = function activateSession(tabLike, componentKey, meta = {}){
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey }, meta.reason || 'activate-session');
    const tab = resolved.tab;
    const record = ensureSessionRecord(tab || resolved.tabId, componentKey, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'activate-session' });
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
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey }, meta.reason || 'ensure-active-session');
    const tab = resolved.tab;
    const componentKeyText = String(componentKey || '').trim() || '__default__';
    if(!tab){
      return null;
    }
    const active = namespace.__activeSessions?.[componentKeyText] || null;
    if(active && String(active.tabId || '') === String(tab.id || '')){
      const record = ensureSessionRecord(tab || resolved.tabId, componentKeyText, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'ensure-active-session' });
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
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey }, meta.reason || 'deactivate-session');
    const tab = resolved.tab;
    const record = ensureSessionRecord(tab || resolved.tabId, componentKey, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'deactivate-session' });
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

  function readSessionGenerationForTab(tabLike, componentKey){
    const key = String(componentKey || '').trim() || '__default__';
    const tab = (tabLike && typeof tabLike === 'object')
      ? tabLike
      : findWorkspaceTabById(tabLike);
    if(!tab || typeof tab !== 'object'){
      return 0;
    }
    const generation = Number(tab?.sharedState?.sessions?.[key]?.generation);
    return Number.isFinite(generation) && generation > 0 ? generation : 0;
  }

  namespace.buildSessionMeta = function buildSessionMeta(componentKey, options = {}){
    const componentKeyText = String(componentKey || options?.type || options?.componentType || '').trim() || '__default__';
    const active = namespace.getActiveSessionInfo(componentKeyText) || null;
    const explicitTabId = normalizeTabId(options?.tabId || options?.workspaceTabId || options?.activeTabId || options?.tab?.id || '');
    const allowActiveFallback = options?.allowActiveTabFallback === true || options?.uiBoundary === true;
    const fallbackTab = allowActiveFallback ? (resolveSession()?.getActiveTab?.() || null) : null;
    const tabId = explicitTabId || (allowActiveFallback ? (active?.tabId || fallbackTab?.id || null) : null);
    const tab = findWorkspaceTabById(tabId) || (allowActiveFallback ? fallbackTab : null);
    const explicitGeneration = Number(options?.sessionGeneration ?? options?.generation);
    const activeTabId = normalizeTabId(active?.tabId || '');
    const targetTabId = normalizeTabId(tabId || tab?.id || '');
    const activeGeneration = Number.isFinite(Number(active?.generation)) && Number(active.generation) > 0
      ? Number(active.generation)
      : 0;
    const sessionGenerationFromTab = readSessionGenerationForTab(tab || targetTabId, componentKeyText);
    const resolvedGeneration = Number.isFinite(explicitGeneration) && explicitGeneration > 0
      ? explicitGeneration
      : ((activeTabId && targetTabId && activeTabId === targetTabId)
        ? activeGeneration
        : sessionGenerationFromTab);
    return {
      tabId,
      sessionGeneration: resolvedGeneration,
      componentKey: componentKeyText,
      payloadSignature: options?.payloadSignature ?? tab?.payloadSignature ?? null,
      layoutSignature: options?.layoutSignature ?? tab?.layoutSignature ?? null,
      requirePayloadSignature: options?.requirePayloadSignature === true,
      requireLayoutSignature: options?.requireLayoutSignature === true
    };
  };

  namespace.isSessionMetaCurrent = function isSessionMetaCurrent(componentKey, meta){
    if(!meta || typeof meta !== 'object'){
      debugLog('Debug: workspaceTabs session meta rejected: missing metadata', {
        componentKey: String(componentKey || '').trim() || '__default__'
      });
      return false;
    }
    const componentKeyText = String(componentKey || meta.componentKey || '').trim() || '__default__';
    const tabId = normalizeTabId(meta.tabId || meta.workspaceTabId || meta.tab?.id || '');
    if(!tabId){
      debugLog('Debug: workspaceTabs session meta rejected: missing tab id', {
        componentKey: componentKeyText,
        reason: meta.reason || null
      });
      return false;
    }
    const generation = Number(meta.sessionGeneration ?? meta.generation);
    if(!Number.isFinite(generation) || generation <= 0){
      debugLog('Debug: workspaceTabs session meta rejected: invalid generation', {
        componentKey: componentKeyText,
        tabId,
        sessionGeneration: meta.sessionGeneration ?? meta.generation ?? null
      });
      return false;
    }
    const sessionCurrent = !!namespace.isSessionCurrent(componentKeyText, tabId, generation);
    if(!sessionCurrent){
      return false;
    }
    const tab = findWorkspaceTabById(tabId);
    if(meta.requirePayloadSignature === true && meta.payloadSignature != null && tab && tab.payloadSignature !== meta.payloadSignature){
      debugLog('Debug: workspaceTabs session meta rejected by payload signature', {
        componentKey: componentKeyText,
        tabId,
        expected: meta.payloadSignature,
        current: tab.payloadSignature || null
      });
      return false;
    }
    if(meta.requireLayoutSignature === true && meta.layoutSignature != null && tab && tab.layoutSignature !== meta.layoutSignature){
      debugLog('Debug: workspaceTabs session meta rejected by layout signature', {
        componentKey: componentKeyText,
        tabId,
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
      let configuredTabId = normalizeTabId(config.tabId || config.workspaceTabId || config.tab?.id || '');
      if(!configuredTabId && typeof config.getTabId === 'function'){
        try{ configuredTabId = normalizeTabId(config.getTabId(nextOptions) || ''); }
        catch(err){
          debugLog(`Debug: ${debugLabel} tab id resolver failed`, {
            componentKey,
            reason: nextOptions.reason || 'tab-scoped-schedule',
            err: err?.message || String(err)
          });
        }
      }
      const scheduleOptions = {
        ...nextOptions,
        tabId: normalizeTabId(nextOptions.tabId || nextOptions.workspaceTabId || nextOptions.tab?.id || '') || configuredTabId || null
      };
      const meta = nextOptions.__workspaceSessionMeta || namespace.buildSessionMeta(componentKey, scheduleOptions);
      if(!meta?.tabId){
        reportTabOwnershipViolation(`Debug: ${debugLabel} tab-scoped schedule requires explicit tab`, {
          componentKey,
          reason: nextOptions.reason || 'tab-scoped-schedule'
        }, nextOptions);
        return false;
      }
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

  namespace.getSessionRuntime = function getSessionRuntime(tabLike, componentKey, meta = {}){
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey }, meta.reason || 'get-session-runtime');
    if(!resolved.tabId){
      return null;
    }
    return ensureSessionRecord(resolved.tab || resolved.tabId, componentKey, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'get-session-runtime' })?.runtime || null;
  };

  function normalizeRuntimeComponentKey(componentKey){
    const raw = String(componentKey || '').trim();
    const match = raw.match(/^__workspaceTabs__:(.+)$/);
    return (match ? match[1] : raw).trim() || '__default__';
  }

  function ensureLifecycleRuntime(tabLike, componentKey, meta = {}){
    const key = normalizeRuntimeComponentKey(componentKey);
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: key }, meta.reason || 'ensure-lifecycle-runtime');
    if(!resolved.tabId){
      return null;
    }
    const runtime = namespace.getSessionRuntime(resolved.tab || resolved.tabId, key, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'ensure-lifecycle-runtime' });
    if(!runtime){
      return null;
    }
    const tab = resolved.tab || findWorkspaceTabById(resolved.tabId);
    if(!runtime.lifecycle || typeof runtime.lifecycle !== 'object'){
      runtime.lifecycle = {};
    }
    const lifecycle = runtime.lifecycle;
    lifecycle.version = 1;
    lifecycle.componentKey = key;
    lifecycle.tabId = tab?.id || lifecycle.tabId || null;
    if(!lifecycle.owner || typeof lifecycle.owner !== 'object'){
      lifecycle.owner = null;
    }
    return lifecycle;
  }

  function getLifecycleRuntime(tabLike, componentKey, meta = {}){
    const key = normalizeRuntimeComponentKey(componentKey);
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: key }, meta.reason || 'get-lifecycle-runtime');
    if(!resolved.tabId){
      return null;
    }
    const runtime = namespace.getSessionRecord(resolved.tab || resolved.tabId, key)?.runtime || null;
    const lifecycle = runtime?.lifecycle || null;
    return lifecycle && typeof lifecycle === 'object' ? lifecycle : null;
  }

  namespace.getLifecycleRuntime = getLifecycleRuntime;

  namespace.setLifecycleRuntimeSnapshot = function setLifecycleRuntimeSnapshot(tabLike, componentKey, snapshot, meta = {}){
    const key = normalizeRuntimeComponentKey(componentKey);
    const lifecycle = ensureLifecycleRuntime(tabLike, key, meta);
    if(!lifecycle){
      return null;
    }
    const sanitizeRuntimeSnapshot = global.Shared?.componentLifecycle?.sanitizeRuntimeSnapshot;
    lifecycle.snapshot = snapshot && typeof snapshot === 'object'
      ? (typeof sanitizeRuntimeSnapshot === 'function'
          ? (sanitizeRuntimeSnapshot(snapshot, {
              ...(meta || {}),
              componentKey: key,
              tabId: lifecycle.tabId || null,
              reason: meta.reason || 'set-lifecycle-runtime-snapshot'
            }) || {})
          : snapshot)
      : null;
    lifecycle.owner = lifecycle.snapshot
      ? {
          componentKey: key,
          tabId: lifecycle.tabId || null,
          updatedAt: Date.now(),
          reason: meta.reason || 'set-lifecycle-runtime-snapshot'
        }
      : null;
    debugLog('Debug: workspaceTabs lifecycle runtime snapshot stored', {
      tabId: lifecycle.tabId || null,
      componentKey: key,
      reason: meta.reason || 'set-lifecycle-runtime-snapshot'
    });
    return lifecycle.snapshot;
  };

  namespace.getLifecycleRuntimeSnapshot = function getLifecycleRuntimeSnapshot(tabLike, componentKey, meta = {}){
    return getLifecycleRuntime(tabLike, componentKey, { ...(meta || {}), reason: meta.reason || 'get-lifecycle-runtime-snapshot' })?.snapshot || null;
  };

  namespace.clearLifecycleRuntimeSnapshot = function clearLifecycleRuntimeSnapshot(tabLike, componentKey, meta = {}){
    const lifecycle = getLifecycleRuntime(tabLike, componentKey, meta);
    if(!lifecycle || !Object.prototype.hasOwnProperty.call(lifecycle, 'snapshot')){
      return false;
    }
    delete lifecycle.snapshot;
    lifecycle.owner = null;
    debugLog('Debug: workspaceTabs lifecycle runtime snapshot cleared', {
      tabId: lifecycle.tabId || null,
      componentKey: normalizeRuntimeComponentKey(componentKey),
      reason: meta.reason || 'clear-lifecycle-runtime-snapshot'
    });
    return true;
  };

  namespace.getOwnedRuntimeRecord = function getOwnedRuntimeRecord(tabLike, componentKey, meta = {}){
    const key = normalizeRuntimeComponentKey(componentKey);
    const resolved = resolveExplicitOwnedRuntimeTab(tabLike, meta);
    if(!resolved.tabId){
      return reportOwnedRuntimeViolation('Debug: workspaceTabs owned runtime read requires explicit tab', {
        componentKey: key,
        reason: meta.reason || 'get-owned-runtime-record'
      }, meta);
    }
    return getLifecycleRuntime(resolved.tab || resolved.tabId, key, { ...(meta || {}), tabId: resolved.tabId })?.ownedRecord || null;
  };

  namespace.setOwnedRuntimeRecord = function setOwnedRuntimeRecord(tabLike, componentKey, record, meta = {}){
    const key = normalizeRuntimeComponentKey(componentKey);
    const resolved = resolveExplicitOwnedRuntimeTab(tabLike, meta);
    if(!resolved.tabId){
      return reportOwnedRuntimeViolation('Debug: workspaceTabs owned runtime write requires explicit tab', {
        componentKey: key,
        reason: meta.reason || 'set-owned-runtime-record'
      }, meta);
    }
    const lifecycle = ensureLifecycleRuntime(resolved.tab || resolved.tabId, key, { ...(meta || {}), tabId: resolved.tabId });
    if(!lifecycle){
      return null;
    }
    if(record && typeof record === 'object'){
      const owner = record.__runtimeOwner && typeof record.__runtimeOwner === 'object' ? record.__runtimeOwner : null;
      const ownerComponent = normalizeRuntimeComponentKey(owner?.componentKey || record.componentKey || key);
      const ownerTabId = normalizeTabId(owner?.tabId || record.tabId || resolved.tabId);
      if((ownerComponent && ownerComponent !== key) || (ownerTabId && ownerTabId !== resolved.tabId)){
        return reportOwnedRuntimeViolation('Debug: workspaceTabs owned runtime write rejected owner mismatch', {
          componentKey: key,
          tabId: resolved.tabId,
          owner: owner || { componentKey: record.componentKey || null, tabId: record.tabId || null },
          reason: meta.reason || 'set-owned-runtime-record'
        }, meta);
      }
      record.componentKey = record.componentKey || key;
      record.tabId = record.tabId || resolved.tabId;
      record.__runtimeOwner = {
        version: 2,
        componentKey: key,
        tabId: resolved.tabId,
        storedAt: Date.now(),
        reason: meta.reason || 'set-owned-runtime-record'
      };
    }
    lifecycle.ownedRecord = record && typeof record === 'object' ? record : null;
    lifecycle.ownedRecordUpdatedAt = lifecycle.ownedRecord ? Date.now() : null;
    lifecycle.ownedRecordReason = meta.reason || 'set-owned-runtime-record';
    return lifecycle.ownedRecord;
  };

  namespace.clearOwnedRuntimeRecord = function clearOwnedRuntimeRecord(tabLike, componentKey, meta = {}){
    const key = normalizeRuntimeComponentKey(componentKey);
    const resolved = resolveExplicitOwnedRuntimeTab(tabLike, meta);
    if(!resolved.tabId){
      return !!reportOwnedRuntimeViolation('Debug: workspaceTabs owned runtime clear requires explicit tab', {
        componentKey: key,
        reason: meta.reason || 'clear-owned-runtime-record'
      }, meta);
    }
    const lifecycle = getLifecycleRuntime(resolved.tab || resolved.tabId, key, { ...(meta || {}), tabId: resolved.tabId });
    if(!lifecycle || !Object.prototype.hasOwnProperty.call(lifecycle, 'ownedRecord')){
      return false;
    }
    delete lifecycle.ownedRecord;
    lifecycle.ownedRecordUpdatedAt = null;
    lifecycle.ownedRecordReason = meta.reason || 'clear-owned-runtime-record';
    return true;
  };

  namespace.replaceSessionRuntime = function replaceSessionRuntime(tabLike, componentKey, runtime, meta = {}){
    const record = ensureSessionRecord(tabLike, componentKey, meta);
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

  namespace.ensureTabState = function ensureTabState(tabLike, meta = {}){
    const resolved = resolveExplicitTab(tabLike, meta, meta.reason || 'ensure-tab-state');
    const tab = resolved.tab;
    if(!resolved.tabId || !tab){
      return null;
    }
    return ensureRecordShape(tab);
  };

  namespace.ensureRuntimeBucket = function ensureRuntimeBucket(tabLike, componentKey, meta = {}){
    const sharedState = namespace.ensureTabState(tabLike, { ...(meta || {}), componentKey, reason: meta.reason || 'ensure-runtime-bucket' });
    const key = String(componentKey || '').trim() || '__default__';
    if(!sharedState){
      return null;
    }
    if(!sharedState.runtime[key] || typeof sharedState.runtime[key] !== 'object'){
      sharedState.runtime[key] = {};
    }
    return sharedState.runtime[key];
  };

  function normalizeSharedControlKey(value){
    return String(value || '').trim() || '__default__';
  }

  namespace.ensureSharedControlState = function ensureSharedControlState(tabLike, controlKey, meta = {}){
    const key = normalizeSharedControlKey(controlKey || meta?.controlKey);
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), controlKey: key }, meta.reason || 'ensure-shared-control-state');
    const sharedState = ensureRecordShape(resolved.tab);
    if(!sharedState || !resolved.tabId){
      return null;
    }
    if(!sharedState.controls || typeof sharedState.controls !== 'object'){
      sharedState.controls = {};
    }
    if(!sharedState.controls[key] || typeof sharedState.controls[key] !== 'object'){
      sharedState.controls[key] = {
        controlKey: key,
        tabId: resolved.tabId,
        values: {},
        metadata: {}
      };
    }
    const record = sharedState.controls[key];
    if(!record.values || typeof record.values !== 'object'){
      record.values = {};
    }
    if(!record.metadata || typeof record.metadata !== 'object'){
      record.metadata = {};
    }
    record.controlKey = key;
    record.tabId = resolved.tabId;
    record.metadata.lastReason = meta.reason || record.metadata.lastReason || 'ensure-shared-control-state';
    return record.values;
  };

  namespace.getSharedControlState = function getSharedControlState(tabLike, controlKey, meta = {}){
    const key = normalizeSharedControlKey(controlKey || meta?.controlKey);
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), controlKey: key }, meta.reason || 'get-shared-control-state');
    if(!resolved.tabId || !resolved.tab){
      return null;
    }
    const sharedState = ensureRecordShape(resolved.tab);
    const record = sharedState?.controls?.[key] || null;
    return record && typeof record === 'object' ? (record.values || null) : null;
  };

  namespace.clearSharedControlState = function clearSharedControlState(tabLike, controlKey, meta = {}){
    const key = normalizeSharedControlKey(controlKey || meta?.controlKey);
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), controlKey: key }, meta.reason || 'clear-shared-control-state');
    if(!resolved.tabId || !resolved.tab?.sharedState?.controls){
      return false;
    }
    if(Object.prototype.hasOwnProperty.call(resolved.tab.sharedState.controls, key)){
      delete resolved.tab.sharedState.controls[key];
      debugLog('Debug: workspaceTabs shared control state cleared', {
        tabId: resolved.tabId,
        controlKey: key,
        reason: meta.reason || 'clear-shared-control-state'
      });
      return true;
    }
    return false;
  };

  namespace.registerSharedControlDisposer = function registerSharedControlDisposer(controlKey, disposer){
    const key = normalizeSharedControlKey(controlKey);
    if(typeof disposer !== 'function'){
      return false;
    }
    namespace.__sharedControlDisposers = namespace.__sharedControlDisposers || new Map();
    namespace.__sharedControlDisposers.set(key, disposer);
    return true;
  };

  namespace.getRuntimeSnapshot = function getRuntimeSnapshot(tabLike, componentKey, meta = {}){
    const key = String(componentKey || '').trim() || '__default__';
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: key }, meta.reason || 'get-runtime-snapshot');
    if(!resolved.tabId){
      return null;
    }
    const lifecycleSnapshot = namespace.getLifecycleRuntimeSnapshot(resolved.tab || resolved.tabId, key, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'get-runtime-snapshot' });
    if(lifecycleSnapshot){
      return lifecycleSnapshot;
    }
    const sharedState = ensureRecordShape(resolved.tab || findWorkspaceTabById(resolved.tabId));
    const legacy = sharedState?.runtime?.[key] || null;
    if(legacy && typeof legacy === 'object'){
      namespace.setLifecycleRuntimeSnapshot(resolved.tab || resolved.tabId, key, legacy, { ...(meta || {}), tabId: resolved.tabId, reason: 'migrate-legacy-runtime-snapshot' });
      delete sharedState.runtime[key];
      return namespace.getLifecycleRuntimeSnapshot(resolved.tab || resolved.tabId, key, { ...(meta || {}), tabId: resolved.tabId, reason: 'migrate-legacy-runtime-snapshot' });
    }
    return null;
  };

  namespace.setRuntimeSnapshot = function setRuntimeSnapshot(tabLike, componentKey, snapshot, meta = {}){
    const key = String(componentKey || '').trim() || '__default__';
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: key }, meta.reason || 'set-runtime-snapshot');
    if(!resolved.tabId){
      return null;
    }
    const stored = namespace.setLifecycleRuntimeSnapshot(resolved.tab || resolved.tabId, key, snapshot, {
      ...(meta || {}),
      tabId: resolved.tabId,
      reason: meta.reason || 'set-runtime-snapshot'
    });
    const sharedState = ensureRecordShape(resolved.tab || findWorkspaceTabById(resolved.tabId));
    if(sharedState?.runtime && Object.prototype.hasOwnProperty.call(sharedState.runtime, key)){
      delete sharedState.runtime[key];
    }
    if(!sharedState){
      return null;
    }
    debugLog('Debug: workspaceTabs runtime snapshot stored', {
      tabId: resolved.tabId,
      componentKey: key,
      reason: meta.reason || 'set-runtime-snapshot'
    });
    return stored;
  };

  namespace.clearRuntimeSnapshot = function clearRuntimeSnapshot(tabLike, componentKey, meta = {}){
    const key = String(componentKey || '').trim() || '__default__';
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: key }, meta.reason || 'clear-runtime-snapshot');
    if(!resolved.tabId){
      return false;
    }
    const sharedState = ensureRecordShape(resolved.tab || findWorkspaceTabById(resolved.tabId));
    let cleared = namespace.clearLifecycleRuntimeSnapshot(resolved.tab || resolved.tabId, key, {
      ...(meta || {}),
      tabId: resolved.tabId,
      reason: meta.reason || 'clear-runtime-snapshot'
    });
    if(sharedState?.runtime && Object.prototype.hasOwnProperty.call(sharedState.runtime, key)){
      delete sharedState.runtime[key];
      cleared = true;
    }
    if(!cleared){
      return false;
    }
    debugLog('Debug: workspaceTabs runtime snapshot cleared', {
      tabId: resolved.tabId,
      componentKey: key,
      reason: meta.reason || 'clear-runtime-snapshot'
    });
    return true;
  };

  namespace.captureRuntimeState = function captureRuntimeState(tabLike, type, config, meta = {}){
    const resolved = resolveExplicitTab(tabLike, meta, meta.reason || 'capture-runtime-state');
    const tab = resolved.tab;
    const resolvedType = String(type || tab?.type || meta.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, config);
    if(!resolved.tabId || !tab || !resolvedType || !resolvedConfig){
      return null;
    }
    const snapshotKey = resolveRuntimeSnapshotKey(resolvedType, resolvedConfig);
    const hookMeta = {
      ...(meta || {}),
      tab,
      tabId: resolved.tabId,
      type: resolvedType,
      reason: meta.reason || 'capture-runtime-state'
    };
    const snapshot = invokeWorkspaceHook(resolvedConfig, 'captureRuntimeState', [hookMeta], hookMeta);
    if(snapshot === undefined){
      return namespace.getRuntimeSnapshot(tab, snapshotKey, hookMeta);
    }
    if(snapshot === null){
      namespace.clearRuntimeSnapshot(tab, snapshotKey, hookMeta);
      return null;
    }
    return namespace.setRuntimeSnapshot(tab, snapshotKey, snapshot, hookMeta);
  };

  namespace.applyRuntimeState = function applyRuntimeState(tabLike, type, config, meta = {}){
    const resolved = resolveExplicitTab(tabLike, meta, meta.reason || 'apply-runtime-state');
    const tab = resolved.tab;
    const resolvedType = String(type || tab?.type || meta.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, config);
    if(!resolved.tabId || !tab || !resolvedType || !resolvedConfig){
      return false;
    }
    const snapshotKey = resolveRuntimeSnapshotKey(resolvedType, resolvedConfig);
    const hookMeta = {
      ...(meta || {}),
      tab,
      tabId: resolved.tabId,
      type: resolvedType,
      reason: meta.reason || 'apply-runtime-state'
    };
    const snapshot = namespace.getRuntimeSnapshot(tab, snapshotKey, hookMeta) || null;
    invokeWorkspaceHook(resolvedConfig, 'applyRuntimeState', [snapshot, hookMeta], hookMeta);
    debugLog('Debug: workspaceTabs runtime snapshot applied', {
      tabId: resolved.tabId,
      type: resolvedType,
      hasSnapshot: !!snapshot,
      reason: hookMeta.reason
    });
    return true;
  };

  namespace.captureSharedPayloadState = function captureSharedPayloadState(tabLike, type, payload, config, meta = {}){
    const resolved = resolveExplicitTab(tabLike, meta, meta.reason || 'capture-shared-payload');
    const tab = resolved.tab;
    if(!resolved.tabId || !tab || !payload || typeof payload !== 'object'){
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
    const resolved = resolveExplicitTab(tabLike, meta, meta.reason || 'apply-shared-payload');
    const tab = resolved.tab;
    if(!resolved.tabId || !tab){
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
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: config?.type || meta.type || null }, meta.reason || 'activate-workspace');
    const tab = resolved.tab;
    const resolvedType = String(tab?.type || config?.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, config);
    if(!tab){
      return null;
    }
    const sharedState = ensureRecordShape(tab);
    const sessionRecord = namespace.ensureActiveSession(tab, resolvedType, {
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'activate-workspace'
    });
    sharedState.metadata.active = true;
    sharedState.metadata.lastActivatedAt = Date.now();
    sharedState.metadata.activeSessionGeneration = sessionRecord?.generation || 0;
    const activeRoot = namespace.ensureMountedRoot(tab, resolvedConfig || config, {
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'activate-workspace'
    });
    if(activeRoot && resolvedConfig && resolvedConfig.perTabDomInstances === true){
      resolvedConfig.activeElement = activeRoot;
    }
    stampWorkspaceScopeDeep(activeRoot || config?.element || null, tab.id);
    const component = resolvedType ? global.Components?.[resolvedType] || null : null;
    const activationReason = meta.reason || 'activate-workspace';
    if(component?.activateTab?.__supportsPrepareRuntimeTarget === true){
      try{
        component.activateTab(tab, {
          ...meta,
          tabId: tab.id,
          type: resolvedType || null,
          reason: `${activationReason}:prepare-runtime-target`,
          prepareRuntimeTarget: true,
          passiveControls: true,
          suppressAutoDraw: true,
          suppressResizeDraw: true,
          sessionGeneration: sessionRecord?.generation || 0,
          sessionRecord: sessionRecord || null
        });
        debugLog('Debug: workspaceTabs prepared runtime target before applying snapshot', {
          tabId: tab.id,
          type: resolvedType || null,
          reason: activationReason
        });
      }catch(err){
        console.error('workspaceTabs prepare runtime target error', {
          tabId: tab.id,
          type: resolvedType || null,
          err
        });
      }
    }
    namespace.applyRuntimeState(tab, resolvedType, resolvedConfig, {
      tabId: tab.id,
      type: resolvedType || null,
      reason: `${activationReason}:apply-runtime-state`
    });
    invokeWorkspaceHook(resolvedConfig, 'activateTab', [tab, {
      tabId: tab.id,
      type: resolvedType || null,
      reason: activationReason,
      runtimeStateApplied: true,
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
    const resolved = resolveExplicitTab(tabLike, { ...(meta || {}), componentKey: config?.type || meta.type || null }, meta.reason || 'deactivate-workspace');
    const tab = resolved.tab;
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
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'deactivate-workspace'
    });
    invokeWorkspaceHook(resolvedConfig, 'deactivateTab', [tab, {
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'deactivate-workspace',
      sessionGeneration: sessionRecord?.generation || 0,
      sessionRecord: sessionRecord || null
    }], meta);
    namespace.captureRuntimeState(tab, resolvedType, resolvedConfig, {
      tabId: tab.id,
      type: resolvedType || null,
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
    const resolved = resolveExplicitTab(tabLike, meta, meta.reason || 'dispose-tab');
    const tab = resolved.tab;
    const resolvedType = String(meta.type || tab?.type || '').trim();
    const resolvedConfig = resolveWorkspaceConfig(resolvedType, null);
    if(!tab){
      return false;
    }
    const tabId = tab.id || meta.tabId || null;
    invokeWorkspaceHook(resolvedConfig, 'disposeTab', [tab, {
      ...meta,
      tabId,
      type: resolvedType || null,
      reason: meta.reason || 'dispose-tab'
    }], meta);
    const component = resolvedType ? global.Components?.[resolvedType] || null : null;
    const cancelAsyncScope = (target, label) => {
      if(!target?.__asyncScope || typeof target.__asyncScope.cancelAllForTab !== 'function' || !tabId){
        return false;
      }
      try{
        return !!target.__asyncScope.cancelAllForTab(tabId, meta.reason || `${label}-dispose-tab`);
      }catch(err){
        console.error('workspaceTabs async scope dispose error', {
          tabId,
          type: resolvedType || null,
          label,
          err
        });
        return false;
      }
    };
    cancelAsyncScope(resolvedConfig, 'workspace');
    cancelAsyncScope(component, 'component');
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
    const record = namespace.getSessionRecord(tab, resolvedType, {
      tabId,
      type: resolvedType || null,
      reason: meta.reason || 'dispose-tab'
    });
    detachRoot(record?.dom?.root || null);
    try{
      if(resolvedType){
        global.Shared?.componentLifecycle?.createRuntimeOwner?.(resolvedType)?.dispose?.(tab, {
          ...meta,
          type: resolvedType,
          reason: meta.reason || 'dispose-tab'
        });
      }
    }catch(err){
      console.error('workspaceTabs runtime owner dispose error', {
        tabId: tab.id,
        type: resolvedType || null,
        err
      });
    }
    try{
      if(namespace.__sharedControlDisposers instanceof Map){
        namespace.__sharedControlDisposers.forEach((disposer, controlKey) => {
          try{
            disposer(tab, {
              ...meta,
              tabId,
              type: resolvedType || null,
              controlKey,
              reason: meta.reason || 'dispose-tab'
            });
          }catch(disposeErr){
            console.error('workspaceTabs shared control dispose error', {
              tabId,
              type: resolvedType || null,
              controlKey,
              err: disposeErr
            });
          }
        });
      }
    }catch(err){
      console.error('workspaceTabs shared control disposer registry error', {
        tabId,
        type: resolvedType || null,
        err
      });
    }
    delete tab.sharedState;
    debugLog('Debug: workspaceTabs disposed tab shared state', {
      tabId: tab.id,
      type: resolvedType || null,
      reason: meta.reason || 'dispose-tab'
    });
    return true;
  };
})(window);
