(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const heatmap = Components.heatmap = Components.heatmap || {};

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
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
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
      || heatmap.__boundTabId
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
  let heatmapFontEventBound = false;
  let heatmapFontRefreshReason = null;
  let heatmapFontRefreshTabId = null;
  const scheduleHeatmapFontRefresh = (() => {
    const runRefresh = () => {
      if(state.isRendering){
        scheduleHeatmapFontRefresh(heatmapFontRefreshReason || 'font-style-change', { tabId: heatmapFontRefreshTabId || null });
        return;
      }
      const nextReason = heatmapFontRefreshReason || 'font-style-change';
      const ownerTabId = heatmapFontRefreshTabId || heatmap.__boundTabId || null;
      const ownerSession = ownerTabId
        ? getHeatmapSession(ownerTabId, { tabId: ownerTabId, reason: nextReason }, { create: false })
        : getActiveHeatmapSessionForState();
      heatmapFontRefreshReason = null;
      heatmapFontRefreshTabId = null;
      scheduleHeatmapDrawForSession(ownerSession || getActiveHeatmapSessionForState(), { tabId: ownerTabId || undefined, viewOnly: true, reason: nextReason });
    };
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(heatmap, 'heatmap', runRefresh, { reason: 'heatmap-font-refresh' })
      : null;
    return (reason, options = {}) => {
      heatmapFontRefreshReason = reason || heatmapFontRefreshReason || 'font-style-change';
      heatmapFontRefreshTabId = options?.tabId || heatmapFontRefreshTabId || heatmap.__boundTabId || null;
      if(debounced){
        debounced({ tabId: heatmapFontRefreshTabId || null, reason: 'heatmap-font-refresh' });
        return;
      }
      runRefresh();
    };
  })();

  const ensureHeatmapFontObserver = () => {
    if(heatmapFontObserver || typeof global.MutationObserver !== 'function' || !state.svg){
      return;
    }
    heatmapFontObserver = new global.MutationObserver(mutations => {
      if(state.isRendering){ return; }
      let shouldRefresh = false;
      for(const mutation of mutations){
        if(mutation.type !== 'attributes'){ continue; }
        const target = mutation.target;
        const nodeName = target?.nodeName?.toLowerCase?.() || '';
        if(nodeName !== 'text' && nodeName !== 'tspan'){ continue; }
        const scope = target?.dataset?.fontScope || target?.closest?.('svg')?.dataset?.fontScope || null;
        if(scope === 'heatmap'){
          shouldRefresh = true;
          break;
        }
      }
      if(shouldRefresh){
        debugLog('Debug: heatmap font mutation detected', { count: mutations.length });
        scheduleHeatmapFontRefresh('font-mutation');
      }
    });
    heatmapFontObserver.observe(state.svg, {
      subtree: true,
      attributes: true,
      // Ignore generic `style` mutations: fontControls text highlight uses style.filter on click,
      // and observing that causes a redraw loop/flicker. Real font updates are handled by
      // explicit fontControls:styleChanged events and direct font-* attributes.
      attributeFilter: ['font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'baseline-shift']
    });
    debugLog('Debug: heatmap font observer attached');
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
  let heatmapResizeRefreshReason = null;
  const stripAspectMatrixTransform = (transform) => {
    const trimmed = typeof transform === 'string' ? transform.trim() : '';
    if(!trimmed){ return ''; }
    const withoutLeading = trimmed.replace(/^matrix\([^)]*\)\s*/i, '');
    const withoutTrailing = withoutLeading.replace(/\s*matrix\([^)]*\)\s*$/i, '');
    return withoutTrailing.trim();
  };
  const setHeatmapBaseTransform = (text, base) => {
    if(!text || typeof text.setAttribute !== 'function'){ return; }
    const value = typeof base === 'string' ? base : '';
    const existingAttr = text.getAttribute('data-heatmap-base-transform');
    const shouldSetAttr = existingAttr == null || (existingAttr === '' && value !== '');
    if(shouldSetAttr){
      text.setAttribute('data-heatmap-base-transform', value);
    }
    if(text.dataset){
      const existingDataset = text.dataset.heatmapBaseTransform;
      const shouldSetDataset = existingDataset == null || (existingDataset === '' && value !== '');
      if(shouldSetDataset){
        text.dataset.heatmapBaseTransform = value;
      }
    }
  };
  const getHeatmapBaseTransform = (text) => {
    if(!text){ return ''; }
    const datasetValue = text.dataset?.heatmapBaseTransform;
    if(typeof datasetValue === 'string' && datasetValue.length > 0){
      const currentTransform = typeof text.getAttribute === 'function' ? text.getAttribute('transform') : '';
      const cleanedCurrent = stripAspectMatrixTransform(currentTransform || '');
      if(cleanedCurrent && cleanedCurrent !== datasetValue){
        setHeatmapBaseTransform(text, cleanedCurrent);
        return cleanedCurrent;
      }
      return datasetValue;
    }
    const attrValue = typeof text.getAttribute === 'function'
      ? text.getAttribute('data-heatmap-base-transform')
      : null;
    if(typeof attrValue === 'string' && attrValue.length > 0){
      if(text.dataset && (datasetValue == null || datasetValue === '')){
        text.dataset.heatmapBaseTransform = attrValue;
      }
      return attrValue;
    }
    const transform = typeof text.getAttribute === 'function' ? text.getAttribute('transform') : '';
    const cleaned = stripAspectMatrixTransform(transform || '');
    if(cleaned || (datasetValue == null && attrValue == null)){
      setHeatmapBaseTransform(text, cleaned);
    }
    return cleaned;
  };
  const applyHeatmapTextAspect = (reason) => {
    const svg = state.svg;
    if(!svg){ return; }
    const svgBox = state.svgBox || svg.closest?.('.svgbox') || null;
    const svgRect = svg.getBoundingClientRect ? svg.getBoundingClientRect() : null;
    const viewBox = svg.viewBox?.baseVal;
    applyTextAspectCorrection({
      svg,
      svgBox,
      viewBoxWidth: viewBox?.width,
      viewBoxHeight: viewBox?.height,
      displayWidth: svgRect?.width,
      displayHeight: svgRect?.height,
      debugLabel: reason || 'heatmap-text-resize',
      textScaleMode: HEATMAP_TEXT_SCALE_MODE
    });
  };
  const scheduleHeatmapResizeRefresh = (() => {
    const runRefresh = () => {
      const nextReason = heatmapResizeRefreshReason || 'resize';
      heatmapResizeRefreshReason = null;
      if(state.isRendering){
        scheduleHeatmapResizeRefresh(nextReason);
        return;
      }
      // A render-cache restore (notably an archive/recovery restore while this tab was in
      // the background) can rehydrate the SVG markup without the component's private
      // render state, leaving textAspectMetrics/lastRenderModel absent. The readable-label
      // and cell-value text scales are derived from those metrics, so applying the text
      // aspect correction now would fall back to defaults and corrupt the text (shrunken
      // labels, oversized overlapping cell values). Recompute the model+metrics from the
      // restored data with a full draw at this settled, visible size instead.
      if(!state.textAspectMetrics && state.hot && state.svg && !isHeatmapWorkspaceHidden()){
        // Drive the draw directly (not via the suppressed post-restore scheduler) so the
        // model+metrics are recomputed now, at this settled visible size.
        debugLog('Debug: heatmap resize refresh recomputing render state (missing metrics)', { reason: nextReason });
        const recoveryOptions = { tabId: heatmap.__boundTabId || null, reason: `heatmap-recover-render-state-${nextReason}` };
        updateHeatmapDrawRuntime(getActiveHeatmapSessionForState(), runtime => {
          runtime.pendingDrawOptions = cloneSimple(recoveryOptions) || {};
        });
        draw();
        return;
      }
      applyHeatmapTextAspect(`heatmap-resize-aspect-${nextReason}`);
      scheduleActiveHeatmapDraw({ viewOnly: true, reason: nextReason });
    };
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(heatmap, 'heatmap', runRefresh, { reason: 'heatmap-resize-refresh' })
      : null;
    return reason => {
      heatmapResizeRefreshReason = reason || heatmapResizeRefreshReason || 'resize';
      if(debounced){
        debounced({ tabId: heatmap.__boundTabId || null, reason: 'heatmap-resize-refresh' });
        return;
      }
      runRefresh();
    };
  })();

  const ensureHeatmapTextResizeObserver = () => {
    if(heatmapTextResizeObserver || typeof global.ResizeObserver !== 'function'){
      return;
    }
    const target = state.svgBox || state.svg?.closest?.('.svgbox') || null;
    if(!target){ return; }
    heatmapTextResizeObserver = new global.ResizeObserver(() => {
      scheduleHeatmapResizeRefresh('resize-observer');
    });
    heatmapTextResizeObserver.observe(target);
    debugLog('Debug: heatmap text resize observer attached');
  };

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
      rowCount: Number(source.rowCount) || 0,
      columnCount: Number(source.columnCount) || 0,
      rowLabels: Array.isArray(source.rowLabels) ? source.rowLabels : [],
      columnLabels: Array.isArray(source.columnLabels) ? source.columnLabels : [],
      stats: {
        finiteCount: Number(source.stats?.finiteCount) || 0,
        min: Number.isFinite(source.stats?.min) ? source.stats.min : null,
        max: Number.isFinite(source.stats?.max) ? source.stats.max : null,
        mean: Number.isFinite(source.stats?.mean) ? source.stats.mean : null,
        rowsFiltered: Number(source.stats?.rowsFiltered) || 0,
        columnsRemoved: Number(source.stats?.columnsRemoved) || 0,
        logApplied: !!source.stats?.logApplied
      },
      adjustmentSummary: source.adjustmentSummary || null
    });
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate){
      return;
    }
    emptyPayloadTemplate = { type: 'heatmap', config: {} };
  }
  const NS = 'http://www.w3.org/2000/svg';
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

  function buildHeatmapTabContextSnapshotFromState(){
    const defaults = createDefaultHeatmapTabContext();
    return {
      fileHandle: state.fileHandle || null,
      fileName: typeof state.fileName === 'string' && state.fileName.trim()
        ? state.fileName.trim()
        : defaults.fileName,
      titleText: state.titleText != null ? String(state.titleText) : defaults.titleText,
      logPlusOne: !!state.logPlusOne,
      activeMaterializedViewId: getActiveHeatmapSessionForState()?.state?.activeMaterializedViewId == null
        ? (state.activeMaterializedViewId == null ? null : String(state.activeMaterializedViewId))
        : String(getActiveHeatmapSessionForState().state.activeMaterializedViewId),
      controls: syncHeatmapControlStateToSession(getActiveHeatmapSessionForState(), captureHeatmapControlStateFromDom()),
      dendrogramSettings: getHeatmapDendrogramSettings(getActiveHeatmapSessionForState()),
      labelPositions: cloneSimple(state.labelPositions || defaults.labelPositions) || { ...defaults.labelPositions },
      palette: normalizeHeatmapPalette(state.palette),
      valueScale: normalizeHeatmapValueScale(state.valueScale),
      legendHeightMode: normalizeHeatmapLegendHeightMode(state.legendHeightMode),
      clusterControlsTouched: !!getHeatmapClusterState(getActiveHeatmapSessionForState()).clusterControlsTouched,
      clusterDefaultsAutoApplied: !!getHeatmapClusterState(getActiveHeatmapSessionForState()).clusterDefaultsAutoApplied,
      suppressClusterTouchTracking: !!getHeatmapClusterState(getActiveHeatmapSessionForState()).suppressClusterTouchTracking,
      suspendAutoClusterDefaults: !!getHeatmapClusterState(getActiveHeatmapSessionForState()).suspendAutoClusterDefaults,
      lastDataShape: cloneSimple(state.lastDataShape) || { ...defaults.lastDataShape },
      lastAutoDrawEvaluation: cloneSimple(state.lastAutoDrawEvaluation),
      lastStats: cloneSimple(state.lastStats),
      statsPanelModel: captureHeatmapStatsPanelModel(),
      performance: cloneSimple(state.performance) || { ...defaults.performance },
      notes: captureHeatmapNotesSnapshot(getActiveHeatmapSessionForState())
    };
  }

  function applyHeatmapTabContextSnapshot(context, options = {}){
    const defaults = createDefaultHeatmapTabContext();
    const source = context && typeof context === 'object' ? context : defaults;
    state.fileHandle = source.fileHandle || null;
    setHeatmapFileName(source.fileName, {
      force: true,
      skipExportRefresh: options.skipExportRefresh === true
    });
    state.titleText = source.titleText != null ? String(source.titleText) : defaults.titleText;
    state.logPlusOne = !!source.logPlusOne;
    setHeatmapActiveMaterializedViewId(source.activeMaterializedViewId == null
      ? null
      : String(source.activeMaterializedViewId), getActiveHeatmapSessionForState());
    if(options.syncUi !== false){
      applyHeatmapControlStateToDom(source.controls || defaults.controls);
    }else{
      syncHeatmapControlStateToSession(getActiveHeatmapSessionForState(), source.controls || defaults.controls);
      state.logPlusOne = !!normalizeHeatmapControlState(source.controls || defaults.controls).adjust.logPlusOne;
    }
    state.dendrogramSettings = updateHeatmapDendrogramSettings(source.dendrogramSettings || defaults.dendrogramSettings, getActiveHeatmapSessionForState());
    state.labelPositions = cloneSimple(source.labelPositions) || { ...defaults.labelPositions };
    state.palette = normalizeHeatmapPalette(source.palette);
    state.valueScale = normalizeHeatmapValueScale(source.valueScale);
    state.legendHeightMode = normalizeHeatmapLegendHeightMode(source.legendHeightMode);
    state.lastResolvedValueScale = null;
    updateHeatmapRenderRuntime(getActiveHeatmapSessionForState(), runtime => {
      runtime.lastResolvedValueScale = null;
    }, { seedFromActive: true });
    updateHeatmapClusterState({
      clusterControlsTouched: !!source.clusterControlsTouched,
      clusterDefaultsAutoApplied: !!source.clusterDefaultsAutoApplied,
      suppressClusterTouchTracking: !!source.suppressClusterTouchTracking,
      suspendAutoClusterDefaults: !!source.suspendAutoClusterDefaults
    }, getActiveHeatmapSessionForState());
    state.lastDataShape = cloneSimple(source.lastDataShape) || { ...defaults.lastDataShape };
    state.lastAutoDrawEvaluation = cloneSimple(source.lastAutoDrawEvaluation) || null;
    state.lastStats = cloneSimple(source.lastStats) || null;
    state.statsPanelModel = normalizeHeatmapStatsPanelModel(source.statsPanelModel || {});
    state.performance = cloneSimple(source.performance) || { ...defaults.performance };
    if(options.syncUi !== false){
      if(state.lastStats){
        updateStats(state.lastStats);
      }else{
        restoreHeatmapStatsPanelModel(state.statsPanelModel);
      }
    }
    syncHeatmapNotesStateToSession(getActiveHeatmapSessionForState(), source.notes || defaults.notes);
    if(options.syncUi !== false){
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
      applyHeatmapNotesStateToControl(getActiveHeatmapSessionForState());
    }
  }

  const heatmapSessionsByTabId = new Map();
  let activeHeatmapSession = null;

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

  function createDefaultHeatmapRenderRuntime(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      lastRenderModel: cloneSimple(src.lastRenderModel || null) || null,
      lastViewOptions: cloneSimple(src.lastViewOptions || null) || null,
      textAspectMetrics: cloneSimple(src.textAspectMetrics || null) || null,
      lastResolvedValueScale: cloneSimple(src.lastResolvedValueScale || null) || null,
      lastDataShape: cloneSimple(src.lastDataShape || null) || { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: cloneSimple(src.lastAutoDrawEvaluation || null) || null,
      dataSignature: typeof src.dataSignature === 'string' ? src.dataSignature : null,
      settingsSignature: typeof src.settingsSignature === 'string' ? src.settingsSignature : null,
      updatedAt: Date.now()
    };
  }

  function createDefaultHeatmapDrawRuntime(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const rawToken = Number(src.token ?? src.drawToken);
    return {
      token: Number.isFinite(rawToken) && rawToken >= 0 ? rawToken : 0,
      pendingDrawOptions: cloneSimple(src.pendingDrawOptions || src.pendingOptions || null) || {},
      deferredHiddenDrawOptions: cloneSimple(src.deferredHiddenDrawOptions || null) || null,
      hiddenDrawFlushHandle: src.hiddenDrawFlushHandle || null,
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
      || heatmap.__boundTabId
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
    session.state = session.state && typeof session.state === 'object'
      ? { ...createDefaultHeatmapTabContext(), ...(cloneSimple(session.state) || session.state) }
      : createDefaultHeatmapTabContext();
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
    session.cache.renderRuntime = createDefaultHeatmapRenderRuntime(session.cache.renderRuntime || {});
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
    const boundTabId = String(heatmap.__boundTabId || '').trim();
    const activeTabId = String(Shared.workspaceTabs?.getActiveSessionInfo?.('heatmap')?.tabId || '').trim();
    return !!tabId && (boundTabId === tabId || activeTabId === tabId);
  }

  function getHeatmapSession(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeHeatmapSessionTabId(tabLike, meta);
    if(!tabId){
      return options.fallbackActive === true ? ensureHeatmapSessionOwnershipShape(activeHeatmapSession) : null;
    }
    let session = heatmapSessionsByTabId.get(tabId) || null;
    if(!session && options.create === true){
      session = createHeatmapSession({
        tabId,
        root: resolveHeatmapRoot(tabLike || tabId || null) || (String(heatmap.__boundTabId || '') === tabId ? state.root : null),
        initialState: options.initialState || null
      });
      heatmapSessionsByTabId.set(tabId, session);
    }
    return ensureHeatmapSessionOwnershipShape(session);
  }

  function getHeatmapWorkspaceActiveTabId(){
    const workspaceInfo = Shared.workspaceTabs?.getActiveSessionInfo?.('heatmap') || null;
    if(workspaceInfo?.tabId){
      return String(workspaceInfo.tabId).trim();
    }
    const workspace = global.Main?.session?.workspaceState || null;
    const activeId = workspace?.activeTabId || null;
    if(activeId && Array.isArray(workspace?.tabs)){
      const activeTab = workspace.tabs.find(tab => tab && String(tab.id || '') === String(activeId));
      if(activeTab?.type === 'heatmap'){
        return String(activeId).trim();
      }
    }
    return '';
  }

  function getActiveHeatmapSessionForState(){
    const workspaceActiveTabId = getHeatmapWorkspaceActiveTabId();
    if(workspaceActiveTabId){
      return getHeatmapSession(workspaceActiveTabId, { tabId: workspaceActiveTabId, reason: 'active-heatmap-session-workspace' }, { create: true });
    }
    if(activeHeatmapSession && (!heatmap.__boundTabId || String(activeHeatmapSession.tabId || '') === String(heatmap.__boundTabId || ''))){
      return ensureHeatmapSessionOwnershipShape(activeHeatmapSession);
    }
    const tabId = heatmap.__boundTabId || normalizeHeatmapSessionTabId(null, {}) || null;
    return tabId ? getHeatmapSession(tabId, { tabId, reason: 'active-heatmap-session' }, { create: true }) : null;
  }

  function scheduleHeatmapDrawForSession(session = null, options = {}){
    const shaped = ensureHeatmapSessionOwnershipShape(session || getActiveHeatmapSessionForState());
    if(!shaped){
      return false;
    }
    const scheduleOptions = {
      ...(options || {}),
      tabId: shaped.tabId || options.tabId || undefined,
      reason: options.reason || 'heatmap-session-draw'
    };
    updateHeatmapDrawRuntime(shaped, runtime => {
      runtime.pendingDrawOptions = cloneSimple(scheduleOptions) || {};
    }, { mirrorActive: isHeatmapSessionActiveForModuleState(shaped) });
    if(!isHeatmapSessionActiveForModuleState(shaped)){
      shaped.state.drawPending = true;
      shaped.updatedAt = Date.now();
      return false;
    }
    if(typeof state.scheduleDraw !== 'function'){
      return false;
    }
    shaped.state.drawPending = false;
    shaped.updatedAt = Date.now();
    state.scheduleDraw(scheduleOptions);
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
    const session = getHeatmapSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'heatmap-session-bind' }, { create: true });
    if(!session){ return null; }
    activeHeatmapSession = session;
    heatmap.__heatmapSessionTabId = session.tabId;
    const workspaceActiveTabId = getHeatmapWorkspaceActiveTabId();
    if(!heatmap.__boundTabId || !workspaceActiveTabId || workspaceActiveTabId === session.tabId){
      heatmap.__boundTabId = session.tabId;
    }
    session.root = resolveHeatmapRoot(tabLike || tabId || null) || state.root || session.root || null;
    if(session.root && (!workspaceActiveTabId || workspaceActiveTabId === session.tabId)){
      state.root = session.root;
    }
    syncHeatmapSessionRefsFromActive(session);
    syncHeatmapSessionManagersFromActive(session);
    syncHeatmapDrawRuntimeMirror(session.timers.drawRuntime, session);
    syncHeatmapRenderRuntimeMirror(session.cache.renderRuntime, session);
    syncHeatmapResultsMirror(session.results, session);
    session.updatedAt = Date.now();
    return session;
  }

  function syncHeatmapSessionRefsFromActive(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || activeHeatmapSession);
    if(!shaped){ return null; }
    if(shaped.tabId && !isHeatmapSessionActiveForModuleState(shaped)){
      return shaped;
    }
    shaped.root = state.root || shaped.root || null;
    shaped.refs.root = shaped.root || shaped.refs.root || null;
    shaped.refs.svg = state.svg || shaped.refs.svg || null;
    shaped.refs.svgBox = state.svgBox || shaped.refs.svgBox || null;
    shaped.refs.statsEl = state.statsEl || shaped.refs.statsEl || null;
    shaped.refs.emptyPlotNoticeEl = state.emptyPlotNoticeEl || shaped.refs.emptyPlotNoticeEl || null;
    shaped.refs.controls = refs;
    shaped.refs.notesControl = notesState.control || shaped.refs.notesControl || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function getHeatmapHotOwnerTabId(hotInstance){
    return String(
      hotInstance?.__heatmapTabId
      || hotInstance?.__workspaceTabId
      || hotInstance?.__graphitixTabId
      || hotInstance?.__hotWorkspaceTabId
      || ''
    ).trim();
  }

  function getHeatmapTabIdFromTarget(target = null){
    if(!target || typeof target.closest !== 'function'){
      return '';
    }
    const owner = target.closest('[data-workspace-tab-id], [data-tab-id], [data-workspace-instance-root="true"]');
    return String(
      owner?.dataset?.workspaceTabId
      || owner?.dataset?.tabId
      || owner?.getAttribute?.('data-workspace-tab-id')
      || owner?.getAttribute?.('data-tab-id')
      || ''
    ).trim();
  }

  function getHeatmapActiveTabId(){
    return String(getHeatmapWorkspaceActiveTabId() || heatmap.__boundTabId || '').trim();
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

  function heatmapHotBelongsToSession(hotInstance, session = null){
    if(!hotInstance){
      return false;
    }
    const shaped = ensureHeatmapSessionOwnershipShape(session || activeHeatmapSession || getActiveHeatmapSessionForState());
    const ownerTabId = getHeatmapHotOwnerTabId(hotInstance);
    return !!shaped && (!shaped.tabId || (ownerTabId && ownerTabId === shaped.tabId));
  }

  function syncHeatmapSessionManagersFromActive(session = null){
    const shaped = ensureHeatmapSessionOwnershipShape(session || activeHeatmapSession);
    if(!shaped){ return null; }
    const hotBelongsToSession = heatmapHotBelongsToSession(state.hot, shaped);
    if(hotBelongsToSession){
      shaped.managers.hot = state.hot;
      shaped.managers.dataViews = state.hot?.__heatmapDataViewsManager || shaped.managers.dataViews || null;
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
      if(options.seedFromActive === true){
        shaped.cache.renderRuntime = createDefaultHeatmapRenderRuntime({
          lastRenderModel: shaped.cache.renderRuntime?.lastRenderModel || null,
          lastViewOptions: state.lastViewOptions,
          textAspectMetrics: state.textAspectMetrics,
          lastResolvedValueScale: state.lastResolvedValueScale,
          lastDataShape: state.lastDataShape,
          lastAutoDrawEvaluation: state.lastAutoDrawEvaluation
        });
      }else{
        shaped.cache.renderRuntime = createDefaultHeatmapRenderRuntime(shaped.cache.renderRuntime || {});
      }
      return syncHeatmapRenderRuntimeMirror(shaped.cache.renderRuntime, shaped);
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
    const existingRenderRuntime = createDefaultHeatmapRenderRuntime(shaped.cache?.renderRuntime || {});
    shaped.state = buildHeatmapTabContextSnapshotFromState();
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
    });
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
    if(section === 'draw' && typeof previous.totalMs === 'number' && typeof payload.totalMs === 'number'){
      payload.totalMs = Math.max(previous.totalMs, payload.totalMs);
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
    getTabId: () => heatmap.__boundTabId || null,
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
    syncHeatmapControlStateToSession(getActiveHeatmapSessionForState(), normalized);
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
    hot.applyExclusions(exclusions || null);
    debugLog('Debug: heatmap exclusion sync applied', {
      reason: reason || null,
      exclusions: normalizeHeatmapExclusionState(exclusions)
    });
    return true;
  }

  function activateHeatmapDataToolbar(reason){
    const now = Date.now();
    const tabId = String(heatmap.__boundTabId || Shared.workspaceTabs?.getActiveSessionInfo?.('heatmap')?.tabId || 'global');
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
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    const existingManager = hotInstance.__heatmapDataViewsManager || null;
    if(existingManager && existingManager.__heatmapRuntimeKey !== HEATMAP_RUNTIME_KEY){
      existingManager.unmount?.();
      hotInstance.__heatmapDataViewsManager = null;
    }
    if(!hotInstance.__heatmapDataViewsManager){
      hotInstance.__heatmapDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'heatmap',
        maxViews: HEATMAP_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
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
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData, {
            source: hotInstance.__heatmapPendingProgrammaticLoadSource
          });
          syncHeatmapHotExclusions(hotInstance, view.exclusions || null, 'active-view-change');
          if(view.filters){
            hotInstance.applyFilters?.(view.filters, { schedule: false });
          }
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
      });
      hotInstance.__heatmapDataViewsManager.__heatmapRuntimeKey = HEATMAP_RUNTIME_KEY;
      debugLog('Debug: heatmap data views manager created', {
        tabId: hotInstance.__heatmapTabId || null
      });
    }
    const manager = hotInstance.__heatmapDataViewsManager;
    const hostWrapper = options.wrapper || getHeatmapNodeById('heatmapHotWrapper') || null;
    const hostContainer = options.container || hotInstance.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null;
    if(hostWrapper && hostContainer){
      manager.mount({
        wrapper: hostWrapper,
        tableContainer: hostContainer
      });
      manager.refresh?.();
    }
    const activeView = manager.getActiveView?.() || null;
    setHeatmapActiveMaterializedViewId(isHeatmapMaterializedDataView(activeView) ? activeView.id : null);
    const managerSession = getHeatmapSession(hotInstance.__heatmapTabId || heatmap.__boundTabId || null, {
      tabId: hotInstance.__heatmapTabId || heatmap.__boundTabId || null,
      reason: 'heatmap-data-views-manager'
    }, { create: true }) || getActiveHeatmapSessionForState();
    if(managerSession?.managers){
      managerSession.managers.dataViews = manager;
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
    const manager = hot.__heatmapDataViewsManager || null;
    if(!manager){
      return;
    }
    manager.updateActiveData(hot.getData() || []);
    manager.updateActiveExclusions(hot?.exportExclusions?.() || null);
    manager.updateActiveFilters?.(hot?.exportFilters?.() || null);
    if(reason === 'afterLoadData'){
      hot.__heatmapPendingProgrammaticLoadSource = '';
      manager.refresh?.();
    }
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
    updateHeatmapRenderRuntime(session || getActiveHeatmapSessionForState(), runtime => {
      runtime.lastRenderModel = null;
      runtime.lastViewOptions = null;
      runtime.textAspectMetrics = null;
      runtime.lastResolvedValueScale = null;
    }, { seedFromActive: true });
    updateHeatmapResultsState(session || getActiveHeatmapSessionForState(), results => {
      results.stats = null;
    });
    debugLog('Debug: heatmap cached render cleared');
  }

  function invalidateHeatmapTransientRenderState(reason){
    clearHiddenDrawFlushHandle();
    updateHeatmapDrawRuntime(getActiveHeatmapSessionForState(), runtime => {
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

  function resetHeatmapActivationDrawState(reason){
    clearHiddenDrawFlushHandle();
    updateHeatmapDrawRuntime(getActiveHeatmapSessionForState(), runtime => {
      runtime.pendingDrawOptions = {};
      runtime.deferredHiddenDrawOptions = null;
      runtime.token = (Number(runtime.token) || 0) + 1;
    }, { seedFromActive: true });
    debugLog('Debug: heatmap activation draw queue reset', {
      reason: reason || 'activate-tab',
      drawToken: state.drawToken
    });
  }

  function captureHeatmapRenderStateSnapshot(session = null){
    const shaped = captureHeatmapSessionStateFromActive(session || getActiveHeatmapSessionForState(), { reason: 'heatmap-render-state-capture' });
    const renderRuntime = shaped?.cache?.renderRuntime || createDefaultHeatmapRenderRuntime({
      lastRenderModel: null,
      lastViewOptions: state.lastViewOptions,
      textAspectMetrics: state.textAspectMetrics,
      lastResolvedValueScale: state.lastResolvedValueScale,
      lastDataShape: state.lastDataShape,
      lastAutoDrawEvaluation: state.lastAutoDrawEvaluation
    });
    return {
      lastRenderModel: cloneSimple(renderRuntime.lastRenderModel),
      lastViewOptions: cloneSimple(renderRuntime.lastViewOptions),
      lastStats: cloneSimple(shaped?.results?.stats ?? state.lastStats),
      statsPanelModel: normalizeHeatmapStatsPanelModel(shaped?.results?.statsPanelModel || captureHeatmapStatsPanelModel()),
      textAspectMetrics: cloneSimple(renderRuntime.textAspectMetrics),
      lastResolvedValueScale: cloneSimple(renderRuntime.lastResolvedValueScale),
      lastDataShape: cloneSimple(renderRuntime.lastDataShape),
      lastAutoDrawEvaluation: cloneSimple(renderRuntime.lastAutoDrawEvaluation),
      dataSignature: typeof renderRuntime.dataSignature === 'string' ? renderRuntime.dataSignature : null,
      settingsSignature: typeof renderRuntime.settingsSignature === 'string' ? renderRuntime.settingsSignature : null
    };
  }

  function restoreHeatmapRenderStateSnapshot(snapshot){
    const source = snapshot && typeof snapshot === 'object' ? snapshot : null;
    if(!source){
      clearCachedRenderState();
      return false;
    }
    updateHeatmapRenderRuntime(getActiveHeatmapSessionForState(), runtime => {
      runtime.lastRenderModel = cloneSimple(source.lastRenderModel) || null;
      runtime.lastViewOptions = cloneSimple(source.lastViewOptions) || null;
      runtime.textAspectMetrics = cloneSimple(source.textAspectMetrics) || null;
      runtime.lastResolvedValueScale = cloneSimple(source.lastResolvedValueScale) || null;
      runtime.lastDataShape = cloneSimple(source.lastDataShape) || { rows: 0, cols: 0 };
      runtime.lastAutoDrawEvaluation = cloneSimple(source.lastAutoDrawEvaluation) || null;
      runtime.dataSignature = typeof source.dataSignature === 'string' ? source.dataSignature : null;
      runtime.settingsSignature = typeof source.settingsSignature === 'string' ? source.settingsSignature : null;
    }, { seedFromActive: true });
    updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
      results.stats = cloneSimple(source.lastStats) || null;
      results.statsPanelModel = normalizeHeatmapStatsPanelModel(source.statsPanelModel || {});
    });
    debugLog('Debug: heatmap render state restored', {
      hasModel: !!getHeatmapActiveRenderModel(getActiveHeatmapSessionForState()),
      hasViewOptions: !!state.lastViewOptions,
      hasStats: !!state.lastStats,
      hasTextAspectMetrics: !!state.textAspectMetrics
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
      return options;
    }
    return {};
  }

  function mergePendingDrawOptions(opts){
    const normalizedOpts = opts && typeof opts === 'object' ? opts : {};
    const targetSession = getHeatmapSession(normalizedOpts.tabId || heatmap.__boundTabId || null, {
      tabId: normalizedOpts.tabId || heatmap.__boundTabId || null,
      reason: 'heatmap-pending-draw-options'
    }, { create: true }) || getActiveHeatmapSessionForState();
    const runtime = getHeatmapDrawRuntime(targetSession, { seedFromActive: !targetSession });
    const previous = cloneSimple(runtime?.pendingDrawOptions || null) || {};
    if(!opts || typeof opts !== 'object'){
      const nextFallback = Object.keys(previous).length
        ? { ...previous, viewOnly: false }
        : { viewOnly: false };
      updateHeatmapDrawRuntime(targetSession, drawRuntime => {
        drawRuntime.pendingDrawOptions = cloneSimple(nextFallback) || {};
      });
      return nextFallback;
    }
    const next = { ...previous, ...opts };
    if(opts.force){
      next.viewOnly = false;
    }else if(Object.prototype.hasOwnProperty.call(opts, 'viewOnly')){
      const requestedViewOnly = !!opts.viewOnly;
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
    if(!Object.prototype.hasOwnProperty.call(opts, 'reason') && next.viewOnly && previous.reason){
      next.reason = previous.reason;
    }
    updateHeatmapDrawRuntime(targetSession, drawRuntime => {
      drawRuntime.pendingDrawOptions = cloneSimple(next) || {};
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
    const targetSession = getHeatmapSession(opts.tabId || heatmap.__boundTabId || null, {
      tabId: opts.tabId || heatmap.__boundTabId || null,
      reason: 'heatmap-deferred-hidden-draw-options'
    }, { create: true }) || getActiveHeatmapSessionForState();
    const runtime = getHeatmapDrawRuntime(targetSession, { seedFromActive: !targetSession });
    const previous = cloneSimple(runtime?.deferredHiddenDrawOptions || null) || {};
    if(!opts || typeof opts !== 'object'){
      const nextFallback = previous && Object.keys(previous).length
        ? { ...previous, viewOnly: false }
        : { viewOnly: false };
      updateHeatmapDrawRuntime(targetSession, drawRuntime => {
        drawRuntime.deferredHiddenDrawOptions = cloneSimple(nextFallback) || null;
      });
      return nextFallback;
    }
    const next = { ...previous, ...opts };
    if(opts.force){
      next.viewOnly = false;
    }else if(Object.prototype.hasOwnProperty.call(opts, 'viewOnly')){
      const requestedViewOnly = !!opts.viewOnly;
      if(requestedViewOnly && previous.viewOnly === false){
        next.viewOnly = false;
      }else{
        next.viewOnly = requestedViewOnly;
      }
    }else{
      next.viewOnly = false;
    }
    if(!Object.prototype.hasOwnProperty.call(opts, 'reason') && previous.reason){
      next.reason = previous.reason;
    }
    updateHeatmapDrawRuntime(targetSession, drawRuntime => {
      drawRuntime.deferredHiddenDrawOptions = cloneSimple(next) || null;
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
    updateHeatmapDrawRuntime(targetSession || getActiveHeatmapSessionForState(), drawRuntime => {
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
      const pending = { ...deferred, tabId: deferred.tabId || drawOwner?.tabId || heatmap.__boundTabId || null };
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
    updateHeatmapRenderRuntime(getActiveHeatmapSessionForState(), runtime => {
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
    updateHeatmapRenderRuntime(getActiveHeatmapSessionForState(), runtime => {
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
    const scheduleOpts = resolvedTabId ? { ...opts, tabId: resolvedTabId } : { ...opts };
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

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'heatmap', role, key });
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'heatmap';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    if(role && (role === 'cellValue' || role.includes('Tick'))){ return; }
    debugLog('Debug: heatmap font mark applied', payload); // Debug: font tagging summary
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
        scheduleHeatmapDrawForSession(getHeatmapSessionForHot(instance, {
          reason: scheduleMeta?.source || scheduleMeta?.reason || 'table-change'
        }, { create: false }), {
          reason: scheduleMeta?.source || scheduleMeta?.reason || 'table-change'
        });
      }, {
        debugLabel: 'heatmap',
        data,
        pinFirstColumn: true,
        rowSelection: null,
        pinFirstRow: true,
        scheduleOnLoadData: true,
        hotOptions: {
          stretchH: 'all',
          minSpareRows: 5,
          afterChange(changes, source){
            if(changes && source !== 'loadData'){
            }
            if(changes){
              syncHeatmapActiveDataViewFromHot(instance, 'afterChange');
              if(source !== 'loadData'){
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
        state.hot.__heatmapTabId = entry?.tabId || heatmap.__boundTabId || null;
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
      tabId: heatmap.__boundTabId || null
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
      syncHeatmapControlStateToSession(getActiveHeatmapSessionForState(), captureHeatmapControlStateFromDom());
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
            const wasChecked = !!aspectCheckbox.checked;
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
              const wasChecked = !!aspectCheckbox.checked;
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
      draw({
        tabId: ownerSession?.tabId || getHeatmapActiveTabId() || undefined,
        force: true,
        viewOnly: false,
        reason: 'user-view-change',
        userInitiated: true
      });
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
        if(eventTabId && heatmap.__boundTabId && String(eventTabId) !== String(heatmap.__boundTabId)){
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
    return { order, tree, steps, maxDistance, baseDistances };
  }

  function shouldUseClusterWorker(items){
    const workerApi = Shared.Workers;
    if(!workerApi || typeof workerApi.isSupported !== 'function' || !workerApi.isSupported()){
      return false;
    }
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
    const tabId = asyncState?.meta?.tabId || asyncState?.meta?.workspaceTabId || heatmap.__boundTabId || null;
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
    return drawToken === currentToken && isHeatmapAsyncCurrent(asyncState);
  }

  function resolveCluster(items, metric, linkage, drawToken, label, asyncState = null){
    if(!Array.isArray(items) || items.length < 2){
      return { result: null, promise: null };
    }
    if(!shouldUseClusterWorker(items)){
      return { result: hierarchicalCluster(items, metric, linkage), promise: null };
    }
    const workerApi = Shared.Workers;
    if(!workerApi || typeof workerApi.runTask !== 'function'){
      return { result: hierarchicalCluster(items, metric, linkage), promise: null };
    }
    const payload = buildClusterWorkerPayload(items, metric, linkage);
    const workerTabId = asyncState?.meta?.tabId || heatmap.__boundTabId || null;
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
    const promise = workerApi.runTask({
      name: 'heatmap-cluster',
      url: HEATMAP_CLUSTER_WORKER.url,
      action: 'hierarchicalCluster',
      payload,
      timeoutMs: HEATMAP_CLUSTER_WORKER.timeoutMs,
      fallback: () => hierarchicalCluster(items, metric, linkage)
    }).then((result) => {
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
          completedAt: Date.now()
        });
        workerSession.updatedAt = Date.now();
      }
      return normalized;
    }).catch((err) => {
      if(workerSession?.workers){
        workerSession.workers.set(`cluster:${label || 'unknown'}`, {
          ...workerRecordBase,
          status: 'error',
          error: err?.message || String(err),
          completedAt: Date.now()
        });
        workerSession.updatedAt = Date.now();
      }
      debugLog('Debug: heatmap cluster worker failed', { label, message: err?.message || String(err) });
      return hierarchicalCluster(items, metric, linkage);
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
    syncHeatmapControlStateToSession(getActiveHeatmapSessionForState(), captureHeatmapControlStateFromDom());
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
      targetView.exclusions = null;
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

  function renderDendrogram({
    doc,
    parent,
    tree,
    order,
    startX,
    startY,
    length,
    cellSize,
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
    const settings = ensureDendrogramSettings();
    const dendrogramColor = settings.color || DEFAULT_DENDROGRAM_COLOR;
    const orderIndex = new Map();
    order.forEach((itemIndex, position) => {
      orderIndex.set(itemIndex, position);
    });
    const safeMaxDistance = maxDistance > 0 ? maxDistance : 1;
    const group = doc.createElementNS(NS, 'g');
    group.setAttribute('class', 'heatmap-dendrogram');
    group.setAttribute('data-dendrogram-orientation', orientation);
    group.setAttribute('fill', 'none');
    group.setAttribute('stroke', dendrogramColor);
    group.setAttribute('stroke-width', String(strokeWidth));
    group.setAttribute('stroke-linecap', 'butt');
    group.setAttribute('stroke-linejoin', 'miter');
    group.setAttribute('shape-rendering', 'geometricPrecision');
    group.setAttribute('vector-effect', 'non-scaling-stroke');
    parent.appendChild(group);

    // Register dendrogram group with dendrogramControls for click handling
    // Register dendrogram group with dendrogramControls for click handling
    if (dendrogramControls && typeof dendrogramControls.registerDendrogramElement === 'function') {
      // Always ensure overlay covers the full bounding box of the dendrogram group
      dendrogramControls.registerDendrogramElement(group, createDendrogramControlConfig(orientation));
      // Optionally, force overlay update after rendering all paths
      scheduleHeatmapAsyncFrame('heatmap-dendrogram-overlay-bounds', () => {
        if (group.__dendrogramControlOverlay && typeof group.getBBox === 'function') {
          const info = group.__dendrogramControlOverlay;
          if (info && info.element) {
            // Recompute overlay bounds to ensure it covers the full area
            if (typeof Shared.dendrogramControls.updateOverlayBounds === 'function') {
              Shared.dendrogramControls.updateOverlayBounds(group, info.element, info.padding);
            }
          }
        }
      });
      debugLog('Debug: heatmap dendrogram registered with controls', { orientation });
    }

    const visitVertical = node => {
      if(!node){
        return { x: startX, y: startY };
      }
      if(!node.left || !node.right){
        const rawIndex = Array.isArray(node.indices) ? node.indices[0] : null;
        const orderPos = orderIndex.has(rawIndex) ? orderIndex.get(rawIndex) : 0;
        const y = startY + orderPos * cellSize + cellSize / 2;
        return { x: startX, y };
      }
      const leftPos = visitVertical(node.left);
      const rightPos = visitVertical(node.right);
      const distance = Math.max(0, Number(node.distance) || 0);
      const nodeX = startX + (distance / safeMaxDistance) * length;
      const nodeY = (leftPos.y + rightPos.y) / 2;
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute(
        'd',
        `M ${leftPos.x} ${leftPos.y} H ${nodeX} V ${rightPos.y} H ${rightPos.x}`
      );
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(path);
      return { x: nodeX, y: nodeY };
    };

    const visitHorizontal = node => {
      if(!node){
        return { x: startX, y: startY };
      }
      if(!node.left || !node.right){
        const rawIndex = Array.isArray(node.indices) ? node.indices[0] : null;
        const orderPos = orderIndex.has(rawIndex) ? orderIndex.get(rawIndex) : 0;
        const x = startX + orderPos * cellSize + cellSize / 2;
        return { x, y: startY };
      }
      const leftPos = visitHorizontal(node.left);
      const rightPos = visitHorizontal(node.right);
      const distance = Math.max(0, Number(node.distance) || 0);
      const nodeY = startY + (distance / safeMaxDistance) * length;
      const nodeX = (leftPos.x + rightPos.x) / 2;
      const path = doc.createElementNS(NS, 'path');
      path.setAttribute(
        'd',
        `M ${leftPos.x} ${leftPos.y} V ${nodeY} H ${rightPos.x} V ${rightPos.y}`
      );
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(path);
      return { x: nodeX, y: nodeY };
    };

    const rootPos = orientation === 'horizontal' ? visitHorizontal(tree) : visitVertical(tree);
    debugLog('Debug: heatmap renderDendrogram complete', {
      orientation,
      startX,
      startY,
      length,
      maxDistance,
      root: rootPos,
      leafCount: order.length
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
    const css = `rgb(${clamp(rgb.r)},${clamp(rgb.g)},${clamp(rgb.b)})`;
    debugLog('Debug: heatmap rgbToCss computed css string', { rgb, css });
    return css;
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

    // Debug log to check mapping
    debugLog('Debug: colorForValue', {
      raw: entry.raw,
      useAbs,
      color
    });

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

  function isSvgBoxAspectLocked(svgBox){
    if(!svgBox){ return false; }
    const dataset = svgBox.dataset || {};
    if(dataset.resizerAspectLocked === 'false'){ return false; }
    if(dataset.resizerAspectLocked === 'true'){ return true; }
    if(dataset.lockRatio === '1' || dataset.lock === '1'){ return true; }
    return false;
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
    const aspectLocked = opts.aspectLocked === true || isSvgBoxAspectLocked(svgBox);
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
      const isCellValueText = text.dataset?.heatmapCellValue === '1'
        || text.dataset?.fontRole === 'cellValue'
        || (typeof text.dataset?.fontKey === 'string' && /^cell-\d+-\d+$/.test(text.dataset.fontKey));
      const localTextScale = isCellValueText ? cellValueTextScale : textScale;
      const localAdjustX = scaleX > 0 ? localTextScale / scaleX : 1;
      const localAdjustY = scaleY > 0 ? localTextScale / scaleY : 1;
      const matrix = `matrix(${localAdjustX},0,0,${localAdjustY},${x - localAdjustX * x},${y - localAdjustY * y})`;
      text.setAttribute('transform', baseTransform ? `${matrix} ${baseTransform}` : matrix);
      text.dataset.heatmapAspectCorrected = '1';
    });
    debugLog('Debug: heatmap text aspect correction applied', {
      scaleX,
      scaleY,
      adjustX,
      adjustY,
      uniform,
      defaultScale,
      textScale,
      cellValueTextScale,
      textScaleMode: mode,
      aspectLocked,
      stableUnlockedScale: Number.isFinite(stableUnlockedScale) ? stableUnlockedScale : null,
      readableScale: readableScale || null,
      cellValueScale: cellValueScale || null
    });
  }

  function renderEmpty(message){
    clearCachedRenderState();
    state.lastResolvedValueScale = null;
    updateHeatmapRenderRuntime(getActiveHeatmapSessionForState(), runtime => {
      runtime.lastResolvedValueScale = null;
    }, { seedFromActive: true });
    syncHeatmapPaletteInputs(resolveHeatmapRoot());
    if(!state.svg) return;
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
    const aspectLocked = isSvgBoxAspectLocked(svgBox);
    state.svg.setAttribute('preserveAspectRatio', aspectLocked ? 'xMidYMid meet' : 'none');
    applySvgBoxAspect(svgBox, {
      locked: aspectLocked,
      width: emptyViewport.width,
      height: emptyViewport.height
    });
    debugLog('Debug: heatmap empty viewBox set', {
      width: emptyViewport.width,
      height: emptyViewport.height,
      source: emptyViewport.source,
      aspectLocked,
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
      markFontEditable(text, 'emptyMessage', 'heatmap-empty');
      ensureGraphViewport(state.svg, {
        padding: 16,
        preserveAspectRatio: aspectLocked ? 'xMidYMid meet' : 'none',
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
    debugLog('Debug: heatmap appendStatRow executed', { labelText, hasStrongValue: strongValueText !== undefined, trailingCount: trailing.length }); // Debug: track stat row creation
    return row;
  }

  function updateStats(stats){
    state.lastStats = stats ? { ...stats } : null;
    updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
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
      updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
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
      updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
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
      updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
        results.stats = cloneSimple(state.lastStats) || null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(panelModel);
      });
      return;
    }
    if(stats.type === 'empty'){
      state.statsEl.textContent = stats.message || 'No data available for the current configuration.';
      state.statsPanelModel = { resultsModel: null, reportModel: null };
      updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
        results.stats = cloneSimple(state.lastStats) || null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel);
      });
      return;
    }
    state.statsEl.textContent = 'Add numeric data to draw the heatmap.';
    state.statsPanelModel = { resultsModel: null, reportModel: null };
    updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
      results.stats = cloneSimple(state.lastStats) || null;
      results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel);
    });
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
    drawSession = null
  }){
    state.isRendering = true;
    try{
    const ownerSession = ensureHeatmapSessionOwnershipShape(drawSession || getActiveHeatmapSessionForState());
    const rowCount = orderedRowLabels.length;
    const columnCount = orderedColumnLabels.length;
    if(rowCount === 0 || columnCount === 0){
      renderEmpty(Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null);
      return;
    }
    const doc = global.document;
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
    const heatmapWidth = columnCount * cellSize;
    const heatmapHeight = rowCount * cellSize;
    const svgBox = state.svgBox || state.svg?.closest('.svgbox') || null;
    const aspectLocked = isSvgBoxAspectLocked(svgBox);
    const baseLabelFontSize = Math.max(6, Math.round(scaledFontSize));
    const parseFontSizePx = value => {
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
    };
    const fontStyles = exportFontStyles('heatmap') || null;
    const graphFontSize = parseFontSizePx(fontStyles?.__graph__?.fontSize);
    const resolveLabelFontSize = (key, fallback) => {
      const override = parseFontSizePx(fontStyles?.[key]?.fontSize);
      return Number.isFinite(override) ? override : (Number.isFinite(graphFontSize) ? graphFontSize : fallback);
    };
    const rowLabelFontSizes = orderedRowLabels.map((_, index) => resolveLabelFontSize(`row-label-${index}`, baseLabelFontSize));
    const columnLabelFontSizes = orderedColumnLabels.map((_, index) => resolveLabelFontSize(`column-label-${index}`, baseLabelFontSize));
    const titleFontSize = resolveLabelFontSize('graphTitle', Number.isFinite(graphFontSize) ? graphFontSize : scaledFontSize);
    const maxRowLabelFontSize = rowLabelFontSizes.reduce((acc, value) => Math.max(acc, value), baseLabelFontSize);
    const maxColumnLabelFontSize = columnLabelFontSizes.reduce((acc, value) => Math.max(acc, value), baseLabelFontSize);
    // Define label measurement helpers early for margin calculation
    const labelMeasureFont = size => {
      const safeSize = Math.max(4, Math.round(size || baseLabelFontSize));
      return chartStyle.makeFont ? chartStyle.makeFont(safeSize) : `${safeSize}px sans-serif`;
    };
    const measureLabelWidth = (label, size) => {
      if(typeof chartStyle.measureText === 'function'){
        try{
          return chartStyle.measureText(label || '', labelMeasureFont(size));
        }catch(err){
          console.warn('heatmap label measureText error', err);
        }
      }
      const fallbackSize = Number.isFinite(size) ? size : baseLabelFontSize;
      return String(label || '').length * fallbackSize * 0.6;
    };
    const extraLabelColumnWidth = Math.max(0, Number(layoutAdjust?.extraLabelColumnWidth) || 0);
    const extraLabelRowHeight = Math.max(0, Number(layoutAdjust?.extraLabelRowHeight) || 0);
    let marginRight = 120;
    let marginBottom = 120;
    const outerPadding = Math.max(24, Math.round(scaledFontSize * 1.25));
    const titleGap = Math.max(8, Math.round(titleFontSize * 0.6));
    const titleHeight = Math.max(16, Math.round(titleFontSize * 1.1));
    const matrixLeft = outerPadding;
    const matrixTop = outerPadding + titleHeight + titleGap;
    const dendroHeatmapGap = 0;
    const rowDendroWidth = showRowDendrogram && rowClustering?.tree
      ? Math.min(320, Math.max(60, Math.round(Math.max(cellSize * 1.6, heatmapWidth * 0.18))))
      : 0;
    const columnDendroHeight = showColumnDendrogram && columnClustering?.tree
      ? Math.min(280, Math.max(60, Math.round(Math.max(cellSize * 1.3, heatmapHeight * 0.18))))
      : 0;
    const dendroPadding = (rowDendroWidth || columnDendroHeight) ? Math.max(12, Math.round(cellSize * 0.25)) : Math.max(8, Math.round(cellSize * 0.2));
    if(rowDendroWidth){
      marginRight += rowDendroWidth + dendroPadding;
    }
    if(columnDendroHeight){
      marginBottom += columnDendroHeight + dendroPadding;
    }
    const scaleWidth = 36;
    const scalePadding = 24;
    const scaleLabelGap = 48;
    marginRight += scaleWidth + scalePadding + scaleLabelGap;
    const maxRowLabelWidth = orderedRowLabels.reduce((acc, label, index) => Math.max(acc, measureLabelWidth(label, rowLabelFontSizes[index])), 0);
    const maxColumnLabelWidth = orderedColumnLabels.reduce((acc, label, index) => Math.max(acc, measureLabelWidth(label, columnLabelFontSizes[index])), 0);
    const rowLabelPadding = Math.max(6, Math.round(maxRowLabelFontSize * 0.35));
    const columnLabelPadding = Math.max(6, Math.round(maxColumnLabelFontSize * 0.35));
    const columnLabelDescenderPad = Math.max(4, Math.ceil(maxColumnLabelFontSize * 0.25));
    const computeAspectAdjust = (viewWidth, viewHeight) => {
      if(aspectLocked){
        return { adjustX: 1, adjustY: 1 };
      }
      const displayWidth = Number(drawableFrame.width);
      const displayHeight = Number(drawableFrame.height);
      if(!Number.isFinite(displayWidth) || !Number.isFinite(displayHeight) || displayWidth <= 0 || displayHeight <= 0){
        return { adjustX: 1, adjustY: 1 };
      }
      const scaleX = viewWidth > 0 ? displayWidth / viewWidth : 1;
      const scaleY = viewHeight > 0 ? displayHeight / viewHeight : 1;
      if(!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0){
        return { adjustX: 1, adjustY: 1 };
      }
      const minScale = Math.min(scaleX, scaleY);
      const textScale = Number.isFinite(minScale) && minScale > 0 ? minScale : (Math.sqrt(Math.max(scaleX * scaleY, 0)) || 1);
      const adjustX = scaleX > 0 ? textScale / scaleX : 1;
      const adjustY = scaleY > 0 ? textScale / scaleY : 1;
      return {
        adjustX: Math.max(1, adjustX),
        adjustY: Math.max(1, adjustY),
        scaleX,
        scaleY,
        textScale,
        scaleMode: 'min'
      };
    };
    const buildLayout = (adjustX, adjustY) => {
      const lengthScale = Number.isFinite(adjustX) ? adjustX : 1;
      const paddingX = rowLabelPadding * lengthScale;
      const paddingY = columnLabelPadding * lengthScale;
      const descenderY = columnLabelDescenderPad * lengthScale;
      // Column labels are rotated; their length scales with X correction.
      const labelColumnWidth = Math.max(cellSize, Math.ceil(maxRowLabelWidth * lengthScale + paddingX * 2));
      const labelRowHeight = Math.max(cellSize, Math.ceil(maxColumnLabelWidth * lengthScale + paddingY * 2 + descenderY));
      return {
        labelColumnWidth,
        labelRowHeight,
        matrixLeft,
        matrixTop,
        totalWidth: matrixLeft + labelColumnWidth + heatmapWidth + marginRight,
        totalHeight: matrixTop + labelRowHeight + heatmapHeight + marginBottom,
        paddingX,
        paddingY,
        descenderY
      };
    };
    let layout = buildLayout(1, 1);
    let aspectAdjust = computeAspectAdjust(layout.totalWidth, layout.totalHeight);
    if(aspectAdjust.adjustX > 1 || aspectAdjust.adjustY > 1){
      layout = buildLayout(aspectAdjust.adjustX, aspectAdjust.adjustY);
      const refinedAdjust = computeAspectAdjust(layout.totalWidth, layout.totalHeight);
      const finalAdjustX = Math.max(aspectAdjust.adjustX, refinedAdjust.adjustX);
      const finalAdjustY = Math.max(aspectAdjust.adjustY, refinedAdjust.adjustY);
      if(finalAdjustX > aspectAdjust.adjustX + 0.01 || finalAdjustY > aspectAdjust.adjustY + 0.01){
        layout = buildLayout(finalAdjustX, finalAdjustY);
      }
      aspectAdjust = { ...aspectAdjust, adjustX: finalAdjustX, adjustY: finalAdjustY };
    }
    const labelColumnWidth = layout.labelColumnWidth + extraLabelColumnWidth;
    const labelRowHeight = layout.labelRowHeight + extraLabelRowHeight;
    const labelPaddingX = layout.paddingX;
    const labelPaddingY = layout.paddingY;
    const labelDescenderPadY = layout.descenderY;
    const totalWidth = layout.totalWidth + extraLabelColumnWidth;
    const totalHeight = layout.totalHeight + extraLabelRowHeight;
    // Label row/column are part of the matrix layout so font changes expand the overall bounds.
    state.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    const preserveAspect = aspectLocked ? 'xMidYMid meet' : 'none';
    state.svg.setAttribute('preserveAspectRatio', preserveAspect);
    applySvgBoxAspect(svgBox, { locked: aspectLocked, width: totalWidth, height: totalHeight });
    debugLog('Debug: heatmap graph viewBox set', {
      aspectLocked,
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
        // Use absolute positioning (backward compatibility)
        absoluteTitleX = titlePos.x;
        absoluteTitleY = titlePos.y;
      }
    }
    
    title.setAttribute('x', String(absoluteTitleX));
    title.setAttribute('y', String(absoluteTitleY));
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', String(titleFontSize));
    title.textContent = state.titleText != null ? String(state.titleText) : 'Heatmap';
    markFontEditable(title, 'graphTitle', 'graphTitle');
    const applyHeatmapTitle = value => {
      const nextValue = value != null ? String(value) : '';
      patchHeatmapVisualState(ownerSession || getActiveHeatmapSessionForState(), { titleText: nextValue }, { reason: 'heatmap-title-edit' });
      if(title.textContent !== nextValue){
        title.textContent = nextValue;
      }
      scheduleHeatmapDrawForSession(ownerSession || getActiveHeatmapSessionForState(), { reason: 'heatmap-title-edit' });
    };
    makeEditable(title, txt => {
      const previous = state.titleText != null ? String(state.titleText) : '';
      const nextValue = txt != null ? String(txt) : '';
      if(previous === nextValue){
        return;
      }
      applyHeatmapTitle(nextValue);
      recordHeatmapChange('heatmap:title', previous, nextValue, applyHeatmapTitle);
    });
    // Enable drag for title
    if(typeof Shared.enableLabelDrag === 'function'){
      Shared.enableLabelDrag(title, state.svg, {
        onDragEnd: pos => {
          // Store both absolute and relative positions
          const relX = pos.x / totalWidth;
          const relY = pos.y / matrixTop;
          patchHeatmapLabelPosition(ownerSession || getActiveHeatmapSessionForState(), 'title', { 
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
    const rowLabelGroup = doc.createElementNS(NS, 'g');
    rowLabelGroup.setAttribute('data-layer', 'row-labels');
    g.appendChild(rowLabelGroup);
    const columnLabelGroup = doc.createElementNS(NS, 'g');
    columnLabelGroup.setAttribute('data-layer', 'column-labels');
    g.appendChild(columnLabelGroup);
    orderedRowLabels.forEach((label, index) => {
      const text = doc.createElementNS(NS, 'text');
      const x = matrixLeft + labelColumnWidth - labelPaddingX;
      const y = dataStartY + index * cellSize + cellSize / 2;
      const labelFontSize = rowLabelFontSizes[index] || baseLabelFontSize;
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', 'end');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', String(labelFontSize));
      setHeatmapBaseTransform(text, text.getAttribute('transform') || '');
      text.textContent = label;
      markFontEditable(text, 'rowLabel', `row-label-${index}`);
      rowLabelGroup.appendChild(text);
    });
    orderedColumnLabels.forEach((label, index) => {
      const text = doc.createElementNS(NS, 'text');
      const x = dataStartX + index * cellSize + cellSize / 2;
      const y = matrixTop + labelRowHeight - labelPaddingY;
      const labelFontSize = columnLabelFontSizes[index] || baseLabelFontSize;
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('font-size', String(labelFontSize));
      // Anchor the start at the row floor so text flows upward inside the label row.
      text.setAttribute('text-anchor', 'start');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('transform', `rotate(-90 ${x} ${y})`);
      setHeatmapBaseTransform(text, text.getAttribute('transform') || '');
      text.textContent = label;
      markFontEditable(text, 'columnLabel', `column-label-${index}`);
      columnLabelGroup.appendChild(text);
    });
    // Create a separate layer for the data matrix cells to support composite export (PNG matrix + SVG labels)
    const cellLayer = doc.createElementNS(NS, 'g');
    cellLayer.setAttribute('data-export-layer', 'heatmap-cells');
    cellLayer.setAttribute('data-layer', 'cells');
    g.appendChild(cellLayer);
    const cellValuePadding = Math.max(1, Math.round(cellSize * 0.08));
    const cellInnerSize = Math.max(1, cellSize - (cellValuePadding * 2));
    const cellValueHeightFactor = 1.15;
    const baseGraphFontSize = Number.isFinite(graphFontSize) ? graphFontSize : scaledFontSize;
    let cellValueFontSize = Math.min(
      Math.max(6, Math.round(baseGraphFontSize * 0.85)),
      Math.max(6, Math.floor(cellInnerSize))
    );
    const cellValueTexts = [];
    const showCellText = Array.isArray(orderedCells) && orderedCells.some(row => Array.isArray(row) && row.some(cell => String(cell?.displayText || '').trim()));
    if(showCellText){
      const seen = new Set();
      let longest = '';
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
          if(maskLower && columnIndex < rowIndex){
            continue;
          }
          const text = String(orderedCells[rowIndex]?.[columnIndex]?.displayText || '').trim();
          if(!text){ continue; }
          if(text.length > longest.length){
            longest = text;
          }
          if(seen.size < 256 && !seen.has(text)){
            seen.add(text);
            cellValueTexts.push(text);
          }
        }
      }
      if(longest && !seen.has(longest)){
        cellValueTexts.push(longest);
      }
    }
    const measureCellValueWidthAt = fontPx => {
      if(!cellValueTexts.length){ return 0; }
      const font = chartStyle.makeFont ? chartStyle.makeFont(Math.max(4, Math.round(fontPx))) : `${Math.max(4, Math.round(fontPx))}px sans-serif`;
      let maxWidth = 0;
      for(let i = 0; i < cellValueTexts.length; i += 1){
        const value = cellValueTexts[i];
        let width = NaN;
        if(typeof chartStyle.measureText === 'function'){
          try{
            width = chartStyle.measureText(value, font);
          }catch(err){
            width = NaN;
          }
        }
        if(!Number.isFinite(width)){
          width = String(value || '').length * Math.max(4, fontPx) * 0.6;
        }
        if(width > maxWidth){
          maxWidth = width;
        }
      }
      return maxWidth;
    };
    let cellValueMaxTextWidth = measureCellValueWidthAt(cellValueFontSize);
    const cellValueFits = (fontPx, widthPx) => {
      if(!Number.isFinite(fontPx) || fontPx <= 0){ return true; }
      const safeWidth = Number.isFinite(widthPx) ? widthPx : 0;
      return safeWidth <= cellInnerSize + 0.01 && (fontPx * cellValueHeightFactor) <= cellInnerSize + 0.01;
    };
    if(showCellText && cellValueTexts.length && !cellValueFits(cellValueFontSize, cellValueMaxTextWidth)){
      const widthRatio = cellInnerSize / Math.max(cellValueMaxTextWidth, 1);
      const heightRatio = cellInnerSize / Math.max(cellValueFontSize * cellValueHeightFactor, 1);
      const ratio = Math.min(1, widthRatio, heightRatio);
      cellValueFontSize = Math.max(4, Math.floor(cellValueFontSize * ratio));
      cellValueMaxTextWidth = measureCellValueWidthAt(cellValueFontSize);
      while(cellValueFontSize > 4 && !cellValueFits(cellValueFontSize, cellValueMaxTextWidth)){
        cellValueFontSize -= 1;
        cellValueMaxTextWidth = measureCellValueWidthAt(cellValueFontSize);
      }
    }
    debugLog('Debug: heatmap cell value font resolved', {
      showValues: !!showValues,
      showCellText: !!showCellText,
      cellSize,
      cellInnerSize,
      cellValuePadding,
      samples: cellValueTexts.length,
      fontSize: cellValueFontSize,
      maxTextWidth: cellValueMaxTextWidth
    });
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      for(let columnIndex = 0; columnIndex < columnCount; columnIndex += 1){
        if(maskLower && columnIndex < rowIndex){
          continue;
        }
        const cell = orderedCells[rowIndex]?.[columnIndex] || {};
        const x = dataStartX + columnIndex * cellSize;
        const y = dataStartY + rowIndex * cellSize;
        const rect = doc.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(cellSize));
        rect.setAttribute('height', String(cellSize));
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
          text.setAttribute('x', String(x + cellSize / 2));
          text.setAttribute('y', String(y + cellSize / 2));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'middle');
          text.setAttribute('font-size', String(cellValueFontSize));
          text.setAttribute('fill', textColorForBackground(cell.fill || '#d0d0d0'));
          text.textContent = cellText;
          text.setAttribute('data-heatmap-cell-value', '1');
          if(text.dataset){
            text.dataset.heatmapCellValue = '1';
          }
          markFontEditable(text, 'cellValue', `cell-${rowIndex}-${columnIndex}`);
          cellLayer.appendChild(text);
        }
      }
    }
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
    // Scale strokes using the minimum axis factor so thickness only changes when both axes stretch.
    const scaleX = drawableFrame.width && totalWidth ? drawableFrame.width / totalWidth : 1;
    const scaleY = drawableFrame.height && totalHeight ? drawableFrame.height / totalHeight : 1;
    const minScale = Math.min(scaleX, scaleY);
    const hasScaleX = Number.isFinite(scaleX) && scaleX > 0;
    const hasScaleY = Number.isFinite(scaleY) && scaleY > 0;
    const scalesUp = hasScaleX && hasScaleY && scaleX > 1 && scaleY > 1;
    const scalesDown = hasScaleX && hasScaleY && scaleX < 1 && scaleY < 1;
    const strokeScale = (scalesUp || scalesDown) ? minScale : 1;
    // Compute auto-scaled dendrogram thickness based on cell size (original behavior)
    const autoScaledThickness = Math.max(1, Math.min(3, Math.round(cellSize * 0.025 * 10) / 10));
    // Use user-defined thickness from state if set, otherwise use auto-scaled value
    const dendroSettings = getHeatmapDendrogramSettings();
    const userThickness = dendroSettings.thickness;
    // If user thickness is at default (1), use auto-scaling; otherwise use user value
    const dendrogramStrokeBase = (userThickness === DEFAULT_DENDROGRAM_THICKNESS) ? autoScaledThickness : userThickness;
    const dendrogramStroke = dendrogramStrokeBase * strokeScale;
    const scaleGroup = doc.createElementNS(NS, 'g');
    scaleGroup.setAttribute('class', 'heatmap-color-scale');
    const scaleRect = doc.createElementNS(NS, 'rect');
    scaleRect.setAttribute('x', String(scaleStartX));
    scaleRect.setAttribute('y', String(scaleStartY));
    scaleRect.setAttribute('width', String(scaleWidth));
    scaleRect.setAttribute('height', String(scaleHeight));
    scaleRect.setAttribute('fill', `url(#${gradientId})`);
    scaleRect.setAttribute('stroke', '#333');
    scaleRect.setAttribute('stroke-width', String(strokeScale));
    scaleRect.setAttribute('vector-effect', 'non-scaling-stroke');
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
      line.setAttribute('stroke-width', String(strokeScale));
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      scaleGroup.appendChild(line);
      const tickLabel = doc.createElementNS(NS, 'text');
      tickLabel.setAttribute('x', String(tickLabelX));
      tickLabel.setAttribute('y', String(y));
      tickLabel.setAttribute('dominant-baseline', 'middle');
      tickLabel.setAttribute('font-size', String(tickFont));
      tickLabel.textContent = tick.label !== undefined ? String(tick.label) : (colorScale?.tickFormatter ? colorScale.tickFormatter(tick.value) : String(tick.value));
      markFontEditable(tickLabel, 'scaleTick', `scale-tick-${tick.value}`);
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
      cellSize,
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
      cellValueHeightFactor
    };
    updateHeatmapRenderRuntime(getActiveHeatmapSessionForState(), runtime => {
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
        cellSize,
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
        cellSize,
        maxDistance: columnClustering.maxDistance,
        orientation: 'horizontal',
        strokeWidth: dendrogramStroke
      });
    }
    if(!aspectLocked){
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: totalWidth,
        viewBoxHeight: totalHeight,
        displayWidth: svgRect?.width,
        displayHeight: svgRect?.height,
        debugLabel: 'heatmap-text-correction-pre',
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
      ensureGraphViewport(state.svg, {
        padding: Math.max(fontSize, 16),
        minWidth: totalWidth,
        minHeight: totalHeight,
        preserveAspectRatio: preserveAspect,
        debugLabel: 'heatmap-graph-corrected',
        remeasure: false
      });
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: state.svg.viewBox?.baseVal?.width ?? totalWidth,
        viewBoxHeight: state.svg.viewBox?.baseVal?.height ?? totalHeight,
        displayWidth: svgRect?.width,
        displayHeight: svgRect?.height,
        debugLabel: 'heatmap-text-correction',
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
    }else{
      ensureGraphViewport(state.svg, {
        padding: Math.max(fontSize, 16),
        minWidth: totalWidth,
        minHeight: totalHeight,
        preserveAspectRatio: preserveAspect,
        debugLabel: 'heatmap-graph',
        remeasure: false
      });
      applyTextAspectCorrection({
        svg: state.svg,
        svgBox,
        viewBoxWidth: state.svg.viewBox?.baseVal?.width ?? totalWidth,
        viewBoxHeight: state.svg.viewBox?.baseVal?.height ?? totalHeight,
        displayWidth: svgRect?.width,
        displayHeight: svgRect?.height,
        debugLabel: 'heatmap-text-correction-locked',
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
    }
    const measureTextBounds = (nodes) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      if(!nodes){ return null; }
      nodes.forEach(node => {
        if(!node || typeof node.getBBox !== 'function'){ return; }
        let bbox = null;
        try{
          bbox = node.getBBox();
        }catch(err){
          return;
        }
        if(!bbox || !Number.isFinite(bbox.x) || !Number.isFinite(bbox.y)){ return; }
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
      });
      if(minX === Infinity || minY === Infinity){
        return null;
      }
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    };
    const measureTextScreenBounds = (nodes) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      if(!nodes){ return null; }
      nodes.forEach(node => {
        if(!node || typeof node.getBoundingClientRect !== 'function'){ return; }
        let rect = null;
        try{
          rect = node.getBoundingClientRect();
        }catch(err){
          return;
        }
        if(!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)){ return; }
        minX = Math.min(minX, rect.left);
        minY = Math.min(minY, rect.top);
        maxX = Math.max(maxX, rect.right);
        maxY = Math.max(maxY, rect.bottom);
      });
      if(minX === Infinity || minY === Infinity){
        return null;
      }
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    };
    const reflowCount = Number.isFinite(layoutAdjust?.reflowed) ? Number(layoutAdjust.reflowed) : 0;
    const maxReflowPasses = HEATMAP_MAX_LAYOUT_REFLOW_PASSES;
    if(reflowCount < maxReflowPasses){
      const getLabelBounds = (group) => {
        if(!group){ return null; }
        const previousClip = group.getAttribute('clip-path');
        if(previousClip){
          group.removeAttribute('clip-path');
        }
        const bounds = measureTextBounds(group.querySelectorAll('text'));
        if(previousClip){
          group.setAttribute('clip-path', previousClip);
        }
        return bounds;
      };
      const rowLabelBounds = getLabelBounds(rowLabelGroup);
      const columnLabelBounds = getLabelBounds(columnLabelGroup);
      const columnLabelScreenBounds = measureTextScreenBounds(columnLabelGroup.querySelectorAll('text'));
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
        const effectiveScaleY = aspectLocked
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
    const skipFinalViewportExpansion = aspectLocked && isSymmetricCorrelationMatrix;
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
        textScaleMode: HEATMAP_TEXT_SCALE_MODE
      });
      ensureGraphViewport(state.svg, {
        padding: Math.max(fontSize, 16),
        minWidth: totalWidth,
        minHeight: totalHeight,
        preserveAspectRatio: preserveAspect,
        debugLabel: 'heatmap-graph-final',
        remeasure: false
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
        const columnBounds = measureTextScreenBounds(columnLabelNodes);
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
        const effectiveScaleY = aspectLocked
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
          textScaleMode: HEATMAP_TEXT_SCALE_MODE
        });
        ensureGraphViewport(state.svg, {
          padding: Math.max(fontSize, 16),
          minWidth: totalWidth,
          minHeight: totalHeight,
          preserveAspectRatio: preserveAspect,
          debugLabel: `heatmap-graph-clearance-${pass}`,
          remeasure: false
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
    ensureTitleColumnLabelClearance();
    state.layout?.syncPanels?.({ skipSchedule: true });
    debugLog('Debug: heatmap drawHeatmap complete', {
      rows: rowCount,
      columns: columnCount,
      showRowDendrogram,
      showColumnDendrogram,
      skipFinalViewportExpansion
    });
    } finally {
      state.isRendering = false;
    }
  }

  function renderCorrelationHeatmap(processed, settings, drawToken, asyncState = null){
    const renderSession = getHeatmapSession(asyncState?.meta?.tabId || heatmap.__boundTabId || null, asyncState?.meta || {}, { create: false }) || getActiveHeatmapSessionForState();
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
      renderEmpty(Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null);
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
      renderModelWithView(model, viewOptions, renderSession, asyncState?.meta || {});
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
        rowClusterLabel: resolvedCluster && clusterConfig.enabled ? `${clusterConfig.metric} (${settings.clustering.linkage})` : null,
        columnClusterLabel: resolvedCluster && clusterConfig.enabled ? `${clusterConfig.metric} (${settings.clustering.linkage})` : null,
        rowDendrogram: showRowDendrogram,
        columnDendrogram: showColumnDendrogram
      });
    };

    if(clusterState.promise){
      return clusterState.promise.then((clusterResult) => {
        if(!clusterResult || !isHeatmapDrawCurrent(drawToken, asyncState)){
          return;
        }
        renderWithCluster(clusterResult);
      });
    }

    renderWithCluster(clusterState.result);
  }

  function renderValuesHeatmap(processed, settings, drawToken, asyncState = null){
    const renderSession = getHeatmapSession(asyncState?.meta?.tabId || heatmap.__boundTabId || null, asyncState?.meta || {}, { create: false }) || getActiveHeatmapSessionForState();
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
      renderModelWithView(model, viewOptions, renderSession, asyncState?.meta || {});
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
        rowClusterLabel: resolvedRow && settings.clustering.rows.enabled ? `${settings.clustering.rows.metric} (${settings.clustering.linkage})` : null,
        columnClusterLabel: resolvedColumn && settings.clustering.columns.enabled ? `${settings.clustering.columns.metric} (${settings.clustering.linkage})` : null,
        rowDendrogram: showRowDendrogram,
        columnDendrogram: showColumnDendrogram,
        adjustments: processed.adjustmentSummary
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
        renderWithClusters(rowCluster, columnCluster);
      });
    }

    renderWithClusters(rowClusterState.result, columnClusterState.result);
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

  function renderModelWithView(model, viewOptions, session = null, signatureMeta = {}){
    const renderSession = session || getActiveHeatmapSessionForState();
    const payload = buildDrawPayloadFromModel(model, viewOptions);
    if(!payload){
      debugLog('Debug: heatmap renderModelWithView skipped - missing payload');
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
    updateHeatmapRenderRuntime(renderSession, runtime => {
      runtime.lastRenderModel = model;
      runtime.lastViewOptions = viewOptions;
      runtime.lastResolvedValueScale = cloneSimple(state.lastResolvedValueScale) || null;
      runtime.lastDataShape = cloneSimple(state.lastDataShape) || { rows: 0, cols: 0 };
      runtime.lastAutoDrawEvaluation = cloneSimple(state.lastAutoDrawEvaluation) || null;
      runtime.textAspectMetrics = cloneSimple(state.textAspectMetrics) || null;
      runtime.dataSignature = typeof signatureMeta?.dataSignature === 'string' ? signatureMeta.dataSignature : runtime.dataSignature || null;
      runtime.settingsSignature = typeof signatureMeta?.settingsSignature === 'string'
        ? signatureMeta.settingsSignature
        : createHeatmapSettingsSignature(viewOptions || {});
    }, { seedFromActive: true });
    return true;
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

  function draw(options = {}){
    const scheduledSession = getActiveHeatmapSessionForState();
    const scheduledRuntime = getHeatmapDrawRuntime(scheduledSession, { seedFromActive: true });
    const requestedOptions = normalizeDrawOptions(options);
    const pendingOptions = cloneSimple(scheduledRuntime?.pendingDrawOptions || null) || {};
    const drawOpts = Object.keys(requestedOptions).length
      ? { ...pendingOptions, ...requestedOptions }
      : pendingOptions;
    const requestedSession = getHeatmapSessionForDrawOptions(drawOpts, {
      tabId: drawOpts.tabId || null,
      reason: drawOpts.reason || 'heatmap-draw-session',
      fallbackActive: true
    });
    if(requestedSession && !isHeatmapSessionActiveForModuleState(requestedSession)){
      updateHeatmapDrawRuntime(requestedSession, runtime => {
        runtime.pendingDrawOptions = cloneSimple(drawOpts) || {};
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
    const drawSession = bindHeatmapSessionForTab(drawOpts.tabId || heatmap.__boundTabId || null, {
      ...(drawOpts || {}),
      reason: drawOpts.reason || 'heatmap-draw-session'
    }) || requestedSession || scheduledSession;
    updateHeatmapDrawRuntime(drawSession, runtime => {
      runtime.pendingDrawOptions = {};
    });
    const perfStart = nowMs();
    let prepareEnd = perfStart;
    let renderStart = perfStart;
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
        error: meta.error || null
      });
    };
    try{
      if(!state.hot || !state.svg){
        debugLog('Debug: heatmap draw skipped - missing hot or svg');
        finalizeDrawPerformance({ status: 'skipped', error: 'missing-hot-or-svg' });
        return;
      }
      if(isHeatmapWorkspaceHidden()){
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
      const drawTabId = drawOpts.tabId || drawSession?.tabId || heatmap.__boundTabId || null;
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
      const settings = resolveHeatmapEffectiveSettings(collectSettings(drawSession));
      const renderRuntime = getHeatmapRenderRuntime(drawSession, { seedFromActive: false });
      const cachedRenderModel = renderRuntime?.lastRenderModel || getHeatmapActiveRenderModel(drawSession);
      const viewMatches = (cachedRenderModel?.type === 'values' && settings.view === 'values')
        || (cachedRenderModel?.type === 'correlation' && settings.view.startsWith('corr'));
      if(drawOpts.viewOnly){
        if(cachedRenderModel && viewMatches){
          const viewOptions = extractViewOptions(settings);
          const applied = renderModelWithView(cachedRenderModel, viewOptions, drawSession, { settingsSignature: createHeatmapSettingsSignature(viewOptions || {}) });
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
          renderEmpty(Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : null);
          updateStats(null);
        }else if(reason === 'filtered-out'){
          renderEmpty('No rows passed the current filters. Adjust your thresholds to view data.');
          updateStats({ type: 'empty', message: 'No rows passed the current filters.' });
        }else if(reason === 'adjustment-empty'){
          renderEmpty('All columns were removed after adjustments. Check normalization and centering settings.');
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
      const renderResult = settings.view === 'values'
        ? renderValuesHeatmap(processed, settings, drawToken, drawAsyncState)
        : renderCorrelationHeatmap(processed, settings, drawToken, drawAsyncState);
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
      fontStyles: exportFontStyles('heatmap') || undefined,
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
      const configSession = getActiveHeatmapSessionForState();
      if(configSession){
        configSession.state.palette = { ...state.palette };
        configSession.state.valueScale = { ...state.valueScale };
        configSession.state.legendHeightMode = state.legendHeightMode;
        configSession.updatedAt = Date.now();
      }
      state.lastResolvedValueScale = null;
      updateHeatmapRenderRuntime(getActiveHeatmapSessionForState(), runtime => {
        runtime.lastResolvedValueScale = null;
      }, { seedFromActive: true });
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
      importFontStyles('heatmap', config.fontStyles || null);
      syncHeatmapControlStateToSession(getActiveHeatmapSessionForState(), restoredControls);
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
    console.debug('Debug: heatmap.createEmptyPayload pure factory invoked', {
      ready: !!heatmap.ready,
      boundTabId: heatmap.__boundTabId || null
    });
    const payload = { type: 'heatmap', config: {} };
    payload.type = 'heatmap';
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
      syncHeatmapNotesStateToSession(getActiveHeatmapSessionForState(), restoredNotes);
      applyHeatmapNotesStateToControl(getActiveHeatmapSessionForState());
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
      updateHeatmapResultsState(getActiveHeatmapSessionForState(), results => {
        results.stats = cloneSimple(state.lastStats) || null;
        results.statsPanelModel = normalizeHeatmapStatsPanelModel(state.statsPanelModel || {});
      });
      captureHeatmapSessionStateFromActive(getActiveHeatmapSessionForState(), { reason: `heatmap-payload-apply:${meta?.source || 'unknown'}` });
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
    distanceBetweenVectors
  });

  heatmap.draw = draw;
  heatmap.cancelCurrentDraw = function cancelCurrentDraw(meta = {}){
    const tabId = meta?.tabId || heatmap.__boundTabId || null;
    const session = tabId ? getHeatmapSession(tabId, { ...(meta || {}), tabId, reason: 'heatmap-cancel-current-draw' }, { create: false }) : getActiveHeatmapSessionForState();
    updateHeatmapDrawRuntime(session || getActiveHeatmapSessionForState(), runtime => {
      runtime.pendingDrawOptions = {};
      runtime.deferredHiddenDrawOptions = null;
      runtime.token = (Number(runtime.token) || 0) + 1;
    }, { seedFromActive: true });
    try{ heatmap.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'heatmap-draw-cancel'); }catch(_err){}
    try{ heatmap.__drawAsyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'heatmap-draw-cancel'); }catch(_err){}
    resolveHeatmapOverlay(meta?.reason || 'cancelled');
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
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('heatmap notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    const noteSession = getActiveHeatmapSessionForState();
    const noteState = getHeatmapNotesState(noteSession);
    if(notesState.control?.root && notesState.control.root.isConnected){
      applyHeatmapNotesStateToControl(noteSession, { control: notesState.control });
      return;
    }
    notesState.control = helper.mountFoldable({
      container: stack,
      id: 'heatmap-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'heatmap',
      fontKey: 'notes',
      value: noteState.text || '',
      open: !!noteState.open,
      onChange: value => {
        syncHeatmapNotesStateToSession(getActiveHeatmapSessionForState(), {
          text: value == null ? '' : String(value),
          open: getHeatmapNotesState(getActiveHeatmapSessionForState()).open
        });
      },
      onToggle: open => {
        syncHeatmapNotesStateToSession(getActiveHeatmapSessionForState(), {
          text: getHeatmapNotesState(getActiveHeatmapSessionForState()).text,
          open: !!open
        });
      }
    });
  }

  heatmap.init = function init(options = {}){
    const targetTabId = options?.tabId || options?.tab?.id || resolveHeatmapAsyncTabId(options, state.hot) || null;
    const targetRoot = options?.root || resolveHeatmapRoot(targetTabId || null) || null;
    if(heatmap.ready && (!targetTabId || heatmap.__boundTabId === targetTabId) && (!targetRoot || state.root === targetRoot)){
      debugLog('Debug: heatmap.init skipped - already ready', { tabId: heatmap.__boundTabId || null });
      return;
    }
    if(heatmap.ready){
      debugLog('Debug: heatmap.init rebinding', { previousTabId: heatmap.__boundTabId || null, targetTabId, reason: options?.reason || 'init' });
      heatmap.ready = false;
    }
    heatmap.__boundTabId = targetTabId || null;
    state.root = targetRoot || state.root || null;
    const initSession = bindHeatmapSessionForTab(targetTabId || null, {
      ...(options || {}),
      root: state.root || null,
      reason: options?.reason || 'heatmap-init-bind-session'
    });
    debugLog('Debug: heatmap.init start', { tabId: heatmap.__boundTabId || null });
    state.svg = $('heatmapSvg');
    if(state.svg){
      if(typeof chartStyle.applySvgDefaults === 'function'){
        chartStyle.applySvgDefaults(state.svg);
      }
      if(state.svg.dataset){
        state.svg.dataset.fontScope = 'heatmap';
      }
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(state.svg, { scopeId: 'heatmap' });
        debugLog('Debug: heatmap fontControls enableForSvg invoked', { hasFontControls: !!fontControls }); // Debug: font toolbar binding
      } else {
        debugLog('Debug: heatmap fontControls enableForSvg missing', { hasFontControls: !!fontControls });
      }
      if(!state.svg.__heatmapPaletteFormatBound){
        state.svg.addEventListener('click', handleHeatmapSvgFormatClick, false);
        state.svg.__heatmapPaletteFormatBound = true;
      }
      ensureHeatmapFontObserver();
      ensureHeatmapFontEventListener();
    }
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
        svgBox: () => state.svg?.closest('.svgbox'),
        resizeTarget: () => state.svg?.closest('.svgbox')
      },
      preserveGraphContent: false,
      skipScheduleOnObserver: true,
      panelSyncOptions: {
        disableAutoWidthClamp: true,
        lockGraphPanelWidth: false
      },
      onMinSvgWidth: value => {
        state.minSvgWidth = value;
        debugLog('Debug: heatmap layout minSvgWidth updated', { value });
      },
      resizableBoxOptions: {
        onResize: () => {
          debugLog('Debug: heatmap layout onResize schedule trigger');
          scheduleHeatmapResizeRefresh('resize');
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
    const runHeatmapDrawCycle = () => {
      let status = 'complete';
      let pendingPromise = null;
      try{
        const result = draw();
        if(result && typeof result.then === 'function'){
          pendingPromise = result;
        }
      }catch(err){
        status = 'error';
        throw err;
      }
      if(pendingPromise){
        return pendingPromise.then(() => {
          resolveHeatmapOverlay('complete');
        }).catch((err) => {
          console.error('heatmap async draw error', err);
          resolveHeatmapOverlay('error');
        });
      }
      resolveHeatmapOverlay(status);
      return undefined;
    };
    const scheduleHeatmapBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(heatmap, 'heatmap', runHeatmapDrawCycle, { reason: 'heatmap-draw-frame' })
      : runHeatmapDrawCycle;
    const scheduleHeatmapInstrumented = (opts) => {
      const resolvedTabId = resolveHeatmapAsyncTabId(opts || {}, state.hot);
      const nextOpts = resolvedTabId && !(opts || {}).tabId
        ? { ...(opts || {}), tabId: resolvedTabId }
        : { ...(opts || {}) };
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      const ownerSession = getHeatmapSessionForDrawOptions(nextOpts, { reason: overlayReason, fallbackActive: false });
      if(ownerSession){
        updateHeatmapDrawRuntime(ownerSession, runtime => {
          runtime.pendingDrawOptions = cloneSimple(nextOpts) || {};
        }, { mirrorActive: false });
      }
      if(nextOpts.force){
        markHeatmapOverlayPending(overlayReason);
        forceHeatmapOverlay(overlayReason, { message: 'Rendering heatmap...' });
      }else{
        queueHeatmapOverlay(overlayReason);
      }
      const runSchedule = () => scheduleHeatmapBase(nextOpts);
      if(Shared.componentLifecycle?.runDrawWithOverlayPaintGate?.({
        component: heatmap,
        componentKey: 'heatmap',
        options: nextOpts,
        tabId: nextOpts.tabId || heatmap.__boundTabId || resolveHeatmapAsyncTabId(nextOpts, state.hot) || null,
        reason: overlayReason,
        overlayController: heatmapOverlayController,
        delayForOverlay: !nextOpts.viewOnly,
        debugLog,
        run: runSchedule
      })){
        return;
      }
      runSchedule();
    };
    scheduleDrawHeatmapRaw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'heatmap',
          debugLabel: 'heatmap',
          getTabId: () => heatmap.__boundTabId || null,
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
    captureHeatmapSessionStateFromActive(initSession || getActiveHeatmapSessionForState(), { reason: 'heatmap-init-complete' });
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
        state.root = info?.root || resolveHeatmapRoot(info?.tab || null) || state.root || null;
        const nextTabId = info?.tab?.id || info?.tabId || (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || null;
        bindHeatmapSessionForTab(info?.tab || nextTabId || null, { ...(meta || {}), tabId: nextTabId || null, root: state.root || null, reason: meta?.reason || 'workspace-dom-rebind' });
        if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
          heatmap.__boundTabId = nextTabId || heatmap.__boundTabId || null;
          heatmap.__domSentinel = info?.mountedSentinel || getHeatmapNodeById('heatmapLoadExample');
          syncHeatmapSessionRefsFromActive();
          syncHeatmapSessionManagersFromActive();
          heatmap.ready = true;
          debugLog('Debug: heatmap passive DOM rebind', { tabId: heatmap.__boundTabId || null });
          return;
        }
        heatmap.ready = false;
        heatmap.init({ root: state.root || undefined, tabId: nextTabId || null, reason: 'workspace-dom-rebind' });
      }
    });
    return !!rebound?.rebound;
  }

  heatmap.ensure = function ensure(options = {}){
    if(ensureHeatmapDomBindings(options.tab || options.tabId || null, options || {})){
      return;
    }
    if(!heatmap.ready){
      heatmap.init({ ...options, tabId: options.tabId || options.tab?.id || heatmap.__boundTabId || undefined, reason: options.reason || 'ensure' });
    }
  };
  function syncHeatmapActivationState(tabLike = null, options = {}){
    const activationSession = bindHeatmapSessionForTab(tabLike || heatmap.__boundTabId || null, { reason: 'heatmap-activation-state-bind' });
    resetHeatmapActivationDrawState('activate-tab');
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
    if(options.passive !== true){
      scheduleDeferredHiddenDrawFlush('activate-tab');
    }else{
      // Passive/live-DOM activation can still happen after geometry changes while the tab
      // was hidden (toolbar section change, panel constraints, zoom viewport updates).
      // Re-render from active tab data to avoid stale text-aspect transforms.
      scheduleHeatmapDrawForSession(activationSession || getActiveHeatmapSessionForState(), {
        force: true,
        viewOnly: false,
        reason: 'activate-tab-passive-refresh'
      });
    }
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tabLike || null, 'heatmap')
      || resolveHeatmapRoot(tabLike || null)
      || global.document;
    heatmap.__domSentinel = mountedRoot?.querySelector?.('#heatmapLoadExample')
      || getHeatmapNodeById('heatmapLoadExample')
      || null;
    captureHeatmapSessionStateFromActive(activationSession || getActiveHeatmapSessionForState(), { reason: 'heatmap-activation-state-complete' });
  }

  heatmap.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: heatmap,
    componentKey: 'heatmap',
    resolveRoot: tabLike => resolveHeatmapRoot(tabLike || null) || state.root || null,
    setRoot: root => {
      state.root = root || state.root || null;
      syncHeatmapSessionRefsFromActive(getActiveHeatmapSessionForState());
    },
    ensureBindings: tabLike => ensureHeatmapDomBindings(tabLike),
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
      const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(heatmap.__boundTabId || null, 'heatmap')
        || resolveHeatmapRoot(heatmap.__boundTabId || null)
        || global.document;
      return mountedRoot?.querySelector?.('#heatmapLoadExample')
        || getHeatmapNodeById('heatmapLoadExample')
        || null;
    }
  }) || function activateTab(tab, meta = {}){
    const targetTabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
    heatmap.__boundTabId = targetTabId || heatmap.__boundTabId || null;
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
    const captureSession = bindHeatmapSessionForTab(meta?.tab || meta?.tabId || heatmap.__boundTabId || null, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-capture-bind'
    }) || getActiveHeatmapSessionForState();
    const sessionSnapshot = captureHeatmapSessionStateFromActive(captureSession, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-capture'
    });
    const snapshot = sessionSnapshot?.state || buildHeatmapTabContextSnapshotFromState();
    if(sessionSnapshot?.cache?.renderRuntime){
      snapshot.renderState = cloneSimple(sessionSnapshot.cache.renderRuntime) || null;
    }
    rememberHeatmapOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, snapshot, {
      ...(meta || {}),
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
    }) || bindHeatmapSessionForTab(meta?.tab || meta?.tabId || heatmap.__boundTabId || null, meta);
    if(session && isHeatmapSessionActiveForModuleState(session)){
      applyHeatmapSessionStateToActive(session, { syncUi: true });
    }else{
      applyHeatmapTabContextSnapshot(resolvedSnapshot, { syncUi: true });
    }
    rememberHeatmapOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-apply'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(heatmap, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-apply'
    });
    clearHiddenDrawFlushHandle();
    updateHeatmapDrawRuntime(session || getActiveHeatmapSessionForState(), runtime => {
      runtime.pendingDrawOptions = {};
      runtime.deferredHiddenDrawOptions = null;
    }, { seedFromActive: true });
    return true;
  };

  heatmap.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: heatmap,
    componentKey: 'heatmap',
    cancel: () => {
      clearHiddenDrawFlushHandle();
      updateHeatmapDrawRuntime(getActiveHeatmapSessionForState(), runtime => {
        runtime.pendingDrawOptions = {};
        runtime.deferredHiddenDrawOptions = null;
        runtime.token = (Number(runtime.token) || 0) + 1;
      }, { seedFromActive: true });
    }
  }) || function deactivateHeatmapTab(tab, meta = {}){
    clearHiddenDrawFlushHandle();
    updateHeatmapDrawRuntime(getActiveHeatmapSessionForState(), runtime => {
      runtime.pendingDrawOptions = {};
      runtime.deferredHiddenDrawOptions = null;
      runtime.token = (Number(runtime.token) || 0) + 1;
    }, { seedFromActive: true });
    debugLog('Debug: heatmap tab deactivated', {
      tabId: (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null,
      drawToken: state.drawToken,
      reason: meta?.reason || 'deactivate-tab'
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

  function captureHeatmapSvgRootState(svg){
    if(!svg){
      return null;
    }
    const attributeNames = ['viewBox', 'preserveAspectRatio'];
    const styleNames = ['display'];
    const attributes = {};
    const style = {};
    attributeNames.forEach(name => {
      const value = typeof svg.getAttribute === 'function' ? svg.getAttribute(name) : null;
      if(typeof value === 'string' && value.length){
        attributes[name] = value;
      }
    });
    styleNames.forEach(name => {
      const value = svg.style?.[name];
      if(typeof value === 'string' && value.length){
        style[name] = value;
      }
    });
    return {
      attributes: Object.keys(attributes).length ? attributes : null,
      style: Object.keys(style).length ? style : null
    };
  }

  function restoreHeatmapSvgRootState(svg, snapshot){
    if(!svg){
      return false;
    }
    const attributeNames = ['viewBox', 'preserveAspectRatio'];
    const styleNames = ['display'];
    attributeNames.forEach(name => {
      try{
        if(typeof svg.removeAttribute === 'function'){
          svg.removeAttribute(name);
        }
      }catch(err){
        console.error('heatmap restore svg attribute reset error', { name, err });
      }
    });
    styleNames.forEach(name => {
      try{
        if(svg.style){
          svg.style[name] = '';
        }
      }catch(err){
        console.error('heatmap restore svg style reset error', { name, err });
      }
    });
    if(!snapshot || typeof snapshot !== 'object'){
      return true;
    }
    const attributes = snapshot.attributes && typeof snapshot.attributes === 'object'
      ? snapshot.attributes
      : null;
    const style = snapshot.style && typeof snapshot.style === 'object'
      ? snapshot.style
      : null;
    if(attributes){
      Object.entries(attributes).forEach(([name, value]) => {
        try{
          if(value == null || value === ''){
            svg.removeAttribute?.(name);
          }else{
            svg.setAttribute?.(name, String(value));
          }
        }catch(err){
          console.error('heatmap restore svg attribute error', { name, value, err });
        }
      });
    }
    if(style){
      Object.entries(style).forEach(([name, value]) => {
        try{
          if(svg.style){
            svg.style[name] = value || '';
          }
        }catch(err){
          console.error('heatmap restore svg style error', { name, value, err });
        }
      });
    }
    return true;
  }

  function resolveHeatmapPreviewSourceSvg(tab){
    const activeTabId = global.Main?.session?.workspaceState?.activeTabId || null;
    const targetTabId = tab?.id || null;
    if(targetTabId && targetTabId !== activeTabId){
      const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(targetTabId, 'heatmap') || null;
      if(mountedRoot){
        const mountedSvg = mountedRoot.querySelector?.('#heatmapSvg, .svgbox svg') || null;
        if(mountedSvg && typeof mountedSvg.innerHTML === 'string' && mountedSvg.innerHTML.trim()){
          return mountedSvg;
        }
      }
      const cache = tab?.renderCache?.cache || tab?.archiveRenderCache?.cache || null;
      if(cache){
        const plotPayload = cache.plot;
        const svgRootAttrs = cache.svgRootState?.attributes || null;
        if(plotPayload?.fragment && svgRootAttrs?.viewBox){
          try{
            const doc = global.document;
            const NS = 'http://www.w3.org/2000/svg';
            const reconstructed = doc.createElementNS(NS, 'svg');
            Object.keys(svgRootAttrs).forEach(name => {
              try{ reconstructed.setAttribute(name, String(svgRootAttrs[name])); }catch(_){}
            });
            reconstructed.appendChild(plotPayload.fragment.cloneNode(true));
            if(typeof reconstructed.innerHTML === 'string' && reconstructed.innerHTML.trim()){
              return reconstructed;
            }
          }catch(err){
            debugLog('Debug: heatmap preview cache reconstruct error', { err: err?.message || String(err) });
          }
        }
      }
    }
    if(!targetTabId || targetTabId === activeTabId){
      const liveSvg = state.svg || $('heatmapSvg');
      if(liveSvg && typeof liveSvg.innerHTML === 'string' && liveSvg.innerHTML.trim()){
        return liveSvg;
      }
    }
    return null;
  }

  function buildHeatmapPreviewSvgFromSource(sourceSvg){
    if(!sourceSvg || typeof sourceSvg.cloneNode !== 'function'){ return null; }
    const rawViewBox = sourceSvg.getAttribute?.('viewBox') || '';
    const vbParts = rawViewBox.trim().split(/[\s,]+/).map(Number);
    const vbW = (vbParts.length === 4 && Number.isFinite(vbParts[2]) && vbParts[2] > 0) ? vbParts[2] : 0;
    const vbH = (vbParts.length === 4 && Number.isFinite(vbParts[3]) && vbParts[3] > 0) ? vbParts[3] : 0;
    const svgBox = state.svgBox || state.layout?.elements?.svgBox || sourceSvg.closest?.('.svgbox') || null;
    const rw = Number.parseFloat(svgBox?.dataset?.resizerWidth || '');
    const rh = Number.parseFloat(svgBox?.dataset?.resizerHeight || '');
    const sw = Number.parseFloat(svgBox?.style?.width || '');
    const sh = Number.parseFloat(svgBox?.style?.height || '');
    const panelWidth = (Number.isFinite(rw) && rw > 0 ? rw : null)
      || (Number.isFinite(sw) && sw > 0 ? sw : null)
      || (Number(sourceSvg.clientWidth) > 0 ? Number(sourceSvg.clientWidth) : null)
      || vbW || 427;
    const panelHeight = (Number.isFinite(rh) && rh > 0 ? rh : null)
      || (Number.isFinite(sh) && sh > 0 ? sh : null)
      || (Number(sourceSvg.clientHeight) > 0 ? Number(sourceSvg.clientHeight) : null)
      || vbH || 427;
    const clone = sourceSvg.cloneNode(true);
    if(clone.style){ clone.style.width = ''; clone.style.height = ''; }
    const srcPreserveAspect = (sourceSvg.getAttribute?.('preserveAspectRatio') || 'xMidYMid meet').trim().toLowerCase();
    const isStretched = srcPreserveAspect === 'none';
    const hasDifferentDims = vbW > 0 && vbH > 0
      && (Math.abs(panelWidth - vbW) > 0.5 || Math.abs(panelHeight - vbH) > 0.5);
    if(isStretched && hasDifferentDims){
      const scaleX = panelWidth / vbW;
      const scaleY = panelHeight / vbH;
      const doc = sourceSvg.ownerDocument || global.document;
      const NS = 'http://www.w3.org/2000/svg';
      const wrapper = doc.createElementNS(NS, 'g');
      wrapper.setAttribute('transform', `scale(${Number(scaleX.toFixed(6))},${Number(scaleY.toFixed(6))})`);
      while(clone.firstChild){ wrapper.appendChild(clone.firstChild); }
      clone.appendChild(wrapper);
      clone.setAttribute('viewBox', `0 0 ${Math.round(panelWidth)} ${Math.round(panelHeight)}`);
    }
    clone.setAttribute('width', String(Math.round(panelWidth)));
    clone.setAttribute('height', String(Math.round(panelHeight)));
    clone.setAttribute('data-preview-source', 'true');
    return clone;
  }

  heatmap.getPreviewSvg = function getPreviewSvg(tab){
    const sourceSvg = resolveHeatmapPreviewSourceSvg(tab);
    if(!sourceSvg){ return null; }
    return buildHeatmapPreviewSvgFromSource(sourceSvg);
  };

  heatmap.getExportSvg = function getExportSvg(){
    const sourceSvg = resolveHeatmapPreviewSourceSvg();
    if(!sourceSvg){ return null; }
    return buildHeatmapPreviewSvgFromSource(sourceSvg);
  };

  heatmap.captureRenderCache = function captureRenderCache(){
    const svg = state.svg || $('heatmapSvg');
    const stats = state.statsEl || $('heatmapStatsContent');
    const svgCache = detachChildren(svg);
    const statsCache = detachChildren(stats);
    const renderState = captureHeatmapRenderStateSnapshot();
    const svgRootState = captureHeatmapSvgRootState(svg);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: heatmap render cache captured', {
        svgNodes: svgCache?.count || 0,
        statsNodes: statsCache?.count || 0,
        hasRenderState: !!renderState,
        hasSvgRootState: !!svgRootState
      });
    }
    return { plot: svgCache, stats: statsCache, renderState, svgRootState };
  };

  heatmap.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'heatmap',
      graph: { selectors: ['#heatmapSvg', 'svg', 'canvas'], markupPattern: /(<svg\b|id=["']heatmapSvg["']|<canvas\b)/i },
      graphFallbackSections: ['stats'],
      requiredSections: [],
      requireGraph: true
    }) ?? !!cache;
  };

  heatmap.isIdleForSnapshot = function isIdleForSnapshot(meta = {}){
    const session = getHeatmapSession(meta?.tab || meta?.tabId || heatmap.__boundTabId || null, {
      ...(meta || {}),
      reason: meta?.reason || 'heatmap-idle-check'
    }, { create: false }) || getActiveHeatmapSessionForState();
    const runtime = getHeatmapDrawRuntime(session, { seedFromActive: !session });
    const hasPendingOptions = !!(runtime?.pendingDrawOptions && Object.keys(runtime.pendingDrawOptions).length);
    const hasDeferredOptions = !!runtime?.deferredHiddenDrawOptions;
    const hasFlushHandle = !!runtime?.hiddenDrawFlushHandle;
    return !hasFlushHandle && !hasDeferredOptions && !hasPendingOptions;
  };

  heatmap.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(heatmap, { ...meta, componentKey: 'heatmap' })
      || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  heatmap.restoreRenderCache = function restoreRenderCache(cache, _meta = {}){
    if(!cache){
      clearCachedRenderState();
      return false;
    }
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.svg || cache?.plot || cache?.preview || cache?.graph || cache?.stage;
    const svg = state.svg || $('heatmapSvg');
    const stats = state.statsEl || $('heatmapStatsContent');
    const hasRenderState = !!cache.renderState;
    const restoredState = hasRenderState ? restoreHeatmapRenderStateSnapshot(cache.renderState) : false;
    let restoredSvg = false;
    let restoredStats = false;
    let restored = false;
    let replayedFromModel = false;
    restoreHeatmapSvgRootState(svg, cache.svgRootState);
    restoredSvg = restoreChildren(svg, graphCachePayload);
    restoredStats = restoreChildren(stats, cache.stats);
    // Archive-wide caches can be captured from the mounted per-tab root without
    // heatmap's private renderState. In that case the serialized SVG DOM itself is
    // authoritative enough to provide a fast visual restore; the next real draw will
    // rebuild the private model if needed.
    restored = hasRenderState
      ? ((restoredSvg || restoredStats) && restoredState)
      : (restoredSvg || restoredStats);
    const restoreSession = getActiveHeatmapSessionForState();
    const restoreRuntime = getHeatmapRenderRuntime(restoreSession, { seedFromActive: !restoreSession });
    const cachedModel = restoreRuntime?.lastRenderModel || getHeatmapActiveRenderModel(restoreSession);
    const cachedViewOptions = restoreRuntime?.lastViewOptions || state.lastViewOptions;
    if(!restored && restoredState && cachedModel && cachedViewOptions){
      try{
        replayedFromModel = true;
        restoreHeatmapSvgRootState(svg, cache.svgRootState);
        restoredSvg = !!renderModelWithView(cachedModel, cachedViewOptions, restoreSession, {
          dataSignature: restoreRuntime?.dataSignature || null,
          settingsSignature: restoreRuntime?.settingsSignature || createHeatmapSettingsSignature(cachedViewOptions || {})
        });
        if(restoredSvg){
          refreshStatsForView(cachedViewOptions, restoreSession);
          restoredStats = true;
          restored = true;
        }
      }catch(err){
        console.error('heatmap render cache replay from model error', err);
        restoredSvg = false;
        restoredStats = false;
        restored = false;
        replayedFromModel = false;
      }
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: heatmap render cache restored', {
        restored,
        svg: restoredSvg,
        stats: restoredStats,
        renderState: restoredState,
        svgRootState: !!cache.svgRootState,
        replayedFromModel
      });
    }
    if(restored && typeof state.layout?.suppressNextSchedule === 'function'){
      state.layout.suppressNextSchedule({
        reason: replayedFromModel ? 'heatmap-render-cache-model-restore' : 'heatmap-render-cache-restore',
        count: 2
      });
    }
    return restored;
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
