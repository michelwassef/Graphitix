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
  const overlayStates = new Set();
  let jobsSubscriptionBound = false;

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
    const actionsEl = doc.createElement('div');
    actionsEl.className = `${OVERLAY_CLASS}__actions`;
    actionsEl.hidden = true;
    const stopButton = doc.createElement('button');
    stopButton.type = 'button';
    stopButton.className = `${OVERLAY_CLASS}__button`;
    stopButton.dataset.overlayAction = 'cancel';
    stopButton.textContent = 'Stop';
    const retryButton = doc.createElement('button');
    retryButton.type = 'button';
    retryButton.className = `${OVERLAY_CLASS}__button`;
    retryButton.dataset.overlayAction = 'retry';
    retryButton.textContent = 'Draw again';
    retryButton.hidden = true;
    actionsEl.appendChild(stopButton);
    actionsEl.appendChild(retryButton);
    overlay.appendChild(spinner);
    overlay.appendChild(messageEl);
    overlay.appendChild(actionsEl);
    overlay.addEventListener('click', event => {
      const action = event.target?.closest?.('[data-overlay-action]');
      if(!action){ return; }
      const current = overlay.dataset.jobId || '';
      if(!current || !Shared.jobs){ return; }
      if(action.dataset.overlayAction === 'cancel'){
        Shared.jobs.cancel(current, 'overlay-stop');
        renderJobState(state, Shared.jobs.get(current));
        event.preventDefault();
      }else if(action.dataset.overlayAction === 'retry'){
        Shared.jobs.retry(current, { reason: 'overlay-retry' });
        event.preventDefault();
      }
    });
    host.appendChild(overlay);
    state = {
      host,
      overlay,
      spinner,
      messageEl,
      actionsEl,
      stopButton,
      retryButton,
      handles: new Set(),
      count: 0,
      lastMessage: DEFAULT_MESSAGE,
      jobId: null,
      lastShowTs: 0,
      hideTimer: null
    };
    overlayState.set(host, state);
    overlayStates.add(state);
    bindJobsSubscription();
    return state;
  }

  function bindJobsSubscription(){
    if(jobsSubscriptionBound || !Shared.jobs?.onChange){
      return;
    }
    jobsSubscriptionBound = true;
    Shared.jobs.onChange(() => {
      overlayStates.forEach(state => {
        if(!state?.overlay?.isConnected){
          overlayStates.delete(state);
          return;
        }
        const jobId = state.jobId || state.overlay.dataset.jobId || '';
        if(!jobId){ return; }
        const job = Shared.jobs.get(jobId);
        if(job){
          renderJobState(state, job);
        }
      });
    });
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

  function renderJobState(state, job){
    if(!state){ return; }
    const status = job?.status || 'running';
    state.overlay.dataset.jobStatus = status;
    if(job?.id){
      state.overlay.dataset.jobId = job.id;
      state.jobId = job.id;
    }else{
      delete state.overlay.dataset.jobId;
      state.jobId = null;
    }
    const showActions = !!job && (job.cancellable || job.retryable || status === 'cancelled' || status === 'error');
    state.actionsEl.hidden = !showActions;
    if(state.stopButton){
      state.stopButton.hidden = !(job?.cancellable && status === 'running');
    }
    if(state.retryButton){
      const retryable = !!(job?.retryable || status === 'cancelled' || status === 'error');
      state.retryButton.hidden = !retryable || status === 'running';
      state.retryButton.textContent = status === 'error' ? 'Try again' : 'Draw again';
    }
    if(status === 'cancelled'){
      state.spinner.hidden = true;
      updateMessage(state, 'Drawing stopped');
    }else if(status === 'error'){
      state.spinner.hidden = true;
      updateMessage(state, 'Rendering failed');
    }else{
      state.spinner.hidden = false;
    }
  }

  function deactivate(state, options = {}){
    if(!state){ return; }
    if(options.preserveStopped && state.jobId && Shared.jobs?.isCancelled?.(state.jobId)){
      renderJobState(state, Shared.jobs.get(state.jobId));
      return;
    }
    cancelHideTimer(state);
    const elapsed = Date.now() - (state.lastShowTs || 0);
    const delay = elapsed < MIN_VISIBLE_MS ? MIN_VISIBLE_MS - elapsed : 0;
    const finalize = () => {
      state.overlay.classList.remove(VISIBLE_CLASS);
      state.overlay.setAttribute('aria-hidden','true');
      state.overlay.hidden = true;
      state.host.classList.remove(HOST_CLASS);
      delete state.overlay.dataset.jobId;
      delete state.overlay.dataset.jobStatus;
      state.jobId = null;
      state.actionsEl.hidden = true;
      state.stopButton.hidden = false;
      state.retryButton.hidden = true;
      state.spinner.hidden = false;
    };
    if(delay > 0){
      state.hideTimer = global.setTimeout(finalize, delay);
    }else{
      finalize();
    }
  }

  function createHandle(host){
    return { host, id: Symbol('loadingOverlayHandle'), jobId: null };
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
    if(options.job){
      handle.jobId = options.job.id || null;
      renderJobState(state, options.job);
    }else{
      renderJobState(state, null);
    }
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
      deactivate(state, { preserveStopped: options.preserveStopped !== false });
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
    deactivate(state, { preserveStopped: options.preserveStopped === true });
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
    let job = null;
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
      const jobOptions = typeof config.createJobOptions === 'function'
        ? config.createJobOptions(payload || {})
        : (config.jobOptions && typeof config.jobOptions === 'object' ? config.jobOptions : {});
      const component = config.component || jobOptions.component || null;
      const resolvedTabId = jobOptions.tabId
        || (typeof config.getTabId === 'function' ? config.getTabId(payload || {}) : null)
        || payload?.tabId
        || null;
      const retry = typeof jobOptions.retry === 'function'
        ? jobOptions.retry
        : (() => {
            if(handle){
              loadingOverlay.hide(handle, {
                reason: 'overlay-retry-reset',
                component: config.component || null,
                preserveStopped: false
              });
              handle = null;
              job = null;
            }else{
              loadingOverlay.hideHost(host, {
                reason: 'overlay-retry-reset',
                component: config.component || null,
                preserveStopped: false
              });
            }
            const targetComponent = component ? global.Components?.[component] : null;
            if(targetComponent && typeof targetComponent.draw === 'function'){
              targetComponent.draw({
                force: true,
                userInitiated: true,
                reason: 'overlay-retry'
              });
            }
          });
      const onCancel = typeof jobOptions.onCancel === 'function'
        ? jobOptions.onCancel
        : (meta => {
            const targetComponent = component ? global.Components?.[component] : null;
            if(targetComponent && typeof targetComponent.cancelCurrentDraw === 'function'){
              targetComponent.cancelCurrentDraw({
                reason: meta?.reason || 'overlay-stop',
                tabId: meta?.tabId || resolvedTabId || null
              });
            }
          });
      job = Shared.jobs?.start?.({
        kind: jobOptions.kind || 'graph',
        component,
        tabId: resolvedTabId,
        tabTitle: jobOptions.tabTitle || null,
        label: jobOptions.label || payload?.message || baseMessage || DEFAULT_MESSAGE,
        message: payload?.message || jobOptions.message || baseMessage || DEFAULT_MESSAGE,
        reason: payload?.reason || payload?.source || jobOptions.reason || null,
        cancellable: jobOptions.cancellable !== false,
        activityDelayMs: Number.isFinite(Number(jobOptions.activityDelayMs))
          ? Number(jobOptions.activityDelayMs)
          : 0,
        retry,
        onCancel
      }) || null;
      handle = loadingOverlay.show(host, {
        message: payload?.message || baseMessage || DEFAULT_MESSAGE,
        reason: payload?.reason || payload?.source || null,
        component: config.component || null,
        job
      });
      if(handle && job){
        handle.jobId = job.id;
      }
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
          if(job && payload?.status === 'error'){
            Shared.jobs?.fail?.(job.id, payload?.error || new Error(payload?.reason || 'Rendering failed'));
            renderJobState(overlayState.get(handle.host), Shared.jobs?.get?.(job.id));
            job = null;
            return true;
          }
          if(job && !Shared.jobs?.isCancelled?.(job.id)){
            Shared.jobs?.complete?.(job.id, { reason: payload?.reason || payload?.source || null });
          }
          loadingOverlay.hide(handle, {
            reason: payload?.reason || payload?.source || null,
            component: config.component || null,
            preserveStopped: true
          });
          handle = null;
          job = null;
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
    const showOnlyWhenForced = config.showOnlyWhenForced !== false;
    const isHeavy = (reason, options = {}) => {
      if(options.heavy === true || options.forceOverlay === true){
        return true;
      }
      if(options.heavy === false || options.forceOverlay === false){
        return false;
      }
      if(typeof config.isHeavy === 'function'){
        try{
          return !!config.isHeavy(reason, options);
        }catch(err){
          console.error('loading overlay heavy predicate failed', err);
          return false;
        }
      }
      return true;
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
        if(!isHeavy(reason, options)){
          state.pendingReason = null;
          state.forceActive = false;
          if(isDebug()){
            console.debug('Debug: loading overlay force skipped for light work',{
              component: config.component || null,
              reason
            });
          }
          return false;
        }
        state.pendingReason = null;
        state.forceActive = true;
        state.activeReason = options.source || reason || 'forced';
        ctrl.queue({
          reason,
          source: state.activeReason,
          message: options.message,
          immediate: true,
          delayMs: 0
        });
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
      if(showOnlyWhenForced){
        if(isDebug()){
          console.debug('Debug: loading overlay queue skipped for non-heavy pending work',{
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

  loadingOverlay.hasTableBodyData = function hasTableBodyData(source, options = {}){
    const matrix = Array.isArray(source)
      ? source
      : (typeof source?.getSourceData === 'function'
        ? source.getSourceData()
        : (typeof source?.getData === 'function' ? source.getData() : null));
    if(!Array.isArray(matrix)){
      return false;
    }
    const startRow = Math.max(0, Math.floor(Number(options.startRow) || 0));
    const startCol = Math.max(0, Math.floor(Number(options.startCol) || 0));
    for(let rowIndex = startRow; rowIndex < matrix.length; rowIndex += 1){
      const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
      for(let colIndex = startCol; colIndex < row.length; colIndex += 1){
        const value = row[colIndex];
        if(value != null && String(value).trim() !== ''){
          return true;
        }
      }
    }
    return false;
  };

  loadingOverlay.createTableHeavyPredicate = function createTableHeavyPredicate(config = {}){
    const startRow = Math.max(0, Math.floor(Number(config.startRow) || 0));
    const startCol = Math.max(0, Math.floor(Number(config.startCol) || 0));
    const rowThreshold = Math.max(1, Math.floor(Number(config.rowThreshold) || 1000));
    const cellThreshold = Math.max(1, Math.floor(Number(config.cellThreshold) || 5000));
    return function isTableOverlayHeavy(reason, options = {}){
      if(options.heavy === true || options.forceOverlay === true){
        return true;
      }
      if(options.heavy === false || options.forceOverlay === false){
        return false;
      }
      const reasonText = String(reason || options.reason || '').toLowerCase();
      if(reasonText === 'file-import' || reasonText.includes('opening saved')){
        return true;
      }
      const hot = typeof config.getHot === 'function' ? config.getHot() : config.hot;
      const matrix = Array.isArray(hot)
        ? hot
        : (typeof hot?.getSourceData === 'function'
          ? hot.getSourceData()
          : (typeof hot?.getData === 'function' ? hot.getData() : null));
      if(!Array.isArray(matrix)){
        return false;
      }
      let nonEmptyRows = 0;
      let nonEmptyCells = 0;
      for(let rowIndex = startRow; rowIndex < matrix.length; rowIndex += 1){
        const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
        let rowHasData = false;
        for(let colIndex = startCol; colIndex < row.length; colIndex += 1){
          const value = row[colIndex];
          if(value != null && String(value).trim() !== ''){
            nonEmptyCells += 1;
            rowHasData = true;
          }
        }
        if(rowHasData){
          nonEmptyRows += 1;
        }
      }
      return nonEmptyRows > 0 && (nonEmptyRows >= rowThreshold || nonEmptyCells >= cellThreshold);
    };
  };
})(window);
