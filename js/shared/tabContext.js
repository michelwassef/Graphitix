(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  if(typeof Shared.workspaceTabs?.ensureRuntimeBucket !== 'function' && typeof require === 'function'){
    try{
      require('./workspaceTabs.js');
    }catch(err){
      console.debug('Debug: tabContext workspaceTabs helper require failed', { message: err?.message || String(err) });
    }
  }
  const namespace = Shared.tabContext = Shared.tabContext || {};

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

  namespace.createManager = function createManager(config = {}){
    const componentKey = normalizeTabId(config.componentKey) || 'component';
    const createDefaultContext = typeof config.createDefaultContext === 'function'
      ? config.createDefaultContext
      : (() => ({}));
    const captureState = typeof config.captureState === 'function'
      ? config.captureState
      : (() => createDefaultContext());
    const applyState = typeof config.applyState === 'function'
      ? config.applyState
      : (() => {});
    const resolveFallbackTabId = typeof config.resolveFallbackTabId === 'function'
      ? config.resolveFallbackTabId
      : (() => '');
    const isValidTab = typeof config.isValidTab === 'function'
      ? config.isValidTab
      : (tab => !!(tab && tab.type === componentKey && tab.id != null));
    const log = typeof config.debugLog === 'function' ? config.debugLog : debugLog;
    let activeTabId = null;
    const runtimeKey = `${componentKey}-runtime-${Math.random().toString(36).slice(2, 10)}`;

    function resolveTabId(tabLike){
      const explicitId = normalizeTabId(typeof tabLike === 'string' ? tabLike : tabLike?.id);
      if(explicitId){
        return explicitId;
      }
      try{
        const activeId = normalizeTabId(global.Main?.session?.getActiveTab?.()?.id);
        if(activeId){
          return activeId;
        }
      }catch(err){
        log(`${componentKey} tab context resolve active tab error`, {
          message: err?.message || String(err)
        });
      }
      const fallbackId = normalizeTabId(resolveFallbackTabId());
      return fallbackId || `${componentKey}-default`;
    }

    function prune(){
      const tabs = global.Main?.session?.workspaceState?.tabs;
      if(!Array.isArray(tabs)){
        return;
      }
      const validIds = new Set(
        tabs
          .filter(tab => isValidTab(tab))
          .map(tab => normalizeTabId(tab.id))
          .filter(Boolean)
      );
      if(activeTabId){
        validIds.add(activeTabId);
      }
      tabs.forEach(tab => {
        Shared.workspaceTabs?.ensureTabState?.(tab);
      });
      tabs
        .filter(tab => tab?.sharedState?.runtime && Object.prototype.hasOwnProperty.call(tab.sharedState.runtime, componentKey))
        .forEach(tab => {
          const tabId = normalizeTabId(tab.id);
          if(tabId && !validIds.has(tabId)){
            Shared.workspaceTabs?.clearRuntimeSnapshot?.(tab, componentKey, { reason: 'prune' });
            log(`Debug: ${componentKey} tab context pruned`, { tabId });
          }
        });
    }

    function ensure(tabLike){
      prune();
      const tabId = resolveTabId(tabLike);
      let context = Shared.workspaceTabs?.getRuntimeSnapshot?.(tabId, componentKey) || null;
      if(!context){
        context = createDefaultContext() || {};
        Shared.workspaceTabs?.setRuntimeSnapshot?.(tabId, componentKey, context, { reason: 'ensure' });
        log(`Debug: ${componentKey} tab context created`, { tabId });
      }
      return { tabId, context };
    }

    function getContext(tabLike){
      const tabId = resolveTabId(tabLike);
      return Shared.workspaceTabs?.getRuntimeSnapshot?.(tabId, componentKey) || null;
    }

    function setContext(tabLike, snapshot, meta = {}){
      const tabId = resolveTabId(tabLike);
      const nextContext = snapshot && typeof snapshot === 'object'
        ? snapshot
        : (createDefaultContext() || {});
      Shared.workspaceTabs?.setRuntimeSnapshot?.(tabId, componentKey, nextContext, {
        reason: meta.reason || 'set-context'
      });
      log(`Debug: ${componentKey} tab context replaced`, {
        tabId,
        reason: meta.reason || 'set-context'
      });
      return nextContext;
    }

    function sync(reason){
      const tabId = activeTabId || resolveTabId();
      if(!tabId){
        return null;
      }
      const snapshot = captureState(reason);
      const nextContext = snapshot && typeof snapshot === 'object'
        ? snapshot
        : (createDefaultContext() || {});
      Shared.workspaceTabs?.setRuntimeSnapshot?.(tabId, componentKey, nextContext, {
        reason: reason || 'sync'
      });
      log(`Debug: ${componentKey} tab context captured`, {
        tabId,
        reason: reason || 'sync'
      });
      return nextContext;
    }

    function activate(tabLike, options = {}){
      const nextTabId = resolveTabId(tabLike);
      const previousTabId = activeTabId;
      if(previousTabId && previousTabId === nextTabId && options.force !== true){
        if(!Shared.workspaceTabs?.getRuntimeSnapshot?.(nextTabId, componentKey)){
          sync(`seed:${options.reason || 'activate'}`);
        }
        log(`Debug: ${componentKey} tab context reused`, {
          tabId: nextTabId,
          reason: options.reason || 'activate'
        });
        return Shared.workspaceTabs?.getRuntimeSnapshot?.(nextTabId, componentKey) || null;
      }
      if(previousTabId && previousTabId !== nextTabId){
        sync(`switch:${options.reason || 'activate'}`);
      }
      const { context } = ensure(nextTabId);
      activeTabId = nextTabId;
      applyState(context, options);
      log(`Debug: ${componentKey} tab context activated`, {
        tabId: nextTabId,
        previousTabId: previousTabId || null,
        reason: options.reason || 'activate'
      });
      return context;
    }

    function clear(tabLike, meta = {}){
      const tabId = resolveTabId(tabLike);
      const hadContext = Shared.workspaceTabs?.clearRuntimeSnapshot?.(tabId, componentKey, {
        reason: meta.reason || 'clear'
      }) || false;
      if(activeTabId === tabId){
        activeTabId = null;
      }
      if(hadContext){
        log(`Debug: ${componentKey} tab context cleared`, {
          tabId,
          reason: meta.reason || 'clear'
        });
      }
      return hadContext;
    }

    return {
      activate,
      clear,
      ensure,
      getActiveTabId: () => activeTabId,
      getContext,
      getRuntimeKey: () => runtimeKey,
      prune,
      resolveTabId,
      setContext,
      sync
    };
  };
})(window);
