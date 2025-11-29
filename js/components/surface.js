(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const surface = Components.surface = Components.surface || {};
  const chartStyle = Shared.chartStyle = Shared.chartStyle || {};
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  const hotNS = Shared.hot = Shared.hot || {};
  const componentLayout = Shared.componentLayout = Shared.componentLayout || {};
  const fileIO = Shared.fileIO = Shared.fileIO || {};
  const tableImport = Shared.tableImport = Shared.tableImport || {};
  const exporter = Shared.exporter = Shared.exporter || {};
  const fontControls = Shared.fontControls = Shared.fontControls || {};
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

  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 80;
  const DEFAULT_COLS = 3;
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
    if(emptyPayloadTemplate || typeof getSurfacePayload !== 'function'){
      return;
    }
    const snapshot = getSurfacePayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }
  const DEFAULT_FILE_NAME = 'surface.graph';
  const DEFAULT_ROTATION = { x: -0.6, y: 0.9 };

  const COLOR_RAMPS = Object.freeze({
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

  const DEFAULT_AXIS_LABELS = Object.freeze({ x: 'X', y: 'Y', z: 'Z' });
  const SURFACE_AUTO_DRAW_ROW_THRESHOLD = 5000;
  const SURFACE_AUTO_DRAW_COL_THRESHOLD = 5000;
  const SURFACE_AUTO_DRAW_CELL_THRESHOLD = 50000;

  const state = {
    hot: null,
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
    axisSelects: { x: null, y: null, z: null },
    controls: {},
    axisMap: { x: 0, y: 1, z: 2 },
    settings: {
      colorRamp: 'viridis',
      interpolation: 'grid',
      fontSize: 13,
      axisStroke: 1.2,
      axisColor: '#3b3b3b',
      showGrid: true,
      showFrame: true,
      showPoints: false,
      showLegend: true
    },
    labels: { title: 'Surface Plot', x: DEFAULT_AXIS_LABELS.x, y: DEFAULT_AXIS_LABELS.y, z: DEFAULT_AXIS_LABELS.z },
    rotation: typeof plot3d.createRotationState === 'function'
      ? plot3d.createRotationState(DEFAULT_ROTATION)
      : { x: DEFAULT_ROTATION.x, y: DEFAULT_ROTATION.y },
    scheduleDraw: () => {},
    fileName: DEFAULT_FILE_NAME,
    fileHandle: null
  };
  let surfaceAutoDrawManager = null;
  let surfaceNoticeBoundWidth = null;
  const syncSurfaceAutoDrawNoticeWidth = (reason) => {
    const svgBox = state.svgBox || state.layout?.elements?.svgBox || global.document.querySelector('#surfaceGraphPanel .svgbox');
    const renderRow = state.renderRow || global.document.getElementById('surfaceRenderRow');
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
    if(typeof Shared.debounceFrame === 'function'){
      let lastReason = 'frame';
      const debounced = Shared.debounceFrame(() => syncSurfaceAutoDrawNoticeWidth(lastReason));
      return reason => {
        lastReason = reason || 'frame';
        debounced();
      };
    }
    return reason => syncSurfaceAutoDrawNoticeWidth(reason || 'immediate');
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
    surfaceUndoManager.recordStateChange({
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
    } else if(node.dataset){
      node.dataset.fontEditable = '1';
      node.dataset.fontScope = 'surface';
      if(role){ node.dataset.fontRole = role; }
      if(key || role){ node.dataset.fontKey = key || role; }
    }
    debugLog('Debug: surface markFontEditable', payload);
  };

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
    const ramp = COLOR_RAMPS[rampKey] || COLOR_RAMPS.viridis;
    const stops = Array.isArray(ramp.stops) && ramp.stops.length ? ramp.stops : COLOR_RAMPS.viridis.stops;
    const rgbStops = stops.map(hex => hexToRgb(hex));
    const span = max - min;
    return (value) => {
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

  function cacheDom(){
    const doc = global.document;
    if(!doc){ return; }
    state.svg = doc.getElementById('surfaceSvg') || state.svg;
    state.svgBox = state.layout?.elements?.svgBox || doc.querySelector('#surfaceGraphPanel .svgbox') || state.svgBox;
    state.statsEl = doc.getElementById('surfaceStatsSummary') || state.statsEl;
    state.messageEl = doc.getElementById('surfaceMessage') || state.messageEl;
    state.exportContainer = doc.getElementById('surfaceExportControls') || state.exportContainer;
    state.renderRow = doc.getElementById('surfaceRenderRow') || state.renderRow;
    state.renderButton = doc.getElementById('surfaceRenderButton') || state.renderButton;
    state.autoDrawNotice = doc.getElementById('surfaceAutoDrawNotice') || state.autoDrawNotice;
    state.axisSelects.x = doc.getElementById('surfaceXAxis') || state.axisSelects.x;
    state.axisSelects.y = doc.getElementById('surfaceYAxis') || state.axisSelects.y;
    state.axisSelects.z = doc.getElementById('surfaceZAxis') || state.axisSelects.z;
    state.controls.colorRamp = doc.getElementById('surfaceColorRamp') || state.controls.colorRamp;
    state.controls.interpolation = doc.getElementById('surfaceInterpolation') || state.controls.interpolation;
    state.controls.fontSize = doc.getElementById('surfaceFontSize') || state.controls.fontSize;
    state.controls.fontSizeVal = doc.getElementById('surfaceFontSizeVal') || state.controls.fontSizeVal;
    state.controls.axisStroke = doc.getElementById('surfaceAxisStroke') || state.controls.axisStroke;
    state.controls.axisStrokeVal = doc.getElementById('surfaceAxisStrokeVal') || state.controls.axisStrokeVal;
    state.controls.axisColor = doc.getElementById('surfaceAxisColor') || state.controls.axisColor;
    state.controls.showGrid = doc.getElementById('surfaceShowGrid') || state.controls.showGrid;
    state.controls.showFrame = doc.getElementById('surfaceShowFrame') || state.controls.showFrame;
    state.controls.showPoints = doc.getElementById('surfaceShowPoints') || state.controls.showPoints;
    state.controls.showLegend = doc.getElementById('surfaceShowLegend') || state.controls.showLegend;
    state.controls.loadExample = doc.getElementById('surfaceLoadExample') || state.controls.loadExample;
    state.controls.importBtn = doc.getElementById('surfaceImport') || state.controls.importBtn;
    state.controls.importFile = doc.getElementById('surfaceFile') || state.controls.importFile;
    state.controls.graphFileInput = doc.getElementById('surfaceGraphFile') || state.controls.graphFileInput;
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
    return {
      x: Math.min(Math.max(0, Number(state.axisMap.x) || 0), maxCol),
      y: Math.min(Math.max(0, Number(state.axisMap.y) || 1), maxCol),
      z: Math.min(Math.max(0, Number(state.axisMap.z) || 2), maxCol)
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
        updateAxisOptions();
        state.scheduleDraw();
      },
      afterLoadData: () => {
        updateAxisOptions();
        state.scheduleDraw();
      }
    };
    const createSurfaceTable = (container) => typeof hotNS.createStandardTable === 'function'
      ? hotNS.createStandardTable(container, { rows: DEFAULT_ROWS, cols: DEFAULT_COLS }, () => state.scheduleDraw(), overrides)
      : null;
    const ensureSurfaceHotForActiveTab = () => {
      const wrapper = global.document && global.document.getElementById('surfaceHotWrapper');
      const baseContainer = global.document && global.document.getElementById('surfaceHot');
      if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
        if(!state.hot){
          state.hot = createSurfaceTable(baseContainer);
        }
        return state.hot;
      }
      const entry = Shared.hot.ensureTableForTab({
        type: 'surface',
        tabId: Shared.hot.resolveActiveTabId?.() || 'surface-default',
        wrapper,
        container: baseContainer,
        createInstance: createSurfaceTable
      });
      if(entry?.instance){
        state.hot = entry.instance;
      }
      return state.hot;
    };
    state.hot = ensureSurfaceHotForActiveTab();
    state.ensureHotForActiveTab = ensureSurfaceHotForActiveTab;
    if(state.hot && typeof state.hot.addHook === 'function'){
      state.hot.addHook('afterCreateCol', updateAxisOptions);
      state.hot.addHook('afterRemoveCol', updateAxisOptions);
      state.hot.addHook('afterColumnMove', updateAxisOptions);
    }
    debugLog('Debug: surface Handsontable initialized', { hasHot: !!state.hot });
    return state.hot;
  }

  function parseSurfaceTable(){
    const hot = state.hot;
    if(!hot || typeof hot.getData !== 'function'){
      return { points: [], faces: [], ranges: null, stats: { skipped: 0 } };
    }
    const data = hot.getData();
    if(!Array.isArray(data) || !data.length){
      return { points: [], faces: [], ranges: null, stats: { skipped: 0 } };
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
      const x = Number(row[cols.x]);
      const y = Number(row[cols.y]);
      const z = Number(row[cols.z]);
      if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)){
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

  function updateStats(info){
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

  function renderLegend(svg, options){
    if(!svg || !options){ return; }
    const doc = svg.ownerDocument || global.document;
    const targetLayer = options.layer && options.layer.ownerDocument === doc && options.layer.nodeType === 1 ? options.layer : svg;
    let defs = svg.querySelector('defs');
    if(!defs){
      defs = doc.createElementNS(NS, 'defs');
      svg.insertBefore(defs, svg.firstChild || null);
    }
    const gradientId = 'surfaceGradientScale';
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
    while(gradient.firstChild){ gradient.removeChild(gradient.firstChild); }
    const ramp = COLOR_RAMPS[options.colorRamp] || COLOR_RAMPS.viridis;
    const stops = Array.isArray(ramp.stops) && ramp.stops.length ? ramp.stops : COLOR_RAMPS.viridis.stops;
    const stopCount = Math.max(1, stops.length - 1);
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
    } else if(legend.parentNode !== targetLayer){
      legend.parentNode.removeChild(legend);
    }
    targetLayer.appendChild(legend);
    while(legend.firstChild){ legend.removeChild(legend.firstChild); }
    const marginTop = Number.isFinite(options?.margin?.top) ? options.margin.top : 0;
    const marginBottom = Number.isFinite(options?.margin?.bottom) ? options.margin.bottom : 0;
    const rawHeight = Number.isFinite(options?.height)
      ? options.height - marginTop - marginBottom
      : NaN;
    const fallbackBarHeight = Math.max(120, options.fontSize * 6);
    let barHeight = fallbackBarHeight;
    if(Number.isFinite(rawHeight) && rawHeight > 0){
      barHeight = Math.min(fallbackBarHeight, rawHeight);
    }
    barHeight = Math.max(60, barHeight);
    const barWidth = Math.max(14, options.fontSize * 0.8);
    const legendX = options.width - options.margin.right + 12;
    const legendY = options.margin.top;
    legend.setAttribute('transform', `translate(${legendX},${legendY})`);
    const rect = doc.createElementNS(NS, 'rect');
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', barHeight);
    rect.setAttribute('fill', `url(#${gradientId})`);
    rect.setAttribute('stroke', '#cbd5e1');
    rect.setAttribute('stroke-width', Math.max(0.6, options.fontSize * 0.04));
    legend.appendChild(rect);
    const minText = doc.createElementNS(NS, 'text');
    const legendFontSize = Math.max(9, options.fontSize * 0.75);
    const labelOffset = Math.max(10, legendFontSize * 0.9);
    minText.setAttribute('x', barWidth / 2);
    minText.setAttribute('y', barHeight + labelOffset);
    minText.setAttribute('font-size', legendFontSize);
    minText.setAttribute('fill', chartStyle.TEXT_COLOR || '#1f2a3d');
    minText.setAttribute('text-anchor', 'middle');
    minText.textContent = formatNumber(options.min);
    legend.appendChild(minText);
    const maxText = doc.createElementNS(NS, 'text');
    maxText.setAttribute('x', barWidth / 2);
    maxText.setAttribute('y', -Math.max(6, legendFontSize * 0.4));
    maxText.setAttribute('font-size', legendFontSize);
    maxText.setAttribute('fill', chartStyle.TEXT_COLOR || '#1f2a3d');
    maxText.setAttribute('text-anchor', 'middle');
    maxText.setAttribute('dominant-baseline', 'baseline');
    maxText.textContent = formatNumber(options.max);
    legend.appendChild(maxText);
  }

  function removeLegend(svg){
    const legend = svg && svg.querySelector('g.surface-legend');
    if(legend && legend.parentNode){
      legend.parentNode.removeChild(legend);
    }
  }

  function applySettingsToControls(){
    if(state.controls.colorRamp){ state.controls.colorRamp.value = state.settings.colorRamp; }
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
    if(state.controls.showLegend){ state.controls.showLegend.checked = !!state.settings.showLegend; }
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
    const colorRampSelect = state.controls.colorRamp;
    if(colorRampSelect){
      colorRampSelect.addEventListener('change', () => {
        const value = colorRampSelect.value;
        state.settings.colorRamp = COLOR_RAMPS[value] ? value : 'viridis';
        debugLog('Debug: surface color ramp updated', { value: state.settings.colorRamp });
        state.scheduleDraw();
      });
    }
    const interpolationSelect = state.controls.interpolation;
    if(interpolationSelect){
      interpolationSelect.addEventListener('change', () => {
        const value = interpolationSelect.value;
        state.settings.interpolation = INTERPOLATION_OPTIONS[value] ? value : 'grid';
        debugLog('Debug: surface interpolation updated', { value: state.settings.interpolation });
        state.scheduleDraw();
      });
    }
    if(state.controls.fontSize){
      state.controls.fontSize.addEventListener('input', () => {
        state.settings.fontSize = Number(state.controls.fontSize.value) || 13;
        if(chartStyle.renderFontSizeLabel){
          chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, pt: state.settings.fontSize, input: state.controls.fontSize, manual: true });
        }
        state.scheduleDraw();
      });
    }
    if(state.controls.axisStroke){
      state.controls.axisStroke.addEventListener('input', () => {
        state.settings.axisStroke = Number(state.controls.axisStroke.value) || 1.2;
        if(state.controls.axisStrokeVal){ state.controls.axisStrokeVal.textContent = Number(state.settings.axisStroke).toFixed(2); }
        state.scheduleDraw();
      });
    }
    if(state.controls.axisColor){
      if(typeof Shared.attachColorPickerNear === 'function'){
        Shared.attachColorPickerNear(state.controls.axisColor);
      }
      state.controls.axisColor.addEventListener('input', () => {
        state.settings.axisColor = state.controls.axisColor.value || '#3b3b3b';
        state.scheduleDraw();
      });
    }
    ['showGrid', 'showFrame', 'showPoints', 'showLegend'].forEach(key => {
      const control = state.controls[key];
      if(!control){ return; }
      control.addEventListener('change', () => {
        state.settings[key] = !!control.checked;
        state.scheduleDraw();
      });
    });
    ['x', 'y', 'z'].forEach(axis => {
      const select = state.axisSelects[axis];
      if(!select){ return; }
      select.addEventListener('change', () => {
        state.axisMap[axis] = Number(select.value) || state.axisMap[axis];
        state.scheduleDraw();
      });
    });
    if(state.controls.loadExample){
      state.controls.loadExample.addEventListener('click', () => {
        const example = buildExampleDataset();
        if(state.hot && typeof state.hot.loadData === 'function'){
          state.hot.loadData(example);
          debugLog('Debug: surface example dataset loaded', { rows: example.length });
          updateAxisOptions();
          state.scheduleDraw();
        }
      });
    }
    if(state.controls.importBtn && state.controls.importFile){
      state.controls.importBtn.addEventListener('click', () => {
        state.controls.importFile.value = '';
        state.controls.importFile.click();
      });
      state.controls.importFile.addEventListener('change', () => {
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('surface import skipped: tableImport unavailable');
          return;
        }
        tableImport.openFile(state.controls.importFile, {
          hot: state.hot,
          minCols: 3,
          minRows: 5,
          scheduleDraw: state.scheduleDraw,
          debugLabel: 'surface',
          onProcessed: info => {
            debugLog('Debug: surface data imported', info);
            updateAxisOptions();
          }
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
    const saveBtn = global.document.getElementById('saveSurfaceGraph');
    if(saveBtn){
      saveBtn.addEventListener('click', () => surface.save());
    }
    const saveAsBtn = global.document.getElementById('saveAsSurface');
    if(saveAsBtn){
      saveAsBtn.addEventListener('click', () => surface.saveAs());
    }
    const openBtn = global.document.getElementById('openSurfaceGraph');
    if(openBtn){
      openBtn.addEventListener('click', () => surface.open());
    }
  }
  function draw(){
    drawSurface();
  }

  function drawSurface(){
    cacheDom();
    const svg = state.svg;
    const svgBox = state.svgBox;
    if(!svg || !svgBox){
      debugLog('Debug: surface draw skipped', { reason: 'missing-svg' });
      return;
    }
    const parsed = parseSurfaceTable();
    if(!parsed.points.length){
      while(svg.firstChild){ svg.removeChild(svg.firstChild); }
      displayMessage('Add at least three rows of numeric X, Y, Z values to render a surface.');
      updateStats(parsed.stats);
      removeLegend(svg);
      return;
    }
    updateAxisLabelsFromHeaders();
    displayMessage('');
    const boxRect = svgBox.getBoundingClientRect ? svgBox.getBoundingClientRect() : { width: svg.clientWidth || 640, height: svg.clientHeight || 420 };
    const width = Math.max(280, Math.floor(boxRect.width || svg.clientWidth || 640));
    const height = Math.max(240, Math.floor(boxRect.height || svg.clientHeight || 420));
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('font-family', chartStyle.FONT_FAMILY || 'Segoe UI, sans-serif');
    if(typeof chartStyle.applySvgDefaults === 'function'){
      chartStyle.applySvgDefaults(svg);
    }
    if(fontControls && typeof fontControls.enableForSvg === 'function'){
      fontControls.enableForSvg(svg, { scopeId: 'surface' });
    }
    while(svg.firstChild){ svg.removeChild(svg.firstChild); }
    const doc = svg.ownerDocument || global.document;
    const backgroundLayer = doc.createElementNS(NS, 'g');
    backgroundLayer.setAttribute('class', 'surface-layer surface-layer-background');
    svg.appendChild(backgroundLayer);
    const geometryLayer = doc.createElementNS(NS, 'g');
    geometryLayer.setAttribute('class', 'surface-layer surface-layer-geometry');
    svg.appendChild(geometryLayer);
    const axisLayer = doc.createElementNS(NS, 'g');
    axisLayer.setAttribute('class', 'surface-layer surface-layer-axes');
    svg.appendChild(axisLayer);
    const fontInfo = typeof chartStyle.resolveScaledFontSize === 'function'
      ? chartStyle.resolveScaledFontSize({ rawSize: state.settings.fontSize, width, height, svgBox: state.svgBox, input: state.controls.fontSize })
      : { scaledPx: state.settings.fontSize, scaleInfo: null };
    if(state.controls.fontSize && chartStyle.renderFontSizeLabel){
      chartStyle.renderFontSizeLabel({ element: state.controls.fontSizeVal, fontInfo, input: state.controls.fontSize });
    }
    const fs = fontInfo.scaledPx || state.settings.fontSize;
    const axisStrokeWidth = typeof chartStyle.scaleStrokeWidth === 'function'
      ? chartStyle.scaleStrokeWidth(state.settings.axisStroke, fontInfo.scaleInfo, { context: 'surface-axis', min: 0.4 })
      : state.settings.axisStroke;
    const margin = {
      top: Math.max(fs * 3.2, 42),
      right: Math.max(fs * 6.5, state.settings.showLegend ? 140 : 60),
      bottom: Math.max(fs * 3.4, 44),
      left: Math.max(fs * 3.6, 58)
    };
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
        margin
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
    if(svg && typeof plot3d.attachRotationControls === 'function'){
      plot3d.attachRotationControls(svg, {
        state: state.rotation,
        onChange: () => state.scheduleDraw(),
        debugLabel: 'surface-plot',
        shouldIgnorePointer: (event) => {
          if(typeof plot3d.isInteractivePointerTarget === 'function'){
            return plot3d.isInteractivePointerTarget(event?.target);
          }
          return typeof plot3d.isLegendPointerTarget === 'function' && plot3d.isLegendPointerTarget(event?.target);
        }
      });
    }
    const tickTargetX = typeof chartStyle.estimateTickCount === 'function' ? chartStyle.estimateTickCount(plotWidth, { axis: 'x', fallback: 6 }) : 6;
    const tickTargetY = typeof chartStyle.estimateTickCount === 'function' ? chartStyle.estimateTickCount(plotHeight, { axis: 'y', fallback: 6 }) : 6;
    const tickTargetZ = typeof chartStyle.estimateTickCount === 'function' ? chartStyle.estimateTickCount(Math.max(plotWidth, plotHeight), { axis: 'z', fallback: 6 }) : 6;
    const scaleX = niceScale(ranges.x.min, ranges.x.max, tickTargetX);
    const scaleY = niceScale(ranges.y.min, ranges.y.max, tickTargetY);
    const scaleZ = niceScale(ranges.z.min, ranges.z.max, tickTargetZ);
    const clampTicks = (ticks, range) => ticks.filter(value => value >= range.min - 1e-9 && value <= range.max + 1e-9);
    const axisTicks = {
      x: clampTicks(scaleX.ticks, ranges.x),
      y: clampTicks(scaleY.ticks, ranges.y),
      z: clampTicks(scaleZ.ticks, ranges.z)
    };
    if(typeof plot3d.renderAxesAndGrid === 'function'){
      plot3d.renderAxesAndGrid({
        svg: axisLayer,
        project: projectRotated,
        rotatePoint,
        axisRanges: ranges,
        axisTicks,
        axisLabels: { x: state.labels.x, y: state.labels.y, z: state.labels.z },
        fontSize: fs,
        axisStrokeWidth,
        chartStyle,
        showGrid: state.settings.showGrid,
        showFrame: state.settings.showFrame,
        showPanes: state.settings.showFrame,
        axisColor: state.settings.axisColor,
        debugLabel: 'surface-axes',
        paneTarget: backgroundLayer,
        gridTarget: backgroundLayer,
        axisTarget: axisLayer,
        labelTarget: axisLayer,
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
            state.scheduleDraw?.();
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
    if(parsed.faces.length && effectiveMode === 'grid'){
      const faceGroup = doc.createElementNS(NS, 'g');
      faceGroup.setAttribute('class', 'surface-faces');
      const projectedFaces = parsed.faces.map(face => {
        const rotated = face.vertices.map(rotatePoint);
        const projected = rotated.map(projectRotated);
        const depth = rotated.reduce((sum, value) => sum + value.z, 0) / rotated.length;
        return { projected, depth, value: face.value };
      }).sort((a, b) => a.depth - b.depth);
      projectedFaces.forEach(face => {
        const polygon = doc.createElementNS(NS, 'polygon');
        polygon.setAttribute('points', face.projected.map(pt => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' '));
        polygon.setAttribute('fill', colorFor(face.value));
        polygon.setAttribute('fill-opacity', 0.95);
        polygon.setAttribute('stroke', 'rgba(0,0,0,0.25)');
        polygon.setAttribute('stroke-width', Math.max(axisStrokeWidth * 0.6, 0.6));
        faceGroup.appendChild(polygon);
      });
      geometryLayer.appendChild(faceGroup);
    }
    if(state.settings.showPoints || effectiveMode !== 'grid'){
      const pointGroup = doc.createElementNS(NS, 'g');
      pointGroup.setAttribute('class', 'surface-points');
      const projectedPoints = parsed.points.map(point => {
        const rotated = rotatePoint(point);
        const projected = projectRotated(rotated);
        return { x: projected.x, y: projected.y, depth: rotated.z, value: point.z };
      }).sort((a, b) => a.depth - b.depth);
      const radius = Math.max(2.5, Math.min(6, Math.sqrt(Math.max(plotWidth * plotHeight / Math.max(projectedPoints.length * 45, 1), 4))));
      projectedPoints.forEach(entry => {
        const circle = doc.createElementNS(NS, 'circle');
        circle.setAttribute('cx', entry.x);
        circle.setAttribute('cy', entry.y);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', colorFor(entry.value));
        circle.setAttribute('stroke', 'rgba(0,0,0,0.25)');
        circle.setAttribute('stroke-width', Math.max(axisStrokeWidth * 0.4, 0.4));
        circle.setAttribute('opacity', effectiveMode === 'grid' ? 0.78 : 0.95);
        pointGroup.appendChild(circle);
      });
      geometryLayer.appendChild(pointGroup);
    }
    const title = doc.createElementNS(NS, 'text');
    title.setAttribute('x', margin.left + plotWidth / 2);
    const titleBaseY = Math.max(fs, margin.top * 0.55);
    title.setAttribute('y', titleBaseY);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', fs);
    title.setAttribute('fill', chartStyle.TEXT_COLOR || '#1f2a3d');
    title.textContent = state.labels.title;
    markFontEditable(title, 'graphTitle', 'graphTitle');
    const applySurfaceTitle = value => {
      const trimmed = value != null ? String(value).trim() : '';
      const resolved = trimmed || 'Surface Plot';
      state.labels.title = resolved;
      if(title.textContent !== resolved){
        title.textContent = resolved;
      }
      state.scheduleDraw?.();
      return resolved;
    };
    makeEditableHelper(title, text => {
      const previous = state.labels.title || 'Surface Plot';
      const nextValue = applySurfaceTitle(text);
      if(previous === nextValue){
        return;
      }
      recordSurfaceChange('surface:title', previous, nextValue, val => { applySurfaceTitle(val); return true; });
    }, { scopeId: 'surface', key: 'graphTitle' });
    title.setAttribute('data-graph-title', '1');
    svg.appendChild(title);
    if(axisLabelBounds.length && typeof title.getBBox === 'function'){
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
    if(state.settings.showLegend && Number.isFinite(parsed.stats.zMin) && Number.isFinite(parsed.stats.zMax) && parsed.stats.zMin !== parsed.stats.zMax){
      renderLegend(svg, { min: parsed.stats.zMin, max: parsed.stats.zMax, colorRamp: state.settings.colorRamp, width, margin, fontSize: fs, layer: axisLayer });
    } else {
      removeLegend(svg);
    }
    updateStats(parsed.stats);
    state.layout?.syncPanels?.({ skipSchedule: true });
    syncSurfaceAutoDrawNoticeWidth('draw');
    debugLog('Debug: surface draw complete', {
      mode: effectiveMode,
      points: parsed.points.length,
      faces: parsed.faces.length
    });
  }

  surface.draw = draw;

  surface.init = function init(){
    if(surface.ready){
      debugLog('Debug: surface.init skipped', { reason: 'ready' });
      return;
    }
    cacheDom();
    state.scheduleDraw = () => {};
    if(state.renderButton){
      state.renderButton.addEventListener('click', () => {
        debugLog('Debug: surface manual render button');
        state.scheduleDraw?.({ force: true, reason: 'manual-render' });
      });
    }
    state.layout = componentLayout && typeof componentLayout.createStandardPanels === 'function'
      ? componentLayout.createStandardPanels({
        componentName: 'surface',
        selectors: {
          tablePanel: '#surfaceTablePanel',
          graphPanel: '#surfaceGraphPanel',
        panelResizer: '#surfacePanelResizer',
        hotWrapper: '#surfaceHotWrapper',
        hotContainer: '#surfaceHot',
        svgBox: () => global.document.querySelector('#surfaceGraphPanel .svgbox'),
        resizeTarget: () => global.document.querySelector('#surfaceGraphPanel .svgbox')
      },
        scheduleDraw: state.scheduleDraw,
        onAfterSync: () => syncSurfaceAutoDrawNoticeWidth('panel-sync'),
        resizableBoxOptions: {
          onResize: () => {
            debugLog('Debug: surface layout onResize schedule trigger');
            scheduleSurfaceNoticeWidth('resize');
          }
        }
      })
      : null;
    if(state.layout && typeof state.layout.setScheduleDraw === 'function'){
      state.layout.setScheduleDraw(state.scheduleDraw);
    }
    if(state.layout && state.layout.elements && state.layout.elements.svgBox){
      state.svgBox = state.layout.elements.svgBox;
    }
    if(state.layout && typeof state.layout.syncPanels === 'function'){
      state.layout.syncPanels();
    }
    cacheDom();
    scheduleSurfaceNoticeWidth('init');
    initHot();
    initControls();
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
    scheduleDrawSurfaceRaw = typeof Shared.debounceFrame === 'function'
      ? Shared.debounceFrame(draw)
      : (() => setTimeout(draw, 16));
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
      state.layout.setScheduleDraw(state.scheduleDraw);
    }
    if(state.layout && typeof state.layout.syncPanels === 'function'){
      state.layout.syncPanels();
    }
    syncSurfaceAutoDrawNoticeWidth('panel-resync');
    updateAxisOptions();
    ensureEmptyPayloadTemplate();
    surface.ready = true;
    state.scheduleDraw();
  };

  surface.ensure = function ensure(){
    if(!surface.ready){ surface.init(); }
  };
  surface.prepareForTab = function prepareForTab(){
    if(!surface.ready){
      surface.init();
      return;
    }
    if(typeof state.ensureHotForActiveTab === 'function'){
      state.ensureHotForActiveTab();
    }
  };

  function applySurfacePayload(payload, meta){
    const source = meta?.source || 'unknown';
    if(!payload || payload.type !== 'surface'){
      debugLog('Debug: surface payload rejected', { source, hasType: !!payload?.type });
      return false;
    }
    const dataMatrix = Array.isArray(payload.data) ? payload.data : [];
    if(state.hot && typeof state.hot.loadData === 'function'){
      state.hot.loadData(dataMatrix);
      if(payload.exclusions && typeof state.hot.applyExclusions === 'function'){
        state.hot.applyExclusions(payload.exclusions);
      }
    }
    const config = payload.config || {};
    if(config.axisMap && typeof config.axisMap === 'object'){
      state.axisMap = Object.assign({}, state.axisMap, config.axisMap);
    }
    if(config.settings && typeof config.settings === 'object'){
      state.settings = Object.assign({}, state.settings, config.settings);
    }
    if(config.labels && typeof config.labels === 'object'){
      state.labels = Object.assign({}, state.labels, config.labels);
    }
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
    }
    if(config.fontStyles){
      importFontStyles('surface', config.fontStyles);
    }
    applySettingsToControls();
    updateAxisOptions();
    if(typeof state.scheduleDraw === 'function'){
      state.scheduleDraw();
    }
    debugLog('Debug: surface payload applied', { source, rows: dataMatrix.length });
    return true;
  }

  function getPayload(){
    if(!state.hot || typeof state.hot.getData !== 'function'){
      return { type: 'surface', data: [] };
    }
    const payload = {
      type: 'surface',
      data: state.hot.getData(),
      exclusions: state.hot.exportExclusions ? state.hot.exportExclusions() : (Shared.hot && typeof Shared.hot.exportExclusions === 'function' ? Shared.hot.exportExclusions(state.hot) : undefined),
      config: {
        axisMap: Object.assign({}, state.axisMap),
        settings: Object.assign({}, state.settings),
        labels: Object.assign({}, state.labels),
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
        fontStyles: exportFontStyles ? exportFontStyles('surface') : undefined
      }
    };
    debugLog('Debug: surface payload captured', { rows: payload.data.length });
    return payload;
  }

  surface.getPayload = getPayload;
  surface.createEmptyPayload = function createEmptySurfacePayload(){
    surface.ensure();
    ensureEmptyPayloadTemplate();
    const payload = cloneSimple(emptyPayloadTemplate) || { type: 'surface', config: {} };
    payload.type = 'surface';
    const createEmpty = Shared.createEmptyData;
    const emptyData = typeof createEmpty === 'function'
      ? createEmpty(DEFAULT_ROWS, DEFAULT_COLS)
      : Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
    payload.data = emptyData;
    payload.exclusions = [];
    return payload;
  };

  surface.save = async function save(){
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
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    debugLog('Debug: surface save result', result);
  };

  surface.saveAs = async function saveAs(){
    if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
      console.error('surface.saveAs missing Shared.fileIO.saveGraphFileAs');
      return;
    }
    const result = await fileIO.saveGraphFileAs({
      context: 'surface',
      getPayload,
      fileName: state.fileName,
      downloadFileName: state.fileName,
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; }
    });
    debugLog('Debug: surface saveAs result', result);
  };

  surface.open = async function open(){
    if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
      console.error('surface.open missing Shared.fileIO.openGraphFile');
      return;
    }
    const result = await fileIO.openGraphFile({
      context: 'surface',
      setFileHandle: handle => { state.fileHandle = handle; },
      setFileName: name => { state.fileName = name; },
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

  surface.loadFromPayload = function loadFromPayload(payload){
    if(!applySurfacePayload(payload, { source: 'payload' })){
      console.warn('surface payload application failed', { source: 'payload' });
    }
  };

  surface.__getState = () => state;

  if(typeof module !== 'undefined' && module.exports){
    module.exports = surface;
  }

})(window);
