(function(global){
  "use strict";
  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.componentLifecycle = Shared.componentLifecycle || {};

  const DEFAULT_SNAPSHOT_TIMEOUT_MS = 1800;
  const DEFAULT_SETTLE_FRAMES = 2;

  function isDebugEnabled(){
    try{
      return !!(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled());
    }catch(_err){
      return false;
    }
  }

  function debug(message, payload){
    if(isDebugEnabled()){
      console.debug(message, payload || {});
    }
  }

  function warn(message, payload){
    console.warn(message, payload || {});
  }

  function nextFrame(){
    return new Promise(resolve => {
      if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(() => resolve());
      }else if(typeof global.setTimeout === 'function'){
        global.setTimeout(resolve, 0);
      }else{
        resolve();
      }
    });
  }

  namespace.waitForAnimationFrames = async function waitForAnimationFrames(count = DEFAULT_SETTLE_FRAMES){
    const frames = Math.max(0, Math.floor(Number(count) || 0));
    for(let i = 0; i < frames; i += 1){
      await nextFrame();
    }
    return true;
  };

  function timeoutPromise(ms){
    return new Promise(resolve => {
      if(typeof global.setTimeout === 'function'){
        global.setTimeout(() => resolve({ timedOut: true }), Math.max(0, Number(ms) || 0));
      }else{
        resolve({ timedOut: false });
      }
    });
  }

  async function maybeAwait(value){
    if(value && typeof value.then === 'function'){
      return value;
    }
    return value;
  }

  namespace.awaitReadyForSnapshot = async function awaitReadyForSnapshot(target, meta = {}){
    const componentKey = meta.componentKey || target?.type || target?.componentKey || target?.__componentKey || null;
    const timeoutMs = Number.isFinite(Number(meta.timeoutMs)) ? Math.max(100, Number(meta.timeoutMs)) : DEFAULT_SNAPSHOT_TIMEOUT_MS;
    const settleFrames = Number.isFinite(Number(meta.settleFrames)) ? Math.max(0, Number(meta.settleFrames)) : DEFAULT_SETTLE_FRAMES;
    const startedAt = Date.now();
    try{
      if(target && typeof target.whenIdle === 'function'){
        const idleResult = await Promise.race([
          maybeAwait(target.whenIdle({ ...meta, componentKey })),
          timeoutPromise(timeoutMs)
        ]);
        if(idleResult?.timedOut){
          warn('Debug: component whenIdle timed out before snapshot', {
            componentKey,
            tabId: meta.tabId || meta.tab?.id || null,
            timeoutMs,
            reason: meta.reason || 'snapshot'
          });
        }
      }else if(target && typeof target.isIdleForSnapshot === 'function'){
        const deadline = Date.now() + timeoutMs;
        while(Date.now() < deadline){
          let idle = false;
          try{ idle = !!target.isIdleForSnapshot({ ...meta, componentKey }); }
          catch(err){
            warn('Debug: component isIdleForSnapshot error', { componentKey, err, reason: meta.reason || 'snapshot' });
            break;
          }
          if(idle){ break; }
          await namespace.waitForAnimationFrames(1);
        }
      }
      await namespace.waitForAnimationFrames(settleFrames);
      debug('Debug: component ready for snapshot', {
        componentKey,
        tabId: meta.tabId || meta.tab?.id || null,
        elapsedMs: Date.now() - startedAt,
        reason: meta.reason || 'snapshot'
      });
      return { ok: true, componentKey, elapsedMs: Date.now() - startedAt };
    }catch(err){
      warn('Debug: component awaitReadyForSnapshot failed', {
        componentKey,
        tabId: meta.tabId || meta.tab?.id || null,
        reason: meta.reason || 'snapshot',
        err: err?.message || String(err)
      });
      return { ok: false, componentKey, error: err?.message || String(err) };
    }
  };

  function getWrapper(meta){
    return meta?.renderCache && typeof meta.renderCache === 'object' ? meta.renderCache : null;
  }

  function getGraphicPayload(cache){
    if(!cache || typeof cache !== 'object'){
      return null;
    }
    const graphicKey = typeof cache?.__graphitixRenderCache?.graphicKey === 'string'
      ? cache.__graphitixRenderCache.graphicKey
      : null;
    return (graphicKey && cache[graphicKey]) || cache.plot || cache.preview || cache.graph || cache.svg || cache.stage || cache.renderState || null;
  }

  function textHasMeaningfulMarkup(text, options = {}){
    const markup = String(text || '');
    if(!markup.trim()){
      return false;
    }
    if(options.markupPattern instanceof RegExp){
      return options.markupPattern.test(markup);
    }
    return /<(svg|canvas|path|circle|rect|line|polyline|polygon|g|text|table|div)\b/i.test(markup);
  }

  function payloadHasRenderableContent(payload, options = {}){
    if(!payload || typeof payload !== 'object'){
      return false;
    }
    if(payload.__graphitixKind === 'fragment-payload' && Array.isArray(payload.nodes)){
      return payload.nodes.some(node => textHasMeaningfulMarkup(node?.markup, options));
    }
    const fragment = payload.fragment || null;
    if(fragment){
      if(typeof fragment.querySelector === 'function'){
        const selectors = Array.isArray(options.selectors) && options.selectors.length
          ? options.selectors
          : ['svg', 'canvas', 'table', '.plotly', '.chart', '[data-render-cache-node]'];
        if(selectors.some(selector => {
          try{ return !!fragment.querySelector(selector); }
          catch(_err){ return false; }
        })){
          return true;
        }
      }
      if(Number(fragment.childNodes?.length || 0) > 0){
        return true;
      }
    }
    if(Number(payload.count) > 0){
      return true;
    }
    if(typeof payload.markup === 'string' || typeof payload.html === 'string' || typeof payload.svg === 'string'){
      return textHasMeaningfulMarkup(payload.markup || payload.html || payload.svg, options);
    }
    return false;
  }

  namespace.payloadHasRenderableContent = payloadHasRenderableContent;
  namespace.getGraphicPayload = getGraphicPayload;
  namespace.isGraphFrameLayoutAuthorityWrite = function isGraphFrameLayoutAuthorityWrite(options = {}){
    if(options.layoutAuthority === true || options.writeLayout === true || options.writeStyle === true){
      return true;
    }
    const reason = String(options.reason || '').toLowerCase();
    return !!(
      reason.includes('layout-apply')
      || reason.includes('apply-layout')
      || reason.includes('restore-layout')
      || reason.includes('manual-resize')
      || reason.includes('user-resize')
      || reason.includes('publication-style')
      || reason.includes('regression-size')
      || reason.includes('external-layout-authority')
    );
  };


  namespace.validateRenderCache = function validateRenderCache(cache, meta = {}, spec = {}){
    const componentKey = spec.componentKey || meta.type || meta.componentKey || null;
    const wrapper = getWrapper(meta);
    const tabId = String(meta.tabId || meta.tab?.id || '').trim() || null;
    const ownerTabId = wrapper?.tabId ? String(wrapper.tabId) : null;
    const ownerType = wrapper?.type ? String(wrapper.type) : null;
    const expectedType = componentKey ? String(componentKey) : null;
    const expectedPayloadSignature = meta.payloadSignature ?? meta.tab?.payloadSignature ?? null;
    const expectedLayoutSignature = meta.layoutSignature ?? meta.tab?.layoutSignature ?? null;
    const payloadSignature = wrapper?.payloadSignature ?? null;
    const layoutSignature = wrapper?.layoutSignature ?? null;
    let ok = true;
    let reason = null;
    if(!cache || typeof cache !== 'object'){
      ok = false;
      reason = 'missing-cache-object';
    }else if(ownerTabId && tabId && ownerTabId !== tabId){
      ok = false;
      reason = 'owner-tab-mismatch';
    }else if(ownerType && expectedType && ownerType !== expectedType){
      ok = false;
      reason = 'owner-type-mismatch';
    }else if(payloadSignature !== null && expectedPayloadSignature !== null && payloadSignature !== expectedPayloadSignature){
      ok = false;
      reason = 'payload-signature-mismatch';
    }else if(layoutSignature !== null && expectedLayoutSignature !== null && layoutSignature !== expectedLayoutSignature && meta?.renderCache?.archiveBacked !== true){
      ok = false;
      reason = 'layout-signature-mismatch';
    }
    const graphicPayload = getGraphicPayload(cache);
    let graphOk = payloadHasRenderableContent(graphicPayload, spec.graph || spec);
    const requiredSections = Array.isArray(spec.requiredSections) ? spec.requiredSections : [];
    const missingSections = requiredSections.filter(key => !payloadHasRenderableContent(cache?.[key], spec.sections?.[key] || {}));
    const graphFallbackSections = Array.isArray(spec.graphFallbackSections)
      ? spec.graphFallbackSections.filter(key => typeof key === 'string' && key.trim())
      : [];
    const graphFallbackRenderable = graphFallbackSections.filter(key => payloadHasRenderableContent(cache?.[key], spec.sections?.[key] || {}));
    const usedGraphFallback = !!(!graphOk && graphFallbackRenderable.length);
    if(usedGraphFallback){
      graphOk = true;
    }
    if(ok && spec.requireGraph !== false && !graphOk){
      ok = false;
      reason = 'missing-graph-cache';
    }else if(ok && missingSections.length){
      ok = false;
      reason = `missing-section:${missingSections.join(',')}`;
    }
    const sectionCounts = {};
    if(cache && typeof cache === 'object'){
      Object.keys(cache).forEach(key => {
        const value = cache[key];
        if(value && typeof value === 'object'){
          sectionCounts[key] = Number(value.count || value.nodes?.length || value.fragment?.childNodes?.length || 0);
        }
      });
    }
    if(!ok){
      debug('Debug: component render cache validation rejected', {
        componentKey,
        tabId,
        reason,
        ownerTabId,
        ownerType,
        graphOk,
        graphFallbackSections,
        graphFallbackRenderable,
        missingSections,
        sectionCounts
      });
      return false;
    }
    debug('Debug: component render cache validation accepted', {
      componentKey,
      tabId,
      graphOk,
      graphFallbackUsed: usedGraphFallback,
      graphFallbackSections,
      graphFallbackRenderable,
      sectionCounts,
      reason: meta.reason || 'render-cache-validate'
    });
    return true;
  };

  function extractTabId(tabLike, meta = {}){
    return (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || meta?.tabId || null;
  }



  const restoreTransactionStack = namespace.__restoreTransactionStack || [];
  namespace.__restoreTransactionStack = restoreTransactionStack;

  function normalizeLifecycleComponentKey(value){
    return String(value || '').trim();
  }

  namespace.beginRestoreTransaction = function beginRestoreTransaction(componentKey, meta = {}){
    const key = normalizeLifecycleComponentKey(componentKey || meta.componentKey || meta.type || meta.tab?.type || 'component');
    const tabId = requireExplicitTabId(meta, 'restore-transaction', key);
    if(!tabId){
      return function endMissingRestoreTransaction(){ return false; };
    }
    const token = {
      componentKey: key,
      tabId,
      reason: meta.reason || 'restore-transaction',
      startedAt: Date.now(),
      suppressDraw: meta.suppressDraw === true,
      suppressAutoDraw: meta.suppressAutoDraw === true || meta.suppressDraw === true,
      suppressResizeDraw: meta.suppressResizeDraw === true || meta.suppressDraw === true,
      suppressStatsRecompute: meta.suppressStatsRecompute === true || meta.suppressDraw === true,
      suppressAutosize: meta.suppressAutosize !== false,
      passiveControls: meta.passiveControls !== false,
      authoritativeRenderRestore: meta.authoritativeRenderRestore === true
    };
    restoreTransactionStack.push(token);
    debug('Debug: lifecycle restore transaction started', token);
    let closed = false;
    return function endRestoreTransaction(extra = {}){
      if(closed){ return false; }
      closed = true;
      const idx = restoreTransactionStack.lastIndexOf(token);
      if(idx >= 0){ restoreTransactionStack.splice(idx, 1); }
      debug('Debug: lifecycle restore transaction ended', {
        componentKey: key,
        tabId,
        reason: extra.reason || token.reason,
        elapsedMs: Date.now() - token.startedAt
      });
      return true;
    };
  };

  namespace.getRestoreTransaction = function getRestoreTransaction(componentKey, meta = {}){
    const key = normalizeLifecycleComponentKey(componentKey || meta.componentKey || meta.type || meta.tab?.type || '');
    const tabId = resolveExplicitTabIdFromMeta(meta);
    if(!tabId){
      return null;
    }
    for(let i = restoreTransactionStack.length - 1; i >= 0; i -= 1){
      const entry = restoreTransactionStack[i];
      if(key && entry.componentKey && entry.componentKey !== key){ continue; }
      if(tabId && entry.tabId && entry.tabId !== tabId){ continue; }
      return entry;
    }
    return null;
  };

  namespace.isRestoreTransactionActive = function isRestoreTransactionActive(componentKey, meta = {}){
    return !!namespace.getRestoreTransaction(componentKey, meta);
  };

  namespace.withRestoreTransaction = function withRestoreTransaction(componentKey, meta, fn){
    const end = namespace.beginRestoreTransaction(componentKey, meta || {});
    try{
      const result = typeof fn === 'function' ? fn() : undefined;
      if(result && typeof result.then === 'function'){
        return result.finally(() => end({ reason: meta?.reason || 'restore-transaction-async' }));
      }
      end({ reason: meta?.reason || 'restore-transaction' });
      return result;
    }catch(err){
      end({ reason: `${meta?.reason || 'restore-transaction'}:error` });
      throw err;
    }
  };

  namespace.derivedCache = namespace.derivedCache || {};
  namespace.derivedCache.create = function createDerivedCache(componentKey, spec = {}){
    const key = normalizeLifecycleComponentKey(componentKey || spec.componentKey || 'component');
    const values = new Map();
    function normalizeSignature(signature){
      return String(signature == null ? '' : signature);
    }
    return {
      componentKey: key,
      serializable: spec.serializable === true,
      get(signature){
        return values.get(normalizeSignature(signature)) || null;
      },
      set(signature, value){
        const sig = normalizeSignature(signature);
        if(!sig){ return null; }
        values.set(sig, value);
        debug('Debug: derived cache stored', { componentKey: key, signature: sig, size: values.size });
        return value;
      },
      getOrBuild(signature, builder, meta = {}){
        const sig = normalizeSignature(signature);
        if(sig && values.has(sig)){
          debug('Debug: derived cache hit', { componentKey: key, signature: sig, reason: meta.reason || null });
          return values.get(sig);
        }
        const value = typeof builder === 'function' ? builder() : null;
        if(sig && value != null){ values.set(sig, value); }
        debug('Debug: derived cache built', { componentKey: key, signature: sig, reason: meta.reason || null, cached: sig ? values.has(sig) : false });
        return value;
      },
      clear(reason = 'clear'){
        const size = values.size;
        values.clear();
        debug('Debug: derived cache cleared', { componentKey: key, size, reason });
        return size;
      },
      snapshot(){
        return { componentKey: key, serializable: spec.serializable === true, size: values.size };
      }
    };
  };



  const lifecycleEventLog = namespace.__eventLog || [];
  namespace.__eventLog = lifecycleEventLog;
  const lifecycleEventListeners = namespace.__eventListeners || new Set();
  namespace.__eventListeners = lifecycleEventListeners;
  namespace.onLifecycleEvent = function onLifecycleEvent(listener){
    if(typeof listener !== 'function'){
      return () => {};
    }
    lifecycleEventListeners.add(listener);
    return function unsubscribeLifecycleEvent(){
      lifecycleEventListeners.delete(listener);
    };
  };
  namespace.emitLifecycleEvent = function emitLifecycleEvent(event = {}){
    const normalized = {
      index: Number(namespace.__eventSeq = (Number(namespace.__eventSeq) || 0) + 1),
      at: Date.now(),
      componentKey: normalizeLifecycleComponentKey(event.componentKey || event.type || event.component || ''),
      type: normalizeLifecycleComponentKey(event.type || event.componentKey || event.component || ''),
      tabId: event.tabId || event.workspaceTabId || event.tab?.id || null,
      action: event.action || event.kind || 'event',
      reason: event.reason || null,
      phase: event.phase || null,
      details: event.details || null
    };
    lifecycleEventLog.push(normalized);
    if(lifecycleEventLog.length > 10000){
      lifecycleEventLog.splice(0, lifecycleEventLog.length - 10000);
    }
    if(isDebugEnabled()){
      console.debug('Debug: lifecycle event', normalized);
    }
    lifecycleEventListeners.forEach(listener => {
      try {
        listener(normalized);
      } catch (err) {
        warn('Debug: lifecycle event listener error', { message: err?.message || String(err) });
      }
    });
    if(typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function'){
      try {
        global.dispatchEvent(new global.CustomEvent('graphitix:lifecycle-event', {
          detail: normalized
        }));
      } catch (err) {
        warn('Debug: lifecycle event dispatch failed', { message: err?.message || String(err) });
      }
    }
    return normalized;
  };
  namespace.getLifecycleEvents = function getLifecycleEvents(cursor = 0){
    return lifecycleEventLog.slice(Math.max(0, Number(cursor) || 0));
  };
  namespace.getLifecycleEventCursor = function getLifecycleEventCursor(){
    return lifecycleEventLog.length;
  };

  const renderRestoreTransactionStack = namespace.__renderRestoreTransactionStack || [];
  namespace.__renderRestoreTransactionStack = renderRestoreTransactionStack;
  const postRestoreDrawSuppressions = namespace.__postRestoreDrawSuppressions || Object.create(null);
  namespace.__postRestoreDrawSuppressions = postRestoreDrawSuppressions;

  function buildSuppressionKey(componentKey, tabId){
    const key = normalizeLifecycleComponentKey(componentKey || 'component') || 'component';
    return `${key}::${tabId || '__missing__'}`;
  }

  function markPostRestoreDrawSuppression(componentKey, tabId, meta = {}){
    const resolvedTabId = String(tabId || '').trim() || requireExplicitTabId(meta, 'post-restore-draw-suppression', componentKey);
    if(!resolvedTabId){
      return null;
    }
    const key = buildSuppressionKey(componentKey, resolvedTabId);
    const delayMs = Number.isFinite(Number(meta.delayMs)) ? Math.max(0, Number(meta.delayMs)) : 1400;
    const count = Number.isFinite(Number(meta.count)) ? Math.max(0, Math.floor(Number(meta.count))) : 16;
    postRestoreDrawSuppressions[key] = {
      componentKey: normalizeLifecycleComponentKey(componentKey || 'component'),
      tabId: resolvedTabId,
      until: Date.now() + delayMs,
      count,
      reason: meta.reason || 'post-render-cache-restore'
    };
    namespace.emitLifecycleEvent({ componentKey, tabId: resolvedTabId, action: 'post-restore-draw-suppression-start', reason: meta.reason || 'post-render-cache-restore', details: { delayMs, count } });
    return postRestoreDrawSuppressions[key];
  }

  function consumePostRestoreSuppression(componentKey, meta = {}){
    const key = normalizeLifecycleComponentKey(componentKey || meta.componentKey || meta.type || 'component');
    const tabId = resolveExplicitTabIdFromMeta(meta);
    if(!tabId){
      return null;
    }
    const candidates = [buildSuppressionKey(key, tabId)];
    const now = Date.now();
    for(const candidate of candidates){
      const entry = postRestoreDrawSuppressions[candidate];
      if(!entry){ continue; }
      const active = Number(entry.until) > now || Number(entry.count) > 0;
      if(!active){
        delete postRestoreDrawSuppressions[candidate];
        continue;
      }
      if(Number(entry.count) > 0){ entry.count -= 1; }
      if(Number(entry.count) <= 0 && Number(entry.until) <= now){
        delete postRestoreDrawSuppressions[candidate];
      }
      return entry;
    }
    return null;
  }

  namespace.markPostRestoreDrawSuppression = markPostRestoreDrawSuppression;
  namespace.clearPostRestoreDrawSuppression = function clearPostRestoreDrawSuppression(componentKey, meta = {}){
    const key = normalizeLifecycleComponentKey(componentKey || meta.componentKey || meta.type || 'component');
    const tabId = requireExplicitTabId(meta, 'clear-post-restore-suppression', key);
    if(!tabId){
      return false;
    }
    delete postRestoreDrawSuppressions[buildSuppressionKey(key, tabId)];
    namespace.emitLifecycleEvent({ componentKey: key, tabId, action: 'post-restore-draw-suppression-cleared', reason: meta.reason || 'clear-post-restore-suppression' });
    return true;
  };

  function normalizeTransactionFlags(meta = {}){
    return {
      suppressDraw: meta.suppressDraw === true,
      suppressAutoDraw: meta.suppressAutoDraw === true || meta.suppressDraw === true,
      suppressResizeDraw: meta.suppressResizeDraw === true || meta.suppressDraw === true,
      suppressStatsRecompute: meta.suppressStatsRecompute === true || meta.suppressDraw === true,
      passiveControls: meta.passiveControls !== false,
      authoritativeRenderRestore: meta.authoritativeRenderRestore === true,
      allowExplicitUserDraw: meta.allowExplicitUserDraw === true,
      postSuppressMs: Number.isFinite(Number(meta.postSuppressMs)) ? Math.max(0, Number(meta.postSuppressMs)) : 1400,
      postSuppressCount: Number.isFinite(Number(meta.postSuppressCount)) ? Math.max(0, Math.floor(Number(meta.postSuppressCount))) : 16
    };
  }

  namespace.beginRenderCacheRestoreTransaction = function beginRenderCacheRestoreTransaction(componentKey, meta = {}){
    const key = normalizeLifecycleComponentKey(componentKey || meta.componentKey || meta.type || meta.tab?.type || 'component');
    const tabId = requireExplicitTabId(meta, 'render-cache-restore-transaction', key);
    if(!tabId){
      return function endMissingRenderCacheRestoreTransaction(){ return false; };
    }
    const flags = normalizeTransactionFlags({ suppressDraw: true, suppressAutoDraw: true, suppressResizeDraw: true, suppressStatsRecompute: true, authoritativeRenderRestore: true, ...meta });
    const token = {
      componentKey: key,
      tabId,
      reason: meta.reason || 'render-cache-restore-transaction',
      startedAt: Date.now(),
      ...flags
    };
    renderRestoreTransactionStack.push(token);
    namespace.emitLifecycleEvent({ componentKey: key, tabId, action: 'render-cache-restore-transaction-start', reason: token.reason, details: flags });
    let closed = false;
    return function endRenderCacheRestoreTransaction(extra = {}){
      if(closed){ return false; }
      closed = true;
      const idx = renderRestoreTransactionStack.lastIndexOf(token);
      if(idx >= 0){ renderRestoreTransactionStack.splice(idx, 1); }
      if(extra.cancelPostSuppress !== true && token.suppressDraw === true){
        markPostRestoreDrawSuppression(key, tabId, {
          delayMs: token.postSuppressMs,
          count: token.postSuppressCount,
          reason: extra.reason || token.reason || 'render-cache-restore-transaction-end'
        });
      }
      namespace.emitLifecycleEvent({ componentKey: key, tabId, action: 'render-cache-restore-transaction-end', reason: extra.reason || token.reason, details: { elapsedMs: Date.now() - token.startedAt, postSuppress: extra.cancelPostSuppress !== true } });
      return true;
    };
  };

  namespace.withRenderCacheRestoreTransaction = function withRenderCacheRestoreTransaction(componentKey, meta, fn){
    const end = namespace.beginRenderCacheRestoreTransaction(componentKey, meta || {});
    try{
      const result = typeof fn === 'function' ? fn() : undefined;
      if(result && typeof result.then === 'function'){
        return result.finally(() => end({ reason: meta?.reason || 'render-cache-restore-transaction-async' }));
      }
      end({ reason: meta?.reason || 'render-cache-restore-transaction' });
      return result;
    }catch(err){
      end({ reason: `${meta?.reason || 'render-cache-restore-transaction'}:error` });
      throw err;
    }
  };

  namespace.getRenderCacheRestoreTransaction = function getRenderCacheRestoreTransaction(componentKey, meta = {}){
    const key = normalizeLifecycleComponentKey(componentKey || meta.componentKey || meta.type || meta.tab?.type || '');
    const tabId = resolveExplicitTabIdFromMeta(meta);
    if(!tabId){
      return null;
    }
    for(let i = renderRestoreTransactionStack.length - 1; i >= 0; i -= 1){
      const entry = renderRestoreTransactionStack[i];
      if(key && entry.componentKey && entry.componentKey !== key){ continue; }
      if(tabId && entry.tabId && entry.tabId !== tabId){ continue; }
      return entry;
    }
    return null;
  };

  namespace.shouldSuppressDraw = function shouldSuppressDraw(componentKey, meta = {}){
    const reason = String(meta.reason || meta.source || '').toLowerCase();
    if(meta.forceDraw === true || meta.userInitiated === true || reason.includes('user-') || reason.includes('manual-draw')){
      return false;
    }
    const tx = namespace.getRenderCacheRestoreTransaction(componentKey, meta) || namespace.getRestoreTransaction?.(componentKey, meta) || null;
    if(!tx){
      const post = consumePostRestoreSuppression(componentKey, meta);
      if(post){
        namespace.emitLifecycleEvent({ componentKey, tabId: resolveTabIdFromMeta(meta), action: 'draw-suppressed', reason: meta.reason || post.reason || 'post-render-cache-restore', details: { source: meta.source || null, postRestore: true } });
        return true;
      }
      return false;
    }
    if(tx.suppressDraw === true){ return true; }
    if(tx.suppressAutoDraw === true && (reason.includes('auto') || reason.includes('initial') || reason.includes('payload') || reason.includes('restore'))){ return true; }
    if(tx.suppressResizeDraw === true && (reason.includes('resize') || reason.includes('layout') || reason.includes('sync') || reason.includes('observer'))){ return true; }
    return false;
  };

  function cssNumber(value){
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function isElementChainVisible(element){
    if(!element || !element.isConnected){
      return false;
    }
    let node = element;
    while(node && node.nodeType === 1){
      if(node.hasAttribute?.('hidden') || node.getAttribute?.('aria-hidden') === 'true'){
        return false;
      }
      try{
        const style = typeof global.getComputedStyle === 'function' ? global.getComputedStyle(node) : null;
        if(style){
          if(style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'){
            return false;
          }
          const opacity = cssNumber(style.opacity);
          if(Number.isFinite(opacity) && opacity <= 0){
            return false;
          }
        }
      }catch(_err){}
      node = node.parentElement;
    }
    return true;
  }

  function hasRenderableBox(element){
    if(!element || typeof element.getBoundingClientRect !== 'function'){
      return null;
    }
    try{
      const rect = element.getBoundingClientRect();
      const width = Number(rect?.width);
      const height = Number(rect?.height);
      if(!Number.isFinite(width) || !Number.isFinite(height)){
        return null;
      }
      return width > 1 && height > 1;
    }catch(_err){
      return null;
    }
  }

  function hasSvgNodeGeometry(node){
    if(!node || typeof node !== 'object'){
      return false;
    }
    if(typeof node.getBBox === 'function'){
      try{
        const box = node.getBBox();
        if(box && Number.isFinite(box.width) && Number.isFinite(box.height) && (Number(box.width) > 0 || Number(box.height) > 0)){
          return true;
        }
      }catch(_err){}
    }
    const tag = String(node.tagName || '').toLowerCase();
    if(tag === 'path'){
      return String(node.getAttribute?.('d') || '').trim().length > 0;
    }
    if(tag === 'circle'){
      return Number(node.getAttribute?.('r')) > 0;
    }
    if(tag === 'ellipse'){
      return Number(node.getAttribute?.('rx')) > 0 || Number(node.getAttribute?.('ry')) > 0;
    }
    if(tag === 'line'){
      const x1 = Number(node.getAttribute?.('x1'));
      const y1 = Number(node.getAttribute?.('y1'));
      const x2 = Number(node.getAttribute?.('x2'));
      const y2 = Number(node.getAttribute?.('y2'));
      return Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2) && (x1 !== x2 || y1 !== y2);
    }
    if(tag === 'polyline' || tag === 'polygon'){
      const points = String(node.getAttribute?.('points') || '').trim();
      return points.split(/\s+/).length >= 2;
    }
    if(tag === 'text'){
      return String(node.textContent || '').trim().length > 0;
    }
    const width = Number(node.getAttribute?.('width'));
    const height = Number(node.getAttribute?.('height'));
    return (Number.isFinite(width) && width > 0) || (Number.isFinite(height) && height > 0);
  }

  namespace.hasRenderableGraphContent = function hasRenderableGraphContent(root){
    if(!root || typeof root.querySelector !== 'function'){
      return false;
    }
    if(!isElementChainVisible(root)){
      return false;
    }
    const rootBox = hasRenderableBox(root);
    if(rootBox === false){
      return false;
    }
    const canvases = Array.from(root.querySelectorAll('canvas'));
    for(let i = 0; i < canvases.length; i += 1){
      const canvas = canvases[i];
      if(!isElementChainVisible(canvas)){
        continue;
      }
      const box = hasRenderableBox(canvas);
      const pixelWidth = Number(canvas.width) || 0;
      const pixelHeight = Number(canvas.height) || 0;
      if((box !== false && pixelWidth > 1 && pixelHeight > 1) || box === true){
        return true;
      }
    }
    const svgs = Array.from(root.querySelectorAll('.svgbox svg, [id$="Plot"] svg, svg'));
    for(let i = 0; i < svgs.length; i += 1){
      const svg = svgs[i];
      if(!svg || !isElementChainVisible(svg)){
        continue;
      }
      const svgBox = hasRenderableBox(svg);
      if(svgBox === false){
        continue;
      }
      const candidates = Array.from(svg.querySelectorAll('path,circle,ellipse,rect,line,polyline,polygon,text,image,foreignObject,foreignobject,use'));
      for(let j = 0; j < candidates.length; j += 1){
        const node = candidates[j];
        if(!isElementChainVisible(node)){
          continue;
        }
        if(hasSvgNodeGeometry(node)){
          return true;
        }
      }
    }
    return false;
  };

  namespace.canReuseLiveDom = function canReuseLiveDom(tab, meta = {}){
    if(!tab || !tab.id || !tab.type || meta.forceReload === true){
      return false;
    }
    const root = meta.root || Shared.workspaceTabs?.getMountedRoot?.(tab, tab.type) || Shared.workspaceTabs?.getSessionRecord?.(tab, tab.type)?.dom?.root || null;
    if(!namespace.hasRenderableGraphContent(root)){
      return false;
    }
    const cached = meta.cachedWorkspace || null;
    const payloadSignature = meta.payloadSignature ?? tab.payloadSignature ?? null;
    const layoutSignature = meta.layoutSignature ?? tab.layoutSignature ?? null;
    const payloadOk = !cached || cached.payloadSignature === payloadSignature;
    const layoutOk = !cached || cached.layoutSignature === layoutSignature;
    return !!(payloadOk && layoutOk);
  };

  namespace.bindTabActivation = function bindTabActivation(options = {}){
    const component = options.component || null;
    const componentKey = options.componentKey || component?.type || null;
    function sharedActivateTab(tab, meta = {}){
      const targetTabId = extractTabId(tab, meta);
      const prepareRuntimeTargetOnly = meta?.prepareRuntimeTarget === true || meta?.bindOnly === true;
      if(component){
        component.__boundTabId = targetTabId || component.__boundTabId || null;
      }
      let root = typeof options.resolveRoot === 'function' ? options.resolveRoot(tab || targetTabId || null, meta) : null;
      if(typeof options.setRoot === 'function'){
        options.setRoot(root, meta);
      }
      let rebound = false;
      if(typeof options.ensureBindings === 'function'){
        rebound = !!options.ensureBindings(tab || targetTabId || null, meta);
        if(rebound){
          debug('Debug: component activation handled by shared DOM rebind', {
            componentKey,
            tabId: targetTabId,
            reason: meta.reason || 'activate-tab',
            prepareRuntimeTargetOnly
          });
        }
      }
      if(component && !component.ready && typeof options.init === 'function'){
        options.init({ root: root || undefined, tabId: targetTabId || undefined, reason: meta.reason || 'activate-tab' });
        if(prepareRuntimeTargetOnly){
          if(typeof options.getSentinel === 'function'){
            component.__domSentinel = options.getSentinel() || component.__domSentinel || null;
          }
          debug('Debug: component runtime target prepared during init', { componentKey, tabId: targetTabId, reason: meta.reason || 'prepare-runtime-target' });
        }
        return true;
      }
      if(prepareRuntimeTargetOnly){
        if(typeof options.getSentinel === 'function' && component){
          component.__domSentinel = options.getSentinel() || component.__domSentinel || null;
        }
        debug('Debug: component runtime target prepared', {
          componentKey,
          tabId: targetTabId,
          rebound,
          reason: meta.reason || 'prepare-runtime-target'
        });
        return true;
      }
      if(typeof options.afterReady === 'function'){
        options.afterReady(tab, meta, { root, tabId: targetTabId, rebound });
      }
      if(typeof options.ensureRenderReadiness === 'function'){
        try{
          options.ensureRenderReadiness(tab, meta, {
            root,
            tabId: targetTabId,
            rebound
          });
        }catch(err){
          warn('Debug: component shared activation render-readiness error', {
            componentKey,
            tabId: targetTabId,
            reason: meta.reason || 'activate-tab',
            message: err?.message || String(err)
          });
        }
      }
      if(typeof options.getSentinel === 'function' && component){
        component.__domSentinel = options.getSentinel() || component.__domSentinel || null;
      }
      debug('Debug: component shared activation complete', { componentKey, tabId: targetTabId, reason: meta.reason || 'activate-tab' });
      return true;
    }
    sharedActivateTab.__supportsPrepareRuntimeTarget = true;
    return sharedActivateTab;
  };

  namespace.createDeactivateHandler = function createDeactivateHandler(options = {}){
    const component = options.component || null;
    const componentKey = options.componentKey || component?.type || null;
    return function sharedDeactivateTab(tab, meta = {}){
      const tabId = extractTabId(tab, meta);
      if(typeof options.cancel === 'function'){
        try{ options.cancel(tab, meta); }
        catch(err){ warn('Debug: component deactivate cancel error', { componentKey, err: err?.message || String(err) }); }
      }
      if(component){
        component.__runtimeGeneration = (Number(component.__runtimeGeneration) || 0) + 1;
        try{
          if(tabId){
            component.__asyncScope?.cancelAllForTab?.(tabId, meta.reason || 'deactivate-tab');
          }else{
            warn('Debug: component deactivate skipped async-scope cancel without tab id', {
              componentKey,
              reason: meta.reason || 'deactivate-tab'
            });
          }
        }catch(err){
          warn('Debug: component deactivate async-scope cancel error', { componentKey, tabId, err: err?.message || String(err) });
        }
      }
      debug('Debug: component shared deactivation complete', {
        componentKey,
        tabId,
        generation: component?.__runtimeGeneration || null,
        reason: meta.reason || 'deactivate-tab'
      });
      return true;
    };
  };



  const descriptorRegistry = namespace.__descriptorRegistry || new Map();
  namespace.__descriptorRegistry = descriptorRegistry;

  function cloneForLifecycle(value){
    if(value == null){ return value; }
    try{
      if(typeof global.structuredClone === 'function'){
        return global.structuredClone(value);
      }
    }catch(_err){}
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(_err){ return value; }
  }

  const TRANSIENT_RUNTIME_KEYS = new Set([
    'activecontroller',
    'activepromise',
    'activetask',
    'animationframeid',
    'asyncstate',
    'asynctoken',
    'controller',
    'deferredhiddendrawoptions',
    'drawasyncstate',
    'drawinprogress',
    'drawscheduled',
    'drawtoken',
    'intervalid',
    'pendingdrawoptions',
    'pendingdrawopts',
    'pendingpromise',
    'pendingrequests',
    'pendingtask',
    'promise',
    'rafid',
    'requestanimationframeid',
    'restorepending',
    'rotationpending',
    'rotationpendinglogged',
    'signal',
    'skipnextdraw',
    'statscomputationpending',
    'statsrestorepending',
    'statstoken',
    'timeoutid',
    'timerid',
    'worker',
    'workerapi',
    'workers'
  ]);

  function isTransientRuntimeKey(key){
    const normalized = String(key || '').replace(/[-_\s]/g, '').toLowerCase();
    if(!normalized || normalized === '__runtimeowner'){
      return false;
    }
    if(TRANSIENT_RUNTIME_KEYS.has(normalized)){
      return true;
    }
    return /^pending[a-z0-9]/.test(normalized)
      || /pending$/.test(normalized)
      || /promise$/.test(normalized)
      || /controller$/.test(normalized)
      || /worker$/.test(normalized)
      || /(timeout|interval|timer|raf|animationframe).*id$/.test(normalized);
  }

  function isPlainRuntimeObject(value){
    if(!value || typeof value !== 'object'){
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function sanitizeRuntimeValue(value, state, path){
    if(value == null){
      return value;
    }
    const valueType = typeof value;
    if(valueType === 'function' || valueType === 'symbol' || valueType === 'bigint'){
      state.removed.push(path || '<root>');
      return undefined;
    }
    if(valueType !== 'object'){
      return value;
    }
    if(typeof value.then === 'function'){
      state.removed.push(path || '<root>');
      return undefined;
    }
    if(value.nodeType || value === global || value === global.window || value instanceof WeakMap || value instanceof WeakSet){
      state.removed.push(path || '<root>');
      return undefined;
    }
    if(state.seen.has(value)){
      state.removed.push(path || '<root>');
      return undefined;
    }
    state.seen.add(value);
    if(value instanceof Date){
      return value.toISOString();
    }
    if(Array.isArray(value)){
      const next = [];
      value.forEach((item, index) => {
        const sanitized = sanitizeRuntimeValue(item, state, `${path || '<root>'}[${index}]`);
        if(sanitized !== undefined){
          next.push(sanitized);
        }
      });
      return next;
    }
    if(value instanceof Map){
      const next = {};
      value.forEach((entryValue, entryKey) => {
        const key = String(entryKey);
        if(isTransientRuntimeKey(key)){
          state.removed.push(path ? `${path}.${key}` : key);
          return;
        }
        const sanitized = sanitizeRuntimeValue(entryValue, state, path ? `${path}.${key}` : key);
        if(sanitized !== undefined){
          next[key] = sanitized;
        }
      });
      return next;
    }
    if(value instanceof Set){
      const next = [];
      Array.from(value).forEach((item, index) => {
        const sanitized = sanitizeRuntimeValue(item, state, `${path || '<root>'}[${index}]`);
        if(sanitized !== undefined){
          next.push(sanitized);
        }
      });
      return next;
    }
    if(!isPlainRuntimeObject(value)){
      state.removed.push(path || '<root>');
      return undefined;
    }
    const next = {};
    Object.keys(value).forEach(key => {
      const childPath = path ? `${path}.${key}` : key;
      if(isTransientRuntimeKey(key)){
        state.removed.push(childPath);
        return;
      }
      const sanitized = sanitizeRuntimeValue(value[key], state, childPath);
      if(sanitized !== undefined){
        next[key] = sanitized;
      }
    });
    return next;
  }

  namespace.sanitizeRuntimeSnapshot = function sanitizeRuntimeSnapshot(snapshot, meta = {}){
    if(!snapshot || typeof snapshot !== 'object'){
      return snapshot || null;
    }
    const state = { seen: new WeakSet(), removed: [] };
    const sanitized = sanitizeRuntimeValue(snapshot, state, '') || {};
    if(state.removed.length){
      debug('Debug: transient runtime snapshot fields removed', {
        componentKey: meta.componentKey || meta.type || null,
        tabId: meta.tabId || meta.tab?.id || null,
        removed: state.removed,
        reason: meta.reason || 'sanitize-runtime-snapshot'
      });
    }
    return sanitized;
  };

  function stableStringify(value){
    const seen = new WeakSet();
    const normalize = input => {
      if(input === null || typeof input !== 'object'){
        return input;
      }
      if(seen.has(input)){
        return '[Circular]';
      }
      seen.add(input);
      if(Array.isArray(input)){
        return input.map(item => normalize(item));
      }
      const out = {};
      Object.keys(input).sort().forEach(key => {
        const item = input[key];
        if(typeof item !== 'function'){
          out[key] = normalize(item);
        }
      });
      return out;
    };
    try{ return JSON.stringify(normalize(value)); }
    catch(_err){ try{ return JSON.stringify(value); }catch(_err2){ return ''; } }
  }

  function payloadSignature(value){
    try{
      const session = global.Main?.session;
      if(session && typeof session.serializePayloadSignature === 'function'){
        return session.serializePayloadSignature(value);
      }
    }catch(_err){}
    return stableStringify(value);
  }

  function diffPayloadPaths(before, after, path = '', output = []){
    if(before === after){ return output; }
    const beforeIsObj = before && typeof before === 'object';
    const afterIsObj = after && typeof after === 'object';
    if(!beforeIsObj || !afterIsObj){
      if(payloadSignature(before) !== payloadSignature(after)){
        output.push(path || '<root>');
      }
      return output;
    }
    if(Array.isArray(before) || Array.isArray(after)){
      if(payloadSignature(before) !== payloadSignature(after)){
        output.push(path || '<root>');
      }
      return output;
    }
    const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])).sort();
    keys.forEach(key => {
      const nextPath = path ? `${path}.${key}` : key;
      if(!(key in before) || !(key in after)){
        output.push(nextPath);
        return;
      }
      diffPayloadPaths(before[key], after[key], nextPath, output);
    });
    return output;
  }

  function extractComponentKey(value){
    return String(value?.componentKey || value?.type || value?.component || value?.key || '').trim();
  }

  function resolveExplicitTabIdFromMeta(meta = {}){
    return String(meta.tabId || meta.workspaceTabId || meta.tab?.id || '').trim() || null;
  }

  function isStrictTabOwnership(meta = {}){
    return !!(
      meta.strictTabOwnership === true
      || meta.strictLifecycleOwnership === true
      || meta.strictRuntimeOwner === true
      || namespace.__strictRuntimeOwnership === true
      || isDebugEnabled()
      || (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test')
    );
  }

  function reportMissingTabOwnership(action, componentKey, meta = {}){
    const payload = {
      componentKey: String(componentKey || meta.componentKey || meta.type || '').trim() || null,
      action: action || meta.reason || 'lifecycle',
      reason: meta.reason || action || 'lifecycle'
    };
    if(isStrictTabOwnership(meta)){
      throw new Error(`componentLifecycle requires explicit tab id: ${JSON.stringify(payload)}`);
    }
    warn('Debug: component lifecycle skipped without explicit tab id', payload);
    return null;
  }

  function requireExplicitTabId(meta = {}, action = 'lifecycle', componentKey = null){
    const tabId = resolveExplicitTabIdFromMeta(meta);
    if(tabId){
      return tabId;
    }
    return reportMissingTabOwnership(action, componentKey, meta);
  }

  function resolveTabIdFromMeta(meta = {}){
    return resolveExplicitTabIdFromMeta(meta);
  }

  namespace.normalizePayloadEnvelope = function normalizePayloadEnvelope(payload, descriptor = {}, meta = {}){
    const componentKey = extractComponentKey(descriptor) || String(meta.type || meta.componentKey || payload?.type || payload?.component || '').trim() || null;
    const config = payload && typeof payload === 'object' ? (payload.config || {}) : {};
    return {
      version: Number(payload?.version || descriptor.schemaVersion || 3) || 3,
      component: componentKey,
      data: cloneForLifecycle(payload?.data ?? payload?.rawData ?? payload?.table ?? null),
      config: cloneForLifecycle(config),
      stats: cloneForLifecycle(payload?.stats ?? config?.stats ?? null),
      styles: cloneForLifecycle(payload?.styles ?? config?.fontStyles ?? config?.style ?? null),
      layout: cloneForLifecycle(payload?.layout ?? payload?.layoutState ?? config?.layout ?? null),
      annotations: cloneForLifecycle(payload?.annotations ?? config?.annotations ?? config?.significance ?? null),
      notes: cloneForLifecycle(payload?.notes ?? config?.notes ?? null),
      meta: {
        type: payload?.type || componentKey,
        sourceVersion: payload?.version ?? null,
        normalizedAt: meta.includeTimestamp === true ? Date.now() : null
      },
      original: cloneForLifecycle(payload || null)
    };
  };

  namespace.diffPayload = function diffPayload(before, after, descriptor = {}, meta = {}){
    const normalize = typeof descriptor.normalizePayload === 'function'
      ? descriptor.normalizePayload
      : namespace.normalizePayloadEnvelope;
    const left = normalize(before, descriptor, meta);
    const right = normalize(after, descriptor, meta);
    const changedPaths = diffPayloadPaths(left, right).slice(0, 200);
    return {
      ok: changedPaths.length === 0,
      changedPaths,
      beforeSignature: payloadSignature(left),
      afterSignature: payloadSignature(right)
    };
  };

  namespace.validatePayload = function validatePayload(payload, descriptor = {}, meta = {}){
    const componentKey = extractComponentKey(descriptor) || meta.componentKey || meta.type || null;
    const errors = [];
    if(!payload || typeof payload !== 'object'){
      errors.push('payload-not-object');
    }
    if(componentKey && payload && typeof payload === 'object'){
      const payloadType = String(payload.type || payload.component || componentKey || '').trim();
      if(payloadType && payloadType !== componentKey){
        errors.push(`payload-type-mismatch:${payloadType}`);
      }
    }
    if(typeof descriptor.validatePayload === 'function'){
      try{
        const custom = descriptor.validatePayload(payload, meta);
        if(custom === false){ errors.push('custom-validator-failed'); }
        if(Array.isArray(custom?.errors)){ errors.push(...custom.errors); }
      }catch(err){
        errors.push(`custom-validator-error:${err?.message || String(err)}`);
      }
    }
    return { ok: errors.length === 0, errors, componentKey };
  };

  function shouldRunLifecycleRoundTripSelfTest(meta = {}){
    if(meta.roundTripSelfTest === false){
      return false;
    }
    if(meta.roundTripSelfTest === true || meta.forceRoundTripSelfTest === true){
      return true;
    }
    if(global.Shared?.__payloadRoundTripSelfTest === true || global.GraphitixPayloadRoundTripSelfTest === true){
      return true;
    }
    try{
      if(global.localStorage?.getItem?.('graphitix.payloadRoundTripSelfTest') === '1'){
        return true;
      }
    }catch(err){
      // localStorage may be unavailable in sandboxed contexts.
    }
    return false;
  }

  function summarizeTopLevelChangedKeys(changedPaths = []){
    if(!Array.isArray(changedPaths) || !changedPaths.length){
      return [];
    }
    const keys = new Set();
    changedPaths.forEach(path => {
      const top = String(path || '').split('.')[0].trim();
      if(top){
        keys.add(top);
      }
    });
    return Array.from(keys);
  }

  namespace.roundTripPayload = function roundTripPayload(workspace, payload, meta = {}){
    const componentKey = meta.componentKey || meta.type || workspace?.type || null;
    const descriptor = namespace.getDescriptor(componentKey) || workspace?.__lifecycleDescriptor || { componentKey };
    if(!workspace || typeof workspace.loadFromPayload !== 'function' || typeof workspace.getPayload !== 'function'){
      return { skipped: true, reason: 'missing-payload-hooks', componentKey };
    }
    if(!shouldRunLifecycleRoundTripSelfTest(meta)){
      return { ok: true, skipped: true, reason: 'disabled', componentKey };
    }
    let beforeRuntime = null;
    let beforePayload = null;
    try{
      const payloadReadMeta = { ...meta, componentKey, reason: `${meta.reason || 'round-trip'}:capture-before-payload` };
      beforePayload = cloneForLifecycle(workspace.getPayload(payloadReadMeta));
      if(typeof workspace.captureRuntimeState === 'function'){
        beforeRuntime = cloneForLifecycle(workspace.captureRuntimeState({ ...meta, componentKey, reason: `${meta.reason || 'round-trip'}:capture-runtime` }));
      }
      const testPayload = cloneForLifecycle(payload || beforePayload || null);
      const validation = namespace.validatePayload(testPayload, descriptor, meta);
      if(!validation.ok){
        warn('Debug: lifecycle payload validation failed before round-trip', { componentKey, tabId: resolveTabIdFromMeta(meta), errors: validation.errors });
      }
      workspace.loadFromPayload(cloneForLifecycle(testPayload), {
        ...meta,
        componentKey,
        reason: `${meta.reason || 'round-trip'}:apply-test-payload`,
        skipDraw: true,
        skipInitialDraw: true,
        skipPayloadSizing: true,
        roundTripSelfTest: true
      });
      const after = cloneForLifecycle(workspace.getPayload({
        ...payloadReadMeta,
        reason: `${meta.reason || 'round-trip'}:capture-after-payload`
      }));
      const diff = namespace.diffPayload(testPayload, after, descriptor, meta);
      const changedTopLevelKeys = summarizeTopLevelChangedKeys(diff.changedPaths);
      if(!diff.ok){
        warn('Debug: lifecycle payload round-trip mismatch', {
          componentKey,
          tabId: resolveTabIdFromMeta(meta),
          changedPaths: diff.changedPaths.slice(0, 50),
          changedTopLevelKeys,
          totalChangedPaths: diff.changedPaths.length,
          reason: meta.reason || 'round-trip'
        });
      }else{
        debug('Debug: lifecycle payload round-trip passed', { componentKey, tabId: resolveTabIdFromMeta(meta), reason: meta.reason || 'round-trip' });
      }
      return { ...diff, skipped: false, validation, changedTopLevelKeys };
    }catch(err){
      console.error('lifecycle payload round-trip error', { componentKey, tabId: resolveTabIdFromMeta(meta), err });
      return { ok: false, skipped: false, error: err?.message || String(err), changedPaths: ['<round-trip-error>'], changedTopLevelKeys: ['<round-trip-error>'] };
    }finally{
      if(beforePayload && typeof workspace.loadFromPayload === 'function'){
        try{
          workspace.loadFromPayload(cloneForLifecycle(beforePayload), {
            ...meta,
            componentKey,
            reason: `${meta.reason || 'round-trip'}:restore-before-payload`,
            skipDraw: true,
            skipInitialDraw: true,
            skipPayloadSizing: true,
            roundTripSelfTestRestore: true
          });
        }catch(err){ console.error('lifecycle round-trip payload restore error', { componentKey, err }); }
      }
      if(beforeRuntime && typeof workspace.applyRuntimeState === 'function'){
        try{ workspace.applyRuntimeState(beforeRuntime, { ...meta, componentKey, reason: `${meta.reason || 'round-trip'}:restore-runtime` }); }
        catch(err){ console.error('lifecycle round-trip runtime restore error', { componentKey, err }); }
      }
    }
  };

  namespace.normalizeRenderCacheEnvelope = function normalizeRenderCacheEnvelope(cache, meta = {}, descriptor = {}){
    const componentKey = extractComponentKey(descriptor) || meta.componentKey || meta.type || cache?.__graphitixRenderCache?.type || null;
    const wrapper = meta.renderCache || cache?.__graphitixRenderCache || {};
    return {
      version: 2,
      component: componentKey,
      tabId: wrapper.tabId || meta.tabId || meta.tab?.id || null,
      payloadSignature: wrapper.payloadSignature ?? meta.payloadSignature ?? meta.tab?.payloadSignature ?? null,
      layoutSignature: wrapper.layoutSignature ?? meta.layoutSignature ?? meta.tab?.layoutSignature ?? null,
      createdAt: wrapper.createdAt || wrapper.capturedAt || Date.now(),
      sections: cloneForLifecycle(cache || {}),
      graphicKey: cache?.__graphitixRenderCache?.graphicKey || descriptor.renderCache?.graphicKey || null
    };
  };

  namespace.createRenderCacheValidator = function createRenderCacheValidator(descriptor = {}){
    return function descriptorRenderCacheValidator(cache, meta = {}){
      const spec = descriptor.renderCache || descriptor.cache || {};
      return namespace.validateRenderCache(cache, meta, {
        componentKey: extractComponentKey(descriptor),
        requireGraph: spec.requireGraph !== false,
        graph: spec.graph || {
          selectors: spec.selectors || spec.graphSelectors || [],
          markupPattern: spec.markupPattern || spec.graphMarkupPattern || undefined
        },
        requiredSections: spec.requiredSections || [],
        sections: spec.sections || {}
      });
    };
  };

  namespace.createAsyncScope = function createAsyncScope(componentKey, options = {}){
    const key = String(componentKey || options.componentKey || 'component');
    const tabScopes = new Map();
    function isStrict(meta = {}){
      return !!(
        meta.strictAsyncScope === true
        || meta.strictRuntimeOwner === true
        || namespace.__strictRuntimeOwnership === true
        || isDebugEnabled()
        || (typeof process !== 'undefined' && process?.env?.NODE_ENV === 'test')
      );
    }
    function missingTab(action, meta = {}){
      const payload = { componentKey: key, reason: meta.reason || action };
      if(isStrict(meta)){
        throw new Error(`componentLifecycle async scope requires an explicit tab id: ${JSON.stringify(payload)}`);
      }
      warn('Debug: component lifecycle async scope missing tab id', payload);
      return null;
    }
    function getScope(tabId, action = 'async-scope', meta = {}){
      const id = String(tabId || '').trim();
      if(!id){
        return missingTab(action, meta);
      }
      let scope = tabScopes.get(id);
      if(!scope){
        scope = { generation: 0, timers: new Set(), rafs: new Set(), promises: new Set(), cleanups: new Set() };
        tabScopes.set(id, scope);
      }
      return scope;
    }
    function makeMeta(meta = {}){
      const tabId = resolveExplicitTabIdFromMeta(meta);
      const scope = getScope(tabId, 'get-meta', meta);
      if(!scope){
        return null;
      }
      return { ...meta, componentKey: key, tabId, asyncGeneration: scope.generation };
    }
    function isCurrent(meta = {}){
      const tabId = resolveExplicitTabIdFromMeta(meta);
      const scope = getScope(tabId, 'is-current', meta);
      if(!scope){
        return false;
      }
      return Number(meta.asyncGeneration) === Number(scope.generation);
    }
    return {
      getMeta: makeMeta,
      isCurrent,
      nextToken(meta = {}){
        const tabId = resolveExplicitTabIdFromMeta(meta);
        const scope = getScope(tabId, 'next-token', meta);
        if(!scope){
          return null;
        }
        scope.generation += 1;
        return { ...meta, componentKey: key, tabId, asyncGeneration: scope.generation };
      },
      setTimeout(meta, fn, delay = 0){
        const scoped = makeMeta(meta || {});
        if(!scoped){
          return null;
        }
        const scope = getScope(scoped.tabId);
        const timer = global.setTimeout(() => {
          scope.timers.delete(timer);
          if(isCurrent(scoped)){
            fn(scoped);
          }else{
            debug('Debug: lifecycle async timeout skipped stale scope', { componentKey: key, tabId: scoped.tabId });
          }
        }, Math.max(0, Number(delay) || 0));
        scope.timers.add(timer);
        return timer;
      },
      clearTimeout(timer){
        if(timer == null){
          return false;
        }
        let cleared = false;
        tabScopes.forEach(scope => {
          if(scope?.timers?.has?.(timer)){
            try{ global.clearTimeout(timer); }catch(_err){}
            scope.timers.delete(timer);
            cleared = true;
          }
        });
        return cleared;
      },
      requestAnimationFrame(meta, fn){
        const scoped = makeMeta(meta || {});
        if(!scoped){
          return null;
        }
        const scope = getScope(scoped.tabId);
        const schedule = typeof global.requestAnimationFrame === 'function'
          ? global.requestAnimationFrame.bind(global)
          : cb => global.setTimeout(cb, 0);
        const cancel = typeof global.cancelAnimationFrame === 'function'
          ? global.cancelAnimationFrame.bind(global)
          : id => global.clearTimeout(id);
        let entry = null;
        const raf = schedule(() => {
          if(entry){
            scope.rafs.delete(entry);
          }
          if(isCurrent(scoped)){
            fn(scoped);
          }else{
            debug('Debug: lifecycle async frame skipped stale scope', { componentKey: key, tabId: scoped.tabId });
          }
        });
        entry = { id: raf, cancel };
        scope.rafs.add(entry);
        return raf;
      },
      cancelAnimationFrame(rafId){
        if(rafId == null){
          return false;
        }
        let cancelled = false;
        tabScopes.forEach(scope => {
          if(!scope?.rafs){
            return;
          }
          Array.from(scope.rafs).forEach(entry => {
            if(entry?.id === rafId){
              try{ entry.cancel(entry.id); }catch(_err){}
              scope.rafs.delete(entry);
              cancelled = true;
            }
          });
        });
        return cancelled;
      },
      registerCleanup(meta, cleanup){
        if(typeof cleanup !== 'function'){
          return () => {};
        }
        const scoped = makeMeta(meta || {});
        if(!scoped){
          return () => {};
        }
        const scope = getScope(scoped.tabId);
        if(!scope){
          return () => {};
        }
        scope.cleanups.add(cleanup);
        return () => {
          try{ scope.cleanups.delete(cleanup); }catch(_err){}
        };
      },
      runPromise(meta, promise, onResolve, onReject){
        const scoped = makeMeta(meta || {});
        if(!scoped){
          return Promise.resolve(promise);
        }
        const scope = getScope(scoped.tabId);
        const wrapped = Promise.resolve(promise)
          .then(value => {
            scope.promises.delete(wrapped);
            if(isCurrent(scoped) && typeof onResolve === 'function'){
              return onResolve(value, scoped);
            }
            return value;
          })
          .catch(err => {
            scope.promises.delete(wrapped);
            if(isCurrent(scoped) && typeof onReject === 'function'){
              return onReject(err, scoped);
            }
            throw err;
          });
        scope.promises.add(wrapped);
        return wrapped;
      },
      cancelAllForTab(tabId, reason = 'cancel-all'){
        const id = String(tabId || '').trim();
        const scope = getScope(id, 'cancel-all', { tabId: id, reason });
        if(!scope){
          return false;
        }
        scope.generation += 1;
        scope.cleanups?.forEach(cleanup => {
          try{ cleanup({ componentKey: key, tabId: id, reason }); }
          catch(err){ warn('Debug: lifecycle async cleanup failed', { componentKey: key, tabId: id, reason, err: err?.message || String(err) }); }
        });
        scope.timers.forEach(timer => { try{ global.clearTimeout(timer); }catch(_err){} });
        scope.timers.clear();
        scope.rafs.forEach(entry => { try{ entry.cancel(entry.id); }catch(_err){} });
        scope.rafs.clear();
        scope.promises.clear();
        debug('Debug: lifecycle async scope cancelled', { componentKey: key, tabId: id, generation: scope.generation, reason });
        return true;
      }
    };
  };

  namespace.scheduleComponentFrame = function scheduleComponentFrame(component, componentKey, meta = {}, fn){
    if(typeof fn !== 'function'){
      return null;
    }
    const tabId = requireExplicitTabId({ ...(meta || {}), tab: meta?.tab || meta?.tabLike || null }, 'component-frame', componentKey || component?.__componentKey || null);
    if(!tabId){
      return null;
    }
    const key = componentKey || component?.__componentKey || meta?.componentKey || 'component';
    const scope = component.__asyncScope || namespace.createAsyncScope(key);
    component.__asyncScope = scope;
    return scope.requestAnimationFrame({
      ...(meta || {}),
      tabId,
      componentKey: key,
      reason: meta?.reason || 'component-frame'
    }, scoped => fn(scoped));
  };

  namespace.scheduleComponentTimeout = function scheduleComponentTimeout(component, componentKey, meta = {}, fn, delay = 0){
    if(typeof fn !== 'function'){
      return null;
    }
    const tabId = requireExplicitTabId({ ...(meta || {}), tab: meta?.tab || meta?.tabLike || null }, 'component-timeout', componentKey || component?.__componentKey || null);
    if(!tabId){
      return null;
    }
    const key = componentKey || component?.__componentKey || meta?.componentKey || 'component';
    const scope = component.__asyncScope || namespace.createAsyncScope(key);
    component.__asyncScope = scope;
    return scope.setTimeout({
      ...(meta || {}),
      tabId,
      componentKey: key,
      reason: meta?.reason || 'component-timeout'
    }, scoped => fn(scoped), delay);
  };

  namespace.clearComponentTimeout = function clearComponentTimeout(component, timer){
    if(timer == null){
      return false;
    }
    const scope = component?.__asyncScope || null;
    if(scope && typeof scope.clearTimeout === 'function' && scope.clearTimeout(timer)){
      return true;
    }
    try{ global.clearTimeout(timer); return true; }catch(_err){ return false; }
  };

  namespace.cancelComponentFrame = function cancelComponentFrame(component, frameId){
    if(frameId == null){
      return false;
    }
    const scope = component?.__asyncScope || null;
    if(scope && typeof scope.cancelAnimationFrame === 'function' && scope.cancelAnimationFrame(frameId)){
      return true;
    }
    try{
      if(typeof global.cancelAnimationFrame === 'function'){
        global.cancelAnimationFrame(frameId);
      }else{
        global.clearTimeout(frameId);
      }
      return true;
    }catch(_err){
      return false;
    }
  };

  namespace.createTabScopedFrameDebouncer = function createTabScopedFrameDebouncer(component, componentKey, fn, options = {}){
    if(typeof fn !== 'function'){
      return function noopScopedFrameDebounce(){ return null; };
    }
    const key = String(componentKey || component?.__componentKey || options.componentKey || 'component');
    const pendingByTab = new Map();
    const cleanupRegistered = new Set();

    function clearTab(tabId){
      const id = String(tabId || '').trim();
      if(id){
        pendingByTab.delete(id);
      }
    }

    function ensureCleanup(tabId){
      const id = String(tabId || '').trim();
      if(!id || cleanupRegistered.has(id)){
        return;
      }
      const scope = component.__asyncScope || namespace.createAsyncScope(key);
      component.__asyncScope = scope;
      if(scope && typeof scope.registerCleanup === 'function'){
        scope.registerCleanup({ tabId: id, componentKey: key, reason: 'tab-scoped-frame-debouncer-cleanup' }, () => {
          pendingByTab.delete(id);
        });
      }
      cleanupRegistered.add(id);
    }

    const debounced = function tabScopedFrameDebounced(...args){
      const firstArg = args[0] && typeof args[0] === 'object' ? args[0] : {};
      const meta = {
        ...(firstArg || {}),
        tabId: firstArg.tabId || firstArg.workspaceTabId || firstArg.tab?.id || firstArg.__workspaceSessionMeta?.tabId || null,
        componentKey: key,
        reason: firstArg.reason || firstArg.source || options.reason || 'tab-scoped-frame-debounce'
      };
      const tabId = requireExplicitTabId(meta, 'tab-scoped-frame-debounce', key);
      if(!tabId){
        return null;
      }
      ensureCleanup(tabId);
      const existing = pendingByTab.get(tabId) || { scheduled: false, args: null, context: null };
      existing.args = args;
      existing.context = this;
      pendingByTab.set(tabId, existing);
      if(existing.scheduled){
        return existing.handle || true;
      }
      existing.scheduled = true;
      const handle = namespace.scheduleComponentFrame(component, key, { ...meta, tabId }, () => {
        const pending = pendingByTab.get(tabId);
        if(!pending){
          return;
        }
        pendingByTab.delete(tabId);
        pending.scheduled = false;
        fn.apply(pending.context, pending.args || []);
      });
      existing.handle = handle;
      return handle;
    };

    debounced.clear = function clearDebounced(tabLike){
      const tabId = typeof tabLike === 'string' ? tabLike : tabLike?.id;
      clearTab(tabId);
    };
    debounced.clearAll = function clearAllDebounced(){
      pendingByTab.clear();
    };
    return debounced;
  };

  namespace.createStateModel = function createStateModel(componentKey, factories = {}){
    const key = String(componentKey || 'component');
    const getRecord = (tabLike, meta = {}) => {
      const tabId = String((tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || meta.tabId || meta.workspaceTabId || meta.tab?.id || '').trim();
      if(!tabId){
        return reportMissingTabOwnership('state-model', key, meta);
      }
      const record = Shared.workspaceTabs?.ensureSessionRecord?.(tabId, key, { ...(meta || {}), reason: meta.reason || 'state-model' }) || null;
      if(!record){
        warn('Debug: lifecycle state model missing session record', { componentKey: key, tabId, reason: meta.reason || 'state-model' });
        return null;
      }
      record.runtime = record.runtime || {};
      record.runtime.__stateModel = record.runtime.__stateModel || {};
      record.runtime.__stateModel[key] = record.runtime.__stateModel[key] || {};
      return record.runtime.__stateModel[key];
    };
    const ensureBucket = (tabLike, bucket, factory, meta = {}) => {
      const model = getRecord(tabLike, meta);
      if(!model){
        return null;
      }
      if(!model[bucket]){
        model[bucket] = typeof factory === 'function' ? factory() : {};
      }
      return model[bucket];
    };
    const api = {
      componentKey: key,
      payload: (tabLike, meta = {}) => ensureBucket(tabLike, 'payload', factories.payload, meta),
      runtime: (tabLike, meta = {}) => ensureBucket(tabLike, 'runtime', factories.runtime, meta),
      ui: (tabLike, meta = {}) => ensureBucket(tabLike, 'ui', factories.ui, meta),
      layout: (tabLike, meta = {}) => ensureBucket(tabLike, 'layout', factories.layout, meta),
      cache: (tabLike, meta = {}) => ensureBucket(tabLike, 'cache', factories.cache, meta),
      async: (tabLike, meta = {}) => ensureBucket(tabLike, 'async', factories.async, meta),
      set(tabLike, bucket, value, meta = {}){
        const model = getRecord(tabLike, meta);
        if(!model){ return null; }
        model[bucket] = cloneForLifecycle(value);
        return model[bucket];
      },
      merge(tabLike, bucket, value, meta = {}){
        const model = getRecord(tabLike, meta);
        if(!model){ return null; }
        const current = model[bucket] && typeof model[bucket] === 'object' && !Array.isArray(model[bucket]) ? model[bucket] : {};
        const incoming = value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
        model[bucket] = { ...current, ...cloneForLifecycle(incoming) };
        return model[bucket];
      },
      clear(tabLike, bucket, meta = {}){
        const model = getRecord(tabLike, meta);
        if(!model){ return false; }
        if(bucket){ delete model[bucket]; }
        else { Object.keys(model).forEach(keyName => { delete model[keyName]; }); }
        return true;
      },
      snapshot(tabLike, meta = {}){
        const model = getRecord(tabLike, meta);
        return model ? cloneForLifecycle(model) : null;
      },
      all: (tabLike, meta = {}) => getRecord(tabLike, meta)
    };
    return api;
  };



  function resolveRuntimeOwnerKey(componentOrKey){
    if(componentOrKey && typeof componentOrKey === 'object'){
      return String(componentOrKey.__componentKey || componentOrKey.type || componentOrKey.componentKey || '').trim();
    }
    return String(componentOrKey || '').trim();
  }

  function getRuntimeOwnerSnapshotKey(componentKey){
    const key = String(componentKey || '').trim();
    return key ? `__workspaceTabs__:${key}` : '';
  }

  function runtimeOwnerStrict(meta = {}){
    return !!(
      meta.strictRuntimeOwner === true
      || namespace.__strictRuntimeOwnership === true
      || (isDebugEnabled() && meta.allowMissingTabId !== true)
    );
  }

  function resolveRuntimeOwnerTab(meta = {}){
    const tabLike = meta.tab || meta.tabLike || meta.tabId || meta.workspaceTabId || null;
    const hasExplicitTab = !!(tabLike && (typeof tabLike === 'object' ? tabLike.id != null : String(tabLike).trim()));
    const tab = hasExplicitTab
      ? (global.Shared?.workspaceTabs?.resolveTab?.(tabLike) || null)
      : null;
    const tabId = String(tab?.id || (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || '').trim();
    return { tab, tabId };
  }

  function reportRuntimeOwnerViolation(message, payload = {}, meta = {}){
    if(runtimeOwnerStrict(meta)){
      throw new Error(`${message}: ${JSON.stringify(payload)}`);
    }
    warn(message, payload);
    return null;
  }

  function runtimeSnapshotMatchesOwner(snapshot, componentKey, tabId){
    if(!snapshot || typeof snapshot !== 'object'){
      return false;
    }
    const owner = snapshot.__runtimeOwner || {};
    const ownerComponent = String(owner.componentKey || snapshot.componentKey || componentKey || '').trim();
    const ownerTabId = String(owner.tabId || snapshot.tabId || snapshot.workspaceTabId || '').trim();
    if(componentKey && ownerComponent && ownerComponent !== componentKey){
      return false;
    }
    if(tabId && ownerTabId && ownerTabId !== tabId){
      return false;
    }
    return true;
  }

  function buildOwnedRuntimeSnapshot(componentKey, snapshot, tabId, meta = {}){
    const owned = namespace.sanitizeRuntimeSnapshot(snapshot, {
      ...(meta || {}),
      componentKey,
      tabId,
      reason: meta.reason || 'runtime-owner-hydrate'
    }) || {};
    owned.__runtimeOwner = {
      version: 2,
      componentKey,
      tabId,
      storedAt: Date.now(),
      reason: meta.reason || 'runtime-owner-hydrate'
    };
    if(!owned.tabId && tabId){
      owned.tabId = tabId;
    }
    if(!owned.componentKey){
      owned.componentKey = componentKey;
    }
    return owned;
  }

  function storeOwnedRuntimeSnapshot(componentOrKey, componentKey, tab, tabId, owned, meta = {}){
    const snapshotKey = getRuntimeOwnerSnapshotKey(componentKey);
    try{
      global.Shared?.workspaceTabs?.setRuntimeSnapshot?.(tab || tabId || null, snapshotKey, owned, {
        ...(meta || {}),
        tabId,
        reason: meta.reason || 'runtime-owner-hydrate'
      });
    }catch(err){
      warn('Debug: component runtime owner workspace store failed', { componentKey, tabId, err: err?.message || String(err) });
    }
    try{
      const runtime = global.Shared?.workspaceTabs?.getSessionRuntime?.(tab || tabId || null, componentKey, { ...(meta || {}), tabId, reason: meta.reason || 'runtime-owner-session-store' }) || null;
      if(runtime && runtime.componentRuntimeSnapshot){
        delete runtime.componentRuntimeSnapshot;
      }
      if(runtime && runtime.runtimeOwner){
        delete runtime.runtimeOwner;
      }
    }catch(err){
      warn('Debug: component runtime owner session store failed', { componentKey, tabId, err: err?.message || String(err) });
    }
    return owned;
  }

  namespace.createRuntimeOwner = function createRuntimeOwner(componentOrKey, options = {}){
    const componentKey = resolveRuntimeOwnerKey(componentOrKey) || resolveRuntimeOwnerKey(options.componentKey || options.type);
    if(!componentKey){
      throw new Error('componentLifecycle.createRuntimeOwner requires a component key');
    }
    const snapshotKey = getRuntimeOwnerSnapshotKey(componentKey);
    const createDefaultRecord = typeof options.createDefaultRecord === 'function'
      ? options.createDefaultRecord
      : (typeof options.createRecord === 'function' ? options.createRecord : null);
    const normalizeRecord = typeof options.normalizeRecord === 'function' ? options.normalizeRecord : null;
    const requireSessionRuntimeByDefault = options.requireSessionRuntime !== false;
    const resolveOwner = (meta = {}) => {
      const resolved = resolveRuntimeOwnerTab(meta);
      if(!resolved.tabId){
        return reportRuntimeOwnerViolation('Debug: component runtime owner missing tab id', {
          componentKey,
          reason: meta.reason || 'runtime-owner'
        }, meta);
      }
      return resolved;
    };
    const read = (meta = {}) => {
      const resolved = resolveOwner(meta);
      if(!resolved){ return null; }
      let snapshot = null;
      try{
        snapshot = global.Shared?.workspaceTabs?.getRuntimeSnapshot?.(resolved.tab || resolved.tabId, snapshotKey, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'runtime-owner-read' }) || null;
      }catch(err){
        warn('Debug: component runtime owner session read failed', { componentKey, tabId: resolved.tabId, err: err?.message || String(err) });
      }
      if(snapshot && !runtimeSnapshotMatchesOwner(snapshot, componentKey, resolved.tabId)){
        return reportRuntimeOwnerViolation('Debug: component runtime owner snapshot rejected', {
          componentKey,
          tabId: resolved.tabId,
          owner: snapshot.__runtimeOwner || null,
          reason: meta.reason || 'runtime-owner-read'
        }, meta);
      }
      return snapshot ? cloneForLifecycle(snapshot) : null;
    };

    const stampRecord = (record, tabId, meta = {}) => {
      if(!record || typeof record !== 'object'){
        return null;
      }
      const owner = record.__runtimeOwner && typeof record.__runtimeOwner === 'object' ? record.__runtimeOwner : null;
      const ownerComponent = String(owner?.componentKey || record.componentKey || componentKey || '').trim();
      const ownerTabId = String(owner?.tabId || record.tabId || tabId || '').trim();
      if((ownerComponent && ownerComponent !== componentKey) || (ownerTabId && ownerTabId !== tabId)){
        return reportRuntimeOwnerViolation('Debug: component runtime owner record rejected', {
          componentKey,
          tabId,
          owner: owner || { componentKey: record.componentKey || null, tabId: record.tabId || null },
          reason: meta.reason || 'runtime-owner-record'
        }, meta);
      }
      record.componentKey = record.componentKey || componentKey;
      record.tabId = record.tabId || tabId;
      record.__runtimeOwner = {
        version: 2,
        componentKey,
        tabId,
        storedAt: Date.now(),
        reason: meta.reason || 'runtime-owner-record'
      };
      return record;
    };

    const readRecord = (tabLike = null, meta = {}, recordOptions = {}) => {
      const resolved = resolveOwner({ ...(meta || {}), tab: tabLike || meta.tab || null });
      if(!resolved){ return null; }
      let record = null;
      try{
        record = global.Shared?.workspaceTabs?.getOwnedRuntimeRecord?.(resolved.tab || resolved.tabId, componentKey, {
          ...(meta || {}),
          tabId: resolved.tabId,
          reason: meta.reason || 'runtime-owner-record-read'
        }) || null;
      }catch(err){
        warn('Debug: component runtime owner record read failed', { componentKey, tabId: resolved.tabId, err: err?.message || String(err) });
      }
      if(!record){
        return null;
      }
      if(!runtimeSnapshotMatchesOwner(record, componentKey, resolved.tabId)){
        return reportRuntimeOwnerViolation('Debug: component runtime owner record read rejected', {
          componentKey,
          tabId: resolved.tabId,
          owner: record.__runtimeOwner || { componentKey: record.componentKey || null, tabId: record.tabId || null },
          reason: meta.reason || 'runtime-owner-record-read'
        }, meta);
      }
      if(normalizeRecord && recordOptions.normalize !== false){
        record = storeRecord(resolved.tab || resolved.tabId, record, {
          ...(meta || {}),
          tabId: resolved.tabId,
          reason: meta.reason || 'runtime-owner-record-read-normalize'
        }) || record;
      }
      if(recordOptions.requireHydrated === true && record.hydrated !== true){
        return null;
      }
      return record;
    };

    const storeRecord = (tabLike = null, record = null, meta = {}) => {
      const resolved = resolveOwner({ ...(meta || {}), tab: tabLike || meta.tab || null });
      if(!resolved || !record || typeof record !== 'object'){
        return null;
      }
      const stamped = stampRecord(record, resolved.tabId, meta);
      if(!stamped){
        return null;
      }
      const next = normalizeRecord ? (normalizeRecord(stamped, { ...(meta || {}), tabId: resolved.tabId }) || stamped) : stamped;
      try{
        return global.Shared?.workspaceTabs?.setOwnedRuntimeRecord?.(resolved.tab || resolved.tabId, componentKey, next, {
          ...(meta || {}),
          tabId: resolved.tabId,
          reason: meta.reason || 'runtime-owner-record-store'
        }) || null;
      }catch(err){
        warn('Debug: component runtime owner record store failed', { componentKey, tabId: resolved.tabId, err: err?.message || String(err) });
        return null;
      }
    };

    const ensureRecord = (tabLike = null, meta = {}, recordOptions = {}) => {
      const resolved = resolveOwner({ ...(meta || {}), tab: tabLike || meta.tab || null });
      if(!resolved){ return null; }
      const requireSessionRuntime = recordOptions.requireSessionRuntime !== undefined
        ? recordOptions.requireSessionRuntime !== false
        : requireSessionRuntimeByDefault;
      if(requireSessionRuntime && !global.Shared?.workspaceTabs?.getSessionRuntime?.(resolved.tab || resolved.tabId, componentKey, { ...(meta || {}), tabId: resolved.tabId, reason: meta.reason || 'runtime-owner-record-ensure' })){
        warn('Debug: component runtime owner record missing shared runtime', {
          componentKey,
          tabId: resolved.tabId,
          reason: meta.reason || 'runtime-owner-record-ensure'
        });
        return null;
      }
      let record = readRecord(resolved.tab || resolved.tabId, { ...(meta || {}), tabId: resolved.tabId }, { requireHydrated: false });
      if(!record && recordOptions.create !== false){
        record = createDefaultRecord ? createDefaultRecord(resolved.tabId, meta) : { version: 1, componentKey, tabId: resolved.tabId };
      }
      if(!record){
        return null;
      }
      const stored = storeRecord(resolved.tab || resolved.tabId, record, {
        ...(meta || {}),
        tabId: resolved.tabId,
        reason: meta.reason || 'runtime-owner-record-ensure'
      });
      if(recordOptions.requireHydrated === true && stored?.hydrated !== true){
        return null;
      }
      return stored;
    };

    return {
      componentKey,
      snapshotKey,
      hydrate(snapshot, meta = {}){
        const resolved = resolveOwner(meta);
        if(!resolved || !snapshot || typeof snapshot !== 'object'){
          return null;
        }
        if(!runtimeSnapshotMatchesOwner(snapshot, componentKey, resolved.tabId)){
          const owner = snapshot.__runtimeOwner || null;
          if(owner && typeof owner === 'object'){
            return reportRuntimeOwnerViolation('Debug: component runtime owner hydrate rejected mismatched snapshot', {
              componentKey,
              tabId: resolved.tabId,
              owner,
              reason: meta.reason || 'runtime-owner-hydrate'
            }, meta);
          }
        }
        const owned = buildOwnedRuntimeSnapshot(componentKey, snapshot, resolved.tabId, meta);
        return storeOwnedRuntimeSnapshot(componentOrKey, componentKey, resolved.tab, resolved.tabId, owned, meta);
      },
      bind(existing = null, meta = {}){
        const snapshot = existing && typeof existing === 'object' ? existing : read(meta);
        const resolved = resolveOwner(meta);
        if(!resolved || !snapshot || typeof snapshot !== 'object'){
          return null;
        }
        if(!runtimeSnapshotMatchesOwner(snapshot, componentKey, resolved.tabId)){
          return reportRuntimeOwnerViolation('Debug: component runtime owner bind rejected mismatched snapshot', {
            componentKey,
            tabId: resolved.tabId,
            owner: snapshot.__runtimeOwner || null,
            reason: meta.reason || 'runtime-owner-bind'
          }, meta);
        }
        return cloneForLifecycle(snapshot);
      },
      capture(snapshotOrFactory, meta = {}){
        const snapshot = typeof snapshotOrFactory === 'function'
          ? snapshotOrFactory(meta)
          : snapshotOrFactory;
        if(!snapshot || typeof snapshot !== 'object'){
          return null;
        }
        return this.hydrate(snapshot, { ...meta, reason: meta.reason || 'runtime-owner-capture' });
      },
      get(meta = {}){
        return read(meta);
      },
      getRecord(tabLike = null, meta = {}, recordOptions = {}){
        return readRecord(tabLike, meta, recordOptions);
      },
      ensureRecord(tabLike = null, meta = {}, recordOptions = {}){
        return ensureRecord(tabLike, meta, recordOptions);
      },
      setRecord(tabLike = null, record = null, meta = {}){
        return storeRecord(tabLike, record, meta);
      },
      rememberRecord(tabLike = null, record = null, meta = {}){
        return storeRecord(tabLike, record, { ...(meta || {}), reason: meta.reason || 'runtime-owner-record-remember' });
      },
      bindRecord(tabLike = null, meta = {}, recordOptions = {}){
        return readRecord(tabLike, { ...(meta || {}), reason: meta.reason || 'runtime-owner-record-bind' }, {
          ...(recordOptions || {}),
          requireHydrated: recordOptions.requireHydrated !== false
        });
      },
      captureRecord(recordOrFactory, tabLike = null, meta = {}){
        const record = typeof recordOrFactory === 'function' ? recordOrFactory(meta) : recordOrFactory;
        return storeRecord(tabLike, record, { ...(meta || {}), reason: meta.reason || 'runtime-owner-record-capture' });
      },
      dispose(tabLike = null, meta = {}){
        const resolved = resolveRuntimeOwnerTab({ ...(meta || {}), tab: tabLike || meta.tab || null });
        const tabId = resolved.tabId;
        if(!tabId){
          return reportRuntimeOwnerViolation('Debug: component runtime owner dispose missing tab id', {
            componentKey,
            reason: meta.reason || 'runtime-owner-dispose'
          }, meta) || false;
        }
        let cleared = false;
        try{
          cleared = !!global.Shared?.workspaceTabs?.clearRuntimeSnapshot?.(resolved.tab || tabId, snapshotKey, {
            ...(meta || {}),
            tabId,
            reason: meta.reason || 'runtime-owner-dispose'
          }) || cleared;
        }catch(err){
          warn('Debug: component runtime owner workspace dispose failed', { componentKey, tabId, err: err?.message || String(err) });
        }
        try{
          cleared = !!global.Shared?.workspaceTabs?.clearOwnedRuntimeRecord?.(resolved.tab || tabId, componentKey, {
            reason: meta.reason || 'runtime-owner-dispose'
          }) || cleared;
        }catch(err){
          warn('Debug: component runtime owner session dispose failed', { componentKey, tabId, err: err?.message || String(err) });
        }
        debug('Debug: component runtime owner disposed', {
          componentKey,
          tabId,
          cleared,
          reason: meta.reason || 'runtime-owner-dispose'
        });
        return cleared;
      }
    };
  };

  namespace.rememberComponentRuntimeSnapshot = function rememberComponentRuntimeSnapshot(componentOrKey, snapshot, meta = {}){
    const componentKey = resolveRuntimeOwnerKey(componentOrKey) || resolveRuntimeOwnerKey(meta.componentKey || meta.type);
    if(!componentKey || !snapshot || typeof snapshot !== 'object'){
      return null;
    }
    const owner = namespace.createRuntimeOwner(componentOrKey || componentKey);
    const owned = owner.hydrate(snapshot, {
      ...(meta || {}),
      reason: meta.reason || 'remember-component-runtime'
    });
    if(!owned){
      warn('Debug: component runtime snapshot was not remembered without explicit ownership', {
        componentKey,
        tabId: resolveExplicitTabIdFromMeta(meta),
        reason: meta.reason || 'remember-component-runtime'
      });
      return null;
    }
    debug('Debug: component runtime snapshot remembered', {
      componentKey,
      tabId: owned.__runtimeOwner?.tabId || null,
      reason: meta.reason || 'remember-component-runtime'
    });
    return owned;
  };

  namespace.getComponentRuntimeSnapshot = function getComponentRuntimeSnapshot(componentOrKey, meta = {}){
    const componentKey = resolveRuntimeOwnerKey(componentOrKey) || resolveRuntimeOwnerKey(meta.componentKey || meta.type);
    if(!componentKey){
      return null;
    }
    const owner = namespace.createRuntimeOwner(componentOrKey || componentKey);
    return owner.get(meta);
  };

  namespace.resolveComponentRuntimeSnapshot = function resolveComponentRuntimeSnapshot(componentOrKey, snapshot, meta = {}){
    const componentKey = resolveRuntimeOwnerKey(componentOrKey) || resolveRuntimeOwnerKey(meta.componentKey || meta.type);
    const tabId = resolveExplicitTabIdFromMeta(meta);
    if(!tabId){
      reportRuntimeOwnerViolation('Debug: component runtime snapshot resolve requires explicit tab id', {
        componentKey,
        reason: meta.reason || 'resolve-component-runtime'
      }, meta);
      return null;
    }
    if(snapshot && typeof snapshot === 'object'){
      if(runtimeSnapshotMatchesOwner(snapshot, componentKey, tabId)){
        return snapshot;
      }
      warn('Debug: component runtime snapshot argument rejected for owner mismatch', {
        componentKey,
        tabId,
        owner: snapshot.__runtimeOwner || null,
        reason: meta.reason || 'resolve-component-runtime'
      });
    }
    return namespace.getComponentRuntimeSnapshot(componentOrKey, { ...(meta || {}), tabId });
  };





  const INTERNAL_STATE_DEFAULT_EXCLUDE = new Set([
    'hot', 'root', 'svg', 'svgBox', 'layout', 'fileHandle', 'control', 'controls',
    'container', 'wrapper', 'element', 'panel', 'host', 'doc', 'document', 'window',
    'scheduleDraw', 'ensureHotForActiveTab', 'ensureTableForActiveTab', 'gridApi',
    'columnApi', 'api', 'chart', 'plot', 'stage', 'worker', 'workers', 'timer',
    'timeout', 'interval', 'raf', 'listener', 'listeners',
    'drawToken', 'renderToken', 'workerToken', 'statsWorker', 'renderWorker',
    'drawCooldownTimer', 'dataDrawTimer', 'statsComputationTimer',
    'statsComputationPending', 'statsComputationOwnerTabId',
    'drawInProgress', 'rotationPending', 'rotationPendingLogged',
    'pendingDrawOpts', 'pendingDrawReasons', 'resizeInteractionActive',
    'resizeObserveDrawMutedUntil', 'observer', 'observers', 'mutationObserver',
    'resizeObserver', 'abortController', 'controller', 'controllers'
  ]);

  function shouldExcludeInternalStateKey(keyName, exclude){
    const key = String(keyName || '');
    if(!key || key.startsWith('__') || exclude.has(key)){
      return true;
    }
    return /(Timer|Timeout|Interval|Raf|RAF|Worker|Observer|Controller|Token|Handler|Listener|Subscription)$/.test(key);
  }

  function isDomLike(value){
    return !!(value && typeof value === 'object' && (
      value.nodeType === 1
      || value.nodeType === 9
      || typeof value.appendChild === 'function'
      || typeof value.querySelector === 'function'
      || typeof value.getBoundingClientRect === 'function'
    ));
  }

  function isCloneablePlain(value){
    if(value == null){ return true; }
    if(typeof value !== 'object'){
      return typeof value !== 'function' && typeof value !== 'symbol';
    }
    if(isDomLike(value)){ return false; }
    if(value instanceof Date){ return true; }
    if(value instanceof RegExp){ return false; }
    if(value instanceof Map || value instanceof WeakMap || value instanceof WeakSet){ return false; }
    return true;
  }

  function snapshotInternalValue(value, options = {}, depth = 0, seen = new WeakSet()){
    const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Math.max(1, Number(options.maxDepth)) : 8;
    if(depth > maxDepth){ return undefined; }
    if(value == null){ return value; }
    const valueType = typeof value;
    if(valueType === 'function' || valueType === 'symbol' || valueType === 'undefined'){
      return undefined;
    }
    if(valueType !== 'object'){
      return value;
    }
    if(isDomLike(value)){
      return undefined;
    }
    if(seen.has(value)){
      return undefined;
    }
    seen.add(value);
    if(value instanceof Date){ return value.toISOString(); }
    if(value instanceof Set){
      const values = [];
      value.forEach(item => {
        const cloned = snapshotInternalValue(item, options, depth + 1, seen);
        if(cloned !== undefined){ values.push(cloned); }
      });
      return { __graphitixInternalType: 'Set', values };
    }
    if(value instanceof Map || value instanceof WeakMap || value instanceof WeakSet){
      return undefined;
    }
    if(Array.isArray(value)){
      return value.map(item => snapshotInternalValue(item, options, depth + 1, seen)).filter(item => item !== undefined);
    }
    const exclude = options.excludeKeys || INTERNAL_STATE_DEFAULT_EXCLUDE;
    const output = {};
    Object.keys(value).forEach(keyName => {
      if(shouldExcludeInternalStateKey(keyName, exclude)){
        return;
      }
      const cloned = snapshotInternalValue(value[keyName], options, depth + 1, seen);
      if(cloned !== undefined){ output[keyName] = cloned; }
    });
    return output;
  }

  function applyInternalValue(target, snapshot, options = {}, depth = 0){
    if(!target || typeof target !== 'object' || !snapshot || typeof snapshot !== 'object'){
      return false;
    }
    const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Math.max(1, Number(options.maxDepth)) : 8;
    if(depth > maxDepth){ return false; }
    const exclude = options.excludeKeys || INTERNAL_STATE_DEFAULT_EXCLUDE;
    Object.keys(snapshot).forEach(keyName => {
      if(shouldExcludeInternalStateKey(keyName, exclude)){
        return;
      }
      const incoming = snapshot[keyName];
      const current = target[keyName];
      if(incoming && typeof incoming === 'object' && incoming.__graphitixInternalType === 'Set'){
        if(current instanceof Set){
          current.clear();
          (incoming.values || []).forEach(value => current.add(value));
        }else{
          target[keyName] = new Set(incoming.values || []);
        }
        return;
      }
      if(Array.isArray(incoming)){
        target[keyName] = incoming.map(item => cloneForLifecycle(item));
        return;
      }
      if(incoming && typeof incoming === 'object'){
        if(!isCloneablePlain(current) || current == null || Array.isArray(current)){
          target[keyName] = cloneForLifecycle(incoming);
          return;
        }
        applyInternalValue(current, incoming, options, depth + 1);
        return;
      }
      target[keyName] = incoming;
    });
    return true;
  }

  function normalizeInternalTargets(options = {}){
    const targets = Array.isArray(options.targets) ? options.targets : [];
    return targets.map((target, index) => ({
      key: String(target.key || target.name || `target${index}`),
      get: typeof target.get === 'function' ? target.get : (() => target.object || null),
      apply: typeof target.apply === 'function' ? target.apply : null,
      excludeKeys: new Set([
        ...Array.from(INTERNAL_STATE_DEFAULT_EXCLUDE),
        ...(Array.isArray(options.excludeKeys) ? options.excludeKeys : []),
        ...(Array.isArray(target.excludeKeys) ? target.excludeKeys : [])
      ]),
      maxDepth: target.maxDepth || options.maxDepth || 8
    })).filter(target => typeof target.get === 'function');
  }

  namespace.installInternalStateBridge = function installInternalStateBridge(component, options = {}){
    if(!component || typeof component !== 'object'){
      return null;
    }
    const componentKey = String(options.componentKey || component.__componentKey || component.type || 'component');
    if(component.__internalStateBridge?.componentKey === componentKey){
      return component.__internalStateBridge;
    }
    const targets = normalizeInternalTargets(options);
    const stateModel = component.__stateModel || namespace.getDescriptor?.(componentKey)?.stateModel || namespace.createStateModel(componentKey, {
      payload: () => ({}), runtime: () => ({}), ui: () => ({}), layout: () => ({}), cache: () => ({}), async: () => ({})
    });
    component.__stateModel = component.__stateModel || stateModel;

    function resolveSnapshotOwnerTabId(snapshot, meta = {}){
      const direct = snapshot?.tabId || snapshot?.workspaceTabId || null;
      const internal = snapshot?.__internalState?.tabId || (snapshot?.targets ? snapshot.tabId : null) || null;
      return String(direct || internal || '').trim() || null;
    }

    function snapshotMatchesTargetTab(snapshot, meta = {}){
      if(meta.allowCrossTabInternalStateApply === true){
        return true;
      }
      const ownerTabId = resolveSnapshotOwnerTabId(snapshot, meta);
      const targetTabId = requireExplicitTabId(meta, 'internal-state-target', componentKey);
      if(!targetTabId){
        return false;
      }
      return !(ownerTabId && targetTabId && ownerTabId !== targetTabId);
    }

    function capture(meta = {}){
      const tabId = requireExplicitTabId(meta, 'capture-internal-state', componentKey);
      if(!tabId){
        return null;
      }
      const snapshot = {
        version: 2,
        componentKey,
        tabId,
        capturedAt: Date.now(),
        reason: meta.reason || 'capture-internal-state',
        runtimeGeneration: Number(component.__runtimeGeneration) || 0,
        targets: {}
      };
      targets.forEach(target => {
        try{
          const object = target.get(meta);
          if(object && typeof object === 'object'){
            const captured = snapshotInternalValue(object, target);
            if(captured && typeof captured === 'object'){
              snapshot.targets[target.key] = captured;
            }
          }
        }catch(err){
          warn('Debug: internal state capture target failed', { componentKey, tabId, target: target.key, err: err?.message || String(err) });
        }
      });
      try{ stateModel.merge(meta.tab || meta.tabId || null, 'runtime', { internalState: snapshot }, { ...(meta || {}), tabId }); }catch(_err){}
      debug('Debug: internal state bridge captured', { componentKey, tabId, targetCount: Object.keys(snapshot.targets).length, reason: snapshot.reason });
      return snapshot;
    }

    function apply(snapshot, meta = {}){
      const incoming = snapshot && snapshot.targets ? snapshot : snapshot?.__internalState;
      if(!incoming || !incoming.targets){
        return false;
      }
      const tabId = requireExplicitTabId(meta, 'apply-internal-state', componentKey);
      if(!tabId){
        return false;
      }
      if(!snapshotMatchesTargetTab(incoming, { ...(meta || {}), tabId })){
        warn('Debug: internal state apply rejected for wrong tab', {
          componentKey,
          tabId,
          ownerTabId: resolveSnapshotOwnerTabId(incoming, meta),
          reason: meta.reason || 'apply-internal-state'
        });
        return false;
      }
      let applied = 0;
      targets.forEach(target => {
        const targetSnapshot = incoming.targets[target.key];
        if(!targetSnapshot || typeof targetSnapshot !== 'object'){
          return;
        }
        try{
          if(target.apply){
            target.apply(targetSnapshot, meta);
          }else{
            const object = target.get(meta);
            if(object && typeof object === 'object'){
              applyInternalValue(object, targetSnapshot, target);
            }
          }
          applied += 1;
        }catch(err){
          warn('Debug: internal state apply target failed', { componentKey, tabId, target: target.key, err: err?.message || String(err) });
        }
      });
      if(applied){
        try{ stateModel.merge(meta.tab || meta.tabId || null, 'runtime', { internalState: incoming }, { ...(meta || {}), tabId }); }catch(_err){}
      }
      debug('Debug: internal state bridge applied', { componentKey, tabId, applied, reason: meta.reason || 'apply-internal-state' });
      return applied > 0;
    }

    const originalCaptureRuntime = component.captureRuntimeState;
    const originalApplyRuntime = component.applyRuntimeState;
    const originalDeactivate = component.deactivateTab;
    component.captureRuntimeState = function bridgedCaptureRuntimeState(meta = {}){
      const tabId = requireExplicitTabId(meta, 'capture-runtime-state', componentKey);
      if(!tabId){
        return null;
      }
      const base = typeof originalCaptureRuntime === 'function' ? (originalCaptureRuntime.call(component, { ...(meta || {}), tabId, componentKey }) || {}) : {};
      const internalState = capture({ ...(meta || {}), tabId, componentKey });
      return { ...base, tabId: base?.tabId || tabId || null, __internalState: internalState };
    };
    component.applyRuntimeState = function bridgedApplyRuntimeState(snapshot, meta = {}){
      const tabId = requireExplicitTabId(meta, 'apply-runtime-state', componentKey);
      if(!tabId){
        return false;
      }
      if(snapshot && typeof snapshot === 'object' && !snapshotMatchesTargetTab(snapshot, { ...(meta || {}), tabId })){
        warn('Debug: bridged runtime apply rejected for wrong tab', {
          componentKey,
          tabId,
          ownerTabId: resolveSnapshotOwnerTabId(snapshot, meta),
          reason: meta.reason || 'apply-runtime-state'
        });
        return false;
      }
      const nextMeta = { ...(meta || {}), tabId, componentKey };
      const result = typeof originalApplyRuntime === 'function' ? originalApplyRuntime.call(component, snapshot, nextMeta) : false;
      apply(snapshot, nextMeta);
      return result;
    };
    component.deactivateTab = function bridgedDeactivateTab(tab, meta = {}){
      const tabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
      let result = true;
      if(typeof originalDeactivate === 'function'){
        result = originalDeactivate.call(component, tab, meta);
      }
      capture({ ...(meta || {}), tab, tabId, componentKey, reason: meta?.reason || 'deactivate-internal-state' });
      return result;
    };
    const bridge = { componentKey, targets, capture, apply, stateModel };
    component.__internalStateBridge = bridge;
    debug('Debug: internal state bridge installed', { componentKey, targetCount: targets.length });
    return bridge;
  };

  namespace.componentTable = namespace.componentTable || {};
  namespace.componentTable.create = function createComponentTable(spec = {}){
    const componentKey = spec.componentKey || spec.type || null;
    return {
      componentKey,
      getInstance(){
        try{ return typeof spec.getInstance === 'function' ? spec.getInstance() : null; }
        catch(err){ warn('Debug: component table getInstance failed', { componentKey, err: err?.message || String(err) }); return null; }
      },
      ensureForActiveTab(meta = {}){
        try{
          if(typeof spec.ensureForActiveTab === 'function'){
            return spec.ensureForActiveTab(meta);
          }
          return this.getInstance();
        }catch(err){
          warn('Debug: component table ensureForActiveTab failed', { componentKey, tabId: resolveTabIdFromMeta(meta), err: err?.message || String(err) });
          return null;
        }
      },
      captureUiState(meta = {}){
        const instance = this.getInstance();
        return Shared.hot?.captureHotUiState?.(instance, { componentKey, ...meta }) || null;
      },
      applyUiState(state, meta = {}){
        const instance = this.ensureForActiveTab(meta);
        return Shared.hot?.applyHotUiState?.(instance, state, { componentKey, ...meta }) || false;
      },
      disposeForTab(tabId, meta = {}){
        return Shared.hot?.disposeTableForTab?.(componentKey, tabId, { ...meta, componentKey });
      }
    };
  };

  namespace.register = function registerComponentLifecycle(descriptor = {}){
    const componentKey = extractComponentKey(descriptor);
    if(!componentKey){
      warn('Debug: component lifecycle descriptor ignored without key', descriptor);
      return null;
    }
    const normalized = {
      version: 1,
      componentKey,
      type: descriptor.type || componentKey,
      schemaVersion: descriptor.schemaVersion || 3,
      root: descriptor.root || {},
      table: descriptor.table ? namespace.componentTable.create({ componentKey, ...descriptor.table }) : null,
      payload: descriptor.payload || {},
      runtime: descriptor.runtime || {},
      layout: descriptor.layout || {},
      renderCache: descriptor.renderCache || descriptor.cache || {},
      snapshot: descriptor.snapshot || {},
      draw: descriptor.draw || {},
      asyncScope: descriptor.asyncScope || namespace.createAsyncScope(componentKey),
      stateModel: descriptor.stateModel || namespace.createStateModel(componentKey, {
        payload: () => ({}), runtime: () => ({}), ui: () => ({}), layout: () => ({}), cache: () => ({}), async: () => ({})
      }),
      component: descriptor.component || null,
      workspace: descriptor.workspace || null,
      normalizePayload: descriptor.normalizePayload || ((payload, _descriptor, meta) => namespace.normalizePayloadEnvelope(payload, normalized, meta)),
      validatePayload: descriptor.validatePayload || null
    };
    normalized.canRestoreRenderCache = namespace.createRenderCacheValidator(normalized);
    descriptorRegistry.set(componentKey, normalized);
    debug('Debug: component lifecycle descriptor registered', { componentKey, hasTable: !!normalized.table, hasRenderCacheSpec: !!normalized.renderCache });
    return normalized;
  };

  namespace.getDescriptor = function getDescriptor(componentKey){
    return descriptorRegistry.get(String(componentKey || '').trim()) || null;
  };



  function resolveTabForStateModel(meta = {}, fallback = null){
    if(meta?.tab && typeof meta.tab === 'object' && meta.tab.id != null){ return meta.tab; }
    if(meta?.tabId || meta?.workspaceTabId){ return meta.tabId || meta.workspaceTabId; }
    if(fallback && (typeof fallback === 'object' ? fallback.id != null : String(fallback).trim())){ return fallback; }
    return null;
  }

  function rememberStateBucket(stateModel, bucket, value, meta = {}, fallback = null){
    if(!stateModel || value === undefined){
      return value;
    }
    const tabLike = resolveTabForStateModel(meta, fallback);
    if(!tabLike){
      reportMissingTabOwnership(`state-bucket:${bucket}`, meta.componentKey || meta.type || null, meta);
      return value;
    }
    try{
      stateModel.set(tabLike, bucket, value, meta);
    }catch(err){
      warn('Debug: lifecycle state bucket write failed', { bucket, err: err?.message || String(err) });
    }
    return value;
  }

  function wrapWorkspaceStateHook(workspace, descriptor, hookName, bucket, mode){
    if(!workspace || typeof workspace[hookName] !== 'function'){
      return;
    }
    const flag = `__lifecycleStateWrapped_${hookName}`;
    if(workspace[flag]){
      return;
    }
    const original = workspace[hookName];
    workspace[hookName] = function lifecycleStateWrappedHook(...args){
      const lastArg = args.length ? args[args.length - 1] : null;
      const meta = lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) ? lastArg : {};
      const stateModel = descriptor.stateModel || workspace.__stateModel || null;
      if(mode === 'apply'){
        rememberStateBucket(stateModel, bucket, args[0], meta);
      }
      const result = original.apply(this, args);
      if(result && typeof result.then === 'function'){
        return result.then(value => {
          if(mode !== 'apply'){
            rememberStateBucket(stateModel, bucket, value, meta);
          }
          return value;
        });
      }
      if(mode !== 'apply'){
        rememberStateBucket(stateModel, bucket, result, meta);
      }
      return result;
    };
    workspace[flag] = true;
  }

  function wrapComponentStateHook(componentKey, component, descriptor, hookName, bucket, mode){
    if(!component || typeof component[hookName] !== 'function'){
      return;
    }
    const flag = `__lifecycleStateWrapped_${hookName}`;
    if(component[flag]){
      return;
    }
    const original = component[hookName];
    component[hookName] = function lifecycleComponentStateWrappedHook(...args){
      const lastArg = args.length ? args[args.length - 1] : null;
      const meta = lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) ? lastArg : {};
      const stateModel = descriptor?.stateModel || component.__stateModel || null;
      if(mode === 'apply'){
        rememberStateBucket(stateModel, bucket, args[0], meta);
      }
      const result = original.apply(this, args);
      if(result && typeof result.then === 'function'){
        return result.then(value => {
          if(mode !== 'apply'){
            rememberStateBucket(stateModel, bucket, value, meta);
          }
          return value;
        });
      }
      if(mode !== 'apply'){
        rememberStateBucket(stateModel, bucket, result, meta);
      }
      return result;
    };
    component[flag] = true;
    debug('Debug: lifecycle component state hook wrapped', { componentKey, hookName, bucket, mode });
  }

  namespace.attachComponent = function attachComponent(componentKey, component, descriptorLike = {}){
    const key = String(componentKey || descriptorLike.componentKey || component?.__componentKey || '').trim();
    if(!key || !component || typeof component !== 'object'){
      return component;
    }
    const descriptor = descriptorRegistry.get(key) || namespace.register({ componentKey: key, type: key, ...descriptorLike });
    descriptor.component = component;
    descriptor.stateModel = descriptor.stateModel || namespace.createStateModel(key, {
      payload: () => ({}), runtime: () => ({}), ui: () => ({}), layout: () => ({}), cache: () => ({}), async: () => ({})
    });
    component.__lifecycleDescriptor = descriptor;
    component.__stateModel = component.__stateModel || descriptor.stateModel;
    component.__asyncScope = component.__asyncScope || descriptor.asyncScope || namespace.createAsyncScope(key);
    component.__componentKey = component.__componentKey || key;
    wrapComponentStateHook(key, component, descriptor, 'captureRuntimeState', 'runtime', 'capture');
    wrapComponentStateHook(key, component, descriptor, 'applyRuntimeState', 'runtime', 'apply');
    wrapComponentStateHook(key, component, descriptor, 'captureUiState', 'ui', 'capture');
    wrapComponentStateHook(key, component, descriptor, 'applyUiState', 'ui', 'apply');
    wrapComponentStateHook(key, component, descriptor, 'captureRenderCache', 'cache', 'capture');
    wrapComponentStateHook(key, component, descriptor, 'restoreRenderCache', 'cache', 'apply');
    debug('Debug: lifecycle component attached to state model', { componentKey: key });
    return component;
  };

  namespace.attachWorkspace = function attachWorkspace(workspace, descriptorLike = {}){
    if(!workspace || !workspace.type){
      return workspace;
    }
    const componentKey = workspace.type;
    const descriptor = descriptorRegistry.get(componentKey) || namespace.register({ componentKey, type: componentKey, workspace, ...descriptorLike });
    descriptor.workspace = workspace;
    descriptor.stateModel = descriptor.stateModel || namespace.createStateModel(componentKey, {
      payload: () => ({}), runtime: () => ({}), ui: () => ({}), layout: () => ({}), cache: () => ({}), async: () => ({})
    });
    workspace.__lifecycleDescriptor = descriptor;
    workspace.__stateModel = workspace.__stateModel || descriptor.stateModel;
    workspace.__asyncScope = workspace.__asyncScope || descriptor.asyncScope || namespace.createAsyncScope(componentKey);
    if(typeof workspace.normalizePayload !== 'function'){
      workspace.normalizePayload = (payload, meta) => namespace.normalizePayloadEnvelope(payload, descriptor, meta || {});
    }
    if(typeof workspace.validatePayload !== 'function'){
      workspace.validatePayload = (payload, meta) => namespace.validatePayload(payload, descriptor, meta || {});
    }
    if(typeof workspace.diffPayload !== 'function'){
      workspace.diffPayload = (before, after, meta) => namespace.diffPayload(before, after, descriptor, meta || {});
    }
    const originalRoundTrip = workspace.roundTripPayload;
    workspace.roundTripPayload = (payload, meta = {}) => {
      if(typeof descriptor.payload?.roundTrip === 'function'){
        return descriptor.payload.roundTrip(workspace, payload, meta);
      }
      if(typeof originalRoundTrip === 'function' && originalRoundTrip.__sharedLifecycleRoundTrip !== true){
        const result = originalRoundTrip(payload, meta);
        if(result && result.ok === false){
          return result;
        }
      }
      return namespace.roundTripPayload(workspace, payload, { ...meta, componentKey });
    };
    workspace.roundTripPayload.__sharedLifecycleRoundTrip = true;
    if(typeof workspace.canRestoreRenderCache !== 'function' && descriptor.renderCache){
      workspace.canRestoreRenderCache = descriptor.canRestoreRenderCache;
    }
    const originalDeactivate = workspace.deactivateTab;
    if(!workspace.__sharedLifecycleDeactivateWrapped){
      workspace.deactivateTab = (tab, meta = {}) => {
        const result = typeof originalDeactivate === 'function' ? originalDeactivate(tab, meta) : undefined;
        try{ descriptor.asyncScope?.cancelAllForTab?.((tab && typeof tab === 'object' ? tab.id : tab) || meta.tabId || null, meta.reason || 'workspace-deactivate'); }
        catch(err){ warn('Debug: lifecycle workspace async cancel failed', { componentKey, err: err?.message || String(err) }); }
        return result;
      };
      workspace.__sharedLifecycleDeactivateWrapped = true;
    }
    wrapWorkspaceStateHook(workspace, descriptor, 'getPayload', 'payload', 'capture');
    wrapWorkspaceStateHook(workspace, descriptor, 'loadFromPayload', 'payload', 'apply');
    wrapWorkspaceStateHook(workspace, descriptor, 'captureRuntimeState', 'runtime', 'capture');
    wrapWorkspaceStateHook(workspace, descriptor, 'applyRuntimeState', 'runtime', 'apply');
    wrapWorkspaceStateHook(workspace, descriptor, 'captureUiState', 'ui', 'capture');
    wrapWorkspaceStateHook(workspace, descriptor, 'applyUiState', 'ui', 'apply');
    wrapWorkspaceStateHook(workspace, descriptor, 'getLayoutState', 'layout', 'capture');
    wrapWorkspaceStateHook(workspace, descriptor, 'applyLayoutState', 'layout', 'apply');
    wrapWorkspaceStateHook(workspace, descriptor, 'captureRenderCache', 'cache', 'capture');
    wrapWorkspaceStateHook(workspace, descriptor, 'restoreRenderCache', 'cache', 'apply');
    return workspace;
  };



  namespace.snapshotWorkspaceSync = function snapshotWorkspaceSync(workspace, tab, meta = {}){
    const componentKey = workspace?.type || meta.componentKey || meta.type || tab?.type || null;
    if(!workspace || !componentKey){
      return { ok: false, reason: 'missing-workspace' };
    }
    const captureMeta = { ...meta, tab, tabId: tab?.id || meta.tabId || null, componentKey, type: componentKey, reason: meta.reason || 'lifecycle-snapshot-sync' };
    let payload = null;
    let runtime = null;
    let uiState = null;
    let layoutState = null;
    let renderCache = null;
    let stateModel = null;
    try{ payload = typeof workspace.getPayload === 'function' ? workspace.getPayload(captureMeta) : tab?.payload || null; }
    catch(err){ warn('Debug: lifecycle snapshot payload capture failed', { componentKey, tabId: captureMeta.tabId, err: err?.message || String(err) }); }
    try{ runtime = typeof workspace.captureRuntimeState === 'function' ? workspace.captureRuntimeState(captureMeta) : null; }
    catch(err){ warn('Debug: lifecycle snapshot runtime capture failed', { componentKey, tabId: captureMeta.tabId, err: err?.message || String(err) }); }
    try{ uiState = typeof workspace.captureUiState === 'function' ? workspace.captureUiState(captureMeta) : null; }
    catch(err){ warn('Debug: lifecycle snapshot ui capture failed', { componentKey, tabId: captureMeta.tabId, err: err?.message || String(err) }); }
    try{ layoutState = typeof workspace.getLayoutState === 'function' ? workspace.getLayoutState(captureMeta) : null; }
    catch(err){ warn('Debug: lifecycle snapshot layout capture failed', { componentKey, tabId: captureMeta.tabId, err: err?.message || String(err) }); }
    try{ renderCache = typeof workspace.captureRenderCache === 'function' ? workspace.captureRenderCache(captureMeta) : null; }
    catch(err){ warn('Debug: lifecycle snapshot render cache capture failed', { componentKey, tabId: captureMeta.tabId, err: err?.message || String(err) }); }
    try{ stateModel = workspace.__stateModel?.snapshot?.(tab || captureMeta.tabId || null, captureMeta) || null; }
    catch(err){ warn('Debug: lifecycle snapshot state model capture failed', { componentKey, tabId: captureMeta.tabId, err: err?.message || String(err) }); }
    return { ok: true, componentKey, payload, runtime, uiState, layoutState, renderCache, stateModel, diagnostics: { capturedAt: Date.now(), reason: captureMeta.reason, sync: true } };
  };

  namespace.snapshotWorkspace = async function snapshotWorkspace(workspace, tab, meta = {}){
    const componentKey = workspace?.type || meta.componentKey || meta.type || tab?.type || null;
    if(!workspace || !componentKey){
      return { ok: false, reason: 'missing-workspace' };
    }
    const tabId = requireExplicitTabId({ ...(meta || {}), tab, tabId: tab?.id || meta.tabId || null }, 'lifecycle-snapshot', componentKey);
    if(!tabId){
      return { ok: false, reason: 'missing-tab-id' };
    }
    const captureMeta = { ...meta, tab, tabId, componentKey, type: componentKey, reason: meta.reason || 'lifecycle-snapshot' };
    await namespace.awaitReadyForSnapshot(workspace, captureMeta);
    const payload = typeof workspace.getPayload === 'function' ? workspace.getPayload(captureMeta) : tab?.payload || null;
    const runtime = typeof workspace.captureRuntimeState === 'function' ? workspace.captureRuntimeState(captureMeta) : null;
    const uiState = typeof workspace.captureUiState === 'function' ? workspace.captureUiState(captureMeta) : null;
    const layoutState = typeof workspace.getLayoutState === 'function' ? workspace.getLayoutState(captureMeta) : null;
    const renderCache = typeof workspace.captureRenderCache === 'function' ? workspace.captureRenderCache(captureMeta) : null;
    const stateModel = workspace.__stateModel?.snapshot?.(tab || tabId, captureMeta) || null;
    return { ok: true, componentKey, payload, runtime, uiState, layoutState, renderCache, stateModel, diagnostics: { capturedAt: Date.now(), reason: captureMeta.reason } };
  };

  namespace.restoreWorkspace = async function restoreWorkspace(workspace, snapshot, meta = {}){
    const componentKey = workspace?.type || snapshot?.componentKey || meta.componentKey || meta.type || null;
    if(!workspace || !snapshot){
      return { ok: false, reason: 'missing-workspace-or-snapshot' };
    }
    const tabId = requireExplicitTabId(meta, 'lifecycle-restore-workspace', componentKey);
    if(!tabId){
      return { ok: false, reason: 'missing-tab-id' };
    }
    const restoreMeta = { ...meta, tabId, componentKey, type: componentKey, reason: meta.reason || 'lifecycle-restore-workspace' };
    return namespace.withRestoreTransaction(componentKey, restoreMeta, () => {
    if(snapshot.stateModel && workspace.__stateModel){
      try{
        const tabLike = restoreMeta.tab || restoreMeta.tabId;
        ['payload', 'runtime', 'ui', 'layout', 'cache', 'async'].forEach(bucket => {
          if(Object.prototype.hasOwnProperty.call(snapshot.stateModel, bucket)){
            workspace.__stateModel.set(tabLike, bucket, snapshot.stateModel[bucket], restoreMeta);
          }
        });
      }catch(err){ warn('Debug: lifecycle restore state model seed failed', { componentKey, tabId, err: err?.message || String(err) }); }
    }
    if(snapshot.payload && typeof workspace.loadFromPayload === 'function'){
      workspace.loadFromPayload(snapshot.payload, { ...restoreMeta, reason: meta.reason || 'lifecycle-restore-payload' });
    }
    if(snapshot.runtime && typeof workspace.applyRuntimeState === 'function'){
      workspace.applyRuntimeState(snapshot.runtime, { ...restoreMeta, reason: meta.reason || 'lifecycle-restore-runtime' });
    }
    if(snapshot.layoutState && typeof workspace.applyLayoutState === 'function'){
      workspace.applyLayoutState(snapshot.layoutState, { ...restoreMeta, reason: meta.reason || 'lifecycle-restore-layout' });
    }
    if(snapshot.uiState && typeof workspace.applyUiState === 'function'){
      workspace.applyUiState(snapshot.uiState, { ...restoreMeta, reason: meta.reason || 'lifecycle-restore-ui' });
    }
    if(snapshot.renderCache && typeof workspace.restoreRenderCache === 'function'){
      workspace.restoreRenderCache(snapshot.renderCache, { ...restoreMeta, reason: meta.reason || 'lifecycle-restore-render-cache' });
    }
    return { ok: true, componentKey, tabId };
    });
  };

})(typeof window !== 'undefined' ? window : globalThis);
