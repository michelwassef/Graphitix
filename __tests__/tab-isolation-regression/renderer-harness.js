(function(){
  'use strict';

  const DEFAULT_COMPONENTS = ['box','scatter','line','hist','heatmap','pca','pie','roc','survival','venn','surface'];
  const LOAD_EXAMPLE_IDS = {
    box: 'boxLoadExample',
    scatter: 'scatterLoadExample',
    line: 'lineLoadExample',
    hist: 'histLoadExample',
    heatmap: 'heatmapLoadExample',
    pca: 'pcaLoadExample',
    pie: 'pieLoadExample',
    roc: 'rocLoadExample',
    survival: 'survivalLoadExample',
    venn: 'sample',
    surface: 'surfaceLoadExample'
  };
  const FONT_IDS = {
    box: 'boxFontSize',
    scatter: 'scatterFontSize',
    line: 'lineFontSize',
    hist: 'histFontSize',
    pca: 'pcaFontSize',
    pie: 'pieFontSize',
    roc: 'rocFontSize',
    survival: 'survivalFontSize',
    surface: 'surfaceFontSize'
  };
  const PRIMARY_GRAPH_PROBE_SELECTORS = Object.freeze({
    box: '#boxPlot',
    scatter: '#scatterPlot',
    line: '#linePlot',
    hist: '#histPlot',
    pca: '#pcaPlot',
    pie: '#piePlot',
    roc: '#rocPlot',
    survival: '#survivalPlot',
    heatmap: '#heatmapGraphPanel .svgbox',
    venn: '#vennGraphPanel .svgbox',
    surface: '#surfaceGraphPanel .svgbox'
  });

  const VARIANT_FONT_SIZE = Object.freeze({ 1: 10, 2: 18 });
  const VARIANT_COLORS = Object.freeze({
    1: { scheme: 'scientific', fill: '#0072B2', border: '#1b1b1b', background: '#ffffff', text: '#111111' },
    2: { scheme: 'dark', fill: '#D55E00', border: '#202020', background: '#111827', text: '#f8fafc' }
  });
  const COMPONENT_VARIATION_PROFILES = Object.freeze({
    box: {
      1: { values: { boxGraphType: 'strip', boxPointMode: 'none', boxLayoutMode: 'interleaved', boxSignificanceLabelMode: 'stars' }, checks: { boxShowGrid: true, boxShowFrame: true } },
      2: { values: { boxGraphType: 'violin', boxPointMode: 'overlay', boxLayoutMode: 'separated', boxSignificanceLabelMode: 'p' }, checks: { boxShowGrid: false, boxShowFrame: true } }
    },
    scatter: {
      1: { values: { scatterGraphType: 'scatter', scatterViewMode: '2d', scatterColorMode: 'solid', scatterOriginMode: 'zero', scatterRegressionMode: 'linear' }, checks: { scatterShowGrid: true, scatterShowFrame: true, scatterShowLegend: true } },
      2: { values: { scatterGraphType: 'volcano', scatterViewMode: '3d', scatterColorMode: 'density', scatterOriginMode: 'custom', scatterRegressionMode: 'quadratic' }, checks: { scatterShowGrid: false, scatterShowFrame: true, scatterShowLegend: false } }
    },
    line: {
      1: { values: { lineDisplayMode: 'line', lineViewMode: '2d', lineOriginMode: 'zero', lineRegressionMode: 'linear' }, checks: { lineShowGrid: true, lineShowFrame: true, lineShowLegend: true } },
      2: { values: { lineDisplayMode: 'area', lineViewMode: '3d', lineOriginMode: 'custom', lineRegressionMode: 'cubic' }, checks: { lineShowGrid: false, lineShowFrame: true, lineShowLegend: false } }
    },
    hist: {
      1: { values: { histPlotMode: 'histogram', histFrequencyCreateMode: 'frequency', histFrequencyTabulateMode: 'count', histBinningMode: 'count', histStatsDiagnosticsMode: 'normal-fit', histStatsComparisonMode: 'ks' }, checks: { histShowGrid: true, histShowFrame: true } },
      2: { values: { histPlotMode: 'density', histFrequencyCreateMode: 'cumulative', histFrequencyTabulateMode: 'percent', histBinningMode: 'auto', histStatsDiagnosticsMode: 'off', histStatsComparisonMode: 'off' }, checks: { histShowGrid: false, histShowFrame: true } }
    },
    heatmap: {
      1: { values: { heatmapView: 'values', heatmapSignificanceDisplay: 'star' } },
      2: { values: { heatmapView: 'corr-columns', heatmapSignificanceDisplay: 'pvalue' } }
    },
    pca: {
      1: { values: { pcaMethod: 'pca', pcaViewMode: '2d' }, checks: { pcaShowGrid: true, pcaShowFrame: true, pcaShowLegend: true } },
      2: { values: { pcaMethod: 'pca', pcaViewMode: '3d' }, checks: { pcaShowGrid: false, pcaShowFrame: true, pcaShowLegend: false } }
    },
    pie: {
      1: { values: { pieChartType: 'pie' } },
      2: { values: { pieChartType: 'donut' } }
    },
    roc: {
      1: { values: { rocGraphType: 'roc' }, checks: { rocShowGrid: true, rocShowFrame: true, rocShowLegend: true } },
      2: { values: { rocGraphType: 'pr' }, checks: { rocShowGrid: false, rocShowFrame: true, rocShowLegend: false } }
    },
    survival: {
      1: { checks: { survivalShowCI: true, survivalShowCensor: true, survivalShowHazardRatios: false, survivalShowGrid: true, survivalShowFrame: true, survivalShowLegend: true } },
      2: { checks: { survivalShowCI: false, survivalShowCensor: false, survivalShowHazardRatios: true, survivalShowGrid: false, survivalShowFrame: true, survivalShowLegend: false } }
    },
    venn: {
      1: { values: { vennPlotType: 'venn' } },
      2: { values: { vennPlotType: 'upset' } }
    },
    surface: {
      1: { values: { surfaceInterpolation: 'grid' }, checks: { surfaceShowGrid: true, surfaceShowFrame: true, surfaceShowPoints: false } },
      2: { values: { surfaceInterpolation: 'scatter' }, checks: { surfaceShowGrid: false, surfaceShowFrame: true, surfaceShowPoints: true } }
    }
  });

  function debug(message, payload){
    console.debug(`Debug: regression.${message}`, payload || {});
  }
  function warn(message, payload){
    console.warn(`Regression warning: ${message}`, payload || {});
  }
  function error(message, payload){
    console.error(`Regression error: ${message}`, payload || {});
  }
  function progress(message, payload){
    console.info(`[regression-progress] ${message}`, payload || {});
  }

  const CACHE_PROBE_EVENT_LIMIT = 8000;
  const cacheProbeState = window.__GraphitixRegressionCacheProbe = window.__GraphitixRegressionCacheProbe || {
    installed: false,
    wrappedDrawHooks: false,
    events: [],
    sequence: 0,
    activeSwitch: null
  };
  function safePlainObject(value, depth = 0){
    if(value == null || typeof value !== 'object') return value;
    if(depth > 2) return '[depth-limit]';
    if(Array.isArray(value)) return value.slice(0, 12).map(item => safePlainObject(item, depth + 1));
    const out = {};
    Object.keys(value).slice(0, 40).forEach(key => {
      const v = value[key];
      if(typeof v === 'function') return;
      if(v && typeof Node !== 'undefined' && v instanceof Node){
        out[key] = `[Node:${v.nodeName}]`;
      }else{
        out[key] = safePlainObject(v, depth + 1);
      }
    });
    return out;
  }
  function inferCacheEventType(text, payload){
    const direct = payload?.type || payload?.component || payload?.componentKey || payload?.label || null;
    if(direct && typeof direct === 'string') return direct;
    const lower = String(text || '').toLowerCase();
    const known = DEFAULT_COMPONENTS.find(type => lower.includes(`${type}.`) || lower.includes(`${type} `) || lower.includes(`components.${type}`) || lower.includes(`component: '${type}'`) || lower.includes(`label: '${type}'`));
    return known || null;
  }
  function inferCacheEventTabId(payload){
    return payload?.tabId || payload?.activeTabId || payload?.targetTabId || payload?.renderCacheOwnerTabId || payload?.ownerTabId || null;
  }
  function classifyCacheProbeEvent(method, text, payload){
    const s = String(text || '');
    const lower = s.toLowerCase();
    if(/workspace render cache basic validation failed|component render cache validation rejected|generic render cache validation rejected|render cache .*validation failed/i.test(s)){
      return 'cache-rejected';
    }
    if(/workspace same-component render cache unavailable|render cache unavailable/i.test(s)){
      return 'cache-unavailable';
    }
    if(/workspace render cache restored|same-component render cache restore allowed|component render cache validation accepted|generic render cache validation accepted/i.test(s)){
      return 'cache-restored';
    }
    if(/archive render cache consumed|archive render cache cleared/i.test(s)){
      return 'archive-cache-consumed';
    }
    if(/render cache restore produced empty graph|render cache restore error/i.test(s)){
      return 'cache-restore-error';
    }
    if(/\.setup start|components\.[a-z]+\.setup start/i.test(s)){
      return 'setup-start';
    }
    if(/\bsvd result\b|\bcompute\b|\banalysis snapshot\b/i.test(s)){
      return 'compute';
    }
    if(/statstable render complete/i.test(lower)){
      return 'stats-table-render-complete';
    }
    if(/pca render complete|box layout|surface draw complete|heatmap render complete|draw complete|draw cycle complete/i.test(s)){
      return 'render-complete';
    }
    if(/draw.*error|render.*error/i.test(s)){
      return 'render-error';
    }
    if(/cache/i.test(s)){
      return 'cache-other';
    }
    return null;
  }
  function recordCacheProbeEvent(kind, details = {}){
    if(!kind) return null;
    const active = cacheProbeState.activeSwitch || null;
    const normalizedDetails = Object.assign({}, details || {});
    if(active && (!normalizedDetails.tabId || normalizedDetails.tabId === active.tabId)){
      if(!normalizedDetails.type || normalizedDetails.type === active.type){
        normalizedDetails.tabId = normalizedDetails.tabId || active.tabId;
        normalizedDetails.type = normalizedDetails.type || active.type;
        normalizedDetails.phase = normalizedDetails.phase || active.phase || null;
      }
    }
    const event = Object.assign({
      index: cacheProbeState.sequence += 1,
      at: Date.now(),
      kind
    }, normalizedDetails);
    cacheProbeState.events.push(event);
    if(cacheProbeState.events.length > CACHE_PROBE_EVENT_LIMIT){
      cacheProbeState.events.splice(0, cacheProbeState.events.length - CACHE_PROBE_EVENT_LIMIT);
    }
    return event;
  }
  function installConsoleCacheProbe(){
    if(cacheProbeState.installed) return;
    cacheProbeState.installed = true;
    ['debug','info','warn','error'].forEach(method => {
      const original = console[method];
      if(typeof original !== 'function') return;
      console[method] = function regressionConsoleProbeWrapper(...args){
        try{
          const text = args.map(arg => {
            if(typeof arg === 'string') return arg;
            try{ return JSON.stringify(safePlainObject(arg)); }catch(_err){ return String(arg); }
          }).join(' ');
          const payload = args.find(arg => arg && typeof arg === 'object' && !(typeof Node !== 'undefined' && arg instanceof Node)) || null;
          const kind = classifyCacheProbeEvent(method, text, payload || {});
          if(kind){
            recordCacheProbeEvent(kind, {
              method,
              text: String(text || '').slice(0, 500),
              tabId: inferCacheEventTabId(payload || {}),
              type: inferCacheEventType(text, payload || {}),
              payload: safePlainObject(payload || {})
            });
          }
        }catch(_err){
          // The probe must never interfere with the app or the test.
        }
        return original.apply(this, args);
      };
    });
  }
  function installWorkspaceCacheProbeWrappers(){
    if(cacheProbeState.wrappedDrawHooks) return;
    const registry = window.Main?.components?.registry || {};
    Object.entries(registry).forEach(([type, config]) => {
      if(!config || typeof config !== 'object' || config.__regressionCacheProbeWrapped) return;
      config.__regressionCacheProbeWrapped = true;
      if(typeof config.draw === 'function'){
        const originalDraw = config.draw;
        config.draw = function regressionDrawProbeWrapper(meta = {}){
          recordCacheProbeEvent('draw-request', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null, payload: safePlainObject(meta || {}) });
          try{
            const result = originalDraw.apply(this, arguments);
            recordCacheProbeEvent('draw-returned', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null });
            return result;
          }catch(err){
            recordCacheProbeEvent('draw-error', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null, text: err?.message || String(err) });
            throw err;
          }
        };
      }
      if(typeof config.restoreRenderCache === 'function'){
        const originalRestore = config.restoreRenderCache;
        config.restoreRenderCache = function regressionRestoreRenderCacheProbeWrapper(cache, meta = {}){
          recordCacheProbeEvent('cache-restore-call', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null, payload: safePlainObject({ meta, hasCache: !!cache }) });
          try{
            const result = originalRestore.apply(this, arguments);
            recordCacheProbeEvent(result === false ? 'cache-restore-returned-false' : 'cache-restore-returned', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null });
            return result;
          }catch(err){
            recordCacheProbeEvent('cache-restore-error', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null, text: err?.message || String(err) });
            throw err;
          }
        };
      }
      if(typeof config.canRestoreRenderCache === 'function'){
        const originalCanRestore = config.canRestoreRenderCache;
        config.canRestoreRenderCache = function regressionCanRestoreRenderCacheProbeWrapper(cache, meta = {}){
          recordCacheProbeEvent('cache-validator-call', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null, payload: safePlainObject({ meta, hasCache: !!cache }) });
          let result;
          try{
            result = originalCanRestore.apply(this, arguments);
          }catch(err){
            recordCacheProbeEvent('cache-validator-error', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null, text: err?.message || String(err) });
            throw err;
          }
          recordCacheProbeEvent(result ? 'cache-validator-accepted' : 'cache-validator-rejected', { type, tabId: meta?.tabId || window.Main?.session?.getActiveTab?.()?.id || null });
          return result;
        };
      }
    });
    cacheProbeState.wrappedDrawHooks = true;
  }
  function ensureCacheProbeInstalled(){
    installConsoleCacheProbe();
    installWorkspaceCacheProbeWrappers();
  }
  function getCacheProbeCursor(){
    return {
      console: cacheProbeState.events.length,
      lifecycle: window.Shared?.componentLifecycle?.getLifecycleEventCursor?.() || 0
    };
  }
  function normalizeLifecycleProbeEvent(event){
    if(!event || typeof event !== 'object') return null;
    const action = String(event.action || event.kind || 'lifecycle-event');
    return {
      index: Number(event.index || 0) + 1000000,
      at: event.at || Date.now(),
      kind: action,
      method: 'lifecycle',
      text: action,
      tabId: event.tabId || null,
      type: event.type || event.componentKey || null,
      payload: safePlainObject(event.details || {})
    };
  }
  function getCacheProbeEventsSince(cursor){
    const consoleCursor = typeof cursor === 'object' ? cursor.console : cursor;
    const lifecycleCursor = typeof cursor === 'object' ? cursor.lifecycle : 0;
    const consoleEvents = cacheProbeState.events.slice(Math.max(0, Number(consoleCursor) || 0));
    const lifecycleEvents = (window.Shared?.componentLifecycle?.getLifecycleEvents?.(lifecycleCursor) || [])
      .map(normalizeLifecycleProbeEvent)
      .filter(Boolean);
    return consoleEvents.concat(lifecycleEvents).sort((a, b) => (a.at || 0) - (b.at || 0) || (a.index || 0) - (b.index || 0));
  }
  function eventMatchesTab(event, tab){
    if(!event || !tab) return false;
    if(event.tabId && event.tabId === tab.id) return true;
    if(event.type && event.type === tab.type && !event.tabId) return true;
    return false;
  }
  function isCacheAcceptedEvent(event){
    return event && (
      event.kind === 'cache-restored'
      || event.kind === 'cache-restore-returned'
      || event.kind === 'cache-validator-accepted'
      || event.kind === 'saved-render-cache-restored'
      || event.kind === 'runtime-render-cache-restored'
    );
  }
  function isCacheRejectedEvent(event){
    return event && (
      event.kind === 'cache-rejected'
      || event.kind === 'cache-validator-rejected'
      || event.kind === 'cache-unavailable'
      || event.kind === 'cache-restore-error'
      || event.kind === 'cache-restore-returned-false'
      || event.kind === 'cache-validator-error'
    );
  }
  function isRedrawEvent(event){
    if(!event) return false;
    if(event.kind === 'compute' || event.kind === 'render-error' || event.kind === 'draw-error') return true;
    if(event.kind === 'render-complete') return true;
    if(event.kind === 'draw-executed'){
      const source = String(event.payload?.source || event.payload?.via || '').toLowerCase();
      return !!source && !source.includes('domcontrols-fallback-probe-only');
    }
    return false;
  }
  function getTabSwitchStateBefore(tab){
    const sessionRecord = window.Shared?.workspaceTabs?.getSessionRecord?.(tab, tab?.type) || null;
    const mountedRoot = getRoot(tab?.id, tab?.type);
    const storedRoot = sessionRecord?.dom?.root || null;
    const liveRoot = mountedRoot || storedRoot || null;
    const activeTabId = getActiveTab()?.id || null;
    return {
      tabId: tab?.id || null,
      type: tab?.type || null,
      wasActiveBeforeSwitch: !!(tab && activeTabId === tab.id),
      hasMountedDomBeforeSwitch: !!mountedRoot,
      hasSessionDomBeforeSwitch: !!storedRoot,
      hasLiveDomBeforeSwitch: !!liveRoot,
      hasLiveGraphBeforeSwitch: graphHasContent(liveRoot),
      hasTabRenderCacheBeforeSwitch: !!tab?.renderCache,
      hasArchiveRenderCacheBeforeSwitch: !!tab?.archiveRenderCache,
      payloadSignatureBeforeSwitch: tab?.payloadSignature || null,
      layoutSignatureBeforeSwitch: tab?.layoutSignature || null
    };
  }

  function summarizeCacheEventsForTab(tab, cursor, phase, beforeState = null){
    const relevant = getCacheProbeEventsSince(cursor).filter(event => eventMatchesTab(event, tab));
    const byKind = relevant.reduce((acc, event) => {
      acc[event.kind] = (acc[event.kind] || 0) + 1;
      return acc;
    }, {});
    const acceptedEvents = relevant.filter(isCacheAcceptedEvent);
    const rejectedEvents = relevant.filter(isCacheRejectedEvent);
    const redrawEvents = relevant.filter(isRedrawEvent);
    const lastAcceptedIndex = acceptedEvents.length ? Math.max(...acceptedEvents.map(event => event.index || 0)) : null;
    const lastRejectedIndex = rejectedEvents.length ? Math.max(...rejectedEvents.map(event => event.index || 0)) : null;
    const lastDecisionIndex = Math.max(lastAcceptedIndex || 0, lastRejectedIndex || 0) || null;
    const finalDecision = lastDecisionIndex && lastAcceptedIndex === lastDecisionIndex
      ? 'accepted'
      : (lastDecisionIndex && lastRejectedIndex === lastDecisionIndex ? 'rejected' : 'none');
    const redrawEventsAfterDecision = lastDecisionIndex != null
      ? redrawEvents.filter(event => (event.index || 0) > lastDecisionIndex)
      : redrawEvents;
    const drawAfterAccepted = lastAcceptedIndex != null && redrawEvents.some(event => (event.index || 0) > lastAcceptedIndex);
    const drawAfterRejected = lastRejectedIndex != null && redrawEvents.some(event => (event.index || 0) > lastRejectedIndex);
    const drawAfterDecision = lastDecisionIndex != null && redrawEventsAfterDecision.length > 0;
    const drawObservedAny = redrawEvents.length > 0;
    const drawObserved = finalDecision !== 'none' ? drawAfterDecision : drawObservedAny;
    const cacheRestoreCall = relevant.some(event => event.kind === 'cache-restore-call');
    const stateBefore = beforeState || getTabSwitchStateBefore(tab);
    const hasRuntimeRenderCacheBeforeSwitch = !!stateBefore.hasTabRenderCacheBeforeSwitch;
    const hasSavedRenderCacheBeforeSwitch = !!stateBefore.hasArchiveRenderCacheBeforeSwitch;
    const hasAnyRenderCacheBeforeSwitch = hasRuntimeRenderCacheBeforeSwitch || hasSavedRenderCacheBeforeSwitch;
    const hasLiveDomBeforeSwitch = !!stateBefore.hasLiveDomBeforeSwitch;
    const hasLiveGraphBeforeSwitch = !!stateBefore.hasLiveGraphBeforeSwitch;
    const cacheAccepted = finalDecision === 'accepted';
    const cacheRejected = finalDecision === 'rejected';
    let fastPath = 'none';
    let outcome = 'unknown';
    if(cacheAccepted && hasSavedRenderCacheBeforeSwitch && !drawAfterAccepted){
      fastPath = 'saved-render-cache';
      outcome = 'saved-render-cache-reused-without-redraw';
    }else if(cacheAccepted && hasRuntimeRenderCacheBeforeSwitch && !drawAfterAccepted){
      fastPath = 'runtime-render-cache';
      outcome = 'runtime-render-cache-reused-without-redraw';
    }else if(hasLiveGraphBeforeSwitch && !drawObserved){
      fastPath = 'live-dom';
      outcome = 'live-dom-reused-without-redraw';
    }else if(cacheAccepted && hasSavedRenderCacheBeforeSwitch && drawAfterAccepted){
      fastPath = 'saved-render-cache-then-redraw';
      outcome = 'saved-render-cache-restored-then-redrawn';
    }else if(cacheAccepted && hasRuntimeRenderCacheBeforeSwitch && drawAfterAccepted){
      fastPath = 'runtime-render-cache-then-redraw';
      outcome = 'runtime-render-cache-restored-then-redrawn';
    }else if(cacheAccepted && drawAfterAccepted){
      fastPath = 'cache-then-redraw';
      outcome = 'cache-restored-then-redrawn';
    }else if(cacheAccepted){
      fastPath = 'render-cache';
      outcome = 'cache-reused-without-redraw';
    }else if(cacheRejected && hasSavedRenderCacheBeforeSwitch && drawAfterRejected){
      outcome = 'saved-render-cache-rejected-redrawn';
    }else if(cacheRejected && hasRuntimeRenderCacheBeforeSwitch && drawAfterRejected){
      outcome = 'runtime-render-cache-rejected-redrawn';
    }else if(cacheRejected && drawAfterRejected){
      outcome = 'cache-rejected-redrawn';
    }else if(cacheRejected && !drawAfterRejected){
      outcome = 'cache-rejected-no-redraw-observed';
    }else if(!hasAnyRenderCacheBeforeSwitch && hasLiveGraphBeforeSwitch && !drawObserved){
      fastPath = 'live-dom';
      outcome = 'live-dom-reused-without-redraw';
    }else if(!hasAnyRenderCacheBeforeSwitch && drawObserved){
      outcome = 'no-cache-before-switch-redrawn';
    }else if(!hasAnyRenderCacheBeforeSwitch && !drawObserved){
      outcome = 'no-cache-before-switch-no-redraw-observed';
    }else if(cacheRestoreCall && finalDecision === 'none'){
      outcome = 'cache-restore-attempt-unclear';
    }else if(drawObserved){
      outcome = 'redrawn-without-cache-decision';
    }else{
      outcome = 'no-cache-event-no-redraw-observed';
    }
    return {
      phase,
      tabId: tab.id,
      type: tab.type,
      variant: tab.__regressionVariant || null,
      hasMountedDomBeforeSwitch: !!stateBefore.hasMountedDomBeforeSwitch,
      hasSessionDomBeforeSwitch: !!stateBefore.hasSessionDomBeforeSwitch,
      hasLiveDomBeforeSwitch,
      hasLiveGraphBeforeSwitch,
      wasActiveBeforeSwitch: !!stateBefore.wasActiveBeforeSwitch,
      hasTabRenderCacheBeforeSwitch: hasRuntimeRenderCacheBeforeSwitch,
      hasArchiveRenderCacheBeforeSwitch: hasSavedRenderCacheBeforeSwitch,
      payloadSignature: tab.payloadSignature || stateBefore.payloadSignatureBeforeSwitch || null,
      layoutSignature: tab.layoutSignature || stateBefore.layoutSignatureBeforeSwitch || null,
      outcome,
      finalDecision,
      fastPath,
      cacheAccepted,
      cacheRejected,
      cacheRestoreCall,
      drawObserved,
      drawObservedAny,
      drawAfterDecision,
      eventCounts: {
        accepted: acceptedEvents.length,
        rejected: rejectedEvents.length,
        redraw: redrawEventsAfterDecision.length,
        redrawAny: redrawEvents.length,
        setup: relevant.filter(event => event.kind === 'setup-start').length,
        drawRequest: relevant.filter(event => event.kind === 'draw-request').length,
        drawSuppressed: relevant.filter(event => event.kind === 'draw-suppressed').length
      },
      byKind,
      events: relevant.slice(-24).map(event => ({
        index: event.index,
        kind: event.kind,
        type: event.type || null,
        tabId: event.tabId || null,
        text: event.text || null
      }))
    };
  }
  function isSlowCacheOutcome(row){
    if(!row) return false;
    if(row.drawObserved) return true;
    const outcome = String(row.outcome || '');
    if(row.hasLiveGraphBeforeSwitch && /rejected-no-redraw|live-dom-reused/.test(outcome)) return false;
    return /rejected|error|unclear/.test(outcome);
  }
  function isFastCacheOutcome(row){
    return !!row && !isSlowCacheOutcome(row) && /without-redraw|live-dom-reused/.test(String(row.outcome || ''));
  }
  function summarizeCacheReuseRows(rows){
    const byType = {};
    rows.forEach(row => {
      const bucket = byType[row.type] || (byType[row.type] = {
        type: row.type,
        switches: 0,
        savedRenderCacheReused: 0,
        runtimeRenderCacheReused: 0,
        liveDomReused: 0,
        fastNoRedraw: 0,
        slowOrUnclear: 0,
        cacheAccepted: 0,
        cacheRejected: 0,
        drawObserved: 0,
        computeObserved: 0,
        missingCacheBeforeSwitch: 0,
        missingSavedCacheBeforeSwitch: 0,
        missingRuntimeCacheBeforeSwitch: 0,
        liveDomBeforeSwitch: 0,
        liveGraphBeforeSwitch: 0,
        outcomes: {},
        fastPaths: {}
      });
      bucket.switches += 1;
      if(row.cacheAccepted) bucket.cacheAccepted += 1;
      if(row.cacheRejected) bucket.cacheRejected += 1;
      if(row.drawObserved) bucket.drawObserved += 1;
      if((row.byKind?.compute || 0) > 0) bucket.computeObserved += 1;
      if(!row.hasTabRenderCacheBeforeSwitch && !row.hasArchiveRenderCacheBeforeSwitch) bucket.missingCacheBeforeSwitch += 1;
      if(!row.hasArchiveRenderCacheBeforeSwitch) bucket.missingSavedCacheBeforeSwitch += 1;
      if(!row.hasTabRenderCacheBeforeSwitch) bucket.missingRuntimeCacheBeforeSwitch += 1;
      if(row.hasLiveDomBeforeSwitch) bucket.liveDomBeforeSwitch += 1;
      if(row.hasLiveGraphBeforeSwitch) bucket.liveGraphBeforeSwitch += 1;
      if(row.fastPath === 'saved-render-cache') bucket.savedRenderCacheReused += 1;
      if(row.fastPath === 'runtime-render-cache') bucket.runtimeRenderCacheReused += 1;
      if(row.fastPath === 'live-dom') bucket.liveDomReused += 1;
      if(isFastCacheOutcome(row)) bucket.fastNoRedraw += 1;
      if(isSlowCacheOutcome(row)) bucket.slowOrUnclear += 1;
      bucket.outcomes[row.outcome] = (bucket.outcomes[row.outcome] || 0) + 1;
      bucket.fastPaths[row.fastPath || 'none'] = (bucket.fastPaths[row.fastPath || 'none'] || 0) + 1;
    });
    return {
      rows,
      byType,
      slowTypes: Object.values(byType).filter(item => item.slowOrUnclear > 0).map(item => item.type),
      savedCacheMissingTypes: Object.values(byType).filter(item => item.missingSavedCacheBeforeSwitch > 0).map(item => item.type),
      fullCacheReuseTypes: Object.values(byType).filter(item => item.savedRenderCacheReused > 0 || item.runtimeRenderCacheReused > 0).map(item => item.type),
      liveDomReuseTypes: Object.values(byType).filter(item => item.liveDomReused > 0).map(item => item.type),
      impactedTypes: Object.values(byType)
        .filter(item => item.slowOrUnclear > 0)
        .map(item => item.type)
    };
  }
  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  function withTimeout(promise, timeoutMs, label){
    const ms = Math.max(250, Number(timeoutMs) || 0);
    let timer = null;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve({ __regressionTimedOut: true, label, timeoutMs: ms }), ms);
    });
    return Promise.race([Promise.resolve(promise).then(value => ({ value })), timeout]).finally(() => {
      if(timer !== null) clearTimeout(timer);
    });
  }
  async function settle(ms = 120){
    await sleep(ms);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  async function waitFor(predicate, timeoutMs = 10000, label = 'condition'){
    const start = Date.now();
    let lastErr = null;
    while(Date.now() - start < timeoutMs){
      try{
        const value = predicate();
        if(value) return value;
      }catch(err){
        lastErr = err;
      }
      await sleep(80);
    }
    const suffix = lastErr ? `: ${lastErr.message || String(lastErr)}` : '';
    throw new Error(`Timed out waiting for ${label}${suffix}`);
  }
  function clone(value){
    if(typeof structuredClone === 'function'){
      try{ return structuredClone(value); }catch(_err){}
    }
    return JSON.parse(JSON.stringify(value));
  }
  function hashString(text){
    // Small browser-side non-cryptographic hash, enough for identity comparisons in summaries.
    const str = String(text || '');
    let h = 2166136261;
    for(let i = 0; i < str.length; i += 1){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  function normalizePreviewForHash(markup){
    return String(markup || '')
      .replace(/workspace-\d+/g, 'workspace-X')
      .replace(/data-tab-token="[^"]*"/g, 'data-tab-token="TAB"')
      .replace(/data-workspace-tab-id="[^"]*"/g, 'data-workspace-tab-id="TAB"')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function getWorkspaceState(){
    return window.Main?.session?.workspaceState || null;
  }
  function getContext(extra){
    if(typeof window.Main?.tabs?.getSessionActionsContext === 'function'){
      return window.Main.tabs.getSessionActionsContext(extra || {});
    }
    return Object.assign({
      Shared: window.Shared,
      session: window.Main?.session,
      workspaceState: getWorkspaceState(),
      workspaces: window.Main?.components?.registry,
      previews: window.Main?.previews,
      dom: window.Main?.domControls?.createDomHandles?.()
    }, extra || {});
  }
  function getTabs(){
    const ws = getWorkspaceState();
    return Array.isArray(ws?.tabs) ? ws.tabs : [];
  }
  function getGraphTabs(){
    return getTabs().filter(tab => tab && !tab.isWelcome && tab.type);
  }
  function getActiveTab(){
    return window.Main?.session?.getActiveTab?.() || getTabs().find(tab => tab.id === getWorkspaceState()?.activeTabId) || null;
  }
  function getConfig(type){
    return window.Main?.components?.registry?.[type] || null;
  }
  function getRoot(tabId, type){
    return window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, type) || document.querySelector(`[data-workspace-tab-id="${tabId}"]`) || null;
  }
  function parseColorChannels(value){
    const text = String(value || '').trim().toLowerCase();
    if(!text || text === 'transparent' || text === 'none'){
      return null;
    }
    const hex = /^#([0-9a-f]{6})$/i.exec(text);
    if(hex){
      const raw = hex[1];
      return {
        r: Number.parseInt(raw.slice(0, 2), 16),
        g: Number.parseInt(raw.slice(2, 4), 16),
        b: Number.parseInt(raw.slice(4, 6), 16)
      };
    }
    const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
    if(!rgb){
      return null;
    }
    const parts = rgb[1].split(',').map(part => Number.parseFloat(String(part).trim()));
    if(parts.length < 3 || !parts.every((n, idx) => idx > 2 || Number.isFinite(n))){
      return null;
    }
    return {
      r: Math.max(0, Math.min(255, parts[0])),
      g: Math.max(0, Math.min(255, parts[1])),
      b: Math.max(0, Math.min(255, parts[2]))
    };
  }
  function brightnessFromColor(value){
    const rgb = parseColorChannels(value);
    if(!rgb){
      return null;
    }
    return (0.299 * rgb.r) + (0.587 * rgb.g) + (0.114 * rgb.b);
  }
  function colorToHex(value){
    const rgb = parseColorChannels(value);
    if(!rgb){
      return '';
    }
    const toHex = channel => {
      const clamped = Math.max(0, Math.min(255, Math.round(channel)));
      return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }
  function collectScatterSymbolColors(svg){
    if(!svg || typeof svg.querySelectorAll !== 'function'){
      return [];
    }
    const nodes = Array.from(svg.querySelectorAll('circle,path,ellipse,polygon,rect'));
    const out = [];
    nodes.forEach(node => {
      if(!node || !node.isConnected){
        return;
      }
      if(node.closest('.axis, .tick, .grid, [data-axis-layer], [data-axis-tick-label], [data-axis-label]')){
        return;
      }
      const tag = String(node.tagName || '').toLowerCase();
      if(tag === 'rect'){
        const width = Number(node.getAttribute?.('width'));
        const height = Number(node.getAttribute?.('height'));
        if(Number.isFinite(width) && Number.isFinite(height) && width >= 80 && height >= 80){
          return;
        }
      }
      const fillOpacity = Number.parseFloat(
        String(
          node.getAttribute?.('fill-opacity')
          || window.getComputedStyle?.(node || document.body)?.fillOpacity
          || window.getComputedStyle?.(node || document.body)?.opacity
          || '1'
        )
      );
      if(Number.isFinite(fillOpacity) && fillOpacity <= 0.02){
        return;
      }
      const fill = colorToHex(node.getAttribute?.('fill') || window.getComputedStyle?.(node || document.body)?.fill || '');
      const stroke = colorToHex(node.getAttribute?.('stroke') || window.getComputedStyle?.(node || document.body)?.stroke || '');
      const color = fill || stroke;
      if(!color){
        return;
      }
      out.push(color);
    });
    return Array.from(new Set(out)).sort();
  }
  function collectScatterPayloadColorSignature(tab){
    const cfg = tab?.payload?.config;
    if(!cfg || typeof cfg !== 'object'){
      return '';
    }
    const fill = colorToHex(cfg.fill || '');
    const border = colorToHex(cfg.border || '');
    const labelColors = cfg.labelColors && typeof cfg.labelColors === 'object'
      ? Object.keys(cfg.labelColors).sort().map(key => `${key}:${colorToHex(cfg.labelColors[key]) || String(cfg.labelColors[key] || '').trim().toLowerCase()}`)
      : [];
    return hashString(JSON.stringify({
      fill: fill || String(cfg.fill || '').trim().toLowerCase(),
      border: border || String(cfg.border || '').trim().toLowerCase(),
      labelColors
    }));
  }
  function resolvePayloadSchemeId(tab){
    const type = String(tab?.type || '').trim().toLowerCase();
    const payload = tab?.payload || null;
    if(type === 'venn'){
      return String(payload?.style?.colorScheme || payload?.config?.colorScheme || '').trim().toLowerCase();
    }
    return String(payload?.config?.colorScheme || payload?.style?.colorScheme || '').trim().toLowerCase();
  }
  function probeRenderedTheme(tab){
    const type = tab?.type || null;
    const root = getRoot(tab?.id || null, type);
    const box = root?.querySelector?.('.svgbox') || root?.querySelector?.(`#${type}GraphPanel .svgbox`) || null;
    const svg = box?.querySelector?.('svg') || root?.querySelector?.('svg') || null;
    const axisTextNodes = svg?.querySelectorAll
      ? Array.from(svg.querySelectorAll('[data-axis-tick-label], [data-axis-label], .axis text, .tick text, g.tick text'))
      : [];
    const fallbackTextNodes = (!axisTextNodes.length && svg?.querySelectorAll)
      ? Array.from(svg.querySelectorAll('text'))
      : [];
    const sampledTextNodes = axisTextNodes.length ? axisTextNodes : fallbackTextNodes;
    const textBrightnessSamples = sampledTextNodes
      .map(node => {
        const fill = String(node?.getAttribute?.('fill') || window.getComputedStyle?.(node || document.body)?.fill || '').trim().toLowerCase();
        return brightnessFromColor(fill);
      })
      .filter(value => Number.isFinite(value));
    const sortedBrightness = textBrightnessSamples.slice().sort((a, b) => a - b);
    const axisTextBrightnessMedian = sortedBrightness.length
      ? sortedBrightness[Math.floor(sortedBrightness.length / 2)]
      : null;
    const axisText = sampledTextNodes[0] || null;
    const schemeId = String(box?.getAttribute?.('data-color-scheme') || '').trim().toLowerCase();
    const svgBgColor = String(svg?.getAttribute?.('data-color-scheme-bg-color') || '').trim().toLowerCase();
    const boxBackground = String(box?.style?.backgroundColor || window.getComputedStyle?.(box || document.body)?.backgroundColor || '').trim().toLowerCase();
    const textFill = String(axisText?.getAttribute?.('fill') || window.getComputedStyle?.(axisText || document.body)?.fill || '').trim().toLowerCase();
    const boxBrightness = brightnessFromColor(boxBackground);
    const textBrightness = brightnessFromColor(textFill);
    const inferredDarkByVisual = !!svgBgColor
      || (boxBrightness != null && boxBrightness < 96)
      || (axisTextBrightnessMedian != null && axisTextBrightnessMedian > 180)
      || (textBrightness != null && textBrightness > 200);
    const inferredDark = schemeId ? (schemeId === 'dark') : inferredDarkByVisual;
    const symbolColors = type === 'scatter' ? collectScatterSymbolColors(svg) : [];
    const symbolColorSignature = symbolColors.length ? hashString(symbolColors.join('|')) : '';
    const payloadSymbolSignature = type === 'scatter' ? collectScatterPayloadColorSignature(tab) : '';
    return {
      tabId: tab?.id || null,
      type,
      schemeId: schemeId || null,
      payloadSchemeId: resolvePayloadSchemeId(tab) || null,
      svgBgColor: svgBgColor || null,
      boxBackground: boxBackground || null,
      textFill: textFill || null,
      boxBrightness,
      textBrightness,
      axisTextBrightnessMedian,
      axisTextSampleCount: textBrightnessSamples.length,
      symbolColorCount: symbolColors.length,
      symbolColorSignature: symbolColorSignature || null,
      payloadSymbolSignature: payloadSymbolSignature || null,
      inferredDarkByVisual,
      inferredDark
    };
  }
  function isBrightThemeText(probe){
    const axisBrightness = Number(probe?.axisTextBrightnessMedian);
    if(Number.isFinite(axisBrightness)){
      return axisBrightness >= 180;
    }
    return Number.isFinite(Number(probe?.textBrightness)) && Number(probe.textBrightness) >= 180;
  }
  function numberFromCss(value){
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  function isElementChainVisible(el){
    if(!el || !el.isConnected) return false;
    let node = el;
    while(node && node.nodeType === 1){
      if(node.hasAttribute?.('hidden') || node.getAttribute?.('aria-hidden') === 'true'){
        return false;
      }
      const style = window.getComputedStyle?.(node);
      if(style){
        if(style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'){
          return false;
        }
        if(numberFromCss(style.opacity) === 0){
          return false;
        }
      }
      node = node.parentElement;
    }
    return true;
  }
  function hasRenderableBox(el){
    if(!el) return false;
    const rect = el.getBoundingClientRect?.();
    return !!rect && Number(rect.width) > 1 && Number(rect.height) > 1;
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
  function graphProbe(root){
    if(!root){
      return { ok: false, reason: 'missing-root' };
    }
    if(!isElementChainVisible(root)){
      return { ok: false, reason: 'root-hidden' };
    }
    if(!hasRenderableBox(root)){
      return { ok: false, reason: 'root-zero-size' };
    }
    const canvases = Array.from(root.querySelectorAll?.('canvas') || []);
    for(const canvas of canvases){
      if(!isElementChainVisible(canvas)) continue;
      const width = Number(canvas.width) || Number(canvas.getBoundingClientRect?.().width) || 0;
      const height = Number(canvas.height) || Number(canvas.getBoundingClientRect?.().height) || 0;
      if(width > 1 && height > 1){
        return { ok: true, medium: 'canvas' };
      }
    }
    const svgs = Array.from(root.querySelectorAll?.('.svgbox svg, svg[data-export-layer], svg') || []);
    for(const svg of svgs){
      if(!isElementChainVisible(svg)) continue;
      if(!hasRenderableBox(svg)) continue;
      const candidates = Array.from(svg.querySelectorAll?.('path,circle,ellipse,rect,line,polyline,polygon,text,image,foreignObject,foreignobject,use') || []);
      for(const node of candidates){
        if(!isElementChainVisible(node)) continue;
        if(hasSvgNodeGeometry(node)){
          return { ok: true, medium: 'svg' };
        }
      }
    }
    return { ok: false, reason: 'no-visible-graph-primitives' };
  }
  function graphHasContent(root){
    return graphProbe(root).ok;
  }
  function resolvePrimaryGraphRoot(tabLike, type){
    const tabId = tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike;
    const componentType = type || (tabLike && typeof tabLike === 'object' ? tabLike.type : null);
    const root = getRoot(tabId, componentType) || null;
    const selector = PRIMARY_GRAPH_PROBE_SELECTORS[componentType] || null;
    if(!selector || !root || typeof root.querySelector !== 'function'){
      return root;
    }
    return root.querySelector(selector) || root;
  }
  function graphProbeForTab(tab){
    const primaryRoot = resolvePrimaryGraphRoot(tab, tab?.type);
    const primary = graphProbe(primaryRoot);
    const workspaceRoot = getRoot(tab?.id, tab?.type) || null;
    const fallback = workspaceRoot && workspaceRoot !== primaryRoot ? graphProbe(workspaceRoot) : null;
    return {
      ok: !!primary.ok,
      reason: primary.reason || null,
      medium: primary.medium || null,
      primarySelector: PRIMARY_GRAPH_PROBE_SELECTORS[tab?.type] || null,
      fallbackOk: !!fallback?.ok,
      fallbackReason: fallback?.reason || null
    };
  }
  function findInRootOrDocument(tabId, type, id){
    const root = getRoot(tabId, type);
    return root?.querySelector?.(`#${CSS.escape(id)}`) || document.getElementById(id) || null;
  }
  function dispatchInput(el){
    if(!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function setControlValue(tabId, type, id, value){
    const el = findInRootOrDocument(tabId, type, id);
    if(!el) return false;
    try{
      const next = String(value);
      if(el.tagName === 'SELECT'){
        const hasOption = Array.from(el.options || []).some(option => String(option.value) === next);
        if(!hasOption){
          warn('setControlValue skipped missing select option', { tabId, type, id, value: next });
          return false;
        }
      }
      el.value = next;
      dispatchInput(el);
      debug('regression control value changed', { tabId, type, id, value: next });
      return true;
    }catch(err){
      warn('setControlValue failed', { tabId, type, id, message: err.message || String(err) });
      return false;
    }
  }
  function setControlChecked(tabId, type, id, checked){
    const el = findInRootOrDocument(tabId, type, id);
    if(!el || typeof el.checked !== 'boolean') return false;
    try{
      el.checked = !!checked;
      dispatchInput(el);
      debug('regression control checked changed', { tabId, type, id, checked: !!checked });
      return true;
    }catch(err){
      warn('setControlChecked failed', { tabId, type, id, message: err.message || String(err) });
      return false;
    }
  }
  function getVariantColors(type, variant){
    const base = VARIANT_COLORS[variant] || VARIANT_COLORS[1];
    if(type === 'surface'){
      return variant === 2
        ? { ...base, scheme: 'surface-plasma' }
        : { ...base, scheme: 'surface-viridis' };
    }
    return base;
  }
  function applyControlVariation(tab, type, variant){
    const profile = COMPONENT_VARIATION_PROFILES[type]?.[variant] || {};
    const fontId = FONT_IDS[type];
    const fontSize = VARIANT_FONT_SIZE[variant] || (10 + variant * 3);
    let changed = 0;
    if(fontId && setControlValue(tab.id, type, fontId, fontSize)) changed += 1;
    for(const [id, value] of Object.entries(profile.values || {})){
      if(setControlValue(tab.id, type, id, value)) changed += 1;
    }
    for(const [id, checked] of Object.entries(profile.checks || {})){
      if(setControlChecked(tab.id, type, id, checked)) changed += 1;
    }
    const colors = getVariantColors(type, variant);
    try{
      if(window.Shared?.colorSchemes?.applyToActiveTab && colors?.scheme){
        window.Shared.colorSchemes.applyToActiveTab(type, colors.scheme);
        changed += 1;
      }
    }catch(err){
      warn('color scheme control variation failed', { tabId: tab.id, type, variant, scheme: colors?.scheme || null, message: err.message || String(err) });
    }
    progress('control-variation:applied', { tabId: tab.id, type, variant, changed });
    return changed;
  }
  function mutateMatrix(matrix, variant){
    if(!Array.isArray(matrix)) return false;
    let changed = false;
    for(let r = 0; r < matrix.length; r += 1){
      const row = matrix[r];
      if(!Array.isArray(row)) continue;
      for(let c = 0; c < row.length; c += 1){
        const value = row[c];
        if(typeof value === 'number' && Number.isFinite(value)){
          if(r > 0 || c > 0){
            row[c] = Number((value + variant * (0.25 + ((r + c) % 5) * 0.11)).toFixed(6));
            changed = true;
          }
        }else if(typeof value === 'string'){
          if(r > 0 && c === 0 && value.trim()){
            row[c] = `${value} v${variant}`;
            changed = true;
          }
        }
      }
    }
    return changed;
  }
  function mutatePayload(payload, type, variant){
    const p = clone(payload || {});
    let changed = false;
    const matrixKeys = ['data','rows','matrix','table','tableData','values','dataset','datasets'];
    for(const key of matrixKeys){
      if(Array.isArray(p[key])){
        changed = mutateMatrix(p[key], variant) || changed;
      }
    }
    // Also recursively mutate common nested data matrices, but avoid huge destructive rewrites.
    const seen = new WeakSet();
    function walk(obj, depth){
      if(!obj || typeof obj !== 'object' || seen.has(obj) || depth > 4) return;
      seen.add(obj);
      if(Array.isArray(obj)){
        if(obj.length && obj.every(row => Array.isArray(row))){
          changed = mutateMatrix(obj, variant) || changed;
          return;
        }
        obj.forEach(item => walk(item, depth + 1));
        return;
      }
      for(const [key, value] of Object.entries(obj)){
        if(key === 'version' || key.endsWith('Signature')) continue;
        if(/title|label/i.test(key) && typeof value === 'string' && value.trim()){
          obj[key] = `${value} v${variant}`;
          changed = true;
        }else if(/fontSize/i.test(key) && (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value)))){
          obj[key] = String(10 + variant * 3);
          changed = true;
        }else if(/color/i.test(key) && typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)){
          obj[key] = variant % 2 === 0 ? '#D55E00' : '#0072B2';
          changed = true;
        }else{
          walk(value, depth + 1);
        }
      }
    }
    walk(p, 0);
    const explicitPayload = applyComponentPayloadVariation(p, type, variant);
    explicitPayload.__regressionVariant = variant;
    explicitPayload.__regressionComponent = type;
    return { payload: explicitPayload, changed: true || changed };
  }
  function getVariantLayoutTargets(variant){
    return variant === 1
      ? { width: 426, height: 426, aspectLocked: true }
      : { width: 512, height: 360, aspectLocked: false };
  }
  function mutateLayout(layout, variant){
    const l = clone(layout || {});
    const target = getVariantLayoutTargets(variant);
    const width = target.width;
    const height = target.height;
    const aspectLocked = !!target.aspectLocked;
    const ratio = width > 0 && height > 0 ? width / height : 1;
    l.__regressionVariant = variant;
    l.aspectLocked = aspectLocked;
    if(!l.svgBox) l.svgBox = {};
    if(!l.svgBox.style) l.svgBox.style = {};
    if(!l.svgBox.dataset) l.svgBox.dataset = {};
    l.svgBox.widthPx = width;
    l.svgBox.heightPx = height;
    l.svgBox.baseWidthPx = width;
    l.svgBox.baseHeightPx = height;
    l.svgBox.style.width = `${width}px`;
    l.svgBox.style.height = `${height}px`;
    l.svgBox.style.flex = '0 0 auto';
    l.svgBox.style.maxWidth = 'none';
    l.svgBox.style.maxHeight = 'none';
    l.svgBox.style.aspectRatio = `${width} / ${height}`;
    l.svgBox.dataset.svgWidth = String(width);
    l.svgBox.dataset.svgHeight = String(height);
    l.svgBox.dataset.defaultWidth = String(width);
    l.svgBox.dataset.defaultHeight = String(height);
    l.svgBox.dataset.graphWidthPx = String(width);
    l.svgBox.dataset.graphHeightPx = String(height);
    l.svgBox.dataset.graphDefaultWidth = String(width);
    l.svgBox.dataset.graphDefaultHeight = String(height);
    l.svgBox.dataset.graphAspectRatio = String(ratio);
    l.svgBox.dataset.graphAspectLocked = aspectLocked ? 'true' : 'false';
    l.svgBox.dataset.aspectLocked = aspectLocked ? 'true' : 'false';
    l.svgBox.dataset.resizerWidth = `${width}px`;
    l.svgBox.dataset.resizerHeight = `${height}px`;
    l.svgBox.dataset.resizerBaseWidth = String(width);
    l.svgBox.dataset.resizerBaseHeight = String(height);
    l.svgBox.dataset.resizerDefaultWidth = String(width);
    l.svgBox.dataset.resizerDefaultHeight = String(height);
    l.svgBox.dataset.resizerAspectRatio = String(ratio);
    l.svgBox.dataset.resizerAspectLocked = aspectLocked ? 'true' : 'false';
    l.svgBox.dataset.resizerResized = 'true';
    l.svgBox.dataset.resizerLastAxis = 'both';
    if(!l.graphPanel) l.graphPanel = {};
    if(!l.graphPanel.style) l.graphPanel.style = {};
    l.graphPanel.style.width = `${width}px`;
    l.graphPanel.style.height = `${height}px`;
    return l;
  }
  function applyLiveGraphSize(tab, type, variant){
    const target = getVariantLayoutTargets(variant);
    const root = getRoot(tab.id, type);
    const box = root?.querySelector?.('.svgbox') || root?.querySelector?.(`#${type}GraphPanel .svgbox`) || null;
    if(!box){
      warn('regression graph size skipped: svgbox not found', { tabId: tab.id, type, variant });
      return false;
    }
    const applyDirect = () => {
      box.style.width = `${target.width}px`;
      box.style.height = `${target.height}px`;
      box.style.flex = '0 0 auto';
      box.style.maxWidth = 'none';
      box.style.maxHeight = 'none';
      box.style.aspectRatio = `${target.width} / ${target.height}`;
      box.dataset.resizerWidth = `${target.width}px`;
      box.dataset.resizerHeight = `${target.height}px`;
      box.dataset.resizerBaseWidth = String(target.width);
      box.dataset.resizerBaseHeight = String(target.height);
      box.dataset.resizerDefaultWidth = String(target.width);
      box.dataset.resizerDefaultHeight = String(target.height);
      box.dataset.resizerAspectRatio = String(target.width / target.height);
      box.dataset.resizerAspectLocked = target.aspectLocked ? 'true' : 'false';
      box.dataset.resizerResized = 'true';
      box.dataset.resizerLastAxis = 'both';
      box.dataset.svgWidth = String(target.width);
      box.dataset.svgHeight = String(target.height);
      box.dataset.defaultWidth = String(target.width);
      box.dataset.defaultHeight = String(target.height);
      box.dataset.graphWidthPx = String(target.width);
      box.dataset.graphHeightPx = String(target.height);
      box.dataset.graphAspectRatio = String(target.width / target.height);
      box.dataset.graphAspectLocked = target.aspectLocked ? 'true' : 'false';
      box.dataset.aspectLocked = target.aspectLocked ? 'true' : 'false';
      const aspectCheckbox = box.querySelector?.('.resizer-aspect-checkbox') || null;
      if(aspectCheckbox){
        aspectCheckbox.checked = !!target.aspectLocked;
      }
    };
    let applied = null;
    try{
      if(typeof window.Shared?.applyResizableBoxSize === 'function'){
        applied = window.Shared.applyResizableBoxSize(box, {
          width: target.width,
          height: target.height,
          axis: 'both',
          forceExact: true,
          simulateAspectLock: target.aspectLocked,
          preserveAspectLock: true,
          updateAspectRatio: true,
          updateDefaults: true,
          reason: `regression-layout-variation-${type}-${variant}`
        });
      }
    }catch(err){
      warn('regression graph size helper failed', { tabId: tab.id, type, variant, message: err.message || String(err) });
    }
    applyDirect();
    debug('regression graph size applied', { tabId: tab.id, type, variant, target, helperApplied: applied || null });
    return true;
  }
  function ensureConfig(payload){
    if(!payload.config || typeof payload.config !== 'object') payload.config = {};
    return payload.config;
  }
  function ensureStyle(payload){
    if(!payload.style || typeof payload.style !== 'object') payload.style = {};
    return payload.style;
  }
  function applyThemeToPayload(type, payload, variant){
    const colors = getVariantColors(type, variant);
    let out = payload;
    try{
      if(window.Shared?.colorSchemes?.applyToPayload && colors.scheme){
        out = window.Shared.colorSchemes.applyToPayload(type, out, colors.scheme) || out;
      }
    }catch(err){
      warn('color scheme payload variation failed', { type, variant, scheme: colors.scheme, message: err.message || String(err) });
    }
    const c = ensureConfig(out);
    const style = ensureStyle(out);
    c.colorScheme = colors.scheme;
    c.fill = c.fill || colors.fill;
    c.border = c.border || colors.border;
    c.textColor = colors.text;
    c.backgroundColor = colors.background;
    style.colorScheme = colors.scheme;
    style.colorA = variant === 1 ? '#0072B2' : '#D55E00';
    style.colorB = variant === 1 ? '#009E73' : '#CC79A7';
    style.colorC = variant === 1 ? '#F0E442' : '#56B4E9';
    style.borderColor = colors.border;
    return out;
  }
  function applyComponentPayloadVariation(payload, type, variant){
    let p = clone(payload || {});
    p.type = p.type || type;
    p = applyThemeToPayload(type, p, variant);
    const c = ensureConfig(p);
    const style = ensureStyle(p);
    const fontSize = String(VARIANT_FONT_SIZE[variant] || (10 + variant * 3));
    c.fontSize = fontSize;
    style.fontsize = fontSize;
    c.title = `Regression ${type} variant ${variant}`;
    style.title = `Regression ${type} variant ${variant}`;
    c.notes = Object.assign({}, c.notes || {}, { text: `Regression notes for ${type} variant ${variant}`, open: variant === 2 });
    p.notes = Object.assign({}, p.notes || {}, { text: `Regression notes for ${type} variant ${variant}`, open: variant === 2 });
    switch(type){
      case 'box':
        c.graphType = variant === 1 ? 'strip' : 'violin';
        c.pointMode = variant === 1 ? 'none' : 'overlay';
        c.groupLayout = variant === 1 ? 'interleaved' : 'separated';
        c.showGrid = variant === 1;
        c.showFrame = true;
        c.significance = Object.assign({}, c.significance || {}, { labelMode: variant === 1 ? 'stars' : 'p' });
        break;
      case 'scatter':
        c.graphType = variant === 1 ? 'scatter' : 'volcano';
        c.viewMode = variant === 1 ? '2d' : '3d';
        c.colorMode = variant === 1 ? 'solid' : 'density';
        c.originMode = variant === 1 ? 'zero' : 'custom';
        c.showGrid = variant === 1;
        c.showLegend = variant === 1;
        c.regression = Object.assign({}, c.regression || {}, { mode: variant === 1 ? 'linear' : 'quadratic' });
        c.stats = Object.assign({}, c.stats || {}, { regressionMode: variant === 1 ? 'linear' : 'quadratic' });
        break;
      case 'line':
        c.viewMode = variant === 1 ? '2d' : '3d';
        c.displayMode = variant === 1 ? 'line' : 'area';
        c.originMode = variant === 1 ? 'zero' : 'custom';
        c.showGrid = variant === 1;
        c.showLegend = variant === 1;
        c.regression = Object.assign({}, c.regression || {}, { mode: variant === 1 ? 'linear' : 'cubic' });
        break;
      case 'hist':
        c.plotMode = variant === 1 ? 'histogram' : 'density';
        c.frequency = Object.assign({}, c.frequency || {}, {
          createMode: variant === 1 ? 'frequency' : 'cumulative',
          tabulateMode: variant === 1 ? 'count' : 'percent'
        });
        c.binningMode = variant === 1 ? 'count' : 'auto';
        c.showGrid = variant === 1;
        c.stats = Object.assign({}, c.stats || {}, {
          diagnosticsMode: variant === 1 ? 'normal-fit' : 'off',
          comparisonMode: variant === 1 ? 'ks' : 'off'
        });
        break;
      case 'heatmap':
        c.view = variant === 1 ? 'values' : 'corr-columns';
        c.heatmapView = variant === 1 ? 'values' : 'corr-columns';
        c.significanceDisplay = variant === 1 ? 'star' : 'pvalue';
        break;
      case 'pca':
        c.method = 'pca';
        c.viewMode = variant === 1 ? '2d' : '3d';
        c.showGrid = variant === 1;
        c.showLegend = variant === 1;
        c.axisSelection = Object.assign({}, c.axisSelection || {}, { x: 1, y: 2, z: 3 });
        break;
      case 'pie':
        c.chartType = variant === 1 ? 'pie' : 'donut';
        c.showLegend = variant === 1;
        break;
      case 'roc':
        c.graphType = variant === 1 ? 'roc' : 'pr';
        c.showGrid = variant === 1;
        c.showLegend = variant === 1;
        break;
      case 'survival':
        c.showCI = variant === 1;
        c.showCensor = variant === 1;
        c.showHazardRatios = variant === 2;
        c.showGrid = variant === 1;
        c.showLegend = variant === 1;
        c.pairwiseCorrection = variant === 1 ? 'holm-sidak' : 'benjamini-hochberg';
        break;
      case 'venn':
        style.plotType = variant === 1 ? 'venn' : 'upset';
        style.fontsize = fontSize;
        style.opacity = variant === 1 ? '0.45' : '0.75';
        style.borderWidth = variant === 1 ? '2' : '4';
        if(p.data && typeof p.data === 'object'){
          p.data.labelA = `A variant ${variant}`;
          p.data.labelB = `B variant ${variant}`;
          p.data.labelC = `C variant ${variant}`;
        }
        break;
      case 'surface':
        c.settings = Object.assign({}, c.settings || {}, {
          interpolation: variant === 1 ? 'grid' : 'scatter',
          showPoints: variant === 2,
          showGrid: variant === 1,
          fontSize: Number(fontSize)
        });
        c.showGrid = variant === 1;
        break;
      default:
        break;
    }
    p.__regressionVariant = variant;
    p.__regressionComponent = type;
    p.__regressionVariantProfile = extractVariantProperties({ payload: p, type, layoutState: null });
    return p;
  }
  function stampGraph(tabId, type, variant){
    const root = getRoot(tabId, type);
    const svg = root?.querySelector?.('.svgbox svg') || root?.querySelector?.('svg');
    if(!svg || !document.createElementNS) return false;
    try{
      const ns = 'http://www.w3.org/2000/svg';
      svg.querySelectorAll('[data-regression-watermark="true"]').forEach(node => node.remove());
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('data-regression-watermark', 'true');
      text.setAttribute('x', '8');
      text.setAttribute('y', String(18 + variant * 8));
      text.setAttribute('font-size', '10');
      text.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
      text.setAttribute('fill', variant === 1 ? '#0072B2' : '#D55E00');
      text.setAttribute('opacity', '0.95');
      text.textContent = `REG-${type}-${variant}`;
      svg.appendChild(text);
      return true;
    }catch(err){
      warn('stampGraph failed', { tabId, type, message: err.message || String(err) });
      return false;
    }
  }
  function getTabVariant(tab){
    const direct = Number(tab?.__regressionVariant);
    if(Number.isFinite(direct) && direct > 0) return direct;
    const payload = tab?.payload || null;
    const fromPayload = Number(payload?.__regressionVariant);
    if(Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload;
    const fromConfig = Number(payload?.config?.__regressionVariant);
    if(Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;
    const text = [
      tab?.title,
      payload?.config?.title,
      payload?.style?.title,
      payload?.config?.notes?.text,
      payload?.notes?.text
    ].filter(Boolean).join(' ');
    const match = /variant\s*(\d+)/i.exec(text);
    if(match){
      const inferred = Number(match[1]);
      if(Number.isFinite(inferred) && inferred > 0) return inferred;
    }
    const width = Number(payload?.layoutState?.svgBox?.widthPx ?? tab?.layoutState?.svgBox?.widthPx);
    if(width === 426) return 1;
    if(width === 512) return 2;
    return null;
  }
  function extractVariantProperties(source){
    const tab = source?.id ? source : null;
    const payload = source?.payload || source || {};
    const type = source?.type || payload?.type || tab?.type || null;
    const c = payload?.config && typeof payload.config === 'object' ? payload.config : {};
    const style = payload?.style && typeof payload.style === 'object' ? payload.style : {};
    const layout = source?.layoutState || tab?.layoutState || null;
    const svgBox = layout?.svgBox || {};
    const dataset = svgBox?.dataset || {};
    const settings = c.settings && typeof c.settings === 'object' ? c.settings : {};
    const base = {
      type,
      variant: getTabVariant(source) || Number(payload?.__regressionVariant) || null,
      title: c.title || style.title || '',
      fontSize: String(c.fontSize ?? style.fontsize ?? settings.fontSize ?? ''),
      colorScheme: c.colorScheme || style.colorScheme || settings.colorScheme || '',
      width: String(svgBox.widthPx ?? svgBox.baseWidthPx ?? dataset.svgWidth ?? dataset.resizerWidth ?? ''),
      height: String(svgBox.heightPx ?? svgBox.baseHeightPx ?? dataset.svgHeight ?? dataset.resizerHeight ?? ''),
      aspectLocked: String(dataset.aspectLocked ?? dataset.resizerAspectLocked ?? layout?.aspectLocked ?? '')
    };
    switch(type){
      case 'box':
        return Object.assign(base, { graphType: c.graphType || '', pointMode: c.pointMode || '', groupLayout: c.groupLayout || '', showGrid: !!c.showGrid });
      case 'scatter':
        return Object.assign(base, { graphType: c.graphType || '', viewMode: c.viewMode || '', colorMode: c.colorMode || '', regressionMode: c.regression?.mode || c.stats?.regressionMode || '', showGrid: !!c.showGrid });
      case 'line':
        return Object.assign(base, { displayMode: c.displayMode || '', viewMode: c.viewMode || '', regressionMode: c.regression?.mode || '', showGrid: !!c.showGrid });
      case 'hist':
        return Object.assign(base, { plotMode: c.plotMode || '', createMode: c.frequency?.createMode || '', tabulateMode: c.frequency?.tabulateMode || '', diagnosticsMode: c.stats?.diagnosticsMode || '' });
      case 'heatmap':
        return Object.assign(base, { view: c.view || c.heatmapView || '', significanceDisplay: c.significanceDisplay || '' });
      case 'pca':
        return Object.assign(base, { method: c.method || '', viewMode: c.viewMode || '', showGrid: !!c.showGrid });
      case 'pie':
        return Object.assign(base, { chartType: c.chartType || '', showLegend: c.showLegend !== false });
      case 'roc':
        return Object.assign(base, { graphType: c.graphType || '', showGrid: !!c.showGrid, showLegend: c.showLegend !== false });
      case 'survival':
        return Object.assign(base, { showCI: !!c.showCI, showCensor: !!c.showCensor, showHazardRatios: !!c.showHazardRatios, pairwiseCorrection: c.pairwiseCorrection || '' });
      case 'venn':
        return Object.assign(base, { plotType: style.plotType || '', opacity: style.opacity || '', borderWidth: style.borderWidth || '', labelA: payload?.data?.labelA || '' });
      case 'surface':
        return Object.assign(base, { interpolation: settings.interpolation || c.interpolation || '', showPoints: !!settings.showPoints, showGrid: !!(settings.showGrid ?? c.showGrid) });
      default:
        return base;
    }
  }
  function variantFingerprint(tab){
    return hashString(JSON.stringify(extractVariantProperties(tab)));
  }
  function summarizeVariantDivergence(){
    const byType = {};
    for(const tab of getGraphTabs()){
      const type = tab.type || 'unknown';
      const props = extractVariantProperties(tab);
      const entry = byType[type] || (byType[type] = []);
      entry.push({
        tabId: tab.id,
        type,
        variant: getTabVariant(tab),
        fingerprint: hashString(JSON.stringify(props)),
        properties: props
      });
    }
    const duplicateFingerprints = [];
    for(const [type, rows] of Object.entries(byType)){
      const seen = new Map();
      rows.forEach(row => {
        if(!seen.has(row.fingerprint)) seen.set(row.fingerprint, []);
        seen.get(row.fingerprint).push(row.tabId);
      });
      for(const [fingerprint, tabIds] of seen.entries()){
        if(tabIds.length > 1) duplicateFingerprints.push({ type, fingerprint, tabIds });
      }
    }
    return { byType, duplicateFingerprints };
  }
  function collectVariantDivergenceFailures(phase, expectedPerComponent){
    const summary = summarizeVariantDivergence();
    const failures = [];
    for(const [type, rows] of Object.entries(summary.byType)){
      if(expectedPerComponent && rows.length !== expectedPerComponent){
        failures.push(`${phase}: ${type} has ${rows.length} tabs, expected ${expectedPerComponent}`);
        continue;
      }
      if(rows.length < 2) continue;
      const variants = new Set(rows.map(row => row.variant).filter(Boolean));
      if(expectedPerComponent && variants.size < expectedPerComponent){
        failures.push(`${phase}: ${type} does not preserve distinct regression variant markers (${Array.from(variants).join(',') || 'none'})`);
      }
      const fingerprints = new Set(rows.map(row => row.fingerprint));
      if(fingerprints.size < rows.length){
        failures.push(`${phase}: ${type} variants have identical property fingerprints`);
      }
      const layouts = new Set(rows.map(row => `${row.properties.width}x${row.properties.height}:${row.properties.aspectLocked}`));
      if(layouts.size < rows.length){
        failures.push(`${phase}: ${type} variants have identical layout fingerprints`);
      }
    }
    if(summary.duplicateFingerprints.length){
      failures.push(...summary.duplicateFingerprints.map(group => `${phase}: ${group.type} duplicate variant fingerprint ${group.fingerprint} in ${group.tabIds.join(', ')}`));
    }
    return { summary, failures };
  }

  async function activateTab(tabId, reasonOrOptions){
    const activationOptions = reasonOrOptions && typeof reasonOrOptions === 'object'
      ? { ...reasonOrOptions }
      : { reason: reasonOrOptions || 'regression-activate' };
    activationOptions.reason = activationOptions.reason || 'regression-activate';
    const activeBefore = getActiveTab()?.id || null;
    const label = `activate ${tabId}`;
    progress('activate-tab:start', { tabId, reason: activationOptions.reason, activeBefore });
    let result = null;
    try{
      result = window.Main?.tabs?.activateTab?.(tabId, activationOptions);
    }catch(err){
      error('activateTab threw synchronously', { tabId, reason: activationOptions.reason, message: err.message || String(err), stack: err.stack || null });
      throw err;
    }
    if(result && typeof result.then === 'function'){
      const outcome = await withTimeout(result, 12000, label);
      if(outcome?.__regressionTimedOut){
        warn('activateTab promise timed out; checking DOM state before continuing', { tabId, reason: activationOptions.reason, timeoutMs: outcome.timeoutMs });
      }
    }
    await settle(160);
    const active = getActiveTab();
    if(!active || active.id !== tabId){
      await waitFor(() => {
        const current = getActiveTab();
        return current && current.id === tabId ? current : null;
      }, 5000, `active tab ${tabId} after ${activationOptions.reason}`);
    }
    progress('activate-tab:complete', { tabId, type: getActiveTab()?.type || null, reason: activationOptions.reason });
    return getActiveTab();
  }
  async function createBlankTab(){
    const session = window.Main?.session;
    const ws = getWorkspaceState();
    if(!session?.createTab || !ws) throw new Error('Graphitix session createTab unavailable');
    const tab = session.createTab({ duplicateSource: null });
    ws.tabs.push(tab);
    ws.activeTabId = tab.id;
    window.Main?.tabs?.renderTabs?.();
    await activateTab(tab.id, {
      reason: 'regression-create-tab',
      skipDuplicatePrompt: true,
      disableDuplicatePrompt: true,
      forceBlankWorkspace: true,
      skipDuplicateSource: true
    });
    if (ws) ws.pendingDuplicateSource = null;
    tab.duplicateSource = null;
    tab.pendingDuplicatePayload = null;
    tab.pendingDuplicateLayout = null;
    return tab;
  }
  async function createGraphTab(type, variant){
    progress('create-graph-tab:start', { type, variant });
    const tab = await createBlankTab();
    tab.__regressionVariant = variant;
    tab.__regressionComponent = type;
    const ws = getWorkspaceState();
    if (ws) ws.pendingDuplicateSource = null;
    tab.duplicateSource = null;
    tab.pendingDuplicatePayload = null;
    tab.pendingDuplicateLayout = null;
    progress('graph-selection:start', { tabId: tab.id, type, variant, skipDuplicatePrompt: true });
    const selectionResult = window.Main?.tabs?.handleGraphSelection?.(type, {
      reason: 'regression-graph-selection',
      skipDuplicatePrompt: true,
      forceBlankWorkspace: true
    });
    if(selectionResult && typeof selectionResult.then === 'function'){
      const outcome = await withTimeout(selectionResult, 12000, `graph selection ${type} ${tab.id}`);
      if(outcome?.__regressionTimedOut){
        warn('graph selection promise timed out; continuing to root check', { tabId: tab.id, type, variant, timeoutMs: outcome.timeoutMs });
      }
    }
    progress('graph-selection:requested', { tabId: tab.id, type, variant });
    await waitFor(() => {
      const current = getActiveTab();
      return current && current.id === tab.id && current.type === type;
    }, 12000, `tab ${tab.id} assigned ${type}`);
    tab.title = `Regression ${type} variant ${variant}`;
    window.Main?.tabs?.renderTabs?.();
    try {
      await waitFor(() => getRoot(tab.id, type), 12000, `mounted root for ${type} ${tab.id}`);
      progress('mounted-root:ready', { tabId: tab.id, type, variant });
    } catch (err) {
      const duplicateVisible = !!document.querySelector('.duplicate-prompt, [data-duplicate-prompt], #duplicatePrompt, .duplicate-tab-prompt');
      error('mounted root not ready after graph selection', {
        tabId: tab.id,
        type,
        variant,
        duplicateVisible,
        message: err.message || String(err)
      });
      throw err;
    }
    await settle(350);
    progress('load-example:start', { tabId: tab.id, type, variant });
    await loadExample(tab, type);
    progress('load-example:complete', { tabId: tab.id, type, variant });
    await settle(350);
    progress('apply-variation:start', { tabId: tab.id, type, variant });
    await applyVariation(tab, type, variant);
    progress('apply-variation:complete', { tabId: tab.id, type, variant });
    await settle(350);
    progress('persist-preview:start', { tabId: tab.id, type, variant });
    await persistAndPreview(tab, type, `regression-create-${variant}`);
    progress('persist-preview:complete', { tabId: tab.id, type, variant });
    progress('create-graph-tab:complete', { tabId: tab.id, type, variant });
    return tab;
  }
  async function loadExample(tab, type){
    const id = LOAD_EXAMPLE_IDS[type];
    if(!id){
      warn('no example id configured', { tabId: tab.id, type });
      return false;
    }
    const btn = findInRootOrDocument(tab.id, type, id);
    if(!btn){
      warn('example button not found', { tabId: tab.id, type, id });
      return false;
    }
    btn.click();
    await settle(450);
    debug('example clicked', { tabId: tab.id, type, id });
    return true;
  }
  async function applyVariation(tab, type, variant){
    const config = getConfig(type);
    tab.__regressionVariant = variant;
    tab.__regressionComponent = type;
    applyControlVariation(tab, type, variant);
    await settle(180);
    let payload = null;
    try{ payload = config?.getPayload?.() || tab.payload || null; }catch(err){ warn('getPayload failed before variation', { tabId: tab.id, type, message: err.message || String(err) }); }
    if(payload){
      const mutated = mutatePayload(payload, type, variant);
      if(typeof config?.loadFromPayload === 'function'){
        try{ config.loadFromPayload(mutated.payload, { source: 'regression-variation', tabId: tab.id, reason: 'regression-variation' }); }
        catch(err){ warn('loadFromPayload failed for variation', { tabId: tab.id, type, message: err.message || String(err) }); }
      }
      try{
        window.Main?.session?.updateTabPayload?.(tab, () => mutated.payload, { reason: 'regression-variation', origin: 'regression' });
        tab.payload = clone(mutated.payload);
        tab.__regressionVariant = variant;
        tab.__regressionComponent = type;
      }catch(err){ warn('updateTabPayload failed', { tabId: tab.id, type, message: err.message || String(err) }); }
    }
    await settle(160);
    try{
      config?.draw?.({ reason: 'regression-variation', force: true, tabId: tab.id });
    }catch(err){ warn('draw failed after variation', { tabId: tab.id, type, message: err.message || String(err) }); }
    await settle(400);
    const currentLayout = config?.getLayoutState?.({ tabId: tab.id, exact: true, reason: 'regression-layout-capture' }) || tab.layoutState || null;
    const nextLayout = mutateLayout(currentLayout, variant);
    try{
      config?.applyLayoutState?.(nextLayout, { tabId: tab.id, exact: true, resetStyles: false, resetDataset: false, reason: 'regression-layout-variation' });
      applyLiveGraphSize(tab, type, variant);
      await settle(180);
      const appliedLayout = config?.getLayoutState?.({ tabId: tab.id, exact: true, reason: 'regression-layout-applied-capture' }) || nextLayout;
      tab.layoutState = clone(appliedLayout);
      tab.layoutSignature = window.Main?.session?.serializePayloadSignature?.(tab.layoutState) || tab.layoutSignature || null;
      tab.__regressionExpectedLayout = getActualLayoutSize(tab);
      if(tab.payload){
        tab.payload.__regressionVariantProfile = extractVariantProperties(tab);
      }
      debug('regression layout variation committed', {
        tabId: tab.id,
        type,
        variant,
        expected: tab.__regressionExpectedLayout,
        layoutSignature: tab.layoutSignature
      });
    }catch(err){ warn('layout variation failed', { tabId: tab.id, type, message: err.message || String(err) }); }
    await settle(250);
    stampGraph(tab.id, type, variant);
  }
  async function persistAndPreview(tab, type, reason){
    const ctx = getContext();
    const config = getConfig(type);
    try{
      window.Main?.session?.persistActiveTabState?.(tab, Object.assign(ctx.withSessionContext ? ctx.withSessionContext({}) : {}, {
        reason,
        origin: 'regression',
        forcePreviewCapture: true,
        captureRenderCache: true,
        preserveRenderCacheTabIds: [tab.id]
      }));
    }catch(err){
      warn('persistActiveTabState failed', { tabId: tab.id, type, reason, message: err.message || String(err) });
    }
    try{
      window.Main?.previews?.updateTabPreviewFromWorkspace?.(tab, config, { reason, forceCapture: true });
    }catch(err){
      warn('preview update failed', { tabId: tab.id, type, reason, message: err.message || String(err) });
    }
    await settle(450);
    refreshRegressionExpectedLayout(tab, `${reason || 'persist'}-after-preview`);
  }
  async function runCreateWorkspace(options = {}){
    ensureCacheProbeInstalled();
    const components = Array.isArray(options.components) && options.components.length ? options.components : DEFAULT_COMPONENTS;
    const tabsPerComponent = Number(options.tabsPerComponent || 2);
    const failures = [];
    const created = [];
    debug('create workspace start', { components, tabsPerComponent });
    progress('create-workspace:start', { components, tabsPerComponent });
    for(const type of components){
      progress('component:start', { type });
      for(let i = 1; i <= tabsPerComponent; i += 1){
        progress('component-variant:start', { type, variant: i });
        try{
          const tab = await createGraphTab(type, i);
          created.push({ id: tab.id, type, variant: i });
          progress('component-variant:complete', { type, variant: i, tabId: tab.id });
        }catch(err){
          failures.push(`${type} variant ${i}: ${err.message || String(err)}`);
          error('create tab failed', { type, variant: i, message: err.message || String(err), stack: err.stack || null });
        }
      }
      progress('component:complete', { type });
    }
    progress('post-create-stabilize:start', { tabCount: created.length });
    const stabilizeResult = await switchTabsInternal('post-create-stabilize', tabsPerComponent);
    if(stabilizeResult?.failures?.length){
      failures.push(...stabilizeResult.failures.map(item => `post-create-stabilize: ${item}`));
    }
    const previewSummary = summarizeRuntimePreviews();
    const divergence = collectVariantDivergenceFailures('create-workspace', tabsPerComponent);
    if(divergence.failures.length){
      failures.push(...divergence.failures);
      warn('variant divergence failures after create', { failures: divergence.failures, summary: divergence.summary });
    }
    debug('create workspace complete', { createdCount: created.length, failures: failures.length, previewSummary, variantDivergence: divergence.summary });
    const graphTabs = getGraphTabs();
    const countByType = graphTabs.reduce((acc, tab) => {
      acc[tab.type] = (acc[tab.type] || 0) + 1;
      return acc;
    }, {});
    const missingPairs = components.filter(type => Number(countByType[type] || 0) !== tabsPerComponent);
    progress('create-workspace:tab-counts', { countByType, expectedPerComponent: tabsPerComponent, missingPairs });
    if(missingPairs.length){
      throw new Error(`Regression did not create exactly ${tabsPerComponent} tabs for: ${missingPairs.join(', ')}`);
    }
    progress('create-workspace:complete', { createdCount: created.length, failures: failures.length });
    return { created, failures, previewSummary, countByType, variantDivergence: divergence.summary };
  }
  function refreshRegressionExpectedLayout(tab, reason = 'refresh-expected-layout'){
    if(!tab){
      return null;
    }
    const actual = getActualLayoutSize(tab);
    if(actual && (actual.width || actual.height)){
      tab.__regressionExpectedLayout = actual;
      try{
        const config = getConfig(tab.type);
        const layout = config?.getLayoutState?.({ tabId: tab.id, exact: true, reason }) || tab.layoutState || null;
        if(layout){
          tab.layoutState = clone(layout);
          tab.layoutSignature = window.Main?.session?.serializePayloadSignature?.(tab.layoutState) || tab.layoutSignature || null;
        }
      }catch(err){
        warn('expected layout refresh failed to capture layout state', { tabId: tab.id, type: tab.type, reason, message: err.message || String(err) });
      }
      debug('regression expected layout refreshed', { tabId: tab.id, type: tab.type, reason, expected: actual });
    }
    return tab.__regressionExpectedLayout || null;
  }
  function getExpectedLayoutSize(tab){
    if(tab?.__regressionExpectedLayout){
      return clone(tab.__regressionExpectedLayout);
    }
    const state = tab?.layoutState || null;
    const svgBox = state?.svgBox || null;
    const dataset = svgBox?.dataset || {};
    const style = svgBox?.style || {};
    const read = (...values) => {
      for(const value of values){
        const n = Number.parseFloat(String(value == null ? '' : value));
        if(Number.isFinite(n) && n > 0) return n;
      }
      return null;
    };
    return {
      width: read(svgBox?.widthPx, svgBox?.baseWidthPx, dataset.svgWidth, dataset.resizerWidth, style.width),
      height: read(svgBox?.heightPx, svgBox?.baseHeightPx, dataset.svgHeight, dataset.resizerHeight, style.height),
      aspectLocked: String(dataset.aspectLocked ?? dataset.resizerAspectLocked ?? state?.aspectLocked ?? '').toLowerCase() === 'true'
    };
  }
  function getActualLayoutSize(tab){
    const root = getRoot(tab.id, tab.type);
    const box = root?.querySelector?.('.svgbox') || root?.querySelector?.(`#${tab.type}GraphPanel .svgbox`) || null;
    const read = (...values) => {
      for(const value of values){
        const n = Number.parseFloat(String(value == null ? '' : value));
        if(Number.isFinite(n) && n > 0) return n;
      }
      return null;
    };
    if(!box){
      return { width: null, height: null, aspectLocked: null };
    }
    return {
      width: read(box.style?.width, box.dataset?.resizerWidth, box.dataset?.svgWidth, box.getBoundingClientRect?.().width),
      height: read(box.style?.height, box.dataset?.resizerHeight, box.dataset?.svgHeight, box.getBoundingClientRect?.().height),
      aspectLocked: String(box.dataset?.aspectLocked ?? box.dataset?.resizerAspectLocked ?? '').toLowerCase() === 'true'
    };
  }
  function assertLayoutStable(tab){
    const expected = getExpectedLayoutSize(tab);
    const actual = getActualLayoutSize(tab);
    const tolerance = 3;
    const widthOk = !expected.width || !actual.width || Math.abs(expected.width - actual.width) <= tolerance;
    const heightOk = !expected.height || !actual.height || Math.abs(expected.height - actual.height) <= tolerance;
    const aspectOk = expected.aspectLocked == null || actual.aspectLocked == null || expected.aspectLocked === actual.aspectLocked;
    return {
      expected,
      actual,
      ok: widthOk && heightOk && aspectOk,
      widthOk,
      heightOk,
      aspectOk
    };
  }
  async function primeFullRenderCachesForSwitchProbe(phase){
    const tabs = getGraphTabs();
    const rows = [];
    progress('cache-prime:start', { phase, tabCount: tabs.length });
    for(const tab of tabs){
      try{
        cacheProbeState.activeSwitch = { phase: `${phase}:prime`, tabId: tab.id, type: tab.type };
        await activateTab(tab.id, `${phase}:cache-prime`);
        await waitFor(() => getRoot(tab.id, tab.type), 10000, `root after cache prime ${tab.id}`);
        await settle(240);
        await persistAndPreview(tab, tab.type, `${phase}:cache-prime`);
        await settle(120);
        rows.push({
          tabId: tab.id,
          type: tab.type,
          variant: tab.__regressionVariant || null,
          hasRenderCache: !!tab.renderCache,
          hasArchiveRenderCache: !!tab.archiveRenderCache,
          payloadSignature: tab.payloadSignature || null,
          layoutSignature: tab.layoutSignature || null
        });
      }catch(err){
        rows.push({ tabId: tab.id, type: tab.type, error: err.message || String(err), hasRenderCache: !!tab.renderCache, hasArchiveRenderCache: !!tab.archiveRenderCache });
        warn('cache prime failed', { phase, tabId: tab.id, type: tab.type, message: err.message || String(err) });
      }finally{
        cacheProbeState.activeSwitch = null;
      }
    }
    progress('cache-prime:complete', {
      phase,
      primed: rows.filter(row => row.hasRenderCache || row.hasArchiveRenderCache).length,
      missing: rows.filter(row => !row.hasRenderCache && !row.hasArchiveRenderCache).length
    });
    return rows;
  }

  async function switchTabsInternal(phase, expectedPerComponent = null, options = {}){
    ensureCacheProbeInstalled();
    const tabs = getGraphTabs();
    const visited = [];
    const failures = [];
    const cacheReuseRows = [];
    progress('switch-tabs:start', { phase, tabCount: tabs.length });
    for(const tab of tabs){
      try{
        progress('switch-tab:start', { phase, tabId: tab.id, type: tab.type });
        const cacheProbeCursor = getCacheProbeCursor();
        const switchStateBefore = getTabSwitchStateBefore(tab);
        cacheProbeState.activeSwitch = { phase, tabId: tab.id, type: tab.type };
        await activateTab(tab.id, phase || 'regression-switch');
        await waitFor(() => getRoot(tab.id, tab.type), 10000, `root after switch ${tab.id}`);
        await settle(180);
        stampGraph(tab.id, tab.type, tab.__regressionVariant || (visited.length % 2) + 1);
        const layoutCheck = assertLayoutStable(tab);
        const graphStatus = graphProbeForTab(tab);
        const hasGraph = graphStatus.ok;
        const cacheProbe = summarizeCacheEventsForTab(tab, cacheProbeCursor, phase, switchStateBefore);
        cacheReuseRows.push(cacheProbe);
        visited.push({
          id: tab.id,
          type: tab.type,
          hasGraph,
          graphStatus,
          layoutOk: layoutCheck.ok,
          expectedLayout: layoutCheck.expected,
          actualLayout: layoutCheck.actual,
          cacheProbe
        });
        progress('switch-tab:complete', {
          phase,
          tabId: tab.id,
          type: tab.type,
          hasGraph,
          layoutOk: layoutCheck.ok,
          cacheOutcome: cacheProbe.outcome,
          cacheAccepted: cacheProbe.cacheAccepted,
          cacheRejected: cacheProbe.cacheRejected,
          drawObserved: cacheProbe.drawObserved
        });
        cacheProbeState.activeSwitch = null;
        if(!layoutCheck.ok){
          failures.push(`${tab.id}/${tab.type}: layout mismatch expected ${JSON.stringify(layoutCheck.expected)} actual ${JSON.stringify(layoutCheck.actual)}`);
          warn('layout stability mismatch after switch', {
            tabId: tab.id,
            type: tab.type,
            phase,
            layoutCheck
          });
        }
        if(!hasGraph){
          failures.push(`${tab.id}/${tab.type}: graph missing after switch (${phase || 'switch-tabs'})`);
          warn('graph missing after switch', {
            tabId: tab.id,
            type: tab.type,
            phase,
            cacheOutcome: cacheProbe?.outcome || null,
            cacheAccepted: !!cacheProbe?.cacheAccepted,
            cacheRejected: !!cacheProbe?.cacheRejected,
            drawObserved: !!cacheProbe?.drawObserved,
            graphReason: graphStatus.reason || null,
            graphFallbackOk: !!graphStatus.fallbackOk
          });
        }
      }catch(err){
        cacheProbeState.activeSwitch = null;
        failures.push(`${tab.id}/${tab.type}: ${err.message || String(err)}`);
        error('switch failed', { tabId: tab.id, type: tab.type, phase, message: err.message || String(err) });
      }
    }
    const skipVariantDivergence = options.skipVariantDivergence === true;
    const divergence = skipVariantDivergence
      ? { summary: summarizeVariantDivergence(), failures: [] }
      : collectVariantDivergenceFailures(phase || 'switch-tabs', expectedPerComponent);
    if(!skipVariantDivergence && divergence.failures.length){
      failures.push(...divergence.failures);
      warn('variant divergence failures after switch', { phase, failures: divergence.failures, summary: divergence.summary });
    }
    const cacheReuseSummary = summarizeCacheReuseRows(cacheReuseRows);
    progress('switch-tabs:cache-reuse-summary', {
      phase,
      impactedTypes: cacheReuseSummary.impactedTypes,
      byType: cacheReuseSummary.byType
    });
    progress('switch-tabs:complete', { phase, visited: visited.length, failures: failures.length });
    return { visited, failures, variantDivergence: divergence.summary, cacheReuseSummary };
  }
  async function runSwitchingPhase(options = {}){
    const phase = options.phase || 'regression-switching';
    const primeRows = options.primeRenderCaches === false ? [] : await primeFullRenderCachesForSwitchProbe(phase);
    const result = await switchTabsInternal(`${phase}:probe`, Number(options.tabsPerComponent || 2), { cacheProbe: true });
    return Object.assign(result, {
      primeRows,
      previewSummary: summarizeRuntimePreviews(),
      cacheSummary: summarizeRuntimeCaches()
    });
  }
  async function alignTabsToSameStateForSwitchPhase(phase, options = {}){
    const failures = [];
    const tabsPerComponent = Math.max(1, Number(options.tabsPerComponent || 2));
    const byType = {};
    getGraphTabs().forEach(tab => {
      const type = tab?.type || 'unknown';
      if(!byType[type]) byType[type] = [];
      byType[type].push(tab);
    });
    for(const [type, rows] of Object.entries(byType)){
      const targetTabs = rows.slice(0, tabsPerComponent);
      for(const tab of targetTabs){
        try{
          await activateTab(tab.id, { reason: `${phase}:same-state-prepare` });
          await waitFor(() => getRoot(tab.id, tab.type), 10000, `root after same-state prepare ${tab.id}`);
          await settle(120);
          await loadExample(tab, type);
          applyControlVariation(tab, type, 1);
          await settle(140);
          await persistAndPreview(tab, type, `${phase}:same-state`);
          tab.__regressionVariant = 1;
          stampGraph(tab.id, type, 1);
        }catch(err){
          const message = err?.message || String(err);
          failures.push(`${type}/${tab.id}: same-state alignment failed: ${message}`);
          warn('homogeneous switch alignment failed', { phase, type, tabId: tab.id, message });
        }
      }
    }
    return failures;
  }
  async function runHomogeneousSwitchingPhase(options = {}){
    const phase = options.phase || 'homogeneous-switching';
    const tabsPerComponent = Math.max(1, Number(options.tabsPerComponent || 2));
    progress('homogeneous-switch:start', { phase, tabsPerComponent });
    const prepFailures = await alignTabsToSameStateForSwitchPhase(phase, { tabsPerComponent });
    const result = await switchTabsInternal(`${phase}:probe`, tabsPerComponent, {
      cacheProbe: true,
      skipVariantDivergence: true
    });
    if(prepFailures.length){
      result.failures = prepFailures.concat(result.failures || []);
    }
    progress('homogeneous-switch:complete', {
      phase,
      prepFailures: prepFailures.length,
      switchFailures: (result.failures || []).length
    });
    return Object.assign(result, {
      prepFailures,
      previewSummary: summarizeRuntimePreviews(),
      cacheSummary: summarizeRuntimeCaches()
    });
  }
  function summarizeRuntimePreviews(){
    const byType = {};
    for(const tab of getGraphTabs()){
      const norm = normalizePreviewForHash(tab.previewMarkup || '');
      const entry = byType[tab.type] || (byType[tab.type] = []);
      entry.push({ tabId: tab.id, hash: hashString(norm), length: norm.length, hasPreview: !!tab.previewMarkup });
    }
    const duplicateGroups = [];
    for(const [type, rows] of Object.entries(byType)){
      const hashes = new Map();
      rows.forEach(row => {
        if(!hashes.has(row.hash)) hashes.set(row.hash, []);
        hashes.get(row.hash).push(row.tabId);
      });
      for(const [hash, ids] of hashes.entries()){
        if(ids.length > 1) duplicateGroups.push({ type, hash, tabIds: ids });
      }
    }
    return { byType, duplicateGroups };
  }
  function summarizeRuntimeCaches(){
    const rows = getGraphTabs().map(tab => ({
      tabId: tab.id,
      type: tab.type,
      hasRenderCache: !!tab.renderCache,
      hasArchiveRenderCache: !!tab.archiveRenderCache,
      payloadSignature: tab.payloadSignature || null,
      layoutSignature: tab.layoutSignature || null
    }));
    return {
      rows,
      counts: {
        tabs: rows.length,
        renderCache: rows.filter(r => r.hasRenderCache).length,
        archiveRenderCache: rows.filter(r => r.hasArchiveRenderCache).length
      }
    };
  }
  function blobToBase64(blob){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }
  function base64ToBlob(base64, type){
    const clean = String(base64 || '').replace(/^data:[^,]+,/, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/zip' });
  }
  async function runSavePhase(options = {}){
    progress('save-phase:start', options || {});
    const ctx = getContext();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(ctx, {
      scope: 'workspace',
      reason: 'regression-save',
      fileName: options.fileName || 'workspace-regression.graph',
      useWorker: false,
      compression: 'STORE'
    });
    if(!blob) throw new Error('buildWorkspaceArchiveBlob returned null');
    const base64 = await blobToBase64(blob);
    debug('save phase complete', { bytes: blob.size, tabCount: getGraphTabs().length });
    progress('save-phase:complete', { bytes: blob.size, tabCount: getGraphTabs().length });
    return { base64, bytes: blob.size, previewSummary: summarizeRuntimePreviews(), cacheSummary: summarizeRuntimeCaches() };
  }
  async function runReopenColdCachePhase(options = {}){
    progress('reopen-cold-cache-phase:start', { fileName: options.fileName || null, hasBase64: !!options.base64 });
    const base64 = options.base64;
    if(!base64) throw new Error('base64 graph payload missing');
    ensureCacheProbeInstalled();
    const ctx = getContext();
    const blob = base64ToBlob(base64, 'application/zip');
    blob.name = options.fileName || 'workspace-regression.graph';
    await window.Main?.sessionActions?.applyArchiveBlob?.(ctx, blob, {
      reason: 'regression-cold-reopen',
      fileName: blob.name,
      loadMode: 'replace',
      skipWarmup: true
    });
    await waitFor(() => getGraphTabs().length > 0, 15000, 'graph tabs after cold reopen');
    await settle(240);
    const coldSwitch = await switchTabsInternal('regression-reopened-cold-first-activation', Number(options.tabsPerComponent || 2), {
      cacheProbe: true,
      coldReopen: true
    });
    progress('reopen-cold-cache-phase:complete', {
      visited: coldSwitch.visited?.length || 0,
      failures: coldSwitch.failures?.length || 0,
      slowTypes: coldSwitch.cacheReuseSummary?.slowTypes || []
    });
    return Object.assign(coldSwitch, {
      previewSummary: summarizeRuntimePreviews(),
      cacheSummary: summarizeRuntimeCaches()
    });
  }

  async function runReopenAndSwitchPhase(options = {}){
    progress('reopen-phase:start', { fileName: options.fileName || null, hasBase64: !!options.base64 });
    const base64 = options.base64;
    if(!base64) throw new Error('base64 graph payload missing');
    const ctx = getContext();
    const blob = base64ToBlob(base64, 'application/zip');
    blob.name = options.fileName || 'workspace-regression.graph';
    await window.Main?.sessionActions?.applyArchiveBlob?.(ctx, blob, {
      reason: 'regression-reopen',
      fileName: blob.name,
      loadMode: 'replace',
      skipWarmup: options.skipWarmup === true
    });
    await waitFor(() => getGraphTabs().length > 0, 15000, 'graph tabs after reopen');
    if(options.skipWarmup !== true && typeof window.Main?.sessionActions?.awaitPostLoadWarmup === 'function'){
      progress('reopen-phase:await-post-load-warmup:start', {});
      const warmupResult = await window.Main.sessionActions.awaitPostLoadWarmup({ timeoutMs: 90000, reason: 'regression-reopen-await-warmup' });
      progress('reopen-phase:await-post-load-warmup:complete', warmupResult || {});
    }
    await settle(700);
    const switchResult = await switchTabsInternal('regression-reopened-switch', Number(options.tabsPerComponent || 2));
    progress('reopen-phase:complete', { visited: switchResult.visited?.length || 0, failures: switchResult.failures?.length || 0 });
    return Object.assign(switchResult, { previewSummary: summarizeRuntimePreviews(), cacheSummary: summarizeRuntimeCaches() });
  }

  async function runLiveEditCacheInvalidationPhase(options = {}){
    const phase = options.phase || 'live-edit-cache-invalidation';
    const failures = [];
    const rows = [];
    const tabs = getGraphTabs();
    progress('live-edit-cache-invalidation:start', { phase, tabCount: tabs.length });
    for(const tab of tabs){
      try{
        await activateTab(tab.id, { reason: `${phase}:activate` });
        await waitFor(() => getRoot(tab.id, tab.type), 10000, `root after ${phase} activate ${tab.id}`);
        await settle(180);
        await persistAndPreview(tab, tab.type, `${phase}:prime-cache`);
        await settle(120);
        const hadRuntimeCacheBefore = !!tab.renderCache;
        const hadArchiveCacheBefore = !!tab.archiveRenderCache;
        const marked = !!window.Main?.session?.markTabUserModified?.(tab, `${phase}:user-edit`, {
          origin: 'user',
          affectsPayload: false,
          markSessionDirty: false
        });
        await settle(120);
        const hasRuntimeCacheAfter = !!tab.renderCache;
        const hasArchiveCacheAfter = !!tab.archiveRenderCache;
        const row = {
          tabId: tab.id,
          type: tab.type,
          marked,
          hadRuntimeCacheBefore,
          hadArchiveCacheBefore,
          hasRuntimeCacheAfter,
          hasArchiveCacheAfter
        };
        rows.push(row);
        if(!hadRuntimeCacheBefore && !hadArchiveCacheBefore){
          failures.push(`${tab.type} (${tab.id}): live-edit invalidation probe could not prime a render cache before mutation`);
        }
        if(!marked){
          failures.push(`${tab.type} (${tab.id}): live-edit invalidation probe could not mark tab as user-modified`);
        }
        if(hasRuntimeCacheAfter || hasArchiveCacheAfter){
          failures.push(`${tab.type} (${tab.id}): render cache not cleared after live user mutation (runtime=${hasRuntimeCacheAfter}, archive=${hasArchiveCacheAfter})`);
        }
        progress('live-edit-cache-invalidation:tab', {
          phase,
          tabId: tab.id,
          type: tab.type,
          marked,
          hadRuntimeCacheBefore,
          hadArchiveCacheBefore,
          hasRuntimeCacheAfter,
          hasArchiveCacheAfter
        });
      }catch(err){
        const message = err?.message || String(err);
        failures.push(`${tab.type} (${tab.id}) live-edit cache invalidation failed: ${message}`);
        error('live-edit-cache-invalidation failed', { phase, tabId: tab.id, type: tab.type, message });
      }
    }
    progress('live-edit-cache-invalidation:complete', {
      phase,
      checked: rows.length,
      failures: failures.length
    });
    return {
      rows,
      failures,
      cacheSummary: summarizeRuntimeCaches()
    };
  }

  async function runResizeAfterSwitchPhase(options = {}){
    const failures = [];
    const rows = [];
    const graphTabs = getGraphTabs();
    const welcomeTab = getWorkspaceState()?.tabs?.find?.(tab => !!tab?.isWelcome) || null;
    progress('resize-after-switch:start', { tabCount: graphTabs.length, hasWelcome: !!welcomeTab });
    if(!welcomeTab){
      failures.push('welcome tab missing; cannot run resize-after-switch probe');
      return { rows, failures };
    }
    for(const tab of graphTabs){
      await activateTab(tab.id, { reason: 'resize-after-switch:baseline' });
      await settle(140);
      await activateTab(welcomeTab.id, { reason: 'resize-after-switch:away' });
      await settle(120);
      await activateTab(tab.id, { reason: 'resize-after-switch:back' });
      await settle(220);

      const root = getRoot(tab.id, tab.type);
      const box = root?.querySelector?.('.svgbox') || root?.querySelector?.(`#${tab.type}GraphPanel .svgbox`) || null;
      const handle = box?.querySelector?.('.resizer-corner') || null;
      if(!box || !handle){
        const reason = !box ? 'missing-svgbox' : 'missing-resizer-corner';
        failures.push(`${tab.type} (${tab.id}): ${reason}`);
        rows.push({ tabId: tab.id, type: tab.type, ok: false, reason });
        continue;
      }
      const beforeRect = box.getBoundingClientRect?.() || null;
      const handleRect = handle.getBoundingClientRect?.() || null;
      const beforeWidth = Number(beforeRect?.width) || 0;
      const beforeHeight = Number(beforeRect?.height) || 0;
      if(!(beforeWidth > 0) || !(beforeHeight > 0) || !handleRect){
        failures.push(`${tab.type} (${tab.id}): invalid pre-resize geometry`);
        rows.push({ tabId: tab.id, type: tab.type, ok: false, reason: 'invalid-pre-geometry' });
        continue;
      }

      const startX = handleRect.x + (handleRect.width / 2);
      const startY = handleRect.y + (handleRect.height / 2);
      const pointerId = 101;
      const dx = Number.isFinite(options.pointerDx) ? Number(options.pointerDx) : -120;
      const dy = Number.isFinite(options.pointerDy) ? Number(options.pointerDy) : -96;
      const pointerOptions = {
        pointerId,
        bubbles: true,
        cancelable: true,
        composed: true,
        isPrimary: true,
        pointerType: 'mouse'
      };
      handle.dispatchEvent(new PointerEvent('pointerdown', {
        ...pointerOptions,
        clientX: startX,
        clientY: startY,
        buttons: 1
      }));
      document.dispatchEvent(new PointerEvent('pointermove', {
        ...pointerOptions,
        clientX: startX + dx,
        clientY: startY + dy,
        buttons: 1
      }));
      document.dispatchEvent(new PointerEvent('pointerup', {
        ...pointerOptions,
        clientX: startX + dx,
        clientY: startY + dy,
        buttons: 0
      }));
      await settle(140);

      const afterRect = box.getBoundingClientRect?.() || null;
      const afterWidth = Number(afterRect?.width) || 0;
      const afterHeight = Number(afterRect?.height) || 0;
      const widthDelta = afterWidth - beforeWidth;
      const heightDelta = afterHeight - beforeHeight;
      const changed = Math.abs(widthDelta) > 8 || Math.abs(heightDelta) > 8;
      const shrunk = widthDelta < -8 || heightDelta < -8;
      const ok = changed && shrunk;
      rows.push({
        tabId: tab.id,
        type: tab.type,
        ok,
        before: { width: beforeWidth, height: beforeHeight },
        after: { width: afterWidth, height: afterHeight },
        delta: { width: widthDelta, height: heightDelta },
        graphWidthPx: box.dataset?.graphWidthPx || null,
        graphHeightPx: box.dataset?.graphHeightPx || null
      });
      progress('resize-after-switch:tab', {
        tabId: tab.id,
        type: tab.type,
        ok,
        beforeWidth,
        afterWidth,
        widthDelta,
        beforeHeight,
        afterHeight,
        heightDelta
      });
      if(!ok){
        failures.push(`${tab.type} (${tab.id}) resize probe failed: dw=${widthDelta.toFixed(1)}, dh=${heightDelta.toFixed(1)}`);
      }
    }
    progress('resize-after-switch:complete', { checked: rows.length, failures: failures.length });
    return { rows, failures };
  }
  async function runThemeIsolationPhase(options = {}){
    const phase = options.phase || 'theme-isolation';
    const targetTypes = Array.isArray(options.types) && options.types.length
      ? options.types.map(type => String(type || '').trim().toLowerCase()).filter(Boolean)
      : ['scatter'];
    const failures = [];
    const rows = [];
    progress('theme-isolation:start', { phase, targetTypes });
    for(const type of targetTypes){
      const tabs = getGraphTabs().filter(tab => String(tab?.type || '').toLowerCase() === type).slice(0, 2);
      if(tabs.length < 2){
        failures.push(`${type}: requires at least 2 tabs for cross-tab theme isolation probe`);
        continue;
      }
      const lightTab = tabs[0];
      const darkTab = tabs[1];
      try{
        await activateTab(lightTab.id, { reason: `${phase}:${type}:prepare-light` });
        await settle(180);
        window.Shared?.colorSchemes?.applyToActiveTab?.(type, 'scientific');
        await settle(260);
        const lightBefore = probeRenderedTheme(lightTab);
        rows.push({ stage: 'light-before', ...lightBefore });

        await activateTab(darkTab.id, { reason: `${phase}:${type}:prepare-dark` });
        await settle(180);
        window.Shared?.colorSchemes?.applyToActiveTab?.(type, 'dark');
        await settle(260);
        const darkBefore = probeRenderedTheme(darkTab);
        rows.push({ stage: 'dark-before', ...darkBefore });

        await activateTab(lightTab.id, { reason: `${phase}:${type}:recheck-light` });
        await settle(260);
        const lightAfter = probeRenderedTheme(lightTab);
        rows.push({ stage: 'light-after', ...lightAfter });

        await activateTab(darkTab.id, { reason: `${phase}:${type}:recheck-dark` });
        await settle(260);
        const darkAfter = probeRenderedTheme(darkTab);
        rows.push({ stage: 'dark-after', ...darkAfter });

        if(lightBefore.inferredDark || isBrightThemeText(lightBefore)){
          failures.push(`${type}/${lightTab.id}: baseline light tab rendered as dark before switch`);
        }
        if((lightBefore.payloadSchemeId || 'scientific') !== 'scientific'){
          failures.push(`${type}/${lightTab.id}: baseline light tab payload scheme drifted (${lightBefore.payloadSchemeId || 'missing'})`);
        }
        if(!darkBefore.inferredDark || !isBrightThemeText(darkBefore)){
          failures.push(`${type}/${darkTab.id}: baseline dark tab did not render as dark before switch`);
        }
        if((darkBefore.payloadSchemeId || 'scientific') !== 'dark'){
          failures.push(`${type}/${darkTab.id}: baseline dark tab payload scheme drifted (${darkBefore.payloadSchemeId || 'missing'})`);
        }
        if(lightAfter.inferredDark || isBrightThemeText(lightAfter)){
          failures.push(`${type}/${lightTab.id}: dark theme leaked into sibling tab after same-type switch`);
        }
        if((lightAfter.payloadSchemeId || 'scientific') !== 'scientific'){
          failures.push(`${type}/${lightTab.id}: dark theme leaked into sibling payload scheme (${lightAfter.payloadSchemeId || 'missing'})`);
        }
        if(type === 'scatter' && lightBefore.symbolColorSignature && lightAfter.symbolColorSignature && lightBefore.symbolColorSignature !== lightAfter.symbolColorSignature){
          failures.push(`${type}/${lightTab.id}: symbol colors leaked into sibling tab after same-type switch`);
        }
        if(type === 'scatter' && lightBefore.payloadSymbolSignature && lightAfter.payloadSymbolSignature && lightBefore.payloadSymbolSignature !== lightAfter.payloadSymbolSignature){
          failures.push(`${type}/${lightTab.id}: payload symbol color signature drifted after same-type switch`);
        }
        if(!darkAfter.inferredDark || !isBrightThemeText(darkAfter)){
          failures.push(`${type}/${darkTab.id}: dark tab lost dark rendering after same-type switch`);
        }
        if((darkAfter.payloadSchemeId || 'scientific') !== 'dark'){
          failures.push(`${type}/${darkTab.id}: dark tab payload scheme changed unexpectedly (${darkAfter.payloadSchemeId || 'missing'})`);
        }

        progress('theme-isolation:type-complete', {
          phase,
          type,
          lightTabId: lightTab.id,
          darkTabId: darkTab.id,
          lightBeforeDark: !!lightBefore.inferredDark,
          lightAfterDark: !!lightAfter.inferredDark,
          darkBeforeDark: !!darkBefore.inferredDark,
          darkAfterDark: !!darkAfter.inferredDark
        });
      }catch(err){
        const message = err?.message || String(err);
        failures.push(`${type}: theme isolation probe failed: ${message}`);
        error('theme isolation probe failed', { phase, type, message });
      }
    }
    progress('theme-isolation:complete', { phase, checked: rows.length, failures: failures.length });
    return { rows, failures };
  }

  window.GraphitixRegression = {
    runCreateWorkspace,
    runSwitchingPhase,
    runHomogeneousSwitchingPhase,
    runSavePhase,
    runReopenColdCachePhase,
    runReopenAndSwitchPhase,
    runLiveEditCacheInvalidationPhase,
    runResizeAfterSwitchPhase,
    runThemeIsolationPhase,
    summarizeRuntimePreviews,
    summarizeRuntimeCaches,
    summarizeCacheReuseRows,
    getCacheProbeEvents: () => cacheProbeState.events.slice()
  };
  ensureCacheProbeInstalled();
  debug('renderer harness installed', { defaultComponents: DEFAULT_COMPONENTS });
})();
