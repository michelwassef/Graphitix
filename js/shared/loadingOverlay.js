(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const loadingOverlay = Shared.loadingOverlay = Shared.loadingOverlay || {};
  const overlayState = new WeakMap();
  const HOST_CLASS = 'venn-loading-host';
  const OVERLAY_CLASS = 'venn-loading-overlay';
  const VISIBLE_CLASS = 'is-visible';
  const DEFAULT_MESSAGE = 'Rendering chart...';
  const MIN_VISIBLE_MS = 150;

  function isDebug(){
    try{
      return typeof Shared.isDebugEnabled === 'function' ? Shared.isDebugEnabled() : false;
    }catch(err){
      return false;
    }
  }

  function resolveHost(target){
    if(typeof target === 'function'){
      try{
        return target();
      }catch(err){
        if(isDebug()){
          console.debug('Debug: loading overlay host resolver error',{ message: err?.message || String(err) });
        }
        return null;
      }
    }
    return target || null;
  }

  function ensureState(host){
    if(!host || !host.ownerDocument){
      return null;
    }
    let state = overlayState.get(host);
    if(state && state.overlay?.isConnected){
      return state;
    }
    const doc = host.ownerDocument;
    const overlay = doc.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('aria-live','polite');
    overlay.setAttribute('role','status');
    overlay.setAttribute('aria-hidden','true');
    overlay.hidden = true;
    const spinner = doc.createElement('div');
    spinner.className = `${OVERLAY_CLASS}__spinner`;
    spinner.setAttribute('aria-hidden','true');
    const messageEl = doc.createElement('div');
    messageEl.className = `${OVERLAY_CLASS}__message`;
    messageEl.textContent = DEFAULT_MESSAGE;
    overlay.appendChild(spinner);
    overlay.appendChild(messageEl);
    host.appendChild(overlay);
    state = {
      host,
      overlay,
      spinner,
      messageEl,
      handles: new Set(),
      count: 0,
      lastMessage: DEFAULT_MESSAGE,
      lastShowTs: 0,
      hideTimer: null
    };
    overlayState.set(host, state);
    return state;
  }

  function updateMessage(state, message){
    if(!state){ return; }
    const text = typeof message === 'string' && message.trim() ? message : state.lastMessage || DEFAULT_MESSAGE;
    if(state.messageEl.textContent !== text){
      state.messageEl.textContent = text;
    }
    state.lastMessage = text;
  }

  function cancelHideTimer(state){
    if(state && state.hideTimer){
      global.clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  }

  function activate(state){
    if(!state){ return; }
    cancelHideTimer(state);
    state.overlay.hidden = false;
    state.overlay.classList.add(VISIBLE_CLASS);
    state.overlay.setAttribute('aria-hidden','false');
    state.host.classList.add(HOST_CLASS);
    state.lastShowTs = Date.now();
  }

  function deactivate(state){
    if(!state){ return; }
    cancelHideTimer(state);
    const elapsed = Date.now() - (state.lastShowTs || 0);
    const delay = elapsed < MIN_VISIBLE_MS ? MIN_VISIBLE_MS - elapsed : 0;
    const finalize = () => {
      state.overlay.classList.remove(VISIBLE_CLASS);
      state.overlay.setAttribute('aria-hidden','true');
      state.overlay.hidden = true;
      state.host.classList.remove(HOST_CLASS);
    };
    if(delay > 0){
      state.hideTimer = global.setTimeout(finalize, delay);
    }else{
      finalize();
    }
  }

  function createHandle(host){
    return { host, id: Symbol('loadingOverlayHandle') };
  }

  function show(target, options = {}){
    const host = resolveHost(target);
    if(!host){ return null; }
    const state = ensureState(host);
    if(!state){ return null; }
    const handle = createHandle(host);
    state.handles.add(handle.id);
    state.count += 1;
    updateMessage(state, options.message || DEFAULT_MESSAGE);
    activate(state);
    if(isDebug()){
      console.debug('Debug: loading overlay show',{ component: options.component || null, reason: options.reason || null });
    }
    return handle;
  }

  function hide(handle, options = {}){
    if(!handle || !handle.host){ return false; }
    const state = overlayState.get(handle.host);
    if(!state || !state.handles.has(handle.id)){ return false; }
    state.handles.delete(handle.id);
    state.count = Math.max(0, state.count - 1);
    if(state.count === 0){
      deactivate(state);
      if(isDebug()){
        console.debug('Debug: loading overlay hide',{ component: options.component || null, reason: options.reason || null });
      }
    }
    return true;
  }

  function hideHost(target, options = {}){
    const host = resolveHost(target);
    if(!host){ return false; }
    const state = overlayState.get(host);
    if(!state){ return false; }
    state.handles.clear();
    state.count = 0;
    deactivate(state);
    if(isDebug()){
      console.debug('Debug: loading overlay hideHost',{ component: options.component || null, reason: options.reason || null });
    }
    return true;
  }

  function setMessage(handle, message){
    if(!handle || !handle.host){ return false; }
    const state = overlayState.get(handle.host);
    if(!state){ return false; }
    updateMessage(state, message);
    return true;
  }

  loadingOverlay.show = show;
  loadingOverlay.hide = hide;
  loadingOverlay.hideHost = hideHost;
  loadingOverlay.setMessage = setMessage;

  loadingOverlay.createController = function createController(config = {}){
    const getHost = typeof config.getHost === 'function'
      ? config.getHost
      : () => config.host || null;
    let handle = null;
    let queuedPayload = null;
    let showTimer = null;
    const baseMessage = config.message;
    const defaultShowDelayMs = Number.isFinite(Number(config.showDelayMs))
      ? Math.max(0, Number(config.showDelayMs))
      : 180;
    const clearPendingShow = () => {
      if(showTimer){
        (global.clearTimeout || clearTimeout)(showTimer);
        showTimer = null;
      }
      queuedPayload = null;
    };
    const showNow = payload => {
      const host = getHost();
      if(!host){
        clearPendingShow();
        return null;
      }
      handle = loadingOverlay.show(host, {
        message: payload?.message || baseMessage || DEFAULT_MESSAGE,
        reason: payload?.reason || payload?.source || null,
        component: config.component || null
      });
      clearPendingShow();
      return handle;
    };
    return {
      queue(meta){
        const payload = typeof meta === 'object' && meta !== null ? meta : { reason: meta };
        if(handle && payload?.message){
          loadingOverlay.setMessage(handle, payload.message);
          return handle;
        }
        if(handle){
          return handle;
        }
        const delayMsRaw = payload?.delayMs;
        const delayMs = Number.isFinite(Number(delayMsRaw))
          ? Math.max(0, Number(delayMsRaw))
          : defaultShowDelayMs;
        queuedPayload = payload;
        if(delayMs <= 0 || payload?.immediate === true){
          return showNow(queuedPayload);
        }
        if(!showTimer){
          showTimer = (global.setTimeout || setTimeout)(() => {
            if(!queuedPayload){
              return;
            }
            showNow(queuedPayload);
          }, delayMs);
        }
        return null;
      },
      resolve(meta){
        const payload = typeof meta === 'object' && meta !== null ? meta : { reason: meta };
        clearPendingShow();
        if(handle){
          loadingOverlay.hide(handle, {
            reason: payload?.reason || payload?.source || null,
            component: config.component || null
          });
          handle = null;
          return true;
        }
        const host = getHost();
        if(host){
          loadingOverlay.hideHost(host, {
            reason: payload?.reason || payload?.source || null,
            component: config.component || null
          });
        }
        return false;
      },
      isActive(){
        return !!handle;
      }
    };
  };

  loadingOverlay.createPendingController = function createPendingController(config = {}){
    if(typeof loadingOverlay.createController !== 'function'){
      return null;
    }
    let controller = null;
    const ensureController = () => {
      if(controller){ return controller; }
      controller = loadingOverlay.createController(config);
      return controller;
    };
    const state = {
      pendingReason: null,
      activeReason: null,
      forceActive: false
    };
    const markPending = reason => {
      const label = reason || 'data-change';
      state.pendingReason = label;
      if(isDebug()){
        console.debug('Debug: loading overlay pending flagged',{ component: config.component || null, reason: label });
      }
    };
    const queue = (reason, options = {}) => {
      const ctrl = ensureController();
      if(!ctrl){
        return false;
      }
      if(options.force){
        state.pendingReason = null;
        state.forceActive = true;
        state.activeReason = options.source || reason || 'forced';
        ctrl.queue({ reason, source: state.activeReason, message: options.message });
        return true;
      }
      const pending = state.pendingReason;
      state.pendingReason = null;
      if(!pending){
        if(isDebug()){
          console.debug('Debug: loading overlay queue skipped',{
            component: config.component || null,
            reason,
            pendingReason: pending
          });
        }
        return false;
      }
      state.activeReason = pending;
      ctrl.queue({ reason, source: pending, message: options.message });
      return true;
    };
    const resolve = reason => {
      const ctrl = ensureController();
      if(!ctrl){
        return false;
      }
      state.activeReason = null;
      state.forceActive = false;
      ctrl.resolve({ reason });
      return true;
    };
    return {
      markPending,
      queue,
      resolve,
      force: (reason, options = {}) => queue(reason, { ...options, force: true }),
      isActive: () => state.forceActive || !!controller?.isActive?.()
    };
  };
})(window);
