(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const Components = global.Components = global.Components || {};
  const scatter = Components.scatter = Components.scatter || {};
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
  const formControls = Shared.formControls = Shared.formControls || {};
  const plot3d = Shared.plot3d = Shared.plot3d || {};
  if(typeof plot3d.createRotationState !== 'function' && typeof require === 'function'){
    try {
      require('../shared/plot3d.js');
    }catch(err){
      console.debug('Debug: scatter component plot3d helper require failed', { message: err?.message || String(err) });
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
    plot3d.createProjector = () => ({ project: () => ({ x: 0, y: 0, depth: 0 }), bounds: {}, scale: 1, offsets: { x: 0, y: 0 }, plotSize: { width: 1, height: 1 } });
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
  const NS = 'http://www.w3.org/2000/svg';
  const DEFAULT_ROWS = 100;
  const DEFAULT_COLS = 5;
  const SCATTER_POINT_LABEL_COL = 4;
  const SCATTER_POINT_LABEL_COL_ALT = 0;
  const SCATTER_POINT_LABEL_MARK = '✓';
  const SCATTER_POINT_LABEL_HEADER = 'Label point';

  const SCATTER_AUTO_DRAW_ROW_THRESHOLD = 8000;
  const SCATTER_AUTO_DRAW_COL_THRESHOLD = 200;
  const SCATTER_AUTO_DRAW_CELL_THRESHOLD = 160000;

  const SCATTER_DENSITY_MODE_DEFAULT = 'auto';
  const SCATTER_DENSITY_PALETTE_DEFAULT = 'viridis';
  const SCATTER_DENSITY_POINT_THRESHOLD = 1500;

  const SCATTER_DENSITY_RAMPS = Object.freeze({
    viridis: Object.freeze(['#440154','#482777','#3f4a8a','#31688e','#26838f','#1f9d8a','#6cce5a','#b6de2b','#fee825']),
    turbo: Object.freeze(['#30123b','#4145ab','#4675e7','#2fb5f4','#14cdd4','#34d35c','#8fd625','#f9e524','#fca108','#f1605d','#b91372']),
    inferno: Object.freeze(['#000004','#1b0c41','#4a0c6b','#781c6d','#a52c5f','#cf4446','#ef6a32','#fb9b06','#f7d13d','#fcffa4']),
    magma: Object.freeze(['#000004','#1c1044','#4f127b','#812581','#b5367a','#e65164','#fb8761','#febb78','#fcfdbf']),
    plasma: Object.freeze(['#0d0887','#5b02a3','#9a179b','#cb4679','#ed7953','#fb9f3a','#fdca26','#f0f921']),
    cividis: Object.freeze(['#00204c','#11306b','#364f8a','#566f9e','#7a90a5','#a6bda9','#d4e7b0','#f6fbd1']),
    sunset: Object.freeze(['#331832','#6a2042','#a72c50','#d44842','#f26e3d','#fca635','#fde164'])
  });

  const SCATTER_ADAPTIVE_SIZE_MIN = 1;
  const SCATTER_ADAPTIVE_SIZE_MAX = 3;
  const SCATTER_ADAPTIVE_SIZE_THRESHOLD_LOW = 50;
  const SCATTER_ADAPTIVE_SIZE_THRESHOLD_HIGH = 5000;

  const SCATTER_SHAPE_DEFAULTS = Object.freeze(['circle','triangle','square','diamond','cross','plus','star']);
  const SCATTER_SHAPE_VALUES = new Set(SCATTER_SHAPE_DEFAULTS);
  const SCATTER_SHAPE_OPTIONS = Object.freeze([
    { value: 'circle', label: 'Circle' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'square', label: 'Square' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'cross', label: 'Cross' },
    { value: 'plus', label: 'Plus' },
    { value: 'star', label: 'Star' }
  ]);

  const SCATTER_3D_DEFAULTS = Object.freeze({
    rotationX: -22.5,
    rotationY: 32,
    aspectRatio: 4 / 3
  });

  const SCATTER_ANNOTATION_COMFORTABLE_COUNT = 8;
  const SCATTER_ANNOTATION_MIN_SCALE = 0.35;

  const BROKEN_AXIS_GAP_SIZE_PX = 20;
  const BROKEN_AXIS_BREAK_WIDTH = 8;
  const BROKEN_AXIS_BREAK_HEIGHT = 6;
  const BROKEN_AXIS_DEFAULT_SEGMENT = { start: 0, end: 1 };

  const DEFAULT_SCATTER_COLORS = global.DEFAULT_SCATTER_COLORS || ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
  if(typeof global.DEFAULT_SCATTER_COLORS === 'undefined') global.DEFAULT_SCATTER_COLORS = DEFAULT_SCATTER_COLORS;

  const SIGNIFICANT_COLOR = (typeof global.SIGNIFICANT_COLOR !== 'undefined' && global.SIGNIFICANT_COLOR) 
    ? global.SIGNIFICANT_COLOR
    : (DEFAULT_SCATTER_COLORS[0] || '#e41a1c');
  if(typeof global.SIGNIFICANT_COLOR === 'undefined') global.SIGNIFICANT_COLOR = SIGNIFICANT_COLOR;

  const SIGNIFICANT_NEGATIVE_COLOR = (typeof global.SIGNIFICANT_NEGATIVE_COLOR !== 'undefined' && global.SIGNIFICANT_NEGATIVE_COLOR)
    ? global.SIGNIFICANT_NEGATIVE_COLOR
    : (DEFAULT_SCATTER_COLORS[1] || '#377eb8');
  if(typeof global.SIGNIFICANT_NEGATIVE_COLOR === 'undefined') global.SIGNIFICANT_NEGATIVE_COLOR = SIGNIFICANT_NEGATIVE_COLOR;

  const DEFAULT_NON_SIG_COLOR = (typeof global.DEFAULT_NON_SIG_COLOR !== 'undefined' && global.DEFAULT_NON_SIG_COLOR)
    ? global.DEFAULT_NON_SIG_COLOR
    : (DEFAULT_SCATTER_COLORS[DEFAULT_SCATTER_COLORS.length - 1] || '#999999');
  if(typeof global.DEFAULT_NON_SIG_COLOR === 'undefined') global.DEFAULT_NON_SIG_COLOR = DEFAULT_NON_SIG_COLOR;

  const GRAPH_TYPE_DEFAULTS = Object.freeze({
    scatter: Object.freeze({ title: 'Scatter plot' }),
    volcano: Object.freeze({ title: 'Volcano plot' }),
    ma: Object.freeze({ title: 'MA plot' })
  });

  const MAX_SIGNIFICANT_ANNOTATIONS = Number.isFinite(global.MAX_SIGNIFICANT_ANNOTATIONS)
    ? global.MAX_SIGNIFICANT_ANNOTATIONS
    : 25;
  if(typeof global.MAX_SIGNIFICANT_ANNOTATIONS === 'undefined') global.MAX_SIGNIFICANT_ANNOTATIONS = MAX_SIGNIFICANT_ANNOTATIONS;

  const scatterState = {
    viewMode: '2d',
    requestedViewMode: null,
    rotation: plot3d.createRotationState({
      x: SCATTER_3D_DEFAULTS.rotationX,
      y: SCATTER_3D_DEFAULTS.rotationY
    }),
    rotationPending: false,
    rotationPendingLogged: false,
    supports3d: false,
    supportsBubble: false,
    dotSizeOverrideEnabled: false,
    dotSizeOverrideRaw: null,
    logPlusOneX: false,
    logPlusOneY: false,
    statsContext: null,
    statsContextSignature: null,
    statsContextVersion: 0,
    statsLastRunVersion: 0,
    statsComputationPending: false
  };
  const scatterAutoDrawState = {
    autoDrawEnabled: true,
    autoDrawReason: null,
    autoDrawLockedByThreshold: false,
    drawPending: false,
    lastDataShape: { rows: 0, cols: 0 },
    lastAutoDrawEvaluation: null
  };
  let emptyPayloadTemplate = null;
  let scatterLabelColors = {};
  let scatterLabelShapes = {};
  let scatterLabelStyles = {};
  const scatterRowSelectionsByTab = new Map();
  let scatterSelectionSyncInProgress = false;
  let scatterThresholdSelectionPending = false;

  function clampScatterAlpha(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : null;
  }
  function clampScatterSize(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }
  function clampScatterBorderWidth(value){
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }
  function getScatterLabelStyle(label){
    if(!label){ return null; }
    const style = scatterLabelStyles[label];
    return style && typeof style === 'object' ? style : null;
  }

  function cloneSimple(value){
    if(!value) return null;
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(err){
      console.error('scatter cloneSimple error', err);
      return null;
    }
  }

  function ensureEmptyPayloadTemplate(){
    if(emptyPayloadTemplate || typeof getScatterGraphPayload !== 'function'){
      return;
    }
    const snapshot = getScatterGraphPayload();
    if(snapshot){
      emptyPayloadTemplate = cloneSimple(snapshot);
    }
  }
  if(typeof plot3d.normalizeRotation === 'function'){
    plot3d.normalizeRotation(scatterState.rotation);
  }

  const regressionTools = Shared.regressionTools = Shared.regressionTools || {};
  const regressionDebugNamespace = 'scatter-regression';
  const jStatLib = global.jStat;

  const ensureFiniteNumber = typeof regressionTools.ensureFiniteNumber === 'function'
    ? regressionTools.ensureFiniteNumber
    : (value => (Number.isFinite(value) ? value : NaN));

  const DEFAULT_AXIS_COLOR = '#000000';
  const MIN_MINOR_TICK_SUBDIVISIONS = 1;
  const MAX_MINOR_TICK_SUBDIVISIONS = 9;
  const DEFAULT_MINOR_TICK_SUBDIVISIONS = Number.isFinite(chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS)
    ? chartStyle.DEFAULT_MINOR_TICK_SUBDIVISIONS
    : 3;

  function clampMinorTickSubdivisions(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric)){
      return DEFAULT_MINOR_TICK_SUBDIVISIONS;
    }
    const rounded = Math.round(numeric);
    return Math.max(MIN_MINOR_TICK_SUBDIVISIONS, Math.min(MAX_MINOR_TICK_SUBDIVISIONS, rounded));
  }

  const scatterRefs = {};
  let scatterTooltipEl = null;
  let scatterPointContextMenu = null;
  let scatterPointContextMenuGlobalBound = false;
  const EMPTY_LEGEND_RENDERER = Object.freeze({
    entries: Object.freeze([]),
    width: 0,
    height: 0,
    draw(){ /* noop legend renderer when hidden */ }
  });

  function scatterDebug(label, payload){
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore toggle errors and log by default
    }
    console.debug(label, payload);
  }

  function normalizeScatterColorMode(value){
    const normalized = typeof value === 'string' ? value.toLowerCase() : '';
    if(normalized === 'density'){
      return 'density';
    }
    if(normalized === 'solid'){
      return 'solid';
    }
    return SCATTER_DENSITY_MODE_DEFAULT;
  }

  function normalizeScatterDensityPalette(value){
    const key = typeof value === 'string' ? value.toLowerCase() : '';
    return SCATTER_DENSITY_RAMPS[key] ? key : SCATTER_DENSITY_PALETTE_DEFAULT;
  }

  function scatterHexToRgb(hex){
    if(!hex){ return null; }
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if(!match){ return null; }
    const intValue = parseInt(match[1], 16);
    return {
      r: (intValue >> 16) & 255,
      g: (intValue >> 8) & 255,
      b: intValue & 255
    };
  }

  function scatterMixColors(a, b, t){
    const clamped = Math.min(Math.max(t, 0), 1);
    const safeA = a || { r: 0, g: 0, b: 0 };
    const safeB = b || safeA;
    return {
      r: Math.round(safeA.r + (safeB.r - safeA.r) * clamped),
      g: Math.round(safeA.g + (safeB.g - safeA.g) * clamped),
      b: Math.round(safeA.b + (safeB.b - safeA.b) * clamped)
    };
  }

  function scatterRgbToCss(rgb){
    if(!rgb){ return '#000000'; }
    const r = Math.min(255, Math.max(0, Math.round(rgb.r)));
    const g = Math.min(255, Math.max(0, Math.round(rgb.g)));
    const b = Math.min(255, Math.max(0, Math.round(rgb.b)));
    return `rgb(${r}, ${g}, ${b})`;
  }

  function createScatterDensityColorMapper(paletteKey){
    const rampKey = normalizeScatterDensityPalette(paletteKey);
    const stops = SCATTER_DENSITY_RAMPS[rampKey] || SCATTER_DENSITY_RAMPS[SCATTER_DENSITY_PALETTE_DEFAULT];
    const parsed = (Array.isArray(stops) ? stops : []).map((hex, idx) => ({
      t: stops.length > 1 ? idx / (stops.length - 1) : 0,
      color: scatterHexToRgb(hex)
    })).filter(entry => entry.color);
    if(!parsed.length){
      const fallback = scatterHexToRgb('#377eb8');
      return () => scatterRgbToCss(fallback);
    }
    return ratio => {
      const t = Math.min(Math.max(Number(ratio) || 0, 0), 1);
      if(parsed.length === 1){
        return scatterRgbToCss(parsed[0].color);
      }
      let start = parsed[0];
      let end = parsed[parsed.length - 1];
      for(let i = 0; i < parsed.length - 1; i += 1){
        const a = parsed[i];
        const b = parsed[i + 1];
        if(t >= a.t && t <= b.t){
          start = a;
          end = b;
          break;
        }
      }
      const span = end.t - start.t || 1;
      const localT = span ? (t - start.t) / span : 0;
      return scatterRgbToCss(scatterMixColors(start.color, end.color, localT));
    };
  }

  function computeScatterDensityValues(points, size){
    const width = Math.max(1, Number(size?.width) || 1);
    const height = Math.max(1, Number(size?.height) || 1);
    const data = Array.isArray(points) ? points : [];
    const count = data.length;
    if(!count){
      return { values: [], max: 0 };
    }
    const gridResolution = Math.max(10, Math.min(80, Math.round(Math.sqrt(count))));
    const gridX = gridResolution;
    const gridY = gridResolution;
    const cellW = width / gridX;
    const cellH = height / gridY;
    const grid = new Array(gridX * gridY).fill(0);
    const coords = [];
    for(let i = 0; i < count; i += 1){
      const pt = data[i];
      const x = Math.min(Math.max(Number(pt?.x) || 0, 0), width - 1e-6);
      const y = Math.min(Math.max(Number(pt?.y) || 0, 0), height - 1e-6);
      const gx = Math.min(gridX - 1, Math.max(0, Math.floor(x / cellW)));
      const gy = Math.min(gridY - 1, Math.max(0, Math.floor(y / cellH)));
      grid[gy * gridX + gx] += 1;
      coords.push({ gx, gy });
    }
    const neighborOffsets = [-1, 0, 1];
    const values = new Array(count);
    let maxDensity = 0;
    coords.forEach(({ gx, gy }, idx) => {
      let sum = 0;
      let n = 0;
      for(let dxIdx = 0; dxIdx < neighborOffsets.length; dxIdx += 1){
        const dx = neighborOffsets[dxIdx];
        for(let dyIdx = 0; dyIdx < neighborOffsets.length; dyIdx += 1){
          const dy = neighborOffsets[dyIdx];
          const nx = gx + dx;
          const ny = gy + dy;
          if(nx < 0 || nx >= gridX || ny < 0 || ny >= gridY){
            continue;
          }
          sum += grid[ny * gridX + nx] || 0;
          n += 1;
        }
      }
      const density = n ? sum / n : 0;
      values[idx] = density;
      if(density > maxDensity){
        maxDensity = density;
      }
    });
    return { values, max: maxDensity };
  }

  function resolveScatterColorMode(options){
    const desired = normalizeScatterColorMode(options?.mode);
    const graphType = options?.graphType || 'scatter';
    const viewMode = typeof options?.viewMode === 'string' ? options.viewMode.toLowerCase() : scatterState.viewMode || '2d';
    const pointCount = Number(options?.pointCount) || 0;
    const allowDensity = graphType === 'scatter' && viewMode !== '3d';
    const applied = allowDensity && (desired === 'density' || (desired === 'auto' && pointCount > SCATTER_DENSITY_POINT_THRESHOLD))
      ? 'density'
      : 'solid';
    return { desired, applied, allowDensity };
  }

  /**
   * Computes an adaptive point size based on the number of data points.
   * More points result in smaller point sizes for better visualization.
   * @param {number} pointCount - The number of data points to display
   * @returns {number} - Point size between SCATTER_ADAPTIVE_SIZE_MIN (1) and SCATTER_ADAPTIVE_SIZE_MAX (3)
   */
  function computeAdaptivePointSize(pointCount){
    const count = Number(pointCount) || 0;
    if(count <= SCATTER_ADAPTIVE_SIZE_THRESHOLD_LOW){
      return SCATTER_ADAPTIVE_SIZE_MAX;
    }
    if(count >= SCATTER_ADAPTIVE_SIZE_THRESHOLD_HIGH){
      return SCATTER_ADAPTIVE_SIZE_MIN;
    }
    // Linear interpolation between thresholds
    const range = SCATTER_ADAPTIVE_SIZE_THRESHOLD_HIGH - SCATTER_ADAPTIVE_SIZE_THRESHOLD_LOW;
    const ratio = (count - SCATTER_ADAPTIVE_SIZE_THRESHOLD_LOW) / range;
    const size = SCATTER_ADAPTIVE_SIZE_MAX - ratio * (SCATTER_ADAPTIVE_SIZE_MAX - SCATTER_ADAPTIVE_SIZE_MIN);
    return Math.max(SCATTER_ADAPTIVE_SIZE_MIN, Math.min(SCATTER_ADAPTIVE_SIZE_MAX, size));
  }

  function ensureScatterTooltipHost(tooltip, doc){
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
        scatterDebug('Debug: scatter tooltip host inspection error',{ error: err?.message || String(err) });
      }
    }
    const host = documentRef.body || documentRef.documentElement;
    if(needsDetach && host && parent !== host){
      host.appendChild(tooltip);
      scatterDebug('Debug: scatter tooltip host realigned',{ previousParent: parent.id || parent.className || parent.tagName || null });
    }
    return tooltip;
  }

  function getScatterTooltipElement(){
    if(scatterTooltipEl && scatterTooltipEl.isConnected){
      return scatterTooltipEl;
    }
    const doc = global.document;
    const tooltip = scatterRefs.tooltip || doc?.getElementById?.('tooltip') || null;
    if(tooltip){
      ensureScatterTooltipHost(tooltip, doc);
      scatterTooltipEl = tooltip;
      scatterRefs.tooltip = tooltip;
    }
    return scatterTooltipEl;
  }

  function formatScatterTooltipNumber(value){
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

  function updateScatterTooltipContent(tooltip, data){
    if(!tooltip || !data){ return false; }
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
    if(data.label){
      appendRow(data.label, true);
    }
    appendRow(`X: ${formatScatterTooltipNumber(data.x)}`);
    appendRow(`Y: ${formatScatterTooltipNumber(data.y)}`);
    if(data.z !== undefined){
      appendRow(`Z: ${formatScatterTooltipNumber(data.z)}`);
    }
    if(data.size !== undefined){
      appendRow(`Size: ${formatScatterTooltipNumber(data.size)}`);
    }
    if(data.logXValue !== undefined && data.logXValue !== data.x){
      appendRow(`Log X: ${formatScatterTooltipNumber(data.logXValue)}`);
    }
    if(data.logYValue !== undefined && data.logYValue !== data.y){
      appendRow(`Log Y: ${formatScatterTooltipNumber(data.logYValue)}`);
    }
    if(typeof data.series === 'string' && data.series){
      appendRow(`Series: ${data.series}`);
    }
    if(data.graphType && data.graphType !== 'scatter'){
      appendRow(`Graph: ${data.graphType.toUpperCase()}`);
      if(typeof data.isSignificant === 'boolean'){
        appendRow(`Significant: ${data.isSignificant ? 'Yes' : 'No'}`);
      }
    }
    if(!fragment.childNodes.length){
      return false;
    }
    tooltip.appendChild(fragment);
    return true;
  }

  function getScatterEventPagePosition(evt){
    const win = global.window;
    const scrollX = win?.scrollX ?? win?.pageXOffset ?? global.document?.documentElement?.scrollLeft ?? 0;
    const scrollY = win?.scrollY ?? win?.pageYOffset ?? global.document?.documentElement?.scrollTop ?? 0;
    const pageX = typeof evt?.pageX === 'number' ? evt.pageX : ((evt?.clientX || 0) + scrollX);
    const pageY = typeof evt?.pageY === 'number' ? evt.pageY : ((evt?.clientY || 0) + scrollY);
    return { x: pageX, y: pageY };
  }

  function positionScatterTooltipAt(tooltip, pageX, pageY){
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

  function hideScatterTooltip(reason){
    const tooltip = getScatterTooltipElement();
    if(!tooltip){ return; }
    const wasVisible = tooltip.style.display !== 'none';
    tooltip.style.display = 'none';
    tooltip.textContent = '';
    tooltip.style.width = 'auto';
    tooltip.style.height = 'auto';
    if(wasVisible){
      scatterDebug('Debug: scatter tooltip hide',{ reason });
    }
  }

  function clampScatterValue(value, min, max){
    if(!Number.isFinite(value)){
      return Number.isFinite(min) ? min : 0;
    }
    if(Number.isFinite(min) && value < min){
      return min;
    }
    if(Number.isFinite(max) && value > max){
      return max;
    }
    return value;
  }

  function computeScatterManualLabelLayout(entries, options){
    if(!Array.isArray(entries) || !entries.length){
      return [];
    }
    const plotLeft = Number(options?.plotLeft) || 0;
    const plotRight = Number(options?.plotRight) || 0;
    const plotTop = Number(options?.plotTop) || 0;
    const plotBottom = Number(options?.plotBottom) || 0;
    const labelFontSize = Math.max(6, Number(options?.labelFontSize) || 10);
    const leaderGap = Math.max(2, Number(options?.leaderGap) || 2);
    const angleSteps = Math.max(8, Math.min(36, Number(options?.angleSteps) || 16));
    const maxLeaderScale = Math.max(1, Math.min(5, Number(options?.maxLeaderScale) || 5));
    const pointBounds = Array.isArray(options?.pointBounds) ? options.pointBounds : [];
    const measureText = typeof options?.measureText === 'function' ? options.measureText : null;
    const font = options?.font || null;
    const labelHeight = Math.max(6, labelFontSize);
    const leaderScale = Math.max(0.45, Math.min(1, Number(options?.leaderScale) || 1));
    const minOffset = Math.max(labelFontSize * 0.85, 8);
    const angles = [];
    const tau = Math.PI * 2;
    for(let i = 0; i < angleSteps; i += 1){
      angles.push((i / angleSteps) * tau);
    }
    const estimateWidth = text => {
      const value = text ? String(text) : '';
      if(!value){
        return labelFontSize * 0.5;
      }
      if(measureText && font){
        const measured = measureText(value, font);
        if(Number.isFinite(measured)){
          return measured;
        }
      }
      return Math.max(labelFontSize * 0.6, value.length * labelFontSize * 0.6);
    };
    const overlapArea = (a, b) => {
      const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
      const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
      return overlapX * overlapY;
    };
    const placedBoxes = [];
    const placedLeaders = [];
    const placements = [];
    const distancePointToSegment = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax;
      const dy = by - ay;
      if(dx === 0 && dy === 0){
        const rx = px - ax;
        const ry = py - ay;
        return Math.hypot(rx, ry);
      }
      const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
      const clamped = Math.max(0, Math.min(1, t));
      const cx = ax + clamped * dx;
      const cy = ay + clamped * dy;
      return Math.hypot(px - cx, py - cy);
    };
    const segmentsIntersect = (ax, ay, bx, by, cx, cy, dx, dy) => {
      const eps = 1e-6;
      const orient = (px, py, qx, qy, rx, ry) => (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
      const onSegment = (px, py, qx, qy, rx, ry) =>
        Math.min(px, rx) - eps <= qx && qx <= Math.max(px, rx) + eps
        && Math.min(py, ry) - eps <= qy && qy <= Math.max(py, ry) + eps;
      const o1 = orient(ax, ay, bx, by, cx, cy);
      const o2 = orient(ax, ay, bx, by, dx, dy);
      const o3 = orient(cx, cy, dx, dy, ax, ay);
      const o4 = orient(cx, cy, dx, dy, bx, by);
      if(Math.abs(o1) < eps && onSegment(ax, ay, cx, cy, bx, by)) return true;
      if(Math.abs(o2) < eps && onSegment(ax, ay, dx, dy, bx, by)) return true;
      if(Math.abs(o3) < eps && onSegment(cx, cy, ax, ay, dx, dy)) return true;
      if(Math.abs(o4) < eps && onSegment(cx, cy, bx, by, dx, dy)) return true;
      return (o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0)
        && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0);
    };
    const scaleSteps = [];
    for(let scale = 1; scale <= maxLeaderScale; scale += 1){
      scaleSteps.push(scale);
    }
    entries.forEach(entry => {
      const cx = Number(entry?.cx) || 0;
      const cy = Number(entry?.cy) || 0;
      const textValue = entry?.text ? String(entry.text) : '';
      if(!textValue){
        return;
      }
      const baseOffset = Math.max(minOffset, (Number(entry?.radius) || 0) * 1.6) * 2 * leaderScale;
      const textWidth = estimateWidth(textValue);
      let best = null;
      angles.forEach(angle => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        scaleSteps.forEach(scale => {
          let textX = cx + cos * (baseOffset * scale);
          let textY = cy + sin * (baseOffset * scale);
          const anchor = cos >= 0 ? 'start' : 'end';
          let minX = anchor === 'start' ? textX : textX - textWidth;
          let maxX = anchor === 'start' ? textX + textWidth : textX;
          let minY = textY - labelHeight * 0.5;
          let maxY = textY + labelHeight * 0.5;
          let shiftX = 0;
          if(minX < plotLeft + 2){
            shiftX = (plotLeft + 2) - minX;
          }else if(maxX > plotRight - 2){
            shiftX = (plotRight - 2) - maxX;
          }
          let shiftY = 0;
          if(minY < plotTop + 2){
            shiftY = (plotTop + 2) - minY;
          }else if(maxY > plotBottom - 2){
            shiftY = (plotBottom - 2) - maxY;
          }
          if(shiftX || shiftY){
            textX += shiftX;
            textY += shiftY;
            minX += shiftX;
            maxX += shiftX;
            minY += shiftY;
            maxY += shiftY;
          }
          let score = 0;
          const labelArea = Math.max(1, textWidth * labelHeight);
          placedBoxes.forEach(box => {
            const area = overlapArea({ minX, maxX, minY, maxY }, box);
            if(area > 0){
              score += (area / labelArea) * 14;
            }
          });
          pointBounds.forEach(point => {
            const pr = Math.max(0, Number(point?.r) || 0);
            const px = Number(point?.cx) || 0;
            const py = Number(point?.cy) || 0;
            if(px >= minX - pr && px <= maxX + pr && py >= minY - pr && py <= maxY + pr){
              score += 3;
            }
            const leaderDist = distancePointToSegment(px, py, cx, cy, textX, textY);
            if(leaderDist < pr + 2){
              score += 1 + (pr + 2 - leaderDist) * 0.2;
            }
          });
          const lineX2 = textX + (anchor === 'start' ? -leaderGap : leaderGap);
          let leaderCross = false;
          placedLeaders.forEach(seg => {
            if(segmentsIntersect(seg.x1, seg.y1, seg.x2, seg.y2, cx, cy, lineX2, textY)){
              leaderCross = true;
            }
          });
          if(leaderCross){
            score += 3;
          }
          const overflow = Math.max(0, plotLeft - minX)
            + Math.max(0, maxX - plotRight)
            + Math.max(0, plotTop - minY)
            + Math.max(0, maxY - plotBottom);
          if(overflow > 0){
            score += overflow * 0.2 + 6;
          }
          if(shiftX || shiftY){
            score += 0.5;
          }
          score += (scale - 1) * 0.2;
          if(best === null || score < best.score){
            best = {
              textX,
              textY,
              anchor,
              lineX2,
              lineY2: textY,
              bbox: { minX, maxX, minY, maxY },
              score
            };
          }
        });
      });
      if(best){
        placements.push({ entry, placement: best });
        placedBoxes.push(best.bbox);
        placedLeaders.push({ x1: entry.cx, y1: entry.cy, x2: best.lineX2, y2: best.lineY2 });
      }
    });
    return placements;
  }

  function computeScatterManualLabelFontSize(baseFontSize, labelCount, plotWidth, plotHeight){
    const safeBase = Math.max(5, Number(baseFontSize) || 10);
    const count = Math.max(0, Number(labelCount) || 0);
    const width = Math.max(1, Number(plotWidth) || 0);
    const height = Math.max(1, Number(plotHeight) || 0);
    if(count <= 0){
      return safeBase;
    }
    const area = width * height;
    const density = count / Math.max(1, area);
    const axisReference = 520;
    const axisScale = Math.max(0.25, Math.min(2.2, width / axisReference));
    const targetCount = 12;
    const countRatio = (targetCount + 2) / (count + 2);
    const countScale = Math.max(0.25, Math.min(3, countRatio * countRatio));
    const targetDensity = 0.0008;
    const densityRatio = density / targetDensity;
    const densityScale = 1 / Math.sqrt(1 + densityRatio * densityRatio);
    const combinedScale = axisScale * countScale * densityScale;
    const scale = Math.max(0.12, Math.min(2.6, combinedScale));
    return Math.max(4, safeBase * scale);
  }

  function parseScatterPointLabelFlag(value){
    if(value === null || value === undefined){
      return false;
    }
    if(typeof value === 'boolean'){
      return value;
    }
    if(typeof value === 'number'){
      return Number.isFinite(value) && value !== 0;
    }
    const text = String(value).trim();
    if(!text){
      return false;
    }
    if(text === SCATTER_POINT_LABEL_MARK){
      return true;
    }
    const normalized = text.toLowerCase();
    return normalized === '1'
      || normalized === 'true'
      || normalized === 'yes'
      || normalized === 'y'
      || normalized === 'x';
  }

  function normalizeScatterHeader(value){
    return String(value ?? '').trim().toLowerCase();
  }

  function isScatterLabelHeader(value){
    const normalized = normalizeScatterHeader(value);
    return normalized === 'label' || normalized === 'gene' || normalized === 'name';
  }

  function isScatterLabelFlagHeader(value){
    const normalized = normalizeScatterHeader(value);
    return normalized === 'label point'
      || normalized === 'label points'
      || normalized === 'labelpoint';
  }

  function resolveScatterColumnLayout(data, colCountOverride){
    const headerRow = Array.isArray(data?.[0]) ? data[0] : [];
    const colCount = Number.isInteger(colCountOverride) ? colCountOverride : headerRow.length;
    const layout = {
      labelCol: 0,
      xCol: 1,
      yCol: 2,
      extraCol: 3,
      pointLabelCol: null
    };
    if(colCount <= 4){
      return layout;
    }
    const header0 = headerRow[0];
    const header1 = headerRow[1];
    const header4 = headerRow[4];
    const header0Empty = header0 == null
      || header0 === ''
      || header0 === false
      || header0 === 0
      || normalizeScatterHeader(header0) === '';
    const hasLeadingFlag = isScatterLabelFlagHeader(header0) || header0Empty;
    const hasLabelSecond = isScatterLabelHeader(header1);
    if(hasLeadingFlag && hasLabelSecond){
      layout.pointLabelCol = SCATTER_POINT_LABEL_COL_ALT;
      layout.labelCol = 1;
      layout.xCol = 2;
      layout.yCol = 3;
      layout.extraCol = 4;
      return layout;
    }
    if(isScatterLabelFlagHeader(header4)){
      layout.pointLabelCol = SCATTER_POINT_LABEL_COL;
      return layout;
    }
    layout.pointLabelCol = colCount > SCATTER_POINT_LABEL_COL ? SCATTER_POINT_LABEL_COL : null;
    return layout;
  }

  function getScatterSelectedRowSet(hotInstance){
    const api = hotInstance?.gridApi;
    if(!api || typeof api.getSelectedNodes !== 'function'){
      return null;
    }
    try{
      const nodes = api.getSelectedNodes() || [];
      if(!nodes.length){
        return null;
      }
      const set = new Set();
      nodes.forEach(node => {
        const rowIndex = Number.isInteger(node?.rowIndex) ? node.rowIndex : node?.data?.__rowIndex;
        if(Number.isInteger(rowIndex) && rowIndex >= 0){
          set.add(rowIndex);
        }
      });
      return set.size ? set : null;
    }catch(err){
      scatterDebug('Debug: scatter selected rows read failed', { message: err?.message || String(err) });
      return null;
    }
  }

  function resolveScatterTabId(hotInstance){
    return hotInstance?.__scatterTabId
      || Shared.hot?.resolveActiveTabId?.()
      || null;
  }

  function storeScatterRowSelection(hotInstance, reason){
    if(scatterSelectionSyncInProgress){
      return;
    }
    const tabId = resolveScatterTabId(hotInstance);
    if(!tabId){
      return;
    }
    const selected = getScatterSelectedRowSet(hotInstance);
    if(selected && selected.size){
      scatterRowSelectionsByTab.set(tabId, Array.from(selected).sort((a, b) => a - b));
    }else{
      scatterRowSelectionsByTab.delete(tabId);
    }
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: scatter selection stored', { tabId, count: selected?.size || 0, reason: reason || 'unknown' });
    }
  }

  function applyScatterRowSelection(hotInstance, tabIdOverride){
    const tabId = tabIdOverride || resolveScatterTabId(hotInstance);
    if(!tabId){
      return;
    }
    const api = hotInstance?.gridApi;
    if(!api || typeof api.deselectAll !== 'function'){
      return;
    }
    const rows = scatterRowSelectionsByTab.get(tabId) || [];
    api.deselectAll();
    if(!rows.length || typeof api.forEachNode !== 'function'){
      return;
    }
    const rowSet = new Set(rows);
    api.forEachNode(node => {
      const rowIndex = Number.isInteger(node?.rowIndex) ? node.rowIndex : node?.data?.__rowIndex;
      if(Number.isInteger(rowIndex) && rowSet.has(rowIndex) && typeof node.setSelected === 'function'){
        node.setSelected(true);
      }
    });
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: scatter selection restored', { tabId, count: rows.length });
    }
  }

  function scheduleScatterSelectionRestore(hotInstance, tabId){
    let attempts = 0;
    const tryRestore = () => {
      attempts += 1;
      const api = hotInstance?.gridApi;
      if(api && typeof api.deselectAll === 'function'){
        applyScatterRowSelection(hotInstance, tabId);
        return;
      }
      if(attempts < 10){
        setTimeout(tryRestore, 120);
      }
    };
    setTimeout(tryRestore, 0);
  }

  function syncScatterThresholdSelection(){
    // Significant label selection no longer controls table row selection.
  }

  function buildScatterAnnotationRequests(points, options){
    const enabled = !!options?.enabled;
    const fontSize = Math.max(6, Number(options?.fontSize) || 10);
    if(!enabled || !Array.isArray(points) || !points.length){
      return { requests: [], fontSize };
    }
    const axisMid = Number.isFinite(options?.axisMid) ? options.axisMid : 0;
    const limitSource = Number.isFinite(options?.maxAnnotations) ? options.maxAnnotations : MAX_SIGNIFICANT_ANNOTATIONS;
    const limit = Math.max(0, limitSource);
    const safeMakeFont = typeof chartStyle?.makeFont === 'function'
      ? chartStyle.makeFont
      : (() => null);
    const measureText = typeof chartStyle?.measureText === 'function'
      ? chartStyle.measureText
      : null;
    const font = safeMakeFont(fontSize);
    const requests = [];
    const widthEstimator = label => {
      const length = Math.max(1, (label || '').length);
      return fontSize * 0.65 * length;
    };
    for(let idx = 0; idx < points.length && requests.length < limit; idx += 1){
      const pt = points[idx];
      if(!pt || !pt.label || !pt.isSignificant){
        continue;
      }
      const side = Number.isFinite(pt.x) && pt.x >= axisMid ? 'right' : 'left';
      let textWidth = measureText ? measureText(pt.label, font) : NaN;
      if(!Number.isFinite(textWidth) || textWidth <= 0){
        textWidth = widthEstimator(pt.label);
      }
      textWidth = Math.max(textWidth, widthEstimator(pt.label));
      requests.push({ pointIndex: idx, label: pt.label, side, textWidth });
    }
    return { requests, fontSize };
  }

  function resolveScatterAnnotationCrowdingScale(count, options){
    if(!Number.isFinite(count) || count <= 0){
      return 1;
    }
    const comfortable = Math.max(1, Number(options?.comfortable) || SCATTER_ANNOTATION_COMFORTABLE_COUNT);
    const minScale = Math.min(1, Math.max(0.25, Number(options?.minScale) || SCATTER_ANNOTATION_MIN_SCALE));
    if(count <= comfortable){
      return 1;
    }
    const estimated = comfortable / count;
    return Math.max(minScale, Math.min(1, estimated));
  }

  function scatterPointInsideCircle(point, circle){
    if(!point || !circle){ return false; }
    const dx = point.x - circle.cx;
    const dy = point.y - circle.cy;
    return Math.hypot(dx, dy) <= (circle.r || 0) + 1e-6;
  }

  function scatterCircleFromTwoPoints(a, b){
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const r = Math.hypot(a.x - b.x, a.y - b.y) / 2;
    return { cx, cy, r };
  }

  function scatterCircleFromThreePoints(a, b, c){
    const A = b.x - a.x;
    const B = b.y - a.y;
    const C = c.x - a.x;
    const D = c.y - a.y;
    const E = A * (a.x + b.x) + B * (a.y + b.y);
    const F = C * (a.x + c.x) + D * (a.y + c.y);
    const G = 2 * (A * (c.y - b.y) - B * (c.x - b.x));
    if(Math.abs(G) < 1e-6){
      return null; // Points are collinear; no unique circle.
    }
    const cx = (D * E - B * F) / G;
    const cy = (A * F - C * E) / G;
    const r = Math.hypot(cx - a.x, cy - a.y);
    return { cx, cy, r };
  }

  function scatterSmallestCircleForCollinear(a, b, c){
    const candidates = [
      scatterCircleFromTwoPoints(a, b),
      scatterCircleFromTwoPoints(a, c),
      scatterCircleFromTwoPoints(b, c)
    ];
    let best = null;
    candidates.forEach(candidate => {
      if(!candidate){ return; }
      if(!scatterPointInsideCircle(a, candidate) || !scatterPointInsideCircle(b, candidate) || !scatterPointInsideCircle(c, candidate)){
        return;
      }
      if(!best || candidate.r < best.r){
        best = candidate;
      }
    });
    return best;
  }

  function computeScatterEnclosingCircle(points){
    const pts = Array.isArray(points) ? points : [];
    if(!pts.length){
      return { cx: 0, cy: 0, r: 0 };
    }
    let circle = null;
    for(let i = 0; i < pts.length; i += 1){
      const p = pts[i];
      if(circle && scatterPointInsideCircle(p, circle)){
        continue;
      }
      circle = { cx: p.x, cy: p.y, r: 0 };
      for(let j = 0; j < i; j += 1){
        const q = pts[j];
        if(scatterPointInsideCircle(q, circle)){
          continue;
        }
        circle = scatterCircleFromTwoPoints(p, q);
        for(let k = 0; k < j; k += 1){
          const rPt = pts[k];
          if(scatterPointInsideCircle(rPt, circle)){
            continue;
          }
          const throughThree = scatterCircleFromThreePoints(p, q, rPt)
            || scatterSmallestCircleForCollinear(p, q, rPt);
          if(throughThree){
            circle = throughThree;
          }
        }
      }
    }
    return circle || { cx: 0, cy: 0, r: 0 };
  }

  const SCATTER_LABEL_LINE_HEIGHT = 1.35;
  const SCATTER_LABEL_PADDING = 2;
  const SCATTER_LEADER_COLLISION_STEP = 8;
  const SCATTER_LEADER_MIN_LENGTH = 6;

  function computeAnnotationSegment(entry){
    return {
      x1: Number(entry.pointX) || 0,
      y1: Number(entry.pointY) || 0,
      x2: Number(entry.attachX) || 0,
      y2: Number(entry.anchorY) || 0
    };
  }

  function computeAnnotationLabelRect(entry, context){
    const height = context?.labelLineHeight || (context?.fontSize || 10) * SCATTER_LABEL_LINE_HEIGHT;
    const half = height / 2;
    const padding = context?.labelPadding ?? SCATTER_LABEL_PADDING;
    let x1;
    let x2;
    if(entry.textAnchor === 'end'){
      x2 = entry.textX + padding;
      x1 = entry.textX - entry.textWidth - padding;
    }else{
      x1 = entry.textX - padding;
      x2 = entry.textX + entry.textWidth + padding;
    }
    const y1 = entry.anchorY - half - padding;
    const y2 = entry.anchorY + half + padding;
    return { x1, x2, y1, y2 };
  }

  function rectanglesOverlap(a, b){
    if(!a || !b){ return false; }
    return !(a.x2 <= b.x1 || a.x1 >= b.x2 || a.y2 <= b.y1 || a.y1 >= b.y2);
  }

  function pointInRect(point, rect){
    if(!rect || !point){ return false; }
    return point.x >= rect.x1 && point.x <= rect.x2 && point.y >= rect.y1 && point.y <= rect.y2;
  }

  function orientation(p, q, r){
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if(Math.abs(val) < 1e-6){ return 0; }
    return val > 0 ? 1 : 2;
  }

  function onSegment(p, q, r){
    return q.x <= Math.max(p.x, r.x) + 1e-6 && q.x + 1e-6 >= Math.min(p.x, r.x)
      && q.y <= Math.max(p.y, r.y) + 1e-6 && q.y + 1e-6 >= Math.min(p.y, r.y);
  }

  function segmentsIntersect(a, b){
    if(!a || !b){ return false; }
    const p1 = { x: a.x1, y: a.y1 };
    const q1 = { x: a.x2, y: a.y2 };
    const p2 = { x: b.x1, y: b.y1 };
    const q2 = { x: b.x2, y: b.y2 };
    const o1 = orientation(p1, q1, p2);
    const o2 = orientation(p1, q1, q2);
    const o3 = orientation(p2, q2, p1);
    const o4 = orientation(p2, q2, q1);
    if(o1 !== o2 && o3 !== o4){
      return true;
    }
    if(o1 === 0 && onSegment(p1, p2, q1)){ return true; }
    if(o2 === 0 && onSegment(p1, q2, q1)){ return true; }
    if(o3 === 0 && onSegment(p2, p1, q2)){ return true; }
    if(o4 === 0 && onSegment(p2, q1, q2)){ return true; }
    return false;
  }

  function segmentIntersectsRect(segment, rect){
    if(!segment || !rect){ return false; }
    if(pointInRect({ x: segment.x1, y: segment.y1 }, rect) || pointInRect({ x: segment.x2, y: segment.y2 }, rect)){
      return true;
    }
    const edges = [
      { x1: rect.x1, y1: rect.y1, x2: rect.x2, y2: rect.y1 },
      { x1: rect.x2, y1: rect.y1, x2: rect.x2, y2: rect.y2 },
      { x1: rect.x2, y1: rect.y2, x2: rect.x1, y2: rect.y2 },
      { x1: rect.x1, y1: rect.y2, x2: rect.x1, y2: rect.y1 }
    ];
    return edges.some(edge => segmentsIntersect(segment, edge));
  }

  function refreshAnnotationGeometry(entry, context){
    clampAnnotationHorizontal(entry, context);
    entry.rect = computeAnnotationLabelRect(entry, context);
    entry.segment = computeAnnotationSegment(entry);
    return entry;
  }

  function availableLeaderSlack(entry, context){
    if(!entry){ return 0; }
    const dx = Math.abs((entry.attachX ?? 0) - (entry.pointX ?? 0));
    const minLen = Math.max(context?.minimumLeaderLength || 0, 0);
    return Math.max(0, dx - minLen);
  }

  function availableLeaderExtension(entry, context){
    if(!entry){ return 0; }
    const direction = entry.side === 'left' ? -1 : 1;
    const boundaryLimit = direction > 0
      ? (context.outerRight ?? context.innerRight) - context.labelOffset
      : (context.outerLeft ?? context.innerLeft) + context.labelOffset;
    let cappedLimit = boundaryLimit;
    if(Number.isFinite(context?.maxLeaderLength) && context.maxLeaderLength > 0){
      const dy = Math.abs((entry.anchorY ?? 0) - (entry.pointY ?? 0));
      const maxHorizontal = Math.sqrt(Math.max(context.maxLeaderLength * context.maxLeaderLength - dy * dy, 0));
      const capAttach = (entry.pointX ?? 0) + (direction > 0 ? maxHorizontal : -maxHorizontal);
      cappedLimit = direction > 0 ? Math.min(boundaryLimit, capAttach) : Math.max(boundaryLimit, capAttach);
    }
    if(direction > 0){
      return Math.max(0, cappedLimit - (entry.attachX ?? 0));
    }
    return Math.max(0, (entry.attachX ?? 0) - cappedLimit);
  }

  function clampAnnotationVertical(entry, value, context){
    const base = Number.isFinite(entry.baseAnchorY) ? entry.baseAnchorY : entry.anchorY;
    const drift = Math.max(context?.maxVerticalDrift || 0, 0);
    const lower = Math.max(context.clampMinY, base - drift);
    const upper = Math.min(context.clampMaxY, base + drift);
    return clampScatterValue(value, lower, upper);
  }

  function moveAnnotationVertically(entry, direction, context, magnitude){
    if(!entry){ return entry; }
    const step = magnitude || (context.labelLineHeight + context.labelPadding);
    const next = clampAnnotationVertical(entry, entry.anchorY + direction * step, context);
    entry.anchorY = next;
    return refreshAnnotationGeometry(entry, context);
  }

  function extendAnnotationLeader(entry, context, step){
    if(!entry){ return entry; }
    const direction = entry.side === 'left' ? -1 : 1;
    const available = availableLeaderExtension(entry, context);
    if(available <= 0){
      return entry;
    }
    const delta = Math.min(Math.max(step || context.collisionShortenStep, 2), available);
    if(delta <= 0){
      return entry;
    }
    moveAnnotationLabel(entry, direction * delta, context);
    enforceAnnotationLeaderLength(entry, context);
    return refreshAnnotationGeometry(entry, context);
  }

  function separateAnnotationPair(entryA, entryB, context){
    if(!entryA || !entryB){ return false; }
    const up = entryA.anchorY <= entryB.anchorY ? entryA : entryB;
    const down = up === entryA ? entryB : entryA;
    moveAnnotationVertically(up, -1, context);
    moveAnnotationVertically(down, 1, context);
    return true;
  }

  function resolveAnnotationPairSegments(entryA, entryB, context){
    const aHitsB = segmentIntersectsRect(entryA.segment, entryB.rect);
    const bHitsA = segmentIntersectsRect(entryB.segment, entryA.rect);
    if(aHitsB || bHitsA){
      const target = aHitsB ? entryB : entryA;
      if(availableLeaderExtension(target, context) > 0){
        extendAnnotationLeader(target, context, context.collisionShortenStep);
        refreshAnnotationGeometry(target, context);
        return true;
      }
    }
    const isRight = (context.side || 'right') !== 'left';
    const earlier = entryA.anchorY <= entryB.anchorY ? entryA : entryB;
    const later = earlier === entryA ? entryB : entryA;
    const attachesOutOfOrder = isRight
      ? (later.attachX ?? 0) + 0.5 < (earlier.attachX ?? 0)
      : (later.attachX ?? 0) - 0.5 > (earlier.attachX ?? 0);
    if(attachesOutOfOrder){
      if(availableLeaderExtension(later, context) > 0){
        extendAnnotationLeader(later, context, context.collisionShortenStep * 1.05);
        refreshAnnotationGeometry(later, context);
        return true;
      }
      if(availableLeaderSlack(earlier, context) > 0){
        shortenAnnotationLeader(earlier, context, context.collisionShortenStep * 1.05);
        refreshAnnotationGeometry(earlier, context);
        return true;
      }
      const verticalDir = isRight ? 1 : -1;
      moveAnnotationVertically(later, verticalDir, context, context.labelLineHeight * 0.75);
      refreshAnnotationGeometry(later, context);
      return true;
    }
    const slackA = availableLeaderSlack(entryA, context);
    const slackB = availableLeaderSlack(entryB, context);
    if(slackA <= 0 && slackB <= 0){
      const extensionA = availableLeaderExtension(entryA, context);
      const extensionB = availableLeaderExtension(entryB, context);
      if(extensionA > 0 || extensionB > 0){
        const target = extensionA >= extensionB ? entryA : entryB;
        extendAnnotationLeader(target, context, context.collisionShortenStep * 1.15);
        refreshAnnotationGeometry(target, context);
        return true;
      }
      const upper = entryA.anchorY <= entryB.anchorY ? entryA : entryB;
      const lower = upper === entryA ? entryB : entryA;
      moveAnnotationVertically(upper, -1, context, context.labelLineHeight);
      moveAnnotationVertically(lower, 1, context, context.labelLineHeight);
      return true;
    }
    const target = slackA >= slackB ? entryA : entryB;
    shortenAnnotationLeader(target, context, context.collisionShortenStep * 1.15);
    refreshAnnotationGeometry(target, context);
    return true;
  }

  function polishScatterAnnotationLayout(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return entries;
    }
    const maxPasses = 16;
    for(let pass = 0; pass < maxPasses; pass += 1){
      let changed = false;
      for(let i = 0; i < entries.length; i += 1){
        for(let j = i + 1; j < entries.length; j += 1){
          const a = entries[i];
          const b = entries[j];
          if(rectanglesOverlap(a.rect, b.rect)){
            changed = separateAnnotationPair(a, b, context) || changed;
            continue;
          }
          if(segmentIntersectsRect(a.segment, b.rect) || segmentIntersectsRect(b.segment, a.rect) || segmentsIntersect(a.segment, b.segment)){
            changed = resolveAnnotationPairSegments(a, b, context) || changed;
          }
        }
      }
      if(!changed){
        break;
      }
    }
    return entries;
  }

  function detectAnnotationConflict(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return null;
    }
    for(let i = 0; i < entries.length; i += 1){
      const entryA = entries[i];
      if(!entryA){ continue; }
      if(!entryA.rect || !entryA.segment){
        refreshAnnotationGeometry(entryA, context);
      }
      for(let j = i + 1; j < entries.length; j += 1){
        const entryB = entries[j];
        if(!entryB){ continue; }
        if(!entryB.rect || !entryB.segment){
          refreshAnnotationGeometry(entryB, context);
        }
        if(rectanglesOverlap(entryA.rect, entryB.rect)){
          return { type: 'label', a: i, b: j };
        }
        if(segmentIntersectsRect(entryA.segment, entryB.rect) || segmentIntersectsRect(entryB.segment, entryA.rect)){
          return { type: 'leader-label', a: i, b: j };
        }
        if(segmentsIntersect(entryA.segment, entryB.segment)){
          return { type: 'leader', a: i, b: j };
        }
      }
    }
    return null;
  }

  function resolveResidualAnnotationConflicts(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return entries;
    }
    const maxIterations = 32;
    for(let iter = 0; iter < maxIterations; iter += 1){
      const conflict = detectAnnotationConflict(entries, context);
      if(!conflict){
        break;
      }
      const entryA = entries[conflict.a];
      const entryB = entries[conflict.b];
      if(!entryA || !entryB){
        break;
      }
      let handled = false;
      if(conflict.type === 'label'){
        handled = separateAnnotationPair(entryA, entryB, context);
      }else{
        handled = resolveAnnotationPairSegments(entryA, entryB, context);
      }
      if(!handled){
        moveAnnotationVertically(entryB, entryB.anchorY >= entryA.anchorY ? 1 : -1, context, context.labelLineHeight * 0.5);
        refreshAnnotationGeometry(entryB, context);
      }
    }
    return entries;
  }

  function placeVolcanoAnnotation(entry, context){
    const dir = entry.dir || { x: entry.side === 'left' ? -1 : 1, y: 0 };
    const minLeader = Math.max(context.minimumLeaderLength || 0, SCATTER_LEADER_MIN_LENGTH);
    const desiredLeader = Math.max(entry.leaderLength || minLeader, minLeader);
    let anchorX = entry.pointX + dir.x * desiredLeader;
    let anchorY = entry.pointY + dir.y * desiredLeader;
    const clampMinY = Number.isFinite(context.clampMinY) ? context.clampMinY : anchorY;
    const clampMaxY = Number.isFinite(context.clampMaxY) ? context.clampMaxY : anchorY;
    if(anchorY < clampMinY || anchorY > clampMaxY){
      if(Math.abs(dir.y) > 1e-4){
        const targetY = clampScatterValue(anchorY, clampMinY, clampMaxY);
        const adjustedLength = (targetY - entry.pointY) / dir.y;
        const bounded = clampScatterValue(
          Math.abs(adjustedLength),
          minLeader,
          Math.max(minLeader, entry.maxLeaderLength || adjustedLength)
        );
        anchorY = entry.pointY + dir.y * bounded;
        anchorX = entry.pointX + dir.x * bounded;
        entry.leaderLength = bounded;
      }else{
        anchorY = clampScatterValue(anchorY, clampMinY, clampMaxY);
      }
    }
    const textAnchor = dir.x >= 0 ? 'start' : 'end';
    const offset = Math.max(context.textPad || 0, (context.labelPadding || 0) + 1.5);
    const textX = anchorX + (textAnchor === 'start' ? offset : -offset);
    const layout = {
      label: entry.label,
      pointIndex: entry.pointIndex,
      textWidth: entry.textWidth,
      textAnchor,
      textX,
      anchorY,
      attachX: anchorX,
      pointX: entry.pointX,
      pointY: entry.pointY,
      side: entry.side
    };
    layout.rect = computeAnnotationLabelRect(layout, context);
    layout.segment = computeAnnotationSegment(layout);
    return layout;
  }

  function findVolcanoAnnotationConflict(entries){
    if(!Array.isArray(entries) || entries.length < 2){
      return null;
    }
    for(let i = 0; i < entries.length; i += 1){
      const aLayout = entries[i].layout;
      if(!aLayout){ continue; }
      for(let j = i + 1; j < entries.length; j += 1){
        const bLayout = entries[j].layout;
        if(!bLayout){ continue; }
        if(rectanglesOverlap(aLayout.rect, bLayout.rect)){
          return { a: entries[i], b: entries[j], type: 'label' };
        }
        if(segmentIntersectsRect(aLayout.segment, bLayout.rect) || segmentIntersectsRect(bLayout.segment, aLayout.rect) || segmentsIntersect(aLayout.segment, bLayout.segment)){
          return { a: entries[i], b: entries[j], type: 'leader' };
        }
      }
    }
    return null;
  }

  function layoutScatterVolcanoCloud(entries, context){
    if(!Array.isArray(entries) || !entries.length){
      return [];
    }
    const maxLeaderScale = Number.isFinite(context.maxLeaderScale) ? context.maxLeaderScale : 1.5;
    const results = entries.map(entry => {
      const dx = entry.pointX - context.circle.cx;
      const dy = entry.pointY - context.circle.cy;
      const distance = Math.hypot(dx, dy);
      const dirX = distance > 1e-3 ? dx / distance : (entry.side === 'left' ? -1 : 1);
      const dirY = distance > 1e-3 ? dy / distance : -0.05;
      const baseLeader = Math.max(
        context.minimumLeaderLength || SCATTER_LEADER_MIN_LENGTH,
        (context.textPad || 0) * 2 + entry.textWidth * 0.25,
        (context.circle.r || 0) * 0.12,
        context.leaderPad || SCATTER_LEADER_MIN_LENGTH
      );
      const maxLeader = Math.max(baseLeader, baseLeader * maxLeaderScale);
      const enriched = {
        ...entry,
        dir: { x: dirX, y: dirY },
        leaderLength: baseLeader,
        maxLeaderLength: maxLeader,
        distanceFromCenter: distance
      };
      enriched.layout = placeVolcanoAnnotation(enriched, context);
      return enriched;
    });
    const extensionStep = Math.max(context.extensionStep || 0, Math.max(context.leaderPad || 0, 8) * 0.25, 3);
    const maxIterations = 48;
    for(let iter = 0; iter < maxIterations; iter += 1){
      const conflict = findVolcanoAnnotationConflict(results);
      if(!conflict){
        break;
      }
      const farther = (conflict.a.distanceFromCenter || 0) >= (conflict.b.distanceFromCenter || 0) ? conflict.a : conflict.b;
      let extended = false;
      const targetNext = Math.min(farther.maxLeaderLength, farther.leaderLength + extensionStep);
      if(targetNext > farther.leaderLength + 1e-3){
        farther.leaderLength = targetNext;
        farther.layout = placeVolcanoAnnotation(farther, context);
        extended = true;
      }
      if(!extended){
        const other = farther === conflict.a ? conflict.b : conflict.a;
        const otherNext = Math.min(other.maxLeaderLength, other.leaderLength + extensionStep);
        if(otherNext > other.leaderLength + 1e-3){
          other.leaderLength = otherNext;
          other.layout = placeVolcanoAnnotation(other, context);
          extended = true;
        }
      }
      if(!extended){
        break;
      }
    }
    return results.map(entry => ({
      label: entry.label,
      pointIndex: entry.pointIndex,
      textWidth: entry.textWidth,
      textAnchor: entry.layout?.textAnchor || (entry.side === 'left' ? 'end' : 'start'),
      textX: entry.layout?.textX ?? entry.pointX,
      anchorY: entry.layout?.anchorY ?? entry.pointY,
      attachX: entry.layout?.attachX ?? entry.pointX,
      pointX: entry.pointX,
      pointY: entry.pointY,
      side: entry.side
    }));
  }

  function enforceAnnotationMinimumSpacing(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return entries;
    }
    const minSpacing = Math.max(context.minSpacing || 0, context.labelLineHeight + context.labelPadding);
    const sorted = entries.slice().sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    for(let i = 1; i < sorted.length; i += 1){
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if(curr.anchorY - prev.anchorY < minSpacing){
        curr.anchorY = clampAnnotationVertical(curr, prev.anchorY + minSpacing, context);
        refreshAnnotationGeometry(curr, context);
      }
    }
    for(let i = sorted.length - 2; i >= 0; i -= 1){
      const next = sorted[i + 1];
      const curr = sorted[i];
      if(next.anchorY - curr.anchorY < minSpacing){
        curr.anchorY = clampAnnotationVertical(curr, next.anchorY - minSpacing, context);
        refreshAnnotationGeometry(curr, context);
      }
    }
    return entries;
  }

  function enforceAnnotationAttachOrder(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return entries;
    }
    const ordered = entries.slice().sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    if((context.side || 'right') === 'right'){
      for(let i = 1; i < ordered.length; i += 1){
        const prev = ordered[i - 1];
        const curr = ordered[i];
        if(curr.attachX + 0.5 < prev.attachX){
          const delta = (prev.attachX - curr.attachX) + context.labelOffset;
          moveAnnotationLabel(curr, delta, context);
          enforceAnnotationLeaderLength(curr, context);
          refreshAnnotationGeometry(curr, context);
        }
      }
    }else{
      for(let i = 1; i < ordered.length; i += 1){
        const prev = ordered[i - 1];
        const curr = ordered[i];
        if(curr.attachX - 0.5 > prev.attachX){
          const delta = (prev.attachX - curr.attachX) - context.labelOffset;
          moveAnnotationLabel(curr, delta, context);
          enforceAnnotationLeaderLength(curr, context);
          refreshAnnotationGeometry(curr, context);
        }
      }
    }
    return entries;
  }

  function enforceAnnotationDeltaOrder(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return entries;
    }
    const ordered = entries.slice().sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const direction = (context.side || 'right') === 'left' ? -1 : 1;
    let prevDelta = null;
    for(let i = 0; i < ordered.length; i += 1){
      const entry = ordered[i];
      const dx = (entry.attachX ?? 0) - (entry.pointX ?? 0);
      if(prevDelta === null){
        prevDelta = dx;
        continue;
      }
      const minStep = Math.max(context.labelOffset * 0.75, 2);
      const desiredDelta = direction > 0
        ? Math.max(prevDelta + minStep, dx)
        : Math.min(prevDelta - minStep, dx);
      if(direction > 0 ? dx < desiredDelta - 1e-3 : dx > desiredDelta + 1e-3){
        entry.attachX = entry.pointX + desiredDelta;
        entry.textX = direction > 0
          ? entry.attachX + context.labelOffset
          : entry.attachX - context.labelOffset;
        clampAnnotationHorizontal(entry, context);
        enforceAnnotationLeaderLength(entry, context);
        refreshAnnotationGeometry(entry, context);
        prevDelta = (entry.attachX ?? 0) - (entry.pointX ?? 0);
      }else{
        prevDelta = dx;
      }
    }
    return entries;
  }

  function applyIsotonicRegression(values, weights, nonDecreasing){
    const n = values.length;
    const result = new Array(n);
    const stack = [];
    for(let i = 0; i < n; i += 1){
      let value = values[i];
      let weight = Math.max(1e-3, weights[i] || 1);
      stack.push({ value, weight, count: 1 });
      while(stack.length >= 2){
        const b = stack[stack.length - 1];
        const a = stack[stack.length - 2];
        const violates = nonDecreasing ? (a.value > b.value) : (a.value < b.value);
        if(!violates){ break; }
        const totalWeight = a.weight + b.weight;
        const mergedValue = (a.value * a.weight + b.value * b.weight) / totalWeight;
        stack.pop();
        stack.pop();
        stack.push({ value: mergedValue, weight: totalWeight, count: a.count + b.count });
      }
    }
    let idx = n - 1;
    while(stack.length){
      const block = stack.pop();
      for(let i = 0; i < block.count; i += 1){
        result[idx - i] = block.value;
      }
      idx -= block.count;
    }
    return result;
  }

  function enforceAnnotationSlopeIsotonic(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return entries;
    }
    const ordered = entries.slice().sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const isRight = (context.side || 'right') !== 'left';
    const slopes = [];
    const weights = [];
    const dyInfo = [];
    ordered.forEach(entry => {
      const dyRaw = (entry.anchorY ?? 0) - (entry.pointY ?? 0);
      const dySign = dyRaw === 0 ? (isRight ? 1 : -1) : Math.sign(dyRaw);
      const dyAbs = Math.max(Math.abs(dyRaw), context.labelLineHeight);
      const dy = dyAbs * dySign;
      dyInfo.push({ dy, dyAbs });
      let slope = ((entry.attachX ?? entry.pointX) - (entry.pointX ?? 0)) / dy;
      if(!Number.isFinite(slope)){
        slope = isRight ? 0.01 : -0.01;
      }
      slopes.push(slope);
      weights.push(Math.max(1, dyAbs));
    });
    const adjusted = applyIsotonicRegression(slopes, weights, isRight);
    ordered.forEach((entry, idx) => {
      const dy = dyInfo[idx].dy;
      const slope = adjusted[idx];
      let targetAttach = (entry.pointX ?? 0) + slope * dy;
      if(Number.isFinite(context.maxLeaderLength) && context.maxLeaderLength > 0){
        const horizontalLimit = Math.sqrt(Math.max(context.maxLeaderLength * context.maxLeaderLength - dyInfo[idx].dyAbs * dyInfo[idx].dyAbs, 0));
        if(horizontalLimit > 0){
          const limit = (entry.pointX ?? 0) + (isRight ? 1 : -1) * horizontalLimit;
          targetAttach = isRight ? Math.min(targetAttach, limit) : Math.max(targetAttach, limit);
        }
      }
      entry.attachX = targetAttach;
      entry.textX = isRight
        ? entry.attachX + context.labelOffset
        : entry.attachX - context.labelOffset;
      clampAnnotationHorizontal(entry, context);
      refreshAnnotationGeometry(entry, context);
    });
    return entries;
  }

  function enforceAnnotationAnchorFan(entries, context){
    if(!Array.isArray(entries) || entries.length < 2){
      return entries;
    }
    const ordered = entries.slice().sort((a, b) => a.anchorY - b.anchorY);
    const isRight = (context.side || 'right') !== 'left';
    const step = Math.max(context.labelOffset * 0.9, 4);
    let prevRect = null;
    ordered.forEach(entry => {
      if(prevRect){
        if(isRight){
          const clearance = prevRect.x2 + step;
          if(entry.attachX < clearance){
            entry.attachX = clearance;
            entry.textX = entry.attachX + context.labelOffset;
          }
        }else{
          const clearance = prevRect.x1 - step;
          if(entry.attachX > clearance){
            entry.attachX = clearance;
            entry.textX = entry.attachX - context.labelOffset;
          }
        }
      }
      enforceAnnotationLeaderLength(entry, context);
      refreshAnnotationGeometry(entry, context);
      prevRect = entry.rect;
    });
    return entries;
  }

  function clampAnnotationHorizontal(entry, context){
    const direction = entry.side === 'left' ? -1 : 1;
    const minGap = Number.isFinite(entry.minLeaderGap) ? entry.minLeaderGap : context.minLeaderGap;
    if(direction > 0){
      const minText = Math.max(context.innerLeft + context.textPad, entry.pointX + minGap + context.textPad);
      const maxText = (context.outerRight ?? context.innerRight) - entry.textWidth;
      entry.textX = clampScatterValue(entry.textX, Math.min(minText, maxText), Math.max(minText, maxText));
    }else{
      const maxText = Math.min(context.innerRight - context.textPad, entry.pointX - minGap - context.textPad);
      const minText = (context.outerLeft ?? context.innerLeft) + entry.textWidth;
      entry.textX = clampScatterValue(entry.textX, Math.min(minText, maxText), Math.max(minText, maxText));
    }
    entry.attachX = direction > 0
      ? Math.min(entry.textX - context.labelOffset, (context.outerRight ?? context.innerRight) - context.labelOffset)
      : Math.max(entry.textX + context.labelOffset, (context.outerLeft ?? context.innerLeft) + context.labelOffset);
    return entry;
  }

  function moveAnnotationLabel(entry, delta, context){
    entry.textX += delta;
    clampAnnotationHorizontal(entry, context);
    return entry;
  }

  function tightenAnnotationLeaderGap(entry, context){
    const absoluteMin = context.absoluteMinLeaderGap ?? context.textPad ?? 2;
    const desired = Math.max(absoluteMin, context.minimumLeaderLength * 0.5);
    if(!Number.isFinite(entry.minLeaderGap) || entry.minLeaderGap > desired){
      entry.minLeaderGap = desired;
    }
  }

  function enforceAnnotationLeaderLength(entry, context){
    if(!Number.isFinite(context.maxLeaderLength) || context.maxLeaderLength <= 0){
      return entry;
    }
    const dx = entry.attachX - entry.pointX;
    const dy = entry.anchorY - entry.pointY;
    const currentLength = Math.hypot(dx, dy);
    if(currentLength <= context.maxLeaderLength){
      return entry;
    }
    tightenAnnotationLeaderGap(entry, context);
    const direction = entry.side === 'left' ? -1 : 1;
    const verticalSpan = Math.abs(dy);
    const horizontalLimit = Math.max(0, Math.sqrt(Math.max(context.maxLeaderLength * context.maxLeaderLength - verticalSpan * verticalSpan, 0)));
    const desiredAttachX = entry.pointX + Math.sign(dx || direction) * horizontalLimit;
    const delta = entry.attachX - desiredAttachX;
    if(Math.abs(delta) < 0.5){
      entry.attachX = desiredAttachX;
      return clampAnnotationHorizontal(entry, context);
    }
    return moveAnnotationLabel(entry, -delta, context);
  }

  function shortenAnnotationLeader(entry, context, step){
    const dx = Math.abs(entry.attachX - entry.pointX);
    const available = Math.max(0, dx - context.minimumLeaderLength);
    const delta = Math.min(Math.max(step || SCATTER_LEADER_COLLISION_STEP, 2), available);
    if(delta <= 0){
      return entry;
    }
    tightenAnnotationLeaderGap(entry, context);
    const direction = entry.side === 'left' ? -1 : 1;
    return moveAnnotationLabel(entry, -direction * delta, context);
  }

  function nudgeAnnotationVertically(entry, reference, context){
    const direction = entry.anchorY >= reference.anchorY ? 1 : -1;
    const minSpacing = context.labelLineHeight + context.labelPadding;
    const target = direction > 0
      ? reference.anchorY + minSpacing
      : reference.anchorY - minSpacing;
    entry.anchorY = clampAnnotationVertical(entry, target, context);
    return entry;
  }

  function resolveAnnotationConflicts(candidate, placed, context){
    let current = refreshAnnotationGeometry(candidate, context);
    const maxIterations = 36;
    for(let iteration = 0; iteration < maxIterations; iteration += 1){
      current = enforceAnnotationLeaderLength(current, context);
      refreshAnnotationGeometry(current, context);
      let conflictResolved = true;
      for(let idx = 0; idx < placed.length; idx += 1){
        const prev = placed[idx];
        if(rectanglesOverlap(current.rect, prev.rect)){
          const direction = current.anchorY >= prev.anchorY ? 1 : -1;
          moveAnnotationVertically(current, direction, context);
          conflictResolved = false;
          break;
        }
        if(segmentIntersectsRect(current.segment, prev.rect) || segmentIntersectsRect(prev.segment, current.rect) || segmentsIntersect(current.segment, prev.segment)){
          const slack = availableLeaderSlack(current, context);
          if(slack > 0){
            shortenAnnotationLeader(current, context, context.collisionShortenStep);
          }else if(availableLeaderExtension(current, context) > 0){
            extendAnnotationLeader(current, context, context.collisionShortenStep);
          }else if(availableLeaderExtension(prev, context) > 0){
            extendAnnotationLeader(prev, context, context.collisionShortenStep);
            refreshAnnotationGeometry(prev, context);
          }else{
            moveAnnotationVertically(current, current.anchorY >= prev.anchorY ? 1 : -1, context);
          }
          refreshAnnotationGeometry(current, context);
          conflictResolved = false;
          break;
        }
      }
      if(conflictResolved){
        return current;
      }
    }
    return current;
  }
  function layoutScatterAnnotationSide(entries, config){
    if(!Array.isArray(entries) || !entries.length){
      return [];
    }
    const minY = Number.isFinite(config?.minY) ? config.minY : 0;
    const maxY = Number.isFinite(config?.maxY) ? config.maxY : minY + 1;
    const fontSize = Math.max(6, Number(config?.fontSize) || 10);
    const textPad = Math.max(2, Number(config?.textPad) || 4);
    const minSpacing = Math.max(fontSize * 1.35, Number(config?.minSpacing) || 12) + Math.max(2, textPad * 0.4);
    const verticalPadding = Math.max(2, Number(config?.verticalPadding) || 6);
    const leaderPad = Math.max(6, Number(config?.leaderPad) || 10);
      const leaderGap = Math.max(leaderPad * 1.2, Number(config?.leaderGap) || leaderPad * 1.2);
    const axisPadding = Math.max(4, Number(config?.axisPadding) || 8);
    const plotLeft = Number.isFinite(config?.plotLeft) ? config.plotLeft : 0;
    const plotRight = Number.isFinite(config?.plotRight) ? config.plotRight : plotLeft + 1;
    const innerLeft = plotLeft + axisPadding;
    const innerRight = plotRight - axisPadding;
    const labelRegionExtra = Math.max(leaderPad * 2.5, textPad * 6, 60);
    const outerLeft = innerLeft - labelRegionExtra;
    const outerRight = innerRight + labelRegionExtra;
    const labelOffset = Math.max(2, textPad * 0.75);
    const clampMinY = Math.min(minY + verticalPadding, maxY - verticalPadding);
    const clampMaxY = Math.max(minY + verticalPadding, maxY - verticalPadding);
    const horizontalSpan = Math.max(0, innerRight - innerLeft);
    const fallbackLeaderLength = Math.min(Math.max(leaderPad * 2.25, horizontalSpan * 0.2), Math.max(horizontalSpan * 0.45, leaderPad * 2.25));
    const maxLeaderLength = Number.isFinite(config?.maxLeaderLength) && config.maxLeaderLength > 0
      ? config.maxLeaderLength
      : fallbackLeaderLength;
    const labelLineHeight = Math.max(fontSize * SCATTER_LABEL_LINE_HEIGHT, fontSize + 4);
    const labelPadding = Math.max(SCATTER_LABEL_PADDING, textPad * 0.35);
    const resolvedSpacing = Math.max(minSpacing, labelLineHeight + labelPadding * 2 + 1);
    const context = {
      innerLeft,
      innerRight,
      outerLeft,
      outerRight,
      textPad,
      labelOffset,
      clampMinY,
      clampMaxY,
      fontSize,
      labelLineHeight,
      labelPadding,
      minSpacing: resolvedSpacing,
      maxLeaderLength,
      collisionShortenStep: Math.max(textPad * 1.75, SCATTER_LEADER_COLLISION_STEP),
      minimumLeaderLength: Math.max(SCATTER_LEADER_MIN_LENGTH, leaderPad * 0.5),
      minLeaderGap: Math.max(leaderGap, leaderPad * 0.9),
      absoluteMinLeaderGap: Math.max(2, textPad),
      maxVerticalDrift: Math.max(fontSize * 5.5, verticalPadding * 4),
      labelRegionExtra
    };
    const sorted = entries.slice().sort((a, b) => a.baseY - b.baseY).map((entry, idx) => ({
      ...entry,
      orderIndex: idx
    }));
    const assigned = sorted.map(entry => ({
      ...entry,
      targetY: clampScatterValue(entry.baseY, clampMinY, clampMaxY)
    }));
    for(let i = 1; i < assigned.length; i += 1){
      const prev = assigned[i - 1];
      if(assigned[i].targetY - prev.targetY < minSpacing){
        assigned[i].targetY = prev.targetY + minSpacing;
      }
    }
    for(let i = assigned.length - 2; i >= 0; i -= 1){
      const next = assigned[i + 1];
      if(next.targetY - assigned[i].targetY < minSpacing){
        assigned[i].targetY = next.targetY - minSpacing;
      }
    }
    assigned.forEach(entry => {
      entry.targetY = clampScatterValue(entry.targetY, clampMinY, clampMaxY);
    });
    for(let i = 1; i < assigned.length; i += 1){
      const prev = assigned[i - 1];
      if(assigned[i].targetY - prev.targetY < minSpacing){
        assigned[i].targetY = prev.targetY + minSpacing;
      }
    }
    for(let i = assigned.length - 2; i >= 0; i -= 1){
      const next = assigned[i + 1];
      if(next.targetY - assigned[i].targetY < minSpacing){
        assigned[i].targetY = next.targetY - minSpacing;
      }
    }
    assigned.forEach(entry => {
      entry.targetY = clampScatterValue(entry.targetY, clampMinY, clampMaxY);
    });
    const side = config?.side === 'left' ? 'left' : 'right';
    context.side = side;
    const placed = [];
    assigned.forEach(entry => {
      const direction = side === 'left' ? -1 : 1;
      const idealText = entry.pointX + direction * (leaderPad * 1.25 + textPad);
      let textX;
      if(direction > 0){
        const minTextRaw = Math.max(innerLeft + textPad, entry.pointX + leaderGap + textPad);
        const maxTextRaw = innerRight - entry.textWidth;
        const lower = Math.min(minTextRaw, maxTextRaw);
        const upper = Math.max(minTextRaw, maxTextRaw);
        textX = clampScatterValue(idealText, lower, upper);
      }else{
        const maxTextRaw = Math.min(innerRight - textPad, entry.pointX - leaderGap - textPad);
        const minTextRaw = innerLeft + entry.textWidth;
        const lower = Math.min(minTextRaw, maxTextRaw);
        const upper = Math.max(minTextRaw, maxTextRaw);
        textX = clampScatterValue(idealText, lower, upper);
      }
      const attachX = direction > 0
        ? Math.min(textX - labelOffset, innerRight - labelOffset)
        : Math.max(textX + labelOffset, innerLeft + labelOffset);
      const candidate = {
        label: entry.label,
        pointIndex: entry.pointIndex,
        textWidth: entry.textWidth,
        textAnchor: side === 'left' ? 'end' : 'start',
        textX,
        anchorY: entry.targetY,
        baseAnchorY: entry.targetY,
        attachX,
        pointX: entry.pointX,
        pointY: entry.pointY,
        side,
        minLeaderGap: context.minLeaderGap,
        orderIndex: entry.orderIndex
      };
      const resolved = resolveAnnotationConflicts(candidate, placed, context);
      placed.push(resolved);
    });
    polishScatterAnnotationLayout(placed, context);
    enforceAnnotationMinimumSpacing(placed, context);
    polishScatterAnnotationLayout(placed, context);
    enforceAnnotationMinimumSpacing(placed, context);
    enforceAnnotationSlopeIsotonic(placed, context);
    enforceAnnotationAnchorFan(placed, context);
    enforceAnnotationDeltaOrder(placed, context);
    enforceAnnotationAttachOrder(placed, context);
    enforceAnnotationMinimumSpacing(placed, context);
    for(let finalPass = 0; finalPass < 2; finalPass += 1){
      polishScatterAnnotationLayout(placed, context);
      enforceAnnotationMinimumSpacing(placed, context);
    }
    resolveResidualAnnotationConflicts(placed, context);
    enforceAnnotationMinimumSpacing(placed, context);
    resolveResidualAnnotationConflicts(placed, context);
    return placed.map(entry => ({
      label: entry.label,
      pointIndex: entry.pointIndex,
      textWidth: entry.textWidth,
      textAnchor: entry.textAnchor,
      textX: entry.textX,
      anchorY: entry.anchorY,
      attachX: entry.attachX,
      pointX: entry.pointX,
      pointY: entry.pointY,
      side: entry.side
    }));
  }

  function layoutScatterAnnotations(params){
    if(!Array.isArray(params?.requests) || !params.requests.length){
      return [];
    }
    const pointGeometry = Array.isArray(params.pointGeometry) ? params.pointGeometry : [];
    const requestEntries = params.requests.map(entry => {
      const geom = pointGeometry[entry.pointIndex];
      if(!geom){
        return null;
      }
      return {
        ...entry,
        baseY: geom.cy,
        pointX: geom.cx,
        pointY: geom.cy
      };
    }).filter(Boolean);
    if(!requestEntries.length){
      return [];
    }
    if((params?.graphType || '').toLowerCase() === 'volcano'){
      return layoutVolcanoAnnotationsInternal(requestEntries, params);
    }
    const margin = params.margin || { top: 0, left: 0 };
    const plotH = Number.isFinite(params.plotH) ? params.plotH : 0;
    const minY = margin.top;
    const maxY = margin.top + plotH;
    const fontSize = Math.max(6, Number(params.fontSize) || 10);
    const minSpacing = Math.max(fontSize + 4, fontSize * 1.25);
    const plotW = Number.isFinite(params.plotW) ? params.plotW : 0;
    const plotLeft = margin.left;
    const plotRight = margin.left + plotW;
    const leaderPad = Math.max(6, Number(params.leaderPadding) || 10);
    const leaderGap = Math.max(leaderPad, Number(params.leaderGap) || leaderPad);
    const textPad = Math.max(2, Number(params.textPadding) || 4);
    const axisPadding = Math.max(4, Number(params.axisPadding) || 8);
    const verticalPadding = Math.max(4, Number(params.verticalPadding) || 8);
    const innerLeftBound = plotLeft + axisPadding;
    const innerRightBound = plotRight - axisPadding;
    const requiredGapBase = leaderGap + textPad * 2;
    const availableWidth = Math.max(0, plotW - axisPadding * 2);
    const defaultLeaderCap = Math.max(leaderPad * 2.25, availableWidth * 0.25);
    const maxLeaderLength = Number.isFinite(params.maxLeaderLength) && params.maxLeaderLength > 0
      ? params.maxLeaderLength
      : defaultLeaderCap;
    requestEntries.forEach(entry => {
      const approxNeeded = Math.max(entry.textWidth + requiredGapBase, leaderPad * 1.5 + entry.textWidth);
      const availableLeft = entry.pointX - innerLeftBound;
      const availableRight = innerRightBound - entry.pointX;
      if(entry.side === 'left' && availableLeft < approxNeeded && availableRight > availableLeft){
        entry.side = 'right';
      }else if(entry.side === 'right' && availableRight < approxNeeded && availableLeft > availableRight){
        entry.side = 'left';
      }
    });
    const leftEntries = [];
    const rightEntries = [];
    requestEntries.forEach(entry => {
      if(entry.side === 'left'){
        leftEntries.push(entry);
      }else{
        rightEntries.push(entry);
      }
    });
    const results = [];
    if(leftEntries.length){
      const leftLayouts = layoutScatterAnnotationSide(leftEntries, {
        side: 'left',
        minY,
        maxY,
        minSpacing,
        fontSize,
        plotLeft,
        plotRight,
        leaderPad,
        leaderGap,
        textPad,
        axisPadding,
        verticalPadding,
        maxLeaderLength
      });
      results.push(...leftLayouts);
    }
    if(rightEntries.length){
      const rightLayouts = layoutScatterAnnotationSide(rightEntries, {
        side: 'right',
        minY,
        maxY,
        minSpacing,
        fontSize,
        plotLeft,
        plotRight,
        leaderPad,
        leaderGap,
        textPad,
        axisPadding,
        verticalPadding,
        maxLeaderLength
      });
      results.push(...rightLayouts);
    }
    return results;
  }

  function layoutVolcanoAnnotationsInternal(requestEntries, params){
    if(!Array.isArray(requestEntries) || !requestEntries.length){
      return [];
    }
    const margin = params.margin || { top: 0, left: 0 };
    const plotW = Number.isFinite(params.plotW) ? params.plotW : 0;
    const plotH = Number.isFinite(params.plotH) ? params.plotH : 0;
    const minY = margin.top;
    const maxY = margin.top + plotH;
    const fontSize = Math.max(6, Number(params?.fontSize) || 10);
    const textPad = Math.max(2, Number(params?.textPadding) || 4);
    const leaderPad = Math.max(6, Number(params?.leaderPadding) || 10);
    const axisPadding = Math.max(4, Number(params?.axisPadding) || 8);
    const verticalPadding = Math.max(axisPadding, Number(params?.verticalPadding) || axisPadding);
    const labelLineHeight = Math.max(fontSize * SCATTER_LABEL_LINE_HEIGHT, fontSize + 4);
    const labelPadding = Math.max(SCATTER_LABEL_PADDING, textPad * 0.35);
    const clampMinY = Math.min(minY + verticalPadding, maxY - verticalPadding);
    const clampMaxY = Math.max(minY + verticalPadding, maxY - verticalPadding);
    const plotLeft = margin.left;
    const plotRight = margin.left + plotW;
    const labelRegionExtra = Math.max(leaderPad * 3, textPad * 8, 90);
    const circlePadding = Math.max(leaderPad * 0.35, textPad * 1.5, 6);
    const baseContext = {
      fontSize,
      labelLineHeight,
      labelPadding,
      textPad,
      clampMinY,
      clampMaxY,
      minimumLeaderLength: Math.max(leaderPad * 0.6, SCATTER_LEADER_MIN_LENGTH),
      leaderPad,
      extensionStep: Math.max(leaderPad * 0.25, 4),
      maxLeaderScale: 1.5,
      outerLeft: plotLeft - labelRegionExtra,
      outerRight: plotRight + labelRegionExtra,
      labelOffset: Math.max(3, textPad * 0.8)
    };
    const grouped = { left: [], right: [] };
    requestEntries.forEach(entry => {
      const side = entry.side === 'left' ? 'left' : 'right';
      grouped[side].push(entry);
    });
    const layouts = [];
    ['left', 'right'].forEach(side => {
      const group = grouped[side];
      if(!group.length){
        return;
      }
      const circleRaw = computeScatterEnclosingCircle(group.map(item => ({ x: item.pointX, y: item.pointY })));
      const circle = {
        cx: circleRaw.cx,
        cy: circleRaw.cy,
        r: Math.max(0, (circleRaw.r || 0) + circlePadding)
      };
      const context = { ...baseContext, circle, side };
      const sideLayouts = layoutScatterVolcanoCloud(group, context);
      layouts.push(...sideLayouts);
    });
    return layouts;
  }

  function showScatterTooltip(data, evt){
    const tooltip = getScatterTooltipElement();
    if(!tooltip){ return; }
    if(!updateScatterTooltipContent(tooltip, data)){ return; }
    tooltip.style.display = 'block';
    const pos = getScatterEventPagePosition(evt);
    positionScatterTooltipAt(tooltip, pos.x, pos.y);
    scatterDebug('Debug: scatter tooltip show',{
      label: data?.label || null,
      x: data?.x ?? null,
      y: data?.y ?? null,
      graphType: data?.graphType || null
    });
  }

  function handleScatterPointEnter(evt){
    const data = evt?.currentTarget?.__scatterPointData;
    if(!data){ return; }
    showScatterTooltip(data, evt);
  }

  function handleScatterPointMove(evt){
    const tooltip = getScatterTooltipElement();
    if(!tooltip || tooltip.style.display === 'none'){ return; }
    const pos = getScatterEventPagePosition(evt);
    positionScatterTooltipAt(tooltip, pos.x, pos.y);
  }

  function handleScatterPointLeave(){
    hideScatterTooltip('point-leave');
  }

  function handleScatterPlotMouseLeave(){
    hideScatterTooltip('plot-leave');
  }

  function isScatterContextMenuEventSuppressed(target){
    if(!target){
      return false;
    }
    if(target === scatterPointContextMenu){
      return true;
    }
    if(typeof target.closest === 'function'){
      return !!target.closest('.scatter-point-context-menu');
    }
    return false;
  }

  function ensureScatterPointContextMenu(){
    const doc = global.document;
    if(!doc){
      return null;
    }
    if(scatterPointContextMenu && doc.body && doc.body.contains(scatterPointContextMenu)){
      return scatterPointContextMenu;
    }
    const menu = doc.createElement('div');
    menu.className = 'tab-context-menu scatter-point-context-menu';
    menu.hidden = true;
    menu.dataset.scatterContextMenu = '1';
    menu.setAttribute('role', 'menu');
    menu.style.position = 'absolute';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const makeItem = (action, label) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-context-menu__item';
      btn.dataset.action = action;
      btn.textContent = label;
      return btn;
    };

    const labelItem = makeItem('toggle-label', 'Add label');
    menu.appendChild(labelItem);

    menu.addEventListener('contextmenu', evt => {
      try{ evt.preventDefault(); }catch(e){}
      try{ evt.stopPropagation(); }catch(e){}
    }, true);

    const hide = (reason) => hideScatterPointContextMenu(reason);
    labelItem.addEventListener('click', evt => {
      try{ evt.preventDefault(); }catch(e){}
      try{ evt.stopPropagation(); }catch(e){}
      const data = menu.__scatterPointData;
      const rowIndex = Number.isInteger(data?.rowIndex) ? data.rowIndex : null;
      if(rowIndex === null){
        hide('no-row-index');
        return;
      }
      const hot = scatterRefs.hot || scatter.__ensureHotForActiveTab?.();
      const toggled = toggleScatterRowSelected(hot, rowIndex, { ensureVisible: true });
      storeScatterRowSelection(hot, 'point-context-menu');
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: scatter context menu label toggle', { rowIndex, toggled });
      }
      scheduleDrawScatter({ reason: 'point-context-menu' });
      hide('action-complete');
    });

    if(doc.body){
      doc.body.appendChild(menu);
    }
    scatterPointContextMenu = menu;

    if(!scatterPointContextMenuGlobalBound){
      scatterPointContextMenuGlobalBound = true;
      doc.addEventListener('pointerdown', evt => {
        if(!scatterPointContextMenu || scatterPointContextMenu.hidden){
          return;
        }
        const target = evt?.target;
        if(target && scatterPointContextMenu.contains(target)){
          return;
        }
        hideScatterPointContextMenu('outside-click');
      }, true);
      doc.addEventListener('keydown', evt => {
        if(!scatterPointContextMenu || scatterPointContextMenu.hidden){
          return;
        }
        if(evt?.key === 'Escape'){
          hideScatterPointContextMenu('escape');
        }
      }, true);
      global.addEventListener?.('resize', () => hideScatterPointContextMenu('resize'), true);
      global.addEventListener?.('scroll', () => hideScatterPointContextMenu('scroll'), true);
    }

    return scatterPointContextMenu;
  }

  function hideScatterPointContextMenu(reason){
    if(!scatterPointContextMenu || scatterPointContextMenu.hidden){
      return;
    }
    scatterPointContextMenu.hidden = true;
    scatterPointContextMenu.__scatterPointData = null;
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: scatter point context menu hidden', { reason: reason || 'unknown' });
    }
  }

  function positionScatterPointContextMenu(menu, pageX, pageY){
    if(!menu){
      return;
    }
    const x = Number(pageX) || 0;
    const y = Number(pageY) || 0;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const rect = menu.getBoundingClientRect?.();
    const docEl = global.document?.documentElement;
    const viewportW = global.innerWidth || docEl?.clientWidth || 0;
    const viewportH = global.innerHeight || docEl?.clientHeight || 0;
    if(rect && viewportW && viewportH){
      let nextLeft = x;
      let nextTop = y;
      if(rect.right > viewportW - 6){
        nextLeft = Math.max(6, viewportW - rect.width - 6);
      }
      if(rect.bottom > viewportH - 6){
        nextTop = Math.max(6, viewportH - rect.height - 6);
      }
      menu.style.left = `${nextLeft}px`;
      menu.style.top = `${nextTop}px`;
    }
  }

  function isScatterRowSelected(hotInstance, rowIndex){
    const api = hotInstance?.gridApi;
    if(!api || typeof api.forEachNode !== 'function'){
      return false;
    }
    let selected = false;
    api.forEachNode(node => {
      if(selected){
        return;
      }
      const nodeRowIndex = Number.isInteger(node?.rowIndex) ? node.rowIndex : node?.data?.__rowIndex;
      if(nodeRowIndex !== rowIndex){
        return;
      }
      selected = !!node?.isSelected?.();
    });
    return selected;
  }

  function setScatterRowSelected(hotInstance, rowIndex, desiredSelected, options){
    const api = hotInstance?.gridApi;
    if(!api || typeof api.forEachNode !== 'function'){
      return false;
    }
    const preserveExisting = options?.preserveExisting !== false;
    let matched = false;
    api.forEachNode(node => {
      const nodeRowIndex = Number.isInteger(node?.rowIndex) ? node.rowIndex : node?.data?.__rowIndex;
      if(nodeRowIndex !== rowIndex){
        return;
      }
      matched = true;
      if(typeof node.setSelected === 'function'){
        try{
          node.setSelected(!!desiredSelected, !preserveExisting);
        }catch(err){
          node.setSelected(!!desiredSelected);
        }
      }
    });
    if(matched && desiredSelected && options?.ensureVisible){
      if(typeof api.ensureIndexVisible === 'function'){
        try{ api.ensureIndexVisible(rowIndex, 'middle'); }catch(e){ api.ensureIndexVisible(rowIndex); }
      }else if(typeof api.ensureNodeVisible === 'function'){
        api.forEachNode(node => {
          const nodeRowIndex = Number.isInteger(node?.rowIndex) ? node.rowIndex : node?.data?.__rowIndex;
          if(nodeRowIndex === rowIndex){
            try{ api.ensureNodeVisible(node); }catch(e){}
          }
        });
      }
    }
    return matched;
  }

  function toggleScatterRowSelected(hotInstance, rowIndex, options){
    const selected = isScatterRowSelected(hotInstance, rowIndex);
    return setScatterRowSelected(hotInstance, rowIndex, !selected, options);
  }

  function showScatterPointContextMenu(evt, data){
    const menu = ensureScatterPointContextMenu();
    if(!menu){
      return;
    }
    menu.__scatterPointData = data || null;
    const rowIndex = Number.isInteger(data?.rowIndex) ? data.rowIndex : null;
    const hot = scatterRefs.hot || scatter.__ensureHotForActiveTab?.();
    const alreadySelected = rowIndex !== null && hot ? isScatterRowSelected(hot, rowIndex) : false;
    const labelItem = menu.querySelector?.('button[data-action="toggle-label"]');
    if(labelItem){
      labelItem.textContent = alreadySelected ? 'Remove label' : 'Add label';
      labelItem.disabled = rowIndex === null || !hot;
    }
    menu.hidden = false;
    const pos = getScatterEventPagePosition(evt);
    positionScatterPointContextMenu(menu, pos.x, pos.y);
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: scatter point context menu shown', { rowIndex, alreadySelected });
    }
  }

  function handleScatterPointContextMenu(evt){
    const target = evt?.currentTarget;
    const data = target?.__scatterPointData;
    if(!data){
      return;
    }
    try{ evt.preventDefault(); }catch(e){}
    try{ evt.stopPropagation(); }catch(e){}
    hideScatterTooltip('context-menu');
    showScatterPointContextMenu(evt, data);
  }

  function bindScatterPlotContextMenuSuppression(node){
    if(!node || node.__scatterContextMenuSuppressionBound){
      return;
    }
    node.__scatterContextMenuSuppressionBound = true;
    node.addEventListener('contextmenu', evt => {
      const target = evt?.target;
      if(isScatterContextMenuEventSuppressed(target)){
        return;
      }
      try{ evt.preventDefault(); }catch(e){}
    }, true);
  }

  function attachScatterPointTooltip(el, data){
    if(!el || !data){ return; }
    el.__scatterPointData = data;
    el.addEventListener('mouseenter', handleScatterPointEnter);
    el.addEventListener('mousemove', handleScatterPointMove);
    el.addEventListener('mouseleave', handleScatterPointLeave);
    el.addEventListener('click', handleScatterPointClick);
    el.addEventListener('contextmenu', handleScatterPointContextMenu);
  }

  function handleScatterPointClick(evt){
    const target = evt?.currentTarget;
    if(!target){ return; }
    try{ evt.stopPropagation(); }catch(e){}
    showScatterFormatControls(target);
  }

  function showScatterFormatControls(target){
    const doc = global.document;
    if(!doc){ return; }
    try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
    const anchor = doc.getElementById('scatterFontHost');
    if(!anchor){ return; }
    let toolbarHost = anchor.nextElementSibling && anchor.nextElementSibling.classList && anchor.nextElementSibling.classList.contains('font-toolbar-host')
      ? anchor.nextElementSibling
      : null;
    if(!toolbarHost){
      toolbarHost = doc.createElement('div');
      toolbarHost.className = 'font-toolbar-host';
      toolbarHost.dataset.fontToolbarScope = 'scatter';
      toolbarHost.style.display = 'none';
      anchor.insertAdjacentElement('afterend', toolbarHost);
    }
    doc.querySelectorAll('.font-toolbar-host.font-toolbar-host--visible').forEach(h => {
      if(h !== toolbarHost){
        h.classList.remove('font-toolbar-host--visible');
        h.style.display = 'none';
      }
    });

    toolbarHost.innerHTML = '';
    const wrap = doc.createElement('div');
    wrap.className = 'workspace-toolbar__form workspace-toolbar__form--single scatter-format-controls';
    wrap.dataset.scatterControls = '1';

    const makeInput = (labelText, inputEl) => {
      const lbl = doc.createElement('label');
      lbl.className = 'workspace-toolbar__input workspace-toolbar__input--compact';
      const span = doc.createElement('span');
      span.className = 'workspace-toolbar__input-label';
      span.textContent = labelText;
      lbl.appendChild(span);
      lbl.appendChild(inputEl);
      return lbl;
    };

    const scatterFillInput = doc.getElementById('scatterFill');
    const scatterBorderInput = doc.getElementById('scatterBorder');
    const scatterBorderWidthInput = doc.getElementById('scatterBorderWidth');
    const scatterDotSizeInput = doc.getElementById('scatterDotSize');
    const scatterAlphaInput = doc.getElementById('scatterAlpha');
    const scatterAlphaVal = doc.getElementById('scatterAlphaVal');
    const scatterLabelKey = target?.__scatterPointData?.label || null;
    const labelStyle = scatterLabelKey ? scatterLabelStyles[scatterLabelKey] || {} : null;
    const resolveAlpha = value => {
      const clamped = clampScatterAlpha(value);
      return clamped != null ? clamped : null;
    };
    const labelAlpha = resolveAlpha(labelStyle?.alpha);
    const scopeName = `scatterScope_${Date.now()}`;
    const scopeField = doc.createElement('label');
    scopeField.className = 'workspace-toolbar__input workspace-toolbar__input--compact workspace-toolbar__input--scope';
    const scopeLabel = doc.createElement('span');
    scopeLabel.className = 'workspace-toolbar__input-label';
    scopeLabel.textContent = 'Scope';
    const scopeSelect = doc.createElement('select');
    scopeSelect.name = scopeName;
    scopeSelect.className = 'workspace-toolbar__select';
    const optLabel = doc.createElement('option');
    optLabel.value = 'label';
    optLabel.textContent = 'Label';
    optLabel.disabled = !scatterLabelKey;
    const optGlobal = doc.createElement('option');
    optGlobal.value = 'global';
    optGlobal.textContent = 'Global';
    scopeSelect.appendChild(optLabel);
    scopeSelect.appendChild(optGlobal);
    scopeSelect.value = scatterLabelKey ? 'label' : 'global';
    scopeField.appendChild(scopeLabel);
    scopeField.appendChild(scopeSelect);
    wrap.appendChild(scopeField);

    const applyAndDispatch = (inputEl, value, type = 'input') => {
      if(!inputEl){ return; }
      inputEl.value = value;
      inputEl.dispatchEvent(new Event(type, { bubbles: true }));
    };
    const useLabelScope = () => scopeSelect.value === 'label' && !!scatterLabelKey;
    const ensureLabelStyle = () => {
      if(!scatterLabelKey){ return null; }
      const existing = scatterLabelStyles[scatterLabelKey];
      if(existing && typeof existing === 'object'){
        return existing;
      }
      scatterLabelStyles[scatterLabelKey] = {};
      return scatterLabelStyles[scatterLabelKey];
    };
    const applyLabelStylePatch = patch => {
      const style = ensureLabelStyle();
      if(!style){ return; }
      Object.assign(style, patch);
      scheduleDrawScatter();
    };
    const applyGlobalStylePatch = (key, value) => {
      Object.keys(scatterLabelStyles).forEach(k => {
        scatterLabelStyles[k] = Object.assign({}, scatterLabelStyles[k], { [key]: value });
      });
      scheduleDrawScatter();
    };
    const applyGlobalColor = value => {
      if(scatterFillInput){
        applyAndDispatch(scatterFillInput, value);
      }
      Object.keys(scatterLabelColors).forEach(k => { scatterLabelColors[k] = value; });
      scheduleDrawScatter();
    };

    // Fill color
    const colorInput = doc.createElement('input');
    colorInput.type = 'color';
    const targetFill = target.getAttribute('fill');
    const targetStroke = target.getAttribute('stroke');
    const labelColor = scatterLabelKey ? scatterLabelColors[scatterLabelKey] : null;
    const resolvedFill =
      (targetFill && targetFill !== 'none' ? targetFill : null)
      || (labelColor || null)
      || (targetStroke && targetStroke !== 'none' ? targetStroke : null)
      || (scatterFillInput?.value || null)
      || '#377eb8';
    if(scatterFillInput && resolvedFill){
      try{ scatterFillInput.value = resolvedFill; }catch(e){}
    }
    try{ colorInput.value = resolvedFill; }catch(e){}
    colorInput.addEventListener('input', () => {
      const nextColor = colorInput.value;
      if(useLabelScope() && scatterLabelKey){
        const prev = scatterLabelColors[scatterLabelKey] || '';
        scatterLabelColors[scatterLabelKey] = nextColor;
        target.setAttribute('fill', nextColor);
        if(prev !== nextColor){
          scheduleDrawScatter();
        }
      }else{
        applyGlobalColor(nextColor);
      }
    });
    if(chartStyle?.normalizeColorInput){
      try{ chartStyle.normalizeColorInput(colorInput, { reason: 'scatter.point.format-color' }); }catch(e){}
    }
    if(typeof Shared.openColorPicker === 'function'){
      colorInput.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const enableShapePicker = scatterCurrentGraphType === 'scatter' && scatterState?.viewMode !== 'bubble' && Array.isArray(SCATTER_SHAPE_OPTIONS) && SCATTER_SHAPE_OPTIONS.length > 0;
        const sanitizeCurrentShape = (shape, index = 0) => {
          if(SCATTER_SHAPE_VALUES.has(shape)){
            return shape;
          }
          const safeIndex = Number.isInteger(index) ? index : 0;
          return SCATTER_SHAPE_DEFAULTS[safeIndex % SCATTER_SHAPE_DEFAULTS.length] || 'circle';
        };
        const openWithShape = (shapeValue, onShapeChange) => {
          Shared.openColorPicker({
            anchor: colorInput,
            color: colorInput.value,
            element: colorInput,
            shapePicker: enableShapePicker ? {
              value: shapeValue,
              options: SCATTER_SHAPE_OPTIONS,
              onChange: onShapeChange
            } : null,
            onInput(value){
              colorInput.value = value;
              colorInput.dispatchEvent(new Event('input', { bubbles: true }));
            },
            onChange(value){
              colorInput.value = value;
              colorInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        };

        if(useLabelScope() && scatterLabelKey){
          const labelIndex = 0;
          let previousShape = sanitizeCurrentShape(scatterLabelShapes[scatterLabelKey], labelIndex);
          openWithShape(previousShape, (nextShape) => {
            const sanitized = sanitizeCurrentShape(nextShape, labelIndex);
            if(sanitized === previousShape){
              return;
            }
            scatterLabelShapes[scatterLabelKey] = sanitized;
            scheduleDrawScatter();
            previousShape = sanitized;
          });
          return;
        }

        if(!enableShapePicker){
          openWithShape(null, null);
          return;
        }

        const shapeKeys = Object.keys(scatterLabelShapes || {});
        const unique = new Set(shapeKeys.map((key, idx) => sanitizeCurrentShape(scatterLabelShapes[key], idx)));
        let initialShape = null;
        if(unique.size === 1){
          initialShape = unique.values().next().value;
        }
        openWithShape(initialShape, (nextShape) => {
          const sanitized = sanitizeCurrentShape(nextShape, 0);
          let changed = false;
          shapeKeys.forEach((key, idx) => {
            if(sanitizeCurrentShape(scatterLabelShapes[key], idx) !== sanitized){
              scatterLabelShapes[key] = sanitized;
              changed = true;
            }
          });
          if(changed){
            scheduleDrawScatter();
          }
        });
      });
    }
    const colorLabel = makeInput('Color', colorInput);
    colorLabel.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(colorLabel);

    // Border color
    const borderInput = doc.createElement('input');
    borderInput.type = 'color';
    const resolvedBorder =
      (targetStroke && targetStroke !== 'none' ? targetStroke : null)
      || (labelStyle?.borderColor || null)
      || (scatterBorderInput?.value || null)
      || '#000000';
    if(scatterBorderInput && resolvedBorder){
      try{ scatterBorderInput.value = resolvedBorder; }catch(e){}
    }
    try{ borderInput.value = resolvedBorder; }catch(e){}
    borderInput.addEventListener('input', () => {
      const next = borderInput.value;
      if(useLabelScope() && scatterLabelKey){
        applyLabelStylePatch({ borderColor: next });
      }else if(scatterBorderInput){
        applyAndDispatch(scatterBorderInput, next);
        Object.keys(scatterLabelStyles).forEach(k => {
          scatterLabelStyles[k] = Object.assign({}, scatterLabelStyles[k], { borderColor: next });
        });
        scheduleDrawScatter();
      }
    });
    if(typeof Shared.attachColorPickerNear === 'function'){
      try{ Shared.attachColorPickerNear(borderInput); }catch(e){}
    }
    const borderLabel = makeInput('Border', borderInput);
    borderLabel.classList.add('workspace-toolbar__input--color');
    wrap.appendChild(borderLabel);

    // Border width
    const borderWidthInput = doc.createElement('input');
    borderWidthInput.type = 'number';
    borderWidthInput.min = '0';
    borderWidthInput.step = '0.5';
    const resolvedBorderWidth = Number.isFinite(Number(scatterBorderWidthInput?.value))
      ? Number(scatterBorderWidthInput.value)
      : Number(target.getAttribute('stroke-width'));
    if(Number.isFinite(resolvedBorderWidth)){
      borderWidthInput.value = String(resolvedBorderWidth);
    }
    borderWidthInput.addEventListener('input', () => {
      const numeric = Number(borderWidthInput.value);
      const next = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
      if(useLabelScope() && scatterLabelKey){
        applyLabelStylePatch({ borderWidth: next });
      }else{
        if(scatterBorderWidthInput){
          applyAndDispatch(scatterBorderWidthInput, String(next));
        }
        applyGlobalStylePatch('borderWidth', next);
      }
    });
    wrap.appendChild(makeInput('Border', borderWidthInput));

    // Size
    const sizeInput = doc.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '0';
    sizeInput.step = '0.5';
    const derivedSize = Number.isFinite(Number(scatterDotSizeInput?.value))
      ? Number(scatterDotSizeInput.value)
      : Number(target.getAttribute('r'));
    if(Number.isFinite(derivedSize)){
      sizeInput.value = String(derivedSize);
    }
    sizeInput.addEventListener('input', () => {
      const numeric = Number(sizeInput.value);
      const next = Number.isFinite(numeric) ? Math.max(0, numeric) : null;
      if(useLabelScope() && scatterLabelKey){
        if(next != null){
          applyLabelStylePatch({ size: next });
        }
      }else{
        if(scatterDotSizeInput && next != null){
          applyAndDispatch(scatterDotSizeInput, String(next));
        }
        if(next != null){
          applyGlobalStylePatch('size', next);
        }
      }
    });
    wrap.appendChild(makeInput('Size', sizeInput));

    // Transparency slider: 0 = opaque, 100 = fully transparent
    const opacityInput = doc.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = '0';
    opacityInput.max = '100';
    opacityInput.step = '1';
    const currentAlpha = labelAlpha != null ? labelAlpha : resolveAlpha(scatterAlphaInput?.value);
    if(scatterAlphaInput && currentAlpha != null){
      scatterAlphaInput.value = String(currentAlpha);
      if(scatterAlphaVal){
        scatterAlphaVal.textContent = String(currentAlpha);
      }
    }
    const resolvedTransparencyPct = Number.isFinite(currentAlpha) ? Math.round(currentAlpha * 100) : 0;
    opacityInput.value = String(resolvedTransparencyPct);
    const opacityValue = doc.createElement('span');
    opacityValue.className = 'workspace-toolbar__input-value';
    opacityValue.textContent = `${opacityInput.value}%`;
    opacityInput.addEventListener('input', () => {
      const pct = Number(opacityInput.value);
      const bounded = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      const transparency = bounded / 100;
      const normalized = transparency; // normalized transparency (0..1)
      if(useLabelScope() && scatterLabelKey){
        applyLabelStylePatch({ alpha: normalized });
      }else{
        if(scatterAlphaInput){
          applyAndDispatch(scatterAlphaInput, String(normalized));
        }
        if(scatterAlphaVal){
          scatterAlphaVal.textContent = String(normalized);
        }
        applyGlobalStylePatch('alpha', normalized);
      }
      opacityValue.textContent = `${Math.round(bounded)}%`;
    });
    const opacityWrap = doc.createElement('div');
    opacityWrap.style.display = 'inline-flex';
    opacityWrap.style.alignItems = 'center';
    opacityWrap.appendChild(opacityInput);
    opacityWrap.appendChild(opacityValue);
    wrap.appendChild(makeInput('Transparency', opacityWrap));

    toolbarHost.appendChild(wrap);
    toolbarHost.style.display = 'block';
    toolbarHost.classList.add('font-toolbar-host--visible');
    const dock = toolbarHost.closest('.workspace-toolbar__dock');
    if(dock){ dock.classList.add('workspace-toolbar__dock--active'); }

    try{
      if(toolbarHost.__scatterDocClickHandler){
        document.removeEventListener('click', toolbarHost.__scatterDocClickHandler);
        toolbarHost.__scatterDocClickHandler = null;
      }
      const onDocClick = function(evt){
        try{
          const tgt = evt && evt.target ? evt.target : null;
          if(!tgt){ return; }
          if(toolbarHost.contains(tgt)){ return; }
          if(tgt.closest && tgt.closest('.shared-color-picker')){ return; }
          toolbarHost.classList.remove('font-toolbar-host--visible');
          toolbarHost.style.display = 'none';
          try{ if(typeof Shared.hideAllFormatControls === 'function') Shared.hideAllFormatControls(); }catch(e){}
          const d = toolbarHost.closest('.workspace-toolbar__dock');
          if(d){ d.classList.remove('workspace-toolbar__dock--active'); }
          document.removeEventListener('click', onDocClick);
          toolbarHost.__scatterDocClickHandler = null;
        }catch(err){ console.warn('scatter.format docClick error', err); }
      };
      document.addEventListener('click', onDocClick);
      toolbarHost.__scatterDocClickHandler = onDocClick;
    }catch(err){ console.warn('attach doc click for scatter format controls failed', err); }
  }

  function attachScatterSelectAutoSize(select, label){
    if(!select){ return; }
    const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const watcher = typeof formControls.watchSelectAutoSize === 'function' ? formControls.watchSelectAutoSize : null;
    const autoSizer = typeof formControls.autoSizeSelect === 'function' ? formControls.autoSizeSelect : null;
    try{
      if(watcher){
        watcher(select);
        if(debugEnabled){
          console.debug('Debug: scatter select auto-size watcher attached', {
            id: select.id || null,
            label: label || null
          });
        }
      }else if(autoSizer){
        autoSizer(select);
        if(debugEnabled){
          console.debug('Debug: scatter select auto-size applied without watcher', {
            id: select.id || null,
            label: label || null
          });
        }
      }else if(debugEnabled){
        console.debug('Debug: scatter select auto-size helper unavailable', {
          id: select.id || null,
          label: label || null
        });
      }
    }catch(err){
      if(debugEnabled){
        console.debug('Debug: scatter select auto-size attach error', {
          id: select.id || null,
          label: label || null,
          error: err?.message || String(err)
        });
      }
    }
  }

  function createScatterAxisSettings(){
    return {
      strokeWidth: 1,
      color: DEFAULT_AXIS_COLOR,
      x: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto', brokenAxis: { enabled: false, segments: [] } },
      y: { tickInterval: null, minorTicks: false, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto', brokenAxis: { enabled: false, segments: [] } }
    };
  }

  function sanitizeScatterAxisNotation(value){
    if(value === 'decimal' || value === 'scientific'){ return value; }
    return 'auto';
  }

  let scatterAxisSettings = createScatterAxisSettings();

  function ensureScatterAxisSettings(){
    if(!scatterAxisSettings || typeof scatterAxisSettings !== 'object'){
      scatterAxisSettings = createScatterAxisSettings();
    }
    if(!scatterAxisSettings.x || typeof scatterAxisSettings.x !== 'object'){
      scatterAxisSettings.x = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto', brokenAxis: { enabled: false, segments: [] } };
    }
    if(!scatterAxisSettings.y || typeof scatterAxisSettings.y !== 'object'){
      scatterAxisSettings.y = { tickInterval: null, minorTickSubdivisions: DEFAULT_MINOR_TICK_SUBDIVISIONS, notation: 'auto', brokenAxis: { enabled: false, segments: [] } };
    }
    if(typeof scatterAxisSettings.x.minorTicks !== 'boolean'){
      scatterAxisSettings.x.minorTicks = false;
    }
    if(typeof scatterAxisSettings.y.minorTicks !== 'boolean'){
      scatterAxisSettings.y.minorTicks = false;
    }
    if(!scatterAxisSettings.x.brokenAxis || typeof scatterAxisSettings.x.brokenAxis !== 'object'){
      scatterAxisSettings.x.brokenAxis = { enabled: false, segments: [] };
    }
    if(typeof scatterAxisSettings.x.brokenAxis.enabled !== 'boolean'){
      scatterAxisSettings.x.brokenAxis.enabled = false;
    }
    if(!Array.isArray(scatterAxisSettings.x.brokenAxis.segments)){
      scatterAxisSettings.x.brokenAxis.segments = [];
    }
    if(!scatterAxisSettings.y.brokenAxis || typeof scatterAxisSettings.y.brokenAxis !== 'object'){
      scatterAxisSettings.y.brokenAxis = { enabled: false, segments: [] };
    }
    if(typeof scatterAxisSettings.y.brokenAxis.enabled !== 'boolean'){
      scatterAxisSettings.y.brokenAxis.enabled = false;
    }
    if(!Array.isArray(scatterAxisSettings.y.brokenAxis.segments)){
      scatterAxisSettings.y.brokenAxis.segments = [];
    }
    scatterAxisSettings.x.minorTickSubdivisions = clampMinorTickSubdivisions(scatterAxisSettings.x.minorTickSubdivisions);
    scatterAxisSettings.y.minorTickSubdivisions = clampMinorTickSubdivisions(scatterAxisSettings.y.minorTickSubdivisions);
    const strokeNumeric = Number(scatterAxisSettings.strokeWidth);
    scatterAxisSettings.strokeWidth = Number.isFinite(strokeNumeric) && strokeNumeric > 0 ? strokeNumeric : 1;
    if(typeof scatterAxisSettings.color !== 'string' || !scatterAxisSettings.color){
      scatterAxisSettings.color = DEFAULT_AXIS_COLOR;
    }
    scatterAxisSettings.x.notation = sanitizeScatterAxisNotation(scatterAxisSettings.x.notation);
    scatterAxisSettings.y.notation = sanitizeScatterAxisNotation(scatterAxisSettings.y.notation);
    return scatterAxisSettings;
  }

  function getScatterAxisNotation(axis){
    if(axis !== 'x' && axis !== 'y'){ return 'auto'; }
    const settings = ensureScatterAxisSettings();
    return sanitizeScatterAxisNotation(settings[axis]?.notation);
  }

  function updateScatterAxisNotation(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureScatterAxisSettings();
    const nextValue = sanitizeScatterAxisNotation(value);
    if(settings[axis].notation === nextValue){ return; }
    settings[axis].notation = nextValue;
    console.debug('Debug: scatter axis notation updated',{ axis, notation: nextValue });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getScatterAxisTickInterval(axis){
    if(axis !== 'x' && axis !== 'y'){ return null; }
    const settings = ensureScatterAxisSettings();
    const raw = settings[axis]?.tickInterval;
    if(raw === null || raw === undefined || raw === ''){
      return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function updateScatterAxisTickInterval(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureScatterAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings[axis].tickInterval = null;
    } else {
      const numeric = Number(value);
      settings[axis].tickInterval = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    }
    console.debug('Debug: scatter axis tick interval updated',{ axis, tickInterval: settings[axis].tickInterval });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getScatterAxisMinorTicksEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureScatterAxisSettings();
    return !!settings[axis]?.minorTicks;
  }

  function updateScatterAxisMinorTicks(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureScatterAxisSettings();
    const nextValue = !!enabled;
    if(settings[axis].minorTicks === nextValue){
      return;
    }
    settings[axis].minorTicks = nextValue;
    console.debug('Debug: scatter minor ticks updated',{ axis, enabled: nextValue });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getScatterAxisMinorTickSubdivisions(axis){
    if(axis !== 'x' && axis !== 'y'){ return DEFAULT_MINOR_TICK_SUBDIVISIONS; }
    const settings = ensureScatterAxisSettings();
    return clampMinorTickSubdivisions(settings[axis]?.minorTickSubdivisions);
  }

  function updateScatterAxisMinorTickSubdivisions(axis, value){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureScatterAxisSettings();
    const nextValue = clampMinorTickSubdivisions(value);
    if(settings[axis].minorTickSubdivisions === nextValue){
      return;
    }
    settings[axis].minorTickSubdivisions = nextValue;
    console.debug('Debug: scatter minor tick subdivisions updated',{ axis, subdivisions: nextValue });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getScatterAxisStrokeWidth(){
    const settings = ensureScatterAxisSettings();
    return settings.strokeWidth;
  }

  function updateScatterAxisStrokeWidth(value){
    const settings = ensureScatterAxisSettings();
    if(value === null || value === undefined || value === ''){
      settings.strokeWidth = 1;
    } else {
      const numeric = Number(value);
      settings.strokeWidth = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
    }
    console.debug('Debug: scatter axis stroke width updated',{ strokeWidth: settings.strokeWidth });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getScatterAxisColor(){
    const settings = ensureScatterAxisSettings();
    return settings.color || DEFAULT_AXIS_COLOR;
  }

  function updateScatterAxisColor(value){
    const settings = ensureScatterAxisSettings();
    settings.color = typeof value === 'string' && value.trim() ? value : DEFAULT_AXIS_COLOR;
    console.debug('Debug: scatter axis color updated',{ color: settings.color });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function getBrokenAxisEnabled(axis){
    if(axis !== 'x' && axis !== 'y'){ return false; }
    const settings = ensureScatterAxisSettings();
    return !!settings[axis]?.brokenAxis?.enabled;
  }

  function updateBrokenAxisEnabled(axis, enabled){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureScatterAxisSettings();
    const previousValue = !!settings[axis].brokenAxis.enabled;
    settings[axis].brokenAxis.enabled = !!enabled;
    console.debug('Debug: scatter broken axis enabled updated',{ axis, enabled: settings[axis].brokenAxis.enabled });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
    return previousValue;
  }

  function getBrokenAxisSegments(axis){
    if(axis !== 'x' && axis !== 'y'){ return []; }
    const settings = ensureScatterAxisSettings();
    return settings[axis]?.brokenAxis?.segments || [];
  }

  function updateBrokenAxisSegments(axis, segments){
    if(axis !== 'x' && axis !== 'y'){ return; }
    const settings = ensureScatterAxisSettings();
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
    console.debug('Debug: scatter broken axis segments updated',{ axis, segments: settings[axis].brokenAxis.segments });
    if(typeof scheduleDrawScatter === 'function'){
      scheduleDrawScatter();
    }
  }

  function applyScatterAxisSettings(settings){
    const base = createScatterAxisSettings();
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
      base.x.minorTicks = !!(settings.minorTicksX ?? settings.x?.minorTicks ?? false);
      base.y.minorTicks = !!(settings.minorTicksY ?? settings.y?.minorTicks ?? false);
      const xMinorSubdiv = settings.minorTickSubdivisionsX ?? settings.minorSubdivisionsX ?? settings.x?.minorTickSubdivisions ?? settings.x?.minorSubdivisions ?? null;
      const yMinorSubdiv = settings.minorTickSubdivisionsY ?? settings.minorSubdivisionsY ?? settings.y?.minorTickSubdivisions ?? settings.y?.minorSubdivisions ?? null;
      base.x.minorTickSubdivisions = clampMinorTickSubdivisions(xMinorSubdiv);
      base.y.minorTickSubdivisions = clampMinorTickSubdivisions(yMinorSubdiv);
      const xNotation = settings.axisNotationX ?? settings.notationX ?? settings?.x?.notation ?? 'auto';
      const yNotation = settings.axisNotationY ?? settings.notationY ?? settings?.y?.notation ?? 'auto';
      base.x.notation = sanitizeScatterAxisNotation(xNotation);
      base.y.notation = sanitizeScatterAxisNotation(yNotation);
      if(settings.brokenAxis){
        if(settings.brokenAxis.x){
          base.x.brokenAxis = {
            enabled: !!settings.brokenAxis.x.enabled,
            segments: Array.isArray(settings.brokenAxis.x.segments)
              ? settings.brokenAxis.x.segments.filter(seg =>
                  seg &&
                  Number.isFinite(seg.start) &&
                  Number.isFinite(seg.end) &&
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
                  seg &&
                  Number.isFinite(seg.start) &&
                  Number.isFinite(seg.end) &&
                  seg.start < seg.end
                ).map(seg => ({ start: Number(seg.start), end: Number(seg.end) }))
              : []
          };
        }
      }
    }
    scatterAxisSettings = base;
    ensureScatterAxisSettings();
    console.debug('Debug: scatter axis settings applied',{ settings: scatterAxisSettings });
  }

  function clampScatterTickTarget(value){
    const axisTicks = chartStyle.axisTicks;
    if(axisTicks && typeof axisTicks.clampTickTarget === 'function'){
      return axisTicks.clampTickTarget(value);
    }
    if(!Number.isFinite(value)){
      return 6;
    }
    const rounded = Math.round(value);
    return Math.max(5, Math.min(8, rounded));
  }

  function buildScatterScale(options){
    const axisTicks = chartStyle.axisTicks;
    if(axisTicks && typeof axisTicks.buildScale === 'function'){
      const scale = axisTicks.buildScale(options);
      scatterDebug('Debug: scatter scale computed', {
        ...options,
        tickCount: Array.isArray(scale?.ticks) ? scale.ticks.length : null,
        step: scale?.step,
        min: scale?.min,
        max: scale?.max
      });
      return scale;
    }
    scatterDebug('Debug: scatter scale fallback invoked', { reason: 'missing axis tick helpers' });
    return {
      min: Number.isFinite(options?.manualMin) ? options.manualMin : Number(options?.dataMin) || 0,
      max: Number.isFinite(options?.manualMax) ? options.manualMax : Number(options?.dataMax) || 1,
      ticks: [Number(options?.manualMin) || 0, Number(options?.manualMax) || 1],
      step: Number(options?.fixedStep) || 1
    };
  }

  function computeBrokenAxisScale(config){
    const { dataMin, dataMax, segments, plotLength, orientation } = config;
    const isHorizontal = orientation === 'horizontal';

    if(!Array.isArray(segments) || segments.length === 0){
      return {
        isBroken: false,
        min: dataMin,
        max: dataMax,
        valueToPixel: (value, basePos, plotLen) => {
          const range = dataMax - dataMin || 1;
          if(isHorizontal){
            return basePos + plotLen * ((value - dataMin) / range);
          }
          return basePos + plotLen * (1 - (value - dataMin) / range);
        },
        segments: []
      };
    }

    const validSegments = segments
      .filter(seg => Number.isFinite(seg.start) && Number.isFinite(seg.end) && seg.start < seg.end)
      .sort((a, b) => a.start - b.start);

    if(validSegments.length === 0){
      return {
        isBroken: false,
        min: dataMin,
        max: dataMax,
        valueToPixel: (value, basePos, plotLen) => {
          const range = dataMax - dataMin || 1;
          if(isHorizontal){
            return basePos + plotLen * ((value - dataMin) / range);
          }
          return basePos + plotLen * (1 - (value - dataMin) / range);
        },
        segments: []
      };
    }

    const mergedSegments = [];
    let current = { ...validSegments[0] };
    for(let i = 1; i < validSegments.length; i++){
      const seg = validSegments[i];
      if(seg.start <= current.end){
        current.end = Math.max(current.end, seg.end);
      }else{
        mergedSegments.push(current);
        current = { ...seg };
      }
    }
    mergedSegments.push(current);

    const totalDataRange = mergedSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    const gapSizePx = BROKEN_AXIS_GAP_SIZE_PX;
    const numGaps = mergedSegments.length - 1;
    const totalGapLength = numGaps * gapSizePx;
    const availableLength = plotLength - totalGapLength;

    const segmentMeta = mergedSegments.map(seg => {
      const dataRange = seg.end - seg.start;
      const lengthPx = (dataRange / totalDataRange) * availableLength;
      return {
        start: seg.start,
        end: seg.end,
        dataRange,
        lengthPx,
        pixelStart: 0,
        pixelEnd: 0
      };
    });

    let currentPixel = 0;
    for(let i = 0; i < segmentMeta.length; i++){
      segmentMeta[i].pixelStart = currentPixel;
      segmentMeta[i].pixelEnd = currentPixel + segmentMeta[i].lengthPx;
      currentPixel = segmentMeta[i].pixelEnd + gapSizePx;
    }

    const valueToPixel = (value, basePos, plotLen) => {
      const mapPixel = pixel => {
        if(isHorizontal){
          return basePos + pixel;
        }
        return basePos + plotLen - pixel;
      };

      for(let i = 0; i < segmentMeta.length; i++){
        const seg = segmentMeta[i];
        if(value >= seg.start && value <= seg.end){
          const fraction = seg.dataRange > 0 ? (value - seg.start) / seg.dataRange : 0;
          const pixelInSegment = seg.pixelStart + fraction * seg.lengthPx;
          return mapPixel(pixelInSegment);
        }
      }

      if(value < segmentMeta[0].start){
        return mapPixel(segmentMeta[0].pixelStart);
      }
      if(value > segmentMeta[segmentMeta.length - 1].end){
        return mapPixel(segmentMeta[segmentMeta.length - 1].pixelEnd);
      }

      for(let i = 0; i < segmentMeta.length - 1; i++){
        if(value > segmentMeta[i].end && value < segmentMeta[i + 1].start){
          return mapPixel(segmentMeta[i].pixelEnd);
        }
      }

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

  let scheduleDrawScatter = () => {};
  let scheduleDrawScatterRaw = () => {};
  let scatterAutoDrawManager = null;
  let scatterCurrentGraphType='scatter';
  let scatterLastGraphType='scatter';
  let scatterLastRegressionSummary=null;
  const scatterAdvisorState={
    open:false,
    activated:false,
    answers:{},
    lastApplied:null,
    context:null
  };
  const scatterOverlayController = Shared.loadingOverlay?.createPendingController?.({
    component: 'scatter',
    message: 'Rendering scatter plot...',
    getHost: () => (
      global.document?.getElementById?.('scatterGraphPanel')?.querySelector?.('.svgbox')
      || global.document?.getElementById?.('scatterGraphPanel')
    )
  });

  function markScatterOverlayPending(reason){
    scatterOverlayController?.markPending(reason);
    scatterDebug('Debug: scatter overlay pending flagged', { reason: reason || 'data-change' });
  }

  function queueScatterOverlay(reason, options = {}){
    return scatterOverlayController?.queue(reason, options) || false;
  }

  function resolveScatterOverlay(reason){
    scatterOverlayController?.resolve(reason);
  }

  function forceScatterOverlay(reason, options = {}){
    return scatterOverlayController?.force(reason, options) || false;
  }

  function formatP(p){
    if(p === undefined || p === null || Number.isNaN(p)) return 'n/a';
    if(!Number.isFinite(p)) return p > 0 ? 'Infinity' : '-Infinity';
    if(typeof Shared?.formatPValue === 'function'){
      return Shared.formatPValue(p);
    }
    if(p === 0) return '0';
    return Number(p).toExponential(5);
  }
  function setup(){
    if(scatter.ready){ console.debug('Debug: Components.scatter.setup skipped'); return; }
    console.debug('Debug: Components.scatter.setup start');
    scheduleDrawScatter = () => {};
    ensureScatterAxisSettings();
    const $ = global.$;
    const document = global.document;
    if(!document || typeof Shared?.hot?.createStandardTable !== 'function'){
      console.error('Table factory missing for scatter component');
      return;
    }
    const makeEditableLocal = (el,onChange,options) => {
      const fn = Shared.makeEditable || global.makeEditable;
      if (typeof fn === 'function') {
        return fn(el,onChange,options);
      }
      console.warn('scatter component makeEditable fallback missing');
      return undefined;
    };
    const ensureGraphViewport = Shared.graphViewport?.createEnsurer
      ? Shared.graphViewport.createEnsurer('scatter')
      : (svg, options = {}) => {
        const fn = Shared.ensureGraphViewport || Shared.autoResizeSvg || global.ensureGraphViewport || global.autoResizeSvg;
        if(typeof fn === 'function'){
          fn(svg, { component: 'scatter', debugLabel: 'scatter-viewport-fallback', ...options });
          return;
        }
        console.debug('Debug: scatter ensureGraphViewport helper missing', {
          hasShared: !!Shared,
          hasAutoResize: typeof Shared?.autoResizeSvg === 'function'
        });
      };
    console.debug('Debug: scatter graph viewport helper configured', {
      hasGraphViewport: typeof Shared.graphViewport?.ensure === 'function',
      usesFactory: typeof Shared.graphViewport?.createEnsurer === 'function'
    });
    const serializeSvg = (svgEl, options)=>{
      const fn = Shared.serializeCleanSVG || global.serializeCleanSVG;
      if (typeof fn === 'function') {
        return fn(svgEl, options);
      }
      if (!svgEl) return '';
      const serializer = new (global.XMLSerializer||XMLSerializer)();
      return serializer.serializeToString(svgEl);
    };
    const renderStatsCard=(target,model)=>{
      if(!target) return;
      const hasRenderer=Shared.statsTable && typeof Shared.statsTable.render==='function';
      if(hasRenderer){
        Shared.statsTable.render({ target, ...model });
        console.debug('Debug: scatter renderStatsCard shared',{ caption:model.caption || null, rows:model.rows?.length || 0 });
        return;
      }
      target.innerHTML='';
      if(model.caption){
        const lead=document.createElement('div');
        lead.className='stats-table-lead';
        lead.textContent=model.caption;
        target.appendChild(lead);
      }
      const table=document.createElement('table');
      const thead=document.createElement('thead');
      const headRow=document.createElement('tr');
      (model.columns||[]).forEach(col=>{
        const th=document.createElement('th');
        th.textContent=col.label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody=document.createElement('tbody');
      (model.rows||[]).forEach(row=>{
        const tr=document.createElement('tr');
        (model.columns||[]).forEach(col=>{
          const td=document.createElement('td');
          const value=row?.[col.key];
          td.textContent=value ?? '';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      target.appendChild(table);
      console.debug('Debug: scatter renderStatsCard fallback',{ caption:model.caption || null, rows:model.rows?.length || 0 });
    };
    const formatMetricValue = (value, digits = 4) => Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
    console.debug('Debug: scatter component DOM helpers resolved', {
      hasSharedEditable: typeof Shared.makeEditable === 'function',
      hasSharedResize: typeof Shared.autoResizeSvg === 'function',
      hasSharedSerialize: typeof Shared.serializeCleanSVG === 'function'
    }); // Debug: helper availability summary
    const markFontEditable = (node, role, key) => {
      if (!node) { return; }
      const payload = { role: role || null, key: key || role || null, text: node?.textContent || null };
      if (fontControls && typeof fontControls.markText === 'function') {
        fontControls.markText(node, { scopeId: 'scatter', role, key });
      } else if (node.dataset) {
        node.dataset.fontEditable = '1';
        node.dataset.fontScope = 'scatter';
        if (role) node.dataset.fontRole = role;
        if (key || role) node.dataset.fontKey = key || role;
      }
      if (!role || role.indexOf('Tick') === -1) {
        console.debug('Debug: scatter markFontEditable', payload); // Debug: font target tagging summary
      }
    };
  let scatterDrawToken=0;
  let scatterHot = null;
  let scatterRenderRowEl = null;
  let scatterRenderButtonEl = null;
  let scatterAutoDrawNoticeEl = null;
  let scatterLegendChangeInternal = false;
      // Scatter plot setup
      const scatterHotContainer=document.getElementById('scatterHot');
      const scatterHotWrapper=document.getElementById('scatterHotWrapper');
      const scatterTablePanel=document.getElementById('scatterTablePanel');
      const scatterGraphPanel=document.getElementById('scatterGraphPanel');
      const scatterPanelResizer=document.getElementById('scatterPanelResizer');
      let scatterSvgBox=scatterGraphPanel?.querySelector('.svgbox');
      bindScatterPlotContextMenuSuppression(scatterSvgBox);
      const scatterConfigPanel=scatterGraphPanel?.querySelector('.config-options');
      scatterRenderRowEl=document.getElementById('scatterRenderRow');
      scatterRenderButtonEl=document.getElementById('scatterRenderButton');
      scatterAutoDrawNoticeEl=document.getElementById('scatterAutoDrawNotice');
      let scatterNoticeBoundWidth=null;
      const syncScatterAutoDrawNoticeWidth=(reason)=>{
        const svgBox=scatterSvgBox||scatterGraphPanel?.querySelector?.('.svgbox');
        const renderRow=scatterRenderRowEl||document.getElementById('scatterRenderRow');
        if(!svgBox||!renderRow){
          return;
        }
        const rect=svgBox.getBoundingClientRect?.();
        const width=Math.round(rect?.width||svgBox.clientWidth||svgBox.offsetWidth||0);
        if(!width){
          return;
        }
        const widthPx=`${width}px`;
        if(renderRow.style.maxWidth!==widthPx){
          renderRow.style.maxWidth=widthPx;
          renderRow.style.width='100%';
        }
        if(scatterAutoDrawNoticeEl&&scatterAutoDrawNoticeEl.style.maxWidth!==widthPx){
          scatterAutoDrawNoticeEl.style.maxWidth=widthPx;
        }
        if(scatterNoticeBoundWidth!==width){
          scatterNoticeBoundWidth=width;
          scatterDebug('Debug: scatter auto draw notice width synced',{ width, reason: reason || null });
        }
      };
      const scheduleScatterNoticeWidth=(()=>{
        if(typeof Shared.debounceFrame==='function'){
          let lastReason='frame';
          const debounced=Shared.debounceFrame(()=>syncScatterAutoDrawNoticeWidth(lastReason));
          return reason=>{
            lastReason=reason||'frame';
            debounced();
          };
        }
        return reason=>syncScatterAutoDrawNoticeWidth(reason||'immediate');
      })();
      if(scatterRenderButtonEl){
        scatterRenderButtonEl.addEventListener('click', () => {
          scatterDebug('Debug: scatter manual render button');
          if(!scatterAutoDrawState.autoDrawEnabled){
            scatterThresholdSelectionPending = false;
          }
          const overlayReason = 'manual-render';
          markScatterOverlayPending(overlayReason);
          forceScatterOverlay(overlayReason, { message: 'Rendering scatter plot...' });
          scheduleDrawScatter({ force: true, reason: 'manual-render' });
        });
      }
      if(!scatterAutoDrawManager && Shared.hot?.createAutoDrawManager){
        scatterAutoDrawManager = Shared.hot.createAutoDrawManager({
          component: 'scatter',
          state: scatterAutoDrawState,
          thresholds: {
            rows: SCATTER_AUTO_DRAW_ROW_THRESHOLD,
            cols: SCATTER_AUTO_DRAW_COL_THRESHOLD,
            cells: SCATTER_AUTO_DRAW_CELL_THRESHOLD
          },
          getHot: () => scatterHot || (typeof ensureScatterHotForActiveTab === 'function' ? ensureScatterHotForActiveTab() : null),
          elements: {
            renderRow: () => scatterRenderRowEl,
            renderButton: () => scatterRenderButtonEl,
            notice: () => scatterAutoDrawNoticeEl
          },
          debugLog: scatterDebug
        });
      }
      const scatterShowLegend=$('#scatterShowLegend');
      const scatterLegendControl=scatterShowLegend?.closest('label')||null;
      const ensureScatterLegendTrayPlacement=()=>{
        if(!scatterLegendControl){
          return;
        }
        const hostBox=scatterSvgBox||scatterGraphPanel?.querySelector?.('.svgbox');
        if(!hostBox){
          return;
        }
        let tray=hostBox.querySelector('.resizer-control-tray');
        if(!tray){
          const doc=hostBox.ownerDocument||global.document;
          if(doc){
            tray=doc.createElement('div');
            tray.className='resizer-control-tray';
            hostBox.appendChild(tray);
            console.debug('Debug: scatter legend tray fallback created',{ trayChildren: tray.childElementCount });
          }
        }
        if(!tray){
          return;
        }
        if(scatterLegendControl.parentNode!==tray){
          tray.appendChild(scatterLegendControl);
          console.debug('Debug: scatter legend control moved',{ trayChildren: tray.childElementCount });
        }
        scatterLegendControl.classList.remove('config-panel__checkbox','config-panel__checkbox--inline');
        scatterLegendControl.classList.add('resizer-legend-control');
        if(!scatterLegendControl.title){
          scatterLegendControl.title='Toggle legend visibility';
        }
        if(scatterLegendControl.dataset){
          scatterLegendControl.dataset.scatterLegendTray='true';
        }
      };
      const scatterLayout = Shared.componentLayout?.createStandardPanels({
        componentName: 'scatter',
        selectors: {
          tablePanel: '#scatterTablePanel',
          graphPanel: '#scatterGraphPanel',
          configPanel: () => scatterGraphPanel?.querySelector('.config-panel') || scatterGraphPanel?.querySelector('.config-options'),
          panelResizer: '#scatterPanelResizer',
          hotWrapper: '#scatterHotWrapper',
          hotContainer: '#scatterHot',
          svgBox: () => scatterGraphPanel?.querySelector('.svgbox'),
          resizeTarget: () => scatterGraphPanel?.querySelector('.svgbox')
        },
        scheduleDraw: () => scheduleDrawScatter(),
        onAfterSync: () => syncScatterAutoDrawNoticeWidth('panel-sync'),
        resizableBoxOptions: {
          onResize: () => {
            console.debug('Debug: scatter layout onResize schedule trigger');
            scheduleScatterNoticeWidth('resize');
            scheduleDrawScatter({ viewOnly: true, reason: 'resize' });
          }
        }
      });
      if(scatterLayout?.elements?.svgBox){
        scatterSvgBox = scatterLayout.elements.svgBox;
        bindScatterPlotContextMenuSuppression(scatterSvgBox);
      }
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
      scatterLayout?.syncPanels?.();
      syncScatterAutoDrawNoticeWidth('init');
      if(scatterLegendControl){
        ensureScatterLegendTrayPlacement();
        const scheduleLegendPlacement=typeof Shared.debounceFrame==='function'
          ? Shared.debounceFrame(()=>ensureScatterLegendTrayPlacement())
          : null;
        if(scheduleLegendPlacement){
          scheduleLegendPlacement();
        }else if(typeof global.requestAnimationFrame==='function'){
          global.requestAnimationFrame(()=>ensureScatterLegendTrayPlacement());
        }
        if(scatterLayout && typeof scatterLayout.updateSvgBox==='function'){
          const originalUpdateSvgBox=scatterLayout.updateSvgBox.bind(scatterLayout);
          scatterLayout.updateSvgBox=node=>{
            originalUpdateSvgBox(node);
            if(node){
              scatterSvgBox=node;
            }else if(scatterLayout.elements?.svgBox){
              scatterSvgBox=scatterLayout.elements.svgBox;
            }
            bindScatterPlotContextMenuSuppression(scatterSvgBox);
            ensureScatterLegendTrayPlacement();
            scheduleScatterNoticeWidth('update-svgbox');
          };
        }
      }
      console.debug('Debug: scatter initHot using shared factory', { hasFactory: typeof Shared.hot?.createStandardTable === 'function' });
      if(typeof Shared.hot?.createStandardTable !== 'function'){
        console.error('scatter initHot missing Shared.hot.createStandardTable');
        return;
      }
      const data = Shared.createEmptyData(DEFAULT_ROWS, DEFAULT_COLS);
      if(Array.isArray(data?.[0]) && data[0].length > SCATTER_POINT_LABEL_COL){
        data[0][SCATTER_POINT_LABEL_COL] = SCATTER_POINT_LABEL_HEADER;
      }
      let scatterScheduleProxyCount = 0;
      const scheduleDrawScatterProxy = () => {
        scatterScheduleProxyCount += 1;
        if(scatterScheduleProxyCount <= 5){
          console.debug('Debug: scatter scheduleDraw proxy invoked', { count: scatterScheduleProxyCount }); // Debug: table change trigger
          if(scatterScheduleProxyCount === 5){
            console.debug('Debug: scatter scheduleDraw proxy suppressing further logs'); // Debug: proxy log suppression notice
          }
        }
        scheduleDrawScatter();
      };

        const createScatterTable = (container) => {
          let lastKeyDownAt = 0;
          let hotInstance = null;
          hotInstance = Shared.hot.createStandardTable(container,{ rows: DEFAULT_ROWS, cols: DEFAULT_COLS },scheduleDrawScatterProxy,{
          debugLabel: 'scatter',
          data,
          hotOptions: {
            beforeKeyDown(){
              lastKeyDownAt = Date.now();
            },
            afterSelectionEnd(r1, c1, r2, c2){
              const hot = hotInstance;
              if(!hot || typeof hot.setDataAtCell !== 'function'){
                return;
              }
              const now = Date.now();
              if(now - lastKeyDownAt < 80){
                return;
              }
              const fromRow = Math.min(r1, r2);
              const toRow = Math.max(r1, r2);
              const fromCol = Math.min(c1, c2);
              const toCol = Math.max(c1, c2);
              const layout = resolveScatterColumnLayout(hot.getData?.() || [], hot.countCols?.());
              const labelCol = Number.isInteger(layout?.pointLabelCol) ? layout.pointLabelCol : null;
              if(labelCol === null || fromCol !== labelCol || toCol !== labelCol){
                return;
              }
              if(toRow < 1){
                return;
              }
              const changes = [];
              for(let r = Math.max(1, fromRow); r <= toRow; r += 1){
                const current = typeof hot.getDataAtCell === 'function'
                  ? hot.getDataAtCell(r, labelCol)
                  : (hot.getData?.()?.[r]?.[labelCol]);
                const next = parseScatterPointLabelFlag(current) ? '' : SCATTER_POINT_LABEL_MARK;
                changes.push([r, labelCol, next]);
              }
              if(changes.length){
                hot.setDataAtCell(changes, 'point-label-toggle');
              }
            },
            afterChange(changes,source){
              if(!changes||source==='loadData') return;
              console.log('scatter afterChange', {count:changes.length, source});
              revalidateActiveScatterLogAxis('x','data-edit');
              revalidateActiveScatterLogAxis('y','data-edit');
            },
            afterUndo(){
              console.log('scatter undo');
            },
            afterRedo(){
              console.log('scatter redo');
            }
          }
        });
        if(hotInstance){
          scatterRefs.hot = hotInstance;
        }
        if(hotInstance && !hotInstance.__scatterSelectionListenerBound){
          let attempts = 0;
          const tryBind = () => {
            attempts += 1;
            const api = hotInstance?.gridApi;
            if(api && typeof api.addEventListener === 'function'){
              const handler = () => {
                if(scatterSelectionSyncInProgress){
                  return;
                }
                storeScatterRowSelection(hotInstance, 'row-selection');
                scheduleDrawScatter({ reason: 'row-selection' });
              };
              api.addEventListener('selectionChanged', handler);
              api.addEventListener('rowSelected', handler);
              hotInstance.__scatterSelectionListenerBound = true;
              if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
                console.debug('Debug: scatter selection listener bound');
              }
              return;
            }
            if(attempts < 10){
              setTimeout(tryBind, 120);
            }
          };
          setTimeout(tryBind, 0);
        }
        return hotInstance;
      };
      const ensureScatterHotForActiveTab = () => {
        const wrapper = scatterHotWrapper || document.getElementById('scatterHotWrapper');
        const baseContainer = scatterHotContainer || document.getElementById('scatterHot');
        if(typeof Shared.hot?.ensureTableForTab !== 'function' || !wrapper || !baseContainer){
          if(!scatterHot){
            scatterHot = createScatterTable(baseContainer);
          }
          const activeTabId = Shared.hot.resolveActiveTabId?.() || 'scatter-default';
          if(scatterHot){
            scatterHot.__scatterTabId = activeTabId;
            scheduleScatterSelectionRestore(scatterHot, activeTabId);
            scatterRefs.hot = scatterHot;
          }
          return scatterHot;
        }
        const entry = Shared.hot.ensureTableForTab({
          type: 'scatter',
          tabId: Shared.hot.resolveActiveTabId?.() || 'scatter-default',
          wrapper,
          container: baseContainer,
          createInstance: createScatterTable
        });
        if(entry?.instance){
          scatterHot = entry.instance;
          scatterRefs.hot = scatterHot;
        }
        const activeTabId = entry?.tabId || Shared.hot.resolveActiveTabId?.() || 'scatter-default';
        if(scatterHot){
          scatterHot.__scatterTabId = activeTabId;
          scheduleScatterSelectionRestore(scatterHot, activeTabId);
          scatterRefs.hot = scatterHot;
        }
        const tableImport = Shared.tableImport;
        if(tableImport?.handlePaste && entry?.container && !entry.container.__scatterPasteBound){
          entry.container.addEventListener('paste',async e=>{
            let forcedOverlay = false;
            try{
              forcedOverlay = !!forceScatterOverlay('table-paste-start', { message: 'Processing pasted data...' });
              await tableImport.handlePaste(e, scatterHot, {
                minCols: DEFAULT_COLS,
                minRows: DEFAULT_ROWS,
                scheduleDraw: () => {
                  markScatterOverlayPending('table-paste');
                  scheduleDrawScatter();
                },
                debugLabel: 'scatter'
              });
            }catch(err){
              if(forcedOverlay){
                resolveScatterOverlay('table-paste-error');
              }
              console.error('scatter paste failed', err);
            }
          }, true);
          entry.container.__scatterPasteBound = true;
        }
        return scatterHot;
      };
      scatterHot = ensureScatterHotForActiveTab();
      if(scatterHot){
        scatterRefs.hot = scatterHot;
      }
      scatter.__ensureHotForActiveTab = ensureScatterHotForActiveTab;
      if(typeof global.DEBUG_SCATTER === 'undefined') global.DEBUG_SCATTER = true;
      const scatterExamples={
        scatter:[
          ['Label','X Value','Y Value','',SCATTER_POINT_LABEL_HEADER],
          ['Cat',4.5,23,'',''],
          ['Dog',20,45,'',SCATTER_POINT_LABEL_MARK],
          ['Rabbit',2.5,35,'',''],
          ['Cat',5,25,'',''],
          ['Dog',22,50,'',''],
          ['Rabbit',3,40,'',''],
          ['Cat',4.8,24,'',''],
          ['Dog',24,55,'','']
        ],
        scatter3d:[
          ['Label','X Value','Y Value','Z Value',SCATTER_POINT_LABEL_HEADER],
          ['Orion',2.5,18,4.5,SCATTER_POINT_LABEL_MARK],
          ['Lyra',6.2,25,9.1,''],
          ['Cygnus',4.1,14,6.8,''],
          ['Andromeda',8.6,32,12.4,''],
          ['Cassiopeia',5.4,28,10.2,''],
          ['Phoenix',7.9,20,7.3,''],
          ['Delphinus',3.2,12,3.9,''],
          ['Vela',9.4,36,13.6,'']
        ],
        scatterBubble:[
          ['Label','X Value','Y Value','Bubble Size',SCATTER_POINT_LABEL_HEADER],
          ['Comet A',1.8,12,25,''],
          ['Comet B',4.2,18,40,''],
          ['Comet C',2.5,22,55,''],
          ['Comet D',5.7,28,70,SCATTER_POINT_LABEL_MARK],
          ['Comet E',3.9,16,35,''],
          ['Comet F',6.4,24,90,''],
          ['Comet G',4.8,30,65,''],
          ['Comet H',7.1,26,80,'']
        ],
        volcano:[
          ['Gene','log2FoldChange','pValue','',SCATTER_POINT_LABEL_HEADER],
          ['GeneA',1.6,0.0005,'',''],
          ['GeneB',-1.2,0.002,'',''],
          ['GeneC',0.2,0.8,'',SCATTER_POINT_LABEL_MARK],
          ['GeneD',-2.1,0.0001,'',''],
          ['GeneE',0.5,0.4,'',''],
          ['GeneF',1.1,0.03,'',''],
          ['GeneG',-1.8,0.0008,'','']
        ],
        ma:[
          ['Gene','MeanExpression','log2FoldChange','pValue',SCATTER_POINT_LABEL_HEADER],
          ['GeneA',8.5,1.4,0.0005,''],
          ['GeneB',5.3,-1.1,0.002,''],
          ['GeneC',3.9,0.1,0.4,SCATTER_POINT_LABEL_MARK],
          ['GeneD',9.2,-2.0,0.00005,''],
          ['GeneE',6.1,0.3,0.2,''],
          ['GeneF',7.4,1.2,0.015,''],
          ['GeneG',4.8,-1.5,0.0009,''],
          ['GeneH',2.7,0.0,0.9,'']
        ]
      };
      if(global.DEBUG_SCATTER) console.log('scatter example dataset map', scatterExamples);
      document.getElementById('scatterLoadExample').addEventListener('click',()=>{
        const type=scatterGraphTypeSelect?.value || 'scatter';
        const rawViewMode = type==='scatter' ? (scatterViewMode && typeof scatterViewMode.value === 'string' ? scatterViewMode.value : null) : null;
        const viewMode = type==='scatter'
          ? (rawViewMode || scatterState.requestedViewMode || scatterState.viewMode || '2d')
          : '2d';
        const normalizedMode = typeof viewMode === 'string' ? viewMode.toLowerCase() : '2d';
        let dataset;
        if(type==='scatter' && normalizedMode==='3d'){
          dataset = scatterExamples.scatter3d;
        }else if(type==='scatter' && normalizedMode==='bubble'){
          dataset = scatterExamples.scatterBubble;
        }else{
          dataset = scatterExamples[type] || scatterExamples.scatter;
        }
        markScatterOverlayPending('example-data');
        scatterHot.loadData(dataset);
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        console.log('scatter example loaded',{type,viewMode,rows:dataset.length});
        syncScatterGraphTypeUI();
        scheduleDrawScatter();
      });
      const scatterImportBtn=document.getElementById('scatterImport');
      const scatterFileInput=document.getElementById('scatterFile');
      const tableImport = Shared.tableImport;
      scatterImportBtn.addEventListener('click',()=>{ scatterFileInput.value=''; scatterFileInput.click(); });
      scatterFileInput.addEventListener('change',()=>{
        if(!tableImport || typeof tableImport.openFile !== 'function'){
          console.warn('scatter import skipped: Shared.tableImport.openFile unavailable');
          return;
        }
        const hasFile = !!(scatterFileInput?.files && scatterFileInput.files[0]);
        let forcedOverlay = false;
        if(hasFile){
          forcedOverlay = !!forceScatterOverlay('file-import', { message: 'Importing table data...' });
          markScatterOverlayPending('file-import');
        }
        const importPromise = tableImport.openFile(scatterFileInput, {
          hot: scatterHot,
          minCols: 4,
          minRows: DEFAULT_ROWS,
          scheduleDraw: () => {
            markScatterOverlayPending('file-import');
            scheduleDrawScatter({ force: true, reason: 'import-load', skipThresholdEvaluation: true });
          },
          debugLabel: 'scatter',
          onProcessed: info => console.log('scatter data imported',{rows: info?.rows, cols: info?.cols}),
          onCompleted: () => {
            const renderReason = 'import-load';
            markScatterOverlayPending(renderReason);
            forceScatterOverlay(renderReason, { message: 'Rendering scatter plot...' });
            // Do not resolve here; final resolve happens after draw completes.
          }
        });
        Promise.resolve(importPromise).then(result => {
          if(!result && forcedOverlay){
            resolveScatterOverlay('file-import-empty');
          }
        }).catch(err => {
          if(forcedOverlay){
            resolveScatterOverlay('file-import-error');
          }
          console.error('scatter import failed', err);
        });
      });

      const scatterGraphTypeSelect=$('#scatterGraphType');
      const scatterThresholdControls=$('#scatterThresholdControls');
        const scatterVolcanoOptions=$('#scatterVolcanoOptions');
        const scatterShowSignificantLabels=$('#scatterShowSignificantLabels');
      const scatterLog2FCThreshold=$('#scatterLog2FCThreshold');
      const scatterNegLogPThreshold=$('#scatterNegLogPThreshold');
      const scatterFill=$('#scatterFill'), scatterBorder=$('#scatterBorder'), scatterBorderWidth=$('#scatterBorderWidth'), scatterDotSize=$('#scatterDotSize'), scatterShowLine=$('#scatterShowLine'), scatterShowPlotStats=$('#scatterShowPlotStats'), scatterAlpha=$('#scatterAlpha');
      const scatterColorMode=$('#scatterColorMode');
      const scatterDensityPalette=$('#scatterDensityPalette');
      const scatterDensityPaletteRow=$('#scatterDensityPaletteRow');
      const scatterColorModeRow=$('#scatterColorModeRow');
      let scatterColorModeApplied = 'solid';
      let scatterColorModeDesired = SCATTER_DENSITY_MODE_DEFAULT;
      const scatterShowCI = $('#scatterShowCI');
      const scatterShowPI = $('#scatterShowPI');
      const scatterStatsRegressionOptionsRow=(scatterShowLine)?.closest('.config-panel__line--checkboxes')||null;
      if(scatterStatsRegressionOptionsRow){
        scatterStatsRegressionOptionsRow.hidden=true;
        scatterStatsRegressionOptionsRow.style.display='none';
        scatterStatsRegressionOptionsRow.setAttribute('aria-hidden','true');
      }
      let scatterShowDiagnostics=$('#scatterShowDiagnostics');
      if(scatterShowDiagnostics){
        const diagLabel=scatterShowDiagnostics.closest('label')||scatterShowDiagnostics.parentElement;
        if(diagLabel){
          diagLabel.remove();
        }else{
          scatterShowDiagnostics.remove();
        }
        scatterShowDiagnostics=null;
      }
      const scatterAlphaVal=$('#scatterAlphaVal');
      const scatterFontSize=$('#scatterFontSize'), scatterFontSizeVal=$('#scatterFontSizeVal');
      if(scatterFontSize?.dataset){
        scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
        console.debug('Debug: scatter font size base initialized',{ value: scatterFontSize.value }); // Debug: initial base
      }
      chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
      if(scatterColorMode){
        const normalizedMode = normalizeScatterColorMode(scatterColorMode.value);
        scatterColorMode.value = normalizedMode;
        scatterColorModeDesired = normalizedMode;
      }
      if(scatterDensityPalette){
        const paletteKey = normalizeScatterDensityPalette(scatterDensityPalette.value);
        scatterDensityPalette.value = paletteKey;
      }
      const scatterShowGrid=$('#scatterShowGrid'), scatterShowFrame=$('#scatterShowFrame'), scatterLogX=$('#scatterLogX'), scatterLogY=$('#scatterLogY');
      const scatterXMin=$('#scatterXMin'), scatterXMax=$('#scatterXMax'), scatterYMin=$('#scatterYMin'), scatterYMax=$('#scatterYMax');
      const scatterOriginMode=$('#scatterOriginMode'), scatterOriginX=$('#scatterOriginX'), scatterOriginY=$('#scatterOriginY');
      const scatterStatType=$('#scatterStatType');
      const scatterRegressionMode=$('#scatterRegressionMode');
      const scatterViewMode=$('#scatterViewMode');
      const scatterViewControls=$('#scatterViewControls');
      const scatterStatsResults=document.getElementById('scatterStatsResults');
      const scatterStatsButton=document.getElementById('scatterComputeStats');
      const scatterStatsStatus=document.getElementById('scatterStatsStatus');
      const scatterStatsPlaceholder='Statistics will appear after calculation.';

      function persistTabState(reason){
        try{
          const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
          if(sess && typeof sess.persistActiveTabState === 'function'){
            sess.persistActiveTabState(undefined, { reason: reason || 'scatter-stats-change' });
          }
        }catch(e){
          console.debug('Debug: persistTabState failed', { err: e?.message || String(e) });
        }
      }

      function setScatterStatsStatus(message){
        if(scatterStatsStatus){
          scatterStatsStatus.textContent = message || '';
        }
      }

      function clearScatterStatsOutputs(message = scatterStatsPlaceholder){
        if(!scatterStatsResults){
          return;
        }
        scatterStatsResults.innerHTML='';
        if(message){
          const note=document.createElement('div');
          note.className='stats-placeholder';
          note.textContent=message;
          scatterStatsResults.appendChild(note);
        }
      }

      function updateScatterStatsButtonState(config){
        if(!scatterStatsButton){
          return;
        }
        if(config && Object.prototype.hasOwnProperty.call(config,'disabled')){
          scatterStatsButton.disabled=!!config.disabled;
        }
        if(config && typeof config.label==='string' && config.label){
          scatterStatsButton.textContent=config.label;
        }
      }

      function scatterHasComputedStats(){
        const context = scatterState.statsContext;
        if(!context || context.graphType!=='scatter'){
          return false;
        }
        if(!context.precomputedStats){
          return false;
        }
        if(scatterState.statsComputationPending){
          return false;
        }
        return scatterState.statsContextVersion>0
          && scatterState.statsLastRunVersion===scatterState.statsContextVersion;
      }

      function syncScatterRegressionOptionVisibility(){
        if(!scatterStatsRegressionOptionsRow){
          return;
        }
        const shouldShow=scatterHasComputedStats();
        scatterStatsRegressionOptionsRow.hidden=!shouldShow;
        scatterStatsRegressionOptionsRow.style.display=shouldShow?'':'none';
        scatterStatsRegressionOptionsRow.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
      }

      function summarizeScatterPoints(points){
        const summary={ count:0, sumX:0, sumY:0, sumXX:0, sumYY:0, sumXY:0 };
        if(!Array.isArray(points) || !points.length){
          return summary;
        }
        for(let i=0;i<points.length;i+=1){
          const x=Number(points[i]?.x) || 0;
          const y=Number(points[i]?.y) || 0;
          summary.count+=1;
          summary.sumX+=x;
          summary.sumY+=y;
          summary.sumXX+=x*x;
          summary.sumYY+=y*y;
          summary.sumXY+=x*y;
        }
        return summary;
      }

      function formatScatterSignatureNumber(value){
        return Number.isFinite(value)?value.toFixed(4):'NaN';
      }

      function getScatterStatsControlSignature(){
        return [
          scatterStatType?.value || 'pearson',
          scatterRegressionMode?.value || 'linear'
        ].join('|');
      }

      function buildScatterStatsSignature(context){
        if(!context){
          return 'empty';
        }
        let pointsKey='none';
        if(typeof context.signatureSeed==='string'){
          pointsKey=context.signatureSeed;
        }else{
          const summary=context.pointSummary || summarizeScatterPoints(context.points);
          pointsKey=[
            summary.count,
            formatScatterSignatureNumber(summary.sumX),
            formatScatterSignatureNumber(summary.sumY),
            formatScatterSignatureNumber(summary.sumXX),
            formatScatterSignatureNumber(summary.sumYY),
            formatScatterSignatureNumber(summary.sumXY)
          ].join('|');
        }
        const thresholdKey=context.thresholds
          ? [
              formatScatterSignatureNumber(context.thresholds.log2fc ?? 0),
              formatScatterSignatureNumber(context.thresholds.negLogP ?? 0),
              context.thresholds.negLabel || ''
            ].join('|')
          : 'threshold:none';
        const significanceKey=context.significance
          ? [
              context.significance.totalPoints ?? 'na',
              context.significance.significantCount ?? 'na',
              context.significance.nonSignificantCount ?? 'na',
              context.significance.missingP ?? 0
            ].join('|')
          : 'significance:none';
        const domainKey=context.domain
          ? [
              formatScatterSignatureNumber(context.domain.minX ?? NaN),
              formatScatterSignatureNumber(context.domain.maxX ?? NaN)
            ].join('|')
          : 'domain:none';
        const controlKey=getScatterStatsControlSignature();
        const graphKey=context.graphType || 'scatter';
        return [graphKey,pointsKey,thresholdKey,significanceKey,domainKey,controlKey].join('::');
      }

      function primeScatterStatsContext(context,options={}){
        if(!context || (context.graphType==='scatter' && (!Array.isArray(context.points) || !context.points.length))){
          scatterState.statsContext=null;
          scatterState.statsContextSignature=null;
          scatterState.statsContextVersion=0;
          scatterState.statsLastRunVersion=0;
          scatterState.statsComputationPending=false;
          clearScatterStatsOutputs(options.placeholder || 'Add data to enable statistics.');
          setScatterStatsStatus('');
          updateScatterStatsButtonState({ disabled:true, label:'Calculate statistics' });
          syncScatterRegressionOptionVisibility();
          return;
        }
        const signature=buildScatterStatsSignature(context);
        const changed=signature!==scatterState.statsContextSignature;
        if(changed){
          scatterState.statsContextVersion=(scatterState.statsContextVersion||0)+1;
          scatterState.statsLastRunVersion=0;
        }else if(!scatterState.statsContextVersion){
          scatterState.statsContextVersion=1;
        }
        scatterState.statsContextSignature=signature;
        scatterState.statsContext={ ...context, version: scatterState.statsContextVersion };
        if(!changed && context.graphType==='scatter' && !context.precomputedStats){
          scatterState.statsLastRunVersion=0;
        }
        if(changed){
          clearScatterStatsOutputs(options.placeholder || scatterStatsPlaceholder);
          setScatterStatsStatus('Statistics ready to calculate.');
          updateScatterStatsButtonState({ disabled:false, label:'Calculate statistics' });
        }else if(scatterState.statsLastRunVersion===scatterState.statsContextVersion){
          setScatterStatsStatus('Statistics up to date.');
          updateScatterStatsButtonState({ disabled:false, label:'Recalculate statistics' });
        }else if(!scatterState.statsComputationPending){
          setScatterStatsStatus('Statistics ready to calculate.');
          updateScatterStatsButtonState({ disabled:false, label:'Calculate statistics' });
        }
        syncScatterRegressionOptionVisibility();
      }

      function requestScatterStatsContextRefresh(reason){
        const ctx=scatterState.statsContext;
        if(!ctx){
          clearScatterStatsOutputs(scatterStatsPlaceholder);
          setScatterStatsStatus('');
          updateScatterStatsButtonState({ disabled:true, label:'Calculate statistics' });
          syncScatterRegressionOptionVisibility();
          console.debug('Debug: scatter stats context refresh skipped',{ reason, hasContext:false });
          return false;
        }
        console.debug('Debug: scatter stats context refresh requested',{ reason, graphType:ctx.graphType, pointCount:ctx.points?.length || ctx.significance?.totalPoints || 0 });
        primeScatterStatsContext({
          ...ctx,
          precomputedStats:null,
          precomputedSignature:null
        });
        return true;
      }

      function handleScatterStatsComputeClick(){
        if(scatterState.statsComputationPending){
          return;
        }
        const context=scatterState.statsContext;
        if(!context){
          setScatterStatsStatus('Statistics unavailable until data is loaded.');
          return;
        }
        scatterState.statsComputationPending=true;
        updateScatterStatsButtonState({ disabled:true, label:'Calculating…' });
        setScatterStatsStatus('Calculating statistics…');
        try{
          runScatterStatsComputation(context);
          scatterState.statsLastRunVersion=context.version;
          setScatterStatsStatus('Statistics up to date.');
          updateScatterStatsButtonState({ disabled:false, label:'Recalculate statistics' });
          if(typeof scheduleDrawScatter === 'function'){
            scheduleDrawScatter({ reason:'scatter-stats-updated' });
          }
        }catch(err){
          console.error('scatter stats computation failed',err);
          if(scatterStatsResults){
            scatterStatsResults.textContent='Unable to compute statistics. See console for details.';
          }
          setScatterStatsStatus('Failed to compute statistics.');
          updateScatterStatsButtonState({ disabled:false, label:'Calculate statistics' });
        }finally{
          scatterState.statsComputationPending=false;
          syncScatterRegressionOptionVisibility();
          try{
            const stillCurrent = scatterState.statsContext === context && scatterState.statsContextVersion === context.version;
            if(stillCurrent && scatterState.statsLastRunVersion === context.version){
              const sess = (window && window.Main && window.Main.session) ? window.Main.session : null;
              if(sess && typeof sess.persistActiveTabState === 'function'){
                sess.persistActiveTabState(undefined, { reason: 'scatter-stats-computed' });
              }
            }
          }catch(e){
            console.debug('Debug: persistActiveTabState after scatter compute failed', { err: e?.message || String(e) });
          }
        }
      }

      function renderScatterSignificanceSummary(context){
        if(!scatterStatsResults){
          return;
        }
        const summary=context?.significance;
        if(!summary){
          scatterStatsResults.textContent='Statistics unavailable.';
          return;
        }
        const rows=[
          { metric:'Total points', value:String(summary.totalPoints || 0) },
          { metric:'Significant', value:String(summary.significantCount || 0) },
          { metric:'Not significant', value:String(summary.nonSignificantCount || 0) },
          { metric:'|log₂FC| ≥', value:Number.isFinite(summary.log2fcThreshold)?summary.log2fcThreshold.toFixed(2):'—' },
          { metric:`${summary.negLabel || '-log10(p-value)'} ≥`, value:Number.isFinite(summary.negLogPThreshold)?summary.negLogPThreshold.toFixed(2):'—' }
        ];
        if(Number(summary.missingP)>0){
          rows.push({ metric:'Missing p-values', value:String(summary.missingP) });
        }
        renderStatsCard(scatterStatsResults,{
          caption: context.graphType==='ma' ? 'Differential expression summary' : 'Significance summary',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows,
          options:{
            fileName:'scatter-threshold-summary',
            contextLabel:'scatter-threshold'
          }
        });
      }

      function runScatterStatsComputation(context){
        if(!scatterStatsResults){
          return;
        }
        scatterStatsResults.innerHTML='';
        if(context.graphType==='scatter'){
          if(!Array.isArray(context.points) || context.points.length<3){
            scatterStatsResults.textContent='Select at least three paired values to compute correlation statistics.';
            return;
          }
          const method=scatterStatType?.value || 'pearson';
          const regressionModeValue=scatterRegressionMode ? (scatterRegressionMode.value || 'linear') : 'linear';
          const showLineMaster = !!(scatterShowLine && scatterShowLine.checked);
          const showCI = !!(showLineMaster && scatterShowCI && scatterShowCI.checked);
          const showPI = !!(showLineMaster && scatterShowPI && scatterShowPI.checked);
          const showDiagnostics=!!scatterShowDiagnostics?.checked;
          const controlSignature=getScatterStatsControlSignature();
          let stats=context.precomputedStats;
          if(!stats || context.precomputedSignature!==controlSignature){
            stats=computeScatterStats(context.points,method,{ regressionMode:regressionModeValue, domain:context.domain || null });
            context.precomputedStats=stats;
            context.precomputedSignature=controlSignature;
            scatterState.statsContext=context;
          }
          const regressionModel=stats?.regression || null;
          scatterLastRegressionSummary=typeof regressionTools.createSummary==='function'
            ? regressionTools.createSummary(regressionModel)
            : null;
          const rows=[
            { metric:'r', value:formatMetricValue(stats.r) },
            { metric:'P value', value:formatP(stats.p) }
          ];
          if(regressionModel?.metrics){
            rows.push({ metric:'R²', value:formatMetricValue(regressionModel.metrics.r2) });
            if(Number.isFinite(regressionModel.metrics.adjR2)){
              rows.push({ metric:'Adjusted R²', value:formatMetricValue(regressionModel.metrics.adjR2) });
            }
            rows.push({ metric:'RMSE', value:formatMetricValue(regressionModel.metrics.rmse) });
            rows.push({ metric:'MAE', value:formatMetricValue(regressionModel.metrics.mae) });
            if(Number.isFinite(regressionModel.metrics.logLoss)){
              rows.push({ metric:'Log loss', value:formatMetricValue(regressionModel.metrics.logLoss,6) });
            }
          }else{
            rows.push({ metric:'R²', value:formatMetricValue(stats.r2) });
          }
          if(regressionModel?.summary){
            const summary=regressionModel.summary;
            if(summary.parameters && typeof summary.parameters==='object'){
              Object.entries(summary.parameters).forEach(([label,value])=>{
                if(Number.isFinite(value)){
                  rows.push({ metric:label, value:formatMetricValue(value) });
                }else if(value!=null && value!==''){
                  rows.push({ metric:label, value:String(value) });
                }
              });
            }
            if(summary.primaryParameter && summary.primaryParameter.label && Number.isFinite(summary.primaryParameter.value)){
              const duplicate=summary.parameters && Object.prototype.hasOwnProperty.call(summary.parameters,summary.primaryParameter.label);
              if(!duplicate){
                rows.push({ metric:summary.primaryParameter.label, value:formatMetricValue(summary.primaryParameter.value) });
              }
            }
            if(!summary.parameters && Number.isFinite(summary.slope)){
              rows.push({ metric:'Slope', value:formatMetricValue(summary.slope) });
            }
            if(!summary.parameters && Number.isFinite(summary.intercept)){
              rows.push({ metric:'Intercept', value:formatMetricValue(summary.intercept) });
            }
            if(summary.equation){
              rows.push({ metric:'Equation', value:summary.equation });
            }
          }else{
            rows.push({ metric:'Slope', value:formatMetricValue(stats.m) });
            rows.push({ metric:'Intercept', value:formatMetricValue(stats.b) });
          }
          if(regressionModel?.residuals){
            rows.push({ metric:'Residual mean', value:formatMetricValue(regressionModel.residuals.mean) });
            rows.push({ metric:'Residual SD', value:formatMetricValue(regressionModel.residuals.sd) });
          }
          if((showCI || showPI) && regressionModel?.intervals?.summary){
            const summary=regressionModel.intervals.summary;
            if(showCI && Number.isFinite(summary.ciMin) && Number.isFinite(summary.ciMax)){
              rows.push({ metric:'Confidence interval (y)', value:`${formatMetricValue(summary.ciMin)} – ${formatMetricValue(summary.ciMax)}` });
            }
            if(showPI && Number.isFinite(summary.piMin) && Number.isFinite(summary.piMax)){
              rows.push({ metric:'Prediction interval (y)', value:`${formatMetricValue(summary.piMin)} – ${formatMetricValue(summary.piMax)}` });
            }
          }
          if(showDiagnostics && regressionModel?.diagnostics){
            rows.push({ metric:'Residual skewness', value:formatMetricValue(regressionModel.diagnostics.skewness,3) });
            rows.push({ metric:'Residual kurtosis', value:formatMetricValue(regressionModel.diagnostics.kurtosis,3) });
            if(Number.isFinite(regressionModel.diagnostics.jarqueBera)){
              rows.push({ metric:'Jarque-Bera', value:formatMetricValue(regressionModel.diagnostics.jarqueBera,3) });
            }
            if(Number.isFinite(regressionModel.diagnostics.jarqueBeraP)){
              rows.push({ metric:'Jarque-Bera p', value:formatP(regressionModel.diagnostics.jarqueBeraP) });
            }
          }
          if(regressionModel?.warnings?.length){
            rows.push({ metric:'Warnings', value:regressionModel.warnings.join('; ') });
          }
          renderStatsCard(scatterStatsResults,{
            caption:`${stats.method} correlation (${regressionModeValue} regression)` ,
            columns:[
              {key:'metric',label:'Metric',align:'left'},
              {key:'value',label:'Value',align:'right'}
            ],
            rows,
            options:{
              fileName:'scatter-correlation',
              contextLabel:'scatter-correlation'
            }
          });
          scatterDebug('Debug: scatter manual stats computed',{ stats, regressionSummary: scatterLastRegressionSummary });
        }else{
          renderScatterSignificanceSummary(context);
          scatterLastRegressionSummary=null;
        }
      }

      if(scatterStatsButton){
        scatterStatsButton.addEventListener('click',handleScatterStatsComputeClick);
      }
      clearScatterStatsOutputs(scatterStatsPlaceholder);
      setScatterStatsStatus('');
      updateScatterStatsButtonState({ disabled:true, label:'Calculate statistics' });
      syncScatterRegressionOptionVisibility();

      const scatterSelects=[
        scatterGraphTypeSelect,
        scatterViewMode,
        scatterOriginMode,
        scatterStatType,
        scatterRegressionMode
      ].filter(Boolean);
      scatterSelects.forEach(select=>{
        attachScatterSelectAutoSize(select, 'scatter');
      });
      function updateScatterViewModeOptionVisibility(){
        if(!scatterViewMode){
          return;
        }
        const option3d = scatterViewMode.querySelector('option[value="3d"]');
        if(option3d){
          option3d.disabled = false;
        }
        const optionBubble = scatterViewMode.querySelector('option[value="bubble"]');
        if(optionBubble){
          optionBubble.disabled = false;
        }
        scatterViewMode.disabled = scatterCurrentGraphType !== 'scatter';
      }
      function applyScatterViewMode(mode, options = {}){
        const graphAllowsAdvanced = scatterCurrentGraphType === 'scatter';
        const allow3d = options.allow3d !== false && graphAllowsAdvanced;
        const allowBubble = options.allowBubble !== false && graphAllowsAdvanced;
        const forceUpdate = options.forceUpdate === true;
        const skipSchedule = options.skipSchedule === true;
        const persistRequest = options.persistRequest === true;
        let requested = typeof mode === 'string'
          ? mode.toLowerCase()
          : (scatterState.requestedViewMode || scatterState.viewMode || '2d');
        if(requested !== '3d' && requested !== 'bubble'){
          requested = '2d';
        }
        if(persistRequest || !scatterState.requestedViewMode){
          scatterState.requestedViewMode = requested;
        }
        let normalized = requested;
        if(normalized === '3d' && !allow3d){
          normalized = '2d';
        }else if(normalized === 'bubble' && !allowBubble){
          normalized = '2d';
        }
        const changed = forceUpdate || scatterState.viewMode !== normalized;
        scatterState.viewMode = normalized;
        if(scatterViewMode){
          const displayValue = scatterState.requestedViewMode || normalized;
          if(scatterViewMode.value !== displayValue){
            scatterViewMode.value = displayValue;
          }
        }
        const disableLog = normalized === '3d' || scatterCurrentGraphType !== 'scatter';
        [scatterLogX, scatterLogY].forEach(cb => {
          if(!cb){ return; }
          cb.disabled = disableLog;
          if(disableLog && cb.checked){
            cb.checked = false;
          }
        });
        const disableRegression = normalized === '3d' || scatterCurrentGraphType !== 'scatter';
        if(scatterShowLine){
          scatterShowLine.disabled = disableRegression;
          if(disableRegression && scatterShowLine.checked){
            scatterShowLine.checked = false;
          }
        }
        if(scatterShowPlotStats){
          scatterShowPlotStats.disabled = disableRegression;
          if(disableRegression && scatterShowPlotStats.checked){
            scatterShowPlotStats.checked = false;
          }
        }
        // Update CI/PI enabled state and visual class
        try{ updateCIEnabled(); }catch(e){
          if(scatterShowCI){ scatterShowCI.disabled = disableRegression; if(disableRegression && scatterShowCI.checked){ scatterShowCI.checked = false; } }
          if(scatterShowPI){ scatterShowPI.disabled = disableRegression; if(disableRegression && scatterShowPI.checked){ scatterShowPI.checked = false; } }
        }
        if(scatterShowDiagnostics){
          scatterShowDiagnostics.disabled = disableRegression;
          if(disableRegression && scatterShowDiagnostics.checked){
            scatterShowDiagnostics.checked = false;
          }
        }
        if(normalized === '3d' && scatterShowFrame && !scatterShowFrame.checked){
          scatterShowFrame.checked = true;
        }
        updateScatterViewModeOptionVisibility();
        if(changed && !skipSchedule){
          scheduleDrawScatter();
        }
        return normalized;
      }
      function scheduleScatterRotationRedraw(){
        if(scatterState.rotationPending){
          if(!scatterState.rotationPendingLogged && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: scatter rotation redraw skipped',{ reason: 'pending' });
          }
          scatterState.rotationPendingLogged = true;
          return;
        }
        scatterState.rotationPending = true;
        scatterState.rotationPendingLogged = false;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: scatter rotation redraw scheduled');
        }
        scheduleDrawScatter();
      }
      if(scatterViewMode){
        scatterViewMode.value = scatterState.viewMode;
        scatterViewMode.addEventListener('change', () => {
          const requested = scatterViewMode.value;
          const next = requested === '3d' ? '3d' : (requested === 'bubble' ? 'bubble' : '2d');
          const applied = applyScatterViewMode(next, {
            allow3d: scatterCurrentGraphType === 'scatter',
            allowBubble: scatterCurrentGraphType === 'scatter',
            persistRequest: true
          });
          if(applied !== next){
            scatterViewMode.value = applied;
          }
          syncScatterColorModeUI(scatterColorModeApplied);
        });
      }
      let scatterLogWarningEl=null;
      const scatterDebugEnabled=()=>typeof Shared.isDebugEnabled==='function'&&Shared.isDebugEnabled();
      function ensureScatterLogWarningElement(){
        if(scatterLogWarningEl&&scatterLogWarningEl.isConnected){
          return scatterLogWarningEl;
        }
        const host=(scatterLogY?.closest('.config-panel__fieldset'))||(scatterLogX?.closest('fieldset'));
        if(!host){
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log warning host unavailable');
          }
          return null;
        }
        const el=global.document.createElement('div');
        el.className='config-panel__warning';
        el.setAttribute('role','alert');
        el.setAttribute('aria-live','polite');
        el.hidden=true;
        host.appendChild(el);
        scatterLogWarningEl=el;
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log warning element created');
        }
        return scatterLogWarningEl;
      }
      function showScatterLogWarning(message){
        const el=ensureScatterLogWarningElement();
        if(!el){
          return;
        }
        el.textContent=message;
        el.hidden=false;
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log warning shown',{ message });
        }
      }
      function clearScatterLogWarning(){
        if(!scatterLogWarningEl){
          return;
        }
        scatterLogWarningEl.textContent='';
        scatterLogWarningEl.hidden=true;
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log warning cleared');
        }
      }
      function applyScatterLogValidationFailure(axis, validation, context){
        if(!validation || validation.allowed !== false){
          return;
        }
        const checkbox = axis === 'x' ? scatterLogX : scatterLogY;
        if(checkbox){
          checkbox.checked = false;
        }
        const warningMessage = validation.message || `Cannot enable log scale on the ${axis === 'x' ? 'X' : 'Y'} axis while non-positive values are present.`;
        showScatterLogWarning(warningMessage);
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log axis auto-disabled',{ axis, context, reason: validation.reason, value: validation.value });
        }
        scheduleDrawScatter();
      }
      function revalidateActiveScatterLogAxis(axis, context){
        const checkbox = axis === 'x' ? scatterLogX : scatterLogY;
        if(!checkbox?.checked){
          return true;
        }
        const validation = validateScatterLogAxis(axis);
        if(!validation.allowed){
          applyScatterLogValidationFailure(axis, validation, context);
          console.warn('scatter log axis disabled',{ axis, context, reason: validation.reason, value: validation.value });
          return false;
        }
        clearScatterLogWarning();
        return true;
      }
      function validateScatterLogAxis(axis){
        const axisLabel=axis==='x'?'X':'Y';
        const minInput=axis==='x'?scatterXMin:scatterYMin;
        const maxInput=axis==='x'?scatterXMax:scatterYMax;
        const originInput=axis==='x'?scatterOriginX:scatterOriginY;
        const manualMin=parseFloat(minInput?.value);
        if(Number.isFinite(manualMin)&&manualMin<=0){
          const message=`Cannot enable log scale on the ${axisLabel} axis because the minimum value (${manualMin}) is not positive.`;
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis blocked by manual minimum',{ axis, value: manualMin });
          }
          return{allowed:false,reason:'axis-limit',value:manualMin,message,hasZeros:manualMin===0,hasNegatives:manualMin<0};
        }
        const manualMax=parseFloat(maxInput?.value);
        if(Number.isFinite(manualMax)&&manualMax<=0){
          const message=`Cannot enable log scale on the ${axisLabel} axis because the maximum value (${manualMax}) is not positive.`;
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis blocked by manual maximum',{ axis, value: manualMax });
          }
          return{allowed:false,reason:'axis-limit',value:manualMax,message,hasZeros:manualMax===0,hasNegatives:manualMax<0};
        }
        const originModeValue=scatterOriginMode?.value;
        if(originModeValue==='custom'){
          const originVal=parseFloat(originInput?.value);
          if(Number.isFinite(originVal)&&originVal<=0){
            const message=`Cannot enable log scale on the ${axisLabel} axis because the custom origin (${originVal}) is not positive.`;
            if(scatterDebugEnabled()){
              console.debug('Debug: scatter log axis blocked by custom origin',{ axis, value: originVal });
            }
            return{allowed:false,reason:'origin',value:originVal,message,hasZeros:originVal===0,hasNegatives:originVal<0};
          }
        }
        const analysis=scatterHot?.getAnalysisData?.()||Shared.hot.getAnalysisData(scatterHot);
        const colIndex=axis==='x'?1:2;
        const rowCount=analysis?.rowCount||0;
        const colCount=analysis?.colCount||0;
        if(!analysis||colIndex>=colCount){
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis validation skipped due to missing analysis',{ axis, hasAnalysis:!!analysis,colIndex,colCount });
          }
          return{allowed:true};
        }
        if(analysis.isColumnExcluded?.(colIndex)){
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis validation skipped because column is excluded',{ axis, colIndex });
          }
          return{allowed:false,reason:'excluded',message:`Restore the ${axisLabel} axis column before enabling log scale.`};
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
          const raw=analysis.data?.[r]?.[colIndex];
          if(raw===null||typeof raw==='undefined'||raw===''){
            continue;
          }
          const value=parseFloat(raw);
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
        if(hasNegatives){
          const formatted=firstNegativeValue.toPrecision(4);
          const message=`Cannot enable log scale on the ${axisLabel} axis because data includes ${formatted} at row ${firstNegativeRow+1}.`;
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis blocked by negative data',{ axis, row:firstNegativeRow, value:firstNegativeValue });
          }
          return{allowed:false,reason:'data',value:firstNegativeValue,message,hasZeros,hasNegatives:true};
        }
        if(hasZeros){
          const message=`Data contains zero values on the ${axisLabel} axis. Would you like to use log(x+1) transform instead?`;
          if(scatterDebugEnabled()){
            console.debug('Debug: scatter log axis has zeros',{ axis, row:firstZeroRow });
          }
          return{allowed:false,reason:'zeros',value:0,message,hasZeros:true,hasNegatives:false,canUsePlusOne:true};
        }
        if(scatterDebugEnabled()){
          console.debug('Debug: scatter log axis validation passed',{ axis });
        }
        return{allowed:true};
      }
      const scatterUndoManager = Shared.undoManager || null;
      function recordScatterChange(label, previous, next, apply){
        if(!scatterUndoManager || typeof scatterUndoManager.recordStateChange !== 'function'){
          return;
        }
        if(typeof apply !== 'function'){
          return;
        }
        scatterUndoManager.recordStateChange({
          label,
          scope: 'scatterGraphPanel',
          from: previous,
          to: next,
          apply(value){
            apply(value);
            return true;
          }
        });
      }
      function syncScatterColorModeUI(appliedMode = scatterColorModeApplied){
        const type = scatterGraphTypeSelect?.value || 'scatter';
        const isScatter = type === 'scatter';
        const viewMode = scatterState?.viewMode || '2d';
        if(scatterColorMode){
          const normalizedMode = normalizeScatterColorMode(scatterColorMode.value);
          if(scatterColorMode.value !== normalizedMode){
            scatterColorMode.value = normalizedMode;
          }
          scatterColorMode.disabled = !isScatter;
        }
        if(scatterDensityPalette){
          const paletteKey = normalizeScatterDensityPalette(scatterDensityPalette.value);
          if(scatterDensityPalette.value !== paletteKey){
            scatterDensityPalette.value = paletteKey;
          }
          scatterDensityPalette.disabled = !isScatter;
        }
        const paletteRow = scatterDensityPaletteRow || scatterDensityPalette?.closest('.config-panel__item');
        const desiredMode = scatterColorMode ? normalizeScatterColorMode(scatterColorMode.value) : SCATTER_DENSITY_MODE_DEFAULT;
        const paletteVisible = isScatter && viewMode !== '3d' && (desiredMode === 'density' || desiredMode === 'auto');
        if(paletteRow){
          paletteRow.style.display = paletteVisible ? '' : 'none';
        }
        if(scatterColorModeRow){
          scatterColorModeRow.style.display = isScatter ? '' : 'none';
        }
        if(scatterFill){
          const disableFill = isScatter && appliedMode === 'density' && viewMode !== '3d';
          scatterFill.disabled = disableFill;
          scatterFill.title = disableFill ? 'Fill color is controlled by density in this mode.' : '';
        }
      }
      function syncScatterGraphTypeUI(){
        const type=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=type;
        const showThresholds=type!=='scatter';
        if(showThresholds){
          clearScatterLogWarning();
        }
        if(scatterThresholdControls){
          scatterThresholdControls.style.display=showThresholds?'':'none';
        }
        if(scatterVolcanoOptions){
          scatterVolcanoOptions.style.display = type === 'volcano' ? '' : 'none';
        }
        if(scatterShowSignificantLabels){
          scatterShowSignificantLabels.disabled = type !== 'volcano';
        }
        if(scatterViewControls){
          scatterViewControls.style.display = type === 'scatter' ? '' : 'none';
        }
        [scatterLogX,scatterLogY].forEach(el=>{
          if(!el) return;
          el.disabled=type!=='scatter';
          if(type!=='scatter' && el.checked){
            el.checked=false;
          }
        });
        if(scatterStatType){
          scatterStatType.disabled=type!=='scatter';
        }
        if(scatterRegressionMode){
          scatterRegressionMode.disabled=type!=='scatter';
        }
        const disableRegressionControls = type !== 'scatter';
        if(scatterShowLine){
          scatterShowLine.disabled=disableRegressionControls;
          if(disableRegressionControls && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        if(scatterShowPlotStats){
          scatterShowPlotStats.disabled=disableRegressionControls;
          if(disableRegressionControls && scatterShowPlotStats.checked){
            scatterShowPlotStats.checked=false;
          }
        }
        // Update CI/PI enabled state and visual class
        try{ updateCIEnabled(); }catch(e){
          if(scatterShowCI){ scatterShowCI.disabled = disableRegressionControls; if(disableRegressionControls && scatterShowCI.checked){ scatterShowCI.checked = false; } }
          if(scatterShowPI){ scatterShowPI.disabled = disableRegressionControls; if(disableRegressionControls && scatterShowPI.checked){ scatterShowPI.checked = false; } }
        }
        if(scatterShowDiagnostics){
          scatterShowDiagnostics.disabled=disableRegressionControls;
        }
        if(type!=='scatter' && scatterFill && scatterFill.value && scatterFill.value.toLowerCase()==='#377eb8'){
          scatterFill.value=DEFAULT_NON_SIG_COLOR;
        }
        if(type!==scatterLastGraphType){
          const defaults=GRAPH_TYPE_DEFAULTS[type];
          if(defaults && defaults.title){
            scatterTitleText=defaults.title;
          }
          scatterLastGraphType=type;
        }
        renderScatterStatsAdvisor(null, buildScatterAdvisorContext([]));
        syncScatterColorModeUI(scatterColorModeApplied);
        console.debug('Debug: syncScatterGraphTypeUI complete',{type,showThresholds});
        if(scatterViewMode){
          if(type !== 'scatter'){
            scatterState.supports3d = false;
            scatterState.supportsBubble = false;
            applyScatterViewMode('2d', { allow3d: false, allowBubble: false, skipSchedule: true, forceUpdate: true });
          } else {
            updateScatterViewModeOptionVisibility();
            const targetMode = scatterState.requestedViewMode || scatterState.viewMode || '2d';
            applyScatterViewMode(targetMode, {
              skipSchedule: true,
              forceUpdate: true,
              allow3d: true,
              allowBubble: true,
              persistRequest: true
            });
          }
        }
        syncScatterColorModeUI(scatterColorModeApplied);
      }

      function buildScatterAdvisorContext(points, overrides){
        const context={
          graphType: scatterCurrentGraphType,
          statsMethod: scatterStatType?.value || 'pearson',
          regressionMode: scatterRegressionMode?.value || 'linear',
          showLine: !!scatterShowLine?.checked,
          showLineStats: !!scatterShowPlotStats?.checked,
          showCI: !!(scatterShowLine && scatterShowCI && scatterShowCI.checked),
          showPI: !!(scatterShowLine && scatterShowPI && scatterShowPI.checked),
          showIntervals: !!(scatterShowLine && ((scatterShowCI && scatterShowCI.checked) || (scatterShowPI && scatterShowPI.checked))),
          showDiagnostics: !!scatterShowDiagnostics?.checked,
          logX: !!scatterLogX?.checked,
          logY: !!scatterLogY?.checked
        };
        const finitePoints=Array.isArray(points)?points.filter(pt=>Number.isFinite(pt?.x)&&Number.isFinite(pt?.y)):[];
        context.pointCount=finitePoints.length;
        const xUnique=new Set();
        const yUnique=new Set();
        const monotonicSigns=new Set();
        let approxBinary=true;
        let bounded01=true;
        let prevPoint=null;
        const yValues=[];
        const xValues=[];
        let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
        finitePoints.forEach(pt=>{
          const x=pt.x;
          const y=pt.y;
          if(x<xMin) xMin=x;
          if(x>xMax) xMax=x;
          if(y<yMin) yMin=y;
          if(y>yMax) yMax=y;
          if(xUnique.size<400 && Number.isFinite(x)){
            xUnique.add(Number(x.toFixed(6)));
          }
          if(yUnique.size<400 && Number.isFinite(y)){
            yUnique.add(Number(y.toFixed(6)));
          }
          if(!(y===0 || y===1)){
            approxBinary=false;
          }
          if(y<0 || y>1){
            bounded01=false;
          }
          if(prevPoint){
            const dx=x-prevPoint.x;
            const dy=y-prevPoint.y;
            if(Number.isFinite(dx) && dx!==0 && Number.isFinite(dy)){
              if(dy>0){ monotonicSigns.add('pos'); }
              else if(dy<0){ monotonicSigns.add('neg'); }
            }
          }
          prevPoint=pt;
          xValues.push(x);
          yValues.push(y);
        });
        if(finitePoints.length){
          context.xMin=xMin;
          context.xMax=xMax;
          context.yMin=yMin;
          context.yMax=yMax;
        }
        context.xUniqueCount=xUnique.size;
        context.yUniqueCount=yUnique.size;
        context.approxBinaryY=approxBinary && yUnique.size<=2;
        context.yWithinZeroOne=bounded01;
        context.monotonicSigns=monotonicSigns;
        if(yValues.length>3){
          const yMean=yValues.reduce((sum,val)=>sum+val,0)/yValues.length;
          const yVar=yValues.reduce((sum,val)=>sum+Math.pow(val-yMean,2),0)/Math.max(1,yValues.length-1);
          const yStd=Math.sqrt(Math.max(yVar,0));
          context.yStd=yStd;
          if(yStd>0){
            context.yOutlierCount=yValues.reduce((count,val)=>count+(Math.abs((val-yMean)/yStd)>3?1:0),0);
          }else{
            context.yOutlierCount=0;
          }
        }else{
          context.yStd=NaN;
          context.yOutlierCount=0;
        }
        if(xValues.length>3){
          const xMean=xValues.reduce((sum,val)=>sum+val,0)/xValues.length;
          const xVar=xValues.reduce((sum,val)=>sum+Math.pow(val-xMean,2),0)/Math.max(1,xValues.length-1);
          context.xStd=Math.sqrt(Math.max(xVar,0));
        }else{
          context.xStd=NaN;
        }
        return overrides ? { ...context, ...overrides } : context;
      }

      function ensureScatterAdvisorDefaults(context){
        const answers=scatterAdvisorState.answers || {};
        if(!answers.measurement){
          if(context.approxBinaryY){
            answers.measurement='binaryOutcome';
          }else if(context.pointCount>=6 && (context.yOutlierCount>0 || !Number.isFinite(context.yStd) || context.yStd===0)){
            answers.measurement='continuousNonNormal';
          }else{
            answers.measurement='continuousNormal';
          }
        }
        if(!answers.trend){
          if(context.graphType!=='scatter'){
            answers.trend='linear';
          }else if(context.monotonicSigns && context.monotonicSigns.size>1){
            answers.trend='multiple';
          }else{
            answers.trend='linear';
          }
        }
        if(!answers.lineDetail){
          if(context.showDiagnostics){
            answers.lineDetail='diagnostics';
          }else if(context.showIntervals){
            answers.lineDetail='intervals';
          }else if(context.showLine){
            answers.lineDetail='minimal';
          }else{
            answers.lineDetail='hide';
          }
        }
        scatterAdvisorState.answers=answers;
        return answers;
      }

      function buildScatterAdvisorQuestions(context){
        if(context.graphType!=='scatter'){
          return [];
        }
        return [
          {
            id:'measurement',
            prompt:'How are X and Y measured?',
            help:'This determines whether Pearson or Spearman correlation fits best.',
            options:[
              { value:'continuousNormal', label:'Continuous and roughly symmetric' },
              { value:'continuousNonNormal', label:'Continuous with skew/outliers' },
              { value:'ordinal', label:'Ordinal or ranked values' },
              { value:'binaryOutcome', label:'Binary or 0–1 response vs. predictor' }
            ]
          },
          {
            id:'trend',
            prompt:'Which pattern best describes the relationship?',
            help:'Choose a trend to fit when drawing the optional line.',
            options:[
              { value:'linear', label:'Straight-line trend' },
              { value:'curved', label:'Single curve (U- or inverted-U)' },
              { value:'sShape', label:'S-shaped / bounded response' },
              { value:'exponential', label:'Exponential growth or decay' },
              { value:'power', label:'Power-law scaling (y ∝ xᵏ)' },
              { value:'multiple', label:'Irregular with multiple bends' }
            ]
          },
          {
            id:'lineDetail',
            prompt:'How much detail should accompany the fitted line?',
            help:'Controls the fitted line, interval shading, and diagnostics on the plot.',
            options:[
              { value:'minimal', label:'Show fitted line only' },
              { value:'intervals', label:'Include confidence/prediction intervals' },
              { value:'diagnostics', label:'Include intervals and diagnostics summary' },
              { value:'hide', label:'Do not draw a trend line' }
            ]
          }
        ];
      }

      function computeScatterAdvisorRecommendation(answers, context){
        const recommendation={
          ready:false,
          message:'',
          summary:'',
          rationale:[],
          warnings:[],
          statsMethod:context.statsMethod || 'pearson',
          regression:context.regressionMode || 'linear',
          showLine:context.showLine,
          showLineStats:context.showLineStats,
          showIntervals:context.showIntervals,
          showDiagnostics:context.showDiagnostics
        };
        if(context.graphType!=='scatter'){
          recommendation.message='Switch the graph type to “Scatter Plot” to access correlation and regression guidance.';
          return recommendation;
        }
        if(!answers.measurement || !answers.trend || !answers.lineDetail){
          recommendation.message='Answer the advisor questions to receive a recommendation.';
          return recommendation;
        }
        switch(answers.measurement){
          case 'continuousNormal':
            recommendation.statsMethod='pearson';
            recommendation.rationale.push('Pearson correlation is appropriate for roughly normal, continuous variables.');
            break;
          case 'continuousNonNormal':
            recommendation.statsMethod='spearman';
            recommendation.rationale.push('Spearman correlation is robust to skewed distributions and outliers by ranking the data.');
            break;
          case 'ordinal':
            recommendation.statsMethod='spearman';
            recommendation.rationale.push('Ordinal scales break Pearson assumptions; Spearman works with ranked measurements.');
            break;
          case 'binaryOutcome':
            recommendation.statsMethod='spearman';
            recommendation.rationale.push('Binary responses violate Pearson’s normality assumption, so Spearman is safer.');
            break;
          default:
            break;
        }
        const trendLabels={
          linear:'linear regression line',
          curved:'quadratic regression curve',
          sShape:'logistic regression curve',
          exponential:'exponential regression curve',
          power:'power-law regression curve',
          multiple:'spline smoother'
        };
        switch(answers.trend){
          case 'linear':
            recommendation.regression='linear';
            recommendation.rationale.push('A straight-line model captures linear relationships.');
            break;
          case 'curved':
            recommendation.regression='quadratic';
            recommendation.rationale.push('A quadratic polynomial captures a single bend in the trend.');
            break;
          case 'sShape':
            recommendation.regression='logistic';
            recommendation.rationale.push('Logistic regression models S-shaped responses bounded between 0 and 1.');
            break;
          case 'exponential':
            recommendation.regression='exponential';
            recommendation.rationale.push('Exponential regression fits rapid growth or decay patterns.');
            break;
          case 'power':
            recommendation.regression='power';
            recommendation.rationale.push('Power regression suits scaling relationships where y varies with xᵏ.');
            break;
          case 'multiple':
            recommendation.regression='spline';
            recommendation.rationale.push('A spline smoother adapts to multiple bends without a high-order polynomial.');
            break;
          default:
            break;
        }
        switch(answers.lineDetail){
          case 'minimal':
            recommendation.showLine=true;
            recommendation.showIntervals=false;
            recommendation.showDiagnostics=false;
            recommendation.rationale.push('Showing only the fitted line keeps the scatter uncluttered.');
            break;
          case 'intervals':
            recommendation.showLine=true;
            recommendation.showIntervals=recommendation.regression!=='spline' && recommendation.regression!=='logistic';
            recommendation.showDiagnostics=false;
            recommendation.rationale.push('Confidence/prediction intervals highlight model uncertainty.');
            if(recommendation.regression==='spline' || recommendation.regression==='logistic'){
              recommendation.warnings.push('Interval shading is unavailable for spline or logistic fits and will remain hidden.');
            }
            break;
          case 'diagnostics':
            recommendation.showLine=true;
            recommendation.showIntervals=recommendation.regression!=='spline' && recommendation.regression!=='logistic';
            recommendation.showDiagnostics=true;
            recommendation.rationale.push('Diagnostics summarize residuals to check model assumptions.');
            if(recommendation.regression==='spline' || recommendation.regression==='logistic'){
              recommendation.warnings.push('Interval shading is unavailable for spline or logistic fits and will remain hidden.');
            }
            break;
          case 'hide':
            recommendation.showLine=false;
            recommendation.showIntervals=false;
            recommendation.showDiagnostics=false;
            recommendation.rationale.push('Disabling the trend line keeps the scatter free of model overlays.');
            break;
          default:
            break;
        }
        if(recommendation.regression==='logistic' && !context.approxBinaryY && !context.yWithinZeroOne){
          recommendation.warnings.push('Logistic regression expects a binary or 0–1 bounded response; verify that Y meets this condition.');
        }
        if(context.pointCount>0 && context.pointCount<6){
          recommendation.warnings.push('With fewer than six paired observations the fitted model may be unstable.');
        }
        const methodLabel=recommendation.statsMethod==='pearson'?'Pearson correlation':'Spearman correlation';
        if(recommendation.showLine){
          const regLabel=trendLabels[answers.trend] || `${recommendation.regression} fit`;
          recommendation.summary=`${methodLabel} with a ${regLabel}.`;
        }else{
          recommendation.summary=`${methodLabel} without a fitted trend line.`;
        }
        recommendation.ready=true;
        return recommendation;
      }

      function renderScatterStatsAdvisor(points, providedContext){
        const container=document.getElementById('scatterStatsAdvisor');
        if(!container){
          return;
        }
        const context=providedContext || buildScatterAdvisorContext(points||[]);
        scatterAdvisorState.context=context;
        const answers=ensureScatterAdvisorDefaults(context);
        const recommendation=computeScatterAdvisorRecommendation(answers, context);
        container.innerHTML='';
        const wrapper=document.createElement('div');
        wrapper.className='stats-advisor';
        wrapper.dataset.open=scatterAdvisorState.open?'1':'0';
        const header=document.createElement('div');
        header.className='stats-advisor__header';
        const title=document.createElement('strong');
        title.textContent='Test advisor';
        header.appendChild(title);
        const toggle=document.createElement('button');
        toggle.type='button';
        toggle.className='stats-advisor__toggle';
        toggle.textContent=scatterAdvisorState.open?'Hide advisor':'Guide me';
        toggle.addEventListener('click',()=>{
          scatterAdvisorState.open=!scatterAdvisorState.open;
          if(scatterAdvisorState.open && !scatterAdvisorState.activated){
            scatterAdvisorState.activated=true;
            console.debug('Debug: scatter statsAdvisor activated');
          }
          console.debug('Debug: scatter statsAdvisor toggled',{ open:scatterAdvisorState.open });
          renderScatterStatsAdvisor(null, scatterAdvisorState.context);
        });
        header.appendChild(toggle);
        wrapper.appendChild(header);
        const summary=document.createElement('div');
        summary.className='stats-advisor__summary';
        if(!scatterAdvisorState.activated){
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
        if(scatterAdvisorState.open){
          if(context.graphType==='scatter'){
            const questionsWrap=document.createElement('div');
            questionsWrap.className='stats-advisor__questions';
            const questions=buildScatterAdvisorQuestions(context);
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
                input.name=`scatter-advisor-${question.id}`;
                input.value=option.value;
                input.checked=answers[question.id]===option.value;
                input.addEventListener('change',()=>{
                  answers[question.id]=option.value;
                  scatterAdvisorState.answers=answers;
                  console.debug('Debug: scatter statsAdvisor answer change',{ question:question.id, value:option.value });
                  renderScatterStatsAdvisor(null, scatterAdvisorState.context);
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
              if(scatterStatType){
                scatterStatType.value=recommendation.statsMethod;
              }
              if(scatterRegressionMode){
                scatterRegressionMode.value=recommendation.regression;
              }
              if(scatterShowLine){
                scatterShowLine.checked=!!recommendation.showLine || !!recommendation.showIntervals;
              }
              if(scatterShowPlotStats && typeof recommendation.showLineStats === 'boolean'){
                scatterShowPlotStats.checked=recommendation.showLineStats;
              }
              if(scatterShowCI){
                scatterShowCI.checked = !!recommendation.showIntervals;
              }
              if(scatterShowPI){
                scatterShowPI.checked = !!recommendation.showIntervals;
              }
              if(scatterShowDiagnostics){
                scatterShowDiagnostics.checked=!!recommendation.showDiagnostics;
              }
              scatterAdvisorState.lastApplied={ ...recommendation };
              console.debug('Debug: scatter statsAdvisor applied',{
                statsMethod:recommendation.statsMethod,
                regression:recommendation.regression,
                showLine:recommendation.showLine,
                showIntervals:recommendation.showIntervals,
                showDiagnostics:recommendation.showDiagnostics,
                answers:{ ...answers }
              });
              scheduleDrawScatter();
              renderScatterStatsAdvisor(null, scatterAdvisorState.context);
              requestScatterStatsContextRefresh('stats-advisor-apply');
            });
            actions.appendChild(applyBtn);
            const resetBtn=document.createElement('button');
            resetBtn.type='button';
            resetBtn.className='stats-advisor__reset';
            resetBtn.textContent='Reset answers';
            resetBtn.addEventListener('click',()=>{
              scatterAdvisorState.answers={};
              console.debug('Debug: scatter statsAdvisor reset');
              renderScatterStatsAdvisor(null, scatterAdvisorState.context);
            });
            actions.appendChild(resetBtn);
            wrapper.appendChild(actions);
          }else{
            const hint=document.createElement('div');
            hint.className='stats-advisor__hint';
            hint.textContent='Switch to the scatter plot type to receive correlation and regression recommendations.';
            wrapper.appendChild(hint);
          }
        }
        container.appendChild(wrapper);
      }
      scatterAlphaVal.textContent=scatterAlpha.value;
      renderScatterStatsAdvisor([], buildScatterAdvisorContext([]));
      if(scatterGraphTypeSelect){
        scatterGraphTypeSelect.addEventListener('change',()=>{
          console.debug('Debug: scatter graph type change event',{value:scatterGraphTypeSelect.value});
          syncScatterGraphTypeUI();
          scheduleDrawScatter();
          if(!scatterAutoDrawState.autoDrawEnabled){
            scatterThresholdSelectionPending = true;
            return;
          }
          syncScatterThresholdSelection();
        });
      }
      if(scatterLog2FCThreshold){
        scatterLog2FCThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter log2FC threshold input',{value:scatterLog2FCThreshold.value});
          scheduleDrawScatter();
          if(!scatterAutoDrawState.autoDrawEnabled){
            scatterThresholdSelectionPending = true;
            persistTabState('scatter-log2fc-input');
            return;
          }
          syncScatterThresholdSelection();
        });
      }
      if(scatterNegLogPThreshold){
        scatterNegLogPThreshold.addEventListener('input',()=>{
          console.debug('Debug: scatter negLogP threshold input',{value:scatterNegLogPThreshold.value});
          scheduleDrawScatter();
          if(!scatterAutoDrawState.autoDrawEnabled){
            scatterThresholdSelectionPending = true;
            persistTabState('scatter-neglogp-input');
            return;
          }
          syncScatterThresholdSelection();
        });
      }
      if(scatterShowSignificantLabels){
        scatterShowSignificantLabels.addEventListener('change',()=>{
          console.debug('Debug: scatter significant label toggle',{checked:scatterShowSignificantLabels.checked});
          scheduleDrawScatter();
          if(!scatterAutoDrawState.autoDrawEnabled){
            scatterThresholdSelectionPending = true;
            persistTabState('scatter-significant-labels-change');
          }
        });
      }
      if(scatterColorMode){
        scatterColorMode.addEventListener('change',()=>{
          scatterColorModeDesired = normalizeScatterColorMode(scatterColorMode.value);
          scatterColorMode.value = scatterColorModeDesired;
          syncScatterColorModeUI(scatterColorModeApplied);
          console.debug('Debug: scatter color mode changed',{ value: scatterColorModeDesired });
          persistTabState('scatter-color-mode-change');
          scheduleDrawScatter();
        });
      }
      if(scatterDensityPalette){
        scatterDensityPalette.addEventListener('change',()=>{
          scatterDensityPalette.value = normalizeScatterDensityPalette(scatterDensityPalette.value);
          console.debug('Debug: scatter density palette changed',{ value: scatterDensityPalette.value });
          scheduleDrawScatter();
        });
      }
      scatterFill.addEventListener('input',()=>{console.log('scatterFill changed', scatterFill.value); scheduleDrawScatter();});
      scatterBorder.addEventListener('input',()=>{console.log('scatterBorder changed', scatterBorder.value); scheduleDrawScatter();});
      scatterBorderWidth.addEventListener('input',()=>{console.log('scatterBorderWidth changed', scatterBorderWidth.value); scheduleDrawScatter();});
      scatterDotSize.addEventListener('input',()=>{
        const raw = Number(scatterDotSize.value);
        if(Number.isFinite(raw)){
          // Enable manual override on user input
          scatterState.dotSizeOverrideEnabled = true;
          scatterState.dotSizeOverrideRaw = raw;
        }else{
          // Non-finite input disables override and falls back to auto sizing
          scatterState.dotSizeOverrideEnabled = false;
          scatterState.dotSizeOverrideRaw = null;
        }
        console.log('scatterDotSize changed', scatterState.dotSizeOverrideEnabled ? scatterState.dotSizeOverrideRaw : '(auto)');
        scheduleDrawScatter();
      });
      scatterAlpha.addEventListener('input',()=>{scatterAlphaVal.textContent=scatterAlpha.value; console.log('scatterAlpha changed',scatterAlpha.value); scheduleDrawScatter();});
      scatterFontSize.addEventListener('input',()=>{
        if(scatterFontSize.dataset){
          scatterFontSize.dataset.fontBasePt = String(scatterFontSize.value);
          console.debug('Debug: scatter font size input manual set',{ value: scatterFontSize.value }); // Debug: manual slider update
        }
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, pt: Number(scatterFontSize.value), input: scatterFontSize, manual: true });
        scheduleDrawScatter();
      });
      [scatterShowGrid,scatterStatType,scatterOriginMode,scatterShowLine,scatterShowPlotStats,scatterShowCI,scatterShowPI,scatterShowDiagnostics]
        .forEach(el=>el&&el.addEventListener('change',()=>{
          console.debug('Debug: scatter config changed', { id: el.id, checked: el.checked, value: el.value });
          if(el===scatterOriginMode){
            const xOk=revalidateActiveScatterLogAxis('x','origin-mode-change');
            const yOk=revalidateActiveScatterLogAxis('y','origin-mode-change');
            if(!xOk||!yOk){
              return;
            }
          }
          if(el===scatterStatType){
            requestScatterStatsContextRefresh(`${el.id||'scatter-control'}-change`);
            persistTabState('scatter-stat-type-change');
          }else if(el===scatterShowDiagnostics && scatterHasComputedStats()){
            try{
              runScatterStatsComputation(scatterState.statsContext);
              setScatterStatsStatus('Statistics up to date.');
            }catch(renderErr){
              console.error('scatter diagnostics toggle rerender failed',renderErr);
            }
          }
          scheduleDrawScatter();
        }));
      // CI/PI controls depend on the trend line checkbox (scatterShowLine).
      const updateCIEnabled = ()=>{
        const masterOn = !!(scatterShowLine && scatterShowLine.checked);
        const regressionDisabled = !!(scatterShowLine && scatterShowLine.disabled);
        const disabledState = regressionDisabled || !masterOn;
        if(scatterShowCI){
          scatterShowCI.disabled = disabledState;
          const lab = scatterShowCI.closest && scatterShowCI.closest('label');
          if(lab){ lab.classList.toggle('config-panel__checkbox--disabled', !!disabledState); }
        }
        if(scatterShowPI){
          scatterShowPI.disabled = disabledState;
          const lab = scatterShowPI.closest && scatterShowPI.closest('label');
          if(lab){ lab.classList.toggle('config-panel__checkbox--disabled', !!disabledState); }
        }
      };
      updateCIEnabled();
      if(scatterShowLine){
        scatterShowLine.addEventListener('change',()=>{ updateCIEnabled(); persistTabState('scatter-trendline-change'); scheduleDrawScatter(); });
      }
      if(scatterShowCI){
        scatterShowCI.addEventListener('change',()=>{
          // Prevent enabling CI unless the trend line is active
          if(!(scatterShowLine && scatterShowLine.checked)){
            if(scatterShowCI.checked){ scatterShowCI.checked = false; }
            return;
          }
          persistTabState('scatter-interval-ci-change');
          scheduleDrawScatter();
        });
      }
      if(scatterShowPI){
        scatterShowPI.addEventListener('change',()=>{
          // Prevent enabling PI unless the trend line is active
          if(!(scatterShowLine && scatterShowLine.checked)){
            if(scatterShowPI.checked){ scatterShowPI.checked = false; }
            return;
          }
          persistTabState('scatter-interval-pi-change');
          scheduleDrawScatter();
        });
      }
      const handleScatterLogToggle=(axis,checkbox)=>{
        checkbox?.addEventListener('change',()=>{
          const enabling=!!checkbox.checked;
          if(enabling){
            const validation=validateScatterLogAxis(axis);
            if(!validation.allowed){
              if(validation.canUsePlusOne && validation.hasZeros && !validation.hasNegatives){
                const axisLabel=axis==='x'?'X':'Y';
                const useLogPlusOne = global.confirm(`Your data contains zero values on the ${axisLabel} axis. Would you like to add +1 to all values before log transform?\n\nThis will plot log(x+1) instead of log(x).`);
                if(useLogPlusOne){
                  if(axis==='x'){
                    scatterState.logPlusOneX = true;
                  }else{
                    scatterState.logPlusOneY = true;
                  }
                  clearScatterLogWarning();
                  console.debug('Debug: scatter log+1 enabled by user confirmation',{ axis });
                  scheduleDrawScatter();
                  return;
                }else{
                  checkbox.checked = false;
                  if(axis==='x'){
                    scatterState.logPlusOneX = false;
                  }else{
                    scatterState.logPlusOneY = false;
                  }
                  console.debug('Debug: scatter log scale cancelled by user',{ axis });
                  return;
                }
              }
              checkbox.checked=false;
              const warningMessage=validation.message||`Cannot enable log scale on the ${axis==='x'?'X':'Y'} axis while non-positive values are present.`;
              showScatterLogWarning(warningMessage);
              console.warn('scatter log axis blocked',{ axis, reason: validation.reason, value: validation.value });
              return;
            }
            if(axis==='x'){
              scatterState.logPlusOneX = false;
            }else{
              scatterState.logPlusOneY = false;
            }
            clearScatterLogWarning();
          }else{
            if(axis==='x'){
              scatterState.logPlusOneX = false;
            }else{
              scatterState.logPlusOneY = false;
            }
            clearScatterLogWarning();
          }
          console.debug('Debug: scatter log toggle change',{ id: checkbox.id, checked: checkbox.checked });
          scheduleDrawScatter();
        });
      };
      handleScatterLogToggle('x',scatterLogX);
      handleScatterLogToggle('y',scatterLogY);
      if(scatterRegressionMode){
        scatterRegressionMode.addEventListener('change',()=>{
          console.debug('Debug: scatter regression mode change',{ value: scatterRegressionMode.value });
          requestScatterStatsContextRefresh('regression-mode-change');
          persistTabState('scatter-regression-mode-change');
          scheduleDrawScatter();
        });
      }
      scatterShowFrame.addEventListener('change',()=>{console.debug('Debug: scatter showFrame change',{checked:scatterShowFrame.checked}); scheduleDrawScatter();});
      if(scatterShowLegend){
        scatterShowLegend.addEventListener('change',()=>{
          if(scatterLegendChangeInternal){
            return;
          }
          console.debug('Debug: scatter showLegend change',{checked:scatterShowLegend.checked});
          scheduleDrawScatter();
        });
      }
      const scatterAxisInputs=[
        { el: scatterXMin, axis: 'x', context: 'axis-min-input', logLabel: 'scatterXMin changed' },
        { el: scatterXMax, axis: 'x', context: 'axis-max-input', logLabel: 'scatterXMax changed' },
        { el: scatterYMin, axis: 'y', context: 'axis-min-input', logLabel: 'scatterYMin changed' },
        { el: scatterYMax, axis: 'y', context: 'axis-max-input', logLabel: 'scatterYMax changed' },
        { el: scatterOriginX, axis: 'x', context: 'origin-input', logLabel: 'scatterOriginX changed' },
        { el: scatterOriginY, axis: 'y', context: 'origin-input', logLabel: 'scatterOriginY changed' }
      ];
      scatterAxisInputs.forEach(({el,axis,context,logLabel})=>{
        if(!el){
          return;
        }
        el.addEventListener('input',()=>{
          console.log(logLabel, el.value);
          if(!revalidateActiveScatterLogAxis(axis,context)){
            return;
          }
          if(!scatterLogX?.checked && !scatterLogY?.checked){
            clearScatterLogWarning();
          }
          scheduleDrawScatter();
        });
      });
      syncScatterGraphTypeUI();

      function ensureScatterLabelColors(labels){
        if(scatterCurrentGraphType!=='scatter'){
          return;
        }
        const labelSet=new Set(labels);
        labels.forEach((lab,i)=>{
          if(!scatterLabelColors[lab]){
            scatterLabelColors[lab]=DEFAULT_SCATTER_COLORS[i%DEFAULT_SCATTER_COLORS.length];
            console.debug('Debug: scatter default label color applied',{label:lab,color:scatterLabelColors[lab]});
          }
        });
        Object.keys(scatterLabelColors).forEach(existing=>{
          if(!labelSet.has(existing)){
            console.debug('Debug: scatter label color pruned',{label:existing});
            delete scatterLabelColors[existing];
          }
        });
        console.debug('Debug: ensureScatterLabelColors sync complete',{count:Object.keys(scatterLabelColors).length});
      }

      function sanitizeScatterLabelShape(value, index){
        if(SCATTER_SHAPE_VALUES.has(value)){
          return value;
        }
        const safeIndex = Number.isInteger(index) ? index : 0;
        return SCATTER_SHAPE_DEFAULTS[safeIndex % SCATTER_SHAPE_DEFAULTS.length];
      }

      function ensureScatterLabelShapes(labels){
        if(scatterCurrentGraphType!=='scatter'){
          scatterLabelShapes = {};
          return;
        }
        const labelSet = new Set(labels);
        labels.forEach((lab, idx)=>{
          if(!lab){ return; }
          const sanitized = sanitizeScatterLabelShape(scatterLabelShapes[lab], idx);
          scatterLabelShapes[lab] = sanitized;
        });
        Object.keys(scatterLabelShapes).forEach(existing=>{
          if(!labelSet.has(existing)){
            delete scatterLabelShapes[existing];
          }
        });
        scatterDebug('Debug: ensureScatterLabelShapes sync complete',{count:Object.keys(scatterLabelShapes).length});
      }

      function computeScatterLabelDistribution(points){
        const summary = {
          totalPoints: Array.isArray(points) ? points.length : 0,
          labeledPointCount: 0,
          labelCount: 0,
          pureUnique: false,
          averageFrequency: 0,
          shouldUseUniform: false
        };
        if(!Array.isArray(points) || points.length === 0){
          return summary;
        }
        const counts = new Map();
        for(let i = 0; i < points.length; i += 1){
          const rawLabel = points[i]?.label;
          const label = rawLabel ? String(rawLabel) : '';
          if(!label){
            continue;
          }
          summary.labeledPointCount += 1;
          counts.set(label, (counts.get(label) || 0) + 1);
        }
        summary.labelCount = counts.size;
        if(summary.labelCount === 0 || summary.labeledPointCount === 0){
          return summary;
        }
        summary.pureUnique = Array.from(counts.values()).every(count => count === 1);
        const total = summary.totalPoints > 0 ? summary.totalPoints : summary.labeledPointCount;
        summary.averageFrequency = (summary.labeledPointCount / summary.labelCount) / total;
        summary.shouldUseUniform = summary.pureUnique || summary.averageFrequency < 0.05;
        scatterDebug('Debug: scatter label distribution', {
          labelCount: summary.labelCount,
          labeledPointCount: summary.labeledPointCount,
          totalPoints: summary.totalPoints,
          pureUnique: summary.pureUnique,
          averageFrequency: summary.averageFrequency,
          shouldUseUniform: summary.shouldUseUniform
        });
        return summary;
      }

      function createScatterMarkerElement(shape, options){
        const doc = global.document;
        if(!doc){ return null; }
        const normalized = SCATTER_SHAPE_VALUES.has(shape) ? shape : 'circle';
        const radius = Math.max(0, Number(options?.radius) || 0);
        const cx = Number(options?.cx) || 0;
        const cy = Number(options?.cy) || 0;
        const fill = options?.fill ?? '#000000';
        const stroke = options?.stroke ?? null;
        const strokeWidthRaw = Number(options?.strokeWidth);
        const strokeWidth = Number.isFinite(strokeWidthRaw) && strokeWidthRaw > 0 ? strokeWidthRaw : 0;
        const fillOpacityRaw = Number(options?.fillOpacity);
        const fillOpacity = Number.isFinite(fillOpacityRaw) ? Math.min(Math.max(fillOpacityRaw, 0), 1) : 1;
        const strokeOpacityRaw = Number(options?.strokeOpacity);
        const strokeOpacity = Number.isFinite(strokeOpacityRaw) ? Math.min(Math.max(strokeOpacityRaw, 0), 1) : fillOpacity;
        const applyCommonAttributes = (node) => {
          if(!node){ return null; }
          node.setAttribute('fill', fill);
          if(fillOpacity !== 1){
            node.setAttribute('fill-opacity', String(fillOpacity));
          }
          if(stroke && strokeWidth > 0){
            node.setAttribute('stroke', stroke);
            node.setAttribute('stroke-width', String(strokeWidth));
            if(strokeOpacity !== 1){
              node.setAttribute('stroke-opacity', String(strokeOpacity));
            }
          }else if(stroke){
            node.setAttribute('stroke', stroke);
            node.setAttribute('stroke-width', '0');
            if(strokeOpacity !== 1){
              node.setAttribute('stroke-opacity', String(strokeOpacity));
            }
          }
          return node;
        };
        if(normalized === 'square'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const rect = doc.createElementNS(NS, 'rect');
          rect.setAttribute('x', String(cx - half));
          rect.setAttribute('y', String(cy - half));
          rect.setAttribute('width', String(size));
          rect.setAttribute('height', String(size));
          return applyCommonAttributes(rect);
        }
        if(normalized === 'triangle'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const path = doc.createElementNS(NS, 'path');
          const d = `M ${cx} ${cy - half} L ${cx + half} ${cy + half} L ${cx - half} ${cy + half} Z`;
          path.setAttribute('d', d);
          return applyCommonAttributes(path);
        }
        if(normalized === 'diamond'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const path = doc.createElementNS(NS, 'path');
          const d = `M ${cx} ${cy - half} L ${cx + half} ${cy} L ${cx} ${cy + half} L ${cx - half} ${cy} Z`;
          path.setAttribute('d', d);
          return applyCommonAttributes(path);
        }
        if(normalized === 'cross'){
          const size = Math.max(radius * 2, 2);
          const half = size / 2;
          const bar = Math.max(size / 3, 2);
          const halfBar = bar / 2;
          const top = cy - half;
          const bottom = cy + half;
          const left = cx - half;
          const right = cx + half;
          const path = doc.createElementNS(NS, 'path');
          const d = `M ${cx - halfBar} ${top} H ${cx + halfBar} V ${cy - halfBar} H ${right} V ${cy + halfBar} H ${cx + halfBar} V ${bottom} H ${cx - halfBar} V ${cy + halfBar} H ${left} V ${cy - halfBar} H ${cx - halfBar} Z`;
          path.setAttribute('d', d);
          return applyCommonAttributes(path);
        }
        const circle = doc.createElementNS(NS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', String(radius));
        return applyCommonAttributes(circle);
      }

      function createBubbleRadiusScaler(points, baseRadius){
        const safeBase = Math.max(1, Number(baseRadius) || 1);
        let minValue = Infinity;
        let maxValue = -Infinity;
        let count = 0;
        if(Array.isArray(points)){
          for(let i = 0; i < points.length; i += 1){
            const point = points[i];
            if(!point){ continue; }
            const raw = point.bubbleValue;
            const magnitude = Math.abs(Number(raw));
            if(!Number.isFinite(magnitude)){ continue; }
            if(magnitude < minValue){ minValue = magnitude; }
            if(magnitude > maxValue){ maxValue = magnitude; }
            count += 1;
          }
        }
        const minRadius = Math.max(1, safeBase * 0.6);
        const maxRadius = Math.max(minRadius + 1, safeBase * 2.8);
        if(count === 0){
          const fallback = Math.max(minRadius, Math.min(maxRadius, safeBase));
          return () => fallback;
        }
        if(maxValue <= minValue){
          const radius = Math.max(minRadius, Math.min(maxRadius, safeBase));
          return () => radius;
        }
        return point => {
          const value = Math.abs(Number(point?.bubbleValue));
          if(!Number.isFinite(value)){
            return minRadius;
          }
          const ratio = (value - minValue) / (maxValue - minValue);
          const clamped = Math.min(Math.max(ratio, 0), 1);
          return minRadius + (maxRadius - minRadius) * clamped;
        };
      }

    
      const scatterPlotDiv=document.getElementById('scatterPlot');
      const scatterContainer=scatterPlotDiv.closest('.svgbox')||scatterPlotDiv.parentElement;
      if(!scatterContainer){
        console.debug('Debug: scatter resizer container missing', { hasContainer: !!scatterContainer });
      }

      let scatterTitleText='Scatter plot';
      let scatterXLabelText='X';
      let scatterYLabelText='Y';
      let scatterZLabelText='Z';
      let scatterLabelPositions = { title: null, xLabel: null, yLabel: null, stats: null, legend: null };
      async function drawScatter(){
        const debugEnabled = typeof Shared.isDebugEnabled === 'function' ? Shared.isDebugEnabled() : false;
        const debug = debugEnabled ? console.debug.bind(console) : () => {};
        const info = debugEnabled ? console.log.bind(console) : () => {};
        const time = debugEnabled ? console.time.bind(console) : () => {};
        const timeEnd = debugEnabled ? console.timeEnd.bind(console) : () => {};
        const rowSkipCounts = debugEnabled ? Object.create(null) : null;
        const recordRowSkip = debugEnabled
          ? (reason => {
              rowSkipCounts[reason] = (rowSkipCounts[reason] || 0) + 1;
            })
          : () => {};
        const collectProgressInterval = 5000;
        let nextCollectProgressRow = debugEnabled ? collectProgressInterval : Number.POSITIVE_INFINITY;
        const pointProgressInterval = 5000;
        let nextPointProgress = debugEnabled ? pointProgressInterval : Number.POSITIVE_INFINITY;
        const token=++scatterDrawToken; // debug token for cancellation
        info('drawScatter called',{token});
        let statsContextPayload=null;
        scatterState.rotationPending = false;
        scatterState.rotationPendingLogged = false;
        hideScatterTooltip('draw-start');
        const fill=scatterFill.value||DEFAULT_NON_SIG_COLOR;
        const alpha=Number(scatterAlpha.value)||0;
        const borderWidthRaw=Number(scatterBorderWidth.value);
        const borderColor=scatterBorder.value;
        const containerRect=scatterSvgBox?.getBoundingClientRect?.();
        const fontInfo=chartStyle.resolveScaledFontSize({
          rawSize: scatterFontSize.value,
          width: containerRect?.width,
          height: containerRect?.height,
          svgBox: scatterSvgBox,
          input: scatterFontSize
        });
        const fs=fontInfo.scaledPx;
        const styleScaleInfo=fontInfo.scaleInfo;
        const axisStrokeWidthBase = getScatterAxisStrokeWidth();
        const axisStrokeWidth=chartStyle.scaleStrokeWidth(axisStrokeWidthBase, styleScaleInfo, { context: 'scatter-axis', min: 0.25 });
        const axisStroke = getScatterAxisColor();
        const dotSizeInputRaw=Number(scatterDotSize.value)||3;
        // Initial dotSizePx uses user input; will be recalculated with adaptive sizing after points are collected
        let dotSizeRaw=dotSizeInputRaw;
        let dotSizePx=chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'scatter-point', min: 0 });
        const borderWidthPx=chartStyle.scaleStrokeWidth(borderWidthRaw, styleScaleInfo, { context: 'scatter-border', min: 0 });
        const baseAnnotationFontPx = Math.max(fs * 0.65, 7);
        let annotationFontPx = baseAnnotationFontPx;
        let annotationCrowdingScale = 1;
        const annotationStrokeWidthBase = chartStyle.scaleStrokeWidth(0.85, styleScaleInfo, { context: 'scatter-annotation', min: 0.45 });
        let annotationStrokeWidth = annotationStrokeWidthBase;
        debug('Debug: scatter style scaling applied',{
          dotSizeRaw,
          dotSizePx,
          borderWidthRaw,
          borderWidthPx,
          axisStrokeWidth,
          axisStrokeWidthBase,
          axisStroke,
          styleScale: styleScaleInfo?.styleScale
        }); // Debug: scatter style scaling summary
        chartStyle.renderFontSizeLabel({ element: scatterFontSizeVal, fontInfo, input: scatterFontSize });
        debug('Debug: scatter font scaling applied',{
          input: scatterFontSize.value,
          fontSizePt: fontInfo.pt,
          baseFontPx: fontInfo.px,
          scaledFontPx: fs,
          scale: fontInfo.scaleInfo?.scale,
          containerWidth: containerRect?.width,
          containerHeight: containerRect?.height
        }); // Debug: scatter font scaling summary
        const axisMetrics=chartStyle.createAxisMetrics(fs);
        debug('Debug: scatter axis metrics',axisMetrics);
        const showGrid=scatterShowGrid.checked;
        info('scatter showGrid', showGrid);
        const showFrame=scatterShowFrame.checked;
        debug('Debug: scatter showFrame state',{showFrame});
        let showLegend = scatterShowLegend ? scatterShowLegend.checked : true;
        debug('Debug: scatter legend toggle state',{ showLegend });
        let showLine=scatterShowLine.checked;
        let showLineStats = scatterShowPlotStats ? scatterShowPlotStats.checked : false;
        const showIntervals = !!(showLine && ((scatterShowCI && scatterShowCI.checked) || (scatterShowPI && scatterShowPI.checked)));
        const showDiagnostics = !!(scatterShowDiagnostics && scatterShowDiagnostics.checked);
        const graphType=scatterGraphTypeSelect?.value || 'scatter';
        scatterCurrentGraphType=graphType;
        const allowLogAxes=graphType==='scatter';
        if(!allowLogAxes){
          if(scatterLogX?.checked){
            scatterLogX.checked=false;
          }
          if(scatterLogY?.checked){
            scatterLogY.checked=false;
          }
          if(showLine){
            showLine=false;
          }
          if(showLineStats){
            showLineStats=false;
          }
        }
        const logX=allowLogAxes && scatterLogX ? scatterLogX.checked : false;
        const logY=allowLogAxes && scatterLogY ? scatterLogY.checked : false;
        if(scatterShowLine){
          scatterShowLine.disabled=!allowLogAxes;
          if(!allowLogAxes && scatterShowLine.checked){
            scatterShowLine.checked=false;
          }
        }
        if(scatterShowPlotStats){
          scatterShowPlotStats.disabled=!allowLogAxes;
          if(!allowLogAxes && scatterShowPlotStats.checked){
            scatterShowPlotStats.checked=false;
          }
        }
        debug('Debug: scatter graph type resolved',{graphType,allowLogAxes,logX,logY});
        if(!allowLogAxes){
          debug('Debug: scatter forcing trend line off',{graphType});
        }
        debug('Debug: scatter regression toggles', { showLine, showLineStats, showIntervals, showDiagnostics });
        info('drawScatter dot size', dotSizeRaw);
        const log2fcThresholdValue=parseFloat(scatterLog2FCThreshold?.value);
        const negLogPThresholdValue=parseFloat(scatterNegLogPThreshold?.value);
        const log2fcThreshold=Number.isFinite(log2fcThresholdValue)?log2fcThresholdValue:0;
        const negLogPThreshold=Number.isFinite(negLogPThresholdValue)?negLogPThresholdValue:0;
        debug('Debug: scatter threshold values',{graphType,log2fcThreshold,negLogPThreshold});
        const method=scatterStatType.value;
        const xMinManual=parseFloat(scatterXMin.value);
        const xMaxManual=parseFloat(scatterXMax.value);
        const yMinManual=parseFloat(scatterYMin.value);
        const yMaxManual=parseFloat(scatterYMax.value);
        info('scatter manual range',{xMinManual,xMaxManual,yMinManual,yMaxManual});
        const originMode=scatterOriginMode.value;
        const originXInput=parseFloat(scatterOriginX.value);
        const originYInput=parseFloat(scatterOriginY.value);
        info('scatter origin inputs',{originMode,originXInput,originYInput});
        const analysis = scatterHot?.getAnalysisData?.() || Shared.hot.getAnalysisData(scatterHot);
        const rowCount = analysis.rowCount || 0;
        const colCount = analysis.colCount || 0;
        const extractColumn = (colIndex)=>{
          if(colIndex >= colCount){
            return [];
          }
          const values = [];
          for(let r = 0; r < rowCount; r++){
            values.push(analysis.data?.[r]?.[colIndex]);
          }
          return values;
        };
        if(analysis.isColumnExcluded?.(1) || analysis.isColumnExcluded?.(2)){
          console.warn('Scatter draw cancelled - axis column excluded',{ excludeX: analysis.isColumnExcluded?.(1), excludeY: analysis.isColumnExcluded?.(2) });
          chartStyle.clearSvg(scatterSvg);
          primeScatterStatsContext(null,{ placeholder:'Statistics unavailable until both axes are included.' });
          return;
        }
        const layout = resolveScatterColumnLayout(analysis.data, colCount);
        const labelCol = extractColumn(layout.labelCol);
        const xCol = extractColumn(layout.xCol);
        const yCol = extractColumn(layout.yCol);
        const extraCol = extractColumn(layout.extraCol);
        const pointLabelCol = Number.isInteger(layout.pointLabelCol)
          ? extractColumn(layout.pointLabelCol)
          : [];
        const selectedRowSet = getScatterSelectedRowSet(scatterHot);
        const hasPointLabelFlags = pointLabelCol.some((value, idx) => (
          idx > 0 && parseScatterPointLabelFlag(value)
        ));
        const useSelectionFallback = !hasPointLabelFlags
          && selectedRowSet
          && selectedRowSet.size > 0;
        info('scatter column lengths',{
          label:labelCol.length,
          x:xCol.length,
          y:yCol.length,
          extra:extraCol.length,
          pointLabel:pointLabelCol.length,
          layout
        });
        const xLabelRaw=xCol[0];
        const yLabelRaw=yCol[0];
        const extraLabelRaw=extraCol[0];
        if(graphType==='volcano'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'log2 Fold Change';
          const basePLabel=(yLabelRaw&&String(yLabelRaw).trim())||'p-value';
          scatterYLabelText=`-log10(${basePLabel})`;
        }else if(graphType==='ma'){
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'Mean Expression';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'log2 Fold Change';
        }else{
          scatterXLabelText=(xLabelRaw&&String(xLabelRaw).trim())||'X';
          scatterYLabelText=(yLabelRaw&&String(yLabelRaw).trim())||'Y';
          const zHeader = extraLabelRaw && String(extraLabelRaw).trim();
          scatterZLabelText = zHeader || 'Z';
        }
        const maxLen=rowCount;
        let points=[];
        const shouldCollectLabelSet = scatterCurrentGraphType === 'scatter';
        const labelSet=shouldCollectLabelSet ? new Set() : null;
        let annotationRequests = [];
        let annotationLeaderPadding = 0;
        let annotationTextPadding = 0;
        let annotationAxisPadding = 0;
        let legendLayout=null;
        let legendRenderer=EMPTY_LEGEND_RENDERER;
        let legendGapPx=0;
        let legendWidth=0;
        let xMinRaw=Infinity,xMaxRaw=-Infinity,yMinRaw=Infinity,yMaxRaw=-Infinity;
        let skippedRows=0;
        let significantCount=0;
        let maMissingPCount=0;
        const hasZColumn = colCount > 3;
        const scatter3dCandidates = [];
        let scatter3dEligible = graphType === 'scatter' && hasZColumn;
        let scatter3dMissingZ = 0;
        let scatter3dInvalidZ = 0;
        let zMinRaw=Infinity, zMaxRaw=-Infinity;
        let bubbleEligible = graphType === 'scatter' && hasZColumn;
        let bubbleValidCount = 0;
        let bubbleInvalidCount = 0;
        let bubbleMissingCount = 0;
        let bubbleMinRaw = Infinity;
        let bubbleMaxRaw = -Infinity;
        time(`scatterCollectPoints_${token}`);
        for(let r=1;r<maxLen;r++){
          const labelValue = labelCol[r];
          const lab=labelValue ? String(labelValue).trim() : '';
          const isManualLabel = parseScatterPointLabelFlag(pointLabelCol[r])
            || (useSelectionFallback && selectedRowSet?.has(r));
          const rawX=xCol[r];
          const rawY=yCol[r];
          if(graphType==='scatter'){
            if(rawX === null || rawY === null || typeof rawX === 'undefined' || typeof rawY === 'undefined'){
              skippedRows++;
              recordRowSkip('scatter:missingValue');
              continue;
            }
            const xv=parseFloat(rawX);
            const yv=parseFloat(rawY);
            const rawZ = hasZColumn ? extraCol[r] : undefined;
            const hasZValue = hasZColumn && rawZ !== null && typeof rawZ !== 'undefined' && rawZ !== '';
            const zv = hasZValue ? Number(rawZ) : NaN;
            if(!Number.isNaN(xv) && Number.isFinite(xv) && !Number.isNaN(yv) && Number.isFinite(yv)){
              const pointRecord = {x:xv,y:yv,label:lab,pointName:lab,rowIndex:r,isManualLabel};
              if(hasZValue && Number.isFinite(zv)){
                pointRecord.z = zv;
                pointRecord.bubbleValue = zv;
                scatter3dCandidates.push({ x: xv, y: yv, z: zv, label: lab, pointName: lab, rowIndex: r, isManualLabel, index: scatter3dCandidates.length });
                if(zv<zMinRaw) zMinRaw=zv;
                if(zv>zMaxRaw) zMaxRaw=zv;
                if(zv<bubbleMinRaw) bubbleMinRaw = zv;
                if(zv>bubbleMaxRaw) bubbleMaxRaw = zv;
                bubbleValidCount += 1;
              }else if(hasZValue){
                scatter3dEligible = false;
                scatter3dInvalidZ += 1;
                recordRowSkip('scatter3d:nonNumericZ');
                bubbleEligible = false;
                bubbleInvalidCount += 1;
              }else{
                scatter3dEligible = false;
                scatter3dMissingZ += 1;
                if(hasZColumn){
                  bubbleEligible = false;
                  bubbleMissingCount += 1;
                }
              }
              if(!hasZValue && hasZColumn){
                pointRecord.bubbleValue = NaN;
              }
              points.push(pointRecord);
              if(labelSet && lab) labelSet.add(lab);
              if(xv<xMinRaw) xMinRaw=xv;
              if(xv>xMaxRaw) xMaxRaw=xv;
              if(yv<yMinRaw) yMinRaw=yv;
              if(yv>yMaxRaw) yMaxRaw=yv;
            }else{
              skippedRows++;
              recordRowSkip('scatter:nonNumeric');
            }
          }else if(graphType==='volcano'){
            if(rawX === null || rawY === null || typeof rawX === 'undefined' || typeof rawY === 'undefined'){
              skippedRows++;
              recordRowSkip('volcano:missingValue');
              continue;
            }
            const log2fc=parseFloat(rawX);
            const pRaw=parseFloat(rawY);
            if(Number.isFinite(log2fc) && Number.isFinite(pRaw) && pRaw>0){
              let negLogP=-Math.log10(pRaw);
              if(!Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=Math.abs(log2fc)>=log2fcThreshold && negLogP>=negLogPThreshold;
              const isThresholdLabel = (scatterShowSignificantLabels ? !!scatterShowSignificantLabels.checked : true) && isSignificant;
              points.push({x:log2fc,y:negLogP,label:'',pointName:lab,rowIndex:r,isManualLabel,isSignificant,isThresholdLabel});
              if(isSignificant){
                significantCount++;
              }
              if(labelSet && lab) labelSet.add(lab);
              if(log2fc<xMinRaw) xMinRaw=log2fc;
              if(log2fc>xMaxRaw) xMaxRaw=log2fc;
              if(negLogP<yMinRaw) yMinRaw=negLogP;
              if(negLogP>yMaxRaw) yMaxRaw=negLogP;
            }else{
              skippedRows++;
              recordRowSkip('volcano:invalid');
            }
          }else{
            if(rawX === null || rawY === null || typeof rawX === 'undefined' || typeof rawY === 'undefined'){
              skippedRows++;
              recordRowSkip('ma:missingValue');
              continue;
            }
            const meanExpr=parseFloat(rawX);
            const log2fcVal=parseFloat(rawY);
            const rawExtra = extraCol[r];
            const pRaw = rawExtra === null || typeof rawExtra === 'undefined' ? NaN : parseFloat(rawExtra);
            const hasPositiveP=Number.isFinite(pRaw) && pRaw>0;
            if(Number.isFinite(meanExpr) && Number.isFinite(log2fcVal)){
              let negLogP=hasPositiveP?-Math.log10(pRaw):NaN;
              if(hasPositiveP && !Number.isFinite(negLogP)){
                negLogP=-Math.log10(Number.MIN_VALUE);
              }
              const isSignificant=hasPositiveP && Math.abs(log2fcVal)>=log2fcThreshold && Number.isFinite(negLogP) && negLogP>=negLogPThreshold;
              const isThresholdLabel = (scatterShowSignificantLabels ? !!scatterShowSignificantLabels.checked : true) && isSignificant;
              const labelValueFinal = lab && shouldCollectLabelSet ? lab : '';
              points.push({x:meanExpr,y:log2fcVal,label:labelValueFinal,pointName:lab,rowIndex:r,isManualLabel,isSignificant,isThresholdLabel});
              if(isSignificant) significantCount++;
              if(!hasPositiveP){
                maMissingPCount++;
                recordRowSkip('ma:missingPositiveP');
              }
              if(labelSet && lab) labelSet.add(lab);
              if(meanExpr<xMinRaw) xMinRaw=meanExpr;
              if(meanExpr>xMaxRaw) xMaxRaw=meanExpr;
              if(log2fcVal<yMinRaw) yMinRaw=log2fcVal;
              if(log2fcVal>yMaxRaw) yMaxRaw=log2fcVal;
            }else{
              skippedRows++;
              recordRowSkip('ma:nonNumeric');
            }
          }
          if(r >= nextCollectProgressRow){
            info('scatter collect progress',{row:r,token});
            nextCollectProgressRow += collectProgressInterval;
          }
        }
        timeEnd(`scatterCollectPoints_${token}`);
        if(debugEnabled && rowSkipCounts && Object.keys(rowSkipCounts).length){
          debug('Debug: scatter row skip summary',{graphType,skippedRows,reasons:rowSkipCounts});
        }else if(skippedRows>0){
          debug('Debug: scatter skipped rows summary',{graphType,skippedRows});
        }
        if(debugEnabled && maMissingPCount>0){
          debug('Debug: MA missing p-values summary',{count:maMissingPCount});
        }
        if(scatterCurrentGraphType==='scatter'){
          debug('Debug: scatter 3d candidate summary',{
            hasZColumn,
            eligible: scatter3dEligible,
            candidateCount: scatter3dCandidates.length,
            missingZ: scatter3dMissingZ,
            invalidZ: scatter3dInvalidZ
          });
          debug('Debug: scatter bubble candidate summary',{
            hasZColumn,
            eligible: bubbleEligible,
            validCount: bubbleValidCount,
            invalidCount: bubbleInvalidCount,
            missingCount: bubbleMissingCount,
            min: bubbleMinRaw,
            max: bubbleMaxRaw
          });
        }
        const labelsUsed=labelSet?Array.from(labelSet):[];
        debug('Debug: scatter label summary',{graphType:scatterCurrentGraphType,labelCount:labelsUsed.length,tracked:shouldCollectLabelSet}); // Debug: label usage summary
        if(scatterCurrentGraphType!=='scatter'){
          renderScatterStatsAdvisor([], buildScatterAdvisorContext([]));
        }
        ensureScatterLabelColors(labelsUsed);
        ensureScatterLabelShapes(labelsUsed);
        const labelShapeLookup=new Map();
        labelsUsed.forEach((lab, idx)=>{
          if(!lab){ return; }
          const sanitized = sanitizeScatterLabelShape(scatterLabelShapes[lab], idx);
          scatterLabelShapes[lab] = sanitized;
          labelShapeLookup.set(lab, sanitized);
        });
        info('scatter points collected',points.length,{xMinRaw,xMaxRaw,yMinRaw,yMaxRaw,graphType});
        const significanceLegendNeeded=scatterCurrentGraphType!=='scatter';
        const shouldRenderSignificantLabels = false;
        if(token!==scatterDrawToken){info('scatter draw cancelled after collect',{token});return;}
        const plotEl=document.getElementById('scatterPlot');
        plotEl.style.display='block';
        const clearScatterPlot=()=>{
          if(!plotEl){
            return;
          }
          while(plotEl.firstChild){
            plotEl.removeChild(plotEl.firstChild);
          }
        };
        const renderScatterNotice=(message)=>{
          plotEl.style.aspectRatio='';
          plotEl.style.padding='';
          clearScatterPlot();
          const notice=document.createElement('i');
          notice.textContent=message;
          plotEl.appendChild(notice);
        };
        if(!points.length){
          renderScatterNotice('No valid data points to plot.');
          debug('Debug: scatter plot aborted due to empty dataset',{graphType});
          primeScatterStatsContext(null,{ placeholder:'Add data to enable statistics.' });
          return;
        }
        if(logX&&points.some(p=>p.x<=0)){
          if(!scatterState.logPlusOneX){
            renderScatterNotice('Log scale requires positive X values.');
            primeScatterStatsContext(null,{ placeholder:'Statistics unavailable until the axis range is valid.' });
            return;
          }
        }
        if(logY&&points.some(p=>p.y<=0)){
          if(!scatterState.logPlusOneY){
            renderScatterNotice('Log scale requires positive Y values.');
            primeScatterStatsContext(null,{ placeholder:'Statistics unavailable until the axis range is valid.' });
            return;
          }
        }
        // Apply log+1 transform if enabled
        if(logX && scatterState.logPlusOneX){
          points = points.map(p => Number.isFinite(p.x) ? { ...p, x: p.x + 1 } : p);
          if(Number.isFinite(xMinRaw)) xMinRaw = xMinRaw + 1;
          if(Number.isFinite(xMaxRaw)) xMaxRaw = xMaxRaw + 1;
          debug('Debug: scatter log+1 transform applied to X');
        }
        if(logY && scatterState.logPlusOneY){
          points = points.map(p => Number.isFinite(p.y) ? { ...p, y: p.y + 1 } : p);
          if(Number.isFinite(yMinRaw)) yMinRaw = yMinRaw + 1;
          if(Number.isFinite(yMaxRaw)) yMaxRaw = yMaxRaw + 1;
          debug('Debug: scatter log+1 transform applied to Y');
        }
        let xMin=xMinRaw, xMax=xMaxRaw, yMin=yMinRaw, yMax=yMaxRaw;
        if(isFinite(xMinManual)) xMin=xMinManual;
        if(isFinite(xMaxManual)) xMax=xMaxManual;
        if(isFinite(yMinManual)) yMin=yMinManual;
        if(isFinite(yMaxManual)) yMax=yMaxManual;
        if(originMode==='custom'){
          if(isFinite(originXInput)){
            if(logX && originXInput<=0){
              info('scatter custom origin ignored for X in log scale', originXInput);
            }else{
              if(originXInput<xMin) xMin=originXInput;
              if(originXInput>xMax) xMax=originXInput;
            }
          }
          if(isFinite(originYInput)){
            if(logY && originYInput<=0){
              info('scatter custom origin ignored for Y in log scale', originYInput);
            }else{
              if(originYInput<yMin) yMin=originYInput;
              if(originYInput>yMax) yMax=originYInput;
            }
          }
          info('scatter range adjusted for custom origin',{xMin,xMax,yMin,yMax});
        }
        const pointsInRange=points.filter(p=>p.x>=xMin&&p.x<=xMax&&p.y>=yMin&&p.y<=yMax);
        const removedForRange=points.length-pointsInRange.length;
        if(removedForRange>0){
          debug('Debug: scatter filtered points outside axis',{removed:removedForRange,xMin,xMax,yMin,yMax});
        }
        if(!pointsInRange.length){
          if(scatterCurrentGraphType==='scatter'){
            renderScatterStatsAdvisor([], buildScatterAdvisorContext([]));
          }
          renderScatterNotice('No points fall within the specified axis range.');
          debug('Debug: scatter plot aborted due to range filter',{range:{xMin,xMax,yMin,yMax}});
          primeScatterStatsContext(null,{ placeholder:'Adjust the axis range to enable statistics.' });
          return;
        }
        scatterColorModeDesired = scatterColorMode ? normalizeScatterColorMode(scatterColorMode.value) : SCATTER_DENSITY_MODE_DEFAULT;
        const colorModeSetting = resolveScatterColorMode({
          mode: scatterColorModeDesired,
          pointCount: pointsInRange.length,
          graphType: scatterCurrentGraphType,
          viewMode: scatterState.viewMode
        });
        scatterColorModeApplied = colorModeSetting.applied;
        const densityPaletteKey = normalizeScatterDensityPalette(scatterDensityPalette?.value);
        const densityColorFor = scatterColorModeApplied === 'density'
          ? createScatterDensityColorMapper(densityPaletteKey)
          : null;
        const densityColoringActive = scatterCurrentGraphType==='scatter' && scatterColorModeApplied === 'density';
        syncScatterColorModeUI(scatterColorModeApplied);
        debug('Debug: scatter color mode resolved',{
          desired: scatterColorModeDesired,
          applied: scatterColorModeApplied,
          allowDensity: colorModeSetting.allowDensity,
          palette: densityPaletteKey,
          pointCount: pointsInRange.length,
          viewMode: scatterState.viewMode
        });
        // Apply adaptive point sizing based on the number of data points unless user override is enabled
        if(scatterState.dotSizeOverrideEnabled && Number.isFinite(scatterState.dotSizeOverrideRaw)){
          dotSizeRaw = scatterState.dotSizeOverrideRaw;
          dotSizePx = chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'scatter-point', min: 0 });
          debug('Debug: scatter dot size override applied',{
            pointCount: pointsInRange.length,
            overrideSize: dotSizeRaw,
            scaledSize: dotSizePx
          });
        }else{
          dotSizeRaw = computeAdaptivePointSize(pointsInRange.length);
          dotSizePx = chartStyle.scaleRadius(dotSizeRaw, styleScaleInfo, { context: 'scatter-point', min: 0 });
          debug('Debug: scatter adaptive point size applied',{
            pointCount: pointsInRange.length,
            adaptiveSize: dotSizeRaw,
            scaledSize: dotSizePx
          });
          // Sync the Dot size control to display the applied adaptive size when auto mode is active
          if(scatterDotSize && String(scatterDotSize.value) !== String(dotSizeRaw)){
            try{ scatterDotSize.value = String(dotSizeRaw); }catch(err){ /* ignore UI sync errors */ }
          }
        }
        const shouldAutoHideLegend = scatterCurrentGraphType === 'scatter' && !densityColoringActive && pointsInRange.length > 10;
        if(shouldAutoHideLegend && showLegend){
          scatterLegendChangeInternal = true;
          try{
            if(scatterShowLegend){
              scatterShowLegend.checked = false;
            }
            showLegend = false;
            debug('Debug: scatter legend auto-hidden for large dataset',{ pointCount: pointsInRange.length });
          }finally{
            scatterLegendChangeInternal = false;
          }
        }
        if(scatterCurrentGraphType==='scatter'){
          renderScatterStatsAdvisor(pointsInRange);
        }else{
          significantCount=pointsInRange.reduce((acc,p)=>acc+(p.isSignificant?1:0),0);
        }
        const labelDistribution = scatterCurrentGraphType==='scatter'
          ? computeScatterLabelDistribution(pointsInRange)
          : { shouldUseUniform: false, pureUnique: false, averageFrequency: 0, labelCount: 0, labeledPointCount: 0, totalPoints: pointsInRange.length };
        const useUniformLabelStyle = densityColoringActive || (scatterCurrentGraphType==='scatter' && labelDistribution.shouldUseUniform);
        if(useUniformLabelStyle){
          scatterDebug('Debug: scatter uniform label styling enabled', {
            pureUnique: labelDistribution.pureUnique,
            averageFrequency: labelDistribution.averageFrequency,
            labelCount: labelDistribution.labelCount,
            labeledPointCount: labelDistribution.labeledPointCount,
            totalPoints: labelDistribution.totalPoints
          });
        }
        const visibleLabels = shouldCollectLabelSet
          ? Array.from(new Set(pointsInRange.map(p=>p.label).filter(Boolean)))
          : [];
        legendLayout = null;
        if(showLegend){
          const legendEntries=[];
          if(scatterCurrentGraphType==='scatter'){
            if(densityColoringActive){
              const low = densityColorFor ? densityColorFor(0.1) : fill;
              const mid = densityColorFor ? densityColorFor(0.55) : fill;
              const high = densityColorFor ? densityColorFor(1) : fill;
              legendEntries.push({ label:'High density', fill: high, editable:false, key:'__scatter_density_high__', shape:'circle' });
              legendEntries.push({ label:'Medium', fill: mid, editable:false, key:'__scatter_density_mid__', shape:'circle' });
              legendEntries.push({ label:'Low density', fill: low, editable:false, key:'__scatter_density_low__', shape:'circle' });
            }else if(useUniformLabelStyle){
              legendEntries.push({
                label:'All points',
                fill,
                key:'__scatter_uniform__',
                editable:false,
                shape:'circle',
                labelIndex:0
              });
            }else{
              visibleLabels.forEach((labelName, labelIndex)=>{
                const shapeValue = sanitizeScatterLabelShape(scatterLabelShapes[labelName], labelIndex);
                scatterLabelShapes[labelName] = shapeValue;
                legendEntries.push({
                  label:labelName,
                  fill:scatterLabelColors[labelName]||fill,
                  key:labelName,
                  editable:true,
                  shape: shapeValue,
                  labelIndex
                });
              });
            }
          }else if(significanceLegendNeeded){
            if(scatterCurrentGraphType === 'volcano'){
              legendEntries.push({label:'Significant (positive)',fill:SIGNIFICANT_COLOR});
              legendEntries.push({label:'Significant (negative)',fill:SIGNIFICANT_NEGATIVE_COLOR});
              legendEntries.push({label:'Not significant',fill});
            }else{
              legendEntries.push({label:'Significant',fill:SIGNIFICANT_COLOR});
              legendEntries.push({label:'Not significant',fill});
            }
          }
          legendLayout = chartStyle.computeLegendLayout({
            entries:legendEntries,
            fontSize:fs,
            strokeWidth:borderWidthPx,
            onSwatchClick:({ entry, event, swatch, index })=>{
              const labelKey=entry?.key;
              if(!labelKey || entry?.editable===false || scatterColorModeApplied === 'density'){
                return;
              }
              if(event){ event.stopPropagation(); }
              const currentColor=scatterLabelColors[labelKey]||entry.fill;
              const labelIndex = Number.isInteger(entry?.labelIndex) ? entry.labelIndex : (Number.isInteger(index) ? index : visibleLabels.indexOf(labelKey));
              const currentShape = sanitizeScatterLabelShape(scatterLabelShapes[labelKey], labelIndex);
              scatterLabelShapes[labelKey] = currentShape;
              const applyLegendColor=value=>{
                const nextValue=value!=null?String(value):'';
                const previousValue=scatterLabelColors[labelKey] || '';
                if(nextValue){
                  if(previousValue===nextValue){
                    return true;
                  }
                  scatterLabelColors[labelKey]=nextValue;
                }else if(previousValue){
                  delete scatterLabelColors[labelKey];
                }else{
                  return true;
                }
                scheduleDrawScatter();
                return true;
              };
              const applyLegendShape=value=>{
                const sanitizedValue=sanitizeScatterLabelShape(value, labelIndex);
                if(sanitizeScatterLabelShape(scatterLabelShapes[labelKey], labelIndex)===sanitizedValue){
                  return true;
                }
                scatterLabelShapes[labelKey]=sanitizedValue;
                scheduleDrawScatter();
                return true;
              };
              let previousColor=currentColor;
              let previousShape=currentShape;
              Shared.openColorPicker({
                anchor:swatch,
                color:currentColor,
                shapePicker: scatterCurrentGraphType==='scatter' && scatterState.viewMode !== 'bubble' ? {
                  value: currentShape,
                  options: SCATTER_SHAPE_OPTIONS,
                  onChange(nextShape){
                    const sanitized = sanitizeScatterLabelShape(nextShape, labelIndex);
                    if(sanitized===previousShape){
                      return;
                    }
                    applyLegendShape(sanitized);
                    recordScatterChange(`scatter:legend-shape:${labelKey}`,previousShape,sanitized,applyLegendShape);
                    previousShape=sanitized;
                    debug('Debug: scatter legend shape change',{ label: labelKey, shape: sanitized, index: labelIndex });
                  }
                } : null,
                onInput(value){
                  applyLegendColor(value);
                  debug('Debug: scatter legend color input',{label:labelKey,color:value});
                },
                onChange(value){
                  const nextValue=value!=null?String(value):'';
                  if(nextValue===previousColor){
                    return;
                  }
                  applyLegendColor(nextValue);
                  recordScatterChange(`scatter:legend-color:${labelKey}`,previousColor,nextValue,applyLegendColor);
                  previousColor=nextValue;
                }
              });
            }
          });
          legendRenderer=legendLayout.renderer || EMPTY_LEGEND_RENDERER;
          legendGapPx=legendLayout.legendGapPx || 0;
          legendWidth=legendLayout.legendWidthForMargin || 0;
        }else{
          legendLayout = null;
          legendRenderer=EMPTY_LEGEND_RENDERER;
          legendGapPx=0;
          legendWidth=0;
          debug('Debug: scatter legend hidden via toggle',{graphType:scatterCurrentGraphType});
        }
        const legendVisible = showLegend && legendRenderer.entries.length > 0;
        debug('Debug: scatter legend metrics',{legendWidth,legendGapPx,entryCount:legendRenderer.entries.length,graphType:scatterCurrentGraphType,showLegend,legendVisible});
        points = pointsInRange;
        if(xMin===xMax) xMax=xMin+1;
        if(yMin===yMax) yMax=yMin+1;
        info('scatter final raw range',{xMin,xMax,yMin,yMax});
        const axisMidpoint = Number.isFinite(xMin) && Number.isFinite(xMax)
          ? (xMin + xMax) / 2
          : 0;
        const desiredAnnotationCap = shouldRenderSignificantLabels ? points.length : undefined;
        let annotationRequestInfo = buildScatterAnnotationRequests(points, {
          enabled: shouldRenderSignificantLabels,
          axisMid: axisMidpoint,
          fontSize: annotationFontPx,
          maxAnnotations: desiredAnnotationCap
        });
        annotationRequests = annotationRequestInfo.requests;
        if(annotationRequests.length){
          annotationCrowdingScale = resolveScatterAnnotationCrowdingScale(annotationRequests.length, {
            comfortable: SCATTER_ANNOTATION_COMFORTABLE_COUNT,
            minScale: SCATTER_ANNOTATION_MIN_SCALE
          });
          const scaledFontPx = Math.max(5.5, baseAnnotationFontPx * annotationCrowdingScale);
          if(Math.abs(scaledFontPx - annotationFontPx) > 0.25){
            annotationFontPx = scaledFontPx;
            annotationRequestInfo = buildScatterAnnotationRequests(points, {
              enabled: shouldRenderSignificantLabels,
              axisMid: axisMidpoint,
              fontSize: annotationFontPx,
              maxAnnotations: desiredAnnotationCap
            });
            annotationRequests = annotationRequestInfo.requests;
          }else{
            annotationFontPx = scaledFontPx;
          }
          const annotationLeaderPaddingBase = chartStyle.scaleStrokeWidth(Math.max(dotSizePx * 3, fs * 1.1), styleScaleInfo, { context: 'scatter-annotation-padding', min: 10 });
          const annotationAxisPaddingBase = Math.max(fs * 0.8, axisStrokeWidth * 3, 10);
          const annotationTextPaddingBase = Math.max(4, annotationLeaderPaddingBase * 0.4);
          const connectorScale = Math.max(0.45, annotationCrowdingScale);
          annotationLeaderPadding = Math.max(6, annotationLeaderPaddingBase * connectorScale);
          annotationTextPadding = Math.max(2, annotationTextPaddingBase * connectorScale);
          annotationAxisPadding = Math.max(6, annotationAxisPaddingBase * connectorScale);
          annotationStrokeWidth = Math.max(0.35, annotationStrokeWidthBase * connectorScale);
        }else{
          annotationLeaderPadding = 0;
          annotationTextPadding = 0;
          annotationAxisPadding = 0;
        }
        let points3dInRange = [];
        if(scatterCurrentGraphType==='scatter' && scatter3dCandidates.length){
          points3dInRange = scatter3dCandidates.filter(pt => pt.x>=xMin && pt.x<=xMax && pt.y>=yMin && pt.y<=yMax);
        }
        let supports3d = scatterCurrentGraphType==='scatter' && scatter3dEligible && scatter3dCandidates.length>=3 && points3dInRange.length>=3;
        let supportsBubble = false;
        if(scatterCurrentGraphType==='scatter' && bubbleEligible){
          let bubbleValidInRange = 0;
          let bubbleMissingInRange = 0;
          for(let i = 0; i < pointsInRange.length; i += 1){
            const candidate = pointsInRange[i];
            if(Number.isFinite(candidate?.bubbleValue)){
              bubbleValidInRange += 1;
            }else{
              bubbleMissingInRange += 1;
            }
          }
          supportsBubble = bubbleValidInRange > 0 && bubbleMissingInRange === 0;
        }
        scatterState.supports3d = supports3d;
        scatterState.supportsBubble = supportsBubble;
        updateScatterViewModeOptionVisibility();
        const desiredViewMode = scatterState.requestedViewMode || scatterState.viewMode || '2d';
        const allowAdvanced = scatterCurrentGraphType === 'scatter';
        const effectiveViewMode = applyScatterViewMode(desiredViewMode, {
          allow3d: allowAdvanced,
          allowBubble: allowAdvanced,
          skipSchedule: true,
          forceUpdate: true
        });
        if(effectiveViewMode === '3d' && !supports3d){
          renderScatterNotice('3D scatter view requires numeric X, Y, and Z values (with at least three complete rows). Add a Z column to continue.');
          debug('Debug: scatter 3d view pending dataset',{ supports3d, candidateCount: scatter3dCandidates.length, pointsInRange: points3dInRange.length });
          return;
        }
        if(effectiveViewMode === 'bubble' && !supportsBubble){
          renderScatterNotice('Bubble view requires numeric X, Y, and bubble columns with non-missing values for every visible row.');
          debug('Debug: scatter bubble view pending dataset',{ supportsBubble, bubbleEligible, bubbleCandidates: pointsInRange.length });
          return;
        }
        const existingScatterSvg = plotEl.querySelector('#scatterSvg');
        const reuse3dSvg = supports3d && effectiveViewMode === '3d' && existingScatterSvg && existingScatterSvg.dataset.viewMode === '3d';
        if(!reuse3dSvg){
          clearScatterPlot();
        }
        if(supports3d && effectiveViewMode === '3d'){
          scatterState.rotationPending = false;
          scatterState.rotationPendingLogged = false;
          if(typeof plot3d.normalizeRotation === 'function'){
            plot3d.normalizeRotation(scatterState.rotation);
          }
          const targetAspect = Number.isFinite(SCATTER_3D_DEFAULTS.aspectRatio) && SCATTER_3D_DEFAULTS.aspectRatio > 0 ? SCATTER_3D_DEFAULTS.aspectRatio : (4/3);
          const fallbackWidth = 420;
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
          plotEl.style.position='relative';
          plotEl.style.aspectRatio = `${W3} / ${H3}`;
          plotEl.style.padding = plotEl.style.padding || '12px';
          const svg3 = reuse3dSvg ? existingScatterSvg : document.createElementNS(NS,'svg');
          if(!svg3){
            return;
          }
          if(!reuse3dSvg){
            svg3.setAttribute('id','scatterSvg');
            plotEl.appendChild(svg3);
          }
          svg3.setAttribute('width',String(W3));
          svg3.setAttribute('height',String(H3));
          svg3.setAttribute('viewBox',`0 0 ${W3} ${H3}`);
          svg3.setAttribute('font-family',chartStyle.FONT_FAMILY);
          svg3.dataset.viewMode = '3d';
          chartStyle.applySvgDefaults(svg3);
          while(svg3.firstChild){
            svg3.removeChild(svg3.firstChild);
          }
          svg3.addEventListener('mouseleave', handleScatterPlotMouseLeave);
          plot3d.attachRotationControls(svg3, {
            state: scatterState.rotation,
            onChange: () => scheduleScatterRotationRedraw(),
            shouldIgnorePointer: (event) => {
              if(typeof plot3d.isInteractivePointerTarget === 'function'){
                return plot3d.isInteractivePointerTarget(event?.target);
              }
              return plot3d.isLegendPointerTarget(event?.target);
            },
            debugLabel: 'scatter-3d'
          });
          if(fontControls && typeof fontControls.enableForSvg === 'function'){
            fontControls.enableForSvg(svg3,{ scopeId: 'scatter' });
          }
          const legendAxisGap = Math.max(fs * 0.9, 18);
          const appliedLegendAxisGap = legendVisible ? legendAxisGap : 0;
          const legendGapFor3d = legendLayout?.legendGapPx ?? legendGapPx;
          const baseLegendMargin = Math.max(fs * 2.25, 28);
          const legendMargin = legendVisible ? legendWidth + appliedLegendAxisGap + baseLegendMargin : baseLegendMargin;
          const margin3 = {
            top: Math.max(fs * 3.2, 36),
            right: legendMargin,
            bottom: Math.max(fs * 3.2, 40),
            left: Math.max(fs * 3.2, 40)
          };
          const plotW3 = Math.max(20, W3 - margin3.left - margin3.right);
          const plotH3 = Math.max(20, H3 - margin3.top - margin3.bottom);
          const dataBounds = { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity, zMin: Infinity, zMax: -Infinity };
          points3dInRange.forEach(pt => {
            if(pt.x<dataBounds.xMin) dataBounds.xMin=pt.x;
            if(pt.x>dataBounds.xMax) dataBounds.xMax=pt.x;
            if(pt.y<dataBounds.yMin) dataBounds.yMin=pt.y;
            if(pt.y>dataBounds.yMax) dataBounds.yMax=pt.y;
            if(pt.z<dataBounds.zMin) dataBounds.zMin=pt.z;
            if(pt.z>dataBounds.zMax) dataBounds.zMax=pt.z;
          });
          if(!Number.isFinite(dataBounds.xMin)){ dataBounds.xMin = xMin; }
          if(!Number.isFinite(dataBounds.xMax)){ dataBounds.xMax = xMax; }
          if(!Number.isFinite(dataBounds.yMin)){ dataBounds.yMin = yMin; }
          if(!Number.isFinite(dataBounds.yMax)){ dataBounds.yMax = yMax; }
          if(!Number.isFinite(dataBounds.zMin) || !Number.isFinite(dataBounds.zMax)){
            dataBounds.zMin = Math.min(-1, zMinRaw);
            dataBounds.zMax = Math.max(1, zMaxRaw);
          }
          if(dataBounds.zMin === dataBounds.zMax){
            const pad = Math.abs(dataBounds.zMin) || 1;
            dataBounds.zMin -= pad;
            dataBounds.zMax += pad;
          }
          const baseTickEstimate3d = chartStyle.estimateTickCount ? chartStyle.estimateTickCount(Math.max(plotW3, plotH3), { fallback: 6 }) : 6;
          const tickTarget3d = clampScatterTickTarget(baseTickEstimate3d || 6);
          const xScale3d = buildScatterScale({
            dataMin: dataBounds.xMin,
            dataMax: dataBounds.xMax,
            manualMin: Number.isFinite(xMinManual) ? xMinManual : NaN,
            manualMax: Number.isFinite(xMaxManual) ? xMaxManual : NaN,
            targetTickCount: tickTarget3d
          });
          const yScale3d = buildScatterScale({
            dataMin: dataBounds.yMin,
            dataMax: dataBounds.yMax,
            manualMin: Number.isFinite(yMinManual) ? yMinManual : NaN,
            manualMax: Number.isFinite(yMaxManual) ? yMaxManual : NaN,
            targetTickCount: tickTarget3d
          });
          const zScale3d = buildScatterScale({
            dataMin: dataBounds.zMin,
            dataMax: dataBounds.zMax,
            targetTickCount: tickTarget3d
          });
          const axisRanges3d = {
            x: { min: Number.isFinite(xScale3d.min) ? xScale3d.min : dataBounds.xMin, max: Number.isFinite(xScale3d.max) ? xScale3d.max : dataBounds.xMax },
            y: { min: Number.isFinite(yScale3d.min) ? yScale3d.min : dataBounds.yMin, max: Number.isFinite(yScale3d.max) ? yScale3d.max : dataBounds.yMax },
            z: { min: Number.isFinite(zScale3d.min) ? zScale3d.min : dataBounds.zMin, max: Number.isFinite(zScale3d.max) ? zScale3d.max : dataBounds.zMax }
          };
          const allCorners = [
            { x: axisRanges3d.x.min, y: axisRanges3d.y.min, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.min, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.min, y: axisRanges3d.y.max, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.max, z: axisRanges3d.z.min },
            { x: axisRanges3d.x.min, y: axisRanges3d.y.min, z: axisRanges3d.z.max },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.min, z: axisRanges3d.z.max },
            { x: axisRanges3d.x.min, y: axisRanges3d.y.max, z: axisRanges3d.z.max },
            { x: axisRanges3d.x.max, y: axisRanges3d.y.max, z: axisRanges3d.z.max }
          ];
          const rotatePoint = (pt) => plot3d.rotatePoint(pt, scatterState.rotation);
          const rotatedCorners = allCorners.map(corner => rotatePoint(corner));
          const rotatedPoints = points3dInRange.map(pt => rotatePoint(pt));
          const projector = plot3d.createProjector({
            rotatedPoints,
            rotatedCorners,
            width: W3,
            height: H3,
            margin: margin3
          });
          const projectedPoints = points3dInRange.map((pt, idx) => {
            const rotated = rotatedPoints[idx];
            const projected = projector.project(rotated);
            return { original: pt, rotated, projected };
          });
          const sortedPoints = projectedPoints.map((entry, idx) => {
            const pt = entry.original;
            const projected = entry.projected;
            return {
              index: idx,
              projected,
              label: pt.label,
              color: useUniformLabelStyle ? fill : (scatterLabelColors[pt.label] || fill),
              shape: useUniformLabelStyle ? 'circle' : (labelShapeLookup.get(pt.label) || 'circle'),
              data: pt
            };
          }).sort((a, b) => (a.projected.depth || 0) - (b.projected.depth || 0));
          const add3 = (tag, attrs, text) => {
            const el = document.createElementNS(NS, tag);
            Object.keys(attrs || {}).forEach(key => el.setAttribute(key, String(attrs[key])));
            if(text){ el.textContent = text; }
            svg3.appendChild(el);
            return el;
          };
          const axisTicks3d = {
            x: Array.isArray(xScale3d.ticks) ? xScale3d.ticks : [],
            y: Array.isArray(yScale3d.ticks) ? yScale3d.ticks : [],
            z: Array.isArray(zScale3d.ticks) ? zScale3d.ticks : []
          };
          plot3d.renderAxesAndGrid({
            svg: svg3,
            project: projector.project,
            rotatePoint,
            axisRanges: axisRanges3d,
            axisTicks: axisTicks3d,
            axisLabels: { x: scatterXLabelText, y: scatterYLabelText, z: scatterZLabelText },
            fontSize: fs,
            axisStrokeWidth,
            chartStyle,
            showGrid,
            showFrame,
            debugLabel: 'scatter-3d',
            onAxisLabel: (node, axisKey) => {
              if(!node){ return; }
              const role = axisKey === 'z' ? 'zTitle' : (axisKey === 'y' ? 'yTitle' : 'xTitle');
              const changeLabel = (value) => {
                const nextValue = value != null ? String(value) : '';
                if(axisKey === 'x'){ scatterXLabelText = nextValue; }
                else if(axisKey === 'y'){ scatterYLabelText = nextValue; }
                else { scatterZLabelText = nextValue; }
                if(node.textContent !== nextValue){ node.textContent = nextValue; }
                scheduleDrawScatter();
              };
              markFontEditable(node, role, role);
              makeEditableLocal(node, text => {
                const previous = axisKey === 'x' ? (scatterXLabelText ?? '') : (axisKey === 'y' ? (scatterYLabelText ?? '') : (scatterZLabelText ?? ''));
                const nextValue = text != null ? String(text) : '';
                if(previous === nextValue){
                  return;
                }
                changeLabel(nextValue);
                recordScatterChange(`scatter:${axisKey}-label`, previous, nextValue, changeLabel);
              });
            }
          });
          const axisLabelBounds=[];
          let contentRightBound=margin3.left+plotW3;
          if(typeof svg3.querySelectorAll === 'function'){
            const axisLabelNodes=svg3.querySelectorAll('[data-axis-label]');
            axisLabelNodes.forEach(node=>{
              if(!node || typeof node.getBBox !== 'function'){ return; }
              try{
                const bbox=node.getBBox();
                const valid=Number.isFinite(bbox?.x) && Number.isFinite(bbox?.y) && Number.isFinite(bbox?.width) && Number.isFinite(bbox?.height);
                if(!valid){ return; }
                axisLabelBounds.push({ x:bbox.x, y:bbox.y, width:bbox.width, height:bbox.height });
                const rightEdge=bbox.x + bbox.width;
                if(Number.isFinite(rightEdge)){
                  contentRightBound=Math.max(contentRightBound,rightEdge);
                }
              }catch(err){
                scatterDebug('Debug: scatter axis label bbox error',{ message: err?.message || String(err) });
              }
            });
          }
          const pointLayer = document.createElementNS(NS,'g');
          svg3.appendChild(pointLayer);
          const manualLabelEntries3d = [];
          const pointBounds3d = [];
          let maxPointRight=contentRightBound;
          sortedPoints.forEach(entry => {
            const styleOverride = getScatterLabelStyle(entry.data?.label || null);
            const markerAlpha = styleOverride && styleOverride.alpha != null ? clampScatterAlpha(styleOverride.alpha) : alpha;
            const markerBorderWidth = styleOverride && styleOverride.borderWidth != null ? clampScatterBorderWidth(styleOverride.borderWidth) : borderWidthPx;
            const markerSize = styleOverride && styleOverride.size != null ? clampScatterSize(styleOverride.size) : dotSizePx;
            const markerBorderColor = styleOverride && styleOverride.borderColor ? styleOverride.borderColor : borderColor;
            const marker = createScatterMarkerElement(entry.shape, {
              cx: entry.projected.x,
              cy: entry.projected.y,
              radius: markerSize != null ? markerSize : dotSizePx,
              fill: entry.color,
              stroke: markerBorderWidth>0 ? markerBorderColor : null,
              strokeWidth: markerBorderWidth>0 ? markerBorderWidth : 0,
              fillOpacity: 1 - (markerAlpha != null ? markerAlpha : alpha),
              strokeOpacity: 1 - (markerAlpha != null ? markerAlpha : alpha)
            });
            if(!marker){ return; }
            pointLayer.appendChild(marker);
            const manualLabelText = (entry.data?.pointName || entry.data?.label || '').trim();
            const markerRadius = markerSize != null ? markerSize : dotSizePx;
            pointBounds3d.push({ cx: entry.projected?.x, cy: entry.projected?.y, r: markerRadius });
            if((entry.data?.isManualLabel || entry.data?.isThresholdLabel) && manualLabelText){
              manualLabelEntries3d.push({
                text: manualLabelText,
                cx: entry.projected?.x,
                cy: entry.projected?.y,
                radius: markerRadius
              });
            }
            attachScatterPointTooltip(marker, {
              label: entry.data.label || '',
              pointName: entry.data.pointName || '',
              rowIndex: Number.isInteger(entry.data.rowIndex) ? entry.data.rowIndex : undefined,
              isManualLabel: !!entry.data.isManualLabel,
              x: entry.data.x,
              y: entry.data.y,
              z: entry.data.z,
              graphType: 'scatter'
            });
            const approxRight = entry.projected?.x + markerRadius + (markerBorderWidth>0 ? markerBorderWidth : 0);
            if(Number.isFinite(approxRight)){
              maxPointRight = Math.max(maxPointRight, approxRight);
            }
          });
          if(manualLabelEntries3d.length){
            const labelLayer = document.createElementNS(NS,'g');
            labelLayer.setAttribute('data-layer','point-labels');
            labelLayer.setAttribute('pointer-events','none');
          const baseManualLabelSize = fs * 0.6;
          const labelFontSize = computeScatterManualLabelFontSize(baseManualLabelSize, manualLabelEntries3d.length, plotW3, plotH3);
          const labelScale = Math.min(1, labelFontSize / Math.max(1, baseManualLabelSize));
          const leaderStrokeWidth = chartStyle.scaleStrokeWidth(0.75 * labelScale, styleScaleInfo, { context: 'scatter-point-label-3d', min: 0.25 });
          const labelColor = chartStyle.TEXT_COLOR || '#333333';
            const plotLeft = margin3.left;
            const plotRight = margin3.left + plotW3;
            const plotTop = margin3.top;
            const plotBottom = margin3.top + plotH3;
            const font = typeof chartStyle?.makeFont === 'function'
              ? chartStyle.makeFont(labelFontSize)
              : null;
            const manualLabelLayout = computeScatterManualLabelLayout(manualLabelEntries3d, {
              plotLeft,
              plotRight,
              plotTop,
              plotBottom,
              labelFontSize,
              leaderGap: Math.max(2, Math.round(labelFontSize * 0.2)),
              leaderScale: labelScale,
              pointBounds: pointBounds3d,
              measureText: chartStyle?.measureText,
              font,
              angleSteps: 16,
              maxLeaderScale: 3
            });
            manualLabelLayout.forEach(result => {
              const entry = result.entry;
              const placement = result.placement;
              const cx = Number(entry?.cx) || 0;
              const cy = Number(entry?.cy) || 0;
              const textValue = entry?.text ? String(entry.text) : '';
              if(!textValue || !placement){
                return;
              }
              const textX = placement.textX;
              const textY = placement.textY;
              const anchor = placement.anchor;
              const lineX2 = placement.lineX2;
              const leader = document.createElementNS(NS,'line');
              leader.setAttribute('x1', String(cx));
              leader.setAttribute('y1', String(cy));
              leader.setAttribute('x2', String(lineX2));
              leader.setAttribute('y2', String(textY));
              leader.setAttribute('stroke', labelColor);
              leader.setAttribute('stroke-width', String(leaderStrokeWidth));
              leader.setAttribute('stroke-linecap', 'round');
              labelLayer.appendChild(leader);
              const textNode = document.createElementNS(NS,'text');
              textNode.setAttribute('x', String(textX));
              textNode.setAttribute('y', String(textY));
              textNode.setAttribute('font-size', String(labelFontSize));
              textNode.setAttribute('fill', labelColor);
              textNode.setAttribute('text-anchor', anchor);
              textNode.setAttribute('dominant-baseline', 'middle');
              textNode.textContent = textValue;
              labelLayer.appendChild(textNode);
            });
            svg3.appendChild(labelLayer);
            debug('Debug: scatter 3d manual labels rendered', { count: manualLabelEntries3d.length });
          }
          contentRightBound=Math.max(contentRightBound,maxPointRight);
          if(legendVisible){
            const legendContentWidth=Math.max(legendRenderer.width || 0,0);
            const legendContentHeight=Math.max(legendRenderer.height || 0,0);
            const horizontalBase=margin3.left+plotW3+legendGapFor3d+appliedLegendAxisGap;
            const horizontalPadding=Math.max(fs*0.6,12)+appliedLegendAxisGap;
            const storedLegendPos=scatterLabelPositions?.legend;
            let legendX3=Math.max(horizontalBase,contentRightBound+horizontalPadding);
            const safeRightPad=Math.max(fs*0.6,12);
            const widthForClamp=Math.max(legendContentWidth,legendWidth);
            const maxLegendX=W3-safeRightPad-widthForClamp;
            if(widthForClamp>0 && legendX3>maxLegendX){
              const previousX=legendX3;
              legendX3=Math.max(horizontalBase,maxLegendX);
              scatterDebug('Debug: scatter legend horizontal clamped',{ previousX, legendX3, maxLegendX });
            }
            const baseLegendY=margin3.top;
            const legendHeight=legendContentHeight;
            const legendBottomLimit=Math.max(baseLegendY,H3-margin3.bottom-legendHeight);
            const verticalPadding=Math.max(fs*0.45,8);
            const candidates=[baseLegendY];
            axisLabelBounds.forEach(bounds=>{
              const below=bounds.y + bounds.height + verticalPadding;
              const above=bounds.y - legendHeight - verticalPadding;
              if(below<=legendBottomLimit){ candidates.push(below); }
              if(above>=baseLegendY){ candidates.push(above); }
            });
            if(legendBottomLimit!==baseLegendY){
              candidates.push(legendBottomLimit);
            }
            const candidatePositions=[];
            candidates.forEach(candidate=>{
              const clamped=Math.min(Math.max(candidate,baseLegendY),legendBottomLimit);
              if(!candidatePositions.some(existing=>Math.abs(existing-clamped)<0.5)){
                candidatePositions.push(clamped);
              }
            });
            candidatePositions.sort((a,b)=>Math.abs(a-baseLegendY)-Math.abs(b-baseLegendY));
            const intersectsAxis=(rect)=>{
              for(let idx=0;idx<axisLabelBounds.length;idx+=1){
                const bounds=axisLabelBounds[idx];
                const horizontalOverlap=rect.x < bounds.x + bounds.width + horizontalPadding
                  && rect.x + rect.width > bounds.x - horizontalPadding;
                const verticalOverlap=rect.y < bounds.y + bounds.height + verticalPadding
                  && rect.y + rect.height > bounds.y - verticalPadding;
                if(horizontalOverlap && verticalOverlap){
                  return true;
                }
              }
              return false;
            };
            let legendStartY=baseLegendY;
            if(Number.isFinite(storedLegendPos?.x) && Number.isFinite(storedLegendPos?.y)){
              legendX3 = storedLegendPos.x;
              legendStartY = storedLegendPos.y;
            }else{
              for(let idx=0;idx<candidatePositions.length;idx+=1){
                const candidateY=candidatePositions[idx];
                const legendRect={ x:legendX3, y:candidateY, width:legendContentWidth || widthForClamp, height:legendHeight };
                if(!intersectsAxis(legendRect)){
                  legendStartY=candidateY;
                  break;
                }
              }
            }
            scatterDebug('Debug: scatter legend placement resolved',{ legendX: legendX3, legendY: legendStartY, legendHeight, axisLabels: axisLabelBounds.length });
            const legendGroup=legendRenderer.draw(svg3,{ x:legendX3, y:legendStartY });
            if(legendGroup && typeof Shared.enableLegendDrag === 'function'){
              Shared.enableLegendDrag(legendGroup, svg3, {
                onDragEnd: pos => {
                  scatterLabelPositions.legend = { x: pos.x, y: pos.y };
                  if(Shared.isDebugEnabled?.()){
                    console.debug('Debug: scatter 3d legend position saved', pos);
                  }
                }
              });
            }
            if(legendGroup && typeof legendGroup.querySelectorAll === 'function'){
              const interactiveNodes=legendGroup.querySelectorAll('[data-legend-key]');
              interactiveNodes.forEach(node=>{
                plot3d.applyLegendPointerGuards(node,{ label: node.dataset.legendKey || null });
              });
            }
          }
          const title3d = add3('text',{ x: margin3.left + plotW3 / 2, y: Math.max(margin3.top * 0.4, fs * 1.6), 'text-anchor':'middle', 'font-size': fs, fill: chartStyle.TEXT_COLOR }, scatterTitleText);
          markFontEditable(title3d,'graphTitle','graphTitle');
          const applyScatterTitle3d=value=>{
            const nextValue=value!=null?String(value):'';
            scatterTitleText=nextValue;
            if(title3d.textContent!==nextValue){
              title3d.textContent=nextValue;
            }
            scheduleDrawScatter();
          };
          makeEditableLocal(title3d,txt=>{
            const previous=scatterTitleText!=null?String(scatterTitleText):'';
            const nextValue=txt!=null?String(txt):'';
            if(previous===nextValue){
              return;
            }
            applyScatterTitle3d(nextValue);
            recordScatterChange('scatter:title',previous,nextValue,applyScatterTitle3d);
          });
          ensureGraphViewport(svg3,{ padding: Math.max(fs, 18), debugLabel: 'scatter-3d-graph' });
          return;
        }
        clearScatterPlot();
        plotEl.style.aspectRatio='';
        plotEl.style.padding='';
        const W=Math.max(50,Math.floor(plotEl.clientWidth||50));
        const H=Math.max(40,Math.floor(plotEl.clientHeight||40));
        plotEl.style.position='relative';
        const svg=document.createElementNS(NS,'svg');
        svg.setAttribute('id','scatterSvg');
        svg.setAttribute('width',String(W));
        svg.setAttribute('height',String(H));
        svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
        svg.setAttribute('font-family',chartStyle.FONT_FAMILY);
        svg.dataset.viewMode='2d';
        chartStyle.applySvgDefaults(svg);
        svg.addEventListener('mouseleave', handleScatterPlotMouseLeave);
        plotEl.appendChild(svg);
        if(fontControls && typeof fontControls.enableForSvg === 'function'){
          fontControls.enableForSvg(svg,{ scopeId: 'scatter' });
          debug('Debug: scatter fontControls enableForSvg invoked',{ width: W, height: H }); // Debug: font panel binding
        } else {
          debug('Debug: scatter fontControls enableForSvg missing',{ hasFontControls: !!fontControls }); // Debug: font panel missing
        }
        const xMinT=logX?Math.log10(xMin):xMin;
        const xMaxT=logX?Math.log10(xMax):xMax;
        const yMinT=logY?Math.log10(yMin):yMin;
        const yMaxT=logY?Math.log10(yMax):yMax;
        const manualXMinValue=Number.isFinite(xMinManual) && (!logX || xMinManual > 0)
          ? (logX ? Math.log10(xMinManual) : xMinManual)
          : null;
        const manualXMaxValue=Number.isFinite(xMaxManual) && (!logX || xMaxManual > 0)
          ? (logX ? Math.log10(xMaxManual) : xMaxManual)
          : null;
        const manualYMinValue=Number.isFinite(yMinManual) && (!logY || yMinManual > 0)
          ? (logY ? Math.log10(yMinManual) : yMinManual)
          : null;
        const manualYMaxValue=Number.isFinite(yMaxManual) && (!logY || yMaxManual > 0)
          ? (logY ? Math.log10(yMaxManual) : yMaxManual)
          : null;
        const tickBaseSpacing=Math.max(48,Math.round(fs*3.2));
        const xTickEstimateOptions={axis:'x',fallback:6,baseSpacing:tickBaseSpacing,min:4};
        const yTickEstimateOptions={axis:'y',fallback:6,baseSpacing:tickBaseSpacing,min:4};
        let xTickTarget=clampScatterTickTarget(chartStyle.estimateTickCount(W,xTickEstimateOptions));
        let yTickTarget=clampScatterTickTarget(chartStyle.estimateTickCount(H,yTickEstimateOptions));
        debug('Debug: scatter initial tick targets',{xTickTarget,yTickTarget,width:W,height:H});
        const scatterNotationX = getScatterAxisNotation('x');
        const scatterNotationY = getScatterAxisNotation('y');
        const formatTickX = v => chartStyle.formatAxisValue(v,{ notation: scatterNotationX, maxDecimals: 2 });
        const formatTickY = v => chartStyle.formatAxisValue(v,{ notation: scatterNotationY, maxDecimals: 2 });
        const tickFont=chartStyle.makeFont(fs);
        const axisLabelFont=chartStyle.makeFont(fs);
        const yTitleWidthBase=chartStyle.measureText(scatterYLabelText,axisLabelFont);
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
        const storedManualIntervalX = getScatterAxisTickInterval('x');
        const storedManualIntervalY = getScatterAxisTickInterval('y');
        const manualIntervalX = !logX ? storedManualIntervalX : null;
        const manualIntervalY = !logY ? storedManualIntervalY : null;
        if(logX && storedManualIntervalX){
          debug('Debug: scatter manual interval suppressed',{ axis: 'x', reason: 'log-scale', stored: storedManualIntervalX });
        }
        if(logY && storedManualIntervalY){
          debug('Debug: scatter manual interval suppressed',{ axis: 'y', reason: 'log-scale', stored: storedManualIntervalY });
        }
        const applyLogTickOverride = (axisKey, scale, manualMin, manualMax, fallbackMin, fallbackMax, enabled) => {
          if(!enabled || !scale || !chartStyle.axisTicks?.applyLogTicks){
            return;
          }
          const applied = chartStyle.axisTicks.applyLogTicks(scale, {
            manualMin: Number.isFinite(manualMin) ? manualMin : null,
            manualMax: Number.isFinite(manualMax) ? manualMax : null,
            fallbackMin,
            fallbackMax
          });
          if(applied){
            debug('Debug: scatter log tick override',{ axis: axisKey, tickCount: scale.ticks.length });
          }
        };
        let xScale=buildScatterScale({
          dataMin:xMinT,
          dataMax:xMaxT,
          manualMin:manualXMinValue,
          manualMax:manualXMaxValue,
          targetTickCount:xTickTarget,
          fixedStep:Number.isFinite(manualIntervalX)&&manualIntervalX>0?manualIntervalX:null
        });
        let yScale=buildScatterScale({
          dataMin:yMinT,
          dataMax:yMaxT,
          manualMin:manualYMinValue,
          manualMax:manualYMaxValue,
          targetTickCount:yTickTarget,
          fixedStep:Number.isFinite(manualIntervalY)&&manualIntervalY>0?manualIntervalY:null
        });
        applyLogTickOverride('x', xScale, manualXMinValue, manualXMaxValue, xMinT, xMaxT, logX);
        applyLogTickOverride('y', yScale, manualYMinValue, manualYMaxValue, yMinT, yMaxT, logY);
        let xTickLabels=xScale.ticks.map(t=>formatTickX(logX?Math.pow(10,t):t));
        let yTickLabels=yScale.ticks.map(t=>formatTickY(logY?Math.pow(10,t):t));
        let maxYLabelWidth=0;
        let maxXLabelWidth=0;
        for(let pass=0;pass<2;pass++){
          xScale=buildScatterScale({
            dataMin:xMinT,
            dataMax:xMaxT,
            manualMin:manualXMinValue,
            manualMax:manualXMaxValue,
            targetTickCount:xTickTarget,
            fixedStep:Number.isFinite(manualIntervalX)&&manualIntervalX>0?manualIntervalX:null
          });
          yScale=buildScatterScale({
            dataMin:yMinT,
            dataMax:yMaxT,
            manualMin:manualYMinValue,
            manualMax:manualYMaxValue,
            targetTickCount:yTickTarget,
            fixedStep:Number.isFinite(manualIntervalY)&&manualIntervalY>0?manualIntervalY:null
          });
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
          const refinedX=clampScatterTickTarget(chartStyle.estimateTickCount(plotW,{...xTickEstimateOptions,fallback:xTickTarget}));
          const refinedY=clampScatterTickTarget(chartStyle.estimateTickCount(plotH,{...yTickEstimateOptions,fallback:yTickTarget}));
          debug('Debug: scatter tick target evaluation',{pass,plotW,plotH,xTickTarget,refinedX,yTickTarget,refinedY,maxXLabelWidth,maxYLabelWidth});
          if(refinedX===xTickTarget && refinedY===yTickTarget){
            break;
          }
          xTickTarget=refinedX;
          yTickTarget=refinedY;
        }
        debug('Debug: scatter layout',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate,xTickTarget,yTickTarget,maxXLabelWidth,maxYLabelWidth});
        const aspectData=scatterSvgBox?.dataset;
        const shouldLockAspect=aspectData?.resizerAspectLocked==='true';
        debug('Debug: scatter aspect ratio decision',{shouldLockAspect,storedRatio:aspectData?.resizerAspectRatio}); // Debug: scatter aspect toggle decision
        if(shouldLockAspect){
          const square=chartStyle.ensureSquarePlot(W,H,margin);
          margin=square.margin;
          plotW=square.plotW;
          plotH=square.plotH;
          if(aspectData){
            const derivedRatio=plotH>0?plotW/plotH:NaN;
            if(Number.isFinite(derivedRatio)){
              aspectData.resizerAspectRatio=String(derivedRatio);
            }
          }
          debug('Debug: scatter layout (locked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter square enforcement branch
        }else{
          debug('Debug: scatter layout (unlocked)',{margin,plotW,plotH,rotate:bottomLayout.shouldRotate}); // Debug: scatter free resize branch
        }
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
        debug('Debug: scatter broken axis',{
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
            const x=x2px(t);add('line',{x1:x,y1:margin.top,x2:x,y2:margin.top+plotH,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          yScale.ticks.forEach(t=>{
            if(!isYValueVisible(t)){ return; }
            const y=y2px(t);add('line',{x1:margin.left,y1:y,x2:margin.left+plotW,y2:y,stroke:'#ddd','stroke-width':axisStrokeWidth});});
          debug('Debug: scatter grid stroke scaled',{vertical:xScale.ticks.length,horizontal:yScale.ticks.length,axisStrokeWidth});
        }
        if(scatterCurrentGraphType === 'volcano'){
          const thresholdStroke = '#9b9b9b';
          const thresholdWidth = chartStyle.scaleStrokeWidth(0.85, styleScaleInfo, { context: 'scatter-threshold', min: 0.35 });
          const dashSize = Math.max(2, Math.round(thresholdWidth * 3));
          const dashArray = `${dashSize},${dashSize}`;
          const absLog2fc = Number.isFinite(log2fcThreshold) ? Math.abs(log2fcThreshold) : NaN;
          if(Number.isFinite(absLog2fc) && absLog2fc > 0){
            const thresholdXT = logX ? Math.log10(absLog2fc) : absLog2fc;
            if(Number.isFinite(thresholdXT) && thresholdXT >= xScale.min && thresholdXT <= xScale.max && isXValueVisible(thresholdXT)){
              const xPos = x2px(thresholdXT);
              add('line',{
                x1: xPos,
                y1: margin.top,
                x2: xPos,
                y2: margin.top + plotH,
                stroke: thresholdStroke,
                'stroke-width': thresholdWidth,
                'stroke-dasharray': dashArray
              });
            }
            if(!logX){
              const negXT = -absLog2fc;
              if(negXT >= xScale.min && negXT <= xScale.max && isXValueVisible(negXT)){
                const xNegPos = x2px(negXT);
                add('line',{
                  x1: xNegPos,
                  y1: margin.top,
                  x2: xNegPos,
                  y2: margin.top + plotH,
                  stroke: thresholdStroke,
                  'stroke-width': thresholdWidth,
                  'stroke-dasharray': dashArray
                });
              }
            }
          }
          if(Number.isFinite(negLogPThreshold) && negLogPThreshold > 0){
            const thresholdYT = logY ? Math.log10(negLogPThreshold) : negLogPThreshold;
            if(Number.isFinite(thresholdYT) && thresholdYT >= yScale.min && thresholdYT <= yScale.max && isYValueVisible(thresholdYT)){
              const yPos = y2px(thresholdYT);
              add('line',{
                x1: margin.left,
                y1: yPos,
                x2: margin.left + plotW,
                y2: yPos,
                stroke: thresholdStroke,
                'stroke-width': thresholdWidth,
                'stroke-dasharray': dashArray
              });
            }
          }
        }
        let originXT,originYT;
        if(originMode==='custom'){originXT=logX?Math.log10(isFinite(originXInput)?originXInput:0):(isFinite(originXInput)?originXInput:0);originYT=logY?Math.log10(isFinite(originYInput)?originYInput:0):(isFinite(originYInput)?originYInput:0);}else{originXT=xScale.min;originYT=yScale.min;}
        const clampedXT=Math.min(Math.max(originXT,xScale.min),xScale.max);
        const clampedYT=Math.min(Math.max(originYT,yScale.min),yScale.max);
        info('scatter origin final',{originXT,originYT,clampedXT,clampedYT});
        const xAxisY=y2px(clampedYT);
        const yAxisX=x2px(clampedXT);
        info('scatter axes',{tickLen,xAxisY,yAxisX});
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
        if(axisXStart===axisXEnd){axisXStart=axisXMinPos;axisXEnd=axisXMaxPos;}
        if(axisYStart===axisYEnd){axisYStart=axisYMinPos;axisYEnd=axisYMaxPos;}
        debug('Debug: scatter axis span',{axisXStart,axisXEnd,axisYStart,axisYEnd});
        const minorTickStyle = chartStyle.resolveMinorTickStyle({ tickLength: tickLen, strokeWidth: axisStrokeWidth });
        const minorSubdivisionsX = getScatterAxisMinorTickSubdivisions('x');
        const minorSubdivisionsY = getScatterAxisMinorTickSubdivisions('y');
        const minorTicksX = getScatterAxisMinorTicksEnabled('x')
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
        const minorTicksY = getScatterAxisMinorTicksEnabled('y')
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
        const axisControlConfig = axis => ({
          axis,
          scopeId: 'scatter',
          getTickInterval: () => getScatterAxisTickInterval(axis),
          getThickness: () => getScatterAxisStrokeWidth(),
          getColor: () => getScatterAxisColor(),
          isTickIntervalEnabled: () => axis === 'x' ? !logX : !logY,
          getTickIntervalDisabledMessage: () => axis === 'x'
            ? 'Tick interval is disabled while the X axis uses a logarithmic scale.'
            : 'Tick interval is disabled while the Y axis uses a logarithmic scale.',
          tickPlaceholder: 'Auto',
          onTickIntervalChange: value => updateScatterAxisTickInterval(axis, value),
          getMinorTicksEnabled: () => getScatterAxisMinorTicksEnabled(axis),
          onMinorTicksChange: value => updateScatterAxisMinorTicks(axis, value),
          isMinorTicksSupported: () => true,
          getMinorTickSubdivisions: () => getScatterAxisMinorTickSubdivisions(axis),
          onMinorTickSubdivisionsChange: value => updateScatterAxisMinorTickSubdivisions(axis, value),
          onThicknessChange: value => updateScatterAxisStrokeWidth(value),
          onColorChange: value => updateScatterAxisColor(value),
          getNotationMode: () => getScatterAxisNotation(axis),
          onNotationChange: value => updateScatterAxisNotation(axis, value),
          isNotationSupported: () => true,
          isBrokenAxisSupported: () => true,
          getBrokenAxisEnabled: () => getBrokenAxisEnabled(axis),
          onBrokenAxisEnabledChange: value => updateBrokenAxisEnabled(axis, value),
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
        });
        if(brokenXScale && brokenXScale.isBroken){
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
        if(brokenYScale && brokenYScale.isBroken){
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
        debug('Debug: scatter axes stroke scaled',{ axisStrokeWidth, axisStrokeWidthBase, axisStroke });
        if(showFrame){
          debug('Debug: scatter frame request',{stroke:axisStroke, showFrame, axisStrokeWidth}); // Debug: frame styling inputs
          chartStyle.drawPlotFrame({ svg, margin, plotW, plotH, stroke: axisStroke, strokeWidth: axisStrokeWidth, sides: ['top','right'] });
        }
        // Frame closes scatter plot using axis styling continuity
        const xTickNodes=[];
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
            return;
          }
          const x = x2px(t);
          add('line',{x1:x,y1:xAxisY,x2:x,y2:xAxisY+tickLen,stroke:axisStroke,'stroke-width':axisStrokeWidth});
          const extra = Shared.computeAxisLabelYOffset ? Shared.computeAxisLabelYOffset(fs, tickLen, tickGap) : 0;
          const txt = add('text',{x, y: xAxisY + tickLen + tickGap + extra, 'font-size': fs, 'text-anchor':'middle', fill: chartStyle.TEXT_COLOR});
          txt.textContent = formatTickX(logX ? Math.pow(10, t) : t);
          Shared.applyTextBaseline && Shared.applyTextBaseline(txt,'hanging',fs);
          markFontEditable(txt,'xTick');
          xTickFontCount += 1;
          xTickNodes.push(txt);
        });
        chartStyle.applyLabelOrientation(xTickNodes,{angle:-45,anchor:'end',dy:'0.35em',force:bottomLayout.shouldRotate});
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
            return;
          }
          const y=y2px(t);
          add('line',{x1:yAxisX - tickLen,y1:y,x2:yAxisX,y2:y,stroke:axisStroke,'stroke-width':axisStrokeWidth});
          const txt=add('text',{x:yAxisX-(tickLen+tickGap),y,'font-size':fs,'text-anchor':'end','dominant-baseline':'middle',fill:chartStyle.TEXT_COLOR});
          txt.textContent=formatTickY(logY?Math.pow(10,t):t);
          markFontEditable(txt,'yTick');
          yTickFontCount+=1;
        });
        debug('Debug: scatter font tick binding',{ xTickFontCount, yTickFontCount }); // Debug: tick font binding counts
        debug('Debug: scatter ticks stroke scaled',{xTickCount:xScale.ticks.length,yTickCount:yScale.ticks.length,axisStrokeWidth});
        time(`scatterSvgDraw_${token}`);
        const pointGeometry = points.map(p => {
          const xv = logX ? Math.log10(p.x) : p.x;
          const yv = logY ? Math.log10(p.y) : p.y;
          return { xv, yv, cx: x2px(xv), cy: y2px(yv) };
        });
        let densityInfo = null;
        if(scatterColorModeApplied === 'density'){
          const densityPoints = pointGeometry.map(pos => ({
            x: pos.cx - margin.left,
            y: pos.cy - margin.top
          }));
          densityInfo = computeScatterDensityValues(densityPoints, { width: plotW, height: plotH });
          debug('Debug: scatter density computed',{ max: densityInfo.max, count: densityPoints.length });
        }
        const resolveNonScatterColor = point => {
          if(!point || !point.isSignificant){
            return fill;
          }
          if(scatterCurrentGraphType === 'volcano' && Number.isFinite(point.x) && point.x < 0){
            return SIGNIFICANT_NEGATIVE_COLOR;
          }
          return SIGNIFICANT_COLOR;
        };
        const frag=document.createDocumentFragment();
        const labelBBox=new Map();
        const manualLabelEntries = [];
        const pointBounds = [];
        let pointIndex=0;
        const isBubbleView = scatterCurrentGraphType==='scatter' && scatterState.viewMode === 'bubble';
        const resolveBubbleRadius = isBubbleView ? createBubbleRadiusScaler(points, dotSizePx) : null;
        for(const p of points){
          const geom = pointGeometry[pointIndex] || null;
          const xv = geom ? geom.xv : (logX ? Math.log10(p.x) : p.x);
          const yv = geom ? geom.yv : (logY ? Math.log10(p.y) : p.y);
          const cxVal=geom ? geom.cx : x2px(xv);
          const cyVal=geom ? geom.cy : y2px(yv);
          const densityRatio = densityInfo && densityInfo.max>0
            ? (densityInfo.values[pointIndex] || 0) / densityInfo.max
            : 0;
          const color=scatterCurrentGraphType==='scatter'
            ? (scatterColorModeApplied === 'density'
              ? (densityColorFor ? densityColorFor(densityRatio) : fill)
              : (useUniformLabelStyle ? fill : (scatterLabelColors[p.label]||fill)))
            : resolveNonScatterColor(p);
          const markerShape = isBubbleView ? 'circle' : (scatterCurrentGraphType==='scatter'
            ? (useUniformLabelStyle ? 'circle' : (labelShapeLookup.get(p.label) || 'circle'))
            : 'circle');
          const styleOverride = getScatterLabelStyle(p.label || null);
          const markerAlpha = styleOverride && styleOverride.alpha != null ? clampScatterAlpha(styleOverride.alpha) : alpha;
          const markerBorderWidth = styleOverride && styleOverride.borderWidth != null ? clampScatterBorderWidth(styleOverride.borderWidth) : borderWidthPx;
          const radiusOverride = styleOverride && styleOverride.size != null ? clampScatterSize(styleOverride.size) : null;
          const markerRadius = isBubbleView && resolveBubbleRadius
            ? resolveBubbleRadius(p)
            : (radiusOverride != null ? radiusOverride : dotSizePx);
          const markerBorderColor = styleOverride && styleOverride.borderColor ? styleOverride.borderColor : borderColor;
          const marker = createScatterMarkerElement(markerShape, {
            cx: cxVal,
            cy: cyVal,
            radius: markerRadius,
            fill: color,
            stroke: markerBorderWidth>0 ? markerBorderColor : null,
            strokeWidth: markerBorderWidth>0 ? markerBorderWidth : 0,
            fillOpacity: 1 - (markerAlpha != null ? markerAlpha : alpha),
            strokeOpacity: 1 - (markerAlpha != null ? markerAlpha : alpha)
          });
          if(!marker){
            continue;
          }
          pointBounds.push({ cx: cxVal, cy: cyVal, r: markerRadius });
          let bbox=labelBBox.get(p.label||'__none');
          if(!bbox){bbox={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}; labelBBox.set(p.label||'__none',bbox);}
          const bboxRadius = markerRadius;
          bbox.minX=Math.min(bbox.minX,cxVal-bboxRadius);
          bbox.maxX=Math.max(bbox.maxX,cxVal+bboxRadius);
          bbox.minY=Math.min(bbox.minY,cyVal-bboxRadius);
          bbox.maxY=Math.max(bbox.maxY,cyVal+bboxRadius);
          const manualLabelText = (p.pointName || p.label || '').trim();
          if((p.isManualLabel || p.isThresholdLabel) && manualLabelText){
            manualLabelEntries.push({
              text: manualLabelText,
              cx: cxVal,
              cy: cyVal,
              radius: markerRadius,
              labelColor: scatterCurrentGraphType === 'volcano' && p.isSignificant
                ? (Number.isFinite(p.x) && p.x < 0 ? SIGNIFICANT_NEGATIVE_COLOR : SIGNIFICANT_COLOR)
                : null
            });
          }
          attachScatterPointTooltip(marker, {
            label: p.label || '',
            pointName: p.pointName || '',
            rowIndex: Number.isInteger(p.rowIndex) ? p.rowIndex : undefined,
            isManualLabel: !!p.isManualLabel,
            x: p.x,
            y: p.y,
            logXValue: logX ? xv : undefined,
            logYValue: logY ? yv : undefined,
            graphType: scatterCurrentGraphType,
            isSignificant: typeof p.isSignificant === 'boolean' ? p.isSignificant : undefined,
            size: isBubbleView ? p.bubbleValue : undefined
          });
          frag.appendChild(marker);
          pointIndex++;
          if(pointIndex >= nextPointProgress){info('scatter svg draw progress',{pointIndex,token});nextPointProgress += pointProgressInterval;}
        }
        const pointLayer=add('g',{'data-export-layer':'scatter-points','data-layer':'points'});
        pointLayer.appendChild(frag);
        if(annotationRequests.length){
          const annotationLayout = layoutScatterAnnotations({
            requests: annotationRequests,
            pointGeometry,
            margin,
            plotW,
            plotH,
            fontSize: annotationFontPx,
            leaderPadding: annotationLeaderPadding,
            leaderGap: Math.max(annotationLeaderPadding * 1.25, annotationLeaderPadding + 4),
            textPadding: annotationTextPadding,
            axisPadding: annotationAxisPadding,
            graphType: scatterCurrentGraphType,
            verticalPadding: Math.max(
              annotationAxisPadding * 0.6 * Math.max(0.6, annotationCrowdingScale),
              fs * 0.6 * Math.max(0.6, annotationCrowdingScale),
              6
            )
          });
          if(annotationLayout.length){
            const annotationLayer=document.createElementNS(NS,'g');
            annotationLayout.forEach((entry, idx)=>{
              const textNode=document.createElementNS(NS,'text');
              textNode.setAttribute('x',entry.textX);
              textNode.setAttribute('y',entry.anchorY);
              textNode.setAttribute('font-size',annotationFontPx);
              textNode.setAttribute('fill',SIGNIFICANT_COLOR);
              textNode.setAttribute('text-anchor',entry.textAnchor);
              textNode.setAttribute('dominant-baseline','middle');
              textNode.textContent=entry.label;
              markFontEditable(textNode,'annotation',`annotation-${idx}`);
              annotationLayer.appendChild(textNode);
              const connector=document.createElementNS(NS,'path');
              const path=`M ${entry.attachX} ${entry.anchorY} L ${entry.pointX} ${entry.pointY}`;
              connector.setAttribute('d',path);
              connector.setAttribute('fill','none');
              connector.setAttribute('stroke',SIGNIFICANT_COLOR);
              connector.setAttribute('stroke-width',annotationStrokeWidth);
              connector.setAttribute('stroke-linecap','round');
              annotationLayer.appendChild(connector);
            });
            svg.appendChild(annotationLayer);
            debug('Debug: scatter annotations rendered',{count:annotationLayout.length,graphType:scatterCurrentGraphType});
          }
        }
        if(manualLabelEntries.length){
          const labelLayer = document.createElementNS(NS,'g');
          labelLayer.setAttribute('data-layer','point-labels');
          labelLayer.setAttribute('pointer-events','none');
          const baseManualLabelSize = fs * 0.6;
          const labelFontSize = computeScatterManualLabelFontSize(baseManualLabelSize, manualLabelEntries.length, plotW, plotH);
          const labelScale = Math.min(1, labelFontSize / Math.max(1, baseManualLabelSize));
          const leaderStrokeWidth = chartStyle.scaleStrokeWidth(0.75 * labelScale, styleScaleInfo, { context: 'scatter-point-label', min: 0.25 });
          const labelColor = chartStyle.TEXT_COLOR || '#333333';
          const plotLeft = margin.left;
          const plotRight = margin.left + plotW;
          const plotTop = margin.top;
          const plotBottom = margin.top + plotH;
          const font = typeof chartStyle?.makeFont === 'function'
            ? chartStyle.makeFont(labelFontSize)
            : null;
          const manualLabelLayout = computeScatterManualLabelLayout(manualLabelEntries, {
            plotLeft,
            plotRight,
            plotTop,
            plotBottom,
            labelFontSize,
            leaderGap: Math.max(2, Math.round(labelFontSize * 0.2)),
            leaderScale: labelScale,
            pointBounds,
            measureText: chartStyle?.measureText,
            font,
            angleSteps: 16,
            maxLeaderScale: 3
          });
          manualLabelLayout.forEach(result => {
            const entry = result.entry;
            const placement = result.placement;
            const cx = Number(entry?.cx) || 0;
            const cy = Number(entry?.cy) || 0;
            const textValue = entry?.text ? String(entry.text) : '';
            const entryColor = entry?.labelColor || labelColor;
            if(!textValue || !placement){
              return;
            }
            const textX = placement.textX;
            const textY = placement.textY;
            const anchor = placement.anchor;
            const lineX2 = placement.lineX2;
            const leader = document.createElementNS(NS,'line');
            leader.setAttribute('x1', String(cx));
            leader.setAttribute('y1', String(cy));
            leader.setAttribute('x2', String(lineX2));
            leader.setAttribute('y2', String(textY));
            leader.setAttribute('stroke', entryColor);
            leader.setAttribute('stroke-width', String(leaderStrokeWidth));
            leader.setAttribute('stroke-linecap', 'round');
            labelLayer.appendChild(leader);
            const textNode = document.createElementNS(NS,'text');
            textNode.setAttribute('x', String(textX));
            textNode.setAttribute('y', String(textY));
            textNode.setAttribute('font-size', String(labelFontSize));
            textNode.setAttribute('fill', entryColor);
            textNode.setAttribute('text-anchor', anchor);
            textNode.setAttribute('dominant-baseline', 'middle');
            textNode.textContent = textValue;
            labelLayer.appendChild(textNode);
          });
          svg.appendChild(labelLayer);
          debug('Debug: scatter manual labels rendered', { count: manualLabelEntries.length });
        }
        timeEnd(`scatterSvgDraw_${token}`);
        if(legendVisible){
          const plotRight=margin.left+plotW;
          const defaultLegendX=plotRight+legendGapPx;
          const defaultLegendY=margin.top;
          const legendPos=scatterLabelPositions?.legend;
          const legendGroup=legendRenderer.draw(svg,{
            x: legendPos?.x ?? defaultLegendX,
            y: legendPos?.y ?? defaultLegendY
          });
          if(legendGroup && typeof Shared.enableLegendDrag === 'function'){
            Shared.enableLegendDrag(legendGroup, svg, {
              onDragEnd: pos => {
                scatterLabelPositions.legend = { x: pos.x, y: pos.y };
                if(Shared.isDebugEnabled?.()){
                  console.debug('Debug: scatter legend position saved', pos);
                }
              }
            });
          }
          debug('Debug: scatter legend rendered shared helper',{
            legendX: legendPos?.x ?? defaultLegendX,
            legendY: legendPos?.y ?? defaultLegendY,
            legendGapPx,
            entryCount:legendRenderer.entries.length
          });
        }
        const xAxisBase=margin.top+plotH;
        const defaultXLabelX = margin.left+plotW/2;
        // Prevent overlap between x-axis title and rotated tick labels by adding
        // a rotation-aware separation to the default Y when ticks rotate.
        let rotationExtra = 0;
        if(bottomLayout && bottomLayout.shouldRotate){
          const maxLabelWidthLocal = bottomLayout.maxLabelWidth || 0;
          rotationExtra = Math.min(220, Math.max(fs * 1.8, Math.ceil(Math.SQRT1_2 * maxLabelWidthLocal) + fs));
        }
        const rotationSeparation = rotationExtra ? Math.round(rotationExtra * 0.55) : 0;
        const defaultXLabelY = xAxisBase + bottomLayout.titleOffset + rotationSeparation;
        const xLabelPos = scatterLabelPositions?.xLabel;
        const xText=add('text',{x: xLabelPos?.x ?? defaultXLabelX, y: xLabelPos?.y ?? defaultXLabelY,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        xText.textContent=scatterXLabelText;
        markFontEditable(xText,'xTitle','xTitle');
        const applyScatterXLabel=value=>{
          const nextValue=value!=null?String(value):'';
          scatterXLabelText=nextValue;
          if(xText.textContent!==nextValue){
            xText.textContent=nextValue;
          }
          scheduleDrawScatter();
        };
        makeEditableLocal(xText,txt=>{
          const previous=scatterXLabelText!=null?String(scatterXLabelText):'';
          const nextValue=txt!=null?String(txt):'';
          if(previous===nextValue){
            return;
          }
          applyScatterXLabel(nextValue);
          recordScatterChange('scatter:x-label',previous,nextValue,applyScatterXLabel);
        });
        // Enable drag for x-axis label
        if(typeof Shared.enableLabelDrag === 'function'){
          Shared.enableLabelDrag(xText, svg, {
            onDragEnd: pos => {
              scatterLabelPositions.xLabel = { x: pos.x, y: pos.y };
              console.debug('Debug: scatter x-label position saved', pos);
            }
          });
        }
        const defaultYX = margin.left-(maxYLabelWidth+tickLen+tickGap+axisMetrics.axisTitleGap+fs*0.5);
        const defaultYY = margin.top+plotH/2;
        const yLabelPos = scatterLabelPositions?.yLabel;
        const yTextX = yLabelPos?.x ?? defaultYX;
        const yTextY = yLabelPos?.y ?? defaultYY;
        info('scatter y-axis position',yTextX);
        const yText=add('text',{x:yTextX,y:yTextY,transform:`rotate(-90 ${yTextX} ${yTextY})`,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        yText.textContent=scatterYLabelText;
        markFontEditable(yText,'yTitle','yTitle');
        const applyScatterYLabel=value=>{
          const nextValue=value!=null?String(value):'';
          scatterYLabelText=nextValue;
          if(yText.textContent!==nextValue){
            yText.textContent=nextValue;
          }
          scheduleDrawScatter();
        };
        makeEditableLocal(yText,txt=>{
          const previous=scatterYLabelText!=null?String(scatterYLabelText):'';
          const nextValue=txt!=null?String(txt):'';
          if(previous===nextValue){
            return;
          }
          applyScatterYLabel(nextValue);
          recordScatterChange('scatter:y-label',previous,nextValue,applyScatterYLabel);
        });
        // Enable drag for y-axis label
        if(typeof Shared.enableLabelDrag === 'function'){
          Shared.enableLabelDrag(yText, svg, {
            onDragEnd: pos => {
              scatterLabelPositions.yLabel = { x: pos.x, y: pos.y };
              console.debug('Debug: scatter y-label position saved', pos);
            }
          });
        }
        const defaultTitleX = margin.left+plotW/2;
        const defaultTitleY = margin.top/2;
        const titlePos = scatterLabelPositions?.title;
        const titleText=add('text',{x: titlePos?.x ?? defaultTitleX, y: titlePos?.y ?? defaultTitleY,'text-anchor':'middle','font-size':fs,fill:chartStyle.TEXT_COLOR});
        titleText.textContent=scatterTitleText;
        markFontEditable(titleText,'graphTitle','graphTitle');
        const applyScatterTitle=value=>{
          const nextValue=value!=null?String(value):'';
          scatterTitleText=nextValue;
          if(titleText.textContent!==nextValue){
            titleText.textContent=nextValue;
          }
          scheduleDrawScatter();
        };
        makeEditableLocal(titleText,txt=>{
          const previous=scatterTitleText!=null?String(scatterTitleText):'';
          const nextValue=txt!=null?String(txt):'';
          if(previous===nextValue){
            return;
          }
          applyScatterTitle(nextValue);
          recordScatterChange('scatter:title',previous,nextValue,applyScatterTitle);
        });
        // Enable drag for title
        if(typeof Shared.enableLabelDrag === 'function'){
          Shared.enableLabelDrag(titleText, svg, {
            onDragEnd: pos => {
              scatterLabelPositions.title = { x: pos.x, y: pos.y };
              console.debug('Debug: scatter title position saved', pos);
            }
          });
        }
        if(scatterCurrentGraphType==='scatter'){
          const statsPoints=points.map(p=>({ x:p.x, y:p.y }));
          const statsPointSummary=summarizeScatterPoints(statsPoints);
          const statsPayloadBase={
            graphType:'scatter',
            points:statsPoints,
            pointSummary:statsPointSummary,
            domain:{ minX:xMin, maxX:xMax },
            thresholds:null,
            significance:null,
            precomputedStats:null,
            precomputedSignature:null
          };
          const nextStatsSignature=buildScatterStatsSignature(statsPayloadBase);
          const cachedContext=scatterState.statsContext;
          const canReuseStats=scatterHasComputedStats()
            && typeof scatterState.statsContextSignature==='string'
            && scatterState.statsContextSignature===nextStatsSignature
            && !!cachedContext?.precomputedStats;
          let visualStats=null;
          if(canReuseStats){
            visualStats=cachedContext.precomputedStats;
            statsPayloadBase.precomputedStats=cachedContext.precomputedStats;
            statsPayloadBase.precomputedSignature=cachedContext.precomputedSignature || getScatterStatsControlSignature();
          }
          if(visualStats?.regression){
            scatterLastRegressionSummary = typeof regressionTools.createSummary === 'function'
              ? regressionTools.createSummary(visualStats.regression)
              : null;
          }else{
            scatterLastRegressionSummary = null;
          }
          const shouldRenderTrend = showLine && visualStats;
          const shouldRenderStatsOverlay = showLineStats && visualStats;
          if(shouldRenderTrend){
            const regressionModel = visualStats.regression;
            if(regressionModel){
              const intervalSamplesRaw = Array.isArray(regressionModel.intervals?.samples) ? regressionModel.intervals.samples.slice() : [];
              const intervalSamples = intervalSamplesRaw.sort((a,b)=> (a?.x ?? 0) - (b?.x ?? 0));
              const showLineMaster = !!(scatterShowLine && scatterShowLine.checked);
              const drawCI = !!(showLineMaster && scatterShowCI && scatterShowCI.checked);
              const drawPI = !!(showLineMaster && scatterShowPI && scatterShowPI.checked);
              const intervalLayer = ((drawCI || drawPI) && intervalSamples.length >= 2) ? document.createElementNS(NS,'g') : null;
              if(intervalLayer){
                intervalLayer.setAttribute('data-layer','interval-bands');
                svg.appendChild(intervalLayer);
                const buildIntervalPath = (lowerKey, upperKey) => {
                  const upperPoints=[];
                  const lowerPoints=[];
                  intervalSamples.forEach(sample => {
                    const xRaw = sample?.x;
                    const upperRaw = sample?.[upperKey];
                    const lowerRaw = sample?.[lowerKey];
                    if(!Number.isFinite(xRaw) || !Number.isFinite(upperRaw) || !Number.isFinite(lowerRaw)){
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
                    upperPoints.push({ x: x2px(xVal), y: y2px(upperVal) });
                    lowerPoints.push({ x: x2px(xVal), y: y2px(lowerVal) });
                  });
                  if(upperPoints.length < 2 || lowerPoints.length < 2){
                    return null;
                  }
                  const commands=[];
                  upperPoints.forEach((pt, idx)=>{
                    commands.push(`${idx?'L':'M'}${pt.x},${pt.y}`);
                  });
                  lowerPoints.slice().reverse().forEach(pt=>{
                    commands.push(`L${pt.x},${pt.y}`);
                  });
                  commands.push('Z');
                  return commands.join(' ');
                };
                const confidencePath = drawCI ? buildIntervalPath('ciLow','ciHigh') : null;
                const predictionPath = drawPI ? buildIntervalPath('piLow','piHigh') : null;
                if(confidencePath){
                  const confEl=document.createElementNS(NS,'path');
                  confEl.setAttribute('d',confidencePath);
                  confEl.setAttribute('fill','#d62728');
                  confEl.setAttribute('fill-opacity','0.15');
                  confEl.setAttribute('stroke','none');
                  confEl.dataset.band='confidence';
                  intervalLayer.appendChild(confEl);
                }
                if(predictionPath){
                  const predEl=document.createElementNS(NS,'path');
                  predEl.setAttribute('d',predictionPath);
                  predEl.setAttribute('fill','#d62728');
                  predEl.setAttribute('fill-opacity','0.08');
                  predEl.setAttribute('stroke','none');
                  predEl.dataset.band='prediction';
                  intervalLayer.appendChild(predEl);
                }
                debug('Debug: scatter interval shading rendered', {
                  sampleCount: intervalSamples.length,
                  hasConfidence: !!confidencePath,
                  hasPrediction: !!predictionPath
                });
              }
              const sampleCount = regressionModel.mode === 'linear' ? 60 : 160;
              const samples = typeof regressionTools.sampleCurve === 'function'
                ? regressionTools.sampleCurve(regressionModel,{ minX: xMin, maxX: xMax, sampleCount })
                : [];
              const pathCommands = [];
              samples.forEach((sample) => {
                if(!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return;
                if(logX && sample.x <= 0) return;
                if(logY && sample.y <= 0) return;
                const xVal = logX ? Math.log10(sample.x) : sample.x;
                const yVal = logY ? Math.log10(sample.y) : sample.y;
                if(!Number.isFinite(xVal) || !Number.isFinite(yVal)) return;
                const command = `${pathCommands.length?'L':'M'}${x2px(xVal)},${y2px(yVal)}`;
                pathCommands.push(command);
              });
              if(pathCommands.length>1){
                const strokeWidth=chartStyle.scaleStrokeWidth(1.5, styleScaleInfo, { context: 'scatter-trend', min: 0.75 });
                const path=add('path',{d:pathCommands.join(' '),fill:'none',stroke:'#d00','stroke-width':strokeWidth});
                path.setAttribute('vector-effect','non-scaling-stroke');
                debug('Debug: scatter regression path drawn',{ mode: regressionModel.mode, commandCount: pathCommands.length, strokeWidth });
              }else{
                debug('Debug: scatter regression path skipped',{ mode: regressionModel.mode, pathCommands: pathCommands.length });
              }
            }else{
              debug('Debug: scatter regression trend omitted',{ showLine, hasModel: !!regressionModel });
            }
          }else{
            if(showLine && !visualStats){
              debug('Debug: scatter regression trend omitted',{ showLine, reason:'stats-not-computed' });
            }
          }
          if(shouldRenderStatsOverlay){
            const regressionModel = visualStats.regression;
            const infoLines=[];
            if(regressionModel?.summary?.equation){
              infoLines.push(regressionModel.summary.equation);
            }else if(Number.isFinite(visualStats.m) && Number.isFinite(visualStats.b)){
              const eq=`y=${visualStats.m.toFixed(2)}x${visualStats.b>=0?'+':'-'}${Math.abs(visualStats.b).toFixed(2)}`;
              infoLines.push(eq);
            }
            infoLines.push(`r=${formatMetricValue(visualStats.r,2)} R²=${formatMetricValue(visualStats.r2,2)} p=${formatP(visualStats.p)}`);
            const statsFontSize = Math.max(Math.round(fs * 0.65), 7);
            const statsPos = scatterLabelPositions?.stats || null;
            const defaultInfoX=margin.left+plotW-4;
            const slopeCandidate=Number.isFinite(visualStats.m)?visualStats.m:0;
            const defaultInfoY=slopeCandidate>=0?margin.top+plotH-(fs*2):margin.top+fs*2;
            const infoX=Number.isFinite(statsPos?.x)?statsPos.x:defaultInfoX;
            const infoY=Number.isFinite(statsPos?.y)?statsPos.y:defaultInfoY;
            const infoText=add('text',{x:infoX,y:infoY,'text-anchor':'start','font-size':statsFontSize,fill:'#000'});
            infoLines.forEach((line,lineIdx)=>{
              const t=document.createElementNS(NS,'tspan');
              t.setAttribute('dy',lineIdx===0?0:statsFontSize);
              t.setAttribute('x', String(infoX));
              t.textContent=line;
              infoText.appendChild(t);
            });
            if(typeof Shared.enableLabelDrag === 'function'){
              Shared.enableLabelDrag(infoText, svg, {
                syncChildX: true,
                onDragEnd: pos => {
                  scatterLabelPositions.stats = { x: pos.x, y: pos.y };
                  console.debug('Debug: scatter stats overlay position saved', pos);
                }
              });
            }
            info('scatter stats (visual)',{ stats: visualStats, regressionSummary: scatterLastRegressionSummary });
          }else if(showLineStats && !visualStats){
            debug('Debug: scatter stats overlay omitted',{ reason:'stats-not-computed' });
          }
          statsContextPayload=statsPayloadBase;
        }else{
          scatterLastRegressionSummary=null;
          const totalPoints=points.length;
          const nonSigCount=totalPoints-significantCount;
          const negLabel=scatterCurrentGraphType==='ma' ? (extraLabelRaw && String(extraLabelRaw).trim() ? `-log10(${String(extraLabelRaw).trim()})` : '-log10(p-value)') : scatterYLabelText;
          statsContextPayload={
            graphType:scatterCurrentGraphType,
            points:[],
            pointSummary:null,
            domain:null,
            thresholds:{
              log2fc:log2fcThreshold,
              negLogP:negLogPThreshold,
              negLabel
            },
            significance:{
              totalPoints,
              significantCount,
              nonSignificantCount:nonSigCount,
              log2fcThreshold,
              negLogPThreshold,
              missingP:maMissingPCount,
              negLabel
            },
            precomputedStats:null,
            precomputedSignature:null,
            signatureSeed:[
              totalPoints,
              significantCount,
              nonSigCount,
              log2fcThreshold,
              negLogPThreshold,
              maMissingPCount,
              negLabel
            ].join('|')
          };
          debug('Debug: scatter significance summary',{graphType:scatterCurrentGraphType,significantCount,nonSigCount,log2fcThreshold,negLogPThreshold,missingP:maMissingPCount});
        }
        primeScatterStatsContext(statsContextPayload);
        ensureGraphViewport(svg, { padding: Math.max(fs, 16), debugLabel: 'scatter-graph' });
        scatterLayout?.syncPanels?.({ skipSchedule: true });
        syncScatterAutoDrawNoticeWidth('draw');
        info('scatter render complete with enhanced styles');
      }
      const runScatterDrawCycle = async () => {
        let status = 'complete';
        try{
          await drawScatter();
        }catch(err){
          status = 'error';
          throw err;
        }finally{
          resolveScatterOverlay(status);
        }
      };
      const scheduleScatterBase = Shared.debounceFrame ? Shared.debounceFrame(runScatterDrawCycle) : runScatterDrawCycle;
      const scheduleScatterInstrumented = (opts) => {
        const nextOpts = opts || {};
        const overlayReason = nextOpts.reason || (nextOpts.force ? 'manual-render' : 'schedule');
        if(nextOpts.force){
          markScatterOverlayPending(overlayReason);
          forceScatterOverlay(overlayReason, { message: 'Rendering scatter plot...' });
        }else{
          queueScatterOverlay(overlayReason);
        }
        const runSchedule = () => scheduleScatterBase(nextOpts);
        const shouldDelayForOverlay = scatterOverlayController?.isActive?.() && !nextOpts.viewOnly;
        if(shouldDelayForOverlay){
          const scheduleAfterPaint = () => {
            scatterDebug('Debug: scatter autoDraw deferred for overlay',{ reason: overlayReason });
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
      scheduleDrawScatterRaw = scheduleScatterInstrumented;
      if(scatterAutoDrawManager){
        scatterAutoDrawManager.setScheduleRaw(scheduleDrawScatterRaw);
        scatterAutoDrawManager.setElements({
          renderRow: scatterRenderRowEl,
          renderButton: scatterRenderButtonEl,
          notice: scatterAutoDrawNoticeEl
        });
        scheduleDrawScatter = (opts) => scatterAutoDrawManager.schedule(opts);
        scatterAutoDrawManager.updateUi();
        scatterAutoDrawManager.evaluateThresholds();
        syncScatterAutoDrawNoticeWidth('auto-draw-init');
      }else{
        scheduleDrawScatter = scheduleDrawScatterRaw;
      }
      scatterLayout?.setScheduleDraw?.(() => scheduleDrawScatter());
      console.debug('Debug: scatter scheduleDraw configured via Shared.debounceFrame', { guarded: !!scatterAutoDrawManager }); // Debug: scheduler setup
    
    
      function computeScatterStats(points,method,options={}){
        console.log('computeScatterStats',method,points.length,options);
        const regressionMode = options.regressionMode || 'linear';
        const domainOption = options.domain || null;
        const x=points.map(p=>p.x);
        const y=points.map(p=>p.y);
        const n=points.length;
        if(n<3){
          return {method, r:NaN, p:NaN, r2:NaN, m:NaN, b:NaN, regression:null};
        }
        const pearson=jStat.corrcoeff(x,y);
        let r,label;
        if(method==='pearson'){r=pearson; label='Pearson';}
        else {r=jStat.spearmancoeff(x,y); label='Spearman';}
        const t=r*Math.sqrt((n-2)/(1-r*r));
        const p=2*(1-jStat.studentt.cdf(Math.abs(t),n-2));
        const xMean=jStat.mean(x);
        const yMean=jStat.mean(y);
        const num=x.reduce((s,xi,i)=>s+(xi-xMean)*(y[i]-yMean),0);
        const den=x.reduce((s,xi)=>s+Math.pow(xi-xMean,2),0);
        const linearSlope=den!==0?num/den:NaN;
        const linearIntercept=yMean-linearSlope*xMean;
        let regression=null;
        if(typeof regressionTools.fitRegression==='function'){
          try{
            regression=regressionTools.fitRegression(points,{ mode: regressionMode });
            if(regression && domainOption){
              const minCandidate = Number.isFinite(domainOption.minX) ? domainOption.minX : Number.isFinite(domainOption.min) ? domainOption.min : undefined;
              const maxCandidate = Number.isFinite(domainOption.maxX) ? domainOption.maxX : Number.isFinite(domainOption.max) ? domainOption.max : undefined;
              if(Number.isFinite(minCandidate) && Number.isFinite(maxCandidate)){
                regression.domain = { minX: minCandidate, maxX: maxCandidate };
              }
            }
          }catch(err){
            console.error('Regression fit error', err);
          }
        }
        const summaryForRegression = regression?.summary;
        const regressionSlope = summaryForRegression?.slope;
        const regressionIntercept = summaryForRegression?.intercept;
        let resolvedSlope = Number.isFinite(regressionSlope) ? regressionSlope : linearSlope;
        if(summaryForRegression?.primaryParameter && Number.isFinite(summaryForRegression.primaryParameter.value)){
          resolvedSlope = summaryForRegression.primaryParameter.value;
        }
        const resolvedIntercept = Number.isFinite(regressionIntercept) ? regressionIntercept : linearIntercept;
        const regressionR2 = regression?.metrics?.r2;
        const r2 = Number.isFinite(regressionR2) ? regressionR2 : pearson*pearson;
        const stats={method:label, r, p, r2, m:resolvedSlope, b:resolvedIntercept, regression};
        console.log('computeScatterStats result',{method:label,r,r2,p,m:resolvedSlope,b:resolvedIntercept,mode:regressionMode});
        return stats;
      }
      function updateLineStats(series){
        const method=lineStatType.value;
        const regressionEl=global.lineRegressionMode || document.getElementById('lineRegressionMode');
        const regressionMode=(regressionEl&&regressionEl.value)||'linear';
        console.log('updateLineStats start',{seriesCount:series.length,method,regressionMode});
        const tableRows=[];
        let methodLabel='';
        series.forEach(s=>{
          const pts=s.points.filter(p=>p);
          if(pts.length>=3){
            const stats=computeScatterStats(pts,method,{ regressionMode });
            methodLabel=stats.method;
            tableRows.push({
              series:s.name,
              r:formatMetricValue(stats.r),
              p:formatP(stats.p),
              slope:formatMetricValue(stats.regression?.summary?.slope ?? stats.m),
              r2:formatMetricValue(stats.regression?.metrics?.r2 ?? stats.r2),
              rmse:formatMetricValue(stats.regression?.metrics?.rmse)
            });
          }
        });
        if(tableRows.length){
          renderStatsCard(lineStatsResults,{
            caption:methodLabel?`${methodLabel} correlation summary (${regressionMode} regression)`:'Correlation summary',
            columns:[
              {key:'series',label:'Series',align:'left'},
              {key:'r',label:'r',align:'right'},
              {key:'p',label:'p',align:'right'},
              {key:'slope',label:'Slope',align:'right'},
              {key:'r2',label:'R²',align:'right'},
              {key:'rmse',label:'RMSE',align:'right'}
            ],
            rows:tableRows,
            options:{
              fileName:'scatter-series-correlation',
              contextLabel:'scatter-series-corr'
            }
          });
        }else{
          lineStatsResults.textContent='Not enough data for statistics.';
        }
        console.log('updateLineStats complete',{rows:tableRows.length,regressionMode});
      }
      function updateHistStats(values){
        console.log('updateHistStats start',values.length);
        if(!values.length){histStatsResults.textContent='No data';return;}
        const mean=jStat.mean(values);
        const median=jStat.median(values);
        const sd=jStat.stdev(values,true);
        renderStatsCard(histStatsResults,{
          caption:'Distribution summary',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows:[
            {metric:'n',value:String(values.length)},
            {metric:'Mean',value:mean.toFixed(4)},
            {metric:'Median',value:median.toFixed(4)},
            {metric:'SD',value:sd.toFixed(4)}
          ],
          options:{
            fileName:'histogram-summary',
            contextLabel:'hist-summary'
          }
        });
        console.log('updateHistStats result',{mean,median,sd});
      }
      function updatePieStats(labels,observed,expected){
        console.log('updatePieStats start',{labels:labels.length,observed:observed.length,expected:expected.length});
        if(!observed.length){pieStatsResults.textContent='No data';return;}
        if(expected.length!==observed.length || expected.some(e=>isNaN(e))){
          pieStatsResults.textContent='Expected values required';
          return;
        }
        const chi2=observed.reduce((s,o,i)=>s+Math.pow(o-expected[i],2)/expected[i],0);
        const df=observed.length-1;
        const p=1-jStat.chisquare.cdf(chi2,df);
        renderStatsCard(pieStatsResults,{
          caption:'Goodness-of-fit test',
          columns:[
            {key:'metric',label:'Metric',align:'left'},
            {key:'value',label:'Value',align:'right'}
          ],
          rows:[
            {metric:'Chi²',value:chi2.toFixed(4)},
            {metric:'df',value:String(df)},
            {metric:'p-value',value:isFinite(p)?formatP(p):'N/A'}
          ],
          options:{
            fileName:'pie-chi-square',
            contextLabel:'pie-chi-square'
          }
        });
        console.log('updatePieStats result',{chi2,df,p});
      }
    
      function getScatterGraphPayload(){
      const axisSettings = ensureScatterAxisSettings();
      const fontStyles = exportFontStyles('scatter');
      return {
        type:'scatter',
        data:scatterHot.getData(),
        exclusions: scatterHot?.exportExclusions?.() || Shared.hot.exportExclusions(scatterHot),
        config:{
          title:scatterTitleText,
            xLabel:scatterXLabelText,
            yLabel:scatterYLabelText,
            zLabel:scatterZLabelText,
            dotSize:scatterDotSize.value,
            fill:scatterFill.value,
            colorMode: scatterColorMode ? normalizeScatterColorMode(scatterColorMode.value) : SCATTER_DENSITY_MODE_DEFAULT,
            densityPalette: scatterDensityPalette ? normalizeScatterDensityPalette(scatterDensityPalette.value) : SCATTER_DENSITY_PALETTE_DEFAULT,
            border:scatterBorder.value,
            borderWidth:scatterBorderWidth.value,
            alpha:scatterAlpha.value,
            labelColors:{ ...scatterLabelColors },
            labelShapes:{ ...scatterLabelShapes },
            labelStyles:{ ...scatterLabelStyles },
            showGrid:scatterShowGrid.checked,
            showFrame:scatterShowFrame.checked,
            showLegend:scatterShowLegend ? scatterShowLegend.checked : true,
            logX:scatterLogX.checked,
            logY:scatterLogY.checked,
            logPlusOneX:!!scatterState.logPlusOneX,
            logPlusOneY:!!scatterState.logPlusOneY,
            xMin:scatterXMin.value,
            xMax:scatterXMax.value,
            yMin:scatterYMin.value,
            yMax:scatterYMax.value,
            originMode:scatterOriginMode.value,
            originX:scatterOriginX.value,
            originY:scatterOriginY.value,
            showLine:scatterShowLine.checked,
            showPlotStats:scatterShowPlotStats ? scatterShowPlotStats.checked : false,
            showCI: scatterShowCI ? !!scatterShowCI.checked : undefined,
            showPI: scatterShowPI ? !!scatterShowPI.checked : undefined,
            showDiagnostics:scatterShowDiagnostics ? scatterShowDiagnostics.checked : false,
            graphType:scatterGraphTypeSelect?.value || 'scatter',
            log2fcThreshold:scatterLog2FCThreshold?.value || '',
            negLogPThreshold:scatterNegLogPThreshold?.value || '',
            showSignificantLabels: scatterShowSignificantLabels ? !!scatterShowSignificantLabels.checked : undefined,
            regression:{
              mode: scatterRegressionMode ? (scatterRegressionMode.value || 'linear') : 'linear',
              summary: scatterLastRegressionSummary
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
            notationX: axisSettings.x?.notation ?? 'auto',
            notationY: axisSettings.y?.notation ?? 'auto',
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
            fontStyles: fontStyles || undefined,
            viewMode: scatterState.requestedViewMode || scatterState.viewMode,
            rotation: scatterState.rotation ? {
              x: scatterState.rotation.x,
              y: scatterState.rotation.y,
              z: scatterState.rotation.z,
              quaternion: scatterState.rotation.quaternion ? {
                w: scatterState.rotation.quaternion.w,
                x: scatterState.rotation.quaternion.x,
                y: scatterState.rotation.quaternion.y,
                z: scatterState.rotation.quaternion.z
              } : null
            } : null,
            labelPositions: scatterLabelPositions || null,
            stats: {
              resultsHtml: (scatterStatsResults ? (scatterStatsResults.innerHTML || '') : null),
              lastRunVersion: Number.isFinite(scatterState.statsLastRunVersion) ? scatterState.statsLastRunVersion : 0,
              contextSignature: scatterState.statsContextSignature || null,
              contextVersion: Number.isFinite(scatterState.statsContextVersion) ? scatterState.statsContextVersion : 0,
              statType: scatterStatType ? scatterStatType.value : undefined,
              regressionMode: scatterRegressionMode ? scatterRegressionMode.value : undefined,
              showCI: scatterShowCI ? !!scatterShowCI.checked : undefined,
              showPI: scatterShowPI ? !!scatterShowPI.checked : undefined,
              showDiagnostics: scatterShowDiagnostics ? !!scatterShowDiagnostics.checked : undefined
            }
          }
        };
      }
      let scatterFileHandle=null, scatterFileName='scatter.graph';
      async function saveScatterFile(){
        console.debug('Debug: saveScatterFile invoked', { hasHandle: !!scatterFileHandle });
        if(!fileIO || typeof fileIO.saveGraphFile !== 'function'){
          console.error('saveScatterFile missing fileIO.saveGraphFile');
          return;
        }
        const result = await fileIO.saveGraphFile({
          context: 'scatter',
          fileHandle: scatterFileHandle,
          getPayload: getScatterGraphPayload,
          fileName: scatterFileName,
          downloadFileName: scatterFileName,
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; }
        });
        console.debug('Debug: saveScatterFile result', result);
      }
      async function saveAsScatterFile(){
        console.debug('Debug: saveAsScatterFile invoked', { currentName: scatterFileName });
        if(!fileIO || typeof fileIO.saveGraphFileAs !== 'function'){
          console.error('saveAsScatterFile missing fileIO.saveGraphFileAs');
          return;
        }
        const result = await fileIO.saveGraphFileAs({
          context: 'scatter',
          getPayload: getScatterGraphPayload,
          fileName: scatterFileName,
          downloadFileName: scatterFileName,
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; }
        });
        console.debug('Debug: saveAsScatterFile result', result);
      }
      async function openScatterFile(){
        console.debug('Debug: openScatterFile invoked');
        if(!fileIO || typeof fileIO.openGraphFile !== 'function'){
          console.error('openScatterFile missing fileIO.openGraphFile');
          return;
        }
        const result = await fileIO.openGraphFile({
          context: 'scatter',
          setFileHandle: handle => { scatterFileHandle = handle; },
          setFileName: name => { scatterFileName = name; },
          loadFromFile: file => loadScatterGraphFile(file),
          triggerInput: () => {
            const input = document.getElementById('scatterGraphFile');
            if(input){
              input.value='';
              input.click();
            }
          }
        });
        console.debug('Debug: openScatterFile result', result);
      }
      function applyScatterPayload(obj, meta = {}){
        if(!obj || typeof obj !== 'object'){
          console.error('scatter payload missing or invalid', { meta });
          return false;
        }
        if(obj.type && obj.type !== 'scatter'){
          console.error('Invalid scatter payload type', { type: obj.type, meta });
          return false;
        }
        if(meta?.flagOverlay){
          const overlayReason = meta?.overlayReason || (typeof meta?.source === 'string' ? `payload-${meta.source}` : 'payload');
          markScatterOverlayPending(overlayReason);
        }
        const dataMatrix = Array.isArray(obj.data) ? obj.data : [];
        if(scatterHot && typeof scatterHot.loadData === 'function'){
          scatterHot.loadData(dataMatrix);
          if(obj.exclusions){
            scatterHot.applyExclusions?.(obj.exclusions);
          }
        }
        const c=obj.config||{};
        importFontStyles('scatter', c.fontStyles || null);
        scatterTitleText=c.title||scatterTitleText;
        scatterXLabelText=c.xLabel||scatterXLabelText;
        scatterYLabelText=c.yLabel||scatterYLabelText;
        scatterZLabelText=c.zLabel||scatterZLabelText;
        scatterDotSize.value=c.dotSize||scatterDotSize.value;
        scatterFill.value=c.fill||scatterFill.value;
        if(scatterColorMode){
          scatterColorMode.value = normalizeScatterColorMode(c.colorMode || scatterColorMode.value);
          scatterColorModeDesired = scatterColorMode.value;
        }
        if(scatterDensityPalette){
          scatterDensityPalette.value = normalizeScatterDensityPalette(c.densityPalette || scatterDensityPalette.value);
        }
        scatterBorder.value=c.border||scatterBorder.value;
        scatterBorderWidth.value=c.borderWidth||scatterBorderWidth.value;
        scatterAlpha.value=c.alpha||0;
        scatterAlphaVal.textContent=scatterAlpha.value;
        scatterLabelColors=c.labelColors||{};
        scatterLabelStyles=c.labelStyles||{};
        scatterLabelShapes=c.labelShapes||{};
        scatterShowGrid.checked=!!c.showGrid;
        scatterShowFrame.checked=!!c.showFrame;
        if(scatterShowLegend){
          scatterShowLegend.checked = c.showLegend !== false;
        }
        scatterLogX.checked=!!c.logX;
        scatterLogY.checked=!!c.logY;
        scatterState.logPlusOneX=!!c.logPlusOneX;
        scatterState.logPlusOneY=!!c.logPlusOneY;
        scatterXMin.value=c.xMin||'';
        scatterXMax.value=c.xMax||'';
        scatterYMin.value=c.yMin||'';
        scatterYMax.value=c.yMax||'';
        scatterOriginMode.value=c.originMode||scatterOriginMode.value;
        scatterOriginX.value=c.originX||'';
        scatterOriginY.value=c.originY||'';
        // If the payload requests CI/PI, ensure the trend line is enabled first
        if((c.showCI || c.showPI) && scatterShowLine){
          scatterShowLine.checked = true;
        } else {
          scatterShowLine.checked = !!c.showLine;
        }
        if(scatterShowPlotStats){
          scatterShowPlotStats.checked = typeof c.showPlotStats === 'boolean' ? c.showPlotStats : !!scatterShowLine.checked;
        }
        if(typeof c.showCI === 'boolean' && scatterShowCI){ scatterShowCI.checked = !!c.showCI; }
        if(typeof c.showPI === 'boolean' && scatterShowPI){ scatterShowPI.checked = !!c.showPI; }
        // Ensure CI/PI controls reflect enabled/disabled state after payload applied
        try{ updateCIEnabled(); }catch(e){ /* ignore if unavailable */ }
        if(scatterShowDiagnostics){
          scatterShowDiagnostics.checked=!!c.showDiagnostics;
        }
        if(scatterGraphTypeSelect && c.graphType){
          scatterGraphTypeSelect.value=c.graphType;
        }
        if(scatterLog2FCThreshold && c.log2fcThreshold!==undefined){
          scatterLog2FCThreshold.value=c.log2fcThreshold;
        }
        if(scatterNegLogPThreshold && c.negLogPThreshold!==undefined){
          scatterNegLogPThreshold.value=c.negLogPThreshold;
        }
        if(scatterShowSignificantLabels && typeof c.showSignificantLabels === 'boolean'){
          scatterShowSignificantLabels.checked = c.showSignificantLabels;
        }
        if(scatterRegressionMode && c.regression?.mode){
          scatterRegressionMode.value=c.regression.mode;
        }
        scatterLastRegressionSummary = c.regression?.summary || null;
        if(c.rotation){
          scatterState.rotation = plot3d.createRotationState(c.rotation);
          if(typeof plot3d.normalizeRotation === 'function'){
            plot3d.normalizeRotation(scatterState.rotation);
          }
        } else {
          scatterState.rotation = plot3d.createRotationState({ x: SCATTER_3D_DEFAULTS.rotationX, y: SCATTER_3D_DEFAULTS.rotationY });
          if(typeof plot3d.normalizeRotation === 'function'){
            plot3d.normalizeRotation(scatterState.rotation);
          }
        }
        scatterState.supports3d = false;
        if(typeof c.viewMode === 'string'){
          const normalizedMode = String(c.viewMode).toLowerCase();
          let storedMode = '2d';
          if(normalizedMode === '3d'){
            storedMode = '3d';
          }else if(normalizedMode === 'bubble'){
            storedMode = 'bubble';
          }
          scatterState.supportsBubble = false;
          applyScatterViewMode(storedMode, {
            allow3d: true,
            allowBubble: true,
            skipSchedule: true,
            forceUpdate: true,
            persistRequest: true
          });
        }
        if(c.axis){
          applyScatterAxisSettings({
            strokeWidth: c.axis.strokeWidth,
            color: c.axis.color,
            tickIntervalX: c.axis.tickIntervalX ?? c.axis.xTickInterval ?? c.axis?.x?.tickInterval ?? null,
            tickIntervalY: c.axis.tickIntervalY ?? c.axis.yTickInterval ?? c.axis?.y?.tickInterval ?? null,
            minorTicksX: c.axis.minorTicksX ?? c.axis?.x?.minorTicks ?? false,
            minorTicksY: c.axis.minorTicksY ?? c.axis?.y?.minorTicks ?? false,
            minorTickSubdivisionsX: c.axis.minorTickSubdivisionsX ?? c.axis.minorSubdivisionsX ?? c.axis?.x?.minorTickSubdivisions ?? c.axis?.x?.minorSubdivisions ?? DEFAULT_MINOR_TICK_SUBDIVISIONS,
            minorTickSubdivisionsY: c.axis.minorTickSubdivisionsY ?? c.axis.minorSubdivisionsY ?? c.axis?.y?.minorTickSubdivisions ?? c.axis?.y?.minorSubdivisions ?? DEFAULT_MINOR_TICK_SUBDIVISIONS,
            notationX: c.axis.notationX ?? c.axis.axisNotationX ?? c.axis?.x?.notation ?? 'auto',
            notationY: c.axis.notationY ?? c.axis.axisNotationY ?? c.axis?.y?.notation ?? 'auto',
            brokenAxis: c.axis.brokenAxis || {}
          });
          console.debug('Debug: scatter axis settings restored',{ axis: ensureScatterAxisSettings() });
        }
        // Restore label positions if saved
        if(c.labelPositions){
          scatterLabelPositions = {
            title: c.labelPositions.title || null,
            xLabel: c.labelPositions.xLabel || null,
            yLabel: c.labelPositions.yLabel || null,
            stats: c.labelPositions.stats || null,
            legend: c.labelPositions.legend || null
          };
        }
        // Restore previously computed statistics results (if present in payload)
        try{
          if(c.stats && typeof c.stats === 'object'){
            const savedHtml = c.stats.resultsHtml;
            const savedVersion = Number.isFinite(Number(c.stats.lastRunVersion)) ? Number(c.stats.lastRunVersion) : 0;
            const savedSig = typeof c.stats.contextSignature === 'string' ? c.stats.contextSignature : null;
            const savedCtxVer = Number.isFinite(Number(c.stats.contextVersion)) ? Number(c.stats.contextVersion) : 0;
            const savedStatType = typeof c.stats.statType === 'string' ? c.stats.statType : null;
            const savedRegressionMode = typeof c.stats.regressionMode === 'string' ? c.stats.regressionMode : null;
            const savedShowCI = c.stats.showCI === true;
            const savedShowPI = c.stats.showPI === true;
            const savedShowDiagnostics = c.stats.showDiagnostics === true;
            if(scatterStatsResults && savedHtml != null){
              try{ scatterStatsResults.innerHTML = savedHtml; }catch(e){ scatterStatsResults.textContent = String(savedHtml || ''); }
            }
            // restore control values if present
            if(savedStatType && scatterStatType){ scatterStatType.value = savedStatType; }
            if(savedRegressionMode && scatterRegressionMode){ scatterRegressionMode.value = savedRegressionMode; }
            if(typeof c.stats.showCI === 'boolean' && scatterShowCI){ scatterShowCI.checked = savedShowCI; }
            if(typeof c.stats.showPI === 'boolean' && scatterShowPI){ scatterShowPI.checked = savedShowPI; }
            if((savedShowCI || savedShowPI) && scatterShowLine){ scatterShowLine.checked = true; }
            if(typeof c.stats.showDiagnostics === 'boolean' && scatterShowDiagnostics){ scatterShowDiagnostics.checked = savedShowDiagnostics; }

            scatterState.statsLastRunVersion = savedVersion;
            scatterState.statsContextSignature = savedSig;
            scatterState.statsContextVersion = savedCtxVer || scatterState.statsContextVersion;
            scatterState.statsContext = null;
            scatterState.statsComputationPending = false;
            const hasResults = !!(scatterStatsResults && scatterStatsResults.childNodes && scatterStatsResults.childNodes.length);
            if(scatterState.statsLastRunVersion === scatterState.statsContextVersion && hasResults){
              setScatterStatsStatus('Statistics up to date.');
              updateScatterStatsButtonState({ disabled:false, label:'Recalculate statistics' });
              syncScatterRegressionOptionVisibility();
            }
          }
        }catch(err){
          console.debug('Debug: scatter restore stats failed', { err: err?.message || String(err) });
        }
        syncScatterGraphTypeUI();
        scheduleDrawScatter();
        // No deferred reapply needed: stats context has been refreshed and versions set.
        scatterDebug('Debug: scatter payload applied', { source: meta.source || 'unknown', rows: dataMatrix.length });
        return true;
      }

      function loadScatterGraphFile(file){
        const reader=new FileReader();
        reader.onload=e=>{
          try{
            const obj=JSON.parse(e.target.result);
            if(!applyScatterPayload(obj, { source: 'file', flagOverlay: true, overlayReason: 'graph-file' })){
              console.warn('scatter payload rejected from file', { hasType: !!obj?.type });
            }
          }catch(err){console.error('loadScatterGraph error',err);}
        };
        reader.readAsText(file);
      }
    
      if(Shared.exporter && typeof Shared.exporter.mountSvgControls === 'function'){
        Shared.exporter.mountSvgControls({
          container: '#scatterExportControls',
          svgSelector: '#scatterSvg',
          fileName: 'scatter',
          contextLabel: 'scatter-export',
          hybridOptions: {
            label: 'SVG (points as PNG)',
            fileNameSuffix: '-light',
            layers: [
              {
                selector: '[data-export-layer="scatter-points"]',
                label: 'scatter-points',
                padding: 2,
                scale: 4
              }
            ]
          }
        });
        console.debug('Debug: scatter export controls mounted', { hasExporter: true }); // Debug: scatter export mount
      }else{
        console.debug('Debug: scatter export controls unavailable', { hasExporter: !!Shared.exporter }); // Debug: scatter export fallback
      }
      document.getElementById('openScatterGraph')?.addEventListener('click',openScatterFile);
      document.getElementById('saveScatterGraph')?.addEventListener('click',saveScatterFile);
      document.getElementById('saveAsScatter').addEventListener('click',saveAsScatterFile);
      document.getElementById('scatterGraphFile').addEventListener('change',e=>{
        const f=e.target.files[0];
        if(f){
          scatterFileName=f.name;
          scatterFileHandle=null;
          loadScatterGraphFile(f);
        }
      });
      
    scatter.save = saveScatterFile;
    scatter.saveAs = saveAsScatterFile;
    scatter.open = openScatterFile;
    scatter.loadFromFile = loadScatterGraphFile;
    scatter.loadFromPayload = function loadScatterFromPayload(payload, options = {}){
      if(!applyScatterPayload(payload, { source: 'payload', ...options })){
        console.warn('scatter payload application failed', { source: 'payload' });
      }
    };
    scatter.getPayload = getScatterGraphPayload;
    scatter.createEmptyPayload = function createEmptyScatterPayload(){
      scatter.ensure();
      ensureEmptyPayloadTemplate();
      const payload = cloneSimple(emptyPayloadTemplate) || { type: 'scatter', config: {} };
      payload.type = 'scatter';
      const createEmpty = Shared.createEmptyData;
      const emptyData = typeof createEmpty === 'function'
        ? createEmpty(DEFAULT_ROWS, DEFAULT_COLS)
        : Array.from({ length: DEFAULT_ROWS }, () => Array(DEFAULT_COLS).fill(''));
      payload.data = emptyData;
      payload.exclusions = [];
      payload.series = Array.isArray(payload.series) ? [] : [];
      payload.stats = null;
      return payload;
    };
    scatter.serialize = serializeSvg;
    ensureEmptyPayloadTemplate();
    scatter.ready = true;
    console.debug('Debug: Components.scatter.setup complete');
  }

  function ensureReady(){ if(!scatter.ready) setup(); }

  scatter.init = setup;
  scatter.ensure = ensureReady;
  scatter.computeAdaptivePointSize = computeAdaptivePointSize;
  scatter.prepareForTab = function prepareForTab(){
    if(!scatter.ready){
      scatter.init();
      return;
    }
    if(typeof scatter.__ensureHotForActiveTab === 'function'){
      scatter.__ensureHotForActiveTab();
    }
  };
  scatter.draw = function draw(){ ensureReady(); scheduleDrawScatter && scheduleDrawScatter(); };

  function benchmarkScatterLoad(config){
    const points = Math.max(1, Math.floor(Number(config?.points) || 1000));
    const dims = Math.max(2, Math.floor(Number(config?.dimensions) || 2));
    const generator = typeof config?.generator === 'function'
      ? config.generator
      : ((index, dimension) => ((index * 37 + dimension * 19) % 1000) / 10);
    const perf = global.performance;
    const coords = new Array(points);
    for(let idx = 0; idx < points; idx++){
      const entry = new Array(dims);
      for(let dim = 0; dim < dims; dim++){
        entry[dim] = Number(generator(idx, dim)) || 0;
      }
      coords[idx] = entry;
    }
    const start = perf?.now ? perf.now() : Date.now();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for(let idx = 0; idx < points; idx++){
      const entry = coords[idx];
      const x = entry[0];
      const y = entry[1] ?? 0;
      if(x < minX) minX = x;
      if(x > maxX) maxX = x;
      if(y < minY) minY = y;
      if(y > maxY) maxY = y;
    }
    const end = perf?.now ? perf.now() : Date.now();
    return {
      points,
      dimensions: dims,
      durationMs: Number((end - start).toFixed(3)),
      extent: {
        x: [minX, maxX],
        y: [minY, maxY]
      }
    };
  }

  scatter.__testHooks = Object.assign({}, scatter.__testHooks, {
    benchmarkLoad: opts => benchmarkScatterLoad(opts),
    buildAnnotationRequests: (points, options) => buildScatterAnnotationRequests(points, options),
    layoutAnnotations: params => layoutScatterAnnotations(params),
    resolveAnnotationCrowdingScale: (count, options) => resolveScatterAnnotationCrowdingScale(count, options),
    setRowSelected: (hotInstance, rowIndex, selected, options) => setScatterRowSelected(hotInstance, rowIndex, selected, options),
    toggleRowSelected: (hotInstance, rowIndex, options) => toggleScatterRowSelected(hotInstance, rowIndex, options),
    constants: Object.assign({}, scatter.__testHooks?.constants, {
      MAX_SIGNIFICANT_ANNOTATIONS
    })
  });

})(window);
