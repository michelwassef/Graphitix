(function() {
  'use strict';
  const Main = window.Main = window.Main || {};
  const Shared = window.Shared = window.Shared || {};
  const api = Main.workspacePreparation = {};

  // This registry owns disposable preparation, never component sessions or active
  // mirrors. Keys are tab objects, not reusable ids. Nothing here is archived.
  const entries = new Map();
  const MAX_BYTES = 32 * 1024 * 1024;
  const MAX_TABS = 4;
  let context = null;
  let generation = 0;
  let pending = null;
  let running = null;
  let usedBytes = 0;

  function emit(tab, action, details = {}) {
    Shared.componentLifecycle?.emitLifecycleEvent?.({
      componentKey: tab.type, tabId: tab.id, action,
      reason: 'workspace-background-preparation', details
    });
  }

  function stamp(tab) {
    return [tab.id, tab.type, tab.payload, tab.layoutState, tab.archiveRenderCache,
      tab.payloadSignature, tab.layoutSignature, tab.archiveRenderCacheSignature,
      tab.archiveRenderCacheLayoutSignature, tab.payloadVersion, tab.layoutVersion,
      tab.renderCommitVersion, tab.renderCache];
  }

  function current(tab, entry) {
    return entry.generation === generation && context?.workspaceState?.tabs?.includes(tab)
      && tab.payloadDirty !== true && stamp(tab).every((value, i) => value === entry.stamp[i]);
  }

  function release(tab) {
    const entry = entries.get(tab);
    if (!entry) return;
    if (entry.slice) {
      if (entry.slice.idle) window.cancelIdleCallback(entry.slice.id);
      else window.clearTimeout(entry.slice.id);
      entry.resume?.({ cancelled: true });
      entry.slice = null;
      entry.resume = null;
    }
    usedBytes -= entry.bytes || 0;
    entries.delete(tab);
  }

  function cancelScheduled() {
    if (!pending) return;
    if (pending.idle) window.cancelIdleCallback(pending.id);
    else window.clearTimeout(pending.id);
    pending = null;
  }

  function schedule() {
    for (const [tab, entry] of entries) {
      if (!current(tab, entry)) release(tab);
    }
    const retained = Array.from(entries.values()).filter(entry => entry.status === 'ready' || entry.status === 'preparing').length;
    if (!context || pending || running || retained >= MAX_TABS || usedBytes >= MAX_BYTES) return;
    const ownerGeneration = generation;
    const callback = () => {
      pending = null;
      if (ownerGeneration !== generation) return;
      void runNext();
    };
    pending = typeof window.requestIdleCallback === 'function'
      ? { idle: true, id: window.requestIdleCallback(callback) }
      : { idle: false, id: window.setTimeout(callback, 32) };
  }

  // Copy plain archive data in bounded slices; never share mutable matrices with
  // a component that is about to load them into its live table.
  function* copyPayload(value, account, copy = true) {
    account.bytes += typeof value === 'string' ? value.length * 4 + 16 : 32;
    if (account.bytes > account.limit) throw new RangeError('preparation-budget');
    yield;
    if (!value || typeof value !== 'object') return value;
    const isArray = Array.isArray(value);
    const result = !copy ? null : (isArray ? new Array(value.length) : {});
    if (isArray) {
      for (let index = 0; index < value.length; index++) {
        const child = yield* copyPayload(value[index], account, copy);
        if (copy) result[index] = child;
      }
      return result;
    }
    for (const key of Object.keys(value)) {
      const child = yield* copyPayload(value[key], account, copy);
      if (copy) result[key] = child;
    }
    return result;
  }

  function advance(tab, entry, iterator) {
    return new Promise(resolve => {
      const slice = deadline => {
        if (!current(tab, entry) || entries.get(tab) !== entry
          || context.workspaceState.activeTabId === tab.id) {
          resolve({ cancelled: true });
          return;
        }
        try {
          const started = performance.now();
          for (let i = 0; i < 512; i++) {
            const step = iterator.next();
            if (step.done) { resolve({ value: step.value }); return; }
            if (performance.now() - started >= 4 || (deadline && deadline.timeRemaining() < 1)) break;
          }
          entry.resume = resolve;
          entry.slice = typeof window.requestIdleCallback === 'function'
            ? { idle: true, id: window.requestIdleCallback(slice) }
            : { idle: false, id: window.setTimeout(slice, 16) };
        } catch (error) {
          resolve({ error });
        }
      };
      slice();
    });
  }

  async function runNext() {
    if (!context || context.workspaceState.documentOperation?.active || document.hidden) {
      schedule();
      return;
    }
    for (const [tab, entry] of entries) {
      if (!current(tab, entry)) release(tab);
    }
    const tab = context.workspaceState.tabs.find(candidate => candidate?.loadedFromArchive
      && candidate.type && candidate.payload && !candidate.payloadDirty
      && candidate.id !== context.workspaceState.activeTabId
      && !context.workspaceState.loadedWorkspaces?.[candidate.id] && !entries.has(candidate));
    if (!tab) return;
    const entry = { generation, stamp: stamp(tab), status: 'preparing', bytes: 0 };
    entries.set(tab, entry);
    running = entry;
    const source = context;
    emit(tab, 'prepare-start');
    try {
      // Import only. ensure/init/activate would bind active mirrors and are forbidden here.
      await Main.components.loadComponentBundle(tab.type);
      if (!current(tab, entry) || entries.get(tab) !== entry) return;
      const account = { bytes: 0, limit: MAX_BYTES - usedBytes };
      const copied = await advance(tab, entry, copyPayload(tab.payload, account));
      if (copied.cancelled || !current(tab, entry) || entries.get(tab) !== entry) return;
      if (copied.error) {
        if (copied.error.message !== 'preparation-budget') throw copied.error;
        entry.status = 'budget';
        return;
      }
      entry.payload = copied.value;
      const measured = await advance(tab, entry, copyPayload(tab.archiveRenderCache, account, false));
      if (measured.cancelled || !current(tab, entry) || entries.get(tab) !== entry) return;
      if (measured.error) {
        if (measured.error.message !== 'preparation-budget') throw measured.error;
        entry.payload = null;
        entry.status = 'budget';
        return;
      }
      // Graph fragments remain detached. peek performs owner/provenance/commit
      // validation; activation still performs component and interaction validation.
      entry.renderCache = source.session.peekArchiveRenderCache?.(tab, { reason: 'workspace-background-preparation' }) || null;
      if (!current(tab, entry) || entries.get(tab) !== entry) return;
      entry.bytes = account.bytes;
      usedBytes += entry.bytes;
      entry.status = 'ready';
      emit(tab, 'prepare-complete', { bytes: entry.bytes, renderCache: !!entry.renderCache });
    } catch (error) {
      entry.status = 'failed';
      emit(tab, 'prepare-failed', { message: error.message });
    } finally {
      if (entry.status !== 'ready') {
        entry.payload = null;
        entry.renderCache = null;
      }
      if (entry.status === 'preparing' && entries.get(tab) === entry) release(tab);
      entry.slice = null;
      entry.resume = null;
      if (running === entry) running = null;
      schedule();
    }
  }

  api.cancel = function cancel() {
    generation++;
    cancelScheduled();
    context = null;
    for (const tab of Array.from(entries.keys())) api.disposeTab(tab);
    running = null;
    Main.workspacePresentation?.reset();
  };

  api.start = function start(nextContext) {
    api.cancel();
    if (!nextContext?.workspaceState || !nextContext.session) return;
    context = { workspaceState: nextContext.workspaceState, session: nextContext.session };
    schedule();
  };

  api.disposeTab = function disposeTab(tab) {
    release(tab);
    Main.workspacePresentation?.disposeTab(tab);
    schedule();
  };

  api.take = function take(tab) {
    const entry = entries.get(tab);
    const result = entry?.status === 'ready' && current(tab, entry)
      ? { payload: entry.payload, renderCache: entry.renderCache, bytes: entry.bytes } : null;
    // Consuming preparation is not tab disposal: a staged visual handoff may
    // already belong to this owner and must survive until graph publication.
    release(tab);
    if (result) emit(tab, 'prepare-consumed');
    schedule();
    return result;
  };

  api.getState = tab => {
    const entry = entries.get(tab);
    return entry && current(tab, entry) ? entry.status : 'unprepared';
  };

})();
