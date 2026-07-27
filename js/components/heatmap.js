(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const heatmap = Components.heatmap = Components.heatmap || {};

  const sanitizeHeatmapDrawOptions = (options = {}, owner = {}) => (
    Shared.componentLifecycle?.sanitizeComponentDrawOptions?.('heatmap', options, owner) || {}
  );

  function getHeatmapRuntimeOwner(){
    return Shared.componentLifecycle?.createRuntimeOwner?.(heatmap, { componentKey: 'heatmap' }) || null;
  }

  function rememberHeatmapOwnedRuntimeRecord(tabLike = null, snapshot = null, meta = {}){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    setHeatmapSessionStateFromRuntimeRecord(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      reason: meta?.reason || 'heatmap-owned-runtime-remember'
    });
    return getHeatmapRuntimeOwner()?.capture(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'heatmap',
      reason: meta?.reason || 'heatmap-owned-runtime-remember'
    }) || snapshot;
  }

  function resolveHeatmapOwnedRuntimeSnapshot(snapshot = null, meta = {}){
    return getHeatmapRuntimeOwner()?.bind(snapshot || null, {
      ...(meta || {}),
      componentKey: 'heatmap',
      reason: meta?.reason || 'heatmap-owned-runtime-resolve'
    }) || snapshot || getHeatmapSession(meta?.tab || meta?.tabId || null, meta, { create: false })?.state || null;
  }

  function applyExistingHeatmapOwnedRuntimeRecord(tabLike = null, meta = {}){
    const session = bindHeatmapSessionForTab(tabLike || meta?.tabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'heatmap-owned-runtime-activate-bind'
    });
    const snapshot = getHeatmapRuntimeOwner()?.bind(null, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'heatmap',
      reason: meta?.reason || 'heatmap-owned-runtime-activate-apply'
    });
    if(snapshot && typeof heatmap.applyRuntimeState === 'function'){
      return heatmap.applyRuntimeState(snapshot, {
        ...(meta || {}),
        reason: meta?.reason || 'heatmap-owned-runtime-activate-apply'
      });
    }
    if(session){
      return applyHeatmapSessionStateToActive(session, { syncUi: true });
    }
    return false;
  }


  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const dendrogramControls = Shared.dendrogramControls = Shared.dendrogramControls || {};
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      debugLog('Debug: heatmap component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if(typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataTransforms.js');
    }catch(err){
      debugLog('Debug: heatmap component dataTransforms helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      debugLog('Debug: heatmap component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesState = { text: '', open: false, control: null };
  const exportFontStyles = (scopeId, options = {}) => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId, options)
    : null;
  const importFontStyles = (scopeId, styles, options = {}) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, {
        ...(options || {}),
        prune: options?.prune !== false
      });
    }
  };
  const formControls = Shared.formControls = Shared.formControls || {};
  heatmap.__installed = true;
  heatmap.ready = false;

  function debugLog(label, ...rest){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // Ignore toggle errors and log by default
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      if(rest.length){
        console.debug(label, ...rest);
      }else{
        console.debug(label);
      }
    }
  }

  const nowMs = () => {
    if(global.performance && typeof global.performance.now === 'function'){
      return global.performance.now();
    }
    return Date.now();
  };

  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    debugLog('Debug: heatmap component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    debugLog('Debug: heatmap component awaiting Shared.tableImport helpers');
  }

  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('heatmap')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'heatmap', debugLabel: 'heatmap-viewport-fallback', ...options });
        return;
      }
      debugLog('Debug: heatmap ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  debugLog('Debug: heatmap graph viewport helper configured', {
    hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
    usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
  });

  const makeEditable = (el, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if(typeof fn === 'function'){
      return fn(el, onChange, options);
    }
    console.warn('heatmap component makeEditable fallback missing');
    return undefined;
  };

  function resolveHeatmapAsyncTabId(meta = {}, hotInstance = null){
    const activeTab = global.Main?.session?.getActiveTab?.() || null;
    return String(
      meta?.tabId
      || meta?.workspaceTabId
      || meta?.tab?.id
      || meta?.__workspaceSessionMeta?.tabId
      || hotInstance?.__heatmapTabId
      || state.hot?.__heatmapTabId
      || getHeatmapProjectionTabId()
      || Shared.workspaceTabs?.getActiveSessionInfo?.('heatmap')?.tabId
      || (activeTab?.type === 'heatmap' ? activeTab.id : null)
      || ''
    ).trim() || null;
  }

  function scheduleHeatmapAsyncFrame(reason, fn, meta = {}){
    if(typeof fn !== 'function'){
      return null;
    }
    return Shared.componentLifecycle?.scheduleComponentFrame?.(heatmap, 'heatmap', {
      ...(meta || {}),
      tabId: resolveHeatmapAsyncTabId(meta),
      reason: reason || meta?.reason || 'heatmap-frame'
    }, () => fn()) || null;
  }

  let heatmapFontObserver = null;
  let heatmapFontObserverTarget = null;
  let heatmapFontEventBound = false;
  const scheduleHeatmapFontRefresh = (() => {
    const runRefresh = (options = {}) => {
      const ownerTabId = String(options?.tabId || getHeatmapProjectionTabId() || '').trim() || null;
      const reason = options?.reason || 'font-style-change';
      if(state.isRendering){
        scheduleHeatmapFontRefresh(reason, { tabId: ownerTabId });
        return;
      }
      const ownerSession = ownerTabId
        ? getHeatmapSession(ownerTabId, { tabId: ownerTabId, reason }, { create: false })
        : getActiveHeatmapSessionForState();
      const ownerRuntime = getHeatmapDrawRuntime(ownerSession, { seedFromActive: !ownerSession });
      if(ownerRuntime?.inlineTextEditing){
        debugLog('Debug: heatmap font refresh skipped during inline text edit', {
          tabId: ownerSession?.tabId || ownerTabId || null,
          reason
        });
        return;
      }
      scheduleHeatmapDrawForSession(ownerSession, {
        tabId: ownerTabId || undefined,
        viewOnly: true,
        reason
      });
    };
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(heatmap, 'heatmap', runRefresh, { reason: 'heatmap-font-refresh' })
      : null;
    const schedule = (reason, options = {}) => {
      const tabId = String(options?.tabId || getHeatmapProjectionTabId() || '').trim() || null;
      const request = { tabId, reason: reason || 'font-style-change' };
      if(debounced){
        return debounced(request);
      }
      runRefresh(request);
      return null;
    };
    schedule.clear = tabId => debounced?.clear?.(tabId);
    return schedule;
  })();

  const ensureHeatmapFontObserver = () => {
    const target = state.svg || null;
    if(typeof global.MutationObserver !== 'function' || !target){
      return;
    }
    if(heatmapFontObserver && heatmapFontObserverTarget === target){
      return;
    }
    heatmapFontObserver?.disconnect?.();
    const ownerTabId = String(target.dataset?.fontTabId || getHeatmapProjectionTabId() || '').trim() || null;
    heatmapFontObserver = new global.MutationObserver(mutations => {
      if(state.isRendering || heatmapFontObserverTarget !== target){ return; }
      const shouldRefresh = mutations.some(mutation => {
        if(mutation.type !== 'attributes'){ return false; }
        const mutationTarget = mutation.target;
        const nodeName = mutationTarget?.nodeName?.toLowerCase?.() || '';
        if(nodeName !== 'text' && nodeName !== 'tspan'){ return false; }
        const scope = mutationTarget?.dataset?.fontScope
          || mutationTarget?.closest?.('svg')?.dataset?.fontScope
          || null;
        return scope === 'heatmap';
      });
      if(shouldRefresh){
        debugLog('Debug: heatmap font mutation detected', { count: mutations.length, tabId: ownerTabId });
        scheduleHeatmapFontRefresh('font-mutation', { tabId: ownerTabId });
      }
    });
    heatmapFontObserver.observe(target, {
      subtree: true,
      attributes: true,
      // Ignore generic `style` mutations: fontControls text highlight uses style.filter on click,
      // and observing that causes a redraw loop/flicker. Real font updates are handled by
      // explicit fontControls:styleChanged events and direct font-* attributes.
      attributeFilter: ['font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'baseline-shift']
    });
    heatmapFontObserverTarget = target;
    debugLog('Debug: heatmap font observer attached', { tabId: ownerTabId });
  };

  const ensureHeatmapFontEventListener = () => {
    if(heatmapFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      if(state.isRendering){ return; }
      const detail = event?.detail || {};
      const scopeId = detail.scopeId || null;
      const storeKey = detail.storeKey || '';
      if(scopeId === 'heatmap' || (typeof storeKey === 'string' && storeKey.startsWith('heatmap::'))){
        scheduleHeatmapFontRefresh('font-style-event', { tabId: detail.tabId || null });
      }
    });
    heatmapFontEventBound = true;
    debugLog('Debug: heatmap font style listener attached');
  };

  let heatmapTextResizeObserver = null;
  let heatmapTextResizeObserverTarget = null;
  const stripAspectMatrixTransform = (transform) => {
    const trimmed = typeof transform === 'string' ? transform.trim() : '';
    if(!trimmed){ return ''; }
    const withoutLeading = trimmed.replace(/^matrix\([^)]*\)\s*/i, '');
    const withoutTrailing = withoutLeading.replace(/\s*matrix\([^)]*\)\s*$/i, '');
    return withoutTrailing.trim();
  };
  const getHeatmapBaseTransform = (text) => {
    if(!text){ return ''; }
    const attrValue = typeof text.getAttribute === 'function'
      ? text.getAttribute('data-heatmap-base-transform')
      : null;
    if(typeof attrValue === 'string' && attrValue.length > 0){
      return attrValue;
    }
    const role = text.dataset?.fontRole
      || text.closest?.('[data-font-role]')?.dataset?.fontRole
      || '';
    if(role === 'columnLabel'){
      const x = Number(text.getAttribute?.('x'));
      const y = Number(text.getAttribute?.('y'));
      if(Number.isFinite(x) && Number.isFinite(y)){
        return `rotate(-90 ${x} ${y})`;
      }
    }
    const transform = typeof text.getAttribute === 'function' ? text.getAttribute('transform') : '';
    return stripAspectMatrixTransform(transform || '');
  };
  const applyHeatmapTextAspect = (reason) => {
    const svg = state.svg;
    if(!svg){ return; }
    const svgBox = state.svgBox || svg.closest?.('.svgbox') || null;
    const rendererAspectLocked = shouldHeatmapRendererPreserveAspect(svg.dataset?.heatmapModelType, svgBox);
    const svgRect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
    const viewBox = svg.viewBox?.baseVal;
    applyTextAspectCorrection({
      svg,
      svgBox,
      viewBoxWidth: viewBox?.width,
      viewBoxHeight: viewBox?.height,
      displayWidth: svgRect?.width,
      displayHeight: svgRect?.height,
      aspectLocked: rendererAspectLocked,
      debugLabel: reason || 'heatmap-text-resize',
      textScaleMode: HEATMAP_TEXT_SCALE_MODE
    });
  };
  const scheduleHeatmapResizeRefresh = (() => {
    const runRefresh = (options = {}) => {
      const nextReason = options?.reason || 'resize';
      const ownerTabId = String(options?.tabId || getHeatmapProjectionTabId() || '').trim() || null;
      if(state.isRendering){
        scheduleHeatmapResizeRefresh(nextReason, { tabId: ownerTabId });
        return;
      }
      const projectedTabId = String(getHeatmapProjectionTabId() || '').trim() || null;
      if(ownerTabId && projectedTabId && ownerTabId !== projectedTabId){
        debugLog('Debug: heatmap stale resize refresh discarded', {
          reason: nextReason,
          ownerTabId,
          projectedTabId
        });
        return;
      }
      const ownerSession = ownerTabId
        ? getHeatmapSession(ownerTabId, { tabId: ownerTabId, reason: nextReason }, { create: false })
        : getActiveHeatmapSessionForState();
      if(isHeatmapWorkspaceHidden()){
        debugLog('Debug: heatmap resize refresh skipped while hidden', { reason: nextReason, tabId: ownerTabId });
        return;
      }
      // Missing private render metrics require a normal owner-scoped redraw. Keep the
      // same scheduler contract as Scatter instead of creating a restore-only draw path.
      if(!state.textAspectMetrics && state.hot && state.svg){
        debugLog('Debug: heatmap resize refresh scheduling render-state rebuild', {
          reason: nextReason,
          tabId: ownerTabId
        });
        scheduleHeatmapDrawForSession(ownerSession, {
          tabId: ownerTabId || undefined,
          force: true,
          reason: `heatmap-render-state-refresh-${nextReason}`
        });
        return;
      }
      applyHeatmapTextAspect(`heatmap-resize-aspect-${nextReason}`);
      scheduleHeatmapDrawForSession(ownerSession, {
        tabId: ownerTabId || undefined,
        viewOnly: true,
        reason: nextReason
      });
    };
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(heatmap, 'heatmap', runRefresh, { reason: 'heatmap-resize-refresh' })
      : null;
    const schedule = (reason, options = {}) => {
      const request = {
        tabId: String(options?.tabId || getHeatmapProjectionTabId() || '').trim() || null,
        reason: reason || 'resize'
      };
      if(debounced){
        return debounced(request);
      }
      runRefresh(request);
      return null;
    };
    schedule.clear = tabId => debounced?.clear?.(tabId);
    return schedule;
  })();

  const ensureHeatmapTextResizeObserver = () => {
    if(typeof global.ResizeObserver !== 'function'){
      return;
    }
    const target = state.svgBox || state.svg?.closest?.('.svgbox') || null;
    if(!target){ return; }
    if(heatmapTextResizeObserver && heatmapTextResizeObserverTarget === target){
      return;
    }
    heatmapTextResizeObserver?.disconnect?.();
    const ownerTabId = String(state.svg?.dataset?.fontTabId || getHeatmapProjectionTabId() || '').trim() || null;
    heatmapTextResizeObserver = new global.ResizeObserver(() => {
      if(heatmapTextResizeObserverTarget !== target){ return; }
      const observeMutedUntil = Number(target.dataset?.heatmapResizeObserveMutedUntil) || 0;
      if(target.dataset?.heatmapResizeActive === 'true' || Date.now() <= observeMutedUntil){
        return;
      }
      scheduleHeatmapResizeRefresh('resize-observer', { tabId: ownerTabId });
    });
    heatmapTextResizeObserver.observe(target);
    heatmapTextResizeObserverTarget = target;
    debugLog('Debug: heatmap text resize observer attached', { tabId: ownerTabId });
  };

  function disconnectHeatmapProjectionObservers(ownerRoot = null){
    const shouldDisconnectFont = !ownerRoot || heatmapNodeBelongsToRoot(heatmapFontObserverTarget, ownerRoot);
    const shouldDisconnectResize = !ownerRoot || heatmapNodeBelongsToRoot(heatmapTextResizeObserverTarget, ownerRoot);
    if(shouldDisconnectFont){
      heatmapFontObserver?.disconnect?.();
      heatmapFontObserver = null;
      heatmapFontObserverTarget = null;
    }
    if(shouldDisconnectResize){
      heatmapTextResizeObserver?.disconnect?.();
      heatmapTextResizeObserver = null;
      heatmapTextResizeObserverTarget = null;
    }
  }

  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 6;
  let emptyPayloadTemplate = null;
  const heatmapUndoManager = Shared.undoManager || null;

  function seedHeatmapDefaultHeaderRow(matrix){
    if(!Array.isArray(matrix) || !Array.isArray(matrix[0])){
      return matrix;
    }
    const headerRow = matrix[0];
    if(headerRow.length > 0){
      headerRow[0] = 'Row labels';
    }
    const sampleCount = Math.min(Math.max(0, headerRow.length - 1), Math.max(0, DEFAULT_COLS - 1));
    for(let idx = 0; idx < sampleCount; idx += 1){
      headerRow[idx + 1] = `Sample ${idx + 1}`;
    }
    return matrix;
  }

  function ensureHeatmapDefaultHeaderRow(hotInstance){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function' || typeof hot.setDataAtCell !== 'function'){
      return false;
    }
    const data = hot.getData() || [];
    const headerRow = Array.isArray(data[0]) ? data[0] : [];
    const hasBodyData = data.slice(1).some(row => Array.isArray(row) && row.some(value => value != null && String(value).trim() !== ''));
    if(hasBodyData){
      return false;
    }
    const colCount = Math.max(0, typeof hot.countCols === 'function' ? hot.countCols() : headerRow.length);
    if(colCount <= 0){
      return false;
    }
    const changes = [];
    const firstHeader = headerRow[0] != null ? String(headerRow[0]).trim() : '';
    if(!firstHeader){
      changes.push([0, 0, 'Row labels']);
    }
    for(let col = 1; col < colCount; col += 1){
      const current = headerRow[col] != null ? String(headerRow[col]).trim() : '';
      if(!current){
        changes.push([0, col, `Sample ${col}`]);
      }
    }
    if(!changes.length){
      return false;
    }
    hot.setDataAtCell(changes, 'heatmap-default-header-seed');
    return true;
  }

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('heatmap cloneSimple error', err);
      return null;
    }
  }

  function stableHeatmapJson(value){
    if(value == null || typeof value !== 'object'){
      return JSON.stringify(value);
    }
    if(Array.isArray(value)){
      return `[${value.map(item => stableHeatmapJson(item)).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableHeatmapJson(value[key])}`).join(',')}}`;
  }

  function hashHeatmapSignature(value){
    const text = typeof value === 'string' ? value : stableHeatmapJson(value);
    let hash = 2166136261;
    for(let idx = 0; idx < text.length; idx += 1){
      hash ^= text.charCodeAt(idx);
      hash = Math.imul(hash, 16777619);
    }
    return `h${(hash >>> 0).toString(36)}`;
  }

  function createHeatmapSettingsSignature(settings){
    const source = settings && typeof settings === 'object' ? settings : {};
    return hashHeatmapSignature({
      view: source.view || null,
      decimals: source.decimals ?? null,
      correlationMethod: source.correlationMethod || null,
      useAbsolute: !!source.useAbsolute,
      maskLower: !!source.maskLower,
      showValues: !!source.showValues,
      showSignificance: !!source.showSignificance,
      significanceDisplay: source.significanceDisplay || null,
      significanceThreshold: source.significanceThreshold ?? null,
      cellSize: source.cellSize ?? null,
      fontSize: source.fontSize ?? null,
      palette: source.palette || null,
      valueScale: source.valueScale || null,
      legendHeightMode: source.legendHeightMode || null,
      filters: source.filters || null,
      adjust: source.adjust || null,
      clustering: source.clustering || null
    });
  }

  function createHeatmapDataSignatureFromProcessed(processed){
    const source = processed && typeof processed === 'object' ? processed : {};
    return hashHeatmapSignature({
      matrix: Array.isArray(source.matrix) ? source.matrix : [],
      rowLabels: Array.isArray(source.rowLabels) ? source.rowLabels : [],
      columnLabels: Array.isArray(source.columnLabels) ? source.columnLabels : []
    });
  }

  const HEATMAP_RENDER_MODEL_CACHE_VERSION = 2;

  function captureHeatmapRenderModelCache(session = null){
    const runtime = getHeatmapRenderRuntime(session || getActiveHeatmapSessionForState(), {
      seedFromActive: !session
    });
    if(!runtime?.lastRenderModel || !runtime.dataSignature || !runtime.settingsSignature){
      return null;
    }
    const model = cloneSimple(runtime.lastRenderModel);
    if(!model){
      return null;
    }
    return {
      version: HEATMAP_RENDER_MODEL_CACHE_VERSION,
      dataSignature: runtime.dataSignature,
      settingsSignature: runtime.settingsSignature,
      model,
      viewOptions: cloneSimple(runtime.lastViewOptions)
    };
  }

  function restoreHeatmapRenderModelCache(cache, session = null){
    const source = cache && typeof cache === 'object' ? cache : null;
    const valid = source?.version === HEATMAP_RENDER_MODEL_CACHE_VERSION
      && typeof source.dataSignature === 'string'
      && typeof source.settingsSignature === 'string'
      && source.model
      && typeof source.model === 'object';
    const model = valid
      ? cloneSimple(source.model)
      : null;
    updateHeatmapRenderRuntime(session || getActiveHeatmapSessionForState(), runtime => {
      runtime.lastRenderModel = model;
      runtime.lastViewOptions = model ? cloneSimple(source.viewOptions) : null;
      runtime.dataSignature = model ? source.dataSignature : null;
      runtime.settingsSignature = model ? source.settingsSignature : null;
    }, { seedFromActive: true });
    return !!model;
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate){
      return;
    }
    emptyPayloadTemplate = { type: 'heatmap', config: {} };
  }
  const NS = 'http://www.w3.org/2000/svg';
  const HEATMAP_RENDER_COMPLETE_ATTRIBUTE = 'data-heatmap-render-complete';
  const HEATMAP_RENDER_STATE_ATTRIBUTE = 'data-heatmap-render-state';
  const HEATMAP_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const HEATMAP_AUTO_DRAW_COL_THRESHOLD = 5000;
  const HEATMAP_AUTO_DRAW_CELL_THRESHOLD = 50000;
  const HEATMAP_DATA_VIEW_MAX = 12;
  const DEFAULT_HEATMAP_FONT_SIZE_PT = 12;
  const DEFAULT_HEATMAP_PALETTE = Object.freeze({
    negative: '#0000ff',
    zero: '#ffffff',
    positive: '#ff0000'
  });
  const DEFAULT_HEATMAP_VALUE_SCALE = Object.freeze({
    min: null,
    max: null
  });
  const DEFAULT_HEATMAP_LEGEND_HEIGHT_MODE = 'match-heatmap';
  const HEATMAP_FIXED_LEGEND_HEIGHT_RATIO = 0.3;
  const HEATMAP_FIXED_LEGEND_HEIGHT_MIN = 80;
  const HEATMAP_FIXED_LEGEND_HEIGHT_MAX = 200;
  const HEATMAP_TEXT_SCALE_MODE = 'preserve-fit';
  const HEATMAP_TRANSFORM_SCOPE_DEFAULT = Object.freeze({
    headerRows: 1,
    startCol: 0
  });
  const DEFAULT_DENDROGRAM_COLOR = '#3d3d3d';
  const DEFAULT_DENDROGRAM_THICKNESS = 1;
  const HEATMAP_MAX_LAYOUT_REFLOW_PASSES = 1;
  const HEATMAP_CANVAS_CELL_THRESHOLD = 12000;
  const HEATMAP_CANVAS_NODE_COST_THRESHOLD = 18000;
  const HEATMAP_CANVAS_MAX_DIMENSION = 4096;
  const HEATMAP_CANVAS_MAX_PIXELS = 8000000;
  const HEATMAP_CANVAS_MIN_AXIS_RESOLUTION = 2048;
  const HEATMAP_CANVAS_DPR_CAP = 2;
  const HEATMAP_PREVIEW_MAX_ROW_LABELS = 24;
  const HEATMAP_PREVIEW_MAX_COLUMN_LABELS = 24;
  const HEATMAP_PREVIEW_MAX_DENDROGRAM_SEGMENTS = 320;
  const HEATMAP_LIVE_MAX_ROW_LABELS = 160;
  const HEATMAP_LIVE_MAX_COLUMN_LABELS = 120;
  const HEATMAP_LIVE_ROW_LABEL_MIN_GAP_PX = 10;
  const HEATMAP_LIVE_COLUMN_LABEL_MIN_GAP_PX = 12;
  const HEATMAP_HEAVY_SCENE_MIN_WIDTH = 360;
  const HEATMAP_HEAVY_SCENE_MIN_HEIGHT = 300;
  const HEATMAP_HEAVY_SCENE_MAX_WIDTH = 4096;
  const HEATMAP_HEAVY_SCENE_MAX_HEIGHT = 4096;
  const HEATMAP_CLUSTER_WORKER = {
    url: 'js/workers/heatmap.worker.js',
    minItems: 60,
    minCells: 12000,
    timeoutMs: 20000
  };
  const HEATMAP_LOAD_SOURCE_DATA_VIEW_SWITCH = 'heatmap-data-view-switch';
  const HEATMAP_LOAD_SOURCE_CORRELATION_TAB_ACTIVATE = 'heatmap-correlation-tab-activate';
  const HEATMAP_LOAD_SOURCE_CORRELATION_SYNC = 'heatmap-correlation-view-sync';
  const HEATMAP_RUNTIME_KEY = `heatmap-runtime-${Math.random().toString(36).slice(2, 10)}`;

  function shouldSkipHeatmapDataViewSyncForLoadSource(source){
    return source === HEATMAP_LOAD_SOURCE_DATA_VIEW_SWITCH
      || source === HEATMAP_LOAD_SOURCE_CORRELATION_TAB_ACTIVATE
      || source === HEATMAP_LOAD_SOURCE_CORRELATION_SYNC;
  }

  let heatmapDataToolbarBound = false;
  const heatmapDataToolbarLastActivationByTabId = new Map();

  const state = {
    root: null,
    hot: null,
    scheduleDraw: () => {},
    fileHandle: null,
    fileName: 'correlation-heatmap.graph',
    titleText: 'Heatmap',
    svg: null,
    svgBox: null,
    statsEl: null,
    layout: null,
    minSvgWidth: 0,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null,
    performance: { loadData: null, draw: null, evaluation: null },
    lastViewOptions: null,
    lastStats: null,
    statsPanelModel: { resultsModel: null, reportModel: null },
    logPlusOne: false,
    isRendering: false,
    drawToken: 0,
    suspendControlSchedule: false,
    suspendDataViewMaterialization: false,
    activeMaterializedViewId: null,
    textAspectMetrics: null,
    emptyPlotNoticeEl: null,
    dendrogramSettings: {
      thickness: DEFAULT_DENDROGRAM_THICKNESS,
      color: DEFAULT_DENDROGRAM_COLOR
    },
    labelPositions: { title: null },
    palette: { ...DEFAULT_HEATMAP_PALETTE },
    valueScale: { ...DEFAULT_HEATMAP_VALUE_SCALE },
    lastResolvedValueScale: null,
    legendHeightMode: DEFAULT_HEATMAP_LEGEND_HEIGHT_MODE,
    clusterControlsTouched: false,
    clusterDefaultsAutoApplied: false,
    suppressClusterTouchTracking: false,
    suspendAutoClusterDefaults: false
  };

  function resolveHeatmapRoot(tabLike){
    return Shared.workspaceTabs?.resolveComponentRoot?.({
      tabLike: tabLike || null,
      componentKey: 'heatmap',
      currentRoot: state.root,
      staticRootId: 'heatmapPage'
    }) || null;
  }

  function queryHeatmapRoot(selector, tabLike){
    const root = resolveHeatmapRoot(tabLike);
    if(!root || !selector){
      return null;
    }
    return root.querySelector?.(selector) || null;
  }

  function getHeatmapNodeById(id, tabLike){
    if(!id){
      return null;
    }
    const root = resolveHeatmapRoot(tabLike);
    if(root?.getElementById){
      const byId = root.getElementById(id);
      if(byId){
        return byId;
      }
    }
    return root?.querySelector?.(`#${id}`) || null;
  }

  function resolveHeatmapDrawableFrame(targetEl){
    const target = targetEl || state.svg || getHeatmapNodeById('heatmapSvg');
    const svgBox = state.svgBox
      || state.layout?.elements?.svgBox
      || target?.closest?.('.svgbox')
      || queryHeatmapRoot('#heatmapGraphPanel .svgbox')
      || null;
    const frame = Shared.componentLayout?.resolveDrawableFrame?.({
      componentName: 'heatmap',
      plot: target,
      svgBox,
      graphPanel: state.layout?.elements?.graphPanel || queryHeatmapRoot('#heatmapGraphPanel')
    });
    if(frame){
      return frame;
    }
    return {
      width: Math.max(0, Number(target?.clientWidth) || 0),
      height: Math.max(0, Number(target?.clientHeight) || 0),
      rawWidth: Math.max(0, Number(target?.clientWidth) || 0),
      rawHeight: Math.max(0, Number(target?.clientHeight) || 0),
      constrained: false,
      source: 'plot-fallback',
      authority: 'plot-fallback',
      svgBox,
      viewport: null,
      zoomScale: 1
    };
  }

  function createDefaultHeatmapTabContext(){
    const controls = normalizeHeatmapControlState();
    return {
      fileHandle: null,
      fileName: 'correlation-heatmap.graph',
      titleText: 'Heatmap',
      logPlusOne: false,
      activeMaterializedViewId: null,
      controls,
      dendrogramSettings: {
        thickness: DEFAULT_DENDROGRAM_THICKNESS,
        color: DEFAULT_DENDROGRAM_COLOR
      },
      labelPositions: { title: null },
      palette: { ...DEFAULT_HEATMAP_PALETTE },
      valueScale: { ...DEFAULT_HEATMAP_VALUE_SCALE },
      legendHeightMode: DEFAULT_HEATMAP_LEGEND_HEIGHT_MODE,
      clusterControlsTouched: false,
      clusterDefaultsAutoApplied: false,
      suppressClusterTouchTracking: false,
      suspendAutoClusterDefaults: false,
      lastDataShape: { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: null,
      performance: { loadData: null, draw: null, evaluation: null },
      drawPending: false,
      notes: {
        text: '',
        open: false
      }
    };
  }

  function captureHeatmapNotesSnapshot(session = null){
    return getHeatmapNotesState(session || getActiveHeatmapSessionForState(), { syncFromControl: true });
  }

  function buildHeatmapTabContextSnapshotFromState(session = null){
    const defaults = createDefaultHeatmapTabContext();
    const owner = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const ownerState = owner?.state || null;
    const clusterState = getHeatmapClusterState(owner);
    return {
      fileHandle: state.fileHandle || null,
      fileName: typeof state.fileName === 'string' && state.fileName.trim()
        ? state.fileName.trim()
        : defaults.fileName,
      titleText: state.titleText != null ? String(state.titleText) : defaults.titleText,
      logPlusOne: !!state.logPlusOne,
      activeMaterializedViewId: ownerState?.activeMaterializedViewId == null
        ? (state.activeMaterializedViewId == null ? null : String(state.activeMaterializedViewId))
        : String(ownerState.activeMaterializedViewId),
      controls: syncHeatmapControlStateToSession(owner, captureHeatmapControlStateFromDom()),
      dendrogramSettings: getHeatmapDendrogramSettings(owner),
      labelPositions: cloneSimple(state.labelPositions || defaults.labelPositions) || { ...defaults.labelPositions },
      palette: normalizeHeatmapPalette(state.palette),
      valueScale: normalizeHeatmapValueScale(state.valueScale),
      legendHeightMode: normalizeHeatmapLegendHeightMode(state.legendHeightMode),
      clusterControlsTouched: !!clusterState.clusterControlsTouched,
      clusterDefaultsAutoApplied: !!clusterState.clusterDefaultsAutoApplied,
      suppressClusterTouchTracking: !!clusterState.suppressClusterTouchTracking,
      suspendAutoClusterDefaults: !!clusterState.suspendAutoClusterDefaults,
      lastDataShape: cloneSimple(state.lastDataShape) || { ...defaults.lastDataShape },
      lastAutoDrawEvaluation: cloneSimple(state.lastAutoDrawEvaluation),
      lastStats: cloneSimple(state.lastStats),
      statsPanelModel: captureHeatmapStatsPanelModel(null, owner),
      performance: cloneSimple(state.performance) || { ...defaults.performance },
      notes: captureHeatmapNotesSnapshot(owner)
    };
  }

  function applyHeatmapTabContextSnapshot(context, options = {}){
    const defaults = createDefaultHeatmapTabContext();
    const source = context && typeof context === 'object' ? context : defaults;
    const ownerSession = getHeatmapProjectionSession({ reason: 'heatmap-apply-tab-context' })
      || getActiveHeatmapSessionForState();
    state.fileHandle = source.fileHandle || null;
    setHeatmapFileName(source.fileName, {
      session: ownerSession,
      force: true,
      skipExportRefresh: options.skipExportRefresh === true
    });
    state.titleText = source.titleText != null ? String(source.titleText) : defaults.titleText;
    state.logPlusOne = !!source.logPlusOne;
    setHeatmapActiveMaterializedViewId(
      source.activeMaterializedViewId == null ? null : String(source.activeMaterializedViewId),
      ownerSession
    );
    if(options.syncUi !== false){
      applyHeatmapControlStateToDom(source.controls || defaults.controls);
    }else{
      syncHeatmapControlStateToSession(ownerSession, source.controls || defaults.controls);
      state.logPlusOne = !!normalizeHeatmapControlState(source.controls || defaults.controls).adjust.logPlusOne;
    }
    state.dendrogramSettings = updateHeatmapDendrogramSettings(source.dendrogramSettings || defaults.dendrogramSettings, ownerSession);
    state.labelPositions = cloneSimple(source.labelPositions) || { ...defaults.labelPositions };
    state.palette = normalizeHeatmapPalette(source.palette);
    state.valueScale = normalizeHeatmapValueScale(source.valueScale);
    state.legendHeightMode = normalizeHeatmapLegendHeightMode(source.legendHeightMode);
    state.lastResolvedValueScale = null;
    updateHeatmapRenderRuntime(ownerSession, runtime => {
      runtime.lastResolvedValueScale = null;
    }, { seedFromActive: true });
    updateHeatmapClusterState({
      clusterControlsTouched: !!source.clusterControlsTouched,
      clusterDefaultsAutoApplied: !!source.clusterDefaultsAutoApplied,
      suppressClusterTouchTracking: !!source.suppressClusterTouchTracking,
      suspendAutoClusterDefaults: !!source.suspendAutoClusterDefaults
    }, ownerSession);
    state.lastDataShape = cloneSimple(source.lastDataShape) || { ...defaults.lastDataShape };
    state.lastAutoDrawEvaluation = cloneSimple(source.lastAutoDrawEvaluation) || null;
    state.lastStats = cloneSimple(source.lastStats) || null;
    state.statsPanelModel = normalizeHeatmapStatsPanelModel(source.statsPanelModel || {});
    state.performance = cloneSimple(source.performance) || { ...defaults.performance };
    if(options.syncUi !== false){
      if(state.lastStats){
        updateStats(state.lastStats);
      }else{
        restoreHeatmapStatsPanelModel(state.statsPanelModel, ownerSession);
      }
    }
    syncHeatmapNotesStateToSession(ownerSession, source.notes || defaults.notes);
    if(options.syncUi !== false){
      syncHeatmapPaletteInputs(ownerSession?.root || resolveHeatmapRoot(ownerSession?.tabId || null));
      applyHeatmapNotesStateToControl(ownerSession);
    }
  }

  const heatmapSessionsByTabId = new Map();
  // Transient visible-DOM projection bridge. Durable state belongs to the owner session map.
  let projectedHeatmapSession = null;

  // Compatibility bridge: visible-DOM projection tab id. Delete after every projection entrypoint receives explicit owner tab metadata.
  function getHeatmapProjectionTabId(){
    return Shared.componentLifecycle?.resolveProjectionTabId?.(heatmap, projectedHeatmapSession) || String(heatmap.__boundTabId || projectedHeatmapSession?.tabId || '').trim();
  }

  function getHeatmapProjectionSession(meta = {}, options = {}){
    const tabId = getHeatmapProjectionTabId();
    if(!tabId){ return null; }
    return getHeatmapSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'heatmap-projection-session' }, { create: options.create !== false });
  }

  function createDefaultHeatmapRefs(root = null){
    return {
      root: root || null,
      svg: null,
      svgBox: null,
      statsEl: null,
      emptyPlotNoticeEl: null,
      controls: null,
      notesControl: null
    };
  }

  function createDefaultHeatmapResultsState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      stats: cloneSimple(src.stats ?? src.lastStats ?? null) || null,
      statsPanelModel: normalizeHeatmapStatsPanelModel(src.statsPanelModel || {})
    };
  }

  function createDefaultHeatmapRenderRuntime(source = {}, options = {}){
    const src = source && typeof source === 'object' ? source : {};
    const lastRenderModel = options.retainModel === true
      ? (src.lastRenderModel || null)
      : (cloneSimple(src.lastRenderModel || null) || null);
    return {
      // Live owner-runtime normalization may retain the immutable model reference. New
      // sessions and restored records clone it so no mutable cache object can cross tabs.
      lastRenderModel,
      lastViewOptions: cloneSimple(src.lastViewOptions || null) || null,
      textAspectMetrics: cloneSimple(src.textAspectMetrics || null) || null,
      labelProjection: cloneSimple(src.labelProjection || null) || null,
      lastResolvedValueScale: cloneSimple(src.lastResolvedValueScale || null) || null,
      lastDataShape: cloneSimple(src.lastDataShape || null) || { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: cloneSimple(src.lastAutoDrawEvaluation || null) || null,
      dataSignature: typeof src.dataSignature === 'string' ? src.dataSignature : null,
      settingsSignature: typeof src.settingsSignature === 'string' ? src.settingsSignature : null,
      updatedAt: Date.now()
    };
  }

  function ensureHeatmapRenderRuntimeShape(runtime){
    if(!runtime || typeof runtime !== 'object'){
      return createDefaultHeatmapRenderRuntime();
    }
    if(!Object.prototype.hasOwnProperty.call(runtime, 'lastRenderModel')){ runtime.lastRenderModel = null; }
    if(!Object.prototype.hasOwnProperty.call(runtime, 'lastViewOptions')){ runtime.lastViewOptions = null; }
    if(!Object.prototype.hasOwnProperty.call(runtime, 'textAspectMetrics')){ runtime.textAspectMetrics = null; }
    if(!Object.prototype.hasOwnProperty.call(runtime, 'labelProjection')){ runtime.labelProjection = null; }
    if(!Object.prototype.hasOwnProperty.call(runtime, 'lastResolvedValueScale')){ runtime.lastResolvedValueScale = null; }
    if(!runtime.lastDataShape || typeof runtime.lastDataShape !== 'object'){
      runtime.lastDataShape = { rows: 0, cols: 0 };
    }
    if(!Object.prototype.hasOwnProperty.call(runtime, 'lastAutoDrawEvaluation')){ runtime.lastAutoDrawEvaluation = null; }
    runtime.dataSignature = typeof runtime.dataSignature === 'string' ? runtime.dataSignature : null;
    runtime.settingsSignature = typeof runtime.settingsSignature === 'string' ? runtime.settingsSignature : null;
    runtime.updatedAt = Number.isFinite(Number(runtime.updatedAt)) ? Number(runtime.updatedAt) : Date.now();
    return runtime;
  }

  function createDefaultHeatmapDrawRuntime(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const rawToken = Number(src.token ?? src.drawToken);
    return {
      token: Number.isFinite(rawToken) && rawToken >= 0 ? rawToken : 0,
      pendingDrawOptions: sanitizeHeatmapDrawOptions(src.pendingDrawOptions || src.pendingOptions || null),
      deferredHiddenDrawOptions: sanitizeHeatmapDrawOptions(src.deferredHiddenDrawOptions || null),
      hiddenDrawFlushHandle: null,
      updatedAt: Date.now()
    };
  }

  function normalizeHeatmapSessionTabId(tabLike = null, meta = {}){
    const direct = typeof tabLike === 'string' || typeof tabLike === 'number' ? tabLike : null;
    const objectTabId = tabLike && typeof tabLike === 'object' ? (tabLike.id || tabLike.tabId || tabLike.workspaceTabId || null) : null;
    const resolved = direct
      || objectTabId
      || meta?.tabId
      || meta?.workspaceTabId
      || meta?.tab?.id
      || meta?.__workspaceSessionMeta?.tabId
      || resolveHeatmapAsyncTabId(meta || {}, state.hot)
      || getHeatmapProjectionTabId()
      || '';
    return String(resolved || '').trim();
  }

  function createHeatmapSession({ tabId, root = null, initialState = null } = {}){
    const normalizedTabId = String(tabId || '').trim();
    const durableState = initialState && typeof initialState === 'object'
      ? { ...createDefaultHeatmapTabContext(), ...(cloneSimple(initialState) || initialState) }
      : createDefaultHeatmapTabContext();
    durableState.controls = normalizeHeatmapControlState(durableState.controls || durableState.config || {});
    durableState.logPlusOne = !!durableState.controls.adjust.logPlusOne;
    durableState.lastStats = cloneSimple(durableState.lastStats || null) || null;
    durableState.statsPanelModel = normalizeHeatmapStatsPanelModel(durableState.statsPanelModel || {});
    durableState.notes = normalizeHeatmapNotesState(durableState.notes || {});
    durableState.dendrogramSettings = {
      thickness: Math.max(0.25, Number(durableState.dendrogramSettings?.thickness) || DEFAULT_DENDROGRAM_THICKNESS),
      color: typeof durableState.dendrogramSettings?.color === 'string' && durableState.dendrogramSettings.color.trim()
        ? durableState.dendrogramSettings.color.trim()
        : DEFAULT_DENDROGRAM_COLOR
    };
    return {
      componentKey: 'heatmap',
      tabId: normalizedTabId,
      root: root || null,
      state: durableState,
      refs: createDefaultHeatmapRefs(root || null),
      cache: {
        renderRuntime: createDefaultHeatmapRenderRuntime(initialState?.renderState || initialState || {})
      },
      listeners: new Map(),
      timers: {
        drawRuntime: createDefaultHeatmapDrawRuntime()
      },
      workers: new Map(),
      managers: {
        hot: null,
        dataViews: null,
        layout: null
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      results: createDefaultHeatmapResultsState(initialState || {})
    };
  }

  function ensureHeatmapSessionOwnershipShape(session){
    if(!session || typeof session !== 'object'){
      return null;
    }
    session.componentKey = 'heatmap';
    session.tabId = String(session.tabId || '').trim();
    session.root = session.root || null;
    if(!session.state || typeof session.state !== 'object'){
      session.state = createDefaultHeatmapTabContext();
    }else{
      const defaults = createDefaultHeatmapTabContext();
      Object.keys(defaults).forEach(key => {
        if(!Object.prototype.hasOwnProperty.call(session.state, key)){
          session.state[key] = defaults[key];
        }
      });
    }
    session.state.controls = normalizeHeatmapControlState(session.state.controls || session.state.config || {});
    session.state.logPlusOne = !!session.state.controls.adjust.logPlusOne;
    session.state.statsPanelModel = normalizeHeatmapStatsPanelModel(session.state.statsPanelModel || {});
    session.state.notes = normalizeHeatmapNotesState(session.state.notes || {});
    session.state.dendrogramSettings = {
      thickness: Math.max(0.25, Number(session.state.dendrogramSettings?.thickness) || DEFAULT_DENDROGRAM_THICKNESS),
      color: typeof session.state.dendrogramSettings?.color === 'string' && session.state.dendrogramSettings.color.trim()
        ? session.state.dendrogramSettings.color.trim()
        : DEFAULT_DENDROGRAM_COLOR
    };
    session.state.clusterControlsTouched = !!session.state.clusterControlsTouched;
    session.state.clusterDefaultsAutoApplied = !!session.state.clusterDefaultsAutoApplied;
    session.state.suppressClusterTouchTracking = !!session.state.suppressClusterTouchTracking;
    session.state.suspendAutoClusterDefaults = !!session.state.suspendAutoClusterDefaults;
    session.refs = session.refs && typeof session.refs === 'object' ? session.refs : createDefaultHeatmapRefs(session.root || null);
    session.refs.root = session.refs.root || session.root || null;
    session.refs.controls = session.refs.controls && typeof session.refs.controls === 'object' ? session.refs.controls : null;
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    session.cache.renderRuntime = ensureHeatmapRenderRuntimeShape(session.cache.renderRuntime);
    session.listeners = session.listeners instanceof Map ? session.listeners : new Map();
    session.timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    session.timers.drawRuntime = createDefaultHeatmapDrawRuntime(session.timers.drawRuntime || {});
    session.workers = session.workers instanceof Map ? session.workers : new Map();
    session.managers = session.managers && typeof session.managers === 'object' ? session.managers : {};
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'hot')){ session.managers.hot = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'dataViews')){ session.managers.dataViews = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'layout')){ session.managers.layout = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'fileHandle')){ session.managers.fileHandle = null; }
    session.results = createDefaultHeatmapResultsState(session.results || {
      stats: session.state.lastStats,
      statsPanelModel: session.state.statsPanelModel
    });
    session.updatedAt = Number.isFinite(Number(session.updatedAt)) ? Number(session.updatedAt) : Date.now();
    return session;
  }

  function isHeatmapSessionActiveForModuleState(session){
    if(!session || typeof session !== 'object'){
      return false;
    }
    const tabId = String(session.tabId || '').trim();
    if(!tabId){ return false; }
    // Module-level mirrors describe the currently projected Heatmap DOM, not whichever
    // workspace tab has just become active. During a same-component switch those owners
    // differ briefly; treating both as active is the direct path to cross-tab leakage.
    const projectedTabId = String(getHeatmapProjectionTabId() || '').trim();
    if(projectedTabId){
      return projectedTabId === tabId;
    }
    const workspaceActiveTabId = getHeatmapWorkspaceActiveTabId();
    return !!workspaceActiveTabId && workspaceActiveTabId === tabId;
  }

  function isHeatmapSessionProjectedForModuleState(session){
    if(!session || typeof session !== 'object'){
      return false;
    }
    const tabId = String(session.tabId || '').trim();
    if(!tabId){
      return false;
    }
    if(String(getHeatmapProjectionTabId() || '').trim() === tabId){
      return true;
    }
    const ownerRoot = session.root
      || Shared.workspaceTabs?.getMountedRoot?.(tabId, 'heatmap')
      || null;
    if(!ownerRoot || state.root !== ownerRoot){
      return false;
    }
    const ownerSvg = heatmapNodeBelongsToRoot(session.refs?.svg, ownerRoot)
      ? session.refs.svg
      : ownerRoot.querySelector?.('#heatmapSvg') || null;
    return !!ownerSvg && ownerSvg === state.svg;
  }

  function getHeatmapSession(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeHeatmapSessionTabId(tabLike, meta);
    if(!tabId){
      return options.fallbackActive === true ? ensureHeatmapSessionOwnershipShape(projectedHeatmapSession) : null;
    }
    let session = heatmapSessionsByTabId.get(tabId) || null;
    if(!session && options.create === true){
      session = createHeatmapSession({
        tabId,
        root: resolveHeatmapRoot(tabLike || tabId || null) || (String(getHeatmapProjectionTabId() || '') === tabId ? state.root : null),
        initialState: options.initialState || null
      });
      heatmapSessionsByTabId.set(tabId, session);
    }
    return ensureHeatmapSessionOwnershipShape(session);
  }

  function getHeatmapWorkspaceActiveTabId(){
    return String(Shared.componentLifecycle?.resolveWorkspaceActiveTabId?.('heatmap') || '').trim();
  }

  function getActiveHeatmapSessionForState(){
    // Global Heatmap state is only a projection of one owner session. Prefer that exact
    // owner until activation explicitly rebinds the projection; workspace selection can
    // change earlier than the DOM and must never redirect module-state reads by itself.
    const projectedTabId = getHeatmapProjectionTabId();
    if(projectedTabId){
      return getHeatmapSession(projectedTabId, {
        tabId: projectedTabId,
        reason: 'active-heatmap-session-projection'
      }, { create: true });
    }
    if(projectedHeatmapSession){
      return ensureHeatmapSessionOwnershipShape(projectedHeatmapSession);
    }
    const workspaceActiveTabId = getHeatmapWorkspaceActiveTabId();
    return workspaceActiveTabId
      ? getHeatmapSession(workspaceActiveTabId, {
          tabId: workspaceActiveTabId,
          reason: 'active-heatmap-session-workspace-fallback'
        }, { create: true })
      : null;
  }

  function scheduleHeatmapDrawForSession(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(!shaped){
      return false;
    }
    if(Shared.hot?.shouldDeferOwnerProjectionDraw?.(shaped, options)){
      return false;
    }
    const sourceOptions = normalizeDrawOptions(options || {});
    const scheduleOptions = sanitizeHeatmapDrawOptions({
      ...sourceOptions,
      tabId: shaped.tabId || sourceOptions.tabId || undefined,
      reason: sourceOptions.reason || 'heatmap-session-draw'
    });
    if(!isHeatmapSessionActiveForModuleState(shaped)){
      updateHeatmapDrawRuntime(shaped, runtime => {
        runtime.pendingDrawOptions = sanitizeHeatmapDrawOptions(scheduleOptions);
      }, { mirrorActive: false });
      shaped.state.drawPending = true;
      shaped.updatedAt = Date.now();
      return false;
    }
    if(typeof state.scheduleDraw !== 'function'){
      return false;
    }
    shaped.state.drawPending = false;
    shaped.updatedAt = Date.now();
    state.scheduleDraw(sanitizeHeatmapDrawOptions(scheduleOptions));
    return true;
  }

  function scheduleActiveHeatmapDraw(options = {}){
    return scheduleHeatmapDrawForSession(getActiveHeatmapSessionForState(), options);
  }

  function normalizeHeatmapLabelPositions(value){
    return cloneSimple(value) || { title: null };
  }

  function patchHeatmapVisualState(session = null, patch = {}, meta = {}){
    const owner = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const hasTitle = Object.prototype.hasOwnProperty.call(patch || {}, 'titleText');
    const hasPositions = Object.prototype.hasOwnProperty.call(patch || {}, 'labelPositions');
    const nextTitle = hasTitle ? String(patch.titleText == null ? '' : patch.titleText) : state.titleText;
    const nextPositions = hasPositions ? normalizeHeatmapLabelPositions(patch.labelPositions) : normalizeHeatmapLabelPositions(state.labelPositions);
    if(owner?.state){
      if(hasTitle){ owner.state.titleText = nextTitle; }
      if(hasPositions){ owner.state.labelPositions = nextPositions; }
      owner.updatedAt = Date.now();
      debugLog('Debug: heatmap visual state patched to owner session', {
        tabId: owner.tabId || null,
        reason: meta?.reason || null,
        title: hasTitle,
        labelPositions: hasPositions
      });
    }
    if(!owner || isHeatmapSessionActiveForModuleState(owner)){
      if(hasTitle){ state.titleText = nextTitle; }
      if(hasPositions){ state.labelPositions = nextPositions; }
    }
    return { titleText: nextTitle, labelPositions: nextPositions };
  }

  function patchHeatmapLabelPosition(session = null, key, value, meta = {}){
    const nextPositions = normalizeHeatmapLabelPositions({
      ...normalizeHeatmapLabelPositions(state.labelPositions),
      [key]: value || null
    });
    return patchHeatmapVisualState(session, { labelPositions: nextPositions }, meta);
  }

  function bindHeatmapSessionForTab(tabLike = null, meta = {}){
    const tabId = normalizeHeatmapSessionTabId(tabLike, meta);
    if(!tabId){
      return null;
    }
    if(projectedHeatmapSession && projectedHeatmapSession.tabId && projectedHeatmapSession.tabId !== tabId){
      captureHeatmapSessionStateFromActive(projectedHeatmapSession, {
        ...(meta || {}),
        allowProjectedOwnerCapture: true,
        reason: meta?.reason || 'heatmap-session-switch-capture'
      });
    }
    const session = getHeatmapSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'heatmap-session-bind' }, { create: true });
    if(!session){ return null; }
    projectedHeatmapSession = session;
    heatmap.__heatmapSessionTabId = session.tabId;
    const workspaceActiveTabId = getHeatmapWorkspaceActiveTabId();
    const sessionIsActiveOwner = !workspaceActiveTabId || workspaceActiveTabId === session.tabId;
    if(!heatmap.__boundTabId || sessionIsActiveOwner){
      heatmap.__boundTabId = session.tabId;
    }
    const resolvedRoot = resolveHeatmapRoot(tabLike || tabId || null) || session.root || (sessionIsActiveOwner ? state.root : null) || null;
    session.root = resolvedRoot || session.root || null;
    if(sessionIsActiveOwner){
      // Session binding establishes ownership only. DOM projection is a separate lifecycle
      // step and must run after the target root, controls, table, and layout are ready.
      // Keeping projection out of this resolver prevents recursive/partial initialization
      // when workspace hooks and component.init() both bind the same owner.
      syncHeatmapDrawRuntimeMirror(session.timers.drawRuntime, session);
      syncHeatmapRenderRuntimeMirror(session.cache.renderRuntime, session);
      syncHeatmapResultsMirror(session.results, session);
    }
    session.updatedAt = Date.now();
    return session;
  }

  function syncHeatmapSessionRefsFromActive(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || projectedHeatmapSession);
    if(!shaped){ return null; }
    if(shaped.tabId && !isHeatmapSessionActiveForModuleState(shaped)){
      return shaped;
    }
    const activeRoot = state.root || null;
    if(shaped.root && activeRoot && shaped.root !== activeRoot){
      debugLog('Debug: heatmap session ref capture skipped for mismatched root', {
        tabId: shaped.tabId || null,
        reason: 'owner-root-mismatch'
      });
      return shaped;
    }
    shaped.root = activeRoot || shaped.root || null;
    shaped.refs.root = shaped.root || null;
    shaped.refs.svg = heatmapNodeBelongsToRoot(state.svg, shaped.root) ? state.svg : null;
    shaped.refs.svgBox = heatmapNodeBelongsToRoot(state.svgBox, shaped.root) ? state.svgBox : null;
    shaped.refs.statsEl = heatmapNodeBelongsToRoot(state.statsEl, shaped.root) ? state.statsEl : null;
    shaped.refs.emptyPlotNoticeEl = heatmapNodeBelongsToRoot(state.emptyPlotNoticeEl, shaped.root)
      ? state.emptyPlotNoticeEl
      : null;
    shaped.refs.controls = resolveHeatmapControlRefs(shaped.root, refs);
    shaped.refs.notesControl = heatmapNodeBelongsToRoot(notesState.control, shaped.root)
      ? notesState.control
      : null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function getHeatmapHotOwnerTabId(hotInstance){
    return String(Shared.componentLifecycle?.resolveOwnedObjectTabId?.(hotInstance, 'heatmap') || '').trim();
  }

  function getHeatmapTabIdFromTarget(target = null){
    return String(Shared.componentLifecycle?.resolveTabIdFromTarget?.(target) || '').trim();
  }

  function getHeatmapActiveTabId(){
    return String(Shared.componentLifecycle?.resolveActiveComponentTabId?.('heatmap', heatmap, projectedHeatmapSession) || '').trim();
  }

  function getHeatmapCallbackOwner(meta = {}){
    const target = meta?.target || meta?.event?.currentTarget || meta?.event?.target || null;
    const tabId = String(meta?.tabId || getHeatmapHotOwnerTabId(meta?.hot) || getHeatmapTabIdFromTarget(target) || getHeatmapActiveTabId() || '').trim();
    return {
      tabId,
      session: tabId
        ? getHeatmapSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'heatmap-callback-owner' }, { create: true })
        : getActiveHeatmapSessionForState(),
      hot: meta?.hot || null
    };
  }

  function isHeatmapCallbackOwnerActive(owner = null){
    const ownerTabId = String(owner?.tabId || owner?.session?.tabId || '').trim();
    const activeTabId = getHeatmapActiveTabId();
    return !!(!ownerTabId || (activeTabId && ownerTabId === activeTabId));
  }

  function runHeatmapOwnedCallback(owner, callback, meta = {}){
    if(typeof callback !== 'function'){
      return undefined;
    }
    const resolvedOwner = owner?.session || owner?.tabId
      ? owner
      : getHeatmapCallbackOwner(meta);
    if(!isHeatmapCallbackOwnerActive(resolvedOwner)){
      debugLog('Debug: heatmap callback skipped for inactive owner', {
        ownerTabId: resolvedOwner?.tabId || resolvedOwner?.session?.tabId || null,
        activeTabId: getHeatmapActiveTabId() || null,
        reason: meta?.reason || 'heatmap-owned-callback'
      });
      return undefined;
    }
    return callback(resolvedOwner);
  }

  function runHeatmapEventOwnerCallback(event, reason, callback){
    const owner = getHeatmapCallbackOwner({ event, target: event?.currentTarget || event?.target || null, reason });
    return runHeatmapOwnedCallback(owner, callback, { event, reason });
  }

  function getHeatmapSessionForHot(hotInstance = null, meta = {}, options = {}){
    const tabId = getHeatmapHotOwnerTabId(hotInstance);
    if(tabId){
      return getHeatmapSession(tabId, { ...(meta || {}), tabId }, { create: options.create === true });
    }
    return options.fallbackActive === false ? null : getActiveHeatmapSessionForState();
  }

  function getHeatmapSessionForDrawOptions(options = {}, meta = {}){
    const source = options && typeof options === 'object' ? options : {};
    if(source.session && typeof source.session === 'object'){
      return ensureHeatmapSessionOwnershipShape(source.session);
    }
    const tabId = String(source.tabId || meta?.tabId || '').trim();
    if(tabId){
      return getHeatmapSession(tabId, { ...(meta || {}), ...(source || {}), tabId }, { create: false });
    }
    const hotSession = getHeatmapSessionForHot(source.hot || source.hotInstance || meta?.hot || meta?.hotInstance || null, meta || {}, { create: false, fallbackActive: false });
    if(hotSession){
      return hotSession;
    }
    return meta?.fallbackActive === false ? null : getActiveHeatmapSessionForState();
  }

  const heatmapHotBelongsToSession = (hotInstance, session = null) => (
    Shared.componentLifecycle?.ownedHotBelongsToSession?.(hotInstance, session, 'heatmap', {
      ensureSession: ownerSession => ensureHeatmapSessionOwnershipShape(ownerSession || projectedHeatmapSession || getActiveHeatmapSessionForState())
    }) === true
  );

  const heatmapDataViewsManagerBelongsToSession = (manager = null, session = null) => (
    Shared.componentLifecycle?.ownedDataViewsManagerBelongsToSession?.(manager, session, 'heatmap', {
      ensureSession: ownerSession => ensureHeatmapSessionOwnershipShape(ownerSession || projectedHeatmapSession || getActiveHeatmapSessionForState())
    }) === true
  );

  function syncHeatmapSessionManagersFromActive(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || projectedHeatmapSession);
    if(!shaped){ return null; }
    const hotBelongsToSession = heatmapHotBelongsToSession(state.hot, shaped);
    if(hotBelongsToSession){
      const manager = state.hot?.__heatmapDataViewsManager || null;
      shaped.managers.hot = state.hot;
      shaped.managers.dataViews = heatmapDataViewsManagerBelongsToSession(manager, shaped) ? manager : shaped.managers.dataViews || null;
    }
    if(!shaped.managers.hot || !heatmapHotBelongsToSession(shaped.managers.hot, shaped)){
      shaped.managers.hot = null;
      shaped.managers.dataViews = null;
    }
    if(isHeatmapSessionActiveForModuleState(shaped)){
      shaped.managers.layout = state.layout || shaped.managers.layout || null;
    }
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function syncHeatmapDrawRuntimeMirror(runtime, session = null){
    if(!runtime){
      return null;
    }
    const shouldMirror = !session || session === getActiveHeatmapSessionForState() || isHeatmapSessionActiveForModuleState(session);
    if(shouldMirror){
      state.drawToken = Number(runtime.token) || 0;
      hiddenDrawFlushHandle = runtime.hiddenDrawFlushHandle || null;
    }
    return runtime;
  }

  function getHeatmapDrawRuntime(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(shaped?.timers){
      if(options.seedFromActive === true){
        shaped.timers.drawRuntime = createDefaultHeatmapDrawRuntime({
          token: state.drawToken,
          pendingDrawOptions: shaped.timers.drawRuntime?.pendingDrawOptions || {},
          deferredHiddenDrawOptions: shaped.timers.drawRuntime?.deferredHiddenDrawOptions || null,
          hiddenDrawFlushHandle
        });
      }else{
        shaped.timers.drawRuntime = createDefaultHeatmapDrawRuntime(shaped.timers.drawRuntime || {});
      }
      return syncHeatmapDrawRuntimeMirror(shaped.timers.drawRuntime, shaped);
    }
    return syncHeatmapDrawRuntimeMirror(createDefaultHeatmapDrawRuntime({
      token: state.drawToken,
      pendingDrawOptions: {},
      deferredHiddenDrawOptions: null,
      hiddenDrawFlushHandle
    }), null);
  }

  function updateHeatmapDrawRuntime(session = null, mutator = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const runtime = getHeatmapDrawRuntime(shaped, { seedFromActive: options.seedFromActive === true });
    if(typeof mutator === 'function'){
      mutator(runtime);
    }
    runtime.updatedAt = Date.now();
    if(shaped){
      shaped.timers.drawRuntime = runtime;
      shaped.updatedAt = Date.now();
    }
    return syncHeatmapDrawRuntimeMirror(runtime, shaped);
  }

  function syncHeatmapRenderRuntimeMirror(runtime, session = null){
    if(!runtime){
      return null;
    }
    const shouldMirror = !session || session === getActiveHeatmapSessionForState() || isHeatmapSessionActiveForModuleState(session);
    if(shouldMirror){
      state.lastViewOptions = runtime.lastViewOptions || null;
      state.textAspectMetrics = runtime.textAspectMetrics || null;
      state.lastResolvedValueScale = runtime.lastResolvedValueScale || null;
      state.lastDataShape = cloneSimple(runtime.lastDataShape || null) || { rows: 0, cols: 0 };
      state.lastAutoDrawEvaluation = cloneSimple(runtime.lastAutoDrawEvaluation || null) || null;
    }
    return runtime;
  }

  function getHeatmapRenderRuntime(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(shaped?.cache){
      const runtime = ensureHeatmapRenderRuntimeShape(shaped.cache.renderRuntime);
      if(options.seedFromActive === true){
        runtime.lastViewOptions = state.lastViewOptions || null;
        runtime.textAspectMetrics = state.textAspectMetrics || null;
        runtime.lastResolvedValueScale = state.lastResolvedValueScale || null;
        runtime.lastDataShape = state.lastDataShape || { rows: 0, cols: 0 };
        runtime.lastAutoDrawEvaluation = state.lastAutoDrawEvaluation || null;
      }
      shaped.cache.renderRuntime = runtime;
      return syncHeatmapRenderRuntimeMirror(runtime, shaped);
    }
    return syncHeatmapRenderRuntimeMirror(createDefaultHeatmapRenderRuntime({
      lastRenderModel: null,
      lastViewOptions: state.lastViewOptions,
      textAspectMetrics: state.textAspectMetrics,
      lastResolvedValueScale: state.lastResolvedValueScale,
      lastDataShape: state.lastDataShape,
      lastAutoDrawEvaluation: state.lastAutoDrawEvaluation
    }), null);
  }

  function updateHeatmapRenderRuntime(session = null, mutator = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const runtime = getHeatmapRenderRuntime(shaped, { seedFromActive: options.seedFromActive === true });
    if(typeof mutator === 'function'){
      mutator(runtime);
    }
    runtime.updatedAt = Date.now();
    if(shaped){
      shaped.cache.renderRuntime = runtime;
      shaped.updatedAt = Date.now();
    }
    return syncHeatmapRenderRuntimeMirror(runtime, shaped);
  }


  function getHeatmapActiveRenderModel(session = null){
    const owner = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    return owner?.cache?.renderRuntime?.lastRenderModel || null;
  }

  function syncHeatmapResultsMirror(results, session = null){
    if(!results){
      return null;
    }
    const normalized = createDefaultHeatmapResultsState(results);
    const shouldMirror = !session || session === getActiveHeatmapSessionForState() || isHeatmapSessionActiveForModuleState(session);
    if(shouldMirror){
      state.lastStats = cloneSimple(normalized.stats || null) || null;
      state.statsPanelModel = normalizeHeatmapStatsPanelModel(normalized.statsPanelModel || {});
    }
    if(session){
      session.results = normalized;
      session.state.lastStats = cloneSimple(normalized.stats || null) || null;
      session.state.statsPanelModel = normalizeHeatmapStatsPanelModel(normalized.statsPanelModel || {});
      session.updatedAt = Date.now();
    }
    return normalized;
  }

  function updateHeatmapResultsState(session = null, mutator = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const results = createDefaultHeatmapResultsState(shaped?.results || {
      stats: state.lastStats,
      statsPanelModel: state.statsPanelModel
    });
    if(typeof mutator === 'function'){
      mutator(results);
    }
    return syncHeatmapResultsMirror(results, shaped || null);
  }

  function captureHeatmapSessionStateFromActive(session = null, meta = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(!shaped){
      return null;
    }
    const isOutgoingProjectedOwner = meta?.allowProjectedOwnerCapture === true
      && shaped === projectedHeatmapSession
      && (!shaped.root || !state.root || shaped.root === state.root);
    if(shaped.tabId && !isHeatmapSessionActiveForModuleState(shaped) && !isOutgoingProjectedOwner){
      shaped.updatedAt = Date.now();
      debugLog('Debug: heatmap inactive-session capture skipped active mirror read', {
        tabId: shaped.tabId || null,
        activeTabId: getHeatmapActiveTabId() || null,
        reason: meta?.reason || 'heatmap-session-capture'
      });
      return shaped;
    }
    const existingRenderRuntime = createDefaultHeatmapRenderRuntime(shaped.cache?.renderRuntime || {}, { retainModel: true });
    shaped.state = buildHeatmapTabContextSnapshotFromState(shaped);
    shaped.results = createDefaultHeatmapResultsState({
      stats: shaped.state.lastStats,
      statsPanelModel: shaped.state.statsPanelModel
    });
    shaped.cache.renderRuntime = createDefaultHeatmapRenderRuntime({
      lastRenderModel: existingRenderRuntime.lastRenderModel || null,
      lastViewOptions: state.lastViewOptions || existingRenderRuntime.lastViewOptions || null,
      textAspectMetrics: state.textAspectMetrics || existingRenderRuntime.textAspectMetrics || null,
      lastResolvedValueScale: state.lastResolvedValueScale || existingRenderRuntime.lastResolvedValueScale || null,
      lastDataShape: state.lastDataShape || existingRenderRuntime.lastDataShape || { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: state.lastAutoDrawEvaluation || existingRenderRuntime.lastAutoDrawEvaluation || null,
      dataSignature: existingRenderRuntime.dataSignature || null,
      settingsSignature: existingRenderRuntime.settingsSignature || null
    }, { retainModel: true });
    shaped.timers.drawRuntime = createDefaultHeatmapDrawRuntime({
      token: state.drawToken,
      pendingDrawOptions: shaped.timers.drawRuntime?.pendingDrawOptions || {},
      deferredHiddenDrawOptions: shaped.timers.drawRuntime?.deferredHiddenDrawOptions || null,
      hiddenDrawFlushHandle
    });
    syncHeatmapSessionRefsFromActive(shaped);
    syncHeatmapSessionManagersFromActive(shaped);
    shaped.updatedAt = Date.now();
    debugLog('Debug: heatmap session captured from active state', {
      tabId: shaped.tabId || null,
      reason: meta?.reason || null,
      hasRenderModel: !!shaped.cache.renderRuntime.lastRenderModel,
      hasStats: !!shaped.results.stats
    });
    return shaped;
  }

  function applyHeatmapSessionStateToActive(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(!shaped){
      return false;
    }
    applyHeatmapTabContextSnapshot(shaped.state, {
      syncUi: options.syncUi !== false,
      skipExportRefresh: options.skipExportRefresh === true
    });
    syncHeatmapRenderRuntimeMirror(shaped.cache.renderRuntime, shaped);
    syncHeatmapResultsMirror(shaped.results, shaped);
    syncHeatmapDrawRuntimeMirror(shaped.timers.drawRuntime, shaped);
    syncHeatmapSessionRefsFromActive(shaped);
    syncHeatmapSessionManagersFromActive(shaped);
    shaped.updatedAt = Date.now();
    return true;
  }

  function setHeatmapSessionStateFromRuntimeRecord(record, meta = {}){
    if(!record || typeof record !== 'object'){
      return null;
    }
    const tabId = normalizeHeatmapSessionTabId(meta?.tab || meta?.tabId || record.tabId || null, meta);
    if(!tabId){
      return null;
    }
    const session = getHeatmapSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'heatmap-session-state-from-runtime' }, { create: true });
    if(!session){
      return null;
    }
    session.state = { ...createDefaultHeatmapTabContext(), ...(cloneSimple(record) || record) };
    session.results = createDefaultHeatmapResultsState({
      stats: session.state.lastStats,
      statsPanelModel: session.state.statsPanelModel
    });
    if(record.renderState && typeof record.renderState === 'object'){
      session.cache.renderRuntime = createDefaultHeatmapRenderRuntime(record.renderState);
    }
    session.updatedAt = Date.now();
    return session;
  }

  function ensureHeatmapPerformanceState(){
    if(state.performance && typeof state.performance === 'object'){
      return state.performance;
    }
    state.performance = { loadData: null, draw: null, evaluation: null };
    return state.performance;
  }

  function recordHeatmapPerformance(section, data){
    if(!section){
      return;
    }
    const perfState = ensureHeatmapPerformanceState();
    const previous = perfState[section] || {};
    const payload = { timestamp: Date.now(), ...(data || {}) };
    if(section === 'draw' && payload.status === 'skipped' && payload.viewOnly === true){
      // View-only skips are stale projection attempts, not successful owner draws.
      // Do not advance the draw timestamp or tests/runtime can observe a previous
      // correlation model as if it were the settled Data values render.
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debugLog('Debug: heatmap performance skipped stale view-only draw', { payload });
      }
      return;
    }
    if(section === 'draw'){
      payload.sequence = (Number(previous.sequence) || 0) + 1;
    }
    perfState[section] = payload;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: heatmap performance mark', { section, payload });
    }
  }

  const heatmapOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'heatmap',
    message: 'Rendering heatmap...',
    isHeavy: Shared.loadingOverlay?.createTableHeavyPredicate?.({
      getHot: () => state.hot,
      startRow: 1,
      startCol: 1,
      rowThreshold: 500,
      cellThreshold: 5000
    }),
    getTabId: () => getHeatmapProjectionTabId() || null,
    getHost: () => (
      state.svgBox
      || getHeatmapNodeById('heatmapGraphPanel')?.querySelector?.('.svgbox')
      || getHeatmapNodeById('heatmapGraphPanel')
    )
  });

  function markHeatmapOverlayPending(reason){
    heatmapOverlayController?.markPending(reason);
    debugLog('Debug: heatmap overlay pending flagged',{ reason: reason || 'data-change' });
  }

  function queueHeatmapOverlay(reason, options = {}){
    return heatmapOverlayController?.queue(reason, options) || false;
  }

  function resolveHeatmapOverlay(reason){
    heatmapOverlayController?.resolve(reason);
  }

  function forceHeatmapOverlay(reason, options = {}){
    return heatmapOverlayController?.force(reason, options) || false;
  }

  function ensureDendrogramSettings(session = null){
    return getHeatmapDendrogramSettings(session || getActiveHeatmapSessionForState());
  }

  function normalizeHeatmapPalette(palette){
    const next = palette && typeof palette === 'object' ? palette : {};
    const normalize = (value, fallback) => {
      const text = typeof value === 'string' ? value.trim() : '';
      return text || fallback;
    };
    return {
      negative: normalize(next.negative, DEFAULT_HEATMAP_PALETTE.negative),
      zero: normalize(next.zero, DEFAULT_HEATMAP_PALETTE.zero),
      positive: normalize(next.positive, DEFAULT_HEATMAP_PALETTE.positive)
    };
  }

  function normalizeHeatmapScaleNumber(value){
    if(value == null){
      return null;
    }
    if(typeof value === 'string' && value.trim() === ''){
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeHeatmapValueScale(scale){
    const next = scale && typeof scale === 'object' ? scale : {};
    return {
      min: normalizeHeatmapScaleNumber(next.min),
      max: normalizeHeatmapScaleNumber(next.max)
    };
  }

  function normalizeHeatmapLegendHeightMode(value){
    return value === 'fixed' ? 'fixed' : DEFAULT_HEATMAP_LEGEND_HEIGHT_MODE;
  }

  function isHeatmapValueView(view){
    const normalized = typeof view === 'string' ? view.trim() : '';
    return normalized ? !normalized.startsWith('corr') : false;
  }

  function normalizeHeatmapMetric(value, fallback = 'pearson'){
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || fallback;
  }

  function normalizeHeatmapControlState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const filters = src.filters && typeof src.filters === 'object' ? src.filters : {};
    const adjust = src.adjust && typeof src.adjust === 'object' ? src.adjust : {};
    const clustering = src.clustering && typeof src.clustering === 'object' ? src.clustering : {};
    const rowsCluster = clustering.rows && typeof clustering.rows === 'object' ? clustering.rows : {};
    const columnsCluster = clustering.columns && typeof clustering.columns === 'object' ? clustering.columns : {};
    const rawView = typeof src.view === 'string' ? src.view.trim() : '';
    const view = rawView || 'corr-columns';
    const isCorrelation = view.startsWith('corr');
    const decimals = clampDecimals(src.decimals);
    const cellSize = Math.max(12, Number(src.cellSize) || 60);
    const fontSize = Math.max(8, Number(src.fontSize) || DEFAULT_HEATMAP_FONT_SIZE_PT);
    const centerRowsMode = adjust.centerRowsMode ?? adjust.centerRows ?? src.centerRowsMode ?? null;
    const centerColumnsMode = adjust.centerColumnsMode ?? adjust.centerColumns ?? src.centerColumnsMode ?? null;
    const normalizeNumber = (value, fallback) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };
    return {
      view,
      method: normalizeHeatmapMetric(src.method ?? src.correlationMethod, 'pearson'),
      useAbsolute: isCorrelation ? !!(src.useAbsolute ?? src.absValues) : false,
      maskLower: isCorrelation ? !!src.maskLower : false,
      showValues: src.showValues !== false,
      showSignificance: isCorrelation ? !!src.showSignificance : false,
      significanceDisplay: src.significanceDisplay === 'pvalue' ? 'pvalue' : 'star',
      decimals,
      cellSize,
      fontSize,
      filters: {
        presentEnabled: !!filters.presentEnabled,
        presentThreshold: normalizeNumber(filters.presentThreshold, 80),
        sdEnabled: !!filters.sdEnabled,
        sdThreshold: normalizeNumber(filters.sdThreshold, 2),
        absEnabled: !!filters.absEnabled,
        absCount: Math.max(1, Math.floor(normalizeNumber(filters.absCount, 1))),
        absValue: normalizeNumber(filters.absValue, 2),
        rangeEnabled: !!filters.rangeEnabled,
        rangeThreshold: normalizeNumber(filters.rangeThreshold, 2)
      },
      adjust: {
        logTransform: !!adjust.logTransform,
        logPlusOne: !!(adjust.logPlusOne ?? src.logPlusOne),
        centerRowsMode: centerRowsMode ? normalizeHeatmapMetric(centerRowsMode, 'mean') : null,
        normalizeRows: !!adjust.normalizeRows,
        centerColumnsMode: centerColumnsMode ? normalizeHeatmapMetric(centerColumnsMode, 'mean') : null,
        normalizeColumns: !!adjust.normalizeColumns
      },
      clustering: {
        rows: {
          enabled: rowsCluster.enabled !== false,
          metric: normalizeHeatmapMetric(rowsCluster.metric, 'pearson'),
          showDendrogram: rowsCluster.showDendrogram !== false
        },
        columns: {
          enabled: columnsCluster.enabled !== false,
          metric: normalizeHeatmapMetric(columnsCluster.metric, 'pearson'),
          showDendrogram: columnsCluster.showDendrogram !== false
        },
        linkage: normalizeHeatmapMetric(clustering.linkage, 'average')
      }
    };
  }

  function captureHeatmapControlStateFromDom(){
    return normalizeHeatmapControlState({
      view: refs.view?.value || 'corr-columns',
      method: refs.method?.value || 'pearson',
      useAbsolute: !!refs.absValues?.checked,
      maskLower: !!refs.maskLower?.checked,
      showValues: refs.showValues ? !!refs.showValues.checked : true,
      showSignificance: !!refs.showSignificance?.checked,
      significanceDisplay: refs.significanceDisplay?.value === 'pvalue' ? 'pvalue' : 'star',
      decimals: refs.decimals?.value,
      cellSize: refs.cellSize?.value,
      fontSize: refs.fontSize?.value,
      filters: {
        presentEnabled: !!refs.filterPresentEnable?.checked,
        presentThreshold: refs.filterPresentValue?.value,
        sdEnabled: !!refs.filterSdEnable?.checked,
        sdThreshold: refs.filterSdValue?.value,
        absEnabled: !!refs.filterAbsEnable?.checked,
        absCount: refs.filterAbsCount?.value,
        absValue: refs.filterAbsValue?.value,
        rangeEnabled: !!refs.filterRangeEnable?.checked,
        rangeThreshold: refs.filterRangeValue?.value
      },
      adjust: {
        logTransform: !!refs.logTransform?.checked,
        logPlusOne: !!state.logPlusOne,
        centerRowsMode: refs.centerGenes?.checked ? (getCheckedRadioValue('heatmapCenterGenesMode') || 'mean') : null,
        normalizeRows: !!refs.normalizeGenes?.checked,
        centerColumnsMode: refs.centerArrays?.checked ? (getCheckedRadioValue('heatmapCenterArraysMode') || 'mean') : null,
        normalizeColumns: !!refs.normalizeArrays?.checked
      },
      clustering: {
        rows: {
          enabled: refs.clusterGenes ? !!refs.clusterGenes.checked : true,
          metric: refs.genesMetric?.value || 'pearson',
          showDendrogram: refs.showRowDendrogram ? !!refs.showRowDendrogram.checked : true
        },
        columns: {
          enabled: refs.clusterArrays ? !!refs.clusterArrays.checked : true,
          metric: refs.arraysMetric?.value || 'pearson',
          showDendrogram: refs.showColumnDendrogram ? !!refs.showColumnDendrogram.checked : true
        },
        linkage: refs.linkage?.value || 'average'
      }
    });
  }

  function syncHeatmapControlStateToSession(session = null, controls = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const normalized = normalizeHeatmapControlState(controls || captureHeatmapControlStateFromDom());
    if(shaped){
      shaped.state.controls = normalized;
      shaped.state.logPlusOne = !!normalized.adjust.logPlusOne;
      shaped.updatedAt = Date.now();
    }
    if(options.updateMirror !== false){
      state.logPlusOne = !!normalized.adjust.logPlusOne;
    }
    return normalized;
  }

  function getHeatmapControlState(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(options.syncFromDom === true || !shaped?.state?.controls){
      return syncHeatmapControlStateToSession(shaped, captureHeatmapControlStateFromDom(), options);
    }
    return normalizeHeatmapControlState(shaped.state.controls);
  }

  function normalizeHeatmapNotesState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      text: src.text == null ? '' : String(src.text),
      open: !!src.open
    };
  }

  function syncHeatmapNotesStateToSession(session = null, notes = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const normalized = normalizeHeatmapNotesState(notes || notesState);
    if(shaped){
      shaped.state.notes = { ...normalized };
      shaped.updatedAt = Date.now();
    }
    const shouldMirror = options.updateMirror !== false
      && (!shaped || isHeatmapSessionActiveForModuleState(shaped));
    if(shouldMirror){
      notesState.text = normalized.text;
      notesState.open = normalized.open;
    }
    return normalized;
  }

  function getHeatmapNotesState(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    let source = shaped?.state?.notes || notesState;
    if(options.syncFromControl === true){
      const noteControl = options.control || notesState.control || shaped?.refs?.notesControl || null;
      if(noteControl && typeof noteControl.getValue === 'function'){
        source = {
          text: noteControl.getValue(),
          open: typeof noteControl.isOpen === 'function' ? noteControl.isOpen() : source.open
        };
      }
    }
    return syncHeatmapNotesStateToSession(shaped, source, options);
  }

  function applyHeatmapNotesStateToControl(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const normalized = getHeatmapNotesState(shaped, { updateMirror: true });
    const noteControl = options.control || notesState.control || shaped?.refs?.notesControl || null;
    if(noteControl){
      if(typeof noteControl.setValue === 'function'){
        noteControl.setValue(normalized.text);
      }
      if(typeof noteControl.setOpen === 'function'){
        noteControl.setOpen(!!normalized.open);
      }
    }
    return normalized;
  }

  function getHeatmapDendrogramSettings(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const source = shaped?.state?.dendrogramSettings || state.dendrogramSettings || {};
    const next = {
      thickness: Math.max(0.25, Number(source.thickness) || DEFAULT_DENDROGRAM_THICKNESS),
      color: typeof source.color === 'string' && source.color.trim() ? source.color.trim() : DEFAULT_DENDROGRAM_COLOR
    };
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      state.dendrogramSettings = { ...next };
    }
    if(shaped){
      shaped.state.dendrogramSettings = { ...next };
      shaped.updatedAt = Date.now();
    }
    return { ...next };
  }

  function updateHeatmapDendrogramSettings(patch = {}, session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const next = getHeatmapDendrogramSettings(shaped);
    if(Object.prototype.hasOwnProperty.call(patch || {}, 'thickness')){
      next.thickness = Math.max(0.25, Number(patch.thickness) || DEFAULT_DENDROGRAM_THICKNESS);
    }
    if(Object.prototype.hasOwnProperty.call(patch || {}, 'color')){
      const color = typeof patch.color === 'string' ? patch.color.trim() : '';
      next.color = color || DEFAULT_DENDROGRAM_COLOR;
    }
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      state.dendrogramSettings = { ...next };
    }
    if(shaped){
      shaped.state.dendrogramSettings = { ...next };
      shaped.updatedAt = Date.now();
    }
    return { ...next };
  }

  function getHeatmapClusterState(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const source = shaped?.state || state;
    const next = {
      clusterControlsTouched: !!source.clusterControlsTouched,
      clusterDefaultsAutoApplied: !!source.clusterDefaultsAutoApplied,
      suppressClusterTouchTracking: !!source.suppressClusterTouchTracking,
      suspendAutoClusterDefaults: !!source.suspendAutoClusterDefaults
    };
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      Object.assign(state, next);
    }
    if(shaped){
      Object.assign(shaped.state, next);
      shaped.updatedAt = Date.now();
    }
    return next;
  }

  function updateHeatmapClusterState(patch = {}, session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const next = { ...getHeatmapClusterState(shaped), ...(patch || {}) };
    next.clusterControlsTouched = !!next.clusterControlsTouched;
    next.clusterDefaultsAutoApplied = !!next.clusterDefaultsAutoApplied;
    next.suppressClusterTouchTracking = !!next.suppressClusterTouchTracking;
    next.suspendAutoClusterDefaults = !!next.suspendAutoClusterDefaults;
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      Object.assign(state, next);
    }
    if(shaped){
      Object.assign(shaped.state, next);
      shaped.updatedAt = Date.now();
    }
    return next;
  }

  function setHeatmapActiveMaterializedViewId(viewId = null, session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const normalized = viewId == null || viewId === '' ? null : String(viewId);
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      state.activeMaterializedViewId = normalized;
    }
    if(shaped){
      shaped.state.activeMaterializedViewId = normalized;
      shaped.updatedAt = Date.now();
    }
    return normalized;
  }

  function applyHeatmapControlStateToDom(controls, options = {}){
    const normalized = normalizeHeatmapControlState(controls);
    if(refs.view){ refs.view.value = normalized.view; }
    if(refs.method){ refs.method.value = normalized.method; }
    if(refs.absValues){ refs.absValues.checked = !!normalized.useAbsolute; }
    if(refs.maskLower){ refs.maskLower.checked = !!normalized.maskLower; }
    if(refs.showValues){ refs.showValues.checked = !!normalized.showValues; }
    if(refs.showSignificance){ refs.showSignificance.checked = !!normalized.showSignificance; }
    if(refs.significanceDisplay){ refs.significanceDisplay.value = normalized.significanceDisplay; }
    if(refs.decimals){ refs.decimals.value = String(normalized.decimals); }
    if(refs.cellSize){
      refs.cellSize.value = String(normalized.cellSize);
      if(refs.cellSizeVal){ refs.cellSizeVal.textContent = refs.cellSize.value; }
    }
    if(refs.fontSize){
      refs.fontSize.value = String(normalized.fontSize);
      if(refs.fontSize.dataset){ refs.fontSize.dataset.fontBasePt = String(normalized.fontSize); }
      chartStyle.renderFontSizeLabel?.({ element: refs.fontSizeVal, pt: normalized.fontSize, input: refs.fontSize, manual: true });
    }
    if(refs.filterPresentEnable){ refs.filterPresentEnable.checked = !!normalized.filters.presentEnabled; }
    if(refs.filterPresentValue){ refs.filterPresentValue.value = String(normalized.filters.presentThreshold); }
    if(refs.filterSdEnable){ refs.filterSdEnable.checked = !!normalized.filters.sdEnabled; }
    if(refs.filterSdValue){ refs.filterSdValue.value = String(normalized.filters.sdThreshold); }
    if(refs.filterAbsEnable){ refs.filterAbsEnable.checked = !!normalized.filters.absEnabled; }
    if(refs.filterAbsCount){ refs.filterAbsCount.value = String(normalized.filters.absCount); }
    if(refs.filterAbsValue){ refs.filterAbsValue.value = String(normalized.filters.absValue); }
    if(refs.filterRangeEnable){ refs.filterRangeEnable.checked = !!normalized.filters.rangeEnabled; }
    if(refs.filterRangeValue){ refs.filterRangeValue.value = String(normalized.filters.rangeThreshold); }
    if(refs.logTransform){ refs.logTransform.checked = !!normalized.adjust.logTransform; }
    state.logPlusOne = !!normalized.adjust.logPlusOne;
    if(refs.centerGenes){ refs.centerGenes.checked = !!normalized.adjust.centerRowsMode; }
    const rowMode = normalized.adjust.centerRowsMode || 'mean';
    const rowRadio = queryHeatmapRoot(`input[name="heatmapCenterGenesMode"][value="${rowMode}"]`);
    if(rowRadio){ rowRadio.checked = true; }
    if(refs.normalizeGenes){ refs.normalizeGenes.checked = !!normalized.adjust.normalizeRows; }
    if(refs.centerArrays){ refs.centerArrays.checked = !!normalized.adjust.centerColumnsMode; }
    const columnMode = normalized.adjust.centerColumnsMode || 'mean';
    const columnRadio = queryHeatmapRoot(`input[name="heatmapCenterArraysMode"][value="${columnMode}"]`);
    if(columnRadio){ columnRadio.checked = true; }
    if(refs.normalizeArrays){ refs.normalizeArrays.checked = !!normalized.adjust.normalizeColumns; }
    if(refs.clusterGenes){ refs.clusterGenes.checked = !!normalized.clustering.rows.enabled; }
    if(refs.genesMetric){ refs.genesMetric.value = normalized.clustering.rows.metric; }
    if(refs.showRowDendrogram){ refs.showRowDendrogram.checked = !!normalized.clustering.rows.showDendrogram; }
    if(refs.clusterArrays){ refs.clusterArrays.checked = !!normalized.clustering.columns.enabled; }
    if(refs.arraysMetric){ refs.arraysMetric.value = normalized.clustering.columns.metric; }
    if(refs.showColumnDendrogram){ refs.showColumnDendrogram.checked = !!normalized.clustering.columns.showDendrogram; }
    if(refs.linkage){ refs.linkage.value = normalized.clustering.linkage; }
    syncHeatmapControlStateToSession(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), normalized);
    if(options.dispatch === true){
      [
        refs.view, refs.method, refs.significanceDisplay,
        refs.filterPresentEnable, refs.filterSdEnable, refs.filterAbsEnable, refs.filterRangeEnable,
        refs.centerGenes, refs.centerArrays, refs.normalizeGenes, refs.normalizeArrays,
        refs.clusterGenes, refs.clusterArrays, refs.linkage
      ].forEach(el => el?.dispatchEvent?.(new Event('change')));
      [refs.cellSize, refs.fontSize].forEach(el => el?.dispatchEvent?.(new Event('input')));
    }
    return normalized;
  }

  function getHeatmapCurrentView(){
    return getHeatmapControlState(getActiveHeatmapSessionForState(), { syncFromDom: !!refs.view })?.view
      || state.lastViewOptions?.view
      || 'corr-columns';
  }

  function formatHeatmapScaleInputValue(value){
    if(!Number.isFinite(value)){
      return '';
    }
    const decimals = getHeatmapControlState(getActiveHeatmapSessionForState(), { syncFromDom: !!refs.decimals })?.decimals ?? 2;
    if(chartStyle && typeof chartStyle.formatScientific === 'function'){
      return chartStyle.formatScientific(value, { maxDecimals: decimals ?? 2 });
    }
    return value.toFixed(decimals ?? 2);
  }

  function getHeatmapPalette(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const source = shaped?.state?.palette || state.palette;
    const palette = normalizeHeatmapPalette(source);
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      state.palette = palette;
    }
    if(shaped){
      shaped.state.palette = { ...palette };
      shaped.updatedAt = Date.now();
    }
    return { ...palette };
  }

  function getHeatmapValueScale(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const source = shaped?.state?.valueScale || state.valueScale;
    const scale = normalizeHeatmapValueScale(source);
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      state.valueScale = scale;
    }
    if(shaped){
      shaped.state.valueScale = { ...scale };
      shaped.updatedAt = Date.now();
    }
    return { ...scale };
  }

  function getHeatmapLegendHeightMode(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const mode = normalizeHeatmapLegendHeightMode(shaped?.state?.legendHeightMode || state.legendHeightMode);
    if(!shaped || isHeatmapSessionActiveForModuleState(shaped)){
      state.legendHeightMode = mode;
    }
    if(shaped){
      shaped.state.legendHeightMode = mode;
      shaped.updatedAt = Date.now();
    }
    return mode;
  }

  function syncHeatmapPaletteInputs(doc){
    const palette = getHeatmapPalette();
    const valueScale = getHeatmapValueScale();
    const legendHeightMode = getHeatmapLegendHeightMode();
    const resolvedValueScale = state.lastResolvedValueScale && typeof state.lastResolvedValueScale === 'object'
      ? state.lastResolvedValueScale
      : null;
    if(refs.colorNegative){ refs.colorNegative.value = palette.negative; }
    if(refs.colorZero){ refs.colorZero.value = palette.zero; }
    if(refs.colorPositive){ refs.colorPositive.value = palette.positive; }
    const root = doc || global.document;
    if(!root || typeof root.querySelectorAll !== 'function'){
      return palette;
    }
    root.querySelectorAll('.heatmap-palette-controls-panel input[data-heatmap-palette-key]').forEach(input => {
      const key = input?.dataset?.heatmapPaletteKey || '';
      if(key && palette[key]){
        input.value = palette[key];
      }
    });
    root.querySelectorAll('.heatmap-palette-controls-panel input[data-heatmap-value-scale-bound]').forEach(input => {
      const key = input?.dataset?.heatmapValueScaleBound || '';
      if(key !== 'min' && key !== 'max'){
        return;
      }
      const overrideValue = valueScale[key];
      input.value = Number.isFinite(overrideValue) ? String(overrideValue) : '';
      const placeholderValue = Number.isFinite(resolvedValueScale?.[key])
        ? formatHeatmapScaleInputValue(resolvedValueScale[key])
        : '';
      input.placeholder = placeholderValue;
      input.title = placeholderValue
        ? `Leave blank to use ${placeholderValue}`
        : `Leave blank to use the data ${key}`;
    });
    root.querySelectorAll('.heatmap-palette-controls-panel [data-heatmap-legend-height-mode]').forEach(select => {
      select.value = legendHeightMode;
    });
    const valueView = isHeatmapValueView(getHeatmapCurrentView());
    root.querySelectorAll('.heatmap-palette-controls-panel [data-heatmap-value-scale-field]').forEach(field => {
      field.hidden = false;
      field.setAttribute('aria-disabled', valueView ? 'false' : 'true');
      field.title = valueView ? '' : 'Available for Heatmap type = values.';
      const controls = typeof field.querySelectorAll === 'function'
        ? field.querySelectorAll('input, select, textarea, button')
        : [];
      controls.forEach(control => {
        control.disabled = !valueView;
        if(!valueView){
          control.title = 'Available for Heatmap type = values.';
        }else{
          control.removeAttribute('title');
        }
      });
    });
    return palette;
  }

  function updateHeatmapPalette(patch, options = {}){
    const paletteSession = getActiveHeatmapSessionForState();
    const previous = getHeatmapPalette(paletteSession);
    const next = normalizeHeatmapPalette({ ...previous, ...(patch || {}) });
    if(!paletteSession || isHeatmapSessionActiveForModuleState(paletteSession)){
      state.palette = next;
    }
    if(paletteSession){
      paletteSession.state.palette = { ...next };
      paletteSession.updatedAt = Date.now();
    }
    syncHeatmapPaletteInputs(options.document);
    if(options.skipSchedule !== true){
      scheduleHeatmapDrawForSession(paletteSession, {
        viewOnly: true,
        reason: options.reason || 'palette-change'
      });
    }
    debugLog('Debug: heatmap palette updated', {
      reason: options.reason || 'palette-change',
      palette: next
    });
    return next;
  }

  function updateHeatmapValueScale(patch, options = {}){
    const scaleSession = getActiveHeatmapSessionForState();
    const previous = getHeatmapValueScale(scaleSession);
    const next = normalizeHeatmapValueScale({ ...previous, ...(patch || {}) });
    if(previous.min === next.min && previous.max === next.max){
      syncHeatmapPaletteInputs(options.document);
      return next;
    }
    if(!scaleSession || isHeatmapSessionActiveForModuleState(scaleSession)){
      state.valueScale = next;
    }
    if(scaleSession){
      scaleSession.state.valueScale = { ...next };
      scaleSession.updatedAt = Date.now();
    }
    syncHeatmapPaletteInputs(options.document);
    if(options.skipSchedule !== true){
      scheduleHeatmapDrawForSession(scaleSession, {
        viewOnly: true,
        reason: options.reason || 'value-scale-change'
      });
    }
    debugLog('Debug: heatmap value scale updated', {
      reason: options.reason || 'value-scale-change',
      valueScale: next
    });
    return next;
  }

  function updateHeatmapLegendHeightMode(mode, options = {}){
    const legendSession = getActiveHeatmapSessionForState();
    const next = normalizeHeatmapLegendHeightMode(mode);
    if(getHeatmapLegendHeightMode(legendSession) === next){
      syncHeatmapPaletteInputs(options.document);
      return next;
    }
    if(!legendSession || isHeatmapSessionActiveForModuleState(legendSession)){
      state.legendHeightMode = next;
    }
    if(legendSession){
      legendSession.state.legendHeightMode = next;
      legendSession.updatedAt = Date.now();
    }
    syncHeatmapPaletteInputs(options.document);
    if(options.skipSchedule !== true){
      scheduleHeatmapDrawForSession(legendSession, {
        viewOnly: true,
        reason: options.reason || 'legend-height-mode-change'
      });
    }
    debugLog('Debug: heatmap legend height mode updated', {
      reason: options.reason || 'legend-height-mode-change',
      legendHeightMode: next
    });
    return next;
  }

  function resolveHeatmapToolbarHost(doc){
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(toolbarApi && typeof toolbarApi.resolveHost === 'function'){
      return toolbarApi.resolveHost('heatmap');
    }
    const root = doc || global.document;
    if(!root){
      return null;
    }
    return root.querySelector('.font-toolbar-host[data-font-toolbar-scope="heatmap"]') || null;
  }

  function ensureHeatmapToolbarHost(doc){
    return resolveHeatmapToolbarHost(doc);
  }

  function resetHeatmapPaletteHostLayout(host){
    if(!host){
      return;
    }
    host.classList.remove('font-toolbar-host--heatmap-dual');
    host.style.removeProperty('display');
    host.style.removeProperty('grid-auto-flow');
    host.style.removeProperty('grid-auto-columns');
    host.style.removeProperty('column-gap');
    host.style.removeProperty('align-items');
    host.style.removeProperty('justify-content');
  }

  function clearHeatmapPalettePanel(host){
    if(!host || typeof host.querySelectorAll !== 'function'){
      return;
    }
    host.querySelectorAll('.heatmap-palette-controls-panel').forEach(node => {
      const panel = node.closest ? node.closest('.workspace-toolbar__panel') : null;
      if(panel && panel.parentNode){
        panel.parentNode.removeChild(panel);
        return;
      }
      if(node.parentNode){
        node.parentNode.removeChild(node);
      }
    });
  }

  function setHeatmapToolbarHostVisible(host){
    if(!host){
      return;
    }
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(toolbarApi && typeof toolbarApi.showHost === 'function'){
      toolbarApi.showHost(host);
      return;
    }
    host.style.display = 'flex';
    host.classList.add('font-toolbar-host--visible');
  }

  function detachHeatmapPaletteDocClick(host){
    if(!host || !host.__heatmapPaletteDocClickHandler || !global.document){
      return;
    }
    global.document.removeEventListener('click', host.__heatmapPaletteDocClickHandler, true);
    host.__heatmapPaletteDocClickHandler = null;
  }

  function attachHeatmapPaletteDocClick(host){
    if(!host || !global.document){
      return;
    }
    detachHeatmapPaletteDocClick(host);
    const onDocClick = event => {
      const target = event?.target || null;
      if(!target){
        return;
      }
      if(host.contains(target)){
        return;
      }
      if(target.closest && target.closest('.shared-color-picker')){
        return;
      }
      detachHeatmapPaletteDocClick(host);
      clearHeatmapPalettePanel(host);
      resetHeatmapPaletteHostLayout(host);
      const toolbarApi = Shared.getWorkspaceToolbarApi();
      if(toolbarApi && typeof toolbarApi.hideHost === 'function'){
        toolbarApi.hideHost(host);
      }else{
        host.classList.remove('font-toolbar-host--visible');
        host.style.display = 'none';
      }
    };
    global.document.addEventListener('click', onDocClick, true);
    host.__heatmapPaletteDocClickHandler = onDocClick;
  }

  function showHeatmapPaletteFormatControls(options = {}){
    const doc = options.document || global.document;
    const toolbarApi = Shared.getWorkspaceToolbarApi();
    if(!doc){
      return null;
    }
    const appendToHost = options.appendToHost === true;
    if(!appendToHost && options.skipHideAll !== true && typeof Shared.hideAllFormatControls === 'function'){
      try{
        Shared.hideAllFormatControls({ force: true });
      }catch(err){
        debugLog('Debug: heatmap palette hideAllFormatControls failed', { error: err?.message || String(err) });
      }
    }
    const host = options.host || ensureHeatmapToolbarHost(doc);
    if(!host){
      return null;
    }
    detachHeatmapPaletteDocClick(host);
    clearHeatmapPalettePanel(host);
    if(!appendToHost){
      resetHeatmapPaletteHostLayout(host);
    }

    const panelParts = toolbarApi.createSubPanel({
      title: 'Heatmap Colors',
      panelClass: 'heatmap-palette-controls-panel',
      rowClass: 'workspace-toolbar__form workspace-toolbar__form--single heatmap-palette-controls additional-line-controls-panel__row',
      dataset: { heatmapPaletteControls: '1' }
    });
    const panel = panelParts.panel;
    const form = panelParts.row;

    const palette = getHeatmapPalette();
    const valueScale = getHeatmapValueScale();
    const legendHeightMode = getHeatmapLegendHeightMode();
    const fieldDefs = [
      { key: 'negative', label: 'Negative' },
      { key: 'zero', label: 'Neutral' },
      { key: 'positive', label: 'Positive' }
    ];
    fieldDefs.forEach(field => {
      const label = doc.createElement('label');
      label.className = 'additional-line-controls-panel__field heatmap-palette-controls__field';

      const caption = doc.createElement('span');
      caption.className = 'additional-line-controls-panel__field-label';
      caption.textContent = field.label;
      label.appendChild(caption);

      const input = doc.createElement('input');
      input.type = 'color';
      input.value = palette[field.key];
      input.dataset.heatmapPaletteKey = field.key;
      input.setAttribute('aria-label', `${field.label} heatmap color`);
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(input);
      }
      bindHeatmapControlHandler(input, 'input', `palette-${field.key}`, () => {
        updateHeatmapPalette({ [field.key]: input.value }, {
          reason: `palette-${field.key}`,
          document: doc
        });
      });
      label.appendChild(input);

      form.appendChild(label);
    });

    const scaleFieldDefs = [
      { key: 'min', label: 'Min' },
      { key: 'max', label: 'Max' }
    ];
    scaleFieldDefs.forEach(field => {
      const label = doc.createElement('label');
      label.className = 'additional-line-controls-panel__field heatmap-palette-controls__field';
      label.dataset.heatmapValueScaleField = '1';

      const caption = doc.createElement('span');
      caption.className = 'additional-line-controls-panel__field-label';
      caption.textContent = field.label;
      label.appendChild(caption);

      const input = doc.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--small';
      input.dataset.heatmapValueScaleBound = field.key;
      input.setAttribute('aria-label', `Heatmap ${field.label.toLowerCase()} scale bound`);
      if(Number.isFinite(valueScale[field.key])){
        input.value = String(valueScale[field.key]);
      }
      bindHeatmapControlHandler(input, 'change', `value-scale-${field.key}`, () => {
        updateHeatmapValueScale({ [field.key]: input.value }, {
          reason: `value-scale-${field.key}`,
          document: doc
        });
      });
      label.appendChild(input);

      form.appendChild(label);
    });

    const legendField = doc.createElement('label');
    legendField.className = 'additional-line-controls-panel__field heatmap-palette-controls__field';

    const legendCaption = doc.createElement('span');
    legendCaption.className = 'additional-line-controls-panel__field-label';
    legendCaption.textContent = 'Legend';
    legendField.appendChild(legendCaption);

    const legendSelect = doc.createElement('select');
    legendSelect.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--select';
    legendSelect.dataset.heatmapLegendHeightMode = '1';
    [
      { value: 'match-heatmap', label: 'Match heatmap' },
      { value: 'fixed', label: 'Fixed height' }
    ].forEach(optionConfig => {
      const option = doc.createElement('option');
      option.value = optionConfig.value;
      option.textContent = optionConfig.label;
      legendSelect.appendChild(option);
    });
    legendSelect.value = legendHeightMode;
    bindHeatmapControlHandler(legendSelect, 'change', 'legend-height-mode', () => {
      updateHeatmapLegendHeightMode(legendSelect.value, {
        reason: 'legend-height-mode',
        document: doc
      });
    });
    legendField.appendChild(legendSelect);

    form.appendChild(legendField);

    host.appendChild(panel);
    syncHeatmapPaletteInputs(doc);
    if(toolbarApi && typeof toolbarApi.showHost === 'function'){
      toolbarApi.showHost(host, appendToHost ? { hostClass: 'font-toolbar-host--heatmap-dual' } : undefined);
    }else{
      setHeatmapToolbarHostVisible(host);
      if(appendToHost){
        host.classList.add('font-toolbar-host--heatmap-dual');
      }
    }

    if(appendToHost){
    }else{
      attachHeatmapPaletteDocClick(host);
    }

    debugLog('Debug: heatmap palette toolbar shown', {
      appendToHost,
      hasHost: true
    });
    return { host, panel };
  }

  function handleHeatmapSvgFormatClick(event){
    const target = event?.target || null;
    const svg = state.svg;
    if(!target || !svg || !svg.contains(target)){
      return;
    }
    const legendTarget = typeof target.closest === 'function'
      ? target.closest('[data-heatmap-palette-trigger="legend"]')
      : null;
    if(legendTarget){
      showHeatmapPaletteFormatControls({ document: global.document });
      return;
    }
    const cellTarget = typeof target.closest === 'function'
      ? target.closest('[data-export-layer="heatmap-cells"], [data-layer="cells"]')
      : null;
    if(cellTarget){
      showHeatmapPaletteFormatControls({ document: global.document });
      return;
    }
    let textTarget = target;
    if(textTarget.tagName?.toLowerCase() !== 'text' && typeof textTarget.closest === 'function'){
      const ownerText = textTarget.closest('text');
      if(ownerText){
        textTarget = ownerText;
      }
    }
    if(!textTarget || textTarget.tagName?.toLowerCase() !== 'text'){
      return;
    }
    if(textTarget.dataset?.fontEditable === '0'){
      return;
    }
    const scope = textTarget.dataset?.fontScope || svg.dataset?.fontScope || null;
    if(scope !== 'heatmap'){
      return;
    }
    const host = resolveHeatmapToolbarHost(global.document);
    if(!host || !host.classList || !host.classList.contains('font-toolbar-host--visible')){
      return;
    }
    showHeatmapPaletteFormatControls({
      document: global.document,
      host,
      appendToHost: true,
      skipHideAll: true
    });
  }

  function getDendrogramThickness(){
    const settings = ensureDendrogramSettings();
    return settings.thickness;
  }

  function getDendrogramColor(){
    const settings = ensureDendrogramSettings();
    return settings.color;
  }

  function updateDendrogramThickness(value){
    const previous = getHeatmapDendrogramSettings();
    const numeric = Number(value);
    const newThickness = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_DENDROGRAM_THICKNESS;
    if(previous.thickness !== newThickness){
      updateHeatmapDendrogramSettings({ thickness: newThickness });
      debugLog('Debug: heatmap dendrogram thickness updated', { value: newThickness });
      scheduleActiveHeatmapDraw({ viewOnly: true, reason: 'dendrogram-thickness' });
    }
  }

  function updateDendrogramColor(value){
    const previous = getHeatmapDendrogramSettings();
    const newColor = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_DENDROGRAM_COLOR;
    if(previous.color !== newColor){
      updateHeatmapDendrogramSettings({ color: newColor });
      debugLog('Debug: heatmap dendrogram color updated', { value: newColor });
      scheduleActiveHeatmapDraw({ viewOnly: true, reason: 'dendrogram-color' });
    }
  }

  function createDendrogramControlConfig(orientation){
    return {
      orientation,
      scopeId: 'heatmap',
      getThickness: getDendrogramThickness,
      getColor: getDendrogramColor,
      onThicknessChange: updateDendrogramThickness,
      onColorChange: updateDendrogramColor
    };
  }

  function runWithHeatmapControlSuspension(callback){
    const previousSchedule = !!state.suspendControlSchedule;
    const previousMaterialization = !!state.suspendDataViewMaterialization;
    state.suspendControlSchedule = true;
    state.suspendDataViewMaterialization = true;
    try{
      return typeof callback === 'function' ? callback() : undefined;
    }finally{
      state.suspendControlSchedule = previousSchedule;
      state.suspendDataViewMaterialization = previousMaterialization;
    }
  }

  function shouldSkipHeatmapHotSchedule(scheduleMeta){
    const source = String(scheduleMeta?.source || '').trim();
    if(shouldSkipHeatmapDataViewSyncForLoadSource(source)){
      debugLog('Debug: heatmap skipped rescheduled draw for derived grid sync', {
        source
      });
      return true;
    }
    return false;
  }

  function normalizeHeatmapExclusionState(payload){
    const rows = Array.isArray(payload?.rows)
      ? payload.rows.map(value => Number(value)).filter(Number.isInteger).sort((a, b) => a - b)
      : [];
    const cols = Array.isArray(payload?.cols)
      ? payload.cols.map(value => Number(value)).filter(Number.isInteger).sort((a, b) => a - b)
      : [];
    const cells = Array.isArray(payload?.cells)
      ? payload.cells
        .map(pair => {
          const row = Number(pair?.row ?? pair?.[0]);
          const col = Number(pair?.col ?? pair?.[1]);
          if(!Number.isInteger(row) || !Number.isInteger(col)){
            return null;
          }
          return `${row}:${col}`;
        })
        .filter(Boolean)
        .sort()
      : [];
    return { rows, cols, cells };
  }

  function areHeatmapExclusionStatesEqual(left, right){
    const normalizedLeft = normalizeHeatmapExclusionState(left);
    const normalizedRight = normalizeHeatmapExclusionState(right);
    if(normalizedLeft.rows.length !== normalizedRight.rows.length
      || normalizedLeft.cols.length !== normalizedRight.cols.length
      || normalizedLeft.cells.length !== normalizedRight.cells.length){
      return false;
    }
    for(let i = 0; i < normalizedLeft.rows.length; i += 1){
      if(normalizedLeft.rows[i] !== normalizedRight.rows[i]){
        return false;
      }
    }
    for(let i = 0; i < normalizedLeft.cols.length; i += 1){
      if(normalizedLeft.cols[i] !== normalizedRight.cols[i]){
        return false;
      }
    }
    for(let i = 0; i < normalizedLeft.cells.length; i += 1){
      if(normalizedLeft.cells[i] !== normalizedRight.cells[i]){
        return false;
      }
    }
    return true;
  }

  function syncHeatmapHotExclusions(hotInstance, exclusions, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.applyExclusions !== 'function'){
      return false;
    }
    const current = typeof hot.exportExclusions === 'function'
      ? hot.exportExclusions()
      : (Shared.hot?.exportExclusions ? Shared.hot.exportExclusions(hot) : null);
    if(areHeatmapExclusionStatesEqual(current, exclusions)){
      debugLog('Debug: heatmap exclusion sync skipped', {
        reason: reason || null
      });
      return false;
    }
    hot.applyExclusions(exclusions || null, {
      silent: true,
      source: reason || 'heatmap-exclusion-sync'
    });
    debugLog('Debug: heatmap exclusion sync applied', {
      reason: reason || null,
      exclusions: normalizeHeatmapExclusionState(exclusions)
    });
    return true;
  }

  function activateHeatmapDataToolbar(reason){
    const now = Date.now();
    const tabId = String(getHeatmapProjectionTabId() || Shared.workspaceTabs?.getActiveSessionInfo?.('heatmap')?.tabId || 'global');
    const lastActivation = Number(heatmapDataToolbarLastActivationByTabId.get(tabId)) || 0;
    if(now - lastActivation < 80){
      return false;
    }
    heatmapDataToolbarLastActivationByTabId.set(tabId, now);
    const activated = !!Shared.workspaceToolbar?.activateSection?.('heatmap', 'Data');
    if(activated){
      debugLog('Debug: heatmap data toolbar activated', { reason: reason || 'unknown' });
    }
    return activated;
  }

  function ensureHeatmapDataViewsForHot(hotInstance, options = {}){
    const ownerTabId = getHeatmapHotOwnerTabId(hotInstance) || getHeatmapProjectionTabId() || null;
    const hostWrapper = options.wrapper || getHeatmapNodeById('heatmapHotWrapper') || null;
    const hostContainer = options.container || hotInstance?.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null;
    const manager = Shared.componentLifecycle?.ensureOwnedDataViewsManager?.({
      hotInstance,
      componentKey: 'heatmap',
      managerField: '__heatmapDataViewsManager',
      ownerTabId,
      runtimeKey: HEATMAP_RUNTIME_KEY,
      runtimeKeyField: '__heatmapRuntimeKey',
      hostContainerField: '__heatmapHostContainer',
      wrapper: hostWrapper,
      container: hostContainer,
      createOptions: {
        componentKey: 'heatmap',
        maxViews: HEATMAP_DATA_VIEW_MAX,
        initialData: hotInstance?.getData?.() || [],
        onActiveViewChanged(view, context){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          const isCorrelationView = isHeatmapCorrelationMatrixDataView(view);
          const viewsManager = hotInstance.__heatmapDataViewsManager || null;
          const nextTransformState = resolveHeatmapDataTransformControlStateForView(view, viewsManager);
          const closedViewId = String(context?.previousViewId || '').trim();
          const activeMaterializedId = String(getActiveHeatmapSessionForState()?.state?.activeMaterializedViewId || state.activeMaterializedViewId || '').trim();
          const closedActiveMaterialized = context?.reason === 'tab-close'
            && !!closedViewId
            && !!activeMaterializedId
            && closedViewId === activeMaterializedId;
          const closedToNonMaterialized = context?.reason === 'tab-close'
            && !isHeatmapMaterializedDataView(view)
            && !nextTransformState;
          if(closedActiveMaterialized || closedToNonMaterialized){
            clearHeatmapAdjustAndFilterControls();
          }else{
            applyHeatmapDataTransformControlState(nextTransformState);
          }
          setHeatmapActiveMaterializedViewId(isHeatmapMaterializedDataView(view) ? view.id : null);
          hotInstance.__heatmapPendingProgrammaticLoadSource = isCorrelationView
            ? HEATMAP_LOAD_SOURCE_CORRELATION_TAB_ACTIVATE
            : HEATMAP_LOAD_SOURCE_DATA_VIEW_SWITCH;
          Shared.dataViews.applyViewToTable(hotInstance, view, {
            loadOptions: {
              source: hotInstance.__heatmapPendingProgrammaticLoadSource
            },
            suppressLoadSchedule: !isCorrelationView,
            applyExclusions(_table, exclusions){
              syncHeatmapHotExclusions(hotInstance, exclusions, 'active-view-change');
            },
            filterReason: 'heatmap-data-view-switch'
          });
          if(!isCorrelationView){
            const viewSession = getHeatmapSessionForHot(hotInstance, { reason: 'heatmap-data-view-switch' }, { create: false })
              || getActiveHeatmapSessionForState();
            markHeatmapOverlayPending('data-view-switch');
            scheduleHeatmapDrawForSession(viewSession, {
              reason: 'data-view-switch',
              userInitiated: String(context?.reason || '').trim().toLowerCase() === 'tab-click'
            });
          }
        },
        onInteraction(interaction){
          if(interaction?.reason === 'tab-close'){
            const nextActiveView = hotInstance.__heatmapDataViewsManager?.getActiveView?.() || null;
            const nextTransformState = resolveHeatmapDataTransformControlStateForView(
              nextActiveView,
              hotInstance.__heatmapDataViewsManager || null
            );
            if(nextTransformState){
              applyHeatmapDataTransformControlState(nextTransformState);
            }else{
              clearHeatmapAdjustAndFilterControls();
            }
          }
          activateHeatmapDataToolbar('data-tab-interaction');
        }
      },
      onCreated(){
        debugLog('Debug: heatmap data views manager created', {
          tabId: getHeatmapHotOwnerTabId(hotInstance) || null
        });
      }
    });
    if(!manager){
      return null;
    }
    const activeView = manager.getActiveView?.() || null;
    setHeatmapActiveMaterializedViewId(isHeatmapMaterializedDataView(activeView) ? activeView.id : null);
    const managerSession = getHeatmapSession(getHeatmapHotOwnerTabId(hotInstance) || getHeatmapProjectionTabId() || null, {
      tabId: getHeatmapHotOwnerTabId(hotInstance) || getHeatmapProjectionTabId() || null,
      reason: 'heatmap-data-views-manager'
    }, { create: true }) || getActiveHeatmapSessionForState();
    if(managerSession?.managers){
      managerSession.managers.hot = hotInstance;
      managerSession.managers.dataViews = heatmapDataViewsManagerBelongsToSession(manager, managerSession) ? manager : managerSession.managers.dataViews || null;
      managerSession.updatedAt = Date.now();
    }
    return manager;
  }

  function syncHeatmapActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const pendingLoadSource = String(hot.__heatmapPendingProgrammaticLoadSource || '').trim();
    if((reason === 'afterChange' || reason === 'afterLoadData') && shouldSkipHeatmapDataViewSyncForLoadSource(pendingLoadSource)){
      debugLog('Debug: heatmap active data view sync skipped for programmatic load', {
        reason,
        source: pendingLoadSource
      });
      if(reason === 'afterLoadData'){
        hot.__heatmapPendingProgrammaticLoadSource = '';
      }
      captureHeatmapStatsPanelModel();
      return;
    }
    const ownerSession = getHeatmapSessionForHot(hot, { reason: 'heatmap-active-dataview-sync' }, { create: false, fallbackActive: false });
    const manager = Shared.componentLifecycle?.refreshOwnedDataViewsManagerFromHot?.({
      hotInstance: hot,
      componentKey: 'heatmap',
      managerField: '__heatmapDataViewsManager',
      session: ownerSession,
      belongsToSession: heatmapDataViewsManagerBelongsToSession,
      reason
    });
    if(reason === 'afterLoadData'){
      hot.__heatmapPendingProgrammaticLoadSource = '';
    }
    return manager;
  }

  function replaceHeatmapDataset(matrix, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot || typeof hot.loadData !== 'function'){
      console.warn('heatmap dataset replace skipped - hot not ready', { reason: options.reason || null });
      return false;
    }
    const nextData = Array.isArray(matrix) ? matrix : [];
    const manager = ensureHeatmapDataViewsForHot(hot, {
      wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
      container: hot.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
    });
    if(manager && typeof manager.initialize === 'function'){
      manager.initialize(nextData, {
        rawTitle: options.rawTitle || 'Raw'
      });
    }
    setHeatmapActiveMaterializedViewId(null);
    updateHeatmapClusterState({
      clusterControlsTouched: false,
      clusterDefaultsAutoApplied: false,
      suppressClusterTouchTracking: false
    });
    hot.loadData(nextData, options.loadOptions || undefined);
    syncHeatmapHotExclusions(hot, null, 'dataset-replace');
    if(options.scheduleDraw !== false){
      const drawOptions = {
        force: options.force !== false,
        reason: options.reason || 'dataset-replace',
        tabId: resolveHeatmapAsyncTabId(options, hot)
      };
      scheduleHeatmapDrawForSession(getHeatmapSessionForHot(hot, drawOptions, { create: false }), drawOptions);
    }
    debugLog('Debug: heatmap dataset replaced', {
      reason: options.reason || 'dataset-replace',
      rows: nextData.length,
      cols: nextData[0]?.length || 0,
      resetViews: !!manager
    });
    return true;
  }

  function applyHeatmapToolbarTransformToNewView(transformSpec, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureHeatmapDataViewsForHot(hot, {
      wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
      container: hot.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
    });
    if(!manager || typeof manager.applyTransform !== 'function'){
      console.warn('heatmap data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    const viewContext = resolveHeatmapViewContext(hot);
    const keepCorrelationActive = isHeatmapCorrelationMatrixDataView(viewContext.activeView);
    syncHeatmapActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyTransform(transformSpec, {
      title: options.title,
      sourceViewId: viewContext.sourceViewId || 'raw',
      activate: !keepCorrelationActive,
      reason: options.reason || 'toolbar-transform',
      transformOptions: Object.assign({}, HEATMAP_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: heatmap toolbar transform failed', {
        message,
        transform: transformSpec?.type || null
      });
      return false;
    }
    if(keepCorrelationActive && result?.view?.id){
      updateHeatmapCorrelationMatrixViewSource(manager, result.view.id);
      markHeatmapOverlayPending('toolbar-transform-correlation-source');
      scheduleHeatmapDrawForSession(getHeatmapSessionForHot(hot, { reason: 'toolbar-transform-correlation-source' }, { create: false }), {
        force: true,
        reason: 'toolbar-transform-correlation-source'
      });
    }
    activateHeatmapDataToolbar('transform-applied');
    debugLog('Debug: heatmap toolbar transform created view', {
      title: result?.view?.title || null,
      summary: result?.result?.summary || null
    });
    return true;
  }

  const HEATMAP_TOOLBAR_TRANSFORM_OPTION_MAP = Object.freeze({
    cpm: { spec: { type: 'cpm', orientation: 'column' }, title: 'CPM' },
    log2p1: { spec: { type: 'log', base: 2, pseudoCount: 1 }, title: 'log2(x+1)' },
    centerRowsMean: { spec: { type: 'centerRows', method: 'mean' }, title: 'Center rows (mean)' },
    centerRowsMedian: { spec: { type: 'centerRows', method: 'median' }, title: 'Center rows (median)' },
    centerColsMean: { spec: { type: 'centerColumns', method: 'mean' }, title: 'Center cols (mean)' },
    centerColsMedian: { spec: { type: 'centerColumns', method: 'median' }, title: 'Center cols (median)' },
    normalizeRows: { spec: { type: 'normalizeRows' }, title: 'Normalize rows (z)' },
    normalizeCols: { spec: { type: 'normalizeColumns' }, title: 'Normalize cols (z)' }
  });

  function promptHeatmapCustomExpression(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const expression = String(toolbarApi?.getCustomTransformExpression?.('heatmap') || '').trim();
    if(expression){
      return expression;
    }
    toolbarApi?.openCustomTransformEditor?.('heatmap');
    if(typeof global.alert === 'function'){
      global.alert('Enter a custom transformation formula using x, then click "Apply custom".');
    }
    return null;
  }

  function resolveHeatmapToolbarTransformOption(optionKey, customExpression){
    const key = String(optionKey || '').trim();
    if(!key){
      return null;
    }
    if(key === 'custom'){
      const normalized = String(customExpression || '').trim();
      if(!normalized){
        return null;
      }
      return {
        spec: { type: 'custom', expression: normalized },
        title: `Custom: ${normalized.slice(0, 24)}${normalized.length > 24 ? '...' : ''}`
      };
    }
    const preset = HEATMAP_TOOLBAR_TRANSFORM_OPTION_MAP[key];
    if(!preset){
      return null;
    }
    return {
      spec: Object.assign({}, preset.spec),
      title: preset.title
    };
  }

  function applyHeatmapToolbarTransformPipelineToNewView(transformSpecs, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureHeatmapDataViewsForHot(hot, {
      wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
      container: hot.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
    });
    if(!manager || typeof manager.applyPipeline !== 'function'){
      console.warn('heatmap data transform pipeline skipped: Shared.dataViews unavailable');
      return false;
    }
    const specs = Array.isArray(transformSpecs) ? transformSpecs.filter(Boolean) : [];
    if(!specs.length){
      return false;
    }
    const viewContext = resolveHeatmapViewContext(hot);
    const keepCorrelationActive = isHeatmapCorrelationMatrixDataView(viewContext.activeView);
    syncHeatmapActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyPipeline(specs, {
      title: options.title,
      sourceViewId: viewContext.sourceViewId || 'raw',
      activate: !keepCorrelationActive,
      reason: options.reason || 'toolbar-transform-pipeline',
      transformOptions: Object.assign({}, HEATMAP_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: heatmap toolbar transform pipeline failed', {
        message,
        stepCount: specs.length
      });
      return false;
    }
    if(keepCorrelationActive && result?.view?.id){
      updateHeatmapCorrelationMatrixViewSource(manager, result.view.id);
      markHeatmapOverlayPending('toolbar-transform-pipeline-correlation-source');
      scheduleHeatmapDrawForSession(getHeatmapSessionForHot(hot, { reason: 'toolbar-transform-pipeline-correlation-source' }, { create: false }), {
        force: true,
        reason: 'toolbar-transform-pipeline-correlation-source'
      });
    }
    activateHeatmapDataToolbar('transform-pipeline-applied');
    debugLog('Debug: heatmap toolbar transform pipeline created view', {
      title: result?.view?.title || null,
      stepCount: Array.isArray(result?.result?.steps) ? result.result.steps.length : specs.length
    });
    return true;
  }

  function applyHeatmapToolbarSelectedTransforms(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const selected = toolbarApi?.getSelectedTransforms?.('heatmap') || [];
    if(!Array.isArray(selected) || !selected.length){
      return false;
    }
    const resolved = [];
    for(let i = 0; i < selected.length; i += 1){
      const optionKey = selected[i];
      if(optionKey === 'custom'){
        const customExpression = promptHeatmapCustomExpression();
        if(!customExpression){
          return false;
        }
        const customTransform = resolveHeatmapToolbarTransformOption('custom', customExpression);
        if(customTransform){
          resolved.push(customTransform);
        }
        continue;
      }
      const next = resolveHeatmapToolbarTransformOption(optionKey);
      if(next){
        resolved.push(next);
      }
    }
    if(!resolved.length){
      return false;
    }
    const ok = resolved.length === 1
      ? applyHeatmapToolbarTransformToNewView(resolved[0].spec, {
        title: resolved[0].title,
        reason: 'toolbar-transform-multi-single'
      })
      : applyHeatmapToolbarTransformPipelineToNewView(
        resolved.map(item => item.spec),
        { reason: 'toolbar-transform-multi' }
      );
    if(ok){
      toolbarApi?.clearSelectedTransforms?.('heatmap');
    }
    return ok;
  }

  function bindHeatmapDataToolbar(){
    if(heatmapDataToolbarBound || !global.document){
      return;
    }
    global.document.addEventListener('click', event => {
      const closeButton = event.target?.closest?.('#heatmapHotWrapper .data-view-tabs__close[data-view-id]');
      if(closeButton){
        activateHeatmapDataToolbar('data-tab-close');
        return;
      }
      const button = event.target?.closest?.(
        '#heatmapTransformApplySelected, #heatmapTransformCustomApply, #heatmapTransformCpm, #heatmapTransformLog2p1, #heatmapTransformCenterRowsMean, #heatmapTransformCenterRowsMedian, #heatmapTransformCenterColsMean, #heatmapTransformCenterColsMedian, #heatmapTransformNormalizeRows, #heatmapTransformNormalizeCols, #heatmapTransformCustom'
      );
      if(!button){
        return;
      }
      const transformSection = button.closest?.('.workspace-toolbar__section[data-transform-section="1"]');
      if(button.id === 'heatmapTransformApplySelected'){
        applyHeatmapToolbarSelectedTransforms();
        return;
      }
      if(button.id === 'heatmapTransformCustomApply'){
        const customExpression = promptHeatmapCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveHeatmapToolbarTransformOption('custom', customExpression);
        if(!customTransform){
          return;
        }
        if(transformSection?.dataset?.transformMultiMode === '1'){
          const selected = Shared.workspaceToolbar?.getSelectedTransforms?.('heatmap') || [];
          if(Array.isArray(selected) && selected.includes('custom')){
            applyHeatmapToolbarSelectedTransforms();
          }else{
            applyHeatmapToolbarTransformToNewView(customTransform.spec, { title: customTransform.title });
          }
          return;
        }
        applyHeatmapToolbarTransformToNewView(customTransform.spec, { title: customTransform.title });
        return;
      }
      if(!transformSection){
        return;
      }
      if(transformSection?.dataset?.transformMultiMode === '1'){
        return;
      }
      const optionKey = String(button.dataset?.transformOption || '').trim();
      if(!optionKey){
        return;
      }
      if(optionKey === 'custom'){
        const customExpression = promptHeatmapCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveHeatmapToolbarTransformOption(optionKey, customExpression);
        if(customTransform){
          applyHeatmapToolbarTransformToNewView(customTransform.spec, { title: customTransform.title });
        }
        return;
      }
      const resolved = resolveHeatmapToolbarTransformOption(optionKey);
      if(resolved){
        applyHeatmapToolbarTransformToNewView(resolved.spec, { title: resolved.title });
      }
    }, true);
    const wrapper = getHeatmapNodeById('heatmapHotWrapper');
    if(wrapper && !wrapper.__heatmapDataToolbarFocusBound){
      wrapper.addEventListener('mousedown', () => {
        activateHeatmapDataToolbar('table-mousedown');
      }, true);
      wrapper.__heatmapDataToolbarFocusBound = true;
    }
    heatmapDataToolbarBound = true;
  }

  function recordHeatmapChange(label, previous, next, apply){
    if(!heatmapUndoManager || typeof heatmapUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    const recorder = Shared.styleUndo?.recordStateChange || (opts => heatmapUndoManager.recordStateChange(opts));
    recorder({
      manager: heatmapUndoManager,
      label,
      scope: 'heatmapGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  function deriveHeatmapExportFileName(){
    const baseName = typeof state.fileName === 'string' ? state.fileName.trim() : '';
    const sanitized = baseName.replace(/\.graph$/i, '');
    return sanitized || 'correlation-heatmap';
  }

  function refreshHeatmapExportControls(){
    if(!Shared.exporter || typeof Shared.exporter.mountSvgControls !== 'function'){
      return;
    }
    const exportFileName = deriveHeatmapExportFileName();
    Shared.exporter.mountSvgControls({
      container: '#heatmapExportControls',
      svgSelector: '#heatmapSvg',
      getSvg: () => heatmap.getExportSvg?.() || state.svg || $('heatmapSvg'),
      getHybridSvg: () => state.svg || $('heatmapSvg'),
      fileName: exportFileName,
      contextLabel: 'heatmap-export',
      hybridOptions: {
        label: 'SVG (matrix as PNG)',
        fileNameSuffix: '-light',
        layers: [
          {
            selector: '[data-export-layer="heatmap-cells"]',
            label: 'heatmap-cells',
            padding: 2,
            scale: 4
          }
        ]
      }
    });
    debugLog('Debug: heatmap export controls configured', { fileName: exportFileName });
  }

  function setHeatmapFileHandle(handle, session = null){
    const owner = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(owner){
      owner.managers.fileHandle = handle || null;
      owner.updatedAt = Date.now();
    }
    if(!owner || isHeatmapSessionActiveForModuleState(owner)){
      state.fileHandle = handle || null;
    }
  }

  function setHeatmapFileName(name, options = {}){
    const trimmed = typeof name === 'string' ? name.trim() : '';
    const normalized = trimmed || 'correlation-heatmap.graph';
    const owner = ensureHeatmapSessionOwnershipShape(options.session || getActiveHeatmapSessionForState());
    const shouldMirror = !owner || isHeatmapSessionActiveForModuleState(owner);
    if(!options.force && shouldMirror && state.fileName === normalized){
      return;
    }
    if(owner){
      owner.state.fileName = normalized;
      owner.updatedAt = Date.now();
    }
    if(shouldMirror){
      state.fileName = normalized;
    }
    if(shouldMirror && !options.skipExportRefresh){
      refreshHeatmapExportControls();
    }
  }

  const refs = {};
  const HEATMAP_CONTROL_REF_IDS = Object.freeze({
    view: 'heatmapView',
    method: 'heatmapMethod',
    absValues: 'heatmapAbsValues',
    maskLower: 'heatmapMaskLower',
    showValues: 'heatmapShowValues',
    showSignificance: 'heatmapShowSignificance',
    significanceDisplay: 'heatmapSignificanceDisplay',
    decimals: 'heatmapDecimals',
    colorNegative: 'heatmapColorNegative',
    colorZero: 'heatmapColorZero',
    colorPositive: 'heatmapColorPositive',
    cellSize: 'heatmapCellSize',
    cellSizeVal: 'heatmapCellSizeVal',
    fontSize: 'heatmapFontSize',
    fontSizeVal: 'heatmapFontSizeVal',
    filterPresentEnable: 'heatmapFilterPresentEnable',
    filterPresentValue: 'heatmapFilterPresentValue',
    filterSdEnable: 'heatmapFilterSdEnable',
    filterSdValue: 'heatmapFilterSdValue',
    filterAbsEnable: 'heatmapFilterAbsEnable',
    filterAbsCount: 'heatmapFilterAbsCount',
    filterAbsValue: 'heatmapFilterAbsValue',
    filterRangeEnable: 'heatmapFilterRangeEnable',
    filterRangeValue: 'heatmapFilterRangeValue',
    logTransform: 'heatmapLogTransform',
    centerGenes: 'heatmapCenterGenes',
    centerArrays: 'heatmapCenterArrays',
    normalizeGenes: 'heatmapNormalizeGenes',
    normalizeArrays: 'heatmapNormalizeArrays',
    clusterGenes: 'heatmapClusterGenes',
    clusterArrays: 'heatmapClusterArrays',
    genesMetric: 'heatmapGenesMetric',
    arraysMetric: 'heatmapArraysMetric',
    linkage: 'heatmapLinkage',
    showRowDendrogram: 'heatmapShowRowDendrogram',
    showColumnDendrogram: 'heatmapShowColumnDendrogram'
  });

  function resolveHeatmapOwnedDomNode(value){
    if(!value){ return null; }
    if(typeof value.nodeType === 'number'){
      return value;
    }
    const ownedRoot = value?.root || null;
    return ownedRoot && typeof ownedRoot.nodeType === 'number' ? ownedRoot : null;
  }

  function heatmapNodeBelongsToRoot(value, root){
    const node = resolveHeatmapOwnedDomNode(value);
    if(!node || !root || typeof root.nodeType !== 'number'){
      return false;
    }
    if(node === root){ return true; }
    if(typeof root.contains !== 'function'){
      return false;
    }
    return root.contains(node);
  }

  function resolveHeatmapControlRefs(root, source = null){
    const controls = {};
    for(const [key, id] of Object.entries(HEATMAP_CONTROL_REF_IDS)){
      const owned = source?.[key] || null;
      controls[key] = heatmapNodeBelongsToRoot(owned, root)
        ? owned
        : (root?.querySelector?.(`#${id}`) || null);
    }
    return controls;
  }

  function replaceHeatmapActiveControlRefs(source){
    Object.keys(refs).forEach(key => { delete refs[key]; });
    Object.assign(refs, source || {});
    return refs;
  }

  function bindHeatmapDomProjectionForSession(session, root, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session);
    const ownerRoot = root || shaped?.root || null;
    if(!shaped || !ownerRoot){ return false; }
    state.root = ownerRoot;
    shaped.root = ownerRoot;
    replaceHeatmapActiveControlRefs(resolveHeatmapControlRefs(ownerRoot, shaped.refs?.controls));
    state.svg = ownerRoot.querySelector?.('#heatmapSvg') || null;
    state.svgBox = state.svg?.closest?.('.svgbox') || ownerRoot.querySelector?.('#heatmapGraphPanel .svgbox') || null;
    state.statsEl = ownerRoot.querySelector?.('#heatmapStatsContent') || null;
    state.emptyPlotNoticeEl = heatmapNodeBelongsToRoot(shaped.refs?.emptyPlotNoticeEl, ownerRoot)
      ? shaped.refs.emptyPlotNoticeEl
      : null;
    notesState.control = heatmapNodeBelongsToRoot(shaped.refs?.notesControl, ownerRoot)
      ? shaped.refs.notesControl
      : null;
    if(state.svg?.dataset){
      state.svg.dataset.fontScope = 'heatmap';
      state.svg.dataset.fontTabId = shaped.tabId;
      state.svg.dataset.workspaceTabId = shaped.tabId;
    }
    if(shaped.managers?.hot && heatmapHotBelongsToSession(shaped.managers.hot, shaped)){
      state.hot = shaped.managers.hot;
    }else if(state.hot && !heatmapHotBelongsToSession(state.hot, shaped)){
      state.hot = null;
    }
    const layoutRoot = shaped.managers?.layout?.elements?.svgBox || null;
    if(layoutRoot && heatmapNodeBelongsToRoot(layoutRoot, ownerRoot)){
      state.layout = shaped.managers.layout;
      state.svgBox = layoutRoot;
    }else if(state.layout?.elements?.svgBox && !heatmapNodeBelongsToRoot(state.layout.elements.svgBox, ownerRoot)){
      state.layout = null;
    }
    shaped.refs.root = ownerRoot;
    shaped.refs.svg = state.svg;
    shaped.refs.svgBox = state.svgBox;
    shaped.refs.statsEl = state.statsEl;
    shaped.refs.emptyPlotNoticeEl = state.emptyPlotNoticeEl;
    shaped.refs.controls = resolveHeatmapControlRefs(ownerRoot, refs);
    shaped.refs.notesControl = notesState.control;
    shaped.updatedAt = Date.now();
    if(options.syncUi === true){
      applyHeatmapSessionStateToActive(shaped, { syncUi: true, skipExportRefresh: true });
    }
    return true;
  }

  function ensureHeatmapStatsReportHost(){
    const reporting = Shared.statsReporting;
    if(!state.statsEl || !reporting || typeof reporting.ensureReportHost !== 'function'){
      return state.statsEl?.__statsReportHost || null;
    }
    return reporting.ensureReportHost(state.statsEl, {
      id: 'heatmapStatsReportHost',
      className: 'stats-report-host',
      attachToTarget: true,
      position: 'last'
    });
  }
  function clearHeatmapStatsReportHost(){
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.clearReportHost === 'function'){
      reporting.clearReportHost(state.statsEl);
    }
  }

  function normalizeHeatmapStatsPanelModel(source = {}){
    if(Shared.statsReporting && typeof Shared.statsReporting.normalizeSavedPanelModel === 'function'){
      return Shared.statsReporting.normalizeSavedPanelModel(source);
    }
    const src = source && typeof source === 'object' ? source : {};
    return { resultsModel: cloneSimple(src.resultsModel) || null, reportModel: cloneSimple(src.reportModel) || null };
  }

  function captureHeatmapStatsPanelModel(fallback = null, session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const previous = normalizeHeatmapStatsPanelModel(fallback || shaped?.results?.statsPanelModel || state.statsPanelModel || {});
    let normalized = previous;
    if(state.statsEl && Shared.statsReporting && typeof Shared.statsReporting.capturePanelModel === 'function'){
      normalized = normalizeHeatmapStatsPanelModel(Shared.statsReporting.capturePanelModel(state.statsEl) || previous);
    }
    syncHeatmapResultsMirror({
      stats: shaped?.results?.stats || state.lastStats || null,
      statsPanelModel: normalized
    }, shaped || null);
    return normalized;
  }

  function heatmapStatsPanelModelHasContent(model){
    const normalized = normalizeHeatmapStatsPanelModel(model);
    return !!(normalized.resultsModel || normalized.reportModel);
  }

  function restoreHeatmapStatsPanelModel(model, session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const normalized = normalizeHeatmapStatsPanelModel(model);
    syncHeatmapResultsMirror({
      stats: shaped?.results?.stats || state.lastStats || null,
      statsPanelModel: normalized
    }, shaped || null);
    if(!state.statsEl || !heatmapStatsPanelModelHasContent(normalized) || !Shared.statsReporting || typeof Shared.statsReporting.restorePanelModel !== 'function'){
      return false;
    }
    const reportHost = ensureHeatmapStatsReportHost();
    Shared.statsReporting.restorePanelModel(state.statsEl, normalized, {
      ensureReportHost: reportHost ? () => reportHost : undefined,
      clearMainWhenMissing: false
    });
    return true;
  }

  let scheduleDrawHeatmapRaw = () => {};
  let hiddenDrawFlushHandle = null;

  function clearCachedRenderState(session = null){
    updateHeatmapRenderRuntime(session || getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), runtime => {
      runtime.lastRenderModel = null;
      runtime.lastViewOptions = null;
      runtime.textAspectMetrics = null;
      runtime.labelProjection = null;
      runtime.lastResolvedValueScale = null;
    }, { seedFromActive: true });
    updateHeatmapResultsState(session || getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), results => {
      results.stats = null;
    });
    debugLog('Debug: heatmap cached render cleared');
  }

  function invalidateHeatmapTransientRenderState(reason){
    clearHiddenDrawFlushHandle();
    updateHeatmapDrawRuntime(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), runtime => {
      runtime.pendingDrawOptions = {};
      runtime.deferredHiddenDrawOptions = null;
      runtime.token = (Number(runtime.token) || 0) + 1;
    }, { seedFromActive: true });
    clearCachedRenderState();
    debugLog('Debug: heatmap transient render state invalidated', {
      reason: reason || 'unknown',
      drawToken: state.drawToken
    });
  }

  function invalidateHeatmapViewFamilyRenderState(session = null, reason = 'heatmap-view-family-change'){
    const targetSession = session || getActiveHeatmapSessionForState();
    clearHiddenDrawFlushHandle();
    updateHeatmapDrawRuntime(targetSession, runtime => {
      runtime.pendingDrawOptions = {};
      runtime.deferredHiddenDrawOptions = null;
      runtime.token = (Number(runtime.token) || 0) + 1;
    }, { seedFromActive: true });
    updateHeatmapRenderRuntime(targetSession, runtime => {
      runtime.lastRenderModel = null;
      runtime.lastViewOptions = null;
      runtime.textAspectMetrics = null;
      runtime.labelProjection = null;
      runtime.lastResolvedValueScale = null;
      runtime.settingsSignature = null;
    }, { seedFromActive: true });
    updateHeatmapResultsState(targetSession, results => {
      results.stats = null;
    });
    debugLog('Debug: heatmap view-family render state invalidated', {
      reason,
      tabId: targetSession?.tabId || null
    });
  }


  function captureHeatmapRenderStateSnapshot(session = null){
    const requested = ensureHeatmapSessionOwnershipShape(session || getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }));
    const activeOwner = !!requested && isHeatmapSessionActiveForModuleState(requested);
    const shaped = activeOwner
      ? captureHeatmapSessionStateFromActive(requested, { reason: 'heatmap-render-state-capture' })
      : requested;
    const renderRuntime = shaped?.cache?.renderRuntime || createDefaultHeatmapRenderRuntime({
      lastRenderModel: null,
      lastViewOptions: activeOwner ? state.lastViewOptions : null,
      textAspectMetrics: activeOwner ? state.textAspectMetrics : null,
      labelProjection: activeOwner ? state.svg?.__heatmapLabelProjection || null : null,
      lastResolvedValueScale: activeOwner ? state.lastResolvedValueScale : null,
      lastDataShape: activeOwner ? state.lastDataShape : { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: activeOwner ? state.lastAutoDrawEvaluation : null
    });
    return {
      lastRenderModel: cloneSimple(renderRuntime.lastRenderModel),
      lastViewOptions: cloneSimple(renderRuntime.lastViewOptions),
      lastStats: cloneSimple(shaped?.results?.stats || null),
      statsPanelModel: normalizeHeatmapStatsPanelModel(
        shaped?.results?.statsPanelModel || (activeOwner ? captureHeatmapStatsPanelModel() : {})
      ),
      textAspectMetrics: cloneSimple(renderRuntime.textAspectMetrics),
      labelProjection: cloneSimple(renderRuntime.labelProjection),
      lastResolvedValueScale: cloneSimple(renderRuntime.lastResolvedValueScale),
      lastDataShape: cloneSimple(renderRuntime.lastDataShape),
      lastAutoDrawEvaluation: cloneSimple(renderRuntime.lastAutoDrawEvaluation),
      dataSignature: typeof renderRuntime.dataSignature === 'string' ? renderRuntime.dataSignature : null,
      settingsSignature: typeof renderRuntime.settingsSignature === 'string' ? renderRuntime.settingsSignature : null
    };
  }

  function restoreHeatmapRenderStateSnapshot(snapshot, session = null){
    const source = snapshot && typeof snapshot === 'object' ? snapshot : null;
    const ownerSession = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(!source || !ownerSession){
      clearCachedRenderState(ownerSession || null);
      return false;
    }
    updateHeatmapRenderRuntime(ownerSession, runtime => {
      runtime.lastRenderModel = cloneSimple(source.lastRenderModel) || null;
      runtime.lastViewOptions = cloneSimple(source.lastViewOptions) || null;
      runtime.textAspectMetrics = cloneSimple(source.textAspectMetrics) || null;
      runtime.labelProjection = cloneSimple(source.labelProjection) || null;
      runtime.lastResolvedValueScale = cloneSimple(source.lastResolvedValueScale) || null;
      runtime.lastDataShape = cloneSimple(source.lastDataShape) || { rows: 0, cols: 0 };
      runtime.lastAutoDrawEvaluation = cloneSimple(source.lastAutoDrawEvaluation) || null;
      runtime.dataSignature = typeof source.dataSignature === 'string' ? source.dataSignature : null;
      runtime.settingsSignature = typeof source.settingsSignature === 'string' ? source.settingsSignature : null;
    }, { seedFromActive: true });
    updateHeatmapResultsState(ownerSession, results => {
      results.stats = cloneSimple(source.lastStats) || null;
      results.statsPanelModel = normalizeHeatmapStatsPanelModel(source.statsPanelModel || {});
    });
    if(isHeatmapSessionActiveForModuleState(ownerSession)){
      applyHeatmapSessionStateToActive(ownerSession, { syncUi: false, skipExportRefresh: true });
    }
    debugLog('Debug: heatmap render state restored', {
      tabId: ownerSession.tabId || null,
      hasModel: !!getHeatmapActiveRenderModel(ownerSession),
      hasViewOptions: !!state.lastViewOptions,
      hasStats: !!state.lastStats,
      hasTextAspectMetrics: !!state.textAspectMetrics,
      hasLabelProjection: !!source.labelProjection
    });
    return true;
  }




  function normalizeDrawOptions(options){
    if(!options){
      return {};
    }
    if(typeof options === 'string'){
      return { reason: options };
    }
    if(typeof options === 'object'){
      return sanitizeHeatmapDrawOptions(options);
    }
    return {};
  }

  function mergePendingDrawOptions(opts){
    const normalizedOpts = opts && typeof opts === 'object' ? sanitizeHeatmapDrawOptions(opts) : {};
    const targetSession = getHeatmapSession(normalizedOpts.tabId || getHeatmapProjectionTabId() || null, {
      tabId: normalizedOpts.tabId || getHeatmapProjectionTabId() || null,
      reason: 'heatmap-pending-draw-options'
    }, { create: true }) || getActiveHeatmapSessionForState();
    const runtime = getHeatmapDrawRuntime(targetSession, { seedFromActive: !targetSession });
    const previous = cloneSimple(runtime?.pendingDrawOptions || null) || {};
    if(!opts || typeof opts !== 'object'){
      const nextFallback = Object.keys(previous).length
        ? { ...previous, viewOnly: false }
        : { viewOnly: false };
      updateHeatmapDrawRuntime(targetSession, drawRuntime => {
        drawRuntime.pendingDrawOptions = sanitizeHeatmapDrawOptions(nextFallback);
      });
      return nextFallback;
    }
    const next = { ...previous, ...normalizedOpts };
    if(normalizedOpts.force){
      next.viewOnly = false;
    }else if(Object.prototype.hasOwnProperty.call(normalizedOpts, 'viewOnly')){
      const requestedViewOnly = !!normalizedOpts.viewOnly;
      // A queued full redraw must never be downgraded by a later view-only request
      // (e.g. resize/aspect callbacks racing with control-driven model switches).
      if(requestedViewOnly && previous.viewOnly === false){
        next.viewOnly = false;
      }else{
        next.viewOnly = requestedViewOnly;
      }
    }else{
      next.viewOnly = false;
    }
    if(!Object.prototype.hasOwnProperty.call(normalizedOpts, 'reason') && next.viewOnly && previous.reason){
      next.reason = previous.reason;
    }
    updateHeatmapDrawRuntime(targetSession, drawRuntime => {
      drawRuntime.pendingDrawOptions = sanitizeHeatmapDrawOptions(next);
    });
    return next;
  }

  function isHeatmapWorkspaceHidden(){
    const page = getHeatmapNodeById('heatmapPage')
      || state.svg?.closest?.('.workspace-page')
      || null;
    if(!page){
      return false;
    }
    if(page.hidden === true){
      return true;
    }
    if(typeof page.getAttribute === 'function' && page.getAttribute('hidden') !== null){
      return true;
    }
    try{
      const style = typeof global.getComputedStyle === 'function'
        ? global.getComputedStyle(page)
        : null;
      if(style && (style.display === 'none' || style.visibility === 'hidden')){
        return true;
      }
    }catch(err){
      console.error('heatmap workspace visibility check error', err);
    }
    return false;
  }

  function mergeDeferredHiddenDrawOptions(options){
    const opts = normalizeDrawOptions(options);
    const normalizedOpts = opts && typeof opts === 'object' ? sanitizeHeatmapDrawOptions(opts) : {};
    const targetSession = getHeatmapSession(normalizedOpts.tabId || getHeatmapProjectionTabId() || null, {
      tabId: normalizedOpts.tabId || getHeatmapProjectionTabId() || null,
      reason: 'heatmap-deferred-hidden-draw-options'
    }, { create: true }) || getActiveHeatmapSessionForState();
    const runtime = getHeatmapDrawRuntime(targetSession, { seedFromActive: !targetSession });
    const previous = cloneSimple(runtime?.deferredHiddenDrawOptions || null) || {};
    if(!opts || typeof opts !== 'object'){
      const nextFallback = previous && Object.keys(previous).length
        ? { ...previous, viewOnly: false }
        : { viewOnly: false };
      updateHeatmapDrawRuntime(targetSession, drawRuntime => {
        drawRuntime.deferredHiddenDrawOptions = sanitizeHeatmapDrawOptions(nextFallback);
      });
      return nextFallback;
    }
    const next = { ...previous, ...normalizedOpts };
    if(normalizedOpts.force){
      next.viewOnly = false;
    }else if(Object.prototype.hasOwnProperty.call(normalizedOpts, 'viewOnly')){
      const requestedViewOnly = !!normalizedOpts.viewOnly;
      if(requestedViewOnly && previous.viewOnly === false){
        next.viewOnly = false;
      }else{
        next.viewOnly = requestedViewOnly;
      }
    }else{
      next.viewOnly = false;
    }
    if(!Object.prototype.hasOwnProperty.call(normalizedOpts, 'reason') && previous.reason){
      next.reason = previous.reason;
    }
    updateHeatmapDrawRuntime(targetSession, drawRuntime => {
      drawRuntime.deferredHiddenDrawOptions = sanitizeHeatmapDrawOptions(next);
    });
    return next;
  }

  function clearHiddenDrawFlushHandle(session = null){
    const targetSession = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const runtime = getHeatmapDrawRuntime(targetSession, { seedFromActive: !targetSession });
    const handle = runtime?.hiddenDrawFlushHandle || ((!targetSession || isHeatmapSessionActiveForModuleState(targetSession)) ? hiddenDrawFlushHandle : null) || null;
    if(handle == null){
      return;
    }
    Shared.componentLifecycle?.cancelComponentFrame?.(heatmap, handle);
    if(!targetSession || isHeatmapSessionActiveForModuleState(targetSession)){
      hiddenDrawFlushHandle = null;
    }
    updateHeatmapDrawRuntime(targetSession || getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), drawRuntime => {
      drawRuntime.hiddenDrawFlushHandle = null;
    });
  }

  function scheduleDeferredHiddenDrawFlush(reason, session = null){
    const flushSession = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const drawOwner = flushSession || getActiveHeatmapSessionForState();
    const mirrorHandle = handle => {
      updateHeatmapDrawRuntime(drawOwner, runtime => {
        runtime.hiddenDrawFlushHandle = handle || null;
      });
      if(!drawOwner || isHeatmapSessionActiveForModuleState(drawOwner)){
        hiddenDrawFlushHandle = handle || null;
      }
    };
    clearHiddenDrawFlushHandle(drawOwner);
    const flush = () => {
      mirrorHandle(null);
      if(isHeatmapWorkspaceHidden()){
        debugLog('Debug: heatmap hidden draw flush deferred - still hidden', { reason: reason || 'visibility-flush' });
        return;
      }
      const flushRuntime = getHeatmapDrawRuntime(drawOwner, { seedFromActive: !drawOwner });
      const deferred = cloneSimple(flushRuntime?.deferredHiddenDrawOptions || null) || null;
      if(!deferred){
        return;
      }
      const pending = { ...deferred, tabId: deferred.tabId || drawOwner?.tabId || getHeatmapProjectionTabId() || null };
      updateHeatmapDrawRuntime(drawOwner, runtime => {
        runtime.deferredHiddenDrawOptions = null;
      });
      debugLog('Debug: heatmap hidden draw flush scheduled', {
        reason: reason || 'visibility-flush',
        pendingReason: pending.reason || null,
        viewOnly: !!pending.viewOnly,
        force: !!pending.force,
        tabId: pending.tabId || null
      });
      scheduleDrawHeatmap({
        ...pending,
        reason: pending.reason || reason || 'hidden-draw-flush'
      });
    };
    const firstHandle = scheduleHeatmapAsyncFrame(reason || 'hidden-draw-flush-first-frame', () => {
      const secondHandle = scheduleHeatmapAsyncFrame(reason || 'hidden-draw-flush-second-frame', flush);
      mirrorHandle(secondHandle);
    });
    mirrorHandle(firstHandle);
  }

  function updateHeatmapDataShape(shape){
    if(!shape || typeof shape !== 'object'){
      return;
    }
    const rows = Number(shape.rows);
    const cols = Number(shape.cols);
    const normalizedRows = Number.isFinite(rows) ? rows : state.lastDataShape.rows;
    const normalizedCols = Number.isFinite(cols) ? cols : state.lastDataShape.cols;
    if(normalizedRows === state.lastDataShape.rows && normalizedCols === state.lastDataShape.cols){
      return;
    }
    state.lastDataShape = { rows: normalizedRows, cols: normalizedCols };
    updateHeatmapRenderRuntime(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), runtime => {
      runtime.lastDataShape = cloneSimple(state.lastDataShape) || { rows: normalizedRows, cols: normalizedCols };
    }, { seedFromActive: true });
    debugLog('Debug: heatmap data shape updated', { rows: normalizedRows, cols: normalizedCols });
  }

  function evaluateHeatmapDataShape(meta = {}){
    const hot = state.hot;
    const perfStart = nowMs();
    let totalRows = Number(meta?.shape?.rows);
    let totalCols = Number(meta?.shape?.cols);
    let cellEstimate = 0;
    let thresholdExceeded = false;
    const finalize = (result, overrides = {}) => {
      const payload = {
        source: meta?.source || null,
        rows: overrides.rows ?? totalRows,
        cols: overrides.cols ?? totalCols,
        cellEstimate: overrides.cellEstimate ?? cellEstimate,
        thresholdExceeded: overrides.thresholdExceeded ?? thresholdExceeded,
        totalMs: nowMs() - perfStart
      };
      recordHeatmapPerformance('evaluation', payload);
      return result;
    };
    if(!hot){
      return finalize({ liveUpdateEnabled: true, reason: null, thresholdExceeded: false }, {
        rows: Number.isFinite(totalRows) ? totalRows : 0,
        cols: Number.isFinite(totalCols) ? totalCols : 0
      });
    }
    if(!Number.isFinite(totalRows) || totalRows < 0){
      if(typeof hot.countSourceRows === 'function'){
        totalRows = hot.countSourceRows();
      }else if(typeof hot.getSourceData === 'function'){
        const source = hot.getSourceData();
        totalRows = Array.isArray(source) ? source.length : 0;
      }else if(typeof hot.countRows === 'function'){
        totalRows = hot.countRows();
      }else{
        totalRows = state.lastDataShape.rows;
      }
    }
    if(!Number.isFinite(totalCols) || totalCols < 0){
      if(typeof hot.countSourceCols === 'function'){
        totalCols = hot.countSourceCols();
      }else if(typeof hot.getSourceData === 'function'){
        const source = hot.getSourceData();
        const firstRow = Array.isArray(source) && source.length ? source[0] : null;
        totalCols = Array.isArray(firstRow) ? firstRow.length : 0;
      }else if(typeof hot.countCols === 'function'){
        totalCols = hot.countCols();
      }else{
        totalCols = state.lastDataShape.cols;
      }
    }
    if(typeof Shared.hot?.estimateFilledShape === 'function'){
      const filled = Shared.hot.estimateFilledShape(hot);
      if(Number.isFinite(filled?.rows) && filled.rows >= 0 && filled.rows < totalRows){
        totalRows = filled.rows;
      }
      if(Number.isFinite(filled?.cols) && filled.cols >= 0 && filled.cols < totalCols){
        totalCols = filled.cols;
      }
    }
    cellEstimate = Math.max(0, totalRows) * Math.max(1, totalCols);
    thresholdExceeded = totalRows >= HEATMAP_AUTO_DRAW_ROW_THRESHOLD
      || totalCols >= HEATMAP_AUTO_DRAW_COL_THRESHOLD
      || cellEstimate >= HEATMAP_AUTO_DRAW_CELL_THRESHOLD;
    state.lastAutoDrawEvaluation = {
      totalRows,
      totalCols,
      cellEstimate,
      thresholdExceeded,
      totalMs: nowMs() - perfStart
    };
    updateHeatmapRenderRuntime(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), runtime => {
      runtime.lastAutoDrawEvaluation = cloneSimple(state.lastAutoDrawEvaluation) || null;
    }, { seedFromActive: true });
    updateHeatmapDataShape({ rows: totalRows, cols: totalCols });
    debugLog('Debug: heatmap draw evaluation', state.lastAutoDrawEvaluation);
    return finalize({
      liveUpdateEnabled: true,
      reason: thresholdExceeded ? 'threshold-exceeded' : null,
      thresholdExceeded
    });
  }

  function hasHeatmapBodyData(hot){
    if(!hot){
      return false;
    }
    const matrix = typeof hot.getSourceData === 'function'
      ? hot.getSourceData()
      : (typeof hot.getData === 'function' ? hot.getData() : null);
    if(!Array.isArray(matrix) || matrix.length < 2){
      return false;
    }
    for(let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1){
      const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
      for(let colIndex = 1; colIndex < row.length; colIndex += 1){
        if(!isHeatmapMatrixCellEmpty(row[colIndex])){
          return true;
        }
      }
    }
    return false;
  }

  function maybeApplyClusterDefaultsOnDataEntry(reason){
    const clusterState = getHeatmapClusterState();
    if(clusterState.suspendAutoClusterDefaults || clusterState.clusterControlsTouched || clusterState.clusterDefaultsAutoApplied){
      return false;
    }
    const hot = (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot;
    if(!hasHeatmapBodyData(hot)){
      return false;
    }
    if(!refs.clusterGenes || !refs.clusterArrays || !refs.showRowDendrogram || !refs.showColumnDendrogram){
      return false;
    }
    const needsUpdate = !refs.clusterGenes.checked
      || !refs.clusterArrays.checked
      || !refs.showRowDendrogram.checked
      || !refs.showColumnDendrogram.checked;
    updateHeatmapClusterState({ clusterDefaultsAutoApplied: true });
    if(!needsUpdate){
      return false;
    }
    refs.clusterGenes.checked = true;
    refs.clusterArrays.checked = true;
    refs.showRowDendrogram.checked = true;
    refs.showColumnDendrogram.checked = true;
    updateHeatmapClusterState({ suppressClusterTouchTracking: true });
    try{
      refs.clusterGenes.dispatchEvent(new Event('change'));
      refs.clusterArrays.dispatchEvent(new Event('change'));
    }finally{
      updateHeatmapClusterState({ suppressClusterTouchTracking: false });
    }
    debugLog('Debug: heatmap clustering defaults auto-enabled on data entry', { reason: reason || 'data-entry' });
    return true;
  }

  function scheduleDrawHeatmap(options){
    const opts = normalizeDrawOptions(options);
    const resolvedTabId = resolveHeatmapAsyncTabId(opts, state.hot);
    const scheduleOpts = sanitizeHeatmapDrawOptions(resolvedTabId ? { ...opts, tabId: resolvedTabId } : opts);
    const nextReason = scheduleOpts.reason || scheduleOpts.source || 'heatmap-draw';
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('heatmap', { ...scheduleOpts, tabId: scheduleOpts.tabId || null, reason: nextReason })){
      debugLog('Debug: heatmap draw suppressed by lifecycle', { reason: nextReason, tabId: scheduleOpts.tabId || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'heatmap', tabId: scheduleOpts.tabId || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'heatmap-scheduler' } });
      return;
    }
    Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'heatmap', tabId: scheduleOpts.tabId || null, action: 'draw-executed', reason: nextReason, details: { source: 'heatmap-scheduler' } });
    if(isHeatmapWorkspaceHidden()){
      const pending = mergeDeferredHiddenDrawOptions(scheduleOpts);
      debugLog('Debug: heatmap draw deferred while hidden', {
        reason: pending?.reason || scheduleOpts.reason || null,
        viewOnly: !!pending?.viewOnly,
        force: !!pending?.force
      });
      return;
    }
    mergePendingDrawOptions(scheduleOpts);
    if(scheduleOpts.viewOnly){
      if(typeof scheduleDrawHeatmapRaw === 'function'){
        scheduleDrawHeatmapRaw(scheduleOpts);
      }
      return;
    }
    if(scheduleOpts.force){
      if(!scheduleOpts.skipThresholdEvaluation){
        evaluateHeatmapDataShape({ source: scheduleOpts.reason || 'force' });
      }
      if(typeof scheduleDrawHeatmapRaw === 'function'){
        scheduleDrawHeatmapRaw(scheduleOpts);
      }
      return;
    }
    evaluateHeatmapDataShape({ source: scheduleOpts.reason || 'schedule' });
    if(typeof scheduleDrawHeatmapRaw === 'function'){
      scheduleDrawHeatmapRaw(scheduleOpts);
    }
  }

  state.scheduleDraw = (opts) => scheduleDrawHeatmap(opts);

  function attachHeatmapSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'heatmap');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    const contextLabel = label || 'heatmap';
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          debugLog('Debug: heatmap select auto-size watcher attached', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          debugLog('Debug: heatmap select auto-size applied without watcher', {
            id: select.id || null,
            label: contextLabel
          });
        }
      }else if(debugEnabled){
        debugLog('Debug: heatmap select auto-size helper unavailable', {
          id: select.id || null,
          label: contextLabel
        });
      }
    }catch(err){
      if(debugEnabled){
        debugLog('Debug: heatmap select auto-size attach error', {
          id: select.id || null,
          label: contextLabel,
          error: err?.message || String(err)
        });
      }
    }
  }

  const markFontEditable = (node, role, key, ownerTabId = null) => {
    if(!node){ return; }
    const tabId = ownerTabId
      || state.svg?.dataset?.fontTabId
      || getHeatmapProjectionTabId()
      || heatmap.__boundTabId
      || null;
    const payload = { role: role || null, key: key || role || null, tabId, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'heatmap', role, key, tabId });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'heatmap';
      if(tabId){ node.dataset.fontTabId = String(tabId); }
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(role && (role === 'cellValue' || role.includes('Tick'))){ return; }
    debugLog('Debug: heatmap font mark applied', payload); // Debug: font tagging summary
  };

  const resolveUniformHeatmapFontSize = (sizes, fallback) => {
    const values = Array.isArray(sizes) ? sizes : [];
    const first = Number(values[0] ?? fallback);
    if(!Number.isFinite(first)){ return null; }
    for(let index = 1; index < values.length; index += 1){
      const value = Number(values[index] ?? fallback);
      if(!Number.isFinite(value) || Math.abs(value - first) > 1e-9){
        return null;
      }
    }
    return first;
  };

  const markDenseHeatmapLabel = (node, role, key, ownerTabId = null) => {
    if(!node){ return; }
    const tabId = ownerTabId
      || state.svg?.dataset?.fontTabId
      || getHeatmapProjectionTabId()
      || heatmap.__boundTabId
      || null;
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, {
        scopeId: 'heatmap',
        role,
        key,
        tabId,
        compactContext: true,
        deferRegistration: true
      });
      return;
    }
    if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontKey = key || role || '';
    }
  };

  const markDenseHeatmapLabelGroup = (group, role, ownerTabId = null) => {
    if(!group){ return; }
    const tabId = ownerTabId
      || state.svg?.dataset?.fontTabId
      || getHeatmapProjectionTabId()
      || heatmap.__boundTabId
      || null;
    if(group.dataset){
      group.dataset.fontEditable = '1';
      group.dataset.fontScope = 'heatmap';
      group.dataset.fontRole = role;
      if(tabId){ group.dataset.fontTabId = String(tabId); }
    }
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(group, {
        scopeId: 'heatmap',
        key: '__graph__',
        tabId
      });
    }
  };


  function $(id){
    return getHeatmapNodeById(id);
  }

  function initHot(){
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('heatmap initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = seedHeatmapDefaultHeaderRow(Shared.createEmptyData ? Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS) : []);
    const createHeatmapTable = (container) => {
      let instance = null;
      instance = Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, scheduleMeta => {
        if(shouldSkipHeatmapHotSchedule(scheduleMeta)){
          return;
        }
        const tableDrawOptions = sanitizeHeatmapDrawOptions({
          ...(scheduleMeta && typeof scheduleMeta === 'object' ? scheduleMeta : {}),
          reason: scheduleMeta?.source || scheduleMeta?.reason || 'table-change'
        });
        scheduleHeatmapDrawForSession(getHeatmapSessionForHot(instance, tableDrawOptions, { create: false }), tableDrawOptions);
      }, {
        debugLabel: 'heatmap',
        data,
        pinFirstColumn: true,
        pinFirstRow: true,
        scheduleOnLoadData: true,
        hotOptions: {
          stretchH: 'all',
          minSpareRows: 5,
          afterChange(changes, source){
            if(changes){
              syncHeatmapActiveDataViewFromHot(instance, 'afterChange');
              const affectsAnalysis = instance?.changesAffectAnalysis?.(changes) !== false;
              if(source !== 'loadData' && affectsAnalysis){
                maybeApplyClusterDefaultsOnDataEntry(`after-change:${source || 'unknown'}`);
              }
            }
          },
          afterLoadData(){
            syncHeatmapActiveDataViewFromHot(instance, 'afterLoadData');
            maybeApplyClusterDefaultsOnDataEntry('after-load-data');
          },
          afterSelectionEnd(){
            activateHeatmapDataToolbar('table-selection');
          },
          afterCreateRow(){
            syncHeatmapActiveDataViewFromHot(instance, 'afterChange');
          },
          afterCreateCol(){
            syncHeatmapActiveDataViewFromHot(instance, 'afterChange');
          },
          afterRemoveRow(){
            syncHeatmapActiveDataViewFromHot(instance, 'afterChange');
          },
          afterRemoveCol(){
            syncHeatmapActiveDataViewFromHot(instance, 'afterChange');
          },
          afterUndo(){
          },
          afterRedo(){
          }
        }
      });
      if(instance){
        instance.__heatmapHostContainer = container || null;
      }
      return instance;
    };
    const patchHeatmapLoadDataPerformance = (hot) => {
      if(!hot || typeof hot.loadData !== 'function' || hot.__heatmapPerfPatched){
        return hot;
      }
      const originalLoadData = hot.loadData;
      hot.loadData = function patchedHeatmapLoadData(){
        const dataset = arguments[0];
        let rows = 0;
        let cols = 0;
        if(Array.isArray(dataset)){
          rows = dataset.length;
          cols = Array.isArray(dataset[0]) ? dataset[0].length : 0;
          updateHeatmapDataShape({ rows, cols });
        }
        const start = nowMs();
        const result = originalLoadData.apply(this, arguments);
        const afterLoad = nowMs();
        evaluateHeatmapDataShape(
          rows || cols
            ? { source: 'load-data', shape: { rows, cols } }
            : { source: 'load-data' }
        );
        const afterEvaluation = nowMs();
        recordHeatmapPerformance('loadData', {
          rows,
          cols,
          totalMs: afterEvaluation - start,
          hotMs: afterLoad - start,
          evaluationMs: afterEvaluation - afterLoad
        });
        return result;
      };
      hot.__heatmapPerfPatched = true;
      return hot;
    };
    const ensureHeatmapHotForActiveTab = () => {
      let wrapper = getHeatmapNodeById('heatmapHotWrapper');
      let baseContainer = getHeatmapNodeById('heatmapHot');
      if(!wrapper){
        wrapper = baseContainer?.parentNode || getHeatmapNodeById('heatmapPage') || global.document?.body || global.document?.documentElement;
      }
      if(!baseContainer){
        baseContainer = document.createElement('div');
        baseContainer.id = 'heatmapHot';
        if(wrapper && !wrapper.contains(baseContainer)){
          wrapper.appendChild(baseContainer);
        }
      }
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createHeatmapTable(baseContainer);
        }
        if(state.hot){
          const tableTabId = Shared.hot?.resolveTableTabId?.({
            type: 'heatmap',
            component: heatmap,
            wrapper,
            container: baseContainer,
            reason: 'heatmap-ensure-hot'
          }) || null;
          state.hot.__heatmapHostContainer = baseContainer || null;
          state.hot.__heatmapTabId = tableTabId;
          ensureHeatmapDefaultHeaderRow(state.hot);
          ensureHeatmapDataViewsForHot(state.hot, {
            wrapper,
            container: baseContainer
          });
          syncHeatmapActiveDataViewFromHot(state.hot, 'ensure-active-tab');
          global.__LAST_HEATMAP_HOT__ = state.hot;
          patchHeatmapLoadDataPerformance(state.hot);
        }
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'heatmap',
        tabId: Shared.hot.resolveTableTabId({
          type: 'heatmap',
          component: heatmap,
          wrapper,
          container: baseContainer,
          reason: 'heatmap-ensure-hot'
        }),
        wrapper,
        container: baseContainer,
        createInstance: createHeatmapTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
      }
      if(!state.hot && baseContainer){
        state.hot = createHeatmapTable(baseContainer);
      }
      if(state.hot){
        state.hot.__heatmapHostContainer = entry?.container || baseContainer || null;
        state.hot.__heatmapTabId = entry?.tabId || getHeatmapProjectionTabId() || null;
        ensureHeatmapDefaultHeaderRow(state.hot);
        ensureHeatmapDataViewsForHot(state.hot, {
          wrapper,
          container: entry?.container || baseContainer
        });
        syncHeatmapActiveDataViewFromHot(state.hot, 'ensure-active-tab');
        global.__LAST_HEATMAP_HOT__ = state.hot;
        patchHeatmapLoadDataPerformance(state.hot);
      }
      return state.hot;
    };
    state.hot = ensureHeatmapHotForActiveTab();
    state.ensureHotForActiveTab = ensureHeatmapHotForActiveTab;
  }

  function clampDecimals(value){
    const num = Number(value);
    if(!Number.isFinite(num)) return 2;
    return Math.min(6, Math.max(0, Math.round(num)));
  }

  function getHeatmapPValueFormatter(){
    return Shared.formatters?.formatPValue || Shared.formatPValue || null;
  }

  function formatHeatmapPValue(value){
    const formatter = getHeatmapPValueFormatter();
    const scientific = Shared.statsReporting?.getPValueFormatScientific?.({
      target: state.statsEl || $('heatmapStatsContent'),
      tabId: getHeatmapProjectionTabId() || null
    }) === true;
    if(typeof formatter === 'function'){
      return formatter(value, { scientific, forceScientific: scientific });
    }
    const num = Number(value);
    if(!Number.isFinite(num)){
      return 'n/a';
    }
    if(scientific) return num.toExponential(5);
    if(num >= 0 && num <= 0.0001){
      return '<0.0001';
    }
    return num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  function getHeatmapSignificanceThreshold(){
    const liveInput = queryHeatmapRoot('#heatmapStats .stats-significance-controls__input');
    if(liveInput){
      const liveThreshold = Number(liveInput.value);
      if(Number.isFinite(liveThreshold) && liveThreshold > 0 && liveThreshold < 1){
        return liveThreshold;
      }
    }
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.getSignificanceThreshold === 'function'){
      const threshold = Number(reporting.getSignificanceThreshold());
      if(Number.isFinite(threshold) && threshold > 0 && threshold < 1){
        return threshold;
      }
    }
    return 0.05;
  }

  function formatHeatmapThresholdLabel(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return '0.05';
    }
    if(numeric >= 0.01){
      return numeric.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    }
    return numeric.toExponential(2).replace('e+', 'e');
  }

  function bindHeatmapControlHandler(node, eventName, key, handler, options){
    if(!node || typeof node.addEventListener !== 'function'){
      return;
    }
    const registryKey = `${eventName}:${key || 'control'}`;
    if(!node.__heatmapControlHandlers){
      Object.defineProperty(node, '__heatmapControlHandlers', {
        value: Object.create(null),
        configurable: true
      });
    }
    const previous = node.__heatmapControlHandlers[registryKey];
    if(previous){
      node.removeEventListener(eventName, previous, options);
    }
    const wrapped = event => runHeatmapEventOwnerCallback(event, key || registryKey, owner => handler(event, owner));
    node.__heatmapControlHandlers[registryKey] = wrapped;
    node.addEventListener(eventName, wrapped, options);
  }

  function getCheckedRadioValue(name){
    const checked = queryHeatmapRoot(`input[name="${name}"]:checked`);
    if(checked){
      debugLog('Debug: heatmap radio value read', { name, value: checked.value });
      return checked.value;
    }
    debugLog('Debug: heatmap radio value missing', { name });
    return null;
  }

  function initControls(){
    refs.view = $('heatmapView');
    refs.method = $('heatmapMethod');
    refs.absValues = $('heatmapAbsValues');
    refs.maskLower = $('heatmapMaskLower');
    refs.showValues = $('heatmapShowValues');
    refs.showSignificance = $('heatmapShowSignificance');
    refs.significanceDisplay = $('heatmapSignificanceDisplay');
    refs.decimals = $('heatmapDecimals');
    refs.colorNegative = $('heatmapColorNegative');
    refs.colorZero = $('heatmapColorZero');
    refs.colorPositive = $('heatmapColorPositive');
    refs.cellSize = $('heatmapCellSize');
    refs.cellSizeVal = $('heatmapCellSizeVal');
    refs.fontSize = $('heatmapFontSize');
    refs.fontSizeVal = $('heatmapFontSizeVal');
    refs.filterPresentEnable = $('heatmapFilterPresentEnable');
    refs.filterPresentValue = $('heatmapFilterPresentValue');
    refs.filterSdEnable = $('heatmapFilterSdEnable');
    refs.filterSdValue = $('heatmapFilterSdValue');
    refs.filterAbsEnable = $('heatmapFilterAbsEnable');
    refs.filterAbsCount = $('heatmapFilterAbsCount');
    refs.filterAbsValue = $('heatmapFilterAbsValue');
    refs.filterRangeEnable = $('heatmapFilterRangeEnable');
    refs.filterRangeValue = $('heatmapFilterRangeValue');
    refs.logTransform = $('heatmapLogTransform');
    refs.centerGenes = $('heatmapCenterGenes');
    refs.centerArrays = $('heatmapCenterArrays');
    refs.normalizeGenes = $('heatmapNormalizeGenes');
    refs.normalizeArrays = $('heatmapNormalizeArrays');
    refs.clusterGenes = $('heatmapClusterGenes');
    refs.clusterArrays = $('heatmapClusterArrays');
    refs.genesMetric = $('heatmapGenesMetric');
    refs.arraysMetric = $('heatmapArraysMetric');
    refs.linkage = $('heatmapLinkage');
    const heatmapAutoSizeTargets=[
      refs.view,
      refs.method,
      refs.significanceDisplay,
      refs.genesMetric,
      refs.arraysMetric,
      refs.linkage
    ];
    heatmapAutoSizeTargets.filter(Boolean).forEach(select=>{
      attachHeatmapSelectAutoSize(select, 'heatmap');
    });
    refs.showRowDendrogram = $('heatmapShowRowDendrogram');
    refs.showColumnDendrogram = $('heatmapShowColumnDendrogram');
    state.statsEl = $('heatmapStatsContent');
    ensureHeatmapStatsReportHost();

    if(refs.cellSizeVal && refs.cellSize){
      refs.cellSizeVal.textContent = refs.cellSize.value;
    }
    if(refs.fontSize?.dataset){
      refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      debugLog('Debug: heatmap font size base initialized', { value: refs.fontSize.value });
    }
    chartStyle.renderFontSizeLabel({
      element: refs.fontSizeVal,
      pt: Number(refs.fontSize?.value || DEFAULT_HEATMAP_FONT_SIZE_PT),
      input: refs.fontSize,
      manual: true
    });
    state.palette = normalizeHeatmapPalette({
      negative: refs.colorNegative?.value,
      zero: refs.colorZero?.value,
      positive: refs.colorPositive?.value
    });
    state.valueScale = normalizeHeatmapValueScale(state.valueScale);
    state.legendHeightMode = normalizeHeatmapLegendHeightMode(state.legendHeightMode);
    syncHeatmapPaletteInputs(resolveHeatmapRoot());

    const syncControlsBeforeSchedule = () => {
      syncHeatmapControlStateToSession(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), captureHeatmapControlStateFromDom());
    };
    const schedule = () => {
      if(state.suspendControlSchedule){
        return;
      }
      syncControlsBeforeSchedule();
      scheduleActiveHeatmapDraw({ viewOnly: false, reason: 'user-control-change', userInitiated: true });
    };
    const scheduleViewOnly = reason => {
      if(state.suspendControlSchedule){
        return;
      }
      syncControlsBeforeSchedule();
      scheduleActiveHeatmapDraw({ viewOnly: true, reason: reason || 'user-view-only-change', userInitiated: true });
    };
    const materialize = reason => {
      syncControlsBeforeSchedule();
      return materializeHeatmapSelectionToDataView(reason);
    };

    const syncCorrelationClusteringControls = (view) => {
      if(view === 'corr-columns'){
        if(refs.clusterArrays && refs.clusterGenes){
          refs.clusterGenes.checked = !!refs.clusterArrays.checked;
        }
        if(refs.arraysMetric && refs.genesMetric){
          refs.genesMetric.value = refs.arraysMetric.value || refs.genesMetric.value;
        }
      }else if(view === 'corr-rows'){
        if(refs.clusterGenes && refs.clusterArrays){
          refs.clusterArrays.checked = !!refs.clusterGenes.checked;
        }
        if(refs.genesMetric && refs.arraysMetric){
          refs.arraysMetric.value = refs.genesMetric.value || refs.arraysMetric.value;
        }
      }
    };

    const updateViewControlState = () => {
      const view = refs.view?.value || 'corr-columns';
      const isCorrelation = view.startsWith('corr');
      const isCorrelationColumns = view === 'corr-columns';
      const isCorrelationRows = view === 'corr-rows';
      const previousViewState = typeof refs.view?.dataset?.heatmapLastView === 'string'
        ? refs.view.dataset.heatmapLastView
        : null;
      const previousWasCorrelation = previousViewState ? previousViewState.startsWith('corr') : null;
      const enteringDataValues = !isCorrelation && previousWasCorrelation !== false;
      syncCorrelationClusteringControls(view);
      const correlationOnlyRows = resolveHeatmapRoot()?.querySelectorAll?.('.heatmap-correlation-only') || [];
      correlationOnlyRows.forEach(row => {
        if(row){
          row.hidden = !isCorrelation;
        }
      });
      if(refs.method){
        refs.method.disabled = !isCorrelation;
      }
      if(refs.absValues){
        refs.absValues.disabled = !isCorrelation;
        if(!isCorrelation){
          refs.absValues.checked = false;
        }
      }
      if(refs.maskLower){
        refs.maskLower.disabled = !isCorrelation;
        if(!isCorrelation){
          refs.maskLower.checked = false;
        }
      }
      if(refs.showValues){
        refs.showValues.disabled = false;
      }
      const significanceEnabled = !!refs.showSignificance?.checked;
      if(refs.showSignificance){
        refs.showSignificance.disabled = !isCorrelation;
      }
      if(refs.significanceDisplay){
        refs.significanceDisplay.disabled = !isCorrelation || !significanceEnabled || !!refs.showValues?.checked;
      }

      const clusterRowsGroup = refs.clusterGenes?.closest?.('.heatmap-subgroup') || null;
      const clusterColumnsGroup = refs.clusterArrays?.closest?.('.heatmap-subgroup') || null;
      const rowDendrogramLabel = refs.showRowDendrogram?.closest?.('label') || null;
      const columnDendrogramLabel = refs.showColumnDendrogram?.closest?.('label') || null;
      const hideRowClustering = isCorrelationColumns;
      const hideColumnClustering = isCorrelationRows;
      const hideRowDendrogram = isCorrelationColumns;
      const hideColumnDendrogram = isCorrelationRows;

      if(clusterRowsGroup){
        clusterRowsGroup.hidden = hideRowClustering;
      }
      if(clusterColumnsGroup){
        clusterColumnsGroup.hidden = hideColumnClustering;
      }
      if(rowDendrogramLabel){
        rowDendrogramLabel.hidden = hideRowDendrogram;
      }
      if(columnDendrogramLabel){
        columnDendrogramLabel.hidden = hideColumnDendrogram;
      }

      if(refs.clusterGenes){
        refs.clusterGenes.disabled = hideRowClustering;
      }
      if(refs.genesMetric){
        refs.genesMetric.disabled = hideRowClustering || !refs.clusterGenes?.checked;
      }
      if(refs.showRowDendrogram){
        refs.showRowDendrogram.disabled = hideRowDendrogram || !refs.clusterGenes?.checked;
      }

      if(refs.clusterArrays){
        refs.clusterArrays.disabled = hideColumnClustering;
      }
      if(refs.arraysMetric){
        refs.arraysMetric.disabled = hideColumnClustering || !refs.clusterArrays?.checked;
      }
      if(refs.showColumnDendrogram){
        refs.showColumnDendrogram.disabled = hideColumnDendrogram || !refs.clusterArrays?.checked;
      }

      // Correlation views enforce Lock ratio; Data values leaves it user-editable.
      try {
        const svgBox = state.svgBox
          || getHeatmapNodeById('heatmapGraphPanel')?.querySelector('.svgbox')
          || (state.svg && state.svg.closest && state.svg.closest('.svgbox'));
        const aspectCheckbox = svgBox ? svgBox.querySelector('.resizer-aspect-checkbox') : null;
        if(aspectCheckbox){
          if(isCorrelation){

            aspectCheckbox.disabled = true;
            aspectCheckbox.checked = true;
            if(svgBox && svgBox.dataset){
              svgBox.dataset.resizerAspectLocked = 'true';
            }
            try{ applySvgBoxAspect(svgBox, { locked: true }); }catch(e){}
            // Programmatic view-family projection must not dispatch the resizer
            // checkbox event. The view-change handler schedules the canonical full
            // owner draw; dispatching here can enqueue a view-only redraw that
            // reuses the previous correlation render model before the values draw
            // completes.
          }else{
            aspectCheckbox.disabled = false;
            if(enteringDataValues){

              aspectCheckbox.checked = false;
              if(svgBox && svgBox.dataset){
                svgBox.dataset.resizerAspectLocked = 'false';
              }
              try{ applySvgBoxAspect(svgBox, { locked: false }); }catch(e){}
              // Do not dispatch the resizer checkbox event for this programmatic
              // projection. User clicks still dispatch normally from the control.
            }
          }
        }

      // Uncheck Show cell values by default for Data values
      if(refs.showValues && enteringDataValues){
        refs.showValues.checked = false;
      }
      }catch(err){
        debugLog('Debug: heatmap updateViewControlState aspect toggle error', err?.message || err);
      }
      if(refs.view?.dataset){
        refs.view.dataset.heatmapLastView = view;
      }
      debugLog('Debug: heatmap view state updated', {
        view,
        isCorrelation,
        enteringDataValues,
        hideRowClustering,
        hideColumnClustering,
        hideRowDendrogram,
        hideColumnDendrogram
      });
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
    };

    const registerFilter = (enableEl, valueEls = []) => {
      if(!enableEl) return;
      const toggle = () => {
        const disabled = !enableEl.checked;
        valueEls.forEach(el => {
          if(!el) return;
          el.disabled = disabled;
          el.classList.toggle('disabled', disabled);
        });
      };
      bindHeatmapControlHandler(enableEl, 'change', `filter-toggle-${enableEl.id || 'unknown'}`, () => {
        toggle();
        debugLog('Debug: heatmap filter toggled', { id: enableEl.id, enabled: enableEl.checked });
        if(materialize(`filter-toggle-${enableEl.id}`)){
          return;
        }
        schedule();
      });
      valueEls.forEach(el => {
        bindHeatmapControlHandler(el, 'input', `filter-value-${el?.id || 'unknown'}`, () => {
          debugLog('Debug: heatmap filter value changed', { id: el.id, value: el.value });
          schedule();
        });
        bindHeatmapControlHandler(el, 'change', `filter-commit-${el?.id || 'unknown'}`, () => {
          if(enableEl.checked){
            materialize(`filter-value-${el.id}`);
          }
        });
      });
      toggle();
    };

    const registerCenter = (checkbox, radioName) => {
      if(!checkbox) return;
      const radios = Array.from(resolveHeatmapRoot()?.querySelectorAll?.(`input[name="${radioName}"]`) || []);
      const toggle = () => {
        const disabled = !checkbox.checked;
        radios.forEach(radio => {
          radio.disabled = disabled;
        });
      };
      bindHeatmapControlHandler(checkbox, 'change', `center-toggle-${checkbox.id || radioName}`, () => {
        toggle();
        debugLog('Debug: heatmap center toggle', { id: checkbox.id, enabled: checkbox.checked });
        if(materialize(`center-toggle-${checkbox.id}`)){
          return;
        }
        schedule();
      });
      radios.forEach(radio => {
        bindHeatmapControlHandler(radio, 'change', `center-mode-${radioName}`, () => {
          debugLog('Debug: heatmap center mode changed', { name: radioName, value: radio.value });
          if(materialize(`center-mode-${radioName}`)){
            return;
          }
          schedule();
        });
      });
      toggle();
    };

    const registerCluster = (checkbox, select, dendrogramToggle) => {
      if(!checkbox) return;
      const update = () => {
        const enabled = checkbox.checked;
        if(select){ select.disabled = !enabled; }
        if(dendrogramToggle){ dendrogramToggle.disabled = !enabled; }
      };
      bindHeatmapControlHandler(checkbox, 'change', `cluster-toggle-${checkbox.id || 'unknown'}`, () => {
        if(!state.suspendControlSchedule && !getHeatmapClusterState().suppressClusterTouchTracking){
          updateHeatmapClusterState({ clusterControlsTouched: true });
        }
        update();
        updateViewControlState();
        debugLog('Debug: heatmap cluster toggle', { id: checkbox.id, enabled: checkbox.checked });
        schedule();
      });
      bindHeatmapControlHandler(select, 'change', `cluster-select-${select?.id || 'unknown'}`, () => {
        if(!state.suspendControlSchedule && !getHeatmapClusterState().suppressClusterTouchTracking){
          updateHeatmapClusterState({ clusterControlsTouched: true });
        }
        updateViewControlState();
        debugLog('Debug: heatmap cluster metric change', { id: select.id, value: select.value });
        schedule();
      });
      bindHeatmapControlHandler(dendrogramToggle, 'change', `dendrogram-toggle-${dendrogramToggle?.id || 'unknown'}`, () => {
        if(!state.suspendControlSchedule && !getHeatmapClusterState().suppressClusterTouchTracking){
          updateHeatmapClusterState({ clusterControlsTouched: true });
        }
        updateViewControlState();
        debugLog('Debug: heatmap dendrogram toggle', { id: dendrogramToggle.id, checked: dendrogramToggle.checked });
        schedule();
      });
      update();
    };

    bindHeatmapControlHandler(refs.view, 'change', 'view-change', (_event, owner) => {
      const ownerSession = owner?.session || getActiveHeatmapSessionForState();
      const previousModelType = getHeatmapRenderRuntime(ownerSession, { seedFromActive: false })?.lastRenderModel?.type || null;
      updateViewControlState();
      const controls = syncHeatmapControlStateToSession(ownerSession, captureHeatmapControlStateFromDom());
      const nextModelType = controls.view === 'values' ? 'values' : 'correlation';
      if(previousModelType && previousModelType !== nextModelType){
        invalidateHeatmapViewFamilyRenderState(ownerSession, 'user-view-change-family-switch');
      }
      debugLog('Debug: heatmap view changed', {
        value: refs.view.value,
        previousModelType,
        nextModelType,
        tabId: ownerSession?.tabId || null
      });
      state.ensureHotForActiveTab?.();
      updateHeatmapDrawRuntime(ownerSession, runtime => {
        runtime.pendingDrawOptions = {};
        runtime.deferredHiddenDrawOptions = null;
        runtime.token = (Number(runtime.token) || 0) + 1;
      }, { seedFromActive: false });
      scheduleHeatmapDrawForSession(ownerSession, Shared.componentLifecycle.createStructuralDrawOptions('user-view-change', {
        tabId: ownerSession?.tabId || getHeatmapActiveTabId() || undefined,
        userInitiated: true
      }));
    });
    bindHeatmapControlHandler(refs.method, 'change', 'method-change', () => {
      debugLog('Debug: heatmap method changed', { value: refs.method.value });
      schedule();
    });
    bindHeatmapControlHandler(refs.logTransform, 'change', 'log-transform', () => {
      const enabling = !!refs.logTransform.checked;
      if(enabling){
        const raw = collectTableData();
        if(raw && raw.matrix){
          let hasZeros = false;
          let hasNegatives = false;
          for(let i = 0; i < raw.matrix.length && !hasNegatives; i += 1){
            for(let j = 0; j < raw.matrix[i].length && !hasNegatives; j += 1){
              const value = raw.matrix[i][j];
              if(Number.isFinite(value)){
                if(value < 0){
                  hasNegatives = true;
                }else if(value === 0){
                  hasZeros = true;
                }
              }
            }
          }
          if(hasZeros && !hasNegatives){
            const useLogPlusOne = global.confirm('Your data contains zero values. Would you like to add +1 to all values before log transform?\n\nThis will compute log2(x+1) instead of log2(x).');
            if(useLogPlusOne){
              state.logPlusOne = true;
              debugLog('Debug: heatmap log+1 enabled by user confirmation');
            }else{
              refs.logTransform.checked = false;
              state.logPlusOne = false;
              debugLog('Debug: heatmap log transform cancelled by user');
              return;
            }
          }else{
            state.logPlusOne = false;
          }
        }
      }else{
        state.logPlusOne = false;
      }
      debugLog('Debug: heatmap logTransform changed', { id: refs.logTransform.id, checked: refs.logTransform.checked, logPlusOne: state.logPlusOne });
      syncControlsBeforeSchedule();
      if(materialize('log-transform')){
        return;
      }
      schedule();
    });
    [refs.normalizeGenes, refs.normalizeArrays].forEach(el => {
      bindHeatmapControlHandler(el, 'change', `normalize-toggle-${el?.id || 'unknown'}`, () => {
        debugLog('Debug: heatmap toggle changed', { id: el.id, checked: el.checked });
        if(materialize(`normalize-toggle-${el.id}`)){
          return;
        }
        schedule();
      });
    });
    [refs.showRowDendrogram, refs.showColumnDendrogram].forEach(el => {
      bindHeatmapControlHandler(el, 'change', `dendrogram-toggle-${el?.id || 'unknown'}`, () => {
        if(!state.suspendControlSchedule && !getHeatmapClusterState().suppressClusterTouchTracking){
          updateHeatmapClusterState({ clusterControlsTouched: true });
        }
        debugLog('Debug: heatmap toggle changed', { id: el.id, checked: el.checked });
        schedule();
      });
    });
    [refs.absValues, refs.maskLower, refs.showValues, refs.showSignificance].forEach(el => {
      bindHeatmapControlHandler(el, 'change', `view-toggle-${el?.id || 'unknown'}`, () => {
        updateViewControlState();
        debugLog('Debug: heatmap view toggle changed', { id: el.id, checked: el.checked });
        scheduleViewOnly(`toggle-${el?.id || 'unknown'}`);
      });
    });
    bindHeatmapControlHandler(refs.significanceDisplay, 'change', 'significance-display', () => {
      updateViewControlState();
      debugLog('Debug: heatmap significance display changed', { value: refs.significanceDisplay?.value || null });
      scheduleViewOnly('significance-display');
    });
    bindHeatmapControlHandler(refs.decimals, 'input', 'decimals', () => {
      if(refs.decimals){
        refs.decimals.value = String(clampDecimals(refs.decimals.value));
        debugLog('Debug: heatmap decimals changed', { value: refs.decimals.value });
      }
      scheduleViewOnly('decimals');
    });
    [refs.colorNegative, refs.colorZero, refs.colorPositive].forEach(el => {
      if(!el) return;
      if(typeof global.attachColorPickerNear === 'function'){
        global.attachColorPickerNear(el);
      }
      bindHeatmapControlHandler(el, 'input', `color-${el.id || 'unknown'}`, () => {
        debugLog('Debug: heatmap color changed', { id: el.id, value: el.value });
        updateHeatmapPalette({
          negative: refs.colorNegative?.value,
          zero: refs.colorZero?.value,
          positive: refs.colorPositive?.value
        }, {
          reason: `color-${el.id}`,
          document: global.document
        });
      });
    });
    bindHeatmapControlHandler(refs.cellSize, 'input', 'cell-size', () => {
      if(refs.cellSizeVal && refs.cellSize){
        refs.cellSizeVal.textContent = refs.cellSize.value;
      }
      debugLog('Debug: heatmap cell size changed', { value: refs.cellSize?.value });
      scheduleViewOnly('cell-size');
    });
    bindHeatmapControlHandler(refs.fontSize, 'input', 'font-size', () => {
      if(refs.fontSize){
        if(refs.fontSize.dataset){
          refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        }
        chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
        debugLog('Debug: heatmap font size changed', { value: refs.fontSize.value });
      }
      scheduleViewOnly('font-size');
    });

    registerFilter(refs.filterPresentEnable, [refs.filterPresentValue]);
    registerFilter(refs.filterSdEnable, [refs.filterSdValue]);
    registerFilter(refs.filterAbsEnable, [refs.filterAbsCount, refs.filterAbsValue]);
    registerFilter(refs.filterRangeEnable, [refs.filterRangeValue]);
    registerCenter(refs.centerGenes, 'heatmapCenterGenesMode');
    registerCenter(refs.centerArrays, 'heatmapCenterArraysMode');
    registerCluster(refs.clusterGenes, refs.genesMetric, refs.showRowDendrogram);
    registerCluster(refs.clusterArrays, refs.arraysMetric, refs.showColumnDendrogram);
    bindHeatmapControlHandler(refs.linkage, 'change', 'linkage', () => {
      debugLog('Debug: heatmap linkage method changed', { value: refs.linkage.value });
      schedule();
    });

    const example = [
      ['Gene', 'Baseline_A', 'Baseline_B', 'Treatment_A', 'Treatment_B', 'Stress_A', 'Stress_B', 'Recovery'],
      ['GeneA', 2.1, 2.4, 6.8, 7.1, 9.5, 9.1, 3.2],
      ['GeneB', 5.5, 5.8, 2.2, 2.0, 3.1, 3.5, 6.7],
      ['GeneC', 1.2, 1.0, 7.9, 7.5, 2.6, 2.1, 4.3],
      ['GeneD', 3.8, 3.5, 1.6, 1.8, 8.4, 8.7, 2.4],
      ['GeneE', 4.5, 4.2, 3.1, 3.4, 6.9, 7.2, 5.1]
    ];
    bindHeatmapControlHandler($('heatmapLoadExample'), 'click', 'load-example', () => {
      markHeatmapOverlayPending('example-data');
      if(!replaceHeatmapDataset(example, {
        reason: 'example-load',
        loadOptions: {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:heatmap:example-load'
        }
      })){
        return;
      }
      debugLog('heatmap example loaded');
    });

    const importBtn = $('heatmapImport');
    const fileInput = $('heatmapFile');
    bindHeatmapControlHandler(importBtn, 'click', 'import-table', () => {
      if(fileInput){
        fileInput.value = '';
        fileInput.click();
      }
    });
    bindHeatmapControlHandler(fileInput, 'change', 'import-file', async () => {
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('heatmap import skipped - Shared.tableImport.openFile unavailable');
        return;
      }
      const hasFile = !!(fileInput?.files && fileInput.files[0]);
      let forcedOverlay = false;
      if(hasFile){
        forcedOverlay = !!forceHeatmapOverlay('file-import', { message: 'Importing table data...' });
        markHeatmapOverlayPending('file-import');
      }
      try{
        const result = await tableImport.openFile(fileInput, {
          hot: state.hot,
          minCols: 2,
          minRows: DEFAULT_ROWS,
          scheduleDraw: () => {
            markHeatmapOverlayPending('file-import');
            scheduleActiveHeatmapDraw({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'heatmap',
          onProcessed: info => debugLog('heatmap data imported', info),
          onCompleted: () => {
            const renderReason = 'import-load';
            markHeatmapOverlayPending(renderReason);
            forceHeatmapOverlay(renderReason, { message: 'Rendering heatmap...' });
            // resolve after draw completes
          },
          onOwnerInactive: (_result, meta) => {
            resolveHeatmapOverlay({ reason: 'file-import-owner-inactive', tabId: meta?.tabId || null });
          }
        });
        if(!result && forcedOverlay){
          resolveHeatmapOverlay('file-import-empty');
        }
      }catch(err){
        if(forcedOverlay){
          resolveHeatmapOverlay('file-import-error');
        }
        console.error('heatmap import failed', err);
      }
    });
    refreshHeatmapExportControls();

    const statsPanel = $('heatmapStats');
    const handleStatsThresholdInteraction = event => {
      const target = event?.target;
      if(!(target instanceof global.HTMLElement)){
        return;
      }
      if(!target.closest?.('.stats-significance-controls__input')){
        return;
      }
      debugLog('Debug: heatmap significance threshold changed', { value: target.value || null });
      scheduleViewOnly('stats-threshold');
    };
    bindHeatmapControlHandler(statsPanel, 'input', 'stats-threshold-input', handleStatsThresholdInteraction, true);
    bindHeatmapControlHandler(statsPanel, 'change', 'stats-threshold-change', handleStatsThresholdInteraction, true);
    if(typeof global.addEventListener === 'function'){
      global.addEventListener('venn:stats-pvalue-format-change', event => {
        const targetId = event?.detail?.targetId || null;
        const eventTabId = event?.detail?.tabId || null;
        if(targetId && targetId !== 'heatmapStatsContent' && targetId !== 'heatmapStats'){
          return;
        }
        const targetSession = eventTabId
          ? getHeatmapSession(eventTabId, { tabId: eventTabId, reason: 'stats-pvalue-format' }, { create: false })
          : getActiveHeatmapSessionForState();
        if(eventTabId && getHeatmapProjectionTabId() && String(eventTabId) !== String(getHeatmapProjectionTabId())){
          scheduleHeatmapDrawForSession(targetSession, { viewOnly: true, reason: 'stats-pvalue-format' });
          return;
        }
        scheduleHeatmapDrawForSession(targetSession, { viewOnly: true, reason: 'stats-pvalue-format' });
      });
    }

    updateViewControlState();
  }

  function initFileButtons(){
    bindHeatmapControlHandler($('openHeatmapGraph'), 'click', 'open-graph', () => heatmap.open());
    bindHeatmapControlHandler($('saveHeatmapGraph'), 'click', 'save-graph', () => heatmap.save());
    bindHeatmapControlHandler($('saveAsHeatmap'), 'click', 'save-as-graph', () => heatmap.saveAs());
    bindHeatmapControlHandler($('heatmapGraphFile'), 'change', 'graph-file-change', event => {
      const file = event.target.files && event.target.files[0];
      if(file){
        const owner = getHeatmapCallbackOwner({ event, reason: 'heatmap-graph-file-change' });
        const operationSession = owner.session || getActiveHeatmapSessionForState();
        setHeatmapFileName(file.name, { session: operationSession });
        setHeatmapFileHandle(null, operationSession);
        heatmap.loadFromFile(file);
      }
    });
  }

  function parseNumber(value){
    if(value === null || value === undefined) return NaN;
    if(typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value).trim();
    if(!text) return NaN;
    const normalized = text.replace(/,/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function cloneMatrix(matrix){
    return Array.isArray(matrix) ? matrix.map(row => row.slice()) : [];
  }

  function cloneHeatmapDataViewsPayload(payload){
    if(!payload || typeof payload !== 'object'){
      return null;
    }
    const cloned = cloneSimple(payload);
    return cloned && typeof cloned === 'object' ? cloned : null;
  }

  function parseHeatmapInputData(data, contextLabel){
    const debugContext = contextLabel || 'collectTableData';
    if(!Array.isArray(data) || data.length < 2){
      debugLog(`Debug: heatmap ${debugContext} insufficient rows`, { length: data?.length || 0 });
      return null;
    }
    const header = Array.isArray(data[0]) ? data[0] : [];
    if(header.length < 1){
      debugLog(`Debug: heatmap ${debugContext} insufficient columns`, { columnCount: header.length });
      return null;
    }
    const bodyRows = data.slice(1).filter(row => Array.isArray(row));
    const firstColumnHasNonNumericText = bodyRows.some(row => {
      const cell = row[0];
      if(cell === undefined || cell === null){ return false; }
      const trimmed = String(cell).trim();
      if(trimmed === ''){ return false; }
      const numeric = parseNumber(cell);
      return !Number.isFinite(numeric);
    });
    const startColumnIndex = firstColumnHasNonNumericText ? 1 : 0;
    debugLog(`Debug: heatmap ${debugContext} header interpretation`, {
      firstColumnHasNonNumericText,
      startColumnIndex,
      headerLength: header.length
    }); // Debug: record header parsing heuristics
    if(header.length - startColumnIndex < 1){
      debugLog(`Debug: heatmap ${debugContext} insufficient data columns`, {
        headerLength: header.length,
        startColumnIndex
      });
      return null;
    }
    const rowHeaderLabel = firstColumnHasNonNumericText
      ? (
        header[0] !== undefined && header[0] !== null && String(header[0]).trim() !== ''
          ? String(header[0]).trim()
          : 'Row'
      )
      : 'Row';
    const rawColumnLabels = header.slice(startColumnIndex);
    const columnLabels = [];
    const columnMeta = [];
    for(let colIndex = 0; colIndex < rawColumnLabels.length; colIndex += 1){
      const label = rawColumnLabels[colIndex];
      const clean = label !== undefined && label !== null && String(label).trim() !== ''
        ? String(label).trim()
        : `Column ${colIndex + 1}`;
      columnLabels.push(clean);
      columnMeta.push({ label: clean, originalIndex: colIndex + startColumnIndex });
    }
    const rowLabels = [];
    const rowMeta = [];
    const matrix = [];
    let skippedRows = 0;
    for(let rowIndex = 0; rowIndex < bodyRows.length; rowIndex += 1){
      const row = bodyRows[rowIndex];
      if(!Array.isArray(row)){ continue; }
      const values = [];
      let hasNumeric = false;
      for(let colIndex = startColumnIndex; colIndex < header.length; colIndex += 1){
        const value = parseNumber(row[colIndex]);
        if(Number.isFinite(value)){
          hasNumeric = true;
          values.push(value);
        }else{
          values.push(NaN);
        }
      }
      if(!hasNumeric){
        skippedRows += 1;
        continue;
      }
      const rawLabel = firstColumnHasNonNumericText ? row[0] : null;
      const cleanLabel = firstColumnHasNonNumericText
        ? (rawLabel !== undefined && rawLabel !== null && String(rawLabel).trim() !== ''
          ? String(rawLabel).trim()
          : `Row ${rowLabels.length + 1}`)
        : `Row ${rowLabels.length + 1}`;
      rowLabels.push(cleanLabel);
      rowMeta.push({ label: cleanLabel, originalIndex: rowIndex });
      matrix.push(values);
    }
    const keepColumns = columnLabels.map((_, colIndex) => matrix.some(row => Number.isFinite(row[colIndex])));
    const filteredMatrix = matrix.map(() => []);
    const filteredColumnLabels = [];
    const filteredColumnMeta = [];
    let removedColumns = 0;
    keepColumns.forEach((keep, colIndex) => {
      if(keep){
        filteredColumnLabels.push(columnLabels[colIndex]);
        filteredColumnMeta.push({ label: columnLabels[colIndex], originalIndex: colIndex });
        matrix.forEach((row, rowIdx) => {
          filteredMatrix[rowIdx].push(row[colIndex]);
        });
      }else{
        removedColumns += 1;
      }
    });
    debugLog(`Debug: heatmap ${debugContext} summary`, {
      rowsInSheet: data.length - 1,
      usableRows: filteredMatrix.length,
      rawColumns: columnLabels.length,
      usableColumns: filteredColumnLabels.length,
      removedEmptyColumns: removedColumns,
      skippedRows
    });
    if(filteredMatrix.length === 0 || filteredColumnLabels.length === 0){
      return null;
    }
    return {
      rowLabels,
      columnLabels: filteredColumnLabels,
      matrix: filteredMatrix,
      rowMeta,
      columnMeta: filteredColumnMeta,
      rowHeaderLabel,
      firstColumnHasNonNumericText,
      skippedRows,
      removedEmptyColumns: removedColumns
    };
  }

  function collectTableData(){
    const context = resolveHeatmapViewContext();
    if(!context.hot || typeof context.hot.getData !== 'function'){
      debugLog('Debug: heatmap collectTableData missing hot reference');
      return null;
    }
    return parseHeatmapInputData(context.sourceData, 'collectTableData');
  }

  function collectTableDataFromMatrix(matrix){
    return parseHeatmapInputData(matrix, 'collectTableDataFromMatrix');
  }

  function computeMean(values){
    if(!Array.isArray(values) || values.length === 0){
      return NaN;
    }
    const finite = values.filter(value => Number.isFinite(value));
    if(finite.length === 0){
      return NaN;
    }
    const sum = finite.reduce((acc, value) => acc + value, 0);
    return sum / finite.length;
  }

  function computeMedian(values){
    if(!Array.isArray(values) || values.length === 0){
      return NaN;
    }
    const finite = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
    if(finite.length === 0){
      return NaN;
    }
    const mid = Math.floor(finite.length / 2);
    if(finite.length % 2 === 0){
      return (finite[mid - 1] + finite[mid]) / 2;
    }
    return finite[mid];
  }

  function computeStd(values){
    if(!Array.isArray(values) || values.length === 0){
      return NaN;
    }
    // Single-pass computation avoiding redundant filtering and iteration
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for(let i = 0; i < values.length; i += 1){
      const value = values[i];
      if(Number.isFinite(value)){
        sum += value;
        sumSq += value * value;
        count += 1;
      }
    }
    if(count < 2){
      return NaN;
    }
    const mean = sum / count;
    const variance = (sumSq - count * mean * mean) / (count - 1);
    return Math.sqrt(Math.max(variance, 0));
  }

  function computeRange(values){
    // Single-pass min/max computation avoiding spread operator overhead
    let min = Infinity;
    let max = -Infinity;
    let hasFinite = false;
    for(let i = 0; i < values.length; i += 1){
      const value = values[i];
      if(Number.isFinite(value)){
        hasFinite = true;
        if(value < min) min = value;
        if(value > max) max = value;
      }
    }
    if(!hasFinite){
      return NaN;
    }
    return { min, max, span: max - min };
  }

  function filterRowsBySettings(matrix, rowLabels, rowMeta, filters, columnCount){
    if(!filters){
      return { matrix, rowLabels, rowMeta, removed: [] };
    }
    const keptMatrix = [];
    const keptLabels = [];
    const keptMeta = [];
    const removed = [];
    const presentThreshold = Number.isFinite(filters.presentThreshold) ? filters.presentThreshold : null;
    const sdThreshold = Number.isFinite(filters.sdThreshold) ? filters.sdThreshold : null;
    const absThreshold = Number.isFinite(filters.absValue) ? filters.absValue : null;
    const absCountThreshold = Number.isFinite(filters.absCount) ? filters.absCount : null;
    const rangeThreshold = Number.isFinite(filters.rangeThreshold) ? filters.rangeThreshold : null;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      const values = Array.isArray(row) ? row : [];
      const finiteValues = values.filter(value => Number.isFinite(value));
      const percentPresent = columnCount > 0 ? (finiteValues.length / columnCount) * 100 : 0;
      const sd = computeStd(values);
      const rangeInfo = computeRange(values);
      const absPassCount = Number.isFinite(absThreshold)
        ? finiteValues.filter(value => Math.abs(value) >= absThreshold).length
        : finiteValues.length;
      const passesPresent = !filters.presentEnabled || presentThreshold === null || percentPresent >= presentThreshold;
      const passesSd = !filters.sdEnabled || sdThreshold === null || (Number.isFinite(sd) && sd >= sdThreshold);
      const passesAbs = !filters.absEnabled || absThreshold === null || absCountThreshold === null || absPassCount >= absCountThreshold;
      const passesRange = !filters.rangeEnabled || rangeThreshold === null || (Number.isFinite(rangeInfo?.span) && rangeInfo.span >= rangeThreshold);
      if(passesPresent && passesSd && passesAbs && passesRange){
        keptMatrix.push(values);
        keptLabels.push(rowLabels[i]);
        keptMeta.push(rowMeta[i]);
      }else{
        removed.push({
          label: rowLabels[i],
          percentPresent,
          sd,
          absPassCount,
          range: rangeInfo?.span
        });
      }
    }
    debugLog('Debug: heatmap filterRowsBySettings result', {
      originalRows: matrix.length,
      keptRows: keptMatrix.length,
      removedRows: removed.length,
      filters
    });
    return { matrix: keptMatrix, rowLabels: keptLabels, rowMeta: keptMeta, removed };
  }

  function pruneEmptyColumns(matrix, columnLabels, columnMeta){
    if(!Array.isArray(matrix) || matrix.length === 0){
      return { matrix, columnLabels, columnMeta, removed: 0 };
    }
    const columnCount = columnLabels.length;
    const keep = Array.from({ length: columnCount }, (_, colIndex) => matrix.some(row => Number.isFinite(row[colIndex])));
    const newMatrix = matrix.map(() => []);
    const newLabels = [];
    const newMeta = [];
    let removed = 0;
    keep.forEach((shouldKeep, colIndex) => {
      if(shouldKeep){
        newLabels.push(columnLabels[colIndex]);
        newMeta.push(columnMeta[colIndex]);
        matrix.forEach((row, rowIndex) => {
          newMatrix[rowIndex].push(row[colIndex]);
        });
      }else{
        removed += 1;
      }
    });
    debugLog('Debug: heatmap pruneEmptyColumns summary', {
      originalColumns: columnCount,
      keptColumns: newLabels.length,
      removed
    });
    return { matrix: newMatrix, columnLabels: newLabels, columnMeta: newMeta, removed };
  }

  function applyLogTransform(matrix){
    let converted = 0;
    let invalid = 0;
    const usePlusOne = !!state.logPlusOne;
    const log2 = value => Math.log(value) / Math.log(2);
    for(let i = 0; i < matrix.length; i += 1){
      for(let j = 0; j < matrix[i].length; j += 1){
        const value = matrix[i][j];
        if(!Number.isFinite(value)) continue;
        if(usePlusOne){
          // When log+1 is enabled, allow non-negative values (zeros become log2(1) = 0)
          if(value >= 0){
            matrix[i][j] = log2(value + 1);
            converted += 1;
          }else{
            matrix[i][j] = NaN;
            invalid += 1;
          }
        }else{
          if(value > 0){
            matrix[i][j] = log2(value);
            converted += 1;
          }else{
            matrix[i][j] = NaN;
            invalid += 1;
          }
        }
      }
    }
    debugLog('Debug: heatmap applyLogTransform complete', { converted, invalid, usePlusOne });
    return { converted, invalid };
  }

  function centerRows(matrix, mode){
    let adjusted = 0;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      const center = mode === 'median' ? computeMedian(row) : computeMean(row);
      if(!Number.isFinite(center) || center === 0){
        continue;
      }
      for(let j = 0; j < row.length; j += 1){
        if(Number.isFinite(row[j])){
          row[j] -= center;
          adjusted += 1;
        }
      }
    }
    debugLog('Debug: heatmap centerRows applied', { mode, adjusted });
    return adjusted;
  }

  function normalizeRows(matrix){
    let normalized = 0;
    let skipped = 0;
    for(let i = 0; i < matrix.length; i += 1){
      const row = matrix[i];
      const mean = computeMean(row);
      const std = computeStd(row);
      if(!Number.isFinite(std) || std === 0){
        skipped += 1;
        continue;
      }
      for(let j = 0; j < row.length; j += 1){
        if(Number.isFinite(row[j])){
          row[j] = (row[j] - (Number.isFinite(mean) ? mean : 0)) / std;
          normalized += 1;
        }
      }
    }
    debugLog('Debug: heatmap normalizeRows applied', { normalized, skipped });
    return { normalized, skipped };
  }

  function centerColumns(matrix, mode){
    if(!Array.isArray(matrix) || matrix.length === 0){
      return 0;
    }
    const rowCount = matrix.length;
    const columnCount = matrix[0].length;
    let adjusted = 0;
    for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
      let center;
      if(mode === 'median'){
        // Inline median calculation to avoid allocating a column array via map().
        // This duplicates computeMedian logic but avoids O(n) intermediate allocation per column.
        const finite = [];
        for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
          const value = matrix[rowIndex][colIndex];
          if(Number.isFinite(value)){
            finite.push(value);
          }
        }
        if(finite.length === 0){
          continue;
        }
        finite.sort((a, b) => a - b);
        const mid = Math.floor(finite.length / 2);
        center = finite.length % 2 === 0 ? (finite[mid - 1] + finite[mid]) / 2 : finite[mid];
      }else{
        // For mean, single-pass computation without intermediate array allocation
        let sum = 0;
        let count = 0;
        for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
          const value = matrix[rowIndex][colIndex];
          if(Number.isFinite(value)){
            sum += value;
            count += 1;
          }
        }
        if(count === 0){
          continue;
        }
        center = sum / count;
      }
      if(!Number.isFinite(center) || center === 0){
        continue;
      }
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        if(Number.isFinite(matrix[rowIndex][colIndex])){
          matrix[rowIndex][colIndex] -= center;
          adjusted += 1;
        }
      }
    }
    debugLog('Debug: heatmap centerColumns applied', { mode, adjusted });
    return adjusted;
  }

  function normalizeColumns(matrix){
    if(!Array.isArray(matrix) || matrix.length === 0){
      return { normalized: 0, skipped: 0 };
    }
    const rowCount = matrix.length;
    const columnCount = matrix[0].length;
    let normalized = 0;
    let skipped = 0;
    // Single-pass mean and std computation per column to avoid redundant array allocations
    for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        const value = matrix[rowIndex][colIndex];
        if(Number.isFinite(value)){
          sum += value;
          sumSq += value * value;
          count += 1;
        }
      }
      if(count < 2){
        skipped += 1;
        continue;
      }
      const mean = sum / count;
      const variance = (sumSq - count * mean * mean) / (count - 1);
      const std = Math.sqrt(Math.max(variance, 0));
      if(!Number.isFinite(std) || std === 0){
        skipped += 1;
        continue;
      }
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        const value = matrix[rowIndex][colIndex];
        if(Number.isFinite(value)){
          matrix[rowIndex][colIndex] = (value - mean) / std;
          normalized += 1;
        }
      }
    }
    debugLog('Debug: heatmap normalizeColumns applied', { normalized, skipped });
    return { normalized, skipped };
  }

  function applyAdjustments(matrix, adjust){
    if(!adjust){
      return {};
    }
    const summary = {};
    if(adjust.centerRowsMode){
      summary.centerRows = centerRows(matrix, adjust.centerRowsMode);
    }
    if(adjust.normalizeRows){
      summary.normalizeRows = normalizeRows(matrix);
    }
    if(adjust.centerColumnsMode){
      summary.centerColumns = centerColumns(matrix, adjust.centerColumnsMode);
    }
    if(adjust.normalizeColumns){
      summary.normalizeColumns = normalizeColumns(matrix);
    }
    debugLog('Debug: heatmap applyAdjustments summary', summary);
    return summary;
  }

  function buildAxisItems(matrix, labels, axis){
    if(!Array.isArray(matrix) || !Array.isArray(labels)){
      return [];
    }
    if(axis === 'rows'){
      return labels.map((label, index) => ({ label, index, vector: matrix[index] ? matrix[index].slice() : [] }));
    }
    if(axis === 'columns'){
      const columnCount = labels.length;
      const items = [];
      for(let colIndex = 0; colIndex < columnCount; colIndex += 1){
        const vector = matrix.map(row => row[colIndex]);
        items.push({ label: labels[colIndex], index: colIndex, vector });
      }
      return items;
    }
    return [];
  }

  function alignVectors(vecA, vecB){
    const length = Math.min(vecA?.length || 0, vecB?.length || 0);
    const xs = [];
    const ys = [];
    for(let i = 0; i < length; i += 1){
      const a = vecA[i];
      const b = vecB[i];
      if(Number.isFinite(a) && Number.isFinite(b)){
        xs.push(a);
        ys.push(b);
      }
    }
    return { xs, ys };
  }

  function hasHeatmapDuplicateValues(values){
    const seen = new Set();
    for(let i = 0; i < values.length; i += 1){
      const key = String(values[i]);
      if(seen.has(key)){
        return true;
      }
      seen.add(key);
    }
    return false;
  }

  function computeHeatmapSpearmanExactP(rho, n){
    const size = Number(n);
    const observed = Math.abs(Number(rho));
    if(!Number.isFinite(size) || !Number.isFinite(observed) || size < 3 || size > 9){
      return null;
    }
    const permutation = Array.from({ length: size }, (_, idx) => idx + 1);
    const denom = size * (Math.pow(size, 2) - 1);
    let total = 0;
    let extreme = 0;
    const tolerance = 1e-12;
    const permute = index => {
      if(index >= size){
        let d2 = 0;
        for(let i = 0; i < size; i += 1){
          const d = (i + 1) - permutation[i];
          d2 += d * d;
        }
        const rhoPerm = 1 - ((6 * d2) / denom);
        total += 1;
        if(Math.abs(rhoPerm) >= observed - tolerance){
          extreme += 1;
        }
        return;
      }
      for(let i = index; i < size; i += 1){
        const tmp = permutation[index];
        permutation[index] = permutation[i];
        permutation[i] = tmp;
        permute(index + 1);
        permutation[i] = permutation[index];
        permutation[index] = tmp;
      }
    };
    permute(0);
    return total ? (extreme / total) : null;
  }

  function computeHeatmapCorrelationPValue(corr, xs, ys, method){
    const bounded = Number.isFinite(corr)
      ? Math.max(-0.999999999999, Math.min(0.999999999999, Number(corr)))
      : NaN;
    const count = Math.min(xs?.length || 0, ys?.length || 0);
    if(!Number.isFinite(bounded) || count < 3 || method === 'uncentered'){
      return NaN;
    }
    const statsApi = global.jStat || null;
    if(method === 'spearman'){
      const hasTies = hasHeatmapDuplicateValues(xs) || hasHeatmapDuplicateValues(ys);
      if(!hasTies && count <= 9){
        const exact = computeHeatmapSpearmanExactP(bounded, count);
        if(Number.isFinite(exact)){
          return exact;
        }
      }
    }
    const tStatistic = bounded * Math.sqrt((count - 2) / Math.max(1e-12, 1 - (bounded * bounded)));
    const helper = Shared.stats?.studentTTwoSidedPValue;
    if(typeof helper === 'function'){
      const value = helper(tStatistic, count - 2);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : NaN;
    }
    const studentTCdf = (statsApi?.studentt && typeof statsApi.studentt.cdf === 'function')
      ? statsApi.studentt.cdf.bind(statsApi.studentt)
      : null;
    return studentTCdf ? Math.max(0, Math.min(1, 2 * (1 - studentTCdf(Math.abs(tStatistic), count - 2)))) : NaN;
  }

  function computeUncenteredCorrelation(xs, ys){
    const n = xs.length;
    if(n === 0){
      return NaN;
    }
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    for(let i = 0; i < n; i += 1){
      const x = xs[i];
      const y = ys[i];
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const denom = Math.sqrt(sumX2 * sumY2);
    if(denom === 0){
      return NaN;
    }
    return sumXY / denom;
  }

  function calculateCorrelationEntry(vecA, vecB, method){
    const { xs, ys } = alignVectors(vecA, vecB);
    const count = xs.length;
    if(count < 2 && method !== 'uncentered'){
      return { corr: NaN, count, pValue: NaN };
    }
    let corr;
    if(method === 'spearman'){
      corr = computeCorrelation(xs, ys, 'spearman');
    }else if(method === 'uncentered'){
      corr = computeUncenteredCorrelation(xs, ys);
    }else{
      corr = computeCorrelation(xs, ys, 'pearson');
    }
    const normalized = Number.isFinite(corr) ? Math.max(-1, Math.min(1, corr)) : NaN;
    const pValue = computeHeatmapCorrelationPValue(normalized, xs, ys, method);
    return { corr: normalized, count, pValue };
  }

  function distanceBetweenVectors(vecA, vecB, metric){
    // Optimized: inline aligned value processing to avoid redundant array allocations
    const length = Math.min(vecA?.length || 0, vecB?.length || 0);
    if(length === 0){
      return { distance: 1, count: 0 };
    }
    if(metric === 'euclidean'){
      // Direct computation without intermediate arrays.
      // This duplicates alignVectors' finite-value filtering but avoids O(n) array allocation
      // for the common euclidean case during hierarchical clustering.
      let sumSq = 0;
      let count = 0;
      for(let i = 0; i < length; i += 1){
        const a = vecA[i];
        const b = vecB[i];
        if(Number.isFinite(a) && Number.isFinite(b)){
          const diff = a - b;
          sumSq += diff * diff;
          count += 1;
        }
      }
      if(count === 0){
        return { distance: 1, count: 0 };
      }
      const distance = Math.sqrt(sumSq / count);
      return { distance, count };
    }
    // For correlation metrics, compute in single pass where possible
    const { xs, ys } = alignVectors(vecA, vecB);
    const count = xs.length;
    if(count === 0){
      return { distance: 1, count: 0 };
    }
    let corr;
    if(metric === 'spearman'){
      corr = computeCorrelation(xs, ys, 'spearman');
    }else if(metric === 'uncentered'){
      corr = computeUncenteredCorrelation(xs, ys);
    }else{
      corr = computeCorrelation(xs, ys, 'pearson');
    }
    const normalizedCorr = Number.isFinite(corr) ? Math.max(-1, Math.min(1, corr)) : NaN;
    const distance = Number.isFinite(normalizedCorr) ? 1 - normalizedCorr : 1;
    return { distance, count, corr: normalizedCorr };
  }

  function hierarchicalCluster(items, metric, linkage){
    const countItems = Array.isArray(items) ? items.length : 0;
    const now = () => (global.performance && typeof global.performance.now === 'function') ? global.performance.now() : Date.now();
    const startTime = now();
    if(countItems === 0){
      const emptyStore = { size: 0, values: new Float32Array(0), released: true };
      debugLog('Debug: heatmap hierarchicalCluster skipped - no items', { metric, linkage });
      return { order: [], tree: null, maxDistance: 0, steps: [], baseDistances: emptyStore };
    }
    if(countItems === 1){
      const singletonStore = { size: 1, values: new Float32Array(0), released: true };
      const durationSingleton = now() - startTime;
      debugLog('Debug: heatmap hierarchicalCluster trivial', {
        itemCount: 1,
        metric,
        linkage,
        durationMs: Number(durationSingleton.toFixed(2))
      });
      return {
        order: [items[0].index],
        tree: { indices: [0], left: null, right: null, distance: 0 },
        maxDistance: 0,
        steps: [],
        baseDistances: singletonStore
      };
    }

    const baseDistanceStore = {
      size: countItems,
      values: new Float32Array((countItems * (countItems - 1)) / 2),
      released: false
    };
    const baseValues = baseDistanceStore.values;
    const writeBaseDistance = (i, j, value) => {
      if(i === j){ return; }
      const idx = packedDistanceIndex(countItems, i, j);
      if(idx >= 0){
        baseValues[idx] = value;
      }
    };
    const readBaseDistance = (i, j) => {
      if(i === j){ return 0; }
      const idx = packedDistanceIndex(countItems, i, j);
      if(idx < 0){ return 0; }
      return baseValues[idx];
    };

    for(let i = 0; i < countItems; i += 1){
      for(let j = i + 1; j < countItems; j += 1){
        const { distance } = distanceBetweenVectors(items[i].vector, items[j].vector, metric);
        const safeDistance = Number.isFinite(distance) ? distance : 1;
        writeBaseDistance(i, j, safeDistance);
      }
    }

    // Cache distances between dynamic clusters to avoid repeated O(n^2) scans (Lance-Williams updates).
    const distanceCache = new Map();
    const makeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const setDistance = (a, b, value) => {
      if(a === b){ return; }
      distanceCache.set(makeKey(a, b), value);
    };
    const getDistance = (a, b) => {
      if(a === b){ return 0; }
      const key = makeKey(a, b);
      if(distanceCache.has(key)){
        return distanceCache.get(key);
      }
      if(a < countItems && b < countItems){
        const base = readBaseDistance(a, b);
        distanceCache.set(key, base);
        return base;
      }
      return 1;
    };

    const computeCentroidForIndices = indices => {
      const length = items[0]?.vector?.length || 0;
      const sums = Array.from({ length }, () => 0);
      const counts = Array.from({ length }, () => 0);
      for(const idx of indices){
        const vector = items[idx].vector;
        for(let i = 0; i < length; i += 1){
          const value = vector[i];
          if(Number.isFinite(value)){
            sums[i] += value;
            counts[i] += 1;
          }
        }
      }
      return sums.map((sum, idx) => counts[idx] > 0 ? sum / counts[idx] : NaN);
    };

    const getClusterCentroid = cluster => {
      if(!cluster){ return []; }
      if(!cluster.centroid){
        cluster.centroid = computeCentroidForIndices(cluster.indices);
      }
      return cluster.centroid;
    };

    const linkageDistance = (clusterA, clusterB) => {
      if(!clusterA || !clusterB){ return 1; }
      const indicesA = clusterA.indices;
      const indicesB = clusterB.indices;
      if(linkage === 'centroid'){
        const centroidA = getClusterCentroid(clusterA);
        const centroidB = getClusterCentroid(clusterB);
        const { distance } = distanceBetweenVectors(centroidA, centroidB, metric);
        return Number.isFinite(distance) ? distance : 1;
      }
      let best = Infinity;
      let worst = -Infinity;
      let sum = 0;
      let pairCount = 0;
      for(const idxA of indicesA){
        for(const idxB of indicesB){
          const dist = readBaseDistance(idxA, idxB);
          if(!Number.isFinite(dist)){ continue; }
          if(linkage === 'single'){
            if(dist < best){ best = dist; }
          }else if(linkage === 'complete'){
            if(dist > worst){ worst = dist; }
          }else{
            sum += dist;
            pairCount += 1;
          }
        }
      }
      if(linkage === 'single'){
        return Number.isFinite(best) ? best : 1;
      }
      if(linkage === 'complete'){
        return Number.isFinite(worst) ? worst : 1;
      }
      return pairCount > 0 ? sum / pairCount : 1;
    };

    const clusters = items.map((item, index) => ({
      id: index,
      indices: [index],
      left: null,
      right: null,
      distance: 0,
      centroid: null,
      version: 0,
      size: 1
    }));
    const active = new Map();
    clusters.forEach(cluster => {
      active.set(cluster.id, cluster);
    });
    const steps = [];
    let maxDistance = 0;
    let nextClusterId = countItems;
    const heap = createMinHeap((a, b) => a.distance - b.distance);

    const pushCandidate = (idA, idB) => {
      if(idA === idB){ return; }
      const clusterA = active.get(idA);
      const clusterB = active.get(idB);
      if(!clusterA || !clusterB){ return; }
      const firstId = idA < idB ? idA : idB;
      const secondId = idA < idB ? idB : idA;
      const distance = linkageDistance(clusterA, clusterB);
      const safeDistance = Number.isFinite(distance) ? distance : 1;
      heap.push({
        distance: safeDistance,
        aId: firstId,
        bId: secondId,
        aVersion: clusterA.version,
        bVersion: clusterB.version,
        aSize: clusterA.size,
        bSize: clusterB.size
      });
      setDistance(firstId, secondId, safeDistance);
    };

    for(let i = 0; i < clusters.length; i += 1){
      for(let j = i + 1; j < clusters.length; j += 1){
        pushCandidate(clusters[i].id, clusters[j].id);
      }
    }

    const pollNextPair = () => {
      while(heap.size() > 0){
        const entry = heap.pop();
        if(!entry){ continue; }
        const clusterA = active.get(entry.aId);
        const clusterB = active.get(entry.bId);
        if(!clusterA || !clusterB){
          continue;
        }
        if(clusterA.version !== entry.aVersion || clusterB.version !== entry.bVersion){
          continue;
        }
        return { clusterA, clusterB, distance: entry.distance };
      }
      return null;
    };

    while(active.size > 1){
      let nextPair = pollNextPair();
      if(!nextPair){
        const remaining = Array.from(active.values());
        if(remaining.length < 2){
          break;
        }
        const clusterA = remaining[0];
        const clusterB = remaining[1];
        const fallbackDistance = linkageDistance(clusterA, clusterB);
        debugLog('Debug: heatmap hierarchicalCluster fallback merge', {
          clusterA: clusterA.id,
          clusterB: clusterB.id,
          linkage,
          fallbackDistance
        });
        nextPair = { clusterA, clusterB, distance: Number.isFinite(fallbackDistance) ? fallbackDistance : 1 };
      }

      const { clusterA, clusterB } = nextPair;
      const mergeDistance = Number.isFinite(nextPair.distance) ? nextPair.distance : 0;
      active.delete(clusterA.id);
      active.delete(clusterB.id);
      const mergedIndices = clusterA.indices.concat(clusterB.indices).sort((a, b) => a - b);
      const mergedCluster = {
        id: nextClusterId,
        indices: mergedIndices,
        left: clusterA,
        right: clusterB,
        distance: mergeDistance,
        centroid: null,
        version: 0,
        size: clusterA.size + clusterB.size
      };
      if(linkage === 'centroid'){
        mergedCluster.centroid = computeCentroidForIndices(mergedIndices);
      }
      steps.push({ left: clusterA.indices.slice(), right: clusterB.indices.slice(), distance: mergeDistance });
      maxDistance = Math.max(maxDistance, mergeDistance);
      nextClusterId += 1;
      active.set(mergedCluster.id, mergedCluster);
      for(const other of active.values()){
        if(other.id === mergedCluster.id){ continue; }
        const dAC = getDistance(clusterA.id, other.id);
        const dBC = getDistance(clusterB.id, other.id);
        let newDistance = 1;
        if(linkage === 'single'){
          newDistance = Math.min(dAC, dBC);
        }else if(linkage === 'complete'){
          newDistance = Math.max(dAC, dBC);
        }else{
          const total = (clusterA.size * dAC) + (clusterB.size * dBC);
          newDistance = (clusterA.size + clusterB.size) > 0 ? total / (clusterA.size + clusterB.size) : 1;
        }
        setDistance(mergedCluster.id, other.id, newDistance);
        heap.push({
          distance: newDistance,
          aId: mergedCluster.id < other.id ? mergedCluster.id : other.id,
          bId: mergedCluster.id < other.id ? other.id : mergedCluster.id,
          aVersion: mergedCluster.version,
          bVersion: other.version,
          aSize: mergedCluster.size,
          bSize: other.size
        });
      }
    }

    const root = Array.from(active.values())[0] || null;
    const flatten = node => {
      if(!node || !node.left || !node.right){
        return node ? node.indices.slice() : [];
      }
      const leftOrder = flatten(node.left);
      const rightOrder = flatten(node.right);
      const leftMin = Math.min(...leftOrder);
      const rightMin = Math.min(...rightOrder);
      return leftMin <= rightMin ? leftOrder.concat(rightOrder) : rightOrder.concat(leftOrder);
    };
    const orderIndices = flatten(root);
    const order = orderIndices.length > 0
      ? orderIndices.map(idx => items[idx].index)
      : items.map(item => item.index);

    baseDistanceStore.released = true;
    baseDistanceStore.values = new Float32Array(0);

    const durationMs = now() - startTime;
    debugLog('Debug: heatmap hierarchicalCluster summary', {
      itemCount: countItems,
      metric,
      linkage,
      maxDistance,
      steps: steps.length,
      durationMs: Number(durationMs.toFixed(2)),
      candidatesProcessed: steps.length + 1
    });
    return { order, tree: root, steps, maxDistance, baseDistances: baseDistanceStore };
  }

  function normalizeClusterResult(result, items){
    const size = Array.isArray(items) ? items.length : 0;
    const fallbackOrder = Array.from({ length: size }, (_, idx) => idx);
    const normalized = result && typeof result === 'object' ? result : {};
    const order = Array.isArray(normalized.order) ? normalized.order : fallbackOrder;
    const tree = normalized.tree || null;
    const steps = Array.isArray(normalized.steps) ? normalized.steps : [];
    const maxDistance = Number.isFinite(normalized.maxDistance) ? normalized.maxDistance : 0;
    const baseDistances = { size, values: new Float32Array(0), released: true };
    return {
      order,
      tree,
      steps,
      maxDistance,
      baseDistances,
      algorithm: typeof normalized.algorithm === 'string' ? normalized.algorithm : null
    };
  }

  function shouldUseClusterWorker(items){
    const count = Array.isArray(items) ? items.length : 0;
    const vectorLength = count > 0 ? (items[0]?.vector?.length || 0) : 0;
    const cells = count * vectorLength;
    return count >= HEATMAP_CLUSTER_WORKER.minItems || cells >= HEATMAP_CLUSTER_WORKER.minCells;
  }

  function buildClusterWorkerPayload(items, metric, linkage){
    return {
      items: items.map((item, idx) => ({
        index: Number.isInteger(item?.index) ? item.index : idx,
        vector: Array.isArray(item?.vector) ? item.vector : []
      })),
      metric,
      linkage
    };
  }

  function isHeatmapAsyncCurrent(asyncState){
    return !asyncState?.scope || !!(asyncState.meta && asyncState.scope.isCurrent(asyncState.meta));
  }

  function isHeatmapDrawCurrent(drawToken, asyncState){
    const tabId = asyncState?.meta?.tabId || asyncState?.meta?.workspaceTabId || getHeatmapProjectionTabId() || null;
    const session = tabId ? getHeatmapSession(tabId, { tabId, reason: 'heatmap-draw-current-check' }, { create: false }) : getActiveHeatmapSessionForState();
    const runtime = getHeatmapDrawRuntime(session, { seedFromActive: !session });
    const currentToken = runtime ? Number(runtime.token) || 0 : Number(state.drawToken) || 0;
    const meta = asyncState?.meta && typeof asyncState.meta === 'object' ? asyncState.meta : {};
    if(typeof meta.dataSignature === 'string' && typeof runtime?.dataSignature === 'string' && meta.dataSignature !== runtime.dataSignature){
      return false;
    }
    if(typeof meta.settingsSignature === 'string' && typeof runtime?.settingsSignature === 'string' && meta.settingsSignature !== runtime.settingsSignature){
      return false;
    }
    const executionCurrent = !asyncState?.execution || !!asyncState.execution.isCurrent?.();
    return drawToken === currentToken && isHeatmapAsyncCurrent(asyncState) && executionCurrent;
  }

  function resolveCluster(items, metric, linkage, drawToken, label, asyncState = null){
    if(!Array.isArray(items) || items.length < 2){
      return { result: null, promise: null };
    }
    if(!shouldUseClusterWorker(items)){
      return { result: hierarchicalCluster(items, metric, linkage), promise: null };
    }
    const workerApi = Shared.Workers;
    if(!workerApi
      || typeof workerApi.runTask !== 'function'
      || typeof workerApi.isSupported !== 'function'
      || !workerApi.isSupported()){
      debugLog('Debug: heatmap large clustering skipped - worker unavailable', { label, count: items.length });
      return { result: null, promise: null };
    }
    const payload = buildClusterWorkerPayload(items, metric, linkage);
    const workerTabId = asyncState?.meta?.tabId || getHeatmapProjectionTabId() || null;
    const workerMeta = asyncState?.meta && typeof asyncState.meta === 'object' ? asyncState.meta : {};
    const workerRecordBase = {
      label: label || null,
      itemCount: items.length,
      metric,
      linkage,
      drawToken,
      componentKey: 'heatmap',
      tabId: workerTabId || null,
      sessionGeneration: workerMeta.sessionGeneration || null,
      dataSignature: typeof workerMeta.dataSignature === 'string' ? workerMeta.dataSignature : null,
      settingsSignature: typeof workerMeta.settingsSignature === 'string' ? workerMeta.settingsSignature : null
    };
    const workerSession = workerTabId ? getHeatmapSession(workerTabId, { tabId: workerTabId, reason: 'heatmap-cluster-worker' }, { create: false }) : getActiveHeatmapSessionForState();
    if(workerSession?.workers){
      workerSession.workers.set(`cluster:${label || 'unknown'}`, {
        ...workerRecordBase,
        status: 'pending',
        startedAt: Date.now()
      });
      workerSession.updatedAt = Date.now();
    }
    const drawJob = Shared.jobs?.getActiveFor?.({ component: 'heatmap', tabId: workerTabId, kind: 'graph' }) || null;
    const task = workerApi.runTask({
      name: `heatmap-cluster:${workerTabId || 'unowned'}`,
      url: HEATMAP_CLUSTER_WORKER.url,
      action: 'hierarchicalCluster',
      payload,
      timeoutMs: HEATMAP_CLUSTER_WORKER.timeoutMs,
      signal: drawJob?.signal || null,
      cancelStrategy: 'terminate'
    });
    const unregisterCleanup = asyncState?.scope?.registerCleanup?.(asyncState.meta, meta => {
      task.cancel?.(meta?.reason || 'heatmap-cluster-stale');
    }) || (() => {});
    const promise = task.then((result) => {
      if(!isHeatmapDrawCurrent(drawToken, asyncState)){
        if(workerSession?.workers){
          workerSession.workers.set(`cluster:${label || 'unknown'}`, {
            ...workerRecordBase,
            status: 'stale',
            completedAt: Date.now()
          });
          workerSession.updatedAt = Date.now();
        }
        debugLog('Debug: heatmap cluster worker result ignored', { label, reason: 'stale-draw' });
        return null;
      }
      const normalized = normalizeClusterResult(result, items);
      if(workerSession?.workers){
        workerSession.workers.set(`cluster:${label || 'unknown'}`, {
          ...workerRecordBase,
          status: 'done',
          algorithm: normalized?.algorithm || null,
          completedAt: Date.now()
        });
        workerSession.updatedAt = Date.now();
      }
      return normalized;
    }).catch((err) => {
      const current = isHeatmapDrawCurrent(drawToken, asyncState);
      if(workerSession?.workers){
        workerSession.workers.set(`cluster:${label || 'unknown'}`, {
          ...workerRecordBase,
          status: current ? 'error' : 'cancelled',
          error: err?.message || String(err),
          completedAt: Date.now()
        });
        workerSession.updatedAt = Date.now();
      }
      debugLog('Debug: heatmap cluster worker failed', { label, message: err?.message || String(err) });
      return null;
    }).finally(() => {
      unregisterCleanup();
    });
    debugLog('Debug: heatmap cluster worker scheduled', { label, count: items.length });
    return { result: null, promise };
  }

  function collectSettings(session = null, options = {}){
    const controls = getHeatmapControlState(session || getActiveHeatmapSessionForState(), { syncFromDom: options.syncFromDom !== false });
    const isCorrelation = controls.view.startsWith('corr');
    const settings = {
      view: controls.view,
      decimals: controls.decimals,
      correlationMethod: controls.method,
      useAbsolute: isCorrelation ? !!controls.useAbsolute : false,
      maskLower: isCorrelation ? !!controls.maskLower : false,
      showValues: !!controls.showValues,
      showSignificance: isCorrelation ? !!controls.showSignificance : false,
      significanceDisplay: controls.significanceDisplay,
      significanceThreshold: getHeatmapSignificanceThreshold(),
      cellSize: controls.cellSize,
      fontSize: controls.fontSize,
      palette: getHeatmapPalette(session || getActiveHeatmapSessionForState()),
      valueScale: getHeatmapValueScale(session || getActiveHeatmapSessionForState()),
      legendHeightMode: getHeatmapLegendHeightMode(session || getActiveHeatmapSessionForState()),
      filters: { ...controls.filters },
      adjust: {
        logTransform: !!controls.adjust.logTransform,
        logPlusOne: !!controls.adjust.logPlusOne,
        centerRowsMode: controls.adjust.centerRowsMode || null,
        normalizeRows: !!controls.adjust.normalizeRows,
        centerColumnsMode: controls.adjust.centerColumnsMode || null,
        normalizeColumns: !!controls.adjust.normalizeColumns
      },
      clustering: {
        rows: { ...controls.clustering.rows },
        columns: { ...controls.clustering.columns },
        linkage: controls.clustering.linkage
      }
    };
    state.logPlusOne = !!settings.adjust.logPlusOne;
    debugLog('Debug: heatmap collectSettings summary', settings);
    return settings;
  }

  function extractViewOptions(settings){
    if(!settings){
      return null;
    }
    return {
      view: settings.view,
      decimals: settings.decimals,
      useAbsolute: settings.useAbsolute,
      maskLower: settings.maskLower,
      showValues: settings.showValues,
      showSignificance: settings.showSignificance,
      significanceDisplay: settings.significanceDisplay,
      significanceThreshold: settings.significanceThreshold,
      cellSize: settings.cellSize,
      fontSize: settings.fontSize,
      palette: settings.palette,
      colors: settings.palette,
      valueScale: settings.valueScale,
      legendHeightMode: settings.legendHeightMode,
      correlationMethod: settings.correlationMethod
    };
  }

  function prepareProcessedDataFromRaw(raw, settings){
    if(!raw){
      return { ok: false, reason: 'no-data' };
    }
    let matrix = cloneMatrix(raw.matrix);
    const logResult = settings.adjust?.logTransform ? applyLogTransform(matrix) : null;
    const filterResult = filterRowsBySettings(matrix, raw.rowLabels, raw.rowMeta, settings.filters, raw.columnLabels.length);
    matrix = filterResult.matrix;
    let rowLabels = filterResult.rowLabels;
    let rowMeta = filterResult.rowMeta;
    let columnLabels = raw.columnLabels.slice();
    let columnMeta = raw.columnMeta.slice();
    let pruneResult = pruneEmptyColumns(matrix, columnLabels, columnMeta);
    matrix = pruneResult.matrix;
    columnLabels = pruneResult.columnLabels;
    columnMeta = pruneResult.columnMeta;
    if(matrix.length === 0 || columnLabels.length === 0){
      debugLog('Debug: heatmap prepareProcessedData filtered all data', {
        rowsRemaining: matrix.length,
        columnsRemaining: columnLabels.length
      });
      return {
        ok: false,
        reason: 'filtered-out',
        filterResult,
        pruneResult
      };
    }
    const adjustConfig = {
      centerRowsMode: settings.adjust?.centerRowsMode,
      normalizeRows: !!settings.adjust?.normalizeRows,
      centerColumnsMode: settings.adjust?.centerColumnsMode,
      normalizeColumns: !!settings.adjust?.normalizeColumns
    };
    const adjustmentSummary = applyAdjustments(matrix, adjustConfig);
    pruneResult = pruneEmptyColumns(matrix, columnLabels, columnMeta);
    matrix = pruneResult.matrix;
    columnLabels = pruneResult.columnLabels;
    columnMeta = pruneResult.columnMeta;
    if(matrix.length === 0 || columnLabels.length === 0){
      debugLog('Debug: heatmap prepareProcessedData removed all columns after adjustment');
      return {
        ok: false,
        reason: 'adjustment-empty',
        filterResult,
        adjustmentSummary,
        pruneResult
      };
    }
    rowLabels = rowLabels.slice();
    rowMeta = rowMeta.slice();
    let finiteCount = 0;
    let finiteSum = 0;
    let min = Infinity;
    let max = -Infinity;
    for(const row of matrix){
      for(const value of row){
        if(!Number.isFinite(value)){
          continue;
        }
        finiteCount++;
        finiteSum += value;
        if(value < min) min = value;
        if(value > max) max = value;
      }
    }
    if(!finiteCount){
      min = NaN;
      max = NaN;
    }
    const mean = finiteCount ? (finiteSum / finiteCount) : NaN;
    return {
      ok: true,
      matrix,
      rowLabels,
      columnLabels,
      rowMeta,
      columnMeta,
      raw,
      filterResult,
      adjustmentSummary,
      logResult,
      stats: {
        min,
        max,
        mean,
        finiteCount,
        initialRows: raw.rowLabels.length,
        initialColumns: raw.columnLabels.length,
        rowsFiltered: filterResult.removed.length,
        columnsRemoved: raw.columnLabels.length - columnLabels.length,
        skippedRows: raw.skippedRows,
        logApplied: !!settings.adjust?.logTransform
      }
    };
  }

  function prepareProcessedData(settings){
    const raw = collectTableData();
    if(!raw){
      debugLog('Debug: heatmap prepareProcessedData missing raw data');
      return { ok: false, reason: 'no-data' };
    }
    return prepareProcessedDataFromRaw(raw, settings);
  }

  function collectHeatmapDataTransformTokens(settings){
    const tokens = [];
    const adjust = settings?.adjust || {};
    const filters = settings?.filters || {};
    if(adjust.logTransform){
      tokens.push(adjust.logPlusOne ? 'log2(x+1)' : 'log2(x)');
    }
    if(filters.presentEnabled){
      const value = Number(filters.presentThreshold);
      const threshold = Number.isFinite(value) ? value : '';
      tokens.push(`Present >= ${threshold}%`);
    }
    if(filters.sdEnabled){
      const value = Number(filters.sdThreshold);
      const threshold = Number.isFinite(value) ? value : '';
      tokens.push(`SD >= ${threshold}`);
    }
    if(filters.absEnabled){
      const count = Number(filters.absCount);
      const absValue = Number(filters.absValue);
      const countText = Number.isFinite(count) ? count : '';
      const valueText = Number.isFinite(absValue) ? absValue : '';
      tokens.push(`Abs count >= ${countText} @ ${valueText}`);
    }
    if(filters.rangeEnabled){
      const value = Number(filters.rangeThreshold);
      const threshold = Number.isFinite(value) ? value : '';
      tokens.push(`Range >= ${threshold}`);
    }
    if(adjust.centerRowsMode){
      tokens.push(`Center rows (${adjust.centerRowsMode})`);
    }
    if(adjust.centerColumnsMode){
      tokens.push(`Center cols (${adjust.centerColumnsMode})`);
    }
    if(adjust.normalizeRows){
      tokens.push('Normalize rows (z)');
    }
    if(adjust.normalizeColumns){
      tokens.push('Normalize cols (z)');
    }
    return tokens;
  }

  function hasHeatmapDataTransformSelection(settings){
    return collectHeatmapDataTransformTokens(settings).length > 0;
  }

  function normalizeHeatmapDataTransformState(source){
    const filters = source?.filters || {};
    const adjust = source?.adjust || {};
    const normalizeMode = (value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if(normalized === 'median'){
        return 'median';
      }
      if(normalized === 'mean'){
        return 'mean';
      }
      return null;
    };
    const toNumberOr = (value, fallback) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };
    return {
      filters: {
        presentEnabled: !!filters.presentEnabled,
        presentThreshold: toNumberOr(filters.presentThreshold, 80),
        sdEnabled: !!filters.sdEnabled,
        sdThreshold: toNumberOr(filters.sdThreshold, 0),
        absEnabled: !!filters.absEnabled,
        absCount: Math.max(1, Math.round(toNumberOr(filters.absCount, 1))),
        absValue: toNumberOr(filters.absValue, 0),
        rangeEnabled: !!filters.rangeEnabled,
        rangeThreshold: toNumberOr(filters.rangeThreshold, 0)
      },
      adjust: {
        logTransform: !!adjust.logTransform,
        logPlusOne: !!adjust.logPlusOne,
        centerRowsMode: normalizeMode(adjust.centerRowsMode ?? adjust.centerRows),
        normalizeRows: !!adjust.normalizeRows,
        centerColumnsMode: normalizeMode(adjust.centerColumnsMode ?? adjust.centerColumns),
        normalizeColumns: !!adjust.normalizeColumns
      }
    };
  }

  function parseHeatmapDataTransformStateFromSummary(summaryLabel){
    const text = String(summaryLabel || '').trim();
    if(!text || text === 'heatmap-transform'){
      return null;
    }
    const parsed = normalizeHeatmapDataTransformState();
    let matched = false;
    text.split(/\s+\+\s+/).forEach(token => {
      const trimmed = String(token || '').trim();
      let match = null;
      if(!trimmed){
        return;
      }
      if(/^log2\(x\+1\)$/i.test(trimmed)){
        parsed.adjust.logTransform = true;
        parsed.adjust.logPlusOne = true;
        matched = true;
        return;
      }
      if(/^log2\(x\)$/i.test(trimmed)){
        parsed.adjust.logTransform = true;
        matched = true;
        return;
      }
      match = trimmed.match(/^Present >=\s*(-?\d+(?:\.\d+)?)%$/i);
      if(match){
        parsed.filters.presentEnabled = true;
        parsed.filters.presentThreshold = Number(match[1]);
        matched = true;
        return;
      }
      match = trimmed.match(/^SD >=\s*(-?\d+(?:\.\d+)?)$/i);
      if(match){
        parsed.filters.sdEnabled = true;
        parsed.filters.sdThreshold = Number(match[1]);
        matched = true;
        return;
      }
      match = trimmed.match(/^Abs count >=\s*(-?\d+(?:\.\d+)?)\s*@\s*(-?\d+(?:\.\d+)?)$/i);
      if(match){
        parsed.filters.absEnabled = true;
        parsed.filters.absCount = Number(match[1]);
        parsed.filters.absValue = Number(match[2]);
        matched = true;
        return;
      }
      match = trimmed.match(/^Range >=\s*(-?\d+(?:\.\d+)?)$/i);
      if(match){
        parsed.filters.rangeEnabled = true;
        parsed.filters.rangeThreshold = Number(match[1]);
        matched = true;
        return;
      }
      match = trimmed.match(/^Center rows \((mean|median)\)$/i);
      if(match){
        parsed.adjust.centerRowsMode = String(match[1]).toLowerCase();
        matched = true;
        return;
      }
      match = trimmed.match(/^Center cols \((mean|median)\)$/i);
      if(match){
        parsed.adjust.centerColumnsMode = String(match[1]).toLowerCase();
        matched = true;
        return;
      }
      if(/^Normalize rows \(z\)$/i.test(trimmed)){
        parsed.adjust.normalizeRows = true;
        matched = true;
        return;
      }
      if(/^Normalize cols \(z\)$/i.test(trimmed)){
        parsed.adjust.normalizeColumns = true;
        matched = true;
      }
    });
    return matched ? parsed : null;
  }

  function resolveHeatmapMaterializedTransformState(view){
    if(!isHeatmapMaterializedDataView(view)){
      return null;
    }
    const explicit = view?.transformSpec?.dataTransformState;
    if(explicit && typeof explicit === 'object'){
      return normalizeHeatmapDataTransformState(explicit);
    }
    return parseHeatmapDataTransformStateFromSummary(view?.summary?.transform);
  }

  function resolveHeatmapDataTransformControlStateForView(view, manager){
    let candidate = view || null;
    const viewsManager = manager || null;
    const visited = new Set();
    while(candidate && isHeatmapCorrelationMatrixDataView(candidate) && !visited.has(candidate.id)){
      visited.add(candidate.id);
      const nextId = String(candidate.sourceViewId || 'raw');
      candidate = viewsManager?.getView?.(nextId) || null;
    }
    return resolveHeatmapMaterializedTransformState(candidate);
  }

  function applyHeatmapDataTransformControlState(transformState){
    const normalized = transformState ? normalizeHeatmapDataTransformState(transformState) : null;
    runWithHeatmapControlSuspension(() => {
      if(normalized){
        if(refs.filterPresentValue){ refs.filterPresentValue.value = String(normalized.filters.presentThreshold); }
        if(refs.filterSdValue){ refs.filterSdValue.value = String(normalized.filters.sdThreshold); }
        if(refs.filterAbsCount){ refs.filterAbsCount.value = String(normalized.filters.absCount); }
        if(refs.filterAbsValue){ refs.filterAbsValue.value = String(normalized.filters.absValue); }
        if(refs.filterRangeValue){ refs.filterRangeValue.value = String(normalized.filters.rangeThreshold); }
        const rowMode = normalized.adjust.centerRowsMode || 'mean';
        const rowRadio = queryHeatmapRoot(`input[name="heatmapCenterGenesMode"][value="${rowMode}"]`);
        if(rowRadio){ rowRadio.checked = true; }
        const colMode = normalized.adjust.centerColumnsMode || 'mean';
        const colRadio = queryHeatmapRoot(`input[name="heatmapCenterArraysMode"][value="${colMode}"]`);
        if(colRadio){ colRadio.checked = true; }
        state.logPlusOne = !!normalized.adjust.logPlusOne;
      }else{
        state.logPlusOne = false;
      }
      if(refs.logTransform){
        refs.logTransform.checked = !!normalized?.adjust?.logTransform;
      }
      if(refs.centerGenes){
        refs.centerGenes.checked = !!normalized?.adjust?.centerRowsMode;
        refs.centerGenes.dispatchEvent(new Event('change'));
      }
      if(refs.centerArrays){
        refs.centerArrays.checked = !!normalized?.adjust?.centerColumnsMode;
        refs.centerArrays.dispatchEvent(new Event('change'));
      }
      if(refs.normalizeGenes){
        refs.normalizeGenes.checked = !!normalized?.adjust?.normalizeRows;
      }
      if(refs.normalizeArrays){
        refs.normalizeArrays.checked = !!normalized?.adjust?.normalizeColumns;
      }
      if(refs.filterPresentEnable){
        refs.filterPresentEnable.checked = !!normalized?.filters?.presentEnabled;
        refs.filterPresentEnable.dispatchEvent(new Event('change'));
      }
      if(refs.filterSdEnable){
        refs.filterSdEnable.checked = !!normalized?.filters?.sdEnabled;
        refs.filterSdEnable.dispatchEvent(new Event('change'));
      }
      if(refs.filterAbsEnable){
        refs.filterAbsEnable.checked = !!normalized?.filters?.absEnabled;
        refs.filterAbsEnable.dispatchEvent(new Event('change'));
      }
      if(refs.filterRangeEnable){
        refs.filterRangeEnable.checked = !!normalized?.filters?.rangeEnabled;
        refs.filterRangeEnable.dispatchEvent(new Event('change'));
      }
    });
    syncHeatmapControlStateToSession(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), captureHeatmapControlStateFromDom());
  }

  function buildHeatmapDerivedViewTitle(settings){
    const tokens = collectHeatmapDataTransformTokens(settings);
    if(!tokens.length){
      return 'Derived';
    }
    const joined = tokens.join(' + ');
    return joined.length > 56 ? `${joined.slice(0, 53)}...` : joined;
  }

  function buildHeatmapDerivedViewSummary(settings, processed){
    const tokens = collectHeatmapDataTransformTokens(settings);
    const summaryLabel = tokens.join(' + ');
    return {
      transform: summaryLabel || 'heatmap-transform',
      rows: Number(processed?.matrix?.length) || 0,
      cols: Number(processed?.columnLabels?.length) || 0,
      changedCells: Number(processed?.stats?.finiteCount) || 0,
      numericCells: Number(processed?.stats?.finiteCount) || 0,
      skippedCells: 0,
      warnings: []
    };
  }

  function buildHeatmapDerivedTableData(processed){
    if(!processed || !processed.ok){
      return null;
    }
    const rowHeader = processed.raw?.rowHeaderLabel || 'Row';
    const header = [rowHeader].concat(Array.isArray(processed.columnLabels) ? processed.columnLabels.slice() : []);
    const rows = Array.isArray(processed.matrix)
      ? processed.matrix.map((row, rowIndex) => {
        const sourceLabel = processed.rowLabels?.[rowIndex];
        const label = sourceLabel == null || String(sourceLabel).trim() === ''
          ? `Row ${rowIndex + 1}`
          : String(sourceLabel);
        const values = Array.isArray(row)
          ? row.map(value => (Number.isFinite(value) ? value : ''))
          : [];
        return [label, ...values];
      })
      : [];
    return [header, ...rows];
  }

  function isHeatmapMaterializedDataView(view){
    return !!(view && view.kind === 'derived' && view.transformSpec?.type === 'heatmapMaterialized');
  }

  function isHeatmapCorrelationMatrixDataView(view){
    return !!(view && view.kind === 'derived' && view.transformSpec?.type === 'heatmapCorrelationMatrix');
  }

  function resolveHeatmapMaterializationSourceView(manager, view){
    let candidate = view || null;
    const visited = new Set();
    while(candidate && isHeatmapMaterializedDataView(candidate) && !visited.has(candidate.id)){
      visited.add(candidate.id);
      const nextId = String(candidate.sourceViewId || 'raw');
      const nextView = manager?.getView?.(nextId) || null;
      if(!nextView || nextView === candidate){
        break;
      }
      candidate = nextView;
    }
    return candidate || manager?.getView?.('raw') || null;
  }

  function resolveHeatmapViewContext(hotInstance){
    const hot = hotInstance || state.ensureHotForActiveTab?.() || state.hot || null;
    const manager = hot ? (hot.__heatmapDataViewsManager || null) : null;
    const activeView = manager?.getActiveView?.() || null;
    let sourceView = activeView;
    let sourceViewId = String(activeView?.id || manager?.getActiveViewId?.() || 'raw');
    const visited = new Set();
    while(sourceView && isHeatmapCorrelationMatrixDataView(sourceView) && !visited.has(sourceView.id)){
      visited.add(sourceView.id);
      const nextId = String(sourceView.sourceViewId || 'raw');
      const nextView = manager?.getView?.(nextId) || null;
      if(!nextView || nextView === sourceView){
        const rawFallback = manager?.getView?.('raw') || null;
        sourceView = rawFallback || nextView || sourceView;
        sourceViewId = String(sourceView?.id || nextId || 'raw');
        break;
      }
      sourceView = nextView;
      sourceViewId = String(nextView.id || nextId || 'raw');
    }
    if(!sourceView && manager){
      sourceView = manager.getView?.('raw') || activeView || null;
      sourceViewId = String(sourceView?.id || 'raw');
    }
    const sourceData = (() => {
      if(hot && activeView && sourceView && activeView === sourceView){
        if(typeof hot.getIncludedDataMatrix === 'function'){
          return hot.getIncludedDataMatrix();
        }
        if(Shared.hot?.getIncludedDataMatrix){
          return Shared.hot.getIncludedDataMatrix(hot);
        }
      }
      const rawMatrix = Array.isArray(sourceView?.data)
        ? sourceView.data
        : (Array.isArray(hot?.getData?.()) ? hot.getData() : []);
      if(Shared.hot?.applyExclusionsToMatrix){
        return Shared.hot.applyExclusionsToMatrix(rawMatrix, sourceView?.exclusions || null);
      }
      return rawMatrix;
    })();
    return {
      hot,
      manager,
      activeView,
      activeViewId: String(activeView?.id || manager?.getActiveViewId?.() || 'raw'),
      sourceView,
      sourceViewId,
      sourceData
    };
  }

  function getHeatmapCorrelationMatrixViewRecords(manager){
    if(!manager || typeof manager.getViews !== 'function' || typeof manager.getView !== 'function'){
      return [];
    }
    return (manager.getViews() || [])
      .map(view => manager.getView(view.id))
      .filter(isHeatmapCorrelationMatrixDataView);
  }

  function buildHeatmapCorrelationMatrixViewTitle(settings){
    return settings?.view === 'corr-rows'
      ? 'Correlation matrix (rows)'
      : 'Correlation matrix (columns)';
  }

  function buildHeatmapCorrelationMatrixViewSummary(settings, model){
    return {
      transform: 'correlation-matrix',
      axis: settings?.view === 'corr-rows' ? 'rows' : 'columns',
      method: settings?.correlationMethod || 'pearson',
      display: settings?.useAbsolute ? 'absolute' : 'signed',
      rows: Number(model?.orderedRowLabels?.length) || 0,
      cols: Number(model?.orderedColumnLabels?.length) || 0
    };
  }

  function buildHeatmapCorrelationMatrixViewData(model, settings){
    if(!model || model.type !== 'correlation'){
      return null;
    }
    const rowHeader = settings?.view === 'corr-rows' ? 'Row' : 'Column';
    const header = [rowHeader].concat(Array.isArray(model.orderedColumnLabels) ? model.orderedColumnLabels.slice() : []);
    const useAbsolute = !!settings?.useAbsolute;
    const rows = Array.isArray(model.cells)
      ? model.cells.map((row, rowIndex) => {
        const label = model.orderedRowLabels?.[rowIndex] || `${rowHeader} ${rowIndex + 1}`;
        const values = Array.isArray(row)
          ? row.map(cell => {
            const raw = Number(cell?.raw);
            if(!Number.isFinite(raw)){
              return '';
            }
            return useAbsolute ? Math.abs(raw) : raw;
          })
          : [];
        return [label, ...values];
      })
      : [];
    return [header, ...rows];
  }

  function isHeatmapMatrixCellEmpty(value){
    return value == null || value === '';
  }

  function trimHeatmapViewMatrix(matrix){
    if(!Array.isArray(matrix)){
      return [];
    }
    let rowEnd = matrix.length;
    while(rowEnd > 0){
      const row = Array.isArray(matrix[rowEnd - 1]) ? matrix[rowEnd - 1] : [];
      const hasData = row.some(cell => !isHeatmapMatrixCellEmpty(cell));
      if(hasData){
        break;
      }
      rowEnd -= 1;
    }
    const trimmedRows = matrix.slice(0, rowEnd).map(row => Array.isArray(row) ? row.slice() : []);
    let colEnd = 0;
    trimmedRows.forEach(row => {
      for(let colIndex = row.length - 1; colIndex >= 0; colIndex -= 1){
        if(!isHeatmapMatrixCellEmpty(row[colIndex])){
          colEnd = Math.max(colEnd, colIndex + 1);
          break;
        }
      }
    });
    return trimmedRows.map(row => row.slice(0, colEnd));
  }

  function areHeatmapViewMatricesEqual(left, right){
    const normalizedLeft = trimHeatmapViewMatrix(left);
    const normalizedRight = trimHeatmapViewMatrix(right);
    if(normalizedLeft === normalizedRight){
      return true;
    }
    if(!Array.isArray(normalizedLeft) || !Array.isArray(normalizedRight) || normalizedLeft.length !== normalizedRight.length){
      return false;
    }
    for(let rowIndex = 0; rowIndex < normalizedLeft.length; rowIndex += 1){
      const leftRow = normalizedLeft[rowIndex];
      const rightRow = normalizedRight[rowIndex];
      if(!Array.isArray(leftRow) || !Array.isArray(rightRow) || leftRow.length !== rightRow.length){
        return false;
      }
      for(let colIndex = 0; colIndex < leftRow.length; colIndex += 1){
        const leftValue = leftRow[colIndex];
        const rightValue = rightRow[colIndex];
        if(Number.isNaN(leftValue) && Number.isNaN(rightValue)){
          continue;
        }
        if(leftValue !== rightValue){
          return false;
        }
      }
    }
    return true;
  }

  function updateHeatmapCorrelationMatrixViewSource(manager, sourceViewId){
    if(!manager || typeof manager.getActiveView !== 'function'){
      return false;
    }
    const activeView = manager.getActiveView();
    if(!isHeatmapCorrelationMatrixDataView(activeView)){
      return false;
    }
    activeView.sourceViewId = String(sourceViewId || 'raw');
    manager.refresh?.();
    return true;
  }

  function removeHeatmapCorrelationMatrixDataViews(options = {}){
    const manager = options.manager || resolveHeatmapViewContext(options.hot).manager;
    if(!manager || typeof manager.removeView !== 'function'){
      return false;
    }
    const views = getHeatmapCorrelationMatrixViewRecords(manager);
    if(!views.length){
      return false;
    }
    const activeViewId = String(manager.getActiveViewId?.() || '');
    let removedAny = false;
    let activeRemoved = false;
    let fallbackViewId = String(options.fallbackViewId || resolveHeatmapViewContext(options.hot).sourceViewId || 'raw');
    views.forEach(view => {
      if(!view?.id){
        return;
      }
      if(view.id === activeViewId){
        activeRemoved = true;
        fallbackViewId = String(view.sourceViewId || fallbackViewId || 'raw');
      }
      removedAny = manager.removeView(view.id, {
        reason: options.reason || 'heatmap-correlation-view-remove',
        silent: true
      }) || removedAny;
    });
    if(activeRemoved){
      manager.activateView(fallbackViewId || 'raw', {
        reason: options.reason || 'heatmap-correlation-view-remove'
      });
    }
    return removedAny;
  }

  function syncHeatmapCorrelationMatrixDataView(model, settings, options = {}){
    const context = options.context || resolveHeatmapViewContext(options.hot);
    const manager = context.manager;
    const hot = context.hot;
    if(!manager){
      return false;
    }
    const isCorrelation = settings?.view === 'corr-columns' || settings?.view === 'corr-rows';
    if(!isCorrelation || !model || model.type !== 'correlation'){
      return removeHeatmapCorrelationMatrixDataViews({
        manager,
        hot,
        fallbackViewId: context.sourceViewId || 'raw',
        reason: options.reason || 'heatmap-correlation-view-clear'
      });
    }
    const data = buildHeatmapCorrelationMatrixViewData(model, settings);
    if(!Array.isArray(data) || !data.length){
      return false;
    }
    const title = buildHeatmapCorrelationMatrixViewTitle(settings);
    const summary = buildHeatmapCorrelationMatrixViewSummary(settings, model);
    const transformSpec = {
      type: 'heatmapCorrelationMatrix',
      axis: settings.view === 'corr-rows' ? 'rows' : 'columns',
      method: settings.correlationMethod || 'pearson',
      useAbsolute: !!settings.useAbsolute
    };
    const correlationViews = getHeatmapCorrelationMatrixViewRecords(manager);
    const targetView = correlationViews.length ? correlationViews[0] : null;
    correlationViews.slice(1).forEach(view => {
      if(view?.id){
        manager.removeView(view.id, {
          reason: options.reason || 'heatmap-correlation-view-dedupe',
          silent: true
        });
      }
    });
    if(targetView){
      targetView.title = title;
      targetView.data = data;
      targetView.sourceViewId = String(context.sourceViewId || 'raw');
      targetView.transformSpec = transformSpec;
      targetView.summary = summary;
      manager.setViewExclusionSharing(targetView.id, false, { exclusions: null });
      manager.refresh?.();
      if(String(manager.getActiveViewId?.() || '') === String(targetView.id) && hot && typeof hot.loadData === 'function'){
        const currentData = typeof hot.getData === 'function' ? hot.getData() : null;
        if(!areHeatmapViewMatricesEqual(currentData, data)){
          hot.__heatmapPendingProgrammaticLoadSource = HEATMAP_LOAD_SOURCE_CORRELATION_SYNC;
          hot.loadData(data, {
            source: HEATMAP_LOAD_SOURCE_CORRELATION_SYNC
          });
        }
        syncHeatmapHotExclusions(hot, null, 'correlation-view-sync');
      }
      debugLog('Debug: heatmap correlation matrix data view updated', {
        title,
        sourceViewId: targetView.sourceViewId,
        rows: data.length,
        cols: data[0]?.length || 0
      });
      return true;
    }
    const createdView = manager.createDerivedView({
      title,
      data,
      sourceViewId: context.sourceViewId || 'raw',
      transformSpec,
      summary,
      shareExclusions: false,
      exclusions: null,
      activate: options.activate === true,
      reason: options.reason || 'heatmap-correlation-view-create'
    });
    debugLog('Debug: heatmap correlation matrix data view created', {
      id: createdView?.id || null,
      title,
      sourceViewId: context.sourceViewId || 'raw',
      rows: data.length,
      cols: data[0]?.length || 0
    });
    return !!createdView;
  }

  function stripHeatmapAdjustAndFilters(settings){
    return {
      ...settings,
      filters: {
        ...(settings?.filters || {}),
        presentEnabled: false,
        sdEnabled: false,
        absEnabled: false,
        rangeEnabled: false
      },
      adjust: {
        ...(settings?.adjust || {}),
        logTransform: false,
        logPlusOne: false,
        centerRowsMode: null,
        normalizeRows: false,
        centerColumnsMode: null,
        normalizeColumns: false
      }
    };
  }

  function resolveHeatmapEffectiveSettings(settings){
    const context = resolveHeatmapViewContext();
    if(isHeatmapMaterializedDataView(context.sourceView)){
      return stripHeatmapAdjustAndFilters(settings);
    }
    return settings;
  }

  function clearHeatmapAdjustAndFilterControls(){
    applyHeatmapDataTransformControlState(null);
  }

  function findHeatmapMaterializedViewForSource(manager, sourceViewId){
    const views = manager?.getViews?.() || [];
    const sourceId = String(sourceViewId || 'raw');
    for(let i = 0; i < views.length; i += 1){
      const view = views[i];
      if(!isHeatmapMaterializedDataView(view)){
        continue;
      }
      const viewSourceId = String(view.sourceViewId || 'raw');
      if(viewSourceId === sourceId){
        return view;
      }
    }
    return null;
  }

  function materializeHeatmapSelectionToDataView(reason){
    if(state.suspendDataViewMaterialization){
      return false;
    }
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureHeatmapDataViewsForHot(hot, {
      wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
      container: hot.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
    });
    if(!manager || typeof manager.createDerivedView !== 'function'){
      console.warn('heatmap data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    syncHeatmapActiveDataViewFromHot(hot, 'transform-before');
    const viewContext = resolveHeatmapViewContext(hot);
    const activeView = viewContext.activeView;
    const sourceViewId = viewContext.sourceViewId || 'raw';
    const keepCorrelationActive = isHeatmapCorrelationMatrixDataView(activeView);
    const sourceView = manager.getView?.(sourceViewId) || manager.getView?.('raw') || null;
    const materializationSourceView = resolveHeatmapMaterializationSourceView(manager, sourceView);
    const materializationSourceViewId = String(materializationSourceView?.id || sourceView?.sourceViewId || sourceViewId || 'raw');
    const sourceData = Array.isArray(materializationSourceView?.data) ? materializationSourceView.data : (hot.getData?.() || []);
    const sourceRaw = collectTableDataFromMatrix(sourceData);
    if(!sourceRaw){
      if(typeof global.alert === 'function'){
        global.alert('No valid numeric matrix was found to apply the selected heatmap transformations.');
      }
      return false;
    }
    const settings = collectSettings();
    const existingMaterialized = isHeatmapMaterializedDataView(activeView)
      ? activeView
      : (isHeatmapMaterializedDataView(sourceView)
        ? sourceView
        : findHeatmapMaterializedViewForSource(manager, materializationSourceViewId));
    if(!hasHeatmapDataTransformSelection(settings)){
      if(existingMaterialized){
        const wasActive = existingMaterialized.id === manager.getActiveViewId?.() && !keepCorrelationActive;
        manager.removeView(existingMaterialized.id, {
          reason: 'heatmap-transform-clear',
          silent: !wasActive
        });
        if(wasActive && materializationSourceViewId !== 'raw'){
          manager.activateView(materializationSourceViewId, { reason: 'heatmap-transform-clear' });
        }
        if(keepCorrelationActive){
          updateHeatmapCorrelationMatrixViewSource(manager, materializationSourceViewId);
          applyHeatmapDataTransformControlState(
            resolveHeatmapDataTransformControlStateForView(manager.getActiveView?.() || activeView, manager)
          );
          markHeatmapOverlayPending('heatmap-transform-clear-correlation-source');
          scheduleHeatmapDrawForSession(getHeatmapSessionForHot(hot, { reason: 'heatmap-transform-clear-correlation-source' }, { create: false }), {
            force: true,
            reason: 'heatmap-transform-clear-correlation-source'
          });
        }
        return true;
      }
      return false;
    }
    const processed = prepareProcessedDataFromRaw(sourceRaw, settings);
    if(!processed?.ok){
      if(processed?.reason === 'filtered-out' && typeof global.alert === 'function'){
        global.alert('No rows passed the selected filters. Adjust filter thresholds and try again.');
      }else if(processed?.reason === 'adjustment-empty' && typeof global.alert === 'function'){
        global.alert('All columns were removed after adjustments. Please review normalization/centering settings.');
      }
      debugLog('Debug: heatmap data view materialization skipped', {
        reason: reason || 'transform',
        processedReason: processed?.reason || null
      });
      return false;
    }
    const derivedData = buildHeatmapDerivedTableData(processed);
    if(!Array.isArray(derivedData) || !derivedData.length){
      return false;
    }
    if(existingMaterialized){
      manager.removeView(existingMaterialized.id, { reason: 'heatmap-transform-update', silent: true });
    }
    const createdView = manager.createDerivedView({
      title: buildHeatmapDerivedViewTitle(settings),
      data: derivedData,
      sourceViewId: materializationSourceViewId,
      transformSpec: {
        type: 'heatmapMaterialized',
        dataTransformState: normalizeHeatmapDataTransformState(settings)
      },
      summary: buildHeatmapDerivedViewSummary(settings, processed),
      shareExclusions: false,
      exclusions: null,
      activate: !keepCorrelationActive,
      reason: reason || 'heatmap-transform'
    });
    if(!createdView || !createdView.id){
      return false;
    }
    if(keepCorrelationActive){
      updateHeatmapCorrelationMatrixViewSource(manager, createdView.id);
      markHeatmapOverlayPending('heatmap-transform-correlation-source');
      scheduleHeatmapDrawForSession(getHeatmapSessionForHot(hot, { reason: 'heatmap-transform-correlation-source' }, { create: false }), {
        force: true,
        reason: 'heatmap-transform-correlation-source'
      });
    }else{
      manager.activateView(createdView.id, { reason: reason || 'heatmap-transform' });
    }
    debugLog('Debug: heatmap derived data view created', {
      title: createdView.title || null,
      rows: derivedData.length,
      cols: derivedData[0]?.length || 0,
      reason: reason || 'heatmap-transform'
    });
    return true;
  }

  function resolveHeatmapValueScaleStats(stats, overrides){
    const normalizedOverrides = normalizeHeatmapValueScale(overrides);
    const autoMin = Number(stats?.min);
    const autoMax = Number(stats?.max);
    const hasMinOverride = Number.isFinite(normalizedOverrides.min);
    const hasMaxOverride = Number.isFinite(normalizedOverrides.max);
    const customized = hasMinOverride || hasMaxOverride;
    let min = hasMinOverride ? normalizedOverrides.min : autoMin;
    let max = hasMaxOverride ? normalizedOverrides.max : autoMax;

    if(Number.isFinite(min) && Number.isFinite(max) && min > max){
      if(hasMinOverride && hasMaxOverride){
        [min, max] = [max, min];
      }else{
        min = autoMin;
        max = autoMax;
      }
    }

    if(customized && Number.isFinite(min) && Number.isFinite(max) && min === max && autoMin !== autoMax){
      min = autoMin;
      max = autoMax;
    }

    const resolved = {
      min,
      max,
      autoMin,
      autoMax,
      customized,
      hasMinOverride,
      hasMaxOverride
    };
    debugLog('Debug: heatmap value scale resolved', resolved);
    return resolved;
  }

  function resolveHeatmapModelValueScale(model, viewOptions){
    if(!model || model.type !== 'values'){
      return null;
    }
    const baseStats = model.valueStats?.stats || {
      min: model.valueStats?.min,
      max: model.valueStats?.max
    };
    const overrideScale = (viewOptions && Object.prototype.hasOwnProperty.call(viewOptions, 'valueScale'))
      ? viewOptions.valueScale
      : model.valueStats?.scale;
    return resolveHeatmapValueScaleStats(baseStats, overrideScale);
  }

  function createValueColorMapper(stats, palette){
    const min = stats?.min;
    const max = stats?.max;
    if(!Number.isFinite(min) || !Number.isFinite(max) || min === max){
      const zeroColor = rgbToCss(hexToRgb(palette.zero || DEFAULT_HEATMAP_PALETTE.zero));
      return () => zeroColor;
    }
    if(min < 0 && max > 0){
      const maxAbs = Math.max(Math.abs(min), Math.abs(max)) || 1;
      return value => {
        if(!Number.isFinite(value)) return '#d0d0d0';
        const normalized = value / maxAbs;
        return colorForValue({ raw: normalized, value: normalized }, {
          negative: hexToRgb(palette.negative || DEFAULT_HEATMAP_PALETTE.negative),
          zero: hexToRgb(palette.zero || DEFAULT_HEATMAP_PALETTE.zero),
          positive: hexToRgb(palette.positive || DEFAULT_HEATMAP_PALETTE.positive)
        }, false);
      };
    }
    if(max <= 0){
      const span = Math.abs(min - max) || Math.abs(min) || 1;
      return value => {
        if(!Number.isFinite(value)) return '#d0d0d0';
        const normalized = (value - max) / (min - max || -span);
        return mixColor(hexToRgb(palette.negative || DEFAULT_HEATMAP_PALETTE.negative), hexToRgb(palette.zero || DEFAULT_HEATMAP_PALETTE.zero), Math.min(1, Math.max(0, normalized)));
      };
    }
    const range = max - min || 1;
    return value => {
      if(!Number.isFinite(value)) return '#d0d0d0';
      const normalized = (value - min) / range;
      return mixColor(hexToRgb(palette.zero || DEFAULT_HEATMAP_PALETTE.zero), hexToRgb(palette.positive || DEFAULT_HEATMAP_PALETTE.positive), Math.min(1, Math.max(0, normalized)));
    };
  }

  function computePearson(xs, ys){
    const n = xs.length;
    if(n <= 1) return NaN;
    if(global.jStat && typeof global.jStat.corrcoeff === 'function'){
      return global.jStat.corrcoeff(xs, ys);
    }
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for(let i = 0; i < n; i += 1){
      const x = xs[i];
      const y = ys[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if(denominator === 0) return NaN;
    return numerator / denominator;
  }

  function rankValues(values){
    const entries = values.map((value, index) => ({ value, index }));
    entries.sort((a, b) => a.value - b.value);
    const ranks = new Array(values.length);
    let i = 0;
    while(i < entries.length){
      let j = i + 1;
      while(j < entries.length && entries[j].value === entries[i].value){
        j += 1;
      }
      const rank = (i + j + 1) / 2;
      for(let k = i; k < j; k += 1){
        ranks[entries[k].index] = rank;
      }
      i = j;
    }
    return ranks;
  }

  function computeCorrelation(xs, ys, method){
    if(xs.length !== ys.length || xs.length < 2) return NaN;
    if(method === 'spearman'){
      const rankX = rankValues(xs);
      const rankY = rankValues(ys);
      return computePearson(rankX, rankY);
    }
    return computePearson(xs, ys);
  }

  function packedDistanceIndex(size, i, j){
    if(i === j){ return -1; }
    let a = i;
    let b = j;
    if(a > b){
      a = j;
      b = i;
    }
    return (a * (2 * size - a - 1)) / 2 + (b - a - 1);
  }

  function createMinHeap(compare){
    const data = [];
    const swap = (i, j) => {
      const tmp = data[i];
      data[i] = data[j];
      data[j] = tmp;
    };
    const bubbleUp = index => {
      let i = index;
      while(i > 0){
        const parent = Math.floor((i - 1) / 2);
        if(compare(data[i], data[parent]) >= 0){ break; }
        swap(i, parent);
        i = parent;
      }
    };
    const bubbleDown = index => {
      let i = index;
      while(true){
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if(left < data.length && compare(data[left], data[smallest]) < 0){
          smallest = left;
        }
        if(right < data.length && compare(data[right], data[smallest]) < 0){
          smallest = right;
        }
        if(smallest === i){ break; }
        swap(i, smallest);
        i = smallest;
      }
    };
    return {
      push(item){
        data.push(item);
        bubbleUp(data.length - 1);
      },
      pop(){
        if(data.length === 0){ return null; }
        const top = data[0];
        const last = data.pop();
        if(data.length > 0 && last !== undefined){
          data[0] = last;
          bubbleDown(0);
        }
        return top;
      },
      size(){
        return data.length;
      }
    };
  }

  function formatHeatmapSvgNumber(value, precision = 2){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){ return '0'; }
    const digits = Math.max(0, Math.min(8, Math.floor(Number(precision) || 0)));
    const rounded = Number(numeric.toFixed(digits));
    return Object.is(rounded, -0) ? '0' : String(rounded);
  }

  function formatHeatmapExportNumber(value){
    return formatHeatmapSvgNumber(value, 6);
  }

  function normalizeHeatmapDendrogramSegment(axis, fixed, start, end){
    const fixedValue = Number(fixed);
    const startValue = Number(start);
    const endValue = Number(end);
    if(!Number.isFinite(fixedValue) || !Number.isFinite(startValue) || !Number.isFinite(endValue)){
      return null;
    }
    const first = Math.min(startValue, endValue);
    const second = Math.max(startValue, endValue);
    if(Math.abs(second - first) <= 1e-9){
      return null;
    }
    return {
      axis: axis === 'horizontal' ? 'horizontal' : 'vertical',
      fixed: fixedValue,
      start: first,
      end: second
    };
  }

  function appendHeatmapDendrogramBranch(segments, orientation, a, nodeCoord, b){
    if(!Array.isArray(segments) || !a || !b || !nodeCoord){
      return;
    }
    if(orientation === 'horizontal'){
      const firstStem = normalizeHeatmapDendrogramSegment('vertical', a.x, a.y, nodeCoord.y);
      const secondStem = normalizeHeatmapDendrogramSegment('vertical', b.x, b.y, nodeCoord.y);
      const crossbar = normalizeHeatmapDendrogramSegment('horizontal', nodeCoord.y, a.x, b.x);
      if(firstStem){ segments.push(firstStem); }
      if(secondStem){ segments.push(secondStem); }
      if(crossbar){ segments.push(crossbar); }
      return;
    }
    const firstStem = normalizeHeatmapDendrogramSegment('horizontal', a.y, a.x, nodeCoord.x);
    const secondStem = normalizeHeatmapDendrogramSegment('horizontal', b.y, b.x, nodeCoord.x);
    const crossbar = normalizeHeatmapDendrogramSegment('vertical', nodeCoord.x, a.y, b.y);
    if(firstStem){ segments.push(firstStem); }
    if(secondStem){ segments.push(secondStem); }
    if(crossbar){ segments.push(crossbar); }
  }

  function mergeHeatmapDendrogramSegments(segments, precision = 4){
    const buckets = new Map();
    const digits = Math.max(2, Math.min(8, Math.floor(Number(precision) || 4)));
    const quantize = value => Number(Number(value).toFixed(digits));
    (Array.isArray(segments) ? segments : []).forEach(segment => {
      if(!segment){ return; }
      const axis = segment.axis === 'horizontal' ? 'horizontal' : 'vertical';
      const fixed = quantize(segment.fixed);
      const start = quantize(Math.min(segment.start, segment.end));
      const end = quantize(Math.max(segment.start, segment.end));
      if(!Number.isFinite(fixed) || !Number.isFinite(start) || !Number.isFinite(end) || end - start <= 1e-9){
        return;
      }
      const key = `${axis}:${fixed}`;
      if(!buckets.has(key)){
        buckets.set(key, { axis, fixed, intervals: [] });
      }
      buckets.get(key).intervals.push([start, end]);
    });
    const epsilon = Math.pow(10, -digits) * 1.5;
    const merged = [];
    buckets.forEach(bucket => {
      const intervals = bucket.intervals.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      let current = null;
      intervals.forEach(interval => {
        if(!current){
          current = interval.slice();
          return;
        }
        if(interval[0] <= current[1] + epsilon){
          current[1] = Math.max(current[1], interval[1]);
          return;
        }
        merged.push({ axis: bucket.axis, fixed: bucket.fixed, start: current[0], end: current[1] });
        current = interval.slice();
      });
      if(current){
        merged.push({ axis: bucket.axis, fixed: bucket.fixed, start: current[0], end: current[1] });
      }
    });
    return merged.sort((left, right) => (
      left.axis.localeCompare(right.axis)
      || left.fixed - right.fixed
      || left.start - right.start
      || left.end - right.end
    ));
  }

  function buildHeatmapDendrogramPath(segments, precision = 4){
    return (Array.isArray(segments) ? segments : []).map(segment => {
      const fixed = formatHeatmapSvgNumber(segment.fixed, precision);
      const start = formatHeatmapSvgNumber(segment.start, precision);
      const end = formatHeatmapSvgNumber(segment.end, precision);
      return segment.axis === 'horizontal'
        ? `M${start} ${fixed}H${end}`
        : `M${fixed} ${start}V${end}`;
    }).join('');
  }

  function computeHeatmapDendrogramEffectiveDistances(tree){
    if(!tree){
      return { distances: new Map(), maxDistance: 0, inversionCount: 0 };
    }
    const distances = new Map();
    const stack = [{ node: tree, visited: false }];
    let maxDistance = 0;
    let inversionCount = 0;
    while(stack.length){
      const entry = stack.pop();
      const node = entry?.node || null;
      if(!node){ continue; }
      const isLeaf = !node.left || !node.right;
      if(isLeaf){
        distances.set(node, 0);
        continue;
      }
      if(!entry.visited){
        stack.push({ node, visited: true });
        stack.push({ node: node.right, visited: false });
        stack.push({ node: node.left, visited: false });
        continue;
      }
      const leftDistance = Number(distances.get(node.left)) || 0;
      const rightDistance = Number(distances.get(node.right)) || 0;
      const rawDistance = Math.max(0, Number(node.distance) || 0);
      const childDistance = Math.max(leftDistance, rightDistance);
      if(rawDistance + 1e-10 < childDistance){
        inversionCount += 1;
      }
      const effectiveDistance = Math.max(rawDistance, childDistance);
      distances.set(node, effectiveDistance);
      maxDistance = Math.max(maxDistance, effectiveDistance);
    }
    return { distances, maxDistance, inversionCount };
  }

  function buildHeatmapDendrogramGeometry({
    tree,
    order,
    startX,
    startY,
    length,
    cellSize,
    cellStep,
    maxDistance,
    orientation = 'vertical'
  } = {}){
    if(!tree || !Array.isArray(order) || order.length === 0 || !Number.isFinite(length) || length <= 0){
      return null;
    }
    const orderIndex = new Map();
    order.forEach((itemIndex, position) => {
      orderIndex.set(itemIndex, position);
    });
    const leafStep = Number.isFinite(Number(cellStep)) && Number(cellStep) > 0
      ? Number(cellStep)
      : (Number.isFinite(Number(cellSize)) && Number(cellSize) > 0 ? Number(cellSize) : 1);
    const effective = computeHeatmapDendrogramEffectiveDistances(tree);
    const safeMaxDistance = Math.max(
      Number(maxDistance) > 0 ? Number(maxDistance) : 0,
      effective.maxDistance,
      1
    );
    const positions = new Map();
    const rawSegments = [];
    const stack = [{ node: tree, visited: false }];
    let branchCount = 0;
    while(stack.length){
      const entry = stack.pop();
      const node = entry?.node || null;
      if(!node){ continue; }
      const isLeaf = !node.left || !node.right;
      if(isLeaf){
        const rawIndex = Array.isArray(node.indices) ? node.indices[0] : null;
        const orderPos = orderIndex.has(rawIndex) ? orderIndex.get(rawIndex) : 0;
        if(orientation === 'horizontal'){
          positions.set(node, {
            x: startX + orderPos * leafStep + leafStep / 2,
            y: startY,
            distance: 0
          });
        }else{
          positions.set(node, {
            x: startX,
            y: startY + orderPos * leafStep + leafStep / 2,
            distance: 0
          });
        }
        continue;
      }
      if(!entry.visited){
        stack.push({ node, visited: true });
        stack.push({ node: node.right, visited: false });
        stack.push({ node: node.left, visited: false });
        continue;
      }
      const leftPos = positions.get(node.left);
      const rightPos = positions.get(node.right);
      if(!leftPos || !rightPos){
        continue;
      }
      const distance = Number(effective.distances.get(node)) || 0;
      if(orientation === 'horizontal'){
        const nodeY = startY + (distance / safeMaxDistance) * length;
        const nodeX = (leftPos.x + rightPos.x) / 2;
        appendHeatmapDendrogramBranch(rawSegments, 'horizontal', leftPos, { x: nodeX, y: nodeY }, rightPos);
        positions.set(node, { x: nodeX, y: nodeY, distance });
      }else{
        const nodeX = startX + (distance / safeMaxDistance) * length;
        const nodeY = (leftPos.y + rightPos.y) / 2;
        appendHeatmapDendrogramBranch(rawSegments, 'vertical', leftPos, { x: nodeX, y: nodeY }, rightPos);
        positions.set(node, { x: nodeX, y: nodeY, distance });
      }
      branchCount += 1;
    }
    const segments = mergeHeatmapDendrogramSegments(rawSegments, 4);
    return {
      root: positions.get(tree) || null,
      leafStep,
      branchCount,
      rawSegmentCount: rawSegments.length,
      segmentCount: segments.length,
      inversionCount: effective.inversionCount,
      maxDistance: safeMaxDistance,
      segments,
      path: buildHeatmapDendrogramPath(segments, 4)
    };
  }

  function renderDendrogram({
    doc,
    parent,
    tree,
    order,
    startX,
    startY,
    length,
    cellSize,
    cellStep,
    maxDistance,
    orientation = 'vertical',
    strokeWidth = 1.5
  }){
    const hasBasics = doc && parent && tree && Array.isArray(order) && order.length > 0;
    if(!hasBasics || !Number.isFinite(length) || length <= 0){
      debugLog('Debug: heatmap renderDendrogram skipped', {
        hasBasics,
        startX,
        startY,
        length,
        orientation
      });
      return null;
    }
    const geometry = buildHeatmapDendrogramGeometry({
      tree,
      order,
      startX,
      startY,
      length,
      cellSize,
      cellStep,
      maxDistance,
      orientation
    });
    if(!geometry){
      return null;
    }
    const settings = ensureDendrogramSettings();
    const dendrogramColor = settings.color || DEFAULT_DENDROGRAM_COLOR;
    const group = doc.createElementNS(NS, 'g');
    group.setAttribute('class', 'heatmap-dendrogram');
    group.setAttribute('data-dendrogram-orientation', orientation);
    group.setAttribute('data-heatmap-vector-overlay', '1');
    group.setAttribute('fill', 'none');
    group.setAttribute('stroke', dendrogramColor);
    group.setAttribute('stroke-width', String(strokeWidth));
    group.setAttribute('stroke-linecap', 'butt');
    group.setAttribute('stroke-linejoin', 'miter');
    group.setAttribute('shape-rendering', 'geometricPrecision');
    group.setAttribute('vector-effect', 'non-scaling-stroke');
    group.setAttribute('data-dendrogram-branch-count', String(geometry.branchCount));
    group.setAttribute('data-dendrogram-segment-count', String(geometry.segmentCount));
    group.setAttribute('data-dendrogram-raw-segment-count', String(geometry.rawSegmentCount));
    group.setAttribute('data-dendrogram-inversion-count', String(geometry.inversionCount));
    if(geometry.path){
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute('d', geometry.path);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('data-dendrogram-branch-count', String(geometry.branchCount));
      path.setAttribute('data-dendrogram-segment-count', String(geometry.segmentCount));
      group.appendChild(path);
    }
    parent.appendChild(group);
    if(dendrogramControls && typeof dendrogramControls.registerDendrogramElement === 'function'){
      dendrogramControls.registerDendrogramElement(group, createDendrogramControlConfig(orientation));
      debugLog('Debug: heatmap dendrogram registered with controls', { orientation });
    }
    debugLog('Debug: heatmap renderDendrogram complete', {
      orientation,
      startX,
      startY,
      length,
      requestedMaxDistance: maxDistance,
      effectiveMaxDistance: geometry.maxDistance,
      root: geometry.root,
      leafCount: order.length,
      branchCount: geometry.branchCount,
      rawSegmentCount: geometry.rawSegmentCount,
      segmentCount: geometry.segmentCount,
      inversionCount: geometry.inversionCount,
      leafStep: geometry.leafStep
    });
    return group;
  }

  function hexToRgb(hex){
    const normalized = hex?.toString?.().replace('#', '');
    if(!normalized || normalized.length < 6) return { r: 200, g: 200, b: 200 };
    const bigint = parseInt(normalized.length === 3 ? normalized.split('').map(ch => ch + ch).join('') : normalized, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  }

  function mixColor(a, b, t){
    const clamped = Math.min(1, Math.max(0, t));
    const r = Math.round(a.r + (b.r - a.r) * clamped);
    const g = Math.round(a.g + (b.g - a.g) * clamped);
    const bVal = Math.round(a.b + (b.b - a.b) * clamped);
    return `rgb(${r},${g},${bVal})`;
  }

  function rgbToCss(rgb){
    if(!rgb || !Number.isFinite(rgb.r) || !Number.isFinite(rgb.g) || !Number.isFinite(rgb.b)){
      debugLog('Debug: heatmap rgbToCss received invalid rgb', { rgb });
      return '#000000';
    }
    const clamp = value => Math.min(255, Math.max(0, Math.round(value)));
    return `rgb(${clamp(rgb.r)},${clamp(rgb.g)},${clamp(rgb.b)})`;
  }

  function colorForValue(entry, palette, useAbs){
    if(!entry || !Number.isFinite(entry.raw) || !Number.isFinite(entry.value)){
      return '#d0d0d0';
    }

    let color;

    if(useAbs){
      // Same behavior as before for absolute mode
      color = mixColor(palette.zero, palette.positive, Math.abs(entry.raw));
    } else if(entry.raw >= 0){
      // Positive values: zero -> positive
      color = mixColor(palette.zero, palette.positive, entry.raw);
    } else {
      // Negative values: zero -> negative (fixed direction)
      const t = Math.abs(entry.raw);
      color = mixColor(palette.zero, palette.negative, t);
    }

    return color;
  }


  function textColorForBackground(fill){
    const rgb = hexToRgb(fill.startsWith('#') ? fill : (() => {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(fill);
      if(m){
        return `#${Number(m[1]).toString(16).padStart(2,'0')}${Number(m[2]).toString(16).padStart(2,'0')}${Number(m[3]).toString(16).padStart(2,'0')}`;
      }
      return '#d0d0d0';
    })());
    const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    return luminance > 160 ? '#222' : '#fff';
  }

  function shouldUseHeatmapCellCanvas({ modelType, rowCount, columnCount, showCellText } = {}){
    if(modelType !== 'values'){
      return false;
    }
    const rows = Math.max(0, Number(rowCount) || 0);
    const columns = Math.max(0, Number(columnCount) || 0);
    const cellCount = rows * columns;
    const estimatedNodeCost = cellCount * (showCellText ? 2 : 1);
    return cellCount >= HEATMAP_CANVAS_CELL_THRESHOLD
      || estimatedNodeCost >= HEATMAP_CANVAS_NODE_COST_THRESHOLD;
  }

  function clampHeatmapNumber(value, min, max){
    const numeric = Number(value);
    const lower = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
    const upper = Number.isFinite(Number(max)) ? Number(max) : Infinity;
    if(!Number.isFinite(numeric)){
      return lower;
    }
    return Math.min(upper, Math.max(lower, numeric));
  }

  function resolveHeavyHeatmapSceneLayout(options = {}){
    const rowCount = Math.max(1, Number(options.rowCount) || 1);
    const columnCount = Math.max(1, Number(options.columnCount) || 1);
    const frameWidth = clampHeatmapNumber(
      options.frameWidth,
      HEATMAP_HEAVY_SCENE_MIN_WIDTH,
      HEATMAP_HEAVY_SCENE_MAX_WIDTH
    );
    const frameHeight = clampHeatmapNumber(
      options.frameHeight,
      HEATMAP_HEAVY_SCENE_MIN_HEIGHT,
      HEATMAP_HEAVY_SCENE_MAX_HEIGHT
    );
    const titleFontSize = Math.max(8, Number(options.titleFontSize) || 16);
    const rowFontSize = Math.max(6, Number(options.maxRowLabelFontSize) || 12);
    const columnFontSize = Math.max(6, Number(options.maxColumnLabelFontSize) || 12);
    const outerPadding = clampHeatmapNumber(Math.round(titleFontSize * 0.75), 10, 24);
    const titleGap = clampHeatmapNumber(Math.round(titleFontSize * 0.38), 6, 14);
    const titleHeight = clampHeatmapNumber(Math.round(titleFontSize * 1.15), 16, 34);
    const rowLabelPadding = clampHeatmapNumber(Math.round(rowFontSize * 0.45), 5, 12);
    const columnLabelPadding = clampHeatmapNumber(Math.round(columnFontSize * 0.45), 5, 12);
    const columnLabelDescenderPad = clampHeatmapNumber(Math.ceil(columnFontSize * 0.25), 3, 8);
    const maxRowLabelReserve = Math.max(48, Math.min(190, frameWidth * 0.30));
    const maxColumnLabelReserve = Math.max(42, Math.min(140, frameHeight * 0.30));
    const labelColumnWidth = clampHeatmapNumber(
      Math.ceil((Number(options.maxRowLabelWidth) || 0) + rowLabelPadding * 2),
      Math.max(42, rowFontSize * 2.8),
      maxRowLabelReserve
    );
    const labelRowHeight = clampHeatmapNumber(
      Math.ceil((Number(options.maxColumnLabelWidth) || 0) + columnLabelPadding * 2 + columnLabelDescenderPad),
      Math.max(38, columnFontSize * 2.6),
      maxColumnLabelReserve
    );
    const dendrogramGap = 8;
    const rowDendroWidth = options.showRowDendrogram
      ? clampHeatmapNumber(Math.round(frameWidth * 0.13), 42, 88)
      : 0;
    const columnDendroHeight = options.showColumnDendrogram
      ? clampHeatmapNumber(Math.round(frameHeight * 0.12), 34, 72)
      : 0;
    const scaleWidth = clampHeatmapNumber(Math.round(frameWidth * 0.045), 14, 24);
    const scalePadding = clampHeatmapNumber(Math.round(frameWidth * 0.025), 8, 16);
    const scaleLabelGap = clampHeatmapNumber(Math.round(frameWidth * 0.14), 48, 78);
    const bottomPadding = outerPadding;
    const dataStartX = outerPadding + labelColumnWidth;
    const dataStartY = outerPadding + titleHeight + titleGap + labelRowHeight;
    const reservedRight = outerPadding
      + (rowDendroWidth ? rowDendroWidth + dendrogramGap : 0)
      + scalePadding
      + scaleWidth
      + scaleLabelGap;
    const reservedBottom = bottomPadding
      + (columnDendroHeight ? columnDendroHeight + dendrogramGap : 0);
    const heatmapWidth = Math.max(48, frameWidth - dataStartX - reservedRight);
    const heatmapHeight = Math.max(64, frameHeight - dataStartY - reservedBottom);
    return {
      normalized: true,
      totalWidth: frameWidth,
      totalHeight: frameHeight,
      matrixLeft: outerPadding,
      matrixTop: outerPadding + titleHeight + titleGap,
      dataStartX,
      dataStartY,
      heatmapWidth,
      heatmapHeight,
      cellWidth: heatmapWidth / columnCount,
      cellHeight: heatmapHeight / rowCount,
      labelColumnWidth,
      labelRowHeight,
      labelPaddingX: rowLabelPadding,
      labelPaddingY: columnLabelPadding,
      labelDescenderPadY: columnLabelDescenderPad,
      rowDendroWidth,
      columnDendroHeight,
      dendrogramPadding: dendrogramGap,
      scaleWidth,
      scalePadding,
      scaleLabelGap,
      outerPadding,
      titleGap,
      titleHeight,
      aspectAdjust: { adjustX: 1, adjustY: 1, scaleX: 1, scaleY: 1, textScale: 1, scaleMode: 'normalized' }
    };
  }

  function resolveHeatmapCanvasBitmapSize({
    rowCount,
    columnCount,
    heatmapWidth,
    heatmapHeight,
    totalWidth,
    totalHeight,
    drawableFrame
  } = {}){
    const rows = Math.max(1, Number(rowCount) || 1);
    const columns = Math.max(1, Number(columnCount) || 1);
    const logicalWidth = Math.max(1, Number(heatmapWidth) || columns);
    const logicalHeight = Math.max(1, Number(heatmapHeight) || rows);
    const frameWidth = Math.max(1, Number(drawableFrame?.width) || logicalWidth);
    const frameHeight = Math.max(1, Number(drawableFrame?.height) || logicalHeight);
    const viewWidth = Math.max(1, Number(totalWidth) || logicalWidth);
    const viewHeight = Math.max(1, Number(totalHeight) || logicalHeight);
    const dpr = Math.max(1, Math.min(HEATMAP_CANVAS_DPR_CAP, Number(global.devicePixelRatio) || 1));
    const projectedWidth = Math.max(1, logicalWidth * (frameWidth / viewWidth));
    const projectedHeight = Math.max(1, logicalHeight * (frameHeight / viewHeight));
    let width = Math.ceil(Math.max(projectedWidth * dpr, Math.min(columns, HEATMAP_CANVAS_MIN_AXIS_RESOLUTION)));
    let height = Math.ceil(Math.max(projectedHeight * dpr, Math.min(rows, HEATMAP_CANVAS_MIN_AXIS_RESOLUTION)));
    const dimensionScale = Math.min(1, HEATMAP_CANVAS_MAX_DIMENSION / Math.max(width, height));
    if(dimensionScale < 1){
      width = Math.max(1, Math.floor(width * dimensionScale));
      height = Math.max(1, Math.floor(height * dimensionScale));
    }
    const pixelScale = Math.min(1, Math.sqrt(HEATMAP_CANVAS_MAX_PIXELS / Math.max(1, width * height)));
    if(pixelScale < 1){
      width = Math.max(1, Math.floor(width * pixelScale));
      height = Math.max(1, Math.floor(height * pixelScale));
    }
    return {
      width,
      height,
      dpr,
      projectedWidth,
      projectedHeight
    };
  }

  function paintHeatmapCellCanvas(canvas, orderedCells, options = {}){
    const ctx = canvas?.getContext?.('2d');
    if(!ctx || typeof ctx.fillRect !== 'function'){
      return false;
    }
    const rowCount = Math.max(1, Number(options.rowCount) || 1);
    const columnCount = Math.max(1, Number(options.columnCount) || 1);
    const bitmapWidth = Math.max(1, Number(canvas.width) || 1);
    const bitmapHeight = Math.max(1, Number(canvas.height) || 1);
    const cellPixelWidth = bitmapWidth / columnCount;
    const cellPixelHeight = bitmapHeight / rowCount;
    const drawText = !!options.showCellText && cellPixelWidth >= 10 && cellPixelHeight >= 7;
    const requestedFontSize = Number(options.cellValueFontSize);
    const scaledFontSize = Math.max(4, Math.min(
      cellPixelHeight * 0.72,
      (Number.isFinite(requestedFontSize) && requestedFontSize > 0 ? requestedFontSize : 8)
        * (bitmapHeight / Math.max(1, Number(options.heatmapHeight) || bitmapHeight))
    ));
    ctx.clearRect?.(0, 0, bitmapWidth, bitmapHeight);
    ctx.imageSmoothingEnabled = false;
    if(drawText){
      ctx.font = `${scaledFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      const y0 = Math.floor((rowIndex * bitmapHeight) / rowCount);
      const y1 = Math.max(y0 + 1, Math.ceil(((rowIndex + 1) * bitmapHeight) / rowCount));
      for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
        const x0 = Math.floor((columnIndex * bitmapWidth) / columnCount);
        const x1 = Math.max(x0 + 1, Math.ceil(((columnIndex + 1) * bitmapWidth) / columnCount));
        const cell = orderedCells[rowIndex]?.[columnIndex] || {};
        const fill = cell.fill || '#d0d0d0';
        ctx.fillStyle = fill;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        if(drawText){
          const text = String(cell.displayText || '').trim();
          if(text){
            const textWidth = typeof ctx.measureText === 'function' ? ctx.measureText(text).width : text.length * scaledFontSize * 0.6;
            if(textWidth <= Math.max(1, (x1 - x0) - 2)){
              ctx.fillStyle = textColorForBackground(fill);
              ctx.fillText?.(text, (x0 + x1) / 2, (y0 + y1) / 2);
            }
          }
        }
      }
    }
    if(cellPixelWidth >= 3 && cellPixelHeight >= 3 && typeof ctx.beginPath === 'function'){
      ctx.beginPath();
      for(let columnIndex = 1; columnIndex < columnCount; columnIndex += 1){
        const x = Math.round((columnIndex * bitmapWidth) / columnCount) + 0.5;
        ctx.moveTo?.(x, 0);
        ctx.lineTo?.(x, bitmapHeight);
      }
      for(let rowIndex = 1; rowIndex < rowCount; rowIndex += 1){
        const y = Math.round((rowIndex * bitmapHeight) / rowCount) + 0.5;
        ctx.moveTo?.(0, y);
        ctx.lineTo?.(bitmapWidth, y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke?.();
    }
    return true;
  }

  function appendHeatmapCanvasCellLayer(cellLayer, orderedCells, options = {}){
    const doc = options.doc || global.document;
    if(!cellLayer || !doc || typeof doc.createElement !== 'function'){
      return false;
    }
    const bitmap = resolveHeatmapCanvasBitmapSize(options);
    const canvas = doc.createElement('canvas');
    canvas.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.setAttribute('width', String(bitmap.width));
    canvas.setAttribute('height', String(bitmap.height));
    canvas.setAttribute('data-resolution-scale', String(bitmap.dpr));
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.background = 'transparent';
    if(!paintHeatmapCellCanvas(canvas, orderedCells, options)){
      return false;
    }
    const foreignObject = doc.createElementNS(NS, 'foreignObject');
    foreignObject.setAttribute('x', String(options.dataStartX));
    foreignObject.setAttribute('y', String(options.dataStartY));
    foreignObject.setAttribute('width', String(options.heatmapWidth));
    foreignObject.setAttribute('height', String(options.heatmapHeight));
    foreignObject.setAttribute('data-point-renderer', 'heatmap-canvas');
    foreignObject.setAttribute('data-heatmap-canvas-surface', '1');
    foreignObject.appendChild(canvas);
    cellLayer.appendChild(foreignObject);

    const hitLayer = doc.createElementNS(NS, 'rect');
    hitLayer.setAttribute('x', String(options.dataStartX));
    hitLayer.setAttribute('y', String(options.dataStartY));
    hitLayer.setAttribute('width', String(options.heatmapWidth));
    hitLayer.setAttribute('height', String(options.heatmapHeight));
    hitLayer.setAttribute('fill', 'transparent');
    hitLayer.setAttribute('pointer-events', 'all');
    hitLayer.setAttribute('data-heatmap-cell-hit-layer', '1');
    hitLayer.setAttribute('data-heatmap-row-count', String(options.rowCount));
    hitLayer.setAttribute('data-heatmap-column-count', String(options.columnCount));
    cellLayer.appendChild(hitLayer);

    cellLayer.setAttribute('data-render-mode', 'canvas');
    const cellWidth = Number.isFinite(Number(options.cellWidth)) && Number(options.cellWidth) > 0
      ? Number(options.cellWidth)
      : Number(options.cellSize);
    const cellHeight = Number.isFinite(Number(options.cellHeight)) && Number(options.cellHeight) > 0
      ? Number(options.cellHeight)
      : Number(options.cellSize);
    const compatibilityCellSize = Math.min(cellWidth, cellHeight);
    const showCellGrid = (bitmap.width / Math.max(1, options.columnCount)) >= 3
      && (bitmap.height / Math.max(1, options.rowCount)) >= 3;
    cellLayer.setAttribute('data-heatmap-row-count', String(options.rowCount));
    cellLayer.setAttribute('data-heatmap-column-count', String(options.columnCount));
    cellLayer.setAttribute('data-heatmap-cell-size', String(compatibilityCellSize));
    cellLayer.setAttribute('data-heatmap-cell-width', String(cellWidth));
    cellLayer.setAttribute('data-heatmap-cell-height', String(cellHeight));
    cellLayer.setAttribute('data-heatmap-data-start-x', String(options.dataStartX));
    cellLayer.setAttribute('data-heatmap-data-start-y', String(options.dataStartY));
    cellLayer.setAttribute('data-heatmap-width', String(options.heatmapWidth));
    cellLayer.setAttribute('data-heatmap-height', String(options.heatmapHeight));
    cellLayer.setAttribute('data-heatmap-cell-font-size', String(options.cellValueFontSize));
    cellLayer.setAttribute('data-heatmap-show-cell-text', options.showCellText ? 'true' : 'false');
    cellLayer.setAttribute('data-heatmap-show-cell-grid', showCellGrid ? 'true' : 'false');
    cellLayer.__heatmapCanvasVectorExportState = {
      orderedCells,
      rowCount: options.rowCount,
      columnCount: options.columnCount,
      cellSize: compatibilityCellSize,
      cellWidth,
      cellHeight,
      dataStartX: options.dataStartX,
      dataStartY: options.dataStartY,
      heatmapWidth: options.heatmapWidth,
      heatmapHeight: options.heatmapHeight,
      cellValueFontSize: options.cellValueFontSize,
      showCellText: !!options.showCellText,
      showCellGrid
    };
    return true;
  }

  function isHeatmapCanvasRenderActive(svg = state.svg){
    if(!svg || svg.dataset?.heatmapModelType !== 'values'){
      return false;
    }
    return svg.dataset?.heatmapCellRenderMode === 'canvas'
      || !!svg.querySelector?.(
        '[data-export-layer="heatmap-cells"][data-render-mode="canvas"] canvas, '
        + '[data-export-layer="heatmap-cells"][data-render-mode="canvas"] img[data-graphitix-render-cache-canvas-bitmap="true"]'
      );
  }

  function markHeatmapCanvasResizeReuse(active, svg = state.svg){
    if(!svg?.dataset){
      return;
    }
    if(active){
      svg.dataset.heatmapCanvasResizeReuse = 'true';
      svg.querySelector?.('[data-export-layer="heatmap-cells"][data-render-mode="canvas"]')?.setAttribute?.('data-resize-reused', 'true');
    }else{
      delete svg.dataset.heatmapCanvasResizeReuse;
      svg.querySelector?.('[data-export-layer="heatmap-cells"]')?.removeAttribute?.('data-resize-reused');
    }
  }

  function applyHeatmapCanvasLiveResizeProjection(svg = state.svg, svgBox = state.svgBox){
    if(!svg?.dataset
      || svg.dataset.heatmapSceneMode !== 'normalized-canvas'
      || !isHeatmapCanvasRenderActive(svg)){
      return false;
    }
    const sceneWidth = Number(svg.dataset.heatmapSceneWidth);
    const sceneHeight = Number(svg.dataset.heatmapSceneHeight);
    if(!(sceneWidth > 0) || !(sceneHeight > 0)){
      return false;
    }
    const ownerBox = svgBox || svg.closest?.('.svgbox') || null;
    const displayRect = ownerBox?.getBoundingClientRect?.() || svg.getBoundingClientRect?.() || null;
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${sceneWidth} ${sceneHeight}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    if(svg.style){
      svg.style.setProperty?.('width', '100%', 'important');
      svg.style.setProperty?.('height', '100%', 'important');
      svg.style.minWidth = '0';
      svg.style.minHeight = '0';
      svg.style.display = 'block';
    }
    svg.dataset.heatmapLiveResizeProjection = 'true';
    applyTextAspectCorrection({
      svg,
      svgBox: ownerBox,
      viewBoxWidth: sceneWidth,
      viewBoxHeight: sceneHeight,
      displayWidth: displayRect?.width,
      displayHeight: displayRect?.height,
      debugLabel: 'heatmap-heavy-live-resize',
      aspectLocked: false,
      textScaleMode: HEATMAP_TEXT_SCALE_MODE
    });
    return true;
  }

  function clearHeatmapCanvasLiveResizeProjection(svg = state.svg){
    if(svg?.dataset){
      delete svg.dataset.heatmapLiveResizeProjection;
    }
  }

  const scheduleHeatmapCanvasLiveResizeProjection = (() => {
    const runProjection = (options = {}) => {
      const tabId = String(options?.tabId || getHeatmapProjectionTabId() || '').trim();
      const session = tabId
        ? getHeatmapSession(tabId, { tabId, reason: 'heatmap-heavy-live-resize' }, { create: false })
        : getActiveHeatmapSessionForState();
      if(!session || !isHeatmapSessionActiveForModuleState(session)){
        return false;
      }
      const ownerRoot = session.root || resolveHeatmapRoot(tabId || null) || null;
      const svg = heatmapNodeBelongsToRoot(session.refs?.svg, ownerRoot)
        ? session.refs.svg
        : ownerRoot?.querySelector?.('#heatmapSvg');
      const svgBox = heatmapNodeBelongsToRoot(session.refs?.svgBox, ownerRoot)
        ? session.refs.svgBox
        : svg?.closest?.('.svgbox');
      return applyHeatmapCanvasLiveResizeProjection(svg, svgBox);
    };
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(
          heatmap,
          'heatmap',
          runProjection,
          { reason: 'heatmap-heavy-live-resize' }
        )
      : null;
    const schedule = options => {
      const request = {
        tabId: String(options?.tabId || getHeatmapProjectionTabId() || '').trim() || null,
        reason: 'heatmap-heavy-live-resize'
      };
      if(debounced){
        return debounced(request);
      }
      runProjection(request);
      return null;
    };
    schedule.clear = tabId => debounced?.clear?.(tabId);
    return schedule;
  })();

  function isSvgBoxAspectLocked(svgBox){
    if(!svgBox){ return false; }
    const dataset = svgBox.dataset || {};
    if(dataset.resizerAspectLocked === 'false'){ return false; }
    if(dataset.resizerAspectLocked === 'true'){ return true; }
    if(dataset.lockRatio === '1' || dataset.lock === '1'){ return true; }
    return false;
  }

  function shouldHeatmapRendererPreserveAspect(modelType, svgBox){
    return modelType === 'correlation' && isSvgBoxAspectLocked(svgBox);
  }

  function measureHeatmapLockedGeometry({ container } = {}){
    const svg = container?.querySelector?.('#heatmapSvg') || null;
    if(!svg || svg.dataset?.heatmapModelType !== 'values'){
      return null;
    }
    const svgRect = svg.getBoundingClientRect?.();
    const matrixNode = svg.querySelector?.('[data-heatmap-cell-hit-layer="1"]')
      || svg.querySelector?.('[data-export-layer="heatmap-cells"]')
      || null;
    const matrixRect = matrixNode?.getBoundingClientRect?.();
    if(!svgRect?.width || !svgRect?.height || !matrixRect?.width || !matrixRect?.height){
      return null;
    }
    const width = matrixRect.width;
    const height = matrixRect.height;
    if(!(width > 0) || !(height > 0)){
      return null;
    }
    return {
      width,
      height,
      constraintWidth: svgRect.width,
      constraintHeight: svgRect.height
    };
  }

  function enforceHeatmapLockedProjection(svgBox){
    const svg = svgBox?.querySelector?.('#heatmapSvg') || null;
    const targetRatio = Number(svgBox?.dataset?.resizerLockedGeometryRatio);
    const geometry = measureHeatmapLockedGeometry({ container: svgBox });
    const viewBox = svg?.viewBox?.baseVal;
    if(
      !svg
      || !(targetRatio > 0)
      || !(geometry?.width > 0)
      || !(geometry?.height > 0)
      || !(viewBox?.width > 0)
      || !(viewBox?.height > 0)
    ){
      return false;
    }
    const measuredRatio = geometry.width / geometry.height;
    if(Math.abs(measuredRatio / targetRatio - 1) <= 0.001){
      return false;
    }
    let minX = viewBox.x;
    let minY = viewBox.y;
    let width = viewBox.width;
    let height = viewBox.height;
    if(measuredRatio > targetRatio){
      const nextWidth = width * measuredRatio / targetRatio;
      minX -= (nextWidth - width) / 2;
      width = nextWidth;
    }else{
      const nextHeight = height * targetRatio / measuredRatio;
      minY -= (nextHeight - height) / 2;
      height = nextHeight;
    }
    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    const svgRect = svg.getBoundingClientRect?.();
    applyTextAspectCorrection({
      svg,
      svgBox,
      viewBoxWidth: width,
      viewBoxHeight: height,
      displayWidth: svgRect?.width,
      displayHeight: svgRect?.height,
      aspectLocked: false,
      debugLabel: 'heatmap-locked-matrix-projection',
      textScaleMode: HEATMAP_TEXT_SCALE_MODE
    });
    return true;
  }

  function applySvgBoxAspect(svgBox, options){
    if(!svgBox || typeof svgBox.style?.setProperty !== 'function'){ return; }
    const opts = options || {};
    const locked = !!opts.locked;
    try{
      // Keep the rendered heatmap aspect as a display-only CSS variable.
      // Persisting it through the inline `aspectRatio` property causes graphSizing
      // to serialize the rendered viewBox ratio into resizer state, which then
      // mutates the svg box geometry on tab restore.
      svgBox.style.aspectRatio = '';
    }catch(err){
      debugLog('Debug: heatmap aspect ratio reset error', { error: err?.message || String(err) });
    }
    if(locked){
      const width = Number(opts.width);
      const height = Number(opts.height);
      if(Number.isFinite(width) && Number.isFinite(height) && height > 0){
        const ratio = width / height;
        svgBox.style.setProperty('--graph-aspect-ratio', String(ratio));
      }
      return;
    }
    svgBox.style.setProperty('--graph-aspect-ratio', 'auto');
  }

  function resolveEmptyViewportSize(svgBox){
    const toPositiveInt = value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.round(numeric)) : NaN;
    };
    const dataset = svgBox?.dataset || null;
    let width = NaN;
    let height = NaN;
    let source = 'unset';

    if(dataset?.resizerResized === 'true'){
      width = toPositiveInt(dataset.resizerWidth);
      height = toPositiveInt(dataset.resizerHeight);
      source = 'resizer-manual';
    }
    if((!Number.isFinite(width) || !Number.isFinite(height)) && dataset){
      width = toPositiveInt(dataset.resizerDefaultWidth);
      height = toPositiveInt(dataset.resizerDefaultHeight);
      source = 'resizer-default';
    }
    if(!Number.isFinite(width) || !Number.isFinite(height)){
      try{
        const sizing = (typeof chartStyle.getSquareGraphSizing === 'function')
          ? chartStyle.getSquareGraphSizing({ context: 'heatmap-empty', refresh: false })
          : null;
        width = toPositiveInt(sizing?.width);
        height = toPositiveInt(sizing?.height);
        source = 'chartStyle-square';
      }catch(err){
        console.error('heatmap resolveEmptyViewportSize chartStyle sizing error', err);
      }
    }
    if((!Number.isFinite(width) || !Number.isFinite(height)) && svgBox?.getBoundingClientRect){
      const rect = svgBox.getBoundingClientRect();
      width = toPositiveInt(rect?.width);
      height = toPositiveInt(rect?.height);
      source = 'svgbox-rect';
    }
    if(!Number.isFinite(width) || !Number.isFinite(height)){
      width = 400;
      height = 400;
      source = 'fallback';
    }
    return { width, height, source };
  }

  function computeHeatmapTextScaleLimit(metrics, scaleX, scaleY){
    if(!metrics || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)){
      return { limit: NaN, constraints: null };
    }
    const constraints = {};
    let limit = 1;
    const addConstraint = (key, value) => {
      if(!Number.isFinite(value)){ return; }
      constraints[key] = value;
      limit = Math.min(limit, value);
    };
    const cellSize = Number(metrics.cellSize);
    const rowCount = Number(metrics.rowCount);
    const columnCount = Number(metrics.columnCount);
    const rowFont = Number(metrics.maxRowLabelFontSize);
    const columnFont = Number(metrics.maxColumnLabelFontSize);
    const glyphExtentFactor = 1.15;
    if(Number.isFinite(cellSize) && cellSize > 0){
      if(Number.isFinite(rowCount) && rowCount > 1 && Number.isFinite(rowFont) && rowFont > 0){
        addConstraint('rowSpacing', (cellSize * scaleY) / (rowFont * glyphExtentFactor));
      }
      if(Number.isFinite(columnCount) && columnCount > 1 && Number.isFinite(columnFont) && columnFont > 0){
        addConstraint('columnSpacing', (cellSize * scaleX) / (columnFont * glyphExtentFactor));
      }
    }
    const tickCount = Number(metrics.scaleTickCount);
    const tickGap = Number(metrics.scaleTickGap);
    const tickFontSize = Number(metrics.scaleTickFontSize);
    if(Number.isFinite(tickCount) && tickCount > 1 && Number.isFinite(tickGap) && tickGap > 0 && Number.isFinite(tickFontSize) && tickFontSize > 0){
      addConstraint('scaleTickSpacing', (tickGap * scaleY) / (tickFontSize * glyphExtentFactor));
    }
    if(!Number.isFinite(limit)){
      return { limit: NaN, constraints };
    }
    return { limit: Math.max(0, limit), constraints };
  }

  function resolveHeatmapRoleTextScales(options){
    const opts = options || {};
    const metrics = opts.metrics || state.textAspectMetrics;
    const scaleX = Number(opts.scaleX);
    const scaleY = Number(opts.scaleY);
    const fallbackScale = Number(opts.fallbackScale);
    const baseScale = Number.isFinite(fallbackScale) && fallbackScale > 0 ? fallbackScale : 1;
    const downsized = Number.isFinite(scaleX) && Number.isFinite(scaleY) && (scaleX < 1 || scaleY < 1);
    const normalizedHeavyScene = metrics?.normalizedHeavyScene === true;
    const cellWidth = Number(metrics?.cellWidth);
    const cellHeight = Number(metrics?.cellHeight);
    const rowFont = Number(metrics?.maxRowLabelFontSize);
    const columnFont = Number(metrics?.maxColumnLabelFontSize);
    const tickGap = Number(metrics?.scaleTickGap);
    const tickFont = Number(metrics?.scaleTickFontSize);
    const glyphExtentFactor = 1.15;
    if(normalizedHeavyScene){
      const fitHeavyScale = value => Number.isFinite(value) && value > 0
        ? Math.max(0.0001, Math.min(1, value))
        : 1;
      return {
        rowLabel: opts.independentLabels
          ? fitHeavyScale((cellHeight * (Number.isFinite(scaleY) ? scaleY : 1)) / (rowFont * glyphExtentFactor))
          : null,
        columnLabel: opts.independentLabels
          ? fitHeavyScale((cellWidth * (Number.isFinite(scaleX) ? scaleX : 1)) / (columnFont * glyphExtentFactor))
          : null,
        graphTitle: 1,
        scaleTick: fitHeavyScale((tickGap * (Number.isFinite(scaleY) ? scaleY : 1)) / (tickFont * glyphExtentFactor))
      };
    }
    if(!downsized){
      return {
        rowLabel: opts.independentLabels ? baseScale : null,
        columnLabel: opts.independentLabels ? baseScale : null,
        graphTitle: baseScale,
        scaleTick: baseScale
      };
    }
    const cellSize = Number(metrics?.cellSize);
    const fitScale = value => Number.isFinite(value) && value > 0
      ? Math.max(0.02, Math.min(1, value))
      : 1;
    return {
      rowLabel: opts.independentLabels
        ? fitScale((cellSize * scaleY) / (rowFont * glyphExtentFactor))
        : null,
      columnLabel: opts.independentLabels
        ? fitScale((cellSize * scaleX) / (columnFont * glyphExtentFactor))
        : null,
      graphTitle: 1,
      scaleTick: fitScale((tickGap * scaleY) / (tickFont * glyphExtentFactor))
    };
  }

  function computeHeatmapCellValueScaleLimit(metrics, scaleX, scaleY){
    if(!metrics || !metrics.showValues || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)){
      return { limit: NaN, constraints: null };
    }
    const cellSize = Number(metrics.cellSize);
    const baseFontSize = Number(metrics.cellValueFontSize);
    const maxTextWidth = Number(metrics.cellValueMaxTextWidth);
    const padding = Number.isFinite(Number(metrics.cellValuePadding))
      ? Number(metrics.cellValuePadding)
      : 2;
    const heightFactor = Number.isFinite(Number(metrics.cellValueHeightFactor))
      ? Number(metrics.cellValueHeightFactor)
      : 1.15;
    if(
      !Number.isFinite(cellSize) || cellSize <= 0
      || !Number.isFinite(baseFontSize) || baseFontSize <= 0
      || !Number.isFinite(maxTextWidth) || maxTextWidth <= 0
    ){
      return { limit: NaN, constraints: null };
    }
    const constraints = {};
    const innerSize = Math.max(1, cellSize - (padding * 2));
    const widthLimit = (innerSize * scaleX) / maxTextWidth;
    const heightLimit = (innerSize * scaleY) / (baseFontSize * heightFactor);
    constraints.maxWidth = widthLimit;
    constraints.maxHeight = heightLimit;
    let limit = Math.min(widthLimit, heightLimit);
    if(!Number.isFinite(limit)){
      return { limit: NaN, constraints };
    }
    return { limit: Math.max(0, limit), constraints };
  }

  function resolveHeatmapReadableTextScale(options){
    const opts = options || {};
    const scaleX = Number(opts.scaleX);
    const scaleY = Number(opts.scaleY);
    const fallbackScale = Number(opts.fallbackScale);
    const downsized = Number.isFinite(scaleX) && Number.isFinite(scaleY) && (scaleX < 1 || scaleY < 1);
    if(!downsized){
      return {
        textScale: Number.isFinite(fallbackScale) && fallbackScale > 0 ? fallbackScale : 1,
        downsized: false,
        limit: NaN,
        constraints: null
      };
    }
    const metrics = state.textAspectMetrics;
    const limitInfo = computeHeatmapTextScaleLimit(metrics, scaleX, scaleY);
    const fitLimit = Number.isFinite(limitInfo?.limit) && limitInfo.limit > 0 ? limitInfo.limit : NaN;
    const resolved = Number.isFinite(fitLimit)
      ? Math.max(0.02, Math.min(1, fitLimit))
      : (Number.isFinite(fallbackScale) && fallbackScale > 0 ? fallbackScale : 1);
    debugLog('Debug: heatmap readable text scale resolved', {
      fallbackScale,
      fitLimit,
      resolved,
      scaleX,
      scaleY,
      hasMetrics: !!metrics,
      constraints: limitInfo?.constraints || null
    });
    return {
      textScale: resolved,
      downsized: true,
      limit: fitLimit,
      constraints: limitInfo?.constraints || null
    };
  }

  function resolveHeatmapCellValueTextScale(options){
    const opts = options || {};
    const scaleX = Number(opts.scaleX);
    const scaleY = Number(opts.scaleY);
    const fallbackScale = Number.isFinite(Number(opts.fallbackScale))
      ? Number(opts.fallbackScale)
      : 1;
    const metrics = state.textAspectMetrics;
    const limitInfo = computeHeatmapCellValueScaleLimit(metrics, scaleX, scaleY);
    const fitLimit = Number.isFinite(limitInfo?.limit) && limitInfo.limit > 0 ? limitInfo.limit : NaN;
    const resolved = Number.isFinite(fitLimit)
      ? Math.max(0.02, Math.min(fallbackScale, fitLimit))
      : fallbackScale;
    debugLog('Debug: heatmap cell value text scale resolved', {
      fallbackScale,
      fitLimit,
      resolved,
      scaleX,
      scaleY,
      hasMetrics: !!metrics,
      constraints: limitInfo?.constraints || null
    });
    return {
      textScale: resolved,
      limit: fitLimit,
      constraints: limitInfo?.constraints || null
    };
  }

  function applyTextAspectCorrection(options){
    const opts = options || {};
    const svg = opts.svg;
    if(!svg || typeof chartStyle.computeViewBoxScale !== 'function'){ return; }
    const svgBox = opts.svgBox || svg.closest?.('.svgbox') || null;
    const viewBoxWidth = Number.isFinite(opts.viewBoxWidth) ? Number(opts.viewBoxWidth) : Number(svg.viewBox?.baseVal?.width);
    const viewBoxHeight = Number.isFinite(opts.viewBoxHeight) ? Number(opts.viewBoxHeight) : Number(svg.viewBox?.baseVal?.height);
    const viewScale = chartStyle.computeViewBoxScale({
      svg,
      svgBox,
      viewBoxWidth,
      viewBoxHeight,
      displayWidth: Number(opts.displayWidth),
      displayHeight: Number(opts.displayHeight),
      debugLabel: opts.debugLabel || 'heatmap-text-scale'
    });
    const rawScaleX = Number(viewScale?.scaleX);
    const rawScaleY = Number(viewScale?.scaleY);
    if(!Number.isFinite(rawScaleX) || !Number.isFinite(rawScaleY)){ return; }
    const aspectLocked = Object.prototype.hasOwnProperty.call(opts, 'aspectLocked')
      ? opts.aspectLocked === true
      : isSvgBoxAspectLocked(svgBox);
    const uniformScale = Math.min(rawScaleX, rawScaleY);
    const scaleX = aspectLocked ? uniformScale : rawScaleX;
    const scaleY = aspectLocked ? uniformScale : rawScaleY;
    if(!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0){ return; }
    const mode = opts.textScaleMode || 'uniform';
    const unlockedStyleScaleBase = Number(svgBox?.dataset?.resizerUnlockedStyleScaleBase);
    const stableUnlockedScale = !aspectLocked && Number.isFinite(unlockedStyleScaleBase) && unlockedStyleScaleBase > 0
      ? unlockedStyleScaleBase
      : NaN;
    const uniform = Number.isFinite(viewScale.scale) && viewScale.scale > 0
      ? viewScale.scale
      : Math.sqrt(Math.max(scaleX * scaleY, 0)) || 1;
    const minScale = Math.min(scaleX, scaleY);
    const defaultScale = (mode === 'min' && Number.isFinite(minScale) && minScale > 0)
      ? minScale
      : (Number.isFinite(stableUnlockedScale) ? stableUnlockedScale : uniform);
    const readableScale = mode === HEATMAP_TEXT_SCALE_MODE
      ? resolveHeatmapReadableTextScale({ scaleX, scaleY, fallbackScale: defaultScale })
      : null;
    const textScale = Number.isFinite(readableScale?.textScale) && readableScale.textScale > 0
      ? readableScale.textScale
      : defaultScale;
    const heatmapRoleTextScales = resolveHeatmapRoleTextScales({
      metrics: state.textAspectMetrics,
      scaleX,
      scaleY,
      fallbackScale: defaultScale,
      independentLabels: svg.dataset?.heatmapModelType === 'values'
    });
    const cellValueScale = resolveHeatmapCellValueTextScale({ scaleX, scaleY, fallbackScale: 1 });
    const cellValueTextScale = Number.isFinite(cellValueScale?.textScale) && cellValueScale.textScale > 0
      ? cellValueScale.textScale
      : 1;
    const adjustX = scaleX > 0 ? textScale / scaleX : 1;
    const adjustY = scaleY > 0 ? textScale / scaleY : 1;
    const texts = svg.querySelectorAll ? svg.querySelectorAll('text') : [];
    texts.forEach(text => {
      const baseTransform = getHeatmapBaseTransform(text);
      const x = Number(text.getAttribute('x'));
      const y = Number(text.getAttribute('y'));
      if(!Number.isFinite(x) || !Number.isFinite(y)){ return; }
      const inheritedRole = text.dataset?.fontRole
        || text.closest?.('[data-font-role]')?.dataset?.fontRole
        || '';
      const isCellValueText = text.dataset?.heatmapCellValue === '1'
        || inheritedRole === 'cellValue'
        || (typeof text.dataset?.fontKey === 'string' && /^cell-\d+-\d+$/.test(text.dataset.fontKey));
      const role = inheritedRole;
      const roleTextScale = heatmapRoleTextScales?.[role];
      const localTextScale = isCellValueText
        ? cellValueTextScale
        : (Number.isFinite(roleTextScale) && roleTextScale > 0 ? roleTextScale : textScale);
      const localAdjustX = scaleX > 0 ? localTextScale / scaleX : 1;
      const localAdjustY = scaleY > 0 ? localTextScale / scaleY : 1;
      const needsMatrix = Math.abs(localAdjustX - 1) > 1e-6 || Math.abs(localAdjustY - 1) > 1e-6;
      const matrix = needsMatrix
        ? `matrix(${formatHeatmapExportNumber(localAdjustX)},0,0,${formatHeatmapExportNumber(localAdjustY)},${formatHeatmapExportNumber(x - localAdjustX * x)},${formatHeatmapExportNumber(y - localAdjustY * y)})`
        : '';
      const nextTransform = matrix && baseTransform ? `${matrix} ${baseTransform}` : (matrix || baseTransform);
      const currentTransform = text.getAttribute('transform') || '';
      if(nextTransform){
        if(currentTransform !== nextTransform){
          text.setAttribute('transform', nextTransform);
        }
      }else if(currentTransform){
        text.removeAttribute('transform');
      }
      text.removeAttribute('data-heatmap-aspect-corrected');
    });
    debugLog('Debug: heatmap text aspect correction applied', {
      scaleX,
      scaleY,
      adjustX,
      adjustY,
      uniform,
      defaultScale,
      textScale,
      heatmapRoleTextScales,
      cellValueTextScale,
      textScaleMode: mode,
      aspectLocked,
      stableUnlockedScale: Number.isFinite(stableUnlockedScale) ? stableUnlockedScale : null,
      readableScale: readableScale || null,
      cellValueScale: cellValueScale || null
    });
  }

  function renderEmpty(message, session = null){
    const ownerSession = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    clearCachedRenderState(ownerSession);
    state.lastResolvedValueScale = null;
    updateHeatmapRenderRuntime(ownerSession, runtime => {
      runtime.lastResolvedValueScale = null;
    }, { seedFromActive: true });
    syncHeatmapPaletteInputs(resolveHeatmapRoot(ownerSession?.tabId || null));
    if(!state.svg) return;
    state.svg.removeAttribute?.(HEATMAP_RENDER_COMPLETE_ATTRIBUTE);
    state.svg.setAttribute?.(HEATMAP_RENDER_STATE_ATTRIBUTE, 'empty');
    if(state.emptyPlotNoticeEl && state.emptyPlotNoticeEl.parentNode){
      state.emptyPlotNoticeEl.parentNode.removeChild(state.emptyPlotNoticeEl);
    }
    state.emptyPlotNoticeEl = null;
    while(state.svg.firstChild){
      state.svg.removeChild(state.svg.firstChild);
    }
    const svgBox = state.svgBox || state.svg?.closest('.svgbox') || null;
    const emptyViewport = resolveEmptyViewportSize(svgBox);
    state.svg.setAttribute('viewBox', `0 0 ${emptyViewport.width} ${emptyViewport.height}`);
    const rendererAspectLocked = shouldHeatmapRendererPreserveAspect(state.svg.dataset?.heatmapModelType, svgBox);
    state.svg.setAttribute('preserveAspectRatio', rendererAspectLocked ? 'xMidYMid meet' : 'none');
    applySvgBoxAspect(svgBox, {
      locked: rendererAspectLocked,
      width: emptyViewport.width,
      height: emptyViewport.height
    });
    debugLog('Debug: heatmap empty viewBox set', {
      width: emptyViewport.width,
      height: emptyViewport.height,
      source: emptyViewport.source,
      rendererAspectLocked,
      preserveAspectRatio: state.svg.getAttribute('preserveAspectRatio')
    });

    const noticeMessage = message || (Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : 'Add data to the input table to generate a plot.');
    const noticeHost = state.svg.parentElement || null;
    if(noticeHost){
      state.svg.style.display = 'none';
      const notice = global.document.createElement('i');
      notice.textContent = noticeMessage;
      noticeHost.insertBefore(notice, state.svg.nextSibling);
      state.emptyPlotNoticeEl = notice;
    }else{
      state.svg.style.display = '';
      let text = null;
      if(typeof Shared.renderPlotNotice === 'function'){
        text = Shared.renderPlotNotice(state.svg, noticeMessage, {
          clear: false,
          resetAspect: false,
          show: false,
          svgX: 12,
          svgY: 12,
          svgFontSize: 16
        });
      }
      if(!text){
        text = global.document.createElementNS(NS, 'text');
        text.setAttribute('x', '12');
        text.setAttribute('y', '12');
        text.setAttribute('text-anchor', 'start');
        text.setAttribute('dominant-baseline', 'hanging');
        text.setAttribute('font-size', '16');
        text.setAttribute('font-style', 'italic');
        text.setAttribute('fill', '#555');
        text.textContent = noticeMessage;
        state.svg.appendChild(text);
      }
      markFontEditable(text, 'emptyMessage', 'heatmap-empty', ownerSession?.tabId || null);
      ensureGraphViewport(state.svg, {
        padding: 16,
        preserveAspectRatio: rendererAspectLocked ? 'xMidYMid meet' : 'none',
        debugLabel: 'heatmap-empty'
      });
    }
    state.layout?.syncPanels?.({ skipSchedule: true });
  }

  function appendStatRow(labelText, strongValueText, options = {}){
    const { trailing = [] } = options;
    const row = global.document.createElement('div');
    const labelSpan = global.document.createElement('span');
    labelSpan.textContent = `${labelText}: `;
    row.append(labelSpan);
    if(strongValueText !== undefined){
      const strongEl = global.document.createElement('strong');
      strongEl.textContent = strongValueText;
      row.append(strongEl);
    }
    trailing.forEach(text => {
      if(text !== undefined && text !== null && text !== ''){
        row.append(global.document.createTextNode(String(text)));
      }
    });
    state.statsEl.append(row);
    debugLog('Debug: heatmap appendStatRow executed', { labelText, hasStrongValue: strongValueText !== undefined, trailingCount: trailing.length });
    return row;
  }

  function updateStats(stats){
    state.lastStats = stats ? { ...stats } : null;
    updateHeatmapResultsState(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), results => {
      results.stats = cloneSimple(state.lastStats) || null;
      results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel || {});
    });
    if(!state.statsEl){
      debugLog('Debug: heatmap stats element missing');
      return;
    }
    clearHeatmapStatsReportHost();
    state.statsEl.textContent = '';
    if(!stats){
      state.statsEl.textContent = 'Add numeric data to draw the heatmap.';
      state.statsPanelModel = { resultsModel: null, reportModel: null };
      updateHeatmapResultsState(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), results => {
        results.stats = null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel);
      });
      return;
    }
    if(stats.type === 'correlation'){
      const methodLookup = {
        pearson: 'Pearson (linear)',
        spearman: 'Spearman (rank)',
        uncentered: 'Correlation (uncentered)'
      };
      const methodLabel = methodLookup[stats.method] || stats.method || 'Pearson (linear)';
      appendStatRow('Items analysed', String(stats.itemCount || 0));
      appendStatRow('Pairs evaluated', String(stats.pairCount || 0));
      appendStatRow('Method', methodLabel, { trailing: stats.useAbs ? [' (absolute values shown)'] : [] });
      if(stats.rowClusterLabel){
        appendStatRow('Row clustering', stats.rowClusterLabel + (stats.rowDendrogram ? ' (dendrogram)' : ''));
      }
      if(stats.columnClusterLabel && (!stats.rowClusterLabel || stats.columnClusterLabel !== stats.rowClusterLabel)){
        appendStatRow('Column clustering', stats.columnClusterLabel + (stats.columnDendrogram ? ' (dendrogram)' : ''));
      }else if(stats.columnDendrogram && stats.rowClusterLabel === stats.columnClusterLabel && stats.columnDendrogram !== stats.rowDendrogram){
        appendStatRow('Column dendrogram', 'Shown');
      }
      if(stats.strongest){
        const label = Array.isArray(stats.strongest.labels)
          ? stats.strongest.labels.join(' vs ')
          : String(stats.strongest.labels || '');
        const displayValue = Number.isFinite(stats.strongest.value)
          ? stats.strongest.value
          : Number.isFinite(stats.strongest.abs)
            ? stats.strongest.abs
            : Number.isFinite(stats.strongest.raw)
              ? Math.abs(stats.strongest.raw)
              : NaN;
        const row = appendStatRow('Strongest |r|', label);
        const formatted = Number.isFinite(displayValue) ? displayValue.toFixed(stats.decimals ?? 2) : 'n/a';
        row.append(global.document.createTextNode(` = ${formatted}`));
        const details = [];
        if(Number.isFinite(stats.strongest.raw)){
          details.push(`raw r = ${stats.strongest.raw.toFixed(stats.decimals ?? 2)}`);
        }
        if(Number.isFinite(stats.strongest.count)){
          details.push(`n=${stats.strongest.count}`);
        }
        if(details.length){
          row.append(global.document.createTextNode(` (${details.join(', ')})`));
        }
      }
      if(stats.mostNegative && !stats.useAbs){
        const label = Array.isArray(stats.mostNegative.labels)
          ? stats.mostNegative.labels.join(' vs ')
          : String(stats.mostNegative.labels || '');
        const row = appendStatRow('Most negative r', label);
        const pieces = [];
        if(Number.isFinite(stats.mostNegative.value)){
          pieces.push(` = ${stats.mostNegative.value.toFixed(stats.decimals ?? 2)}`);
        }
        if(Number.isFinite(stats.mostNegative.count)){
          pieces.push(` (n=${stats.mostNegative.count})`);
        }
        row.append(global.document.createTextNode(pieces.join('')));
      }
      if(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
        Shared.statsReporting.appendReportPanel(state.statsEl, {
          methodsText: `Heatmap correlation statistics were generated from the current numeric matrix using the ${methodLabel} method${stats.useAbs ? '; absolute correlations were displayed while raw signed values were retained where available for reporting' : ''}. Pairwise correlations used the available finite observations for each item pair. Row and column clustering summaries reflect the clustering options active in the displayed heatmap.`,
          resultsText: [
            `Items analysed = ${stats.itemCount || 0}; pairs evaluated = ${stats.pairCount || 0}.`,
            stats.strongest ? `Strongest |r| involved ${Array.isArray(stats.strongest.labels) ? stats.strongest.labels.join(' vs ') : String(stats.strongest.labels || '')}.` : null
          ].filter(Boolean).join(' '),
          analysisSpec: {
            component: 'heatmap',
            type: stats.type,
            method: stats.method || null,
            useAbs: !!stats.useAbs,
            itemCount: stats.itemCount || 0,
            pairCount: stats.pairCount || 0,
            rowClusterLabel: stats.rowClusterLabel || null,
            columnClusterLabel: stats.columnClusterLabel || null
          }
        }, { title: 'Reporting and reproducibility' });
      }
      const panelModel = captureHeatmapStatsPanelModel();
      updateHeatmapResultsState(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), results => {
        results.stats = cloneSimple(state.lastStats) || null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(panelModel);
      });
      return;
    }
    if(stats.type === 'values'){
      appendStatRow('Rows', String(stats.rowCount || 0));
      appendStatRow('Columns', String(stats.columnCount || 0));
      if(Number.isFinite(stats.finiteCount)){
        appendStatRow('Cells with data', String(stats.finiteCount));
      }
      if(Number.isFinite(stats.min)){
        appendStatRow('Minimum', stats.min.toFixed(stats.decimals ?? 2));
      }
      if(Number.isFinite(stats.max)){
        appendStatRow('Maximum', stats.max.toFixed(stats.decimals ?? 2));
      }
      if(Number.isFinite(stats.mean)){
        appendStatRow('Mean', stats.mean.toFixed(stats.decimals ?? 2));
      }
      if(stats.scaleCustomized && Number.isFinite(stats.scaleMin) && Number.isFinite(stats.scaleMax)){
        appendStatRow('Color scale', `${stats.scaleMin.toFixed(stats.decimals ?? 2)} to ${stats.scaleMax.toFixed(stats.decimals ?? 2)} (custom)`);
      }
      if(stats.logApplied !== undefined){
        appendStatRow('Log transform', stats.logApplied ? 'Applied' : 'Not applied');
      }
      if(stats.rowsFiltered){
        appendStatRow('Rows filtered', String(stats.rowsFiltered));
      }
      if(stats.columnsRemoved){
        appendStatRow('Columns removed', String(stats.columnsRemoved));
      }
      if(stats.rowClusterLabel){
        appendStatRow('Row clustering', stats.rowClusterLabel + (stats.rowDendrogram ? ' (dendrogram)' : ''));
      }
      if(stats.columnClusterLabel){
        appendStatRow('Column clustering', stats.columnClusterLabel + (stats.columnDendrogram ? ' (dendrogram)' : ''));
      }
      if(stats.adjustments){
        if(stats.adjustments.centerRows){
          appendStatRow('Rows centered', String(stats.adjustments.centerRows));
        }
        if(stats.adjustments.normalizeRows && stats.adjustments.normalizeRows.normalized !== undefined){
          appendStatRow('Rows normalized', String(stats.adjustments.normalizeRows.normalized));
        }
        if(stats.adjustments.centerColumns){
          appendStatRow('Columns centered', String(stats.adjustments.centerColumns));
        }
        if(stats.adjustments.normalizeColumns && stats.adjustments.normalizeColumns.normalized !== undefined){
          appendStatRow('Columns normalized', String(stats.adjustments.normalizeColumns.normalized));
        }
      }
      if(Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
        Shared.statsReporting.appendReportPanel(state.statsEl, {
          methodsText: `Heatmap value-summary statistics were generated from the current matrix view after applying the active parsing, filtering, transformation, and clustering options. Only finite numeric cells contributed to descriptive summaries; missing or non-numeric cells were ignored. ${stats.logApplied === true ? 'The reported values reflect the active log-transformed matrix.' : stats.logApplied === false ? 'No log transform was applied to the summarized values.' : ''}`,
          resultsText: [
            `Rows = ${stats.rowCount || 0}; columns = ${stats.columnCount || 0}.`,
            Number.isFinite(stats.min) && Number.isFinite(stats.max) ? `Values ranged from ${stats.min.toFixed(stats.decimals ?? 2)} to ${stats.max.toFixed(stats.decimals ?? 2)}.` : null
          ].filter(Boolean).join(' '),
          analysisSpec: {
            component: 'heatmap',
            type: stats.type,
            rowCount: stats.rowCount || 0,
            columnCount: stats.columnCount || 0,
            finiteCount: Number.isFinite(stats.finiteCount) ? stats.finiteCount : null,
            logApplied: stats.logApplied === undefined ? null : !!stats.logApplied,
            rowsFiltered: stats.rowsFiltered || 0,
            columnsRemoved: stats.columnsRemoved || 0
          }
        }, { title: 'Reporting and reproducibility' });
      }
      const panelModel = captureHeatmapStatsPanelModel();
      updateHeatmapResultsState(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), results => {
        results.stats = cloneSimple(state.lastStats) || null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(panelModel);
      });
      return;
    }
    if(stats.type === 'empty'){
      state.statsEl.textContent = stats.message || 'No data available for the current configuration.';
      state.statsPanelModel = { resultsModel: null, reportModel: null };
      updateHeatmapResultsState(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), results => {
        results.stats = cloneSimple(state.lastStats) || null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel);
      });
      return;
    }
    state.statsEl.textContent = 'Add numeric data to draw the heatmap.';
    state.statsPanelModel = { resultsModel: null, reportModel: null };
    updateHeatmapResultsState(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), results => {
      results.stats = cloneSimple(state.lastStats) || null;
      results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel);
    });
  }


  function parseHeatmapFontSizePx(value){
    if(value == null){ return NaN; }
    if(typeof value === 'number'){ return value; }
    const raw = String(value).trim();
    if(!raw){ return NaN; }
    const numeric = Number.parseFloat(raw);
    if(!Number.isFinite(numeric)){ return NaN; }
    if(raw.endsWith('pt')){
      return typeof chartStyle.ptToPx === 'function' ? chartStyle.ptToPx(numeric) : numeric * 1.3333;
    }
    return numeric;
  }

  function resolveHeatmapLabelMetrics({
    rowLabels,
    columnLabels,
    baseLabelFontSize,
    scaledFontSize,
    ownerTabId
  } = {}){
    const safeRows = Array.isArray(rowLabels) ? rowLabels : [];
    const safeColumns = Array.isArray(columnLabels) ? columnLabels : [];
    const fallbackFontSize = Math.max(1, Number(baseLabelFontSize) || 1);
    const fontStyles = exportFontStyles('heatmap', { tabId: ownerTabId || null }) || null;
    const graphFontSize = parseHeatmapFontSizePx(fontStyles?.__graph__?.fontSize);
    const resolveLabelFontSize = (key, fallback) => {
      const override = parseHeatmapFontSizePx(fontStyles?.[key]?.fontSize);
      if(Number.isFinite(override)){
        return override;
      }
      return Number.isFinite(graphFontSize) ? graphFontSize : fallback;
    };
    const rowFontSizes = safeRows.map((_, index) => resolveLabelFontSize(`row-label-${index}`, fallbackFontSize));
    const columnFontSizes = safeColumns.map((_, index) => resolveLabelFontSize(`column-label-${index}`, fallbackFontSize));
    const titleFontSize = resolveLabelFontSize(
      'graphTitle',
      Number.isFinite(graphFontSize) ? graphFontSize : (Number(scaledFontSize) || fallbackFontSize)
    );
    const maxRowFontSize = rowFontSizes.reduce((maxValue, value) => Math.max(maxValue, value), fallbackFontSize);
    const maxColumnFontSize = columnFontSizes.reduce((maxValue, value) => Math.max(maxValue, value), fallbackFontSize);
    const measureFonts = new Map();
    let measureFailureLogged = false;
    const resolveMeasureFont = size => {
      const safeSize = Math.max(4, Math.round(size || fallbackFontSize));
      if(!measureFonts.has(safeSize)){
        measureFonts.set(safeSize, chartStyle.makeFont ? chartStyle.makeFont(safeSize) : `${safeSize}px sans-serif`);
      }
      return measureFonts.get(safeSize);
    };
    const measureWidth = (label, size) => {
      if(typeof chartStyle.measureText === 'function'){
        try{
          return chartStyle.measureText(label || '', resolveMeasureFont(size));
        }catch(err){
          if(!measureFailureLogged){
            measureFailureLogged = true;
            debugLog('Debug: heatmap label measurement fallback', {
              message: err?.message || String(err)
            });
          }
        }
      }
      const fallbackSize = Number.isFinite(size) ? size : fallbackFontSize;
      return String(label || '').length * fallbackSize * 0.6;
    };
    return {
      graphFontSize,
      rowFontSizes,
      columnFontSizes,
      titleFontSize,
      maxRowFontSize,
      maxColumnFontSize,
      maxRowLabelWidth: safeRows.reduce(
        (maxValue, label, index) => Math.max(maxValue, measureWidth(label, rowFontSizes[index])),
        0
      ),
      maxColumnLabelWidth: safeColumns.reduce(
        (maxValue, label, index) => Math.max(maxValue, measureWidth(label, columnFontSizes[index])),
        0
      )
    };
  }

  function resolveHeatmapAspectAdjustment({
    rendererAspectLocked,
    drawableFrame,
    viewWidth,
    viewHeight
  } = {}){
    if(rendererAspectLocked){
      return { adjustX: 1, adjustY: 1 };
    }
    const displayWidth = Number(drawableFrame?.width);
    const displayHeight = Number(drawableFrame?.height);
    if(!Number.isFinite(displayWidth) || !Number.isFinite(displayHeight) || displayWidth <= 0 || displayHeight <= 0){
      return { adjustX: 1, adjustY: 1 };
    }
    const scaleX = viewWidth > 0 ? displayWidth / viewWidth : 1;
    const scaleY = viewHeight > 0 ? displayHeight / viewHeight : 1;
    if(!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0){
      return { adjustX: 1, adjustY: 1 };
    }
    const minScale = Math.min(scaleX, scaleY);
    const textScale = Number.isFinite(minScale) && minScale > 0
      ? minScale
      : (Math.sqrt(Math.max(scaleX * scaleY, 0)) || 1);
    return {
      adjustX: Math.max(1, textScale / scaleX),
      adjustY: Math.max(1, textScale / scaleY),
      scaleX,
      scaleY,
      textScale,
      scaleMode: 'min'
    };
  }

  function resolveLogicalHeatmapSceneLayout(options = {}){
    const rowCount = Math.max(1, Number(options.rowCount) || 1);
    const columnCount = Math.max(1, Number(options.columnCount) || 1);
    const cellSize = Math.max(1, Number(options.cellSize) || 1);
    const scaledFontSize = Math.max(1, Number(options.scaledFontSize) || 1);
    const titleFontSize = Math.max(1, Number(options.titleFontSize) || scaledFontSize);
    const maxRowLabelFontSize = Math.max(1, Number(options.maxRowLabelFontSize) || scaledFontSize);
    const maxColumnLabelFontSize = Math.max(1, Number(options.maxColumnLabelFontSize) || scaledFontSize);
    const extraLabelColumnWidth = Math.max(0, Number(options.extraLabelColumnWidth) || 0);
    const extraLabelRowHeight = Math.max(0, Number(options.extraLabelRowHeight) || 0);
    const heatmapWidth = columnCount * cellSize;
    const heatmapHeight = rowCount * cellSize;
    const outerPadding = Math.max(24, Math.round(scaledFontSize * 1.25));
    const titleGap = Math.max(8, Math.round(titleFontSize * 0.6));
    const titleHeight = Math.max(16, Math.round(titleFontSize * 1.1));
    const matrixLeft = outerPadding;
    const matrixTop = outerPadding + titleHeight + titleGap;
    const rowDendroWidth = options.showRowDendrogram
      ? Math.min(320, Math.max(60, Math.round(Math.max(cellSize * 1.6, heatmapWidth * 0.18))))
      : 0;
    const columnDendroHeight = options.showColumnDendrogram
      ? Math.max(60, Math.round(Math.max(cellSize * 1.3, heatmapHeight * 0.18)))
      : 0;
    const dendrogramPadding = (rowDendroWidth || columnDendroHeight)
      ? Math.max(12, Math.round(cellSize * 0.25))
      : Math.max(8, Math.round(cellSize * 0.2));
    let marginRight = 120;
    let marginBottom = 120;
    if(rowDendroWidth){
      marginRight += rowDendroWidth + dendrogramPadding;
    }
    if(columnDendroHeight){
      marginBottom += columnDendroHeight + dendrogramPadding;
    }
    const scaleWidth = 36;
    const scalePadding = 24;
    const scaleLabelGap = 48;
    marginRight += scaleWidth + scalePadding + scaleLabelGap;
    const rowLabelPadding = Math.max(6, Math.round(maxRowLabelFontSize * 0.35));
    const columnLabelPadding = Math.max(6, Math.round(maxColumnLabelFontSize * 0.35));
    const columnLabelDescenderPad = Math.max(4, Math.ceil(maxColumnLabelFontSize * 0.25));
    const buildLayout = adjustX => {
      const lengthScale = Number.isFinite(adjustX) ? adjustX : 1;
      const paddingX = rowLabelPadding * lengthScale;
      const paddingY = columnLabelPadding * lengthScale;
      const descenderY = columnLabelDescenderPad * lengthScale;
      const labelColumnWidth = Math.max(
        cellSize,
        Math.ceil((Number(options.maxRowLabelWidth) || 0) * lengthScale + paddingX * 2)
      );
      const labelRowHeight = Math.max(
        cellSize,
        Math.ceil((Number(options.maxColumnLabelWidth) || 0) * lengthScale + paddingY * 2 + descenderY)
      );
      return {
        labelColumnWidth,
        labelRowHeight,
        totalWidth: matrixLeft + labelColumnWidth + heatmapWidth + marginRight,
        totalHeight: matrixTop + labelRowHeight + heatmapHeight + marginBottom,
        paddingX,
        paddingY,
        descenderY
      };
    };
    let layout = buildLayout(1);
    let aspectAdjust = resolveHeatmapAspectAdjustment({
      rendererAspectLocked: !!options.rendererAspectLocked,
      drawableFrame: options.drawableFrame,
      viewWidth: layout.totalWidth,
      viewHeight: layout.totalHeight
    });
    if(aspectAdjust.adjustX > 1 || aspectAdjust.adjustY > 1){
      layout = buildLayout(aspectAdjust.adjustX);
      const refinedAdjust = resolveHeatmapAspectAdjustment({
        rendererAspectLocked: !!options.rendererAspectLocked,
        drawableFrame: options.drawableFrame,
        viewWidth: layout.totalWidth,
        viewHeight: layout.totalHeight
      });
      const finalAdjustX = Math.max(aspectAdjust.adjustX, refinedAdjust.adjustX);
      const finalAdjustY = Math.max(aspectAdjust.adjustY, refinedAdjust.adjustY);
      if(finalAdjustX > aspectAdjust.adjustX + 0.01 || finalAdjustY > aspectAdjust.adjustY + 0.01){
        layout = buildLayout(finalAdjustX);
      }
      aspectAdjust = { ...aspectAdjust, adjustX: finalAdjustX, adjustY: finalAdjustY };
    }
    return {
      normalized: false,
      totalWidth: layout.totalWidth + extraLabelColumnWidth,
      totalHeight: layout.totalHeight + extraLabelRowHeight,
      matrixLeft,
      matrixTop,
      heatmapWidth,
      heatmapHeight,
      cellWidth: cellSize,
      cellHeight: cellSize,
      labelColumnWidth: layout.labelColumnWidth + extraLabelColumnWidth,
      labelRowHeight: layout.labelRowHeight + extraLabelRowHeight,
      labelPaddingX: layout.paddingX,
      labelPaddingY: layout.paddingY,
      labelDescenderPadY: layout.descenderY,
      rowDendroWidth,
      columnDendroHeight,
      dendrogramPadding,
      scaleWidth,
      scalePadding,
      scaleLabelGap,
      outerPadding,
      titleGap,
      titleHeight,
      aspectAdjust
    };
  }

  function resolveHeatmapCellValueMetrics({
    orderedCells,
    rowCount,
    columnCount,
    maskLower,
    showCellText,
    effectiveCellSize,
    baseGraphFontSize
  } = {}){
    const cellValuePadding = Math.max(1, Math.round(effectiveCellSize * 0.08));
    const cellInnerSize = Math.max(1, effectiveCellSize - (cellValuePadding * 2));
    const heightFactor = 1.15;
    let fontSize = Math.min(
      Math.max(6, Math.round((Number(baseGraphFontSize) || 6) * 0.85)),
      Math.max(6, Math.floor(cellInnerSize))
    );
    const samples = [];
    if(showCellText){
      const seen = new Set();
      let longest = '';
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
          if(maskLower && columnIndex < rowIndex){
            continue;
          }
          const text = String(orderedCells?.[rowIndex]?.[columnIndex]?.displayText || '').trim();
          if(!text){ continue; }
          if(text.length > longest.length){
            longest = text;
          }
          if(seen.size < 256 && !seen.has(text)){
            seen.add(text);
            samples.push(text);
          }
        }
      }
      if(longest && !seen.has(longest)){
        samples.push(longest);
      }
    }
    const measureMaxWidth = fontPx => {
      if(!samples.length){ return 0; }
      const safeFontPx = Math.max(4, Math.round(fontPx));
      const font = chartStyle.makeFont ? chartStyle.makeFont(safeFontPx) : `${safeFontPx}px sans-serif`;
      let maxWidth = 0;
      for(const value of samples){
        let width = NaN;
        if(typeof chartStyle.measureText === 'function'){
          try{
            width = chartStyle.measureText(value, font);
          }catch(_err){
            width = NaN;
          }
        }
        if(!Number.isFinite(width)){
          width = String(value || '').length * Math.max(4, fontPx) * 0.6;
        }
        maxWidth = Math.max(maxWidth, width);
      }
      return maxWidth;
    };
    const fits = (fontPx, widthPx) => Number.isFinite(fontPx)
      && fontPx > 0
      && (Number.isFinite(widthPx) ? widthPx : 0) <= cellInnerSize + 0.01
      && (fontPx * heightFactor) <= cellInnerSize + 0.01;
    let maxTextWidth = measureMaxWidth(fontSize);
    if(showCellText && samples.length && !fits(fontSize, maxTextWidth)){
      const widthRatio = cellInnerSize / Math.max(maxTextWidth, 1);
      const heightRatio = cellInnerSize / Math.max(fontSize * heightFactor, 1);
      fontSize = Math.max(4, Math.floor(fontSize * Math.min(1, widthRatio, heightRatio)));
      maxTextWidth = measureMaxWidth(fontSize);
      while(fontSize > 4 && !fits(fontSize, maxTextWidth)){
        fontSize -= 1;
        maxTextWidth = measureMaxWidth(fontSize);
      }
    }
    return {
      fontSize,
      maxTextWidth,
      padding: cellValuePadding,
      innerSize: cellInnerSize,
      heightFactor,
      sampleCount: samples.length
    };
  }

  function measureHeatmapNodeBounds(nodes, options = {}){
    const useScreenCoordinates = options.screen === true;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for(const node of Array.from(nodes || [])){
      if(!node){ continue; }
      let box = null;
      try{
        box = useScreenCoordinates
          ? node.getBoundingClientRect?.()
          : node.getBBox?.();
      }catch(_err){
        box = null;
      }
      if(!box){ continue; }
      const x = useScreenCoordinates ? Number(box.left) : Number(box.x);
      const y = useScreenCoordinates ? Number(box.top) : Number(box.y);
      const right = useScreenCoordinates ? Number(box.right) : x + Number(box.width);
      const bottom = useScreenCoordinates ? Number(box.bottom) : y + Number(box.height);
      if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(right) || !Number.isFinite(bottom)){
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    }
    return minX === Infinity
      ? null
      : { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function selectHeatmapProjectionIndices(count, maxCount){
    const total = Math.max(0, Math.floor(Number(count) || 0));
    const limit = Math.max(0, Math.floor(Number(maxCount) || 0));
    if(total === 0 || limit === 0){
      return [];
    }
    if(total <= limit){
      return Array.from({ length: total }, (_value, index) => index);
    }
    if(limit === 1){
      return [0];
    }
    const selected = [];
    const seen = new Set();
    for(let sampleIndex = 0; sampleIndex < limit; sampleIndex += 1){
      const index = Math.round((sampleIndex * (total - 1)) / (limit - 1));
      if(!seen.has(index)){
        seen.add(index);
        selected.push(index);
      }
    }
    return selected;
  }

  function resolveHeatmapLiveLabelIndices({
    count,
    screenSpan,
    minGapPx,
    hardLimit,
    dense
  } = {}){
    const total = Math.max(0, Math.floor(Number(count) || 0));
    if(!dense || total <= 0){
      return selectHeatmapProjectionIndices(total, total);
    }
    const span = Math.max(1, Number(screenSpan) || 1);
    const gap = Math.max(1, Number(minGapPx) || 1);
    const limit = Math.max(2, Math.min(
      Math.max(2, Math.floor(Number(hardLimit) || total)),
      Math.max(2, Math.floor(span / gap))
    ));
    return selectHeatmapProjectionIndices(total, limit);
  }

  function createHeatmapLabelProjectionMetadata({
    orderedRowLabels,
    orderedColumnLabels,
    rowLabelFontSizes,
    columnLabelFontSizes,
    uniformRowLabelFontSize,
    uniformColumnLabelFontSize,
    matrixLeft,
    matrixTop,
    labelColumnWidth,
    labelRowHeight,
    labelPaddingX,
    labelPaddingY,
    dataStartX,
    dataStartY,
    cellWidth,
    cellHeight,
    ownerTabId,
    renderedRowIndices,
    renderedColumnIndices
  } = {}){
    return {
      rowLabels: Array.isArray(orderedRowLabels) ? orderedRowLabels.slice() : [],
      columnLabels: Array.isArray(orderedColumnLabels) ? orderedColumnLabels.slice() : [],
      rowLabelFontSizes: Array.isArray(rowLabelFontSizes) ? rowLabelFontSizes.slice() : [],
      columnLabelFontSizes: Array.isArray(columnLabelFontSizes) ? columnLabelFontSizes.slice() : [],
      uniformRowLabelFontSize: Number.isFinite(uniformRowLabelFontSize) ? uniformRowLabelFontSize : null,
      uniformColumnLabelFontSize: Number.isFinite(uniformColumnLabelFontSize) ? uniformColumnLabelFontSize : null,
      matrixLeft: Number(matrixLeft) || 0,
      matrixTop: Number(matrixTop) || 0,
      labelColumnWidth: Number(labelColumnWidth) || 0,
      labelRowHeight: Number(labelRowHeight) || 0,
      labelPaddingX: Number(labelPaddingX) || 0,
      labelPaddingY: Number(labelPaddingY) || 0,
      dataStartX: Number(dataStartX) || 0,
      dataStartY: Number(dataStartY) || 0,
      cellWidth: Number(cellWidth) || 0,
      cellHeight: Number(cellHeight) || 0,
      ownerTabId: ownerTabId ? String(ownerTabId) : null,
      renderedRowIndices: Array.isArray(renderedRowIndices) ? renderedRowIndices.slice() : [],
      renderedColumnIndices: Array.isArray(renderedColumnIndices) ? renderedColumnIndices.slice() : [],
      sampled: (Array.isArray(renderedRowIndices) ? renderedRowIndices.length : 0) < (Array.isArray(orderedRowLabels) ? orderedRowLabels.length : 0)
        || (Array.isArray(renderedColumnIndices) ? renderedColumnIndices.length : 0) < (Array.isArray(orderedColumnLabels) ? orderedColumnLabels.length : 0)
    };
  }

  function resolveHeatmapProjectionTransformScale(group){
    const transform = group?.querySelector?.('text')?.getAttribute?.('transform') || '';
    const match = /^matrix\(\s*([^)]*)\)/i.exec(transform.trim());
    if(!match){
      return null;
    }
    const values = match[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if(values.length < 6 || values.some(value => !Number.isFinite(value))){
      return null;
    }
    const [scaleX, skewY, skewX, scaleY] = values;
    if(Math.abs(skewX) > 1e-9 || Math.abs(skewY) > 1e-9 || scaleX <= 0 || scaleY <= 0){
      return null;
    }
    return { scaleX, scaleY };
  }

  function buildHeatmapProjectionTextTransform({ x, y, baseTransform = '', scale = null } = {}){
    const coordinateX = Number(x);
    const coordinateY = Number(y);
    if(!Number.isFinite(coordinateX) || !Number.isFinite(coordinateY)){
      return String(baseTransform || '').trim();
    }
    const scaleX = Number(scale?.scaleX);
    const scaleY = Number(scale?.scaleY);
    const hasScale = Number.isFinite(scaleX)
      && Number.isFinite(scaleY)
      && scaleX > 0
      && scaleY > 0
      && (Math.abs(scaleX - 1) > 1e-9 || Math.abs(scaleY - 1) > 1e-9);
    const matrix = hasScale
      ? `matrix(${formatHeatmapExportNumber(scaleX)},0,0,${formatHeatmapExportNumber(scaleY)},${formatHeatmapExportNumber(coordinateX - scaleX * coordinateX)},${formatHeatmapExportNumber(coordinateY - scaleY * coordinateY)})`
      : '';
    const base = String(baseTransform || '').trim();
    return matrix && base ? `${matrix} ${base}` : (matrix || base);
  }

  function indexHeatmapProjectedLabels(group){
    const labels = new Map();
    Array.from(group?.querySelectorAll?.('text[data-heatmap-source-index]') || []).forEach(node => {
      const index = Number(node.getAttribute('data-heatmap-source-index'));
      if(Number.isInteger(index) && index >= 0){
        labels.set(index, node);
      }
    });
    return labels;
  }

  function cloneHeatmapProjectionLabel(doc, node){
    if(!node){
      return doc.createElementNS(NS, 'text');
    }
    return typeof doc.importNode === 'function'
      ? doc.importNode(node, true)
      : node.cloneNode(true);
  }

  function resolveHeatmapLabelProjectionForSvg(sourceSvg){
    const direct = sourceSvg?.__heatmapLabelProjection || null;
    if(direct){
      return direct;
    }
    const ownerTabId = String(
      sourceSvg?.dataset?.fontTabId
      || sourceSvg?.dataset?.workspaceTabId
      || sourceSvg?.closest?.('[data-workspace-tab-id]')?.getAttribute?.('data-workspace-tab-id')
      || ''
    ).trim();
    const session = ownerTabId
      ? getHeatmapSession(ownerTabId, { tabId: ownerTabId, reason: 'heatmap-label-projection-owner' }, { create: false })
      : getActiveHeatmapSessionForState();
    if(ownerTabId && !session){
      return null;
    }
    return getHeatmapRenderRuntime(session, { seedFromActive: !ownerTabId && !session })?.labelProjection || null;
  }

  function prepareHeatmapProjectionLabelForExport(text, role, key, ownerTabId){
    if(!text?.dataset){
      return;
    }
    text.dataset.fontEditable = '1';
    text.dataset.fontScope = 'heatmap';
    text.dataset.fontRole = role;
    text.dataset.fontKey = key;
    if(ownerTabId){
      text.dataset.fontTabId = String(ownerTabId);
    }
  }

  function populateHeatmapExportLabelGroups(sourceSvg, cloneSvg){
    const projection = resolveHeatmapLabelProjectionForSvg(sourceSvg);
    if(!projection?.sampled || !cloneSvg){
      return false;
    }
    const doc = cloneSvg.ownerDocument || global.document;
    const sourceRowGroup = sourceSvg.querySelector?.('[data-layer="row-labels"]') || null;
    const sourceColumnGroup = sourceSvg.querySelector?.('[data-layer="column-labels"]') || null;
    const rowGroup = cloneSvg.querySelector?.('[data-layer="row-labels"]') || null;
    const columnGroup = cloneSvg.querySelector?.('[data-layer="column-labels"]') || null;
    if(!doc || !sourceRowGroup || !sourceColumnGroup || !rowGroup || !columnGroup){
      return false;
    }
    const rowScale = resolveHeatmapProjectionTransformScale(sourceRowGroup);
    const columnScale = resolveHeatmapProjectionTransformScale(sourceColumnGroup);
    const sourceRowsByIndex = indexHeatmapProjectedLabels(sourceRowGroup);
    const sourceColumnsByIndex = indexHeatmapProjectedLabels(sourceColumnGroup);
    while(rowGroup.firstChild){
      rowGroup.removeChild(rowGroup.firstChild);
    }
    while(columnGroup.firstChild){
      columnGroup.removeChild(columnGroup.firstChild);
    }
    const rowFragment = doc.createDocumentFragment();
    projection.rowLabels.forEach((label, index) => {
      const text = cloneHeatmapProjectionLabel(doc, sourceRowsByIndex.get(index));
      const x = projection.matrixLeft + projection.labelColumnWidth - projection.labelPaddingX;
      const y = projection.dataStartY + index * projection.cellHeight + projection.cellHeight / 2;
      text.setAttribute('x', formatHeatmapExportNumber(x));
      text.setAttribute('y', formatHeatmapExportNumber(y));
      text.setAttribute('data-heatmap-source-index', String(index));
      prepareHeatmapProjectionLabelForExport(
        text,
        'rowLabel',
        `row-label-${index}`,
        projection.ownerTabId
      );
      if(!Number.isFinite(projection.uniformRowLabelFontSize)){
        const fontSize = Number(projection.rowLabelFontSizes[index]);
        if(Number.isFinite(fontSize)){
          text.setAttribute('font-size', formatHeatmapExportNumber(fontSize));
        }
      }
      const transform = buildHeatmapProjectionTextTransform({ x, y, scale: rowScale });
      if(transform){
        text.setAttribute('transform', transform);
      }
      text.textContent = label == null ? '' : String(label);
      fontControls?.applySavedStyle?.(text);
      rowFragment.appendChild(text);
    });
    rowGroup.appendChild(rowFragment);
    const columnFragment = doc.createDocumentFragment();
    projection.columnLabels.forEach((label, index) => {
      const text = cloneHeatmapProjectionLabel(doc, sourceColumnsByIndex.get(index));
      const x = projection.dataStartX + index * projection.cellWidth + projection.cellWidth / 2;
      const y = projection.matrixTop + projection.labelRowHeight - projection.labelPaddingY;
      text.setAttribute('x', formatHeatmapExportNumber(x));
      text.setAttribute('y', formatHeatmapExportNumber(y));
      text.setAttribute('data-heatmap-source-index', String(index));
      prepareHeatmapProjectionLabelForExport(
        text,
        'columnLabel',
        `column-label-${index}`,
        projection.ownerTabId
      );
      if(!Number.isFinite(projection.uniformColumnLabelFontSize)){
        const fontSize = Number(projection.columnLabelFontSizes[index]);
        if(Number.isFinite(fontSize)){
          text.setAttribute('font-size', formatHeatmapExportNumber(fontSize));
        }
      }
      const baseTransform = `rotate(-90 ${formatHeatmapExportNumber(x)} ${formatHeatmapExportNumber(y)})`;
      const transform = buildHeatmapProjectionTextTransform({
        x,
        y,
        baseTransform,
        scale: columnScale
      });
      if(transform){
        text.setAttribute('transform', transform);
      }
      text.textContent = label == null ? '' : String(label);
      fontControls?.applySavedStyle?.(text);
      columnFragment.appendChild(text);
    });
    columnGroup.appendChild(columnFragment);
    cloneSvg.setAttribute('data-heatmap-export-label-projection', 'full');
    cloneSvg.setAttribute('data-heatmap-export-row-label-count', String(projection.rowLabels.length));
    cloneSvg.setAttribute('data-heatmap-export-column-label-count', String(projection.columnLabels.length));
    return true;
  }


  function markHeatmapRenderStarted(svg){
    if(!svg){
      return;
    }
    svg.removeAttribute?.(HEATMAP_RENDER_COMPLETE_ATTRIBUTE);
    svg.setAttribute?.(HEATMAP_RENDER_STATE_ATTRIBUTE, 'rendering');
  }

  function markHeatmapRenderCompleted(svg, meta = {}){
    if(!svg){
      return;
    }
    svg.setAttribute?.(HEATMAP_RENDER_COMPLETE_ATTRIBUTE, 'true');
    svg.setAttribute?.(HEATMAP_RENDER_STATE_ATTRIBUTE, 'complete');
    if(Number.isFinite(Number(meta.rows))){
      svg.setAttribute?.('data-heatmap-render-row-count', String(Math.max(0, Number(meta.rows))));
    }
    if(Number.isFinite(Number(meta.columns))){
      svg.setAttribute?.('data-heatmap-render-column-count', String(Math.max(0, Number(meta.columns))));
    }
  }

  function markHeatmapRenderIncomplete(svg){
    if(!svg){
      return;
    }
    svg.removeAttribute?.(HEATMAP_RENDER_COMPLETE_ATTRIBUTE);
    svg.setAttribute?.(HEATMAP_RENDER_STATE_ATTRIBUTE, 'incomplete');
  }

  function drawHeatmap({
    orderedRowLabels,
    orderedColumnLabels,
    orderedCells,
    rowOrder,
    columnOrder,
    rowClustering,
    columnClustering,
    showRowDendrogram,
    showColumnDendrogram,
    maskLower,
    cellSize,
    fontSize,
    showValues,
    decimals,
    colorScale,
    legendHeightMode,
    layoutAdjust,
    modelType = null,
    drawSession = null
  }){
    state.isRendering = true;
    const renderTargetSvg = state.svg || null;
    let renderCompleted = false;
    markHeatmapRenderStarted(renderTargetSvg);
    const renderStartedAt = nowMs();
    let previousRenderStageAt = renderStartedAt;
    const renderStages = {};
    const markRenderStage = name => {
      const current = nowMs();
      renderStages[name] = Number((current - previousRenderStageAt).toFixed(1));
      previousRenderStageAt = current;
    };
    try{
    const ownerSession = ensureHeatmapSessionOwnershipShape(drawSession || getActiveHeatmapSessionForState());
    const ownerTabId = ownerSession?.tabId || getHeatmapProjectionTabId() || null;
    const rowCount = orderedRowLabels.length;
    const columnCount = orderedColumnLabels.length;
    const showCellText = Array.isArray(orderedCells)
      && orderedCells.some(row => Array.isArray(row) && row.some(cell => String(cell?.displayText || '').trim()));
    const useCanvasCellRender = shouldUseHeatmapCellCanvas({
      modelType,
      rowCount,
      columnCount,
      showCellText
    });
    if(rowCount === 0 || columnCount === 0){
      renderEmpty(Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, ownerSession);
      renderCompleted = true;
      return;
    }
    const doc = global.document;
    delete state.svg.__heatmapLabelProjection;
    updateHeatmapRenderRuntime(ownerSession, runtime => {
      runtime.labelProjection = null;
    }, { seedFromActive: true });
    while(state.svg.firstChild){
      state.svg.removeChild(state.svg.firstChild);
    }
    const drawableFrame = resolveHeatmapDrawableFrame(state.svg);
    const svgRect = state.svg?.getBoundingClientRect?.();
    let fontInfo = null;
    if(typeof chartStyle.resolveScaledFontSize === 'function'){
      fontInfo = chartStyle.resolveScaledFontSize({
        rawSize: refs.fontSize?.value ?? fontSize,
        basePt: fontSize,
        width: drawableFrame.width,
        height: drawableFrame.height,
        svgBox: state.svgBox,
        input: refs.fontSize,
        scopeId: 'heatmap'
      });
      if(typeof chartStyle.renderFontSizeLabel === 'function'){
        chartStyle.renderFontSizeLabel({
          element: refs.fontSizeVal,
          pt: Number(refs.fontSize?.value ?? fontInfo?.pt ?? fontSize),
          input: refs.fontSize,
          manual: true
        });
      }
    }
    const scaledFontSize = Number.isFinite(fontInfo?.scaledPx)
      ? fontInfo.scaledPx
      : (Number.isFinite(fontInfo?.px) ? fontInfo.px : fontSize);
    const svgBox = state.svgBox || state.svg?.closest('.svgbox') || null;
    const resizerAspectLocked = isSvgBoxAspectLocked(svgBox);
    const rendererAspectLocked = shouldHeatmapRendererPreserveAspect(modelType, svgBox);
    if(state.svg.dataset){
      state.svg.dataset.heatmapModelType = modelType || '';
    }
    // Data-values heatmaps have no axes. Lock ratio constrains only their outer
    // resize frame; changing SVG projection would mutate the rendered geometry.
    const ignoreAxisViewportLock = modelType === 'values';
    const viewportOptions = { ignoreAxisViewportLock };
    const baseLabelFontSize = Math.max(6, Math.round(scaledFontSize));
    if(state.svg.dataset){
      state.svg.dataset.heatmapRowLabelCount = String(rowCount);
      state.svg.dataset.heatmapRenderedRowLabelCount = String(rowCount);
    }
    const labelMetrics = resolveHeatmapLabelMetrics({
      rowLabels: orderedRowLabels,
      columnLabels: orderedColumnLabels,
      baseLabelFontSize,
      scaledFontSize,
      ownerTabId
    });
    const {
      graphFontSize,
      rowFontSizes: rowLabelFontSizes,
      columnFontSizes: columnLabelFontSizes,
      titleFontSize,
      maxRowFontSize: maxRowLabelFontSize,
      maxColumnFontSize: maxColumnLabelFontSize,
      maxRowLabelWidth,
      maxColumnLabelWidth
    } = labelMetrics;
    const heavySceneLayout = useCanvasCellRender
      ? resolveHeavyHeatmapSceneLayout({
          frameWidth: drawableFrame.width,
          frameHeight: drawableFrame.height,
          rowCount,
          columnCount,
          maxRowLabelWidth,
          maxColumnLabelWidth,
          maxRowLabelFontSize,
          maxColumnLabelFontSize,
          titleFontSize,
          showRowDendrogram: !!(showRowDendrogram && rowClustering?.tree),
          showColumnDendrogram: !!(showColumnDendrogram && columnClustering?.tree)
        })
      : null;
    const usesNormalizedHeavyScene = !!heavySceneLayout;
    const extraLabelColumnWidth = usesNormalizedHeavyScene
      ? 0
      : Math.max(0, Number(layoutAdjust?.extraLabelColumnWidth) || 0);
    const extraLabelRowHeight = usesNormalizedHeavyScene
      ? 0
      : Math.max(0, Number(layoutAdjust?.extraLabelRowHeight) || 0);
    const sceneLayout = heavySceneLayout || resolveLogicalHeatmapSceneLayout({
      rowCount,
      columnCount,
      cellSize,
      scaledFontSize,
      titleFontSize,
      maxRowLabelFontSize,
      maxColumnLabelFontSize,
      maxRowLabelWidth,
      maxColumnLabelWidth,
      showRowDendrogram: !!(showRowDendrogram && rowClustering?.tree),
      showColumnDendrogram: !!(showColumnDendrogram && columnClustering?.tree),
      rendererAspectLocked,
      drawableFrame,
      extraLabelColumnWidth,
      extraLabelRowHeight
    });
    const {
      heatmapWidth,
      heatmapHeight,
      cellWidth,
      cellHeight,
      outerPadding,
      titleGap,
      titleHeight,
      matrixLeft,
      matrixTop,
      rowDendroWidth,
      columnDendroHeight,
      dendrogramPadding: dendroPadding,
      scaleWidth,
      scalePadding,
      scaleLabelGap,
      labelColumnWidth,
      labelRowHeight,
      labelPaddingX,
      labelPaddingY,
      labelDescenderPadY,
      totalWidth,
      totalHeight,
      aspectAdjust
    } = sceneLayout;
    const dendroHeatmapGap = 0;

    // Heavy canvas heatmaps use a display-normalized scene. The raster matrix and
    // every SVG overlay share these explicit bounds, so generic bbox expansion
    // cannot move the legend or dendrogram away from the matrix.
    state.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    if(state.svg.dataset){
      state.svg.dataset.heatmapSceneMode = usesNormalizedHeavyScene ? 'normalized-canvas' : 'logical-svg';
      state.svg.dataset.heatmapSceneWidth = String(totalWidth);
      state.svg.dataset.heatmapSceneHeight = String(totalHeight);
      state.svg.dataset.heatmapMatrixWidth = String(heatmapWidth);
      state.svg.dataset.heatmapMatrixHeight = String(heatmapHeight);
    }

    const preserveAspect = rendererAspectLocked ? 'xMidYMid meet' : 'none';
    state.svg.setAttribute('preserveAspectRatio', preserveAspect);
    applySvgBoxAspect(svgBox, { locked: rendererAspectLocked, width: totalWidth, height: totalHeight });
    debugLog('Debug: heatmap graph viewBox set', {
      resizerAspectLocked,
      rendererAspectLocked,
      preserveAspect,
      totalWidth,
      totalHeight,
      preserveAspectRatio: state.svg.getAttribute('preserveAspectRatio')
    });
    const title = doc.createElementNS(NS, 'text');
    const defaultTitleX = totalWidth / 2;
    const defaultTitleY = matrixTop - titleGap;
    const titlePos = state.labelPositions?.title;

    // Convert relative positions to absolute if needed
    let absoluteTitleX = defaultTitleX;
    let absoluteTitleY = defaultTitleY;
    if (titlePos) {
      if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
        // Use relative positioning
        absoluteTitleX = titlePos.relX * totalWidth;
        absoluteTitleY = titlePos.relY * matrixTop;
      } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
        // Use saved absolute positioning when no relative anchor is present
        absoluteTitleX = titlePos.x;
        absoluteTitleY = titlePos.y;
      }
    }

    title.setAttribute('x', String(absoluteTitleX));
    title.setAttribute('y', String(absoluteTitleY));
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', String(titleFontSize));
    title.textContent = state.titleText != null ? String(state.titleText) : 'Heatmap';
    markFontEditable(title, 'graphTitle', 'graphTitle', ownerTabId);
    let titleEditInitialValue = null;
    const applyHeatmapTitle = (value, reason = 'heatmap-title-edit') => {
      const nextValue = value != null ? String(value) : '';
      patchHeatmapVisualState(ownerSession, { titleText: nextValue }, { reason });
      if(title.isConnected && title.textContent !== nextValue){
        title.textContent = nextValue;
      }
      return nextValue;
    };
    makeEditable(title, txt => {
      const nextValue = txt != null ? String(txt) : '';
      const previous = titleEditInitialValue != null
        ? String(titleEditInitialValue)
        : String(ownerSession?.state?.titleText ?? state.titleText ?? '');
      applyHeatmapTitle(nextValue, 'heatmap-title-commit');
      if(previous !== nextValue){
        recordHeatmapChange('heatmap:title', previous, nextValue, value => {
          applyHeatmapTitle(value, 'heatmap-title-undo-redo');
          scheduleHeatmapDrawForSession(ownerSession, {
            tabId: ownerSession?.tabId || ownerTabId || undefined,
            viewOnly: true,
            reason: 'heatmap-title-undo-redo'
          });
          return true;
        });
      }
      titleEditInitialValue = null;
    }, {
      onEditStart: () => {
        titleEditInitialValue = String(ownerSession?.state?.titleText ?? state.titleText ?? title.textContent ?? '');
        updateHeatmapDrawRuntime(ownerSession, runtime => {
          runtime.inlineTextEditing = true;
        }, { seedFromActive: true });
      },
      onInput: value => {
        // Keep the owning session authoritative while Shared.makeEditable updates the
        // current SVG projection. This prevents any incidental style/layout refresh from
        // rebuilding the title from the pre-edit value.
        applyHeatmapTitle(value, 'heatmap-title-input');
      },
      onEditEnd: () => {
        updateHeatmapDrawRuntime(ownerSession, runtime => {
          runtime.inlineTextEditing = false;
        }, { seedFromActive: true });
      }
    });
    // Enable drag for title
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(title, state.svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions
          const relX = pos.x / totalWidth;
          const relY = pos.y / matrixTop;
          patchHeatmapLabelPosition(ownerSession, 'title', {
            x: pos.x,
            y: pos.y,
            relX: relX,
            relY: relY
          }, { reason: 'heatmap-title-position' });
          debugLog('Debug: heatmap title position saved', { absolute: pos, relative: { relX, relY } });
        }
      });
    }
    state.svg.appendChild(title);

    const defs = doc.createElementNS(NS, 'defs');


    state.svg.appendChild(defs);
    const gradientId = `heatmap-scale-${Math.floor((global.performance?.now?.() || Date.now()) * 1000)}`;
    const gradient = doc.createElementNS(NS, 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y1', '100%');
    gradient.setAttribute('y2', '0%');
    (colorScale?.stops || []).forEach(stopInfo => {
      const stop = doc.createElementNS(NS, 'stop');
      stop.setAttribute('offset', `${stopInfo.offset}%`);
      stop.setAttribute('stop-color', stopInfo.color);
      gradient.appendChild(stop);
    });
    defs.appendChild(gradient);
    const g = doc.createElementNS(NS, 'g');
    state.svg.appendChild(g);
    const dataStartX = matrixLeft + labelColumnWidth;
    const dataStartY = matrixTop + labelRowHeight;
    debugLog('Debug: heatmap label layout', {
      labelRowHeight,
      labelColumnWidth,
      baseLabelFontSize,
      maxRowLabelFontSize,
      maxColumnLabelFontSize,
      labelPaddingX,
      labelPaddingY,
      labelDescenderPadY,
      extraLabelColumnWidth,
      extraLabelRowHeight,
      aspectAdjust,
      dataStartX,
      dataStartY,
      rowCount,
      columnCount
    });
    const uniformRowLabelFontSize = resolveUniformHeatmapFontSize(rowLabelFontSizes, baseLabelFontSize);
    const uniformColumnLabelFontSize = resolveUniformHeatmapFontSize(columnLabelFontSizes, baseLabelFontSize);
    const rowLabelGroup = doc.createElementNS(NS, 'g');
    rowLabelGroup.setAttribute('data-layer', 'row-labels');
    rowLabelGroup.setAttribute('text-anchor', 'end');
    rowLabelGroup.setAttribute('dominant-baseline', 'middle');
    if(Number.isFinite(uniformRowLabelFontSize)){
      rowLabelGroup.setAttribute('font-size', String(uniformRowLabelFontSize));
    }
    markDenseHeatmapLabelGroup(rowLabelGroup, 'rowLabel', ownerTabId);
    g.appendChild(rowLabelGroup);
    const columnLabelGroup = doc.createElementNS(NS, 'g');
    columnLabelGroup.setAttribute('data-layer', 'column-labels');
    columnLabelGroup.setAttribute('text-anchor', 'start');
    columnLabelGroup.setAttribute('dominant-baseline', 'middle');
    if(Number.isFinite(uniformColumnLabelFontSize)){
      columnLabelGroup.setAttribute('font-size', String(uniformColumnLabelFontSize));
    }
    markDenseHeatmapLabelGroup(columnLabelGroup, 'columnLabel', ownerTabId);
    g.appendChild(columnLabelGroup);
    const renderedRowIndices = resolveHeatmapLiveLabelIndices({
      count: rowCount,
      screenSpan: drawableFrame.height,
      minGapPx: HEATMAP_LIVE_ROW_LABEL_MIN_GAP_PX,
      hardLimit: HEATMAP_LIVE_MAX_ROW_LABELS,
      dense: usesNormalizedHeavyScene
    });
    const renderedColumnIndices = resolveHeatmapLiveLabelIndices({
      count: columnCount,
      screenSpan: drawableFrame.width,
      minGapPx: HEATMAP_LIVE_COLUMN_LABEL_MIN_GAP_PX,
      hardLimit: HEATMAP_LIVE_MAX_COLUMN_LABELS,
      dense: usesNormalizedHeavyScene
    });
    if(state.svg.dataset){
      state.svg.dataset.heatmapRenderedRowLabelCount = String(renderedRowIndices.length);
      state.svg.dataset.heatmapRenderedColumnLabelCount = String(renderedColumnIndices.length);
      state.svg.dataset.heatmapLabelProjection = usesNormalizedHeavyScene ? 'pixel-sampled' : 'full';
    }
    const rowLabelFragment = doc.createDocumentFragment();
    renderedRowIndices.forEach(index => {
      const label = orderedRowLabels[index];
      const text = doc.createElementNS(NS, 'text');
      const x = matrixLeft + labelColumnWidth - labelPaddingX;
      const y = dataStartY + index * cellHeight + cellHeight / 2;
      const labelFontSize = rowLabelFontSizes[index] || baseLabelFontSize;
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('data-heatmap-source-index', String(index));
      if(!Number.isFinite(uniformRowLabelFontSize)){
        text.setAttribute('font-size', String(labelFontSize));
      }
      text.textContent = label;
      markDenseHeatmapLabel(text, 'rowLabel', `row-label-${index}`, ownerTabId);
      rowLabelFragment.appendChild(text);
    });
    rowLabelGroup.appendChild(rowLabelFragment);
    const columnLabelFragment = doc.createDocumentFragment();
    renderedColumnIndices.forEach(index => {
      const label = orderedColumnLabels[index];
      const text = doc.createElementNS(NS, 'text');
      const x = dataStartX + index * cellWidth + cellWidth / 2;
      const y = matrixTop + labelRowHeight - labelPaddingY;
      const labelFontSize = columnLabelFontSizes[index] || baseLabelFontSize;
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('data-heatmap-source-index', String(index));
      if(!Number.isFinite(uniformColumnLabelFontSize)){
        text.setAttribute('font-size', String(labelFontSize));
      }
      text.setAttribute('transform', `rotate(-90 ${x} ${y})`);
      text.textContent = label;
      markDenseHeatmapLabel(text, 'columnLabel', `column-label-${index}`, ownerTabId);
      columnLabelFragment.appendChild(text);
    });
    columnLabelGroup.appendChild(columnLabelFragment);
    const labelProjection = createHeatmapLabelProjectionMetadata({
      orderedRowLabels,
      orderedColumnLabels,
      rowLabelFontSizes,
      columnLabelFontSizes,
      uniformRowLabelFontSize,
      uniformColumnLabelFontSize,
      matrixLeft,
      matrixTop,
      labelColumnWidth,
      labelRowHeight,
      labelPaddingX,
      labelPaddingY,
      dataStartX,
      dataStartY,
      cellWidth,
      cellHeight,
      ownerTabId,
      renderedRowIndices,
      renderedColumnIndices
    });
    state.svg.__heatmapLabelProjection = labelProjection;
    updateHeatmapRenderRuntime(ownerSession, runtime => {
      runtime.labelProjection = cloneSimple(labelProjection) || null;
    }, { seedFromActive: true });
    markRenderStage('layoutAndLabelsMs');
    // Create a separate layer for the data matrix cells to support composite export (PNG matrix + SVG labels)
    const cellLayer = doc.createElementNS(NS, 'g');
    cellLayer.setAttribute('data-export-layer', 'heatmap-cells');
    cellLayer.setAttribute('data-layer', 'cells');
    cellLayer.setAttribute('data-heatmap-row-count', String(rowCount));
    cellLayer.setAttribute('data-heatmap-column-count', String(columnCount));
    const effectiveCellSize = Math.max(1, Math.min(cellWidth, cellHeight));
    const baseGraphFontSize = Number.isFinite(graphFontSize) ? graphFontSize : scaledFontSize;
    const cellValueMetrics = resolveHeatmapCellValueMetrics({
      orderedCells,
      rowCount,
      columnCount,
      maskLower,
      showCellText,
      effectiveCellSize,
      baseGraphFontSize
    });
    const {
      fontSize: cellValueFontSize,
      maxTextWidth: cellValueMaxTextWidth,
      padding: cellValuePadding,
      innerSize: cellInnerSize,
      heightFactor: cellValueHeightFactor,
      sampleCount: cellValueSampleCount
    } = cellValueMetrics;
    debugLog('Debug: heatmap cell value font resolved', {
      showValues: !!showValues,
      showCellText: !!showCellText,
      cellSize,
      cellInnerSize,
      cellValuePadding,
      samples: cellValueSampleCount,
      fontSize: cellValueFontSize,
      maxTextWidth: cellValueMaxTextWidth
    });
    const canvasCellLayerRendered = useCanvasCellRender && appendHeatmapCanvasCellLayer(cellLayer, orderedCells, {
      doc,
      rowCount,
      columnCount,
      cellSize: effectiveCellSize,
      cellWidth,
      cellHeight,
      dataStartX,
      dataStartY,
      heatmapWidth,
      heatmapHeight,
      totalWidth,
      totalHeight,
      drawableFrame,
      showCellText,
      cellValueFontSize
    });
    if(!canvasCellLayerRendered){
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
          if(maskLower && columnIndex < rowIndex){
            continue;
          }
          const cell = orderedCells[rowIndex]?.[columnIndex] || {};
          const x = dataStartX + columnIndex * cellWidth;
          const y = dataStartY + rowIndex * cellHeight;
          const rect = doc.createElementNS(NS, 'rect');
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(cellWidth));
          rect.setAttribute('height', String(cellHeight));
          rect.setAttribute('stroke', '#fff');
          rect.setAttribute('stroke-width', '1');
          rect.setAttribute('fill', cell.fill || '#d0d0d0');
          if(cell.title){
            const title = doc.createElementNS(NS, 'title');
            title.textContent = cell.title;
            rect.appendChild(title);
          }
          cellLayer.appendChild(rect);
          const cellText = String(cell.displayText || '').trim();
          if(showCellText && cellText){
            const text = doc.createElementNS(NS, 'text');
            text.setAttribute('x', String(x + cellWidth / 2));
            text.setAttribute('y', String(y + cellHeight / 2));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', String(cellValueFontSize));
            text.setAttribute('fill', textColorForBackground(cell.fill || '#d0d0d0'));
            text.textContent = cellText;
            text.setAttribute('data-heatmap-cell-value', '1');
            if(text.dataset){
              text.dataset.heatmapCellValue = '1';
            }
            markFontEditable(text, 'cellValue', `cell-${rowIndex}-${columnIndex}`, ownerTabId);
            cellLayer.appendChild(text);
          }
        }
      }
      cellLayer.setAttribute('data-render-mode', 'svg');
    }
    if(state.svg?.dataset){
      state.svg.dataset.heatmapCellRenderMode = canvasCellLayerRendered ? 'canvas' : 'svg';
      if(canvasCellLayerRendered){
        const revision = (Number(state.svg.dataset.heatmapCanvasRevision) || 0) + 1;
        state.svg.dataset.heatmapCanvasRevision = String(revision);
      }
    }
    g.appendChild(cellLayer);
    markRenderStage('cellsMs');
    const scaleStartX = dataStartX + heatmapWidth + (rowDendroWidth ? rowDendroWidth + dendroPadding : 0) + scalePadding;
    const resolvedLegendHeightMode = normalizeHeatmapLegendHeightMode(legendHeightMode);
    const scaleHeight = resolvedLegendHeightMode === 'fixed'
      ? Math.min(
          heatmapHeight,
          HEATMAP_FIXED_LEGEND_HEIGHT_MAX,
          Math.max(
            HEATMAP_FIXED_LEGEND_HEIGHT_MIN,
            heatmapHeight * HEATMAP_FIXED_LEGEND_HEIGHT_RATIO
          )
        )
      : heatmapHeight;
    const scaleStartY = dataStartY;
    // Dendrogram paths use non-scaling strokes, so the requested thickness is already
    // expressed in stable screen units regardless of matrix dimensions.
    const scaleX = drawableFrame.width && totalWidth ? drawableFrame.width / totalWidth : 1;
    const scaleY = drawableFrame.height && totalHeight ? drawableFrame.height / totalHeight : 1;
    const minScale = Math.min(scaleX, scaleY);
    // Compute auto-scaled dendrogram thickness based on cell size (original behavior)
    const autoScaledThickness = Math.max(1, Math.min(3, Math.round(effectiveCellSize * 0.025 * 10) / 10));
    // Use user-defined thickness from state if set, otherwise use auto-scaled value
    const dendroSettings = getHeatmapDendrogramSettings(ownerSession);
    const userThickness = dendroSettings.thickness;
    // If user thickness is at default (1), use auto-scaling; otherwise use user value
    const dendrogramStrokeBase = (userThickness === DEFAULT_DENDROGRAM_THICKNESS) ? autoScaledThickness : userThickness;
    const dendrogramStroke = dendrogramStrokeBase;
    const scaleStroke = 1;
    const scaleGroup = doc.createElementNS(NS, 'g');
    scaleGroup.setAttribute('class', 'heatmap-color-scale');
    scaleGroup.setAttribute('data-layer', 'color-scale');
    scaleGroup.setAttribute('data-heatmap-vector-overlay', '1');
    const scaleRect = doc.createElementNS(NS, 'rect');
    scaleRect.setAttribute('x', String(scaleStartX));
    scaleRect.setAttribute('y', String(scaleStartY));
    scaleRect.setAttribute('width', String(scaleWidth));
    scaleRect.setAttribute('height', String(scaleHeight));
    scaleRect.setAttribute('fill', `url(#${gradientId})`);
    scaleRect.setAttribute('stroke', '#333');
    scaleRect.setAttribute('stroke-width', String(scaleStroke));
    scaleRect.setAttribute('vector-effect', 'non-scaling-stroke');
    scaleRect.setAttribute('data-heatmap-color-scale-bar', '1');
    scaleGroup.appendChild(scaleRect);
    const tickStartX = scaleStartX + scaleWidth;
    const tickLabelX = tickStartX + Math.max(8, Math.round(scaleLabelGap * 0.4));
    const tickLengthScale = Number.isFinite(minScale) && minScale > 0 ? minScale : 1;
    const tickLength = Math.max(3, Math.round(scaleWidth * 0.35 * tickLengthScale));
    const ticks = colorScale?.ticks || [];
    const tickFont = Math.max(8, Math.round(scaledFontSize * 0.9));
    let previousTickY = null;
    let minTickGap = Infinity;
    ticks.forEach(tick => {
      const ratio = colorScale?.valueToRatio ? Math.min(1, Math.max(0, colorScale.valueToRatio(tick.value))) : 0;
      const y = scaleStartY + (1 - ratio) * scaleHeight;
      if(Number.isFinite(previousTickY)){
        minTickGap = Math.min(minTickGap, Math.abs(y - previousTickY));
      }
      previousTickY = y;
      const line = doc.createElementNS(NS, 'line');
      line.setAttribute('x1', String(tickStartX));
      line.setAttribute('x2', String(tickStartX + tickLength));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#333');
      line.setAttribute('stroke-width', String(scaleStroke));
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      scaleGroup.appendChild(line);
      const tickLabel = doc.createElementNS(NS, 'text');
      tickLabel.setAttribute('x', String(tickLabelX));
      tickLabel.setAttribute('y', String(y));
      tickLabel.setAttribute('dominant-baseline', 'middle');
      tickLabel.setAttribute('font-size', String(tickFont));
      tickLabel.textContent = tick.label !== undefined ? String(tick.label) : (colorScale?.tickFormatter ? colorScale.tickFormatter(tick.value) : String(tick.value));
      markFontEditable(tickLabel, 'scaleTick', `scale-tick-${tick.value}`, ownerTabId);
      if(tickLabel.dataset){
        tickLabel.dataset.fontEditable = '0';
        tickLabel.dataset.heatmapPaletteTrigger = 'legend';
      }
      scaleGroup.appendChild(tickLabel);
    });
    if(scaleGroup.querySelectorAll){
      scaleGroup.querySelectorAll('*').forEach(node => {
        if(node?.dataset){
          node.dataset.heatmapPaletteTrigger = 'legend';
        }
      });
    }
    g.appendChild(scaleGroup);
    state.textAspectMetrics = {
      rowCount,
      columnCount,
      cellSize: effectiveCellSize,
      cellWidth,
      cellHeight,
      maxRowLabelFontSize,
      maxColumnLabelFontSize,
      maxRowLabelWidth,
      maxColumnLabelWidth,
      labelColumnWidth,
      labelRowHeight,
      labelPaddingX,
      labelPaddingY,
      labelDescenderPadY,
      scaleTickCount: ticks.length,
      scaleTickGap: Number.isFinite(minTickGap) ? minTickGap : NaN,
      scaleTickFontSize: tickFont,
      showValues: !!showCellText,
      cellValueFontSize,
      cellValueMaxTextWidth,
      cellValuePadding,
      cellValueHeightFactor,
      normalizedHeavyScene: usesNormalizedHeavyScene
    };
    updateHeatmapRenderRuntime(ownerSession, runtime => {
      runtime.textAspectMetrics = cloneSimple(state.textAspectMetrics) || null;
    }, { seedFromActive: true });
    if(showRowDendrogram && rowClustering?.tree){
      renderDendrogram({
        doc,
        parent: g,
        tree: rowClustering.tree,
        order: rowOrder,
        startX: dataStartX + heatmapWidth + dendroHeatmapGap,
        startY: dataStartY,
        length: rowDendroWidth,
        cellSize: effectiveCellSize,
        cellStep: cellHeight,
        maxDistance: rowClustering.maxDistance,
        orientation: 'vertical',
        strokeWidth: dendrogramStroke
      });
    }
    if(showColumnDendrogram && columnClustering?.tree){
      renderDendrogram({
        doc,
        parent: g,
        tree: columnClustering.tree,
        order: columnOrder,
        startX: dataStartX,
        startY: dataStartY + heatmapHeight + dendroHeatmapGap,
        length: columnDendroHeight,
        cellSize: effectiveCellSize,
        cellStep: cellWidth,
        maxDistance: columnClustering.maxDistance,
        orientation: 'horizontal',
        strokeWidth: dendrogramStroke
      });
    }
    markRenderStage('legendAndDendrogramMs');
    if(usesNormalizedHeavyScene){
      state.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
      state.svg.setAttribute('preserveAspectRatio', preserveAspect);
      const normalizedRect = state.svg?.getBoundingClientRect?.() || svgRect;
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: totalWidth,
        viewBoxHeight: totalHeight,
        displayWidth: normalizedRect?.width,
        displayHeight: normalizedRect?.height,
        debugLabel: 'heatmap-text-correction-normalized-heavy',
        aspectLocked: false,
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
    }else if(!rendererAspectLocked){
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: totalWidth,
        viewBoxHeight: totalHeight,
        displayWidth: svgRect?.width,
        displayHeight: svgRect?.height,
        debugLabel: 'heatmap-text-correction-pre',
        aspectLocked: false,
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
      ensureGraphViewport(state.svg, {
        padding: Math.max(fontSize, 16),
        minWidth: totalWidth,
        minHeight: totalHeight,
        preserveAspectRatio: preserveAspect,
        debugLabel: 'heatmap-graph-corrected',
        remeasure: false,
        ...viewportOptions
      });
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: state.svg.viewBox?.baseVal?.width ?? totalWidth,
        viewBoxHeight: state.svg.viewBox?.baseVal?.height ?? totalHeight,
        displayWidth: svgRect?.width,
        displayHeight: svgRect?.height,
        debugLabel: 'heatmap-text-correction',
        aspectLocked: false,
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
    }else{
      ensureGraphViewport(state.svg, {
        padding: Math.max(fontSize, 16),
        minWidth: totalWidth,
        minHeight: totalHeight,
        preserveAspectRatio: preserveAspect,
        debugLabel: 'heatmap-graph',
        remeasure: false,
        ...viewportOptions
      });
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: state.svg.viewBox?.baseVal?.width ?? totalWidth,
        viewBoxHeight: state.svg.viewBox?.baseVal?.height ?? totalHeight,
        displayWidth: svgRect?.width,
        displayHeight: svgRect?.height,
        debugLabel: 'heatmap-text-correction-locked',
        aspectLocked: true,
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
    }
    markRenderStage('initialViewportMs');
    const reflowCount = Number.isFinite(layoutAdjust?.reflowed) ? Number(layoutAdjust.reflowed) : 0;
    const maxReflowPasses = HEATMAP_MAX_LAYOUT_REFLOW_PASSES;
    if(!usesNormalizedHeavyScene && reflowCount < maxReflowPasses){
      const getLabelBounds = (group) => {
        if(!group){ return null; }
        const previousClip = group.getAttribute('clip-path');
        if(previousClip){
          group.removeAttribute('clip-path');
        }
        const bounds = measureHeatmapNodeBounds(group.querySelectorAll('text'));
        if(previousClip){
          group.setAttribute('clip-path', previousClip);
        }
        return bounds;
      };
      const rowLabelBounds = getLabelBounds(rowLabelGroup);
      const columnLabelBounds = getLabelBounds(columnLabelGroup);
      const columnLabelScreenBounds = measureHeatmapNodeBounds(columnLabelGroup.querySelectorAll('text'), { screen: true });
      const titleScreenBounds = title && typeof title.getBoundingClientRect === 'function'
        ? (() => {
          try{
            return title.getBoundingClientRect();
          }catch(err){
            return null;
          }
        })()
        : null;
      const safety = Math.max(2, Math.round(baseLabelFontSize * 0.2));
      let needsReflow = false;
      let nextExtraColumn = extraLabelColumnWidth;
      let nextExtraRow = extraLabelRowHeight;
      if(rowLabelBounds && Number.isFinite(rowLabelBounds.minX) && rowLabelBounds.minX < matrixLeft - 0.5){
        const overflow = matrixLeft - rowLabelBounds.minX;
        nextExtraColumn += overflow + safety;
        needsReflow = true;
      }
      if(rowLabelBounds && Number.isFinite(rowLabelBounds.minX) && rowLabelBounds.minX < 0.5){
        const overflow = 0.5 - rowLabelBounds.minX;
        nextExtraColumn += overflow + safety;
        needsReflow = true;
      }
      if(columnLabelBounds && Number.isFinite(columnLabelBounds.minY) && columnLabelBounds.minY < matrixTop - 0.5){
        const overflow = matrixTop - columnLabelBounds.minY;
        nextExtraRow += overflow + safety;
        needsReflow = true;
      }
      const titleClearancePx = Math.max(4, Math.round(baseLabelFontSize * 0.3));
      if(
        titleScreenBounds
        && columnLabelScreenBounds
        && Number.isFinite(titleScreenBounds.bottom)
        && Number.isFinite(columnLabelScreenBounds.minY)
        && (titleScreenBounds.bottom + titleClearancePx) > columnLabelScreenBounds.minY
      ){
        const overlapPx = (titleScreenBounds.bottom + titleClearancePx) - columnLabelScreenBounds.minY;
        const rectNow = state.svg?.getBoundingClientRect ? state.svg.getBoundingClientRect() : svgRect;
        const viewScaleNow = typeof chartStyle.computeViewBoxScale === 'function'
          ? chartStyle.computeViewBoxScale({
            svg: state.svg,
            svgBox,
            viewBoxWidth: state.svg?.viewBox?.baseVal?.width ?? totalWidth,
            viewBoxHeight: state.svg?.viewBox?.baseVal?.height ?? totalHeight,
            displayWidth: rectNow?.width,
            displayHeight: rectNow?.height,
            debugLabel: 'heatmap-title-clearance-reflow'
          })
          : null;
        const rawScaleXNow = Number(viewScaleNow?.scaleX);
        const rawScaleYNow = Number(viewScaleNow?.scaleY);
        const effectiveScaleY = rendererAspectLocked
          ? Math.min(
            Number.isFinite(rawScaleXNow) && rawScaleXNow > 0 ? rawScaleXNow : 1,
            Number.isFinite(rawScaleYNow) && rawScaleYNow > 0 ? rawScaleYNow : 1
          )
          : (Number.isFinite(rawScaleYNow) && rawScaleYNow > 0 ? rawScaleYNow : 1);
        const overlapViewUnits = overlapPx / Math.max(1e-6, effectiveScaleY);
        const currentTitleY = Number(title.getAttribute('y'));
        if(Number.isFinite(currentTitleY)){
          const minTitleY = Math.max(
            Math.ceil(titleFontSize + 2),
            Math.round(outerPadding * 0.35)
          );
          const nextTitleY = Math.max(minTitleY, currentTitleY - overlapViewUnits - safety);
          const shiftedTitle = currentTitleY - nextTitleY;
          if(nextTitleY < currentTitleY){
            title.setAttribute('y', String(nextTitleY));
            debugLog('Debug: heatmap title clearance adjusted', {
              overlapPx,
              overlapViewUnits,
              currentTitleY,
              nextTitleY,
              minTitleY
            });
          }
          const remainingOverlap = Math.max(0, overlapViewUnits + safety - shiftedTitle);
          if(remainingOverlap > 0.01){
            nextExtraRow += remainingOverlap;
            needsReflow = true;
          }
        }else{
          nextExtraRow += overlapViewUnits + safety;
          needsReflow = true;
        }
      }
      if(columnLabelBounds && Number.isFinite(columnLabelBounds.minY) && columnLabelBounds.minY < 0.5){
        const overflow = 0.5 - columnLabelBounds.minY;
        nextExtraRow += overflow + safety;
        needsReflow = true;
      }
      if(needsReflow){
        debugLog('Debug: heatmap label bounds reflow', {
          reflowCount,
          rowLabelBounds,
          columnLabelBounds,
          titleScreenBounds,
          columnLabelScreenBounds,
          nextExtraColumn,
          nextExtraRow
        });
        drawHeatmap({
          orderedRowLabels,
          orderedColumnLabels,
          orderedCells,
          rowOrder,
          columnOrder,
          rowClustering,
          columnClustering,
          showRowDendrogram,
          showColumnDendrogram,
          maskLower,
          cellSize,
          fontSize,
          showValues,
          decimals,
          colorScale,
          legendHeightMode,
          modelType,
          drawSession: ownerSession,
          layoutAdjust: {
            extraLabelColumnWidth: nextExtraColumn,
            extraLabelRowHeight: nextExtraRow,
            reflowed: reflowCount + 1
          }
        });
        return;
      }
    }
    const isSymmetricCorrelationMatrix = rowCount === columnCount
      && orderedRowLabels.every((label, index) => label === orderedColumnLabels[index]);
    const skipFinalViewportExpansion = usesNormalizedHeavyScene
      || (rendererAspectLocked && isSymmetricCorrelationMatrix);
    const finalSvgRect = state.svg?.getBoundingClientRect?.();
    if(!skipFinalViewportExpansion){
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: state.svg?.viewBox?.baseVal?.width ?? totalWidth,
        viewBoxHeight: state.svg?.viewBox?.baseVal?.height ?? totalHeight,
        displayWidth: finalSvgRect?.width,
        displayHeight: finalSvgRect?.height,
        debugLabel: 'heatmap-text-correction-final',
        aspectLocked: rendererAspectLocked,
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
      ensureGraphViewport(state.svg, {
        padding: Math.max(fontSize, 16),
        minWidth: totalWidth,
        minHeight: totalHeight,
        preserveAspectRatio: preserveAspect,
        debugLabel: 'heatmap-graph-final',
        remeasure: false,
        ...viewportOptions
      });
    }
    const ensureTitleColumnLabelClearance = () => {
      if(!title || !columnLabelGroup || typeof title.getBoundingClientRect !== 'function'){
        return false;
      }
      const columnLabelNodes = columnLabelGroup.querySelectorAll ? columnLabelGroup.querySelectorAll('text') : null;
      if(!columnLabelNodes || !columnLabelNodes.length){
        return false;
      }
      const minGapPx = Math.max(6, Math.round(Math.max(baseLabelFontSize, titleFontSize) * 0.35));
      let adjusted = false;
      for(let pass = 0; pass < 2; pass += 1){
        const titleBounds = (() => {
          try{
            return title.getBoundingClientRect();
          }catch(err){
            return null;
          }
        })();
        const columnBounds = measureHeatmapNodeBounds(columnLabelNodes, { screen: true });
        if(!titleBounds || !columnBounds){
          break;
        }
        if(!Number.isFinite(titleBounds.bottom) || !Number.isFinite(columnBounds.minY)){
          break;
        }
        const overlapPx = (titleBounds.bottom + minGapPx) - columnBounds.minY;
        if(!(overlapPx > 0.5)){
          break;
        }
        const rectNow = state.svg?.getBoundingClientRect ? state.svg.getBoundingClientRect() : finalSvgRect;
        const viewScaleNow = typeof chartStyle.computeViewBoxScale === 'function'
          ? chartStyle.computeViewBoxScale({
            svg: state.svg,
            svgBox,
            viewBoxWidth: state.svg?.viewBox?.baseVal?.width ?? totalWidth,
            viewBoxHeight: state.svg?.viewBox?.baseVal?.height ?? totalHeight,
            displayWidth: rectNow?.width,
            displayHeight: rectNow?.height,
            debugLabel: `heatmap-title-clearance-final-${pass}`
          })
          : null;
        const rawScaleXNow = Number(viewScaleNow?.scaleX);
        const rawScaleYNow = Number(viewScaleNow?.scaleY);
        const effectiveScaleY = rendererAspectLocked
          ? Math.min(
            Number.isFinite(rawScaleXNow) && rawScaleXNow > 0 ? rawScaleXNow : 1,
            Number.isFinite(rawScaleYNow) && rawScaleYNow > 0 ? rawScaleYNow : 1
          )
          : (Number.isFinite(rawScaleYNow) && rawScaleYNow > 0 ? rawScaleYNow : 1);
        let remainingShiftView = overlapPx / Math.max(1e-6, effectiveScaleY);
        const currentTitleY = Number(title.getAttribute('y'));
        if(Number.isFinite(currentTitleY)){
          const minTitleY = Math.max(
            Math.ceil(titleFontSize + 2),
            Math.round(outerPadding * 0.35)
          );
          const nextTitleY = Math.max(minTitleY, currentTitleY - remainingShiftView);
          const shiftedTitle = currentTitleY - nextTitleY;
          if(shiftedTitle > 0.01){
            title.setAttribute('y', String(nextTitleY));
            remainingShiftView = Math.max(0, remainingShiftView - shiftedTitle);
            adjusted = true;
          }
        }
        if(remainingShiftView > 0.01){
          const currentShift = Number(g.dataset?.heatmapTitleClearanceShift || 0);
          const nextShift = currentShift + remainingShiftView;
          g.setAttribute('transform', `translate(0 ${nextShift})`);
          if(g.dataset){
            g.dataset.heatmapTitleClearanceShift = String(nextShift);
          }
          adjusted = true;
        }
        if(!adjusted){
          break;
        }
        const correctedRect = state.svg?.getBoundingClientRect?.();
        applyTextAspectCorrection({
          svg: state.svg,
          svgBox,
          viewBoxWidth: state.svg?.viewBox?.baseVal?.width ?? totalWidth,
          viewBoxHeight: state.svg?.viewBox?.baseVal?.height ?? totalHeight,
          displayWidth: correctedRect?.width,
          displayHeight: correctedRect?.height,
          debugLabel: `heatmap-text-correction-clearance-${pass}`,
          aspectLocked: rendererAspectLocked,
          textScaleMode: HEATMAP_TEXT_SCALE_MODE
        });
        ensureGraphViewport(state.svg, {
          padding: Math.max(fontSize, 16),
          minWidth: totalWidth,
          minHeight: totalHeight,
          preserveAspectRatio: preserveAspect,
          debugLabel: `heatmap-graph-clearance-${pass}`,
          remeasure: false,
          ...viewportOptions
        });
      }
      if(adjusted){
        debugLog('Debug: heatmap title/column clearance enforced', {
          minGapPx,
          titleY: Number(title.getAttribute('y')),
          bodyShift: Number(g.dataset?.heatmapTitleClearanceShift || 0)
        });
      }
      return adjusted;
    };
    if(!usesNormalizedHeavyScene){
      ensureTitleColumnLabelClearance();
    }else{
      // The normalized heavy scene owns its complete display geometry. Keep its
      // exact viewBox stable; bbox-driven expansion would reintroduce the huge
      // logical-coordinate distortion that canvas rendering is intended to remove.
      state.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
      state.svg.setAttribute('preserveAspectRatio', preserveAspect);
      if(g.dataset){
        delete g.dataset.heatmapTitleClearanceShift;
      }
      g.removeAttribute('transform');
    }
    if(modelType === 'values' && resizerAspectLocked){
      enforceHeatmapLockedProjection(svgBox);
    }
    state.layout?.syncPanels?.({ skipSchedule: true });
    if(modelType === 'values' && resizerAspectLocked){
      svgBox?.__sharedResizableBoxApi?.calibrateLockedGeometryConstraint?.();
    }
    markHeatmapRenderCompleted(state.svg, {
      rows: rowCount,
      columns: columnCount
    });
    renderCompleted = true;
    debugLog('Debug: heatmap drawHeatmap complete', {
      rows: rowCount,
      columns: columnCount,
      showRowDendrogram,
      showColumnDendrogram,
      skipFinalViewportExpansion
    });
    markRenderStage('finalLayoutMs');
    recordHeatmapPerformance('renderStages', {
      ...renderStages,
      totalMs: Number((nowMs() - renderStartedAt).toFixed(1)),
      rows: rowCount,
      columns: columnCount
    });
    } finally {
      if(!renderCompleted && state.svg === renderTargetSvg){
        markHeatmapRenderIncomplete(renderTargetSvg);
      }
      state.isRendering = false;
    }
  }

  function settleHeatmapRenderCommit(renderResult, onApplied){
    const apply = applied => (applied ? onApplied() : false);
    return renderResult && typeof renderResult.then === 'function'
      ? renderResult.then(apply)
      : apply(renderResult);
  }

  function renderCorrelationHeatmap(processed, settings, drawToken, asyncState = null){
    const renderSession = getHeatmapSession(asyncState?.meta?.tabId || getHeatmapProjectionTabId() || null, asyncState?.meta || {}, { create: false }) || getActiveHeatmapSessionForState();
    state.lastResolvedValueScale = null;
    updateHeatmapRenderRuntime(renderSession, runtime => {
      runtime.lastResolvedValueScale = null;
    }, { seedFromActive: true });
    syncHeatmapPaletteInputs(resolveHeatmapRoot());
    const viewContext = resolveHeatmapViewContext();
    const axis = settings.view === 'corr-columns' ? 'columns' : 'rows';
    const labels = axis === 'columns' ? processed.columnLabels : processed.rowLabels;
    const items = buildAxisItems(processed.matrix, labels, axis);
    if(items.length < 2){
      syncHeatmapCorrelationMatrixDataView(null, settings, {
        context: viewContext,
        reason: 'heatmap-correlation-view-clear-insufficient'
      });
      renderEmpty(Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, renderSession);
      updateStats(null);
      return;
    }
    const matrix = Array.from({ length: items.length }, () => Array(items.length).fill(null));
    let pairCount = 0;
    let strongest = null;
    let mostNegative = null;
    for(let i = 0; i < items.length; i += 1){
      const selfCount = items[i].vector.filter(value => Number.isFinite(value)).length;
      matrix[i][i] = { raw: 1, count: selfCount, pValue: NaN };
      for(let j = i + 1; j < items.length; j += 1){
        const entry = calculateCorrelationEntry(items[i].vector, items[j].vector, settings.correlationMethod);
        const raw = Number.isFinite(entry.corr) ? entry.corr : NaN;
        matrix[i][j] = { raw, count: entry.count, pValue: entry.pValue };
        matrix[j][i] = { raw, count: entry.count, pValue: entry.pValue };
        if(Number.isFinite(raw)){
          pairCount += 1;
          const absValue = Math.abs(raw);
          if(!strongest || absValue > strongest.abs){
            strongest = {
              labels: [items[i].label, items[j].label],
              raw,
              abs: absValue,
              value: absValue,
              count: entry.count
            };
          }
          if(!mostNegative || raw < mostNegative.value){
            mostNegative = {
              labels: [items[i].label, items[j].label],
              value: raw,
              count: entry.count
            };
          }
        }
      }
    }
    const clusterConfig = axis === 'columns' ? settings.clustering.columns : settings.clustering.rows;
    const positionByIndex = new Map(items.map((item, idx) => [item.index, idx]));
    const clusterState = clusterConfig.enabled && items.length > 1
      ? resolveCluster(items, clusterConfig.metric, settings.clustering.linkage, drawToken, 'correlation', asyncState)
      : { result: null, promise: null };

    const renderWithCluster = (clusterResult) => {
      const resolvedCluster = clusterResult || null;
      const orderPositions = resolvedCluster
        ? resolvedCluster.order.map(idx => positionByIndex.get(idx)).filter(idx => idx !== undefined)
        : items.map((_, idx) => idx);
      const orderedRowLabels = orderPositions.map(pos => items[pos].label);
      const orderedEntries = orderPositions.map(rowPos => orderPositions.map(colPos => {
        const entry = matrix[rowPos][colPos];
        if(!entry){
          return { raw: NaN, count: 0, pValue: NaN };
        }
        return { raw: entry.raw, count: entry.count, pValue: entry.pValue };
      }));
      const showRowDendrogram = !!(resolvedCluster && clusterConfig.showDendrogram);
      const showColumnDendrogram = showRowDendrogram;
      const model = {
        type: 'correlation',
        orderedRowLabels,
        orderedColumnLabels: orderedRowLabels,
        cells: orderedEntries,
        rowOrder: orderPositions.map(pos => items[pos].index),
        columnOrder: orderPositions.map(pos => items[pos].index),
        rowClustering: resolvedCluster,
        columnClustering: resolvedCluster,
        showRowDendrogram,
        showColumnDendrogram
      };
      const viewOptions = extractViewOptions(settings);
      const renderResult = renderModelWithView(model, viewOptions, renderSession, asyncState || {});
      return settleHeatmapRenderCommit(renderResult, () => {
        if(!isHeatmapDrawCurrent(drawToken, asyncState)){
          return false;
        }
        syncHeatmapCorrelationMatrixDataView(model, settings, {
          context: viewContext,
          reason: 'heatmap-correlation-view-sync'
        });
        updateStats({
          type: 'correlation',
          itemCount: items.length,
          pairCount,
          method: settings.correlationMethod,
          useAbs: settings.useAbsolute,
          decimals: settings.decimals,
          strongest,
          mostNegative: settings.useAbsolute ? null : mostNegative,
          rowClusterLabel: resolvedCluster && clusterConfig.enabled
            ? `${clusterConfig.metric} (${settings.clustering.linkage})`
            : null,
          columnClusterLabel: resolvedCluster && clusterConfig.enabled
            ? `${clusterConfig.metric} (${settings.clustering.linkage})`
            : null,
          rowDendrogram: showRowDendrogram,
          columnDendrogram: showColumnDendrogram
        });
        return true;
      });
    };

    if(clusterState.promise){
      return clusterState.promise.then((clusterResult) => {
        if(!clusterResult || !isHeatmapDrawCurrent(drawToken, asyncState)){
          return;
        }
        return renderWithCluster(clusterResult);
      });
    }

    return renderWithCluster(clusterState.result);
  }

  function renderValuesHeatmap(processed, settings, drawToken, asyncState = null){
    const renderSession = getHeatmapSession(asyncState?.meta?.tabId || getHeatmapProjectionTabId() || null, asyncState?.meta || {}, { create: false }) || getActiveHeatmapSessionForState();
    syncHeatmapCorrelationMatrixDataView(null, settings, {
      context: resolveHeatmapViewContext(),
      reason: 'heatmap-correlation-view-clear-values'
    });
    const rowItems = buildAxisItems(processed.matrix, processed.rowLabels, 'rows');
    const columnItems = buildAxisItems(processed.matrix, processed.columnLabels, 'columns');
    const rowPositionByIndex = new Map(rowItems.map((item, idx) => [item.index, idx]));
    const columnPositionByIndex = new Map(columnItems.map((item, idx) => [item.index, idx]));
    const rowClusterState = settings.clustering.rows.enabled && rowItems.length > 1
      ? resolveCluster(rowItems, settings.clustering.rows.metric, settings.clustering.linkage, drawToken, 'rows', asyncState)
      : { result: null, promise: null };
    const columnClusterState = settings.clustering.columns.enabled && columnItems.length > 1
      ? resolveCluster(columnItems, settings.clustering.columns.metric, settings.clustering.linkage, drawToken, 'columns', asyncState)
      : { result: null, promise: null };

    const renderWithClusters = (rowCluster, columnCluster) => {
      const resolvedRow = rowCluster || null;
      const resolvedColumn = columnCluster || null;
      const rowOrderPositions = resolvedRow
        ? resolvedRow.order.map(idx => rowPositionByIndex.get(idx)).filter(idx => idx !== undefined)
        : rowItems.map((_, idx) => idx);
      const columnOrderPositions = resolvedColumn
        ? resolvedColumn.order.map(idx => columnPositionByIndex.get(idx)).filter(idx => idx !== undefined)
        : columnItems.map((_, idx) => idx);
      const orderedRowLabels = rowOrderPositions.map(pos => processed.rowLabels[pos]);
      const orderedColumnLabels = columnOrderPositions.map(pos => processed.columnLabels[pos]);
      const orderedMatrix = rowOrderPositions.map(rowPos => columnOrderPositions.map(colPos => processed.matrix[rowPos][colPos]));
      const orderedCells = orderedMatrix.map(row => row.map(value => ({ value })));
      const min = processed.stats.min;
      const max = processed.stats.max;
      const resolvedValueScale = resolveHeatmapValueScaleStats(processed.stats, settings.valueScale);
      state.lastResolvedValueScale = resolvedValueScale;
      updateHeatmapRenderRuntime(renderSession, runtime => {
        runtime.lastResolvedValueScale = cloneSimple(resolvedValueScale) || null;
      }, { seedFromActive: true });
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
      const showRowDendrogram = !!(resolvedRow && settings.clustering.rows.showDendrogram);
      const showColumnDendrogram = !!(resolvedColumn && settings.clustering.columns.showDendrogram);
      const model = {
        type: 'values',
        orderedRowLabels,
        orderedColumnLabels,
        cells: orderedCells,
        rowOrder: rowOrderPositions.map(pos => rowItems[pos].index),
        columnOrder: columnOrderPositions.map(pos => columnItems[pos].index),
        rowClustering: resolvedRow,
        columnClustering: resolvedColumn,
        showRowDendrogram,
        showColumnDendrogram,
        valueStats: { min, max, stats: processed.stats, scale: resolvedValueScale },
        adjustmentSummary: processed.adjustmentSummary
      };
      const viewOptions = extractViewOptions(settings);
      const renderResult = renderModelWithView(model, viewOptions, renderSession, asyncState || {});
      return settleHeatmapRenderCommit(renderResult, () => {
        if(!isHeatmapDrawCurrent(drawToken, asyncState)){
          return false;
        }
        updateStats({
          type: 'values',
          rowCount: orderedRowLabels.length,
          columnCount: orderedColumnLabels.length,
          min,
          max,
          mean: processed.stats.mean,
          decimals: settings.decimals,
          finiteCount: processed.stats.finiteCount,
          scaleMin: resolvedValueScale.min,
          scaleMax: resolvedValueScale.max,
          scaleCustomized: resolvedValueScale.customized,
          rowsFiltered: processed.stats.rowsFiltered,
          columnsRemoved: processed.stats.columnsRemoved,
          logApplied: processed.stats.logApplied,
          rowClusterLabel: resolvedRow && settings.clustering.rows.enabled
            ? `${settings.clustering.rows.metric} (${settings.clustering.linkage})`
            : null,
          columnClusterLabel: resolvedColumn && settings.clustering.columns.enabled
            ? `${settings.clustering.columns.metric} (${settings.clustering.linkage})`
            : null,
          rowDendrogram: showRowDendrogram,
          columnDendrogram: showColumnDendrogram,
          adjustments: processed.adjustmentSummary
        });
        return true;
      });
    };

    if(rowClusterState.promise || columnClusterState.promise){
      const rowPromise = rowClusterState.promise || Promise.resolve(rowClusterState.result);
      const columnPromise = columnClusterState.promise || Promise.resolve(columnClusterState.result);
      return Promise.all([rowPromise, columnPromise]).then(([rowCluster, columnCluster]) => {
        if(!isHeatmapDrawCurrent(drawToken, asyncState)){
          debugLog('Debug: heatmap cluster worker results ignored', { reason: 'stale-draw' });
          return;
        }
        return renderWithClusters(rowCluster, columnCluster);
      });
    }

    return renderWithClusters(rowClusterState.result, columnClusterState.result);
  }

  function createCorrelationColorScale(viewOptions){
    if(!viewOptions){
      return null;
    }
    if(viewOptions.useAbsolute){
      return {
        stops: [
          { offset: 0, color: rgbToCss(hexToRgb(viewOptions.palette?.zero || DEFAULT_HEATMAP_PALETTE.zero)) },
          { offset: 100, color: rgbToCss(hexToRgb(viewOptions.palette?.positive || DEFAULT_HEATMAP_PALETTE.positive)) }
        ],
        ticks: [0, 0.25, 0.5, 0.75, 1].map(value => ({ value, label: chartStyle.formatScientific(value, { maxDecimals: viewOptions.decimals ?? 2 }) })),
        valueToRatio: value => Math.min(1, Math.max(0, value))
      };
    }
    return {
      stops: [
        { offset: 0, color: rgbToCss(hexToRgb(viewOptions.palette?.negative || DEFAULT_HEATMAP_PALETTE.negative)) },
        { offset: 50, color: rgbToCss(hexToRgb(viewOptions.palette?.zero || DEFAULT_HEATMAP_PALETTE.zero)) },
        { offset: 100, color: rgbToCss(hexToRgb(viewOptions.palette?.positive || DEFAULT_HEATMAP_PALETTE.positive)) }
      ],
      ticks: [-1, -0.5, 0, 0.5, 1].map(value => ({ value, label: chartStyle.formatScientific(value, { maxDecimals: viewOptions.decimals ?? 2 }) })),
      valueToRatio: value => (Math.min(1, Math.max(-1, value)) + 1) / 2
    };
  }

  function createValueColorScale(stats, palette, decimals){
    if(!stats){
      return null;
    }
    const min = stats.min;
    const max = stats.max;
    let stops;
    if(Number.isFinite(min) && Number.isFinite(max) && min < 0 && max > 0){
      stops = [
        { offset: 0, color: rgbToCss(hexToRgb(palette?.negative || DEFAULT_HEATMAP_PALETTE.negative)) },
        { offset: 50, color: rgbToCss(hexToRgb(palette?.zero || DEFAULT_HEATMAP_PALETTE.zero)) },
        { offset: 100, color: rgbToCss(hexToRgb(palette?.positive || DEFAULT_HEATMAP_PALETTE.positive)) }
      ];
    }else if(Number.isFinite(max) && max <= 0){
      stops = [
        { offset: 0, color: rgbToCss(hexToRgb(palette?.negative || DEFAULT_HEATMAP_PALETTE.negative)) },
        { offset: 100, color: rgbToCss(hexToRgb(palette?.zero || DEFAULT_HEATMAP_PALETTE.zero)) }
      ];
    }else{
      stops = [
        { offset: 0, color: rgbToCss(hexToRgb(palette?.zero || DEFAULT_HEATMAP_PALETTE.zero)) },
        { offset: 100, color: rgbToCss(hexToRgb(palette?.positive || DEFAULT_HEATMAP_PALETTE.positive)) }
      ];
    }
    const tickValues = [];
    if(Number.isFinite(min) && Number.isFinite(max)){
      for(let i = 0; i <= 4; i += 1){
        const ratio = i / 4;
        const value = min + (max - min) * ratio;
        tickValues.push({ value, label: chartStyle.formatScientific(value, { maxDecimals: decimals ?? 2 }) });
      }
    }
    return {
      stops,
      ticks: tickValues,
      valueToRatio: value => {
        if(!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min === max){
          return 0;
        }
        if(min < 0 && max > 0){
          const maxAbs = Math.max(Math.abs(min), Math.abs(max));
          return (Math.min(maxAbs, Math.max(-maxAbs, value)) + maxAbs) / (2 * maxAbs);
        }
        return (value - min) / (max - min);
      }
    };
  }

  function formatHeatmapCorrelationCellText(cell, viewOptions){
    if(!viewOptions){
      return '';
    }
    const value = Number(cell?.value);
    const pValue = Number(cell?.pValue);
    const showValues = !!viewOptions.showValues;
    const showSignificance = !!viewOptions.showSignificance;
    const significanceThreshold = Number(viewOptions.significanceThreshold);
    const significant = showSignificance
      && Number.isFinite(pValue)
      && Number.isFinite(significanceThreshold)
      && pValue <= significanceThreshold;
    if(showValues && Number.isFinite(value)){
      const base = value.toFixed(viewOptions.decimals ?? 2);
      return significant ? `${base}*` : base;
    }
    if(!showSignificance || !significant){
      return '';
    }
    if(viewOptions.significanceDisplay === 'pvalue'){
      return formatHeatmapPValue(pValue);
    }
    return '*';
  }

  function buildDrawPayloadFromModel(model, viewOptions){
    if(!model || !viewOptions){
      return null;
    }
    if(model.type === 'correlation'){
      const palette = {
        negative: hexToRgb(viewOptions.palette?.negative || DEFAULT_HEATMAP_PALETTE.negative),
        zero: hexToRgb(viewOptions.palette?.zero || DEFAULT_HEATMAP_PALETTE.zero),
        positive: hexToRgb(viewOptions.palette?.positive || DEFAULT_HEATMAP_PALETTE.positive)
      };
      const orderedCells = model.cells.map((row, rowIndex) => row.map((cell, columnIndex) => {
        const raw = Number(cell?.raw);
        const count = Number(cell?.count);
        const pValue = Number(cell?.pValue);
        const displayValue = Number.isFinite(raw)
          ? (viewOptions.useAbsolute ? Math.abs(raw) : raw)
          : NaN;
        const fill = Number.isFinite(raw)
          ? colorForValue({ raw, value: displayValue }, palette, viewOptions.useAbsolute)
          : '#d0d0d0';
        const baseLabel = `${model.orderedRowLabels[rowIndex]} vs ${model.orderedColumnLabels[columnIndex]}`;
        const parts = [`${baseLabel}: ${Number.isFinite(displayValue) ? displayValue.toFixed(viewOptions.decimals ?? 2) : 'n/a'}`];
        if(Number.isFinite(count)){
          parts.push(`(n=${count})`);
        }
        if(Number.isFinite(pValue)){
          const thresholdLabel = formatHeatmapThresholdLabel(viewOptions.significanceThreshold);
          parts.push(`(p=${formatHeatmapPValue(pValue)}, ${pValue <= viewOptions.significanceThreshold ? `significant at p<=${thresholdLabel}` : `not significant at p<=${thresholdLabel}`})`);
        }
        return {
          fill,
          value: displayValue,
          pValue,
          displayText: formatHeatmapCorrelationCellText({ value: displayValue, pValue }, viewOptions),
          title: parts.join(' ')
        };
      }));
      return {
        modelType: 'correlation',
        orderedRowLabels: model.orderedRowLabels,
        orderedColumnLabels: model.orderedColumnLabels,
        orderedCells,
        rowOrder: model.rowOrder,
        columnOrder: model.columnOrder,
        rowClustering: model.rowClustering,
        columnClustering: model.columnClustering,
        showRowDendrogram: model.showRowDendrogram,
        showColumnDendrogram: model.showColumnDendrogram,
        maskLower: !!viewOptions.maskLower,
        cellSize: viewOptions.cellSize,
        fontSize: viewOptions.fontSize,
        showValues: viewOptions.showValues,
        decimals: viewOptions.decimals,
        colorScale: createCorrelationColorScale(viewOptions),
        legendHeightMode: viewOptions.legendHeightMode
      };
    }
    if(model.type === 'values'){
      const scaleStats = resolveHeatmapModelValueScale(model, viewOptions) || model.valueStats?.scale || model.valueStats?.stats || {};
      const colorMapper = createValueColorMapper(scaleStats, viewOptions.palette);
      const orderedCells = model.cells.map((row, rowIndex) => row.map((cell, columnIndex) => {
        const value = cell?.value;
        const fill = colorMapper(value);
        const title = `${model.orderedRowLabels[rowIndex]} vs ${model.orderedColumnLabels[columnIndex]}: ${Number.isFinite(value) ? value.toFixed(viewOptions.decimals ?? 2) : 'n/a'}`;
        return {
          fill,
          value,
          displayText: viewOptions.showValues && Number.isFinite(value) ? value.toFixed(viewOptions.decimals ?? 2) : '',
          title
        };
      }));
      return {
        modelType: 'values',
        orderedRowLabels: model.orderedRowLabels,
        orderedColumnLabels: model.orderedColumnLabels,
        orderedCells,
        rowOrder: model.rowOrder,
        columnOrder: model.columnOrder,
        rowClustering: model.rowClustering,
        columnClustering: model.columnClustering,
        showRowDendrogram: model.showRowDendrogram,
        showColumnDendrogram: model.showColumnDendrogram,
        maskLower: false,
        cellSize: viewOptions.cellSize,
        fontSize: viewOptions.fontSize,
        showValues: viewOptions.showValues,
        decimals: viewOptions.decimals,
        colorScale: createValueColorScale(scaleStats, viewOptions.palette, viewOptions.decimals),
        legendHeightMode: viewOptions.legendHeightMode,
        resolvedValueScale: scaleStats
      };
    }
    return null;
  }

  function renderModelWithView(model, viewOptions, session = null, renderContext = {}){
    const renderSession = session || getActiveHeatmapSessionForState();
    const lifecycleMeta = renderContext?.meta && typeof renderContext.meta === 'object'
      ? renderContext.meta
      : (renderContext && typeof renderContext === 'object' ? renderContext : {});
    const execution = renderContext?.execution || null;
    const payload = buildDrawPayloadFromModel(model, viewOptions);
    if(!payload){
      debugLog('Debug: heatmap renderModelWithView skipped - missing payload');
      return false;
    }
    const commit = () => {
      if(execution && !execution.isCurrent?.()){
        return false;
      }
      if(model?.type === 'values'){
        state.lastResolvedValueScale = payload.resolvedValueScale || resolveHeatmapModelValueScale(model, viewOptions);
        syncHeatmapPaletteInputs(resolveHeatmapRoot(renderSession?.tabId || null));
      }else{
        state.lastResolvedValueScale = null;
        updateHeatmapRenderRuntime(renderSession, runtime => {
          runtime.lastResolvedValueScale = null;
        }, { seedFromActive: true });
        syncHeatmapPaletteInputs(resolveHeatmapRoot(renderSession?.tabId || null));
      }
      drawHeatmap({
        ...payload,
        drawSession: renderSession
      });
      if(execution && !execution.isCurrent?.()){
        return false;
      }
      updateHeatmapRenderRuntime(renderSession, runtime => {
        runtime.lastRenderModel = model;
        runtime.lastViewOptions = viewOptions;
        runtime.lastResolvedValueScale = cloneSimple(state.lastResolvedValueScale) || null;
        runtime.lastDataShape = cloneSimple(state.lastDataShape) || { rows: 0, cols: 0 };
        runtime.lastAutoDrawEvaluation = cloneSimple(state.lastAutoDrawEvaluation) || null;
        runtime.textAspectMetrics = cloneSimple(state.textAspectMetrics) || null;
        runtime.dataSignature = typeof lifecycleMeta?.dataSignature === 'string'
          ? lifecycleMeta.dataSignature
          : runtime.dataSignature || null;
        runtime.settingsSignature = typeof lifecycleMeta?.settingsSignature === 'string'
          ? lifecycleMeta.settingsSignature
          : createHeatmapSettingsSignature(viewOptions || {});
      }, { seedFromActive: true });
      return true;
    };
    if(!execution){
      return commit();
    }
    return Promise.resolve()
      .then(() => execution.checkpoint?.())
      .then(() => commit())
      .catch(err => {
        if(execution.signal?.aborted || !execution.isCurrent?.()){
          debugLog('Debug: heatmap render commit cancelled', {
            tabId: renderSession?.tabId || null,
            message: err?.message || String(err)
          });
          return false;
        }
        throw err;
      });
  }

  function refreshStatsForView(viewOptions, session = null){
    const targetSession = session || getActiveHeatmapSessionForState();
    const results = createDefaultHeatmapResultsState(targetSession?.results || {
      stats: state.lastStats,
      statsPanelModel: state.statsPanelModel
    });
    if(!results.stats){
      return;
    }
    const renderRuntime = getHeatmapRenderRuntime(targetSession, { seedFromActive: !targetSession });
    const stats = { ...results.stats };
    stats.decimals = viewOptions?.decimals ?? stats.decimals;
    if(stats.type === 'correlation'){
      stats.useAbs = !!viewOptions?.useAbsolute;
      state.lastResolvedValueScale = null;
      updateHeatmapRenderRuntime(targetSession, runtime => {
        runtime.lastResolvedValueScale = null;
      }, { seedFromActive: true });
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
    }
    if(stats.type === 'values'){
      const resolvedScale = resolveHeatmapModelValueScale(renderRuntime?.lastRenderModel || getHeatmapActiveRenderModel(targetSession), viewOptions);
      state.lastResolvedValueScale = resolvedScale;
      updateHeatmapRenderRuntime(targetSession, runtime => {
        runtime.lastResolvedValueScale = cloneSimple(resolvedScale) || null;
      }, { seedFromActive: true });
      stats.scaleMin = resolvedScale?.min;
      stats.scaleMax = resolvedScale?.max;
      stats.scaleCustomized = !!resolvedScale?.customized;
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
    }
    updateStats(stats);
  }

  function prepareHeatmapOwnerDrawProjection(tabId, options = {}){
    const ownerTabId = String(tabId || '').trim();
    if(!ownerTabId){
      return null;
    }
    const session = getHeatmapSession(ownerTabId, {
      ...(options || {}),
      tabId: ownerTabId,
      reason: options.reason || 'heatmap-owner-draw-session'
    }, { create: false });
    const root = Shared.workspaceTabs?.getMountedRoot?.(ownerTabId, 'heatmap') || session?.root || null;
    if(!session || !isHeatmapOwnerContextCurrent(session, root, options)){
      debugLog('Debug: heatmap owner draw rejected', {
        tabId: ownerTabId,
        hasSession: !!session,
        hasRoot: !!root,
        reason: options.reason || null
      });
      return null;
    }

    const projectionCurrent = projectedHeatmapSession === session
      && state.root === root
      && String(heatmap.__boundTabId || '') === ownerTabId;
    if(!projectionCurrent){
      bindHeatmapSessionForTab(ownerTabId, {
        ...(options || {}),
        root,
        reason: options.reason || 'heatmap-owner-draw-bind'
      });
      bindHeatmapDomProjectionForSession(session, root, { syncUi: false });
      applyHeatmapSessionStateToActive(session, { syncUi: true, skipExportRefresh: true });
    }

    if(!heatmapHotBelongsToSession(session.managers?.hot, session) && typeof state.ensureHotForActiveTab === 'function'){
      const ownerHot = state.ensureHotForActiveTab();
      if(ownerHot && heatmapHotBelongsToSession(ownerHot, session)){
        session.managers.hot = ownerHot;
      }
    }
    if(heatmapHotBelongsToSession(session.managers?.hot, session)){
      state.hot = session.managers.hot;
    }
    syncHeatmapSessionManagersFromActive(session);
    syncHeatmapSessionRefsFromActive(session);
    debugLog('Debug: heatmap owner draw projection ready', {
      tabId: ownerTabId,
      projectionRebound: !projectionCurrent,
      hasHot: !!session.managers?.hot,
      hasSvg: !!session.refs?.svg,
      reason: options.reason || null
    });
    return { session, root };
  }

  function draw(options = {}){
    const requestedOptions = normalizeDrawOptions(options);
    const explicitTabId = String(requestedOptions.tabId || '').trim();
    const explicitOwnerRequested = !!explicitTabId
      && (requestedOptions.force === true || requestedOptions.forceDraw === true || requestedOptions.reason === 'workspace-draw-fallback');
    const explicitOwnerProjection = explicitOwnerRequested
      ? prepareHeatmapOwnerDrawProjection(explicitTabId, requestedOptions)
      : null;
    const explicitSession = explicitOwnerProjection?.session || null;
    const explicitRoot = explicitOwnerProjection?.root || null;
    const explicitOwnerDraw = !!explicitOwnerProjection;
    const scheduledSession = explicitOwnerDraw ? explicitSession : getActiveHeatmapSessionForState();
    const scheduledRuntime = getHeatmapDrawRuntime(scheduledSession, { seedFromActive: true });
    const pendingOptions = sanitizeHeatmapDrawOptions(scheduledRuntime?.pendingDrawOptions || {});
    const drawOpts = Object.keys(requestedOptions).length
      ? { ...pendingOptions, ...requestedOptions }
      : pendingOptions;
    const requestedSession = getHeatmapSessionForDrawOptions(drawOpts, {
      tabId: drawOpts.tabId || null,
      reason: drawOpts.reason || 'heatmap-draw-session',
      fallbackActive: true
    });
    if(requestedSession && !explicitOwnerDraw && !isHeatmapSessionActiveForModuleState(requestedSession)){
      updateHeatmapDrawRuntime(requestedSession, runtime => {
        runtime.pendingDrawOptions = sanitizeHeatmapDrawOptions(drawOpts);
      }, { mirrorActive: false });
      if(scheduledSession && scheduledSession !== requestedSession){
        updateHeatmapDrawRuntime(scheduledSession, runtime => {
          runtime.pendingDrawOptions = {};
        }, { mirrorActive: false });
      }
      debugLog('Debug: heatmap draw deferred for inactive session', {
        tabId: requestedSession.tabId || drawOpts.tabId || null,
        reason: drawOpts.reason || null
      });
      return false;
    }
    const drawSession = bindHeatmapSessionForTab(drawOpts.tabId || getHeatmapProjectionTabId() || null, {
      ...(drawOpts || {}),
      reason: drawOpts.reason || 'heatmap-draw-session'
    }) || requestedSession || scheduledSession;
    updateHeatmapDrawRuntime(drawSession, runtime => {
      runtime.pendingDrawOptions = {};
    });
    const perfStart = nowMs();
    let prepareEnd = perfStart;
    let renderStart = perfStart;
    let renderModelCacheReused = false;
    const finalizeDrawPerformance = (meta = {}) => {
      const effectivePrepareEnd = Number.isFinite(prepareEnd) ? prepareEnd : nowMs();
      const effectiveRenderStart = Number.isFinite(renderStart) ? renderStart : effectivePrepareEnd;
      const totalMs = nowMs() - perfStart;
      const prepareMs = Math.max(0, effectivePrepareEnd - perfStart);
      const renderMs = Math.max(0, totalMs - Math.max(0, effectiveRenderStart - perfStart));
      recordHeatmapPerformance('draw', {
        totalMs,
        prepareMs,
        renderMs,
        viewOnly: !!drawOpts.viewOnly,
        reason: drawOpts.reason || null,
        status: meta.status || 'complete',
        view: meta.view || null,
        rows: Number.isFinite(meta.rows) ? meta.rows : undefined,
        cols: Number.isFinite(meta.cols) ? meta.cols : undefined,
        renderModelCacheReused,
        error: meta.error || null
      });
    };
    try{
      const ownerRoot = drawSession?.root || explicitRoot || state.root || null;
      const ownerSvg = heatmapNodeBelongsToRoot(drawSession?.refs?.svg, ownerRoot)
        ? drawSession.refs.svg
        : ownerRoot?.querySelector?.('#heatmapSvg') || null;
      const ownerHot = heatmapHotBelongsToSession(drawSession?.managers?.hot, drawSession)
        ? drawSession.managers.hot
        : (heatmapHotBelongsToSession(state.hot, drawSession) ? state.hot : null);
      if(!ownerHot || !ownerSvg){
        debugLog('Debug: heatmap draw skipped - missing owner hot or svg', {
          tabId: drawSession?.tabId || null,
          hasHot: !!ownerHot,
          hasSvg: !!ownerSvg,
          reason: drawOpts.reason || null
        });
        finalizeDrawPerformance({ status: 'skipped', error: 'missing-owner-hot-or-svg' });
        return false;
      }
      state.hot = ownerHot;
      state.svg = ownerSvg;
      if(!explicitOwnerDraw && isHeatmapWorkspaceHidden()){
        const pending = mergeDeferredHiddenDrawOptions(drawOpts);
        debugLog('Debug: heatmap draw skipped while hidden', {
          reason: pending?.reason || drawOpts.reason || null,
          viewOnly: !!pending?.viewOnly,
          force: !!pending?.force
        });
        finalizeDrawPerformance({ status: 'skipped', error: 'workspace-hidden' });
        return;
      }
      if(state.emptyPlotNoticeEl && state.emptyPlotNoticeEl.parentNode){
        state.emptyPlotNoticeEl.parentNode.removeChild(state.emptyPlotNoticeEl);
      }
      state.emptyPlotNoticeEl = null;
      if(state.svg?.style){
        state.svg.style.display = '';
      }
      const drawRuntime = updateHeatmapDrawRuntime(drawSession, runtime => {
        runtime.token = (Number(runtime.token) || 0) + 1;
      }, { seedFromActive: true });
      const drawToken = Number(drawRuntime?.token) || Number(state.drawToken) || 0;
      let drawAsyncState = null;
      const drawTabId = drawOpts.tabId || drawSession?.tabId || getHeatmapProjectionTabId() || null;
      if(drawTabId && Shared.componentLifecycle?.createAsyncScope){
        try{
          const scope = heatmap.__drawAsyncScope || Shared.componentLifecycle.createAsyncScope('heatmap-draw');
          heatmap.__drawAsyncScope = scope;
          drawAsyncState = {
            scope,
            meta: scope.nextToken({
              componentKey: 'heatmap',
              tabId: drawTabId,
              reason: drawOpts.reason || 'heatmap-draw',
              sessionGeneration: drawSession?.updatedAt || null,
              drawToken
            })
          };
        }catch(err){
          drawAsyncState = null;
          debugLog('Debug: heatmap draw async lifecycle scope unavailable', {
            tabId: drawTabId,
            message: err?.message || String(err)
          });
        }
      }
      const drawExecution = Shared.jobs?.createExecutionContext?.({
        component: 'heatmap',
        tabId: drawTabId,
        kind: 'graph',
        budgetMs: 8
      }) || null;
      if(drawExecution){
        if(!drawAsyncState){
          drawAsyncState = {
            scope: null,
            meta: {
              componentKey: 'heatmap',
              tabId: drawTabId,
              reason: drawOpts.reason || 'heatmap-draw',
              sessionGeneration: drawSession?.updatedAt || null,
              drawToken
            }
          };
        }
        drawAsyncState.execution = drawExecution;
      }
      const settings = resolveHeatmapEffectiveSettings(collectSettings(drawSession));
      const renderRuntime = getHeatmapRenderRuntime(drawSession, { seedFromActive: false });
      const cachedRenderModel = renderRuntime?.lastRenderModel || getHeatmapActiveRenderModel(drawSession);
      const viewMatches = (cachedRenderModel?.type === 'values' && settings.view === 'values')
        || (cachedRenderModel?.type === 'correlation' && settings.view.startsWith('corr'));
      if(drawOpts.viewOnly){
        if(cachedRenderModel && viewMatches){
          const viewOptions = extractViewOptions(settings);
          const applied = renderModelWithView(cachedRenderModel, viewOptions, drawSession, {
            settingsSignature: createHeatmapSettingsSignature(settings)
          });
          if(applied){
            syncHeatmapCorrelationMatrixDataView(
              settings.view.startsWith('corr') ? cachedRenderModel : null,
              settings,
              {
                context: resolveHeatmapViewContext(),
                reason: 'heatmap-correlation-view-sync-view-only'
              }
            );
            refreshStatsForView(viewOptions, drawSession);
            prepareEnd = nowMs();
            debugLog('Debug: heatmap view-only redraw applied', { reason: drawOpts.reason });
            finalizeDrawPerformance({
              status: 'complete',
              view: settings.view,
              rows: state.lastDataShape?.rows,
              cols: state.lastDataShape?.cols
            });
            return;
          }
          debugLog('Debug: heatmap view-only redraw fallback triggered');
        }else{
          debugLog('Debug: heatmap view-only redraw skipped - no cached render');
        }
        prepareEnd = nowMs();
        finalizeDrawPerformance({
          status: 'skipped',
          view: settings.view,
          rows: state.lastDataShape?.rows,
          cols: state.lastDataShape?.cols
        });
        return;
      }
      const processed = prepareProcessedData(settings);
      const dataSignature = createHeatmapDataSignatureFromProcessed(processed);
      const settingsSignature = createHeatmapSettingsSignature(settings);
      const canReuseRenderModel = !!cachedRenderModel
        && renderRuntime?.dataSignature === dataSignature
        && renderRuntime?.settingsSignature === settingsSignature
        && viewMatches;
      if(drawAsyncState?.meta){
        drawAsyncState.meta.dataSignature = dataSignature;
        drawAsyncState.meta.settingsSignature = settingsSignature;
        drawAsyncState.meta.sessionGeneration = drawSession?.updatedAt || null;
      }
      updateHeatmapRenderRuntime(drawSession, runtime => {
        runtime.dataSignature = dataSignature;
        runtime.settingsSignature = settingsSignature;
      });
      prepareEnd = nowMs();
      if(!processed.ok){
        syncHeatmapCorrelationMatrixDataView(null, settings, {
          context: resolveHeatmapViewContext(),
          reason: 'heatmap-correlation-view-clear-empty'
        });
        clearCachedRenderState();
        const reason = processed.reason;
        if(reason === 'no-data'){
          renderEmpty(Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null, drawSession);
          updateStats(null);
        }else if(reason === 'filtered-out'){
          renderEmpty('No rows passed the current filters. Adjust your thresholds to view data.', drawSession);
          updateStats({ type: 'empty', message: 'No rows passed the current filters.' });
        }else if(reason === 'adjustment-empty'){
          renderEmpty('All columns were removed after adjustments. Check normalization and centering settings.', drawSession);
          updateStats({ type: 'empty', message: 'All columns were removed after adjustments.' });
        }
        finalizeDrawPerformance({
          status: 'complete',
          view: settings.view,
          rows: state.lastDataShape?.rows,
          cols: state.lastDataShape?.cols
        });
        return;
      }
      renderStart = nowMs();
      let renderResult;
      if(canReuseRenderModel){
        renderModelCacheReused = true;
        const viewOptions = extractViewOptions(settings);
        renderResult = settleHeatmapRenderCommit(
          renderModelWithView(cachedRenderModel, viewOptions, drawSession, drawAsyncState || {}),
          () => {
            syncHeatmapCorrelationMatrixDataView(
              settings.view.startsWith('corr') ? cachedRenderModel : null,
              settings,
              {
                context: resolveHeatmapViewContext(),
                reason: 'heatmap-correlation-view-sync-model-cache'
              }
            );
            refreshStatsForView(viewOptions, drawSession);
            return true;
          }
        );
        debugLog('Debug: heatmap render model cache reused', {
          tabId: drawSession?.tabId || null,
          dataSignature,
          settingsSignature,
          reason: drawOpts.reason || null
        });
      }else{
        renderResult = settings.view === 'values'
          ? renderValuesHeatmap(processed, settings, drawToken, drawAsyncState)
          : renderCorrelationHeatmap(processed, settings, drawToken, drawAsyncState);
      }
      if(renderResult && typeof renderResult.then === 'function'){
        return renderResult.then((value) => {
          if(!isHeatmapDrawCurrent(drawToken, drawAsyncState)){
            finalizeDrawPerformance({
              status: 'skipped',
              view: settings.view,
              rows: processed.rowCount,
              cols: processed.columnCount,
              error: 'stale-draw'
            });
            return value;
          }
          finalizeDrawPerformance({
            status: 'complete',
            view: settings.view,
            rows: processed.rowCount,
            cols: processed.columnCount
          });
          captureHeatmapSessionStateFromActive(drawSession, { reason: drawOpts.reason || 'heatmap-async-draw-complete' });
          return value;
        }).catch((err) => {
          finalizeDrawPerformance({
            status: 'error',
            view: settings.view,
            rows: processed.rowCount,
            cols: processed.columnCount,
            error: err?.message || String(err)
          });
          throw err;
        });
      }
      finalizeDrawPerformance({
        status: 'complete',
        view: settings.view,
        rows: processed.rowCount,
        cols: processed.columnCount
      });
      captureHeatmapSessionStateFromActive(drawSession, { reason: drawOpts.reason || 'heatmap-draw-complete' });
      return renderResult;
    }catch(err){
      console.error('heatmap draw error', err);
      finalizeDrawPerformance({ status: 'error', error: err?.message || String(err) });
      throw err;
    }
  }
  function getConfig(session = null){
    const targetSession = session || getActiveHeatmapSessionForState();
    const controls = getHeatmapControlState(targetSession, { syncFromDom: !targetSession || isHeatmapSessionActiveForModuleState(targetSession) });
    const dendroSettings = getHeatmapDendrogramSettings(targetSession);
    return {
      view: controls.view,
      method: controls.method,
      useAbsolute: !!controls.useAbsolute,
      maskLower: !!controls.maskLower,
      showValues: !!controls.showValues,
      showSignificance: !!controls.showSignificance,
      significanceDisplay: controls.significanceDisplay,
      decimals: controls.decimals,
      colors: getHeatmapPalette(targetSession),
      valueScale: getHeatmapValueScale(targetSession),
      legendHeightMode: getHeatmapLegendHeightMode(targetSession),
      cellSize: controls.cellSize,
      fontSize: controls.fontSize,
      fontStyles: exportFontStyles('heatmap', {
        tabId: getHeatmapProjectionTabId() || null
      }) || undefined,
      title: targetSession?.state?.titleText ?? state.titleText,
      labelPositions: targetSession?.state?.labelPositions || state.labelPositions || null,
      dendrogram: {
        thickness: dendroSettings.thickness,
        color: dendroSettings.color
      },
      filters: { ...controls.filters },
      adjust: {
        logTransform: !!controls.adjust.logTransform,
        logPlusOne: !!controls.adjust.logPlusOne,
        centerRows: controls.adjust.centerRowsMode || null,
        centerColumns: controls.adjust.centerColumnsMode || null,
        normalizeRows: !!controls.adjust.normalizeRows,
        normalizeColumns: !!controls.adjust.normalizeColumns
      },
      clustering: {
        rows: { ...controls.clustering.rows },
        columns: { ...controls.clustering.columns },
        linkage: controls.clustering.linkage
      }
    };
  }

  function applyConfig(config){
    if(!config) return;
    runWithHeatmapControlSuspension(() => {
      const activeSessionForConfig = getActiveHeatmapSessionForState();
      if(config.title !== undefined){
        state.titleText = config.title != null ? String(config.title) : '';
      }else if(state.titleText == null){
        state.titleText = 'Heatmap';
      }
      if(activeSessionForConfig){
        activeSessionForConfig.state.titleText = state.titleText;
        activeSessionForConfig.updatedAt = Date.now();
      }
      if(config.labelPositions){
        state.labelPositions = {
          title: config.labelPositions.title || null
        };
        if(activeSessionForConfig){
          activeSessionForConfig.state.labelPositions = cloneSimple(state.labelPositions) || { title: null };
          activeSessionForConfig.updatedAt = Date.now();
        }
      }
      if(config.dendrogram && typeof config.dendrogram === 'object'){
        const settings = updateHeatmapDendrogramSettings({
          thickness: config.dendrogram.thickness,
          color: config.dendrogram.color
        }, activeSessionForConfig);
        debugLog('Debug: heatmap dendrogram settings restored', { thickness: settings.thickness, color: settings.color });
      }

      const sourceClustering = config.clustering && typeof config.clustering === 'object' ? config.clustering : {};
      const restoredControls = normalizeHeatmapControlState({
        view: config.view || 'corr-columns',
        method: config.method || 'pearson',
        useAbsolute: config.useAbsolute,
        maskLower: config.maskLower,
        showValues: config.showValues,
        showSignificance: config.showSignificance,
        significanceDisplay: config.significanceDisplay,
        decimals: config.decimals,
        cellSize: config.cellSize,
        fontSize: config.fontSize,
        filters: config.filters || {},
        adjust: config.adjust || {},
        clustering: {
          rows: {
            enabled: !!sourceClustering.rows?.enabled,
            metric: sourceClustering.rows?.metric || 'pearson',
            showDendrogram: !!sourceClustering.rows?.showDendrogram
          },
          columns: {
            enabled: !!sourceClustering.columns?.enabled,
            metric: sourceClustering.columns?.metric || 'pearson',
            showDendrogram: !!sourceClustering.columns?.showDendrogram
          },
          linkage: sourceClustering.linkage || 'average'
        }
      });
      applyHeatmapControlStateToDom(restoredControls, { dispatch: true });

      state.palette = normalizeHeatmapPalette(config.colors);
      state.valueScale = normalizeHeatmapValueScale(config.valueScale);
      state.legendHeightMode = normalizeHeatmapLegendHeightMode(config.legendHeightMode);
      if(activeSessionForConfig){
        activeSessionForConfig.state.palette = { ...state.palette };
        activeSessionForConfig.state.valueScale = { ...state.valueScale };
        activeSessionForConfig.state.legendHeightMode = state.legendHeightMode;
        activeSessionForConfig.updatedAt = Date.now();
      }
      state.lastResolvedValueScale = null;
      updateHeatmapRenderRuntime(activeSessionForConfig, runtime => {
        runtime.lastResolvedValueScale = null;
      }, { seedFromActive: true });
      syncHeatmapPaletteInputs(resolveHeatmapRoot(activeSessionForConfig?.tabId || null));
      importFontStyles('heatmap', config.fontStyles || null, {
        tabId: activeSessionForConfig?.tabId || null
      });
      syncHeatmapControlStateToSession(activeSessionForConfig, restoredControls);
    });
  }
  function getPayload(){
    const payloadSession = getActiveHeatmapSessionForState();
    syncHeatmapControlStateToSession(payloadSession, captureHeatmapControlStateFromDom());
    const activeHot = (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot;
    const notesSnapshot = getHeatmapNotesState(payloadSession, { syncFromControl: true });
    const notesText = notesSnapshot.text;
    const notesOpen = !!notesSnapshot.open;
    const activeManager = ensureHeatmapDataViewsForHot(activeHot, {
      wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
      container: activeHot?.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
    });
    syncHeatmapActiveDataViewFromHot(activeHot, 'payload');
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    const statsPanelModel = captureHeatmapStatsPanelModel();
    const resultState = updateHeatmapResultsState(payloadSession, results => {
      results.statsPanelModel = normalizeHeatmapStatsPanelModel(statsPanelModel || {});
    });
    const savedStats = resultState?.stats
      ? (cloneSimple(resultState.stats) || resultState.stats)
      : (state.lastStats ? (cloneSimple(state.lastStats) || state.lastStats) : null);
    if(savedStats && typeof savedStats === 'object'){
      savedStats.statsPanelModel = statsPanelModel;
    }
    const payload = {
      type: 'heatmap',
      data: Shared.hot.trimTrailingEmptyCols(activeHot ? activeHot.getData() : []),
      exclusions: activeHot?.exportExclusions?.() || (activeHot ? Shared.hot.exportExclusions(activeHot) : Shared.hot.exportExclusions(null)),
      filters: activeHot?.exportFilters?.() || (activeHot ? Shared.hot.exportFilters(activeHot) : Shared.hot.exportFilters(null)),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      stats: savedStats,
      renderModelCache: captureHeatmapRenderModelCache(payloadSession) || undefined,
      config: getConfig(payloadSession)
    };
    payload.config = payload.config || {};
    payload.config.colorScheme = payload.config.colorScheme
      || Shared.colorSchemes?.getSelectedSchemeId?.('heatmap')
      || 'scientific';
    payload.config.notes = {
      text: notesText,
      open: notesOpen
    };
    payload.config.statsPanelModel = statsPanelModel;
    captureHeatmapSessionStateFromActive(payloadSession, { reason: 'heatmap-payload-capture' });
    debugLog('Debug: heatmap.getPayload captured state', {
      hasHot: !!activeHot,
      rows: payload.data?.length || 0,
      cols: payload.data?.[0]?.length || 0,
      method: payload.config?.method,
      hasStats: !!payload.stats
    });
    return payload;
  }
  heatmap.getPayload = getPayload;
  {
    const tableUiHooks = Shared.hot?.makeTableUiStateHooks?.(
      () => (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot,
      'heatmap'
    );
    heatmap.captureUiState = tableUiHooks ? tableUiHooks.capture : () => null;
    heatmap.applyUiState = tableUiHooks ? tableUiHooks.apply : () => false;
  }
  heatmap.captureEmptyPayloadTemplate = function captureHeatmapEmptyPayloadTemplate(){
    const snapshot = heatmap.createEmptyPayload();
    debugLog('Debug: heatmap empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  heatmap.restoreEmptyPayloadTemplate = function restoreHeatmapEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      debugLog('Debug: heatmap empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    debugLog('Debug: heatmap empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  heatmap.createEmptyPayload = function createEmptyHeatmapPayload(){
    debugLog('Debug: heatmap.createEmptyPayload pure factory invoked', {
      ready: !!heatmap.ready,
      boundTabId: getHeatmapProjectionTabId() || null
    });
    const payload = { type: 'heatmap', config: {} };
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
    seedHeatmapDefaultHeaderRow(emptyData);
    payload.data = emptyData;
    payload.exclusions = [];
    payload.filters = null;
    payload.config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    if(typeof payload.config.colorScheme !== 'string' || !payload.config.colorScheme.trim()){
      payload.config.colorScheme = Shared.colorSchemes?.getDefaultSchemeId?.('heatmap') || 'scientific';
    }
    return payload;
  };

  heatmap.save = async function saveHeatmap(){
    debugLog('Debug: heatmap.save invoked', { hasHandle: !!state.fileHandle });
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('heatmap.save missing fileIO.saveGraphFile');
      return;
    }
    const operationSession = getActiveHeatmapSessionForState();
    const result = await fileIO.saveGraphFile({
      context: 'heatmap',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => setHeatmapFileHandle(handle, operationSession),
      setFileName: name => setHeatmapFileName(name, { session: operationSession })
    });
    debugLog('Debug: heatmap.save result', result);
  };

  heatmap.saveAs = async function saveAsHeatmap(){
    debugLog('Debug: heatmap.saveAs invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('heatmap.saveAs missing fileIO.saveGraphFileAs');
      return;
    }
    const operationSession = getActiveHeatmapSessionForState();
    const result = await fileIO.saveGraphFileAs({
      context: 'heatmap',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => setHeatmapFileHandle(handle, operationSession),
      setFileName: name => setHeatmapFileName(name, { session: operationSession })
    });
    debugLog('Debug: heatmap.saveAs result', result);
  };

  heatmap.open = async function openHeatmap(){
    debugLog('Debug: heatmap.open invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('heatmap.open missing fileIO.openGraphFile');
      return;
    }
    const operationSession = getActiveHeatmapSessionForState();
    const result = await fileIO.openGraphFile({
      context: 'heatmap',
      setFileHandle: handle => setHeatmapFileHandle(handle, operationSession),
      setFileName: name => setHeatmapFileName(name, { session: operationSession }),
      loadFromFile: file => heatmap.loadFromFile(file),
      triggerInput: () => {
        const input = $('heatmapGraphFile');
        if(input){
          input.value = '';
          input.click();
        }
      }
    });
    debugLog('Debug: heatmap.open result', result);
  };

  function applyHeatmapPayload(obj, meta = {}){
    if(!obj || typeof obj !== 'object'){
      console.error('heatmap payload missing or invalid', { meta });
      return false;
    }
    if(obj.type && obj.type !== 'heatmap'){
      console.error('Invalid heatmap payload type', { type: obj.type, meta });
      return false;
    }
    if(meta?.flagOverlay){
      const overlayReason = meta?.overlayReason || (typeof meta?.source === 'string' ? `payload-${meta.source}` : 'payload');
      markHeatmapOverlayPending(overlayReason);
    }
    const skipDraw = meta?.skipDraw === true;
    const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
    const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
    let scheduleBackup = null;
    if(skipDraw && typeof state.scheduleDraw === 'function'){
      scheduleBackup = state.scheduleDraw;
      state.scheduleDraw = () => {};
    }
    try{
      const payloadSession = getActiveHeatmapSessionForState();
      invalidateHeatmapTransientRenderState(`payload:${meta?.source || 'unknown'}`);
      const hot = (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot;
      if(hot){
        state.hot = hot;
      }
      const rawMatrix = cloneMatrix(Array.isArray(obj.data) ? obj.data : []);
      const serializedViews = cloneHeatmapDataViewsPayload(obj.dataViews);
      const requestedActiveViewId = obj.activeDataViewId || serializedViews?.activeViewId || null;
      const dataManager = hot
        ? ensureHeatmapDataViewsForHot(hot, {
            wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
            container: hot.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
          })
        : null;
      if(dataManager){
        if(serializedViews){
          dataManager.deserialize(serializedViews, {
            fallbackData: rawMatrix,
            activeViewId: requestedActiveViewId,
            silent: true,
            activate: false
          });
        }else{
          dataManager.initialize(rawMatrix, { rawTitle: 'Raw' });
        }
        const activeView = dataManager.getActiveView?.() || null;
        setHeatmapActiveMaterializedViewId(isHeatmapMaterializedDataView(activeView) ? activeView.id : null);
      }
      const activeViewData = dataManager?.getActiveView?.()?.data;
      const matrix = cloneMatrix(Array.isArray(activeViewData) ? activeViewData : rawMatrix);
      const activeViewExclusions = dataManager?.getActiveView?.()?.exclusions || null;
      const exclusionsToApply = obj.exclusions || activeViewExclusions || null;
      const activeViewFilters = dataManager?.getActiveView?.()?.filters || null;
      const filtersToApply = obj.filters || activeViewFilters || null;
      const config = obj.config || {};
      const restoredNotes = config.notes && typeof config.notes === 'object'
        ? { text: config.notes.text, open: config.notes.open }
        : (typeof config.notes === 'string' ? { text: config.notes, open: notesState.open } : { text: '', open: false });
      syncHeatmapNotesStateToSession(payloadSession, restoredNotes);
      applyHeatmapNotesStateToControl(payloadSession);
      if(!skipDataLoad && state.hot){
        updateHeatmapClusterState({ suspendAutoClusterDefaults: true });
        try{
          state.hot.loadData(matrix);
        }finally{
          updateHeatmapClusterState({ suspendAutoClusterDefaults: false });
        }
        if(exclusionsToApply && state.hot.applyExclusions){
          state.hot.applyExclusions(exclusionsToApply);
        }
        if(filtersToApply && state.hot.applyFilters){
          state.hot.applyFilters(filtersToApply, { schedule: false });
        }
      }
      applyConfig(config);
      applyHeatmapDataTransformControlState(
        resolveHeatmapDataTransformControlStateForView(dataManager?.getActiveView?.() || null, dataManager)
      );
      if(state.hot){
        syncHeatmapActiveDataViewFromHot(state.hot, 'payload-load');
      }
      state.lastStats = (obj.stats && typeof obj.stats === 'object')
        ? (cloneSimple(obj.stats) || obj.stats)
        : null;
      state.statsPanelModel = normalizeHeatmapStatsPanelModel(config.statsPanelModel || obj.stats?.statsPanelModel || {});
      updateHeatmapResultsState(payloadSession, results => {
        results.stats = cloneSimple(state.lastStats) || null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel || {});
      });
      if(!styleOnly && !skipDataLoad){
        restoreHeatmapRenderModelCache(obj.renderModelCache, payloadSession);
      }
      captureHeatmapSessionStateFromActive(payloadSession, { reason: `heatmap-payload-apply:${meta?.source || 'unknown'}` });
      if(!skipDraw){
        if(state.lastStats){
          updateStats(state.lastStats);
        }else{
          restoreHeatmapStatsPanelModel(state.statsPanelModel);
        }
        scheduleActiveHeatmapDraw({ reason: `heatmap-payload-${meta?.source || 'unknown'}` });
      }
      debugLog('Debug: heatmap payload applied', {
        source: meta.source || 'unknown',
        rows: matrix.length,
        cols: matrix[0]?.length || 0
      });
      return true;
    }finally{
      if(scheduleBackup){
        state.scheduleDraw = scheduleBackup;
      }
    }
  }

  heatmap.loadFromFile = function loadHeatmapFromFile(file){
    const reader = new FileReader();
    reader.onload = e => {
      try{
        const obj = JSON.parse(e.target.result);
        if(!applyHeatmapPayload(obj, { source: 'file', flagOverlay: true, overlayReason: 'graph-file' })){
          console.warn('heatmap payload rejected from file', { hasType: !!obj?.type });
        }
      }catch(err){
        console.error('heatmap load error', err);
      }
    };
    reader.readAsText(file);
  };

  heatmap.loadFromPayload = function loadHeatmapFromPayload(payload, options = {}){
    if(!applyHeatmapPayload(payload, { source: 'payload', ...options })){
      console.warn('heatmap payload application failed', { source: 'payload' });
    }
  };

  heatmap.__internals = Object.assign({}, heatmap.__internals, {
    hierarchicalCluster,
    distanceBetweenVectors,
    buildHeatmapDendrogramGeometry,
    mergeHeatmapDendrogramSegments,
    selectHeatmapProjectionIndices
  });

  function runHeatmapDrawCycle(options = {}){
    const drawOptions = normalizeDrawOptions(options);
    const reason = drawOptions.reason || drawOptions.source || 'heatmap-draw';
    const forceOverlay = drawOptions.force === true
      || drawOptions.forceDraw === true
      || drawOptions.forceOverlay === true
      || reason === 'workspace-draw-fallback';
    const tabId = drawOptions.tabId || getHeatmapProjectionTabId() || null;
    if(forceOverlay){
      forceHeatmapOverlay(reason, {
        tabId,
        message: 'Rendering heatmap...'
      });
    }else{
      queueHeatmapOverlay(reason, { tabId });
    }
    try{
      const result = draw(drawOptions);
      if(result && typeof result.then === 'function'){
        return result.then(value => {
          resolveHeatmapOverlay({ reason: 'complete', tabId });
          return value;
        }, err => {
          resolveHeatmapOverlay({ reason: 'error', status: 'error', error: err, tabId });
          throw err;
        });
      }
      resolveHeatmapOverlay({ reason: 'complete', tabId });
      return result;
    }catch(err){
      resolveHeatmapOverlay({ reason: 'error', status: 'error', error: err, tabId });
      throw err;
    }
  }

  heatmap.draw = runHeatmapDrawCycle;
  heatmap.cancelCurrentDraw = function cancelCurrentDraw(meta = {}){
    const tabId = meta?.tabId || getHeatmapProjectionTabId() || null;
    const session = tabId ? getHeatmapSession(tabId, { ...(meta || {}), tabId, reason: 'heatmap-cancel-current-draw' }, { create: false }) : getActiveHeatmapSessionForState();
    try{ state.scheduleDraw?.clear?.(tabId); }catch(_err){}
    updateHeatmapDrawRuntime(session || getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), runtime => {
      runtime.pendingDrawOptions = {};
      runtime.deferredHiddenDrawOptions = null;
      runtime.token = (Number(runtime.token) || 0) + 1;
    }, { seedFromActive: true });
    try{ heatmap.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'heatmap-draw-cancel'); }catch(_err){}
    try{ heatmap.__drawAsyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'heatmap-draw-cancel'); }catch(_err){}
    resolveHeatmapOverlay({ reason: meta?.reason || 'cancelled', tabId });
    Shared.componentLifecycle?.emitLifecycleEvent?.({
      componentKey: 'heatmap',
      tabId,
      action: 'draw-cancelled',
      reason: meta?.reason || 'heatmap-draw-cancel',
      details: { drawToken: state.drawToken }
    });
    return true;
  };

  function initNotes(){
    const stack = queryHeatmapRoot('#heatmapGraphPanel .heatmap-plot-stack')
      || queryHeatmapRoot('#heatmapGraphPanel .diagram-area');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        debugLog('Debug: heatmap notes mount skipped (missing stack)');
      }
      return;
    }
    const noteSession = getActiveHeatmapSessionForState();
    const noteState = getHeatmapNotesState(noteSession);
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'heatmap',
      ownerTabId: getHeatmapProjectionTabId() || noteSession?.tabId || null,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'heatmap-notes',
      scopeId: 'heatmap',
      fontKey: 'notes',
      value: noteState.text || '',
      open: !!noteState.open,
      unavailableMessage: 'heatmap notes helper unavailable',
      debugLog,
      applyToControl: control => applyHeatmapNotesStateToControl(noteSession, { control }),
      onChange: value => {
        const session = getActiveHeatmapSessionForState();
        syncHeatmapNotesStateToSession(session, {
          text: value == null ? '' : String(value),
          open: getHeatmapNotesState(session).open
        });
      },
      onToggle: open => {
        const session = getActiveHeatmapSessionForState();
        syncHeatmapNotesStateToSession(session, {
          text: getHeatmapNotesState(session).text,
          open: !!open
        });
      }
    }) || notesState.control || null;
  }

  heatmap.init = function init(options = {}){
    const targetTabId = options?.tabId || options?.tab?.id || resolveHeatmapAsyncTabId(options, state.hot) || null;
    const targetRoot = options?.root || resolveHeatmapRoot(targetTabId || null) || null;
    if(heatmap.ready && (!targetTabId || heatmap.__boundTabId === targetTabId) && (!targetRoot || state.root === targetRoot)){
      debugLog('Debug: heatmap.init skipped - already ready', { tabId: getHeatmapProjectionTabId() || null });
      return;
    }
    if(heatmap.ready){
      debugLog('Debug: heatmap.init rebinding', { previousTabId: getHeatmapProjectionTabId() || null, targetTabId, reason: options?.reason || 'init' });
      heatmap.ready = false;
    }
    heatmap.__boundTabId = targetTabId || null;
    state.root = targetRoot || state.root || null;
    const initSession = bindHeatmapSessionForTab(targetTabId || null, {
      ...(options || {}),
      root: state.root || null,
      reason: options?.reason || 'heatmap-init-bind-session'
    });
    debugLog('Debug: heatmap.init start', { tabId: getHeatmapProjectionTabId() || null });
    state.svg = $('heatmapSvg');
    if(state.svg){
      if(typeof chartStyle.prepareSvg === 'function'){
        chartStyle.prepareSvg(state.svg, { scopeId: 'heatmap' });
      }
      if(state.svg.dataset){
        state.svg.dataset.fontScope = 'heatmap';
        if(targetTabId){
          state.svg.dataset.fontTabId = String(targetTabId);
          state.svg.dataset.workspaceTabId = String(targetTabId);
        }
      }
      if(!state.svg.__heatmapPaletteFormatBound){
        state.svg.addEventListener('click', handleHeatmapSvgFormatClick, false);
        state.svg.__heatmapPaletteFormatBound = true;
      }
      ensureHeatmapFontObserver();
      ensureHeatmapFontEventListener();
    }
    const heatmapResizeTarget = state.svg?.closest('.svgbox') || null;
    state.layout = Shared.componentLayout?.createStandardPanels({
      componentName: 'heatmap',
      tabId: targetTabId || undefined,
      root: state.root || undefined,
      reason: options?.reason || 'heatmap-init',
      selectors: {
        tablePanel: '#heatmapTablePanel',
        graphPanel: '#heatmapGraphPanel',
        panelResizer: '#heatmapPanelResizer',
        hotWrapper: '#heatmapHotWrapper',
        hotContainer: '#heatmapHot',
        svgBox: () => heatmapResizeTarget,
        resizeTarget: () => heatmapResizeTarget
      },
      preserveGraphContent: false,
      skipScheduleOnObserver: true,
      skipScheduleOnResizePhases: () => true,
      panelSyncOptions: {
        disableAutoWidthClamp: true,
        lockGraphPanelWidth: false
      },
      onMinSvgWidth: value => {
        state.minSvgWidth = value;
        debugLog('Debug: heatmap layout minSvgWidth updated', { value });
      },
      resizableBoxOptions: {
        measureLockedGeometry: measureHeatmapLockedGeometry,
        onResize: phase => {
          const resizePhase = typeof phase === 'string' ? phase : '';
          const resizeSvg = heatmapResizeTarget?.querySelector?.('#heatmapSvg') || state.svg || null;
          const canvasRenderActive = isHeatmapCanvasRenderActive(resizeSvg);
          debugLog('Debug: heatmap layout onResize', {
            tabId: initSession?.tabId || targetTabId || null,
            phase: resizePhase || null,
            canvasRenderActive
          });
          if(resizePhase === 'start' || resizePhase === 'move'){
            if(heatmapResizeTarget?.dataset){
              heatmapResizeTarget.dataset.heatmapResizeActive = 'true';
            }
            if(canvasRenderActive){
              markHeatmapCanvasResizeReuse(true, resizeSvg);
              scheduleHeatmapCanvasLiveResizeProjection({
                tabId: initSession?.tabId || targetTabId || null
              });
              return;
            }
            if(resizePhase === 'move'){
              scheduleHeatmapDrawForSession(initSession, {
                viewOnly: true,
                reason: 'resize',
                resizePhase
              });
            }
            return;
          }
          if(heatmapResizeTarget?.dataset){
            delete heatmapResizeTarget.dataset.heatmapResizeActive;
            heatmapResizeTarget.dataset.heatmapResizeObserveMutedUntil = String(Date.now() + 180);
          }
          scheduleHeatmapCanvasLiveResizeProjection.clear(initSession?.tabId || targetTabId || null);
          markHeatmapCanvasResizeReuse(false, resizeSvg);
          clearHeatmapCanvasLiveResizeProjection(resizeSvg);
          if(resizePhase === 'zoom'){
            return;
          }
          scheduleHeatmapDrawForSession(initSession, {
            viewOnly: true,
            reason: 'resize',
            resizePhase: resizePhase || 'end'
          });
        }
      }
    });
    state.svgBox = state.layout?.elements?.svgBox || state.svg?.closest('.svgbox') || null;
    syncHeatmapSessionRefsFromActive(initSession);
    syncHeatmapSessionManagersFromActive(initSession);
    ensureHeatmapTextResizeObserver();
    initHot();
    syncHeatmapSessionManagersFromActive(initSession);
    initControls();
    syncHeatmapSessionRefsFromActive(initSession);
    bindHeatmapDataToolbar();
    initNotes();
    initFileButtons();
    const scheduleHeatmapBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(heatmap, 'heatmap', runHeatmapDrawCycle, {
          reason: 'heatmap-draw-frame',
          retryOnStale: true,
          shouldRetryStale: ({ tabId }) => {
            const ownerSession = getHeatmapSession(tabId, {
              tabId,
              reason: 'heatmap-draw-frame-stale-retry'
            }, { create: false });
            const shouldRetry = !!ownerSession && isHeatmapSessionActiveForModuleState(ownerSession);
            debugLog('Debug: heatmap stale draw frame retry evaluated', {
              tabId: tabId || null,
              shouldRetry
            });
            return shouldRetry;
          }
        })
      : runHeatmapDrawCycle;
    const scheduleHeatmapInstrumented = (opts) => {
      const rawOpts = normalizeDrawOptions(opts || {});
      const resolvedTabId = resolveHeatmapAsyncTabId(rawOpts, state.hot);
      const nextOpts = sanitizeHeatmapDrawOptions(resolvedTabId && !rawOpts.tabId
        ? { ...rawOpts, tabId: resolvedTabId }
        : { ...rawOpts });
      const overlayReason = nextOpts.reason || (nextOpts.force || nextOpts.forceOverlay ? 'manual-render' : 'schedule');
      const ownerSession = getHeatmapSessionForDrawOptions(nextOpts, { reason: overlayReason, fallbackActive: false });
      if(ownerSession){
        updateHeatmapDrawRuntime(ownerSession, runtime => {
          runtime.pendingDrawOptions = sanitizeHeatmapDrawOptions(nextOpts);
        }, { mirrorActive: false });
      }
      scheduleHeatmapBase(nextOpts);
    };
    scheduleDrawHeatmapRaw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'heatmap',
          debugLabel: 'heatmap',
          getTabId: () => getHeatmapProjectionTabId() || null,
          scheduleRaw: scheduleHeatmapInstrumented
        })
      : scheduleHeatmapInstrumented;
    debugLog('Debug: heatmap scheduler configured', { scheduler: 'tab-scoped lifecycle frame' });
    state.layout?.setScheduleDraw?.(meta => scheduleActiveHeatmapDraw(meta && typeof meta === 'object' ? meta : undefined));
    state.layout?.syncPanels?.();
    evaluateHeatmapDataShape();
    ensureEmptyPayloadTemplate();
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(null, 'heatmap')
      || resolveHeatmapRoot(null)
      || global.document;
    heatmap.__domSentinel = mountedRoot?.querySelector?.('#heatmapLoadExample')
      || getHeatmapNodeById('heatmapLoadExample')
      || null;
    heatmap.ready = true;
    captureHeatmapSessionStateFromActive(initSession || getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), { reason: 'heatmap-init-complete' });
    scheduleHeatmapDrawForSession(initSession || getActiveHeatmapSessionForState(), {
      tabId: targetTabId || resolveHeatmapAsyncTabId({}, state.hot),
      reason: 'heatmap-init'
    });
  };

  function ensureHeatmapDomBindings(tabLike, meta = {}){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
      return false;
    }
    const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'heatmap',
      tabLike: tabLike || null,
      meta,
      sentinelSelector: '#heatmapLoadExample',
      getCurrentRoot: () => state.root || null,
      getCurrentSentinel: () => heatmap.__domSentinel || null,
      rebind: info => {
        debugLog('Debug: heatmap DOM bindings rebind requested', { tabId: info?.tab?.id || null });
        const nextRoot = info?.root || resolveHeatmapRoot(info?.tab || null) || state.root || null;
        const nextTabId = info?.tab?.id || info?.tabId || (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || null;
        const reboundSession = bindHeatmapSessionForTab(info?.tab || nextTabId || null, {
          ...(meta || {}),
          tabId: nextTabId || null,
          root: nextRoot,
          reason: meta?.reason || 'workspace-dom-rebind'
        });
        if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
          heatmap.__boundTabId = nextTabId || reboundSession?.tabId || null;
          bindHeatmapDomProjectionForSession(reboundSession, nextRoot, { syncUi: false });
          if(typeof state.ensureHotForActiveTab === 'function'){
            const reboundHot = state.ensureHotForActiveTab();
            if(reboundHot){
              state.hot = reboundHot;
              reboundSession.managers.hot = reboundHot;
            }
          }
          syncHeatmapSessionManagersFromActive(reboundSession);
          syncHeatmapSessionRefsFromActive(reboundSession);
          // Project durable controls only after the target root and table manager are bound.
          // This mirrors Scatter's passive-rebind ordering and avoids partial DOM reads.
          applyHeatmapSessionStateToActive(reboundSession, {
            syncUi: true,
            skipExportRefresh: true
          });
          heatmap.__domSentinel = info?.mountedSentinel || getHeatmapNodeById('heatmapLoadExample');
          heatmap.ready = true;
          debugLog('Debug: heatmap passive DOM rebind', {
            tabId: reboundSession?.tabId || null,
            svgOwnerTabId: state.svg?.dataset?.fontTabId || null
          });
          return;
        }
        state.root = nextRoot;
        heatmap.ready = false;
        heatmap.init({ root: nextRoot || undefined, tabId: nextTabId || null, reason: 'workspace-dom-rebind' });
      }
    });
    return !!rebound?.rebound;
  }

  heatmap.ensure = function ensure(options = {}){
    if(ensureHeatmapDomBindings(options.tab || options.tabId || null, options || {})){
      return;
    }
    if(!heatmap.ready){
      heatmap.init({ ...options, tabId: options.tabId || options.tab?.id || getHeatmapProjectionTabId() || undefined, reason: options.reason || 'ensure' });
    }
  };
  function syncHeatmapActivationState(tabLike = null, options = {}){
    const activationSession = bindHeatmapSessionForTab(tabLike || getHeatmapProjectionTabId() || null, { reason: 'heatmap-activation-state-bind' });
    if(activationSession?.timers?.drawRuntime){
      syncHeatmapDrawRuntimeMirror(activationSession.timers.drawRuntime, activationSession);
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      const hot = state.ensureHotForActiveTab();
      if(hot){
        ensureHeatmapDataViewsForHot(hot, {
          wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
          container: hot.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
        });
        applyHeatmapDataTransformControlState(
          resolveHeatmapDataTransformControlStateForView(
            hot.__heatmapDataViewsManager?.getActiveView?.() || null,
            hot.__heatmapDataViewsManager || null
          )
        );
        syncHeatmapActiveDataViewFromHot(hot, 'activate-tab');
      }
    }
    if(typeof state.layout?.syncPanels === 'function'){
      state.layout.syncPanels({ skipSchedule: true });
    }
    ensureHeatmapFontObserver();
    ensureHeatmapTextResizeObserver();
    if(options.passive !== true){
      scheduleDeferredHiddenDrawFlush('activate-tab');
    }else{
      const drawRuntime = getHeatmapDrawRuntime(activationSession, { seedFromActive: false });
      const hasPendingDraw = !!activationSession?.state?.drawPending
        || !!drawRuntime?.deferredHiddenDrawOptions
        || !!(drawRuntime?.pendingDrawOptions && Object.keys(drawRuntime.pendingDrawOptions).length);
      if(hasPendingDraw){
        scheduleDeferredHiddenDrawFlush('activate-tab-passive-pending');
      }else{
        applyHeatmapTextAspect('activate-tab-passive-owner-projection');
      }
    }
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tabLike || null, 'heatmap')
      || resolveHeatmapRoot(tabLike || null)
      || global.document;
    heatmap.__domSentinel = mountedRoot?.querySelector?.('#heatmapLoadExample')
      || getHeatmapNodeById('heatmapLoadExample')
      || null;
    captureHeatmapSessionStateFromActive(activationSession || getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), { reason: 'heatmap-activation-state-complete' });
  }

  heatmap.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: heatmap,
    componentKey: 'heatmap',
    resolveRoot: tabLike => resolveHeatmapRoot(tabLike || null) || state.root || null,
    setRoot: (root, meta = {}) => {
      const targetTabId = normalizeHeatmapSessionTabId(meta?.tab || meta?.tabId || heatmap.__boundTabId || null, meta);
      const targetSession = targetTabId
        ? getHeatmapSession(targetTabId, {
            ...(meta || {}),
            tabId: targetTabId,
            root: root || null,
            reason: meta?.reason || 'heatmap-activation-root-stage'
          }, { create: true })
        : null;
      if(targetSession && root){
        targetSession.root = root;
        targetSession.refs.root = root;
        targetSession.updatedAt = Date.now();
      }
    },
    ensureBindings: (tabLike, meta) => ensureHeatmapDomBindings(tabLike, meta),
    init: options => heatmap.init(options),
    afterReady: (tabLike, meta = {}) => {
      if(!heatmap.ready){
        return;
      }
      const passive = !!(meta?.suppressDraw || meta?.suppressAutoDraw || meta?.liveDomFastPath || meta?.passiveControls);
      bindHeatmapSessionForTab(tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'heatmap-activate-bind-session' });
      applyExistingHeatmapOwnedRuntimeRecord(tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'heatmap-activate-apply-owned-runtime' });
      syncHeatmapActivationState(tabLike || meta?.tabId || null, { passive });
    },
    getSentinel: () => {
      const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(getHeatmapProjectionTabId() || null, 'heatmap')
        || resolveHeatmapRoot(getHeatmapProjectionTabId() || null)
        || global.document;
      return mountedRoot?.querySelector?.('#heatmapLoadExample')
        || getHeatmapNodeById('heatmapLoadExample')
        || null;
    }
  }) || function activateTab(tab, meta = {}){
    const targetTabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
    heatmap.__boundTabId = targetTabId || getHeatmapProjectionTabId() || null;
    state.root = resolveHeatmapRoot(tab || targetTabId || null) || state.root || null;
    bindHeatmapSessionForTab(tab || targetTabId || null, { ...(meta || {}), tabId: targetTabId || null, reason: meta?.reason || 'heatmap-activate-fallback-bind-session' });
    if(ensureHeatmapDomBindings(tab)){
      return;
    }
    if(!heatmap.ready){
      heatmap.init({ root: state.root || undefined, tabId: targetTabId || undefined, reason: meta?.reason || 'activate-tab' });
    }
    syncHeatmapActivationState(tab || targetTabId || null);
  };

  heatmap.captureRuntimeState = function captureRuntimeState(meta = {}){
    const requestedSession = getHeatmapSession(meta?.tab || meta?.tabId || null, meta, { create: false, fallbackActive: true })
      || getActiveHeatmapSessionForState();
    const activeSession = getActiveHeatmapSessionForState();
    const sessionSnapshot = requestedSession === activeSession
      ? captureHeatmapSessionStateFromActive(requestedSession, {
          ...(meta || {}),
          reason: meta.reason || 'heatmap-runtime-capture'
        })
      : ensureHeatmapSessionOwnershipShape(requestedSession);
    const snapshot = cloneSimple(sessionSnapshot?.state || buildHeatmapTabContextSnapshotFromState(sessionSnapshot)) || createDefaultHeatmapTabContext();
    if(sessionSnapshot?.cache?.renderRuntime){
      snapshot.renderState = cloneSimple(sessionSnapshot.cache.renderRuntime) || null;
    }
    rememberHeatmapOwnedRuntimeRecord(meta?.tab || meta?.tabId || sessionSnapshot?.tabId || null, snapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-capture'
    });
    debugLog('Debug: heatmap runtime snapshot captured', {
      tabId: sessionSnapshot?.tabId || meta?.tabId || getHeatmapProjectionTabId() || null,
      fromActive: requestedSession === activeSession,
      reason: meta.reason || 'heatmap-runtime-capture'
    });
    return Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(heatmap, snapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-capture'
    }) || snapshot;
  };

  heatmap.applyRuntimeState = function applyRuntimeState(snapshot, meta = {}){
    const resolvedSnapshot = resolveHeatmapOwnedRuntimeSnapshot(snapshot, meta)
      || Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(heatmap, snapshot, meta)
      || snapshot;
    if(!resolvedSnapshot || typeof resolvedSnapshot !== 'object'){
      return false;
    }
    const session = setHeatmapSessionStateFromRuntimeRecord(resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-apply-session-state'
    }) || bindHeatmapSessionForTab(meta?.tab || meta?.tabId || getHeatmapProjectionTabId() || null, meta);
    const isActiveOwner = !!session && isHeatmapSessionActiveForModuleState(session);
    if(isActiveOwner){
      applyHeatmapSessionStateToActive(session, { syncUi: true });
      clearHiddenDrawFlushHandle(session);
      updateHeatmapDrawRuntime(session, runtime => {
        runtime.pendingDrawOptions = {};
        runtime.deferredHiddenDrawOptions = null;
      }, { seedFromActive: true });
    }else if(!session){
      applyHeatmapTabContextSnapshot(resolvedSnapshot, { syncUi: true });
      clearHiddenDrawFlushHandle();
      updateHeatmapDrawRuntime(getHeatmapProjectionSession({ reason: 'heatmap-projection-mutation' }), runtime => {
        runtime.pendingDrawOptions = {};
        runtime.deferredHiddenDrawOptions = null;
      }, { seedFromActive: true });
    }else{
      debugLog('Debug: heatmap inactive runtime snapshot stored without active projection', {
        tabId: session.tabId || null,
        activeTabId: getHeatmapActiveTabId() || null,
        reason: meta.reason || 'heatmap-runtime-apply'
      });
    }
    rememberHeatmapOwnedRuntimeRecord(meta?.tab || meta?.tabId || session?.tabId || null, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-apply'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(heatmap, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-apply'
    });
    return true;
  };

  function deactivateHeatmapOwner(tab, meta = {}){
    const tabId = normalizeHeatmapSessionTabId(tab, meta) || getHeatmapProjectionTabId() || null;
    const session = tabId
      ? getHeatmapSession(tabId, {
          ...(meta || {}),
          tabId,
          reason: meta?.reason || 'heatmap-deactivate-session'
        }, { create: false })
      : getActiveHeatmapSessionForState();
    const ownerRoot = session?.root
      || Shared.workspaceTabs?.getMountedRoot?.(tabId || null, 'heatmap')
      || null;
    const ownerSvg = heatmapNodeBelongsToRoot(session?.refs?.svg, ownerRoot)
      ? session.refs.svg
      : ownerRoot?.querySelector?.('#heatmapSvg') || null;
    const ownerSvgBox = heatmapNodeBelongsToRoot(session?.refs?.svgBox, ownerRoot)
      ? session.refs.svgBox
      : ownerSvg?.closest?.('.svgbox') || null;

    clearHiddenDrawFlushHandle(session);
    scheduleHeatmapFontRefresh.clear(tabId);
    scheduleHeatmapResizeRefresh.clear(tabId);
    scheduleHeatmapCanvasLiveResizeProjection.clear(tabId);
    markHeatmapCanvasResizeReuse(false, ownerSvg);
    clearHeatmapCanvasLiveResizeProjection(ownerSvg);
    if(ownerSvgBox?.dataset){
      delete ownerSvgBox.dataset.heatmapResizeActive;
      delete ownerSvgBox.dataset.heatmapResizeObserveMutedUntil;
    }
    if(session){
      session.state.drawPending = false;
      updateHeatmapDrawRuntime(session, runtime => {
        runtime.pendingDrawOptions = {};
        runtime.deferredHiddenDrawOptions = null;
        runtime.token = (Number(runtime.token) || 0) + 1;
      }, { seedFromActive: isHeatmapSessionActiveForModuleState(session) });
    }
    disconnectHeatmapProjectionObservers(ownerRoot);
    debugLog('Debug: heatmap tab deactivated', {
      tabId,
      drawToken: session?.timers?.drawRuntime?.token ?? state.drawToken,
      reason: meta?.reason || 'deactivate-tab'
    });
    return true;
  }

  heatmap.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: heatmap,
    componentKey: 'heatmap',
    cancel: deactivateHeatmapOwner
  }) || deactivateHeatmapOwner;

  heatmap.disposeTab = function disposeHeatmapTab(tab, meta = {}){
    const tabId = normalizeHeatmapSessionTabId(tab, meta);
    if(!tabId){
      return false;
    }
    const session = getHeatmapSession(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'heatmap-dispose-session'
    }, { create: false });
    deactivateHeatmapOwner(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'dispose-tab'
    });
    heatmapDataToolbarLastActivationByTabId.delete(tabId);
    session?.workers?.clear?.();
    session?.listeners?.clear?.();
    if(projectedHeatmapSession?.tabId === tabId){
      projectedHeatmapSession = null;
      heatmap.__boundTabId = null;
      if(!session?.root || state.root === session.root){
        state.root = null;
        state.hot = null;
        state.svg = null;
        state.svgBox = null;
        state.statsEl = null;
        state.layout = null;
        state.emptyPlotNoticeEl = null;
        notesState.control = null;
        replaceHeatmapActiveControlRefs(null);
      }
    }
    heatmapSessionsByTabId.delete(tabId);
    debugLog('Debug: heatmap tab disposed', {
      tabId,
      reason: meta?.reason || 'dispose-tab'
    });
    return true;
  };

  function detachChildren(node){
    if(!node){ return null; }
    const doc = node.ownerDocument || global.document;
    const fragment = doc?.createDocumentFragment ? doc.createDocumentFragment() : null;
    if(!fragment){ return null; }
    let count = 0;
    while(node.firstChild){
      fragment.appendChild(node.firstChild);
      count += 1;
    }
    return { fragment, count };
  }

  function restoreChildren(node, payload){
    if(!node || !payload || !payload.fragment){ return false; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  const HEATMAP_SVG_ROOT_ATTRIBUTES = Object.freeze([
    'viewBox',
    'preserveAspectRatio',
    HEATMAP_RENDER_COMPLETE_ATTRIBUTE,
    HEATMAP_RENDER_STATE_ATTRIBUTE,
    'data-heatmap-model-type',
    'data-heatmap-cell-render-mode'
  ]);
  const HEATMAP_SVG_ROOT_STYLES = Object.freeze(['display']);

  function captureHeatmapSvgRootState(svg){
    if(!svg){
      return null;
    }
    const attributes = {};
    const style = {};
    for(const name of HEATMAP_SVG_ROOT_ATTRIBUTES){
      const value = svg.getAttribute?.(name);
      if(value){
        attributes[name] = value;
      }
    }
    for(const name of HEATMAP_SVG_ROOT_STYLES){
      const value = svg.style?.[name];
      if(value){
        style[name] = value;
      }
    }
    return {
      attributes: Object.keys(attributes).length ? attributes : null,
      style: Object.keys(style).length ? style : null
    };
  }

  function restoreHeatmapSvgRootState(svg, snapshot){
    if(!svg){
      return false;
    }
    for(const name of HEATMAP_SVG_ROOT_ATTRIBUTES){
      svg.removeAttribute?.(name);
    }
    if(svg.style){
      for(const name of HEATMAP_SVG_ROOT_STYLES){
        svg.style[name] = '';
      }
    }
    const attributes = snapshot?.attributes && typeof snapshot.attributes === 'object'
      ? snapshot.attributes
      : null;
    const style = snapshot?.style && typeof snapshot.style === 'object'
      ? snapshot.style
      : null;
    if(attributes){
      for(const name of HEATMAP_SVG_ROOT_ATTRIBUTES){
        const value = attributes[name];
        if(value != null && value !== ''){
          svg.setAttribute?.(name, String(value));
        }
      }
    }
    if(style && svg.style){
      for(const name of HEATMAP_SVG_ROOT_STYLES){
        const value = style[name];
        if(value != null && value !== ''){
          svg.style[name] = String(value);
        }
      }
    }
    return true;
  }

  function resolveHeatmapRenderCacheForPreview(tab){
    const candidates = [
      tab?.renderCache?.cache,
      tab?.renderCache,
      tab?.archiveRenderCache?.cache,
      tab?.archiveRenderCache
    ];
    return candidates.find(candidate => candidate && typeof candidate === 'object' && (
      candidate.plot?.fragment
      || candidate.svg?.fragment
      || candidate.graph?.fragment
      || candidate.preview?.fragment
    )) || null;
  }

  function reconstructHeatmapPreviewSvgFromCache(tab){
    const cache = resolveHeatmapRenderCacheForPreview(tab);
    if(!cache){
      return null;
    }
    const payload = cache.plot || cache.svg || cache.graph || cache.preview || null;
    const fragment = payload?.fragment || null;
    if(!fragment || typeof fragment.cloneNode !== 'function'){
      return null;
    }
    try{
      const doc = global.document;
      const cachedSvg = fragment.querySelector?.('#heatmapSvg, svg') || null;
      if(cachedSvg && typeof cachedSvg.innerHTML === 'string' && cachedSvg.innerHTML.trim()){
        return cachedSvg;
      }
      if(!doc || typeof doc.createElementNS !== 'function'){
        return null;
      }
      const reconstructed = doc.createElementNS(NS, 'svg');
      reconstructed.setAttribute('id', 'heatmapSvg');
      reconstructed.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const svgRootState = cache.svgRootState || tab?.renderCache?.cache?.svgRootState || tab?.archiveRenderCache?.cache?.svgRootState || null;
      const rootAttributes = svgRootState?.attributes && typeof svgRootState.attributes === 'object'
        ? svgRootState.attributes
        : null;
      if(rootAttributes){
        Object.entries(rootAttributes).forEach(([name, value]) => {
          if(value != null && value !== ''){
            reconstructed.setAttribute(name, String(value));
          }
        });
      }
      const clonedFragment = fragment.cloneNode(true);
      reconstructed.appendChild(clonedFragment);
      if(!reconstructed.getAttribute('viewBox')){
        const scene = reconstructed.querySelector?.('[data-heatmap-scene-width][data-heatmap-scene-height]') || null;
        const sceneWidth = Number(scene?.getAttribute?.('data-heatmap-scene-width'));
        const sceneHeight = Number(scene?.getAttribute?.('data-heatmap-scene-height'));
        const layoutWidth = Number(tab?.layoutState?.graph?.widthPx || tab?.layout?.graphWidthPx || tab?.previewMeta?.width);
        const layoutHeight = Number(tab?.layoutState?.graph?.heightPx || tab?.layout?.graphHeightPx || tab?.previewMeta?.height);
        const width = Number.isFinite(sceneWidth) && sceneWidth > 0
          ? sceneWidth
          : (Number.isFinite(layoutWidth) && layoutWidth > 0 ? layoutWidth : 427);
        const height = Number.isFinite(sceneHeight) && sceneHeight > 0
          ? sceneHeight
          : (Number.isFinite(layoutHeight) && layoutHeight > 0 ? layoutHeight : 427);
        reconstructed.setAttribute('viewBox', `0 0 ${width} ${height}`);
      }
      reconstructed.setAttribute('data-workspace-tab-id', String(tab?.id || ''));
      reconstructed.setAttribute('data-preview-cache-source', 'heatmap');
      return typeof reconstructed.innerHTML === 'string' && reconstructed.innerHTML.trim()
        ? reconstructed
        : null;
    }catch(err){
      debugLog('Debug: heatmap preview cache reconstruct error', {
        tabId: tab?.id || null,
        message: err?.message || String(err)
      });
      return null;
    }
  }

  function resolveHeatmapPreviewSourceSvg(tab){
    // Read-only preview source. Inactive previews use only their mounted owner root or
    // owner-scoped render cache; they never fall back to the currently projected Heatmap DOM.
    const activeTabId = global.Main?.session?.workspaceState?.activeTabId || null;
    const targetTabId = tab?.id || null;
    if(targetTabId && targetTabId !== activeTabId){
      const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(targetTabId, 'heatmap') || null;
      const mountedSvg = mountedRoot?.querySelector?.('#heatmapSvg, .svgbox svg') || null;
      if(mountedSvg && typeof mountedSvg.innerHTML === 'string' && mountedSvg.innerHTML.trim()){
        return mountedSvg;
      }
      return reconstructHeatmapPreviewSvgFromCache(tab);
    }
    if(!targetTabId || targetTabId === activeTabId){
      const session = targetTabId
        ? getHeatmapSession(targetTabId, { tabId: targetTabId, reason: 'heatmap-preview-source' }, { create: false })
        : getActiveHeatmapSessionForState();
      const ownerRoot = session?.root || resolveHeatmapRoot(targetTabId || null) || null;
      const sessionSvg = heatmapNodeBelongsToRoot(session?.refs?.svg, ownerRoot) ? session.refs.svg : null;
      const rootSvg = ownerRoot?.querySelector?.('#heatmapSvg, .svgbox svg') || null;
      const projectedSvg = heatmapNodeBelongsToRoot(state.svg, ownerRoot) ? state.svg : null;
      const liveSvg = sessionSvg || rootSvg || projectedSvg;
      if(liveSvg && typeof liveSvg.innerHTML === 'string' && liveSvg.innerHTML.trim()){
        return liveSvg;
      }
    }
    return null;
  }

  function copyHeatmapCanvasPixels(sourceRoot, targetRoot){
    const sourceCanvases = Array.from(sourceRoot?.querySelectorAll?.('canvas') || []);
    const targetCanvases = Array.from(targetRoot?.querySelectorAll?.('canvas') || []);
    if(!sourceCanvases.length || sourceCanvases.length !== targetCanvases.length){
      return false;
    }
    for(let index = 0; index < sourceCanvases.length; index += 1){
      const source = sourceCanvases[index];
      const target = targetCanvases[index];
      const width = Math.max(1, Number(source?.width) || 1);
      const height = Math.max(1, Number(source?.height) || 1);
      const ctx = target?.getContext?.('2d');
      if(!ctx || typeof ctx.drawImage !== 'function'){
        return false;
      }
      target.width = width;
      target.height = height;
      target.setAttribute?.('width', String(width));
      target.setAttribute?.('height', String(height));
      target.style.width = source.style?.width || target.style?.width || '100%';
      target.style.height = source.style?.height || target.style?.height || '100%';
      try{
        ctx.clearRect?.(0, 0, width, height);
        ctx.drawImage(source, 0, 0);
      }catch(err){
        debugLog('Debug: heatmap preview canvas copy failed', {
          index,
          message: err?.message || String(err)
        });
        return false;
      }
    }
    return true;
  }


  function encodeHeatmapPreviewCanvas(canvas){
    if(!canvas || typeof canvas.toDataURL !== 'function'){
      return '';
    }
    try{
      const webp = canvas.toDataURL('image/webp', 0.82);
      if(typeof webp === 'string' && webp.startsWith('data:image/webp')){
        return webp;
      }
    }catch(_err){ /* PNG fallback below */ }
    try{
      return canvas.toDataURL('image/png');
    }catch(_err){
      return '';
    }
  }

  function heatmapCanvasToPreviewDataUrl(canvas, maxDimension = 180){
    if(!canvas || typeof canvas.toDataURL !== 'function'){
      return '';
    }
    const sourceWidth = Math.max(1, Number(canvas.width) || 1);
    const sourceHeight = Math.max(1, Number(canvas.height) || 1);
    const scale = Math.min(1, Math.max(1, Number(maxDimension) || 180) / Math.max(sourceWidth, sourceHeight));
    if(scale >= 0.999){
      return encodeHeatmapPreviewCanvas(canvas);
    }
    const doc = canvas.ownerDocument || global.document;
    const previewCanvas = doc?.createElement?.('canvas') || null;
    if(!previewCanvas){
      return '';
    }
    previewCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
    previewCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = previewCanvas.getContext?.('2d');
    if(!ctx || typeof ctx.drawImage !== 'function'){
      return '';
    }
    try{
      ctx.clearRect?.(0, 0, previewCanvas.width, previewCanvas.height);
      ctx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
      return encodeHeatmapPreviewCanvas(previewCanvas);
    }catch(_err){
      return '';
    }
  }

  function materializeHeatmapPreviewBitmaps(sourceRoot, cloneRoot){
    if(!sourceRoot || !cloneRoot || typeof cloneRoot.querySelectorAll !== 'function'){
      return 0;
    }
    const sourceCanvases = Array.from(sourceRoot.querySelectorAll?.('canvas') || []);
    const cloneCanvases = Array.from(cloneRoot.querySelectorAll?.('canvas') || []);
    const count = Math.min(sourceCanvases.length, cloneCanvases.length);
    let materialized = 0;
    for(let index = 0; index < count; index += 1){
      const sourceCanvas = sourceCanvases[index];
      const cloneCanvas = cloneCanvases[index];
      const parent = cloneCanvas?.parentNode || null;
      const dataUrl = heatmapCanvasToPreviewDataUrl(sourceCanvas);
      if(!parent || !dataUrl){
        continue;
      }
      const doc = cloneCanvas.ownerDocument || global.document;
      const image = doc?.createElement?.('img') || null;
      if(!image){
        continue;
      }
      image.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      image.setAttribute('src', dataUrl);
      image.setAttribute('data-preview-canvas-bitmap', 'true');
      image.setAttribute('width', cloneCanvas.getAttribute?.('width') || String(sourceCanvas.width || 1));
      image.setAttribute('height', cloneCanvas.getAttribute?.('height') || String(sourceCanvas.height || 1));
      const style = cloneCanvas.getAttribute?.('style');
      if(style){ image.setAttribute('style', style); }
      image.style.display = cloneCanvas.style?.display || 'block';
      image.style.width = cloneCanvas.style?.width || '100%';
      image.style.height = cloneCanvas.style?.height || '100%';
      image.style.background = cloneCanvas.style?.background || 'transparent';
      image.style.pointerEvents = 'none';
      parent.replaceChild(image, cloneCanvas);
      materialized += 1;
    }
    Array.from(cloneRoot.querySelectorAll?.('img[data-graphitix-render-cache-canvas-bitmap="true"]') || []).forEach(image => {
      image.removeAttribute('data-graphitix-render-cache-canvas-bitmap');
      image.setAttribute('data-preview-canvas-bitmap', 'true');
      materialized += 1;
    });
    if(materialized){
      cloneRoot.setAttribute?.('data-preview-canvas-bitmap', String(materialized));
    }
    return materialized;
  }

  function readHeatmapLayerNumber(layer, name, fallback = NaN){
    const value = Number(layer?.getAttribute?.(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function resolveHeatmapCanvasVectorExportState(sourceLayer){
    if(sourceLayer?.__heatmapCanvasVectorExportState){
      return sourceLayer.__heatmapCanvasVectorExportState;
    }
    const sourceSvg = sourceLayer?.closest?.('svg') || null;
    const ownerTabId = String(
      sourceSvg?.dataset?.fontTabId
      || sourceSvg?.dataset?.workspaceTabId
      || sourceLayer?.closest?.('[data-workspace-tab-id]')?.getAttribute?.('data-workspace-tab-id')
      || ''
    ).trim();
    const session = ownerTabId
      ? getHeatmapSession(ownerTabId, { tabId: ownerTabId, reason: 'heatmap-vector-export-owner' }, { create: false })
      : getActiveHeatmapSessionForState();
    if(ownerTabId && !session){
      return null;
    }
    const runtime = getHeatmapRenderRuntime(session, { seedFromActive: !ownerTabId && !session });
    const model = runtime?.lastRenderModel || getHeatmapActiveRenderModel(session);
    const viewOptions = runtime?.lastViewOptions || state.lastViewOptions;
    const payload = model?.type === 'values' && viewOptions
      ? buildDrawPayloadFromModel(model, viewOptions)
      : null;
    if(!payload || payload.modelType !== 'values'){
      return null;
    }
    const rowCount = payload.orderedRowLabels.length;
    const columnCount = payload.orderedColumnLabels.length;
    const cellSize = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-cell-size', payload.cellSize);
    const cellWidth = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-cell-width', cellSize);
    const cellHeight = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-cell-height', cellSize);
    const dataStartX = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-data-start-x', 0);
    const dataStartY = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-data-start-y', 0);
    return {
      orderedCells: payload.orderedCells,
      rowCount,
      columnCount,
      cellSize,
      cellWidth,
      cellHeight,
      dataStartX,
      dataStartY,
      heatmapWidth: readHeatmapLayerNumber(sourceLayer, 'data-heatmap-width', columnCount * cellWidth),
      heatmapHeight: readHeatmapLayerNumber(sourceLayer, 'data-heatmap-height', rowCount * cellHeight),
      cellValueFontSize: readHeatmapLayerNumber(sourceLayer, 'data-heatmap-cell-font-size', Math.max(4, Math.floor(Math.min(cellWidth, cellHeight) * 0.7))),
      showCellText: sourceLayer?.getAttribute?.('data-heatmap-show-cell-text') === 'true',
      showCellGrid: sourceLayer?.getAttribute?.('data-heatmap-show-cell-grid') === 'true'
    };
  }

  function buildHeatmapCellPathSegment(x, y, width, height){
    return `M${formatHeatmapExportNumber(x)} ${formatHeatmapExportNumber(y)}h${formatHeatmapExportNumber(width)}v${formatHeatmapExportNumber(height)}h-${formatHeatmapExportNumber(width)}Z`;
  }

  function populateHeatmapVectorCellLayer(sourceLayer, cloneLayer){
    const vectorState = resolveHeatmapCanvasVectorExportState(sourceLayer);
    const doc = cloneLayer?.ownerDocument || global.document;
    if(!vectorState || !cloneLayer || !doc){
      return false;
    }
    while(cloneLayer.firstChild){
      cloneLayer.removeChild(cloneLayer.firstChild);
    }
    const fillBuckets = new Map();
    const textFragment = doc.createDocumentFragment();
    let cellCount = 0;
    let textCount = 0;
    for(let rowIndex = 0; rowIndex < vectorState.rowCount; rowIndex += 1){
      for(let columnIndex = 0; columnIndex < vectorState.columnCount; columnIndex += 1){
        const cell = vectorState.orderedCells[rowIndex]?.[columnIndex] || {};
        const x = vectorState.dataStartX + columnIndex * vectorState.cellWidth;
        const y = vectorState.dataStartY + rowIndex * vectorState.cellHeight;
        const fill = cell.fill || '#d0d0d0';
        let segments = fillBuckets.get(fill);
        if(!segments){
          segments = [];
          fillBuckets.set(fill, segments);
        }
        segments.push(buildHeatmapCellPathSegment(x, y, vectorState.cellWidth, vectorState.cellHeight));
        cellCount += 1;
        const cellText = String(cell.displayText || '').trim();
        if(vectorState.showCellText && cellText){
          const text = doc.createElementNS(NS, 'text');
          text.setAttribute('x', formatHeatmapSvgNumber(x + vectorState.cellWidth / 2));
          text.setAttribute('y', formatHeatmapSvgNumber(y + vectorState.cellHeight / 2));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('font-size', String(vectorState.cellValueFontSize));
          text.setAttribute('fill', textColorForBackground(fill));
          text.setAttribute('data-heatmap-cell-value', '1');
          text.setAttribute('data-font-role', 'cellValue');
          text.setAttribute('data-font-key', `cell-${rowIndex}-${columnIndex}`);
          text.textContent = cellText;
          textFragment.appendChild(text);
          textCount += 1;
        }
      }
    }
    const pathFragment = doc.createDocumentFragment();
    fillBuckets.forEach((segments, fill) => {
      if(!segments.length){
        return;
      }
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute('d', segments.join(''));
      path.setAttribute('fill', fill);
      if(vectorState.showCellGrid){
        path.setAttribute('stroke', '#fff');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
      }
      path.setAttribute('data-heatmap-vector-cell-bucket', '1');
      pathFragment.appendChild(path);
    });
    cloneLayer.appendChild(pathFragment);
    cloneLayer.appendChild(textFragment);
    cloneLayer.setAttribute('data-render-mode', 'vector-export');
    cloneLayer.setAttribute('data-heatmap-vector-cell-count', String(cellCount));
    cloneLayer.setAttribute('data-heatmap-vector-text-count', String(textCount));
    cloneLayer.removeAttribute('data-resize-reused');
    return cellCount > 0;
  }

  function resolveHeatmapRasterExportHref(sourceLayer){
    const canvas = sourceLayer?.querySelector?.('canvas') || null;
    if(canvas && typeof canvas.toDataURL === 'function'){
      try{
        return canvas.toDataURL('image/png');
      }catch(err){
        debugLog('Debug: heatmap raster export canvas serialization failed', {
          message: err?.message || String(err)
        });
      }
    }
    const image = sourceLayer?.querySelector?.(
      'img[data-graphitix-render-cache-canvas-bitmap="true"], img[data-preview-canvas-bitmap="true"], image'
    ) || null;
    return image?.getAttribute?.('src')
      || image?.getAttribute?.('href')
      || image?.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
      || null;
  }

  function populateHeatmapRasterImageCellLayer(sourceLayer, cloneLayer){
    const doc = cloneLayer?.ownerDocument || global.document;
    const href = resolveHeatmapRasterExportHref(sourceLayer);
    if(!doc || !cloneLayer || !href){
      return false;
    }
    const dataStartX = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-data-start-x', 0);
    const dataStartY = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-data-start-y', 0);
    const heatmapWidth = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-width', 0);
    const heatmapHeight = readHeatmapLayerNumber(sourceLayer, 'data-heatmap-height', 0);
    if(!(heatmapWidth > 0) || !(heatmapHeight > 0)){
      return false;
    }
    while(cloneLayer.firstChild){
      cloneLayer.removeChild(cloneLayer.firstChild);
    }
    const image = doc.createElementNS(NS, 'image');
    image.setAttribute('x', formatHeatmapSvgNumber(dataStartX));
    image.setAttribute('y', formatHeatmapSvgNumber(dataStartY));
    image.setAttribute('width', formatHeatmapSvgNumber(heatmapWidth));
    image.setAttribute('height', formatHeatmapSvgNumber(heatmapHeight));
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('href', href);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    image.setAttribute('data-heatmap-raster-export', '1');
    cloneLayer.appendChild(image);
    cloneLayer.setAttribute('data-render-mode', 'raster-export');
    cloneLayer.removeAttribute('data-resize-reused');
    return true;
  }

  function sampleHeatmapPreviewNodes(nodes, maxCount){
    const items = Array.from(nodes || []);
    const limit = Math.max(2, Math.floor(Number(maxCount) || 0));
    if(items.length <= limit){
      return 0;
    }
    const retained = new Set();
    for(let sampleIndex = 0; sampleIndex < limit; sampleIndex += 1){
      retained.add(Math.round((sampleIndex * (items.length - 1)) / (limit - 1)));
    }
    let removed = 0;
    items.forEach((node, index) => {
      if(retained.has(index)){
        return;
      }
      node.remove?.();
      removed += 1;
    });
    return removed;
  }

  function sampleHeatmapPreviewPathBranches(path, maxCount){
    const d = String(path?.getAttribute?.('d') || '').trim();
    const branches = d ? d.split(/(?=M\s*[-+.\d])/i).map(value => value.trim()).filter(Boolean) : [];
    const limit = Math.max(2, Math.floor(Number(maxCount) || 0));
    if(branches.length <= limit){
      return 0;
    }
    const retained = [];
    const seen = new Set();
    for(let sampleIndex = 0; sampleIndex < limit; sampleIndex += 1){
      const branchIndex = Math.round((sampleIndex * (branches.length - 1)) / Math.max(1, limit - 1));
      if(!seen.has(branchIndex)){
        seen.add(branchIndex);
        retained.push(branches[branchIndex]);
      }
    }
    path.setAttribute('d', retained.join(' '));
    path.setAttribute('data-preview-source-branch-count', String(branches.length));
    path.setAttribute('data-preview-branch-count', String(retained.length));
    return branches.length - retained.length;
  }


  function resolveHeatmapPreviewViewBox(svg){
    const raw = String(svg?.getAttribute?.('viewBox') || '').trim();
    const values = raw.split(/[\s,]+/).map(Number);
    if(values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0){
      return { x: values[0], y: values[1], width: values[2], height: values[3] };
    }
    const width = Number(svg?.getAttribute?.('width')) || Number(svg?.clientWidth) || 427;
    const height = Number(svg?.getAttribute?.('height')) || Number(svg?.clientHeight) || 427;
    return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) };
  }

  function simplifyHeavyHeatmapPreview(svg){
    const canvasCellLayer = svg?.querySelector?.('[data-export-layer="heatmap-cells"][data-render-mode="canvas"]');
    if(!canvasCellLayer){
      return false;
    }
    const removedRowLabels = sampleHeatmapPreviewNodes(
      svg.querySelectorAll?.('[data-layer="row-labels"] > text'),
      HEATMAP_PREVIEW_MAX_ROW_LABELS
    );
    const removedColumnLabels = sampleHeatmapPreviewNodes(
      svg.querySelectorAll?.('[data-layer="column-labels"] > text'),
      HEATMAP_PREVIEW_MAX_COLUMN_LABELS
    );
    let removedDendrogramPaths = 0;
    let removedDendrogramBranches = 0;
    Array.from(svg.querySelectorAll?.('.heatmap-dendrogram') || []).forEach(group => {
      const paths = Array.from(group.querySelectorAll?.('path') || []);
      if(paths.length === 1){
        removedDendrogramBranches += sampleHeatmapPreviewPathBranches(
          paths[0],
          HEATMAP_PREVIEW_MAX_DENDROGRAM_SEGMENTS
        );
        return;
      }
      removedDendrogramPaths += sampleHeatmapPreviewNodes(
        paths,
        HEATMAP_PREVIEW_MAX_DENDROGRAM_SEGMENTS
      );
    });
    svg.setAttribute('data-heatmap-preview-projection', 'canvas-sampled');
    svg.setAttribute('data-heatmap-preview-removed-row-labels', String(removedRowLabels));
    svg.setAttribute('data-heatmap-preview-removed-column-labels', String(removedColumnLabels));
    svg.setAttribute('data-heatmap-preview-removed-dendrogram-paths', String(removedDendrogramPaths));
    svg.setAttribute('data-heatmap-preview-removed-dendrogram-branches', String(removedDendrogramBranches));
    return true;
  }

  function resolveHeatmapProjectionDimensions(sourceSvg){
    const viewBox = resolveHeatmapPreviewViewBox(sourceSvg);
    const svgBox = sourceSvg?.closest?.('.svgbox') || null;
    const resizerWidth = Number.parseFloat(svgBox?.dataset?.resizerWidth || '');
    const resizerHeight = Number.parseFloat(svgBox?.dataset?.resizerHeight || '');
    const styleWidth = Number.parseFloat(svgBox?.style?.width || '');
    const styleHeight = Number.parseFloat(svgBox?.style?.height || '');
    const panelWidth = (Number.isFinite(resizerWidth) && resizerWidth > 0 ? resizerWidth : null)
      || (Number.isFinite(styleWidth) && styleWidth > 0 ? styleWidth : null)
      || (Number(sourceSvg?.clientWidth) > 0 ? Number(sourceSvg.clientWidth) : null)
      || viewBox.width
      || 427;
    const panelHeight = (Number.isFinite(resizerHeight) && resizerHeight > 0 ? resizerHeight : null)
      || (Number.isFinite(styleHeight) && styleHeight > 0 ? styleHeight : null)
      || (Number(sourceSvg?.clientHeight) > 0 ? Number(sourceSvg.clientHeight) : null)
      || viewBox.height
      || 427;
    return {
      viewBox,
      panelWidth: Math.max(1, panelWidth),
      panelHeight: Math.max(1, panelHeight)
    };
  }

  function cloneHeatmapSvgProjection(sourceSvg, options = {}){
    if(!sourceSvg || typeof sourceSvg.cloneNode !== 'function'){
      return null;
    }
    const { viewBox, panelWidth, panelHeight } = resolveHeatmapProjectionDimensions(sourceSvg);
    const clone = sourceSvg.cloneNode(true);
    if(clone.dataset){
      delete clone.dataset.heatmapCanvasResizeReuse;
      delete clone.dataset.heatmapLiveResizeProjection;
    }
    clone.querySelectorAll?.('[data-resize-reused]')?.forEach?.(node => node.removeAttribute('data-resize-reused'));
    if(clone.style){
      clone.style.width = '';
      clone.style.height = '';
    }
    const preserveAspect = String(sourceSvg.getAttribute?.('preserveAspectRatio') || 'xMidYMid meet').trim().toLowerCase();
    const stretched = preserveAspect === 'none';
    const dimensionsDiffer = Math.abs(panelWidth - viewBox.width) > 0.5
      || Math.abs(panelHeight - viewBox.height) > 0.5;
    if(stretched && dimensionsDiffer && viewBox.width > 0 && viewBox.height > 0){
      const scaleX = panelWidth / viewBox.width;
      const scaleY = panelHeight / viewBox.height;
      const doc = sourceSvg.ownerDocument || global.document;
      const wrapper = doc?.createElementNS?.(NS, 'g') || null;
      if(!wrapper){
        return null;
      }
      wrapper.setAttribute(
        'transform',
        `matrix(${formatHeatmapExportNumber(scaleX)},0,0,${formatHeatmapExportNumber(scaleY)},${formatHeatmapExportNumber(-viewBox.x * scaleX)},${formatHeatmapExportNumber(-viewBox.y * scaleY)})`
      );
      while(clone.firstChild){
        wrapper.appendChild(clone.firstChild);
      }
      clone.appendChild(wrapper);
      clone.setAttribute('viewBox', `0 0 ${formatHeatmapExportNumber(panelWidth)} ${formatHeatmapExportNumber(panelHeight)}`);
    }
    clone.setAttribute('width', String(Math.round(panelWidth)));
    clone.setAttribute('height', String(Math.round(panelHeight)));
    const ownerTabId = String(
      options.ownerTabId
      || sourceSvg.dataset?.fontTabId
      || sourceSvg.dataset?.workspaceTabId
      || ''
    ).trim();
    if(ownerTabId){
      clone.setAttribute('data-workspace-tab-id', ownerTabId);
      if(options.projectionType === 'preview'){
        clone.setAttribute('data-preview-owner-tab-id', ownerTabId);
      }
      if(clone.dataset){
        clone.dataset.fontTabId = ownerTabId;
        clone.dataset.workspaceTabId = ownerTabId;
      }
    }
    return clone;
  }

  function sanitizeHeatmapPreviewInteractions(svg){
    if(!svg || typeof svg.querySelectorAll !== 'function'){
      return { removedOverlays: 0, sanitizedOwners: 0 };
    }
    let removedOverlays = 0;
    let sanitizedOwners = 0;
    Array.from(svg.querySelectorAll('[data-heatmap-cell-hit-layer="1"]')).forEach(node => {
      node.remove?.();
      removedOverlays += 1;
    });
    Array.from(svg.querySelectorAll('[data-dendrogram-control="1"]')).forEach(node => {
      const tagName = String(node?.tagName || '').toLowerCase();
      if(tagName === 'rect'){
        node.remove?.();
        removedOverlays += 1;
        return;
      }
      node.removeAttribute?.('data-dendrogram-control');
      if(node.style?.cursor === 'pointer'){
        node.style.removeProperty('cursor');
      }
      if(!String(node.getAttribute?.('style') || '').trim()){
        node.removeAttribute?.('style');
      }
      sanitizedOwners += 1;
    });
    return { removedOverlays, sanitizedOwners };
  }

  function buildHeatmapPreviewSvgFromSource(sourceSvg, options = {}){
    const clone = cloneHeatmapSvgProjection(sourceSvg, {
      ownerTabId: options.ownerTabId,
      projectionType: 'preview'
    });
    if(!clone){
      return null;
    }
    const previewBitmapCount = materializeHeatmapPreviewBitmaps(sourceSvg, clone);
    if(previewBitmapCount){
      clone.setAttribute('data-preview-canvas-bitmap', String(previewBitmapCount));
    }else{
      // Canvas pixels cannot survive XML serialization. Retain this copy only for callers
      // that consume the DOM projection directly rather than serialized markup.
      copyHeatmapCanvasPixels(sourceSvg, clone);
    }
    clone.setAttribute('data-preview-source', 'true');
    const interactionCleanup = sanitizeHeatmapPreviewInteractions(clone);
    clone.setAttribute('data-heatmap-preview-removed-interaction-overlays', String(interactionCleanup.removedOverlays));
    clone.setAttribute('data-heatmap-preview-sanitized-interaction-owners', String(interactionCleanup.sanitizedOwners));
    if(options.simplifyHeavy === true){
      simplifyHeavyHeatmapPreview(clone);
    }
    return clone;
  }

  function buildHeatmapExportSvgFromSource(sourceSvg, options = {}){
    const clone = cloneHeatmapSvgProjection(sourceSvg, {
      ownerTabId: options.ownerTabId,
      projectionType: 'export'
    });
    if(!clone){
      return null;
    }
    populateHeatmapExportLabelGroups(sourceSvg, clone);
    const sourceLayers = Array.from(sourceSvg.querySelectorAll?.(
      '[data-export-layer="heatmap-cells"][data-render-mode="canvas"]'
    ) || []);
    const cloneLayers = Array.from(clone.querySelectorAll?.(
      '[data-export-layer="heatmap-cells"][data-render-mode="canvas"]'
    ) || []);
    const count = Math.min(sourceLayers.length, cloneLayers.length);
    let vectorLayerCount = 0;
    let rasterLayerCount = 0;
    for(let index = 0; index < count; index += 1){
      if(populateHeatmapVectorCellLayer(sourceLayers[index], cloneLayers[index])){
        vectorLayerCount += 1;
      }else if(populateHeatmapRasterImageCellLayer(sourceLayers[index], cloneLayers[index])){
        rasterLayerCount += 1;
      }
    }
    const convertedCount = vectorLayerCount + rasterLayerCount;
    if(sourceLayers.length && convertedCount !== sourceLayers.length){
      debugLog('Debug: heatmap export projection incomplete', {
        sourceLayers: sourceLayers.length,
        cloneLayers: cloneLayers.length,
        vectorLayerCount,
        rasterLayerCount
      });
      return null;
    }
    const projection = !sourceLayers.length
      ? 'svg'
      : (rasterLayerCount ? 'raster-matrix-fallback' : 'vector-matrix');
    clone.setAttribute('data-heatmap-export-projection', projection);
    return clone;
  }

  heatmap.getPreviewSvg = function getPreviewSvg(tab){
    const sourceSvg = resolveHeatmapPreviewSourceSvg(tab);
    if(!sourceSvg){ return null; }
    return buildHeatmapPreviewSvgFromSource(sourceSvg, {
      simplifyHeavy: true,
      ownerTabId: tab?.id || sourceSvg.dataset?.fontTabId || sourceSvg.dataset?.workspaceTabId || null
    });
  };

  heatmap.getExportSvg = function getExportSvg(){
    const sourceSvg = resolveHeatmapPreviewSourceSvg();
    if(!sourceSvg){ return null; }
    return buildHeatmapExportSvgFromSource(sourceSvg, {
      ownerTabId: getHeatmapProjectionTabId() || sourceSvg.dataset?.fontTabId || null
    });
  };


  function resolveHeatmapRenderCacheSession(meta = {}, options = {}){
    const source = meta && typeof meta === 'object' ? meta : {};
    if(source.session){
      return ensureHeatmapSessionOwnershipShape(source.session);
    }
    const tabLike = source.tab || source.tabId || source.workspaceTabId || null;
    if(tabLike){
      return getHeatmapSession(tabLike, {
        ...source,
        reason: source.reason || 'heatmap-render-cache-session'
      }, { create: options.create === true });
    }
    return options.fallbackActive === false ? null : getActiveHeatmapSessionForState();
  }

  function resolveHeatmapRenderCacheTargets(meta = {}, options = {}){
    const session = resolveHeatmapRenderCacheSession(meta, options);
    const tabId = session?.tabId || normalizeHeatmapSessionTabId(meta?.tab || meta?.tabId || null, meta) || null;
    const explicitRoot = meta?.root && typeof meta.root.querySelector === 'function' ? meta.root : null;
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tabId, 'heatmap') || null;
    const root = explicitRoot
      || mountedRoot
      || session?.root
      || resolveHeatmapRoot(meta?.tab || tabId || null)
      || null;
    if(session && root){
      session.root = root;
      session.refs.root = root;
    }
    const svg = heatmapNodeBelongsToRoot(session?.refs?.svg, root)
      ? session.refs.svg
      : root?.querySelector?.('#heatmapSvg') || null;
    const stats = heatmapNodeBelongsToRoot(session?.refs?.statsEl, root)
      ? session.refs.statsEl
      : root?.querySelector?.('#heatmapStatsContent') || null;
    if(session){
      if(svg){ session.refs.svg = svg; }
      if(stats){ session.refs.statsEl = stats; }
    }
    return { session, tabId, root, svg, stats };
  }


  function isHeatmapOwnerContextCurrent(session, root, meta = {}){
    const owner = ensureHeatmapSessionOwnershipShape(session);
    const tabId = String(owner?.tabId || meta?.tabId || meta?.tab?.id || '').trim();
    if(!owner || !tabId || !root){
      return false;
    }
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tabId, 'heatmap') || null;
    if(mountedRoot && mountedRoot !== root){
      return false;
    }
    const workspaceActiveTabId = getHeatmapWorkspaceActiveTabId();
    if(workspaceActiveTabId && workspaceActiveTabId !== tabId){
      return false;
    }
    if(meta?.sessionGeneration && Shared.workspaceTabs?.isSessionCurrent){
      if(!Shared.workspaceTabs.isSessionCurrent('heatmap', tabId, meta.sessionGeneration)){
        return false;
      }
    }
    return true;
  }

  function isHeatmapExplicitOwnerOperation(meta = {}){
    return !!String(meta?.tabId || meta?.tab?.id || '').trim();
  }
  heatmap.captureRenderCache = function captureRenderCache(meta = {}){
    const { session: requestedSession, svg, stats } = resolveHeatmapRenderCacheTargets(meta, {
      create: false,
      fallbackActive: true
    });
    if(!requestedSession || !svg){
      debugLog('Debug: heatmap render cache capture skipped', {
        reason: !requestedSession ? 'missing-owner-session' : 'missing-owner-svg',
        tabId: meta?.tabId || meta?.tab?.id || null
      });
      return null;
    }
    if(!isHeatmapSessionActiveForModuleState(requestedSession)){
      debugLog('Debug: heatmap render cache capture skipped for inactive session', {
        tabId: requestedSession.tabId || null,
        reason: meta?.reason || 'capture-render-cache'
      });
      return null;
    }
    if(svg?.childElementCount > 0 && !hasRenderedHeatmapGraph(requestedSession)){
      debugLog('Debug: heatmap render cache capture skipped for incomplete frame', {
        tabId: requestedSession?.tabId || null,
        renderState: svg.getAttribute?.(HEATMAP_RENDER_STATE_ATTRIBUTE) || null
      });
      return null;
    }
    const svgCache = detachChildren(svg);
    const statsCache = detachChildren(stats);
    const renderState = captureHeatmapRenderStateSnapshot(requestedSession);
    const svgRootState = captureHeatmapSvgRootState(svg);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: heatmap render cache captured', {
        svgNodes: svgCache?.count || 0,
        statsNodes: statsCache?.count || 0,
        hasRenderState: !!renderState,
        hasSvgRootState: !!svgRootState,
        tabId: requestedSession?.tabId || null
      });
    }
    return { plot: svgCache, stats: statsCache, renderState, svgRootState };
  };

  heatmap.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    const { session, svg } = resolveHeatmapRenderCacheTargets(meta, { create: false, fallbackActive: true });
    const ownerCurrent = isHeatmapOwnerContextCurrent(session, session?.root || svg?.closest?.('#heatmapPage') || meta?.root || null, meta);
    const ownerAvailable = isHeatmapExplicitOwnerOperation(meta)
      ? ownerCurrent
      : !!session && !!svg && isHeatmapSessionActiveForModuleState(session);
    if(!session || !svg || !ownerAvailable){
      debugLog('Debug: heatmap render cache restore rejected for unavailable owner', {
        tabId: session?.tabId || meta?.tabId || meta?.tab?.id || null,
        hasSession: !!session,
        hasSvg: !!svg,
        ownerCurrent,
        projectedOwner: !!session && isHeatmapSessionActiveForModuleState(session),
        reason: meta?.reason || null
      });
      return false;
    }
    const sharedValid = Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'heatmap',
      graph: { selectors: ['#heatmapSvg', 'svg', 'canvas'], markupPattern: /(<svg\b|id=["']heatmapSvg["']|<canvas\b)/i },
      graphFallbackSections: ['stats'],
      requiredSections: [],
      requireGraph: true
    }) ?? !!cache;
    const heatmapComplete = sharedValid && hasCompleteHeatmapRenderCache(cache);
    if(sharedValid && !heatmapComplete){
      debugLog('Debug: heatmap render cache rejected as incomplete', {
        tabId: meta?.tabId || meta?.tab?.id || null,
        reason: meta?.reason || null
      });
    }
    return heatmapComplete;
  };

  function readHeatmapPositiveDimension(node, name){
    const attributeValue = Number(node?.getAttribute?.(name));
    if(Number.isFinite(attributeValue) && attributeValue > 0){
      return attributeValue;
    }
    const styleValue = Number.parseFloat(String(node?.style?.[name] || '').trim());
    if(Number.isFinite(styleValue) && styleValue > 0){
      return styleValue;
    }
    const rect = node?.getBoundingClientRect?.();
    const rectValue = Number(rect?.[name]);
    return Number.isFinite(rectValue) && rectValue > 0 ? rectValue : NaN;
  }

  function isHeatmapPaintedCanvas(canvas){
    if(!canvas || !(Number(canvas.width) > 1) || !(Number(canvas.height) > 1)){
      return false;
    }
    const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
    if(!ctx || typeof ctx.getImageData !== 'function'){
      return false;
    }
    const width = Math.max(1, Number(canvas.width) || 1);
    const height = Math.max(1, Number(canvas.height) || 1);
    const points = [
      [0, 0],
      [Math.floor((width - 1) / 2), Math.floor((height - 1) / 2)],
      [width - 1, height - 1],
      [Math.floor((width - 1) * 0.25), Math.floor((height - 1) * 0.75)],
      [Math.floor((width - 1) * 0.75), Math.floor((height - 1) * 0.25)]
    ];
    try{
      return points.some(([x, y]) => {
        const pixel = ctx.getImageData(x, y, 1, 1)?.data;
        return !!pixel && Number(pixel[3]) > 0;
      });
    }catch(_err){
      return false;
    }
  }

  function isHeatmapRestorableBitmapImage(image){
    if(!image){
      return false;
    }
    const src = String(
      image.getAttribute?.('src')
      || image.getAttribute?.('href')
      || image.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
      || ''
    ).trim();
    if(!src || !/^data:image\//i.test(src)){
      return false;
    }
    const width = readHeatmapPositiveDimension(image, 'width');
    const height = readHeatmapPositiveDimension(image, 'height');
    return Number.isFinite(width) && width > 1 && Number.isFinite(height) && height > 1;
  }

  function isHeatmapMatrixLayerVisuallyReady(cellLayer){
    if(!cellLayer){
      return false;
    }
    const rowCount = Number(cellLayer.getAttribute?.('data-heatmap-row-count'));
    const columnCount = Number(cellLayer.getAttribute?.('data-heatmap-column-count'));
    if(!(rowCount > 0) || !(columnCount > 0)){
      return false;
    }
    const mode = String(cellLayer.getAttribute?.('data-render-mode') || '').trim().toLowerCase();
    if(mode === 'canvas'){
      const canvases = Array.from(cellLayer.querySelectorAll?.('canvas') || []);
      const bitmapImages = Array.from(cellLayer.querySelectorAll?.(
        'img[data-graphitix-render-cache-canvas-bitmap="true"], '
        + 'img[data-graphitix-render-cache-canvas-restored="true"], '
        + 'image[data-heatmap-raster-export="1"]'
      ) || []);
      return canvases.some(isHeatmapPaintedCanvas)
        || bitmapImages.some(isHeatmapRestorableBitmapImage);
    }
    return !!cellLayer.querySelector?.(
      'rect:not([data-heatmap-cell-hit-layer]), '
      + 'path[data-heatmap-vector-cell-bucket], '
      + '[data-heatmap-cell-value]'
    );
  }

  function resolveHeatmapOwnerSvg(session = null){
    const owner = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    const ownerRoot = owner?.root
      || Shared.workspaceTabs?.getMountedRoot?.(owner?.tabId || null, 'heatmap')
      || resolveHeatmapRoot(owner?.tabId || null)
      || state.root
      || null;
    const svg = heatmapNodeBelongsToRoot(owner?.refs?.svg, ownerRoot)
      ? owner.refs.svg
      : ownerRoot?.querySelector?.('#heatmapSvg') || null;
    return { owner, ownerRoot, svg };
  }

  function hasRenderedHeatmapGraph(session = null){
    const { svg } = resolveHeatmapOwnerSvg(session);
    if(!svg || svg.getAttribute?.(HEATMAP_RENDER_COMPLETE_ATTRIBUTE) !== 'true'){
      return false;
    }
    const cellLayer = svg.querySelector?.('[data-export-layer="heatmap-cells"]') || null;
    return isHeatmapMatrixLayerVisuallyReady(cellLayer);
  }

  function resolveHeatmapRenderCachePayload(cache){
    return cache?.[cache?.__graphitixRenderCache?.graphicKey]
      || cache?.svg
      || cache?.plot
      || cache?.preview
      || cache?.graph
      || cache?.stage
      || null;
  }

  function hasCompleteHeatmapRenderCache(cache){
    const graphPayload = resolveHeatmapRenderCachePayload(cache);
    const fragment = graphPayload?.fragment || null;
    const rootAttributes = cache?.svgRootState?.attributes || null;
    const complete = String(rootAttributes?.[HEATMAP_RENDER_COMPLETE_ATTRIBUTE] || '').trim() === 'true';
    if(!complete || !fragment || typeof fragment.querySelector !== 'function'){
      return false;
    }
    const cellLayer = fragment.querySelector('[data-export-layer="heatmap-cells"]');
    return isHeatmapMatrixLayerVisuallyReady(cellLayer);
  }

  heatmap.isIdleForSnapshot = function isIdleForSnapshot(meta = {}){
    const session = getHeatmapSession(meta?.tab || meta?.tabId || getHeatmapProjectionTabId() || null, {
      ...(meta || {}),
      reason: meta?.reason || 'heatmap-idle-check'
    }, { create: false }) || getActiveHeatmapSessionForState();
    const runtime = getHeatmapDrawRuntime(session, { seedFromActive: !session });
    const hasPendingOptions = !!(runtime?.pendingDrawOptions && Object.keys(runtime.pendingDrawOptions).length);
    const hasDeferredOptions = !!runtime?.deferredHiddenDrawOptions;
    const hasFlushHandle = !!runtime?.hiddenDrawFlushHandle;
    const isActiveOwner = !!session && isHeatmapSessionActiveForModuleState(session);
    return !(isActiveOwner && state.isRendering)
      && !hasFlushHandle
      && !hasDeferredOptions
      && !hasPendingOptions;
  };

  heatmap.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(heatmap, {
      ...meta,
      componentKey: 'heatmap'
    }) || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  function readHeatmapBitmapDimension(node, name, fallback = 1){
    const attributeValue = Number(node?.getAttribute?.(name));
    if(Number.isFinite(attributeValue) && attributeValue > 0){
      return Math.max(1, Math.round(attributeValue));
    }
    const styleValue = Number.parseFloat(String(node?.style?.[name] || '').trim());
    if(Number.isFinite(styleValue) && styleValue > 0){
      return Math.max(1, Math.round(styleValue));
    }
    return Math.max(1, Math.round(Number(fallback) || 1));
  }

  function rehydrateHeatmapCanvasBitmapImages(root){
    if(!root || typeof root.querySelectorAll !== 'function'){
      return 0;
    }
    const images = Array.from(root.querySelectorAll(
      '[data-export-layer="heatmap-cells"][data-render-mode="canvas"] '
      + 'img[data-graphitix-render-cache-canvas-bitmap="true"]'
    ));
    let hydrated = 0;
    images.forEach(image => {
      const parent = image?.parentNode || null;
      const doc = image?.ownerDocument || global.document || null;
      if(!parent || !doc || typeof doc.createElement !== 'function'){
        return;
      }
      const width = readHeatmapBitmapDimension(image, 'width');
      const height = readHeatmapBitmapDimension(image, 'height');
      const replaceFromSource = source => {
        if(image.parentNode !== parent){
          return false;
        }
        const canvas = doc.createElement('canvas');
        canvas.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        canvas.width = width;
        canvas.height = height;
        canvas.setAttribute('width', String(width));
        canvas.setAttribute('height', String(height));
        canvas.style.display = image.style?.display || 'block';
        canvas.style.width = image.style?.width || '100%';
        canvas.style.height = image.style?.height || '100%';
        canvas.style.background = image.style?.background || 'transparent';
        canvas.style.pointerEvents = 'none';
        const resolutionScale = image.getAttribute?.('data-resolution-scale');
        if(resolutionScale){
          canvas.setAttribute('data-resolution-scale', resolutionScale);
        }
        const ctx = canvas.getContext?.('2d');
        if(!ctx || typeof ctx.drawImage !== 'function'){
          return false;
        }
        try{
          ctx.clearRect?.(0, 0, width, height);
          ctx.drawImage(source, 0, 0, width, height);
          canvas.setAttribute('data-graphitix-render-cache-canvas-restored', 'true');
          parent.replaceChild(canvas, image);
          return true;
        }catch(_err){
          return false;
        }
      };
      const decoded = image.complete !== false
        && (Number(image.naturalWidth) || 0) > 0
        && (Number(image.naturalHeight) || 0) > 0;
      if(decoded && replaceFromSource(image)){
        hydrated += 1;
        return;
      }
      image.setAttribute('data-graphitix-render-cache-canvas-pending-hydration', 'true');
      const src = String(image.getAttribute?.('src') || '').trim();
      const ImageCtor = global.Image;
      if(!src || typeof ImageCtor !== 'function'){
        return;
      }
      try{
        const loader = new ImageCtor();
        loader.onload = () => {
          if(replaceFromSource(loader)){
            hydrated += 1;
          }
        };
        loader.src = src;
      }catch(_err){
        // The serialized bitmap image remains a complete visual fallback.
      }
    });
    return hydrated;
  }

  heatmap.restoreRenderCache = function restoreRenderCache(cache, meta = {}){
    const { session: restoreSession, svg, stats } = resolveHeatmapRenderCacheTargets(meta, {
      create: false,
      fallbackActive: true
    });
    const ownerCurrent = isHeatmapOwnerContextCurrent(restoreSession, restoreSession?.root || meta?.root || null, meta);
    const ownerAvailable = isHeatmapExplicitOwnerOperation(meta)
      ? ownerCurrent
      : !!restoreSession && !!svg && isHeatmapSessionActiveForModuleState(restoreSession);
    if(!cache || !restoreSession || !svg || !ownerAvailable){
      clearCachedRenderState(restoreSession || null);
      debugLog('Debug: heatmap render cache restore skipped', {
        reason: !cache
          ? 'missing-cache'
          : (!restoreSession ? 'missing-owner-session' : (!svg ? 'missing-owner-svg' : 'unavailable-owner-session')),
        tabId: restoreSession?.tabId || meta?.tabId || meta?.tab?.id || null,
        ownerCurrent,
        projectedOwner: !!restoreSession && isHeatmapSessionActiveForModuleState(restoreSession)
      });
      return false;
    }
    if(!heatmap.canRestoreRenderCache(cache, { ...meta, session: restoreSession })){
      debugLog('Debug: heatmap render cache restore skipped', {
        reason: 'cache-validation-failed',
        tabId: restoreSession.tabId || null
      });
      return false;
    }

    const graphCachePayload = resolveHeatmapRenderCachePayload(cache);
    const restoredState = cache.renderState
      ? restoreHeatmapRenderStateSnapshot(cache.renderState, restoreSession)
      : true;
    restoreHeatmapSvgRootState(svg, cache.svgRootState);
    const restoredSvg = restoreChildren(svg, graphCachePayload);
    const restoredStats = cache.stats ? restoreChildren(stats, cache.stats) : true;
    const hydratedBitmaps = restoredSvg ? rehydrateHeatmapCanvasBitmapImages(svg) : 0;

    const restoreRuntime = getHeatmapRenderRuntime(restoreSession, { seedFromActive: true });
    const restoredProjection = cloneSimple(restoreRuntime?.labelProjection) || null;
    if(restoredProjection){
      svg.__heatmapLabelProjection = restoredProjection;
    }else{
      delete svg.__heatmapLabelProjection;
    }

    const restored = !!(restoredSvg && restoredStats && restoredState && hasRenderedHeatmapGraph(restoreSession));
    if(!restored){
      while(svg.firstChild){
        svg.removeChild(svg.firstChild);
      }
      markHeatmapRenderIncomplete(svg);
      clearCachedRenderState(restoreSession);
      debugLog('Debug: heatmap render cache rejected after owner visual validation', {
        tabId: restoreSession.tabId || null,
        restoredSvg,
        restoredStats,
        restoredState: !!restoredState,
        hydratedBitmaps
      });
      return false;
    }

    debugLog('Debug: heatmap render cache restored', {
      tabId: restoreSession.tabId || null,
      restoredSvg,
      restoredStats,
      restoredState: !!restoredState,
      hydratedBitmaps
    });
    return true;
  };

  heatmap.hasRenderedGraph = function hasRenderedGraph(meta = {}){
    const session = resolveHeatmapRenderCacheSession(meta, { create: false, fallbackActive: true });
    return !!session && hasRenderedHeatmapGraph(session);
  };

  heatmap.__getState = () => ({
    ...state,
    lastRenderModel: getHeatmapActiveRenderModel(getActiveHeatmapSessionForState())
  });

  function benchmarkHeatmapLoad(config){
    const rows = Math.max(1, Math.floor(Number(config?.rows) || 200));
    const cols = Math.max(1, Math.floor(Number(config?.cols) || 10));
    const generator = typeof config?.generator === 'function'
      ? config.generator
      : ((rowIdx, colIdx) => Math.cos(rowIdx * 0.15 + colIdx * 0.25) * 5 + rowIdx * 0.1);
    const grid = Array.from({ length: rows }, (_, r) => {
      const row = new Array(cols);
      for(let c = 0; c < cols; c++){
        row[c] = Number(generator(r, c)) || 0;
      }
      return row;
    });
    const perf = global.performance;
    const start = perf?.now ? perf.now() : Date.now();
    const rowStats = grid.map(row => {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for(let c = 0; c < cols; c++){
        const value = row[c];
        if(value < min) min = value;
        if(value > max) max = value;
        sum += value;
      }
      return { min, max, mean: sum / cols };
    });
    const colSums = new Array(cols).fill(0);
    for(let r = 0; r < rows; r++){
      for(let c = 0; c < cols; c++){
        colSums[c] += grid[r][c];
      }
    }
    const end = perf?.now ? perf.now() : Date.now();
    return {
      rows,
      cols,
      durationMs: Number((end - start).toFixed(3)),
      rowExtents: {
        min: Math.min(...rowStats.map(stat => stat.min)),
        max: Math.max(...rowStats.map(stat => stat.max))
      },
      columnMeans: colSums.map(sum => sum / rows)
    };
  }

  heatmap.__testHooks = Object.assign({}, heatmap.__testHooks, {
    benchmarkLoad: opts => benchmarkHeatmapLoad(opts),
    resolveDrawableFrame: targetEl => resolveHeatmapDrawableFrame(targetEl),
    resolveRoleTextScales: opts => resolveHeatmapRoleTextScales(opts),
    parseFontSizePx: value => parseHeatmapFontSizePx(value),
    resolveLabelMetrics: options => resolveHeatmapLabelMetrics(options),
    resolveLogicalSceneLayout: options => resolveLogicalHeatmapSceneLayout(options),
    createRenderRuntime: (source, options = {}) => createDefaultHeatmapRenderRuntime(source, options),
    createDataSignature: processed => createHeatmapDataSignatureFromProcessed(processed),
    shouldUseCellCanvas: options => shouldUseHeatmapCellCanvas(options),
    resolveHeavySceneLayout: options => resolveHeavyHeatmapSceneLayout(options),
    resolveCanvasBitmapSize: options => resolveHeatmapCanvasBitmapSize(options),
    appendCanvasCellLayer: (layer, cells, options) => appendHeatmapCanvasCellLayer(layer, cells, options),
    buildPreviewSvgFromSource: (svg, options = {}) => buildHeatmapPreviewSvgFromSource(svg, {
      simplifyHeavy: true,
      ...(options || {})
    }),
    buildExportSvgFromSource: (svg, options = {}) => buildHeatmapExportSvgFromSource(svg, options),
    simplifyHeavyPreview: svg => simplifyHeavyHeatmapPreview(svg),
    samplePreviewPathBranches: (path, maxCount) => sampleHeatmapPreviewPathBranches(path, maxCount),
    formatSvgNumber: value => formatHeatmapSvgNumber(value),
    compactDendrogramBranch: (orientation, a, nodeCoord, b) => {
      const segments = [];
      appendHeatmapDendrogramBranch(segments, orientation, a, nodeCoord, b);
      return buildHeatmapDendrogramPath(mergeHeatmapDendrogramSegments(segments), 4);
    },
    buildDendrogramGeometry: options => buildHeatmapDendrogramGeometry(options),
    mergeDendrogramSegments: segments => mergeHeatmapDendrogramSegments(segments),
    selectProjectionIndices: (count, maxCount) => selectHeatmapProjectionIndices(count, maxCount),
    isCanvasRenderActive: svg => isHeatmapCanvasRenderActive(svg),
    markCanvasResizeReuse: (active, svg) => markHeatmapCanvasResizeReuse(active, svg),
    applyCanvasLiveResizeProjection: (svg, svgBox) => applyHeatmapCanvasLiveResizeProjection(svg, svgBox),
    bindDomProjection: (tabId, root, options = {}) => {
      const session = getHeatmapSession(tabId, { tabId, root, reason: 'heatmap-test-bind-dom' }, { create: true });
      projectedHeatmapSession = session;
      heatmap.__boundTabId = String(tabId || '');
      bindHeatmapDomProjectionForSession(session, root, options);
      syncHeatmapSessionRefsFromActive(session);
      return session;
    },
    getSession: tabId => getHeatmapSession(tabId, { tabId, reason: 'heatmap-test-session' }, { create: false }),
    getSessionRefs: tabId => {
      const session = getHeatmapSession(tabId, { tabId, reason: 'heatmap-test-session-refs' }, { create: false });
      return session?.refs || null;
    },
    setTextAspectMetrics: metrics => {
      state.textAspectMetrics = cloneSimple(metrics) || metrics || null;
      return state.textAspectMetrics;
    },
    measureLockedGeometry: options => measureHeatmapLockedGeometry(options),
    rehydrateCanvasBitmapImages: root => rehydrateHeatmapCanvasBitmapImages(root),
    isMatrixLayerVisuallyReady: layer => isHeatmapMatrixLayerVisuallyReady(layer),
    hasRenderedGraph: session => hasRenderedHeatmapGraph(session),
    hasCompleteRenderCache: cache => hasCompleteHeatmapRenderCache(cache),
    getWorkerRecords: (tabId = null) => {
      const ownerTabId = String(tabId || getHeatmapProjectionTabId() || '').trim();
      const session = ownerTabId
        ? getHeatmapSession(ownerTabId, { tabId: ownerTabId, reason: 'heatmap-test-worker-records' }, { create: false })
        : null;
      return Array.from(session?.workers?.values?.() || []).map(record => cloneSimple(record));
    },
    getPerformance: () => ({
      performance: cloneSimple(state.performance),
      lastAutoDrawEvaluation: cloneSimple(state.lastAutoDrawEvaluation),
      lastDataShape: cloneSimple(state.lastDataShape)
    })
  });



  Shared.componentLifecycle?.installInternalStateBridge?.(heatmap, {
    componentKey: 'heatmap',
    targets: [
      { key: 'state', get: () => state, excludeKeys: ['hot', 'root', 'svg', 'svgBox', 'drawToken'] },
      { key: 'notesState', get: () => notesState, excludeKeys: ['control'] }
    ]
  });
})(window);
