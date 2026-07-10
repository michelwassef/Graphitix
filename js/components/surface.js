(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const surface = Components.surface = Components.surface || {};

  function getSurfaceRuntimeOwner(){
    return Shared.componentLifecycle?.createRuntimeOwner?.(surface, { componentKey: 'surface' }) || null;
  }

  function rememberSurfaceOwnedRuntimeRecord(tabLike = null, snapshot = null, meta = {}){
    if(!snapshot || typeof snapshot !== 'object'){
      return null;
    }
    return getSurfaceRuntimeOwner()?.capture(snapshot, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'surface',
      reason: meta?.reason || 'surface-owned-runtime-remember'
    }) || snapshot;
  }

  function resolveSurfaceOwnedRuntimeSnapshot(snapshot = null, meta = {}){
    return getSurfaceRuntimeOwner()?.bind(snapshot || null, {
      ...(meta || {}),
      componentKey: 'surface',
      reason: meta?.reason || 'surface-owned-runtime-resolve'
    }) || null;
  }

  function applyExistingSurfaceOwnedRuntimeRecord(tabLike = null, meta = {}){
    const snapshot = getSurfaceRuntimeOwner()?.bind(null, {
      ...(meta || {}),
      tab: tabLike || meta?.tab || null,
      componentKey: 'surface',
      reason: meta?.reason || 'surface-owned-runtime-activate-apply'
    });
    if(!snapshot || typeof surface.applyRuntimeState !== 'function'){
      return false;
    }
    return surface.applyRuntimeState(snapshot, {
      ...(meta || {}),
      reason: meta?.reason || 'surface-owned-runtime-activate-apply'
    });
  }


  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  const hotNS = Shared.hot = Shared.hot || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  const tableImport = Shared.tableImport = Shared.tableImport || {};
  const exporter = Shared.exporter = Shared.exporter || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      console.debug('Debug: surface component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      console.debug('Debug: surface component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if(typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataTransforms.js');
    }catch(err){
      console.debug('Debug: surface component dataTransforms helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      console.debug('Debug: surface component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesState = { text: '', open: false, control: null };
  const exportFontStyles = scope => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scope)
    : null;
  const importFontStyles = (scope, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scope, styles, { prune: true });
    }
  };

  surface.__installed = true;
  surface.ready = false;
  // Unique instance identifier for DOM ids and per-instance caching
  const SURFACE_INSTANCE_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xFFFFF).toString(36)}`;
  surface.__instanceId = SURFACE_INSTANCE_ID;

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 80;
  const DEFAULT_COLS = 3;
  const DEFAULT_GRID_COLOR = '#dddddd';
  let emptyPayloadTemplate = null;

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('surface cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    const session = getActiveSurfaceSessionForState();
    if(emptyPayloadTemplate){
      if(session?.cache && !session.cache.emptyPayloadTemplate){
        session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
        session.updatedAt = Date.now();
      }
      return;
    }
    if(session?.cache?.emptyPayloadTemplate){
      emptyPayloadTemplate = cloneSimple(session.cache.emptyPayloadTemplate) || session.cache.emptyPayloadTemplate;
      return;
    }
    emptyPayloadTemplate = { type: 'surface', config: {} };
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
  }
  const DEFAULT_FILE_NAME = 'surface.graph';
  const DEFAULT_ROTATION = { x: 0.24, y: 1.96 };
  const DEFAULT_AXIS_LABELS = Object.freeze({ x: 'X', y: 'Y', z: 'Z' });
  const SURFACE_LEGEND_TEXT_ROLE = 'scaleTick';
  const SURFACE_LEGEND_LABELS = Object.freeze([
    { id: 'max', key: 'surfaceLegendScaleMax', anchor: 'max' },
    { id: 'min', key: 'surfaceLegendScaleMin', anchor: 'min' }
  ]);
  const SURFACE_LEGEND_BAR_REFERENCE_WIDTH = 360;
  const SURFACE_LEGEND_BAR_MIN_WIDTH = 4;
  const SURFACE_LEGEND_BAR_MAX_WIDTH_RATIO = 0.07;
  const DEFAULT_SURFACE_SETTINGS = Object.freeze({
    colorRamp: 'viridis',
    interpolation: 'grid',
    fontSize: 12,
    axisStroke: 1,
    axisColor: '#3b3b3b',
    textColor: '#000000',
    backgroundColor: '#ffffff',
    colorScheme: 'surface-viridis',
    showGrid: false,
    showFrame: true,
    showPoints: false,
    showLegend: true
  });
  const DEFAULT_SURFACE_LABELS = Object.freeze({
    title: 'Surface Plot',
    x: DEFAULT_AXIS_LABELS.x,
    y: DEFAULT_AXIS_LABELS.y,
    z: DEFAULT_AXIS_LABELS.z
  });

  const COLOR_RAMPS = Object.freeze({
    grayscale: { label: 'Grayscale', stops: ['#000000', '#2e2e2e', '#525252', '#737373', '#969696', '#bdbdbd', '#e0e0e0', '#ffffff'] },
    viridis: { label: 'Viridis', stops: ['#440154', '#3b528b', '#21908d', '#5dc863', '#fde725'] },
    plasma: { label: 'Plasma', stops: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'] },
    magma: { label: 'Magma', stops: ['#0c081b', '#2a115b', '#5c1f78', '#933d6c', '#c75b54', '#f48834', '#fbf671'] },
    turbo: { label: 'Turbo', stops: ['#30123b', '#4145ab', '#2f9df4', '#43ecb0', '#fde54c', '#f45f2a', '#821529'] },
    bluered: { label: 'Blue-Red', stops: ['#1f77b4', '#6baed6', '#c7e9ff', '#fee0d2', '#fcbba1', '#ef3b2c'] }
  });

  const INTERPOLATION_OPTIONS = Object.freeze({
    grid: { label: 'Grid (rectangular)' },
    scatter: { label: 'Points only' }
  });

  const SURFACE_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const SURFACE_AUTO_DRAW_COL_THRESHOLD = 5000;
  const SURFACE_AUTO_DRAW_CELL_THRESHOLD = 50000;
  const SURFACE_DATA_VIEW_MAX = 12;
  const SURFACE_TRANSFORM_SCOPE_DEFAULT = Object.freeze({
    headerRows: 1,
    startCol: 0
  });
  // Parse safety caps to avoid blocking the main thread on extremely large tables
  const SURFACE_MAX_PARSE_ROWS = 20000;
  const SURFACE_MAX_PARSE_POINTS = 100000;

  const state = {
    hot: null,
    root: null,
    layout: null,
    svg: null,
    svgBox: null,
    statsEl: null,
    messageEl: null,
    exportContainer: null,
    renderRow: null,
    renderButton: null,
    autoDrawNotice: null,
    autoDrawEnabled: true,
    autoDrawReason: null,
    autoDrawLockedByThreshold: false,
    drawPending: false,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null,
    lastStats: null,
    statsPanelModel: { resultsModel: null, reportModel: null },
    axisSelects: { x: null, y: null, z: null },
    controls: {},
    axisMap: { x: 0, y: 1, z: 2 },
    labelPositions: { title: null, legend: null },
    _listeners: [],
    _hotHooks: [],
    _facePool: [],
    _pointPool: [],
    _facePoolUsed: 0,
    _pointPoolUsed: 0,
    settings: createDefaultSurfaceSettings(),
    gridStyle: null,
    labels: createDefaultSurfaceLabels(),
    rotation: createDefaultSurfaceRotation(),
    scheduleDraw: () => {},
    fileName: DEFAULT_FILE_NAME,
    fileHandle: null
  };
  const SURFACE_RUNTIME_KEY = `surface-runtime-${Math.random().toString(36).slice(2, 10)}`;
  let surfaceDataToolbarBound = false;
  const surfaceDataToolbarLastActivationByTabId = new Map();
  let surfaceFontEventBound = false;
  let surfaceLockRatioInput = null;
  let surfaceAspectSyncing = false;


  const surfaceSessionsByTabId = new Map();
  // Transient visible-DOM projection bridge. Durable state belongs to the owner session map.
  let projectedSurfaceSession = null;

  // Compatibility bridge: visible-DOM projection tab id. Delete after every projection entrypoint receives explicit owner tab metadata.
  function getSurfaceProjectionTabId(){
    return Shared.componentLifecycle?.resolveProjectionTabId?.(surface, projectedSurfaceSession) || String(surface.__boundTabId || projectedSurfaceSession?.tabId || '').trim();
  }

  function normalizeSurfaceSessionTabId(tabLike = null, meta = {}){
    const direct = typeof tabLike === 'string' || typeof tabLike === 'number' ? tabLike : null;
    const objectTabId = tabLike && typeof tabLike === 'object'
      ? (tabLike.id || tabLike.tabId || tabLike.workspaceTabId || null)
      : null;
    const resolved = direct
      || objectTabId
      || meta?.tabId
      || meta?.workspaceTabId
      || meta?.tab?.id
      || meta?.__workspaceSessionMeta?.tabId
      || Shared.workspaceTabs?.getActiveSessionInfo?.('surface')?.tabId
      || surface.__boundTabId
      || '';
    return String(resolved || '').trim();
  }

  function createDefaultSurfaceNotesState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      text: src.text == null ? '' : String(src.text),
      open: !!src.open
    };
  }

  function createDefaultSurfaceDurableState(source = {}){
    const defaults = createDefaultSurfaceTabContext();
    const src = source && typeof source === 'object' ? source : {};
    return {
      autoDrawEnabled: src.autoDrawEnabled == null ? defaults.autoDrawEnabled : !!src.autoDrawEnabled,
      autoDrawReason: cloneSimple(src.autoDrawReason) || null,
      autoDrawLockedByThreshold: !!src.autoDrawLockedByThreshold,
      drawPending: false,
      lastDataShape: cloneSimple(src.lastDataShape) || cloneSimple(defaults.lastDataShape),
      lastAutoDrawEvaluation: cloneSimple(src.lastAutoDrawEvaluation) || null,
      lastStats: cloneSimple(src.lastStats) || null,
      statsPanelModel: normalizeSurfaceStatsPanelModel(src.statsPanelModel || {}),
      axisMap: Object.assign({}, defaults.axisMap, cloneSimple(src.axisMap) || {}),
      labelPositions: normalizeSurfaceLabelPositions(src.labelPositions, src.legendPosition),
      settings: Object.assign(createDefaultSurfaceSettings(), cloneSimple(src.settings) || {}),
      gridStyle: sanitizeGridStyle(src.gridStyle, src.settings?.axisStroke ?? defaults.settings.axisStroke),
      labels: Object.assign(createDefaultSurfaceLabels(), cloneSimple(src.labels) || {}),
      rotation: normalizeSurfaceRotationSnapshot(src.rotation || defaults.rotation),
      fileName: (typeof src.fileName === 'string' && src.fileName.trim()) ? src.fileName.trim() : DEFAULT_FILE_NAME,
      notes: createDefaultSurfaceNotesState(src.notes || {})
    };
  }

  function createDefaultSurfaceResultsState(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return {
      lastStats: cloneSimple(src.lastStats) || null,
      statsPanelModel: normalizeSurfaceStatsPanelModel(src.statsPanelModel || {})
    };
  }

  function createDefaultSurfaceRefs(root = null){
    return {
      root: root || null,
      tablePanel: null,
      graphPanel: null,
      panelResizer: null,
      hotWrapper: null,
      hotContainer: null,
      svg: null,
      svgBox: null,
      statsEl: null,
      messageEl: null,
      exportContainer: null,
      renderRow: null,
      renderButton: null,
      autoDrawNotice: null,
      xAxis: null,
      yAxis: null,
      zAxis: null,
      interpolation: null,
      fontSize: null,
      fontSizeVal: null,
      axisStroke: null,
      axisStrokeVal: null,
      axisColor: null,
      showGrid: null,
      showFrame: null,
      showPoints: null,
      loadExample: null,
      importButton: null,
      fileInput: null,
      openButton: null,
      saveButton: null,
      saveAsButton: null,
      graphFileInput: null,
      notesControl: null
    };
  }

  function createSurfaceSession({ tabId, root = null, initialState = null } = {}){
    const normalizedTabId = String(tabId || '').trim();
    const source = initialState && typeof initialState === 'object' ? initialState : {};
    const durableSource = source.state && typeof source.state === 'object' ? source.state : source;
    return {
      componentKey: 'surface',
      tabId: normalizedTabId,
      root: root || null,
      state: createDefaultSurfaceDurableState(durableSource),
      results: createDefaultSurfaceResultsState({
        lastStats: durableSource.lastStats || source.lastStats,
        statsPanelModel: durableSource.statsPanelModel || source.statsPanelModel
      }),
      refs: createDefaultSurfaceRefs(root || null),
      cache: {
        emptyPayloadTemplate: cloneSimple(emptyPayloadTemplate) || null,
        facePool: [],
        pointPool: [],
        facePoolUsed: 0,
        pointPoolUsed: 0
      },
      listeners: new Map(),
      timers: {
        scheduleDraw: null,
        pendingDrawOptions: null,
        overlayTimeout: null
      },
      workers: new Map(),
      managers: {
        hot: null,
        dataViews: null,
        layout: null,
        fileHandle: null,
        autoDraw: null
      },
      notes: createDefaultSurfaceNotesState(source.notes || durableSource.notes || {}),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function ensureSurfaceSessionOwnershipShape(session){
    if(!session || typeof session !== 'object'){
      return null;
    }
    session.componentKey = 'surface';
    session.tabId = String(session.tabId || '').trim();
    session.root = session.root || null;
    session.state = createDefaultSurfaceDurableState(session.state || {});
    session.results = createDefaultSurfaceResultsState(session.results || {
      lastStats: session.state.lastStats,
      statsPanelModel: session.state.statsPanelModel
    });
    session.refs = session.refs && typeof session.refs === 'object' ? session.refs : createDefaultSurfaceRefs(session.root || null);
    session.refs.root = session.refs.root || session.root || null;
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    if(!Object.prototype.hasOwnProperty.call(session.cache, 'emptyPayloadTemplate')){ session.cache.emptyPayloadTemplate = null; }
    if(!Array.isArray(session.cache.facePool)){ session.cache.facePool = []; }
    if(!Array.isArray(session.cache.pointPool)){ session.cache.pointPool = []; }
    session.cache.facePoolUsed = Number(session.cache.facePoolUsed) || 0;
    session.cache.pointPoolUsed = Number(session.cache.pointPoolUsed) || 0;
    session.listeners = session.listeners instanceof Map ? session.listeners : new Map();
    session.timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'scheduleDraw')){ session.timers.scheduleDraw = null; }
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'pendingDrawOptions')){ session.timers.pendingDrawOptions = null; }
    if(!Object.prototype.hasOwnProperty.call(session.timers, 'overlayTimeout')){ session.timers.overlayTimeout = null; }
    session.workers = session.workers instanceof Map ? session.workers : new Map();
    session.managers = session.managers && typeof session.managers === 'object' ? session.managers : {};
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'hot')){ session.managers.hot = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'dataViews')){ session.managers.dataViews = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'layout')){ session.managers.layout = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'fileHandle')){ session.managers.fileHandle = null; }
    if(!Object.prototype.hasOwnProperty.call(session.managers, 'autoDraw')){ session.managers.autoDraw = null; }
    session.notes = createDefaultSurfaceNotesState(session.notes || session.state?.notes || {});
    return session;
  }

  function getSurfaceSession(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeSurfaceSessionTabId(tabLike, meta);
    if(!tabId){
      return null;
    }
    let session = surfaceSessionsByTabId.get(tabId) || null;
    if(!session && options.create !== false){
      session = createSurfaceSession({
        tabId,
        root: meta?.root || resolveSurfaceRoot(tabLike || tabId || null) || null,
        initialState: options.initialState || null
      });
      surfaceSessionsByTabId.set(tabId, session);
    }
    return ensureSurfaceSessionOwnershipShape(session);
  }

  function getActiveSurfaceSessionForState(){
    return Shared.componentLifecycle?.resolveActiveSessionForComponent?.({
      componentKey: 'surface',
      component: surface,
      projectedSession: projectedSurfaceSession,
      getSession: getSurfaceSession,
      ensureSession: ensureSurfaceSessionOwnershipShape,
      create: true,
      reason: 'active-surface-session'
    }) || null;
  }

  function getSurfaceHotOwnerTabId(hotInstance = null){
    return String(Shared.componentLifecycle?.resolveOwnedObjectTabId?.(hotInstance, 'surface') || '').trim();
  }

  function getSurfaceTabIdFromTarget(target = null){
    return String(Shared.componentLifecycle?.resolveTabIdFromTarget?.(target) || '').trim();
  }

  function getSurfaceActiveTabId(){
    return String(Shared.componentLifecycle?.resolveActiveComponentTabId?.('surface', surface, projectedSurfaceSession) || '').trim();
  }

  function getSurfaceCallbackOwner(meta = {}){
    const target = meta?.target || meta?.event?.currentTarget || meta?.event?.target || null;
    const tabId = String(meta?.tabId || getSurfaceHotOwnerTabId(meta?.hot) || getSurfaceTabIdFromTarget(target) || getSurfaceActiveTabId() || '').trim();
    return {
      tabId,
      session: tabId
        ? getSurfaceSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'surface-callback-owner' }, { create: true })
        : getActiveSurfaceSessionForState(),
      hot: meta?.hot || null
    };
  }

  function isSurfaceCallbackOwnerActive(owner = null){
    const ownerTabId = String(owner?.tabId || owner?.session?.tabId || '').trim();
    const activeTabId = getSurfaceActiveTabId();
    return !!(!ownerTabId || (activeTabId && ownerTabId === activeTabId));
  }

  function runSurfaceOwnedCallback(owner, callback, meta = {}){
    if(typeof callback !== 'function'){
      return undefined;
    }
    const resolvedOwner = owner?.session || owner?.tabId
      ? owner
      : getSurfaceCallbackOwner(meta);
    if(!isSurfaceCallbackOwnerActive(resolvedOwner)){
      debugLog('Debug: surface callback skipped for inactive owner', {
        ownerTabId: resolvedOwner?.tabId || resolvedOwner?.session?.tabId || null,
        activeTabId: getSurfaceActiveTabId() || null,
        reason: meta?.reason || 'surface-owned-callback'
      });
      return undefined;
    }
    return callback(resolvedOwner);
  }

  function runSurfaceEventOwnerCallback(event, reason, callback){
    const owner = getSurfaceCallbackOwner({ event, target: event?.currentTarget || event?.target || null, reason });
    return runSurfaceOwnedCallback(owner, callback, { event, reason });
  }

  function getSurfaceSessionForHot(hotInstance = null, meta = {}, options = {}){
    const tabId = getSurfaceHotOwnerTabId(hotInstance);
    if(tabId){
      return getSurfaceSession(tabId, { ...(meta || {}), tabId }, { create: options.create === true });
    }
    return options.fallbackActive === false ? null : getActiveSurfaceSessionForState();
  }

  const surfaceDataViewsManagerBelongsToSession = (manager = null, session = null) => (
    Shared.componentLifecycle?.ownedDataViewsManagerBelongsToSession?.(manager, session, 'surface', {
      ensureSession: ensureSurfaceSessionOwnershipShape
    }) === true
  );

  function isSurfaceSessionActive(session = null){
    const shaped = ensureSurfaceSessionOwnershipShape(session);
    if(!shaped?.tabId){
      return false;
    }
    return String(shaped.tabId) === String(getSurfaceProjectionTabId());
  }

  function isSurfaceSessionActiveOrActivating(session = null){
    const shaped = ensureSurfaceSessionOwnershipShape(session);
    if(!shaped?.tabId){ return false; }
    const workspaceActiveTabId = global.Main?.session?.workspaceState?.activeTabId || null;
    return isSurfaceSessionActive(shaped)
      || (workspaceActiveTabId && String(shaped.tabId) === String(workspaceActiveTabId));
  }

  function scheduleSurfaceDrawForSession(session = null, options = {}){
    const shaped = ensureSurfaceSessionOwnershipShape(session);
    if(!shaped){
      return false;
    }
    const sourceOptions = options && typeof options === 'object' ? options : {};
    const scheduleOptions = Shared.componentLifecycle?.sanitizeDrawOptions
      ? Shared.componentLifecycle.sanitizeDrawOptions(sourceOptions, { tabId: shaped.tabId || null, reason: 'surface-session-draw' })
      : { ...sourceOptions, tabId: shaped.tabId || undefined, reason: sourceOptions.reason || 'surface-session-draw' };
    shaped.timers.pendingDrawOptions = scheduleOptions;
    shaped.updatedAt = Date.now();
    if(!isSurfaceSessionActiveOrActivating(shaped)){
      shaped.state.drawPending = true;
      debugLog('Debug: surface draw scheduled for inactive owner', {
        tabId: shaped.tabId || null,
        reason: scheduleOptions.reason || null
      });
      return false;
    }
    const scheduler = shaped.timers?.scheduleDraw || state.scheduleDraw;
    if(typeof scheduler !== 'function'){
      return false;
    }
    scheduler(scheduleOptions);
    return true;
  }

  function scheduleSurfaceDrawForHot(hotInstance = null, options = {}){
    const session = getSurfaceSessionForHot(hotInstance, {
      ...(options || {}),
      reason: options.reason || 'surface-hot-draw'
    }, { create: false });
    if(session && !isSurfaceSessionActiveOrActivating(session)){
      session.state.drawPending = true;
      session.updatedAt = Date.now();
      return false;
    }
    return scheduleSurfaceDrawForSession(session || getActiveSurfaceSessionForState(), options);
  }

  function scheduleActiveSurfaceDraw(options = {}){
    return scheduleSurfaceDrawForSession(getActiveSurfaceSessionForState(), options);
  }


  function normalizeSurfacePosition(value){
    const source = value && typeof value === 'object' ? value : null;
    if(!source){
      return null;
    }
    const x = Number(source.x);
    const y = Number(source.y);
    if(!Number.isFinite(x) || !Number.isFinite(y)){
      return null;
    }
    const out = { x, y };
    const relX = Number(source.relX);
    const relY = Number(source.relY);
    if(Number.isFinite(relX)){ out.relX = relX; }
    if(Number.isFinite(relY)){ out.relY = relY; }
    return out;
  }

  function normalizeSurfaceLabelPositions(value, migratedLegend = null){
    const source = value && typeof value === 'object' ? value : {};
    return {
      title: normalizeSurfacePosition(source.title),
      legend: normalizeSurfacePosition(source.legend) || normalizeSurfacePosition(migratedLegend)
    };
  }

  function patchSurfaceVisualState(session = null, patch = {}, meta = {}){
    const owner = ensureSurfaceSessionOwnershipShape(session || getActiveSurfaceSessionForState());
    const hasLabels = Object.prototype.hasOwnProperty.call(patch || {}, 'labels');
    const hasPositions = Object.prototype.hasOwnProperty.call(patch || {}, 'labelPositions');
    const nextLabels = hasLabels
      ? Object.assign(createDefaultSurfaceLabels(), cloneSimple(patch.labels) || {})
      : Object.assign(createDefaultSurfaceLabels(), cloneSimple(state.labels) || {});
    const nextPositions = hasPositions ? normalizeSurfaceLabelPositions(patch.labelPositions) : normalizeSurfaceLabelPositions(state.labelPositions);
    if(owner?.state){
      if(hasLabels){ owner.state.labels = nextLabels; }
      if(hasPositions){
        owner.state.labelPositions = nextPositions;
      }
      owner.updatedAt = Date.now();
      debugLog('Debug: surface visual state patched to owner session', {
        tabId: owner.tabId || null,
        reason: meta?.reason || null,
        labels: hasLabels,
        labelPositions: hasPositions
      });
    }
    if(!owner || isSurfaceSessionActiveOrActivating(owner)){
      if(hasLabels){ state.labels = nextLabels; }
      if(hasPositions){
        state.labelPositions = nextPositions;
      }
    }
    return { labels: nextLabels, labelPositions: nextPositions };
  }

  function patchSurfaceLabelPosition(session = null, key, value, meta = {}){
    const nextPositions = normalizeSurfaceLabelPositions({
      ...normalizeSurfaceLabelPositions(state.labelPositions),
      [key]: value || null
    });
    return patchSurfaceVisualState(session, { labelPositions: nextPositions }, meta);
  }


  function getSurfaceDeactivationTabId(tab, meta = {}){
    return (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
  }

  function getSurfaceDeactivationSession(tab, meta = {}){
    const tabId = getSurfaceDeactivationTabId(tab, meta);
    const activeSession = getActiveSurfaceSessionForState();
    const activeTabId = getSurfaceProjectionTabId() || activeSession?.tabId || null;
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      return getSurfaceSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'surface-deactivate-target-session' }, { create: false });
    }
    return activeSession || (tabId ? getSurfaceSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'surface-deactivate-active-session' }, { create: false }) : null);
  }

  function markSurfaceSessionDrawIdle(session = null){
    if(!session){ return; }
    session.state.drawPending = false;
    session.updatedAt = Date.now();
  }

  function captureSurfaceSessionForDeactivation(tab, meta = {}){
    const tabId = getSurfaceDeactivationTabId(tab, meta);
    const activeSession = getActiveSurfaceSessionForState();
    const activeTabId = getSurfaceProjectionTabId() || activeSession?.tabId || null;
    const targetSession = getSurfaceDeactivationSession(tab, meta);
    if(tabId && activeTabId && String(tabId) !== String(activeTabId)){
      markSurfaceSessionDrawIdle(targetSession);
      debugLog('Debug: surface inactive-tab deactivate skipped active mirror capture', {
        tabId,
        activeTabId,
        reason: meta?.reason || 'surface-deactivate-capture'
      });
      return targetSession;
    }
    if(targetSession){
      captureSurfaceSessionStateFromActive(targetSession, { ...(meta || {}), reason: meta?.reason || 'surface-deactivate-capture' });
      markSurfaceSessionDrawIdle(targetSession);
    }
    return targetSession;
  }

  function syncSurfaceSessionRefsFromActive(session = null){
    const shaped = ensureSurfaceSessionOwnershipShape(session || projectedSurfaceSession || getActiveSurfaceSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isSurfaceSessionActiveOrActivating(shaped)){
      return shaped;
    }
    shaped.root = state.root || shaped.root || null;
    shaped.refs = Object.assign(createDefaultSurfaceRefs(shaped.root || null), shaped.refs || {}, {
      root: state.root || shaped.root || null,
      tablePanel: state.layout?.elements?.tablePanel || querySurfaceRoot('#surfaceTablePanel'),
      graphPanel: state.layout?.elements?.graphPanel || querySurfaceRoot('#surfaceGraphPanel'),
      panelResizer: state.layout?.elements?.panelResizer || querySurfaceRoot('#surfacePanelResizer'),
      hotWrapper: state.layout?.elements?.hotWrapper || querySurfaceRoot('#surfaceHotWrapper'),
      hotContainer: state.layout?.elements?.hotContainer || querySurfaceRoot('#surfaceHot'),
      svg: state.svg || getSurfaceNodeById('surfaceSvg'),
      svgBox: state.svgBox || state.layout?.elements?.svgBox || querySurfaceRoot('#surfaceGraphPanel .svgbox'),
      statsEl: state.statsEl || getSurfaceNodeById('surfaceStatsSummary'),
      messageEl: state.messageEl || getSurfaceNodeById('surfaceMessage'),
      exportContainer: state.exportContainer || getSurfaceNodeById('surfaceExportControls'),
      renderRow: state.renderRow || getSurfaceNodeById('surfaceRenderRow'),
      renderButton: state.renderButton || getSurfaceNodeById('surfaceRenderButton'),
      autoDrawNotice: state.autoDrawNotice || getSurfaceNodeById('surfaceAutoDrawNotice'),
      xAxis: state.axisSelects?.x || getSurfaceNodeById('surfaceXAxis'),
      yAxis: state.axisSelects?.y || getSurfaceNodeById('surfaceYAxis'),
      zAxis: state.axisSelects?.z || getSurfaceNodeById('surfaceZAxis'),
      interpolation: state.controls?.interpolation || getSurfaceNodeById('surfaceInterpolation'),
      fontSize: state.controls?.fontSize || getSurfaceNodeById('surfaceFontSize'),
      fontSizeVal: state.controls?.fontSizeVal || getSurfaceNodeById('surfaceFontSizeVal'),
      axisStroke: state.controls?.axisStroke || getSurfaceNodeById('surfaceAxisStroke'),
      axisStrokeVal: state.controls?.axisStrokeVal || getSurfaceNodeById('surfaceAxisStrokeVal'),
      axisColor: state.controls?.axisColor || getSurfaceNodeById('surfaceAxisColor'),
      showGrid: state.controls?.showGrid || getSurfaceNodeById('surfaceShowGrid'),
      showFrame: state.controls?.showFrame || getSurfaceNodeById('surfaceShowFrame'),
      showPoints: state.controls?.showPoints || getSurfaceNodeById('surfaceShowPoints'),
      loadExample: state.controls?.loadExample || getSurfaceNodeById('surfaceLoadExample'),
      importButton: state.controls?.importBtn || getSurfaceNodeById('surfaceImport'),
      fileInput: state.controls?.importFile || getSurfaceNodeById('surfaceFile'),
      openButton: getSurfaceNodeById('openSurfaceGraph'),
      saveButton: getSurfaceNodeById('saveSurfaceGraph'),
      saveAsButton: getSurfaceNodeById('saveAsSurface'),
      graphFileInput: state.controls?.graphFileInput || getSurfaceNodeById('surfaceGraphFile'),
      notesControl: canUseSurfaceNotesControl(notesState.control) ? notesState.control : null
    });
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function syncSurfaceSessionManagersFromActive(session = null){
    const shaped = ensureSurfaceSessionOwnershipShape(session || projectedSurfaceSession || getActiveSurfaceSessionForState());
    if(!shaped){ return null; }
    const sessionIsActive = !shaped.tabId || isSurfaceSessionActiveOrActivating(shaped);
    const stateHotTabId = String(
      state.hot?.__surfaceTabId
      || state.hot?.__workspaceTabId
      || state.hot?.__graphitixTabId
      || state.hot?.__hotWorkspaceTabId
      || ''
    ).trim();
    const hotBelongsToSession = !!state.hot && (!shaped.tabId || (stateHotTabId && stateHotTabId === shaped.tabId));
    if(hotBelongsToSession){
      shaped.managers.hot = state.hot;
      const manager = state.hot?.__surfaceDataViewsManager || null;
      shaped.managers.dataViews = surfaceDataViewsManagerBelongsToSession(manager, shaped) ? manager : shaped.managers.dataViews || null;
    }
    if(sessionIsActive){
      shaped.managers.layout = state.layout || shaped.managers.layout || null;
      shaped.managers.fileHandle = state.fileHandle || shaped.managers.fileHandle || null;
      shaped.managers.autoDraw = surfaceAutoDrawManager || shaped.managers.autoDraw || null;
      shaped.timers.scheduleDraw = state.scheduleDraw || shaped.timers.scheduleDraw || null;
      shaped.timers.overlayTimeout = _surfaceOverlayTimeout || shaped.timers.overlayTimeout || null;
      shaped.cache.facePool = Array.isArray(state._facePool) ? state._facePool.slice() : [];
      shaped.cache.pointPool = Array.isArray(state._pointPool) ? state._pointPool.slice() : [];
      shaped.cache.facePoolUsed = Number(state._facePoolUsed) || 0;
      shaped.cache.pointPoolUsed = Number(state._pointPoolUsed) || 0;
    }
    shaped.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || shaped.cache.emptyPayloadTemplate || null;
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function resolveSurfaceOverlaySession(options = {}){
    const opts = options && typeof options === 'object' ? options : {};
    if(opts.session){
      return ensureSurfaceSessionOwnershipShape(opts.session);
    }
    const tabLike = opts.tab || opts.tabId || null;
    if(tabLike){
      return getSurfaceSession(tabLike, { ...(opts || {}), reason: opts.reason || 'surface-overlay-session' }, { create: opts.create === true });
    }
    return getActiveSurfaceSessionForState();
  }

  function setSurfaceOverlayTimeoutForSession(session = null, timeoutHandle = null){
    const shaped = ensureSurfaceSessionOwnershipShape(session || getActiveSurfaceSessionForState());
    if(!shaped){ return null; }
    shaped.timers.overlayTimeout = timeoutHandle || null;
    if(isSurfaceSessionActiveOrActivating(shaped)){
      _surfaceOverlayTimeout = timeoutHandle || null;
    }
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function clearSurfaceOverlayTimeoutForSession(session = null){
    const shaped = ensureSurfaceSessionOwnershipShape(session || getActiveSurfaceSessionForState());
    if(!shaped){ return null; }
    const timeoutHandle = shaped.timers?.overlayTimeout || (isSurfaceSessionActiveOrActivating(shaped) ? _surfaceOverlayTimeout : null);
    if(timeoutHandle){
      try{ Shared.componentLifecycle?.clearComponentTimeout?.(surface, timeoutHandle); }catch(_err){}
    }
    shaped.timers.overlayTimeout = null;
    if(isSurfaceSessionActiveOrActivating(shaped)){
      _surfaceOverlayTimeout = null;
    }
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function captureSurfaceNotesMirror(){
    const snapshot = captureSurfaceNotesSnapshot();
    return createDefaultSurfaceNotesState(snapshot);
  }

  function captureSurfaceSessionStateFromActive(session = null, meta = {}){
    const shaped = ensureSurfaceSessionOwnershipShape(session || getActiveSurfaceSessionForState());
    if(!shaped){ return null; }
    if(shaped.tabId && !isSurfaceSessionActiveOrActivating(shaped)){
      shaped.updatedAt = Date.now();
      return shaped;
    }
    const context = buildSurfaceTabContextSnapshotFromState();
    shaped.state = createDefaultSurfaceDurableState(context);
    shaped.results = createDefaultSurfaceResultsState({
      lastStats: context.lastStats,
      statsPanelModel: context.statsPanelModel
    });
    shaped.notes = createDefaultSurfaceNotesState(context.notes || captureSurfaceNotesMirror());
    syncSurfaceSessionRefsFromActive(shaped);
    syncSurfaceSessionManagersFromActive(shaped);
    shaped.updatedAt = Date.now();
    return shaped;
  }

  function applySurfaceSessionStateToActive(session = null, options = {}){
    const shaped = ensureSurfaceSessionOwnershipShape(session || getActiveSurfaceSessionForState());
    if(!shaped){ return false; }
    const durable = createDefaultSurfaceDurableState(shaped.state || {});
    const context = Object.assign({}, durable, {
      lastStats: cloneSimple(shaped.results?.lastStats || durable.lastStats) || null,
      statsPanelModel: normalizeSurfaceStatsPanelModel(shaped.results?.statsPanelModel || durable.statsPanelModel || {}),
      fileHandle: shaped.managers?.fileHandle || state.fileHandle || null,
      notes: createDefaultSurfaceNotesState(shaped.notes || durable.notes || {})
    });
    applySurfaceTabContextSnapshot(context, { syncUi: options.syncUi !== false, session: shaped });
    state._facePool = Array.isArray(shaped.cache?.facePool) ? shaped.cache.facePool.slice() : [];
    state._pointPool = Array.isArray(shaped.cache?.pointPool) ? shaped.cache.pointPool.slice() : [];
    state._facePoolUsed = Number(shaped.cache?.facePoolUsed) || 0;
    state._pointPoolUsed = Number(shaped.cache?.pointPoolUsed) || 0;
    if(options.restoreEmptyPayload !== false && shaped.cache?.emptyPayloadTemplate){
      emptyPayloadTemplate = cloneSimple(shaped.cache.emptyPayloadTemplate) || emptyPayloadTemplate;
    }
    if(!state.root && shaped.root){
      state.root = shaped.root;
    }
    _surfaceOverlayTimeout = shaped.timers?.overlayTimeout || null;
    shaped.updatedAt = Date.now();
    return true;
  }

  function bindSurfaceSessionForTab(tabLike = null, meta = {}, options = {}){
    const tabId = normalizeSurfaceSessionTabId(tabLike, meta);
    if(!tabId){ return null; }
    if(projectedSurfaceSession && projectedSurfaceSession.tabId && projectedSurfaceSession.tabId !== tabId){
      captureSurfaceSessionStateFromActive(projectedSurfaceSession, {
        reason: meta?.reason || 'surface-session-switch-capture'
      });
    }
    const session = getSurfaceSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'surface-session-bind' }, { create: true });
    if(!session){ return null; }
    const root = meta?.root || resolveSurfaceRoot(tabLike || tabId || null) || session.root || null;
    session.root = root || session.root || null;
    session.refs.root = root || session.refs.root || null;
    projectedSurfaceSession = session;
    surface.__surfaceSessionTabId = session.tabId;
    if(!surface.__boundTabId){
      surface.__boundTabId = session.tabId;
    }
    if(options.apply === true){
      applySurfaceSessionStateToActive(session, options);
    }
    syncSurfaceSessionRefsFromActive(session);
    syncSurfaceSessionManagersFromActive(session);
    return session;
  }

  function setSurfaceSessionStateFromRuntimeRecord(record, meta = {}){
    if(!record || typeof record !== 'object'){
      return null;
    }
    const session = getSurfaceSession(meta?.tab || meta?.tabId || getSurfaceProjectionTabId() || null, meta, { create: true });
    if(!session){
      return null;
    }
    const source = record.state && typeof record.state === 'object' ? record.state : record;
    session.state = createDefaultSurfaceDurableState(source);
    session.results = createDefaultSurfaceResultsState({
      lastStats: source.lastStats || record.lastStats,
      statsPanelModel: source.statsPanelModel || record.statsPanelModel
    });
    session.notes = createDefaultSurfaceNotesState(record.notes || source.notes || {});
    if(record.emptyPayloadTemplate){
      session.cache.emptyPayloadTemplate = cloneSimple(record.emptyPayloadTemplate) || session.cache.emptyPayloadTemplate || null;
    }
    session.updatedAt = Date.now();
    return session;
  }

  function resolveSurfaceRoot(tabLike){
    return Shared.workspaceTabs?.getMountedRoot?.(tabLike || null, 'surface')
      || state.root
      || null;
  }

  function querySurfaceRoot(selector, tabLike){
    const root = resolveSurfaceRoot(tabLike);
    if(!root || !selector){
      return null;
    }
    return root.querySelector?.(selector) || null;
  }

  function getSurfaceNodeById(id, tabLike){
    if(!id){
      return null;
    }
    const root = resolveSurfaceRoot(tabLike);
    if(root?.getElementById){
      const byId = root.getElementById(id);
      if(byId){
        return byId;
      }
    }
    return root?.querySelector?.(`#${id}`) || null;
  }

  function resolveSurfaceDrawableFrame(targetEl){
    const target = targetEl || state.svg || getSurfaceNodeById('surfaceSvg');
    const svgBox = state.svgBox
      || state.layout?.elements?.svgBox
      || target?.closest?.('.svgbox')
      || querySurfaceRoot('#surfaceGraphPanel .svgbox')
      || null;
    const frame = componentLayout?.resolveDrawableFrame?.({
      componentName: 'surface',
      plot: target,
      svgBox,
      graphPanel: state.graphPanel || state.layout?.elements?.graphPanel || querySurfaceRoot('#surfaceGraphPanel')
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

  function ensureSurfaceGraphViewport(svg, options = {}){
    const helper = Shared.graphViewport?.ensure
      || Shared.ensureGraphViewport
      || Shared.autoResizeSvg
      || global.ensureGraphViewport
      || global.autoResizeSvg;
    if(typeof helper !== 'function' || !svg){
      debugLog('Debug: surface graph viewport helper missing', {
        hasSvg: !!svg,
        reason: options?.debugLabel || options?.reason || null
      });
      return;
    }
    helper(svg, {
      padding: 16,
      debugLabel: 'surface-3d-graph',
      preserveAspectRatio: 'xMidYMid meet',
      ...options
    });
  }

  function parseSurfacePositiveNumber(value){
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
  }

  function resolveSurface3dFrame(drawableFrame){
    const availableWidth = parseSurfacePositiveNumber(drawableFrame?.width);
    const availableHeight = parseSurfacePositiveNumber(drawableFrame?.height);
    const dataset = state.svgBox?.dataset || {};
    const graphWidth = parseSurfacePositiveNumber(dataset.graphWidthPx || dataset.svgWidth || dataset.resizerBaseWidth);
    const graphHeight = parseSurfacePositiveNumber(dataset.graphHeightPx || dataset.svgHeight || dataset.resizerBaseHeight);
    const datasetAspect = parseSurfacePositiveNumber(dataset.resizerAspectRatio);
    const graphAspect = Number.isFinite(graphWidth) && Number.isFinite(graphHeight) && graphHeight > 0
      ? graphWidth / graphHeight
      : NaN;
    const targetAspect = Number.isFinite(datasetAspect) && datasetAspect > 0
      ? datasetAspect
      : (Number.isFinite(graphAspect) && graphAspect > 0 ? graphAspect : 1);
    const fallbackWidth = Number.isFinite(graphWidth) ? graphWidth : 640;
    const fallbackHeight = Number.isFinite(graphHeight) ? graphHeight : Math.round(fallbackWidth / targetAspect);
    let width = Number.isFinite(availableWidth) ? availableWidth : fallbackWidth;
    let height = Math.round(width / targetAspect);
    if(Number.isFinite(availableHeight) && height > availableHeight){
      height = availableHeight;
      width = Math.round(height * targetAspect);
      if(Number.isFinite(availableWidth) && width > availableWidth){
        width = availableWidth;
        height = Math.round(width / targetAspect);
      }
    }else if(!Number.isFinite(availableHeight)){
      height = fallbackHeight;
    }
    if(!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0){
      width = 640;
      height = 640;
    }
    const resolved = {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
      targetAspect
    };
    debugLog('Debug: surface 3d frame resolved', {
      availableWidth: Number.isFinite(availableWidth) ? availableWidth : null,
      availableHeight: Number.isFinite(availableHeight) ? availableHeight : null,
      graphWidth: Number.isFinite(graphWidth) ? graphWidth : null,
      graphHeight: Number.isFinite(graphHeight) ? graphHeight : null,
      targetAspect,
      width: resolved.width,
      height: resolved.height
    });
    return resolved;
  }

  function getSurfaceLockRatioCheckbox(){
    if(surfaceLockRatioInput && surfaceLockRatioInput.isConnected){
      return surfaceLockRatioInput;
    }
    const svgBox = state.svgBox || querySurfaceRoot('#surfaceGraphPanel .svgbox');
    if(!svgBox){
      return null;
    }
    const checkbox = svgBox.querySelector('.resizer-aspect-checkbox');
    if(checkbox){
      surfaceLockRatioInput = checkbox;
    }
    return checkbox;
  }

  function syncSurfaceAspectControls(reason){
    if(surfaceAspectSyncing){
      return;
    }
    surfaceAspectSyncing = true;
    try{
      const lockRatioCheckbox = getSurfaceLockRatioCheckbox();
      if(!lockRatioCheckbox){
        return;
      }
      const lockLabel = lockRatioCheckbox.closest('label');
      if(!lockRatioCheckbox.checked){
        lockRatioCheckbox.checked = true;
        lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      lockRatioCheckbox.disabled = true;
      if(lockLabel){
        if(!lockLabel.__surfaceOriginalTitle){
          lockLabel.__surfaceOriginalTitle = lockLabel.title || '';
        }
        lockLabel.title = 'Locked for 3D surface plots';
      }
      const svgBox = state.svgBox || lockRatioCheckbox.closest('.svgbox');
      if(svgBox?.dataset){
        svgBox.dataset.resizerAspectLocked = 'true';
      }
      debugLog('Debug: surface aspect controls synced', {
        checked: !!lockRatioCheckbox.checked,
        disabled: !!lockRatioCheckbox.disabled,
        reason: reason || null
      });
    }finally{
      surfaceAspectSyncing = false;
    }
  }

  function createDefaultSurfaceSettings(){
    return { ...DEFAULT_SURFACE_SETTINGS };
  }

  function createDefaultSurfaceLabels(){
    return { ...DEFAULT_SURFACE_LABELS };
  }

  function createDefaultSurfaceRotation(){
    if(typeof plot3d.createRotationState === 'function'){
      return plot3d.createRotationState(DEFAULT_ROTATION);
    }
    return { x: DEFAULT_ROTATION.x, y: DEFAULT_ROTATION.y };
  }

  function createDefaultSurfaceTabContext(){
    return {
      autoDrawEnabled: true,
      autoDrawReason: null,
      autoDrawLockedByThreshold: false,
      drawPending: false,
      lastDataShape: { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: null,
      lastStats: null,
      statsPanelModel: { resultsModel: null, reportModel: null },
      axisMap: { x: 0, y: 1, z: 2 },
      labelPositions: { title: null, legend: null },
      settings: createDefaultSurfaceSettings(),
      gridStyle: createDefaultGridStyle(DEFAULT_SURFACE_SETTINGS.axisStroke),
      labels: createDefaultSurfaceLabels(),
      rotation: cloneSimple(createDefaultSurfaceRotation()) || createDefaultSurfaceRotation(),
      fileName: DEFAULT_FILE_NAME,
      fileHandle: null,
      notes: {
        text: '',
        open: false
      }
    };
  }

  function canUseSurfaceNotesControl(noteControl){
    if(!noteControl){ return false; }
    const root = state.root || resolveSurfaceRoot(getSurfaceProjectionTabId() || null);
    const controlRoot = noteControl.root || null;
    if(controlRoot){
      return !!controlRoot.isConnected && (!root || root === controlRoot || root.contains?.(controlRoot));
    }
    return !!root && (!noteControl.element || root.contains?.(noteControl.element));
  }

  function captureSurfaceNotesSnapshot(){
    const noteControl = canUseSurfaceNotesControl(notesState.control) ? notesState.control : null;
    const text = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const open = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = text;
    notesState.open = open;
    const session = getActiveSurfaceSessionForState();
    if(session){
      session.notes = createDefaultSurfaceNotesState({ text, open });
      session.state.notes = createDefaultSurfaceNotesState({ text, open });
      session.updatedAt = Date.now();
    }
    return { text, open };
  }

  function normalizeSurfaceRotationSnapshot(rotation){
    const restored = typeof plot3d.createRotationState === 'function'
      ? plot3d.createRotationState(rotation || DEFAULT_ROTATION)
      : {
        x: Number(rotation?.x) || DEFAULT_ROTATION.x,
        y: Number(rotation?.y) || DEFAULT_ROTATION.y,
        z: Number(rotation?.z) || 0,
        quaternion: rotation?.quaternion
          ? {
            w: Number(rotation.quaternion.w) || 0,
            x: Number(rotation.quaternion.x) || 0,
            y: Number(rotation.quaternion.y) || 0,
            z: Number(rotation.quaternion.z) || 0
          }
          : null
      };
    return cloneSimple(restored) || createDefaultSurfaceRotation();
  }


  function commitSurfaceRotationState(rotation, reason = 'surface-rotation-state'){
    if(rotation && typeof rotation === 'object'){
      state.rotation = rotation;
    }else if(!state.rotation || typeof state.rotation !== 'object'){
      state.rotation = createDefaultSurfaceRotation();
    }
    if(typeof plot3d.normalizeRotation === 'function'){
      try{ plot3d.normalizeRotation(state.rotation); }catch(_err){}
    }
    const session = getActiveSurfaceSessionForState();
    if(session?.state){
      session.state.rotation = state.rotation;
      session.updatedAt = Date.now();
    }
    debugLog('Debug: surface rotation state committed', {
      reason,
      tabId: session?.tabId || getSurfaceProjectionTabId() || null,
      rotation: {
        x: state.rotation?.x,
        y: state.rotation?.y,
        z: state.rotation?.z
      }
    });
    return state.rotation;
  }

  function setSurfaceFileName(name, session = null){
    const normalized = (typeof name === 'string' && name.trim()) ? name.trim() : DEFAULT_FILE_NAME;
    const owner = ensureSurfaceSessionOwnershipShape(session || getActiveSurfaceSessionForState());
    if(owner?.state){
      owner.state.fileName = normalized;
      owner.updatedAt = Date.now();
    }
    if(!owner || isSurfaceSessionActiveOrActivating(owner)){
      state.fileName = normalized;
    }
    return normalized;
  }

  function setSurfaceFileHandle(handle, session = null){
    const owner = ensureSurfaceSessionOwnershipShape(session || getActiveSurfaceSessionForState());
    if(owner?.managers){
      owner.managers.fileHandle = handle || null;
      owner.updatedAt = Date.now();
    }
    if(!owner || isSurfaceSessionActiveOrActivating(owner)){
      state.fileHandle = handle || null;
    }
    return handle || null;
  }

  function buildSurfaceTabContextSnapshotFromState(){
    const defaults = createDefaultSurfaceTabContext();
    return {
      autoDrawEnabled: !!state.autoDrawEnabled,
      autoDrawReason: cloneSimple(state.autoDrawReason),
      autoDrawLockedByThreshold: !!state.autoDrawLockedByThreshold,
      drawPending: false,
      lastDataShape: cloneSimple(state.lastDataShape) || { ...defaults.lastDataShape },
      lastAutoDrawEvaluation: cloneSimple(state.lastAutoDrawEvaluation),
      lastStats: cloneSimple(state.lastStats),
      statsPanelModel: captureSurfaceStatsPanelModel(),
      axisMap: cloneSimple(state.axisMap) || { ...defaults.axisMap },
      labelPositions: normalizeSurfaceLabelPositions(state.labelPositions),
      settings: Object.assign(createDefaultSurfaceSettings(), cloneSimple(state.settings) || {}),
      gridStyle: sanitizeGridStyle(state.gridStyle, state.settings?.axisStroke ?? defaults.settings.axisStroke),
      labels: Object.assign(createDefaultSurfaceLabels(), cloneSimple(state.labels) || {}),
      rotation: normalizeSurfaceRotationSnapshot(state.rotation),
      fileName: setSurfaceFileName(state.fileName),
      fileHandle: state.fileHandle || null,
      notes: captureSurfaceNotesSnapshot()
    };
  }

  function applySurfaceTabContextSnapshot(context, options = {}){
    const defaults = createDefaultSurfaceTabContext();
    const source = context && typeof context === 'object' ? context : defaults;
    state.autoDrawEnabled = !!source.autoDrawEnabled;
    state.autoDrawReason = cloneSimple(source.autoDrawReason) || null;
    state.autoDrawLockedByThreshold = !!source.autoDrawLockedByThreshold;
    state.drawPending = false;
    state.lastDataShape = cloneSimple(source.lastDataShape) || { ...defaults.lastDataShape };
    state.lastAutoDrawEvaluation = cloneSimple(source.lastAutoDrawEvaluation) || null;
    state.lastStats = cloneSimple(source.lastStats) || null;
    state.statsPanelModel = normalizeSurfaceStatsPanelModel(source.statsPanelModel || {});
    state.axisMap = Object.assign({}, defaults.axisMap, cloneSimple(source.axisMap) || {});
    state.labelPositions = normalizeSurfaceLabelPositions(source.labelPositions, source.legendPosition);
    state.settings = Object.assign(createDefaultSurfaceSettings(), cloneSimple(source.settings) || {});
    setGridStyle(source.gridStyle, state.settings?.axisStroke ?? defaults.settings.axisStroke);
    state.labels = Object.assign(createDefaultSurfaceLabels(), cloneSimple(source.labels) || {});
    state.rotation = normalizeSurfaceRotationSnapshot(source.rotation);
    commitSurfaceRotationState(state.rotation, 'surface-context-apply');
    const ownerSession = options.session || null;
    setSurfaceFileName(source.fileName, ownerSession);
    setSurfaceFileHandle(source.fileHandle, ownerSession);
    notesState.text = source.notes?.text == null ? '' : String(source.notes.text);
    notesState.open = !!source.notes?.open;
    if(options.syncUi !== false){
      cacheDom();
      applySettingsToControls();
      updateAxisOptions();
      if(state.lastStats){
        updateStats(state.lastStats);
      }else{
        restoreSurfaceStatsPanelModel(state.statsPanelModel);
      }
      if(canUseSurfaceNotesControl(notesState.control)){
        notesState.control.setValue(notesState.text);
        notesState.control.setOpen(notesState.open);
      }
      surfaceAutoDrawManager?.updateUi?.();
      syncSurfaceAutoDrawNoticeWidth('tab-context-activate');
    }
  }

  function scheduleSurfaceViewRefresh(reason, extraOptions){
    const options = (extraOptions && typeof extraOptions === 'object') ? extraOptions : {};
    const nextReason = reason || options.reason || 'surface-view-refresh';
    const ownerTabId = normalizeSurfaceSessionTabId(options.tabId || options.workspaceTabId || options.tab?.id || getSurfaceProjectionTabId() || null, {});
    const ownerSession = ownerTabId
      ? getSurfaceSession(ownerTabId, { tabId: ownerTabId, reason: nextReason }, { create: false })
      : getActiveSurfaceSessionForState();
    const normalizedReason = String(nextReason || '').toLowerCase();
    const passiveReason = normalizedReason.includes('restore')
      || normalizedReason.includes('payload')
      || normalizedReason.includes('programmatic')
      || normalizedReason.includes('auto')
      || normalizedReason.includes('init')
      || normalizedReason.includes('observer')
      || normalizedReason.includes('layout')
      || normalizedReason.includes('sync');
    const lifecycleMeta = {
      tabId: ownerTabId || getSurfaceProjectionTabId() || null,
      reason: nextReason,
      source: 'surface-view-refresh',
      forceDraw: options.force === true,
      userInitiated: options.userInitiated === true || (options.userInitiated !== false && !passiveReason)
    };
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('surface', lifecycleMeta)){
      debugLog('Debug: surface view refresh suppressed by lifecycle', { reason: nextReason, tabId: lifecycleMeta.tabId || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'surface', tabId: lifecycleMeta.tabId || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'surface-view-refresh' } });
      return;
    }
    const scheduleOptions = Object.assign({}, options, {
      tabId: ownerTabId || options.tabId || undefined,
      viewOnly: true,
      reason: nextReason,
      source: 'surface-view-refresh',
      forceDraw: lifecycleMeta.forceDraw === true,
      userInitiated: lifecycleMeta.userInitiated === true
    });
    scheduleSurfaceDrawForSession(ownerSession || getActiveSurfaceSessionForState(), scheduleOptions);
  }

  function markSurfaceRotationUserModified(){
    const sessionApi = global.Main?.session || null;
    if(!sessionApi){
      return false;
    }
    const ownerSession = getActiveSurfaceSessionForState();
    const tabId = normalizeSurfaceSessionTabId(ownerSession?.tabId || surface.__boundTabId || sessionApi.workspaceState?.activeTabId || null, {});
    const reason = 'surface-rotation-change';
    const meta = {
      origin: 'user',
      source: 'surface-rotation',
      affectsPayload: true
    };
    if(tabId && typeof sessionApi.markTabUserModified === 'function'){
      return !!sessionApi.markTabUserModified(tabId, reason, meta);
    }
    if(typeof sessionApi.markActiveTabUserModified === 'function'){
      return !!sessionApi.markActiveTabUserModified(reason, meta);
    }
    return false;
  }

  function scheduleSurfaceRotationRedraw(rotation = null){
    commitSurfaceRotationState(rotation || state.rotation, 'surface-rotation-change');
    markSurfaceRotationUserModified();
    scheduleActiveSurfaceDraw({
      viewOnly: true,
      silentOverlay: true,
      force: true,
      userInitiated: true,
      reason: 'rotation'
    });
  }

  function bindSurface3dRotationControls(svg, debugLabel){
    if(!svg || typeof plot3d.attachRotationControls !== 'function'){
      return false;
    }
    const rotationState = commitSurfaceRotationState(state.rotation, 'surface-rotation-bind');
    if(typeof plot3d.ensureRotationHitSurface === 'function'){
      plot3d.ensureRotationHitSurface(svg, { debugLabel: debugLabel || 'surface-plot' });
    }
    plot3d.attachRotationControls(svg, {
      state: rotationState,
      onStart: (_event, state) => commitSurfaceRotationState(state, 'surface-rotation-start'),
      onChange: (_event, state) => scheduleSurfaceRotationRedraw(state),
      onEnd: (_event, state) => commitSurfaceRotationState(state, 'surface-rotation-end'),
      debugLabel: debugLabel || 'surface-plot',
      shouldIgnorePointer: (event) => {
        if(typeof plot3d.isInteractivePointerTarget === 'function'){
          return plot3d.isInteractivePointerTarget(event?.target);
        }
        return typeof plot3d.isLegendPointerTarget === 'function' && plot3d.isLegendPointerTarget(event?.target);
      }
    });
    debugLog('Debug: surface 3d rotation handlers bound', {
      label: debugLabel || 'surface-plot'
    });
    return true;
  }

  function bindActiveSurface3dRotationControls(debugLabel){
    const svg = state.svg || getSurfaceNodeById('surfaceSvg');
    return bindSurface3dRotationControls(svg, debugLabel);
  }

  function isSurfaceFontStyleEvent(detail){
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'surface' || storeKey.startsWith('surface::');
  }

  function ensureSurfaceFontEventListener(){
    if(surfaceFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isSurfaceFontStyleEvent(detail)){
        return;
      }
      scheduleSurfaceViewRefresh('font-style-change', { tabId: detail.tabId || null });
    });
    surfaceFontEventBound = true;
  }

  function getAxisStrokeWidthBase(){
    const numeric = Number(state.settings?.axisStroke);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_SURFACE_SETTINGS.axisStroke;
  }

  function normalizeSurfaceThemeColor(value, fallback){
    return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
  }

  function isSurfaceDarkTheme(){
    const resolved = Shared.colorSchemes?.resolveThemeState?.('surface', { config: state.settings || {} });
    return resolved ? resolved.isDark === true : (String(state.settings?.colorScheme || '').toLowerCase() === 'dark');
  }

  function createDefaultGridStyle(fallbackThickness){
    const thickness = Number.isFinite(Number(fallbackThickness)) && Number(fallbackThickness) >= 0
      ? Number(fallbackThickness)
      : DEFAULT_SURFACE_SETTINGS.axisStroke;
    return {
      color: DEFAULT_GRID_COLOR,
      thickness,
      pattern: 'solid',
      transparency: 0
    };
  }

  function sanitizeGridStyle(style, fallbackThickness){
    const fallback = createDefaultGridStyle(fallbackThickness);
    if(gridControls && typeof gridControls.sanitizeStyle === 'function'){
      return gridControls.sanitizeStyle(style, fallback);
    }
    const source = style && typeof style === 'object' ? style : {};
    const color = typeof source.color === 'string' && source.color.trim() ? source.color : fallback.color;
    const thicknessRaw = Number(source.thickness);
    const thickness = Number.isFinite(thicknessRaw) && thicknessRaw >= 0 ? thicknessRaw : fallback.thickness;
    const patternRaw = String(source.pattern || fallback.pattern || 'solid').toLowerCase();
    const pattern = (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid') ? patternRaw : 'solid';
    const transparencyRaw = Number(source.transparency);
    const transparency = Number.isFinite(transparencyRaw) ? Math.max(0, Math.min(100, transparencyRaw)) : fallback.transparency;
    return { color, thickness, pattern, transparency };
  }

  function ensureGridStyle(fallbackThickness){
    state.gridStyle = sanitizeGridStyle(state.gridStyle, fallbackThickness);
    return state.gridStyle;
  }

  function getGridStyle(fallbackThickness){
    return sanitizeGridStyle(ensureGridStyle(fallbackThickness), fallbackThickness);
  }

  function setGridStyle(style, fallbackThickness){
    state.gridStyle = sanitizeGridStyle(style, fallbackThickness);
  }

  function activateSurfaceDataToolbar(reason){
    const now = Date.now();
    const tabId = String(surface.__boundTabId || Shared.workspaceTabs?.getActiveSessionInfo?.('surface')?.tabId || 'global');
    const lastActivation = Number(surfaceDataToolbarLastActivationByTabId.get(tabId)) || 0;
    if(now - lastActivation < 80){
      return false;
    }
    surfaceDataToolbarLastActivationByTabId.set(tabId, now);
    const activated = !!Shared.workspaceToolbar?.activateSection?.('surface', 'Data');
    if(activated){
      debugLog('Debug: surface data toolbar activated', { reason: reason || 'unknown' });
    }
    return activated;
  }

  function ensureSurfaceDataViewsForHot(hotInstance, options = {}){
    const ownerSession = getSurfaceSessionForHot(hotInstance, { reason: 'surface-dataviews-owner' }, { create: true })
      || getActiveSurfaceSessionForState();
    const ownerTabId = ownerSession?.tabId || getSurfaceHotOwnerTabId(hotInstance) || getSurfaceProjectionTabId() || null;
    const hostWrapper = options.wrapper || getSurfaceNodeById('surfaceHotWrapper');
    const hostContainer = options.container || hotInstance?.__surfaceHostContainer || getSurfaceNodeById('surfaceHot');
    const manager = Shared.componentLifecycle?.ensureOwnedDataViewsManager?.({
      hotInstance,
      componentKey: 'surface',
      managerField: '__surfaceDataViewsManager',
      ownerTabId,
      runtimeKey: SURFACE_RUNTIME_KEY,
      runtimeKeyField: '__surfaceRuntimeKey',
      hostContainerField: '__surfaceHostContainer',
      wrapper: hostWrapper,
      container: hostContainer,
      createOptions: {
        componentKey: 'surface',
        maxViews: SURFACE_DATA_VIEW_MAX,
        initialData: hotInstance?.getData?.() || [],
        onActiveViewChanged(view, meta){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData);
          if(view.exclusions){
            hotInstance.applyExclusions?.(view.exclusions);
          }
          if(view.filters){
            hotInstance.applyFilters?.(view.filters, { schedule: false });
          }
          const session = getSurfaceSessionForHot(hotInstance, { reason: 'surface-data-view-switch' }, { create: false })
            || ownerSession
            || getActiveSurfaceSessionForState();
          if(session){
            session.managers.hot = hotInstance;
            const currentManager = hotInstance.__surfaceDataViewsManager || null;
            session.managers.dataViews = surfaceDataViewsManagerBelongsToSession(currentManager, session) ? currentManager : session.managers.dataViews || null;
            session.state.drawPending = true;
            session.updatedAt = Date.now();
          }
          if(!isSurfaceSessionActiveOrActivating(session)){
            return;
          }
          updateAxisOptions();
          markSurfaceOverlayPending('data-view-switch');
          scheduleSurfaceDrawForSession(session, {
            reason: 'data-view-switch',
            userInitiated: String(meta?.reason || '').trim().toLowerCase() === 'tab-click'
          });
        },
        onInteraction(){
          if(isSurfaceSessionActiveOrActivating(getSurfaceSessionForHot(hotInstance, { reason: 'surface-dataview-interaction' }, { create: false }))){
            activateSurfaceDataToolbar('data-tab-interaction');
          }
        }
      },
      onCreated(){
        debugLog('Debug: surface data views manager created', {
          tabId: getSurfaceHotOwnerTabId(hotInstance) || null
        });
      }
    });
    if(!manager){
      return null;
    }
    const currentOwnerSession = getSurfaceSessionForHot(hotInstance, { reason: 'surface-dataviews-owner-refresh' }, { create: true })
      || ownerSession;
    if(currentOwnerSession){
      currentOwnerSession.managers.hot = hotInstance;
      currentOwnerSession.managers.dataViews = surfaceDataViewsManagerBelongsToSession(manager, currentOwnerSession) ? manager : currentOwnerSession.managers.dataViews || null;
      currentOwnerSession.updatedAt = Date.now();
    }
    if(isSurfaceSessionActiveOrActivating(currentOwnerSession)){
      syncSurfaceSessionManagersFromActive(currentOwnerSession);
    }
    return manager;
  }

  function syncSurfaceActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const ownerSession = getSurfaceSessionForHot(hot, { reason: 'surface-active-dataview-sync' }, { create: false, fallbackActive: false });
    if(ownerSession && !isSurfaceSessionActiveOrActivating(ownerSession)){
      debugLog('Debug: surface active DataView sync skipped for inactive HOT owner', {
        ownerTabId: ownerSession.tabId || null,
        activeTabId: getSurfaceProjectionTabId() || null,
        reason: reason || null
      });
      return;
    }
    Shared.componentLifecycle?.refreshOwnedDataViewsManagerFromHot?.({
      hotInstance: hot,
      componentKey: 'surface',
      managerField: '__surfaceDataViewsManager',
      session: ownerSession,
      belongsToSession: surfaceDataViewsManagerBelongsToSession,
      reason
    });
    syncSurfaceSessionManagersFromActive();
  }

  function applySurfaceTransformToNewView(transformSpec, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureSurfaceDataViewsForHot(hot, {
      wrapper: getSurfaceNodeById('surfaceHotWrapper'),
      container: hot.__surfaceHostContainer || getSurfaceNodeById('surfaceHot')
    });
    if(!manager || typeof manager.applyTransform !== 'function'){
      console.warn('surface data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    syncSurfaceActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyTransform(transformSpec, {
      title: options.title,
      reason: options.reason || 'toolbar-transform',
      transformOptions: Object.assign({}, SURFACE_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: surface transform failed', {
        message,
        transform: transformSpec?.type || null
      });
      return false;
    }
    activateSurfaceDataToolbar('transform-applied');
    debugLog('Debug: surface transform created view', {
      title: result?.view?.title || null,
      summary: result?.result?.summary || null
    });
    return true;
  }

  const SURFACE_TRANSFORM_OPTION_MAP = Object.freeze({
    cpm: { spec: { type: 'cpm', orientation: 'column' }, title: 'CPM' },
    log2p1: { spec: { type: 'log', base: 2, pseudoCount: 1 }, title: 'log2(x+1)' },
    centerRowsMean: { spec: { type: 'centerRows', method: 'mean' }, title: 'Center rows (mean)' },
    centerRowsMedian: { spec: { type: 'centerRows', method: 'median' }, title: 'Center rows (median)' },
    centerColsMean: { spec: { type: 'centerColumns', method: 'mean' }, title: 'Center cols (mean)' },
    centerColsMedian: { spec: { type: 'centerColumns', method: 'median' }, title: 'Center cols (median)' },
    normalizeRows: { spec: { type: 'normalizeRows' }, title: 'Normalize rows (z)' },
    normalizeCols: { spec: { type: 'normalizeColumns' }, title: 'Normalize cols (z)' }
  });

  function promptSurfaceCustomExpression(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const expression = String(toolbarApi?.getCustomTransformExpression?.('surface') || '').trim();
    if(expression){
      return expression;
    }
    toolbarApi?.openCustomTransformEditor?.('surface');
    if(typeof global.alert === 'function'){
      global.alert('Enter a custom transformation formula using x, then click "Apply custom".');
    }
    return null;
  }

  function resolveSurfaceToolbarTransformOption(optionKey, customExpression){
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
    const preset = SURFACE_TRANSFORM_OPTION_MAP[key];
    if(!preset){
      return null;
    }
    return {
      spec: Object.assign({}, preset.spec),
      title: preset.title
    };
  }

  function applySurfaceTransformPipelineToNewView(transformSpecs, options = {}){
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(!hot){
      return false;
    }
    const manager = ensureSurfaceDataViewsForHot(hot, {
      wrapper: getSurfaceNodeById('surfaceHotWrapper'),
      container: hot.__surfaceHostContainer || getSurfaceNodeById('surfaceHot')
    });
    if(!manager || typeof manager.applyPipeline !== 'function'){
      console.warn('surface data transform pipeline skipped: Shared.dataViews unavailable');
      return false;
    }
    const specs = Array.isArray(transformSpecs) ? transformSpecs.filter(Boolean) : [];
    if(!specs.length){
      return false;
    }
    syncSurfaceActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyPipeline(specs, {
      title: options.title,
      reason: options.reason || 'toolbar-transform-pipeline',
      transformOptions: Object.assign({}, SURFACE_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      debugLog('Debug: surface transform pipeline failed', {
        message,
        stepCount: specs.length
      });
      return false;
    }
    activateSurfaceDataToolbar('transform-pipeline-applied');
    debugLog('Debug: surface transform pipeline created view', {
      title: result?.view?.title || null,
      stepCount: Array.isArray(result?.result?.steps) ? result.result.steps.length : specs.length
    });
    return true;
  }

  function applySurfaceSelectedTransforms(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const selected = toolbarApi?.getSelectedTransforms?.('surface') || [];
    if(!Array.isArray(selected) || !selected.length){
      return false;
    }
    const resolved = [];
    for(let i = 0; i < selected.length; i += 1){
      const optionKey = selected[i];
      if(optionKey === 'custom'){
        const customExpression = promptSurfaceCustomExpression();
        if(!customExpression){
          return false;
        }
        const customTransform = resolveSurfaceToolbarTransformOption('custom', customExpression);
        if(customTransform){
          resolved.push(customTransform);
        }
        continue;
      }
      const next = resolveSurfaceToolbarTransformOption(optionKey);
      if(next){
        resolved.push(next);
      }
    }
    if(!resolved.length){
      return false;
    }
    const ok = resolved.length === 1
      ? applySurfaceTransformToNewView(resolved[0].spec, {
        title: resolved[0].title,
        reason: 'toolbar-transform-multi-single'
      })
      : applySurfaceTransformPipelineToNewView(
        resolved.map(item => item.spec),
        { reason: 'toolbar-transform-multi' }
      );
    if(ok){
      toolbarApi?.clearSelectedTransforms?.('surface');
    }
    return ok;
  }

  function bindSurfaceDataToolbar(){
    if(surfaceDataToolbarBound || !global.document){
      return;
    }
    global.document.addEventListener('click', event => {
      const button = event.target?.closest?.(
        '#surfaceTransformApplySelected, #surfaceTransformCustomApply, #surfaceTransformCpm, #surfaceTransformLog2p1, #surfaceTransformCenterRowsMean, #surfaceTransformCenterRowsMedian, #surfaceTransformCenterColsMean, #surfaceTransformCenterColsMedian, #surfaceTransformNormalizeRows, #surfaceTransformNormalizeCols, #surfaceTransformCustom'
      );
      if(!button){
        return;
      }
      const transformSection = button.closest?.('.workspace-toolbar__section[data-transform-section="1"]');
      if(button.id === 'surfaceTransformApplySelected'){
        applySurfaceSelectedTransforms();
        return;
      }
      if(button.id === 'surfaceTransformCustomApply'){
        const customExpression = promptSurfaceCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveSurfaceToolbarTransformOption('custom', customExpression);
        if(!customTransform){
          return;
        }
        if(transformSection?.dataset?.transformMultiMode === '1'){
          const selected = Shared.workspaceToolbar?.getSelectedTransforms?.('surface') || [];
          if(Array.isArray(selected) && selected.includes('custom')){
            applySurfaceSelectedTransforms();
          }else{
            applySurfaceTransformToNewView(customTransform.spec, { title: customTransform.title });
          }
          return;
        }
        applySurfaceTransformToNewView(customTransform.spec, { title: customTransform.title });
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
        const customExpression = promptSurfaceCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveSurfaceToolbarTransformOption(optionKey, customExpression);
        if(customTransform){
          applySurfaceTransformToNewView(customTransform.spec, { title: customTransform.title });
        }
        return;
      }
      const resolved = resolveSurfaceToolbarTransformOption(optionKey);
      if(resolved){
        applySurfaceTransformToNewView(resolved.spec, { title: resolved.title });
      }
    }, true);
    const wrapper = getSurfaceNodeById('surfaceHotWrapper');
    if(wrapper && !wrapper.__surfaceDataToolbarFocusBound){
      wrapper.addEventListener('mousedown', () => {
        activateSurfaceDataToolbar('table-mousedown');
      }, true);
      wrapper.__surfaceDataToolbarFocusBound = true;
    }
    surfaceDataToolbarBound = true;
  }

  function registerSurfaceGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getAxisStrokeWidthBase();
    const owner = getSurfaceCallbackOwner({ target, reason: 'surface-grid-control-register' });
    const runOwnerChange = (reason, callback) => runSurfaceOwnedCallback(owner, resolvedOwner => {
      const result = callback(resolvedOwner);
      captureSurfaceSessionStateFromActive(resolvedOwner.session || getActiveSurfaceSessionForState(), { reason });
      scheduleSurfaceDrawForSession(resolvedOwner.session || getActiveSurfaceSessionForState(), { reason });
      return result;
    }, { reason });
    gridControls.registerGraphElement(target, {
      scopeId: 'surface',
      getVisible: () => !!state.settings.showGrid,
      onVisibleChange: value => {
        runOwnerChange('surface-grid-visible-control', () => {
          state.settings.showGrid = !!value;
          if(state.controls.showGrid){
            state.controls.showGrid.checked = !!value;
          }
        });
      },
      getStyle: () => getGridStyle(fallbackThickness),
      onStyleChange: style => {
        runOwnerChange('surface-grid-style-control', () => {
          setGridStyle(style, fallbackThickness);
        });
      },
      defaults: createDefaultGridStyle(fallbackThickness)
    });
  }

  function attachListener(node, type, handler, options){
    if(!node || typeof node.addEventListener !== 'function'){ return; }
    node.addEventListener(type, handler, options);
    try{ state._listeners.push({ node, type, handler, options }); }catch(e){ /* ignore */ }
  }

  function bindSurfaceControlHandler(node, eventName, key, handler, options){
    if(!node || typeof node.addEventListener !== 'function'){
      return;
    }
    const registryKey = `${eventName}:${key || 'control'}`;
    if(!node.__surfaceControlHandlers){
      Object.defineProperty(node, '__surfaceControlHandlers', {
        value: Object.create(null),
        configurable: true
      });
    }
    const previous = node.__surfaceControlHandlers[registryKey];
    if(previous){
      node.removeEventListener(eventName, previous, options);
      if(Array.isArray(state._listeners)){
        state._listeners = state._listeners.filter(rec => !(rec && rec.node === node && rec.type === eventName && rec.handler === previous));
      }
    }
    const wrapped = event => runSurfaceEventOwnerCallback(event, key || registryKey, owner => handler(event, owner));
    node.__surfaceControlHandlers[registryKey] = wrapped;
    attachListener(node, eventName, wrapped, options);
  }
  const SURFACE_OVERLAY_TIMEOUT_MS = 30000;
  let _surfaceOverlayTimeout = null;

  const surfaceOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'surface',
    message: 'Rendering surface plot...',
    isHeavy: Shared.loadingOverlay?.createTableHeavyPredicate?.({
      getHot: () => state.hot,
      startRow: 1,
      startCol: 1,
      rowThreshold: 500,
      cellThreshold: 5000
    }),
    getTabId: () => getSurfaceProjectionTabId() || null,
    getHost: () => (
      state.svgBox
      || state.layout?.elements?.svgBox
      || querySurfaceRoot('#surfaceGraphPanel .svgbox')
      || getSurfaceNodeById('surfaceGraphPanel')
    )
  });

  function markSurfaceOverlayPending(reason, options = {}){
    const session = resolveSurfaceOverlaySession(options);
    surfaceOverlayController?.markPending(reason);
    debugLog('Debug: surface overlay pending flagged', { reason: reason || 'data-change' });
    try{
      clearSurfaceOverlayTimeoutForSession(session);
      const timeoutTabId = session?.tabId || getSurfaceProjectionTabId() || null;
      const timeoutHandle = Shared.componentLifecycle?.scheduleComponentTimeout?.(surface, 'surface', {
        tabId: timeoutTabId,
        reason: reason || 'surface-overlay-timeout'
      }, () => {
        try{
          const timedOutSession = timeoutTabId
            ? getSurfaceSession(timeoutTabId, { tabId: timeoutTabId, reason: 'surface-overlay-timeout' }, { create: false })
            : session;
          setSurfaceOverlayTimeoutForSession(timedOutSession, null);
          if(!timedOutSession || isSurfaceSessionActiveOrActivating(timedOutSession)){
            surfaceOverlayController?.resolve('timeout');
          }
        }catch(e){}
        debugLog('Debug: surface overlay auto-resolved due to timeout', { reason, tabId: timeoutTabId });
      }, SURFACE_OVERLAY_TIMEOUT_MS);
      setSurfaceOverlayTimeoutForSession(session, timeoutHandle || null);
    }catch(e){ /* ignore */ }
  }

  function queueSurfaceOverlay(reason, options = {}){
    return surfaceOverlayController?.queue(reason, options) || false;
  }

  function resolveSurfaceOverlay(reason, options = {}){
    const opts = options && typeof options === 'object' ? options : {};
    const session = resolveSurfaceOverlaySession(opts);
    if(opts.allowInactive === true || !session || isSurfaceSessionActiveOrActivating(session)){
      surfaceOverlayController?.resolve(reason);
    }
    try{ clearSurfaceOverlayTimeoutForSession(session); }catch(e){}
  }

  function forceSurfaceOverlay(reason, options = {}){
    return surfaceOverlayController?.force(reason, options) || false;
  }
  let surfaceAutoDrawManager = null;
  let surfaceNoticeBoundWidth = null;
  const syncSurfaceAutoDrawNoticeWidth = (reason) => {
    const svgBox = state.svgBox || state.layout?.elements?.svgBox || querySurfaceRoot('#surfaceGraphPanel .svgbox');
    const renderRow = state.renderRow || getSurfaceNodeById('surfaceRenderRow');
    if(!svgBox || !renderRow){
      return;
    }
    const rect = svgBox.getBoundingClientRect?.();
    const width = Math.round(rect?.width || svgBox.clientWidth || svgBox.offsetWidth || 0);
    if(!width){
      return;
    }
    const widthPx = `${width}px`;
    if(renderRow.style.maxWidth !== widthPx){
      renderRow.style.maxWidth = widthPx;
      renderRow.style.width = '100%';
    }
    if(state.autoDrawNotice && state.autoDrawNotice.style.maxWidth !== widthPx){
      state.autoDrawNotice.style.maxWidth = widthPx;
    }
    if(surfaceNoticeBoundWidth !== width){
      surfaceNoticeBoundWidth = width;
      debugLog('Debug: surface auto draw notice width synced', { width, reason: reason || null });
    }
  };
  const scheduleSurfaceNoticeWidth = (() => {
    let lastReason = 'frame';
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(surface, 'surface', () => syncSurfaceAutoDrawNoticeWidth(lastReason), { reason: 'surface-notice-width' })
      : null;
    return reason => {
      lastReason = reason || 'frame';
      if(debounced){
        debounced({ tabId: getSurfaceProjectionTabId() || null, reason: 'surface-notice-width' });
        return;
      }
      syncSurfaceAutoDrawNoticeWidth(lastReason);
    };
  })();
  let scheduleDrawSurfaceRaw = () => {};
  const surfaceUndoManager = Shared.undoManager || null;
  function recordSurfaceChange(label, previous, next, apply){
    if(!surfaceUndoManager || typeof surfaceUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    const recorder = Shared.styleUndo?.recordStateChange || (opts => surfaceUndoManager.recordStateChange(opts));
    recorder({
      manager: surfaceUndoManager,
      label,
      scope: 'surfaceGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }

  const makeEditableHelper = (node, onChange, options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if(typeof fn === 'function'){
      return fn(node, onChange, options);
    }
    console.warn('surface component makeEditable fallback missing');
    return undefined;
  };

  const markFontEditable = (node, role, key) => {
    if(!node){ return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if(fontControls && typeof fontControls.markText === 'function'){
      fontControls.markText(node, { scopeId: 'surface', role, key });
    }
    if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'surface';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    debugLog('Debug: surface markFontEditable', payload);
  };

  const applySavedFontStyle = node => {
    if(!node || !fontControls || typeof fontControls.applySavedStyle !== 'function'){
      return false;
    }
    return fontControls.applySavedStyle(node);
  };

  function markSurfaceLegendTextLabel(node, labelSpec){
    if(!node){ return; }
    const key = labelSpec?.key || null;
    markFontEditable(node, SURFACE_LEGEND_TEXT_ROLE, key);
    // Legend scale labels are generated numeric ticks, not user-authored text.
    // Keep them registered with fontControls so Graph-scope font styles apply,
    // but do not let a selection-specific legend override shadow future
    // Graph-wide font changes. This matches the heatmap color-scale pattern.
    if(node.dataset){
      node.dataset.fontEditable = '0';
      node.dataset.surfaceLegendLabel = labelSpec?.id || 'scale';
    }
    applySavedFontStyle(node);
  }

  function appendSurfaceLegendTextLabel(parent, labelSpec, context){
    const doc = parent?.ownerDocument || global.document;
    if(!doc || !parent || !labelSpec || !context){ return null; }
    const text = doc.createElementNS(NS, 'text');
    const y = labelSpec.anchor === 'min'
      ? context.barHeight + context.labelOffset
      : -context.topLabelGap;
    text.setAttribute('x', String(context.barWidth / 2));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(context.fontSize));
    text.setAttribute('fill', context.textColor);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('data-legend-key', 'surface-scale');
    if(labelSpec.anchor !== 'min'){
      text.setAttribute('dominant-baseline', 'baseline');
    }
    text.textContent = context.formatValue(labelSpec.anchor);
    parent.appendChild(text);
    markSurfaceLegendTextLabel(text, labelSpec);
    return text;
  }

  function appendSurfaceLegendTextLabels(parent, context){
    const labels = [];
    SURFACE_LEGEND_LABELS.forEach(labelSpec => {
      const node = appendSurfaceLegendTextLabel(parent, labelSpec, context);
      if(node){ labels.push(node); }
    });
    return labels;
  }

  function debugLog(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
      return;
    }
    if(typeof console !== 'undefined' && typeof console.debug === 'function'){
      console.debug(message, payload || {});
    }
  }

  function hexToRgb(hex){
    if(typeof hex !== 'string'){ return { r: 0, g: 0, b: 0 }; }
    const normalized = hex.replace('#', '');
    if(normalized.length === 3){
      const r = parseInt(normalized[0] + normalized[0], 16);
      const g = parseInt(normalized[1] + normalized[1], 16);
      const b = parseInt(normalized[2] + normalized[2], 16);
      return { r, g, b };
    }
    const parsed = parseInt(normalized, 16);
    if(Number.isNaN(parsed)){
      return { r: 0, g: 0, b: 0 };
    }
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    };
  }

  function mixColor(a, b, t){
    const ratio = Math.min(1, Math.max(0, t));
    return {
      r: Math.round(a.r + (b.r - a.r) * ratio),
      g: Math.round(a.g + (b.g - a.g) * ratio),
      b: Math.round(a.b + (b.b - a.b) * ratio)
    };
  }

  function colorScaleFactory(min, max, rampKey){
    // Memoize factories per range + ramp to avoid recomputing stops for many points
    const cacheKey = `${min}|${max}|${String(rampKey)}`;
    if(!colorScaleFactory._cache){ colorScaleFactory._cache = new Map(); }
    if(colorScaleFactory._cache.has(cacheKey)){
      return colorScaleFactory._cache.get(cacheKey);
    }
    const ramp = COLOR_RAMPS[rampKey] || COLOR_RAMPS.viridis;
    const stops = Array.isArray(ramp.stops) && ramp.stops.length ? ramp.stops : COLOR_RAMPS.viridis.stops;
    const rgbStops = stops.map(hex => hexToRgb(hex));
    const span = max - min;
    const fn = (value) => {
      if(!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || span === 0){
        const mid = rgbStops[Math.floor(rgbStops.length / 2)] || { r: 128, g: 128, b: 128 };
        return `rgb(${mid.r},${mid.g},${mid.b})`;
      }
      const normalized = (value - min) / span;
      const scaled = Math.min(rgbStops.length - 1, Math.max(0, normalized * (rgbStops.length - 1)));
      const idx = Math.floor(scaled);
      const frac = scaled - idx;
      const a = rgbStops[idx] || rgbStops[0];
      const b = rgbStops[Math.min(idx + 1, rgbStops.length - 1)] || rgbStops[rgbStops.length - 1];
      const mixed = mixColor(a, b, frac);
      return `rgb(${mixed.r},${mixed.g},${mixed.b})`;
    };
    colorScaleFactory._cache.set(cacheKey, fn);
    return fn;
  }

  function niceNum(range, round){
    if(range === 0){ return 0; }
    const exponent = Math.floor(Math.log10(Math.abs(range)));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction;
    if(round){
      if(fraction < 1.5){ niceFraction = 1; }
      else if(fraction < 3){ niceFraction = 2; }
      else if(fraction < 7){ niceFraction = 5; }
      else { niceFraction = 10; }
    } else {
      if(fraction <= 1){ niceFraction = 1; }
      else if(fraction <= 2){ niceFraction = 2; }
      else if(fraction <= 5){ niceFraction = 5; }
      else { niceFraction = 10; }
    }
    return niceFraction * Math.pow(10, exponent);
  }

  function niceScale(min, max, maxTicks){
    if(!Number.isFinite(min) || !Number.isFinite(max) || min === max){
      const base = Number.isFinite(min) ? Math.abs(min) : 1;
      const pad = Math.max(base * 0.5, 1);
      return {
        min: min - pad,
        max: max + pad,
        step: pad,
        ticks: [min - pad, min, max + pad]
      };
    }
    const range = niceNum(max - min, false);
    const step = niceNum(range / Math.max(maxTicks - 1, 1), true);
    const graphMin = Math.floor(min / step) * step;
    const graphMax = Math.ceil(max / step) * step;
    const ticks = [];
    for(let tick = graphMin; tick <= graphMax + step * 0.5; tick += step){
      ticks.push(Number(tick.toFixed(6)));
    }
    return { min: graphMin, max: graphMax, step, ticks };
  }

  function formatNumber(value){
    if(!Number.isFinite(value)){
      return 'n/a';
    }
    return chartStyle.formatScientific(value, { maxDecimals: 2 });
  }

  function cacheDom(session = null){
    const owner = ensureSurfaceSessionOwnershipShape(session || projectedSurfaceSession || getActiveSurfaceSessionForState());
    const tabId = owner?.tabId || getSurfaceProjectionTabId() || null;
    state.svg = getSurfaceNodeById('surfaceSvg', tabId) || owner?.refs?.svg || state.svg;
    state.svgBox = querySurfaceRoot('#surfaceGraphPanel .svgbox', tabId) || owner?.refs?.svgBox || state.layout?.elements?.svgBox || state.svgBox;
    state.statsEl = getSurfaceNodeById('surfaceStatsSummary', tabId) || owner?.refs?.statsEl || state.statsEl;
    state.messageEl = getSurfaceNodeById('surfaceMessage', tabId) || owner?.refs?.messageEl || state.messageEl;
    state.exportContainer = getSurfaceNodeById('surfaceExportControls', tabId) || owner?.refs?.exportContainer || state.exportContainer;
    state.renderRow = getSurfaceNodeById('surfaceRenderRow', tabId) || owner?.refs?.renderRow || state.renderRow;
    state.renderButton = getSurfaceNodeById('surfaceRenderButton', tabId) || owner?.refs?.renderButton || state.renderButton;
    state.autoDrawNotice = getSurfaceNodeById('surfaceAutoDrawNotice', tabId) || owner?.refs?.autoDrawNotice || state.autoDrawNotice;
    state.axisSelects.x = getSurfaceNodeById('surfaceXAxis', tabId) || owner?.refs?.xAxis || state.axisSelects.x;
    state.axisSelects.y = getSurfaceNodeById('surfaceYAxis', tabId) || owner?.refs?.yAxis || state.axisSelects.y;
    state.axisSelects.z = getSurfaceNodeById('surfaceZAxis', tabId) || owner?.refs?.zAxis || state.axisSelects.z;
    state.controls.interpolation = getSurfaceNodeById('surfaceInterpolation', tabId) || owner?.refs?.interpolation || state.controls.interpolation;
    state.controls.fontSize = getSurfaceNodeById('surfaceFontSize', tabId) || owner?.refs?.fontSize || state.controls.fontSize;
    state.controls.fontSizeVal = getSurfaceNodeById('surfaceFontSizeVal', tabId) || owner?.refs?.fontSizeVal || state.controls.fontSizeVal;
    state.controls.axisStroke = getSurfaceNodeById('surfaceAxisStroke', tabId) || owner?.refs?.axisStroke || state.controls.axisStroke;
    state.controls.axisStrokeVal = getSurfaceNodeById('surfaceAxisStrokeVal', tabId) || owner?.refs?.axisStrokeVal || state.controls.axisStrokeVal;
    state.controls.axisColor = getSurfaceNodeById('surfaceAxisColor', tabId) || owner?.refs?.axisColor || state.controls.axisColor;
    state.controls.showGrid = getSurfaceNodeById('surfaceShowGrid', tabId) || owner?.refs?.showGrid || state.controls.showGrid;
    state.controls.showFrame = getSurfaceNodeById('surfaceShowFrame', tabId) || owner?.refs?.showFrame || state.controls.showFrame;
    state.controls.showPoints = getSurfaceNodeById('surfaceShowPoints', tabId) || owner?.refs?.showPoints || state.controls.showPoints;
    state.controls.loadExample = getSurfaceNodeById('surfaceLoadExample', tabId) || owner?.refs?.loadExample || state.controls.loadExample;
    state.controls.importBtn = getSurfaceNodeById('surfaceImport', tabId) || owner?.refs?.importButton || state.controls.importBtn;
    state.controls.importFile = getSurfaceNodeById('surfaceFile', tabId) || owner?.refs?.fileInput || state.controls.importFile;
    state.controls.graphFileInput = getSurfaceNodeById('surfaceGraphFile', tabId) || owner?.refs?.graphFileInput || state.controls.graphFileInput;
    syncSurfaceAspectControls('cache-dom');
    if(owner){
      syncSurfaceSessionRefsFromActive(owner);
    }
  }

  function updateAxisOptions(){
    const hot = state.hot;
    if(!hot){ return; }
    const columns = typeof hot.countCols === 'function' ? hot.countCols() : (hot.getData?.()[0]?.length || DEFAULT_COLS);
    const headers = [];
    const data = typeof hot.getData === 'function' ? hot.getData() : [];
    const headerRow = Array.isArray(data?.[0]) ? data[0] : [];
    for(let col = 0; col < columns; col += 1){
      const value = headerRow[col];
      const normalized = value != null ? String(value).trim() : '';
      headers.push(normalized || `Column ${col + 1}`);
    }
    ['x', 'y', 'z'].forEach((axis, idx) => {
      const select = state.axisSelects[axis];
      if(!select){ return; }
      const previous = state.axisMap[axis];
      while(select.firstChild){ select.removeChild(select.firstChild); }
      headers.forEach((label, colIndex) => {
        const option = global.document.createElement('option');
        option.value = String(colIndex);
        option.textContent = label;
        if(previous === colIndex || (previous === undefined && colIndex === idx)){
          option.selected = true;
          state.axisMap[axis] = colIndex;
        }
        select.appendChild(option);
      });
      if(headers.length === 0){
        state.axisMap[axis] = 0;
      } else if(state.axisMap[axis] >= headers.length){
        state.axisMap[axis] = headers.length - 1;
        select.value = String(state.axisMap[axis]);
      }
    });
    updateAxisLabelsFromHeaders();
    debugLog('Debug: surface axis options refreshed', {
      columns,
      axisMap: Object.assign({}, state.axisMap)
    });
  }

  function getHeaderLabelForColumn(colIndex){
    if(!state.hot || typeof colIndex !== 'number' || colIndex < 0){
      return '';
    }
    const data = typeof state.hot.getData === 'function' ? state.hot.getData() : [];
    const headerRow = Array.isArray(data?.[0]) ? data[0] : [];
    const value = headerRow[colIndex];
    return value != null ? String(value).trim() : '';
  }

  function updateAxisLabelsFromHeaders(){
    const selected = getSelectedColumns();
    ['x', 'y', 'z'].forEach(axis => {
      const header = getHeaderLabelForColumn(selected[axis]);
      state.labels[axis] = header || DEFAULT_AXIS_LABELS[axis];
    });
  }

  function ensureHeaderRowFromConfig(config){
    if(!state.hot || typeof state.hot.getData !== 'function'){
      return;
    }
    const data = state.hot.getData();
    if(!Array.isArray(data) || !data.length){
      return;
    }
    const isHeaderTextual = (row) => Array.isArray(row) && row.some(cell => {
      if(cell == null || cell === ''){ return false; }
      const str = String(cell).trim();
      if(!str){ return false; }
      const numeric = Number(str);
      return Number.isNaN(numeric);
    });
    let headerRow = Array.isArray(data[0]) ? data[0] : [];
    if(!isHeaderTextual(headerRow)){
      if(typeof state.hot.alter === 'function'){
        state.hot.alter('insert_row_above', 0, 1, 'surface-header-migrate');
      }
      const refreshed = state.hot.getData();
      headerRow = Array.isArray(refreshed?.[0]) ? refreshed[0] : [];
    }
    const labelConfig = config?.labels || {};
    const axisMap = Object.assign({}, state.axisMap);
    ['x', 'y', 'z'].forEach(axis => {
      const idx = Number(axisMap[axis]);
      if(!Number.isInteger(idx) || idx < 0){ return; }
      const desiredRaw = labelConfig[axis];
      const desired = desiredRaw != null && String(desiredRaw).trim()
        ? String(desiredRaw).trim()
        : DEFAULT_AXIS_LABELS[axis];
      const current = getHeaderLabelForColumn(idx);
      if(current !== desired && typeof state.hot.setDataAtCell === 'function'){
        state.hot.setDataAtCell(0, idx, desired, 'surface-header-sync');
      }
    });
  }

  function getSelectedColumns(){
    const maxCol = state.hot && typeof state.hot.countCols === 'function' ? state.hot.countCols() - 1 : DEFAULT_COLS - 1;
    const resolveIndex = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
      x: Math.min(Math.max(0, resolveIndex(state.axisMap.x, 0)), maxCol),
      y: Math.min(Math.max(0, resolveIndex(state.axisMap.y, 1)), maxCol),
      z: Math.min(Math.max(0, resolveIndex(state.axisMap.z, 2)), maxCol)
    };
  }

  function initHot(){
    if(state.hot){ return state.hot; }
    const baseData = typeof Shared.createEmptyData === 'function'
      ? Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS)
      : null;
    if(baseData && baseData[0]){
      baseData[0][0] = DEFAULT_AXIS_LABELS.x;
      baseData[0][1] = DEFAULT_AXIS_LABELS.y;
      baseData[0][2] = DEFAULT_AXIS_LABELS.z;
    }
    const overrides = {
      data: baseData,
      pinFirstRow: true,
      columns: [
        { type: 'numeric', numericFormat: { pattern: '0[.]0000' } },
        { type: 'numeric', numericFormat: { pattern: '0[.]0000' } },
        { type: 'numeric', numericFormat: { pattern: '0[.]0000' } }
      ],
      minRows: DEFAULT_ROWS,
      minCols: DEFAULT_COLS,
      maxCols: 6,
      afterChange: (changes, source) => {
        if(source === 'loadData'){ return; }
        const ownerSession = getSurfaceSessionForHot(state.hot, { reason: 'surface-table-change' }, { create: false });
        if(ownerSession && !isSurfaceSessionActiveOrActivating(ownerSession)){
          ownerSession.state.drawPending = true;
          ownerSession.updatedAt = Date.now();
          return;
        }
        updateAxisOptions();
        if(Array.isArray(changes) && changes.length){
          syncSurfaceActiveDataViewFromHot(state.hot, 'afterChange');
        }
        scheduleSurfaceDrawForHot(state.hot, { reason: 'surface-table-change' });
      },
      afterLoadData: () => {
        const ownerSession = getSurfaceSessionForHot(state.hot, { reason: 'surface-table-load' }, { create: false });
        if(ownerSession && !isSurfaceSessionActiveOrActivating(ownerSession)){
          ownerSession.state.drawPending = true;
          ownerSession.updatedAt = Date.now();
          return;
        }
        updateAxisOptions();
        syncSurfaceActiveDataViewFromHot(state.hot, 'afterLoadData');
        scheduleSurfaceDrawForHot(state.hot, { reason: 'surface-table-load' });
      },
      afterSelectionEnd: () => {
        activateSurfaceDataToolbar('table-selection');
      }
    };
    const createSurfaceTable = (container) => {
      if(typeof hotNS.createStandardTable !== 'function'){
        return null;
      }
      let instance = null;
      instance = hotNS.createStandardTable(container, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, meta => {
        scheduleSurfaceDrawForHot(instance, {
          ...(meta && typeof meta === 'object' ? meta : {}),
          reason: meta?.reason || meta?.source || 'surface-table-schedule'
        });
      }, overrides);
      if(instance){
        instance.__surfaceHostContainer = container || null;
      }
      return instance;
    };
    const ensureSurfaceHotForActiveTab = () => {
      const wrapper = getSurfaceNodeById('surfaceHotWrapper');
      const baseContainer = getSurfaceNodeById('surfaceHot');
      const activeTabId = Shared.hot?.resolveTableTabId?.({
        type: 'surface',
        component: surface,
        wrapper,
        container: baseContainer,
        reason: 'surface-ensure-hot'
      }) || null;
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createSurfaceTable(baseContainer);
        }
        if(state.hot){
          state.hot.__surfaceHostContainer = baseContainer;
          state.hot.__surfaceTabId = activeTabId;
          ensureSurfaceDataViewsForHot(state.hot, {
            wrapper,
            container: baseContainer
          });
          syncSurfaceActiveDataViewFromHot(state.hot, 'ensure-active-tab');
        }
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'surface',
        tabId: activeTabId || null,
        wrapper,
        container: baseContainer,
        createInstance: createSurfaceTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
      }
      if(state.hot){
        state.hot.__surfaceHostContainer = entry?.container || baseContainer;
        state.hot.__surfaceTabId = entry?.tabId || activeTabId;
        ensureSurfaceDataViewsForHot(state.hot, {
          wrapper,
          container: entry?.container || baseContainer
        });
        syncSurfaceActiveDataViewFromHot(state.hot, 'ensure-active-tab');
      }
      return state.hot;
    };
    state.hot = ensureSurfaceHotForActiveTab();
    state.ensureHotForActiveTab = ensureSurfaceHotForActiveTab;
    bindSurfaceDataToolbar();
    if(state.hot && typeof state.hot.addHook === 'function'){
      state.hot.addHook('afterCreateCol', updateAxisOptions);
      state._hotHooks.push({ name: 'afterCreateCol', fn: updateAxisOptions });
      state.hot.addHook('afterRemoveCol', updateAxisOptions);
      state._hotHooks.push({ name: 'afterRemoveCol', fn: updateAxisOptions });
      state.hot.addHook('afterColumnMove', updateAxisOptions);
      state._hotHooks.push({ name: 'afterColumnMove', fn: updateAxisOptions });
    }
    syncSurfaceSessionManagersFromActive();
    debugLog('Debug: surface grid initialized', { hasHot: !!state.hot });
    return state.hot;
  }

  function parseSurfaceTable(){
    const hot = state.hot;
    if(!hot){
      return { points: [], faces: [], ranges: null, stats: { skipped: 0 } };
    }
    const data = typeof hot.getIncludedDataMatrix === 'function'
      ? hot.getIncludedDataMatrix()
      : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(hot) : []);
    if(!Array.isArray(data) || !data.length){
      return { points: [], faces: [], ranges: null, stats: { skipped: 0 } };
    }
    // Safety: avoid parsing extremely large tables synchronously
    if(data.length > SURFACE_MAX_PARSE_ROWS){
      const stats = { vertexCount: 0, faceCount: 0, gridColumns: 0, gridRows: 0, gridCells: 0, gridExpected: 0, gridComplete: false, skipped: data.length, zMin: NaN, zMax: NaN, tooLarge: true };
      debugLog('Debug: surface parse aborted - table too large', { rows: data.length, threshold: SURFACE_MAX_PARSE_ROWS });
      return { points: [], faces: [], ranges: null, stats };
    }
    const cols = getSelectedColumns();
    const xValues = new Set();
    const yValues = new Set();
    const pointMap = new Map();
    const points = [];
    let skipped = 0;
    let zMin = Infinity;
    let zMax = -Infinity;
    const headerRow = Array.isArray(data[0]) ? data[0] : [];
    const headerLooksText = headerRow.some(cell => {
      if(cell == null || cell === ''){ return false; }
      const str = String(cell).trim();
      if(!str){ return false; }
      const num = Number(str);
      return Number.isNaN(num);
    });
    const startRow = headerLooksText ? 1 : 0;
    for(let rowIndex = startRow; rowIndex < data.length; rowIndex += 1){
      const row = data[rowIndex];
      if(!row){ continue; }
      // Treat empty/whitespace cells as missing (skip) instead of coercing to 0
      const rawX = row[cols.x];
      const rawY = row[cols.y];
      const rawZ = row[cols.z];
      const sx = rawX == null ? '' : String(rawX).trim();
      const sy = rawY == null ? '' : String(rawY).trim();
      const sz = rawZ == null ? '' : String(rawZ).trim();
      if(sx === '' || sy === '' || sz === ''){
        skipped += 1;
        continue;
      }
      const x = Number(sx);
      const y = Number(sy);
      const z = Number(sz);
      if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)){
        skipped += 1;
        continue;
      }
      // Protect against extremely large point counts
      if(points.length >= SURFACE_MAX_PARSE_POINTS){
        skipped += 1;
        continue;
      }
      const key = `${x}|${y}`;
      if(pointMap.has(key)){
        pointMap.get(key).z = z;
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
        continue;
      }
      const point = { x, y, z };
      pointMap.set(key, point);
      points.push(point);
      xValues.add(x);
      yValues.add(y);
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
    const xArray = Array.from(xValues).sort((a, b) => a - b);
    const yArray = Array.from(yValues).sort((a, b) => a - b);
    const xIndex = new Map();
    const yIndex = new Map();
    xArray.forEach((value, idx) => xIndex.set(value, idx));
    yArray.forEach((value, idx) => yIndex.set(value, idx));
    const matrix = new Array(yArray.length);
    for(let yi = 0; yi < yArray.length; yi += 1){
      matrix[yi] = new Array(xArray.length).fill(null);
    }
    pointMap.forEach(point => {
      const xi = xIndex.get(point.x);
      const yi = yIndex.get(point.y);
      if(xi === undefined || yi === undefined){ return; }
      matrix[yi][xi] = point;
    });
    const faces = [];
    if(xArray.length >= 2 && yArray.length >= 2){
      for(let yi = 0; yi < yArray.length - 1; yi += 1){
        for(let xi = 0; xi < xArray.length - 1; xi += 1){
          const v00 = matrix[yi][xi];
          const v10 = matrix[yi][xi + 1];
          const v01 = matrix[yi + 1][xi];
          const v11 = matrix[yi + 1][xi + 1];
          if(!v00 || !v10 || !v01 || !v11){
            continue;
          }
          faces.push({ vertices: [v00, v10, v01], value: (v00.z + v10.z + v01.z) / 3 });
          faces.push({ vertices: [v11, v01, v10], value: (v11.z + v01.z + v10.z) / 3 });
        }
      }
    }
    const ranges = {
      x: { min: xArray.length ? xArray[0] : 0, max: xArray.length ? xArray[xArray.length - 1] : 0 },
      y: { min: yArray.length ? yArray[0] : 0, max: yArray.length ? yArray[yArray.length - 1] : 0 },
      z: { min: zMin, max: zMax }
    };
    const expectedCells = Math.max(0, (xArray.length - 1) * (yArray.length - 1));
    const actualCells = Math.max(0, Math.round(faces.length / 2));
    const stats = {
      vertexCount: points.length,
      faceCount: faces.length,
      gridColumns: xArray.length,
      gridRows: yArray.length,
      gridCells: actualCells,
      gridExpected: expectedCells,
      gridComplete: actualCells > 0 && actualCells === expectedCells,
      skipped,
      zMin,
      zMax
    };
    for(let yi = 0; yi < matrix.length; yi += 1){
      matrix[yi] = null;
    }
    debugLog('Debug: surface parsed data', stats);
    return { points, faces, xArray, yArray, ranges, stats };
  }

  function displayMessage(text){
    if(!state.messageEl){ return; }
    if(text){
      state.messageEl.textContent = text;
      state.messageEl.hidden = false;
    } else {
      state.messageEl.textContent = '';
      state.messageEl.hidden = true;
    }
  }

  function renderSurfaceEmptyPlotNotice(message){
    if(!state.messageEl){
      return;
    }
    const noticeMessage = (Shared.getEmptyPlotNoticeMessage
      ? Shared.getEmptyPlotNoticeMessage(message)
      : (String(message || '').trim() || 'Add data to the input table to generate a plot.'));
    state.messageEl.hidden = false;
    if(typeof Shared.renderPlotNotice === 'function'){
      Shared.renderPlotNotice(state.messageEl, noticeMessage, { resetAspect: false, show: true });
    }else{
      while(state.messageEl.firstChild){
        state.messageEl.removeChild(state.messageEl.firstChild);
      }
      const notice = (state.messageEl.ownerDocument || global.document).createElement('i');
      notice.textContent = noticeMessage;
      state.messageEl.appendChild(notice);
    }
  }

  function updateStats(info){
    state.lastStats = (info && typeof info === 'object')
      ? (cloneSimple(info) || info)
      : null;
    const container = state.statsEl;
    if(!container){ return; }
    while(container.firstChild){ container.removeChild(container.firstChild); }
    const entries = [];
    if(info && info.vertexCount){
      entries.push({ label: 'Vertices', value: String(info.vertexCount) });
    }
    if(info && info.faceCount){
      entries.push({ label: 'Faces', value: String(info.faceCount) });
    }
    if(info && Number.isFinite(info.zMin) && Number.isFinite(info.zMax)){
      entries.push({ label: 'Z range', value: `${formatNumber(info.zMin)} – ${formatNumber(info.zMax)}` });
    }
    if(info && info.gridColumns && info.gridRows){
      const status = info.gridExpected ? (info.gridComplete ? 'complete' : 'partial') : 'insufficient';
      entries.push({ label: 'Grid', value: `${info.gridColumns} × ${info.gridRows} (${status})` });
    }
    if(info && info.skipped){
      entries.push({ label: 'Skipped rows', value: String(info.skipped) });
    }
    if(!entries.length){
      entries.push({ label: 'Status', value: 'Enter numeric X, Y, Z columns to generate the surface.' });
    }
    entries.forEach(entry => {
      const row = global.document.createElement('span');
      const label = global.document.createElement('strong');
      label.textContent = `${entry.label}:`;
      const value = global.document.createElement('span');
      value.textContent = entry.value;
      row.appendChild(label);
      row.appendChild(value);
      container.appendChild(row);
    });
    if(info && Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel === 'function'){
      Shared.statsReporting.appendReportPanel(container, {
        methodsText: `Surface summary statistics were generated from parsed numeric X/Y/Z data after excluding rows with missing or non-numeric coordinates. ${info.gridExpected ? `Input points were interpreted as a ${info.gridColumns || 0} × ${info.gridRows || 0} grid${info.gridComplete ? '' : ' with incomplete grid coverage'}.` : 'Input points were treated as an unstructured point cloud.'} Reported ranges and mesh counts describe the rendered surface geometry, not the raw table before filtering.`,
        resultsText: [
          Number.isFinite(info.vertexCount) ? `Vertices = ${info.vertexCount}.` : null,
          Number.isFinite(info.faceCount) ? `Faces = ${info.faceCount}.` : null,
          Number.isFinite(info.zMin) && Number.isFinite(info.zMax) ? `Z range = ${formatNumber(info.zMin)} to ${formatNumber(info.zMax)}.` : null
        ].filter(Boolean).join(' '),
        analysisSpec: {
          component: 'surface',
          vertexCount: Number.isFinite(info.vertexCount) ? info.vertexCount : 0,
          faceCount: Number.isFinite(info.faceCount) ? info.faceCount : 0,
          zMin: Number.isFinite(info.zMin) ? info.zMin : null,
          zMax: Number.isFinite(info.zMax) ? info.zMax : null,
          gridColumns: info.gridColumns || 0,
          gridRows: info.gridRows || 0,
          gridComplete: !!info.gridComplete,
          skipped: info.skipped || 0
        }
      }, { title: 'Reporting and reproducibility' });
    }
    captureSurfaceStatsPanelModel();
    const session = getActiveSurfaceSessionForState();
    if(session){
      session.state.lastStats = cloneSimple(state.lastStats) || null;
      session.results.lastStats = cloneSimple(state.lastStats) || null;
      session.results.statsPanelModel = normalizeSurfaceStatsPanelModel(state.statsPanelModel || {});
      session.state.statsPanelModel = normalizeSurfaceStatsPanelModel(state.statsPanelModel || {});
      session.updatedAt = Date.now();
    }
  }

  function normalizeSurfaceStatsPanelModel(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    return Shared.statsReporting && typeof Shared.statsReporting.normalizeSavedPanelModel === 'function'
      ? Shared.statsReporting.normalizeSavedPanelModel(src)
      : {
        resultsModel: cloneSimple(src.resultsModel) || null,
        reportModel: cloneSimple(src.reportModel) || null
      };
  }

  function captureSurfaceStatsPanelModel(fallback = null){
    const previous = normalizeSurfaceStatsPanelModel(fallback || state.statsPanelModel || {});
    if(!state.statsEl || !Shared.statsReporting || typeof Shared.statsReporting.capturePanelModel !== 'function'){
      state.statsPanelModel = previous;
      return state.statsPanelModel;
    }
    state.statsPanelModel = normalizeSurfaceStatsPanelModel(Shared.statsReporting.capturePanelModel(state.statsEl) || previous);
    const session = getActiveSurfaceSessionForState();
    if(session){
      session.state.statsPanelModel = normalizeSurfaceStatsPanelModel(state.statsPanelModel || {});
      session.results.statsPanelModel = normalizeSurfaceStatsPanelModel(state.statsPanelModel || {});
      session.updatedAt = Date.now();
    }
    return state.statsPanelModel;
  }

  function surfaceStatsPanelModelHasContent(model){
    const normalized = normalizeSurfaceStatsPanelModel(model);
    return !!(normalized.resultsModel || normalized.reportModel);
  }

  function restoreSurfaceStatsPanelModel(model){
    const normalized = normalizeSurfaceStatsPanelModel(model);
    if(!state.statsEl || !surfaceStatsPanelModelHasContent(normalized)){
      return false;
    }
    if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function'){
      Shared.statsReporting.restorePanelModel(state.statsEl, normalized, { clearMainWhenMissing: false });
      state.statsPanelModel = normalized;
      const session = getActiveSurfaceSessionForState();
      if(session){
        session.state.statsPanelModel = normalizeSurfaceStatsPanelModel(normalized);
        session.results.statsPanelModel = normalizeSurfaceStatsPanelModel(normalized);
        session.updatedAt = Date.now();
      }
      return true;
    }
    return false;
  }

  function ensureAxisRange(range){
    if(!range){ return { min: -1, max: 1 }; }
    let min = Number(range.min);
    let max = Number(range.max);
    if(!Number.isFinite(min) || !Number.isFinite(max)){
      return { min: -1, max: 1 };
    }
    if(min === max){
      const pad = Math.max(Math.abs(min) || 1, 1);
      min -= pad;
      max += pad;
    }
    return { min, max };
  }

  function resolveSurfaceLegendMetrics(options){
    const opts = options || {};
    const width = Number.isFinite(Number(opts.width)) && Number(opts.width) > 0 ? Number(opts.width) : 640;
    const height = Number.isFinite(Number(opts.height)) && Number(opts.height) > 0 ? Number(opts.height) : width;
    const margin = opts.margin || {};
    const marginTop = Number.isFinite(Number(margin.top)) ? Number(margin.top) : 0;
    const marginRight = Number.isFinite(Number(margin.right)) ? Number(margin.right) : 0;
    const marginBottom = Number.isFinite(Number(margin.bottom)) ? Number(margin.bottom) : 0;
    const availableHeight = Math.max(1, height - marginTop - marginBottom);
    const fontSize = Math.max(4, Number(opts.fontSize) || 12);
    const legendFontSize = Math.max(4, Number.isFinite(Number(opts.legendFontSize)) && Number(opts.legendFontSize) > 0
      ? Number(opts.legendFontSize)
      : fontSize * 0.75);
    const barWidthScale = Math.sqrt(Math.max(1, width) / SURFACE_LEGEND_BAR_REFERENCE_WIDTH);
    const preferredBarWidth = fontSize * barWidthScale;
    const barWidth = Math.max(
      SURFACE_LEGEND_BAR_MIN_WIDTH,
      Math.min(preferredBarWidth, width * SURFACE_LEGEND_BAR_MAX_WIDTH_RATIO)
    );
    const maxBarHeight = Math.max(1, availableHeight * 0.7);
    const readableFloor = Math.min(maxBarHeight, Math.max(legendFontSize * 2.6, Math.min(24, maxBarHeight)));
    const barHeight = Math.max(1, Math.min(maxBarHeight, Math.max(availableHeight * 0.36, readableFloor)));
    const labelOffset = Math.max(2, legendFontSize * 0.9);
    const topLabelGap = Math.max(2, legendFontSize * 0.4);
    const legendRightPad = Math.max(barWidth + legendFontSize * 2.2, width * 0.075);
    return {
      width,
      height,
      marginTop,
      marginRight,
      marginBottom,
      availableHeight,
      fontSize,
      legendFontSize,
      barWidth,
      barHeight,
      labelOffset,
      topLabelGap,
      legendRightPad
    };
  }

  function resolveSurfacePlotMargins(options){
    const opts = options || {};
    const width = Number.isFinite(Number(opts.width)) && Number(opts.width) > 0 ? Number(opts.width) : 640;
    const height = Number.isFinite(Number(opts.height)) && Number(opts.height) > 0 ? Number(opts.height) : width;
    const fontSize = Math.max(4, Number(opts.fontSize) || 12);
    const showLegend = opts.showLegend === true;
    const capReserve = (preferred, span, ratio, floor) => {
      const safeSpan = Math.max(1, Number(span) || 1);
      const safeFloor = Math.max(1, Number(floor) || 1);
      const cap = Math.max(safeFloor, safeSpan * ratio);
      return Math.max(safeFloor, Math.min(preferred, cap));
    };
    let top = capReserve(Math.max(fontSize * 3.2, 42), height, 0.24, fontSize * 1.7);
    let bottom = capReserve(Math.max(fontSize * 3.4, 44), height, 0.26, fontSize * 1.8);
    let left = capReserve(Math.max(fontSize * 3.6, 58), width, 0.25, fontSize * 2.1);
    const rightPreferred = showLegend
      ? Math.max(fontSize * 5.8, width * 0.22)
      : Math.max(fontSize * 3.2, width * 0.10);
    let right = capReserve(rightPreferred, width, showLegend ? 0.34 : 0.20, fontSize * (showLegend ? 3.0 : 2.0));
    const maxHorizontalReserve = Math.max(40, width - 40);
    const horizontalReserve = left + right;
    if(horizontalReserve > maxHorizontalReserve){
      const scale = maxHorizontalReserve / horizontalReserve;
      left *= scale;
      right *= scale;
    }
    const maxVerticalReserve = Math.max(40, height - 40);
    const verticalReserve = top + bottom;
    if(verticalReserve > maxVerticalReserve){
      const scale = maxVerticalReserve / verticalReserve;
      top *= scale;
      bottom *= scale;
    }
    return { top, right, bottom, left };
  }

  function renderLegend(svg, options){
    if(!svg || !options){ return; }
    const legendTextColor = isSurfaceDarkTheme()
      ? '#ffffff'
      : normalizeSurfaceThemeColor(
          options.textColor,
          chartStyle.TEXT_COLOR || '#1f2a3d'
        );
    const legendStrokeColor = normalizeSurfaceThemeColor(options.axisColor, '#cbd5e1');
    const doc = svg.ownerDocument || global.document;
    const targetLayer = options.layer && options.layer.ownerDocument === doc && options.layer.nodeType === 1 ? options.layer : svg;
    let defs = svg.querySelector('defs');
    if(!defs){
      defs = doc.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild || null);
    }
    const gradientId = `surfaceGradientScale-${SURFACE_INSTANCE_ID}`;
    let gradient = defs.querySelector(`#${gradientId}`);
    if(!gradient){
      gradient = doc.createElementNS(NS, 'linearGradient');
      gradient.id = gradientId;
      defs.appendChild(gradient);
    }
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '100%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '0%');
    
    // Create gradient stops based on the color ramp
    const ramp = COLOR_RAMPS[options.colorRamp] || COLOR_RAMPS.viridis;
    const stops = Array.isArray(ramp.stops) && ramp.stops.length ? ramp.stops : COLOR_RAMPS.viridis.stops;
    const stopCount = Math.max(1, stops.length - 1);
    
    // Clear existing stops
    while(gradient.firstChild){ 
      gradient.removeChild(gradient.firstChild); 
    }
    
    // Create new stops
    stops.forEach((hex, index) => {
      const stop = doc.createElementNS(NS, 'stop');
      stop.setAttribute('offset', `${(index / stopCount) * 100}%`);
      stop.setAttribute('stop-color', hex);
      gradient.appendChild(stop);
    });
    let legend = svg.querySelector('g.surface-legend');
    if(!legend){
      legend = doc.createElementNS(NS, 'g');
      legend.setAttribute('class', 'surface-legend');
      legend.setAttribute('data-legend-key', 'surface-scale');
    } else if(legend.parentNode !== targetLayer){
      legend.parentNode.removeChild(legend);
    }
    targetLayer.appendChild(legend);
    if(!legend.getAttribute('data-legend-key')){
      legend.setAttribute('data-legend-key', 'surface-scale');
    }
    while(legend.firstChild){ legend.removeChild(legend.firstChild); }
    // mark which gradient id this legend relies on so we can safely remove it later
    try{ legend.setAttribute('data-gradient-id', gradientId); }catch(e){}
    const metrics = resolveSurfaceLegendMetrics(options);
    const {
      fontSize,
      legendFontSize,
      barWidth,
      barHeight: finalLegendHeight,
      labelOffset,
      topLabelGap,
      legendRightPad
    } = metrics;

    const defaultLegendX = metrics.width - metrics.marginRight + legendRightPad;
    const defaultLegendY = metrics.marginTop;
    const position = options.position || state.labelPositions?.legend || null;
    let absoluteLegendX = defaultLegendX;
    let absoluteLegendY = defaultLegendY;
    if(position){
      const relX = Number(position.relX);
      const relY = Number(position.relY);
      if(Number.isFinite(relX) && Number.isFinite(relY)){
        absoluteLegendX = metrics.width - metrics.marginRight + relX * legendRightPad;
        absoluteLegendY = metrics.marginTop + relY * metrics.availableHeight;
      }else{
        const absX = Number(position.x);
        const absY = Number(position.y);
        if(Number.isFinite(absX)){ absoluteLegendX = absX; }
        if(Number.isFinite(absY)){ absoluteLegendY = absY; }
      }
    }
    if(!Number.isFinite(absoluteLegendX)){ absoluteLegendX = defaultLegendX; }
    if(!Number.isFinite(absoluteLegendY)){ absoluteLegendY = defaultLegendY; }

    debugLog('Debug: surface legend positioning', {
      absoluteLegendX,
      absoluteLegendY,
      defaultLegendX,
      defaultLegendY,
      barWidth,
      barHeight: finalLegendHeight,
      legendFontSize,
      legendRightPad,
      availableHeight: metrics.availableHeight,
      position
    });

    legend.setAttribute('transform', `translate(${absoluteLegendX},${absoluteLegendY})`);
    const rect = doc.createElementNS(NS, 'rect');
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', finalLegendHeight);
    rect.setAttribute('fill', `url(#${gradientId})`);
    rect.setAttribute('stroke', legendStrokeColor);
    rect.setAttribute('stroke-width', Math.max(0.4, fontSize * 0.04));
    rect.setAttribute('data-legend-key', 'surface-scale');
    legend.appendChild(rect);
    appendSurfaceLegendTextLabels(legend, {
      barWidth,
      barHeight: finalLegendHeight,
      labelOffset,
      topLabelGap,
      fontSize: legendFontSize,
      textColor: legendTextColor,
      formatValue: anchor => formatNumber(anchor === 'min' ? options.min : options.max)
    });

    if(typeof plot3d.applyLegendPointerGuards === 'function' && legend.dataset?.pointerGuardBound !== '1'){
      plot3d.applyLegendPointerGuards(legend, { label: 'surface-scale' });
      if(legend.dataset){ legend.dataset.pointerGuardBound = '1'; }
    }

    if(typeof Shared.enableLegendDrag === 'function' && legend.dataset){
      if(legend.dataset.dragBound !== '1'){
        legend.dataset.dragBound = '1';
        Shared.enableLegendDrag(legend, svg, {
          onDragEnd: pos => {
            const relX = (pos.x - (metrics.width - metrics.marginRight)) / legendRightPad;
            const relY = metrics.availableHeight > 0
              ? (pos.y - metrics.marginTop) / metrics.availableHeight
              : 0;
            patchSurfaceLabelPosition(getActiveSurfaceSessionForState(), 'legend', {
              x: pos.x,
              y: pos.y,
              relX,
              relY
            }, { reason: 'surface-legend-position' });
            debugLog('Debug: surface legend position saved', { absolute: pos, relative: { relX, relY } });
          },
          undoLabel: 'surface-legend-position'
        });
      }
    }
    
    return {
      width: barWidth + legendRightPad,
      height: finalLegendHeight
    };
  }

  function removeLegend(svg){
    if(!svg){ return; }
    const legend = svg.querySelector('g.surface-legend');
    if(legend && legend.parentNode){
      // remove associated gradient if present
      try{
        const gradId = legend.getAttribute && legend.getAttribute('data-gradient-id');
        if(gradId){
          const defs = svg.querySelector('defs');
          const grad = defs && defs.querySelector && defs.querySelector(`#${gradId}`);
          if(grad && grad.parentNode){ grad.parentNode.removeChild(grad); }
        }
      }catch(e){ /* ignore missing gradient cleanup */ }
      legend.parentNode.removeChild(legend);
    }
  }

  function applySettingsToControls(){
    if(state.controls.interpolation){ state.controls.interpolation.value = state.settings.interpolation; }
    if(state.controls.fontSize){ state.controls.fontSize.value = String(state.settings.fontSize); }
    if(state.controls.fontSize && chartStyle.renderFontSizeLabel){
      chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, pt: Number(state.settings.fontSize), input: state.controls.fontSize });
    }
    if(state.controls.axisStroke){
      state.controls.axisStroke.value = String(state.settings.axisStroke);
      if(state.controls.axisStrokeVal){ state.controls.axisStrokeVal.textContent = Number(state.settings.axisStroke).toFixed(2); }
    }
    if(state.controls.axisColor){ state.controls.axisColor.value = state.settings.axisColor; }
    if(state.controls.showGrid){ state.controls.showGrid.checked = !!state.settings.showGrid; }
    if(state.controls.showFrame){ state.controls.showFrame.checked = !!state.settings.showFrame; }
    if(state.controls.showPoints){ state.controls.showPoints.checked = !!state.settings.showPoints; }
  }

  function buildExampleDataset(){
    const rows = [[DEFAULT_AXIS_LABELS.x, DEFAULT_AXIS_LABELS.y, DEFAULT_AXIS_LABELS.z]];
    const xs = [];
    const ys = [];
    for(let x = -3; x <= 3.0001; x += 0.6){
      xs.push(Number(x.toFixed(2)));
    }
    for(let y = -3; y <= 3.0001; y += 0.6){
      ys.push(Number(y.toFixed(2)));
    }
    for(let yi = 0; yi < ys.length; yi += 1){
      const y = ys[yi];
      for(let xi = 0; xi < xs.length; xi += 1){
        const x = xs[xi];
        const peakNorth = Math.exp(-((x - 1.2) * (x - 1.2) + (y + 0.8) * (y + 0.8)) * 1.4);
        const peakSouth = Math.exp(-((x + 1.0) * (x + 1.0) + (y - 1.5) * (y - 1.5)) * 2.1);
        const valleyCenter = Math.exp(-((x + 0.2) * (x + 0.2) + (y + 0.1) * (y + 0.1)) * 3.2);
        const ridge = 0.35 * Math.sin(x * 2.3) * Math.cos(y * 1.8);
        const z = peakNorth * 5.0 + peakSouth * 3.5 - valleyCenter * 6.0 + ridge * 2.0;
        rows.push([x, y, Number(z.toFixed(3))]);
      }
    }
    return rows;
  }

  function initControls(){
    cacheDom();
    applySettingsToControls();
    const interpolationSelect = state.controls.interpolation;
    if(interpolationSelect){
      bindSurfaceControlHandler(interpolationSelect, 'change', 'interpolation', () => {
        const value = interpolationSelect.value;
        state.settings.interpolation = INTERPOLATION_OPTIONS[value] ? value : 'grid';
        debugLog('Debug: surface interpolation updated', { value: state.settings.interpolation });
        scheduleActiveSurfaceDraw({ reason: 'surface-interpolation-change' });
      });
    }
    if(state.controls.fontSize){
      bindSurfaceControlHandler(state.controls.fontSize, 'input', 'font-size', () => {
        state.settings.fontSize = Number(state.controls.fontSize.value) || 12;
        if(chartStyle.renderFontSizeLabel){
          chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, pt: state.settings.fontSize, input: state.controls.fontSize, manual: true });
        }
        scheduleActiveSurfaceDraw({ reason: 'surface-font-size-change' });
      });
    }
    if(state.controls.axisStroke){
      bindSurfaceControlHandler(state.controls.axisStroke, 'input', 'axis-stroke', () => {
        state.settings.axisStroke = Number(state.controls.axisStroke.value) || DEFAULT_SURFACE_SETTINGS.axisStroke;
        if(state.controls.axisStrokeVal){ state.controls.axisStrokeVal.textContent = Number(state.settings.axisStroke).toFixed(2); }
        scheduleActiveSurfaceDraw({ reason: 'surface-axis-stroke-change' });
      });
    }
    if(state.controls.axisColor){
      if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(state.controls.axisColor);
      }
      bindSurfaceControlHandler(state.controls.axisColor, 'input', 'axis-color', () => {
        state.settings.axisColor = state.controls.axisColor.value || '#3b3b3b';
        scheduleActiveSurfaceDraw({ reason: 'surface-axis-color-change' });
      });
    }
    ['showGrid', 'showFrame', 'showPoints'].forEach(key => {
      const control = state.controls[key];
      if(!control){ return; }
      bindSurfaceControlHandler(control, 'change', `setting-${key}`, () => {
        state.settings[key] = !!control.checked;
        scheduleActiveSurfaceDraw({ reason: `surface-${key}-change` });
      });
    });
    ['x', 'y', 'z'].forEach(axis => {
      const select = state.axisSelects[axis];
      if(!select){ return; }
      bindSurfaceControlHandler(select, 'change', `axis-${axis}`, () => {
        const next = Number(select.value);
        if(Number.isFinite(next)){
          state.axisMap[axis] = next;
        }
        scheduleActiveSurfaceDraw({ reason: `surface-${axis}-axis-change` });
      });
    });
    if(state.controls.loadExample){
      bindSurfaceControlHandler(state.controls.loadExample, 'click', 'load-example', () => {
        const example = buildExampleDataset();
        if(state.hot && typeof state.hot.loadData === 'function'){
          markSurfaceOverlayPending('example-data');
          state.hot.loadData(example, {
            source: 'example-load',
            recordUndo: true,
            undoLabel: 'table:surface:example-load'
          });
          debugLog('Debug: surface example dataset loaded', { rows: example.length });
          updateAxisOptions();
          scheduleSurfaceDrawForHot(state.hot, { reason: 'surface-example-load' });
        }
      });
    }
    if(state.controls.importBtn && state.controls.importFile){
      bindSurfaceControlHandler(state.controls.importBtn, 'click', 'import-table', () => {
        state.controls.importFile.value = '';
        state.controls.importFile.click();
      });
      bindSurfaceControlHandler(state.controls.importFile, 'change', 'import-file', () => {
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('surface import skipped: tableImport unavailable');
          return;
        }
        const importHot = state.hot || null;
        const importSession = getSurfaceSessionForHot(importHot, { reason: 'surface-import-file' }, { create: false })
          || getActiveSurfaceSessionForState();
        const hasFile = !!(state.controls.importFile?.files && state.controls.importFile.files[0]);
        let forcedOverlay = false;
        if(hasFile && isSurfaceSessionActiveOrActivating(importSession)){
          forcedOverlay = !!forceSurfaceOverlay('file-import', { message: 'Importing table data...' });
          markSurfaceOverlayPending('file-import');
        }
        tableImport.openFile(state.controls.importFile, {
          hot: importHot,
          minCols: 3,
          minRows: 5,
          scheduleDraw: () => {
            if(importSession && !isSurfaceSessionActiveOrActivating(importSession)){
              importSession.state.drawPending = true;
              importSession.updatedAt = Date.now();
              return;
            }
            markSurfaceOverlayPending('file-import');
            scheduleSurfaceDrawForSession(importSession || getActiveSurfaceSessionForState(), { force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'surface',
          onProcessed: info => {
            debugLog('Debug: surface data imported', info);
            updateAxisOptions();
          },
          onCompleted: () => {
            if(importSession && !isSurfaceSessionActiveOrActivating(importSession)){
              importSession.state.drawPending = true;
              importSession.updatedAt = Date.now();
              return;
            }
            const renderReason = 'import-load';
            markSurfaceOverlayPending(renderReason);
            forceSurfaceOverlay(renderReason, { message: 'Rendering surface plot...' });
          }
        }).then(result => {
          if(!result && forcedOverlay && isSurfaceSessionActiveOrActivating(importSession)){
            resolveSurfaceOverlay('file-import-empty');
          }
        }).catch(err => {
          if(forcedOverlay && isSurfaceSessionActiveOrActivating(importSession)){
            resolveSurfaceOverlay('file-import-error');
          }
          console.error('surface import failed', err);
        });
      });
    }
    if(exporter && typeof exporter.mountSvgControls === 'function'){
      exporter.mountSvgControls({
        container: '#surfaceExportControls',
        svgSelector: '#surfaceSvg',
        fileName: 'surface-plot',
        contextLabel: 'surface-export'
      });
    }
    const saveBtn = getSurfaceNodeById('saveSurfaceGraph');
    if(saveBtn){ attachListener(saveBtn, 'click', () => surface.save()); }
    const saveAsBtn = getSurfaceNodeById('saveAsSurface');
    if(saveAsBtn){ attachListener(saveAsBtn, 'click', () => surface.saveAs()); }
    const openBtn = getSurfaceNodeById('openSurfaceGraph');
    if(openBtn){ attachListener(openBtn, 'click', () => surface.open()); }
  }
  function getSurfaceSessionForDrawOptions(options = {}, meta = {}){
    const source = options && typeof options === 'object' ? options : {};
    const tabId = source.tabId || source.tab?.id || meta?.tabId || getSurfaceProjectionTabId() || null;
    return tabId
      ? getSurfaceSession(tabId, {
          ...(meta || {}),
          tabId,
          reason: meta?.reason || source.reason || 'surface-draw-session'
        }, { create: meta?.create !== false })
      : getActiveSurfaceSessionForState();
  }

  function draw(options = {}, session = null){
    return drawSurface(session || getSurfaceSessionForDrawOptions(options), options);
  }

  function runSurfaceDrawCycle(options = {}){
    const drawSession = getSurfaceSessionForDrawOptions(options, { reason: options?.reason || 'surface-draw-cycle-session' });
    let status = 'complete';
    try{
      draw(options, drawSession);
    }catch(err){
      status = 'error';
      throw err;
    }finally{
      resolveSurfaceOverlay(status, { session: drawSession, allowInactive: true });
    }
  }

  function drawSurface(session = null, options = {}){
    const drawSession = ensureSurfaceSessionOwnershipShape(session || getSurfaceSessionForDrawOptions(options));
    if(drawSession && !isSurfaceSessionActiveOrActivating(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      debugLog('Debug: surface draw skipped for inactive session', {
        tabId: drawSession.tabId || null,
        reason: options?.reason || null
      });
      return false;
    }
    bindSurfaceSessionForTab(drawSession?.tabId || getSurfaceProjectionTabId() || null, { reason: 'surface-draw-bind', root: state.root || null }, { apply: false });
    cacheDom(drawSession);
    const svg = state.svg;
    const svgBox = state.svgBox;
    if(!svg || !svgBox){
      debugLog('Debug: surface draw skipped', { reason: 'missing-svg' });
      return false;
    }
    const parsed = parseSurfaceTable();
    if(!parsed.points.length){
      while(svg.firstChild){ svg.removeChild(svg.firstChild); }
      renderSurfaceEmptyPlotNotice();
      updateStats(parsed.stats);
      removeLegend(svg);
      captureSurfaceSessionStateFromActive(projectedSurfaceSession, { reason: 'surface-draw-empty' });
      return false;
    }
    updateAxisLabelsFromHeaders();
    displayMessage('');
    const drawableFrame = resolveSurfaceDrawableFrame(svg);
    const surfaceFrame = resolveSurface3dFrame(drawableFrame);
    const width = surfaceFrame.width;
    const height = surfaceFrame.height;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('data-surface-base-width', String(width));
    svg.setAttribute('data-surface-base-height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY || 'Segoe UI, sans-serif');
    if(typeof chartStyle.applySvgDefaults === 'function'){
      chartStyle.applySvgDefaults(svg);
    }
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg, { scopeId: 'surface' });
    }
    const doc = svg.ownerDocument || global.document;
    // Ensure <defs> exists for gradients/etc
    let defs = svg.querySelector('defs');
    if(!defs){
      defs = doc.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild || null);
    }
    // Reuse or create stable layer groups to avoid removing/recreating every draw
    let backgroundLayer = svg.querySelector('g.surface-layer-background');
    if(!backgroundLayer){
      backgroundLayer = doc.createElementNS(NS, 'g');
      backgroundLayer.setAttribute('class', 'surface-layer surface-layer-background');
      svg.appendChild(backgroundLayer);
    }
    let geometryLayer = svg.querySelector('g.surface-layer-geometry');
    if(!geometryLayer){
      geometryLayer = doc.createElementNS(NS, 'g');
      geometryLayer.setAttribute('class', 'surface-layer surface-layer-geometry');
      svg.appendChild(geometryLayer);
    }
    let frontLayer = svg.querySelector('g.surface-layer-foreground');
    if(!frontLayer){
      frontLayer = doc.createElementNS(NS, 'g');
      frontLayer.setAttribute('class', 'surface-layer surface-layer-foreground');
      svg.appendChild(frontLayer);
    }
    let axisLayer = svg.querySelector('g.surface-layer-axes');
    if(!axisLayer){
      axisLayer = doc.createElementNS(NS, 'g');
      axisLayer.setAttribute('class', 'surface-layer surface-layer-axes');
      svg.appendChild(axisLayer);
    }
    ensureSurfaceGeometryPoolsSynced('draw-start');
    const fontInfo = typeof chartStyle.resolveScaledFontSize === 'function'
      ? chartStyle.resolveScaledFontSize({ rawSize: state.settings.fontSize, width, height, svgBox: state.svgBox, input: state.controls.fontSize })
      : { scaledPx: state.settings.fontSize, scaleInfo: null };
    if(state.controls.fontSize && chartStyle.renderFontSizeLabel){
      chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, fontInfo, input: state.controls.fontSize });
    }
    const fs = fontInfo.scaledPx || state.settings.fontSize;
    const surfaceFontStyles = exportFontStyles('surface');
    const resolveSurfaceScopedFontSize = (role, fallbackPx) => {
      const fallback = Number.isFinite(Number(fallbackPx)) && Number(fallbackPx) > 0 ? Number(fallbackPx) : fs;
      if(!chartStyle || typeof chartStyle.resolveScopedLabelMeasureFont !== 'function'){
        return fallback;
      }
      const profile = chartStyle.resolveScopedLabelMeasureFont({
        styles: surfaceFontStyles,
        role,
        fallbackPx: fallback
      });
      const size = Number(profile?.fontSizePx);
      return Number.isFinite(size) && size > 0 ? size : fallback;
    };
    const surface3dTickFontSize = Math.max(
      resolveSurfaceScopedFontSize('xTick', fs),
      resolveSurfaceScopedFontSize('yTick', fs),
      resolveSurfaceScopedFontSize('zTick', fs)
    );
    const surfaceLegendTickFontSize = resolveSurfaceScopedFontSize(null, fs * 0.75);
    const markSurface3dAxisTickLabel = (node, axisKey) => {
      if(!node){ return; }
      const role = axisKey === 'z' ? 'zTick' : (axisKey === 'y' ? 'yTick' : 'xTick');
      markFontEditable(node, role, role);
    };
    const axisStrokeWidthBase = getAxisStrokeWidthBase();
    const axisStrokeWidth = typeof chartStyle.scaleStrokeWidth === 'function'
      ? chartStyle.scaleStrokeWidth(axisStrokeWidthBase, fontInfo.scaleInfo, { context: 'surface-axis', min: 0, exact: true })
      : axisStrokeWidthBase;
    const gridStyleBase = getGridStyle(axisStrokeWidthBase);
    const gridStrokeStyle = Object.assign({}, gridStyleBase, {
      thickness: typeof chartStyle.scaleStrokeWidth === 'function'
        ? chartStyle.scaleStrokeWidth(gridStyleBase.thickness, fontInfo.scaleInfo, { context: 'surface-grid', min: 0 })
        : gridStyleBase.thickness
    });
    const gridDash = (gridControls && typeof gridControls.patternToDasharray === 'function')
      ? gridControls.patternToDasharray(gridStrokeStyle.pattern, gridStrokeStyle.thickness)
      : null;
    const gridOpacity = (gridControls && typeof gridControls.transparencyToOpacity === 'function')
      ? gridControls.transparencyToOpacity(gridStrokeStyle.transparency)
      : Math.max(0, Math.min(1, 1 - (Number(gridStrokeStyle.transparency || 0) / 100)));
    const surfaceThemeDark = isSurfaceDarkTheme();
    const surfaceTextColor = normalizeSurfaceThemeColor(
      state.settings?.textColor,
      surfaceThemeDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#1f2a3d')
    );
    const surfaceBackgroundColor = normalizeSurfaceThemeColor(
      state.settings?.backgroundColor,
      surfaceThemeDark ? '#000000' : '#ffffff'
    );
    const surfaceGeometryStroke = surfaceThemeDark
      ? normalizeSurfaceThemeColor(state.settings?.axisColor, '#d1d5db')
      : 'rgba(0,0,0,0.25)';
    const surfaceGeometryStrokeOpacity = surfaceThemeDark ? 0.65 : 1;
    const canShowLegend = Number.isFinite(parsed.stats.zMin)
      && Number.isFinite(parsed.stats.zMax)
      && parsed.stats.zMin !== parsed.stats.zMax;
    const margin = resolveSurfacePlotMargins({
      width,
      height,
      fontSize: fs,
      showLegend: canShowLegend
    });
    const legendShiftX = typeof plot3d.resolveLegendShiftX === 'function'
      ? plot3d.resolveLegendShiftX({ legendVisible: canShowLegend, margin, fontSize: fs })
      : 0;
    const plotWidth = Math.max(40, width - margin.left - margin.right);
    const plotHeight = Math.max(40, height - margin.top - margin.bottom);
    const ranges = {
      x: ensureAxisRange(parsed.ranges?.x),
      y: ensureAxisRange(parsed.ranges?.y),
      z: ensureAxisRange(parsed.ranges?.z)
    };
    const rotatePoint = typeof plot3d.rotatePoint === 'function'
      ? (pt) => plot3d.rotatePoint(pt, state.rotation)
      : (pt) => ({ x: pt.x, y: pt.y, z: pt.z });
    const corners = [
      { x: ranges.x.min, y: ranges.y.min, z: ranges.z.min },
      { x: ranges.x.max, y: ranges.y.min, z: ranges.z.min },
      { x: ranges.x.min, y: ranges.y.max, z: ranges.z.min },
      { x: ranges.x.max, y: ranges.y.max, z: ranges.z.min },
      { x: ranges.x.min, y: ranges.y.min, z: ranges.z.max },
      { x: ranges.x.max, y: ranges.y.min, z: ranges.z.max },
      { x: ranges.x.min, y: ranges.y.max, z: ranges.z.max },
      { x: ranges.x.max, y: ranges.y.max, z: ranges.z.max }
    ];
    const rotatedCorners = corners.map(rotatePoint);
    const rotatedPoints = parsed.points.map(rotatePoint);
    let projector = null;
    if(typeof plot3d.createProjector === 'function'){
      projector = plot3d.createProjector({
        rotatedPoints: rotatedPoints.concat(rotatedCorners),
        rotatedCorners,
        width,
        height,
        margin,
        shiftX: legendShiftX
      });
    } else {
      projector = {
        project(pt){
          return {
            x: margin.left + ((pt.x - ranges.x.min) / (ranges.x.max - ranges.x.min || 1)) * plotWidth,
            y: margin.top + plotHeight - ((pt.y - ranges.y.min) / (ranges.y.max - ranges.y.min || 1)) * plotHeight,
            depth: pt.z
          };
        }
      };
    }
    const projectRotated = (rot) => projector.project(rot);
    bindSurface3dRotationControls(svg, 'surface-plot');
    const tickTargetX = Math.max(3, typeof chartStyle.estimateTickCount === 'function'
      ? chartStyle.estimateTickCount(plotWidth, { axis: 'x', fallback: 6 })
      : 6);
    const tickTargetY = Math.max(3, typeof chartStyle.estimateTickCount === 'function'
      ? chartStyle.estimateTickCount(plotHeight, { axis: 'y', fallback: 6 })
      : 6);
    const tickTargetZ = Math.max(3, typeof chartStyle.estimateTickCount === 'function'
      ? chartStyle.estimateTickCount(Math.max(plotWidth, plotHeight), { axis: 'z', fallback: 6 })
      : 6);
    const scaleX = niceScale(ranges.x.min, ranges.x.max, tickTargetX);
    const scaleY = niceScale(ranges.y.min, ranges.y.max, tickTargetY);
    const scaleZ = niceScale(ranges.z.min, ranges.z.max, tickTargetZ);
    const clampTicks = (ticks, range) => ticks.filter(value => value >= range.min - 1e-9 && value <= range.max + 1e-9);
    const ensureMinTicks = (ticks, range, count = 3) => {
      if(ticks.length >= count){
        return ticks;
      }
      const span = range.max - range.min;
      if(!Number.isFinite(span) || span === 0){
        return ticks;
      }
      const step = span / (count - 1);
      const fallback = [];
      for(let i = 0; i < count; i += 1){
        fallback.push(Number((range.min + step * i).toFixed(6)));
      }
      return fallback;
    };
    const axisTicks = {
      x: ensureMinTicks(clampTicks(scaleX.ticks, ranges.x), ranges.x),
      y: ensureMinTicks(clampTicks(scaleY.ticks, ranges.y), ranges.y),
      z: ensureMinTicks(clampTicks(scaleZ.ticks, ranges.z), ranges.z)
    };
    if(typeof plot3d.renderAxesAndGrid === 'function'){
      // Clear previous render output from axis and background layers to avoid
      // accumulation when renderers append new nodes each draw (e.g., on rotate).
      try{ while(axisLayer.firstChild){ axisLayer.removeChild(axisLayer.firstChild); } }catch(e){}
      try{ while(backgroundLayer.firstChild){ backgroundLayer.removeChild(backgroundLayer.firstChild); } }catch(e){}
      try{ while(frontLayer.firstChild){ frontLayer.removeChild(frontLayer.firstChild); } }catch(e){}
      if(svg.style){
        if(surfaceThemeDark){
          svg.style.backgroundColor = surfaceBackgroundColor;
        }else{
          svg.style.removeProperty('background-color');
        }
      }
      if(surfaceThemeDark){
        svg.setAttribute('data-color-scheme-bg-color', surfaceBackgroundColor);
      }else{
        svg.removeAttribute('data-color-scheme-bg-color');
      }
      plot3d.renderAxesAndGrid({
        svg: axisLayer,
        project: projectRotated,
        rotatePoint,
        axisRanges: ranges,
        axisTicks,
        axisLabels: { x: state.labels.x, y: state.labels.y, z: state.labels.z },
        fontSize: fs,
        tickFontSize: surface3dTickFontSize,
        axisStrokeWidth,
        chartStyle,
        showGrid: state.settings.showGrid,
        showFrame: state.settings.showFrame,
        showPanes: state.settings.showFrame,
        axisColor: state.settings.axisColor,
        frameColor: state.settings.axisColor,
        tickTextColor: surfaceTextColor,
        axisLabelColor: surfaceTextColor,
        paneFill: surfaceThemeDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
        paneOpacityRange: surfaceThemeDark ? { min: 0.10, max: 0.22 } : { min: 0.01, max: 0.05 },
        gridColor: gridStrokeStyle.color,
        gridDash: gridDash || undefined,
        gridOpacity,
        gridStrokeWidth: gridStrokeStyle.thickness,
        gridOutlineColors: { primary: gridStrokeStyle.color, secondary: gridStrokeStyle.color },
        debugLabel: 'surface-axes',
        paneTarget: backgroundLayer,
        gridTarget: backgroundLayer,
        backFrameTarget: backgroundLayer,
        backAxisTarget: backgroundLayer,
        frontFrameTarget: frontLayer,
        axisTarget: axisLayer,
        labelTarget: axisLayer,
        onAxisTickLabel: markSurface3dAxisTickLabel,
        onAxisLabel: (el, axisKey) => {
          if(!el){ return; }
          const role = axisKey ? `${axisKey}Title` : 'axisTitle';
          markFontEditable(el, role, role);
          const applyAxisLabel = value => {
            const trimmed = value != null ? String(value).trim() : '';
            const resolved = trimmed || DEFAULT_AXIS_LABELS[axisKey] || DEFAULT_AXIS_LABELS.x;
            state.labels[axisKey] = resolved;
            if(state.hot && typeof state.hot.setDataAtCell === 'function'){
              const columns = getSelectedColumns();
              const targetCol = columns[axisKey];
              if(Number.isInteger(targetCol)){
                const current = getHeaderLabelForColumn(targetCol);
                if(current !== resolved){
                  state.hot.setDataAtCell(0, targetCol, resolved, 'surface-axis-inline');
                }
              }
            }
            scheduleActiveSurfaceDraw({ reason: `surface-${axisKey || 'axis'}-label-edit` });
            if(el.textContent !== resolved){
              el.textContent = resolved;
            }
            return resolved;
          };
          makeEditableHelper(el, text => {
            const previous = state.labels[axisKey] || DEFAULT_AXIS_LABELS[axisKey] || DEFAULT_AXIS_LABELS.x;
            const nextValue = applyAxisLabel(text);
            if(previous === nextValue){
              return;
            }
            recordSurfaceChange(`surface:${axisKey}-label`, previous, nextValue, val => { applyAxisLabel(val); return true; });
          }, { scopeId: 'surface', key: role });
        }
      });
    }
    const axisLabelBounds = [];
    if(axisLayer && typeof axisLayer.querySelectorAll === 'function'){
      const axisNodes = axisLayer.querySelectorAll('[data-axis-label]');
      for(let idx = 0; idx < axisNodes.length; idx += 1){
        const node = axisNodes[idx];
        if(!node || typeof node.getBBox !== 'function'){ continue; }
        try {
          const bbox = node.getBBox();
          const valid = Number.isFinite(bbox?.x) && Number.isFinite(bbox?.y)
            && Number.isFinite(bbox?.width) && Number.isFinite(bbox?.height);
          if(!valid){ continue; }
          axisLabelBounds.push({
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height
          });
        } catch(err){
          debugLog('Debug: surface axis label bbox error', {
            message: err?.message || String(err)
          });
        }
      }
    }
    const colorFor = colorScaleFactory(parsed.stats.zMin, parsed.stats.zMax, state.settings.colorRamp);
    const effectiveMode = (state.settings.interpolation === 'grid' && parsed.faces.length)
      ? 'grid'
      : (parsed.faces.length ? state.settings.interpolation : 'scatter');
    const shouldRenderFaces = parsed.faces.length && effectiveMode === 'grid';
    const shouldRenderPoints = state.settings.showPoints || effectiveMode !== 'grid';
    if(shouldRenderFaces){
      let faceGroup = geometryLayer.querySelector('g.surface-faces');
      if(!faceGroup){
        faceGroup = doc.createElementNS(NS, 'g');
        faceGroup.setAttribute('class', 'surface-faces');
        geometryLayer.appendChild(faceGroup);
      }
      const projectedFaces = parsed.faces.map(face => {
        const rotated = face.vertices.map(rotatePoint);
        const projected = rotated.map(projectRotated);
        const depth = rotated.reduce((sum, value) => sum + value.z, 0) / rotated.length;
        return { projected, depth, value: face.value };
      }).sort((a, b) => a.depth - b.depth);
      state._facePoolUsed = 0;
      projectedFaces.forEach(face => {
        let polygon = state._facePool[state._facePoolUsed];
        if(!polygon){
          polygon = doc.createElementNS(NS, 'polygon');
          polygon.setAttribute('class', 'surface-face');
          state._facePool.push(polygon);
        }
        polygon.setAttribute('points', face.projected.map(pt => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' '));
        polygon.setAttribute('fill', colorFor(face.value));
        polygon.setAttribute('fill-opacity', 0.95);
        polygon.setAttribute('stroke', surfaceGeometryStroke);
        polygon.setAttribute('stroke-opacity', String(surfaceGeometryStrokeOpacity));
        polygon.setAttribute('stroke-width', Math.max(axisStrokeWidth * 0.6, 0.6));
        faceGroup.appendChild(polygon);
        polygon.style.display = '';
        state._facePoolUsed += 1;
      });
      // hide any unused polygons but keep in pool
      for(let i = state._facePoolUsed; i < state._facePool.length; i += 1){
        const extra = state._facePool[i];
        try{ if(extra && extra.style){ extra.style.display = 'none'; } }catch(e){}
      }
      if(faceGroup.style.display !== ''){
        faceGroup.style.display = '';
      }
    } else {
      const faceGroup = geometryLayer.querySelector('g.surface-faces');
      if(faceGroup){
        faceGroup.style.display = 'none';
      }
    }
    if(shouldRenderPoints){
      let pointGroup = geometryLayer.querySelector('g.surface-points');
      if(!pointGroup){
        pointGroup = doc.createElementNS(NS, 'g');
        pointGroup.setAttribute('class', 'surface-points');
        geometryLayer.appendChild(pointGroup);
      }
      const projectedPoints = parsed.points.map(point => {
        const rotated = rotatePoint(point);
        const projected = projectRotated(rotated);
        return { x: projected.x, y: projected.y, depth: rotated.z, value: point.z };
      }).sort((a, b) => a.depth - b.depth);
      const radius = Math.max(2.5, Math.min(6, Math.sqrt(Math.max(plotWidth * plotHeight / Math.max(projectedPoints.length * 45, 1), 4))));
      state._pointPoolUsed = 0;
      projectedPoints.forEach(entry => {
        let circle = state._pointPool[state._pointPoolUsed];
        if(!circle){
          circle = doc.createElementNS(NS, 'circle');
          circle.setAttribute('class', 'surface-point');
          state._pointPool.push(circle);
        }
        circle.setAttribute('cx', entry.x);
        circle.setAttribute('cy', entry.y);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', colorFor(entry.value));
        circle.setAttribute('stroke', surfaceGeometryStroke);
        circle.setAttribute('stroke-opacity', String(surfaceGeometryStrokeOpacity));
        circle.setAttribute('stroke-width', Math.max(axisStrokeWidth * 0.4, 0.4));
        circle.setAttribute('opacity', effectiveMode === 'grid' ? 0.78 : 0.95);
        pointGroup.appendChild(circle);
        circle.style.display = '';
        state._pointPoolUsed += 1;
      });
      for(let i = state._pointPoolUsed; i < state._pointPool.length; i += 1){
        const extra = state._pointPool[i];
        try{ if(extra && extra.style){ extra.style.display = 'none'; } }catch(e){}
      }
      if(pointGroup.style.display !== ''){
        pointGroup.style.display = '';
      }
    } else {
      const pointGroup = geometryLayer.querySelector('g.surface-points');
      if(pointGroup){
        pointGroup.style.display = 'none';
      }
    }
    let title = svg.querySelector('text[data-graph-title]');
    const titleBaseY = Math.max(fs, margin.top * 0.55);
    const titleBaseX = margin.left + plotWidth / 2;
    const titlePos = state.labelPositions?.title;
    const hasTitlePos = Number.isFinite(titlePos?.x) && Number.isFinite(titlePos?.y);
    const applySurfaceTitle = value => {
      const trimmed = value != null ? String(value).trim() : '';
      const resolved = trimmed || 'Surface Plot';
      patchSurfaceVisualState(drawSession, {
        labels: { ...state.labels, title: resolved }
      }, { reason: 'surface-title-edit' });
      if(title && title.textContent !== resolved){
        title.textContent = resolved;
      }
      scheduleSurfaceDrawForSession(drawSession, { reason: 'surface-title-edit' });
      return resolved;
    };
    if(!title){
      title = doc.createElementNS(NS, 'text');
      
      // Convert relative positions to absolute if needed
      let absoluteTitleX = titleBaseX;
      let absoluteTitleY = titleBaseY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin.left + titlePos.relX * plotWidth;
          absoluteTitleY = margin.top + titlePos.relY * plotHeight;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }
      
      title.setAttribute('x', absoluteTitleX);
      title.setAttribute('y', absoluteTitleY);
      title.setAttribute('text-anchor', 'middle');
      title.setAttribute('font-size', fs);
      title.setAttribute('fill', surfaceTextColor);
      title.textContent = state.labels.title;
      markFontEditable(title, 'graphTitle', 'graphTitle');
      makeEditableHelper(title, text => {
        const previous = state.labels.title || 'Surface Plot';
        const nextValue = applySurfaceTitle(text);
        if(previous === nextValue){ return; }
        recordSurfaceChange('surface:title', previous, nextValue, val => { applySurfaceTitle(val); return true; });
      }, { scopeId: 'surface', key: 'graphTitle' });
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(title, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions
            const relX = (pos.x - margin.left) / plotWidth;
            const relY = (pos.y - margin.top) / plotHeight;
            patchSurfaceLabelPosition(drawSession, 'title', { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            }, { reason: 'surface-title-position' });
            debugLog('Debug: surface title position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      if(typeof plot3d.applyLegendPointerGuards === 'function'){
        plot3d.applyLegendPointerGuards(title, { label: 'surface-title' });
      }
      title.setAttribute('data-graph-title', '1');
      svg.appendChild(title);
    } else {
      // update position/size and text only
      
      // Convert relative positions to absolute if needed for update
      let absoluteTitleX = titleBaseX;
      let absoluteTitleY = titleBaseY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin.left + titlePos.relX * plotWidth;
          absoluteTitleY = margin.top + titlePos.relY * plotHeight;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }
      
      try{ title.setAttribute('x', absoluteTitleX); }catch(e){}
      try{ title.setAttribute('y', absoluteTitleY); }catch(e){}
      try{ title.setAttribute('font-size', fs); }catch(e){}
      try{ title.setAttribute('fill', surfaceTextColor); }catch(e){}
      if(title.textContent !== state.labels.title){ title.textContent = state.labels.title; }
      applySavedFontStyle(title);
    }
    if(!hasTitlePos && axisLabelBounds.length && typeof title.getBBox === 'function'){
      try {
        const padding = Math.max(fs * 0.45, 10);
        const minAxisTop = axisLabelBounds.reduce((min, bounds) => (
          Number.isFinite(bounds?.y) ? Math.min(min, bounds.y) : min
        ), Number.POSITIVE_INFINITY);
        if(Number.isFinite(minAxisTop)){
          let titleBox = title.getBBox();
          const desiredBottom = minAxisTop - padding;
          if(Number.isFinite(desiredBottom)){
            const currentBottom = titleBox.y + titleBox.height;
            if(currentBottom > desiredBottom){
              const baseY = Number(title.getAttribute('y')) || titleBaseY;
              const shift = desiredBottom - currentBottom;
              const minTitleY = Math.max(fs * 0.5, 0);
              const nextY = Math.max(minTitleY, baseY + shift);
              title.setAttribute('y', nextY);
              titleBox = title.getBBox();
              const adjustedBottom = titleBox.y + titleBox.height;
              if(adjustedBottom > desiredBottom){
                const correction = desiredBottom - adjustedBottom;
                const correctedY = Math.max(minTitleY, nextY + correction);
                if(correctedY !== nextY){
                  title.setAttribute('y', correctedY);
                  titleBox = title.getBBox();
                }
              }
              debugLog('Debug: surface title vertical adjusted', {
                previousY: baseY,
                adjustedY: Number(title.getAttribute('y')) || baseY,
                desiredBottom,
                padding,
                minAxisTop
              });
            }
          }
        }
      } catch(err){
        debugLog('Debug: surface title bbox adjust error', {
          message: err?.message || String(err)
        });
      }
    }
    if(canShowLegend){
      const legendPosition = state.labelPositions.legend || null;
      renderLegend(svg, {
        min: parsed.stats.zMin,
        max: parsed.stats.zMax,
        colorRamp: state.settings.colorRamp,
        width,
        height,
        margin,
        fontSize: fs,
        legendFontSize: surfaceLegendTickFontSize,
        layer: axisLayer,
        textColor: surfaceTextColor,
        axisColor: state.settings.axisColor,
        position: legendPosition
      });
    }else{
      removeLegend(svg);
    }
    registerSurfaceGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
    ensureSurfaceGraphViewport(svg, {
      padding: Math.max(fs, 18),
      debugLabel: 'surface-3d-graph',
      baseViewport: { width, height }
    });
    updateStats(parsed.stats);
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncSurfaceAutoDrawNoticeWidth('draw');
    captureSurfaceSessionStateFromActive(projectedSurfaceSession, { reason: 'surface-draw-complete' });
    debugLog('Debug: surface draw complete', {
      mode: effectiveMode,
      points: parsed.points.length,
      faces: parsed.faces.length
    });
    return true;
  }

  surface.draw = function drawSurfacePublic(options = {}){
    const nextReason = options?.reason || 'surface-draw';
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('surface', { ...(options || {}), tabId: options?.tabId || getSurfaceProjectionTabId() || null, reason: nextReason })){
      debugLog('Debug: surface draw suppressed by lifecycle', { reason: nextReason, tabId: options?.tabId || getSurfaceProjectionTabId() || null });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'surface', tabId: options?.tabId || getSurfaceProjectionTabId() || null, action: 'draw-suppressed', reason: nextReason, details: { source: 'surface.draw' } });
      return;
    }
    Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'surface', tabId: options?.tabId || getSurfaceProjectionTabId() || null, action: 'draw-executed', reason: nextReason, details: { source: 'surface.draw' } });
    const drawSession = getSurfaceSessionForDrawOptions(options, { reason: nextReason });
    if(drawSession && !isSurfaceSessionActiveOrActivating(drawSession)){
      drawSession.state.drawPending = true;
      drawSession.updatedAt = Date.now();
      return;
    }
    runSurfaceDrawCycle({ ...(options || {}), tabId: drawSession?.tabId || options?.tabId || undefined, reason: nextReason });
  };
  surface.cancelCurrentDraw = function cancelCurrentDraw(meta = {}){
    const tabId = meta?.tabId || getSurfaceProjectionTabId() || null;
    try{ surface.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'surface-draw-cancel'); }catch(_err){}
    resolveSurfaceOverlay(meta?.reason || 'cancelled', { tabId });
    Shared.componentLifecycle?.emitLifecycleEvent?.({
      componentKey: 'surface',
      tabId,
      action: 'draw-cancelled',
      reason: meta?.reason || 'surface-draw-cancel'
    });
    return true;
  };

  function initNotes(){
    const stack = querySurfaceRoot('#surfaceGraphPanel .surface-plot-stack')
      || querySurfaceRoot('#surfaceGraphPanel .diagram-area');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: surface notes mount skipped (missing stack)');
      }
      return;
    }
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'surface',
      ownerTabId: getSurfaceProjectionTabId() || null,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'surface-notes',
      scopeId: 'surface',
      fontKey: 'notes',
      canUseControl: canUseSurfaceNotesControl,
      unavailableMessage: 'surface notes helper unavailable',
      applyToControl: control => {
        control.setValue(notesState.text || '');
        control.setOpen(!!notesState.open);
      },
      onChange: value => {
        notesState.text = value == null ? '' : String(value);
        const session = getActiveSurfaceSessionForState();
        if(session){
          session.notes.text = notesState.text;
          session.state.notes = createDefaultSurfaceNotesState(notesState);
          session.updatedAt = Date.now();
        }
      },
      onToggle: open => {
        notesState.open = !!open;
        const session = getActiveSurfaceSessionForState();
        if(session){
          session.notes.open = notesState.open;
          session.state.notes = createDefaultSurfaceNotesState(notesState);
          session.updatedAt = Date.now();
        }
      }
    }) || notesState.control || null;
  }

  surface.init = function init(options = {}){
    const targetTabId = options?.tabId || getSurfaceProjectionTabId() || null;
    const targetRoot = options?.root || resolveSurfaceRoot(targetTabId || null) || null;
    if(surface.ready && (!targetTabId || surface.__boundTabId === targetTabId) && (!targetRoot || state.root === targetRoot)){
      bindSurfaceSessionForTab(targetTabId || null, { root: targetRoot || state.root || null, reason: options?.reason || 'surface-init-same-tab' }, { apply: false });
      syncSurfaceSessionRefsFromActive();
      syncSurfaceSessionManagersFromActive();
      debugLog('Debug: surface.init skipped', { reason: 'ready', tabId: getSurfaceProjectionTabId() || null });
      return;
    }
    if(surface.ready){
      debugLog('Debug: surface.init rebinding', { previousTabId: getSurfaceProjectionTabId() || null, targetTabId, reason: options?.reason || 'init' });
      surface.ready = false;
    }
    surface.__boundTabId = targetTabId || null;
    state.root = targetRoot || resolveSurfaceRoot(targetTabId || null);
    bindSurfaceSessionForTab(targetTabId || null, { root: state.root || null, reason: options?.reason || 'surface-init' }, { apply: true, syncUi: false });
    cacheDom();
    state.scheduleDraw = () => {};
    if(state.renderButton){
      attachListener(state.renderButton, 'click', () => {
        debugLog('Debug: surface manual render button');
        const overlayReason = 'manual-render';
        markSurfaceOverlayPending(overlayReason);
        forceSurfaceOverlay(overlayReason, { message: 'Rendering surface plot...' });
        scheduleActiveSurfaceDraw({ force: true, reason: overlayReason });
      });
    }
    state.layout = componentLayout && typeof componentLayout.createStandardPanels === 'function'
      ? componentLayout.createStandardPanels({
        componentName: 'surface',
        tabId: targetTabId || undefined,
        root: state.root || undefined,
        reason: options?.reason || 'surface-init',
        selectors: {
          tablePanel: '#surfaceTablePanel',
          graphPanel: '#surfaceGraphPanel',
        panelResizer: '#surfacePanelResizer',
        hotWrapper: '#surfaceHotWrapper',
        hotContainer: '#surfaceHot',
        svgBox: () => querySurfaceRoot('#surfaceGraphPanel .svgbox'),
        resizeTarget: () => querySurfaceRoot('#surfaceGraphPanel .svgbox')
      },
        scheduleDraw: options => scheduleActiveSurfaceDraw(options && typeof options === 'object' ? options : {}),
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onAfterSync: () => {
          syncSurfaceAutoDrawNoticeWidth('panel-sync');
          syncSurfaceAspectControls('panel-sync');
        },
        resizableBoxOptions: {
          onResize: phase => {
            const resizePhase = typeof phase === 'string' ? phase : '';
            debugLog('Debug: surface layout onResize schedule trigger', { phase: resizePhase || null });
            scheduleSurfaceNoticeWidth('resize');
            scheduleSurfaceViewRefresh('resize', {
              force: true,
              silentOverlay: true,
              resizePhase: resizePhase || null
            });
          }
        }
      })
      : null;
    if(state.layout && typeof state.layout.setScheduleDraw === 'function'){
      state.layout.setScheduleDraw(options => scheduleActiveSurfaceDraw(options && typeof options === 'object' ? options : {}));
    }
    if(state.layout && state.layout.elements && state.layout.elements.svgBox){
      state.svgBox = state.layout.elements.svgBox;
    }
    if(state.layout && typeof state.layout.syncPanels === 'function'){
      state.layout.syncPanels();
    }
    syncSurfaceAspectControls('init-layout');
    cacheDom();
    scheduleSurfaceNoticeWidth('init');
    initHot();
    initControls();
    initNotes();
    applySurfaceSessionStateToActive(projectedSurfaceSession, { syncUi: true, restoreEmptyPayload: false });
    if(!surfaceAutoDrawManager && Shared.hot?.createAutoDrawManager){
      surfaceAutoDrawManager = Shared.hot.createAutoDrawManager({
        component: 'surface',
        state,
        thresholds: {
          rows: SURFACE_AUTO_DRAW_ROW_THRESHOLD,
          cols: SURFACE_AUTO_DRAW_COL_THRESHOLD,
          cells: SURFACE_AUTO_DRAW_CELL_THRESHOLD
        },
        getHot: () => state.hot,
        elements: {
          renderRow: () => state.renderRow,
          renderButton: () => state.renderButton,
          notice: () => state.autoDrawNotice
        },
        debugLog
      });
    }
    const scheduleSurfaceDrawBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(surface, 'surface', runSurfaceDrawCycle, { reason: 'surface-draw-frame' })
      : runSurfaceDrawCycle;
    const scheduleSurfaceDrawInstrumented = (opts) => {
      const sourceOpts = opts && typeof opts === 'object' ? opts : {};
      const overlayReason = sourceOpts.reason || (sourceOpts.force ? 'manual-render' : 'schedule');
      const ownerSession = getSurfaceSessionForDrawOptions(sourceOpts, { reason: overlayReason, create: false });
      const nextOpts = Shared.componentLifecycle?.sanitizeDrawOptions
        ? Shared.componentLifecycle.sanitizeDrawOptions(sourceOpts, { tabId: ownerSession?.tabId || sourceOpts.tabId || getSurfaceProjectionTabId() || null, reason: overlayReason })
        : { ...sourceOpts, tabId: ownerSession?.tabId || sourceOpts.tabId || undefined, reason: overlayReason };
      if(ownerSession?.timers){
        ownerSession.timers.pendingDrawOptions = nextOpts;
        ownerSession.updatedAt = Date.now();
      }
      const suppressOverlay = nextOpts.viewOnly === true || nextOpts.silentOverlay === true;
      if(nextOpts.force && !suppressOverlay){
        markSurfaceOverlayPending(overlayReason);
        forceSurfaceOverlay(overlayReason, { message: 'Rendering surface plot...' });
      }else if(!suppressOverlay){
        queueSurfaceOverlay(overlayReason);
      }
      const runSchedule = () => scheduleSurfaceDrawBase(nextOpts);
      if(Shared.componentLifecycle?.runDrawWithOverlayPaintGate?.({
        component: surface,
        componentKey: 'surface',
        options: nextOpts,
        tabId: nextOpts.tabId || getSurfaceProjectionTabId() || null,
        reason: overlayReason,
        overlayController: surfaceOverlayController,
        delayForOverlay: !suppressOverlay,
        debugLog,
        run: runSchedule
      })){
        return;
      }
      runSchedule();
    };
    scheduleDrawSurfaceRaw = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'surface',
          debugLabel: 'surface',
          getTabId: () => getSurfaceProjectionTabId() || null,
          scheduleRaw: scheduleSurfaceDrawInstrumented
        })
      : scheduleSurfaceDrawInstrumented;
    if(surfaceAutoDrawManager){
      surfaceAutoDrawManager.setScheduleRaw(scheduleDrawSurfaceRaw);
      surfaceAutoDrawManager.setElements({
        renderRow: state.renderRow,
        renderButton: state.renderButton,
        notice: state.autoDrawNotice
      });
      state.scheduleDraw = (opts) => surfaceAutoDrawManager.schedule(opts);
      surfaceAutoDrawManager.updateUi();
      surfaceAutoDrawManager.evaluateThresholds();
      syncSurfaceAutoDrawNoticeWidth('auto-draw-init');
    }else{
      state.scheduleDraw = scheduleDrawSurfaceRaw;
    }
    if(state.layout && typeof state.layout.setScheduleDraw === 'function'){
      state.layout.setScheduleDraw(options => scheduleActiveSurfaceDraw(options && typeof options === 'object' ? options : {}));
    }
    ensureSurfaceFontEventListener();
    if(state.layout && typeof state.layout.syncPanels === 'function'){
      state.layout.syncPanels();
    }
    syncSurfaceAutoDrawNoticeWidth('panel-resync');
    updateAxisOptions();
    ensureEmptyPayloadTemplate();
    syncSurfaceSessionRefsFromActive();
    syncSurfaceSessionManagersFromActive();
    surface.__domSentinel = getSurfaceNodeById('surfaceHot');
    surface.ready = true;
    scheduleActiveSurfaceDraw({ reason: options?.reason || 'surface-init-complete' });
  };

  surface.ensure = function ensure(options = {}){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings === 'function'){
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'surface',
        tabLike: options.tab || options.tabId || null,
        meta: options,
        sentinelSelector: '#surfaceHot',
        getCurrentRoot: () => state.root || null,
        getCurrentSentinel: () => surface.__domSentinel || null,
        rebind: (info) => {
          const nextTabId = info?.tab?.id || info?.tabId || options.tabId || (options.tab && typeof options.tab === 'object' ? options.tab.id : options.tab) || null;
          state.root = info?.root || resolveSurfaceRoot(info?.tab || nextTabId || null) || state.root || null;
          if(options?.liveDomFastPath === true || options?.liveDomReuse === true || options?.passiveControls === true){
            surface.__boundTabId = nextTabId || getSurfaceProjectionTabId() || null;
            bindSurfaceSessionForTab(info?.tab || nextTabId || null, { ...(options || {}), root: state.root || null, reason: options.reason || 'surface-passive-dom-rebind' }, { apply: true, syncUi: false });
            syncSurfaceSessionRefsFromActive();
            syncSurfaceSessionManagersFromActive();
            surface.__domSentinel = info?.mountedSentinel || getSurfaceNodeById('surfaceHot');
            surface.ready = true;
            debugLog('Debug: surface passive DOM rebind', { tabId: getSurfaceProjectionTabId() || null });
            return;
          }
          surface.ready = false;
          surface.init({ root: state.root || undefined, tabId: nextTabId || null, reason: 'workspace-dom-rebind' });
        }
      });
      if(rebound?.rebound){
        return;
      }
    }
    if(!surface.ready){ surface.init({ ...options, tabId: options.tabId || options.tab?.id || surface.__boundTabId || undefined, reason: options.reason || 'ensure' }); }
  };
  function resetSurfaceHotViewportToTop(hotInstance){
    const hot = hotInstance || null;
    if(!hot){
      return;
    }
    try{
      if(typeof hot.gridApi?.ensureIndexVisible === 'function'){
        hot.gridApi.ensureIndexVisible(0, 'top');
      }
    }catch(err){
      debugLog('Debug: surface viewport reset ensureIndexVisible failed', { message: err?.message || String(err) });
    }
    try{
      const host = hot.__surfaceHostContainer || getSurfaceNodeById('surfaceHot');
      const viewport = host?.querySelector?.('.ag-body-vertical-scroll-viewport') || null;
      if(viewport && typeof viewport.scrollTop === 'number'){
        viewport.scrollTop = 0;
      }
    }catch(err){
      debugLog('Debug: surface viewport reset scrollTop failed', { message: err?.message || String(err) });
    }
  }
  function isSurfaceRuntimeFreshForTab(tabLike){
    const record = Shared.workspaceTabs?.getSessionRecord?.(tabLike || getSurfaceProjectionTabId() || null, 'surface') || null;
    const runtime = record?.runtime;
    if(!runtime || typeof runtime !== 'object'){
      return true;
    }
    return Object.keys(runtime).length === 0;
  }
  function syncSurfaceActivationState(tabLike = null, meta = {}){
    bindSurfaceSessionForTab(tabLike || getSurfaceProjectionTabId() || null, { reason: 'surface-activate-sync', root: resolveSurfaceRoot(tabLike || getSurfaceProjectionTabId() || null) || state.root || null }, { apply: true, syncUi: true });
    if(state.layout && typeof state.layout.syncPanels === 'function'){
      state.layout.syncPanels({ skipSchedule: true });
      syncSurfaceAutoDrawNoticeWidth('activate-tab');
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      const hot = state.ensureHotForActiveTab();
      if(hot){
        ensureSurfaceDataViewsForHot(hot, {
          wrapper: getSurfaceNodeById('surfaceHotWrapper'),
          container: hot.__surfaceHostContainer || getSurfaceNodeById('surfaceHot')
        });
        syncSurfaceActiveDataViewFromHot(hot, 'activate-tab');
        if(isSurfaceRuntimeFreshForTab(tabLike) && tabLike?.loadedFromArchive !== true){
          resetSurfaceHotViewportToTop(hot);
        }
      }
    }
    if(tabLike?.uiState?.component && typeof surface.applyUiState === 'function'){
      try{
        surface.applyUiState(tabLike.uiState.component, {
          ...(meta || {}),
          tabId: (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || meta?.tabId || getSurfaceProjectionTabId() || null,
          componentKey: 'surface',
          reason: 'activate-tab-final-ui-state'
        });
      }catch(err){
        debugLog('Debug: surface activateTab final uiState apply failed', { message: err?.message || String(err) });
      }
    }
    cacheDom();
    bindActiveSurface3dRotationControls('surface-activate');
    syncSurfaceSessionRefsFromActive();
    syncSurfaceSessionManagersFromActive();
    surface.__domSentinel = getSurfaceNodeById('surfaceHot');
  }

  surface.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: surface,
    componentKey: 'surface',
    resolveRoot: tabLike => resolveSurfaceRoot(tabLike || null) || state.root || null,
    setRoot: root => { state.root = root || state.root || null; },
    ensureBindings: (tabLike, meta = {}) => {
      if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
        return false;
      }
      const targetTabId = (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || meta?.tabId || null;
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'surface',
        tabLike: tabLike || null,
        meta,
        sentinelSelector: '#surfaceHot',
        getCurrentRoot: () => state.root || null,
        getCurrentSentinel: () => surface.__domSentinel || null,
        rebind: (info) => {
          const nextTabId = info?.tab?.id || info?.tabId || targetTabId || getSurfaceProjectionTabId() || null;
          state.root = info?.root || resolveSurfaceRoot(tabLike || nextTabId || null) || state.root || null;
          if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
            surface.__boundTabId = nextTabId || getSurfaceProjectionTabId() || null;
            bindSurfaceSessionForTab(tabLike || nextTabId || null, { ...(meta || {}), root: state.root || null, reason: meta?.reason || 'surface-passive-dom-rebind' }, { apply: true, syncUi: false });
            syncSurfaceSessionRefsFromActive();
            syncSurfaceSessionManagersFromActive();
            surface.__domSentinel = info?.mountedSentinel || getSurfaceNodeById('surfaceHot');
            surface.ready = true;
            debugLog('Debug: surface passive DOM rebind', { tabId: getSurfaceProjectionTabId() || null });
            return;
          }
          surface.ready = false;
          surface.init({ root: state.root || undefined, tabId: nextTabId, reason: 'activate-tab-rebind' });
        }
      });
      return !!rebound?.rebound;
    },
    init: options => surface.init(options),
    afterReady: (tabLike, meta = {}) => {
      if(!surface.ready){
        return;
      }
      bindSurfaceSessionForTab(tabLike || meta?.tabId || null, { ...(meta || {}), root: resolveSurfaceRoot(tabLike || meta?.tabId || null) || state.root || null, reason: meta?.reason || 'surface-activate-session-bind' }, { apply: true, syncUi: true });
      applyExistingSurfaceOwnedRuntimeRecord(tabLike || meta?.tabId || null, { ...(meta || {}), reason: meta?.reason || 'surface-activate-apply-owned-runtime' });
      syncSurfaceActivationState(tabLike || meta?.tabId || null, meta);
    },
    getSentinel: () => getSurfaceNodeById('surfaceHot')
  }) || function activateTab(tab, meta = {}){
    const targetTabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
    surface.__boundTabId = targetTabId || getSurfaceProjectionTabId() || null;
    state.root = resolveSurfaceRoot(tab || targetTabId || null);
    bindSurfaceSessionForTab(tab || targetTabId || null, { ...(meta || {}), root: state.root || null, reason: meta?.reason || 'surface-activate-tab' }, { apply: true, syncUi: true });
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings === 'function'){
      const rebound = Shared.workspaceTabs.ensureActiveDomBindings({
        componentKey: 'surface',
        tabLike: tab || null,
        meta,
        sentinelSelector: '#surfaceHot',
        getCurrentRoot: () => state.root || null,
        getCurrentSentinel: () => surface.__domSentinel || null,
        rebind: (info) => {
          const nextTabId = info?.tab?.id || info?.tabId || targetTabId || getSurfaceProjectionTabId() || null;
          state.root = info?.root || resolveSurfaceRoot(tab || nextTabId || null) || state.root || null;
          if(meta?.liveDomFastPath === true || meta?.liveDomReuse === true || meta?.passiveControls === true){
            surface.__boundTabId = nextTabId || getSurfaceProjectionTabId() || null;
            bindSurfaceSessionForTab(tab || nextTabId || null, { ...(meta || {}), root: state.root || null, reason: meta?.reason || 'surface-passive-dom-rebind' }, { apply: true, syncUi: false });
            syncSurfaceSessionRefsFromActive();
            syncSurfaceSessionManagersFromActive();
            surface.__domSentinel = info?.mountedSentinel || getSurfaceNodeById('surfaceHot');
            surface.ready = true;
            debugLog('Debug: surface passive DOM rebind', { tabId: getSurfaceProjectionTabId() || null });
            return;
          }
          surface.ready = false;
          surface.init({ root: state.root || undefined, tabId: nextTabId, reason: 'activate-tab-rebind' });
        }
      });
      if(rebound?.rebound){
        return;
      }
    }
    if(!surface.ready){
      surface.init({ root: state.root || undefined, tabId: targetTabId || surface.__boundTabId || undefined, reason: meta?.reason || 'activate-tab' });
    }
    syncSurfaceActivationState(tab || targetTabId || null, meta);
  };
  surface.__getActiveHot = function __getActiveHot(){
    return (typeof state.ensureHotForActiveTab === 'function' ? state.ensureHotForActiveTab() : null) || state.hot || null;
  };

  surface.captureRuntimeState = function captureRuntimeState(meta = {}){
    const session = bindSurfaceSessionForTab(meta?.tab || meta?.tabId || getSurfaceProjectionTabId() || null, { ...(meta || {}), reason: meta.reason || 'surface-runtime-capture-bind' }, { apply: false });
    const capturedSession = captureSurfaceSessionStateFromActive(session, meta);
    const snapshot = capturedSession
      ? Object.assign({}, capturedSession.state, {
        lastStats: cloneSimple(capturedSession.results?.lastStats) || null,
        statsPanelModel: normalizeSurfaceStatsPanelModel(capturedSession.results?.statsPanelModel || capturedSession.state?.statsPanelModel || {}),
        fileHandle: capturedSession.managers?.fileHandle || null,
        notes: createDefaultSurfaceNotesState(capturedSession.notes || capturedSession.state?.notes || {})
      })
      : buildSurfaceTabContextSnapshotFromState();
    rememberSurfaceOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, snapshot, {
      ...(meta || {}),
      reason: meta.reason || 'surface-runtime-capture'
    });
    return Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(surface, snapshot, {
      ...(meta || {}),
      reason: meta.reason || 'surface-runtime-capture'
    }) || snapshot;
  };

  surface.applyRuntimeState = function applyRuntimeState(snapshot, meta = {}){
    const resolvedSnapshot = resolveSurfaceOwnedRuntimeSnapshot(snapshot, meta)
      || Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(surface, snapshot, meta)
      || snapshot;
    if(!resolvedSnapshot || typeof resolvedSnapshot !== 'object'){
      return false;
    }
    const session = setSurfaceSessionStateFromRuntimeRecord(resolvedSnapshot, meta);
    if(session){
      projectedSurfaceSession = session;
      applySurfaceSessionStateToActive(session, { syncUi: true });
    }else{
      applySurfaceTabContextSnapshot(resolvedSnapshot, { syncUi: true });
    }
    rememberSurfaceOwnedRuntimeRecord(meta?.tab || meta?.tabId || null, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'surface-runtime-apply'
    });
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(surface, resolvedSnapshot, {
      ...(meta || {}),
      reason: meta.reason || 'surface-runtime-apply'
    });
    bindActiveSurface3dRotationControls('surface-runtime-apply');
    return true;
  };

  surface.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: surface,
    componentKey: 'surface',
    cancel: (tab, meta = {}) => {
      captureSurfaceSessionForDeactivation(tab, meta);
      state.drawPending = false;
    }
  }) || function deactivateSurfaceTab(tab, meta = {}){
    captureSurfaceSessionForDeactivation(tab, meta);
    state.drawPending = false;
    surface.__runtimeGeneration = (Number(surface.__runtimeGeneration) || 0) + 1;
    debugLog('Debug: surface tab deactivated', {
      tabId: (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null,
      generation: surface.__runtimeGeneration,
      reason: meta?.reason || 'deactivate-tab'
    });
    return true;
  };

  function applySurfacePayload(payload, meta){
    const source = meta?.source || 'unknown';
    if(!payload || payload.type !== 'surface'){
      debugLog('Debug: surface payload rejected', { source, hasType: !!payload?.type });
      return false;
    }
    const skipDraw = meta?.skipDraw === true;
    const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
    const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
    const scheduleTargetTab = meta?.tab || meta?.tabId || getSurfaceProjectionTabId() || null;
    const hasExplicitScheduleTarget = !!(meta?.tab || meta?.tabId);
    const scheduleTargetSession = scheduleTargetTab
      ? getSurfaceSession(scheduleTargetTab, { ...(meta || {}), reason: 'surface-payload-scheduler-owner' }, { create: false, fallbackActive: false })
      : getActiveSurfaceSessionForState();
    const canMuteActiveScheduler = hasExplicitScheduleTarget
      ? !!(scheduleTargetSession && isSurfaceSessionActiveOrActivating(scheduleTargetSession))
      : (!scheduleTargetSession || isSurfaceSessionActiveOrActivating(scheduleTargetSession));
    let scheduleBackup = null;
    let mutedScheduleDraw = null;
    if(skipDraw && canMuteActiveScheduler && typeof state.scheduleDraw === 'function'){
      mutedScheduleDraw = () => {};
      scheduleBackup = state.scheduleDraw;
      state.scheduleDraw = mutedScheduleDraw;
    }
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    if(hot){
      state.hot = hot;
    }
    const rawDataMatrix = Array.isArray(payload.data) ? payload.data : [];
    const serializedViews = (payload.dataViews && typeof payload.dataViews === 'object') ? payload.dataViews : null;
    const requestedActiveViewId = payload.activeDataViewId || serializedViews?.activeViewId || null;
    const dataManager = state.hot
      ? ensureSurfaceDataViewsForHot(state.hot, {
          wrapper: getSurfaceNodeById('surfaceHotWrapper'),
          container: state.hot.__surfaceHostContainer || getSurfaceNodeById('surfaceHot')
        })
      : null;
    if(dataManager){
      if(serializedViews){
        dataManager.deserialize(serializedViews, {
          fallbackData: rawDataMatrix,
          activeViewId: requestedActiveViewId,
          silent: true,
          activate: false
        });
      }else{
        dataManager.initialize(rawDataMatrix, { rawTitle: 'Raw' });
      }
    }
    const matrixData = dataManager?.getActiveView?.()?.data;
    const dataToLoad = Array.isArray(matrixData) ? matrixData : rawDataMatrix;
    const exclusionsToApply = payload.exclusions || dataManager?.getActiveView?.()?.exclusions || null;
    const filtersToApply = payload.filters || dataManager?.getActiveView?.()?.filters || null;
    if(!skipDataLoad && state.hot && typeof state.hot.loadData === 'function'){
      state.hot.loadData(dataToLoad);
      if(exclusionsToApply && typeof state.hot.applyExclusions === 'function'){
        state.hot.applyExclusions(exclusionsToApply);
      }
      if(filtersToApply && typeof state.hot.applyFilters === 'function'){
        state.hot.applyFilters(filtersToApply, { schedule: false });
      }
      syncSurfaceActiveDataViewFromHot(state.hot, 'payload-load');
    }
    const config = payload.config || {};
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
    if(canUseSurfaceNotesControl(notesState.control)){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    if(config.axisMap && typeof config.axisMap === 'object'){
      state.axisMap = Object.assign({}, state.axisMap, config.axisMap);
    }
    if(config.settings && typeof config.settings === 'object'){
      state.settings = Object.assign({}, state.settings, config.settings);
    }
    if(typeof config.colorScheme === 'string' && config.colorScheme.trim()){
      state.settings.colorScheme = config.colorScheme.trim().toLowerCase();
    }
    if(typeof config.textColor === 'string' && config.textColor.trim()){
      state.settings.textColor = config.textColor.trim();
    }
    if(typeof config.backgroundColor === 'string' && config.backgroundColor.trim()){
      state.settings.backgroundColor = config.backgroundColor.trim();
    }
    setGridStyle(config.gridStyle, config.settings?.axisStroke ?? state.settings?.axisStroke);
    if(config.labels && typeof config.labels === 'object'){
      state.labels = Object.assign({}, state.labels, config.labels);
    }
    state.labelPositions = normalizeSurfaceLabelPositions(config.labelPositions, config.legendPosition);
    ensureHeaderRowFromConfig(config);
    if(config.rotation && typeof plot3d.createRotationState === 'function'){
      const restored = plot3d.createRotationState(config.rotation);
      state.rotation.x = restored.x;
      state.rotation.y = restored.y;
      state.rotation.z = restored.z;
      state.rotation.quaternion = restored.quaternion ? {
        w: restored.quaternion.w,
        x: restored.quaternion.x,
        y: restored.quaternion.y,
        z: restored.quaternion.z
      } : state.rotation.quaternion;
      commitSurfaceRotationState(state.rotation, 'surface-payload-apply');
    }
    if(config.fontStyles){
      importFontStyles('surface', config.fontStyles);
    }
    applySettingsToControls();
    updateAxisOptions();
    state.lastStats = (payload.stats && typeof payload.stats === 'object')
      ? (cloneSimple(payload.stats) || payload.stats)
      : null;
    state.statsPanelModel = normalizeSurfaceStatsPanelModel(config.statsPanelModel || payload.stats?.statsPanelModel || {});
    if(!skipDraw){
      if(state.lastStats){
        updateStats(state.lastStats);
      }else{
        restoreSurfaceStatsPanelModel(state.statsPanelModel);
      }
      scheduleActiveSurfaceDraw({ reason: 'surface-payload-applied' });
    }
    if(scheduleBackup && state.scheduleDraw === mutedScheduleDraw){
      state.scheduleDraw = scheduleBackup;
    }
    const rowCount = Array.isArray(dataToLoad) ? dataToLoad.length : 0;
    captureSurfaceSessionStateFromActive(projectedSurfaceSession, { reason: 'surface-payload-apply', source });
    debugLog('Debug: surface payload applied', { source, rows: rowCount });
    return true;
  }

  function getPayload(){
    const activeHot = state.ensureHotForActiveTab?.() || state.hot;
    if(!activeHot || typeof activeHot.getData !== 'function'){
      return { type: 'surface', data: [] };
    }
    const notesSnapshot = captureSurfaceNotesSnapshot();
    const notesText = notesSnapshot.text || '';
    const notesOpen = !!notesSnapshot.open;
    const statsPanelModel = captureSurfaceStatsPanelModel();
    const savedStats = state.lastStats ? (cloneSimple(state.lastStats) || state.lastStats) : null;
    if(savedStats && typeof savedStats === 'object'){
      savedStats.statsPanelModel = statsPanelModel;
    }
    const payload = {
      type: 'surface',
      data: Shared.hot.trimTrailingEmptyCols(activeHot.getData()),
      exclusions: activeHot.exportExclusions ? activeHot.exportExclusions() : (Shared.hot && typeof Shared.hot.exportExclusions === 'function' ? Shared.hot.exportExclusions(activeHot) : undefined),
      filters: activeHot.exportFilters ? activeHot.exportFilters() : (Shared.hot && typeof Shared.hot.exportFilters === 'function' ? Shared.hot.exportFilters(activeHot) : undefined),
      stats: savedStats,
      config: {
        axisMap: Object.assign({}, state.axisMap),
        colorScheme: state.settings?.colorScheme || 'scientific',
        textColor: state.settings?.textColor || (chartStyle.TEXT_COLOR || '#1f2a3d'),
        backgroundColor: state.settings?.backgroundColor || '#ffffff',
        settings: Object.assign({}, state.settings),
        gridStyle: getGridStyle(state.settings?.axisStroke),
        labels: Object.assign({}, state.labels),
        labelPositions: {
          title: state.labelPositions?.title ? { x: state.labelPositions.title.x, y: state.labelPositions.title.y } : null,
          legend: state.labelPositions?.legend ? {
            x: state.labelPositions.legend.x,
            y: state.labelPositions.legend.y,
            relX: state.labelPositions.legend.relX,
            relY: state.labelPositions.legend.relY
          } : null
        },
        rotation: {
          x: state.rotation.x,
          y: state.rotation.y,
          z: state.rotation.z,
          quaternion: state.rotation.quaternion ? {
            w: state.rotation.quaternion.w,
            x: state.rotation.quaternion.x,
            y: state.rotation.quaternion.y,
            z: state.rotation.quaternion.z
          } : null
        },
        fontStyles: exportFontStyles ? exportFontStyles('surface') : undefined,
        notes: {
          text: notesText,
          open: notesOpen
        },
        statsPanelModel
      }
    };
    const activeManager = ensureSurfaceDataViewsForHot(activeHot, {
        wrapper: getSurfaceNodeById('surfaceHotWrapper'),
        container: activeHot.__surfaceHostContainer || getSurfaceNodeById('surfaceHot')
    });
    syncSurfaceActiveDataViewFromHot(activeHot, 'payload');
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    if(includeDataViews){
      payload.dataViews = dataViewsPayload;
      payload.activeDataViewId = dataViewsPayload?.activeViewId || null;
    }
    captureSurfaceSessionStateFromActive(projectedSurfaceSession, { reason: 'surface-payload-capture' });
    debugLog('Debug: surface payload captured', { rows: payload.data.length });
    return payload;
  }

  surface.getPayload = getPayload;
  {
    const tableUiHooks = Shared.hot?.makeTableUiStateHooks?.(
      () => state.hot || null,
      'surface'
    );
    surface.captureUiState = tableUiHooks ? tableUiHooks.capture : () => null;
    surface.applyUiState = tableUiHooks ? tableUiHooks.apply : () => false;
  }
  surface.captureEmptyPayloadTemplate = function captureSurfaceEmptyPayloadTemplate(){
    const snapshot = surface.createEmptyPayload();
    emptyPayloadTemplate = cloneSimple(snapshot) || snapshot;
    const session = getActiveSurfaceSessionForState();
    if(session?.cache){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || emptyPayloadTemplate;
      session.updatedAt = Date.now();
    }
    console.debug('Debug: surface empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  surface.restoreEmptyPayloadTemplate = function restoreSurfaceEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: surface empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    const session = getActiveSurfaceSessionForState();
    if(session){
      session.cache.emptyPayloadTemplate = cloneSimple(emptyPayloadTemplate) || null;
      session.updatedAt = Date.now();
    }
    console.debug('Debug: surface empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  surface.createEmptyPayload = function createEmptySurfacePayload(){
    console.debug('Debug: surface.createEmptyPayload pure factory invoked', {
      ready: !!surface.ready,
      boundTabId: getSurfaceProjectionTabId() || null
    });
    const payload = { type: 'surface', config: {} };
    payload.type = 'surface';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
    payload.data = emptyData;
    payload.exclusions = [];
    payload.filters = null;
    payload.config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    if(typeof payload.config.colorScheme !== 'string' || !payload.config.colorScheme.trim()){
      payload.config.colorScheme = Shared.colorSchemes?.getDefaultSchemeId?.('surface') || 'scientific';
    }
    return payload;
  };

  surface.save = async function save(){
    const operationSession = getActiveSurfaceSessionForState();
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('surface.save missing Shared.fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'surface',
      fileHandle: state.fileHandle,
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { setSurfaceFileHandle(handle, operationSession); },
      setFileName: name => { setSurfaceFileName(name, operationSession); }
    });
    debugLog('Debug: surface save result', result);
  };

  surface.saveAs = async function saveAs(){
    const operationSession = getActiveSurfaceSessionForState();
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('surface.saveAs missing Shared.fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'surface',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { setSurfaceFileHandle(handle, operationSession); },
      setFileName: name => { setSurfaceFileName(name, operationSession); }
    });
    debugLog('Debug: surface saveAs result', result);
  };

  surface.open = async function open(){
    const operationSession = getActiveSurfaceSessionForState();
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('surface.open missing Shared.fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'surface',
      setFileHandle: handle => { setSurfaceFileHandle(handle, operationSession); },
      setFileName: name => { setSurfaceFileName(name, operationSession); },
      loadFromFile: blob => surface.loadFromFile(blob),
      triggerInput: () => {
        if(state.controls.graphFileInput){
          state.controls.graphFileInput.value = '';
          state.controls.graphFileInput.click();
        }
      }
    });
    debugLog('Debug: surface open result', result);
  };

  surface.loadFromFile = function loadFromFile(file){
    const apply = payload => applySurfacePayload(payload, { source: 'file' });
    if(file instanceof Blob){
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if(!apply(parsed)){
            console.warn('surface payload rejected from file', { hasType: !!parsed?.type });
          }
        } catch(err){
          console.error('surface load parse error', err);
        }
      };
      reader.readAsText(file);
      return;
    }
    if(typeof file === 'string'){
      try {
        const parsed = JSON.parse(file);
        if(!apply(parsed)){
          console.warn('surface payload rejected from string');
        }
      } catch(err){
        console.error('surface load string parse error', err);
      }
      return;
    }
    if(file && typeof file === 'object'){
      apply(file);
    }
  };

  surface.loadFromPayload = function loadFromPayload(payload, options = {}){
    if(!applySurfacePayload(payload, { source: 'payload', ...options })){
      console.warn('surface payload application failed', { source: 'payload' });
    }
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

  function captureSurfaceSvgRootState(svg){
    if(!svg){
      return null;
    }
    const attributeNames = ['width', 'height', 'viewBox', 'preserveAspectRatio', 'font-family', 'data-surface-base-width', 'data-surface-base-height'];
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

  function restoreSurfaceSvgRootState(svg, snapshot){
    if(!svg){
      return false;
    }
    const attributeNames = ['width', 'height', 'viewBox', 'preserveAspectRatio', 'font-family', 'data-surface-base-width', 'data-surface-base-height'];
    const styleNames = ['display'];
    attributeNames.forEach(name => {
      try{
        if(typeof svg.removeAttribute === 'function'){
          svg.removeAttribute(name);
        }
      }catch(err){
        console.error('surface restore svg attribute reset error', { name, err });
      }
    });
    styleNames.forEach(name => {
      try{
        if(svg.style){
          svg.style[name] = '';
        }
      }catch(err){
        console.error('surface restore svg style reset error', { name, err });
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
          console.error('surface restore svg attribute error', { name, value, err });
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
          console.error('surface restore svg style error', { name, value, err });
        }
      });
    }
    return true;
  }

  function countSurfacePoolNodesAttachedToSvg(pool, svg){
    if(!svg || typeof svg.contains !== 'function' || !Array.isArray(pool) || !pool.length){
      return 0;
    }
    let count = 0;
    for(let i = 0; i < pool.length; i += 1){
      const node = pool[i];
      if(node && svg.contains(node)){
        count += 1;
      }
    }
    return count;
  }

  function syncSurfaceGeometryPoolsFromDom(reason){
    const svg = state.svg;
    if(!svg || typeof svg.querySelector !== 'function'){
      state._facePool = [];
      state._pointPool = [];
      state._facePoolUsed = 0;
      state._pointPoolUsed = 0;
      return;
    }
    const geometryLayer = svg.querySelector('g.surface-layer-geometry');
    const faceGroup = geometryLayer?.querySelector?.('g.surface-faces') || null;
    const pointGroup = geometryLayer?.querySelector?.('g.surface-points') || null;
    const nextFacePool = faceGroup && typeof faceGroup.querySelectorAll === 'function'
      ? Array.from(faceGroup.querySelectorAll('polygon'))
      : [];
    const nextPointPool = pointGroup && typeof pointGroup.querySelectorAll === 'function'
      ? Array.from(pointGroup.querySelectorAll('circle'))
      : [];
    state._facePool = nextFacePool;
    state._pointPool = nextPointPool;
    state._facePoolUsed = nextFacePool.length;
    state._pointPoolUsed = nextPointPool.length;
    debugLog('Debug: surface geometry pools synced from DOM', {
      reason: reason || null,
      faces: nextFacePool.length,
      points: nextPointPool.length
    });
  }

  function ensureSurfaceGeometryPoolsSynced(reason){
    const svg = state.svg;
    if(!svg || typeof svg.querySelector !== 'function'){
      return;
    }
    const geometryLayer = svg.querySelector('g.surface-layer-geometry');
    if(!geometryLayer){
      return;
    }
    const faceGroup = geometryLayer.querySelector?.('g.surface-faces') || null;
    const pointGroup = geometryLayer.querySelector?.('g.surface-points') || null;
    const faceDomCount = faceGroup && typeof faceGroup.querySelectorAll === 'function'
      ? faceGroup.querySelectorAll('polygon').length
      : 0;
    const pointDomCount = pointGroup && typeof pointGroup.querySelectorAll === 'function'
      ? pointGroup.querySelectorAll('circle').length
      : 0;
    const attachedFaceCount = countSurfacePoolNodesAttachedToSvg(state._facePool, svg);
    const attachedPointCount = countSurfacePoolNodesAttachedToSvg(state._pointPool, svg);
    if(faceDomCount !== attachedFaceCount || pointDomCount !== attachedPointCount){
      syncSurfaceGeometryPoolsFromDom(reason || 'pool-mismatch');
    }
  }

  function resolveSurfaceRenderCacheSession(meta = {}, options = {}){
    const source = meta && typeof meta === 'object' ? meta : {};
    if(source.session){
      return ensureSurfaceSessionOwnershipShape(source.session);
    }
    const tabLike = source.tab || source.tabId || getSurfaceProjectionTabId() || null;
    return tabLike
      ? getSurfaceSession(tabLike, { ...(source || {}), reason: source.reason || 'surface-render-cache-session' }, { create: options.create === true })
      : getActiveSurfaceSessionForState();
  }

  surface.captureRenderCache = function captureRenderCache(meta = {}){
    const cacheSession = resolveSurfaceRenderCacheSession(meta, { create: false });
    if(cacheSession && !isSurfaceSessionActiveOrActivating(cacheSession)){
      debugLog('Debug: surface render cache capture skipped for inactive session', {
        tabId: cacheSession.tabId || null,
        reason: meta?.reason || 'capture-render-cache'
      });
      return null;
    }
    cacheDom();
    const hasGraphNodes = !!(state.svg && state.svg.childNodes && state.svg.childNodes.length > 0);
    if(!hasGraphNodes && typeof drawSurface === 'function'){
      try{
        drawSurface();
        cacheDom();
      }catch(err){
        console.warn('surface render cache capture draw failed', { reason: meta?.reason || 'capture-render-cache', message: err?.message || String(err) });
      }
    }
    const svgCache = detachChildren(state.svg);
    const statsCache = detachChildren(state.statsEl);
    const messageCache = detachChildren(state.messageEl);
    const svgRootState = captureSurfaceSvgRootState(state.svg);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: surface render cache captured', {
        svgNodes: svgCache?.count || 0,
        statsNodes: statsCache?.count || 0,
        messageNodes: messageCache?.count || 0,
        hasSvgRootState: !!svgRootState
      });
    }
    return { plot: svgCache, stats: statsCache, message: messageCache, svgRootState };
  };

  surface.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    const cacheSession = resolveSurfaceRenderCacheSession(meta, { create: false });
    if(cacheSession && !isSurfaceSessionActiveOrActivating(cacheSession)){
      debugLog('Debug: surface render cache restore rejected for inactive session', {
        tabId: cacheSession.tabId || null,
        reason: meta?.reason || null
      });
      return false;
    }
    return Shared.componentLifecycle?.validateRenderCache?.(cache, meta, {
      componentKey: 'surface',
      graph: { selectors: ['#surfaceSvg', 'svg', 'canvas'], markupPattern: /(<svg\b|id=["']surfaceSvg["']|<canvas\b)/i },
      graphFallbackSections: ['stats', 'message'],
      requiredSections: [],
      requireGraph: true
    }) ?? !!cache;
  };

  surface.isIdleForSnapshot = function isIdleForSnapshot(meta = {}){
    const owner = resolveSurfaceRenderCacheSession(meta, { create: false }) || getActiveSurfaceSessionForState();
    if(owner && !isSurfaceSessionActiveOrActivating(owner)){
      return !owner.state?.drawPending;
    }
    return !state.drawPending;
  };

  surface.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(surface, { ...meta, componentKey: 'surface' })
      || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  surface.restoreRenderCache = function restoreRenderCache(cache, _meta = {}){
    if(!cache){ return false; }
    const cacheSession = resolveSurfaceRenderCacheSession(_meta, { create: false });
    if(cacheSession && !isSurfaceSessionActiveOrActivating(cacheSession)){
      debugLog('Debug: surface render cache restore skipped for inactive session', {
        tabId: cacheSession.tabId || null,
        reason: _meta?.reason || null
      });
      return false;
    }
    const graphCachePayload = cache?.[cache?.__graphitixRenderCache?.graphicKey] || cache?.svg || cache?.plot || cache?.preview || cache?.graph || cache?.stage;
    cacheDom();
    restoreSurfaceSvgRootState(state.svg, cache.svgRootState);
    const restoredSvg = restoreChildren(state.svg, graphCachePayload);
    const restoredStats = restoreChildren(state.statsEl, cache.stats);
    const restoredMessage = restoreChildren(state.messageEl, cache.message);
    if(restoredStats){
      // The replayed stats DOM carries dead Download/Copy controls (listeners cannot
      // survive serialization); re-mount them from the restored tables.
      Shared.statsTable?.rehydrateExportControls?.(state.statsEl);
    }
    if(restoredSvg){
      syncSurfaceGeometryPoolsFromDom('render-cache-restore');
      bindSurface3dRotationControls(state.svg, 'surface-restore');
      const restoredFrame = resolveSurface3dFrame(resolveSurfaceDrawableFrame(state.svg));
      state.svg?.setAttribute?.('data-surface-base-width', String(restoredFrame.width));
      state.svg?.setAttribute?.('data-surface-base-height', String(restoredFrame.height));
      ensureSurfaceGraphViewport(state.svg, {
        padding: Math.max(Number(state.settings?.fontSize) || 12, 18),
        debugLabel: 'surface-3d-graph-restore',
        baseViewport: { width: restoredFrame.width, height: restoredFrame.height }
      });
    }
    const restored = restoredSvg || restoredStats || restoredMessage;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      debugLog('Debug: surface render cache restored', {
        restored,
        svg: restoredSvg,
        stats: restoredStats,
        message: restoredMessage,
        svgRootState: !!cache.svgRootState
      });
    }
    return restored;
  };

  surface.__getState = () => state;
  surface.__testHooks = Object.assign({}, surface.__testHooks, {
    resolveDrawableFrame: targetEl => resolveSurfaceDrawableFrame(targetEl),
    resolve3dFrame: drawableFrame => resolveSurface3dFrame(drawableFrame),
    resolveLegendMetrics: options => resolveSurfaceLegendMetrics(options),
    resolvePlotMargins: options => resolveSurfacePlotMargins(options),
    renderLegend: (svg, options) => renderLegend(svg, options),
    applySavedFontStyle: node => applySavedFontStyle(node)
  });

  surface.destroy = function destroy(){
    try{
      if(state.layout && typeof state.layout.destroy === 'function'){
        try{ state.layout.destroy(); }catch(e){ debugLog('Debug: surface layout.destroy failed', { message: e?.message || String(e) }); }
      }
      // remove any DOM listeners we attached
      try{
        if(Array.isArray(state._listeners)){
          for(let i = 0; i < state._listeners.length; i += 1){
            const rec = state._listeners[i];
            try{ if(rec && rec.node && typeof rec.node.removeEventListener === 'function'){ rec.node.removeEventListener(rec.type, rec.handler, rec.options); } }catch(e){ /* ignore */ }
          }
        }
      }catch(e){ /* ignore */ }

      // remove registered hot hooks
      try{
        if(Array.isArray(state._hotHooks) && state.hot){
          for(let i = 0; i < state._hotHooks.length; i += 1){
            const h = state._hotHooks[i];
            try{ if(h && typeof state.hot.removeHook === 'function'){ state.hot.removeHook(h.name, h.fn); } }catch(e){ /* ignore */ }
          }
        }
      }catch(e){ /* ignore */ }
      if(surfaceAutoDrawManager){
        try{
          if(typeof surfaceAutoDrawManager.dispose === 'function'){
            surfaceAutoDrawManager.dispose();
          } else if(typeof surfaceAutoDrawManager.destroy === 'function'){
            surfaceAutoDrawManager.destroy();
          }
        }catch(e){ debugLog('Debug: surface autoDrawManager cleanup failed', { message: e?.message || String(e) }); }
        surfaceAutoDrawManager = null;
      }
      if(state.svg){
        try{ while(state.svg.firstChild){ state.svg.removeChild(state.svg.firstChild); } }catch(e){ /* noop */ }
      }
      // clear pooled elements arrays
      try{ if(Array.isArray(state._facePool)){ state._facePool.length = 0; state._facePoolUsed = 0; } }catch(e){}
      try{ if(Array.isArray(state._pointPool)){ state._pointPool.length = 0; state._pointPoolUsed = 0; } }catch(e){}
      try{ resolveSurfaceOverlay('destroy'); }catch(e){}
      if(fontControls && typeof fontControls.disableForSvg === 'function'){
        try{ fontControls.disableForSvg(state.svg, { scopeId: 'surface' }); }catch(e){}
      }
      // clear heavy references to allow GC
      state.hot = null;
      state.layout = null;
      state.svg = null;
      state.svgBox = null;
      state.statsEl = null;
      state.messageEl = null;
      state.exportContainer = null;
      state.renderRow = null;
      state.renderButton = null;
      state.autoDrawNotice = null;
      state.scheduleDraw = () => {};
      state.controls = {};
      state.axisSelects = { x: null, y: null, z: null };
      state.axisMap = { x: 0, y: 1, z: 2 };
      // clear cached color factories
      try{ if(colorScaleFactory._cache && typeof colorScaleFactory._cache.clear === 'function'){ colorScaleFactory._cache.clear(); } }catch(e){}
      surface.ready = false;
      debugLog('Debug: surface destroyed');
    }catch(err){
      console.error('surface.destroy error', err);
    }
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = surface;
  }



  Shared.componentLifecycle?.installInternalStateBridge?.(surface, {
    componentKey: 'surface',
    targets: [
      { key: 'state', get: () => state, excludeKeys: ['hot', 'root', 'svg', 'svgBox', 'drawPending'] },
      { key: 'notesState', get: () => notesState, excludeKeys: ['control'] }
    ]
  });
})(window);
