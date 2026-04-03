(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
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
    const contexts = new Map();
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
      Array.from(contexts.keys()).forEach(tabId => {
        if(!validIds.has(tabId)){
          contexts.delete(tabId);
          log(`Debug: ${componentKey} tab context pruned`, { tabId });
        }
      });
    }

    function ensure(tabLike){
      prune();
      const tabId = resolveTabId(tabLike);
      let context = contexts.get(tabId);
      if(!context){
        context = createDefaultContext() || {};
        contexts.set(tabId, context);
        log(`Debug: ${componentKey} tab context created`, { tabId });
      }
      return { tabId, context };
    }

    function getContext(tabLike){
      const tabId = resolveTabId(tabLike);
      return contexts.get(tabId) || null;
    }

    function setContext(tabLike, snapshot, meta = {}){
      const tabId = resolveTabId(tabLike);
      const nextContext = snapshot && typeof snapshot === 'object'
        ? snapshot
        : (createDefaultContext() || {});
      contexts.set(tabId, nextContext);
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
      contexts.set(tabId, nextContext);
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
        if(!contexts.has(nextTabId)){
          sync(`seed:${options.reason || 'activate'}`);
        }
        log(`Debug: ${componentKey} tab context reused`, {
          tabId: nextTabId,
          reason: options.reason || 'activate'
        });
        return contexts.get(nextTabId) || null;
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
      const hadContext = contexts.delete(tabId);
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
