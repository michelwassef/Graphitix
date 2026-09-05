(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const line = Components.line = Components.line || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const svgGeometry = Shared.svgGeometry = Shared.svgGeometry || {};
  if(typeof svgGeometry.buildCompoundLinePath !== 'function' && typeof require === 'function'){
    try{
      require('../shared/svgGeometry.js');
    }catch(err){
      console.debug('Debug: line component svgGeometry helper require failed', { message: err?.message || String(err) });
    }
  }
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const exportFontStyles = (scopeId, options) => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId, options)
    : null;
  const importFontStyles = (scopeId, styles, options) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true, ...(options || {}) });
    }
  };
  const axisControls = Shared.axisControls = Shared.axisControls || {};
  const axisExtras = Shared.axisExtras = Shared.axisExtras || {};
  const additionalLineControls = Shared.additionalLineControls = Shared.additionalLineControls || {};
  const gridControls = Shared.gridControls = Shared.gridControls || {};
  if((typeof additionalLineControls.show !== 'function' || typeof additionalLineControls.registerAdditionalLineElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/additionalLineControls.js');
    }catch(err){
      console.debug('Debug: line component additionalLineControls helper require failed', { message: err?.message || String(err) });
    }
  }
  if((typeof gridControls.show !== 'function' || typeof gridControls.registerGraphElement !== 'function') && typeof require === 'function'){
    try{
      require('../shared/gridControls.js');
    }catch(err){
      console.debug('Debug: line component gridControls helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesHelper = Shared.notes = Shared.notes || {};
  if(typeof notesHelper.mountFoldable !== 'function' && typeof require === 'function'){
    try{
      require('../shared/notes.js');
    }catch(err){
      console.debug('Debug: line component notes helper require failed', { message: err?.message || String(err) });
    }
  }
  const notesState = { text: '', open: false, control: null };
  const formControls = Shared.formControls = Shared.formControls || {};
  const dataTransformsApi = Shared.dataTransforms = Shared.dataTransforms || {};
  if(typeof dataTransformsApi.applyTransform !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataTransforms.js');
    }catch(err){
      console.debug('Debug: line component dataTransforms helper require failed', { message: err?.message || String(err) });
    }
  }
  const dataViewsApi = Shared.dataViews = Shared.dataViews || {};
  if(typeof dataViewsApi.createManager !== 'function' && typeof require === 'function'){
    try{
      require('../shared/dataViews.js');
    }catch(err){
      console.debug('Debug: line component dataViews helper require failed', { message: err?.message || String(err) });
    }
  }
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  if(typeof plot3d.createRotationState !== 'function' && typeof require === 'function'){
    try{
      require('../shared/plot3d.js');
    }catch(err){
      console.debug('Debug: line component plot3d helper require failed', { message: err?.message || String(err) });
    }
  }
  if(typeof plot3d.createRotationState !== 'function'){
    plot3d.createRotationState = (defaults) => ({
      x: Number.isFinite(defaults?.x) ? defaults.x : 0,
      y: Number.isFinite(defaults?.y) ? defaults.y : 0,
      z: Number.isFinite(defaults?.z) ? defaults.z : 0,
      quaternion: null
    });
  }
  if(typeof plot3d.rotatePoint !== 'function'){
    plot3d.rotatePoint = (pt) => ({ x: Number(pt?.x) || 0, y: Number(pt?.y) || 0, z: Number(pt?.z) || 0 });
  }
  if(typeof plot3d.attachRotationControls !== 'function'){
    plot3d.attachRotationControls = () => {};
  }
  if(typeof plot3d.renderAxesAndGrid !== 'function'){
    plot3d.renderAxesAndGrid = () => null;
  }
  if(typeof plot3d.createProjector !== 'function'){
    plot3d.createProjector = (options) => {
      const width = Math.max(1, Math.floor(options?.width || 1));
      const height = Math.max(1, Math.floor(options?.height || 1));
      const margin = options?.margin || {};
      const shiftX = Number.isFinite(options?.shiftX) ? options.shiftX : 0;
      const baseX = Number(margin.left || 0) + shiftX;
      const baseY = Number(margin.top || 0);
      return {
        project: () => ({ x: baseX, y: baseY, depth: 0 }),
        bounds: {},
        scale: 1,
        offsets: { x: baseX, y: baseY },
        plotSize: { width, height }
      };
    };
  }
  if(typeof plot3d.applyLegendPointerGuards !== 'function'){
    plot3d.applyLegendPointerGuards = () => {};
  }
  if(typeof plot3d.isLegendPointerTarget !== 'function'){
    plot3d.isLegendPointerTarget = () => false;
  }
  if(typeof plot3d.isInteractivePointerTarget !== 'function'){
    plot3d.isInteractivePointerTarget = target => plot3d.isLegendPointerTarget(target);
  }
  const regressionTools = Shared.regressionTools = Shared.regressionTools || {};
  line.__installed = true;
  line.ready = false;
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  if(!fileIO.saveGraphFile){
    console.debug('Debug: line component awaiting Shared.fileIO helpers');
  }
  if(!Shared.tableImport || typeof Shared.tableImport.openFile !== 'function'){
    console.debug('Debug: line component awaiting Shared.tableImport helpers'); // Debug: table import helper check
  }

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 100;
  const LINE_DEFAULT_COLS = 6;
  const LINE_DEFAULT_DOT_SIZE = 3;
  let emptyPayloadTemplate = null;

  function seedLineDefaultHeaderRow(matrix){
    if(!Array.isArray(matrix) || !Array.isArray(matrix[0])){
      return matrix;
    }
    const headerRow = matrix[0];
    if(headerRow.length > 0){
      headerRow[0] = 'X title';
    }
    const seriesCount = Math.min(Math.max(0, headerRow.length - 1), Math.max(0, LINE_DEFAULT_COLS - 1));
    for(let idx = 0; idx < seriesCount; idx += 1){
      headerRow[idx + 1] = `Series ${idx + 1}`;
    }
    return matrix;
  }

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('line cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate){
      return;
    }
    emptyPayloadTemplate = { type: 'line', config: {} };
  }
  const LINE_DEFAULT_SERIES_COUNT = 5;
  const LINE_MIN_REPLICATES = 1;
  const LINE_MAX_REPLICATES = 10;
  const DEFAULT_FORECAST_HORIZON = 6;
  const DEFAULT_FORECAST_SEASON = 12;
  const MAX_FORECAST_HORIZON = 120;
  const LINE_REGRESSION_FAMILY_ORDER = Object.freeze([
    'Lines',
    'Polynomial',
    'Exponential',
    'Growth',
    'Classic',
    'Dose-response',
    'Gaussian',
    'Curves',
    'Binding',
    'Enzyme kinetics',
    'Forecasting'
  ]);
  const palette = Shared.palette = Shared.palette || {};
  if(typeof palette.ensureDefaultScatterColors !== 'function' && typeof require === 'function'){
    try{
      require('../shared/palette.js');
    }catch(err){
      // ignore palette preload failures
    }
  }
  const DEFAULT_SCATTER_COLORS = typeof palette.ensureDefaultScatterColors === 'function'
    ? palette.ensureDefaultScatterColors()
    : (Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
      ? palette.DEFAULT_SCATTER_COLORS
      : global.DEFAULT_SCATTER_COLORS);
  if(Array.isArray(DEFAULT_SCATTER_COLORS) && DEFAULT_SCATTER_COLORS.length){
    palette.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
    global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;
  }
  const LINE_GROUP_SHAPE_OPTIONS = Shared.getShapePickerOptions
    ? Shared.getShapePickerOptions()
    : Object.freeze([
        { value: 'circle', label: 'Circle' },
        { value: 'square', label: 'Square' },
        { value: 'triangle', label: 'Triangle' },
        { value: 'diamond', label: 'Diamond' },
        { value: 'cross', label: 'Cross' }
      ]);
  const LINE_GROUP_SHAPE_DEFAULTS = LINE_GROUP_SHAPE_OPTIONS.map(opt => opt.value);
  const LINE_GROUP_SHAPE_VALUES = Shared.getShapePickerValues
    ? Shared.getShapePickerValues()
    : new Set(LINE_GROUP_SHAPE_DEFAULTS);
  const LINE_DISPLAY_MODE_OPTIONS = Object.freeze(['line','area']);
  const LINE_3D_DEFAULTS = Object.freeze({
    rotationX: 0.24,
    rotationY: 1.96,
    aspectRatio: 4 / 3
  });
  const LINE_3D_DEFAULT_SERIES_COUNT = 3;
  // PART: STATE
  let lineDisplayMode = 'line';
  const LINE_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const LINE_AUTO_DRAW_COL_THRESHOLD = 5000;
  const LINE_AUTO_DRAW_CELL_THRESHOLD = 50000;
  const LINE_DATA_VIEW_MAX = 12;
  const LINE_TRANSFORM_SCOPE_DEFAULT = Object.freeze({
    headerRows: 1,
    startCol: 0
  });
  const BROKEN_AXIS_GAP_SIZE_PX = 20;
  const BROKEN_AXIS_DEFAULT_SEGMENT = { start: 0, end: 1 };
  function createDefaultLineAutoDrawState(){
    return {
      autoDrawEnabled: true,
      autoDrawReason: null,
      autoDrawLockedByThreshold: false,
      drawPending: false,
      lastDataShape: { rows: 0, cols: 0 },
      lastAutoDrawEvaluation: null
    };
  }
  let lineFallbackAutoDrawState = createDefaultLineAutoDrawState();

  let lineFallbackDrawScheduler = () => {};
  let lineFallbackRawDrawScheduler = () => {};
  let lineFontEventBound = false;
  let lineFallbackAutoDrawManager = null;
  let lineFallbackHotManager = null;
  let lineDataToolbarBound = false;
  const lineDataToolbarLastActivationByTabId = new Map();
  function scheduleLineViewRefresh(reason, extraOptions){
    const options = (extraOptions && typeof extraOptions === 'object') ? extraOptions : {};
    const nextReason = reason || options.reason || 'line-view-refresh';
    const ownerTabId = String(
      options.tabId
      || options.workspaceTabId
      || options.tab?.id
      || getLineProjectionTabId()
      || ''
    ).trim();
    const ownerSession = ownerTabId
      ? getLineSession(ownerTabId, { ...(options || {}), tabId: ownerTabId, reason: nextReason }, { create: false })
      : getLineActiveSessionForState();
    if(!ownerSession){
      return;
    }

    // Live controls are a projection of the active owner only. Never capture the
    // currently visible Line DOM into a different tab merely because a delayed
    // style event carries that tab id.
    const captureContext = ownerSession
      ? Shared.componentLifecycle?.resolveOwnerCaptureContext?.('line', { tabId: ownerSession.tabId }, {
          component: line,
          projectedSession: projectedLineSession,
          session: ownerSession,
          root: ownerSession.root || null,
          allowMissingWorkspaceOwner: true
        })
      : null;
    const canReadLiveControls = captureContext
      ? captureContext.canCaptureLive === true
      : isLineSessionActive(ownerSession);
    if(canReadLiveControls){
      syncLineRuntimeControlsFromRefs();
      rememberLineSessionState(ownerSession, { tabId: ownerSession.tabId, reason: nextReason || 'line-view-refresh-state' }, { readControls: false });
    }

    const normalizedReason = String(nextReason || '').toLowerCase();
    const resizePhase = String(options.resizePhase || '').toLowerCase();
    const passiveResize = normalizedReason === 'resize'
      && (resizePhase === 'observe' || resizePhase === 'programmatic' || resizePhase === '');
    const passiveReason = normalizedReason.includes('restore')
      || normalizedReason.includes('payload')
      || normalizedReason.includes('programmatic')
      || normalizedReason.includes('auto')
      || normalizedReason.includes('init')
      || normalizedReason.includes('observer')
      || normalizedReason.includes('layout')
      || normalizedReason.includes('sync')
      || passiveResize;
    const lifecycleMeta = {
      tabId: ownerSession.tabId || null,
      reason: nextReason,
      source: 'line-view-refresh',
      forceDraw: options.force === true,
      userInitiated: options.userInitiated === true || (options.userInitiated !== false && !passiveReason)
    };
    if(lifecycleMeta.userInitiated === true){
      markLineViewMutation(lifecycleMeta.tabId, nextReason);
    }
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('line', lifecycleMeta)){
      console.debug('Debug: line view refresh suppressed by lifecycle', { reason: nextReason, tabId: lifecycleMeta.tabId });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'line', tabId: lifecycleMeta.tabId, action: 'draw-suppressed', reason: nextReason, details: { source: 'line-view-refresh' } });
      return;
    }
    if(!canScheduleLineDrawForSession(ownerSession)){
      return;
    }
    const scheduleOptions = Object.assign({}, options, {
      tabId: ownerSession.tabId,
      viewOnly: options.structural === true ? false : true,
      silentOverlay: options.structural === true ? false : true,
      reason: nextReason,
      source: 'line-view-refresh',
      forceDraw: lifecycleMeta.forceDraw === true,
      userInitiated: lifecycleMeta.userInitiated === true
    });
    scheduleLineDrawForSession(ownerSession, scheduleOptions);
  }

  function markLineViewMutation(tabLike, reason){
    const tabId = typeof tabLike === 'string' ? tabLike.trim() : String(tabLike?.id || '').trim();
    const sessionApi = (global.Main && global.Main.session) ? global.Main.session : null;
    const reasonText = reason || 'line-view-change';
    try{
      if(tabId && typeof sessionApi?.markTabUserModified === 'function'){
        return !!sessionApi.markTabUserModified(tabId, reasonText, {
          origin: 'user',
          source: 'line-view-refresh',
          affectsPayload: true
        });
      }
      if(typeof sessionApi?.markActiveTabUserModified === 'function'){
        return !!sessionApi.markActiveTabUserModified(reasonText, {
          origin: 'user',
          source: 'line-view-refresh',
          affectsPayload: true
        });
      }
    }catch(err){
      lineDebug('Debug: line view mutation mark failed', { reason: reasonText, tabId: tabId || null, message: err?.message || String(err) });
    }
    return false;
  }

  function invalidateLineRenderCacheForTab(tabLike, reason){
    try{
      const tabId = typeof tabLike === 'string' ? tabLike.trim() : String(tabLike?.id || '').trim();
      if(!tabId){
        lineDebug('Debug: line render cache invalidation skipped without explicit tab', { reason: reason || null });
        return false;
      }
      const sess = (global.Main && global.Main.session) ? global.Main.session : null;
      const tabs = Array.isArray(sess?.workspaceState?.tabs) ? sess.workspaceState.tabs : [];
      const tab = (tabLike && typeof tabLike === 'object' && tabLike.id)
        ? tabLike
        : (tabs.find(item => item && String(item.id || '') === tabId) || null);
      if(!tab || tab.type !== 'line'){
        return false;
      }
      let cleared = false;
      if(typeof sess?.clearTabRenderCache === 'function'){
        cleared = sess.clearTabRenderCache(tab, { tabId, reason: reason || 'line-view-change' }) || cleared;
      }
      if(typeof sess?.clearTabArchiveRenderCache === 'function'){
        cleared = sess.clearTabArchiveRenderCache(tab, { tabId, reason: reason || 'line-view-change' }) || cleared;
      }
      return cleared;
    }catch(err){
      lineDebug('Debug: line render cache invalidation failed', { reason: reason || null, message: err?.message || String(err) });
      return false;
    }
  }

  function isLineFontStyleEvent(detail){
    const scopeId = detail?.scopeId || null;
    const storeKey = typeof detail?.storeKey === 'string' ? detail.storeKey : '';
    return scopeId === 'line' || storeKey.startsWith('line::');
  }

  function ensureLineFontEventListener(){
    if(lineFontEventBound || !global.document || typeof global.document.addEventListener !== 'function'){
      return;
    }
    global.document.addEventListener('fontControls:styleChanged', event => {
      const detail = event?.detail || {};
      if(!isLineFontStyleEvent(detail)){
        return;
      }
      scheduleLineViewRefresh('font-style-change', { tabId: detail.tabId || null });
    });
    lineFontEventBound = true;
  }

  function createDefaultLineViewState(){
    const viewState = {
      viewMode: '2d',
      requestedViewMode: null,
      rotation: plot3d.createRotationState({
        x: LINE_3D_DEFAULTS.rotationX,
        y: LINE_3D_DEFAULTS.rotationY
      }),
      rotationPending: false,
      rotationPendingLogged: false,
      axesVarianceScaled: false,
      equalAxes: false,
      equalScaleAxes: false,
      forcedLockRatioPrevious: null
    };
    if(typeof plot3d.normalizeRotation === 'function'){
      plot3d.normalizeRotation(viewState.rotation);
    }
    return viewState;
  }
  let lineFallbackViewState = createDefaultLineViewState();
  function resetLine3dRotation(reason){
    const viewState = getLineViewState();
    if(typeof plot3d.createRotationState !== 'function'){
      viewState.rotation.x = LINE_3D_DEFAULTS.rotationX;
      viewState.rotation.y = LINE_3D_DEFAULTS.rotationY;
      viewState.rotation.z = 0;
      viewState.rotation.quaternion = null;
      commitLineRotationState(viewState.rotation, null, reason || 'line-rotation-reset');
      persistLineRotationState(null, reason || 'line-rotation-reset');
      lineDebug('Debug: line rotation reset (fallback)', { reason, rotation: { x: viewState.rotation.x, y: viewState.rotation.y, z: viewState.rotation.z } });
      return;
    }
    const defaults = plot3d.createRotationState({
      x: LINE_3D_DEFAULTS.rotationX,
      y: LINE_3D_DEFAULTS.rotationY
    });
    viewState.rotation.x = defaults.x;
    viewState.rotation.y = defaults.y;
    viewState.rotation.z = defaults.z || 0;
    viewState.rotation.quaternion = defaults.quaternion
      ? { w: defaults.quaternion.w, x: defaults.quaternion.x, y: defaults.quaternion.y, z: defaults.quaternion.z }
      : null;
    commitLineRotationState(viewState.rotation, null, reason || 'line-rotation-reset');
    persistLineRotationState(null, reason || 'line-rotation-reset');
    lineDebug('Debug: line rotation reset', { reason, rotation: { x: viewState.rotation.x, y: viewState.rotation.y, z: viewState.rotation.z } });
  }

  function commitLineRotationState(rotation, session = null, reason = 'line-rotation-state'){
    const target = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    const viewState = getLineViewState(target);
    if(rotation && typeof rotation === 'object'){
      viewState.rotation = rotation;
    }else if(!viewState.rotation || typeof viewState.rotation !== 'object'){
      viewState.rotation = plot3d.createRotationState({
        x: LINE_3D_DEFAULTS.rotationX,
        y: LINE_3D_DEFAULTS.rotationY
      });
    }
    if(typeof plot3d.normalizeRotation === 'function'){
      try{ plot3d.normalizeRotation(viewState.rotation); }catch(_err){}
    }
    if(target?.state){
      target.state.viewState = viewState;
      stampLineSessionState(target);
      const shouldMirror = typeof plot3d.isRotationOwnerTabActive === 'function'
        ? plot3d.isRotationOwnerTabActive(target, 'line')
        : (!line.__boundTabId || String(target.tabId || '') === String(line.__boundTabId || ''));
      if(shouldMirror){
        lineFallbackViewState = viewState;
      }
    }else{
      lineFallbackViewState = viewState;
    }
    lineDebug('Debug: line rotation state committed', {
      reason,
      tabId: target?.tabId || getLineProjectionTabId() || null,
      rotation: {
        x: viewState.rotation?.x,
        y: viewState.rotation?.y,
        z: viewState.rotation?.z
      }
    });
    return viewState.rotation;
  }

  function persistLineRotationState(session = null, reason = 'line-rotation-state'){
    const target = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    const tabId = target?.tabId || getLineProjectionTabId() || null;
    if(!tabId){
      return null;
    }
    const record = ensureLineOwnedRuntimeRecord(tabId, { reason });
    if(!record){
      return null;
    }
    record.viewState = normalizeLineOwnedViewState(getLineViewState(target));
    record.hydrated = true;
    record.updatedAt = Date.now();
    record.reason = reason;
    if(target?.state){
      target.state.viewState = getLineViewState(target);
      stampLineSessionState(target);
    }
    return getLineRuntimeOwner()?.rememberRecord?.(record.tabId, record, { tabId: record.tabId, reason }) || record;
  }
  let lineTitleText = 'Line graph';
  let lineXLabelText = 'X';
  let lineYLabelText = 'Y title';
  let lineZLabelText = 'Z';
  let lineLabelColors = {};
  let lineLabelPositions = { title: null, xLabel: null, yLabel: null, legend: null, stats: null };
  let lineColorSchemeId = 'scientific';
  let lineTextColor = chartStyle.TEXT_COLOR || '#000000';
  let lineBackgroundColor = '#ffffff';
  let lineLegendControl = null;
  let lineErrorBarToolbarPanel = null;
  let lineErrorBarToolbarInput = null;

  function normalizeLineThemeColor(value, fallback){
    return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
  }

  function getLineDefaultSchemeId(){
    const fromShared = Shared.colorSchemes?.getDefaultSchemeId?.('line');
    return (typeof fromShared === 'string' && fromShared.trim())
      ? fromShared.trim().toLowerCase()
      : 'scientific';
  }

  function getLineLabelsState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.labels = normalizeLineOwnedLabelsState(target.state.labels);
      return target.state.labels;
    }
    return normalizeLineOwnedLabelsState({
      title: lineTitleText,
      x: lineXLabelText,
      y: lineYLabelText,
      z: lineZLabelText,
      colors: lineLabelColors,
      positions: lineLabelPositions
    });
  }

  function setLineLabelsState(session = null, nextLabels = {}, meta = {}){
    const normalized = normalizeLineOwnedLabelsState(nextLabels);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.labels = normalized;
      stampLineSessionState(target);
      persistLineSessionState(target, {
        ...(meta || {}),
        tabId: target.tabId,
        reason: meta?.reason || 'line-labels-state'
      });
    }
    if(!target || isLineSessionActive(target)){
      lineTitleText = normalized.title;
      lineXLabelText = normalized.x;
      lineYLabelText = normalized.y;
      lineZLabelText = normalized.z;
      lineLabelColors = cloneLineRuntimeValue(normalized.colors, {}) || {};
      lineLabelPositions = cloneLineRuntimeValue(normalized.positions, {}) || {};
    }
    return normalized;
  }

  function patchLineLabelsState(session = null, patch = {}, meta = {}){
    const current = getLineLabelsState(session);
    return setLineLabelsState(session, {
      ...current,
      ...(patch || {}),
      colors: Object.prototype.hasOwnProperty.call(patch || {}, 'colors') ? patch.colors : current.colors,
      positions: Object.prototype.hasOwnProperty.call(patch || {}, 'positions') ? patch.positions : current.positions
    }, meta);
  }

  function buildLineAxisControlConfig(axis, ownerSession = null, axisMeta = {}){
    const owner = resolveLineStateSession(ownerSession || getLineActiveSessionForState());
    const controls = getLineRuntimeControlsForSession(owner);
    const logX = Object.prototype.hasOwnProperty.call(axisMeta || {}, 'logX') ? !!axisMeta.logX : !!controls.logX;
    const logY = Object.prototype.hasOwnProperty.call(axisMeta || {}, 'logY') ? !!axisMeta.logY : !!controls.logY;
    return {
      axis,
      scopeId: 'line',
      tabId: owner?.tabId || null,
      additionalTickDefaults: DEFAULT_AXIS_ADDITIONAL_TICK,
      getAxisBounds: () => axisMeta?.bounds || null,
      getTickInterval: () => getLineAxisTickInterval(axis),
      getEffectiveTickInterval: () => axisMeta?.effectiveTickInterval ?? null,
      getMajorTickLength: () => getLineAxisMajorTickLength(axis),
      onMajorTickLengthChange: value => updateLineAxisMajorTickLength(axis, value),
      getTickLabelAngle: () => axis === 'x' ? getLineXAxisTickLabelAngle(owner) : null,
      onTickLabelAngleChange: value => { if(axis === 'x'){ updateLineXAxisTickLabelAngle(value, owner); } },
      isTickLabelAngleSupported: () => axis === 'x',
      isMajorTickLengthSupported: () => true,
      majorTickLengthPlaceholder: 'Auto',
      getThickness: () => getLineAxisStrokeWidth(),
      getColor: () => getLineAxisColor(),
      isTickIntervalEnabled: () => axis === 'x' ? !logX : !logY,
      getTickIntervalDisabledMessage: () => axis === 'x'
        ? 'Tick interval is disabled while the X axis uses a logarithmic scale.'
        : 'Tick interval is disabled while the Y axis uses a logarithmic scale.',
      tickPlaceholder: 'Auto',
      onTickIntervalChange: value => updateLineAxisTickInterval(axis, value),
      getMinorTicksEnabled: () => getLineAxisMinorTicksEnabled(axis),
      onMinorTicksChange: value => updateLineAxisMinorTicks(axis, value),
      isMinorTicksSupported: () => true,
      getMinorTickSubdivisions: () => getLineAxisMinorTickSubdivisions(axis),
      onMinorTickSubdivisionsChange: value => updateLineAxisMinorTickSubdivisions(axis, value),
      onThicknessChange: value => updateLineAxisStrokeWidth(value),
      onColorChange: value => updateLineAxisColor(value),
      getNotationMode: () => getLineAxisNotation(axis),
      onNotationChange: value => updateLineAxisNotation(axis, value),
      isNotationSupported: () => true,
      isAdditionalTicksSupported: () => true,
      getAdditionalTicks: () => getLineAxisAdditionalTicks(axis),
      onAdditionalTickChange: (axisName, index, entry) => updateLineAxisAdditionalTick(axisName, index, entry),
      onAdditionalTickAdd: axisName => addLineAxisAdditionalTick(axisName),
      onAdditionalTickRemove: (axisName, index) => removeLineAxisAdditionalTick(axisName, index),
      isBrokenAxisSupported: () => true,
      getBrokenAxisEnabled: () => getBrokenAxisEnabled(axis),
      onBrokenAxisEnabledChange: enabled => updateBrokenAxisEnabled(axis, enabled),
      getBrokenAxisSegments: () => getBrokenAxisSegments(axis),
      onBrokenAxisSegmentChange: (axisName, index, segment) => {
        const segments = getBrokenAxisSegments(axis);
        if(index >= 0 && index < segments.length){
          segments[index] = segment;
          updateBrokenAxisSegments(axis, segments);
        }
      },
      onBrokenAxisAddSegment: () => {
        const segments = getBrokenAxisSegments(axis);
        segments.push({ ...BROKEN_AXIS_DEFAULT_SEGMENT });
        updateBrokenAxisSegments(axis, segments);
      },
      onBrokenAxisRemoveSegment: (axisName, index) => {
        const segments = getBrokenAxisSegments(axis);
        if(index >= 0 && index < segments.length){
          segments.splice(index, 1);
          updateBrokenAxisSegments(axis, segments);
        }
      }
    };
  }

  function bindLineInlineTextInteraction(node, ownerSession, key, options = {}){
    if(!node){ return false; }
    const owner = resolveLineStateSession(ownerSession || getLineActiveSessionForState());
    if(!owner){ return false; }
    const normalizedKey = key === 'title' ? 'title' : (key === 'z' ? 'z' : (key === 'y' ? 'y' : 'x'));
    const mode3d = options.mode === '3d' || node.closest?.('svg')?.dataset?.viewMode === '3d';
    const defaultValue = normalizedKey === 'y' ? 'Y title' : (normalizedKey === 'z' ? 'Z' : (normalizedKey === 'x' ? 'X' : 'Line graph'));
    const readValue = () => String(getLineLabelsState(owner)?.[normalizedKey] ?? '');
    const applyValue = value => {
      const rawValue = value != null ? String(value) : '';
      const nextValue = mode3d && normalizedKey !== 'title' ? (rawValue.trim() || defaultValue) : rawValue;
      patchLineLabelsState(owner, { [normalizedKey]: nextValue }, { reason: `line-${mode3d ? '3d' : '2d'}-${normalizedKey}-label-edit` });
      if(options.model?.axisLabels && normalizedKey !== 'title'){
        options.model.axisLabels[normalizedKey] = nextValue;
      }
      const hot = getLineSessionHotManager(owner) || null;
      if(normalizedKey === 'x' && !mode3d && hot && typeof hot.setDataAtCell === 'function'){
        const data = hot.getData?.() || [];
        const headerRow = Array.isArray(data[0]) ? data[0] : [];
        let xIndex = headerRow.findIndex(value => String(value).trim().toLowerCase() === 'x');
        if(xIndex < 0){ xIndex = 0; }
        if((headerRow[xIndex] ?? '') !== nextValue){
          hot.setDataAtCell([[0, xIndex, nextValue]], 'line-x-axis-edit');
        }
      }else if(mode3d && normalizedKey !== 'title'){
        syncLine3dAxisHeader(normalizedKey, nextValue, { hot, source: 'line-axis-inline' });
      }
      if(node.textContent !== nextValue){ node.textContent = nextValue; }
      scheduleLineDrawForSession(owner, {
        viewOnly: true,
        force: mode3d,
        tabId: owner.tabId || null,
        reason: normalizedKey === 'title' ? `line-${mode3d ? '3d' : '2d'}-title-edit` : `line-axis-label-${normalizedKey}`
      });
      return nextValue;
    };
    return makeEditableHelper(node, text => {
      const previous = readValue();
      const nextValue = applyValue(text);
      if(previous !== nextValue){
        recordLineChange(normalizedKey === 'title' ? 'line:title' : `line:${normalizedKey}-label`, previous, nextValue, applyValue);
      }
    }) === true;
  }

  function rehydrateLineInlineTextInteractions(svg, ownerSession){
    if(!svg){ return false; }
    const roleToKey = { graphTitle: 'title', xTitle: 'x', yTitle: 'y', zTitle: 'z' };
    const nodes = Array.from(svg.querySelectorAll?.('text[data-font-role="graphTitle"], text[data-font-role="xTitle"], text[data-font-role="yTitle"], text[data-font-role="zTitle"]') || []);
    if(!nodes.length){ return true; }
    return nodes.every(node => bindLineInlineTextInteraction(node, ownerSession, roleToKey[node.dataset?.fontRole], { mode: svg.dataset?.viewMode || '2d' }));
  }

  function bindLineLegendInteractions(legend, svg, ownerSession = null, options = {}){
    if(!legend || !svg || typeof Shared.bindLegendDragInteraction !== 'function'){
      return false;
    }
    const owner = resolveLineStateSession(ownerSession || getLineActiveSessionForState());
    const mode = options.mode || legend.dataset?.lineLegendMode || svg.dataset?.viewMode || '2d';
    const writeMetric = (key, value) => {
      if(Number.isFinite(Number(value))){
        legend.dataset[key] = String(Number(value));
      }
    };
    legend.dataset.lineLegendMode = mode === '3d' ? '3d' : '2d';
    writeMetric('lineLegendOriginX', options.originX);
    writeMetric('lineLegendOriginY', options.originY);
    writeMetric('lineLegendScaleX', options.scaleX);
    writeMetric('lineLegendScaleY', options.scaleY);
    return Shared.bindLegendDragInteraction?.(legend, svg, {
      owner,
      originX: Number.isFinite(Number(options.originX)) ? options.originX : Number(legend.dataset.lineLegendOriginX),
      originY: Number.isFinite(Number(options.originY)) ? options.originY : Number(legend.dataset.lineLegendOriginY),
      scaleX: Number.isFinite(Number(options.scaleX)) ? options.scaleX : Number(legend.dataset.lineLegendScaleX),
      scaleY: Number.isFinite(Number(options.scaleY)) ? options.scaleY : Number(legend.dataset.lineLegendScaleY),
      positionAnchor: chartStyle.LEGEND_POSITION_ANCHOR,
      undoLabel: `line-legend-${legend.dataset.lineLegendMode}`,
      onCommit: (position, boundOwner) => {
        const dragOwner = resolveLineStateSession(boundOwner || getLineActiveSessionForState());
        if(!dragOwner){
          return;
        }
        const nextPositions = cloneLineRuntimeValue(getLineLabelsState(dragOwner).positions, {}) || {};
        nextPositions.legend = position;
        patchLineLabelsState(dragOwner, { positions: nextPositions }, {
          reason: `line-${legend.dataset.lineLegendMode}-legend-position`
        });
      }
    }) === true;
  }

  function getLineThemeState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.theme = normalizeLineOwnedThemeState(target.state.theme);
      return target.state.theme;
    }
    return normalizeLineOwnedThemeState({
      colorScheme: lineColorSchemeId,
      textColor: lineTextColor,
      backgroundColor: lineBackgroundColor
    });
  }

  function setLineThemeState(session = null, nextTheme = {}, meta = {}){
    const normalized = normalizeLineOwnedThemeState(nextTheme);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.theme = normalized;
      stampLineSessionState(target);
      persistLineSessionState(target, {
        ...(meta || {}),
        tabId: target.tabId,
        reason: meta?.reason || 'line-theme-state'
      });
    }
    if(!target || isLineSessionActive(target)){
      lineColorSchemeId = normalized.colorScheme;
      lineTextColor = normalized.textColor;
      lineBackgroundColor = normalized.backgroundColor;
    }
    return normalized;
  }

  function getLineStylesState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.styles = normalizeLineOwnedStyleState(target.state.styles);
      return target.state.styles;
    }
    return normalizeLineOwnedStyleState({
      series: lineSeriesStyles,
      overlays: lineOverlayStyles,
      overlayToolbarScope: lineOverlayToolbarScope
    });
  }

  function setLineStylesState(session = null, nextStyles = {}, meta = {}){
    const normalized = normalizeLineOwnedStyleState(nextStyles);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.styles = normalized;
      stampLineSessionState(target);
      persistLineSessionState(target, {
        ...(meta || {}),
        tabId: target.tabId,
        reason: meta?.reason || 'line-styles-state'
      });
    }
    if(!target || isLineSessionActive(target)){
      lineSeriesStyles = cloneLineRuntimeValue(normalized.series, {}) || {};
      lineOverlayStyles = sanitizeLineOverlayStylesMap(normalized.overlays);
      lineOverlayToolbarScope = normalizeLineOverlayToolbarScope(normalized.overlayToolbarScope);
    }
    return normalized;
  }

  function patchLineStylesState(session = null, patch = {}, meta = {}){
    const current = getLineStylesState(session);
    return setLineStylesState(session, {
      ...current,
      ...(patch || {}),
      series: Object.prototype.hasOwnProperty.call(patch || {}, 'series') ? patch.series : current.series,
      overlays: Object.prototype.hasOwnProperty.call(patch || {}, 'overlays') ? patch.overlays : current.overlays,
      overlayToolbarScope: Object.prototype.hasOwnProperty.call(patch || {}, 'overlayToolbarScope')
        ? patch.overlayToolbarScope
        : current.overlayToolbarScope
    }, meta);
  }

  function patchLineSeriesStyleState(session = null, seriesKey = '', patch = {}, meta = {}){
    const resolvedKey = String(seriesKey == null ? '' : seriesKey).trim();
    if(!resolvedKey){
      return getLineStylesState(session);
    }
    const current = getLineStylesState(session);
    const nextSeries = cloneLineRuntimeValue(current.series, {}) || {};
    nextSeries[resolvedKey] = Object.assign({}, nextSeries[resolvedKey] || {}, patch || {});
    return patchLineStylesState(session, { series: nextSeries }, {
      ...(meta || {}),
      reason: meta?.reason || 'line-series-style-patch'
    });
  }

  function getLineGroupedState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.grouped = normalizeLineOwnedGroupedState(target.state.grouped);
      return target.state.grouped;
    }
    return normalizeLineOwnedGroupedState({
      replicates: lineReplicates,
      lastGroupedReplicateCount: lineLastGroupedReplicateCount,
      labels: lineSeriesGroupLabels,
      shapes: lineGroupShapes
    });
  }

  function setLineGroupedState(session = null, nextGrouped = {}, meta = {}){
    const normalized = normalizeLineOwnedGroupedState(nextGrouped);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.grouped = normalized;
      stampLineSessionState(target);
      persistLineSessionState(target, {
        ...(meta || {}),
        tabId: target.tabId,
        reason: meta?.reason || 'line-grouped-state'
      });
    }
    if(!target || isLineSessionActive(target)){
      lineReplicates = clampLineReplicateCount(normalized.replicates);
      lineLastGroupedReplicateCount = clampLineReplicateCount(normalized.lastGroupedReplicateCount || lineLastGroupedReplicateCount);
      lineSeriesGroupLabels = Array.isArray(normalized.labels) ? normalized.labels.slice() : [];
      lineGroupShapes = Array.isArray(normalized.shapes) ? normalized.shapes.map((shape, idx) => sanitizeLineGroupShape(shape, idx)) : [];
    }
    return normalized;
  }

  function patchLineGroupedState(session = null, patch = {}, meta = {}){
    const current = getLineGroupedState(session);
    return setLineGroupedState(session, {
      ...current,
      ...(patch || {}),
      labels: Object.prototype.hasOwnProperty.call(patch || {}, 'labels') ? patch.labels : current.labels,
      shapes: Object.prototype.hasOwnProperty.call(patch || {}, 'shapes') ? patch.shapes : current.shapes
    }, meta);
  }

  function setLineGroupShapesState(session = null, shapes = [], meta = {}){
    const normalizedShapes = Array.isArray(shapes)
      ? shapes.map((shape, idx) => sanitizeLineGroupShape(shape, idx))
      : [];
    const grouped = patchLineGroupedState(session, { shapes: normalizedShapes }, {
      ...(meta || {}),
      reason: meta?.reason || 'line-group-shapes-state'
    });
    return Array.isArray(grouped.shapes) ? grouped.shapes.slice() : [];
  }

  function patchLineGroupShapeState(session = null, index = 0, shape = '', meta = {}){
    const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
    const grouped = getLineGroupedState(session);
    const count = Math.max(Array.isArray(grouped.labels) ? grouped.labels.length : 0, Array.isArray(grouped.shapes) ? grouped.shapes.length : 0, safeIndex + 1);
    const shapes = new Array(count);
    for(let i = 0; i < count; i += 1){
      shapes[i] = sanitizeLineGroupShape(grouped.shapes?.[i], i);
    }
    shapes[safeIndex] = sanitizeLineGroupShape(shape, safeIndex);
    return setLineGroupShapesState(session, shapes, {
      ...(meta || {}),
      reason: meta?.reason || 'line-group-shape-patch'
    });
  }

  function getLineForecastState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.forecast = normalizeLineOwnedForecastState(target.state.forecast);
      return target.state.forecast;
    }
    return normalizeLineOwnedForecastState(lineForecastOptions);
  }

  function setLineForecastState(session = null, nextForecast = {}, meta = {}){
    const normalized = normalizeLineOwnedForecastState(nextForecast);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.forecast = normalized;
      stampLineSessionState(target);
      persistLineSessionState(target, {
        ...(meta || {}),
        tabId: target.tabId,
        reason: meta?.reason || 'line-forecast-state'
      });
    }
    if(!target || isLineSessionActive(target)){
      lineForecastOptions = normalizeLineOwnedForecastState(normalized);
    }
    return normalized;
  }

  function applyLineThemeConfig(config, session = null, meta = {}){
    const cfg = config && typeof config === 'object' ? config : {};
    const tabId = meta?.tabId || session?.tabId || getLineProjectionTabId() || null;
    const payloadConfig = getLineTabPayloadConfig(tabId) || {};
    const payloadScheme = (typeof payloadConfig.colorScheme === 'string' && payloadConfig.colorScheme.trim())
      ? payloadConfig.colorScheme.trim().toLowerCase()
      : '';
    const requestedScheme = (typeof cfg.colorScheme === 'string' && cfg.colorScheme.trim())
      ? cfg.colorScheme.trim().toLowerCase()
      : '';
    const resolvedSchemeId = requestedScheme || payloadScheme || getLineDefaultSchemeId();
    const resolved = Shared.colorSchemes?.resolveThemeState?.('line', {
      config: {
        ...payloadConfig,
        ...cfg,
        colorScheme: resolvedSchemeId
      }
    }) || null;
    const schemeId = resolved?.schemeId
      || (typeof cfg.colorScheme === 'string' && cfg.colorScheme.trim()
        ? cfg.colorScheme.trim().toLowerCase()
        : resolvedSchemeId);
    const isDark = resolved ? resolved.isDark === true : schemeId === 'dark';
    setLineThemeState(session || getLineProjectionSession({ reason: 'line-projection-mutation' }), {
      colorScheme: schemeId || 'scientific',
      textColor: normalizeLineThemeColor(
        cfg.textColor,
        resolved?.textColor || (isDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000'))
      ),
      backgroundColor: normalizeLineThemeColor(
        cfg.backgroundColor,
        resolved?.background || (isDark ? '#000000' : '#ffffff')
      )
    }, {
      ...(meta || {}),
      reason: meta?.reason || 'line-theme-config'
    });
    lineOverlayStyles = sanitizeLineOverlayStylesMap(cfg.overlayStyles);
  }

  function getLineThemeTextColor(session = null){
    const themeState = getLineThemeState(session);
    const resolved = Shared.colorSchemes?.resolveThemeState?.('line', { config: { colorScheme: themeState.colorScheme } });
    const isDark = resolved ? resolved.isDark === true : (String(themeState.colorScheme || '').toLowerCase() === 'dark');
    return normalizeLineThemeColor(
      themeState.textColor,
      resolved?.textColor || (isDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000'))
    );
  }

  function appendLine3dBackground(svg, width, height, session = null){
    if(!svg){
      return;
    }
    const staleBackgrounds = svg.querySelectorAll('[data-color-scheme-background="1"]');
    staleBackgrounds.forEach(node => {
      try { node.remove(); } catch (err) {}
    });
    const themeState = getLineThemeState(session);
    const resolved = Shared.colorSchemes?.resolveThemeState?.('line', { config: { colorScheme: themeState.colorScheme } });
    const isDark = resolved ? resolved.isDark === true : (String(themeState.colorScheme || '').toLowerCase() === 'dark');
    if(isDark){
      const color = normalizeLineThemeColor(themeState.backgroundColor, resolved?.background || '#000000');
      svg.setAttribute('data-color-scheme-bg-color', color);
      if(svg.style){
        svg.style.backgroundColor = color;
      }
    }else{
      svg.removeAttribute('data-color-scheme-bg-color');
      if(svg.style){
        svg.style.removeProperty('background-color');
      }
    }
  }
  let lineSvgBoxRef = null;
  let lineSuppressResizeObserveUntil = 0;
  let lineLockRatioInput = null;
  let lineEqualAxesInput = null;
  let lineEqualScaleAxesInput = null;
  let lineVarianceAxisScaleInput = null;
  let lineAxesLengthLockRatioPrevious = null;
  let lineAspectSyncing = false;
  let lineLogPlusOneX = false;
  let lineLogPlusOneY = false;
  let lineLast2dDisplayMode = 'line';
  let lineLast2dLogX = false;
  let lineLast2dLogY = false;
  let lineLast2dShowFrame = false;
  let lineLast2dShowTrendLine = false;
  let lineLast2dShowIntervals = false;
  let lineLast2dShowPredictionIntervals = false;
  let lineLast2dShowPlotStats = false;
  const lineUndoManager = Shared.undoManager || null;

  function stabilizeLineMarginForAxisResize(margin, options = {}){
    if(!margin || typeof margin !== 'object'){
      return margin;
    }
    if(typeof chartStyle.stabilizeAxisResizeMargins !== 'function'){
      return margin;
    }
    return chartStyle.stabilizeAxisResizeMargins(margin, {
      svgBox: options.svgBox || lineSvgBoxRef || refs.svgBox || null,
      scopeId: 'line',
      commitBaseline: options.commitBaseline !== false
    });
  }

  function isLine3dMode(options = {}){
    const hot = options.hot || options.hotInstance || null;
    if(hot){
      return getLineTableFormatForHot(hot, options) === '3d';
    }
    return getLineViewState().viewMode === '3d' || refs.replicateMode?.value === '3d';
  }

  function isLine3dTableActive(hotInstance = null, options = {}){
    const hot = hotInstance || options.hot || options.hotInstance || null;
    if(hot){
      return getLineTableFormatForHot(hot, { ...options, hotInstance: hot }) === '3d';
    }
    return isLine3dMode(options);
  }

  function syncLine3dAxisHeadersFromTable(changes, source, options = {}){
    const hot = options.hot || options.hotInstance || getActiveLineHotManager();
    if(!hot || !isLine3dTableActive(hot, options) || !Array.isArray(changes) || !changes.length){
      return;
    }
    if(source === 'line-3d-axis-table-sync' || source === 'line-3d-header-normalize' || source === 'line-axis-inline'){
      return;
    }
    const data = hot.getData ? (hot.getData() || []) : [];
    const seriesCount = Math.max(0, inferLine3dSeriesCount(data));
    if(!seriesCount){
      return;
    }
    const colCount = typeof hot.countCols === 'function'
      ? hot.countCols()
      : Math.max(0, (Array.isArray(data[0]) ? data[0].length : 0));
    const axisRow = Array.isArray(data[LINE_3D_AXIS_HEADER_ROW_INDEX])
      ? data[LINE_3D_AXIS_HEADER_ROW_INDEX]
      : [];
    const pending = [];
    changes.forEach(change => {
      if(!Array.isArray(change) || change.length < 4){
        return;
      }
      const row = Number(change[0]);
      const col = Number(change[1]);
      if(row !== LINE_3D_AXIS_HEADER_ROW_INDEX || !Number.isInteger(col) || col < 0){
        return;
      }
      const axisOffset = col % LINE_3D_COLS_PER_DATASET;
      if(axisOffset < 0 || axisOffset >= LINE_3D_COLS_PER_DATASET){
        return;
      }
      const fallback = LINE_3D_AXIS_LABELS[axisOffset] || '';
      const resolved = change[3] != null && String(change[3]).trim()
        ? String(change[3]).trim()
        : fallback;
      for(let s = 0; s < seriesCount; s += 1){
        const colIndex = s * LINE_3D_COLS_PER_DATASET + axisOffset;
        if(colIndex === col || colIndex >= colCount){
          continue;
        }
        const current = axisRow[colIndex] != null ? String(axisRow[colIndex]).trim() : '';
        if(current !== resolved){
          pending.push([LINE_3D_AXIS_HEADER_ROW_INDEX, colIndex, resolved]);
        }
      }
    });
    if(pending.length){
      hot.setDataAtCell(pending, 'line-3d-axis-table-sync');
      lineDebug('Debug: line 3d axis header sync applied', { count: pending.length, source });
    }
  }
  function recordLineChange(label, previous, next, apply){
    if(!lineUndoManager || typeof lineUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    const recorder = Shared.styleUndo?.recordStateChange || ((opts) => lineUndoManager.recordStateChange(opts));
    recorder({
      manager: lineUndoManager,
      label,
      scope: 'lineGraphPanel',
      from: previous,
      to: next,
      apply(value){
        apply(value);
        return true;
      }
    });
  }
  // PART: LEGEND
  function createDefaultLineLegendLayoutInfo(){
    return {
      entryCount: 0,
      rendererWidth: 0,
      legendWidthForMargin: 0,
      legendGapPx: 0,
      minSvgWidth: chartStyle.LEGEND_LAYOUT_CONSTANTS?.basePlotMinWidth || 320,
      basePlotWidth: chartStyle.LEGEND_LAYOUT_CONSTANTS?.basePlotMinWidth || 320,
      guardPaddingPx: chartStyle.LEGEND_LAYOUT_CONSTANTS?.guardPaddingPx || 24,
      swatchSize: 0,
      swatchGap: 0,
      rowGap: 0,
      rowHeight: 0,
      fontSize: 12,
      minWidth: 0,
      maxLabelWidth: 0,
      entries: []
    };
  }
  let lineLegendItems = [];
  let lineLegendWidth = 0;
  let lineMinSvgWidth = 0;
  let lineLegendLayoutInfo = createDefaultLineLegendLayoutInfo();
  let lineSeriesStyles = {};
  const LINE_OVERLAY_STYLE_DEFAULTS = Object.freeze({
    trend: Object.freeze({ color: 'auto', thickness: 1, transparency: 0, pattern: 'dashed' }),
    confidence: Object.freeze({ color: 'auto', thickness: 0, transparency: 85, pattern: 'solid' }),
    prediction: Object.freeze({ color: 'auto', thickness: 0, transparency: 92, pattern: 'solid' })
  });
  function normalizeLineOverlaySeriesKey(value){
    return String(value == null ? '' : value).trim();
  }
  function cloneLineOverlayStyleDefaults(){
    return {
      trend: { ...LINE_OVERLAY_STYLE_DEFAULTS.trend },
      confidence: { ...LINE_OVERLAY_STYLE_DEFAULTS.confidence },
      prediction: { ...LINE_OVERLAY_STYLE_DEFAULTS.prediction },
      bySeries: {}
    };
  }
  function sanitizeLineOverlayKey(key){
    const normalized = String(key || '').trim().toLowerCase();
    if(normalized === 'trend' || normalized === 'confidence' || normalized === 'prediction'){
      return normalized;
    }
    return null;
  }
  function sanitizeLineOverlayStyleEntry(entry, key){
    const safeKey = sanitizeLineOverlayKey(key);
    if(!safeKey){
      return null;
    }
    const fallback = LINE_OVERLAY_STYLE_DEFAULTS[safeKey] || LINE_OVERLAY_STYLE_DEFAULTS.trend;
    const next = entry && typeof entry === 'object' ? entry : {};
    const rawColor = typeof next.color === 'string' && next.color.trim()
      ? next.color.trim()
      : fallback.color;
    const color = String(rawColor || '').trim().toLowerCase() === 'auto'
      ? 'auto'
      : (String(rawColor || '').trim() || 'auto');
    const thicknessRaw = Number(next.thickness);
    const thickness = Number.isFinite(thicknessRaw)
      ? Math.max(0, thicknessRaw)
      : fallback.thickness;
    const transparencyRaw = Number(next.transparency);
    const transparency = Number.isFinite(transparencyRaw)
      ? Math.min(100, Math.max(0, transparencyRaw))
      : fallback.transparency;
    const patternRaw = String(next.pattern || next.linePattern || fallback.pattern || 'solid').toLowerCase();
    const pattern = (patternRaw === 'dashed' || patternRaw === 'dotted' || patternRaw === 'solid' || patternRaw === 'continuous')
      ? (patternRaw === 'continuous' ? 'solid' : patternRaw)
      : 'solid';
    return { color, thickness, transparency, pattern };
  }
  function lineOverlayPatternToDasharray(pattern, width){
    const normalized = String(pattern || 'solid').toLowerCase();
    const thickness = Number.isFinite(Number(width)) ? Math.max(0.5, Number(width)) : 1;
    if(normalized === 'dashed'){
      return `${Math.max(2, Math.round(thickness * 4))} ${Math.max(2, Math.round(thickness * 2.4))}`;
    }
    if(normalized === 'dotted'){
      return `${Math.max(1, Math.round(thickness))} ${Math.max(2, Math.round(thickness * 2.2))}`;
    }
    return '';
  }
  function resolveLineOverlayStrokeColor(styleColor, seriesColor, fallbackColor){
    const raw = String(styleColor == null ? '' : styleColor).trim();
    if(!raw || raw.toLowerCase() === 'auto'){
      const fromSeries = String(seriesColor == null ? '' : seriesColor).trim();
      if(fromSeries){
        return fromSeries;
      }
      const fromFallback = String(fallbackColor == null ? '' : fallbackColor).trim();
      if(fromFallback){
        return fromFallback;
      }
      return '#000000';
    }
    return raw;
  }
  function buildLineRegressionTrendPath(samples, options = {}){
    const source = Array.isArray(samples)
      ? samples.slice().sort((a, b) => (a?.x ?? 0) - (b?.x ?? 0))
      : [];
    const projectX = typeof options.projectX === 'function' ? options.projectX : null;
    const projectY = typeof options.projectY === 'function' ? options.projectY : null;
    if(!source.length || !projectX || !projectY){
      return null;
    }
    const logX = !!options.logX;
    const logY = !!options.logY;
    const xMin = Number.isFinite(options.xMin) ? options.xMin : -Infinity;
    const xMax = Number.isFinite(options.xMax) ? options.xMax : Infinity;
    const yMin = Number.isFinite(options.yMin) ? options.yMin : -Infinity;
    const yMax = Number.isFinite(options.yMax) ? options.yMax : Infinity;
    const isXVisible = typeof options.isXVisible === 'function' ? options.isXVisible : (() => true);
    const isYVisible = typeof options.isYVisible === 'function' ? options.isYVisible : (() => true);
    const segments = [];
    let current = [];
    const flush = () => {
      if(current.length >= 2){
        segments.push(current);
      }
      current = [];
    };
    source.forEach(sample => {
      const xRaw = Number(sample?.x);
      const yRaw = Number(sample?.y);
      if(!Number.isFinite(xRaw) || !Number.isFinite(yRaw) || (logX && xRaw <= 0) || (logY && yRaw <= 0)){
        flush();
        return;
      }
      const xValue = logX ? Math.log10(xRaw) : xRaw;
      const yValue = logY ? Math.log10(yRaw) : yRaw;
      if(!Number.isFinite(xValue) || !Number.isFinite(yValue)
        || xValue < xMin || xValue > xMax || yValue < yMin || yValue > yMax
        || !isXVisible(xValue) || !isYVisible(yValue)){
        flush();
        return;
      }
      const x = Number(projectX(xValue));
      const y = Number(projectY(yValue));
      if(!Number.isFinite(x) || !Number.isFinite(y)){
        flush();
        return;
      }
      current.push({ x, y });
    });
    flush();
    if(!segments.length){
      return null;
    }
    const commands = [];
    segments.forEach(segment => {
      segment.forEach((point, index) => {
        commands.push(`${index ? 'L' : 'M'}${point.x},${point.y}`);
      });
    });
    return { d: commands.join(' '), commandCount: commands.length, segmentCount: segments.length };
  }
  function isLineConfidenceIntervalEnabled(){
    return !!resolveLineOverlayControls()?.showIntervals?.checked;
  }
  function isLinePredictionIntervalEnabled(){
    return !!resolveLineOverlayControls()?.showPredictionIntervals?.checked;
  }
  function isLineAnyIntervalEnabled(){
    return isLineConfidenceIntervalEnabled() || isLinePredictionIntervalEnabled();
  }
  function sanitizeLineOverlayStylesMap(value){
    const defaults = cloneLineOverlayStyleDefaults();
    if(!value || typeof value !== 'object'){
      return defaults;
    }
    Object.keys(defaults).forEach(key => {
      if(key === 'bySeries'){
        return;
      }
      defaults[key] = sanitizeLineOverlayStyleEntry(value[key], key) || defaults[key];
    });
    const sourceBySeries = value.bySeries && typeof value.bySeries === 'object'
      ? value.bySeries
      : {};
    const bySeries = {};
    Object.keys(sourceBySeries).forEach(rawSeriesKey => {
      const seriesKey = normalizeLineOverlaySeriesKey(rawSeriesKey);
      if(!seriesKey){
        return;
      }
      const sourceEntry = sourceBySeries[rawSeriesKey];
      if(!sourceEntry || typeof sourceEntry !== 'object'){
        return;
      }
      const nextEntry = {};
      ['trend', 'confidence', 'prediction'].forEach(overlayKey => {
        const style = sanitizeLineOverlayStyleEntry(sourceEntry[overlayKey], overlayKey);
        if(style){
          nextEntry[overlayKey] = style;
        }
      });
      if(Object.keys(nextEntry).length){
        bySeries[seriesKey] = nextEntry;
      }
    });
    defaults.bySeries = bySeries;
    return defaults;
  }
  let lineOverlayStyles = cloneLineOverlayStyleDefaults();
  let lineOverlayToolbarScope = 'global';
  function getLineOverlayStyle(key, seriesKey){
    const safeKey = sanitizeLineOverlayKey(key);
    if(!safeKey){
      return null;
    }
    const safeSeriesKey = normalizeLineOverlaySeriesKey(seriesKey);
    if(safeSeriesKey){
      const scoped = sanitizeLineOverlayStyleEntry(lineOverlayStyles?.bySeries?.[safeSeriesKey]?.[safeKey], safeKey);
      if(scoped){
        return scoped;
      }
    }
    return sanitizeLineOverlayStyleEntry(lineOverlayStyles?.[safeKey], safeKey)
      || sanitizeLineOverlayStyleEntry(LINE_OVERLAY_STYLE_DEFAULTS[safeKey], safeKey);
  }
  function updateLineOverlayStyle(key, patch, seriesKey){
    const safeKey = sanitizeLineOverlayKey(key);
    if(!safeKey){
      return;
    }
    const safeSeriesKey = normalizeLineOverlaySeriesKey(seriesKey);
    const previous = getLineOverlayStyle(safeKey, safeSeriesKey) || sanitizeLineOverlayStyleEntry(null, safeKey);
    const merged = sanitizeLineOverlayStyleEntry(Object.assign({}, previous || {}, patch || {}), safeKey);
    if(!merged){
      return;
    }
    lineOverlayStyles = lineOverlayStyles && typeof lineOverlayStyles === 'object'
      ? lineOverlayStyles
      : cloneLineOverlayStyleDefaults();
    if(safeSeriesKey){
      if(!lineOverlayStyles.bySeries || typeof lineOverlayStyles.bySeries !== 'object'){
        lineOverlayStyles.bySeries = {};
      }
      const previousSeriesEntry = lineOverlayStyles.bySeries[safeSeriesKey] && typeof lineOverlayStyles.bySeries[safeSeriesKey] === 'object'
        ? lineOverlayStyles.bySeries[safeSeriesKey]
        : {};
      lineOverlayStyles.bySeries[safeSeriesKey] = Object.assign({}, previousSeriesEntry, { [safeKey]: merged });
      return;
    }
    lineOverlayStyles[safeKey] = merged;
  }
  function parseLineOverlayToolbarScope(value){
    const raw = String(value == null ? '' : value).trim();
    if(!raw){
      return { mode: 'global', overlayKey: null, seriesKey: '' };
    }
    if(raw.toLowerCase() === 'global'){
      return { mode: 'global', overlayKey: null, seriesKey: '' };
    }
    const tokenIndex = raw.indexOf('::');
    if(tokenIndex > 0){
      const overlayKey = sanitizeLineOverlayKey(raw.slice(0, tokenIndex));
      let decodedSeries = raw.slice(tokenIndex + 2);
      try{
        decodedSeries = decodeURIComponent(decodedSeries);
      }catch(err){}
      const seriesKey = normalizeLineOverlaySeriesKey(decodedSeries);
      if(overlayKey && seriesKey){
        return { mode: 'series', overlayKey, seriesKey };
      }
      if(overlayKey){
        return { mode: 'overlay', overlayKey, seriesKey: '' };
      }
      return { mode: 'global', overlayKey: null, seriesKey: '' };
    }
    const overlayKey = sanitizeLineOverlayKey(raw);
    if(overlayKey){
      return { mode: 'overlay', overlayKey, seriesKey: '' };
    }
    return { mode: 'global', overlayKey: null, seriesKey: '' };
  }
  // PART: OVERLAY
  function buildLineOverlaySeriesScopeValue(overlayKey, seriesKey){
    const safeKey = sanitizeLineOverlayKey(overlayKey);
    const safeSeriesKey = normalizeLineOverlaySeriesKey(seriesKey);
    if(!safeKey){
      return 'global';
    }
    if(!safeSeriesKey){
      return safeKey;
    }
    return `${safeKey}::${encodeURIComponent(safeSeriesKey)}`;
  }
  function normalizeLineOverlayToolbarScope(value){
    const parsed = parseLineOverlayToolbarScope(value);
    if(parsed.mode === 'global'){
      return 'global';
    }
    if(parsed.mode === 'series'){
      return buildLineOverlaySeriesScopeValue(parsed.overlayKey, parsed.seriesKey);
    }
    return sanitizeLineOverlayKey(parsed.overlayKey) || 'global';
  }
  function getLineOverlayScopeTargets(scopeKey){
    const parsed = parseLineOverlayToolbarScope(scopeKey);
    if(parsed.mode === 'global'){
      return [
        { key: 'trend', seriesKey: '' },
        { key: 'confidence', seriesKey: '' },
        { key: 'prediction', seriesKey: '' }
      ];
    }
    if(parsed.mode === 'series'){
      return [{ key: parsed.overlayKey, seriesKey: parsed.seriesKey }];
    }
    return [{ key: parsed.overlayKey || 'trend', seriesKey: '' }];
  }
  function getLineOverlayPreviewStyle(scopeKey){
    const targets = getLineOverlayScopeTargets(scopeKey);
    const firstTarget = targets.length ? targets[0] : { key: 'trend', seriesKey: '' };
    return getLineOverlayStyle(firstTarget.key, firstTarget.seriesKey);
  }
  function getLineOverlayToolbarLabels(scopeKey){
    const parsed = parseLineOverlayToolbarScope(scopeKey);
    if(parsed.mode === 'global'){
      return {
        colorLabel: 'Color',
        thicknessLabel: 'Thickness',
        patternLabel: 'Line pattern',
        transparencyLabel: 'Transparency'
      };
    }
    if(parsed.overlayKey === 'trend'){
      return {
        colorLabel: 'Line',
        thicknessLabel: 'Line width',
        patternLabel: 'Line pattern',
        transparencyLabel: 'Line transparency'
      };
    }
    return {
      colorLabel: 'Fill',
      thicknessLabel: 'Border thickness',
      patternLabel: 'Line pattern',
      transparencyLabel: 'Fill transparency'
    };
  }
  let line3dLastSeriesCount = null;
  const LINE_3D_COLS_PER_DATASET = 3;
  const LINE_3D_DATASET_HEADER_ROW_INDEX = 0;
  const LINE_3D_AXIS_HEADER_ROW_INDEX = 1;
  const LINE_3D_HEADER_ROW_COUNT = 2;
  const LINE_3D_AXIS_KEYS = Object.freeze(['x', 'y', 'z']);
  const LINE_3D_AXIS_LABELS = Object.freeze(['X', 'Y', 'Z']);
  function createDefaultLineModeCache(){
    return {
      twoD: null,
      threeD: null,
      lastTwoDFormat: 'single'
    };
  }

  function attachLineSelectAutoSize(select, label){
    if(!select){ return; }
    if(typeof formControls.attachSelectAutoSize === 'function'){
      formControls.attachSelectAutoSize(select, label || 'line');
      return;
    }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: line select auto-size watcher attached', {
            id: select.id || null,
            label: label || null
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: line select auto-size applied without watcher', {
            id: select.id || null,
            label: label || null
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: line select auto-size helper unavailable', {
          id: select.id || null,
          label: label || null
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: line select auto-size attach error', {
          id: select.id || null,
          label: label || null,
          error: err?.message || String(err)
        });
      }
    }
  }
  function sanitizeLineDisplayMode(mode){
    return LINE_DISPLAY_MODE_OPTIONS.includes(mode) ? mode : 'line';
  }

  function resolveLineAreaBaselineValue({ yMin, yMax, logY }){
    let min = Number.isFinite(yMin) ? yMin : null;
    let max = Number.isFinite(yMax) ? yMax : null;
    if(min == null && max == null){
      return 0;
    }
    if(min == null){
      min = max;
    }
    if(max == null){
      max = min;
    }
    if(logY){
      const positiveFloor = min > 0 ? min : (max > 0 ? Math.max(min, Math.min(max, 1e-6)) : 1);
      return positiveFloor > 0 ? positiveFloor : 1;
    }
    if(min <= 0 && max >= 0){
      return 0;
    }
    if(min > 0){
      return min;
    }
    if(max < 0){
      return max;
    }
    return min;
  }
  function clampLineAlpha(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : null;
  }
    let lineFileHandle = null;
    let lineFileName = 'line.graph';
    let lineReplicates = LINE_MIN_REPLICATES;
    let lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, LINE_MIN_REPLICATES + 1));
  let lineSeriesGroupLabels = [];
  let lineGroupShapes = [];
  let lineLastRegressionSummaries = [];
  const lineStatsDefaultPlaceholder = 'Statistics will appear after calculation.';
  const lineStatsEmptyPlaceholder = 'Add data to enable statistics.';
  function setLineFileHandleForSession(handle, session = null){
    const owner = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    if(owner?.managers){
      owner.managers.fileHandle = handle || null;
      owner.updatedAt = Date.now();
    }
    if(!owner || isLineSessionActive(owner)){
      lineFileHandle = handle || null;
    }
    return handle || null;
  }

  function setLineFileNameForSession(name, session = null){
    const nextName = name || 'line.graph';
    const owner = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    if(owner?.state){
      owner.state.fileName = nextName;
      owner.updatedAt = Date.now();
    }
    if(!owner || isLineSessionActive(owner)){
      lineFileName = nextName;
    }
    return nextName;
  }

  function createDefaultLineStatsState(){
    return {
      context: null,
      signature: null,
      version: 0,
      lastRunVersion: 0,
      hasResults: false,
      computationPending: false,
      restorePending: null,
      regressionSummaries: [],
      panelModel: { resultsModel: null, reportModel: null }
    };
  }
  let lineFallbackStatsState = createDefaultLineStatsState();
  let lineForecastOptions = {
    horizon: DEFAULT_FORECAST_HORIZON,
    seasonLength: DEFAULT_FORECAST_SEASON,
    autoTune: true,
    criterion: 'bic'
  };
  function createDefaultLineAdvisorState(){
    return {
      open:false,
      activated:false,
      answers:{},
      lastApplied:null,
      context:null
    };
  }
  let lineAdvisorState = createDefaultLineAdvisorState();

  function resolveLineTabIdFromNode(node){
    return Shared.componentLifecycle?.resolveTabIdFromTarget?.(node) || null;
  }

  function resolveLineOwnedRuntimeTabId(tabLike = null, meta = {}){
    const direct = (tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike)
      || meta?.tabId
      || meta?.workspaceTabId
      || meta?.tab?.id
      || projectedLineSession?.managers?.hot?.__lineTabId
      || lineFallbackHotManager?.__lineTabId
      || resolveLineTabIdFromNode(refs?.root || null)
      || getLineProjectionTabId()
      || null;
    if(direct){
      return String(direct);
    }
    return '';
  }

  function getLineTabPayloadConfig(tabLike){
    const tabId = String((tabLike && typeof tabLike === 'object' ? tabLike.id : tabLike) || '').trim();
    const session = global.Main?.session || null;
    const tabs = Array.isArray(session?.workspaceState?.tabs) ? session.workspaceState.tabs : [];
    const tab = tabId
      ? (tabs.find(item => item && String(item.id || '') === tabId) || null)
      : (typeof session?.getActiveTab === 'function' ? session.getActiveTab() : null);
    if(!tab || tab.type !== 'line'){
      return null;
    }
    const cfg = tab?.payload?.config;
    return cfg && typeof cfg === 'object' ? cfg : null;
  }

  function cloneLinePlainObject(value, fallbackFactory){
    const cloned = cloneSimple(value);
    if(cloned && typeof cloned === 'object' && !Array.isArray(cloned)){
      return cloned;
    }
    return typeof fallbackFactory === 'function' ? fallbackFactory() : {};
  }

  function normalizeLineStatsPanelModel(value){
    const source = value && typeof value === 'object' ? value : {};
    const nested = source.panelModel && typeof source.panelModel === 'object' ? source.panelModel : null;
    const resultsModel = source.resultsModel || nested?.resultsModel || null;
    const reportModel = source.reportModel || nested?.reportModel || null;
    return {
      resultsModel: cloneLineRuntimeValue(resultsModel, null),
      reportModel: cloneLineRuntimeValue(reportModel, null)
    };
  }

  function lineStatsPanelNodeHasStatContent(node){
    if(!node || typeof node !== 'object'){
      return false;
    }
    if(node.kind === 'stats-report' || node.type === 'stats-table'){
      return true;
    }
    const className = typeof node.className === 'string' ? node.className : '';
    if(/(?:^|\s)(?:stats-table-card|stats-report-panel|stats-assumption-container)(?:\s|$)/.test(className)){
      return true;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    return children.some(lineStatsPanelNodeHasStatContent);
  }

  function lineStatsPanelModelHasContent(model){
    const normalized = normalizeLineStatsPanelModel(model);
    return lineStatsPanelNodeHasStatContent(normalized.resultsModel)
      || lineStatsPanelNodeHasStatContent(normalized.reportModel);
  }

  function captureLineStatsPanelModel(fallback = null, options = {}){
    const lineRefs = resolveLineRefsContext(options.session || null, options);
    const statsResults = lineRefs.statsResults || null;
    let captured = null;
    if(statsResults && Shared.statsReporting && typeof Shared.statsReporting.capturePanelModel === 'function'){
      try{
        captured = Shared.statsReporting.capturePanelModel(statsResults);
      }catch(err){
        console.debug('Debug: line stats panel capture failed', { err: err?.message || String(err) });
      }
    }
    const normalizedCaptured = normalizeLineStatsPanelModel(captured);
    if(lineStatsPanelModelHasContent(normalizedCaptured)){
      return normalizedCaptured;
    }
    return normalizeLineStatsPanelModel(fallback || getLineStatsState(options.session || null)?.panelModel || null);
  }

  function normalizeLineOwnedViewState(value){
    const next = cloneLinePlainObject(value, createDefaultLineViewState);
    next.viewMode = next.viewMode === '3d' ? '3d' : '2d';
    next.requestedViewMode = next.requestedViewMode || null;
    next.rotation = next.rotation && typeof next.rotation === 'object'
      ? next.rotation
      : createDefaultLineViewState().rotation;
    next.rotationPending = false;
    next.rotationPendingLogged = false;
    next.forcedLockRatioPrevious = (next.forcedLockRatioPrevious === true || next.forcedLockRatioPrevious === false)
      ? !!next.forcedLockRatioPrevious
      : null;
    // One-axis resize locks are interaction-local DOM/runtime state. Older
    // payloads may contain these legacy fields; never rehydrate them as durable
    // view state because a restored render cache must establish a fresh baseline.
    delete next.resizeMarginLock;
    delete next.resizeViewportLock;
    if(typeof plot3d.normalizeRotation === 'function'){
      try{ plot3d.normalizeRotation(next.rotation); }catch(_err){}
    }
    return next;
  }

  function normalizeLineOwnedAutoDrawState(value){
    const next = cloneLinePlainObject(value, createDefaultLineAutoDrawState);
    next.drawPending = false;
    if(!next.lastDataShape || typeof next.lastDataShape !== 'object'){
      next.lastDataShape = { rows: 0, cols: 0 };
    }
    return next;
  }

  function normalizeLineOwnedStatsState(value){
    const next = cloneLinePlainObject(value, createDefaultLineStatsState);
    next.computationPending = false;
    next.restorePending = null;
    next.context = next.context && typeof next.context === 'object' ? next.context : null;
    next.signature = next.signature || null;
    next.version = Number(next.version) || 0;
    next.lastRunVersion = Number(next.lastRunVersion) || 0;
    next.regressionSummaries = Array.isArray(next.regressionSummaries) ? cloneLineRuntimeValue(next.regressionSummaries, []) : [];
    next.panelModel = normalizeLineStatsPanelModel(next.panelModel || next);
    next.hasResults = !!next.hasResults && next.version > 0 && next.lastRunVersion === next.version;
    if(lineStatsPanelModelHasContent(next.panelModel) && next.version > 0 && next.lastRunVersion === next.version){
      next.hasResults = true;
    }
    return next;
  }

  function normalizeLineAdvisorState(value){
    const input = value && typeof value === 'object' ? value : {};
    const contextInput = input.context && typeof input.context === 'object' ? input.context : null;
    const context = contextInput
      ? cloneLineRuntimeValue(Object.fromEntries(Object.entries(contextInput).filter(([key]) => key !== 'session')), null)
      : null;
    return {
      open: !!input.open,
      activated: !!input.activated,
      answers: input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers)
        ? cloneLineRuntimeValue(input.answers, {})
        : {},
      lastApplied: input.lastApplied && typeof input.lastApplied === 'object'
        ? cloneLineRuntimeValue(input.lastApplied, null)
        : null,
      context
    };
  }

  function normalizeLineOwnedModeCache(value){
    const next = cloneLinePlainObject(value, createDefaultLineModeCache);
    next.twoD = cloneSimple(next.twoD) || null;
    next.threeD = cloneSimple(next.threeD) || null;
    next.lastTwoDFormat = next.lastTwoDFormat === 'grouped' ? 'grouped' : 'single';
    return next;
  }

  function createDefaultLineLast2dState(){
    return {
      displayMode: 'line',
      logX: false,
      logY: false,
      showFrame: false,
      showTrendLine: false,
      showIntervals: false,
      showPredictionIntervals: false,
      showPlotStats: false
    };
  }

  function normalizeLineOwnedLast2dState(value){
    const defaults = createDefaultLineLast2dState();
    const input = value && typeof value === 'object' ? value : {};
    return {
      displayMode: sanitizeLineDisplayMode(input.displayMode || defaults.displayMode),
      logX: !!input.logX,
      logY: !!input.logY,
      showFrame: !!input.showFrame,
      showTrendLine: !!input.showTrendLine,
      showIntervals: !!input.showIntervals,
      showPredictionIntervals: !!input.showPredictionIntervals,
      showPlotStats: !!input.showPlotStats
    };
  }

  function createDefaultLineLabelsState(){
    return {
      title: 'Line graph',
      x: 'X',
      y: 'Y title',
      z: 'Z',
      colors: {},
      positions: { title: null, xLabel: null, yLabel: null, legend: null, stats: null }
    };
  }

  function normalizeLineOwnedLabelsState(value){
    const defaults = createDefaultLineLabelsState();
    const input = value && typeof value === 'object' ? value : {};
    const positions = input.positions && typeof input.positions === 'object'
      ? (cloneSimple(input.positions) || {})
      : {};
    return {
      title: typeof input.title === 'string' ? input.title : defaults.title,
      x: typeof input.x === 'string' ? input.x : defaults.x,
      y: typeof input.y === 'string' ? input.y : defaults.y,
      z: typeof input.z === 'string' ? input.z : defaults.z,
      colors: cloneSimple(input.colors) || {},
      positions: { ...cloneSimple(defaults.positions), ...positions }
    };
  }

  function createDefaultLineThemeState(){
    return {
      colorScheme: 'scientific',
      textColor: chartStyle.TEXT_COLOR || '#000000',
      backgroundColor: '#ffffff'
    };
  }

  function normalizeLineOwnedThemeState(value){
    const defaults = createDefaultLineThemeState();
    const input = value && typeof value === 'object' ? value : {};
    return {
      colorScheme: typeof input.colorScheme === 'string' && input.colorScheme.trim() ? input.colorScheme.trim().toLowerCase() : defaults.colorScheme,
      textColor: normalizeLineThemeColor(input.textColor, defaults.textColor),
      backgroundColor: normalizeLineThemeColor(input.backgroundColor, defaults.backgroundColor)
    };
  }

  function createDefaultLineStyleState(){
    return {
      series: {},
      overlays: cloneLineOverlayStyleDefaults(),
      overlayToolbarScope: 'global'
    };
  }

  function normalizeLineOwnedStyleState(value){
    const defaults = createDefaultLineStyleState();
    const input = value && typeof value === 'object' ? value : {};
    return {
      series: cloneSimple(input.series) || {},
      overlays: sanitizeLineOverlayStylesMap(input.overlays || defaults.overlays),
      overlayToolbarScope: normalizeLineOverlayToolbarScope(input.overlayToolbarScope || defaults.overlayToolbarScope)
    };
  }

  function createDefaultLineGroupedState(){
    return {
      replicates: LINE_MIN_REPLICATES,
      lastGroupedReplicateCount: Math.min(LINE_MAX_REPLICATES, Math.max(2, LINE_MIN_REPLICATES + 1)),
      labels: [],
      shapes: []
    };
  }

  function normalizeLineOwnedGroupedState(value){
    const defaults = createDefaultLineGroupedState();
    const input = value && typeof value === 'object' ? value : {};
    return {
      replicates: clampLineReplicateCount(input.replicates || defaults.replicates),
      lastGroupedReplicateCount: clampLineReplicateCount(input.lastGroupedReplicateCount || defaults.lastGroupedReplicateCount),
      labels: Array.isArray(input.labels) ? input.labels.map(item => item == null ? '' : String(item)) : [],
      shapes: Array.isArray(input.shapes) ? input.shapes.map((shape, idx) => sanitizeLineGroupShape(shape, idx)) : []
    };
  }

  function createDefaultLineForecastState(){
    return {
      horizon: DEFAULT_FORECAST_HORIZON,
      seasonLength: DEFAULT_FORECAST_SEASON,
      autoTune: true,
      criterion: 'bic'
    };
  }

  function normalizeLineOwnedForecastState(value){
    const defaults = createDefaultLineForecastState();
    const input = value && typeof value === 'object' ? value : {};
    return {
      horizon: clampForecastHorizon(input.horizon ?? defaults.horizon),
      seasonLength: clampSeasonLength(input.seasonLength ?? defaults.seasonLength),
      autoTune: input.autoTune == null ? defaults.autoTune : !!input.autoTune,
      criterion: typeof input.criterion === 'string' && input.criterion.trim() ? input.criterion.trim().toLowerCase() : defaults.criterion
    };
  }

  function normalizeLineOwnedLogPlusOneState(value){
    const input = value && typeof value === 'object' ? value : {};
    return { x: !!input.x, y: !!input.y };
  }

  function createLineOwnedRuntimeRecord(tabId){
    return {
      version: 2,
      componentKey: 'line',
      tabId: tabId || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hydrated: false,
      displayMode: 'line',
      last2d: createDefaultLineLast2dState(),
      logPlusOne: { x: false, y: false },
      labels: createDefaultLineLabelsState(),
      theme: createDefaultLineThemeState(),
      styles: createDefaultLineStyleState(),
      grouped: createDefaultLineGroupedState(),
      forecast: createDefaultLineForecastState(),
      axisSettings: typeof createLineAxisSettings === 'function' ? createLineAxisSettings() : null,
      gridStyle: null,
      regressionSummaries: [],
      viewState: createDefaultLineViewState(),
      autoDrawState: createDefaultLineAutoDrawState(),
      statsState: createDefaultLineStatsState(),
      advisorState: createDefaultLineAdvisorState(),
      modeCache: createDefaultLineModeCache()
    };
  }

  function normalizeLineOwnedRuntimeRecord(record){
    if(!record || typeof record !== 'object'){
      return null;
    }
    record.displayMode = sanitizeLineDisplayMode(record.displayMode || 'line');
    record.last2d = normalizeLineOwnedLast2dState(record.last2d);
    record.logPlusOne = normalizeLineOwnedLogPlusOneState(record.logPlusOne);
    record.labels = normalizeLineOwnedLabelsState(record.labels);
    record.theme = normalizeLineOwnedThemeState(record.theme);
    record.styles = normalizeLineOwnedStyleState(record.styles);
    record.grouped = normalizeLineOwnedGroupedState(record.grouped);
    record.forecast = normalizeLineOwnedForecastState(record.forecast);
    record.axisSettings = record.axisSettings && typeof record.axisSettings === 'object'
      ? cloneSimple(record.axisSettings)
      : (typeof createLineAxisSettings === 'function' ? createLineAxisSettings() : null);
    record.gridStyle = record.gridStyle && typeof record.gridStyle === 'object' ? cloneSimple(record.gridStyle) : null;
    record.regressionSummaries = Array.isArray(record.regressionSummaries) ? record.regressionSummaries.slice() : [];
    record.viewState = normalizeLineOwnedViewState(record.viewState);
    record.autoDrawState = normalizeLineOwnedAutoDrawState(record.autoDrawState);
    record.statsState = normalizeLineOwnedStatsState(record.statsState);
    record.advisorState = normalizeLineAdvisorState(record.advisorState || record.statsAdvisor);
    record.modeCache = normalizeLineOwnedModeCache(record.modeCache);
    return record;
  }

  function getLineRuntimeOwner(){
    return Shared.componentLifecycle?.createRuntimeOwner?.(line, {
      componentKey: 'line',
      createDefaultRecord: createLineOwnedRuntimeRecord,
      normalizeRecord: normalizeLineOwnedRuntimeRecord,
      requireSessionRuntime: true
    }) || null;
  }

  function ensureLineOwnedRuntimeRecord(tabLike = null, meta = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike, meta);
    if(!tabId){
      console.warn('Debug: line owned runtime record missing tab id', { reason: meta?.reason || 'ensure-line-owned-runtime' });
      return null;
    }
    const record = getLineRuntimeOwner()?.ensureRecord?.(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'ensure-line-owned-runtime'
    }, { create: true }) || null;
    if(record && record.hydrated !== true){
      console.debug('Debug: line owned runtime record ensured', {
        tabId,
        reason: meta?.reason || 'ensure-line-owned-runtime'
      });
    }
    return record;
  }

  function getLineOwnedRuntimeRecord(tabLike = null, meta = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike, meta);
    if(!tabId){
      return null;
    }
    return getLineRuntimeOwner()?.bindRecord?.(tabId, {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'get-line-owned-runtime'
    }, { requireHydrated: true }) || null;
  }

  function bindExistingLineOwnedRuntimeRecord(tabLike = null, meta = {}){
    const record = getLineOwnedRuntimeRecord(tabLike, meta);
    if(!record){
      return null;
    }
    return bindLineOwnedRuntimeRecord(record.tabId, { ...(meta || {}), tabId: record.tabId });
  }

  function bindLineOwnedRuntimeRecord(tabLike = null, meta = {}){
    const record = getLineOwnedRuntimeRecord(tabLike, meta);
    if(!record){
      return null;
    }
    lineDisplayMode = sanitizeLineDisplayMode(record.displayMode || lineDisplayMode);
    lineLast2dDisplayMode = sanitizeLineDisplayMode(record.last2d.displayMode || lineLast2dDisplayMode);
    lineLast2dLogX = !!record.last2d.logX;
    lineLast2dLogY = !!record.last2d.logY;
    lineLast2dShowFrame = !!record.last2d.showFrame;
    lineLast2dShowTrendLine = !!record.last2d.showTrendLine;
    lineLast2dShowIntervals = !!record.last2d.showIntervals;
    lineLast2dShowPredictionIntervals = !!record.last2d.showPredictionIntervals;
    lineLast2dShowPlotStats = !!record.last2d.showPlotStats;
    lineLogPlusOneX = !!record.logPlusOne.x;
    lineLogPlusOneY = !!record.logPlusOne.y;
    lineTitleText = record.labels.title;
    lineXLabelText = record.labels.x;
    lineYLabelText = record.labels.y;
    lineZLabelText = record.labels.z;
    lineLabelColors = cloneSimple(record.labels.colors) || {};
    lineLabelPositions = cloneSimple(record.labels.positions) || {};
    lineColorSchemeId = record.theme.colorScheme;
    lineTextColor = record.theme.textColor;
    lineBackgroundColor = record.theme.backgroundColor;
    lineSeriesStyles = cloneSimple(record.styles.series) || {};
    lineOverlayStyles = sanitizeLineOverlayStylesMap(record.styles.overlays);
    lineOverlayToolbarScope = normalizeLineOverlayToolbarScope(record.styles.overlayToolbarScope);
    lineReplicates = clampLineReplicateCount(record.grouped.replicates);
    lineLastGroupedReplicateCount = clampLineReplicateCount(record.grouped.lastGroupedReplicateCount);
    lineSeriesGroupLabels = Array.isArray(record.grouped.labels) ? record.grouped.labels.slice() : [];
    lineGroupShapes = Array.isArray(record.grouped.shapes) ? record.grouped.shapes.map((shape, idx) => sanitizeLineGroupShape(shape, idx)) : [];
    lineForecastOptions = normalizeLineOwnedForecastState(record.forecast);
    lineAxisSettings = record.axisSettings && typeof record.axisSettings === 'object' ? cloneSimple(record.axisSettings) : lineAxisSettings;
    lineGridStyle = record.gridStyle && typeof record.gridStyle === 'object' ? cloneSimple(record.gridStyle) : lineGridStyle;
    lineLastRegressionSummaries = Array.isArray(record.regressionSummaries) ? record.regressionSummaries.slice() : [];
    lineAdvisorState = normalizeLineAdvisorState(record.advisorState);
    line.__lineOwnedRuntimeTabId = record.tabId;
    const boundSession = getLineSession(record.tabId, { ...(meta || {}), tabId: record.tabId, reason: 'line-owned-runtime-bound-session' }, { create: true });
    if(boundSession){
      setLineViewState(record.viewState, boundSession);
      setLineAutoDrawState(record.autoDrawState, boundSession);
      setLineStatsState(record.statsState, boundSession);
      setLineRegressionSummariesState(lineLastRegressionSummaries, boundSession);
      setLineAdvisorState(record.advisorState, boundSession);
      setLineSessionModeCache(boundSession, record.modeCache);
      boundSession.state = buildLineCanonicalStateFromGlobals(record.tabId, { ...(meta || {}), tabId: record.tabId }, { readControls: false });
      if(projectedLineSession && projectedLineSession.tabId === record.tabId){
        projectedLineSession = boundSession;
      }
    }else{
      setLineViewState(record.viewState);
      setLineAutoDrawState(record.autoDrawState);
      setLineStatsState(record.statsState);
      setLineRegressionSummariesState(lineLastRegressionSummaries);
      setLineAdvisorState(record.advisorState);
    }
    applyLineLast2dOverlayControls(record.tabId);
    console.debug('Debug: line owned runtime record bound', {
      tabId: record.tabId,
      reason: meta?.reason || 'bind-line-owned-runtime'
    });
    return record;
  }

  function rememberLineOwnedRuntimeRecord(tabLike = null, meta = {}){
    const record = ensureLineOwnedRuntimeRecord(tabLike, meta);
    if(!record){
      return null;
    }
    if(!getLineViewState() || typeof getLineViewState() !== 'object'){
      setLineViewState(createDefaultLineViewState());
    }
    if(!getLineAutoDrawState() || typeof getLineAutoDrawState() !== 'object'){
      setLineAutoDrawState(createDefaultLineAutoDrawState());
    }
    if(!getLineStatsState(record.tabId) || typeof getLineStatsState(record.tabId) !== 'object'){
      setLineStatsState(createDefaultLineStatsState(), record.tabId);
    }
    const modeCache = getLineSessionModeCache(record.tabId, { ...(meta || {}), tabId: record.tabId, reason: 'line-owned-runtime-mode-cache' });
    getLineViewState().rotationPending = false;
    getLineViewState().rotationPendingLogged = false;
    getLineAutoDrawState().drawPending = false;
    getLineStatsState(record.tabId).computationPending = false;
    getLineStatsState(record.tabId).restorePending = null;
    modeCache.lastTwoDFormat = modeCache.lastTwoDFormat === 'grouped' ? 'grouped' : 'single';
    syncLineLast2dControlStateFromRefs(record.tabId);
    record.displayMode = sanitizeLineDisplayMode(lineDisplayMode);
    record.last2d = normalizeLineOwnedLast2dState({
      displayMode: lineLast2dDisplayMode,
      logX: lineLast2dLogX,
      logY: lineLast2dLogY,
      showFrame: lineLast2dShowFrame,
      showTrendLine: lineLast2dShowTrendLine,
      showIntervals: lineLast2dShowIntervals,
      showPredictionIntervals: lineLast2dShowPredictionIntervals,
      showPlotStats: lineLast2dShowPlotStats
    });
    record.logPlusOne = normalizeLineOwnedLogPlusOneState({ x: lineLogPlusOneX, y: lineLogPlusOneY });
    record.labels = normalizeLineOwnedLabelsState({
      title: lineTitleText,
      x: lineXLabelText,
      y: lineYLabelText,
      z: lineZLabelText,
      colors: lineLabelColors,
      positions: lineLabelPositions
    });
    record.theme = normalizeLineOwnedThemeState({
      colorScheme: lineColorSchemeId,
      textColor: lineTextColor,
      backgroundColor: lineBackgroundColor
    });
    record.styles = normalizeLineOwnedStyleState({
      series: lineSeriesStyles,
      overlays: lineOverlayStyles,
      overlayToolbarScope: lineOverlayToolbarScope
    });
    record.grouped = normalizeLineOwnedGroupedState({
      replicates: lineReplicates,
      lastGroupedReplicateCount: lineLastGroupedReplicateCount,
      labels: lineSeriesGroupLabels,
      shapes: lineGroupShapes
    });
    record.forecast = normalizeLineOwnedForecastState(lineForecastOptions);
    record.axisSettings = lineAxisSettings && typeof lineAxisSettings === 'object' ? cloneSimple(lineAxisSettings) : null;
    record.gridStyle = lineGridStyle && typeof lineGridStyle === 'object' ? cloneSimple(lineGridStyle) : null;
    record.regressionSummaries = getLineRegressionSummariesState(record.tabId).slice();
    record.viewState = getLineViewState();
    record.autoDrawState = getLineAutoDrawState();
    record.statsState = getLineStatsState(record.tabId);
    record.advisorState = getLineAdvisorState(record.tabId);
    record.modeCache = normalizeLineOwnedModeCache(modeCache);
    record.hydrated = true;
    record.updatedAt = Date.now();
    record.reason = meta?.reason || 'remember-line-owned-runtime';
    if(meta?.skipLineSessionRemember !== true){
      rememberLineSessionState(record.tabId, {
        ...(meta || {}),
        tabId: record.tabId,
        reason: meta?.reason || 'remember-line-owned-runtime-session'
      }, { readControls: false });
    }
    return getLineRuntimeOwner()?.rememberRecord?.(record.tabId, record, {
      ...(meta || {}),
      tabId: record.tabId,
      reason: meta?.reason || 'remember-line-owned-runtime'
    }) || record;
  }

  const DEFAULT_AXIS_COLOR = '#000000';
  const DEFAULT_GRID_COLOR = '#dddddd';
  const MIN_MINOR_TICK_SUBDIVISIONS = 1;
  const MAX_MINOR_TICK_SUBDIVISIONS = 9;
  const DEFAULT_MINOR_TICK_SUBDIVISIONS = Number.isFinite(chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS)
    ? chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS
    : 3;
  const DEFAULT_AXIS_ADDITIONAL_TICK = Object.freeze({
    value: 0,
    showTick: false,
    showLine: true,
    label: '',
    lineColor: null,
    lineWidth: 1,
    linePattern: 'dotted',
    lineTransparency: 0
  });

  function clampMinorTickSubdivisions(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return DEFAULT_MINOR_TICK_SUBDIVISIONS;
    }
    const rounded = Math.round(numeric);
    return Math.max(MIN_MINOR_TICK_SUBDIVISIONS, Math.min(MAX_MINOR_TICK_SUBDIVISIONS, rounded));
  }

  function sanitizeLineAxisAdditionalTickEntry(entry){
    if(axisExtras && typeof axisExtras.sanitizeEntry === 'function'){
      return axisExtras.sanitizeEntry(entry, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK });
    }
    if(!entry || typeof entry !== 'object'){
      return null;
    }
    const rawValue = entry.value ?? entry.at ?? entry.position ?? entry.y ?? entry.x;
    const value = Number(rawValue);
    if(!Number.isFinite(value)){
      return null;
    }
    const showTick = entry.showTick !== undefined ? !!entry.showTick : (entry.tick !== undefined ? !!entry.tick : DEFAULT_AXIS_ADDITIONAL_TICK.showTick);
    const showLine = entry.showLine !== undefined ? !!entry.showLine : (entry.line !== undefined ? !!entry.line : DEFAULT_AXIS_ADDITIONAL_TICK.showLine);
    let label = DEFAULT_AXIS_ADDITIONAL_TICK.label;
    if(entry.label !== undefined && entry.label !== null){
      label = String(entry.label);
    }else if(entry.text !== undefined && entry.text !== null){
      label = String(entry.text);
    }
    const lineColor = typeof entry.lineColor === 'string' && entry.lineColor.trim()
      ? entry.lineColor.trim()
      : DEFAULT_AXIS_ADDITIONAL_TICK.lineColor;
    const lineWidthRaw = Number(entry.lineWidth ?? entry.thickness ?? entry.strokeWidth);
    const lineWidth = Number.isFinite(lineWidthRaw) && lineWidthRaw > 0
      ? lineWidthRaw
      : DEFAULT_AXIS_ADDITIONAL_TICK.lineWidth;
    const rawPattern = typeof entry.linePattern === 'string'
      ? entry.linePattern
      : (typeof entry.pattern === 'string' ? entry.pattern : DEFAULT_AXIS_ADDITIONAL_TICK.linePattern);
    const normalizedPattern = String(rawPattern || '').trim().toLowerCase();
    const linePattern = (normalizedPattern === 'solid' || normalizedPattern === 'continuous')
      ? 'solid'
      : (normalizedPattern === 'dotted' || normalizedPattern === 'dots')
        ? 'dotted'
        : 'dashed';
    const lineTransparencyRaw = Number(entry.lineTransparency ?? entry.transparency);
    const lineTransparency = Number.isFinite(lineTransparencyRaw)
      ? Math.min(100, Math.max(0, lineTransparencyRaw))
      : DEFAULT_AXIS_ADDITIONAL_TICK.lineTransparency;
    return {
      value,
      showTick,
      showLine,
      label,
      lineColor,
      lineWidth,
      linePattern,
      lineTransparency
    };
  }

  function sanitizeLineAxisAdditionalTicks(entries){
    if(axisExtras && typeof axisExtras.sanitizeEntries === 'function'){
      return axisExtras.sanitizeEntries(entries, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK });
    }
    if(!Array.isArray(entries)){
      return [];
    }
    return entries
      .map(entry => sanitizeLineAxisAdditionalTickEntry(entry))
      .filter(entry => !!entry);
  }

  // PART: AXIS
  function createLineAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, majorTickLength: null, labelAngle: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } },
      y: { tickInterval: null, majorTickLength: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } }
    };
  }

  function sanitizeLineAxisNotation(value){
    if(value === 'auto' || value === 'decimal' || value === 'scientific'){ return value; }
    return 'decimal';
  }

  let lineAxisSettings = createLineAxisSettings();
  let lineGridStyle = null;

  function normalizeLineAxisSettings(value){
    const previous = lineAxisSettings && typeof lineAxisSettings === 'object'
      ? cloneLineRuntimeValue(lineAxisSettings, createLineAxisSettings())
      : createLineAxisSettings();
    lineAxisSettings = value && typeof value === 'object'
      ? cloneLineRuntimeValue(value, previous)
      : previous;
    ensureLineAxisSettings(null, { skipSession: true });
    const normalized = cloneLineRuntimeValue(lineAxisSettings, createLineAxisSettings());
    lineAxisSettings = previous;
    return normalized;
  }

  function getLineAxisSettingsState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.axisSettings = normalizeLineAxisSettings(target.state.axisSettings);
      return target.state.axisSettings;
    }
    lineAxisSettings = normalizeLineAxisSettings(lineAxisSettings);
    return lineAxisSettings;
  }

  function setLineAxisSettingsState(session = null, nextSettings = null, meta = {}){
    const normalized = normalizeLineAxisSettings(nextSettings);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.axisSettings = normalized;
      stampLineSessionState(target);
      persistLineSessionState(target, {
        ...(meta || {}),
        tabId: target.tabId,
        reason: meta?.reason || 'line-axis-state'
      });
    }
    if(!target || isLineSessionActive(target)){
      lineAxisSettings = cloneLineRuntimeValue(normalized, createLineAxisSettings());
    }
    return normalized;
  }

  function getLineGridStyleState(session = null, fallbackThickness){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.gridStyle = sanitizeLineGridStyle(target.state.gridStyle, fallbackThickness);
      return target.state.gridStyle;
    }
    lineGridStyle = sanitizeLineGridStyle(lineGridStyle, fallbackThickness);
    return lineGridStyle;
  }

  function setLineGridStyleState(session = null, style = null, fallbackThickness, meta = {}){
    const normalized = sanitizeLineGridStyle(style, fallbackThickness);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.gridStyle = normalized;
      stampLineSessionState(target);
      persistLineSessionState(target, {
        ...(meta || {}),
        tabId: target.tabId,
        reason: meta?.reason || 'line-grid-state'
      });
    }
    if(!target || isLineSessionActive(target)){
      lineGridStyle = cloneLineRuntimeValue(normalized, null);
    }
    return normalized;
  }

  function createDefaultLineGridStyle(fallbackThickness){
    const thickness = Number.isFinite(Number(fallbackThickness)) && Number(fallbackThickness) >= 0
      ? Number(fallbackThickness)
      : 1;
    return {
      color: DEFAULT_GRID_COLOR,
      thickness,
      pattern: 'solid',
      transparency: 0
    };
  }

  function sanitizeLineGridStyle(style, fallbackThickness){
    const fallback = createDefaultLineGridStyle(fallbackThickness);
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

  function ensureLineGridStyle(fallbackThickness, session = null){
    return getLineGridStyleState(session || getLineActiveSessionForState(), fallbackThickness);
  }

  function getLineGridStyle(fallbackThickness, session = null){
    return sanitizeLineGridStyle(ensureLineGridStyle(fallbackThickness, session), fallbackThickness);
  }

  function setLineGridStyle(style, fallbackThickness, session = null){
    return setLineGridStyleState(session || getLineProjectionSession({ reason: 'line-projection-mutation' }), style, fallbackThickness, { reason: 'line-grid-style-set' });
  }

  function ensureLineAxisSettings(session = null, options = {}){
    const target = options.skipSession === true ? null : resolveLineStateSession(session || getLineActiveSessionForState());
    const settings = target?.state
      ? (target.state.axisSettings && typeof target.state.axisSettings === 'object' ? target.state.axisSettings : createLineAxisSettings())
      : (lineAxisSettings && typeof lineAxisSettings === 'object' ? lineAxisSettings : createLineAxisSettings());
    if(!settings.x || typeof settings.x !== 'object'){
      settings.x = { tickInterval: null, majorTickLength: null, labelAngle: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } };
    }
    if(!settings.y || typeof settings.y !== 'object'){
      settings.y = { tickInterval: null, majorTickLength: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } };
    }
    if(typeof settings.x.minorTicks !== 'boolean'){
      settings.x.minorTicks = false;
    }
    if(typeof settings.y.minorTicks !== 'boolean'){
      settings.y.minorTicks = false;
    }
    settings.x.labelAngle = chartStyle.normalizeOptionalXAxisLabelAngle(settings.x.labelAngle);
    settings.x.minorTickSubdivisions = clampMinorTickSubdivisions(settings.x.minorTickSubdivisions);
    settings.y.minorTickSubdivisions = clampMinorTickSubdivisions(settings.y.minorTickSubdivisions);
    if(!settings.x.brokenAxis || typeof settings.x.brokenAxis !== 'object'){
      settings.x.brokenAxis = { enabled: false, segments: [] };
    }
    if(typeof settings.x.brokenAxis.enabled !== 'boolean'){
      settings.x.brokenAxis.enabled = false;
    }
    if(!Array.isArray(settings.x.brokenAxis.segments)){
      settings.x.brokenAxis.segments = [];
    }
    if(!settings.y.brokenAxis || typeof settings.y.brokenAxis !== 'object'){
      settings.y.brokenAxis = { enabled: false, segments: [] };
    }
    if(typeof settings.y.brokenAxis.enabled !== 'boolean'){
      settings.y.brokenAxis.enabled = false;
    }
    if(!Array.isArray(settings.y.brokenAxis.segments)){
      settings.y.brokenAxis.segments = [];
    }
    const strokeNumeric = Number(settings.strokeWidth);
    settings.strokeWidth = Number.isFinite(strokeNumeric) && strokeNumeric > 0 ? strokeNumeric : 1;
    if(typeof settings.color !== 'string' || !settings.color){
      settings.color = DEFAULT_AXIS_COLOR;
    }
    settings.x.notation = sanitizeLineAxisNotation(settings.x.notation);
    settings.y.notation = sanitizeLineAxisNotation(settings.y.notation);
    settings.x.additionalTicks = sanitizeLineAxisAdditionalTicks(settings.x.additionalTicks);
    settings.y.additionalTicks = sanitizeLineAxisAdditionalTicks(settings.y.additionalTicks);
    if(target?.state){
      target.state.axisSettings = settings;
      if(isLineSessionActive(target)){
        lineAxisSettings = cloneLineRuntimeValue(settings, createLineAxisSettings());
      }
      return target.state.axisSettings;
    }
    lineAxisSettings = settings;
    return lineAxisSettings;
  }

  function stampLineParameterObservables(svg, session = null){
    if(!svg?.setAttribute){ return; }
    const controls = getLineRuntimeControlsForSession(session, lineFallbackRuntimeControls);
    const axis = ensureLineAxisSettings(session);
    const labels = getLineLabelsState(session);
    const theme = getLineThemeState(session);
    const entries = {
      'background-color': theme.backgroundColor,
      'text-color': theme.textColor,
      'title': labels.title,
      'xtitle': labels.x,
      'ytitle': labels.y,
      'ztitle': labels.z,
      'regression-mode': controls.regressionMode,
      'stats-method': controls.statType,
      'axis-broken-axis-x-enabled': !!axis.x?.brokenAxis?.enabled,
      'axis-broken-axis-y-enabled': !!axis.y?.brokenAxis?.enabled,
      'axis-minor-tick-subdivisions-x': axis.x?.minorTickSubdivisions,
      'axis-minor-tick-subdivisions-y': axis.y?.minorTickSubdivisions,
      'axis-minor-ticks-x': !!axis.x?.minorTicks,
      'axis-minor-ticks-y': !!axis.y?.minorTicks,
      'axis-notation-x': axis.x?.notation,
      'axis-notation-y': axis.y?.notation
    };
    Object.entries(labels.colors || {}).forEach(([label, color]) => {
      const slug = String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if(slug){ entries[`label-colors-${slug}`] = color; }
    });
    Object.entries(entries).forEach(([key, value]) => {
      if(value !== undefined && value !== null){ svg.setAttribute(`data-parameter-${key}`, String(value)); }
    });
  }

  function getLineAxisNotation(axis, session = null){
    if(axis !== 'x' && axis !== 'y'){ return 'auto'; }
    const settings = ensureLineAxisSettings(session);
    return sanitizeLineAxisNotation(settings[axis]?.notation);
  }

  function updateLineAxisNotation(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    const nextValue = sanitizeLineAxisNotation(value);
    if(settings[axis].notation === nextValue){ return; }
    settings[axis].notation = nextValue;
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-notation' });
    console.debug('Debug: line axis notation updated',{ axis, notation: nextValue });
    if(canScheduleActiveLineDraw()){
      scheduleActiveLineDraw();
    }
  }

  function getLineAxisTickInterval(axis, session = null){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureLineAxisSettings(session);
    const raw = settings[axis]?.tickInterval;
    if(raw === null || raw === undefined || raw === ''){
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function updateLineAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      settings[axis].tickInterval = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-tick-interval' });
    console.debug('Debug: line axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    if(canScheduleActiveLineDraw()){
      scheduleActiveLineDraw();
    }
  }

  function getLineAxisMajorTickLength(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureLineAxisSettings();
    const storedValue = settings[axis]?.majorTickLength;
    if(storedValue === null || storedValue === undefined || storedValue === ''){ return null; }
    const numeric = Number(storedValue);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
  }

  function updateLineAxisMajorTickLength(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    const numeric = Number(value);
    const nextValue = value === null || value === undefined || value === ''
      ? null
      : (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null);
    if(settings[axis].majorTickLength === nextValue){ return; }
    settings[axis].majorTickLength = nextValue;
    console.debug('Debug: line major tick length updated',{ axis, majorTickLength: nextValue });
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-major-tick-length' });
    if(canScheduleActiveLineDraw()){ scheduleActiveLineDraw(); }
  }

  function getLineXAxisTickLabelAngle(session = null){
    return chartStyle.normalizeOptionalXAxisLabelAngle(ensureLineAxisSettings(session).x?.labelAngle);
  }

  function updateLineXAxisTickLabelAngle(value, ownerSession = null){
    const owner = resolveLineStateSession(ownerSession || getLineProjectionSession({ reason: 'line-x-label-angle' }));
    if(owner && !isLineSessionActive(owner)){
      lineDebug('Debug: line x tick label angle ignored for inactive owner', { tabId: owner.tabId || null });
      return;
    }
    const settings = ensureLineAxisSettings(owner);
    const nextValue = chartStyle.normalizeOptionalXAxisLabelAngle(value);
    if(settings.x.labelAngle === nextValue){ return; }
    settings.x.labelAngle = nextValue;
    setLineAxisSettingsState(owner, settings, { reason: 'line-axis-x-label-angle' });
    lineDebug('Debug: line x tick label angle updated',{ angle: nextValue, tabId: owner?.tabId || null });
    scheduleLineViewRefresh('line-axis-x-label-angle', { tabId: owner?.tabId || null, userInitiated: true });
  }

  function getLineAxisMinorTicksEnabled(axis, session = null){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureLineAxisSettings(session);
    return !!settings[axis]?.minorTicks;
  }

  function updateLineAxisMinorTicks(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    const nextValue = !!enabled;
    if(settings[axis].minorTicks === nextValue){
      return;
    }
    settings[axis].minorTicks = nextValue;
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-minor-ticks' });
    console.debug('Debug: line minor ticks updated',{ axis, enabled: nextValue });
    if(canScheduleActiveLineDraw()){
      scheduleActiveLineDraw();
    }
  }

  function getLineAxisMinorTickSubdivisions(axis, session = null){
    if(axis !== 'x' && axis !== 'y'){ return DEFAULT_MINOR_TICK_SUBDIVISIONS; }
    const settings = ensureLineAxisSettings(session);
    return clampMinorTickSubdivisions(settings[axis]?.minorTickSubdivisions);
  }

  function updateLineAxisMinorTickSubdivisions(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    const nextValue = clampMinorTickSubdivisions(value);
    if(settings[axis].minorTickSubdivisions === nextValue){
      return;
    }
    settings[axis].minorTickSubdivisions = nextValue;
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-minor-subdivisions' });
    console.debug('Debug: line minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    if(canScheduleActiveLineDraw()){
      scheduleActiveLineDraw();
    }
  }

  function getLineAxisAdditionalTicks(axis, session = null){
    if(axis !== 'x' && axis !== 'y'){
      return [];
    }
    const settings = ensureLineAxisSettings(session);
    if(axisExtras && typeof axisExtras.getEntries === 'function'){
      return axisExtras.getEntries(settings, axis, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK });
    }
    return sanitizeLineAxisAdditionalTicks(settings[axis]?.additionalTicks);
  }

  function updateLineAxisAdditionalTicks(axis, entries){
    if(axis !== 'x' && axis !== 'y'){
      return;
    }
    const settings = ensureLineAxisSettings();
    if(axisExtras && typeof axisExtras.setEntries === 'function'){
      axisExtras.setEntries(settings, axis, entries, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK });
    }else{
      settings[axis].additionalTicks = sanitizeLineAxisAdditionalTicks(entries);
    }
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-additional-ticks' });
    lineDebug('Debug: line axis additional ticks updated', {
      axis,
      count: settings[axis].additionalTicks.length
    });
    if(canScheduleActiveLineDraw()){
      scheduleActiveLineDraw();
    }
  }

  function updateLineAxisAdditionalTick(axis, index, entry){
    if(axis !== 'x' && axis !== 'y'){
      return;
    }
    const settings = ensureLineAxisSettings();
    if(axisExtras && typeof axisExtras.updateEntry === 'function'){
      const currentEntries = axisExtras.getEntries(settings, axis, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK });
      const currentEntry = Array.isArray(currentEntries) && index >= 0 && index < currentEntries.length
        ? currentEntries[index]
        : null;
      const mergedEntry = (currentEntry && typeof currentEntry === 'object')
        ? { ...currentEntry, ...(entry && typeof entry === 'object' ? entry : {}) }
        : entry;
      const updated = axisExtras.updateEntry(settings, axis, index, mergedEntry, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK });
      if(!updated){
        return;
      }
      updateLineAxisAdditionalTicks(axis, settings[axis].additionalTicks);
      return;
    }
    const entries = sanitizeLineAxisAdditionalTicks(settings[axis].additionalTicks);
    if(!Number.isInteger(index) || index < 0 || index >= entries.length){
      return;
    }
    const sanitized = sanitizeLineAxisAdditionalTickEntry(entry);
    if(!sanitized){
      return;
    }
    entries[index] = sanitized;
    updateLineAxisAdditionalTicks(axis, entries);
  }

  function addLineAxisAdditionalTick(axis){
    if(axis !== 'x' && axis !== 'y'){
      return;
    }
    const settings = ensureLineAxisSettings();
    if(axisExtras && typeof axisExtras.addEntry === 'function'){
      const added = axisExtras.addEntry(settings, axis, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK, increment: 1 });
      if(!added){
        return;
      }
      updateLineAxisAdditionalTicks(axis, settings[axis].additionalTicks);
      return;
    }
    const entries = sanitizeLineAxisAdditionalTicks(settings[axis].additionalTicks);
    const last = entries.length ? entries[entries.length - 1] : null;
    entries.push({
      value: Number.isFinite(last?.value) ? Number(last.value) + 1 : DEFAULT_AXIS_ADDITIONAL_TICK.value,
      showTick: DEFAULT_AXIS_ADDITIONAL_TICK.showTick,
      showLine: DEFAULT_AXIS_ADDITIONAL_TICK.showLine,
      label: DEFAULT_AXIS_ADDITIONAL_TICK.label,
      lineColor: DEFAULT_AXIS_ADDITIONAL_TICK.lineColor,
      lineWidth: DEFAULT_AXIS_ADDITIONAL_TICK.lineWidth,
      linePattern: DEFAULT_AXIS_ADDITIONAL_TICK.linePattern,
      lineTransparency: DEFAULT_AXIS_ADDITIONAL_TICK.lineTransparency
    });
    updateLineAxisAdditionalTicks(axis, entries);
  }

  function removeLineAxisAdditionalTick(axis, index){
    if(axis !== 'x' && axis !== 'y'){
      return;
    }
    const settings = ensureLineAxisSettings();
    if(axisExtras && typeof axisExtras.removeEntry === 'function'){
      const removed = axisExtras.removeEntry(settings, axis, index, { defaults: DEFAULT_AXIS_ADDITIONAL_TICK });
      if(!removed){
        return;
      }
      updateLineAxisAdditionalTicks(axis, settings[axis].additionalTicks);
      return;
    }
    const entries = sanitizeLineAxisAdditionalTicks(settings[axis].additionalTicks);
    if(!Number.isInteger(index) || index < 0 || index >= entries.length){
      return;
    }
    entries.splice(index, 1);
    updateLineAxisAdditionalTicks(axis, entries);
  }

  function getLineAxisStrokeWidth(session = null){
    const settings = ensureLineAxisSettings(session);
    return settings.strokeWidth;
  }

  function updateLineAxisStrokeWidth(value){
    const settings = ensureLineAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-stroke-width' });
    console.debug('Debug: line axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    const tabId = getLineProjectionTabId() || null;
    const svg = getLineNodeById('lineSvg', tabId) || getLineNodeById('lineSvg');
    const projected = Shared.visualProjection?.apply?.(svg, {
      component: 'line',
      channel: 'axis',
      tabId,
      attributes: { strokeWidth: settings.strokeWidth }
    });
    if(!projected){
      scheduleLineViewRefresh('axis-stroke-width', { tabId });
    }
  }

  function getLineAxisColor(session = null){
    const settings = ensureLineAxisSettings(session);
    const rawColor = settings.color || DEFAULT_AXIS_COLOR;
    const isDark = String(lineColorSchemeId || '').toLowerCase() === 'dark';
    const normalized = String(rawColor || '').trim().toLowerCase();
    if(isDark && (!normalized || normalized === '#000' || normalized === '#000000' || normalized === 'black')){
      return '#e6e6e6';
    }
    return rawColor;
  }

  function updateLineAxisColor(value){
    const settings = ensureLineAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    setLineAxisSettingsState(getLineProjectionSession({ reason: 'line-projection-mutation' }), settings, { reason: 'line-axis-color' });
    console.debug('Debug: line axis color updated',{ color: settings.color });
    const tabId = getLineProjectionTabId() || null;
    const svg = getLineNodeById('lineSvg', tabId) || getLineNodeById('lineSvg');
    const projected = Shared.visualProjection?.apply?.(svg, {
      component: 'line',
      channel: 'axis',
      tabId,
      attributes: { stroke: getLineAxisColor() }
    });
    if(!projected){
      scheduleLineViewRefresh('axis-color', { tabId });
    }
  }

  function registerLineGridControlTarget(target, options){
    if(!target || !gridControls || typeof gridControls.registerGraphElement !== 'function'){
      return;
    }
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackThickness = Number.isFinite(Number(opts.fallbackThickness)) ? Number(opts.fallbackThickness) : getLineAxisStrokeWidth();
    gridControls.registerGraphElement(target, {
      scopeId: 'line',
      hostClass: 'font-toolbar-host--line-dual',
      getVisible: () => !!refs.showGrid?.checked,
      onVisibleChange: value => {
        if(refs.showGrid){
          refs.showGrid.checked = !!value;
        }
        scheduleActiveLineDraw();
      },
      getStyle: () => getLineGridStyle(fallbackThickness),
      onStyleChange: style => {
        setLineGridStyle(style, fallbackThickness);
        if(!gridControls.applyStyleToTarget?.(target, getLineGridStyle(fallbackThickness), {
          defaults: createDefaultLineGridStyle(fallbackThickness)
        })){
          scheduleLineViewRefresh('line-grid-style-change');
        }
      },
      defaults: createDefaultLineGridStyle(fallbackThickness)
    });
  }

  function getBrokenAxisEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureLineAxisSettings();
    return !!settings[axis]?.brokenAxis?.enabled;
  }

  function updateBrokenAxisEnabled(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    const previousValue = !!settings[axis].brokenAxis.enabled;
    settings[axis].brokenAxis.enabled = !!enabled;
    console.debug('Debug: line broken axis enabled updated',{ axis, enabled: settings[axis].brokenAxis.enabled });
    if(canScheduleActiveLineDraw()){
      scheduleActiveLineDraw();
    }
    return previousValue;
  }

  function getBrokenAxisSegments(axis){
    if(axis !== 'x' && axis !== 'y'){ return []; }
    const settings = ensureLineAxisSettings();
    return settings[axis]?.brokenAxis?.segments || [];
  }

  function updateBrokenAxisSegments(axis, segments){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    if(!Array.isArray(segments)){
      settings[axis].brokenAxis.segments = [];
      return;
    }
    settings[axis].brokenAxis.segments = segments.filter(seg => {
      return seg &&
             typeof seg === 'object' &&
             Number.isFinite(seg.start) &&
             Number.isFinite(seg.end) &&
             seg.start < seg.end;
    }).map(seg => ({ start: Number(seg.start), end: Number(seg.end) }));
    console.debug('Debug: line broken axis segments updated',{ axis, segments: settings[axis].brokenAxis.segments });
    if(canScheduleActiveLineDraw()){
      scheduleActiveLineDraw();
    }
  }

  function getLineLockRatioCheckbox(){
    const activeTabId = String(getLineProjectionTabId() || '').trim();
    const isOwnedByActiveTab = node => {
      if(!node || !node.isConnected){
        return false;
      }
      const ownerTabId = String(resolveLineTabIdFromNode(node) || '').trim();
      return !activeTabId || !ownerTabId || ownerTabId === activeTabId;
    };
    if(lineLockRatioInput && isOwnedByActiveTab(lineLockRatioInput)){
      return lineLockRatioInput;
    }
    lineLockRatioInput = null;
    let svgBox = (lineSvgBoxRef && isOwnedByActiveTab(lineSvgBoxRef))
      ? lineSvgBoxRef
      : ((refs.svgBox && isOwnedByActiveTab(refs.svgBox)) ? refs.svgBox : null);
    if(!svgBox){
      svgBox = getLineNodeById('lineGraphPanel', activeTabId || null)?.querySelector?.('.svgbox') || null;
    }
    if(!svgBox || !isOwnedByActiveTab(svgBox)){
      return null;
    }
    const checkbox = svgBox.querySelector('.resizer-aspect-checkbox');
    if(checkbox && isOwnedByActiveTab(checkbox)){
      lineLockRatioInput = checkbox;
      return checkbox;
    }
    return null;
  }

  function getLineForcedLockRatioPrevious(session = null){
    const value = getLineViewState(session)?.forcedLockRatioPrevious;
    if(value === true || value === false){
      return !!value;
    }
    if(session){
      return null;
    }
    return (lineAxesLengthLockRatioPrevious === true || lineAxesLengthLockRatioPrevious === false)
      ? !!lineAxesLengthLockRatioPrevious
      : null;
  }

  function setLineForcedLockRatioPrevious(value, session = null){
    const normalized = (value === true || value === false) ? !!value : null;
    lineAxesLengthLockRatioPrevious = normalized;
    const viewState = getLineViewState(session);
    if(viewState && typeof viewState === 'object'){
      viewState.forcedLockRatioPrevious = normalized;
    }
    return normalized;
  }

  function syncLineAspectControls(reason){
    if(lineAspectSyncing){
      return;
    }
    lineAspectSyncing = true;
    try{
      const activeTabId = String(getLineProjectionTabId() || '').trim();
      const activeRoot = resolveLineRoot(activeTabId || null);
      const activeSvgBox = activeRoot?.querySelector?.('.svgbox') || null;
      if(activeSvgBox){
        refs.svgBox = activeSvgBox;
        lineSvgBoxRef = activeSvgBox;
        lineEqualAxesInput = activeSvgBox.querySelector('.resizer-axeslength-checkbox--equal-length');
        lineEqualScaleAxesInput = activeSvgBox.querySelector('.resizer-axeslength-checkbox--equal-scale');
        lineVarianceAxisScaleInput = activeSvgBox.querySelector('.resizer-axeslength-checkbox--variance');
      }
      const lockRatioCheckbox = getLineLockRatioCheckbox();
      const ownerTabId = resolveLineTabIdFromNode(lockRatioCheckbox);
      const ownerSession = ownerTabId
        ? getLineSession(ownerTabId, { tabId: ownerTabId, reason: 'line-aspect-owner' }, { create: false })
        : null;
      const ownerViewState = getLineViewState(ownerSession);
      const equalAxesEnabled = !!ownerViewState.equalAxes;
      const equalScaleEnabled = !!ownerViewState.equalScaleAxes;
      const varianceAxesEnabled = !!ownerViewState.axesVarianceScaled;
      const viewModeValue = ownerViewState.viewMode || refs.viewMode?.value || '2d';
      const replicateModeValue = ownerViewState.viewMode || refs.replicateMode?.value;
      const is3dView = String(viewModeValue).toLowerCase() === '3d' || String(replicateModeValue).toLowerCase() === '3d';
      const reasonText = String(reason || '').toLowerCase();
      const lifecycleRestoreContext = !!Shared.componentLifecycle?.isRestoreTransactionActive?.('line', { tabId: getLineProjectionTabId() || null, reason });
      const restoreContext = lifecycleRestoreContext
        || reasonText === 'payload'
        || reasonText.includes('restore')
        || reasonText.includes('layout')
        || reasonText.includes('reopen');
      const enforceLockRatio = is3dView || (!restoreContext && varianceAxesEnabled);
      if(lineEqualAxesInput && lineEqualAxesInput.checked !== equalAxesEnabled){
        lineEqualAxesInput.checked = equalAxesEnabled;
      }
      if(lineEqualScaleAxesInput && lineEqualScaleAxesInput.checked !== equalScaleEnabled){
        lineEqualScaleAxesInput.checked = equalScaleEnabled;
      }
      if(lineVarianceAxisScaleInput && lineVarianceAxisScaleInput.checked !== varianceAxesEnabled){
        lineVarianceAxisScaleInput.checked = varianceAxesEnabled;
      }
      if(lockRatioCheckbox){
        const lockLabel = lockRatioCheckbox.closest('label');
        const resizerApi = lockRatioCheckbox.closest('.svgbox')?.__sharedResizableBoxApi;
        if(enforceLockRatio){
          if(getLineForcedLockRatioPrevious(ownerSession) === null){
            setLineForcedLockRatioPrevious(!!lockRatioCheckbox.checked, ownerSession);
          }
          resizerApi?.setAspectLocked?.(true, { reason: 'line-forced-lock-ratio' });
          lockRatioCheckbox.disabled = true;
          if(lockLabel){
            if(!lockLabel.__lineOriginalTitle){
              lockLabel.__lineOriginalTitle = lockLabel.title || '';
            }
            lockLabel.title = 'Locked while axes length is constrained';
          }
        }else{
          lockRatioCheckbox.disabled = false;
          if(lockLabel && lockLabel.__lineOriginalTitle !== undefined){
            lockLabel.title = lockLabel.__lineOriginalTitle;
            delete lockLabel.__lineOriginalTitle;
          }
          const restoreValue = getLineForcedLockRatioPrevious(ownerSession);
          if(restoreValue !== null){
            setLineForcedLockRatioPrevious(null, ownerSession);
            resizerApi?.setAspectLocked?.(restoreValue, { reason: 'line-restore-lock-ratio' });
          }
        }
      }
      lineDebug('Debug: line axes length sync',{
        equalAxesEnabled,
        equalScaleEnabled,
        varianceAxesEnabled,
        is3dView,
        lockRatioEnabled: lockRatioCheckbox ? !!lockRatioCheckbox.checked : null,
        reason: reason || null
      });
    } finally {
      lineAspectSyncing = false;
    }
  }

  function ensureLineLegendControlPlacement(){
    if(!lineLegendControl || !refs.svgBox){
      return;
    }
    if(Shared.resizer && typeof Shared.resizer.ensureLegendControlPlacement === 'function'){
      Shared.resizer.ensureLegendControlPlacement({
        svgBox: refs.svgBox,
        control: lineLegendControl,
        debugLabel: 'line-legend'
      });
    }
  }

  function ensureLineAxesLengthControlPlacement(){
    const svgBox = refs.svgBox || lineSvgBoxRef;
    if(!svgBox){
      return;
    }
    lineSvgBoxRef = svgBox;
    const doc = svgBox.ownerDocument || global.document;
    if(!doc){
      return;
    }
    let tray = svgBox.querySelector('.resizer-control-tray');
    if(!tray){
      tray = doc.createElement('div');
      tray.className = 'resizer-control-tray';
      svgBox.appendChild(tray);
      lineDebug('Debug: line axes length tray created', { trayChildren: tray.childElementCount });
    }
    let axesControl = tray.querySelector('.resizer-axeslength-control');
    if(!axesControl){
      axesControl = doc.createElement('details');
      axesControl.className = 'resizer-axeslength-control';
      const summary = doc.createElement('summary');
      summary.className = 'resizer-axeslength-summary';
      summary.textContent = 'Axes length';
      const menu = doc.createElement('div');
      menu.className = 'resizer-axeslength-menu';
      axesControl.appendChild(summary);
      axesControl.appendChild(menu);
      const aspectControl = tray.querySelector('.resizer-aspect-control');
      if(aspectControl && aspectControl.parentNode === tray){
        tray.insertBefore(axesControl, aspectControl);
      }else{
        tray.appendChild(axesControl);
      }
      lineDebug('Debug: line axes length control created', { trayChildren: tray.childElementCount });
    }
    const menu = axesControl.querySelector('.resizer-axeslength-menu');
    if(menu){
      let equalScaleItem = menu.querySelector('.resizer-axeslength-item--equal-scale');
      if(!equalScaleItem){
        equalScaleItem = doc.createElement('label');
        equalScaleItem.className = 'resizer-axeslength-item resizer-axeslength-item--equal-scale';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-scale';
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-axeslength-text';
        equalScaleItem.appendChild(checkbox);
        equalScaleItem.appendChild(textSpan);
        menu.appendChild(equalScaleItem);
      }else{
        equalScaleItem.classList.add('resizer-axeslength-item');
      }
      if(equalScaleItem){
        equalScaleItem.title = 'Equal axis lengths with the same data scale';
        const equalScaleCheckbox = equalScaleItem.querySelector('input[type="checkbox"]');
        if(equalScaleCheckbox){
          equalScaleCheckbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-scale';
          equalScaleCheckbox.setAttribute('aria-label', 'Equal axis lengths with the same data scale');
        }
        const equalScaleText = equalScaleItem.querySelector('.resizer-axeslength-text');
        if(equalScaleText){
          equalScaleText.textContent = 'Equal length / same scale';
        }
      }
      let equalLengthItem = menu.querySelector('.resizer-axeslength-item--equal-length');
      if(!equalLengthItem){
        equalLengthItem = doc.createElement('label');
        equalLengthItem.className = 'resizer-axeslength-item resizer-axeslength-item--equal-length';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-length';
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-axeslength-text';
        equalLengthItem.appendChild(checkbox);
        equalLengthItem.appendChild(textSpan);
      }
      if(equalLengthItem){
        equalLengthItem.title = 'Equal axis lengths with independent scales';
        const equalLengthCheckbox = equalLengthItem.querySelector('input[type="checkbox"]');
        if(equalLengthCheckbox){
          equalLengthCheckbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--equal-length';
          equalLengthCheckbox.setAttribute('aria-label', 'Equal axis lengths with independent scales');
        }
        const equalLengthText = equalLengthItem.querySelector('.resizer-axeslength-text');
        if(equalLengthText){
          equalLengthText.textContent = 'Equal length / different scale';
        }
        if(equalLengthItem.parentNode !== menu){
          menu.appendChild(equalLengthItem);
        }
      }
      const equalScaleCheckbox = equalScaleItem.querySelector('input[type="checkbox"]');
      if(equalScaleCheckbox){
        lineEqualScaleAxesInput = equalScaleCheckbox;
        if(equalScaleCheckbox.__lineEqualScaleAxesHandler){
          equalScaleCheckbox.removeEventListener('change', equalScaleCheckbox.__lineEqualScaleAxesHandler);
        }
        const onChange = () => {
          const enabled = !!equalScaleCheckbox.checked;
          const previous = !!getLineViewState().equalScaleAxes;
          if(enabled){
            getLineViewState().equalAxes = false;
            getLineViewState().axesVarianceScaled = false;
            if(lineEqualAxesInput){
              lineEqualAxesInput.checked = false;
            }
            if(lineVarianceAxisScaleInput){
              lineVarianceAxisScaleInput.checked = false;
            }
            lineDebug('Debug: line axes length exclusivity enforced', { disabled: 'equal-length/variance', reason: 'equal-scale-toggle' });
          }
          getLineViewState().equalScaleAxes = enabled;
          lineDebug('Debug: line equal scale toggled', { enabled, previous });
          syncLineAspectControls('equal-scale-toggle');
          if(canScheduleActiveLineDraw()){
            scheduleActiveLineDraw({ reason: 'equal-scale-toggle' });
          }
        };
        equalScaleCheckbox.addEventListener('change', onChange);
        equalScaleCheckbox.__lineEqualScaleAxesHandler = onChange;
      }
      const equalLengthCheckbox = equalLengthItem ? equalLengthItem.querySelector('input[type="checkbox"]') : null;
      if(equalLengthCheckbox){
        lineEqualAxesInput = equalLengthCheckbox;
        if(equalLengthCheckbox.__lineEqualAxesHandler){
          equalLengthCheckbox.removeEventListener('change', equalLengthCheckbox.__lineEqualAxesHandler);
        }
        const onChange = () => {
          const enabled = !!equalLengthCheckbox.checked;
          const previous = !!getLineViewState().equalAxes;
          if(enabled){
            getLineViewState().equalScaleAxes = false;
            getLineViewState().axesVarianceScaled = false;
            if(lineEqualScaleAxesInput){
              lineEqualScaleAxesInput.checked = false;
            }
            if(lineVarianceAxisScaleInput){
              lineVarianceAxisScaleInput.checked = false;
            }
            lineDebug('Debug: line axes length exclusivity enforced', { disabled: 'equal-scale/variance', reason: 'equal-length-toggle' });
          }
          getLineViewState().equalAxes = enabled;
          lineDebug('Debug: line equal length toggled', { enabled, previous });
          syncLineAspectControls('equal-length-toggle');
          if(canScheduleActiveLineDraw()){
            scheduleActiveLineDraw({ reason: 'equal-length-toggle' });
          }
        };
        equalLengthCheckbox.addEventListener('change', onChange);
        equalLengthCheckbox.__lineEqualAxesHandler = onChange;
      }
      let varianceItem = menu.querySelector('.resizer-axeslength-item--variance');
      if(!varianceItem){
        varianceItem = doc.createElement('label');
        varianceItem.className = 'resizer-axeslength-item resizer-axeslength-item--variance';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--variance';
        const textSpan = doc.createElement('span');
        textSpan.className = 'resizer-axeslength-text';
        varianceItem.appendChild(checkbox);
        varianceItem.appendChild(textSpan);
        menu.appendChild(varianceItem);
      }
      if(varianceItem){
        varianceItem.title = 'Scale axes by variance';
        const varianceCheckbox = varianceItem.querySelector('input[type="checkbox"]');
        if(varianceCheckbox){
          varianceCheckbox.className = 'resizer-axeslength-checkbox resizer-axeslength-checkbox--variance';
          varianceCheckbox.setAttribute('aria-label', 'Scale axes by variance');
        }
        const varianceText = varianceItem.querySelector('.resizer-axeslength-text');
        if(varianceText){
          varianceText.textContent = 'Variance-scaled';
        }
      }
      const varianceCheckbox = varianceItem ? varianceItem.querySelector('input[type="checkbox"]') : null;
      if(varianceCheckbox){
        lineVarianceAxisScaleInput = varianceCheckbox;
        if(varianceCheckbox.__lineVarianceAxesHandler){
          varianceCheckbox.removeEventListener('change', varianceCheckbox.__lineVarianceAxesHandler);
        }
        const onChange = () => {
          const enabled = !!varianceCheckbox.checked;
          const previous = !!getLineViewState().axesVarianceScaled;
          if(enabled){
            getLineViewState().equalAxes = false;
            getLineViewState().equalScaleAxes = false;
            if(lineEqualAxesInput){
              lineEqualAxesInput.checked = false;
            }
            if(lineEqualScaleAxesInput){
              lineEqualScaleAxesInput.checked = false;
            }
            lineDebug('Debug: line axes length exclusivity enforced', { disabled: 'equal-length/equal-scale', reason: 'variance-axis-toggle' });
          }
          getLineViewState().axesVarianceScaled = enabled;
          lineDebug('Debug: line variance axis scaling toggled', { enabled, previous });
          syncLineAspectControls('variance-axis-scale');
          if(canScheduleActiveLineDraw()){
            scheduleActiveLineDraw({ reason: 'variance-axis-scale' });
          }
        };
        varianceCheckbox.addEventListener('change', onChange);
        varianceCheckbox.__lineVarianceAxesHandler = onChange;
      }
      if(equalScaleItem && equalScaleItem.parentNode === menu){
        menu.appendChild(equalScaleItem);
      }
      if(equalLengthItem && equalLengthItem.parentNode === menu){
        menu.appendChild(equalLengthItem);
      }
      if(varianceItem && varianceItem.parentNode === menu){
        menu.appendChild(varianceItem);
      }
    }
    syncLineAspectControls('axes-length-ensure');
  }

  function ensureLineResizerControls(){
    ensureLineLegendControlPlacement();
    ensureLineAxesLengthControlPlacement();
  }

  function closeLineAxesLengthMenu(reason){
    const svgBox = refs.svgBox || lineSvgBoxRef;
    if(!svgBox){
      return;
    }
    const axesControl = svgBox.querySelector('.resizer-axeslength-control');
    if(axesControl && axesControl.hasAttribute('open')){
      axesControl.removeAttribute('open');
      lineDebug('Debug: line axes length menu closed', { reason: reason || null });
    }
  }

  function resolveLineAxisVariance(points){
    if(!Array.isArray(points) || points.length < 2){
      return null;
    }
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumYY = 0;
    for(let i = 0; i < points.length; i += 1){
      const point = points[i];
      const x = Number(point?.x);
      const y = Number(point?.y);
      if(!Number.isFinite(x) || !Number.isFinite(y)){
        continue;
      }
      count += 1;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumYY += y * y;
    }
    if(count < 2){
      return null;
    }
    const meanX = sumX / count;
    const meanY = sumY / count;
    const varX = Math.max(0, (sumXX / count) - (meanX * meanX));
    const varY = Math.max(0, (sumYY / count) - (meanY * meanY));
    const info = {
      count,
      weights: { x: varX, y: varY },
      ratio: varY > 0 ? varX / varY : null
    };
    lineDebug('Debug: line resolveAxisVariance', info);
    return info;
  }

  function resetLineRenderState(reason, options = {}){
    if(refs.plot){
      refs.plot.innerHTML = '';
      if(options.message){
        if(typeof Shared.renderPlotNotice === 'function'){
          Shared.renderPlotNotice(refs.plot, options.message, { resetAspect: true, show: true });
        }else{
          refs.plot.textContent = options.message;
        }
      }
      refs.plot.style.display = 'block';
    }
    if(options.clearStats !== false && refs.statsResults){
      clearLineStatsReportHost();
      refs.statsResults.textContent = '';
    }
    if(options.resetLegend !== false){
      lineLegendItems = [];
      lineLegendWidth = 0;
      lineLegendLayoutInfo = createDefaultLineLegendLayoutInfo();
    }
    console.debug('Debug: line render state reset',{ reason, hasMessage: !!options.message });
  }

  function clearLineStatsOutputs(message, options = {}){
    const placeholder = message || lineStatsDefaultPlaceholder;
    const session = options.session || null;
    const lineRefs = resolveLineRefsContext(session, options);
    const statsState = getLineStatsState(session);
    const statsResults = lineRefs.statsResults || null;
    statsState.hasResults = false;
    statsState.panelModel = { resultsModel: null, reportModel: null };
    if(statsResults){
      clearLineStatsReportHost({ ...options, refs: lineRefs });
      statsResults.textContent = placeholder;
    }
  }

  function lineStatsPanelHasRenderedResults(options = {}){
    const lineRefs = resolveLineRefsContext(options.session || null, options);
    const statsResults = lineRefs.statsResults || null;
    if(!statsResults || typeof statsResults.querySelector !== 'function'){
      return false;
    }
    return !!statsResults.querySelector('.stats-table-card, table, .stats-report-panel, .stats-assumption-container');
  }

  function lineStatsResultsAvailable(session = null, options = {}){
    const statsState = getLineStatsState(session);
    return lineStatsPanelHasRenderedResults({ ...options, session })
      || lineStatsPanelModelHasContent(statsState.panelModel)
      || !!statsState.hasResults
      || !!statsState.restorePending?.hasResults;
  }

  function setLineStatsStatus(message, options = {}){
    const lineRefs = resolveLineRefsContext(options.session || null, options);
    if(lineRefs.statsStatus){
      lineRefs.statsStatus.textContent = message || '';
    }
  }

  function updateLineStatsButtonState(config = {}, options = {}){
    const lineRefs = resolveLineRefsContext(options.session || null, options);
    if(!lineRefs.statsButton){
      return;
    }
    if(Object.prototype.hasOwnProperty.call(config,'disabled')){
      lineRefs.statsButton.disabled = !!config.disabled;
    }
    if(typeof config.label === 'string' && config.label){
      lineRefs.statsButton.textContent = config.label;
    }
  }

  function formatLineSignatureNumber(value){
    if(Number.isFinite(value)){
      return Number(value).toPrecision(6);
    }
    return 'na';
  }

  function isLineDiagnosticsEnabled(){
    // Line regression reports always include residual diagnostics; this is not a user-facing toggle.
    return true;
  }

  function createLine2dSeriesAccumulator(matrix, options = {}){
    const data = Array.isArray(matrix) ? matrix : [];
    if(!data.length){
      return null;
    }
    const header = Array.isArray(data[0]) ? data[0] : [];
    let xIndex = header.findIndex(value => String(value).trim().toLowerCase() === 'x');
    if(xIndex < 0){
      xIndex = 0;
    }
    const replicates = Math.max(
      LINE_MIN_REPLICATES,
      clampLineReplicateCount(options.replicates ?? lineReplicates)
    );
    const totalSeries = Math.max(0, Math.floor((header.length - 1) / replicates));
    const labels = Array.isArray(options.labels)
      ? Array.from({ length: totalSeries }, (_unused, index) => {
          const fallback = `Series ${index + 1}`;
          const label = options.labels[index] == null ? '' : String(options.labels[index]).trim();
          return label || fallback;
        })
      : resolveLine2dSeriesLabelsFromHeader(header, totalSeries, { replicates });
    return {
      data,
      header,
      xIndex,
      replicates,
      totalSeries,
      labels,
      series: labels.map((name, index) => ({
        name,
        baseName: name,
        points: [],
        sourceIndex: index
      })),
      xMinRaw: Infinity,
      xMaxRaw: -Infinity,
      yMinRaw: Infinity,
      yMaxRaw: -Infinity,
      logX: options.logX === true,
      logY: options.logY === true,
      logPlusOneX: options.logPlusOneX === true,
      logPlusOneY: options.logPlusOneY === true
    };
  }

  function appendLine2dSeriesAccumulatorRow(accumulator, rowIndex){
    if(!accumulator || rowIndex <= 0 || rowIndex >= accumulator.data.length){
      return false;
    }
    const row = Array.isArray(accumulator.data[rowIndex]) ? accumulator.data[rowIndex] : [];
    const xValue = parseFloat(row[accumulator.xIndex]);
    const hasX = Number.isFinite(xValue);
    for(let seriesIndex = 0; seriesIndex < accumulator.series.length; seriesIndex += 1){
      const replicateValues = [];
      for(let replicateIndex = 0; replicateIndex < accumulator.replicates; replicateIndex += 1){
        const columnIndex = 1 + (seriesIndex * accumulator.replicates) + replicateIndex;
        if(columnIndex >= row.length){
          continue;
        }
        const yValue = parseFloat(row[columnIndex]);
        if(Number.isFinite(yValue)){
          replicateValues.push(yValue);
        }
      }
      if(!hasX || !replicateValues.length){
        accumulator.series[seriesIndex].points.push(null);
        continue;
      }
      const replicateCount = replicateValues.length;
      const mean = replicateValues.reduce((sum, value) => sum + value, 0) / replicateCount;
      let variance = 0;
      if(replicateCount > 1){
        variance = replicateValues.reduce((sum, value) => {
          const diff = value - mean;
          return sum + (diff * diff);
        }, 0) / (replicateCount - 1);
      }
      const stdev = replicateCount > 1 ? Math.sqrt(variance) : 0;
      const minValue = Math.min(...replicateValues);
      const maxValue = Math.max(...replicateValues);
      const hasSpread = replicateCount > 1;
      const lower = hasSpread ? mean - stdev : null;
      const upper = hasSpread ? mean + stdev : null;
      const yMinCandidate = hasSpread ? lower : minValue;
      const yMaxCandidate = hasSpread ? upper : maxValue;
      accumulator.series[seriesIndex].points.push({
        x: xValue,
        y: mean,
        replicates: replicateValues.slice(),
        replicateCount,
        stdev: hasSpread ? stdev : 0,
        lower,
        upper
      });
      if(xValue < accumulator.xMinRaw){ accumulator.xMinRaw = xValue; }
      if(xValue > accumulator.xMaxRaw){ accumulator.xMaxRaw = xValue; }
      if(yMinCandidate < accumulator.yMinRaw){ accumulator.yMinRaw = yMinCandidate; }
      if(yMaxCandidate > accumulator.yMaxRaw){ accumulator.yMaxRaw = yMaxCandidate; }
    }
    return true;
  }

  function finalizeLine2dSeriesAccumulator(accumulator){
    if(!accumulator){
      return { ok: false, reason: 'no-data-matrix', series: [], seriesWithData: [] };
    }
    const { header, xIndex, replicates, totalSeries, labels, series } = accumulator;
    let { xMinRaw, xMaxRaw, yMinRaw, yMaxRaw } = accumulator;
    let seriesWithData = series.filter(entry => entry.points.some(Boolean));
    const base = { header, xIndex, replicates, totalSeries, labels, series, seriesWithData };
    if(!seriesWithData.length){
      return { ...base, ok: false, reason: 'no-valid-series', seriesWithData: [] };
    }
    if(accumulator.logX && xMinRaw <= 0 && !accumulator.logPlusOneX){
      return { ...base, ok: false, reason: 'log-x-nonpositive' };
    }
    if(accumulator.logY && yMinRaw <= 0 && !accumulator.logPlusOneY){
      return { ...base, ok: false, reason: 'log-y-nonpositive' };
    }
    if(accumulator.logX && accumulator.logPlusOneX){
      seriesWithData.forEach(entry => {
        entry.points = entry.points.map(point => (
          point && Number.isFinite(point.x) ? { ...point, x: point.x + 1 } : point
        ));
      });
      if(Number.isFinite(xMinRaw)){ xMinRaw += 1; }
      if(Number.isFinite(xMaxRaw)){ xMaxRaw += 1; }
    }
    if(accumulator.logY && accumulator.logPlusOneY){
      seriesWithData.forEach(entry => {
        entry.points = entry.points.map(point => {
          if(!point || !Number.isFinite(point.y)){
            return point;
          }
          const nextPoint = { ...point, y: point.y + 1 };
          if(Number.isFinite(point.lower)){ nextPoint.lower = point.lower + 1; }
          if(Number.isFinite(point.upper)){ nextPoint.upper = point.upper + 1; }
          if(Array.isArray(point.replicates)){
            nextPoint.replicates = point.replicates.map(value => Number.isFinite(value) ? value + 1 : value);
          }
          return nextPoint;
        });
      });
      if(Number.isFinite(yMinRaw)){ yMinRaw += 1; }
      if(Number.isFinite(yMaxRaw)){ yMaxRaw += 1; }
    }
    return {
      ...base,
      ok: true,
      reason: null,
      seriesWithData,
      xMinRaw,
      xMaxRaw,
      yMinRaw,
      yMaxRaw
    };
  }

  function buildLine2dSeriesDataModel(matrix, options = {}){
    const accumulator = createLine2dSeriesAccumulator(matrix, options);
    if(!accumulator){
      return finalizeLine2dSeriesAccumulator(null);
    }
    for(let rowIndex = 1; rowIndex < accumulator.data.length; rowIndex += 1){
      appendLine2dSeriesAccumulatorRow(accumulator, rowIndex);
    }
    return finalizeLine2dSeriesAccumulator(accumulator);
  }

  function buildLineStatsContextFromOwnerData(session = null, options = {}){
    const ownerSession = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    if(!ownerSession){
      return null;
    }
    const controls = getLineRuntimeControlsForSession(ownerSession, lineFallbackRuntimeControls);
    if(controls.viewMode === '3d' || controls.tableFormat === '3d'){
      return null;
    }
    let hot = options.hot || getLineSessionHotManager(ownerSession) || null;
    if(!hot && isLineSessionActive(ownerSession)){
      // Reopen/recovery may restore a valid SVG before the table manager has been
      // rebound to the active owner. At a user-initiated stats calculation it is
      // safe and necessary to ensure that owner's HOT instance before reading the
      // included matrix; this is the same owner-scoped table path used by payload
      // capture and normal activation.
      hot = line.__ensureHotForActiveTab?.() || getActiveLineHotManager() || null;
    }
    const matrix = Array.isArray(options.matrix)
      ? options.matrix
      : (typeof hot?.getIncludedDataMatrix === 'function'
          ? hot.getIncludedDataMatrix()
          : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(hot) : []));
    const grouped = normalizeLineOwnedGroupedState(ownerSession.state?.grouped || null);
    const logPlusOne = normalizeLineOwnedLogPlusOneState(ownerSession.state?.logPlusOne || {
      x: lineLogPlusOneX,
      y: lineLogPlusOneY
    });
    const seriesModel = buildLine2dSeriesDataModel(matrix, {
      replicates: grouped.replicates,
      logX: controls.logX,
      logY: controls.logY,
      logPlusOneX: logPlusOne.x,
      logPlusOneY: logPlusOne.y
    });
    if(!seriesModel.ok){
      lineDebug('Debug: line stats owner-context bootstrap skipped', {
        tabId: ownerSession.tabId || null,
        reason: seriesModel.reason || 'invalid-series-model'
      });
      return null;
    }
    const lineRefs = resolveLineRefsContext(ownerSession, options);
    const forecast = resolveForecastOptions({
      session: ownerSession,
      reason: options.reason || 'line-stats-owner-context-forecast'
    });
    return {
      series: seriesModel.seriesWithData,
      statsOptions: {
        showIntervals: !!controls.showIntervals || !!controls.showPredictionIntervals,
        showConfidenceIntervals: !!controls.showIntervals,
        showPredictionIntervals: !!controls.showPredictionIntervals,
        showDiagnostics: true,
        // Regression confidence/prediction intervals remain fixed at 95% and are
        // intentionally independent from the inferential significance level.
        alpha: 0.05,
        regressionCache: new Map(),
        forecast
      },
      controls: {
        method: lineRefs.statType?.value || controls.statType || 'pearson',
        regressionMode: lineRefs.regressionMode?.value || controls.regressionMode || 'linear'
      }
    };
  }

  function reconcileLineStatsContextFromOwnerData(session = null, options = {}){
    const ownerSession = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    if(!ownerSession){
      return false;
    }
    const context = buildLineStatsContextFromOwnerData(ownerSession, options);
    if(!context){
      return false;
    }
    primeLineStatsContext(context, { ...options, session: ownerSession });
    const statsState = getLineStatsState(ownerSession);
    const ready = !!statsState.context && Array.isArray(statsState.context.series) && statsState.context.series.length > 0;
    lineDebug('Debug: line stats owner-context reconciled', {
      tabId: ownerSession.tabId || null,
      reason: options.reason || 'line-stats-owner-context-reconcile',
      ready,
      seriesCount: statsState.context?.series?.length || 0,
      hasResults: !!statsState.hasResults
    });
    return ready;
  }

  function buildLineStatsSignature(payload){
    if(!payload || !Array.isArray(payload.series) || !payload.series.length){
      return 'empty';
    }
    const method = payload.controls?.method || 'pearson';
    const regressionMode = payload.controls?.regressionMode || 'linear';
    const forecast = payload.statsOptions?.forecast || {};
    const forecastKey = [
      forecast.horizon ?? '',
      forecast.seasonLength ?? '',
      forecast.autoTune ? 'auto' : 'manual',
      forecast.criterion || ''
    ].join('|');
    let seriesKey = 'series:none';
    if(typeof payload.signatureSeed === 'string'){
      seriesKey = payload.signatureSeed;
    }else{
      const parts = payload.series.map((series, idx)=>{
        const name = series?.name || `series-${idx}`;
        const points = Array.isArray(series?.points) ? series.points.filter(Boolean) : [];
        if(!points.length){
          return `${name}:empty`;
        }
        let count = 0;
        let sumX = 0;
        let sumY = 0;
        let sumXX = 0;
        let sumYY = 0;
        let sumXY = 0;
        points.forEach(pt=>{
          const x = Number(pt?.x);
          const y = Number(pt?.y);
          if(Number.isFinite(x) && Number.isFinite(y)){
            count += 1;
            sumX += x;
            sumY += y;
            sumXX += x * x;
            sumYY += y * y;
            sumXY += x * y;
          }
        });
        return `${name}:${count}:${formatLineSignatureNumber(sumX)}:${formatLineSignatureNumber(sumY)}:${formatLineSignatureNumber(sumXX)}:${formatLineSignatureNumber(sumYY)}:${formatLineSignatureNumber(sumXY)}`;
      });
      seriesKey = parts.join(';');
    }
    const inferenceAlpha = getLineStatsAlpha();
    return [method, regressionMode, String(inferenceAlpha), forecastKey, seriesKey].join('::');
  }

  function isLineStatsDisplayOnlyRefresh(reason){
    const token = String(reason || '').toLowerCase();
    return token === 'intervals-toggle'
      || token === 'prediction-intervals-toggle';
  }

  function isLineStatsCurrentForPayload(payload, session = null){
    if(!payload || !Array.isArray(payload.series) || !payload.series.length){
      return false;
    }
    const signature = buildLineStatsSignature(payload);
    const statsState = getLineStatsState(session);
    const version = Number(statsState.version) || 0;
    return version > 0
      && signature === statsState.signature
      && statsState.lastRunVersion === version
      && lineStatsResultsAvailable(session);
  }

  function lineHasComputedStats(session = null){
    const statsState = getLineStatsState(session);
    const version = Number(statsState.version) || 0;
    return version > 0
      && statsState.lastRunVersion === version
      && lineStatsResultsAvailable(session)
      && !statsState.computationPending;
  }

  function setLineOverlayInputDisabled(input, disabled, message, options = {}){
    if(!input){
      return;
    }
    input.disabled = !!disabled;
    input.title = message || '';
    if(disabled && options.clearWhenDisabled !== false && input.checked){
      input.checked = false;
    }
    const label = typeof input.closest === 'function'
      ? input.closest('label')
      : input.parentElement;
    if(label){
      label.title = message || '';
      label.classList.toggle('config-panel__checkbox--disabled', !!disabled);
    }
  }

  function updateLineRegressionOverlayControlState(statsReady = lineHasComputedStats(), options = {}){
    const tabLike = options.tab || options.tabId || getLineProjectionTabId() || null;
    const session = resolveLineRefsSession(tabLike, options);
    const lineRefs = resolveLineRefsContext(session, options);
    const controls = resolveLineOverlayControls(tabLike, { ...options, session, refs: lineRefs });
    const viewModeControl = getLineNodeById('lineViewMode', tabLike) || lineRefs.viewMode || null;
    const replicateModeControl = getLineNodeById('lineTableFormat', tabLike) || lineRefs.replicateMode || null;
    const is3d = getLineViewState().viewMode === '3d' || viewModeControl?.value === '3d' || replicateModeControl?.value === '3d';
    const disabled = !!is3d || !statsReady;
    const msg = is3d
      ? 'Regression overlays are available in 2D line mode.'
      : (statsReady ? '' : 'Calculate statistics before enabling regression overlays.');
    const clearWhenDisabled = options.preserveCheckedState === true ? false : true;
    const clearTrendWhenDisabled = clearWhenDisabled && !!is3d;
    setLineOverlayInputDisabled(controls.showTrendLine, disabled, msg, { clearWhenDisabled: clearTrendWhenDisabled });
    setLineOverlayInputDisabled(controls.showPlotStats, disabled, msg, { clearWhenDisabled: clearTrendWhenDisabled });
    const trendReady = !disabled && !!controls.showTrendLine?.checked;
    const intervalMessage = trendReady ? '' : (msg || 'Enable the trend line first.');
    const clearIntervalsWhenDisabled = clearWhenDisabled && (!!is3d || (!disabled && !trendReady));
    setLineOverlayInputDisabled(controls.showIntervals, disabled || !trendReady, intervalMessage, { clearWhenDisabled: clearIntervalsWhenDisabled });
    setLineOverlayInputDisabled(controls.showPredictionIntervals, disabled || !trendReady, intervalMessage, { clearWhenDisabled: clearIntervalsWhenDisabled });
    console.debug('Debug: line regression overlay controls synced', {
      statsReady: !!statsReady,
      is3d,
      disabled,
      showTrendLine: !!controls.showTrendLine?.checked,
      showConfidenceIntervals: !!controls.showIntervals?.checked,
      showPredictionIntervals: !!controls.showPredictionIntervals?.checked,
      showPlotStats: !!controls.showPlotStats?.checked
    });
  }

  function syncLineLast2dControlStateFromRefs(tabLike = null, options = {}){
    const session = resolveLineRefsSession(tabLike || options.tab || options.tabId || getLineProjectionTabId() || null, options);
    const lineRefs = resolveLineRefsContext(session, options);
    const activeTabId = tabLike || options.tab || options.tabId || session?.tabId || getLineProjectionTabId() || null;
    const replicateModeControl = getLineNodeById('lineTableFormat', activeTabId) || lineRefs.replicateMode || null;
    if(getLineViewState().viewMode === '3d' || replicateModeControl?.value === '3d'){
      return;
    }
    const displayModeControl = getLineNodeById('lineDisplayMode', activeTabId) || lineRefs.displayMode || null;
    const logXControl = getLineNodeById('lineLogX', activeTabId) || lineRefs.logX || null;
    const logYControl = getLineNodeById('lineLogY', activeTabId) || lineRefs.logY || null;
    const showFrameControl = getLineNodeById('lineShowFrame', activeTabId) || lineRefs.showFrame || null;
    const overlayState = readLineOverlayControlState(activeTabId, { ...options, session, refs: lineRefs });
    lineLast2dDisplayMode = sanitizeLineDisplayMode(displayModeControl?.value ?? lineDisplayMode);
    lineLast2dLogX = !!logXControl?.checked;
    lineLast2dLogY = !!logYControl?.checked;
    lineLast2dShowFrame = !!showFrameControl?.checked;
    lineLast2dShowTrendLine = !!overlayState.showTrendLine;
    lineLast2dShowIntervals = !!overlayState.showIntervals;
    lineLast2dShowPredictionIntervals = !!overlayState.showPredictionIntervals;
    lineLast2dShowPlotStats = !!overlayState.showPlotStats;
  }

  function handleLineStatsUnavailable(statsOptions, placeholder){
    const session = statsOptions?.session || getLineActiveSessionForState();
    const runtimeControls = getLineRuntimeControlsForSession(session, lineFallbackRuntimeControls);
    const advisorOptions = statsOptions || {
      session,
      showIntervals: !!runtimeControls.showIntervals || !!runtimeControls.showPredictionIntervals,
      showDiagnostics: isLineDiagnosticsEnabled()
    };
    renderLineStatsAdvisor([], advisorOptions);
    primeLineStatsContext(null, { session, placeholder: placeholder || lineStatsEmptyPlaceholder });
  }

  function primeLineStatsContext(payload, options = {}){
    const session = options.session || getLineActiveSessionForState();
    const statsState = getLineStatsState(session);
    if(!payload || !Array.isArray(payload.series) || !payload.series.length){
      statsState.context = null;
      statsState.signature = null;
      statsState.version = 0;
      statsState.lastRunVersion = 0;
      statsState.hasResults = false;
      statsState.computationPending = false;
      statsState.restorePending = null;
      setLineRegressionSummariesState([], session);
      clearLineStatsOutputs(options.placeholder || lineStatsEmptyPlaceholder, { ...options, session });
      setLineStatsStatus('', { ...options, session });
      updateLineStatsButtonState({ disabled: true, label: 'Calculate statistics' }, { ...options, session });
      updateLineRegressionOverlayControlState(false, { ...options, session });
      return;
    }
    const signature = buildLineStatsSignature(payload);
    const pendingRestore = statsState.restorePending;
    if(pendingRestore){
      statsState.restorePending = null;
      if(pendingRestore.hasResults){
        const version = Math.max(
          Number(statsState.version) || 0,
          Number(statsState.lastRunVersion) || 0,
          Number(pendingRestore.version) || 0,
          1
        );
        statsState.version = version;
        statsState.signature = signature;
        statsState.context = { ...payload, version, signature };
        statsState.lastRunVersion = version;
        statsState.hasResults = true;
        statsState.computationPending = false;
        if(lineStatsPanelModelHasContent(statsState.panelModel) && !lineStatsPanelHasRenderedResults({ ...options, session })){
          restoreLineStatsPanelModel(statsState.panelModel, { ...options, session });
        }
        setLineStatsStatus('Statistics up to date.', { ...options, session });
        updateLineStatsButtonState({ disabled: false, label: 'Recalculate statistics' }, { ...options, session });
        updateLineRegressionOverlayControlState(true, { ...options, session });
        console.debug('Debug: line stats restored context adopted', {
          savedSignature: pendingRestore.signature || null,
          currentSignature: signature,
          version
        });
        return;
      }
    }
    const changed = signature !== statsState.signature;
    let version = statsState.version || 0;
    if(changed){
      version += 1;
      statsState.lastRunVersion = 0;
      statsState.hasResults = false;
      setLineRegressionSummariesState([], session);
    }else if(!version){
      version = 1;
    }
    statsState.version = version;
    statsState.signature = signature;
    statsState.context = { ...payload, version, signature };
    if(changed){
      clearLineStatsOutputs(lineStatsDefaultPlaceholder, { ...options, session });
      setLineStatsStatus('Statistics ready to calculate.', { ...options, session });
      updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' }, { ...options, session });
      updateLineRegressionOverlayControlState(false, { ...options, session });
      return;
    }
    if(statsState.lastRunVersion === version && lineStatsResultsAvailable(session, options)){
      setLineStatsStatus('Statistics up to date.', { ...options, session });
      updateLineStatsButtonState({ disabled: false, label: 'Recalculate statistics' }, { ...options, session });
      updateLineRegressionOverlayControlState(true, { ...options, session });
    }else if(!statsState.computationPending){
      setLineStatsStatus('Statistics ready to calculate.', { ...options, session });
      updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' }, { ...options, session });
      updateLineRegressionOverlayControlState(false, { ...options, session });
    }
  }

  function requestLineStatsContextRefresh(reason, options = {}){
    const session = options.session || getLineActiveSessionForState();
    const lineRefs = resolveLineRefsContext(session, options);
    const statsState = getLineStatsState(session);
    const context = statsState.context;
    if(!context || !Array.isArray(context.series) || !context.series.length){
      console.debug('Debug: line stats context refresh skipped',{ reason, hasContext: !!context });
      return false;
    }
    const refreshed = {
      ...context,
      statsOptions: {
        ...context.statsOptions,
        showIntervals: isLineAnyIntervalEnabled(),
        showDiagnostics: isLineDiagnosticsEnabled()
      },
      controls: {
        ...context.controls,
        method: lineRefs.statType?.value || context.controls?.method || 'pearson',
        regressionMode: lineRefs.regressionMode?.value || context.controls?.regressionMode || 'linear'
      }
    };
    if(context.statsOptions?.forecast){
      refreshed.statsOptions.forecast = { ...context.statsOptions.forecast };
    }
    const displayOnlyRefresh = isLineStatsDisplayOnlyRefresh(reason);
    const hadCurrentRenderedStats = displayOnlyRefresh && isLineStatsCurrentForPayload(refreshed, session);
    console.debug('Debug: line stats context refresh',{ reason, seriesCount: refreshed.series.length, displayOnlyRefresh, hadCurrentRenderedStats });
    primeLineStatsContext(refreshed, { ...options, session });
    if(hadCurrentRenderedStats && !statsState.computationPending){
      updateLineRegressionOverlayControlState(true);
      scheduleLineViewRefresh(`${reason || 'line-stats-display'}-redraw`, { force: true, skipThresholdEvaluation: true });
    }
    // Persist active tab state when this refresh is triggered by user control changes
    try{
      const skipPersist = String(reason || '').toLowerCase().includes('payload') || String(reason || '').toLowerCase().includes('payload-restored');
      if(!skipPersist){
        const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
        if(sess && typeof sess.persistUserModifiedTabState === 'function'){
          sess.persistUserModifiedTabState(undefined, { reason: 'stats-control-change' });
        }else if(sess && typeof sess.persistActiveTabState === 'function'){
          sess.persistActiveTabState(undefined, { reason: 'stats-control-change', origin: 'user' });
        }
      }
    }catch(e){
      console.debug('Debug: persistActiveTabState after stats control change failed', { err: e?.message || String(e) });
    }
    return true;
  }

  function shouldRedrawLineAfterStatsCompute(session){
    session = ensureLineSessionOwnershipShape(session);
    if(!session){
      return false;
    }
    const lineRefs = resolveLineRefsContext(session, {});
    if(getLineViewState(session).viewMode === '3d' || lineRefs.replicateMode?.value === '3d'){
      return false;
    }
    const controls = resolveLineOverlayControls(session?.tabId || getLineProjectionTabId() || null, { session, refs: lineRefs });
    if(controls.showTrendLine?.checked){
      return true;
    }
    return (!!controls.showIntervals?.checked && !controls.showIntervals?.disabled)
      || (!!controls.showPredictionIntervals?.checked && !controls.showPredictionIntervals?.disabled);
  }

  function renderLineStats(session, options = {}){
    session = ensureLineSessionOwnershipShape(session);
    if(!session){
      return false;
    }
    const statsState = getLineStatsState(session);
    const panelModel = normalizeLineStatsPanelModel(
      options.panelModel
      || statsState.panelModel
      || session?.state?.stats?.panelModel
      || null
    );
    if(!lineStatsPanelModelHasContent(panelModel)){
      if(options.clearWhenEmpty === true){
        clearLineStatsOutputs(options.placeholder || lineStatsDefaultPlaceholder, { ...options, session });
      }
      return false;
    }
    const restored = restoreLineStatsPanelModel(panelModel, { ...options, session });
    if(restored){
      statsState.panelModel = panelModel;
      statsState.hasResults = true;
      setLineStatsStatus(options.status || 'Statistics up to date.', { ...options, session });
      updateLineStatsButtonState({ disabled: false, label: options.buttonLabel || 'Recalculate statistics' }, { ...options, session });
    }
    return restored;
  }

  function calculateLineStats(session, options = {}){
    session = ensureLineSessionOwnershipShape(session);
    if(!session){
      return null;
    }
    const statsState = getLineStatsState(session);
    const context = options.context || statsState.context;
    if(!context || !Array.isArray(context.series) || !context.series.length){
      return null;
    }
    updateLineStats(context.series, { ...(context.statsOptions || {}), session });
    statsState.lastRunVersion = context.version;
    statsState.panelModel = captureLineStatsPanelModel(null, { session });
    statsState.hasResults = true;
    if(session?.state){
      session.state.statsState = statsState;
      session.state.stats = normalizeLineCanonicalStats({
        ...(session.state.stats || {}),
        signature: statsState.signature || context.signature || null,
        version: Number(statsState.version) || Number(context.version) || 0,
        lastRunVersion: Number(statsState.lastRunVersion) || Number(context.version) || 0,
        hasResults: true,
        regressionSummaries: getLineRegressionSummariesState(session).slice(),
        panelModel: statsState.panelModel
      });
      stampLineSessionState(session);
    }
    return statsState;
  }

  function handleLineStatsComputeClick(){
    const session = getLineActiveSessionForState();
    const statsState = getLineStatsState(session);
    if(statsState.computationPending){
      return;
    }
    let context = statsState.context;
    if(!context || !Array.isArray(context.series) || !context.series.length){
      // A valid render cache can restore before the owning HOT manager finishes
      // rehydrating. Rebuild the transient computation context lazily at the
      // user action boundary so archive/recovery sessions behave like live draws
      // without forcing an expensive redraw solely to prime statistics state.
      reconcileLineStatsContextFromOwnerData(session, { reason: 'line-stats-compute-lazy-context' });
      context = statsState.context;
    }
    if(!context || !Array.isArray(context.series) || !context.series.length){
      setLineStatsStatus('Statistics unavailable until data is loaded.', { session });
      return;
    }
    statsState.computationPending = true;
    updateLineStatsButtonState({ disabled: true, label: 'Calculating…' }, { session });
    setLineStatsStatus('Calculating statistics…', { session });
    try{
      calculateLineStats(session, { context });
      renderLineStats(session, { status: 'Statistics up to date.', buttonLabel: 'Recalculate statistics' });
      updateLineRegressionOverlayControlState(true);
      if(shouldRedrawLineAfterStatsCompute(session)){
        scheduleLineDrawForSession(session, { reason: 'line-stats-computed-redraw', viewOnly: true, silentOverlay: true });
      }
    }catch(err){
      console.error('line stats computation failed', err);
      const lineRefs = resolveLineRefsContext(session, {});
      if(lineRefs.statsResults){
        lineRefs.statsResults.textContent = 'Unable to compute statistics. See console for details.';
      }
      statsState.hasResults = false;
      setLineStatsStatus('Failed to compute statistics.', { session, refs: lineRefs });
      updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' }, { session, refs: lineRefs });
      updateLineRegressionOverlayControlState(false);
    }finally{
      statsState.computationPending = false;
      // Persist the tab payload immediately if the computed results belong to the current context
      try{
        const stillCurrent = statsState.context === context && statsState.signature === context.signature;
        const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
        if(stillCurrent && statsState.lastRunVersion === context.version){
          rememberLineSessionState(session.tabId || getLineProjectionTabId() || null, { reason: 'line-stats-computed-remember-session' }, { readControls: true });
          if(sess && typeof sess.persistUserModifiedTabState === 'function'){
            sess.persistUserModifiedTabState(undefined, { reason: 'stats-computed' });
          }else if(sess && typeof sess.persistActiveTabState === 'function'){
            sess.persistActiveTabState(undefined, { reason: 'stats-computed', origin: 'user' });
          }
        }
      }catch(e){
        console.debug('Debug: persistActiveTabState after stats compute failed', { err: e?.message || String(e) });
      }
    }
  }

  function applyLineAxisSettings(settings, session = null, meta = {}){
    const base = createLineAxisSettings();
    if(settings && typeof settings === 'object'){
      const strokeCandidate = Number(settings.strokeWidth);
      if(Number.isFinite(strokeCandidate) && strokeCandidate > 0){
        base.strokeWidth = strokeCandidate;
      }
      if(typeof settings.color === 'string' && settings.color.trim()){
        base.color = settings.color;
      }
      const xInterval = settings.tickIntervalX ?? settings.xTickInterval ?? settings?.x?.tickInterval ?? null;
      const yInterval = settings.tickIntervalY ?? settings.yTickInterval ?? settings?.y?.tickInterval ?? null;
      base.x.tickInterval = xInterval === '' ? null : xInterval;
      base.y.tickInterval = yInterval === '' ? null : yInterval;
      const xMajorTickLength = settings.majorTickLengthX ?? settings.xMajorTickLength ?? settings?.x?.majorTickLength ?? null;
      const yMajorTickLength = settings.majorTickLengthY ?? settings.yMajorTickLength ?? settings?.y?.majorTickLength ?? null;
      base.x.majorTickLength = chartStyle.normalizeOptionalMajorTickLength(xMajorTickLength);
      base.x.labelAngle = chartStyle.normalizeOptionalXAxisLabelAngle(settings.xLabelAngle ?? settings.labelAngleX ?? settings?.x?.labelAngle);
      base.y.majorTickLength = chartStyle.normalizeOptionalMajorTickLength(yMajorTickLength);
      const xMinorTicks = settings.minorTicksX ?? settings.x?.minorTicks ?? false;
      const yMinorTicks = settings.minorTicksY ?? settings.y?.minorTicks ?? false;
      base.x.minorTicks = !!xMinorTicks;
      base.y.minorTicks = !!yMinorTicks;
      const xMinorSubdiv = settings.minorTickSubdivisionsX ?? settings.minorSubdivisionsX ?? settings.x?.minorTickSubdivisions ?? settings.x?.minorSubdivisions ?? null;
      const yMinorSubdiv = settings.minorTickSubdivisionsY ?? settings.minorSubdivisionsY ?? settings.y?.minorTickSubdivisions ?? settings.y?.minorSubdivisions ?? null;
      base.x.minorTickSubdivisions = clampMinorTickSubdivisions(xMinorSubdiv);
      base.y.minorTickSubdivisions = clampMinorTickSubdivisions(yMinorSubdiv);
      const xNotation = settings.axisNotationX ?? settings.notationX ?? settings?.x?.notation ?? 'decimal';
      const yNotation = settings.axisNotationY ?? settings.notationY ?? settings?.y?.notation ?? 'decimal';
      base.x.notation = sanitizeLineAxisNotation(xNotation);
      base.y.notation = sanitizeLineAxisNotation(yNotation);
      if(settings.additionalTicks !== undefined){
        if(Array.isArray(settings.additionalTicks)){
          base.x.additionalTicks = sanitizeLineAxisAdditionalTicks(settings.additionalTicksX);
          base.y.additionalTicks = sanitizeLineAxisAdditionalTicks(settings.additionalTicksY ?? settings.additionalTicks);
        }else{
          base.x.additionalTicks = sanitizeLineAxisAdditionalTicks(
            settings.additionalTicks.x ?? settings.additionalTicksX ?? settings?.x?.additionalTicks
          );
          base.y.additionalTicks = sanitizeLineAxisAdditionalTicks(
            settings.additionalTicks.y ?? settings.additionalTicksY ?? settings?.y?.additionalTicks
          );
        }
      }else{
        base.x.additionalTicks = sanitizeLineAxisAdditionalTicks(settings.additionalTicksX ?? settings?.x?.additionalTicks);
        base.y.additionalTicks = sanitizeLineAxisAdditionalTicks(settings.additionalTicksY ?? settings?.y?.additionalTicks);
      }

      // Handle broken axis settings
      if(settings.brokenAxis){
        if(settings.brokenAxis.x){
          base.x.brokenAxis = {
            enabled: !!settings.brokenAxis.x.enabled,
            segments: Array.isArray(settings.brokenAxis.x.segments)
              ? settings.brokenAxis.x.segments.filter(seg =>
                  seg && typeof seg === 'object' &&
                  Number.isFinite(seg.start) && Number.isFinite(seg.end) &&
                  seg.start < seg.end
                ).map(seg => ({ start: Number(seg.start), end: Number(seg.end) }))
              : []
          };
        }
        if(settings.brokenAxis.y){
          base.y.brokenAxis = {
            enabled: !!settings.brokenAxis.y.enabled,
            segments: Array.isArray(settings.brokenAxis.y.segments)
              ? settings.brokenAxis.y.segments.filter(seg =>
                  seg && typeof seg === 'object' &&
                  Number.isFinite(seg.start) && Number.isFinite(seg.end) &&
                  seg.start < seg.end
                ).map(seg => ({ start: Number(seg.start), end: Number(seg.end) }))
              : []
          };
        }
      }
    }
    const applied = setLineAxisSettingsState(session || getLineProjectionSession({ reason: 'line-projection-mutation' }), base, { ...(meta || {}), reason: meta?.reason || 'line-axis-settings-apply' });
    console.debug('Debug: line axis settings applied',{ settings: applied });
  }

  function buildLineManualTicks(min, max, interval){
    if(!Number.isFinite(interval) || interval <= 0){ return null; }
    if(!Number.isFinite(min) || !Number.isFinite(max)){ return null; }
    if(min === max){
      max = min + interval;
    }
    const graphMin = Math.floor(min / interval) * interval;
    const graphMax = Math.ceil(max / interval) * interval;
    const ticks = [];
    let current = graphMin;
    let guard = 0;
    while(current <= graphMax + interval * 0.25 && guard < 1000){
      ticks.push(Number.parseFloat(current.toPrecision(12)));
      current += interval;
      guard += 1;
    }
    if(!ticks.length){
      ticks.push(Number.parseFloat(graphMin.toPrecision(12)));
    }
    console.debug('Debug: line manual ticks computed',{ interval, tickCount: ticks.length, min: graphMin, max: graphMax });
    return { min: graphMin, max: graphMax, ticks };
  }

  function computeBrokenAxisScale(config){
    const { dataMin, dataMax, segments, plotLength, orientation } = config;
    const isHorizontal = orientation === 'horizontal';

    if(!Array.isArray(segments) || segments.length === 0){
      // No broken axis, return standard linear scale
      return {
        isBroken: false,
        min: dataMin,
        max: dataMax,
        valueToPixel: (value, basePos, plotLen) => {
          const range = dataMax - dataMin || 1;
          if(isHorizontal){
            return basePos + plotLen * ((value - dataMin) / range);
          }else{
            return basePos + plotLen * (1 - (value - dataMin) / range);
          }
        },
        segments: []
      };
    }

    // Sort and validate segments
    const validSegments = segments
      .filter(seg => Number.isFinite(seg.start) && Number.isFinite(seg.end) && seg.start < seg.end)
      .sort((a, b) => a.start - b.start);

    if(validSegments.length === 0){
      // No valid segments, return standard scale
      return {
        isBroken: false,
        min: dataMin,
        max: dataMax,
        valueToPixel: (value, basePos, plotLen) => {
          const range = dataMax - dataMin || 1;
          if(isHorizontal){
            return basePos + plotLen * ((value - dataMin) / range);
          }else{
            return basePos + plotLen * (1 - (value - dataMin) / range);
          }
        },
        segments: []
      };
    }

    // Merge overlapping segments and calculate display ranges
    const mergedSegments = [];
    let current = { ...validSegments[0] };

    for(let i = 1; i < validSegments.length; i++){
      const seg = validSegments[i];
      if(seg.start <= current.end){
        // Overlapping or adjacent, merge
        current.end = Math.max(current.end, seg.end);
      }else{
        mergedSegments.push(current);
        current = { ...seg };
      }
    }
    mergedSegments.push(current);

    // Calculate the total data range covered by segments
    const totalDataRange = mergedSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);

    // Define gap size in pixels
    const gapSizePx = BROKEN_AXIS_GAP_SIZE_PX;
    const numGaps = mergedSegments.length - 1;
    const totalGapLength = numGaps * gapSizePx;
    const availableLength = plotLength - totalGapLength;

    // Assign pixel lengths to each segment proportionally
    const segmentMeta = mergedSegments.map((seg, idx) => {
      const dataRange = seg.end - seg.start;
      const lengthPx = (dataRange / totalDataRange) * availableLength;
      return {
        start: seg.start,
        end: seg.end,
        dataRange,
        lengthPx,
        pixelStart: 0, // Will be calculated next
        pixelEnd: 0
      };
    });

    // Calculate pixel positions
    let currentPixel = 0;
    for(let i = 0; i < segmentMeta.length; i++){
      segmentMeta[i].pixelStart = currentPixel;
      segmentMeta[i].pixelEnd = currentPixel + segmentMeta[i].lengthPx;
      currentPixel = segmentMeta[i].pixelEnd + gapSizePx;
    }

    // Create value-to-pixel mapping function
    const valueToPixel = (value, basePos, plotLen) => {
      const mapPixel = pixel => {
        if(isHorizontal){
          return basePos + pixel;
        }else{
          return basePos + plotLen - pixel;
        }
      };

      // Find which segment contains this value
      for(let i = 0; i < segmentMeta.length; i++){
        const seg = segmentMeta[i];
        if(value >= seg.start && value <= seg.end){
          // Map value within this segment to pixels
          // Handle edge case where start === end (segment has zero range)
          const fraction = seg.dataRange > 0 ? (value - seg.start) / seg.dataRange : 0;
          const pixelInSegment = seg.pixelStart + fraction * seg.lengthPx;
          return mapPixel(pixelInSegment);
        }
      }

      // Value not in any segment - clamp to nearest segment edge
      if(value < segmentMeta[0].start){
        return mapPixel(segmentMeta[0].pixelStart);
      }
      if(value > segmentMeta[segmentMeta.length - 1].end){
        return mapPixel(segmentMeta[segmentMeta.length - 1].pixelEnd);
      }

      // Value falls in a gap - return the end of the segment before it
      for(let i = 0; i < segmentMeta.length - 1; i++){
        if(value > segmentMeta[i].end && value < segmentMeta[i + 1].start){
          // In gap between segment i and i+1
          return mapPixel(segmentMeta[i].pixelEnd);
        }
      }

      // Final fallback - should not reach here, but return first segment start for safety
      return mapPixel(segmentMeta[0].pixelStart);
    };

    return {
      isBroken: true,
      min: mergedSegments[0].start,
      max: mergedSegments[mergedSegments.length - 1].end,
      segments: segmentMeta,
      gapSizePx,
      valueToPixel
    };
  }

  console.debug('Debug: line group labels state initialized', {
    initial: lineSeriesGroupLabels,
    replicates: lineReplicates
  }); // Debug: group label state bootstrap

  const lineRefsFallback = {};
  const LINE_REF_KEYS = Object.freeze([
    'root',
    'tablePanel',
    'graphPanel',
    'panelResizer',
    'svgBox',
    'rotationSvg',
    'rotationRenderer',
    'configPanel',
    'renderRow',
    'renderButton',
    'autoDrawNotice',
    'hotContainer',
    'hotWrapper',
    'plot',
    'tooltip',
    'statType',
    'statsResults',
    'statsAdvisor',
    'statsButton',
    'statsStatus',
    'regressionMode',
    'showTrendLine',
    'showIntervals',
    'showPredictionIntervals',
    'showPlotStats',
    'showLegend',
    'forecastFieldset',
    'forecastHorizon',
    'forecastSeasonLength',
    'forecastAuto',
    'forecastCriterion',
    'replicateMode',
    'replicatesContainer',
    'replicatesInput',
    'groupedList',
    'viewMode',
    'fill',
    'border',
    'borderWidth',
    'errorBarWidth',
    'dotSize',
    'displayMode',
    'alpha',
    'alphaVal',
    'fontSize',
    'fontSizeVal',
    'showGrid',
    'showFrame',
    'logX',
    'logY',
    'xMin',
    'xMax',
    'yMin',
    'yMax',
    'originMode',
    'originX',
    'originY',
    'loadExample',
    'importBtn',
    'fileInput',
    'openBtn',
    'saveBtn',
    'saveAsBtn',
    'graphFileInput',
    'hot'
  ]);

  function getLineRefsOwnerSession(){
    return ensureLineSessionOwnershipShape(getLineActiveSessionForState());
  }

  function getLineRefsStorage(){
    return getLineRefsOwnerSession()?.refs || lineRefsFallback;
  }

  function setLineRefValue(key, value){
    const session = getLineRefsOwnerSession();
    const storage = session?.refs || lineRefsFallback;
    const normalized = normalizeLineRefValue(value);
    storage[key] = normalized || null;
    if(session){
      if(key === 'root'){
        session.root = normalized || null;
      }
      session.updatedAt = Date.now();
    }
    if(key === 'svgBox'){
      lineSvgBoxRef = normalized || null;
    }
    return true;
  }

  function createLineRefsFacade(){
    return new Proxy(lineRefsFallback, {
      get(_target, prop){
        if(prop === '__lineRefsFacade'){
          return true;
        }
        if(prop === Symbol.toStringTag){
          return 'LineRefsFacade';
        }
        if(prop === 'toJSON'){
          return () => createLineRefsSnapshot(getLineRefsStorage());
        }
        const storage = getLineRefsStorage();
        return storage[prop] || null;
      },
      set(_target, prop, value){
        if(typeof prop === 'symbol'){
          lineRefsFallback[prop] = value;
          return true;
        }
        return setLineRefValue(prop, value);
      },
      deleteProperty(_target, prop){
        const storage = getLineRefsStorage();
        delete storage[prop];
        delete lineRefsFallback[prop];
        return true;
      },
      has(_target, prop){
        const storage = getLineRefsStorage();
        return prop in storage;
      },
      ownKeys(){
        const storage = getLineRefsStorage();
        return Array.from(new Set([...LINE_REF_KEYS, ...Object.keys(storage)]));
      },
      getOwnPropertyDescriptor(_target, prop){
        const storage = getLineRefsStorage();
        if(typeof prop === 'symbol'){
          return undefined;
        }
        return {
          configurable: true,
          enumerable: true,
          value: storage[prop] || null,
          writable: true
        };
      }
    });
  }

  const refs = createLineRefsFacade();

  function createDefaultLineRuntimeControls(){
    return {
      viewMode: '2d',
      tableFormat: 'single',
      dotSize: '',
      border: '',
      borderWidth: '',
      errorBarWidth: '',
      alpha: '',
      displayMode: 'line',
      showGrid: false,
      showFrame: false,
      showLegend: true,
      logX: false,
      logY: false,
      showTrendLine: false,
      showIntervals: false,
      showPredictionIntervals: false,
      showPlotStats: false,
      fontSize: '12',
      xMin: '',
      xMax: '',
      yMin: '',
      yMax: '',
      originMode: '',
      originX: '',
      originY: '',
      statType: '',
      regressionMode: '',
      forecast: { horizon: '', seasonLength: '', autoTune: false, criterion: 'bic' }
    };
  }

  function normalizeLineRuntimeControls(source = {}){
    const defaults = createDefaultLineRuntimeControls();
    const src = source && typeof source === 'object' ? source : {};
    const forecast = src.forecast && typeof src.forecast === 'object' ? src.forecast : {};
    return {
      viewMode: String(src.viewMode != null ? src.viewMode : defaults.viewMode).toLowerCase() === '3d' ? '3d' : '2d',
      tableFormat: String(src.tableFormat || defaults.tableFormat).toLowerCase() === 'grouped' ? 'grouped' : (String(src.tableFormat || '').toLowerCase() === '3d' ? '3d' : 'single'),
      dotSize: src.dotSize != null ? String(src.dotSize) : defaults.dotSize,
      border: src.border != null ? String(src.border) : defaults.border,
      borderWidth: src.borderWidth != null ? String(src.borderWidth) : defaults.borderWidth,
      errorBarWidth: src.errorBarWidth != null ? String(src.errorBarWidth) : defaults.errorBarWidth,
      alpha: src.alpha != null ? String(src.alpha) : defaults.alpha,
      displayMode: sanitizeLineDisplayMode(src.displayMode != null ? src.displayMode : defaults.displayMode),
      showGrid: !!src.showGrid,
      showFrame: !!src.showFrame,
      showLegend: src.showLegend !== false,
      logX: !!src.logX,
      logY: !!src.logY,
      showTrendLine: !!src.showTrendLine,
      showIntervals: !!src.showIntervals,
      showPredictionIntervals: !!src.showPredictionIntervals,
      showPlotStats: !!src.showPlotStats,
      fontSize: src.fontSize != null ? String(src.fontSize) : defaults.fontSize,
      xMin: src.xMin != null ? String(src.xMin) : defaults.xMin,
      xMax: src.xMax != null ? String(src.xMax) : defaults.xMax,
      yMin: src.yMin != null ? String(src.yMin) : defaults.yMin,
      yMax: src.yMax != null ? String(src.yMax) : defaults.yMax,
      originMode: src.originMode != null ? String(src.originMode) : defaults.originMode,
      originX: src.originX != null ? String(src.originX) : defaults.originX,
      originY: src.originY != null ? String(src.originY) : defaults.originY,
      statType: src.statType != null ? String(src.statType) : defaults.statType,
      regressionMode: src.regressionMode != null ? String(src.regressionMode) : defaults.regressionMode,
      forecast: {
        horizon: forecast.horizon != null ? String(forecast.horizon) : defaults.forecast.horizon,
        seasonLength: forecast.seasonLength != null ? String(forecast.seasonLength) : defaults.forecast.seasonLength,
        autoTune: !!forecast.autoTune,
        criterion: String(forecast.criterion || defaults.forecast.criterion).toLowerCase() === 'aic' ? 'aic' : 'bic'
      }
    };
  }

  let lineFallbackRuntimeControls = createDefaultLineRuntimeControls();

  const lineSessionsByTabId = new Map();
  // Transient visible-DOM projection bridge. Durable state belongs to the owner session map.
  let projectedLineSession = null;

  // Compatibility bridge: visible-DOM projection tab id. Delete after every projection entrypoint receives explicit owner tab metadata.
  function getLineProjectionTabId(){
    return Shared.componentLifecycle?.resolveProjectionTabId?.(line, projectedLineSession) || String(line.__boundTabId || projectedLineSession?.tabId || '').trim();
  }

  function getLineProjectionSession(meta = {}, options = {}){
    const tabId = getLineProjectionTabId();
    if(!tabId){ return null; }
    return getLineSession(tabId, { ...(meta || {}), tabId, reason: meta?.reason || 'line-projection-session' }, { create: options.create !== false });
  }

  function getLineActiveSessionForState(){
    if(projectedLineSession && (!line.__boundTabId || String(projectedLineSession.tabId || '') === String(line.__boundTabId || ''))){
      return ensureLineSessionOwnershipShape(projectedLineSession);
    }
    const boundTabId = String(getLineProjectionTabId() || '').trim();
    if(boundTabId){
      return ensureLineSessionOwnershipShape(lineSessionsByTabId.get(boundTabId) || null);
    }
    const workspaceTabId = String(Shared.componentLifecycle?.resolveWorkspaceActiveTabId?.('line') || '').trim();
    return workspaceTabId ? ensureLineSessionOwnershipShape(lineSessionsByTabId.get(workspaceTabId) || null) : null;
  }

  function getActiveLineLayoutManager(){
    const session = getLineActiveSessionForState();
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      return shaped.managers?.layout || null;
    }
    return null;
  }

  function setLineSessionLayoutManager(session = null, layout = null){
    const nextLayout = layout || null;
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      shaped.managers.layout = nextLayout;
      shaped.updatedAt = Date.now();
    }
    return nextLayout;
  }

  function bindLineLayoutManagerForSession(session){
    const shaped = ensureLineSessionOwnershipShape(session);
    if(!shaped){ return null; }
    const ownedLayout = Shared.componentLayout?.getOwnedLayoutFor?.('line', { tabId: shaped.tabId }) || null;
    return setLineSessionLayoutManager(shaped, ownedLayout);
  }

  function setActiveLineLayoutManager(layout){
    return setLineSessionLayoutManager(getLineActiveSessionForState(), layout);
  }

  function getLineSessionHotManager(session = null, options = {}){
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      return shaped.managers?.hot || null;
    }
    return options.allowFallback === false ? null : (lineFallbackHotManager || null);
  }

  function getActiveLineHotManager(options = {}){
    return getLineSessionHotManager(getLineActiveSessionForState(), options);
  }

  function setLineSessionHotManager(session = null, hot = null, options = {}){
    const nextHot = hot || null;
    const shaped = ensureLineSessionOwnershipShape(session);
    const activeSession = getLineActiveSessionForState();
    const isActiveSession = !!shaped && shaped === activeSession;
    if(shaped){
      shaped.managers.hot = nextHot;
      shaped.refs = createLineRefsSnapshot({ ...shaped.refs, hot: nextHot });
      shaped.updatedAt = Date.now();
    }
    if(!shaped || options.mirrorFallback !== false){
      lineFallbackHotManager = nextHot;
    }
    if(!shaped || isActiveSession || options.applyActive === true){
      if(nextHot){
        refs.hot = nextHot;
      }else if(options.clearRef !== false){
        refs.hot = null;
      }
    }
    return nextHot;
  }

  function setActiveLineHotManager(hot, options = {}){
    return setLineSessionHotManager(getLineProjectionSession({ reason: 'line-projection-mutation' }), hot, options);
  }


  function getLineSessionDataViewsManager(session = null, options = {}){
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      return shaped.managers?.dataViews || null;
    }
    return null;
  }

  function getActiveLineDataViewsManager(options = {}){
    return getLineSessionDataViewsManager(getLineActiveSessionForState(), options);
  }

  function getLineSessionForHot(hotInstance = null, meta = {}, options = {}){
    const tabId = String(
      hotInstance?.__lineTabId
      || hotInstance?.__workspaceTabId
      || hotInstance?.__graphitixTabId
      || hotInstance?.__hotWorkspaceTabId
      || resolveLineTabIdFromNode(hotInstance?.__lineHostContainer || hotInstance?.rootElement || null)
      || ''
    ).trim();
    if(tabId){
      return getLineSession(tabId, { ...(meta || {}), tabId }, { create: options.create === true }) || null;
    }
    return options.fallbackActive === false ? null : getLineActiveSessionForState();
  }

  function getLineSessionForEvent(event = null, meta = {}, options = {}){
    const target = event?.currentTarget || event?.target || null;
    const tabId = String(resolveLineTabIdFromNode(target) || '').trim();
    if(tabId){
      return getLineSession(tabId, { ...(meta || {}), tabId }, { create: options.create === true }) || null;
    }
    return getLineProjectionSession(meta, options) || getLineActiveSessionForState();
  }

  function isLineSessionActive(session = null){
    if(!session || typeof session !== 'object' || !String(session.tabId || '').trim()){
      return false;
    }
    const canUseLiveProjection = Shared.componentLifecycle?.canOwnerUseLiveProjection;
    if(typeof canUseLiveProjection !== 'function'){
      return projectedLineSession === session
        && (!line.__boundTabId || String(line.__boundTabId) === String(session.tabId));
    }
    return canUseLiveProjection('line', session, {
      component: line,
      projectedSession: projectedLineSession,
      session,
      root: refs.root || null
    }) === true;
  }

  function markLineOwnerDrawPending(session = null, meta = {}){
    const target = ensureLineSessionOwnershipShape(session);
    if(!target){
      return false;
    }
    const autoDrawState = getLineAutoDrawState(target);
    autoDrawState.drawPending = true;
    if(target.state && typeof target.state === 'object'){
      target.state.autoDrawState = autoDrawState;
      target.state.autoDraw = autoDrawState;
      target.state.drawPending = true;
      target.state.updatedAt = Date.now();
    }
    target.updatedAt = Date.now();
    persistLineSessionState(target, {
      ...(meta || {}),
      tabId: target.tabId,
      reason: meta?.reason || 'line-owner-draw-pending'
    });
    lineDebug('Debug: line draw skipped for inactive session', {
      tabId: target.tabId || null,
      reason: meta?.reason || null
    });
    return true;
  }

  function setLineDrawPending(session = null, pending = false, generation = null){
    const target = ensureLineSessionOwnershipShape(session);
    if(!target){
      return false;
    }
    if(Number.isFinite(Number(generation)) && Number(generation) > 0){
      target.timers.drawGeneration = Number(generation);
    }
    const autoDrawState = getLineAutoDrawState(target);
    autoDrawState.drawPending = pending === true;
    target.state.autoDrawState = autoDrawState;
    target.state.autoDraw = autoDrawState;
    target.state.drawPending = pending === true;
    target.state.updatedAt = Date.now();
    target.updatedAt = Date.now();
    return true;
  }

  function setLineSessionDataViewsManager(session = null, manager = null, options = {}){
    const nextManager = manager || null;
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      shaped.managers.dataViews = nextManager;
      shaped.updatedAt = Date.now();
    }
    return nextManager;
  }

  function setActiveLineDataViewsManager(manager){
    return setLineSessionDataViewsManager(getLineProjectionSession({ reason: 'line-projection-mutation' }), manager);
  }

  function getLineSessionAutoDrawManager(session = null, options = {}){
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      return shaped.managers?.autoDraw || null;
    }
    return options.allowFallback === false ? null : (lineFallbackAutoDrawManager || null);
  }

  function getActiveLineAutoDrawManager(options = {}){
    return getLineSessionAutoDrawManager(getLineActiveSessionForState(), options);
  }

  function setLineSessionAutoDrawManager(session = null, manager = null, options = {}){
    const nextManager = manager || null;
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      shaped.managers.autoDraw = nextManager;
      shaped.updatedAt = Date.now();
    }
    if(!shaped || options.mirrorFallback !== false){
      lineFallbackAutoDrawManager = nextManager;
    }
    return nextManager;
  }

  function setActiveLineAutoDrawManager(manager){
    return setLineSessionAutoDrawManager(getLineProjectionSession({ reason: 'line-projection-mutation' }), manager);
  }

  function resolveLineStateSession(session = null){
    if(isLineSessionLike(session)){
      return ensureLineSessionOwnershipShape(session);
    }
    const tabLike = session && typeof session === 'object'
      ? (session.tab || session.id || session.tabId || session.workspaceTabId || null)
      : session;
    if(tabLike){
      const resolved = getLineSession(tabLike, {
        tabId: typeof tabLike === 'object' ? (tabLike.id || tabLike.tabId || null) : tabLike,
        reason: 'line-state-session-resolve'
      }, { create: false });
      return resolved ? ensureLineSessionOwnershipShape(resolved) : null;
    }
    return ensureLineSessionOwnershipShape(getLineActiveSessionForState());
  }

  function stampLineSessionState(session){
    if(session && session.state && typeof session.state === 'object'){
      session.state.updatedAt = Date.now();
      session.updatedAt = Date.now();
    }
    return session;
  }

  function getLineViewState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      if(!target.state.viewState || typeof target.state.viewState !== 'object'){
        target.state.viewState = normalizeLineOwnedViewState(target.state.viewState);
      }
      return target.state.viewState;
    }
    if(!lineFallbackViewState || typeof lineFallbackViewState !== 'object'){
      lineFallbackViewState = normalizeLineOwnedViewState(lineFallbackViewState);
    }
    return lineFallbackViewState;
  }

  function setLineViewState(value, session = null){
    const next = normalizeLineOwnedViewState(value);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.viewState = next;
      stampLineSessionState(target);
      if(!line.__boundTabId || String(target.tabId || '') === String(line.__boundTabId || '')){
        lineFallbackViewState = next;
      }
      return target.state.viewState;
    }
    lineFallbackViewState = next;
    return lineFallbackViewState;
  }

  function getLineAutoDrawState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      if(!target.state.autoDrawState || typeof target.state.autoDrawState !== 'object'){
        target.state.autoDrawState = normalizeLineOwnedAutoDrawState(target.state.autoDrawState || target.state.autoDraw);
      }
      target.state.autoDraw = target.state.autoDrawState;
      return target.state.autoDrawState;
    }
    if(!lineFallbackAutoDrawState || typeof lineFallbackAutoDrawState !== 'object'){
      lineFallbackAutoDrawState = normalizeLineOwnedAutoDrawState(lineFallbackAutoDrawState);
    }
    return lineFallbackAutoDrawState;
  }

  function setLineAutoDrawState(value, session = null){
    const next = normalizeLineOwnedAutoDrawState(value);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.autoDrawState = next;
      target.state.autoDraw = next;
      stampLineSessionState(target);
      if(!line.__boundTabId || String(target.tabId || '') === String(line.__boundTabId || '')){
        lineFallbackAutoDrawState = next;
      }
      return target.state.autoDrawState;
    }
    lineFallbackAutoDrawState = next;
    return lineFallbackAutoDrawState;
  }

  function ensureLineStatsStateShape(value){
    const next = value && typeof value === 'object' ? value : createDefaultLineStatsState();
    next.context = next.context && typeof next.context === 'object' ? next.context : null;
    next.signature = next.signature || null;
    next.version = Number(next.version) || 0;
    next.lastRunVersion = Number(next.lastRunVersion) || 0;
    next.hasResults = !!next.hasResults;
    next.computationPending = !!next.computationPending;
    next.restorePending = next.restorePending && typeof next.restorePending === 'object' ? next.restorePending : null;
    next.regressionSummaries = Array.isArray(next.regressionSummaries) ? cloneLineRuntimeValue(next.regressionSummaries, []) : [];
    next.panelModel = normalizeLineStatsPanelModel(next.panelModel || next);
    return next;
  }

  function getLineStatsState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.statsState = ensureLineStatsStateShape(target.state.statsState);
      return target.state.statsState;
    }
    lineFallbackStatsState = ensureLineStatsStateShape(lineFallbackStatsState);
    return lineFallbackStatsState;
  }

  function setLineStatsState(value, session = null){
    const next = normalizeLineOwnedStatsState(value);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.statsState = next;
      stampLineSessionState(target);
      if(!line.__boundTabId || String(target.tabId || '') === String(line.__boundTabId || '')){
        lineFallbackStatsState = next;
      }
      return target.state.statsState;
    }
    lineFallbackStatsState = next;
    return lineFallbackStatsState;
  }

  function getLineRegressionSummariesState(session = null){
    return getLineStatsState(session).regressionSummaries;
  }

  function setLineRegressionSummariesState(value, session = null){
    const summaries = Array.isArray(value) ? cloneLineRuntimeValue(value, []) : [];
    const statsState = getLineStatsState(session);
    statsState.regressionSummaries = summaries;
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.statsState = statsState;
      if(target.state.stats && typeof target.state.stats === 'object'){
        target.state.stats.regressionSummaries = summaries.slice();
      }
      stampLineSessionState(target);
    }
    if(!target || String(target.tabId || '') === String(getLineProjectionTabId())){
      lineLastRegressionSummaries = summaries.slice();
    }
    return summaries;
  }

  function getLineAdvisorState(session = null){
    const target = resolveLineStateSession(session);
    if(target?.state){
      const bridgeFallback = isLineSessionActive(target) ? lineAdvisorState : null;
      target.state.advisorState = normalizeLineAdvisorState(target.state.advisorState || target.state.statsAdvisor || bridgeFallback);
      return target.state.advisorState;
    }
    lineAdvisorState = normalizeLineAdvisorState(lineAdvisorState);
    return lineAdvisorState;
  }

  function setLineAdvisorState(value, session = null){
    const next = normalizeLineAdvisorState(value);
    const target = resolveLineStateSession(session);
    if(target?.state){
      target.state.advisorState = next;
      target.state.statsAdvisor = next;
      stampLineSessionState(target);
    }
    if(!target || String(target.tabId || '') === String(getLineProjectionTabId())){
      lineAdvisorState = next;
    }
    return next;
  }

  function isLineSessionLike(value){
    return !!(value
      && typeof value === 'object'
      && value.componentKey === 'line'
      && value.state
      && typeof value.tabId === 'string');
  }

  function resolveLineInvocationSession(sessionOrOptions = null, options = {}){
    if(isLineSessionLike(sessionOrOptions)){
      return { session: ensureLineSessionOwnershipShape(sessionOrOptions), options: options && typeof options === 'object' ? options : {} };
    }
    const drawOptions = sessionOrOptions && typeof sessionOrOptions === 'object' ? sessionOrOptions : {};
    const tabLike = drawOptions.tab || drawOptions.tabId || getLineProjectionTabId() || null;
    const session = getLineSession(tabLike, { ...(drawOptions || {}), reason: drawOptions.reason || 'line-session-invocation' }, { create: false })
      || getLineActiveSessionForState();
    return { session: ensureLineSessionOwnershipShape(session), options: drawOptions };
  }

  function bindLineInvocationSession(session, reason, options = {}){
    session = ensureLineSessionOwnershipShape(session);
    if(!session || !session.tabId){
      return null;
    }
    if(projectedLineSession !== session || String(getLineProjectionTabId() || '') !== String(session.tabId || '')){
      bindLineSessionForTab(session.tabId, {
        tabId: session.tabId,
        reason: reason || options.reason || 'line-explicit-session-bind'
      }, {
        preserveCurrent: options.preserveCurrent !== false,
        syncControls: options.syncControls === true && line.ready === true
      });
    }
    return session;
  }

  function getLineRuntimeControlsForSession(session = null, fallback = lineFallbackRuntimeControls){
    session = ensureLineSessionOwnershipShape(session);
    const source = session?.state?.controls || fallback || createDefaultLineRuntimeControls();
    return normalizeLineRuntimeControls(source);
  }

  function setLineRuntimeControlsForSession(session = null, controlsSnapshot = null, meta = {}){
    const controls = normalizeLineRuntimeControls(controlsSnapshot || lineFallbackRuntimeControls || createDefaultLineRuntimeControls());
    session = ensureLineSessionOwnershipShape(session);
    if(session?.state && typeof session.state === 'object'){
      session.state.controls = controls;
      session.state.updatedAt = Date.now();
      session.updatedAt = Date.now();
    }
    if(!session || String(session.tabId || '') === String(getLineProjectionTabId())){
      lineFallbackRuntimeControls = controls;
    }
    return controls;
  }

  function getActiveLineRuntimeControls(meta = {}){
    const session = getLineActiveSessionForState();
    const controls = getLineRuntimeControlsForSession(session, lineFallbackRuntimeControls);
    if(session?.state && !session.state.controls){
      setLineRuntimeControlsForSession(session, controls, { ...(meta || {}), reason: meta?.reason || 'line-runtime-controls-hydrate-active-session' });
    }
    return controls;
  }

  function isLineDrawSchedulerWrapper(candidate){
    return candidate === scheduleLineDraw || candidate === scheduleLineDrawRaw;
  }

  function getLineFallbackDrawScheduler(options = {}){
    const fallback = options.raw === true ? lineFallbackRawDrawScheduler : lineFallbackDrawScheduler;
    return typeof fallback === 'function' && !isLineDrawSchedulerWrapper(fallback) ? fallback : null;
  }

  function getLineSessionDrawScheduler(session, options = {}){
    const target = ensureLineSessionOwnershipShape(session);
    if(!target?.timers){
      return options.allowFallback === false ? null : getLineFallbackDrawScheduler(options);
    }
    const key = options.raw === true ? 'rawDrawScheduler' : 'drawScheduler';
    const scheduler = target.timers[key];
    if(typeof scheduler === 'function' && !isLineDrawSchedulerWrapper(scheduler)){
      return scheduler;
    }
    return options.allowFallback === false ? null : getLineFallbackDrawScheduler(options);
  }

  function setLineSessionDrawSchedulers(session, schedulers = {}, options = {}){
    const target = ensureLineSessionOwnershipShape(session);
    const drawScheduler = typeof schedulers.drawScheduler === 'function' && !isLineDrawSchedulerWrapper(schedulers.drawScheduler)
      ? schedulers.drawScheduler
      : null;
    const rawDrawScheduler = typeof schedulers.rawDrawScheduler === 'function' && !isLineDrawSchedulerWrapper(schedulers.rawDrawScheduler)
      ? schedulers.rawDrawScheduler
      : null;
    if(target){
      if(drawScheduler){
        target.timers.drawScheduler = drawScheduler;
      }
      if(rawDrawScheduler){
        target.timers.rawDrawScheduler = rawDrawScheduler;
      }
      target.updatedAt = Date.now();
    }
    if(!target || options.mirrorFallback !== false){
      if(drawScheduler){
        lineFallbackDrawScheduler = drawScheduler;
      }
      if(rawDrawScheduler){
        lineFallbackRawDrawScheduler = rawDrawScheduler;
      }
    }
    return target?.timers || null;
  }

  function scheduleLineDrawForSession(session, options = {}){
    const target = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    if(Shared.hot?.shouldDeferOwnerProjectionDraw?.(target, options)){
      return false;
    }
    const scheduler = getLineSessionDrawScheduler(target);
    if(typeof scheduler !== 'function'){
      return undefined;
    }
    const sourceOptions = options && typeof options === 'object' ? options : {};
    const drawGeneration = Number(target?.timers?.drawGeneration || 0) + 1;
    const scheduleOptions = Shared.componentLifecycle?.sanitizeDrawOptions
      ? Shared.componentLifecycle.sanitizeDrawOptions(sourceOptions, { tabId: target?.tabId || sourceOptions.tabId || null, reason: 'line-session-draw' })
      : { ...sourceOptions, tabId: target?.tabId || sourceOptions.tabId || undefined, reason: sourceOptions.reason || 'line-session-draw' };
    scheduleOptions.drawGeneration = drawGeneration;
    setLineDrawPending(target, true, drawGeneration);
    return scheduler(scheduleOptions);
  }

  function scheduleLineDrawRaw(options = {}){
    const target = getLineActiveSessionForState();
    const scheduler = getLineSessionDrawScheduler(target, { raw: true });
    if(typeof scheduler !== 'function'){
      return undefined;
    }
    const sourceOptions = options && typeof options === 'object' ? options : {};
    const scheduleOptions = Shared.componentLifecycle?.sanitizeDrawOptions
      ? Shared.componentLifecycle.sanitizeDrawOptions(sourceOptions, { tabId: target?.tabId || sourceOptions.tabId || null, reason: 'line-session-draw-raw' })
      : { ...sourceOptions, tabId: target?.tabId || sourceOptions.tabId || undefined, reason: sourceOptions.reason || 'line-session-draw-raw' };
    return scheduler(scheduleOptions);
  }

  function scheduleLineDraw(options = {}){
    return scheduleLineDrawForSession(getLineActiveSessionForState(), options);
  }

  function scheduleActiveLineDraw(options = {}){
    return scheduleLineDrawForSession(getLineActiveSessionForState(), options);
  }

  function canScheduleLineDrawForSession(session){
    return !!getLineSessionDrawScheduler(session || getLineActiveSessionForState());
  }

  function canScheduleActiveLineDraw(){
    return canScheduleLineDrawForSession(getLineActiveSessionForState());
  }

  function createLineSession({ tabId, root = null, initialState = null } = {}){
    const normalizedTabId = String(tabId || '').trim();
    if(!normalizedTabId){
      return null;
    }
    return {
      version: 1,
      componentKey: 'line',
      tabId: normalizedTabId,
      root: root || null,
      state: normalizeLineCanonicalState(initialState || createDefaultLineCanonicalState(normalizedTabId), normalizedTabId),
      refs: createLineRefsSnapshot({ root: root || null }),
      cache: {},
      listeners: [],
      timers: {},
      workers: {},
      managers: {
        hot: null,
        dataViews: null,
        autoDraw: null,
        layout: null
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function ensureLineSessionOwnershipShape(session){
    if(!session || typeof session !== 'object'){
      return null;
    }
    session.refs = createLineRefsSnapshot(session.refs);
    session.cache = session.cache && typeof session.cache === 'object' ? session.cache : {};
    session.listeners = Array.isArray(session.listeners) ? session.listeners : [];
    session.timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    session.workers = session.workers && typeof session.workers === 'object' ? session.workers : {};
    session.managers = session.managers && typeof session.managers === 'object' ? session.managers : {};
    session.managers.hot = session.managers.hot || session.hot || null;
    session.managers.dataViews = session.managers.dataViews || session.dataViewsManager || null;
    session.managers.autoDraw = session.managers.autoDraw || session.autoDrawManager || null;
    session.managers.layout = session.managers.layout || session.layout || null;
    session.timers.drawScheduler = session.timers.drawScheduler || session.scheduleDraw || null;
    session.timers.rawDrawScheduler = session.timers.rawDrawScheduler || session.scheduleDrawRaw || null;
    session.timers.drawGeneration = Number(session.timers.drawGeneration) || 0;
    delete session.hot;
    delete session.dataViewsManager;
    delete session.autoDrawManager;
    delete session.layout;
    delete session.scheduleDraw;
    delete session.scheduleDrawRaw;
    return session;
  }

  function normalizeLineRefValue(value){
    if(!value){
      return null;
    }
    if(value && typeof value === 'object' && value.nodeType && value.isConnected === false){
      return null;
    }
    return value;
  }

  function createLineRefsSnapshot(source = {}){
    const src = source && typeof source === 'object' ? source : {};
    const snapshot = {};
    LINE_REF_KEYS.forEach(key => {
      snapshot[key] = normalizeLineRefValue(src[key]) || null;
    });
    return snapshot;
  }

  function replaceActiveLineRefs(source = {}){
    const snapshot = createLineRefsSnapshot(source);
    LINE_REF_KEYS.forEach(key => {
      refs[key] = snapshot[key] || null;
    });
    lineSvgBoxRef = refs.svgBox || null;
    return snapshot;
  }

  function getLineSessionRefs(session = null, options = {}){
    const shaped = ensureLineSessionOwnershipShape(session);
    if(shaped){
      return createLineRefsSnapshot(shaped.refs);
    }
    return options.allowFallback === false ? null : createLineRefsSnapshot(refs);
  }

  function resolveLineRefsContext(session = null, options = {}){
    if(options.refs && typeof options.refs === 'object'){
      return createLineRefsSnapshot(options.refs);
    }
    return getLineSessionRefs(session || getLineActiveSessionForState(), options) || createLineRefsSnapshot({});
  }

  function getActiveLineRefs(options = {}){
    return resolveLineRefsContext(getLineActiveSessionForState(), options);
  }

  function resolveLineRefsSession(tabLike = null, options = {}){
    const explicitSession = ensureLineSessionOwnershipShape(options.session || null);
    if(explicitSession){
      return explicitSession;
    }
    const candidateTab = options.tab || options.tabId || tabLike || getLineProjectionTabId() || null;
    const tabId = candidateTab
      ? resolveLineOwnedRuntimeTabId(candidateTab, { reason: options.reason || 'line-refs-session-resolve' })
      : null;
    return (tabId ? getLineSession(tabId, { tabId, reason: options.reason || 'line-refs-session-resolve' }, { create: false }) : null)
      || getLineActiveSessionForState();
  }

  function setLineSessionRefs(session = null, source = {}, options = {}){
    const shaped = ensureLineSessionOwnershipShape(session);
    const snapshot = createLineRefsSnapshot(source);
    if(shaped){
      shaped.refs = snapshot;
      shaped.root = snapshot.root || null;
      shaped.updatedAt = Date.now();
    }
    if(!shaped || shaped === getLineActiveSessionForState() || options.applyActive === true){
      replaceActiveLineRefs(snapshot);
    }
    return snapshot;
  }

  function ensureLineSessionModeCache(session){
    session = ensureLineSessionOwnershipShape(session);
    if(!session){
      return null;
    }
    const source = session.cache.modeCache || session.cache.mode || session.state?.modeCache || null;
    session.cache.modeCache = normalizeLineOwnedModeCache(source);
    delete session.cache.mode;
    return session.cache.modeCache;
  }

  function getLineSessionModeCache(tabLike = null, meta = {}, options = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike || meta?.tab || meta?.tabId || getLineProjectionTabId() || null, meta);
    if(!tabId){
      return createDefaultLineModeCache();
    }
    let session = projectedLineSession && String(projectedLineSession.tabId || '') === String(tabId)
      ? projectedLineSession
      : (lineSessionsByTabId.get(tabId) || null);
    if(!session && options.create !== false){
      session = getLineSession(tabId, {
        ...(meta || {}),
        tabId,
        reason: meta?.reason || 'line-mode-cache-session'
      }, { create: true });
    }
    return ensureLineSessionModeCache(session) || createDefaultLineModeCache();
  }

  function getActiveLineModeCache(meta = {}){
    const modeCache = getLineSessionModeCache(getLineProjectionTabId() || null, {
      ...(meta || {}),
      tabId: getLineProjectionTabId() || null,
      reason: meta?.reason || 'line-mode-cache-active-session'
    }, { create: true });
    if(!projectedLineSession && getLineProjectionTabId()){
      projectedLineSession = lineSessionsByTabId.get(getLineProjectionTabId()) || projectedLineSession;
    }
    return modeCache;
  }

  function setLineSessionModeCache(session, value){
    session = ensureLineSessionOwnershipShape(session);
    if(!session){
      return normalizeLineOwnedModeCache(value);
    }
    session.cache.modeCache = normalizeLineOwnedModeCache(value);
    if(session.state && typeof session.state === 'object'){
      session.state.modeCache = normalizeLineOwnedModeCache(session.cache.modeCache);
    }
    delete session.cache.mode;
    return session.cache.modeCache;
  }

  function rememberLineSessionModeCache(session){
    session = ensureLineSessionOwnershipShape(session);
    if(!session || !session.state){
      return null;
    }
    const modeCache = ensureLineSessionModeCache(session);
    session.state.modeCache = normalizeLineOwnedModeCache(modeCache);
    return session.state.modeCache;
  }

  function cloneLineRuntimeValue(value, fallback = null){
    const cloned = cloneSimple(value);
    return cloned == null ? fallback : cloned;
  }

  function createDefaultLineCanonicalState(tabId = ''){
    return normalizeLineCanonicalState({
      version: 1,
      componentKey: 'line',
      tabId: tabId || '',
      notes: { text: '', open: false },
      displayMode: 'line',
      last2d: createDefaultLineLast2dState(),
      logPlusOne: { x: false, y: false },
      labels: createDefaultLineLabelsState(),
      theme: createDefaultLineThemeState(),
      styles: createDefaultLineStyleState(),
      grouped: createDefaultLineGroupedState(),
      forecast: createDefaultLineForecastState(),
      controls: createDefaultLineRuntimeControls(),
      axisSettings: typeof createLineAxisSettings === 'function' ? createLineAxisSettings() : null,
      gridStyle: null,
      stats: {
        signature: null,
        version: 0,
        lastRunVersion: 0,
        hasResults: false,
        computationPending: false,
        restorePending: null,
        regressionSummaries: []
      },
      autoDraw: createDefaultLineAutoDrawState(),
      modeCache: createDefaultLineModeCache(),
      viewState: createDefaultLineViewState(),
      autoDrawState: createDefaultLineAutoDrawState(),
      statsState: createDefaultLineStatsState(),
      advisorState: createDefaultLineAdvisorState()
    }, tabId);
  }

  function normalizeLineCanonicalStats(value){
    const input = value && typeof value === 'object' ? value : {};
    const panelModel = normalizeLineStatsPanelModel(input.panelModel || input);
    return {
      signature: input.signature || null,
      version: Number(input.version) || 0,
      lastRunVersion: Number(input.lastRunVersion) || 0,
      hasResults: !!input.hasResults || lineStatsPanelModelHasContent(panelModel),
      computationPending: false,
      restorePending: null,
      regressionSummaries: Array.isArray(input.regressionSummaries) ? cloneLineRuntimeValue(input.regressionSummaries, []) : [],
      panelModel,
      resultsModel: panelModel.resultsModel,
      reportModel: panelModel.reportModel
    };
  }

  function normalizeLineCanonicalNotes(value){
    const input = value && typeof value === 'object' ? value : {};
    return {
      text: input.text == null ? '' : String(input.text),
      open: !!input.open
    };
  }

  function normalizeLineCanonicalState(value, tabId = ''){
    const input = value && typeof value === 'object' ? value : {};
    const stateTabId = String(tabId || input.tabId || input.__runtimeOwner?.tabId || '').trim();
    const autoDrawInput = input.autoDrawState || input.autoDraw || null;
    const statsInput = input.statsState || null;
    const viewInput = input.viewState || null;
    return {
      version: 3,
      componentKey: 'line',
      tabId: stateTabId,
      updatedAt: Date.now(),
      notes: normalizeLineCanonicalNotes(input.notes),
      displayMode: sanitizeLineDisplayMode(input.displayMode || 'line'),
      last2d: normalizeLineOwnedLast2dState(input.last2d),
      logPlusOne: normalizeLineOwnedLogPlusOneState(input.logPlusOne),
      labels: normalizeLineOwnedLabelsState(input.labels),
      theme: normalizeLineOwnedThemeState(input.theme),
      styles: normalizeLineOwnedStyleState(input.styles),
      grouped: normalizeLineOwnedGroupedState(input.grouped),
      forecast: normalizeLineOwnedForecastState(input.forecast),
      controls: normalizeLineRuntimeControls(input.controls || createDefaultLineRuntimeControls()),
      axisSettings: input.axisSettings && typeof input.axisSettings === 'object'
        ? cloneLineRuntimeValue(input.axisSettings, null)
        : (typeof createLineAxisSettings === 'function' ? createLineAxisSettings() : null),
      gridStyle: input.gridStyle && typeof input.gridStyle === 'object' ? cloneLineRuntimeValue(input.gridStyle, null) : null,
      stats: normalizeLineCanonicalStats(input.stats),
      autoDraw: normalizeLineOwnedAutoDrawState(autoDrawInput),
      modeCache: normalizeLineOwnedModeCache(input.modeCache),
      viewState: normalizeLineOwnedViewState(viewInput),
      autoDrawState: normalizeLineOwnedAutoDrawState(autoDrawInput),
      statsState: normalizeLineOwnedStatsState(statsInput),
      advisorState: normalizeLineAdvisorState(input.advisorState || input.statsAdvisor)
    };
  }

  function isLineCanonicalStateForTab(value, tabId = ''){
    if(!value || typeof value !== 'object'){
      return false;
    }
    const expectedTabId = String(tabId || value.tabId || '').trim();
    return Number(value.version) >= 3
      && value.componentKey === 'line'
      && (!expectedTabId || String(value.tabId || '').trim() === expectedTabId)
      && value.grouped && typeof value.grouped === 'object'
      && value.forecast && typeof value.forecast === 'object'
      && value.controls && typeof value.controls === 'object'
      && value.statsState && typeof value.statsState === 'object';
  }

  function ensureLineCanonicalState(value, tabId = ''){
    return isLineCanonicalStateForTab(value, tabId)
      ? value
      : normalizeLineCanonicalState(value, tabId);
  }

  function getLineSessionRuntime(tabLike = null, meta = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike, meta);
    if(!tabId){
      return null;
    }
    return Shared.workspaceTabs?.getSessionRuntime?.(tabLike || tabId, 'line', {
      ...(meta || {}),
      tabId,
      reason: meta?.reason || 'line-session-runtime'
    }) || null;
  }

  function getLineSession(tabLike = null, meta = {}, options = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike, meta);
    if(!tabId){
      return null;
    }
    const runtime = getLineSessionRuntime(tabLike || tabId, meta);
    if(runtime && runtime.lineSession){
      delete runtime.lineSession;
    }
    let session = lineSessionsByTabId.get(tabId) || null;
    const sessionAlreadyExisted = !!session;
    const persistedState = runtime?.lineSessionState && typeof runtime.lineSessionState === 'object'
      ? runtime.lineSessionState
      : null;
    const ownedRuntimeRecord = !persistedState && !session
      ? getLineOwnedRuntimeRecord(tabLike || tabId, { ...(meta || {}), tabId, reason: 'line-session-migrate-owned-runtime' })
      : null;
    const migratedState = ownedRuntimeRecord ? normalizeLineCanonicalState({
      displayMode: ownedRuntimeRecord.displayMode,
      last2d: ownedRuntimeRecord.last2d,
      logPlusOne: ownedRuntimeRecord.logPlusOne,
      labels: ownedRuntimeRecord.labels,
      theme: ownedRuntimeRecord.theme,
      styles: ownedRuntimeRecord.styles,
      grouped: ownedRuntimeRecord.grouped,
      forecast: ownedRuntimeRecord.forecast,
      axisSettings: ownedRuntimeRecord.axisSettings,
      gridStyle: ownedRuntimeRecord.gridStyle,
      stats: { regressionSummaries: ownedRuntimeRecord.regressionSummaries || [] },
      viewState: ownedRuntimeRecord.viewState,
      autoDrawState: ownedRuntimeRecord.autoDrawState,
      statsState: ownedRuntimeRecord.statsState,
      modeCache: ownedRuntimeRecord.modeCache
    }, tabId) : null;
    let stateChanged = false;
    if(!session && options.create !== false){
      session = createLineSession({
        tabId,
        root: String(getLineProjectionTabId() || '') === tabId ? (refs.root || null) : null,
        initialState: persistedState ? ensureLineCanonicalState(persistedState, tabId) : (migratedState || createDefaultLineCanonicalState(tabId))
      });
      stateChanged = true;
    }
    if(!session){
      return null;
    }
    ensureLineSessionOwnershipShape(session);
    session.componentKey = 'line';
    session.tabId = tabId;
    let refreshedModeCacheFromState = false;
    if(persistedState && (!session.state || session.state.updatedAt == null || Number(persistedState.updatedAt) > Number(session.state.updatedAt))){
      session.state = ensureLineCanonicalState(persistedState, tabId);
      refreshedModeCacheFromState = true;
      stateChanged = true;
    }else if(!isLineCanonicalStateForTab(session.state, tabId)){
      session.state = normalizeLineCanonicalState(session.state, tabId);
      refreshedModeCacheFromState = !sessionAlreadyExisted || !session.cache.modeCache;
      stateChanged = true;
    }else{
      refreshedModeCacheFromState = !session.cache.modeCache;
    }
    if(refreshedModeCacheFromState){
      setLineSessionModeCache(session, session.state.modeCache);
    }else if(!sessionAlreadyExisted || !session.cache.modeCache){
      rememberLineSessionModeCache(session);
    }
    session.updatedAt = Date.now();
    lineSessionsByTabId.set(tabId, session);
    if(runtime && stateChanged){
      runtime.lineSessionState = cloneLineRuntimeValue(session.state, createDefaultLineCanonicalState(tabId));
    }
    return session;
  }

  function persistLineSessionState(session, meta = {}){
    if(!session || !session.tabId){
      return null;
    }
    rememberLineSessionModeCache(session);
    const runtime = getLineSessionRuntime(session.tabId, { ...(meta || {}), tabId: session.tabId, reason: meta?.reason || 'line-session-state-persist' });
    if(runtime){
      if(runtime.lineSession){
        delete runtime.lineSession;
      }
      runtime.lineSessionState = cloneLineRuntimeValue(session.state, createDefaultLineCanonicalState(session.tabId));
    }
    return session.state;
  }

  function rememberLineSessionEphemera(session){
    session = ensureLineSessionOwnershipShape(session);
    if(!session){
      return null;
    }
    bindLineLayoutManagerForSession(session);
    const sessionIsActive = isLineSessionActive(session);
    if(sessionIsActive){
      setLineSessionRefs(session, refs, { applyActive: false });
      session.managers.hot = getActiveLineHotManager() || session.managers.hot || null;
      session.managers.dataViews = getActiveLineDataViewsManager() || session.managers.dataViews || null;
      session.managers.autoDraw = getActiveLineAutoDrawManager() || session.managers.autoDraw || null;
      setLineSessionDrawSchedulers(session, {
        drawScheduler: getLineSessionDrawScheduler(session, { allowFallback: false }) || getLineFallbackDrawScheduler(),
        rawDrawScheduler: getLineSessionDrawScheduler(session, { raw: true, allowFallback: false }) || getLineFallbackDrawScheduler({ raw: true })
      }, { mirrorFallback: false });
    }
    rememberLineSessionModeCache(session);
    session.updatedAt = Date.now();
    return session;
  }

  function applyLineSessionEphemera(session){
    session = ensureLineSessionOwnershipShape(session);
    if(!session){
      return false;
    }
    bindLineLayoutManagerForSession(session);
    const managers = session.managers;
    setLineSessionHotManager(session, managers.hot || null, { applyActive: true });
    setLineSessionDataViewsManager(session, managers.dataViews || null);
    const autoDrawManager = setLineSessionAutoDrawManager(session, managers.autoDraw || null);
    const ownerAutoDrawState = getLineAutoDrawState(session);
    if(autoDrawManager && autoDrawManager.state !== ownerAutoDrawState){
      autoDrawManager.state = ownerAutoDrawState;
    }
    setLineSessionLayoutManager(session, managers.layout || null);
    const timers = session.timers && typeof session.timers === 'object' ? session.timers : {};
    const canMirrorSchedulerFallback = !line.__boundTabId;
    if(canMirrorSchedulerFallback && typeof timers.rawDrawScheduler === 'function' && !isLineDrawSchedulerWrapper(timers.rawDrawScheduler)){
      lineFallbackRawDrawScheduler = timers.rawDrawScheduler;
    }
    if(canMirrorSchedulerFallback && typeof timers.drawScheduler === 'function' && !isLineDrawSchedulerWrapper(timers.drawScheduler)){
      lineFallbackDrawScheduler = timers.drawScheduler;
    }
    replaceActiveLineRefs(getLineSessionRefs(session, { allowFallback: false }) || {});
    return true;
  }

  function buildLineCanonicalStateFromGlobals(tabLike = null, meta = {}, options = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike || getLineProjectionTabId() || null, meta) || '';
    const canonicalSession = tabId
      ? getLineSession(tabId, { ...(meta || {}), tabId, reason: 'line-canonical-owner-session' }, { create: false })
      : getLineActiveSessionForState();
    const canReadActiveControls = options.readControls === true && (!canonicalSession || isLineSessionActive(canonicalSession));
    if(canReadActiveControls){
      syncLineRuntimeControlsFromRefs();
      syncLineLast2dControlStateFromRefs(tabId || null);
    }
    const noteControl = canUseLineNotesControl(notesState.control) ? notesState.control : null;
    let notesText = notesState.text || '';
    let notesOpen = !!notesState.open;
    if(canReadActiveControls && noteControl){
      notesText = typeof noteControl.getValue === 'function' ? noteControl.getValue() : notesText;
      notesOpen = typeof noteControl.isOpen === 'function' ? noteControl.isOpen() : notesOpen;
      notesState.text = notesText == null ? '' : String(notesText);
      notesState.open = !!notesOpen;
    }
    const autoDrawSnapshot = cloneLineRuntimeValue(getLineAutoDrawState(canonicalSession), createDefaultLineAutoDrawState()) || createDefaultLineAutoDrawState();
    autoDrawSnapshot.drawPending = false;
    const panelModelSnapshot = canReadActiveControls
      ? captureLineStatsPanelModel(getLineStatsState(canonicalSession)?.panelModel || null, { session: canonicalSession })
      : normalizeLineStatsPanelModel(getLineStatsState(canonicalSession)?.panelModel || null);
    const statsStateSnapshot = normalizeLineOwnedStatsState({
      ...getLineStatsState(canonicalSession),
      panelModel: panelModelSnapshot
    });
    statsStateSnapshot.regressionSummaries = getLineRegressionSummariesState(canonicalSession).slice();
    statsStateSnapshot.computationPending = false;
    statsStateSnapshot.restorePending = null;
    const modeCacheSnapshot = getLineSessionModeCache(tabId || getLineProjectionTabId() || null, { ...(meta || {}), tabId, reason: 'line-canonical-mode-cache' });
    const labelsSnapshot = cloneLineRuntimeValue(getLineLabelsState(canonicalSession), createDefaultLineLabelsState());
    const themeSnapshot = cloneLineRuntimeValue(getLineThemeState(canonicalSession), createDefaultLineThemeState());
    const stylesSnapshot = cloneLineRuntimeValue(getLineStylesState(canonicalSession), createDefaultLineStyleState());
    const groupedSnapshot = cloneLineRuntimeValue(getLineGroupedState(canonicalSession), createDefaultLineGroupedState());
    const forecastSnapshot = cloneLineRuntimeValue(getLineForecastState(canonicalSession), createDefaultLineForecastState());
    const axisSettingsSnapshot = cloneLineRuntimeValue(getLineAxisSettingsState(canonicalSession), createLineAxisSettings());
    const gridStyleSnapshot = cloneLineRuntimeValue(getLineGridStyleState(canonicalSession, axisSettingsSnapshot?.strokeWidth), null);
    return normalizeLineCanonicalState({
      tabId,
      notes: { text: notesText, open: notesOpen },
      displayMode: lineDisplayMode,
      last2d: {
        displayMode: lineLast2dDisplayMode,
        logX: lineLast2dLogX,
        logY: lineLast2dLogY,
        showFrame: lineLast2dShowFrame,
        showTrendLine: lineLast2dShowTrendLine,
        showIntervals: lineLast2dShowIntervals,
        showPredictionIntervals: lineLast2dShowPredictionIntervals,
        showPlotStats: lineLast2dShowPlotStats
      },
      logPlusOne: { x: lineLogPlusOneX, y: lineLogPlusOneY },
      labels: labelsSnapshot,
      theme: themeSnapshot,
      styles: stylesSnapshot,
      grouped: groupedSnapshot,
      forecast: forecastSnapshot,
      controls: cloneLineRuntimeValue(getLineRuntimeControlsForSession(canonicalSession, lineFallbackRuntimeControls), createDefaultLineRuntimeControls()),
      axisSettings: axisSettingsSnapshot,
      gridStyle: gridStyleSnapshot,
      stats: {
        signature: getLineStatsState(canonicalSession).signature || null,
        version: Number(getLineStatsState(canonicalSession).version) || 0,
        lastRunVersion: Number(getLineStatsState(canonicalSession).lastRunVersion) || 0,
        hasResults: canReadActiveControls ? lineStatsResultsAvailable() : !!getLineStatsState(canonicalSession).hasResults,
        computationPending: false,
        restorePending: null,
        regressionSummaries: getLineRegressionSummariesState(canonicalSession).slice(),
        panelModel: panelModelSnapshot,
        resultsModel: panelModelSnapshot.resultsModel,
        reportModel: panelModelSnapshot.reportModel
      },
      autoDraw: autoDrawSnapshot,
      modeCache: cloneLineRuntimeValue(modeCacheSnapshot, createDefaultLineModeCache()),
      viewState: normalizeLineOwnedViewState(getLineViewState(canonicalSession)),
      autoDrawState: autoDrawSnapshot,
      statsState: statsStateSnapshot,
      advisorState: getLineAdvisorState(canonicalSession)
    }, tabId);
  }

  function canUseLineNotesControl(noteControl){
    if(!noteControl){ return false; }
    const root = refs.root || resolveLineRoot(getLineProjectionTabId() || null);
    const controlRoot = noteControl.root || null;
    if(controlRoot){
      return !!controlRoot.isConnected && (!root || root === controlRoot || root.contains?.(controlRoot));
    }
    return !!root && (!noteControl.element || root.contains?.(noteControl.element));
  }

  function applyLineCanonicalStateToGlobals(state, meta = {}, options = {}){
    const canonical = normalizeLineCanonicalState(state, meta?.tabId || meta?.tab?.id || state?.tabId || '');
    notesState.text = canonical.notes.text;
    notesState.open = !!canonical.notes.open;
    if(options.syncControls === true && canUseLineNotesControl(notesState.control)){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    lineDisplayMode = sanitizeLineDisplayMode(canonical.displayMode);
    lineLast2dDisplayMode = sanitizeLineDisplayMode(canonical.last2d.displayMode);
    lineLast2dLogX = !!canonical.last2d.logX;
    lineLast2dLogY = !!canonical.last2d.logY;
    lineLast2dShowFrame = !!canonical.last2d.showFrame;
    lineLast2dShowTrendLine = !!canonical.last2d.showTrendLine;
    lineLast2dShowIntervals = !!canonical.last2d.showIntervals;
    lineLast2dShowPredictionIntervals = !!canonical.last2d.showPredictionIntervals;
    lineLast2dShowPlotStats = !!canonical.last2d.showPlotStats;
    lineLogPlusOneX = !!canonical.logPlusOne.x;
    lineLogPlusOneY = !!canonical.logPlusOne.y;
    const canonicalOwnerSession = projectedLineSession && String(projectedLineSession.tabId || '') === String(canonical.tabId || meta?.tabId || '')
      ? projectedLineSession
      : getLineSession(canonical.tabId || meta?.tabId || null, { ...(meta || {}), tabId: canonical.tabId || meta?.tabId || null, reason: 'line-apply-canonical-axis-session' }, { create: !!(canonical.tabId || meta?.tabId) });
    setLineLabelsState(canonicalOwnerSession, canonical.labels, { ...(meta || {}), reason: 'line-apply-canonical-labels' });
    setLineThemeState(canonicalOwnerSession, canonical.theme, { ...(meta || {}), reason: 'line-apply-canonical-theme' });
    setLineStylesState(canonicalOwnerSession, canonical.styles, { ...(meta || {}), reason: 'line-apply-canonical-styles' });
    setLineGroupedState(canonicalOwnerSession, canonical.grouped, { ...(meta || {}), reason: 'line-apply-canonical-grouped' });
    setLineForecastState(canonicalOwnerSession, canonical.forecast, { ...(meta || {}), reason: 'line-apply-canonical-forecast' });
    setLineRuntimeControlsForSession(canonicalOwnerSession, canonical.controls, { ...(meta || {}), reason: 'line-apply-canonical-controls' });
    setLineAxisSettingsState(canonicalOwnerSession, canonical.axisSettings && typeof canonical.axisSettings === 'object'
      ? canonical.axisSettings
      : (typeof createLineAxisSettings === 'function' ? createLineAxisSettings() : lineAxisSettings), { ...(meta || {}), reason: 'line-apply-canonical-axis' });
    setLineGridStyleState(canonicalOwnerSession, canonical.gridStyle && typeof canonical.gridStyle === 'object' ? canonical.gridStyle : null, getLineAxisStrokeWidth(canonicalOwnerSession), { ...(meta || {}), reason: 'line-apply-canonical-grid' });
    setLineRegressionSummariesState(canonical.stats.regressionSummaries, canonicalOwnerSession);
    setLineAdvisorState(canonical.advisorState, canonicalOwnerSession);
    setLineViewState(normalizeLineOwnedViewState(canonical.viewState));
    setLineAutoDrawState(normalizeLineOwnedAutoDrawState(canonical.autoDrawState || canonical.autoDraw));
    getLineAutoDrawState().drawPending = false;
    setLineStatsState(normalizeLineOwnedStatsState({
      ...canonical.statsState,
      regressionSummaries: canonical.stats.regressionSummaries,
      panelModel: canonical.stats.panelModel || canonical.statsState?.panelModel || canonical.stats
    }), canonicalOwnerSession);
    const canonicalStatsState = getLineStatsState(canonicalOwnerSession);
    canonicalStatsState.signature = canonical.stats.signature || canonicalStatsState.signature || null;
    canonicalStatsState.version = Number(canonical.stats.version) || canonicalStatsState.version || 0;
    canonicalStatsState.lastRunVersion = Number(canonical.stats.lastRunVersion) || canonicalStatsState.lastRunVersion || 0;
    canonicalStatsState.hasResults = !!canonical.stats.hasResults && canonicalStatsState.version > 0 && canonicalStatsState.lastRunVersion === canonicalStatsState.version;
    if(lineStatsPanelModelHasContent(canonicalStatsState.panelModel) && canonicalStatsState.version > 0 && canonicalStatsState.lastRunVersion === canonicalStatsState.version){
      canonicalStatsState.hasResults = true;
      canonicalStatsState.restorePending = {
        signature: canonicalStatsState.signature || null,
        version: canonicalStatsState.version,
        hasResults: true
      };
    }else{
      canonicalStatsState.restorePending = null;
    }
    canonicalStatsState.computationPending = false;
    const modeSession = projectedLineSession || getLineSession(canonical.tabId || meta?.tabId || null, { ...(meta || {}), tabId: canonical.tabId || meta?.tabId || null, reason: 'line-apply-canonical-mode-cache' }, { create: !!(canonical.tabId || meta?.tabId) });
    setLineSessionModeCache(modeSession, canonical.modeCache);
    const autoDrawManager = getActiveLineAutoDrawManager();
    if(autoDrawManager && autoDrawManager.state !== getLineAutoDrawState()){
      autoDrawManager.state = getLineAutoDrawState();
    }
    if(options.syncControls === true){
      if(lineStatsPanelModelHasContent(canonicalStatsState.panelModel)){
        const restoredStatsPanel = restoreLineStatsPanelModel(canonicalStatsState.panelModel, { session: canonicalOwnerSession });
        if(restoredStatsPanel && canonicalStatsState.version > 0 && canonicalStatsState.lastRunVersion === canonicalStatsState.version){
          canonicalStatsState.hasResults = true;
          setLineStatsStatus('Statistics up to date.');
          updateLineStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
        }
      }
      syncLineRuntimeControlsFromState(canonical.controls, meta?.tab || meta?.tabId || canonical.tabId || null);
      syncLineAspectControls('session-state');
    }
    return canonical;
  }

  function applyLineCanonicalStateToRuntimeGlobals(state, session = null){
    const targetSession = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    const canonical = ensureLineCanonicalState(state, targetSession?.tabId || state?.tabId || getLineProjectionTabId() || '');
    notesState.text = canonical.notes.text;
    notesState.open = !!canonical.notes.open;
    lineDisplayMode = sanitizeLineDisplayMode(canonical.displayMode);
    lineLast2dDisplayMode = sanitizeLineDisplayMode(canonical.last2d.displayMode);
    lineLast2dLogX = !!canonical.last2d.logX;
    lineLast2dLogY = !!canonical.last2d.logY;
    lineLast2dShowFrame = !!canonical.last2d.showFrame;
    lineLast2dShowTrendLine = !!canonical.last2d.showTrendLine;
    lineLast2dShowIntervals = !!canonical.last2d.showIntervals;
    lineLast2dShowPredictionIntervals = !!canonical.last2d.showPredictionIntervals;
    lineLast2dShowPlotStats = !!canonical.last2d.showPlotStats;
    lineLogPlusOneX = !!canonical.logPlusOne.x;
    lineLogPlusOneY = !!canonical.logPlusOne.y;
    lineTitleText = canonical.labels.title;
    lineXLabelText = canonical.labels.x;
    lineYLabelText = canonical.labels.y;
    lineZLabelText = canonical.labels.z;
    lineLabelColors = cloneLineRuntimeValue(canonical.labels.colors, {}) || {};
    lineLabelPositions = cloneLineRuntimeValue(canonical.labels.positions, {}) || {};
    lineColorSchemeId = canonical.theme.colorScheme;
    lineTextColor = canonical.theme.textColor;
    lineBackgroundColor = canonical.theme.backgroundColor;
    lineSeriesStyles = cloneLineRuntimeValue(canonical.styles.series, {}) || {};
    lineOverlayStyles = sanitizeLineOverlayStylesMap(canonical.styles.overlays);
    lineOverlayToolbarScope = normalizeLineOverlayToolbarScope(canonical.styles.overlayToolbarScope);
    lineReplicates = Number(canonical.grouped.replicates) || LINE_MIN_REPLICATES;
    lineLastGroupedReplicateCount = Number(canonical.grouped.lastGroupedReplicateCount) || Math.min(LINE_MAX_REPLICATES, Math.max(2, LINE_MIN_REPLICATES + 1));
    lineSeriesGroupLabels = Array.isArray(canonical.grouped.labels) ? canonical.grouped.labels.slice() : [];
    lineGroupShapes = Array.isArray(canonical.grouped.shapes) ? canonical.grouped.shapes.map((shape, idx) => sanitizeLineGroupShape(shape, idx)) : [];
    lineForecastOptions = {
      horizon: Number(canonical.forecast.horizon) || DEFAULT_FORECAST_HORIZON,
      seasonLength: Number(canonical.forecast.seasonLength) || DEFAULT_FORECAST_SEASON,
      autoTune: !!canonical.forecast.autoTune,
      criterion: String(canonical.forecast.criterion || 'bic').toLowerCase() === 'aic' ? 'aic' : 'bic'
    };
    lineFallbackRuntimeControls = normalizeLineRuntimeControls(canonical.controls);
    lineFallbackViewState = normalizeLineOwnedViewState(canonical.viewState);
    lineFallbackAutoDrawState = normalizeLineOwnedAutoDrawState(canonical.autoDrawState || canonical.autoDraw);
    lineFallbackAutoDrawState.drawPending = false;
    lineFallbackStatsState = normalizeLineOwnedStatsState({
      ...canonical.statsState,
      regressionSummaries: canonical.stats.regressionSummaries,
      panelModel: canonical.stats.panelModel || canonical.statsState?.panelModel || canonical.stats
    });
    lineLastRegressionSummaries = Array.isArray(lineFallbackStatsState.regressionSummaries)
      ? lineFallbackStatsState.regressionSummaries.slice()
      : [];
    lineAdvisorState = normalizeLineAdvisorState(canonical.advisorState || canonical.statsAdvisor);
    if(targetSession?.state){
      targetSession.state = canonical;
      targetSession.cache.modeCache = normalizeLineOwnedModeCache(canonical.modeCache);
      targetSession.state.modeCache = targetSession.cache.modeCache;
      targetSession.updatedAt = Date.now();
    }
    const autoDrawManager = getActiveLineAutoDrawManager();
    if(autoDrawManager){
      autoDrawManager.state = lineFallbackAutoDrawState;
    }
    return canonical;
  }

  function rememberLineSessionState(tabLike = null, meta = {}, options = {}){
    const session = getLineSession(tabLike || getLineProjectionTabId() || null, meta, { create: true });
    if(!session){
      return null;
    }
    session.state = buildLineCanonicalStateFromGlobals(session.tabId, meta, { readControls: options.readControls === true });
    rememberLineSessionEphemera(session);
    session.updatedAt = Date.now();
    persistLineSessionState(session, meta);
    return session.state;
  }

  function storeLineCanonicalStateForTab(state, tabLike = null, meta = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike || state?.tabId || null, meta);
    if(!tabId){
      return null;
    }
    const session = getLineSession(tabId, { ...(meta || {}), tabId }, { create: true });
    if(!session){
      return null;
    }
    session.state = ensureLineCanonicalState(state, tabId);
    setLineSessionModeCache(session, session.state.modeCache);
    session.updatedAt = Date.now();
    persistLineSessionState(session, meta);
    return session.state;
  }

  function bindLineSessionForTab(tabLike = null, meta = {}, options = {}){
    const targetTabId = resolveLineOwnedRuntimeTabId(tabLike, meta);
    if(!targetTabId){
      return null;
    }
    if(projectedLineSession && projectedLineSession.tabId && projectedLineSession.tabId !== targetTabId && options.preserveCurrent !== false){
      rememberLineSessionState(projectedLineSession.tabId, { reason: 'line-session-switch-preserve-current' }, { readControls: line.ready === true });
    }
    const session = getLineSession(targetTabId, { ...(meta || {}), tabId: targetTabId }, { create: true });
    if(!session){
      return null;
    }
    projectedLineSession = session;
    line.__lineSessionTabId = targetTabId;
    bindLineLayoutManagerForSession(session);
    applyLineSessionEphemera(session);
    applyLineCanonicalStateToGlobals(session.state, { ...(meta || {}), tabId: targetTabId }, { syncControls: options.syncControls === true && line.ready === true });
    return session;
  }

  function captureLineCanonicalSnapshot(tabLike = null, meta = {}, options = {}){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike || meta?.tab || meta?.tabId || getLineProjectionTabId() || null, meta);
    if(!tabId){
      return null;
    }
    const isActive = String(tabId) === String(getLineProjectionTabId() || '') && line.ready === true;
    if(isActive && options.readActiveControls !== false){
      return rememberLineSessionState(tabId, meta, { readControls: true });
    }
    const session = getLineSession(tabId, { ...(meta || {}), tabId }, { create: false });
    return session?.state ? normalizeLineCanonicalState(session.state, tabId) : null;
  }

  function syncLineRuntimeControlsFromRefs(options = {}){
    const session = resolveLineRefsSession(options.tab || options.tabId || getLineProjectionTabId() || null, options);
    const lineRefs = resolveLineRefsContext(session, options);
    const overlayControls = resolveLineOverlayControls(options.tab || options.tabId || session?.tabId || getLineProjectionTabId() || null, { ...options, session, refs: lineRefs });
    const currentControls = getLineRuntimeControlsForSession(session, lineFallbackRuntimeControls);
    const controls = normalizeLineRuntimeControls({
      ...currentControls,
      viewMode: lineRefs.viewMode?.value || getLineViewState().viewMode || currentControls.viewMode,
      tableFormat: lineRefs.replicateMode?.value || currentControls.tableFormat,
      dotSize: lineRefs.dotSize?.value ?? currentControls.dotSize,
      border: lineRefs.border?.value ?? currentControls.border,
      borderWidth: lineRefs.borderWidth?.value ?? currentControls.borderWidth,
      errorBarWidth: lineRefs.errorBarWidth?.value ?? currentControls.errorBarWidth,
      alpha: lineRefs.alpha?.value ?? currentControls.alpha,
      displayMode: lineRefs.displayMode?.value ?? currentControls.displayMode,
      showGrid: lineRefs.showGrid ? !!lineRefs.showGrid.checked : currentControls.showGrid,
      showFrame: lineRefs.showFrame ? !!lineRefs.showFrame.checked : currentControls.showFrame,
      showLegend: lineRefs.showLegend ? !!lineRefs.showLegend.checked : currentControls.showLegend,
      logX: lineRefs.logX ? !!lineRefs.logX.checked : currentControls.logX,
      logY: lineRefs.logY ? !!lineRefs.logY.checked : currentControls.logY,
      showTrendLine: overlayControls.showTrendLine ? !!overlayControls.showTrendLine.checked : currentControls.showTrendLine,
      showIntervals: overlayControls.showIntervals ? !!overlayControls.showIntervals.checked : currentControls.showIntervals,
      showPredictionIntervals: overlayControls.showPredictionIntervals ? !!overlayControls.showPredictionIntervals.checked : currentControls.showPredictionIntervals,
      showPlotStats: overlayControls.showPlotStats ? !!overlayControls.showPlotStats.checked : currentControls.showPlotStats,
      fontSize: lineRefs.fontSize?.value ?? currentControls.fontSize,
      xMin: lineRefs.xMin?.value ?? currentControls.xMin,
      xMax: lineRefs.xMax?.value ?? currentControls.xMax,
      yMin: lineRefs.yMin?.value ?? currentControls.yMin,
      yMax: lineRefs.yMax?.value ?? currentControls.yMax,
      originMode: lineRefs.originMode?.value ?? currentControls.originMode,
      originX: lineRefs.originX?.value ?? currentControls.originX,
      originY: lineRefs.originY?.value ?? currentControls.originY,
      statType: lineRefs.statType?.value ?? currentControls.statType,
      regressionMode: lineRefs.regressionMode?.value ?? currentControls.regressionMode,
      forecast: {
        horizon: lineRefs.forecastHorizon?.value ?? currentControls.forecast.horizon,
        seasonLength: lineRefs.forecastSeasonLength?.value ?? currentControls.forecast.seasonLength,
        autoTune: lineRefs.forecastAuto ? !!lineRefs.forecastAuto.checked : currentControls.forecast.autoTune,
        criterion: lineRefs.forecastCriterion?.value || currentControls.forecast.criterion
      }
    });
    return setLineRuntimeControlsForSession(session, controls, { reason: options.reason || 'line-controls-dom-sync' });
  }

  function resolveLineRoot(tabLike){
    const activeTabId = (typeof tabLike === 'string' ? tabLike : tabLike?.id)
      || getLineProjectionTabId()
      || null;
    const currentRootTabId = resolveLineTabIdFromNode(refs.root);
    if(activeTabId
      && getLineProjectionTabId()
      && String(activeTabId) === String(getLineProjectionTabId())
      && refs.root?.isConnected
      && (!currentRootTabId || String(currentRootTabId) === String(activeTabId))){
      return refs.root;
    }
    return Shared.workspaceTabs?.resolveComponentRoot?.({
      tabLike: activeTabId,
      componentKey: 'line',
      currentRoot: refs.root,
      staticRootId: 'linePage'
    }) || null;
  }
  function queryLineRoot(selector, tabLike){
    const root = resolveLineRoot(tabLike);
    if(!root || !selector){
      return null;
    }
    return root.querySelector?.(selector) || null;
  }
  function getLineNodeById(id, tabLike){
    if(!id){
      return null;
    }
    const root = resolveLineRoot(tabLike);
    if(root?.getElementById){
      const node = root.getElementById(id);
      if(node && node.isConnected){
        return node;
      }
    }
    const scoped = root?.querySelector?.(`#${id}`) || null;
    if(scoped && scoped.isConnected){
      return scoped;
    }
    return scoped || null;
  }

  function bindLineDomRefs(root, tabLike = null){
    const targetTabId = resolveLineOwnedRuntimeTabId(tabLike || null, { reason: 'line-bind-dom-refs' }) || null;
    const activeRoot = root
      || Shared.workspaceTabs?.getMountedRoot?.(targetTabId || null, 'line')
      || resolveLineRoot(targetTabId || tabLike || null)
      || global.document
      || null;
    refs.root = activeRoot || null;
    const byId = id => (
      activeRoot && typeof activeRoot.querySelector === 'function'
        ? activeRoot.querySelector(`#${id}`)
        : null
    ) || getLineNodeById(id, targetTabId || tabLike || null);

    refs.tablePanel = byId('lineTablePanel');
    refs.graphPanel = byId('lineGraphPanel');
    refs.panelResizer = byId('linePanelResizer');
    refs.svgBox = refs.graphPanel?.querySelector?.('.svgbox') || byId('lineGraphPanel')?.querySelector?.('.svgbox') || null;
    lineSvgBoxRef = refs.svgBox || null;
    refs.configPanel = refs.graphPanel?.querySelector?.('.config-panel') || null;
    refs.renderRow = byId('lineRenderRow');
    refs.renderButton = byId('lineRenderButton');
    refs.autoDrawNotice = byId('lineAutoDrawNotice');
    refs.hotContainer = byId('lineHot');
    refs.hotWrapper = byId('lineHotWrapper');
    refs.plot = byId('linePlot');
    refs.tooltip = byId('tooltip');
    refs.statType = byId('lineStatType');
    refs.statsResults = byId('lineStatsResults');
    refs.statsAdvisor = byId('lineStatsAdvisor');
    refs.statsButton = byId('lineComputeStats');
    refs.statsStatus = byId('lineStatsStatus');
    refs.regressionMode = byId('lineRegressionMode');
    refs.showTrendLine = byId('lineShowTrendLine');
    refs.showIntervals = byId('lineShowIntervals');
    refs.showPredictionIntervals = byId('lineShowPredictionIntervals');
    refs.showPlotStats = byId('lineShowPlotStats');
    refs.showLegend = byId('lineShowLegend');
    refs.forecastFieldset = byId('lineForecastControls');
    refs.forecastHorizon = byId('lineForecastHorizon');
    refs.forecastSeasonLength = byId('lineForecastSeasonLength');
    refs.forecastAuto = byId('lineForecastAuto');
    refs.forecastCriterion = byId('lineForecastCriterion');
    refs.replicateMode = byId('lineTableFormat');
    refs.replicatesContainer = byId('lineGroupedControls');
    refs.replicatesInput = byId('lineReplicates');
    refs.groupedList = byId('lineGroupedList');
    refs.viewMode = byId('lineViewMode');
    refs.border = byId('lineBorder');
    refs.borderWidth = byId('lineBorderWidth');
    refs.errorBarWidth = byId('lineErrorBarWidth');
    refs.dotSize = byId('lineDotSize');
    refs.displayMode = byId('lineDisplayMode');
    refs.alpha = byId('lineAlpha');
    refs.alphaVal = byId('lineAlphaVal');
    refs.fontSize = byId('lineFontSize');
    refs.fontSizeVal = byId('lineFontSizeVal');
    refs.showGrid = byId('lineShowGrid');
    refs.showFrame = byId('lineShowFrame');
    refs.logX = byId('lineLogX');
    refs.logY = byId('lineLogY');
    refs.xMin = byId('lineXMin');
    refs.xMax = byId('lineXMax');
    refs.yMin = byId('lineYMin');
    refs.yMax = byId('lineYMax');
    refs.originMode = byId('lineOriginMode');
    refs.originX = byId('lineOriginX');
    refs.originY = byId('lineOriginY');
    refs.loadExample = byId('lineLoadExample');
    refs.importBtn = byId('lineImport');
    refs.fileInput = byId('lineFile');
    refs.openBtn = getLineNodeById('openLineGraph', targetTabId || tabLike || null);
    refs.saveBtn = getLineNodeById('saveLineGraph', targetTabId || tabLike || null);
    refs.saveAsBtn = getLineNodeById('saveAsLine', targetTabId || tabLike || null);
    refs.graphFileInput = byId('lineGraphFile');
    if(refs.showLegend){
      const legendHost = refs.showLegend.closest('label');
      if(legendHost){
        lineLegendControl = legendHost;
      }
    }
    return createLineRefsSnapshot(refs);
  }

  function isLinePassiveActivationMeta(meta = {}){
    const reason = String(meta?.reason || '').toLowerCase();
    if(
      meta?.liveDomFastPath === true
      || meta?.liveDomReuse === true
      || meta?.suppressDraw === true
      || meta?.suppressStatsRecompute === true
      || reason.includes('live-dom-fast-path')
    ){
      return true;
    }
    const tabId = String(meta?.tabId || meta?.tab?.id || resolveLineOwnedRuntimeTabId(meta?.tab || meta?.tabId || null, meta) || '').trim() || null;
    const tx = tabId && Shared.componentLifecycle?.getRestoreTransaction
      ? Shared.componentLifecycle.getRestoreTransaction('line', { ...(meta || {}), tabId, componentKey: 'line' })
      : null;
    return !!(tx && (tx.passiveControls === true || tx.suppressDraw === true || tx.suppressAutoDraw === true || tx.suppressStatsRecompute === true || tx.liveDomFastPath === true || tx.liveDomReuse === true));
  }

  function resolveLineOverlayControls(tabLike = null, options = {}){
    const session = resolveLineRefsSession(tabLike || options.tab || options.tabId || getLineProjectionTabId() || null, options);
    const lineRefs = resolveLineRefsContext(session, options);
    const activeTabId = resolveLineOwnedRuntimeTabId(tabLike || options.tab || options.tabId || session?.tabId || getLineProjectionTabId() || null, {
      reason: options.reason || 'line-overlay-controls-resolve'
    }) || null;
    return {
      showTrendLine: getLineNodeById('lineShowTrendLine', activeTabId) || lineRefs.showTrendLine || null,
      showIntervals: getLineNodeById('lineShowIntervals', activeTabId) || lineRefs.showIntervals || null,
      showPredictionIntervals: getLineNodeById('lineShowPredictionIntervals', activeTabId) || lineRefs.showPredictionIntervals || null,
      showPlotStats: getLineNodeById('lineShowPlotStats', activeTabId) || lineRefs.showPlotStats || null
    };
  }
  function readLineOverlayControlState(tabLike = null, options = {}){
    const controls = resolveLineOverlayControls(tabLike, options);
    return {
      showTrendLine: !!controls.showTrendLine?.checked,
      showIntervals: !!controls.showIntervals?.checked,
      showPredictionIntervals: !!controls.showPredictionIntervals?.checked,
      showPlotStats: !!controls.showPlotStats?.checked
    };
  }
  function applyLineLast2dOverlayControls(tabLike = null, options = {}){
    const controls = resolveLineOverlayControls(tabLike, options);
    if(controls.showTrendLine){
      controls.showTrendLine.checked = !!lineLast2dShowTrendLine;
    }
    if(controls.showIntervals){
      controls.showIntervals.checked = !!lineLast2dShowIntervals;
    }
    if(controls.showPredictionIntervals){
      controls.showPredictionIntervals.checked = !!lineLast2dShowPredictionIntervals;
    }
    if(controls.showPlotStats && lineFallbackRuntimeControls){
      controls.showPlotStats.checked = !!getLineRuntimeControlsForSession(resolveLineRefsSession(tabLike, options), lineFallbackRuntimeControls).showPlotStats;
    }
  }

  function resolveLineDrawableFrame(plotEl){
    const plot = plotEl || refs.plot || getLineNodeById('linePlot');
    const svgBox = refs.svgBox
      || getActiveLineLayoutManager()?.elements?.svgBox
      || plot?.closest?.('.svgbox')
      || queryLineRoot('#lineGraphPanel .svgbox')
      || null;
    const frame = Shared.componentLayout?.resolveDrawableFrame?.({
      componentName: 'line',
      plot,
      svgBox,
      graphPanel: refs.graphPanel || getActiveLineLayoutManager()?.elements?.graphPanel || queryLineRoot('#lineGraphPanel')
    });
    if(frame){
      return frame;
    }
    return {
      width: Math.max(0, Number(plot?.clientWidth) || 0),
      height: Math.max(0, Number(plot?.clientHeight) || 0),
      rawWidth: Math.max(0, Number(plot?.clientWidth) || 0),
      rawHeight: Math.max(0, Number(plot?.clientHeight) || 0),
      constrained: false,
      source: 'plot-fallback',
      authority: 'plot-fallback',
      svgBox,
      viewport: null,
      zoomScale: 1
    };
  }
  function ensureLineStatsReportHost(options = {}){
    const reporting = Shared.statsReporting;
    const lineRefs = resolveLineRefsContext(options.session || null, options);
    const statsResults = lineRefs.statsResults || null;
    if(!statsResults || !reporting || typeof reporting.ensureReportHost !== 'function'){
      return statsResults?.__statsReportHost || null;
    }
    return reporting.ensureReportHost(statsResults, {
      id: 'lineStatsReportHost',
      className: 'stats-report-host',
      attachToTarget: true,
      position: 'last'
    });
  }
  function clearLineStatsReportHost(options = {}){
    const reporting = Shared.statsReporting;
    const lineRefs = resolveLineRefsContext(options.session || null, options);
    if(reporting && typeof reporting.clearReportHost === 'function'){
      reporting.clearReportHost(lineRefs.statsResults || null);
    }
  }

  function restoreLineStatsPanelModel(panelModel, options = {}){
    const normalized = normalizeLineStatsPanelModel(panelModel);
    const lineRefs = resolveLineRefsContext(options.session || null, options);
    const statsResults = lineRefs.statsResults || null;
    if(!statsResults || !lineStatsPanelModelHasContent(normalized)){
      return false;
    }
    try{
      if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function'){
        Shared.statsReporting.restorePanelModel(statsResults, normalized, {
          ensureReportHost: () => ensureLineStatsReportHost({ ...options, refs: lineRefs })
        });
      }else{
        statsResults.textContent = '';
      }
      return lineStatsPanelHasRenderedResults({ ...options, refs: lineRefs });
    }catch(err){
      console.debug('Debug: line stats panel restore failed', { err: err?.message || String(err) });
      return false;
    }
  }
  const lineOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'line',
    message: 'Rendering line chart...',
    isHeavy: Shared.loadingOverlay?.createTableHeavyPredicate?.({
      getHot: () => getActiveLineHotManager(),
      startRow: 1,
      startCol: 0,
      rowThreshold: 1000,
      cellThreshold: 5000
    }),
    getTabId: () => getLineProjectionTabId() || null,
    getHost: () => (
      refs.svgBox
      || refs.graphPanel?.querySelector?.('.svgbox')
      || getLineNodeById('lineGraphPanel')?.querySelector?.('.svgbox')
      || getLineNodeById('lineGraphPanel')
    )
  });

  function markLineOverlayPending(reason){
    lineOverlayController?.markPending(reason);
    if(lineOverlayController && typeof reason === 'string'){
      lineDebug('Debug: line overlay pending flagged',{ reason });
    }
  }

  function queueLineOverlay(reason, options = {}){
    return lineOverlayController?.queue(reason, options) || false;
  }

  function resolveLineOverlay(reason){
    lineOverlayController?.resolve(reason);
  }

  function forceLineOverlay(reason, options = {}){
    return lineOverlayController?.force(reason, options) || false;
  }
  let lineTooltipEl = null;
  let lineNoticeBoundWidth = null;

  const syncLineAutoDrawNoticeWidth = (reason) => {
    const svgBox = refs.svgBox || refs.graphPanel?.querySelector?.('.svgbox');
    const renderRow = refs.renderRow || getLineNodeById('lineRenderRow');
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
    if(refs.autoDrawNotice && refs.autoDrawNotice.style.maxWidth !== widthPx){
      refs.autoDrawNotice.style.maxWidth = widthPx;
    }
    if(lineNoticeBoundWidth !== width){
      lineNoticeBoundWidth = width;
      lineDebug('Debug: line auto draw notice width synced', { width, reason: reason || null });
    }
  };
  const scheduleLineNoticeWidth = (() => {
    let lastReason = 'frame';
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(line, 'line', () => syncLineAutoDrawNoticeWidth(lastReason), { reason: 'line-notice-width' })
      : null;
    return reason => {
      lastReason = reason || 'frame';
      if(debounced){
        debounced({ tabId: getLineProjectionTabId() || null, reason: 'line-notice-width' });
        return;
      }
      syncLineAutoDrawNoticeWidth(lastReason);
    };
  })();

  function lineDebug(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore toggle errors and log by default
    }
    console.debug(label, payload);
  }

  function clampLineErrorBarWidth(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return 2;
    }
    return Math.min(10, Math.max(0, numeric));
  }

  function formatLineErrorBarWidth(value){
    const rounded = Math.round(clampLineErrorBarWidth(value) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }

  function getLineErrorBarWidthInput(){
    const liveInput = queryLineRoot('#lineErrorBarWidth') || refs.errorBarWidth || null;
    if(liveInput && refs.errorBarWidth !== liveInput){
      refs.errorBarWidth = liveInput;
    }
    return liveInput;
  }

  function syncLineErrorBarToolbarValue(){
    const backingInput = getLineErrorBarWidthInput();
    if(!backingInput){
      return;
    }
    const normalizedText = formatLineErrorBarWidth(backingInput.value);
    if(backingInput.value !== normalizedText){
      backingInput.value = normalizedText;
    }
    if(lineErrorBarToolbarInput && lineErrorBarToolbarInput.value !== normalizedText){
      lineErrorBarToolbarInput.value = normalizedText;
    }
  }

  function clearLineErrorBarToolbarControl(host){
    const targetHost = host
      || lineErrorBarToolbarPanel?.parentElement
      || queryLineRoot('.font-toolbar-host[data-font-toolbar-scope="line"]')
      || null;
    if(targetHost?.querySelectorAll){
      targetHost.querySelectorAll('.line-errorbar-inline-panel').forEach(node => node.remove());
    }
    lineErrorBarToolbarPanel = null;
    lineErrorBarToolbarInput = null;
  }

  function syncLineErrorBarToolbarControl(host){
    const targetHost = host
      || lineErrorBarToolbarPanel?.parentElement
      || queryLineRoot('.font-toolbar-host[data-font-toolbar-scope="line"]')
      || null;
    if(!targetHost){
      return;
    }
    const bindToolbarInput = input => {
      if(!input || input.__lineErrorBarToolbarBound === true){
        return;
      }
      const applyToolbarValue = () => {
        const backingInput = getLineErrorBarWidthInput();
        if(!backingInput){
          return;
        }
        const rawValue = String(input.value ?? '').trim();
        if(rawValue === '' || rawValue === '-' || rawValue === '+'){
          return;
        }
        const nextText = formatLineErrorBarWidth(input.value);
        if(input.value !== nextText){
          input.value = nextText;
        }
        if(backingInput.value !== nextText){
          backingInput.value = nextText;
          backingInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };
      input.addEventListener('input', applyToolbarValue);
      input.addEventListener('change', applyToolbarValue);
      input.__lineErrorBarToolbarBound = true;
    };
    const shouldShow = isLineGroupedModeActive();
    const backingInput = getLineErrorBarWidthInput();
    if(!shouldShow || !backingInput){
      clearLineErrorBarToolbarControl(targetHost);
      lineDebug('Debug: line error bar toolbar visibility updated', { visible: false, groupedMode: shouldShow });
      return;
    }
    let panel = targetHost.querySelector('.line-errorbar-inline-panel');
    if(!panel){
      clearLineErrorBarToolbarControl(targetHost);
      const doc = targetHost.ownerDocument || global.document;
      if(!doc){
        return;
      }
      const toolbarApi = Shared.getWorkspaceToolbarApi();
      const panelParts = toolbarApi.createSubPanel({
        panelClass: 'additional-line-controls-panel line-errorbar-inline-panel',
        title: 'Error bars',
        rowClass: 'additional-line-controls-panel__row'
      });
      panel = panelParts.panel;
      panel.dataset.lineErrorBarToolbar = '1';
      panelParts.title.classList.add('additional-line-controls-panel__title');
      const row = panelParts.row;
      const input = doc.createElement('input');
      input.type = 'number';
      input.min = backingInput.min || '0';
      input.max = backingInput.max || '10';
      input.step = backingInput.step || '0.25';
      input.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--small';
      input.setAttribute('aria-label', 'Error bar thickness');
      input.setAttribute('data-undo-ignore', '1');
      bindToolbarInput(input);
      const field = toolbarApi.createLabeledField({
        fieldClass: 'additional-line-controls-panel__field additional-line-controls-panel__field--numeric',
        label: 'Error Bar Thickness',
        labelClass: 'additional-line-controls-panel__field-label',
        control: input
      }).field;
      row.appendChild(field);
      targetHost.appendChild(panel);
      lineErrorBarToolbarPanel = panel;
      lineErrorBarToolbarInput = input;
      lineDebug('Debug: line error bar toolbar control mounted', { groupedMode: shouldShow });
    }else{
      lineErrorBarToolbarPanel = panel;
      lineErrorBarToolbarInput = panel.querySelector('input[type="number"]');
      bindToolbarInput(lineErrorBarToolbarInput);
    }
    syncLineErrorBarToolbarValue();
    lineDebug('Debug: line error bar toolbar visibility updated', { visible: true, groupedMode: shouldShow });
  }

  function activateLineDataToolbar(reason){
    const now = Date.now();
    const tabId = String(getLineProjectionTabId() || Shared.workspaceTabs?.getActiveSessionInfo?.('line')?.tabId || 'global');
    const lastActivation = Number(lineDataToolbarLastActivationByTabId.get(tabId)) || 0;
    if(now - lastActivation < 80){
      return false;
    }
    lineDataToolbarLastActivationByTabId.set(tabId, now);
    const activated = !!Shared.workspaceToolbar?.activateSection?.('line', 'Data');
    if(activated){
      lineDebug('Debug: line data toolbar activated', { reason: reason || 'unknown' });
    }
    return activated;
  }

  function ensureLineDataViewsForHot(hotInstance, options = {}){
    if(!hotInstance || typeof hotInstance.getData !== 'function'){
      return null;
    }
    if(typeof Shared.dataViews?.createManager !== 'function'){
      return null;
    }
    const ownerSession = getLineSessionForHot(hotInstance, { reason: 'line-dataviews-owner' }, { create: true });
    if(!hotInstance.__lineDataViewsManager){
      hotInstance.__lineDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'line',
        maxViews: LINE_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onActiveViewChanged(view, meta){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          Shared.dataViews.applyViewToTable(hotInstance, view, {
            exclusionSource: 'line-data-view-switch',
            filterReason: 'line-data-view-switch'
          });
          const session = getLineSessionForHot(hotInstance, { reason: 'line-dataview-switch' }, { create: false })
            || ownerSession
            || getLineActiveSessionForState();
          const sessionRefs = resolveLineRefsContext(session, { allowFallback: true });
          const isActive = isLineSessionActive(session);
          if(isActive && (getLineViewState(session).viewMode === '3d' || sessionRefs.replicateMode?.value === '3d')){
            scheduleLine3dDatasetSync('data-view-switch');
          }
          if(isActive){
            markLineOverlayPending('data-view-switch');
          }
          scheduleLineDrawForSession(session, {
            reason: 'data-view-switch',
            userInitiated: String(meta?.reason || '').trim().toLowerCase() === 'tab-click'
          });
        },
        onInteraction(){
          activateLineDataToolbar('data-tab-interaction');
        }
      });
      lineDebug('Debug: line data views manager created', {
        tabId: hotInstance.__lineTabId || null
      });
    }
    const manager = hotInstance.__lineDataViewsManager;
    const currentOwnerSession = getLineSessionForHot(hotInstance, { reason: 'line-dataviews-owner-refresh' }, { create: true })
      || ownerSession;
    if(currentOwnerSession){
      setLineSessionDataViewsManager(currentOwnerSession, manager, { mirrorFallback: isLineSessionActive(currentOwnerSession) });
    }
    const hostWrapper = options.wrapper || refs.hotWrapper || getLineNodeById('lineHotWrapper') || null;
    const hostContainer = options.container || hotInstance.__lineHostContainer || refs.hotContainer || getLineNodeById('lineHot') || null;
    if(hostWrapper && hostContainer){
      manager.mount({
        wrapper: hostWrapper,
        tableContainer: hostContainer
      });
      manager.refresh?.();
    }
    if(isLineSessionActive(currentOwnerSession)){
      setActiveLineDataViewsManager(manager);
    }
    return manager;
  }

  function syncLineActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || getActiveLineHotManager() || refs.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    if(Shared.dataViews?.isTableProjectionActive?.(hot)){
      return;
    }
    const ownerSession = getLineSessionForHot(hot, { reason: 'line-dataview-sync-owner' }, { create: false });
    const manager = hot.__lineDataViewsManager
      || getLineSessionDataViewsManager(ownerSession, { allowFallback: false })
      || (ownerSession ? null : getActiveLineDataViewsManager());
    if(!manager){
      return;
    }
    manager.updateActiveData(hot.getData() || []);
    manager.updateActiveExclusions(hot?.exportExclusions?.() || null);
    manager.updateActiveFilters?.(hot?.exportFilters?.() || null);
    if(reason === 'afterLoadData'){
      manager.refresh?.();
    }
  }

  function applyLineTransformToNewView(transformSpec, options = {}){
    const hot = line.__ensureHotForActiveTab?.() || getActiveLineHotManager() || refs.hot;
    if(!hot){
      return false;
    }
    const manager = ensureLineDataViewsForHot(hot, {
      wrapper: refs.hotWrapper || getLineNodeById('lineHotWrapper') || null,
      container: hot.__lineHostContainer || refs.hotContainer || getLineNodeById('lineHot') || null
    });
    if(!manager || typeof manager.applyTransform !== 'function'){
      console.warn('line data transform skipped: Shared.dataViews unavailable');
      return false;
    }
    syncLineActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyTransform(transformSpec, {
      title: options.title,
      reason: options.reason || 'toolbar-transform',
      transformOptions: Object.assign({}, LINE_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      lineDebug('Debug: line transform failed', {
        message,
        transform: transformSpec?.type || null
      });
      return false;
    }
    activateLineDataToolbar('transform-applied');
    lineDebug('Debug: line transform created view', {
      title: result?.view?.title || null,
      summary: result?.result?.summary || null
    });
    return true;
  }

  const LINE_TRANSFORM_OPTION_MAP = Object.freeze({
    cpm: { spec: { type: 'cpm', orientation: 'column' }, title: 'CPM' },
    log2p1: { spec: { type: 'log', base: 2, pseudoCount: 1 }, title: 'log2(x+1)' },
    centerRowsMean: { spec: { type: 'centerRows', method: 'mean' }, title: 'Center rows (mean)' },
    centerRowsMedian: { spec: { type: 'centerRows', method: 'median' }, title: 'Center rows (median)' },
    centerColsMean: { spec: { type: 'centerColumns', method: 'mean' }, title: 'Center cols (mean)' },
    centerColsMedian: { spec: { type: 'centerColumns', method: 'median' }, title: 'Center cols (median)' },
    normalizeRows: { spec: { type: 'normalizeRows' }, title: 'Normalize rows (z)' },
    normalizeCols: { spec: { type: 'normalizeColumns' }, title: 'Normalize cols (z)' }
  });

  function promptLineCustomExpression(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const expression = String(toolbarApi?.getCustomTransformExpression?.('line') || '').trim();
    if(expression){
      return expression;
    }
    toolbarApi?.openCustomTransformEditor?.('line');
    if(typeof global.alert === 'function'){
      global.alert('Enter a custom transformation formula using x, then click "Apply custom".');
    }
    return null;
  }

  function resolveLineToolbarTransformOption(optionKey, customExpression){
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
    const preset = LINE_TRANSFORM_OPTION_MAP[key];
    if(!preset){
      return null;
    }
    return {
      spec: Object.assign({}, preset.spec),
      title: preset.title
    };
  }

  function applyLineTransformPipelineToNewView(transformSpecs, options = {}){
    const hot = line.__ensureHotForActiveTab?.() || getActiveLineHotManager() || refs.hot;
    if(!hot){
      return false;
    }
    const manager = ensureLineDataViewsForHot(hot, {
      wrapper: refs.hotWrapper,
      container: hot.__lineHostContainer || refs.hotContainer
    });
    if(!manager || typeof manager.applyPipeline !== 'function'){
      console.warn('line data transform pipeline skipped: Shared.dataViews unavailable');
      return false;
    }
    const specs = Array.isArray(transformSpecs) ? transformSpecs.filter(Boolean) : [];
    if(!specs.length){
      return false;
    }
    syncLineActiveDataViewFromHot(hot, 'transform-before');
    const result = manager.applyPipeline(specs, {
      title: options.title,
      reason: options.reason || 'toolbar-transform-pipeline',
      transformOptions: Object.assign({}, LINE_TRANSFORM_SCOPE_DEFAULT, options.transformOptions || {})
    });
    if(!result?.ok){
      const message = result?.error || 'Transformation failed.';
      if(typeof global.alert === 'function'){
        global.alert(`Unable to transform data: ${message}`);
      }
      lineDebug('Debug: line transform pipeline failed', {
        message,
        stepCount: specs.length
      });
      return false;
    }
    activateLineDataToolbar('transform-pipeline-applied');
    lineDebug('Debug: line transform pipeline created view', {
      title: result?.view?.title || null,
      stepCount: Array.isArray(result?.result?.steps) ? result.result.steps.length : specs.length
    });
    return true;
  }

  function projectLineSeriesStyle(seriesKey, patch, session = null){
    const key = String(seriesKey == null ? '' : seriesKey).trim();
    if(!key || !patch || typeof patch !== 'object'){
      return false;
    }
    const owner = resolveLineStateSession(session || getLineActiveSessionForState());
    const tabId = owner?.tabId || getLineProjectionTabId() || null;
    const svg = getLineNodeById('lineSvg', tabId) || getLineNodeById('lineSvg');
    if(!svg){
      return false;
    }
    const seriesNodes = Array.from(svg.querySelectorAll('[data-series]'))
      .filter(node => String(node.dataset?.series || node.getAttribute?.('data-series') || '').trim() === key);
    const lineNodes = seriesNodes.filter(node => node.dataset?.lineStyleRole === 'line');
    const areaNodes = seriesNodes.filter(node => node.dataset?.lineStyleRole === 'area');
    const markerGroups = seriesNodes.filter(node => node.dataset?.lineStyleRole === 'markers');
    const markerNodes = markerGroups.flatMap(group => Array.from(group.querySelectorAll('circle, ellipse, path, polygon, rect')));
    const legendNodes = Array.from(svg.querySelectorAll('[data-legend-key]'))
      .filter(node => String(node.dataset?.legendKey || '').trim() === key);
    const legendLines = legendNodes.filter(node => node.dataset?.legendLine === '1');
    const legendMarkers = legendNodes.filter(node => node.dataset?.legendMarker === '1' || node.dataset?.legendSwatch === '1');
    let applied = false;
    const setAttribute = (nodes, name, value) => {
      if(value === undefined){ return; }
      nodes.forEach(node => {
        if(value === null || value === ''){
          node.removeAttribute(name);
        }else{
          node.setAttribute(name, String(value));
        }
      });
      applied = applied || nodes.length > 0;
    };
    const markerFill = patch.markerFill ?? patch.fill;
    const markerStroke = patch.markerStroke ?? patch.stroke ?? patch.borderColor;
    const markerStrokeWidth = patch.markerStrokeWidth ?? patch.strokeWidth;
    const lineStroke = patch.lineStroke;
    const lineStrokeWidth = patch.lineStrokeWidth;
    const lineAlpha = patch.lineAlpha ?? patch.alpha;
    const markerAlpha = patch.markerAlpha ?? patch.alpha;
    setAttribute(lineNodes, 'stroke', lineStroke);
    setAttribute(areaNodes, 'fill', lineStroke);
    setAttribute(legendLines, 'stroke', lineStroke);
    setAttribute(lineNodes, 'stroke-width', lineStrokeWidth);
    setAttribute(legendLines, 'stroke-width', lineStrokeWidth);
    if(lineAlpha !== undefined){
      const opacity = Math.max(0, Math.min(1, 1 - Number(lineAlpha || 0)));
      setAttribute(lineNodes, 'stroke-opacity', opacity);
      setAttribute(areaNodes, 'fill-opacity', opacity * 0.35);
      setAttribute(legendLines, 'stroke-opacity', opacity);
    }
    setAttribute(markerNodes, 'fill', markerFill);
    setAttribute(legendMarkers, 'fill', markerFill);
    setAttribute(markerNodes, 'stroke', markerStroke);
    setAttribute(legendMarkers, 'stroke', markerStroke);
    setAttribute(markerNodes, 'stroke-width', markerStrokeWidth);
    setAttribute(legendMarkers, 'stroke-width', markerStrokeWidth);
    if(markerAlpha !== undefined){
      const opacity = Math.max(0, Math.min(1, 1 - Number(markerAlpha || 0)));
      setAttribute(markerNodes, 'fill-opacity', opacity);
      setAttribute(markerNodes, 'stroke-opacity', opacity);
      setAttribute(legendMarkers, 'opacity', opacity);
    }
    const supportedKeys = new Set([
      'alpha', 'borderColor', 'fill', 'lineAlpha', 'lineStroke', 'lineStrokeWidth',
      'markerAlpha', 'markerFill', 'markerStroke', 'markerStrokeWidth', 'stroke', 'strokeWidth'
    ]);
    const fullyProjected = applied && Object.keys(patch).every(property => supportedKeys.has(property));
    if(fullyProjected && svg.dataset?.viewMode === '3d'){
      patchLine3dRotationModelStyle(owner, key, patch);
    }
    return fullyProjected;
  }

  function applyLineSelectedTransforms(){
    const toolbarApi = Shared.workspaceToolbar || null;
    const selected = toolbarApi?.getSelectedTransforms?.('line') || [];
    if(!Array.isArray(selected) || !selected.length){
      return false;
    }
    const resolved = [];
    for(let i = 0; i < selected.length; i += 1){
      const optionKey = selected[i];
      if(optionKey === 'custom'){
        const customExpression = promptLineCustomExpression();
        if(!customExpression){
          return false;
        }
        const customTransform = resolveLineToolbarTransformOption('custom', customExpression);
        if(customTransform){
          resolved.push(customTransform);
        }
        continue;
      }
      const next = resolveLineToolbarTransformOption(optionKey);
      if(next){
        resolved.push(next);
      }
    }
    if(!resolved.length){
      return false;
    }
    const ok = resolved.length === 1
      ? applyLineTransformToNewView(resolved[0].spec, {
        title: resolved[0].title,
        reason: 'toolbar-transform-multi-single'
      })
      : applyLineTransformPipelineToNewView(
        resolved.map(item => item.spec),
        { reason: 'toolbar-transform-multi' }
      );
    if(ok){
      toolbarApi?.clearSelectedTransforms?.('line');
    }
    return ok;
  }

  function bindLineDataToolbar(){
    if(!global.document){
      return;
    }
    if(!lineDataToolbarBound){
      global.document.addEventListener('click', event => {
      const button = event.target?.closest?.(
        '#lineTransformApplySelected, #lineTransformCustomApply, #lineTransformCpm, #lineTransformLog2p1, #lineTransformCenterRowsMean, #lineTransformCenterRowsMedian, #lineTransformCenterColsMean, #lineTransformCenterColsMedian, #lineTransformNormalizeRows, #lineTransformNormalizeCols, #lineTransformCustom'
      );
      if(!button){
        return;
      }
      const transformSection = button.closest?.('.workspace-toolbar__section[data-transform-section="1"]');
      if(button.id === 'lineTransformApplySelected'){
        applyLineSelectedTransforms();
        return;
      }
      if(button.id === 'lineTransformCustomApply'){
        const customExpression = promptLineCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveLineToolbarTransformOption('custom', customExpression);
        if(!customTransform){
          return;
        }
        if(transformSection?.dataset?.transformMultiMode === '1'){
          const selected = Shared.workspaceToolbar?.getSelectedTransforms?.('line') || [];
          if(Array.isArray(selected) && selected.includes('custom')){
            applyLineSelectedTransforms();
          }else{
            applyLineTransformToNewView(customTransform.spec, { title: customTransform.title });
          }
          return;
        }
        applyLineTransformToNewView(customTransform.spec, { title: customTransform.title });
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
        const customExpression = promptLineCustomExpression();
        if(!customExpression){
          return;
        }
        const customTransform = resolveLineToolbarTransformOption(optionKey, customExpression);
        if(customTransform){
          applyLineTransformToNewView(customTransform.spec, { title: customTransform.title });
        }
        return;
      }
      const resolved = resolveLineToolbarTransformOption(optionKey);
      if(resolved){
        applyLineTransformToNewView(resolved.spec, { title: resolved.title });
      }
      }, true);
      lineDataToolbarBound = true;
    }
    if(refs.hotWrapper && !refs.hotWrapper.__lineDataToolbarFocusBound){
      refs.hotWrapper.addEventListener('mousedown', () => {
        activateLineDataToolbar('table-mousedown');
      }, true);
      refs.hotWrapper.__lineDataToolbarFocusBound = true;
    }
  }

  function ensureLineTooltipHost(tooltip, doc){
    if(!tooltip){ return null; }
    const documentRef = doc || tooltip.ownerDocument || global.document;
    if(!documentRef){ return tooltip; }
    const parent = tooltip.parentElement;
    if(!parent){ return tooltip; }
    let needsDetach = false;
    if(typeof tooltip.closest === 'function'){
      const hiddenAncestor = tooltip.closest('[hidden]');
      if(hiddenAncestor && hiddenAncestor !== tooltip){
        needsDetach = true;
      }
    }
    if(!needsDetach){
      try{
        const view = documentRef.defaultView;
        if(view && typeof view.getComputedStyle === 'function'){
          const parentDisplay = view.getComputedStyle(parent).display;
          if(parentDisplay === 'none'){
            needsDetach = true;
          }
        }else if(typeof parent.style?.display === 'string' && parent.style.display === 'none'){
          needsDetach = true;
        }
      }catch(err){
        lineDebug('Debug: line tooltip host inspection error',{ error: err?.message || String(err) });
      }
    }
    const host = documentRef.body || documentRef.documentElement;
    if(needsDetach && host && parent !== host){
      host.appendChild(tooltip);
      lineDebug('Debug: line tooltip host realigned',{ previousParent: parent.id || parent.className || parent.tagName || null });
    }
    return tooltip;
  }

  function getLineTooltipElement(){
    if(lineTooltipEl && lineTooltipEl.isConnected){
      return lineTooltipEl;
    }
    const doc = global.document;
    const tooltip = refs.tooltip || doc?.getElementById?.('tooltip') || null;
    if(tooltip){
      ensureLineTooltipHost(tooltip, doc);
      lineTooltipEl = tooltip;
      refs.tooltip = tooltip;
    }
    return lineTooltipEl;
  }

  function formatLineTooltipNumber(value){
    const formatter = Shared.formatters?.formatShortNumber;
    if(typeof formatter === 'function'){
      return formatter(value, { emptyValue: 'n/a' });
    }
    if(value === null || value === undefined){ return 'n/a'; }
    if(typeof value === 'number'){
      if(!Number.isFinite(value)){ return String(value); }
      return value.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    const numeric = Number(value);
    if(Number.isFinite(numeric)){
      return numeric.toLocaleString('en-US',{ maximumSignificantDigits: 6 });
    }
    return String(value);
  }

  function updateLineTooltipContent(tooltip, seriesName, pt){
    if(!tooltip || !pt){ return false; }
    const doc = tooltip.ownerDocument || global.document;
    tooltip.textContent = '';
    tooltip.style.fontSize = '12px';
    tooltip.style.columnCount = 1;
    tooltip.style.columnWidth = 'auto';
    tooltip.style.columnGap = '0';
    tooltip.style.maxWidth = '320px';
    tooltip.style.maxHeight = 'none';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    tooltip.style.whiteSpace = 'normal';
    tooltip.style.overflow = 'visible';
    const fragment = doc.createDocumentFragment();
    const appendRow = (text, bold) => {
      if(!text){ return; }
      const row = doc.createElement('div');
      if(bold){ row.style.fontWeight = '600'; }
      row.textContent = text;
      fragment.appendChild(row);
    };
    if(seriesName){
      appendRow(seriesName, true);
    }
    appendRow(`X: ${formatLineTooltipNumber(pt.x)}`);
    appendRow(`Y: ${formatLineTooltipNumber(pt.y)}`);
    if(Array.isArray(pt.replicates) && pt.replicates.length){
      const values = pt.replicates.map(formatLineTooltipNumber).join(', ');
      appendRow(`Replicates (${pt.replicates.length}): ${values}`);
    }
    if(Number.isFinite(pt.lower)){
      appendRow(`Lower: ${formatLineTooltipNumber(pt.lower)}`);
    }
    if(Number.isFinite(pt.upper)){
      appendRow(`Upper: ${formatLineTooltipNumber(pt.upper)}`);
    }
    if(Array.isArray(pt.replicates) && pt.replicates.length > 1 && Number.isFinite(pt.stdev)){
      appendRow(`Std Dev: ${formatLineTooltipNumber(pt.stdev)}`);
    }
    if(!fragment.childNodes.length){
      return false;
    }
    tooltip.appendChild(fragment);
    return true;
  }

  function getEventPagePosition(evt){
    const win = global.window;
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const pageX = typeof evt?.pageX === 'number' ? evt.pageX : ((evt?.clientX || 0) + scrollX);
    const pageY = typeof evt?.pageY === 'number' ? evt.pageY : ((evt?.clientY || 0) + scrollY);
    return { x: pageX, y: pageY };
  }

  function positionLineTooltipAt(tooltip, pageX, pageY){
    if(!tooltip){ return; }
    const win = global.window;
    const offset = 12;
    let left = pageX + offset;
    let top = pageY + offset;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    const rect = tooltip.getBoundingClientRect();
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const maxX = scrollX + (win?.innerWidth ?? rect.width) - 8;
    const maxY = scrollY + (win?.innerHeight ?? rect.height) - 8;
    if(rect.right > maxX){
      left = Math.max(scrollX + 8, maxX - rect.width);
    }
    if(rect.bottom > maxY){
      top = Math.max(scrollY + 8, maxY - rect.height);
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideLineTooltip(reason){
    const tooltip = getLineTooltipElement();
    if(!tooltip){ return; }
    const wasVisible = tooltip.style.display !== 'none';
    tooltip.style.display = 'none';
    tooltip.textContent = '';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    if(wasVisible){
      lineDebug('Debug: line tooltip hide',{ reason });
    }
  }

  function showLineTooltip(seriesName, pt, evt){
    const tooltip = getLineTooltipElement();
    if(!tooltip){ return; }
    if(!updateLineTooltipContent(tooltip, seriesName, pt)){ return; }
    tooltip.style.display = 'block';
    const pos = getEventPagePosition(evt);
    positionLineTooltipAt(tooltip, pos.x, pos.y);
    lineDebug('Debug: line tooltip show',{
      series: seriesName || null,
      x: pt?.x ?? null,
      y: pt?.y ?? null,
      replicates: Array.isArray(pt?.replicates) ? pt.replicates.length : 0
    });
  }

  function handleLineMarkerEnter(evt){
    const data = evt?.currentTarget?.__linePointData;
    if(!data || !data.point){ return; }
    showLineTooltip(data.seriesName, data.point, evt);
  }

  function handleLineMarkerMove(evt){
    const tooltip = getLineTooltipElement();
    if(!tooltip || tooltip.style.display === 'none'){ return; }
    const pos = getEventPagePosition(evt);
    positionLineTooltipAt(tooltip, pos.x, pos.y);
  }

  function handleLineMarkerLeave(){
    hideLineTooltip('marker-leave');
  }

  function handleLinePlotMouseLeave(){
    hideLineTooltip('plot-leave');
  }

  function attachLineMarkerTooltip(el, seriesEntry, pt){
    if(!el || !pt){ return; }
    el.__linePointData = { seriesName: seriesEntry?.name || '', point: pt };
    try{ el.setAttribute('data-line-point-interaction', JSON.stringify(el.__linePointData)); }catch(_err){}
    if(el.__graphitixLinePointTooltipBound === true){
      bindLineMarkerFormatInteraction(el);
      return;
    }
    el.addEventListener('mouseenter', handleLineMarkerEnter);
    el.addEventListener('mousemove', handleLineMarkerMove);
    el.addEventListener('mouseleave', handleLineMarkerLeave);
    el.__graphitixLinePointTooltipBound = true;
    bindLineMarkerFormatInteraction(el);
  }

  function bindLineMarkerFormatInteraction(el){
    if(!el || el.__graphitixLineMarkerFormatBound === true){ return false; }
    el.addEventListener('click', handleLineMarkerClick);
    el.__graphitixLineMarkerFormatBound = true;
    return true;
  }

  function bindLinePathFormatInteraction(el){
    if(!el || el.__graphitixLinePathFormatBound === true){ return false; }
    el.addEventListener('click', handleLinePathClick);
    el.__graphitixLinePathFormatBound = true;
    return true;
  }

  function handleLineMarkerClick(evt){
    const target = evt?.currentTarget;
    if(!target){ return; }
    try{ evt.stopPropagation(); }catch(e){}
    showLinePointFormatControls(target);
  }

  function handleLinePathClick(evt){
    const target = evt?.currentTarget;
    if(!target){ return; }
    try{ evt.stopPropagation(); }catch(e){}
    showLinePointFormatControls(target);
  }

  function showLinePointFormatControls(target){
    const doc = global.document;
    if(!doc){ return; }
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls({ force: true }); }catch(e){}
    if(Shared.symbolToolbar && typeof Shared.symbolToolbar.show === 'function'){
      const toolbarSession = getLineProjectionSession({ reason: 'line-series-toolbar-open' });
      const canEditToolbarOwner = () => !toolbarSession || isLineSessionActive(toolbarSession);
      const dotSizeInput = getLineNodeById('lineDotSize');
      const strokeInput = getLineNodeById('lineBorder');
      const strokeWidthInput = getLineNodeById('lineBorderWidth');
      const alphaInput = getLineNodeById('lineAlpha');
      const alphaVal = getLineNodeById('lineAlphaVal');
      let seriesKey = target?.__linePointData?.seriesName || target?.dataset?.series || null;
      const resolveAlpha = value => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
      };
      const decodeScopeValue = value => {
        if(Shared && typeof Shared.decodeScopeValue === 'function'){
          return Shared.decodeScopeValue(value);
        }
        const raw = String(value == null ? '' : value).trim();
        if(!raw){
          return { raw: '', kind: '', dataset: '' };
        }
        const tokenIndex = raw.indexOf('::');
        if(tokenIndex <= 0){
          return { raw, kind: raw, dataset: '' };
        }
        const kind = String(raw.slice(0, tokenIndex) || '').trim();
        const encodedDataset = raw.slice(tokenIndex + 2);
        let dataset = encodedDataset;
        try{
          dataset = decodeURIComponent(encodedDataset);
        }catch(err){}
        return { raw, kind: kind || raw, dataset: String(dataset == null ? '' : dataset).trim() };
      };
      const applyAndDispatch = (inputEl, value, type = 'input') => {
        if(!inputEl){ return; }
        inputEl.value = value;
        inputEl.dispatchEvent(new Event(type, { bubbles: true }));
      };
      const applySeriesPatch = (patch, keyOverride) => {
        if(!canEditToolbarOwner()){
          return;
        }
        const resolvedKey = String(keyOverride == null ? seriesKey : keyOverride).trim();
        if(!resolvedKey){ return; }
        patchLineSeriesStyleState(toolbarSession, resolvedKey, patch, { reason: 'line-series-style-change' });
        if(!projectLineSeriesStyle(resolvedKey, patch, toolbarSession)){
          scheduleLineViewRefresh('line-series-style-change', { tabId: toolbarSession?.tabId || undefined });
        }
      };
      const knownSeriesKeys = () => {
        const keys = new Set(Object.keys(lineSeriesStyles || {}));
        Object.keys(lineLabelColors || {}).forEach(name => {
          const normalized = name == null ? '' : String(name).trim();
          if(normalized){ keys.add(normalized); }
        });
        if(Array.isArray(lineSeriesGroupLabels)){
          lineSeriesGroupLabels.forEach(name => {
            const normalized = name == null ? '' : String(name).trim();
            if(normalized){ keys.add(normalized); }
          });
        }
        try{
          const plotHost = refs.plot || getLineNodeById('linePlot');
          plotHost?.querySelectorAll?.('[data-series]').forEach(node => {
            const normalized = String(node?.dataset?.series || node?.getAttribute?.('data-series') || '').trim();
            if(normalized){ keys.add(normalized); }
          });
        }catch(err){}
        if(seriesKey){ keys.add(seriesKey); }
        return Array.from(keys);
      };
      const orderedSeriesKeys = () => {
        const keys = knownSeriesKeys().filter(name => {
          const normalized = name == null ? '' : String(name).trim();
          return !!normalized;
        });
        if(!seriesKey){
          return keys;
        }
        return [seriesKey].concat(keys.filter(name => name !== seriesKey));
      };
      const resolveScopedSeriesKey = ctx => {
        const kind = String(ctx?.scope || '').trim().toLowerCase();
        if(kind !== 'series'){
          return '';
        }
        const datasetFromContext = String(ctx?.scopeDataset || '').trim();
        if(datasetFromContext){
          return datasetFromContext;
        }
        const parsed = decodeScopeValue(ctx?.scopeValue || ctx?.scope);
        const datasetFromScope = String(parsed.dataset || '').trim();
        if(datasetFromScope){
          return datasetFromScope;
        }
        return String(seriesKey || '').trim();
      };
      const applyGlobalPatch = (key, value) => {
        if(!canEditToolbarOwner()){
          return;
        }
        const keys = knownSeriesKeys();
        const currentStyles = getLineStylesState(toolbarSession);
        const nextSeries = cloneLineRuntimeValue(currentStyles.series, {}) || {};
        keys.forEach(k => {
          nextSeries[k] = Object.assign({}, nextSeries[k] || {}, { [key]: value });
        });
        patchLineStylesState(toolbarSession, { series: nextSeries }, { reason: 'line-series-style-global-change' });
        const projected = keys.length > 0 && keys.every(seriesName => projectLineSeriesStyle(seriesName, { [key]: value }, toolbarSession));
        if(!projected){
          scheduleLineViewRefresh('line-series-style-global-change', { tabId: toolbarSession?.tabId || undefined });
        }
      };
      const resolveSeriesStyle = scopedSeriesKey => {
        if(!scopedSeriesKey){ return {}; }
        const state = getLineStylesState(toolbarSession);
        return state.series?.[scopedSeriesKey] || {};
      };
      const resolveAggregateSeriesStyleValue = key => {
        const keys = knownSeriesKeys();
        const stylesState = getLineStylesState(toolbarSession);
        let resolved = null;
        for(let i = 0; i < keys.length; i += 1){
          const value = stylesState.series?.[keys[i]]?.[key];
          if(typeof value !== 'string' || !value.trim()){
            return null;
          }
          const normalized = value.trim();
          if(resolved == null){
            resolved = normalized;
          }else if(resolved !== normalized){
            return null;
          }
        }
        return resolved;
      };
      const getMarkerFill = ctx => {
        const scopedSeriesKey = resolveScopedSeriesKey(ctx);
        const style = resolveSeriesStyle(scopedSeriesKey);
        if(scopedSeriesKey){
          return style?.markerFill || style?.fill || lineLabelColors[scopedSeriesKey] || '#0000ff';
        }
        return '#0000ff';
      };
      const getMarkerBorderColor = ctx => {
        const scopedSeriesKey = resolveScopedSeriesKey(ctx);
        const style = resolveSeriesStyle(scopedSeriesKey);
        if(scopedSeriesKey){
          return style?.markerStroke || style?.stroke || style?.borderColor || '#000000';
        }
        if(typeof style?.markerStroke === 'string' && style.markerStroke){ return style.markerStroke; }
        if(typeof style?.stroke === 'string' && style.stroke){ return style.stroke; }
        if(typeof style?.borderColor === 'string' && style.borderColor){ return style.borderColor; }
        return '#000000';
      };
      const getMarkerBorderWidth = ctx => {
        const scopedSeriesKey = resolveScopedSeriesKey(ctx);
        const style = resolveSeriesStyle(scopedSeriesKey);
        if(scopedSeriesKey){
          if(Number.isFinite(Number(style?.markerStrokeWidth))){ return Number(style.markerStrokeWidth); }
          if(Number.isFinite(Number(style?.strokeWidth))){ return Number(style.strokeWidth); }
        }
        if(Number.isFinite(Number(style?.markerStrokeWidth))){ return Number(style.markerStrokeWidth); }
        if(Number.isFinite(Number(style?.strokeWidth))){ return Number(style.strokeWidth); }
        return 0;
      };
      const getMarkerAlpha = ctx => {
        const scopedSeriesKey = resolveScopedSeriesKey(ctx);
        const style = resolveSeriesStyle(scopedSeriesKey);
        if(scopedSeriesKey){
          if(resolveAlpha(style?.markerAlpha) != null){ return resolveAlpha(style.markerAlpha); }
          if(resolveAlpha(style?.alpha) != null){ return resolveAlpha(style.alpha); }
        }
        if(resolveAlpha(style?.markerAlpha) != null){ return resolveAlpha(style.markerAlpha); }
        if(resolveAlpha(style?.alpha) != null){ return resolveAlpha(style.alpha); }
        return resolveAlpha(alphaInput?.value) || 0;
      };
      const getPathColor = ctx => {
        const scopedSeriesKey = resolveScopedSeriesKey(ctx);
        const style = resolveSeriesStyle(scopedSeriesKey);
        if(scopedSeriesKey){
          return style?.lineStroke || lineLabelColors[scopedSeriesKey] || strokeInput?.value || '#000000';
        }
        const aggregateLineStroke = resolveAggregateSeriesStyleValue('lineStroke');
        if(aggregateLineStroke){
          return aggregateLineStroke;
        }
        return strokeInput?.value || '#000000';
      };
      const getPathWidth = ctx => {
        const scopedSeriesKey = resolveScopedSeriesKey(ctx);
        const style = resolveSeriesStyle(scopedSeriesKey);
        if(scopedSeriesKey){
          if(Number.isFinite(Number(style?.lineStrokeWidth))){ return Number(style.lineStrokeWidth); }
          if(Number.isFinite(Number(style?.strokeWidth))){ return Number(style.strokeWidth); }
        }
        if(Number.isFinite(Number(strokeWidthInput?.value))){
          return Number(strokeWidthInput.value);
        }
        return Number(target.getAttribute('stroke-width')) || 0;
      };
      const getPathAlpha = ctx => {
        const scopedSeriesKey = resolveScopedSeriesKey(ctx);
        const style = resolveSeriesStyle(scopedSeriesKey);
        if(scopedSeriesKey){
          if(resolveAlpha(style?.lineAlpha) != null){ return resolveAlpha(style.lineAlpha); }
          if(resolveAlpha(style?.alpha) != null){ return resolveAlpha(style.alpha); }
        }
        return resolveAlpha(alphaInput?.value) || 0;
      };
      const seriesScopeLabel = (typeof seriesKey === 'string' && seriesKey.trim()) ? seriesKey : 'Series';
      const seriesScopeOptions = (() => {
        const options = [{ value: 'global', label: 'Global', disabled: false }];
        const keys = orderedSeriesKeys();
        if(keys.length){
          keys.forEach(name => {
            options.push({
              value: 'series',
              label: name,
              datasetLabel: name,
              scopeDataset: name,
              scopeKind: 'series',
              disabled: false
            });
          });
        }else{
          options.push({
            value: 'series',
            label: seriesScopeLabel,
            datasetLabel: seriesScopeLabel,
            scopeDataset: seriesScopeLabel,
            scopeKind: 'series',
            disabled: !seriesKey
          });
        }
        return options;
      })();
      const sanitizeShape = (shape, index = 0) => sanitizeLineGroupShape(shape, index);
      const symbolToolbarState = Shared.symbolToolbar.show({
        document: doc,
        target,
        anchorId: 'lineFontHost',
        scopeId: 'line',
        formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls line-point-controls',
        scope: {
          label: 'Scope',
          options: seriesScopeOptions,
          value: seriesKey ? 'series' : 'global',
          onChange(nextScope, ctx){
            if(nextScope === 'series'){
              const scopedSeriesKey = resolveScopedSeriesKey(ctx);
              if(scopedSeriesKey){
                seriesKey = scopedSeriesKey;
              }
            }
          }
        },
        fillShape: {
          label: 'Fill/Shape',
          shapeOptions: LINE_GROUP_SHAPE_OPTIONS?.length ? LINE_GROUP_SHAPE_OPTIONS : [{ value: 'circle', label: 'Circle' }],
          getColor(ctx){
            return getMarkerFill(ctx);
          },
          getShape(ctx){
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              const idx = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.findIndex(name => name === scopedSeriesKey) : -1;
              const safe = idx >= 0 ? idx : 0;
              return sanitizeShape(getLineGroupShape(safe), safe);
            }
            const total = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0;
            const shapes = ensureLineGroupShapeCapacity(total);
            if(!shapes.length){
              return sanitizeShape('circle', 0);
            }
            const unique = new Set(shapes.map((shapeValue, idx) => sanitizeShape(shapeValue, idx)));
            return unique.size === 1 ? unique.values().next().value : sanitizeShape(shapes[0], 0);
          },
          onColorInput(nextColor, ctx){
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              applySeriesPatch({ markerFill: nextColor, fill: nextColor }, scopedSeriesKey);
            }else{
              applyGlobalPatch('markerFill', nextColor);
              applyGlobalPatch('fill', nextColor);
            }
          },
          onColorChange(nextColor, ctx){
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              applySeriesPatch({ markerFill: nextColor, fill: nextColor }, scopedSeriesKey);
            }else{
              applyGlobalPatch('markerFill', nextColor);
              applyGlobalPatch('fill', nextColor);
            }
          },
          onShapeChange(nextShape, ctx){
            if(!LINE_GROUP_SHAPE_OPTIONS?.length){ return; }
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              const idx = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.findIndex(name => name === scopedSeriesKey) : -1;
              const safe = idx >= 0 ? idx : 0;
              const shapes = ensureLineGroupShapeCapacity(Math.max((lineSeriesGroupLabels || []).length, safe + 1));
              shapes[safe] = sanitizeShape(nextShape, safe);
              setLineGroupShapesState(getLineProjectionSession({ reason: 'line-projection-mutation' }), shapes, { reason: 'line-marker-shape-change' });
              updateLineGroupShapeSelect(safe, shapes[safe]);
              scheduleActiveLineDraw();
              return;
            }
            const total = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0;
            const shapes = ensureLineGroupShapeCapacity(total);
            const sanitized = sanitizeShape(nextShape, 0);
            let changed = false;
            for(let i = 0; i < shapes.length; i += 1){
              if(shapes[i] !== sanitized){
                shapes[i] = sanitized;
                updateLineGroupShapeSelect(i, sanitized);
                changed = true;
              }
            }
            if(changed){
              setLineGroupShapesState(getLineProjectionSession({ reason: 'line-projection-mutation' }), shapes, { reason: 'line-marker-shape-global-change' });
              scheduleActiveLineDraw();
            }
          }
        },
        border: {
          label: 'Border',
          getColor(ctx){
            return getMarkerBorderColor(ctx);
          },
          onColorInput(nextColor, ctx){
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              applySeriesPatch({ markerStroke: nextColor }, scopedSeriesKey);
            }else{
              applyGlobalPatch('markerStroke', nextColor);
            }
          },
          onColorChange(nextColor, ctx){
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              applySeriesPatch({ markerStroke: nextColor }, scopedSeriesKey);
            }else{
              applyGlobalPatch('markerStroke', nextColor);
            }
          },
          getWidth(ctx){
            return getMarkerBorderWidth(ctx);
          },
          onWidthChange(nextValue, ctx){
            const next = Math.max(0, Number(nextValue) || 0);
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              applySeriesPatch({ markerStrokeWidth: next }, scopedSeriesKey);
            }else{
              applyGlobalPatch('markerStrokeWidth', next);
            }
          }
        },
        size: {
          get(ctx){
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            const style = scopedSeriesKey ? resolveSeriesStyle(scopedSeriesKey) : null;
            if(scopedSeriesKey && Number.isFinite(Number(style?.dotSize))){
              return Number(style.dotSize);
            }
            if(Number.isFinite(Number(dotSizeInput?.value))){
              return Number(dotSizeInput.value);
            }
            return Number(target.getAttribute('r')) || LINE_DEFAULT_DOT_SIZE;
          },
          onChange(nextValue, ctx){
            const next = Math.max(0, Number(nextValue) || 0);
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              applySeriesPatch({ dotSize: next }, scopedSeriesKey);
            }else{
              if(dotSizeInput){ applyAndDispatch(dotSizeInput, String(next)); }
              applyGlobalPatch('dotSize', next);
            }
          }
        },
        transparency: {
          label: 'Transparency',
          get(ctx){
            return getMarkerAlpha(ctx);
          },
          onChange(nextValue, ctx){
            const normalized = Math.min(1, Math.max(0, Number(nextValue) || 0));
            const scopedSeriesKey = resolveScopedSeriesKey(ctx);
            if(scopedSeriesKey){
              applySeriesPatch({ markerAlpha: normalized }, scopedSeriesKey);
            }else{
              applyGlobalPatch('markerAlpha', normalized);
            }
          }
        }
      });
      const toolbarHost = symbolToolbarState?.host || null;
      const markerScopeSelect = symbolToolbarState?.scopeSelect || null;
      if(toolbarHost){
        const selectedScopeDataset = selectEl => {
          const selected = selectEl && selectEl.selectedOptions && selectEl.selectedOptions.length
            ? selectEl.selectedOptions[0]
            : null;
          return String(selected?.dataset?.scopeDataset || '').trim();
        };
        const selectScopeOption = (selectEl, scopeValue, scopeDataset) => {
          if(!selectEl){ return false; }
          const requestedValue = String(scopeValue == null ? '' : scopeValue).trim();
          const requestedDataset = String(scopeDataset == null ? '' : scopeDataset).trim();
          const options = Array.from(selectEl.options || []);
          let matchIndex = -1;
          if(requestedDataset){
            matchIndex = options.findIndex(opt => (
              !opt.disabled
              && opt.value === requestedValue
              && String(opt?.dataset?.scopeDataset || '').trim() === requestedDataset
            ));
          }
          if(matchIndex < 0){
            matchIndex = options.findIndex(opt => !opt.disabled && opt.value === requestedValue);
          }
          if(matchIndex < 0){
            return false;
          }
          if(selectEl.selectedIndex !== matchIndex){
            selectEl.selectedIndex = matchIndex;
            return true;
          }
          return false;
        };
        const normalizeScope = value => (value === 'series' && seriesKey) ? 'series' : 'global';
        let lineScopeValue = normalizeScope(markerScopeSelect?.value || (seriesKey ? 'series' : 'global'));
        const setLineScope = (value, options) => {
          const opts = options || {};
          const normalized = normalizeScope(value);
          if(normalized === 'series'){
            const scopedSeriesKey = String(opts.scopeDataset || '').trim();
            if(scopedSeriesKey){
              seriesKey = scopedSeriesKey;
            }
          }
          lineScopeValue = normalized;
          if(markerScopeSelect){
            const didSelect = selectScopeOption(markerScopeSelect, normalized, seriesKey);
            if(didSelect && opts.dispatchMarkerChange !== false){
              markerScopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          return normalized;
        };
        const syncPathToolbar = () => {
          try{
            lineScopeValue = normalizeScope(markerScopeSelect?.value || lineScopeValue);
            if(additionalLineControls && typeof additionalLineControls.setScope === 'function'){
              additionalLineControls.setScope(lineScopeValue, {
                triggerChange: false,
                scopeDataset: seriesKey
              });
            }
            if(additionalLineControls && typeof additionalLineControls.refresh === 'function'){
              additionalLineControls.refresh();
            }
            syncLineErrorBarToolbarControl(toolbarHost);
          }catch(err){}
        };
        if(additionalLineControls && typeof additionalLineControls.show === 'function'){
          toolbarHost.classList.add('font-toolbar-host--line-dual');
          additionalLineControls.show({
            host: toolbarHost,
            target,
            scopeId: 'line',
            panelTitle: 'Line',
            skipHideAll: true,
            appendToHost: true,
            clearHost: false,
            keepOpenWithinHost: true,
            keepHostVisible: true,
            hostClass: 'font-toolbar-host--line-dual',
            hostDisplay: 'grid',
            scope: {
              label: 'Scope',
              options: seriesScopeOptions,
              value: lineScopeValue,
              onChange(nextScope, ctx){
                setLineScope(nextScope, { scopeDataset: ctx?.scopeDataset });
              }
            },
            controls: {
              showSummary: false,
              showScope: true,
              showPattern: false,
              colorLabel: 'Line',
              thicknessLabel: 'Line width',
              transparencyLabel: 'Line transparency',
              thicknessMin: 0,
              thicknessStep: 0.5,
              thicknessMax: 24
            },
            getSummary: () => '',
            getColor: ctx => getPathColor(ctx),
            getThickness: ctx => getPathWidth(ctx),
            getTransparency: ctx => Math.round(Math.min(1, Math.max(0, Number(getPathAlpha(ctx)) || 0)) * 100),
            onColorInput: (nextColor, ctx) => {
              const scopedSeriesKey = resolveScopedSeriesKey(ctx);
              if(scopedSeriesKey){
                applySeriesPatch({ lineStroke: nextColor }, scopedSeriesKey);
              }else{
                if(strokeInput){ strokeInput.value = nextColor; }
                applyGlobalPatch('lineStroke', nextColor);
              }
            },
            onColorChange: (nextColor, ctx) => {
              const scopedSeriesKey = resolveScopedSeriesKey(ctx);
              if(scopedSeriesKey){
                applySeriesPatch({ lineStroke: nextColor }, scopedSeriesKey);
              }else{
                if(strokeInput){ strokeInput.value = nextColor; }
                applyGlobalPatch('lineStroke', nextColor);
              }
            },
            onThicknessChange: (nextValue, ctx) => {
              const next = Math.max(0, Number(nextValue) || 0);
              const scopedSeriesKey = resolveScopedSeriesKey(ctx);
              if(scopedSeriesKey){
                applySeriesPatch({ lineStrokeWidth: next }, scopedSeriesKey);
              }else{
                if(strokeWidthInput){ applyAndDispatch(strokeWidthInput, String(next)); }
                applyGlobalPatch('lineStrokeWidth', next);
              }
            },
            onTransparencyChange: (nextValue, ctx) => {
              const bounded = Math.min(100, Math.max(0, Number(nextValue) || 0));
              const normalized = bounded / 100;
              const scopedSeriesKey = resolveScopedSeriesKey(ctx);
              if(scopedSeriesKey){
                applySeriesPatch({ lineAlpha: normalized }, scopedSeriesKey);
              }else{
                if(alphaInput){ applyAndDispatch(alphaInput, String(normalized)); }
                if(alphaVal){ alphaVal.textContent = String(normalized); }
                applyGlobalPatch('lineAlpha', normalized);
              }
            }
          });
        }
        const clickedOverlayScopeRaw = target?.dataset?.lineOverlay;
        const hasClickedOverlayScope = typeof clickedOverlayScopeRaw === 'string' && clickedOverlayScopeRaw.trim() !== '';
        lineOverlayToolbarScope = hasClickedOverlayScope
          ? normalizeLineOverlayToolbarScope(clickedOverlayScopeRaw)
          : normalizeLineOverlayToolbarScope(lineOverlayToolbarScope);
        const overlaySeriesKeys = (() => {
          const activeSet = new Set();
          const addActive = value => {
            const normalized = normalizeLineOverlaySeriesKey(value);
            if(normalized){
              activeSet.add(normalized);
            }
          };
          const activeRegressionSummaries = getLineRegressionSummariesState(projectedLineSession || getLineProjectionTabId() || null);
          if(Array.isArray(activeRegressionSummaries)){
            activeRegressionSummaries.forEach(entry => addActive(entry?.name));
          }
          const plotHost = refs.plot || getLineNodeById('linePlot');
          if(plotHost && typeof plotHost.querySelectorAll === 'function'){
            plotHost.querySelectorAll('[data-series]').forEach(node => {
              addActive(node?.getAttribute?.('data-series') || node?.dataset?.series);
            });
          }
          addActive(seriesKey);
          if(activeSet.size === 0){
            orderedSeriesKeys().forEach(addActive);
          }
          const ordered = [];
          const pushOrdered = value => {
            const normalized = normalizeLineOverlaySeriesKey(value);
            if(!normalized || !activeSet.has(normalized)){
              return;
            }
            if(ordered.includes(normalized)){
              return;
            }
            ordered.push(normalized);
          };
          if(Array.isArray(lineSeriesGroupLabels)){
            lineSeriesGroupLabels.forEach(pushOrdered);
          }
          Array.from(activeSet).forEach(pushOrdered);
          return ordered;
        })();
        const overlayState = readLineOverlayControlState(getLineProjectionTabId() || null);
        const overlayTrendEnabled = !!overlayState.showTrendLine;
        const overlayConfidenceEnabled = !!overlayState.showIntervals;
        const overlayPredictionEnabled = !!overlayState.showPredictionIntervals;
        const hasOverlayEnabled = overlayTrendEnabled || overlayConfidenceEnabled || overlayPredictionEnabled;
        const overlayScopeOptions = (() => {
          const options = [{ value: 'global', label: 'Global' }];
          const appendOverlayOptions = (overlayKey, label) => {
            options.push({ value: overlayKey, label });
            overlaySeriesKeys.forEach(seriesName => {
              options.push({
                value: buildLineOverlaySeriesScopeValue(overlayKey, seriesName),
                label: `${label}: ${seriesName}`
              });
            });
          };
          if(overlayTrendEnabled){
            appendOverlayOptions('trend', 'Trend line');
          }
          if(overlayConfidenceEnabled){
            appendOverlayOptions('confidence', 'Confidence interval');
          }
          if(overlayPredictionEnabled){
            appendOverlayOptions('prediction', 'Prediction interval');
          }
          return options;
        })();
        const toColorInputValue = value => {
          const normalized = String(value || '').trim().toLowerCase();
          if(/^#([0-9a-f]{6})$/.test(normalized)){
            return normalized;
          }
          if(/^#([0-9a-f]{3})$/.test(normalized)){
            const hex = normalized.slice(1);
            return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
          }
          return '#000000';
        };
        const resolveOverlayPreviewColorForScope = (scope, style) => {
          const parsed = parseLineOverlayToolbarScope(scope);
          const scopedSeriesKey = parsed.mode === 'series'
            ? normalizeLineOverlaySeriesKey(parsed.seriesKey)
            : normalizeLineOverlaySeriesKey(seriesKey || target?.dataset?.series);
          const seriesContext = scopedSeriesKey
            ? { scope: 'series', scopeValue: 'series', scopeDataset: scopedSeriesKey, target }
            : { scope: 'global', scopeValue: 'global', scopeDataset: '', target };
          const lineColor = getPathColor(seriesContext);
          return resolveLineOverlayStrokeColor(style?.color, lineColor, strokeInput?.value || '#000000');
        };
        const clearInlineOverlayPanel = () => {
          if(!toolbarHost || !toolbarHost.querySelectorAll){
            return;
          }
          toolbarHost.querySelectorAll('.line-overlay-inline-panel').forEach(node => node.remove());
        };
        const ensureInlineOverlayPanel = () => {
          if(!toolbarHost || !toolbarHost.querySelectorAll){
            return null;
          }
          clearInlineOverlayPanel();
          const toolbarApi = Shared.getWorkspaceToolbarApi();
          const panelParts = toolbarApi.createSubPanel({
            panelClass: 'additional-line-controls-panel line-overlay-inline-panel',
            title: 'Overlay',
            rowClass: 'additional-line-controls-panel__row'
          });
          const panel = panelParts.panel;
          panel.dataset.lineOverlayPanel = '1';
          panelParts.title.classList.add('additional-line-controls-panel__title');
          const row = panelParts.row;
          const scopeSelect = doc.createElement('select');
          scopeSelect.className = 'additional-line-controls-panel__input additional-line-controls-panel__input--select';
          overlayScopeOptions.forEach(option => {
            const opt = doc.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            scopeSelect.appendChild(opt);
          });
          const scopeField = toolbarApi.createLabeledField({
            fieldClass: 'additional-line-controls-panel__field additional-line-controls-panel__field--scope',
            label: 'Scope',
            labelClass: 'additional-line-controls-panel__field-label',
            control: scopeSelect
          }).field;
          row.appendChild(scopeField);
          const styleControlParts = toolbarApi.createBorderStyleControl({
            chipTitle: 'Click to edit color. Use mouse wheel to adjust line thickness.',
            colorInputClass: 'shared-border-style-input additional-line-controls-panel__color-input'
          });
          const styleControl = styleControlParts.control;
          const styleChip = styleControlParts.chip;
          const styleChipPreview = styleControlParts.preview;
          const styleChipValue = styleControlParts.value;
          const colorInput = styleControlParts.colorInput;
          const styleFieldParts = toolbarApi.createLabeledField({
            fieldClass: 'additional-line-controls-panel__field additional-line-controls-panel__field--style',
            label: 'Line',
            labelClass: 'additional-line-controls-panel__field-label',
            control: styleControl
          });
          const styleField = styleFieldParts.field;
          const styleLabel = styleFieldParts.label;
          row.appendChild(styleField);
          const patternFieldParts = toolbarApi.createLinePatternField({
            fieldClass: 'additional-line-controls-panel__field additional-line-controls-panel__field--pattern',
            label: 'Line pattern',
            labelClass: 'additional-line-controls-panel__field-label',
            selectClass: 'additional-line-controls-panel__input additional-line-controls-panel__input--select',
            solidLabel: 'Continuous'
          });
          const patternField = patternFieldParts.field;
          const patternLabel = patternFieldParts.label;
          const patternSelect = patternFieldParts.select;
          row.appendChild(patternField);
          const transparencyParts = toolbarApi.createTransparencyControl({
            wrapClass: 'additional-line-controls-panel__range',
            inputClass: 'additional-line-controls-panel__transparency-input',
            inputAttrs: {
              min: '0',
              max: '100',
              step: '1'
            },
            valueClass: 'additional-line-controls-panel__range-value'
          });
          const transparencyWrap = transparencyParts.wrap;
          const transparencyInput = transparencyParts.input;
          const transparencyValue = transparencyParts.value;
          const transparencyFieldParts = toolbarApi.createLabeledField({
            fieldClass: 'additional-line-controls-panel__field additional-line-controls-panel__field--transparency',
            label: 'Line transparency',
            labelClass: 'additional-line-controls-panel__field-label',
            control: transparencyWrap
          });
          const transparencyField = transparencyFieldParts.field;
          const transparencyLabel = transparencyFieldParts.label;
          row.appendChild(transparencyField);
          const thicknessInput = doc.createElement('input');
          thicknessInput.type = 'number';
          thicknessInput.min = '0';
          thicknessInput.step = '0.5';
          thicknessInput.value = '0';
          thicknessInput.hidden = true;
          panel.appendChild(thicknessInput);
          const resolveScope = () => normalizeLineOverlayToolbarScope(scopeSelect.value || lineOverlayToolbarScope);
          const applyOverlayPatch = (patch, reason = 'overlay-style-change') => {
            const targets = getLineOverlayScopeTargets(resolveScope());
            targets.forEach(targetEntry => {
              updateLineOverlayStyle(targetEntry.key, patch, targetEntry.seriesKey);
            });
            scheduleLineViewRefresh(reason, { force: true, skipThresholdEvaluation: true });
          };
          const syncStyleChip = () => {
            const color = toColorInputValue(colorInput.value);
            const thickness = Math.max(0, Number(thicknessInput.value) || 0);
            styleChipPreview.style.background = color;
            const formatted = toolbarApi?.formatPxDisplayValue?.(thickness, thicknessInput.step)
              || toolbarApi?.formatNumericValue?.(thickness, thicknessInput.step, { maxPrecision: 2 })
              || String(Math.round(thickness * 100) / 100);
            styleChipValue.textContent = `${formatted}px`;
          };
          const syncOverlayInputs = () => {
            const normalizedScope = normalizeLineOverlayToolbarScope(scopeSelect.value || lineOverlayToolbarScope);
            const fallbackScope = (() => {
              const parsed = parseLineOverlayToolbarScope(normalizedScope);
              if(parsed.mode === 'series'){
                return parsed.overlayKey || 'global';
              }
              if(parsed.mode === 'overlay'){
                return parsed.overlayKey || 'global';
              }
              return 'global';
            })();
            const hasExactOption = Array.from(scopeSelect.options || []).some(opt => opt.value === normalizedScope && !opt.disabled);
            const hasFallbackOption = Array.from(scopeSelect.options || []).some(opt => opt.value === fallbackScope && !opt.disabled);
            const firstEnabledOption = Array.from(scopeSelect.options || []).find(opt => !opt.disabled);
            const nextScope = hasExactOption
              ? normalizedScope
              : (hasFallbackOption
                ? fallbackScope
                : (firstEnabledOption?.value || 'global'));
            scopeSelect.value = nextScope;
            const scope = resolveScope();
            lineOverlayToolbarScope = scope;
            const labels = getLineOverlayToolbarLabels(scope);
            styleLabel.textContent = labels.colorLabel || 'Line';
            patternLabel.textContent = labels.patternLabel || 'Line pattern';
            transparencyLabel.textContent = labels.transparencyLabel || 'Line transparency';
            const previewStyle = getLineOverlayPreviewStyle(scope) || getLineOverlayStyle('trend') || {};
            colorInput.value = toColorInputValue(resolveOverlayPreviewColorForScope(scope, previewStyle));
            thicknessInput.value = String(Math.max(0, Number(previewStyle.thickness) || 0));
            const patternValue = String(previewStyle.pattern || 'solid').toLowerCase();
            patternSelect.value = (patternValue === 'dashed' || patternValue === 'dotted' || patternValue === 'solid')
              ? patternValue
              : 'solid';
            const transparency = Math.min(100, Math.max(0, Number(previewStyle.transparency) || 0));
            transparencyInput.value = String(Math.round(transparency));
            transparencyValue.textContent = `${Math.round(transparency)}%`;
            syncStyleChip();
          };
          scopeSelect.value = normalizeLineOverlayToolbarScope(lineOverlayToolbarScope);
          scopeSelect.addEventListener('change', () => {
            syncOverlayInputs();
          });
          colorInput.addEventListener('input', () => {
            applyOverlayPatch({ color: colorInput.value }, 'overlay-color-input');
            syncOverlayInputs();
          });
          colorInput.addEventListener('change', () => {
            applyOverlayPatch({ color: colorInput.value }, 'overlay-color-input');
            syncOverlayInputs();
          });
          patternSelect.addEventListener('change', () => {
            applyOverlayPatch({ pattern: patternSelect.value }, 'overlay-pattern-change');
            syncOverlayInputs();
          });
          transparencyInput.addEventListener('input', () => {
            const bounded = Math.min(100, Math.max(0, Number(transparencyInput.value) || 0));
            applyOverlayPatch({ transparency: bounded }, 'overlay-transparency-change');
            transparencyValue.textContent = `${Math.round(bounded)}%`;
            syncStyleChip();
          });
          transparencyInput.addEventListener('change', () => {
            const bounded = Math.min(100, Math.max(0, Number(transparencyInput.value) || 0));
            applyOverlayPatch({ transparency: bounded }, 'overlay-transparency-change');
            syncOverlayInputs();
          });
          thicknessInput.addEventListener('input', () => {
            const bounded = Math.max(0, Number(thicknessInput.value) || 0);
            applyOverlayPatch({ thickness: bounded }, 'overlay-thickness-input');
            syncStyleChip();
          });
          thicknessInput.addEventListener('change', () => {
            syncOverlayInputs();
          });
          if(typeof toolbarApi.bindNumericWheelProxy === 'function'){
            toolbarApi.bindNumericWheelProxy(styleChip, thicknessInput);
          }
          styleChip.addEventListener('click', evt => {
            evt.preventDefault();
            evt.stopPropagation();
            if(typeof Shared.openColorPicker === 'function'){
              Shared.openColorPicker({
                anchor: styleChip,
                color: colorInput.value,
                element: colorInput,
                onInput(value){
                  colorInput.value = toColorInputValue(value);
                  colorInput.dispatchEvent(new Event('input', { bubbles: true }));
                },
                onChange(value){
                  colorInput.value = toColorInputValue(value);
                  colorInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
              });
              return;
            }
            colorInput.click();
          });
          syncOverlayInputs();
          toolbarHost.appendChild(panel);
          return panel;
        };
        clearInlineOverlayPanel();
        if(hasOverlayEnabled){
          ensureInlineOverlayPanel();
          toolbarHost.classList.add('font-toolbar-host--line-dual');
        }
        syncLineErrorBarToolbarControl(toolbarHost);
        if(markerScopeSelect){
          markerScopeSelect.addEventListener('change', () => {
            setLineScope(markerScopeSelect.value, {
              dispatchMarkerChange: false,
              scopeDataset: selectedScopeDataset(markerScopeSelect)
            });
            syncPathToolbar();
          });
        }
        syncPathToolbar();
      }
      return;
    }
    return;
  }

  function registerLineOverlayControlElement(element, overlayKey, seriesName){
    if(!element){
      return;
    }
    const safeKey = sanitizeLineOverlayKey(overlayKey);
    if(!safeKey){
      return;
    }
    const safeSeriesKey = normalizeLineOverlaySeriesKey(seriesName || element?.dataset?.series);
    const scopeValue = safeSeriesKey
      ? buildLineOverlaySeriesScopeValue(safeKey, safeSeriesKey)
      : safeKey;
    element.dataset.lineOverlay = scopeValue;
    element.dataset.lineOverlayKey = safeKey;
    if(!element.dataset.lineOverlayRole){
      element.dataset.lineOverlayRole = safeKey === 'trend' ? 'trend' : 'interval';
    }
    if(safeSeriesKey){
      element.dataset.series = safeSeriesKey;
    }
    element.style.cursor = 'pointer';
    if(!element.__lineOverlayToolbarClickHandler){
      const handler = evt => {
        try{ evt.stopPropagation(); }catch(e){}
        const clickedScope = normalizeLineOverlayToolbarScope(element.dataset.lineOverlay || scopeValue || safeKey);
        lineOverlayToolbarScope = clickedScope;
        showLinePointFormatControls(element);
      };
      element.addEventListener('click', handler);
      element.__lineOverlayToolbarClickHandler = handler;
    }
  }

  console.debug('Debug: line replicates initialized', {
    lineReplicates,
    min: LINE_MIN_REPLICATES,
    max: LINE_MAX_REPLICATES
  });
  console.debug('Debug: line forecast defaults', lineForecastOptions);

  const makeEditableHelper = (el,onChange,options) => {
    const fn = Shared.makeEditable || global.makeEditable;
    if (typeof fn === 'function') {
      return fn(el,onChange,options);
    }
    console.warn('line component makeEditable fallback missing');
    return undefined;
  };
  const ensureGraphViewport = Shared.graphViewport?.createEnsurer
    ? Shared.graphViewport.createEnsurer('line')
    : (svg, options = {}) => {
      const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
      if(typeof fn === 'function'){
        fn(svg, { component: 'line', debugLabel: 'line-viewport-fallback', ...options });
        return;
      }
      console.debug('Debug: line ensureGraphViewport helper missing', {
        hasShared: !!Shared,
        hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
      });
    };
  console.debug('Debug: line component DOM helpers resolved', {
    hasSharedEditable: typeof Shared.makeEditable === 'function',
    hasSharedResize: typeof Shared.graphViewport?.ensure === 'function' || typeof Shared.autoResizeSvg === 'function',
    hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
  }); // Debug: helper availability summary

  const markFontEditable = (node, role, key) => {
    if (!node) { return; }
    const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
    if (fontControls && typeof fontControls.markText === 'function') {
      fontControls.markText(node, { scopeId: 'line', role, key });
    }
    if (node.dataset) {
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'line';
      if (role) node.dataset.fontRole = role;
      if (key || role) node.dataset.fontKey = key || role;
    }
    if (!role || role.indexOf('Tick') === -1) {
      console.debug('Debug: line markFontEditable', payload); // Debug: font target tagging summary
    }
  };

  function formatP(p){
    if(p === undefined || p === null || Number.isNaN(p)) return 'n/a';
    if(!Number.isFinite(p)) return p>0?'Infinity':'-Infinity';
    const formatter = Shared.formatters?.formatPValue || Shared.formatPValue;
    const scientific = Shared.statsReporting?.getPValueFormatScientific?.({
      target: getActiveLineRefs().statsResults || null,
      tabId: getLineProjectionTabId() || null
    }) === true;
    if(typeof formatter === 'function'){
      return formatter(p, { scientific, forceScientific: scientific });
    }
    if(scientific){ return Shared.formatters?.formatScientificNumber?.(Number(p), { fractionalDigits: 5 }) || String(Number(p)); }
    if(p >= 0 && p <= 0.0001) return '<0.0001';
    return Number(p).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  function getLineStatsInferenceTabId(){
    return getLineProjectionTabId() || getLineActiveSessionForState()?.tabId || null;
  }

  function getLineStatsAlpha(){
    const alpha = Number(Shared.statsInference?.getAlpha?.({ tabId: getLineStatsInferenceTabId() }));
    return Number.isFinite(alpha) && alpha > 0 && alpha < 1
      ? alpha
      : (Shared.statsInference?.DEFAULT_ALPHA || 0.05);
  }

  function createLineInferenceSpec(){
    if(typeof Shared.statsInference?.createDecisionSpec === 'function'){
      return Shared.statsInference.createDecisionSpec({
        tabId: getLineStatsInferenceTabId(),
        criterion: 'alpha',
        method: 'none',
        valueKind: 'raw-p'
      });
    }
    return { criterion:'alpha', level:getLineStatsAlpha(), method:'none', valueKind:'raw-p' };
  }

  function lineInferencePValue(value){
    const numeric = Number(value);
    const fallback = Number.isFinite(numeric) ? String(formatP(numeric)) : '—';
    const inferenceSpec = createLineInferenceSpec();
    if(typeof Shared.statsReporting?.pValue === 'function'){
      return Shared.statsReporting.pValue(numeric, { fallback, inference: inferenceSpec });
    }
    return { type:'pValue', value:numeric, fallback, __statsInference:inferenceSpec };
  }

  function ensureLineStatsInferenceControls(){
    const host = getLineNodeById('lineStatsInferenceControls');
    if(!host || typeof Shared.statsInference?.mountControls !== 'function'){
      return null;
    }
    return Shared.statsInference.mountControls(host, {
      tabId: () => getLineStatsInferenceTabId(),
      includeOverall: true,
      includeComparisons: false,
      method: 'none',
      source: 'line-stats-inference',
      onChange: ({ key }) => {
        requestLineStatsContextRefresh(`stats-inference-${key}-change`);
      }
    });
  }

  function formatLinePExpression(value, options = {}){
    const reporting = Shared.statsReporting;
    if(reporting && typeof reporting.formatPValueExpression === 'function'){
      return reporting.formatPValueExpression(value, {
        label: options.label || 'p',
        operator: options.operator || '=',
        target: getActiveLineRefs().statsResults || null,
        tabId: getLineProjectionTabId() || null
      });
    }
    const display = String(formatP(value));
    const match = /^(<=|>=|≤|≥|<|>)\s*(.*)$/.exec(display);
    return match ? `${options.label || 'p'} ${match[1]} ${match[2]}` : `${options.label || 'p'} = ${display}`;
  }

  function getLineAssociationSymbol(method){
    return String(method || '').trim().toLowerCase().startsWith('spearman') ? 'rₛ' : 'r';
  }

  function lineStudentTTwoSidedPValue(t, df){
    const helper = Shared.stats?.studentTTwoSidedPValue;
    if(typeof helper === 'function'){
      const value = helper(t, df);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : NaN;
    }
    const cdf = global.jStat?.studentt?.cdf;
    return typeof cdf === 'function' ? Math.max(0, Math.min(1, 2 * (1 - cdf(Math.abs(t), df)))) : NaN;
  }

  function lineFUpperTailPValue(f, df1, df2){
    const helper = Shared.stats?.fUpperTail;
    if(typeof helper === 'function'){
      const value = helper(f, df1, df2);
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : NaN;
    }
    const cdf = global.jStat?.centralF?.cdf;
    return typeof cdf === 'function' ? Math.max(0, Math.min(1, 1 - cdf(f, df1, df2))) : NaN;
  }

  const formatMetricValue = (value, digits = 4) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a';

  function getLineRegressionModelInfo(mode){
    const safeMode = String(mode || 'linear').trim();
    return regressionTools && typeof regressionTools.getModelInfo === 'function'
      ? regressionTools.getModelInfo(safeMode)
      : null;
  }

  function getLineRegressionLabel(mode){
    const info = getLineRegressionModelInfo(mode);
    if(info?.label){
      return info.label;
    }
    const compact = String(mode || 'linear')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ');
    return compact.charAt(0).toUpperCase() + compact.slice(1);
  }

  function ensureLineRegressionSelectOptions(selectEl){
    if(!selectEl || typeof document === 'undefined'){
      return;
    }
    const models = regressionTools && typeof regressionTools.listModels === 'function'
      ? regressionTools.listModels().filter(model => model?.implemented)
      : [];
    if(!models.length){
      return;
    }
    const existingValues = new Set(Array.from(selectEl.options || []).map(option => String(option.value)));
    const familyHosts = new Map();
    Array.from(selectEl.querySelectorAll('optgroup')).forEach(group => {
      familyHosts.set(String(group.label || '').trim(), group);
    });
    const resolveFamilyHost = family => {
      const safeFamily = String(family || 'Other').trim() || 'Other';
      if(familyHosts.has(safeFamily)){
        return familyHosts.get(safeFamily);
      }
      const group = document.createElement('optgroup');
      group.label = safeFamily;
      selectEl.appendChild(group);
      familyHosts.set(safeFamily, group);
      return group;
    };
    const orderedModels = models.slice().sort((a, b) => {
      const familyA = LINE_REGRESSION_FAMILY_ORDER.indexOf(a.family);
      const familyB = LINE_REGRESSION_FAMILY_ORDER.indexOf(b.family);
      const rankA = familyA >= 0 ? familyA : LINE_REGRESSION_FAMILY_ORDER.length + 1;
      const rankB = familyB >= 0 ? familyB : LINE_REGRESSION_FAMILY_ORDER.length + 1;
      if(rankA !== rankB){
        return rankA - rankB;
      }
      return String(a.label || a.id).localeCompare(String(b.label || b.id));
    });
    orderedModels.forEach(model => {
      const value = String(model.id || '').trim();
      if(!value || existingValues.has(value)){
        return;
      }
      const option = document.createElement('option');
      option.value = value;
      option.textContent = model.label || value;
      resolveFamilyHost(model.family).appendChild(option);
      existingValues.add(value);
    });
  }

  function ensureLineRegressionSelection(){
    if(!refs.regressionMode){
      return;
    }
    ensureLineRegressionSelectOptions(refs.regressionMode);
    const currentValue = String(refs.regressionMode.value || 'linear').trim();
    if(currentValue && Array.from(refs.regressionMode.options || []).some(option => String(option.value) === currentValue)){
      return;
    }
    refs.regressionMode.value = 'linear';
  }

  const formatPercent = (value, digits = 2) => {
    if(!Number.isFinite(value)) return 'n/a';
    return `${(value * 100).toFixed(digits)}%`;
  };

  const clampForecastHorizon = (value) => {
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_FORECAST_HORIZON;
    const bounded = Math.max(1, Math.min(MAX_FORECAST_HORIZON, resolved));
    if(!Number.isFinite(numeric) || resolved !== bounded){
      lineDebug('Debug: clampForecastHorizon', { value, numeric, resolved, bounded });
    }
    return bounded;
  };

  const clampSeasonLength = (value) => {
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_FORECAST_SEASON;
    const bounded = Math.max(2, Math.min(60, resolved));
    if(!Number.isFinite(numeric) || resolved !== bounded){
      lineDebug('Debug: clampSeasonLength', { value, numeric, resolved, bounded });
    }
    return bounded;
  };

  function resolveForecastOptions(options = {}){
    const session = options.session || getLineActiveSessionForState();
    const next = { ...getLineForecastState(session) };
    const canReadForecastRefs = !session || isLineSessionActive(session);
    if(canReadForecastRefs && refs.forecastHorizon){
      next.horizon = clampForecastHorizon(refs.forecastHorizon.value);
    }
    if(canReadForecastRefs && refs.forecastSeasonLength){
      next.seasonLength = clampSeasonLength(refs.forecastSeasonLength.value);
    }
    if(canReadForecastRefs && refs.forecastAuto){
      next.autoTune = !!refs.forecastAuto.checked;
    }
    if(canReadForecastRefs && refs.forecastCriterion){
      const critRaw = String(refs.forecastCriterion.value || '').toLowerCase();
      next.criterion = critRaw === 'aic' ? 'aic' : 'bic';
    }
    const resolved = setLineForecastState(session, next, { reason: options.reason || 'line-forecast-options' });
    if(options.syncInputs && canReadForecastRefs){
      if(refs.forecastHorizon){
        refs.forecastHorizon.value = String(resolved.horizon);
      }
      if(refs.forecastSeasonLength){
        refs.forecastSeasonLength.value = String(resolved.seasonLength);
      }
      if(refs.forecastAuto){
        refs.forecastAuto.checked = !!resolved.autoTune;
      }
      if(refs.forecastCriterion){
        refs.forecastCriterion.value = resolved.criterion;
      }
    }
    console.debug('Debug: resolveForecastOptions', resolved);
    return { ...resolved };
  }

  function updateForecastVisibility(){
    const mode = refs.regressionMode?.value;
    const show = mode === 'arima' || mode === 'holtWinters';
    if(refs.forecastFieldset){
      refs.forecastFieldset.style.display = show ? '' : 'none';
    }
    return show;
  }

  // PART: ADVISOR
  function buildLineAdvisorContext(series, options = {}){
    const session = options.session || getLineActiveSessionForState();
    const lineRefs = resolveLineRefsContext(session, options);
    const arr=Array.isArray(series)?series:[];
    const context={
      seriesCount: arr.length,
      statsMethod: lineRefs.statType?.value || 'pearson',
      regressionMode: lineRefs.regressionMode?.value || 'linear',
      showIntervals: options?.showIntervals ?? isLineAnyIntervalEnabled(),
      showDiagnostics: options?.showDiagnostics ?? isLineDiagnosticsEnabled(),
      forecastOptions: options?.forecast || null
    };
    let totalPoints=0;
    let minLen=Infinity;
    let maxLen=0;
    let missingCount=0;
    const spacingCounts=new Map();
    const yValues=[];
    let xMin=Infinity,xMax=-Infinity;
    let yMin=Infinity,yMax=-Infinity;
    arr.forEach(entry=>{
      const pointList=Array.isArray(entry?.points)?entry.points:[];
      const valid=pointList.filter(Boolean);
      totalPoints+=valid.length;
      if(valid.length<minLen) minLen=valid.length;
      if(valid.length>maxLen) maxLen=valid.length;
      missingCount+=pointList.length-valid.length;
      const sorted=valid.slice().sort((a,b)=>a.x-b.x);
      for(let i=1;i<sorted.length;i++){
        const dx=sorted[i].x-sorted[i-1].x;
        if(Number.isFinite(dx) && dx>0){
          const rounded=Number(dx.toFixed(6));
          spacingCounts.set(rounded,(spacingCounts.get(rounded)||0)+1);
        }
      }
      valid.forEach(pt=>{
        if(Number.isFinite(pt.x)){
          if(pt.x<xMin) xMin=pt.x;
          if(pt.x>xMax) xMax=pt.x;
        }
        if(Number.isFinite(pt.y)){
          if(pt.y<yMin) yMin=pt.y;
          if(pt.y>yMax) yMax=pt.y;
          yValues.push(pt.y);
        }
      });
    });
    const spacingTotals=Array.from(spacingCounts.values());
    const spacingTotalCount=spacingTotals.reduce((sum,count)=>sum+count,0);
    const spacingMaxCount=Math.max(0,...spacingTotals);
    context.regularSpacing=spacingTotalCount>0 && spacingMaxCount/spacingTotalCount>=0.6;
    context.totalPoints=totalPoints;
    context.minLength=(totalPoints>0 && minLen!==Infinity)?minLen:0;
    context.maxLength=totalPoints>0?maxLen:0;
    context.avgLength=context.seriesCount>0?totalPoints/Math.max(context.seriesCount,1):0;
    context.hasUnequalLengths=context.seriesCount>1 && context.minLength!==context.maxLength;
    context.hasMissing=missingCount>0;
    context.xMin=Number.isFinite(xMin)?xMin:NaN;
    context.xMax=Number.isFinite(xMax)?xMax:NaN;
    context.yMin=Number.isFinite(yMin)?yMin:NaN;
    context.yMax=Number.isFinite(yMax)?yMax:NaN;
    context.yWithinZeroOne=Number.isFinite(context.yMin) && Number.isFinite(context.yMax) && context.yMin>=0 && context.yMax<=1;
    if(yValues.length>3){
      const mean=yValues.reduce((sum,val)=>sum+val,0)/yValues.length;
      const variance=yValues.reduce((sum,val)=>sum+Math.pow(val-mean,2),0)/Math.max(1,yValues.length-1);
      const std=Math.sqrt(Math.max(variance,0));
      context.yStd=std;
      context.yOutlierCount=std>0?yValues.reduce((count,val)=>count+(Math.abs((val-mean)/std)>3?1:0),0):0;
    }else{
      context.yStd=NaN;
      context.yOutlierCount=0;
    }
    context.currentDetail=context.showDiagnostics?'diagnostics':(context.showIntervals?'intervals':'minimal');
    context.regularSeasonHint=context.regularSpacing && context.maxLength>=12;
    context.hasForecastMode=['arima','holtWinters'].includes((lineRefs.regressionMode?.value || '').toLowerCase());
    return context;
  }

  function ensureLineAdvisorDefaults(context, session = null){
    const advisorState = getLineAdvisorState(session);
    const answers=advisorState.answers || {};
    if(!answers.measurement){
      if(context.yWithinZeroOne && context.totalPoints>0){
        answers.measurement='binaryOutcome';
      }else if(context.yOutlierCount>0 || !Number.isFinite(context.yStd) || context.yStd===0){
        answers.measurement='continuousNonNormal';
      }else{
        answers.measurement='continuousNormal';
      }
    }
    if(!answers.analysisGoal){
      const mode=(context.regressionMode||'').toLowerCase();
      if(mode==='arima' || mode==='holtwinters'){
        answers.analysisGoal='forecast';
      }else if(mode==='spline'){
        answers.analysisGoal='smooth';
      }else{
        answers.analysisGoal='trend';
      }
    }
    if((answers.analysisGoal||'trend')==='trend' && !answers.trendShape){
      const mode=(context.regressionMode||'').toLowerCase();
      if(mode==='quadratic' || mode==='cubic'){
        answers.trendShape='curved';
      }else if(mode==='logistic'){
        answers.trendShape='logistic';
      }else if(mode==='exponential'){
        answers.trendShape='exponential';
      }else if(mode==='power'){
        answers.trendShape='power';
      }else if(mode==='spline'){
        answers.trendShape='flexible';
      }else{
        answers.trendShape='linear';
      }
    }
    if(answers.analysisGoal==='smooth'){
      answers.trendShape='flexible';
    }
    if(answers.analysisGoal==='forecast' && !answers.seasonality){
      const mode=(context.regressionMode||'').toLowerCase();
      answers.seasonality=mode==='holtwinters'?'seasonal':'nonSeasonal';
    }
    if(!answers.detailLevel){
      answers.detailLevel=context.currentDetail || 'minimal';
    }
    advisorState.answers=answers;
    setLineAdvisorState(advisorState, session);
    return answers;
  }

  function buildLineAdvisorQuestions(context, answers){
    const resolvedAnswers=answers || {};
    const questions=[
      {
        id:'measurement',
        prompt:'How are the series measured?',
        help:'This choice determines whether Pearson or Spearman correlation is more appropriate.',
        options:[
          { value:'continuousNormal', label:'Continuous and roughly symmetric' },
          { value:'continuousNonNormal', label:'Continuous with skew/outliers' },
          { value:'ordinal', label:'Ordinal or ranked values' },
          { value:'binaryOutcome', label:'Binary or bounded (0–1) response' }
        ]
      },
      {
        id:'analysisGoal',
        prompt:'What is your primary analysis goal?',
        help:'Choose whether you need a descriptive trend, smoothing, or forecasting.',
        options:[
          { value:'trend', label:'Characterize the current trend/association' },
          { value:'forecast', label:'Forecast future values' },
          { value:'smooth', label:'Smooth complex fluctuations' }
        ]
      }
    ];
    const goal=resolvedAnswers.analysisGoal || 'trend';
    if(goal==='trend'){
      questions.push({
        id:'trendShape',
        prompt:'Which pattern best describes the trend?',
        help:'Select the regression family that matches your expected shape.',
        options:[
          { value:'linear', label:'Mostly linear change' },
          { value:'curved', label:'Single bend (quadratic/cubic)' },
          { value:'logistic', label:'S-shaped / saturating growth' },
          { value:'exponential', label:'Exponential growth or decay' },
          { value:'power', label:'Power-law (y ∝ xᵏ)' },
          { value:'flexible', label:'Allow multiple bends (spline)' }
        ]
      });
    }
    if(goal==='forecast'){
      questions.push({
        id:'seasonality',
        prompt:'Do you expect a repeating seasonal pattern?',
        help:'Seasonal data benefits from additive Holt–Winters point forecasting; otherwise a differenced autoregression may be considered.',
        options:[
          { value:'seasonal', label:'Yes, there is a recurring seasonal pattern' },
          { value:'nonSeasonal', label:'No, focus on trend without seasonality' }
        ]
      });
    }
    questions.push({
      id:'detailLevel',
      prompt:'How much model detail should accompany the lines?',
      help:'Controls whether interval shading and diagnostics are displayed.',
      options:[
        { value:'minimal', label:'Show fitted lines only' },
        { value:'intervals', label:'Include confidence/prediction intervals' },
        { value:'diagnostics', label:'Include intervals and diagnostics summary' }
      ]
    });
    return questions;
  }

  function computeLineAdvisorRecommendation(answers, context){
    const recommendation={
      ready:false,
      message:'',
      summary:'',
      rationale:[],
      warnings:[],
      statsMethod:context.statsMethod || 'pearson',
      regression:context.regressionMode || 'linear',
      showIntervals:context.showIntervals,
      showDiagnostics:context.showDiagnostics
    };
    if(!answers.measurement || !answers.analysisGoal || !answers.detailLevel ||
      (answers.analysisGoal==='trend' && !answers.trendShape) ||
      (answers.analysisGoal==='forecast' && !answers.seasonality)){
      recommendation.message='Answer the advisor questions to receive a recommendation.';
      return recommendation;
    }
    switch(answers.measurement){
      case 'continuousNormal':
        recommendation.statsMethod='pearson';
        recommendation.rationale.push('Pearson correlation suits continuous, roughly normal measurements.');
        break;
      case 'continuousNonNormal':
        recommendation.statsMethod='spearman';
        recommendation.rationale.push('Spearman correlation resists skew and outliers by ranking the data.');
        break;
      case 'ordinal':
        recommendation.statsMethod='spearman';
        recommendation.rationale.push('Ordinal data violates Pearson assumptions; Spearman works with ranks.');
        break;
      case 'binaryOutcome':
        recommendation.statsMethod='spearman';
        recommendation.rationale.push('Binary/bounded responses break Pearson’s normality assumption, so Spearman is safer.');
        break;
      default:
        break;
    }
    if(answers.analysisGoal==='forecast'){
      recommendation.regression=answers.seasonality==='seasonal'?'holtWinters':'arima';
      if(recommendation.regression==='holtWinters'){
        recommendation.rationale.push('Additive Holt–Winters captures recurring seasonal structure alongside trend and level; current intervals are approximate prediction bands.');
        if(!context.regularSpacing){
          recommendation.warnings.push('Holt–Winters assumes evenly spaced observations; verify spacing before forecasting.');
        }
        const seasonLength=context.forecastOptions?.seasonLength || 0;
        if(seasonLength>0 && context.maxLength < seasonLength*2){
          recommendation.warnings.push('Provide at least two full seasons of data for Holt–Winters to stabilize.');
        }
      }else{
        recommendation.rationale.push('The available differenced autoregression handles non-seasonal autoregressive patterns; it is not a full ARIMA(p,d,q) implementation.');
        if(context.avgLength<8){
          recommendation.warnings.push('Differenced autoregression is unstable with fewer than ~8 time points per series.');
        }
      }
    }else if(answers.analysisGoal==='smooth'){
      recommendation.regression='spline';
      recommendation.rationale.push('A spline smoother adapts to complex fluctuations without assuming a rigid parametric form.');
      if(context.avgLength<5){
        recommendation.warnings.push('Spline smoothing benefits from at least five observations per series.');
      }
    }else{
      switch(answers.trendShape){
        case 'linear':
          recommendation.regression='linear';
          recommendation.rationale.push('Linear regression summarizes straight-line trends across the series.');
          break;
        case 'curved':
          recommendation.regression='quadratic';
          recommendation.rationale.push('A quadratic polynomial captures single bends in the trajectory.');
          break;
        case 'logistic':
          recommendation.regression='logistic';
          recommendation.rationale.push('Logistic regression models saturating S-shaped growth.');
          if(!context.yWithinZeroOne){
            recommendation.warnings.push('Logistic regression expects a bounded 0–1 response; rescale or verify Y values.');
          }
          break;
        case 'exponential':
          recommendation.regression='exponential';
          recommendation.rationale.push('Exponential regression fits rapid growth or decay trajectories.');
          break;
        case 'power':
          recommendation.regression='power';
          recommendation.rationale.push('Power-law regression addresses allometric scaling relationships.');
          if(Number.isFinite(context.xMin) && context.xMin<=0){
            recommendation.warnings.push('Power-law models require positive X values; shift or filter non-positive points.');
          }
          break;
        case 'flexible':
          recommendation.regression='spline';
          recommendation.rationale.push('A spline regression handles multiple bends without overfitting high-degree polynomials.');
          break;
        default:
          break;
      }
    }
    switch(answers.detailLevel){
      case 'minimal':
        recommendation.showIntervals=false;
        recommendation.showDiagnostics=false;
        recommendation.rationale.push('Displaying only the fitted lines keeps the visualization uncluttered.');
        break;
      case 'intervals':
        recommendation.showIntervals=recommendation.regression!=='spline';
        recommendation.showDiagnostics=false;
        recommendation.rationale.push('Confidence/prediction intervals communicate model uncertainty.');
        if(recommendation.regression==='spline'){
          recommendation.warnings.push('Interval shading is unavailable for spline fits and will remain hidden.');
        }
        break;
      case 'diagnostics':
        recommendation.showIntervals=recommendation.regression!=='spline';
        recommendation.showDiagnostics=true;
        recommendation.rationale.push('Residual diagnostics help verify model assumptions for each series.');
        if(recommendation.regression==='spline'){
          recommendation.warnings.push('Interval shading is unavailable for spline fits and will remain hidden.');
        }
        break;
      default:
        break;
    }
    const methodLabel=recommendation.statsMethod==='pearson'?'Pearson correlation':'Spearman correlation';
    const regressionLabel = getLineRegressionLabel(recommendation.regression).toLowerCase();
    let summary=`${methodLabel} with ${regressionLabel}`;
    const extras=[];
    if(recommendation.showIntervals && recommendation.regression!=='spline'){
      extras.push('interval shading');
    }
    if(recommendation.showDiagnostics){
      extras.push('diagnostics summary');
    }
    if(extras.length){
      summary += ` plus ${extras.join(' and ')}`;
    }
    recommendation.summary=`${summary}.`;
    recommendation.ready=true;
    return recommendation;
  }

  function renderLineStatsAdvisor(series, options = {}, providedContext){
    const session = options.session || getLineActiveSessionForState();
    const lineRefs = resolveLineRefsContext(session, options);
    const container=lineRefs.statsAdvisor || lineRefs.root?.querySelector?.('#lineStatsAdvisor') || getLineNodeById('lineStatsAdvisor');
    if(!container){
      return;
    }
    const advisorState = getLineAdvisorState(session);
    const context=providedContext || buildLineAdvisorContext(series||[], { ...(options || {}), session });
    advisorState.context=context;
    const answers=ensureLineAdvisorDefaults(context, session);
    const recommendation=computeLineAdvisorRecommendation(answers, context);
    const sharedAdvisorUi = Shared.statsUi;
    if(sharedAdvisorUi && typeof sharedAdvisorUi.renderAdvisorPanel==='function'){
      sharedAdvisorUi.renderAdvisorPanel({
        container,
        state: advisorState,
        title: 'Statistics advisor',
        inactiveMessage: 'Press the "Guide me" button to view advisor recommendations.',
        recommendation,
        answers,
        questions: advisorState.open ? buildLineAdvisorQuestions(context, answers) : [],
        namePrefix: 'line-advisor',
        onToggle: (nextOpen)=>{
          advisorState.open=!!nextOpen;
          if(advisorState.open && !advisorState.activated){
            advisorState.activated=true;
            console.debug('Debug: line statsAdvisor activated');
          }
          setLineAdvisorState(advisorState, session);
          console.debug('Debug: line statsAdvisor toggled',{ open:advisorState.open });
          renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
        },
        onAnswerChange: (question, value)=>{
          answers[question.id]=value;
          advisorState.answers=answers;
          setLineAdvisorState(advisorState, session);
          console.debug('Debug: line statsAdvisor answer change',{ question:question.id, value });
          renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
        },
        onApply: ()=>{
          if(!recommendation.ready){
            return;
          }
          if(lineRefs.statType){
            lineRefs.statType.value=recommendation.statsMethod;
          }
          if(lineRefs.regressionMode){
            lineRefs.regressionMode.value=recommendation.regression;
          }
          if(lineRefs.showIntervals){
            lineRefs.showIntervals.checked=!!recommendation.showIntervals;
          }
          if(lineRefs.showPredictionIntervals){
            lineRefs.showPredictionIntervals.checked=!!recommendation.showIntervals;
          }
          updateForecastVisibility();
          advisorState.lastApplied={ ...recommendation };
          setLineAdvisorState(advisorState, session);
          console.debug('Debug: line statsAdvisor applied',{
            statsMethod:recommendation.statsMethod,
            regression:recommendation.regression,
            showIntervals:recommendation.showIntervals,
            showDiagnostics:recommendation.showDiagnostics,
            answers:{ ...answers }
          });
          scheduleLineDrawForSession(session, { reason: 'line-advisor-applied' });
          renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
        },
        onReset: ()=>{
          advisorState.answers={};
          setLineAdvisorState(advisorState, session);
          console.debug('Debug: line statsAdvisor reset');
          renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
        }
      });
      return;
    }
    container.innerHTML='';
    const wrapper=document.createElement('div');
    wrapper.className='stats-advisor';
    wrapper.dataset.open=advisorState.open?'1':'0';
    const header=document.createElement('div');
    header.className='stats-advisor__header';
    const title=document.createElement('strong');
    title.textContent='Test advisor';
    header.appendChild(title);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='stats-advisor__toggle';
    toggle.textContent=advisorState.open?'Hide advisor':'Guide me';
    toggle.addEventListener('click',()=>{
      advisorState.open=!advisorState.open;
      if(advisorState.open && !advisorState.activated){
        advisorState.activated=true;
        console.debug('Debug: line statsAdvisor activated');
      }
      setLineAdvisorState(advisorState, session);
      console.debug('Debug: line statsAdvisor toggled',{ open:advisorState.open });
      renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
    });
    header.appendChild(toggle);
    wrapper.appendChild(header);
    const summary=document.createElement('div');
    summary.className='stats-advisor__summary';
    if(!advisorState.activated){
      const message=document.createElement('div');
      message.textContent='Press the "Guide me" button to view advisor recommendations.';
      summary.appendChild(message);
    }else if(recommendation.ready){
      const summaryLine=document.createElement('div');
      summaryLine.className='stats-advisor__summary-line';
      summaryLine.textContent=`Recommendation: ${recommendation.summary}`;
      summary.appendChild(summaryLine);
      if(Array.isArray(recommendation.rationale) && recommendation.rationale.length){
        const list=document.createElement('ul');
        list.className='stats-advisor__rationale';
        recommendation.rationale.forEach(item=>{
          const li=document.createElement('li');
          li.textContent=item;
          list.appendChild(li);
        });
        summary.appendChild(list);
      }
      if(Array.isArray(recommendation.warnings) && recommendation.warnings.length){
        const warnTitle=document.createElement('div');
        warnTitle.className='stats-advisor__warnings-title';
        warnTitle.textContent='Cautions:';
        summary.appendChild(warnTitle);
        const warnList=document.createElement('ul');
        warnList.className='stats-advisor__warnings';
        recommendation.warnings.forEach(item=>{
          const li=document.createElement('li');
          li.textContent=item;
          warnList.appendChild(li);
        });
        summary.appendChild(warnList);
      }
    }else{
      const message=document.createElement('div');
      message.textContent=recommendation.message || 'Answer the advisor questions to receive a recommendation.';
      summary.appendChild(message);
    }
    wrapper.appendChild(summary);
    if(advisorState.open){
      const questionsWrap=document.createElement('div');
      questionsWrap.className='stats-advisor__questions';
      const questions=buildLineAdvisorQuestions(context, answers);
      questions.forEach(question=>{
        const fieldset=document.createElement('fieldset');
        fieldset.className='stats-advisor__question';
        const legend=document.createElement('legend');
        legend.textContent=question.prompt;
        fieldset.appendChild(legend);
        if(question.help){
          const hint=document.createElement('p');
          hint.className='stats-advisor__hint';
          hint.textContent=question.help;
          fieldset.appendChild(hint);
        }
        (question.options||[]).forEach(option=>{
          const label=document.createElement('label');
          label.className='stats-advisor__option';
          const input=document.createElement('input');
          input.type='radio';
          input.name=`line-advisor-${question.id}`;
          input.value=option.value;
          input.checked=answers[question.id]===option.value;
          input.addEventListener('change',()=>{
            answers[question.id]=option.value;
            advisorState.answers=answers;
            setLineAdvisorState(advisorState, session);
            console.debug('Debug: line statsAdvisor answer change',{ question:question.id, value:option.value });
            renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
          });
          const span=document.createElement('span');
          span.textContent=option.label;
          label.appendChild(input);
          label.appendChild(span);
          fieldset.appendChild(label);
        });
        questionsWrap.appendChild(fieldset);
      });
      wrapper.appendChild(questionsWrap);
      const actions=document.createElement('div');
      actions.className='stats-advisor__actions';
      const applyBtn=document.createElement('button');
      applyBtn.type='button';
      applyBtn.textContent='Apply recommendation';
      applyBtn.disabled=!recommendation.ready;
      applyBtn.addEventListener('click',()=>{
        if(!recommendation.ready){
          return;
        }
        if(lineRefs.statType){
          lineRefs.statType.value=recommendation.statsMethod;
        }
        if(lineRefs.regressionMode){
          lineRefs.regressionMode.value=recommendation.regression;
        }
        if(lineRefs.showIntervals){
          lineRefs.showIntervals.checked=!!recommendation.showIntervals;
        }
        if(lineRefs.showPredictionIntervals){
          lineRefs.showPredictionIntervals.checked=!!recommendation.showIntervals;
        }
        updateForecastVisibility();
        advisorState.lastApplied={ ...recommendation };
        setLineAdvisorState(advisorState, session);
        console.debug('Debug: line statsAdvisor applied',{
          statsMethod:recommendation.statsMethod,
          regression:recommendation.regression,
          showIntervals:recommendation.showIntervals,
          showDiagnostics:recommendation.showDiagnostics,
          answers:{ ...answers }
        });
        scheduleLineDrawForSession(session, { reason: 'line-advisor-applied' });
        renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
      });
      actions.appendChild(applyBtn);
      const resetBtn=document.createElement('button');
      resetBtn.type='button';
      resetBtn.className='stats-advisor__reset';
      resetBtn.textContent='Reset answers';
      resetBtn.addEventListener('click',()=>{
        advisorState.answers={};
        setLineAdvisorState(advisorState, session);
        console.debug('Debug: line statsAdvisor reset');
        renderLineStatsAdvisor(null, { ...options, session, refs: lineRefs }, advisorState.context);
      });
      actions.appendChild(resetBtn);
      wrapper.appendChild(actions);
    }
    container.appendChild(wrapper);
  }

  function clampLineReplicateCount(raw){
    const numeric = Number(raw);
    const resolved = Number.isFinite(numeric) ? Math.round(numeric) : LINE_MIN_REPLICATES;
    const bounded = Math.min(LINE_MAX_REPLICATES, Math.max(LINE_MIN_REPLICATES, resolved));
    if(!Number.isFinite(numeric) || resolved !== bounded){
      lineDebug('Debug: clampLineReplicateCount',{ raw, numeric, resolved, bounded });
    }
    return bounded;
  }

  function inferSeriesBaseName(label, fallback){
    if(label == null) return fallback;
    const raw = String(label).trim();
    if(!raw) return fallback;
    const cleaned = raw
      .replace(/\s*[—–:-]\s*subject\s*#?\d+$/i,'')
      .replace(/\s*\(?(?:rep(?:licate)?|r)\s*#?\d+\)?$/i,'')
      .replace(/\s*[:\-]\s*(?:rep(?:licate)?|r)\s*#?\d+$/i,'')
      .replace(/\s*(?:rep(?:licate)?|r)\s*#?\d+$/i,'')
      .replace(/\s*[:\-]\s*y\d+$/i,'')
      .replace(/\s*y\d+$/i,'')
      .replace(/\s+title$/i,'')
      .trim();
    const result = cleaned || fallback;
    lineDebug('Debug: inferSeriesBaseName',{ label: raw, result, fallback });
    return result;
  }

  function resolveLineSeriesAnchorColumnIndex(seriesIndex, options = {}){
    const idx = Number(seriesIndex);
    if(!Number.isInteger(idx) || idx < 0){
      return null;
    }
    if(options.viewMode === '3d'){
      return 1 + idx * 2;
    }
    const replicates = Math.max(
      LINE_MIN_REPLICATES,
      clampLineReplicateCount(options.replicates ?? lineReplicates)
    );
    return 1 + idx * replicates;
  }

  function resolveLine2dSeriesLabelsFromHeader(headerRow, seriesCount, options = {}){
    const header = Array.isArray(headerRow) ? headerRow : [];
    const replicates = Math.max(
      LINE_MIN_REPLICATES,
      clampLineReplicateCount(options.replicates ?? lineReplicates)
    );
    const inferredCount = Math.max(0, Math.ceil(Math.max(0, header.length - 1) / Math.max(replicates, 1)));
    const total = Math.max(0, Number.isInteger(seriesCount) ? seriesCount : inferredCount);
    const labels = new Array(total);
    for(let s = 0; s < total; s += 1){
      const fallback = `Series ${s + 1}`;
      const anchorCol = resolveLineSeriesAnchorColumnIndex(s, { replicates });
      const rawLabel = Number.isInteger(anchorCol) && anchorCol < header.length ? header[anchorCol] : fallback;
      labels[s] = inferSeriesBaseName(rawLabel, fallback);
    }
    return labels;
  }

  function countLineSeriesLabels(labels){
    const counts = new Map();
    (Array.isArray(labels) ? labels : []).forEach(label => {
      const key = label == null ? '' : String(label).trim();
      if(!key){ return; }
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function resolveLineSeriesLabelRenames(previousLabels, nextLabels){
    const previous = Array.isArray(previousLabels) ? previousLabels : [];
    const next = Array.isArray(nextLabels) ? nextLabels : [];
    if(previous.length !== next.length){
      // A structural insert/remove changes positional indices. Label-keyed
      // styles stay attached to their labels and must not be treated as renames.
      return [];
    }
    const previousCounts = countLineSeriesLabels(previous);
    const nextCounts = countLineSeriesLabels(next);
    const renames = [];
    for(let index = 0; index < previous.length; index += 1){
      const from = previous[index] == null ? '' : String(previous[index]).trim();
      const to = next[index] == null ? '' : String(next[index]).trim();
      if(!from || !to || from === to){
        continue;
      }
      // A genuine rename removes one unique old label and introduces one unique
      // new label. Reorders reuse existing labels elsewhere and are skipped.
      if(previousCounts.get(from) !== 1 || nextCounts.get(to) !== 1){
        continue;
      }
      if(nextCounts.has(from) || previousCounts.has(to)){
        continue;
      }
      renames.push({ from, to });
    }
    return renames;
  }

  function migrateLineSeriesLabelKeys(session, renames, reason = 'line-series-label-style-rename'){
    const mappings = Array.isArray(renames)
      ? renames.filter(item => item?.from && item?.to && item.from !== item.to)
      : [];
    if(!mappings.length){
      return false;
    }
    const owner = resolveLineStateSession(session);
    const labelsState = getLineLabelsState(owner);
    const stylesState = getLineStylesState(owner);
    const sourceColors = cloneLineRuntimeValue(labelsState.colors, {}) || {};
    const sourceSeries = cloneLineRuntimeValue(stylesState.series, {}) || {};
    const nextColors = cloneLineRuntimeValue(sourceColors, {}) || {};
    const nextSeries = cloneLineRuntimeValue(sourceSeries, {}) || {};
    let changed = false;

    mappings.forEach(({ from, to }) => {
      if(Object.prototype.hasOwnProperty.call(sourceColors, from)){
        if(!Object.prototype.hasOwnProperty.call(sourceColors, to)){
          nextColors[to] = sourceColors[from];
        }
        delete nextColors[from];
        changed = true;
      }
      if(Object.prototype.hasOwnProperty.call(sourceSeries, from)){
        if(!Object.prototype.hasOwnProperty.call(sourceSeries, to)){
          nextSeries[to] = cloneLineRuntimeValue(sourceSeries[from], {}) || {};
        }
        delete nextSeries[from];
        changed = true;
      }
    });

    if(!changed){
      return false;
    }
    patchLineLabelsState(owner, { colors: nextColors }, { reason });
    patchLineStylesState(owner, { series: nextSeries }, { reason });
    return true;
  }

  function syncLineSeriesLabelState(nextLabels, options = {}){
    const owner = resolveLineStateSession(
      options.session
      || getLineProjectionSession({ reason: 'line-series-label-sync-owner' }, { create: false })
      || getLineActiveSessionForState()
    );
    const groupedState = getLineGroupedState(owner);
    const previous = Array.isArray(groupedState.labels) ? groupedState.labels.slice() : [];
    const next = Array.isArray(nextLabels)
      ? nextLabels.map((label, idx) => {
          const fallback = `Series ${idx + 1}`;
          const trimmed = label == null ? '' : String(label).trim();
          return trimmed || fallback;
        })
      : [];
    const maxCount = Math.max(previous.length, next.length);
    let changed = previous.length !== next.length;
    for(let idx = 0; idx < maxCount; idx += 1){
      const prevLabel = previous[idx] == null ? '' : String(previous[idx]).trim();
      const nextLabel = next[idx] == null ? '' : String(next[idx]).trim();
      if(prevLabel !== nextLabel){
        changed = true;
      }
    }
    if(!changed){
      return false;
    }
    if(options.migrateStyles !== false){
      migrateLineSeriesLabelKeys(
        owner,
        resolveLineSeriesLabelRenames(previous, next),
        options.reason || 'line-series-label-style-rename'
      );
    }
    patchLineGroupedState(owner, { labels: next }, { reason: options.reason || 'line-series-label-sync' });
    lineDebug('Debug: line series labels synced', {
      reason: options.reason || null,
      previous,
      next
    });
    if(options.refreshControls === true && lineReplicates > LINE_MIN_REPLICATES && isLineGroupedModeActive()){
      renderLineGroupedList();
    }
    return true;
  }

  function getLineTableFormatForSession(session = null, options = {}){
    if(options.forceGrouped === true){
      return 'grouped';
    }
    if(options.forceGrouped === false){
      return 'single';
    }
    const shaped = ensureLineSessionOwnershipShape(session);
    const rawControls = shaped?.state?.controls && typeof shaped.state.controls === 'object'
      ? shaped.state.controls
      : null;
    const rawTableFormat = String(rawControls?.tableFormat || '').toLowerCase();
    const rawViewMode = String(rawControls?.viewMode || shaped?.state?.viewState?.viewMode || '').toLowerCase();
    if(rawViewMode === '3d' || rawTableFormat === '3d'){
      return '3d';
    }
    if(rawTableFormat === 'grouped'){
      return 'grouped';
    }
    if(rawTableFormat === 'single'){
      return 'single';
    }
    const controls = getLineRuntimeControlsForSession(shaped, lineFallbackRuntimeControls);
    const viewMode = String(controls.viewMode || shaped?.state?.viewState?.viewMode || '2d').toLowerCase() === '3d' ? '3d' : '2d';
    if(viewMode === '3d' || controls.tableFormat === '3d'){
      return '3d';
    }
    if(controls.tableFormat === 'grouped'){
      return 'grouped';
    }
    const groupedState = getLineGroupedState(shaped);
    return Number(groupedState?.replicates) > LINE_MIN_REPLICATES ? 'grouped' : 'single';
  }

  function getLineTableFormatForHot(hotInstance = null, options = {}){
    if(options.force3d === true){
      return '3d';
    }
    if(options.forceGrouped === true){
      return 'grouped';
    }
    if(options.forceGrouped === false){
      return 'single';
    }
    if(typeof options.tableFormat === 'string' && options.tableFormat){
      const requested = String(options.tableFormat).toLowerCase();
      if(requested === '3d' || requested === 'grouped' || requested === 'single'){
        return requested;
      }
    }
    const hotTabId = String(
      hotInstance?.__lineTabId
      || resolveLineTabIdFromNode(hotInstance?.__lineHostContainer || hotInstance?.rootElement || null)
      || ''
    ).trim();
    if(hotTabId){
      const session = getLineSession(hotTabId, {
        ...(options || {}),
        tabId: hotTabId,
        reason: options.reason || 'line-hot-table-format-session'
      }, { create: false });
      if(session){
        return getLineTableFormatForSession(session, options);
      }
      if(hotInstance?.__lineTableFormat && String(hotInstance.__lineTableFormatTabId || '') === String(hotTabId)){
        const tableFormat = String(hotInstance.__lineTableFormat).toLowerCase();
        return tableFormat === 'grouped' ? 'grouped' : (tableFormat === '3d' ? '3d' : 'single');
      }
    }
    const activeSession = getLineActiveSessionForState();
    if(activeSession){
      return getLineTableFormatForSession(activeSession, options);
    }
    const domFormat = String(refs.replicateMode?.value || '').toLowerCase();
    if(getLineViewState().viewMode === '3d' || domFormat === '3d'){
      return '3d';
    }
    return domFormat === 'grouped' || lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single';
  }

  function stampLineHotTableFormat(hotInstance, tableFormat, options = {}){
    const hot = hotInstance || null;
    if(!hot){
      return null;
    }
    const normalized = String(tableFormat || '').toLowerCase() === '3d'
      ? '3d'
      : (String(tableFormat || '').toLowerCase() === 'grouped' ? 'grouped' : 'single');
    const hotTabId = String(
      hot.__lineTabId
      || resolveLineTabIdFromNode(hot.__lineHostContainer || hot.rootElement || null)
      || ''
    ).trim() || null;
    hot.__lineTableFormat = normalized;
    hot.__lineTableFormatTabId = hotTabId;
    if(options.patchSession !== false && hotTabId){
      const session = getLineSession(hotTabId, {
        tabId: hotTabId,
        reason: options.reason || 'line-hot-table-format-stamp'
      }, { create: false });
      if(session){
        const current = getLineRuntimeControlsForSession(session, lineFallbackRuntimeControls);
        const viewState = getLineViewState(session);
        setLineRuntimeControlsForSession(session, {
          ...current,
          tableFormat: normalized,
          viewMode: normalized === '3d' ? '3d' : '2d'
        }, { reason: options.reason || 'line-hot-table-format-stamp' });
        if(normalized === '3d'){
          viewState.viewMode = '3d';
        }else if(viewState?.viewMode === '3d'){
          viewState.viewMode = '2d';
        }
      }
    }
    return normalized;
  }

  function getLineGroupedReplicateCount(options = {}){
    let candidate = options.replicates ?? null;
    const hotTabId = String(
      options.hotInstance?.__lineTabId
      || resolveLineTabIdFromNode(options.hotInstance?.__lineHostContainer || options.hotInstance?.rootElement || null)
      || ''
    ).trim();
    if(candidate == null && hotTabId){
      const session = getLineSession(hotTabId, {
        tabId: hotTabId,
        reason: options.reason || 'line-hot-grouped-replicates'
      }, { create: false });
      candidate = getLineGroupedState(session)?.replicates ?? null;
    }
    candidate = candidate ?? getLineGroupedState(getLineActiveSessionForState())?.replicates ?? lineReplicates;
    return Math.max(LINE_MIN_REPLICATES, clampLineReplicateCount(candidate));
  }

  function syncLineSeriesGroupLabelsFromHeader(hotInstance, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(getLineTableFormatForHot(hot, options) === '3d'){
      return false;
    }
    const headerRow = Array.isArray(options.headerRow)
      ? options.headerRow
      : (Array.isArray(hot?.getData?.()) ? hot.getData()[0] : []);
    if(!Array.isArray(headerRow)){
      return false;
    }
    const replicates = getLineGroupedReplicateCount({ ...options, hotInstance: hot });
    const countFromCols = Number.isFinite(options.colCount)
      ? Math.max(0, Math.ceil(Math.max(0, Number(options.colCount) - 1) / Math.max(replicates, 1)))
      : Math.max(0, Math.ceil(Math.max(0, headerRow.length - 1) / Math.max(replicates, 1)));
    const nextLabels = resolveLine2dSeriesLabelsFromHeader(
      headerRow,
      Number.isInteger(options.seriesCount) ? options.seriesCount : countFromCols,
      { replicates }
    );
    const owner = hot
      ? getLineSessionForHot(hot, { reason: options.reason || 'table-header' }, { create: false })
      : getLineActiveSessionForState();
    return syncLineSeriesLabelState(nextLabels, {
      reason: options.reason || 'table-header',
      refreshControls: options.refreshControls === true,
      session: owner || null
    });
  }

  function isLineGroupedModeActive(hotInstance = null, options = {}){
    return getLineTableFormatForHot(hotInstance, options) === 'grouped';
  }

  // Single-series colors/styles are keyed by label, while marker shapes are
  // indexed by physical series position. Structural table edits therefore
  // move only the positional shape sequence and refresh the owning labels.
  function normalizeLineSeriesShapeSequence(shapes, count){
    const safeCount = Math.max(0, Math.floor(Number(count) || 0));
    const source = Array.isArray(shapes) ? shapes : [];
    return Array.from({ length: safeCount }, (_unused, index) => sanitizeLineGroupShape(source[index], index));
  }

  function resolveLineSingleSeriesLabelsFromHot(hotInstance, seriesCount){
    const matrix = hotInstance && typeof hotInstance.getData === 'function' ? hotInstance.getData() : [];
    const header = Array.isArray(matrix?.[0]) ? matrix[0] : [];
    return resolveLine2dSeriesLabelsFromHeader(header, Math.max(0, Number(seriesCount) || 0), { replicates: LINE_MIN_REPLICATES });
  }

  function getLineColumnIdentityHistory(hotInstance){
    if(!hotInstance || typeof hotInstance !== 'object'){
      return null;
    }
    if(!hotInstance.__lineColumnIdentityHistory || typeof hotInstance.__lineColumnIdentityHistory !== 'object'){
      hotInstance.__lineColumnIdentityHistory = { deletions: [] };
    }
    if(!Array.isArray(hotInstance.__lineColumnIdentityHistory.deletions)){
      hotInstance.__lineColumnIdentityHistory.deletions = [];
    }
    return hotInstance.__lineColumnIdentityHistory;
  }

  function findLineColumnDeletionHistoryEntry(hotInstance, startIndex, count, status, direction = 'backward'){
    const history = getLineColumnIdentityHistory(hotInstance);
    if(!history){
      return null;
    }
    const start = Math.max(0, Math.floor(Number(startIndex) || 0));
    const length = Math.max(0, Math.floor(Number(count) || 0));
    const entries = history.deletions;
    const first = direction === 'forward' ? 0 : entries.length - 1;
    const limit = direction === 'forward' ? entries.length : -1;
    const step = direction === 'forward' ? 1 : -1;
    for(let index = first; index !== limit; index += step){
      const entry = entries[index];
      if(entry?.status === status && entry.start === start && entry.count === length){
        return entry;
      }
    }
    return null;
  }

  function captureLineDeletedSeriesIdentity(owner, seriesStart, count){
    const start = Math.max(0, Math.floor(Number(seriesStart) || 0));
    const length = Math.max(0, Math.floor(Number(count) || 0));
    const grouped = getLineGroupedState(owner);
    const labels = (Array.isArray(grouped.labels) ? grouped.labels : []).slice(start, start + length);
    const shapes = normalizeLineSeriesShapeSequence(grouped.shapes, Math.max(start + length, Array.isArray(grouped.shapes) ? grouped.shapes.length : 0))
      .slice(start, start + length);
    const colorSource = getLineLabelsState(owner).colors || {};
    const styleSource = getLineStylesState(owner).series || {};
    const colors = {};
    const seriesStyles = {};
    labels.forEach(label => {
      const key = label == null ? '' : String(label).trim();
      if(!key){
        return;
      }
      if(Object.prototype.hasOwnProperty.call(colorSource, key)){
        colors[key] = colorSource[key];
      }
      if(Object.prototype.hasOwnProperty.call(styleSource, key)){
        seriesStyles[key] = cloneLineRuntimeValue(styleSource[key], {}) || {};
      }
    });
    return { labels, shapes, colors, seriesStyles };
  }

  function restoreLineDeletedSeriesLabelStyles(owner, snapshot){
    const saved = snapshot && typeof snapshot === 'object' ? snapshot : null;
    if(!saved){
      return false;
    }
    const currentLabels = getLineLabelsState(owner);
    const nextColors = cloneLineRuntimeValue(currentLabels.colors, {}) || {};
    Object.entries(saved.colors || {}).forEach(([key, value]) => {
      nextColors[key] = value;
    });
    const currentStyles = getLineStylesState(owner);
    const nextSeries = cloneLineRuntimeValue(currentStyles.series, {}) || {};
    Object.entries(saved.seriesStyles || {}).forEach(([key, value]) => {
      nextSeries[key] = cloneLineRuntimeValue(value, {}) || {};
    });
    patchLineLabelsState(owner, { colors: nextColors }, { reason: 'line-dataset-column-delete-undo-colors' });
    patchLineStylesState(owner, { series: nextSeries }, { reason: 'line-dataset-column-delete-undo-styles' });
    return true;
  }

  function remapLineSingleSeriesStructureForColumnSplice(hotInstance, startIndex, deleteCount, insertCount, source){
    if(!hotInstance || getLineTableFormatForHot(hotInstance, { reason: 'line-column-structure-style-remap' }) !== 'single'){
      return false;
    }
    const owner = getLineSessionForHot(hotInstance, { reason: 'line-column-structure-style-remap' }, { create: false, fallbackActive: false });
    if(!owner){
      return false;
    }
    const grouped = getLineGroupedState(owner);
    const storedCount = Math.max(
      Array.isArray(grouped.labels) ? grouped.labels.length : 0,
      Array.isArray(grouped.shapes) ? grouped.shapes.length : 0
    );
    const nextSeriesCount = Math.max(0, (Number(hotInstance.countCols?.()) || 0) - 1);
    const rawRemoveCount = Math.max(0, Math.floor(Number(deleteCount) || 0));
    const rawAddCount = Math.max(0, Math.floor(Number(insertCount) || 0));
    const fallbackPreviousCount = Math.max(0, nextSeriesCount + rawRemoveCount - rawAddCount);
    const previousCount = storedCount || fallbackPreviousCount;
    const seriesStart = Math.max(0, Math.min(previousCount, Math.floor(Number(startIndex) || 0) - 1));

    if(source === 'header-menu' && rawRemoveCount > 0){
      const history = getLineColumnIdentityHistory(hotInstance);
      if(history){
        history.deletions = history.deletions.filter(entry => entry?.status !== 'undone');
        history.deletions.push({
          start: Math.max(0, Math.floor(Number(startIndex) || 0)),
          count: rawRemoveCount,
          snapshot: captureLineDeletedSeriesIdentity(owner, seriesStart, rawRemoveCount),
          status: 'applied'
        });
      }
    }

    const nextShapes = normalizeLineSeriesShapeSequence(grouped.shapes, previousCount);
    const insertedShapes = Array.from({ length: rawAddCount }, (_unused, offset) => sanitizeLineGroupShape(null, seriesStart + offset));
    nextShapes.splice(seriesStart, rawRemoveCount, ...insertedShapes);
    const normalizedShapes = normalizeLineSeriesShapeSequence(nextShapes, nextSeriesCount);
    const nextLabels = resolveLineSingleSeriesLabelsFromHot(hotInstance, nextSeriesCount);

    if(source === 'undo:delete-cols' && rawAddCount > 0){
      const entry = findLineColumnDeletionHistoryEntry(hotInstance, startIndex, rawAddCount, 'applied', 'backward');
      if(entry){
        const savedLabels = Array.isArray(entry.snapshot?.labels) ? entry.snapshot.labels : [];
        const savedShapes = Array.isArray(entry.snapshot?.shapes) ? entry.snapshot.shapes : [];
        for(let offset = 0; offset < rawAddCount; offset += 1){
          if(savedLabels[offset] != null){
            nextLabels[seriesStart + offset] = savedLabels[offset];
          }
          if(savedShapes[offset] != null){
            normalizedShapes[seriesStart + offset] = sanitizeLineGroupShape(savedShapes[offset], seriesStart + offset);
          }
        }
        restoreLineDeletedSeriesLabelStyles(owner, entry.snapshot);
        entry.status = 'undone';
      }
    }

    patchLineGroupedState(owner, {
      labels: nextLabels,
      shapes: normalizedShapes
    }, { reason: source || 'line-single-series-column-splice' });

    if(source === 'redo:delete-cols' && rawRemoveCount > 0){
      const entry = findLineColumnDeletionHistoryEntry(hotInstance, startIndex, rawRemoveCount, 'undone', 'forward');
      if(entry){
        entry.status = 'applied';
      }
    }

    lineDebug('Debug: line single-series column structure remapped', {
      source: source || null,
      startIndex: Number(startIndex) || 0,
      deleteCount: rawRemoveCount,
      insertCount: rawAddCount,
      seriesStart,
      previousCount,
      nextSeriesCount
    });
    return true;
  }

  function remapLineSingleSeriesStructureForColumnPermutation(hotInstance, permutationOldByNew, source){
    if(!hotInstance || getLineTableFormatForHot(hotInstance, { reason: 'line-column-permutation-style-remap' }) !== 'single'){
      return false;
    }
    const permutation = Array.isArray(permutationOldByNew)
      ? permutationOldByNew.map(value => Number(value))
      : [];
    if(!permutation.length || !permutation.every(value => Number.isInteger(value) && value >= 0)){
      return false;
    }
    const owner = getLineSessionForHot(hotInstance, { reason: 'line-column-permutation-style-remap' }, { create: false, fallbackActive: false });
    if(!owner){
      return false;
    }
    const grouped = getLineGroupedState(owner);
    const nextSeriesCount = Math.max(0, (Number(hotInstance.countCols?.()) || 0) - 1);
    const sourceCount = Math.max(
      nextSeriesCount,
      Array.isArray(grouped.labels) ? grouped.labels.length : 0,
      Array.isArray(grouped.shapes) ? grouped.shapes.length : 0
    );
    const sourceShapes = normalizeLineSeriesShapeSequence(grouped.shapes, sourceCount);
    const nextShapes = Array.from({ length: nextSeriesCount }, (_unused, newSeriesIndex) => {
      const newColumnIndex = newSeriesIndex + 1;
      const oldColumnIndex = newColumnIndex < permutation.length ? permutation[newColumnIndex] : newColumnIndex;
      const oldSeriesIndex = oldColumnIndex - 1;
      if(oldSeriesIndex >= 0 && oldSeriesIndex < sourceShapes.length){
        return sanitizeLineGroupShape(sourceShapes[oldSeriesIndex], newSeriesIndex);
      }
      return sanitizeLineGroupShape(null, newSeriesIndex);
    });
    const nextLabels = resolveLineSingleSeriesLabelsFromHot(hotInstance, nextSeriesCount);
    patchLineGroupedState(owner, {
      labels: nextLabels,
      shapes: nextShapes
    }, { reason: source || 'line-single-series-column-permutation' });
    lineDebug('Debug: line single-series column permutation remapped', {
      source: source || null,
      permutation: permutation.slice(),
      nextSeriesCount
    });
    return true;
  }

  function getLineGroupedHeaderCellRole(colIndex, options = {}){
    const col = Number(colIndex);
    if(!Number.isInteger(col) || col < 0){
      return null;
    }
    const hot = options.hotInstance || null;
    const groupedActive = options.forceGrouped === true ? true : isLineGroupedModeActive(hot, options);
    if(!groupedActive){
      return null;
    }
    const replicates = getLineGroupedReplicateCount({ ...options, hotInstance: hot });
    if(col === 0){
      return 'xAnchor';
    }
    const offset = col - 1;
    if(replicates <= 1){
      return 'groupAnchor';
    }
    return offset % replicates === 0 ? 'groupAnchor' : 'groupFollower';
  }

  function getLineGroupedHeaderMergeSegment(colIndex, options = {}){
    const col = Number(colIndex);
    if(!Number.isInteger(col) || col < 0){
      return null;
    }
    const role = getLineGroupedHeaderCellRole(col, options);
    if(!role){
      return null;
    }
    const replicates = getLineGroupedReplicateCount(options);
    if(role === 'xAnchor'){
      return 'single';
    }
    if(role === 'groupAnchor'){
      return replicates > 1 ? 'start' : 'single';
    }
    const position = (col - 1) % replicates;
    return position === replicates - 1 ? 'end' : 'middle';
  }

  function normalizeLineGroupedHeaderRow(hotInstance, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot || typeof hot.getData !== 'function' || typeof hot.setDataAtCell !== 'function'){
      return false;
    }
    if(!isLineGroupedModeActive(hot, options)){
      return false;
    }
    const data = hot.getData() || [];
    const headerRow = Array.isArray(data[0]) ? data[0] : [];
    const replicates = getLineGroupedReplicateCount({ ...options, hotInstance: hot });
    const colCount = typeof hot.countCols === 'function'
      ? hot.countCols()
      : headerRow.length;
    const seriesCount = Math.max(1, Math.ceil(Math.max(0, colCount - 1) / Math.max(replicates, 1)));
    const targetCols = 1 + seriesCount * replicates;
    const changes = [];
    for(let c = headerRow.length; c < targetCols; c += 1){
      changes.push([0, c, '']);
    }
    const xRaw = headerRow[0] != null ? String(headerRow[0]).trim() : '';
    const xValue = xRaw || 'X title';
    if(String(headerRow[0] ?? '').trim() !== xValue){
      changes.push([0, 0, xValue]);
    }
    const nextLabels = new Array(seriesCount).fill('');
    for(let s = 0; s < seriesCount; s += 1){
      const startCol = 1 + s * replicates;
      const currentRaw = headerRow[startCol] != null ? String(headerRow[startCol]).trim() : '';
      const fallbackTitle = `Group ${s + 1} title`;
      const genericLegacyHeader = !currentRaw
        || /^series\s*\d+$/i.test(currentRaw)
        || /^col(?:umn)?\s*\d+$/i.test(currentRaw)
        || /^rep(?:licate)?\s*\d+$/i.test(currentRaw)
        || /^y\s*title$/i.test(currentRaw)
        || /^z\s*title$/i.test(currentRaw);
      let normalizedAnchor = fallbackTitle;
      if(!genericLegacyHeader){
        const stripped = currentRaw
          .replace(/\s*\(?(?:rep(?:licate)?|r)\s*#?\d+\)?$/i, '')
          .replace(/\s*[:\-]\s*(?:rep(?:licate)?|r)\s*#?\d+$/i, '')
          .replace(/\s*(?:rep(?:licate)?|r)\s*#?\d+$/i, '')
          .replace(/\s*[:\-]\s*$/, '')
          .trim();
        normalizedAnchor = stripped || fallbackTitle;
      }
      nextLabels[s] = inferSeriesBaseName(normalizedAnchor || `Group ${s + 1}`, `Group ${s + 1}`);
      if(currentRaw !== normalizedAnchor){
        changes.push([0, startCol, normalizedAnchor]);
      }
      for(let rep = 1; rep < replicates; rep += 1){
        const col = startCol + rep;
        const value = headerRow[col];
        if(value != null && String(value).trim() !== ''){
          changes.push([0, col, '']);
        }
      }
    }
    if(nextLabels.length){
      syncLineSeriesLabelState(nextLabels, { reason: options.source || 'line-grouped-header-normalize' });
    }
    if(!changes.length){
      return false;
    }
    hot.setDataAtCell(changes, options.source || 'line-grouped-header-normalize');
    console.debug('Debug: line grouped header row normalized', {
      changes: changes.length,
      seriesCount,
      replicates
    });
    return true;
  }

  function buildLineAgColHeaders(hotInstance, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot){
      return true;
    }
    const groupedActive = options.forceGrouped === true ? true : isLineGroupedModeActive(hot, options);
    if(!groupedActive){
      return true;
    }
    const colCount = typeof hot.countCols === 'function' ? hot.countCols() : LINE_DEFAULT_COLS;
    const replicates = getLineGroupedReplicateCount({ ...options, hotInstance: hot });
    const headers = new Array(Math.max(colCount, 1)).fill('');
    headers[0] = 'X values';
    const seriesCount = Math.max(1, Math.ceil(Math.max(0, headers.length - 1) / Math.max(replicates, 1)));
    for(let s = 0; s < seriesCount; s += 1){
      const startCol = 1 + s * replicates;
      if(startCol >= headers.length){
        break;
      }
      headers[startCol] = `Group ${s + 1}`;
      for(let rep = 1; rep < replicates; rep += 1){
        const col = startCol + rep;
        if(col < headers.length){
          headers[col] = ' ';
        }
      }
    }
    return headers;
  }

  function buildLineGroupedColumnGroups(hotInstance, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot || typeof hot.countCols !== 'function'){
      return null;
    }
    const groupedActive = options.forceGrouped === true ? true : isLineGroupedModeActive(hot, options);
    if(!groupedActive){
      return null;
    }
    const colCount = Math.max(0, hot.countCols());
    const replicates = getLineGroupedReplicateCount({ ...options, hotInstance: hot });
    if(replicates <= 1 || colCount <= 1){
      return null;
    }
    const groups = [];
    const seriesCount = Math.max(1, Math.ceil(Math.max(0, colCount - 1) / Math.max(replicates, 1)));
    for(let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1){
      const startCol = 1 + seriesIndex * replicates;
      if(startCol >= colCount){
        break;
      }
      groups.push({
        startCol,
        span: Math.min(replicates, colCount - startCol)
      });
    }
    return groups;
  }

  function padRowToLength(row, targetLength){
    const safeTarget = Math.max(0, targetLength | 0);
    const source = Array.isArray(row) ? row.slice() : [];
    while(source.length < safeTarget){
      source.push('');
    }
    if(source.length > safeTarget){
      source.length = safeTarget;
    }
    return source;
  }

  function isLinePlaceholderHeader(value){
    if(value == null) return true;
    const raw = String(value).trim();
    if(!raw) return true;
    const lower = raw.toLowerCase();
    return /^series\s*\d+$/.test(lower)
      || /^rep\s*\d+$/.test(lower)
      || /^column\s*\d+$/.test(lower)
      || /^col\s*\d+$/.test(lower);
  }

  function computeUsedSeriesColumns(matrix){
    const data = Array.isArray(matrix) ? matrix : [];
    if(!data.length) return 0;
    const header = Array.isArray(data[0]) ? data[0] : [];
    let lastUsed = 0;
    for(let c=1;c<header.length;c++){
      let hasData = false;
      for(let r=1;r<data.length;r++){
        const cell = data[r]?.[c];
        if(cell != null && String(cell).trim() !== ''){
          hasData = true;
          lastUsed = c;
          break;
        }
      }
      if(hasData){
        continue;
      }
      const headerCell = header[c];
      if(headerCell != null && String(headerCell).trim() !== '' && !isLinePlaceholderHeader(headerCell)){
        lastUsed = c;
      }
    }
    console.debug('Debug: computeUsedSeriesColumns',{ lastUsed, headerLength: header.length, rowCount: data.length });
    return lastUsed;
  }

  function isLineMatrixEmpty(matrix){
    const data = Array.isArray(matrix) ? matrix : [];
    if(data.length <= 1){
      return true;
    }
    for(let r = 1; r < data.length; r += 1){
      const row = Array.isArray(data[r]) ? data[r] : [];
      for(let c = 0; c < row.length; c += 1){
        const cell = row[c];
        if(cell != null && String(cell).trim() !== ''){
          return false;
        }
      }
    }
    return true;
  }

  function sanitizeLineGroupShape(value, index){
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if(LINE_GROUP_SHAPE_VALUES.has(raw)){
      return raw;
    }
    const safeIndex = Number.isInteger(index) ? index : 0;
    return LINE_GROUP_SHAPE_DEFAULTS[safeIndex % LINE_GROUP_SHAPE_DEFAULTS.length];
  }

  function getLineGroupedListCount(){
    return Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0;
  }

  function ensureLineGroupShapeCapacity(count, session = null){
    const safeCount = Math.max(0, count | 0);
    const targetSession = session || getLineActiveSessionForState();
    const grouped = getLineGroupedState(targetSession);
    const sourceShapes = Array.isArray(grouped.shapes) ? grouped.shapes : [];
    const nextShapes = new Array(safeCount);
    let changed = sourceShapes.length !== safeCount;
    for(let i=0;i<safeCount;i+=1){
      const existing = sourceShapes[i];
      nextShapes[i] = sanitizeLineGroupShape(existing, i);
      if(nextShapes[i] !== existing){
        changed = true;
      }
    }
    if(changed){
      return setLineGroupShapesState(targetSession, nextShapes, { reason: 'line-group-shape-capacity' });
    }
    return nextShapes;
  }

  function getLineGroupShape(index, session = null){
    const safeIndex = Number.isInteger(index) ? index : 0;
    const targetSession = session || getLineActiveSessionForState();
    const grouped = getLineGroupedState(targetSession);
    const labelCount = Array.isArray(grouped.labels) ? grouped.labels.length : 0;
    const shapes = ensureLineGroupShapeCapacity(Math.max(labelCount, safeIndex + 1), targetSession);
    const resolved = sanitizeLineGroupShape(shapes[safeIndex], safeIndex);
    if(shapes[safeIndex] !== resolved){
      shapes[safeIndex] = resolved;
      setLineGroupShapesState(targetSession, shapes, { reason: 'line-group-shape-normalize' });
    }
    return resolved;
  }

  function createLineMarkerShape(doc, shape, options){
    if(!doc){
      return null;
    }
    const normalized = sanitizeLineGroupShape(shape, Number(options?.index) || 0);
    const radiusRaw = Number(options?.radius);
    const radius = Number.isFinite(radiusRaw) ? Math.max(0, radiusRaw) : 1;
    if(radius <= 0){
      return null;
    }
    const cx = Number(options?.cx) || 0;
    const cy = Number(options?.cy) || 0;
    const fill = options?.fill ?? '#000000';
    const stroke = options?.stroke ?? fill;
    const strokeWidthRaw = Number(options?.strokeWidth);
    const strokeWidth = Number.isFinite(strokeWidthRaw) && strokeWidthRaw > 0 ? strokeWidthRaw : 0;
    const fillOpacity = Number.isFinite(options?.fillOpacity) ? options.fillOpacity : 1;
    const strokeOpacity = Number.isFinite(options?.strokeOpacity) ? options.strokeOpacity : fillOpacity;
    const create = (tag, attrs) => {
      const el = doc.createElementNS(NS, tag);
      Object.keys(attrs).forEach(key => {
        if(attrs[key] != null){
          el.setAttribute(key, String(attrs[key]));
        }
      });
      return el;
    };
    if(normalized === 'square'){
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      return create('rect', {
        x: cx - half,
        y: cy - half,
        width: size,
        height: size,
        fill,
        'fill-opacity': fillOpacity,
        stroke: strokeWidth > 0 ? stroke : 'none',
        'stroke-width': strokeWidth,
        'stroke-opacity': strokeOpacity
      });
    }
    if(normalized === 'triangle'){
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      const path = `M ${cx} ${cy - half} L ${cx + half} ${cy + half} L ${cx - half} ${cy + half} Z`;
      return create('path', {
        d: path,
        fill,
        'fill-opacity': fillOpacity,
        stroke: strokeWidth > 0 ? stroke : 'none',
        'stroke-width': strokeWidth,
        'stroke-opacity': strokeOpacity
      });
    }
    if(normalized === 'diamond'){
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      const path = `M ${cx} ${cy - half} L ${cx + half} ${cy} L ${cx} ${cy + half} L ${cx - half} ${cy} Z`;
      return create('path', {
        d: path,
        fill,
        'fill-opacity': fillOpacity,
        stroke: strokeWidth > 0 ? stroke : 'none',
        'stroke-width': strokeWidth,
        'stroke-opacity': strokeOpacity
      });
    }
    if(normalized === 'cross'){
      const size = Math.max(radius * 2, 2);
      const half = size / 2;
      const bar = Math.max(size / 3, 2);
      const hb = bar / 2;
      const path = [
        `M ${cx - half} ${cy - half + hb}`,
        `L ${cx - half + hb} ${cy - half}`,
        `L ${cx} ${cy - hb}`,
        `L ${cx + half - hb} ${cy - half}`,
        `L ${cx + half} ${cy - half + hb}`,
        `L ${cx + hb} ${cy}`,
        `L ${cx + half} ${cy + half - hb}`,
        `L ${cx + half - hb} ${cy + half}`,
        `L ${cx} ${cy + hb}`,
        `L ${cx - half + hb} ${cy + half}`,
        `L ${cx - half} ${cy + half - hb}`,
        `L ${cx - hb} ${cy}`,
        'Z'
      ].join(' ');
      return create('path', {
        d: path,
        fill,
        'fill-opacity': fillOpacity,
        stroke: strokeWidth > 0 ? stroke : 'none',
        'stroke-width': strokeWidth,
        'stroke-opacity': strokeOpacity
      });
    }
    return create('circle', {
      cx,
      cy,
      r: radius,
      fill,
      'fill-opacity': fillOpacity,
      stroke: strokeWidth > 0 ? stroke : 'none',
      'stroke-width': strokeWidth,
      'stroke-opacity': strokeOpacity
    });
  }

  function createLineLegendEntry(seriesEntry, index, options){
    const opts = options || {};
    const name = String(seriesEntry?.name || '');
    const color = typeof opts.color === 'string' && opts.color ? opts.color : '#000000';
    const style = opts.styles?.series?.[name] || {};
    const fallbackAlpha = clampLineAlpha(opts.alpha);
    const lineAlpha = style.lineAlpha != null
      ? clampLineAlpha(style.lineAlpha)
      : (style.alpha != null ? clampLineAlpha(style.alpha) : fallbackAlpha);
    const markerAlpha = style.markerAlpha != null
      ? clampLineAlpha(style.markerAlpha)
      : (style.alpha != null ? clampLineAlpha(style.alpha) : fallbackAlpha);
    const lineStrokeWidth = Number.isFinite(Number(style.lineStrokeWidth))
      ? Number(style.lineStrokeWidth)
      : (Number.isFinite(Number(style.strokeWidth)) ? Number(style.strokeWidth) : Number(opts.lineStrokeWidth));
    const markerStrokeWidth = Number.isFinite(Number(style.markerStrokeWidth))
      ? Number(style.markerStrokeWidth)
      : (Number.isFinite(Number(style.strokeWidth)) ? Number(style.strokeWidth) : 0);
    const markerSize = Number.isFinite(Number(style.dotSize))
      ? Number(style.dotSize)
      : Number(opts.markerSize);
    const lineStroke = (typeof style.lineStroke === 'string' && style.lineStroke)
      ? style.lineStroke
      : color;
    const markerFill = (typeof style.markerFill === 'string' && style.markerFill)
      || (typeof style.fill === 'string' && style.fill)
      || color;
    const markerStroke = (typeof style.markerStroke === 'string' && style.markerStroke)
      || (typeof style.stroke === 'string' && style.stroke)
      || (typeof style.borderColor === 'string' && style.borderColor)
      || opts.markerStroke
      || color;
    return {
      label: name,
      fill: color,
      key: name,
      editable: true,
      shape: opts.shape,
      seriesIndex: Number.isInteger(opts.seriesIndex)
        ? opts.seriesIndex
        : (Number.isInteger(seriesEntry?.seriesIndex) ? seriesEntry.seriesIndex : index),
      swatch: {
        type: 'line-marker',
        line: {
          stroke: lineStroke,
          strokeWidth: Number.isFinite(lineStrokeWidth) ? Math.max(0, lineStrokeWidth) : 1,
          opacity: Math.max(0, 1 - lineAlpha)
        },
        marker: {
          visible: Number.isFinite(markerSize) ? markerSize > 0 : true,
          shape: opts.shape,
          fill: markerFill,
          stroke: markerStroke,
          strokeWidth: Math.max(0, markerStrokeWidth),
          opacity: Math.max(0, 1 - markerAlpha)
        }
      }
    };
  }

  function buildLineReplicateMatrix(matrix, sourceReplicates, targetReplicates, options){
    const sourceCount = clampLineReplicateCount(sourceReplicates);
    const targetCount = clampLineReplicateCount(targetReplicates);
    const safeMatrix = Array.isArray(matrix) ? matrix.map(row=>Array.isArray(row)?row.slice():[]) : [];
    const usedSeriesCols = computeUsedSeriesColumns(safeMatrix);
    const minSeriesCount = Math.max(1, options?.minSeriesCount ?? LINE_DEFAULT_SERIES_COUNT);
    const desiredSeriesCount = Number.isInteger(options?.seriesCount)
      ? Math.max(1, options.seriesCount)
      : (Array.isArray(options?.groupLabels) && options.groupLabels.length
        ? options.groupLabels.length
        : null);
    const inferredSeriesCount = Math.max(minSeriesCount, Math.ceil(usedSeriesCols / Math.max(sourceCount, 1)));
    const seriesCount = Math.max(1, desiredSeriesCount || inferredSeriesCount);
    const targetCols = 1 + seriesCount * targetCount;
    const totalRows = Math.max(safeMatrix.length, DEFAULT_ROWS);
    const headerRow = padRowToLength(safeMatrix[0] || [], Math.max(targetCols, 1));
    const baseNames = [];
    for(let s=0;s<seriesCount;s++){
      const fallback = `Series ${s+1}`;
      let baseName = fallback;
      for(let rep=0;rep<sourceCount;rep++){
        const idx = 1 + s*sourceCount + rep;
        if(idx < headerRow.length){
          const candidate = headerRow[idx];
          if(candidate != null && String(candidate).trim() !== ''){
            baseName = inferSeriesBaseName(candidate, fallback);
            break;
          }
        }
      }
      baseNames.push(baseName);
    }
    const storedLabels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    const overrideLabels = Array.isArray(options?.groupLabels) ? options.groupLabels : null;
    const shouldResetGroupLabels = !!options?.resetGroupLabels;
    const preserveExistingLabels = options?.preserveGroupLabels !== false;
    const nextGroupLabels = new Array(seriesCount).fill('');
    for(let s=0;s<seriesCount;s++){
      const fallback = baseNames[s] && String(baseNames[s]).trim() ? String(baseNames[s]).trim() : `Series ${s+1}`;
      const override = overrideLabels?.[s];
      const stored = storedLabels[s];
      let resolved = fallback;
      if(shouldResetGroupLabels){
        resolved = override != null && String(override).trim() ? String(override).trim() : fallback;
      }else if(preserveExistingLabels && stored != null && String(stored).trim()){
        resolved = String(stored).trim();
      }else if(override != null && String(override).trim()){
        resolved = String(override).trim();
      }else if(baseNames[s] != null && String(baseNames[s]).trim()){
        resolved = String(baseNames[s]).trim();
      }
      nextGroupLabels[s] = resolved || `Series ${s+1}`;
    }
    syncLineSeriesLabelState(nextGroupLabels, { reason: 'line-replicate-matrix' });
    const storedShapes = Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [];
    const overrideShapes = Array.isArray(options?.groupShapes) ? options.groupShapes : null;
    const nextShapes = new Array(seriesCount);
    for(let s=0;s<seriesCount;s+=1){
      let candidateShape = overrideShapes?.[s];
      if(candidateShape == null && storedShapes[s] != null){
        candidateShape = storedShapes[s];
      }
      nextShapes[s] = sanitizeLineGroupShape(candidateShape, s);
    }
    setLineGroupShapesState(getLineProjectionSession({ reason: 'line-projection-mutation' }), nextShapes, { reason: 'line-replicate-matrix-shapes' });
    console.debug('Debug: line group labels synchronized', {
      shouldResetGroupLabels,
      preserveExistingLabels,
      overrideCount: overrideLabels?.length || 0,
      resolved: lineSeriesGroupLabels.slice(),
      shapes: lineGroupShapes.slice()
    }); // Debug: group label sync trace
    const newHeader = new Array(targetCols).fill('');
    newHeader[0] = headerRow[0] && String(headerRow[0]).trim() ? headerRow[0] : 'X title';
    for(let s=0;s<seriesCount;s++){
      const groupLabel = lineSeriesGroupLabels[s] || `Series ${s+1}`;

      for(let rep=0;rep<targetCount;rep++){
        const newIdx = 1 + s*targetCount + rep;
        if(newIdx >= targetCols) continue;
        if(targetCount > 1){
          newHeader[newIdx] = rep === 0 ? groupLabel : '';
        }else{
          let label = '';
          if(rep < sourceCount){
            const oldIdx = 1 + s*sourceCount + rep;
            if(oldIdx < headerRow.length){
              label = headerRow[oldIdx];
            }
          }
          const labelTrimmed = typeof label === 'string' ? label.trim() : '';
          label = labelTrimmed || groupLabel;
          newHeader[newIdx] = label;
        }
      }
    }
    const newData = new Array(totalRows);
    newData[0] = padRowToLength(newHeader, targetCols);
    for(let r=1;r<totalRows;r++){
      const srcRow = padRowToLength(safeMatrix[r] || [], Math.max(1 + seriesCount * sourceCount, 1));
      const newRow = new Array(targetCols).fill('');
      newRow[0] = srcRow[0] ?? '';
      for(let s=0;s<seriesCount;s++){
        for(let rep=0;rep<targetCount;rep++){
          const newIdx = 1 + s*targetCount + rep;
          if(newIdx >= targetCols) continue;
          let value = '';
          if(rep < sourceCount){
            const oldIdx = 1 + s*sourceCount + rep;
            if(oldIdx < srcRow.length){
              value = srcRow[oldIdx];
            }
          }
          newRow[newIdx] = value ?? '';
        }
      }
      newData[r] = padRowToLength(newRow, targetCols);
    }
    console.debug('Debug: buildLineReplicateMatrix',{ sourceCount, targetCount, seriesCount, targetCols, totalRows, minSeriesCount });
    return { data: newData, seriesCount, baseNames: baseNames.slice(), targetCols };
  }

  function updateLineNestedHeaders(hotInstance = null, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot || typeof hot.updateSettings !== 'function') return;
    const tableFormat = getLineTableFormatForHot(hot, options);
    const groupedActive = tableFormat === 'grouped';
    const threeDActive = tableFormat === '3d';
    const replicates = getLineGroupedReplicateCount({ ...options, hotInstance: hot });
    const hotRoot = hot.rootElement
      || hot.__lineHostContainer
      || refs.hotContainer
      || refs.root?.querySelector?.('#lineHot')
      || getLineNodeById('lineHot');
    if(hotRoot && hotRoot.classList){
      hotRoot.classList.toggle('line-grouped-header-merge', !!groupedActive);
      hotRoot.classList.toggle('line-3d-header-merge', !!threeDActive);
    }
    if(hotRoot?.style){
      if(groupedActive){
        hotRoot.style.setProperty('--scatter-group-span', String(replicates));
        hotRoot.style.removeProperty('--line-3d-group-span');
      }else if(threeDActive){
        hotRoot.style.removeProperty('--scatter-group-span');
        hotRoot.style.setProperty('--line-3d-group-span', String(LINE_3D_COLS_PER_DATASET));
      }else{
        hotRoot.style.removeProperty('--scatter-group-span');
        hotRoot.style.removeProperty('--line-3d-group-span');
      }
    }
    if(threeDActive){
      hot.updateSettings({
        nestedHeaders: false,
        colHeaders: true,
        columnGroups: buildLine3dColumnGroups(hot, { ...options, force3d: true })
      });
      applyLineFirstColumnPinningForFormat(hot, tableFormat, {
        ...options,
        reason: options.reason || 'line-3d-nested-header-projection'
      });
      lineDebug('Debug: updateLineNestedHeaders applied 3d', {
        datasets: inferLine3dSeriesCount(hot.getData?.() || [])
      });
      return;
    }
    if(!groupedActive){
      hot.updateSettings({ nestedHeaders: false, colHeaders: true, columnGroups: null });
      applyLineFirstColumnPinningForFormat(hot, tableFormat, {
        ...options,
        reason: options.reason || 'line-single-header-projection'
      });
      lineDebug('Debug: updateLineNestedHeaders disabled',{ replicates, tableFormat });
      return;
    }
    hot.updateSettings({
      nestedHeaders: false,
      colHeaders: buildLineAgColHeaders(hot, { ...options, forceGrouped: true }),
      columnGroups: buildLineGroupedColumnGroups(hot, { ...options, forceGrouped: true })
    });
    applyLineFirstColumnPinningForFormat(hot, tableFormat, {
      ...options,
      reason: options.reason || 'line-grouped-header-projection'
    });
    lineDebug('Debug: updateLineNestedHeaders applied',{
      grouped: true,
      replicates,
      headers: buildLineAgColHeaders(hot, { ...options, forceGrouped: true })
    });
  }

  function getLineGridColumnStateApi(hotInstance = null){
    const hot = hotInstance || null;
    const candidates = [
      hot?.columnApi,
      hot?.gridApi?.columnApi,
      hot?.gridApi,
      hot?.api
    ];
    for(const candidate of candidates){
      if(candidate && typeof candidate.applyColumnState === 'function'){
        return candidate;
      }
    }
    return null;
  }

  function applyLineFirstColumnPinningForFormat(hotInstance = null, tableFormat = null, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot){
      return false;
    }
    const normalizedFormat = tableFormat === '3d' || tableFormat === 'grouped' || tableFormat === 'single'
      ? tableFormat
      : getLineTableFormatForHot(hot, options);
    const shouldPinFirstDataColumn = normalizedFormat !== '3d';
    const columnStateApi = getLineGridColumnStateApi(hot);
    if(!columnStateApi){
      return false;
    }
    try{
      const currentState = typeof columnStateApi.getColumnState === 'function'
        ? columnStateApi.getColumnState()
        : null;
      const firstDataColumnExists = Array.isArray(currentState)
        ? currentState.some(entry => entry?.colId === 'c0')
        : true;
      if(!firstDataColumnExists){
        return false;
      }
      const existing = Array.isArray(currentState)
        ? currentState.find(entry => entry?.colId === 'c0')
        : null;
      const nextPinned = shouldPinFirstDataColumn ? 'left' : null;
      if(existing && (existing.pinned || null) === nextPinned){
        return false;
      }
      columnStateApi.applyColumnState({
        state: [{ colId: 'c0', pinned: nextPinned }],
        applyOrder: false
      });
      hot.gridApi?.refreshHeader?.();
      hot.gridApi?.refreshCells?.({ force: true, suppressFlash: true });
      lineDebug('Debug: line first data-column pinning applied', {
        tableFormat: normalizedFormat,
        pinned: nextPinned,
        reason: options.reason || null
      });
      return true;
    }catch(err){
      console.error('line first data-column pinning update failed', {
        tableFormat: normalizedFormat,
        reason: options.reason || null,
        message: err?.message || String(err)
      });
      return false;
    }
  }

  function applyLineTableFormatToHot(hotInstance = null, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot){
      return false;
    }
    const hotTabId = String(
      hot.__lineTabId
      || resolveLineTabIdFromNode(hot.__lineHostContainer || hot.rootElement || null)
      || ''
    ).trim() || null;
    const tableFormat = stampLineHotTableFormat(hot, getLineTableFormatForHot(hot, options), {
      reason: options.reason || 'line-table-format-apply',
      patchSession: options.patchSession !== false
    });
    if(tableFormat === '3d'){
      hot.updateSettings?.({
        pinFirstRow: LINE_3D_HEADER_ROW_COUNT,
        headerRowCount: LINE_3D_HEADER_ROW_COUNT
      });
      if(options.normalize !== false){
        normalizeLine3dDatasetHeaderRows(hot, { ...options, source: 'line-3d-header-normalize' });
      }
    }else{
      hot.updateSettings?.({
        pinFirstRow: 1,
        headerRowCount: 1
      });
      if(tableFormat === 'grouped'){
        normalizeLineGroupedHeaderRow(hot, { ...options, forceGrouped: true });
      }
    }
    updateLineNestedHeaders(hot, { ...options, tableFormat });
    applyLineFirstColumnPinningForFormat(hot, tableFormat, options);
    const signature = `${tableFormat}:${tableFormat === '3d' ? LINE_3D_COLS_PER_DATASET : getLineGroupedReplicateCount({ ...options, hotInstance: hot })}:${typeof hot.countCols === 'function' ? hot.countCols() : ''}`;
    hot.__lineAppliedTableFormatSignature = signature;
    console.debug('Debug: line table format applied to HOT', {
      tabId: hotTabId,
      tableFormat,
      signature,
      reason: options.reason || null
    });
    return true;
  }

  function applyLineNestedHeaderEditors(){
    return;
  }

  function updateLineSeriesGroupLabel(index, nextText){
    const idx = Number(index);
    if(!Number.isInteger(idx) || idx < 0) return;
    const existing = lineSeriesGroupLabels[idx];
    const sanitized = (typeof nextText === 'string' ? nextText : '').trim();
    const fallback = `Series ${idx+1}`;
    const resolved = sanitized || fallback;
    if(existing === resolved) return;
    const nextLabels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    while(nextLabels.length <= idx){
      nextLabels.push(`Series ${nextLabels.length + 1}`);
    }
    nextLabels[idx] = resolved;
    syncLineSeriesLabelState(nextLabels, { reason: 'line-group-label-edit' });
    console.debug('Debug: updateLineSeriesGroupLabel', {
      index: idx,
      existing,
      resolved
    });
    const is3dMode = getLineViewState().viewMode === '3d' || refs.replicateMode?.value === '3d';
    const hot = getActiveLineHotManager();
    if(!is3dMode && hot && typeof hot.setDataAtCell === 'function'){
      const headerCol = resolveLineSeriesAnchorColumnIndex(idx, { replicates: lineReplicates });
      if(Number.isInteger(headerCol)){
        const current = hot.getDataAtCell?.(0, headerCol);
        const currentTrimmed = current == null ? '' : String(current).trim();
        if(currentTrimmed !== resolved){
          hot.setDataAtCell([[0, headerCol, resolved]], 'line-group-label-edit');
        }
      }
    }
    if(is3dMode){
      updateLine3dNestedHeaders();
    }else{
      updateLineNestedHeaders();
    }
    scheduleActiveLineDraw();
  }

  function applyLineReplicateChange(newCount, options){
    const normalized = clampLineReplicateCount(newCount);
    const sourceReplicates = clampLineReplicateCount(options?.sourceReplicates ?? lineReplicates);
    const overrideData = options?.dataOverride;
    const hot = getActiveLineHotManager();
    const matrix = Array.isArray(overrideData) ? overrideData : (hot ? hot.getData() : []);
    const shouldResetLabels = options?.resetGroupLabels ?? Boolean(options?.groupLabels || options?.dataOverride);
    const structure = buildLineReplicateMatrix(matrix, sourceReplicates, normalized, {
      minSeriesCount: options?.minSeriesCount,
      groupLabels: options?.groupLabels,
      resetGroupLabels: shouldResetLabels,
      preserveGroupLabels: options?.preserveGroupLabels
    });
    if(structure?.seriesCount){
      lineLegendLayoutInfo.entryCount = structure.seriesCount;
    }
    lineReplicates = normalized;
    if(lineReplicates > LINE_MIN_REPLICATES){
      lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
    }
    if(refs.replicatesInput){
      refs.replicatesInput.value = String(lineReplicates);
    }
    patchLineGroupedState(getLineProjectionSession({ reason: 'line-projection-mutation' }), {
      replicates: lineReplicates,
      lastGroupedReplicateCount: lineLastGroupedReplicateCount,
      labels: lineSeriesGroupLabels,
      shapes: lineGroupShapes
    }, { reason: options?.source || 'line-replicates-change' });
    updateLineReplicateModeControls();
    if(hot && options?.skipTableProjection !== true){
      hot.loadData(structure.data);
      if(isLineGroupedModeActive(hot)){
        normalizeLineGroupedHeaderRow(hot, { source: 'line-grouped-header-normalize' });
      }
      updateLineNestedHeaders(hot);
    }
    console.debug('Debug: applyLineReplicateChange',{ requested:newCount, normalized, sourceReplicates, seriesCount: structure.seriesCount, targetCols: structure.targetCols, shouldResetLabels });
    if(!options?.skipDraw){
      scheduleActiveLineDraw();
    }
    return structure;
  }

    function updateLineReplicateModeControls(modeOverride){
      const wants3d = modeOverride === '3d'
        || getLineViewState().viewMode === '3d'
        || refs.replicateMode?.value === '3d';
      const mode = wants3d ? '3d' : (modeOverride || (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single'));
      if(refs.replicateMode && refs.replicateMode.value !== mode){
        refs.replicateMode.value = mode;
      }
      if(refs.replicatesContainer){
        const showGroupedControls = mode === 'grouped';
        if(showGroupedControls){
          refs.replicatesContainer.style.display = '';
          refs.replicatesContainer.setAttribute('aria-hidden', 'false');
        }else{
          refs.replicatesContainer.style.display = 'none';
          refs.replicatesContainer.setAttribute('aria-hidden', 'true');
        }
      }
    if(refs.replicatesInput){
      refs.replicatesInput.disabled = mode !== 'grouped';
    }
    syncLineErrorBarToolbarControl();
  }

  function updateLineGroupShapeSelect(index, shape){
    if(!refs.groupedList){
      return;
    }
    const selector = `select[data-group-index="${index}"][data-shape-control="1"]`;
    const target = refs.groupedList.querySelector(selector);
    if(target){
      target.value = shape;
    }
  }

  function renderLineGroupedList(){
    if(!refs.groupedList){
      return;
    }
    if(lineReplicates <= LINE_MIN_REPLICATES){
      refs.groupedList.innerHTML = '';
      return;
    }
    const doc = global.document;
    if(!doc){
      return;
    }
    const labels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    ensureLineLabelColors(labels);
    ensureLineGroupShapeCapacity(labels.length);
    refs.groupedList.innerHTML = '';
    labels.forEach((storedLabel, idx) => {
      const row = doc.createElement('div');
      row.className = 'grouped-row';
      row.dataset.groupIndex = String(idx);
      const inputId = `line-group-name-${idx}`;
      const labelEl = doc.createElement('label');
      labelEl.textContent = `Group ${idx + 1}`;
      labelEl.setAttribute('for', inputId);
      row.appendChild(labelEl);
      const input = doc.createElement('input');
      input.type = 'text';
      input.value = storedLabel || '';
      input.id = inputId;
      input.setAttribute('aria-label', `Display name for Group ${idx + 1}`);
      input.addEventListener('change', e => {
        updateLineSeriesGroupLabel(idx, e.target.value);
        e.target.value = lineSeriesGroupLabels[idx] || '';
        renderLineGroupedList();
      });
      row.appendChild(input);
      const labelKey = lineSeriesGroupLabels[idx] || `Series ${idx + 1}`;
      const defaultColor = DEFAULT_SCATTER_COLORS[idx % DEFAULT_SCATTER_COLORS.length];
      const existingColor = lineLabelColors[labelKey];
      const resolvedColor = typeof existingColor === 'string' && existingColor ? existingColor : defaultColor;
      lineLabelColors[labelKey] = resolvedColor;
      const colorInput = doc.createElement('input');
      colorInput.type = 'color';
      colorInput.value = resolvedColor;
      colorInput.dataset.groupIndex = String(idx);
      colorInput.dataset.setting = `labelColors.${idx}`;
      colorInput.setAttribute('aria-label', `Color for ${labelKey}`);
      colorInput.addEventListener('input', e => {
        const owner = getLineSessionForEvent(e, { reason: 'line-grouped-color-change' }, { create: false });
        if(!owner || !isLineSessionActive(owner)){
          lineDebug('Debug: line grouped color ignored without exact live owner', {
            index: idx,
            tabId: owner?.tabId || null
          });
          return;
        }
        const targetLabel = getLineGroupedState(owner).labels?.[idx] || `Series ${idx + 1}`;
        const value = typeof e.target.value === 'string' && e.target.value ? e.target.value : defaultColor;
        const nextColors = cloneLineRuntimeValue(getLineLabelsState(owner).colors, {}) || {};
        nextColors[targetLabel] = value;
        patchLineLabelsState(owner, { colors: nextColors }, { reason: 'line-grouped-color-change' });
        Shared.componentLifecycle?.persistOwnedUserState?.('line', owner, {
          tabId: owner.tabId,
          reason: 'line-grouped-color-change'
        });
        console.debug('Debug: line grouped color updated',{ index: idx, color: value, label: targetLabel, tabId: owner.tabId });
        scheduleLineDrawForSession(owner, {
          tabId: owner.tabId,
          viewOnly: true,
          userInitiated: true,
          reason: 'line-grouped-color-change'
        });
      });
      if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(colorInput);
      }
      row.appendChild(colorInput);
      const shapeSelect = doc.createElement('select');
      shapeSelect.dataset.groupIndex = String(idx);
      shapeSelect.dataset.shapeControl = '1';
      shapeSelect.dataset.setting = `groupShapes.${idx}`;
      shapeSelect.setAttribute('aria-label', `Marker shape for ${labelKey}`);
      LINE_GROUP_SHAPE_OPTIONS.forEach(opt => {
        const option = doc.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        shapeSelect.appendChild(option);
      });
      const currentShape = getLineGroupShape(idx);
      shapeSelect.value = currentShape;
      shapeSelect.addEventListener('change', e => {
        const owner = getLineSessionForEvent(e, { reason: 'line-grouped-list-shape-change' }, { create: false });
        if(!owner || !isLineSessionActive(owner)){
          lineDebug('Debug: line grouped shape ignored without exact live owner', {
            index: idx,
            tabId: owner?.tabId || null
          });
          return;
        }
        const sanitized = sanitizeLineGroupShape(e.target.value, idx);
        patchLineGroupShapeState(owner, idx, sanitized, { reason: 'line-grouped-list-shape-change' });
        Shared.componentLifecycle?.persistOwnedUserState?.('line', owner, {
          tabId: owner.tabId,
          reason: 'line-grouped-list-shape-change'
        });
        if(e.target.value !== sanitized){
          e.target.value = sanitized;
        }
        console.debug('Debug: line grouped shape updated',{ index: idx, shape: sanitized, tabId: owner.tabId });
        scheduleLineDrawForSession(owner, {
          tabId: owner.tabId,
          viewOnly: true,
          userInitiated: true,
          reason: 'line-grouped-list-shape-change'
        });
      });
      attachLineSelectAutoSize(shapeSelect, `line-group-shape-${idx}`);
      row.appendChild(shapeSelect);
      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'grouped-remove';
      removeBtn.textContent = '×';
      removeBtn.disabled = labels.length <= 1;
      removeBtn.addEventListener('click', () => {
        removeLineGroupAt(idx);
      });
      row.appendChild(removeBtn);
      refs.groupedList.appendChild(row);
    });
    if(refs.replicatesInput){
      refs.replicatesInput.value = String(lineReplicates);
    }
    console.debug('Debug: line grouped list rendered',{ groups: labels.length });
  }

  function isLine3dDatasetHeaderMatrix(matrix){
    if(!Array.isArray(matrix) || matrix.length < LINE_3D_HEADER_ROW_COUNT){
      return false;
    }
    const datasetRow = Array.isArray(matrix[LINE_3D_DATASET_HEADER_ROW_INDEX])
      ? matrix[LINE_3D_DATASET_HEADER_ROW_INDEX]
      : [];
    const axisRow = Array.isArray(matrix[LINE_3D_AXIS_HEADER_ROW_INDEX])
      ? matrix[LINE_3D_AXIS_HEADER_ROW_INDEX]
      : [];
    const maxCols = Math.max(datasetRow.length, axisRow.length);
    let activeGroups = 0;
    for(let startCol = 0; startCol + 2 < maxCols; startCol += LINE_3D_COLS_PER_DATASET){
      const datasetAnchor = datasetRow[startCol];
      const firstFollower = datasetRow[startCol + 1];
      const secondFollower = datasetRow[startCol + 2];
      const axisHeaders = axisRow.slice(startCol, startCol + LINE_3D_COLS_PER_DATASET);
      const groupValues = [datasetAnchor, firstFollower, secondFollower, ...axisHeaders];
      if(!groupValues.some(value => value != null && String(value).trim())){
        continue;
      }
      if((firstFollower != null && String(firstFollower).trim())
        || (secondFollower != null && String(secondFollower).trim())
        || (datasetAnchor != null && String(datasetAnchor).trim() && typeof datasetAnchor !== 'string')
        || axisHeaders.some(value => value != null && String(value).trim() && typeof value !== 'string')){
        return false;
      }
      activeGroups += 1;
    }
    return activeGroups > 0;
  }

  function getLine3dDataStartRow(matrix){
    return isLine3dDatasetHeaderMatrix(matrix) ? LINE_3D_HEADER_ROW_COUNT : 1;
  }

  function getLine3dDatasetStartCol(datasetIndex){
    const idx = Number(datasetIndex);
    return Number.isInteger(idx) && idx >= 0 ? idx * LINE_3D_COLS_PER_DATASET : null;
  }

  function getLine3dDatasetCountFromColumnCount(colCount){
    const cols = Math.max(0, Number(colCount) || 0);
    return Math.max(0, Math.floor(cols / LINE_3D_COLS_PER_DATASET));
  }

  function inferLine3dSeriesCount(matrix){
    if(!Array.isArray(matrix) || !matrix.length){
      return 0;
    }
    if(isLine3dDatasetHeaderMatrix(matrix)){
      const datasetRow = Array.isArray(matrix[LINE_3D_DATASET_HEADER_ROW_INDEX]) ? matrix[LINE_3D_DATASET_HEADER_ROW_INDEX] : [];
      const axisRow = Array.isArray(matrix[LINE_3D_AXIS_HEADER_ROW_INDEX]) ? matrix[LINE_3D_AXIS_HEADER_ROW_INDEX] : [];
      const maxCols = Math.max(datasetRow.length, axisRow.length, ...matrix.map(row => Array.isArray(row) ? row.length : 0));
      const maxDatasets = getLine3dDatasetCountFromColumnCount(maxCols);
      let lastUsed = -1;
      for(let s = 0; s < maxDatasets; s += 1){
        const startCol = getLine3dDatasetStartCol(s);
        const label = datasetRow[startCol] != null ? String(datasetRow[startCol]).trim() : '';
        const axisHasLabel = LINE_3D_AXIS_LABELS.some((fallback, offset) => {
          const raw = axisRow[startCol + offset];
          return raw != null && String(raw).trim() && String(raw).trim() !== fallback;
        });
        let hasData = false;
        for(let r = LINE_3D_HEADER_ROW_COUNT; r < matrix.length; r += 1){
          const row = Array.isArray(matrix[r]) ? matrix[r] : [];
          const xVal = parseFloat(row[startCol]);
          const yVal = parseFloat(row[startCol + 1]);
          const zVal = parseFloat(row[startCol + 2]);
          if(Number.isFinite(xVal) || Number.isFinite(yVal) || Number.isFinite(zVal)){
            hasData = true;
            break;
          }
        }
        if(hasData || label || axisHasLabel){
          lastUsed = s;
        }
      }
      return Math.max(0, lastUsed + 1);
    }

    const headerRow = Array.isArray(matrix[0]) ? matrix[0] : [];
    const maxPairs = Math.max(0, Math.floor(((headerRow.length || 1) - 1) / 2));
    if(maxPairs <= 0){
      return 0;
    }
    let lastUsed = -1;
    for(let s = 0; s < maxPairs; s += 1){
      const yCol = 1 + s * 2;
      const zCol = yCol + 1;
      const headerY = headerRow[yCol] != null ? String(headerRow[yCol]).trim() : '';
      const headerZ = headerRow[zCol] != null ? String(headerRow[zCol]).trim() : '';
      let hasData = false;
      for(let r = 1; r < matrix.length; r += 1){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        const yVal = parseFloat(row[yCol]);
        const zVal = parseFloat(row[zCol]);
        if(Number.isFinite(yVal) || Number.isFinite(zVal)){
          hasData = true;
          break;
        }
      }
      if(hasData || headerY || headerZ){
        lastUsed = s;
      }
    }
    return Math.max(0, lastUsed + 1);
  }

  function resolveLine3dDatasetLabels(matrix, seriesCount, options = {}){
    const count = Math.max(0, Number(seriesCount) || 0);
    const storedLabels = Array.isArray(options.labels)
      ? options.labels
      : (Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels : []);
    const labels = new Array(count);
    const isNewFormat = isLine3dDatasetHeaderMatrix(matrix);
    const datasetRow = isNewFormat && Array.isArray(matrix[LINE_3D_DATASET_HEADER_ROW_INDEX])
      ? matrix[LINE_3D_DATASET_HEADER_ROW_INDEX]
      : [];
    const firstRowHeader = !isNewFormat && Array.isArray(matrix?.[0]) ? matrix[0] : [];
    for(let s = 0; s < count; s += 1){
      const fallback = `Series ${s + 1}`;
      const stored = storedLabels[s] != null ? String(storedLabels[s]).trim() : '';
      let fromTable = '';
      if(isNewFormat){
        const startCol = getLine3dDatasetStartCol(s);
        fromTable = datasetRow[startCol] != null ? String(datasetRow[startCol]).trim() : '';
      }else{
        const yCol = 1 + s * 2;
        fromTable = firstRowHeader[yCol] != null ? inferSeriesBaseName(firstRowHeader[yCol], fallback) : '';
      }
      const preferTableLabels = options.preferTableLabels !== undefined
        ? options.preferTableLabels === true
        : isNewFormat;
      labels[s] = preferTableLabels
        ? (fromTable || stored || fallback)
        : (stored || fromTable || fallback);
    }
    return labels;
  }

  function resolveLine3dAxisHeaders(matrix){
    const source = Array.isArray(matrix) ? matrix : [];
    const axisRow = isLine3dDatasetHeaderMatrix(source)
      ? (Array.isArray(source[LINE_3D_AXIS_HEADER_ROW_INDEX]) ? source[LINE_3D_AXIS_HEADER_ROW_INDEX] : [])
      : (Array.isArray(source[0]) ? source[0] : []);
    const xHeaderIndex = !isLine3dDatasetHeaderMatrix(source)
      ? Math.max(0, axisRow.findIndex(h => String(h).trim().toLowerCase() === 'x'))
      : 0;
    const getAxis = (offset, fallback) => {
      const value = axisRow[offset] != null ? String(axisRow[offset]).trim() : '';
      return value || fallback;
    };
    return {
      xIndex: xHeaderIndex,
      xLabel: getAxis(isLine3dDatasetHeaderMatrix(source) ? 0 : xHeaderIndex, 'X'),
      yLabel: getAxis(isLine3dDatasetHeaderMatrix(source) ? 1 : 1, 'Y'),
      zLabel: getAxis(isLine3dDatasetHeaderMatrix(source) ? 2 : 2, 'Z')
    };
  }

  function syncLine3dAxisHeader(axisKey, value, options = {}){
    const hotInstance = options.hot || getActiveLineHotManager();
    if(!hotInstance || typeof hotInstance.getData !== 'function' || typeof hotInstance.setDataAtCell !== 'function'){
      return value != null ? String(value) : '';
    }
    const axisIndex = LINE_3D_AXIS_KEYS.indexOf(String(axisKey || '').toLowerCase());
    if(axisIndex < 0){
      return value != null ? String(value) : '';
    }
    const data = hotInstance.getData() || [];
    const seriesCount = Math.max(0, inferLine3dSeriesCount(data));
    const fallback = LINE_3D_AXIS_LABELS[axisIndex] || '';
    const trimmed = value != null ? String(value).trim() : '';
    const resolved = trimmed || fallback;
    if(!seriesCount){
      return resolved;
    }
    const changes = [];
    for(let s = 0; s < seriesCount; s += 1){
      const colIndex = s * LINE_3D_COLS_PER_DATASET + axisIndex;
      const current = hotInstance.getDataAtCell?.(LINE_3D_AXIS_HEADER_ROW_INDEX, colIndex);
      const currentTrimmed = current != null ? String(current).trim() : '';
      if(currentTrimmed !== resolved){
        changes.push([LINE_3D_AXIS_HEADER_ROW_INDEX, colIndex, resolved]);
      }
    }
    if(changes.length){
      hotInstance.setDataAtCell(changes, options.source || 'line-axis-inline');
      lineDebug('Debug: line 3d axis header synced', { axis: axisKey, count: changes.length, value: resolved });
    }
    return resolved;
  }

  function ensureLine3dGroupLabelCapacity(seriesCount, options = {}){
    const count = Math.max(0, Number(seriesCount) || 0);
    if(!count){
      syncLineSeriesLabelState([], { reason: options.reason || 'line-3d-label-capacity-empty' });
      return;
    }
    const matrix = Array.isArray(options.data)
      ? options.data
      : (() => {
          try{
            const hot = options.hot || getActiveLineHotManager();
            const data = hot?.getData?.();
            return Array.isArray(data) ? data : null;
          }catch(err){
            return null;
          }
        })();
    const labels = resolveLine3dDatasetLabels(matrix, count, {
      labels: lineSeriesGroupLabels,
      preferTableLabels: isLine3dDatasetHeaderMatrix(matrix)
    });
    syncLineSeriesLabelState(labels, { reason: options.reason || 'line-3d-label-capacity' });
  }

  function getLine3dHeaderCellRole(colIndex, options = {}){
    const col = Number(colIndex);
    if(!Number.isInteger(col) || col < 0){
      return null;
    }
    const hot = options.hotInstance || options.hot || null;
    if(!isLine3dTableActive(hot, options)){
      return null;
    }
    return col % LINE_3D_COLS_PER_DATASET === 0 ? 'datasetAnchor' : 'datasetFollower';
  }

  function getLine3dHeaderMergeSegment(colIndex, options = {}){
    const col = Number(colIndex);
    if(!Number.isInteger(col) || col < 0){
      return null;
    }
    const role = getLine3dHeaderCellRole(col, options);
    if(role === 'datasetAnchor'){
      return 'start';
    }
    if(role !== 'datasetFollower'){
      return null;
    }
    return col % LINE_3D_COLS_PER_DATASET === LINE_3D_COLS_PER_DATASET - 1 ? 'end' : 'middle';
  }

  function buildLine3dColumnGroups(hotInstance, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot || typeof hot.countCols !== 'function' || !isLine3dTableActive(hot, options)){
      return null;
    }
    const colCount = Math.max(0, hot.countCols());
    if(colCount <= 0){
      return null;
    }
    const groups = [];
    const seriesCount = getLine3dDatasetCountFromColumnCount(colCount);
    for(let datasetIndex = 0; datasetIndex < seriesCount; datasetIndex += 1){
      const startCol = getLine3dDatasetStartCol(datasetIndex);
      if(startCol >= colCount){
        break;
      }
      groups.push({
        startCol,
        span: Math.min(LINE_3D_COLS_PER_DATASET, colCount - startCol),
        selectionMode: 'column',
        resizeMode: 'column'
      });
    }
    return groups;
  }

  function syncLine3dSeriesLabelsFromHeader(hotInstance = null, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot || !isLine3dTableActive(hot, options) || typeof hot.getData !== 'function'){
      return false;
    }
    const data = hot.getData() || [];
    const seriesCount = Math.max(0, inferLine3dSeriesCount(data));
    const nextLabels = resolveLine3dDatasetLabels(data, seriesCount, { labels: [] });
    const changed = syncLineSeriesLabelState(nextLabels, {
      reason: options.reason || 'line-3d-header-label-sync',
      refreshControls: false
    });
    if(changed || options.persist === true){
      const session = getLineSessionForHot(hot, { reason: options.reason || 'line-3d-header-label-sync' }, { create: true });
      patchLineGroupedState(session, {
        labels: Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [],
        shapes: lineGroupShapes
      }, { reason: options.reason || 'line-3d-header-label-sync' });
    }
    return changed;
  }

  function normalizeLine3dDatasetHeaderRows(hotInstance = null, options = {}){
    const hot = hotInstance || getActiveLineHotManager();
    if(!hot || typeof hot.getData !== 'function' || typeof hot.loadData !== 'function'){
      return null;
    }
    if(hot.__line3dHeaderNormalizeDepth > 0){
      return Array.isArray(hot.getData?.()) ? hot.getData() : null;
    }
    hot.__line3dHeaderNormalizeDepth = (hot.__line3dHeaderNormalizeDepth || 0) + 1;
    try{
      const matrix = hot.getData() || [];
      const seriesCount = Math.max(
        inferLine3dSeriesCount(matrix),
        Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0,
        Number(options.seriesCount) || 0,
        LINE_3D_DEFAULT_SERIES_COUNT
      );
      const normalized = applyLine3dHeaderRow(matrix, seriesCount, options);
      const currentSignature = JSON.stringify(matrix);
      const nextSignature = JSON.stringify(normalized);
      if(currentSignature !== nextSignature){
        hot.loadData(normalized, {
          source: options.source || 'line-3d-header-normalize',
          skipUndo: true,
          suppressSchedule: true
        });
        lineDebug('Debug: line 3d header rows normalized', {
          seriesCount,
          reason: options.reason || options.source || null
        });
      }
      syncLine3dSeriesLabelsFromHeader(hot, { reason: options.reason || 'line-3d-header-normalize', persist: true });
      return normalized;
    }finally{
      hot.__line3dHeaderNormalizeDepth = Math.max(0, (hot.__line3dHeaderNormalizeDepth || 1) - 1);
    }
  }

  function updateLine3dNestedHeaders(structure = {}){
    const hot = structure.hot || getActiveLineHotManager();
    if(!hot || typeof hot.updateSettings !== 'function'){
      return;
    }
    const matrix = Array.isArray(structure.data) ? structure.data : hot.getData?.();
    const seriesCount = Math.max(0, Number(structure.seriesCount) || inferLine3dSeriesCount(matrix));
    ensureLine3dGroupLabelCapacity(seriesCount, { data: matrix, hot, reason: 'line-3d-table-visuals' });
    ensureLineGroupShapeCapacity(seriesCount);
    hot.updateSettings({
      nestedHeaders: false,
      colHeaders: true,
      columnGroups: buildLine3dColumnGroups(hot, { force3d: true })
    });
    const hotRoot = hot.rootElement
      || hot.__lineHostContainer
      || refs.hotContainer
      || refs.root?.querySelector?.('#lineHot')
      || getLineNodeById('lineHot');
    if(hotRoot && hotRoot.classList){
      hotRoot.classList.add('line-3d-header-merge');
      hotRoot.classList.remove('line-grouped-header-merge');
      hotRoot.style?.setProperty?.('--line-3d-group-span', String(LINE_3D_COLS_PER_DATASET));
    }
    lineDebug('Debug: updateLine3dNestedHeaders applied', { seriesCount, labels: lineSeriesGroupLabels.slice() });
  }

  const scheduleLine3dDatasetSync = (() => {
    let lastReason = 'frame';
    const debounced = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(line, 'line', () => syncLine3dDatasetsFromTable(lastReason), { reason: 'line-3d-dataset-sync' })
      : null;
    return reason => {
      lastReason = reason || 'frame';
      if(debounced){
        debounced({ tabId: getLineProjectionTabId() || null, reason: 'line-3d-dataset-sync' });
        return;
      }
      syncLine3dDatasetsFromTable(lastReason);
    };
  })();

  function syncLine3dDatasetsFromTable(reason){
    const hot = getActiveLineHotManager();
    if(!hot || !isLine3dTableActive(hot)){
      line3dLastSeriesCount = null;
      return;
    }
    const matrix = hot.getData();
    const seriesCount = inferLine3dSeriesCount(matrix);
    if(line3dLastSeriesCount === seriesCount){
      return;
    }
    const previous = line3dLastSeriesCount;
    line3dLastSeriesCount = seriesCount;
    normalizeLine3dDatasetHeaderRows(hot, { reason: reason || 'line-3d-dataset-sync' });
    updateLine3dNestedHeaders({ hot, seriesCount, data: hot.getData?.() || matrix });
    lineDebug('Debug: line 3d dataset table synced', { reason: reason || null, previous, seriesCount });
  }

  function applyLine3dHeaderRow(matrix, seriesCount, options = {}){
    const safeMatrix = Array.isArray(matrix) ? matrix.map(row => Array.isArray(row) ? row.slice() : []) : [];
    const requestedCount = Math.max(0, Number(seriesCount) || 0);
    const inferredCount = Math.max(0, inferLine3dSeriesCount(safeMatrix));
    const newFormat = isLine3dDatasetHeaderMatrix(safeMatrix);
    const labelCount = Array.isArray(options.labels)
      ? options.labels.length
      : (newFormat ? 0 : (Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0));
    const count = Math.max(requestedCount, inferredCount, labelCount, 1);
    const labels = resolveLine3dDatasetLabels(safeMatrix, count, {
      labels: options.labels || lineSeriesGroupLabels,
      preferTableLabels: isLine3dDatasetHeaderMatrix(safeMatrix)
    });
    syncLineSeriesLabelState(labels, { reason: options.reason || options.source || 'line-3d-header-normalize' });
    ensureLineGroupShapeCapacity(count);

    const targetCols = count * LINE_3D_COLS_PER_DATASET;
    const sourceRows = newFormat
      ? safeMatrix.slice(LINE_3D_HEADER_ROW_COUNT)
      : safeMatrix.slice(1);
    const outputRows = Math.max(DEFAULT_ROWS, sourceRows.length + LINE_3D_HEADER_ROW_COUNT);
    const normalized = new Array(outputRows);
    const datasetRow = new Array(targetCols).fill('');
    const axisRow = new Array(targetCols).fill('');
    for(let s = 0; s < count; s += 1){
      const startCol = getLine3dDatasetStartCol(s);
      datasetRow[startCol] = lineSeriesGroupLabels[s] || `Series ${s + 1}`;
      LINE_3D_AXIS_LABELS.forEach((label, offset) => {
        const previousAxis = newFormat
          ? safeMatrix[LINE_3D_AXIS_HEADER_ROW_INDEX]?.[startCol + offset]
          : safeMatrix[0]?.[(offset === 0) ? 0 : (1 + s * 2 + (offset - 1))];
        const resolved = previousAxis != null && String(previousAxis).trim()
          ? String(previousAxis).trim()
          : label;
        axisRow[startCol + offset] = resolved;
      });
    }
    normalized[LINE_3D_DATASET_HEADER_ROW_INDEX] = datasetRow;
    normalized[LINE_3D_AXIS_HEADER_ROW_INDEX] = axisRow;

    for(let outIndex = LINE_3D_HEADER_ROW_COUNT; outIndex < outputRows; outIndex += 1){
      const sourceIndex = outIndex - LINE_3D_HEADER_ROW_COUNT;
      const srcRow = Array.isArray(sourceRows[sourceIndex]) ? sourceRows[sourceIndex] : [];
      const outRow = new Array(targetCols).fill('');
      for(let s = 0; s < count; s += 1){
        const startCol = getLine3dDatasetStartCol(s);
        if(newFormat){
          outRow[startCol] = srcRow[startCol] ?? '';
          outRow[startCol + 1] = srcRow[startCol + 1] ?? '';
          outRow[startCol + 2] = srcRow[startCol + 2] ?? '';
        }else{
          outRow[startCol] = srcRow[0] ?? '';
          outRow[startCol + 1] = srcRow[1 + s * 2] ?? '';
          outRow[startCol + 2] = srcRow[1 + s * 2 + 1] ?? '';
        }
      }
      normalized[outIndex] = outRow;
    }
    return normalized;
  }

  function snapshotLineHotState(){
    const hot = getActiveLineHotManager();
    if(!hot){
      return null;
    }
    const exclusions = typeof hot.exportExclusions === 'function'
      ? hot.exportExclusions()
      : Shared.hot.exportExclusions(hot);
    const dataSnapshot = cloneSimple(hot.getData()) || [];
    const exclusionSnapshot = cloneSimple(exclusions);
    return {
      data: dataSnapshot,
      exclusions: exclusionSnapshot,
      replicates: lineReplicates,
      tableFormat: refs.replicateMode?.value || (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single'),
      groupLabels: Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [],
      groupShapes: Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [],
      labelColors: lineLabelColors && typeof lineLabelColors === 'object' ? { ...lineLabelColors } : {}
    };
  }

  function restoreLineHotState(snapshot, options = {}){
    const hot = getActiveLineHotManager();
    if(!snapshot || !hot){
      return false;
    }
    if(Array.isArray(snapshot.groupLabels) || Array.isArray(snapshot.groupShapes)){
      const groupedPatch = {};
      if(Array.isArray(snapshot.groupLabels)){
        groupedPatch.labels = snapshot.groupLabels.slice();
      }
      if(Array.isArray(snapshot.groupShapes)){
        groupedPatch.shapes = snapshot.groupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
      }
      patchLineGroupedState(getLineProjectionSession({ reason: 'line-projection-mutation' }), groupedPatch, { reason: 'line-hot-state-restore-grouped' });
    }
    if(snapshot.labelColors && typeof snapshot.labelColors === 'object'){
      lineLabelColors = { ...snapshot.labelColors };
    }
    if(Number.isFinite(snapshot.replicates)){
      lineReplicates = clampLineReplicateCount(snapshot.replicates);
    }
    if(Array.isArray(snapshot.data)){
      hot.loadData(snapshot.data);
    }
    if(snapshot.exclusions){
      hot.applyExclusions?.(snapshot.exclusions);
    }
    if(options.skipControls !== true){
      if(refs.replicateMode && typeof snapshot.tableFormat === 'string'){
        refs.replicateMode.value = snapshot.tableFormat;
      }
      updateLineReplicateModeControls();
    }
    return true;
  }

  function buildLine3dMatrixFrom2d(matrix, sourceReplicates){
    const safeMatrix = Array.isArray(matrix) ? matrix : [];
    const header = Array.isArray(safeMatrix[0]) ? safeMatrix[0] : [];
    let xIndex = header.findIndex(h => String(h).trim().toLowerCase() === 'x');
    if(xIndex < 0){
      xIndex = 0;
    }
    const replicates = Math.max(LINE_MIN_REPLICATES, clampLineReplicateCount(sourceReplicates));
    const maxSeries = Math.max(0, Math.floor(((header.length || 1) - 1) / replicates));
    let lastSeriesWithValues = -1;
    for(let s = 0; s < maxSeries; s += 1){
      const baseCol = 1 + s * replicates;
      const headerCell = header[baseCol] != null ? String(header[baseCol]).trim() : '';
      const hasHeaderLabel = !!headerCell && !isLinePlaceholderHeader(headerCell);
      let hasData = false;
      for(let r = 1; r < safeMatrix.length; r += 1){
        const row = Array.isArray(safeMatrix[r]) ? safeMatrix[r] : [];
        for(let rep = 0; rep < replicates; rep += 1){
          const colIndex = 1 + s * replicates + rep;
          const value = parseFloat(row[colIndex]);
          if(Number.isFinite(value)){
            hasData = true;
            break;
          }
        }
        if(hasData){
          break;
        }
      }
      if(hasData || hasHeaderLabel){
        lastSeriesWithValues = s;
      }
    }
    let seriesCount = Math.max(0, lastSeriesWithValues + 1);
    if(seriesCount <= 0){
      seriesCount = Math.max(1, LINE_3D_DEFAULT_SERIES_COUNT);
      lineDebug('Debug: line 3d series count defaulted', { seriesCount, reason: 'empty-2d-matrix' });
    }
    const groupLabels = [];
    for(let s = 0; s < seriesCount; s += 1){
      const baseCol = 1 + s * replicates;
      const fallback = `Series ${s + 1}`;
      const stored = lineSeriesGroupLabels?.[s];
      const storedTrimmed = stored && String(stored).trim() ? String(stored).trim() : null;
      const headerLabel = baseCol < header.length ? String(header[baseCol] || '').trim() : '';
      groupLabels.push(storedTrimmed || inferSeriesBaseName(headerLabel, fallback) || fallback);
    }
    const targetCols = seriesCount * LINE_3D_COLS_PER_DATASET;
    const totalRows = Math.max(DEFAULT_ROWS, safeMatrix.length + 1);
    const newData = new Array(totalRows);
    const datasetRow = new Array(targetCols).fill('');
    const axisRow = new Array(targetCols).fill('');
    for(let s = 0; s < seriesCount; s += 1){
      const startCol = getLine3dDatasetStartCol(s);
      datasetRow[startCol] = groupLabels[s] || `Series ${s + 1}`;
      axisRow[startCol] = header[xIndex] && String(header[xIndex]).trim() ? String(header[xIndex]).trim() : 'X';
      axisRow[startCol + 1] = 'Y';
      axisRow[startCol + 2] = 'Z';
    }
    newData[LINE_3D_DATASET_HEADER_ROW_INDEX] = datasetRow;
    newData[LINE_3D_AXIS_HEADER_ROW_INDEX] = axisRow;
    for(let outRowIndex = LINE_3D_HEADER_ROW_COUNT; outRowIndex < totalRows; outRowIndex += 1){
      const srcIndex = outRowIndex - 1;
      const srcRow = Array.isArray(safeMatrix[srcIndex]) ? safeMatrix[srcIndex] : [];
      const outRow = new Array(targetCols).fill('');
      for(let s = 0; s < seriesCount; s += 1){
        const startCol = getLine3dDatasetStartCol(s);
        outRow[startCol] = srcRow[xIndex] ?? '';
        const values = [];
        for(let rep = 0; rep < replicates; rep += 1){
          const colIndex = 1 + s * replicates + rep;
          const yVal = parseFloat(srcRow[colIndex]);
          if(Number.isFinite(yVal)){
            values.push(yVal);
          }
        }
        const mean = values.length ? (values.reduce((sum, val)=>sum + val, 0) / values.length) : null;
        outRow[startCol + 1] = mean != null ? mean : '';
        outRow[startCol + 2] = mean != null ? 0 : '';
      }
      newData[outRowIndex] = outRow;
    }
    return { data: newData, seriesCount, groupLabels };
  }

  function buildLine2dMatrixFrom3d(matrix){
    const normalized = applyLine3dHeaderRow(matrix, inferLine3dSeriesCount(matrix));
    const seriesCount = Math.max(0, inferLine3dSeriesCount(normalized));
    const targetCols = 1 + seriesCount;
    const sourceDataRows = Math.max(0, normalized.length - LINE_3D_HEADER_ROW_COUNT);
    const totalRows = Math.max(DEFAULT_ROWS, sourceDataRows + 1);
    const newData = new Array(totalRows);
    const axisRow = Array.isArray(normalized[LINE_3D_AXIS_HEADER_ROW_INDEX]) ? normalized[LINE_3D_AXIS_HEADER_ROW_INDEX] : [];
    const xHeader = axisRow[0] && String(axisRow[0]).trim() ? String(axisRow[0]).trim() : 'X';
    const headerRow = new Array(targetCols).fill('');
    headerRow[0] = xHeader;
    for(let s = 0; s < seriesCount; s += 1){
      headerRow[1 + s] = lineSeriesGroupLabels?.[s] || `Series ${s + 1}`;
    }
    newData[0] = headerRow;
    for(let outRowIndex = 1; outRowIndex < totalRows; outRowIndex += 1){
      const srcRow = Array.isArray(normalized[LINE_3D_HEADER_ROW_COUNT + outRowIndex - 1])
        ? normalized[LINE_3D_HEADER_ROW_COUNT + outRowIndex - 1]
        : [];
      const outRow = new Array(targetCols).fill('');
      outRow[0] = srcRow[0] ?? '';
      for(let s = 0; s < seriesCount; s += 1){
        const startCol = getLine3dDatasetStartCol(s);
        outRow[1 + s] = srcRow[startCol + 1] ?? '';
      }
      newData[outRowIndex] = outRow;
    }
    return { data: newData, seriesCount };
  }

  function enterLine3dMode(options = {}){
    const skipDraw = options.skipDraw === true;
    const resetRotation = options.resetRotation === true;
    const modeCache = getActiveLineModeCache({ reason: 'line-enter-3d-mode-cache' });
    const isAlready3d = getLineViewState().viewMode === '3d';
    const was3d = isAlready3d;
    if(resetRotation && !was3d){
      resetLine3dRotation('view-mode-change');
    }
    if(isAlready3d){
      if(refs.viewMode){
        refs.viewMode.value = '3d';
      }
      if(refs.replicateMode){
        refs.replicateMode.value = '3d';
      }
      updateLineReplicateModeControls('3d');
      syncLineRuntimeControlsFromRefs({ reason: 'line-enter-3d-noop-controls' });
      applyLineTableFormatToHot(getActiveLineHotManager(), {
        reason: 'line-enter-3d-noop',
        tableFormat: '3d'
      });
      if(!skipDraw){
        scheduleLineViewRefresh('line-view-mode-noop-3d', {
          force: true,
          skipThresholdEvaluation: true
        });
      }
      return;
    }
    const hot = getActiveLineHotManager();
    if(!hot){
      getLineViewState().viewMode = '3d';
      updateLineReplicateModeControls('3d');
      syncLineRuntimeControlsFromRefs({ reason: 'line-enter-3d-no-hot-controls' });
      return;
    }
    if(getLineViewState().viewMode !== '3d'){
      const snapshot = snapshotLineHotState();
      if(snapshot){
        const previous2dFormat = lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single';
        modeCache.twoD = { ...snapshot, tableFormat: previous2dFormat };
        modeCache.lastTwoDFormat = previous2dFormat;
      }
      syncLineLast2dControlStateFromRefs(getLineProjectionTabId() || null);
    }
    getLineViewState().viewMode = '3d';
    if(refs.viewMode){
      refs.viewMode.value = '3d';
    }
    if(refs.replicateMode){
      refs.replicateMode.value = '3d';
    }
    syncLineRuntimeControlsFromRefs({ reason: 'line-enter-3d-controls' });
    stampLineHotTableFormat(hot, '3d', { reason: 'line-enter-3d-format-stamp' });
    hot.updateSettings?.({
      pinFirstRow: LINE_3D_HEADER_ROW_COUNT,
      headerRowCount: LINE_3D_HEADER_ROW_COUNT
    });
    if(modeCache.threeD){
      restoreLineHotState(modeCache.threeD, { skipControls: true });
    }else{
      const sourceMatrix = modeCache.twoD?.data || hot.getData();
      const sourceReplicates = modeCache.twoD?.replicates ?? lineReplicates;
      const converted = buildLine3dMatrixFrom2d(sourceMatrix, sourceReplicates);
      lineSeriesGroupLabels = converted.groupLabels.slice();
      ensureLineGroupShapeCapacity(converted.seriesCount);
      hot.loadData(converted.data, { source: 'line-enter-3d-data-load', skipUndo: true });
    }
    applyLineTableFormatToHot(hot, {
      reason: 'line-enter-3d-table-format',
      tableFormat: '3d',
      normalize: false
    });
    if(refs.displayMode){
      refs.displayMode.disabled = true;
      if(refs.displayMode.value !== 'line'){
        refs.displayMode.value = 'line';
      }
      lineDisplayMode = 'line';
    }
    [refs.logX, refs.logY].forEach(cb => {
      if(!cb){
        return;
      }
      cb.disabled = true;
      if(cb.checked){
        cb.checked = false;
      }
    });
    if(refs.showFrame && !refs.showFrame.checked){
      refs.showFrame.checked = true;
    }
    if(refs.showFrame){
      refs.showFrame.disabled = true;
    }
    if(refs.regressionMode){
      refs.regressionMode.disabled = true;
    }
    if(refs.showTrendLine){
      refs.showTrendLine.disabled = true;
      if(refs.showTrendLine.checked){
        refs.showTrendLine.checked = false;
      }
    }
    if(refs.showIntervals){
      refs.showIntervals.disabled = true;
      if(refs.showIntervals.checked){
        refs.showIntervals.checked = false;
      }
    }
    if(refs.showPredictionIntervals){
      refs.showPredictionIntervals.disabled = true;
      if(refs.showPredictionIntervals.checked){
        refs.showPredictionIntervals.checked = false;
      }
    }
    if(refs.forecastFieldset){
      refs.forecastFieldset.disabled = true;
    }
    updateLineReplicateModeControls('3d');
    updateLine3dNestedHeaders();
    syncLineAspectControls('enter-3d');
    if(!skipDraw){
      invalidateLineRenderCacheForTab(getLineProjectionTabId() || null, 'line-view-mode-change');
      scheduleLineViewRefresh('line-view-mode-change', {
        force: true,
        skipThresholdEvaluation: true
      });
    }
  }

  function exitLine3dMode(options = {}){
    const skipDraw = options.skipDraw === true;
    const modeCache = getActiveLineModeCache({ reason: 'line-exit-3d-mode-cache' });
    const isAlready2d = getLineViewState().viewMode !== '3d';
    if(isAlready2d){
      getLineViewState().viewMode = '2d';
      line3dLastSeriesCount = null;
      if(refs.viewMode){
        refs.viewMode.value = '2d';
      }
      if(refs.replicateMode && refs.replicateMode.value === '3d'){
        refs.replicateMode.value = modeCache.lastTwoDFormat === 'grouped' ? 'grouped' : 'single';
      }
      updateLineReplicateModeControls();
      applyLineTableFormatToHot(getActiveLineHotManager(), { reason: 'line-exit-3d-noop' });
      syncLineAspectControls('exit-3d-noop');
      if(!skipDraw){
        scheduleLineViewRefresh('line-view-mode-noop-2d', {
          force: true,
          skipThresholdEvaluation: true
        });
      }
      return;
    }
    const hot = getActiveLineHotManager();
    if(!hot){
      getLineViewState().viewMode = '2d';
      line3dLastSeriesCount = null;
      updateLineReplicateModeControls();
      return;
    }
    const snapshot3d = snapshotLineHotState();
    if(snapshot3d){
      modeCache.threeD = snapshot3d;
    }
    getLineViewState().viewMode = '2d';
    line3dLastSeriesCount = null;
    if(refs.viewMode){
      refs.viewMode.value = '2d';
    }
    const fallback2dFormat = modeCache.lastTwoDFormat === 'grouped' ? 'grouped' : 'single';
    const target2dFormat = modeCache.twoD?.tableFormat === 'grouped' ? 'grouped' : fallback2dFormat;
    if(refs.replicateMode){
      refs.replicateMode.value = target2dFormat;
    }
    stampLineHotTableFormat(hot, target2dFormat, { reason: 'line-exit-3d-format-stamp' });
    hot.updateSettings?.({
      pinFirstRow: 1,
      headerRowCount: 1
    });
    syncLineRuntimeControlsFromRefs({ reason: 'line-exit-3d-controls' });
    if(modeCache.twoD){
      lineReplicates = clampLineReplicateCount(modeCache.twoD.replicates ?? lineReplicates);
      restoreLineHotState(modeCache.twoD, { skipControls: true });
      if(refs.replicateMode){
        refs.replicateMode.value = modeCache.twoD.tableFormat === 'grouped' ? 'grouped' : 'single';
      }
    }else{
      const converted = buildLine2dMatrixFrom3d(hot.getData());
      lineReplicates = LINE_MIN_REPLICATES;
      hot.loadData(converted.data, { source: 'line-exit-3d-data-load', skipUndo: true });
    }
    if(refs.displayMode){
      refs.displayMode.disabled = false;
      const restoredMode = sanitizeLineDisplayMode(lineLast2dDisplayMode);
      refs.displayMode.value = restoredMode;
      lineDisplayMode = restoredMode;
    }
    if(refs.logX){
      refs.logX.disabled = false;
      refs.logX.checked = !!lineLast2dLogX;
    }
    if(refs.logY){
      refs.logY.disabled = false;
      refs.logY.checked = !!lineLast2dLogY;
    }
    if(refs.showFrame){
      refs.showFrame.disabled = false;
      refs.showFrame.checked = !!lineLast2dShowFrame;
    }
    if(refs.regressionMode){
      refs.regressionMode.disabled = false;
    }
    if(refs.showTrendLine){
      refs.showTrendLine.disabled = false;
      refs.showTrendLine.checked = !!lineLast2dShowTrendLine;
    }
    if(refs.showIntervals){
      refs.showIntervals.disabled = false;
      refs.showIntervals.checked = !!lineLast2dShowIntervals;
    }
    if(refs.showPredictionIntervals){
      refs.showPredictionIntervals.disabled = false;
      refs.showPredictionIntervals.checked = !!lineLast2dShowPredictionIntervals;
    }
    if(refs.forecastFieldset){
      refs.forecastFieldset.disabled = false;
    }
    updateLineReplicateModeControls();
    applyLineTableFormatToHot(getActiveLineHotManager(), { reason: 'line-exit-3d' });
    syncLineAspectControls('exit-3d');
    if(!skipDraw){
      invalidateLineRenderCacheForTab(getLineProjectionTabId() || null, 'line-view-mode-change');
      scheduleLineViewRefresh('line-view-mode-change', {
        force: true,
        skipThresholdEvaluation: true
      });
    }
  }

  const LINE_3D_ROTATION_MODEL_VERSION = 1;

  function normalizeLine3dRotationModel(value){
    if(!value || typeof value !== 'object' || Number(value.version) !== LINE_3D_ROTATION_MODEL_VERSION){
      return null;
    }
    const width = Number(value.width);
    const height = Number(value.height);
    const margin = value.margin && typeof value.margin === 'object' ? value.margin : null;
    const axisRanges = value.axisRanges && typeof value.axisRanges === 'object' ? value.axisRanges : null;
    const axisTicks = value.axisTicks && typeof value.axisTicks === 'object' ? value.axisTicks : null;
    if(!(width > 0) || !(height > 0) || !margin || !axisRanges || !axisTicks || !Array.isArray(value.series)){
      return null;
    }
    const normalizeOpacity = (raw, fallback = 1) => {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
    };
    const normalizePoint = point => {
      if(!point){ return null; }
      const x = Number(point.x);
      const y = Number(point.y);
      const z = Number(point.z);
      return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
    };
    const series = value.series.map((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : {};
      const points = Array.isArray(source.points) ? source.points.map(normalizePoint) : [];
      return {
        name: source.name != null ? String(source.name) : `Series ${index + 1}`,
        seriesIndex: Number.isInteger(source.seriesIndex) ? source.seriesIndex : index,
        shape: sanitizeLineGroupShape(source.shape, index),
        points,
        line: {
          stroke: source.line?.stroke || '#000000',
          strokeWidth: Math.max(0, Number(source.line?.strokeWidth) || 0),
          opacity: normalizeOpacity(source.line?.opacity, 1)
        },
        marker: {
          radius: Math.max(0, Number(source.marker?.radius) || 0),
          fill: source.marker?.fill || '#000000',
          fillOpacity: normalizeOpacity(source.marker?.fillOpacity, 1),
          stroke: source.marker?.stroke || '#000000',
          strokeWidth: Math.max(0, Number(source.marker?.strokeWidth) || 0),
          strokeOpacity: normalizeOpacity(source.marker?.strokeOpacity, 1)
        }
      };
    }).filter(entry => entry.points.some(Boolean));
    if(!series.length){
      return null;
    }
    const cloneAxisRange = key => ({
      min: Number(axisRanges[key]?.min),
      max: Number(axisRanges[key]?.max)
    });
    const normalizedRanges = { x: cloneAxisRange('x'), y: cloneAxisRange('y'), z: cloneAxisRange('z') };
    if(Object.values(normalizedRanges).some(range => !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min === range.max)){
      return null;
    }
    const normalizedTicks = {};
    const normalizedTickLabels = {};
    ['x', 'y', 'z'].forEach(axisKey => {
      normalizedTicks[axisKey] = (Array.isArray(axisTicks[axisKey]) ? axisTicks[axisKey] : [])
        .map(Number)
        .filter(Number.isFinite);
      normalizedTickLabels[axisKey] = (Array.isArray(value.axisTickLabels?.[axisKey]) ? value.axisTickLabels[axisKey] : [])
        .map(label => String(label));
    });
    return {
      version: LINE_3D_ROTATION_MODEL_VERSION,
      width,
      height,
      margin: {
        top: Number(margin.top) || 0,
        right: Number(margin.right) || 0,
        bottom: Number(margin.bottom) || 0,
        left: Number(margin.left) || 0
      },
      legendShiftX: Number(value.legendShiftX) || 0,
      axisRanges: normalizedRanges,
      axisTicks: normalizedTicks,
      axisTickLabels: normalizedTickLabels,
      axisLabels: {
        x: value.axisLabels?.x != null ? String(value.axisLabels.x) : 'X',
        y: value.axisLabels?.y != null ? String(value.axisLabels.y) : 'Y',
        z: value.axisLabels?.z != null ? String(value.axisLabels.z) : 'Z'
      },
      fontSize: Math.max(1, Number(value.fontSize) || 12),
      tickFontSize: Math.max(1, Number(value.tickFontSize) || Number(value.fontSize) || 12),
      axisStrokeWidth: Math.max(0, Number(value.axisStrokeWidth) || 0),
      axisColor: value.axisColor || '#000000',
      textColor: value.textColor || '#000000',
      showGrid: value.showGrid === true,
      showFrame: value.showFrame !== false,
      paneFill: value.paneFill || 'rgba(0,0,0,0.03)',
      paneOpacityRange: {
        min: normalizeOpacity(value.paneOpacityRange?.min, 0.01),
        max: normalizeOpacity(value.paneOpacityRange?.max, 0.05)
      },
      grid: {
        color: value.grid?.color || '#dddddd',
        dash: value.grid?.dash || null,
        opacity: Number.isFinite(Number(value.grid?.opacity)) ? Number(value.grid.opacity) : 1,
        strokeWidth: Math.max(0, Number(value.grid?.strokeWidth) || 0)
      },
      series
    };
  }

  function patchLine3dRotationModelStyle(session, seriesKey, patch){
    const owner = ensureLineSessionOwnershipShape(session);
    const key = String(seriesKey == null ? '' : seriesKey).trim();
    const model = normalizeLine3dRotationModel(owner?.cache?.line3dRotationModel || null);
    if(!owner || !key || !patch || typeof patch !== 'object' || !model){
      return false;
    }
    const seriesEntry = model.series.find(entry => String(entry.name || '').trim() === key);
    if(!seriesEntry){
      return false;
    }
    const normalizeOpacityFromAlpha = value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.min(1, Math.max(0, 1 - numeric)) : null;
    };
    const lineStroke = patch.lineStroke;
    const lineStrokeWidth = patch.lineStrokeWidth;
    const lineAlpha = patch.lineAlpha ?? patch.alpha;
    const markerFill = patch.markerFill ?? patch.fill;
    const markerStroke = patch.markerStroke ?? patch.stroke ?? patch.borderColor;
    const markerStrokeWidth = patch.markerStrokeWidth ?? patch.strokeWidth;
    const markerAlpha = patch.markerAlpha ?? patch.alpha;
    if(lineStroke !== undefined){ seriesEntry.line.stroke = lineStroke || seriesEntry.line.stroke; }
    if(lineStrokeWidth !== undefined && Number.isFinite(Number(lineStrokeWidth))){
      seriesEntry.line.strokeWidth = Math.max(0, Number(lineStrokeWidth));
    }
    const lineOpacity = normalizeOpacityFromAlpha(lineAlpha);
    if(lineOpacity != null){ seriesEntry.line.opacity = lineOpacity; }
    if(markerFill !== undefined){ seriesEntry.marker.fill = markerFill || seriesEntry.marker.fill; }
    if(markerStroke !== undefined){ seriesEntry.marker.stroke = markerStroke || seriesEntry.marker.stroke; }
    if(markerStrokeWidth !== undefined && Number.isFinite(Number(markerStrokeWidth))){
      seriesEntry.marker.strokeWidth = Math.max(0, Number(markerStrokeWidth));
    }
    const markerOpacity = normalizeOpacityFromAlpha(markerAlpha);
    if(markerOpacity != null){
      seriesEntry.marker.fillOpacity = markerOpacity;
      seriesEntry.marker.strokeOpacity = markerOpacity;
    }
    owner.cache.line3dRotationModel = cloneLineRuntimeValue(model, null) || model;
    return true;
  }

  function createLine3dTickFormatters(model){
    const result = {};
    ['x', 'y', 'z'].forEach(axisKey => {
      const ticks = model.axisTicks?.[axisKey] || [];
      const labels = model.axisTickLabels?.[axisKey] || [];
      result[axisKey] = value => {
        const numeric = Number(value);
        let nearest = -1;
        let distance = Infinity;
        for(let index = 0; index < ticks.length; index += 1){
          const nextDistance = Math.abs(ticks[index] - numeric);
          if(nextDistance < distance){
            distance = nextDistance;
            nearest = index;
          }
        }
        if(nearest >= 0 && labels[nearest] != null){
          return labels[nearest];
        }
        if(typeof chartStyle.formatAxisValue === 'function'){
          return chartStyle.formatAxisValue(numeric, { maxDecimals: 2 });
        }
        return Number.isFinite(numeric) ? String(numeric) : '';
      };
    });
    return result;
  }

  function clearLine3dRotationRenderer(session = null, options = {}){
    const target = ensureLineSessionOwnershipShape(session);
    if(!target){
      return false;
    }
    target.refs.rotationRenderer = null;
    target.refs.rotationSvg = null;
    if(options.clearModel === true && target.cache){
      delete target.cache.line3dRotationModel;
    }
    return true;
  }

  function bindLine3dRotationRenderer(session = null, svg = null, modelOverride = null){
    const target = ensureLineSessionOwnershipShape(session);
    const model = normalizeLine3dRotationModel(modelOverride || target?.cache?.line3dRotationModel || null);
    if(!target || !svg || svg.dataset?.viewMode !== '3d' || !model){
      if(target){
        target.refs.rotationRenderer = null;
      }
      return false;
    }
    target.cache.line3dRotationModel = cloneLineRuntimeValue(model, null) || model;
    target.refs.rotationSvg = svg;

    let dynamicGroup = svg.querySelector('[data-layer="line-3d-rotation-dynamic"]');
    if(!dynamicGroup){
      dynamicGroup = global.document.createElementNS(NS, 'g');
      dynamicGroup.setAttribute('data-layer', 'line-3d-rotation-dynamic');
    }
    const staticSelector = '[data-layer="line-3d-title"], [data-layer="line-3d-legend"]';
    const staticInsertBefore = svg.querySelector(staticSelector);
    Array.from(svg.children).forEach(node => {
      if(node === dynamicGroup
        || node.matches?.(staticSelector)
        || node.getAttribute?.('data-plot3d-rotation-hit-surface') === '1'){
        return;
      }
      node.remove();
    });
    if(dynamicGroup.parentNode !== svg){
      svg.insertBefore(dynamicGroup, staticInsertBefore || null);
    }else if(staticInsertBefore && dynamicGroup.nextSibling !== staticInsertBefore){
      svg.insertBefore(dynamicGroup, staticInsertBefore);
    }

    const paneLayer = global.document.createElementNS(NS, 'g');
    paneLayer.setAttribute('data-layer', 'line-3d-panes');
    const gridLayer = global.document.createElementNS(NS, 'g');
    gridLayer.setAttribute('data-layer', 'line-3d-grid');
    const axisLayer = global.document.createElementNS(NS, 'g');
    axisLayer.setAttribute('data-layer', 'line-3d-axes');
    const lineLayer = global.document.createElementNS(NS, 'g');
    lineLayer.setAttribute('data-layer', 'line-3d-series');
    const markerLayer = global.document.createElementNS(NS, 'g');
    markerLayer.setAttribute('data-layer', 'line-3d-markers');
    const frontFrameLayer = global.document.createElementNS(NS, 'g');
    frontFrameLayer.setAttribute('data-layer', 'frame-front');
    dynamicGroup.replaceChildren(paneLayer, gridLayer, axisLayer, lineLayer, markerLayer, frontFrameLayer);

    const axisCorners = [
      { x: model.axisRanges.x.min, y: model.axisRanges.y.min, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.min, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.min, y: model.axisRanges.y.max, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.max, z: model.axisRanges.z.min },
      { x: model.axisRanges.x.min, y: model.axisRanges.y.min, z: model.axisRanges.z.max },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.min, z: model.axisRanges.z.max },
      { x: model.axisRanges.x.min, y: model.axisRanges.y.max, z: model.axisRanges.z.max },
      { x: model.axisRanges.x.max, y: model.axisRanges.y.max, z: model.axisRanges.z.max }
    ];
    const axisTickFormatters = createLine3dTickFormatters(model);
    const seriesRuntime = model.series.map((seriesEntry, seriesIndex) => {
      const path = global.document.createElementNS(NS, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', seriesEntry.line.stroke);
      path.setAttribute('stroke-width', String(seriesEntry.line.strokeWidth));
      path.setAttribute('stroke-opacity', String(seriesEntry.line.opacity));
      path.dataset.series = seriesEntry.name;
      path.dataset.lineStyleRole = 'line';
      path.dataset.viewMode = '3d';
      path.style.cursor = 'pointer';
      path.addEventListener('click', handleLinePathClick);
      const markerGroup = global.document.createElementNS(NS, 'g');
      markerGroup.dataset.series = seriesEntry.name;
      markerGroup.dataset.lineStyleRole = 'markers';
      const markers = seriesEntry.points.map((point, pointIndex) => {
        if(!point || !(seriesEntry.marker.radius > 0)){
          return null;
        }
        const marker = createLineMarkerShape(global.document, seriesEntry.shape, {
          index: seriesEntry.seriesIndex ?? seriesIndex,
          radius: seriesEntry.marker.radius,
          cx: 0,
          cy: 0,
          fill: seriesEntry.marker.fill,
          fillOpacity: seriesEntry.marker.fillOpacity,
          stroke: seriesEntry.marker.stroke,
          strokeWidth: seriesEntry.marker.strokeWidth,
          strokeOpacity: seriesEntry.marker.strokeOpacity
        });
        if(marker){
          marker.dataset.lineRotationPointIndex = String(pointIndex);
          attachLineMarkerTooltip(marker, seriesEntry, point);
        }
        return marker;
      });
      return { model: seriesEntry, path, markerGroup, markers };
    });

    const render = rotation => {
      if(!dynamicGroup.isConnected
        || target.refs?.rotationSvg !== svg
        || svg.dataset?.viewMode !== '3d'
        || (typeof plot3d.isRotationOwnerActive === 'function'
          && !plot3d.isRotationOwnerActive(target, 'line', svg))){
        return false;
      }
      const ownerRotation = rotation || getLineViewState(target).rotation;
      if(typeof plot3d.normalizeRotation === 'function'){
        plot3d.normalizeRotation(ownerRotation);
      }
      const rotate = point => plot3d.rotatePoint(point, ownerRotation);
      const rotatedCorners = axisCorners.map(rotate);
      const rotatedSeries = seriesRuntime.map(runtime => runtime.model.points.map(point => point ? rotate(point) : null));
      const rotatedPoints = [];
      rotatedSeries.forEach(points => points.forEach(point => {
        if(point){ rotatedPoints.push(point); }
      }));
      const projector = plot3d.createProjector({
        rotatedPoints,
        rotatedCorners,
        width: model.width,
        height: model.height,
        margin: model.margin,
        shiftX: model.legendShiftX
      });
      const project = point => projector.project(point);

      paneLayer.replaceChildren();
      gridLayer.replaceChildren();
      axisLayer.replaceChildren();
      frontFrameLayer.replaceChildren();
      const createElement = (tag, attrs, text, targetNode) => {
        const node = global.document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(key => node.setAttribute(key, String(attrs[key])));
        if(text != null && text !== ''){ node.textContent = String(text); }
        (targetNode || axisLayer).appendChild(node);
        return node;
      };
      plot3d.renderAxesAndGrid({
        svg,
        project,
        rotatePoint: rotate,
        axisRanges: model.axisRanges,
        axisTicks: model.axisTicks,
        axisLabels: model.axisLabels,
        fontSize: model.fontSize,
        tickFontSize: model.tickFontSize,
        axisStrokeWidth: model.axisStrokeWidth,
        axisColor: model.axisColor,
        frameColor: model.axisColor,
        tickTextColor: model.textColor,
        axisLabelColor: model.textColor,
        showPanes: model.showFrame,
        paneFill: model.paneFill,
        paneOpacityRange: model.paneOpacityRange,
        gridColor: model.grid.color,
        gridDash: model.grid.dash || undefined,
        gridOpacity: model.grid.opacity,
        gridStrokeWidth: model.grid.strokeWidth,
        gridOutlineColors: { primary: model.grid.color, secondary: model.grid.color },
        chartStyle,
        showGrid: model.showGrid,
        showFrame: model.showFrame,
        axisTickFormatters,
        paneTarget: paneLayer,
        gridTarget: gridLayer,
        axisTarget: axisLayer,
        frontFrameTarget: frontFrameLayer,
        debugLabel: 'line-3d-rotation',
        onAxisTickLabel: (node, axisKey) => {
          const role = axisKey === 'z' ? 'zTick' : (axisKey === 'y' ? 'yTick' : 'xTick');
          markFontEditable(node, role, role);
        },
        onAxisLabel: (node, axisKey) => {
          if(!node){ return; }
          const role = axisKey === 'z' ? 'zTitle' : (axisKey === 'y' ? 'yTitle' : 'xTitle');
          const defaultLabel = axisKey === 'y' ? 'Y title' : (axisKey === 'z' ? 'Z' : 'X');
          const applyAxisLabel = value => {
            const resolved = value != null && String(value).trim() ? String(value).trim() : defaultLabel;
            model.axisLabels[axisKey] = resolved;
            const patch = axisKey === 'x' ? { x: resolved } : (axisKey === 'y' ? { y: resolved } : { z: resolved });
            patchLineLabelsState(target, patch, { reason: 'line-3d-axis-label-edit' });
            syncLine3dAxisHeader(axisKey, resolved, { source: 'line-axis-inline' });
            if(node.textContent !== resolved){ node.textContent = resolved; }
            scheduleLineDrawForSession(target, { viewOnly: true, force: true, reason: `line-axis-label-${axisKey}` });
            return resolved;
          };
          markFontEditable(node, role, role);
          makeEditableHelper(node, text => {
            const previous = model.axisLabels[axisKey] || '';
            const nextValue = applyAxisLabel(text);
            if(previous !== nextValue){
              recordLineChange(`line:${axisKey}-label`, previous, nextValue, applyAxisLabel);
            }
          });
        },
        createElement
      });

      const projectedSeries = seriesRuntime.map((runtime, seriesIndex) => {
        const projected = rotatedSeries[seriesIndex].map(point => point ? project(point) : null);
        const depths = projected.filter(Boolean).map(point => point.depth);
        return {
          runtime,
          projected,
          depth: depths.length ? depths.reduce((sum, value) => sum + value, 0) / depths.length : 0
        };
      }).sort((a, b) => a.depth - b.depth);

      const orderedPaths = global.document.createDocumentFragment();
      const orderedMarkerGroups = global.document.createDocumentFragment();
      projectedSeries.forEach(entry => {
        let pathData = '';
        let started = false;
        entry.projected.forEach(point => {
          if(point && Number.isFinite(point.x) && Number.isFinite(point.y)){
            pathData += `${started ? 'L' : 'M'}${point.x} ${point.y}`;
            started = true;
          }else{
            started = false;
          }
        });
        entry.runtime.path.setAttribute('d', pathData);
        entry.runtime.path.style.display = pathData ? '' : 'none';
        orderedPaths.appendChild(entry.runtime.path);
        const markerEntries = [];
        entry.projected.forEach((point, pointIndex) => {
          const marker = entry.runtime.markers[pointIndex];
          if(!marker || !point){ return; }
          marker.setAttribute('transform', `translate(${point.x} ${point.y})`);
          markerEntries.push({ marker, depth: Number(point.depth) || 0 });
        });
        markerEntries.sort((a, b) => a.depth - b.depth);
        const markerFragment = global.document.createDocumentFragment();
        markerEntries.forEach(item => markerFragment.appendChild(item.marker));
        entry.runtime.markerGroup.replaceChildren(markerFragment);
        orderedMarkerGroups.appendChild(entry.runtime.markerGroup);
      });
      lineLayer.replaceChildren(orderedPaths);
      markerLayer.replaceChildren(orderedMarkerGroups);
      return true;
    };

    target.refs.rotationRenderer = render;
    return render(getLineViewState(target).rotation);
  }

  function bindActiveLine3dRotationRenderer(ownerSession = null){
    const target = ensureLineSessionOwnershipShape(ownerSession || getLineActiveSessionForState());
    const root = target?.refs?.root || target?.root || null;
    const svg = target?.refs?.rotationSvg || root?.querySelector?.('#linePlot #lineSvg') || null;
    return bindLine3dRotationRenderer(target, svg, target?.cache?.line3dRotationModel || null);
  }

  function rehydrateActiveLine3dInteraction(ownerSession = null, debugLabel = 'line-3d-rehydrate'){
    const target = ensureLineSessionOwnershipShape(ownerSession || getLineActiveSessionForState());
    if(!target){
      return false;
    }
    const rendererBound = bindActiveLine3dRotationRenderer(target);
    const controlsBound = bindActiveLine3dRotationControls(debugLabel, target);
    return rendererBound || controlsBound;
  }

  function resetLineRotationFrameState(session = null){
    const target = ensureLineSessionOwnershipShape(session);
    if(!target){
      return false;
    }
    const viewState = getLineViewState(target);
    viewState.rotationPending = false;
    viewState.rotationPendingLogged = false;
    if(target.state){
      target.state.viewState = viewState;
      stampLineSessionState(target);
    }
    return true;
  }

  function scheduleLineRotationRedraw(rotation = null, session = null, svg = null){
    const target = ensureLineSessionOwnershipShape(session || getLineActiveSessionForState());
    const ownerSvg = svg || target?.refs?.rotationSvg || null;
    if(!target || (typeof plot3d.isRotationOwnerActive === 'function'
      && !plot3d.isRotationOwnerActive(target, 'line', ownerSvg))){
      return false;
    }
    const viewState = getLineViewState(target);
    commitLineRotationState(rotation || viewState.rotation, target, 'line-rotation-change');
    if(viewState.rotationPending){
      if(!viewState.rotationPendingLogged && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: line rotation frame coalesced', { tabId: target.tabId || null });
      }
      viewState.rotationPendingLogged = true;
      return true;
    }
    viewState.rotationPending = true;
    viewState.rotationPendingLogged = false;
    const clearPending = () => resetLineRotationFrameState(target);
    const runFrame = () => {
      clearPending();
      if(typeof plot3d.isRotationOwnerActive === 'function'
        && !plot3d.isRotationOwnerActive(target, 'line', ownerSvg)){
        return;
      }
      const renderer = target.refs?.rotationRenderer;
      const ownerRotation = getLineViewState(target).rotation;
      if(typeof renderer === 'function' && renderer(ownerRotation) === true){
        return;
      }
      scheduleLineDrawForSession(target, {
        viewOnly: true,
        silentOverlay: true,
        force: true,
        userInitiated: true,
        reason: 'rotation-renderer-fallback'
      });
    };
    const scheduled = Shared.componentLifecycle?.scheduleComponentFrame?.(line, 'line', {
      tabId: target.tabId || null,
      reason: 'line-3d-rotation-frame'
    }, runFrame);
    if(!scheduled){
      clearPending();
      return false;
    }
    return true;
  }

  function bindLine3dRotationControls(svg, debugLabel, ownerSession = null){
    if(!svg || !svg.dataset || svg.dataset.viewMode !== '3d'){
      return false;
    }
    const rotationSession = ensureLineSessionOwnershipShape(ownerSession || getLineActiveSessionForState());
    if(!rotationSession){
      return false;
    }
    rotationSession.refs.rotationSvg = svg;
    const rotationState = commitLineRotationState(getLineViewState(rotationSession).rotation, rotationSession, 'line-rotation-bind');
    if(typeof plot3d.ensureRotationHitSurface === 'function'){
      plot3d.ensureRotationHitSurface(svg, { debugLabel: debugLabel || 'line-3d' });
    }
    plot3d.attachRotationControls(svg, {
      state: rotationState,
      managesGraphEditGesture: true,
      ownerSession: rotationSession,
      componentKey: 'line',
      onStart: (_event, state) => commitLineRotationState(state, rotationSession, 'line-rotation-start'),
      onChange: (_event, state) => scheduleLineRotationRedraw(state, rotationSession, svg),
      onEnd: (_event, state, gesture) => {
        commitLineRotationState(state, rotationSession, 'line-rotation-end');
        if(gesture?.didMove && gesture?.canceled !== true){
          persistLineRotationState(rotationSession, 'line-rotation-end');
          markLineViewMutation(rotationSession?.tabId || null, 'line-rotation-change');
        }
      },
      shouldIgnorePointer: (event) => {
        if(typeof plot3d.isInteractivePointerTarget === 'function'){
          return plot3d.isInteractivePointerTarget(event?.target);
        }
        return plot3d.isLegendPointerTarget(event?.target);
      },
      debugLabel: debugLabel || 'line-3d'
    });
    lineDebug('Debug: line 3d rotation handlers bound', {
      label: debugLabel || 'line-3d'
    });
    return true;
  }

  function bindActiveLine3dRotationControls(debugLabel, ownerSession = null){
    const rotationSession = ensureLineSessionOwnershipShape(ownerSession || getLineActiveSessionForState());
    const ownerRoot = rotationSession?.refs?.root || rotationSession?.root || null;
    if(!rotationSession || !ownerRoot){
      return false;
    }
    const referencedPlot = rotationSession.refs?.plot || null;
    const plot = referencedPlot && ownerRoot.contains?.(referencedPlot)
      ? referencedPlot
      : ownerRoot.querySelector?.('#linePlot');
    const svg = plot ? (plot.querySelector('#lineSvg') || plot.querySelector('svg')) : null;
    return bindLine3dRotationControls(svg, debugLabel, rotationSession);
  }

  function removeLineGroupAt(index){
    if(lineReplicates <= LINE_MIN_REPLICATES){
      console.debug('Debug: line grouped remove blocked',{ index, reason: 'single-mode' });
      return;
    }
    const labels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    const listCount = getLineGroupedListCount();
    const currentSeriesCount = Math.max(listCount || labels.length || 1, 1);
    if(labels.length > currentSeriesCount){
      labels.length = currentSeriesCount;
    }
    while(labels.length < currentSeriesCount){
      labels.push(`Series ${labels.length + 1}`);
    }
    if(labels.length <= 1 || !Number.isInteger(index) || index < 0 || index >= labels.length){
      console.debug('Debug: line grouped remove blocked',{ index, length: labels.length });
      return;
    }
    const replicates = Math.max(lineReplicates, LINE_MIN_REPLICATES);
    const hot = getActiveLineHotManager();
    const matrix = hot ? hot.getData() : [];
    const start = 1 + index * replicates;
    const end = start + replicates;
    const trimmed = Array.isArray(matrix)
      ? matrix.map(row => {
        if(!Array.isArray(row)){
          return [];
        }
        const prefix = row.slice(0, start);
        const suffix = row.slice(end);
        return prefix.concat(suffix);
      })
      : [];
    labels.splice(index, 1);
    const shapes = Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [];
    if(shapes.length > index){
      shapes.splice(index, 1);
    }
    console.debug('Debug: line grouped remove',{ index, remaining: labels.length });
    applyLineReplicateChange(lineReplicates, {
      dataOverride: trimmed,
      sourceReplicates: lineReplicates,
      skipDraw: true,
      minSeriesCount: Math.max(labels.length, 1),
      groupLabels: labels,
      groupShapes: shapes,
      resetGroupLabels: true
    });
    renderLineGroupedList();
    scheduleActiveLineDraw();
  }


  function ensureLineLabelColors(labels, session = null){
    const owner = resolveLineStateSession(session || getLineActiveSessionForState());
    const nextColors = cloneLineRuntimeValue(getLineLabelsState(owner).colors, {}) || {};
    let changed = false;
    const labelSet = new Set(labels);
    labels.forEach((lab,i)=>{
      if(!nextColors[lab]){
        nextColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
        changed = true;
        console.debug('Debug: line default label color applied',{label:lab,color:nextColors[lab]});
      }
    });
    Object.keys(nextColors).forEach(label => {
      if(!labelSet.has(label)){
        delete nextColors[label];
        changed = true;
      }
    });
    if(changed){ patchLineLabelsState(owner, { colors: nextColors }, { reason: 'line-label-color-defaults' }); }
    lineLabelColors = cloneLineRuntimeValue(nextColors, {}) || {};
    console.debug('Debug: ensureLineLabelColors sync complete',{count:Object.keys(nextColors).length});
  }

  function upsertLineResidualsDataView(series, options = {}){
    const hot = line.__ensureHotForActiveTab?.() || getActiveLineHotManager() || refs.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return false;
    }
    const manager = ensureLineDataViewsForHot(hot, {
      wrapper: refs.hotWrapper,
      container: hot.__lineHostContainer || refs.hotContainer
    });
    if(!manager || typeof manager.createDerivedView !== 'function'){
      return false;
    }
    const source = hot.getData() || [];
    if(!Array.isArray(source) || source.length < 2){
      return false;
    }
    const matrix = source.map(row => (Array.isArray(row) ? row.slice() : []));
    const header = Array.isArray(matrix[0]) ? matrix[0] : [];
    const replicates = Math.max(LINE_MIN_REPLICATES, Number(lineReplicates) || LINE_MIN_REPLICATES);
    const seriesByName = new Map((Array.isArray(series) ? series : []).map(entry => [entry?.name, entry]));
    for(let s = 0; s < Math.max(0, Math.floor((header.length - 1) / replicates)); s += 1){
      const colStart = 1 + (s * replicates);
      const label = String(header[colStart] != null ? header[colStart] : `Series ${s + 1}`).trim() || `Series ${s + 1}`;
      const seriesEntry = seriesByName.get(label) || null;
      const model = seriesEntry?.regression || null;
      if(typeof model?.predict !== 'function' || !Array.isArray(seriesEntry?.points)){
        continue;
      }
      for(let rowOffset = 0; rowOffset < seriesEntry.points.length; rowOffset += 1){
        const point = seriesEntry.points[rowOffset];
        if(!point || !Number.isFinite(point.x)){
          continue;
        }
        const prediction = Number(model.predict(point.x));
        if(!Number.isFinite(prediction)){
          continue;
        }
        const matrixRowIndex = rowOffset + 1;
        const matrixRow = Array.isArray(matrix[matrixRowIndex]) ? matrix[matrixRowIndex] : null;
        if(!matrixRow){
          continue;
        }
        const replicateValues = Array.isArray(point.replicates) && point.replicates.length
          ? point.replicates
          : [point.y];
        for(let rep = 0; rep < replicates; rep += 1){
          const colIndex = colStart + rep;
          if(colIndex >= matrixRow.length){
            continue;
          }
          const sourceValue = Number(replicateValues[rep]);
          if(Number.isFinite(sourceValue)){
            matrixRow[colIndex] = sourceValue - prediction;
          }else if(rep === 0 && Number.isFinite(point.y)){
            matrixRow[colIndex] = point.y - prediction;
          }else{
            matrixRow[colIndex] = '';
          }
        }
      }
      for(let rep = 0; rep < replicates; rep += 1){
        const colIndex = colStart + rep;
        if(colIndex < header.length){
          const suffix = replicates > 1 ? ` (residual r${rep + 1})` : ' (residual)';
          header[colIndex] = `${label}${suffix}`;
        }
      }
    }
    const staleResidualViews = (manager.getViews?.() || [])
      .filter(view => view && view.kind !== 'raw' && String(view?.summary?.transform || '').toLowerCase() === 'residuals');
    staleResidualViews.forEach(view => manager.removeView?.(view.id, { silent: true, reason: 'replace-residuals' }));
    manager.createDerivedView({
      title: options.title || 'Residuals',
      data: matrix,
      sourceViewId: manager.getActiveViewId?.() || null,
      transformSpec: { type: 'residuals' },
      summary: {
        transform: 'residuals',
        rows: Math.max(0, matrix.length - 1),
        cols: header.length,
        seriesCount: Array.isArray(series) ? series.length : 0,
        generatedAt: Date.now()
      },
      activate: options.activate === true,
      reason: options.reason || 'line-residuals'
    });
    manager.refresh?.();
    lineDebug('Debug: line residuals data view updated', {
      rows: Math.max(0, matrix.length - 1),
      cols: header.length
    });
    return true;
  }

  function computeLineCorrelationConfidenceInterval(r, n, alpha){
    const rNum = Number(r);
    const count = Number(n);
    if(!Number.isFinite(rNum) || !Number.isFinite(count) || count <= 3){
      return null;
    }
    const clamped = Math.max(-0.999999999999, Math.min(0.999999999999, rNum));
    const z = 0.5 * Math.log((1 + clamped) / (1 - clamped));
    const se = 1 / Math.sqrt(count - 3);
    if(!Number.isFinite(se) || se <= 0){
      return null;
    }
    const normal = global.jStat?.normal;
    const zCritical = (normal && typeof normal.inv === 'function')
      ? normal.inv(1 - ((alpha || 0.05) / 2), 0, 1)
      : 1.959963984540054;
    const loZ = z - (zCritical * se);
    const hiZ = z + (zCritical * se);
    const toR = value => {
      const e2 = Math.exp(2 * value);
      return (e2 - 1) / (e2 + 1);
    };
    return { low: toR(loZ), high: toR(hiZ), method: 'fisher-z' };
  }

  function hasLineDuplicateValues(values){
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

  function computeLineSpearmanExactP(rho, n){
    const size = Number(n);
    const observed = Math.abs(Number(rho));
    if(!Number.isFinite(size) || !Number.isFinite(observed) || size < 3 || size > 9){
      return null;
    }
    const ranks = Array.from({ length: size }, (_, idx) => idx + 1);
    let total = 0;
    let extreme = 0;
    const denom = size * (Math.pow(size, 2) - 1);
    const tolerance = 1e-12;
    const backtrack = index => {
      if(index >= size){
        let d2 = 0;
        for(let i = 0; i < size; i += 1){
          const d = (i + 1) - ranks[i];
          d2 += d * d;
        }
        const permRho = 1 - ((6 * d2) / denom);
        total += 1;
        if(Math.abs(permRho) >= observed - tolerance){
          extreme += 1;
        }
        return;
      }
      for(let i = index; i < size; i += 1){
        const tmp = ranks[index];
        ranks[index] = ranks[i];
        ranks[i] = tmp;
        backtrack(index + 1);
        ranks[i] = ranks[index];
        ranks[index] = tmp;
      }
    };
    backtrack(0);
    if(!total){
      return null;
    }
    return extreme / total;
  }

  function computeLineCorrelationStats(method, x, y, jStatLib){
    const n = x.length;
    const pearson = jStatLib.corrcoeff(x, y);
    const alpha = 0.05;
    if(method === 'pearson'){
      const bounded = Math.max(-0.999999999999, Math.min(0.999999999999, pearson));
      const t = bounded * Math.sqrt((n - 2) / Math.max(1e-12, 1 - (bounded * bounded)));
      const p = lineStudentTTwoSidedPValue(t, n - 2);
      return {
        label: 'Pearson',
        r: pearson,
        p,
        pMethod: 'Student t approximation',
        ci: computeLineCorrelationConfidenceInterval(pearson, n, alpha),
        ciApproximate: false
      };
    }
    const spearman = jStatLib.spearmancoeff(x, y);
    const hasTies = hasLineDuplicateValues(x) || hasLineDuplicateValues(y);
    let p = NaN;
    let pMethod = 't approximation';
    if(!hasTies && n <= 9){
      const exact = computeLineSpearmanExactP(spearman, n);
      if(Number.isFinite(exact)){
        p = exact;
        pMethod = 'exact permutation';
      }
    }
    if(!Number.isFinite(p)){
      const bounded = Math.max(-0.999999999999, Math.min(0.999999999999, spearman));
      const t = bounded * Math.sqrt((n - 2) / Math.max(1e-12, 1 - (bounded * bounded)));
      p = lineStudentTTwoSidedPValue(t, n - 2);
    }
    return {
      label: 'Spearman',
      r: spearman,
      p,
      pMethod,
      ci: computeLineCorrelationConfidenceInterval(spearman, n, alpha),
      ciApproximate: true
    };
  }

  function buildLinePlotStatsLines(series, options = {}){
    const list = Array.isArray(series) ? series.filter(entry => entry?.regression) : [];
    if(!list.length){ return []; }
    const regressionMode = String(options.regressionMode || '').toLowerCase();
    const formatValue = value => Number.isFinite(Number(value)) ? formatMetricValue(Number(value), 3) : 'n/a';
    const formatRegression = (entry, compact = false) => {
      const model = entry.regression || {};
      const summary = typeof regressionTools.createSummary === 'function' ? regressionTools.createSummary(model) : (model.summary || {});
      const metrics = summary?.metrics || model.metrics || {};
      if(['arima','holtwinters'].includes(String(model.mode || regressionMode).toLowerCase())){
        const bits = [];
        if(Number.isFinite(Number(metrics.rmse))){ bits.push(`RMSE = ${formatValue(metrics.rmse)}`); }
        if(Number.isFinite(Number(metrics.mae))){ bits.push(`MAE = ${formatValue(metrics.mae)}`); }
        return `${entry.name}: ${bits.join('; ') || String(model.mode || regressionMode).toUpperCase()}`;
      }
      const coeffs = Array.isArray(model.coefficientStats) ? model.coefficientStats : [];
      const slope = coeffs.find(item => String(item?.term || '').toLowerCase() === 'slope');
      const r2 = Number(metrics.r2);
      if(compact){
        const primary = Number.isFinite(Number(slope?.estimate)) ? `slope = ${formatValue(slope.estimate)}` : (Number.isFinite(r2) ? `R² = ${formatValue(r2)}` : 'fit available');
        return `${entry.name}: ${primary}${Number.isFinite(r2) && !primary.startsWith('R²') ? `; R² = ${formatValue(r2)}` : ''}`;
      }
      const bits = [];
      if(Number.isFinite(Number(slope?.estimate))){
        let slopeText = `slope = ${formatValue(slope.estimate)}`;
        if(Number.isFinite(Number(slope?.ciLow)) && Number.isFinite(Number(slope?.ciHigh))){
          slopeText += `; 95% CI [${formatValue(slope.ciLow)}, ${formatValue(slope.ciHigh)}]`;
        }
        bits.push(slopeText);
        if(Number.isFinite(Number(slope?.p))){
          bits.push(formatLinePExpression(Number(slope.p)));
        }
      }
      if(Number.isFinite(r2)){ bits.push(`R² = ${formatValue(r2)}`); }
      const n = Number(metrics.sampleSize);
      if(Number.isFinite(n)){ bits.push(`n = ${Math.round(n)}`); }
      return `${entry.name ? `${entry.name}: ` : ''}${bits.join('; ')}`;
    };
    if(list.length === 1){ return [formatRegression(list[0], false)]; }
    if(list.length <= 4){ return list.map(entry => formatRegression(entry, true)); }
    return [];
  }

  function computeLineDerivedRegressionStats(regressionModel){
    const mode = String(regressionModel?.mode || '').toLowerCase();
    if(mode !== 'linear' && mode !== 'linearthroughorigin'){
      return null;
    }
    const coefficientStats = Array.isArray(regressionModel?.coefficientStats) ? regressionModel.coefficientStats : [];
    const interceptStat = coefficientStats.find(stat => String(stat?.term || '').toLowerCase() === 'intercept') || null;
    const slopeStat = coefficientStats.find(stat => String(stat?.term || '').toLowerCase() === 'slope') || null;
    const intercept = Number.isFinite(interceptStat?.estimate)
      ? interceptStat.estimate
      : Number(regressionModel?.summary?.intercept);
    const slope = Number.isFinite(slopeStat?.estimate)
      ? slopeStat.estimate
      : Number(regressionModel?.summary?.slope);
    if(!Number.isFinite(slope) || slope === 0){
      return null;
    }
    const reciprocalSlope = 1 / slope;
    let reciprocalSlopeCi = null;
    if(Number.isFinite(slopeStat?.ciLow) && Number.isFinite(slopeStat?.ciHigh) && slopeStat.ciLow !== 0 && slopeStat.ciHigh !== 0){
      const lo = 1 / slopeStat.ciLow;
      const hi = 1 / slopeStat.ciHigh;
      reciprocalSlopeCi = { low: Math.min(lo, hi), high: Math.max(lo, hi) };
    }
    let xIntercept = null;
    let xInterceptCi = null;
    if(Number.isFinite(intercept)){
      xIntercept = -intercept / slope;
      const covariance = Array.isArray(regressionModel?.coefficientCovariance) ? regressionModel.coefficientCovariance : null;
      const tCritical = Number(regressionModel?.intervals?.tCritical);
      if(covariance && Number.isFinite(tCritical) && covariance.length >= 2){
        const varIntercept = Number(covariance?.[0]?.[0]);
        const varSlope = Number(covariance?.[1]?.[1]);
        const covInterceptSlope = Number(covariance?.[0]?.[1]);
        if(Number.isFinite(varIntercept) && Number.isFinite(varSlope) && Number.isFinite(covInterceptSlope)){
          const variance = (varIntercept / (slope * slope))
            + ((intercept * intercept * varSlope) / Math.pow(slope, 4))
            - ((2 * intercept * covInterceptSlope) / Math.pow(slope, 3));
          if(Number.isFinite(variance) && variance >= 0){
            const se = Math.sqrt(variance);
            xInterceptCi = {
              low: xIntercept - (tCritical * se),
              high: xIntercept + (tCritical * se)
            };
          }
        }
      }
    }
    return {
      xIntercept,
      xInterceptCi,
      reciprocalSlope,
      reciprocalSlopeCi
    };
  }

  // PART: STATS
  function computeLineStats(points,method,jStatLib,regressionMode,options = {}){
    const x=points.map(p=>p.x);
    const y=points.map(p=>p.y);
    const n=points.length;
    if(n<3) return null;
    const correlation = computeLineCorrelationStats(method, x, y, jStatLib);
    const r = correlation.r;
    const p = correlation.p;
    const label = correlation.label;
    const alpha = Number.isFinite(options.alpha) ? options.alpha : 0.05;
    let regressionModel=options.precomputedRegression || null;
    if(!regressionModel && typeof regressionTools.fitRegression==='function'){
      try{
        regressionModel=regressionTools.fitRegression(points,{ mode: regressionMode, alpha, forecast: options.forecast });
      }catch(err){
        console.error('line compute regression error', err);
      }
    }
    const slopeFallback = (()=>{
      const xMean=jStatLib.mean(x);
      const yMean=jStatLib.mean(y);
      const num=x.reduce((s,xi,i)=>s+(xi-xMean)*(y[i]-yMean),0);
      const den=x.reduce((s,xi)=>s+Math.pow(xi-xMean,2),0);
      return den!==0?num/den:NaN;
    })();
    const summaryForRegression = regressionModel?.summary;
    let slope = Number.isFinite(summaryForRegression?.slope) ? summaryForRegression.slope : slopeFallback;
    let slopeLabel = 'Slope';
    if(summaryForRegression?.primaryParameter && Number.isFinite(summaryForRegression.primaryParameter.value)){
      slope = summaryForRegression.primaryParameter.value;
      if(summaryForRegression.primaryParameter.label){
        slopeLabel = summaryForRegression.primaryParameter.label;
      }
    }
    const derived = computeLineDerivedRegressionStats(regressionModel);
    console.debug('Debug: computeLineStats',{method:label,r,p,slope,regressionMode,slopeLabel,pMethod: correlation.pMethod}); // Debug: stats computation
    return {
      method:label,
      r,
      p,
      pMethod: correlation.pMethod,
      correlationCI: correlation.ci,
      correlationCiApproximate: !!correlation.ciApproximate,
      slope,
      slopeLabel,
      regression:regressionModel,
      derived
    };
  }

  function updateLineStats(series, options = {}){
    const session = ensureLineSessionOwnershipShape(options.session || getLineActiveSessionForState());
    const lineRefs = resolveLineRefsContext(session, options);
    const statsResults = lineRefs.statsResults || null;
    if(!lineRefs.statType || !statsResults) return;
    const jStatLib = global.jStat;
    if(!jStatLib){
      statsResults.textContent='Statistics unavailable (jStat missing).';
      return;
    }
    const method=lineRefs.statType.value||'pearson';
    const regressionMode=lineRefs.regressionMode?.value || 'linear';
    const regressionModeLabel = getLineRegressionLabel(regressionMode);
    let parameterColumnLabel = 'Slope';
    let parameterLabelResolved = false;
    const rSquaredLabel = String(regressionMode || '').toLowerCase() === 'linearthroughorigin'
      ? 'Uncentered R²'
      : 'R²';
    const showIntervals = !!options.showIntervals;
    const showDiagnostics = isLineDiagnosticsEnabled();
    const regressionAlpha = Number.isFinite(options.alpha) ? options.alpha : 0.05;
    const regressionCache = options.regressionCache instanceof Map ? options.regressionCache : new Map();
    renderLineStatsAdvisor(series, { ...options, session, refs: lineRefs, showIntervals, showDiagnostics });
    console.debug('Debug: updateLineStats',{seriesCount:series.length,method,regressionMode,showIntervals,showDiagnostics}); // Debug: stats update entry
    const tableRows=[];
    const intervalRows=[];
    const diagnosticRows=[];
    const coefficientRows=[];
    const parameterRows=[];
    const seasonalRows=[];
    const forecastRows=[];
    let methodLabel='';
    const regressionSummaries = [];
    series.forEach(s=>{
      const pts=s.points.filter(Boolean);
      if(pts.length>=3){
        const cached = regressionCache.get(s.name);
        const stats=computeLineStats(pts,method,jStatLib,regressionMode,{ alpha: regressionAlpha, precomputedRegression: cached, forecast: options.forecast });
        if(stats){
          s.regression = stats.regression || null;
          methodLabel=stats.method;
          const summary = typeof regressionTools.createSummary === 'function' ? regressionTools.createSummary(stats.regression) : null;
          regressionSummaries.push({ name: s.name, mode: regressionMode, summary });
          const r2Value = summary?.metrics?.r2 ?? stats.regression?.metrics?.r2;
          const adjR2Value = summary?.metrics?.adjR2 ?? stats.regression?.metrics?.adjR2;
          const rmseValue = summary?.metrics?.rmse ?? stats.regression?.metrics?.rmse;
          const maeValue = summary?.metrics?.mae ?? stats.regression?.metrics?.mae;
          const logLossValue = summary?.metrics?.logLoss ?? stats.regression?.metrics?.logLoss;
          const predictorCount = Number(summary?.metrics?.predictors ?? stats.regression?.metrics?.predictors);
          const sampleSizeValue = summary?.metrics?.sampleSize ?? stats.regression?.metrics?.sampleSize ?? pts.length;
          const isForecastModel = ['arima', 'holtwinters'].includes(String(stats.regression?.mode || regressionMode || '').toLowerCase());
          const modelF = !isForecastModel && Number.isFinite(r2Value) && Number.isFinite(sampleSizeValue) && Number.isFinite(predictorCount)
            && sampleSizeValue > (predictorCount + 1) && predictorCount > 0 && r2Value < 1
            ? (r2Value / predictorCount) / ((1 - r2Value) / (sampleSizeValue - predictorCount - 1))
            : NaN;
          const modelFP = Number.isFinite(modelF) && Number.isFinite(predictorCount) && Number.isFinite(sampleSizeValue)
            && global.jStat?.centralF && typeof global.jStat.centralF.cdf === 'function'
            ? lineFUpperTailPValue(modelF, predictorCount, sampleSizeValue - predictorCount - 1)
            : NaN;
          const corrCi = stats.correlationCI && Number.isFinite(stats.correlationCI.low) && Number.isFinite(stats.correlationCI.high)
            ? `${formatMetricValue(stats.correlationCI.low)} to ${formatMetricValue(stats.correlationCI.high)}`
            : 'n/a';
          if(!parameterLabelResolved && typeof stats.slopeLabel === 'string' && stats.slopeLabel){
            parameterColumnLabel = stats.slopeLabel;
            parameterLabelResolved = true;
          }
          tableRows.push({
            series:s.name,
            n:formatMetricValue(sampleSizeValue,0),
            r:formatMetricValue(stats.r),
            rCi:corrCi,
            p:formatP(stats.p),
            pValueCell:lineInferencePValue(stats.p),
            pRaw:Number.isFinite(stats.p) ? stats.p : null,
            pMethod:stats.pMethod || '—',
            slope:formatMetricValue(stats.slope),
            r2:formatMetricValue(r2Value),
            adjR2:formatMetricValue(adjR2Value),
            rmse:formatMetricValue(rmseValue),
            mae:formatMetricValue(maeValue),
            logLoss:formatMetricValue(logLossValue,6),
            modelF:formatMetricValue(modelF),
            modelFP:formatP(modelFP),
            modelPValueCell:lineInferencePValue(modelFP)
          });
          if(stats.regression?.summary?.parameters && typeof stats.regression.summary.parameters === 'object'){
            Object.entries(stats.regression.summary.parameters).forEach(([label, value]) => {
              if(value == null || value === '') return;
              const formattedValue = Number.isFinite(value) ? formatMetricValue(value) : String(value);
              const normalizedLabel = String(label || '').toLowerCase();
              if(normalizedLabel.startsWith('seasonal') || normalizedLabel.includes('season length')){
                seasonalRows.push({ series: s.name, label, value: formattedValue });
                return;
              }
              if(normalizedLabel === 'horizon'){
                forecastRows.push({ series: s.name, horizon: formattedValue, mae: 'n/a', rmse: 'n/a', mape: 'n/a', smape: 'n/a', selectionCriterion: 'n/a', selectionScore: 'n/a', aic: 'n/a', bic: 'n/a' });
                return;
              }
              parameterRows.push({ series: s.name, parameter: label, value: formattedValue });
            });
          }
          if(showIntervals && stats.regression?.intervals?.summary){
            const summaryIntervals = stats.regression.intervals.summary;
            intervalRows.push({
              series: s.name,
              ciLow: formatMetricValue(summaryIntervals.ciMin),
              ciHigh: formatMetricValue(summaryIntervals.ciMax),
              piLow: formatMetricValue(summaryIntervals.piMin),
              piHigh: formatMetricValue(summaryIntervals.piMax)
            });
          }
          if(showDiagnostics && stats.regression?.diagnostics){
            const runs = stats.regression.diagnostics.runsTest || null;
            const lackOfFit = stats.regression.diagnostics.lackOfFit || null;
            diagnosticRows.push({
              series: s.name,
              skewness: formatMetricValue(stats.regression.diagnostics.skewness,3),
              kurtosis: formatMetricValue(stats.regression.diagnostics.kurtosis,3),
              jb: formatMetricValue(stats.regression.diagnostics.jarqueBera,3),
              jbP: formatP(stats.regression.diagnostics.jarqueBeraP),
              runsZ: formatMetricValue(runs?.z,3),
              runsP: formatP(runs?.pValue),
              lofF: formatMetricValue(lackOfFit?.fStatistic,3),
              lofP: formatP(lackOfFit?.pValue)
            });
          }
          if(stats.derived){
            if(Number.isFinite(stats.derived.xIntercept)){
              parameterRows.push({
                series: s.name,
                parameter: 'X-intercept',
                value: formatMetricValue(stats.derived.xIntercept)
              });
            }
            if(Number.isFinite(stats.derived.xInterceptCi?.low) && Number.isFinite(stats.derived.xInterceptCi?.high)){
              parameterRows.push({
                series: s.name,
                parameter: 'X-intercept (95% CI)',
                value: `${formatMetricValue(stats.derived.xInterceptCi.low)} to ${formatMetricValue(stats.derived.xInterceptCi.high)}`
              });
            }
            if(Number.isFinite(stats.derived.reciprocalSlope)){
              parameterRows.push({
                series: s.name,
                parameter: '1/Slope',
                value: formatMetricValue(stats.derived.reciprocalSlope)
              });
            }
            if(Number.isFinite(stats.derived.reciprocalSlopeCi?.low) && Number.isFinite(stats.derived.reciprocalSlopeCi?.high)){
              parameterRows.push({
                series: s.name,
                parameter: '1/Slope (95% CI)',
                value: `${formatMetricValue(stats.derived.reciprocalSlopeCi.low)} to ${formatMetricValue(stats.derived.reciprocalSlopeCi.high)}`
              });
            }
          }
          if(Array.isArray(stats.regression?.coefficientStats)){
            stats.regression.coefficientStats.forEach(stat => {
              if(!stat) return;
              coefficientRows.push({
                series: s.name,
                term: stat.term,
                estimate: formatMetricValue(stat.estimate),
                se: formatMetricValue(stat.standardError),
                t: formatMetricValue(stat.tStatistic,3),
                p: formatP(stat.pValue),
                pValueCell: lineInferencePValue(stat.pValue),
                ciLow: formatMetricValue(stat.ciLow),
                ciHigh: formatMetricValue(stat.ciHigh)
              });
            });
          }
          const metricsSource = stats.regression?.metrics || {};
          const summaryMetrics = summary?.metrics || {};
          const hasAccuracy = [metricsSource.mae, metricsSource.mape, metricsSource.smape, metricsSource.aic, metricsSource.bic, metricsSource.selectionScore, metricsSource.horizon].some(val => Number.isFinite(val));
          if(hasAccuracy){
            const existingIndex = forecastRows.findIndex(row => row.series === s.name);
            const rowBase = existingIndex >= 0 ? forecastRows[existingIndex] : { series: s.name };
            rowBase.horizon = rowBase.horizon || formatMetricValue(summaryMetrics.horizon ?? metricsSource.horizon ?? NaN,0);
            rowBase.mae = formatMetricValue(metricsSource.mae);
            rowBase.rmse = formatMetricValue(metricsSource.rmse);
            rowBase.mape = formatPercent(metricsSource.mape);
            rowBase.smape = formatPercent(metricsSource.smape);
            rowBase.selectionCriterion = typeof metricsSource.selectionCriterion === 'string'
              ? metricsSource.selectionCriterion.replace(/-/g, ' ')
              : 'n/a';
            rowBase.selectionScore = formatMetricValue(metricsSource.selectionScore, 3);
            rowBase.aic = formatMetricValue(metricsSource.aic ?? summaryMetrics.aic ?? NaN,2);
            rowBase.bic = formatMetricValue(metricsSource.bic ?? summaryMetrics.bic ?? NaN,2);
            if(existingIndex >= 0){
              forecastRows[existingIndex] = rowBase;
            }else{
              forecastRows.push(rowBase);
            }
          }
        }
      }else{
        s.regression = null;
        regressionSummaries.push({ name: s.name, mode: regressionMode, summary: null });
      }
    });
    setLineRegressionSummariesState(regressionSummaries, session);
    const associationSymbol = getLineAssociationSymbol(methodLabel || method);
    if(tableRows.length && options.createResidualView !== false){
      try{
        upsertLineResidualsDataView(series, {
          title: 'Residuals',
          activate: false,
          reason: 'line-stats-residuals'
        });
      }catch(err){
        console.error('line residual data view update failed', err);
      }
    }
    if(tableRows.length){
      clearLineStatsReportHost({ session, refs: lineRefs });
      statsResults.innerHTML='';
      if(methodLabel){
        const lead=document.createElement('div');
        lead.className='stats-table-lead';
        lead.textContent=`${methodLabel} correlation coefficients`;
        statsResults.appendChild(lead);
      }
      if(Shared.statsTable && typeof Shared.statsTable.render==='function'){
        Shared.statsTable.render({
          target: statsResults,
          columns:[
            {key:'series',label:'Series',align:'left'},
            {key:'n',label:'N',align:'right'},
            {key:'r',label:associationSymbol,align:'right'},
            {key:'rCi',label:`${associationSymbol} (95% CI)`,align:'right'},
            {key:'pValueCell',label:'p',align:'right'},
            {key:'pMethod',label:'p method',align:'left'},
            {key:'slope',label:parameterColumnLabel,align:'right'},
            {key:'r2',label:rSquaredLabel,align:'right'},
            {key:'adjR2',label:'Adjusted R²',align:'right'},
            {key:'modelF',label:'Model F',align:'right'},
            {key:'modelPValueCell',label:'Model p',align:'right'},
            {key:'rmse',label:'RMSE',align:'right'},
            {key:'mae',label:'MAE',align:'right'},
            {key:'logLoss',label:'Log loss',align:'right'}
          ],
          rows:tableRows,
          caption: methodLabel ? `${methodLabel} correlation summary (${regressionModeLabel})` : 'Correlation summary',
          section:'summary',
          options:{
            fileName:'line-statistics',
            contextLabel:'line-stats'
          },
          append:true
        });
        if(showIntervals && intervalRows.length){
          Shared.statsTable.render({
            target: statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'ciLow', label:'CI Low', align:'right' },
              { key:'ciHigh', label:'CI High', align:'right' },
              { key:'piLow', label:'PI Low', align:'right' },
              { key:'piHigh', label:'PI High', align:'right' }
            ],
            rows: intervalRows,
            caption: 'Regression interval bounds',
            section:'estimates',
            options:{ fileName:'line-intervals', contextLabel:'line-intervals' },
            append:true
          });
        }
        if(showDiagnostics && diagnosticRows.length){
          Shared.statsTable.render({
            target: statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'skewness', label:'Skewness', align:'right' },
              { key:'kurtosis', label:'Kurtosis', align:'right' },
              { key:'jb', label:'JB', align:'right' },
              { key:'jbP', label:'JB p', align:'right' },
              { key:'runsZ', label:'Runs z', align:'right' },
              { key:'runsP', label:'Runs p', align:'right' },
              { key:'lofF', label:'Lack-of-fit F', align:'right' },
              { key:'lofP', label:'Lack-of-fit p', align:'right' }
            ],
            rows: diagnosticRows,
            caption: 'Residual diagnostics',
            section:'diagnostics',
            options:{ fileName:'line-diagnostics', contextLabel:'line-diagnostics' },
            append:true
          });
        }
        if(parameterRows.length){
          Shared.statsTable.render({
            target: statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'parameter', label:'Parameter', align:'left' },
              { key:'value', label:'Value', align:'right' }
            ],
            rows: parameterRows,
            caption: 'Regression parameters',
            section:'estimates',
            options:{ fileName:'line-parameters', contextLabel:'line-parameters' },
            append:true
          });
        }
        if(seasonalRows.length){
          Shared.statsTable.render({
            target: statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'label', label:'Component', align:'left' },
              { key:'value', label:'Value', align:'right' }
            ],
            rows: seasonalRows,
            caption: 'Seasonal components',
            section:'estimates',
            options:{ fileName:'line-seasonals', contextLabel:'line-seasonals' },
            append:true
          });
        }
        if(forecastRows.length){
          Shared.statsTable.render({
            target: statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'horizon', label:'Horizon', align:'right' },
              { key:'mae', label:'MAE', align:'right' },
              { key:'rmse', label:'RMSE', align:'right' },
              { key:'mape', label:'MAPE', align:'right' },
              { key:'smape', label:'sMAPE', align:'right' },
              { key:'selectionCriterion', label:'Tuning criterion', align:'left' },
              { key:'selectionScore', label:'Tuning score', align:'right' },
              { key:'aic', label:'AIC', align:'right' },
              { key:'bic', label:'BIC', align:'right' }
            ],
            rows: forecastRows,
            caption: 'Forecast accuracy metrics',
            section:'estimates',
            options:{ fileName:'line-forecast', contextLabel:'line-forecast' },
            append:true
          });
        }
        if(coefficientRows.length){
          Shared.statsTable.render({
            target: statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'term', label:'Term', align:'left' },
              { key:'estimate', label:'Estimate', align:'right' },
              { key:'se', label:'Std Error', align:'right' },
              { key:'t', label:'t-stat', align:'right' },
              { key:'pValueCell', label:'p-value', align:'right' },
              { key:'ciLow', label:'CI Low', align:'right' },
              { key:'ciHigh', label:'CI High', align:'right' }
            ],
            rows: coefficientRows,
            caption: 'Coefficient estimates',
            section:'estimates',
            options:{ fileName:'line-coefficients', contextLabel:'line-coefficients' },
            append:true
          });
        }
      }else{
        const table=document.createElement('table');
        table.innerHTML=`<tr><th>Series</th><th>N</th><th>${associationSymbol}</th><th>${associationSymbol} (95% CI)</th><th>p</th><th>p method</th><th>${parameterColumnLabel}</th><th>${rSquaredLabel}</th><th>Adjusted R²</th><th>Model F</th><th>Model p</th><th>RMSE</th><th>MAE</th><th>Log loss</th></tr>`+
          tableRows.map(row=>`<tr><td>${row.series}</td><td>${row.n}</td><td>${row.r}</td><td>${row.rCi}</td><td>${row.p}</td><td>${row.pMethod}</td><td>${row.slope}</td><td>${row.r2}</td><td>${row.adjR2}</td><td>${row.modelF}</td><td>${row.modelFP}</td><td>${row.rmse}</td><td>${row.mae}</td><td>${row.logLoss}</td></tr>`).join('');
        statsResults.appendChild(table);
        console.debug('Debug: updateLineStats fallback table rendered',{rowCount:tableRows.length});
        if(showIntervals && intervalRows.length){
          const intervalTable=document.createElement('table');
          intervalTable.innerHTML='<tr><th>Series</th><th>CI Low</th><th>CI High</th><th>PI Low</th><th>PI High</th></tr>'+
            intervalRows.map(row=>`<tr><td>${row.series}</td><td>${row.ciLow}</td><td>${row.ciHigh}</td><td>${row.piLow}</td><td>${row.piHigh}</td></tr>`).join('');
          statsResults.appendChild(intervalTable);
        }
        if(showDiagnostics && diagnosticRows.length){
          const diagTable=document.createElement('table');
          diagTable.innerHTML='<tr><th>Series</th><th>Skewness</th><th>Kurtosis</th><th>JB</th><th>JB p</th><th>Runs z</th><th>Runs p</th><th>Lack-of-fit F</th><th>Lack-of-fit p</th></tr>'+
            diagnosticRows.map(row=>`<tr><td>${row.series}</td><td>${row.skewness}</td><td>${row.kurtosis}</td><td>${row.jb}</td><td>${row.jbP}</td><td>${row.runsZ}</td><td>${row.runsP}</td><td>${row.lofF}</td><td>${row.lofP}</td></tr>`).join('');
          statsResults.appendChild(diagTable);
        }
        if(parameterRows.length){
          const paramTable=document.createElement('table');
          paramTable.innerHTML='<tr><th>Series</th><th>Parameter</th><th>Value</th></tr>'+
            parameterRows.map(row=>`<tr><td>${row.series}</td><td>${row.parameter}</td><td>${row.value}</td></tr>`).join('');
          statsResults.appendChild(paramTable);
        }
        if(seasonalRows.length){
          const seasonTable=document.createElement('table');
          seasonTable.innerHTML='<tr><th>Series</th><th>Component</th><th>Value</th></tr>'+
            seasonalRows.map(row=>`<tr><td>${row.series}</td><td>${row.label}</td><td>${row.value}</td></tr>`).join('');
          statsResults.appendChild(seasonTable);
        }
        if(forecastRows.length){
          const forecastTable=document.createElement('table');
          forecastTable.innerHTML='<tr><th>Series</th><th>Horizon</th><th>MAE</th><th>RMSE</th><th>MAPE</th><th>sMAPE</th><th>Tuning criterion</th><th>Tuning score</th><th>AIC</th><th>BIC</th></tr>'+
            forecastRows.map(row=>`<tr><td>${row.series}</td><td>${row.horizon || 'n/a'}</td><td>${row.mae || 'n/a'}</td><td>${row.rmse || 'n/a'}</td><td>${row.mape || 'n/a'}</td><td>${row.smape || 'n/a'}</td><td>${row.selectionCriterion || 'n/a'}</td><td>${row.selectionScore || 'n/a'}</td><td>${row.aic || 'n/a'}</td><td>${row.bic || 'n/a'}</td></tr>`).join('');
          statsResults.appendChild(forecastTable);
        }
        if(coefficientRows.length){
          const coeffTable=document.createElement('table');
          coeffTable.innerHTML='<tr><th>Series</th><th>Term</th><th>Estimate</th><th>Std Error</th><th>t-stat</th><th>p-value</th><th>CI Low</th><th>CI High</th></tr>'+
            coefficientRows.map(row=>`<tr><td>${row.series}</td><td>${row.term}</td><td>${row.estimate}</td><td>${row.se}</td><td>${row.t}</td><td>${row.p}</td><td>${row.ciLow}</td><td>${row.ciHigh}</td></tr>`).join('');
          statsResults.appendChild(coeffTable);
        }
      }
    }else{
      statsResults.textContent='Not enough data for statistics.';
    }
    if(tableRows.length && statsResults && Shared.statsReporting && typeof Shared.statsReporting.appendReportPanel==='function'){
      const methodsParts = [
        `Association and regression statistics were computed for ${tableRows.length} series using ${methodLabel || method} correlation with ${regressionModeLabel}. Inferential decisions used α = ${Shared.statsInference?.formatLevel?.(getLineStatsAlpha()) || getLineStatsAlpha()}.`,
        'For each series, only rows with finite numeric X and Y values were analyzed; missing or non-numeric pairs were omitted before correlation, regression, diagnostics, and forecast summaries.',
        showIntervals ? 'Confidence and prediction interval bounds were calculated from the fitted regression model where estimable.' : null,
        showDiagnostics ? 'Residual diagnostic summaries were requested, including distributional checks, runs tests, and lack-of-fit summaries when the data supported them.' : null,
        forecastRows.length ? 'Forecast accuracy metrics were also summarised when a forecast model and holdout information were available.' : null
      ].filter(Boolean);
      const bestSeries = tableRows[0] || null;
      const resultsParts = [
        `${tableRows.length} series were analysable.`,
        bestSeries ? `${bestSeries.series} returned ${associationSymbol} = ${bestSeries.r}, ${formatLinePExpression(bestSeries.pRaw)}, and ${rSquaredLabel} = ${bestSeries.r2}.` : null,
        forecastRows.length ? `${forecastRows.length} series produced forecast accuracy statistics.` : null,
        coefficientRows.length ? `${coefficientRows.length} coefficient estimates were tabulated.` : null
      ].filter(Boolean);
      const structuredResultsParts = [
        `${tableRows.length} series were analysable.`,
        bestSeries ? [' ', `${bestSeries.series} returned ${associationSymbol} = ${bestSeries.r}, p = `, { type:'pValue', value:bestSeries.pRaw, fallback:String(bestSeries.p), __statsInference:createLineInferenceSpec() }, `, and ${rSquaredLabel} = ${bestSeries.r2}.`] : null,
        forecastRows.length ? ` ${forecastRows.length} series produced forecast accuracy statistics.` : null,
        coefficientRows.length ? ` ${coefficientRows.length} coefficient estimates were tabulated.` : null
      ].filter(Boolean);
      Shared.statsReporting.appendReportPanel(statsResults, {
        methodsText: methodsParts.join(' '),
        resultsText: resultsParts.join(' '),
        resultsParts: structuredResultsParts,
        analysisSpec: {
          component: 'line',
          method,
          regressionMode,
          regressionLabel: regressionModeLabel,
          showIntervals,
          showDiagnostics,
          seriesCount: tableRows.length,
          intervalSeries: intervalRows.length,
          diagnosticSeries: diagnosticRows.length,
          parameterRows: parameterRows.length,
          seasonalRows: seasonalRows.length,
          forecastRows: forecastRows.length,
          coefficientRows: coefficientRows.length,
          inference: typeof Shared.statsInference?.createSnapshot === 'function'
            ? Shared.statsInference.createSnapshot({ tabId:getLineStatsInferenceTabId(), includeOverall:true, includeComparisons:false })
            : { alpha:getLineStatsAlpha() }
        }
      }, { title: 'Reporting and reproducibility' });
    }
    console.debug('Debug: updateLineStats complete',{rowCount:tableRows.length,intervalRows:intervalRows.length,diagnosticRows:diagnosticRows.length,parameterRows:parameterRows.length,seasonalRows:seasonalRows.length,forecastRows:forecastRows.length,methodLabel,regressionMode}); // Debug: stats update exit
  }

  // PART: PAYLOAD
  function trimLinePayloadData(data, viewMode = '2d'){
    const matrix = Shared.hot.trimTrailingEmptyCols(data);
    if(!Array.isArray(matrix) || matrix.length < 2){
      return matrix;
    }
    if(viewMode === '3d'){
      const seriesCount = Math.max(
        inferLine3dSeriesCount(matrix),
        Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0
      );
      if(seriesCount > 0){
        const targetCols = seriesCount * LINE_3D_COLS_PER_DATASET;
        return matrix.map(row => Array.isArray(row) ? row.slice(0, targetCols) : row);
      }
      return matrix;
    }
    let lastBodyCol = 0;
    for(let r = 1; r < matrix.length; r += 1){
      const row = Array.isArray(matrix[r]) ? matrix[r] : [];
      for(let c = row.length - 1; c >= 1; c -= 1){
        const value = row[c];
        if(value !== null && value !== undefined && String(value).trim() !== ''){
          lastBodyCol = Math.max(lastBodyCol, c);
          break;
        }
      }
    }
    if(lastBodyCol <= 0){
      return matrix;
    }
    return matrix.map(row => Array.isArray(row) ? row.slice(0, lastBodyCol + 1) : row);
  }

  function buildLinePayloadSeriesStyles(data, viewMode){
    const sourceStyles = getLineStylesState(getLineActiveSessionForState()).series || {};
    const headerRow = Array.isArray(data?.[0]) ? data[0] : [];
    let labels = [];
    if(viewMode === '3d'){
      const seriesCount = Math.max(inferLine3dSeriesCount(data), Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0);
      labels = Array.from({ length: seriesCount }, (_entry, idx) => {
        const label = lineSeriesGroupLabels?.[idx];
        return label == null || String(label).trim() === '' ? `Series ${idx + 1}` : String(label).trim();
      });
    }else{
      const usedSeriesCols = Math.max(0, (Array.isArray(data?.[0]) ? data[0].length : 1) - 1);
      const seriesCount = usedSeriesCols > 0
        ? Math.ceil(usedSeriesCols / Math.max(lineReplicates, 1))
        : Math.max(0, Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0);
      labels = resolveLine2dSeriesLabelsFromHeader(headerRow, seriesCount, { replicates: lineReplicates });
    }
    const allowed = new Set(labels.map(label => String(label == null ? '' : label).trim()).filter(Boolean));
    const filtered = {};
    Object.keys(sourceStyles).forEach(key => {
      const normalized = String(key == null ? '' : key).trim();
      if(!normalized || !allowed.has(normalized)){
        return;
      }
      const style = sourceStyles[key];
      if(style && typeof style === 'object' && !Array.isArray(style)){
        filtered[normalized] = { ...style };
      }
    });
    return filtered;
  }

  function getLineGraphPayload(){
    const activeHot = (typeof line.__ensureHotForActiveTab === 'function' ? line.__ensureHotForActiveTab() : null) || getActiveLineHotManager();
    if(!activeHot) return null;
    const axisSettings = ensureLineAxisSettings();
    const controls = syncLineRuntimeControlsFromRefs();
    const payloadSession = getLineSession(getLineProjectionTabId() || null, { reason: 'line-payload-session' }, { create: true }) || getLineActiveSessionForState();
    const fontStyles = exportFontStyles('line', { tabId: payloadSession?.tabId || getLineProjectionTabId() || null });
    rememberLineSessionState(getLineProjectionTabId() || null, { reason: 'line-payload-capture' }, { readControls: false });
    const payloadForecast = getLineForecastState(payloadSession);
    const viewMode = getLineViewState().viewMode === '3d' ? '3d' : '2d';
    const noteControl = canUseLineNotesControl(notesState.control) ? notesState.control : null;
    const notesText = noteControl && typeof noteControl.getValue === 'function'
      ? noteControl.getValue()
      : (notesState.text || '');
    const notesOpen = noteControl && typeof noteControl.isOpen === 'function'
      ? noteControl.isOpen()
      : !!notesState.open;
    notesState.text = notesText;
    notesState.open = notesOpen;
    const activeManager = ensureLineDataViewsForHot(activeHot, {
      wrapper: refs.hotWrapper,
      container: activeHot.__lineHostContainer || refs.hotContainer
    });
    syncLineActiveDataViewFromHot(activeHot, 'payload');
    const dataViewsPayload = activeManager?.serialize?.({ includeData: true }) || null;
    const includeDataViews = !!(dataViewsPayload && Array.isArray(dataViewsPayload.views) && dataViewsPayload.views.length > 1);
    const payloadSourceData = Shared.dataViews?.resolveRawDataForPersistence?.(dataViewsPayload, activeHot.getData())
      || activeHot.getData();
    const showTrendLine = !!controls.showTrendLine;
    const showConfidenceIntervals = !!controls.showIntervals;
    const showPredictionIntervals = !!controls.showPredictionIntervals;
    const payloadData = trimLinePayloadData(payloadSourceData, viewMode);
    const payloadSeriesStyles = buildLinePayloadSeriesStyles(payloadData, viewMode);
    return {
      type:'line',
      data:payloadData,
      exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
      filters: activeHot?.exportFilters?.() || Shared.hot.exportFilters(activeHot),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      config:{
        viewMode,
        title:lineTitleText,
        xLabel:lineXLabelText,
        yLabel:lineYLabelText,
        zLabel: lineZLabelText,
        rotation: getLineViewState().rotation ? {
          x: getLineViewState().rotation.x,
          y: getLineViewState().rotation.y,
          z: getLineViewState().rotation.z,
          quaternion: getLineViewState().rotation.quaternion ? {
            w: getLineViewState().rotation.quaternion.w,
            x: getLineViewState().rotation.quaternion.x,
            y: getLineViewState().rotation.quaternion.y,
            z: getLineViewState().rotation.quaternion.z
          } : null
        } : null,
        tableFormat: controls.tableFormat || (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single'),
        replicates: viewMode === '3d' ? LINE_MIN_REPLICATES : lineReplicates,
        groupLabels: Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [],
        groupShapes: Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [],
        dotSize:controls.dotSize,
        colorScheme: lineColorSchemeId,
        textColor: lineTextColor,
        backgroundColor: lineBackgroundColor,
        border:controls.border,
        borderWidth:controls.borderWidth,
        errorBarWidth:controls.errorBarWidth || controls.borderWidth,
        alpha:controls.alpha,
        labelColors:{ ...lineLabelColors },
        seriesStyles: payloadSeriesStyles,
        displayMode: sanitizeLineDisplayMode(controls.displayMode || lineDisplayMode),
        showGrid:!!controls.showGrid,
        gridStyle: getLineGridStyle(getLineAxisStrokeWidth()),
        showFrame:!!controls.showFrame,
        showLegend:controls.showLegend !== false,
        equalAxes: getLineViewState().equalAxes,
        equalScaleAxes: getLineViewState().equalScaleAxes,
        axesVarianceScaled: getLineViewState().axesVarianceScaled,
        logX:!!controls.logX,
        logY:!!controls.logY,
        logPlusOneX:!!lineLogPlusOneX,
        logPlusOneY:!!lineLogPlusOneY,
        showTrendLine,
        showIntervals: showConfidenceIntervals || showPredictionIntervals,
        showConfidenceIntervals,
        showPredictionIntervals,
        showDiagnostics:isLineDiagnosticsEnabled(),
        overlayStyles: sanitizeLineOverlayStylesMap(lineOverlayStyles),
        xMin:controls.xMin,
        xMax:controls.xMax,
        yMin:controls.yMin,
        yMax:controls.yMax,
        originMode:controls.originMode,
        originX:controls.originX,
        originY:controls.originY,
        fontSize:controls.fontSize,
        fontStyles: fontStyles || undefined,
        regression:{
          mode: controls.regressionMode || 'linear',
          seriesSummaries: getLineRegressionSummariesState(payloadSession)
        },
        forecast:{
          horizon: controls.forecast?.horizon ?? String(payloadForecast.horizon),
          seasonLength: controls.forecast?.seasonLength ?? String(payloadForecast.seasonLength),
          autoTune: !!controls.forecast?.autoTune,
          criterion: controls.forecast?.criterion || payloadForecast.criterion
        },
        axis:{
          strokeWidth: axisSettings.strokeWidth,
          color: axisSettings.color,
          tickIntervalX: axisSettings.x?.tickInterval ?? null,
          tickIntervalY: axisSettings.y?.tickInterval ?? null,
          majorTickLengthX: axisSettings.x?.majorTickLength ?? null,
          majorTickLengthY: axisSettings.y?.majorTickLength ?? null,
          xLabelAngle: axisSettings.x?.labelAngle ?? null,
          minorTicksX: axisSettings.x?.minorTicks ?? false,
          minorTicksY: axisSettings.y?.minorTicks ?? false,
          minorTickSubdivisionsX: clampMinorTickSubdivisions(axisSettings.x?.minorTickSubdivisions),
          minorTickSubdivisionsY: clampMinorTickSubdivisions(axisSettings.y?.minorTickSubdivisions),
          notationX: axisSettings.x?.notation ?? 'decimal',
          notationY: axisSettings.y?.notation ?? 'decimal',
          additionalTicks: {
            x: sanitizeLineAxisAdditionalTicks(axisSettings.x?.additionalTicks),
            y: sanitizeLineAxisAdditionalTicks(axisSettings.y?.additionalTicks)
          },
          brokenAxis: {
            x: {
              enabled: axisSettings.x?.brokenAxis?.enabled ?? false,
              segments: axisSettings.x?.brokenAxis?.segments ?? []
            },
            y: {
              enabled: axisSettings.y?.brokenAxis?.enabled ?? false,
              segments: axisSettings.y?.brokenAxis?.segments ?? []
            }
          }
        },
        labelPositions: lineLabelPositions || null,
        stats: {
          ...(() => {
            const panelModel = captureLineStatsPanelModel(null, { session: payloadSession });
            return {
              panelModel,
              resultsModel: panelModel.resultsModel,
              reportModel: panelModel.reportModel
            };
          })(),
          lastRunVersion: getLineStatsState(payloadSession).lastRunVersion || 0,
          hasResults: lineStatsResultsAvailable(payloadSession),
          signature: getLineStatsState(payloadSession).signature || null,
          version: getLineStatsState(payloadSession).version || 0,
          controls: {
            method: controls.statType || null,
            regressionMode: controls.regressionMode || null
          },
          statsOptions: {
            showIntervals: isLineAnyIntervalEnabled(),
            showConfidenceIntervals: !!controls.showIntervals,
            showPredictionIntervals: !!controls.showPredictionIntervals,
            showPlotStats: !!controls.showPlotStats,
            showDiagnostics: isLineDiagnosticsEnabled(),
            forecast: {
              horizon: controls.forecast?.horizon ?? null,
              seasonLength: controls.forecast?.seasonLength ?? null,
              autoTune: !!controls.forecast?.autoTune,
              criterion: controls.forecast?.criterion || null
            }
          }
        },
        notes: {
          text: notesText,
          open: notesOpen
        }
      }
    };
  }

  function applyLineGraphPayload(obj, meta = {}){
    if(!obj || typeof obj !== 'object'){
      console.error('line payload missing or invalid', { meta });
      return false;
    }
    if(obj.type && obj.type !== 'line'){
      console.error('Invalid line payload type', { type: obj.type, meta });
      return false;
    }
    if(meta?.flagOverlay){
      const overlayReason = meta?.overlayReason || (typeof meta?.source === 'string' ? `payload-${meta.source}` : 'payload');
      markLineOverlayPending(overlayReason);
    }
    const skipDraw = meta?.skipDraw === true;
    const styleOnly = meta?.styleOnly === true || meta?.colorSchemeOnly === true;
    const skipDataLoad = meta?.skipDataLoad === true || styleOnly;
    console.debug('Debug: applyLineGraphPayload payload', obj);
    const c=obj.config||{};
    const payloadTabLike = meta?.tab || meta?.tabId || getLineProjectionTabId() || null;
    const payloadSession = bindLineSessionForTab(payloadTabLike, { ...(meta || {}), reason: meta?.reason || 'line-payload-bind-session' }, { syncControls: false });
    const payloadStateSession = payloadSession
      || getLineSession(payloadTabLike, {
        ...(meta || {}),
        reason: 'line-payload-state-session'
      }, { create: true })
      || getLineActiveSessionForState();
    const payloadRefs = resolveLineRefsContext(payloadSession, meta);
    let scheduleBackup = null;
    let sessionScheduleBackup = null;
    let mutedDrawScheduler = null;
    if(skipDraw){
      mutedDrawScheduler = () => {};
      const ownerPayloadSession = payloadSession || getLineActiveSessionForState();
      scheduleBackup = getLineFallbackDrawScheduler();
      sessionScheduleBackup = getLineSessionDrawScheduler(ownerPayloadSession, { allowFallback: false });
      if(ownerPayloadSession){
        setLineSessionDrawSchedulers(ownerPayloadSession, { drawScheduler: mutedDrawScheduler }, { mirrorFallback: false });
      }else if(!line.__boundTabId){
        lineFallbackDrawScheduler = mutedDrawScheduler;
      }
    }
    applyLineThemeConfig(c, payloadStateSession, { ...(meta || {}), reason: meta?.reason || 'line-theme-config' });
    if(c.notes && typeof c.notes === 'object'){
      notesState.text = c.notes.text == null ? '' : String(c.notes.text);
      notesState.open = !!c.notes.open;
    }else if(typeof c.notes === 'string'){
      notesState.text = c.notes;
      notesState.open = !!notesState.open;
    }else{
      notesState.text = '';
      notesState.open = false;
    }
    if(canUseLineNotesControl(notesState.control)){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    importFontStyles('line', c.fontStyles || null, { tabId: payloadStateSession?.tabId || getLineProjectionTabId() || null });
    const hot = (typeof line.__ensureHotForActiveTab === 'function' ? line.__ensureHotForActiveTab() : null) || getActiveLineHotManager();
    if(hot){
      setActiveLineHotManager(hot);
    }
    const storedViewMode = typeof c.viewMode === 'string' ? String(c.viewMode).toLowerCase() : null;
    const storedTableFormat = typeof c.tableFormat === 'string' ? String(c.tableFormat).toLowerCase() : null;
    const wants3d = storedViewMode === '3d' || storedTableFormat === '3d';
    const storedReplicates = wants3d
      ? LINE_MIN_REPLICATES
      : clampLineReplicateCount(c.replicates ?? lineReplicates);
    const rawDataMatrix = Array.isArray(obj.data) ? obj.data : null;
    const serializedViews = (obj.dataViews && typeof obj.dataViews === 'object') ? obj.dataViews : null;
    const requestedActiveViewId = obj.activeDataViewId || serializedViews?.activeViewId || null;
    const activeHotForViews = getActiveLineHotManager();
    const dataManager = activeHotForViews
        ? ensureLineDataViewsForHot(activeHotForViews, {
            wrapper: payloadRefs.hotWrapper || getLineNodeById('lineHotWrapper') || null,
            container: activeHotForViews.__lineHostContainer || payloadRefs.hotContainer || getLineNodeById('lineHot') || null
          })
        : null;
    const payloadHot = activeHotForViews || getActiveLineHotManager();
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
    const activeViewData = dataManager?.getActiveView?.()?.data;
    const matrixData = Array.isArray(activeViewData) ? activeViewData : rawDataMatrix;
    const activeViewExclusions = dataManager?.getActiveView?.()?.exclusions || null;
    const exclusionsToApply = obj.exclusions || activeViewExclusions || null;
    const activeViewFilters = dataManager?.getActiveView?.()?.filters || null;
    const filtersToApply = obj.filters || activeViewFilters || null;
    const storedGroupLabels = Array.isArray(c.groupLabels) ? c.groupLabels.slice() : null;
    const storedGroupShapes = Array.isArray(c.groupShapes) ? c.groupShapes.slice() : null;
    const modeCache = getActiveLineModeCache({ ...(meta || {}), reason: 'line-payload-mode-cache-reset' });
    modeCache.twoD = null;
    modeCache.threeD = null;
    modeCache.lastTwoDFormat = storedTableFormat === 'grouped' ? 'grouped' : 'single';
    lineLast2dDisplayMode = sanitizeLineDisplayMode(c.displayMode ?? lineLast2dDisplayMode);
    lineLast2dLogX = !!c.logX;
    lineLast2dLogY = !!c.logY;
    lineLast2dShowFrame = !!c.showFrame;
    lineLast2dShowTrendLine = !!c.showTrendLine;
    lineLast2dShowIntervals = !!(c.showConfidenceIntervals ?? c.showIntervals);
    lineLast2dShowPredictionIntervals = !!(c.showPredictionIntervals ?? c.showIntervals);
    lineLast2dShowPlotStats = !!c.showPlotStats;
    if(typeof c.equalAxes === 'boolean'){
      getLineViewState().equalAxes = c.equalAxes;
    }
    if(typeof c.equalScaleAxes === 'boolean'){
      getLineViewState().equalScaleAxes = c.equalScaleAxes;
    }
    if(typeof c.axesVarianceScaled === 'boolean'){
      getLineViewState().axesVarianceScaled = c.axesVarianceScaled;
    }
    if(getLineViewState().equalScaleAxes){
      getLineViewState().equalAxes = false;
      getLineViewState().axesVarianceScaled = false;
      lineDebug('Debug: line axes length payload exclusivity enforced', { kept: 'equal-scale' });
    }else if(getLineViewState().axesVarianceScaled && getLineViewState().equalAxes){
      getLineViewState().equalAxes = false;
      lineDebug('Debug: line axes length payload exclusivity enforced', { kept: 'variance' });
    }
    if(storedGroupLabels || storedGroupShapes){
      const groupedPatch = {};
      if(storedGroupLabels){
        groupedPatch.labels = storedGroupLabels.slice();
        console.debug('Debug: line group labels restored from payload', { labels: storedGroupLabels });
      }
      if(storedGroupShapes){
        groupedPatch.shapes = storedGroupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
      }
      patchLineGroupedState(payloadStateSession, groupedPatch, { reason: 'line-payload-grouped-restore' });
      if(storedGroupShapes){
        console.debug('Debug: line group shapes restored from payload', { shapes: lineGroupShapes.slice() });
      }
    }
    if(!skipDataLoad && payloadHot && matrixData){
      if(wants3d){
        const inferredSeriesCount = inferLine3dSeriesCount(matrixData);
        const seriesCount = Math.max(inferredSeriesCount, storedGroupLabels?.length || 0, storedGroupShapes?.length || 0);
        const matrixForLoad = seriesCount > 0 ? applyLine3dHeaderRow(matrixData, seriesCount) : matrixData;
        getLineViewState().viewMode = '3d';
        if(payloadRefs.viewMode){
          payloadRefs.viewMode.value = '3d';
        }
        if(payloadRefs.replicateMode){
          payloadRefs.replicateMode.value = '3d';
        }
        payloadHot.loadData(matrixForLoad);
        if(exclusionsToApply){
          payloadHot.applyExclusions?.(exclusionsToApply);
        }
        if(filtersToApply){
          payloadHot.applyFilters?.(filtersToApply, { schedule: false });
        }
        if(storedGroupLabels){
          patchLineGroupedState(payloadStateSession, { labels: storedGroupLabels.slice() }, { reason: 'line-payload-3d-labels' });
        }
        ensureLine3dGroupLabelCapacity(seriesCount);
        if(storedGroupShapes){
          setLineGroupShapesState(payloadStateSession, storedGroupShapes, { reason: 'line-payload-3d-shapes' });
        }
        ensureLineGroupShapeCapacity(seriesCount, payloadStateSession);
        if(payloadRefs.displayMode){
          payloadRefs.displayMode.disabled = true;
          payloadRefs.displayMode.value = 'line';
        }
        [payloadRefs.logX, payloadRefs.logY].forEach(cb => {
          if(!cb){
            return;
          }
          cb.disabled = true;
          cb.checked = false;
        });
        if(payloadRefs.showFrame){
          payloadRefs.showFrame.checked = true;
          payloadRefs.showFrame.disabled = true;
        }
        if(payloadRefs.regressionMode){
          payloadRefs.regressionMode.disabled = true;
        }
        if(payloadRefs.showTrendLine){
          payloadRefs.showTrendLine.disabled = true;
          payloadRefs.showTrendLine.checked = false;
        }
        if(payloadRefs.showIntervals){
          payloadRefs.showIntervals.disabled = true;
          payloadRefs.showIntervals.checked = false;
        }
        if(payloadRefs.showPredictionIntervals){
          payloadRefs.showPredictionIntervals.disabled = true;
          payloadRefs.showPredictionIntervals.checked = false;
        }
        if(payloadRefs.forecastFieldset){
          payloadRefs.forecastFieldset.disabled = true;
        }
        updateLineReplicateModeControls('3d');
        updateLine3dNestedHeaders({ seriesCount, data: matrixForLoad });
      }else{
        getLineViewState().viewMode = '2d';
        if(payloadRefs.viewMode){
          payloadRefs.viewMode.value = '2d';
        }
        if(payloadRefs.showFrame){
          payloadRefs.showFrame.disabled = false;
        }
        if(payloadRefs.displayMode){
          payloadRefs.displayMode.disabled = false;
        }
        if(payloadRefs.regressionMode){
          payloadRefs.regressionMode.disabled = false;
        }
        if(payloadRefs.showTrendLine){
          payloadRefs.showTrendLine.disabled = false;
        }
        if(payloadRefs.showIntervals){
          payloadRefs.showIntervals.disabled = false;
        }
        if(payloadRefs.showPredictionIntervals){
          payloadRefs.showPredictionIntervals.disabled = false;
        }
        if(payloadRefs.forecastFieldset){
          payloadRefs.forecastFieldset.disabled = false;
        }
        [payloadRefs.logX, payloadRefs.logY].forEach(cb => {
          if(cb){
            cb.disabled = false;
          }
        });
        if(payloadRefs.replicateMode && payloadRefs.replicateMode.value === '3d'){
          payloadRefs.replicateMode.value = storedTableFormat === 'grouped' ? 'grouped' : 'single';
        }
        const usedSeriesCols = computeUsedSeriesColumns(matrixData);
        const inferredSeries = usedSeriesCols > 0
          ? Math.ceil(usedSeriesCols / Math.max(storedReplicates, 1))
          : 0;
        const minSeriesCount = Math.max(1, inferredSeries, storedGroupLabels?.length || 0, storedGroupShapes?.length || 0);
        applyLineReplicateChange(storedReplicates, {
          dataOverride: matrixData,
          sourceReplicates: storedReplicates,
          skipDraw: true,
          minSeriesCount,
          groupLabels: storedGroupLabels || lineSeriesGroupLabels,
          groupShapes: storedGroupShapes || lineGroupShapes,
          resetGroupLabels: storedGroupLabels ? true : undefined
        });
        if(exclusionsToApply){
          payloadHot.applyExclusions?.(exclusionsToApply);
        }
        if(filtersToApply){
          payloadHot.applyFilters?.(filtersToApply, { schedule: false });
        }
      }
    }else if(!skipDataLoad){
      lineReplicates = storedReplicates;
      if(payloadRefs.replicatesInput){
        payloadRefs.replicatesInput.value = String(lineReplicates);
      }
      if(lineReplicates > LINE_MIN_REPLICATES){
        lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
      }
      if(wants3d){
        getLineViewState().viewMode = '3d';
      }else{
        getLineViewState().viewMode = '2d';
      }
      updateLineReplicateModeControls(wants3d ? '3d' : undefined);
      if(storedGroupShapes){
        setLineGroupShapesState(payloadStateSession, storedGroupShapes, { reason: 'line-payload-no-data-shapes' });
      }
    }
    if(!skipDataLoad && payloadHot){
      syncLineActiveDataViewFromHot(payloadHot, 'payload-load');
    }
    if(!payloadHot && (exclusionsToApply || filtersToApply)){
      console.debug('Debug: line visual filters/exclusions deferred until hot ready');
    }else if(payloadHot && matrixData == null){
      if(exclusionsToApply){
        payloadHot.applyExclusions?.(exclusionsToApply);
      }
      if(filtersToApply){
        payloadHot.applyFilters?.(filtersToApply, { schedule: false });
      }
    }
    lineTitleText=c.title||lineTitleText;
    lineXLabelText=c.xLabel||lineXLabelText;
    lineYLabelText=c.yLabel||lineYLabelText;
    lineZLabelText=c.zLabel||lineZLabelText;
    if(c.rotation){
      try{
        getLineViewState().rotation = plot3d.createRotationState(c.rotation);
        if(typeof plot3d.normalizeRotation === 'function'){
          plot3d.normalizeRotation(getLineViewState().rotation);
        }
      }catch(err){
        getLineViewState().rotation = plot3d.createRotationState({ x: LINE_3D_DEFAULTS.rotationX, y: LINE_3D_DEFAULTS.rotationY });
        if(typeof plot3d.normalizeRotation === 'function'){
          plot3d.normalizeRotation(getLineViewState().rotation);
        }
      }
    }
    if(payloadRefs.dotSize && c.dotSize!=null) payloadRefs.dotSize.value=c.dotSize;
    if(payloadRefs.border && c.border) payloadRefs.border.value=c.border;
    if(payloadRefs.borderWidth && c.borderWidth!=null) payloadRefs.borderWidth.value=c.borderWidth;
    if(payloadRefs.errorBarWidth){
      if(c.errorBarWidth!=null){
        payloadRefs.errorBarWidth.value=c.errorBarWidth;
      }else if(!payloadRefs.errorBarWidth.value){
        payloadRefs.errorBarWidth.value=payloadRefs.borderWidth?.value || '1';
      }
      syncLineErrorBarToolbarValue();
    }
    if(payloadRefs.alpha){
      payloadRefs.alpha.value=c.alpha||0;
      if(payloadRefs.alphaVal){
        payloadRefs.alphaVal.textContent=payloadRefs.alpha.value;
      }
    }
    const restoredDisplayMode = sanitizeLineDisplayMode(c.displayMode);
    if(payloadRefs.displayMode){
      payloadRefs.displayMode.value = restoredDisplayMode;
    }
    lineDisplayMode = restoredDisplayMode;
    lineLabelColors = c.labelColors && typeof c.labelColors === 'object' && !Array.isArray(c.labelColors)
      ? cloneLineRuntimeValue(c.labelColors, {}) || {}
      : {};
    const restoredSeriesStyles = c.seriesStyles && typeof c.seriesStyles === 'object' && !Array.isArray(c.seriesStyles)
      ? cloneLineRuntimeValue(c.seriesStyles, {}) || {}
      : {};
    const restoredOverlayStyles = sanitizeLineOverlayStylesMap(c.overlayStyles);
    setLineStylesState(payloadStateSession, {
      ...getLineStylesState(payloadStateSession),
      series: restoredSeriesStyles,
      overlays: restoredOverlayStyles
    }, {
      ...(meta || {}),
      reason: meta?.colorSchemeOnly ? 'line-color-scheme-styles' : 'line-payload-styles'
    });
    if(payloadRefs.showGrid) payloadRefs.showGrid.checked=!!c.showGrid;
    setLineGridStyle(c.gridStyle, c.axis?.strokeWidth, payloadStateSession);
    if(payloadRefs.showFrame) payloadRefs.showFrame.checked=!!c.showFrame;
    if(payloadRefs.showLegend) payloadRefs.showLegend.checked=c.showLegend !== false;
    if(payloadRefs.logX) payloadRefs.logX.checked=!!c.logX;
    if(payloadRefs.logY) payloadRefs.logY.checked=!!c.logY;
    lineLogPlusOneX=!!c.logPlusOneX;
    lineLogPlusOneY=!!c.logPlusOneY;
    if(wants3d){
      const overlayControls = resolveLineOverlayControls(meta?.tab || meta?.tabId || getLineProjectionTabId() || null);
      if(overlayControls.showTrendLine){ overlayControls.showTrendLine.checked = false; }
      if(overlayControls.showIntervals){ overlayControls.showIntervals.checked = false; }
      if(overlayControls.showPredictionIntervals){ overlayControls.showPredictionIntervals.checked = false; }
      if(overlayControls.showPlotStats){ overlayControls.showPlotStats.checked = false; }
    }else{
      applyLineLast2dOverlayControls(meta?.tab || meta?.tabId || getLineProjectionTabId() || null);
    }
    if(payloadRefs.xMin) payloadRefs.xMin.value=c.xMin||'';
    if(payloadRefs.xMax) payloadRefs.xMax.value=c.xMax||'';
    if(payloadRefs.yMin) payloadRefs.yMin.value=c.yMin||'';
    if(payloadRefs.yMax) payloadRefs.yMax.value=c.yMax||'';
    if(payloadRefs.originMode && c.originMode) payloadRefs.originMode.value=c.originMode;
    if(payloadRefs.originX) payloadRefs.originX.value=c.originX||'';
    if(payloadRefs.originY) payloadRefs.originY.value=c.originY||'';
    if(payloadRefs.fontSize){
      payloadRefs.fontSize.value=c.fontSize||payloadRefs.fontSize.value;
      if(payloadRefs.fontSize.dataset){
        payloadRefs.fontSize.dataset.fontBasePt = String(payloadRefs.fontSize.value);
        console.debug('Debug: line font size base restored',{ value: payloadRefs.fontSize.value });
      }
      chartStyle.renderFontSizeLabel({ element: payloadRefs.fontSizeVal, pt: Number(payloadRefs.fontSize.value), input: payloadRefs.fontSize, manual: true });
    }
    if(c.axis){
      applyLineAxisSettings(c.axis, payloadStateSession, { ...(meta || {}), reason: 'line-payload-axis' });
      console.debug('Debug: line axis settings restored',{ axis: ensureLineAxisSettings(payloadStateSession) });
    }
    if(payloadRefs.regressionMode && c.regression?.mode){
      ensureLineRegressionSelection();
      payloadRefs.regressionMode.value = c.regression.mode;
    }
    if(c.forecast){
      const restoredForecast = {
        horizon: clampForecastHorizon(c.forecast.horizon ?? getLineForecastState(payloadStateSession).horizon),
        seasonLength: clampSeasonLength(c.forecast.seasonLength ?? getLineForecastState(payloadStateSession).seasonLength),
        autoTune: c.forecast.autoTune != null ? !!c.forecast.autoTune : getLineForecastState(payloadStateSession).autoTune,
        criterion: c.forecast.criterion === 'aic' ? 'aic' : 'bic'
      };
      setLineForecastState(payloadStateSession, restoredForecast, { ...(meta || {}), reason: 'line-payload-forecast' });
      if(payloadRefs.forecastHorizon) payloadRefs.forecastHorizon.value = String(restoredForecast.horizon);
      if(payloadRefs.forecastSeasonLength) payloadRefs.forecastSeasonLength.value = String(restoredForecast.seasonLength);
      if(payloadRefs.forecastAuto) payloadRefs.forecastAuto.checked = !!restoredForecast.autoTune;
      if(payloadRefs.forecastCriterion) payloadRefs.forecastCriterion.value = restoredForecast.criterion;
    }
    resolveForecastOptions({ session: payloadStateSession, syncInputs: true, reason: 'line-payload-forecast-sync' });
    updateForecastVisibility();
    if(wants3d){
      lineDisplayMode = 'line';
      if(payloadRefs.displayMode){
        payloadRefs.displayMode.value = 'line';
        payloadRefs.displayMode.disabled = true;
      }
      [payloadRefs.logX, payloadRefs.logY].forEach(cb => {
        if(!cb){ return; }
        cb.checked = false;
        cb.disabled = true;
      });
      if(payloadRefs.showFrame){
        payloadRefs.showFrame.checked = true;
        payloadRefs.showFrame.disabled = true;
      }
      if(payloadRefs.regressionMode){
        payloadRefs.regressionMode.disabled = true;
      }
      if(payloadRefs.showTrendLine){
        payloadRefs.showTrendLine.checked = false;
        payloadRefs.showTrendLine.disabled = true;
      }
      if(payloadRefs.showIntervals){
        payloadRefs.showIntervals.checked = false;
        payloadRefs.showIntervals.disabled = true;
      }
      if(payloadRefs.showPredictionIntervals){
        payloadRefs.showPredictionIntervals.checked = false;
        payloadRefs.showPredictionIntervals.disabled = true;
      }
      if(payloadRefs.forecastFieldset){
        payloadRefs.forecastFieldset.disabled = true;
      }
      if(payloadRefs.replicateMode && payloadRefs.replicateMode.value !== '3d'){
        payloadRefs.replicateMode.value = '3d';
      }
      if(payloadRefs.viewMode && payloadRefs.viewMode.value !== '3d'){
        payloadRefs.viewMode.value = '3d';
      }
      getLineViewState().viewMode = '3d';
      updateLineReplicateModeControls('3d');
    }else{
      if(payloadRefs.displayMode){
        payloadRefs.displayMode.disabled = false;
      }
      [payloadRefs.logX, payloadRefs.logY].forEach(cb => {
        if(cb){
          cb.disabled = false;
        }
      });
      if(payloadRefs.showFrame){
        payloadRefs.showFrame.disabled = false;
      }
      if(payloadRefs.regressionMode){
        payloadRefs.regressionMode.disabled = false;
      }
      if(payloadRefs.showTrendLine){
        payloadRefs.showTrendLine.disabled = false;
      }
      if(payloadRefs.showIntervals){
        payloadRefs.showIntervals.disabled = false;
      }
      if(payloadRefs.showPredictionIntervals){
        payloadRefs.showPredictionIntervals.disabled = false;
      }
      if(payloadRefs.forecastFieldset){
        payloadRefs.forecastFieldset.disabled = false;
      }
      if(payloadRefs.replicateMode && payloadRefs.replicateMode.value === '3d'){
        const fallbackFormat = storedTableFormat === 'grouped'
          ? 'grouped'
          : (storedReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single');
        payloadRefs.replicateMode.value = fallbackFormat;
      }
      if(payloadRefs.viewMode && payloadRefs.viewMode.value !== '2d'){
        payloadRefs.viewMode.value = '2d';
      }
      getLineViewState().viewMode = '2d';
      updateLineReplicateModeControls();
    }
    setLineRegressionSummariesState(c.regression?.seriesSummaries, payloadSession);
    if(c.labelPositions && typeof c.labelPositions === 'object'){
      lineLabelPositions = normalizeLineOwnedLabelsState({ positions: c.labelPositions }).positions;
    }else if(!styleOnly){
      lineLabelPositions = normalizeLineOwnedLabelsState({}).positions;
    }
    // restore persisted stats HTML and metadata if present
    if(c.stats){
      try{
        const s = c.stats || {};
        const payloadStatsState = getLineStatsState(payloadSession);
        payloadStatsState.signature = s.signature || payloadStatsState.signature;
        payloadStatsState.version = Number(s.version) || payloadStatsState.version || 0;
        payloadStatsState.lastRunVersion = Number(s.lastRunVersion) || 0;
        payloadStatsState.panelModel = normalizeLineStatsPanelModel(s.panelModel || s);
        payloadStatsState.regressionSummaries = getLineRegressionSummariesState(payloadSession).slice();
        if(payloadRefs.statsResults){
          if(Shared.statsReporting && typeof Shared.statsReporting.restorePanelModel === 'function'){
            Shared.statsReporting.restorePanelModel(payloadRefs.statsResults, s, {
              ensureReportHost: () => ensureLineStatsReportHost({ session: payloadSession, refs: payloadRefs })
            });
          }else{
            payloadRefs.statsResults.textContent = '';
          }
        }
        // restore stat control values if saved
        if(s.controls && typeof s.controls === 'object'){
          if(typeof s.controls.method === 'string' && payloadRefs.statType){ payloadRefs.statType.value = s.controls.method; }
          if(!c.regression?.mode && typeof s.controls.regressionMode === 'string' && payloadRefs.regressionMode){
            ensureLineRegressionSelectOptions(payloadRefs.regressionMode);
            payloadRefs.regressionMode.value = s.controls.regressionMode;
          }
        }
        const hasSavedStatsModel = !!(s.resultsModel || s.reportModel);
        const hasRestoredResults = hasSavedStatsModel || lineStatsPanelHasRenderedResults({ session: payloadSession, refs: payloadRefs });
        payloadStatsState.hasResults = hasRestoredResults && payloadStatsState.lastRunVersion > 0;
        payloadStatsState.restorePending = hasRestoredResults && payloadStatsState.lastRunVersion > 0
          ? {
              signature: typeof s.signature === 'string' ? s.signature : null,
              version: payloadStatsState.version,
              hasResults: true
            }
          : null;
        if(hasRestoredResults && payloadStatsState.lastRunVersion){
          setLineStatsStatus('Statistics up to date.', { session: payloadSession, refs: payloadRefs });
          updateLineStatsButtonState({ disabled: false, label: 'Recalculate statistics' }, { session: payloadSession, refs: payloadRefs });
          updateLineRegressionOverlayControlState(true, { session: payloadSession, refs: payloadRefs });
        }else{
          // leave button enabled so user can (re)calculate
          updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' }, { session: payloadSession, refs: payloadRefs });
          updateLineRegressionOverlayControlState(false, { session: payloadSession, refs: payloadRefs });
        }
        payloadStatsState.context = null;
        payloadStatsState.computationPending = false;
        console.debug('Debug: line stats restored from payload', { signature: s.signature, version: s.version, lastRunVersion: s.lastRunVersion });
      }catch(e){
        console.debug('Debug: restore line stats failed', e?.message || String(e));
      }
    }
    else {
      // no persisted stats in payload -> clear any previous results and state
      try{
        clearLineStatsOutputs(lineStatsEmptyPlaceholder, { session: payloadSession, refs: payloadRefs });
        const payloadStatsState = getLineStatsState(payloadSession);
        payloadStatsState.signature = null;
        payloadStatsState.version = 0;
        payloadStatsState.lastRunVersion = 0;
        payloadStatsState.hasResults = false;
        payloadStatsState.panelModel = { resultsModel: null, reportModel: null };
        payloadStatsState.regressionSummaries = [];
        payloadStatsState.context = null;
        payloadStatsState.computationPending = false;
        payloadStatsState.restorePending = null;
        setLineRegressionSummariesState([], payloadSession);
        updateLineStatsButtonState({ disabled: true, label: 'Calculate statistics' }, { session: payloadSession, refs: payloadRefs });
      }catch(err){
        console.debug('Debug: clearing line stats during payload apply failed', { err: err?.message || String(err) });
      }
    }
    setLineLabelsState(payloadStateSession, {
      ...getLineLabelsState(payloadStateSession),
      title: lineTitleText,
      x: lineXLabelText,
      y: lineYLabelText,
      z: lineZLabelText,
      colors: lineLabelColors,
      positions: lineLabelPositions
    }, {
      ...(meta || {}),
      reason: meta?.colorSchemeOnly ? 'line-color-scheme-labels' : 'line-payload-labels'
    });
    ensureLineLabelColors(Object.keys(lineLabelColors), payloadStateSession);
    console.debug('Debug: line payload visual state restored', {
      reason: meta?.reason || meta?.source || null,
      colorSchemeOnly: meta?.colorSchemeOnly === true,
      labelColorCount: Object.keys(lineLabelColors || {}).length,
      seriesStyleCount: Object.keys(lineSeriesStyles || {}).length
    });
    ensureLineResizerControls();
    syncLineAspectControls('payload');
    syncLineRuntimeControlsFromRefs();
    rememberLineSessionState(meta?.tab || meta?.tabId || getLineProjectionTabId() || null, { ...(meta || {}), reason: meta?.reason || 'line-payload-state-store' }, { readControls: false });
    if(!skipDraw){
      const drawReason = meta?.reason || meta?.source || (styleOnly ? 'line-style-payload' : 'line-payload');
      if(styleOnly){
        scheduleLineViewRefresh(drawReason, { force: true, skipThresholdEvaluation: true });
      }else if(canScheduleActiveLineDraw()){
        scheduleActiveLineDraw({ reason: drawReason });
      }
    }
    if(scheduleBackup || sessionScheduleBackup){
      const ownerPayloadSession = payloadSession || getLineActiveSessionForState();
      if(ownerPayloadSession){
        const restoreScheduler = typeof sessionScheduleBackup === 'function'
          ? sessionScheduleBackup
          : (typeof scheduleBackup === 'function' ? scheduleBackup : null);
        const currentSessionScheduler = getLineSessionDrawScheduler(ownerPayloadSession, { allowFallback: false });
        if(restoreScheduler && currentSessionScheduler === mutedDrawScheduler){
          setLineSessionDrawSchedulers(ownerPayloadSession, { drawScheduler: restoreScheduler }, { mirrorFallback: false });
        }
      }else if(!line.__boundTabId && typeof scheduleBackup === 'function' && lineFallbackDrawScheduler === mutedDrawScheduler){
        lineFallbackDrawScheduler = scheduleBackup;
      }
    }
    console.debug('Debug: line payload applied', { source: meta.source || 'unknown', hasData: !!matrixData });
    return true;
  }

  function loadLineGraphFile(file, options = {}){
    const ownerTabId = String(options?.tabId || options?.operation?.tabId || getLineProjectionTabId() || '').trim() || null;
    const operation = fileIO?.createGraphOpenOperation?.({
      context: 'line',
      operation: options?.operation,
      owner: { component: 'line', tabId: ownerTabId }
    }) || options?.operation || null;
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        const routed = fileIO?.routeGraphOpenPayload?.({
          context: 'line',
          component: 'line',
          operation,
          payload: obj,
          reason: 'line-graph-file-open',
          apply: (payload, owner) => applyLineGraphPayload(payload, {
            source: 'file',
            flagOverlay: true,
            overlayReason: 'graph-file',
            tabId: owner?.tabId || ownerTabId || undefined
          })
        });
        const fallbackOwnerIsCurrent = !ownerTabId || String(getLineProjectionTabId() || '') === ownerTabId;
        const accepted = routed ? routed.value !== false : (fallbackOwnerIsCurrent && applyLineGraphPayload(obj, {
          source: 'file',
          flagOverlay: true,
          overlayReason: 'graph-file',
          tabId: ownerTabId || undefined
        }));
        if(!accepted){
          console.warn('line payload rejected from file', { hasType: !!obj?.type, routeStatus: routed?.status || null });
        }
      }catch(err){ console.error('loadLineGraph error',err); }
    };
    reader.readAsText(file);
  }

  async function saveLineFile(){
    const operationSession = getLineActiveSessionForState();
    const payload=getLineGraphPayload();
    if(!payload) return;
    console.debug('Debug: saveLineFile',{hasHandle:!!lineFileHandle}); // Debug: save request
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveLineFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'line',
      owner: { component: 'line', tabId: operationSession?.tabId || getLineProjectionTabId() || null },
      fileHandle: lineFileHandle,
      payload,
      fileName: lineFileName,
      downloadFileName: lineFileName,
      setFileHandle: handle => { setLineFileHandleForSession(handle, operationSession); },
      setFileName: name => { setLineFileNameForSession(name, operationSession); }
    });
    console.debug('Debug: saveLineFile result', result);
  }

  async function saveAsLineFile(){
    const operationSession = getLineActiveSessionForState();
    const payload=getLineGraphPayload();
    if(!payload) return;
    console.debug('Debug: saveAsLineFile invoked'); // Debug: saveAs entry
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsLineFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'line',
      owner: { component: 'line', tabId: operationSession?.tabId || getLineProjectionTabId() || null },
      payload,
      fileName: lineFileName,
      downloadFileName: lineFileName,
      setFileHandle: handle => { setLineFileHandleForSession(handle, operationSession); },
      setFileName: name => { setLineFileNameForSession(name, operationSession); }
    });
    console.debug('Debug: saveAsLineFile result', result);
  }

  async function openLineFile(){
    const operationSession = getLineActiveSessionForState();
    const operationTabId = operationSession?.tabId || getLineProjectionTabId() || null;
    console.debug('Debug: openLineFile start'); // Debug: open entry
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openLineFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'line',
      owner: { component: 'line', tabId: operationTabId },
      setFileHandle: handle => { setLineFileHandleForSession(handle, operationSession); },
      setFileName: name => { setLineFileNameForSession(name, operationSession); },
      loadFromFile: (file, operation) => loadLineGraphFile(file, { operation, tabId: operationTabId }),
      triggerInput: () => {
        if(refs.graphFileInput){
          refs.graphFileInput.value='';
          refs.graphFileInput.click();
        }
      }
    });
    console.debug('Debug: openLineFile result', result);
  }

  function buildLineExportSvg(){
    const svgEl=refs.plot?.querySelector?.('#lineSvg')
      || refs.root?.querySelector?.('#lineSvg')
      || getLineNodeById('lineSvg');
    if(!svgEl) return null;
    const clone=svgEl.cloneNode(true);
    Shared.exportProjection?.attachSource?.(clone, svgEl);
    const exportFont = chartStyle.FONT_FAMILY || 'Arial, Helvetica, sans-serif';
    clone.setAttribute('font-family', exportFont);
    console.debug('Debug: buildLineExportSvg',{legendCount:lineLegendItems.length, exportFont}); // Debug: export clone info
    return clone;
  }

  // PART: DRAW
  async function drawLine3d(sessionOrOptions = {}, maybeOptions = {}){
    const invocation = resolveLineInvocationSession(sessionOrOptions, maybeOptions);
    const drawOpts = invocation.options || {};
    if(invocation.session && !isLineSessionActive(invocation.session)){
      markLineOwnerDrawPending(invocation.session, {
        ...(drawOpts || {}),
        reason: drawOpts.reason || 'line-3d-draw-inactive'
      });
      return false;
    }
    bindLineInvocationSession(invocation.session, drawOpts.reason || 'line-3d-draw', { syncControls: false });
    const execution = Shared.jobs?.createExecutionContext?.({
      component: 'line',
      tabId: invocation.session?.tabId || drawOpts.tabId || getLineProjectionTabId() || '',
      kind: 'graph',
      budgetMs: 10,
      drawOptions: drawOpts
    }) || null;
    const liveRotationDraw = drawOpts?.reason === 'rotation';
    const checkpoint = async () => {
      if(liveRotationDraw){
        return execution?.isCurrent?.() !== false;
      }
      try{
        await execution?.checkpoint?.();
      }catch(err){
        if(execution?.signal?.aborted || execution?.isCurrent?.() === false){
          return false;
        }
        throw err;
      }
      return execution?.isCurrent?.() !== false;
    };
    let svgPublication = null;
    try{
      const debugStamp = Date.now();
      console.debug('Debug: drawLine3d start', { debugStamp });
      hideLineTooltip('redraw-start');
      const hot = getLineSessionHotManager(invocation.session) || getActiveLineHotManager();
      if(!hot || !refs.plot){
        return;
      }
      const viewState = getLineViewState(invocation.session);
      viewState.rotationPending = false;
      viewState.rotationPendingLogged = false;
      commitLineRotationState(viewState.rotation, invocation.session, drawOpts?.reason || 'line-3d-draw');
      const controls = getLineRuntimeControlsForSession(invocation.session, lineFallbackRuntimeControls);
      let lineLabelsState = getLineLabelsState(invocation.session);
      const lineThemeState = getLineThemeState(invocation.session);
      const lineStylesState = getLineStylesState(invocation.session);
      let lineGroupedState = getLineGroupedState(invocation.session);
      const alpha = Number(controls.alpha) || 0;
      const borderWidthRaw = Number(controls.borderWidth);
      const borderColor = controls.border;
      const drawableFrame = resolveLineDrawableFrame(refs.plot);
      const fontInfo = chartStyle.resolveScaledFontSize({
        rawSize: controls.fontSize,
        width: drawableFrame.width,
        height: drawableFrame.height,
        svgBox: refs.svgBox,
        input: refs.fontSize
      });
      const fs = fontInfo.scaledPx;
      const styleScaleInfo = fontInfo.scaleInfo;
      const axisStrokeWidthBase = getLineAxisStrokeWidth(invocation.session);
      const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'line-axis-3d', min: 0, exact: true });
      const axisStroke = getLineAxisColor(invocation.session);
      const lineThemeDark = String(lineThemeState.colorScheme || '').toLowerCase() === 'dark';
      const lineThemeTextColor = getLineThemeTextColor(invocation.session);
      const dotSizeRaw = Number(controls.dotSize) || LINE_DEFAULT_DOT_SIZE;
      const dotSizePx = chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'line-marker-3d', min: 0 });
      const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'line-series-3d', min: 0 });
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize });
      const showGrid = !!controls.showGrid;
      const gridStyleBase3d = getLineGridStyle(axisStrokeWidthBase, invocation.session);
      const gridStrokeStyle3d = Object.assign({}, gridStyleBase3d, {
        thickness: chartStyle.scaleStrokeWidth(gridStyleBase3d.thickness, styleScaleInfo, { context: 'line-grid-3d', min: 0 })
      });
      const gridDash3d = (gridControls && typeof gridControls.patternToDasharray === 'function')
        ? gridControls.patternToDasharray(gridStrokeStyle3d.pattern, gridStrokeStyle3d.thickness)
        : null;
      const gridOpacity3d = (gridControls && typeof gridControls.transparencyToOpacity === 'function')
        ? gridControls.transparencyToOpacity(gridStrokeStyle3d.transparency)
        : 1;
      const showFrame = true;
      const showLegend = controls.showLegend !== false;
      ensureLineResizerControls();
      const xMinManual = parseFloat(controls.xMin);
      const xMaxManual = parseFloat(controls.xMax);
      const yMinManual = parseFloat(controls.yMin);
      const yMaxManual = parseFloat(controls.yMax);

      const matrix = typeof hot?.getIncludedDataMatrix === 'function'
        ? hot.getIncludedDataMatrix()
        : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(hot) : []);
      if(!Array.isArray(matrix) || !matrix.length){
        resetLineRenderState('line-3d-no-data-matrix',{
          message: Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : 'Add data to the input table to generate a plot.',
        });
        handleLineStatsUnavailable(null, lineStatsEmptyPlaceholder);
        return;
      }
      const axisHeaders = resolveLine3dAxisHeaders(matrix);
      const prevAxisLabels = { x: lineLabelsState.x, y: lineLabelsState.y, z: lineLabelsState.z };
      const inferredAxisLabels = {};
      if(!String(lineLabelsState.x || '').trim() || lineLabelsState.x === 'X') inferredAxisLabels.x = axisHeaders.xLabel;
      if(!String(lineLabelsState.y || '').trim() || lineLabelsState.y === 'Y title') inferredAxisLabels.y = axisHeaders.yLabel;
      if(!String(lineLabelsState.z || '').trim() || lineLabelsState.z === 'Z') inferredAxisLabels.z = axisHeaders.zLabel;
      if(Object.keys(inferredAxisLabels).length){
        lineLabelsState = patchLineLabelsState(invocation.session, inferredAxisLabels, { reason: 'line-3d-axis-label-sync' });
      }
      if(prevAxisLabels.x !== lineLabelsState.x || prevAxisLabels.y !== lineLabelsState.y || prevAxisLabels.z !== lineLabelsState.z){
        lineDebug('Debug: line 3d axis labels synced', {
          previous: prevAxisLabels,
          next: { x: lineLabelsState.x, y: lineLabelsState.y, z: lineLabelsState.z }
        });
      }
      const seriesCount = inferLine3dSeriesCount(matrix);
      if(seriesCount <= 0){
        resetLineRenderState('line-3d-no-series', { message: 'Add X/Y/Z dataset columns to render a 3D line plot.' });
        handleLineStatsUnavailable(null, '3D line view requires X, Y, and Z columns for each dataset.');
        return;
      }
      ensureLine3dGroupLabelCapacity(seriesCount, { data: matrix, hot, reason: 'line-3d-draw-labels' });
      lineGroupedState = patchLineGroupedState(invocation.session, {
        labels: Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [],
        shapes: lineGroupShapes
      }, { reason: 'line-3d-draw-label-sync' });
      ensureLineGroupShapeCapacity(seriesCount, invocation.session);
      const series = [];
      for(let s = 0; s < seriesCount; s += 1){
        const stored = lineGroupedState.labels?.[s];
        const resolvedName = stored && String(stored).trim() ? String(stored).trim() : `Series ${s + 1}`;
        if(!lineGroupedState.labels?.[s]){
          const nextLabels = Array.isArray(lineGroupedState.labels) ? lineGroupedState.labels.slice() : [];
          nextLabels[s] = resolvedName;
          lineGroupedState = patchLineGroupedState(invocation.session, { labels: nextLabels }, { reason: 'line-3d-series-label-default' });
        }
        series.push({ name: resolvedName, points: [], shape: getLineGroupShape(s, invocation.session), seriesIndex: s });
      }
      let xMinRaw = Infinity;
      let xMaxRaw = -Infinity;
      let yMinRaw = Infinity;
      let yMaxRaw = -Infinity;
      let zMinRaw = Infinity;
      let zMaxRaw = -Infinity;
      for(let r = getLine3dDataStartRow(matrix); r < matrix.length; r += 1){
        if((r & 1023) === 0 && !(await checkpoint())){
          return false;
        }
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        for(let s = 0; s < seriesCount; s += 1){
          const startCol = getLine3dDatasetStartCol(s);
          const xv = parseFloat(row[startCol]);
          const yv = parseFloat(row[startCol + 1]);
          const zv = parseFloat(row[startCol + 2]);
          if(Number.isFinite(xv) && Number.isFinite(yv) && Number.isFinite(zv)){
            const pt = { x: xv, y: yv, z: zv };
            series[s].points.push(pt);
            if(xv < xMinRaw){ xMinRaw = xv; }
            if(xv > xMaxRaw){ xMaxRaw = xv; }
            if(yv < yMinRaw){ yMinRaw = yv; }
            if(yv > yMaxRaw){ yMaxRaw = yv; }
            if(zv < zMinRaw){ zMinRaw = zv; }
            if(zv > zMaxRaw){ zMaxRaw = zv; }
          }else{
            series[s].points.push(null);
          }
        }
      }
      let seriesWithData = series.filter(s => s.points.some(Boolean));
      if(!seriesWithData.length){
        resetLineRenderState('line-3d-no-valid-series', { message: 'Add numeric X, Y, and Z values (with at least two rows) to render a 3D line plot.' });
        handleLineStatsUnavailable(null, '3D line view requires numeric X, Y, and Z values.');
        return;
      }
      const anyLineReady = seriesWithData.some(s => s.points.filter(Boolean).length >= 2);
      if(!anyLineReady){
        resetLineRenderState('line-3d-not-enough-points', { message: 'Add at least two complete (X,Y,Z) rows in a dataset to render a 3D line.' });
        handleLineStatsUnavailable(null, '3D line view requires at least two complete rows in a dataset.');
        return;
      }
      let xMin = Number.isFinite(xMinManual) ? xMinManual : xMinRaw;
      let xMax = Number.isFinite(xMaxManual) ? xMaxManual : xMaxRaw;
      let yMin = Number.isFinite(yMinManual) ? yMinManual : yMinRaw;
      let yMax = Number.isFinite(yMaxManual) ? yMaxManual : yMaxRaw;
      let zMin = zMinRaw;
      let zMax = zMaxRaw;
      if(!Number.isFinite(zMin) || !Number.isFinite(zMax)){
        zMin = -1;
        zMax = 1;
      }
      if(xMin === xMax){ xMax = xMin + 1; }
      if(yMin === yMax){ yMax = yMin + 1; }
      if(zMin === zMax){
        const pad = Math.abs(zMin) || 1;
        zMin -= pad;
        zMax += pad;
      }
      const filterPointByRange = (pt, range) => {
        if(!pt){
          return null;
        }
        if(pt.x < range.xMin || pt.x > range.xMax || pt.y < range.yMin || pt.y > range.yMax || pt.z < range.zMin || pt.z > range.zMax){
          return null;
        }
        return pt;
      };
      const clipSeriesToRange = (inputSeries, range) => {
        const clipped = [];
        inputSeries.forEach(s => {
          const clippedPoints = s.points.map(pt => filterPointByRange(pt, range));
          if(clippedPoints.some(Boolean)){
            clipped.push({ ...s, points: clippedPoints });
          }
        });
        return clipped;
      };
      const range3d = { xMin, xMax, yMin, yMax, zMin, zMax };
      seriesWithData = clipSeriesToRange(seriesWithData, range3d);
      if(!seriesWithData.length){
        resetLineRenderState('line-3d-no-series-after-clipping', { message: 'Adjust the axis range to render a 3D line plot.' });
        handleLineStatsUnavailable(null, 'Adjust the axis range to render a 3D line plot.');
        return;
      }
      const labelsUsed = seriesWithData.map(s => s.name);
      ensureLineLabelColors(labelsUsed, invocation.session);
      lineLabelsState = patchLineLabelsState(invocation.session, { colors: lineLabelColors }, { reason: 'line-3d-label-colors-sync' });
      const colors = seriesWithData.map((s, i) => lineLabelsState.colors?.[s.name] || borderColor || DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length]);
      const seriesShapes = seriesWithData.map((s) => {
        const idx = Number.isInteger(s.seriesIndex) ? s.seriesIndex : 0;
        const resolvedShape = sanitizeLineGroupShape(s.shape, idx);
        s.shape = resolvedShape;
        return resolvedShape;
      });
      const legendEntries = seriesWithData.map((s, i) => createLineLegendEntry(s, i, {
        color: colors[i],
        shape: seriesShapes[i],
        styles: lineStylesState,
        alpha,
        lineStrokeWidth: borderWidthPx,
        markerSize: dotSizePx,
        markerStroke: borderColor
      }));
      const legendLayout = chartStyle.computeLegendLayout({
        entries: showLegend ? legendEntries : [],
        fontSize: fs,
        viewportHeight: drawableFrame.height,
        scaleInfo: styleScaleInfo,
        strokeWidth: borderWidthPx,
        textColor: lineThemeTextColor,
        onSwatchClick: ({ entry, swatch, event, index }) => {
          const legendKey = entry?.key || entry?.label;
          if(!legendKey || !swatch){
            return;
          }
          if(event){
            event.stopPropagation();
          }
          const currentColor = lineLabelsState.colors?.[legendKey] || entry.fill;
          const seriesIndex = Number.isInteger(entry.seriesIndex) && entry.seriesIndex >= 0
            ? entry.seriesIndex
            : (Number.isInteger(index) ? index : -1);
          const initialShape = Number.isInteger(seriesIndex) && seriesIndex >= 0
            ? getLineGroupShape(seriesIndex, invocation.session)
            : null;
          const applyLegendColor = value => {
            const nextValue = value != null ? String(value) : '';
            const currentLabels = getLineLabelsState(invocation.session);
            const nextColors = cloneLineRuntimeValue(currentLabels.colors, {}) || {};
            const previousValue = nextColors[legendKey] || '';
            if(nextValue){
              if(previousValue === nextValue){
                return true;
              }
              nextColors[legendKey] = nextValue;
            }else if(previousValue){
              delete nextColors[legendKey];
            }else{
              return true;
            }
            lineLabelsState = patchLineLabelsState(invocation.session, { colors: nextColors }, { reason: 'line-3d-legend-color' });
            scheduleActiveLineDraw();
            return true;
          };
          const applyLegendShape = value => {
            if(!Number.isInteger(seriesIndex) || seriesIndex < 0){
              return true;
            }
            const sanitized = sanitizeLineGroupShape(value, seriesIndex);
            const shapes = ensureLineGroupShapeCapacity(Math.max(seriesCount, seriesIndex + 1), invocation.session);
            if(shapes[seriesIndex] === sanitized){
              return true;
            }
            shapes[seriesIndex] = sanitized;
            lineGroupedState = patchLineGroupedState(invocation.session, { shapes }, { reason: 'line-3d-legend-shape' });
            scheduleActiveLineDraw();
            return true;
          };
          let previousColor = currentColor;
          let previousShape = Number.isInteger(seriesIndex) && seriesIndex >= 0
            ? sanitizeLineGroupShape(initialShape, seriesIndex)
            : null;
          Shared.openColorPicker({
            anchor: swatch,
            color: currentColor,
            shapePicker: Number.isInteger(seriesIndex) && seriesIndex >= 0 ? {
              value: previousShape,
              options: LINE_GROUP_SHAPE_OPTIONS,
              onChange(nextShape){
                const sanitized = sanitizeLineGroupShape(nextShape, seriesIndex);
                if(sanitized === previousShape){
                  return;
                }
                applyLegendShape(sanitized);
                recordLineChange(`line:legend-shape:${legendKey}`, previousShape, sanitized, applyLegendShape);
                previousShape = sanitized;
              }
            } : null,
            onInput(value){
              applyLegendColor(value);
            },
            onChange(value){
              const nextValue = value != null ? String(value) : '';
              if(nextValue === previousColor){
                return;
              }
              applyLegendColor(nextValue);
              recordLineChange(`line:legend-color:${legendKey}`, previousColor, nextValue, applyLegendColor);
              previousColor = nextValue;
            }
          });
        }
      });
      lineLegendWidth = legendLayout.legendWidthForMargin;
      lineLegendItems = showLegend ? legendEntries.map(item => ({ label: item.label, color: item.fill })) : [];
      lineLegendLayoutInfo = {
        entryCount: legendLayout.renderer.entries.length,
        rendererWidth: legendLayout.renderer.width,
        legendWidthForMargin: legendLayout.legendWidthForMargin,
        legendGapPx: legendLayout.legendGapPx,
        minSvgWidth: legendLayout.minSvgWidth,
        basePlotWidth: legendLayout.basePlotWidth,
        guardPaddingPx: legendLayout.guardPaddingPx,
        swatchSize: legendLayout.renderer.swatchSize,
        swatchGap: legendLayout.renderer.swatchGap,
        rowGap: legendLayout.renderer.rowGap,
        rowHeight: legendLayout.renderer.rowHeight,
        fontSize: legendLayout.renderer.fontSize,
        minWidth: legendLayout.renderer.minWidth,
        maxLabelWidth: legendLayout.renderer.maxLabelWidth,
        entries: legendLayout.renderer.entries.map(entry => ({ label: entry.label, key: entry.key, labelWidth: entry.labelWidth }))
      };
      const plotEl = refs.plot;
      const targetAspect = Number.isFinite(LINE_3D_DEFAULTS.aspectRatio) && LINE_3D_DEFAULTS.aspectRatio > 0 ? LINE_3D_DEFAULTS.aspectRatio : (4 / 3);
      const fallbackWidth = 460;
      const fallbackHeight = Math.round(fallbackWidth / targetAspect);
      const availableWidth = Math.floor(drawableFrame.width || 0);
      const availableHeight = Math.floor(drawableFrame.height || 0);
      let W3 = availableWidth > 0 ? availableWidth : fallbackWidth;
      let H3 = Math.round(W3 / targetAspect);
      if(availableHeight > 0 && H3 > availableHeight){
        H3 = Math.max(1, availableHeight);
        W3 = Math.max(1, Math.round(H3 * targetAspect));
        if(availableWidth > 0 && W3 > availableWidth){
          W3 = Math.max(1, availableWidth);
          H3 = Math.max(1, Math.round(W3 / targetAspect));
        }
      }
      if(W3 <= 0 || H3 <= 0){
        W3 = fallbackWidth;
        H3 = fallbackHeight;
      }
      const baseW3 = W3;
      const legendVisible = showLegend && legendLayout?.renderer?.entries?.length > 0;
      const legendAxisGap = Math.max(fs * 0.9, 18);
      const appliedLegendAxisGap = legendVisible ? legendAxisGap : 0;
      const legendViewport3d = chartStyle.computeLegendViewport({
        baseWidth: baseW3,
        baseHeight: H3,
        legendWidth: legendVisible ? lineLegendWidth + appliedLegendAxisGap : 0
      });
      W3 = legendViewport3d.width;
      plotEl.style.display = 'block';
      plotEl.style.position = 'relative';
      const line3dDrawReason = drawOpts?.reason || 'line-3d-draw';
      const lifecycleRestoreContext = !!Shared.componentLifecycle?.isRestoreTransactionActive?.('line', { tabId: getLineProjectionTabId() || null, reason: line3dDrawReason });
      if(lifecycleRestoreContext){
        plotEl.style.removeProperty('aspect-ratio');
        lineDebug('Debug: line 3D plot aspect-ratio write suppressed during restore transaction', { W3, H3, reason: line3dDrawReason });
      }else{
        plotEl.style.aspectRatio = `${W3} / ${H3}`;
      }
      plotEl.style.padding = plotEl.style.padding || '12px';
      plotEl.style.backgroundColor = '';
      plotEl.style.boxSizing = 'border-box';
      const existingLineSvg = plotEl.querySelector?.('#lineSvg') || null;
      const reuse3dSvg = liveRotationDraw
        && existingLineSvg
        && existingLineSvg.dataset?.viewMode === '3d';
      const svg3 = reuse3dSvg
        ? existingLineSvg
        : global.document.createElementNS(NS, 'svg');
      svg3.setAttribute('width', String(W3));
      svg3.setAttribute('height', String(H3));
      svg3.setAttribute('viewBox', `0 0 ${W3} ${H3}`);
      svg3.setAttribute('font-family', chartStyle.FONT_FAMILY);
      svg3.dataset.viewMode = '3d';
      chartStyle.prepareSvg(svg3, { scopeId: 'line' });
      stampLineParameterObservables(svg3, invocation.session);
      const legendProjection = chartStyle.stageLegendViewport({
        svgBox: refs.svgBox,
        plot: plotEl,
        svg: svg3,
        baseWidth: baseW3,
        baseHeight: H3,
        legendWidth: legendVisible ? lineLegendWidth + appliedLegendAxisGap : 0
      });
      if(reuse3dSvg){
        svg3.replaceChildren();
      }
      svg3.style.backgroundColor = lineThemeDark
        ? normalizeLineThemeColor(lineThemeState.backgroundColor, '#000000')
        : '';
      svg3.style.pointerEvents = 'all';
      svg3.setAttribute('data-color-scheme', lineThemeState.colorScheme || 'scientific');
      if(!reuse3dSvg){
        svgPublication = Shared.framePublication.stage({
          container: plotEl,
          frame: svg3,
          publishedId: 'lineSvg',
          component: 'line',
          tabId: execution?.tabId || invocation.session?.tabId || drawOpts?.tabId || null,
          canCommit: () => execution?.isCurrent?.() !== false
            && (!invocation.session || isLineSessionActive(invocation.session))
        });
      }
      appendLine3dBackground(svg3, W3, H3, invocation.session);
      if(!reuse3dSvg){
        svg3.addEventListener('mouseleave', handleLinePlotMouseLeave);
      }
      bindLine3dRotationControls(svg3, 'line-3d', invocation.session);

      const legendGapFor3d = legendLayout?.legendGapPx ?? 12;
      const baseLegendMargin = Math.max(fs * 2.25, 28);
      const legendMargin = legendVisible ? lineLegendWidth + appliedLegendAxisGap + baseLegendMargin : baseLegendMargin;
      const margin3 = {
        top: Math.max(fs * 3.2, 36),
        right: legendMargin,
        bottom: Math.max(fs * 3.2, 40),
        left: Math.max(fs * 3.2, 40)
      };
      const legendShiftX = typeof plot3d.resolveLegendShiftX === 'function'
        ? plot3d.resolveLegendShiftX({ legendVisible, margin: margin3, fontSize: fs, legendWidth: lineLegendWidth })
        : 0;
      const plotW3 = Math.max(20, W3 - margin3.left - margin3.right);
      const plotH3 = Math.max(20, H3 - margin3.top - margin3.bottom);

      const axisTickTools = chartStyle.axisTicks || null;
      const buildAxisScale = opts => {
        if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
          return axisTickTools.buildScale(opts);
        }
        const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
        const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
        return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
      };
      const tickTarget = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(Math.max(plotW3, plotH3), { fallback: 6 }) : 6;
      const xScale3d = buildAxisScale({
        dataMin: xMin,
        dataMax: xMax,
        manualMin: Number.isFinite(xMinManual) ? xMinManual : null,
        manualMax: Number.isFinite(xMaxManual) ? xMaxManual : null,
        targetTickCount: tickTarget
      });
      const yScale3d = buildAxisScale({
        dataMin: yMin,
        dataMax: yMax,
        manualMin: Number.isFinite(yMinManual) ? yMinManual : null,
        manualMax: Number.isFinite(yMaxManual) ? yMaxManual : null,
        targetTickCount: tickTarget
      });
      const zScale3d = buildAxisScale({
        dataMin: zMin,
        dataMax: zMax,
        targetTickCount: tickTarget
      });
      const axisRanges3d = {
        x: { min: Number.isFinite(xScale3d.min) ? xScale3d.min : xMin, max: Number.isFinite(xScale3d.max) ? xScale3d.max : xMax },
        y: { min: Number.isFinite(yScale3d.min) ? yScale3d.min : yMin, max: Number.isFinite(yScale3d.max) ? yScale3d.max : yMax },
        z: { min: Number.isFinite(zScale3d.min) ? zScale3d.min : zMin, max: Number.isFinite(zScale3d.max) ? zScale3d.max : zMax }
      };
      const axisTicksOriginal3d = {
        x: Array.isArray(xScale3d.ticks) ? xScale3d.ticks : [],
        y: Array.isArray(yScale3d.ticks) ? yScale3d.ticks : [],
        z: Array.isArray(zScale3d.ticks) ? zScale3d.ticks : []
      };
      let axisTicks3d = axisTicksOriginal3d;
      let renderAxisRanges3d = axisRanges3d;
      let renderSeries3d = seriesWithData;
      let axisTickFormatters3d = null;
      const equalScale3d = !!getLineViewState().equalScaleAxes;
      const equalLength3d = !!getLineViewState().equalAxes;
      if(equalScale3d){
        const axisCenters3d = {
          x: (axisRanges3d.x.min + axisRanges3d.x.max) / 2,
          y: (axisRanges3d.y.min + axisRanges3d.y.max) / 2,
          z: (axisRanges3d.z.min + axisRanges3d.z.max) / 2
        };
        const axisSpans3d = {
          x: axisRanges3d.x.max - axisRanges3d.x.min,
          y: axisRanges3d.y.max - axisRanges3d.y.min,
          z: axisRanges3d.z.max - axisRanges3d.z.min
        };
        const maxSpan = Math.max(axisSpans3d.x, axisSpans3d.y, axisSpans3d.z, 1);
        if(Number.isFinite(maxSpan) && maxSpan > 0){
          const halfSpan = maxSpan / 2;
          renderAxisRanges3d = {
            x: { min: axisCenters3d.x - halfSpan, max: axisCenters3d.x + halfSpan },
            y: { min: axisCenters3d.y - halfSpan, max: axisCenters3d.y + halfSpan },
            z: { min: axisCenters3d.z - halfSpan, max: axisCenters3d.z + halfSpan }
          };
          const xTicksScale3d = buildAxisScale({
            dataMin: renderAxisRanges3d.x.min,
            dataMax: renderAxisRanges3d.x.max,
            manualMin: renderAxisRanges3d.x.min,
            manualMax: renderAxisRanges3d.x.max,
            targetTickCount: tickTarget
          });
          const yTicksScale3d = buildAxisScale({
            dataMin: renderAxisRanges3d.y.min,
            dataMax: renderAxisRanges3d.y.max,
            manualMin: renderAxisRanges3d.y.min,
            manualMax: renderAxisRanges3d.y.max,
            targetTickCount: tickTarget
          });
          const zTicksScale3d = buildAxisScale({
            dataMin: renderAxisRanges3d.z.min,
            dataMax: renderAxisRanges3d.z.max,
            manualMin: renderAxisRanges3d.z.min,
            manualMax: renderAxisRanges3d.z.max,
            targetTickCount: tickTarget
          });
          axisTicks3d = {
            x: Array.isArray(xTicksScale3d.ticks) ? xTicksScale3d.ticks : [],
            y: Array.isArray(yTicksScale3d.ticks) ? yTicksScale3d.ticks : [],
            z: Array.isArray(zTicksScale3d.ticks) ? zTicksScale3d.ticks : []
          };
          lineDebug('Debug: line 3d equal scale applied', {
            maxSpan,
            axisRanges: renderAxisRanges3d
          });
        }else{
          lineDebug('Debug: line 3d equal scale skipped', { maxSpan, axisSpans: axisSpans3d });
        }
      }else if(equalLength3d){
        const axisCenters3d = {
          x: (axisRanges3d.x.min + axisRanges3d.x.max) / 2,
          y: (axisRanges3d.y.min + axisRanges3d.y.max) / 2,
          z: (axisRanges3d.z.min + axisRanges3d.z.max) / 2
        };
        const axisSpans3d = {
          x: axisRanges3d.x.max - axisRanges3d.x.min,
          y: axisRanges3d.y.max - axisRanges3d.y.min,
          z: axisRanges3d.z.max - axisRanges3d.z.min
        };
        const maxSpan = Math.max(axisSpans3d.x, axisSpans3d.y, axisSpans3d.z, 1);
        const scaleFactors = {
          x: axisSpans3d.x > 0 ? (maxSpan / axisSpans3d.x) : 1,
          y: axisSpans3d.y > 0 ? (maxSpan / axisSpans3d.y) : 1,
          z: axisSpans3d.z > 0 ? (maxSpan / axisSpans3d.z) : 1
        };
        const scaleValue = (axisKey, value) => axisCenters3d[axisKey] + (value - axisCenters3d[axisKey]) * scaleFactors[axisKey];
        const unscaleValue = (axisKey, value) => axisCenters3d[axisKey] + (value - axisCenters3d[axisKey]) / (scaleFactors[axisKey] || 1);
        renderAxisRanges3d = {
          x: { min: scaleValue('x', axisRanges3d.x.min), max: scaleValue('x', axisRanges3d.x.max) },
          y: { min: scaleValue('y', axisRanges3d.y.min), max: scaleValue('y', axisRanges3d.y.max) },
          z: { min: scaleValue('z', axisRanges3d.z.min), max: scaleValue('z', axisRanges3d.z.max) }
        };
        axisTicks3d = {
          x: axisTicksOriginal3d.x.map(value => scaleValue('x', value)),
          y: axisTicksOriginal3d.y.map(value => scaleValue('y', value)),
          z: axisTicksOriginal3d.z.map(value => scaleValue('z', value))
        };
        const formatTick = (axisKey, scaledValue) => {
          const originalValue = unscaleValue(axisKey, scaledValue);
          if(typeof chartStyle.formatAxisValue === 'function'){
            return chartStyle.formatAxisValue(originalValue, { maxDecimals: 2 });
          }
          if(typeof chartStyle.formatScientific === 'function'){
            return chartStyle.formatScientific(originalValue, { maxDecimals: 2 });
          }
          if(!Number.isFinite(originalValue)){
            return '';
          }
          return String(originalValue);
        };
        axisTickFormatters3d = {
          x: value => formatTick('x', value),
          y: value => formatTick('y', value),
          z: value => formatTick('z', value)
        };
        renderSeries3d = seriesWithData.map(seriesEntry => ({
          ...seriesEntry,
          points: seriesEntry.points.map(pt => {
            if(!pt){
              return null;
            }
            return {
              ...pt,
              x: scaleValue('x', pt.x),
              y: scaleValue('y', pt.y),
              z: scaleValue('z', pt.z)
            };
          })
        }));
        lineDebug('Debug: line 3d equal length applied', {
          maxSpan,
          axisRanges: axisRanges3d,
          renderAxisRanges: renderAxisRanges3d,
          scaleFactors
        });
      }
      const allCorners = [
        { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.min },
        { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.min },
        { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.min },
        { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.min },
        { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.max },
        { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.min, z: renderAxisRanges3d.z.max },
        { x: renderAxisRanges3d.x.min, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.max },
        { x: renderAxisRanges3d.x.max, y: renderAxisRanges3d.y.max, z: renderAxisRanges3d.z.max }
      ];
      const rotatePoint = (pt) => plot3d.rotatePoint(pt, getLineViewState().rotation);
      const rotatedCorners = allCorners.map(corner => rotatePoint(corner));
      const rotatedPoints = [];
      renderSeries3d.forEach(seriesEntry => {
        seriesEntry.points.forEach(pt => {
          if(pt){
            rotatedPoints.push(rotatePoint(pt));
          }
        });
      });
      const projector = plot3d.createProjector({
        rotatedPoints,
        rotatedCorners,
        width: W3,
        height: H3,
        margin: margin3,
        shiftX: legendShiftX
      });

      const frontFrameLayer = global.document.createElementNS(NS, 'g');
      frontFrameLayer.setAttribute('data-layer', 'frame-front');
      svg3.appendChild(frontFrameLayer);

      const line3dFontStyles = exportFontStyles('line', { tabId: invocation.session?.tabId || null });
      const line3dTickFontSize = (() => {
        if(!chartStyle || typeof chartStyle.resolveScopedLabelMeasureFont !== 'function'){
          return fs;
        }
        const roles = ['xTick', 'yTick', 'zTick'];
        const sizes = roles.map(role => Number(chartStyle.resolveScopedLabelMeasureFont({
          styles: line3dFontStyles,
          role,
          fallbackPx: fs
        }).fontSizePx)).filter(size => Number.isFinite(size) && size > 0);
        return sizes.length ? Math.max(...sizes) : fs;
      })();
      const markLine3dAxisTickLabel = (node, axisKey) => {
        if(!node){ return; }
        const role = axisKey === 'z' ? 'zTick' : (axisKey === 'y' ? 'yTick' : 'xTick');
        markFontEditable(node, role, role);
      };

      plot3d.renderAxesAndGrid({
        svg: svg3,
        project: projector.project,
        rotatePoint,
        axisRanges: renderAxisRanges3d,
        axisTicks: axisTicks3d,
        axisLabels: { x: lineLabelsState.x, y: lineLabelsState.y, z: lineLabelsState.z },
        fontSize: fs,
        tickFontSize: line3dTickFontSize,
        axisStrokeWidth,
        axisColor: axisStroke,
        frameColor: axisStroke,
        tickTextColor: lineThemeTextColor,
        axisLabelColor: lineThemeTextColor,
        showPanes: showFrame,
        paneFill: lineThemeDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
        paneOpacityRange: lineThemeDark ? { min: 0.10, max: 0.22 } : { min: 0.01, max: 0.05 },
        gridColor: gridStrokeStyle3d.color,
        gridDash: gridDash3d || undefined,
        gridOpacity: gridOpacity3d,
        gridStrokeWidth: gridStrokeStyle3d.thickness,
        gridOutlineColors: { primary: gridStrokeStyle3d.color, secondary: gridStrokeStyle3d.color },
        chartStyle,
        showGrid,
        showFrame,
        axisTickFormatters: axisTickFormatters3d || undefined,
        frontFrameTarget: frontFrameLayer,
        debugLabel: 'line-3d',
        onAxisTickLabel: markLine3dAxisTickLabel,
        onAxisLabel: (node, axisKey) => {
          if(!node){
            return;
          }
          const role = axisKey === 'z' ? 'zTitle' : (axisKey === 'y' ? 'yTitle' : 'xTitle');
          const defaultLabel = axisKey === 'y' ? 'Y title' : (axisKey === 'z' ? 'Z' : 'X');
          const applyAxisLabel = (value) => {
            const trimmed = value != null ? String(value).trim() : '';
            const resolved = trimmed || defaultLabel;
            const current = axisKey === 'x'
              ? lineLabelsState.x
              : (axisKey === 'y' ? lineLabelsState.y : lineLabelsState.z);
            if(current === resolved){
              return resolved;
            }
            const patch = axisKey === 'x'
              ? { x: resolved }
              : (axisKey === 'y' ? { y: resolved } : { z: resolved });
            lineLabelsState = patchLineLabelsState(invocation.session, patch, { reason: 'line-3d-axis-label-edit' });
            syncLine3dAxisHeader(axisKey, resolved, { source: 'line-axis-inline' });
            if(node.textContent !== resolved){
              node.textContent = resolved;
            }
            scheduleActiveLineDraw();
            return resolved;
          };
          markFontEditable(node, role, role);
          makeEditableHelper(node, text => {
            const previous = axisKey === 'x'
              ? (lineLabelsState.x ?? '')
              : (axisKey === 'y' ? (lineLabelsState.y ?? '') : (lineLabelsState.z ?? ''));
            const nextValue = applyAxisLabel(text);
            if(previous === nextValue){
              return;
            }
            recordLineChange(`line:${axisKey}-label`, previous, nextValue, applyAxisLabel);
          });
        }
      });

      const seriesElems = new Array(seriesCount).fill(null);
      const renderQueue = renderSeries3d.map((renderSeries, idx) => {
        const sourceSeries = seriesWithData[idx] || renderSeries;
        const projectedPoints = renderSeries.points.map(pt => pt ? projector.project(rotatePoint(pt)) : null);
        const depths = projectedPoints.filter(Boolean).map(pt => pt.depth);
        const depthAvg = depths.length ? depths.reduce((sum, v)=>sum + v, 0) / depths.length : 0;
        return { series: sourceSeries, index: idx, projectedPoints, depthAvg };
      }).sort((a, b) => (a.depthAvg || 0) - (b.depthAvg || 0));

      const lineLayer = global.document.createElementNS(NS, 'g');
      svg3.appendChild(lineLayer);
      const markerLayer = global.document.createElementNS(NS, 'g');
      svg3.appendChild(markerLayer);

      for(let i = 0; i < renderQueue.length; i += 1){
        const entry = renderQueue[i];
        const s = entry.series;
        const color = colors[entry.index] || borderColor || DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length];
        const styleOverride = lineStylesState.series?.[s.name] || {};
        const seriesAlpha = styleOverride && styleOverride.markerAlpha != null
          ? clampLineAlpha(styleOverride.markerAlpha)
          : (styleOverride && styleOverride.alpha != null ? clampLineAlpha(styleOverride.alpha) : alpha);
        const seriesStrokeWidth = Number.isFinite(Number(styleOverride.lineStrokeWidth))
          ? Number(styleOverride.lineStrokeWidth)
          : (Number.isFinite(Number(styleOverride.strokeWidth)) ? Number(styleOverride.strokeWidth) : borderWidthPx);
        const seriesLineColor = (typeof styleOverride.lineStroke === 'string' && styleOverride.lineStroke)
          ? styleOverride.lineStroke
          : color;
        const seriesLineAlpha = styleOverride && styleOverride.lineAlpha != null
          ? clampLineAlpha(styleOverride.lineAlpha)
          : (styleOverride && styleOverride.alpha != null ? clampLineAlpha(styleOverride.alpha) : alpha);
        const seriesDotSize = Number.isFinite(Number(styleOverride.dotSize)) ? Number(styleOverride.dotSize) : dotSizePx;
        const seriesMarkerStrokeWidth = Number.isFinite(Number(styleOverride.markerStrokeWidth))
          ? Number(styleOverride.markerStrokeWidth)
          : (Number.isFinite(Number(styleOverride.strokeWidth)) ? Number(styleOverride.strokeWidth) : 0);
        const seriesMarkerStroke = (typeof styleOverride.markerStroke === 'string' && styleOverride.markerStroke)
          || (typeof styleOverride.stroke === 'string' && styleOverride.stroke)
          || (typeof styleOverride.borderColor === 'string' && styleOverride.borderColor)
          || borderColor
          || color;
        const seriesMarkerFill = (typeof styleOverride.markerFill === 'string' && styleOverride.markerFill)
          || (typeof styleOverride.fill === 'string' && styleOverride.fill)
          || lineLabelsState.colors?.[s.name]
          || color;
        let pathStr = '';
        let started = false;
        for(let p = 0; p < entry.projectedPoints.length; p += 1){
          if((p & 511) === 0 && !(await checkpoint())){
            return false;
          }
          const proj = entry.projectedPoints[p];
          if(proj && Number.isFinite(proj.x) && Number.isFinite(proj.y)){
            if(!started){
              pathStr += `M${proj.x} ${proj.y}`;
              started = true;
            }else{
              pathStr += `L${proj.x} ${proj.y}`;
            }
          }else{
            started = false;
          }
        }
        if(pathStr){
          const path = global.document.createElementNS(NS, 'path');
          path.setAttribute('d', pathStr);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', seriesLineColor);
          path.setAttribute('stroke-width', String(seriesStrokeWidth));
          path.setAttribute('stroke-opacity', String(Math.max(0, 1 - (seriesLineAlpha != null ? seriesLineAlpha : alpha))));
          path.dataset.series = s.name || '';
          path.dataset.lineStyleRole = 'line';
          path.dataset.viewMode = '3d';
          path.style.cursor = 'pointer';
          path.addEventListener('click', handleLinePathClick);
          lineLayer.appendChild(path);
          const mGroup = global.document.createElementNS(NS, 'g');
          mGroup.dataset.series = s.name || '';
          mGroup.dataset.lineStyleRole = 'markers';
          markerLayer.appendChild(mGroup);
          if(seriesDotSize > 0){
            const markerEntries = [];
            for(let p = 0; p < entry.projectedPoints.length; p += 1){
              if((p & 511) === 0 && !(await checkpoint())){
                return false;
              }
              const proj = entry.projectedPoints[p];
              const pt = s.points[p];
              if(!proj || !pt){
                continue;
              }
              markerEntries.push({ proj, pt });
            }
            markerEntries.sort((a, b) => (a.proj.depth || 0) - (b.proj.depth || 0));
            markerEntries.forEach(markerEntry => {
              const markerShape = s.shape || 'circle';
              const marker = createLineMarkerShape(global.document, markerShape, {
                index: s.seriesIndex,
                radius: seriesDotSize,
                cx: markerEntry.proj.x,
                cy: markerEntry.proj.y,
                fill: seriesMarkerFill,
                fillOpacity: 1 - (seriesAlpha != null ? seriesAlpha : alpha),
                stroke: seriesMarkerStroke,
                strokeWidth: Math.max(0, Number(seriesMarkerStrokeWidth) || 0),
                strokeOpacity: 1 - (seriesAlpha != null ? seriesAlpha : alpha)
              });
              if(marker){
                attachLineMarkerTooltip(marker, s, markerEntry.pt);
                mGroup.appendChild(marker);
              }
            });
          }
          seriesElems[s.seriesIndex] = { path, mGroup };
        }
      }
      if(!(await checkpoint())){
        return false;
      }

      svg3.appendChild(frontFrameLayer);

      const legendRenderer = legendLayout.renderer;
      if(showLegend && legendRenderer.entries.length){
        const defaultLegendY = margin3.top + legendRenderer.baselineOffset;
        const legendPos = lineLabelsState.positions?.legend;
        const legacyLegendOriginX = margin3.left + plotW3;
        const legendPosition = chartStyle.resolveLegendPosition(legendPos, {
          defaultX: baseW3 + appliedLegendAxisGap + legendGapFor3d,
          defaultY: defaultLegendY,
          reserveOriginX: baseW3 + appliedLegendAxisGap,
          reserveOriginY: margin3.top,
          reserveScaleX: legendGapFor3d,
          reserveScaleY: plotH3,
          legacyOriginX: legacyLegendOriginX,
          legacyOriginY: margin3.top,
          legacyScaleX: legendGapFor3d,
          legacyScaleY: plotH3
        });

        const legendGroup = legendRenderer.draw(svg3,{
          x: legendPosition.x,
          y: legendPosition.y,
          canonicalX: legendPosition.canonicalX,
          canonicalY: legendPosition.canonicalY
        });
        if(legendGroup){
          legendGroup.setAttribute('data-layer', 'line-3d-legend');
          plot3d.applyLegendPointerGuards(legendGroup, { label: 'line-legend-3d' });
          bindLineLegendInteractions(legendGroup, svg3, invocation.session, {
            mode: '3d',
            originX: legendPosition.originX,
            originY: legendPosition.originY,
            scaleX: legendPosition.scaleX,
            scaleY: legendPosition.scaleY
          });
          const textNodes = legendGroup.querySelectorAll('text');
          legendRenderer.entries.forEach((legendEntry, idx) => {
            const textNode = textNodes[idx];
            if(!textNode){
              return;
            }
            markFontEditable(textNode, 'legend', `legend-${idx}`);
          });
        }
      }

      const defaultTitleY = Math.max(margin3.top * 0.4, fs * 1.6);
      const defaultTitleX = margin3.left + plotW3 / 2;
      const titlePos = lineLabelsState.positions?.title;

      // Convert relative positions to absolute if needed for 3D title
      let absoluteTitleX = defaultTitleX;
      let absoluteTitleY = defaultTitleY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin3.left + titlePos.relX * plotW3;
          absoluteTitleY = margin3.top + titlePos.relY * plotH3;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use saved absolute positioning when no relative anchor is present
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }

      const title3d = global.document.createElementNS(NS, 'text');
      title3d.setAttribute('data-layer', 'line-3d-title');
      title3d.setAttribute('x', String(absoluteTitleX));
      title3d.setAttribute('y', String(absoluteTitleY));
      title3d.setAttribute('text-anchor', 'middle');
      title3d.setAttribute('font-size', String(fs));
      title3d.setAttribute('fill', lineThemeTextColor);
      title3d.textContent = lineLabelsState.title;
      svg3.appendChild(title3d);
      markFontEditable(title3d, 'graphTitle', 'graphTitle');
      plot3d.applyLegendPointerGuards(title3d, { label: 'line-title-3d' });
      bindLineInlineTextInteraction(title3d, invocation.session, 'title', { mode: '3d' });
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(title3d, svg3, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for 3D title
            const relX = (pos.x - margin3.left) / plotW3;
            const relY = (pos.y - margin3.top) / plotH3;
            const nextPositions = cloneLineRuntimeValue(getLineLabelsState(invocation.session).positions, {}) || {};
            nextPositions.title = {
              x: pos.x,
              y: pos.y,
              relX: relX,
              relY: relY
            };
            lineLabelsState = patchLineLabelsState(invocation.session, { positions: nextPositions }, { reason: 'line-3d-title-position' });
            if(Shared.isDebugEnabled?.()){
              console.debug('Debug: line 3d title position saved', { absolute: pos, relative: { relX, relY } });
            }
          }
        });
      }


      const line3dRotationSeries = renderSeries3d.map((renderSeries, index) => {
        const sourceSeries = seriesWithData[index] || renderSeries;
        const styleOverride = lineStylesState.series?.[sourceSeries.name] || {};
        const seriesAlpha = styleOverride.markerAlpha != null
          ? clampLineAlpha(styleOverride.markerAlpha)
          : (styleOverride.alpha != null ? clampLineAlpha(styleOverride.alpha) : alpha);
        const seriesLineAlpha = styleOverride.lineAlpha != null
          ? clampLineAlpha(styleOverride.lineAlpha)
          : (styleOverride.alpha != null ? clampLineAlpha(styleOverride.alpha) : alpha);
        const color = colors[index] || borderColor || DEFAULT_SCATTER_COLORS[index % DEFAULT_SCATTER_COLORS.length];
        return {
          name: sourceSeries.name,
          seriesIndex: Number.isInteger(sourceSeries.seriesIndex) ? sourceSeries.seriesIndex : index,
          shape: sourceSeries.shape || 'circle',
          points: renderSeries.points.map(point => point ? { x: point.x, y: point.y, z: point.z } : null),
          line: {
            stroke: styleOverride.lineStroke || color,
            strokeWidth: Number.isFinite(Number(styleOverride.lineStrokeWidth))
              ? Number(styleOverride.lineStrokeWidth)
              : (Number.isFinite(Number(styleOverride.strokeWidth)) ? Number(styleOverride.strokeWidth) : borderWidthPx),
            opacity: Math.max(0, 1 - seriesLineAlpha)
          },
          marker: {
            radius: Number.isFinite(Number(styleOverride.dotSize)) ? Number(styleOverride.dotSize) : dotSizePx,
            fill: styleOverride.markerFill || styleOverride.fill || lineLabelsState.colors?.[sourceSeries.name] || color,
            fillOpacity: Math.max(0, 1 - seriesAlpha),
            stroke: styleOverride.markerStroke || styleOverride.stroke || styleOverride.borderColor || borderColor || color,
            strokeWidth: Number.isFinite(Number(styleOverride.markerStrokeWidth))
              ? Number(styleOverride.markerStrokeWidth)
              : (Number.isFinite(Number(styleOverride.strokeWidth)) ? Number(styleOverride.strokeWidth) : 0),
            strokeOpacity: Math.max(0, 1 - seriesAlpha)
          }
        };
      });
      const formatLine3dAxisTick = (axisKey, value) => {
        const formatter = axisTickFormatters3d?.[axisKey];
        if(typeof formatter === 'function'){
          return String(formatter(value));
        }
        if(typeof chartStyle.formatAxisValue === 'function'){
          return String(chartStyle.formatAxisValue(value, { maxDecimals: 2 }));
        }
        return String(value);
      };
      const line3dRotationModel = normalizeLine3dRotationModel({
        version: LINE_3D_ROTATION_MODEL_VERSION,
        width: W3,
        height: H3,
        margin: margin3,
        legendShiftX,
        axisRanges: renderAxisRanges3d,
        axisTicks: axisTicks3d,
        axisTickLabels: {
          x: axisTicks3d.x.map(value => formatLine3dAxisTick('x', value)),
          y: axisTicks3d.y.map(value => formatLine3dAxisTick('y', value)),
          z: axisTicks3d.z.map(value => formatLine3dAxisTick('z', value))
        },
        axisLabels: { x: lineLabelsState.x, y: lineLabelsState.y, z: lineLabelsState.z },
        fontSize: fs,
        tickFontSize: line3dTickFontSize,
        axisStrokeWidth,
        axisColor: axisStroke,
        textColor: lineThemeTextColor,
        showGrid,
        showFrame,
        paneFill: lineThemeDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.03)',
        paneOpacityRange: lineThemeDark ? { min: 0.10, max: 0.22 } : { min: 0.01, max: 0.05 },
        grid: {
          color: gridStrokeStyle3d.color,
          dash: gridDash3d || null,
          opacity: gridOpacity3d,
          strokeWidth: gridStrokeStyle3d.thickness
        },
        series: line3dRotationSeries
      });
      if(line3dRotationModel){
        invocation.session.cache.line3dRotationModel = cloneLineRuntimeValue(line3dRotationModel, null) || line3dRotationModel;
        bindLine3dRotationRenderer(invocation.session, svg3, line3dRotationModel);
      }else{
        clearLine3dRotationRenderer(invocation.session, { clearModel: true });
      }

      registerLineGridControlTarget(svg3, { fallbackThickness: axisStrokeWidthBase });
      handleLineStatsUnavailable(null, 'Statistics are available in 2D view.');
      // 3D plots must scale uniformly: the content (projected cube, axis labels,
      // title, legend, and every glyph) is laid out in fixed viewBox coordinates and
      // must NEVER be non-uniformly stretched to fill a container of a different
      // aspect. Using preserveAspectRatio="xMidYMid meet" (instead of the 2D
      // "none"/fill-distort default) guarantees proportions are preserved on initial
      // render, rotation, and resize. Without it, a content bbox whose aspect differs
      // from the rendered box stretches the whole plot vertically/horizontally.
      ensureGraphViewport(svg3, { padding: Math.max(fs, 18), debugLabel: 'line-3d-graph', baseViewport: { width: W3, height: H3 }, preserveAspectRatio: 'xMidYMid meet', fitContent: false });
      if(!(await checkpoint()) || (invocation.session && !isLineSessionActive(invocation.session))){
        return false;
      }
      if(svgPublication){
        if(!svgPublication.commit()){
          return false;
        }
      }
      legendProjection.commit();
      getActiveLineLayoutManager()?.syncPanels?.({ skipSchedule: true });
      scheduleLineNoticeWidth('draw-3d');
      console.debug('Debug: drawLine3d complete', { debugStamp });
    }catch(err){
      console.error('drawLine3d error', err);
    }finally{
      svgPublication?.cleanup();
    }
  }

  async function drawLine(sessionOrOptions = {}, maybeOptions = {}){
    const invocation = resolveLineInvocationSession(sessionOrOptions, maybeOptions);
    const drawOpts = invocation.options || {};
    if(invocation.session && !isLineSessionActive(invocation.session)){
      markLineOwnerDrawPending(invocation.session, {
        ...(drawOpts || {}),
        reason: drawOpts.reason || 'line-draw-inactive'
      });
      return false;
    }
    bindLineInvocationSession(invocation.session, drawOpts.reason || 'line-draw', { syncControls: false });
    const execution = Shared.jobs?.createExecutionContext?.({
      component: 'line',
      tabId: invocation.session?.tabId || drawOpts.tabId || getLineProjectionTabId() || '',
      kind: 'graph',
      budgetMs: 10,
      drawOptions: drawOpts
    }) || null;
    const checkpoint = async () => {
      try{
        await execution?.checkpoint?.();
      }catch(err){
        if(execution?.signal?.aborted || execution?.isCurrent?.() === false){
          return false;
        }
        throw err;
      }
      return execution?.isCurrent?.() !== false;
    };
    let svgPublication = null;
    try{
      const debugStamp=Date.now();
      console.debug('Debug: drawLine start',{debugStamp}); // Debug: draw entry
      hideLineTooltip('redraw-start');
      const hot = getLineSessionHotManager(invocation.session) || getActiveLineHotManager();
      if(!hot || !refs.plot) return;
      const controls = getLineRuntimeControlsForSession(invocation.session, lineFallbackRuntimeControls);
      let lineLabelsState = getLineLabelsState(invocation.session);
      const lineThemeState = getLineThemeState(invocation.session);
      const lineStylesState = getLineStylesState(invocation.session);
      if(controls.viewMode === '3d' || controls.tableFormat === '3d'){
        Shared.cartesianLayout?.clearPublishedLayout?.(refs.svgBox, {
          tabId: execution?.tabId || invocation.session?.tabId || drawOpts?.tabId || null,
          component: 'line',
          generation: Number(execution?.owner?.sessionGeneration) || null
        });
        return await drawLine3d(invocation.session, drawOpts);
      }
      clearLine3dRotationRenderer(invocation.session, { clearModel: true });
      if(refs.plot){
        refs.plot.style.aspectRatio = '';
        refs.plot.style.padding = '';
      }
      const alpha=Number(controls.alpha)||0;
      const borderWidthRaw=Number(controls.borderWidth);
      const errorBarWidthInput=Number(controls.errorBarWidth);
      const errorBarWidthRaw=Number.isFinite(errorBarWidthInput)?errorBarWidthInput:borderWidthRaw;
      const borderColor=controls.border;
      const drawableFrame = resolveLineDrawableFrame(refs.plot);
      const fontInfo=chartStyle.resolveScaledFontSize({
        rawSize: controls.fontSize,
        width: drawableFrame.width,
        height: drawableFrame.height,
        svgBox: refs.svgBox,
        input: refs.fontSize
      });
      const fs=fontInfo.scaledPx;
      const styleScaleInfo=fontInfo.scaleInfo;
      const axisStrokeWidthBase = getLineAxisStrokeWidth(invocation.session);
      const axisStrokeWidth=chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'line-axis', min: 0, exact: true });
      const axisStroke = getLineAxisColor(invocation.session);
      const lineThemeTextColor = getLineThemeTextColor(invocation.session);
      const dotSizeRaw=Number(controls.dotSize)||LINE_DEFAULT_DOT_SIZE;
      const dotSizePx=chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'line-marker', min: 0 });
      const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'line-series', min: 0 });
      const errorBarWidthPx=chartStyle.scaleStrokeWidth(errorBarWidthRaw, styleScaleInfo, { context: 'line-errorbar', min: 0 });
      console.debug('Debug: line style scaling applied',{
        dotSizeRaw,
        dotSizePx,
        borderWidthRaw,
        borderWidthPx,
        errorBarWidthRaw,
        errorBarWidthPx,
        axisStrokeWidth,
        axisStrokeWidthBase,
        axisStroke,
        styleScale: styleScaleInfo?.styleScale
      }); // Debug: line style scaling summary
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize });
      console.debug('Debug: line font scaling applied',{
        input: controls.fontSize,
        fontSizePt: fontInfo.pt,
        baseFontPx: fontInfo.px,
        scaledFontPx: fs,
        scale: fontInfo.scaleInfo?.scale,
        containerWidth: drawableFrame.width,
        containerHeight: drawableFrame.height
      }); // Debug: line font scaling summary
      const axisMetrics=chartStyle.createAxisMetrics(fontInfo.px, styleScaleInfo);
      console.debug('Debug: line axis metrics',axisMetrics);
      const showGrid=!!controls.showGrid;
      const gridStyleBase = getLineGridStyle(axisStrokeWidthBase, invocation.session);
      const gridStrokeStyle = Object.assign({}, gridStyleBase, {
        thickness: chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, { context: 'line-grid', min: 0 })
      });
      const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function')
        ? gridControls.getStrokeAttributes(gridStrokeStyle, { fallbackColor: DEFAULT_GRID_COLOR, fallbackThickness: axisStrokeWidth })
        : { stroke: DEFAULT_GRID_COLOR, 'stroke-width': axisStrokeWidth };
      const showFrame=!!controls.showFrame;
      console.debug('Debug: line showFrame state',{showFrame});
      ensureLineResizerControls();
      const showLegend=controls.showLegend !== false;
      console.debug('Debug: line showLegend state',{showLegend});
      const logX=!!controls.logX;
      const logY=!!controls.logY;
      const displayModeCurrent = sanitizeLineDisplayMode(controls.displayMode || lineDisplayMode);
      if(displayModeCurrent !== lineDisplayMode){
        lineDisplayMode = displayModeCurrent;
      }
      const isAreaMode = displayModeCurrent === 'area';
      console.debug('Debug: line display mode',{ mode: displayModeCurrent });
      const storedManualIntervalX = getLineAxisTickInterval('x', invocation.session);
      const storedManualIntervalY = getLineAxisTickInterval('y', invocation.session);
      const manualIntervalX = !logX ? storedManualIntervalX : null;
      const manualIntervalY = !logY ? storedManualIntervalY : null;
      if(logX && storedManualIntervalX){
        console.debug('Debug: line manual interval suppressed',{ axis: 'x', reason: 'log-scale', stored: storedManualIntervalX });
      }
      if(logY && storedManualIntervalY){
        console.debug('Debug: line manual interval suppressed',{ axis: 'y', reason: 'log-scale', stored: storedManualIntervalY });
      }
      let showTrendLine = !!controls.showTrendLine;
      let showPlotStats = !!controls.showPlotStats;
      let showConfidenceIntervals = !!controls.showIntervals;
      let showPredictionIntervals = !!controls.showPredictionIntervals;
      let showIntervals = showConfidenceIntervals || showPredictionIntervals;
      const showDiagnostics=isLineDiagnosticsEnabled();
      const regressionModeCurrent = controls.regressionMode || 'linear';
      // Regression confidence/prediction intervals are 95%; do not couple them to inferential α.
      const regressionAlpha = 0.05;
      const forecastOptions = resolveForecastOptions({ session: invocation.session, reason: 'line-draw-forecast-options' });
      console.debug('Debug: line regression configuration',{ showTrendLine, showIntervals, showConfidenceIntervals, showPredictionIntervals, showDiagnostics, regressionMode: regressionModeCurrent, forecastOptions });
      const xMinManual=parseFloat(controls.xMin);
      const xMaxManual=parseFloat(controls.xMax);
      const yMinManual=parseFloat(controls.yMin);
      const yMaxManual=parseFloat(controls.yMax);
      const originMode=controls.originMode;
      const originXInput=parseFloat(controls.originX);
      const originYInput=parseFloat(controls.originY);
      const data = typeof hot?.getIncludedDataMatrix === 'function'
        ? hot.getIncludedDataMatrix()
        : (Shared.hot?.getIncludedDataMatrix ? Shared.hot.getIncludedDataMatrix(hot) : []);
      const regressionCache=new Map();
      const statsContext={ showIntervals, showConfidenceIntervals, showPredictionIntervals, showDiagnostics, alpha: regressionAlpha, regressionCache, forecast: forecastOptions };
      if(!Array.isArray(data) || !data.length){
        resetLineRenderState('no-data-matrix',{
          message: Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : 'Add data to the input table to generate a plot.',
        });
        handleLineStatsUnavailable(statsContext, lineStatsEmptyPlaceholder);
        return;
      }
      const lineSeriesAccumulator = createLine2dSeriesAccumulator(data, {
        replicates: lineReplicates,
        logX,
        logY,
        logPlusOneX: lineLogPlusOneX,
        logPlusOneY: lineLogPlusOneY
      });
      for(let rowIndex = 1; rowIndex < data.length; rowIndex += 1){
        if((rowIndex & 1023) === 0 && !(await checkpoint())){
          return false;
        }
        appendLine2dSeriesAccumulatorRow(lineSeriesAccumulator, rowIndex);
      }
      const initialSeriesModel = finalizeLine2dSeriesAccumulator(lineSeriesAccumulator);
      const header = initialSeriesModel.header || (Array.isArray(data[0]) ? data[0] : []);
      const xIndex = Number.isInteger(initialSeriesModel.xIndex) ? initialSeriesModel.xIndex : 0;
      if(!String(lineLabelsState.x || '').trim() || lineLabelsState.x === 'X'){
        lineLabelsState = patchLineLabelsState(invocation.session, {
          x: (header[xIndex] && String(header[xIndex]).trim()) || 'X'
        }, { reason: 'line-2d-x-label-sync' });
      }
      const replicates = initialSeriesModel.replicates || Math.max(LINE_MIN_REPLICATES, lineReplicates);
      const totalSeries = initialSeriesModel.totalSeries || 0;
      const headerSeriesLabels = initialSeriesModel.labels || resolveLine2dSeriesLabelsFromHeader(header, totalSeries, { replicates });
      syncLineSeriesLabelState(headerSeriesLabels, { reason: 'line-draw', session: invocation.session });
      ensureLineGroupShapeCapacity(totalSeries, invocation.session);
      if(!initialSeriesModel.ok){
        if(initialSeriesModel.reason === 'no-valid-series'){
          resetLineRenderState('no-valid-series',{
            message: Shared.getEmptyPlotNoticeMessage ? Shared.getEmptyPlotNoticeMessage() : 'Add data to the input table to generate a plot.',
          });
          handleLineStatsUnavailable(statsContext, 'Not enough data for statistics.');
          return;
        }
        if(initialSeriesModel.reason === 'log-x-nonpositive'){
          resetLineRenderState('log-x-nonpositive',{ message: 'Log scale requires positive X values.' });
          handleLineStatsUnavailable(statsContext, 'Log scale requires positive X values before statistics can be calculated.');
          return;
        }
        if(initialSeriesModel.reason === 'log-y-nonpositive'){
          resetLineRenderState('log-y-nonpositive',{ message: 'Log scale requires positive Y values.' });
          handleLineStatsUnavailable(statsContext, 'Log scale requires positive Y values before statistics can be calculated.');
          return;
        }
      }
      const series = initialSeriesModel.series;
      series.forEach((entry, index) => {
        entry.shape = getLineGroupShape(index, invocation.session);
      });
      let seriesWithData = initialSeriesModel.seriesWithData;
      if(seriesWithData.length !== series.length){
        console.debug('Debug: line empty series filtered',{ totalSeries: initialSeriesModel.series.length, renderedSeries: seriesWithData.length });
      }
      let xMinRaw = initialSeriesModel.xMinRaw;
      let xMaxRaw = initialSeriesModel.xMaxRaw;
      let yMinRaw = initialSeriesModel.yMinRaw;
      let yMaxRaw = initialSeriesModel.yMaxRaw;
      if(logX && lineLogPlusOneX){
        console.debug('Debug: line log+1 transform applied to X');
      }
      if(logY && lineLogPlusOneY){
        console.debug('Debug: line log+1 transform applied to Y');
      }
      const filterPointByRange = (pt, range) => {
        if(!pt){ return null; }
        if(pt.x < range.xMin || pt.x > range.xMax || pt.y < range.yMin || pt.y > range.yMax){
          return null;
        }
        return pt;
      };
      const clipSeriesToRange = (inputSeries, range) => {
        const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
        const clipped = [];
        inputSeries.forEach(s => {
          const originalCount = s.points.filter(Boolean).length;
          const clippedPoints = s.points.map(pt => filterPointByRange(pt, range));
          const visibleCount = clippedPoints.filter(Boolean).length;
          if(originalCount !== visibleCount){
            console.debug('Debug: line filtered points outside axis',{ series: s.name, removed: originalCount - visibleCount, range });
          }
          if(visibleCount > 0){
            clipped.push({ ...s, points: clippedPoints });
          }else if(debugEnabled){
            console.debug('Debug: line dropped series after range clipping',{ series: s.name, range });
          }
        });
        return clipped;
      };
        const labelsUsed=seriesWithData.map(s=>s.name);
      const lineStatsPayloadForDraw = {
        series: seriesWithData,
        statsOptions: statsContext,
        controls: {
          method: refs.statType?.value || 'pearson',
          regressionMode: regressionModeCurrent
        }
      };
      primeLineStatsContext(lineStatsPayloadForDraw);
      const regressionStatsCurrent = isLineStatsCurrentForPayload(lineStatsPayloadForDraw);
      updateLineRegressionOverlayControlState(regressionStatsCurrent);
      if(!regressionStatsCurrent && (showTrendLine || showIntervals || showPlotStats)){
        console.debug('Debug: line regression overlays disabled until stats are calculated', {
          showTrendLine,
          showConfidenceIntervals,
          showPredictionIntervals
        });
        showTrendLine = false;
        showPlotStats = false;
        showConfidenceIntervals = false;
        showPredictionIntervals = false;
        showIntervals = false;
      }
      const shouldPrepareVisualRegression = regressionStatsCurrent;
      if(typeof regressionTools.fitRegression==='function' && shouldPrepareVisualRegression){
        seriesWithData.forEach(s=>{
          const pts=s.points.filter(Boolean);
          if(pts.length>=3){
            try{
              const regressionModel=regressionCache.get(s.name) || regressionTools.fitRegression(pts,{ mode: regressionModeCurrent, alpha: regressionAlpha, forecast: forecastOptions });
              if(regressionModel){
                regressionCache.set(s.name, regressionModel);
                s.regression=regressionModel;
                console.debug('Debug: line regression prepared',{
                  series: s.name,
                  mode: regressionModeCurrent,
                  hasIntervals: !!regressionModel.intervals,
                  source: 'stats-current'
                });
              }
            }catch(err){
              console.error('line regression fit error', err);
              s.regression=null;
            }
          }else{
            s.regression=null;
          }
        });
      }else{
        seriesWithData.forEach(s=>{ s.regression = null; });
        if(showTrendLine || showIntervals){
          console.debug('Debug: line regression overlays skipped', {
            reason: typeof regressionTools.fitRegression === 'function' ? 'insufficient-request' : 'missing-regression-tools',
            regressionStatsCurrent,
            showTrendLine,
            showIntervals
          });
        }
      }
      ensureLineLabelColors(labelsUsed, invocation.session);
      lineLabelsState = patchLineLabelsState(invocation.session, { colors: lineLabelColors }, { reason: 'line-2d-label-colors-sync' });
      const colors=seriesWithData.map((s,i)=>lineLabelsState.colors?.[s.name]||borderColor||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]);
      if(!(await checkpoint())){
        return false;
      }
      const seriesShapes = seriesWithData.map((s,i)=>{
        const baseIndex = series.indexOf(s);
        const fallbackIndex = baseIndex >= 0 ? baseIndex : i;
        const resolvedShape = sanitizeLineGroupShape(s.shape, fallbackIndex);
        s.shape = resolvedShape;
        return resolvedShape;
      });
      const legendEntries=seriesWithData.map((s,i)=>createLineLegendEntry(s,i,{
        color:colors[i],
        shape:seriesShapes[i],
        seriesIndex:series.indexOf(s),
        styles:lineStylesState,
        alpha,
        lineStrokeWidth:borderWidthPx,
        markerSize:dotSizePx,
        markerStroke:borderColor
      }));
      const legendLayout=chartStyle.computeLegendLayout({
        entries:showLegend ? legendEntries : [],
        fontSize:fs,
        viewportHeight: drawableFrame.height,
        scaleInfo: styleScaleInfo,
        strokeWidth:borderWidthPx,
        onSwatchClick:({ entry, swatch, event, index })=>{
          const legendKey=entry?.key || entry?.label;
          if(!legendKey || !swatch){ return; }
          if(event){ event.stopPropagation(); }
          const currentColor=lineLabelsState.colors?.[legendKey]||entry.fill;
          const seriesIndex=Number.isInteger(entry.seriesIndex) && entry.seriesIndex >= 0
            ? entry.seriesIndex
            : (Number.isInteger(index) ? index : -1);
          const initialShape=Number.isInteger(seriesIndex) && seriesIndex >= 0
            ? getLineGroupShape(seriesIndex, invocation.session)
            : null;
          const applyLegendColor=value=>{
            const nextValue=value!=null?String(value):'';
            const currentLabels = getLineLabelsState(invocation.session);
            const nextColors = cloneLineRuntimeValue(currentLabels.colors, {}) || {};
            const previousValue=nextColors[legendKey] || '';
            if(nextValue){
              if(previousValue===nextValue){
                return true;
              }
              nextColors[legendKey]=nextValue;
            }else if(previousValue){
              delete nextColors[legendKey];
            }else{
              return true;
            }
            lineLabelsState = patchLineLabelsState(invocation.session, { colors: nextColors }, { reason: 'line-2d-legend-color' });
            scheduleActiveLineDraw();
            return true;
          };
          const applyLegendShape=value=>{
            if(!Number.isInteger(seriesIndex) || seriesIndex < 0){
              return true;
            }
            const sanitized = sanitizeLineGroupShape(value, seriesIndex);
            const shapes = ensureLineGroupShapeCapacity(Math.max(series.length, seriesIndex + 1), invocation.session);
            if(shapes[seriesIndex] === sanitized){
              return true;
            }
            shapes[seriesIndex] = sanitized;
            patchLineGroupedState(invocation.session, { shapes }, { reason: 'line-2d-legend-shape' });
            if(Array.isArray(series) && series[seriesIndex]){
              series[seriesIndex].shape = sanitized;
            }
            updateLineGroupShapeSelect(seriesIndex, sanitized);
            scheduleActiveLineDraw();
            return true;
          };
          let previousColor = currentColor;
          let previousShape = Number.isInteger(seriesIndex) && seriesIndex >= 0
            ? sanitizeLineGroupShape(initialShape, seriesIndex)
            : null;
          Shared.openColorPicker({
            anchor: swatch,
            color: currentColor,
            shapePicker: Number.isInteger(seriesIndex) && seriesIndex >= 0 ? {
              value: previousShape,
              options: LINE_GROUP_SHAPE_OPTIONS,
              onChange(nextShape){
                const sanitized = sanitizeLineGroupShape(nextShape, seriesIndex);
                if(sanitized===previousShape){
                  return;
                }
                applyLegendShape(sanitized);
                recordLineChange(`line:legend-shape:${legendKey}`,previousShape,sanitized,applyLegendShape);
                previousShape=sanitized;
                console.debug('Debug: line legend shape change',{ index: seriesIndex, shape: sanitized, label: legendKey });
              }
            } : null,
            onInput(value){
              applyLegendColor(value);
              console.debug('Debug: line legend color input',{label:legendKey,color:value});
            },
            onChange(value){
              const nextValue=value!=null?String(value):'';
              if(nextValue===previousColor){
                return;
              }
              applyLegendColor(nextValue);
              recordLineChange(`line:legend-color:${legendKey}`,previousColor,nextValue,applyLegendColor);
              previousColor=nextValue;
            }
          });
        }
      });
      lineLegendWidth=legendLayout.legendWidthForMargin;
      lineLegendItems=showLegend ? legendEntries.map(item=>({label:item.label,color:item.fill})) : [];
      lineLegendLayoutInfo={
        entryCount: legendLayout.renderer.entries.length,
        rendererWidth: legendLayout.renderer.width,
        legendWidthForMargin: legendLayout.legendWidthForMargin,
        legendGapPx: legendLayout.legendGapPx,
        minSvgWidth: legendLayout.minSvgWidth,
        basePlotWidth: legendLayout.basePlotWidth,
        guardPaddingPx: legendLayout.guardPaddingPx,
        swatchSize: legendLayout.renderer.swatchSize,
        swatchGap: legendLayout.renderer.swatchGap,
        rowGap: legendLayout.renderer.rowGap,
        rowHeight: legendLayout.renderer.rowHeight,
        fontSize: legendLayout.renderer.fontSize,
        minWidth: legendLayout.renderer.minWidth,
        maxLabelWidth: legendLayout.renderer.maxLabelWidth,
        entries: legendLayout.renderer.entries.map(entry=>({ label: entry.label, key: entry.key, labelWidth: entry.labelWidth }))
      };
      console.debug('Debug: line legend layout metrics',{ legendWidth: lineLegendWidth, legendGap: legendLayout.legendGapPx, entryCount: legendLayout.renderer.entries.length });
      const legendWidth=lineLegendWidth;
      let xMin=xMinRaw,xMax=xMaxRaw,yMin=yMinRaw,yMax=yMaxRaw;
      if(isFinite(xMinManual)) xMin=xMinManual;
      if(isFinite(xMaxManual)) xMax=xMaxManual;
      if(isFinite(yMinManual)) yMin=yMinManual;
      if(isFinite(yMaxManual)) yMax=yMaxManual;
      const useZeroOrigin = originMode === 'zero';
      if(originMode==='custom'){
        if(isFinite(originXInput) && !(logX && originXInput<=0)){
          if(originXInput<xMin) xMin=originXInput;
          if(originXInput>xMax) xMax=originXInput;
        }
        if(isFinite(originYInput) && !(logY && originYInput<=0)){
          if(originYInput<yMin) yMin=originYInput;
          if(originYInput>yMax) yMax=originYInput;
        }
      }else if(useZeroOrigin){
        if(!logX){
          if(!isFinite(xMinManual)) xMin=Math.min(xMin,0);
          if(!isFinite(xMaxManual)) xMax=Math.max(xMax,0);
        }
        if(!logY){
          if(!isFinite(yMinManual)) yMin=Math.min(yMin,0);
          if(!isFinite(yMaxManual)) yMax=Math.max(yMax,0);
        }
        lineDebug('Debug: line range adjusted for zero origin',{xMin,xMax,yMin,yMax,logX,logY});
      }
      const rangeForClipping = { xMin, xMax, yMin, yMax };
      seriesWithData = clipSeriesToRange(seriesWithData, rangeForClipping);
      if(!seriesWithData.length){
        resetLineRenderState('no-valid-series-after-clipping', {
          message: 'Adjust the axis range to include at least two valid points.'
        });
        handleLineStatsUnavailable(statsContext, 'Adjust the axis range to enable statistics.');
        console.debug('Debug: line plot aborted due to clipping',{ range: rangeForClipping });
        return;
      }
      const pointsInRange = [];
      seriesWithData.forEach(seriesEntry => {
        seriesEntry.points.forEach(pt => {
          if(pt){
            pointsInRange.push(pt);
          }
        });
      });
      const axisVarianceInfo = getLineViewState().axesVarianceScaled
        ? resolveLineAxisVariance(pointsInRange)
        : null;
      let areaBaselineValue = null;
      let areaBaselineTransformed = null;
      const areaFillOpacity = isAreaMode ? Math.max(0, Math.min(1, (1 - alpha) * 0.35)) : 0;
        if(xMin===xMax) xMax=xMin+1;
        if(yMin===yMax) yMax=yMin+1;
        if(regressionCache.size){
          seriesWithData.forEach(s=>{
            if(s.regression){
              s.regression.domain = { minX: xMin, maxX: xMax };
            }
          });
        }
      const plotEl=refs.plot;
      plotEl.style.display='block';
      const baseWidth=Math.max(50,Math.floor(drawableFrame.width||50));
      const H=Math.max(40,Math.floor(drawableFrame.height||40));
      const W=baseWidth;
      plotEl.style.position='relative';
      const svg=document.createElementNS(NS,'svg');
      svg.setAttribute('width',String(W));
      svg.setAttribute('height',String(H));
      svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
      svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
      line.__resizeLiveRevision = (Number(line.__resizeLiveRevision) || 0) + 1;
      svg.dataset.resizeLiveRevision = String(line.__resizeLiveRevision);
      chartStyle.prepareSvg(svg, { scopeId: 'line' });
      stampLineParameterObservables(svg, invocation.session);
      const lineResolvedTheme2d = Shared.colorSchemes?.resolveThemeState?.('line', { config: { colorScheme: lineThemeState.colorScheme } }) || null;
      const lineThemeDark = lineResolvedTheme2d
        ? lineResolvedTheme2d.isDark === true
        : String(lineThemeState.colorScheme || '').toLowerCase() === 'dark';
      svg.setAttribute('data-color-scheme', lineThemeState.colorScheme || 'scientific');
      if(lineThemeDark){
        const darkBg = normalizeLineThemeColor(lineThemeState.backgroundColor, '#000000');
        svg.style.backgroundColor = darkBg;
        svg.setAttribute('data-color-scheme-bg-color', darkBg);
      }else{
        svg.style.backgroundColor = '';
        svg.removeAttribute('data-color-scheme-bg-color');
      }
      svgPublication = Shared.framePublication.stage({
        container: plotEl,
        frame: svg,
        publishedId: 'lineSvg',
        component: 'line',
        tabId: execution?.tabId || invocation.session?.tabId || drawOpts?.tabId || null,
        canCommit: () => execution?.isCurrent?.() !== false
          && (!invocation.session || isLineSessionActive(invocation.session))
      });
      svg.addEventListener('mouseleave', handleLinePlotMouseLeave);
      let xMinT=logX?Math.log10(xMin):xMin;
      let xMaxT=logX?Math.log10(xMax):xMax;
      let yMinT=logY?Math.log10(yMin):yMin;
      let yMaxT=logY?Math.log10(yMax):yMax;
      const axisTickTools = chartStyle.axisTicks || null;
      const buildAxisScale = opts => {
        if(axisTickTools && typeof axisTickTools.buildScale === 'function'){
          return axisTickTools.buildScale(opts);
        }
        const min = Number.isFinite(opts?.manualMin) ? opts.manualMin : Number(opts?.dataMin) || 0;
        const max = Number.isFinite(opts?.manualMax) ? opts.manualMax : Number(opts?.dataMax) || min + 1;
        return { min, max, ticks: [min, max], step: Math.max((max - min) || 1, 1) };
      };
          const applyLogTickOverride = (axisKey, scale, manualMin, manualMax, fallbackMin, fallbackMax, enabled) => {
            if(!enabled || !scale || !axisTickTools?.applyLogTicks){
              return;
            }
            const applied = axisTickTools.applyLogTicks(scale, {
              manualMin: Number.isFinite(manualMin) ? manualMin : null,
              manualMax: Number.isFinite(manualMax) ? manualMax : null,
              fallbackMin,
              fallbackMax
            });
            if(applied && Shared.isDebugEnabled?.()){
              console.debug('Debug: line log tick override',{ axis: axisKey, tickCount: scale.ticks.length });
            }
          };
      let xTickTarget=chartStyle.estimateTickCount(baseWidth,{axis:'x',fallback:6});
      let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
      console.debug('Debug: line initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
      const lineNotationX = getLineAxisNotation('x', invocation.session);
      const lineNotationY = getLineAxisNotation('y', invocation.session);
      const formatTickX = v => chartStyle.formatAxisValue(v,{ notation: lineNotationX, maxDecimals: 2 });
      const formatTickY = v => chartStyle.formatAxisValue(v,{ notation: lineNotationY, maxDecimals: 2 });
      const lineFontStyles = exportFontStyles('line', { tabId: invocation.session?.tabId || null });
      const xTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: lineFontStyles, role: 'xTick', fallbackPx: fs }).fontSpec
        : chartStyle.makeFont(fs);
      const yTickMeasureFont = (chartStyle && typeof chartStyle.resolveScopedLabelMeasureFont === 'function')
        ? chartStyle.resolveScopedLabelMeasureFont({ styles: lineFontStyles, role: 'yTick', fallbackPx: fs }).fontSpec
        : chartStyle.makeFont(fs);
      const tickFont=yTickMeasureFont;
      const hasYTitle = String(lineLabelsState.y == null ? '' : lineLabelsState.y).trim().length > 0;
      const tickLen=axisMetrics.tickLength;
      const xMajorTickLength = getLineAxisMajorTickLength('x') ?? tickLen;
      const yMajorTickLength = getLineAxisMajorTickLength('y') ?? tickLen;
      const tickGap=axisMetrics.tickLabelGap;
      let cartesianMarginRequirements=chartStyle.computeCartesianMarginRequirements({
        fontSize:fs,
        maxYLabelWidth:0,
        hasYTitle,
        axisMetrics,
        xTickLabels:[],
        xTickMeasureFont
      });
      let margin={ ...cartesianMarginRequirements.baselineMargins };
      margin.left=Math.max(margin.left,fs*0.5);
      let plotW=Math.max(20,W-margin.left-margin.right);
      let plotH=Math.max(20,H-margin.top-margin.bottom);
      let bottomLayout=chartStyle.computeBottomLayout({
        labels:[],
        fontSize:fs,
        labelMeasureFont:xTickMeasureFont,
        plotWidth:plotW,
        baseBottom:margin.bottom,
        axisMetrics,
        preservePlotRail:true,
        manualLabelRotationAngleDeg:getLineXAxisTickLabelAngle(invocation.session)
      });
      let requiredMargins={
        ...cartesianMarginRequirements.requiredMargins,
        left: Math.max(cartesianMarginRequirements.requiredMargins.left, margin.left),
        bottom: Math.max(cartesianMarginRequirements.requiredMargins.bottom, bottomLayout.requiredBottom || margin.bottom)
      };
      let manualXMinValue = Number.isFinite(xMinManual) && (!logX || xMinManual > 0) ? (logX ? Math.log10(xMinManual) : xMinManual) : null;
      let manualXMaxValue = Number.isFinite(xMaxManual) && (!logX || xMaxManual > 0) ? (logX ? Math.log10(xMaxManual) : xMaxManual) : null;
      let manualYMinValue = Number.isFinite(yMinManual) && (!logY || yMinManual > 0) ? (logY ? Math.log10(yMinManual) : yMinManual) : null;
      let manualYMaxValue = Number.isFinite(yMaxManual) && (!logY || yMaxManual > 0) ? (logY ? Math.log10(yMaxManual) : yMaxManual) : null;
      const shouldEqualScale = !!getLineViewState().equalScaleAxes;
      const shouldEqualAxes = !!getLineViewState().equalAxes;
      if(shouldEqualScale){
        const spanX = Number.isFinite(xMaxT) && Number.isFinite(xMinT) ? (xMaxT - xMinT) : NaN;
        const spanY = Number.isFinite(yMaxT) && Number.isFinite(yMinT) ? (yMaxT - yMinT) : NaN;
        if(Number.isFinite(spanX) && Number.isFinite(spanY) && spanX > 0 && spanY > 0){
          const maxSpan = Math.max(spanX, spanY);
          const centerX = (xMaxT + xMinT) / 2;
          const centerY = (yMaxT + yMinT) / 2;
          xMinT = centerX - maxSpan / 2;
          xMaxT = centerX + maxSpan / 2;
          yMinT = centerY - maxSpan / 2;
          yMaxT = centerY + maxSpan / 2;
          manualXMinValue = null;
          manualXMaxValue = null;
          manualYMinValue = null;
          manualYMaxValue = null;
          lineDebug('Debug: line equal scale ranges applied',{ spanX, spanY, maxSpan, xMinT, xMaxT, yMinT, yMaxT });
        }else{
          lineDebug('Debug: line equal scale ranges skipped',{ spanX, spanY });
        }
      }
      let xScale=buildAxisScale({ dataMin: xMinT, dataMax: xMaxT, manualMin: manualXMinValue, manualMax: manualXMaxValue, targetTickCount: xTickTarget });
      let yScale=buildAxisScale({ dataMin: yMinT, dataMax: yMaxT, manualMin: manualYMinValue, manualMax: manualYMaxValue, targetTickCount: yTickTarget });
      applyLogTickOverride('x', xScale, manualXMinValue, manualXMaxValue, xMinT, xMaxT, logX);
      applyLogTickOverride('y', yScale, manualYMinValue, manualYMaxValue, yMinT, yMaxT, logY);
      let xTickLabels=xScale.ticks.map(t=>formatTickX(logX?Math.pow(10,t):t));
      let yTickLabels=yScale.ticks.map(t=>formatTickY(logY?Math.pow(10,t):t));
      let maxYLabelWidth=0;
      let maxXLabelWidth=0;
      for(let pass=0;pass<2;pass++){
        xScale=buildAxisScale({ dataMin: xMinT, dataMax: xMaxT, manualMin: manualXMinValue, manualMax: manualXMaxValue, targetTickCount: xTickTarget });
        yScale=buildAxisScale({ dataMin: yMinT, dataMax: yMaxT, manualMin: manualYMinValue, manualMax: manualYMaxValue, targetTickCount: yTickTarget });
        if(!shouldEqualScale && isFinite(xMinManual)) xScale.min=xMinT;
        if(!shouldEqualScale && isFinite(xMaxManual)) xScale.max=xMaxT;
        if(!shouldEqualScale && isFinite(yMinManual)) yScale.min=yMinT;
        if(!shouldEqualScale && isFinite(yMaxManual)) yScale.max=yMaxT;
        if(!shouldEqualScale && (isFinite(xMinManual)||isFinite(xMaxManual))){
          const manualXTicks=[];
          for(let v=Math.ceil(xScale.min/xScale.step)*xScale.step; v<=xScale.max+1e-9; v+=xScale.step){
            manualXTicks.push(v);
          }
          xScale.ticks=manualXTicks;
        }
        if(Number.isFinite(manualIntervalX) && manualIntervalX > 0){
          const manual = buildLineManualTicks(
            Number.isFinite(xScale.min) ? xScale.min : xMinT,
            Number.isFinite(xScale.max) ? xScale.max : xMaxT,
            manualIntervalX
          );
          if(manual){
            xScale.min = manual.min;
            xScale.max = manual.max;
            xScale.ticks = manual.ticks;
            xScale.step = manualIntervalX;
            console.debug('Debug: line manual interval applied',{ axis: 'x', interval: manualIntervalX, tickCount: manual.ticks.length });
          }
        }
        if(!shouldEqualScale && (isFinite(yMinManual)||isFinite(yMaxManual))){
          const manualYTicks=[];
          for(let v=Math.ceil(yScale.min/yScale.step)*yScale.step; v<=yScale.max+1e-9; v+=yScale.step){
            manualYTicks.push(v);
          }
          yScale.ticks=manualYTicks;
        }
        if(Number.isFinite(manualIntervalY) && manualIntervalY > 0){
          const manualY = buildLineManualTicks(
            Number.isFinite(yScale.min) ? yScale.min : yMinT,
            Number.isFinite(yScale.max) ? yScale.max : yMaxT,
            manualIntervalY
          );
          if(manualY){
            yScale.min = manualY.min;
            yScale.max = manualY.max;
            yScale.ticks = manualY.ticks;
            yScale.step = manualIntervalY;
            console.debug('Debug: line manual interval applied',{ axis: 'y', interval: manualIntervalY, tickCount: manualY.ticks.length });
          }
        }
        applyLogTickOverride('x', xScale, manualXMinValue, manualXMaxValue, xMinT, xMaxT, logX);
        applyLogTickOverride('y', yScale, manualYMinValue, manualYMaxValue, yMinT, yMaxT, logY);
        xTickLabels=xScale.ticks.map(t=>formatTickX(logX?Math.pow(10,t):t));
        yTickLabels=yScale.ticks.map(t=>formatTickY(logY?Math.pow(10,t):t));
        const yLabelWidths=yTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
        maxYLabelWidth=Math.max(...yLabelWidths,0);
        const xLabelWidths=xTickLabels.map(lbl=>chartStyle.measureText(lbl,xTickMeasureFont));
        maxXLabelWidth=Math.max(...xLabelWidths,0);
        cartesianMarginRequirements=chartStyle.computeCartesianMarginRequirements({
          fontSize:fs,
          maxYLabelWidth,
          hasYTitle,
          axisMetrics,
          xTickLabels,
          xTickMeasureFont
        });
        margin={ ...cartesianMarginRequirements.baselineMargins };
        margin.left=Math.max(margin.left,fs*0.5);
        plotW=Math.max(20,W-margin.left-margin.right);
        plotH=Math.max(20,H-margin.top-margin.bottom);
        bottomLayout=chartStyle.computeBottomLayout({
          labels:xTickLabels,
          fontSize:fs,
          labelMeasureFont:xTickMeasureFont,
          plotWidth:plotW,
          baseBottom:margin.bottom,
          axisMetrics,
          preservePlotRail:true,
          manualLabelRotationAngleDeg:getLineXAxisTickLabelAngle(invocation.session)
        });
        requiredMargins={
          ...cartesianMarginRequirements.requiredMargins,
          left: Math.max(cartesianMarginRequirements.requiredMargins.left, maxYLabelWidth+yMajorTickLength+tickGap+fs*0.5),
          bottom: Math.max(cartesianMarginRequirements.requiredMargins.bottom, bottomLayout.requiredBottom || margin.bottom)
        };
        const refinedX=chartStyle.estimateTickCount(plotW,{axis:'x',fallback:xTickTarget});
        const refinedY=chartStyle.estimateTickCount(plotH,{axis:'y',fallback:yTickTarget});
        console.debug('Debug: line tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth});
        if(refinedX===xTickTarget && refinedY===yTickTarget){
          break;
        }
        xTickTarget=refinedX;
        yTickTarget=refinedY;
      }
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      console.debug('Debug: line layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth});

      const aspectData = (lineSvgBoxRef || refs.svgBox)?.dataset;
      const shouldLockAspect = aspectData?.resizerAspectLocked === 'true';
      const cartesianTransaction = shouldLockAspect
        ? (lineSvgBoxRef || refs.svgBox)?.__sharedResizableBoxApi?.getCartesianLayoutTransaction?.({
            resizePhase: drawOpts?.resizePhase
          })
        : null;
      const lockedCartesianGeometry = shouldLockAspect
        ? Shared.cartesianLayout?.resolveLockedRenderGeometry?.({
            userFrame: { width: W, height: H },
            transaction: cartesianTransaction
          })
        : null;
      if(lockedCartesianGeometry?.valid === true){
        margin = { ...lockedCartesianGeometry.margins };
        plotW = lockedCartesianGeometry.plotRect.width;
        plotH = lockedCartesianGeometry.plotRect.height;
      }
      let plotConstraint = null;
      if(getLineViewState().axesVarianceScaled){
        const weightX = axisVarianceInfo?.weights?.x;
        const weightY = axisVarianceInfo?.weights?.y;
        if(Number.isFinite(weightX) && weightX > 0 && Number.isFinite(weightY) && weightY > 0){
          plotConstraint = { type: 'ratio', ratio: weightX / weightY, fit: 'height-extend', anchor: 'left' };
        }
      }
      if(!plotConstraint && (shouldEqualAxes || shouldEqualScale)){
        plotConstraint = { type: 'ratio', ratio: 1, fit: 'height-extend', anchor: 'left' };
      }
      const lineOwnerGeneration = Number(execution?.owner?.sessionGeneration) || null;
      const lineLayoutOwner = {
        tabId: execution?.tabId || invocation.session?.tabId || drawOpts?.tabId || null,
        component: 'line',
        generation: lineOwnerGeneration
      };
      let lineCartesianPlan = Shared.cartesianLayout?.planCartesianLayout?.({
        owner: lineLayoutOwner,
        userFrame: { width: W, height: H },
        baselineMargins: margin,
        requiredMargins,
        auxiliaryReserves: [],
        externalExtensions: { right: legendWidth },
        orientation: 'normal',
        lock: {
          enabled: shouldLockAspect,
          targetRatio: Number(aspectData?.resizerCartesianPlotRatio) || null,
          drive: aspectData?.resizerLastAxis === 'x' ? 'width' : (aspectData?.resizerLastAxis === 'y' ? 'height' : 'both')
        },
        plotConstraint,
        minimumPlot: { width: 20, height: 20 },
        rounding: { mode: 'none', precision: 6 }
      }) || null;
      if(lineCartesianPlan){
        margin={
          left: lineCartesianPlan.plotRect.x,
          top: lineCartesianPlan.plotRect.y,
          right: W-lineCartesianPlan.plotRect.x-lineCartesianPlan.plotRect.width,
          bottom: H-lineCartesianPlan.plotRect.y-lineCartesianPlan.plotRect.height
        };
        plotW=lineCartesianPlan.plotRect.width;
        plotH=lineCartesianPlan.plotRect.height;
      }
      lineDebug('Debug: line Cartesian layout',{
        owner: lineLayoutOwner,
        margin,
        requiredMargins,
        plotW,
        plotH,
        lockRatioEnabled: shouldLockAspect,
        plotConstraint,
        envelope: lineCartesianPlan?.contentEnvelope || null
      });
      const renderW = Math.max(W, lineCartesianPlan?.contentEnvelope?.maxX || W);
      const renderH = Math.max(H, lineCartesianPlan?.contentEnvelope?.maxY || H);
      const legendProjection = chartStyle.stageGraphContentViewport({
        svgBox: refs.svgBox,
        plot: plotEl,
        svg,
        baseWidth: W,
        baseHeight: H,
        rightWidth: lineCartesianPlan?.contentEnvelope?.extensionRight || legendWidth,
        leftWidth: lineCartesianPlan?.contentEnvelope?.extensionLeft || 0,
        topHeight: lineCartesianPlan?.contentEnvelope?.extensionTop || 0,
        bottomHeight: lineCartesianPlan?.contentEnvelope?.extensionBottom || 0,
        legendWidth
      });


      // Broken axis support
      const brokenXEnabled = getBrokenAxisEnabled('x');
      const brokenXSegments = brokenXEnabled ? getBrokenAxisSegments('x') : [];
      const brokenXScale = brokenXEnabled && brokenXSegments.length > 0
        ? computeBrokenAxisScale({
            dataMin: xScale.min,
            dataMax: xScale.max,
            segments: brokenXSegments,
            plotLength: plotW,
            orientation: 'horizontal'
          })
        : null;

      const brokenYEnabled = getBrokenAxisEnabled('y');
      const brokenYSegments = brokenYEnabled ? getBrokenAxisSegments('y') : [];
      const brokenYScale = brokenYEnabled && brokenYSegments.length > 0
        ? computeBrokenAxisScale({
            dataMin: yScale.min,
            dataMax: yScale.max,
            segments: brokenYSegments,
            plotLength: plotH,
            orientation: 'vertical'
          })
        : null;

      console.debug('Debug: line broken axis',{
        xEnabled: brokenXEnabled,
        xSegments: brokenXSegments,
        xBroken: brokenXScale?.isBroken,
        yEnabled: brokenYEnabled,
        ySegments: brokenYSegments,
        yBroken: brokenYScale?.isBroken
      });

      const isXValueVisible = value => {
        if(!brokenXScale || !brokenXScale.isBroken){ return true; }
        return brokenXScale.segments.some(seg => value >= seg.start && value <= seg.end);
      };

      const isYValueVisible = value => {
        if(!brokenYScale || !brokenYScale.isBroken){ return true; }
        return brokenYScale.segments.some(seg => value >= seg.start && value <= seg.end);
      };

      const x2px=v=>{
        const safeV = Math.min(Math.max(v, xScale.min), xScale.max);
        if(brokenXScale && brokenXScale.isBroken){
          return brokenXScale.valueToPixel(safeV, margin.left, plotW);
        }
        return margin.left+plotW*(safeV-xScale.min)/(xScale.max-xScale.min);
      };
      const y2px=v=>{
        const safeV = Math.min(Math.max(v, yScale.min), yScale.max);
        if(brokenYScale && brokenYScale.isBroken){
          return brokenYScale.valueToPixel(safeV, margin.top, plotH);
        }
        return margin.top+plotH*(1-(safeV-yScale.min)/(yScale.max-yScale.min));
      };
      function add(tag,attrs){const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.appendChild(el);return el;}
      if(showGrid){
        const gridSegments = [];
        xScale.ticks.forEach(t=>{
          if(!isXValueVisible(t)){ return; }
          const x=x2px(t);
          gridSegments.push({ x1:x, y1:margin.top, x2:x, y2:margin.top+plotH });
        });
        yScale.ticks.forEach(t=>{
          if(!isYValueVisible(t)){ return; }
          const y=y2px(t);
          gridSegments.push({ x1:margin.left, y1:y, x2:margin.left+plotW, y2:y });
        });
        const gridPathData = svgGeometry.buildCompoundLinePath?.(gridSegments) || '';
        if(gridPathData){
          add('path',Object.assign({d:gridPathData,fill:'none','data-grid-control':'1'},gridStrokeAttrs));
        }
        console.debug('Debug: line grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,gridStrokeStyle});
      }
      let originXT,originYT;
      if(originMode==='custom'){
        originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);
        originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);
      }else if(originMode==='zero'){
        originXT=logX?xScale.min:0;
        originYT=logY?yScale.min:0;
      }else{
        originXT=xScale.min;
        originYT=yScale.min;
      }
      const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
      const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
      if(isAreaMode){
        const axisMinTransformed = Number.isFinite(yScale.min) ? yScale.min : yMinT;
        const axisMaxTransformed = Number.isFinite(yScale.max) ? yScale.max : yMaxT;
        const axisMinDomain = logY ? Math.pow(10, axisMinTransformed) : axisMinTransformed;
        const axisMaxDomain = logY ? Math.pow(10, axisMaxTransformed) : axisMaxTransformed;
        const baselineTransformedCandidate = Number.isFinite(clampedYT) ? clampedYT : axisMinTransformed;
        let baselineDomain = logY ? Math.pow(10, baselineTransformedCandidate) : baselineTransformedCandidate;
        if(!Number.isFinite(baselineDomain)){
          baselineDomain = resolveLineAreaBaselineValue({ yMin: axisMinDomain, yMax: axisMaxDomain, logY });
        }
        if(!Number.isFinite(baselineDomain)){
          baselineDomain = axisMinDomain;
        }
        baselineDomain = Math.min(Math.max(baselineDomain, axisMinDomain), axisMaxDomain);
        if(logY && baselineDomain <= 0){
          const positiveAxisMin = axisMinDomain > 0 ? axisMinDomain : null;
          const positiveAxisMax = axisMaxDomain > 0 ? axisMaxDomain : null;
          const fallbackPositive = positiveAxisMin || positiveAxisMax || 1;
          baselineDomain = Math.max(Math.min(fallbackPositive, 1), 1e-6);
        }
        areaBaselineValue = baselineDomain;
        areaBaselineTransformed = logY ? Math.log10(areaBaselineValue) : areaBaselineValue;
      }
      const areaBaselinePx = (isAreaMode && Number.isFinite(areaBaselineTransformed)) ? y2px(areaBaselineTransformed) : null;
      if(isAreaMode){
        console.debug('Debug: line area baseline resolved',{ baselineValue: areaBaselineValue, baselinePx: areaBaselinePx });
      }
      const xAxisY=y2px(clampedYT);
      const yAxisX=x2px(clampedXT);
      const xTickPositions=xScale.ticks.map(t=>x2px(t));
      const yTickPositions=yScale.ticks.map(t=>y2px(t));
      const axisXMinPos=x2px(Number.isFinite(xScale.min)?xScale.min:xMinT);
      const axisXMaxPos=x2px(Number.isFinite(xScale.max)?xScale.max:xMaxT);
      const axisYMinPos=y2px(Number.isFinite(yScale.min)?yScale.min:yMinT);
      const axisYMaxPos=y2px(Number.isFinite(yScale.max)?yScale.max:yMaxT);
      let axisXStart=xTickPositions.length?Math.min(...xTickPositions,axisXMinPos):axisXMinPos;
      let axisXEnd=xTickPositions.length?Math.max(...xTickPositions,axisXMaxPos):axisXMaxPos;
      let axisYStart=yTickPositions.length?Math.min(...yTickPositions,axisYMinPos):axisYMinPos;
      let axisYEnd=yTickPositions.length?Math.max(...yTickPositions,axisYMaxPos):axisYMaxPos;
      if(axisXStart===axisXEnd){axisXStart=margin.left;axisXEnd=margin.left+plotW;}
      if(axisYStart===axisYEnd){axisYStart=margin.top;axisYEnd=margin.top+plotH;}
      console.debug('Debug: line axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
      const axisCrossTickTolerance = Math.max(1.5, axisStrokeWidth * 1.5);
      const axisCrossLabelTolerance = Math.max(1.5, axisStrokeWidth * 1.5, tickLen * 0.2);
      const yAxisCrossesXTickZone = axisYEnd > (xAxisY + axisCrossTickTolerance);
      const xAxisCrossesYTickZone = axisXStart < (yAxisX - axisCrossTickTolerance);
      const yAxisCrossesXLabelZone = axisYEnd > (xAxisY + axisCrossLabelTolerance);
      const xAxisCrossesYLabelZone = axisXStart < (yAxisX - axisCrossLabelTolerance);
      const shouldHideXAxisTickMark = pixel => yAxisCrossesXTickZone && Number.isFinite(pixel) && Math.abs(pixel - yAxisX) <= axisCrossTickTolerance;
      const shouldHideYAxisTickMark = pixel => xAxisCrossesYTickZone && Number.isFinite(pixel) && Math.abs(pixel - xAxisY) <= axisCrossTickTolerance;
      const shouldHideXAxisTickLabel = pixel => yAxisCrossesXLabelZone && Number.isFinite(pixel) && Math.abs(pixel - yAxisX) <= axisCrossLabelTolerance;
      const shouldHideYAxisTickLabel = pixel => xAxisCrossesYLabelZone && Number.isFinite(pixel) && Math.abs(pixel - xAxisY) <= axisCrossLabelTolerance;
      const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
      const minorSubdivisionsX = getLineAxisMinorTickSubdivisions('x', invocation.session);
      const minorSubdivisionsY = getLineAxisMinorTickSubdivisions('y', invocation.session);
      const minorTicksX = getLineAxisMinorTicksEnabled('x', invocation.session)
        ? chartStyle.computeMinorTickPositions({
            majorTicks: xScale.ticks,
            min: Number.isFinite(xScale.min) ? xScale.min : xMinT,
            max: Number.isFinite(xScale.max) ? xScale.max : xMaxT,
            scale: logX ? 'log' : 'linear',
            domainMin: logX ? xMin : null,
            domainMax: logX ? xMax : null,
            logBase: 10,
            subdivisions: minorSubdivisionsX
          })
        : [];
      const minorTicksY = getLineAxisMinorTicksEnabled('y', invocation.session)
        ? chartStyle.computeMinorTickPositions({
            majorTicks: yScale.ticks,
            min: Number.isFinite(yScale.min) ? yScale.min : yMinT,
            max: Number.isFinite(yScale.max) ? yScale.max : yMaxT,
            scale: logY ? 'log' : 'linear',
            domainMin: logY ? yMin : null,
            domainMax: logY ? yMax : null,
            logBase: 10,
            subdivisions: minorSubdivisionsY
          })
        : [];
      const getAdditionalLineStyle = entry => {
        if(axisExtras && typeof axisExtras.getLineStyle === 'function'){
          return axisExtras.getLineStyle(entry, {
            defaultStroke: axisStroke,
            defaultStrokeWidth: Math.max(0.75, axisStrokeWidth * 0.85),
            defaultPattern: 'dotted',
            defaultTransparency: 0
          });
        }
        return {
          stroke: axisStroke,
          strokeWidth: Math.max(0.75, axisStrokeWidth * 0.85),
          linePattern: 'dotted',
          lineTransparency: 0,
          opacity: 1,
          strokeDasharray: '0 6',
          strokeLinecap: 'round'
        };
      };
      const replaceMajorTickLabel = (majorLabelEntries, pixel, label) => {
        if(!Array.isArray(majorLabelEntries) || !majorLabelEntries.length){
          return false;
        }
        let best = null;
        let bestDist = Infinity;
        majorLabelEntries.forEach(candidate => {
          const candidatePixel = Number(candidate?.pixel);
          if(!Number.isFinite(candidatePixel)){ return; }
          const dist = Math.abs(candidatePixel - pixel);
          if(dist < bestDist){
            bestDist = dist;
            best = candidate;
          }
        });
        if(!best || !best.node || bestDist > 1.5){
          return false;
        }
        best.node.textContent = label;
        return true;
      };
      const registerAdditionalLineControlElement = (axis, index, lineElement) => {
        if(!lineElement || !additionalLineControls || typeof additionalLineControls.registerAdditionalLineElement !== 'function'){
          return;
        }
        additionalLineControls.registerAdditionalLineElement(lineElement, {
          scopeId: 'line',
          axis,
          index,
          getValue: () => getLineAxisAdditionalTicks(axis)?.[index]?.value,
          getColor: () => getLineAxisAdditionalTicks(axis)?.[index]?.lineColor ?? null,
          getThickness: () => getLineAxisAdditionalTicks(axis)?.[index]?.lineWidth ?? null,
          getPattern: () => getLineAxisAdditionalTicks(axis)?.[index]?.linePattern ?? 'dotted',
          getTransparency: () => getLineAxisAdditionalTicks(axis)?.[index]?.lineTransparency ?? 0,
          onColorChange: value => {
            const entry = getLineAxisAdditionalTicks(axis)?.[index] || null;
            if(!entry){ return; }
            updateLineAxisAdditionalTick(axis, index, { ...entry, lineColor: value });
          },
          onThicknessChange: value => {
            const entry = getLineAxisAdditionalTicks(axis)?.[index] || null;
            if(!entry){ return; }
            updateLineAxisAdditionalTick(axis, index, { ...entry, lineWidth: value });
          },
          onPatternChange: value => {
            const entry = getLineAxisAdditionalTicks(axis)?.[index] || null;
            if(!entry){ return; }
            updateLineAxisAdditionalTick(axis, index, { ...entry, linePattern: value });
          },
          onTransparencyChange: value => {
            const entry = getLineAxisAdditionalTicks(axis)?.[index] || null;
            if(!entry){ return; }
            updateLineAxisAdditionalTick(axis, index, { ...entry, lineTransparency: value });
          }
        });
      };
      const axisControlConfig = axis => buildLineAxisControlConfig(axis, invocation.session, {
        bounds: axis === 'x' ? { min: xScale.min, max: xScale.max } : { min: yScale.min, max: yScale.max },
        effectiveTickInterval: axis === 'x' ? xScale.step : yScale.step,
        logX,
        logY
      });

      // Draw X-axis with broken axis support
      if(brokenXScale && brokenXScale.isBroken){
        // Draw each segment separately
        let combinedLeft = Infinity;
        let combinedRight = -Infinity;
        let xBreakCapCount = 0;

        brokenXScale.segments.forEach((seg, segIndex) => {
          const segLeft = x2px(seg.start);
          const segRight = x2px(seg.end);
          add('line',{
            x1: segLeft,
            y1: xAxisY,
            x2: segRight,
            y2: xAxisY,
            stroke: axisStroke,
            'stroke-linecap': 'square',
            'stroke-width': axisStrokeWidth,
            'data-line-axis-style-target': '1'
          });
          if(segIndex > 0){
            const breakCapHalfLen = Math.max(0.5, tickLen * 0.9);
            add('line',{
              x1: segLeft,
              y1: xAxisY - breakCapHalfLen,
              x2: segLeft,
              y2: xAxisY + breakCapHalfLen,
              stroke: axisStroke,
              'stroke-width': axisStrokeWidth,
              'data-line-axis-style-target': '1'
            });
            xBreakCapCount += 1;
          }
          if(segIndex < brokenXScale.segments.length - 1){
            const breakCapHalfLen = Math.max(0.5, tickLen * 0.9);
            add('line',{
              x1: segRight,
              y1: xAxisY - breakCapHalfLen,
              x2: segRight,
              y2: xAxisY + breakCapHalfLen,
              stroke: axisStroke,
              'stroke-width': axisStrokeWidth,
              'data-line-axis-style-target': '1'
            });
            xBreakCapCount += 1;
          }
          combinedLeft = Math.min(combinedLeft, segLeft);
          combinedRight = Math.max(combinedRight, segRight);
        });
        lineDebug('Debug: line broken X axis caps rendered',{ count: xBreakCapCount, segmentCount: brokenXScale.segments.length });

        // Single transparent hit area covering the whole broken axis range
        if(isFinite(combinedLeft) && isFinite(combinedRight)){
          const hitLine = add('line',{
            x1: combinedLeft,
            y1: xAxisY,
            x2: combinedRight,
            y2: xAxisY,
            stroke: 'transparent',
            'stroke-width': 20,
            'pointer-events': 'stroke'
          });
          if(axisControls && typeof axisControls.registerAxisElement === 'function'){
            axisControls.registerAxisElement(hitLine, axisControlConfig('x'));
          }
        }
      }else{
        const xAxisLine = add('line',{x1:axisXStart,y1:xAxisY,x2:axisXEnd,y2:xAxisY,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        if(axisControls && typeof axisControls.registerAxisElement === 'function'){
          axisControls.registerAxisElement(xAxisLine, axisControlConfig('x'));
        }
      }

      // Draw Y-axis with broken axis support
      if(brokenYScale && brokenYScale.isBroken){
        // Draw each segment separately
        let combinedTop = Infinity;
        let combinedBottom = -Infinity;
        let yBreakCapCount = 0;

        brokenYScale.segments.forEach((seg, segIndex) => {
          const segTop = y2px(seg.end);
          const segBottom = y2px(seg.start);
          add('line',{
            x1: yAxisX,
            y1: segTop,
            x2: yAxisX,
            y2: segBottom,
            stroke: axisStroke,
            'stroke-linecap': 'square',
            'stroke-width': axisStrokeWidth,
            'data-line-axis-style-target': '1'
          });
          if(segIndex > 0){
            const breakCapHalfLen = Math.max(0.5, tickLen * 0.9);
            add('line',{
              x1: yAxisX - breakCapHalfLen,
              y1: segBottom,
              x2: yAxisX + breakCapHalfLen,
              y2: segBottom,
              stroke: axisStroke,
              'stroke-width': axisStrokeWidth,
              'data-line-axis-style-target': '1'
            });
            yBreakCapCount += 1;
          }
          if(segIndex < brokenYScale.segments.length - 1){
            const breakCapHalfLen = Math.max(0.5, tickLen * 0.9);
            add('line',{
              x1: yAxisX - breakCapHalfLen,
              y1: segTop,
              x2: yAxisX + breakCapHalfLen,
              y2: segTop,
              stroke: axisStroke,
              'stroke-width': axisStrokeWidth,
              'data-line-axis-style-target': '1'
            });
            yBreakCapCount += 1;
          }
          combinedTop = Math.min(combinedTop, segTop);
          combinedBottom = Math.max(combinedBottom, segBottom);
        });
        lineDebug('Debug: line broken Y axis caps rendered',{ count: yBreakCapCount, segmentCount: brokenYScale.segments.length });

        // Single transparent hit area covering the whole broken axis range
        if(isFinite(combinedTop) && isFinite(combinedBottom)){
          const hitLine = add('line',{
            x1: yAxisX,
            y1: combinedTop,
            x2: yAxisX,
            y2: combinedBottom,
            stroke: 'transparent',
            'stroke-width': 20,
            'pointer-events': 'stroke'
          });
          if(axisControls && typeof axisControls.registerAxisElement === 'function'){
            axisControls.registerAxisElement(hitLine, axisControlConfig('y'));
          }
        }
      }else{
        const yAxisLine = add('line',{x1:yAxisX,y1:axisYStart,x2:yAxisX,y2:axisYEnd,stroke:axisStroke,'stroke-linecap':'square','stroke-width':axisStrokeWidth});
        if(axisControls && typeof axisControls.registerAxisElement === 'function'){
          axisControls.registerAxisElement(yAxisLine, axisControlConfig('y'));
        }
      }
      console.debug('Debug: line axes stroke scaled',{ axisStrokeWidth, axisStrokeWidthBase, axisStroke });
      if(showFrame){
        console.debug('Debug: line frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
        chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'] });
      }
      // Frame closes plot area using existing axis styling for continuity
      const xTickNodes=[];
      const xMajorTickLabels=[];
      let xTickFontCount=0;
      if(minorTicksX.length){
        minorTicksX.forEach(value => {
          if(!isXValueVisible(value)){ return; }
          const x = x2px(value);
          if(shouldHideXAxisTickMark(x)){ return; }
          add('line',{
            x1: x,
            y1: xAxisY,
            x2: x,
            y2: xAxisY + minorTickStyle.length,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity,
            'data-line-axis-minor-target': '1'
          });
        });
      }
      xScale.ticks.forEach((t,i)=>{
        if(!isXValueVisible(t)){
          return; // Skip ticks that fall in gaps
        }
        const x=x2px(t);
        if(shouldHideXAxisTickMark(x)){
          lineDebug('Debug: line x-axis tick mark hidden at axis crossing',{ value: t, pixel: x, crossingPixel: yAxisX });
          return;
        }
        add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+xMajorTickLength,stroke:axisStroke,'stroke-width':axisStrokeWidth,'data-line-axis-style-target':'1'});
        if(shouldHideXAxisTickLabel(x)){
          lineDebug('Debug: line x-axis tick label hidden at axis crossing',{ value: t, pixel: x, crossingPixel: yAxisX });
          return;
        }
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, xMajorTickLength, tickGap) : 0;
        const txt=add('text',{x,y:xAxisY+xMajorTickLength+tickGap+extra,'font-size':fs,'text-anchor':'middle',fill:lineThemeTextColor});
        txt.textContent=formatTickX(logX?Math.pow(10,t):t);
        Shared.applyTextBaseline && Shared.applyTextBaseline(txt,'hanging',fs);
        markFontEditable(txt,'xTick');
        xTickFontCount+=1;
        xTickNodes.push(txt);
        xMajorTickLabels.push({ pixel: x, node: txt });
      });
      const additionalXTicks = getLineAxisAdditionalTicks('x', invocation.session);
      if(additionalXTicks.length){
        const renderExtras = axisExtras && typeof axisExtras.renderLinearExtras === 'function'
          ? axisExtras.renderLinearExtras
          : null;
        if(renderExtras){
          renderExtras({
            entries: additionalXTicks,
            logScale: logX,
            axisMin: xScale.min,
            axisMax: xScale.max,
            majorTicks: xScale.ticks,
            showGrid,
            isValueVisible: value => isXValueVisible(value),
            toPixel: value => x2px(value),
            onSkip: ({ reason, index, entry }) => {
              lineDebug('Debug: line additional axis tick skipped', {
                axis: 'x',
                index,
                reason,
                value: entry?.value,
                min: xScale.min,
                max: xScale.max,
                logScale: logX
              });
            },
            onLine: ({ index, entry, pixel }) => {
              const style = getAdditionalLineStyle(entry);
              const lineEl = add('line',{
                x1: pixel,
                y1: margin.top,
                x2: pixel,
                y2: margin.top + plotH,
                stroke: style.stroke,
                'stroke-width': style.strokeWidth,
                opacity: Number.isFinite(style.opacity) ? style.opacity : 1
              });
              if(style.strokeDasharray){
                lineEl.setAttribute('stroke-dasharray', style.strokeDasharray);
              }
              if(style.strokeLinecap){
                lineEl.setAttribute('stroke-linecap', style.strokeLinecap);
              }
              registerAdditionalLineControlElement('x', index, lineEl);
            },
            onTick: ({ pixel }) => {
              if(shouldHideXAxisTickMark(pixel)){
                lineDebug('Debug: line additional x-axis tick mark hidden at axis crossing',{ pixel });
                return;
              }
              add('line',{
                x1: pixel,
                y1: xAxisY,
                x2: pixel,
                y2: xAxisY + xMajorTickLength,
                stroke: axisStroke,
                'stroke-width': axisStrokeWidth,
                'data-line-axis-style-target': '1'
              });
            },
            onLabel: ({ pixel, label, nearMajor }) => {
              if(shouldHideXAxisTickLabel(pixel)){
                lineDebug('Debug: line additional x-axis label hidden at axis crossing',{ pixel, label });
                return;
              }
              if(nearMajor && replaceMajorTickLabel(xMajorTickLabels, pixel, label)){
                return;
              }
              const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, xMajorTickLength, tickGap) : 0;
              const txt = add('text',{
                x: pixel,
                y: xAxisY + xMajorTickLength + tickGap + extra + Math.max(2, fs * 0.85),
                'font-size': fs,
                'text-anchor': 'middle',
                fill: chartStyle.TEXT_COLOR
              });
              txt.textContent = label;
              Shared.applyTextBaseline && Shared.applyTextBaseline(txt,'hanging',fs);
              markFontEditable(txt,'xTick');
              xTickFontCount += 1;
              xTickNodes.push(txt);
            }
          });
        }
      }
      chartStyle.applyLabelOrientation(xTickNodes, chartStyle.resolveXAxisLabelOrientation(bottomLayout, getLineXAxisTickLabelAngle(invocation.session)));
      const yMajorTickLabels=[];
      let yTickFontCount=0;
      if(minorTicksY.length){
        minorTicksY.forEach(value => {
          if(!isYValueVisible(value)){ return; }
          const y = y2px(value);
          if(shouldHideYAxisTickMark(y)){ return; }
          add('line',{
            x1: yAxisX - minorTickStyle.length,
            y1: y,
            x2: yAxisX,
            y2: y,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity,
            'data-line-axis-minor-target': '1'
          });
        });
      }
      yScale.ticks.forEach((t,i)=>{
        if(!isYValueVisible(t)){
          return; // Skip ticks that fall in gaps
        }
        const y=y2px(t);
        if(shouldHideYAxisTickMark(y)){
          lineDebug('Debug: line y-axis tick mark hidden at axis crossing',{ value: t, pixel: y, crossingPixel: xAxisY });
          return;
        }
        add('line',{x1:yAxisX - yMajorTickLength,y1:y,x2:yAxisX,y2:y,stroke:axisStroke,'stroke-width':axisStrokeWidth,'data-line-axis-style-target':'1'});
        if(shouldHideYAxisTickLabel(y)){
          lineDebug('Debug: line y-axis tick label hidden at axis crossing',{ value: t, pixel: y, crossingPixel: xAxisY });
          return;
        }
        const txt=add('text',{x:yAxisX-(yMajorTickLength+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:lineThemeTextColor});
        txt.textContent=formatTickY(logY?Math.pow(10,t):t);
        markFontEditable(txt,'yTick');
        yTickFontCount+=1;
        yMajorTickLabels.push({ pixel: y, node: txt });
      });
      const additionalYTicks = getLineAxisAdditionalTicks('y', invocation.session);
      if(additionalYTicks.length){
        const renderExtras = axisExtras && typeof axisExtras.renderLinearExtras === 'function'
          ? axisExtras.renderLinearExtras
          : null;
        if(renderExtras){
          renderExtras({
            entries: additionalYTicks,
            logScale: logY,
            axisMin: yScale.min,
            axisMax: yScale.max,
            majorTicks: yScale.ticks,
            showGrid,
            isValueVisible: value => isYValueVisible(value),
            toPixel: value => y2px(value),
            onSkip: ({ reason, index, entry }) => {
              lineDebug('Debug: line additional axis tick skipped', {
                axis: 'y',
                index,
                reason,
                value: entry?.value,
                min: yScale.min,
                max: yScale.max,
                logScale: logY
              });
            },
            onLine: ({ index, entry, pixel }) => {
              const style = getAdditionalLineStyle(entry);
              const lineEl = add('line',{
                x1: margin.left,
                y1: pixel,
                x2: margin.left + plotW,
                y2: pixel,
                stroke: style.stroke,
                'stroke-width': style.strokeWidth,
                opacity: Number.isFinite(style.opacity) ? style.opacity : 1
              });
              if(style.strokeDasharray){
                lineEl.setAttribute('stroke-dasharray', style.strokeDasharray);
              }
              if(style.strokeLinecap){
                lineEl.setAttribute('stroke-linecap', style.strokeLinecap);
              }
              registerAdditionalLineControlElement('y', index, lineEl);
            },
            onTick: ({ pixel }) => {
              if(shouldHideYAxisTickMark(pixel)){
                lineDebug('Debug: line additional y-axis tick mark hidden at axis crossing',{ pixel });
                return;
              }
              add('line',{
                x1: yAxisX - yMajorTickLength,
                y1: pixel,
                x2: yAxisX,
                y2: pixel,
                stroke: axisStroke,
                'stroke-width': axisStrokeWidth
              });
            },
            onLabel: ({ pixel, label, nearMajor }) => {
              if(shouldHideYAxisTickLabel(pixel)){
                lineDebug('Debug: line additional y-axis label hidden at axis crossing',{ pixel, label });
                return;
              }
              if(nearMajor && replaceMajorTickLabel(yMajorTickLabels, pixel, label)){
                return;
              }
              const txt = add('text',{
                x: yAxisX - (yMajorTickLength + tickGap),
                y: pixel,
                'font-size': fs,
                'text-anchor': 'end',
                'dominant-baseline': 'middle',
                fill: chartStyle.TEXT_COLOR
              });
              txt.textContent = label;
              markFontEditable(txt,'yTick');
              yTickFontCount += 1;
            }
          });
        }
      }
      console.debug('Debug: line font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
      console.debug('Debug: line ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
      const showErrorBars=replicates>1;
      const errorStrokeWidth=errorBarWidthPx;
      const errorCapHalf=Math.max(4, dotSizePx*1.2);
      const buildLineIntervalBandPath = (samples, lowerKey, upperKey) => {
        const ordered = Array.isArray(samples) ? samples.slice().sort((a, b) => (a?.x ?? 0) - (b?.x ?? 0)) : [];
        const upper = [];
        const lower = [];
        ordered.forEach(sample => {
          const xRaw = sample?.x;
          const upperRaw = sample?.[upperKey];
          const lowerRaw = sample?.[lowerKey];
          if(!Number.isFinite(xRaw) || !Number.isFinite(upperRaw) || !Number.isFinite(lowerRaw)){
            return;
          }
          if(xRaw < xMin || xRaw > xMax){
            return;
          }
          if(logX && xRaw <= 0){
            return;
          }
          if(logY && (upperRaw <= 0 || lowerRaw <= 0)){
            return;
          }
          const xVal = logX ? Math.log10(xRaw) : xRaw;
          const upperVal = logY ? Math.log10(upperRaw) : upperRaw;
          const lowerVal = logY ? Math.log10(lowerRaw) : lowerRaw;
          if(!Number.isFinite(xVal) || !Number.isFinite(upperVal) || !Number.isFinite(lowerVal)){
            return;
          }
          upper.push({ x: x2px(xVal), y: y2px(upperVal) });
          lower.push({ x: x2px(xVal), y: y2px(lowerVal) });
        });
        if(upper.length < 2 || lower.length < 2){
          return null;
        }
        const commands = [];
        upper.forEach((pt, idx) => { commands.push(`${idx ? 'L' : 'M'}${pt.x},${pt.y}`); });
        lower.slice().reverse().forEach(pt => { commands.push(`L${pt.x},${pt.y}`); });
        commands.push('Z');
        return commands.join(' ');
      };
      const createLineRegressionOverlayPath = ({ overlayKey, seriesName, pathData, fill = 'none', stroke = 'none', strokeWidth = 0, opacity = 1, pattern = 'solid', vectorEffect = false }) => {
        const safeKey = sanitizeLineOverlayKey(overlayKey);
        if(!safeKey || !pathData){
          return null;
        }
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('d', pathData);
        el.setAttribute('fill', fill || 'none');
        if(stroke && stroke !== 'none' && Number(strokeWidth) > 0){
          el.setAttribute('stroke', stroke);
          el.setAttribute('stroke-width', String(strokeWidth));
          el.setAttribute('stroke-opacity', String(Math.min(1, Math.max(0, Number(opacity)))));
          const dash = lineOverlayPatternToDasharray(pattern, strokeWidth);
          if(dash){
            el.setAttribute('stroke-dasharray', dash);
          }
        }else{
          el.setAttribute('stroke', 'none');
        }
        if(vectorEffect){
          el.setAttribute('vector-effect', 'non-scaling-stroke');
        }
        el.dataset.lineOverlay = seriesName
          ? buildLineOverlaySeriesScopeValue(safeKey, seriesName)
          : safeKey;
        el.dataset.lineOverlayKey = safeKey;
        if(seriesName){
          el.dataset.series = seriesName;
        }
        return el;
      };
      const appendLineIntervalOverlay = ({ layer, overlayKey, pathData, style, seriesName, seriesLineColor, fallbackColor }) => {
        const safeKey = sanitizeLineOverlayKey(overlayKey);
        if(!layer || !safeKey || !pathData){
          return null;
        }
        const fillColor = resolveLineOverlayStrokeColor(style?.color, seriesLineColor, fallbackColor);
        const alpha = 1 - ((style?.transparency ?? (safeKey === 'prediction' ? 92 : 85)) / 100);
        const boundedAlpha = Math.min(1, Math.max(0, alpha));
        const thickness = Number(style?.thickness);
        const el = createLineRegressionOverlayPath({
          overlayKey: safeKey,
          seriesName,
          pathData,
          fill: fillColor,
          stroke: Number.isFinite(thickness) && thickness > 0 ? fillColor : 'none',
          strokeWidth: Number.isFinite(thickness) && thickness > 0 ? thickness : 0,
          opacity: boundedAlpha,
          pattern: style?.pattern
        });
        if(!el){
          return null;
        }
        el.setAttribute('fill-opacity', String(boundedAlpha));
        el.dataset.band = safeKey;
        el.dataset.lineOverlayRole = 'interval';
        layer.appendChild(el);
        registerLineOverlayControlElement(el, safeKey, seriesName);
        return el;
      };
      const appendLineTrendOverlay = ({ series, pathData, style, seriesLineColor, fallbackColor }) => {
        if(!series || !pathData){
          return null;
        }
        const rawThickness = Number(style?.thickness);
        const baseThickness = Number.isFinite(rawThickness) ? Math.max(0, rawThickness) : 1;
        const strokeWidth = chartStyle.scaleStrokeWidth(baseThickness, styleScaleInfo, { context: 'line-trend', min: 0 });
        const opacity = 1 - ((style?.transparency ?? 0) / 100);
        const strokeColor = resolveLineOverlayStrokeColor(style?.color, seriesLineColor, fallbackColor);
        const el = createLineRegressionOverlayPath({
          overlayKey: 'trend',
          seriesName: series.name || '',
          pathData,
          fill: 'none',
          stroke: strokeColor,
          strokeWidth,
          opacity,
          pattern: style?.pattern,
          vectorEffect: true
        });
        if(!el){
          return null;
        }
        svg.appendChild(el);
        registerLineOverlayControlElement(el, 'trend', series.name);
        return el;
      };
      const seriesElems=[];
      for(let i = 0; i < seriesWithData.length; i += 1){
        const s = seriesWithData[i];
        const color=colors[i];
        const styleOverride = lineStylesState.series?.[s.name] || {};
        const seriesAlpha = styleOverride && styleOverride.markerAlpha != null
          ? clampLineAlpha(styleOverride.markerAlpha)
          : (styleOverride && styleOverride.alpha != null ? clampLineAlpha(styleOverride.alpha) : alpha);
        const seriesLineAlpha = styleOverride && styleOverride.lineAlpha != null
          ? clampLineAlpha(styleOverride.lineAlpha)
          : (styleOverride && styleOverride.alpha != null ? clampLineAlpha(styleOverride.alpha) : alpha);
        const seriesStrokeWidth = Number.isFinite(Number(styleOverride.lineStrokeWidth))
          ? Number(styleOverride.lineStrokeWidth)
          : (Number.isFinite(Number(styleOverride.strokeWidth)) ? Number(styleOverride.strokeWidth) : borderWidthPx);
        const seriesLineColor = (typeof styleOverride.lineStroke === 'string' && styleOverride.lineStroke)
          ? styleOverride.lineStroke
          : color;
        const seriesDotSize = Number.isFinite(Number(styleOverride.dotSize)) ? Number(styleOverride.dotSize) : dotSizePx;
        const seriesMarkerStrokeWidth = Number.isFinite(Number(styleOverride.markerStrokeWidth))
          ? Number(styleOverride.markerStrokeWidth)
          : (Number.isFinite(Number(styleOverride.strokeWidth)) ? Number(styleOverride.strokeWidth) : 0);
        const seriesMarkerStroke = (typeof styleOverride.markerStroke === 'string' && styleOverride.markerStroke)
          || (typeof styleOverride.stroke === 'string' && styleOverride.stroke)
          || (typeof styleOverride.borderColor === 'string' && styleOverride.borderColor)
          || borderColor
          || color;
        const seriesMarkerFill = (typeof styleOverride.markerFill === 'string' && styleOverride.markerFill)
          || (typeof styleOverride.fill === 'string' && styleOverride.fill)
          || lineLabelsState.colors?.[s.name]
          || color;
        const confidenceStyle = getLineOverlayStyle('confidence', s.name);
        const predictionStyle = getLineOverlayStyle('prediction', s.name);
        if((showConfidenceIntervals || showPredictionIntervals) && s.regression?.intervals?.samples?.length){
          const intervalSamples = s.regression.intervals.samples;
          const confidencePath = showConfidenceIntervals ? buildLineIntervalBandPath(intervalSamples, 'ciLow', 'ciHigh') : null;
          const predictionPath = showPredictionIntervals ? buildLineIntervalBandPath(intervalSamples, 'piLow', 'piHigh') : null;
          const intervalLayer = (confidencePath || predictionPath) ? document.createElementNS(NS, 'g') : null;
          if(intervalLayer){
            intervalLayer.setAttribute('data-layer', 'line-interval-bands');
            intervalLayer.dataset.lineOverlayLayer = 'intervals';
            intervalLayer.dataset.series = s.name || '';
            svg.appendChild(intervalLayer);
            appendLineIntervalOverlay({
              layer: intervalLayer,
              overlayKey: 'confidence',
              pathData: confidencePath,
              style: confidenceStyle,
              seriesName: s.name,
              seriesLineColor,
              fallbackColor: color
            });
            appendLineIntervalOverlay({
              layer: intervalLayer,
              overlayKey: 'prediction',
              pathData: predictionPath,
              style: predictionStyle,
              seriesName: s.name,
              seriesLineColor,
              fallbackColor: color
            });
            console.debug('Debug: line interval shading rendered',{
              series: s.name,
              showConfidenceIntervals,
              showPredictionIntervals,
              hasConfidence: !!confidencePath,
              hasPrediction: !!predictionPath
            });
          }
        }
        let trendPathEl=null;
        if(showTrendLine && s.regression){
          const trendStyle = getLineOverlayStyle('trend', s.name);
          const domainMinX = Number.isFinite(s.regression?.domain?.minX) ? s.regression.domain.minX : xMin;
          const domainMaxX = Number.isFinite(s.regression?.domain?.maxX) ? s.regression.domain.maxX : xMax;
          const sampleCount = String(s.regression?.mode || '').toLowerCase() === 'linear' ? 60 : 160;
          const trendSamplesRaw = Array.isArray(s.regression?.curveSamples) && s.regression.curveSamples.length
            ? s.regression.curveSamples.slice()
            : (typeof regressionTools.sampleCurve === 'function'
              ? regressionTools.sampleCurve(s.regression, { minX: domainMinX, maxX: domainMaxX, sampleCount })
              : (Array.isArray(s.regression?.intervals?.samples)
                ? s.regression.intervals.samples.map(sample => ({ x: sample?.x, y: sample?.y }))
                : []));
          const trendPath = buildLineRegressionTrendPath(trendSamplesRaw, {
            logX,
            logY,
            xMin: xScale.min,
            xMax: xScale.max,
            yMin: yScale.min,
            yMax: yScale.max,
            isXVisible: isXValueVisible,
            isYVisible: isYValueVisible,
            projectX: x2px,
            projectY: y2px
          });
          trendPathEl = appendLineTrendOverlay({
            series: s,
            pathData: trendPath?.d,
            style: trendStyle,
            seriesLineColor,
            fallbackColor: color
          });
          if(trendPath){
            lineDebug('Debug: line regression trend path segmented', {
              series: s.name || '',
              mode: s.regression?.mode || '',
              commandCount: trendPath.commandCount,
              segmentCount: trendPath.segmentCount
            });
          }
        }
        const segments=[];
        let currentSegment=null;
        const markerFrag=document.createDocumentFragment();
        const errorGroup=showErrorBars?document.createElementNS(NS,'g'):null;
        if(errorGroup){
          errorGroup.setAttribute('fill','none');
          errorGroup.setAttribute('stroke',seriesLineColor);
          errorGroup.setAttribute('stroke-width',errorStrokeWidth);
          errorGroup.setAttribute('stroke-linecap','square');
          errorGroup.setAttribute('stroke-opacity',1-(seriesLineAlpha != null ? seriesLineAlpha : alpha));
        }
        for(let pointIndex = 0; pointIndex < s.points.length; pointIndex += 1){
          if((pointIndex & 511) === 0 && !(await checkpoint())){
            return false;
          }
          const pt = s.points[pointIndex];
          if(pt){
            const xv=logX?Math.log10(pt.x):pt.x;
            const yv=logY?Math.log10(pt.y):pt.y;
            const px=x2px(xv);
            const py=y2px(yv);
            if(!currentSegment){
              currentSegment={ commands: [`M${px} ${py}`], firstX: px, lastX: px };
            }else{
              currentSegment.commands.push(`L${px} ${py}`);
              currentSegment.lastX = px;
            }
            if(currentSegment){
              currentSegment.lastX = px;
            }
            const replicateCount=Number.isInteger(pt?.replicateCount)?pt.replicateCount:(Array.isArray(pt?.replicates)?pt.replicates.length:0);
            const canShowError=showErrorBars && replicateCount>1 && errorGroup && Number.isFinite(pt.lower) && Number.isFinite(pt.upper) && pt.upper>=pt.lower;
            if(!canShowError && showErrorBars && replicateCount<=1){
              console.debug('Debug: line error bar suppressed for single value',{ series:s.name, x:pt.x, replicateCount });
            }
            if(canShowError){
              const lowerVal=logY?(pt.lower>0?Math.log10(pt.lower):null):pt.lower;
              const upperVal=logY?(pt.upper>0?Math.log10(pt.upper):null):pt.upper;
              if(lowerVal!=null && upperVal!=null && Number.isFinite(lowerVal) && Number.isFinite(upperVal)){
                const lowerPx=y2px(lowerVal);
                const upperPx=y2px(upperVal);
                const errorSegments = svgGeometry.buildOrthogonalCappedLineSegments({
                  orientation:'vertical',
                  start:upperPx,
                  end:lowerPx,
                  cross:px,
                  capSize:errorCapHalf * 2,
                  capAtStart:true,
                  capAtEnd:true
                });
                const errorPathData = svgGeometry.buildCompoundLinePath?.(errorSegments) || '';
                if(errorPathData){
                  const errorPath=document.createElementNS(NS,'path');
                  errorPath.setAttribute('d',errorPathData);
                  errorPath.setAttribute('fill','none');
                  errorPath.setAttribute('data-line-error-bar','1');
                  errorPath.setAttribute('data-line-error-segment-count',String(errorSegments.length));
                  errorGroup.appendChild(errorPath);
                }
              }
            }
            if(seriesDotSize > 0){
              const markerShape = seriesShapes[i] || s.shape || 'circle';
              const marker=createLineMarkerShape(document, markerShape, {
                index: i,
                radius: seriesDotSize,
                cx: px,
                cy: py,
                fill: seriesMarkerFill,
                fillOpacity: 1 - (seriesAlpha != null ? seriesAlpha : alpha),
                stroke: seriesMarkerStroke,
                strokeWidth: Math.max(0, Number(seriesMarkerStrokeWidth) || 0),
                strokeOpacity: 1 - (seriesAlpha != null ? seriesAlpha : alpha)
              });
              if(marker){
                attachLineMarkerTooltip(marker, s, pt);
                markerFrag.appendChild(marker);
              }
            }
          } else {
            if(currentSegment){
              segments.push(currentSegment);
              currentSegment=null;
            }
          }
        }
        if(currentSegment){
          segments.push(currentSegment);
          currentSegment=null;
        }
        const strokeCommands=[];
        const fillCommands=[];
        segments.forEach(seg=>{
          seg.commands.forEach(cmd=>strokeCommands.push(cmd));
          if(isAreaMode && Number.isFinite(areaBaselinePx)){
            seg.commands.forEach(cmd=>fillCommands.push(cmd));
            fillCommands.push(`L${seg.lastX} ${areaBaselinePx}`);
            fillCommands.push(`L${seg.firstX} ${areaBaselinePx}`);
            fillCommands.push('Z');
          }
        });
        const pathStr=strokeCommands.join('');
        let attachedErrorGroup=null;
        let areaPathEl=null;
        if(fillCommands.length && areaFillOpacity > 0){
          const areaPathStr=fillCommands.join('');
          areaPathEl=document.createElementNS(NS,'path');
          areaPathEl.setAttribute('d',areaPathStr);
          areaPathEl.setAttribute('fill',seriesLineColor);
          areaPathEl.setAttribute('fill-opacity',String(areaFillOpacity));
          areaPathEl.setAttribute('stroke','none');
          areaPathEl.dataset.series=s.name;
          areaPathEl.dataset.lineStyleRole='area';
          areaPathEl.dataset.renderMode='area-fill';
          areaPathEl.style.pointerEvents='none';
          svg.appendChild(areaPathEl);
        }
        if(errorGroup && errorGroup.childNodes.length){
          svg.appendChild(errorGroup);
          attachedErrorGroup=errorGroup;
        }
        const pathAttrs={
          d:pathStr,
          stroke:seriesLineColor,
          'stroke-width':seriesStrokeWidth,
          'stroke-opacity':1-(seriesLineAlpha != null ? seriesLineAlpha : alpha),
          fill:'none'
        };
        pathAttrs['data-render-mode']=displayModeCurrent;
        const path=add('path',pathAttrs);
        path.dataset.series = s.name || '';
        path.dataset.lineStyleRole = 'line';
        path.style.cursor = 'pointer';
        path.addEventListener('click', handleLinePathClick);
        const mGroup=add('g',{});
        mGroup.dataset.series = s.name || '';
        mGroup.dataset.lineStyleRole = 'markers';
        mGroup.appendChild(markerFrag);
        let forecastPathEl=null;
        const forecastPointsRaw = Array.isArray(s.regression?.forecast?.points) ? s.regression.forecast.points.slice() : null;
        if(forecastPointsRaw && forecastPointsRaw.length){
          const sortedForecast = forecastPointsRaw
            .filter(pt=>pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && pt.x>=xMin && pt.x<=xMax && pt.y>=yMin && pt.y<=yMax)
            .sort((a,b)=>a.x-b.x);
          if(sortedForecast.length){
            let forecastStr='';
            let forecastStarted=false;
            const lastObserved = (() => {
              for(let idx=s.points.length-1; idx>=0; idx--){
                const candidate=s.points[idx];
                if(candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y)){
                  return candidate;
                }
              }
              return null;
            })();
            sortedForecast.forEach((pt,idx)=>{
              let xVal=logX?Math.log10(pt.x):pt.x;
              let yVal=logY?Math.log10(pt.y):pt.y;
              if(!Number.isFinite(xVal) || !Number.isFinite(yVal)){
                return;
              }
              const px=x2px(xVal);
              const py=y2px(yVal);
              if(!forecastStarted){
                if(lastObserved){
                  const obsX=logX?Math.log10(lastObserved.x):lastObserved.x;
                  const obsY=logY?Math.log10(lastObserved.y):lastObserved.y;
                  if(Number.isFinite(obsX) && Number.isFinite(obsY)){
                    const pxObs=x2px(obsX);
                    const pyObs=y2px(obsY);
                    forecastStr+=`M${pxObs} ${pyObs}`;
                    forecastStarted=true;
                  }
                }
              }
              if(!forecastStarted){
                forecastStr+=`M${px} ${py}`;
                forecastStarted=true;
              }else{
                forecastStr+=`L${px} ${py}`;
              }
            });
            if(forecastStr){
              forecastPathEl=document.createElementNS(NS,'path');
              forecastPathEl.setAttribute('d',forecastStr);
              forecastPathEl.setAttribute('fill','none');
              const forecastStroke=Math.max(borderWidthPx||0, chartStyle.scaleStrokeWidth(1, styleScaleInfo, { context: 'line-forecast', min: 0.5 }));
              forecastPathEl.setAttribute('stroke',color);
              forecastPathEl.setAttribute('stroke-width',forecastStroke);
              forecastPathEl.setAttribute('stroke-opacity',Math.max(0.2,1-alpha));
              forecastPathEl.setAttribute('stroke-dasharray','6 4');
              forecastPathEl.dataset.series = s.name;
              svg.appendChild(forecastPathEl);
            }
          }
        }
        seriesElems.push({path,mGroup,errorGroup:attachedErrorGroup,trendPath:trendPathEl,forecastPath:forecastPathEl,areaPath:areaPathEl});
      }
      if(!(await checkpoint())){
        return false;
      }
      console.debug('Debug: line series rendered',{ showErrorBars, seriesCount: seriesWithData.length });
      if(showPlotStats){
        const statsLines = buildLinePlotStatsLines(seriesWithData, { regressionMode: regressionModeCurrent });
        if(statsLines.length){
          const statsFontMetrics = chartStyle.resolveStatsAnnotationFontMetrics(fs, { styles: lineFontStyles });
          const statsFontSize = statsFontMetrics.fontSizePx;
          const statsLineHeight = statsFontSize * 1.2;
          const statsFrame = { originX: margin.left, originY: margin.top, width: plotW, height: plotH };
          const statsPosition = chartStyle.resolveStatsAnnotationPosition(
            lineLabelsState.positions?.stats,
            {
              x: margin.left + plotW - 4,
              y: margin.top + plotH - 4 - ((statsLines.length - 1) * statsLineHeight) - (statsFontSize * 0.22)
            },
            statsFrame
          );
          chartStyle.renderStatsAnnotation(svg, {
            lines: statsLines,
            x: statsPosition.x,
            y: statsPosition.y,
            textAnchor: 'end',
            fontSize: statsFontSize,
            fontSpec: statsFontMetrics.fontSpec,
            fill: lineThemeTextColor,
            dataAttributes: { 'line-plot-stats': '1' },
            fontScopeId: 'line',
            tabId: invocation.session?.tabId || null,
            onDragEnd: pos => {
              const nextPositions = cloneLineRuntimeValue(getLineLabelsState(invocation.session).positions, {}) || {};
              nextPositions.stats = chartStyle.captureStatsAnnotationPosition(pos, statsFrame);
              lineLabelsState = patchLineLabelsState(invocation.session, { positions: nextPositions }, { reason: 'line-2d-stats-position' });
            }
          });
        }
      }
      const legendRenderer=legendLayout.renderer;
      if(showLegend && legendRenderer.entries.length){
        const defaultLegendY=margin.top+legendRenderer.baselineOffset;
        const legendPos=lineLabelsState.positions?.legend;
        const plotRight = margin.left + plotW;
        const legendPosition = chartStyle.resolveLegendPosition(legendPos, {
          defaultX: W + legendLayout.legendGapPx,
          defaultY: defaultLegendY,
          reserveOriginX: W,
          reserveOriginY: margin.top,
          reserveScaleX: legendLayout.legendGapPx,
          reserveScaleY: plotH,
          legacyOriginX: plotRight,
          legacyOriginY: margin.top,
          legacyScaleX: legendLayout.legendGapPx,
          legacyScaleY: plotH
        });

        const legendGroup=legendRenderer.draw(svg,{
          x: legendPosition.x,
          y: legendPosition.y,
          canonicalX: legendPosition.canonicalX,
          canonicalY: legendPosition.canonicalY
        });
        if(legendGroup){
          bindLineLegendInteractions(legendGroup, svg, invocation.session, {
            mode: '2d',
            originX: legendPosition.originX,
            originY: legendPosition.originY,
            scaleX: legendPosition.scaleX,
            scaleY: legendPosition.scaleY
          });
          const textNodes=legendGroup.querySelectorAll('text');
          legendRenderer.entries.forEach((entry,index)=>{
            const textNode=textNodes[index];
            if(!textNode){ return; }
            markFontEditable(textNode,'legend',`legend-${index}`);
          });
        }
      }
      const xAxisBase=margin.top+plotH;
      const defaultXLabelX = margin.left+plotW/2;
      const defaultXLabelY = xAxisBase+bottomLayout.titleOffset;
      const xLabelPos = lineLabelsState.positions?.xLabel;

      // Convert relative positions to absolute if needed for xLabel
      let absoluteXLabelX = defaultXLabelX;
      let absoluteXLabelY = defaultXLabelY;
      if (xLabelPos) {
        if (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined) {
          // Use relative positioning
          absoluteXLabelX = margin.left + xLabelPos.relX * plotW;
          absoluteXLabelY = xAxisBase + xLabelPos.relY * (plotH + margin.top);
        } else if (xLabelPos.x !== undefined && xLabelPos.y !== undefined) {
          // Use saved absolute positioning when no relative anchor is present
          absoluteXLabelX = xLabelPos.x;
          absoluteXLabelY = xLabelPos.y;
        }
      }

      const xText=add('text',{x: absoluteXLabelX, y: absoluteXLabelY,'text-anchor':'middle','font-size':fs,fill:lineThemeTextColor});
      xText.textContent=lineLabelsState.x;
      markFontEditable(xText,'xTitle','xTitle');
      bindLineInlineTextInteraction(xText, invocation.session, 'x', { mode: '2d' });
      // Enable drag for x-axis label
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(xText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for xLabel
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - xAxisBase) / (plotH + margin.top);
            const nextPositions = cloneLineRuntimeValue(getLineLabelsState(invocation.session).positions, {}) || {};
            nextPositions.xLabel = {
              x: pos.x,
              y: pos.y,
              relX: relX,
              relY: relY
            };
            lineLabelsState = patchLineLabelsState(invocation.session, { positions: nextPositions }, { reason: 'line-2d-x-label-position' });
            console.debug('Debug: line x-label position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      const yLabelOffsetSpan = maxYLabelWidth + yMajorTickLength + tickGap + axisMetrics.axisTitleGap + fs * 0.5;
      const defaultYX = margin.left - yLabelOffsetSpan;
      const defaultYY = margin.top+plotH/2;
      const yLabelPos = lineLabelsState.positions?.yLabel;

      // Convert relative positions to absolute if needed for yLabel
      let absoluteYTextX = defaultYX;
      let absoluteYTextY = defaultYY;
      if (yLabelPos) {
        if (yLabelPos.relX !== undefined && yLabelPos.relY !== undefined) {
          // Use relative positioning
          absoluteYTextX = margin.left + yLabelPos.relX * yLabelOffsetSpan;
          absoluteYTextY = margin.top + yLabelPos.relY * plotH;
        } else if (yLabelPos.x !== undefined && yLabelPos.y !== undefined) {
          // Use saved absolute positioning when no relative anchor is present
          absoluteYTextX = yLabelPos.x;
          absoluteYTextY = yLabelPos.y;
        }
      }

      const yText=add('text',{x:absoluteYTextX,y:absoluteYTextY,transform:`rotate(-90 ${absoluteYTextX} ${absoluteYTextY})`,'text-anchor':'middle','font-size':fs,fill:lineThemeTextColor});
      yText.textContent=lineLabelsState.y;
      markFontEditable(yText,'yTitle','yTitle');
      bindLineInlineTextInteraction(yText, invocation.session, 'y', { mode: '2d' });
      // Enable drag for y-axis label
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(yText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for yLabel
            const relX = (pos.x - margin.left) / yLabelOffsetSpan;
            const relY = (pos.y - margin.top) / plotH;
            const nextPositions = cloneLineRuntimeValue(getLineLabelsState(invocation.session).positions, {}) || {};
            nextPositions.yLabel = {
              x: pos.x,
              y: pos.y,
              relX: relX,
              relY: relY
            };
            lineLabelsState = patchLineLabelsState(invocation.session, { positions: nextPositions }, { reason: 'line-2d-y-label-position' });
            console.debug('Debug: line y-label position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      const defaultTitleX = margin.left+plotW/2;
      const defaultTitleY = margin.top/2;
      const titlePos = lineLabelsState.positions?.title;

      // Convert relative positions to absolute if needed
      let absoluteTitleX = defaultTitleX;
      let absoluteTitleY = defaultTitleY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin.left + titlePos.relX * plotW;
          absoluteTitleY = margin.top + titlePos.relY * plotH;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use saved absolute positioning when no relative anchor is present
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }

      const titleText=add('text',{x: absoluteTitleX, y: absoluteTitleY,'text-anchor':'middle','font-size':fs,fill:lineThemeTextColor});
      titleText.textContent=lineLabelsState.title;
      markFontEditable(titleText,'graphTitle','graphTitle');
      bindLineInlineTextInteraction(titleText, invocation.session, 'title', { mode: '2d' });
      // Enable drag for title
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(titleText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - margin.top) / plotH;
            const nextPositions = cloneLineRuntimeValue(getLineLabelsState(invocation.session).positions, {}) || {};
            nextPositions.title = {
              x: pos.x,
              y: pos.y,
              relX: relX,
              relY: relY
            };
            lineLabelsState = patchLineLabelsState(invocation.session, { positions: nextPositions }, { reason: 'line-2d-title-position' });
            console.debug('Debug: line title position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      renderLineStatsAdvisor(seriesWithData, statsContext);
      const lineAxisOwnerTabId = invocation.session?.tabId || getLineProjectionTabId() || null;
      Shared.visualProjection?.bind?.(
        svg.querySelectorAll('[data-axis-control="1"]:not([stroke="transparent"]), [data-frame-edge], [data-line-axis-style-target="1"]'),
        {
          component: 'line',
          channel: 'axis',
          tabId: lineAxisOwnerTabId,
          strokeWidthBase: axisStrokeWidthBase,
          renderedStrokeWidth: axisStrokeWidth
        }
      );
      Shared.visualProjection?.bind?.(svg.querySelectorAll('[data-line-axis-minor-target="1"]'), {
        component: 'line',
        channel: 'axis',
        tabId: lineAxisOwnerTabId,
        strokeWidthBase: axisStrokeWidthBase,
        renderedStrokeWidth: minorTickStyle.strokeWidth
      });
      registerLineGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
      ensureGraphViewport(svg, {
        padding: Math.max(fs, 16),
        debugLabel: 'line-graph',
        baseViewport: { width: renderW, height: renderH },
        fitContent: false,
        remeasure: true
      });
      if(!(await checkpoint()) || (invocation.session && !isLineSessionActive(invocation.session))){
        return false;
      }
      const measuredLineViewport = legendProjection.measure?.() || legendProjection.getViewport?.() || null;
      if(lineCartesianPlan && measuredLineViewport){
        lineCartesianPlan = Shared.cartesianLayout.planCartesianLayout({
          owner: lineLayoutOwner,
          userFrame: lineCartesianPlan.userFrame,
          baselineMargins: lineCartesianPlan.baselineMargins,
          requiredMargins: lineCartesianPlan.requiredMargins,
          auxiliaryReserves: [],
          externalExtensions: { right: legendWidth },
          orientation: 'normal',
          lock: lineCartesianPlan.lock,
          plotConstraint,
          minimumPlot: lineCartesianPlan.minimumPlot,
          contentBounds: {
            minX: measuredLineViewport.minX,
            minY: measuredLineViewport.minY,
            maxX: measuredLineViewport.maxX,
            maxY: measuredLineViewport.maxY
          },
          rounding: { mode: 'none', precision: 6 }
        });
      }
      const lineLayoutPublished = lineCartesianPlan
        ? Shared.cartesianLayout?.publishCartesianLayout?.(refs.svgBox, lineCartesianPlan, {
            tabId: lineLayoutOwner.tabId,
            component: 'line',
            generation: lineLayoutOwner.generation,
            resizePhase: drawOpts?.resizePhase || null,
            canCommit: () => execution?.isCurrent?.() !== false
              && (!invocation.session || isLineSessionActive(invocation.session)),
            projectionTarget: svg,
            commitFrame: () => svgPublication.commit(),
            commitPresentation: () => legendProjection.commit()
          })
        : false;
      if(lineCartesianPlan && !lineLayoutPublished){
        return false;
      }
      if(!lineCartesianPlan){
        if(!svgPublication.commit()) return false;
        legendProjection.commit();
      }
      getActiveLineLayoutManager()?.syncPanels?.({ skipSchedule: true });
      scheduleLineNoticeWidth('draw');
      console.debug('Debug: drawLine complete',{debugStamp}); // Debug: draw exit
    }catch(err){
      console.error('drawLine error',err);
    }finally{
      svgPublication?.cleanup();
    }
  }

  function initNotes(){
    const stack = refs.graphPanel?.querySelector?.('.line-plot-stack')
      || refs.graphPanel?.querySelector?.('.diagram-area')
      || refs.root?.querySelector?.('#lineGraphPanel .line-plot-stack')
      || refs.root?.querySelector?.('#lineGraphPanel .diagram-area')
      || queryLineRoot('#lineGraphPanel .line-plot-stack')
      || queryLineRoot('#lineGraphPanel .diagram-area');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: line notes mount skipped (missing stack)');
      }
      return;
    }
    const ownerTabId = getLineProjectionTabId() || null;
    const ownerSession = getLineSession(ownerTabId, {
      tabId: ownerTabId,
      reason: 'line-notes-init'
    }, { create: true }) || getLineActiveSessionForState();
    const ownerNotes = normalizeLineCanonicalNotes(ownerSession?.state?.notes || notesState);
    notesState.text = ownerNotes.text;
    notesState.open = ownerNotes.open;
    const patchOwnerNotes = patch => {
      const next = normalizeLineCanonicalNotes({
        ...normalizeLineCanonicalNotes(ownerSession?.state?.notes || ownerNotes),
        ...(patch || {})
      });
      notesState.text = next.text;
      notesState.open = next.open;
      if(ownerSession?.state){
        ownerSession.state.notes = next;
        ownerSession.updatedAt = Date.now();
      }
      return next;
    };
    notesState.control = Shared.componentLifecycle?.ensureOwnedNotesControl?.({
      componentKey: 'line',
      ownerTabId,
      container: stack,
      notesState,
      control: notesState.control,
      id: 'line-notes',
      scopeId: 'line',
      fontKey: 'notes',
      canUseControl: canUseLineNotesControl,
      unavailableMessage: 'line notes helper unavailable',
      applyToControl: control => {
        control.setValue(ownerNotes.text);
        control.setOpen(ownerNotes.open);
      },
      onChange: value => {
        patchOwnerNotes({ text: value == null ? '' : String(value) });
      },
      onToggle: open => {
        patchOwnerNotes({ open: !!open });
      }
    }) || null;
  }

  function bindLineControlHandler(node, eventName, key, handler){
    if(!node || typeof node.addEventListener !== 'function'){
      return;
    }
    const registryKey = `${eventName}:${key}`;
    if(!node.__lineControlHandlers){
      Object.defineProperty(node, '__lineControlHandlers', {
        value: Object.create(null),
        configurable: true
      });
    }
    const previous = node.__lineControlHandlers[registryKey];
    if(previous){
      node.removeEventListener(eventName, previous);
    }
    node.__lineControlHandlers[registryKey] = handler;
    node.addEventListener(eventName, handler);
  }

  // PART: SETUP
  function setup(options = {}){
    const targetTabId = resolveLineOwnedRuntimeTabId(options?.tabId || options?.tab || null, options) || null;
    if(targetTabId){
      bindLineSessionForTab(targetTabId, { ...(options || {}), tabId: targetTabId, reason: options?.reason || 'line-setup-bind-session' }, { syncControls: false });
    }
    if(line.ready && (!targetTabId || line.__boundTabId === targetTabId)){
      console.debug('Debug: Components.line.setup skipped', { tabId: getLineProjectionTabId() || null });
      return;
    }
    if(line.ready){
      console.debug('Debug: Components.line.setup rebinding', { previousTabId: getLineProjectionTabId() || null, targetTabId, reason: options?.reason || 'setup' });
      line.ready = false;
    }
    line.__boundTabId = targetTabId || null;
    console.debug('Debug: Components.line.setup start', { tabId: getLineProjectionTabId() || null }); // Debug: setup entry
    const document = global.document;
    if(!document || typeof Shared?.hot?.createStandardTable !== 'function'){
      console.error('Line component dependencies missing');
      return;
    }
    const activeRoot = options?.root
      || Shared.workspaceTabs?.getMountedRoot?.(targetTabId || null, 'line')
      || getLineNodeById('linePage')
      || document;
    bindLineDomRefs(activeRoot, targetTabId);
    ensureLineAxisSettings();
    ensureLineGridStyle(getLineAxisStrokeWidth());
    if(refs.plot && !refs.plot.__lineAxesLengthCloseHandler){
      const onPlotPointerDown = () => {
        closeLineAxesLengthMenu('plot-pointer');
      };
      refs.plot.addEventListener('pointerdown', onPlotPointerDown);
      refs.plot.__lineAxesLengthCloseHandler = onPlotPointerDown;
    }
    ensureLineStatsReportHost();
    ensureLineStatsInferenceControls();
    ensureLineRegressionSelection();
    renderLineStatsAdvisor([], { showIntervals: isLineAnyIntervalEnabled(), showDiagnostics: isLineDiagnosticsEnabled() });
    clearLineStatsOutputs(lineStatsEmptyPlaceholder);
    setLineStatsStatus('');
    updateLineStatsButtonState({ disabled: true, label: 'Calculate statistics' });
    updateLineRegressionOverlayControlState(false);
    if(refs.statsButton){
      refs.statsButton.addEventListener('click', handleLineStatsComputeClick);
    }
    syncLineErrorBarToolbarValue();
    if(refs.fontSize && refs.fontSizeVal){
      if(refs.fontSize.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        console.debug('Debug: line font size base initialized',{ value: refs.fontSize.value }); // Debug: initial base size
      }
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
    }
    if(refs.displayMode){
      lineDisplayMode = sanitizeLineDisplayMode(refs.displayMode.value);
      refs.displayMode.value = lineDisplayMode;
      refs.displayMode.addEventListener('change',e=>{
        const nextMode = sanitizeLineDisplayMode(e.target.value);
        if(nextMode !== lineDisplayMode){
          lineDisplayMode = nextMode;
          console.debug('Debug: line display mode change',{ mode: lineDisplayMode });
          scheduleLineViewRefresh('line-display-mode-change', Shared.componentLifecycle.createStructuralDrawOptions('line-display-mode-change'));
        }
      });
    }
    if(refs.replicatesInput){
      refs.replicatesInput.value = String(lineReplicates);
      refs.replicatesInput.addEventListener('change',e=>{
        const resolved = clampLineReplicateCount(e.target.value);
        console.debug('Debug: line replicates input change',{ raw: e.target.value, resolved });
        if(resolved !== lineReplicates){
          applyLineReplicateChange(resolved);
        }else{
          refs.replicatesInput.value = String(lineReplicates);
          updateLineReplicateModeControls();
          applyLineTableFormatToHot(getActiveLineHotManager(), { reason: 'line-replicates-unchanged' });
        }
        syncLineRuntimeControlsFromRefs({ reason: 'line-replicates-input-change' });
      });
    }
    if(refs.replicateMode){
      refs.replicateMode.addEventListener('change',e=>{
        const requested = e.target.value === '3d'
          ? '3d'
          : (e.target.value === 'grouped' ? 'grouped' : 'single');
        console.debug('Debug: line table format change',{ mode: requested });
        if(requested === '3d'){
          enterLine3dMode({ resetRotation: !!e?.isTrusted });
          return;
        }
        if(getLineViewState().viewMode === '3d'){
          exitLine3dMode({ skipDraw: true });
        }
        syncLineRuntimeControlsFromRefs({ reason: 'line-table-format-change' });
        if(requested === 'single'){
          if(lineReplicates > LINE_MIN_REPLICATES){
            lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
            applyLineReplicateChange(LINE_MIN_REPLICATES);
          }else{
            updateLineReplicateModeControls(requested);
          }
        }else{
          const target = lineReplicates > LINE_MIN_REPLICATES ? lineReplicates : lineLastGroupedReplicateCount;
          const hot = getActiveLineHotManager();
          const matrix = hot ? hot.getData() : [];
          const shouldResetGroups = isLineMatrixEmpty(matrix);
          if(target !== lineReplicates || shouldResetGroups){
            applyLineReplicateChange(target, {
              minSeriesCount: shouldResetGroups ? 2 : undefined,
              resetGroupLabels: shouldResetGroups,
              preserveGroupLabels: !shouldResetGroups
            });
          }else{
            updateLineReplicateModeControls(requested);
          }
        }
        applyLineTableFormatToHot(getActiveLineHotManager(), { reason: 'line-table-format-change' });
      });
    }
    if(refs.viewMode){
      refs.viewMode.value = getLineViewState().viewMode;
      refs.viewMode.addEventListener('change', e => {
        const requested = e.target.value === '3d' ? '3d' : '2d';
        console.debug('Debug: line view mode change', { mode: requested });
        if(requested === '3d'){
          enterLine3dMode({ resetRotation: !!e?.isTrusted });
        }else{
          exitLine3dMode();
        }
      });
    }
    updateLineReplicateModeControls();
    if(refs.regressionMode){
      refs.regressionMode.addEventListener('change',e=>{
        console.debug('Debug: line regression mode change',{ value: e.target.value });
        updateForecastVisibility();
        requestLineStatsContextRefresh('regression-mode-change');
        scheduleLineViewRefresh('line-regression-mode-change', { force: true, skipThresholdEvaluation: true });
      });
    }
    let lineLogWarningEl=null;
    const lineDebugEnabled=()=>typeof Shared.isDebugEnabled==='function'&&Shared.isDebugEnabled();
    function ensureLineLogWarningElement(){
      if(lineLogWarningEl&&lineLogWarningEl.isConnected){
        return lineLogWarningEl;
      }
      const host=refs.logY?.closest('fieldset')||refs.logX?.closest('fieldset');
      if(!host){
        if(lineDebugEnabled()){
          console.debug('Debug: line log warning host unavailable');
        }
        return null;
      }
      const el=global.document.createElement('div');
      el.className='config-panel__warning';
      el.setAttribute('role','alert');
      el.setAttribute('aria-live','polite');
      el.hidden=true;
      host.appendChild(el);
      lineLogWarningEl=el;
      if(lineDebugEnabled()){
        console.debug('Debug: line log warning element created');
      }
      return lineLogWarningEl;
    }
    function showLineLogWarning(message){
      const el=ensureLineLogWarningElement();
      if(!el){
        return;
      }
      el.textContent=message;
      el.hidden=false;
      if(lineDebugEnabled()){
        console.debug('Debug: line log warning shown',{ message });
      }
    }
    function clearLineLogWarning(){
      if(!lineLogWarningEl){
        return;
      }
      lineLogWarningEl.textContent='';
      lineLogWarningEl.hidden=true;
      if(lineDebugEnabled()){
        console.debug('Debug: line log warning cleared');
      }
    }
    function applyLineLogValidationFailure(axis, validation, context, options = {}){
      if(!validation || validation.allowed !== false){
        return;
      }
      const session = options.session || getLineActiveSessionForState();
      const lineRefs = resolveLineRefsContext(session, options);
      const checkbox = axis === 'x' ? lineRefs.logX : lineRefs.logY;
      if(checkbox){
        checkbox.checked = false;
      }
      const warningMessage = validation.message || `Cannot enable log scale on the ${axis === 'x' ? 'X' : 'Y'} axis while non-positive values are present.`;
      showLineLogWarning(warningMessage);
      if(lineDebugEnabled()){
        console.debug('Debug: line log axis auto-disabled',{ axis, context, reason: validation.reason, value: validation.value });
      }
      scheduleActiveLineDraw();
    }
    function revalidateActiveLineLogAxis(axis, context, options = {}){
      const session = options.session || getLineActiveSessionForState();
      const lineRefs = resolveLineRefsContext(session, options);
      const checkbox = axis === 'x' ? lineRefs.logX : lineRefs.logY;
      if(!checkbox?.checked){
        return true;
      }
      const validation = validateLineLogAxis(axis, { ...options, session, refs: lineRefs });
      if(!validation.allowed){
        applyLineLogValidationFailure(axis, validation, context, { ...options, session, refs: lineRefs });
        console.warn('line log axis disabled',{ axis, context, reason: validation.reason, value: validation.value });
        return false;
      }
      clearLineLogWarning();
      return true;
    }
    function isLineLogAxisInputInProgress(inputEl){
      if(!inputEl){
        return false;
      }
      const doc = inputEl.ownerDocument || global.document;
      if(doc.activeElement !== inputEl){
        return false;
      }
      const raw = String(inputEl.value ?? '').trim();
      if(raw === '' || raw === '-' || raw === '+'){
        return true;
      }
      if(/[.,]$/.test(raw)){
        return true;
      }
      if(/[eE]$/.test(raw) || /[eE][+-]$/.test(raw)){
        return true;
      }
      if(/^[-+]?0+(?:[.,]0*)?(?:[eE][+-]?\d*)?$/.test(raw)){
        return true;
      }
      return false;
    }
    function validateLineLogAxis(axis, options = {}){
      const session = options.session || getLineActiveSessionForState();
      const lineRefs = resolveLineRefsContext(session, options);
      const hot = options.hot || getLineSessionHotManager(session, options);
      const axisLabel=axis==='x'?'X':'Y';
      const minInput=axis==='x'?lineRefs.xMin:lineRefs.yMin;
      const maxInput=axis==='x'?lineRefs.xMax:lineRefs.yMax;
      const originInput=axis==='x'?lineRefs.originX:lineRefs.originY;
      const manualMin=parseFloat(minInput?.value);
      if(Number.isFinite(manualMin)&&manualMin<=0){
        const message=`Cannot enable log scale on the ${axisLabel} axis because the minimum value (${manualMin}) is not positive.`;
        if(lineDebugEnabled()){
          console.debug('Debug: line log axis blocked by manual minimum',{ axis, value: manualMin });
        }
        return{allowed:false,reason:'axis-limit',value:manualMin,message,hasZeros:manualMin===0,hasNegatives:manualMin<0};
      }
      const manualMax=parseFloat(maxInput?.value);
      if(Number.isFinite(manualMax)&&manualMax<=0){
        const message=`Cannot enable log scale on the ${axisLabel} axis because the maximum value (${manualMax}) is not positive.`;
        if(lineDebugEnabled()){
          console.debug('Debug: line log axis blocked by manual maximum',{ axis, value: manualMax });
        }
        return{allowed:false,reason:'axis-limit',value:manualMax,message,hasZeros:manualMax===0,hasNegatives:manualMax<0};
      }
      const originModeValue=lineRefs.originMode?.value;
      if(originModeValue==='custom'){
        const originVal=parseFloat(originInput?.value);
        if(Number.isFinite(originVal)&&originVal<=0){
          const message=`Cannot enable log scale on the ${axisLabel} axis because the custom origin (${originVal}) is not positive.`;
          if(lineDebugEnabled()){
            console.debug('Debug: line log axis blocked by custom origin',{ axis, value: originVal });
          }
          return{allowed:false,reason:'origin',value:originVal,message,hasZeros:originVal===0,hasNegatives:originVal<0};
        }
      }
      const analysis=hot?.getAnalysisData?.()||(hot && Shared.hot.getAnalysisData(hot));
      const dataMatrix=analysis?.data||[];
      const rowCount=analysis?.rowCount||dataMatrix.length;
      const colCount=analysis?.colCount||(dataMatrix[0]?.length||0);
      if(!rowCount||!colCount){
        if(lineDebugEnabled()){
          console.debug('Debug: line log axis validation skipped (empty data)',{ axis, rowCount, colCount });
        }
        return{allowed:true};
      }
      const header=Array.isArray(dataMatrix[0])?dataMatrix[0]:[];
      let xIndex=header.findIndex(h=>String(h).trim().toLowerCase()==='x');
      if(xIndex<0){
        xIndex=0;
      }
      if(analysis.isColumnExcluded?.(xIndex)){
        if(lineDebugEnabled()){
          console.debug('Debug: line log axis validation skipped because X column is excluded',{ axis, xIndex });
        }
        if(axis==='x'){
          return{allowed:false,reason:'excluded',message:'Restore the X axis column before enabling log scale.'};
        }
      }
      let hasZeros=false;
      let hasNegatives=false;
      let firstZeroRow=null;
      let firstNegativeRow=null;
      let firstNegativeValue=null;
      for(let r=1;r<rowCount;r+=1){
        if(analysis.isRowExcluded?.(r)){
          continue;
        }
        const row=dataMatrix[r]||[];
        if(axis==='x'){
          const value=parseFloat(row[xIndex]);
          if(Number.isFinite(value)){
            if(value<0){
              hasNegatives=true;
              if(firstNegativeRow===null){
                firstNegativeRow=r;
                firstNegativeValue=value;
              }
            }else if(value===0){
              hasZeros=true;
              if(firstZeroRow===null){
                firstZeroRow=r;
              }
            }
          }
        }else{
          for(let c=0;c<colCount;c+=1){
            if(c===xIndex||analysis.isColumnExcluded?.(c)){
              continue;
            }
            const cell=row[c];
            if(cell===null||typeof cell==='undefined'||cell===''){
              continue;
            }
            const value=parseFloat(cell);
            if(Number.isFinite(value)){
              if(value<0){
                hasNegatives=true;
                if(firstNegativeRow===null){
                  firstNegativeRow=r;
                  firstNegativeValue=value;
                }
              }else if(value===0){
                hasZeros=true;
                if(firstZeroRow===null){
                  firstZeroRow=r;
                }
              }
            }
          }
        }
      }
      if(hasNegatives){
        const formatted=firstNegativeValue.toPrecision(4);
        const message=`Cannot enable log scale on the ${axisLabel} axis because data includes ${formatted} at row ${firstNegativeRow+1}.`;
        if(lineDebugEnabled()){
          console.debug('Debug: line log axis blocked by negative data',{ axis, row:firstNegativeRow, value:firstNegativeValue });
        }
        return{allowed:false,reason:'data',value:firstNegativeValue,message,hasZeros,hasNegatives:true};
      }
      if(hasZeros){
        const message=`Data contains zero values on the ${axisLabel} axis. Would you like to use log(x+1) transform instead?`;
        if(lineDebugEnabled()){
          console.debug('Debug: line log axis has zeros',{ axis, row:firstZeroRow });
        }
        return{allowed:false,reason:'zeros',value:0,message,hasZeros:true,hasNegatives:false,canUsePlusOne:true};
      }
      if(lineDebugEnabled()){
        console.debug('Debug: line log axis validation passed',{ axis });
      }
      return{allowed:true};
    }
    const lineAutoSizeTargets=[
      refs.replicateMode,
      refs.viewMode,
      refs.displayMode,
      refs.regressionMode,
      refs.statType,
      refs.originMode,
      refs.forecastCriterion
    ];
    lineAutoSizeTargets.filter(Boolean).forEach(select=>{
      attachLineSelectAutoSize(select, 'line');
    });
    if(refs.forecastHorizon){
      refs.forecastHorizon.addEventListener('change',()=>{
        resolveForecastOptions({ session: getLineActiveSessionForState(), reason: 'line-forecast-horizon-change' });
        scheduleActiveLineDraw();
      });
    }
    if(refs.forecastSeasonLength){
      refs.forecastSeasonLength.addEventListener('change',()=>{
        resolveForecastOptions({ session: getLineActiveSessionForState(), reason: 'line-forecast-season-change' });
        scheduleActiveLineDraw();
      });
    }
    if(refs.forecastAuto){
      refs.forecastAuto.addEventListener('change',()=>{
        resolveForecastOptions({ session: getLineActiveSessionForState(), reason: 'line-forecast-auto-change' });
        scheduleActiveLineDraw();
      });
    }
    if(refs.forecastCriterion){
      refs.forecastCriterion.addEventListener('change',()=>{
        resolveForecastOptions({ session: getLineActiveSessionForState(), reason: 'line-forecast-criterion-change' });
        scheduleActiveLineDraw();
      });
    }

    resolveForecastOptions({ session: getLineActiveSessionForState(), syncInputs: true, reason: 'line-forecast-initial-sync' });
    updateForecastVisibility();

    const layoutManager = setActiveLineLayoutManager(Shared.componentLayout?.createStandardPanels({
      componentName: 'line',
      tabId: targetTabId || undefined,
      root: refs.root || activeRoot || undefined,
      reason: options?.reason || 'line-setup',
      selectors: {
        tablePanel: '#lineTablePanel',
        graphPanel: '#lineGraphPanel',
        panelResizer: '#linePanelResizer',
        hotWrapper: '#lineHotWrapper',
        hotContainer: '#lineHot',
        svgBox: () => refs.graphPanel?.querySelector('.svgbox'),
        resizeTarget: () => refs.graphPanel?.querySelector('.svgbox')
      },
        scheduleDraw: scheduleLineDraw,
        preserveGraphContent: false,
        panelSyncOptions: {
          disableAutoWidthClamp: true,
          lockGraphPanelWidth: false
        },
        onAfterSync: () => syncLineAutoDrawNoticeWidth('panel-sync'),
      onMinSvgWidth: value => {
        lineMinSvgWidth = Math.max(0, Number(value) || 0);
        console.debug('Debug: line layout min width update', { value: lineMinSvgWidth });
      },
        resizableBoxOptions: {
          cartesianLayoutTransactionEnabled: () => {
            const owner = getLineSession(targetTabId || null, {
              tabId: targetTabId || null,
              reason: 'line-cartesian-resizer-capability'
            }, { create: false });
            const ownerControls = owner ? getLineRuntimeControlsForSession(owner, lineFallbackRuntimeControls) : null;
            return !!owner && ownerControls?.viewMode !== '3d' && ownerControls?.tableFormat !== '3d';
          },
          onResize: (phase) => {
            const resizePhase = typeof phase === 'string' ? phase : '';
            const aspectLocked = refs.svgBox?.dataset?.resizerAspectLocked === 'true';
            console.debug('Debug: line layout onResize schedule trigger', { phase: resizePhase || null, aspectLocked });
            if(resizePhase === 'observe' && Date.now() <= lineSuppressResizeObserveUntil){
              console.debug('Debug: line resize observe ignored during controlled layout/data load');
              return;
            }
            scheduleLineNoticeWidth('resize');
            scheduleLineViewRefresh('resize', {
              force: true,
              skipThresholdEvaluation: true,
              resizePhase: resizePhase || null,
              silentOverlay: true
            });
          }
        }
      }));
    if(layoutManager?.elements?.svgBox){
      refs.svgBox = layoutManager.elements.svgBox;
    }
    lineSvgBoxRef = refs.svgBox;
    layoutManager?.setScheduleDraw?.(scheduleLineDraw);
    lineSuppressResizeObserveUntil = Date.now() + 750;
    layoutManager?.syncPanels?.({ skipSchedule: true, source: 'line-setup-layout' });
    scheduleLineNoticeWidth('init');
    ensureLineResizerControls();
    Shared.componentLifecycle?.scheduleComponentFrame?.(line, 'line', {
      tabId: getLineProjectionTabId() || null,
      reason: 'line-resizer-controls'
    }, () => ensureLineResizerControls());
    if(layoutManager && typeof layoutManager.updateSvgBox === 'function'){
      const originalUpdateSvgBox = layoutManager.updateSvgBox.bind(layoutManager);
      layoutManager.updateSvgBox = node => {
        originalUpdateSvgBox(node);
        if(node){
          refs.svgBox = node;
        }else if(layoutManager.elements?.svgBox){
          refs.svgBox = layoutManager.elements.svgBox;
        }
        lineSvgBoxRef = refs.svgBox;
        ensureLineResizerControls();
        scheduleLineNoticeWidth('update-svgbox');
      };
    }

    console.debug('Debug: line initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
    if(typeof Shared.hot?.createStandardTable !== 'function'){
      console.error('line initHot missing Shared.hot.createStandardTable');
      return;
    }
    const data = seedLineDefaultHeaderRow(Shared.createEmptyData(DEFAULT_ROWS, LINE_DEFAULT_COLS));
    const scheduleLineDrawProxy = (payload) => {
      if(getLineViewState().viewMode === '3d' || refs.replicateMode?.value === '3d'){
        scheduleLine3dDatasetSync('table-change');
      }
      // Forward the hot factory's schedule payload (reason / invalidate / source /
      // userInitiated) instead of dropping it — matching the other components'
      // proxies (e.g. scatter/pca). This preserves the shared lifecycle reason so
      // user edits invalidate cache and draw normally after reopen/recovery.
      const meta = payload && typeof payload === 'object'
        ? payload
        : (typeof payload === 'string' ? { reason: payload } : {});
      scheduleActiveLineDraw({ ...meta, reason: meta.reason || 'hot-change' });
    };

    const createLineTable = (container) => {
      let instance = null;
      instance = Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: LINE_DEFAULT_COLS }, scheduleLineDrawProxy, {
        debugLabel: 'line',
        data,
        // Line owns first-column pinning because 3D X/Y/Z dataset blocks must scroll as
        // complete, unpinned triplets. The shared table factory's static pinFirstColumn
        // option cannot vary by tab/table-format during same-component reuse.
        pinFirstColumn: false,
        pinFirstRow: true,
        colDefEnhancer(def, meta){
          const colIndex = Number(meta?.colIndex);
          if(!Number.isInteger(colIndex) || !def || typeof def !== 'object'){
            return def;
          }
          const existingColSpan = def.colSpan;
          def.colSpan = params => {
            const physicalRow = params?.data?.__rowIndex;
            if(physicalRow === LINE_3D_DATASET_HEADER_ROW_INDEX && isLine3dTableActive(instance)){
              const role = getLine3dHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'datasetAnchor'){
                return LINE_3D_COLS_PER_DATASET;
              }
            }
            if(physicalRow === 0 && isLineGroupedModeActive(instance)){
              const role = getLineGroupedHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'groupAnchor'){
                return getLineGroupedReplicateCount({ hotInstance: instance });
              }
            }
            if(typeof existingColSpan === 'function'){
              return existingColSpan(params);
            }
            return Number.isFinite(existingColSpan) && existingColSpan > 0
              ? Math.floor(existingColSpan)
              : 1;
          };
          const existingCellStyle = def.cellStyle;
          def.cellStyle = params => {
            let baseStyle = {};
            if(typeof existingCellStyle === 'function'){
              const resolved = existingCellStyle(params);
              if(resolved && typeof resolved === 'object'){
                baseStyle = Object.assign({}, resolved);
              }
            }else if(existingCellStyle && typeof existingCellStyle === 'object'){
              baseStyle = Object.assign({}, existingCellStyle);
            }
            const physicalRow = params?.data?.__rowIndex;
            if(physicalRow === LINE_3D_DATASET_HEADER_ROW_INDEX && isLine3dTableActive(instance)){
              const role = getLine3dHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'datasetAnchor'){
                baseStyle.textAlign = 'center';
                baseStyle.justifyContent = 'center';
                baseStyle.fontWeight = '600';
              }else if(role === 'datasetFollower'){
                baseStyle.textAlign = 'center';
                baseStyle.justifyContent = 'center';
              }
            }else if(physicalRow === LINE_3D_AXIS_HEADER_ROW_INDEX && isLine3dTableActive(instance)){
              baseStyle.textAlign = 'center';
              baseStyle.justifyContent = 'center';
              baseStyle.fontWeight = '500';
            }else if(physicalRow === 0 && isLineGroupedModeActive(instance)){
              const role = getLineGroupedHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'xAnchor' || role === 'groupAnchor'){
                baseStyle.textAlign = 'center';
                baseStyle.justifyContent = 'center';
                baseStyle.fontWeight = '600';
              }else if(role === 'groupFollower'){
                baseStyle.textAlign = 'center';
                baseStyle.justifyContent = 'center';
              }
            }
            return baseStyle;
          };
          const existingHeaderClass = def.headerClass;
          def.headerClass = params => {
            const classes = [];
            const pushClass = value => {
              if(!value){
                return;
              }
              if(Array.isArray(value)){
                value.forEach(pushClass);
                return;
              }
              if(typeof value === 'string'){
                value.split(/\s+/).filter(Boolean).forEach(token => classes.push(token));
              }
            };
            if(typeof existingHeaderClass === 'function'){
              pushClass(existingHeaderClass(params));
            }else{
              pushClass(existingHeaderClass);
            }
            if(isLine3dTableActive(instance)){
              const role = getLine3dHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'datasetAnchor' || role === 'datasetFollower'){
                classes.push('line-3d-colheader');
                const segment = getLine3dHeaderMergeSegment(colIndex, { hotInstance: instance });
                if(segment === 'start'){
                  classes.push('line-3d-colheader-merge-start');
                }else if(segment === 'middle'){
                  classes.push('line-3d-colheader-merge-middle');
                }else if(segment === 'end'){
                  classes.push('line-3d-colheader-merge-end');
                }
              }
            }else if(isLineGroupedModeActive(instance)){
              const role = getLineGroupedHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'groupAnchor' || role === 'groupFollower'){
                classes.push('line-group-colheader');
                const segment = getLineGroupedHeaderMergeSegment(colIndex, { hotInstance: instance });
                if(segment === 'start'){
                  classes.push('line-group-colheader-merge-start');
                }else if(segment === 'middle'){
                  classes.push('line-group-colheader-merge-middle');
                }else if(segment === 'end'){
                  classes.push('line-group-colheader-merge-end');
                }
              }
            }
            return classes;
          };
          const existingEditable = def.editable;
          def.editable = params => {
            const physicalRow = params?.data?.__rowIndex;
            if(physicalRow === LINE_3D_DATASET_HEADER_ROW_INDEX && isLine3dTableActive(instance)){
              const role = getLine3dHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'datasetFollower'){
                return false;
              }
            }
            if(physicalRow === 0){
              const role = getLineGroupedHeaderCellRole(colIndex, { hotInstance: instance });
              if(role === 'groupFollower'){
                return false;
              }
            }
            return typeof existingEditable === 'function'
              ? existingEditable(params)
              : existingEditable !== false;
          };
          const existingRules = def.cellClassRules && typeof def.cellClassRules === 'object'
            ? Object.assign({}, def.cellClassRules)
            : {};
          existingRules['line-3d-header-anchor'] = params => {
            if(params?.data?.__rowIndex !== LINE_3D_DATASET_HEADER_ROW_INDEX){
              return false;
            }
            return getLine3dHeaderCellRole(colIndex, { hotInstance: instance }) === 'datasetAnchor';
          };
          existingRules['line-3d-header-follower'] = params => {
            if(params?.data?.__rowIndex !== LINE_3D_DATASET_HEADER_ROW_INDEX){
              return false;
            }
            return getLine3dHeaderCellRole(colIndex, { hotInstance: instance }) === 'datasetFollower';
          };
          existingRules['line-3d-header-merge-start'] = params => {
            if(params?.data?.__rowIndex !== LINE_3D_DATASET_HEADER_ROW_INDEX){
              return false;
            }
            return getLine3dHeaderMergeSegment(colIndex, { hotInstance: instance }) === 'start';
          };
          existingRules['line-3d-header-merge-middle'] = params => {
            if(params?.data?.__rowIndex !== LINE_3D_DATASET_HEADER_ROW_INDEX){
              return false;
            }
            return getLine3dHeaderMergeSegment(colIndex, { hotInstance: instance }) === 'middle';
          };
          existingRules['line-3d-header-merge-end'] = params => {
            if(params?.data?.__rowIndex !== LINE_3D_DATASET_HEADER_ROW_INDEX){
              return false;
            }
            return getLine3dHeaderMergeSegment(colIndex, { hotInstance: instance }) === 'end';
          };
          existingRules['line-3d-axis-header'] = params => {
            return params?.data?.__rowIndex === LINE_3D_AXIS_HEADER_ROW_INDEX && isLine3dTableActive(instance);
          };
          existingRules['line-grouped-header-anchor'] = params => {
            if(params?.data?.__rowIndex !== 0){
              return false;
            }
            const role = getLineGroupedHeaderCellRole(colIndex, { hotInstance: instance });
            return role === 'xAnchor' || role === 'groupAnchor';
          };
          existingRules['line-grouped-header-follower'] = params => {
            if(params?.data?.__rowIndex !== 0){
              return false;
            }
            return getLineGroupedHeaderCellRole(colIndex, { hotInstance: instance }) === 'groupFollower';
          };
          existingRules['line-grouped-header-merge-start'] = params => {
            if(params?.data?.__rowIndex !== 0){
              return false;
            }
            return getLineGroupedHeaderMergeSegment(colIndex, { hotInstance: instance }) === 'start';
          };
          existingRules['line-grouped-header-merge-middle'] = params => {
            if(params?.data?.__rowIndex !== 0){
              return false;
            }
            return getLineGroupedHeaderMergeSegment(colIndex, { hotInstance: instance }) === 'middle';
          };
          existingRules['line-grouped-header-merge-end'] = params => {
            if(params?.data?.__rowIndex !== 0){
              return false;
            }
            return getLineGroupedHeaderMergeSegment(colIndex, { hotInstance: instance }) === 'end';
          };
          def.cellClassRules = existingRules;
          return def;
        },
        hotOptions: {
          stretchH: 'all',
          afterChange(changes, source){
            if(changes && source !== 'loadData'){
              const affectsAnalysis = instance?.changesAffectAnalysis?.(changes) !== false;
              const groupedHeaderTouched = changes.some(change => Number(change?.[0]) === 0);
              const threeDHeaderTouched = changes.some(change => {
                const row = Number(change?.[0]);
                return row === LINE_3D_DATASET_HEADER_ROW_INDEX || row === LINE_3D_AXIS_HEADER_ROW_INDEX;
              });
              if(isLine3dTableActive(instance)){
                if(threeDHeaderTouched && source !== 'line-3d-header-normalize'){
                  normalizeLine3dDatasetHeaderRows(instance, { source: 'line-3d-header-normalize' });
                }
                if(threeDHeaderTouched){
                  syncLine3dSeriesLabelsFromHeader(instance, {
                    reason: `line-afterChange:${source}`,
                    persist: true
                  });
                }
                syncLine3dAxisHeadersFromTable(changes, source, { hot: instance });
                updateLineNestedHeaders(instance);
              }else if(isLineGroupedModeActive(instance)){
                if(groupedHeaderTouched && source !== 'line-grouped-header-normalize'){
                  normalizeLineGroupedHeaderRow(instance, { source: 'line-grouped-header-normalize' });
                }
                updateLineNestedHeaders(instance);
                if(groupedHeaderTouched){
                  syncLineSeriesGroupLabelsFromHeader(instance, {
                    reason: `line-afterChange:${source}`,
                    refreshControls: true,
                    colCount: typeof instance?.countCols === 'function' ? instance.countCols() : undefined
                  });
                }
              }
              if(affectsAnalysis){
                revalidateActiveLineLogAxis('x','data-edit');
                revalidateActiveLineLogAxis('y','data-edit');
              }
            }
            if(changes){
              syncLineActiveDataViewFromHot(instance, 'afterChange');
            }
          },
          afterLoadData(){
            if(isLine3dTableActive(instance)){
              normalizeLine3dDatasetHeaderRows(instance, { source: 'line-3d-header-normalize' });
              updateLineNestedHeaders(instance);
              syncLine3dSeriesLabelsFromHeader(instance, {
                reason: 'line-afterLoadData',
                persist: true
              });
            }else if(isLineGroupedModeActive(instance)){
              normalizeLineGroupedHeaderRow(instance, { source: 'line-grouped-header-normalize' });
              updateLineNestedHeaders(instance);
              syncLineSeriesGroupLabelsFromHeader(instance, {
                reason: 'line-afterLoadData',
                refreshControls: true,
                colCount: typeof instance?.countCols === 'function' ? instance.countCols() : undefined
              });
            }
            syncLineActiveDataViewFromHot(instance, 'afterLoadData');
          },
          afterSelectionEnd(){
            activateLineDataToolbar('table-selection');
          },
          afterCreateRow(){
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterCreateCol(index, amount, source){
            if(isLine3dTableActive(instance)){
              normalizeLine3dDatasetHeaderRows(instance, { source: 'line-3d-header-normalize' });
              updateLineNestedHeaders(instance);
            }else if(isLineGroupedModeActive(instance)){
              normalizeLineGroupedHeaderRow(instance, { source: 'line-grouped-header-normalize' });
              updateLineNestedHeaders(instance);
            }else{
              remapLineSingleSeriesStructureForColumnSplice(instance, index, 0, amount, source || 'line-column-insert');
            }
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterRemoveRow(){
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterRemoveCol(index, amount, _removedCols, source){
            if(isLine3dTableActive(instance)){
              normalizeLine3dDatasetHeaderRows(instance, { source: 'line-3d-header-normalize' });
              updateLineNestedHeaders(instance);
            }else if(isLineGroupedModeActive(instance)){
              normalizeLineGroupedHeaderRow(instance, { source: 'line-grouped-header-normalize' });
              updateLineNestedHeaders(instance);
            }else{
              remapLineSingleSeriesStructureForColumnSplice(instance, index, amount, 0, source || 'line-column-remove');
            }
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterColumnMove(_moved, _finalIndex, _dropIndex, _possible, orderChanged, permutationOldByNew, source){
            if(orderChanged && Array.isArray(permutationOldByNew)){
              remapLineSingleSeriesStructureForColumnPermutation(instance, permutationOldByNew, source || 'line-column-reorder');
              syncLineActiveDataViewFromHot(instance, 'afterChange');
            }
          },
          afterUndo(){
          },
          afterRedo(){
          }
        }
      });
      if(instance){
        instance.__lineHostContainer = container || null;
        refs.hot = instance;
      }
      if(instance && typeof instance.addHook === 'function'){
        instance.addHook('afterRender', () => {
          if(lineReplicates > 1){
            applyLineNestedHeaderEditors();
          }
        });
      }
      return instance;
    };
    const ensureLineHotForActiveTab = () => {
      const wrapper = refs.hotWrapper || refs.root?.querySelector?.('#lineHotWrapper') || getLineNodeById('lineHotWrapper');
      const baseContainer = refs.hotContainer || refs.root?.querySelector?.('#lineHot') || getLineNodeById('lineHot');
      const tableTabId = Shared.hot?.resolveTableTabId?.({
        type: 'line',
        component: line,
        wrapper,
        container: baseContainer,
        reason: 'line-ensure-hot'
      }) || null;
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        const fallbackHot = lineFallbackHotManager && (!tableTabId || String(lineFallbackHotManager.__lineTabId || '') === String(tableTabId))
          ? lineFallbackHotManager
          : null;
        let hot = getActiveLineHotManager({ allowFallback: false }) || fallbackHot;
        if(!hot){
          hot = createLineTable(baseContainer);
        }
        refs.hotContainer = baseContainer;
        if(hot){
          hot.__lineHostContainer = baseContainer;
          hot.__lineTabId = tableTabId;
          setActiveLineHotManager(hot);
          applyLineTableFormatToHot(hot, { reason: 'line-ensure-hot' });
          ensureLineDataViewsForHot(hot, {
            wrapper,
            container: baseContainer
          });
          syncLineActiveDataViewFromHot(hot, 'ensure-active-tab');
        }
        return hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'line',
        tabId: tableTabId,
        wrapper,
        container: baseContainer,
        createInstance: createLineTable
      });
      const hot = entry?.instance || getActiveLineHotManager({ allowFallback: false }) || null;
      if(entry?.instance){
        refs.hotContainer = entry.container || baseContainer;
      }
      if(hot){
        hot.__lineHostContainer = entry?.container || baseContainer;
        hot.__lineTabId = entry?.tabId || tableTabId;
        setActiveLineHotManager(hot);
        applyLineTableFormatToHot(hot, { reason: 'line-ensure-hot' });
        ensureLineDataViewsForHot(hot, {
          wrapper,
          container: entry?.container || baseContainer
        });
        syncLineActiveDataViewFromHot(hot, 'ensure-active-tab');
      }

      return hot;
    };
    setActiveLineHotManager(ensureLineHotForActiveTab());
    line.__ensureHotForActiveTab = ensureLineHotForActiveTab;
    if(projectedLineSession){
      ensureLineSessionOwnershipShape(projectedLineSession);
      rememberLineSessionEphemera(projectedLineSession);
    }
    bindLineDataToolbar();
    if(typeof global.DEBUG_LINE === 'undefined') global.DEBUG_LINE = false;
    console.debug('Debug: lineHot initialized',{rows:DEFAULT_ROWS,cols:LINE_DEFAULT_COLS});

    getActiveLineLayoutManager()?.setScheduleDraw?.(scheduleLineDraw);
    getActiveLineLayoutManager()?.syncPanels?.();
    if(!getActiveLineAutoDrawManager() && Shared.hot?.createAutoDrawManager){
      setActiveLineAutoDrawManager(Shared.hot.createAutoDrawManager({
        component: 'line',
        state: getLineAutoDrawState(),
        thresholds: {
          rows: LINE_AUTO_DRAW_ROW_THRESHOLD,
          cols: LINE_AUTO_DRAW_COL_THRESHOLD,
          cells: LINE_AUTO_DRAW_CELL_THRESHOLD
        },
        getHot: () => getActiveLineHotManager() || (typeof ensureLineHotForActiveTab === 'function' ? ensureLineHotForActiveTab() : null),
        elements: {
          renderRow: () => refs.renderRow,
          renderButton: () => refs.renderButton,
          notice: () => refs.autoDrawNotice
        },
        debugLog: lineDebug
      }));
    }
    applyLineReplicateChange(lineReplicates, { sourceReplicates: lineReplicates, skipDraw: true });

    refs.loadExample?.addEventListener('click',()=>{
      const is3dMode = getLineViewState().viewMode === '3d' || refs.replicateMode?.value === '3d' || refs.viewMode?.value === '3d';
      if(is3dMode){
        const example = Shared.exampleDatasets?.get?.('line', 'threeD');
        if(!example || !Array.isArray(example.data)){
          console.warn('line 3d example load skipped: biomedical example registry unavailable');
          return;
        }
        const exampleMeta = example.meta || {};
        lineSuppressResizeObserveUntil = Date.now() + 750;
        markLineOverlayPending('example-data');
        enterLine3dMode({ skipDraw: true });
        const hot = getActiveLineHotManager();
        patchLineGroupedState(getLineProjectionSession({ reason: 'line-projection-mutation' }), {
          labels: Array.isArray(exampleMeta.groupLabels) ? exampleMeta.groupLabels.slice() : [],
          shapes: LINE_GROUP_SHAPE_DEFAULTS.slice(0, Number(exampleMeta.seriesCount) || 1).map((shape, idx)=>sanitizeLineGroupShape(shape, idx))
        }, { reason: 'line-3d-example-grouped' });
        if(hot && Array.isArray(example?.data)){
          hot.loadData(example.data, {
            source: 'example-load',
            suppressSchedule: true,
            recordUndo: true,
            undoLabel: 'table:line:example-load'
          });
          applyLineTableFormatToHot(hot, {
            reason: 'line-3d-example-load',
            tableFormat: '3d'
          });
        }
        Shared.exampleDatasets?.applyNotesState?.(notesState, example);
        rememberLineSessionState(getLineProjectionTabId() || null, { reason: 'line-3d-example-load' }, { readControls: true });
        console.debug('Debug: line 3d example loaded',{ key: 'threeD', seriesCount: exampleMeta.seriesCount });
        scheduleActiveLineDraw({ force: true, reason: 'line-3d-example-load' });
        return;
      }
      const isGroupedMode = refs.replicateMode?.value === 'grouped';
      const key = isGroupedMode ? 'groupedDoseResponse' : 'standard';
      const example = Shared.exampleDatasets?.get?.('line', key)
        || Shared.exampleDatasets?.get?.('line', 'standard');
      if(!example || !Array.isArray(example.data)){
        console.warn('line example load skipped: biomedical example registry unavailable', { key });
        return;
      }
      const exampleMeta = example.meta || {};
      lineSuppressResizeObserveUntil = Date.now() + 750;
      markLineOverlayPending('example-data');
      const exampleReplicates = Math.max(1, Number(exampleMeta.replicates) || 1);
      const exampleSeriesCount = Math.max(1, Number(exampleMeta.seriesCount) || 1);
      const exampleGroupLabels = Array.isArray(exampleMeta.groupLabels) ? exampleMeta.groupLabels.slice() : [];
      applyLineReplicateChange(exampleReplicates,{
        dataOverride: example.data,
        sourceReplicates: exampleReplicates,
        skipDraw: true,
        skipTableProjection: true,
        minSeriesCount: exampleSeriesCount,
        groupLabels: exampleGroupLabels,
        groupShapes: LINE_GROUP_SHAPE_DEFAULTS.slice(0, exampleSeriesCount)
      });
      const hot = getActiveLineHotManager();
      if(hot && Array.isArray(example?.data)){
        hot.loadData(example.data, {
          source: 'example-load',
          suppressSchedule: true,
          recordUndo: true,
          undoLabel: 'table:line:example-load'
        });
        syncLineSeriesLabelState(exampleGroupLabels, {
          reason: 'line-example-metadata',
          refreshControls: true
        });
      }
      Shared.exampleDatasets?.applyNotesState?.(notesState, example);
      rememberLineSessionState(getLineProjectionTabId() || null, { reason: 'line-example-load' }, { readControls: true });
      console.debug('Debug: line example loaded',{ key, replicates: exampleReplicates, mode: isGroupedMode ? 'grouped' : 'single' });
      scheduleActiveLineDraw({ force: true, reason: 'line-example-load' });
    });
    bindLineControlHandler(refs.importBtn, 'click', 'import-table', ()=>{ if(refs.fileInput){ refs.fileInput.value=''; refs.fileInput.click(); } });
    bindLineControlHandler(refs.fileInput, 'change', 'import-file', async e=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('line import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const fileName = e.target.files?.[0]?.name || '';
      const hasFile = !!(e.target.files && e.target.files[0]);
      const importHot = getActiveLineHotManager();
      const importOwnerTabId = String(importHot?.__lineTabId || getLineProjectionTabId() || '').trim() || null;
      let forcedOverlay = false;
      if(hasFile){
        forcedOverlay = !!forceLineOverlay({ reason: 'file-import', tabId: importOwnerTabId }, { message: 'Importing table data...' });
        markLineOverlayPending({ reason: 'file-import', tabId: importOwnerTabId });
      }
      console.debug('Debug: line import start',{fileName}); // Debug: import start trace
      try{
        const applyLinePrismStyle = style => {
          if(!style || typeof style !== 'object'){
            return;
          }
          const title = style.title != null ? String(style.title).trim() : '';
          const xLabel = style.xLabel != null ? String(style.xLabel).trim() : '';
          const yLabel = style.yLabel != null ? String(style.yLabel).trim() : '';
          const fontFamily = style.fontFamily != null ? String(style.fontFamily).trim() : '';
          const fontColor = style.fontColor != null ? String(style.fontColor).trim() : '';
          const axisColor = style.axisColor != null ? String(style.axisColor).trim() : '';
          const fontSizeValue = Number(style.fontSize);
          if(title){
            lineTitleText = title;
          }
          if(xLabel){
            lineXLabelText = xLabel;
          }
          if(yLabel){
            lineYLabelText = yLabel;
          }
          if(Number.isFinite(fontSizeValue) && fontSizeValue > 0 && refs.fontSize){
            refs.fontSize.value = String(fontSizeValue);
            if(refs.fontSize.dataset){
              refs.fontSize.dataset.fontBasePt = String(fontSizeValue);
            }
            chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: fontSizeValue, input: refs.fontSize, manual: true });
          }
          if(axisColor){
            updateLineAxisColor(axisColor);
          }
          if(fontFamily || fontColor){
            const graphStyle = {};
            if(fontFamily){
              graphStyle.fontFamily = fontFamily;
            }
            if(fontColor){
              graphStyle.fill = fontColor;
            }
            importFontStyles('line', { __graph__: graphStyle }, { tabId: getLineProjectionTabId() || getLineActiveSessionForState()?.tabId || null });
          }
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: line prism style applied', { title, xLabel, yLabel, fontFamily, fontSize: fontSizeValue, fontColor, axisColor });
          }
          scheduleActiveLineDraw({ force: true, reason: 'import-prism-style', skipThresholdEvaluation: true });
        };
        const result = await tableImport.openFile(refs.fileInput,{
          hot: importHot,
          minCols: LINE_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: (meta = {}) => {
            const tabId = meta.tabId || importOwnerTabId;
            markLineOverlayPending({ reason: 'file-import', tabId });
            scheduleActiveLineDraw({ ...meta, tabId, force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'line',
          onPrismStyle: applyLinePrismStyle,
          onProcessed: info => {
            console.debug('Debug: line tableImport processed', info || {}); // Debug: processed callback
          },
          onBeforeCompleted: result => {
            const prismMeta = result?.prismMeta;
            if(prismMeta?.kind !== 'line'){
              return;
            }
            const replicateCount = clampLineReplicateCount(prismMeta.replicatesCount || LINE_MIN_REPLICATES);
            const groupLabels = Array.isArray(prismMeta.groupLabels) ? prismMeta.groupLabels : null;
            if(getLineViewState().viewMode === '3d' || refs.replicateMode?.value === '3d'){
              exitLine3dMode({ skipDraw: true });
            }
            lineReplicates = replicateCount;
            if(lineReplicates > LINE_MIN_REPLICATES){
              lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
            }
            if(groupLabels?.length){
              lineSeriesGroupLabels = groupLabels.slice();
              lineLegendLayoutInfo.entryCount = groupLabels.length;
            }
            if(refs.replicatesInput){
              refs.replicatesInput.value = String(lineReplicates);
            }
            updateLineReplicateModeControls();
            if(getActiveLineHotManager()){
              applyLineTableFormatToHot(getActiveLineHotManager(), { reason: 'line-import-prism' });
            }
          },
          onCompleted: (_result, meta = {}) => {
            const renderReason = 'import-load';
            const tabId = meta.tabId || importOwnerTabId;
            markLineOverlayPending({ reason: renderReason, tabId });
            forceLineOverlay({ reason: renderReason, tabId }, { message: 'Rendering line graph...' });
          },
          onOwnerInactive: (_result, meta) => {
            resolveLineOverlay({ reason: 'file-import-owner-inactive', tabId: meta?.tabId || importOwnerTabId || null });
          }
        });
        if(!result && forcedOverlay){
          resolveLineOverlay({ reason: 'file-import-empty', tabId: importOwnerTabId || null });
        }
        console.debug('Debug: line import finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        if(forcedOverlay){
          resolveLineOverlay({ reason: 'file-import-error', tabId: importOwnerTabId || null });
        }
        console.error('line import failed',err);
      }
    });

    if(refs.plot){
      const container=refs.plot.closest('.svgbox')||refs.plot.parentElement;
      if(!container){
        console.debug('Debug: line resizer container missing', { hasContainer: !!container });
      }
      refs.plot.addEventListener('mouseleave', handleLinePlotMouseLeave);
    }
    if(refs.renderButton){
      refs.renderButton.addEventListener('click', () => {
        lineDebug('Debug: line manual render button');
        const overlayReason = 'manual-render';
        markLineOverlayPending(overlayReason);
        forceLineOverlay(overlayReason, { message: 'Rendering line graph...' });
        scheduleActiveLineDraw({ force: true, reason: 'manual-render' });
      });
    }

    getActiveLineLayoutManager()?.setScheduleDraw?.(scheduleLineDraw);

    syncLineRuntimeControlsFromRefs();
    syncLineRuntimeControlsFromState(getActiveLineRuntimeControls({ reason: 'line-init-controls' }));
    refs.border?.addEventListener('input',()=>{ scheduleLineViewRefresh('line-border-change'); });
    refs.borderWidth?.addEventListener('input',()=>{ scheduleLineViewRefresh('line-border-width-change'); });
    refs.errorBarWidth?.addEventListener('input',()=>{
      syncLineErrorBarToolbarValue();
      console.debug('Debug: line errorBarWidth change',{ value: refs.errorBarWidth.value });
      scheduleLineViewRefresh('line-errorbar-width-change');
    });
    refs.dotSize?.addEventListener('input',()=>{ scheduleLineViewRefresh('line-dot-size-change'); });
    refs.alpha?.addEventListener('input',()=>{ if(refs.alphaVal) refs.alphaVal.textContent=refs.alpha.value; scheduleLineViewRefresh('line-alpha-change'); });
    refs.fontSize?.addEventListener('input',()=>{
      if(refs.fontSize?.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        console.debug('Debug: line font size input manual set',{ value: refs.fontSize.value }); // Debug: manual slider update
      }
      if(refs.fontSizeVal){
        chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
      }
      scheduleLineViewRefresh('line-font-size-change');
    });
    refs.showGrid?.addEventListener('change',()=>{ console.debug('Debug: line showGrid change',{checked:refs.showGrid.checked}); scheduleLineViewRefresh('line-grid-toggle'); });
    refs.showFrame?.addEventListener('change',()=>{ console.debug('Debug: line showFrame change',{checked:refs.showFrame.checked}); scheduleLineViewRefresh('line-frame-toggle'); });
    const handleLineLogToggle=(axis,checkbox)=>{
      checkbox?.addEventListener('change',()=>{
        const enabling=!!checkbox.checked;
        if(enabling){
          const validation=validateLineLogAxis(axis);
          if(!validation.allowed){
            if(validation.canUsePlusOne && validation.hasZeros && !validation.hasNegatives){
              const axisLabel=axis==='x'?'X':'Y';
              const useLogPlusOne = global.confirm(`Your data contains zero values on the ${axisLabel} axis. Would you like to add +1 to all values before log transform?\n\nThis will plot log(x+1) instead of log(x).`);
              if(useLogPlusOne){
                if(axis==='x'){
                  lineLogPlusOneX = true;
                }else{
                  lineLogPlusOneY = true;
                }
                clearLineLogWarning();
                console.debug('Debug: line log+1 enabled by user confirmation',{ axis });
                scheduleLineViewRefresh(`line-log-${axis}-toggle`);
                return;
              }else{
                checkbox.checked = false;
                if(axis==='x'){
                  lineLogPlusOneX = false;
                }else{
                  lineLogPlusOneY = false;
                }
                console.debug('Debug: line log scale cancelled by user',{ axis });
                return;
              }
            }
            checkbox.checked=false;
            const warningMessage=validation.message||`Cannot enable log scale on the ${axis==='x'?'X':'Y'} axis while non-positive values are present.`;
            showLineLogWarning(warningMessage);
            console.warn('line log axis blocked',{ axis, reason: validation.reason, value: validation.value });
            return;
          }
          if(axis==='x'){
            lineLogPlusOneX = false;
          }else{
            lineLogPlusOneY = false;
          }
          clearLineLogWarning();
        }else{
          if(axis==='x'){
            lineLogPlusOneX = false;
          }else{
            lineLogPlusOneY = false;
          }
          clearLineLogWarning();
        }
        console.debug('Debug: line log toggle change',{ id: checkbox.id, checked: checkbox.checked });
        scheduleLineViewRefresh(`line-log-${axis}-toggle`);
      });
    };
    handleLineLogToggle('x',refs.logX);
    handleLineLogToggle('y',refs.logY);
    const lineAxisInputs=[
      { el: refs.xMin, axis: 'x', context: 'axis-min-input', logLabel: 'lineXMin changed' },
      { el: refs.xMax, axis: 'x', context: 'axis-max-input', logLabel: 'lineXMax changed' },
      { el: refs.yMin, axis: 'y', context: 'axis-min-input', logLabel: 'lineYMin changed' },
      { el: refs.yMax, axis: 'y', context: 'axis-max-input', logLabel: 'lineYMax changed' },
      { el: refs.originX, axis: 'x', context: 'origin-input', logLabel: 'lineOriginX changed' },
      { el: refs.originY, axis: 'y', context: 'origin-input', logLabel: 'lineOriginY changed' }
    ];
    lineAxisInputs.forEach(({el,axis,context,logLabel})=>{
      if(!el){
        return;
      }
      el.addEventListener('input',()=>{
        lineDebug(logLabel, el.value);
        const logActive = axis === 'x' ? refs.logX?.checked : refs.logY?.checked;
        if(logActive && isLineLogAxisInputInProgress(el)){
          if(lineDebugEnabled()){
            console.debug('Debug: line log axis validation deferred',{ axis, context, value: el.value });
          }
          scheduleLineViewRefresh(`${context}-deferred`);
          return;
        }
        if(!revalidateActiveLineLogAxis(axis,context)){
          return;
        }
        if(!refs.logX?.checked && !refs.logY?.checked){
          clearLineLogWarning();
        }
        scheduleLineViewRefresh(context);
      });
      el.addEventListener('change',()=>{
        if(!revalidateActiveLineLogAxis(axis,`${context}-change`)){
          return;
        }
        if(!refs.logX?.checked && !refs.logY?.checked){
          clearLineLogWarning();
        }
        scheduleLineViewRefresh(`${context}-change`);
      });
    });
    if(refs.originMode){
      refs.originMode.addEventListener('change',()=>{
        console.debug('Debug: line originMode change',{ value: refs.originMode.value });
        const xOk=revalidateActiveLineLogAxis('x','origin-mode-change');
        const yOk=revalidateActiveLineLogAxis('y','origin-mode-change');
        if(!xOk||!yOk){
          return;
        }
        scheduleLineViewRefresh('line-origin-mode-change');
      });
    }
    refs.statType?.addEventListener('change',()=>{
      requestLineStatsContextRefresh('stat-type-change');
      scheduleLineViewRefresh('line-stat-type-change', { force: true, skipThresholdEvaluation: true });
    });
    refs.showPlotStats?.addEventListener('change', event => {
      const session = getLineSessionForEvent(event, { reason: 'line-show-plot-stats' }, { create: true });
      if(!session || !isLineSessionActive(session)){
        return;
      }
      const control = event?.currentTarget || refs.showPlotStats;
      if(!lineHasComputedStats(session)){
        control.checked = false;
      }
      lineLast2dShowPlotStats = !!control.checked;
      syncLineRuntimeControlsFromRefs({ session, reason: 'line-show-plot-stats' });
      scheduleLineDrawForSession(session, { reason: 'line-show-plot-stats', tabId: session.tabId || undefined, userInitiated: true });
    });

    refs.showTrendLine?.addEventListener('change',e=>{
      const statsReady = lineHasComputedStats();
      if(!statsReady){
        e.target.checked = false;
        syncLineLast2dControlStateFromRefs(getLineProjectionTabId() || null);
        rememberLineOwnedRuntimeRecord(getLineProjectionTabId() || null, { reason: 'line-show-trend-blocked' });
        updateLineRegressionOverlayControlState(false);
        console.debug('Debug: line showTrendLine blocked until stats are calculated');
        return;
      }
      const checked = !!e.target.checked;
      console.debug('Debug: line showTrendLine change',{ checked });
      if(!checked){
        try{
          if(additionalLineControls && typeof additionalLineControls.close === 'function'){
            additionalLineControls.close('line-trendline-toggle-off');
          }
        }catch(err){}
      }
      syncLineLast2dControlStateFromRefs(getLineProjectionTabId() || null);
      rememberLineOwnedRuntimeRecord(getLineProjectionTabId() || null, { reason: 'line-show-trend-change' });
      updateLineRegressionOverlayControlState(true);
      scheduleLineViewRefresh('line-show-trend-change', { force: true, skipThresholdEvaluation: true });
    });
    refs.showIntervals?.addEventListener('change',e=>{
      const statsReady = lineHasComputedStats();
      const controls = resolveLineOverlayControls(getLineProjectionTabId() || null);
      if(!statsReady || !controls.showTrendLine?.checked){
        e.target.checked = false;
        syncLineLast2dControlStateFromRefs(getLineProjectionTabId() || null);
        rememberLineOwnedRuntimeRecord(getLineProjectionTabId() || null, { reason: 'line-show-intervals-blocked' });
        updateLineRegressionOverlayControlState(statsReady);
        console.debug('Debug: line showIntervals blocked', { statsReady, showTrendLine: !!controls.showTrendLine?.checked });
        return;
      }
      console.debug('Debug: line showIntervals change',{checked:e.target.checked});
      syncLineLast2dControlStateFromRefs(getLineProjectionTabId() || null);
      rememberLineOwnedRuntimeRecord(getLineProjectionTabId() || null, { reason: 'line-show-intervals-change' });
      requestLineStatsContextRefresh('intervals-toggle');
      scheduleLineViewRefresh('line-intervals-toggle', { force: true, skipThresholdEvaluation: true });
    });
    refs.showPredictionIntervals?.addEventListener('change',e=>{
      const statsReady = lineHasComputedStats();
      const controls = resolveLineOverlayControls(getLineProjectionTabId() || null);
      if(!statsReady || !controls.showTrendLine?.checked){
        e.target.checked = false;
        syncLineLast2dControlStateFromRefs(getLineProjectionTabId() || null);
        rememberLineOwnedRuntimeRecord(getLineProjectionTabId() || null, { reason: 'line-show-prediction-intervals-blocked' });
        updateLineRegressionOverlayControlState(statsReady);
        console.debug('Debug: line showPredictionIntervals blocked', { statsReady, showTrendLine: !!controls.showTrendLine?.checked });
        return;
      }
      console.debug('Debug: line showPredictionIntervals change',{checked:e.target.checked});
      syncLineLast2dControlStateFromRefs(getLineProjectionTabId() || null);
      rememberLineOwnedRuntimeRecord(getLineProjectionTabId() || null, { reason: 'line-show-prediction-intervals-change' });
      requestLineStatsContextRefresh('prediction-intervals-toggle');
      scheduleLineViewRefresh('line-prediction-intervals-toggle', { force: true, skipThresholdEvaluation: true });
    });
    refs.showLegend?.addEventListener('change',e=>{
      console.debug('Debug: line showLegend change',{checked:e.target.checked});
      ensureLineResizerControls();
      scheduleLineViewRefresh('line-legend-toggle');
    });

    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: getLineNodeById('lineExportControls'),
        getSvg: () => buildLineExportSvg(),
        fileName: 'line',
        contextLabel: 'line-export',
        componentName: 'line'
      });
      console.debug('Debug: line export controls mounted', { hasExporter: true }); // Debug: line export mount
    } else {
      console.debug('Debug: line export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: line export fallback
    }

    refs.openBtn?.addEventListener('click',openLineFile);
    refs.saveBtn?.addEventListener('click',saveLineFile);
    refs.saveAsBtn?.addEventListener('click',saveAsLineFile);
    refs.graphFileInput?.addEventListener('change',e=>{
      const f=e.target.files[0];
      if(f){
        const session = getLineSessionForEvent(e, { reason: 'line-graph-file-input' }, { create: false }) || getLineActiveSessionForState();
        const operationTabId = session?.tabId || getLineProjectionTabId() || null;
        setLineFileNameForSession(f.name, session);
        setLineFileHandleForSession(null, session);
        loadLineGraphFile(f, { tabId: operationTabId });
      }
    });

    const runLineDrawCycle = async (drawOpts = {}) => {
      const drawSession = getLineSession(drawOpts?.tabId || getLineProjectionTabId() || null, {
        tabId: drawOpts?.tabId || getLineProjectionTabId() || null,
        reason: drawOpts?.reason || 'line-draw-cycle'
      }, { create: false }) || projectedLineSession || getLineActiveSessionForState();
      const drawGeneration = Number(drawOpts?.drawGeneration || 0);
      let status = 'complete';
      try{
        const result = await drawLine(drawSession, drawOpts);
        if(result === false){
          status = 'cancelled';
        }
      }catch(err){
        status = 'error';
        throw err;
      }finally{
        const drawTabId = drawSession?.tabId || drawOpts?.tabId || getLineProjectionTabId() || null;
        if(!drawGeneration || drawGeneration === Number(drawSession?.timers?.drawGeneration || 0)){
          setLineDrawPending(drawSession, false, drawGeneration || null);
        }
        resolveLineOverlay({ reason: status, status, tabId: drawTabId });
        Shared.componentLifecycle?.emitLifecycleEvent?.({
          componentKey: 'line',
          tabId: drawTabId,
          action: 'draw-settled',
          reason: drawOpts?.reason || 'line-draw',
          phase: status
        });
      }
    };
    const scheduleLineBase = Shared.componentLifecycle?.createTabScopedFrameDebouncer
      ? Shared.componentLifecycle.createTabScopedFrameDebouncer(line, 'line', runLineDrawCycle, { reason: 'line-draw-frame' })
      : runLineDrawCycle;
    const scheduleLineInstrumented = (opts) => {
      const nextOpts = opts || {};
      const overlayReason = nextOpts.reason || (nextOpts.force || nextOpts.forceOverlay ? 'manual-render' : 'schedule');
      const suppressOverlay = nextOpts.silentOverlay === true || (nextOpts.viewOnly === true && nextOpts.forceOverlay !== true);
      if((nextOpts.force || nextOpts.forceOverlay) && !suppressOverlay){
        markLineOverlayPending({ reason: overlayReason, tabId: nextOpts.tabId || getLineProjectionTabId() || null });
        forceLineOverlay(overlayReason, { tabId: nextOpts.tabId || getLineProjectionTabId() || null, message: 'Rendering line graph...' });
      }else if(!suppressOverlay){
        queueLineOverlay(overlayReason);
      }
      const runSchedule = () => scheduleLineBase(nextOpts);
      if(Shared.componentLifecycle?.runDrawWithOverlayPaintGate?.({
        component: line,
        componentKey: 'line',
        options: nextOpts,
        tabId: nextOpts.tabId || getLineProjectionTabId() || null,
        reason: overlayReason,
        overlayController: lineOverlayController,
        delayForOverlay: !nextOpts.viewOnly,
        debugLog: lineDebug,
        run: runSchedule
      })){
        return;
      }
      runSchedule();
    };
    const lineRawDrawScheduler = Shared.workspaceTabs?.createTabScopedScheduler
      ? Shared.workspaceTabs.createTabScopedScheduler({
          componentKey: 'line',
          debugLabel: 'line',
          getTabId: () => getLineProjectionTabId() || null,
          scheduleRaw: scheduleLineInstrumented
        })
      : scheduleLineInstrumented;
    const schedulerSession = projectedLineSession || getLineActiveSessionForState();
    const autoDrawManager = getLineSessionAutoDrawManager(schedulerSession) || getActiveLineAutoDrawManager();
    let lineDrawScheduler = lineRawDrawScheduler;
    if(autoDrawManager){
      autoDrawManager.setScheduleRaw(lineRawDrawScheduler);
      autoDrawManager.setElements({
        renderRow: refs.renderRow,
        renderButton: refs.renderButton,
        notice: refs.autoDrawNotice
      });
      const autoDrawScheduler = autoDrawManager;
      lineDrawScheduler = (opts) => {
        const manager = getLineSessionAutoDrawManager(schedulerSession, { allowFallback: false }) || autoDrawScheduler;
        if(manager && typeof manager.schedule === 'function'){
          return manager.schedule(opts);
        }
        return lineRawDrawScheduler(opts);
      };
      autoDrawManager.updateUi();
      autoDrawManager.evaluateThresholds();
      syncLineAutoDrawNoticeWidth('auto-draw-init');
    }
    lineFallbackRawDrawScheduler = lineRawDrawScheduler;
    lineFallbackDrawScheduler = lineDrawScheduler;
    getActiveLineLayoutManager()?.setScheduleDraw?.(lineDrawScheduler);
    if(projectedLineSession){
      ensureLineSessionOwnershipShape(projectedLineSession);
      projectedLineSession.managers.autoDraw = getActiveLineAutoDrawManager() || null;
      projectedLineSession.managers.layout = getActiveLineLayoutManager() || null;
      setLineSessionDrawSchedulers(projectedLineSession, {
        drawScheduler: lineDrawScheduler,
        rawDrawScheduler: lineRawDrawScheduler
      });
      projectedLineSession.state = buildLineCanonicalStateFromGlobals(projectedLineSession.tabId, { reason: 'line-setup-session-ephemera' }, { readControls: false });
      rememberLineSessionEphemera(projectedLineSession);
      persistLineSessionState(projectedLineSession, { reason: 'line-setup-session-ephemera' });
    }
    ensureLineFontEventListener();
    console.debug('Debug: line scheduleLineDraw configured via tab-scoped lifecycle frame', { guarded: !!getActiveLineAutoDrawManager() }); // Debug: scheduler setup
    initNotes();
    ensureEmptyPayloadTemplate();
    line.__domSentinel = refs.hotContainer || refs.root?.querySelector?.('#lineHot') || getLineNodeById('lineHot') || null;
    line.ready = true;
    if(projectedLineSession){
      applyLineCanonicalStateToGlobals(projectedLineSession.state, { tabId: targetTabId || getLineProjectionTabId() || null, reason: 'line-setup-state-to-controls' }, { syncControls: true });
      rememberLineSessionEphemera(projectedLineSession);
    }
    if(options.forceInitialDraw === true && targetTabId){
      scheduleActiveLineDraw({ tabId: targetTabId, reason: 'line-setup-initial-draw' });
    }else{
      console.debug('Debug: line setup initial draw skipped until payload/data is ready', {
        reason: options.reason || 'setup',
        restoreRenderCache: options.restoreRenderCache === true,
        forceInitialDraw: options.forceInitialDraw === true
      });
    }
    console.debug('Debug: Components.line.setup complete'); // Debug: setup complete
  }

  function resolveLineRenderCacheSession(meta = {}, options = {}){
    const source = meta && typeof meta === 'object' ? meta : {};
    if(source.session){
      return resolveLineStateSession(source.session);
    }
    const tabLike = source.tab || source.tabId || source.workspaceTabId || getLineProjectionTabId() || null;
    return tabLike
      ? getLineSession(tabLike, { ...(source || {}), reason: source.reason || 'line-render-cache-session' }, { create: options.create === true })
      : getLineActiveSessionForState();
  }

  function bindLinePassiveDomForTab(tabLike = null, meta = {}){
    const targetTabId = resolveLineOwnedRuntimeTabId(tabLike || meta?.tab || meta?.tabId || null, meta) || null;
    const targetRoot = Shared.workspaceTabs?.getMountedRoot?.(tabLike || targetTabId || null, 'line')
      || resolveLineRoot(targetTabId || tabLike || null)
      || null;
    if(!targetTabId || !targetRoot){
      return false;
    }
    line.__boundTabId = targetTabId;
    refs.root = targetRoot;
    const session = bindLineSessionForTab(targetTabId, {
      ...(meta || {}),
      tabId: targetTabId,
      root: targetRoot,
      reason: meta?.reason || 'line-passive-dom-bind'
    }, {
      syncControls: false,
      preserveCurrent: true
    }) || getLineActiveSessionForState();
    const snapshot = bindLineDomRefs(targetRoot, targetTabId);
    if(session){
      session.root = targetRoot;
      session.refs = snapshot;
      if(session.managers?.layout){
        setActiveLineLayoutManager(session.managers.layout);
      }
      if(session.managers?.hot){
        const hot = setActiveLineHotManager(session.managers.hot, { applyActive: true });
        if(hot){
          hot.__lineTabId = targetTabId;
          if(!hot.__lineHostContainer && refs.hotContainer){
            hot.__lineHostContainer = refs.hotContainer;
          }
          applyLineTableFormatToHot(hot, { reason: meta?.reason || 'line-passive-dom-bind-table-format' });
        }
      }
      if(session.managers?.dataViews){
        setActiveLineDataViewsManager(session.managers.dataViews);
      }
      if(session.managers?.autoDraw){
        setActiveLineAutoDrawManager(session.managers.autoDraw);
      }
      session.updatedAt = Date.now();
    }
    line.__domSentinel = refs.hotContainer || targetRoot.querySelector?.('#lineHot') || null;
    line.ready = true;
    lineDebug('Debug: line passive DOM binding refreshed', {
      tabId: targetTabId,
      reason: meta?.reason || 'line-passive-dom-bind',
      hasHot: !!(session?.managers?.hot || getActiveLineHotManager()),
      hasLayout: !!(session?.managers?.layout || getActiveLineLayoutManager())
    });
    return true;
  }

  function ensureLineDomBindings(tabLike, meta = {}){
    if(typeof Shared.workspaceTabs?.ensureActiveDomBindings !== 'function'){
      return false;
    }
    if(isLinePassiveActivationMeta(meta)){
      return bindLinePassiveDomForTab(tabLike, meta);
    }
    const result = Shared.workspaceTabs.ensureActiveDomBindings({
      componentKey: 'line',
      tabLike: tabLike || null,
      sentinelSelector: '#lineHot',
      getCurrentRoot: () => refs.root || null,
      getCurrentSentinel: () => line.__domSentinel || refs.hotContainer || null,
      rebind: ({ root, tab }) => {
        line.ready = false;
        setup({
          ...(meta || {}),
          root: root || undefined,
          tabId: tab?.id || null,
          reason: meta?.reason || 'workspace-dom-rebind'
        });
      }
    });
    return !!result?.rebound;
  }

  function ensureReady(options = {}){
    if(ensureLineDomBindings(options.tab || options.tabId || null, options || {})){
      return;
    }
    if(!line.ready) setup({ ...options, tabId: options.tabId || options.tab?.id || getLineProjectionTabId() || null, reason: options.reason || 'ensure-ready' });
  }

  line.init = setup;
  line.ensure = ensureReady;
  function syncLineActivationControlsFromPayload(tabLike = null){
    const tabId = resolveLineOwnedRuntimeTabId(tabLike || getLineProjectionTabId() || null, {
      reason: 'line-activation-controls-tab'
    }) || null;
    const tab = Shared.workspaceTabs?.resolveTab?.(tabLike || tabId || null)
      || (tabId && typeof global.Main?.session?.getTabById === 'function' ? global.Main.session.getTabById(tabId) : null)
      || (tabLike && typeof tabLike === 'object' ? tabLike : null);
    const payloadConfig = tab?.payload?.config;
    if(!payloadConfig || typeof payloadConfig !== 'object'){
      applyLineLast2dOverlayControls(tabId);
      return;
    }
    const viewMode = String(payloadConfig.viewMode || '').toLowerCase() === '3d' ? '3d' : '2d';
    const controls = resolveLineOverlayControls(tabId);
    if(controls.showTrendLine && Object.prototype.hasOwnProperty.call(payloadConfig, 'showTrendLine')){
      controls.showTrendLine.checked = viewMode === '2d' && !!payloadConfig.showTrendLine;
    }
    const savedConfidence = Object.prototype.hasOwnProperty.call(payloadConfig, 'showConfidenceIntervals')
      ? payloadConfig.showConfidenceIntervals
      : payloadConfig.showIntervals;
    if(controls.showIntervals && savedConfidence !== undefined){
      controls.showIntervals.checked = viewMode === '2d' && !!savedConfidence;
    }
    if(controls.showPredictionIntervals && Object.prototype.hasOwnProperty.call(payloadConfig, 'showPredictionIntervals')){
      controls.showPredictionIntervals.checked = viewMode === '2d' && !!payloadConfig.showPredictionIntervals;
    }
    if(controls.showPlotStats && Object.prototype.hasOwnProperty.call(payloadConfig, 'showPlotStats')){
      controls.showPlotStats.checked = viewMode === '2d' && !!payloadConfig.showPlotStats;
    }
    syncLineLast2dControlStateFromRefs(tabId);
  }
  function syncLineActivationState(tabLike = null, meta = {}){
    const targetTabId = resolveLineOwnedRuntimeTabId(tabLike || meta?.tab || meta?.tabId || getLineProjectionTabId() || null, meta) || getLineProjectionTabId() || null;
    const passive = isLinePassiveActivationMeta({
      ...(meta || {}),
      tabId: targetTabId || meta?.tabId || null
    });
    const session = bindLineSessionForTab(targetTabId || null, {
      ...(meta || {}),
      tabId: targetTabId || null,
      reason: meta?.reason || 'line-activation-bind-session'
    }, { syncControls: false }) || getLineActiveSessionForState();
    if(!passive){ ensureLineResizerControls(); }
    if(!passive && typeof line.__ensureHotForActiveTab === 'function'){
      const hot = line.__ensureHotForActiveTab();
      if(hot){
        ensureLineDataViewsForHot(hot, {
          wrapper: refs.hotWrapper || getLineNodeById('lineHotWrapper') || null,
          container: hot.__lineHostContainer || refs.hotContainer || getLineNodeById('lineHot') || null
        });
        syncLineActiveDataViewFromHot(hot, 'prepare-tab');
      }
    }else if(session?.managers?.hot){
      setActiveLineHotManager(session.managers.hot, { applyActive: true });
    }
    const activeHotForFormat = getActiveLineHotManager({ allowFallback: false }) || session?.managers?.hot || null;
    if(activeHotForFormat){
      applyLineTableFormatToHot(activeHotForFormat, { reason: meta?.reason || 'line-activation-table-format' });
    }
    if(projectedLineSession){
      applyLineCanonicalStateToGlobals(projectedLineSession.state, { ...(meta || {}), tabId: targetTabId || getLineProjectionTabId() || null, reason: meta?.reason || 'line-activation-state-to-controls' }, { syncControls: !passive });
    }else if(!passive){
      syncLineActivationControlsFromPayload(getLineProjectionTabId() || null);
    }
    rehydrateActiveLine3dInteraction(session, 'line-3d-activate');
    line.__domSentinel = refs.hotContainer || refs.root?.querySelector?.('#lineHot') || getLineNodeById('lineHot') || null;
  }

  line.activateTab = Shared.componentLifecycle?.bindTabActivation?.({
    component: line,
    componentKey: 'line',
    resolveRoot: tabLike => Shared.workspaceTabs?.getMountedRoot?.(tabLike || null, 'line')
      || resolveLineRoot(tabLike || getLineProjectionTabId() || null)
      || getLineNodeById('linePage')
      || global.document,
    setRoot: root => { refs.root = root || refs.root || null; },
    ensureBindings: (tabLike, meta) => {
      bindLineSessionForTab(tabLike, { ...(meta || {}), reason: meta?.reason || 'activate-tab-bind-session' }, { syncControls: false });
      return ensureLineDomBindings(tabLike, meta || {});
    },
    init: options => line.init(options),
    afterReady: (tabLike, meta = {}) => {
      if(!line.ready){
        return;
      }
      syncLineActivationState(tabLike, meta || {});
    },
    getSentinel: () => refs.hotContainer || refs.root?.querySelector?.('#lineHot') || getLineNodeById('lineHot') || null
  }) || function activateTab(tab, meta = {}){
    const targetTabId = (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null;
    bindLineSessionForTab(tab || targetTabId, { ...(meta || {}), reason: meta?.reason || 'activate-tab-bind-session' }, { syncControls: false });
    if(ensureLineDomBindings(tab || targetTabId, meta || {})){
      return;
    }
    if(!line.ready){
      line.init({ tabId: targetTabId || undefined, reason: meta?.reason || 'activate-tab' });
      return;
    }
    syncLineActivationState(tab || targetTabId, meta || {});
  };

  function getLineRenderCacheMetadata(cache){
    return cache?.__graphitixRenderCache && typeof cache.__graphitixRenderCache === 'object'
      ? cache.__graphitixRenderCache
      : null;
  }

  function resolveLineGraphCachePayload(cache){
    if(!cache || typeof cache !== 'object'){ return null; }
    const meta = getLineRenderCacheMetadata(cache);
    const preferredKey = typeof meta?.graphicKey === 'string' ? meta.graphicKey : null;
    return (preferredKey && cache[preferredKey]) || cache.plot || cache.preview || cache.graph || cache.svg || cache.stage || null;
  }

  function detachChildren(node){
    return Shared.componentLifecycle?.detachCacheableChildren?.(node) || null;
  }

  function lineFragmentPayloadHasGraph(payload){
    if(!payload || typeof payload !== 'object'){ return false; }
    const fragment = payload.fragment || null;
    if(fragment && typeof fragment.querySelector === 'function'){
      const svg = fragment.querySelector('#lineSvg') || fragment.querySelector('svg');
      if(svg && lineSvgHasMeaningfulContent(svg)){
        return true;
      }
      const canvas = fragment.querySelector('canvas');
      if(canvas && (Number(canvas.width) > 0 || Number(canvas.height) > 0)){
        return true;
      }
    }
    if(payload.__graphitixKind === 'fragment-payload' && Array.isArray(payload.nodes)){
      return payload.nodes.some(node => {
        const markup = String(node?.markup || '');
        return /<svg\b/i.test(markup) || /id=["']lineSvg["']/i.test(markup) || /<canvas\b/i.test(markup);
      });
    }
    return false;
  }

  function lineSvgHasMeaningfulContent(svg){
    if(!svg){ return false; }
    const meaningful = Array.from(svg.children || []).some(child => {
      const name = String(child?.tagName || '').toLowerCase();
      return name && name !== 'defs' && name !== 'style' && name !== 'title' && name !== 'desc';
    });
    return meaningful || String(svg.textContent || '').trim().length > 0;
  }

  function linePlotHasMeaningfulGraph(plot){
    if(!plot || typeof plot.querySelector !== 'function'){ return false; }
    const svg = plot.querySelector('#lineSvg') || plot.querySelector('svg');
    if(svg && lineSvgHasMeaningfulContent(svg)){ return true; }
    const canvas = plot.querySelector('canvas');
    return !!(canvas && (Number(canvas.width) > 0 || Number(canvas.height) > 0));
  }

  function restoreChildren(node, payload){
    if(!node || !payload || !payload.fragment){ return false; }
    const count = Number(payload.count);
    const hasChildNodes = !!(payload.fragment && payload.fragment.childNodes && payload.fragment.childNodes.length);
    if(Number.isFinite(count) && count <= 0 && !hasChildNodes){ return false; }
    while(node.firstChild){
      node.removeChild(node.firstChild);
    }
    node.appendChild(payload.fragment);
    return true;
  }

  function captureLineRenderCacheMetadata(meta = {}, sourceSvg = null){
    const tabId = resolveLineOwnedRuntimeTabId(meta?.tabId || null, meta);
    const svg = sourceSvg || (refs.plot || refs.root?.querySelector?.('#linePlot') || getLineNodeById('linePlot'))?.querySelector?.('#lineSvg') || null;
    const ownerTabId = getLineProjectionTabId() || getLineActiveSessionForState()?.tabId || tabId || null;
    const extra = {
      viewMode: svg?.dataset?.viewMode || null,
      width: svg?.getAttribute?.('width') || '',
      height: svg?.getAttribute?.('height') || '',
      viewBox: svg?.getAttribute?.('viewBox') || ''
    };
    return Shared.renderCacheSchema?.createMetadata?.({ component: 'line', tabId: ownerTabId, complete: false, extra })
      || { version: 2, component: 'line', type: 'line', tabId: ownerTabId, complete: false, ...extra };
  }

  function isCompleteLineRenderCache(cache){
    const graphPayload = resolveLineGraphCachePayload(cache);
    if(!lineFragmentPayloadHasGraph(graphPayload)){ return false; }
    const meta = getLineRenderCacheMetadata(cache);
    return !meta || meta.type === 'line';
  }

  function canRestoreLineRenderCache(cache, meta = {}){
    if(!isCompleteLineRenderCache(cache)){
      lineDebug('Debug: line render cache restore rejected', {
        reason: 'incomplete-or-empty-graph-cache',
        tabId: meta?.tabId || null
      });
      return false;
    }
    const cacheMeta = getLineRenderCacheMetadata(cache);
    if(cacheMeta?.tabId && meta?.tabId && String(cacheMeta.tabId) !== String(meta.tabId)){
      lineDebug('Debug: line render cache restore rejected', {
        reason: 'cache-tab-mismatch',
        cacheTabId: cacheMeta.tabId,
        tabId: meta.tabId
      });
      return false;
    }
    return true;
  }

  function removeLinePreviewIgnoredNodes(root){
    if(!root || typeof root.querySelectorAll !== 'function'){
      return;
    }
    Array.from(root.querySelectorAll('[data-export-ignore="1"]')).forEach(node => {
      try { node.remove(); } catch (_err) {}
    });
  }

  function resolveLinePreviewSourceSvg(tab){
    // Read-only preview source: this may reuse an inactive tab's cache DOM,
    // but restore policy and cache invalidation remain owned by domControls/session.
    const tabId = tab?.id || null;
    const activeTabId = global.Main?.session?.workspaceState?.activeTabId || null;
    const cachePayload = resolveLineGraphCachePayload(tab?.renderCache?.cache || tab?.archiveRenderCache?.cache || null);
    if(tabId && tabId !== activeTabId && cachePayload?.fragment && typeof cachePayload.fragment.querySelector === 'function'){
      const cachedSvg = cachePayload.fragment.querySelector('#lineSvg') || cachePayload.fragment.querySelector('svg');
      if(cachedSvg && lineSvgHasMeaningfulContent(cachedSvg)){
        return cachedSvg;
      }
    }
    const mountedRoot = Shared.workspaceTabs?.getMountedRoot?.(tabId, 'line') || null;
    const mountedSvg = mountedRoot?.querySelector?.('#linePlot #lineSvg, #linePlot svg, .svgbox svg');
    if(mountedSvg && lineSvgHasMeaningfulContent(mountedSvg)){
      return mountedSvg;
    }
    if(!tabId || tabId === activeTabId){
      const plot = refs.plot || refs.root?.querySelector?.('#linePlot') || getLineNodeById('linePlot');
      const liveSvg = plot?.querySelector?.('#lineSvg') || plot?.querySelector?.('svg') || null;
      if(liveSvg && lineSvgHasMeaningfulContent(liveSvg)){
        return liveSvg;
      }
    }
    return null;
  }

  function formatLinePreviewNumber(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return String(value);
    }
    if(Math.abs(numeric) >= 10000){
      return String(Math.round(numeric));
    }
    const rounded = Math.round(numeric * 100) / 100;
    return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function compactLinePreviewNumericString(raw){
    if(typeof raw !== 'string' || !raw){
      return raw;
    }
    return raw.replace(/-?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi, match => formatLinePreviewNumber(match));
  }

  function parseLinePreviewPathPoints(raw){
    if(typeof raw !== 'string' || !raw){
      return null;
    }
    const points = [];
    const re = /([ML])\s*(-?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)\s*,?\s*(-?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)/gi;
    let match;
    while((match = re.exec(raw))){
      const x = Number(match[2]);
      const y = Number(match[3]);
      if(Number.isFinite(x) && Number.isFinite(y)){
        points.push({ cmd: points.length ? 'L' : 'M', x, y });
      }
    }
    if(points.length < 2){
      return null;
    }
    return { points, closed: /Z\s*$/i.test(raw.trim()) };
  }

  function downsampleLinePreviewPoints(points, maxPoints){
    if(!Array.isArray(points) || points.length <= maxPoints || maxPoints < 3){
      return points;
    }
    const result = [points[0]];
    const stride = (points.length - 1) / (maxPoints - 1);
    let lastIndex = 0;
    for(let i = 1; i < maxPoints - 1; i += 1){
      const idx = Math.min(points.length - 2, Math.max(lastIndex + 1, Math.round(i * stride)));
      result.push(points[idx]);
      lastIndex = idx;
    }
    result.push(points[points.length - 1]);
    return result;
  }

  function compactLinePreviewPathData(raw, node){
    const parsed = parseLinePreviewPathPoints(raw);
    if(!parsed){
      return compactLinePreviewNumericString(raw);
    }
    const overlayKey = node?.dataset?.lineOverlayKey || node?.dataset?.band || node?.dataset?.lineOverlay || '';
    const isInterval = overlayKey === 'confidence' || overlayKey === 'prediction' || node?.dataset?.lineOverlayRole === 'interval';
    const isTrend = overlayKey === 'trend';
    const maxPoints = isInterval ? 72 : (isTrend ? 64 : 96);
    const points = downsampleLinePreviewPoints(parsed.points, maxPoints);
    const commands = points.map((pt, idx) => `${idx ? 'L' : 'M'}${formatLinePreviewNumber(pt.x)},${formatLinePreviewNumber(pt.y)}`);
    if(parsed.closed){
      commands.push('Z');
    }
    return commands.join(' ');
  }

  function compactLinePreviewSvg(svg, tabId = null){
    if(!svg || typeof svg.querySelectorAll !== 'function'){
      return svg;
    }
    const numericAttrs = [
      'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy',
      'r', 'rx', 'ry', 'width', 'height', 'stroke-width', 'font-size',
      'opacity', 'fill-opacity', 'stroke-opacity', 'viewBox'
    ];
    const preserveDataAttrs = new Set([
      'data-preview-source',
      'data-workspace-tab-id',
      'data-tab-id',
      'data-tab-token',
      'data-color-scheme',
      'data-color-scheme-bg-color'
    ]);
    const nodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
    nodes.forEach(node => {
      if(!node || typeof node.getAttribute !== 'function' || typeof node.setAttribute !== 'function'){
        return;
      }
      numericAttrs.forEach(attr => {
        const raw = node.getAttribute(attr);
        if(raw != null && raw !== ''){
          node.setAttribute(attr, attr === 'd'
            ? compactLinePreviewPathData(raw, node)
            : compactLinePreviewNumericString(raw));
        }
      });
      if(node.hasAttributes?.()){
        Array.from(node.attributes || []).forEach(attr => {
          const name = attr?.name || '';
          if(name.startsWith('data-') && !preserveDataAttrs.has(name)){
            try{ node.removeAttribute(name); }catch(_err){}
          }
        });
      }
      if(node.style){
        node.style.pointerEvents = '';
      }
    });
    if(tabId){
      svg.setAttribute('data-workspace-tab-id', String(tabId));
      svg.setAttribute('data-tab-id', String(tabId));
    }
    svg.setAttribute('data-preview-source', 'true');
    return svg;
  }

  function buildLinePreviewSvgFromSource(sourceSvg, tab = null){
    if(!sourceSvg || typeof sourceSvg.cloneNode !== 'function'){
      return null;
    }
    const clone = sourceSvg.cloneNode(true);
    removeLinePreviewIgnoredNodes(clone);
    const svgBox = sourceSvg.closest?.('.svgbox') || null;
    const width = Number(sourceSvg.getAttribute?.('data-line-base-width'))
      || Number(sourceSvg.getAttribute?.('width'))
      || Number.parseFloat(svgBox?.dataset?.resizerWidth || '')
      || Number.parseFloat(svgBox?.style?.width || '')
      || Number(sourceSvg.clientWidth)
      || 427;
    const height = Number(sourceSvg.getAttribute?.('data-line-base-height'))
      || Number(sourceSvg.getAttribute?.('height'))
      || Number.parseFloat(svgBox?.dataset?.resizerHeight || '')
      || Number.parseFloat(svgBox?.style?.height || '')
      || Number(sourceSvg.clientHeight)
      || 427;
    if(Number.isFinite(width) && width > 0){
      clone.setAttribute('width', formatLinePreviewNumber(width));
      clone.setAttribute('data-line-base-width', formatLinePreviewNumber(width));
    }
    if(Number.isFinite(height) && height > 0){
      clone.setAttribute('height', formatLinePreviewNumber(height));
      clone.setAttribute('data-line-base-height', formatLinePreviewNumber(height));
    }
    if(!clone.getAttribute('viewBox') && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0){
      clone.setAttribute('viewBox', `0 0 ${formatLinePreviewNumber(width)} ${formatLinePreviewNumber(height)}`);
    }
    compactLinePreviewSvg(clone, tab?.id || getLineProjectionTabId() || null);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      try{
        const length = new XMLSerializer().serializeToString(clone).length;
        lineDebug('Debug: line preview svg compacted', {
          tabId: tab?.id || getLineProjectionTabId() || null,
          length
        });
      }catch(_err){}
    }
    return clone;
  }

  line.getPreviewSvg = function getPreviewSvg(tab){
    const sourceSvg = resolveLinePreviewSourceSvg(tab);
    return buildLinePreviewSvgFromSource(sourceSvg, tab);
  };

  line.getThumbnailSvg = function getThumbnailSvg(tab){
    return resolveLinePreviewSourceSvg(tab);
  };

  // PART: CACHE
  line.captureRenderCache = function captureRenderCache(meta = {}){
    const plot = refs.plot || refs.root?.querySelector?.('#linePlot') || getLineNodeById('linePlot');
    const svg = plot ? (plot.querySelector('#lineSvg') || plot.querySelector('svg')) : null;
    if(!plot || !svg || !lineSvgHasMeaningfulContent(svg)){
      console.debug('Debug: line render cache capture skipped', {
        reason: !plot ? 'missing-plot-host' : (!svg ? 'missing-svg' : 'empty-svg'),
        tabId: meta?.tabId || getLineProjectionTabId() || null
      });
      return null;
    }
    const plotStyle = plot ? plot.getAttribute('style') : null;
    const svgState = svg ? {
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      viewBox: svg.getAttribute('viewBox'),
      dataViewMode: svg.dataset ? svg.dataset.viewMode : null
    } : null;
    const plotCache = detachChildren(plot);
    if(!lineFragmentPayloadHasGraph(plotCache)){
      restoreChildren(plot, plotCache);
      console.debug('Debug: line render cache capture skipped', {
        reason: 'empty-runtime-cache',
        tabId: meta?.tabId || getLineProjectionTabId() || null
      });
      return null;
    }
    const cacheMeta = captureLineRenderCacheMetadata(meta, svg);
    cacheMeta.complete = true;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: line render cache captured', {
        plotNodes: plotCache?.count || 0,
        hasSvg: !!svg,
        viewMode: svgState?.dataViewMode || null
      });
    }
    // Render cache carries the graph only; the stats panel is rebuilt from state on
    // restore (loadFromPayload), so it is not snapshotted as DOM.
    const cacheSession = resolveLineRenderCacheSession(meta);
    const rotationModel = normalizeLine3dRotationModel(cacheSession?.cache?.line3dRotationModel || null);
    return {
      plot: plotCache,
      plotStyle,
      svgState,
      rotationModel: rotationModel ? (cloneLineRuntimeValue(rotationModel, null) || rotationModel) : null,
      __graphitixRenderCache: cacheMeta
    };
  };

  line.canRestoreRenderCache = function canRestoreRenderCache(cache, meta = {}){
    if(!canRestoreLineRenderCache(cache, meta)){
      return false;
    }
    const graphCachePayload = resolveLineGraphCachePayload(cache);
    return chartStyle.hasCurrentLegendViewportContract?.(graphCachePayload?.fragment || null) !== false;
  };

  line.isIdleForSnapshot = function isIdleForSnapshot(){
    const session = getLineActiveSessionForState();
    const viewState = getLineViewState(session);
    const rotationActive = !!(session?.tabId && plot3d.isRotationGestureActiveForTab?.(session.tabId, 'line'));
    return !getLineStatsState(session).computationPending
      && !getLineAutoDrawState(session).drawPending
      && !viewState.rotationPending
      && !rotationActive;
  };

  line.awaitReadyForSnapshot = function awaitReadyForSnapshot(meta = {}){
    return Shared.componentLifecycle?.awaitReadyForSnapshot?.(line, { ...meta, componentKey: 'line' })
      || Promise.resolve({ ok: true, skipped: true, reason: 'missing-componentLifecycle' });
  };

  line.rehydrateGraphInteractions = function rehydrateGraphInteractions(meta = {}){
    const session = resolveLineRenderCacheSession(meta);
    const root = meta.root || resolveLineRoot(session?.tabId || meta.tab || meta.tabId || null);
    const plot = root?.querySelector?.('#linePlot') || refs.plot || null;
    const svg = plot?.querySelector?.('#lineSvg') || meta.svgs?.find?.(node => node?.id === 'lineSvg') || null;
    if(!session || !svg){ return false; }
    const axesReady = axisControls?.rehydrateAxisElements?.(svg, (axis, _element, metadata) => buildLineAxisControlConfig(axis, session, {
      bounds: metadata?.bounds || null,
      effectiveTickInterval: metadata?.effectiveTickInterval ?? null
    })) !== false;
    const textReady = rehydrateLineInlineTextInteractions(svg, session);
    svg.querySelectorAll?.('[data-line-point-interaction]').forEach(node => {
      try{
        const data = JSON.parse(node.getAttribute('data-line-point-interaction'));
        attachLineMarkerTooltip(node, { name: data?.seriesName || '' }, data?.point || null);
      }catch(_err){}
    });
    svg.querySelectorAll?.('[data-series] path:not([data-plot-point="1"]):not([data-line-overlay]), path[data-series]:not([data-plot-point="1"]):not([data-line-overlay])').forEach(bindLinePathFormatInteraction);
    svg.querySelectorAll?.('[data-series] circle, [data-series] rect, [data-series] polygon, [data-series] path[data-plot-point="1"]').forEach(bindLineMarkerFormatInteraction);
    svg.querySelectorAll?.('[data-line-overlay]').forEach(node => {
      registerLineOverlayControlElement(node, node.dataset?.lineOverlayKey || node.dataset?.lineOverlay, node.dataset?.series || null);
    });
    bindLineLegendInteractions(
      svg.querySelector?.('[data-legend-viewport-content="true"]') || null,
      svg,
      session
    );
    if(svg.dataset?.viewMode === '3d'){
      if(session?.refs?.rotationSvg !== svg || typeof session?.refs?.rotationRenderer !== 'function'){
        if(!bindLine3dRotationRenderer(session, svg, session?.cache?.line3dRotationModel || null)){ return false; }
      }
      if(!bindLine3dRotationControls(svg, 'line-3d-cache-rehydrate', session)){ return false; }
    }
    return axesReady && textReady;
  };

  line.restoreRenderCache = function restoreRenderCache(cache, meta = {}){
    if(!cache){ return false; }
    if(!canRestoreLineRenderCache(cache, meta)){
      return false;
    }
    const graphCachePayload = resolveLineGraphCachePayload(cache);
    const plot = refs.plot || refs.root?.querySelector?.('#linePlot') || getLineNodeById('linePlot');
    const restoredPlot = restoreChildren(plot, graphCachePayload);
    if(plot && typeof cache.plotStyle === 'string' && cache.plotStyle){
      plot.setAttribute('style', cache.plotStyle);
    }
    const svg = plot ? (plot.querySelector('#lineSvg') || plot.querySelector('svg')) : null;
    if(svg && cache.svgState){
      if(cache.svgState.width){
        svg.setAttribute('width', cache.svgState.width);
      }
      if(cache.svgState.height){
        svg.setAttribute('height', cache.svgState.height);
      }
      if(cache.svgState.viewBox){
        svg.setAttribute('viewBox', cache.svgState.viewBox);
      }
      if(cache.svgState.dataViewMode){
        svg.dataset.viewMode = cache.svgState.dataViewMode;
      }
    }
    const hasGraph = linePlotHasMeaningfulGraph(plot);
    if(!restoredPlot || !hasGraph){
      console.debug('Debug: line render cache restore rejected after restore', {
        reason: !restoredPlot ? 'plot-not-restored' : 'empty-restored-graph',
        plot: restoredPlot,
        hasGraph
      });
      return false;
    }
    const renderCacheSession = resolveLineRenderCacheSession(meta);
    chartStyle.rehydrateLegendViewports?.(plot);
    bindLineLegendInteractions(
      svg?.querySelector?.('[data-legend-viewport-content="true"]') || null,
      svg,
      renderCacheSession
    );
    reconcileLineStatsContextFromOwnerData(renderCacheSession, {
      reason: 'line-render-cache-restore-stats-context'
    });
    const renderCacheViewState = getLineViewState(renderCacheSession);
    renderCacheViewState.rotationPending = false;
    renderCacheViewState.rotationPendingLogged = false;
    if(renderCacheSession?.cache){
      const restoredRotationModel = normalizeLine3dRotationModel(cache.rotationModel || null);
      if(restoredRotationModel){
        renderCacheSession.cache.line3dRotationModel = cloneLineRuntimeValue(restoredRotationModel, null) || restoredRotationModel;
      }
    }
    const rebound3dRenderer = bindLine3dRotationRenderer(renderCacheSession, svg, cache.rotationModel || renderCacheSession?.cache?.line3dRotationModel || null);
    const rebound3dRotation = bindLine3dRotationControls(svg, 'line-3d-restore', renderCacheSession);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: line render cache restored', {
        restored: true,
        plot: restoredPlot,
        hasGraph,
        viewMode: cache.svgState?.dataViewMode || getLineRenderCacheMetadata(cache)?.viewMode || null,
        rebound3dRenderer,
        rebound3dRotation
      });
    }
    return true;
  };
  line.draw = function draw(options = {}){
    const nextReason = options?.reason || 'component-draw';
    const targetSession = getLineSession(options?.tab || options?.tabId || getLineProjectionTabId() || null, {
      ...(options || {}),
      reason: nextReason || 'line-draw-session'
    }, { create: true });
    const targetTabId = targetSession?.tabId || options?.tabId || getLineProjectionTabId() || null;
    if(Shared.componentLifecycle?.shouldSuppressDraw?.('line', { ...(options || {}), tabId: targetTabId, reason: nextReason })){
      console.debug('Debug: line draw suppressed by lifecycle', { reason: nextReason, tabId: targetTabId });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'line', tabId: targetTabId, action: 'draw-suppressed', reason: nextReason, details: { source: 'line.draw' } });
      return;
    }
    if(targetSession && !isLineSessionActive(targetSession)){
      markLineOwnerDrawPending(targetSession, {
        ...(options || {}),
        reason: nextReason || 'component-draw-inactive'
      });
      Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'line', tabId: targetTabId, action: 'draw-deferred', reason: nextReason, details: { source: 'line.draw', inactive: true } });
      return;
    }
    Shared.componentLifecycle?.emitLifecycleEvent?.({ componentKey: 'line', tabId: targetTabId, action: 'draw-executed', reason: nextReason, details: { source: 'line.draw' } });
    bindLineSessionForTab(targetSession || targetTabId, { ...(options || {}), reason: nextReason || 'line-draw-bind-session' }, { syncControls: line.ready === true });
    ensureReady();
    if(canScheduleActiveLineDraw()){
      const drawOptions = Object.assign({}, options || {});
      if(!drawOptions.reason){
        drawOptions.reason = 'component-draw';
      }
      if(targetTabId && !drawOptions.tabId){
        drawOptions.tabId = targetTabId;
      }
      if(drawOptions.force !== false && drawOptions.viewOnly !== true){
        drawOptions.force = true;
      }
      scheduleActiveLineDraw(drawOptions);
    }
  };
  line.cancelCurrentDraw = function cancelCurrentDraw(meta = {}){
    const tabId = meta?.tabId || getLineProjectionTabId() || null;
    const session = getLineSession(tabId, { ...(meta || {}), tabId, reason: 'line-draw-cancel-session' }, { create: false });
    resetLineRotationFrameState(session);
    try{ line.__asyncScope?.cancelAllForTab?.(tabId, meta?.reason || 'line-draw-cancel'); }catch(_err){}
    resolveLineOverlay({ reason: meta?.reason || 'cancelled', tabId });
    Shared.componentLifecycle?.emitLifecycleEvent?.({
      componentKey: 'line',
      tabId,
      action: 'draw-cancelled',
      reason: meta?.reason || 'line-draw-cancel'
    });
    return true;
  };
  line.save = saveLineFile;
  line.saveAs = saveAsLineFile;
  line.open = openLineFile;
  line.loadFromFile = loadLineGraphFile;
  line.loadFromPayload = function loadLineGraphFromPayload(payload, options = {}){
    if(!applyLineGraphPayload(payload, { source: 'payload', ...options })){
      console.warn('line payload application failed', { source: 'payload' });
    }
  };
  line.applyColorSchemePayload = function applyLineColorSchemePayload(payload, options = {}){
    return applyLineGraphPayload(payload, {
      source: 'color-scheme',
      colorSchemeOnly: true,
      ...options
    });
  };
  line.getPayload = getLineGraphPayload;
  {
    const tableUiHooks = Shared.hot?.makeTableUiStateHooks?.(() => getActiveLineHotManager(), 'line');
    line.captureUiState = tableUiHooks ? tableUiHooks.capture : () => null;
    line.applyUiState = tableUiHooks ? tableUiHooks.apply : () => false;
  }
  function syncLineRuntimeControlsFromState(controlSnapshot = {}, tabLike = null){
    const targetSession = tabLike
      ? getLineSession(tabLike, { tabId: typeof tabLike === 'string' ? tabLike : tabLike?.id, reason: 'line-controls-state-sync-session' }, { create: false })
      : getLineActiveSessionForState();
    const controls = setLineRuntimeControlsForSession(targetSession, controlSnapshot || getLineRuntimeControlsForSession(targetSession, lineFallbackRuntimeControls), { reason: 'line-controls-state-sync' });
    const hasControl = key => Object.prototype.hasOwnProperty.call(controls, key);
    const setValue = (control, key) => {
      if(control && hasControl(key) && controls[key] != null){
        control.value = String(controls[key]);
      }
    };
    const setChecked = (control, key) => {
      if(control && hasControl(key)){
        control.checked = !!controls[key];
      }
    };

    const requestedView = String(controls.viewMode || getLineViewState().viewMode || refs.viewMode?.value || '2d').toLowerCase();
    const viewMode = requestedView === '3d' ? '3d' : '2d';
    getLineViewState().viewMode = viewMode;
    if(refs.viewMode){
      refs.viewMode.value = viewMode;
    }

    const requestedFormat = String(controls.tableFormat || refs.replicateMode?.value || (viewMode === '3d' ? '3d' : (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single'))).toLowerCase();
    const tableFormat = viewMode === '3d'
      ? '3d'
      : (requestedFormat === 'grouped' ? 'grouped' : 'single');
    if(refs.replicateMode){
      refs.replicateMode.value = tableFormat;
    }
    if(refs.replicatesInput){
      refs.replicatesInput.value = String(lineReplicates);
    }

    setValue(refs.dotSize, 'dotSize');
    setValue(refs.border, 'border');
    setValue(refs.borderWidth, 'borderWidth');
    setValue(refs.errorBarWidth, 'errorBarWidth');
    syncLineErrorBarToolbarValue();
    setValue(refs.alpha, 'alpha');
    if(refs.alphaVal && refs.alpha){
      refs.alphaVal.textContent = refs.alpha.value;
    }
    setChecked(refs.showGrid, 'showGrid');
    if(refs.showLegend && hasControl('showLegend')){
      refs.showLegend.checked = controls.showLegend !== false;
      ensureLineLegendControlPlacement();
    }
    if(refs.fontSize && hasControl('fontSize') && controls.fontSize != null){
      refs.fontSize.value = String(controls.fontSize);
      if(refs.fontSize.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
      }
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
    }

    const overlayControls = resolveLineOverlayControls(tabLike);
    if(viewMode === '3d'){
      if(refs.displayMode){ refs.displayMode.value = 'line'; }
      if(refs.showFrame){ refs.showFrame.checked = true; }
      if(refs.logX){ refs.logX.checked = false; }
      if(refs.logY){ refs.logY.checked = false; }
      if(overlayControls.showTrendLine){ overlayControls.showTrendLine.checked = false; }
      if(overlayControls.showIntervals){ overlayControls.showIntervals.checked = false; }
      if(overlayControls.showPredictionIntervals){ overlayControls.showPredictionIntervals.checked = false; }
    }else{
      lineLast2dDisplayMode = sanitizeLineDisplayMode(controls.displayMode || lineLast2dDisplayMode);
      lineLast2dShowFrame = !!controls.showFrame;
      lineLast2dLogX = !!controls.logX;
      lineLast2dLogY = !!controls.logY;
      lineLast2dShowTrendLine = !!controls.showTrendLine;
      lineLast2dShowIntervals = !!controls.showIntervals;
      lineLast2dShowPredictionIntervals = !!controls.showPredictionIntervals;
      lineLast2dShowPlotStats = !!controls.showPlotStats;
      if(refs.displayMode){ refs.displayMode.value = lineLast2dDisplayMode; }
      if(refs.showFrame){ refs.showFrame.checked = lineLast2dShowFrame; }
      if(refs.logX){ refs.logX.checked = lineLast2dLogX; }
      if(refs.logY){ refs.logY.checked = lineLast2dLogY; }
      if(overlayControls.showTrendLine){ overlayControls.showTrendLine.checked = lineLast2dShowTrendLine; }
      if(overlayControls.showIntervals){ overlayControls.showIntervals.checked = lineLast2dShowIntervals; }
      if(overlayControls.showPredictionIntervals){ overlayControls.showPredictionIntervals.checked = lineLast2dShowPredictionIntervals; }
      if(overlayControls.showPlotStats){ overlayControls.showPlotStats.checked = lineLast2dShowPlotStats; }
    }

    setValue(refs.xMin, 'xMin');
    setValue(refs.xMax, 'xMax');
    setValue(refs.yMin, 'yMin');
    setValue(refs.yMax, 'yMax');
    setValue(refs.originMode, 'originMode');
    setValue(refs.originX, 'originX');
    setValue(refs.originY, 'originY');

    if(refs.statType && hasControl('statType') && controls.statType){
      refs.statType.value = String(controls.statType);
    }
    if(refs.regressionMode && hasControl('regressionMode') && controls.regressionMode){
      ensureLineRegressionSelectOptions(refs.regressionMode);
      const requestedRegression = String(controls.regressionMode);
      if(Array.from(refs.regressionMode.options || []).some(option => option.value === requestedRegression)){
        refs.regressionMode.value = requestedRegression;
      }
    }
    if(controls.forecast && typeof controls.forecast === 'object'){
      if(refs.forecastHorizon && controls.forecast.horizon != null){ refs.forecastHorizon.value = String(controls.forecast.horizon); }
      if(refs.forecastSeasonLength && controls.forecast.seasonLength != null){ refs.forecastSeasonLength.value = String(controls.forecast.seasonLength); }
      if(refs.forecastAuto && Object.prototype.hasOwnProperty.call(controls.forecast, 'autoTune')){ refs.forecastAuto.checked = !!controls.forecast.autoTune; }
      if(refs.forecastCriterion && controls.forecast.criterion){ refs.forecastCriterion.value = String(controls.forecast.criterion).toLowerCase() === 'aic' ? 'aic' : 'bic'; }
      resolveForecastOptions({ session: targetSession, syncInputs: true, reason: 'line-controls-forecast-sync' });
    }

    updateLineReplicateModeControls(tableFormat);
    if(tableFormat === 'grouped'){
      renderLineGroupedList();
    }else if(tableFormat === '3d'){
    }
    updateForecastVisibility();
    updateLineRegressionOverlayControlState(lineHasComputedStats());
    syncLineAspectControls('runtime-controls');
  }

  line.captureRuntimeState = function captureLineRuntimeState(meta = {}){
    const targetTabId = resolveLineOwnedRuntimeTabId(meta?.tab || meta?.tabId || meta?.workspaceTabId || getLineProjectionTabId() || null, meta) || getLineProjectionTabId() || null;
    const isActive = !!(targetTabId && String(targetTabId) === String(getLineProjectionTabId() || '') && line.ready === true);
    let snapshot = null;
    if(isActive){
      snapshot = captureLineCanonicalSnapshot(targetTabId, meta, { readActiveControls: true });
    }else if(targetTabId){
      snapshot = captureLineCanonicalSnapshot(targetTabId, meta, { readActiveControls: false });
    }
    if(!snapshot){
      snapshot = buildLineCanonicalStateFromGlobals(targetTabId || getLineProjectionTabId() || null, meta, { readControls: isActive });
    }
    snapshot = ensureLineCanonicalState(snapshot, targetTabId || snapshot.tabId || '');
    snapshot.reason = meta?.reason || 'line-runtime-capture';
    const effectiveMeta = {
      ...(meta || {}),
      tabId: targetTabId || snapshot.tabId || null,
      reason: snapshot.reason
    };
    if(effectiveMeta.tabId){
      storeLineCanonicalStateForTab(snapshot, effectiveMeta.tab || effectiveMeta.tabId, effectiveMeta);
    }
    console.debug('Debug: line runtime snapshot captured', {
      tabId: effectiveMeta.tabId || null,
      displayMode: snapshot.displayMode,
      notesOpen: !!snapshot.notes?.open,
      source: isActive ? 'active-session-state' : 'stored-session-state',
      reason: snapshot.reason
    });
    const remembered = Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(line, snapshot, effectiveMeta);
    return remembered || snapshot;
  };

  line.applyRuntimeState = function applyLineRuntimeState(snapshot, meta = {}){
    const effectiveMeta = {
      ...(meta || {}),
      tabId: meta.tabId || meta.workspaceTabId || meta.tab?.id || getLineProjectionTabId() || null,
      reason: meta?.reason || 'line-runtime-apply'
    };
    const passive = isLinePassiveActivationMeta(effectiveMeta);
    snapshot = Shared.componentLifecycle?.resolveComponentRuntimeSnapshot?.(line, snapshot, effectiveMeta) || (!Shared.componentLifecycle ? snapshot : null);
    if(!snapshot || typeof snapshot !== 'object'){
      const session = effectiveMeta.tabId ? getLineSession(effectiveMeta.tab || effectiveMeta.tabId, effectiveMeta, { create: false }) : null;
      if(session?.state){
        const isActiveSession = String(session.tabId || '') === String(getLineProjectionTabId() || '') && line.ready === true;
        if(isActiveSession){
          projectedLineSession = session;
          if(passive){
            applyLineSessionEphemera(session);
            applyLineCanonicalStateToRuntimeGlobals(session.state, session);
          }else{
            applyLineCanonicalStateToGlobals(session.state, effectiveMeta, { syncControls: true });
            rememberLineSessionEphemera(session);
          }
          rehydrateActiveLine3dInteraction(session, 'line-3d-runtime-session');
        }
        console.debug('Debug: line runtime snapshot apply used stored session state', { tabId: session.tabId, reason: effectiveMeta.reason || 'missing-snapshot-session' });
        return true;
      }
      const rebound = bindExistingLineOwnedRuntimeRecord(effectiveMeta.tab || effectiveMeta.tabId || null, {
        ...effectiveMeta,
        reason: effectiveMeta.reason || 'line-runtime-apply-missing-snapshot-bind-existing-owned-runtime'
      });
      if(rebound){
        console.debug('Debug: line runtime snapshot apply used existing owned runtime', { tabId: rebound.tabId || effectiveMeta.tabId || null, reason: effectiveMeta.reason || 'missing-snapshot-existing-owned-runtime' });
        return true;
      }
      const modeCache = getActiveLineModeCache({ ...effectiveMeta, reason: 'line-runtime-apply-missing-mode-cache-reset' });
      modeCache.twoD = null;
      modeCache.threeD = null;
      modeCache.lastTwoDFormat = 'single';
      console.debug('Debug: line runtime snapshot apply skipped', { tabId: effectiveMeta.tabId || null, reason: 'missing-snapshot' });
      return false;
    }
    const canonical = ensureLineCanonicalState(snapshot, effectiveMeta.tabId || snapshot.tabId || '');
    storeLineCanonicalStateForTab(canonical, effectiveMeta.tab || effectiveMeta.tabId || canonical.tabId || null, effectiveMeta);
    const targetTabId = canonical.tabId || effectiveMeta.tabId || null;
    const isActiveTarget = !!(targetTabId && String(targetTabId) === String(getLineProjectionTabId() || '') && line.ready === true);
    if(isActiveTarget){
      if(passive){
        const session = getLineSession(targetTabId, { ...effectiveMeta, tabId: targetTabId, reason: 'line-runtime-passive-bind-session' }, { create: true })
          || getLineActiveSessionForState();
        if(session){
          projectedLineSession = session;
          line.__lineSessionTabId = targetTabId;
          session.state = canonical;
          applyLineSessionEphemera(session);
          applyLineCanonicalStateToRuntimeGlobals(canonical, session);
        }
      }else{
        bindLineSessionForTab(targetTabId, { ...effectiveMeta, tabId: targetTabId, reason: 'line-runtime-apply-bind-session' }, { syncControls: false, preserveCurrent: false });
        applyLineCanonicalStateToGlobals(canonical, { ...effectiveMeta, tabId: targetTabId }, { syncControls: true });
        if(projectedLineSession){
          projectedLineSession.state = canonical;
          rememberLineSessionEphemera(projectedLineSession);
        }
      }
      rehydrateActiveLine3dInteraction(projectedLineSession, 'line-3d-runtime');
    }
    Shared.componentLifecycle?.rememberComponentRuntimeSnapshot?.(line, canonical, {
      ...(meta || {}),
      tabId: targetTabId || effectiveMeta.tabId || null,
      reason: meta?.reason || 'line-runtime-apply'
    });
    console.debug('Debug: line runtime snapshot applied', {
      tabId: targetTabId || effectiveMeta.tabId || null,
      displayMode: canonical.displayMode,
      active: isActiveTarget,
      reason: meta?.reason || 'line-runtime-apply'
    });
    return true;
  };

  line.deactivateTab = Shared.componentLifecycle?.createDeactivateHandler?.({
    component: line,
    componentKey: 'line',
    cancel: (tab, meta = {}) => {
      const tabLike = tab || meta?.tabId || getLineProjectionTabId() || null;
      const session = getLineSession(tabLike, { ...(meta || {}), reason: 'line-deactivate-session' }, { create: false });
      resetLineRotationFrameState(session);
      getLineStatsState(tabLike).computationPending = false;
      getLineAutoDrawState(tabLike).drawPending = false;
      rememberLineSessionState(tabLike, { ...(meta || {}), reason: meta?.reason || 'line-deactivate-remember-session' }, { readControls: true });
      rememberLineOwnedRuntimeRecord(tabLike, { ...(meta || {}), reason: meta?.reason || 'line-deactivate-remember-owned-runtime' });
    }
  }) || function deactivateLineTab(tab, meta = {}){
    const tabLike = tab || meta?.tabId || getLineProjectionTabId() || null;
    const session = getLineSession(tabLike, { ...(meta || {}), reason: 'line-deactivate-session' }, { create: false });
    resetLineRotationFrameState(session);
    getLineStatsState(tabLike).computationPending = false;
    getLineAutoDrawState(tabLike).drawPending = false;
    rememberLineSessionState(tabLike, { ...(meta || {}), reason: meta?.reason || 'line-deactivate-remember-session' }, { readControls: true });
    rememberLineOwnedRuntimeRecord(tabLike, { ...(meta || {}), reason: meta?.reason || 'line-deactivate-remember-owned-runtime' });
    line.__runtimeGeneration = (Number(line.__runtimeGeneration) || 0) + 1;
    console.debug('Debug: line tab deactivated', {
      tabId: (tab && typeof tab === 'object' ? tab.id : tab) || meta?.tabId || null,
      generation: line.__runtimeGeneration,
      reason: meta?.reason || 'deactivate-tab'
    });
    return true;
  };
  line.captureEmptyPayloadTemplate = function captureLineEmptyPayloadTemplate(){
    const snapshot = line.createEmptyPayload();
    console.debug('Debug: line empty payload template captured', { hasTemplate: !!snapshot });
    return snapshot;
  };
  line.restoreEmptyPayloadTemplate = function restoreLineEmptyPayloadTemplate(template, options = {}){
    if(!template || typeof template !== 'object'){
      console.debug('Debug: line empty payload template restore skipped', { reason: 'invalid-template', options });
      return false;
    }
    emptyPayloadTemplate = cloneSimple(template);
    console.debug('Debug: line empty payload template restored', { hasTemplate: !!emptyPayloadTemplate, reason: options.reason || 'unspecified' });
    return !!emptyPayloadTemplate;
  };
  line.createEmptyPayload = function createEmptyLinePayload(){
    console.debug('Debug: line.createEmptyPayload pure factory invoked', {
      ready: !!line.ready,
      boundTabId: getLineProjectionTabId() || null
    });
    const payload = { type: 'line', config: {} };
    payload.type = 'line';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, LINE_DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(LINE_DEFAULT_COLS).fill(''));
    seedLineDefaultHeaderRow(emptyData);
    payload.data = emptyData;
    payload.exclusions = [];
    payload.filters = null;
    payload.series = Array.isArray(payload.series) ? [] : [];
    payload.config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    if(typeof payload.config.colorScheme !== 'string' || !payload.config.colorScheme.trim()){
      payload.config.colorScheme = Shared.colorSchemes?.getDefaultSchemeId?.('line') || 'scientific';
    }
    if(payload.config){
      payload.config.series = Array.isArray(payload.config.series) ? [] : [];
      payload.config.showPlotStats = false;
    }
    return payload;
  };
  line.buildExportSvg = buildLineExportSvg;
  line.getHot = () => getActiveLineHotManager();
  line.updateStats = updateLineStats;
  line.__getState = function(){
    console.debug('Debug: line.__getState invoked');
    const activeHot = getActiveLineHotManager();
    const headerRow = Array.isArray(activeHot?.getData?.()) ? activeHot.getData()[0] : null;
    const inferredEntryCount = lineLegendLayoutInfo.entryCount || (Array.isArray(headerRow) ? Math.max(0, Math.floor(((headerRow.length || 1) - 1) / Math.max(lineReplicates || 1, 1))) : 0);
    return {
      ui: {
        root: refs.root || null
      },
      root: refs.root || null,
      hot: activeHot,
      layout: getActiveLineLayoutManager(),
      legendItems: lineLegendItems.slice(),
      legendWidth: lineLegendWidth,
      showLegend: refs.showLegend ? !!refs.showLegend.checked : true,
      legendLayout: {
        entryCount: inferredEntryCount,
        rendererWidth: lineLegendLayoutInfo.rendererWidth,
        legendWidthForMargin: lineLegendLayoutInfo.legendWidthForMargin,
        legendGapPx: lineLegendLayoutInfo.legendGapPx,
        minSvgWidth: lineLegendLayoutInfo.minSvgWidth,
        basePlotWidth: lineLegendLayoutInfo.basePlotWidth,
        guardPaddingPx: lineLegendLayoutInfo.guardPaddingPx,
        swatchSize: lineLegendLayoutInfo.swatchSize,
        swatchGap: lineLegendLayoutInfo.swatchGap,
        rowGap: lineLegendLayoutInfo.rowGap,
        rowHeight: lineLegendLayoutInfo.rowHeight,
        fontSize: lineLegendLayoutInfo.fontSize,
        minWidth: lineLegendLayoutInfo.minWidth,
        maxLabelWidth: lineLegendLayoutInfo.maxLabelWidth,
        entries: lineLegendLayoutInfo.entries.map(entry=>({
          label: entry.label,
          key: entry.key,
          labelWidth: entry.labelWidth
        }))
      },
      minSvgWidth: lineMinSvgWidth,
      labelColors: { ...lineLabelColors },
      displayMode: lineDisplayMode,
      session: projectedLineSession ? {
        tabId: projectedLineSession.tabId || null,
        stateTabId: projectedLineSession.state?.tabId || null,
        hasHot: !!projectedLineSession.managers?.hot,
        hasRefs: !!projectedLineSession.refs
      } : null,
      scheduleDraw: scheduleLineDraw
    };
  };

  line.__testHooks = Object.assign({}, line.__testHooks, {
    computeLineCorrelationStats: (method, x, y, jStatLib) => computeLineCorrelationStats(
      method,
      Array.isArray(x) ? x : [],
      Array.isArray(y) ? y : [],
      jStatLib || global.jStat || global.window?.jStat
    ),
    computeLineStats: (points, method, options = {}) => computeLineStats(
      Array.isArray(points) ? points : [],
      method || 'pearson',
      global.jStat || global.window?.jStat,
      options.regressionMode || 'linear',
      options
    ),
    buildPlotStatsLines: (series, options = {}) => buildLinePlotStatsLines(series, options),
    buildRegressionTrendPath: (samples, options = {}) => buildLineRegressionTrendPath(samples, options),
    build2dSeriesDataModel: (matrix, options = {}) => buildLine2dSeriesDataModel(matrix, options),
    reconcileStatsContextFromOwnerData: (session, options = {}) => reconcileLineStatsContextFromOwnerData(session, options),
    resolveDrawableFrame: plot => resolveLineDrawableFrame(plot),
    buildLine3dMatrixFrom2d,
    applyLine3dHeaderRow,
    inferLine3dSeriesCount,
    isLine3dDatasetHeaderMatrix,
    getActiveSession: () => projectedLineSession,
    getSessionForTab: tabId => getLineSession(tabId, { tabId, reason: 'test-session-read' }, { create: false }),
    captureCanonicalState: (tabId, options = {}) => captureLineCanonicalSnapshot(tabId || getLineProjectionTabId() || null, { tabId, reason: 'test-canonical-capture' }, { readActiveControls: options.readActiveControls !== false }),
    stabilizeResizeMargin: (margin, options = {}) => stabilizeLineMarginForAxisResize(margin, options),
    normalizeViewState: value => normalizeLineOwnedViewState(value),
    normalize3dRotationModel: normalizeLine3dRotationModel,
    bind3dRotationRenderer: (session, svg, model) => bindLine3dRotationRenderer(session, svg, model)
  });



  Shared.componentLifecycle?.installInternalStateBridge?.(line, {
    componentKey: 'line',
    targets: [
      { key: 'getLineAutoDrawState()', get: () => getLineAutoDrawState(), excludeKeys: ['drawPending'] },
      { key: 'getLineViewState()', get: () => getLineViewState(), excludeKeys: ['rotationPending', 'rotationPendingLogged'] },
      { key: 'getLineStatsState()', get: () => getLineStatsState(), excludeKeys: ['context', 'computationPending', 'restorePending'] },
      { key: 'lineAdvisorState', get: () => lineAdvisorState },
      { key: 'notesState', get: () => notesState, excludeKeys: ['control'] }
    ]
  });
})(window);
