// Shared worker helpers for CPU-intensive tasks
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Workers = Shared.Workers = Shared.Workers || {};
  const debugState = Shared.__debugState || { enabled: false };
  Shared.__debugState = debugState;

  if(typeof Shared.isDebugEnabled !== 'function'){
    Shared.isDebugEnabled = function isDebugEnabled(){
      return !!debugState.enabled;
    };
  }

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  }

  const registry = new Map();

  Workers.isSupported = function isSupported(){
    return typeof global.Worker === 'function';
  };

  function createWorkerRecord(name, url, options){
    const workerOptions = options && options.workerOptions ? options.workerOptions : undefined;
    const worker = new global.Worker(url, workerOptions);
    const record = {
      name,
      url,
      worker,
      pending: new Map(),
      nextId: 1
    };

    worker.onmessage = (event) => {
      const message = event?.data || {};
      const id = message.id;
      if(!record.pending.has(id)){
        return;
      }
      const entry = record.pending.get(id);
      record.pending.delete(id);
      if(entry?.timer){
        clearTimeout(entry.timer);
      }
      if(entry?.abortCleanup){
        try{ entry.abortCleanup(); }catch(_err){}
      }
      if(message.ok === false){
        entry.reject(new Error(message.error || 'Worker task failed'));
      }else{
        entry.resolve(message.result);
      }
    };

    worker.onerror = (event) => {
      logDebug('Debug: Workers error', { name, url, message: event?.message || 'worker error' });
    };

    worker.onmessageerror = (event) => {
      logDebug('Debug: Workers message error', { name, url, data: event?.data });
    };

    registry.set(name, record);
    logDebug('Debug: Workers created', { name, url });
    return record;
  }

  Workers.getWorker = function getWorker(config){
    const name = config?.name || 'default';
    const url = config?.url;
    if(!url){
      console.warn('Workers.getWorker missing url', { name });
      return null;
    }
    if(registry.has(name)){
      return registry.get(name);
    }
    if(!Workers.isSupported()){
      return null;
    }
    return createWorkerRecord(name, url, config);
  };

  Workers.terminate = function terminate(name){
    if(!registry.has(name)){
      return false;
    }
    const record = registry.get(name);
    registry.delete(name);
    try{
      record.worker.terminate();
      logDebug('Debug: Workers terminated', { name, url: record.url });
      return true;
    }catch(err){
      console.warn('Workers termination error', { name, err });
      return false;
    }
  };

  function rejectPendingEntry(record, id, reason){
    if(!record || !record.pending?.has?.(id)){
      return false;
    }
    const entry = record.pending.get(id);
    record.pending.delete(id);
    if(entry?.timer){
      clearTimeout(entry.timer);
    }
    if(entry?.abortCleanup){
      try{ entry.abortCleanup(); }catch(_err){}
    }
    const error = reason instanceof Error ? reason : new Error(reason || 'Worker task cancelled');
    try{ entry.reject(error); }catch(_err){}
    return true;
  }

  Workers.cancelTask = function cancelTask(task, reason = 'cancelled'){
    const name = typeof task === 'object' && task ? task.name : null;
    const id = typeof task === 'object' && task ? task.id : task;
    if(!name || id == null || !registry.has(name)){
      return false;
    }
    const record = registry.get(name);
    const entry = record.pending.get(id);
    const cancelled = rejectPendingEntry(record, id, reason);
    if(cancelled && entry?.terminateOnCancel){
      const otherPending = Array.from(record.pending.keys());
      try{
        record.worker.terminate();
      }catch(_err){}
      registry.delete(name);
      otherPending.forEach(otherId => {
        rejectPendingEntry(record, otherId, new Error('Worker was terminated by a cancelled task'));
      });
      logDebug('Debug: Workers task cancelled with termination', { name, id, reason });
    }else if(cancelled){
      logDebug('Debug: Workers task cancelled', { name, id, reason });
    }
    return cancelled;
  };

  Workers.runTask = function runTask(config){
    const name = config?.name || 'default';
    const url = config?.url;
    const action = config?.action || 'task';
    const payload = config?.payload;
    const fallback = typeof config?.fallback === 'function' ? config.fallback : null;
    const timeoutMs = Number.isFinite(config?.timeoutMs) ? config.timeoutMs : 0;
    const transfer = Array.isArray(config?.transfer) ? config.transfer : undefined;
    const signal = config?.signal || null;
    const terminateOnCancel = config?.cancelStrategy === 'terminate' || config?.terminateOnCancel === true;

    if(!Workers.isSupported()){
      if(fallback){
        return Promise.resolve().then(() => fallback(payload));
      }
      return Promise.reject(new Error('Workers not supported'));
    }

    const record = Workers.getWorker({ name, url, workerOptions: config?.workerOptions });
    if(!record){
      if(fallback){
        return Promise.resolve().then(() => fallback(payload));
      }
      return Promise.reject(new Error('Worker unavailable'));
    }

    const id = record.nextId++;
    const message = { id, action, payload };
    logDebug('Debug: Workers task queued', { name, action, id });

    const promise = new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null, abortCleanup: null, terminateOnCancel };
      if(timeoutMs > 0){
        entry.timer = setTimeout(() => {
          if(record.pending.has(id)){
            rejectPendingEntry(record, id, 'Worker task timeout');
          }
        }, timeoutMs);
      }
      if(signal && typeof signal.addEventListener === 'function'){
        const onAbort = () => {
          Workers.cancelTask({ name, id }, signal.reason || 'Worker task cancelled');
        };
        if(signal.aborted){
          reject(signal.reason instanceof Error ? signal.reason : new Error('Worker task cancelled'));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        entry.abortCleanup = () => signal.removeEventListener('abort', onAbort);
      }
      record.pending.set(id, entry);
      try{
        if(transfer && transfer.length){
          record.worker.postMessage(message, transfer);
        }else{
          record.worker.postMessage(message);
        }
      }catch(err){
        record.pending.delete(id);
        if(entry.timer){
          clearTimeout(entry.timer);
        }
        if(entry.abortCleanup){
          entry.abortCleanup();
        }
        if(fallback){
          Promise.resolve().then(() => fallback(payload)).then(resolve).catch(reject);
          return;
        }
        reject(err);
      }
    });
    promise.task = { name, id, action };
    promise.cancel = reason => Workers.cancelTask({ name, id }, reason || 'cancelled');
    return promise;
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
