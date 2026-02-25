(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const line = Components.line = Components.line || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
  const exportFontStyles = scopeId => (fontControls && typeof fontControls.exportScopeStyles === 'function')
    ? fontControls.exportScopeStyles(scopeId)
    : null;
  const importFontStyles = (scopeId, styles) => {
    if(fontControls && typeof fontControls.importScopeStyles === 'function'){
      fontControls.importScopeStyles(scopeId, styles, { prune: true });
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
  let emptyPayloadTemplate = null;

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
    if(emptyPayloadTemplate || typeof getLineGraphPayload !== 'function'){
      return;
    }
    const snapshot = getLineGraphPayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }
  const LINE_DEFAULT_SERIES_COUNT = 5;
  const LINE_MIN_REPLICATES = 1;
  const LINE_MAX_REPLICATES = 10;
  const DEFAULT_FORECAST_HORIZON = 6;
  const DEFAULT_FORECAST_SEASON = 12;
  const MAX_FORECAST_HORIZON = 120;
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
  const BROKEN_AXIS_BREAK_WIDTH = 8;
  const BROKEN_AXIS_BREAK_HEIGHT = 6;
  const BROKEN_AXIS_DEFAULT_SEGMENT = { start: 0, end: 1 };
  const lineAutoDrawState = {
    autoDrawEnabled: true,
    autoDrawReason: null,
    autoDrawLockedByThreshold: false,
    drawPending: false,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null
  };

  let scheduleLineDraw = () => {};
  let scheduleLineDrawRaw = () => {};
  let lineAutoDrawManager = null;
  let lineHot = null;
  let lineDataViewsManager = null;
  let lineDataToolbarBound = false;
  let lineDataToolbarLastActivation = 0;
  const lineViewState = {
    viewMode: '2d',
    requestedViewMode: null,
    rotation: plot3d.createRotationState({
      x: LINE_3D_DEFAULTS.rotationX,
      y: LINE_3D_DEFAULTS.rotationY
    }),
    rotationPending: false,
    rotationPendingLogged: false,
    axesVarianceScaled: false,
    equalAxes: true,
    equalScaleAxes: false
  };
  if(typeof plot3d.normalizeRotation === 'function'){
    plot3d.normalizeRotation(lineViewState.rotation);
  }
  function resetLine3dRotation(reason){
    if(typeof plot3d.createRotationState !== 'function'){
      lineViewState.rotation.x = LINE_3D_DEFAULTS.rotationX;
      lineViewState.rotation.y = LINE_3D_DEFAULTS.rotationY;
      lineViewState.rotation.z = 0;
      lineViewState.rotation.quaternion = null;
      lineDebug('Debug: line rotation reset (fallback)', { reason, rotation: { x: lineViewState.rotation.x, y: lineViewState.rotation.y, z: lineViewState.rotation.z } });
      return;
    }
    const defaults = plot3d.createRotationState({
      x: LINE_3D_DEFAULTS.rotationX,
      y: LINE_3D_DEFAULTS.rotationY
    });
    lineViewState.rotation.x = defaults.x;
    lineViewState.rotation.y = defaults.y;
    lineViewState.rotation.z = defaults.z || 0;
    lineViewState.rotation.quaternion = defaults.quaternion
      ? { w: defaults.quaternion.w, x: defaults.quaternion.x, y: defaults.quaternion.y, z: defaults.quaternion.z }
      : null;
    if(typeof plot3d.normalizeRotation === 'function'){
      plot3d.normalizeRotation(lineViewState.rotation);
    }
    lineDebug('Debug: line rotation reset', { reason, rotation: { x: lineViewState.rotation.x, y: lineViewState.rotation.y, z: lineViewState.rotation.z } });
  }
  let lineTitleText = 'Line graph';
  let lineXLabelText = 'X';
  let lineYLabelText = 'Y';
  let lineZLabelText = 'Z';
  let lineLabelColors = {};
  let lineLabelPositions = { title: null, xLabel: null, yLabel: null, legend: null };
  let lineColorSchemeId = 'scientific';
  let lineTextColor = chartStyle.TEXT_COLOR || '#000000';
  let lineBackgroundColor = '#ffffff';
  let lineLegendControl = null;

  function normalizeLineThemeColor(value, fallback){
    return (typeof value === 'string' && value.trim()) ? value.trim() : fallback;
  }

  function applyLineThemeConfig(config){
    const cfg = config && typeof config === 'object' ? config : {};
    const schemeId = typeof cfg.colorScheme === 'string' && cfg.colorScheme.trim()
      ? cfg.colorScheme.trim().toLowerCase()
      : lineColorSchemeId;
    const isDark = schemeId === 'dark';
    lineColorSchemeId = schemeId || 'scientific';
    lineTextColor = normalizeLineThemeColor(
      cfg.textColor,
      isDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000')
    );
    lineBackgroundColor = normalizeLineThemeColor(
      cfg.backgroundColor,
      isDark ? '#000000' : '#ffffff'
    );
  }

  function appendLine3dBackground(svg, width, height){
    if(!svg){
      return;
    }
    const staleBackgrounds = svg.querySelectorAll('[data-color-scheme-background="1"]');
    staleBackgrounds.forEach(node => {
      try { node.remove(); } catch (err) {}
    });
    const isDark = String(lineColorSchemeId || '').toLowerCase() === 'dark';
    if(isDark){
      svg.setAttribute('data-color-scheme-bg-color', normalizeLineThemeColor(lineBackgroundColor, '#000000'));
    }else{
      svg.removeAttribute('data-color-scheme-bg-color');
    }
  }
  let lineSvgBoxRef = null;
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
  let lineLast2dShowIntervals = false;
  let lineLast2dShowDiagnostics = false;
  const lineUndoManager = Shared.undoManager || null;
  function isLine3dMode(){
    return lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d';
  }
  function syncLine3dAxisHeadersFromTable(changes, source){
    if(!isLine3dMode()){
      return;
    }
    if(!lineHot || !Array.isArray(changes) || !changes.length){
      return;
    }
    if(source === 'line-axis-table-sync' || source === 'line-axis-inline'){
      return;
    }
    const data = lineHot.getData ? (lineHot.getData() || []) : [];
    const headerRow = Array.isArray(data[0]) ? data[0] : [];
    const colCount = typeof lineHot.countCols === 'function'
      ? lineHot.countCols()
      : headerRow.length;
    if(colCount <= 1){
      return;
    }
    const seriesCount = Math.max(0, inferLine3dSeriesCount(data));
    if(!seriesCount){
      return;
    }
    const pending = [];
    changes.forEach(change => {
      if(!Array.isArray(change) || change.length < 4){
        return;
      }
      const row = Number(change[0]);
      const col = Number(change[1]);
      if(row !== 0 || !Number.isInteger(col) || col < 1){
        return;
      }
      const nextValue = change[3];
      const resolved = nextValue != null ? String(nextValue).trim() : '';
      const parity = (col - 1) % 2;
      for(let s = 0; s < seriesCount; s += 1){
        const colIndex = 1 + s * 2 + parity;
        if(colIndex === col || colIndex >= colCount){
          continue;
        }
        const current = headerRow[colIndex] != null ? String(headerRow[colIndex]).trim() : '';
        if(current !== resolved){
          pending.push([0, colIndex, resolved]);
        }
      }
    });
    if(!pending.length){
      return;
    }
    lineHot.setDataAtCell(pending, 'line-axis-table-sync');
    lineDebug('Debug: line 3d header sync applied', { count: pending.length, source });
  }
  function recordLineChange(label, previous, next, apply){
    if(!lineUndoManager || typeof lineUndoManager.recordStateChange !== 'function'){
      return;
    }
    if(typeof apply !== 'function'){
      return;
    }
    lineUndoManager.recordStateChange({
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
  let lineLegendGuardWidth = chartStyle.LEGEND_LAYOUT_CONSTANTS?.basePlotMinWidth || 320;
  let lineSeriesStyles = {};
  let line3dLastSeriesCount = null;
  const lineModeCache = {
    twoD: null,
    threeD: null,
    lastTwoDFormat: 'single'
  };

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
    let lineGroupedControlsCollapsed = false;
    let lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, LINE_MIN_REPLICATES + 1));
  let lineLayout = null;
  let lineSeriesGroupLabels = [];
  let lineGroupShapes = [];
  let lineLastRegressionSummaries = [];
  const lineStatsDefaultPlaceholder = 'Statistics will appear after calculation.';
  const lineStatsEmptyPlaceholder = 'Add data to enable statistics.';
  const lineStatsState = {
    context: null,
    signature: null,
    version: 0,
    lastRunVersion: 0,
    computationPending: false
  };
  let lineForecastOptions = {
    horizon: DEFAULT_FORECAST_HORIZON,
    seasonLength: DEFAULT_FORECAST_SEASON,
    autoTune: true,
    criterion: 'bic'
  };
  const lineAdvisorState={
    open:false,
    activated:false,
    answers:{},
    lastApplied:null,
    context:null
  };

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

  function createLineAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } }
    };
  }

  function sanitizeLineAxisNotation(value){
    if(value === 'auto' || value === 'decimal' || value === 'scientific'){ return value; }
    return 'decimal';
  }

  let lineAxisSettings = createLineAxisSettings();
  let lineGridStyle = null;

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

  function ensureLineGridStyle(fallbackThickness){
    lineGridStyle = sanitizeLineGridStyle(lineGridStyle, fallbackThickness);
    return lineGridStyle;
  }

  function getLineGridStyle(fallbackThickness){
    return sanitizeLineGridStyle(ensureLineGridStyle(fallbackThickness), fallbackThickness);
  }

  function setLineGridStyle(style, fallbackThickness){
    lineGridStyle = sanitizeLineGridStyle(style, fallbackThickness);
  }

  function ensureLineAxisSettings(){
    if(!lineAxisSettings || typeof lineAxisSettings !== 'object'){
      lineAxisSettings = createLineAxisSettings();
    }
    if(!lineAxisSettings.x || typeof lineAxisSettings.x !== 'object'){
      lineAxisSettings.x = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } };
    }
    if(!lineAxisSettings.y || typeof lineAxisSettings.y !== 'object'){
      lineAxisSettings.y = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'decimal', additionalTicks: [], brokenAxis: { enabled: false, segments: [] } };
    }
    if(typeof lineAxisSettings.x.minorTicks !== 'boolean'){
      lineAxisSettings.x.minorTicks = false;
    }
    if(typeof lineAxisSettings.y.minorTicks !== 'boolean'){
      lineAxisSettings.y.minorTicks = false;
    }
    lineAxisSettings.x.minorTickSubdivisions = clampMinorTickSubdivisions(lineAxisSettings.x.minorTickSubdivisions);
    lineAxisSettings.y.minorTickSubdivisions = clampMinorTickSubdivisions(lineAxisSettings.y.minorTickSubdivisions);
    // Ensure broken axis structures
    if(!lineAxisSettings.x.brokenAxis || typeof lineAxisSettings.x.brokenAxis !== 'object'){
      lineAxisSettings.x.brokenAxis = { enabled: false, segments: [] };
    }
    if(typeof lineAxisSettings.x.brokenAxis.enabled !== 'boolean'){
      lineAxisSettings.x.brokenAxis.enabled = false;
    }
    if(!Array.isArray(lineAxisSettings.x.brokenAxis.segments)){
      lineAxisSettings.x.brokenAxis.segments = [];
    }
    if(!lineAxisSettings.y.brokenAxis || typeof lineAxisSettings.y.brokenAxis !== 'object'){
      lineAxisSettings.y.brokenAxis = { enabled: false, segments: [] };
    }
    if(typeof lineAxisSettings.y.brokenAxis.enabled !== 'boolean'){
      lineAxisSettings.y.brokenAxis.enabled = false;
    }
    if(!Array.isArray(lineAxisSettings.y.brokenAxis.segments)){
      lineAxisSettings.y.brokenAxis.segments = [];
    }
    const strokeNumeric = Number(lineAxisSettings.strokeWidth);
    lineAxisSettings.strokeWidth = Number.isFinite(strokeNumeric) && strokeNumeric > 0 ? strokeNumeric : 1;
    if(typeof lineAxisSettings.color !== 'string' || !lineAxisSettings.color){
      lineAxisSettings.color = DEFAULT_AXIS_COLOR;
    }
    lineAxisSettings.x.notation = sanitizeLineAxisNotation(lineAxisSettings.x.notation);
    lineAxisSettings.y.notation = sanitizeLineAxisNotation(lineAxisSettings.y.notation);
    lineAxisSettings.x.additionalTicks = sanitizeLineAxisAdditionalTicks(lineAxisSettings.x.additionalTicks);
    lineAxisSettings.y.additionalTicks = sanitizeLineAxisAdditionalTicks(lineAxisSettings.y.additionalTicks);
    return lineAxisSettings;
  }

  function getLineAxisNotation(axis){
    if(axis !== 'x' && axis !== 'y'){ return 'auto'; }
    const settings = ensureLineAxisSettings();
    return sanitizeLineAxisNotation(settings[axis]?.notation);
  }

  function updateLineAxisNotation(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureLineAxisSettings();
    const nextValue = sanitizeLineAxisNotation(value);
    if(settings[axis].notation === nextValue){ return; }
    settings[axis].notation = nextValue;
    console.debug('Debug: line axis notation updated',{ axis, notation: nextValue });
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
    }
  }

  function getLineAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureLineAxisSettings();
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
    console.debug('Debug: line axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
    }
  }

  function getLineAxisMinorTicksEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureLineAxisSettings();
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
    console.debug('Debug: line minor ticks updated',{ axis, enabled: nextValue });
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
    }
  }

  function getLineAxisMinorTickSubdivisions(axis){
    if(axis !== 'x' && axis !== 'y'){ return DEFAULT_MINOR_TICK_SUBDIVISIONS; }
    const settings = ensureLineAxisSettings();
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
    console.debug('Debug: line minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
    }
  }

  function getLineAxisAdditionalTicks(axis){
    if(axis !== 'x' && axis !== 'y'){
      return [];
    }
    const settings = ensureLineAxisSettings();
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
    lineDebug('Debug: line axis additional ticks updated', {
      axis,
      count: settings[axis].additionalTicks.length
    });
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
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

  function getLineAxisStrokeWidth(){
    const settings = ensureLineAxisSettings();
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
    console.debug('Debug: line axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
    }
  }

  function getLineAxisColor(){
    const settings = ensureLineAxisSettings();
    return settings.color || DEFAULT_AXIS_COLOR;
  }

  function updateLineAxisColor(value){
    const settings = ensureLineAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    console.debug('Debug: line axis color updated',{ color: settings.color });
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
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
        scheduleLineDraw();
      },
      getStyle: () => getLineGridStyle(fallbackThickness),
      onStyleChange: style => {
        setLineGridStyle(style, fallbackThickness);
        scheduleLineDraw();
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
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
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
    if(typeof scheduleLineDraw === 'function'){
      scheduleLineDraw();
    }
  }

  function resolveLineResizeGuardCap(){
    const svgBox = refs.svgBox || lineLayout?.elements?.svgBox || null;
    const datasetMin = Number(svgBox?.dataset?.resizerMinWidth);
    if(Number.isFinite(datasetMin) && datasetMin > 0){
      return datasetMin;
    }
    const defaultWidth = Number(chartStyle?.DEFAULT_WIDTH);
    const resizeMinScale = Number(chartStyle?.RESIZE_MIN_SCALE);
    if(Number.isFinite(defaultWidth) && defaultWidth > 0 && Number.isFinite(resizeMinScale) && resizeMinScale > 0){
      return Math.max(1, Math.round(defaultWidth * resizeMinScale));
    }
    return null;
  }

  function applyLineLegendGuardWidth(requiredWidth){
    const normalized = Number.isFinite(requiredWidth) ? Math.max(0, Math.round(requiredWidth)) : 0;
    const guardCap = resolveLineResizeGuardCap();
    const effectiveWidth = Number.isFinite(guardCap) && guardCap > 0 ? Math.min(normalized, guardCap) : normalized;
    const changed = effectiveWidth !== lineLegendGuardWidth;
    lineLegendGuardWidth = effectiveWidth;
    if(!lineLayout){
      if(changed){
        console.debug('Debug: line legend guard pending layout',{ requiredWidth: normalized, appliedWidth: effectiveWidth, cap: guardCap });
      }
      return;
    }
    if(!changed){
      return;
    }
    try{
      lineLayout.updateMinSvgWidth?.(effectiveWidth);
    }catch(err){
      console.error('line legend guard update error', err);
    }
    try{
      lineLayout.syncPanels?.({ skipSchedule: true, reason: 'legend-guard' });
    }catch(err){
      console.error('line legend guard sync error', err);
    }
    console.debug('Debug: line legend guard width applied',{ requestedWidth: normalized, appliedWidth: effectiveWidth, cap: guardCap });
  }

  function getLineLockRatioCheckbox(){
    if(lineLockRatioInput && lineLockRatioInput.isConnected){
      return lineLockRatioInput;
    }
    const svgBox = lineSvgBoxRef || refs.svgBox;
    if(!svgBox){
      return null;
    }
    const checkbox = svgBox.querySelector('.resizer-aspect-checkbox');
    if(checkbox){
      lineLockRatioInput = checkbox;
    }
    return checkbox;
  }

  function syncLineAspectControls(reason){
    if(lineAspectSyncing){
      return;
    }
    lineAspectSyncing = true;
    try{
      const equalAxesEnabled = !!lineViewState.equalAxes;
      const equalScaleEnabled = !!lineViewState.equalScaleAxes;
      const varianceAxesEnabled = !!lineViewState.axesVarianceScaled;
      const viewModeValue = refs.viewMode?.value || lineViewState.viewMode || '2d';
      const replicateModeValue = refs.replicateMode?.value;
      const is3dView = String(viewModeValue).toLowerCase() === '3d' || String(replicateModeValue).toLowerCase() === '3d';
      const enforceLockRatio = equalAxesEnabled || equalScaleEnabled || varianceAxesEnabled || is3dView;
      if(lineEqualAxesInput && lineEqualAxesInput.checked !== equalAxesEnabled){
        lineEqualAxesInput.checked = equalAxesEnabled;
      }
      if(lineEqualScaleAxesInput && lineEqualScaleAxesInput.checked !== equalScaleEnabled){
        lineEqualScaleAxesInput.checked = equalScaleEnabled;
      }
      if(lineVarianceAxisScaleInput && lineVarianceAxisScaleInput.checked !== varianceAxesEnabled){
        lineVarianceAxisScaleInput.checked = varianceAxesEnabled;
      }
      const lockRatioCheckbox = getLineLockRatioCheckbox();
      if(lockRatioCheckbox){
        const lockLabel = lockRatioCheckbox.closest('label');
        if(enforceLockRatio){
          if(lineAxesLengthLockRatioPrevious === null){
            lineAxesLengthLockRatioPrevious = !!lockRatioCheckbox.checked;
          }
          if(!lockRatioCheckbox.checked){
            lockRatioCheckbox.checked = true;
            lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
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
          if(lineAxesLengthLockRatioPrevious !== null){
            const restoreValue = lineAxesLengthLockRatioPrevious;
            lineAxesLengthLockRatioPrevious = null;
            if(lockRatioCheckbox.checked !== restoreValue){
              lockRatioCheckbox.checked = restoreValue;
              lockRatioCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
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
    const svgBox = lineSvgBoxRef || refs.svgBox;
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
    const legacyEqualAxesControl = tray.querySelector('.resizer-equalaxes-control');
    if(legacyEqualAxesControl){
      legacyEqualAxesControl.remove();
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
      const legacyEqualItem = equalLengthItem ? null : menu.querySelector('.resizer-axeslength-item--equal');
      if(!equalLengthItem && legacyEqualItem){
        equalLengthItem = legacyEqualItem;
        equalLengthItem.classList.remove('resizer-axeslength-item--equal');
        equalLengthItem.classList.add('resizer-axeslength-item--equal-length');
      }
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
          const previous = !!lineViewState.equalScaleAxes;
          if(enabled){
            lineViewState.equalAxes = false;
            lineViewState.axesVarianceScaled = false;
            if(lineEqualAxesInput){
              lineEqualAxesInput.checked = false;
            }
            if(lineVarianceAxisScaleInput){
              lineVarianceAxisScaleInput.checked = false;
            }
            lineDebug('Debug: line axes length exclusivity enforced', { disabled: 'equal-length/variance', reason: 'equal-scale-toggle' });
          }
          lineViewState.equalScaleAxes = enabled;
          lineDebug('Debug: line equal scale toggled', { enabled, previous });
          syncLineAspectControls('equal-scale-toggle');
          if(typeof scheduleLineDraw === 'function'){
            scheduleLineDraw({ reason: 'equal-scale-toggle' });
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
          const previous = !!lineViewState.equalAxes;
          if(enabled){
            lineViewState.equalScaleAxes = false;
            lineViewState.axesVarianceScaled = false;
            if(lineEqualScaleAxesInput){
              lineEqualScaleAxesInput.checked = false;
            }
            if(lineVarianceAxisScaleInput){
              lineVarianceAxisScaleInput.checked = false;
            }
            lineDebug('Debug: line axes length exclusivity enforced', { disabled: 'equal-scale/variance', reason: 'equal-length-toggle' });
          }
          lineViewState.equalAxes = enabled;
          lineDebug('Debug: line equal length toggled', { enabled, previous });
          syncLineAspectControls('equal-length-toggle');
          if(typeof scheduleLineDraw === 'function'){
            scheduleLineDraw({ reason: 'equal-length-toggle' });
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
          const previous = !!lineViewState.axesVarianceScaled;
          if(enabled){
            lineViewState.equalAxes = false;
            lineViewState.equalScaleAxes = false;
            if(lineEqualAxesInput){
              lineEqualAxesInput.checked = false;
            }
            if(lineEqualScaleAxesInput){
              lineEqualScaleAxesInput.checked = false;
            }
            lineDebug('Debug: line axes length exclusivity enforced', { disabled: 'equal-length/equal-scale', reason: 'variance-axis-toggle' });
          }
          lineViewState.axesVarianceScaled = enabled;
          lineDebug('Debug: line variance axis scaling toggled', { enabled, previous });
          syncLineAspectControls('variance-axis-scale');
          if(typeof scheduleLineDraw === 'function'){
            scheduleLineDraw({ reason: 'variance-axis-scale' });
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
    const svgBox = lineSvgBoxRef || refs.svgBox;
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
        if(options.allowHtml){
          refs.plot.innerHTML = options.message;
        }else{
          refs.plot.textContent = options.message;
        }
      }
      refs.plot.style.display = 'block';
    }
    if(options.clearStats !== false && refs.statsResults){
      refs.statsResults.textContent = '';
    }
    if(options.resetLegend !== false){
      lineLegendItems = [];
      lineLegendWidth = 0;
      lineLegendLayoutInfo = createDefaultLineLegendLayoutInfo();
      applyLineLegendGuardWidth(lineLegendLayoutInfo.minSvgWidth);
    }
    console.debug('Debug: line render state reset',{ reason, hasMessage: !!options.message });
  }

  function clearLineStatsOutputs(message){
    const placeholder = message || lineStatsDefaultPlaceholder;
    if(refs.statsResults){
      refs.statsResults.textContent = placeholder;
    }
  }

  function setLineStatsStatus(message){
    if(refs.statsStatus){
      refs.statsStatus.textContent = message || '';
    }
  }

  function updateLineStatsButtonState(config = {}){
    if(!refs.statsButton){
      return;
    }
    if(Object.prototype.hasOwnProperty.call(config,'disabled')){
      refs.statsButton.disabled = !!config.disabled;
    }
    if(typeof config.label === 'string' && config.label){
      refs.statsButton.textContent = config.label;
    }
  }

  function formatLineSignatureNumber(value){
    if(Number.isFinite(value)){
      return Number(value).toPrecision(6);
    }
    return 'na';
  }

  function buildLineStatsSignature(payload){
    if(!payload || !Array.isArray(payload.series) || !payload.series.length){
      return 'empty';
    }
    const method = payload.controls?.method || 'pearson';
    const regressionMode = payload.controls?.regressionMode || 'linear';
    const showIntervalsKey = payload.statsOptions?.showIntervals ? 'intervals:on' : 'intervals:off';
    const showDiagnosticsKey = payload.statsOptions?.showDiagnostics ? 'diagnostics:on' : 'diagnostics:off';
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
    const cacheSize = payload.statsOptions?.regressionCache instanceof Map ? payload.statsOptions.regressionCache.size : 0;
    const cacheKey = `cache:${cacheSize}`;
    return [method, regressionMode, showIntervalsKey, showDiagnosticsKey, forecastKey, cacheKey, seriesKey].join('::');
  }

  function handleLineStatsUnavailable(statsOptions, placeholder){
    const advisorOptions = statsOptions || { showIntervals: !!refs.showIntervals?.checked, showDiagnostics: !!refs.showDiagnostics?.checked };
    renderLineStatsAdvisor([], advisorOptions);
    primeLineStatsContext(null, { placeholder: placeholder || lineStatsEmptyPlaceholder });
  }

  function primeLineStatsContext(payload, options = {}){
    if(!payload || !Array.isArray(payload.series) || !payload.series.length){
      lineStatsState.context = null;
      lineStatsState.signature = null;
      lineStatsState.version = 0;
      lineStatsState.lastRunVersion = 0;
      lineStatsState.computationPending = false;
      lineLastRegressionSummaries = [];
      clearLineStatsOutputs(options.placeholder || lineStatsEmptyPlaceholder);
      setLineStatsStatus('');
      updateLineStatsButtonState({ disabled: true, label: 'Calculate statistics' });
      return;
    }
    const signature = buildLineStatsSignature(payload);
    const changed = signature !== lineStatsState.signature;
    let version = lineStatsState.version || 0;
    if(changed){
      version += 1;
      lineStatsState.lastRunVersion = 0;
      lineLastRegressionSummaries = [];
    }else if(!version){
      version = 1;
    }
    lineStatsState.version = version;
    lineStatsState.signature = signature;
    lineStatsState.context = { ...payload, version, signature };
    if(changed){
      clearLineStatsOutputs(lineStatsDefaultPlaceholder);
      setLineStatsStatus('Statistics ready to calculate.');
      updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' });
      return;
    }
    if(lineStatsState.lastRunVersion === version && refs.statsResults?.childNodes?.length){
      setLineStatsStatus('Statistics up to date.');
      updateLineStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
    }else if(!lineStatsState.computationPending){
      setLineStatsStatus('Statistics ready to calculate.');
      updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' });
    }
  }

  function requestLineStatsContextRefresh(reason){
    const context = lineStatsState.context;
    if(!context || !Array.isArray(context.series) || !context.series.length){
      console.debug('Debug: line stats context refresh skipped',{ reason, hasContext: !!context });
      return false;
    }
    const refreshed = {
      ...context,
      statsOptions: {
        ...context.statsOptions,
        showIntervals: !!refs.showIntervals?.checked,
        showDiagnostics: !!refs.showDiagnostics?.checked
      },
      controls: {
        ...context.controls,
        method: refs.statType?.value || context.controls?.method || 'pearson',
        regressionMode: refs.regressionMode?.value || context.controls?.regressionMode || 'linear'
      }
    };
    if(context.statsOptions?.forecast){
      refreshed.statsOptions.forecast = { ...context.statsOptions.forecast };
    }
    console.debug('Debug: line stats context refresh',{ reason, seriesCount: refreshed.series.length });
    primeLineStatsContext(refreshed);
    // Persist active tab state when this refresh is triggered by user control changes
    try{
      const skipPersist = String(reason || '').toLowerCase().includes('payload') || String(reason || '').toLowerCase().includes('payload-restored');
      if(!skipPersist){
        const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
        if(sess && typeof sess.persistActiveTabState === 'function'){
          sess.persistActiveTabState(undefined, { reason: 'stats-control-change' });
        }
      }
    }catch(e){
      console.debug('Debug: persistActiveTabState after stats control change failed', { err: e?.message || String(e) });
    }
    return true;
  }

  function handleLineStatsComputeClick(){
    if(lineStatsState.computationPending){
      return;
    }
    const context = lineStatsState.context;
    if(!context || !Array.isArray(context.series) || !context.series.length){
      setLineStatsStatus('Statistics unavailable until data is loaded.');
      return;
    }
    lineStatsState.computationPending = true;
    updateLineStatsButtonState({ disabled: true, label: 'Calculating…' });
    setLineStatsStatus('Calculating statistics…');
    try{
      updateLineStats(context.series, context.statsOptions || {});
      lineStatsState.lastRunVersion = context.version;
      setLineStatsStatus('Statistics up to date.');
      updateLineStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
    }catch(err){
      console.error('line stats computation failed', err);
      if(refs.statsResults){
        refs.statsResults.textContent = 'Unable to compute statistics. See console for details.';
      }
      setLineStatsStatus('Failed to compute statistics.');
      updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' });
    }finally{
      lineStatsState.computationPending = false;
      // Persist the tab payload immediately if the computed results belong to the current context
      try{
        const stillCurrent = lineStatsState.context === context && lineStatsState.signature === context.signature;
        const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
        if(stillCurrent && lineStatsState.lastRunVersion === context.version){
          if(sess && typeof sess.persistActiveTabState === 'function'){
            sess.persistActiveTabState(undefined, { reason: 'stats-computed' });
          }
        }
      }catch(e){
        console.debug('Debug: persistActiveTabState after stats compute failed', { err: e?.message || String(e) });
      }
    }
  }

  function applyLineAxisSettings(settings){
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
    lineAxisSettings = base;
    ensureLineAxisSettings();
    console.debug('Debug: line axis settings applied',{ settings: lineAxisSettings });
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

  const refs = {};
  const lineOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'line',
    message: 'Rendering line chart...',
    getHost: () => (
      refs.svgBox
      || refs.graphPanel?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('lineGraphPanel')?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('lineGraphPanel')
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
    const renderRow = refs.renderRow || global.document?.getElementById?.('lineRenderRow');
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
    if(typeof Shared.debounceFrame === 'function'){
      let lastReason = 'frame';
      const debounced = Shared.debounceFrame(() => syncLineAutoDrawNoticeWidth(lastReason));
      return reason => {
        lastReason = reason || 'frame';
        debounced();
      };
    }
    return reason => syncLineAutoDrawNoticeWidth(reason || 'immediate');
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

  function activateLineDataToolbar(reason){
    const now = Date.now();
    if(now - lineDataToolbarLastActivation < 80){
      return false;
    }
    lineDataToolbarLastActivation = now;
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
    if(!hotInstance.__lineDataViewsManager){
      hotInstance.__lineDataViewsManager = Shared.dataViews.createManager({
        componentKey: 'line',
        maxViews: LINE_DATA_VIEW_MAX,
        initialData: hotInstance.getData() || [],
        onActiveViewChanged(view){
          if(!view || !hotInstance || typeof hotInstance.loadData !== 'function'){
            return;
          }
          const nextData = Array.isArray(view.data) ? view.data : [];
          hotInstance.loadData(nextData);
          if(view.exclusions){
            hotInstance.applyExclusions?.(view.exclusions);
          }
          if(lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d'){
            scheduleLine3dDatasetSync('data-view-switch');
          }
          markLineOverlayPending('data-view-switch');
          scheduleLineDraw({ reason: 'data-view-switch' });
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
    const hostWrapper = options.wrapper || refs.hotWrapper || global.document?.getElementById?.('lineHotWrapper') || null;
    const hostContainer = options.container || hotInstance.__lineHostContainer || refs.hotContainer || global.document?.getElementById?.('lineHot') || null;
    if(hostWrapper && hostContainer){
      manager.mount({
        wrapper: hostWrapper,
        tableContainer: hostContainer
      });
      manager.refresh?.();
    }
    lineDataViewsManager = manager;
    return manager;
  }

  function syncLineActiveDataViewFromHot(hotInstance, reason){
    const hot = hotInstance || lineHot || refs.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return;
    }
    const manager = hot.__lineDataViewsManager || lineDataViewsManager;
    if(!manager){
      return;
    }
    manager.updateActiveData(hot.getData() || []);
    manager.updateActiveExclusions(hot?.exportExclusions?.() || null);
    if(reason === 'afterLoadData'){
      manager.refresh?.();
    }
  }

  function applyLineTransformToNewView(transformSpec, options = {}){
    const hot = line.__ensureHotForActiveTab?.() || lineHot || refs.hot;
    if(!hot){
      return false;
    }
    const manager = ensureLineDataViewsForHot(hot, {
      wrapper: refs.hotWrapper,
      container: hot.__lineHostContainer || refs.hotContainer
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
    const hot = line.__ensureHotForActiveTab?.() || lineHot || refs.hot;
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
    if(lineDataToolbarBound || !global.document){
      return;
    }
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
    if(refs.hotWrapper && !refs.hotWrapper.__lineDataToolbarFocusBound){
      refs.hotWrapper.addEventListener('mousedown', () => {
        activateLineDataToolbar('table-mousedown');
      }, true);
      refs.hotWrapper.__lineDataToolbarFocusBound = true;
    }
    lineDataToolbarBound = true;
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
    el.addEventListener('mouseenter', handleLineMarkerEnter);
    el.addEventListener('mousemove', handleLineMarkerMove);
    el.addEventListener('mouseleave', handleLineMarkerLeave);
    el.addEventListener('click', handleLineMarkerClick);
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
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    if(Shared.symbolToolbar && typeof Shared.symbolToolbar.show === 'function'){
      const dotSizeInput = doc.getElementById('lineDotSize');
      const fillInput = doc.getElementById('lineFill');
      const strokeInput = doc.getElementById('lineBorder');
      const strokeWidthInput = doc.getElementById('lineBorderWidth');
      const alphaInput = doc.getElementById('lineAlpha');
      const alphaVal = doc.getElementById('lineAlphaVal');
      const seriesKey = target?.__linePointData?.seriesName || target?.dataset?.series || null;
      const resolveAlpha = value => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
      };
      const applyAndDispatch = (inputEl, value, type = 'input') => {
        if(!inputEl){ return; }
        inputEl.value = value;
        inputEl.dispatchEvent(new Event(type, { bubbles: true }));
      };
      const ensureSeriesStyle = () => {
        if(!seriesKey){ return null; }
        const prev = lineSeriesStyles[seriesKey];
        if(prev && typeof prev === 'object'){
          return prev;
        }
        lineSeriesStyles[seriesKey] = {};
        return lineSeriesStyles[seriesKey];
      };
      const applySeriesPatch = patch => {
        if(!seriesKey){ return; }
        const style = ensureSeriesStyle();
        Object.assign(style, patch);
        scheduleLineDraw();
      };
      const knownSeriesKeys = () => {
        const keys = new Set(Object.keys(lineSeriesStyles || {}));
        if(Array.isArray(lineSeriesGroupLabels)){
          lineSeriesGroupLabels.forEach(name => {
            const normalized = name == null ? '' : String(name).trim();
            if(normalized){ keys.add(normalized); }
          });
        }
        if(seriesKey){ keys.add(seriesKey); }
        return Array.from(keys);
      };
      const applyGlobalPatch = (key, value) => {
        const keys = knownSeriesKeys();
        keys.forEach(k => {
          lineSeriesStyles[k] = Object.assign({}, lineSeriesStyles[k], { [key]: value });
        });
        scheduleLineDraw();
      };
      const resolveSeriesStyle = () => (seriesKey ? (lineSeriesStyles[seriesKey] || {}) : {});
      const getMarkerFill = scope => {
        const style = resolveSeriesStyle();
        if(scope === 'series' && seriesKey){
          return style?.markerFill || style?.fill || lineLabelColors[seriesKey] || fillInput?.value || '#377eb8';
        }
        return fillInput?.value || '#377eb8';
      };
      const getMarkerBorderColor = scope => {
        const style = resolveSeriesStyle();
        if(scope === 'series' && seriesKey){
          return style?.markerStroke || style?.stroke || style?.borderColor || '#000000';
        }
        if(typeof style?.markerStroke === 'string' && style.markerStroke){ return style.markerStroke; }
        if(typeof style?.stroke === 'string' && style.stroke){ return style.stroke; }
        if(typeof style?.borderColor === 'string' && style.borderColor){ return style.borderColor; }
        return '#000000';
      };
      const getMarkerBorderWidth = scope => {
        const style = resolveSeriesStyle();
        if(scope === 'series' && seriesKey){
          if(Number.isFinite(Number(style?.markerStrokeWidth))){ return Number(style.markerStrokeWidth); }
          if(Number.isFinite(Number(style?.strokeWidth))){ return Number(style.strokeWidth); }
        }
        if(Number.isFinite(Number(style?.markerStrokeWidth))){ return Number(style.markerStrokeWidth); }
        if(Number.isFinite(Number(style?.strokeWidth))){ return Number(style.strokeWidth); }
        return 0;
      };
      const getMarkerAlpha = scope => {
        const style = resolveSeriesStyle();
        if(scope === 'series' && seriesKey){
          if(resolveAlpha(style?.markerAlpha) != null){ return resolveAlpha(style.markerAlpha); }
          if(resolveAlpha(style?.alpha) != null){ return resolveAlpha(style.alpha); }
        }
        if(resolveAlpha(style?.markerAlpha) != null){ return resolveAlpha(style.markerAlpha); }
        if(resolveAlpha(style?.alpha) != null){ return resolveAlpha(style.alpha); }
        return resolveAlpha(alphaInput?.value) || 0;
      };
      const getPathColor = scope => {
        const style = resolveSeriesStyle();
        if(scope === 'series' && seriesKey){
          return style?.lineStroke || lineLabelColors[seriesKey] || strokeInput?.value || '#000000';
        }
        return strokeInput?.value || '#000000';
      };
      const getPathWidth = scope => {
        const style = resolveSeriesStyle();
        if(scope === 'series' && seriesKey){
          if(Number.isFinite(Number(style?.lineStrokeWidth))){ return Number(style.lineStrokeWidth); }
          if(Number.isFinite(Number(style?.strokeWidth))){ return Number(style.strokeWidth); }
        }
        if(Number.isFinite(Number(strokeWidthInput?.value))){
          return Number(strokeWidthInput.value);
        }
        return Number(target.getAttribute('stroke-width')) || 0;
      };
      const getPathAlpha = scope => {
        const style = resolveSeriesStyle();
        if(scope === 'series' && seriesKey){
          if(resolveAlpha(style?.lineAlpha) != null){ return resolveAlpha(style.lineAlpha); }
          if(resolveAlpha(style?.alpha) != null){ return resolveAlpha(style.alpha); }
        }
        return resolveAlpha(alphaInput?.value) || 0;
      };
      const sanitizeShape = (shape, index = 0) => sanitizeLineGroupShape(shape, index);
      const symbolToolbarState = Shared.symbolToolbar.show({
        document: doc,
        target,
        anchorId: 'lineFontHost',
        scopeId: 'line',
        formClass: 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls line-point-controls',
        scope: {
          label: 'Scope',
          options: [
            { value: 'series', label: 'Series', disabled: !seriesKey },
            { value: 'global', label: 'Global', disabled: false }
          ],
          value: seriesKey ? 'series' : 'global'
        },
        fillShape: {
          label: 'Fill/Shape',
          shapeOptions: LINE_GROUP_SHAPE_OPTIONS?.length ? LINE_GROUP_SHAPE_OPTIONS : [{ value: 'circle', label: 'Circle' }],
          getColor(ctx){
            return getMarkerFill(ctx.scope);
          },
          getShape(ctx){
            if(ctx.scope === 'series' && seriesKey){
              const idx = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.findIndex(name => name === seriesKey) : -1;
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
            if(ctx.scope === 'series' && seriesKey){
              applySeriesPatch({ markerFill: nextColor, fill: nextColor });
            }else{
              if(fillInput){ applyAndDispatch(fillInput, nextColor); }
              applyGlobalPatch('markerFill', nextColor);
              applyGlobalPatch('fill', nextColor);
            }
          },
          onColorChange(nextColor, ctx){
            if(ctx.scope === 'series' && seriesKey){
              applySeriesPatch({ markerFill: nextColor, fill: nextColor });
            }else{
              if(fillInput){ applyAndDispatch(fillInput, nextColor); }
              applyGlobalPatch('markerFill', nextColor);
              applyGlobalPatch('fill', nextColor);
            }
          },
          onShapeChange(nextShape, ctx){
            if(!LINE_GROUP_SHAPE_OPTIONS?.length){ return; }
            if(ctx.scope === 'series' && seriesKey){
              const idx = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.findIndex(name => name === seriesKey) : -1;
              const safe = idx >= 0 ? idx : 0;
              const shapes = ensureLineGroupShapeCapacity(Math.max((lineSeriesGroupLabels || []).length, safe + 1));
              shapes[safe] = sanitizeShape(nextShape, safe);
              lineGroupShapes = shapes;
              updateLineGroupShapeSelect(safe, shapes[safe]);
              scheduleLineDraw();
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
              lineGroupShapes = shapes;
              scheduleLineDraw();
            }
          }
        },
        border: {
          label: 'Border',
          getColor(ctx){
            return getMarkerBorderColor(ctx.scope);
          },
          onColorInput(nextColor, ctx){
            if(ctx.scope === 'series' && seriesKey){
              applySeriesPatch({ markerStroke: nextColor });
            }else{
              applyGlobalPatch('markerStroke', nextColor);
            }
          },
          onColorChange(nextColor, ctx){
            if(ctx.scope === 'series' && seriesKey){
              applySeriesPatch({ markerStroke: nextColor });
            }else{
              applyGlobalPatch('markerStroke', nextColor);
            }
          },
          getWidth(ctx){
            return getMarkerBorderWidth(ctx.scope);
          },
          onWidthChange(nextValue, ctx){
            const next = Math.max(0, Number(nextValue) || 0);
            if(ctx.scope === 'series' && seriesKey){
              applySeriesPatch({ markerStrokeWidth: next });
            }else{
              applyGlobalPatch('markerStrokeWidth', next);
            }
          }
        },
        size: {
          get(ctx){
            const style = seriesKey ? lineSeriesStyles[seriesKey] || {} : null;
            if(ctx.scope === 'series' && seriesKey && Number.isFinite(Number(style?.dotSize))){
              return Number(style.dotSize);
            }
            if(Number.isFinite(Number(dotSizeInput?.value))){
              return Number(dotSizeInput.value);
            }
            return Number(target.getAttribute('r')) || 0;
          },
          onChange(nextValue, ctx){
            const next = Math.max(0, Number(nextValue) || 0);
            if(ctx.scope === 'series' && seriesKey){
              applySeriesPatch({ dotSize: next });
            }else{
              if(dotSizeInput){ applyAndDispatch(dotSizeInput, String(next)); }
              applyGlobalPatch('dotSize', next);
            }
          }
        },
        transparency: {
          label: 'Transparency',
          get(ctx){
            return getMarkerAlpha(ctx.scope);
          },
          onChange(nextValue, ctx){
            const normalized = Math.min(1, Math.max(0, Number(nextValue) || 0));
            if(ctx.scope === 'series' && seriesKey){
              applySeriesPatch({ markerAlpha: normalized });
            }else{
              applyGlobalPatch('markerAlpha', normalized);
            }
          }
        }
      });
      const toolbarHost = symbolToolbarState?.host || null;
      const markerScopeSelect = symbolToolbarState?.scopeSelect || null;
      if(toolbarHost){
        const normalizeScope = value => (value === 'series' && seriesKey) ? 'series' : 'global';
        let lineScopeValue = normalizeScope(markerScopeSelect?.value || (seriesKey ? 'series' : 'global'));
        const resolveScope = ctx => normalizeScope(ctx?.scope || lineScopeValue || markerScopeSelect?.value || 'global');
        const setLineScope = (value, options) => {
          const opts = options || {};
          const normalized = normalizeScope(value);
          lineScopeValue = normalized;
          if(markerScopeSelect && markerScopeSelect.value !== normalized){
            markerScopeSelect.value = normalized;
            if(opts.dispatchMarkerChange !== false){
              markerScopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          return normalized;
        };
        const syncPathToolbar = () => {
          try{
            lineScopeValue = normalizeScope(markerScopeSelect?.value || lineScopeValue);
            if(additionalLineControls && typeof additionalLineControls.setScope === 'function'){
              additionalLineControls.setScope(lineScopeValue, { triggerChange: false });
            }
            if(additionalLineControls && typeof additionalLineControls.refresh === 'function'){
              additionalLineControls.refresh();
            }
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
              options: [
                { value: 'series', label: 'Series', disabled: !seriesKey },
                { value: 'global', label: 'Global', disabled: false }
              ],
              value: lineScopeValue,
              onChange(nextScope){
                setLineScope(nextScope);
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
            getColor: ctx => getPathColor(resolveScope(ctx)),
            getThickness: ctx => getPathWidth(resolveScope(ctx)),
            getTransparency: ctx => Math.round(Math.min(1, Math.max(0, Number(getPathAlpha(resolveScope(ctx))) || 0)) * 100),
            onColorInput: (nextColor, ctx) => {
              const scope = resolveScope(ctx);
              if(scope === 'series' && seriesKey){
                applySeriesPatch({ lineStroke: nextColor });
              }else{
                if(strokeInput){ applyAndDispatch(strokeInput, nextColor); }
                applyGlobalPatch('lineStroke', nextColor);
              }
            },
            onColorChange: (nextColor, ctx) => {
              const scope = resolveScope(ctx);
              if(scope === 'series' && seriesKey){
                applySeriesPatch({ lineStroke: nextColor });
              }else{
                if(strokeInput){ applyAndDispatch(strokeInput, nextColor); }
                applyGlobalPatch('lineStroke', nextColor);
              }
            },
            onThicknessChange: (nextValue, ctx) => {
              const next = Math.max(0, Number(nextValue) || 0);
              const scope = resolveScope(ctx);
              if(scope === 'series' && seriesKey){
                applySeriesPatch({ lineStrokeWidth: next });
              }else{
                if(strokeWidthInput){ applyAndDispatch(strokeWidthInput, String(next)); }
                applyGlobalPatch('lineStrokeWidth', next);
              }
            },
            onTransparencyChange: (nextValue, ctx) => {
              const bounded = Math.min(100, Math.max(0, Number(nextValue) || 0));
              const normalized = bounded / 100;
              const scope = resolveScope(ctx);
              if(scope === 'series' && seriesKey){
                applySeriesPatch({ lineAlpha: normalized });
              }else{
                if(alphaInput){ applyAndDispatch(alphaInput, String(normalized)); }
                if(alphaVal){ alphaVal.textContent = String(normalized); }
                applyGlobalPatch('lineAlpha', normalized);
              }
            }
          });
          toolbarHost.style.display = 'grid';
          toolbarHost.style.gridAutoFlow = 'column';
          toolbarHost.style.gridAutoColumns = 'max-content';
          toolbarHost.style.columnGap = '10px';
          toolbarHost.style.alignItems = 'flex-start';
        }
        if(markerScopeSelect){
          markerScopeSelect.addEventListener('change', () => {
            setLineScope(markerScopeSelect.value, { dispatchMarkerChange: false });
            syncPathToolbar();
          });
        }
        syncPathToolbar();
      }
      return;
    }
    return;
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
  const serializeSvg = (svgEl, options) => {
    const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
    if (typeof fn === 'function') {
      return fn(svgEl, options);
    }
    if (!svgEl) return '';
    const serializer = new (global.XMLSerializer || XMLSerializer)();
    return serializer.serializeToString(svgEl);
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
    if(typeof formatter === 'function'){
      return formatter(p);
    }
    if(p === 0) return '0';
    return Number(p).toExponential(5);
  }

  const formatMetricValue = (value, digits = 4) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a';

  const formatPercent = (value, digits = 2) => {
    if(!Number.isFinite(value)) return 'n/a';
    return `${(value * 100).toFixed(digits)}%`;
  };

  const clampForecastHorizon = (value) => {
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_FORECAST_HORIZON;
    const bounded = Math.max(1, Math.min(MAX_FORECAST_HORIZON, resolved));
    console.debug('Debug: clampForecastHorizon', { value, numeric, resolved, bounded });
    return bounded;
  };

  const clampSeasonLength = (value) => {
    const numeric = Number(value);
    const resolved = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_FORECAST_SEASON;
    const bounded = Math.max(2, Math.min(60, resolved));
    console.debug('Debug: clampSeasonLength', { value, numeric, resolved, bounded });
    return bounded;
  };

  function resolveForecastOptions(options = {}){
    const next = { ...lineForecastOptions };
    if(refs.forecastHorizon){
      next.horizon = clampForecastHorizon(refs.forecastHorizon.value);
    }
    if(refs.forecastSeasonLength){
      next.seasonLength = clampSeasonLength(refs.forecastSeasonLength.value);
    }
    if(refs.forecastAuto){
      next.autoTune = !!refs.forecastAuto.checked;
    }
    if(refs.forecastCriterion){
      const critRaw = String(refs.forecastCriterion.value || '').toLowerCase();
      next.criterion = critRaw === 'aic' ? 'aic' : 'bic';
    }
    lineForecastOptions = next;
    if(options.syncInputs){
      if(refs.forecastHorizon){
        refs.forecastHorizon.value = String(next.horizon);
      }
      if(refs.forecastSeasonLength){
        refs.forecastSeasonLength.value = String(next.seasonLength);
      }
      if(refs.forecastAuto){
        refs.forecastAuto.checked = !!next.autoTune;
      }
      if(refs.forecastCriterion){
        refs.forecastCriterion.value = next.criterion;
      }
    }
    console.debug('Debug: resolveForecastOptions', next);
    return { ...next };
  }

  function updateForecastVisibility(){
    const mode = refs.regressionMode?.value;
    const show = mode === 'arima' || mode === 'holtWinters';
    if(refs.forecastFieldset){
      refs.forecastFieldset.style.display = show ? '' : 'none';
    }
    return show;
  }

  function buildLineAdvisorContext(series, options){
    const arr=Array.isArray(series)?series:[];
    const context={
      seriesCount: arr.length,
      statsMethod: refs.statType?.value || 'pearson',
      regressionMode: refs.regressionMode?.value || 'linear',
      showIntervals: options?.showIntervals ?? !!refs.showIntervals?.checked,
      showDiagnostics: options?.showDiagnostics ?? !!refs.showDiagnostics?.checked,
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
    context.hasForecastMode=['arima','holtWinters'].includes((refs.regressionMode?.value || '').toLowerCase());
    return context;
  }

  function ensureLineAdvisorDefaults(context){
    const answers=lineAdvisorState.answers || {};
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
    lineAdvisorState.answers=answers;
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
        help:'Seasonal data benefits from Holt–Winters smoothing; otherwise ARIMA is typically preferred.',
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
        recommendation.rationale.push('Holt–Winters captures recurring seasonal structure alongside trend and level.');
        if(!context.regularSpacing){
          recommendation.warnings.push('Holt–Winters assumes evenly spaced observations; verify spacing before forecasting.');
        }
        const seasonLength=context.forecastOptions?.seasonLength || 0;
        if(seasonLength>0 && context.maxLength < seasonLength*2){
          recommendation.warnings.push('Provide at least two full seasons of data for Holt–Winters to stabilize.');
        }
      }else{
        recommendation.rationale.push('ARIMA handles non-seasonal autoregressive patterns for forecasting.');
        if(context.avgLength<8){
          recommendation.warnings.push('ARIMA forecasting is unstable with fewer than ~8 time points per series.');
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
    const regressionLabels={
      linear:'linear regression',
      quadratic:'quadratic regression',
      cubic:'cubic regression',
      exponential:'exponential regression',
      power:'power-law regression',
      logistic:'logistic regression',
      spline:'spline smoothing',
      arima:'ARIMA forecasting',
      holtWinters:'Holt–Winters forecasting'
    };
    let summary=`${methodLabel} with ${regressionLabels[recommendation.regression] || recommendation.regression}`;
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

  function renderLineStatsAdvisor(series, options, providedContext){
    const container=document.getElementById('lineStatsAdvisor');
    if(!container){
      return;
    }
    const context=providedContext || buildLineAdvisorContext(series||[], options||{});
    lineAdvisorState.context=context;
    const answers=ensureLineAdvisorDefaults(context);
    const recommendation=computeLineAdvisorRecommendation(answers, context);
    container.innerHTML='';
    const wrapper=document.createElement('div');
    wrapper.className='stats-advisor';
    wrapper.dataset.open=lineAdvisorState.open?'1':'0';
    const header=document.createElement('div');
    header.className='stats-advisor__header';
    const title=document.createElement('strong');
    title.textContent='Test advisor';
    header.appendChild(title);
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='stats-advisor__toggle';
    toggle.textContent=lineAdvisorState.open?'Hide advisor':'Guide me';
    toggle.addEventListener('click',()=>{
      lineAdvisorState.open=!lineAdvisorState.open;
      if(lineAdvisorState.open && !lineAdvisorState.activated){
        lineAdvisorState.activated=true;
        console.debug('Debug: line statsAdvisor activated');
      }
      console.debug('Debug: line statsAdvisor toggled',{ open:lineAdvisorState.open });
      renderLineStatsAdvisor(null, null, lineAdvisorState.context);
    });
    header.appendChild(toggle);
    wrapper.appendChild(header);
    const summary=document.createElement('div');
    summary.className='stats-advisor__summary';
    if(!lineAdvisorState.activated){
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
    if(lineAdvisorState.open){
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
            lineAdvisorState.answers=answers;
            console.debug('Debug: line statsAdvisor answer change',{ question:question.id, value:option.value });
            renderLineStatsAdvisor(null, null, lineAdvisorState.context);
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
        if(refs.statType){
          refs.statType.value=recommendation.statsMethod;
        }
        if(refs.regressionMode){
          refs.regressionMode.value=recommendation.regression;
        }
        if(refs.showIntervals){
          refs.showIntervals.checked=!!recommendation.showIntervals;
        }
        if(refs.showDiagnostics){
          refs.showDiagnostics.checked=!!recommendation.showDiagnostics;
        }
        updateForecastVisibility();
        lineAdvisorState.lastApplied={ ...recommendation };
        console.debug('Debug: line statsAdvisor applied',{
          statsMethod:recommendation.statsMethod,
          regression:recommendation.regression,
          showIntervals:recommendation.showIntervals,
          showDiagnostics:recommendation.showDiagnostics,
          answers:{ ...answers }
        });
        scheduleLineDraw();
        renderLineStatsAdvisor(null, null, lineAdvisorState.context);
      });
      actions.appendChild(applyBtn);
      const resetBtn=document.createElement('button');
      resetBtn.type='button';
      resetBtn.className='stats-advisor__reset';
      resetBtn.textContent='Reset answers';
      resetBtn.addEventListener('click',()=>{
        lineAdvisorState.answers={};
        console.debug('Debug: line statsAdvisor reset');
        renderLineStatsAdvisor(null, null, lineAdvisorState.context);
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
    console.debug('Debug: clampLineReplicateCount',{ raw, numeric, resolved, bounded });
    return bounded;
  }

  function inferSeriesBaseName(label, fallback){
    if(label == null) return fallback;
    const raw = String(label).trim();
    if(!raw) return fallback;
    const cleaned = raw
      .replace(/\s*\(?(?:rep(?:licate)?|r)\s*#?\d+\)?$/i,'')
      .replace(/\s*[:\-]\s*(?:rep(?:licate)?|r)\s*#?\d+$/i,'')
      .replace(/\s*(?:rep(?:licate)?|r)\s*#?\d+$/i,'')
      .replace(/\s*[:\-]\s*y\d+$/i,'')
      .replace(/\s*y\d+$/i,'')
      .trim();
    const result = cleaned || fallback;
    console.debug('Debug: inferSeriesBaseName',{ label: raw, result, fallback });
    return result;
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
    if(!refs.groupedList){
      return 0;
    }
    const rows = refs.groupedList.querySelectorAll?.('.grouped-row');
    return rows ? rows.length : 0;
  }

  function ensureLineGroupShapeCapacity(count){
    const safeCount = Math.max(0, count | 0);
    const nextShapes = new Array(safeCount);
    for(let i=0;i<safeCount;i+=1){
      const existing = Array.isArray(lineGroupShapes) ? lineGroupShapes[i] : undefined;
      nextShapes[i] = sanitizeLineGroupShape(existing, i);
    }
    lineGroupShapes = nextShapes;
    return lineGroupShapes;
  }

  function getLineGroupShape(index){
    const safeIndex = Number.isInteger(index) ? index : 0;
    const shapes = ensureLineGroupShapeCapacity(Math.max(Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0, safeIndex + 1));
    const resolved = sanitizeLineGroupShape(shapes[safeIndex], safeIndex);
    if(shapes[safeIndex] !== resolved){
      shapes[safeIndex] = resolved;
      lineGroupShapes = shapes;
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
    lineSeriesGroupLabels = nextGroupLabels;
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
    lineGroupShapes = nextShapes;
    console.debug('Debug: line group labels synchronized', {
      shouldResetGroupLabels,
      preserveExistingLabels,
      overrideCount: overrideLabels?.length || 0,
      resolved: lineSeriesGroupLabels.slice(),
      shapes: lineGroupShapes.slice()
    }); // Debug: group label sync trace
    const newHeader = new Array(targetCols).fill('');
    newHeader[0] = headerRow[0] && String(headerRow[0]).trim() ? headerRow[0] : 'X';
    for(let s=0;s<seriesCount;s++){
      const groupLabel = lineSeriesGroupLabels[s] || `Series ${s+1}`;
      const groupLabelLower = groupLabel ? String(groupLabel).trim().toLowerCase() : '';
      for(let rep=0;rep<targetCount;rep++){
        const newIdx = 1 + s*targetCount + rep;
        if(newIdx >= targetCols) continue;
        let label = '';
        if(rep < sourceCount){
          const oldIdx = 1 + s*sourceCount + rep;
          if(oldIdx < headerRow.length){
            label = headerRow[oldIdx];
          }
        }
        const labelTrimmed = typeof label === 'string' ? label.trim() : '';
        if(targetCount > 1){
          if(!labelTrimmed){
            label = `Rep ${rep+1}`;
          }else{
            const lower = labelTrimmed.toLowerCase();
            const repMatch = /rep\s*\d+$/i.test(labelTrimmed);
            const baseMatch = lower === groupLabelLower || (groupLabelLower && lower.startsWith(groupLabelLower) && repMatch);
            if(baseMatch){
              label = `Rep ${rep+1}`;
            }else{
              label = labelTrimmed;
            }
          }
        }else{
          label = labelTrimmed || groupLabel;
        }
        newHeader[newIdx] = label;
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

  function updateLineNestedHeaders(structure){
    if(!lineHot) return;
    const replicates = Math.max(LINE_MIN_REPLICATES, lineReplicates);
    if(replicates <= 1){
      lineHot.updateSettings({ nestedHeaders: false });
      console.debug('Debug: updateLineNestedHeaders disabled',{ replicates });
      return;
    }
    let baseNames = Array.isArray(structure?.baseNames) ? structure.baseNames.slice() : [];
    let seriesCount = structure?.seriesCount;
    let headerRow = structure?.data ? structure.data[0] : null;
    if(!seriesCount || !baseNames.length){
      const data = lineHot.getData();
      headerRow = Array.isArray(data?.[0]) ? data[0] : [];
      seriesCount = Math.max(0, Math.floor(((headerRow?.length || 1) - 1) / replicates));
      baseNames = [];
      for(let s=0;s<seriesCount;s++){
        const fallback = `Series ${s+1}`;
        const idx = 1 + s*replicates;
        const label = headerRow?.[idx];
        baseNames.push(inferSeriesBaseName(label, fallback));
      }
    }
    const nestedRow = [];
    const xHeaderLabel = 'X values';
    nestedRow.push({ label: xHeaderLabel, colspan: 1 });
    for(let s=0;s<seriesCount;s++){
      const stored = lineSeriesGroupLabels?.[s];
      const label = stored && String(stored).trim() ? String(stored).trim() : (baseNames[s] || `Series ${s+1}`);
      nestedRow.push({ label, colspan: replicates });
    }
    lineHot.updateSettings({ nestedHeaders: [nestedRow] });
    applyLineNestedHeaderEditors();
    console.debug('Debug: updateLineNestedHeaders applied',{ replicates, seriesCount, baseNames, labels: lineSeriesGroupLabels.slice(), xHeaderLabel });
  }

  function applyLineNestedHeaderEditors(){
    if(!lineHot || lineReplicates <= 1) return;
    const root = lineHot.rootElement;
    if(!root) return;
    const headRows = root.querySelectorAll?.('thead tr');
    if(!headRows || !headRows.length) return;
    const topRow = headRows[0];
    if(!topRow) return;
    const headerCells = topRow.querySelectorAll?.('th');
    if(!headerCells || !headerCells.length) return;
    headerCells.forEach((cell, index)=>{
      if(!cell) return;
      if(index === 0){
        const current = cell.textContent?.trim();
        if(current !== 'X values'){
          cell.textContent = 'X values';
        }
        cell.dataset.lineHeaderRole = 'x-values';
        return;
      }
      const groupIndex = index - 1;
      const target = cell.querySelector?.('.ht_nestingLabel') || cell.querySelector?.('.ht__nested-header-label') || cell.querySelector?.('.ht__header-content') || cell;
      if(!target) return;
      if(target.dataset?.lineGroupEditable === '1') return;
      target.dataset.lineGroupEditable = '1';
      target.dataset.lineGroupIndex = String(groupIndex);
      makeEditableHelper(target, text => {
        updateLineSeriesGroupLabel(groupIndex, text);
      }, {
        promptMessage: 'Edit series group name',
        onEditStart: ()=>{
          console.debug('Debug: line group header edit start',{ index: groupIndex });
        },
        onEditEnd: (_node, value)=>{
          console.debug('Debug: line group header edit end',{ index: groupIndex, value });
        }
      });
    });
    console.debug('Debug: applyLineNestedHeaderEditors complete', {
      headerCount: headerCells.length,
      replicates: lineReplicates
    });
  }

  function updateLineSeriesGroupLabel(index, nextText){
    const idx = Number(index);
    if(!Number.isInteger(idx) || idx < 0) return;
    const existing = lineSeriesGroupLabels[idx];
    const sanitized = (typeof nextText === 'string' ? nextText : '').trim();
    const fallback = `Series ${idx+1}`;
    const resolved = sanitized || fallback;
    if(existing === resolved) return;
    const nextLabels = lineSeriesGroupLabels.slice();
    nextLabels[idx] = resolved;
    lineSeriesGroupLabels = nextLabels;
    if(existing && existing !== resolved && lineLabelColors[existing]){
      if(!lineLabelColors[resolved]){
        lineLabelColors[resolved] = lineLabelColors[existing];
      }
      delete lineLabelColors[existing];
    }
    console.debug('Debug: updateLineSeriesGroupLabel', {
      index: idx,
      existing,
      resolved
    });
    if(lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d'){
      updateLine3dNestedHeaders();
      renderLine3dList();
    }else{
      updateLineNestedHeaders();
      if(lineReplicates > LINE_MIN_REPLICATES){
        renderLineGroupedList();
      }
    }
    scheduleLineDraw();
  }

  function applyLineReplicateChange(newCount, options){
    const normalized = clampLineReplicateCount(newCount);
    const sourceReplicates = clampLineReplicateCount(options?.sourceReplicates ?? lineReplicates);
    const overrideData = options?.dataOverride;
    const matrix = Array.isArray(overrideData) ? overrideData : (lineHot ? lineHot.getData() : []);
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
    updateLineReplicateModeControls();
    if(lineHot){
      lineHot.loadData(structure.data);
      updateLineNestedHeaders(structure);
    }
    console.debug('Debug: applyLineReplicateChange',{ requested:newCount, normalized, sourceReplicates, seriesCount: structure.seriesCount, targetCols: structure.targetCols, shouldResetLabels });
    if(lineReplicates > LINE_MIN_REPLICATES){
      renderLineGroupedList();
    }else if(refs.groupedList){
      refs.groupedList.innerHTML = '';
    }
    if(!options?.skipDraw){
      scheduleLineDraw();
    }
    return structure;
  }

    function updateLineGroupedToggleUI(mode){
      if(!refs.groupedToggle){
        return;
      }
      const groupedActive = mode === 'grouped';
      const expanded = groupedActive && !lineGroupedControlsCollapsed;
      if(!groupedActive){
        refs.groupedToggle.hidden = true;
        refs.groupedToggle.disabled = true;
        refs.groupedToggle.setAttribute('aria-expanded', 'false');
        refs.groupedToggle.textContent = 'Show group settings';
        return;
      }
      refs.groupedToggle.hidden = false;
      refs.groupedToggle.disabled = false;
      refs.groupedToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      refs.groupedToggle.textContent = expanded ? 'Hide group settings' : 'Show group settings';
    }

    function updateLineReplicateModeControls(modeOverride){
      const wants3d = modeOverride === '3d'
        || lineViewState.viewMode === '3d'
        || refs.replicateMode?.value === '3d';
      const mode = wants3d ? '3d' : (modeOverride || (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single'));
      if(refs.replicateMode && refs.replicateMode.value !== mode){
        refs.replicateMode.value = mode;
      }
      if(refs.replicatesContainer){
        const showGroupedControls = mode === 'grouped' && !lineGroupedControlsCollapsed;
        if(showGroupedControls){
          refs.replicatesContainer.style.display = '';
          refs.replicatesContainer.setAttribute('aria-hidden', 'false');
        }else{
          refs.replicatesContainer.style.display = 'none';
          refs.replicatesContainer.setAttribute('aria-hidden', 'true');
        }
      }
      updateLineGroupedToggleUI(mode);
    if(refs.threeDControls){
      if(mode === '3d'){
        refs.threeDControls.style.display = '';
        refs.threeDControls.setAttribute('aria-hidden', 'false');
      }else{
        refs.threeDControls.style.display = 'none';
        refs.threeDControls.setAttribute('aria-hidden', 'true');
      }
    }
    if(refs.replicatesInput){
      refs.replicatesInput.disabled = mode !== 'grouped';
    }
    if(refs.groupedAdd){
      refs.groupedAdd.disabled = mode !== 'grouped';
    }
    if(refs.groupedRemove){
      refs.groupedRemove.disabled = mode !== 'grouped';
    }
    if(refs.threeDAdd){
      refs.threeDAdd.disabled = mode !== '3d';
    }
    if(refs.threeDRemove){
      refs.threeDRemove.disabled = mode !== '3d';
    }
    if(mode === 'grouped'){
      renderLineGroupedList();
    }else if(mode === '3d'){
      renderLine3dList();
    }
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
      colorInput.setAttribute('aria-label', `Color for ${labelKey}`);
      colorInput.addEventListener('input', e => {
        const targetLabel = lineSeriesGroupLabels[idx] || `Series ${idx + 1}`;
        const value = typeof e.target.value === 'string' && e.target.value ? e.target.value : defaultColor;
        lineLabelColors[targetLabel] = value;
        console.debug('Debug: line grouped color updated',{ index: idx, color: value, label: targetLabel });
        scheduleLineDraw();
      });
      if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(colorInput);
      }
      row.appendChild(colorInput);
      const shapeSelect = doc.createElement('select');
      shapeSelect.dataset.groupIndex = String(idx);
      shapeSelect.dataset.shapeControl = '1';
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
        const sanitized = sanitizeLineGroupShape(e.target.value, idx);
        lineGroupShapes[idx] = sanitized;
        if(e.target.value !== sanitized){
          e.target.value = sanitized;
        }
        console.debug('Debug: line grouped shape updated',{ index: idx, shape: sanitized });
        scheduleLineDraw();
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

  function inferLine3dSeriesCount(matrix){
    if(!Array.isArray(matrix) || !matrix.length){
      return 0;
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

  function resolveLine3dAxisHeaders(headerRow){
    const header = Array.isArray(headerRow) ? headerRow : [];
    let xIndex = header.findIndex(h => String(h).trim().toLowerCase() === 'x');
    if(xIndex < 0){
      xIndex = 0;
    }
    const xLabelRaw = header[xIndex] != null ? String(header[xIndex]).trim() : '';
    const yLabelRaw = header[1] != null ? String(header[1]).trim() : '';
    const zLabelRaw = header[2] != null ? String(header[2]).trim() : '';
    return {
      xIndex,
      xLabel: xLabelRaw || 'X',
      yLabel: yLabelRaw || 'Y',
      zLabel: zLabelRaw || 'Z'
    };
  }

  function syncLine3dAxisHeader(axisKey, value, options = {}){
    const hotInstance = options.hot || lineHot;
    if(!hotInstance || typeof hotInstance.getData !== 'function' || typeof hotInstance.setDataAtCell !== 'function'){
      return value != null ? String(value) : '';
    }
    const data = hotInstance.getData() || [];
    const headerRow = Array.isArray(data[0]) ? data[0] : [];
    const colCount = typeof hotInstance.countCols === 'function'
      ? hotInstance.countCols()
      : headerRow.length;
    const defaultLabel = axisKey === 'y' ? 'Y' : (axisKey === 'z' ? 'Z' : 'X');
    const trimmed = value != null ? String(value).trim() : '';
    const resolved = trimmed || defaultLabel;
    if(!headerRow.length){
      return resolved;
    }
    const changes = [];
    if(axisKey === 'x'){
      let xIndex = headerRow.findIndex(h => String(h).trim().toLowerCase() === 'x');
      if(xIndex < 0){
        xIndex = 0;
      }
      if(xIndex >= 0 && xIndex < colCount){
        const current = headerRow[xIndex] != null ? String(headerRow[xIndex]).trim() : '';
        if(current !== resolved){
          changes.push([0, xIndex, resolved]);
        }
      }
    }else{
      const start = axisKey === 'y' ? 1 : 2;
      const seriesCount = Math.max(0, inferLine3dSeriesCount(data));
      for(let s = 0; s < seriesCount; s += 1){
        const colIndex = start + s * 2;
        if(colIndex >= colCount){
          continue;
        }
        const current = headerRow[colIndex] != null ? String(headerRow[colIndex]).trim() : '';
        if(current !== resolved){
          changes.push([0, colIndex, resolved]);
        }
      }
    }
    if(changes.length){
      hotInstance.setDataAtCell(changes, options.source || 'line-axis-inline');
      lineDebug('Debug: line axis header synced', { axis: axisKey, count: changes.length, value: resolved });
    }
    return resolved;
  }

  function ensureLine3dGroupLabelCapacity(seriesCount){
    const count = Math.max(0, Number(seriesCount) || 0);
    if(!count){
      lineSeriesGroupLabels = [];
      return;
    }
    const matrixHeader = (() => {
      try{
        const data = lineHot?.getData?.();
        return Array.isArray(data?.[0]) ? data[0] : null;
      }catch(err){
        return null;
      }
    })();
    const inferLabel = (index) => {
      if(!matrixHeader){
        return null;
      }
      const yCol = 1 + index * 2;
      const raw = matrixHeader[yCol] != null ? String(matrixHeader[yCol]).trim() : '';
      if(!raw){
        return null;
      }
      const base = raw.replace(/[\s_-]*\(?\s*[yz]\s*(?:values?)?\s*\)?\s*$/i, '').trim();
      if(!base){
        return null;
      }
      const lower = base.toLowerCase();
      if(lower === 'y' || lower === 'z'){
        return null;
      }
      return base;
    };
    const labels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    for(let i = 0; i < count; i += 1){
      const existing = labels[i];
      if(existing && String(existing).trim()){
        continue;
      }
      labels[i] = inferLabel(i) || `Series ${i + 1}`;
    }
    if(labels.length > count){
      labels.length = count;
    }
    lineSeriesGroupLabels = labels;
  }

  function updateLine3dNestedHeaders(structure){
    if(!lineHot){
      return;
    }
    const matrix = Array.isArray(structure?.data) ? structure.data : lineHot.getData();
    const inferredCount = typeof structure?.seriesCount === 'number'
      ? structure.seriesCount
      : inferLine3dSeriesCount(matrix);
    const seriesCount = Math.max(0, inferredCount);
    if(seriesCount <= 0){
      lineHot.updateSettings({ nestedHeaders: false });
      return;
    }
    ensureLine3dGroupLabelCapacity(seriesCount);
    ensureLineGroupShapeCapacity(seriesCount);
    const nestedRow = [];
    nestedRow.push({ label: 'X values', colspan: 1 });
    for(let s = 0; s < seriesCount; s += 1){
      const label = lineSeriesGroupLabels[s] || `Series ${s + 1}`;
      nestedRow.push({ label, colspan: 2 });
    }
    lineHot.updateSettings({ nestedHeaders: [nestedRow] });
    console.debug('Debug: updateLine3dNestedHeaders applied', { seriesCount, labels: lineSeriesGroupLabels.slice() });
  }

  function renderLine3dList(){
    if(!refs.threeDList){
      return;
    }
    const doc = global.document;
    if(!doc){
      return;
    }
    const matrix = lineHot ? lineHot.getData() : [];
    const seriesCount = inferLine3dSeriesCount(matrix);
    ensureLine3dGroupLabelCapacity(seriesCount);
    ensureLineLabelColors(lineSeriesGroupLabels);
    ensureLineGroupShapeCapacity(seriesCount);
    refs.threeDList.innerHTML = '';
    for(let idx = 0; idx < seriesCount; idx += 1){
      const row = doc.createElement('div');
      row.className = 'grouped-row';
      row.dataset.groupIndex = String(idx);
      const inputId = `line-3d-dataset-name-${idx}`;
      const labelEl = doc.createElement('label');
      labelEl.textContent = `Dataset ${idx + 1}`;
      labelEl.setAttribute('for', inputId);
      row.appendChild(labelEl);
      const input = doc.createElement('input');
      input.type = 'text';
      input.value = lineSeriesGroupLabels[idx] || '';
      input.id = inputId;
      input.setAttribute('aria-label', `Display name for Dataset ${idx + 1}`);
      input.addEventListener('change', e => {
        updateLineSeriesGroupLabel(idx, e.target.value);
        e.target.value = lineSeriesGroupLabels[idx] || '';
        updateLine3dNestedHeaders();
        renderLine3dList();
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
      colorInput.setAttribute('aria-label', `Color for ${labelKey}`);
      colorInput.addEventListener('input', e => {
        const targetLabel = lineSeriesGroupLabels[idx] || `Series ${idx + 1}`;
        const value = typeof e.target.value === 'string' && e.target.value ? e.target.value : defaultColor;
        lineLabelColors[targetLabel] = value;
        scheduleLineDraw();
      });
      if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(colorInput);
      }
      row.appendChild(colorInput);
      const shapeSelect = doc.createElement('select');
      shapeSelect.dataset.groupIndex = String(idx);
      shapeSelect.dataset.shapeControl = '1';
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
        const sanitized = sanitizeLineGroupShape(e.target.value, idx);
        lineGroupShapes[idx] = sanitized;
        if(e.target.value !== sanitized){
          e.target.value = sanitized;
        }
        scheduleLineDraw();
      });
      attachLineSelectAutoSize(shapeSelect, `line-3d-shape-${idx}`);
      row.appendChild(shapeSelect);
      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'grouped-remove';
      removeBtn.textContent = '×';
      removeBtn.disabled = seriesCount <= 1;
      removeBtn.addEventListener('click', () => {
        removeLine3dDatasetAt(idx);
      });
      row.appendChild(removeBtn);
      refs.threeDList.appendChild(row);
    }
    console.debug('Debug: line 3d dataset list rendered', { datasets: seriesCount });
  }

  const scheduleLine3dDatasetSync = (() => {
    if(typeof Shared.debounceFrame === 'function'){
      let lastReason = 'frame';
      const debounced = Shared.debounceFrame(() => syncLine3dDatasetsFromTable(lastReason));
      return reason => {
        lastReason = reason || 'frame';
        debounced();
      };
    }
    return reason => syncLine3dDatasetsFromTable(reason || 'immediate');
  })();

  function syncLine3dDatasetsFromTable(reason){
    if(!lineHot){
      return;
    }
    const is3dMode = lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d';
    if(!is3dMode){
      line3dLastSeriesCount = null;
      return;
    }
    const matrix = lineHot.getData();
    const seriesCount = inferLine3dSeriesCount(matrix);
    if(line3dLastSeriesCount === seriesCount){
      return;
    }
    const previous = line3dLastSeriesCount;
    line3dLastSeriesCount = seriesCount;
    updateLine3dNestedHeaders({ seriesCount, data: matrix });
    renderLine3dList();
    lineDebug('Debug: line 3d dataset controls synced', { reason: reason || null, previous, seriesCount });
  }

  function applyLine3dHeaderRow(matrix, seriesCount){
    if(!Array.isArray(matrix) || !matrix.length){
      return matrix;
    }
    const headerRow = Array.isArray(matrix[0]) ? matrix[0].slice() : [];
    headerRow[0] = headerRow[0] && String(headerRow[0]).trim() ? headerRow[0] : 'X';
    const targetCols = 1 + Math.max(0, seriesCount) * 2;
    const nextHeader = new Array(targetCols).fill('');
    nextHeader[0] = headerRow[0];
    for(let s = 0; s < seriesCount; s += 1){
      nextHeader[1 + s * 2] = 'Y';
      nextHeader[1 + s * 2 + 1] = 'Z';
    }
    const next = matrix.map((row, idx) => {
      const safeRow = Array.isArray(row) ? row.slice() : [];
      if(idx === 0){
        return nextHeader;
      }
      if(safeRow.length < targetCols){
        safeRow.length = targetCols;
      }
      for(let c = 0; c < targetCols; c += 1){
        if(typeof safeRow[c] === 'undefined'){
          safeRow[c] = '';
        }
      }
      return safeRow.slice(0, targetCols);
    });
    return next;
  }

  function addLine3dDataset(){
    if(!lineHot){
      return;
    }
    const matrix = lineHot.getData();
    const seriesCount = inferLine3dSeriesCount(matrix);
    const nextIndex = seriesCount;
    const labels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    labels[nextIndex] = labels[nextIndex] && String(labels[nextIndex]).trim() ? labels[nextIndex] : `Series ${nextIndex + 1}`;
    lineSeriesGroupLabels = labels;
    const shapes = ensureLineGroupShapeCapacity(labels.length);
    if(shapes.length > nextIndex && (!shapes[nextIndex] || !LINE_GROUP_SHAPE_VALUES.has(shapes[nextIndex]))){
      shapes[nextIndex] = LINE_GROUP_SHAPE_DEFAULTS[nextIndex % LINE_GROUP_SHAPE_DEFAULTS.length];
      lineGroupShapes = shapes;
    }
    const insertAt = 1 + seriesCount * 2;
    const newMatrix = matrix.map((row, idx) => {
      const safeRow = Array.isArray(row) ? row.slice() : [];
      const prefix = safeRow.slice(0, insertAt);
      const suffix = safeRow.slice(insertAt);
      const inserted = idx === 0 ? ['Y', 'Z'] : ['', ''];
      return prefix.concat(inserted, suffix);
    });
    const normalizedMatrix = applyLine3dHeaderRow(newMatrix, labels.length);
    lineHot.loadData(normalizedMatrix);
    updateLine3dNestedHeaders({ seriesCount: labels.length, data: normalizedMatrix });
    renderLine3dList();
    scheduleLineDraw();
  }

  function removeLine3dDatasetAt(index){
    if(!lineHot){
      return;
    }
    const idx = Number(index);
    if(!Number.isInteger(idx) || idx < 0){
      return;
    }
    const matrix = lineHot.getData();
    const seriesCount = inferLine3dSeriesCount(matrix);
    if(seriesCount <= 1 || idx >= seriesCount){
      return;
    }
    const start = 1 + idx * 2;
    const end = start + 2;
    const trimmed = matrix.map(row => {
      const safeRow = Array.isArray(row) ? row.slice() : [];
      return safeRow.slice(0, start).concat(safeRow.slice(end));
    });
    const labels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    if(labels.length > idx){
      labels.splice(idx, 1);
    }
    lineSeriesGroupLabels = labels;
    const shapes = Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [];
    if(shapes.length > idx){
      shapes.splice(idx, 1);
    }
    lineGroupShapes = shapes;
    const normalizedMatrix = applyLine3dHeaderRow(trimmed, labels.length);
    lineHot.loadData(normalizedMatrix);
    updateLine3dNestedHeaders({ seriesCount: labels.length, data: normalizedMatrix });
    renderLine3dList();
    scheduleLineDraw();
  }

  function snapshotLineHotState(){
    if(!lineHot){
      return null;
    }
    const exclusions = typeof lineHot.exportExclusions === 'function'
      ? lineHot.exportExclusions()
      : Shared.hot.exportExclusions(lineHot);
    return {
      data: lineHot.getData(),
      exclusions,
      replicates: lineReplicates,
      tableFormat: refs.replicateMode?.value || (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single'),
      groupLabels: Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [],
      groupShapes: Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [],
      labelColors: lineLabelColors && typeof lineLabelColors === 'object' ? { ...lineLabelColors } : {}
    };
  }

  function restoreLineHotState(snapshot, options = {}){
    if(!snapshot || !lineHot){
      return false;
    }
    if(Array.isArray(snapshot.groupLabels)){
      lineSeriesGroupLabels = snapshot.groupLabels.slice();
    }
    if(Array.isArray(snapshot.groupShapes)){
      lineGroupShapes = snapshot.groupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
    }
    if(snapshot.labelColors && typeof snapshot.labelColors === 'object'){
      lineLabelColors = { ...snapshot.labelColors };
    }
    if(Number.isFinite(snapshot.replicates)){
      lineReplicates = clampLineReplicateCount(snapshot.replicates);
    }
    if(Array.isArray(snapshot.data)){
      lineHot.loadData(snapshot.data);
    }
    if(snapshot.exclusions){
      lineHot.applyExclusions?.(snapshot.exclusions);
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
      groupLabels.push(storedTrimmed || headerLabel || fallback);
    }
    const targetCols = 1 + seriesCount * 2;
    const newData = new Array(safeMatrix.length);
    const xHeader = header[xIndex] && String(header[xIndex]).trim() ? header[xIndex] : 'X';
    const headerRow = new Array(targetCols).fill('');
    headerRow[0] = xHeader;
    for(let s = 0; s < seriesCount; s += 1){
      headerRow[1 + s * 2] = 'Y';
      headerRow[1 + s * 2 + 1] = 'Z';
    }
    newData[0] = headerRow;
    for(let r = 1; r < safeMatrix.length; r += 1){
      const srcRow = Array.isArray(safeMatrix[r]) ? safeMatrix[r] : [];
      const outRow = new Array(targetCols).fill('');
      outRow[0] = srcRow[xIndex] ?? '';
      for(let s = 0; s < seriesCount; s += 1){
        const values = [];
        for(let rep = 0; rep < replicates; rep += 1){
          const colIndex = 1 + s * replicates + rep;
          const yVal = parseFloat(srcRow[colIndex]);
          if(Number.isFinite(yVal)){
            values.push(yVal);
          }
        }
        const mean = values.length ? (values.reduce((sum, val)=>sum + val, 0) / values.length) : null;
        outRow[1 + s * 2] = mean != null ? mean : '';
        outRow[1 + s * 2 + 1] = mean != null ? 0 : '';
      }
      newData[r] = outRow;
    }
    return { data: newData, seriesCount, groupLabels };
  }

  function buildLine2dMatrixFrom3d(matrix){
    const safeMatrix = Array.isArray(matrix) ? matrix : [];
    const header = Array.isArray(safeMatrix[0]) ? safeMatrix[0] : [];
    let xIndex = header.findIndex(h => String(h).trim().toLowerCase() === 'x');
    if(xIndex < 0){
      xIndex = 0;
    }
    const maxPairs = Math.max(0, Math.floor(((header.length || 1) - 1) / 2));
    let lastSeriesWithValues = -1;
    for(let s = 0; s < maxPairs; s += 1){
      const yCol = 1 + s * 2;
      const headerCell = header[yCol] != null ? String(header[yCol]).trim() : '';
      let hasData = false;
      for(let r = 1; r < safeMatrix.length; r += 1){
        const row = Array.isArray(safeMatrix[r]) ? safeMatrix[r] : [];
        const yVal = parseFloat(row[yCol]);
        if(Number.isFinite(yVal)){
          hasData = true;
          break;
        }
      }
      if(hasData || headerCell){
        lastSeriesWithValues = s;
      }
    }
    const seriesCount = Math.max(0, lastSeriesWithValues + 1);
    const targetCols = 1 + seriesCount;
    const newData = new Array(safeMatrix.length);
    const xHeader = header[xIndex] && String(header[xIndex]).trim() ? header[xIndex] : 'X';
    const headerRow = new Array(targetCols).fill('');
    headerRow[0] = xHeader;
    for(let s = 0; s < seriesCount; s += 1){
      headerRow[1 + s] = lineSeriesGroupLabels?.[s] || `Series ${s + 1}`;
    }
    newData[0] = headerRow;
    for(let r = 1; r < safeMatrix.length; r += 1){
      const srcRow = Array.isArray(safeMatrix[r]) ? safeMatrix[r] : [];
      const outRow = new Array(targetCols).fill('');
      outRow[0] = srcRow[xIndex] ?? '';
      for(let s = 0; s < seriesCount; s += 1){
        const yCol = 1 + s * 2;
        outRow[1 + s] = srcRow[yCol] ?? '';
      }
      newData[r] = outRow;
    }
    return { data: newData, seriesCount };
  }

  function enterLine3dMode(options = {}){
    const skipDraw = options.skipDraw === true;
    const resetRotation = options.resetRotation === true;
    const was3d = lineViewState.viewMode === '3d';
    if(resetRotation && !was3d){
      resetLine3dRotation('view-mode-change');
    }
    if(!lineHot){
      lineViewState.viewMode = '3d';
      updateLineReplicateModeControls('3d');
      return;
    }
    if(lineViewState.viewMode !== '3d'){
      const snapshot = snapshotLineHotState();
      if(snapshot){
        lineModeCache.twoD = snapshot;
        lineModeCache.lastTwoDFormat = snapshot.tableFormat === 'grouped' ? 'grouped' : 'single';
      }
      lineLast2dDisplayMode = sanitizeLineDisplayMode(refs.displayMode?.value ?? lineDisplayMode);
      lineLast2dLogX = !!refs.logX?.checked;
      lineLast2dLogY = !!refs.logY?.checked;
      lineLast2dShowFrame = !!refs.showFrame?.checked;
      lineLast2dShowIntervals = !!refs.showIntervals?.checked;
      lineLast2dShowDiagnostics = !!refs.showDiagnostics?.checked;
    }
    lineViewState.viewMode = '3d';
    if(refs.viewMode){
      refs.viewMode.value = '3d';
    }
    if(refs.replicateMode){
      refs.replicateMode.value = '3d';
    }
    if(lineModeCache.threeD){
      restoreLineHotState(lineModeCache.threeD, { skipControls: true });
    }else{
      const sourceMatrix = lineModeCache.twoD?.data || lineHot.getData();
      const sourceReplicates = lineModeCache.twoD?.replicates ?? lineReplicates;
      const converted = buildLine3dMatrixFrom2d(sourceMatrix, sourceReplicates);
      lineSeriesGroupLabels = converted.groupLabels.slice();
      ensureLineGroupShapeCapacity(converted.seriesCount);
      lineHot.loadData(converted.data);
    }
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
    if(refs.showIntervals){
      refs.showIntervals.disabled = true;
      if(refs.showIntervals.checked){
        refs.showIntervals.checked = false;
      }
    }
    if(refs.showDiagnostics){
      refs.showDiagnostics.disabled = true;
      if(refs.showDiagnostics.checked){
        refs.showDiagnostics.checked = false;
      }
    }
    if(refs.forecastFieldset){
      refs.forecastFieldset.disabled = true;
    }
    updateLineReplicateModeControls('3d');
    updateLine3dNestedHeaders();
    renderLine3dList();
    syncLineAspectControls('enter-3d');
    if(!skipDraw){
      scheduleLineDraw();
    }
  }

  function exitLine3dMode(options = {}){
    const skipDraw = options.skipDraw === true;
    if(!lineHot){
      lineViewState.viewMode = '2d';
      line3dLastSeriesCount = null;
      updateLineReplicateModeControls();
      return;
    }
    const snapshot3d = snapshotLineHotState();
    if(snapshot3d){
      lineModeCache.threeD = snapshot3d;
    }
    lineViewState.viewMode = '2d';
    line3dLastSeriesCount = null;
    if(refs.viewMode){
      refs.viewMode.value = '2d';
    }
    const fallback2dFormat = lineModeCache.lastTwoDFormat === 'grouped' ? 'grouped' : 'single';
    if(lineModeCache.twoD){
      restoreLineHotState(lineModeCache.twoD, { skipControls: true });
      if(refs.replicateMode){
        refs.replicateMode.value = lineModeCache.twoD.tableFormat === 'grouped' ? 'grouped' : 'single';
      }
      lineReplicates = clampLineReplicateCount(lineModeCache.twoD.replicates ?? lineReplicates);
    }else{
      const converted = buildLine2dMatrixFrom3d(lineHot.getData());
      lineReplicates = LINE_MIN_REPLICATES;
      lineHot.loadData(converted.data);
      if(refs.replicateMode){
        refs.replicateMode.value = fallback2dFormat;
      }
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
    if(refs.showIntervals){
      refs.showIntervals.disabled = false;
      refs.showIntervals.checked = !!lineLast2dShowIntervals;
    }
    if(refs.showDiagnostics){
      refs.showDiagnostics.disabled = false;
      refs.showDiagnostics.checked = !!lineLast2dShowDiagnostics;
    }
    if(refs.forecastFieldset){
      refs.forecastFieldset.disabled = false;
    }
    updateLineReplicateModeControls();
    updateLineNestedHeaders();
    syncLineAspectControls('exit-3d');
    if(!skipDraw){
      scheduleLineDraw();
    }
  }

  function scheduleLineRotationRedraw(){
    if(lineViewState.rotationPending){
      if(!lineViewState.rotationPendingLogged && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: line rotation redraw skipped', { reason: 'pending' });
      }
      lineViewState.rotationPendingLogged = true;
      return;
    }
    lineViewState.rotationPending = true;
    lineViewState.rotationPendingLogged = false;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: line rotation redraw scheduled');
    }
    scheduleLineDraw({ viewOnly: true, reason: 'rotation' });
  }

  function addLineGroup(){
    if(lineReplicates <= LINE_MIN_REPLICATES){
      console.debug('Debug: line grouped add skipped',{ reason: 'single-mode' });
      return;
    }
    const replicates = Math.max(lineReplicates, LINE_MIN_REPLICATES);
    const matrix = lineHot ? lineHot.getData() : [];
    const usedSeriesCols = computeUsedSeriesColumns(matrix);
    const inferredSeriesCount = Math.max(1, Math.ceil(usedSeriesCols / Math.max(replicates, 1)));
    const labels = Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [];
    const listCount = getLineGroupedListCount();
    const currentSeriesCount = Math.max(listCount || labels.length || inferredSeriesCount, 1);
    if(labels.length > currentSeriesCount){
      labels.length = currentSeriesCount;
    }
    while(labels.length < currentSeriesCount){
      labels.push(`Series ${labels.length + 1}`);
    }
    const nextIndex = labels.length;
    const nextLabel = `Series ${nextIndex + 1}`;
    labels.push(nextLabel);
    const shapes = Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [];
    shapes.push(LINE_GROUP_SHAPE_DEFAULTS[nextIndex % LINE_GROUP_SHAPE_DEFAULTS.length]);
    console.debug('Debug: line grouped add',{ nextIndex, label: nextLabel });
    applyLineReplicateChange(lineReplicates, {
      sourceReplicates: lineReplicates,
      skipDraw: true,
      minSeriesCount: labels.length,
      groupLabels: labels,
      groupShapes: shapes,
      resetGroupLabels: true
    });
    renderLineGroupedList();
    scheduleLineDraw();
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
    const matrix = lineHot ? lineHot.getData() : [];
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
    scheduleLineDraw();
  }


  function ensureLineLabelColors(labels){
    const labelSet = new Set(labels);
    labels.forEach((lab,i)=>{
      if(!lineLabelColors[lab]){
        lineLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
        console.debug('Debug: line default label color applied',{label:lab,color:lineLabelColors[lab]});
      }
    });
    Object.keys(lineLabelColors).forEach(k=>{
      if(!labelSet.has(k)){
        console.debug('Debug: line label color pruned',{label:k});
        delete lineLabelColors[k];
      }
    });
    console.debug('Debug: ensureLineLabelColors sync complete',{count:Object.keys(lineLabelColors).length});
  }

  function computeLineStats(points,method,jStatLib,regressionMode,options = {}){
    const x=points.map(p=>p.x);
    const y=points.map(p=>p.y);
    const n=points.length;
    if(n<3) return null;
    const pearson=jStatLib.corrcoeff(x,y);
    let r,label;
    if(method==='pearson'){r=pearson; label='Pearson';}
    else {r=jStatLib.spearmancoeff(x,y); label='Spearman';}
    const t=r*Math.sqrt((n-2)/(1-r*r));
    const p=2*(1-jStatLib.studentt.cdf(Math.abs(t),n-2));
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
    console.debug('Debug: computeLineStats',{method:label,r,p,slope,regressionMode,slopeLabel}); // Debug: stats computation
    return {method:label,r,p,slope,slopeLabel,regression:regressionModel};
  }

  function captureLineRegressionSummaries(seriesList, options = {}){
    if(!Array.isArray(seriesList) || !seriesList.length){
      lineLastRegressionSummaries = [];
      return;
    }
    const mode = options.mode || refs.regressionMode?.value || 'linear';
    const summarize = typeof regressionTools.createSummary === 'function'
      ? regressionTools.createSummary
      : null;
    const summaries = [];
    seriesList.forEach(entry => {
      if(!entry){
        return;
      }
      let summary = null;
      if(entry.regression){
        if(summarize){
          try{
            summary = summarize(entry.regression);
          }catch(err){
            console.error('line regression summary build failed', err);
            summary = {
              metrics: entry.regression.metrics || null,
              residuals: entry.regression.residuals || null,
              diagnostics: entry.regression.diagnostics || null
            };
          }
        }else{
          summary = {
            metrics: entry.regression.metrics || null,
            residuals: entry.regression.residuals || null,
            diagnostics: entry.regression.diagnostics || null
          };
        }
      }
      summaries.push({
        name: entry.name || '',
        mode,
        summary
      });
    });
    lineLastRegressionSummaries = summaries;
    console.debug('Debug: line regression summaries captured',{ count: summaries.length, mode });
  }

  function updateLineStats(series, options = {}){
    if(!refs.statType || !refs.statsResults) return;
    const jStatLib = global.jStat;
    if(!jStatLib){
      refs.statsResults.textContent='Statistics unavailable (jStat missing).';
      return;
    }
    const method=refs.statType.value||'pearson';
    const regressionMode=refs.regressionMode?.value || 'linear';
    let parameterColumnLabel = 'Slope';
    let parameterLabelResolved = false;
    const showIntervals = !!options.showIntervals;
    const showDiagnostics = !!options.showDiagnostics;
    const regressionAlpha = Number.isFinite(options.alpha) ? options.alpha : 0.05;
    const regressionCache = options.regressionCache instanceof Map ? options.regressionCache : new Map();
    renderLineStatsAdvisor(series, { ...options, showIntervals, showDiagnostics });
    console.debug('Debug: updateLineStats',{seriesCount:series.length,method,regressionMode,showIntervals,showDiagnostics}); // Debug: stats update entry
    const tableRows=[];
    const intervalRows=[];
    const diagnosticRows=[];
    const coefficientRows=[];
    const parameterRows=[];
    const seasonalRows=[];
    const forecastRows=[];
    let methodLabel='';
    lineLastRegressionSummaries = [];
    series.forEach(s=>{
      const pts=s.points.filter(Boolean);
      if(pts.length>=3){
        const cached = regressionCache.get(s.name);
        const stats=computeLineStats(pts,method,jStatLib,regressionMode,{ alpha: regressionAlpha, precomputedRegression: cached, forecast: options.forecast });
        if(stats){
          methodLabel=stats.method;
          const summary = typeof regressionTools.createSummary === 'function' ? regressionTools.createSummary(stats.regression) : null;
          lineLastRegressionSummaries.push({ name: s.name, mode: regressionMode, summary });
          const r2Value = summary?.metrics?.r2 ?? stats.regression?.metrics?.r2;
          const adjR2Value = summary?.metrics?.adjR2 ?? stats.regression?.metrics?.adjR2;
          const rmseValue = summary?.metrics?.rmse ?? stats.regression?.metrics?.rmse;
          const maeValue = summary?.metrics?.mae ?? stats.regression?.metrics?.mae;
          const logLossValue = summary?.metrics?.logLoss ?? stats.regression?.metrics?.logLoss;
          const sampleSizeValue = summary?.metrics?.sampleSize ?? stats.regression?.metrics?.sampleSize ?? pts.length;
          if(!parameterLabelResolved && typeof stats.slopeLabel === 'string' && stats.slopeLabel){
            parameterColumnLabel = stats.slopeLabel;
            parameterLabelResolved = true;
          }
          tableRows.push({
            series:s.name,
            n:formatMetricValue(sampleSizeValue,0),
            r:formatMetricValue(stats.r),
            p:formatP(stats.p),
            slope:formatMetricValue(stats.slope),
            r2:formatMetricValue(r2Value),
            adjR2:formatMetricValue(adjR2Value),
            rmse:formatMetricValue(rmseValue),
            mae:formatMetricValue(maeValue),
            logLoss:formatMetricValue(logLossValue,6)
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
                forecastRows.push({ series: s.name, horizon: formattedValue, mae: 'n/a', rmse: 'n/a', mape: 'n/a', smape: 'n/a', aic: 'n/a', bic: 'n/a' });
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
            diagnosticRows.push({
              series: s.name,
              skewness: formatMetricValue(stats.regression.diagnostics.skewness,3),
              kurtosis: formatMetricValue(stats.regression.diagnostics.kurtosis,3),
              jb: formatMetricValue(stats.regression.diagnostics.jarqueBera,3),
              jbP: formatP(stats.regression.diagnostics.jarqueBeraP)
            });
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
                ciLow: formatMetricValue(stat.ciLow),
                ciHigh: formatMetricValue(stat.ciHigh)
              });
            });
          }
          const metricsSource = stats.regression?.metrics || {};
          const summaryMetrics = summary?.metrics || {};
          const hasAccuracy = [metricsSource.mae, metricsSource.mape, metricsSource.smape, metricsSource.aic, metricsSource.bic].some(val => Number.isFinite(val));
          if(hasAccuracy){
            const existingIndex = forecastRows.findIndex(row => row.series === s.name);
            const rowBase = existingIndex >= 0 ? forecastRows[existingIndex] : { series: s.name };
            rowBase.horizon = rowBase.horizon || formatMetricValue(summaryMetrics.horizon ?? metricsSource.horizon ?? NaN,0);
            rowBase.mae = formatMetricValue(metricsSource.mae);
            rowBase.rmse = formatMetricValue(metricsSource.rmse);
            rowBase.mape = formatPercent(metricsSource.mape);
            rowBase.smape = formatPercent(metricsSource.smape);
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
        lineLastRegressionSummaries.push({ name: s.name, mode: regressionMode, summary: null });
      }
    });
    if(tableRows.length){
      refs.statsResults.innerHTML='';
      if(methodLabel){
        const lead=document.createElement('div');
        lead.className='stats-table-lead';
        lead.textContent=`${methodLabel} correlation coefficients`;
        refs.statsResults.appendChild(lead);
      }
      if(Shared.statsTable && typeof Shared.statsTable.render==='function'){
        Shared.statsTable.render({
          target: refs.statsResults,
          columns:[
            {key:'series',label:'Series',align:'left'},
            {key:'n',label:'N',align:'right'},
            {key:'r',label:'r',align:'right'},
            {key:'p',label:'p',align:'right'},
            {key:'slope',label:parameterColumnLabel,align:'right'},
            {key:'r2',label:'R²',align:'right'},
            {key:'adjR2',label:'Adjusted R²',align:'right'},
            {key:'rmse',label:'RMSE',align:'right'},
            {key:'mae',label:'MAE',align:'right'},
            {key:'logLoss',label:'Log loss',align:'right'}
          ],
          rows:tableRows,
          caption: methodLabel ? `${methodLabel} correlation summary (${regressionMode} regression)` : 'Correlation summary',
          options:{
            fileName:'line-statistics',
            contextLabel:'line-stats'
          },
          append:true
        });
        if(showIntervals && intervalRows.length){
          Shared.statsTable.render({
            target: refs.statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'ciLow', label:'CI Low', align:'right' },
              { key:'ciHigh', label:'CI High', align:'right' },
              { key:'piLow', label:'PI Low', align:'right' },
              { key:'piHigh', label:'PI High', align:'right' }
            ],
            rows: intervalRows,
            caption: 'Regression interval bounds',
            options:{ fileName:'line-intervals', contextLabel:'line-intervals' },
            append:true
          });
        }
        if(showDiagnostics && diagnosticRows.length){
          Shared.statsTable.render({
            target: refs.statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'skewness', label:'Skewness', align:'right' },
              { key:'kurtosis', label:'Kurtosis', align:'right' },
              { key:'jb', label:'JB', align:'right' },
              { key:'jbP', label:'JB p', align:'right' }
            ],
            rows: diagnosticRows,
            caption: 'Residual diagnostics',
            options:{ fileName:'line-diagnostics', contextLabel:'line-diagnostics' },
            append:true
          });
        }
        if(parameterRows.length){
          Shared.statsTable.render({
            target: refs.statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'parameter', label:'Parameter', align:'left' },
              { key:'value', label:'Value', align:'right' }
            ],
            rows: parameterRows,
            caption: 'Regression parameters',
            options:{ fileName:'line-parameters', contextLabel:'line-parameters' },
            append:true
          });
        }
        if(seasonalRows.length){
          Shared.statsTable.render({
            target: refs.statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'label', label:'Component', align:'left' },
              { key:'value', label:'Value', align:'right' }
            ],
            rows: seasonalRows,
            caption: 'Seasonal components',
            options:{ fileName:'line-seasonals', contextLabel:'line-seasonals' },
            append:true
          });
        }
        if(forecastRows.length){
          Shared.statsTable.render({
            target: refs.statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'horizon', label:'Horizon', align:'right' },
              { key:'mae', label:'MAE', align:'right' },
              { key:'rmse', label:'RMSE', align:'right' },
              { key:'mape', label:'MAPE', align:'right' },
              { key:'smape', label:'sMAPE', align:'right' },
              { key:'aic', label:'AIC', align:'right' },
              { key:'bic', label:'BIC', align:'right' }
            ],
            rows: forecastRows,
            caption: 'Forecast accuracy metrics',
            options:{ fileName:'line-forecast', contextLabel:'line-forecast' },
            append:true
          });
        }
        if(coefficientRows.length){
          Shared.statsTable.render({
            target: refs.statsResults,
            columns:[
              { key:'series', label:'Series', align:'left' },
              { key:'term', label:'Term', align:'left' },
              { key:'estimate', label:'Estimate', align:'right' },
              { key:'se', label:'Std Error', align:'right' },
              { key:'t', label:'t-stat', align:'right' },
              { key:'p', label:'p-value', align:'right' },
              { key:'ciLow', label:'CI Low', align:'right' },
              { key:'ciHigh', label:'CI High', align:'right' }
            ],
            rows: coefficientRows,
            caption: 'Coefficient diagnostics',
            options:{ fileName:'line-coefficients', contextLabel:'line-coefficients' },
            append:true
          });
        }
      }else{
        const table=document.createElement('table');
        table.innerHTML=`<tr><th>Series</th><th>N</th><th>r</th><th>p</th><th>${parameterColumnLabel}</th><th>R²</th><th>Adjusted R²</th><th>RMSE</th><th>MAE</th><th>Log loss</th></tr>`+
          tableRows.map(row=>`<tr><td>${row.series}</td><td>${row.n}</td><td>${row.r}</td><td>${row.p}</td><td>${row.slope}</td><td>${row.r2}</td><td>${row.adjR2}</td><td>${row.rmse}</td><td>${row.mae}</td><td>${row.logLoss}</td></tr>`).join('');
        refs.statsResults.appendChild(table);
        console.debug('Debug: updateLineStats fallback table rendered',{rowCount:tableRows.length});
        if(showIntervals && intervalRows.length){
          const intervalTable=document.createElement('table');
          intervalTable.innerHTML='<tr><th>Series</th><th>CI Low</th><th>CI High</th><th>PI Low</th><th>PI High</th></tr>'+
            intervalRows.map(row=>`<tr><td>${row.series}</td><td>${row.ciLow}</td><td>${row.ciHigh}</td><td>${row.piLow}</td><td>${row.piHigh}</td></tr>`).join('');
          refs.statsResults.appendChild(intervalTable);
        }
        if(showDiagnostics && diagnosticRows.length){
          const diagTable=document.createElement('table');
          diagTable.innerHTML='<tr><th>Series</th><th>Skewness</th><th>Kurtosis</th><th>JB</th><th>JB p</th></tr>'+
            diagnosticRows.map(row=>`<tr><td>${row.series}</td><td>${row.skewness}</td><td>${row.kurtosis}</td><td>${row.jb}</td><td>${row.jbP}</td></tr>`).join('');
          refs.statsResults.appendChild(diagTable);
        }
        if(parameterRows.length){
          const paramTable=document.createElement('table');
          paramTable.innerHTML='<tr><th>Series</th><th>Parameter</th><th>Value</th></tr>'+
            parameterRows.map(row=>`<tr><td>${row.series}</td><td>${row.parameter}</td><td>${row.value}</td></tr>`).join('');
          refs.statsResults.appendChild(paramTable);
        }
        if(seasonalRows.length){
          const seasonTable=document.createElement('table');
          seasonTable.innerHTML='<tr><th>Series</th><th>Component</th><th>Value</th></tr>'+
            seasonalRows.map(row=>`<tr><td>${row.series}</td><td>${row.label}</td><td>${row.value}</td></tr>`).join('');
          refs.statsResults.appendChild(seasonTable);
        }
        if(forecastRows.length){
          const forecastTable=document.createElement('table');
          forecastTable.innerHTML='<tr><th>Series</th><th>Horizon</th><th>MAE</th><th>RMSE</th><th>MAPE</th><th>sMAPE</th><th>AIC</th><th>BIC</th></tr>'+
            forecastRows.map(row=>`<tr><td>${row.series}</td><td>${row.horizon || 'n/a'}</td><td>${row.mae || 'n/a'}</td><td>${row.rmse || 'n/a'}</td><td>${row.mape || 'n/a'}</td><td>${row.smape || 'n/a'}</td><td>${row.aic || 'n/a'}</td><td>${row.bic || 'n/a'}</td></tr>`).join('');
          refs.statsResults.appendChild(forecastTable);
        }
        if(coefficientRows.length){
          const coeffTable=document.createElement('table');
          coeffTable.innerHTML='<tr><th>Series</th><th>Term</th><th>Estimate</th><th>Std Error</th><th>t-stat</th><th>p-value</th><th>CI Low</th><th>CI High</th></tr>'+
            coefficientRows.map(row=>`<tr><td>${row.series}</td><td>${row.term}</td><td>${row.estimate}</td><td>${row.se}</td><td>${row.t}</td><td>${row.p}</td><td>${row.ciLow}</td><td>${row.ciHigh}</td></tr>`).join('');
          refs.statsResults.appendChild(coeffTable);
        }
      }
    }else{
      refs.statsResults.textContent='Not enough data for statistics.';
    }
    console.debug('Debug: updateLineStats complete',{rowCount:tableRows.length,intervalRows:intervalRows.length,diagnosticRows:diagnosticRows.length,parameterRows:parameterRows.length,seasonalRows:seasonalRows.length,forecastRows:forecastRows.length,methodLabel,regressionMode}); // Debug: stats update exit
  }

  function getLineGraphPayload(){
    const activeHot = lineHot || (typeof line.__ensureHotForActiveTab === 'function' ? line.__ensureHotForActiveTab() : null);
    if(!activeHot) return null;
    if((!Array.isArray(lineLastRegressionSummaries) || lineLastRegressionSummaries.length === 0) && activeHot){
      console.debug('Debug: line payload refreshing summaries',{ hasHot: !!lineHot, summaryCount: lineLastRegressionSummaries?.length || 0 });
      try{
        drawLine();
      }catch(err){
        console.error('line payload refresh failed',err);
      }
    }
    const axisSettings = ensureLineAxisSettings();
    const fontStyles = exportFontStyles('line');
    const viewMode = lineViewState.viewMode === '3d' ? '3d' : '2d';
    const noteControl = notesState.control || null;
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
    return {
      type:'line',
      data:activeHot.getData(),
      exclusions: activeHot?.exportExclusions?.() || Shared.hot.exportExclusions(activeHot),
      dataViews: includeDataViews ? dataViewsPayload : undefined,
      activeDataViewId: includeDataViews ? (dataViewsPayload?.activeViewId || null) : undefined,
      config:{
        viewMode,
        title:lineTitleText,
        xLabel:lineXLabelText,
        yLabel:lineYLabelText,
        zLabel: lineZLabelText,
        rotation: lineViewState.rotation ? {
          x: lineViewState.rotation.x,
          y: lineViewState.rotation.y,
          z: lineViewState.rotation.z,
          quaternion: lineViewState.rotation.quaternion ? {
            w: lineViewState.rotation.quaternion.w,
            x: lineViewState.rotation.quaternion.x,
            y: lineViewState.rotation.quaternion.y,
            z: lineViewState.rotation.quaternion.z
          } : null
        } : null,
        tableFormat: refs.replicateMode?.value || (lineReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single'),
        replicates: viewMode === '3d' ? LINE_MIN_REPLICATES : lineReplicates,
        groupLabels: Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.slice() : [],
        groupShapes: Array.isArray(lineGroupShapes) ? lineGroupShapes.slice() : [],
        dotSize:refs.dotSize?.value,
        fill:refs.fill?.value,
        colorScheme: lineColorSchemeId,
        textColor: lineTextColor,
        backgroundColor: lineBackgroundColor,
        border:refs.border?.value,
        borderWidth:refs.borderWidth?.value,
        errorBarWidth:refs.errorBarWidth?.value ?? refs.borderWidth?.value,
        alpha:refs.alpha?.value,
        labelColors:{ ...lineLabelColors },
        seriesStyles:{ ...lineSeriesStyles },
        displayMode: sanitizeLineDisplayMode(refs.displayMode?.value ?? lineDisplayMode),
        showGrid:refs.showGrid?.checked,
        gridStyle: getLineGridStyle(getLineAxisStrokeWidth()),
        showFrame:refs.showFrame?.checked,
        showLegend:refs.showLegend ? !!refs.showLegend.checked : true,
        equalAxes: lineViewState.equalAxes,
        equalScaleAxes: lineViewState.equalScaleAxes,
        axesVarianceScaled: lineViewState.axesVarianceScaled,
        logX:refs.logX?.checked,
        logY:refs.logY?.checked,
        logPlusOneX:!!lineLogPlusOneX,
        logPlusOneY:!!lineLogPlusOneY,
        showIntervals:refs.showIntervals?.checked,
        showDiagnostics:refs.showDiagnostics?.checked,
        xMin:refs.xMin?.value,
        xMax:refs.xMax?.value,
        yMin:refs.yMin?.value,
        yMax:refs.yMax?.value,
        originMode:refs.originMode?.value,
        originX:refs.originX?.value,
        originY:refs.originY?.value,
        fontSize:refs.fontSize?.value,
        fontStyles: fontStyles || undefined,
        regression:{
          mode: refs.regressionMode?.value || 'linear',
          seriesSummaries: Array.isArray(lineLastRegressionSummaries) ? lineLastRegressionSummaries : []
        },
        forecast:{
          horizon: refs.forecastHorizon?.value ?? String(lineForecastOptions.horizon),
          seasonLength: refs.forecastSeasonLength?.value ?? String(lineForecastOptions.seasonLength),
          autoTune: !!refs.forecastAuto?.checked,
          criterion: refs.forecastCriterion?.value || lineForecastOptions.criterion
        },
        axis:{
          strokeWidth: axisSettings.strokeWidth,
          color: axisSettings.color,
          tickIntervalX: axisSettings.x?.tickInterval ?? null,
          tickIntervalY: axisSettings.y?.tickInterval ?? null,
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
          resultsHtml: refs.statsResults ? refs.statsResults.innerHTML : null,
          lastRunVersion: lineStatsState.lastRunVersion || 0,
          signature: lineStatsState.signature || null,
          version: lineStatsState.version || 0,
          controls: {
            method: refs.statType?.value || null,
            regressionMode: refs.regressionMode?.value || null
          },
          statsOptions: {
            showIntervals: !!refs.showIntervals?.checked,
            showDiagnostics: !!refs.showDiagnostics?.checked,
            forecast: {
              horizon: refs.forecastHorizon?.value ?? null,
              seasonLength: refs.forecastSeasonLength?.value ?? null,
              autoTune: !!refs.forecastAuto?.checked,
              criterion: refs.forecastCriterion?.value || null
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
    let scheduleBackup = null;
    if(skipDraw){
      scheduleBackup = scheduleLineDraw;
      scheduleLineDraw = () => {};
    }
    console.debug('Debug: applyLineGraphPayload payload', obj);
    const c=obj.config||{};
    applyLineThemeConfig(c);
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
    if(notesState.control){
      notesState.control.setValue(notesState.text);
      notesState.control.setOpen(notesState.open);
    }
    importFontStyles('line', c.fontStyles || null);
    const hot = lineHot || (typeof line.__ensureHotForActiveTab === 'function' ? line.__ensureHotForActiveTab() : null);
    if(hot){
      lineHot = hot;
      refs.hot = hot;
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
    const dataManager = lineHot
      ? ensureLineDataViewsForHot(lineHot, {
          wrapper: refs.hotWrapper || global.document?.getElementById?.('lineHotWrapper') || null,
          container: lineHot.__lineHostContainer || refs.hotContainer || global.document?.getElementById?.('lineHot') || null
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
    const activeViewData = dataManager?.getActiveView?.()?.data;
    const matrixData = Array.isArray(activeViewData) ? activeViewData : rawDataMatrix;
    const activeViewExclusions = dataManager?.getActiveView?.()?.exclusions || null;
    const exclusionsToApply = obj.exclusions || activeViewExclusions || null;
    const storedGroupLabels = Array.isArray(c.groupLabels) ? c.groupLabels.slice() : null;
    const storedGroupShapes = Array.isArray(c.groupShapes) ? c.groupShapes.slice() : null;
    lineModeCache.twoD = null;
    lineModeCache.threeD = null;
    lineModeCache.lastTwoDFormat = storedTableFormat === 'grouped' ? 'grouped' : 'single';
    lineLast2dDisplayMode = sanitizeLineDisplayMode(c.displayMode ?? lineLast2dDisplayMode);
    lineLast2dLogX = !!c.logX;
    lineLast2dLogY = !!c.logY;
    lineLast2dShowFrame = !!c.showFrame;
    lineLast2dShowIntervals = !!c.showIntervals;
    lineLast2dShowDiagnostics = !!c.showDiagnostics;
    if(typeof c.equalAxes === 'boolean'){
      lineViewState.equalAxes = c.equalAxes;
    }
    if(typeof c.equalScaleAxes === 'boolean'){
      lineViewState.equalScaleAxes = c.equalScaleAxes;
    }
    if(typeof c.axesVarianceScaled === 'boolean'){
      lineViewState.axesVarianceScaled = c.axesVarianceScaled;
    }
    if(lineViewState.equalScaleAxes){
      lineViewState.equalAxes = false;
      lineViewState.axesVarianceScaled = false;
      lineDebug('Debug: line axes length payload exclusivity enforced', { kept: 'equal-scale' });
    }else if(lineViewState.axesVarianceScaled && lineViewState.equalAxes){
      lineViewState.equalAxes = false;
      lineDebug('Debug: line axes length payload exclusivity enforced', { kept: 'variance' });
    }
    if(storedGroupLabels){
      lineSeriesGroupLabels = storedGroupLabels.slice();
      console.debug('Debug: line group labels restored from payload', { labels: storedGroupLabels });
    }
    if(storedGroupShapes){
      lineGroupShapes = storedGroupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
      console.debug('Debug: line group shapes restored from payload', { shapes: lineGroupShapes.slice() });
    }
    if(lineHot && matrixData){
      if(wants3d){
        const inferredSeriesCount = inferLine3dSeriesCount(matrixData);
        const seriesCount = Math.max(inferredSeriesCount, storedGroupLabels?.length || 0, storedGroupShapes?.length || 0);
        const matrixForLoad = seriesCount > 0 ? applyLine3dHeaderRow(matrixData, seriesCount) : matrixData;
        lineViewState.viewMode = '3d';
        if(refs.viewMode){
          refs.viewMode.value = '3d';
        }
        if(refs.replicateMode){
          refs.replicateMode.value = '3d';
        }
        lineHot.loadData(matrixForLoad);
        if(exclusionsToApply){
          lineHot.applyExclusions?.(exclusionsToApply);
        }
        if(storedGroupLabels){
          lineSeriesGroupLabels = storedGroupLabels.slice();
        }
        ensureLine3dGroupLabelCapacity(seriesCount);
        if(storedGroupShapes){
          lineGroupShapes = storedGroupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
        }
        ensureLineGroupShapeCapacity(seriesCount);
        if(refs.displayMode){
          refs.displayMode.disabled = true;
          refs.displayMode.value = 'line';
        }
        [refs.logX, refs.logY].forEach(cb => {
          if(!cb){
            return;
          }
          cb.disabled = true;
          cb.checked = false;
        });
        if(refs.showFrame){
          refs.showFrame.checked = true;
          refs.showFrame.disabled = true;
        }
        if(refs.regressionMode){
          refs.regressionMode.disabled = true;
        }
        if(refs.showIntervals){
          refs.showIntervals.disabled = true;
          refs.showIntervals.checked = false;
        }
        if(refs.showDiagnostics){
          refs.showDiagnostics.disabled = true;
          refs.showDiagnostics.checked = false;
        }
        if(refs.forecastFieldset){
          refs.forecastFieldset.disabled = true;
        }
        updateLineReplicateModeControls('3d');
        updateLine3dNestedHeaders({ seriesCount, data: matrixForLoad });
        renderLine3dList();
      }else{
        lineViewState.viewMode = '2d';
        if(refs.viewMode){
          refs.viewMode.value = '2d';
        }
        if(refs.showFrame){
          refs.showFrame.disabled = false;
        }
        if(refs.displayMode){
          refs.displayMode.disabled = false;
        }
        if(refs.regressionMode){
          refs.regressionMode.disabled = false;
        }
        if(refs.showIntervals){
          refs.showIntervals.disabled = false;
        }
        if(refs.showDiagnostics){
          refs.showDiagnostics.disabled = false;
        }
        if(refs.forecastFieldset){
          refs.forecastFieldset.disabled = false;
        }
        [refs.logX, refs.logY].forEach(cb => {
          if(cb){
            cb.disabled = false;
          }
        });
        if(refs.replicateMode && refs.replicateMode.value === '3d'){
          refs.replicateMode.value = storedTableFormat === 'grouped' ? 'grouped' : 'single';
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
          lineHot.applyExclusions?.(exclusionsToApply);
        }
      }
    }else{
      lineReplicates = storedReplicates;
      if(refs.replicatesInput){
        refs.replicatesInput.value = String(lineReplicates);
      }
      if(lineReplicates > LINE_MIN_REPLICATES){
        lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
      }
      if(wants3d){
        lineViewState.viewMode = '3d';
      }else{
        lineViewState.viewMode = '2d';
      }
      updateLineReplicateModeControls(wants3d ? '3d' : undefined);
      if(storedGroupShapes){
        lineGroupShapes = storedGroupShapes.map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
      }
    }
    if(lineHot){
      syncLineActiveDataViewFromHot(lineHot, 'payload-load');
    }
    if(!lineHot && exclusionsToApply){
      console.debug('Debug: line exclusions deferred until hot ready');
    }else if(lineHot && exclusionsToApply && matrixData == null){
      lineHot.applyExclusions?.(exclusionsToApply);
    }
    lineTitleText=c.title||lineTitleText;
    lineXLabelText=c.xLabel||lineXLabelText;
    lineYLabelText=c.yLabel||lineYLabelText;
    lineZLabelText=c.zLabel||lineZLabelText;
    if(c.rotation){
      try{
        lineViewState.rotation = plot3d.createRotationState(c.rotation);
        if(typeof plot3d.normalizeRotation === 'function'){
          plot3d.normalizeRotation(lineViewState.rotation);
        }
      }catch(err){
        lineViewState.rotation = plot3d.createRotationState({ x: LINE_3D_DEFAULTS.rotationX, y: LINE_3D_DEFAULTS.rotationY });
        if(typeof plot3d.normalizeRotation === 'function'){
          plot3d.normalizeRotation(lineViewState.rotation);
        }
      }
    }
    if(refs.dotSize && c.dotSize!=null) refs.dotSize.value=c.dotSize;
    if(refs.fill && c.fill) refs.fill.value=c.fill;
    if(refs.border && c.border) refs.border.value=c.border;
    if(refs.borderWidth && c.borderWidth!=null) refs.borderWidth.value=c.borderWidth;
    if(refs.errorBarWidth){
      if(c.errorBarWidth!=null){
        refs.errorBarWidth.value=c.errorBarWidth;
      }else if(!refs.errorBarWidth.value){
        refs.errorBarWidth.value=refs.borderWidth?.value || '1';
      }
    }
    if(refs.alpha){
      refs.alpha.value=c.alpha||0;
      if(refs.alphaVal){
        refs.alphaVal.textContent=refs.alpha.value;
      }
    }
    const restoredDisplayMode = sanitizeLineDisplayMode(c.displayMode);
    if(refs.displayMode){
      refs.displayMode.value = restoredDisplayMode;
    }
    lineDisplayMode = restoredDisplayMode;
    lineLabelColors=c.labelColors||{};
    lineSeriesStyles=c.seriesStyles||{};
    if(refs.showGrid) refs.showGrid.checked=!!c.showGrid;
    setLineGridStyle(c.gridStyle, c.axis?.strokeWidth);
    if(refs.showFrame) refs.showFrame.checked=!!c.showFrame;
    if(refs.showLegend) refs.showLegend.checked=c.showLegend !== false;
    if(refs.logX) refs.logX.checked=!!c.logX;
    if(refs.logY) refs.logY.checked=!!c.logY;
    lineLogPlusOneX=!!c.logPlusOneX;
    lineLogPlusOneY=!!c.logPlusOneY;
    if(refs.showIntervals) refs.showIntervals.checked=!!c.showIntervals;
    if(refs.showDiagnostics) refs.showDiagnostics.checked=!!c.showDiagnostics;
    if(refs.xMin) refs.xMin.value=c.xMin||'';
    if(refs.xMax) refs.xMax.value=c.xMax||'';
    if(refs.yMin) refs.yMin.value=c.yMin||'';
    if(refs.yMax) refs.yMax.value=c.yMax||'';
    if(refs.originMode && c.originMode) refs.originMode.value=c.originMode;
    if(refs.originX) refs.originX.value=c.originX||'';
    if(refs.originY) refs.originY.value=c.originY||'';
    if(refs.fontSize){
      refs.fontSize.value=c.fontSize||refs.fontSize.value;
      if(refs.fontSize.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        console.debug('Debug: line font size base restored',{ value: refs.fontSize.value });
      }
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
    }
    if(c.axis){
      applyLineAxisSettings({
        strokeWidth: c.axis.strokeWidth,
        color: c.axis.color,
        tickIntervalX: c.axis.tickIntervalX ?? c.axis.xTickInterval ?? c.axis?.x?.tickInterval ?? null,
        tickIntervalY: c.axis.tickIntervalY ?? c.axis.yTickInterval ?? c.axis?.y?.tickInterval ?? null,
        minorTicksX: c.axis.minorTicksX ?? c.axis?.x?.minorTicks ?? false,
        minorTicksY: c.axis.minorTicksY ?? c.axis?.y?.minorTicks ?? false,
        minorTickSubdivisionsX: c.axis.minorTickSubdivisionsX ?? c.axis.minorSubdivisionsX ?? c.axis?.x?.minorTickSubdivisions ?? c.axis?.x?.minorSubdivisions ?? DEFAULT_MINOR_TICK_SUBDIVISIONS,
        minorTickSubdivisionsY: c.axis.minorTickSubdivisionsY ?? c.axis.minorSubdivisionsY ?? c.axis?.y?.minorTickSubdivisions ?? c.axis?.y?.minorSubdivisions ?? DEFAULT_MINOR_TICK_SUBDIVISIONS,
        notationX: c.axis.notationX ?? c.axis.axisNotationX ?? c.axis?.x?.notation ?? 'decimal',
        notationY: c.axis.notationY ?? c.axis.axisNotationY ?? c.axis?.y?.notation ?? 'decimal',
        additionalTicks: c.axis.additionalTicks,
        additionalTicksX: c.axis.additionalTicksX ?? c.axis?.x?.additionalTicks,
        additionalTicksY: c.axis.additionalTicksY ?? c.axis?.y?.additionalTicks,
        brokenAxis: c.axis.brokenAxis || {}
      });
      console.debug('Debug: line axis settings restored',{ axis: ensureLineAxisSettings() });
    }
    if(refs.regressionMode && c.regression?.mode){
      refs.regressionMode.value = c.regression.mode;
    }
    if(c.forecast){
      const restoredForecast = {
        horizon: clampForecastHorizon(c.forecast.horizon ?? lineForecastOptions.horizon),
        seasonLength: clampSeasonLength(c.forecast.seasonLength ?? lineForecastOptions.seasonLength),
        autoTune: c.forecast.autoTune != null ? !!c.forecast.autoTune : lineForecastOptions.autoTune,
        criterion: c.forecast.criterion === 'aic' ? 'aic' : 'bic'
      };
      lineForecastOptions = restoredForecast;
      if(refs.forecastHorizon) refs.forecastHorizon.value = String(restoredForecast.horizon);
      if(refs.forecastSeasonLength) refs.forecastSeasonLength.value = String(restoredForecast.seasonLength);
      if(refs.forecastAuto) refs.forecastAuto.checked = !!restoredForecast.autoTune;
      if(refs.forecastCriterion) refs.forecastCriterion.value = restoredForecast.criterion;
    }
    resolveForecastOptions({ syncInputs: true });
    updateForecastVisibility();
    if(wants3d){
      lineDisplayMode = 'line';
      if(refs.displayMode){
        refs.displayMode.value = 'line';
        refs.displayMode.disabled = true;
      }
      [refs.logX, refs.logY].forEach(cb => {
        if(!cb){ return; }
        cb.checked = false;
        cb.disabled = true;
      });
      if(refs.showFrame){
        refs.showFrame.checked = true;
        refs.showFrame.disabled = true;
      }
      if(refs.regressionMode){
        refs.regressionMode.disabled = true;
      }
      if(refs.showIntervals){
        refs.showIntervals.checked = false;
        refs.showIntervals.disabled = true;
      }
      if(refs.showDiagnostics){
        refs.showDiagnostics.checked = false;
        refs.showDiagnostics.disabled = true;
      }
      if(refs.forecastFieldset){
        refs.forecastFieldset.disabled = true;
      }
      if(refs.replicateMode && refs.replicateMode.value !== '3d'){
        refs.replicateMode.value = '3d';
      }
      if(refs.viewMode && refs.viewMode.value !== '3d'){
        refs.viewMode.value = '3d';
      }
      lineViewState.viewMode = '3d';
      updateLineReplicateModeControls('3d');
    }else{
      if(refs.displayMode){
        refs.displayMode.disabled = false;
      }
      [refs.logX, refs.logY].forEach(cb => {
        if(cb){
          cb.disabled = false;
        }
      });
      if(refs.showFrame){
        refs.showFrame.disabled = false;
      }
      if(refs.regressionMode){
        refs.regressionMode.disabled = false;
      }
      if(refs.showIntervals){
        refs.showIntervals.disabled = false;
      }
      if(refs.showDiagnostics){
        refs.showDiagnostics.disabled = false;
      }
      if(refs.forecastFieldset){
        refs.forecastFieldset.disabled = false;
      }
      if(refs.replicateMode && refs.replicateMode.value === '3d'){
        const fallbackFormat = storedTableFormat === 'grouped'
          ? 'grouped'
          : (storedReplicates > LINE_MIN_REPLICATES ? 'grouped' : 'single');
        refs.replicateMode.value = fallbackFormat;
      }
      if(refs.viewMode && refs.viewMode.value !== '2d'){
        refs.viewMode.value = '2d';
      }
      lineViewState.viewMode = '2d';
      updateLineReplicateModeControls();
    }
    lineLastRegressionSummaries = Array.isArray(c.regression?.seriesSummaries) ? c.regression.seriesSummaries.slice() : [];
    // Restore label positions if saved
        if(c.labelPositions){
      lineLabelPositions = {
        title: c.labelPositions.title || null,
        xLabel: c.labelPositions.xLabel || null,
        yLabel: c.labelPositions.yLabel || null,
        legend: c.labelPositions.legend || null
      };
    }
    // restore persisted stats HTML and metadata if present
    if(c.stats){
      try{
        const s = c.stats || {};
        lineStatsState.signature = s.signature || lineStatsState.signature;
        lineStatsState.version = Number(s.version) || lineStatsState.version || 0;
        lineStatsState.lastRunVersion = Number(s.lastRunVersion) || 0;
        if(refs.statsResults && typeof s.resultsHtml === 'string'){
          refs.statsResults.innerHTML = s.resultsHtml;
        }
        // restore stat control values if saved
        if(s.controls && typeof s.controls === 'object'){
          if(typeof s.controls.method === 'string' && refs.statType){ refs.statType.value = s.controls.method; }
          if(typeof s.controls.regressionMode === 'string' && refs.regressionMode){ refs.regressionMode.value = s.controls.regressionMode; }
        }
        if(lineStatsState.lastRunVersion && lineStatsState.lastRunVersion === lineStatsState.version){
          setLineStatsStatus('Statistics up to date.');
          updateLineStatsButtonState({ disabled: false, label: 'Recalculate statistics' });
        }else{
          // leave button enabled so user can (re)calculate
          updateLineStatsButtonState({ disabled: false, label: 'Calculate statistics' });
        }
        lineStatsState.context = null;
        lineStatsState.computationPending = false;
        console.debug('Debug: line stats restored from payload', { signature: s.signature, version: s.version, lastRunVersion: s.lastRunVersion });
      }catch(e){
        console.debug('Debug: restore line stats failed', e?.message || String(e));
      }
    }
    else {
      // no persisted stats in payload -> clear any previous results and state
      try{
        clearLineStatsOutputs(lineStatsEmptyPlaceholder);
        lineStatsState.signature = null;
        lineStatsState.version = 0;
        lineStatsState.lastRunVersion = 0;
        lineStatsState.context = null;
        lineStatsState.computationPending = false;
        updateLineStatsButtonState({ disabled: true, label: 'Calculate statistics' });
      }catch(err){
        console.debug('Debug: clearing line stats during payload apply failed', { err: err?.message || String(err) });
      }
    }
    ensureLineLabelColors(Object.keys(lineLabelColors));
    ensureLineResizerControls();
    syncLineAspectControls('payload');
    if(!skipDraw){
      scheduleLineDraw();
    }
    if(scheduleBackup){
      scheduleLineDraw = scheduleBackup;
    }
    console.debug('Debug: line payload applied', { source: meta.source || 'unknown', hasData: !!matrixData });
    return true;
  }

  function loadLineGraphFile(file){
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target.result);
        if(!applyLineGraphPayload(obj, { source: 'file', flagOverlay: true, overlayReason: 'graph-file' })){
          console.warn('line payload rejected from file', { hasType: !!obj?.type });
        }
      }catch(err){ console.error('loadLineGraph error',err); }
    };
    reader.readAsText(file);
  }

  async function saveLineFile(){
    const payload=getLineGraphPayload();
    if(!payload) return;
    console.debug('Debug: saveLineFile',{hasHandle:!!lineFileHandle}); // Debug: save request
    if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
      console.error('saveLineFile missing fileIO.saveGraphFile');
      return;
    }
    const result = await fileIO.saveGraphFile({
      context: 'line',
      fileHandle: lineFileHandle,
      payload,
      fileName: lineFileName,
      downloadFileName: lineFileName,
      setFileHandle: handle => { lineFileHandle = handle; },
      setFileName: name => { lineFileName = name; }
    });
    console.debug('Debug: saveLineFile result', result);
  }

  async function saveAsLineFile(){
    const payload=getLineGraphPayload();
    if(!payload) return;
    console.debug('Debug: saveAsLineFile invoked'); // Debug: saveAs entry
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('saveAsLineFile missing fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'line',
      payload,
      fileName: lineFileName,
      downloadFileName: lineFileName,
      setFileHandle: handle => { lineFileHandle = handle; },
      setFileName: name => { lineFileName = name; }
    });
    console.debug('Debug: saveAsLineFile result', result);
  }

  async function openLineFile(){
    console.debug('Debug: openLineFile start'); // Debug: open entry
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('openLineFile missing fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'line',
      setFileHandle: handle => { lineFileHandle = handle; },
      setFileName: name => { lineFileName = name; },
      loadFromFile: file => loadLineGraphFile(file),
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
    const svgEl=document.getElementById('lineSvg');
    if(!svgEl) return null;
    const clone=svgEl.cloneNode(true);
    const viewBox = svgEl.viewBox?.baseVal;
    const minX = Number.isFinite(viewBox?.x) ? viewBox.x : 0;
    const minY = Number.isFinite(viewBox?.y) ? viewBox.y : 0;
    const baseW = Number.isFinite(viewBox?.width) && viewBox.width > 0 ? viewBox.width : (svgEl.clientWidth || 800);
    const baseH = Number.isFinite(viewBox?.height) && viewBox.height > 0 ? viewBox.height : (svgEl.clientHeight || 400);
    clone.setAttribute('width',String(baseW));
    clone.setAttribute('height',String(baseH));
    clone.setAttribute('viewBox',`${minX} ${minY} ${baseW} ${baseH}`);
    const exportFont = chartStyle.FONT_FAMILY || 'Arial, Helvetica, sans-serif';
    clone.setAttribute('font-family', exportFont);
    console.debug('Debug: buildLineExportSvg',{legendCount:lineLegendItems.length, exportFont}); // Debug: export clone info
    return clone;
  }

  function drawLine3d(){
    try{
      const debugStamp = Date.now();
      console.debug('Debug: drawLine3d start', { debugStamp });
      hideLineTooltip('redraw-start');
      if(!lineHot || !refs.plot){
        return;
      }
      lineLastRegressionSummaries = [];
      lineViewState.rotationPending = false;
      lineViewState.rotationPendingLogged = false;
      if(typeof plot3d.normalizeRotation === 'function'){
        plot3d.normalizeRotation(lineViewState.rotation);
      }
      const fill = refs.fill?.value;
      const alpha = Number(refs.alpha?.value) || 0;
      const borderWidthRaw = Number(refs.borderWidth?.value);
      const borderColor = refs.border?.value;
      const containerRect = refs.svgBox?.getBoundingClientRect?.();
      const fontInfo = chartStyle.resolveScaledFontSize({
        rawSize: refs.fontSize?.value,
        width: containerRect?.width,
        height: containerRect?.height,
        svgBox: refs.svgBox,
        input: refs.fontSize
      });
      const fs = fontInfo.scaledPx;
      const styleScaleInfo = fontInfo.scaleInfo;
      const axisStrokeWidthBase = getLineAxisStrokeWidth();
      const axisStrokeWidth = chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'line-axis-3d', min: 0.25 });
      const axisStroke = getLineAxisColor();
      const lineThemeDark = String(lineColorSchemeId || '').toLowerCase() === 'dark';
      const lineThemeTextColor = normalizeLineThemeColor(
        lineTextColor,
        lineThemeDark ? '#f2f2f2' : (chartStyle.TEXT_COLOR || '#000000')
      );
      const dotSizeRaw = Number(refs.dotSize?.value) || 0;
      const dotSizePx = chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'line-marker-3d', min: 0 });
      const borderWidthPx = chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'line-series-3d', min: 0 });
      chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, fontInfo, input: refs.fontSize });
      const showGrid = !!refs.showGrid?.checked;
      const gridStyleBase3d = getLineGridStyle(axisStrokeWidthBase);
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
      const showLegend = refs.showLegend ? !!refs.showLegend.checked : true;
      ensureLineResizerControls();
      const xMinManual = parseFloat(refs.xMin?.value);
      const xMaxManual = parseFloat(refs.xMax?.value);
      const yMinManual = parseFloat(refs.yMin?.value);
      const yMaxManual = parseFloat(refs.yMax?.value);

      const matrix = lineHot.getData();
      if(!Array.isArray(matrix) || !matrix.length){
        resetLineRenderState('line-3d-no-data-matrix');
        handleLineStatsUnavailable(null, lineStatsEmptyPlaceholder);
        return;
      }
      const header = Array.isArray(matrix[0]) ? matrix[0] : [];
      const axisHeaders = resolveLine3dAxisHeaders(header);
      const prevAxisLabels = { x: lineXLabelText, y: lineYLabelText, z: lineZLabelText };
      let xIndex = axisHeaders.xIndex;
      lineXLabelText = axisHeaders.xLabel;
      lineYLabelText = axisHeaders.yLabel;
      lineZLabelText = axisHeaders.zLabel;
      if(prevAxisLabels.x !== lineXLabelText || prevAxisLabels.y !== lineYLabelText || prevAxisLabels.z !== lineZLabelText){
        lineDebug('Debug: line 3d axis labels synced', {
          previous: prevAxisLabels,
          next: { x: lineXLabelText, y: lineYLabelText, z: lineZLabelText }
        });
      }
      const seriesCount = inferLine3dSeriesCount(matrix);
      if(seriesCount <= 0){
        resetLineRenderState('line-3d-no-series', { message: 'Add Y/Z dataset columns to render a 3D line plot.' });
        handleLineStatsUnavailable(null, '3D line view requires paired Y and Z columns.');
        return;
      }
      ensureLine3dGroupLabelCapacity(seriesCount);
      ensureLineGroupShapeCapacity(seriesCount);
      const series = [];
      for(let s = 0; s < seriesCount; s += 1){
        const stored = lineSeriesGroupLabels?.[s];
        const resolvedName = stored && String(stored).trim() ? String(stored).trim() : `Series ${s + 1}`;
        if(!lineSeriesGroupLabels[s]){
          lineSeriesGroupLabels[s] = resolvedName;
        }
        series.push({ name: resolvedName, points: [], shape: getLineGroupShape(s), seriesIndex: s });
      }
      let xMinRaw = Infinity;
      let xMaxRaw = -Infinity;
      let yMinRaw = Infinity;
      let yMaxRaw = -Infinity;
      let zMinRaw = Infinity;
      let zMaxRaw = -Infinity;
      for(let r = 1; r < matrix.length; r += 1){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        const xv = parseFloat(row[xIndex]);
        const hasX = Number.isFinite(xv);
        for(let s = 0; s < seriesCount; s += 1){
          const yCol = 1 + s * 2;
          const zCol = yCol + 1;
          const yv = parseFloat(row[yCol]);
          const zv = parseFloat(row[zCol]);
          if(hasX && Number.isFinite(yv) && Number.isFinite(zv)){
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
      ensureLineLabelColors(labelsUsed);
      const colors = seriesWithData.map((s, i) => lineLabelColors[s.name] || borderColor || DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length]);
      const seriesShapes = seriesWithData.map((s) => {
        const idx = Number.isInteger(s.seriesIndex) ? s.seriesIndex : 0;
        const resolvedShape = sanitizeLineGroupShape(s.shape, idx);
        s.shape = resolvedShape;
        return resolvedShape;
      });
      const legendEntries = seriesWithData.map((s, i) => ({
        label: s.name,
        fill: colors[i],
        key: s.name,
        editable: true,
        shape: seriesShapes[i],
        seriesIndex: Number.isInteger(s.seriesIndex) ? s.seriesIndex : i
      }));
      const legendLayout = chartStyle.computeLegendLayout({
        entries: showLegend ? legendEntries : [],
        fontSize: fs,
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
          const currentColor = lineLabelColors[legendKey] || entry.fill;
          const seriesIndex = Number.isInteger(entry.seriesIndex) && entry.seriesIndex >= 0
            ? entry.seriesIndex
            : (Number.isInteger(index) ? index : -1);
          const initialShape = Number.isInteger(seriesIndex) && seriesIndex >= 0
            ? getLineGroupShape(seriesIndex)
            : null;
          const applyLegendColor = value => {
            const nextValue = value != null ? String(value) : '';
            const previousValue = lineLabelColors[legendKey] || '';
            if(nextValue){
              if(previousValue === nextValue){
                return true;
              }
              lineLabelColors[legendKey] = nextValue;
            }else if(previousValue){
              delete lineLabelColors[legendKey];
            }else{
              return true;
            }
            scheduleLineDraw();
            return true;
          };
          const applyLegendShape = value => {
            if(!Number.isInteger(seriesIndex) || seriesIndex < 0){
              return true;
            }
            const sanitized = sanitizeLineGroupShape(value, seriesIndex);
            const shapes = ensureLineGroupShapeCapacity(Math.max(seriesCount, seriesIndex + 1));
            if(shapes[seriesIndex] === sanitized){
              return true;
            }
            shapes[seriesIndex] = sanitized;
            lineGroupShapes = shapes;
            scheduleLineDraw();
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
      applyLineLegendGuardWidth(legendLayout.minSvgWidth);

      const plotEl = refs.plot;
      const existingSvg = plotEl.querySelector('#lineSvg');
      const reuse3dSvg = existingSvg && existingSvg.dataset.viewMode === '3d';
      if(!reuse3dSvg){
        while(plotEl.firstChild){
          plotEl.removeChild(plotEl.firstChild);
        }
      }
      const targetAspect = Number.isFinite(LINE_3D_DEFAULTS.aspectRatio) && LINE_3D_DEFAULTS.aspectRatio > 0 ? LINE_3D_DEFAULTS.aspectRatio : (4 / 3);
      const fallbackWidth = 460;
      const fallbackHeight = Math.round(fallbackWidth / targetAspect);
      const bounds = typeof plotEl.getBoundingClientRect === 'function' ? plotEl.getBoundingClientRect() : { width: 0, height: 0 };
      const availableWidth = Math.floor(bounds.width || plotEl.clientWidth || 0);
      const availableHeight = Math.floor(bounds.height || plotEl.clientHeight || 0);
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
      plotEl.style.display = 'block';
      plotEl.style.position = 'relative';
      plotEl.style.aspectRatio = `${W3} / ${H3}`;
      plotEl.style.padding = plotEl.style.padding || '12px';
      plotEl.style.backgroundColor = '';
      plotEl.style.boxSizing = 'border-box';
      const svg3 = reuse3dSvg ? existingSvg : global.document.createElementNS(NS, 'svg');
      if(!reuse3dSvg){
        svg3.setAttribute('id', 'lineSvg');
        plotEl.appendChild(svg3);
      }
      svg3.setAttribute('width', String(W3));
      svg3.setAttribute('height', String(H3));
      svg3.setAttribute('viewBox', `0 0 ${W3} ${H3}`);
      svg3.setAttribute('font-family', chartStyle.FONT_FAMILY);
      svg3.dataset.viewMode = '3d';
      chartStyle.applySvgDefaults(svg3);
      while(svg3.firstChild){
        svg3.removeChild(svg3.firstChild);
      }
      svg3.style.backgroundColor = lineThemeDark
        ? normalizeLineThemeColor(lineBackgroundColor, '#000000')
        : '';
      svg3.style.pointerEvents = 'all';
      svg3.setAttribute('data-color-scheme', lineColorSchemeId || 'scientific');
      appendLine3dBackground(svg3, W3, H3);
      svg3.addEventListener('mouseleave', handleLinePlotMouseLeave);
      plot3d.attachRotationControls(svg3, {
        state: lineViewState.rotation,
        onChange: () => scheduleLineRotationRedraw(),
        shouldIgnorePointer: (event) => {
          if(typeof plot3d.isInteractivePointerTarget === 'function'){
            return plot3d.isInteractivePointerTarget(event?.target);
          }
          return plot3d.isLegendPointerTarget(event?.target);
        },
        debugLabel: 'line-3d'
      });
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(svg3, { scopeId: 'line' });
      }

      const legendAxisGap = Math.max(fs * 0.9, 18);
      const appliedLegendAxisGap = showLegend ? legendAxisGap : 0;
      const legendGapFor3d = legendLayout?.legendGapPx ?? 12;
      const baseLegendMargin = Math.max(fs * 2.25, 28);
      const legendMargin = showLegend ? lineLegendWidth + appliedLegendAxisGap + baseLegendMargin : baseLegendMargin;
      const margin3 = {
        top: Math.max(fs * 3.2, 36),
        right: legendMargin,
        bottom: Math.max(fs * 3.2, 40),
        left: Math.max(fs * 3.2, 40)
      };
      const legendVisible = showLegend && legendLayout?.renderer?.entries?.length > 0;
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
      const equalScale3d = !!lineViewState.equalScaleAxes;
      const equalLength3d = !!lineViewState.equalAxes;
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
      const rotatePoint = (pt) => plot3d.rotatePoint(pt, lineViewState.rotation);
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

      plot3d.renderAxesAndGrid({
        svg: svg3,
        project: projector.project,
        rotatePoint,
        axisRanges: renderAxisRanges3d,
        axisTicks: axisTicks3d,
        axisLabels: { x: lineXLabelText, y: lineYLabelText, z: lineZLabelText },
        fontSize: fs,
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
        onAxisLabel: (node, axisKey) => {
          if(!node){
            return;
          }
          const role = axisKey === 'z' ? 'zTitle' : (axisKey === 'y' ? 'yTitle' : 'xTitle');
          const defaultLabel = axisKey === 'y' ? 'Y' : (axisKey === 'z' ? 'Z' : 'X');
          const applyAxisLabel = (value) => {
            const trimmed = value != null ? String(value).trim() : '';
            const resolved = trimmed || defaultLabel;
            const current = axisKey === 'x'
              ? lineXLabelText
              : (axisKey === 'y' ? lineYLabelText : lineZLabelText);
            if(current === resolved){
              return resolved;
            }
            if(axisKey === 'x'){ lineXLabelText = resolved; }
            else if(axisKey === 'y'){ lineYLabelText = resolved; }
            else { lineZLabelText = resolved; }
            syncLine3dAxisHeader(axisKey, resolved, { source: 'line-axis-inline' });
            if(node.textContent !== resolved){
              node.textContent = resolved;
            }
            scheduleLineDraw();
            return resolved;
          };
          markFontEditable(node, role, role);
          makeEditableHelper(node, text => {
            const previous = axisKey === 'x'
              ? (lineXLabelText ?? '')
              : (axisKey === 'y' ? (lineYLabelText ?? '') : (lineZLabelText ?? ''));
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

      renderQueue.forEach((entry, i) => {
        const s = entry.series;
        const color = colors[entry.index] || borderColor || DEFAULT_SCATTER_COLORS[i % DEFAULT_SCATTER_COLORS.length];
        const styleOverride = lineSeriesStyles?.[s.name] || {};
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
          || lineLabelColors[s.name]
          || fill
          || color;
        let pathStr = '';
        let started = false;
        for(let p = 0; p < entry.projectedPoints.length; p += 1){
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
          path.dataset.viewMode = '3d';
          path.style.cursor = 'pointer';
          path.addEventListener('click', handleLinePathClick);
          lineLayer.appendChild(path);
          const mGroup = global.document.createElementNS(NS, 'g');
          markerLayer.appendChild(mGroup);
          if(seriesDotSize > 0){
            const markerEntries = [];
            for(let p = 0; p < entry.projectedPoints.length; p += 1){
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
      });

      svg3.appendChild(frontFrameLayer);

      const toggleSeriesVisibility = seriesIndex => {
        const target = seriesElems[seriesIndex];
        if(!target){
          return;
        }
        const currentlyVisible = target.path.style.display !== 'none';
        const nextDisplay = currentlyVisible ? 'none' : 'inline';
        target.path.style.display = nextDisplay;
        target.mGroup.style.display = nextDisplay;
      };

      const legendRenderer = legendLayout.renderer;
      if(showLegend && legendRenderer.entries.length){
        const defaultLegendX = margin3.left + plotW3 + legendGapFor3d + appliedLegendAxisGap;
        const defaultLegendY = margin3.top + legendRenderer.baselineOffset;
        const legendPos = lineLabelPositions?.legend;
        
        // Convert relative positions to absolute if needed for 3D legend
        let absoluteLegendX = defaultLegendX;
        let absoluteLegendY = defaultLegendY;
        if (legendPos) {
          if (legendPos.relX !== undefined && legendPos.relY !== undefined) {
            // Use relative positioning
            absoluteLegendX = margin3.left + plotW3 + legendPos.relX * legendGapFor3d;
            absoluteLegendY = margin3.top + legendPos.relY * plotH3;
          } else if (legendPos.x !== undefined && legendPos.y !== undefined) {
            // Use absolute positioning (backward compatibility)
            absoluteLegendX = legendPos.x;
            absoluteLegendY = legendPos.y;
          }
        }
        
        const legendGroup = legendRenderer.draw(svg3,{
          x: absoluteLegendX,
          y: absoluteLegendY
        });
        if(legendGroup){
          plot3d.applyLegendPointerGuards(legendGroup, { label: 'line-legend-3d' });
          if(typeof Shared.enableLegendDrag === 'function'){
            Shared.enableLegendDrag(legendGroup, svg3, {
              onDragEnd: pos => {
                // Store both absolute and relative positions for 3D legend
                const relX = (pos.x - (margin3.left + plotW3)) / legendGapFor3d;
                const relY = (pos.y - margin3.top) / plotH3;
                lineLabelPositions.legend = { 
                  x: pos.x, 
                  y: pos.y,
                  relX: relX, 
                  relY: relY 
                };
                if(Shared.isDebugEnabled?.()){
                  console.debug('Debug: line 3d legend position saved', { absolute: pos, relative: { relX, relY } });
                }
              }
            });
          }
          if(typeof legendGroup.querySelectorAll === 'function'){
            const interactiveNodes = legendGroup.querySelectorAll('[data-legend-key]');
            interactiveNodes.forEach(node => {
              plot3d.applyLegendPointerGuards(node, { label: node.dataset.legendKey || null });
            });
          }
          const textNodes = legendGroup.querySelectorAll('text');
          legendRenderer.entries.forEach((legendEntry, idx) => {
            const textNode = textNodes[idx];
            if(!textNode){
              return;
            }
            markFontEditable(textNode, 'legend', `legend-${idx}`);
            textNode.style.cursor = 'pointer';
            const seriesIndex = Number.isInteger(legendEntry?.seriesIndex) ? legendEntry.seriesIndex : idx;
            textNode.addEventListener('click', () => toggleSeriesVisibility(seriesIndex));
          });
        }
      }

      const defaultTitleY = Math.max(margin3.top * 0.4, fs * 1.6);
      const defaultTitleX = margin3.left + plotW3 / 2;
      const titlePos = lineLabelPositions?.title;
      
      // Convert relative positions to absolute if needed for 3D title
      let absoluteTitleX = defaultTitleX;
      let absoluteTitleY = defaultTitleY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin3.left + titlePos.relX * plotW3;
          absoluteTitleY = margin3.top + titlePos.relY * plotH3;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }
      
      const title3d = global.document.createElementNS(NS, 'text');
      title3d.setAttribute('x', String(absoluteTitleX));
      title3d.setAttribute('y', String(absoluteTitleY));
      title3d.setAttribute('text-anchor', 'middle');
      title3d.setAttribute('font-size', String(fs));
      title3d.setAttribute('fill', lineThemeTextColor);
      title3d.textContent = lineTitleText;
      svg3.appendChild(title3d);
      markFontEditable(title3d, 'graphTitle', 'graphTitle');
      plot3d.applyLegendPointerGuards(title3d, { label: 'line-title-3d' });
      const applyLineTitle3d = value => {
        const nextValue = value != null ? String(value) : '';
        lineTitleText = nextValue;
        if(title3d.textContent !== nextValue){
          title3d.textContent = nextValue;
        }
        scheduleLineDraw();
      };
      makeEditableHelper(title3d, txt => {
        const previous = lineTitleText != null ? String(lineTitleText) : '';
        const nextValue = txt != null ? String(txt) : '';
        if(previous === nextValue){
          return;
        }
        applyLineTitle3d(nextValue);
        recordLineChange('line:title', previous, nextValue, applyLineTitle3d);
      });
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(title3d, svg3, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for 3D title
            const relX = (pos.x - margin3.left) / plotW3;
            const relY = (pos.y - margin3.top) / plotH3;
            lineLabelPositions.title = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            if(Shared.isDebugEnabled?.()){
              console.debug('Debug: line 3d title position saved', { absolute: pos, relative: { relX, relY } });
            }
          }
        });
      }

      registerLineGridControlTarget(svg3, { fallbackThickness: axisStrokeWidthBase });
      handleLineStatsUnavailable(null, 'Statistics are available in 2D view.');
      ensureGraphViewport(svg3, { padding: Math.max(fs, 18), debugLabel: 'line-3d-graph' });
      lineLayout?.syncPanels?.({ skipSchedule: true });
      scheduleLineNoticeWidth('draw-3d');
      console.debug('Debug: drawLine3d complete', { debugStamp });
    }catch(err){
      console.error('drawLine3d error', err);
    }
  }

  function drawLine(){
    try{
      const debugStamp=Date.now();
      console.debug('Debug: drawLine start',{debugStamp}); // Debug: draw entry
      hideLineTooltip('redraw-start');
      if(!lineHot || !refs.plot) return;
      if(lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d'){
        drawLine3d();
        return;
      }
      if(refs.plot){
        refs.plot.style.aspectRatio = '';
        refs.plot.style.padding = '';
      }
      lineLastRegressionSummaries = [];
      const fill=refs.fill?.value;
      const alpha=Number(refs.alpha?.value)||0;
      const borderWidthRaw=Number(refs.borderWidth?.value);
      const errorBarWidthInput=Number(refs.errorBarWidth?.value);
      const errorBarWidthRaw=Number.isFinite(errorBarWidthInput)?errorBarWidthInput:borderWidthRaw;
      const borderColor=refs.border?.value;
      const containerRect=refs.svgBox?.getBoundingClientRect?.();
      const fontInfo=chartStyle.resolveScaledFontSize({
        rawSize: refs.fontSize?.value,
        width: containerRect?.width,
        height: containerRect?.height,
        svgBox: refs.svgBox,
        input: refs.fontSize
      });
      const fs=fontInfo.scaledPx;
      const styleScaleInfo=fontInfo.scaleInfo;
      const axisStrokeWidthBase = getLineAxisStrokeWidth();
      const axisStrokeWidth=chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'line-axis', min: 0.25 });
      const axisStroke = getLineAxisColor();
      const dotSizeRaw=Number(refs.dotSize?.value)||0;
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
        input: refs.fontSize?.value,
        fontSizePt: fontInfo.pt,
        baseFontPx: fontInfo.px,
        scaledFontPx: fs,
        scale: fontInfo.scaleInfo?.scale,
        containerWidth: containerRect?.width,
        containerHeight: containerRect?.height
      }); // Debug: line font scaling summary
      const axisMetrics=chartStyle.createAxisMetrics(fs);
      console.debug('Debug: line axis metrics',axisMetrics);
      const showGrid=!!refs.showGrid?.checked;
      const gridStyleBase = getLineGridStyle(axisStrokeWidthBase);
      const gridStrokeStyle = Object.assign({}, gridStyleBase, {
        thickness: chartStyle.scaleStrokeWidth(gridStyleBase.thickness, styleScaleInfo, { context: 'line-grid', min: 0 })
      });
      const gridStrokeAttrs = (gridControls && typeof gridControls.getStrokeAttributes === 'function')
        ? gridControls.getStrokeAttributes(gridStrokeStyle, { fallbackColor: DEFAULT_GRID_COLOR, fallbackThickness: axisStrokeWidth })
        : { stroke: DEFAULT_GRID_COLOR, 'stroke-width': axisStrokeWidth };
      const showFrame=!!refs.showFrame?.checked;
      console.debug('Debug: line showFrame state',{showFrame});
      ensureLineResizerControls();
      const showLegend=refs.showLegend ? !!refs.showLegend.checked : true;
      console.debug('Debug: line showLegend state',{showLegend});
      const logX=!!refs.logX?.checked;
      const logY=!!refs.logY?.checked;
      const displayModeCurrent = sanitizeLineDisplayMode(refs.displayMode?.value ?? lineDisplayMode);
      if(displayModeCurrent !== lineDisplayMode){
        lineDisplayMode = displayModeCurrent;
      }
      const isAreaMode = displayModeCurrent === 'area';
      console.debug('Debug: line display mode',{ mode: displayModeCurrent });
      const storedManualIntervalX = getLineAxisTickInterval('x');
      const storedManualIntervalY = getLineAxisTickInterval('y');
      const manualIntervalX = !logX ? storedManualIntervalX : null;
      const manualIntervalY = !logY ? storedManualIntervalY : null;
      if(logX && storedManualIntervalX){
        console.debug('Debug: line manual interval suppressed',{ axis: 'x', reason: 'log-scale', stored: storedManualIntervalX });
      }
      if(logY && storedManualIntervalY){
        console.debug('Debug: line manual interval suppressed',{ axis: 'y', reason: 'log-scale', stored: storedManualIntervalY });
      }
      const showIntervals=!!refs.showIntervals?.checked;
      const showDiagnostics=!!refs.showDiagnostics?.checked;
      const regressionModeCurrent = refs.regressionMode?.value || 'linear';
      const regressionAlpha = 0.05;
      const forecastOptions = resolveForecastOptions();
      console.debug('Debug: line regression configuration',{ showIntervals, showDiagnostics, regressionMode: regressionModeCurrent, forecastOptions });
      const xMinManual=parseFloat(refs.xMin?.value);
      const xMaxManual=parseFloat(refs.xMax?.value);
      const yMinManual=parseFloat(refs.yMin?.value);
      const yMaxManual=parseFloat(refs.yMax?.value);
      const originMode=refs.originMode?.value;
      const originXInput=parseFloat(refs.originX?.value);
      const originYInput=parseFloat(refs.originY?.value);
      const data=lineHot.getData();
      const regressionCache=new Map();
      const statsContext={ showIntervals, showDiagnostics, alpha: regressionAlpha, regressionCache, forecast: forecastOptions };
      if(!Array.isArray(data) || !data.length){
        resetLineRenderState('no-data-matrix');
        handleLineStatsUnavailable(statsContext, lineStatsEmptyPlaceholder);
        return;
      }
      const header=Array.isArray(data[0])?data[0]:[];
      let xIndex=header.findIndex(h=>String(h).trim().toLowerCase()==='x');
      if(xIndex<0) xIndex=0;
      lineXLabelText=(header[xIndex]&&String(header[xIndex]).trim())||'X';
      const replicates=Math.max(LINE_MIN_REPLICATES,lineReplicates);
      const totalSeries=Math.max(0,Math.floor((header.length-1)/replicates));
      ensureLineGroupShapeCapacity(totalSeries);
      const series=[];
      for(let s=0;s<totalSeries;s++){
        const baseIdx=1+s*replicates;
        const fallback=`Series ${s+1}`;
        const label=baseIdx<header.length?header[baseIdx]:fallback;
        const baseName=inferSeriesBaseName(label,fallback);
        const stored = lineSeriesGroupLabels?.[s];
        const resolvedName = stored && String(stored).trim() ? String(stored).trim() : baseName;
        if(!lineSeriesGroupLabels[s] && resolvedName){
          lineSeriesGroupLabels[s] = resolvedName;
        }
        const shape = getLineGroupShape(s);
        series.push({name:resolvedName,baseName,points:[],shape});
      }
      console.debug('Debug: line series names resolved',{ seriesNames: series.map(s=>s.name), totalSeries });
      let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
      for(let r=1;r<data.length;r++){
        const row=Array.isArray(data[r])?data[r]:[];
        const xv=parseFloat(row[xIndex]);
        const hasX=Number.isFinite(xv);
        for(let s=0;s<series.length;s++){
          const repValues=[];
          for(let rep=0;rep<replicates;rep++){
            const colIndex=1+s*replicates+rep;
            if(colIndex>=row.length) continue;
            const yv=parseFloat(row[colIndex]);
            if(Number.isFinite(yv)){
              repValues.push(yv);
            }
          }
          if(hasX && repValues.length){
            const replicateCount=repValues.length;
            const mean=repValues.reduce((sum,val)=>sum+val,0)/replicateCount;
            let variance=0;
            if(replicateCount>1){
              variance=repValues.reduce((sum,val)=>{const diff=val-mean;return sum+diff*diff;},0)/(replicateCount-1);
            }
            const stdev=replicateCount>1?Math.sqrt(variance):0;
            const minVal=Math.min(...repValues);
            const maxVal=Math.max(...repValues);
            const hasSpread=replicateCount>1;
            const lower=hasSpread?mean-stdev:null;
            const upper=hasSpread?mean+stdev:null;
            const yMinCandidate=hasSpread?lower:minVal;
            const yMaxCandidate=hasSpread?upper:maxVal;
            if(!hasSpread){
              console.debug('Debug: line skip error range for single value',{ series:s, row:r, replicateCount, x:xv, value:minVal });
            }
            series[s].points.push({x:xv,y:mean,replicates:repValues.slice(),replicateCount,stdev:hasSpread?stdev:0,lower,upper});
            if(xv<xMinRaw) xMinRaw=xv;
            if(xv>xMaxRaw) xMaxRaw=xv;
            if(yMinCandidate<yMinRaw) yMinRaw=yMinCandidate;
            if(yMaxCandidate>yMaxRaw) yMaxRaw=yMaxCandidate;
          }else{
            series[s].points.push(null);
          }
        }
      }
      let seriesWithData=series.filter(s=>s.points.some(pt=>pt));
      if(seriesWithData.length!==series.length){
        console.debug('Debug: line empty series filtered',{ totalSeries: series.length, renderedSeries: seriesWithData.length });
      }
      if(!seriesWithData.length){
        resetLineRenderState('no-valid-series');
        handleLineStatsUnavailable(statsContext, 'Not enough data for statistics.');
        return;
      }
      if(logX && xMinRaw<=0){
        if(!lineLogPlusOneX){
          resetLineRenderState('log-x-nonpositive',{ message: '<i>Log scale requires positive X values.</i>', allowHtml: true });
          handleLineStatsUnavailable(statsContext, 'Log scale requires positive X values before statistics can be calculated.');
          return;
        }
      }
      if(logY && yMinRaw<=0){
        if(!lineLogPlusOneY){
          resetLineRenderState('log-y-nonpositive',{ message: '<i>Log scale requires positive Y values.</i>', allowHtml: true });
          handleLineStatsUnavailable(statsContext, 'Log scale requires positive Y values before statistics can be calculated.');
          return;
        }
      }
      // Apply log+1 transform if enabled
      if(logX && lineLogPlusOneX){
        seriesWithData.forEach(s=>{
          s.points=s.points.map(pt=>{
            if(!pt || !Number.isFinite(pt.x)) return pt;
            return { ...pt, x: pt.x + 1 };
          });
        });
        if(Number.isFinite(xMinRaw)) xMinRaw = xMinRaw + 1;
        if(Number.isFinite(xMaxRaw)) xMaxRaw = xMaxRaw + 1;
        console.debug('Debug: line log+1 transform applied to X');
      }
      if(logY && lineLogPlusOneY){
        seriesWithData.forEach(s=>{
          s.points=s.points.map(pt=>{
            if(!pt || !Number.isFinite(pt.y)) return pt;
            const newPt = { ...pt, y: pt.y + 1 };
            if(Number.isFinite(pt.lower)) newPt.lower = pt.lower + 1;
            if(Number.isFinite(pt.upper)) newPt.upper = pt.upper + 1;
            if(Array.isArray(pt.replicates)){
              newPt.replicates = pt.replicates.map(v => Number.isFinite(v) ? v + 1 : v);
            }
            return newPt;
          });
        });
        if(Number.isFinite(yMinRaw)) yMinRaw = yMinRaw + 1;
        if(Number.isFinite(yMaxRaw)) yMaxRaw = yMaxRaw + 1;
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
        if(global.jStat && typeof regressionTools.fitRegression==='function'){
        seriesWithData.forEach(s=>{
          const pts=s.points.filter(Boolean);
          if(pts.length>=3){
            try{
              const regressionModel=regressionTools.fitRegression(pts,{ mode: regressionModeCurrent, alpha: regressionAlpha, forecast: forecastOptions });
              if(regressionModel){
                regressionCache.set(s.name, regressionModel);
                s.regression=regressionModel;
                console.debug('Debug: line regression prepared',{ series: s.name, mode: regressionModeCurrent, hasIntervals: !!regressionModel.intervals });
              }
            }catch(err){
              console.error('line regression fit error', err);
              s.regression=null;
            }
          }else{
            s.regression=null;
          }
        });
      }
      ensureLineLabelColors(labelsUsed);
      const colors=seriesWithData.map((s,i)=>lineLabelColors[s.name]||borderColor||DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length]);
      const seriesShapes = seriesWithData.map((s,i)=>{
        const baseIndex = series.indexOf(s);
        const fallbackIndex = baseIndex >= 0 ? baseIndex : i;
        const resolvedShape = sanitizeLineGroupShape(s.shape, fallbackIndex);
        s.shape = resolvedShape;
        return resolvedShape;
      });
      const legendEntries=seriesWithData.map((s,i)=>({
        label:s.name,
        fill:colors[i],
        key:s.name,
        editable:true,
        shape: seriesShapes[i],
        seriesIndex: (()=>{ const idx = series.indexOf(s); return Number.isInteger(idx) && idx >= 0 ? idx : i; })()
      }));
      const legendLayout=chartStyle.computeLegendLayout({
        entries:showLegend ? legendEntries : [],
        fontSize:fs,
        strokeWidth:borderWidthPx,
        onSwatchClick:({ entry, swatch, event, index })=>{
          const legendKey=entry?.key || entry?.label;
          if(!legendKey || !swatch){ return; }
          if(event){ event.stopPropagation(); }
          const currentColor=lineLabelColors[legendKey]||entry.fill;
          const seriesIndex=Number.isInteger(entry.seriesIndex) && entry.seriesIndex >= 0
            ? entry.seriesIndex
            : (Number.isInteger(index) ? index : -1);
          const initialShape=Number.isInteger(seriesIndex) && seriesIndex >= 0
            ? getLineGroupShape(seriesIndex)
            : null;
          const applyLegendColor=value=>{
            const nextValue=value!=null?String(value):'';
            const previousValue=lineLabelColors[legendKey] || '';
            if(nextValue){
              if(previousValue===nextValue){
                return true;
              }
              lineLabelColors[legendKey]=nextValue;
            }else if(previousValue){
              delete lineLabelColors[legendKey];
            }else{
              return true;
            }
            scheduleLineDraw();
            return true;
          };
          const applyLegendShape=value=>{
            if(!Number.isInteger(seriesIndex) || seriesIndex < 0){
              return true;
            }
            const sanitized = sanitizeLineGroupShape(value, seriesIndex);
            const shapes = ensureLineGroupShapeCapacity(Math.max(series.length, seriesIndex + 1));
            if(shapes[seriesIndex] === sanitized){
              return true;
            }
            shapes[seriesIndex] = sanitized;
            lineGroupShapes = shapes;
            if(Array.isArray(series) && series[seriesIndex]){
              series[seriesIndex].shape = sanitized;
            }
            updateLineGroupShapeSelect(seriesIndex, sanitized);
            scheduleLineDraw();
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
      applyLineLegendGuardWidth(legendLayout.minSvgWidth);
      console.debug('Debug: line legend layout metrics',{ legendWidth: lineLegendWidth, legendGap: legendLayout.legendGapPx, entryCount: legendLayout.renderer.entries.length, minSvgWidth: legendLayout.minSvgWidth, guardWidth: lineLegendGuardWidth });
      const legendWidth=lineLegendWidth;
      let xMin=xMinRaw,xMax=xMaxRaw,yMin=yMinRaw,yMax=yMaxRaw;
      if(isFinite(xMinManual)) xMin=xMinManual;
      if(isFinite(xMaxManual)) xMax=xMaxManual;
      if(isFinite(yMinManual)) yMin=yMinManual;
      if(isFinite(yMaxManual)) yMax=yMaxManual;
        if(originMode==='custom'){
          if(isFinite(originXInput)){
            if(!(logX && originXInput<=0)){
              if(originXInput<xMin) xMin=originXInput;
              if(originXInput>xMax) xMax=originXInput;
          }
        }
        if(isFinite(originYInput)){
          if(!(logY && originYInput<=0)){
            if(originYInput<yMin) yMin=originYInput;
            if(originYInput>yMax) yMax=originYInput;
            }
          }
        }
        const rangeForClipping = { xMin, xMax, yMin, yMax };
        seriesWithData = clipSeriesToRange(seriesWithData, rangeForClipping);
        if(!seriesWithData.length){
          resetLineRenderState('no-valid-series-after-clipping');
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
      const axisVarianceInfo = lineViewState.axesVarianceScaled
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
      while(plotEl.firstChild) plotEl.removeChild(plotEl.firstChild);
      const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
      const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
      plotEl.style.position='relative';
      const svg=document.createElementNS(NS,'svg');
      svg.setAttribute('id','lineSvg');
      svg.setAttribute('width',String(W));
      svg.setAttribute('height',String(H));
      svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
      svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
      chartStyle.applySvgDefaults(svg);
      plotEl.appendChild(svg);
      svg.addEventListener('mouseleave', handleLinePlotMouseLeave);
      if(fontControls && typeof fontControls.enableForSvg === 'function'){
        fontControls.enableForSvg(svg,{ scopeId: 'line' });
        console.debug('Debug: line fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
      } else {
        console.debug('Debug: line fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
      }
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
      let xTickTarget=chartStyle.estimateTickCount(W,{axis:'x',fallback:6});
      let yTickTarget=chartStyle.estimateTickCount(H,{axis:'y',fallback:6});
      console.debug('Debug: line initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
      const lineNotationX = getLineAxisNotation('x');
      const lineNotationY = getLineAxisNotation('y');
      const formatTickX = v => chartStyle.formatAxisValue(v,{ notation: lineNotationX, maxDecimals: 2 });
      const formatTickY = v => chartStyle.formatAxisValue(v,{ notation: lineNotationY, maxDecimals: 2 });
      const tickFont=chartStyle.makeFont(fs);
      const axisLabelFont=chartStyle.makeFont(fs);
      const yTitleWidthBase=chartStyle.measureText(lineYLabelText,axisLabelFont);
      const tickLen=axisMetrics.tickLength;
      const tickGap=axisMetrics.tickLabelGap;
      let margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth:0,yTitleWidth:yTitleWidthBase,axisMetrics});
      margin.left=Math.max(margin.left,fs*0.5);
      let plotW=Math.max(20,W-margin.left-margin.right);
      let plotH=Math.max(20,H-margin.top-margin.bottom);
      let bottomLayout=chartStyle.computeBottomLayout({labels:[],fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
      margin.bottom=bottomLayout.bottom;
      plotW=Math.max(20,W-margin.left-margin.right);
      plotH=Math.max(20,H-margin.top-margin.bottom);
      let manualXMinValue = Number.isFinite(xMinManual) && (!logX || xMinManual > 0) ? (logX ? Math.log10(xMinManual) : xMinManual) : null;
      let manualXMaxValue = Number.isFinite(xMaxManual) && (!logX || xMaxManual > 0) ? (logX ? Math.log10(xMaxManual) : xMaxManual) : null;
      let manualYMinValue = Number.isFinite(yMinManual) && (!logY || yMinManual > 0) ? (logY ? Math.log10(yMinManual) : yMinManual) : null;
      let manualYMaxValue = Number.isFinite(yMaxManual) && (!logY || yMaxManual > 0) ? (logY ? Math.log10(yMaxManual) : yMaxManual) : null;
      const shouldEqualScale = !!lineViewState.equalScaleAxes;
      const shouldEqualAxes = !!lineViewState.equalAxes;
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
        const xLabelWidths=xTickLabels.map(lbl=>chartStyle.measureText(lbl,tickFont));
        maxXLabelWidth=Math.max(...xLabelWidths,0);
        margin=chartStyle.computeBaseMargins({fontSize:fs,legendWidth,maxYLabelWidth,yTitleWidth:yTitleWidthBase,axisMetrics});
        margin.left=Math.max(margin.left,maxYLabelWidth+tickLen+tickGap+fs*0.5);
        plotW=Math.max(20,W-margin.left-margin.right);
        plotH=Math.max(20,H-margin.top-margin.bottom);
        bottomLayout=chartStyle.computeBottomLayout({labels:xTickLabels,fontSize:fs,plotWidth:plotW,baseBottom:margin.bottom,axisMetrics});
        margin.bottom=bottomLayout.bottom;
        plotW=Math.max(20,W-margin.left-margin.right);
        plotH=Math.max(20,H-margin.top-margin.bottom);
        const refinedX=chartStyle.estimateTickCount(plotW,{axis:'x',fallback:xTickTarget});
        const refinedY=chartStyle.estimateTickCount(plotH,{axis:'y',fallback:yTickTarget});
        console.debug('Debug: line tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth});
        if(refinedX===xTickTarget && refinedY===yTickTarget){
          break;
        }
        xTickTarget=refinedX;
        yTickTarget=refinedY;
      }
      console.debug('Debug: line layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth});

      const enforcePlotAspect = (marginInput, totalWidth, totalHeight, aspectValue) => {
        const aspect = Number.isFinite(aspectValue) && aspectValue > 0 ? aspectValue : null;
        const baseMargin = { ...marginInput };
        const innerW = Math.max(20, totalWidth - baseMargin.left - baseMargin.right);
        const innerH = Math.max(20, totalHeight - baseMargin.top - baseMargin.bottom);
        if(!aspect){
          return { margin: baseMargin, plotW: innerW, plotH: innerH };
        }
        const squareSize = Math.min(innerW, innerH);
        let targetW = squareSize;
        let targetH = squareSize;
        if(aspect >= 1){
          targetW = squareSize;
          targetH = squareSize / aspect;
        }else{
          targetH = squareSize;
          targetW = squareSize * aspect;
        }
        if(!Number.isFinite(targetW) || targetW <= 0 || !Number.isFinite(targetH) || targetH <= 0){
          return { margin: baseMargin, plotW: innerW, plotH: innerH };
        }
        const adjusted = { ...baseMargin };
        if(innerW > targetW){
          adjusted.right += innerW - targetW;
        }
        if(innerH > targetH){
          adjusted.bottom += innerH - targetH;
        }
        return {
          margin: adjusted,
          plotW: Math.max(20, targetW),
          plotH: Math.max(20, targetH)
        };
      };
      const aspectData = (lineSvgBoxRef || refs.svgBox)?.dataset;
      const shouldLockAspect = aspectData?.resizerAspectLocked === 'true';
      lineDebug('Debug: line aspect ratio decision',{
        shouldEqualAxes,
        shouldEqualScale,
        varianceAxesEnabled: !!lineViewState.axesVarianceScaled,
        lockRatioEnabled: shouldLockAspect,
        storedRatio: aspectData?.resizerAspectRatio
      });
      let varianceAspectApplied = false;
      if(lineViewState.axesVarianceScaled){
        const weightX = axisVarianceInfo?.weights?.x;
        const weightY = axisVarianceInfo?.weights?.y;
        if(Number.isFinite(weightX) && weightX > 0 && Number.isFinite(weightY) && weightY > 0){
          const desiredAspect = weightX / weightY;
          const baseInnerW = Math.max(20, W - margin.left - margin.right);
          const baseInnerH = Math.max(20, H - margin.top - margin.bottom);
          const baseSquareSize = Math.min(baseInnerW, baseInnerH);
          const enforced = enforcePlotAspect(margin, W, H, desiredAspect);
          margin = enforced.margin;
          plotW = enforced.plotW;
          plotH = enforced.plotH;
          varianceAspectApplied = true;
          lineDebug('Debug: line layout (variance-enforced)',{
            desiredAspect,
            appliedAspect: plotH > 0 ? plotW / plotH : null,
            squareSize: baseSquareSize,
            margin,
            plotW,
            plotH,
            weights: axisVarianceInfo.weights
          });
        }else{
          lineDebug('Debug: line variance aspect skipped',{ reason: 'insufficient-weights', weights: axisVarianceInfo?.weights });
        }
      }
      if(!varianceAspectApplied){
        if(shouldEqualAxes || shouldEqualScale){
          const square=chartStyle.ensureSquarePlot(W,H,margin);
          margin=square.margin;
          plotW=square.plotW;
          plotH=square.plotH;
          lineDebug('Debug: line layout (equal-length)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate});
        }else{
          lineDebug('Debug: line layout (unlocked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate});
        }
      }
      
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
        xScale.ticks.forEach(t=>{
          if(!isXValueVisible(t)){ return; }
          const x=x2px(t);
          const gridLine = add('line',Object.assign({x1:x,y1:margin.top,x2:x,y2:margin.top+plotH},gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control','1');
        });
        yScale.ticks.forEach(t=>{
          if(!isYValueVisible(t)){ return; }
          const y=y2px(t);
          const gridLine = add('line',Object.assign({x1:margin.left,y1:y,x2:margin.left+plotW,y2:y},gridStrokeAttrs));
          gridLine.setAttribute('data-grid-control','1');
        });
        console.debug('Debug: line grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,gridStrokeStyle});
      }
      let originXT,originYT;
      if(originMode==='custom'){
        originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);
        originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);
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
      const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
      const minorSubdivisionsX = getLineAxisMinorTickSubdivisions('x');
      const minorSubdivisionsY = getLineAxisMinorTickSubdivisions('y');
      const minorTicksX = getLineAxisMinorTicksEnabled('x')
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
      const minorTicksY = getLineAxisMinorTicksEnabled('y')
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
      const axisControlConfig = axis => ({
        axis,
        scopeId: 'line',
        additionalTickDefaults: DEFAULT_AXIS_ADDITIONAL_TICK,
        getAxisBounds: () => axis === 'x'
          ? { min: xScale.min, max: xScale.max }
          : { min: yScale.min, max: yScale.max },
        getTickInterval: () => getLineAxisTickInterval(axis),
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
        onBrokenAxisEnabledChange: (enabled) => updateBrokenAxisEnabled(axis, enabled),
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
          const newSegment = { ...BROKEN_AXIS_DEFAULT_SEGMENT };
          segments.push(newSegment);
          updateBrokenAxisSegments(axis, segments);
        },
        onBrokenAxisRemoveSegment: (axisName, index) => {
          const segments = getBrokenAxisSegments(axis);
          if(index >= 0 && index < segments.length){
            segments.splice(index, 1);
            updateBrokenAxisSegments(axis, segments);
          }
        }
      });
      
      // Draw X-axis with broken axis support
      if(brokenXScale && brokenXScale.isBroken){
        // Draw each segment separately
        let combinedLeft = Infinity;
        let combinedRight = -Infinity;
        
        brokenXScale.segments.forEach(seg => {
          const segLeft = x2px(seg.start);
          const segRight = x2px(seg.end);
          add('line',{
            x1: segLeft,
            y1: xAxisY,
            x2: segRight,
            y2: xAxisY,
            stroke: axisStroke,
            'stroke-linecap': 'square',
            'stroke-width': axisStrokeWidth
          });
          combinedLeft = Math.min(combinedLeft, segLeft);
          combinedRight = Math.max(combinedRight, segRight);
        });
        
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
        
        brokenYScale.segments.forEach(seg => {
          const segTop = y2px(seg.end);
          const segBottom = y2px(seg.start);
          add('line',{
            x1: yAxisX,
            y1: segTop,
            x2: yAxisX,
            y2: segBottom,
            stroke: axisStroke,
            'stroke-linecap': 'square',
            'stroke-width': axisStrokeWidth
          });
          combinedTop = Math.min(combinedTop, segTop);
          combinedBottom = Math.max(combinedBottom, segBottom);
        });
        
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
          add('line',{
            x1: x,
            y1: xAxisY,
            x2: x,
            y2: xAxisY + minorTickStyle.length,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      xScale.ticks.forEach((t,i)=>{
        if(!isXValueVisible(t)){
          return; // Skip ticks that fall in gaps
        }
        const x=x2px(t);
        add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:axisStroke,'stroke-width':axisStrokeWidth});
        const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
        const txt=add('text',{x,y:xAxisY+tickLen+tickGap+extra,'font-size':fs,'text-anchor':'middle',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTickX(logX?Math.pow(10,t):t);
        Shared.applyTextBaseline && Shared.applyTextBaseline(txt,'hanging',fs);
        markFontEditable(txt,'xTick');
        xTickFontCount+=1;
        xTickNodes.push(txt);
        xMajorTickLabels.push({ pixel: x, node: txt });
      });
      const additionalXTicks = getLineAxisAdditionalTicks('x');
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
              add('line',{
                x1: pixel,
                y1: xAxisY,
                x2: pixel,
                y2: xAxisY + tickLen,
                stroke: axisStroke,
                'stroke-width': axisStrokeWidth
              });
            },
            onLabel: ({ pixel, label, nearMajor }) => {
              if(nearMajor && replaceMajorTickLabel(xMajorTickLabels, pixel, label)){
                return;
              }
              const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
              const txt = add('text',{
                x: pixel,
                y: xAxisY + tickLen + tickGap + extra + Math.max(2, fs * 0.85),
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
      chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
      const yMajorTickLabels=[];
      let yTickFontCount=0;
      if(minorTicksY.length){
        minorTicksY.forEach(value => {
          if(!isYValueVisible(value)){ return; }
          const y = y2px(value);
          add('line',{
            x1: yAxisX - minorTickStyle.length,
            y1: y,
            x2: yAxisX,
            y2: y,
            stroke: axisStroke,
            'stroke-width': minorTickStyle.strokeWidth,
            'stroke-linecap': 'round',
            opacity: minorTickStyle.opacity
          });
        });
      }
      yScale.ticks.forEach((t,i)=>{
        if(!isYValueVisible(t)){
          return; // Skip ticks that fall in gaps
        }
        const y=y2px(t);
        add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:axisStroke,'stroke-width':axisStrokeWidth});
        const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});
        txt.textContent=formatTickY(logY?Math.pow(10,t):t);
        markFontEditable(txt,'yTick');
        yTickFontCount+=1;
        yMajorTickLabels.push({ pixel: y, node: txt });
      });
      const additionalYTicks = getLineAxisAdditionalTicks('y');
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
              add('line',{
                x1: yAxisX - tickLen,
                y1: pixel,
                x2: yAxisX,
                y2: pixel,
                stroke: axisStroke,
                'stroke-width': axisStrokeWidth
              });
            },
            onLabel: ({ pixel, label, nearMajor }) => {
              if(nearMajor && replaceMajorTickLabel(yMajorTickLabels, pixel, label)){
                return;
              }
              const txt = add('text',{
                x: yAxisX - (tickLen + tickGap),
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
      const seriesElems=[];
      seriesWithData.forEach((s,i)=>{
        const color=colors[i];
        const styleOverride = lineSeriesStyles[s.name] || {};
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
          || lineLabelColors[s.name]
          || fill
          || color;
        if(showIntervals && s.regression?.intervals?.samples?.length){
          const intervalLayer=document.createElementNS(NS,'g');
          intervalLayer.setAttribute('data-layer',`interval-${i}`);
          svg.appendChild(intervalLayer);
          const intervalSamples=s.regression.intervals.samples
            .slice()
            .filter(sample=>Number.isFinite(sample?.x) && sample.x>=xMin && sample.x<=xMax)
            .sort((a,b)=> (a?.x ?? 0) - (b?.x ?? 0));
          const buildIntervalPath=(lowerKey,upperKey)=>{
            const upper=[];
            const lower=[];
            intervalSamples.forEach(sample=>{
              const xRaw=sample?.x;
              const upperRaw=sample?.[upperKey];
              const lowerRaw=sample?.[lowerKey];
              if(!Number.isFinite(xRaw) || !Number.isFinite(upperRaw) || !Number.isFinite(lowerRaw)) return;
              if(xRaw<xMin || xRaw>xMax) return;
              if(logX && xRaw<=0) return;
              if(logY && (upperRaw<=0 || lowerRaw<=0)) return;
              const xVal=logX?Math.log10(xRaw):xRaw;
              const upperVal=logY?Math.log10(upperRaw):upperRaw;
              const lowerVal=logY?Math.log10(lowerRaw):lowerRaw;
              if(!Number.isFinite(xVal) || !Number.isFinite(upperVal) || !Number.isFinite(lowerVal)) return;
              upper.push({x:x2px(xVal),y:y2px(upperVal)});
              lower.push({x:x2px(xVal),y:y2px(lowerVal)});
            });
            if(upper.length<2 || lower.length<2) return null;
            const commands=[];
            upper.forEach((pt,idx)=>{commands.push(`${idx?'L':'M'}${pt.x},${pt.y}`);});
            lower.slice().reverse().forEach(pt=>{commands.push(`L${pt.x},${pt.y}`);});
            commands.push('Z');
            return commands.join(' ');
          };
          const confidencePath=buildIntervalPath('ciLow','ciHigh');
          const predictionPath=buildIntervalPath('piLow','piHigh');
          if(confidencePath){
            const confEl=document.createElementNS(NS,'path');
            confEl.setAttribute('d',confidencePath);
            confEl.setAttribute('fill',color);
            confEl.setAttribute('fill-opacity','0.16');
            confEl.setAttribute('stroke','none');
            confEl.dataset.band='confidence';
            intervalLayer.appendChild(confEl);
          }
          if(predictionPath){
            const predEl=document.createElementNS(NS,'path');
            predEl.setAttribute('d',predictionPath);
            predEl.setAttribute('fill',color);
            predEl.setAttribute('fill-opacity','0.08');
            predEl.setAttribute('stroke','none');
            predEl.dataset.band='prediction';
            intervalLayer.appendChild(predEl);
          }
          console.debug('Debug: line interval shading rendered',{ series: s.name, hasConfidence: !!confidencePath, hasPrediction: !!predictionPath });
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
        s.points.forEach(pt=>{
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
                const vertical=document.createElementNS(NS,'line');
                vertical.setAttribute('x1',px);
                vertical.setAttribute('y1',upperPx);
                vertical.setAttribute('x2',px);
                vertical.setAttribute('y2',lowerPx);
                errorGroup.appendChild(vertical);
                const topCap=document.createElementNS(NS,'line');
                topCap.setAttribute('x1',px-errorCapHalf);
                topCap.setAttribute('y1',upperPx);
                topCap.setAttribute('x2',px+errorCapHalf);
                topCap.setAttribute('y2',upperPx);
                errorGroup.appendChild(topCap);
                const bottomCap=document.createElementNS(NS,'line');
                bottomCap.setAttribute('x1',px-errorCapHalf);
                bottomCap.setAttribute('y1',lowerPx);
                bottomCap.setAttribute('x2',px+errorCapHalf);
                bottomCap.setAttribute('y2',lowerPx);
                errorGroup.appendChild(bottomCap);
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
        });
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
        path.style.cursor = 'pointer';
        path.addEventListener('click', handleLinePathClick);
        const mGroup=add('g',{});
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
        seriesElems.push({path,mGroup,errorGroup:attachedErrorGroup,forecastPath:forecastPathEl,areaPath:areaPathEl});
      });
      console.debug('Debug: line series rendered',{ showErrorBars, seriesCount: seriesWithData.length });
      const toggleSeriesVisibility=index=>{
        const target=seriesElems[index];
        if(!target){ return; }
        const currentlyVisible=target.path.style.display!=='none';
        const nextDisplay=currentlyVisible?'none':'inline';
        target.path.style.display=nextDisplay;
        target.mGroup.style.display=nextDisplay;
        if(target.errorGroup){
          target.errorGroup.style.display=nextDisplay;
        }
        if(target.forecastPath){
          target.forecastPath.style.display=nextDisplay;
        }
        if(target.areaPath){
          target.areaPath.style.display=nextDisplay;
        }
      };
      const legendRenderer=legendLayout.renderer;
      if(showLegend && legendRenderer.entries.length){
        const defaultLegendX=margin.left+plotW+legendLayout.legendGapPx;
        const defaultLegendY=margin.top+legendRenderer.baselineOffset;
        const legendPos=lineLabelPositions?.legend;
        
        // Convert relative positions to absolute if needed for legend
        let absoluteLegendX = defaultLegendX;
        let absoluteLegendY = defaultLegendY;
        if (legendPos) {
          if (legendPos.relX !== undefined && legendPos.relY !== undefined) {
            // Use relative positioning
            absoluteLegendX = margin.left + plotW + legendPos.relX * legendLayout.legendGapPx;
            absoluteLegendY = margin.top + legendPos.relY * plotH;
          } else if (legendPos.x !== undefined && legendPos.y !== undefined) {
            // Use absolute positioning (backward compatibility)
            absoluteLegendX = legendPos.x;
            absoluteLegendY = legendPos.y;
          }
        }
        
        const legendGroup=legendRenderer.draw(svg,{
          x: absoluteLegendX,
          y: absoluteLegendY
        });
        if(legendGroup){
          if(typeof Shared.enableLegendDrag === 'function'){
            Shared.enableLegendDrag(legendGroup, svg, {
              onDragEnd: pos => {
                // Store both absolute and relative positions for legend
                const relX = (pos.x - (margin.left + plotW)) / legendLayout.legendGapPx;
                const relY = (pos.y - margin.top) / plotH;
                lineLabelPositions.legend = { 
                  x: pos.x, 
                  y: pos.y,
                  relX: relX, 
                  relY: relY 
                };
                if(Shared.isDebugEnabled?.()){
                  console.debug('Debug: line legend position saved', { absolute: pos, relative: { relX, relY } });
                }
              }
            });
          }
          const textNodes=legendGroup.querySelectorAll('text');
          legendRenderer.entries.forEach((entry,index)=>{
            const textNode=textNodes[index];
            if(!textNode){ return; }
            markFontEditable(textNode,'legend',`legend-${index}`);
            textNode.style.cursor='pointer';
            textNode.addEventListener('click',()=>toggleSeriesVisibility(index));
          });
        }
      }
      const xAxisBase=margin.top+plotH;
      const defaultXLabelX = margin.left+plotW/2;
      const defaultXLabelY = xAxisBase+bottomLayout.titleOffset;
      const xLabelPos = lineLabelPositions?.xLabel;
      
      // Convert relative positions to absolute if needed for xLabel
      let absoluteXLabelX = defaultXLabelX;
      let absoluteXLabelY = defaultXLabelY;
      if (xLabelPos) {
        if (xLabelPos.relX !== undefined && xLabelPos.relY !== undefined) {
          // Use relative positioning
          absoluteXLabelX = margin.left + xLabelPos.relX * plotW;
          absoluteXLabelY = xAxisBase + xLabelPos.relY * (plotH + margin.top);
        } else if (xLabelPos.x !== undefined && xLabelPos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteXLabelX = xLabelPos.x;
          absoluteXLabelY = xLabelPos.y;
        }
      }
      
      const xText=add('text',{x: absoluteXLabelX, y: absoluteXLabelY,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
      xText.textContent=lineXLabelText;
      markFontEditable(xText,'xTitle','xTitle');
      const applyLineXLabel=value=>{
        const nextValue=value!=null?String(value):'';
        lineXLabelText=nextValue;
        if(xText.textContent!==nextValue){
          xText.textContent=nextValue;
        }
        scheduleLineDraw();
      };
      makeEditableHelper(xText,txt=>{
        console.log('LINE X-AXIS EDIT HANDLER CALLED!');
        
        const previous=lineXLabelText!=null?String(lineXLabelText):'';
        const nextValue=txt!=null?String(txt):'';
        
        console.log('LINE X-AXIS EDIT - Previous:', previous, 'Next:', nextValue);
        
        if(previous===nextValue){
          console.log('LINE X-AXIS EDIT - No change, returning');
          return;
        }
        
        // Create a combined apply function that updates both visual and table header
        const applyBoth = (value) => {
          console.log('LINE applyBoth called with value:', value);
          // Update visual title
          applyLineXLabel(value);
          
          // Also update the table header to maintain consistency
          const hot = lineHot;
          console.log('LINE applyBoth - HOT instance:', hot);
          
          if(hot && typeof hot.setDataAtCell === 'function'){
            try {
              const data = hot.getData() || [];
              console.log('LINE applyBoth - Table data:', data);
              
              if(Array.isArray(data) && data.length > 0) {
                const headerRow = Array.isArray(data[0]) ? data[0] : [];
                console.log('LINE applyBoth - Header row:', headerRow);
                
                if(headerRow.length > 0) {
                  // Find the X column index
                  let xIndex = headerRow.findIndex(h=>String(h).trim().toLowerCase()==='x');
                  if(xIndex < 0) xIndex = 0;
                  
                  console.log('LINE applyBoth - X column index:', xIndex, 'Current header:', headerRow[xIndex], 'New value:', value);
                  
                  if(headerRow[xIndex] !== value) {
                    // Try multiple approaches to ensure the update works
                    let updateSuccessful = false;
                    
                    // Approach 1: setDataAtCell (primary method)
                    try {
                      console.log('LINE applyBoth - Trying setDataAtCell with:', [0, xIndex, value]);
                      const result = hot.setDataAtCell([0, xIndex, value], 'line-x-axis-edit');
                      console.log('LINE applyBoth - setDataAtCell result:', result);
                      
                      // Verify the update
                      const verifyData1 = hot.getData() || [];
                      const verifyHeader1 = Array.isArray(verifyData1[0]) ? verifyData1[0] : [];
                      console.log('LINE applyBoth - Verification header:', verifyHeader1);
                      if(verifyHeader1[xIndex] === value) {
                        updateSuccessful = true;
                        console.log('LINE applyBoth - SUCCESS with setDataAtCell');
                      } else {
                        console.log('LINE applyBoth - setDataAtCell verification failed. Expected:', value, 'Got:', verifyHeader1[xIndex]);
                      }
                    } catch(err) {
                      console.log('LINE applyBoth - setDataAtCell failed:', err.message);
                    }
                    
                    // Approach 2: Direct data manipulation (fallback)
                    if(!updateSuccessful) {
                      try {
                        console.log('LINE applyBoth - Trying direct data manipulation');
                        const currentData = hot.getData() || [];
                        const newData = JSON.parse(JSON.stringify(currentData));
                        
                        if(Array.isArray(newData[0]) && newData[0].length > xIndex) {
                          newData[0][xIndex] = value;
                          console.log('LINE applyBoth - Updated newData header:', newData[0]);
                          
                          // Try different update methods
                          if(typeof hot.setData === 'function') {
                            console.log('LINE applyBoth - Using setData method');
                            hot.setData(newData);
                          } else if(typeof hot.updateSettings === 'function') {
                            console.log('LINE applyBoth - Using updateSettings method');
                            hot.updateSettings({ data: newData });
                          } else if(typeof hot.gridApi?.setRowData === 'function') {
                            console.log('LINE applyBoth - Using gridApi.setRowData method');
                            hot.gridApi.setRowData(newData);
                          } else {
                            console.warn('LINE applyBoth - No suitable update method found');
                          }
                          
                          // Verify the update
                          const verifyData2 = hot.getData() || [];
                          const verifyHeader2 = Array.isArray(verifyData2[0]) ? verifyData2[0] : [];
                          console.log('LINE applyBoth - Fallback verification header:', verifyHeader2);
                          if(verifyHeader2[xIndex] === value) {
                            updateSuccessful = true;
                            console.log('LINE applyBoth - SUCCESS with direct manipulation');
                          } else {
                            console.log('LINE applyBoth - Fallback verification failed. Expected:', value, 'Got:', verifyHeader2[xIndex]);
                          }
                        }
                      } catch(err) {
                        console.error('LINE applyBoth - Direct manipulation failed:', err);
                      }
                    }
                    
                    if(!updateSuccessful) {
                      console.error('LINE applyBoth - FAILED: All update methods failed');
                    } else {
                      console.log('LINE applyBoth - Header update successful');
                    }
                  }
                }
              }
            } catch(err) {
              console.error('LINE applyBoth - Failed to update line x-axis header:', err);
            }
          }
          
          // Force a redraw to ensure consistency
          console.log('LINE applyBoth - Scheduling redraw');
          scheduleLineDraw();
          return true;
        };
        
        console.log('LINE X-AXIS EDIT - Calling applyBoth with:', nextValue);
        applyBoth(nextValue);
        console.log('LINE X-AXIS EDIT - Recording change for undo');
        recordLineChange('line:x-label',previous,nextValue,applyBoth);
        console.log('LINE X-AXIS EDIT - Completed');
      });
      // Enable drag for x-axis label
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(xText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for xLabel
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - xAxisBase) / (plotH + margin.top);
            lineLabelPositions.xLabel = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            console.debug('Debug: line x-label position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      const yLabelOffsetSpan = (maxYLabelWidth + tickLen + tickGap + axisMetrics.axisTitleGap + fs * 0.5);
      const defaultYX = margin.left - yLabelOffsetSpan;
      const defaultYY = margin.top+plotH/2;
      const yLabelPos = lineLabelPositions?.yLabel;
      
      // Convert relative positions to absolute if needed for yLabel
      let absoluteYTextX = defaultYX;
      let absoluteYTextY = defaultYY;
      if (yLabelPos) {
        if (yLabelPos.relX !== undefined && yLabelPos.relY !== undefined) {
          // Use relative positioning
          absoluteYTextX = margin.left + yLabelPos.relX * yLabelOffsetSpan;
          absoluteYTextY = margin.top + yLabelPos.relY * plotH;
        } else if (yLabelPos.x !== undefined && yLabelPos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteYTextX = yLabelPos.x;
          absoluteYTextY = yLabelPos.y;
        }
      }
      
      const yText=add('text',{x:absoluteYTextX,y:absoluteYTextY,transform:`rotate(-90 ${absoluteYTextX} ${absoluteYTextY})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
      yText.textContent=lineYLabelText;
      markFontEditable(yText,'yTitle','yTitle');
      const applyLineYLabel=value=>{
        const nextValue=value!=null?String(value):'';
        lineYLabelText=nextValue;
        if(yText.textContent!==nextValue){
          yText.textContent=nextValue;
        }
        scheduleLineDraw();
      };
      makeEditableHelper(yText,txt=>{
        const previous=lineYLabelText!=null?String(lineYLabelText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyLineYLabel(nextValue);
        recordLineChange('line:y-label',previous,nextValue,applyLineYLabel);
      });
      // Enable drag for y-axis label
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(yText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions for yLabel
            const relX = (pos.x - margin.left) / yLabelOffsetSpan;
            const relY = (pos.y - margin.top) / plotH;
            lineLabelPositions.yLabel = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            console.debug('Debug: line y-label position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      const defaultTitleX = margin.left+plotW/2;
      const defaultTitleY = margin.top/2;
      const titlePos = lineLabelPositions?.title;
      
      // Convert relative positions to absolute if needed
      let absoluteTitleX = defaultTitleX;
      let absoluteTitleY = defaultTitleY;
      if (titlePos) {
        if (titlePos.relX !== undefined && titlePos.relY !== undefined) {
          // Use relative positioning
          absoluteTitleX = margin.left + titlePos.relX * plotW;
          absoluteTitleY = margin.top + titlePos.relY * plotH;
        } else if (titlePos.x !== undefined && titlePos.y !== undefined) {
          // Use absolute positioning (backward compatibility)
          absoluteTitleX = titlePos.x;
          absoluteTitleY = titlePos.y;
        }
      }
      
      const titleText=add('text',{x: absoluteTitleX, y: absoluteTitleY,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
      titleText.textContent=lineTitleText;
      markFontEditable(titleText,'graphTitle','graphTitle');
      const applyLineTitle=value=>{
        const nextValue=value!=null?String(value):'';
        lineTitleText=nextValue;
        if(titleText.textContent!==nextValue){
          titleText.textContent=nextValue;
        }
        scheduleLineDraw();
      };
      makeEditableHelper(titleText,txt=>{
        const previous=lineTitleText!=null?String(lineTitleText):'';
        const nextValue=txt!=null?String(txt):'';
        if(previous===nextValue){
          return;
        }
        applyLineTitle(nextValue);
        recordLineChange('line:title',previous,nextValue,applyLineTitle);
      });
      // Enable drag for title
      if(typeof Shared.enableLabelDrag === 'function'){
        Shared.enableLabelDrag(titleText, svg, {
          onDragEnd: pos => {
            // Store both absolute and relative positions
            const relX = (pos.x - margin.left) / plotW;
            const relY = (pos.y - margin.top) / plotH;
            lineLabelPositions.title = { 
              x: pos.x, 
              y: pos.y,
              relX: relX, 
              relY: relY 
            };
            console.debug('Debug: line title position saved', { absolute: pos, relative: { relX, relY } });
          }
        });
      }
      renderLineStatsAdvisor(seriesWithData, statsContext);
      primeLineStatsContext({
        series: seriesWithData,
        statsOptions: statsContext,
        controls: {
          method: refs.statType?.value || 'pearson',
          regressionMode: regressionModeCurrent
        }
      });
      captureLineRegressionSummaries(seriesWithData, { mode: regressionModeCurrent });
      registerLineGridControlTarget(svg, { fallbackThickness: axisStrokeWidthBase });
      ensureGraphViewport(svg, { padding: Math.max(fs, 16), debugLabel: 'line-graph' });
      lineLayout?.syncPanels?.({ skipSchedule: true });
      scheduleLineNoticeWidth('draw');
      console.debug('Debug: drawLine complete',{debugStamp}); // Debug: draw exit
    }catch(err){ console.error('drawLine error',err); }
  }

  function initNotes(){
    const stack = global.document.querySelector('#lineGraphPanel .line-plot-stack')
      || global.document.querySelector('#lineGraphPanel .diagram-area');
    if(!stack){
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: line notes mount skipped (missing stack)');
      }
      return;
    }
    const helper = Shared.notes;
    if(!helper || typeof helper.mountFoldable !== 'function'){
      console.warn('line notes helper unavailable', { hasSharedNotes: !!helper });
      return;
    }
    if(notesState.control?.root && notesState.control.root.isConnected){
      notesState.control.setValue(notesState.text || '');
      notesState.control.setOpen(!!notesState.open);
      return;
    }
    notesState.control = helper.mountFoldable({
      container: stack,
      id: 'line-notes',
      title: 'Notes',
      placeholder: 'Write notes about the data being analyzed...',
      richText: true,
      scopeId: 'line',
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

  function setup(){
    if(line.ready){ console.debug('Debug: Components.line.setup skipped'); return; }
    console.debug('Debug: Components.line.setup start'); // Debug: setup entry
    const document = global.document;
    if(!document || typeof Shared?.hot?.createStandardTable !== 'function'){
      console.error('Line component dependencies missing');
      return;
    }
    ensureLineAxisSettings();
    ensureLineGridStyle(getLineAxisStrokeWidth());
    const $ = global.$ || (sel=>document.querySelector(sel));
    refs.tablePanel=document.getElementById('lineTablePanel');
    refs.graphPanel=document.getElementById('lineGraphPanel');
    refs.panelResizer=document.getElementById('linePanelResizer');
    refs.svgBox=refs.graphPanel?.querySelector('.svgbox');
    lineSvgBoxRef = refs.svgBox;
    refs.configPanel=refs.graphPanel?.querySelector('.config-options');
    refs.renderRow=document.getElementById('lineRenderRow');
    refs.renderButton=document.getElementById('lineRenderButton');
    refs.autoDrawNotice=document.getElementById('lineAutoDrawNotice');
    refs.hotContainer=document.getElementById('lineHot');
    refs.hotWrapper=document.getElementById('lineHotWrapper');
    refs.plot=document.getElementById('linePlot');
    if(refs.plot && !refs.plot.__lineAxesLengthCloseHandler){
      const onPlotPointerDown = () => {
        closeLineAxesLengthMenu('plot-pointer');
      };
      refs.plot.addEventListener('pointerdown', onPlotPointerDown);
      refs.plot.__lineAxesLengthCloseHandler = onPlotPointerDown;
    }
    refs.tooltip=document.getElementById('tooltip');
    refs.statType=document.getElementById('lineStatType');
    refs.statsResults=document.getElementById('lineStatsResults');
    refs.statsButton=document.getElementById('lineComputeStats');
    refs.statsStatus=document.getElementById('lineStatsStatus');
    refs.regressionMode=document.getElementById('lineRegressionMode');
    refs.showIntervals=document.getElementById('lineShowIntervals');
    refs.showDiagnostics=document.getElementById('lineShowDiagnostics');
    refs.showLegend=document.getElementById('lineShowLegend');
    if(refs.showLegend){
      const legendHost=refs.showLegend.closest('label');
      if(legendHost){
        lineLegendControl=legendHost;
      }
    }
    renderLineStatsAdvisor([], { showIntervals: !!refs.showIntervals?.checked, showDiagnostics: !!refs.showDiagnostics?.checked });
    clearLineStatsOutputs(lineStatsEmptyPlaceholder);
    setLineStatsStatus('');
    updateLineStatsButtonState({ disabled: true, label: 'Calculate statistics' });
    if(refs.statsButton){
      refs.statsButton.addEventListener('click', handleLineStatsComputeClick);
    }
    refs.forecastFieldset=document.getElementById('lineForecastControls');
    refs.forecastHorizon=document.getElementById('lineForecastHorizon');
    refs.forecastSeasonLength=document.getElementById('lineForecastSeasonLength');
    refs.forecastAuto=document.getElementById('lineForecastAuto');
      refs.forecastCriterion=document.getElementById('lineForecastCriterion');
      refs.replicateMode=document.getElementById('lineTableFormat');
      refs.groupedToggle=document.getElementById('lineGroupedToggle');
      refs.replicatesContainer=document.getElementById('lineGroupedControls');
      refs.replicatesInput=document.getElementById('lineReplicates');
    refs.groupedList=document.getElementById('lineGroupedList');
    refs.groupedAdd=document.getElementById('lineGroupedAdd');
    refs.groupedRemove=document.getElementById('lineGroupedRemove');
    refs.threeDControls=document.getElementById('line3dControls');
    refs.threeDList=document.getElementById('line3dList');
    refs.threeDAdd=document.getElementById('line3dAdd');
    refs.threeDRemove=document.getElementById('line3dRemove');
    refs.viewMode=document.getElementById('lineViewMode');
    refs.fill=document.getElementById('lineFill');
    refs.border=document.getElementById('lineBorder');
    refs.borderWidth=document.getElementById('lineBorderWidth');
    refs.errorBarWidth=document.getElementById('lineErrorBarWidth');
    refs.dotSize=document.getElementById('lineDotSize');
    refs.displayMode=document.getElementById('lineDisplayMode');
    refs.alpha=document.getElementById('lineAlpha');
    refs.alphaVal=document.getElementById('lineAlphaVal');
    refs.fontSize=document.getElementById('lineFontSize');
    refs.fontSizeVal=document.getElementById('lineFontSizeVal');
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
          scheduleLineDraw();
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
        }
      });
    }
      if(refs.groupedAdd){
        refs.groupedAdd.addEventListener('click',()=>{
          console.debug('Debug: line grouped add button');
          addLineGroup();
        });
      }
      if(refs.groupedRemove){
        refs.groupedRemove.addEventListener('click',()=>{
          const listCount = getLineGroupedListCount();
          const length = listCount || (Array.isArray(lineSeriesGroupLabels) ? lineSeriesGroupLabels.length : 0);
          const targetIndex = length > 0 ? length - 1 : -1;
          console.debug('Debug: line grouped remove button',{ length, targetIndex });
          if(targetIndex >= 0){
            removeLineGroupAt(targetIndex);
          }
        });
      }
      if(refs.groupedToggle){
        refs.groupedToggle.addEventListener('click', ()=>{
          if(refs.replicateMode?.value !== 'grouped'){
            return;
          }
          lineGroupedControlsCollapsed = !lineGroupedControlsCollapsed;
          if(Shared.isDebugEnabled?.()){
            console.debug('Debug: line grouped controls toggled',{ collapsed: lineGroupedControlsCollapsed });
          }
          updateLineReplicateModeControls('grouped');
        });
      }
    if(refs.threeDAdd){
      refs.threeDAdd.addEventListener('click', () => {
        console.debug('Debug: line 3d add dataset button');
        addLine3dDataset();
      });
    }
    if(refs.threeDRemove){
      refs.threeDRemove.addEventListener('click', () => {
        const matrix = lineHot ? lineHot.getData() : [];
        const seriesCount = inferLine3dSeriesCount(matrix);
        const targetIndex = seriesCount > 0 ? seriesCount - 1 : -1;
        console.debug('Debug: line 3d remove dataset button', { seriesCount, targetIndex });
        if(targetIndex >= 0){
          removeLine3dDatasetAt(targetIndex);
        }
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
        if(lineViewState.viewMode === '3d'){
          exitLine3dMode({ skipDraw: true });
        }
        if(requested === 'single'){
          if(lineReplicates > LINE_MIN_REPLICATES){
            lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
            applyLineReplicateChange(LINE_MIN_REPLICATES);
          }else{
            updateLineReplicateModeControls(requested);
          }
        }else{
          const target = lineReplicates > LINE_MIN_REPLICATES ? lineReplicates : lineLastGroupedReplicateCount;
          const matrix = lineHot ? lineHot.getData() : [];
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
      });
    }
    if(refs.viewMode){
      refs.viewMode.value = lineViewState.viewMode;
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
        scheduleLineDraw();
      });
    }
    refs.showGrid=document.getElementById('lineShowGrid');
    refs.showFrame=document.getElementById('lineShowFrame');
    refs.logX=document.getElementById('lineLogX');
    refs.logY=document.getElementById('lineLogY');
    refs.xMin=document.getElementById('lineXMin');
    refs.xMax=document.getElementById('lineXMax');
    refs.yMin=document.getElementById('lineYMin');
    refs.yMax=document.getElementById('lineYMax');
    refs.originMode=document.getElementById('lineOriginMode');
    refs.originX=document.getElementById('lineOriginX');
    refs.originY=document.getElementById('lineOriginY');
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
    function applyLineLogValidationFailure(axis, validation, context){
      if(!validation || validation.allowed !== false){
        return;
      }
      const checkbox = axis === 'x' ? refs.logX : refs.logY;
      if(checkbox){
        checkbox.checked = false;
      }
      const warningMessage = validation.message || `Cannot enable log scale on the ${axis === 'x' ? 'X' : 'Y'} axis while non-positive values are present.`;
      showLineLogWarning(warningMessage);
      if(lineDebugEnabled()){
        console.debug('Debug: line log axis auto-disabled',{ axis, context, reason: validation.reason, value: validation.value });
      }
      scheduleLineDraw();
    }
    function revalidateActiveLineLogAxis(axis, context){
      const checkbox = axis === 'x' ? refs.logX : refs.logY;
      if(!checkbox?.checked){
        return true;
      }
      const validation = validateLineLogAxis(axis);
      if(!validation.allowed){
        applyLineLogValidationFailure(axis, validation, context);
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
    function validateLineLogAxis(axis){
      const axisLabel=axis==='x'?'X':'Y';
      const minInput=axis==='x'?refs.xMin:refs.yMin;
      const maxInput=axis==='x'?refs.xMax:refs.yMax;
      const originInput=axis==='x'?refs.originX:refs.originY;
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
      const originModeValue=refs.originMode?.value;
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
      const analysis=lineHot?.getAnalysisData?.()||Shared.hot.getAnalysisData(lineHot);
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
    refs.loadExample=document.getElementById('lineLoadExample');
    refs.importBtn=document.getElementById('lineImport');
    refs.fileInput=document.getElementById('lineFile');
    refs.openBtn=document.getElementById('openLineGraph');
    refs.saveBtn=document.getElementById('saveLineGraph');
    refs.saveAsBtn=document.getElementById('saveAsLine');
    refs.graphFileInput=document.getElementById('lineGraphFile');

    if(typeof global.lineStatType === 'undefined') global.lineStatType = refs.statType; // legacy compatibility (guarded)
    if(typeof global.lineStatsResults === 'undefined') global.lineStatsResults = refs.statsResults; // legacy compatibility (guarded)
    if(typeof global.lineRegressionMode === 'undefined') global.lineRegressionMode = refs.regressionMode; // legacy compatibility (guarded)

    if(refs.forecastHorizon){
      refs.forecastHorizon.addEventListener('change',()=>{
        resolveForecastOptions();
        scheduleLineDraw();
      });
    }
    if(refs.forecastSeasonLength){
      refs.forecastSeasonLength.addEventListener('change',()=>{
        resolveForecastOptions();
        scheduleLineDraw();
      });
    }
    if(refs.forecastAuto){
      refs.forecastAuto.addEventListener('change',()=>{
        resolveForecastOptions();
        scheduleLineDraw();
      });
    }
    if(refs.forecastCriterion){
      refs.forecastCriterion.addEventListener('change',()=>{
        resolveForecastOptions();
        scheduleLineDraw();
      });
    }

    resolveForecastOptions({ syncInputs: true });
    updateForecastVisibility();

    lineLayout = Shared.componentLayout?.createStandardPanels({
      componentName: 'line',
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
          onResize: () => {
            console.debug('Debug: line layout onResize schedule trigger');
            scheduleLineNoticeWidth('resize');
            scheduleLineDraw({ viewOnly: true, reason: 'resize' });
          }
        }
      });
    if(lineLayout?.elements?.svgBox){
      refs.svgBox = lineLayout.elements.svgBox;
    }
    lineSvgBoxRef = refs.svgBox;
    lineLayout?.setScheduleDraw?.(scheduleLineDraw);
    lineLayout?.syncPanels?.();
    scheduleLineNoticeWidth('init');
    ensureLineResizerControls();
    const scheduleLegendPlacement = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(()=>ensureLineResizerControls())
      : null;
    if(scheduleLegendPlacement){
      scheduleLegendPlacement();
    }else if(typeof global.requestAnimationFrame === 'function'){
      global.requestAnimationFrame(()=>ensureLineResizerControls());
    }
    if(lineLayout && typeof lineLayout.updateSvgBox === 'function'){
      const originalUpdateSvgBox = lineLayout.updateSvgBox.bind(lineLayout);
      lineLayout.updateSvgBox = node => {
        originalUpdateSvgBox(node);
        if(node){
          refs.svgBox = node;
        }else if(lineLayout.elements?.svgBox){
          refs.svgBox = lineLayout.elements.svgBox;
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
    const data = Shared.createEmptyData(DEFAULT_ROWS, LINE_DEFAULT_COLS);
    if(data.length){
      data[0] = ['X','Series1','Series2','Series3','Series4','Series5'];
    }
    let lineScheduleProxyCount = 0;
    const scheduleLineDrawProxy = () => {
      lineScheduleProxyCount += 1;
      if(lineScheduleProxyCount <= 5){
        console.debug('Debug: line scheduleLineDraw proxy invoked', { count: lineScheduleProxyCount }); // Debug: table change trigger
        if(lineScheduleProxyCount === 5){
          console.debug('Debug: line scheduleLineDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
        }
      }
      if(lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d'){
        scheduleLine3dDatasetSync('table-change');
      }
      scheduleLineDraw();
    };

    const createLineTable = (container) => {
      let instance = null;
      instance = Shared.hot.createStandardTable(container, { rows: DEFAULT_ROWS, cols: LINE_DEFAULT_COLS }, scheduleLineDrawProxy, {
        debugLabel: 'line',
        data,
        disablePaste: true,
        pinFirstColumn: true,
        pinFirstRow: true,
        rowSelection: null,
        hotOptions: {
          stretchH: 'all',
          afterChange(changes, source){
            if(changes && source !== 'loadData'){
              console.debug('Debug: line afterChange', { count: changes.length, source });
              revalidateActiveLineLogAxis('x','data-edit');
              revalidateActiveLineLogAxis('y','data-edit');
              syncLine3dAxisHeadersFromTable(changes, source);
            }
            if(changes){
              syncLineActiveDataViewFromHot(instance, 'afterChange');
            }
          },
          afterLoadData(){
            syncLineActiveDataViewFromHot(instance, 'afterLoadData');
          },
          afterSelectionEnd(){
            activateLineDataToolbar('table-selection');
          },
          afterCreateRow(){
            console.debug('Debug: line row created');
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterCreateCol(){
            console.debug('Debug: line col created');
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterRemoveRow(){
            console.debug('Debug: line row removed');
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterRemoveCol(){
            console.debug('Debug: line col removed');
            syncLineActiveDataViewFromHot(instance, 'afterChange');
          },
          afterUndo(){
            console.debug('Debug: line undo');
          },
          afterRedo(){
            console.debug('Debug: line redo');
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
        console.debug('Debug: lineHot afterRender hook registered for nested headers');
      }
      return instance;
    };
    const ensureLineHotForActiveTab = () => {
      const wrapper = refs.hotWrapper || document.getElementById('lineHotWrapper');
      const baseContainer = refs.hotContainer || document.getElementById('lineHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!lineHot){
          lineHot = createLineTable(baseContainer);
        }
        refs.hotContainer = baseContainer;
        if(lineHot){
          lineHot.__lineHostContainer = baseContainer;
          lineHot.__lineTabId = Shared.hot.resolveActiveTabId?.() || 'line-default';
          refs.hot = lineHot;
          ensureLineDataViewsForHot(lineHot, {
            wrapper,
            container: baseContainer
          });
          syncLineActiveDataViewFromHot(lineHot, 'ensure-active-tab');
        }
        return lineHot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'line',
        tabId: Shared.hot.resolveActiveTabId?.() || 'line-default',
        wrapper,
        container: baseContainer,
        createInstance: createLineTable
      });
      if(entry?.instance){
        lineHot = entry.instance;
        refs.hotContainer = entry.container || baseContainer;
      }
      if(lineHot){
        lineHot.__lineHostContainer = entry?.container || baseContainer;
        lineHot.__lineTabId = entry?.tabId || Shared.hot.resolveActiveTabId?.() || 'line-default';
        refs.hot = lineHot;
        ensureLineDataViewsForHot(lineHot, {
          wrapper,
          container: entry?.container || baseContainer
        });
        syncLineActiveDataViewFromHot(lineHot, 'ensure-active-tab');
      }
      const tableImport = Shared.tableImport;
      if(tableImport?.handlePaste && refs.hotContainer && !refs.hotContainer.__linePasteBound){
        refs.hotContainer.addEventListener('paste',async e=>{
          let forcedOverlay = false;
          try{
            forcedOverlay = !!forceLineOverlay('table-paste-start', { message: 'Processing pasted data...' });
            const result = await tableImport.handlePaste(e,lineHot,{
              minCols: LINE_DEFAULT_COLS,
              minRows: DEFAULT_ROWS,
              scheduleDraw: () => {
                markLineOverlayPending('table-paste');
                if(lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d'){
                  scheduleLine3dDatasetSync('paste');
                }
                scheduleLineDraw();
              },
              debugLabel: 'line',
              onProcessed: info => {
                console.debug('Debug: line paste processed', info || {}); // Debug: paste processed callback
              }
            });
            if(!result && forcedOverlay){
              resolveLineOverlay('table-paste-empty');
            }
            console.debug('Debug: line paste finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: paste finish trace
          }catch(err){
            if(forcedOverlay){
              resolveLineOverlay('table-paste-error');
            }
            console.error('line paste failed',err);
          }
        });
        refs.hotContainer.__linePasteBound = true;
      }
      return lineHot;
    };
    lineHot = ensureLineHotForActiveTab();
    if(lineHot){
      refs.hot = lineHot;
    }
    line.__ensureHotForActiveTab = ensureLineHotForActiveTab;
    bindLineDataToolbar();
    if(typeof global.DEBUG_LINE === 'undefined') global.DEBUG_LINE = true;
    console.debug('Debug: lineHot initialized',{rows:DEFAULT_ROWS,cols:LINE_DEFAULT_COLS});

    lineLayout?.setScheduleDraw?.(scheduleLineDraw);
    lineLayout?.syncPanels?.();
    if(!lineAutoDrawManager && Shared.hot?.createAutoDrawManager){
      lineAutoDrawManager = Shared.hot.createAutoDrawManager({
        component: 'line',
        state: lineAutoDrawState,
        thresholds: {
          rows: LINE_AUTO_DRAW_ROW_THRESHOLD,
          cols: LINE_AUTO_DRAW_COL_THRESHOLD,
          cells: LINE_AUTO_DRAW_CELL_THRESHOLD
        },
        getHot: () => lineHot || (typeof ensureLineHotForActiveTab === 'function' ? ensureLineHotForActiveTab() : null),
        elements: {
          renderRow: () => refs.renderRow,
          renderButton: () => refs.renderButton,
          notice: () => refs.autoDrawNotice
        },
        debugLog: lineDebug
      });
    }
    applyLineReplicateChange(lineReplicates, { sourceReplicates: lineReplicates, skipDraw: true });

    const lineExamples={
      standard:{
        replicates:1,
        seriesCount:5,
        groupLabels:['North','South','East','West','Central'],
        groupShapes:LINE_GROUP_SHAPE_DEFAULTS.slice(0,5),
        data:[
          ['Month','North','South','East','West','Central'],
          [1,120,110,95,80,105],
          [2,130,115,92,85,112],
          [3,125,118,99,90,115],
          [4,150,112,105,95,120],
          [5,155,125,108,102,128],
          [6,160,130,112,108,132],
          [7,165,128,118,112,138],
          [8,170,135,120,118,142],
          [9,175,138,125,120,146],
          [10,180,142,130,125,150],
          [11,185,145,128,130,152],
          [12,190,150,135,132,158]
        ]
      },
      groupedDoseResponse:{
        replicates:3,
        seriesCount:2,
        groupLabels:['Control','Treated'],
        groupShapes:LINE_GROUP_SHAPE_DEFAULTS.slice(0,2),
        data:[
          ['Hours','Control Rep 1','Control Rep 2','Control Rep 3','Treated Rep 1','Treated Rep 2','Treated Rep 3'],
          [0,45,43,47,50,48,49],
          [24,58,60,57,68,70,69],
          [48,72,71,74,80,82,81],
          [72,88,86,87,95,97,96],
          [96,105,104,106,112,113,111]
        ]
      },
      threeD:{
        seriesCount:3,
        groupLabels:['Curve A','Curve B','Curve C'],
        groupShapes:LINE_GROUP_SHAPE_DEFAULTS.slice(0,3),
        data:[
          ['X','Y','Z','Y','Z','Y','Z'],
          [0,0,0,0,1,0,2],
          [1,0.84,0.54,0.91,1.54,0.14,2.54],
          [2,0.91,-0.42,-0.76,0.58,-0.28,1.58],
          [3,0.14,-0.99,-0.28,0.01,0.96,1.01],
          [4,-0.76,-0.65,0.99,0.35,-0.54,1.35],
          [5,-0.96,0.28,-0.54,1.28,-0.84,2.28],
          [6,-0.28,0.96,-0.54,1.96,0.91,2.96]
        ]
      }
    };

    refs.loadExample?.addEventListener('click',()=>{
      const is3dMode = lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d' || refs.viewMode?.value === '3d';
      if(is3dMode){
        const example = lineExamples.threeD;
        markLineOverlayPending('example-data');
        enterLine3dMode({ skipDraw: true });
        if(lineHot && Array.isArray(example?.data)){
          lineHot.loadData(example.data);
        }
        lineSeriesGroupLabels = example.groupLabels.slice();
        lineGroupShapes = example.groupShapes.slice().map((shape, idx)=>sanitizeLineGroupShape(shape, idx));
        updateLine3dNestedHeaders({ seriesCount: example.seriesCount, data: example.data });
        renderLine3dList();
        console.debug('Debug: line 3d example loaded',{ key: 'threeD', seriesCount: example.seriesCount });
        scheduleLineDraw();
        return;
      }
      const isGroupedMode = refs.replicateMode?.value === 'grouped';
      const key = isGroupedMode ? 'groupedDoseResponse' : 'standard';
      const example=lineExamples[key]||lineExamples.standard;
      markLineOverlayPending('example-data');
      applyLineReplicateChange(example.replicates,{
        dataOverride: example.data,
        sourceReplicates: example.replicates,
        skipDraw: true,
        minSeriesCount: example.seriesCount,
        groupLabels: example.groupLabels,
        groupShapes: example.groupShapes
      });
      if(lineHot && Array.isArray(example?.data)){
        lineHot.loadData(example.data);
        setTimeout(()=>{
          try{
            lineHot.loadData(example.data);
          }catch(err){
            console.error('line example reload failed', err);
          }
        }, 0);
      }
      console.debug('Debug: line example loaded',{ key, replicates: example.replicates, mode: isGroupedMode ? 'grouped' : 'single' });
      scheduleLineDraw();
    });
    refs.importBtn?.addEventListener('click',()=>{ if(refs.fileInput){ refs.fileInput.value=''; refs.fileInput.click(); } });
    refs.fileInput?.addEventListener('change',async e=>{
      const tableImport = Shared.tableImport;
      if(!tableImport || typeof tableImport.openFile !== 'function'){
        console.warn('line import skipped: Shared.tableImport.openFile unavailable');
        return;
      }
      const fileName = e.target.files?.[0]?.name || '';
      const hasFile = !!(e.target.files && e.target.files[0]);
      let forcedOverlay = false;
      if(hasFile){
        forcedOverlay = !!forceLineOverlay('file-import', { message: 'Importing table data...' });
        markLineOverlayPending('file-import');
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
            importFontStyles('line', { __graph__: graphStyle });
          }
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: line prism style applied', { title, xLabel, yLabel, fontFamily, fontSize: fontSizeValue, fontColor, axisColor });
          }
          scheduleLineDraw({ force: true, reason: 'import-prism-style', skipThresholdEvaluation: true });
        };
        const result = await tableImport.openFile(refs.fileInput,{
          hot: lineHot,
          minCols: LINE_DEFAULT_COLS,
          minRows: DEFAULT_ROWS,
          scheduleDraw: () => {
            markLineOverlayPending('file-import');
            scheduleLineDraw({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'line',
          onPrismStyle: applyLinePrismStyle,
          onProcessed: info => {
            console.debug('Debug: line tableImport processed', info || {}); // Debug: processed callback
          },
          onCompleted: () => {
            const renderReason = 'import-load';
            markLineOverlayPending(renderReason);
            forceLineOverlay(renderReason, { message: 'Rendering line graph...' });
          }
        });
        const prismMeta = result?.prismMeta;
        if(prismMeta?.kind === 'line'){
          const replicateCount = clampLineReplicateCount(prismMeta.replicatesCount || LINE_MIN_REPLICATES);
          const groupLabels = Array.isArray(prismMeta.groupLabels) ? prismMeta.groupLabels : null;
          if(lineViewState.viewMode === '3d' || refs.replicateMode?.value === '3d'){
            exitLine3dMode({ skipDraw: true });
          }
          lineReplicates = replicateCount;
          if(lineReplicates > LINE_MIN_REPLICATES){
            lineLastGroupedReplicateCount = Math.min(LINE_MAX_REPLICATES, Math.max(2, lineReplicates));
          }
          if(groupLabels && groupLabels.length){
            lineSeriesGroupLabels = groupLabels.slice();
            lineLegendLayoutInfo.entryCount = groupLabels.length;
          }
          if(refs.replicatesInput){
            refs.replicatesInput.value = String(lineReplicates);
          }
          updateLineReplicateModeControls();
          if(lineHot){
            updateLineNestedHeaders();
          }
        }
        if(!result && forcedOverlay){
          resolveLineOverlay('file-import-empty');
        }
        console.debug('Debug: line import finished',{rows: result?.rows || 0, cols: result?.cols || 0}); // Debug: import finish trace
      }catch(err){
        if(forcedOverlay){
          resolveLineOverlay('file-import-error');
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
        scheduleLineDraw({ force: true, reason: 'manual-render' });
      });
    }

    lineLayout?.setScheduleDraw?.(scheduleLineDraw);

    refs.fill?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.border?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.borderWidth?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.errorBarWidth?.addEventListener('input',()=>{
      console.debug('Debug: line errorBarWidth change',{ value: refs.errorBarWidth.value });
      scheduleLineDraw();
    });
    refs.dotSize?.addEventListener('input',()=>{ scheduleLineDraw(); });
    refs.alpha?.addEventListener('input',()=>{ if(refs.alphaVal) refs.alphaVal.textContent=refs.alpha.value; scheduleLineDraw(); });
    refs.fontSize?.addEventListener('input',()=>{
      if(refs.fontSize?.dataset){
        refs.fontSize.dataset.fontBasePt = String(refs.fontSize.value);
        console.debug('Debug: line font size input manual set',{ value: refs.fontSize.value }); // Debug: manual slider update
      }
      if(refs.fontSizeVal){
        chartStyle.renderFontSizeLabel({ element: refs.fontSizeVal, pt: Number(refs.fontSize.value), input: refs.fontSize, manual: true });
      }
      scheduleLineDraw();
    });
    refs.showGrid?.addEventListener('change',()=>{ console.debug('Debug: line showGrid change',{checked:refs.showGrid.checked}); scheduleLineDraw(); });
    refs.showFrame?.addEventListener('change',()=>{ console.debug('Debug: line showFrame change',{checked:refs.showFrame.checked}); scheduleLineDraw(); });
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
                scheduleLineDraw();
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
        scheduleLineDraw();
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
        console.log(logLabel, el.value);
        const logActive = axis === 'x' ? refs.logX?.checked : refs.logY?.checked;
        if(logActive && isLineLogAxisInputInProgress(el)){
          if(lineDebugEnabled()){
            console.debug('Debug: line log axis validation deferred',{ axis, context, value: el.value });
          }
          scheduleLineDraw();
          return;
        }
        if(!revalidateActiveLineLogAxis(axis,context)){
          return;
        }
        if(!refs.logX?.checked && !refs.logY?.checked){
          clearLineLogWarning();
        }
        scheduleLineDraw();
      });
      el.addEventListener('change',()=>{
        if(!revalidateActiveLineLogAxis(axis,`${context}-change`)){
          return;
        }
        if(!refs.logX?.checked && !refs.logY?.checked){
          clearLineLogWarning();
        }
        scheduleLineDraw();
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
        scheduleLineDraw();
      });
    }
    refs.statType?.addEventListener('change',()=>{
      requestLineStatsContextRefresh('stat-type-change');
      scheduleLineDraw();
    });
    refs.showIntervals?.addEventListener('change',e=>{
      console.debug('Debug: line showIntervals change',{checked:e.target.checked});
      requestLineStatsContextRefresh('intervals-toggle');
      scheduleLineDraw();
    });
    refs.showDiagnostics?.addEventListener('change',e=>{
      console.debug('Debug: line showDiagnostics change',{checked:e.target.checked});
      requestLineStatsContextRefresh('diagnostics-toggle');
      scheduleLineDraw();
    });
    refs.showLegend?.addEventListener('change',e=>{
      console.debug('Debug: line showLegend change',{checked:e.target.checked});
      ensureLineResizerControls();
      scheduleLineDraw();
    });

    if (Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function') {
      Shared.exporter.mountSvgControls({
        container: '#lineExportControls',
        getSvg: () => buildLineExportSvg(),
        fileName: 'line',
        contextLabel: 'line-export'
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
        lineFileName=f.name;
        lineFileHandle=null;
        loadLineGraphFile(f);
      }
    });

    const runLineDrawCycle = () => {
      let status = 'complete';
      try{
        drawLine();
      }catch(err){
        status = 'error';
        throw err;
      }finally{
        resolveLineOverlay(status);
      }
    };
    const scheduleLineBase = Shared.debounceFrame ? Shared.debounceFrame(runLineDrawCycle) : runLineDrawCycle;
    const scheduleLineInstrumented = (opts) => {
      const nextOpts = opts || {};
      const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
      if(nextOpts.force){
        markLineOverlayPending(overlayReason);
        forceLineOverlay(overlayReason, { message: 'Rendering line graph...' });
      }else{
        queueLineOverlay(overlayReason);
      }
      const runSchedule = () => scheduleLineBase(nextOpts);
      const shouldDelayForOverlay = lineOverlayController?.isActive?.() && !nextOpts.viewOnly;
      if(shouldDelayForOverlay){
        const scheduleAfterPaint = () => {
          lineDebug('Debug: line autoDraw deferred for overlay',{ reason: overlayReason });
          runSchedule();
        };
        if(typeof global.requestAnimationFrame === 'function'){
          global.requestAnimationFrame(scheduleAfterPaint);
        }else{
          (global.setTimeout || setTimeout)(scheduleAfterPaint, 0);
        }
        return;
      }
      runSchedule();
    };
    scheduleLineDrawRaw = scheduleLineInstrumented;
    if(lineAutoDrawManager){
      lineAutoDrawManager.setScheduleRaw(scheduleLineDrawRaw);
      lineAutoDrawManager.setElements({
        renderRow: refs.renderRow,
        renderButton: refs.renderButton,
        notice: refs.autoDrawNotice
      });
      scheduleLineDraw = (opts) => lineAutoDrawManager.schedule(opts);
      lineAutoDrawManager.updateUi();
      lineAutoDrawManager.evaluateThresholds();
      syncLineAutoDrawNoticeWidth('auto-draw-init');
    }else{
      scheduleLineDraw = scheduleLineDrawRaw;
    }
    lineLayout?.setScheduleDraw?.(scheduleLineDraw);
    console.debug('Debug: line scheduleLineDraw configured via Shared.debounceFrame', { guarded: !!lineAutoDrawManager }); // Debug: scheduler setup
    initNotes();
    ensureEmptyPayloadTemplate();
    line.ready = true;
    scheduleLineDraw();
    console.debug('Debug: Components.line.setup complete'); // Debug: setup complete
  }

  function ensureReady(){ if(!line.ready) setup(); }

  line.init = setup;
  line.ensure = ensureReady;
  line.prepareForTab = function prepareForTab(){
    if(!line.ready){
      line.init();
      return;
    }
    if(typeof line.__ensureHotForActiveTab === 'function'){
      const hot = line.__ensureHotForActiveTab();
      if(hot){
        ensureLineDataViewsForHot(hot, {
          wrapper: refs.hotWrapper || global.document?.getElementById?.('lineHotWrapper') || null,
          container: hot.__lineHostContainer || refs.hotContainer || global.document?.getElementById?.('lineHot') || null
        });
        syncLineActiveDataViewFromHot(hot, 'prepare-tab');
      }
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

  line.captureRenderCache = function captureRenderCache(){
    const plot = document.getElementById('linePlot');
    const stats = document.getElementById('lineStatsResults');
    const svg = plot ? plot.querySelector('#lineSvg') : null;
    const plotCache = detachChildren(plot);
    const statsCache = detachChildren(stats);
    const plotStyle = plot ? plot.getAttribute('style') : null;
    const svgState = svg ? {
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      viewBox: svg.getAttribute('viewBox'),
      dataViewMode: svg.dataset ? svg.dataset.viewMode : null
    } : null;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: line render cache captured', {
        plotNodes: plotCache?.count || 0,
        statsNodes: statsCache?.count || 0,
        hasSvg: !!svg,
        viewMode: svgState?.dataViewMode || null
      });
    }
    return { plot: plotCache, stats: statsCache, plotStyle, svgState };
  };

  line.restoreRenderCache = function restoreRenderCache(cache){
    if(!cache){ return false; }
    const plot = document.getElementById('linePlot');
    const stats = document.getElementById('lineStatsResults');
    const restoredPlot = restoreChildren(plot, cache.plot);
    const restoredStats = restoreChildren(stats, cache.stats);
    if(plot && typeof cache.plotStyle === 'string' && cache.plotStyle){
      plot.setAttribute('style', cache.plotStyle);
    }
    const svg = plot ? plot.querySelector('#lineSvg') : null;
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
    const restored = restoredPlot || restoredStats;
    if(restored){
      lineViewState.rotationPending = false;
      lineViewState.rotationPendingLogged = false;
      const svg = plot ? plot.querySelector('#lineSvg') : null;
      if(svg && svg.dataset && svg.dataset.viewMode === '3d'){
        delete svg.dataset.rotationControlsAttached;
        plot3d.attachRotationControls(svg, {
          state: lineViewState.rotation,
          onChange: () => scheduleLineRotationRedraw(),
          shouldIgnorePointer: (event) => {
            if(typeof plot3d.isInteractivePointerTarget === 'function'){
              return plot3d.isInteractivePointerTarget(event?.target);
            }
            return plot3d.isLegendPointerTarget(event?.target);
          },
          debugLabel: 'line-3d-restore'
        });
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          lineDebug('Debug: line 3d rotation handlers rebound');
        }
      }
    }
    const wants3d = lineViewState.viewMode === '3d'
      || refs.replicateMode?.value === '3d'
      || refs.viewMode?.value === '3d';
    const hasGraph = !!(plot && plot.querySelector('svg,canvas'));
    if(wants3d && !hasGraph){
      return false;
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: line render cache restored', {
        restored,
        plot: restoredPlot,
        stats: restoredStats,
        hasGraph,
        viewMode: cache.svgState?.dataViewMode || null
      });
    }
    return restored;
  };
  line.draw = function draw(){ ensureReady(); scheduleLineDraw && scheduleLineDraw(); };
  line.save = saveLineFile;
  line.saveAs = saveAsLineFile;
  line.open = openLineFile;
  line.loadFromFile = loadLineGraphFile;
  line.loadFromPayload = function loadLineGraphFromPayload(payload, options = {}){
    if(!applyLineGraphPayload(payload, { source: 'payload', ...options })){
      console.warn('line payload application failed', { source: 'payload' });
    }
  };
  line.getPayload = getLineGraphPayload;
  line.createEmptyPayload = function createEmptyLinePayload(){
    line.ensure();
    ensureEmptyPayloadTemplate();
    const payload = cloneSimple(emptyPayloadTemplate) || { type: 'line', config: {} };
    payload.type = 'line';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, LINE_DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(LINE_DEFAULT_COLS).fill(''));
    payload.data = emptyData;
    payload.exclusions = [];
    payload.series = Array.isArray(payload.series) ? [] : [];
    if(payload.config){
      payload.config.series = Array.isArray(payload.config.series) ? [] : [];
    }
    return payload;
  };
  line.buildExportSvg = buildLineExportSvg;
  line.getHot = () => lineHot;
  line.updateStats = updateLineStats;
  line.__getState = function(){
    console.debug('Debug: line.__getState invoked');
    const headerRow = Array.isArray(lineHot?.getData?.()) ? lineHot.getData()[0] : null;
    const inferredEntryCount = lineLegendLayoutInfo.entryCount || (Array.isArray(headerRow) ? Math.max(0, Math.floor(((headerRow.length || 1) - 1) / Math.max(lineReplicates || 1, 1))) : 0);
    return {
      hot: lineHot,
      layout: lineLayout,
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
      legendGuardWidth: lineLegendGuardWidth,
      minSvgWidth: lineMinSvgWidth,
      labelColors: { ...lineLabelColors },
      displayMode: lineDisplayMode,
      scheduleDraw: scheduleLineDraw
    };
  };

})(window);
