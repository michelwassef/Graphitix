(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const jobs = Shared.jobs = Shared.jobs || {};

  const activeJobs = new Map();
  const finishedJobs = new Map();
  const listeners = new Set();
  const DEFAULT_ACTIVITY_DELAY_MS = 700;
  let nextJobId = 1;
  let statusBound = false;
  let activityRenderTimer = null;

  function isDebug(){
    try{
      return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    }catch(_err){
      return false;
    }
  }

  function debug(message, payload){
    if(isDebug()){
      console.debug(message, payload || {});
    }
  }

  function now(){
    return Date.now();
  }

  function normalizeText(value, fallback){
    const text = String(value || '').trim();
    return text || fallback || '';
  }

  function resolveActiveTab(){
    try{
      return global.Main?.tabs?.getActiveTab?.() || Shared.workspaceTabs?.resolveTab?.(null) || null;
    }catch(_err){
      return null;
    }
  }

  function resolveTabId(input){
    const explicit = input?.tabId || input?.workspaceTabId || input?.tab?.id || null;
    if(explicit){
      return String(explicit);
    }
    const tab = resolveActiveTab();
    return tab?.id ? String(tab.id) : null;
  }

  function resolveTabTitle(input){
    if(input?.tabTitle){
      return String(input.tabTitle);
    }
    const tabId = resolveTabId(input);
    if(!tabId){
      return '';
    }
    try{
      const tabs = global.Main?.session?.workspaceState?.tabs || [];
      const tab = tabs.find(item => item && String(item.id || '') === tabId);
      return tab?.title ? String(tab.title) : '';
    }catch(_err){
      return '';
    }
  }

  function emit(){
    const snapshot = jobs.getSnapshot();
    listeners.forEach(listener => {
      try{ listener(snapshot); }
      catch(err){ console.warn('Debug: jobs listener error', { message: err?.message || String(err) }); }
    });
    clearActivityRenderTimer();
    renderActivityHosts(snapshot);
  }

  function trimFinished(){
    if(finishedJobs.size <= 40){
      return;
    }
    const ordered = Array.from(finishedJobs.values()).sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
    ordered.slice(0, Math.max(0, ordered.length - 40)).forEach(job => finishedJobs.delete(job.id));
  }

  function makePublicJob(record){
    return {
      id: record.id,
      kind: record.kind,
      component: record.component,
      tabId: record.tabId,
      tabTitle: record.tabTitle,
      label: record.label,
      message: record.message,
      reason: record.reason,
      status: record.status,
      cancellable: !!record.cancellable,
      retryable: typeof record.retry === 'function',
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      finishedAt: record.finishedAt || null,
      activityDelayMs: record.activityDelayMs,
      elapsedMs: now() - record.startedAt,
      error: record.error || null,
      signal: record.controller?.signal || null,
      cancel: reason => jobs.cancel(record.id, reason),
      complete: detail => jobs.complete(record.id, detail),
      fail: error => jobs.fail(record.id, error),
      retry: meta => jobs.retry(record.id, meta)
    };
  }

  function getRecord(jobOrId){
    const id = typeof jobOrId === 'object' && jobOrId ? jobOrId.id : jobOrId;
    return activeJobs.get(String(id)) || finishedJobs.get(String(id)) || null;
  }

  function primaryJobFrom(snapshot){
    const active = snapshot.active || [];
    if(!active.length){
      return null;
    }
    const activeTab = resolveActiveTab();
    const activeTabId = activeTab?.id ? String(activeTab.id) : '';
    return active.find(job => job.tabId && String(job.tabId) === activeTabId)
      || active.find(job => job.status === 'running')
      || active[0];
  }

  function invokeCancel(record, reason){
    if(typeof record.onCancel !== 'function'){
      return;
    }
    try{
      record.onCancel({
        id: record.id,
        reason,
        component: record.component,
        tabId: record.tabId,
        signal: record.controller?.signal || null
      });
    }catch(err){
      console.warn('Debug: job cancel hook failed', {
        id: record.id,
        component: record.component,
        message: err?.message || String(err)
      });
    }
  }

  jobs.start = function startJob(options = {}){
    const id = String(options.id || `job-${nextJobId++}`);
    if(activeJobs.has(id)){
      return makePublicJob(activeJobs.get(id));
    }
    const controller = typeof global.AbortController === 'function'
      ? new global.AbortController()
      : null;
    const record = {
      id,
      kind: normalizeText(options.kind, 'task'),
      component: normalizeText(options.component, ''),
      tabId: resolveTabId(options),
      tabTitle: resolveTabTitle(options),
      label: normalizeText(options.label || options.message, 'Working...'),
      message: normalizeText(options.message || options.label, 'Working...'),
      reason: normalizeText(options.reason || options.source, ''),
      status: 'running',
      cancellable: options.cancellable !== false,
      controller,
      retry: typeof options.retry === 'function' ? options.retry : null,
      onCancel: typeof options.onCancel === 'function' ? options.onCancel : null,
      metadata: options.metadata && typeof options.metadata === 'object' ? { ...options.metadata } : {},
      activityDelayMs: Number.isFinite(Number(options.activityDelayMs))
        ? Math.max(0, Number(options.activityDelayMs))
        : (Number.isFinite(Number(options.metadata?.activityDelayMs))
          ? Math.max(0, Number(options.metadata.activityDelayMs))
          : DEFAULT_ACTIVITY_DELAY_MS),
      startedAt: now(),
      updatedAt: now(),
      finishedAt: null,
      error: null
    };
    activeJobs.set(id, record);
    debug('Debug: job started', {
      id,
      kind: record.kind,
      component: record.component,
      tabId: record.tabId,
      reason: record.reason
    });
    emit();
    return makePublicJob(record);
  };

  jobs.cancel = function cancelJob(jobOrId, reason = 'user-cancel'){
    const record = getRecord(jobOrId);
    if(!record || record.status !== 'running'){
      return false;
    }
    if(record.cancellable === false){
      return false;
    }
    record.status = 'cancelled';
    record.updatedAt = now();
    record.finishedAt = now();
    try{
      record.controller?.abort?.(new Error(reason));
    }catch(_err){
      try{ record.controller?.abort?.(); }catch(_err2){}
    }
    invokeCancel(record, reason);
    activeJobs.delete(record.id);
    finishedJobs.set(record.id, record);
    trimFinished();
    debug('Debug: job cancelled', {
      id: record.id,
      kind: record.kind,
      component: record.component,
      tabId: record.tabId,
      reason
    });
    emit();
    return true;
  };

  jobs.complete = function completeJob(jobOrId, detail = {}){
    const record = getRecord(jobOrId);
    if(!record){
      return false;
    }
    if(record.status !== 'running'){
      emit();
      return false;
    }
    record.status = 'complete';
    record.updatedAt = now();
    record.finishedAt = now();
    if(detail && typeof detail === 'object'){
      record.metadata = { ...record.metadata, ...detail };
    }
    activeJobs.delete(record.id);
    finishedJobs.set(record.id, record);
    trimFinished();
    debug('Debug: job complete', { id: record.id, component: record.component, kind: record.kind });
    emit();
    return true;
  };

  jobs.fail = function failJob(jobOrId, error){
    const record = getRecord(jobOrId);
    if(!record){
      return false;
    }
    if(record.status !== 'running'){
      emit();
      return false;
    }
    record.status = 'error';
    record.updatedAt = now();
    record.finishedAt = now();
    record.error = error?.message || String(error || 'Task failed');
    activeJobs.delete(record.id);
    finishedJobs.set(record.id, record);
    trimFinished();
    debug('Debug: job failed', { id: record.id, component: record.component, kind: record.kind, error: record.error });
    emit();
    return true;
  };

  jobs.retry = function retryJob(jobOrId, meta = {}){
    const record = getRecord(jobOrId);
    if(!record || typeof record.retry !== 'function'){
      return false;
    }
    try{
      record.retry({
        id: record.id,
        component: record.component,
        tabId: record.tabId,
        reason: meta.reason || 'job-retry'
      });
      return true;
    }catch(err){
      console.warn('Debug: job retry failed', { id: record.id, message: err?.message || String(err) });
      return false;
    }
  };

  jobs.get = function getJob(jobOrId){
    const record = getRecord(jobOrId);
    return record ? makePublicJob(record) : null;
  };

  jobs.getActiveFor = function getActiveFor(options = {}){
    const component = String(options.component || '').trim();
    const tabId = options.tabId == null ? null : String(options.tabId);
    const kind = options.kind == null ? null : String(options.kind);
    const records = Array.from(activeJobs.values()).filter(record => {
      if(component && String(record.component || '') !== component){ return false; }
      if(tabId && String(record.tabId || '') !== tabId){ return false; }
      if(kind && String(record.kind || '') !== kind){ return false; }
      return true;
    });
    if(!records.length){
      return null;
    }
    records.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    return makePublicJob(records[0]);
  };

  jobs.isCancelled = function isCancelled(jobOrId){
    const record = getRecord(jobOrId);
    return !!(record && record.status === 'cancelled');
  };

  jobs.getSnapshot = function getSnapshot(){
    const active = Array.from(activeJobs.values()).map(makePublicJob);
    const finished = Array.from(finishedJobs.values()).map(makePublicJob);
    return {
      active,
      finished,
      primary: primaryJobFrom({ active, finished }),
      activeCount: active.length,
      finishedCount: finished.length
    };
  };

  jobs.onChange = function onChange(listener){
    if(typeof listener !== 'function'){
      return () => {};
    }
    listeners.add(listener);
    try{ listener(jobs.getSnapshot()); }catch(_err){}
    return () => listeners.delete(listener);
  };

  jobs.cancelForTab = function cancelForTab(tabId, reason = 'tab-cancel'){
    const id = String(tabId || '').trim();
    if(!id){
      return 0;
    }
    let count = 0;
    Array.from(activeJobs.values()).forEach(record => {
      if(String(record.tabId || '') === id && jobs.cancel(record.id, reason)){
        count += 1;
      }
    });
    return count;
  };

  jobs.cancelForComponent = function cancelForComponent(component, tabId = null, reason = 'component-cancel'){
    const componentKey = String(component || '').trim();
    const tabKey = tabId == null ? null : String(tabId);
    if(!componentKey){
      return 0;
    }
    let count = 0;
    Array.from(activeJobs.values()).forEach(record => {
      if(String(record.component || '') !== componentKey){
        return;
      }
      if(tabKey && String(record.tabId || '') !== tabKey){
        return;
      }
      if(jobs.cancel(record.id, reason)){
        count += 1;
      }
    });
    return count;
  };

  jobs.throwIfCancelled = function throwIfCancelled(jobOrSignal){
    const signal = jobOrSignal?.aborted != null ? jobOrSignal : jobOrSignal?.signal;
    if(signal?.aborted){
      throw new Error('Task cancelled');
    }
    if(jobOrSignal?.id && jobs.isCancelled(jobOrSignal.id)){
      throw new Error('Task cancelled');
    }
    return false;
  };

  jobs.nextFrame = function nextFrame(){
    return new Promise(resolve => {
      if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(() => resolve());
      }else if(typeof global.setTimeout === 'function'){
        global.setTimeout(resolve, 0);
      }else{
        resolve();
      }
    });
  };

  jobs.createYieldController = function createYieldController(options = {}){
    const budgetMs = Number.isFinite(Number(options.budgetMs)) ? Math.max(4, Number(options.budgetMs)) : 12;
    const signal = options.signal || null;
    let lastYield = now();
    return {
      async checkpoint(jobOrSignal){
        const effectiveSignal = signal || jobOrSignal?.signal || (jobOrSignal?.aborted != null ? jobOrSignal : null);
        jobs.throwIfCancelled(effectiveSignal || jobOrSignal || {});
        const elapsed = now() - lastYield;
        if(elapsed < budgetMs){
          return false;
        }
        await jobs.nextFrame();
        lastYield = now();
        jobs.throwIfCancelled(effectiveSignal || jobOrSignal || {});
        return true;
      }
    };
  };

  function renderActivityHosts(snapshot = jobs.getSnapshot()){
    if(!global.document){
      return;
    }
    const hosts = Array.from(global.document.querySelectorAll('[data-job-activity="1"]'));
    if(!hosts.length){
      return;
    }
    const primary = snapshot.primary || null;
    hosts.forEach(host => {
      renderActivityHost(host, primary, snapshot);
    });
  }

  function clearActivityRenderTimer(){
    if(activityRenderTimer && typeof global.clearTimeout === 'function'){
      global.clearTimeout(activityRenderTimer);
    }
    activityRenderTimer = null;
  }

  function scheduleActivityRender(delayMs){
    if(activityRenderTimer || typeof global.setTimeout !== 'function'){
      return;
    }
    const delay = Math.max(0, Number(delayMs) || 0);
    activityRenderTimer = global.setTimeout(() => {
      activityRenderTimer = null;
      renderActivityHosts();
    }, delay);
  }

  function clearHost(host){
    while(host.firstChild){
      host.removeChild(host.firstChild);
    }
  }

  function renderActivityHost(host, primary, snapshot){
    clearHost(host);
    if(!primary){
      host.hidden = true;
      host.dataset.jobStatus = 'idle';
      delete host.dataset.jobId;
      return;
    }
    const elapsedMs = Number(primary.elapsedMs);
    const activityDelayMs = Number.isFinite(Number(primary.activityDelayMs))
      ? Math.max(0, Number(primary.activityDelayMs))
      : DEFAULT_ACTIVITY_DELAY_MS;
    if(Number.isFinite(elapsedMs) && elapsedMs < activityDelayMs){
      host.hidden = true;
      host.dataset.jobStatus = 'pending';
      host.dataset.jobId = primary.id;
      scheduleActivityRender(activityDelayMs - elapsedMs);
      return;
    }
    host.hidden = false;
    host.dataset.jobStatus = primary.status || 'running';
    host.dataset.jobId = primary.id;

    const spinner = global.document.createElement('span');
    spinner.className = 'workspace-job-activity__spinner';
    spinner.setAttribute('aria-hidden', 'true');
    host.appendChild(spinner);

    const label = global.document.createElement('span');
    label.className = 'workspace-job-activity__label';
    const tabPrefix = primary.tabTitle && snapshot.activeCount > 1 ? `${primary.tabTitle}: ` : '';
    const countSuffix = snapshot.activeCount > 1 ? ` (+${snapshot.activeCount - 1})` : '';
    label.textContent = `${tabPrefix}${primary.message || primary.label || 'Working...'}${countSuffix}`;
    label.title = label.textContent;
    host.appendChild(label);

    if(primary.cancellable){
      const stop = global.document.createElement('button');
      stop.type = 'button';
      stop.className = 'workspace-job-activity__button';
      stop.textContent = 'Stop';
      stop.dataset.jobAction = 'cancel';
      stop.dataset.jobId = primary.id;
      host.appendChild(stop);
    }
  }

  function bindStatusUi(){
    if(statusBound || !global.document){
      return;
    }
    statusBound = true;
    global.document.addEventListener('click', event => {
      const action = event.target?.closest?.('[data-job-action]');
      if(!action){
        return;
      }
      const id = action.dataset.jobId || action.closest?.('[data-job-id]')?.dataset?.jobId || '';
      if(!id){
        return;
      }
      const kind = action.dataset.jobAction;
      if(kind === 'cancel'){
        jobs.cancel(id, 'user-stop');
        event.preventDefault();
      }else if(kind === 'retry'){
        jobs.retry(id, { reason: 'user-retry' });
        event.preventDefault();
      }
    }, true);
    renderActivityHosts();
  }

  jobs.bindStatusUi = bindStatusUi;

  jobs.__resetForTests = function resetForTests(){
    clearActivityRenderTimer();
    activeJobs.clear();
    finishedJobs.clear();
    nextJobId = 1;
    emit();
  };

  if(global.document?.readyState === 'loading'){
    global.document.addEventListener('DOMContentLoaded', bindStatusUi, { once: true });
  }else{
    bindStatusUi();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
