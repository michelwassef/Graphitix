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
    }) || null;
  }

  function applyExistingHeatmapOwnedRuntimeRecord(tabLike = null, meta = {}){
    const snapshot = getHeatmapRuntimeOwner()?.bind(null, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'heatmap',
      reason: meta?.reason || 'heatmap-owned-runtime-activate-apply'
    });
    if(!snapshot || typeof heatmap.applyRuntimeState !== 'function'){
      return false;
    }
    return heatmap.applyRuntimeState(snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'heatmap-owned-runtime-activate-apply'
    });
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
  let heatmapFontRefreshDebounced = null;
  let heatmapFontRefreshReason = null;
  const scheduleHeatmapFontRefresh = (() => {
    const runRefresh = () => {
      if(state.isRendering){
        scheduleHeatmapFontRefresh(heatmapFontRefreshReason || 'font-style-change');
        return;
      }
      const nextReason = heatmapFontRefreshReason || 'font-style-change';
      heatmapFontRefreshReason = null;
      state.scheduleDraw({ viewOnly: true, reason: nextReason });
    };
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(heatmap, 'heatmap', runRefresh, { reason: 'heatmap-font-refresh' })
      : null;
    return reason => {
      heatmapFontRefreshReason = reason || heatmapFontRefreshReason || 'font-style-change';
      if(debounced){
        debounced({ tabId: heatmap.__boundTabId || null, reason: 'heatmap-font-refresh' });
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
        scheduleHeatmapFontRefresh('font-style-event');
      }
    });
    heatmapFontEventBound = true;
    debugLog('Debug: heatmap font style listener attached');
  };

  let heatmapTextResizeObserver = null;
  let heatmapResizeRefreshDebounced = null;
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
      applyHeatmapTextAspect(`heatmap-resize-aspect-${nextReason}`);
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw({ viewOnly: true, reason: nextReason });
      }
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

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate){
      return;
    }
    emptyPayloadTemplate = { type: 'heatmap', config: {} };
  }
  const NS = 'http://www.w3.org/2000/svg';
  const COLUMN_LABEL_VERTICAL_ANGLE = 90;
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
  let heatmapDataToolbarLastActivation = 0;
  let heatmapDataViewsManager = null;

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
    lastRenderModel: null,
    lastViewOptions: null,
    lastStats: null,
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
    return {
      fileHandle: null,
      fileName: 'correlation-heatmap.graph',
      titleText: 'Heatmap',
      logPlusOne: false,
      activeMaterializedViewId: null,
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
      lastDataShape: { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: null,
      performance: { loadData: null, draw: null, evaluation: null },
      notes: {
        text: '',
        open: false
      }
    };
  }

  function captureHeatmapNotesSnapshot(){
    const noteControl = notesState.control || null;
    const text = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const open = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = text;
    notesState.open = open;
    return { text, open };
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
      activeMaterializedViewId: state.activeMaterializedViewId == null
        ? null
        : String(state.activeMaterializedViewId),
      dendrogramSettings: cloneSimple(ensureDendrogramSettings()) || { ...defaults.dendrogramSettings },
      labelPositions: cloneSimple(state.labelPositions || defaults.labelPositions) || { ...defaults.labelPositions },
      palette: normalizeHeatmapPalette(state.palette),
      valueScale: normalizeHeatmapValueScale(state.valueScale),
      legendHeightMode: normalizeHeatmapLegendHeightMode(state.legendHeightMode),
      clusterControlsTouched: !!state.clusterControlsTouched,
      clusterDefaultsAutoApplied: !!state.clusterDefaultsAutoApplied,
      lastDataShape: cloneSimple(state.lastDataShape) || { ...defaults.lastDataShape },
      lastAutoDrawEvaluation: cloneSimple(state.lastAutoDrawEvaluation),
      performance: cloneSimple(state.performance) || { ...defaults.performance },
      notes: captureHeatmapNotesSnapshot()
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
    state.activeMaterializedViewId = source.activeMaterializedViewId == null
      ? null
      : String(source.activeMaterializedViewId);
    state.dendrogramSettings = cloneSimple(source.dendrogramSettings) || { ...defaults.dendrogramSettings };
    state.labelPositions = cloneSimple(source.labelPositions) || { ...defaults.labelPositions };
    state.palette = normalizeHeatmapPalette(source.palette);
    state.valueScale = normalizeHeatmapValueScale(source.valueScale);
    state.legendHeightMode = normalizeHeatmapLegendHeightMode(source.legendHeightMode);
    state.lastResolvedValueScale = null;
    state.clusterControlsTouched = !!source.clusterControlsTouched;
    state.clusterDefaultsAutoApplied = !!source.clusterDefaultsAutoApplied;
    state.lastDataShape = cloneSimple(source.lastDataShape) || { ...defaults.lastDataShape };
    state.lastAutoDrawEvaluation = cloneSimple(source.lastAutoDrawEvaluation) || null;
    state.performance = cloneSimple(source.performance) || { ...defaults.performance };
    notesState.text = source.notes?.text == null ? '' : String(source.notes.text);
    notesState.open = !!source.notes?.open;
    if(options.syncUi !== false){
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
      if(notesState.control){
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
    }
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

  function ensureDendrogramSettings(){
    if(!state.dendrogramSettings){
      state.dendrogramSettings = {
        thickness: DEFAULT_DENDROGRAM_THICKNESS,
        color: DEFAULT_DENDROGRAM_COLOR
      };
    }
    return state.dendrogramSettings;
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

  function getHeatmapCurrentView(){
    return refs.view?.value || state.lastViewOptions?.view || 'corr-columns';
  }

  function formatHeatmapScaleInputValue(value){
    if(!Number.isFinite(value)){
      return '';
    }
    const decimals = clampDecimals(refs.decimals?.value);
    if(chartStyle && typeof chartStyle.formatScientific === 'function'){
      return chartStyle.formatScientific(value, { maxDecimals: decimals ?? 2 });
    }
    return value.toFixed(decimals ?? 2);
  }

  function getHeatmapPalette(){
    state.palette = normalizeHeatmapPalette(state.palette);
    return { ...state.palette };
  }

  function getHeatmapValueScale(){
    state.valueScale = normalizeHeatmapValueScale(state.valueScale);
    return { ...state.valueScale };
  }

  function getHeatmapLegendHeightMode(){
    state.legendHeightMode = normalizeHeatmapLegendHeightMode(state.legendHeightMode);
    return state.legendHeightMode;
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
    const previous = getHeatmapPalette();
    const next = normalizeHeatmapPalette({ ...previous, ...(patch || {}) });
    state.palette = next;
    syncHeatmapPaletteInputs(options.document);
    if(options.skipSchedule !== true){
      state.scheduleDraw({
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
    const previous = getHeatmapValueScale();
    const next = normalizeHeatmapValueScale({ ...previous, ...(patch || {}) });
    if(previous.min === next.min && previous.max === next.max){
      syncHeatmapPaletteInputs(options.document);
      return next;
    }
    state.valueScale = next;
    syncHeatmapPaletteInputs(options.document);
    if(options.skipSchedule !== true){
      state.scheduleDraw({
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
    const next = normalizeHeatmapLegendHeightMode(mode);
    if(getHeatmapLegendHeightMode() === next){
      syncHeatmapPaletteInputs(options.document);
      return next;
    }
    state.legendHeightMode = next;
    syncHeatmapPaletteInputs(options.document);
    if(options.skipSchedule !== true){
      state.scheduleDraw({
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
      input.addEventListener('input', () => {
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
      input.addEventListener('change', () => {
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
    legendSelect.addEventListener('change', () => {
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
    const settings = ensureDendrogramSettings();
    const numeric = Number(value);
    const newThickness = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_DENDROGRAM_THICKNESS;
    if(settings.thickness !== newThickness){
      settings.thickness = newThickness;
      debugLog('Debug: heatmap dendrogram thickness updated', { value: newThickness });
      state.scheduleDraw({ viewOnly: true, reason: 'dendrogram-thickness' });
    }
  }

  function updateDendrogramColor(value){
    const settings = ensureDendrogramSettings();
    const newColor = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_DENDROGRAM_COLOR;
    if(settings.color !== newColor){
      settings.color = newColor;
      debugLog('Debug: heatmap dendrogram color updated', { value: newColor });
      state.scheduleDraw({ viewOnly: true, reason: 'dendrogram-color' });
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
    if(now - heatmapDataToolbarLastActivation < 80){
      return false;
    }
    heatmapDataToolbarLastActivation = now;
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
          const viewsManager = hotInstance.__heatmapDataViewsManager || heatmapDataViewsManager || null;
          const nextTransformState = resolveHeatmapDataTransformControlStateForView(view, viewsManager);
          const closedViewId = String(context?.previousViewId || '').trim();
          const activeMaterializedId = String(state.activeMaterializedViewId || '').trim();
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
          if(isHeatmapMaterializedDataView(view)){
            state.activeMaterializedViewId = view.id;
          }else{
            state.activeMaterializedViewId = null;
          }
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
            markHeatmapOverlayPending('data-view-switch');
            state.scheduleDraw?.({
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
              hotInstance.__heatmapDataViewsManager || heatmapDataViewsManager
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
    state.activeMaterializedViewId = isHeatmapMaterializedDataView(activeView) ? activeView.id : null;
    heatmapDataViewsManager = manager;
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
      return;
    }
    const manager = hot.__heatmapDataViewsManager || heatmapDataViewsManager;
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
    state.activeMaterializedViewId = null;
    state.clusterControlsTouched = false;
    state.clusterDefaultsAutoApplied = false;
    hot.loadData(nextData, options.loadOptions || undefined);
    syncHeatmapHotExclusions(hot, null, 'dataset-replace');
    if(options.scheduleDraw !== false){
      const drawOptions = {
        force: options.force !== false,
        reason: options.reason || 'dataset-replace',
        tabId: resolveHeatmapAsyncTabId(options, hot)
      };
      state.scheduleDraw(drawOptions);
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
      state.scheduleDraw({ force: true, reason: 'toolbar-transform-correlation-source' });
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
      state.scheduleDraw({ force: true, reason: 'toolbar-transform-pipeline-correlation-source' });
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
    heatmapUndoManager.recordStateChange({
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

  function setHeatmapFileName(name, options = {}){
    const trimmed = typeof name === 'string' ? name.trim() : '';
    const normalized = trimmed || 'correlation-heatmap.graph';
    if(!options.force && state.fileName === normalized){
      return;
    }
    state.fileName = normalized;
    if(!options.skipExportRefresh){
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

  let scheduleDrawHeatmapRaw = () => {};
  let pendingDrawOptions = {};
  let deferredHiddenDrawOptions = null;
  let hiddenDrawFlushHandle = null;

  function clearCachedRenderState(){
    state.lastRenderModel = null;
    state.lastViewOptions = null;
    state.lastStats = null;
    state.textAspectMetrics = null;
    debugLog('Debug: heatmap cached render cleared');
  }

  function invalidateHeatmapTransientRenderState(reason){
    clearHiddenDrawFlushHandle();
    pendingDrawOptions = {};
    deferredHiddenDrawOptions = null;
    state.drawToken = (Number(state.drawToken) || 0) + 1;
    clearCachedRenderState();
    debugLog('Debug: heatmap transient render state invalidated', {
      reason: reason || 'unknown',
      drawToken: state.drawToken
    });
  }

  function resetHeatmapActivationDrawState(reason){
    clearHiddenDrawFlushHandle();
    pendingDrawOptions = {};
    deferredHiddenDrawOptions = null;
    state.drawToken = (Number(state.drawToken) || 0) + 1;
    debugLog('Debug: heatmap activation draw queue reset', {
      reason: reason || 'activate-tab',
      drawToken: state.drawToken
    });
  }

  function captureHeatmapRenderStateSnapshot(){
    return {
      lastRenderModel: cloneSimple(state.lastRenderModel),
      lastViewOptions: cloneSimple(state.lastViewOptions),
      lastStats: cloneSimple(state.lastStats),
      textAspectMetrics: cloneSimple(state.textAspectMetrics),
      lastDataShape: cloneSimple(state.lastDataShape),
      lastAutoDrawEvaluation: cloneSimple(state.lastAutoDrawEvaluation)
    };
  }

  function restoreHeatmapRenderStateSnapshot(snapshot){
    const source = snapshot && typeof snapshot === 'object' ? snapshot : null;
    if(!source){
      clearCachedRenderState();
      return false;
    }
    state.lastRenderModel = cloneSimple(source.lastRenderModel) || null;
    state.lastViewOptions = cloneSimple(source.lastViewOptions) || null;
    state.lastStats = cloneSimple(source.lastStats) || null;
    state.textAspectMetrics = cloneSimple(source.textAspectMetrics) || null;
    state.lastDataShape = cloneSimple(source.lastDataShape) || { rows: 0, cols: 0 };
    state.lastAutoDrawEvaluation = cloneSimple(source.lastAutoDrawEvaluation) || null;
    debugLog('Debug: heatmap render state restored', {
      hasModel: !!state.lastRenderModel,
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
    const previous = pendingDrawOptions || {};
    if(!opts || typeof opts !== 'object'){
      pendingDrawOptions = Object.keys(previous).length
        ? { ...previous, viewOnly: false }
        : { viewOnly: false };
      return;
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
    pendingDrawOptions = next;
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
    const previous = deferredHiddenDrawOptions || {};
    if(!opts || typeof opts !== 'object'){
      deferredHiddenDrawOptions = previous && Object.keys(previous).length
        ? { ...previous, viewOnly: false }
        : { viewOnly: false };
      return deferredHiddenDrawOptions;
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
    deferredHiddenDrawOptions = next;
    return deferredHiddenDrawOptions;
  }

  function clearHiddenDrawFlushHandle(){
    if(hiddenDrawFlushHandle == null){
      return;
    }
    Shared.componentLifecycle?.cancelComponentFrame?.(heatmap, hiddenDrawFlushHandle);
    hiddenDrawFlushHandle = null;
  }

  function scheduleDeferredHiddenDrawFlush(reason){
    clearHiddenDrawFlushHandle();
    const flush = () => {
      hiddenDrawFlushHandle = null;
      if(isHeatmapWorkspaceHidden()){
        debugLog('Debug: heatmap hidden draw flush deferred - still hidden', { reason: reason || 'visibility-flush' });
        return;
      }
      if(!deferredHiddenDrawOptions){
        return;
      }
      const pending = { ...deferredHiddenDrawOptions };
      deferredHiddenDrawOptions = null;
      debugLog('Debug: heatmap hidden draw flush scheduled', {
        reason: reason || 'visibility-flush',
        pendingReason: pending.reason || null,
        viewOnly: !!pending.viewOnly,
        force: !!pending.force
      });
      scheduleDrawHeatmap({
        ...pending,
        reason: pending.reason || reason || 'hidden-draw-flush'
      });
    };
    hiddenDrawFlushHandle = scheduleHeatmapAsyncFrame(reason || 'hidden-draw-flush-first-frame', () => {
      hiddenDrawFlushHandle = scheduleHeatmapAsyncFrame(reason || 'hidden-draw-flush-second-frame', flush);
    });
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
    if(state.suspendAutoClusterDefaults || state.clusterControlsTouched || state.clusterDefaultsAutoApplied){
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
    state.clusterDefaultsAutoApplied = true;
    if(!needsUpdate){
      return false;
    }
    refs.clusterGenes.checked = true;
    refs.clusterArrays.checked = true;
    refs.showRowDendrogram.checked = true;
    refs.showColumnDendrogram.checked = true;
    state.suppressClusterTouchTracking = true;
    try{
      refs.clusterGenes.dispatchEvent(new Event('change'));
      refs.clusterArrays.dispatchEvent(new Event('change'));
    }finally{
      state.suppressClusterTouchTracking = false;
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
        state.scheduleDraw({
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
    if(typeof formatter === 'function'){
      return formatter(value);
    }
    const num = Number(value);
    if(!Number.isFinite(num)){
      return 'n/a';
    }
    if(num > 0 && num < 0.0001){
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

    const schedule = () => {
      if(state.suspendControlSchedule){
        return;
      }
      state.scheduleDraw({ viewOnly: false, reason: 'user-control-change', userInitiated: true });
    };
    const scheduleViewOnly = reason => {
      if(state.suspendControlSchedule){
        return;
      }
      state.scheduleDraw({ viewOnly: true, reason: reason || 'user-view-only-change', userInitiated: true });
    };
    const materialize = reason => materializeHeatmapSelectionToDataView(reason);

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
            if(!wasChecked){
              aspectCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }else{
            aspectCheckbox.disabled = false;
            if(enteringDataValues){
              const wasChecked = !!aspectCheckbox.checked;
              aspectCheckbox.checked = false;
              if(svgBox && svgBox.dataset){
                svgBox.dataset.resizerAspectLocked = 'false';
              }
              try{ applySvgBoxAspect(svgBox, { locked: false }); }catch(e){}
              if(wasChecked){
                aspectCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
              }
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
      enableEl.addEventListener('change', () => {
        toggle();
        debugLog('Debug: heatmap filter toggled', { id: enableEl.id, enabled: enableEl.checked });
        if(materialize(`filter-toggle-${enableEl.id}`)){
          return;
        }
        schedule();
      });
      valueEls.forEach(el => {
        el?.addEventListener('input', () => {
          debugLog('Debug: heatmap filter value changed', { id: el.id, value: el.value });
          schedule();
        });
        el?.addEventListener('change', () => {
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
      checkbox.addEventListener('change', () => {
        toggle();
        debugLog('Debug: heatmap center toggle', { id: checkbox.id, enabled: checkbox.checked });
        if(materialize(`center-toggle-${checkbox.id}`)){
          return;
        }
        schedule();
      });
      radios.forEach(radio => {
        radio.addEventListener('change', () => {
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
      checkbox.addEventListener('change', () => {
        if(!state.suspendControlSchedule && !state.suppressClusterTouchTracking){
          state.clusterControlsTouched = true;
        }
        update();
        updateViewControlState();
        debugLog('Debug: heatmap cluster toggle', { id: checkbox.id, enabled: checkbox.checked });
        schedule();
      });
      select?.addEventListener('change', () => {
        if(!state.suspendControlSchedule && !state.suppressClusterTouchTracking){
          state.clusterControlsTouched = true;
        }
        updateViewControlState();
        debugLog('Debug: heatmap cluster metric change', { id: select.id, value: select.value });
        schedule();
      });
      dendrogramToggle?.addEventListener('change', () => {
        if(!state.suspendControlSchedule && !state.suppressClusterTouchTracking){
          state.clusterControlsTouched = true;
        }
        updateViewControlState();
        debugLog('Debug: heatmap dendrogram toggle', { id: dendrogramToggle.id, checked: dendrogramToggle.checked });
        schedule();
      });
      update();
    };

    refs.view?.addEventListener('change', () => {
      updateViewControlState();
      debugLog('Debug: heatmap view changed', { value: refs.view.value });
      state.ensureHotForActiveTab?.();
      state.scheduleDraw({ force: true, viewOnly: false, reason: 'user-view-change', userInitiated: true });
    });
    refs.method?.addEventListener('change', () => {
      debugLog('Debug: heatmap method changed', { value: refs.method.value });
      schedule();
    });
    refs.logTransform?.addEventListener('change', () => {
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
      if(materialize('log-transform')){
        return;
      }
      schedule();
    });
    [refs.normalizeGenes, refs.normalizeArrays].forEach(el => {
      el?.addEventListener('change', () => {
        debugLog('Debug: heatmap toggle changed', { id: el.id, checked: el.checked });
        if(materialize(`normalize-toggle-${el.id}`)){
          return;
        }
        schedule();
      });
    });
    [refs.showRowDendrogram, refs.showColumnDendrogram].forEach(el => {
      el?.addEventListener('change', () => {
        if(!state.suspendControlSchedule && !state.suppressClusterTouchTracking){
          state.clusterControlsTouched = true;
        }
        debugLog('Debug: heatmap toggle changed', { id: el.id, checked: el.checked });
        schedule();
      });
    });
    [refs.absValues, refs.maskLower, refs.showValues, refs.showSignificance].forEach(el => {
      el?.addEventListener('change', () => {
        updateViewControlState();
        debugLog('Debug: heatmap view toggle changed', { id: el.id, checked: el.checked });
        scheduleViewOnly(`toggle-${el?.id || 'unknown'}`);
      });
    });
    refs.significanceDisplay?.addEventListener('change', () => {
      updateViewControlState();
      debugLog('Debug: heatmap significance display changed', { value: refs.significanceDisplay?.value || null });
      scheduleViewOnly('significance-display');
    });
    refs.decimals?.addEventListener('input', () => {
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
      el.addEventListener('input', () => {
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
    refs.cellSize?.addEventListener('input', () => {
      if(refs.cellSizeVal && refs.cellSize){
        refs.cellSizeVal.textContent = refs.cellSize.value;
      }
      debugLog('Debug: heatmap cell size changed', { value: refs.cellSize?.value });
      scheduleViewOnly('cell-size');
    });
    refs.fontSize?.addEventListener('input', () => {
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
    refs.linkage?.addEventListener('change', () => {
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
    $('heatmapLoadExample')?.addEventListener('click', () => {
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
    importBtn?.addEventListener('click', () => {
      if(fileInput){
        fileInput.value = '';
        fileInput.click();
      }
    });
    fileInput?.addEventListener('change', async () => {
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
            state.scheduleDraw({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
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
    statsPanel?.addEventListener('input', handleStatsThresholdInteraction, true);
    statsPanel?.addEventListener('change', handleStatsThresholdInteraction, true);
    if(typeof global.addEventListener === 'function'){
      global.addEventListener('venn:stats-pvalue-format-change', () => {
        scheduleViewOnly('stats-pvalue-format');
      });
    }

    updateViewControlState();
  }

  function initFileButtons(){
    $('openHeatmapGraph')?.addEventListener('click', () => heatmap.open());
    $('saveHeatmapGraph')?.addEventListener('click', () => heatmap.save());
    $('saveAsHeatmap')?.addEventListener('click', () => heatmap.saveAs());
    $('heatmapGraphFile')?.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if(file){
        setHeatmapFileName(file.name);
        state.fileHandle = null;
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
    const studentTCdf = (statsApi?.studentt && typeof statsApi.studentt.cdf === 'function')
      ? statsApi.studentt.cdf.bind(statsApi.studentt)
      : null;
    if(method === 'spearman'){
      const hasTies = hasHeatmapDuplicateValues(xs) || hasHeatmapDuplicateValues(ys);
      if(!hasTies && count <= 9){
        const exact = computeHeatmapSpearmanExactP(bounded, count);
        if(Number.isFinite(exact)){
          return exact;
        }
      }
    }
    if(!studentTCdf){
      return NaN;
    }
    const tStatistic = bounded * Math.sqrt((count - 2) / Math.max(1e-12, 1 - (bounded * bounded)));
    return 2 * (1 - studentTCdf(Math.abs(tStatistic), count - 2));
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
    return drawToken === state.drawToken && isHeatmapAsyncCurrent(asyncState);
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
    const promise = workerApi.runTask({
      name: 'heatmap-cluster',
      url: HEATMAP_CLUSTER_WORKER.url,
      action: 'hierarchicalCluster',
      payload,
      timeoutMs: HEATMAP_CLUSTER_WORKER.timeoutMs,
      fallback: () => hierarchicalCluster(items, metric, linkage)
    }).then((result) => {
      if(!isHeatmapDrawCurrent(drawToken, asyncState)){
        debugLog('Debug: heatmap cluster worker result ignored', { label, reason: 'stale-draw' });
        return null;
      }
      return normalizeClusterResult(result, items);
    }).catch((err) => {
      debugLog('Debug: heatmap cluster worker failed', { label, message: err?.message || String(err) });
      return hierarchicalCluster(items, metric, linkage);
    });
    debugLog('Debug: heatmap cluster worker scheduled', { label, count: items.length });
    return { result: null, promise };
  }

  function collectSettings(){
    const view = refs.view?.value || 'corr-columns';
    const isCorrelation = view.startsWith('corr');
    const decimals = clampDecimals(refs.decimals?.value);
    const settings = {
      view,
      decimals,
      correlationMethod: refs.method?.value || 'pearson',
      useAbsolute: isCorrelation ? !!refs.absValues?.checked : false,
      maskLower: isCorrelation ? !!refs.maskLower?.checked : false,
      showValues: !!refs.showValues?.checked,
      showSignificance: isCorrelation ? !!refs.showSignificance?.checked : false,
      significanceDisplay: refs.significanceDisplay?.value === 'pvalue' ? 'pvalue' : 'star',
      significanceThreshold: getHeatmapSignificanceThreshold(),
      cellSize: Math.max(12, Number(refs.cellSize?.value) || 60),
      fontSize: Math.max(8, Number(refs.fontSize?.value) || DEFAULT_HEATMAP_FONT_SIZE_PT),
      palette: getHeatmapPalette(),
      valueScale: getHeatmapValueScale(),
      legendHeightMode: getHeatmapLegendHeightMode(),
      filters: {
        presentEnabled: !!refs.filterPresentEnable?.checked,
        presentThreshold: Number(refs.filterPresentValue?.value),
        sdEnabled: !!refs.filterSdEnable?.checked,
        sdThreshold: Number(refs.filterSdValue?.value),
        absEnabled: !!refs.filterAbsEnable?.checked,
        absCount: Number(refs.filterAbsCount?.value),
        absValue: Number(refs.filterAbsValue?.value),
        rangeEnabled: !!refs.filterRangeEnable?.checked,
        rangeThreshold: Number(refs.filterRangeValue?.value)
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
          enabled: !!refs.clusterGenes?.checked,
          metric: refs.genesMetric?.value || 'pearson',
          showDendrogram: !!refs.showRowDendrogram?.checked
        },
        columns: {
          enabled: !!refs.clusterArrays?.checked,
          metric: refs.arraysMetric?.value || 'pearson',
          showDendrogram: !!refs.showColumnDendrogram?.checked
        },
        linkage: refs.linkage?.value || 'average'
      }
    };
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
    const viewsManager = manager || heatmapDataViewsManager || null;
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
    const manager = hot
      ? (hot.__heatmapDataViewsManager || heatmapDataViewsManager || null)
      : (heatmapDataViewsManager || null);
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

  function findHeatmapCorrelationMatrixView(manager){
    const views = getHeatmapCorrelationMatrixViewRecords(manager);
    return views.length ? views[0] : null;
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
          state.scheduleDraw({ force: true, reason: 'heatmap-transform-clear-correlation-source' });
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
      state.scheduleDraw({ force: true, reason: 'heatmap-transform-correlation-source' });
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

  function buildOrderedMatrix(matrix, rowOrder, columnOrder){
    return rowOrder.map(rowIdx => {
      const sourceRow = matrix[rowIdx];
      return columnOrder.map(colIdx => sourceRow[colIdx]);
    });
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

  function alignColumnValues(columnA, columnB){
    if(!columnA || !columnB) return { xs: [], ys: [] };
    const mapB = new Map(columnB.values.map(entry => [entry.rowIndex, entry.value]));
    const xs = [];
    const ys = [];
    for(const entry of columnA.values){
      if(mapB.has(entry.rowIndex)){
        xs.push(entry.value);
        ys.push(mapB.get(entry.rowIndex));
      }
    }
    return { xs, ys };
  }

  function calculateColumnCorrelation(columnA, columnB, method){
    const { xs, ys } = alignColumnValues(columnA, columnB);
    const count = xs.length;
    if(count < 2){
      return { corr: NaN, count };
    }
    const corr = computeCorrelation(xs, ys, method);
    if(!Number.isFinite(corr)){
      return { corr: NaN, count };
    }
    const normalized = Math.max(-1, Math.min(1, corr));
    return { corr: normalized, count };
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

  function readPackedDistance(store, i, j){
    if(!store || typeof store.size !== 'number'){ return 0; }
    if(i === j){ return 0; }
    const idx = packedDistanceIndex(store.size, i, j);
    if(idx < 0){ return 0; }
    return store.values[idx];
  }

  function writePackedDistance(store, i, j, value){
    if(!store || typeof store.size !== 'number' || i === j){ return; }
    const idx = packedDistanceIndex(store.size, i, j);
    if(idx >= 0){
      store.values[idx] = value;
    }
  }

  function buildDistanceMatrix(columns, method){
    const n = columns.length;
    if(n <= 1){
      return { size: n, values: new Float32Array(0) };
    }
    const values = new Float32Array((n * (n - 1)) / 2);
    const store = { size: n, values };
    for(let i = 0; i < n; i += 1){
      for(let j = i + 1; j < n; j += 1){
        const { corr } = calculateColumnCorrelation(columns[i], columns[j], method);
        const distance = Number.isFinite(corr) ? 1 - corr : 1;
        writePackedDistance(store, i, j, distance);
      }
    }
    debugLog('Debug: heatmap distance matrix prepared', {
      method,
      columnCount: n,
      preview: Array.from(values.slice(0, Math.min(10, values.length)))
    });
    return store;
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

  function performHierarchicalClustering(baseDistances){
    const n = Number(baseDistances?.size) || 0;
    if(n <= 0){
      debugLog('Debug: heatmap hierarchical clustering skipped - empty distance matrix');
      return { order: [], tree: null, steps: [], maxDistance: 0 };
    }
    const clusters = Array.from({ length: n }, (_, index) => ({
      id: index,
      indices: [index],
      size: 1,
      left: null,
      right: null,
      distance: 0
    }));
    if(n === 1){
      debugLog('Debug: heatmap hierarchical clustering trivial - single column');
      return { order: [0], tree: clusters[0], steps: [], maxDistance: 0 };
    }

    const active = new Map();
    clusters.forEach(cluster => {
      active.set(cluster.id, cluster);
    });
    const pairSums = new Map();
    const heap = createMinHeap((a, b) => a.distance - b.distance);

    for(let i = 0; i < n; i += 1){
      for(let j = i + 1; j < n; j += 1){
        const base = readPackedDistance(baseDistances, i, j);
        const safeDistance = Number.isFinite(base) ? base : 1;
        const key = getPairKey(i, j);
        pairSums.set(key, safeDistance);
        heap.push({ distance: safeDistance, aId: i, bId: j });
      }
    }

    const mergeSteps = [];
    let maxDistance = 0;
    let nextClusterId = n;

    const getPairKey = (aId, bId) => {
      return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    };

    const pollNextPair = () => {
      while(heap.size() > 0){
        const entry = heap.pop();
        if(!entry){ break; }
        if(!active.has(entry.aId) || !active.has(entry.bId)){
          continue;
        }
        const key = getPairKey(entry.aId, entry.bId);
        const sum = pairSums.get(key);
        if(!Number.isFinite(sum)){
          continue;
        }
        const clusterA = active.get(entry.aId);
        const clusterB = active.get(entry.bId);
        const avgDistance = sum / (clusterA.size * clusterB.size);
        return { clusterA, clusterB, sum, avgDistance, key };
      }
      return null;
    };

    while(active.size > 1){
      let next = pollNextPair();
      if(!next){
        const remaining = Array.from(active.values());
        if(remaining.length < 2){
          break;
        }
        const clusterA = remaining[0];
        const clusterB = remaining[1];
        const key = getPairKey(clusterA.id, clusterB.id);
        const sum = pairSums.get(key) || 0;
        const fallbackDistance = sum / (clusterA.size * clusterB.size) || 0;
        debugLog('Debug: heatmap hierarchical clustering fallback merge', {
          clusterA: clusterA.id,
          clusterB: clusterB.id,
          distance: fallbackDistance
        });
        next = { clusterA, clusterB, sum, avgDistance: fallbackDistance, key };
      }

      const { clusterA, clusterB, avgDistance, key } = next;
      pairSums.delete(key);
      active.delete(clusterA.id);
      active.delete(clusterB.id);

      const merged = {
        id: nextClusterId,
        indices: clusterA.indices.concat(clusterB.indices),
        size: clusterA.size + clusterB.size,
        left: clusterA,
        right: clusterB,
        distance: Number.isFinite(avgDistance) ? avgDistance : 0
      };
      nextClusterId += 1;
      const survivors = Array.from(active.values());
      active.set(merged.id, merged);

      survivors.forEach(other => {
        const keyA = getPairKey(clusterA.id, other.id);
        const keyB = getPairKey(clusterB.id, other.id);
        const sumA = pairSums.get(keyA) || 0;
        const sumB = pairSums.get(keyB) || 0;
        pairSums.delete(keyA);
        pairSums.delete(keyB);
        const combinedSum = sumA + sumB;
        const combinedKey = getPairKey(merged.id, other.id);
        pairSums.set(combinedKey, combinedSum);
        const combinedDistance = combinedSum / (merged.size * other.size);
        heap.push({
          distance: Number.isFinite(combinedDistance) ? combinedDistance : 0,
          aId: merged.id,
          bId: other.id
        });
      });

      mergeSteps.push({
        left: clusterA.indices.slice(),
        right: clusterB.indices.slice(),
        distance: Number.isFinite(avgDistance) ? avgDistance : 0
      });
      maxDistance = Math.max(maxDistance, Number.isFinite(avgDistance) ? avgDistance : 0);
    }

    const [root] = active.values();
    if(!root){
      debugLog('Debug: heatmap hierarchical clustering missing root', {
        columnCount: n,
        stepCount: mergeSteps.length
      });
      return {
        order: clusters.map(cluster => cluster.id),
        tree: null,
        steps: mergeSteps,
        maxDistance
      };
    }
    const flatten = node => {
      if(!node.left || !node.right){
        return node.indices.slice();
      }
      const leftOrder = flatten(node.left);
      const rightOrder = flatten(node.right);
      const leftMin = Math.min(...leftOrder);
      const rightMin = Math.min(...rightOrder);
      return leftMin <= rightMin ? leftOrder.concat(rightOrder) : rightOrder.concat(leftOrder);
    };
    const order = flatten(root);
    debugLog('Debug: heatmap hierarchical clustering merges', {
      columnCount: n,
      stepCount: mergeSteps.length,
      maxDistance
    });
    return { order, tree: root, steps: mergeSteps, maxDistance };
  }

  function clusterColumns(columns, method){
    if(!Array.isArray(columns) || columns.length === 0){
      return { order: [], tree: null, steps: [], maxDistance: 0, baseDistances: [] };
    }
    const baseDistances = buildDistanceMatrix(columns, method);
    const clustering = performHierarchicalClustering(baseDistances);
    if(!Array.isArray(clustering.order) || clustering.order.length !== columns.length){
      debugLog('Debug: heatmap clustering order fallback', {
        requestedColumns: columns.length,
        receivedLength: clustering?.order?.length,
        method
      });
      return {
        order: columns.map((_, index) => index),
        tree: null,
        steps: clustering.steps || [],
        maxDistance: clustering.maxDistance || 0,
        baseDistances
      };
    }
    debugLog('Debug: heatmap clustering order computed', {
      method,
      order: clustering.order,
      maxDistance: clustering.maxDistance
    });
    return Object.assign({ baseDistances }, clustering);
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
    if(!state.statsEl){
      debugLog('Debug: heatmap stats element missing');
      return;
    }
    clearHeatmapStatsReportHost();
    state.statsEl.textContent = '';
    if(!stats){
      state.statsEl.textContent = 'Add numeric data to draw the heatmap.';
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
          methodsText: `Heatmap summary statistics were generated for a correlation matrix using the ${methodLabel} method${stats.useAbs ? ' with absolute-value display' : ''}.`,
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
          methodsText: 'Heatmap value-summary statistics were generated from the current matrix view.',
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
      return;
    }
    if(stats.type === 'empty'){
      state.statsEl.textContent = stats.message || 'No data available for the current configuration.';
      return;
    }
    state.statsEl.textContent = 'Add numeric data to draw the heatmap.';
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
    layoutAdjust
  }){
    state.isRendering = true;
    try{
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
    const scaledFontSize = Number.isFinite(fontInfo?.px)
      ? fontInfo.px
      : (Number.isFinite(fontInfo?.scaledPx) ? fontInfo.scaledPx : fontSize);
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
      state.titleText = nextValue;
      if(title.textContent !== nextValue){
        title.textContent = nextValue;
      }
      if(typeof state.scheduleDraw === 'function'){
        state.scheduleDraw();
      }
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
          state.labelPositions.title = { 
            x: pos.x, 
            y: pos.y,
            relX: relX, 
            relY: relY 
          };
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
    const dendroSettings = ensureDendrogramSettings();
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
    state.lastResolvedValueScale = null;
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
      renderModelWithView(model, viewOptions);
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
      renderModelWithView(model, viewOptions);
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

  function renderModelWithView(model, viewOptions){
    const payload = buildDrawPayloadFromModel(model, viewOptions);
    if(!payload){
      debugLog('Debug: heatmap renderModelWithView skipped - missing payload');
      return false;
    }
    if(model?.type === 'values'){
      state.lastResolvedValueScale = payload.resolvedValueScale || resolveHeatmapModelValueScale(model, viewOptions);
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
    }else{
      state.lastResolvedValueScale = null;
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
    }
    drawHeatmap(payload);
    state.lastRenderModel = model;
    state.lastViewOptions = viewOptions;
    return true;
  }

  function refreshStatsForView(viewOptions){
    if(!state.lastStats){
      return;
    }
    const stats = { ...state.lastStats };
    stats.decimals = viewOptions?.decimals ?? stats.decimals;
    if(stats.type === 'correlation'){
      stats.useAbs = !!viewOptions?.useAbsolute;
      state.lastResolvedValueScale = null;
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
    }
    if(stats.type === 'values'){
      const resolvedScale = resolveHeatmapModelValueScale(state.lastRenderModel, viewOptions);
      state.lastResolvedValueScale = resolvedScale;
      stats.scaleMin = resolvedScale?.min;
      stats.scaleMax = resolvedScale?.max;
      stats.scaleCustomized = !!resolvedScale?.customized;
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
    }
    updateStats(stats);
  }

  function draw(){
    const drawOpts = pendingDrawOptions || {};
    pendingDrawOptions = {};
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
      const drawToken = (state.drawToken || 0) + 1;
      state.drawToken = drawToken;
      let drawAsyncState = null;
      const drawTabId = drawOpts.tabId || heatmap.__boundTabId || null;
      if(drawTabId && Shared.componentLifecycle?.createAsyncScope){
        try{
          const scope = heatmap.__drawAsyncScope || Shared.componentLifecycle.createAsyncScope('heatmap-draw');
          heatmap.__drawAsyncScope = scope;
          drawAsyncState = {
            scope,
            meta: scope.nextToken({
              tabId: drawTabId,
              reason: drawOpts.reason || 'heatmap-draw'
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
      const settings = resolveHeatmapEffectiveSettings(collectSettings());
      const viewMatches = (state.lastRenderModel?.type === 'values' && settings.view === 'values')
        || (state.lastRenderModel?.type === 'correlation' && settings.view.startsWith('corr'));
      if(drawOpts.viewOnly){
        if(state.lastRenderModel && viewMatches){
          const viewOptions = extractViewOptions(settings);
          const applied = renderModelWithView(state.lastRenderModel, viewOptions);
          if(applied){
            syncHeatmapCorrelationMatrixDataView(
              settings.view.startsWith('corr') ? state.lastRenderModel : null,
              settings,
              {
                context: resolveHeatmapViewContext(),
                reason: 'heatmap-correlation-view-sync-view-only'
              }
            );
            refreshStatsForView(viewOptions);
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
      return renderResult;
    }catch(err){
      console.error('heatmap draw error', err);
      finalizeDrawPerformance({ status: 'error', error: err?.message || String(err) });
    }
  }
  function getConfig(){
    const dendroSettings = ensureDendrogramSettings();
    return {
      view: refs.view?.value || 'corr-columns',
      method: refs.method?.value || 'pearson',
      useAbsolute: !!refs.absValues?.checked,
      maskLower: !!refs.maskLower?.checked,
      showValues: !!refs.showValues?.checked,
      showSignificance: !!refs.showSignificance?.checked,
      significanceDisplay: refs.significanceDisplay?.value === 'pvalue' ? 'pvalue' : 'star',
      decimals: clampDecimals(refs.decimals?.value),
      colors: getHeatmapPalette(),
      valueScale: getHeatmapValueScale(),
      legendHeightMode: getHeatmapLegendHeightMode(),
      cellSize: Number(refs.cellSize?.value) || 60,
      fontSize: Number(refs.fontSize?.value) || DEFAULT_HEATMAP_FONT_SIZE_PT,
      fontStyles: exportFontStyles('heatmap') || undefined,
      title: state.titleText,
      labelPositions: state.labelPositions || null,
      dendrogram: {
        thickness: dendroSettings.thickness,
        color: dendroSettings.color
      },
      filters: {
        presentEnabled: !!refs.filterPresentEnable?.checked,
        presentThreshold: Number(refs.filterPresentValue?.value),
        sdEnabled: !!refs.filterSdEnable?.checked,
        sdThreshold: Number(refs.filterSdValue?.value),
        absEnabled: !!refs.filterAbsEnable?.checked,
        absCount: Number(refs.filterAbsCount?.value),
        absValue: Number(refs.filterAbsValue?.value),
        rangeEnabled: !!refs.filterRangeEnable?.checked,
        rangeThreshold: Number(refs.filterRangeValue?.value)
      },
      adjust: {
        logTransform: !!refs.logTransform?.checked,
        logPlusOne: !!state.logPlusOne,
        centerRows: refs.centerGenes?.checked ? (getCheckedRadioValue('heatmapCenterGenesMode') || 'mean') : null,
        centerColumns: refs.centerArrays?.checked ? (getCheckedRadioValue('heatmapCenterArraysMode') || 'mean') : null,
        normalizeRows: !!refs.normalizeGenes?.checked,
        normalizeColumns: !!refs.normalizeArrays?.checked
      },
      clustering: {
        rows: {
          enabled: !!refs.clusterGenes?.checked,
          metric: refs.genesMetric?.value || 'pearson',
          showDendrogram: !!refs.showRowDendrogram?.checked
        },
        columns: {
          enabled: !!refs.clusterArrays?.checked,
          metric: refs.arraysMetric?.value || 'pearson',
          showDendrogram: !!refs.showColumnDendrogram?.checked
        },
        linkage: refs.linkage?.value || 'average'
      }
    };
  }

  function applyConfig(config){
    if(!config) return;
    runWithHeatmapControlSuspension(() => {
      if(config.title !== undefined){
        state.titleText = config.title != null ? String(config.title) : '';
      }else if(state.titleText == null){
        state.titleText = 'Heatmap';
      }
      // Restore label positions if saved
      if(config.labelPositions){
        state.labelPositions = {
          title: config.labelPositions.title || null
        };
      }
      // Restore dendrogram settings
      if(config.dendrogram && typeof config.dendrogram === 'object'){
        const settings = ensureDendrogramSettings();
        if(typeof config.dendrogram.thickness === 'number' && config.dendrogram.thickness > 0){
          settings.thickness = config.dendrogram.thickness;
        }else{
          settings.thickness = DEFAULT_DENDROGRAM_THICKNESS;
        }
        if(typeof config.dendrogram.color === 'string' && config.dendrogram.color.trim()){
          settings.color = config.dendrogram.color;
        }else{
          settings.color = DEFAULT_DENDROGRAM_COLOR;
        }
        debugLog('Debug: heatmap dendrogram settings restored', { thickness: settings.thickness, color: settings.color });
      }
      if(refs.view){
        refs.view.value = config.view || 'corr-columns';
        refs.view.dispatchEvent(new Event('change'));
      }
      if(refs.method) refs.method.value = config.method || 'pearson';
      if(refs.absValues) refs.absValues.checked = !!config.useAbsolute;
      if(refs.maskLower) refs.maskLower.checked = !!config.maskLower;
      if(refs.showValues) refs.showValues.checked = config.showValues !== false;
      if(refs.showSignificance) refs.showSignificance.checked = !!config.showSignificance;
      if(refs.significanceDisplay) refs.significanceDisplay.value = config.significanceDisplay === 'pvalue' ? 'pvalue' : 'star';
      if(refs.decimals) refs.decimals.value = String(clampDecimals(config.decimals));
      state.palette = normalizeHeatmapPalette(config.colors);
      state.valueScale = normalizeHeatmapValueScale(config.valueScale);
      state.legendHeightMode = normalizeHeatmapLegendHeightMode(config.legendHeightMode);
      state.lastResolvedValueScale = null;
      syncHeatmapPaletteInputs(resolveHeatmapRoot());
      if(refs.cellSize){
        refs.cellSize.value = String(config.cellSize || 60);
        if(refs.cellSizeVal){ refs.cellSizeVal.textContent = refs.cellSize.value; }
        refs.cellSize.dispatchEvent(new Event('input'));
      }
      if(refs.fontSize){
        refs.fontSize.value = String(config.fontSize || DEFAULT_HEATMAP_FONT_SIZE_PT);
        refs.fontSize.dispatchEvent(new Event('input'));
      }
      importFontStyles('heatmap', config.fontStyles || null);
      if(refs.filterPresentEnable){
        refs.filterPresentEnable.checked = !!config.filters?.presentEnabled;
        if(refs.filterPresentValue) refs.filterPresentValue.value = Number.isFinite(config.filters?.presentThreshold) ? config.filters.presentThreshold : 80;
        refs.filterPresentEnable.dispatchEvent(new Event('change'));
      }
      if(refs.filterSdEnable){
        refs.filterSdEnable.checked = !!config.filters?.sdEnabled;
        if(refs.filterSdValue) refs.filterSdValue.value = Number.isFinite(config.filters?.sdThreshold) ? config.filters.sdThreshold : 0;
        refs.filterSdEnable.dispatchEvent(new Event('change'));
      }
      if(refs.filterAbsEnable){
        refs.filterAbsEnable.checked = !!config.filters?.absEnabled;
        if(refs.filterAbsCount) refs.filterAbsCount.value = Number.isFinite(config.filters?.absCount) ? config.filters.absCount : 1;
        if(refs.filterAbsValue) refs.filterAbsValue.value = Number.isFinite(config.filters?.absValue) ? config.filters.absValue : 0;
        refs.filterAbsEnable.dispatchEvent(new Event('change'));
      }
      if(refs.filterRangeEnable){
        refs.filterRangeEnable.checked = !!config.filters?.rangeEnabled;
        if(refs.filterRangeValue) refs.filterRangeValue.value = Number.isFinite(config.filters?.rangeThreshold) ? config.filters.rangeThreshold : 0;
        refs.filterRangeEnable.dispatchEvent(new Event('change'));
      }
      if(refs.logTransform) refs.logTransform.checked = !!config.adjust?.logTransform;
      state.logPlusOne = !!config.adjust?.logPlusOne;
      if(refs.centerGenes){
        refs.centerGenes.checked = !!config.adjust?.centerRows;
        const mode = config.adjust?.centerRows || 'mean';
        const radio = queryHeatmapRoot(`input[name="heatmapCenterGenesMode"][value="${mode}"]`);
        if(radio) radio.checked = true;
        refs.centerGenes.dispatchEvent(new Event('change'));
      }
      if(refs.centerArrays){
        refs.centerArrays.checked = !!config.adjust?.centerColumns;
        const mode = config.adjust?.centerColumns || 'mean';
        const radio = queryHeatmapRoot(`input[name="heatmapCenterArraysMode"][value="${mode}"]`);
        if(radio) radio.checked = true;
        refs.centerArrays.dispatchEvent(new Event('change'));
      }
      if(refs.normalizeGenes){
        refs.normalizeGenes.checked = !!config.adjust?.normalizeRows;
        refs.normalizeGenes.dispatchEvent(new Event('change'));
      }
      if(refs.normalizeArrays){
        refs.normalizeArrays.checked = !!config.adjust?.normalizeColumns;
        refs.normalizeArrays.dispatchEvent(new Event('change'));
      }
      if(refs.clusterGenes){
        refs.clusterGenes.checked = !!config.clustering?.rows?.enabled;
        if(refs.genesMetric) refs.genesMetric.value = config.clustering?.rows?.metric || 'pearson';
        if(refs.showRowDendrogram) refs.showRowDendrogram.checked = !!config.clustering?.rows?.showDendrogram;
        refs.clusterGenes.dispatchEvent(new Event('change'));
      }
      if(refs.clusterArrays){
        refs.clusterArrays.checked = !!config.clustering?.columns?.enabled;
        if(refs.arraysMetric) refs.arraysMetric.value = config.clustering?.columns?.metric || 'pearson';
        if(refs.showColumnDendrogram) refs.showColumnDendrogram.checked = !!config.clustering?.columns?.showDendrogram;
        refs.clusterArrays.dispatchEvent(new Event('change'));
      }
      if(refs.linkage){
        refs.linkage.value = config.clustering?.linkage || 'average';
        refs.linkage.dispatchEvent(new Event('change'));
      }
    });
  }
  function getPayload(){
    const activeHot = (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot;
    const noteControl = notesState.control || null;
    const notesText = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const notesOpen = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = notesText;
    notesState.open = notesOpen;
    const activeManager = ensureHeatmapDataViewsForHot(activeHot, {
      wrapper: getHeatmapNodeById('heatmapHotWrapper') || null,
      container: activeHot?.__heatmapHostContainer || getHeatmapNodeById('heatmapHot') || null
    });
    syncHeatmapActiveDataViewFromHot(activeHot, 'payload');
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    const payload = {
      type: 'heatmap',
      data: Shared.hot.trimTrailingEmptyCols(activeHot ? activeHot.getData() : []),
      exclusions: activeHot?.exportExclusions?.() || (activeHot ? Shared.hot.exportExclusions(activeHot) : Shared.hot.exportExclusions(null)),
      filters: activeHot?.exportFilters?.() || (activeHot ? Shared.hot.exportFilters(activeHot) : Shared.hot.exportFilters(null)),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      stats: state.lastStats ? (cloneSimple(state.lastStats) || state.lastStats) : null,
      config: getConfig()
    };
    payload.config = payload.config || {};
    payload.config.colorScheme = payload.config.colorScheme
      || Shared.colorSchemes?.getSelectedSchemeId?.('heatmap')
      || 'scientific';
    payload.config.notes = {
      text: notesText,
      open: notesOpen
    };
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
    const result = await fileIO.saveGraphFile({
      context: 'heatmap',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => setHeatmapFileName(name)
    });
    debugLog('Debug: heatmap.save result', result);
  };

  heatmap.saveAs = async function saveAsHeatmap(){
    debugLog('Debug: heatmap.saveAs invoked', { currentName: state.fileName });
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('heatmap.saveAs missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'heatmap',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => setHeatmapFileName(name)
    });
    debugLog('Debug: heatmap.saveAs result', result);
  };

  heatmap.open = async function openHeatmap(){
    debugLog('Debug: heatmap.open invoked');
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('heatmap.open missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'heatmap',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => setHeatmapFileName(name),
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
        state.activeMaterializedViewId = isHeatmapMaterializedDataView(activeView) ? activeView.id : null;
      }
      const activeViewData = dataManager?.getActiveView?.()?.data;
      const matrix = cloneMatrix(Array.isArray(activeViewData) ? activeViewData : rawMatrix);
      const activeViewExclusions = dataManager?.getActiveView?.()?.exclusions || null;
      const exclusionsToApply = obj.exclusions || activeViewExclusions || null;
      const activeViewFilters = dataManager?.getActiveView?.()?.filters || null;
      const filtersToApply = obj.filters || activeViewFilters || null;
      const config = obj.config || {};
      if(config.notes && typeof config.notes === 'object'){
        notesState.text = config.notes.text == null ? '' : String(config.notes.text);
        notesState.open = !!config.notes.open;
      }else if(typeof config.notes === 'string'){
        notesState.text = config.notes;
        notesState.open = !!notesState.open;
      }else{
        notesState.text = '';
        notesState.open = false;
      }
      if(notesState.control){
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
      if(!skipDataLoad && state.hot){
        state.suspendAutoClusterDefaults = true;
        try{
          state.hot.loadData(matrix);
        }finally{
          state.suspendAutoClusterDefaults = false;
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
      if(!skipDraw){
        updateStats(state.lastStats);
        state.scheduleDraw();
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
    if(notesState.control?.root && notesState.control.root.isConnected){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
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
      value: notesState.text || '',
      open: !!notesState.open,
      onChange: value => {
        notesState.text = value == null ? '' : String(value);
      },
      onToggle: open => {
        notesState.open = !!open;
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
    ensureHeatmapTextResizeObserver();
    initHot();
    initControls();
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
        : (opts || {});
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      if(nextOpts.force){
        markHeatmapOverlayPending(overlayReason);
        forceHeatmapOverlay(overlayReason, { message: 'Rendering heatmap...' });
      }else{
        queueHeatmapOverlay(overlayReason);
      }
      const runSchedule = () => scheduleHeatmapBase(nextOpts);
      const shouldDelayForOverlay = heatmapOverlayController?.isActive?.() && !nextOpts.viewOnly;
      if(shouldDelayForOverlay){
        const scheduleAfterPaint = () => {
          debugLog('Debug: heatmap draw deferred for overlay', { reason: overlayReason });
          runSchedule();
        };
        const scheduled = Shared.componentLifecycle?.scheduleComponentFrame?.(heatmap, 'heatmap', {
          tabId: nextOpts.tabId || heatmap.__boundTabId || resolveHeatmapAsyncTabId(nextOpts, state.hot) || null,
          reason: overlayReason
        }, scheduleAfterPaint);
        if(!scheduled){
          debugLog('Debug: heatmap overlay defer fallback executed', {
            reason: overlayReason,
            tabId: nextOpts.tabId || heatmap.__boundTabId || null
          });
          runSchedule();
        }
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
    state.layout?.setScheduleDraw?.(() => state.scheduleDraw());
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
    state.scheduleDraw({ tabId: targetTabId || resolveHeatmapAsyncTabId({}, state.hot), reason: 'heatmap-init' });
  };

  function ensureHeatmapDomBindings(tabLike){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
      return false;
    }
    const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'heatmap',
      tabLike: tabLike || null,
      sentinelSelector: '#heatmapLoadExample',
      getCurrentRoot: () => state.root || null,
      getCurrentSentinel: () => heatmap.__domSentinel || null,
      rebind: info => {
        debugLog('Debug: heatmap DOM bindings rebind requested', { tabId: info?.tab?.id || null });
        state.root = info?.root || resolveHeatmapRoot(info?.tab || null) || state.root || null;
        heatmap.ready = false;
        heatmap.init({ root: state.root || undefined, tabId: info?.tab?.id || null, reason: 'workspace-dom-rebind' });
      }
    });
    return !!rebound?.rebound;
  }

  heatmap.ensure = function ensure(options = {}){
    if(ensureHeatmapDomBindings(options.tab || options.tabId || null)){
      return;
    }
    if(!heatmap.ready){
      heatmap.init({ ...options, tabId: options.tabId || options.tab?.id || heatmap.__boundTabId || undefined, reason: options.reason || 'ensure' });
    }
  };
  function syncHeatmapActivationState(tabLike = null, options = {}){
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
            hot.__heatmapDataViewsManager || heatmapDataViewsManager
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
    }else if(typeof state.scheduleDraw === 'function'){
      // Passive/live-DOM activation can still happen after geometry changes while the tab
      // was hidden (toolbar section change, panel constraints, zoom viewport updates).
      // Re-render from active tab data to avoid stale text-aspect transforms.
      state.scheduleDraw({
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
  }

  heatmap.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: heatmap,
    componentKey: 'heatmap',
    resolveRoot: tabLike => resolveHeatmapRoot(tabLike || null) || state.root || null,
    setRoot: root => { state.root = root || state.root || null; },
    ensureBindings: tabLike => ensureHeatmapDomBindings(tabLike),
    init: options => heatmap.init(options),
    afterReady: (tabLike, meta = {}) => {
      if(!heatmap.ready){
        return;
      }
      const passive = !!(meta?.suppressDraw || meta?.suppressAutoDraw || meta?.liveDomFastPath || meta?.passiveControls);
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
    if(ensureHeatmapDomBindings(tab)){
      return;
    }
    if(!heatmap.ready){
      heatmap.init({ root: state.root || undefined, tabId: targetTabId || undefined, reason: meta?.reason || 'activate-tab' });
    }
    syncHeatmapActivationState(tab || targetTabId || null);
  };

  heatmap.captureRuntimeState = function captureRuntimeState(meta = {}){
    const snapshot = buildHeatmapTabContextSnapshotFromState();
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
    applyHeatmapTabContextSnapshot(resolvedSnapshot, { syncUi: true });
    rememberHeatmapOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-apply'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(heatmap, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'heatmap-runtime-apply'
    });
    clearHiddenDrawFlushHandle();
    pendingDrawOptions = {};
    deferredHiddenDrawOptions = null;
    return true;
  };

  heatmap.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: heatmap,
    componentKey: 'heatmap',
    cancel: () => {
      clearHiddenDrawFlushHandle();
      pendingDrawOptions = {};
      deferredHiddenDrawOptions = null;
      state.drawToken = (Number(state.drawToken) || 0) + 1;
    }
  }) || function deactivateHeatmapTab(tab, meta = {}){
    clearHiddenDrawFlushHandle();
    pendingDrawOptions = {};
    deferredHiddenDrawOptions = null;
    state.drawToken = (Number(state.drawToken) || 0) + 1;
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

  heatmap.isIdleForSnapshot = function isIdleForSnapshot(){
    const hasPendingOptions = !!(pendingDrawOptions && Object.keys(pendingDrawOptions).length);
    return !hiddenDrawFlushHandle && !deferredHiddenDrawOptions && !hasPendingOptions;
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
    if(!restored && restoredState && state.lastRenderModel && state.lastViewOptions){
      try{
        replayedFromModel = true;
        restoreHeatmapSvgRootState(svg, cache.svgRootState);
        restoredSvg = !!renderModelWithView(state.lastRenderModel, state.lastViewOptions);
        if(restoredSvg){
          refreshStatsForView(state.lastViewOptions);
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

  heatmap.__getState = () => state;

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
